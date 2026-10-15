/* Predicted collision points against where pilots actually die. From every team spawn, the shortest
   path (the AI's own navigation) to each objective: the enemy flag in capture the flag, the skull's
   spots in Oddball, the centre otherwise. A 2 m cell is a collision point when both teams' paths cross
   it at about the same time (run speed; weight exp(-|time difference| / 3 s)). The report compares
   those cells with the deaths in a tools/tune.js run with HEAT=1 (rank correlation, and how many of
   the ten likeliest collision points are among the ten deadliest cells).
     HEAT=1 MODE=ctf MAP=ctf KNOBS=none MATCHES=24 OUT=h.json node tools/tune.js
     node tools/collision-report.js tools/out/h.json */
const fs = require("fs");
const CTF = require("../tests/lib/headless.js");
const K = window.KA;
const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/collision-report.js <tune output with HEAT=1>");
  process.exit(1);
}
const J = JSON.parse(fs.readFileSync(file, "utf8"));
const H = J.base.heat;
if (!H) throw new Error("no heat data (run tools/tune.js with HEAT=1)");
K.LABS.mods = J.MODS || [];
K.STORE.setBackend(K.STORE.memoryBackend());
CTF.Game({ mode: "sim", render: false, seed: 1, map: J.MAP, rules: J.MODE });
const NAV = CTF.NAV,
  doc = CTF.MAP;
const run = K.TUNE.run;
/* objectives for each team */
const goals = team =>
  J.MODE === "ctf" && CTF.FLAG_HOME.length === 2
    ? [CTF.FLAG_HOME[1 - team]]
    : J.MODE === "oddball"
      ? (doc.balls || [doc.ball || [0, 0, 0]]).map(p => new K.THREE.Vector3(p[0], p[1], p[2]))
      : [new K.THREE.Vector3(0, 0, 0)];
/* per team: cell key -> list of arrival times (seconds) */
const arrive = [new Map(), new Map()];
const cell = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
for (const team of [0, 1]) {
  const spawns = J.MODE === "ffa" ? CTF.FFA_SPAWNS : CTF.SPAWNS[team];
  for (const s of spawns)
    for (const g of goals(team)) {
      const a = NAV.nearest(s[0], s[2], s[1]),
        b = NAV.nearest(g.x, g.z, g.y);
      const p = NAV.path(a, b);
      if (!p) continue;
      let d = 0,
        prev = NAV.pos(p[0]);
      for (const c of p) {
        const q = NAV.pos(c);
        d += q.distanceTo(prev);
        prev = q;
        const k = cell(q.x, q.z);
        if (!arrive[team].has(k)) arrive[team].set(k, []);
        arrive[team].get(k).push(d / run);
      }
    }
}
const score = new Map();
for (const [k, ta] of arrive[0]) {
  const tb = arrive[1].get(k);
  if (!tb) continue;
  let w = 0;
  for (const x of ta) for (const y of tb) w += Math.exp(-Math.abs(x - y) / 3);
  score.set(k, w);
}
/* compare with deaths per cell over every cell that has either */
const cells = new Set([...score.keys(), ...Object.keys(H.death)]);
const rows = [...cells].map(k => ({ k, s: score.get(k) || 0, d: H.death[k] || 0 }));
const rank = key => {
  const sorted = rows.map((r, i) => [r[key], i]).sort((a, b) => a[0] - b[0]);
  const rk = Array(rows.length);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++;
    for (let m = i; m <= j; m++) rk[sorted[m][1]] = (i + j) / 2;
    i = j + 1;
  }
  return rk;
};
const rs = rank("s"),
  rd = rank("d");
const n = rows.length,
  mr = (n - 1) / 2;
let num = 0,
  da = 0,
  db = 0;
for (let i = 0; i < n; i++) {
  num += (rs[i] - mr) * (rd[i] - mr);
  da += (rs[i] - mr) ** 2;
  db += (rd[i] - mr) ** 2;
}
const top = key =>
  new Set(
    rows
      .slice()
      .sort((a, b) => b[key] - a[key])
      .slice(0, 10)
      .map(r => r.k)
  );
const ts = top("s"),
  td = top("d");
const both = [...ts].filter(k => td.has(k));
const where = k => {
  const [x, z] = k.split(",").map(Number);
  return `(${x * 2 + 1}, ${z * 2 + 1}) ${K.zoneLabel(doc, { x: x * 2 + 1, y: 0.1, z: z * 2 + 1 }, -1) || ""}`;
};
console.log(
  `${J.MODE} on ${doc.name}: ${score.size} predicted collision cells, ${Object.keys(H.death).length} cells with deaths`
);
console.log(`rank correlation of collision score and deaths: ${(num / Math.sqrt(da * db)).toFixed(3)}`);
console.log(`the ten likeliest collision points among the ten deadliest cells: ${both.length}`);
/* deaths per cell where the paths collide, against cells on only one team's paths */
const onPath = new Set([...arrive[0].keys(), ...arrive[1].keys()]);
const dmean = ks => ks.reduce((a, k) => a + (H.death[k] || 0), 0) / Math.max(1, ks.length);
const coll = [...score.keys()],
  single = [...onPath].filter(k => !score.has(k));
console.log(
  `deaths per cell: ${dmean(coll).toFixed(1)} on the ${coll.length} collision cells, ${dmean(single).toFixed(1)} on the ${single.length} cells only one team's paths use`
);
console.log("likeliest collision points: " + [...ts].map(where).join("; "));
console.log("deadliest cells: " + [...td].map(where).join("; "));
