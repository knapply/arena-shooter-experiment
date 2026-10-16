/* ============ SHADOW FIT: the sun's shadow map covers what you are looking at ============
   The shadow camera used to cover a whole map (84 m square, 68 x 116 m on Twin Foundry), so every
   caster on the map was drawn into it every frame and each shadow texel was 4-8 cm. It now covers a
   square ahead of the view (half-size by the Shadows setting), so casters behind you are culled from
   the shadow pass and shadows are sharper. The square moves in whole shadow texels in the light's
   frame, so shadow edges don't crawl as you move. The sun keeps its direction: whatever else sets
   sun.position (the trailer's moods) is read as a new direction. */
const SHADOW_FIT = { dir: new THREE.Vector3().copy(sun.position).normalize(), set: new THREE.Vector3() };
const _sfC = new THREE.Vector3(),
  _sfF = new THREE.Vector3(),
  _sfR = new THREE.Matrix4(),
  _sfI = new THREE.Matrix4(),
  _sfO = new THREE.Vector3(),
  _sfU = new THREE.Vector3(0, 1, 0);
scene.add(sun.target);
/** the direction toward the sun, wherever the shadow camera currently sits */
function sunDir(out) {
  if (!sun.position.equals(SHADOW_FIT.set)) {
    SHADOW_FIT.dir.copy(sun.position).sub(sun.target.position).normalize();
    SHADOW_FIT.set.copy(sun.position);
  }
  return out.copy(SHADOW_FIT.dir);
}
function fitShadow() {
  sunDir(_sfC);
  if (!sun.castShadow) return;
  const R = { low: 30, medium: 38, high: 46, ultra: 56 }[SET.shadows] || 40;
  const c = sun.shadow.camera;
  /* (a map change may have set its own bounds) */
  if (c.left !== -R || c.top !== R) {
    Object.assign(c, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 160 });
    c.updateProjectionMatrix();
  }
  /* centred ahead of the camera, so most of the square is in view */
  camera.getWorldPosition(_sfC);
  camera.getWorldDirection(_sfF);
  _sfF.y = 0;
  if (_sfF.lengthSq() < 1e-6) _sfF.set(0, 0, -1);
  _sfC.addScaledVector(_sfF.normalize(), R * 0.55);
  _sfC.y = 0;
  /* snapped to whole texels in the light's frame */
  const tx = (2 * R) / sun.shadow.mapSize.x;
  _sfR.lookAt(_sfO.set(0, 0, 0), SHADOW_FIT.dir, _sfU);
  _sfI.copy(_sfR).invert();
  _sfC.applyMatrix4(_sfI);
  _sfC.x = Math.round(_sfC.x / tx) * tx;
  _sfC.y = Math.round(_sfC.y / tx) * tx;
  _sfC.applyMatrix4(_sfR);
  sun.target.position.copy(_sfC);
  sun.position.copy(_sfC).addScaledVector(SHADOW_FIT.dir, 70);
  SHADOW_FIT.set.copy(sun.position);
  sun.target.updateMatrixWorld();
}
