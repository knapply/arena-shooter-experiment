/* ===== Standalone multiplayer: peer-to-peer rooms over WebRTC (PeerJS) =====
   Implements the presence-room interface the netcode is written against (see docs/ARCHITECTURE.md),
   plus a fast channel for real-time state.

   Topology
   - The room host (the "hub") relays presence: names, scores and anything that must arrive (hits,
     kills, flags). One reliable, ordered connection per player, host to player.
   - Every pair of players also opens a direct, unordered, no-retransmit "fast" connection for
     movement and snapshots (a full mesh, 8 players at most). If a direct link can't be made
     (strict networks), fast packets are relayed through the hub instead.
   - The hub picks a backup host (the player with the best connection) and tells everyone. If the
     hub leaves, everyone reconnects to the backup and the room carries on; the backup also takes
     over the room code so friends can still join with it.
   - The hub measures everyone's ping to everyone and suggests a better host when one exists; the
     host can hand the room over in one click (same path as a host leaving).
   - A relay (TURN) server can be configured for networks that block direct connections:
     ?turn=turns:user:password@host:port in the page address (see README). */
(function () {
  const PREFIX = "kinetic-arena-",
    ALPH = "abcdefghjkmnpqrstuvwxyz23456789",
    MAX_PEERS = 8;
  const SRC = [
    "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
    "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
  ];
  const ROOM_RE = /^[a-z]{1,16}(\/[a-z]{1,16}){0,2}$/,
    ID_RE = /^[a-z0-9:_-]{1,48}$/i;
  let resolveRoom;
  const roomP = new Promise(r => (resolveRoom = r));
  const T = {
    peer: null,
    codePeer: null,
    myId: "local",
    hub: false,
    hubId: null,
    hubConn: null,
    hubRtt: null,
    conns: new Map(),
    fast: new Map(),
    members: [],
    backup: null,
    meshRtt: new Map(),
    suggest: null,
    store: new Map(),
    mine: new Map(),
    rooms: new Map(),
    connected: false,
    migrating: false,
    versionMismatch: false,
    code: null,
    busy: false,
  };
  /** @type {(id: string) => El} */
  const $ = id => /** @type {El} */ (document.getElementById(id));

  /* ---- relay (TURN) configuration: ?turn=turn[s]:user:pass@host:port[,more] ---- */
  function iceConfig() {
    const m = /[?&#]turn=([^&#]+)/.exec(location.search + location.hash);
    if (!m) return undefined;
    const servers = [{ urls: "stun:stun.l.google.com:19302" }];
    for (const raw of decodeURIComponent(m[1]).split(",").slice(0, 4)) {
      const t = /^(turns?):([^:@]+):([^@]+)@([\w.-]+(?::\d+)?)$/.exec(raw.trim());
      if (t) servers.push({ urls: `${t[1]}:${t[4]}`, username: t[2], credential: t[3] });
    }
    return servers.length > 1 ? { iceServers: servers } : undefined;
  }
  const peerOpts = () => {
    const config = iceConfig();
    return config ? { debug: 0, config } : { debug: 0 };
  };

  /* ---- network simulation: added latency, jitter and loss on everything this tab sends.
     Reliable traffic models retransmission (a lost packet arrives a round trip late and holds up
     everything behind it); fast traffic is simply dropped. Set from tests, the dev console,
     or ?netsim=latencyMs,jitterMs,lossPercent in the page URL. */
  const NETSIM = { latency: 0, jitter: 0, loss: 0 };
  {
    const m = /[?&#]netsim=(\d+),(\d+),(\d+(?:\.\d+)?)/.exec(location.search + location.hash);
    if (m) Object.assign(NETSIM, { latency: +m[1], jitter: +m[2], loss: Math.min(0.5, +m[3] / 100) });
  }
  /** the game's network protocol version (set by the game when it loads) */
  const myProtocol = () => (window.KAHOST && +window.KAHOST.protocol) || 0;
  const simActive = () => NETSIM.latency > 0 || NETSIM.jitter > 0 || NETSIM.loss > 0;

  /* ---- binary helpers for the fast channel. Transport packets use ids 0xF0-0xFF; game messages
     (net/messages.js) use lower ids. ---- */
  const FP_PING = 0xfe,
    FP_PONG = 0xfd;
  function pingPacket(kind, n, ts) {
    const b = new ArrayBuffer(11),
      v = new DataView(b);
    v.setUint8(0, kind);
    v.setUint16(1, n);
    v.setFloat64(3, ts);
    return b;
  }
  /** normalize whatever a data channel hands us into an ArrayBuffer (or null) */
  function asBuffer(d) {
    if (d instanceof ArrayBuffer) return d;
    if (ArrayBuffer.isView(d)) return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
    if (Array.isArray(d) && d.length <= 4096) return Uint8Array.from(d, x => x & 255).buffer;
    return null;
  }

  /* ---- link: one data connection plus its measurements (round trip, jitter, loss, bandwidth) ---- */
  const PING_MS = 1000;
  class Link {
    /** fast links carry ArrayBuffers unordered without retransmission; others carry JSON reliably */
    constructor(conn, onData, fast) {
      this.conn = conn;
      this.peer = conn.peer;
      this.fast = !!fast;
      this.onData = onData;
      this.rtt = 0;
      this.jitter = 0;
      this.lastRtt = 0;
      this.pings = [];
      this.pingN = 0;
      this.rx = { b: 0, n: 0, rate: 0, msgs: 0, last: performance.now() };
      this.tx = { b: 0, n: 0, rate: 0, msgs: 0 };
      this.win = performance.now();
      this.nextSend = 0;
      this.timer = setInterval(() => this.ping(), PING_MS);
      conn.on("data", m => {
        if (typeof Blob !== "undefined" && m instanceof Blob) m.arrayBuffer().then(b => this.recv(b));
        else this.recv(m);
      });
    }
    get open() {
      return this.conn.open;
    }
    close() {
      clearInterval(this.timer);
      try {
        this.conn.close();
      } catch (e) {}
    }
    raw(m) {
      if (!this.conn.open) return;
      const n = this.fast ? m.byteLength : JSON.stringify(m).length;
      this.tx.b += n;
      this.tx.n++;
      try {
        this.conn.send(m);
      } catch (e) {}
    }
    /** send through the network simulator when it is active (reliable unless opts.unreliable or a fast link) */
    send(m, opts) {
      if (!simActive()) return this.raw(m);
      const unrel = this.fast || (opts && opts.unreliable);
      const now = performance.now();
      let d = NETSIM.latency + Math.random() * NETSIM.jitter;
      if (Math.random() < NETSIM.loss) {
        if (unrel) return;
        d += Math.max(200, NETSIM.latency * 3);
      }
      const at = unrel ? now + d : Math.max(this.nextSend, now + d);
      if (!unrel) this.nextSend = at;
      setTimeout(() => this.raw(m), at - now);
    }
    ping() {
      this.roll();
      const p = { n: ++this.pingN & 0xffff, ts: performance.now(), got: false };
      this.pings.push(p);
      if (this.pings.length > 20) this.pings.shift();
      /* pings ride unreliably so they measure the wire, not queueing behind retransmits */
      if (this.fast) this.send(pingPacket(FP_PING, p.n, p.ts));
      else this.send({ t: "_pi", n: p.n, ts: p.ts }, { unreliable: true });
    }
    gotPong(n) {
      const now = performance.now();
      const p = this.pings.find(x => x.n === n);
      if (!p || p.got) return;
      p.got = true;
      const r = now - p.ts;
      this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.25 : r;
      if (this.lastRtt) this.jitter += (Math.abs(r - this.lastRtt) - this.jitter) * 0.25;
      this.lastRtt = r;
    }
    recv(m) {
      const now = performance.now();
      this.rx.n++;
      this.rx.last = now;
      if (this.fast) {
        const b = asBuffer(m);
        if (!b || !b.byteLength || b.byteLength > 16384) return;
        this.rx.b += b.byteLength;
        const k = new DataView(b).getUint8(0);
        if (k === FP_PING && b.byteLength === 11) {
          const v = new DataView(b);
          return this.send(pingPacket(FP_PONG, v.getUint16(1), v.getFloat64(3)));
        }
        if (k === FP_PONG && b.byteLength === 11) return this.gotPong(new DataView(b).getUint16(1));
        return this.onData(b, this);
      }
      this.rx.b += JSON.stringify(m || null).length;
      if (m && m.t === "_pi") return this.send({ t: "_po", n: m.n, ts: m.ts }, { unreliable: true });
      if (m && m.t === "_po") return this.gotPong(m.n);
      this.onData(m, this);
    }
    /** once a second: turn byte counters into rates */
    roll() {
      const now = performance.now(),
        dt = Math.max(0.25, (now - this.win) / 1000);
      for (const x of [this.rx, this.tx]) {
        x.rate = x.b / dt;
        x.msgs = x.n / dt;
        x.b = x.n = 0;
      }
      this.win = now;
    }
    /** fraction of the last pings (older than 2.5 s) that never came back */
    get loss() {
      const now = performance.now();
      const old = this.pings.filter(p => now - p.ts > 2500);
      if (!old.length) return 0;
      return Math.round((old.filter(p => !p.got).length / old.length) * 100) / 100;
    }
    stats() {
      return {
        peer: this.peer,
        fast: this.fast,
        rtt: Math.round(this.rtt),
        jitter: Math.round(this.jitter),
        loss: this.loss,
        inBps: Math.round(this.rx.rate),
        outBps: Math.round(this.tx.rate),
        inMsgs: Math.round(this.rx.msgs),
        outMsgs: Math.round(this.tx.msgs),
        age: Math.round(performance.now() - this.rx.last),
      };
    }
  }

  /* ---- presence rooms ---- */
  const st = r => {
    let m = T.store.get(r);
    if (!m) {
      m = new Map();
      T.store.set(r, m);
    }
    return m;
  };
  function entry(peer, p, isMe) {
    return {
      peer,
      presence: p,
      sameTab: isMe,
      isMe,
      kind: "viewer",
      by: null,
      guest: false,
      updatedAt: Date.now(),
    };
  }
  /** fast-channel subscribers: fn(fromPeerId, ArrayBuffer) */
  const fastSubs = new Set();
  function mkRoom(name) {
    if (T.rooms.has(name)) return T.rooms.get(name);
    const subs = [],
      closes = [];
    const snap = () => {
      const out = [];
      for (const [peer, p] of st(name)) if (peer !== T.myId) out.push(entry(peer, p, false));
      out.push(entry(T.myId, T.mine.get(name) || {}, true));
      return out;
    };
    const R = {
      fire(j, l, u) {
        const c = { peers: snap(), joined: j, left: l, updated: u };
        for (const f of subs.slice())
          try {
            f(c);
          } catch (e) {
            console.error(e);
          }
      },
      closed() {
        for (const f of closes.slice())
          try {
            f();
          } catch (e) {}
      },
      presence(patch) {
        const m = Object.assign({}, T.mine.get(name) || {});
        for (const k in patch) {
          if (patch[k] === null) delete m[k];
          else m[k] = patch[k];
        }
        if (JSON.stringify(m).length > 4096) return Promise.reject({ code: "invalid_argument" });
        T.mine.set(name, m);
        send({ t: "p", r: name, id: T.myId, p: m });
        return Promise.resolve();
      },
      peers: snap,
      onPeers(f, onClose) {
        subs.push(f);
        if (onClose) closes.push(onClose);
        setTimeout(() => f({ peers: snap(), joined: snap(), left: [], updated: [] }), 0);
        return () => {
          const i = subs.indexOf(f);
          if (i >= 0) subs.splice(i, 1);
        };
      },
      connected: () => T.connected,
      onConnection(f) {
        setTimeout(() => f(T.connected), 0);
        return () => {};
      },
      /** fast channel: an ArrayBuffer to everyone (or one peer), unordered, may be dropped */
      fast: (buf, to) => fastSend(buf, to),
      onFast(f) {
        fastSubs.add(f);
        return () => fastSubs.delete(f);
      },
      emit() {
        return Promise.resolve();
      },
      on() {
        return () => {};
      },
      join(n) {
        return Promise.resolve(
          mkRoom(
            name +
              "/" +
              String(n)
                .toLowerCase()
                .replace(/[^a-z]/g, "")
                .slice(0, 16)
          )
        );
      },
      leave() {
        return Promise.resolve();
      },
    };
    T.rooms.set(name, R);
    return R;
  }

  /* ---- message handling (everything from the network is untrusted) ---- */
  function okMsg(m) {
    return (
      m &&
      typeof m === "object" &&
      (m.t === "p"
        ? typeof m.r === "string" &&
          ROOM_RE.test(m.r) &&
          m.p &&
          typeof m.p === "object" &&
          !Array.isArray(m.p) &&
          JSON.stringify(m.p).length <= 4200
        : m.t === "x")
    );
  }
  function apply(m) {
    if (!ID_RE.test(String(m.id)) || m.id === T.myId) return;
    if (m.t === "p") {
      const s = st(m.r),
        had = s.has(m.id);
      s.set(m.id, m.p);
      const R = T.rooms.get(m.r);
      if (R) {
        const e = entry(m.id, m.p, false);
        R.fire(had ? [] : [e], [], had ? [e] : []);
      }
    } else if (m.t === "x") forget(m.id);
  }
  /** drop everything we know about a peer (they left) */
  function forget(id) {
    for (const [r, s] of T.store)
      if (s.has(id)) {
        const e = entry(id, s.get(id), false);
        s.delete(id);
        const R = T.rooms.get(r);
        if (R) R.fire([], [e], []);
      }
    const f = T.fast.get(id);
    if (f) {
      f.close();
      T.fast.delete(id);
    }
    T.meshRtt.delete(id);
  }
  function send(m) {
    if (!T.connected) return;
    if (T.hub) {
      for (const c of T.conns.values()) if (c.open) c.send(m);
    } else if (T.hubConn && T.hubConn.open) T.hubConn.send(m);
  }
  function allPresence() {
    const list = [];
    for (const [r, s] of T.store) for (const [id, p] of s) list.push({ t: "p", r, id, p });
    for (const [r, p] of T.mine) list.push({ t: "p", r, id: T.myId, p });
    return list;
  }

  /* ---- fast channel ---- */
  function fastDeliver(from, buf) {
    if (!ID_RE.test(String(from)) || from === T.myId) return;
    for (const f of fastSubs)
      try {
        f(from, buf);
      } catch (e) {
        console.error(e);
      }
  }
  function fastSend(buf, to) {
    if (!T.connected || !(buf instanceof ArrayBuffer) || buf.byteLength > 16000) return;
    const targets = to ? [to] : T.members.filter(id => id !== T.myId);
    let relay = null;
    for (const id of targets) {
      const l = T.fast.get(id);
      if (l && l.open) l.send(buf);
      else (relay = relay || []).push(id);
    }
    if (!relay) return;
    /* no direct link (yet, or blocked): go through the hub */
    const d = Array.from(new Uint8Array(buf));
    if (T.hub) {
      for (const id of relay) {
        const c = T.conns.get(id);
        if (c && c.open) c.send({ t: "f", from: T.myId, d }, { unreliable: true });
      }
    } else if (T.hubConn && T.hubConn.open)
      for (const id of relay) T.hubConn.send({ t: "f", to: id, d }, { unreliable: true });
  }
  /** open a direct fast link; the peer with the smaller id dials */
  function openFast(id) {
    if (!T.peer || T.fast.has(id) || id === T.myId) return;
    let c;
    try {
      c = T.peer.connect(id, { label: "fast", reliable: false, serialization: "none" });
    } catch (e) {
      return;
    }
    if (c) adoptFast(c);
  }
  function adoptFast(c) {
    if (!ID_RE.test(String(c.peer)) || T.fast.size >= MAX_PEERS) {
      setTimeout(() => c.close(), 50);
      return;
    }
    const old = T.fast.get(c.peer);
    if (old && old.conn !== c) old.close();
    const link = new Link(c, b => fastDeliver(c.peer, b), true);
    T.fast.set(c.peer, link);
    const gone = () => {
      if (T.fast.get(c.peer) === link) T.fast.delete(c.peer);
      link.close();
    };
    c.on("close", gone);
    c.on("error", gone);
  }
  /** open the direct links the member list calls for (links close themselves when a peer leaves) */
  function syncMesh() {
    for (const id of T.members) if (id !== T.myId && !T.fast.has(id) && T.myId < id) openFast(id);
  }

  /* ---- hub: one reliable connection per friend, with a flood guard ---- */
  function hubAccept(c) {
    if (c.label === "fast") return adoptFast(c);
    if (T.conns.size >= MAX_PEERS - 1) {
      c.on("open", () => {
        try {
          c.send({ t: "full" });
        } catch (e) {}
        setTimeout(() => c.close(), 300);
      });
      return;
    }
    /* protocol handshake: a friend on a different build is told why instead of getting garbage */
    const theirs = c.metadata && +c.metadata.pv;
    if (myProtocol() && theirs && theirs !== myProtocol()) {
      c.on("open", () => {
        try {
          c.send({ t: "ver", pv: myProtocol() });
        } catch (e) {}
        setTimeout(() => c.close(), 300);
      });
      return;
    }
    const bucket = { tok: 160, t: performance.now() };
    const link = new Link(c, m => {
      const now = performance.now();
      bucket.tok = Math.min(160, bucket.tok + (now - bucket.t) * 0.08);
      bucket.t = now;
      if (--bucket.tok < 0) return;
      if (m && m.t === "f" && Array.isArray(m.d) && m.d.length <= 4096) {
        /* fast packet relayed for someone without a direct link */
        const b = asBuffer(m.d);
        if (!b) return;
        if (m.to === T.myId) fastDeliver(c.peer, b);
        else {
          const o = T.conns.get(String(m.to));
          if (o && o.open) o.send({ t: "f", from: c.peer, d: m.d }, { unreliable: true });
        }
        return;
      }
      if (m && m.t === "rt" && m.tab && typeof m.tab === "object") {
        const tab = {};
        for (const [k, v] of Object.entries(m.tab).slice(0, 16))
          if (ID_RE.test(k) && Number.isFinite(+v)) tab[k] = +v;
        T.meshRtt.set(c.peer, tab);
        return;
      }
      if (!okMsg(m) || m.t !== "p") return;
      const out = { t: "p", r: m.r, id: c.peer, p: m.p };
      apply(out);
      for (const [id, o] of T.conns) if (id !== c.peer && o.open) o.send(out);
    });
    c.on("open", () => {
      const old = T.conns.get(c.peer);
      if (old && old !== link) old.close();
      T.conns.set(c.peer, link);
      link.send({ t: "all", list: allPresence() });
      members();
      status();
    });
    const gone = () => {
      if (T.conns.get(c.peer) !== link) return;
      T.conns.delete(c.peer);
      link.close();
      const m = { t: "x", id: c.peer };
      apply(m);
      send(m);
      members();
      status();
    };
    c.on("close", gone);
    c.on("error", gone);
  }
  /** hub: tell everyone who is here and who takes over if the host leaves */
  function members() {
    if (!T.hub) return;
    T.members = [T.myId, ...[...T.conns].filter(([, l]) => l.open).map(([id]) => id)];
    T.backup = pickBackup();
    send({ t: "mem", ids: T.members, bk: T.backup });
    syncMesh();
    suggestHost();
  }
  /* the backup is the friend the host reaches fastest (stable unless they leave or get much worse) */
  function pickBackup() {
    const live = [...T.conns.values()].filter(l => l.open);
    if (!live.length) return null;
    const cur = live.find(l => l.peer === T.backup);
    const best = live.reduce((a, b) => ((b.rtt || 999) < (a.rtt || 999) ? b : a));
    if (cur && (cur.rtt || 999) < (best.rtt || 999) + 40) return cur.peer;
    return best.peer;
  }
  /** hub: who would make the best host? (lowest worst-case ping to everyone else) */
  function suggestHost() {
    T.suggest = null;
    if (!T.hub || T.conns.size < 2) return;
    const ids = T.members;
    const rtt = (a, b) => {
      if (a === T.myId) return T.conns.get(b) ? T.conns.get(b).rtt : null;
      if (b === T.myId) return rtt(b, a);
      const tab = T.meshRtt.get(a);
      return tab && tab[b] != null ? tab[b] : null;
    };
    const score = id => {
      let worst = 0;
      for (const o of ids) {
        if (o === id) continue;
        const r = rtt(id, o);
        if (r == null || !r) return Infinity;
        worst = Math.max(worst, r);
      }
      return worst;
    };
    const mine = score(T.myId);
    let best = null,
      bs = Infinity;
    for (const id of ids)
      if (id !== T.myId) {
        const s = score(id);
        if (s < bs) {
          bs = s;
          best = id;
        }
      }
    if (best && Number.isFinite(mine) && bs + 30 < mine)
      T.suggest = { peer: best, ms: Math.round(bs), mine: Math.round(mine) };
  }

  /* ---- client: everything reliable arrives via the host ---- */
  function clientData(m) {
    if (!m || typeof m !== "object") return;
    if (m.t === "_rt" && m.tab && typeof m.tab === "object") {
      T.hubRtt = {};
      for (const [k, v] of Object.entries(m.tab).slice(0, 16))
        if (ID_RE.test(k) && Number.isFinite(+v)) T.hubRtt[k] = +v;
      return;
    }
    if (m.t === "mem" && Array.isArray(m.ids)) {
      T.members = m.ids.filter(x => typeof x === "string" && ID_RE.test(x)).slice(0, MAX_PEERS);
      T.backup = typeof m.bk === "string" && ID_RE.test(m.bk) ? m.bk : null;
      syncMesh();
      return;
    }
    if (m.t === "f" && Array.isArray(m.d) && m.d.length <= 4096) {
      const b = asBuffer(m.d);
      if (b) fastDeliver(String(m.from), b);
      return;
    }
    if (m.t === "handover" && typeof m.to === "string" && ID_RE.test(m.to)) {
      T.backup = m.to;
      migrate("handover");
      return;
    }
    if (m.t === "full") {
      msg("That room is full (8 players).", true);
      return;
    }
    if (m.t === "ver") {
      T.versionMismatch = true;
      msg(
        `You and the host are on different versions of the game (yours ${myProtocol()}, theirs ${+m.pv | 0}). Both reload the page to get the latest, then try again.`,
        true
      );
      return;
    }
    if (m.t === "all" && Array.isArray(m.list)) {
      for (const x of m.list.slice(0, 64)) if (okMsg(x)) apply(x);
      return;
    }
    if (okMsg(m)) apply(m);
  }
  /** connect (reliably) to a hub by peer id; resolves with the link once open */
  function dialHub(id, timeout) {
    return new Promise((ok, no) => {
      let c;
      try {
        c = T.peer.connect(id, { reliable: true, serialization: "json", metadata: { pv: myProtocol() } });
      } catch (e) {
        return no(e);
      }
      const link = new Link(c, clientData);
      const to = setTimeout(() => {
        link.close();
        no(new Error("timeout"));
      }, timeout);
      c.on("open", () => {
        clearTimeout(to);
        ok(link);
      });
      c.on("close", () => {
        link.close();
        if (T.hubConn === link) hubLost();
      });
      c.on("error", () => {
        if (T.hubConn === link) hubLost();
      });
    });
  }
  /* ---- host migration ---- */
  function hubLost() {
    if (!T.connected || T.migrating) return;
    if (T.versionMismatch) return lostHost();
    migrate("left");
  }
  async function migrate(why) {
    const old = T.hubId,
      next = T.backup;
    if (!next || next === old) return lostHost();
    T.migrating = true;
    if (T.hubConn) {
      const h = T.hubConn;
      T.hubConn = null;
      h.close();
    }
    if (why !== "handover") forget(old);
    if (next === T.myId) {
      /* we are the backup: become the hub */
      T.hub = true;
      T.hubId = T.myId;
      T.conns = new Map();
      T.members = T.members.filter(id => id !== old);
      T.migrating = false;
      claimCode(0);
      msg(
        why === "handover"
          ? "You are now hosting this room."
          : "The host left. You are now hosting this room."
      );
      setUI("hosting");
      status();
      return;
    }
    msg(why === "handover" ? "Moving to the new host…" : "The host left. Moving to the new host…");
    for (let i = 0; i < 6 && T.connected; i++) {
      try {
        const link = await dialHub(next, 2500);
        T.hubConn = link;
        T.hubId = next;
        T.migrating = false;
        /* the new hub learns our presence again; it answers with everyone else's */
        for (const [r, p] of T.mine) link.send({ t: "p", r, id: T.myId, p });
        setUI("joined");
        status();
        return;
      } catch (e) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
    T.migrating = false;
    lostHost();
  }
  /* the new hub also takes the room code, so friends can still join with it (the old host's
     claim on it lapses a few seconds after they leave) */
  function claimCode(tries) {
    if (!T.hub || !T.code || T.codePeer || tries > 15) return;
    const P = PeerCtor();
    if (!P) return;
    const cp = new P(PREFIX + T.code, peerOpts());
    cp.on("open", () => {
      T.codePeer = cp;
      cp.on("connection", hubAccept);
    });
    cp.on("error", () => {
      try {
        cp.destroy();
      } catch (e) {}
      setTimeout(() => claimCode(tries + 1), 2000);
    });
  }
  function lostHost() {
    if (!T.connected) return;
    T.connected = false;
    for (const l of T.fast.values()) l.close();
    T.fast.clear();
    for (const [r, s] of T.store) {
      const R = T.rooms.get(r);
      const left = [...s].map(([id, p]) => entry(id, p, false));
      s.clear();
      if (R && left.length) R.fire([], left, []);
    }
    for (const R of T.rooms.values()) R.closed();
    if (!T.versionMismatch)
      msg("The room closed (the host left). Reload the page to host or join again.", true);
    setUI("closed");
  }
  /** hub: give the room to someone else (the suggested best host by default) */
  function handover(to) {
    if (!T.hub || !T.conns.has(to)) return false;
    send({ t: "handover", to });
    /* become a client of the new hub */
    T.hub = false;
    T.backup = to;
    T.hubId = T.myId;
    const conns = [...T.conns.values()];
    T.conns = new Map();
    setTimeout(() => conns.forEach(l => l.close()), 400);
    if (T.codePeer) {
      try {
        T.codePeer.destroy();
      } catch (e) {}
      T.codePeer = null;
    }
    migrate("handover");
    return true;
  }

  /* ---- PeerJS loading ---- */
  function PeerCtor() {
    const P = window.Peer;
    if (typeof P === "function") return P;
    const g = window.peerjs;
    return g && (typeof g.Peer === "function" ? g.Peer : typeof g.default === "function" ? g.default : null);
  }
  function loadPeer() {
    if (PeerCtor()) return Promise.resolve(PeerCtor());
    return SRC.reduce(
      (p, src) =>
        p.catch(
          () =>
            new Promise((ok, no) => {
              const s = document.createElement("script");
              s.src = src;
              s.crossOrigin = "anonymous";
              s.onload = () => (PeerCtor() ? ok(PeerCtor()) : no());
              s.onerror = no;
              document.head.appendChild(s);
            })
        ),
      Promise.reject()
    ).catch(() => {
      throw new Error("load");
    });
  }
  const code5 = () => {
    const a = new Uint32Array(5);
    crypto.getRandomValues(a);
    return [...a].map(x => ALPH[x % ALPH.length]).join("");
  };
  function keepAlive(peer) {
    peer.on("disconnected", () => {
      if (!peer.destroyed)
        setTimeout(() => {
          try {
            peer.reconnect();
          } catch (e) {}
        }, 1500);
    });
  }
  /** every peer accepts direct fast links; reliable joins only while we are the hub */
  function onConnection(c) {
    if (c.label === "fast") return adoptFast(c);
    if (T.hub) return hubAccept(c);
    setTimeout(() => {
      try {
        c.close();
      } catch (e) {}
    }, 50);
  }
  async function host(tries) {
    if (T.busy || T.connected) return;
    T.busy = true;
    setUI("busy");
    msg("Opening a room…");
    let P;
    try {
      P = await loadPeer();
    } catch (e) {
      T.busy = false;
      setUI("idle");
      msg("Couldn't load the networking library. Check your internet connection and try again.", true);
      return;
    }
    const code = code5();
    const peer = new P(PREFIX + code, peerOpts());
    T.peer = peer;
    peer.on("open", id => {
      T.myId = id;
      T.hub = true;
      T.hubId = id;
      T.connected = true;
      T.code = code;
      T.busy = false;
      T.members = [id];
      keepAlive(peer);
      resolveRoom(lobby);
      setUI("hosting");
      status();
    });
    peer.on("connection", onConnection);
    peer.on("error", e => {
      if (T.connected) return;
      try {
        peer.destroy();
      } catch (x) {}
      T.busy = false;
      if (e && e.type === "unavailable-id" && (tries | 0) < 4) {
        host((tries | 0) + 1);
        return;
      }
      setUI("idle");
      msg("Couldn't open a room (" + ((e && e.type) || "network") + "). Try again in a moment.", true);
    });
  }
  async function join(raw) {
    if (T.busy || T.connected) return;
    const code = String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (code.length !== 5) {
      msg("Room codes are 5 letters and numbers.", true);
      return;
    }
    T.busy = true;
    setUI("busy");
    msg("Joining room " + code.toUpperCase() + "…");
    let P;
    try {
      P = await loadPeer();
    } catch (e) {
      T.busy = false;
      setUI("idle");
      msg("Couldn't load the networking library. Check your internet connection and try again.", true);
      return;
    }
    const peer = new P(undefined, peerOpts());
    T.peer = peer;
    let done = false;
    const fail = t => {
      if (done) return;
      done = true;
      try {
        peer.destroy();
      } catch (x) {}
      T.busy = false;
      setUI("idle");
      msg(t, true);
    };
    const to = setTimeout(
      () =>
        fail(
          "Couldn't reach that room. Check the code, or the host's network may block direct connections (see the README for relay setup)."
        ),
      15000
    );
    peer.on("connection", onConnection);
    peer.on("open", async id => {
      T.myId = id;
      try {
        const link = await dialHub(PREFIX + code, 14000);
        if (done) return link.close();
        done = true;
        clearTimeout(to);
        T.hubConn = link;
        T.hubId = PREFIX + code;
        T.connected = true;
        T.code = code;
        T.busy = false;
        keepAlive(peer);
        resolveRoom(lobby);
        setUI("joined");
        status();
      } catch (e) {
        /* the timeout or the error handler reports it */
      }
    });
    peer.on("error", e => {
      if (T.connected) return;
      clearTimeout(to);
      fail(
        e && e.type === "peer-unavailable"
          ? "No room with that code. Check it with your host."
          : "Couldn't join (" + ((e && e.type) || "network") + ")."
      );
    });
  }
  /* ---- UI ---- */
  function msg(t, bad) {
    const el = $("p2pMsg");
    if (!el) return;
    el.textContent = t;
    el.classList.toggle("bad", !!bad);
  }
  function invite() {
    const c = T.code.toUpperCase();
    return /^https?:/.test(location.protocol) ? location.origin + location.pathname + "#join=" + T.code : c;
  }
  function status() {
    if (!T.connected) return;
    const n = (T.hub ? T.conns.size : Math.max(0, st("lobby").size - 1)) + 1;
    const c = T.code.toUpperCase();
    $("p2pCodeShow").textContent = c;
    msg(
      T.hub
        ? `Room ${c} is open · ${n} player${n > 1 ? "s" : ""} here. Send friends the code${/^https?:/.test(location.protocol) ? " or invite link" : ""}. If you leave, the player with the best connection takes over.`
        : `Connected to room ${c}. Deploy for arena, or join the host's CTF match below.`
    );
    updBest();
  }
  function updBest() {
    const b = $("p2pBest");
    if (!b) return;
    const s = T.hub && T.suggest;
    b.hidden = !s;
    if (s) b.textContent = `Hand host to ${nameOf(s.peer)} (${s.ms} ms vs your ${s.mine} ms)`;
  }
  function setUI(s) {
    const on = s === "hosting" || s === "joined";
    $("p2pIdle").hidden = on || s === "closed";
    $("p2pLive").hidden = !on;
    $("p2pHost").disabled = $("p2pJoin").disabled = s === "busy";
    $("p2pCopy").hidden = s !== "hosting";
    updBest();
  }
  function wire() {
    $("p2pHost").onclick = () => host(0);
    $("p2pJoin").onclick = () => join($("p2pCode").value);
    $("p2pCode").addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Enter") join($("p2pCode").value);
    });
    $("p2pCopy").onclick = () => {
      const t = invite();
      const ok = () => {
        $("p2pCopy").textContent = "Copied";
        setTimeout(() => ($("p2pCopy").textContent = "Copy invite"), 1500);
      };
      try {
        navigator.clipboard.writeText(t).then(ok, () => prompt("Copy this:", t));
      } catch (e) {
        prompt("Copy this:", t);
      }
    };
    const best = $("p2pBest");
    if (best) best.onclick = () => T.suggest && handover(T.suggest.peer);
    const m = /[#&?]join=([a-z0-9]{5})/i.exec(location.hash + location.search);
    if (m) {
      $("p2pCode").value = m[1].toUpperCase();
      join(m[1]);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
  addEventListener("pagehide", () => {
    try {
      send({ t: "x", id: T.myId });
      if (T.peer) T.peer.destroy();
      if (T.codePeer) T.codePeer.destroy();
    } catch (e) {}
  });
  /* every 2 s: the hub shares round trips and the member list; clients report their direct-link pings */
  setInterval(() => {
    if (!T.connected) return;
    if (T.hub) {
      const tab = {};
      for (const [id, l] of T.conns) tab[id] = Math.round(l.rtt);
      send({ t: "_rt", tab });
      members();
      updBest();
    } else if (T.hubConn && T.hubConn.open) {
      const tab = {};
      for (const [id, l] of T.fast) if (l.rtt) tab[id] = Math.round(l.rtt);
      T.hubConn.send({ t: "rt", tab });
    }
  }, 2000);
  /* names come from presence (lobby or a sub-room) */
  function nameOf(peer) {
    for (const s of T.store.values()) {
      const p = s.get(peer);
      if (p && typeof p.n === "string") return p.n.slice(0, 14);
    }
    return "?";
  }
  /**
   * network statistics for the overlay, the network panel and roster indicators
   * @returns {NetStats}
   */
  function netStats() {
    const rel = T.hub ? [...T.conns.values()] : T.hubConn ? [T.hubConn] : [];
    const links = [...rel, ...T.fast.values()];
    /** @type {NetStats["peers"]} */
    const peers = {};
    if (T.hub) for (const l of rel) peers[l.peer] = { rtt: Math.round(l.rtt), direct: true };
    else if (T.hubConn) {
      const hubRtt = Math.round(T.hubConn.rtt);
      peers[T.hubConn.peer] = { rtt: hubRtt, direct: true };
      for (const [id, r] of Object.entries(T.hubRtt || {}))
        if (id !== T.myId) peers[id] = { rtt: hubRtt + r, direct: false };
    }
    /* a direct link beats a route through the host */
    for (const [id, l] of T.fast) if (l.rtt) peers[id] = { rtt: Math.round(l.rtt), direct: true };
    return {
      role: /** @type {NetStats["role"]} */ (!T.connected ? "offline" : T.hub ? "host" : "client"),
      code: T.code,
      me: T.myId,
      sim: simActive() ? Object.assign({}, NETSIM) : null,
      links: links.map(l => Object.assign(l.stats(), { name: nameOf(l.peer) })),
      peers,
      backup: T.backup,
      members: T.members.slice(),
      suggest: T.suggest,
    };
  }
  const lobby = mkRoom("lobby");
  /* host services the game asks for: rooms and file downloads */
  const downloads = {
    save({ filename, data }) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = String(filename || "settings.json");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return Promise.resolve();
    },
  };
  window.KAHOST = {
    use(n) {
      return n === "room" ? roomP : n === "downloads" ? Promise.resolve(downloads) : Promise.resolve(null);
    },
    net: {
      stats: netStats,
      sim: NETSIM,
      /** set simulated conditions: { latency (one-way ms), jitter (ms), loss (0..0.5) } */
      setSim(o) {
        for (const k of ["latency", "jitter", "loss"])
          if (Number.isFinite(+o[k])) NETSIM[k] = Math.max(0, +o[k]);
        NETSIM.loss = Math.min(0.5, NETSIM.loss);
      },
      /** host only: hand the room to another player (defaults to the suggested best host) */
      handover: to => handover(to || (T.suggest && T.suggest.peer)),
    },
  };
  window.__p2p = {
    host,
    join,
    get state() {
      return {
        connected: T.connected,
        hub: T.hub,
        hubId: T.hubId,
        code: T.code,
        peers: T.conns.size,
        fast: [...T.fast.keys()],
        backup: T.backup,
      };
    },
  };
})();
