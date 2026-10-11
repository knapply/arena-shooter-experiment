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
};
for (const k of ["wall", "core", "base", "cover", "step"]) detailMat(MATS[k]);
MATS.floor.userData.rough = 0.92;
MATS.floor.userData.envK = 0.3;
MATS.wall.userData.envK = 0.6;
MATS.strip.color.multiplyScalar(2.4);
MATS.stripB.color.multiplyScalar(2.4);
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
box(0, -1, 0, 84, 1, 84, "floor");
box(0, 0, -37, 76, 7, 2, "wall");
box(0, 0, 37, 76, 7, 2, "wall");
box(-37, 0, 0, 2, 7, 76, "wall");
box(37, 0, 0, 2, 7, 76, "wall");
box(0, 0, 0, 10, 3.2, 10, "core");
strip(0, 3.2, -4.95, 10, 0.1);
strip(0, 3.2, 4.95, 10, 0.1);
box(0, 3.2, 0, 1.4, 1.3, 1.4, "cover");
stairs(0, 5, 0, 1, 8, 3.2, 3);
stairs(0, -5, 0, -1, 8, 3.2, 3);
box(6.6, 0, 0, 3.2, 5.2, 3.2, "base");
box(-6.6, 0, 0, 3.2, 5.2, 3.2, "base");
strip(6.6, 5.2, 0, 3.2, 3.2, "stripB");
strip(-6.6, 5.2, 0, 3.2, 3.2, "stripB");
[
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
].forEach(([sx, sz]) => {
  box(24 * sx, 0, 24 * sz, 10, 2.6, 10, "base");
  box(24 * sx + 3.6 * sx, 2.6, 24 * sz + 3.6 * sz, 2.8, 1.2, 2.8, "cover");
  stairs(24 * sx - 5 * sx, 24 * sz, -sx, 0, 6, 2.6, 3);
  strip(24 * sx - 4.95 * sx, 2.6, 24 * sz, 0.1, 10);
});
box(0, 0, 18, 7, 2.5, 2, "cover");
box(0, 0, -18, 7, 2.5, 2, "cover");
box(18, 0, 0, 2, 2.5, 7, "cover");
box(-18, 0, 0, 2, 2.5, 7, "cover");
[
  [13, 13],
  [-13, 13],
  [13, -13],
  [-13, -13],
].forEach(([x, z]) => {
  box(x, 0, z, 4, 1.3, 1.2, "cover");
  box(x + (x > 0 ? 2.5 : -2.5), 0, z + (z > 0 ? -2 : 2), 1.2, 1.3, 3, "cover");
});
box(29, 0, 0, 3, 6, 3, "wall");
box(-29, 0, 0, 3, 6, 3, "wall");
box(0, 0, 29, 3, 6, 3, "wall");
box(0, 0, -29, 3, 6, 3, "wall");
box(10, 0, -34.5, 10, 2.4, 3, "base");
box(-10, 0, 34.5, 10, 2.4, 3, "base");
box(34.5, 0, 10, 3, 2.4, 10, "base");
box(-34.5, 0, -10, 3, 2.4, 10, "base");
const SPAWNS = [
  [24, 2.6, 24],
  [-24, 2.6, -24],
  [24, 2.6, -24],
  [-24, 2.6, 24],
  [0, 0, 22],
  [0, 0, -22],
  [22, 0, 0],
  [-22, 0, 0],
  [0, 3.2, 2],
  [10, 0, -30],
  [-10, 0, 30],
];
