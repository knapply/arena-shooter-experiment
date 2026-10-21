/* ============ MAP ENVIRONMENT: reflections and ambient light taken from the map itself ============
   The first time a map is shown (at idle, a couple of frames later), the scene is captured from the
   middle of the map, 2.5 m up, with only the map, the sky and the lights showing:
   - into a PMREM environment map (what metal and wet floors reflect, and the diffuse light that comes
     with environment lighting), so reflections show this map's walls, strips and sky instead of a
     generic gradient;
   - into a small cube read back once and projected onto nine spherical harmonics: a LightProbe that
     lights everything with the map's own colors (the floor's bounce, the strips' glow, the sky) where
     environment lighting is off (Low, Medium). The hemisphere light keeps part of the ambient, so
     direction still reads.
   Each map keeps its capture; switching maps swaps them. */
/* the probe is always in the scene (dark until used), so turning it on never changes the light count */
const MAP_ENV = { probe: new THREE.LightProbe(undefined, 0), busy: false, cur: null };
scene.add(MAP_ENV.probe);
const _meV = new THREE.Vector3();
/** the hemisphere light's share of ambient while a probe lights the scene */
const PROBE_HEMI = 0.7,
  PROBE_K = 1.6;
function mapEnvCapture(entry) {
  if (entry.env || MAP_ENV.busy) return;
  MAP_ENV.busy = true;
  /* the capture renders in a state of its own (a half-float target, its own camera and clears), so the
     first one on a map compiled a set of programs right there, half a second in a match's opening. A
     dry run first hands exactly those programs to the driver's threads (every draw it would make becomes
     a compileAsync), and the capture itself waits until they are ready */
  const run = dry => {
    if (entry.env || !entry.g.visible) return null;
    /* only the map, the sky and the lights */
    const hidden = [];
    for (const o of scene.children)
      if (o !== entry.g && !o.isLight && !o.userData.sky && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    /* a look can dim its sky in the capture, so a bright cloud deck doesn't flood glossy floors */
    const L = MAP_LOOK[entry.id],
      dim = (L && L.envSky) || 1;
    skyTint.multiplyScalar(dim);
    const box = new THREE.Box3().setFromObject(entry.g);
    const at = box.getCenter(_meV).setY(Math.max(box.min.y, 0) + 2.5);
    let waits = null;
    try {
      if (dry) {
        const real = renderer.render;
        waits = [];
        renderer.render = (sc, cam) => waits.push(renderer.compileAsync(sc, cam).catch(() => {}));
        try {
          pmrem().fromScene(scene, 0.02, 0.1, 160, { size: 128, position: at }).dispose();
        } finally {
          renderer.render = real;
        }
      } else {
        entry.env = pmrem().fromScene(scene, 0.02, 0.1, 160, { size: 128, position: at }).texture;
        entry.sh = mapSH(at);
      }
    } catch (e) {
      if (!dry) {
        entry.env = GFX.env || null;
        entry.sh = null;
      }
    }
    for (const o of hidden) o.visible = true;
    skyTint.divideScalar(dim);
    if (!dry) MAP_ENV.cur = null;
    return waits && Promise.all(waits);
  };
  const go = () => {
    MAP_ENV.busy = false;
    run(false);
  };
  const idle = /** @type {any} */ (window).requestIdleCallback;
  const later = () => (idle ? idle(go, { timeout: 800 }) : setTimeout(go, 0));
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      let warm = null;
      if (renderer.compileAsync)
        try {
          warm = run(true);
        } catch (e) {
          warm = null;
        }
      if (warm) warm.then(later, later);
      else later();
    })
  );
}
/** nine SH coefficients of the light around a point: a 16 px cube, read back, projected (as three's
    LightProbeGenerator does) */
function mapSH(at) {
  const N = 16,
    rt = new THREE.WebGLCubeRenderTarget(N, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.1, 160, rt);
  cam.position.copy(at);
  cam.update(renderer, scene);
  const sh = new THREE.SphericalHarmonics3(),
    buf = new Uint16Array(N * N * 4),
    col = new THREE.Color(),
    dir = new THREE.Vector3(),
    basis = new Array(9).fill(0);
  const half = THREE.DataUtils.fromHalfFloat;
  let total = 0;
  for (let f = 0; f < 6; f++) {
    renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf, f);
    for (let i = 0; i < N * N; i++) {
      const u = (((i % N) + 0.5) / N) * 2 - 1,
        v = 1 - ((Math.floor(i / N) + 0.5) / N) * 2;
      /* the cube face's direction for this texel (three's cube camera layout) */
      if (f === 0) dir.set(1, v, -u);
      else if (f === 1) dir.set(-1, v, u);
      else if (f === 2) dir.set(u, 1, -v);
      else if (f === 3) dir.set(u, -1, v);
      else if (f === 4) dir.set(u, v, 1);
      else dir.set(-u, v, -1);
      const len = dir.length(),
        w = 4 / (len * len * len);
      total += w;
      dir.divideScalar(len);
      col.setRGB(half(buf[i * 4]), half(buf[i * 4 + 1]), half(buf[i * 4 + 2]));
      THREE.SphericalHarmonics3.getBasisAt(dir, basis);
      for (let k = 0; k < 9; k++) {
        sh.coefficients[k].x += basis[k] * col.r * w;
        sh.coefficients[k].y += basis[k] * col.g * w;
        sh.coefficients[k].z += basis[k] * col.b * w;
      }
    }
  }
  const norm = (4 * Math.PI) / total;
  for (const c of sh.coefficients) c.multiplyScalar(norm);
  rt.dispose();
  return sh;
}
/** each frame: the showing map's capture in use (or asked for), the probe on while environment lighting
    is off */
function mapEnvFrame(entry) {
  if (!entry) return;
  if (!entry.env) mapEnvCapture(entry);
  const on = SET.reflections !== "off";
  const key = entry.id + (entry.env ? "e" : "") + (on ? "r" : "") + LOOK_NOW.id;
  if (key === MAP_ENV.cur) return;
  MAP_ENV.cur = key;
  if (on && entry.env) scene.environment = entry.env;
  const useProbe = !on && !!entry.sh;
  if (useProbe) MAP_ENV.probe.sh.copy(entry.sh);
  MAP_ENV.probe.intensity = useProbe ? PROBE_K : 0;
  LOOK_NOW.hemiShare = useProbe ? PROBE_HEMI : 1;
}
