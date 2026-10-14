/* Builds src/data/anim-clips.js from motion capture: clips of the CMU Graphics Lab Motion Capture
   Database (mocap.cs.cmu.edu) in B. Hahne's BVH conversion (cgspeed, 2010 MotionBuilder-friendly
   release). The BVH files are not kept in the repository; download them and point this at them:
     node tools/mocap/convert.js <dir>        (<dir>/<take>/<take>.bvh or <dir>/<take>.bvh)
   For every clip it:
   - retargets the capture onto the pilot rig: each bone takes its source bone's rotation relative to
     the capture's T pose (frame 0), turned from the capture's facing (+Z) to ours (-Z);
   - finds one clean cycle of a loop (the window whose end pose and velocity best match its start,
     moving straight at a steady pace), removes the root motion and the heading, spreads the small
     remaining mismatch over the cycle so it loops exactly, and starts it at the left foot's strike;
   - drops the hips so planted feet sit on the ground with the rig's own leg lengths, and records
     when each foot is planted and how fast the clip travels;
   - resamples it to the fewest evenly spaced keys that reproduce it within 1.5 degrees, and stores
     rotations as 14-bit quaternions (x, y, z; w is rebuilt), each channel predicted from the two keys
     before it and the remainder written as a variable-length number in base64 characters.
   The jump is kept as a short one-shot clip with its takeoff and landing times. */
const fs = require("fs"),
  path = require("path");
const { readBVH, pose, qmul, qinv, qrot, qnorm, qang, qslerp, qaxis, qfromTo } = require("./bvh.js");

const OUT = path.join(__dirname, "../../src/data/anim-clips.js");
/* the rig's bones that clips drive, their parent in the stored hierarchy and their source joint.
   The arms are stored relative to the chest (the clavicles stay procedural). */
const BONES = [
  ["pelvis", null, "Hips"],
  ["spine", "pelvis", "LowerBack"],
  ["spine2", "spine", "Spine"],
  ["chest", "spine2", "Spine1"],
  ["hipL", "pelvis", "LeftUpLeg"],
  ["knL", "hipL", "LeftLeg"],
  ["anL", "knL", "LeftFoot"],
  ["hipR", "pelvis", "RightUpLeg"],
  ["knR", "hipR", "RightLeg"],
  ["anR", "knR", "RightFoot"],
  ["shL", "chest", "LeftArm"],
  ["elL", "shL", "LeftForeArm"],
  ["shR", "chest", "RightArm"],
  ["elR", "shR", "RightForeArm"],
];
/* the rig's rest directions (child offsets) for the alignment to the capture's T pose */
const REST = {
  spine: [0, 1, 0],
  spine2: [0, 1, 0],
  chest: [0, 1, 0],
  hipL: [0, -1, 0],
  knL: [0, -1, 0],
  anL: [0, -0.51, -0.86],
  hipR: [0, -1, 0],
  knR: [0, -1, 0],
  anR: [0, -0.51, -0.86],
  shL: [0, -1, 0],
  elL: [0, -1, 0],
  shR: [0, -1, 0],
  elR: [0, -1, 0],
};
/* the source joint whose position the bone points at (for the T-pose alignment) */
const CHILD = {
  LowerBack: "Spine",
  Spine: "Spine1",
  Spine1: "Neck1",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
  RightFoot: "RightToeBase",
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
};
/* the rig's proportions (characters/rig.js BONES) */
const RIG = {
  pelvisY: 0.96,
  hip: [0.11, -0.05, 0],
  thigh: 0.44,
  shin: 0.43,
  toe: [0, -0.06, -0.1],
  ankleRest: 0.07,
};
/* which takes become which clips. len: the cycle length range (s); dir: travel direction relative
   to facing (degrees, + is to the right); keys: max keys per second */
