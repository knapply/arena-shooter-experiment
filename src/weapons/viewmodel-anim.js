/* ============ viewmodel animation ============ */
const _cA = new V3(),
  _cB = new V3(),
  _cZ = new V3(),
  _cM = new THREE.Matrix4();
/* carrying in first person: the flag's pole or the skull rides a little with your stride and swings
   with a blow (wound up, driven, followed through), and both hands hold it: closed round the pole,
   or spread on the skull's sides */
function carryVM(c, G) {
  const M = meleeShape(vmS.mc),
    skull = G === vmSkull,
    bob = c.moving ? Math.abs(Math.cos(c.stepPh * Math.PI)) * 0.012 : 0;
  G.position.copy(G.userData.p);
  G.rotation.copy(G.userData.r);
  G.position.y += bob + (skull ? 0.1 * M.w - 0.05 * M.s : 0.06 * M.w);
  G.position.z += (skull ? -0.16 : -0.1) * M.s + 0.04 * M.w;
  G.position.x -= (skull ? 0.04 : 0.1) * M.s;
  G.rotation.x += skull ? -0.3 * M.w + 0.5 * M.s : -0.2 * M.w + 0.25 * M.s;
  G.rotation.z += skull ? 0 : 0.5 * M.s + 0.15 * M.f;
  G.updateMatrix();
  for (const h of [vmR, vmL]) {
    const sd = h.userData.side;
    if (skull) {
      /* the hand's body out to its side of the skull, the palm on it, fingers up and round it */
      h.quaternion.setFromRotationMatrix(
        _cM.makeBasis(_cA.set(1, 0, 0), _cB.set(0, 0, 1), _cZ.set(0, -1, 0))
      );
      h.position.setFromMatrixPosition(G.matrix);
      h.position.x += sd * 0.028;
      handPose(h, "ball");
    } else {
      /* round the pole, the hand's body toward you: right hand high, left low */
      _cB.set(0, 1, 0).applyQuaternion(G.quaternion);
      _cA.set(0, 0, 1).addScaledVector(_cB, -_cB.z).normalize().multiplyScalar(sd);
      _cZ.crossVectors(_cA, _cB);
      h.quaternion.setFromRotationMatrix(_cM.makeBasis(_cA, _cB, _cZ));
      h.position.set(0, sd > 0 ? 0.15 : -0.1, 0).applyMatrix4(G.matrix);
      handPose(h, "grip");
    }
  }
}
/* a blow's impact waits for the first-person strike to reach it (a charge's, or one with no blow in
   flight, lands at once): then the thud and sparks, the hitstop, the camera punch and the rumble */
const _mlP = new V3(),
  _mlD = new V3();
