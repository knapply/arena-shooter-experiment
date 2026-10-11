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
    intelT = 0,
    orbit = 0;
  const cpos = new V3(),
    clook = new V3(),
    _a = new V3(),
    _b = new V3();
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
    const diff = $("ctfDiff").value;
    CTF.enterMap();
    mode = "play";
    overT = 0;
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
    UI.line(
      "sys",
      `You're on ${TN[myTeam]}. Bring the enemy flag to your stand while yours is home. J or D-pad up switches teams.`
    );
    if (CTF.NET.room) UI.line("sys", "Friends in your room can join from the menu.");
    K.say("Capture the flag", true);
  }
  /** the engine hooks for hosting a match (fresh, or taken over from a host who left) */
  function hostExt(host) {
    return {
      respawnDelay: 6,
      respawn() {
        placeMe(G.human.team);
        G.human.carrying = null;
      },
      targets() {
        const out = [];
        for (const a of G.teams[1 - G.human.team].agents)
          if (a.alive) out.push({ kind: "ext", ref: a, pos: a.body.pos, h: a.body.h });
        return out;
      },
      tick(dt) {
        if (!G) return;
        G.step(dt);
        host.tick(dt);
        UI.frame(dt);
        if (G.over) {
          if (!overT) showBanner();
          overT += wallDt();
          if (overT > 8) K.extStop();
        }
      },
      onPlayerDeath(src) {
        G.kill(G.human, (src && src.agent) || null, src && src.w, src && src.hd);
      },
      onFx: (k, a, b, g) => host.onFx(k, a, b, g),
      pickups: () => (G ? G.pickups : []),
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
    const diff = $("ctfDiff").value;
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
      respawnDelay: 6,
      respawn() {
        placeMe(G.human.team);
      },
      targets() {
        const out = [];
        for (const a of G.map.values())
          if (a.alive && a.team !== G.human.team)
            out.push({ kind: "ext", ref: a, pos: a.body.pos, h: a.body.h });
        return out;
      },
      tick(dt) {
        if (!G) return;
        G.step(dt);
        UI.frame(dt);
        if (G.over) {
          if (!overT && !G.hostGone) showBanner();
          overT += wallDt();
          if (overT > (G.hostGone ? 3 : 8)) K.extStop();
        }
      },
      onPlayerDeath(src) {
        G.died(src);
      },
      onFx: (k, a, b, g) => G.onFx(k, a, b, g),
      pickups: () => (G ? G.pickups : []),
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
  function simEvent(type, d) {
    if (type === "flagTaken" || type === "capture") {
      focus = d.by;
      focusT = 6;
    } else if (type === "kill" && d.victim === focus) focusT = Math.min(focusT, 1.6);
    else if (type === "end") showBanner();
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
      want.set(-60, 62, 0);
      look.set(0, 0, 0);
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
        }
        f = focus;
      }
      const b = f.body,
        yaw = b.yaw;
      const fx = -Math.sin(yaw),
        fz = -Math.cos(yaw);
      look.set(b.pos.x + fx * 3, b.pos.y + 1.3, b.pos.z + fz * 3);
      want.set(b.pos.x - fx * 5.5 + fz * 1.6, b.pos.y + 2.6, b.pos.z - fz * 5.5 - fx * 1.6);
      const head = new V3(b.pos.x, b.pos.y + 1.6, b.pos.z);
      const dir = want.clone().sub(head);
      const L = dir.length();
      dir.multiplyScalar(1 / L);
      const hit = K.rayWorld(head, dir, L);
      if (hit < L) want.copy(head).addScaledVector(dir, Math.max(0.6, hit - 0.4));
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
  $("ctfPlay").onclick = startPlay;
  $("ctfSim").onclick = startSim;
})();
