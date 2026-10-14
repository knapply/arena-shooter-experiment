/* Which knobs moved skill share beyond the noise, from a merged tuning run (tools/tune-merge.js).
     node tools/tune-summary.js merged.json [CTRL_KNOB]   writes Markdown to stdout
   Null controls are rows of CTRL_KNOB (default sbRun) within 0.001 of its default: settings that cannot
   matter to play but reshuffle the matches like a real change (docs/TUNING.md). Per seed set and lock,
   the centre is the mean skill share of the baseline and its controls, and the noise is the largest
   distance of any of them from it. A knob value is reported when its effect clears the noise on every
   seed set with the same sign; values that clear it on only some seed sets are listed separately. */
const fs = require("fs");
const [file, ctrlKnob = "sbRun"] = process.argv.slice(2);
if (!file) {
  console.error("usage: node tools/tune-summary.js merged.json [CTRL_KNOB]");
  process.exit(1);
}
const { runs, rows } = JSON.parse(fs.readFileSync(file, "utf8"));
const isCtrl = r => r.knob === ctrlKnob && Math.abs(r.value - r.def) < 0.001;
const key = (seed, lock) => `${seed}|${lock || "none"}`;
/* the noise per seed set and lock: baseline and controls around their mean */
const noise = new Map();
for (const run of runs)
  for (const [lock, b] of Object.entries(run.bases || {})) {
    const k = key(run.SEED, lock === "none" ? null : lock);
    const skills = [b.skill, ...rows.filter(r => isCtrl(r) && key(r.seed, r.lock) === k).map(r => r.skill)];
    const prev = noise.get(k);
    /* several runs share a seed set (one per knob group): their baselines agree, so keep the widest */
    if (!prev || skills.length > prev.n) {
      const c = skills.reduce((a, s) => a + s, 0) / skills.length;
      noise.set(k, { c, w: Math.max(...skills.map(s => Math.abs(s - c))), n: skills.length });
    }
  }
const fmt = v => (v >= 0 ? "+" : "") + v.toFixed(3);
const byVariant = new Map();
for (const r of rows) {
  if (isCtrl(r)) continue;
  const n = noise.get(key(r.seed, r.lock));
  if (!n) continue;
  const v = `${r.knob}=${r.value}${r.lock ? ` [${r.lock}]` : ""}`;
  if (!byVariant.has(v)) byVariant.set(v, { def: r.def, cells: [] });
  byVariant.get(v).cells.push({ seed: r.seed, e: r.skill - n.c, w: n.w, ctrls: n.n - 1 });
}
const clear = [],
  partial = [];
for (const [v, { def, cells }] of byVariant) {
  const out = cells.filter(c => Math.abs(c.e) > c.w);
  if (!out.length) continue;
  const line = `| ${v} (default ${def}) | ${cells.map(c => `${c.seed}: ${fmt(c.e)} (±${c.w.toFixed(3)})`).join(", ")} |`;
  const same = cells.every(c => Math.sign(c.e) === Math.sign(cells[0].e));
  if (out.length === cells.length && same && cells.length > 1) clear.push(line);
  else partial.push(line);
}
const ctrls = [...noise.values()].map(n => n.n - 1);
let md = `## Tuning run: ${runs.length} parts, ${rows.length} rows\n\n`;
md += `Seed sets: ${[...new Set(runs.map(r => r.SEED))].join(", ")}; ${runs[0] ? `${runs[0].MATCHES} matches of ${runs[0].MINUTES} min per kind` : ""}; null controls per seed set: ${Math.min(...ctrls)} to ${Math.max(...ctrls)}.\n\n`;
if (!Math.max(...ctrls))
  md += "**No null controls in this run**: the noise is the baseline alone, so every effect is reported.\n\n";
const table = list =>
  `| Variant | Effect on skill share by seed set (noise) |\n|---|---|\n${list.join("\n")}\n\n`;
md += clear.length
  ? `### Beyond the noise on every seed set, same sign\n\n${table(clear)}`
  : "### Nothing moved beyond the noise on every seed set\n\n";
if (partial.length) md += `### Beyond the noise on some seed sets only\n\n${table(partial)}`;
process.stdout.write(md);
