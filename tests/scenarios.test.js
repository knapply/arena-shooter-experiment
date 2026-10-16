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
  /* ...and pins you in place: a sprint jump into a hover, still pushing forward, barely moves on */
  let h0 = null,
    slide = 0;
  scenario({
    pilots: { a: { pos: RUN, yaw: 0 } },
    seconds: 1.6,
    input: t => ({ a: { f: 1, sprint: true, jumpP: t > 0.3 && t < 0.31, aim: t > 0.45 } }),
    every: (t, P) => {
      if (t > 0.5 && h0 == null) h0 = [P.a.pos.x, P.a.pos.z];
      if (h0 && t > 0.5 && P.a.stabbing) slide = Math.hypot(P.a.pos.x - h0[0], P.a.pos.z - h0[1]);
    },
  });
  check(h0 && slide < 2, "a hover barely drifts, even pushing forward out of a sprint", fix(slide));
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
    km.best.shots === 5 && Math.abs(km.best.time - 1.2) < 0.05,
    "magnum perfect kill: 5 shots in ~1.2 s (the footage's 0.3 s between shots)",
    km.best
  );
  const kc = K.killStats(carbine);
  check(
    kc.best.shots === 12 && between(kc.best.time, 1.2, 1.35) && kc.body.shots === 18,
    "carbine: four bursts and a headshot (~1.27 s), six bursts to the body",
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
    K.meleeDamage(70, true) >= 999 && K.meleeDamage(70, false) === 40 && K.meleeDamage(12, false) === 12,
    "melee: from behind kills; from the front it takes the shield that's left, 40 at most"
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
  const afterSecond = { sh: v.body.shield, hp: v.body.health, dead: v.dead };
  blow(false);
  const afterThird = v.dead;
  v.body.reset();
  v.body.shield = 70;
  blow(true);
  check(
    afterFirst.sh === 30 &&
      afterFirst.hp === 45 &&
      !afterFirst.dead &&
      afterSecond.sh === 0 &&
      afterSecond.hp === 45 &&
      !afterSecond.dead &&
      afterThird,
    "melee: blows take 40 shield at most and never health; once the shield is gone the next kills",
    { afterFirst, afterSecond }
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
/* ---------- the roster: five weapons, the scattergun in the power rotation; Labs (map changes) off by
   default and offline only ---------- */
{
  const W = k => K.WEAPON_DATA.find(w => w.key === k);
  check(
    K.WEAPON_DATA.map(w => w.key).join() === "carbine,pistol,sniper,rocket,scatter",
    "five weapons: carbine, magnum, sniper, rocket launcher, scattergun",
    K.WEAPON_DATA.map(w => w.key)
  );
  check(
    K.POWER_ROTATION.join() === "sniper,rocket,scatter",
    "the scattergun is in the power rotation",
    K.POWER_ROTATION
  );
  const ks = K.killStats(W("scatter"));
  check(ks.best.shots === 1, "scattergun: every pellet up close kills", ks.best);
  check(
    Math.abs(K.falloffAt(W("scatter"), 16) - 0.25) < 1e-9 && K.falloffAt(W("scatter"), 4) === 1,
    "scattergun falls off to a quarter by 16 m"
  );
  const L = K.LABS;
  check(!L.gates && !L.mods.length, "every lab is off by default", L);
  const m1 = [
    K.meleeDamage(70, false),
    K.meleeDamage(30, false),
    K.meleeDamage(0, false),
    K.meleeDamage(70, true),
  ];
  check(
    m1[0] === 40 && m1[1] === 30 && m1[2] >= 999 && m1[3] >= 999,
    "melee: a blow takes at most 40 shield; bare health and backs still die",
    m1
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
  {
    const r = play({ map: "arena", lock: "scatter", scoreLimit: 1e9 }, 30 * 40);
    check((r.kills.scatter || 0) >= 3, "the AI fights with the scatter (weapon lock)", r.kills);
  }
  L.mods = ["doors"];
  try {
    play({}, 30);
    check(CTF.MAP.id === "twin-foundry-doors", "a map mod builds its own map", CTF.MAP.id);
    play({ labs: false }, 1);
    check(CTF.MAP.id === "twin-foundry", "online matches (labs: false) play the shipped game", CTF.MAP.id);
  } finally {
    L.mods = [];
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
/* ---------- mode rules: the carriers, oddball, free-for-all, team spawns ---------- */
{
  /** a match with everyone but the named pilots benched far away */
  const bench = (G, keep) => {
    for (const x of G.agents)
      if (!keep.includes(x)) {
        x.dead = true;
        x.body.dead = true;
        x.respawnAt = 1e9;
        x.body.pos.set(0, -80, 0);
      }
  };
  /** put b right in front of a, facing each other, shields full */
  const faceOff = (a, b, gap) => {
    const p = a.body.pos;
    b.body.pos.set(p.x, p.y, p.z - gap);
    a.body.yaw = 0;
    b.body.yaw = Math.PI;
    for (const x of [a, b]) {
      x.body.vel.set(0, 0, 0);
      x.body.shield = 70;
      x.body.health = 45;
      x.body.spawnT = -99;
    }
  };
  /* capture the flag: a carrier can't shoot, never sprints or thrusts, and a melee with the flag kills */
  {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed: 11 });
    const kills = [];
    G.onEvent = (t, d) => t === "kill" && kills.push(d);
    G.start();
    for (let i = 0; i < 20; i++) G.step(1 / 30);
    const a = G.teams[0].agents[0],
      e = G.teams[1].agents[0];
    bench(G, [a, e]);
    const f = G.flags[1];
    f.state = "carried";
    f.carrier = a;
    a.carrying = f;
    /* their own flag is out, so the carrier can't score it and stays a carrier */
    G.flags[0].state = "dropped";
    G.flags[0].dropT = 1e9;
    G.flags[0].pos.set(0, 0, 30);
    faceOff(a, e, 1.4);
    const shots = a.shots;
    a.shoot(e);
    check(a.shots === shots && e.body.shield === 70, "a flag carrier can't shoot", a.shots - shots);
    let ran = 0;
    const think = a.think.bind(a);
    a.think = dt => {
      const inp = think(dt);
      if (inp.sprint || inp.thrust) ran++;
      return inp;
    };
    /* three seconds heading home with an enemy in sight (who holds still): the carrier walks */
    const eThink = e.think.bind(e);
    e.think = () => ({
      f: 0,
      s: 0,
      sprint: false,
      thrust: false,
      crouch: false,
      crouchP: false,
      jumpP: false,
      aim: false,
      meleeP: false,
    });
    e.body.pos.set(a.body.pos.x, a.body.pos.y, a.body.pos.z + 20);
    for (let i = 0; i < 90; i++) {
      e.body.shield = a.body.shield = 70;
      G.step(1 / 30);
    }
    e.think = eThink;
    check(a.carrying === f && ran === 0, "the AI flag carrier never sprints or thrusts", ran);
    a.think = think;
    faceOff(a, e, 1.4);
    a.onEvent("melee", {});
    const k = kills.find(x => x.victim === e);
    check(
      !!k && k.killer === a && k.type === "flag",
      "a melee by the flag carrier kills in one hit, with the flag",
      k && { type: k.type, shield: e.body.shield }
    );
    /* the same blow from an empty-handed pilot only takes the shield */
    a.carrying = null;
    f.state = "home";
    f.carrier = null;
    const e2 = G.teams[1].agents[1];
    e2.dead = false;
    e2.body.dead = false;
    faceOff(a, e2, 1.4);
    a.onEvent("melee", {});
    check(
      !e2.dead && e2.body.shield === 30,
      "without the flag the same melee only takes 40 of the shield",
      e2.body.shield
    );
    /* a carrier killed near their own stand is a denial */
    const b = G.teams[1].agents[2];
    b.dead = false;
    b.body.dead = false;
    b.body.pos.copy(CTF.FLAG_HOME[1]);
    const f0 = G.flags[0];
    f0.state = "carried";
    f0.carrier = b;
    b.carrying = f0;
    G.kill(b, a, "rifle", false);
    const dk = kills.find(x => x.victim === b);
    check(
      !!dk && dk.carried === "flag" && dk.denial,
      "killing a carrier at their own stand is a flag denial",
      dk && dk.denial
    );
  }
  /* oddball: the skull drops in, the carrier's team scores while holding it, no guns, a one-hit melee */
  {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({
      mode: "sim",
      render: false,
      seed: 12,
      rules: "oddball",
      map: "arena",
      ballFirst: 1,
    });
    const ev = [],
      kills = [];
    G.onEvent = (t, d) => {
      ev.push(t);
      if (t === "kill") kills.push(d);
    };
    G.start();
    /* these rules are the same on every skull spot: pin the first drop to the middle, and keep the
       power weapon beside it out of the test */
    CTF.BALL_HOME.set(...K.MAPS.arena.ball);
    G.pickups = [];
    const a = G.teams[0].agents[0],
      e = G.teams[1].agents[0];
    bench(G, [a, e]);
    a.body.pos.set(10, 0, 10);
    e.body.pos.set(-10, 0, -10);
    check(G.ball.state === "incoming", "the skull starts on its way down", G.ball.state);
    for (let i = 0; i < 45; i++) G.step(1 / 30);
    check(
      G.ball.state === "home" && ev.includes("ballPod") && ev.includes("ballSpawn"),
      "it comes down by pod onto the middle of the map",
      { state: G.ball.state, at: G.ball.pos.toArray().map(v => +v.toFixed(1)) }
    );
    a.body.pos.copy(G.ball.pos);
    a.body.vel.set(0, 0, 0);
    G.step(1 / 30);
    check(G.ball.carrier === a && a.carrying === G.ball, "touching the skull picks it up", G.ball.state);
    const h0 = G.teams[0].held;
    for (let i = 0; i < 60; i++) {
      a.body.shield = 70;
      G.step(1 / 30);
    }
    check(
      Math.abs(G.teams[0].held - h0 - 2) < 0.1 && G.teams[0].score === Math.floor(G.teams[0].held),
      "every second held scores for the carrier's team",
      G.teams[0].held
    );
    faceOff(a, e, 1.4);
    const shots = a.shots;
    a.shoot(e);
    check(a.shots === shots, "the skull carrier can't shoot", a.shots - shots);
    a.onEvent("melee", {});
    const k = kills.find(x => x.victim === e);
    check(!!k && k.type === "skull" && e.dead, "a melee with the skull kills in one hit", k && k.type);
    e.respawnAt = 1e9;
    check(G.ball.carrier === a, "and the carrier keeps it", G.ball.state);
    /* the carrier dies: it drops; left alone it goes away and a fresh pod brings it back */
    G.kill(a, null, "rifle", false);
    a.respawnAt = 1e9;
    check(
      G.ball.state === "dropped" && ev.includes("ballDrop"),
      "the carrier's death drops the skull",
      G.ball.state
    );
    for (let i = 0; i < (G.ballReset + 0.5) * 30 && G.ball.state === "dropped"; i++) G.step(1 / 30);
    check(
      G.ball.state === "incoming" && ev.includes("ballReset"),
      "a skull left on the floor resets",
      G.ball.state
    );
    for (let i = 0; i < (K.POD_TIME + 1.5) * 30 && G.ball.state === "incoming"; i++) G.step(1 / 30);
    check(G.ball.state === "home", "and drops into the middle again by pod", G.ball.state);
    /* holding it long enough wins */
    const w = G.teams[1].agents[1];
    w.dead = false;
    w.body.dead = false;
    w.body.pos.copy(G.ball.pos);
    G.scoreLimit = G.teams[1].held + 1;
    for (let i = 0; i < 60 && !G.over; i++) {
      w.body.shield = 70;
      w.body.pos.copy(G.ball.state === "carried" ? w.body.pos : G.ball.pos);
      G.step(1 / 30);
    }
    check(G.over && G.winner === 1, "the first team to hold it for the time to win wins", {
      over: G.over,
      w: G.winner,
    });
  }
  /* skull spots: each match (and each drop) picks one of the map's skull places (CTF.skullSpots),
     so matches open in different places, and never the same spot twice running */
  for (const map of ["arena", "ctf"]) {
    let spots = [];
    const firsts = new Set();
    let repeat = false;
    for (let seed = 1; seed <= 6; seed++) {
      K.STORE.setBackend(K.STORE.memoryBackend());
      const G = CTF.Game({ mode: "sim", render: false, seed, rules: "oddball", map });
      spots = CTF.skullSpots().map(p => p.join(","));
      firsts.add(CTF.BALL_HOME.toArray().join(","));
      const s0 = G.ballSpot;
      G.nextBallSpot();
      if (G.ballSpot === s0) repeat = true;
    }
    check(
      firsts.size >= 2 && [...firsts].every(p => spots.includes(p)) && !repeat,
      `${map}: the skull opens on different spots from the map's skull places, never the same twice running`,
      [...firsts]
    );
  }
  /* free-for-all: every pilot is their own team, and the AI fights everyone */
  {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed: 13, rules: "ffa", map: "arena", pilots: 6 });
    const killers = new Set();
    let same = 0;
    G.onEvent = (t, d) => {
      if (t !== "kill" || !d.killer || d.killer === d.victim) return;
      killers.add(d.killer.team);
      if (d.killer.team === d.victim.team) same++;
    };
    G.start();
    check(
      G.teams.length === 6 && G.teams.every(t => t.agents.length === 1),
      "free-for-all: six pilots, each a team of one",
      G.teams.map(t => t.agents.length)
    );
    check(
      G.foes(0).length === 5 && !G.foes(0).includes(G.teams[0].agents[0]),
      "everyone else is an enemy",
      G.foes(0).length
    );
    for (let i = 0; i < 90 * 30 && !G.over; i++) G.step(1 / 30);
    check(killers.size >= 4 && same === 0, "the AI pilots fight each other, not just you", {
      killers: killers.size,
      same,
    });
    const top = Math.max(...G.teams.map(t => t.score));
    check(
      top > 0 && G.teams.every(t => t.score === t.agents[0].k),
      "each pilot's kills are their score",
      top
    );
  }
  /* Team Slayer on the arena: each team spawns on its own half */
  {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed: 14, rules: "slayer", map: "arena" });
    G.start();
    const zs = [0, 1].map(t => Array.from({ length: 8 }, () => G.spawnPoint(t)[2]));
    check(
      zs[0].every(z => z < 0) && zs[1].every(z => z > 0),
      "Team Slayer: red spawns on the south half, blue on the north",
      zs
    );
  }
  /* every rule set ends: a time limit decides by score, a tie is a draw */
  {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed: 15, rules: "slayer", map: "arena", timeLimit: 2 });
    G.start();
    bench(G, []);
    for (let i = 0; i < 90 && !G.over; i++) G.step(1 / 30);
    check(G.over && G.winner === -1, "a level match at the time limit is a draw", G.winner);
  }
  K.STORE.setBackend(K.STORE.memoryBackend());
}
/* ---------- the AI pass: skill between levels, map memory, the magnum rhythm, holding range ---------- */
{
  const S = K.AI_SKILL;
  const mid = CTF.skillAt(1.5);
  check(
    Math.abs(mid.react - (S.normal.react + S.heroic.react) / 2) < 1e-9 &&
      Math.abs(mid.err - (S.normal.err + S.heroic.err) / 2) < 1e-9 &&
      CTF.skillAt(0).react === S.recruit.react &&
      CTF.skillAt(3).react === S.legendary.react,
    "skill between levels interpolates every number (1.5: halfway from Normal to Heroic)",
    { react: mid.react, err: mid.err }
  );
  check(
    CTF.skillAt(2.99) === CTF.skillAt(3) &&
      CTF.skillAt(-2) === CTF.skillAt(-1) &&
      CTF.skillAt(-1).react === S.trainee.react,
    "levels snap to steps and clamp to the ends (Trainee, −1, below Recruit)"
  );
  /* the ladder is ordered: every step up reacts faster, aims tighter and turns quicker */
  const ladder = ["trainee", "recruit", "normal", "heroic", "legendary"].map(k => S[k]);
  check(
    ladder.every(
      (s, i) =>
        i === 0 || (s.react < ladder[i - 1].react && s.err < ladder[i - 1].err && s.turn > ladder[i - 1].turn)
    ),
    "AI_SKILL is ordered: Trainee < Recruit < Normal < Heroic < Legendary",
    ladder.map(s => [s.react, s.err, s.turn])
  );
  /* the map memory: heat where things happen, faded by later matches, small when saved */
  const doc = K.MAPS.arena,
    V = (x, y, z) => new K.THREE.Vector3(x, y, z);
  const mem = new CTF.MapMemory(doc, null);
  for (let i = 0; i < 20; i++) mem.add("fight", V(20, 0, 20), 1);
  mem.add("seen", V(-20, 0, 0), 1);
  check(
    mem.heat("fight", 20, 20) === 0 && mem.n === 0,
    "a match's heat only counts once it is folded in",
    mem.heat("fight", 20, 20)
  );
  mem.commit();
  check(
    mem.heat("fight", 20, 20) === 1 && mem.heat("fight", -20, -20) === 0 && mem.n === 1,
    "fights leave heat where they happened",
    mem.heat("fight", 20, 20)
  );
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 20; k++) mem.add("fight", V(-20, 0, -20), 1);
    mem.commit();
  }
  check(
    mem.heat("fight", -20, -20) === 1 && mem.heat("fight", 20, 20) < 0.5,
    "older heat fades as new matches come in",
    { old: mem.heat("fight", 20, 20) }
  );
  const back = new CTF.MapMemory(doc, JSON.parse(JSON.stringify(mem.toJSON())));
  check(
    back.n === 4 &&
      back.heat("fight", -20, -20) === 1 &&
      Math.abs(back.heat("fight", 20, 20) - mem.heat("fight", 20, 20)) < 0.02,
    "the memory saves and loads",
    back.toJSON().f.length
  );
  const big = new CTF.MapMemory(doc, null);
  for (let x = -36; x < 36; x += 1)
    for (let z = -36; z < 36; z += 1) big.add("seen", V(x, 0, z), 1 + ((x * 7 + z * 13) & 15));
  big.commit();
  check(
    big.toJSON().s.length <= 600,
    "it keeps only the hottest cells (bounded size)",
    big.toJSON().s.length / 2
  );
  const junk = new CTF.MapMemory(doc, {
    w: mem.w,
    h: mem.h,
    n: 3,
    f: [5, "x", -2, 4, 999999, 3, 7, Infinity],
    s: "nope",
  });
  check(
    junk.toJSON().f.length === 0 || junk.toJSON().f.every(v => Number.isFinite(v)),
    "a hostile saved memory is cleaned",
    junk.toJSON()
  );
  /* a memory makes the AI hunt where fights happen, and watch where enemies are seen */
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 31, rules: "slayer", map: "arena", memory: back });
  G.start();
  const a = G.teams[0].agents[0];
  for (const x of G.agents)
    if (x !== a) {
      x.dead = true;
      x.body.dead = true;
      x.respawnAt = 1e9;
      x.body.pos.set(0, -80, 0);
    }
  const picks = new Set();
  a.role = "hunt";
  for (let i = 0; i < 40; i++) {
    a.huntPt = null;
    a.objective();
    picks.add(a.huntPt.x.toFixed(1) + "," + a.huntPt.z.toFixed(1));
  }
  const hotPick = [...picks].some(k => {
    const [x, z] = k.split(",").map(Number);
    return Math.hypot(x + 20, z + 20) < 4;
  });
  check(hotPick, "on a known map, hunters go where the fights were", [...picks].slice(0, 6));
  /* pre-aim: with a known sight line ahead, a pilot moving with no target looks at it */
  const seenMem = new CTF.MapMemory(doc, null);
  for (let k = 0; k < 30; k++) seenMem.add("seen", V(-22, 0, 16), 1);
  seenMem.commit();
  G.mem = seenMem;
  a.role = "hunt";
  a.target = null;
  /* the west lane, looking north up it */
  a.body.pos.set(-22, 0, -5);
  a.body.pos.y = K.groundBelow(-22, -5, 1, 0.05);
  const pre = a.preAim(1, new K.THREE.Vector3(0, 0, 1));
  check(
    !!pre && Math.abs(pre.z - 16) < 3,
    "pre-aim: a known sight line ahead is watched",
    pre && pre.toArray()
  );
  const behind = (a.preT = 0) || a.preAim(1, new K.THREE.Vector3(0, 0, -1));
  check(!behind, "pre-aim: not one behind you", behind && behind.toArray());
  CTF.AI.preAim = false;
  a.preT = 0;
  check(!a.preAim(1, new K.THREE.Vector3(0, 0, 1)), "pre-aim can be turned off (CTF.AI.preAim)");
  CTF.AI.preAim = true;
  /* the magnum's rhythm: at Legendary, a hit means the next shot at the weapon's rate exactly; a miss
     means holding fire for a steadier aim. Below Legendary the re-aim pause stays */
  const e = G.teams[1].agents[0];
  e.dead = false;
  e.body.dead = false;
  a.body.pos.set(0, 0, -10);
  a.body.pos.y = K.groundBelow(0, -10, 1, 0.05);
  e.body.pos.set(0, a.body.pos.y, -18);
  e.body.shield = 70;
  e.body.health = 999;
  e.body.spawnT = -99;
  a.body.yaw = 0;
  a.body.pitch = 0;
  const pistol = K.WEAPON_DATA[1];
  const fire = (lvl, hit) => {
    G.diff[0] = lvl;
    a.wpn = 1;
    a.ammo[1] = pistol.mag;
    a.magHit = hit;
    a.fireCD = 0;
    a.stepDt = 1 / 30;
    a.body.vel.set(0, 0, 0);
    a.shoot(e);
    return +a.fireCD.toFixed(3);
  };
  check(
    fire("legendary", true) === +pistol.rate.toFixed(3),
    "Legendary: landing with the magnum, it fires at its rate exactly",
    fire("legendary", true)
  );
  check(
    fire("legendary", false) === +(pistol.rate + S.legendary.magPace).toFixed(3) &&
      fire("heroic", true) === +(pistol.rate + S.heroic.magPace).toFixed(3),
    "after a miss, or below Legendary, the magnum keeps its pause to re-aim",
    { miss: fire("legendary", false), heroic: fire("heroic", true) }
  );
  CTF.AI.rhythm = false;
  check(
    fire("legendary", true) === +(pistol.rate + S.legendary.magPace).toFixed(3),
    "the rhythm can be turned off (CTF.AI.rhythm)"
  );
  CTF.AI.rhythm = true;
  /* holding range: a hunter already in a fight doesn't charge at its target */
  a.role = "hunt";
  a.target = e;
  a.acqT = 0;
  a.brain().enemyMem.set(e.id, { pos: e.body.pos.clone(), vel: e.body.vel.clone(), t: G.t, agent: e });
  a.objective();
  check(!a.mustMove, "a hunter in a fight lets the fight decide the range", a.mustMove);
  CTF.AI.holdRange = false;
  a.objective();
  check(a.mustMove, "(the old charge-in behaviour, CTF.AI.holdRange off)", a.mustMove);
  CTF.AI.holdRange = true;
  K.STORE.setBackend(K.STORE.memoryBackend());
}
/* ---------- shield recharge: the suit's thrusters hold it ---------- */
{
  const D = K.TUNE.regenDelay;
  /* shields broken at t = 0; then `use` (a body flag) held for `held` seconds; where the shield is at `t` */
  const shieldAt = (use, held, t) => {
    const b = new K.Body();
    b.shield = 0;
    b.lastDmg = 0;
    let now = 0;
    for (; now < t; now += 1 / 60) {
      const on = now < held;
      b.sprint = use === "sprint" && on;
      b.thrustT = use === "thrust" && on ? 0.2 : 0;
      b.stabbing = use === "hover" && on;
      b.pound = use === "pound" && on ? 1 : 0;
      b.regen(1 / 60, now);
    }
    return b.shield;
  };
  check(
    shieldAt(null, 0, D + 1) > 30,
    "shields recharge after the delay with no damage",
    shieldAt(null, 0, D + 1)
  );
  for (const use of ["sprint", "thrust", "hover", "pound"]) {
    const r = { during: shieldAt(use, D + 2, D + 1.9), heldThenFree: shieldAt(use, 2, 2 + D - 0.1) };
    check(
      r.during === 0 && r.heldThenFree === 0 && shieldAt(use, 2, 2 + D + 1) > 30,
      `${use}: no recharge while it lasts, and the full delay again after it stops`,
      r
    );
  }
}
check(Date.now() - t0 < 15000, "scenarios run in seconds", Date.now() - t0 + " ms");
finish("scenarios");
