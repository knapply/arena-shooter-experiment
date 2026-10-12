/* Engine modules share one scope, so ESLint cannot see a top-level name that no module uses, or
   two modules declaring the same name (a later function silently replaces an earlier one).
   This reports engine declarations referenced nowhere else in the source, and duplicates. */
import { engineScope, manifest, read } from "./modules.mjs";
const all = [...manifest().engine, ...manifest().modes, "net/p2p-transport.js"].map(read).join("\n");
const unused = [];
const seen = new Map(),
  dup = [];
for (const { path, names } of engineScope())
  for (const n of names) {
    if (seen.has(n)) dup.push(`${n}: src/${seen.get(n)} and src/${path}`);
    else seen.set(n, path);
  }
if (dup.length) {
  console.error(`engine names declared twice:\n  ${dup.join("\n  ")}`);
  process.exit(1);
}
for (const { path, names } of engineScope())
  for (const n of names) {
    const hits = all.match(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`, "g")) || [];
    if (hits.length <= 1) unused.push(`src/${path}: ${n}`);
  }
if (unused.length) {
  console.error(`unused engine declarations:\n  ${unused.join("\n  ")}`);
  process.exit(1);
}
console.log("no unused engine declarations");
