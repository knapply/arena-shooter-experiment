/* ===== CTF online client: mirrors the host's match (agents, flags, events) and reports this player's state ===== */
(function () {
  const K = window.KA,
    T = K.THREE,
    CTF = window.CTF,
    NET = CTF.NET;
  const V3 = T.Vector3,
    num = K.num;
  const r2 = v => Math.round(v * 100) / 100;
  class MirrorAgent {
    constructor(M, id) {
      this.M = M;
      this.id = id;
      this.name = "?";
      this.team = 0;
      this.idx = 0;
      this.human = false;
      this.remote = true;
      this.local = false;
      this.body = new K.Body();
      this.tgt = new V3();
      this.rx = 0;
      this.dead = false;
      this.spawned = true;
      this.carrying = null;
      this.reloadT = 0;
      this.firedT = -9;
      this.firing = false;
      this.wpn = 0;
      this.role = "";
      this.k = 0;
      this.d = 0;
      this.rig = null;
      this.pb = new K.Playback();
      this.fastAt = -9;
    }
    get alive() {
      return !this.dead;
    }
    get pos() {
      return this.body.pos;
    }
    chest(out) {
      return (out || new V3()).copy(this.body.pos).add(new V3(0, this.body.h * 0.68, 0));
    }
    onHit(n, type, head) {
      this.M.queueHit(this.id, n, type, head);
      if (this.rig) this.rig.flashHit(K.me.pos);
      return { died: false, sh: this.body.shield > 0, name: this.name };
    }
  }
  /** rules and mapKey: the host's mode and map (the map is already in use: CTF.useMap) */
  CTF.Mirror = function (hostPeer, mid, myId, team, rules, mapKey) {
    rules = rules || "ctf";
    if (CTF.NAV.mapId !== CTF.MAP.id) CTF.NAV.build(CTF.buildMap().solids);
    K.DESTR.locked = true;
    const stub = t => ({
      team: t,
      plan: { strat: "", lane: 1, staging: false },
      enemyStratGuess: "",
      enemyMem: new Map(),
      say() {},
      leader() {
        return null;
      },
      model: { games: 0 },
    });
    const me = {
      id: myId,
      name: K.myName,
      team,
      idx: 0,
      human: true,
      remote: false,
      local: true,
      body: K.me,
      get alive() {
        return !K.me.dead;
      },
      get pos() {
        return K.me.pos;
      },
      carrying: null,
      k: 0,
      d: 0,
      rig: null,
      dead: false,
      chest(out) {
        return (out || new V3()).copy(K.me.pos).add(new V3(0, K.me.h * 0.68, 0));
      },
    };
    const MD = K.MODE_DATA[CTF.RULES_DATA[rules] || "ctf"];
    const M = {
      t: 0,
      timeLimit: MD.timeLimit,
      scoreLimit: MD.scoreLimit,
      rules,
      mapKey: mapKey || "ctf",
      ffa: rules === "ffa",
      tdm: rules === "ffa" || rules === "slayer",
      flagReset: K.MODE_DATA.ctf.flagReset || 15,
      ballReset: MD.ballReset || 15,
      dropT: 0,
      mode: "play",
      render: true,
      over: false,
      winner: -1,
      hostPeer,
      mid,
      human: me,
      onEvent: null,
      onComms: null,
      nades: new K.NadeWorld(true),
      teams: [
        { team: 0, score: 0, held: 0, agents: [], brain: stub(0) },
        { team: 1, score: 0, held: 0, agents: [], brain: stub(1) },
      ],
      flags: (rules === "ctf" ? [0, 1] : []).map(t => ({
        team: t,
        state: "home",
        pos: CTF.FLAG_HOME[t].clone(),
        carrier: null,
        dropT: 0,
      })),
      /** oddball: the skull as the host last said */
      ball:
        rules === "oddball"
          ? { ball: true, team: -1, state: "incoming", pos: CTF.BALL_HOME.clone(), carrier: null, dropT: 0 }
          : null,
      agents: [me],
      map: new Map(),
      seenEv: -1,
      seenCm: -1,
      pk: null,
      pkS: 0,
      /** weapons and grenades on the floor, from the host */
      items: [],
      ff: true,
      dr: null,
      drS: 0,
      fp: 0,
      fd: 0,
      seenHs: new Map(),
      seenFx: new Map(),
      init: false,
      lastHost: performance.now(),
      hs: [],
      hsS: 0,
      fx: [],
      fxS: 0,
      dth: null,
      dthS: 0,
      sendT: 0,
      fireT: new Map(),
      agg: new Map(),
      rv: -1,
      roster: [],
      pg: null,
      pgS: 0,
      seenPg: -1,
      fastT: 0,
      /** movement as last put in presence, and when (ms) */
      mv: {},
      mvT: -1e9,
    };
    /* the host's movement for everyone arrives on the fast channel, in roster order */
    NET.onFast = function (from, buf) {
      if (from !== M.hostPeer) return;
      const m = K.MSG.decode(buf);
      if (!m || m.name !== "ctfMove" || m.data.rv !== M.rv) return;
      const d = m.data,
        t = performance.now() / 1000,
        ts = d.ts / 1000;
      d.ag.forEach((s, i) => {
        const a = M.map.get(M.roster[i]);
        if (!a) return;
        a.pb.push(ts, { p: s.p, v: s.v, y: s.y, pt: s.pt, st: s.st }, t);
        if (a.pb.buf[a.pb.buf.length - 1].ts !== ts) return;
        a.fastAt = t;
        a.body.shield = s.sh;
        mirrorBits(a, s.st);
        mirrorDead(a, s.dead, s.p);
      });
    };
    M.pickups = CTF.PICKUP_DEFS.map(d => {
      const p = {
        id: d.id,
        type: d.type,
        pos: d.pos.clone(),
        respawn: d.respawn,
        availAt: 0,
        optT: -1e9,
        get avail() {
          return M.t >= p.availAt;
        },
        get availIn() {
          return Math.max(0, p.availAt - M.t);
        },
        take() {
          if (!p.avail) return false;
          p.availAt = M.t + p.respawn;
          p.optT = performance.now();
          M.pk = [++M.pkS, p.id];
          M.newsy = true;
          return true;
        },
      };
      return p;
    });
    /* host migration: if the match host disappears, a player in the match takes over hosting it.
       Everyone picks the same successor: the lowest peer id among the players in it. */
    /** someone else now hosts this match (a successor, or the one left standing when two took
        over at once): follow them. True if we did */
    M.follow = function (now) {
      const nh = NET.ctfPeers().find(
        p => p.presence.ph === "host" && p.presence.H && p.presence.H.id === mid && p.peer !== M.hostPeer
      );
      if (!nh) return false;
      M.hostPeer = nh.peer;
      M.lastHost = now;
      M.rv = -1;
      /* the new host stamps movement on its own clock: start every playback buffer over */
      for (const a of M.map.values()) a.pb = new K.Playback();
      if (M.onEvent) M.onEvent("hostMoved", { name: K.cleanName(nh.presence.n) });
      return true;
    };
    M.succession = function (now) {
      if (M.follow(now)) return;
      /* the host is gone from the room (not just quiet: that is the 8 s timeout below), so the
         successor only waits a moment for the last snapshot in flight */
      if (M.promoting || now - M.lastHost < 300) return;
      const mine = NET.myPeer();
      const cands = [
        mine,
        ...NET.ctfPeers()
          /* everyone in this match, whether still a client or already taking over */
          .filter(p => p.presence.mid === mid || (p.presence.H && p.presence.H.id === mid))
          .map(p => p.peer),
      ];
      /* the lowest peer id among the players in the match: everyone agrees on it from who is in the
         match alone. (It used to prefer the room's backup host, but the backup changes while the room
         itself moves to a new host, so two players could each see themselves as the backup and both
         take over; on slow machines they could also settle on different answers) */
      const succ = cands.filter(Boolean).sort()[0];
      if (mine && succ === mine && M.onPromote) {
        M.promoting = true;
        M.onPromote();
      }
    };
    M.byId = id => (id === myId ? me : M.map.get(id) || null);
    /** a team by index (free-for-all teams appear as the host lists them) */
    const teamAt = t => {
      while (M.teams.length <= t)
        M.teams.push({ team: M.teams.length, score: 0, held: 0, agents: [], brain: stub(M.teams.length) });
      return M.teams[t];
    };
    M.teamAt = teamAt;
    /* hits carry the host-clock time we were seeing the target at, so the host can check the shot
       against where they were on our screen (lag compensation) */
    M.queueHit = function (id, n, w, hd) {
      const tgt = M.map.get(id);
      const pb = tgt && tgt.pb;
      const vt =
        pb && pb.ready
          ? Math.max(0, Math.round((performance.now() / 1000 - pb.offset - pb.delay) * 1000))
          : 0;
      const a = M.agg.get(id);
      if (a) {
        a.d += n;
        a.hd = a.hd || !!hd;
      } else {
        /* hitscan claims carry the shot's ray so the host can re-check it */
        const S = K.SHOT,
          ray =
            K.now - S.t < 0.05
              ? [S.o.x, S.o.y, S.o.z, S.d.x, S.d.y, S.d.z].map(v => Math.round(v * 1000) / 1000)
              : null;
        /* and when we fired, on our clock (the host checks fire rate and aim against our movement) */
        M.agg.set(id, { t: id, d: n, w: w || "rifle", hd: !!hd, vt, ray, ft: Math.round(performance.now()) });
      }
    };
    M.onFx = function (k, a, b, g) {
      const c = NET.fxKind(k);
      if (!c) return;
      M.fx.push([++M.fxS, c, ...a, ...b, g | 0]);
      if (M.fx.length > 4) M.fx.shift();
    };
    M.died = function (src) {
      M.newsy = true;
      M.dth = [
        ++M.dthS,
        src && src.by ? src.by : src && src.agent ? src.agent.id : "",
        String((src && src.w) || "rifle").slice(0, 8),
        src && src.hd ? 1 : 0,
      ];
    };
    M.spawnPoint = function (t) {
      /* the same spawn safety as the host (world/spawns.js), from what this client sees */
      const foes = [...M.map.values()].filter(a => a.team !== t && a.alive).map(a => a.body);
      let pts = M.ffa ? CTF.FFA_SPAWNS : CTF.SPAWNS[t];
      /* joining as the match opens: the host's AI are dropping onto their own spots (CTF.dropSpots) */
      if ((M.t || 0) < K.POD_TIME + 1 && !M.ffa) {
        const held = CTF.dropSpots(t, [...M.map.values()].filter(a => a.team === t && !a.human).length);
        const free = pts.filter(p => !held.includes(p));
        if (free.length) pts = free;
      }
      /* off anyone standing there and any pod coming down (the host's AI pods, other players' pods) */
      const taken = [...M.map.values()].filter(a => a.alive && !a.local).map(a => a.body.pos);
      return K.pickSpawn(pts, foes, [], M.t || 0, Math.random, taken.concat(K.podSpots(null)));
    };
    function mirrorBits(a, st) {
      NET.applyBits(a.body, st);
      a.firing = !!(st & 4096);
      a.wpn = (st & 40960) === 40960 ? 3 : st & 32768 ? 2 : st & 8192 ? 1 : 0;
      if (st & 64) {
        if (a.reloadT <= 0) a.reloadT = K.RELOAD_TIME;
      } else a.reloadT = 0;
    }
    function mirrorDead(a, dead, p) {
      if (dead && !a.dead) a.dead = true;
      else if (!dead && a.dead) {
        a.dead = false;
        if (a.rig) a.rig.revive();
        a.body.pos.set(p[0], p[1], p[2]);
        a.tgt.copy(a.body.pos);
      }
    }
    const evObj = id => M.byId(id) || { name: "?", local: false, human: false, team: -1, pos: new V3() };
    /* ---- read the host's snapshot ---- */
    /** @param {HostSnapshot} Hs untrusted: every field is validated below */
    M.apply = function (Hs) {
      if (!Hs || typeof Hs !== "object" || Hs.id !== mid) return;
      M.lastHost = performance.now();
      const ht = num(Hs.t, 0, 1e5);
      if (Math.abs(ht - M.t) > 1) M.t = ht;
      else M.t += (ht - M.t) * 0.2;
      M.timeLimit = num(Hs.tl, 60, 3600, 480);
      M.scoreLimit = num(Hs.sl, 1, 1e4, M.scoreLimit);
      M.flagReset = num(Hs.fr, 1, 600, M.flagReset);
      M.ballReset = num(Hs.rr, 1, 600, M.ballReset);
      if (Array.isArray(Hs.sc)) Hs.sc.slice(0, 16).forEach((s, t) => (teamAt(t).score = num(s, 0, 9999) | 0));
      if (Array.isArray(Hs.ho)) Hs.ho.slice(0, 2).forEach((s, t) => (teamAt(t).held = num(s, 0, 1e4)));
      const ag = Array.isArray(Hs.ag) ? Hs.ag.slice(0, 16) : [];
      M.rv = Hs.rv | 0;
      M.roster = ag.map(e => (Array.isArray(e) ? String(e[0]) : ""));
      const live = new Set();
      let roster = false;
      for (const e of ag) {
        if (!Array.isArray(e) || !NET.okId(e[0])) continue;
        const id = e[0];
        live.add(id);
        if (id === myId) {
          me.k = num(e[16], 0, 9999) | 0;
          me.d = num(e[17], 0, 9999) | 0;
          /* free-for-all: the host says which pilot slot is yours */
          if (M.ffa) {
            const mt = num(e[1], 0, 15) | 0;
            if (me.team !== mt) {
              me.team = mt;
              roster = true;
            }
          }
          continue;
        }
        let a = M.map.get(id);
        if (!a) {
          a = new MirrorAgent(M, id);
          M.map.set(id, a);
          roster = true;
          a.body.pos.set(num(e[3], -200, 200), num(e[4], -50, 100), num(e[5], -200, 200));
        }
        const tm = M.ffa ? num(e[1], 0, 15) | 0 : e[1] === 1 ? 1 : 0;
        if (a.team !== tm) {
          a.team = tm;
          roster = true;
        }
        a.idx = num(e[2], 0, 15) | 0;
        a.name = K.cleanName(e[15]);
        a.human = id.startsWith("h:");
        a.k = num(e[16], 0, 9999) | 0;
        a.d = num(e[17], 0, 9999) | 0;
        const sp = e[14] | 0;
        if (sp & (1 << me.team)) M.teams[me.team].brain.enemyMem.set(id, { t: M.t, pos: a.body.pos.clone() });
        /* movement from presence only while the fast channel is quiet */
        if (performance.now() / 1000 - a.fastAt < 0.6) continue;
        a.tgt.set(num(e[3], -200, 200), num(e[4], -50, 100), num(e[5], -200, 200));
        a.body.vel.set(num(e[6], -60, 60), num(e[7], -60, 60), num(e[8], -60, 60));
        a.rx = performance.now();
        a.yawT = num(e[9], -1e4, 1e4);
        a.body.pitch = num(e[10], -1.6, 1.6);
        mirrorBits(a, e[11] | 0);
        a.body.shield = num(e[12], 0, 70);
        mirrorDead(a, !!e[13], [a.tgt.x, a.tgt.y, a.tgt.z]);
      }
      for (const [id, a] of M.map)
        if (!live.has(id)) {
          M.map.delete(id);
          if (a.rig) {
            a.rig.root.visible = false;
            a.rig = null;
          }
          roster = true;
        }
      if (roster) {
        for (const tm of M.teams) tm.agents = [];
        teamAt(me.team).agents.push(me);
        for (const a of M.map.values()) teamAt(a.team).agents.push(a);
        M.agents = [me, ...M.map.values()];
        if (M.onEvent) M.onEvent("roster", {});
      }
      if (M.ball && Array.isArray(Hs.bl)) {
        const b = Hs.bl,
          B = M.ball;
        B.state = ["incoming", "home", "carried", "dropped"][b[0] | 0] || "home";
        B.pos.set(num(b[1], -200, 200), num(b[2], -50, 100), num(b[3], -200, 200));
        const c = B.state === "carried" && NET.okId(b[4]) ? M.byId(b[4]) : null;
        if (B.carrier && B.carrier !== c) B.carrier.carrying = null;
        B.carrier = c;
        if (c) c.carrying = B;
        B.dropT = M.t - num(b[5], 0, 600);
      }
      const STS = ["home", "carried", "dropped"];
      if (Array.isArray(Hs.fl) && M.flags.length)
        for (const t of [0, 1]) {
          const f = Hs.fl[t],
            F = M.flags[t];
          if (!Array.isArray(f)) continue;
          F.state = STS[f[0] | 0] || "home";
          F.pos.set(num(f[1], -200, 200), num(f[2], -50, 100), num(f[3], -200, 200));
          const c = F.state === "carried" && NET.okId(f[4]) ? M.byId(f[4]) : null;
          if (F.carrier && F.carrier !== c) F.carrier.carrying = null;
          F.carrier = c;
          if (c) c.carrying = F;
          F.dropT = M.t - num(f[5], 0, 60);
        }
      const ev = Array.isArray(Hs.ev) ? Hs.ev.slice(-8) : [];
      if (!M.init) {
        M.init = true;
        for (const e of ev) M.seenEv = Math.max(M.seenEv, num(e && e[1], 0, 1e9));
        const cm = Array.isArray(Hs.cm) ? Hs.cm : [];
        for (const c of cm) M.seenCm = Math.max(M.seenCm, num(c && c[0], 0, 1e9));
      }
      for (const e of ev) {
        if (!Array.isArray(e)) continue;
        const s = num(e[1], 0, 1e9);
        if (s <= M.seenEv) continue;
        M.seenEv = s;
        M.event(e);
      }
      const cm = Array.isArray(Hs.cm) ? Hs.cm.slice(-5) : [];
      for (const c of cm) {
        if (!Array.isArray(c)) continue;
        const s = num(c[0], 0, 1e9);
        if (s <= M.seenCm) continue;
        M.seenCm = s;
        const from = M.byId(c[2]);
        if (M.onComms)
          M.onComms({
            team: c[1] === 1 ? 1 : 0,
            from: { name: from ? from.name : "?" },
            text: String(c[3] || "")
              .replace(/[\u0000-\u001f]/g, "")
              .slice(0, 90),
          });
      }
      if (Array.isArray(Hs.br)) K.syncBroken(Hs.br);
      if (Array.isArray(Hs.pu))
        for (const u of Hs.pu.slice(0, 4)) {
          if (!Array.isArray(u)) continue;
          const p = M.pickups.find(q => q.id === u[0]);
          if (!p) continue;
          const ai = num(u[1], 0, 600);
          if (performance.now() - p.optT > 1500) {
            p.availAt = M.t + ai;
            if (u[2] != null && K.WEAPON_DATA[u[2] | 0]) p.type = u[2] | 0;
          }
        }
      M.ff = Hs.ff !== 0;
      if (Array.isArray(Hs.it)) {
        const seen = new Set();
        for (const e of Hs.it.slice(0, 16)) {
          if (!Array.isArray(e) || typeof e[0] !== "string" || e[0].length > 12) continue;
          const t = e[1] | 0;
          if (t < -1 || t >= K.WEAPON_DATA.length) continue;
          seen.add(e[0]);
          let it = M.items.find(i => i.id === e[0]);
          if (!it) {
            const pos = K.vec(e.slice(2, 5), new V3());
            if (!pos) continue;
            it = {
              id: e[0],
              type: t,
              pos,
              /* a weapon's rounds, as the host has them (taking it gives you those) */
              ammo:
                t >= 0 && e.length >= 7
                  ? [num(e[5], 0, K.WEAPON_DATA[t].mag) | 0, num(e[6], 0, 999) | 0]
                  : null,
              gone: false,
              optT: 0,
              get avail() {
                return !it.gone;
              },
              availIn: 0,
              take() {
                if (it.gone) return false;
                it.gone = true;
                it.optT = performance.now();
                M.pk = [++M.pkS, it.id];
                M.newsy = true;
                return true;
              },
            };
            M.items.push(it);
          }
        }
        M.items = M.items.filter(i => seen.has(i.id) && (!i.gone || performance.now() - i.optT < 1500));
      }
      if (Hs.ov != null && !M.over) {
        M.over = true;
        M.winner = Number.isInteger(Hs.ov) && Hs.ov >= 0 && Hs.ov < 16 ? Hs.ov : -1;
      }
    };
    M.event = function (e) {
      const k = e[0],
        fl = t => M.flags[t === 1 ? 1 : 0],
        emit = (t, d) => {
          if (M.onEvent) M.onEvent(t, d);
        };
      if (k === "k") {
        const killer = NET.okId(e[2]) ? M.byId(e[2]) : null,
          victim = evObj(e[3]);
        const w = String(e[4] || "rifle").slice(0, 8);
        if (killer === me && victim !== me) K.addKill(w, !!e[5], victim.name);
        emit("kill", {
          killer,
          victim,
          type: w,
          head: !!e[5],
          carried: e[6] === 1 ? "flag" : e[6] === 2 ? "ball" : "",
          denial: e[7] === 1,
        });
      } else if (k === "t") emit("flagTaken", { flag: fl(e[2]), by: evObj(e[3]) });
      else if (k === "d") emit("flagDrop", { flag: fl(e[2]), by: evObj(e[3]) });
      else if (k === "r") emit("flagReturn", { flag: fl(e[2]), by: evObj(e[3]), clutch: e[4] === 1 });
      else if (k === "x") emit("flagReset", { flag: fl(e[2]) });
      else if (k === "c")
        emit("capture", { flag: fl(1 - (e[2] === 1 ? 1 : 0)), by: evObj(e[3]), team: e[2] === 1 ? 1 : 0 });
      else if (k === "e") {
        M.over = true;
        M.winner = Number.isInteger(e[2]) && e[2] >= 0 && e[2] < 16 ? e[2] : -1;
        emit("end", { winner: M.winner });
      } else if (k === "p") {
        const p = K.vec(e.slice(3, 6), new V3());
        if (p) K.dropPod(p, CTF.teamHex(num(e[2], 0, 15) | 0));
      } else if (k === "bt" && M.ball) emit("ballTaken", { by: evObj(e[2]) });
      else if (k === "bd" && M.ball)
        emit("ballDrop", { by: evObj(e[2]), killer: NET.okId(e[3]) ? M.byId(e[3]) : null });
      else if (k === "bp" && M.ball) {
        const p = K.vec(e.slice(2, 5), new V3());
        if (p) emit("ballPod", { pos: p });
      } else if (k === "bs" && M.ball) emit("ballSpawn", { pos: M.ball.pos });
      else if (k === "br" && M.ball) emit("ballReset", {});
      else if (k === "n") {
        const p = K.vec(e.slice(3, 6), new V3()),
          v = K.vec(e.slice(6, 9), new V3());
        if (p && v) {
          if (e[2] === 2) K.remoteProjectile(2, p, v);
          else if (v.length() < 45) {
            M.nades.throw(e[2] === 1 ? "plasma" : "frag", p, v, null);
            /* (the event names no thrower: the pilot it left from throws it) */
            K.rigThrowAt(p);
          }
        }
      }
    };
    /* ---- per frame ---- */
    M.step = function (dt) {
      M.t += dt;
      /* blast gates follow the host clock (online matches play without lab content: always open) */
      K.gatesAt(M.t, false);
      const now = performance.now();
      const host = NET.ctfPeers().find(p => p.peer === M.hostPeer);
      if (host) {
        const hp = host.presence;
        /* teammates' pings, relayed by the host */
        if (Array.isArray(hp.pg)) {
          const fresh = M.seenPg < 0;
          for (const g of hp.pg.slice(-6)) {
            if (!Array.isArray(g)) continue;
            const s = num(g[0], 0, 1e9);
            if (s <= M.seenPg) continue;
            M.seenPg = s;
            if (fresh || g[1] === myId) continue;
            const from = M.byId(g[1]);
            if (!from || from.team !== me.team || !["enemy", "weapon", "place", "danger"].includes(g[2]))
              continue;
            K.addPing({
              by: g[1],
              byName: from.name,
              kind: g[2],
              label: K.cleanName(g[7]).slice(0, 16) || "Here",
              pos: new V3(num(g[3], -500, 500), num(g[4], -50, 100), num(g[5], -500, 500)),
              ref: NET.okId(g[6]) ? M.byId(g[6]) : null,
            });
          }
        }
        if (hp.ph !== "host" || !hp.H || hp.H.id !== mid) {
          if (!M.follow(now)) M.lastHost = Math.min(M.lastHost, performance.now() - 7800);
        } else M.apply(hp.H);
      } else M.succession(now);
      for (const p of NET.ctfPeers()) {
        const pr = p.presence;
        if (pr.mid !== mid) continue;
        const hs = Array.isArray(pr.hs) ? pr.hs.slice(-10) : [];
        let seen = M.seenHs.get(p.peer);
        if (seen == null) {
          seen = -1;
          for (const h of hs) seen = Math.max(seen, num(h && h[0], 0, 1e9));
          M.seenHs.set(p.peer, seen);
        } else
          for (const h of hs) {
            if (!Array.isArray(h)) continue;
            const s = num(h[0], 0, 1e9);
            if (s <= seen) continue;
            seen = s;
            if (h[1] !== myId || K.me.dead) continue;
            const w = String(h[3] || "rifle").slice(0, 8);
            const by = p.peer === M.hostPeer && NET.okId(h[5]) ? h[5] : "h:" + p.peer;
            const shooter = M.byId(by);
            if (shooter && shooter.team === me.team) continue;
            if (shooter && shooter.pos && !NET.plausible(shooter.pos, me, w)) continue;
            const n = K.allowDamage(by, num(h[2], 0, 999), w);
            if (n > 0) K.hurtMe(n, { name: shooter ? shooter.name : "?", by, w, hd: !!h[4] });
          }
        M.seenHs.set(p.peer, seen);
        /* other players' grenades; melee impacts from everyone, the host's AI included */
        {
          const fromHost = p.peer === M.hostPeer;
          const fx = Array.isArray(pr.fx) ? pr.fx.slice(-4) : [];
          let sf = M.seenFx.get(p.peer);
          if (sf == null) {
            sf = -1;
            for (const f of fx) sf = Math.max(sf, num(f && f[0], 0, 1e9));
          } else
            for (const f of fx) {
              if (!Array.isArray(f)) continue;
              const s = num(f[0], 0, 1e9);
              if (s <= sf) continue;
              sf = s;
              if (f[1] === "n" && !fromHost) {
                const q = K.vec(f.slice(2, 5), new V3()),
                  v = K.vec(f.slice(5, 8), new V3());
                if (q && v) K.remoteProjectile(f[8] | 0, q, v);
              } else if (f[1] === "m") {
                const q = K.vec(f.slice(2, 5), new V3()),
                  v = K.vec(f.slice(5, 8), new V3());
                if (q && v) K.meleeImpact(q, v, (f[8] | 0) & 15);
              } else if (f[1] === "p" || f[1] === "q") NET.remotePod(M.byId("h:" + p.peer), f);
            }
          M.seenFx.set(p.peer, sf);
        }
      }
      const tnow = now / 1000;
      for (const a of M.map.values()) {
        const b = a.body;
        if (tnow - a.fastAt < 1 && a.pb.sample(tnow, _pbs)) {
          /* fast channel: timestamped playback */
          _p.set(_pbs.x, _pbs.y, _pbs.z);
          if (b.pos.distanceTo(_p) > 4) b.pos.copy(_p);
          else b.pos.lerp(_p, 1 - Math.exp(-60 * dt));
          b.vel.set(_pbs.vx, _pbs.vy, _pbs.vz);
          b.yaw = _pbs.yaw;
          b.pitch = _pbs.pitch;
        } else {
          const age = Math.min(0.15, (now - a.rx) / 1000);
          _p.copy(a.tgt).addScaledVector(b.vel, age);
          if (b.pos.distanceTo(_p) > 6) b.pos.copy(_p);
          else b.pos.lerp(_p, 1 - Math.exp(-16 * dt));
          if (a.yawT != null) {
            const d = Math.atan2(Math.sin(a.yawT - b.yaw), Math.cos(a.yawT - b.yaw));
            b.yaw += d * Math.min(1, dt * 15);
          }
        }
        if (a.reloadT > 0) a.reloadT = Math.max(0.01, a.reloadT - dt);
        if (a.firing && a.alive) {
          a.firedT = M.t;
          CTF.drawFire(a, dt, M.fireT);
        }
      }
      M.nades.step(dt);
      if (performance.now() - M.lastHost > 8000 && !M.over && !M.promoting) {
        M.over = true;
        M.hostGone = true;
        M.winner = -1;
        if (M.onEvent) M.onEvent("hostLeft", {});
      }
      const m = K.me;
      const fast = NET.room && typeof NET.room.fast === "function";
      M.fastT -= dt;
      if (fast && M.fastT <= 0) {
        M.fastT = 1 / 30;
        NET.room.fast(
          K.MSG.encode("ctfClient", {
            ts: Math.round(performance.now()) >>> 0,
            p: m.pos,
            v: m.vel,
            y: m.yaw,
            pt: m.pitch,
            st: NET.bitsOf(m, {
              reload: K.reloadT > 0,
              fire: K.now - K.lastFireT < 0.12,
              wpn: K.wi,
              carry: !!me.carrying,
            }),
            sh: Math.ceil(m.shield),
            dead: m.dead,
          }),
          M.hostPeer
        );
      }
      M.sendT -= dt;
      /* hits, grenades, deaths and pickups go out at once; otherwise presence ~15 times a second */
      if (M.sendT > 0 && !M.agg.size && !M.newsy) return;
      M.newsy = false;
      M.sendT = 1 / 15;
      for (const v of M.agg.values())
        M.hs.push([
          ++M.hsS,
          v.t,
          Math.round(v.d),
          v.w,
          v.hd ? 1 : 0,
          v.vt,
          ...(v.ray ? [...v.ray, v.ft] : []),
        ]);
      M.agg.clear();
      while (M.hs.length > 10) M.hs.shift();
      /* movement rides the fast channel to the host; presence repeats it once a second as a fallback */
      const tn = performance.now();
      if (!fast || tn - M.mvT >= 1000) {
        M.mvT = tn;
        M.mv = {
          p: [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z)],
          v: [r2(m.vel.x), r2(m.vel.y), r2(m.vel.z)],
          y: r2(m.yaw),
          pt: r2(m.pitch),
          st: NET.bitsOf(m, {
            reload: K.reloadT > 0,
            fire: K.now - K.lastFireT < 0.12,
            wpn: K.wi,
            carry: !!me.carrying,
          }),
          sh: Math.ceil(m.shield),
        };
      }
      NET.send({
        ph: "client",
        mid,
        tm: me.team,
        ...M.mv,
        dd: m.dead ? 1 : 0,
        hs: M.hs,
        fx: M.fx,
        dth: M.dth,
        pk: M.pk,
        pg: M.pg,
        dr: M.dr,
        fp: M.fp,
        fd: M.fd,
        br: K.DESTR.recent.slice(),
      });
    };
    const _p = new V3(),
      _pbs = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, s: null };
    M.step = K.timed("ctf.client.step", M.step);
    M.apply = K.timed("ctf.client.apply", M.apply);
    NET.onFast = K.timed("ctf.client.fast", NET.onFast);
    return M;
  };
})();