const CLIPS = [
  { n: "idle", take: "111_28", len: [3, 6], still: true },
  { n: "walk", take: "16_15", len: [0.8, 1.5], dir: 0 },
  { n: "jog", take: "16_35", len: [0.55, 1.0], dir: 0 },
  { n: "run", take: "16_55", len: [0.5, 1.0], dir: 0 },
  { n: "sprint", take: "09_01", len: [0.45, 0.9], dir: 0 },
  { n: "back", take: "136_25", len: [0.8, 1.6], dir: 180 },
  { n: "left", take: "141_33", len: [0.95, 1.4], dir: -90 },
  { n: "right", take: "141_33", len: [0.95, 1.4], dir: -90, mirror: true },
  { n: "crouch", take: "136_09", len: [0.8, 1.8], dir: 0 },
  { n: "crouchBack", take: "136_11", len: [0.8, 1.8], dir: 180 },
  /* variety: two more idles (weight shifts, look-arounds) and a crouched walk up on the toes */
  { n: "idle2", take: "137_28", len: [3, 5], still: true },
  { n: "idle3", take: "113_21", len: [3, 5.5], still: true },
  { n: "crouch2", take: "136_13", len: [0.8, 1.8], dir: 0 },
];
/* one-shots (shotClip): windows of takes, in seconds from the take's first frame */
const SHOTS = [
  /* a run braking to a stop, planted; a quick stop that turns on the planted foot; the first
     strides out of a standstill (its upper body) */
  { n: "stop", take: "143_02", t: [0.55, 1.45], root: "none" },
  { n: "plant", take: "127_19", t: [0.55, 1.35], root: "none" },
  { n: "start", take: "143_03", t: [0.9, 1.65], root: "none" },
  /* a running leap; a drop off a ledge onto both feet */
  { n: "jumpRun", take: "49_05", t: [0.15, 1.2], root: "none", air: true },
  { n: "landHard", take: "82_04", t: [2.3, 3.75], root: "none", air: true, landRef: true },
  /* a stumble, played additively on the hips and spine as a hit reaction */
  { n: "hit", take: "104_13", t: [0.5, 1.15], root: "none" },
  /* emotes: both arms up; a flex; a wave (mirrored, so the free left hand waves); a shrug */
  { n: "cheer", take: "79_69", t: [0.8, 2.0], root: "none", fps: 20 },
  { n: "flex", take: "79_94", t: [3.9, 4.95], root: "none", fps: 20 },
  { n: "wave", take: "141_16", t: [0.1, 1.9], root: "none", mirror: true, fps: 20 },
  { n: "shrug", take: "141_21", t: [0.55, 1.35], root: "none", fps: 20 },
  /* stepping up onto a ledge and over (the clamber's body) */
  { n: "vault", take: "141_07", t: [0.85, 1.8], root: "none" },
];
const JUMP = { n: "jump", take: "16_01" };
const TURN = { take: "69_16" };

const G = qaxis([0, 1, 0], Math.PI); // the capture faces +Z, the rig faces -Z
const toRig = q => qmul(qmul(G, q), qinv(G));
const vRig = v => [-v[0], v[1], -v[2]];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function load(dir, take) {
  for (const f of [path.join(dir, take, take + ".bvh"), path.join(dir, take + ".bvh")])
    if (fs.existsSync(f)) return readBVH(f);
  throw new Error(`missing ${take}.bvh in ${dir}`);
}

/** the whole take retargeted: per frame the rig-space world rotation of every stored bone, the hips
    position (rig scale), and the source feet (rig scale) for contact detection */
function retarget(bvh) {
  const ix = n => {
    const i = bvh.joints.findIndex(j => j.name === n);
    if (i < 0) throw new Error("no joint " + n);
    return i;
  };
  const legLen = Math.hypot(...bvh.joints[ix("LeftLeg")].off) + Math.hypot(...bvh.joints[ix("LeftFoot")].off);
  const sc = (RIG.thigh + RIG.shin) / legLen;
  const T = pose(bvh, 0);
  const align = {},
    inv0 = {};
  for (const [b, , src] of BONES) {
    const j = ix(src);
    inv0[b] = qinv(T.R[j]);
    if (REST[b]) {
      const c = ix(CHILD[src]);
      const d = vRig(T.P[c].map((v, k) => v - T.P[j][k]));
      const l = Math.hypot(...d);
      align[b] = qfromTo(REST[b], [d[0] / l, d[1] / l, d[2] / l]);
    } else align[b] = [0, 0, 0, 1];
  }
  const feet = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"].map(ix);
  const frames = [];
  for (let f = 1; f < bvh.frames.length; f++) {
    const p = pose(bvh, f);
    const W = {};
    for (const [b, , src] of BONES) W[b] = qmul(toRig(qmul(p.R[ix(src)], inv0[b])), align[b]);
    frames.push({
      W,
      hips: vRig(p.P[ix("Hips")]).map(v => v * sc),
      feet: feet.map(j => vRig(p.P[j]).map(v => v * sc)),
    });
  }
  return { frames, dt: bvh.dt, sc };
}
/* heading of the hips (yaw of their forward axis, 0 = -Z, + turns toward +X... measured as the rig's yaw) */
function heading(W) {
  const f = qrot(W.pelvis, [0, 0, -1]);
  return Math.atan2(-f[0], -f[2]);
}
/** local rotations in the stored hierarchy, with the heading taken out of the pelvis */
function locals(W, yaw) {
  const H = qaxis([0, 1, 0], -yaw);
  const out = {};
  for (const [b, p] of BONES) out[b] = p ? qmul(qinv(W[p]), W[b]) : qmul(H, W[b]);
  return out;
}
/** smoothed horizontal velocity of the hips at every frame, in the hips' heading frame */
function travel(R) {
  const n = R.frames.length,
    h = Math.round(0.25 / R.dt);
  const out = [];
  for (let f = 0; f < n; f++) {
    const a = Math.max(0, f - h),
      b = Math.min(n - 1, f + h);
    const pa = R.frames[a].hips,
      pb = R.frames[b].hips;
    const t = (b - a) * R.dt || 1;
    const vx = (pb[0] - pa[0]) / t,
      vz = (pb[2] - pa[2]) / t;
    const y = heading(R.frames[f].W);
    /* rotate world velocity into the heading frame: x right, z back */
    const c = Math.cos(y),
      s = Math.sin(y);
    out.push({ vx: vx * c - vz * s, vz: vx * s + vz * c, yaw: y });
  }
  return out;
}

