/* ============ BAKE: light worked into a map's geometry once, when it is built ============
   Runs inside buildMap (engine only; the simulation worker has no bakePrep/bakeLight).
   - bakePrep rebuilds every static box as world-space faces on a coarse grid (floors 2.5 m, the
     rest 4 m, hidden bottoms dropped), with an `edge` attribute holding each face's extent along
     the axes the surface shader uses (so it can find panel edges and the foot of a wall), and
     collects the map's light strips.
   - bakeLight writes a `bake` attribute per vertex: rgb = light bounced from nearby strips, a =
     ambient occlusion from short rays against the map's solid boxes. The surface shader
     (render/surfaces.js) darkens ambient light by it and adds the bounce, so it costs nothing per
     frame and works on every preset.
   A map remembers its id per group (MAP_GROUPS) so the pipeline can grade each map its own way. */
const MAP_GROUPS = [];
const BAKE = { lights: [], rays: null };
const AO_R = 4,
  BOUNCE_R = 4.5;
/* twelve cosine-weighted directions on the +z hemisphere (a golden-angle spiral) */
BAKE.rays = Array.from({ length: 12 }, (_, i) => {
  const u = (i + 0.5) / 12,
    r = Math.sqrt(u),
    a = i * 2.39996;
  return [r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - u)];
});
/** a box as a grid of world-space faces; returns null for boxes that aren't axis-aligned boxes */
function bakeBoxGeo(m, cell, keepBottom) {
  const P = m.geometry.parameters;
  if (!P || m.geometry.type !== "BoxGeometry" || m.rotation.x || m.rotation.y || m.rotation.z) return null;
  const sc = m.scale,
    c = m.position;
  const hx = (P.width * sc.x) / 2,
    hy = (P.height * sc.y) / 2,
    hz = (P.depth * sc.z) / 2;
  const pos = [],
    nor = [],
    uv = [],
    edge = [],
    idx = [];
  const uvS = m.material === MATS.floor ? 8 : 2.5;
  const faces = [
    [0, 1, 0, hy],
    [0, -1, 0, hy],
    [1, 0, 0, hx],
    [-1, 0, 0, hx],
    [0, 0, 1, hz],
    [0, 0, -1, hz],
  ];
  for (const [nx, ny, nz, h] of faces) {
    if (ny < 0 && !keepBottom) continue;
    /* A along the face's u axis (x on floors, the horizontal tangent on walls), B = n x A */
    const ax = ny ? 1 : -nz,
      az = ny ? 0 : nx;
    const bx = ny * az,
      by = nz * ax - nx * az,
      bz = -ny * ax;
    const la = ny ? hx : nx ? hz : hx,
      lb = ny ? hz : hy;
    const ox = c.x + nx * h - ax * la - bx * lb,
      oy = c.y + ny * h - by * lb,
      oz = c.z + nz * h - az * la - bz * lb;
    const sa = Math.max(1, Math.min(40, Math.ceil((la * 2) / cell))),
      sb = Math.max(1, Math.min(40, Math.ceil((lb * 2) / (ny ? cell : 6))));
    /* the face's extent in the shader's frame: u = x (floors) or dot(p, (-nz, 0, nx)); v = z or y */
    const U = (x, z) => (ny ? x : -nz * x + nx * z),
      V = (y, z) => (ny ? z : y);
    const cs = [
      [ox, oy, oz],
      [ox + ax * la * 2 + bx * lb * 2, oy + by * lb * 2, oz + az * la * 2 + bz * lb * 2],
    ];
    const u0 = Math.min(U(cs[0][0], cs[0][2]), U(cs[1][0], cs[1][2])),
      u1 = Math.max(U(cs[0][0], cs[0][2]), U(cs[1][0], cs[1][2])),
      v0 = Math.min(V(cs[0][1], cs[0][2]), V(cs[1][1], cs[1][2])),
      v1 = Math.max(V(cs[0][1], cs[0][2]), V(cs[1][1], cs[1][2]));
    const base = pos.length / 3;
    for (let j = 0; j <= sb; j++)
      for (let i = 0; i <= sa; i++) {
        const fa = (i / sa) * la * 2,
          fb = (j / sb) * lb * 2;
        const x = ox + ax * fa + bx * fb,
          y = oy + by * fb,
          z = oz + az * fa + bz * fb;
        pos.push(x, y, z);
        nor.push(nx, ny, nz);
        uv.push(U(x, z) / uvS, (ny ? -z : y) / uvS);
        edge.push(u0, u1, v0, v1);
      }
    for (let j = 0; j < sb; j++)
      for (let i = 0; i < sa; i++) {
        const a = base + j * (sa + 1) + i,
          b = a + 1,
          d = a + sa + 1,
          e = d + 1;
        idx.push(a, b, e, a, e, d);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("edge", new THREE.Float32BufferAttribute(edge, 4));
  g.setIndex(idx);
  return g;
}
/** before merging: world-space gridded faces for static boxes, and the strips that light them */
function bakePrep(group, solids, doc) {
  MAP_GROUPS.push({ g: group, id: doc.id, mark: bakeMarkings(doc, solids) });
  const destr = new Set(DESTR.all.map(b => b.mesh));
  const floorTop = new Set(solids.filter(b => b.mat === "floor").map(b => Math.round(b.y1 * 20)));
  BAKE.lights = [];
  for (const m of group.children) {
    if (!m.isMesh) continue;
    const mat = m.material;
    if (mat.isMeshBasicMaterial && !mat.transparent && mat.color && !mat.userData.detail) {
      const col = mat.color;
      if (col.r + col.g + col.b < 2) continue;
      const P = m.geometry.parameters;
      if (!P) continue;
      const w = P.width * m.scale.x,
        h = P.height * m.scale.y,
        d = P.depth * m.scale.z;
      const p = m.position;
      /* a strip is a light along its longest axis */
      const ax = w >= d && w >= h ? 0 : d >= h ? 2 : 1;
      const half = [w, h, d][ax] / 2;
      BAKE.lights.push({
        p: [p.x, p.y, p.z],
        ax,
        half,
        c: [col.r, col.g, col.b],
        k: Math.min(1.6, 0.25 + half * 0.35) * (w * h * d < 0.01 ? 0.6 : 1),
      });
      continue;
    }
    if (!mat.isMeshStandardMaterial || destr.has(m)) continue;
    m.updateMatrix();
    const isFloor = mat === MATS.floor;
    /* bottoms resting on a floor are never seen */
    const y0 = m.position.y - (m.geometry.parameters ? (m.geometry.parameters.height * m.scale.y) / 2 : 0);
    const keepBottom = !isFloor && !floorTop.has(Math.round(y0 * 20)) && y0 > 0.05;
    const g = bakeBoxGeo(m, isFloor ? 3 : 5.5, keepBottom);
    if (!g) continue;
    m.geometry.dispose();
    m.geometry = g;
    m.position.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.updateMatrix();
  }
  for (const m of group.children)
    if (
      m.isMesh &&
      m.material.isMeshStandardMaterial &&
      m.material !== MATS.cover &&
      !m.material.userData.detail
    )
      surfMat(m.material);
}
/** a broad-phase grid over boxes, 4 m cells, each box listed in every cell within `pad` of it */
function boxGrid(boxes, pad) {
  const G = new Map(),
    S = 4;
  for (const b of boxes)
    for (let i = Math.floor((b.x0 - pad) / S); i <= Math.floor((b.x1 + pad) / S); i++)
      for (let k = Math.floor((b.z0 - pad) / S); k <= Math.floor((b.z1 + pad) / S); k++) {
        const key = i * 4096 + k;
        if (!G.has(key)) G.set(key, []);
        G.get(key).push(b);
      }
  return (x, z) => G.get(Math.floor(x / S) * 4096 + Math.floor(z / S)) || [];
}
/** distance along a ray to the nearest box (or Infinity within tmax) */
function rayBoxes(list, ox, oy, oz, dx, dy, dz, tmax) {
  let best = tmax;
  const ix = 1 / dx,
    iy = 1 / dy,
    iz = 1 / dz;
  for (const b of list) {
    let t0 = (b.x0 - ox) * ix,
      t1 = (b.x1 - ox) * ix;
    let lo = Math.min(t0, t1),
      hi = Math.max(t0, t1);
    t0 = (b.y0 - oy) * iy;
    t1 = (b.y1 - oy) * iy;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    t0 = (b.z0 - oz) * iz;
    t1 = (b.z1 - oz) * iz;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    /* touching a box's surface (a wall's foot on the floor) isn't a hit */
    if (hi > Math.max(lo, 0) + 1e-3 && lo < best) best = Math.max(lo, 0);
  }
  return best;
}
/** after merging: ambient occlusion and strip bounce into each static mesh's `bake` attribute */
function bakeLight(group, solids) {
  const occ = solids.filter(b => b.y1 - b.y0 > 0.05);
  const near = boxGrid(occ, AO_R);
  const L = BAKE.lights;
  const LG = new Map();
  for (const l of L) {
    const r = BOUNCE_R + (l.ax !== 1 ? l.half : 0);
    for (let i = Math.floor((l.p[0] - r) / 4); i <= Math.floor((l.p[0] + r) / 4); i++)
      for (let k = Math.floor((l.p[2] - r) / 4); k <= Math.floor((l.p[2] + r) / 4); k++) {
        const key = i * 4096 + k;
        if (!LG.has(key)) LG.set(key, []);
        LG.get(key).push(l);
      }
  }
  const t1 = new THREE.Vector3(),
    t2 = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (const m of group.children) {
    if (!m.isMesh || !m.material.isMeshStandardMaterial || !m.geometry.attributes.edge) continue;
    const P = m.geometry.attributes.position,
      N = m.geometry.attributes.normal;
    const out = new Float32Array(P.count * 4);
    for (let i = 0; i < P.count; i++) {
      n.fromBufferAttribute(N, i);
      const ox = P.getX(i) + n.x * 0.03,
        oy = P.getY(i) + n.y * 0.03,
        oz = P.getZ(i) + n.z * 0.03;
      const list = near(ox, oz);
      /* a frame around the normal */
      t1.set(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0)
        .cross(n)
        .normalize();
      t2.copy(n).cross(t1);
      let o = 0;
      for (const [a, b, c] of BAKE.rays) {
        const dx = t1.x * a + t2.x * b + n.x * c,
          dy = t1.y * a + t2.y * b + n.y * c,
          dz = t1.z * a + t2.z * b + n.z * c;
        const t = rayBoxes(list, ox, oy, oz, dx, dy, dz, AO_R);
        if (t < AO_R) o += 1 - (t / AO_R) * (t / AO_R);
      }
      const ao = Math.max(0.25, 1 - (o / BAKE.rays.length) * 1.4);
      let r = 0,
        g = 0,
        bl = 0;
      for (const l of LG.get(Math.floor(ox / 4) * 4096 + Math.floor(oz / 4)) || []) {
        /* the closest point on the strip's axis */
        const q = l.p.slice();
        q[l.ax] += Math.max(-l.half, Math.min(l.half, [ox, oy, oz][l.ax] - l.p[l.ax]));
        const lx = q[0] - ox,
          ly = q[1] - oy,
          lz = q[2] - oz;
        const d = Math.hypot(lx, ly, lz);
        if (d > BOUNCE_R || d < 1e-3) continue;
        const ndl = (n.x * lx + n.y * ly + n.z * lz) / d;
        /* wrapped, so a strip also glows on the panel it is mounted on */
        const w = Math.max(0, (ndl + 0.3) / 1.3);
        if (w <= 0) continue;
        if (d > 0.4 && rayBoxes(list, ox, oy, oz, lx / d, ly / d, lz / d, d - 0.25) < d - 0.25) continue;
        const f = (w * l.k * (1 - d / BOUNCE_R) ** 2) / (0.35 + d * d * 0.45);
        r += l.c[0] * f;
        g += l.c[1] * f;
        bl += l.c[2] * f;
      }
      /* bright enough to tint, never enough to look lit from inside */
      const s = 0.6 * Math.min(1, 0.7 / Math.max(0.001, Math.max(r, g, bl) * 0.6));
      out[i * 4] = r * s;
      out[i * 4 + 1] = g * s;
      out[i * 4 + 2] = bl * s;
      out[i * 4 + 3] = ao;
    }
    m.geometry.setAttribute("bake", new THREE.BufferAttribute(out, 4));
  }
  BAKE.lights = [];
}
