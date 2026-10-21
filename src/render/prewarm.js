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
const PREWARM = { frames: 0, step: 0, clones: null };
const PREWARM_AT = new THREE.Vector3(0, -500, 0);
/** spawn one of each pooled effect far below the map; returns the function that takes them away */
function prewarmSpawn() {
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
  return () => prewarmClear(nades, rk, pod, dec, nFx);
}
function prewarmClear(nades, rk, pod, dec, nFx) {
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
function prewarmEffects() {
  const clear = prewarmSpawn();
  prewarmCompile();
  clear();
}
/* a compiled program can still stall the first frame that draws with it: some drivers (ANGLE on
   Windows) finish a shader for the vertex layout and render target it is first drawn with. So, a
   second later, one extra frame is drawn with every hidden object shown and nothing culled, the
   effects spawned again, and then taken away; the real frame draws over it before it is ever seen */
function prewarmDraw() {
  const clear = prewarmSpawn();
  const shown = [],
    culled = [];
  scene.traverse(o => {
    if (!o.visible) {
      o.visible = true;
      shown.push(o);
    }
    if (o.frustumCulled) {
      o.frustumCulled = false;
      culled.push(o);
    }
  });
  try {
    renderFrame();
  } finally {
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    clear();
  }
}
/* the first time the browser paints the HUD and the drop pod's overlays (gradients, masks, shadows) it
   compiles what it draws them with, a stall of a tenth of a second or more on the frame a pod drop
   starts. Behind the menu, faintly, for a few frames each, both show (the pod view from outside, then
   from inside), so that is paid here */
const PV_STATES = [
  { cls: "outside", vars: { "--speed": "1" } },
  { cls: "", vars: { "--heat": "1", "--retro": "1" } },
];
/* (copies of them, added after everything else and taken away again: the game's own elements are never
   touched, and their ids still find the originals first) */
function prewarmOverlays(i) {
  if (!PREWARM.clones) {
    const pv = $("podView"),
      hud = $("hud");
    if (!pv || !hud) return;
    PREWARM.clones = [hud, pv].map(el => {
      const c = /** @type {HTMLElement} */ (el.cloneNode(true));
      c.hidden = false;
      c.setAttribute("aria-hidden", "true");
      c.style.opacity = "0.01";
      c.style.zIndex = "99";
      c.style.pointerEvents = "none";
      document.body.appendChild(c);
      return c;
    });
  }
  const pv = PREWARM.clones[1];
  if (i < PV_STATES.length && !playing) {
    pv.className = PV_STATES[i].cls;
    for (const k in PV_STATES[i].vars) pv.style.setProperty(k, PV_STATES[i].vars[k]);
  } else {
    for (const c of PREWARM.clones) c.remove();
    PREWARM.clones = [];
  }
}
function updPrewarm() {
  /* after the environment capture, which changes every lit material's program */
  if (PREWARM.step > 5 || GFX.envWait || ++PREWARM.frames < 20) return;
  /* (the draw waits a second, for the driver to finish what compileAsync handed it; the overlays
     hold for a few frames each, and go at once if a match starts) */
  if (PREWARM.step === 2 && PREWARM.frames < 80) return;
  if (PREWARM.step > 2 && PREWARM.frames < 80 + (PREWARM.step - 2) * 6 && !playing) return;
  try {
    if (PREWARM.step === 0) prewarmCompile();
    else if (PREWARM.step === 1) prewarmEffects();
    else if (PREWARM.step === 2) prewarmDraw();
    else prewarmOverlays(PREWARM.step - 3);
  } catch (e) {}
  PREWARM.step++;
}
onFrame(updPrewarm, { menu: true, full: true });
