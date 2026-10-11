/* ============ MAPS: every map is a data document ============
   A map is plain data (it could be a JSON file): versioned, with a stable id on every piece, so a
   future map editor, map files and the network can refer to pieces by id. Piece types:
     box     { p: [centerX, bottomY, centerZ], s: [width, height, depth], mat }   (mat "cover" is destructible)
     stairs  { p: [x, z], dir: [dx, dz], steps, top, width }                       (rises toward p)
     strip   { p: [x, y, z], s: [width, depth], mat }                              (glowing trim, no collision)
   twin: true adds the piece's 180° rotated copy (id + "~"), for symmetric team maps; twinMat
   gives the copy a different material (team colors). validateMap() checks a document strictly
   (safe for untrusted files) and buildMap() turns one into geometry; navigation is built from the
   result automatically. */
const MAP_SCHEMA = 1;
const MAPS = {};
MAPS.arena = {
  schema: 1,
  id: "arena",
  name: "Proving Grounds",
  bounds: { x0: -37, x1: 37, z0: -37, z1: 37 },
  pieces: [
    { id: "floor1", type: "box", mat: "floor", p: [0, -1, 0], s: [84, 1, 84] },
    { id: "wall2", type: "box", mat: "wall", p: [0, 0, -37], s: [76, 7, 2] },
    { id: "wall3", type: "box", mat: "wall", p: [0, 0, 37], s: [76, 7, 2] },
    { id: "wall4", type: "box", mat: "wall", p: [-37, 0, 0], s: [2, 7, 76] },
    { id: "wall5", type: "box", mat: "wall", p: [37, 0, 0], s: [2, 7, 76] },
    { id: "b6", type: "box", mat: "core", p: [0, 0, 0], s: [10, 3.2, 10] },
    { id: "trim7", type: "strip", mat: "strip", p: [0, 3.2, -4.95], s: [10, 0.1] },
    { id: "trim8", type: "strip", mat: "strip", p: [0, 3.2, 4.95], s: [10, 0.1] },
    { id: "cover9", type: "box", mat: "cover", p: [0, 3.2, 0], s: [1.4, 1.3, 1.4] },
    { id: "stairs10", type: "stairs", p: [0, 5], dir: [0, 1], steps: 8, top: 3.2, width: 3 },
    { id: "stairs11", type: "stairs", p: [0, -5], dir: [0, -1], steps: 8, top: 3.2, width: 3 },
    { id: "b12", type: "box", mat: "base", p: [6.6, 0, 0], s: [3.2, 5.2, 3.2] },
    { id: "b13", type: "box", mat: "base", p: [-6.6, 0, 0], s: [3.2, 5.2, 3.2] },
    { id: "trim14", type: "strip", mat: "stripB", p: [6.6, 5.2, 0], s: [3.2, 3.2] },
    { id: "trim15", type: "strip", mat: "stripB", p: [-6.6, 5.2, 0], s: [3.2, 3.2] },
    { id: "b16", type: "box", mat: "base", p: [24, 0, 24], s: [10, 2.6, 10] },
    { id: "cover17", type: "box", mat: "cover", p: [27.6, 2.6, 27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs18", type: "stairs", p: [19, 24], dir: [-1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim19", type: "strip", mat: "strip", p: [19.05, 2.6, 24], s: [0.1, 10] },
    { id: "b20", type: "box", mat: "base", p: [-24, 0, 24], s: [10, 2.6, 10] },
    { id: "cover21", type: "box", mat: "cover", p: [-27.6, 2.6, 27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs22", type: "stairs", p: [-19, 24], dir: [1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim23", type: "strip", mat: "strip", p: [-19.05, 2.6, 24], s: [0.1, 10] },
    { id: "b24", type: "box", mat: "base", p: [24, 0, -24], s: [10, 2.6, 10] },
    { id: "cover25", type: "box", mat: "cover", p: [27.6, 2.6, -27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs26", type: "stairs", p: [19, -24], dir: [-1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim27", type: "strip", mat: "strip", p: [19.05, 2.6, -24], s: [0.1, 10] },
    { id: "b28", type: "box", mat: "base", p: [-24, 0, -24], s: [10, 2.6, 10] },
    { id: "cover29", type: "box", mat: "cover", p: [-27.6, 2.6, -27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs30", type: "stairs", p: [-19, -24], dir: [1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim31", type: "strip", mat: "strip", p: [-19.05, 2.6, -24], s: [0.1, 10] },
    { id: "cover32", type: "box", mat: "cover", p: [0, 0, 18], s: [7, 2.5, 2] },
    { id: "cover33", type: "box", mat: "cover", p: [0, 0, -18], s: [7, 2.5, 2] },
    { id: "cover34", type: "box", mat: "cover", p: [18, 0, 0], s: [2, 2.5, 7] },
    { id: "cover35", type: "box", mat: "cover", p: [-18, 0, 0], s: [2, 2.5, 7] },
    { id: "cover36", type: "box", mat: "cover", p: [13, 0, 13], s: [4, 1.3, 1.2] },
    { id: "cover37", type: "box", mat: "cover", p: [15.5, 0, 11], s: [1.2, 1.3, 3] },
    { id: "cover38", type: "box", mat: "cover", p: [-13, 0, 13], s: [4, 1.3, 1.2] },
    { id: "cover39", type: "box", mat: "cover", p: [-15.5, 0, 11], s: [1.2, 1.3, 3] },
    { id: "cover40", type: "box", mat: "cover", p: [13, 0, -13], s: [4, 1.3, 1.2] },
    { id: "cover41", type: "box", mat: "cover", p: [15.5, 0, -11], s: [1.2, 1.3, 3] },
    { id: "cover42", type: "box", mat: "cover", p: [-13, 0, -13], s: [4, 1.3, 1.2] },
    { id: "cover43", type: "box", mat: "cover", p: [-15.5, 0, -11], s: [1.2, 1.3, 3] },
    { id: "wall44", type: "box", mat: "wall", p: [29, 0, 0], s: [3, 6, 3] },
    { id: "wall45", type: "box", mat: "wall", p: [-29, 0, 0], s: [3, 6, 3] },
    { id: "wall46", type: "box", mat: "wall", p: [0, 0, 29], s: [3, 6, 3] },
    { id: "wall47", type: "box", mat: "wall", p: [0, 0, -29], s: [3, 6, 3] },
    { id: "b48", type: "box", mat: "step", p: [26.9, 0, 0], s: [1.2, 2.2, 3] },
    { id: "b49", type: "box", mat: "step", p: [-26.9, 0, 0], s: [1.2, 2.2, 3] },
    { id: "b50", type: "box", mat: "step", p: [0, 0, 26.9], s: [3, 2.2, 1.2] },
    { id: "b51", type: "box", mat: "step", p: [0, 0, -26.9], s: [3, 2.2, 1.2] },
    { id: "b52", type: "box", mat: "base", p: [10, 0, -34.5], s: [10, 2.4, 3] },
    { id: "b53", type: "box", mat: "base", p: [-10, 0, 34.5], s: [10, 2.4, 3] },
    { id: "b54", type: "box", mat: "base", p: [34.5, 0, 10], s: [3, 2.4, 10] },
    { id: "b55", type: "box", mat: "base", p: [-34.5, 0, -10], s: [3, 2.4, 10] },
  ],
  spawns: {
    ffa: [
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
    ],
  },
  pickups: [{ id: "arena-sniper", weapon: "sniper", p: [0, 4.5, 0], respawn: 90 }],
};
MAPS.ctf = {
  schema: 1,
  id: "twin-foundry",
  name: "Twin Foundry",
  symmetry: "rotate180",
  bounds: { x0: -26, x1: 26, z0: -50, z1: 50 },
  pieces: [
    { id: "floor1", type: "box", mat: "floor", p: [0, -1, 0], s: [56, 1, 104] },
    { id: "wall2", type: "box", mat: "wall", p: [0, 0, -51], s: [56, 7, 2] },
    { id: "wall3", type: "box", mat: "wall", p: [0, 0, 51], s: [56, 7, 2] },
    { id: "wall4", type: "box", mat: "wall", p: [-27, 0, 0], s: [2, 7, 104] },
    { id: "wall5", type: "box", mat: "wall", p: [27, 0, 0], s: [2, 7, 104] },
    { id: "b6", type: "box", mat: "redBase", p: [0, 0, -42], s: [18, 2.4, 10] },
    { id: "b7", type: "box", mat: "blueBase", p: [0, 0, 42], s: [18, 2.4, 10] },
    {
      id: "trim8",
      type: "strip",
      mat: "redStrip",
      p: [0, 2.4, -37.05],
      s: [18, 0.1],
      twin: true,
      twinMat: "blueStrip",
    },
    {
      id: "trim9",
      type: "strip",
      mat: "redStrip",
      p: [-8.95, 2.4, -42],
      s: [0.1, 10],
      twin: true,
      twinMat: "blueStrip",
    },
    {
      id: "trim10",
      type: "strip",
      mat: "redStrip",
      p: [8.95, 2.4, -42],
      s: [0.1, 10],
      twin: true,
      twinMat: "blueStrip",
    },
    { id: "stairs11", type: "stairs", p: [5, -37], dir: [0, 1], steps: 6, top: 2.4, width: 3, twin: true },
    { id: "stairs12", type: "stairs", p: [-5, -37], dir: [0, 1], steps: 6, top: 2.4, width: 3, twin: true },
    { id: "b13", type: "box", mat: "step", p: [11.5, 0, -42], s: [4, 1.2, 6], twin: true },
    { id: "b14", type: "box", mat: "step", p: [-11.5, 0, -42], s: [4, 1.2, 6], twin: true },
    { id: "cover15", type: "box", mat: "cover", p: [-5, 2.4, -39.6], s: [1.2, 1.2, 2.4], twin: true },
    { id: "cover16", type: "box", mat: "cover", p: [5, 2.4, -39.6], s: [1.2, 1.2, 2.4], twin: true },
    { id: "wall17", type: "box", mat: "wall", p: [-7.4, 2.4, -46], s: [1.6, 3, 1.6], twin: true },
    { id: "wall18", type: "box", mat: "wall", p: [7.4, 2.4, -46], s: [1.6, 3, 1.6], twin: true },
    { id: "cover19", type: "box", mat: "cover", p: [0, 0, -29.5], s: [6, 1.3, 1.2], twin: true },
    { id: "cover20", type: "box", mat: "cover", p: [-14, 0, -33], s: [1.2, 1.3, 4], twin: true },
    { id: "cover21", type: "box", mat: "cover", p: [14, 0, -33], s: [1.2, 1.3, 4], twin: true },
    { id: "wall22", type: "box", mat: "wall", p: [-10, 0, -18], s: [1.2, 3.6, 14], twin: true },
    { id: "wall23", type: "box", mat: "wall", p: [10, 0, -18], s: [1.2, 3.6, 14], twin: true },
    { id: "b24", type: "box", mat: "step", p: [-10, 0, -6.5], s: [1.2, 1.2, 3], twin: true },
    { id: "b25", type: "box", mat: "step", p: [10, 0, -6.5], s: [1.2, 1.2, 3], twin: true },
    { id: "b26", type: "box", mat: "core", p: [0, 0, 0], s: [9, 3, 9] },
    { id: "cover27", type: "box", mat: "cover", p: [0, 3, 0], s: [1.4, 1.2, 1.4] },
    { id: "stairs28", type: "stairs", p: [0, 4.5], dir: [0, 1], steps: 7, top: 3, width: 3, twin: true },
    { id: "cover29", type: "box", mat: "cover", p: [-6.5, 0, 0], s: [2, 1.4, 5], twin: true },
    { id: "cover30", type: "box", mat: "cover", p: [6.5, 0, 0], s: [2, 1.4, 5], twin: true },
    { id: "trim31", type: "strip", mat: "redStrip", p: [0, 3, -4.45], s: [9, 0.1] },
    { id: "trim32", type: "strip", mat: "blueStrip", p: [0, 3, 4.45], s: [9, 0.1] },
    { id: "b33", type: "box", mat: "base", p: [-24.5, 0, 0], s: [3, 2.6, 22] },
    { id: "b34", type: "box", mat: "base", p: [24.5, 0, 0], s: [3, 2.6, 22] },
    {
      id: "stairs35",
      type: "stairs",
      p: [-24.5, -11],
      dir: [0, -1],
      steps: 6,
      top: 2.6,
      width: 3,
      twin: true,
    },
    {
      id: "stairs36",
      type: "stairs",
      p: [24.5, -11],
      dir: [0, -1],
      steps: 6,
      top: 2.6,
      width: 3,
      twin: true,
    },
    { id: "trim37", type: "strip", mat: "stripB", p: [-23.05, 2.6, 0], s: [0.1, 22] },
    { id: "trim38", type: "strip", mat: "stripB", p: [23.05, 2.6, 0], s: [0.1, 22] },
    { id: "cover39", type: "box", mat: "cover", p: [-18, 0, -16], s: [3.2, 1.3, 1.2], twin: true },
    { id: "cover40", type: "box", mat: "cover", p: [18, 0, -22], s: [3.2, 1.3, 1.2], twin: true },
    { id: "cover41", type: "box", mat: "cover", p: [-18.5, 0, -27], s: [1.2, 1.3, 3.2], twin: true },
    { id: "cover42", type: "box", mat: "cover", p: [18.5, 0, -11], s: [1.2, 1.3, 3.2], twin: true },
    { id: "cover43", type: "box", mat: "cover", p: [0, 0, -15], s: [4, 1.3, 1.2], twin: true },
    { id: "cover44", type: "box", mat: "cover", p: [-4.5, 0, -21], s: [1.2, 2, 3], twin: true },
    { id: "cover45", type: "box", mat: "cover", p: [4.5, 0, -24], s: [1.2, 2, 3], twin: true },
    { id: "wall46", type: "box", mat: "wall", p: [-17, 0, -23.5], s: [2.4, 4.2, 2.4], twin: true },
    { id: "b47", type: "box", mat: "step", p: [-17, 0, -21.1], s: [2.4, 2, 2.4], twin: true },
    { id: "wall48", type: "box", mat: "wall", p: [17, 0, -14], s: [2.4, 4.2, 2.4], twin: true },
    { id: "b49", type: "box", mat: "step", p: [17, 0, -16.4], s: [2.4, 2, 2.4], twin: true },
  ],
  spawns: {
    teams: [
      [
        [-6, 2.4, -45.5],
        [6, 2.4, -45.5],
        [-14, 0, -46],
        [14, 0, -46],
        [-19, 0, -38],
        [19, 0, -38],
        [-3, 2.4, -46.5],
        [3, 2.4, -46.5],
      ],
      [
        [6, 2.4, 45.5],
        [-6, 2.4, 45.5],
        [14, 0, 46],
        [-14, 0, 46],
        [19, 0, 38],
        [-19, 0, 38],
        [3, 2.4, 46.5],
        [-3, 2.4, 46.5],
      ],
    ],
  },
  flags: [
    [0, 2.4, -43],
    [0, 2.4, 43],
  ],
  /* power weapon: sniper on the cover block atop the mid tower, grabbable from the tower roof */
  pickups: [{ id: "ctf-sniper", weapon: "sniper", p: [0, 4.2, 0], respawn: 90 }],
  /* lanes for the AI and callouts: x < -split is the left wing, x > split the right, mid between */
  lanes: { split: 9.5, x: [-18, 0, 18] },
};

/* ---- validation: everything a map file could get wrong, checked before any of it is used ---- */
const MAP_MATS = [
  "floor",
  "wall",
  "core",
  "base",
  "cover",
  "step",
  "strip",
  "stripB",
  "redStrip",
  "blueStrip",
  "redBase",
  "blueBase",
];
const MAP_LIMIT = 400;
/** @returns {{ ok: boolean, errors: string[] }} */
function validateMap(doc) {
  const errors = [];
  const bad = m => errors.length < 20 && errors.push(m);
  const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  const vec = (a, n, lo, hi) => Array.isArray(a) && a.length === n && a.every(v => num(v, lo, hi));
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    return { ok: false, errors: ["not a map document"] };
  if (doc.schema !== MAP_SCHEMA) bad(`schema must be ${MAP_SCHEMA}`);
  if (typeof doc.id !== "string" || !/^[a-z0-9-]{1,32}$/.test(doc.id))
    bad("id must be 1-32 lowercase letters, digits or dashes");
  if (typeof doc.name !== "string" || !doc.name.length || doc.name.length > 40)
    bad("name must be 1-40 characters");
  const B = doc.bounds;
  if (!B || !num(B.x0, -500, 0) || !num(B.x1, 0, 500) || !num(B.z0, -500, 0) || !num(B.z1, 0, 500))
    bad("bounds must be { x0, x1, z0, z1 } within ±500");
  if (!Array.isArray(doc.pieces) || !doc.pieces.length) bad("pieces must be a non-empty list");
  else if (doc.pieces.length > MAP_LIMIT) bad(`at most ${MAP_LIMIT} pieces`);
  else {
    const ids = new Set();
    doc.pieces.forEach((pc, i) => {
      const at = `piece ${i}`;
      if (!pc || typeof pc !== "object") return bad(`${at}: not an object`);
      if (typeof pc.id !== "string" || !/^[A-Za-z0-9_-]{1,24}$/.test(pc.id)) return bad(`${at}: bad id`);
      if (ids.has(pc.id)) bad(`${at}: duplicate id ${pc.id}`);
      ids.add(pc.id);
      if (pc.twin !== undefined && typeof pc.twin !== "boolean") bad(`${pc.id}: twin must be true or false`);
      if (pc.twinMat !== undefined && !MAP_MATS.includes(pc.twinMat)) bad(`${pc.id}: unknown twinMat`);
      if (pc.type === "box") {
        if (!vec(pc.p, 3, -500, 500)) bad(`${pc.id}: p must be [x, y, z]`);
        if (!vec(pc.s, 3, 0.01, 300)) bad(`${pc.id}: s must be [w, h, d] (0.01-300)`);
        if (!MAP_MATS.includes(pc.mat)) bad(`${pc.id}: unknown material`);
      } else if (pc.type === "strip") {
        if (!vec(pc.p, 3, -500, 500)) bad(`${pc.id}: p must be [x, y, z]`);
        if (!vec(pc.s, 2, 0.01, 300)) bad(`${pc.id}: s must be [w, d]`);
        if (!MAP_MATS.includes(pc.mat)) bad(`${pc.id}: unknown material`);
      } else if (pc.type === "stairs") {
        if (!vec(pc.p, 2, -500, 500)) bad(`${pc.id}: p must be [x, z]`);
        if (!vec(pc.dir, 2, -1, 1) || Math.abs(pc.dir[0]) + Math.abs(pc.dir[1]) !== 1)
          bad(`${pc.id}: dir must be one of [1,0] [-1,0] [0,1] [0,-1]`);
        if (!Number.isInteger(pc.steps) || pc.steps < 1 || pc.steps > 40) bad(`${pc.id}: steps must be 1-40`);
        if (!num(pc.top, 0.1, 50) || !num(pc.width, 0.5, 30)) bad(`${pc.id}: top and width out of range`);
      } else bad(`${pc.id}: unknown type`);
    });
  }
  const pts = [];
  const S = doc.spawns;
  if (!S || typeof S !== "object") bad("spawns missing");
  else {
    if (S.ffa !== undefined) pts.push(["ffa spawns", S.ffa]);
    if (S.teams !== undefined) {
      if (!Array.isArray(S.teams) || S.teams.length !== 2) bad("spawns.teams must list two teams");
      else S.teams.forEach((t, i) => pts.push([`team ${i} spawns`, t]));
    }
    if (S.ffa === undefined && S.teams === undefined) bad("spawns needs ffa or teams");
  }
  for (const [what, list] of pts)
    if (!Array.isArray(list) || !list.length || list.length > 64 || !list.every(p => vec(p, 3, -500, 500)))
      bad(`${what}: 1-64 points [x, y, z]`);
  if (
    doc.flags !== undefined &&
    (!Array.isArray(doc.flags) || doc.flags.length !== 2 || !doc.flags.every(p => vec(p, 3, -500, 500)))
  )
    bad("flags must be two points");
  if (doc.pickups !== undefined) {
    if (!Array.isArray(doc.pickups) || doc.pickups.length > 16) bad("at most 16 pickups");
    else
      doc.pickups.forEach((p, i) => {
        if (!p || typeof p.id !== "string" || !/^[a-z0-9-]{1,24}$/.test(p.id)) bad(`pickup ${i}: bad id`);
        else if (!WEAPON_DATA.some(w => w.key === p.weapon)) bad(`pickup ${p.id}: unknown weapon`);
        else if (!vec(p.p, 3, -500, 500) || !num(p.respawn, 5, 600))
          bad(`pickup ${p.id}: bad position or respawn`);
      });
  }
  if (doc.symmetry !== undefined && doc.symmetry !== "rotate180") bad("symmetry can only be rotate180");
  if (
    doc.lanes !== undefined &&
    (!doc.lanes || !num(doc.lanes.split, 0, 200) || !vec(doc.lanes.x, 3, -500, 500))
  )
    bad("lanes must be { split, x: [left, mid, right] }");
  return { ok: !errors.length, errors };
}
/** pieces with their 180° twins expanded, in build order (a twin right after its original) */
function mapPieces(doc) {
  const out = [];
  for (const pc of doc.pieces) {
    out.push(pc);
    if (!pc.twin) continue;
    const t = Object.assign({}, pc, { id: pc.id + "~", twin: false });
    if (pc.type === "stairs") {
      t.p = [-pc.p[0], -pc.p[1]];
      t.dir = [-pc.dir[0], -pc.dir[1]];
    } else t.p = [-pc.p[0], pc.p[1], -pc.p[2]];
    if (pc.twinMat) t.mat = pc.twinMat;
    out.push(t);
  }
  return out;
}
