/* ===== Match rules (CTF.Game): flags, the skull, scoring, respawns and AI learning. Runs rendered or headless =====
   CTF.Game(opts) builds a match on a map (opts.map, default Twin Foundry) under a set of rules
   (opts.rules): "ctf" capture the flag, "slayer" team deathmatch, "ffa" free-for-all (every pilot is a
   team of one) or "oddball" (hold the skull). Without opts.rules a map with flags plays capture the
   flag and one without plays team deathmatch. It returns G:
     G.agents / G.teams     every pilot (AI, you, online players) and each team's TeamBrain
     G.foes(team)           everyone who is an enemy of a team (the other team; everyone else in FFA)
     G.start(), G.step(dt)  begin, then advance the whole match: brains, bots (think + Body.step),
                            respawns and drop pods, grenades, rockets, items on the floor, flags, the
                            skull, the clock
     G.kill(...)            the one place a pilot dies: score, drops, flag or skull drop, events
     G.emit(type, d)        rule events for the UI, the engine's event stream and the netcode
   Carrying the flag or the skull takes both hands: no guns or grenades, but a melee kills in one hit.
   A flag carrier who sprints or thrusts lets the flag go (players: the engine's carry rules; the AI
   never does). What each team learned about its opponent is saved after capture the flag matches
   (CTF.saveModels). */
