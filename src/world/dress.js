/* ============ DRESSING: the sci-fi detail on top of a map's blocks ============
   Map documents stay simple (boxes, stairs, strips), and collision only ever sees those. This pass
   adds what makes a block read as built architecture: dark metal caps and kick plates, structural
   ribs, recessed vent panels, light bands and floor guide lights, and soft contact shadows where
   walls meet the floor. Nothing here collides. Everything is merged per material afterwards
   (mergeMapGroup), so a whole map's dressing costs a handful of draw calls.
   Light colors follow zones so a glance tells you where you are, the way callouts work:
   the arena's four quadrants each have their own color; on team maps each half wears its team's
   color with violet through the middle. Placement is seeded by the map id, so it never changes. */
const DRESS_MATS = {
  trim: new THREE.MeshStandardMaterial({ color: "#20272d", roughness: 0.42, metalness: 0.85 }),
  rib: new THREE.MeshStandardMaterial({ color: "#39444d", roughness: 0.55, metalness: 0.6 }),
  vent: new THREE.MeshStandardMaterial({ color: "#151a1f", roughness: 0.7, metalness: 0.4 }),
  ao: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }),
};
DRESS_MATS.trim.userData.envK = 1.2;
DRESS_MATS.rib.userData.envK = 0.9;
/* contact shadow: dark at the wall, fading out over the strip's width */
{
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 64);
  /* canvas top is uv.y = 1 (away from the wall) */
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.65, "rgba(0,0,0,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  DRESS_MATS.ao.map = t;
}
/** the light color for a spot on a map: arena quadrants, or team halves with a neutral middle */
function zoneMat(doc, x, z) {
  if (doc.symmetry === "rotate180") return Math.abs(z) < 12 ? "stripV" : z < 0 ? "redStrip" : "blueStrip";
  return x >= 0 ? (z >= 0 ? "stripB" : "stripG") : z >= 0 ? "stripV" : "strip";
}
function dressMap(doc, solids) {
  if (!MATS.stripV) {
    MATS.stripV = new THREE.MeshBasicMaterial({ color: "#b98cff" });
    MATS.stripG = new THREE.MeshBasicMaterial({ color: "#58f0b4" });
    for (const k of ["stripV", "stripG"]) MATS[k].color.multiplyScalar(2);
  }
  /* seeded so a map always dresses the same way */
  let seed = 0;
  for (const ch of String(doc.id)) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rnd01 = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const B = doc.bounds;
  const cx0 = (B.x0 + B.x1) / 2,
    cz0 = (B.z0 + B.z1) / 2;
  const add = (mat, x, y, z, w, h, d, shadow = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === "string" ? MATS[mat] : mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    MAPG.add(m);
    return m;
  };
  const aoQuads = [],
    faceList = [];
  /* a flat strip on the floor along one edge, uv.y = 0 at the wall */
  const aoEdge = (ax, az, bx, bz, nx, nz, y, wid) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return;
    const g = new THREE.PlaneGeometry(len, wid);
    g.rotateX(-Math.PI / 2);
    /* plane: +y of the uv runs toward -z after the rotation; point it along the normal */
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(-nx, -nz));
    m.setPosition((ax + bx) / 2 + (nx * wid) / 2, y + 0.012, (az + bz) / 2 + (nz * wid) / 2);
    aoQuads.push([g, m]);
  };
  const floors = solids.filter(b => b.mat === "floor");
  const onFloor = b => floors.some(f => Math.abs(f.y1 - b.y0) < 0.05);
  for (const b of solids) {
    if (b.mat === "floor" || isDestructible(b)) continue;
    const w = b.x1 - b.x0,
      h = b.y1 - b.y0,
      d = b.z1 - b.z0;
    const mx = (b.x0 + b.x1) / 2,
      mz = (b.z0 + b.z1) / 2;
    const grounded = onFloor(b);
    if (b.mat === "step") {
      if (grounded && h >= 1) add(DRESS_MATS.trim, mx, b.y1 - 0.08, mz, w + 0.04, 0.1, d + 0.04);
      continue;
    }
    /* cap: a dark metal lip around the top; kick plate around the bottom */
    const lip = 0.05;
    add(DRESS_MATS.trim, mx, b.y1 - 0.14, b.z0 + 0.07, w + lip * 2, 0.16, 0.14 + lip * 2);
    add(DRESS_MATS.trim, mx, b.y1 - 0.14, b.z1 - 0.07, w + lip * 2, 0.16, 0.14 + lip * 2);
    add(DRESS_MATS.trim, b.x0 + 0.07, b.y1 - 0.14, mz, 0.14 + lip * 2, 0.16, d);
    add(DRESS_MATS.trim, b.x1 - 0.07, b.y1 - 0.14, mz, 0.14 + lip * 2, 0.16, d);
    if (grounded && h > 0.9) add(DRESS_MATS.trim, mx, b.y0, mz, w + 0.08, 0.28, d + 0.08);
    /* the four faces: [start, end along the face, outward normal] */
    const faces = [
      { ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, nx: 0, nz: 1 },
      { ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, nx: 0, nz: -1 },
      { ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, nx: 1, nz: 0 },
      { ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, nx: -1, nz: 0 },
    ];
    for (const f of faces) {
      const len = Math.hypot(f.bx - f.ax, f.bz - f.az);
      const fx = (f.ax + f.bx) / 2,
        fz = (f.az + f.bz) / 2;
      /* faces looking out of the map are never seen */
      if (
        (cx0 - fx) * f.nx + (cz0 - fz) * f.nz < -0.5 &&
        (Math.abs(fx) > B.x1 - 3 || Math.abs(fz) > B.z1 - 3)
      )
        continue;
      if (grounded) aoEdge(f.ax, f.az, f.bx, f.bz, f.nx, f.nz, b.y0, Math.min(1.1, 0.35 + h * 0.18));
      faceList.push(Object.assign({ b, len, h }, f));
      const ux = (f.bx - f.ax) / len,
        uz = (f.bz - f.az) / len;
      const at = (s, out) => [f.ax + ux * s + f.nx * out, f.az + uz * s + f.nz * out];
      const sz = (along, deep) => (f.nx ? [deep, along] : [along, deep]);
      const zone = zoneMat(doc, fx, fz);
      /* ribs every ~4 m on long, tall faces, with the light band and vents between them */
      const ribs = len >= 5 && h >= 2.3 ? Math.max(1, Math.round(len / 4)) : 0;
      const bandY = Math.min(h - 0.55, 2.35);
      for (let i = 0; i <= ribs && ribs; i++) {
        const s = (i / ribs) * len;
        if (i > 0 && i < ribs) {
          const [px, pz] = at(s, 0.07);
          const [sx, sz2] = sz(0.34, 0.14);
          add(DRESS_MATS.rib, px, b.y0, pz, sx, h - 0.2, sz2, true);
        }
        if (i === ribs) break;
        const s0 = s + 0.35,
          s1 = ((i + 1) / ribs) * len - 0.35;
        if (s1 - s0 < 0.6) continue;
        const mid = (s0 + s1) / 2;
        if (bandY > 1) {
          const [px, pz] = at(mid, 0.02);
          const [sx, sz2] = sz(s1 - s0, 0.04);
          add(zone, px, b.y0 + bandY, pz, sx, 0.045, sz2);
        }
        if (h >= 4.5 && rnd01() < 0.55) {
          /* a recessed vent panel up high, with a glowing slit */
          const vw = Math.min(s1 - s0 - 0.4, 1.4 + rnd01() * 0.8),
            vy = b.y0 + 3.2 + rnd01() * Math.max(0, h - 4.6);
          const [px, pz] = at(mid, 0.03);
          const [sx, sz2] = sz(vw, 0.06);
          add(DRESS_MATS.vent, px, vy, pz, sx, 0.75, sz2);
          const [qx, qz] = at(mid, 0.065);
          const [tx, tz] = sz(vw * 0.8, 0.02);
          add(zone, qx, vy + 0.18, qz, tx, 0.04, tz);
          add(DRESS_MATS.rib, qx, vy + 0.36, qz, tx, 0.05, tz);
          add(DRESS_MATS.rib, qx, vy + 0.5, qz, tx, 0.05, tz);
        }
      }
      /* short faces: a single light accent instead */
      if (!ribs && len >= 1.4 && h >= 1.6 && bandY > 0.9) {
        const [px, pz] = at(len / 2, 0.02);
        const [sx, sz2] = sz(Math.min(len - 0.5, 2.2), 0.04);
        add(zone, px, b.y0 + bandY, pz, sx, 0.05, sz2);
      }
      /* floor guide lights along the outer walls */
      if (b.mat === "wall" && grounded && len >= 20)
        for (let s = 3; s < len - 2; s += 6) {
          const [px, pz] = at(s, 0.75);
          const [sx, sz2] = sz(0.9, 0.12);
          add(zone, px, b.y0, pz, sx, 0.025, sz2);
        }
    }
  }
  /* pipes, cables, fans, beacons and signs (world/props.js) */
  dressProps(doc, solids, rnd01, zoneMat, faceList);
  if (aoQuads.length) {
    const m = new THREE.Mesh(mergeGeos(aoQuads), DRESS_MATS.ao);
    m.renderOrder = 1;
    m.receiveShadow = false;
    MAPG.add(m);
    for (const [g] of aoQuads) g.dispose();
  }
}
