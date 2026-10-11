/* ===== Standalone multiplayer: peer-to-peer rooms over WebRTC (PeerJS) =====
   Implements the presence-room interface the netcode is written against (see docs/ARCHITECTURE.md).
   Star topology: the person who hosts the room relays everyone's presence. Codes are short and random. */
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
    myId: "local",
    hub: false,
    hubConn: null,
    hubRtt: null,
    conns: new Map(),
    store: new Map(),
    mine: new Map(),
    rooms: new Map(),
    connected: false,
    code: null,
    busy: false,
  };
  /** @type {(id: string) => El} */
  const $ = id => /** @type {El} */ (document.getElementById(id));

  /* ---- network simulation: added latency, jitter and loss on everything this tab sends.
     Reliable traffic models retransmission (a lost packet arrives a round trip late and holds up
     everything behind it); unreliable traffic is simply dropped. Set from tests, the dev console,
     or ?netsim=latencyMs,jitterMs,lossPercent in the page URL. */
  const NETSIM = { latency: 0, jitter: 0, loss: 0 };
  {
    const m = /[?&#]netsim=(\d+),(\d+),(\d+(?:\.\d+)?)/.exec(location.search + location.hash);
    if (m) Object.assign(NETSIM, { latency: +m[1], jitter: +m[2], loss: Math.min(0.5, +m[3] / 100) });
  }
  const simActive = () => NETSIM.latency > 0 || NETSIM.jitter > 0 || NETSIM.loss > 0;

  /* ---- link: one data connection plus its measurements (round trip, jitter, loss, bandwidth) ---- */
  const PING_MS = 1000;
  class Link {
    constructor(conn, onData) {
      this.conn = conn;
      this.peer = conn.peer;
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
      conn.on("data", m => this.recv(m));
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
      const n = JSON.stringify(m).length;
      this.tx.b += n;
      this.tx.n++;
      try {
        this.conn.send(m);
      } catch (e) {}
    }
    /** send through the network simulator when it is active (reliable unless opts.unreliable) */
    send(m, opts) {
      if (!simActive()) return this.raw(m);
      const now = performance.now();
      let d = NETSIM.latency + Math.random() * NETSIM.jitter;
      if (Math.random() < NETSIM.loss) {
        if (opts && opts.unreliable) return;
        d += Math.max(200, NETSIM.latency * 3);
      }
      const at = opts && opts.unreliable ? now + d : Math.max(this.nextSend, now + d);
      if (!(opts && opts.unreliable)) this.nextSend = at;
      setTimeout(() => this.raw(m), at - now);
    }
    ping() {
      this.roll();
      const p = { n: ++this.pingN, ts: performance.now(), got: false };
      this.pings.push(p);
      if (this.pings.length > 20) this.pings.shift();
      /* pings ride unreliably so they measure the wire, not queueing behind retransmits */
      this.send({ t: "_pi", n: p.n, ts: p.ts }, { unreliable: true });
    }
    recv(m) {
      const now = performance.now();
      this.rx.b += JSON.stringify(m || null).length;
      this.rx.n++;
      this.rx.last = now;
      if (m && m.t === "_pi") return this.send({ t: "_po", n: m.n, ts: m.ts }, { unreliable: true });
      if (m && m.t === "_po") {
        const p = this.pings.find(x => x.n === m.n);
        if (p && !p.got) {
          p.got = true;
          const r = now - p.ts;
          this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.25 : r;
          if (this.lastRtt) this.jitter += (Math.abs(r - this.lastRtt) - this.jitter) * 0.25;
          this.lastRtt = r;
        }
        return;
      }
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
    /** pings older than 2.5 s without a reply count as lost */
    get loss() {
      const now = performance.now(),
        done = this.pings.filter(p => p.got || now - p.ts > 2500);
      return done.length ? done.filter(p => !p.got).length / done.length : 0;
    }
    stats() {
      return {
        peer: this.peer,
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
    } else if (m.t === "x") {
      for (const [r, s] of T.store)
        if (s.has(m.id)) {
          const e = entry(m.id, s.get(m.id), false);
          s.delete(m.id);
          const R = T.rooms.get(r);
          if (R) R.fire([], [e], []);
        }
    }
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
  /* hub: one connection per friend, with a flood guard */
  function hubAccept(c) {
    if (T.conns.size >= MAX_PEERS - 1) {
      c.on("open", () => {
        try {
          c.send({ t: "full" });
        } catch (e) {}
        setTimeout(() => c.close(), 300);
      });
      return;
    }
    const bucket = { tok: 120, t: performance.now() };
    const link = new Link(c, m => {
      const now = performance.now();
      bucket.tok = Math.min(120, bucket.tok + (now - bucket.t) * 0.06);
      bucket.t = now;
      if (--bucket.tok < 0) return;
      if (!okMsg(m) || m.t !== "p") return;
      const out = { t: "p", r: m.r, id: c.peer, p: m.p };
      apply(out);
      for (const [id, o] of T.conns) if (id !== c.peer && o.open) o.send(out);
    });
    c.on("open", () => {
      T.conns.set(c.peer, link);
      link.send({ t: "all", list: allPresence() });
      status();
    });
    const gone = () => {
      if (!T.conns.has(c.peer)) return;
      T.conns.delete(c.peer);
      link.close();
      const m = { t: "x", id: c.peer };
      apply(m);
      send(m);
      status();
    };
    c.on("close", gone);
    c.on("error", gone);
  }
  /* client: everything arrives via the host */
  function clientData(m) {
    if (!m || typeof m !== "object") return;
    if (m.t === "_rt" && m.tab && typeof m.tab === "object") {
      T.hubRtt = {};
      for (const [k, v] of Object.entries(m.tab).slice(0, 16))
        if (ID_RE.test(k) && Number.isFinite(+v)) T.hubRtt[k] = +v;
      return;
    }
    if (m.t === "full") {
      msg("That room is full (8 players).", true);
      return;
    }
    if (m.t === "all" && Array.isArray(m.list)) {
      for (const x of m.list.slice(0, 64)) if (okMsg(x)) apply(x);
      return;
    }
    if (okMsg(m)) apply(m);
  }
  function lostHost() {
    if (!T.connected) return;
    T.connected = false;
    for (const [r, s] of T.store) {
      const R = T.rooms.get(r);
      const left = [...s].map(([id, p]) => entry(id, p, false));
      s.clear();
      if (R && left.length) R.fire([], left, []);
    }
    for (const R of T.rooms.values()) R.closed();
    msg("The room closed (the host left). Reload the page to host or join again.", true);
    setUI("closed");
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
    const peer = new P(PREFIX + code, { debug: 0 });
    T.peer = peer;
    peer.on("open", id => {
      T.myId = id;
      T.hub = true;
      T.connected = true;
      T.code = code;
      T.busy = false;
      keepAlive(peer);
      resolveRoom(lobby);
      setUI("hosting");
      status();
    });
    peer.on("connection", hubAccept);
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
    const peer = new P(undefined, { debug: 0 });
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
        fail("Couldn't reach that room. Check the code, or the host's network may block direct connections."),
      15000
    );
    peer.on("open", id => {
      T.myId = id;
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      const link = new Link(c, clientData);
      c.on("open", () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        T.hubConn = link;
        T.connected = true;
        T.code = code;
        T.busy = false;
        keepAlive(peer);
        resolveRoom(lobby);
        setUI("joined");
        status();
      });
      c.on("close", () => {
        link.close();
        lostHost();
      });
      c.on("error", () => {
        if (T.connected) lostHost();
      });
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
        ? `Room ${c} is open · ${n} player${n > 1 ? "s" : ""} here. Send friends the code${/^https?:/.test(location.protocol) ? " or invite link" : ""}. Keep this tab open: the room closes when you leave.`
        : `Connected to room ${c}. Deploy for arena, or join the host's CTF match below.`
    );
  }
  function setUI(s) {
    const on = s === "hosting" || s === "joined";
    $("p2pIdle").hidden = on || s === "closed";
    $("p2pLive").hidden = !on;
    $("p2pHost").disabled = $("p2pJoin").disabled = s === "busy";
    $("p2pCopy").hidden = s !== "hosting";
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
    } catch (e) {}
  });
  setInterval(() => {
    if (!T.hub || !T.connected) return;
    const tab = {};
    for (const [id, l] of T.conns) tab[id] = Math.round(l.rtt);
    send({ t: "_rt", tab });
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
    const links = T.hub ? [...T.conns.values()] : T.hubConn ? [T.hubConn] : [];
    /** @type {NetStats["peers"]} */
    const peers = {};
    if (T.hub) for (const l of links) peers[l.peer] = { rtt: Math.round(l.rtt), direct: true };
    else if (T.hubConn) {
      const hubRtt = Math.round(T.hubConn.rtt);
      peers[T.hubConn.peer] = { rtt: hubRtt, direct: true };
      for (const [id, r] of Object.entries(T.hubRtt || {}))
        if (id !== T.myId) peers[id] = { rtt: hubRtt + r, direct: false };
    }
    return {
      role: /** @type {NetStats["role"]} */ (!T.connected ? "offline" : T.hub ? "host" : "client"),
      code: T.code,
      me: T.myId,
      sim: simActive() ? Object.assign({}, NETSIM) : null,
      links: links.map(l => Object.assign(l.stats(), { name: nameOf(l.peer) })),
      peers,
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
    },
  };
  window.__p2p = {
    host,
    join,
    get state() {
      return { connected: T.connected, hub: T.hub, code: T.code, peers: T.conns.size };
    },
  };
})();
