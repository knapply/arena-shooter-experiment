/* Motion-capture locomotion (characters/anim.js), headless: every loop closes without a pop, and
   planted feet stay put (they drift less than 3 cm a stride) at every speed and direction the game
   moves at, with the feet placed where the rig's two-bone leg IK can actually put them, and the
   animation itself (before the feet lock) slides under 10 cm (18 cm for the walking diagonals, where
   clips of different cadences meet), so a lock never bends a leg far. The one-shots (stops, plants,
   starts, jumps, landings, the hit, emotes, the vault) have no capture glitches, transitions keep
   the feet planted too, a hit leans the body the way it was pushed, emotes free the arms and give
   way to moving, and the jump and landing fit the takeoff and the fall. Also times the animation
   cost per pilot. */
const fs = require("fs"),
  path = require("path");
const { check, finish } = require("./lib/check.js");
const SRC = path.join(__dirname, "..", "src");
const read = p => fs.readFileSync(path.join(SRC, p), "utf8");
const tune = read("world/physics.js").match(/const TUNE_DEF = (\{[\s\S]*?\});/)[1];
/* loaded the way the game runs it: one strict closure over the engine's shared scope */
const ctx = (0, eval)(
  [
    "(() => { 'use strict';",
    "const clamp = (v, a, b) => Math.max(a, Math.min(b, v));",
    "const TUNE = " + tune + ";",
    read("data/anim-clips.js"),
    read("characters/anim.js"),
    "return { ANIM, TUNE, ANIM_CLIPS }; })()",
  ].join("\n")
);
const { ANIM, TUNE, ANIM_CLIPS } = ctx;
const deg = r => (r * 180) / Math.PI;
const fix = (v, n = 1) => +v.toFixed(n);

/* ---------- every loop closes: no pop in pose or velocity across the seam ---------- */
const NB = ANIM_CLIPS.bones.length,
  ST = NB * 4 + 3;
const at = (c, x) => {
  const p = new Float32Array(ST);
  ANIM.sample(c, x, 1, p, true);
  ANIM.finish(p);
  return p;
};
const ang = (a, b, o) => {
  const d = Math.abs(a[o] * b[o] + a[o + 1] * b[o + 1] + a[o + 2] * b[o + 2] + a[o + 3] * b[o + 3]);
  return 2 * Math.acos(Math.min(1, d));
};
for (const m of ANIM_CLIPS.clips) {
  if (m.n === "jump" || m.shot) continue;
  const c = ANIM.clips[m.n];
  /* the step across the seam against the steps either side of it (an even clip has them all alike) */
  const e = 1 / (m.k * 4);
  const A = at(c, 1 - e),
    B = at(c, 0),
    Cc = at(c, e),
    D = at(c, 1 - 2 * e);
  let pop = 0,
    pp = 0;
  for (let b = 0; b < NB; b++) {
    const seam = ang(A, B, b * 4),
      around = Math.max(ang(D, A, b * 4), ang(B, Cc, b * 4));
    pop = Math.max(pop, seam - around);
  }
  for (let j = NB * 4; j < ST; j++) {
    const seam = Math.abs(A[j] - B[j]),
      around = Math.max(Math.abs(D[j] - A[j]), Math.abs(B[j] - Cc[j]));
    pp = Math.max(pp, seam - around);
  }
  check(
    deg(pop) < 0.5 && pp < 0.003,
    `${m.n} loops without a pop`,
    `${fix(deg(pop), 2)} deg, ${fix(pp * 1000)} mm`
  );
}

/* ---------- one-shots: no bone turns faster than a body can (a capture glitch would) ---------- */
for (const m of ANIM_CLIPS.clips) {
  if (!m.shot) continue;
  const c = ANIM.clips[m.n];
  const one = t => {
    const p = new Float32Array(ST);
    ANIM.sample(c, t, 1, p, false);
    ANIM.finish(p);
    return p;
  };
  let worst = 0,
    prev = one(0);
  for (let t = 1 / 60; t <= m.T; t += 1 / 60) {
    const p = one(t);
    for (let b = 0; b < NB; b++) worst = Math.max(worst, ang(prev, p, b * 4));
    prev = p;
  }
  check(
    deg(worst) < 32,
    `${m.n} plays without a glitch`,
    `fastest bone ${fix(deg(worst))} deg in a 60 Hz frame`
  );
}

