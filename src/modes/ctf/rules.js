/* ===== CTF rules: flags, scoring, respawns, segment rewards. Runs rendered or headless ===== */
(function () {
  const K = window.KA,
    CTF = window.CTF;
  const NAMES = [
    ["Vex", "Kade", "Rook", "Juno"],
    ["Sol", "Brix", "Nyx", "Talon"],
  ];
  CTF.NAMES = NAMES;
  let navReady = false;
  CTF.Game = function (opts) {
    if (!navReady) {
      CTF.NAV.build(CTF.buildMap().solids);
      navReady = true;
    }
    CTF.enterMap();
    const G = {
      t: 0,
      mode: opts.mode,
      render: !!opts.render,
      diff: opts.diff || ["legendary", "legendary"],
      scoreLimit: opts.scoreLimit || 3,
      timeLimit: opts.timeLimit || 480,
      over: false,
      winner: -1,
      human: null,
      onEvent: null,
      onComms: null,
      segT: [0, 0],
      killLog: [],
    };
    const models = CTF.loadModels();
    G.teams = [0, 1].map(t => ({ team: t, score: 0, agents: [], brain: new CTF.TeamBrain(t, models[t]) }));
    G.flags = [0, 1].map(t => ({
      team: t,
      state: "home",
      pos: CTF.FLAG_HOME[t].clone(),
      carrier: null,
      dropT: 0,
      pulls: 0,
    }));
    for (let t = 0; t < 2; t++)
      for (let i = 0; i < 4; i++) {
        G.teams[t].agents.push(new CTF.Agent(G, t, i, NAMES[t][i], false));
      }
    G.agents = [...G.teams[0].agents, ...G.teams[1].agents];
    G.emit = (type, d) => {
      if (G.onEvent) G.onEvent(type, d || {});
    };
    G.hurtHuman = (e, n, src) => {
      if (e.remote) {
        if (G.netHit) G.netHit(e, n, { w: src.w, hd: src.hd, by: src.agent });
      } else K.hurtMe(n, src);
    };
    G.byId = id => G.agents.find(a => a.id === id) || null;
    G.bench = [];
    const rebuild = () => {
      G.agents = [...G.teams[0].agents, ...G.teams[1].agents];
    };
    function dropFlag(a) {
      if (!a.carrying) return;
      const f = a.carrying;
      f.state = "dropped";
      f.carrier = null;
      f.dropT = G.t;
      f.pos.set(a.pos.x, K.groundBelow(a.pos.x, a.pos.z, a.pos.y + 0.5, 0.05), a.pos.z);
      a.carrying = null;
      G.emit("flagDrop", { flag: f, by: a, killer: null });
    }
    /* a human takes a bot's slot on their team; the bot sits out until a slot frees up */
    G.addHuman = function (a, team) {
      a.team = team;
      const tm = G.teams[team];
      const bots = tm.agents.filter(x => !x.human);
      const out = bots.find(x => !x.carrying && x.dead) || bots.filter(x => !x.carrying).pop() || bots.pop();
      if (out) {
        dropFlag(out);
        out.dead = true;
        tm.agents.splice(tm.agents.indexOf(out), 1);
        if (out.rig) {
          out.rig.root.visible = false;
          out.rig = null;
        }
        G.bench.push(out);
        a.idx = out.idx;
      } else a.idx = tm.agents.length;
      tm.agents.push(a);
      rebuild();
      G.emit("roster", {});
    };
    G.removeHuman = function (a) {
      dropFlag(a);
      const tm = G.teams[a.team];
      const i = tm.agents.indexOf(a);
      if (i < 0) return;
      tm.agents.splice(i, 1);
      const bi = G.bench.findIndex(x => x.team === a.team);
      if (bi >= 0) {
        const ai = G.bench.splice(bi, 1)[0];
        tm.agents.push(ai);
        ai.spawn(G.spawnPoint(ai.team));
        ai.respawnAt = 0;
      }
      if (a.rig) {
        a.rig.root.visible = false;
        a.rig = null;
      }
      rebuild();
      G.emit("roster", {});
    };
    G.moveHuman = function (a, team) {
      if (a.team === team) return;
      G.removeHuman(a);
      G.addHuman(a, team);
    };
    if (opts.mode === "play") {
      G.human = new CTF.Agent(G, opts.humanTeam || 0, 0, K.myName, true, false, opts.humanId || "h:local");
      G.addHuman(G.human, opts.humanTeam || 0);
    }
    G.nades = new K.NadeWorld(G.render);
    G.claims = [null, null];
    G.pickups = CTF.PICKUP_DEFS.map(d => {
      const p = {
        id: d.id,
        type: d.type,
        pos: d.pos.clone(),
        respawn: d.respawn,
        availAt: 0,
        get avail() {
          return G.t >= p.availAt;
        },
        get availIn() {
          return Math.max(0, p.availAt - G.t);
        },
        take(a) {
          return G.takePickup(p, a || G.human);
        },
      };
      return p;
    });
    G.takePickup = function (p, a) {
      if (!p.avail || !a || !a.alive) return false;
      p.availAt = G.t + p.respawn;
      if (!a.human) {
        a.sniper = 12;
        a.sniperMag = 4;
      }
      G.claims[a.team] = null;
      G.emit("pickup", { by: a, id: p.id });
      const br = G.teams[a.team].brain;
      br.say(
        G,
        a.human ? br.leader(G) : a,
        "snp",
        a.human ? `${a.name} has the sniper` : "I've got the sniper",
        true
      );
      const ob = G.teams[1 - a.team].brain,
        l = ob.leader(G);
      if (l) ob.say(G, l, "snpL", "They took the sniper, watch the long lines", true);
      return true;
    };
    G.sniperFor = function (team) {
      for (const a of G.teams[team].agents)
        if (a.alive && (a.sniper > 0 || a.wpn === 2 || (a.local && K.wi === 2))) return a;
      return null;
    };
    G.spawnPoint = function (team) {
      let best = null,
        bv = -1;
      for (const s of CTF.SPAWNS[team]) {
        let md = 99;
        for (const e of G.teams[1 - team].agents) {
          if (!e.alive) continue;
          md = Math.min(md, Math.hypot(e.pos.x - s[0], e.pos.z - s[2]));
        }
        const v = md + Math.random() * 3;
        if (v > bv) {
          bv = v;
          best = s;
        }
      }
      return best;
    };
    G.start = function () {
      for (const p of G.pickups) p.availAt = 0;
      K.resetDestruction();
      if (G.render) K.DESTR.bodies = () => G.agents.map(a => a.body);
      for (const a of G.agents) {
        if (!a.human) a.spawn(G.spawnPoint(a.team));
      }
      for (const tm of G.teams) {
        tm.brain.chooseStrategy(G);
        G.segT[tm.team] = 0;
      }
      G.emit("start");
    };
    G.kill = function (victim, killer, type, head) {
      if (victim.dead && !victim.human) return;
      if (!victim.local) {
        victim.dead = true;
        victim.respawnAt = G.t + 6;
        if (victim.rig && G.render)
          victim.rig.die(
            killer && killer !== victim ? killer.pos : null,
            /sniper|charge|frag|stick|pound/.test(type || "") ? 2 : 1
          );
      }
      victim.d++;
      if (killer && killer !== victim) killer.k++;
      const p = victim.pos.clone();
      if (victim.carrying) {
        const f = victim.carrying;
        f.state = "dropped";
        f.carrier = null;
        f.dropT = G.t;
        f.pos.set(p.x, K.groundBelow(p.x, p.z, p.y + 0.5, 0.05), p.z);
        victim.carrying = null;
        G.emit("flagDrop", { flag: f, by: victim, killer });
        G.teams[f.team].brain.say(
          G,
          killer && killer.team === f.team && !killer.human ? killer : G.teams[f.team].brain.leader(G),
          "drop",
          `Their carrier is down, flag ${CTF.zoneName(f.team, f.pos)}`,
          true
        );
      }
      // learning signals
      G.teams[victim.team].brain.danger.add(p.x, p.z, 1, 4);
      if (killer && killer.team !== victim.team) {
        const r = killer.pos.distanceTo(p);
        G.teams[killer.team].brain.duel(r, true);
        G.teams[victim.team].brain.duel(r, false);
        if (!victim.human && Math.random() < 0.5)
          G.teams[victim.team].brain.say(
            G,
            victim,
            "dead",
            `Dead. ${killer.name} ${CTF.zoneName(victim.team, killer.pos)}`
          );
      }
      G.killLog.push({ t: G.t, k: killer ? killer.id : null, v: victim.id });
      G.emit("kill", { victim, killer, type, head });
    };
    function pickup(f, a) {
      f.state = "carried";
      f.carrier = a;
      a.carrying = f;
      f.pulls++;
      G.teams[a.team].brain.segFlagPulls++;
      G.emit("flagTaken", { flag: f, by: a });
      const br = G.teams[a.team].brain;
      if (!a.human) br.say(G, a, "got", "I've got their flag! Escort me home", true);
      const ob = G.teams[f.team].brain;
      const l = ob.leader(G);
      if (l) ob.say(G, l, "lost", `Flag taken! ${a.name} has it, ${CTF.zoneName(f.team, a.pos)}`, true);
      // learning: which lane the attack came through
      G.teams[a.team].brain.model.laneAtk[
        a.entryLane != null ? a.entryLane : CTF.relLane(a.team, a.pos.x)
      ][0] += 0.5;
    }
    function capture(f, a) {
      const tm = G.teams[a.team];
      tm.score++;
      a.caps++;
      a.carrying = null;
      f.state = "home";
      f.carrier = null;
      f.pos.copy(CTF.FLAG_HOME[f.team]);
      G.emit("capture", { flag: f, by: a, team: a.team });
      tm.brain.say(G, a.human ? tm.brain.leader(G) : a, "cap", "Capture! Reset and go again", true);
      endSegments(a.team);
      if (tm.score >= G.scoreLimit) G.finish(a.team);
    }
    function endSegments(scorer) {
      for (const tm of G.teams) {
        const br = tm.brain;
        let r;
        if (scorer === tm.team) r = 1;
        else if (scorer >= 0) r = Math.min(0.3, br.segFlagPulls * 0.12);
        else
          r =
            0.35 +
            Math.min(0.3, br.segFlagPulls * 0.1) -
            Math.min(0.3, G.teams[1 - tm.team].brain.segFlagPulls * 0.1);
        br.endSegment(G, r);
      }
      for (const tm of G.teams)
        if (!G.over)
          tm.brain.chooseStrategy(G, scorer === tm.team ? "" : scorer >= 0 ? "They scored." : "Stalled out.");
    }
    G.finish = function (winner) {
      if (G.over) return;
      G.over = true;
      G.winner = winner;
      const s = [G.teams[0].score, G.teams[1].score];
      for (const tm of G.teams) {
        const other = G.teams[1 - tm.team];
        tm.brain.endMatch(
          G,
          winner === tm.team,
          s[tm.team],
          s[1 - tm.team],
          Object.assign({}, other.brain.genes)
        );
      }
      CTF.saveModels(G.teams.map(t => t.brain));
      G.emit("end", { winner });
    };
    G.step = function (dt) {
      if (G.over) return;
      G.t += dt;
      for (const tm of G.teams) tm.brain.tick(G, dt);
      for (const a of G.agents) {
        if (a.human) continue;
        if (a.dead) {
          if (G.t >= a.respawnAt) a.spawn(G.spawnPoint(a.team));
          continue;
        }
        const inp = a.think(dt);
        a.body.step(dt, inp, (ty, d) => a.onEvent(ty, d));
        a.body.regen(dt, G.t);
        // lane tracking for attack learning
        const zz = a.team === 0 ? a.pos.z : -a.pos.z;
        if (zz > -10 && zz < 20) a.entryLane = CTF.relLane(a.team, a.pos.x);
        if (a.body.pos.y < -5) {
          a.dead = true;
          a.respawnAt = G.t + 3;
        }
        for (const p of G.pickups)
          if (
            p.avail &&
            !(a.sniper > 0) &&
            Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 1.6 &&
            Math.abs(a.pos.y - p.pos.y) < 1.6
          )
            G.takePickup(p, a);
      }
      G.nades.step(dt);
      // flags
      for (const f of G.flags) {
        const own = f.team,
          enemy = 1 - own;
        if (f.state === "carried") {
          const c = f.carrier;
          if (!c || !c.alive) {
            f.state = "dropped";
            f.dropT = G.t;
            if (c) c.carrying = null;
            f.carrier = null;
            continue;
          }
          f.pos.copy(c.pos);
          if (G.flags[enemy].state === "home" && c.pos.distanceTo(CTF.FLAG_HOME[enemy]) < 1.7) capture(f, c);
          continue;
        }
        if (f.state === "dropped" && G.t - f.dropT > 15) {
          f.state = "home";
          f.pos.copy(CTF.FLAG_HOME[own]);
          G.emit("flagReset", { flag: f });
          continue;
        }
        for (const a of G.agents) {
          if (!a.alive) continue;
          const d = a.pos.distanceTo(f.pos);
          if (d > 1.5) continue;
          if (a.team === enemy && !a.carrying) {
            pickup(f, a);
            break;
          }
          if (a.team === own && f.state === "dropped") {
            f.state = "home";
            f.pos.copy(CTF.FLAG_HOME[own]);
            a.rets++;
            G.emit("flagReturn", { flag: f, by: a });
            G.teams[own].brain.say(
              G,
              a.human ? G.teams[own].brain.leader(G) : a,
              "rt",
              "Flag returned",
              true
            );
            break;
          }
        }
      }
      // stalled segments re-plan
      for (const tm of G.teams) {
        if (G.t - tm.brain.segStart > 80 && !G.flags[1 - tm.team].carrier) {
          tm.brain.endSegment(G, 0.3 + Math.min(0.3, tm.brain.segFlagPulls * 0.1));
          tm.brain.chooseStrategy(G, "This isn't working.");
        }
      }
      if (G.t >= G.timeLimit) {
        const s0 = G.teams[0].score,
          s1 = G.teams[1].score;
        G.finish(s0 > s1 ? 0 : s1 > s0 ? 1 : -1);
      }
      // danger memory fades slowly
      if (((G.t * 10) | 0) % 300 === 0) for (const tm of G.teams) tm.brain.danger.decay(0.98);
    };
    return G;
  };
  /* run N headless matches in the background, persisting what each team learns */
  CTF.train = function (n, onProgress, onDone) {
    let i = 0,
      G = null,
      cancelled = false;
    const dt = 1 / 30;
    const res = [0, 0, 0];
    function chunk() {
      if (cancelled) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 28) {
        if (!G) {
          G = CTF.Game({ mode: "sim", render: false });
          G.start();
        }
        for (let k = 0; k < 30 && !G.over; k++) G.step(dt);
        if (G.over) {
          res[G.winner < 0 ? 2 : G.winner]++;
          i++;
          G = null;
          if (onProgress) onProgress(i, n, res);
          if (i >= n) {
            if (onDone) onDone(res);
            return;
          }
        }
      }
      setTimeout(chunk, 0);
    }
    setTimeout(chunk, 0);
    return {
      cancel() {
        cancelled = true;
      },
    };
  };
})();
