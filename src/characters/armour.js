/* ============ PILOT ARMOUR ============
   The pilot's armour, designed from the game's own language rather than from any one source:
   - Angular wedge plates. Every hard plate is a bevelled block that tapers and leans (wedge), so
     the body reads as faceted, prow-shaped forms: a keeled chest, swept-back shoulder wedges, a
     prow on the knees and shins.
   - Graphite and one bright colour. The big plates carry the team colour; the second layer, the
     trim and the undersuit are graphite and gunmetal; thin emissive seams carry the team colour too.
   - Visible thrusters. The pack's two main nozzles, small nozzles on the backs of the shoulders and
     on the calves: the movement kit is something you can see on the body.
   Detail is layered the usual way: big plates, then a second layer and panel lines (look.js), then
   small mechanical parts (pistons, bolts, cables, vents), then wear on the edges (wear: every plate's
   bevel remembers it is an edge; look.js lightens it to bare metal on High).
   Three distance levels share one skeleton and one draw per material: up close everything; at mid
   range the small parts go; far off every plate is a plain block and the fingers are a mitten. */
/** where the levels change (metres from the camera), with a little hysteresis in rig.update */
const ARMOUR_LOD = [11, 30];
/**
 * an angular plate: a bevelled block whose top narrows (tx, tz: the share it loses toward the top,
 * negative to widen) and leans forward (lean: the top's shift, as a share of the depth). Vertices on
 * the bevel remember they are on an edge (userData.wear), for the worn edges. flat: a plain block
 * (far away) with no bevel and no wear.
 */
function wedge(w, h, d, o) {
  const flat = o.flat || Math.min(w, h, d) < 0.03,
    r = flat ? 0 : o.r || Math.min(w, h, d) * 0.2;
  const g = flat ? new THREE.BoxGeometry(w, h, d) : rbox(w, h, d, r);
  const P = g.attributes.position,
    n = P.count,
    wear = new Float32Array(n),
    hx = w / 2 - r - 1e-5,
    hy = h / 2 - r - 1e-5,
    hz = d / 2 - r - 1e-5;
  for (let i = 0; i < n; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    if (!flat) wear[i] = +(Math.abs(x) > hx) + +(Math.abs(y) > hy) + +(Math.abs(z) > hz) >= 2 ? 1 : 0;
    const t = (y + h / 2) / h;
    P.setXYZ(i, x * (1 - (o.tx || 0) * t), y, z * (1 - (o.tz || 0) * t) - (o.lean || 0) * t * d);
  }
  g.computeVertexNormals();
  g.userData.wear = wear;
  return g;
}
/* ---- the armour at one distance level (0 near, 1 mid, 2 far): [bone, geometry, role, position,
   rotation, scale, shield shell?] per part ---- */