/** pick the loop window: start pose and velocity match the end, steady straight travel in dir */
function findLoop(R, spec) {
  const n = R.frames.length,
    dt = R.dt;
  const tv = travel(R);
  const L = R.frames.map((fr, f) => locals(fr.W, tv[f].yaw));
  const names = BONES.map(b => b[0]);
  const d = (a, b) => {
    let s = 0;
    for (const k of names) s += qang(L[a][k], L[b][k]);
    return s;
  };
  const lo = Math.round(spec.len[0] / dt),
    hi = Math.round(spec.len[1] / dt);
  let best = null;
  for (let a = 2; a < n - lo - 2; a += 1) {
    for (let b = a + lo; b <= Math.min(n - 3, a + hi); b++) {
      let c = d(a, b) + 0.6 * d(a + 2, b + 2) + 0.6 * d(a - 2, b - 2);
      /* the window must travel straight and steadily in the wanted direction */
      let sp = 0,
        sp2 = 0,
        dev = 0;
      const step = Math.max(1, Math.round((b - a) / 12));
      let m = 0;
      for (let f = a; f < b; f += step, m++) {
        const v = Math.hypot(tv[f].vx, tv[f].vz);
        sp += v;
        sp2 += v * v;
        if (!spec.still) dev += Math.abs(wrap(Math.atan2(tv[f].vx, -tv[f].vz) - (spec.dir * Math.PI) / 180));
      }
      sp /= m;
      const cv = Math.sqrt(Math.max(0, sp2 / m - sp * sp)) / Math.max(0.2, sp);
      if (spec.still) c += sp * 8 + Math.abs(wrap(tv[b].yaw - tv[a].yaw)) * 4;
      else {
        if (sp < 0.3) continue;
        c += (dev / m) * 6 + cv * 4 + Math.abs(wrap(tv[b].yaw - tv[a].yaw)) * 6;
      }
      c += (((b - a) * dt) / spec.len[1]) * 0.15;
      if (!best || c < best.c) best = { a, b, c };
    }
  }
  return best;
}

/* the rig's forward kinematics for one leg, from stored locals: hip joint, knee, ankle and toe in
   the root frame */
function legFK(Lc, pel, s) {
  const sd = s === "L" ? -1 : 1;
  const Wp = Lc.pelvis;
  const hipP = qrot(Wp, [sd * RIG.hip[0], RIG.hip[1], RIG.hip[2]]).map((v, k) => v + pel[k]);
  const Wh = qmul(Wp, Lc["hip" + s]);
  const knP = qrot(Wh, [0, -RIG.thigh, 0]).map((v, k) => v + hipP[k]);
  const Wk = qmul(Wh, Lc["kn" + s]);
  const anP = qrot(Wk, [0, -RIG.shin, 0]).map((v, k) => v + knP[k]);
  const Wa = qmul(Wk, Lc["an" + s]);
  const toP = qrot(Wa, RIG.toe).map((v, k) => v + anP[k]);
  return { hipP, knP, anP, toP };
}

/** sample a list of frames (per-frame locals and pelvis position) at fractional index x, cyclic */
function sampleCyc(F, x) {
  const n = F.length;
  const i = Math.floor(x),
    u = x - i;
  const A = F[((i % n) + n) % n],
    B = F[(((i + 1) % n) + n) % n];
  const L = {};
  for (const k in A.L) L[k] = qslerp(A.L[k], B.L[k], u);
  return { L, pel: A.pel.map((v, k) => v + (B.pel[k] - v) * u) };
}

