/* Map heat report from a tools/tune.js run with HEAT=1: where the even matches' pilots spent their time,
   died and killed from, per callout zone and per 2 m cell, and which spawn points got pilots killed.
     HEAT=1 KNOBS=none MATCHES=24 MODE=oddball MAP=arena OUT=heat-oddball-arena.json node tools/tune.js
     node tools/heat-report.js tools/out/heat-oddball-arena.json [variant]
   variant: a knob=value row of that run (default: the baseline).
   Reads:
     zones       time share against area share (a zone pilots avoid is a dead zone), and kills made from
                 the zone against deaths in it (a high ratio is a dominant spot)
     cells       the share of the walkable floor nobody stood on, and the cells with the most kills
                 made from them per death in them
     spawns      spawn points by deaths within 3 s of spawning there (a spawn trap) */
const fs = require("fs");
const CTF = require("../tests/lib/headless.js");
const K = window.KA;
const [file, variant] = process.argv.slice(2);
if (!file) {
  console.error("usage: node tools/heat-report.js <tune output with HEAT=1> [knob=value]");
  process.exit(1);
}
const J = JSON.parse(fs.readFileSync(file, "utf8"));
let r = J.base;
if (variant) {
  const [k, v] = variant.split("=");
  r = J.rows.find(x => x.knob === k && String(x.value) === v);
  if (!r) throw new Error("no row " + variant);
}
const H = r.heat;
if (!H) throw new Error("no heat data (run tools/tune.js with HEAT=1)");
/* the map as played, for its zones and its walkable floor */
const mods = J.MODS || [];
K.LABS.mods = mods;
K.STORE.setBackend(K.STORE.memoryBackend());
CTF.Game({ mode: "sim", render: false, seed: 1, map: J.MAP, rules: J.MODE });
const doc = CTF.MAP,
  NAV = CTF.NAV;
const sum = o => Object.values(o).reduce((a, b) => a + b, 0) || 1;
const pct = (n, d) => ((100 * n) / d).toFixed(1) + "%";
console.log(
  `${J.MODE} on ${doc.name} (${doc.id}), ${J.MATCHES} even matches${variant ? ", " + variant : ""}`
);
/* ---- zones: area from the walkable 1 m nav cells inside each zone ---- */
const area = {};
let walk = 0;
for (let j = 0; j < NAV.H; j++)
  for (let i = 0; i < NAV.W; i++) {
    const c = j * NAV.W + i;
    if (!NAV.ok[c]) continue;
    walk++;
    const p = { x: NAV.X0 + i + 0.5, y: NAV.top[c] + 0.1, z: NAV.Z0 + j + 0.5 };
    const z = K.zoneLabel(doc, p, -1) || "(no zone)";
    area[z] = (area[z] || 0) + 1;
  }
const occN = sum(H.zocc),
  rows = Object.keys({ ...area, ...H.zocc }).map(z => {
    const occ = (H.zocc[z] || 0) / occN,
      ar = (area[z] || 0) / walk,
      k = H.zkill[z] || 0,
      d = H.zdeath[z] || 0;
    return { z, occ, ar, use: ar ? occ / ar : null, k, d, kd: (k + 1) / (d + 1) };
  });
rows.sort((a, b) => b.occ - a.occ);
console.log("\nzone                   time    area   use   kills from  deaths in   k/d");
for (const x of rows)
  console.log(
    `${x.z.padEnd(22)} ${pct(x.occ, 1).padStart(6)} ${pct(x.ar, 1).padStart(6)} ${(x.use == null ? "-" : x.use.toFixed(2)).padStart(5)} ${String(x.k).padStart(10)} ${String(x.d).padStart(10)} ${x.kd.toFixed(2).padStart(6)}`
  );
/* ---- cells: unvisited floor, and the deadliest standing spots ---- */
const cells2 = new Set();
for (let j = 0; j < NAV.H; j++)
  for (let i = 0; i < NAV.W; i++)
    if (NAV.ok[j * NAV.W + i])
      cells2.add(`${Math.floor((NAV.X0 + i + 0.5) / 2)},${Math.floor((NAV.Z0 + j + 0.5) / 2)}`);
const occT = sum(H.occ);
const cold = [...cells2].filter(c => (H.occ[c] || 0) / occT < 0.1 / cells2.size);
console.log(
  `\nfloor: ${cells2.size} walkable 2 m cells; ${pct(cold.length, cells2.size)} saw under a tenth of an even share of pilot time`
);
const hot = Object.keys(H.kill)
  .map(c => ({ c, k: H.kill[c], d: H.death[c] || 0 }))
  .filter(x => x.k >= 8)
  .sort((a, b) => b.k / (b.d + 1) - a.k / (a.d + 1))
  .slice(0, 8);
console.log("cells with the most kills made from them per death in them (x, z in metres):");
for (const x of hot) {
  const [cx, cz] = x.c.split(",").map(Number);
  const p = { x: cx * 2 + 1, y: 0, z: cz * 2 + 1 };
  const ci = NAV.cell(p.x, p.z);
  if (ci >= 0) p.y = NAV.top[ci] + 0.1;
  console.log(
    `  (${p.x}, ${p.z}) ${K.zoneLabel(doc, p, -1) || ""}: ${x.k} kills, ${x.d} deaths, ${(x.k / (x.d + 1)).toFixed(1)} per death`
  );
}
/* ---- spawns ---- */
const sp = Object.entries(H.spawn).sort((a, b) => b[1] - a[1]);
const spN = sum(H.spawn);
console.log(`\nspawn deaths (within 3 s): ${spN === 1 && !sp.length ? 0 : spN} in all; by spawn point:`);
for (const [s, n] of sp.slice(0, 6)) console.log(`  [${s}] ${n} (${pct(n, spN)})`);
