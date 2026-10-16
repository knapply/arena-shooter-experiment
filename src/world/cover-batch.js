/* ============ COVER BATCH: every destructible box on a map in one draw call ============
   Cover was a mesh per box (two draws each with its shadow): on Twin Foundry that was ~85 of the
   ~280 draws in a busy view. buildMap now hands a map's cover to one BatchedMesh (multi-draw), and
   each box's own mesh stays exactly as world/destruction.js uses it (visible when standing, a
   chipped copy of its geometry as it takes damage, a darker material as it weakens), only taken off
   every render layer. syncCover mirrors those into the batch each frame: visibility, the geometry
   (with every crater carved into it) and the damage tint as the instance's color.
   Engine only (the simulation worker builds bare maps). */
const COVER_BATCHES = [];
const _cvC = new THREE.Color();
/** vertices a box's chipped (subdivided, unshared) geometry needs: see chipGeo in world/destruction.js */
function coverVerts(b) {
  const seg = v => Math.max(2, Math.min(7, Math.round(v / 0.4)));
  const x = seg(b.x1 - b.x0),
    y = seg(b.y1 - b.y0),
    z = seg(b.z1 - b.z0);
  return 6 * 2 * (y * z + x * z + x * y);
}
function batchCover(group) {
  const list = DESTR.all.filter(b => b.mesh && b.mesh.parent === group);
  if (list.length < 2 || !THREE.BatchedMesh) return;
  const mat = list[0].mesh.material;
  if (list.some(b => b.mesh.material !== mat)) return;
  let nv = 0;
  for (const b of list) nv += coverVerts(b);
  const batch = new THREE.BatchedMesh(list.length, nv, 0, mat);
  batch.castShadow = batch.receiveShadow = true;
  const entries = [];
  for (const b of list) {
    const m = b.mesh;
    /* the batch draws non-indexed geometry, as the chipped copies are */
    const base = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const geoId = batch.addGeometry(base, coverVerts(b));
    const id = batch.addInstance(geoId);
    m.updateMatrix();
    batch.setMatrixAt(id, m.matrix);
    batch.setColorAt(id, _cvC.setRGB(1, 1, 1));
    m.layers.disableAll();
    entries.push({ b, m, geoId, id, base, geo: m.geometry, ver: -1, vis: true, tint: 1 });
  }
  group.add(batch);
  COVER_BATCHES.push({ group, batch, entries });
}
function syncCover() {
  for (const C of COVER_BATCHES) {
    if (!C.group.visible || !C.group.parent) continue;
    const B = C.batch;
    for (const e of C.entries) {
      const m = e.m;
      if (m.visible !== e.vis) B.setVisibleAt(e.id, (e.vis = m.visible));
      const g = m.geometry,
        ver = g.attributes.position.version;
      if (g !== e.geo || (!g.index && ver !== e.ver)) {
        B.setGeometryAt(e.geoId, g.index ? e.base : g);
        e.geo = g;
        e.ver = ver;
      }
      /* the damage tint: the weakened material's color against the box's own */
      const b = e.b,
        k = m.material === b.dmgMat && b.baseMat ? b.dmgMat.color.r / Math.max(1e-4, b.baseMat.color.r) : 1;
      if (Math.abs(k - e.tint) > 1e-3) B.setColorAt(e.id, _cvC.setRGB((e.tint = k), k, k));
    }
  }
}
onFrame(syncCover, { menu: true, full: true });
