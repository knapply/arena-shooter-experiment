/* ============ motion-captured locomotion ============
   Drives the pilot rig's pelvis, spine and legs (and the free arm's swing) from the motion capture
   clips in data/anim-clips.js. Pure math, no three.js: characters/rig.js applies the result to the
   bones and keeps its procedural layers (aim, ADS, reload, melee, recoil, flinch, deaths) on top.
   - A blend space over speed and move direction (relative to facing): idle; walk, side steps and a
     backpedal; jog; run; sprint; crouched walks. All loops share one phase (0 = the left foot's
     strike), advanced by distance, so the cycles stay in step while they blend.
   - Stride warping: a clip plays at the game's speed by lengthening its stride and quickening its
     cadence (split between the two), and its feet are turned to the real travel direction after
     the hips have turned part of the way (orientation warping).
   - A small state machine (idle/move, crouch, air, land) with cross-fades between the states; the
     jump clip is played by vertical speed in the air, its landing absorbs the impact.
   - Feet lock to the ground while planted (no skating at any speed or blend), step when the body
     turns on the spot, follow the ground (stairs, ledges) and pull the hips down when out of reach.
   update(L, I) poses one pilot: the result is in L (targets in the pelvis' frame for the leg IK). */
const ANIM = (() => {
  const C = ANIM_CLIPS;
  const NB = C.bones.length,
    ST = NB * 4 + 3; // floats per key: rotations, then the pelvis offset
  const bi = n => C.bones.indexOf(n);
  const PEL = bi("pelvis"),
    SPN = bi("spine"),
    SP2 = bi("spine2"),
    CHS = bi("chest");
  const LEG = [
    [bi("hipL"), bi("knL"), bi("anL")],
    [bi("hipR"), bi("knR"), bi("anR")],
  ];
  const ARM = [
    [bi("shL"), bi("elL")],
    [bi("shR"), bi("elR")],
  ];
  /* the rig's proportions (BONES in characters/rig.js) */
  const PELVIS_Y = 0.96,
    THIGH = 0.44,
    SHIN = 0.43,
    REACH = THIGH + SHIN - 0.006;
  /* ---- decode: 16-bit x, y, z per rotation (w >= 0 rebuilt), neighbouring keys on one hemisphere ---- */
  const bin = atob(C.data);
  const raw = new Int16Array(bin.length >> 1);
  for (let i = 0; i < raw.length; i++) raw[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  let at = 0;
  /** @type {Record<string, { n: string, k: number, T: number, v: number[], c: number[][], up: number, down: number, d: Float32Array, speed: number, w: number[] | null }>} */
  const CL = {};
  for (const m of C.clips) {
    const d = new Float32Array(m.k * ST);
    for (let k = 0; k < m.k; k++) {
      const o = k * ST;
      for (let b = 0; b < NB; b++) {
        const x = raw[at++] / 32767,
          y = raw[at++] / 32767,
          z = raw[at++] / 32767;
        let w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
        let s = 1;
        if (k > 0) {
          const p = o - ST + b * 4;
          if (d[p] * x + d[p + 1] * y + d[p + 2] * z + d[p + 3] * w < 0) s = -1;
        }
        d.set([x * s, y * s, z * s, w * s], o + b * 4);
      }
      for (let j = 0; j < 3; j++) d[o + NB * 4 + j] = raw[at++] / 4000;
    }
    CL[m.n] = Object.assign({ v: [0, 0], c: [], up: 0, down: 0, w: null }, m, {
      d,
      speed: m.v ? Math.hypot(m.v[0], m.v[1]) : 0,
    });
  }
  const TURN = C.turn;
  /* ---- quaternion helpers on flat arrays ([x, y, z, w] at an offset) ---- */
  function qmul(a, ao, b, bo, o, oo) {
    const ax = a[ao],
      ay = a[ao + 1],
      az = a[ao + 2],
      aw = a[ao + 3],
      bx = b[bo],
      by = b[bo + 1],
      bz = b[bo + 2],
      bw = b[bo + 3];
    o[oo] = aw * bx + ax * bw + ay * bz - az * by;
    o[oo + 1] = aw * by - ax * bz + ay * bw + az * bx;
    o[oo + 2] = aw * bz + ax * by - ay * bx + az * bw;
    o[oo + 3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  }
  /** conjugate (the inverse of a unit quaternion) into o */
  function qinv(a, ao, o, oo) {
    o[oo] = -a[ao];
    o[oo + 1] = -a[ao + 1];
    o[oo + 2] = -a[ao + 2];
    o[oo + 3] = a[ao + 3];
    return o;
  }
  /** rotate vector v (3 at vo) by q, into o */
  function qrot(q, qo, v, vo, o, oo) {
    const x = q[qo],
      y = q[qo + 1],
      z = q[qo + 2],
      w = q[qo + 3];
    const vx = v[vo],
      vy = v[vo + 1],
      vz = v[vo + 2];
    const ix = w * vx + y * vz - z * vy,
      iy = w * vy + z * vx - x * vz,
      iz = w * vz + x * vy - y * vx,
      iw = -x * vx - y * vy - z * vz;
    o[oo] = ix * w - iw * x - iy * z + iz * y;
    o[oo + 1] = iy * w - iw * y - iz * x + ix * z;
    o[oo + 2] = iz * w - iw * z - ix * y + iy * x;
    return o;
  }
  function qnorm(q, o) {
    const l = Math.sqrt(q[o] * q[o] + q[o + 1] * q[o + 1] + q[o + 2] * q[o + 2] + q[o + 3] * q[o + 3]) || 1;
    q[o] /= l;
    q[o + 1] /= l;
    q[o + 2] /= l;
    q[o + 3] /= l;
  }
  /** nlerp a toward b by t (into a) */
  function qlerp(a, ao, b, bo, t) {
    const s =
      a[ao] * b[bo] + a[ao + 1] * b[bo + 1] + a[ao + 2] * b[bo + 2] + a[ao + 3] * b[bo + 3] < 0 ? -1 : 1;
    for (let j = 0; j < 4; j++) a[ao + j] += (s * b[bo + j] - a[ao + j]) * t;
    qnorm(a, ao);
  }
  const IDQ = [0, 0, 0, 1];
  /** rotation about Y by angle a into o */
  function qyaw(a, o, oo) {
    o[oo] = 0;
    o[oo + 1] = Math.sin(a / 2);
    o[oo + 2] = 0;
    o[oo + 3] = Math.cos(a / 2);
    return o;
  }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  /* ---- sampling: Catmull-Rom through the keys, accumulated with a weight into a pose ---- */
  const cr = (p0, p1, p2, p3, u, u2, u3) =>
    0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (3 * p1 - p0 - 3 * p2 + p3) * u3);
  const _s = new Float32Array(4);
  /** add clip c at x (a phase 0..1 for loops, seconds for one-shots) with weight w into acc */
  /* (helpers outside the hot loop, so posing allocates nothing) */
  const keyOf = (j, n, loop) => (loop ? ((j % n) + n) % n : clamp(j, 0, n - 1)) * ST;
  const side = (d, a, b) =>
    d[a] * d[b] + d[a + 1] * d[b + 1] + d[a + 2] * d[b + 2] + d[a + 3] * d[b + 3] < 0 ? -1 : 1;
  /* (no Math.hypot in here: it allocates its arguments) */
  function sample(c, x, w, acc, loop) {
    const n = c.k,
      d = c.d;
    let f;
    if (loop) f = (((x % 1) + 1) % 1) * n;
    else f = clamp((x / c.T) * (n - 1), 0, n - 1);
    const i = Math.floor(f),
      u = f - i,
      u2 = u * u,
      u3 = u2 * u;
    const k0 = keyOf(i - 1, n, loop),
      k1 = keyOf(i, n, loop),
      k2 = keyOf(i + 1, n, loop),
      k3 = keyOf(i + 2, n, loop);
    for (let b = 0; b < NB; b++) {
      const o = b * 4;
      /* the loop's seam may cross hemispheres: align the neighbours to the middle key */
      const q1 = k1 + o;
      const s0 = side(d, k0 + o, q1),
        s2 = side(d, k2 + o, q1),
        s3 = side(d, k3 + o, q1);
      for (let j = 0; j < 4; j++)
        _s[j] = cr(d[k0 + o + j] * s0, d[q1 + j], d[k2 + o + j] * s2, d[k3 + o + j] * s3, u, u2, u3);
      const l = Math.sqrt(_s[0] * _s[0] + _s[1] * _s[1] + _s[2] * _s[2] + _s[3] * _s[3]) || 1;
      const sw =
        acc[o] * _s[0] + acc[o + 1] * _s[1] + acc[o + 2] * _s[2] + acc[o + 3] * _s[3] < 0 ? -w / l : w / l;
      for (let j = 0; j < 4; j++) acc[o + j] += _s[j] * sw;
    }
    for (let j = 0; j < 3; j++) {
      const p = NB * 4 + j;
      acc[p] += w * cr(d[k0 + p], d[k1 + p], d[k2 + p], d[k3 + p], u, u2, u3);
    }
  }
  function finish(acc) {
    for (let b = 0; b < NB; b++) qnorm(acc, b * 4);
  }
  /** a stance weight (1 while down) of foot f in clip c at phase p, softened at the edges */
  function stance(c, f, p) {
    const S = c.c[f];
    let best = 0;
    for (let i = 0; i < S.length; i += 2) {
      const on = S[i],
        off = S[i + 1];
      const len = (off - on + 1) % 1 || (off === on ? 0 : 1);
      if (len >= 0.999) return 1;
      const t = (((p - on) % 1) + 1) % 1;
      const e = 0.03;
      if (t < len) best = Math.max(best, Math.min(1, (t + e) / (2 * e), (len - t + e) / (2 * e)));
    }
    return best;
  }
  /** the clip phase for an even phase u, with each stance shortened to d of its length (runs only:
      a walk keeps a foot on the ground) */
  function warp(c, u, d) {
    const W = c.w;
    if (!W || d >= 0.999) return u;
    const offL = W[0],
      onR = W[1],
      offR = W[2];
    const ex = (offL + offR - onR) * (1 - d) * 0.5;
    const a1 = offL * d,
      a2 = a1 + onR - offL + ex,
      a3 = a2 + (offR - onR) * d;
    if (u < a1) return (u / a1) * offL;
    if (u < a2) return offL + ((u - a1) / (a2 - a1)) * (onR - offL);
    if (u < a3) return onR + ((u - a2) / (a3 - a2)) * (offR - onR);
    return offR + ((u - a3) / (1 - a3)) * (1 - offR);
  }
  for (const n in CL) {
    const c = CL[n].c;
    /* a run: the left stance starts the cycle and the right one sits inside it, each under half */
    if (
      c.length === 2 &&
      c[0].length === 2 &&
      c[1].length === 2 &&
      c[0][0] === 0 &&
      c[0][1] < c[1][0] &&
      c[1][0] < c[1][1] &&
      c[0][1] < 0.45
    )
      CL[n].w = [c[0][1], c[1][0], c[1][1]];
  }
  /* ---- the blend space. Tiers by game speed (m/s, TUNE's at run time); each tier is a set of
     clips by travel direction (degrees, + right). A two-clip set (forward and back) switches
     families between 105 and 130 degrees; orientation warping covers the rest. ---- */
  const T_STAND = [
    {
      v: 1.3,
      set: [
        [0, "walk"],
        [90, "right"],
        [180, "back"],
        [-90, "left"],
      ],
    },
    {
      v: 3.2,
      set: [
        [0, "jog"],
        [180, "jog", 1],
      ],
    },
    {
      v: "run",
      set: [
        [0, "run"],
        [180, "jog", 1],
      ],
    },
  ];
  const T_CROUCH = [
    {
      v: 0.9,
      set: [
        [0, "crouch"],
        [180, "crouchBack"],
      ],
    },
    {
      v: "crouchSpeed",
      set: [
        [0, "jog"],
        [180, "jog", 1],
      ],
    },
  ];
  const T_SPRINT = { v: "sprint", set: [[0, "sprint"]] };
  const speedOf = t => (typeof t.v === "string" ? TUNE[t.v] : t.v);
  /** the active clips for speed s, direction a (radians) and sprint weight, into B (clips, weights,
      reversed; B.n of them) */
  function put(B, n, w, rev) {
    B.c[B.n] = CL[n];
    B.w[B.n] = w;
    B.r[B.n++] = rev | 0;
  }
  function addTier(B, tier, w, a) {
    if (w < 0.01) return;
    const set = tier.set;
    if (set.length === 1) return put(B, set[0][1], w, 0);
    if (set.length === 2) {
      const back = smooth(1.83, 2.27, Math.abs(a));
      if (1 - back > 0.01) put(B, set[0][1], w * (1 - back), set[0][2]);
      if (back > 0.01) put(B, set[1][1], w * back, set[1][2]);
      return;
    }
    for (let i = 0; i < set.length; i++) {
      const ww = Math.max(0, 1 - Math.abs(wrap(a - (set[i][0] * Math.PI) / 180)) / (Math.PI / 2));
      if (ww > 0.01) put(B, set[i][1], w * ww, set[i][2]);
    }
  }
  function weights(tiers, s, a, sprint, B) {
    B.n = 0;
    if (sprint > 0.01) addTier(B, T_SPRINT, sprint, a);
    const rest = 1 - sprint;
    let ti = 0;
    while (ti < tiers.length - 1 && s > speedOf(tiers[ti])) ti++;
    const v0 = speedOf(tiers[0]);
    /* below the first tier it blends from the idle (which the caller adds) */
    if (s <= v0) addTier(B, tiers[0], rest * smooth(0.05, v0 * 0.7, s), a);
    else {
      const lo = speedOf(tiers[ti - 1]),
        hi = speedOf(tiers[ti]);
      const k = clamp((s - lo) / (hi - lo), 0, 1);
      addTier(B, tiers[ti - 1], rest * (1 - k), a);
      addTier(B, tiers[ti], rest * k, a);
    }
    return B;
  }

  /* ---- per-pilot state ---- */
  function foot() {
    return { lock: false, lw: 0, lx: 0, lz: 0, ly: 0, lyaw: 0, step: -1, sx: 0, sz: 0, syaw: 0, c: 0 };
  }
  function make() {
    return {
      ph: 0,
      idleT: Math.random() * 3,
      mode: 0, // 0 ground, 1 air
      crouch: false,
      pose: new Float32Array(ST),
      from: new Float32Array(ST),
      land: new Float32Array(ST),
      fade: 0,
      fadeD: 0.15,
      airT: 0,
      v0: 0,
      landT: 9,
      landW: 0,
      hipYaw: 0,
      sprintW: 0,
      drop: 0,
      ready: 1,
      tuck: 0,
      feet: [foot(), foot()],
      /** the clips in play: B.n of them */
      B: { n: 0, c: new Array(8), w: new Float32Array(8), r: new Uint8Array(8) },
      moving: 0,
      vyLast: 0,
      duty: 1,
      /* results: pelvis (root frame), spine locals, leg targets (pelvis frame), hands (chest frame) */
      pelP: new Float32Array(3),
      pelQ: new Float32Array(4),
      spine: new Float32Array(12),
      tgt: new Float32Array(6),
      ank: new Float32Array(6),
      pole: new Float32Array(6),
      ankQ: new Float32Array(8),
      toe: new Float32Array(2),
      hand: new Float32Array(6),
      contact: new Float32Array(2),
      step: false,
      phase: 0,
    };
  }
  /** start over (respawn): no fade from the death pose, feet unlocked */
  function reset(L) {
    L.fade = 0;
    L.mode = 0;
    L.drop = 0;
    L.ready = 1;
    L.tuck = 0;
    for (const f of L.feet) Object.assign(f, foot());
  }
  const _q = new Float32Array(16),
    _v = new Float32Array(12),
    _hip = new Float32Array(6),
    _ank = new Float32Array(6),
    _kn = new Float32Array(6),
    _aq = new Float32Array(8);
  const REST_HIP = [-0.11, -0.05, 0, 0.11, -0.05, 0];
  const DOWN_T = [0, -THIGH, 0],
    DOWN_S = [0, -SHIN, 0],
    DOWN_UA = [0, -0.3, 0],
    DOWN_FA = [0, -0.29, 0],
    FOOT_F = [0, -0.51, -0.86];

  /**
   * Pose one pilot. I: { dt, lr, lf, spd (m/s, right and forward), crouch, sprint, air, vy, gd (ground
   * below while falling), x, z, yaw (world), gL, gR (ground under each foot, relative), near }
   */
  function update(L, I) {
    const dt = I.dt,
      P = L.pose;
    L.step = false;
    /* ---- states and their cross-fades ---- */
    const mode = I.air ? 1 : 0;
    if (mode !== L.mode || I.crouch !== L.crouch) {
      L.from.set(P);
      L.fade = L.fadeD = mode !== L.mode ? 0.12 : 0.2;
      if (mode === 1 && L.mode === 0) {
        L.airT = 0;
        L.v0 = Math.max(I.vy, 0);
      }
      if (mode === 0 && L.mode === 1) {
        /* touchdown: the landing plays out, harder for a harder fall */
        L.landT = 0;
        L.landW = clamp(-L.vyLast * 0.11, 0.2, 1);
        L.fade = L.fadeD = 0.06;
      }
      L.mode = mode;
      L.crouch = I.crouch;
    }
    L.vyLast = I.vy;
    const a = I.spd > 0.05 ? Math.atan2(I.lr, I.lf) : 0;
    L.sprintW += ((I.sprint && !I.crouch ? 1 : 0) - L.sprintW) * Math.min(1, dt * 8);
    P.fill(0);
    let rate = 0,
      kStride = 1,
      natX = 0,
      natZ = 0;
    if (mode === 1) {
      /* in the air: the jump by vertical speed, from the push-off to the reach for the ground */
      L.airT += dt;
      const J = CL.jump;
      const v0 = Math.max(L.v0, 4);
      let u = L.v0 > 1 ? clamp((L.v0 - I.vy) / (2 * v0), 0, 0.92) : clamp(0.5 + L.airT * 0.8, 0.5, 0.85);
      if (I.vy < -3 && I.gd < 1.6) u = Math.max(u, 0.92);
      sample(J, J.up + u * (J.down - J.up), 1, P, false);
      finish(P);
      L.contact[0] = L.contact[1] = 0;
      L.moving = 0;
    } else {
      /* on the ground: the idle and the blend space, all loops on one phase */
      const B = weights(I.crouch ? T_CROUCH : T_STAND, I.spd, a, L.sprintW, L.B);
      let wm = 0,
        Tb = 0,
        sp = 0,
        wr = 0;
      for (let i = 0; i < B.n; i++) {
        const c = B.c[i],
          w = B.w[i],
          rev = B.r[i];
        wm += w;
        if (c.w) wr += w;
        Tb += w * c.T;
        sp += w * c.speed;
        /* the clip's travel in the root frame (x right, z back), reversed clips the other way */
        const vx = rev ? -c.v[0] : c.v[0],
          vz = rev ? -c.v[1] : c.v[1];
        natX += w * vx;
        natZ += w * vz;
      }
      L.moving = wm;
      if (wm > 0.01) {
        Tb /= wm;
        sp /= wm;
        /* play at the game's speed: the stride lengthens and the cadence quickens, split between them */
        /* play at the game's speed. Faster than the capture: a slightly longer stride, a quicker
           cadence and a shorter stance (more of the cycle in the air, as runners do); slower: a
           shorter stride and a slower cadence */
        const r = I.spd / Math.max(0.2, sp);
        kStride = clamp(Math.pow(r, 0.3), 0.6, 1.15);
        /* a crouched run (the jog on bent knees) takes short, quick steps */
        if (I.crouch) {
          let run = 0;
          for (let i = 0; i < B.n; i++) if (!B.c[i].n.startsWith("crouch")) run += B.w[i];
          kStride *= 1 - (0.3 * run) / wm;
        }
        const rest = r / kStride;
        /* (only runs shorten their stance: in a walk a foot stays down, so it just steps quicker) */
        L.duty = rest > 1 ? 1 - (1 - clamp(Math.pow(rest, -0.5), 0.6, 1)) * (wr / wm) : 1;
        rate = (rest * L.duty) / Tb;
        L.ph = (L.ph + dt * rate) % 1;
      }
      const iw = 1 - wm;
      L.idleT += dt;
      if (iw > 0.01) sample(CL.idle, L.idleT / CL.idle.T, iw, P, true);
      let c0 = iw,
        c1 = iw;
      for (let i = 0; i < B.n; i++) {
        const c = B.c[i],
          w = B.w[i],
          p = warp(c, B.r[i] ? 1 - L.ph : L.ph, L.duty);
        sample(c, p, w, P, true);
        c0 += w * stance(c, 0, p);
        c1 += w * stance(c, 1, p);
      }
      finish(P);
      /* footsteps: a foot comes down while moving */
      if (wm > 0.4 && ((c0 > 0.5 && L.contact[0] <= 0.5) || (c1 > 0.5 && L.contact[1] <= 0.5))) L.step = true;
      L.contact[0] = c0;
      L.contact[1] = c1;
      /* a landing: the capture's knees take the impact, fading back into the gait */
      if (L.landT < 0.5) {
        L.landT += dt;
        const J = CL.jump;
        const w = L.landW * (1 - smooth(0.12, 0.5, L.landT)) * (1 - 0.6 * wm);
        if (w > 0.01) {
          L.land.fill(0);
          sample(J, J.down + L.landT, 1, L.land, false);
          finish(L.land);
          for (let b = 0; b < NB; b++) qlerp(P, b * 4, L.land, b * 4, w);
          for (let j = NB * 4; j < ST; j++) P[j] += (L.land[j] - P[j]) * w;
        }
      }
    }
    if (L.fade > 0) {
      L.fade = Math.max(0, L.fade - dt);
      const w = L.fade / L.fadeD;
      const ww = w * w * (3 - 2 * w);
      for (let b = 0; b < NB; b++) qlerp(P, b * 4, L.from, b * 4, ww);
      for (let j = NB * 4; j < ST; j++) P[j] += (L.from[j] - P[j]) * ww;
    }
    /* crouching on clips made standing (idle, the crouched run): the hips sink and the knees bend */
    let sink = 0;
    if (I.crouch && mode === 0) {
      let own = 0;
      for (let i = 0; i < L.B.n; i++) if (L.B.c[i].n.startsWith("crouch")) own += L.B.w[i];
      sink = -0.17 * (1 - own);
    }
    /* a fighting stance on top of the capture: on the ground the hips sit lower over wider-set
       feet with the knees pushed out (narrowing as the pace picks up, less of it at a sprint); in
       the air the knees tuck until the feet reach for the ground */
    L.ready += ((mode === 0 ? 1 - 0.45 * L.sprintW : 0) - L.ready) * Math.min(1, dt * 6);
    L.tuck += ((mode === 1 && (I.vy > -3 || I.gd > 1.6) ? 1 : 0) - L.tuck) * Math.min(1, dt * 8);
    const wide = 0.05 * L.ready * (1 - 0.7 * smooth(0.5, 3.5, I.spd));
    /* ---- orientation warping: the hips turn toward the travel, the rest is done by the feet ---- */
    const natA = Math.atan2(natX, -natZ);
    const moving = mode === 0 && L.moving > 0.05 && I.spd > 0.3;
    let hipT = 0;
    if (moving) hipT = clamp(wrap(a - natA), -1.05, 1.05) * 0.8;
    L.hipYaw += (hipT - L.hipYaw) * Math.min(1, dt * 9);
    qyaw(-L.hipYaw, _q, 0);
    qmul(_q, 0, P, PEL * 4, L.pelQ, 0);
    qrot(_q, 0, P, NB * 4, L.pelP, 0);
    L.pelP[1] += PELVIS_Y;
    /* ---- the legs: forward kinematics of the blended pose, in the root frame ---- */
    const cy = Math.cos(I.yaw),
      sy = Math.sin(I.yaw);
    /* (turning the pelvis by -hipYaw about Y turns its travel by +hipYaw) the feet turn the rest */
    const turnFeet = moving ? clamp(wrap(a - natA - L.hipYaw), -1.6, 1.6) * smooth(0.3, 1, I.spd) : 0;
    const cosT = Math.cos(-turnFeet),
      sinT = Math.sin(-turnFeet);
    /* the stride runs along the warped clip direction */
    const dx = Math.sin(natA + L.hipYaw),
      dz = -Math.cos(natA + L.hipYaw);
    for (let s = 0; s < 2; s++) {
      const h = LEG[s][0],
        k = LEG[s][1],
        an = LEG[s][2];
      const hp = _hip,
        o = s * 3;
      qrot(L.pelQ, 0, REST_HIP, o, hp, o);
      for (let j = 0; j < 3; j++) hp[o + j] += L.pelP[j];
      qmul(L.pelQ, 0, P, h * 4, _q, 4);
      qrot(_q, 4, DOWN_T, 0, _kn, o);
      for (let j = 0; j < 3; j++) _kn[o + j] += hp[o + j];
      qmul(_q, 4, P, k * 4, _q, 8);
      qrot(_q, 8, DOWN_S, 0, _ank, o);
      for (let j = 0; j < 3; j++) _ank[o + j] += _kn[o + j];
      qmul(_q, 8, P, an * 4, _aq, s * 4);
      const sd = s ? 1 : -1;
      _ank[o] += sd * wide;
      _kn[o] += sd * wide * 1.8;
      _ank[o + 1] += 0.15 * L.tuck;
      _ank[o + 2] += 0.07 * L.tuck;
      /* crouched, the swinging foot stays low */
      if (sink < 0) _ank[o + 1] = 0.07 + (_ank[o + 1] - 0.07) * (1 + sink * 2.4);
      /* stride and direction warping around the point under the hip */
      if (moving) {
        let ox = _ank[o] - hp[o],
          oz = _ank[o + 2] - hp[o + 2];
        const along = (ox * dx + oz * dz) * (kStride - 1);
        ox += along * dx;
        oz += along * dz;
        _ank[o] = hp[o] + ox * cosT + oz * sinT;
        _ank[o + 2] = hp[o + 2] - ox * sinT + oz * cosT;
        const kx = _kn[o] - hp[o],
          kz = _kn[o + 2] - hp[o + 2];
        _kn[o] = hp[o] + kx * cosT + kz * sinT;
        _kn[o + 2] = hp[o + 2] - kx * sinT + kz * cosT;
        qyaw(-turnFeet, _q, 12);
        qmul(_q, 12, _aq, s * 4, _aq, s * 4);
      }
      /* ---- planted feet stay where they landed (in the world) ---- */
      const F = L.feet[s];
      const ax = _ank[o],
        az = _ank[o + 2];
      const wx = I.x + ax * cy + az * sy,
        wz = I.z - ax * sy + az * cy;
      const c = L.contact[s];
      F.c = c;
      if (!I.near || mode === 1) {
        F.lock = false;
        F.step = -1;
        F.lw = 0;
      } else {
        if (F.step >= 0) {
          /* a step on the spot: lift, carry to where the pose wants the foot, set down */
          F.step += dt / TURN.step;
          const u = Math.min(1, F.step),
            e = u * u * (3 - 2 * u);
          F.lx = F.sx + (wx - F.sx) * e;
          F.lz = F.sz + (wz - F.sz) * e;
          F.ly = Math.sin(Math.PI * u) * TURN.lift;
          F.lyaw = F.syaw + wrap(I.yaw - F.syaw) * e;
          F.lw = 1;
          if (u >= 1) {
            F.step = -1;
            F.lock = true;
            F.ly = 0;
            F.lyaw = I.yaw;
          }
        } else if (c > 0.5 && !F.lock) {
          F.lock = true;
          F.lx = wx;
          F.lz = wz;
          F.ly = 0;
          F.lyaw = I.yaw;
        } else if (c < 0.4 && F.lock) F.lock = false;
        if (F.lock) {
          /* how far the pose has moved away from the planted foot */
          const ex = F.lx - wx,
            ez = F.lz - wz,
            dev = Math.sqrt(ex * ex + ez * ez),
            twist = Math.abs(wrap(I.yaw - F.lyaw));
          const other = L.feet[1 - s];
          if (L.moving < 0.2 && (dev > 0.14 || twist > 0.6) && other.step < 0 && F.lw > 0.9) {
            F.lock = false;
            F.step = 0;
            F.sx = F.lx;
            F.sz = F.lz;
            F.syaw = F.lyaw;
          } else if (dev > 0.45) F.lock = false;
        }
        const want = F.lock || F.step >= 0 ? 1 : 0;
        /* (a lock starts where the foot is, so it takes hold at once; letting go eases out) */
        F.lw = want ? 1 : F.lw * Math.max(0, 1 - dt * 12);
      }
      if (F.lw > 0.001) {
        /* back into the root frame */
        const ex = F.lx - I.x,
          ez = F.lz - I.z;
        const lx = ex * cy - ez * sy,
          lz = ex * sy + ez * cy;
        _ank[o] += (lx - _ank[o]) * F.lw;
        _ank[o + 2] += (lz - _ank[o + 2]) * F.lw;
        _ank[o + 1] += F.ly * F.lw;
        qyaw(wrap(F.lyaw - I.yaw) * F.lw, _q, 12);
        qmul(_q, 12, _aq, s * 4, _aq, s * 4);
      }
      /* the ground under the foot (stairs, ledges); the rig looks it up where the foot is */
      L.ank[o] = _ank[o];
      L.ank[o + 2] = _ank[o + 2];
      _ank[o + 1] += s ? I.gR : I.gL;
    }
    /* ---- the hips: the ground, a crouch, and feet that are out of reach pull them down ---- */
    let need = 0;
    for (let s = 0; s < 2; s++) {
      const o = s * 3;
      const ddx = _ank[o] - _hip[o],
        ddy = _ank[o + 1] - _hip[o + 1],
        ddz = _ank[o + 2] - _hip[o + 2];
      const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (d > REACH && mode === 0) {
        const hz = Math.sqrt(ddx * ddx + ddz * ddz);
        /* how far down the hip must go for the foot to be in reach */
        const v = Math.sqrt(Math.max(0, REACH * REACH - hz * hz));
        need = Math.min(need, -(-ddy - v) * Math.min(1, L.contact[s] + 0.3));
      }
    }
    /* (reach follows the pose exactly: it is as smooth as the pose is) */
    const dropT = Math.min(0, I.gL, I.gR) + sink - 0.075 * L.ready;
    L.drop += (dropT - L.drop) * Math.min(1, dt * (dropT < L.drop ? 30 : 10));
    L.pelP[1] += L.drop + Math.max(-0.3, need);
    /* ---- results in the pelvis' frame ---- */
    qinv(L.pelQ, 0, _q, 0);
    for (let s = 0; s < 2; s++) {
      const o = s * 3;
      for (let j = 0; j < 3; j++) {
        _v[j] = _ank[o + j] - L.pelP[j];
        _v[3 + j] = _kn[o + j] - _hip[o + j] + (j === 2 ? -0.08 : 0);
      }
      qrot(_q, 0, _v, 0, L.tgt, o);
      qrot(_q, 0, _v, 3, L.pole, o);
      qmul(_q, 0, _aq, s * 4, L.ankQ, s * 4);
      /* the toes bend when the heel is up and the foot is near the ground */
      qrot(_aq, s * 4, FOOT_F, 0, _v, 6);
      const pitch = Math.asin(clamp(_v[7], -1, 1)) + 0.536;
      const low = 1 - smooth(0.12, 0.3, _ank[o + 1] - (s ? I.gR : I.gL));
      L.toe[s] += (clamp(-pitch - 0.08, 0, 0.9) * low - L.toe[s]) * Math.min(1, dt * 20);
    }
    /* ---- the spine: the capture's motion, steadied toward the aim (less so at a sprint) ---- */
    const stab = I.aim ? 0.75 : 0.55 - 0.3 * L.sprintW;
    qmul(P, PEL * 4, P, SPN * 4, _q, 0);
    qmul(_q, 0, P, SP2 * 4, _q, 4);
    qmul(_q, 4, P, CHS * 4, _q, 12); // the capture's chest, root frame, before the hips' turn
    /* its target: part way back to upright, facing the aim (whatever the hips do) */
    qyaw(-L.hipYaw, _v, 0);
    qmul(_v, 0, _q, 12, _q, 8); // the chest as the warped pelvis carries it
    qlerp(_q, 12, IDQ, 0, stab);
    /* correction C = target * inverse(chest), a third of it taken at the spine and spine2 */
    qinv(_q, 8, _v, 0);
    qmul(_q, 12, _v, 0, _v, 4); // C
    if (_v[7] < 0) for (let j = 4; j < 8; j++) _v[j] = -_v[j];
    const cw = _v[7];
    _v[8] = _v[4] / 3;
    _v[9] = _v[5] / 3;
    _v[10] = _v[6] / 3;
    _v[11] = cw + (1 - cw) * (2 / 3);
    qnorm(_v, 8); // ~C^(1/3)
    const SPQ = L.spine;
    /* spine: inverse(pelvis) * C1 * pelvis * spine */
    qinv(L.pelQ, 0, _v, 0);
    qmul(_v, 0, _v, 8, _aq, 0);
    qmul(_aq, 0, L.pelQ, 0, _aq, 4);
    qmul(_aq, 4, P, SPN * 4, SPQ, 0);
    /* spine2: inverse(W_spine') * C1 * W_spine' * spine2 */
    qmul(L.pelQ, 0, SPQ, 0, _q, 0); // W_spine'
    qinv(_q, 0, _v, 0);
    qmul(_v, 0, _v, 8, _aq, 0);
    qmul(_aq, 0, _q, 0, _aq, 4);
    qmul(_aq, 4, P, SP2 * 4, SPQ, 4);
    /* chest: exactly the target */
    qmul(_q, 0, SPQ, 4, _q, 4); // W_spine2'
    qinv(_q, 4, _v, 0);
    qmul(_v, 0, _q, 12, SPQ, 8);
    /* ---- the arms' swing (hands in the chest's frame), for an arm that holds nothing ---- */
    for (let s = 0; s < 2; s++) {
      const sh = ARM[s][0],
        el = ARM[s][1],
        o = s * 3,
        sd = s ? 1 : -1;
      qrot(P, sh * 4, DOWN_UA, 0, _v, 0);
      qmul(P, sh * 4, P, el * 4, _aq, 0);
      qrot(_aq, 0, DOWN_FA, 0, _v, 3);
      L.hand[o] = sd * 0.27 + _v[0] + _v[3];
      L.hand[o + 1] = 0.17 + _v[1] + _v[4];
      L.hand[o + 2] = _v[2] + _v[5];
    }
    L.phase = L.ph;
    return L;
  }
  return { make, reset, update, clips: CL, sample, finish, stance };
})();