/* ---------- planted feet do not skate ---------- */
const THIGH = 0.44,
  SHIN = 0.43;
const qrot = (q, v) => {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1],
    iy = w * v[1] + z * v[0] - x * v[2],
    iz = w * v[2] + x * v[1] - y * v[0],
    iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w - iw * x - iy * z + iz * y,
    iy * w - iw * y - iz * x + ix * z,
    iz * w - iw * z - ix * y + iy * x,
  ];
};
/** run a pilot for `secs` at speed s in direction a (relative to facing, radians), facing yaw (rad/s turning) */
function run({ s, a, crouch = false, sprint = false, secs = 4, turn = 0, near = true, plan = null }) {
  const L = ANIM.make();
  let x = 0,
    z = 0,
    yaw = 0.3;
  const I = {
    dt: 1 / 60,
    lr: 0,
    lf: 0,
    spd: 0,
    crouch,
    sprint,
    air: false,
    vy: 0,
    gd: 9,
    x,
    z,
    yaw,
    gL: 0,
    gR: 0,
    near,
    aim: false,
    busy: false,
  };
  const stances = [[], []],
    open = [null, null];
  let reachMiss = 0;
  const played = new Set();
  const n = Math.round(secs * 60);
  for (let f = 0; f < n; f++) {
    if (plan) ({ s, a } = plan(f / 60));
    I.lr = s * Math.sin(a);
    I.lf = s * Math.cos(a);
    I.spd = s;
    I.x = x;
    I.z = z;
    I.yaw = yaw;
    ANIM.update(L, I);
    if (L.sc) played.add(L.sc.n);
    if (L.idleB) played.add("idle drift");
    /* where the IK puts each ankle: toward the target, at most the leg's length from the hip */
    for (let k = 0; k < 2; k++) {
      const t = [L.tgt[k * 3], L.tgt[k * 3 + 1], L.tgt[k * 3 + 2]];
      const hip = [k ? 0.11 : -0.11, -0.05, 0];
      const d = [t[0] - hip[0], t[1] - hip[1], t[2] - hip[2]];
      const len = Math.hypot(...d);
      const cl = Math.min(len, THIGH + SHIN - 0.002);
      const put = d.map((v, j) => hip[j] + (v / len) * cl);
      const r = qrot(L.pelQ, put).map((v, j) => v + L.pelP[j]);
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw);
      const wx = x + r[0] * cy + r[2] * sy,
        wz = z - r[0] * sy + r[2] * cy;
      const planted = L.contact[k] > 0.5 && f > 60;
      if (planted) reachMiss = Math.max(reachMiss, len - cl);
      if (planted && !open[k]) open[k] = { x: wx, z: wz, drift: 0, n: 0 };
      if (planted) {
        open[k].drift = Math.max(open[k].drift, Math.hypot(wx - open[k].x, wz - open[k].z));
        open[k].n++;
      } else if (open[k]) {
        if (open[k].n > 2) stances[k].push(open[k].drift);
        open[k] = null;
      }
    }
    /* the body moves with the velocity in its own frame */
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    const vx = I.lr,
      vz = -I.lf;
    x += (vx * cy + vz * sy) / 60;
    z += (-vx * sy + vz * cy) / 60;
    yaw += turn / 60;
  }
  const all = [...stances[0], ...stances[1]];
  return {
    strides: all.length,
    drift: all.length ? Math.max(...all) : 0,
    reachMiss,
    played,
  };
}
const R = Math.PI / 180;
const cases = [];
for (const s of [1.3, 3.2, TUNE.run])
  for (const a of [0, 45, 90, 135, 180, -90]) cases.push({ s, a: a * R, name: `${s} m/s at ${a} deg` });
cases.push({ s: TUNE.sprint, a: 0, sprint: true, name: "sprint" });
for (const a of [0, 90, 180])
  cases.push({
    s: TUNE.crouchSpeed,
    a: a * R,
    crouch: true,
    name: `crouched ${TUNE.crouchSpeed} m/s at ${a} deg`,
  });
