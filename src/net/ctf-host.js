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
          players:
            1 + NET.ctfPeers().filter(q => q.presence.ph === "client" && q.presence.mid === pr.H.id).length,
        };
    }
    return null;
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
      (o.wpn === 1 ? 8192 : 0) |
      (o.wpn === 2 ? 32768 : 0) |
      (o.carry ? 16384 : 0)
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
    if (w === "rifle" || w === "pistol") {
      if (d > 95) return false;
      return K.losClear(_s, _t) || d < 4;
    }
    if (w === "melee" || w === "charge") return d < 4.5;
    return d < 14;
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
      rv: 0,
      rosterKey: "",
      fastT: 0,
    };
    const myId = G.human.id;
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
      if (a.pb.buf[a.pb.buf.length - 1].ts === d.ts / 1000) {
        a.fastAt = t;
        a.body.shield = d.sh;
        const st = d.st;
        NET.applyBits(a.body, st);
        a.firing = !!(st & 4096);
        a.reloading = !!(st & 64);
        a.wpn = st & 32768 ? 2 : st & 8192 ? 1 : 0;
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
        const by = src.by ? src.by.id : myId;
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
      if (t === "kill") e = ["k", id(d.killer), id(d.victim), d.type || "rifle", d.head ? 1 : 0];
      else if (t === "flagTaken") e = ["t", d.flag.team, id(d.by)];
      else if (t === "flagDrop") e = ["d", d.flag.team, id(d.by)];
      else if (t === "flagReturn") e = ["r", d.flag.team, id(d.by)];
      else if (t === "flagReset") e = ["x", d.flag.team];
      else if (t === "capture") e = ["c", d.team, id(d.by)];
      else if (t === "end") e = ["e", d.winner];
      else if (t === "nade")
        e = [
          "n",
          d.type === "plasma" ? 1 : 0,
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
    H.onFx = function (k, a, b, g) {
      if (k !== "nade") return;
      H.fx.push([++H.fxS, "n", ...a, ...b, g | 0]);
      if (H.fx.length > 4) H.fx.shift();
    };
    /** @returns {HostSnapshot} */
    H.snapshot = function () {
      const ST = { home: 0, carried: 1, dropped: 2 };
      const key = G.agents.map(a => a.id).join();
      if (key !== H.rosterKey) {
        H.rosterKey = key;
        H.rv = (H.rv + 1) & 255;
      }
      return {
        id: H.mid,
        rv: H.rv,
        t: r1(G.t),
        tl: G.timeLimit,
        sc: [G.teams[0].score, G.teams[1].score],
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
          for (const t of [0, 1]) {
            const m = G.teams[t].brain.enemyMem.get(a.id);
            if (m && G.t - m.t < 2.5) sp |= 1 << t;
          }
          const fire = loc ? K.now - K.lastFireT < 0.12 : a.remote ? !!a.firing : G.t - a.firedT < 0.12;
          const rl = loc ? K.reloadT > 0 : a.remote ? !!a.reloading : a.reloadT > 0;
          return [
            a.id,
            a.team,
            a.idx,
            r2(b.pos.x),
            r2(b.pos.y),
            r2(b.pos.z),
            r1(b.vel.x),
            r1(b.vel.y),
            r1(b.vel.z),
            r2(b.yaw),
            r2(b.pitch),
            NET.bitsOf(b, {
              reload: rl,
              fire,
              wpn: loc ? K.wi : a.remote ? a.wpn : a.sniper > 0 ? 2 : 0,
              carry: !!a.carrying,
            }),
            Math.ceil(b.shield),
            a.alive ? 0 : 1,
            sp,
            a.name,
            a.k,
            a.d,
          ];
        }),
        ev: H.ev,
        cm: H.cm,
        pu: G.pickups.map(p => [p.id, r1(p.availIn)]),
        br: [...K.DESTR.broken.keys()].slice(0, 40),
      };
    };
    H.tick = function (dt) {
      if (!NET.room) {
        H.agg.clear();
        return;
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
            ts: Math.round(K.now * 1000) >>> 0,
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
                  wpn: loc ? K.wi : a.remote ? a.wpn : a.sniper > 0 ? 2 : 0,
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
      /* presence (events, flags, names, roster) every 1/15 s; at once when the roster changes */
      if (H.sendT > 0 && !rosterChanged) return;
      H.sendT = 1 / 15;
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
        p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)],
      });
    };
    H.snapshotRv = function () {
      const key = G.agents.map(a => a.id).join();
      if (key !== H.rosterKey) {
        H.rosterKey = key;
        H.rv = (H.rv + 1) & 255;
      }
    };
    H.ingest = function (peer, pr) {
      let a = H.remote.get(peer);
      const team = pr.tm === 1 ? 1 : 0;
      const name = K.cleanName(pr.n);
      if (!a) {
        if (H.remote.size >= 7) return;
        a = new CTF.Agent(G, team, 0, name, true, true, "h:" + peer);
        a.peer = peer;
        a.seenHs = -1;
        a.seenFx = -1;
        a.seenDth = -1;
        a.init = false;
        a.spawned = true;
        a.pb = new K.Playback();
        a.fastAt = -9;
        G.addHuman(a, team);
        H.remote.set(peer, a);
        CTF.UI.line("sys", `${name} joined ${CTF.TEAM_NAMES[team]}`);
        K.sfx("stinger", 0.4);
      }
      a.name = name;
      if (a.team !== team) {
        G.moveHuman(a, team);
        CTF.UI.line("sys", `${name} switched to ${CTF.TEAM_NAMES[team]}`);
      }
      /* presence movement only when the fast channel is quiet */
      if (performance.now() / 1000 - a.fastAt > 0.6) {
        NET.readBody(a.body, pr);
        const st = pr.st | 0;
        a.firing = !!(st & 4096);
        a.reloading = !!(st & 64);
        a.wpn = st & 32768 ? 2 : st & 8192 ? 1 : 0;
      }
      if (Array.isArray(pr.br)) K.applyBreaks(pr.br, true, "c:" + peer);
      if (Array.isArray(pr.pk) && a.init) {
        const s = num(pr.pk[0], 0, 1e9);
        if (s > (a.seenPk | 0)) {
          a.seenPk = s;
          const p = G.pickups.find(q => q.id === pr.pk[1]);
          if (
            p &&
            a.alive &&
            Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 2.4 &&
            Math.abs(a.pos.y - p.pos.y) < 2.2
          )
            G.takePickup(p, a);
        }
      } else if (Array.isArray(pr.pk) && !a.init) a.seenPk = num(pr.pk[0], 0, 1e9);
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
        /* lag compensation: check the shot against where the target was on the shooter's screen
           (h[5] = the host-clock time the shooter was seeing), from the match recording */
        let at = null;
        const vt = num(h[5], 0, 4294967295) / 1000;
        if (vt > 0 && K.now - vt < 1) {
          const s = K.REC.sample(K.pidOf(tgt), vt);
          if (s) at = _rw.set(s.x, s.y, s.z);
        }
        if (!tgt || tgt.team === a.team || !NET.plausible(a.body.pos, tgt, w, at)) {
          H.hitStats.bad++;
          continue;
        }
        /* hitscan claims: the shot's ray must start near where we have the shooter and pass
           within reach of the target's body where the shooter saw it */
        if (h.length >= 12 && !NET.rayOk(h.slice(6, 12), a.body.pos, at || tgt.pos, tgt.body.h)) {
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
          if (p && v && v.length() < 45) K.MAIN_NADES.throw(f[8] === 1 ? "plasma" : "frag", p, v, null);
        }
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
    return H;
  };
  const _rw = new V3(),
    _ro = new V3(),
    _rd = new V3(),
    _rc = new V3();
  /** hit-registration rule for a claimed shot: origin within 3.5 m of the shooter as we know them
      (they are drawn up to a few hundred ms behind), and the ray passes within 0.7 m of the target's
      body axis (feet to head) at the time the shooter was seeing it */
  NET.rayOk = function (r, shooterPos, targetPos, h) {
    if (!r.every(v => Number.isFinite(+v))) return false;
    _ro.set(+r[0], +r[1], +r[2]);
    _rd.set(+r[3], +r[4], +r[5]);
    if (_rd.lengthSq() < 0.5) return false;
    _rd.normalize();
    if (_ro.distanceTo(shooterPos) > 3.5 + (K.H_STAND || 1.8)) return false;
    /* closest approach between the ray and the vertical segment of the target's body */
    let best = 1e9;
    for (let k = 0; k <= 8; k++) {
      _rc.copy(targetPos);
      _rc.y += (h * k) / 8;
      const t = Math.max(0, _rc.clone().sub(_ro).dot(_rd));
      best = Math.min(best, _rc.distanceTo(_ro.clone().addScaledVector(_rd, t)));
    }
    return best <= 0.7;
  };
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
      a.wpn === 2 ? 0x9fd8ff : CTF.TEAM_INT[a.team],
      a.wpn === 2 ? 0.6 : 0.1
    );
    if (L < 80) K.spark(end);
    K.sfx(a.wpn === 2 ? "sshot" : a.wpn ? "pshot" : "shot", K.distVol(_o, 80) * 0.7);
  };
})();
