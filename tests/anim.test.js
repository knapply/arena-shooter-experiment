/* Motion-capture locomotion (characters/anim.js), headless: every loop closes without a pop, and
   planted feet stay put (they drift less than 3 cm a stride) at every speed and direction the game
   moves at, with the feet placed where the rig's two-bone leg IK can actually put them, and the
   animation itself (before the feet lock) slides under 10 cm (18 cm for the walking diagonals, where
   clips of different cadences meet), so a lock never bends a leg far. Also times
   the animation cost per pilot. */
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const { check, finish } = require("./lib/check.js");
const SRC = path.join(__dirname, "..", "src");
const read = p => fs.readFileSync(path.join(SRC, p), "utf8");
const tune = read("world/physics.js").match(/const TUNE_DEF = (\{[\s\S]*?\});/)[1];
const ctx = vm.createContext({ atob, Math, Float32Array, Int16Array, Uint8Array, Array, Object });
vm.runInContext(
  "const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\nconst TUNE = " +
    tune +
    ";\n" +
    read("data/anim-clips.js") +
    "\n" +
    read("characters/anim.js") +
    "\nthis.ANIM = ANIM; this.TUNE = TUNE; this.ANIM_CLIPS = ANIM_CLIPS;",
  ctx
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
  if (m.n === "jump") continue;
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
function run({ s, a, crouch = false, sprint = false, secs = 4, turn = 0, near = true }) {
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
  };
  const stances = [[], []],
    open = [null, null];
  let reachMiss = 0;
  const n = Math.round(secs * 60);
  for (let f = 0; f < n; f++) {
    I.lr = s * Math.sin(a);
    I.lf = s * Math.cos(a);
    I.spd = s;
    I.x = x;
    I.z = z;
    I.yaw = yaw;
    ANIM.update(L, I);
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
  check(r.drift < 0.03, "turning on the spot: planted feet hold", `drift ${fix(r.drift * 100)} cm`);
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
  };
  for (let i = 0; i < 2000; i++) ANIM.update(L, I);
  const N = 20000,
    t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    I.x += 0.1;
    ANIM.update(L, I);
  }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  check(us < 50, "animation costs under 50 us per pilot per frame", `${fix(us, 2)} us`);
}
finish("anim");