cases.push({ s: 0.9, a: 0, crouch: true, name: "crouched walk" });
let worst = 0;
for (const c of cases) {
  const r = run(c);
  const raw = run(Object.assign({}, c, { near: false }));
  worst = Math.max(worst, r.drift);
  check(
    r.strides >= 4 && r.drift < 0.03 && r.reachMiss < 0.02 && raw.drift < (c.s < 2 ? 0.18 : 0.1),
    `${c.name}: planted feet hold`,
    `${r.strides} stances, drift ${fix(r.drift * 100)} cm (unlocked ${fix(raw.drift * 100)} cm), out of reach ${fix(r.reachMiss * 100)} cm`
  );
}
/* standing still and turning on the spot: the feet step instead of twisting or sliding */
{
  const r = run({ s: 0, a: 0, turn: 2.5, secs: 4 });
  check(
    r.strides >= 4 && r.drift < 0.03,
    "turning on the spot: the feet step, planted feet hold",
    `${r.strides} stances, drift ${fix(r.drift * 100)} cm`
  );
}
/* transitions: braking to a stop, reversing a run, setting off, a long idle drifting between idles */
{
  const stop = run({ secs: 6, plan: t => ({ s: t % 2 < 1.2 ? TUNE.run : 0, a: 0 }) });
  check(
    stop.played.has("stop") && stop.drift < 0.03 && stop.reachMiss < 0.02,
    "running into a stop: braking plant, planted feet hold",
    `played ${[...stop.played].join(", ")}; drift ${fix(stop.drift * 100)} cm`
  );
  const flip = run({ secs: 6, plan: t => ({ s: TUNE.run, a: Math.floor(t / 0.8) % 2 ? Math.PI : 0 }) });
  check(
    flip.played.has("plant") && flip.drift < 0.03 && flip.reachMiss < 0.02,
    "reversing a run: a plant, planted feet hold",
    `played ${[...flip.played].join(", ")}; drift ${fix(flip.drift * 100)} cm`
  );
  const go = run({ secs: 6, plan: t => ({ s: t % 2 < 1 ? 0 : TUNE.run, a: 0 }) });
  check(
    go.played.has("start") && go.drift < 0.03,
    "setting off from a standstill: a push-off, planted feet hold",
    `played ${[...go.played].join(", ")}; drift ${fix(go.drift * 100)} cm`
  );
  const idle = run({ s: 0, a: 0, secs: 40 });
  check(
    idle.played.has("idle drift") && idle.drift < 0.03,
    "a long idle drifts between captured idles, feet planted",
    `played ${[...idle.played].join(", ")}; drift ${fix(idle.drift * 100)} cm`
  );
}
/* ---------- reactions, emotes, jumps and landings ---------- */
const stand = () => ({
  dt: 1 / 60,
  lr: 0,
  lf: 0,
  spd: 0,
  crouch: false,
  sprint: false,
  air: false,
  vy: 0,
  gd: 9,
  x: 0,
  z: 0,
  yaw: 0,
  gL: 0,
  gR: 0,
  near: true,
  aim: false,
  busy: false,
});
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
/** the chest's up direction in the pilot's frame (x right, z back) */
const chestUp = L => {
  const sp = i => [L.spine[i], L.spine[i + 1], L.spine[i + 2], L.spine[i + 3]];
  const q = qmul(qmul(qmul([...L.pelQ], sp(0)), sp(4)), sp(8));
  return qrot(q, [0, 1, 0]);
};
{
  /* a push from behind throws the chest forward (-z), one from the left throws it right (+x) */
  /* (against a twin that is not hit: the same idle from the same moment, so only the hit differs) */
  const lean = (px, pz) => {
    const pair = [ANIM.make(), ANIM.make()],
      I = stand();
    for (const L of pair) {
      L.idleA = ANIM.clips.idle;
      L.idleT = 0;
      L.idleNext = 99;
      for (let i = 0; i < 60; i++) ANIM.update(L, I);
    }
    const [L, twin] = pair;
    ANIM.hit(L, px, pz, 1);
    let most = [0, 0],
      settled = 0;
    for (let i = 0; i < 90; i++) {
      ANIM.update(L, I);
      ANIM.update(twin, I);
      const u = chestUp(L),
        v = chestUp(twin);
      const d = [u[0] - v[0], u[2] - v[2]];
      if (i < 24 && Math.hypot(...d) > Math.hypot(...most)) most = d;
      settled = Math.hypot(...d);
    }
    return { most, settled };
  };
  const fwd = lean(0, -1),
    right = lean(1, 0);
  check(
    fwd.most[1] < -0.08 && Math.abs(fwd.most[0]) < Math.abs(fwd.most[1]) && fwd.settled < 0.03,
    "a hit from behind lurches the chest forward, then it settles",
    `chest moved ${fwd.most.map(v => fix(v, 2))}, settles to ${fix(fwd.settled, 3)}`
  );
  check(
    right.most[0] > 0.08 && Math.abs(right.most[1]) < Math.abs(right.most[0]),
    "a hit from the left lurches the chest right",
    `chest moved ${right.most.map(v => fix(v, 2))}`
  );
}
{
  /* a wave raises the free (left) hand, then gives way when the pilot moves */
  const L = ANIM.make(),
    I = stand();
  for (let i = 0; i < 60; i++) ANIM.update(L, I);
  const y0 = L.hand[1];
  const ok = ANIM.emote(L, "wave");
  let top = -9,
    w = 0;
  for (let i = 0; i < 50; i++) {
    ANIM.update(L, I);
    top = Math.max(top, L.hand[1]);
    w = Math.max(w, L.emote);
  }
  I.lf = I.spd = TUNE.run;
  for (let i = 0; i < 20; i++) ANIM.update(L, I);
  check(
    ok && w > 0.9 && top - y0 > 0.3 && L.emote < 0.05,
    "a wave lifts the free hand and gives way to running",
    `hand rose ${fix(top - y0, 2)} m, weight ${fix(w, 2)}, after running ${fix(L.emote, 2)}`
  );
  check(!ANIM.emote(L, "cheer"), "no emote while running");
}
{
  /* the takeoff picks the jump; a long fall lands deeper than a hop */
  const jump = spd => {
    const L = ANIM.make(),
      I = stand();
    for (let i = 0; i < 30; i++) ANIM.update(L, I);
    I.lf = I.spd = spd;
    I.air = true;
    I.vy = 7.4;
    ANIM.update(L, I);
    return L.J.n;
  };
  const land = vy => {
    const L = ANIM.make(),
      I = stand();
    for (let i = 0; i < 30; i++) ANIM.update(L, I);
    I.air = true;
    for (let i = 0; i < 20; i++) {
      I.vy = vy;
      ANIM.update(L, I);
    }
    I.air = false;
    I.vy = 0;
    let low = 9;
    for (let i = 0; i < 60; i++) {
      ANIM.update(L, I);
      low = Math.min(low, L.pelP[1]);
    }
    return low;
  };
  check(
    jump(TUNE.run) === "jumpRun" && jump(0) === "jump",
    "a running takeoff leaps, a standing one jumps",
    `${jump(TUNE.run)} / ${jump(0)}`
  );
  const soft = land(-7),
    hard = land(-17);
  check(
    hard < soft - 0.08,
    "a long fall lands deeper than a hop",
    `hips down to ${fix(hard, 2)} vs ${fix(soft, 2)} m`
  );
}
/* ---------- the cost: one pilot's animation per frame ---------- */
{
  const L = ANIM.make();
  const I = {
    dt: 1 / 60,
    lr: 2,
    lf: 5,
    spd: Math.hypot(2, 5),
    crouch: false,
    sprint: false,
    air: false,
    vy: 0,
    gd: 9,
    x: 0,
    z: 0,
    yaw: 0,
    gL: 0,
    gR: 0,
    near: true,
    aim: false,
    busy: false,
  };
  for (let i = 0; i < 2000; i++) ANIM.update(L, I);
  const N = 20000,
    t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    I.x += 0.1;
    ANIM.update(L, I);
  }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  check(us < 20, "animation costs under 20 us per pilot per frame", `${fix(us, 2)} us`);
}
finish("anim");
