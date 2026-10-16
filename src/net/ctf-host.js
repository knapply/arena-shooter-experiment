/* ===== CTF online: room transport, lobby info and the host side (host runs AI, flags and score) ===== */
(function () {
  const K = window.KA,
    T = K.THREE,
    CTF = window.CTF;
  const V3 = T.Vector3,
    num = K.num;
  const NET = (CTF.NET = /** @type {NetApi} */ ({
    room: null,
    named: false,
    base: { m: "ctf", n: "Pilot", tm: 0, ph: "menu" },
    onPeers: null,
  }));
  const r1 = v => Math.round(v * 10) / 10,
    r2 = v => Math.round(v * 100) / 100;
  const ID_RE = /^[a-z0-9:_-]{1,48}$/i;
  NET.okId = id => typeof id === "string" && ID_RE.test(id);
  NET.connect = async function () {
    if (NET.room || NET.connecting) return NET.room;
    const lobby = K.room;
    if (!lobby) return null;
    NET.connecting = true;
    try {
      NET.room = await lobby.join("ctf");
      NET.named = true;
    } catch (e) {
      NET.room = lobby;
      NET.named = false;
    }
    /* fast channel (when the transport has one): movement in both directions, ~30 Hz */
    if (typeof NET.room.onFast === "function")
      NET.room.onFast((from, buf) => {
        if (NET.onFast) NET.onFast(from, buf);
      });
    NET.room.onPeers(
      () => {
        if (NET.onPeers) NET.onPeers();
      },
      () => {
        NET.room = null;
      }
    );
    NET.send({});
    NET.connecting = false;
    return NET.room;
  };
  /* keep trying to join the CTF room until the host room service is available */
  setInterval(() => {
    if (K.room && !NET.room && !NET.connecting) NET.connect();
  }, 800);

  NET.send = function (extra) {
    if (!NET.room) return;
    const o = Object.assign({}, NET.base, extra);
    let s = JSON.stringify(o);
    if (s.length > 3900 && o.H) {
      o.H.cm = [];
      s = JSON.stringify(o);
    }
    if (s.length > 3900 && o.H) {
      o.H.ev = o.H.ev.slice(-3);
    }
    NET.room.presence(o).catch(() => {});
  };
  NET.myPeer = () => {
    if (!NET.room) return null;
    const me = NET.room.peers().find(p => p.sameTab);
    return me ? me.peer : K.myPeer;
  };
  NET.ctfPeers = function () {
    if (!NET.room) return [];
    return NET.room
      .peers()
      .filter(p => !p.sameTab && p.kind === "viewer" && p.presence && p.presence.m === "ctf");
  };
  /** the modes and maps a host can say it is playing (anything else is read as capture the flag) */
  const MODES = ["ctf", "slayer", "ffa", "oddball"];
  NET.modeOf = H => (MODES.includes(H.md) ? H.md : "ctf");
  NET.mapOf = (H, md) => {
    const P = K.PLAY_MODES.find(p => p.id === md);
    return P && P.maps.includes(H.mp) ? H.mp : P ? P.maps[0] : "ctf";
  };
  NET.liveHost = function () {
    for (const p of NET.ctfPeers()) {
      const pr = p.presence;
      if (
        pr.ph === "host" &&
        pr.H &&
        typeof pr.H === "object" &&
        pr.H.ov == null &&
        typeof pr.H.id === "string"
      )
        return {
          peer: p.peer,
          name: K.cleanName(pr.n),
          mid: pr.H.id.slice(0, 24),
          mode: NET.modeOf(pr.H),
          map: NET.mapOf(pr.H, NET.modeOf(pr.H)),
          players:
            1 + NET.ctfPeers().filter(q => q.presence.ph === "client" && q.presence.mid === pr.H.id).length,
        };
    }
    return null;
  };
  /* fx kinds on the presence fx list: n grenade, m melee impact, p your drop pod launching, q its
     landing point moving (steering) */
  const fxKind = k => ({ nade: "n", mhit: "m", pod: "p", podto: "q" })[k] || null;
  NET.fxKind = fxKind;
  /** a player's drop pod from their fx: "p" launches it where they will land, "q" moves that point
      (the pod is drawn here; their client owns the landing) */
  NET.remotePod = function (a, f) {
    const p = K.vec(f.slice(2, 5), new V3());
    if (!a || !p) return;
    if (f[1] === "p") a.vpod = K.dropPod(p, CTF.TEAM_HEX[a.team === 1 ? 1 : 0]);
    else if (a.vpod && !a.vpod.landed) a.vpod.at.copy(p);
  };
  /* state bits shared by every CTF participant */
  NET.bitsOf = function (b, o) {
    return (
      (b.crouch ? 1 : 0) |
      (b.sprint ? 2 : 0) |
      (b.slideT > 0 ? 4 : 0) |
      (b.thrustT > 0 ? 8 : 0) |
      (b.stabbing ? 16 : 0) |
      (b.pound === 1 ? 32 : 0) |
      (o.reload ? 64 : 0) |
      (b.meleeT > 0 ? 128 : 0) |
      (b.clamber ? 256 : 0) |
      (!b.ground ? 512 : 0) |
      (b.chargeT > 0 ? 1024 : 0) |
      (b.pound === 2 ? 2048 : 0) |
      (o.fire ? 4096 : 0) |
      (o.wpn & 1 ? 8192 : 0) |
      (o.wpn & 2 ? 32768 : 0) |
      (o.wpn & 4 ? 131072 : 0) |
      (o.carry ? 16384 : 0) |
      (b.aiming ? 65536 : 0)
    );
  };
  NET.applyBits = function (b, s) {
    b.crouch = !!(s & 1);
    b.h = b.crouch ? K.H_CROUCH : K.H_STAND;
    b.sprint = !!(s & 2);
    b.slideT = s & 4 ? 0.5 : 0;
    b.thrustT = s & 8 ? 0.2 : 0;
    b.stabbing = !!(s & 16);
    b.pound = s & 2048 ? 2 : s & 32 ? 1 : 0;
    b.meleeT = s & 128 ? 0.3 : 0;
    b.clamber = s & 256 ? {} : null;
    b.ground = !(s & 512);
    b.chargeT = s & 1024 ? 0.2 : 0;
    b.aiming = !!(s & 65536);
  };
  NET.readBody = function (b, pr) {
    K.vec(pr.p, b.pos);
    if (!K.vec(pr.v, b.vel)) b.vel.set(0, 0, 0);
    b.vel.clampLength(0, 60);
    b.yaw = num(pr.y, -1e4, 1e4);
    b.pitch = num(pr.pt, -1.6, 1.6);
    b.shield = num(pr.sh, 0, 70);
    NET.applyBits(b, pr.st | 0);
  };
  /* sanity check for a remote shot: shooter alive and within range with line of sight */
  const _s = new V3(),
    _t = new V3();
  /** how far each hitscan weapon reaches, with some slack (claims without a ray are checked by this) */
  const HITSCAN_RANGE = { rifle: 95, pistol: 95, scatter: 45 };
  NET.plausible = function (shooterPos, target, w, at) {
    if (!target || !target.alive) return false;
    _s.copy(shooterPos);
    _s.y += 1.5;
    _t.copy(at || target.pos);
    _t.y += 1.1;
    const d = _s.distanceTo(_t);
    if (w === "sniper") {
      if (d > 225) return false;
      return K.losClear(_s, _t) || d < 4;
    }
    const R = HITSCAN_RANGE[w];
    if (R) {
      if (d > R) return false;
      return K.losClear(_s, _t) || d < 4;
    }
    if (w === "melee" || w === "charge" || w === "flag" || w === "skull") return d < 4.5;
    if (w === "pound") return d < 8;
    /* explosions (rockets, grenades) land wherever they were sent: around corners and far from the
       thrower (the network lab caught rockets and long throws being refused at the old 14 m) */
    return d < 150;
  };
  /* ---------------- host ---------------- */
  CTF.Host = function (G) {
    const H = {
      G,
      mid: Math.random().toString(36).slice(2, 10),
      remote: new Map(),
      ev: [],
      cm: [],
      hs: [],
      fx: [],
      evS: 0,
      cmS: 0,
      hsS: 0,
      fxS: 0,
      sendT: 0,
      fireT: new Map(),
      agg: new Map(),
      /** hit claims from players: accepted, and rejected by the checks below */
      hitStats: { ok: 0, bad: 0 },
      /** recent pings, relayed to everyone: [seq, fromId, kind, x, y, z, targetId, label] */
      pg: [],
      pgS: 0,
      rv: 0,
      rosterKey: "",
      fastT: 0,
      /** each agent's movement fields as last put in the snapshot, refreshed once a second (kinT) */
      kin: new Map(),
      /** [wall s, match s] pairs, one a frame: gameAt(wall) maps a ctfMove stamp to match time */
      clk: [],
      kinT: 0,
      evSent: 0,
      sentAt: -1e9,
    };
    const myId = G.human.id;
    /* the match knows its netcode (the network lab reads playback stats from it) */
    G.net = H;
    const FAST = 1 / 30;
    NET.hitStats = H.hitStats;
    /* a joined player's movement arrives on the fast channel into their playback buffer */
    NET.onFast = function (from, buf) {
      const m = K.MSG.decode(buf);
      if (!m || m.name !== "ctfClient") return;
      const a = H.remote.get(from);
      if (!a) return;
      const d = m.data,
        t = performance.now() / 1000;
      a.pb.push(d.ts / 1000, { p: d.p, v: d.v, y: d.y, pt: d.pt, st: d.st }, t);
      a.hist.push(d.ts / 1000, d.p, d.y, d.pt, d.st, d.dead);
      if (a.pb.buf[a.pb.buf.length - 1].ts === d.ts / 1000) {
        a.fastAt = t;
        a.body.shield = d.sh;
        const st = d.st;
        NET.applyBits(a.body, st);
        a.firing = !!(st & 4096);
        a.reloading = !!(st & 64);
        a.wpn = (st & 8192 ? 1 : 0) | (st & 32768 ? 2 : 0) | (st & 131072 ? 4 : 0);
      }
    };
    const _pbs = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, s: null };
    H.wrap = function () {
      const uiE = G.onEvent,
        uiC = G.onComms;
      G.onEvent = (t, d) => {
        if (uiE) uiE(t, d);
        H.onEvent(t, d);
      };
      G.onComms = m => {
        if (uiC) uiC(m);
        H.cm.push([++H.cmS, m.team, m.from ? m.from.id : "", String(m.text).slice(0, 80)]);
        if (H.cm.length > 5) H.cm.shift();
      };
      G.netHit = (e, n, src) => {
        const by = src.by ? src.by.id : src.world ? "" : myId;
        const k = e.id + "|" + by;
        const a = H.agg.get(k);
        if (a) {
          a.d += n;
          a.hd = a.hd || !!src.hd;
        } else H.agg.set(k, { t: e.id, d: n, w: src.w || "rifle", hd: !!src.hd, by });
      };
    };
    H.onEvent = function (t, d) {
      const id = x => (x && x.id ? x.id : "");
      let e = null;
      /* a kill also says what the victim carried (1 the flag, 2 the skull) and whether it denied a capture */
      if (t === "kill")
        e = [
          "k",
          id(d.killer),
          id(d.victim),
          d.type || "rifle",
          d.head ? 1 : 0,
          d.carried === "flag" ? 1 : d.carried === "ball" ? 2 : 0,
          d.denial ? 1 : 0,
        ];
      else if (t === "flagTaken") e = ["t", d.flag.team, id(d.by)];
      else if (t === "flagDrop") e = ["d", d.flag.team, id(d.by)];
      else if (t === "flagReturn") e = ["r", d.flag.team, id(d.by), d.clutch ? 1 : 0];
      else if (t === "flagReset") e = ["x", d.flag.team];
      else if (t === "capture") e = ["c", d.team, id(d.by)];
      else if (t === "end") e = ["e", d.winner];
      else if (t === "pod") e = ["p", d.a.team, r2(d.pos.x), r2(d.pos.y), r2(d.pos.z)];
      /* the skull: taken, dropped (by, killer), its pod launched, landed, reset */ else if (
        t === "ballTaken"
      )
        e = ["bt", id(d.by)];
      else if (t === "ballDrop") e = ["bd", id(d.by), id(d.killer)];
      else if (t === "ballPod") e = ["bp", r2(d.pos.x), r2(d.pos.y), r2(d.pos.z)];
      else if (t === "ballSpawn") e = ["bs"];
      else if (t === "ballReset") e = ["br"];
      else if (t === "nade")
        e = [
          "n",
          d.type === "plasma" ? 1 : d.type === "rocket" ? 2 : 0,
          r2(d.pos.x),
          r2(d.pos.y),
          r2(d.pos.z),
          r2(d.vel.x),
          r2(d.vel.y),
          r2(d.vel.z),
        ];
      if (e) {
        e.splice(1, 0, ++H.evS);
        H.ev.push(e);
        if (H.ev.length > 8) H.ev.shift();
      }
    };
    /* grenades, melee impacts (yours and the AI's) so clients hear where a blow landed, and your drop
       pod (launch and steering) so everyone sees it come down */
    H.onFx = function (k, a, b, g) {
      const c = NET.fxKind(k);
      if (!c) return;
      H.fx.push([++H.fxS, c, ...a, ...b, g | 0]);
      if (H.fx.length > 4) H.fx.shift();
    };
    /** @returns {HostSnapshot} */
    H.snapshot = function () {
      const ST = { home: 0, carried: 1, dropped: 2 };
      const kinFresh = !(NET.room && typeof NET.room.fast === "function") || H.kinT <= 0;
      if (kinFresh) H.kinT = 1;
      const key = G.agents.map(a => a.id).join();
      if (key !== H.rosterKey) {
        H.rosterKey = key;
        H.rv = (H.rv + 1) & 255;
      }
      const B = G.ball;
      return {
        id: H.mid,
        rv: H.rv,
        /* the mode and map (what joiners build), the score limit, each team's score (every pilot's
           in free-for-all) and held time (oddball) */
        md: G.rules,
        mp: H.mapKey || "ctf",
        sl: G.scoreLimit,
        fr: G.flagReset,
        rr: G.ballReset,
        t: r1(G.t),
        tl: G.timeLimit,
        sc: G.teams.map(tm => tm.score),
        ho: B ? G.teams.map(tm => r1(tm.held)) : undefined,
        /* the skull: [state 0 incoming 1 home 2 carried 3 dropped, x, y, z, carrier, seconds on the floor] */
        bl: B
          ? [
              ["incoming", "home", "carried", "dropped"].indexOf(B.state),
              r1(B.pos.x),
              r1(B.pos.y),
              r1(B.pos.z),
              B.carrier ? B.carrier.id : "",
              r1(G.t - B.dropT),
            ]
          : undefined,
        ov: G.over ? G.winner : null,
        fl: G.flags.map(f => [
          ST[f.state],
          r1(f.pos.x),
          r1(f.pos.y),
          r1(f.pos.z),
          f.carrier ? f.carrier.id : "",
          r1(G.t - f.dropT),
        ]),
        ag: G.agents.map(a => {
          const b = a.body,
            loc = a.local;
          let sp = 0;
          /* spotted by each team (team modes: what shows on a player's minimap) */
          if (!G.ffa)
            for (const t of [0, 1]) {
              const m = G.teams[t].brain.enemyMem.get(a.id);
              if (m && G.t - m.t < 2.5) sp |= 1 << t;
            }
          /* movement (positions to the alive flag) rides the fast channel at 30 Hz: here it is only
             refreshed once a second, so with presence deltas an unchanged row costs nothing */
          let kin = H.kin.get(a.id);
          if (!kin || kinFresh) H.kin.set(a.id, (kin = kinOf(a, b, loc)));
          return [a.id, a.team, a.idx, ...kin, sp, a.name, a.k, a.d];
        }),
        ev: H.ev,
        cm: H.cm,
        /* whole seconds while a power weapon is a while off: the countdown changes once a second */
        pu: G.pickups.map(p => [p.id, p.availIn > 5 ? Math.ceil(p.availIn) : r1(p.availIn), p.type]),
        /* weapons and grenades on the floor: [id, type, x, y, z, magazine, reserve] (a weapon's rounds) */
        it: G.items
          .filter(i => i.avail)
          .slice(-16)
          .map(i => {
            const e = [i.id, i.type, r2(i.pos.x), r2(i.pos.y), r2(i.pos.z)];
            if (i.ammo) e.push(i.ammo[0], i.ammo[1]);
            return e;
          }),
        ff: G.ff ? 1 : 0,
        br: [...K.DESTR.broken.keys()].slice(0, 40),
      };
    };
    H.tick = function (dt) {
      /* wall clock → match time, for hits whose view time is a ctfMove stamp */
      H.clk.push(performance.now() / 1000, K.now);
      if (H.clk.length > 600) H.clk.splice(0, 200);
      if (!NET.room) {
        H.agg.clear();
        return;
      }
      /* two players took over the same match at once (they saw the room differently while the old
         host was leaving): the one with the lower peer id keeps it, the other joins them */
      if (H.onRival && !H.yielded) {
        const mine = NET.myPeer();
        const rival =
          mine &&
          NET.ctfPeers().find(
            p =>
              p.peer < mine &&
              p.presence.ph === "host" &&
              ((p.presence.H && p.presence.H.id === H.mid) || p.presence.mid === H.mid)
          );
        if (rival) {
          H.yielded = true;
          const pr = rival.presence;
          H.onRival({
            peer: rival.peer,
            name: K.cleanName(pr.n),
            mid: H.mid,
            mode: NET.modeOf(pr.H),
            map: NET.mapOf(pr.H, NET.modeOf(pr.H)),
          });
          return;
        }
      }
      const seen = new Set();
      for (const p of NET.ctfPeers()) {
        const pr = p.presence;
        if (pr.ph !== "client" || pr.mid !== H.mid) continue;
        seen.add(p.peer);
        H.ingest(p.peer, pr);
      }
      for (const [peer, a] of H.remote)
        if (!seen.has(peer)) {
          G.removeHuman(a);
          H.remote.delete(peer);
          CTF.UI.line("sys", `${a.name} left the match`);
        }
      /* remote players drawn from their timestamped playback */
      const tnow = performance.now() / 1000;
      for (const a of H.remote.values())
        if (tnow - a.fastAt < 1 && a.pb.sample(tnow, _pbs)) {
          a.body.pos.set(_pbs.x, _pbs.y, _pbs.z);
          a.body.vel.set(_pbs.vx, _pbs.vy, _pbs.vz);
          a.body.yaw = _pbs.yaw;
          a.body.pitch = _pbs.pitch;
        }
      // remote players' muzzle flashes and tracers, from their firing state
      for (const a of H.remote.values()) if (a.firing && a.alive) CTF.drawFire(a, dt, H.fireT);
      const fast = typeof NET.room.fast === "function";
      /* presence goes out at once when the roster changes, so clients can map fast packets */
      const rosterChanged = G.agents.map(a => a.id).join() !== H.rosterKey;
      H.fastT -= dt;
      if (fast && H.fastT <= 0) {
        H.fastT = FAST;
        H.snapshotRv();
        NET.room.fast(
          K.MSG.encode("ctfMove", {
            /* wall clock, not match time: a long frame here (a hitch) loses match time, and stamps
               that fall behind real time made every client's playback run past its data, freeze,
               then snap (the network lab measured 1.2 m errors and 10 pops a minute from 0.4 s
               hitches). Hits name their view time on this clock too: see gameAt */
            ts: Math.round(performance.now()) >>> 0,
            rv: H.rv,
            ag: G.agents.map(a => {
              const b = a.body,
                loc = a.local;
              return {
                p: b.pos,
                v: b.vel,
                y: b.yaw,
                pt: b.pitch,
                st: NET.bitsOf(b, {
                  reload: loc ? K.reloadT > 0 : a.remote ? !!a.reloading : a.reloadT > 0,
                  fire: loc ? K.now - K.lastFireT < 0.12 : a.remote ? !!a.firing : G.t - a.firedT < 0.12,
                  wpn: loc ? K.wi : a.remote ? a.wpn : a.held(),
                  carry: !!a.carrying,
                }),
                sh: Math.ceil(b.shield),
                dead: !a.alive,
              };
            }),
          })
        );
      }
      H.sendT -= dt;
      H.kinT -= dt;
      /* presence (events, flags, names, roster) every 1/15 s; at once when the roster changes, and
         (at most every 33 ms) when there is news: kills and flag events, hits on players */
      const tn = performance.now();
      const news = H.evS !== H.evSent || H.agg.size > 0;
      if (H.sendT > 0 && !rosterChanged && !(news && tn - H.sentAt >= 33)) return;
      H.sendT = 1 / 15;
      H.sentAt = tn;
      H.evSent = H.evS;
      for (const v of H.agg.values()) {
        H.hs.push([++H.hsS, v.t, Math.round(v.d), v.w, v.hd ? 1 : 0, v.by]);
      }
      H.agg.clear();
      while (H.hs.length > 10) H.hs.shift();
      const me = K.me;
      NET.send({
        ph: "host",
        mid: H.mid,
        H: H.snapshot(),
        hs: H.hs,
        fx: H.fx,
        pg: H.pg,
        p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)],
      });
    };
    /** match time at a wall-clock time (seconds) of this machine; 0 stays 0 (unknown) */
    H.gameAt = function (w) {
      const c = H.clk,
        n = c.length / 2;
      if (!w || !n) return w ? K.now - (performance.now() / 1000 - w) : 0;
      if (w >= c[(n - 1) * 2]) return c[(n - 1) * 2 + 1] + (w - c[(n - 1) * 2]);
      if (w <= c[0]) return c[1] - (c[0] - w);
      let lo = 0,
        hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (c[m * 2] <= w) lo = m;
        else hi = m;
      }
      const w0 = c[lo * 2],
        w1 = c[hi * 2],
        g0 = c[lo * 2 + 1],
        g1 = c[hi * 2 + 1];
      return g0 + ((g1 - g0) * (w - w0)) / (w1 - w0 || 1);
    };
    H.snapshotRv = function () {
      const key = G.agents.map(a => a.id).join();
      if (key !== H.rosterKey) {
        H.rosterKey = key;
        H.rv = (H.rv + 1) & 255;
      }
    };
    /** a ping by someone in the match: AI teammates respond, everyone in the match hears about it */
    H.ping = function (from, p) {
      G.ping(from, p);
      H.pg.push([
        ++H.pgS,
        from.id,
        p.kind,
        r2(p.pos[0]),
        r2(p.pos[1]),
        r2(p.pos[2]),
        p.target || "",
        p.label,
      ]);
      if (H.pg.length > 6) H.pg.shift();
      if (!from.local && from.team === G.human.team)
        K.addPing({
          by: from.id,
          byName: from.name,
          kind: p.kind,
          label: p.label,
          pos: new V3(p.pos[0], p.pos[1], p.pos[2]),
          ref: p.target ? G.byId(p.target) : null,
        });
    };
    H.ingest = function (peer, pr) {
      let a = H.remote.get(peer);
      const want = pr.tm === 1 ? 1 : 0;
      const name = K.cleanName(pr.n);
      if (!a) {
        if (H.remote.size >= 7) return;
        /* free-for-all: a pilot slot of their own (no slot left: they can't join) */
        const team = G.openTeam(want);
        if (team < 0) return;
        a = new CTF.Agent(G, team, 0, name, true, true, "h:" + peer);
        a.peer = peer;
        a.seenHs = -1;
        a.seenFx = -1;
        a.seenDth = -1;
        a.init = false;
        a.spawned = true;
        a.pb = new K.Playback();
        /* their reported movement (their clock) and claims, for the hit checks */
        a.hist = new K.MoveHist();
        a.stream = K.HITCHK.newStream();
        a.fastAt = -9;
        G.addHuman(a, team);
        H.remote.set(peer, a);
        CTF.UI.line("sys", `${name} joined ${G.ffa ? "the match" : CTF.TEAM_NAMES[team]}`);
        K.sfx("stinger", 0.4);
      }
      a.name = name;
      if (!G.ffa && a.team !== want) {
        G.moveHuman(a, want);
        CTF.UI.line("sys", `${name} switched to ${CTF.TEAM_NAMES[want]}`);
      }
      /* presence movement only when the fast channel is quiet */
      if (performance.now() / 1000 - a.fastAt > 0.6) {
        NET.readBody(a.body, pr);
        const st = pr.st | 0;
        a.firing = !!(st & 4096);
        a.reloading = !!(st & 64);
        a.wpn = (st & 8192 ? 1 : 0) | (st & 32768 ? 2 : 0) | (st & 131072 ? 4 : 0);
      }
      if (Array.isArray(pr.br)) K.applyBreaks(pr.br, true, "c:" + peer);
      if (Array.isArray(pr.pk) && a.init) {
        const s = num(pr.pk[0], 0, 1e9);
        if (s > (a.seenPk | 0)) {
          a.seenPk = s;
          const p = G.pickups.find(q => q.id === pr.pk[1]),
            it = p ? null : G.items.find(q => q.id === pr.pk[1]);
          const near = q =>
            q &&
            a.alive &&
            Math.hypot(a.pos.x - q.pos.x, a.pos.z - q.pos.z) < 2.4 &&
            Math.abs(a.pos.y - q.pos.y) < 2.2;
          if (near(p)) G.takePickup(p, a);
          else if (near(it)) it.take();
        }
      } else if (Array.isArray(pr.pk) && !a.init) a.seenPk = num(pr.pk[0], 0, 1e9);
      /* the player's drops (their death or a weapon swap), and the flag taken or let go by hand */
      if (Array.isArray(pr.dr) && a.init && num(pr.dr[0], 0, 1e9) > (a.seenDr | 0)) {
        a.seenDr = num(pr.dr[0], 0, 1e9);
        const at = K.vec(pr.dr.slice(1, 4), new V3());
        if (at && at.distanceTo(a.pos) < 6) {
          const list = (Array.isArray(pr.dr[4]) ? pr.dr[4] : []).slice(0, 3).map(e =>
            (e[0] | 0) < 0
              ? { type: -1, nades: { frag: num(e[3], 0, 2) | 0, plasma: num(e[4], 0, 2) | 0 } }
              : {
                  type: Math.min(K.WEAPON_DATA.length - 1, Math.max(0, e[0] | 0)),
                  ammo: [num(e[1], 0, 99) | 0, num(e[2], 0, 999) | 0],
                }
          );
          G.addItems(list, at);
        }
      } else if (Array.isArray(pr.dr) && !a.init) a.seenDr = num(pr.dr[0], 0, 1e9);
      if (pr.fp != null && a.init && num(pr.fp, 0, 1e9) > (a.seenFp | 0)) {
        a.seenFp = num(pr.fp, 0, 1e9);
        G.humanTakeFlag(a);
      } else if (pr.fp != null && !a.init) a.seenFp = num(pr.fp, 0, 1e9);
      if (pr.fd != null && a.init && num(pr.fd, 0, 1e9) > (a.seenFd | 0)) {
        a.seenFd = num(pr.fd, 0, 1e9);
        G.dropFlagBy(a);
      } else if (pr.fd != null && !a.init) a.seenFd = num(pr.fd, 0, 1e9);
      if (Array.isArray(pr.pg) && a.init) {
        const s = num(pr.pg[0], 0, 1e9);
        const kind = ["enemy", "weapon", "place", "danger"].includes(pr.pg[1]) ? pr.pg[1] : null;
        if (s > (a.seenPg | 0) && kind) {
          a.seenPg = s;
          const pos = [num(pr.pg[2], -500, 500), num(pr.pg[3], -50, 100), num(pr.pg[4], -500, 500)];
          H.ping(a, {
            kind,
            pos,
            target: NET.okId(pr.pg[5]) ? pr.pg[5] : null,
            label: K.cleanName(pr.pg[6]).slice(0, 16) || "Here",
          });
        }
      } else if (Array.isArray(pr.pg)) a.seenPg = num(pr.pg[0], 0, 1e9);
      const dead = !!pr.dd;
      if (!dead && a.dead) {
        a.dead = false;
        if (a.rig) a.rig.revive();
      } else if (dead && !a.dead) {
        a.dead = true;
      }
      const hs = Array.isArray(pr.hs) ? pr.hs.slice(-10) : [],
        fx = Array.isArray(pr.fx) ? pr.fx.slice(-4) : [];
      const dth = Array.isArray(pr.dth) ? pr.dth : null;
      if (!a.init) {
        a.init = true;
        for (const h of hs) a.seenHs = Math.max(a.seenHs, num(h && h[0], 0, 1e9));
        for (const f of fx) a.seenFx = Math.max(a.seenFx, num(f && f[0], 0, 1e9));
        a.seenDth = dth ? num(dth[0], 0, 1e9) : -1;
        return;
      }
      for (const h of hs) {
        if (!Array.isArray(h)) continue;
        const s = num(h[0], 0, 1e9);
        if (s <= a.seenHs) continue;
        a.seenHs = s;
        if (!a.alive) continue;
        const tid = h[1],
          w = String(h[3] || "rifle").slice(0, 8),
          hd = !!h[4];
        if (!NET.okId(tid)) continue;
        const tgt = G.byId(tid);
        if (!tgt || tgt === a || !tgt.alive || (tgt.team === a.team && !G.ff)) {
          H.hitStats.bad++;
          continue;
        }
        /* a one-hit flag or skull melee only from someone carrying it */
        if ((w === "flag" || w === "skull") && (!a.carrying || (w === "skull") !== (a.carrying === G.ball))) {
          H.hitStats.bad++;
          continue;
        }
        /* lag compensation: check the shot against where the target was on the shooter's screen
           (h[5] = the host-clock time the shooter was seeing), from the match recording, rewound no
           further than the cap (net/hitcheck.js) */
        const vt = H.gameAt(num(h[5], 0, 4294967295) / 1000);
        const ray = h.length >= 12 ? h.slice(6, 12).map(Number) : null;
        const ft = h.length >= 13 && Number.isFinite(+h[12]) ? +h[12] / 1000 : null;
        /* when they fired, in match time (their clock + the playback offset is ours) */
        const ftG = ft != null && a.pb.ready ? H.gameAt(ft + a.pb.offset) : null;
        const v = K.HITCHK.check({
          w,
          o: ray && ray.slice(0, 3),
          d: ray && ray.slice(3, 6),
          ft,
          vt: vt > 0 ? vt : 0,
          ftV: ftG,
          now: K.now,
          victim: ray && vt > 0 ? K.HITCHK.recHist(K.pidOf(tgt)) : null,
          shooter: a.hist.ready ? a.hist : null,
          stream: a.stream,
        });
        let at = null;
        if (v.t != null) {
          const s = K.REC.sample(K.pidOf(tgt), v.t);
          if (s) at = _rw.set(s.x, s.y, s.z);
        }
        /* claims without a checked ray (melee, grenades, an old client): range and line of sight
           from where we draw the shooter. A checked ray already had both, from where they really
           were: we draw them a little late, and that view cut corners (the network lab measured
           false rejections on the arena from it) */
        if (v.ok && v.t == null && !NET.plausible(a.body.pos, tgt, w, at)) {
          v.ok = false;
          v.why = "los";
        }
        K.HITCHK.note(
          a.peer,
          a.name,
          v,
          v.t == null
            ? null
            : {
                w,
                o: ray.slice(0, 3),
                d: ray.slice(3, 6),
                vid: K.pidOf(tgt),
                sid: K.pidOf(a),
                gv: v.t,
                gs: ftG != null ? ftG : K.now,
              }
        );
        if (!v.ok) {
          H.hitStats.bad++;
          continue;
        }
        H.hitStats.ok++;
        const n = K.allowDamage(peer, num(h[2], 0, 999), w);
        if (n <= 0) continue;
        if (tgt.local) K.hurtMe(n, { name: a.name, agent: a, w, hd });
        else if (!tgt.remote) tgt.onHit(n, w, hd, a);
      }
      for (const f of fx) {
        if (!Array.isArray(f)) continue;
        const s = num(f[0], 0, 1e9);
        if (s <= a.seenFx) continue;
        a.seenFx = s;
        if (f[1] === "n") {
          const p = K.vec(f.slice(2, 5), new V3()),
            v = K.vec(f.slice(5, 8), new V3());
          if (p && v) K.remoteProjectile(f[8] | 0, p, v);
        } else if (f[1] === "m") {
          const p = K.vec(f.slice(2, 5), new V3()),
            v = K.vec(f.slice(5, 8), new V3());
          if (p && v) K.meleeImpact(p, v, (f[8] | 0) & 15);
        } else if (f[1] === "p" || f[1] === "q") NET.remotePod(a, f);
      }
      if (dth) {
        const s = num(dth[0], 0, 1e9);
        if (s > a.seenDth) {
          a.seenDth = s;
          const killer = NET.okId(dth[1]) ? G.byId(dth[1]) : null;
          const w = String(dth[2] || "rifle").slice(0, 8);
          if (!a.dead) {
            a.dead = true;
          }
          a.dead = false;
          G.kill(a, killer && killer !== a ? killer : null, w, !!dth[3]);
          a.dead = true;
          if (killer && killer.local) K.addKill(w, !!dth[3], a.name);
        }
      }
    };
    H.tick = K.timed("ctf.host.tick", H.tick);
    H.ingest = K.timed("ctf.host.ingest", H.ingest);
    NET.onFast = K.timed("ctf.host.fast", NET.onFast);
    return H;
  };
  const _rw = new V3();
  /** an agent's movement fields of a snapshot row (x, y, z, vx, vy, vz, yaw, pitch, bits, shield, dead) */
  function kinOf(a, b, loc) {
    const fire = loc ? K.now - K.lastFireT < 0.12 : a.remote ? !!a.firing : a.G.t - a.firedT < 0.12;
    const rl = loc ? K.reloadT > 0 : a.remote ? !!a.reloading : a.reloadT > 0;
    return [
      r2(b.pos.x),
      r2(b.pos.y),
      r2(b.pos.z),
      r1(b.vel.x),
      r1(b.vel.y),
      r1(b.vel.z),
      r2(b.yaw),
      r2(b.pitch),
      NET.bitsOf(b, { reload: rl, fire, wpn: loc ? K.wi : a.remote ? a.wpn : a.held(), carry: !!a.carrying }),
      Math.ceil(b.shield),
      a.alive ? 0 : 1,
    ];
  }
  /* tracers for a player whose shots we only know as "firing" */
  const _o = new V3(),
    _d = new V3();
  CTF.drawFire = function (a, dt, map) {
    let t = (map.get(a.id) || 0) - dt;
    if (t > 0) {
      map.set(a.id, t);
      return;
    }
    map.set(a.id, a.wpn === 2 ? 0.62 : a.wpn ? 0.25 : 0.11);
    const b = a.body;
    _o.copy(b.pos);
    _o.y += b.h - 0.25;
    const cp = Math.cos(b.pitch);
    _d.set(-Math.sin(b.yaw) * cp, Math.sin(b.pitch), -Math.cos(b.yaw) * cp);
    _d.x += K.rnd(-0.01, 0.01);
    _d.y += K.rnd(-0.01, 0.01);
    _d.normalize();
    const L = K.rayWorld(_o, _d, 80);
    const end = _o.clone().addScaledVector(_d, Math.min(L, 80));
    K.tracer(
      _o.clone().addScaledVector(_d, 0.7),
      end,
      a.wpn === 2 ? 0x9fd8ff : CTF.teamInt(a.team),
      a.wpn === 2 ? 0.6 : 0.1
    );
    if (L < 80) K.spark(end);
    K.sfx(a.wpn === 2 ? "sshot" : a.wpn ? "pshot" : "shot", K.distVol(_o, 80) * 0.7);
  };
})();