/* runtime interpolation (characters/anim.js does the same): Catmull-Rom through the keys, normalised */
function cr(p0, p1, p2, p3, u) {
  const u2 = u * u,
    u3 = u2 * u;
  return (
    0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}
function keyAt(K, x, loop) {
  const n = K.length;
  const i = Math.floor(x),
    u = x - i;
  const at = j => (loop ? K[((j % n) + n) % n] : K[Math.max(0, Math.min(n - 1, j))]);
  const k0 = at(i - 1),
    k1 = at(i),
    k2 = at(i + 1),
    k3 = at(i + 2);
  const L = {};
  for (const b in k1.L) {
    const q1 = k1.L[b];
    const al = q => (q[0] * q1[0] + q[1] * q1[1] + q[2] * q1[2] + q[3] * q1[3] < 0 ? q.map(v => -v) : q);
    const a = al(k0.L[b]),
      c = al(k2.L[b]),
      d = al(k3.L[b]);
    L[b] = qnorm([0, 1, 2, 3].map(j => cr(a[j], q1[j], c[j], d[j], u)));
  }
  const pel = [0, 1, 2].map(j => cr(k0.pel[j], k1.pel[j], k2.pel[j], k3.pel[j], u));
  return { L, pel };
}
/* 14-bit quantisation round trip, so the key count is chosen on what the game will actually see */
const Q = 8191,
  PQ = 4000; // pelvis offsets in 1/4000 m (+-8 m)
function quant(k) {
  const L = {};
  for (const b in k.L) {
    let q = k.L[b];
    if (q[3] < 0) q = q.map(v => -v);
    const x = Math.round(q[0] * Q) / Q,
      y = Math.round(q[1] * Q) / Q,
      z = Math.round(q[2] * Q) / Q;
    L[b] = qnorm([x, y, z, Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))]);
  }
  return { L, pel: k.pel.map(v => Math.round(v * PQ) / PQ) };
}
/** the fewest evenly spaced keys (up to maxN) that reproduce frames F within tol */
function reduce(F, loop, minN, maxN, tolA, tolP) {
  const n = F.length;
  for (let N = minN; ; N += 2) {
    const K = [];
    for (let i = 0; i < N; i++) K.push(quant(sampleCyc(F, loop ? (i * n) / N : (i * (n - 1)) / (N - 1))));
    let ea = 0,
      ep = 0;
    for (let f = 0; f < n; f++) {
      const x = loop ? (f * N) / n : (f * (N - 1)) / (n - 1);
      const k = keyAt(K, x, loop);
      for (const b in k.L) ea = Math.max(ea, qang(k.L[b], F[f].L[b]));
      ep = Math.max(ep, Math.hypot(...k.pel.map((v, j) => v - F[f].pel[j])));
    }
    if ((ea < tolA && ep < tolP) || N >= maxN) return { K, ea, ep };
  }
}

/** one looping clip */
function loopClip(R, spec) {
  const w = findLoop(R, spec);
  const { a, b } = w;
  const n = b - a,
    dt = R.dt,
    T = n * dt;
  /* the window's mean heading becomes facing -Z */
  let sx = 0,
    sz = 0;
  for (let f = a; f < b; f++) {
    const y = heading(R.frames[f].W);
    sx += Math.sin(y);
    sz += Math.cos(y);
  }
  const yaw = Math.atan2(sx, sz);
  const H = qaxis([0, 1, 0], -yaw);
  const rot = v => qrot(H, v);
  /* root motion: the straight line from the window's start to its end */
  const p0 = rot(R.frames[a].hips),
    p1 = rot(R.frames[b].hips);
  const vel = [(p1[0] - p0[0]) / T, 0, (p1[2] - p0[2]) / T];
  const F = [];
  for (let f = a; f <= b; f++) {
    const fr = R.frames[f];
    const L = locals(fr.W, 0);
    L.pelvis = qmul(H, fr.W.pelvis);
    const h = rot(fr.hips);
    const t = (f - a) * dt;
    F.push({ L, pel: [h[0] - p0[0] - vel[0] * t, h[1], h[2] - p0[2] - vel[2] * t], src: fr.feet.map(rot) });
  }
  /* spread the end-to-start mismatch over the cycle, so the last frame is the first again */
  const end = F[n];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    for (const k in F[i].L) {
      const dq = qmul(F[0].L[k], qinv(end.L[k]));
      F[i].L[k] = qmul(qslerp([0, 0, 0, 1], dq, u), F[i].L[k]);
    }
    F[i].pel = F[i].pel.map((v, j) => v + (F[0].pel[j] - end.pel[j]) * u);
  }
  F.pop();
  /* a mirrored clip (the other side's step): swap the sides and reflect across the body's midplane */
  if (spec.mirror) {
    const mq = q => [q[0], -q[1], -q[2], q[3]];
    for (const fr of F) {
      const L = {};
      for (const k in fr.L) L[k.replace(/L$/, "#").replace(/R$/, "L").replace("#", "R")] = mq(fr.L[k]);
      fr.L = L;
      fr.pel[0] = -fr.pel[0];
      fr.src = [2, 3, 0, 1].map(i => [-fr.src[i][0], fr.src[i][1], fr.src[i][2]]);
    }
    vel[0] = -vel[0];
  }
  /* contacts from the capture's own feet (world space, root motion included): a foot is planted
     while its lower point is near the ground and barely moving */
  const ground = Math.min(...F.map(fr => Math.min(...fr.src.map(p => p[1]))));
  const contact = [0, 1].map(s => {
    const c = [];
    for (let i = 0; i < n; i++) {
      /* (velocity over +-2 frames, not across the loop's seam: the world positions jump there) */
      const j0 = Math.max(0, i - 2),
        j1 = Math.min(n - 1, i + 2);
      const sp = k =>
        Math.hypot(F[j1].src[k][0] - F[j0].src[k][0], F[j1].src[k][2] - F[j0].src[k][2]) / ((j1 - j0) * dt);
      const ank = F[i].src[s * 2],
        toe = F[i].src[s * 2 + 1];
      const h = Math.min(ank[1] - ground - 0.05, toe[1] - ground);
      const v = Math.min(sp(s * 2), sp(s * 2 + 1));
      c.push(h < 0.09 && v < Math.max(0.6, 0.3 * Math.hypot(vel[0], vel[2])) ? 1 : 0);
    }
    /* close short gaps and drop short blips (under 40 ms) */
    const m = Math.round(0.04 / dt);
    for (const val of [1, 0])
      for (let i = 0; i < n; i++) {
        if (c[i] === val) continue;
        let j = i;
        while (j < i + n && c[j % n] !== val) j++;
        if (j - i <= m && c[(i - 1 + n) % n] === val) for (let k = i; k < j; k++) c[k % n] = val;
        i = j;
      }
    return c;
  });
  /* the left foot's strike starts the cycle (an idle has no strike: it keeps its start) */
  let s0 = 0;
  if (!spec.still) {
    for (let i = 0; i < n; i++) if (contact[0][i] && !contact[0][(i - 1 + n) % n]) s0 = i;
  }
  const G2 = F.map((_, i) => F[(i + s0) % n]);
  const C2 = contact.map(c => c.map((_, i) => c[(i + s0) % n]));
  /* drop the hips so the planted feet stand on the ground with the rig's legs */
  const clear = [];
  for (let i = 0; i < n; i++)
    for (const [s, si] of [
      ["L", 0],
      ["R", 1],
    ])
      if (C2[si][i] || spec.still) {
        const fk = legFK(G2[i].L, G2[i].pel, s);
        clear.push(Math.min(fk.anP[1] - RIG.ankleRest, fk.toP[1] - 0.01));
      }
  clear.sort((x, y) => x - y);
  const dy = clear.length ? clear[Math.floor(clear.length * 0.3)] : 0;
  for (const fr of G2) fr.pel = [fr.pel[0], fr.pel[1] - dy - RIG.pelvisY, fr.pel[2]];
  /* travel speed as the rig's planted feet see it: their mean velocity while down */
  let fv = [0, 0],
    fc = 0;
  for (let i = 0; i < n; i++)
    for (const [s, si] of [
      ["L", 0],
      ["R", 1],
    ])
      if (C2[si][i] && C2[si][(i + 1) % n]) {
        const A = legFK(G2[i].L, G2[i].pel, s).anP,
          B = legFK(G2[(i + 1) % n].L, G2[(i + 1) % n].pel, s).anP;
        fv[0] += (B[0] - A[0]) / dt;
        fv[1] += (B[2] - A[2]) / dt;
        fc++;
      }
  const footVel = fc ? [-fv[0] / fc, -fv[1] / fc] : [0, 0];
  const red = reduce(
    G2,
    true,
    spec.still ? 8 : 12,
    Math.round(T * (spec.still ? 8 : 40)),
    (1.5 * Math.PI) / 180,
    0.006
  );
  const span = c => {
    /* [on, off, on, off, ...] phases of the stances in the cycle (a stance may wrap past the end) */
    const out = [];
    for (let i = 0; i < n; i++)
      if (c[i] && !c[(i - 1 + n) % n]) {
        let j = i;
        while (c[j % n] && j < i + n) j++;
        out.push(i / n, (j % n) / n);
      }
    if (!out.length) return c[0] ? [0, 1] : [0, 0];
    return out;
  };
  return {
    n: spec.n,
    take: spec.take,
    win: [a + 1, b + 1],
    T,
    vel: [vel[0], vel[2]],
    footVel,
    contact: [span(C2[0]), span(C2[1])],
    keys: red.K,
    err: [red.ea, red.ep],
    duty: C2[0].reduce((s, v) => s + v, 0) / n,
  };
}

