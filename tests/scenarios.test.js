/* Scenario tests: movement feel, hit registration and mode rules, scripted and run headlessly.
   The movement numbers are the sandbox's current "feel contract": a change to them should be a
   deliberate tuning change (update the range here in the same commit), never an accident. */
const { check, finish } = require("./lib/check.js");
const { scenario, shoot, K, CTF } = require("./lib/scenario.js");
const t0 = Date.now();
/* an open runway in the arena: start at (-30, -6) running +x */
const RUN = [-30, 0, -6],
  EAST = 1.5 * Math.PI;
const ran = r => Math.hypot(r.P.a.pos.x - RUN[0], r.P.a.pos.z - RUN[2]);
const between = (v, lo, hi) => v >= lo && v <= hi;
const fix = v => +v.toFixed(2);

/* ---------- movement ---------- */
{
  const walk = ran(
    scenario({ pilots: { a: { pos: RUN, yaw: EAST } }, seconds: 1, input: () => ({ a: { f: 1 } }) })
  );
  check(between(walk, 5.5, 6.8), "walking covers ~6 m in a second", fix(walk));
  const sprint = scenario({
    pilots: { a: { pos: RUN, yaw: EAST } },
    seconds: 2,
    input: () => ({ a: { f: 1, sprint: true } }),
  });
  const top = Math.hypot(sprint.P.a.vel.x, sprint.P.a.vel.z);
  check(between(top, 8.5, 9.5), "sprint top speed ~9 m/s", fix(top));
  const strafe = ran(
    scenario({ pilots: { a: { pos: RUN, yaw: 0 } }, seconds: 1, input: () => ({ a: { s: 1 } }) })
  );
  check(Math.abs(strafe - walk) < 0.3, "strafing is as fast as running forward", fix(strafe));
  /* strafing: time to go from full speed one way to 90% the other way */
  let flipT = null;
  scenario({
    pilots: { a: { pos: [-22, 0, -6], yaw: 0 } },
    seconds: 1.6,
    input: t => ({ a: { s: t < 1 ? 1 : -1 } }),
    every: (t, P) => {
      if (flipT == null && t > 1 && P.a.vel.x < -6.4 * 0.9) flipT = t - 1;
    },
  });
  check(
    flipT != null && between(flipT, 0.12, 0.18),
    "a full strafe reversal takes ~0.15 s",
    flipT && fix(flipT)
  );
  let upT = null;
  scenario({
    pilots: { a: { pos: [-22, 0, -6], yaw: 0 } },
    seconds: 0.5,
    input: () => ({ a: { s: 1 } }),
    every: (t, P) => {
      if (upT == null && P.a.vel.x > 6.4 * 0.9) upT = t;
    },
  });
  check(
    upT != null && between(upT, 0.06, 0.12),
    "starting from rest to full strafe takes ~0.08 s",
    upT && fix(upT)
  );
  const ads = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: 0 } },
      seconds: 1,
      input: () => ({ a: { s: 1, aim: true, aimMul: 0.9 } }),
    })
  );
  check(between(ads, 5.2, 6), "strafing while aiming a low-zoom scope keeps 90% speed", fix(ads));
  const w06 = ran(
    scenario({ pilots: { a: { pos: RUN, yaw: EAST } }, seconds: 0.6, input: () => ({ a: { f: 1 } }) })
  );
  const th06 = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: EAST } },
      seconds: 0.6,
      input: t => ({ a: { f: 1, thrust: t < 0.01 } }),
    })
  );
  check(th06 > w06 * 1.8, "thrust more than doubles short-range movement", {
    thrust: fix(th06),
    walk: fix(w06),
  });
  let apex = 0;
  const jump = scenario({
    pilots: { a: { pos: RUN, yaw: 0 } },
    seconds: 1.5,
    input: t => ({ a: { jumpP: t < 0.01 } }),
    every: (t, P) => (apex = Math.max(apex, P.a.pos.y)),
  });
  check(
    between(apex, 1.0, 1.3) && jump.events.some(e => e.type === "land"),
    "jump reaches ~1.1 m and lands",
    fix(apex)
  );
  const slide = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: EAST } },
      seconds: 2.2,
      input: t => ({ a: { f: 1, sprint: true, crouchP: Math.abs(t - 1.2) < 0.005, crouch: t > 1.2 } }),
    })
  );
  const noSlide = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: EAST } },
      seconds: 2.2,
      input: () => ({ a: { f: 1, sprint: true } }),
    })
  );
  check(slide >= noSlide - 0.5, "sliding out of a sprint keeps your momentum", {
    slide: fix(slide),
    run: fix(noSlide),
  });
  const pound = scenario({
    pilots: { a: { pos: [-30, 10, -6], air: true, pitch: -1.2 } },
    seconds: 2,
    input: t => ({ a: { crouchP: t < 0.01, crouch: t < 0.65 } }),
  });
  const slam = pound.events.find(e => e.type === "slam");
  check(!!slam && slam.t < 1.3, "ground pound charges, dives and slams", slam && fix(slam.t));
  const tap = scenario({
    pilots: { a: { pos: [-30, 10, -6], air: true } },
    seconds: 2,
    input: t => ({ a: { crouchP: t < 0.01, crouch: t < 0.2 } }),
  });
  check(!tap.events.some(e => e.type === "slam"), "releasing early cancels the pound");
}

