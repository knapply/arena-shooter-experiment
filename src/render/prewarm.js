/* ============ PREWARM: compile every shader before it is needed ============
   three.js compiles a material's program the first time something with it is drawn, which stalls that
   frame: the viewmodels on deploy, the first shot, the first grenade or rocket, the first pod. Behind
   the menu, a few frames in and one step per frame, this compiles them ahead:
   1. everything already in the scene, drawn or not (the viewmodels ride hidden on the camera);
   2. one of each pooled effect (tracer, flash, ring, sparks, smoke, shield shards, a dropped mag,
      an explosion with its debris and scorch, a frag, a plasma grenade, a rocket, a drop pod), spawned
      far below the map, compiled, then taken away again.
   Compiling uses the scene's real lights, so the programs match what play will draw. compileAsync
   (KHR_parallel_shader_compile) hands the shaders to the driver's own threads and only checks on them
   later, so the menu doesn't stall either; the objects can go as soon as it is called. */
function prewarmCompile() {
  if (renderer.compileAsync) renderer.compileAsync(scene, camera).catch(() => {});
  else renderer.compile(scene, camera);
}
const PREWARM = { frames: 0, step: 0 };
const PREWARM_AT = new THREE.Vector3(0, -500, 0);
function prewarmEffects() {
  const p = PREWARM_AT,
    q = p.clone().add(new THREE.Vector3(0, 0, -5));
  const dec = { next: decals.next, n: decals.n, vis: decals.mesh.visible };
  const nFx = FX.length;
  tracer(p, q, 0xffd28a);
  tracer(p, q, 0x9fd8ff, 0.6);
  blast(q, 0xffa040, 3);
  shock(q);
  shieldPop(q);
  dropMag(q);
  const nades = ["frag", "plasma"]
    .map(t => MAIN_NADES.throw(t, q, new THREE.Vector3(), null))
    .filter(Boolean);
  const rk = MAIN_ROCKETS.fire(q, new THREE.Vector3(0, 0, -1), null);
  const pod = dropPod(q, "#62cdff", { quiet: true });
  podDraw();
  prewarmCompile();
  /* take it all away again */
  for (const n of nades) {
    if (n.mesh) fxPut(n.key, n.mesh);
    MAIN_NADES.list.splice(MAIN_NADES.list.indexOf(n), 1);
  }
  if (rk) {
    if (rk.mesh) fxPut("rk", rk.mesh);
    MAIN_ROCKETS.list.splice(MAIN_ROCKETS.list.indexOf(rk), 1);
  }
  PODS.splice(PODS.indexOf(pod), 1);
  disposePod(pod);
  podDraw();
  for (let i = FX.length - 1; i >= nFx; i--) fxKill(i);
  ptClearBelow(-400);
  for (const T of [casings, chunks]) T.list = T.list.filter(o => o.p.y > -400);
  CFX.heat = CFX.heat.filter(h => h.p.y > -400);
  for (const l of CFX.lights) if (l.position.y < -400) l.userData.life = l.intensity = 0;
  decals.next = dec.next;
  decals.n = dec.n;
  decals.mesh.count = dec.n;
  decals.mesh.visible = dec.vis;
}
function updPrewarm() {
  /* after the environment capture, which changes every lit material's program */
  if (PREWARM.step > 1 || GFX.envWait || ++PREWARM.frames < 20) return;
  try {
    if (PREWARM.step === 0) prewarmCompile();
    else prewarmEffects();
  } catch (e) {}
  PREWARM.step++;
}
onFrame(updPrewarm, { menu: true, full: true });
