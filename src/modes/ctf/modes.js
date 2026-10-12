/* ===== CTF modes: Play (you + 3 AI vs 4 AI) and AI-vs-AI simulation with director camera, intel and training ===== */
(function () {
  const K = window.KA,
    T = K.THREE,
    CTF = window.CTF,
    UI = CTF.UI,
    $ = K.$;
  const V3 = T.Vector3;
  const TN = CTF.TEAM_NAMES;
  /* wall-clock delta: game time stops while paused, but match-end countdowns must not */
  let wallLast = 0;
  const wallDt = () => {
    const t = performance.now(),
      d = wallLast ? Math.min(0.25, (t - wallLast) / 1000) : 0;
    wallLast = t;
    return d;
  };
  let G = null,
    mode = null,
    overT = 0,
    speed = 1,
    acc = 0,
    camMode = "director",
    focus = null,
    focusT = 0,
    followIdx = 0,
    snap = true,
    training = null,
    potgDone = false,
    postShown = false,
    intelT = 0,
    orbit = 0;
  const cpos = new V3(),
    clook = new V3(),
    _a = new V3(),
    _b = new V3(),
    _c = new V3(),
    _d = new V3();
  function pct(a, b) {
    return a / (a + b);
  }

  /* ---------------- play: offline, online host, or online client ---------------- */
  let myTeam = 0;
  myTeam = K.STORE.load("ctfTeam") === 1 ? 1 : 0;
  function setTeamPick(t) {
    myTeam = t;
    K.STORE.save("ctfTeam", t);
    $("ctfRed").setAttribute("aria-pressed", String(t === 0));
    $("ctfBlue").setAttribute("aria-pressed", String(t === 1));
    if (mode !== "play") {
      CTF.NET.base.tm = t;
      CTF.NET.send({});
    }
  }
  $("ctfRed").onclick = () => setTeamPick(0);
  $("ctfBlue").onclick = () => setTeamPick(1);
  setTeamPick(myTeam);
  function lobbyText() {
    const N = CTF.NET;
    const el = $("ctfNet");
    if (!N.room) {
      el.textContent = "Host or join a room above to play CTF online. Offline matches work now.";
      $("ctfPlay").textContent = "Play CTF";
      return;
    }
    const h = N.liveHost(),
      others = N.ctfPeers().length;
    if (h) {
      el.textContent = `${h.name} is hosting · ${h.players} player${h.players > 1 ? "s" : ""} in the match. Pick a team and join.`;
      $("ctfPlay").textContent = "Join match";
    } else {
      el.textContent = others
        ? `${others} other pilot${others > 1 ? "s" : ""} here. Start a match and they can join.`
        : "No one else here yet. Start a match and friends who open this page can join it.";
      $("ctfPlay").textContent = "Play CTF";
    }
  }
  setInterval(() => {
    if (mode) return;
    CTF.NET.base.n = K.cleanName($("callsign").value);
    lobbyText();
  }, 1000);
  CTF.NET.onPeers = () => {
    if (!mode) lobbyText();
  };
  function placeMe(team) {
    const s = G.spawnPoint(team);
    const m = K.me;
    m.reset();
    m.pos.set(s[0], s[1] + 0.02, s[2]);
    m.yaw = team === 0 ? Math.PI : 0;
    m.pitch = 0;
    m.spawnT = K.now;
  }
  function roster(tb) {
    tb.textContent = "";
    for (const tm of G.teams)
      for (const a of tm.agents) {
        const tr = document.createElement("tr");
        if (a.local) tr.className = "me";
        const n = document.createElement("td");
        const sw = document.createElement("span");
        sw.className = "sw2";
        sw.style.background = CTF.TEAM_HEX[a.team];
        n.append(
          sw,
          document.createTextNode(
            a.name + (a.local ? " (you)" : a.human ? " · player" : "") + (a.caps ? ` · ${a.caps} cap` : "")
          )
        );
        if (a.human && !a.local) n.appendChild(K.pingBars(K.pingOf(String(a.id).slice(2))));
        const k = document.createElement("td");
        k.textContent = String(a.local ? K.kills : a.k);
        const d = document.createElement("td");
        d.textContent = String(a.local ? K.deaths : a.d);
        tr.append(n, k, d);
        tb.appendChild(tr);
      }
  }
  function afterSwitch(t) {
    myTeam = t;
    K.STORE.save("ctfTeam", t);
    K.setArmor(CTF.TEAM_HEX[t]);
    if (!K.me.dead) K.EXT.respawn();
    UI.rigAll();
    UI.line("sys", `You switched to ${TN[t]}.`);
    K.say(`${TN[t]} team`, true);
  }
  function startPlay() {
    CTF.NET.base.n = K.cleanName($("callsign").value);
    CTF.NET.base.tm = myTeam;
    const h = CTF.NET.room ? CTF.NET.liveHost() : null;
    if (h) startClient(h);
    else startHost();
    $("swTeam").hidden = false;
  }
  function startHost() {
    const diff = $("botSkill").value;
    CTF.enterMap();
    mode = "play";
    overT = 0;
    potgDone = false;
    postShown = false;
    const myId = "h:" + (CTF.NET.myPeer() || "local");
    G = CTF.Game({ mode: "play", render: true, diff: [diff, diff], humanTeam: myTeam, humanId: myId });
    UI.attach(G, "play");
    UI.quiet = false;
    UI.onEvent = null;
    const host = CTF.Host(G);
    host.wrap();
    K.extPlay(hostExt(host), { color: CTF.TEAM_HEX[myTeam] });
    G.human.name = K.myName;
    G.start();
    ctfIntro();
    UI.line(
      "sys",
      `You're on ${TN[myTeam]}. Bring the enemy flag to your stand while yours is home. J or D-pad up switches teams.`
    );
    if (CTF.NET.room) UI.line("sys", "Friends in your room can join from the menu.");
    K.say("Capture the flag", true);
  }
  /** the flag prompt: standing at the enemy flag, hold Interact to take it */
  function flagPrompt(me, take) {
    if (!G || !me || !me.alive || me.carrying) return null;
    const f = G.flags[1 - me.team];
    if (f.state === "carried" || me.pos.distanceTo(f.pos) > 1.8) return null;
    return [{ label: "take the flag", hold: 0.3, go: take }];
  }
  /** motion tracker contacts: everyone but you; teammates always, enemies only when loud */
  function radarOf(list) {
    const out = [];
    for (const a of list)
      if (!a.local && a.alive)
        out.push({
          pos: a.body.pos,
          vel: a.body.vel,
          firing: a.firing || G.t - (a.firedT || -9) < 0.5,
          ally: a.team === G.human.team,
        });
    return out;
  }
  function ctfIntro() {
    if (!K.SET.intros) return;
    const names = [0, 1].map(t => G.teams[t].agents.map(a => (a.local ? K.myName : a.name)).slice(0, 4));
    K.playIntro(K.MAPS.ctf, {
      mode: K.MODE_DATA.ctf.name,
      limit: `First to ${G.scoreLimit}`,
      teams: names,
      teamNames: TN,
      teamColors: CTF.TEAM_HEX,
    });
  }
  /** everyone in the match for the stats screens (game/stats.js): stable ids, teams, score of record */
  function rosterOf(list) {
    return list.map(a => {
      const me = a === G.human;
      return {
        id: K.pidOf(a),
        name: a.name,
        team: a.team,
        k: me ? K.kills : a.k,
        d: me ? K.deaths : a.d,
        me,
      };
    });
  }
  /** a steered drop pod stays near your own base: within 26 m of your flag stand, on your half */
  function podZone(team) {
    const h = CTF.FLAG_HOME[team];
    return {
      r: 12,
      ok: (x, z) => Math.hypot(x - h.x, z - h.z) <= 26 && Math.sign(z) === Math.sign(h.z),
    };
  }
  /** who holds a power weapon, for the marks and callouts (ui/power.js) */
  function holdersOf(list) {
    const me = G && G.human;
    if (!me) return [];
    const out = [];
    for (const a of list)
      if (a.alive && a !== me && (a.sniper > 0 || a.rocket > 0 || a.wpn >= 2))
        out.push({
          id: a.id,
          pid: K.pidOf(a),
          name: a.name,
          pos: a.body.pos,
          h: a.body.h,
          key: a.rocket > 0 || a.wpn === 3 ? "rocket" : "sniper",
          enemy: a.team !== me.team,
        });
    return out;
  }
  /** the engine hooks for hosting a match (fresh, or taken over from a host who left) */
  function hostExt(host) {
    return {
      respawnDelay: K.MODE_DATA.ctf.respawn,
      respawn() {
        placeMe(G.human.team);
        G.human.carrying = null;
      },
      targets() {
        const out = [];
        for (const a of G.agents)
          if (a.alive && a !== G.human && (G.ff || a.team !== G.human.team))
            out.push({ kind: "ext", ref: a, pos: a.body.pos, h: a.body.h });
        return out;
      },
      dropItems: (list, at) => G && G.addItems(list, at),
      spawnPoint: () => G.spawnPoint(G.human.team),
      podZone: () => podZone(G.human.team),
      carrying: () => !!(G && G.human.carrying),
      dropFlag: () => G && G.dropFlagBy(G.human),
      interactables: () => flagPrompt(G.human, () => G.humanTakeFlag(G.human)),
      radar: () => radarOf(G.agents),
      roster: () => rosterOf(G.agents),
      powerHolders: () => holdersOf(G.agents),
      onPing: p =>
        host.ping(G.human, {
          kind: p.kind,
          label: p.label,
          pos: [p.pos.x, p.pos.y, p.pos.z],
          target: p.ref && p.ref.id ? p.ref.id : null,
        }),
      tick(dt) {
        if (!G) return;
        /* the match clock holds while the intro plays */
        if (!K.INTRO.active) G.step(dt);
        host.tick(dt);
        UI.frame(dt);
        if (G.over) {
          if (!overT) showBanner();
          overT += wallDt();
          if (overT > 1.5 && !potgDone) {
            potgDone = true;
            K.playOfTheGame(() => ($("cBanner").hidden = false));
          }
          /* then the results screen (ui/stats-ui.js) */
          if (overT > 2.5 && potgDone && !K.HL.playing && !postShown) showResults();
        }
      },
      onPlayerDeath(src) {
        G.kill(G.human, (src && src.agent) || null, src && src.w, src && src.hd);
      },
      onFx: (k, a, b, g) => host.onFx(k, a, b, g),
      pickups: () => (G ? G.pickups.concat(G.items) : []),
      switchTeam() {
        const t = 1 - G.human.team;
        G.moveHuman(G.human, t);
        afterSwitch(t);
      },
      scores: roster,
      exit() {
        $("cBanner").hidden = true;
        CTF.NET.send({ ph: "menu", mid: null, H: null, hs: null, fx: null, p: null });
        UI.detach();
        CTF.exitMap();
        G = null;
        mode = null;
        $("swTeam").hidden = true;
      },
    };
  }
  /* host migration: the old host left and we are the successor. Rebuild a real match from what our
     mirror knew (time, score, flags, every agent's place, kills and deaths) and start hosting it
     under the same match id, so the other players carry on without rejoining. */
  function promote(M) {
    const broken = [...K.DESTR.broken.keys()];
    const snap = {
      t: M.t,
      tl: M.timeLimit,
      sc: [M.teams[0].score, M.teams[1].score],
      ag: [...M.map.values()]
        .filter(a => !a.human)
        .map(a => ({
          id: a.id,
          team: a.team,
          idx: a.idx,
          name: a.name,
          p: a.body.pos.clone(),
          y: a.body.yaw,
          k: a.k,
          d: a.d,
          dead: a.dead,
        })),
      fl: M.flags.map(f => ({
        state: f.state,
        p: f.pos.clone(),
        by: f.carrier ? f.carrier.id : null,
        dropT: f.dropT,
      })),
      pu: M.pickups.map(p => p.availIn),
      me: { k: M.human.k, d: M.human.d, team: M.human.team, id: M.human.id },
    };
    UI.detach();
    K.DESTR.locked = false;
    const diff = $("botSkill").value;
    G = CTF.Game({
      mode: "play",
      render: true,
      diff: [diff, diff],
      humanTeam: snap.me.team,
      humanId: snap.me.id,
    });
    G.human.name = K.myName;
    G.start();
    K.syncBroken(broken);
    G.t = snap.t;
    G.timeLimit = snap.tl;
    G.teams[0].score = snap.sc[0];
    G.teams[1].score = snap.sc[1];
    G.human.k = snap.me.k;
    G.human.d = snap.me.d;
    const byOld = new Map([[snap.me.id, G.human]]);
    for (const t of [0, 1]) {
      const mine = G.teams[t].agents.filter(a => !a.human);
      const old = snap.ag.filter(a => a.team === t).sort((a, b) => a.idx - b.idx);
      mine.forEach((a, i) => {
        const o = old[i];
        if (!o) return;
        byOld.set(o.id, a);
        a.name = o.name;
        a.body.pos.copy(o.p);
        a.body.yaw = o.y;
        a.k = o.k;
        a.d = o.d;
        if (o.dead) {
          a.dead = true;
          a.respawnAt = G.t + 3;
        }
      });
    }
    snap.fl.forEach((f, t) => {
      const F = G.flags[t];
      const c = f.by ? byOld.get(f.by) : null;
      if (f.state === "carried" && c) {
        F.state = "carried";
        F.carrier = c;
        c.carrying = F;
      } else if (f.state !== "home") {
        /* carried by someone we can't map yet (another player): drop it where it was */
        F.state = "dropped";
        F.dropT = f.state === "dropped" ? f.dropT : G.t;
      }
      F.pos.copy(f.p);
    });
    G.pickups.forEach((p, i) => (p.availAt = G.t + (snap.pu[i] || 0)));
    UI.attach(G, "play");
    UI.quiet = false;
    UI.onEvent = null;
    const host = CTF.Host(G);
    host.mid = M.mid;
    host.wrap();
    Object.assign(K.EXT, hostExt(host));
    UI.line("sys", "The host left. You're hosting the match now.");
    K.say("You are the host", true);
  }
  function startClient(h) {
    CTF.enterMap();
    mode = "play";
    overT = 0;
    potgDone = false;
    postShown = false;
    const myId = "h:" + CTF.NET.myPeer();
    G = CTF.Mirror(h.peer, h.mid, myId, myTeam);
    const M = G;
    M.onPromote = () => {
      if (G === M) promote(M);
    };
    UI.attach(G, "play");
    UI.quiet = false;
    UI.onEvent = (t, d) => {
      if (t === "hostMoved") UI.line("sys", `The host left. ${d.name} is hosting the match now.`);
      if (t === "hostLeft") {
        $("cBanT").textContent = "Host left";
        $("cBanT").style.color = "";
        $("cBanS").textContent = "The match ended because the host left. Returning to menu.";
        $("cBanner").hidden = false;
      }
    };
    const ext = {
      respawnDelay: K.MODE_DATA.ctf.respawn,
      respawn() {
        placeMe(G.human.team);
      },
      targets() {
        const out = [];
        for (const a of G.map.values())
          if (a.alive && a !== G.human && (G.ff || a.team !== G.human.team))
            out.push({ kind: "ext", ref: a, pos: a.body.pos, h: a.body.h });
        return out;
      },
      dropItems(list, at) {
        G.dr = [
          ++G.drS,
          +at.x.toFixed(2),
          +at.y.toFixed(2),
          +at.z.toFixed(2),
          list.map(o =>
            o.type < 0
              ? [-1, 0, 0, o.nades.frag, o.nades.plasma]
              : [o.type, o.ammo[0], o.ammo[1] === Infinity ? -1 : o.ammo[1], 0, 0]
          ),
        ];
        G.newsy = true;
      },
      carrying: () => !!(G && G.human.carrying),
      spawnPoint: () => G.spawnPoint(G.human.team),
      podZone: () => podZone(G.human.team),
      dropFlag() {
        G.fd++;
        G.newsy = true;
      },
      interactables: () =>
        flagPrompt(G.human, () => {
          G.fp++;
          G.newsy = true;
        }),
      radar: () => radarOf([...G.map.values()]),
      roster: () => rosterOf([...G.map.values()]),
      powerHolders: () => holdersOf([...G.map.values()]),
      onPing: p => {
        G.pg = [
          ++G.pgS,
          p.kind,
          +p.pos.x.toFixed(2),
          +p.pos.y.toFixed(2),
          +p.pos.z.toFixed(2),
          p.ref && p.ref.id ? p.ref.id : "",
          p.label,
        ];
        G.newsy = true;
      },
      tick(dt) {
        if (!G) return;
        G.step(dt);
        UI.frame(dt);
        if (G.over) {
          if (!overT && !G.hostGone) showBanner();
          overT += wallDt();
          if (overT > 1.5 && !potgDone && !G.hostGone) {
            potgDone = true;
            K.playOfTheGame(() => ($("cBanner").hidden = false));
          }
          if (G.hostGone) {
            if (overT > 3) K.extStop();
          } else if (overT > 2.5 && potgDone && !K.HL.playing && !postShown) showResults();
        }
      },
      onPlayerDeath(src) {
        G.died(src);
      },
      onFx: (k, a, b, g) => G.onFx(k, a, b, g),
      pickups: () => (G ? G.pickups.concat(G.items) : []),
      switchTeam() {
        const t = 1 - G.human.team;
        G.human.team = t;
        for (const tm of G.teams) tm.agents = tm.agents.filter(a => a !== G.human);
        G.teams[t].agents.push(G.human);
        afterSwitch(t);
      },
      scores: roster,
      exit() {
        $("cBanner").hidden = true;
        CTF.NET.send({ ph: "menu", mid: null, hs: null, fx: null, dth: null, p: null, v: null });
        UI.detach();
        CTF.exitMap();
        G = null;
        mode = null;
        $("swTeam").hidden = true;
      },
    };
    K.extPlay(ext, { color: CTF.TEAM_HEX[myTeam] });
    G.human.name = K.myName;
    /* joining as the match begins: the same intro the host is watching */
    if (G.t < 2) ctfIntro();
    UI.line("sys", `Joined ${h.name}'s match on ${TN[myTeam]}. J or D-pad up switches teams.`);
    K.say("Capture the flag", true);
  }
  $("swTeam").onclick = () => {
    const e = K.EXT;
    if (e && e.switchTeam) {
      e.switchTeam();
      $("resume").click();
    }
  };

  /* ---------------- simulation ---------------- */
  function newMatch() {
    if (G) {
      UI.detach();
    }
    G = CTF.Game({ mode: "sim", render: true, diff: ["legendary", "legendary"] });
    UI.attach(G, "sim");
    UI.onEvent = simEvent;
    UI.quiet = speed > 2;
    UI.extraHud = null;
    overT = 0;
    potgDone = false;
    postShown = false;
    focus = null;
    focusT = 0;
    snap = true;
    G.start();
    UI.line(
      "sys",
      `Match ${G.teams[0].brain.model.games + 1}. Both teams load what they learned from earlier matches.`
    );
    intelT = 0;
  }
  function startSim() {
    CTF.enterMap();
    mode = "sim";
    speed = 1;
    setSpeed(1);
    const ext = {
      full: simFrame,
      pickups: () => (G ? G.pickups : []),
      exit() {
        $("cBanner").hidden = true;
        if (training) {
          training.cancel();
          training = null;
          $("cTrn").textContent = "Train 10 matches";
        }
        UI.detach();
        $("ctfHud").hidden = true;
        CTF.exitMap();
        G = null;
        mode = null;
      },
    };
    K.extFull(ext);
    K.camera.fov = 70;
    K.camera.updateProjectionMatrix();
    newMatch();
    K.say("Simulation online", true);
  }
  /* the director cuts to big moments, in slow motion when it's a capture or a multikill */
  const recentKills = new Map();
  function simEvent(type, d) {
    if (!G || mode !== "sim") return;
    if (type === "flagTaken" || type === "capture") {
      focus = d.by;
      focusT = 6;
      pickShot(true);
      snap = true;
      if (camMode === "director")
        K.CINE.slowmo(type === "capture" ? 0.3 : 0.45, type === "capture" ? 1.4 : 0.9);
    } else if (type === "kill") {
      if (d.victim === focus) focusT = Math.min(focusT, 1.6);
      const k = d.killer;
      if (k) {
        const ks = (recentKills.get(k) || []).filter(t => G.t - t < 4);
        ks.push(G.t);
        recentKills.set(k, ks);
        if (ks.length >= 2 && camMode === "director") {
          focus = k;
          focusT = 4;
          pickShot(true);
          snap = true;
          K.CINE.slowmo(0.4, 1);
        }
      }
    } else if (type === "end") showBanner();
  }
  function simFrame(dt) {
    if (G && !training) {
      acc += dt * speed;
      let n = 0;
      while (acc >= 1 / 60 && n < speed * 3) {
        G.step(1 / 60);
        acc -= 1 / 60;
        n++;
      }
      if (n >= speed * 3) acc = 0;
      UI.frame(Math.min(0.05, dt * speed));
      if (G.over) {
        overT += wallDt();
        if (overT > 7) newMatch();
      }
    }
    K.updFX(dt);
    K.updPickups(dt);
    camera(dt);
    intelT -= dt;
    if (intelT <= 0) {
      intelT = 0.5;
      renderIntel();
    }
    K.renderFrame();
  }
  /* ---------------- director camera ---------------- */
  function pickFocus() {
    const carriers = G.flags.map(f => f.carrier).filter(Boolean);
    if (carriers.length)
      return carriers.sort(
        (a, b) => a.pos.distanceTo(CTF.FLAG_HOME[a.team]) - b.pos.distanceTo(CTF.FLAG_HOME[b.team])
      )[0];
    const fighters = G.agents.filter(a => a.alive && a.target && G.t >= a.acqT);
    if (fighters.length) return fighters[(Math.random() * fighters.length) | 0];
    const live = G.agents.filter(a => a.alive && (a.role === "attack" || a.role === "mid"));
    return live[(Math.random() * live.length) | 0] || G.agents[0];
  }
  /* ---------------- director shots ---------------- */
  const SHOTS = ["track", "shoulder", "low", "orbit"];
  let shotType = "track",
    shotT = 0;
  function pickShot(big) {
    shotT = 0;
    if (big) shotType = "orbit";
    else {
      const opts = SHOTS.filter(s => s !== shotType);
      shotType = opts[(Math.random() * opts.length) | 0];
    }
  }
  function directorShot(f, dt) {
    shotT += dt;
    const b = f.body;
    if (shotType === "shoulder") return K.CINE.track(f, 2.7, 0.85, 1.95, 7)();
    if (shotType === "low") {
      /* in front and to the side, near the floor, looking up at them */
      const fx = -Math.sin(b.yaw),
        fz = -Math.cos(b.yaw);
      const p = _c.set(b.pos.x + fx * 4.2 + fz * 1.8, b.pos.y + 0.45, b.pos.z + fz * 4.2 - fx * 1.8);
      const dir = p.clone().sub(_d.set(b.pos.x, b.pos.y + 1, b.pos.z));
      const L = dir.length();
      const hit = K.rayWorld(_d, dir.multiplyScalar(1 / L), L);
      if (hit < L) return K.CINE.track(f, 5.5, 1.6, 2.6, 3)();
      return { p: p.clone(), l: new V3(b.pos.x, b.pos.y + 1.5, b.pos.z) };
    }
    if (shotType === "orbit")
      return K.CINE.orbit(
        _d.set(b.pos.x, b.pos.y + 1.1, b.pos.z).clone(),
        6.5,
        2.6,
        b.yaw + 0.8,
        0.35
      )(shotT);
    return K.CINE.track(f, 5.5, 1.6, 2.6, 3)();
  }
  /* ---------------- tactical camera ---------------- */
  const TAC = { yaw: -Math.PI / 2, pitch: 0.8, dist: 86, at: new V3(0, 0, 0), drag: null, pinch: 0 };
  const tacClamp = () => {
    TAC.pitch = Math.max(0.2, Math.min(1.45, TAC.pitch));
    TAC.dist = Math.max(14, Math.min(130, TAC.dist));
  };
  function tacPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && [...pads].find(x => x && x.connected);
    if (!g) return;
    const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
    TAC.yaw -= dz(g.axes[2] || 0) * dt * 2;
    TAC.pitch += dz(g.axes[3] || 0) * dt * 1.4;
    const zt = ((g.buttons[7] && g.buttons[7].value) || 0) - ((g.buttons[6] && g.buttons[6].value) || 0);
    TAC.dist *= Math.exp(-zt * dt * 1.5);
    tacClamp();
  }
  {
    const cv = $("game");
    const on = () => mode === "sim" && camMode === "tactical";
    cv.addEventListener("pointerdown", e => {
      if (!on()) return;
      TAC.drag = { x: e.clientX, y: e.clientY };
    });
    addEventListener("pointermove", e => {
      if (!on() || !TAC.drag) return;
      TAC.yaw -= (e.clientX - TAC.drag.x) * 0.006;
      TAC.pitch += (e.clientY - TAC.drag.y) * 0.004;
      TAC.drag = { x: e.clientX, y: e.clientY };
      tacClamp();
    });
    addEventListener("pointerup", () => (TAC.drag = null));
    cv.addEventListener(
      "wheel",
      e => {
        if (!on()) return;
        e.preventDefault();
        TAC.dist *= Math.exp(e.deltaY * 0.001);
        tacClamp();
      },
      { passive: false }
    );
    cv.addEventListener(
      "touchmove",
      e => {
        if (!on() || e.touches.length !== 2) return;
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (TAC.pinch) TAC.dist *= TAC.pinch / d;
        TAC.pinch = d;
        tacClamp();
        e.preventDefault();
      },
      { passive: false }
    );
    cv.addEventListener("touchend", () => (TAC.pinch = 0));
  }
  /* for tests and tools: the spectator camera's state */
  CTF.spectator = {
    get tac() {
      return TAC;
    },
    get shot() {
      return shotType;
    },
    get mode() {
      return camMode;
    },
    event: simEvent,
  };
  function camera(dt) {
    const cam = K.camera;
    if (!G || training) {
      orbit += dt * 0.06;
      _a.set(Math.sin(orbit) * 55, 48, Math.cos(orbit) * 70);
      _b.set(0, 0, 0);
      cam.position.lerp(_a, 1 - Math.exp(-2 * dt));
      cam.lookAt(_b);
      return;
    }
    let want = _a,
      look = _b;
    if (camMode === "tactical") {
      /* free orbit around the map: drag or right stick to turn, wheel, pinch or triggers to zoom */
      tacPad(dt);
      const cp = Math.cos(TAC.pitch);
      want.set(
        TAC.at.x + Math.sin(TAC.yaw) * cp * TAC.dist,
        TAC.at.y + Math.sin(TAC.pitch) * TAC.dist,
        TAC.at.z + Math.cos(TAC.yaw) * cp * TAC.dist
      );
      look.copy(TAC.at);
    } else {
      let f;
      if (camMode === "follow") f = G.agents[followIdx];
      else {
        focusT -= dt;
        if (!focus || focusT <= 0 || (!focus.alive && focusT > 1.6)) {
          const nf = pickFocus();
          if (nf !== focus) {
            if (focus && nf.pos.distanceTo(focus.pos) > 25) snap = true;
            focus = nf;
          }
          focusT = 6;
          /* a new subject gets a new kind of shot */
          pickShot(false);
          snap = true;
        }
        f = focus;
      }
      /* the director varies its shots: chase, close over the shoulder, low angle, orbit */
      const s = camMode === "follow" ? K.CINE.track(f, 5.5, 1.6, 2.6, 3)() : directorShot(f, dt);
      want.copy(s.p);
      look.copy(s.l);
    }
    if (snap) {
      cpos.copy(want);
      clook.copy(look);
      snap = false;
    } else {
      cpos.lerp(want, 1 - Math.exp(-(camMode === "tactical" ? 2 : 4.5) * dt));
      clook.lerp(look, 1 - Math.exp(-7 * dt));
    }
    cam.position.copy(cpos);
    cam.lookAt(clook);
  }
  /* ---------------- intel panel ---------------- */
  function bar(label, v, txt, cur) {
    return `<div class="irow${cur ? " cur" : ""}"><span>${label}</span><div class="ibar"><b style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></b></div><em>${txt}</em></div>`;
  }
  function renderIntel() {
    const el = $("cIntel");
    if (!$("ctfHud").classList.contains("intel")) return;
    if (training) {
      el.innerHTML = `<div id="cTrain"><div class="ilab">Training · headless matches at full speed</div><div class="ibar"><b style="width:${Math.round((training.i / training.n) * 100)}%"></b></div>
    <div class="inote">${training.i} of ${training.n} done · Red ${training.res[0]} · Blue ${training.res[1]} · Draws ${training.res[2]}</div><div class="inote">Both teams update strategy odds, lane reads, strafe prediction and play style after every match.</div></div>`;
      return;
    }
    if (!G) return;
    let h = "";
    for (const t of [0, 1]) {
      const br = G.teams[t].brain,
        m = br.model;
      const guess = br.enemyStratGuess;
      const cls = t ? "b" : "r";
      h += `<div class="itm ${cls}"><h3>${TN[t]}<small>${m.wins} W · ${m.games - m.wins} L/D · ${m.games} games</small></h3>`;
      h += `<div class="ilab">Recent form</div><div class="iform">${
        m.history
          .slice(-20)
          .map(x => `<i class="${x.w ? "w" : x.c === x.a ? "d" : ""}"></i>`)
          .join("") || "<span>No matches yet</span>"
      }</div>`;
      h += `<div class="ilab">Strategy odds vs their ${guess.toLowerCase()}</div>`;
      for (const s of CTF.STRATS) {
        const [a, b] = br.arm(s + "|" + guess);
        h += bar(s, pct(a, b), Math.round(pct(a, b) * 100) + "%", s === br.plan.strat);
      }
      const el2 = m.enemyLane,
        tot = el2[0] + el2[1] + el2[2];
      h += `<div class="ilab">Where ${TN[1 - t]} attacks from</div>`;
      ["Left", "Mid", "Right"].forEach((n, i) => {
        h += bar(n, el2[i] / tot, Math.round((el2[i] / tot) * 100) + "%");
      });
      const g = m.genes;
      h += `<div class="ilab">Evolved play style</div>`;
      [
        ["Aggression", "aggr"],
        ["Strafe chaos", "strafeVar"],
        ["Dodge", "thrustDodge"],
        ["Patience", "regroup"],
        ["Pounds", "pound"],
        ["Charges", "charge"],
      ].forEach(([n, k]) => {
        h += bar(n, g[k], g[k].toFixed(2));
      });
      const acc = m.acc[1] ? Math.round((m.acc[0] / m.acc[1]) * 100) : 0;
      h += `<div class="inote">Predicts ${TN[1 - t]} strafe flips every ${m.enemyRev.toFixed(2)}s · lifetime accuracy ${acc}% · wins most fights at ~${br.prefRange()}m</div></div>`;
    }
    el.innerHTML = h;
  }
  /* ---------------- banner ---------------- */
  function showBanner() {
    const w = G.winner,
      s0 = G.teams[0].score,
      s1 = G.teams[1].score;
    const sc = a =>
      (a.caps || 0) * 5 + (a.local ? K.kills : a.k || 0) - (a.local ? K.deaths : a.d || 0) * 0.5;
    const all = G.agents.slice().sort((a, b) => sc(b) - sc(a));
    const mvp = all[0];
    const ht = G.human ? G.human.team : -1;
    $("cBanT").textContent = w < 0 ? "Draw" : ht >= 0 ? (w === ht ? "Victory" : "Defeat") : `${TN[w]} wins`;
    $("cBanT").style.color = w < 0 ? "" : CTF.TEAM_HEX[w];
    const notes = G.teams.map(tm => {
      const br = tm.brain;
      let best = null,
        bv = -1;
      for (const s of CTF.STRATS) {
        const [a, b] = br.arm(s + "|" + br.enemyStratGuess);
        if (a / (a + b) > bv) {
          bv = a / (a + b);
          best = s;
        }
      }
      return `${TN[tm.team]} now favors ${best.toLowerCase()} vs ${br.enemyStratGuess.toLowerCase()} (${Math.round(bv * 100)}%)`;
    });
    $("cBanS").textContent =
      `${TN[0]} ${s0} – ${s1} ${TN[1]} · MVP ${mvp.name} ${mvp.local ? K.kills : mvp.k}/${mvp.local ? K.deaths : mvp.d}${mvp.caps ? `, ${mvp.caps} cap` : ""}\n${mode === "sim" ? notes.join(" · ") + " · next match in a few seconds" : "Returning to menu"}`;
    $("cBanS").style.whiteSpace = "pre-line";
    $("cBanner").hidden = false;
  }
  /** the post-match screen: results, then play again (online, the room stays), change mode or leave */
  function showResults() {
    postShown = true;
    const w = G.winner,
      ht = G.human ? G.human.team : -1;
    const toMenu = id => {
      K.extStop();
      setTimeout(() => {
        const el = $(id);
        if (el) el.focus();
      }, 30);
    };
    K.showPost({
      mode: `${K.MODE_DATA.ctf.name} · Twin Foundry`,
      title: w < 0 ? "Draw" : w === ht ? "Victory" : "Defeat",
      color: w < 0 ? "" : CTF.TEAM_HEX[w],
      sub: `${TN[0]} ${G.teams[0].score} – ${G.teams[1].score} ${TN[1]}`,
      again: () => {
        K.extStop();
        setTimeout(() => $("ctfPlay").click(), 60);
      },
      change: () => toMenu("ctfPlay"),
      leave: () => toMenu("deploy"),
      auto: K.inRoom ? 20 : 0,
    });
  }
  /* ---------------- controls ---------------- */
  function setSpeed(s) {
    speed = s;
    UI.quiet = s > 2;
    for (const n of [1, 2, 4]) $("cSpd" + n).setAttribute("aria-pressed", String(n === s));
  }
  [1, 2, 4].forEach(n => ($("cSpd" + n).onclick = () => setSpeed(n)));
  function setCam(m) {
    camMode = m;
    $("cCam").textContent = "Camera: " + (m === "follow" ? G.agents[followIdx].name : m);
    snap = true;
  }
  $("cCam").onclick = () => {
    if (!G) return;
    if (camMode === "director") setCam("tactical");
    else if (camMode === "tactical") {
      followIdx = 0;
      setCam("follow");
    } else if (followIdx < 7) {
      followIdx++;
      setCam("follow");
    } else setCam("director");
  };
  $("cInt").onclick = () => {
    const on = !$("ctfHud").classList.contains("intel");
    $("ctfHud").classList.toggle("intel", on);
    UI.intelOn = on;
    $("cInt").setAttribute("aria-pressed", String(on));
    intelT = 0;
  };
  $("cTrn").onclick = () => {
    if (training) {
      training.cancel();
      training = null;
      $("cTrn").textContent = "Train 10 matches";
      newMatch();
      return;
    }
    UI.detach();
    G = null;
    $("ctfHud").hidden = false;
    $("ctfHud").classList.add("intel");
    $("cCtl").hidden = false;
    $("cTrn").textContent = "Stop training";
    training = { i: 0, n: 10, res: [0, 0, 0], cancel: null };
    const tr = training;
    const h = CTF.train(
      10,
      (i, n, res) => {
        tr.i = i;
        tr.res = res;
        intelT = 0;
      },
      res => {
        training = null;
        $("cTrn").textContent = "Train 10 matches";
        K.say("Training complete", true);
        newMatch();
      }
    );
    tr.cancel = h.cancel;
    intelT = 0;
  };
  $("cRst").onclick = () => {
    if (training) return;
    CTF.resetModels();
    newMatch();
    UI.line("sys", "Learning reset. Both teams start from scratch.");
  };
  $("cExit").onclick = () => K.extStop();
  addEventListener("keydown", e => {
    if (mode !== "sim" || !G) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 8) {
      followIdx = n - 1;
      setCam("follow");
    } else if (e.code === "KeyC") $("cCam").click();
    else if (e.code === "KeyI") $("cInt").click();
    else if (e.code === "Escape") K.extStop();
  });
  /* ---------------- menu ---------------- */
  K.defineMode({ id: "ctf", name: K.MODE_DATA.ctf.name, settings: K.MODE_DATA.ctf, start: startPlay });
  K.defineMode({ id: "ctf-spectate", name: "AI vs AI", settings: K.MODE_DATA.ctf, start: startSim });
  $("ctfPlay").onclick = () => K.startMode("ctf");
  $("ctfSim").onclick = () => K.startMode("ctf-spectate");
})();