/** the jump: from the crouch before takeoff to the recovery after landing, one-shot */
function jumpClip(R) {
  const fr = R.frames,
    n = fr.length,
    dt = R.dt;
  const ground = Math.min(...fr.map(f => Math.min(...f.feet.map(p => p[1]))));
  const air = fr.map(f => Math.min(...f.feet.map(p => p[1])) - ground > 0.05);
  /* the longest airborne run */
  let bs = 0,
    bl = 0;
  for (let i = 0; i < n; i++) {
    if (!air[i]) continue;
    let j = i;
    while (j < n && air[j]) j++;
    if (j - i > bl) {
      bl = j - i;
      bs = i;
    }
    i = j;
  }
  const a = Math.max(0, bs - Math.round(0.3 / dt)),
    b = Math.min(n - 1, bs + bl + Math.round(0.45 / dt));
  const y0 = heading(fr[a].W);
  const H = qaxis([0, 1, 0], -y0);
  const base = qrot(H, fr[a].hips);
  const F = [];
  for (let f = a; f <= b; f++) {
    const L = locals(fr[f].W, 0);
    L.pelvis = qmul(H, fr[f].W.pelvis);
    const h = qrot(H, fr[f].hips);
    F.push({ L, pel: [h[0] - base[0], h[1], h[2] - base[2]] });
  }
  /* the game moves the body through the air itself: take the ballistic arc out of the hips, leaving
     only how they move against the legs (the crouch, the tuck, the reach for the ground) */
  const iu = bs - a,
    id = bs + bl - a,
    D = (id - iu) * dt;
  for (let i = iu; i <= id; i++) {
    const t = (i - iu) * dt;
    F[i].pel[1] -= 0.5 * 9.81 * t * (D - t);
  }
  /* standing height: the first frame's feet on the ground */
  const fk = legFK(F[0].L, F[0].pel, "L");
  const dy = Math.min(fk.anP[1] - RIG.ankleRest, fk.toP[1] - 0.01);
  for (const f of F) f.pel = [f.pel[0], f.pel[1] - dy - RIG.pelvisY, f.pel[2]];
  const T = (b - a) * dt;
  const red = reduce(F, false, 10, Math.round(T * 30), (2 * Math.PI) / 180, 0.01);
  return {
    n: "jump",
    take: JUMP.take,
    win: [a + 1, b + 1],
    T,
    up: (bs - a) * dt,
    down: (bs + bl - a) * dt,
    keys: red.K,
    err: [red.ea, red.ep],
  };
}