/* ---------- movement tech ---------- */
{
  /* thrust into slide: a slide straight out of a thrust, faster than a sprint but capped */
  let peak = 0;
  const ts = scenario({
    pilots: { a: { pos: RUN, yaw: EAST } },
    seconds: 1,
    input: t => ({ a: { f: 1, thrust: t < 0.01, crouchP: Math.abs(t - 0.12) < 0.005, crouch: t > 0.12 } }),
    every: (t, P) => (peak = Math.max(peak, Math.hypot(P.a.vel.x, P.a.vel.z))),
  });
  const slid = ts.events.find(e => e.type === "slide");
  check(!!slid && peak <= 17.01, "thrust into slide works and stays capped", {
    slide: !!slid,
    peak: fix(peak),
  });
  /* slide-jump keeps the slide's speed in the air */
  let airSpeed = 0;
  scenario({
    pilots: { a: { pos: RUN, yaw: EAST } },
    seconds: 1.8,
    input: t => ({
      a: {
        f: 1,
        sprint: true,
        crouchP: Math.abs(t - 1.1) < 0.005,
        crouch: t > 1.1 && t < 1.25,
        jumpP: Math.abs(t - 1.25) < 0.005,
      },
    }),
    every: (t, P) => {
      if (t > 1.3 && t < 1.4 && !P.a.ground) airSpeed = Math.max(airSpeed, Math.hypot(P.a.vel.x, P.a.vel.z));
    },
  });
  check(airSpeed > 9.5, "slide-jump carries more than sprint speed into the air", fix(airSpeed));
  /* crouch-jump: from the 2.2 m pillar ledge only a crouch-jump reaches the 6 m perch */
  const perch = tuck =>
    scenario({
      pilots: { a: { pos: [26.6, 2.2, 0], yaw: EAST } },
      seconds: 1,
      input: t => ({ a: { f: 1, jumpP: t < 0.01, crouch: tuck && t > 0.05 } }),
    }).events.some(e => e.type === "clamber");
  check(!perch(false) && perch(true), "crouch-jump clambers a ledge a plain jump can't", {
    plain: perch(false),
    crouch: perch(true),
  });
  const ledge = scenario({
    pilots: { a: { pos: [24, 0, 0], yaw: EAST } },
    seconds: 1.2,
    input: t => ({ a: { f: 1, jumpP: Math.abs(t - 0.2) < 0.005 } }),
  });
  check(
    Math.abs(ledge.P.a.pos.y - 2.2) < 0.05,
    "the skill-route ledge is reachable from the floor",
    fix(ledge.P.a.pos.y)
  );
  /* stabilize: aiming in the air holds your height */
  let y0 = null,
    drift = 0;
  scenario({
    pilots: { a: { pos: RUN, yaw: 0 } },
    seconds: 1.5,
    input: t => ({ a: { jumpP: t < 0.01, aim: t > 0.35 } }),
    every: (t, P) => {
      if (t > 0.4 && y0 == null) y0 = P.a.pos.y;
      if (t > 0.4 && t < 1.4) drift = Math.max(drift, Math.abs(P.a.pos.y - y0));
    },
  });
  check(drift < 0.2, "stabilize holds your height for a second", fix(drift));
  /* aimed ground pound: aiming forward lands further away than straight down */
  const poundAt = pitch => {
    const r = scenario({
      pilots: { a: { pos: [-30, 9, -6], air: true, yaw: EAST, pitch } },
      seconds: 2,
      input: t => ({ a: { crouchP: t < 0.01, crouch: t < 0.65 } }),
    });
    const e = r.events.find(x => x.type === "slam");
    return e ? Math.hypot(e.d.pos.x + 30, e.d.pos.z + 6) : -1;
  };
  const down = poundAt(-1.5),
    fwd = poundAt(-0.5);
  check(down >= 0 && fwd > down + 4, "aimed ground pound lands where you aim", {
    down: fix(down),
    forward: fix(fwd),
  });
}

