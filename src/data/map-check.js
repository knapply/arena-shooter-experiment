/* ============ MAP CHECK: validateMap, for map authors and tests ============
   Checks a map document strictly (safe for untrusted files): schema, ids, materials, sizes, spawns,
   flags, zones and gates. The shipped game only builds its own documents, so this lives in the
   simulation bundle (sim-worker.js, tests/lib/headless.js), where tests/maps.test.js runs it on every
   map and mod; the game page does not carry it. */
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
        else if (p.lab !== undefined && (typeof p.lab !== "string" || !/^[a-z]{1,16}$/.test(p.lab)))
          bad(`pickup ${p.id}: lab must be a lab name`);
        else if (p.rotate !== undefined && typeof p.rotate !== "boolean")
          bad(`pickup ${p.id}: rotate must be true or false`);
        else if (!vec(p.p, 3, -500, 500) || !num(p.respawn, 5, 600))
          bad(`pickup ${p.id}: bad position or respawn`);
      });
  }
  if (doc.gates !== undefined) {
    if (!Array.isArray(doc.gates) || doc.gates.length > 16) bad("at most 16 gates");
    else
      doc.gates.forEach((g, i) => {
        if (!g || typeof g.id !== "string" || !/^[a-z0-9-]{1,24}$/.test(g.id)) bad(`gate ${i}: bad id`);
        else if (
          !Array.isArray(g.leaves) ||
          !g.leaves.length ||
          g.leaves.length > 4 ||
          !g.leaves.every(l => vec(l, 4, -500, 500) && l[2] > 0.1 && l[3] > 0.1)
        )
          bad(`gate ${g.id}: leaves must be 1-4 [x, z, width, depth]`);
        else if (!num(g.h, 1, 20) || !num(g.phase, 0, 1)) bad(`gate ${g.id}: h 1-20 and phase 0-1`);
        else if (g.twin !== undefined && typeof g.twin !== "boolean")
          bad(`gate ${g.id}: twin must be true or false`);
      });
  }
  if (doc.symmetry !== undefined && doc.symmetry !== "rotate180") bad("symmetry can only be rotate180");
  if (
    doc.lanes !== undefined &&
    (!doc.lanes || !num(doc.lanes.split, 0, 200) || !vec(doc.lanes.x, 3, -500, 500))
  )
    bad("lanes must be { split, x: [left, mid, right] }");
  if (doc.ball !== undefined && !vec(doc.ball, 3, -500, 500)) bad("ball must be a point [x, y, z]");
  if (
    doc.balls !== undefined &&
    (!Array.isArray(doc.balls) ||
      !doc.balls.length ||
      doc.balls.length > 16 ||
      !doc.balls.every(p => vec(p, 3, -500, 500)))
  )
    bad("balls must be 1-16 points [x, y, z]");
  if (doc.zones !== undefined) {
    if (!Array.isArray(doc.zones) || doc.zones.length > 64) bad("at most 64 zones");
    else
      doc.zones.forEach((z, i) => {
        if (!z || typeof z.name !== "string" || !/^[A-Za-z0-9 '-]{1,24}$/.test(z.name))
          bad(`zone ${i}: name must be 1-24 letters, digits, spaces or dashes`);
        else if (!vec(z.b, 4, -500, 500) || z.b[2] <= z.b[0] || z.b[3] <= z.b[1])
          bad(`zone ${z.name}: b must be [x0, z0, x1, z1] with x1 > x0 and z1 > z0`);
        else if (z.y !== undefined && (!vec(z.y, 2, -100, 100) || z.y[1] <= z.y[0]))
          bad(`zone ${z.name}: y must be [low, high]`);
        else if (z.side !== undefined && z.side !== 0 && z.side !== 1)
          bad(`zone ${z.name}: side must be 0 or 1`);
      });
  }
  return { ok: !errors.length, errors };
}
