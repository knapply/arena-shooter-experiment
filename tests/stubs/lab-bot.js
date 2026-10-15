/* The network lab's player and recorder (tools/net-lab.js, tests/netlab.test.js), injected into each
   game instance. With window.__LAB.bot on, it plays: runs at the objective (the enemy flag, the skull,
   the nearest enemy), fights whoever it can see, and uses the movement kit (sprint, slide, jump,
   thrust, melee, grenades), through the game's input actions (KA.input) and the view angles.
   It also records what the lab measures, read with window.__lab.collect():
     truth   [time, id, x, z, alive] where this instance is the authority (itself; on a host, its AI)
     drawn   [time, id, x, z] where this instance draws everyone else
     pb      playback stats per remote: [time, id, delay, gap, jitter]
     kills   [time, killer, victim] as this instance saw them
     state   [time, scores, flags, skull, match clock] every 250 ms
     heap    garbage collections seen in the JS heap (count and bytes freed), frames and frame time
   Times are Date.now(): every instance runs on this machine, so they share the clock. */
(function () {
  const LAB = window.__LAB || {};
  const rec = { truth: [], drawn: [], pb: [], kills: [], state: [], hitches: [], frames: 0, ft: 0 };
  const heap = { gcs: 0, freed: 0, last: 0 };
  let lastS = 0,
    lastState = 0,
    lastPb = 0,
    lastT = 0;
  const bot = {
    on: !!LAB.bot,
    stuckT: 0,
    unstickT: 0,
    strafe: 1,
    strafeT: 0,
    kitT: 2,
    nadeT: 4,
    wp: null,
    wpT: 0,
    seed: Math.random(),
  };
  const held = new Set();
  function hold(a, on) {
    if (on === held.has(a)) return;
    if (on) held.add(a);
    else held.delete(a);
    KA.input.hold(a, on);
  }
  const release = () => {
    for (const a of [...held]) hold(a, false);
  };
  const game = () => (window.CTF && CTF.UI && CTF.UI.game ? CTF.UI.game() : null);
  /** what this instance is in: a mode match (host or client), the arena, or nothing */
  function ctx() {
    const g = game();
    if (g && KA.EXT && !g.over) {
      const client = !!g.map;
      const meA = g.human;
      return { kind: "mode", g, client, meA, team: meA ? meA.team : -1, rules: g.rules };
    }
    if (KA.playing && !KA.EXT) return { kind: "arena" };
    return null;
  }
  const myPeer = () => {
    const s = window.KAHOST && window.KAHOST.net.stats();
    return s ? s.me : "local";
  };
  function agents(c) {
    return c.client ? [...c.g.map.values()] : c.g.agents;
  }
  /** enemies with a position: [{ id, pos, alive }] */
  function enemies(c) {
    if (c.kind === "arena") {
      const out = [];
      for (const [peer, r] of KA.remotes)
        if (r.has && !r.dead && r.rig) out.push({ id: peer, pos: r.rig.root.position });
      for (const b of KA.bots) if (!b.body.dead) out.push({ id: b.id, pos: b.body.pos });
      return out;
    }
    const ffa = c.rules === "ffa";
    return agents(c)
      .filter(a => a !== c.meA && a.alive !== false && !a.dead && (ffa || a.team !== c.team))
      .map(a => ({ id: a.id, pos: a.body.pos }));
  }
  /** where to go when nobody is in sight */
  function objective(c) {
    const me = KA.me;
    if (c.kind === "mode") {
      const g = c.g,
        t = c.team;
      if (c.rules === "ctf" && g.flags && g.flags.length === 2) {
        const mine = g.flags[t],
          theirs = g.flags[1 - t];
        if (theirs.carrier && (theirs.carrier === c.meA || theirs.carrier.id === (c.meA && c.meA.id)))
          return CTF.FLAG_HOME[t];
        if (mine.state === "carried" && mine.carrier && mine.carrier.body) return mine.carrier.body.pos;
        if (mine.state === "dropped") return mine.pos;
        return theirs.pos;
      }
      if (c.rules === "oddball" && g.ball) {
        const b = g.ball;
        if (b.carrier && c.meA && (b.carrier === c.meA || b.carrier.id === c.meA.id)) return null;
        if (b.carrier && b.carrier.body) return b.carrier.body.pos;
        return b.pos;
      }
    }
    const es = enemies(c);
    let best = null,
      bd = 1e9;
    for (const e of es) {
      const d = e.pos.distanceTo(me.pos);
      if (d < bd) {
        bd = d;
        best = e.pos;
      }
    }
    return best;
  }
  const V = () => new KA.THREE.Vector3();
  /* made once the game has loaded */
  let eye = null,
    tgt = null;
  function visibleEnemy(c) {
    const me = KA.me;
    eye.copy(me.pos);
    eye.y += 1.6;
    let best = null,
      bd = 70;
    for (const e of enemies(c)) {
      const d = e.pos.distanceTo(me.pos);
      if (d >= bd) continue;
      tgt.copy(e.pos);
      tgt.y += 1.1;
      if (KA.losClear(eye, tgt)) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  function look(at, err) {
    const me = KA.me;
    const dx = at.x - me.pos.x,
      dy = at.y - (me.pos.y + 1.6),
      dz = at.z - me.pos.z,
      L = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * err,
      pitch = Math.asin(Math.max(-1, Math.min(1, dy / L))) + (Math.random() - 0.5) * err;
    let dyaw = Math.atan2(Math.sin(yaw - me.yaw), Math.cos(yaw - me.yaw));
    /* a quick but not instant turn */
    me.yaw += Math.max(-0.35, Math.min(0.35, dyaw));
    me.pitch += Math.max(-0.2, Math.min(0.2, pitch - me.pitch));
    return Math.abs(dyaw);
  }
  function play(c, dt) {
    const me = KA.me;
    if (me.dead) {
      release();
      KA.input.press("jump"); /* skip the pod camera */
      return;
    }
    if (KA.POST && KA.POST.open) return release();
    const carrying = KA.EXT && KA.EXT.carrying ? KA.EXT.carrying() : "";
    const foe = visibleEnemy(c);
    let goal = null;
    if (foe) {
      tgt.copy(foe.pos);
      tgt.y += 1.1;
      const off = look(tgt, 0.04);
      const d = foe.pos.distanceTo(me.pos);
      hold("fire", off < 0.12 && !carrying);
      hold("aim", d > 25 && !carrying);
      if (d < 2.6) KA.input.press("melee");
      bot.nadeT -= dt;
      if (bot.nadeT < 0 && d > 10 && d < 28 && !carrying) {
        KA.input.press("grenade");
        bot.nadeT = 5 + Math.random() * 5;
      }
      goal = d > 12 ? foe.pos : null;
      /* strafe while fighting */
      bot.strafeT -= dt;
      if (bot.strafeT < 0) {
        bot.strafe = -bot.strafe;
        bot.strafeT = 0.4 + Math.random() * 0.9;
      }
      hold("left", bot.strafe < 0);
      hold("right", bot.strafe > 0);
    } else {
      hold("fire", false);
      hold("aim", false);
      hold("left", false);
      hold("right", false);
      goal = objective(c);
    }
    /* no goal (or stuck): a random waypoint for a while */
    bot.wpT -= dt;
    if (!goal || bot.unstickT > 0) {
      if (!bot.wp || bot.wpT < 0) {
        bot.wp = V().set(
          me.pos.x + (Math.random() - 0.5) * 40,
          me.pos.y,
          me.pos.z + (Math.random() - 0.5) * 40
        );
        bot.wpT = 2.5;
      }
      goal = bot.wp;
    }
    if (goal && !foe) {
      tgt.copy(goal);
      tgt.y = me.pos.y + 1.6;
      look(tgt, 0);
    }
    const far = goal ? Math.hypot(goal.x - me.pos.x, goal.z - me.pos.z) : 0;
    const move = !!goal && far > 1.5;
    hold("forward", move);
    /* a carrier walks: sprinting or thrusting would drop the flag */
    hold("sprint", move && !foe && !carrying);
    /* stuck against something: jump, thrust and go around */
    const sp = Math.hypot(me.vel.x, me.vel.z);
    if (move && sp < 1.5) bot.stuckT += dt;
    else bot.stuckT = 0;
    bot.unstickT -= dt;
    if (bot.stuckT > 0.6) {
      KA.input.press("jump");
      if (!carrying) KA.input.press("thrust");
      bot.stuckT = 0;
      bot.unstickT = 1.5;
      bot.wp = null;
    }
    /* the movement kit, now and then */
    bot.kitT -= dt;
    if (bot.kitT < 0 && move) {
      const r = Math.random();
      if (r < 0.35 && !carrying) KA.input.press("crouch"); /* a slide out of the sprint */
      else if (r < 0.65) KA.input.press("jump");
      else if (r < 0.85 && !carrying) KA.input.press("thrust");
      else if (!me.ground) KA.input.press("crouch"); /* a ground pound in the air */
      bot.kitT = 1.5 + Math.random() * 3;
    }
  }
  function ids(c) {
    if (c.kind === "arena") return { me: myPeer() };
    return { me: c.meA ? c.meA.id : "local" };
  }
  function sample(c, t) {
    const me = KA.me;
    const id = ids(c).me;
    rec.truth.push([t, id, +me.pos.x.toFixed(3), +me.pos.z.toFixed(3), me.dead ? 0 : 1]);
    if (c.kind === "arena") {
      for (const [peer, r] of KA.remotes)
        if (r.has && r.rig && !r.dead) {
          const p = r.rig.root.position;
          rec.drawn.push([t, peer, +p.x.toFixed(3), +p.z.toFixed(3)]);
        }
      return;
    }
    for (const a of agents(c)) {
      if (a === c.meA) continue;
      const p = a.body.pos;
      const alive = a.alive !== false && !a.dead;
      /* the authority's own AI is truth; everyone else is drawn from the network */
      if (!c.client && !a.human) rec.truth.push([t, a.id, +p.x.toFixed(3), +p.z.toFixed(3), alive ? 1 : 0]);
      else if (alive) rec.drawn.push([t, a.id, +p.x.toFixed(3), +p.z.toFixed(3)]);
    }
  }
  function samplePb(c, t) {
    const add = (id, pb) => {
      if (pb && pb.ready)
        rec.pb.push([
          t,
          id,
          Math.round(pb.delay * 1000),
          Math.round(pb.gap * 1000),
          Math.round(pb.jit * 1000),
        ]);
    };
    if (c.kind === "arena") for (const [peer, r] of KA.remotes) add(peer, r.pb);
    else if (c.client) {
      for (const a of c.g.map.values()) if (a.pb) add(a.id, a.pb);
    } else if (c.g.net) for (const a of c.g.net.remote.values()) add(a.id, a.pb);
  }
  function sampleState(c, t) {
    if (c.kind !== "mode") return;
    const g = c.g;
    rec.state.push([
      t,
      g.teams ? g.teams.map(x => x.score).join(",") : "",
      g.flags ? g.flags.map(f => f.state + (f.carrier ? ":" + f.carrier.id : "")).join(",") : "",
      g.ball ? g.ball.state + (g.ball.carrier ? ":" + g.ball.carrier.id : "") : "",
      Math.round((g.t || 0) * 10) / 10,
      c.client ? "client" : "host",
    ]);
  }
  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    /* a stalled frame (this machine, not the network): [when it ended, how long it took] */
    if (lastT && now - lastT > 150) rec.hitches.push([Date.now(), Math.round(now - lastT)]);
    lastT = now;
    rec.frames++;
    rec.ft += dt;
    if (performance.memory) {
      const h = performance.memory.usedJSHeapSize;
      if (heap.last && h < heap.last - 64 * 1024) {
        heap.gcs++;
        heap.freed += heap.last - h;
      }
      heap.last = h;
    }
    if (!window.KA || !KA.THREE) return;
    if (!eye) {
      eye = V();
      tgt = V();
    }
    const c = ctx();
    if (!c) return release();
    if (bot.on) play(c, dt);
    const t = Date.now();
    if (t - lastS >= 33) {
      lastS = t;
      sample(c, t);
    }
    if (t - lastPb >= 1000) {
      lastPb = t;
      samplePb(c, t);
    }
    if (t - lastState >= 250) {
      lastState = t;
      sampleState(c, t);
    }
  }
  requestAnimationFrame(frame);
  addEventListener("load", () => {
    const hook = () => {
      if (!window.KA || !KA.EVENTS) return setTimeout(hook, 100);
      KA.EVENTS.on("kill", e => rec.kills.push([Date.now(), e.killerName || "", e.victimName || ""]));
    };
    hook();
  });
  window.__lab = {
    bot,
    /** everything recorded since the last collect (cleared) */
    collect() {
      const out = Object.assign({}, rec, { heap: Object.assign({}, heap) });
      for (const k of ["truth", "drawn", "pb", "kills", "state", "hitches"]) rec[k] = [];
      rec.frames = rec.ft = 0;
      heap.gcs = heap.freed = 0;
      return out;
    },
  };
})();
