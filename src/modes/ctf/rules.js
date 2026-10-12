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
    /* seeded before anything random happens, so seed + inputs reproduce the match */
    const seed = K.RNG.seed(opts.seed);
    const G = {
      seed,
      t: 0,
      mode: opts.mode,
      render: !!opts.render,
      diff: opts.diff || ["legendary", "legendary"],
      scoreLimit: opts.scoreLimit || K.MODE_DATA.ctf.scoreLimit,
      timeLimit: opts.timeLimit || K.MODE_DATA.ctf.timeLimit,
      over: false,
      winner: -1,
      human: null,
      onEvent: null,
      onComms: null,
      segT: [0, 0],
      killLog: [],
      /* friendly fire: bullets, grenades and rockets hurt teammates (the host's setting) */
      ff: opts.ff != null ? !!opts.ff : !(K.SET && K.SET.friendlyFire === false),
      /* drop pod respawns (the host's setting): the pilot is out until the pod lands */
      pods: opts.pods != null ? !!opts.pods : !!(K.SET && K.SET.spawnStyle !== "classic"),
      /** weapons and grenades on the floor (death drops) */
      items: [],
      itemSeq: 0,
      /** where fighting happened lately (hits and kills), for spawn safety */
      fights: [],
      /** simulations only (tools/tune.js): every AI pilot uses one weapon, "carbine", "magnum", "sniper",
          "rocket" or "nades" (grenades only); power spawns, death drops and other grenades are off */
      lock: opts.lock || null,
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
      K.noteFight(G.fights, e.pos, G.t);
      if (e.remote) {
        if (G.netHit) G.netHit(e, n, { w: src.w, hd: src.hd, by: src.agent });
      } else K.hurtMe(n, src);
    };
    G.byId = id => G.agents.find(a => a.id === id) || null;
    /** a ping from a teammate: the two nearest AI teammates head there; an enemy ping is shared intel */
    G.ping = function (from, p) {
      const team = from.team,
        pos = new K.THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]);
      const mates = G.teams[team].agents
        .filter(a => !a.human && a.alive && !a.carrying)
        .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))
        .slice(0, 2);
      for (const a of mates) a.ping = { pos: pos.clone(), until: G.t + 8 };
      const t = p.target ? G.byId(p.target) : null;
      if (t && t.team !== team) G.teams[team].brain.enemyMem.set(t.id, { t: G.t, pos: t.pos.clone() });
      if (mates[0])
        G.teams[team].brain.say(G, mates[0], "ping", p.kind === "enemy" ? "On them" : "Moving up", true);
      return mates;
    };
    G.bench = [];
    G.bodies = G.agents.map(a => a.body);
    const rebuild = () => {
      G.agents = [...G.teams[0].agents, ...G.teams[1].agents];
      G.bodies = G.agents.map(a => a.body);
    };
    /* pilots are solid to each other */
    const colliders = () => G.bodies;
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
    G.rockets = new K.RocketWorld(G.render);
    G.claims = [null, null];
    const ROT = K.POWER_ROTATION.map(k => K.WEAPON_DATA.findIndex(w => w.key === k));
    G.pickups = CTF.PICKUP_DEFS.map(d => {
      const p = {
        id: d.id,
        type: d.type,
        power: true,
        rot: d.rotate ? ROT : null,
        ri: d.rotate ? Math.max(0, K.POWER_ROTATION.indexOf(d.weapon)) : 0,
        pos: d.pos.clone(),
        respawn: d.respawn,
        availAt: 0,
        /** taken: the respawn timer starts and the rotation moves on to the next power weapon */
        consume() {
          p.availAt = G.t + p.respawn;
          if (p.rot) {
            p.ri = (p.ri + 1) % p.rot.length;
            p.type = p.rot[p.ri];
          }
        },
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
    if (G.lock) G.pickups = [];
    const keyOf = t => (K.WEAPON_DATA[t] ? K.WEAPON_DATA[t].key : "");
    /** an AI pilot arms itself with a power weapon (ammo: [mag, reserve], or full) */
    G.arm = function (a, type, ammo) {
      const W = K.WEAPON_DATA[type],
        n = ammo ? ammo[0] + ammo[1] : W.mag + W.reserve;
      a.sniper = a.sniperMag = a.rocket = 0;
      if (W.key === "sniper") {
        a.sniper = n;
        a.sniperMag = Math.min(W.mag, n);
      } else if (W.key === "rocket") a.rocket = n;
    };
    G.takePickup = function (p, a) {
      if (!p.avail || !a || !a.alive) return false;
      const type = p.type,
        key = keyOf(type);
      p.consume();
      if (!a.human) G.arm(a, type);
      G.claims[a.team] = null;
      G.emit("pickup", { by: a, id: p.id });
      const br = G.teams[a.team].brain;
      const nm = key === "rocket" ? "rockets" : "the sniper";
      br.say(G, a.human ? br.leader(G) : a, "snp", a.human ? `${a.name} has ${nm}` : `I've got ${nm}`, true);
      const ob = G.teams[1 - a.team].brain,
        l = ob.leader(G);
      if (l)
        ob.say(
          G,
          l,
          "snpL",
          key === "rocket" ? "They have rockets, spread out" : "They took the sniper, watch the long lines",
          true
        );
      return true;
    };
    /* ---- items on the floor ---- */
    G.addItems = function (list, at) {
      list.forEach((o, i) => {
        const ang = (i / Math.max(1, list.length)) * Math.PI * 2 + K.rand();
        const pos = at.clone();
        pos.x += Math.cos(ang) * 0.5;
        pos.z += Math.sin(ang) * 0.5;
        pos.y = K.groundBelow(pos.x, pos.z, at.y + 1, 0.05) + 0.02;
        const it = {
          id: "i" + ++G.itemSeq,
          type: o.type,
          ammo: o.ammo || null,
          nades: o.nades || null,
          pos,
          until: G.t + 30,
          gone: false,
          get avail() {
            return !it.gone && G.t < it.until;
          },
          availIn: 0,
          take() {
            if (!it.avail) return false;
            it.gone = true;
            return true;
          },
        };
        G.items.push(it);
      });
      while (G.items.length > 24) G.items.shift();
    };
    /** what an AI pilot (or a remote player, as far as the host knows) drops when they die */
    G.loadoutOf = function (a) {
      const out = [];
      if (a.rocket > 0) {
        const t = K.WEAPON_DATA.findIndex(w => w.key === "rocket");
        out.push({ type: t, ammo: [Math.min(2, a.rocket), Math.max(0, a.rocket - 2)] });
      } else if (a.sniper > 0) {
        const t = K.WEAPON_DATA.findIndex(w => w.key === "sniper");
        out.push({ type: t, ammo: [Math.min(4, a.sniper), Math.max(0, a.sniper - 4)] });
      } else {
        /* the gun in hand (carbine or magnum), with what was left in it */
        const t = a.wpn === 1 ? 1 : 0;
        out.push({ type: t, ammo: [a.remote || !a.ammo ? K.WEAPON_DATA[t].mag : a.ammo[t], Infinity] });
      }
      const nf = a.nadeInv ? a.nadeInv.frag : 0,
        np = a.nadeInv ? a.nadeInv.plasma : 0;
      if (nf + np > 0) out.push({ type: -1, nades: { frag: nf, plasma: np } });
      return out;
    };
    /** an AI pilot walking over an item: grenades top up, a power weapon replaces their sidearm */
    function aiTakes(a, it) {
      if (it.type < 0) {
        const n = it.nades || { frag: 1, plasma: 0 };
        const f = Math.min(n.frag, 2 - a.nadeInv.frag),
          pl = Math.min(n.plasma, 2 - a.nadeInv.plasma);
        if (f <= 0 && pl <= 0) return;
        if (!it.take()) return;
        a.nadeInv.frag += f;
        a.nadeInv.plasma += pl;
      } else if (K.WEAPON_DATA[it.type].power && !(a.sniper > 0) && !(a.rocket > 0) && !a.carrying) {
        if (!it.take()) return;
        G.arm(a, it.type, it.ammo && it.ammo[1] !== Infinity ? it.ammo : null);
      }
    }
    G.sniperFor = function (team) {
      for (const a of G.teams[team].agents)
        if (a.alive && (a.sniper > 0 || a.wpn === 2 || (a.local && K.wi === 2))) return a;
      return null;
    };
    /** the safest of the team's spawns: out of enemy sight lines, away from enemies and recent fights
        (world/spawns.js) */
    G.spawnPoint = function (team) {
      const foes = G.teams[1 - team].agents.filter(e => e.alive).map(e => e.body);
      return K.pickSpawn(CTF.SPAWNS[team], foes, G.fights, G.t, K.rand);
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
      /* a teamkill (friendly fire) costs a point instead of earning one */
      if (killer && killer !== victim) killer.k += killer.team === victim.team ? -1 : 1;
      const p = victim.pos.clone();
      /* weapons and grenades fall where they died (you report your own drop) */
      if (!victim.local && !G.lock) G.addItems(G.loadoutOf(victim), p);
      victim.sniper = victim.sniperMag = victim.rocket = 0;
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
        if (!victim.human && K.rand() < 0.5)
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
    /** a player holding Interact at the enemy flag */
    G.humanTakeFlag = function (a) {
      const f = G.flags[1 - a.team];
      if (!a || !a.alive || a.carrying || f.state === "carried" || a.pos.distanceTo(f.pos) > 1.8)
        return false;
      pickup(f, a);
      return true;
    };
    /** let go of the flag where you stand (switching weapons does this) */
    G.dropFlagBy = function (a) {
      if (!a || !a.carrying) return;
      dropFlag(a);
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
      K.setPilotCollider(colliders);
      for (const tm of G.teams) tm.brain.tick(G, dt);
      for (const a of G.agents) {
        if (a.human) continue;
        if (a.dead) {
          /* a pod launches POD_EARLY before the respawn time and lands when an in-place spawn would
             have plus the old 1.35 s drop (the longer fall is spectacle only) */
          if (G.t >= a.respawnAt - (G.pods ? K.POD_EARLY : 0)) {
            if (!G.pods) a.spawn(G.spawnPoint(a.team));
            else if (!a.podAt) {
              /* the spot is picked once, when the respawn starts */
              if (!a.podPt || a.podFor !== a.respawnAt) {
                const pt = G.spawnPoint(a.team);
                const up = new K.THREE.Vector3(pt[0], pt[1] + 2.2, pt[2]);
                a.podPt = pt;
                a.podFor = a.respawnAt;
                a.podOpen = K.rayWorld(up, new K.THREE.Vector3(0, 1, 0), 60) >= 59;
              }
              const pt = a.podPt;
              if (a.podOpen) {
                a.podAt = G.t + K.POD_TIME;
                G.emit("pod", { a, pos: new K.THREE.Vector3(pt[0], pt[1] + 0.02, pt[2]) });
              } else if (G.t >= a.respawnAt) {
                /* no open sky there: appear in place at the usual time */
                a.spawn(pt);
                a.podPt = null;
              }
            } else if (G.t >= a.podAt) {
              a.spawn(a.podPt);
              a.podAt = 0;
              a.podPt = null;
              /* a pod landing on someone takes them out */
              for (const e of G.agents)
                if (
                  e !== a &&
                  e.alive &&
                  (G.ff || e.team !== a.team) &&
                  Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z) < 1.5 &&
                  Math.abs(e.pos.y - a.pos.y) < 2.2
                ) {
                  if (e.human) G.hurtHuman(e, 999, { name: a.name, agent: a, w: "pod" });
                  else e.onHit(999, "pod", false, a);
                }
            }
          }
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
      G.rockets.step(dt);
      for (let i = G.items.length - 1; i >= 0; i--) {
        const it = G.items[i];
        if (!it.avail) {
          G.items.splice(i, 1);
          continue;
        }
        for (const a of G.agents)
          if (
            !a.human &&
            a.alive &&
            Math.hypot(a.pos.x - it.pos.x, a.pos.z - it.pos.z) < 1.3 &&
            Math.abs(a.pos.y - it.pos.y) < 1.6
          ) {
            aiTakes(a, it);
            if (!it.avail) break;
          }
      }
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
          if (d > 1.5) {
            if (a.team === enemy) a.flagHold = 0;
            continue;
          }
          /* the flag is picked up by hand: AI pilots stop and take it (a short hold); players hold
             Interact (G.humanTakeFlag) */
          if (a.team === enemy && !a.carrying && !a.human) {
            a.flagHold = (a.flagHold || 0) + dt;
            if (a.flagHold >= 0.3) {
              a.flagHold = 0;
              pickup(f, a);
              break;
            }
            continue;
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
  /* run N headless matches on a background thread (sim-worker.js) when the page is served over
     http(s); otherwise (opened as a file) in slices on the main thread. Learning is saved either way. */
  CTF.train = function (n, onProgress, onDone) {
    let w = null;
    try {
      if (typeof Worker === "function" && /^https?:/.test(location.protocol)) w = new Worker("sim-worker.js");
    } catch (e) {
      w = null;
    }
    if (!w) return trainHere(n, onProgress, onDone);
    let fell = false;
    const fallback = () => {
      if (fell) return;
      fell = true;
      w.terminate();
      handle = trainHere(n, onProgress, onDone);
    };
    /** @type {{ cancel(): void }} */
    let handle = {
      cancel() {
        w.terminate();
      },
    };
    w.onerror = fallback;
    w.onmessage = e => {
      const m = e.data || {};
      if (m.type === "progress" && onProgress) onProgress(m.i, m.n, m.res);
      else if (m.type === "done") {
        if (m.models) K.STORE.save("ctfBrain", m.models);
        w.terminate();
        if (onDone) onDone(m.res);
      }
    };
    w.postMessage({ type: "train", n, models: K.STORE.load("ctfBrain") });
    return {
      cancel: () => handle.cancel(),
      get worker() {
        return !fell;
      },
    };
  };
  function trainHere(n, onProgress, onDone) {
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
  }
})();
