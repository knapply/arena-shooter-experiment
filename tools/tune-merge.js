/* Combines several tools/tune.js outputs (different knob groups, seed sets or locks) into one file.
     node tools/tune-merge.js out.json a.json b.json ...
   Each row keeps the seed set and lock it was measured on, and its skill change against the baseline
   of that same run (dSkill), so rows from different runs can be compared side by side. */
const fs = require("fs");
const [outFile, ...inputs] = process.argv.slice(2);
if (!outFile || !inputs.length) {
  console.error("usage: node tools/tune-merge.js out.json in1.json in2.json ...");
  process.exit(1);
}
const runs = [],
  rows = [];
for (const f of inputs) {
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const bases = d.bases || { none: d.base };
  runs.push({
    file: f,
    SEED: d.SEED,
    MAP: d.MAP,
    MODE: d.MODE,
    MATCHES: d.MATCHES,
    MINUTES: d.MINUTES,
    DIFF: d.DIFF,
    bases,
  });
  for (const r of d.rows) {
    const b = bases[r.lock || "none"];
    rows.push({
      ...r,
      seed: d.SEED,
      map: d.MAP,
      dSkill: b ? +(r.skill - b.skill).toFixed(3) : null,
      file: f,
    });
  }
}
rows.sort((a, b) =>
  a.knob !== b.knob ? (a.knob < b.knob ? -1 : 1) : a.value !== b.value ? a.value - b.value : a.seed - b.seed
);
fs.writeFileSync(outFile, JSON.stringify({ runs, rows }, null, 1));
console.log(`${rows.length} rows from ${inputs.length} runs → ${outFile}`);