/** capture glitches (a marker swapped for a frame or a few): a bone that turns faster than a body
    can (over 18 degrees in a frame at 120 Hz) is bridged from the last good frame to the next one
    that is back within reach of it */
function despike(F, dt) {
  const lim = ((18 * Math.PI) / 180) * (dt * 120);
  for (const b of Object.keys(F[0].L)) {
    for (let i = 1; i < F.length; i++) {
      if (qang(F[i - 1].L[b], F[i].L[b]) <= lim) continue;
      const g = i - 1;
      let j = i + 1;
      while (j < F.length && qang(F[g].L[b], F[j].L[b]) > lim * (j - g) * 0.5) j++;
      if (j >= F.length || j - g > 30) continue;
      for (let k = i; k < j; k++) F[k].L[b] = qslerp(F[g].L[b], F[j].L[b], (k - g) / (j - g));
      i = j;
    }
  }
}
/** a one-shot (a stop, a jump, a landing, a reaction, an emote, a vault) from a window of a take.
    root: "end" keeps the hips' travel relative to where the window ends (the body carries its
    momentum into a planted stop), "none" keeps only the sway around a slow average (the game moves
    the body). air: take the ballistic arc out of the hips (jumps). The feet: when each is planted
    ([on, off, ...] in seconds). */
function shotClip(R, spec) {
  const fr = R.frames,
    dt = R.dt;
  const a = Math.max(0, Math.round(spec.t[0] / dt)),
    b = Math.min(fr.length - 1, Math.round(spec.t[1] / dt));
  const ref = spec.root === "end" ? b : a;
  let sx = 0,
    sz = 0;
  for (let f = a; f <= b; f++) {
    const y = heading(fr[f].W);
    sx += Math.sin(y);
    sz += Math.cos(y);
  }
  const yaw = spec.root === "end" ? heading(fr[b].W) : Math.atan2(sx, sz);
  const H = qaxis([0, 1, 0], -yaw);
  const base = qrot(H, fr[ref].hips);
  const F = [];
  for (let f = a; f <= b; f++) {
    const L = locals(fr[f].W, 0);
    L.pelvis = qmul(H, fr[f].W.pelvis);
    const h = qrot(H, fr[f].hips);
    F.push({ L, pel: [h[0] - base[0], h[1], h[2] - base[2]], src: fr[f].feet.map(p => qrot(H, p)) });
  }
  const n = F.length;
  despike(F, dt);
  if (spec.root === "none") {
    /* the body's own travel (a slow average) comes out; its sway around it stays */
    const w = Math.round(0.35 / dt);
    const avg = F.map((_, i) => {
      let x = 0,
        z = 0,
        m = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++, m++) {
        x += F[j].pel[0];
        z += F[j].pel[2];
      }
      return [x / m, z / m];
    });
    F.forEach((f, i) => {
      f.pel[0] -= avg[i][0];
      f.pel[2] -= avg[i][1];
    });
  }
  if (spec.mirror) {
    const mq = q => [q[0], -q[1], -q[2], q[3]];
    for (const f of F) {
      const L = {};
      for (const k in f.L) L[k.replace(/L$/, "#").replace(/R$/, "L").replace("#", "R")] = mq(f.L[k]);
      f.L = L;
      f.pel[0] = -f.pel[0];
      f.src = [2, 3, 0, 1].map(i => [-f.src[i][0], f.src[i][1], f.src[i][2]]);
    }
  }
  /* planted feet: low and still in the capture */
  const ground = Math.min(...F.map(f => Math.min(...f.src.map(p => p[1]))));
  const down = [0, 1].map(s =>
    F.map((f, i) => {
      const j0 = Math.max(0, i - 2),
        j1 = Math.min(n - 1, i + 2);
      const sp = k =>
        Math.hypot(F[j1].src[k][0] - F[j0].src[k][0], F[j1].src[k][2] - F[j0].src[k][2]) /
        ((j1 - j0) * dt || 1);
      const h = Math.min(f.src[s * 2][1] - ground - 0.05, f.src[s * 2 + 1][1] - ground);
      return h < 0.09 && Math.min(sp(s * 2), sp(s * 2 + 1)) < 0.6 ? 1 : 0;
    })
  );
  let up = 0,
    land = 0;
  if (spec.air) {
    /* the longest run with both feet up, and the ballistic arc of the hips through it */
    const air = F.map(
      (f, i) => !down[0][i] && !down[1][i] && Math.min(...f.src.map(p => p[1])) - ground > 0.04
    );
    let bs = 0,
      bl = 0;
    for (let i = 0; i < n; i++) {
      if (!air[i]) continue;
      let j = i;
      while (j < n && air[j]) j++;
      if (j - i > bl) {
        bl = j - i;
        bs = i;
      }
      i = j;
    }
    const D = bl * dt;
    for (let i = bs; i <= bs + bl && i < n; i++) {
      const t = (i - bs) * dt;
      F[i].pel[1] -= 0.5 * 9.81 * t * (D - t);
    }
    up = bs * dt;
    land = (bs + bl) * dt;
  }
  /* standing height: the feet on the ground at the reference frame (a drop: after its landing) */
  const hf = spec.landRef
    ? Math.min(n - 1, Math.round(land / dt) + Math.round(0.6 / dt))
    : spec.root === "end"
      ? n - 1
      : 0;
  const fl = legFK(F[hf].L, F[hf].pel, "L"),
    fr2 = legFK(F[hf].L, F[hf].pel, "R");
  const dy = Math.min(
    fl.anP[1] - RIG.ankleRest,
    fl.toP[1] - 0.01,
    fr2.anP[1] - RIG.ankleRest,
    fr2.toP[1] - 0.01
  );
  for (const f of F) f.pel = [f.pel[0], f.pel[1] - dy - RIG.pelvisY, f.pel[2]];
  const T = (n - 1) * dt;
  const red = reduce(
    F,
    false,
    6,
    Math.max(6, Math.round(T * (spec.fps || 30))),
    ((spec.tol || 2) * Math.PI) / 180,
    0.01
  );
  const spans = down.map(c => {
    const out = [];
    for (let i = 0; i < n; i++)
      if (c[i] && (i === 0 || !c[i - 1])) {
        let j = i;
        while (j < n && c[j]) j++;
        out.push(Math.round(i * dt * 1000) / 1000, Math.round(Math.min(j, n - 1) * dt * 1000) / 1000);
      }
    return out;
  });
  return {
    n: spec.n,
    take: spec.take,
    win: [a + 1, b + 1],
    T,
    keys: red.K,
    err: [red.ea, red.ep],
    shot: true,
    up,
    down: land,
    c: spans,
  };
}

