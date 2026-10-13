/* ============ environment: reflections and graphics settings ============
   buildEnv captures a small sky into a PMREM environment map once (metal reflections); applyGfx turns the
   graphics settings (shadows, reflections, draw distance, fog, texture filtering, pixel ratio) into
   renderer and material state; pc() scales particle counts by the Particles setting. */
function buildEnv() {
  if (GFX.env) return GFX.env;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    // vertex-colored sky built from standard materials, so the capture is encoded the way the reflection shader expects
    {
      const g = new THREE.SphereGeometry(50, 32, 16);
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      const C = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
      for (let i = 0; i < p.count; i++) {
        const h = p.getY(i) / 50;
        const t1 = (h + 0.3) / 0.35,
          t2 = (h - 0.1) / 0.7;
        let r = C(0.18, 0.55, t1),
          gg = C(0.15, 0.45, t1),
          b = C(0.13, 0.38, t1);
        r = C(r, 0.12, t2);
        gg = C(gg, 0.17, t2);
        b = C(b, 0.24, t2);
        col[i * 3] = Math.pow(r, 2.2);
        col[i * 3 + 1] = Math.pow(gg, 2.2);
        col[i * 3 + 2] = Math.pow(b, 2.2);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const sunM = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0d8 })
      );
      sunM.material.color.multiplyScalar(3);
      sunM.position.set(0.5, 0.75, 0.3).normalize().multiplyScalar(45);
      es.add(sunM);
    }
    const strip = (c, x, y, z, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(x, y, z);
      m.material.color.multiplyScalar(1.6);
      es.add(m);
    };
    strip(0xffb347, 0, -6, -30, 40, 0.5, 1);
    strip(0x62cdff, 0, -6, 30, 40, 0.5, 1);
    strip(0xffb347, -30, -6, 0, 1, 0.5, 40);
    strip(0x62cdff, 30, -6, 0, 1, 0.5, 40);
    GFX.env = pm.fromScene(es, 0.03).texture;
    pm.dispose();
  } catch (e) {
    GFX.env = null;
  }
  return GFX.env;
}
let lastRefl = null,
  lastShadow = null;
function applyGfx() {
  const refl = SET.reflections;
  if (refl !== lastRefl) {
    lastRefl = refl;
    scene.environment = refl === "off" ? null : buildEnv();
    scene.traverse(o => {
      const m = o.material;
      if (!m || !m.isMeshStandardMaterial) return;
      m.envMapIntensity =
        (refl === "glossy" || refl === "ssr" ? 1.4 : 1) * (m.userData.envK != null ? m.userData.envK : 1);
      if (m.userData.rough != null)
        m.roughness =
          refl === "glossy" || refl === "ssr" ? Math.max(0.25, m.userData.rough - 0.3) : m.userData.rough;
      m.needsUpdate = true;
    });
  }
  const q = SET.shadows;
  if (q !== lastShadow) {
    lastShadow = q;
    const on = q !== "off";
    sun.castShadow = on;
    const size = { low: 512, medium: 1024, high: 2048, ultra: 4096 }[q] || 1024;
    if (on && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    const ty = q === "low" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (renderer.shadowMap.type !== ty) {
      renderer.shadowMap.type = ty;
      recompileAll();
    }
  }
  for (const m of DETAIL_MATS) applyDetail(m);
  const an = Math.min(+SET.aniso, renderer.capabilities.getMaxAnisotropy());
  for (const t of [DETAIL.map, DETAIL.nmap, MATS.floor.map])
    if (t) {
      t.anisotropy = an;
      t.needsUpdate = true;
    }
  scene.fog.near = SET.drawDist * 0.3;
  scene.fog.far = SET.drawDist * 0.85;
  camera.far = SET.drawDist + 60;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
  GFX.lastKey = "";
  resize();
  if (fpsEl) fpsEl.hidden = !SET.fpsCounter;
}
const pc = n => Math.round(n * SET.particles);

function scaleBoxUV(g, w, h, d, s) {
  const uv = g.attributes.uv;
  const D = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * D[f][0]) / s, (uv.getY(i) * D[f][1]) / s);
    }
}
