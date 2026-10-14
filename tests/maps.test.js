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
  "a gate without leaves": Object.assign(clone(base), { gates: [{ id: "g", leaves: [], h: 4, phase: 0 }] }),
  "a gate phase out of range": Object.assign(clone(base), {
    gates: [{ id: "g", leaves: [[0, 0, 4, 0.8]], h: 4, phase: 2 }],
  }),
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
/* layout sanity: no two pieces occupy the same space (walls meeting at corners excepted) and no
   spawn point is inside geometry */
function overlaps(solids) {
  const out = [];
  /* blast gates are checked shut (standing on the floor at full height) */
  solids = solids.map(b => (b.gate ? Object.assign({}, b, { y0: 0, y1: b.gate.h, pid: b.gate.id }) : b));
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i],
        b = solids[j];
      if (a.mat === "wall" && b.mat === "wall") continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
        oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0),
        oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0.15 && oy > 0.15 && oz > 0.15) out.push([a.pid, b.pid]);
    }
  return out;
}
check(overlaps(K.SOLID.slice()).length === 0, "arena pieces don't overlap", overlaps(K.SOLID.slice()));
check(overlaps(built.solids).length === 0, "CTF pieces don't overlap", overlaps(built.solids));
CTF.enterMap();
const blocked = [...K.MAPS.ctf.spawns.teams[0], ...K.MAPS.ctf.spawns.teams[1]].filter(
  s => !K.freeAt(s[0], s[1] + 0.05, s[2], K.H_STAND)
);
check(blocked.length === 0, "no CTF spawn is inside geometry", blocked);
CTF.exitMap();
const blockedA = K.MAPS.arena.spawns.ffa.filter(s => !K.freeAt(s[0], s[1] + 0.05, s[2], K.H_STAND));
check(blockedA.length === 0, "no arena spawn is inside geometry", blockedA);
const coverCount = m => K.mapPieces(m).filter(p => p.mat === "cover").length;
check(
  coverCount(K.MAPS.arena) >= 30 && coverCount(K.MAPS.ctf) >= 40,
  "both maps have plenty of destructible cover",
  {
    arena: coverCount(K.MAPS.arena),
    ctf: coverCount(K.MAPS.ctf),
  }
);
/* lab map mods (docs/PROPOSALS.md): each one, and every pair on the same map, validates; their pickups
   stand on a surface, clear of walls (split and pads use the same two platforms: pick one) */
{
  const mods = Object.entries(K.MAP_MODS);
  for (const [m, M] of mods)
    for (const others of [[], ...mods.filter(([o, O]) => o !== m && O.map === M.map).map(([o]) => [o])]) {
      const doc = K.mapDoc(M.map, [m, ...others]);
      const v = K.validateMap(doc);
      check(v.ok && doc.id !== K.MAPS[M.map].id, `map mod ${[m, ...others].join(" + ")} validates`, v.errors);
    }
  for (const key of ["ctf", "arena"]) {
    const doc = K.mapDoc(key, Object.keys(K.MAP_MODS));
    K.LABS.mods = Object.keys(K.MAP_MODS);
    const G = CTF.Game({ mode: "sim", render: false, seed: 1, map: key });
    K.LABS.mods = [];
    check(CTF.MAP === doc, `the ${key} match is built on the modded map`, CTF.MAP.id);
    const bad = (doc.pickups || []).filter(p => {
      const x = p.p[0],
        z = p.p[2];
      const ground = K.groundBelow(x, z, p.p[1] + 0.5, 0.05);
      return Math.abs(ground - p.p[1]) > 0.05 || !K.freeAt(x, ground + 0.05, z);
    });
    check(
      G && !bad.length,
      `every pickup on ${key} with all mods stands clear on a surface`,
      bad.map(p => p.id)
    );
  }
}
/* blast gates: no spawn, flag or pickup stands where a gate rises */
for (const key of ["arena", "ctf"]) {
  const doc = K.MAPS[key];
  const pts = [
    ...(doc.spawns.ffa || []),
    ...(doc.spawns.teams || []).flat(),
    ...(doc.flags || []),
    ...(doc.pickups || []).map(q => q.p),
  ];
  const hit = [];
  for (const g of K.mapGates(doc))
    for (const [x, z, w, d] of g.leaves)
      for (const q of pts)
        if (Math.abs(q[0] - x) < w / 2 + 1 && Math.abs(q[2] - z) < d / 2 + 1) hit.push([g.id, q]);
  check(
    K.mapGates(doc).length >= 2 && !hit.length,
    `${key}: gates stand clear of spawns, flags and pickups`,
    hit
  );
}
/* callout zones: map data names places, "our" / "their" to a team and "Red" / "Blue" to anyone else */
{
  const V = (x, y, z) => new K.THREE.Vector3(x, y, z);
  const ctf = K.MAPS.ctf,
    arena = K.MAPS.arena;
  check(
    K.zoneLabel(ctf, V(0, 2.4, -43), 0) === "our flag stand" &&
      K.zoneLabel(ctf, V(0, 2.4, -43), 1) === "their flag stand" &&
      K.zoneLabel(ctf, V(0, 2.4, -43), -1) === "Red flag stand",
    "Twin Foundry: the red stand is ours to red, theirs to blue, Red's to everyone else",
    [0, 1, -1].map(t => K.zoneLabel(ctf, V(0, 2.4, -43), t))
  );
  check(
    K.zoneLabel(ctf, V(0, 3, 0), 0) === "top of mid" &&
      K.zoneLabel(ctf, V(-24.5, 2.6, 0), 1) === "west catwalk",
    "shared places have one name for both teams",
    [K.zoneLabel(ctf, V(0, 3, 0), 0), K.zoneLabel(ctf, V(-24.5, 2.6, 0), 1)]
  );
  check(
    K.zoneLabel(arena, V(0, 3.2, 2), -1) === "core top" &&
      K.zoneLabel(arena, V(24, 2.6, 24), -1) === "NE platform" &&
      K.zoneLabel(arena, V(0, 0, 24), -1) === "north lane",
    "the arena names its core, platforms and lanes",
    [V(0, 3.2, 2), V(24, 2.6, 24), V(0, 0, 24)].map(p => K.zoneLabel(arena, p, -1))
  );
  /* every walkable spot on both maps is in some zone */
  for (const [key, doc] of [
    ["arena", arena],
    ["ctf", ctf],
  ]) {
    const pts = [
      ...(doc.spawns.ffa || []),
      ...(doc.spawns.teams || []).flat(),
      ...(doc.pickups || []).map(q => q.p),
    ];
    const out = pts.filter(p => !K.mapZone(doc, V(p[0], p[1], p[2])));
    check(!out.length, `${key}: every spawn and pickup is in a callout zone`, out);
  }
  const bad = (z, what) => {
    const d = clone(K.MAPS.arena);
    d.zones = [z];
    check(!K.validateMap(d).ok, `a zone with ${what} is rejected`, z);
  };
  bad({ name: "<script>", b: [0, 0, 1, 1] }, "a markup name");
  bad({ name: "inside out", b: [5, 5, 1, 1] }, "an inside-out box");
  bad({ name: "sided", side: 2, b: [0, 0, 1, 1] }, "a third side");
  const d = clone(K.MAPS.arena);
  d.ball = [0, "up", 0];
  check(!K.validateMap(d).ok, "a skull spot that isn't a point is rejected", d.ball);
}
finish("maps");