/** turning on the spot: how long one step takes and how high the foot lifts */
function turnStats(R) {
  const fr = R.frames,
    dt = R.dt;
  const ground = Math.min(...fr.map(f => Math.min(...f.feet.map(p => p[1]))));
  const durs = [],
    lifts = [];
  for (const s of [0, 2]) {
    let i = 0;
    while (i < fr.length) {
      while (i < fr.length && fr[i].feet[s][1] - ground < 0.08 + 0.02) i++;
      const st = i;
      let top = 0;
      while (i < fr.length && fr[i].feet[s][1] - ground >= 0.08 + 0.02)
        top = Math.max(top, fr[i++].feet[s][1] - ground);
      if (i - st > 3 && i < fr.length) {
        durs.push((i - st) * dt);
        lifts.push(top);
      }
    }
  }
  const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
  /* the foot is up for the measured time, plus the lift and set-down below the threshold */
  return { step: med(durs) + 0.12, lift: med(lifts) - 0.06, n: durs.length };
}

/* every channel of every clip (x, y, z per bone, then the pelvis offset) predicted from its two previous
   keys (2 p1 - p2; the first key from 0, the second from the first); the remainder is zigzagged and
   written 5 bits per base64 character, low first, with 32 added while more follow (characters/anim.js) */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function packInts(clipInts) {
  let out = "";
  for (const keys of clipInts) {
    const p1 = [],
      p2 = [];
    keys.forEach((vals, ki) =>
      vals.forEach((v, j) => {
        const d = v - (ki > 1 ? 2 * p1[j] - p2[j] : ki ? p1[j] : 0);
        p2[j] = p1[j];
        p1[j] = v;
        let z = d < 0 ? -2 * d - 1 : 2 * d;
        do {
          const c = z % 32;
          z = Math.floor(z / 32);
          out += B64[c + (z ? 32 : 0)];
        } while (z);
      })
    );
  }
  return out;
}
function encode(clips) {
  const names = BONES.map(b => b[0]);
  return packInts(
    clips.map(c =>
      c.keys.map(k => {
        const vals = [];
        for (const b of names) {
          let q = k.L[b];
          if (q[3] < 0) q = q.map(v => -v);
          vals.push(Math.round(q[0] * Q), Math.round(q[1] * Q), Math.round(q[2] * Q));
        }
        for (const v of k.pel) vals.push(Math.round(v * PQ));
        return vals;
      })
    )
  );
}

