/* ============ map ============ */
function gridTex(base, line, n) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = line;
  x.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    const p = (i * 256) / n;
    x.beginPath();
    x.moveTo(p, 0);
    x.lineTo(p, 256);
    x.stroke();
    x.beginPath();
    x.moveTo(0, p);
    x.lineTo(256, p);
    x.stroke();
  }
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
const MATS = {
  floor: new THREE.MeshStandardMaterial({ map: gridTex("#2b353b", "#3c4950", 4), roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: "#6b7880", roughness: 0.85 }),
  core: new THREE.MeshStandardMaterial({ color: "#6e7980", roughness: 0.7, metalness: 0.15 }),
  base: new THREE.MeshStandardMaterial({ color: "#646f78", roughness: 0.8, metalness: 0.1 }),
  cover: new THREE.MeshStandardMaterial({ color: "#808b93", roughness: 0.75 }),
  step: new THREE.MeshStandardMaterial({ color: "#69757d", roughness: 0.85 }),
  strip: new THREE.MeshBasicMaterial({ color: "#ffb347" }),
  stripB: new THREE.MeshBasicMaterial({ color: "#62cdff" }),
  /* team materials (capture the flag) */
  redStrip: new THREE.MeshBasicMaterial({ color: "#ff6a5c" }),
  blueStrip: new THREE.MeshBasicMaterial({ color: "#5aa9ff" }),
  redBase: new THREE.MeshStandardMaterial({ color: "#4d3d3c", roughness: 0.8, metalness: 0.1 }),
  blueBase: new THREE.MeshStandardMaterial({ color: "#3a4654", roughness: 0.8, metalness: 0.1 }),
};
for (const k of ["wall", "core", "base", "cover", "step", "redBase", "blueBase"]) detailMat(MATS[k]);
MATS.floor.userData.rough = 0.92;
MATS.floor.userData.envK = 0.3;
MATS.wall.userData.envK = 0.6;
for (const k of ["strip", "stripB", "redStrip", "blueStrip"]) MATS[k].color.multiplyScalar(2.4);
let MAPG = new THREE.Group();
scene.add(MAPG);
const ARENA_G = MAPG;
const SOLID = [];
function box(cx, y0, cz, w, h, d, mat, solid = true) {
  const b = { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 };
  const geo = new THREE.BoxGeometry(w, h, d);
  scaleBoxUV(geo, w, h, d, mat === "floor" ? 8 : 2.5);
  const m = new THREE.Mesh(geo, MATS[mat]);
  m.position.set(cx, y0 + h / 2, cz);
  m.castShadow = mat !== "floor";
  m.receiveShadow = true;
  MAPG.add(m);
  b.id = DESTR.nextId++;
  b.mesh = m;
  b.mat = mat;
  if (isDestructible(b)) DESTR.all.push(b);
  if (solid) SOLID.push(b);
  return b;
}
/** merge [geometry, matrix] pairs into one indexed geometry (positions, normals, and UVs when all have them) */
function mergeGeos(items) {
  let nv = 0,
    ni = 0;
  const uv = items.every(([g]) => !!g.attributes.uv);
  for (const [g] of items) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3),
    nor = new Float32Array(nv * 3),
    uvs = uv ? new Float32Array(nv * 2) : null,
    idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(),
    nm = new THREE.Matrix3();
  let vo = 0,
    io = 0;
  for (const [g, m] of items) {
    nm.getNormalMatrix(m);
    const P = g.attributes.position,
      N = g.attributes.normal,
      U = g.attributes.uv,
      c = P.count;
    for (let i = 0; i < c; i++) {
      const o = (vo + i) * 3;
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos[o] = v.x;
      pos[o + 1] = v.y;
      pos[o + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[o] = v.x;
      nor[o + 1] = v.y;
      nor[o + 2] = v.z;
      if (uvs) {
        uvs[(vo + i) * 2] = U.getX(i);
        uvs[(vo + i) * 2 + 1] = U.getY(i);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < c; i++) idx[io++] = vo + i;
    vo += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (uvs) out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
/* draw-call budget: everything in a map that never changes (floor, walls, steps, trim) is merged into
   one mesh per material once the map is built. Destructible cover keeps its own meshes. */
function mergeMapGroup(group) {
  if (!Array.isArray(group.children)) return;
  const destr = new Set(DESTR.all.map(b => b.mesh));
  const buckets = new Map();
  for (const m of group.children.slice()) {
    if (!m.isMesh || destr.has(m)) continue;
    const k = m.material.uuid + (m.castShadow ? "s" : "");
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(m);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const merged = new THREE.Mesh(
      mergeGeos(
        list.map(m => {
          m.updateMatrix();
          return [m.geometry, m.matrix];
        })
      ),
      list[0].material
    );
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = true;
    for (const m of list) {
      group.remove(m);
      m.geometry.dispose();
    }
    group.add(merged);
  }
}
function strip(cx, y, cz, w, d, mat = "strip") {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), MATS[mat]);
  m.position.set(cx, y + 0.03, cz);
  MAPG.add(m);
}
function stairs(x, z, dx, dz, n, top, width) {
  const rise = top / n,
    depth = 0.72;
  for (let i = 0; i < n; i++) {
    const h = top - i * rise;
    const cx = x + dx * (depth / 2 + i * depth),
      cz = z + dz * (depth / 2 + i * depth);
    box(cx, 0, cz, dx ? depth : width, h, dz ? depth : width, "step");
  }
}
/** build a map document's pieces into a group; returns the collision boxes (the caller decides when
    they become the active world) and the box record of every piece by its stable id */
function buildMap(doc, group) {
  const prev = MAPG,
    saved = SOLID.splice(0);
  MAPG = group;
  /** @type {Map<string, any>} */
  const byId = new Map();
  for (const pc of mapPieces(doc)) {
    if (pc.type === "box") {
      const b = box(pc.p[0] + 0, pc.p[1], pc.p[2] + 0, pc.s[0], pc.s[1], pc.s[2], pc.mat);
      b.pid = pc.id;
      byId.set(pc.id, b);
    } else if (pc.type === "strip") strip(pc.p[0] + 0, pc.p[1], pc.p[2] + 0, pc.s[0], pc.s[1], pc.mat);
    else if (pc.type === "stairs")
      stairs(pc.p[0] + 0, pc.p[1] + 0, pc.dir[0], pc.dir[1], pc.steps, pc.top, pc.width);
  }
  mergeMapGroup(group);
  const solids = SOLID.splice(0);
  SOLID.push(...saved);
  MAPG = prev;
  return { solids, byId };
}
SOLID.push(...buildMap(MAPS.arena, ARENA_G).solids);
const SPAWNS = MAPS.arena.spawns.ffa;
