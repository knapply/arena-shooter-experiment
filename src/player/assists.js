/* pound landing marker: shows where a charged ground pound will hit and how wide */
const poundRing = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 1, 48),
  new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
);
poundRing.material.color.multiplyScalar(2);
poundRing.rotation.x = -Math.PI / 2;
poundRing.visible = false;
scene.add(poundRing);
const _pd = new V3(),
  _po = new V3();
function updPoundRing() {
  if (!playing || me.pound !== 1 || me.dead) {
    poundRing.visible = false;
    return;
  }
  const d = me.aimDir();
  if (d.y > -0.45) d.y = -0.45;
  d.normalize();
  _po.copy(me.pos);
  _po.y += 1;
  const t = rayWorld(_po, d, 60);
  if (t >= 60) {
    poundRing.visible = false;
    return;
  }
  _pd.copy(_po).addScaledVector(d, t);
  poundRing.position.set(_pd.x, _pd.y + 0.06, _pd.z);
  const k = Math.min(1, me.poundT / TUNE.poundCharge);
  poundRing.scale.setScalar(5 * (0.4 + 0.6 * k));
  poundRing.material.opacity = 0.4 + 0.5 * k;
  poundRing.visible = true;
}
/* controller aim assist: follows a target you are already tracking (rotation), never snaps */
function assistTarget() {
  const o = camera.position;
  _aa.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null,
    ba = 1e9;
  for (const t of targets()) {
    _ab.copy(t.pos);
    _ab.y += t.h * 0.6;
    _ab.sub(o);
    const L = _ab.length();
    if (L > 48 || L < 0.5) continue;
    const ang = Math.acos(clamp(_ab.dot(_aa) / L, -1, 1)),
      zone = (0.75 / L + 0.015) * 2.2;
    if (ang < zone && ang < ba) {
      ba = ang;
      best = {
        ref: t.ref,
        yaw: Math.atan2(-_ab.x, -_ab.z),
        pitch: Math.atan2(_ab.y, Math.hypot(_ab.x, _ab.z)),
      };
    }
  }
  return best;
}
