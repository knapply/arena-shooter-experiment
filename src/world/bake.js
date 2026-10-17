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
/** cb > 0 chamfers the top and vertical edges: faces stop cb short of them and 45-degree strips (with a
    small triangle at each top corner) join them, so edges catch the light (and read as worn metal).
    Faces pressed against a solid (trim on a wall, a box against its neighbour) are left out. */
function bakeBoxGeo(m, cell, keepBottom, cb = 0, solids = []) {
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
    /* hidden: a side or bottom covered by solids all across (trim against a wall, a box against its
       neighbour); tops and floors always stay */
    if (ny <= 0 && m.material !== MATS.floor && faceHidden(c, nx, ny, nz, h, hx, hy, hz, solids)) continue;
    /* A along the face's u axis (x on floors, the horizontal tangent on walls), B = n x A */
    const ax = ny ? 1 : -nz,
      az = ny ? 0 : nx;
    const bx = ny * az,
      by = nz * ax - nx * az,
      bz = -ny * ax;
    let la = ny ? hx : nx ? hz : hx,
      lb = ny ? hz : hy;
    if (ny > 0) {
      la -= cb;
      lb -= cb;
    } else if (!ny) {
      la -= cb;
      lb -= cb / 2;
    }
    const ox = c.x + nx * h - ax * la - bx * lb,
      oy = c.y + ny * h - by * lb - (ny ? 0 : cb / 2),
      oz = c.z + nz * h - az * la - bz * lb;
    const sa = Math.max(1, Math.min(40, Math.ceil((la * 2) / cell))),
      sb = Math.max(1, Math.min(40, Math.ceil((lb * 2) / (ny ? cell : 7))));
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
  /* the chamfers: a polygon with its outward normal; uv and edge (the shader's face frame) as for faces */
  const poly = (vs, n) => {
    const top = Math.abs(n[1]) > 0.5,
      U = v => (top ? v[0] : -n[2] * v[0] + n[0] * v[2]),
      V = v => (top ? v[2] : v[1]);
    const us = vs.map(U),
      ws = vs.map(V);
    const base = pos.length / 3;
    for (const v of vs) {
      pos.push(v[0], v[1], v[2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(U(v) / uvS, (top ? -v[2] : v[1]) / uvS);
      edge.push(Math.min(...us), Math.max(...us), Math.min(...ws), Math.max(...ws));
    }
    const e1 = vs[1].map((x, i) => x - vs[0][i]),
      e2 = vs[2].map((x, i) => x - vs[0][i]);
    const out =
      (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] +
      (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] +
      (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
    for (let i = 1; i < vs.length - 1; i++)
      if (out > 0) idx.push(base, base + i, base + i + 1);
      else idx.push(base, base + i + 1, base + i);
  };
  if (cb > 0) {
    const k = Math.SQRT1_2,
      k3 = 1 / Math.sqrt(3),
      y0 = c.y - hy,
      yo = c.y + hy - cb,
      yi = c.y + hy;
    /* along each top edge */
    for (const [nx, nz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const tx = -nz,
        tz = nx,
        hn = nx ? hx : hz,
        la = (nx ? hz : hx) - cb;
      poly(
        [
          [c.x + nx * hn - tx * la, yo, c.z + nz * hn - tz * la],
          [c.x + nx * hn + tx * la, yo, c.z + nz * hn + tz * la],
          [c.x + nx * (hn - cb) + tx * la, yi, c.z + nz * (hn - cb) + tz * la],
          [c.x + nx * (hn - cb) - tx * la, yi, c.z + nz * (hn - cb) - tz * la],
        ],
        [nx * k, k, nz * k]
      );
    }
    /* down each vertical edge, and the corner where three chamfers meet */
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const ax = c.x + sx * hx,
        az = c.z + sz * (hz - cb),
        bx = c.x + sx * (hx - cb),
        bz = c.z + sz * hz;
      poly(
        [
          [ax, y0, az],
          [bx, y0, bz],
          [bx, yo, bz],
          [ax, yo, az],
        ],
        [sx * k, 0, sz * k]
      );
      poly(
        [
          [ax, yo, az],
          [bx, yo, bz],
          [bx, yi, az],
        ],
        [sx * k3, k3, sz * k3]
      );
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
/** is a box face covered by solids, judged at nine points across it (corners, edge middles, centre)
    just outside it */
function faceHidden(c, nx, ny, nz, h, hx, hy, hz, solids) {
  if (!solids.length) return false;
  const ta = ny ? [1, 0, 0] : [-nz, 0, nx],
    tb = ny ? [0, 0, 1] : [0, 1, 0],
    ea = (ny ? hx : nx ? hz : hx) - 0.02,
    eb = (ny ? hz : hy) - 0.02;
  for (let k = 0; k < 9; k++) {
    const sa = (k % 3) - 1,
      sb = Math.floor(k / 3) - 1;
    const x = c.x + nx * (h + 0.02) + ta[0] * ea * sa + tb[0] * eb * sb,
      y = c.y + ny * (h + 0.02) + ta[1] * ea * sa + tb[1] * eb * sb,
      z = c.z + nz * (h + 0.02) + ta[2] * ea * sa + tb[2] * eb * sb;
    if (!solids.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1)) return false;
  }
  return true;
}
/* structure gets chamfered edges (not floors, steps, trim or cover: steps are many small boxes); a box with something standing on
   it keeps a square top, so stacked pieces still meet flush */
const CHAMFER_MATS = ["wall", "core", "base", "redBase", "blueBase"];
function chamferOf(m, solids) {
  const P = m.geometry.parameters;
  if (!P || !CHAMFER_MATS.some(k => MATS[k] === m.material)) return 0;
  const hx = (P.width * m.scale.x) / 2,
    hy = (P.height * m.scale.y) / 2,
    hz = (P.depth * m.scale.z) / 2,
    c = m.position,
    top = c.y + hy;
  const cb = Math.min(0.12, Math.max(0.035, Math.min(hx, hz, hy) * 0.12));
  if (Math.min(hx, hz) < cb * 2 + 0.1) return 0;
  const covered = solids.some(
    b =>
      Math.abs(b.y0 - top) < 0.03 &&
      b.x0 < c.x + hx - 0.01 &&
      b.x1 > c.x - hx + 0.01 &&
      b.z0 < c.z + hz - 0.01 &&
      b.z1 > c.z - hz + 0.01
  );
  return covered ? 0 : cb;
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
    if (!mat.isMeshStandardMaterial || destr.has(m) || mat.userData.detail) continue;
    m.updateMatrix();
    const isFloor = mat === MATS.floor;
    /* bottoms resting on a floor are never seen */
    const y0 = m.position.y - (m.geometry.parameters ? (m.geometry.parameters.height * m.scale.y) / 2 : 0);
    const keepBottom = !isFloor && !floorTop.has(Math.round(y0 * 20)) && y0 > 0.05;
    const g = bakeBoxGeo(m, isFloor ? 5 : 8, keepBottom, chamferOf(m, solids), solids);
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
  lightCones(group, solids);
  BAKE.lights = [];
}

/* ---- light cones: under each light strip on a wall, a soft sheet of light falling and spreading to the
   floor, drawn into the air (additive, brightest at the strip, fading toward the floor, the ends and when
   seen edge-on). One mesh per map; shown with the Haze setting, as strong as the map's look says
   (LIGHT_CONE_K, set by render/pipeline.js). ---- */
const LIGHT_CONE_K = { value: 0 };
const LIGHT_CONE_MAT = new THREE.ShaderMaterial({
  uniforms: { uK: LIGHT_CONE_K },
  vertexShader: `attribute vec3 color;varying vec3 vC;varying vec2 vUv;varying float vF;
void main(){vC=color;vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vec3 n=normalize(mat3(modelMatrix)*normal);
vF=abs(dot(n,normalize(cameraPosition-w.xyz)));gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: `uniform float uK;varying vec3 vC;varying vec2 vUv;varying float vF;
void main(){float a=pow(1.-vUv.y,1.6)*pow(sin(3.14159*vUv.x),.6)*smoothstep(0.,.5,vF);
gl_FragColor=vec4(vC*a*uK*.065,1.);}`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
function lightCones(group, solids) {
  const items = [];
  const inside = (x, y, z) =>
    solids.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1);
  for (const l of BAKE.lights) {
    const [x, y, z] = l.p;
    if (l.ax === 1 || y < 1 || y > 5 || l.half < 0.4) continue;
    /* the wall it is on: the side of the strip that is inside a solid */
    const px = l.ax === 0 ? 0 : 1,
      pz = l.ax === 0 ? 1 : 0;
    const a = inside(x + px * 0.25, y, z + pz * 0.25),
      b = inside(x - px * 0.25, y, z - pz * 0.25);
    if (a === b) continue;
    const nx = a ? -px : px,
      nz = a ? -pz : pz;
    const drop = Math.min(y, 2.6),
      out = drop * 0.75,
      tx = l.ax === 0 ? 1 : 0,
      tz = l.ax === 0 ? 0 : 1,
      h0 = l.half,
      h1 = l.half + out * 0.5;
    const g = new THREE.BufferGeometry();
    const v = [
      [x + nx * 0.06 - tx * h0, y, z + nz * 0.06 - tz * h0],
      [x + nx * 0.06 + tx * h0, y, z + nz * 0.06 + tz * h0],
      [x + nx * out - tx * h1, y - drop, z + nz * out - tz * h1],
      [x + nx * out + tx * h1, y - drop, z + nz * out + tz * h1],
    ];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v.flat(), 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    const n = new THREE.Vector3(v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2])
      .cross(new THREE.Vector3(v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]))
      .normalize();
    g.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        [0, 1, 2, 3].flatMap(() => n.toArray()),
        3
      )
    );
    g.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        [0, 1, 2, 3].flatMap(() => l.c),
        3
      )
    );
    g.setIndex([0, 2, 1, 1, 2, 3]);
    items.push([g, new THREE.Matrix4()]);
  }
  if (!items.length) return;
  const m = new THREE.Mesh(mergeGeos(items), LIGHT_CONE_MAT);
  m.frustumCulled = false;
  m.renderOrder = 3;
  group.add(m);
  MAP_GROUPS[MAP_GROUPS.length - 1].cones = m;
  for (const [g] of items) g.dispose();
}
