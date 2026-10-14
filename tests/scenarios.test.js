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
      input: () => ({ a: { s: 1, aim: true } }),
    })
  );
  check(between(ads, 5.2, 6), "strafing while aiming a low-zoom scope keeps 90% speed", fix(ads));
  const scoped = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: 0 } },
      seconds: 1,
      input: () => ({ a: { s: 1, aim: true, scoped: true } }),
    })
  );
  check(between(scoped, 4.1, 4.8), "a sniper scope slows you more (72%)", fix(scoped));
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
  /* stairs are walked, never clambered: walking or sprinting up every flight on both maps (center
     and both sides) steps up each riser and reaches the top */
  const stairBad = [];
  for (const map of ["arena", "ctf"])
    for (const pc of K.mapPieces(K.MAPS[map]).filter(p => p.type === "stairs")) {
      const [dx, dz] = pc.dir,
        run = pc.steps * 0.72 + 1.2;
      for (const lat of [-1.2, 0, 1.2])
        for (const sprint of [false, true]) {
          const x = pc.p[0] + dx * run - dz * lat,
            z = pc.p[1] + dz * run + dx * lat;
          const r = scenario({
            map,
            pilots: { a: { pos: [x, 0, z], yaw: Math.atan2(dx, dz) } },
            seconds: (run + 1) / (sprint ? 7 : 4),
            input: () => ({ a: { f: 1, sprint } }),
          });
          /* (a start already up at the top is on some other piece: skip it) */
          if (r.trace.a[0][2] > pc.top - 0.5) continue;
          const top = r.P.a.pos.y > pc.top - 0.5;
          if (r.events.some(e => e.type === "clamber") || !top)
            stairBad.push({ map, id: pc.id, lat, sprint, y: fix(r.P.a.pos.y) });
        }
    }
  check(stairBad.length === 0, "walking up stairs steps up them without clambering", stairBad.slice(0, 4));
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
/* ---------- AI sidearms: carbine and magnum, chosen by range and situation ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 9, diff: ["heroic", "normal"] });
  G.start();
  for (let i = 0; i < 10; i++) G.step(1 / 30);
  const a = G.teams[0].agents[0],
    e = G.teams[1].agents[0];
  const S = CTF.DIFF.heroic;
  const at = (r, shield) => {
    e.body.pos.copy(a.body.pos).add(new K.THREE.Vector3(0, 0, -r));
    e.body.shield = shield;
    return a.pickGun(e);
  };
  a.wpn = 0;
  check(at(S.magFrom + 6, 70) === 1, "AI: the magnum at long range", S.magFrom + 6);
  a.wpn = 1;
  check(at(4, 70) === 0, "AI: the carbine up close to break shields");
  a.wpn = 0;
  check(at(S.magFrom - 6, 0) === 1, "AI: the magnum to finish a pilot whose shields are down");
  check(at(4, 0) === 0, "AI: ...but not point blank, where the switch costs more than it saves");
  a.wpn = 0;
  a.ammo[0] = 0;
  check(at(6, 70) === 1, "AI: an empty carbine mid-fight means switching, not reloading");
  a.ammo[0] = 32;
  /* switching takes the player's switch time and cancels a reload; each gun keeps its own magazine */
  a.wpn = 0;
  a.reloadT = 1;
  a.switchTo(1);
  check(
    a.wpn === 1 && a.reloadT === 0 && a.switchT === K.SWITCH_TIME,
    "AI: switching takes the switch time and cancels the reload",
    { switchT: a.switchT, reloadT: a.reloadT }
  );
  a.switchT = 0;
  a.fireCD = 0;
  const m0 = a.ammo.slice();
  e.body.pos.copy(a.body.pos).add(new K.THREE.Vector3(0, 0, -15));
  a.body.yaw = 0;
  a.body.pitch = 0;
  a.shoot(e);
  check(
    a.ammo[1] === m0[1] - 1 && a.ammo[0] === m0[0],
    "AI: a magnum shot spends magnum rounds only",
    a.ammo
  );
  check(
    Math.abs(a.fireCD - (K.WEAPON_DATA[1].rate + S.magPace)) < 1e-9,
    "AI: magnum shots are paced by fire rate plus skill",
    a.fireCD
  );
  /* aim: the magnum's error shrinks with skill */
  const spread = diff => {
    G.diff[0] = diff;
    a.wpn = 1;
    a.body.vel.set(0, 0, 0);
    a.body.ground = true;
    e.body.pos.copy(a.body.pos).add(new K.THREE.Vector3(0, 0, -22));
    e.body.vel.set(0, 0, 0);
    e.body.shield = 0;
    const c = e.body.pos.clone().add(new K.THREE.Vector3(0, e.body.h - 0.24, 0));
    let s = 0;
    for (let i = 0; i < 400; i++) s += a.aimPoint(e, new K.THREE.Vector3()).distanceTo(c);
    return s / 400;
  };
  const sN = spread("normal"),
    sL = spread("legendary");
  check(sL < sN * 0.5, "AI: legendary magnum aim is much tighter than normal", {
    normal: fix(sN),
    legendary: fix(sL),
  });
  G.diff[0] = "heroic";
  /* death drops: the gun in hand */
  a.wpn = 1;
  const n0 = G.items.length;
  G.kill(a, e, "pistol", false);
  const guns = G.items.slice(n0).filter(it => it.type >= 0);
  check(
    guns.length === 1 && guns[0].type === 1,
    "AI: a pilot holding the magnum drops the magnum",
    guns.map(g => g.type)
  );
}
/* ---------- respawn timing: the pod's longer fall doesn't lengthen the time out ---------- */
{
  const outFor = pods => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed: 4, pods });
    G.start();
    for (let i = 0; i < 10; i++) G.step(1 / 30);
    /* bench the other team so nobody else is fighting */
    for (const x of G.teams[1].agents) {
      x.dead = true;
      x.body.dead = true;
      x.respawnAt = 1e9;
    }
    const times = [];
    for (const a of G.teams[0].agents) {
      const t0 = G.t;
      G.kill(a, null, "rifle", false);
      let n = 0;
      while (a.dead && n++ < 30 * 20) G.step(1 / 30);
      times.push(G.t - t0);
    }
    return times;
  };
  const want = K.MODE_DATA.ctf.respawn + 1.35;
  const withPods = outFor(true),
    classic = outFor(false);
  check(
    withPods.every(t => Math.abs(t - want) < 0.1),
    "AI: dead to back with a pod is the respawn delay plus the old 1.35 s drop",
    { want, got: withPods.map(fix), early: fix(K.POD_EARLY) }
  );
  check(
    classic.every(t => Math.abs(t - K.MODE_DATA.ctf.respawn) < 0.1),
    "AI: classic spawns keep the plain respawn delay",
    classic.map(fix)
  );
}
/* ---------- spawn safety: out of enemy sight, away from enemies and recent fights ---------- */
{
  scenario({ map: "arena", seconds: 0.01 });
  const V = K.THREE.Vector3;
  const SP = K.MAPS.arena.spawns.ffa;
  /* can an enemy standing at `e` (eyes up) see someone appearing at spawn `s`? */
  const sees = (e, s) => {
    const o = new V(e.pos.x, e.pos.y + K.H_STAND - 0.2, e.pos.z),
      d = new V(s[0], s[1] + 1.2, s[2]).sub(o);
    const L = d.length();
    return K.rayWorld(o, d.normalize(), L) >= L - 0.3;
  };
  /* an enemy at each arena spawn in turn, looking at the centre: does the pick stay out of their view? */
  let cases = 0,
    safe = 0;
  const bad = [];
  for (const at of SP) {
    const e = { pos: new V(at[0], at[1], at[2]), h: K.H_STAND, yaw: Math.atan2(at[0], at[2]) };
    const hidden = SP.filter(s => !sees(e, s));
    if (!hidden.length) continue;
    for (let i = 0; i < 10; i++) {
      cases++;
      const s = K.pickSpawn(SP, [e], [], 0, Math.random);
      if (!sees(e, s)) safe++;
      else bad.push(at);
    }
  }
  check(cases > 50 && safe === cases, "spawns avoid an enemy's view when a hidden spot exists", {
    cases,
    safe,
    bad: bad.slice(0, 3),
  });
  /* a fresh fight next to an otherwise safe spot pushes the pick elsewhere */
  const fightAt = SP[4];
  let near = 0;
  for (let i = 0; i < 40; i++) {
    const s = K.pickSpawn(SP, [], [{ pos: new V(fightAt[0], 0, fightAt[2]), t: 9 }], 10, Math.random);
    if (Math.hypot(s[0] - fightAt[0], s[2] - fightAt[2]) < 8) near++;
  }
  check(near === 0, "spawns stay away from a fight that just happened", near);
}
/* CTF: the team's spawn pick stays out of an enemy's sight in their base */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 6, pods: false });
  G.start();
  for (let i = 0; i < 5; i++) G.step(1 / 30);
  const V = K.THREE.Vector3;
  const sees = (b, s) => {
    const o = new V(b.pos.x, b.pos.y + b.h - 0.2, b.pos.z),
      d = new V(s[0], s[1] + 1.2, s[2]).sub(o);
    const L = d.length();
    return K.rayWorld(o, d.normalize(), L) >= L - 0.3;
  };
  const e = G.teams[1].agents[0];
  for (const x of G.teams[1].agents.slice(1)) {
    x.dead = true;
    x.body.dead = true;
  }
  let cases = 0,
    safe = 0;
  for (const s0 of CTF.SPAWNS[0]) {
    e.body.pos.set(s0[0], s0[1] + 0.02, s0[2]);
    e.body.yaw = Math.atan2(s0[0], s0[2]);
    if (!CTF.SPAWNS[0].some(s => !sees(e.body, s))) continue;
    for (let i = 0; i < 5; i++) {
      cases++;
      if (!sees(e.body, G.spawnPoint(0))) safe++;
    }
  }
  check(cases >= 10 && safe === cases, "CTF: spawns avoid an enemy in your base when a hidden spot exists", {
    cases,
    safe,
  });
  /* spawn protection lasts until you attack */
  const a = G.teams[0].agents[0];
  a.spawn(CTF.SPAWNS[0][0]);
  const before = a.body.damage(10, G.t);
  const sh0 = a.body.shield;
  e.body.pos.copy(a.body.pos).add(new V(0, 0, -10));
  a.shoot(e);
  a.body.damage(10, G.t);
  check(sh0 === 70 && a.body.shield === 60, "spawn protection holds until you fire, then ends", {
    protectedHit: before,
    shieldBefore: sh0,
    after: a.body.shield,
  });
}
/* ---------- Recruit: below Normal on every axis ---------- */
{
  const R = K.AI_SKILL.recruit,
    N = K.AI_SKILL.normal;
  check(
    R.react > N.react &&
      R.err > N.err &&
      R.sight < N.sight &&
      R.dodge < N.dodge &&
      R.nades < N.nades &&
      R.turn < N.turn,
    "Recruit reacts slower, aims looser, sees less far, dodges and throws less than Normal",
    R
  );
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 2, diff: ["recruit", "normal"] });
  G.start();
  const r = G.teams[0].agents[0],
    n = G.teams[1].agents[0];
  check(
    r.nadeInv.frag + r.nadeInv.plasma < n.nadeInv.frag + n.nadeInv.plasma,
    "Recruit bots carry fewer grenades",
    { recruit: r.nadeInv, normal: n.nadeInv }
  );
}
/* ---------- melee: from behind kills; otherwise shield first, then the kill ---------- */
{
  check(
    K.meleeBehind(0, 5, 0, 0, 0) && !K.meleeBehind(0, -5, 0, 0, 0) && !K.meleeBehind(5, 0, 0, 0, 0),
    "melee: only a blow from behind counts as behind (facing -z, attacker at +z)"
  );
  check(
    K.meleeDamage(70, true) >= 999 && K.meleeDamage(70, false) === 70 && K.meleeDamage(12, false) === 12,
    "melee: from behind kills; from the front it takes exactly the shield that's left"
  );
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 8 });
  G.start();
  for (let i = 0; i < 5; i++) G.step(1 / 30);
  const a = G.teams[0].agents[0],
    v = G.teams[1].agents[0];
  const blow = fromBehind => {
    v.dead = false;
    v.body.dead = false;
    v.body.spawnT = -99;
    v.body.yaw = 0; /* facing -z */
    v.body.pos.set(0, 0.02, 0);
    a.body.pos.set(0, 0.02, fromBehind ? 1.4 : -1.4);
    a.body.yaw = fromBehind ? 0 : Math.PI; /* facing the victim */
    a.onEvent("melee", {});
  };
  v.body.shield = 70;
  v.body.health = 45;
  blow(false);
  const afterFirst = { sh: v.body.shield, hp: v.body.health, dead: v.dead };
  blow(false);
  const afterSecond = v.dead;
  v.body.reset();
  v.body.shield = 70;
  blow(true);
  check(
    afterFirst.sh === 0 && afterFirst.hp === 45 && !afterFirst.dead && afterSecond,
    "melee: the first blow takes the shield down, the second kills",
    afterFirst
  );
  check(v.dead, "melee: one blow from behind kills a full-shield pilot");
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
/* ---------- danger marks: AI teammates keep clear of them, the nearest two watch; one mark each ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 4 });
  G.start();
  for (let i = 0; i < 30; i++) G.step(1 / 30);
  const from = G.teams[0].agents[0];
  /* a spot a little way in front of the team (between them and the middle) */
  const c = G.teams[0].agents.reduce((s, a) => s.add(a.pos), new K.THREE.Vector3()).multiplyScalar(0.25);
  const spot = [c.x * 0.5, c.y, c.z * 0.5];
  const near = p => Math.hypot(p.x - spot[0], p.z - spot[2]);
  G.ping(from, { kind: "place", pos: [spot[0] + 20, spot[1], spot[2]], label: "Here" });
  const mates = G.ping(from, { kind: "danger", pos: spot, label: "Danger" });
  const ai = G.teams[0].agents.filter(a => !a.human);
  check(
    ai.every(a => a.danger && !a.ping) && mates.every(a => a.danger.watchUntil > G.t),
    "a danger mark replaces the same player's earlier ping, reaches every AI teammate, and the two nearest watch it",
    ai.map(a => [!!a.danger, !!a.ping])
  );
  let closest = 99,
    watched = 0;
  for (let i = 0; i < 30 * 4; i++) {
    G.step(1 / 30);
    for (const a of mates) {
      if (!a.alive) continue;
      closest = Math.min(closest, near(a.pos));
      if (!a.target) {
        const want = Math.atan2(-(spot[0] - a.pos.x), -(spot[2] - a.pos.z));
        if (Math.abs(Math.atan2(Math.sin(want - a.body.yaw), Math.cos(want - a.body.yaw))) < 0.35) watched++;
      }
    }
  }
  check(closest > 7 && watched > 30, "AI teammates watching a danger mark hold short of it and face it", {
    closest: fix(closest),
    watched,
  });
  G.ping(from, { kind: "place", pos: spot, label: "Here" });
  check(
    ai.every(a => !a.danger),
    "a new ping from the same player clears their danger mark",
    ai.map(a => !!a.danger)
  );
}
/* ---------- AI ammo: finite reserves, reloads from them, a dry gun doesn't fire ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 6 });
  G.start();
  for (let i = 0; i < 5; i++) G.step(1 / 30);
  const a = G.teams[0].agents[0],
    e = G.teams[1].agents[0];
  const R = K.WEAPON_DATA[0],
    M = K.WEAPON_DATA[1];
  check(
    K.WEAPON_DATA.every(w => Number.isFinite(w.reserve)) && a.rsv[0] === R.reserve && a.rsv[1] === M.reserve,
    "no weapon has endless reserve ammo, and AI pilots spawn with the player's reserves",
    a.rsv
  );
  a.wpn = 0;
  a.ammo[0] = 2;
  a.rsv[0] = 5;
  a.reloadT = 0;
  a.startReload();
  a.reloadT = 0;
  a.reloadDone();
  check(a.ammo[0] === 7 && a.rsv[0] === 0, "AI: a reload fills the magazine from the reserve only", [
    a.ammo[0],
    a.rsv[0],
  ]);
  a.ammo[0] = 0;
  a.reloadT = 0;
  a.startReload();
  check(a.reloadT === 0, "AI: nothing to reload with an empty reserve");
  e.body.pos.copy(a.body.pos).add(new K.THREE.Vector3(0, 0, -15));
  check(a.pickGun(e) === 1, "AI: a dry carbine means the magnum, whatever the range");
  a.switchT = a.fireCD = 0;
  a.shoot(e);
  check(a.ammo[0] === 0 && a.shots === 0, "AI: a dry gun doesn't fire", [a.ammo[0], a.shots]);
  /* a dropped carbine tops the reserve up when they walk over it */
  G.addItems([{ type: 0, ammo: [10, 20] }], a.pos.clone());
  for (let i = 0; i < 3; i++) G.step(1 / 30);
  check(a.rsv[0] >= 30 || !a.alive, "AI: a dropped gun of the kind they carry gives them its rounds", a.rsv);
  /* weapon-lock simulations keep endless ammo (a measuring tool) */
  const L = CTF.Game({ mode: "sim", render: false, seed: 6, lock: "carbine" });
  L.start();
  L.step(1 / 30);
  check(
    L.agents.every(x => x.rsv[0] === Infinity),
    "weapon-lock simulations keep endless ammo"
  );
}
/* ---------- lab content (docs/PROPOSALS.md): off by default, usable by the AI when on ---------- */
{
  const W = k => K.WEAPON_DATA.find(w => w.key === k);
  const kb = K.killStats(W("burst")),
    ks = K.killStats(W("scatter")),
    kbm = K.killStats(W("beam"));
  check(
    kb.best.shots === 11 && Math.abs(kb.best.time - 1.14) < 0.01,
    "burst rifle: four bursts kill",
    kb.best
  );
  check(ks.best.shots === 1, "scattergun: every pellet up close kills", ks.best);
  check(
    Math.abs(K.falloffAt(W("scatter"), 16) - 0.25) < 1e-9 && K.falloffAt(W("scatter"), 4) === 1,
    "scattergun falls off to a quarter by 16 m"
  );
  check(
    kbm.best.shots === kbm.body.shots && between(kbm.best.time, 1.2, 1.6),
    "arc beam: ~1.4 s on target",
    kbm
  );
  const L = K.LABS;
  check(
    !L.burst && !L.scatter && !L.beam && !L.pulse && !L.melee && !L.mods.length,
    "every lab is off by default",
    L
  );
  const m0 = [K.meleeDamage(70, false), K.meleeDamage(0, false)];
  L.melee = true;
  const m1 = [
    K.meleeDamage(70, false),
    K.meleeDamage(30, false),
    K.meleeDamage(0, false),
    K.meleeDamage(70, true),
  ];
  L.melee = false;
  check(
    m0[0] === 70 && m0[1] >= 999 && m1[0] === 40 && m1[1] === 30 && m1[2] >= 999 && m1[3] >= 999,
    "lighter melee: a blow takes at most 40 shield; bare health and backs still die",
    { shipped: m0, lab: m1 }
  );
  const play = (opts, steps) => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game(Object.assign({ mode: "sim", render: false, seed: 2 }, opts));
    const kills = {};
    G.onEvent = (t, d) => {
      if (t === "kill") kills[d.type] = (kills[d.type] || 0) + 1;
    };
    G.start();
    for (let i = 0; i < steps; i++) G.step(1 / 30);
    return { G, kills };
  };
  check(
    play({}, 1).G.pickups.every(p => !p.lab),
    "lab pickups stay off the map while their labs are off"
  );
  for (const lock of ["burst", "scatter", "beam"]) {
    const r = play({ map: "arena", lock, scoreLimit: 1e9 }, 30 * 40);
    check((r.kills[lock] || 0) >= 3, `the AI fights with the ${lock} (weapon lock)`, r.kills);
  }
  Object.assign(L, { burst: true, pulse: true, mods: ["doors"] });
  try {
    const r = play({}, 30);
    check(
      r.G.pickups.some(p => p.lab === "burst"),
      "burst rifle pickups appear while the lab is on"
    );
    check(CTF.MAP.id === "twin-foundry-doors", "a map mod builds its own map", CTF.MAP.id);
    const [a] = r.G.teams[0].agents,
      e = r.G.teams[1].agents[0];
    check(a.nadeInv.pulse >= 1, "pilots carry a pulse grenade while its lab is on", a.nadeInv);
    e.body.pos.set(a.pos.x + 2, a.pos.y, a.pos.z);
    e.body.shield = 70;
    e.body.health = 45;
    e.body.spawnT = -9;
    a.nadeOwner().onExplode(e.body.pos.clone().add(new K.THREE.Vector3(0, 1, 0)), "pulse", null);
    check(
      e.body.shield === 0 && e.body.health === 45 && e.body.thrustCD >= 2.4,
      "a pulse strips shields and jams thrust without touching health",
      { sh: e.body.shield, hp: e.body.health, cd: e.body.thrustCD }
    );
    const off = play({ labs: false }, 1);
    check(
      off.G.pickups.every(p => !p.lab) && CTF.MAP.id === "twin-foundry",
      "online matches (labs: false) play the shipped game",
      CTF.MAP.id
    );
  } finally {
    Object.assign(L, { burst: false, pulse: false, mods: [] });
  }
}
/* ---------- blast gates (world/gates.js): the arena's north gate stands across x = 0, z 10.8 to 17.
   Its cycle: open until 10 s, rising to 12.5 s, shut until 20.5 s, sinking to 23 s ---------- */
{
  /* back on the arena (the lab matches above left Twin Foundry in place) */
  CTF.exitMap();
  const at = T => t => K.gatesAt(T + t, true);
  const across = T =>
    scenario({
      pilots: { a: { pos: [-3, 0, 14], yaw: EAST } },
      seconds: 1.2,
      input: t => (at(T)(t), { a: { f: 1 } }),
    }).P.a.pos;
  try {
    const shut = across(15),
      open = across(5);
    check(shut.x < -0.75 && shut.x > -0.8, "a shut gate stops a pilot", fix(shut.x));
    check(open.x > 3, "an open gate lets a pilot through", fix(open.x));
    const target = { pos: new K.THREE.Vector3(3, 0, 14), h: K.H_STAND };
    const fire = T => (K.gatesAt(T, true), shoot([-5, 1.5, 14], [3, 1.2, 14], { t: target }));
    check(fire(15) === "world", "a shut gate stops a shot", fire(15));
    check(fire(5) && fire(5).id === "t", "an open gate lets a shot through", fire(5));
    check(fire(11.1) === "world" && fire(10.2) && fire(10.2).id === "t", "a rising gate blocks as it rises");
    /* standing in the doorway as it rises, on either side of its centre line: moved out, never lifted */
    let worst = 0;
    for (const x of [0.15, -0.15, 0]) {
      K.gatesAt(9.5, true);
      const r = scenario({
        pilots: { a: { pos: [x, 0, 14] } },
        seconds: 4,
        input: at(9.5),
        every: (t, P) => (worst = Math.max(worst, P.a.pos.y)),
      });
      const out = Math.abs(r.P.a.pos.x);
      check(
        out > 0.78 && Math.sign(r.P.a.pos.x || 1) === Math.sign(x || 1),
        "a pilot in a rising gate is moved out to their side",
        fix(r.P.a.pos.x)
      );
    }
    check(worst < 0.01, "a rising gate never lifts a pilot", fix(worst));
    /* a gate is a ledge like any other: 3.9 m shut is a crouch-jump clamber from the floor (a plain
       jump falls short), moving or not; standing on one you ride it up and down; never inside one */
    const leaf = K.GATES.live.find(x => x.id === "gate-n").boxes[0];
    const inLeaf = q =>
      q.x + 0.3 > leaf.x0 && q.x - 0.3 < leaf.x1 && q.z > leaf.z0 && q.z < leaf.z1 && q.y < leaf.y1 - 0.05;
    const climb = (T, o) => {
      K.gatesAt(T, true);
      let top = 0,
        inside = 0;
      const r = scenario({
        pilots: { a: { pos: [-1.4, 0, 14], yaw: EAST } },
        seconds: o.seconds,
        /* forward until over the gate (o.stop: then stand still on it) */
        input: (t, P) => (
          K.gatesAt(T + t, true),
          {
            a: {
              f: !o.stop || P.a.pos.x < -0.3 ? 1 : 0,
              jumpP: t > 0.1 && t < 0.11,
              crouch: !!o.tuck && t > 0.15 && t < 0.8,
            },
          }
        ),
        every: (t, P) => {
          top = Math.max(top, P.a.pos.y);
          if (!P.a.clamber && inLeaf(P.a.pos)) inside++;
        },
      });
      return { x: fix(r.P.a.pos.x), y: fix(r.P.a.pos.y), top: fix(top), inside, ground: r.P.a.ground };
    };
    const plain = climb(15, { seconds: 1.5 });
    check(plain.top < 1.3 && plain.x < -0.7, "a plain jump does not reach a shut gate's top", plain);
    const onto = climb(15, { seconds: 1.5, tuck: true, stop: true });
    check(
      Math.abs(onto.y - 3.9) < 0.02 && onto.ground && !onto.inside,
      "a crouch-jump clambers onto a shut gate",
      onto
    );
    const over = climb(15, { seconds: 3, tuck: true });
    check(over.x > 1.5 && over.y < 0.01 && !over.inside, "and over it to the other side", over);
    /* onto a rising gate with a plain jump while it is low, then ride it to the top */
    const ride = climb(10.8, { seconds: 3, stop: true });
    check(
      Math.abs(ride.y - 3.9) < 0.02 && ride.top < 3.95 && !ride.inside,
      "a pilot on a rising gate rides it up, not launched",
      ride
    );
    /* standing on a shut gate as it sinks: ride it down to the floor */
    K.gatesAt(19.5, true);
    let gap = 0;
    const down = scenario({
      pilots: { a: { pos: [0, 3.9, 14], air: true } },
      seconds: 4,
      input: t => (K.gatesAt(19.5 + t, true), {}),
      every: (t, P) => (gap = Math.max(gap, Math.abs(P.a.pos.y - Math.max(0, leaf.y1)))),
    });
    check(
      down.P.a.pos.y < 0.01 && gap < 0.05 && Math.abs(down.P.a.pos.x) < 0.4,
      "a pilot on a sinking gate rides it down",
      fix(gap)
    );
    /* jumping about in the doorway through a whole cycle: never inside a gate */
    let stuck = 0;
    K.gatesAt(8, true);
    scenario({
      pilots: { a: { pos: [0, 0, 14], yaw: EAST } },
      seconds: 16,
      input: t => (
        K.gatesAt(8 + t, true),
        { a: { f: Math.sin(t * 3), s: Math.cos(t * 2), jumpP: (t * 120) % 70 < 1, crouch: (t * 10) % 7 < 3 } }
      ),
      every: (t, P) => !P.a.clamber && inLeaf(P.a.pos) && stuck++,
    });
    check(stuck === 0, "never inside a gate, whatever a pilot does as it moves", stuck);
    /* the state is a function of time alone */
    const g = K.GATES.live.find(x => x.id === "gate-n");
    const lifts = [0, 9.9, 10, 11.25, 12.5, 16, 20.5, 21.75, 23, 33].map(T => K.gateLift(g, T));
    check(
      JSON.stringify(lifts) === JSON.stringify([0, 0, 0, 0.5, 1, 1, 1, 0.5, 0, 0]),
      "the gate cycle: open 10 s, rise 2.5 s, shut 8 s, sink 2.5 s",
      lifts
    );
  } finally {
    K.gatesAt(0, false);
  }
}
check(Date.now() - t0 < 15000, "scenarios run in seconds", Date.now() - t0 + " ms");
finish("scenarios");
