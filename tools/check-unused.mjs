/* Engine modules share one scope, so ESLint cannot see a top-level name that no module uses.
   This reports engine declarations referenced nowhere else in the source. */
import { engineScope, manifest, read } from "./modules.mjs";
const all = [...manifest().engine, ...manifest().modes, "net/p2p-transport.js"].map(read).join("\n");
const unused = [];
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