/* ---------- kill times (data/weapons.js) ---------- */
{
  const [carbine, magnum, sniper] = K.WEAPON_DATA;
  const km = K.killStats(magnum);
  check(
    km.best.shots === 5 && Math.abs(km.best.time - 1.05) < 0.05,
    "magnum perfect kill: 5 shots in ~1.05 s",
    km.best
  );
  const kc = K.killStats(carbine);
  check(
    between(kc.best.time, 0.9, 1.4) && kc.body.time - kc.best.time <= 0.2,
    "carbine kills in ~1.1-1.2 s",
    kc
  );
  const ks = K.killStats(sniper);
  check(ks.best.shots === 1 && ks.body.shots === 2, "sniper: one headshot or two body shots", ks);
  check(
    K.WEAPON_DATA.filter(w => w.precision).every(w => w.spread === 0 && w.adsSpread === 0 && w.bloom === 0),
    "precision weapons have no random spread"
  );
  check(
    K.WEAPON_DATA.every(w => Math.exp(-w.recover * w.rate) < 0.01 || !w.precision),
    "precision recoil returns to center before the next shot"
  );
}

/* ---------- hit registration ---------- */
{
  const T = scenario({
    pilots: { b: { pos: [-22, 0, 10] }, c: { pos: [-20, 0, 10], crouch: true } },
    seconds: 0.05,
  }).P;
  T.c.h = K.H_CROUCH;
  const headY = T.b.pos.y + T.b.h - 0.24;
  const head = shoot([-22, 1.6, -10], [-22, headY, 10], { b: T.b });
  const body = shoot([-22, 1.6, -10], [-22, T.b.pos.y + 1.0, 10], { b: T.b });
  check(head && head.id === "b" && head.head, "a shot at the head is a headshot at 20 m", head);
  check(body && body.id === "b" && !body.head, "a shot at the chest is a body shot", body);
  const over = shoot([-20, 1.6, -10], [-20, headY, 10], { c: T.c });
  check(
    over === null || over === "world" || !over.head,
    "standing head height passes over a crouched pilot",
    over
  );
  const wide = shoot([-22, 1.6, -10], [-21.3, headY, 10], { b: T.b });
  check(wide === null || wide === "world", "a shot 0.7 m wide misses", wide);
  const wall = shoot([0, 1.5, -20], [0, 1.5, 20], {
    c: scenario({ pilots: { c: { pos: [0, 0, 20] } }, seconds: 0.05 }).P.c,
  });
  check(wall === "world", "the central core blocks shots", wall);
}

