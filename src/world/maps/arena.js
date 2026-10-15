/* ============ map ============ */
/* floor plates: big panels with seams, inset plates, bolts and a few tinted panels (one tile = 8 m) */
function floorTex() {
  const N = 512;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d");
  x.fillStyle = "#222b31";
  x.fillRect(0, 0, N, N);
  const P = N / 4;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const tint = (i * 7 + j * 3) % 5;
      x.fillStyle = tint === 0 ? "#26343e" : tint === 3 ? "#2b3238" : "#283037";
      x.fillRect(i * P + 3, j * P + 3, P - 6, P - 6);
      /* inset plate or grille */
      if ((i * 5 + j * 3) % 7 === 0) {
        x.fillStyle = "#1f272c";
        x.fillRect(i * P + 22, j * P + 22, P - 44, P - 44);
        x.fillStyle = "#29333a";
        for (let k = 0; k < 6; k++) x.fillRect(i * P + 28, j * P + 30 + k * 12, P - 56, 4);
      } else {
        x.strokeStyle = "rgba(0,0,0,0.35)";
        x.lineWidth = 2;
        x.strokeRect(i * P + 16, j * P + 16, P - 32, P - 32);
      }
      x.fillStyle = "#3a464e";
      for (const [a, b] of [
        [9, 9],
        [P - 9, 9],
        [9, P - 9],
        [P - 9, P - 9],
      ]) {
        x.beginPath();
        x.arc(i * P + a, j * P + b, 2.5, 0, 7);
        x.fill();
      }
    }
  /* seams between the big panels */
  x.fillStyle = "#12171b";
  for (let k = 0; k <= 4; k++) {
    x.fillRect(k * P - 2, 0, 4, N);
    x.fillRect(0, k * P - 2, N, 4);
  }
  /* wear */
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${Math.random() * 0.05})`;
    x.fillRect(Math.random() * N, Math.random() * N, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/* destructible cover: composite crates with a dark frame, ribs and a hazard band */
function crateTex() {
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d");
  x.fillStyle = "#b9c0c4";
  x.fillRect(0, 0, N, N);
  x.fillStyle = "#a6aeb3";
  for (let k = 0; k < 5; k++) x.fillRect(30 + k * 44, 24, 18, N - 48);
  x.fillStyle = "#e0862c";
  x.fillRect(0, 168, N, 22);
  x.fillStyle = "#2a2f33";
  for (let k = -2; k < 14; k++) {
    x.beginPath();
    x.moveTo(k * 22, 190);
    x.lineTo(k * 22 + 11, 190);
    x.lineTo(k * 22 + 22, 168);
    x.lineTo(k * 22 + 11, 168);
    x.fill();
  }
  x.strokeStyle = "#3b4246";
  x.lineWidth = 12;
  x.strokeRect(6, 6, N - 12, N - 12);
  x.fillStyle = "#59636a";
  x.fillRect(20, 40, 46, 8);
  x.fillRect(20, 54, 30, 8);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    x.fillRect(Math.random() * N, Math.random() * N, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const MATS = {
  floor: new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.78, metalness: 0.25 }),
  wall: new THREE.MeshStandardMaterial({ color: "#5d6a78", roughness: 0.72, metalness: 0.3 }),
  core: new THREE.MeshStandardMaterial({ color: "#4f6b78", roughness: 0.55, metalness: 0.45 }),
  base: new THREE.MeshStandardMaterial({ color: "#626780", roughness: 0.66, metalness: 0.3 }),
  cover: new THREE.MeshStandardMaterial({
    map: crateTex(),
    color: "#9aa2a8",
    roughness: 0.62,
    metalness: 0.1,
  }),
  step: new THREE.MeshStandardMaterial({ color: "#5c6974", roughness: 0.75, metalness: 0.25 }),
  strip: new THREE.MeshBasicMaterial({ color: "#ffb347" }),
  stripB: new THREE.MeshBasicMaterial({ color: "#62cdff" }),
  /* team materials (capture the flag) */
  redStrip: new THREE.MeshBasicMaterial({ color: "#ff6a5c" }),
  blueStrip: new THREE.MeshBasicMaterial({ color: "#5aa9ff" }),
  redBase: new THREE.MeshStandardMaterial({ color: "#6e4645", roughness: 0.66, metalness: 0.3 }),
  blueBase: new THREE.MeshStandardMaterial({ color: "#3f5876", roughness: 0.66, metalness: 0.3 }),
};
for (const k of ["wall", "core", "base", "step", "redBase", "blueBase"]) detailMat(MATS[k]);
MATS.floor.userData.rough = 0.78;
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
  /* any other attribute every piece has (baked light) is copied as it is */
  const g0 = items[0][0].attributes;
  for (const k in g0) {
    if (k === "position" || k === "normal" || k === "uv" || !items.every(([g]) => g.attributes[k])) continue;
    const arr = new Float32Array(nv * g0[k].itemSize);
    let o = 0;
    for (const [g] of items) {
      arr.set(g.attributes[k].array, o);
      o += g.attributes[k].array.length;
    }
    out.setAttribute(k, new THREE.BufferAttribute(arr, g0[k].itemSize));
  }
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
  /* the sci-fi dressing (world/dress.js; the simulation worker builds bare maps) */
  if (typeof dressMap === "function") dressMap(doc, SOLID);
  /* light baked into the geometry (world/bake.js; engine only) */
  if (typeof bakePrep === "function") bakePrep(group, SOLID, doc);
  mergeMapGroup(group);
  if (typeof bakeLight === "function") bakeLight(group, SOLID);
  /* blast gates last: they move, so they are neither baked nor merged (world/gates.js) */
  buildGates(doc, group);
  const solids = SOLID.splice(0);
  SOLID.push(...saved);
  MAPG = prev;
  return { solids, byId };
}
SOLID.push(...buildMap(MAPS.arena, ARENA_G).solids);
const SPAWNS = MAPS.arena.spawns.ffa;
