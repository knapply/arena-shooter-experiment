/* Compare two network lab report folders (before and after a change), per profile and mode:
     node tools/net-lab-compare.js tools/out/net-lab/before tools/out/net-lab/after > compare.md */
const fs = require("fs"),
  path = require("path");
const [A, B] = process.argv.slice(2);
const load = d =>
  Object.fromEntries(
    fs
      .readdirSync(d)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const R = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
        return [R.profile, R];
      })
  );
const a = load(A),
  b = load(B);
const up = r => {
  const bw = Object.values(r.bw || {});
  const h = bw.find(x => x.role === "host" || x.role === "hub");
  const c = bw.filter(x => x !== h);
  return [h ? h.upKBps : null, c.length ? c.reduce((s, x) => s + x.upKBps, 0) / c.length : null];
};
const f = (v, d = 1) => (v == null ? "–" : (+v).toFixed(d));
const out = [
  "| profile | mode | host up KB/s | client up KB/s | delay ms | p95 err m | pops/min | false rejects | kill→display p50 ms | desync | migration ms | GC/min (host) |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
];
for (const p of Object.keys(a)) {
  if (!b[p]) continue;
  for (const m of Object.keys(a[p].modes)) {
    const x = a[p].modes[m],
      y = b[p].modes[m];
    if (!x || !y || x.error || y.error) continue;
    const ux = up(x),
      uy = up(y);
    const hx = (x.instances || [])[0] || {},
      hy = (y.instances || [])[0] || {};
    const mig = r => (r.migration ? (r.migration.ms < 0 ? "fail" : r.migration.ms) : "–");
    out.push(
      `| ${p} | ${m} | ${f(ux[0])} → ${f(uy[0])} | ${f(ux[1])} → ${f(uy[1])} | ${x.pos.delayMs} → ${y.pos.delayMs} | ${f(x.pos.p95ErrM, 2)} → ${f(y.pos.p95ErrM, 2)} | ${f(x.pos.popsPerMin)} → ${f(y.pos.popsPerMin)} | ${x.hits.rejected}/${x.hits.applied + x.hits.rejected} → ${y.hits.rejected}/${y.hits.applied + y.hits.rejected} | ${x.kills.medianMs} → ${y.kills.medianMs} | ${f(x.desync.rate, 3)} → ${f(y.desync.rate, 3)} | ${mig(x)} → ${mig(y)} | ${f(hx.gcPerMin, 0)} → ${f(hy.gcPerMin, 0)} |`
    );
  }
}
console.log(out.join("\n"));
