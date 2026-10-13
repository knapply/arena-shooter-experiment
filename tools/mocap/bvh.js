/* A small BVH reader and the quaternion helpers the mocap converter uses. The file is treated as
   data only: the hierarchy is parsed into joints (name, parent, offset, channel order) and the
   motion into one Float32Array per frame. Quaternions are [x, y, z, w] arrays. */
const fs = require("fs");

/** @returns {{ joints: { name: string, parent: number, off: number[], ch: string[], at: number }[], frames: Float32Array[], dt: number }} */
function readBVH(file) {
  const tok = fs.readFileSync(file, "utf8").split(/\s+/).filter(Boolean);
  let i = 0;
  const next = () => tok[i++];
  const joints = [];
  let nch = 0;
  if (next() !== "HIERARCHY") throw new Error(file + ": not a BVH file");
  const stack = [];
  while (i < tok.length) {
    const t = next();
    if (t === "ROOT" || t === "JOINT") {
      const name = next();
      joints.push({
        name,
        parent: stack.length ? stack[stack.length - 1] : -1,
        off: [0, 0, 0],
        ch: [],
        at: 0,
      });
      stack.push(joints.length - 1);
    } else if (t === "End") {
      next(); // "Site"
      stack.push(-1);
    } else if (t === "OFFSET") {
      const o = [+next(), +next(), +next()];
      const j = stack[stack.length - 1];
      if (j >= 0) joints[j].off = o;
    } else if (t === "CHANNELS") {
      const n = +next();
      const j = joints[stack[stack.length - 1]];
      j.at = nch;
      for (let k = 0; k < n; k++) j.ch.push(next());
      nch += n;
    } else if (t === "}") stack.pop();
    else if (t === "MOTION") break;
  }
  if (next() !== "Frames:") throw new Error(file + ": no frame count");
  const nf = +next();
  next();
  next(); // "Frame Time:"
  const dt = +next();
  const frames = [];
  for (let f = 0; f < nf; f++) {
    const a = new Float32Array(nch);
    for (let c = 0; c < nch; c++) a[c] = +next();
    frames.push(a);
  }
  return { joints, frames, dt };
}

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = a => [-a[0], -a[1], -a[2], a[3]];
const qaxis = (ax, ang) => {
  const s = Math.sin(ang / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
};
function qrot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1],
    iy = w * v[1] + z * v[0] - x * v[2],
    iz = w * v[2] + x * v[1] - y * v[0],
    iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}
const qnorm = q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map(v => v / l);
};
const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
/** the angle between two rotations, radians */
const qang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(qdot(a, b))));
function qslerp(a, b, t) {
  let d = qdot(a, b);
  const bb = d < 0 ? b.map(v => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d),
    s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s,
    kb = Math.sin(t * th) / s;
  return a.map((v, i) => v * ka + bb[i] * kb);
}
/** shortest rotation taking unit vector a to unit vector b */
function qfromTo(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const c = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]];
    const l = Math.hypot(...c);
    return [c[0] / l, c[1] / l, c[2] / l, 0];
  }
  return qnorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d]);
}
const AX = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
/** world rotation and position of every joint at one frame */
function pose(bvh, f) {
  const a = bvh.frames[f];
  const n = bvh.joints.length;
  const R = new Array(n),
    P = new Array(n);
  for (let j = 0; j < n; j++) {
    const J = bvh.joints[j];
    let q = [0, 0, 0, 1],
      t = J.off.slice();
    J.ch.forEach((c, k) => {
      const v = a[J.at + k];
      if (c.endsWith("rotation")) q = qmul(q, qaxis(AX[c[0]], (v * Math.PI) / 180));
      else t[c.charCodeAt(0) - 88] = v;
    });
    if (J.parent < 0) {
      R[j] = q;
      P[j] = t;
    } else {
      R[j] = qmul(R[J.parent], q);
      const o = qrot(R[J.parent], t),
        pp = P[J.parent];
      P[j] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
    }
  }
  return { R, P };
}
module.exports = { readBVH, pose, qmul, qinv, qrot, qnorm, qdot, qang, qslerp, qaxis, qfromTo };