function pilotParts(lod = 0) {
  const parts = [];
  /* hi: the furthest level a part is kept at (small parts go first); lo: the nearest (a stand-in for
     detail that has gone) */
  const P = (bone, g, role, x, y, z, rot, scl, shell = false, hi = 2, lo = 0) => {
    if (lod <= hi && lod >= lo)
      parts.push({ bone, g, role, x, y, z, rot: rot || null, scl: scl || null, shell });
  };
  const far = lod > 1;
  const W = (k, w, h, d, o = {}) =>
    geo(`wd${far ? "f" : ""}:${k}:${w}:${h}:${d}`, () =>
      wedge(w, h, d, far ? Object.assign({}, o, { flat: 1 }) : o)
    );
  const cap = (k, r, l) => geo(`cap${lod}:${k}`, () => capsule(r, l, [8, 6, 5][lod]));
  const cyl = (k, a, b, h, s = 12) =>
    geo(`cyl${far ? "f" : ""}:${k}`, () => new THREE.CylinderGeometry(a, b, h, far ? 6 : s));
  const sph = (k, r, a, b) =>
    geo(`sph${far ? "f" : ""}:${k}`, () => new THREE.SphereGeometry(r, far ? 6 : a, far ? 4 : b));
  const X = Math.PI / 2;
  /* ---- hips: undersuit, belt, a codpiece wedge, hip plates, tassets, the tabard ---- */
  P("pelvis", cap("pel", 0.15, 0.33), SUIT, 0, 0, 0, [0, 0, X], [1, 1, 0.75], true);
  P("pelvis", W("belt", 0.38, 0.07, 0.26, { tx: 0.05 }), TRIM, 0, 0.06, 0);
  P("pelvis", W("buckle", 0.08, 0.025, 0.012), GLOW, 0, 0.06, -0.134, null, null, false, 1);
  P("pelvis", W("cod", 0.13, 0.14, 0.06, { tx: -0.5, lean: -0.2 }), ARM, 0, -0.035, -0.12);
  for (const sd of [-1, 1]) {
    P("pelvis", W("hipPl", 0.05, 0.19, 0.2, { tz: 0.35 }), ARM2, sd * 0.195, -0.04, 0, [0, 0, sd * 0.18]);
    P("pelvis", W("pouch", 0.08, 0.07, 0.05), TRIM, sd * 0.12, 0.03, 0.15, null, null, false, 1);
  }
  P("pelvis", W("rearPl", 0.26, 0.13, 0.04, { tx: 0.3 }), ARM2, 0, -0.03, 0.125);
  for (const n of ["tabF", "tabB"]) {
    P(n, W("tab", 0.13, 0.17, 0.012), ARM2, 0, -0.08, 0);
    P(n + "2", W("tab2", 0.12, 0.15, 0.01), ARM2, 0, -0.07, 0);
  }
  P("tabF2", W("tabHem", 0.1, 0.01, 0.004), GLOW, 0, -0.138, -0.007);
  for (const s of ["L", "R"]) {
    P("tas" + s, W("tas", 0.12, 0.18, 0.035, { tx: -0.3 }), ARM, 0, -0.09, 0);
    P("tas" + s, W("tasLt", 0.07, 0.006, 0.006), GLOW, 0, -0.15, -0.02, null, null, false, 1);
  }
  /* ---- the middle: undersuit, stacked abdominal wedges ---- */
  P("spine", cap("abs", 0.13, 0.3), SUIT, 0, 0.1, 0, null, null, true);
  for (const sd of [-1, 1]) {
    P("spine", W("ab", 0.09, 0.06, 0.035, { tx: 0.25 }), ARM2, sd * 0.05, 0.05, -0.122);
    P(
      "spine",
      W("ab", 0.09, 0.06, 0.035, { tx: 0.25 }),
      ARM2,
      sd * 0.052,
      0.115,
      -0.124,
      null,
      null,
      false,
      1
    );
  }
  P("spine2", W("obl", 0.29, 0.12, 0.2, { tx: -0.1 }), SUIT, 0, 0.03, 0);
  /* ---- the chest: a keeled prow (two pectoral wedges angled to meet at a central keel), a raised
     angular mantle round the neck, and the thruster pack ---- */
  P("chest", W("chest", 0.46, 0.3, 0.27, { tx: -0.18, r: 0.04 }), ARM, 0, 0.1, -0.005, null, null, true);
  for (const sd of [-1, 1]) {
    P("chest", W("pec", 0.22, 0.21, 0.05, { tx: 0.3, lean: 0.15 }), ARM, sd * 0.1, 0.12, -0.163, [
      -0.18,
      sd * 0.45,
      0,
    ]);
    P("chest", W("pecLt", 0.13, 0.008, 0.01), GLOW, sd * 0.11, 0.022, -0.178, [0, sd * 0.45, -sd * 0.12]);
    P("chest", W("blade", 0.17, 0.18, 0.04, { tx: 0.35 }), ARM2, sd * 0.12, 0.11, 0.15, [0.12, sd * 0.2, 0]);
    P("chest", W("mantle", 0.12, 0.12, 0.2, { tx: 0.55 }), ARM2, sd * 0.11, 0.285, 0.0, [0, 0, -sd * 0.38]);
    for (const y of [0.07, 0.17])
      P(
        "chest",
        W("bolt", 0.014, 0.014, 0.01),
        TRIM,
        sd * 0.175,
        y,
        -0.18,
        [0, sd * 0.45, 0],
        null,
        false,
        0
      );
  }
  P("chest", W("keel", 0.03, 0.23, 0.07, { tz: 0.5 }), TRIM, 0, 0.11, -0.205, [-0.18, 0, 0]);
  P("chest", W("belly", 0.24, 0.09, 0.05, { tx: 0.3 }), ARM2, 0, -0.08, -0.135, [0.1, 0, 0]);
  P("chest", W("chest2", 0.36, 0.15, 0.23, { tx: -0.15 }), SUIT, 0, -0.08, -0.01);
  P("chest", W("gorget", 0.17, 0.07, 0.04, { tx: 0.35 }), ARM2, 0, 0.27, -0.12, [0.3, 0, 0]);
  P("chest", W("nape", 0.24, 0.12, 0.05, { tx: 0.4 }), ARM2, 0, 0.3, 0.11, [-0.3, 0, 0]);
  P("chest", W("pack", 0.33, 0.35, 0.15, { tx: 0.3 }), TRIM, 0, 0.08, 0.21);
  P("chest", W("packCv", 0.25, 0.22, 0.04, { tx: 0.4 }), ARM2, 0, 0.12, 0.295);
  for (const sd of [-1, 1]) {
    P("chest", W("packLt", 0.012, 0.17, 0.01), GLOW, sd * 0.14, 0.1, 0.29, [0, 0, sd * 0.12], null, false, 1);
    P("chest", cyl("noz", 0.045, 0.065, 0.13), TRIM, sd * 0.1, -0.13, 0.27);
    P("chest", cyl("nozIn", 0.035, 0.035, 0.02), GLOW, sd * 0.1, -0.2, 0.27);
    /* (small steering nozzles high on the pack) */
    P(
      "chest",
      cyl("nozS", 0.018, 0.026, 0.05, 8),
      TRIM,
      sd * 0.19,
      0.2,
      0.22,
      [0, 0, sd * 1.1],
      null,
      false,
      1
    );
  }
  for (let i = 0; i < 3; i++)
    P("chest", W("vent", 0.18, 0.012, 0.012), TRIM, 0, -0.02 + i * 0.03, 0.29, null, null, false, 0);
  P("chest", W("packRib", 0.34, 0.04, 0.17), ARM, 0, 0.2, 0.21);
  /* cables from the pack over the shoulders to the helmet's back */
  for (const sd of [-1, 1])
    P("chest", cap("cable", 0.012, 0.22), TRIM, sd * 0.07, 0.31, 0.1, [0.9, 0, 0], null, false, 0);
  P("antenna", cyl("ant", 0.005, 0.008, 0.34, 6), TRIM, 0, 0.17, 0, null, null, false, 1);
  P("antenna", sph("antTip", 0.013, 8, 6), GLOW, 0, 0.345, 0, null, null, false, 1);
  /* ---- neck and helmet ---- */
  P("neck", cap("neck", 0.06, 0.14), SUIT, 0, 0, 0);
  P("neck", cyl("neckRing", 0.07, 0.08, 0.04, 10), TRIM, 0, -0.05, 0, null, null, false, 1);
  helmet(P, W);
  /* ---- arms: swept shoulder wedges with a leading edge, a skirt and a small steering nozzle behind;
     the upper arm, an elbow cop with a piston across the joint, angular gauntlets, gloves ---- */
  for (const [s, sd] of SIDES) {
    P("clav" + s, W("yoke", 0.13, 0.06, 0.17, { tx: 0.3 }), TRIM, sd * 0.06, 0.005, 0, null, null, false, 1);
    P(
      "sh" + s,
      W("pad", 0.2, 0.12, 0.27, { tx: 0.4, tz: 0.15, lean: 0.12, r: 0.03 }),
      ARM,
      sd * 0.04,
      0.05,
      0.01,
      [0, 0, sd * 0.4],
      null,
      true
    );
    P("sh" + s, W("padEdge", 0.18, 0.035, 0.06, { tx: 0.2 }), ARM2, sd * 0.045, 0.07, -0.13, [
      0.35,
      0,
      sd * 0.4,
    ]);
    P("sh" + s, W("padSk", 0.05, 0.13, 0.22, { tz: 0.25 }), ARM2, sd * 0.13, -0.055, 0.01, [0, 0, sd * 0.1]);
    P("sh" + s, W("padLt", 0.006, 0.02, 0.18), GLOW, sd * 0.158, -0.075, 0.01, null, null, false, 1);
    P("sh" + s, cyl("padNoz", 0.02, 0.028, 0.05, 8), TRIM, sd * 0.075, 0.05, 0.14, [X, 0, 0], null, false, 1);
    P(
      "sh" + s,
      cyl("padNozIn", 0.016, 0.016, 0.01, 8),
      GLOW,
      sd * 0.075,
      0.05,
      0.166,
      [X, 0, 0],
      null,
      false,
      0
    );
    P("sh" + s, cap("uarm", 0.06, 0.3), SUIT, 0, -0.15, 0, null, null, true);
    P("sh" + s, W("bicep", 0.08, 0.15, 0.1, { tx: 0.25 }), ARM, sd * 0.02, -0.16, -0.01);
    P("sh" + s, cyl("piston", 0.009, 0.009, 0.15, 6), TRIM, -sd * 0.04, -0.22, 0.05, null, null, false, 0);
    P("el" + s, W("elb", 0.09, 0.09, 0.1, { tz: 0.35, lean: -0.2 }), TRIM, 0, 0.005, 0.035);
    P("el" + s, cyl("pistonB", 0.013, 0.013, 0.1, 6), TRIM, -sd * 0.04, -0.06, 0.05, null, null, false, 0);
    P("el" + s, cap("farm", 0.058, 0.27), SUIT, 0, -0.13, 0, null, null, true);
    P(
      "el" + s,
      W("gaunt", 0.12, 0.2, 0.13, { tx: -0.2, tz: -0.1, r: 0.025 }),
      ARM,
      0,
      -0.17,
      0,
      null,
      null,
      true
    );
    P("el" + s, W("gauntLt", 0.012, 0.08, 0.012), GLOW, sd * 0.07, -0.17, -0.02, null, null, false, 1);
    for (let i = 0; i < 2; i++)
      P(
        "el" + s,
        W("fvent", 0.012, 0.012, 0.07),
        TRIM,
        -sd * 0.07,
        -0.15 - i * 0.03,
        0,
        null,
        null,
        false,
        0
      );
    P("hand" + s, W("palm", 0.075, 0.09, 0.09, { r: 0.02 }), SUIT, 0, -0.035, 0);
    P("hand" + s, W("handPl", 0.014, 0.06, 0.072, { tz: 0.2 }), ARM2, sd * 0.042, -0.03, 0);
    P("hand" + s, W("knuck", 0.08, 0.022, 0.095), TRIM, 0, -0.074, 0, null, null, false, 1);
    for (const z of [-0.033, -0.011, 0.011, 0.033]) {
      P("fing" + s, W("f1", 0.024, 0.045, 0.019, { r: 0.007 }), SUIT, 0, -0.022, z, null, null, false, 1);
      P("tip" + s, W("f2", 0.022, 0.036, 0.018, { r: 0.007 }), SUIT, 0, -0.017, z, null, null, false, 1);
    }
    P("thumb" + s, W("th", 0.022, 0.052, 0.022, { r: 0.008 }), SUIT, 0, -0.026, 0, null, null, false, 1);
    /* (far off, the fingers are one mitten) */
    P("fing" + s, W("mitt", 0.07, 0.07, 0.09), SUIT, 0, -0.03, 0, null, null, false, 2, 2);
  }
  /* ---- legs: thigh plates with a keel, a prow on the knee and the shin, calf thrusters, a piston
     behind the knee, angular boots ---- */
  for (const [s, sd] of SIDES) {
    P("hip" + s, cap("thigh", 0.092, 0.44), SUIT, 0, -0.21, 0, null, null, true);
    P(
      "hip" + s,
      W("thighPl", 0.17, 0.2, 0.09, { tx: 0.25, lean: 0.12 }),
      ARM,
      0,
      -0.12,
      -0.075,
      [0.06, 0, 0],
      null,
      true
    );
    P("hip" + s, W("thighP2", 0.14, 0.14, 0.08, { tx: 0.3 }), ARM2, 0, -0.29, -0.078, [-0.05, 0, 0]);
    P("hip" + s, W("thighSd", 0.045, 0.26, 0.15, { tz: 0.3 }), ARM2, sd * 0.09, -0.19, 0);
    P("hip" + s, W("thighLt", 0.008, 0.16, 0.008), GLOW, sd * 0.114, -0.2, -0.03, null, null, false, 1);
    P("hip" + s, W("bolt", 0.014, 0.014, 0.01), TRIM, sd * 0.05, -0.06, -0.122, null, null, false, 0);
    P(
      "kn" + s,
      W("kneeCap", 0.13, 0.15, 0.09, { tx: 0.45, tz: 0.3, lean: 0.25 }),
      ARM,
      0,
      0.01,
      -0.072,
      [-0.15, 0, 0]
    );
    P("kn" + s, cyl("kpiston", 0.011, 0.011, 0.14, 6), TRIM, sd * 0.03, -0.05, 0.075, null, null, false, 0);
    P("kn" + s, cap("shin", 0.074, 0.43), SUIT, 0, -0.21, 0, null, null, true);
    P(
      "kn" + s,
      W("shinPl", 0.13, 0.23, 0.09, { tx: -0.25, lean: -0.15 }),
      ARM,
      0,
      -0.16,
      -0.068,
      null,
      null,
      true
    );
    P("kn" + s, W("shinP2", 0.12, 0.12, 0.07, { tx: 0.2 }), ARM2, 0, -0.33, -0.07);
    P("kn" + s, W("calf", 0.12, 0.22, 0.06, { tx: 0.2 }), ARM2, 0, -0.17, 0.065);
    P("kn" + s, W("shinLt", 0.04, 0.008, 0.008), GLOW, 0, -0.06, -0.115, null, null, false, 1);
    P("kn" + s, cyl("cnoz", 0.024, 0.034, 0.06, 8), TRIM, 0, -0.29, 0.1, [X, 0, 0], null, false, 1);
    P("kn" + s, cyl("cnozIn", 0.02, 0.02, 0.01, 8), GLOW, 0, -0.29, 0.131, [X, 0, 0], null, false, 1);
    P("an" + s, W("foot", 0.15, 0.1, 0.25, { tx: 0.2 }), TRIM, 0, -0.03, -0.01);
    P("an" + s, W("ankle", 0.16, 0.1, 0.16, { tx: -0.15 }), ARM2, 0, 0.04, 0);
    P("an" + s, cyl("apiston", 0.009, 0.009, 0.1, 6), TRIM, sd * 0.06, 0.06, 0.06, null, null, false, 0);
    P("toe" + s, W("toe", 0.15, 0.065, 0.13, { tx: 0.35 }), ARM, 0, 0.005, -0.05);
  }
  return parts;
}
/* ---- the helmet (prow): see docs/DESIGN.md for why this one, and the two it was chosen over ---- */
function helmet(P, W) {
  /* prow: a faceted shell narrowing to the top, a faceplate of two angled wedges meeting at a
     central keel, two narrow eye slits set at a shallow upward angle on either side of the keel, a
     jutting chin wedge, short swept fins */
  P(
    "head",
    W("hShell", 0.22, 0.24, 0.29, { tx: 0.28, tz: 0.18, r: 0.035 }),
    ARM,
    0,
    0.09,
    0.015,
    null,
    null,
    true
  );
  for (const sd of [-1, 1]) {
    P("head", W("hFace", 0.115, 0.15, 0.035, { tx: 0.3 }), ARM, sd * 0.048, 0.07, -0.152, [
      0.05,
      sd * 0.5,
      0,
    ]);
    P("head", W("hSlit", 0.085, 0.02, 0.012), VISOR, sd * 0.05, 0.105, -0.172, [0, sd * 0.5, sd * 0.26]);
    P(
      "head",
      W("hFin", 0.022, 0.08, 0.16, { tz: 0.6, lean: -0.3 }),
      ARM2,
      sd * 0.112,
      0.1,
      0.05,
      [0.25, 0, 0]
    );
    P("head", W("hFinLt", 0.006, 0.05, 0.006), GLOW, sd * 0.124, 0.1, -0.02, null, null, false, 1);
  }
  P("head", W("hKeel", 0.024, 0.06, 0.04, { tz: 0.35 }), TRIM, 0, 0.145, -0.17, [0.3, 0, 0]);
  P("head", W("hBrow", 0.22, 0.035, 0.08, { tx: 0.25 }), ARM2, 0, 0.158, -0.1, [0.3, 0, 0]);
  P("head", W("hChin", 0.12, 0.07, 0.1, { tx: -0.35 }), ARM, 0, -0.01, -0.118, [-0.35, 0, 0]);
  P("head", W("hBack", 0.18, 0.09, 0.05, { tx: 0.3 }), ARM2, 0, 0.04, 0.145);
}
/* ---- rigid skinning: every part's vertices follow its bone; one geometry per material per level ---- */
let SKIN = null;
function buildSkin(bones, byName) {
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    E = new THREE.Euler(),
    Sv = new V3(),
    Tv = new V3();
  const level = lod => {
    const roles = [[], [], [], [], [], []],
      shell = [];
    for (const p of pilotParts(lod)) {
      const bi = bones.indexOf(byName[p.bone]);
      Q.setFromEuler(E.set(p.rot ? p.rot[0] : 0, p.rot ? p.rot[1] : 0, p.rot ? p.rot[2] : 0));
      Sv.set(p.scl ? p.scl[0] : 1, p.scl ? p.scl[1] : 1, p.scl ? p.scl[2] : 1);
      M.compose(Tv.set(p.x, p.y, p.z), Q, Sv).premultiply(byName[p.bone].matrixWorld);
      roles[p.role].push([p.g, M.clone(), bi]);
      if (p.shell) shell.push([p.g, M.clone().multiply(_m1.makeScale(1.17, 1.17, 1.17)), bi]);
    }
    return { roles: roles.map(skinMerge), shell: skinMerge(shell) };
  };
  return [0, 1, 2].map(level);
}
/** merge one material's parts, each skinned rigidly to its bone, with the edge wear */
function skinMerge(items) {
  const g = mergeGeos(items.map(([gg, m]) => [gg, m]));
  const n = g.attributes.position.count,
    si = new Uint16Array(n * 4),
    sw = new Float32Array(n * 4),
    wr = new Float32Array(n);
  let o = 0;
  for (const [gg, , bi] of items) {
    const c = gg.attributes.position.count,
      w = gg.userData.wear;
    for (let i = 0; i < c; i++, o++) {
      si[o * 4] = bi;
      sw[o * 4] = 1;
      wr[o] = w ? w[i] : 0;
    }
  }
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute("wear", new THREE.Float32BufferAttribute(wr, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius = Math.max(g.boundingSphere.radius, 1.9);
  return g;
}