function meleeLand(p, d, f) {
  meleeFlush();
  _mlP.copy(p);
  _mlD.copy(d);
  vmS.land = f + 1;
  if (f & MFX.CHARGE || vmS.mc < 0 || vmS.mc >= MEL_HIT) meleeFlush();
}
function meleeFlush() {
  if (!vmS.land) return;
  const f = vmS.land - 1,
    world = f & MFX.WORLD;
  vmS.land = 0;
  meleeFx(_mlP, _mlD, f);
  vmS.stop = world ? 0.035 : f & MFX.CHARGE ? 0.09 : 0.075;
  vmS.punch = world ? 0.55 : 1;
  shakeT = Math.max(shakeT, world ? 0.08 : 0.16);
  fovK = Math.max(fovK, world ? 0.4 : 0.9);
  rumble(world ? 0.45 : 1, world ? 0.35 : 0.85, world ? 90 : 160);
}
function updVM(dt, c) {
  /* while a replay plays, it poses the viewmodel from the recording (game/replay.js) */
  if (REPLAY.active && !c.replay) return;
  const k = 1 - Math.exp(-16 * dt),
    kf = 1 - Math.exp(-24 * dt);
  const V = VMW[wi],
    P = V.P,
    g = V.g;
  /* aimK (0..1) follows the eased zoom, so the gun reaches the eye as the zoom lands */
  const aK = c.aimK === undefined ? (c.aim ? 1 : 0) : c.aimK,
    blend = c.aimK !== undefined && aK > 0 && aK < 1;
  let pose = aK > 0.5 ? P.aim : P.hip;
  if (c.reload >= 0) pose = P.reload;
  else if (c.sprint) pose = P.sprint;
  else if (c.low) pose = P.low;
  _c.copy(pose.p);
  _e1.set(pose.r[0], pose.r[1], pose.r[2]);
  if (blend && (pose === P.aim || pose === P.hip)) {
    /* the gun leads the zoom a little: it is at the eye before the optic finishes */
    const h = P.hip,
      a = P.aim,
      u = aK * (2 - aK);
    _c.lerpVectors(h.p, a.p, u);
    _e1.set(h.r[0] + (a.r[0] - h.r[0]) * u, h.r[1] + (a.r[1] - h.r[1]) * u, h.r[2] + (a.r[2] - h.r[2]) * u);
  }
  const ph = c.stepPh * Math.PI,
    ads = aK > 0.5 && c.reload < 0;
  if (c.sprint) {
    _c.x += Math.sin(ph) * 0.045;
    _c.y += Math.abs(Math.cos(ph)) * 0.035;
    _e1.z += Math.sin(ph) * 0.08;
  } else if (c.moving && !c.aim) {
    /* walking, the gun sways in a figure eight (the camera itself does not bob) */
    _c.x += Math.sin(ph) * 0.013;
    _c.y += 0.006 - Math.cos(2 * ph) * 0.006;
    _e1.z += Math.sin(ph) * 0.012;
  } else if (c.moving) {
    _c.y += Math.abs(Math.cos(ph)) * 0.0025;
  }
  /* a blow runs on its own clock (meleeShape: wind-up, strike, follow-through), which stops dead for
     a moment when it lands (hitstop); the impact itself waits for the moment of contact */
  if (c.melee >= 0 && !c.charge && (vmS.mc < 0 || c.melee < vmS.lastM - 0.2)) vmS.mc = c.melee;
  vmS.lastM = c.melee;
  if (vmS.mc >= 0) {
    if (vmS.stop > 0) vmS.stop -= dt;
    else vmS.mc += dt / 0.4;
    if (vmS.mc >= 1) vmS.mc = -1;
  }
  if (vmS.land && (vmS.mc >= MEL_HIT || vmS.mc < 0 || c.charge)) meleeFlush();
  vmS.punch *= Math.exp(-14 * dt);
  if (vmS.mc >= 0 || c.charge) {
    const M = meleeShape(c.charge ? 0.4 : vmS.mc),
      w = M.w,
      s = M.s,
      f = M.f;
    if (V.whip) {
      /* the pistol-whip: cocked up, then rolled onto its side and brought down hard across */
      _c.y += 0.08 * w + 0.06 * s - 0.05 * f;
      _c.z += 0.04 * w - 0.32 * s;
      _c.x -= 0.11 * s + 0.04 * f;
      _e1.x += 0.5 * w - 1 * s - 0.35 * f;
      _e1.y += 0.38 * s;
      _e1.z += 1.15 * s + 0.2 * f;
    } else {
      /* the butt-stroke: drawn back and turned, then driven across and forward, stock first */
      _c.x += 0.06 * w - 0.18 * s - 0.07 * f;
      _c.y += -0.02 * w + 0.08 * s;
      _c.z += 0.08 * w - 0.38 * s - 0.04 * f;
      _e1.x += 0.1 * w - 0.55 * s;
      _e1.y += -0.35 * w + 1.05 * s + 0.35 * f;
      _e1.z += -0.2 * w + 0.62 * s + 0.25 * f;
    }
  }
  if (c.pound1) {
    _c.x += rnd(-0.006, 0.006);
    _c.y += rnd(-0.006, 0.006);
  }
  if (c.thrust && !ads) {
    _c.x -= c.lr * 0.004;
    _e1.z += c.lr * 0.01;
  }
  /* a landing: the gun follows the camera's landing dip (sink, hold, ease back: game/loop.js), a few
     centimetres at most, with no bounce of its own */
  _c.y -= c.landDip * (ads ? 0.04 : 0.15);
  _e1.z += c.strafe * (ads ? 0.008 : 0.06);
  /* inertia: the weapon lags behind changes in velocity (springs) and floats a little in the air; the
     vertical spring is critically damped, and the stop of a landing is left to the dip above (a
     kick there swung the gun back past rest: a bounce the reference doesn't have) */
  if (c.vel) {
    const cy = Math.cos(c.yaw),
      sy = Math.sin(c.yaw),
      vr = c.vel.x * cy - c.vel.z * sy,
      vf = -c.vel.x * sy - c.vel.z * cy,
      idt = 1 / Math.max(dt, 1e-3);
    const ar = clamp((vr - vmS.lvx) * idt, -60, 60),
      au = clamp((c.vel.y - vmS.lvy) * idt, -60, 60),
      af = clamp((vf - vmS.lfw) * idt, -60, 60);
    vmS.lvx = vr;
    vmS.lvy = c.vel.y;
    vmS.lfw = vf;
    vmS.inX.v -= ar * 0.0009;
    if (!(vmS.air && c.ground)) vmS.inY.v -= au * 0.0006;
    vmS.inZ.v += af * 0.0006;
    vmS.air = !c.ground;
  }
  const ik = ads ? 0.25 : 1;
  _c.x += spring(vmS.inX, 0, dt, 3.2, 0.55) * ik;
  _c.y +=
    (spring(vmS.inY, 0, dt, 3, 1) + (c.ground ? 0 : clamp(-(c.vel ? c.vel.y : 0) * 0.0012, -0.01, 0.015))) *
    ik;
  _c.z += spring(vmS.inZ, 0, dt, 3.5, 0.6) * ik;
  _e1.z -= vmS.inX.x * 1.6 * ik;
  _e1.x += vmS.inY.x * 1.2 * ik;
  if (!c.moving && !c.sprint && c.ground) {
    const b = Math.sin(now * 1.6);
    _c.y += b * 0.0018 * (ads ? 0.3 : 1);
    _e1.x += b * 0.002 * (ads ? 0.3 : 1);
  }
  if (switchT > 0) {
    /* a new weapon comes up from the lower right, turning in as it rises, and settles */
    const s = Math.pow(Math.min(1, switchT / SWITCH_TIME), 2);
    _c.x += 0.1 * s;
    _c.y -= 0.3 * s;
    _e1.x -= 0.7 * s;
    _e1.z -= 0.45 * s;
  }
  /* the gun's part in the reload: tilt to the hand, the slap's jolt, the bolt's tug (rig.js) */
  if (c.reload >= 0) reloadGunMotion(c.reload, _c, _e1);
  const sw = ads ? 0.25 : 1;
  vmS.swayY += (clamp((me.yaw - vmS.lastYaw) * -2.5, -0.12, 0.12) * sw - vmS.swayY) * Math.min(1, dt * 10);
  vmS.swayP += (clamp((me.pitch - vmS.lastPitch) * 2.5, -0.1, 0.1) * sw - vmS.swayP) * Math.min(1, dt * 10);
  vmS.lastYaw = me.yaw;
  vmS.lastPitch = me.pitch;
  _e1.y += vmS.swayY;
  _e1.x += vmS.swayP;
  /* each shot: the kick snaps back and up at once and recovers over the weapon's own time (kr: a
     quick tick for automatics, a long settle for the sniper and the rocket), twisted a little at
     random (kj); the slide or pump cycles (cyc) and a wisp of smoke leaves the muzzle */
  if (vmS.kick === 1) {
    vmS.shot = 0;
    vmS.jy = rnd(-1, 1) * V.kj;
    vmS.jz = rnd(-1, 1) * V.kj;
    if (fxOn() && vmRoot.visible) {
      flashSprite.getWorldPosition(_cA);
      ptAdd(
        PTS.soft,
        _cA,
        _cB.set(rnd(-0.2, 0.2), rnd(0.3, 0.6), rnd(-0.2, 0.2)),
        0.06,
        0x9a9890,
        0.25,
        0.5,
        {
          grow: 3,
          drag: 2,
        }
      );
    }
  }
  vmS.shot += dt;
  /* (both fit inside the weapon's own fire interval, read at run time, so a faster rate never stacks them) */
  const fr = Math.min(1, (W().rate * 0.9) / Math.max(V.kr, V.cyc ? V.cyc[1] + V.cyc[2] : 0));
  vmS.kick = Math.max(0, vmS.kick - dt / (V.kr * fr));
  const kk = vmS.kick * vmS.kick * (3 - 2 * vmS.kick);
  _c.z += kk * W().kick;
  _e1.x += kk * W().kick * 1.5 * (ads ? 0.5 : 1) * (V.flip || 1);
  _e1.y += kk * vmS.jy * (ads ? 0.4 : 1);
  _e1.z += kk * vmS.jz * (ads ? 0.4 : 1);
  const u = V.cyc ? (vmS.shot / fr - V.cyc[1]) / V.cyc[2] : -1,
    ao = u > 0 && u < 1 ? V.cyc[0] * Math.sin(Math.PI * Math.sqrt(u)) : 0;
  V.act.position.z = ao;
  /* a grenade throw: the gun dips down and to the right as the off hand swings through, and is back
     up by about 0.5 s (the reference's throws: hand in, release about 0.1 s later, the arm gone by
     0.15-0.2 s, the gun back by 0.35-0.5 s) */
  const tu = vmS.throwT > 0 ? THROW_T - vmS.throwT : -1;
  if (tu >= 0) {
    const d = Math.min(1, tu / 0.05) * Math.max(0, 1 - Math.max(0, tu - 0.12) / 0.38);
    _c.x += 0.03 * d;
    _c.y -= 0.06 * d;
    _e1.x -= 0.18 * d;
    _e1.z -= 0.12 * d;
  }
  /* a weapon just drawn starts from where it comes up, not where it was last put away */
  const fresh = vmS.lastV !== V;
  vmS.lastV = V;
  /* while the zoom eases, the pose is already eased: follow it closely so the gun lands with the zoom */
  const gk = fresh ? 1 : blend ? 1 - Math.exp(-50 * dt) : ads ? Math.min(1, k * 1.4) : k;
  g.position.lerp(_c, gk);
  _q2.setFromEuler(_e1);
  g.quaternion.slerp(_q2, gk);
  g.updateMatrix();
  vmR.position.copy(V.grip).applyMatrix4(g.matrix);
  vmR.quaternion.copy(g.quaternion);
  vmS.throwT = Math.max(0, vmS.throwT - dt);
  /* the off hand: in high from the upper left (the grenade leaves at the key press, as the hand passes
     the centre: the wind-up is folded into the first frames), through and down to the lower left, out
     of view by 0.2 s, then back to the gun */
  const swing = vmS.throwT > 0 && THROW_T - vmS.throwT < THROW_KEYS[THROW_KEYS.length - 1][0];
  if (swing) {
    const u = THROW_T - vmS.throwT;
    let i = 1;
    while (THROW_KEYS[i][0] < u) i++;
    const [t0, a] = THROW_KEYS[i - 1],
      [t1, b] = THROW_KEYS[i],
      w = (u - t0) / (t1 - t0),
      e = w * w * (3 - 2 * w);
    _lk.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
  } else if (c.reload >= 0) reloadKey(V.keys, c.reload, V.fore, _lk).applyMatrix4(g.matrix);
  else if (c.clamber) _lk.set(-0.22, 0, -0.42);
  else
    _lk
      .copy(V.fore)
      .setZ(V.fore.z + (V.pump ? ao : 0))
      .applyMatrix4(g.matrix);
  vmS.lh.lerp(_lk, swing ? 1 : kf);
  vmL.position.copy(vmS.lh);
  const free = c.reload >= 0 || vmS.throwT > 0 || c.clamber;
  vmL.quaternion.slerp(free || !V.lq ? g.quaternion : _q3.copy(g.quaternion).multiply(V.lq), kf);
  handPose(vmL, swing ? "ball" : free ? "grip" : "wrap");
  handPose(vmR, "grip");
  /* clambering, both hands come off the gun, reach and plant flat on the ledge (held where it is in
     the world, so the view rises over them), then go back to the gun */
  const cl = c.cl;
  vmS.cl += ((cl && cl.dur && cl.t < cl.dur * 0.8 ? 1 : 0) - vmS.cl) * Math.min(1, dt * (cl ? 20 : 9));
  if (cl && cl.to && vmS.clOf !== cl) {
    vmS.clOf = cl;
    const dx = cl.to.x - cl.from.x,
      dz = cl.to.z - cl.from.z,
      L = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < 2; s++)
      vmS.clA[s].set(
        cl.from.x + (dx / L) * 0.5 - (dz / L) * (s ? 0.21 : -0.21),
        cl.to.y + 0.01,
        cl.from.z + (dz / L) * 0.5 + (dx / L) * (s ? 0.21 : -0.21)
      );
  }
  if (vmS.cl > 0.01 && vmS.clOf) {
    camera.updateMatrixWorld();
    _q2.setFromAxisAngle(_a.set(0, 1, 0), me.yaw).premultiply(_q1.copy(camera.quaternion).invert());
    [vmL, vmR].forEach((h, s) => {
      vmRoot.worldToLocal(_lk.copy(vmS.clA[s]));
      /* (a low ledge would put them under the view: they plant at its foot and sink as you rise) */
      const k = cl && cl.dur ? cl.t / cl.dur : 1;
      _lk.y = clamp(_lk.y, -0.3 - 1.2 * Math.max(0, k - 0.3), 0.04);
      _lk.z = Math.min(_lk.z, -0.4);
      h.position.lerp(_lk, vmS.cl);
      h.quaternion.slerp(_q2, vmS.cl);
      if (vmS.cl > 0.5) handPose(h, "flat");
    });
  }
  if (vmFlagOn) carryVM(c, vmFlagOn === "skull" ? vmSkull : vmFlag);
  handArm(vmR);
  handArm(vmL);
  const r = c.reload,
    mg = V.mag;
  if (r >= 0) {
    const T = RELOAD_T,
      inHand = magInHand(r);
    mg.visible = !(r >= T.out && r < T.pouch);
    if (inHand) {
      _m1.copy(g.matrix).invert();
      mg.position.copy(vmS.lh).applyMatrix4(_m1);
      mg.position.y += 0.02;
    } else mg.position.copy(V.slot);
    if (vmS.lastR < T.grab && r >= T.grab) sfx("magout", 0.9);
    if (vmS.lastR >= 0 && vmS.lastR < T.out && r >= T.out) {
      camera.updateMatrixWorld(true);
      dropMag(mg.getWorldPosition(new V3()), mg.getWorldQuaternion(new THREE.Quaternion()));
    }
    if (vmS.lastR < T.seat && r >= T.seat) sfx("magin");
    if (vmS.lastR < T.slap && r >= T.slap) {
      sfx("slap");
      shakeT = Math.max(shakeT, 0.06);
    }
    if (vmS.lastR < T.back && r >= T.back) sfx("boltback");
    if (vmS.lastR < T.release && r >= T.release) sfx("boltfwd");
    vmS.lastR = r;
  } else {
    mg.visible = true;
    mg.position.copy(V.slot);
    vmS.lastR = -1;
  }
}