(function () {
  const K = window.KA,
    CTF = window.CTF;
  const NAMES = [
    ["Vex", "Kade", "Rook", "Juno", "Hale", "Mira"],
    ["Sol", "Brix", "Nyx", "Talon", "Orin", "Zed"],
  ];
  CTF.NAMES = NAMES;
  /** free-for-all names: the two teams' names interleaved */
  const FFA_NAMES = NAMES[0].flatMap((n, i) => [n, NAMES[1][i]]);
  /** the MODE_DATA entry each set of rules reads */
  const RULES_DATA = { ctf: "ctf", slayer: "tdm", ffa: "ffa", oddball: "oddball" };
  CTF.RULES_DATA = RULES_DATA;
  CTF.Game = function (opts) {
    /* lab content (docs/PROPOSALS.md): offline matches and simulations only, never online */
    const labs = opts.labs !== false && K.LABS.on;
    CTF.useMap(opts.map || "ctf", labs ? K.LABS.mods : null);
    /* the AI's walkable grid is built once per map (and patched as cover breaks) */
    if (CTF.NAV.mapId !== CTF.MAP.id) CTF.NAV.build(CTF.buildMap().solids);
    CTF.enterMap();
    let rules = opts.rules || (CTF.hasFlags() ? "ctf" : "slayer");
    if (!RULES_DATA[rules] || (rules === "ctf" && !CTF.hasFlags())) rules = "slayer";
    const ffa = rules === "ffa",
      odd = rules === "oddball",
      MD = K.MODE_DATA[RULES_DATA[rules]];
    /* free-for-all: every pilot is a team of one */
    const nTeams = ffa ? Math.max(2, Math.min(FFA_NAMES.length, opts.pilots || MD.pilots)) : 2;
    const d0 = opts.diff || ["legendary", "legendary"];
    /* seeded before anything random happens, so seed + inputs reproduce the match */
    const seed = K.RNG.seed(opts.seed);
    const G = {
      seed,
      t: 0,
      mode: opts.mode,
      render: !!opts.render,
      /** skill per team (in free-for-all the given levels alternate between pilots) */
      diff: Array.from({ length: nTeams }, (_, i) => d0[i % d0.length]),
      scoreLimit: opts.scoreLimit || MD.scoreLimit,
      timeLimit: opts.timeLimit || MD.timeLimit,
      /** the rules played: "ctf", "slayer", "ffa" or "oddball", and on which map (a MAPS key) */
      rules,
      mapKey: opts.map || "ctf",
      /** kills score (team deathmatch and free-for-all) */
      tdm: rules === "slayer" || ffa,
      ffa,
      /** a dropped flag goes home after this long; a dropped skull is dropped in again after this long */
      flagReset: K.MODE_DATA.ctf.flagReset || 15,
      ballReset: opts.ballReset || (odd ? MD.ballReset : 15),
      respawnDelay: MD.respawn,
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
      labs,
      /** blast gates (world/gates.js): their state is a function of G.t, so it needs no syncing */
      gates: opts.gates != null ? !!opts.gates : labs && !!K.LABS.gates,
    };
    K.gatesAt(0, G.gates);
    /* what the teams learned is about capture the flag on Twin Foundry: other rules start fresh */
    const models = rules === "ctf" ? CTF.loadModels() : null;
    G.teams = Array.from({ length: nTeams }, (_, t) => ({
      team: t,
      score: 0,
      /** oddball: seconds this team has held the skull */
      held: 0,
      agents: [],
      brain: new CTF.TeamBrain(t, models ? models[t] : CTF.freshModel()),
    }));
    G.flags = (rules === "ctf" ? [0, 1] : []).map(t => ({
      team: t,
      state: "home",
      pos: CTF.FLAG_HOME[t].clone(),
      carrier: null,
      dropT: 0,
      pulls: 0,
    }));
    /** oddball: the skull. incoming (a pod is bringing it), home (on its spot), carried or dropped */
    G.ball = odd
      ? {
          ball: true,
          team: -1,
          state: "incoming",
          pos: CTF.BALL_HOME.clone(),
          carrier: null,
          dropT: 0,
          landAt: Infinity,
          podSent: false,
          /** whoever just let it go can't pick it straight back up */
          noPick: null,
          noPickT: 0,
        }
      : null;
    /* opts.perTeam: pilots per team (simulated duels on the arena use 1) */
    if (ffa)
      for (let t = 0; t < nTeams; t++) G.teams[t].agents.push(new CTF.Agent(G, t, 0, FFA_NAMES[t], false));
    else
      for (let t = 0; t < 2; t++)
        for (let i = 0; i < Math.min(NAMES[t].length, opts.perTeam || MD.teamSize || 4); i++)
          G.teams[t].agents.push(new CTF.Agent(G, t, i, NAMES[t][i], false));
    G.agents = G.teams.flatMap(tm => tm.agents);
    G.emit = (type, d) => {
      if (G.onEvent) G.onEvent(type, d || {});
    };
    /* who is an enemy of whom: the other team, or in free-for-all everyone else (rebuilt with the roster) */
    let foeCache = [];
    G.foes = team => (ffa ? foeCache[team] || [] : G.teams[1 - team].agents);
    /** the spawn points a team uses (free-for-all: every spawn on the map) */
    G.spawnList = team => (ffa ? CTF.FFA_SPAWNS : CTF.SPAWNS[team]);
    /** the team's own pilot carrying the objective (their flag, or the skull), or null */
    G.mateCarrier = team => {
      if (G.ball) return G.ball.carrier && G.ball.carrier.team === team ? G.ball.carrier : null;
      const f = G.flags[1 - team];
      return f && f.state === "carried" && f.carrier ? f.carrier : null;
    };
    /** an enemy carrying the objective (our flag, or the skull), or null */
    G.foeCarrier = team => {
      if (G.ball) return G.ball.carrier && G.ball.carrier.team !== team ? G.ball.carrier : null;
      const f = G.flags[team];
      return f && f.state === "carried" && f.carrier ? f.carrier : null;
    };
    G.hurtHuman = (e, n, src) => {
      K.noteFight(G.fights, e.pos, G.t);
      if (e.remote) {
        if (G.netHit) G.netHit(e, n, { w: src.w, hd: src.hd, by: src.agent });
      } else K.hurtMe(n, src);
    };
    G.byId = id => G.agents.find(a => a.id === id) || null;
    /** a ping from a teammate: the two nearest AI teammates head there; an enemy ping is shared intel.
        A danger mark: every AI teammate keeps clear of it, and the two nearest hold short of it and
        watch it for a few seconds */
    G.ping = function (from, p) {
      const team = from.team,
        pos = new K.THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]);
      const mates = G.teams[team].agents
        .filter(a => !a.human && a.alive && !a.carrying)
        .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))
        .slice(0, 2);
      /* one mark per player: a new one replaces what the AI was doing about the last */
      for (const a of G.teams[team].agents) {
        if (a.danger && a.danger.by === from.id) a.danger = null;
        if (a.ping && a.ping.by === from.id) a.ping = null;
      }
      if (p.kind === "danger") {
        for (const a of G.teams[team].agents)
          if (!a.human)
            a.danger = {
              by: from.id,
              pos: pos.clone(),
              until: G.t + 10,
              watchUntil: mates.includes(a) ? G.t + 5 : 0,
            };
        if (mates[0]) G.teams[team].brain.say(G, mates[0], "ping", "Watching it", true);
        return mates;
      }
      for (const a of mates) a.ping = { by: from.id, pos: pos.clone(), until: G.t + 8 };
      const t = p.target ? G.byId(p.target) : null;
      if (t && t.team !== team) G.teams[team].brain.enemyMem.set(t.id, { t: G.t, pos: t.pos.clone() });
      if (mates[0])
        G.teams[team].brain.say(G, mates[0], "ping", p.kind === "enemy" ? "On them" : "Moving up", true);
      return mates;
    };
    G.bench = [];
    const rebuild = () => {
      G.agents = G.teams.flatMap(tm => tm.agents);
      G.bodies = G.agents.map(a => a.body);
      if (ffa) foeCache = G.teams.map(tm => G.agents.filter(a => a.team !== tm.team));
    };
    rebuild();
    /* pilots are solid to each other */
    const colliders = () => G.bodies;
    function dropFlag(a) {
      if (!a.carrying) return;
      if (a.carrying === G.ball) return dropBall(a, null);
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
      if (a.team === team || ffa) return;
      G.removeHuman(a);
      G.addHuman(a, team);
    };
    /** the team a player joins: their pick in team modes; in free-for-all a pilot slot no player holds
        yet (-1 when every slot has a player) */
    G.openTeam = function (want) {
      if (!ffa) return want === 1 ? 1 : 0;
      const open = G.teams.filter(tm => !tm.agents.some(a => a.human));
      if (!open.length) return -1;
      const idle = open.find(tm => tm.agents.every(a => a.dead));
      return (idle || open[open.length - 1]).team;
    };
    if (opts.mode === "play") {
      const ht = ffa ? 0 : opts.humanTeam || 0;
      G.human = new CTF.Agent(G, ht, 0, K.myName, true, false, opts.humanId || "h:local");
      G.addHuman(G.human, ht);
    }
    G.nades = new K.NadeWorld(G.render);
    G.rockets = new K.RocketWorld(G.render);
    G.claims = G.teams.map(() => null);
    const ROTK = labs ? K.powerRotation() : K.POWER_ROTATION,
      ROT = ROTK.map(k => K.WEAPON_DATA.findIndex(w => w.key === k));
    /* lab pickups only while their lab is on */
    G.pickups = CTF.PICKUP_DEFS.filter(d => !d.lab || (labs && K.labOn(d.lab))).map(d => {
      const p = {
        id: d.id,
        type: d.type,
        /* a power spawn (the AI breaks off for it); lab rifles are ordinary pickups */
        power: !!K.WEAPON_DATA[d.type].power,
        lab: d.lab || null,
        rot: d.rotate ? ROT : null,
        ri: d.rotate ? Math.max(0, ROTK.indexOf(d.weapon)) : 0,
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
      if (!W.power) {
        /* a lab rifle takes slot 1, with the rounds it had (full from a spawn) */
        a.prim = type;
        a.ammo[0] = ammo ? Math.min(W.mag, ammo[0]) : W.mag;
        a.rsv[0] = ammo ? ammo[1] : W.reserve;
        if (a.wpn === 0) a.switchT = K.SWITCH_TIME;
        return;
      }
      a.sniper = a.sniperMag = a.rocket = 0;
      a.pw = null;
      a.pwOut = false;
      if (W.key === "sniper") {
        a.sniper = n;
        a.sniperMag = Math.min(W.mag, n);
      } else if (W.key === "rocket") a.rocket = n;
      else a.pw = { type, n, mag: Math.min(W.mag, ammo ? ammo[0] : W.mag) };
    };
    G.takePickup = function (p, a) {
      if (!p.avail || !a || !a.alive) return false;
      const type = p.type,
        key = keyOf(type);
      p.consume();
      if (!a.human) G.arm(a, type);
      G.emit("pickup", { by: a, id: p.id });
      if (!p.power) return true;
      G.claims[a.team] = null;
      const br = G.teams[a.team].brain;
      const nm = key === "rocket" ? "rockets" : key === "sniper" ? "the sniper" : "the scattergun";
      br.say(G, a.human ? br.leader(G) : a, "snp", a.human ? `${a.name} has ${nm}` : `I've got ${nm}`, true);
      if (ffa) return true;
      const ob = G.teams[1 - a.team].brain,
        l = ob.leader(G);
      if (l)
        ob.say(
          G,
          l,
          "snpL",
          key === "rocket"
            ? "They have rockets, spread out"
            : key === "sniper"
              ? "They took the sniper, watch the long lines"
              : "They have the scattergun, keep your distance",
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
      } else if (a.pw) out.push({ type: a.pw.type, ammo: [a.pw.mag, Math.max(0, a.pw.n - a.pw.mag)] });
      else {
        /* the gun in hand (carbine or magnum, or a lab rifle), with what was left in it (a remote
           player's is not known here: a full load) */
        const s = a.wpn === 1 ? 1 : 0,
          t = s ? 1 : a.prim || 0,
          W = K.WEAPON_DATA[t],
          known = !a.remote && a.ammo && a.rsv;
        const am = known
          ? [Math.min(W.mag, a.ammo[s]), Math.min(W.reserve + W.mag, a.rsv[s])]
          : [W.mag, W.reserve];
        if (am[0] + am[1] > 0) out.push({ type: t, ammo: am });
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
      } else if (K.WEAPON_DATA[it.type].power && !a.armed && !a.carrying) {
        if (!it.take()) return;
        G.arm(a, it.type, it.ammo);
      } else if (K.WEAPON_DATA[it.type].lab && !a.prim && !a.carrying) {
        if (!it.take()) return;
        G.arm(a, it.type, it.ammo);
      } else {
        /* the gun they carry: its rounds top up the reserve (up to a full load) */
        const s = it.type === 1 ? 1 : it.type === (a.prim || 0) ? 0 : -1;
        if (s < 0 || !a.rsv) return;
        const W = K.WEAPON_DATA[it.type],
          room = W.mag + W.reserve - a.ammo[s] - a.rsv[s],
          give = it.ammo ? it.ammo[0] + it.ammo[1] : W.mag;
        if (room <= 0 || give <= 0 || !it.take()) return;
        a.rsv[s] += Math.min(room, give);
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
      const foes = [];
      for (const e of G.foes(team)) if (e.alive) foes.push(e.body);
      let pts = G.spawnList(team);
      /* during an opening drop the players stay off the AI's spots (G.start) */
      if (G.t < (G.dropT || 0)) {
        const held = dropSpots(team);
        const free = pts.filter(p => !held.includes(p));
        if (free.length) pts = free;
      }
      return K.pickSpawn(pts, foes, G.fights, G.t, K.rand, G.pods ? G.taken() : undefined);
    };
    /** with drop pods: where pilots stand and pods are coming down (pending AI pods, players' relayed
        pods, and in a rendered match every pod in the world), so nobody lands on anybody */
    G.taken = function () {
      const out = [];
      for (const a of G.agents) {
        if (a.alive) out.push(a.body.pos);
        else if (a.podAt && a.podPt) out.push({ x: a.podPt[0], y: a.podPt[1], z: a.podPt[2] });
        if (a.vpod && !a.vpod.landed) out.push(a.vpod.at);
      }
      if (G.render && K.podSpots) for (const p of K.podSpots(null)) out.push(p);
      return out;
    };
    /* the opening drop's spots for a team's AI pilots (CTF.dropSpots); in free-for-all each AI pilot
       takes its own spawn, spread over the list */
    function dropSpots(team) {
      if (!ffa) return CTF.dropSpots(team, G.teams[team].agents.filter(a => !a.human).length);
      const ai = G.agents.filter(a => !a.human),
        pts = CTF.FFA_SPAWNS,
        k = ai.findIndex(a => a.team === team);
      if (k < 0) return ai.map((a, i) => pts[i % pts.length]);
      return [pts[k % pts.length]];
    }
    /** drop: a rendered match opens with every AI dropping in by pod (the respawn below, launching
        at once and landing together); the time limit gets the fall back. Headless matches never do */
    G.start = function (drop) {
      for (const p of G.pickups) p.availAt = 0;
      K.resetDestruction();
      if (G.render) K.DESTR.bodies = () => G.agents.map(a => a.body);
      const fall = !!drop && G.pods;
      for (const a of G.agents) if (!a.human && !fall) a.spawn(G.spawnPoint(a.team));
      /* each AI pilot drops onto a spot of its own (CTF.dropSpots) */
      if (fall)
        for (const tm of G.teams) {
          const ai = tm.agents.filter(a => !a.human),
            spots = dropSpots(tm.team);
          ai.forEach((a, k) => {
            const pt = spots[k % spots.length];
            a.dead = true;
            a.respawnAt = G.t + K.POD_EARLY;
            a.podPt = pt;
            a.podFor = a.respawnAt;
            a.podOpen =
              K.rayWorld(new K.THREE.Vector3(pt[0], pt[1] + 2.2, pt[2]), new K.THREE.Vector3(0, 1, 0), 60) >=
              59;
          });
        }
      if (fall) {
        G.dropT = K.POD_TIME;
        G.timeLimit += K.POD_TIME;
      }
      /* the first skull comes down a few seconds after everyone is on the ground */
      if (G.ball) {
        G.ball.landAt =
          G.t + (fall ? K.POD_TIME : 0) + (opts.ballFirst != null ? opts.ballFirst : MD.ballFirst);
        G.ball.podSent = false;
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
        victim.respawnAt = G.t + G.respawnDelay;
        if (victim.rig && G.render)
          victim.rig.die(
            killer && killer !== victim ? killer.pos : null,
            /sniper|charge|frag|stick|pound/.test(type || "") ? 2 : 1
          );
      }
      victim.d++;
      /* a teamkill (friendly fire) costs a point instead of earning one */
      if (killer && killer !== victim) killer.k += killer.team === victim.team ? -1 : 1;
      /* team deathmatch: a kill on the other team is the score */
      if (G.tdm && killer && killer !== victim && killer.team !== victim.team) {
        G.teams[killer.team].score++;
        if (G.teams[killer.team].score >= G.scoreLimit) G.finish(killer.team);
      }
      const p = victim.pos.clone();
      /* weapons and grenades fall where they died (you report your own drop) */
      if (!victim.local && !G.lock) G.addItems(G.loadoutOf(victim), p);
      victim.sniper = victim.sniperMag = victim.rocket = 0;
      victim.pw = null;
      victim.pwOut = false;
      /* what the kill meant, for medals and the post-match moments: the carrier went down (a flag
         carrier near their own stand is a denial) */
      const carried = victim.carrying === G.ball && G.ball ? "ball" : victim.carrying ? "flag" : "";
      const denial =
        carried === "flag" &&
        !!killer &&
        killer.team !== victim.team &&
        p.distanceTo(CTF.FLAG_HOME[victim.team]) < 20;
      if (carried === "ball") dropBall(victim, killer);
      else if (victim.carrying) {
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
      G.emit("kill", { victim, killer, type, head, carried, denial });
    };
    /** a player holding Interact at the enemy flag */
    G.humanTakeFlag = function (a) {
      const f = G.flags[1 - a.team];
      if (!f || !a || !a.alive || a.carrying || f.state === "carried" || a.pos.distanceTo(f.pos) > 1.8)
        return false;
      pickup(f, a);
      return true;
    };
    /** let go of the flag or the skull where you stand (switching weapons, sprinting or thrusting
        with the flag does this) */
    G.dropFlagBy = function (a) {
      if (!a || !a.carrying) return;
      dropFlag(a);
    };
    /* ---- the skull (oddball) ---- */
    function takeBall(a) {
      const B = G.ball;
      B.state = "carried";
      B.carrier = a;
      a.carrying = B;
      G.emit("ballTaken", { by: a });
      const br = G.teams[a.team].brain;
      br.say(
        G,
        a.human ? br.leader(G) : a,
        "ball",
        a.human ? `${a.name} has the skull, cover them` : "I've got the skull! Cover me",
        true
      );
      const ob = G.teams[1 - a.team].brain,
        l = ob.leader(G);
      if (l) ob.say(G, l, "ballL", `They have the skull. ${a.name}, ${CTF.zoneName(ob.team, a.pos)}`, true);
    }
    function dropBall(a, killer) {
      const B = G.ball;
      B.state = "dropped";
      B.carrier = null;
      B.dropT = G.t;
      const p = a.pos;
      B.pos.set(p.x, K.groundBelow(p.x, p.z, p.y + 0.5, 0.05), p.z);
      a.carrying = null;
      B.noPick = a;
      B.noPickT = G.t + 1.2;
      G.emit("ballDrop", { by: a, killer });
      if (killer && killer.team !== a.team) {
        const br = G.teams[killer.team].brain;
        br.say(
          G,
          killer.human ? br.leader(G) : killer,
          "ballD",
          `Carrier down, skull ${CTF.zoneName(br.team, B.pos)}`,
          true
        );
      }
    }
    /** the skull goes away and comes down again by pod in the middle */
    function resetBall() {
      const B = G.ball;
      B.state = "incoming";
      B.carrier = null;
      B.landAt = G.t + K.POD_TIME + 1;
      B.podSent = false;
      G.emit("ballReset", {});
    }
    const _bp = new K.THREE.Vector3();
    function stepBall(dt) {
      const B = G.ball;
      if (B.state === "incoming") {
        if (!B.podSent && G.t >= B.landAt - K.POD_TIME) {
          B.podSent = true;
          G.emit("ballPod", { pos: CTF.BALL_HOME.clone() });
        }
        if (G.t < B.landAt) return;
        B.state = "home";
        B.pos.copy(CTF.BALL_HOME);
        /* the pod lands on whoever is standing on the spot */
        for (const e of G.agents)
          if (
            e.alive &&
            Math.hypot(e.pos.x - B.pos.x, e.pos.z - B.pos.z) < 1.5 &&
            Math.abs(e.pos.y - B.pos.y) < 2.2
          ) {
            if (e.human) G.hurtHuman(e, 999, { name: "Skull pod", agent: null, world: true, w: "pod" });
            else e.onHit(999, "pod", false, false);
          }
        G.emit("ballSpawn", { pos: B.pos });
        return;
      }
      if (B.state === "carried") {
        const c = B.carrier;
        if (!c || !c.alive) {
          if (c) dropBall(c, null);
          else B.state = "dropped";
          return;
        }
        B.pos.copy(c.pos);
        /* the carrier's team scores every second it is held (from the moment the match clock runs) */
        if (G.t >= (G.dropT || 0)) {
          const tm = G.teams[c.team];
          tm.held += dt;
          c.ballT = (c.ballT || 0) + dt;
          tm.score = Math.floor(tm.held);
          if (tm.held >= G.scoreLimit) G.finish(c.team);
        }
        return;
      }
      if (B.state === "dropped" && (G.t - B.dropT > G.ballReset || B.pos.y < -5)) {
        resetBall();
        return;
      }
      /* on the floor: anyone who touches it picks it up */
      for (const a of G.agents) {
        if (!a.alive || a.carrying || (a === B.noPick && G.t < B.noPickT)) continue;
        _bp.copy(a.pos);
        if (Math.hypot(_bp.x - B.pos.x, _bp.z - B.pos.z) < 1.2 && Math.abs(_bp.y - B.pos.y) < 1.8) {
          takeBall(a);
          break;
        }
      }
    }
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
      /* the teams learn from capture the flag (their strategies and the map are about it) */
      if (rules === "ctf") {
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
      }
      G.emit("end", { winner });
    };
    /** who leads when time runs out: the best score (held time in oddball), -1 for a tie */
    G.leader = function () {
      const val = tm => (G.ball ? tm.held : tm.score);
      let best = -1,
        bv = -Infinity,
        tie = false;
      for (const tm of G.teams) {
        const v = val(tm);
        if (v > bv) {
          bv = v;
          best = tm.team;
          tie = false;
        } else if (v === bv) tie = true;
      }
      return tie ? -1 : best;
    };
    G.step = function (dt) {
      if (G.over) return;
      G.t += dt;
      K.gatesAt(G.t, G.gates);
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
            /* a carrier's hands are full */
            !a.carrying &&
            (p.power ? !(p.lab && a.armed) : !a.prim) &&
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
        if (f.state === "dropped" && G.t - f.dropT > G.flagReset) {
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
            /* a return from near their capture point saved the match: a clutch return */
            const clutch = f.pos.distanceTo(CTF.FLAG_HOME[enemy]) < 20;
            f.state = "home";
            f.pos.copy(CTF.FLAG_HOME[own]);
            a.rets++;
            G.emit("flagReturn", { flag: f, by: a, clutch });
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
      if (G.ball) stepBall(dt);
      // stalled segments re-plan
      if (rules === "ctf")
        for (const tm of G.teams) {
          if (G.t - tm.brain.segStart > 80 && !G.flags[1 - tm.team].carrier) {
            tm.brain.endSegment(G, 0.3 + Math.min(0.3, tm.brain.segFlagPulls * 0.1));
            tm.brain.chooseStrategy(G, "This isn't working.");
          }
        }
      if (G.t >= G.timeLimit && !G.over) G.finish(G.leader());
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
