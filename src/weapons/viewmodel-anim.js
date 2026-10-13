/* ============ viewmodel animation ============ */
function updVM(dt, c) {
  /* while a replay plays, it poses the viewmodel from the recording (game/replay.js) */
  if (REPLAY.active && !c.replay) return;
  const k = 1 - Math.exp(-16 * dt),
    kf = 1 - Math.exp(-24 * dt);
  const V = VMW[wi],
    P = V.P,
    g = V.g;
  let pose = c.aim ? P.aim : P.hip;
  if (c.reload >= 0) pose = P.reload;
  else if (c.sprint) pose = P.sprint;
  else if (c.low) pose = P.low;
  _c.copy(pose.p);
  _e1.set(pose.r[0], pose.r[1], pose.r[2]);
  const ph = c.stepPh * Math.PI,
    ads = c.aim && c.reload < 0;
  if (c.sprint) {
    _c.x += Math.sin(ph) * 0.045;
    _c.y += Math.abs(Math.cos(ph)) * 0.035;
    _e1.z += Math.sin(ph) * 0.08;
  } else if (c.moving && !c.aim) {
    _c.x += Math.sin(ph) * 0.012;
    _c.y += Math.abs(Math.cos(ph)) * 0.012;
  } else if (c.moving) {
    _c.y += Math.abs(Math.cos(ph)) * 0.0025;
  }
  if (c.melee >= 0) {
    /* the strike: the gun swings hard across and forward, butt first, then recovers */
    const m = meleeCurve(c.melee);
    _c.z -= 0.34 * m;
    _c.x -= 0.16 * m;
    _c.y += 0.07 * m;
    _e1.x -= 0.5 * m;
    _e1.y += 0.95 * m;
    _e1.z += 0.55 * m;
  }
  if (c.pound1) {
    _c.x += rnd(-0.006, 0.006);
    _c.y += rnd(-0.006, 0.006);
  }
  if (c.thrust && !ads) {
    _c.x -= c.lr * 0.004;
    _e1.z += c.lr * 0.01;
  }
  _c.y -= c.landDip * (ads ? 0.06 : 0.25);
  _e1.z += c.strafe * (ads ? 0.008 : 0.06);
  /* inertia: the weapon lags behind changes in velocity (springs), floats up on a jump and settles on landing */
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
    vmS.inY.v -= au * 0.0006;
    vmS.inZ.v += af * 0.0006;
    if (vmS.air && c.ground) vmS.inY.v -= 0.12;
    vmS.air = !c.ground;
  }
  const ik = ads ? 0.25 : 1;
  _c.x += spring(vmS.inX, 0, dt, 3.2, 0.55) * ik;
  _c.y +=
    (spring(vmS.inY, 0, dt, 3, 0.5) + (c.ground ? 0 : clamp(-(c.vel ? c.vel.y : 0) * 0.0025, -0.02, 0.03))) *
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
    const s = Math.sin(Math.min(1, switchT / 0.36) * Math.PI);
    _c.y -= 0.22 * s;
    _e1.x -= 0.6 * s;
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
  vmS.kick = Math.max(0, vmS.kick - dt * 14);
  _c.z += vmS.kick * W().kick;
  _e1.x += vmS.kick * W().kick * 1.5 * (ads ? 0.5 : 1);
  g.position.lerp(_c, ads ? Math.min(1, k * 1.4) : k);
  _q2.setFromEuler(_e1);
  g.quaternion.slerp(_q2, ads ? Math.min(1, k * 1.4) : k);
  g.updateMatrix();
  vmR.position.copy(V.grip).applyMatrix4(g.matrix);
  vmR.quaternion.copy(g.quaternion);
  vmS.throwT = Math.max(0, vmS.throwT - dt);
  if (vmS.throwT > 0) {
    const t = 1 - vmS.throwT / 0.42;
    const s = Math.sin(t * Math.PI);
    _lk.set(-0.2 + 0.12 * s, -0.12 + 0.2 * s, -0.25 - 0.3 * s);
  } else if (c.reload >= 0) reloadKey(V.keys, c.reload, V.fore, _lk).applyMatrix4(g.matrix);
  else if (c.clamber) _lk.set(-0.22, 0, -0.42);
  else _lk.copy(V.fore).applyMatrix4(g.matrix);
  vmS.lh.lerp(_lk, kf);
  vmL.position.copy(vmS.lh);
  vmL.quaternion.slerp(g.quaternion, kf);
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