/* ---------- capture-the-flag rules ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 1 });
  const ev = [];
  G.onEvent = (t, d) => ev.push(t);
  G.start();
  for (let i = 0; i < 30; i++) G.step(1 / 30);
  const a = G.agents.find(x => x.team === 0);
  const hold = (pos, n) => {
    for (let i = 0; i < n; i++) {
      a.body.pos.copy(pos);
      a.body.vel.set(0, 0, 0);
      a.body.shield = 70;
      a.body.health = 45;
      G.step(1 / 30);
    }
  };
  hold(CTF.FLAG_HOME[1], 4);
  check(G.flags[1].state === "home", "the flag isn't taken by just brushing past it", G.flags[1].state);
  hold(CTF.FLAG_HOME[1], 14);
  check(
    G.flags[1].state === "carried" && G.flags[1].carrier === a,
    "standing at the enemy flag picks it up (a short hold, like Interact)",
    G.flags[1].state
  );
  const s0 = G.teams[0].score;
  if (G.flags[0].state === "home") {
    hold(CTF.FLAG_HOME[0], 6);
    check(G.teams[0].score === s0 + 1 && ev.includes("capture"), "bringing it home scores", G.teams[0].score);
    check(G.flags[1].state === "home", "the captured flag resets to its base", G.flags[1].state);
  } else check(false, "own flag stayed home for the capture test", G.flags[0].state);
  /* a carrier who dies drops the flag; it returns home after 15 s untouched */
  hold(CTF.FLAG_HOME[1], 16);
  /* bench everyone else so no defender returns it by touch */
  for (const x of G.agents)
    if (x !== a) {
      x.dead = true;
      x.body.dead = true;
      x.respawnAt = 1e9;
    }
  G.kill(a, null, "rifle", false);
  a.respawnAt = 1e9;
  G.step(1 / 30);
  check(G.flags[1].state === "dropped", "a carrier's death drops the flag", G.flags[1].state);
  for (let i = 0; i < 16 * 30 && G.flags[1].state === "dropped"; i++) G.step(1 / 30);
  check(
    G.flags[1].state === "home" && ev.includes("flagReset"),
    "a dropped flag resets after 15 s",
    ev.slice(-4)
  );
}
/* ---------- friendly fire, death drops, AI that only knows what it sees ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 5 });
  G.start();
  for (let i = 0; i < 30; i++) G.step(1 / 30);
  check(G.ff === true, "friendly fire is on by default", G.ff);
  const [a, mate] = G.teams[0].agents;
  const k0 = a.k,
    n0 = G.items.length;
  G.kill(mate, a, "rifle", false);
  check(a.k === k0 - 1, "a teamkill costs a point", { before: k0, after: a.k });
  check(G.items.length > n0, "the dead drop their weapon and grenades", G.items.length - n0);
  /* bench everyone but a watcher and one quiet enemy behind them */
  const e = G.teams[1].agents[0];
  for (const x of G.agents)
    if (x !== a && x !== e) {
      x.dead = true;
      x.body.dead = true;
      x.respawnAt = 1e9;
    }
  const find = () => {
    for (let x = -30; x <= 30; x += 3)
      for (let z = -30; z <= 30; z += 3) {
        const p = new K.THREE.Vector3(x, 0, z);
        p.y = K.groundBelow(x, z, 20, 0.05);
        const q = p.clone().add(new K.THREE.Vector3(0, 0, 12));
        q.y = K.groundBelow(q.x, q.z, 20, 0.05);
        if (Math.abs(q.y - p.y) > 0.1 || !K.freeAt(p, 1.8) || !K.freeAt(q, 1.8)) continue;
        const eye = p.clone().setY(p.y + 1.5),
          d = q
            .clone()
            .setY(q.y + 1.2)
            .sub(eye);
        const L = d.length();
        if (K.rayWorld(eye, d.normalize(), L) >= L - 0.1) return [p, q];
      }
    return null;
  };
  const spot = find();
  if (!spot) check(false, "found an open spot for the perception test");
  else {
    const [pa, pe] = spot;
    const pin = (yawA, n) => {
      for (let i = 0; i < n; i++) {
        a.body.pos.copy(pa);
        a.body.vel.set(0, 0, 0);
        a.body.yaw = yawA;
        e.body.pos.copy(pe);
        e.body.vel.set(0, 0, 0);
        e.body.yaw = Math.PI; /* also looking away (+z) */
        e.heardT = -9;
        a.lastAttacker = null;
        a.body.shield = e.body.shield = 70;
        G.teams[0].brain.enemyMem.clear();
        G.teams[1].brain.enemyMem.clear();
        G.step(1 / 30);
      }
    };
    /* yaw 0 looks toward -z: the enemy at +z is behind */
    pin(0, 20);
    check(a.target !== e, "an AI doesn't sense an enemy behind it", a.target && a.target.name);
    pin(Math.PI, 20);
    check(a.target === e, "the same AI spots them once they're in view", a.target && a.target.name);
  }
}
/* ---------- pings: AI teammates go where a teammate pings ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 3 });
  G.start();
  for (let i = 0; i < 30; i++) G.step(1 / 30);
  const from = G.teams[0].agents[0];
  const spot = [12, 0, -8];
  const mates = G.ping(from, { kind: "place", pos: spot, label: "Here" });
  const d0 = mates.map(a => Math.hypot(a.pos.x - spot[0], a.pos.z - spot[2]));
  for (let i = 0; i < 30 * 4; i++) G.step(1 / 30);
  const d1 = mates.map(a => Math.hypot(a.pos.x - spot[0], a.pos.z - spot[2]));
  check(
    mates.length === 2 && d1.every((d, i) => d < d0[i] - 3 || d < 4),
    "the two nearest AI teammates head for a ping",
    { before: d0.map(fix), after: d1.map(fix) }
  );
}
check(Date.now() - t0 < 15000, "scenarios run in seconds", Date.now() - t0 + " ms");
finish("scenarios");
