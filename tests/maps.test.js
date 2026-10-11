/* Map documents: the built-in maps validate, hostile or broken documents are rejected, and building
   a map produces the expected collision and destructible pieces with stable ids. */
const { check, finish } = require("./lib/check.js");
const CTF = require("./lib/headless.js");
const K = window.KA;
for (const [k, doc] of Object.entries(K.MAPS)) {
  const v = K.validateMap(doc);
  check(v.ok, `built-in map "${k}" validates`, v.errors);
}
const clone = o => JSON.parse(JSON.stringify(o));
const base = clone(K.MAPS.arena);
const broken = {
  "not an object": "map",
  "wrong schema": Object.assign(clone(base), { schema: 99 }),
  "bad id": Object.assign(clone(base), { id: "../../etc" }),
  "no pieces": Object.assign(clone(base), { pieces: [] }),
  "too many pieces": Object.assign(clone(base), {
    pieces: Array.from({ length: 401 }, (_, i) => Object.assign({}, base.pieces[1], { id: "x" + i })),
  }),
  "NaN size": (() => {
    const d = clone(base);
    d.pieces[1].s = [1, null, 1];
    return d;
  })(),
  "unknown material": (() => {
    const d = clone(base);
    d.pieces[1].mat = "lava";
    return d;
  })(),
  "duplicate id": (() => {
    const d = clone(base);
    d.pieces[2].id = d.pieces[1].id;
    return d;
  })(),
  "unknown piece type": (() => {
    const d = clone(base);
    d.pieces[1].type = "script";
    return d;
  })(),
  "diagonal stairs": (() => {
    const d = clone(base);
    const s = d.pieces.find(p => p.type === "stairs");
    s.dir = [1, 1];
    return d;
  })(),
  "far away": (() => {
    const d = clone(base);
    d.pieces[1].p = [1e9, 0, 0];
    return d;
  })(),
  "unknown pickup weapon": Object.assign(clone(base), {
    pickups: [{ id: "x", weapon: "railgun", p: [0, 0, 0], respawn: 30 }],
  }),
  "no spawns": Object.assign(clone(base), { spawns: {} }),
  "prototype pollution": JSON.parse('{"__proto__":{"polluted":1},"schema":1}'),
};
for (const [what, doc] of Object.entries(broken)) {
  let r;
  try {
    r = K.validateMap(doc);
  } catch (e) {
    r = { ok: true, errors: ["threw " + e.message] };
  }
  check(!r.ok && r.errors.length > 0, `rejects a map with: ${what}`, r.errors.slice(0, 2));
}
check({}.polluted === undefined, "validation never pollutes prototypes");
/* twins: a symmetric map's rotated copies come right after their originals */
const ctf = K.mapPieces(K.MAPS.ctf);
const twins = ctf.filter(p => p.id.endsWith("~"));
check(
  twins.length === K.MAPS.ctf.pieces.filter(p => p.twin).length,
  "every twin piece gets its rotated copy",
  twins.length
);
const t0 = ctf.find(p => p.id.endsWith("~") && p.type === "box");
const o0 = ctf[ctf.indexOf(t0) - 1];
check(
  t0.p[0] === -o0.p[0] && t0.p[2] === -o0.p[2] && t0.p[1] === o0.p[1],
  "twins are rotated 180° about the center",
  [o0.p, t0.p]
);
/* building: collision boxes and stable piece ids */
const built = CTF.buildMap();
const covers = built.solids.filter(b => b.mat === "cover");
check(built.solids.length > 50 && covers.length > 10, "the CTF map builds collision and destructible cover", {
  solids: built.solids.length,
  cover: covers.length,
});
check(
  built.solids.filter(b => b.pid).every(b => /^[A-Za-z0-9_~-]+$/.test(b.pid)),
  "built boxes keep their piece ids (for the editor and the network)"
);
finish("maps");