async function main() {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error("usage: node tools/mocap/convert.js <dir with the BVH takes> [more dirs]");
    process.exit(1);
  }
  const cache = {};
  const find = take =>
    dirs.find(
      d => fs.existsSync(path.join(d, take, take + ".bvh")) || fs.existsSync(path.join(d, take + ".bvh"))
    ) || dirs[0];
  const get = take => cache[take] || (cache[take] = retarget(load(find(take), take)));
  const clips = [];
  for (const spec of CLIPS) {
    const c = loopClip(get(spec.take), spec);
    clips.push(c);
    console.log(
      `${c.n.padEnd(10)} ${c.take} frames ${c.win[0]}-${c.win[1]}  cycle ${c.T.toFixed(2)} s  keys ${c.keys.length}` +
        `  speed ${Math.hypot(...c.vel).toFixed(2)} (feet ${Math.hypot(...c.footVel).toFixed(2)}) m/s  dir ${(
          (Math.atan2(c.footVel[0], -c.footVel[1]) * 180) /
          Math.PI
        ).toFixed(
          0
        )}  stance L ${c.contact[0].map(v => v.toFixed(2))} R ${c.contact[1].map(v => v.toFixed(2))}` +
        `  err ${((c.err[0] * 180) / Math.PI).toFixed(2)} deg ${(c.err[1] * 1000).toFixed(1)} mm`
    );
  }
  const jump = jumpClip(get(JUMP.take));
  console.log(
    `jump       ${jump.take} frames ${jump.win[0]}-${jump.win[1]}  ${jump.T.toFixed(2)} s  keys ${jump.keys.length}  takeoff ${jump.up.toFixed(2)} landing ${jump.down.toFixed(2)}`
  );
  const turn = turnStats(get(TURN.take));
  console.log(
    `turn       ${TURN.take} step ${turn.step.toFixed(2)} s, lift ${turn.lift.toFixed(2)} m (${turn.n} steps)`
  );
  const shots = SHOTS.map(spec => {
    const c = shotClip(get(spec.take), spec);
    console.log(
      `${c.n.padEnd(10)} ${c.take} frames ${c.win[0]}-${c.win[1]}  ${c.T.toFixed(2)} s  keys ${c.keys.length}` +
        (spec.air ? `  takeoff ${c.up.toFixed(2)} landing ${c.down.toFixed(2)}` : "") +
        `  feet L ${c.c[0].join(",")} R ${c.c[1].join(",")}  err ${((c.err[0] * 180) / Math.PI).toFixed(2)} deg`
    );
    return c;
  });
  const all = [...clips, jump, ...shots];
  const r3 = v => Math.round(v * 1000) / 1000;
  const meta = all.map(c =>
    c.shot
      ? Object.assign(
          { n: c.n, k: c.keys.length, T: r3(c.T), shot: 1, c: c.c },
          c.down ? { up: r3(c.up), down: r3(c.down) } : {}
        )
      : c.n === "jump"
        ? { n: c.n, k: c.keys.length, T: r3(c.T), up: r3(c.up), down: r3(c.down) }
        : {
            n: c.n,
            k: c.keys.length,
            T: r3(c.T),
            v: c.footVel.map(r3),
            c: c.contact.map(s => s.map(r3)),
          }
  );
  const src = `/* Generated by tools/mocap/convert.js: do not edit. Motion capture from the CMU Graphics Lab Motion
   Capture Database (mocap.cs.cmu.edu; the database was created with funding from NSF EIA-0196217),
   BVH conversion by B. Hahne (cgspeed). Takes: ${[...new Set(all.map(c => c.take))].join(", ")}.
   Every clip: keys of ${BONES.length} bone rotations (x, y, z in 1/q; w >= 0) and the pelvis offset
   from rest (1/pq m), evenly spaced over a loop (k keys over T s) or a one-shot; v: travel velocity
   of the planted feet (x right, z back, m/s); c: when each foot is down ([on, off] phase; seconds in
   a one-shot, shot: 1); jump, jumpRun, landHard: when it leaves the ground and lands (s). turn: one
   step of turning on the spot (s, lift m). */
const ANIM_CLIPS = {
  bones: ${JSON.stringify(BONES.map(b => b[0]))},
  parents: ${JSON.stringify(BONES.map(b => (b[1] ? BONES.findIndex(x => x[0] === b[1]) : -1)))},
  clips: ${JSON.stringify(meta)},
  turn: ${JSON.stringify({ step: r3(turn.step), lift: r3(turn.lift) })},
  q: ${Q},
  pq: ${PQ},
  /* each channel predicted from its last two keys, the rest packed in base64 (packInts) */
  data: "${encode(all)}",
};
`;
  /* in the repository's own format, so the generated file passes the format check */
  const prettier = require("prettier");
  const out = await prettier.format(
    src,
    Object.assign((await prettier.resolveConfig(OUT)) || {}, { filepath: OUT })
  );
  fs.writeFileSync(OUT, out);
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(src.length / 1024).toFixed(1)} KB)`);
}
if (require.main === module) main();
module.exports = { BONES, RIG, CLIPS, SHOTS, JUMP, TURN, packInts, retarget, load, heading, locals, legFK };
