/* Engine modules share one scope, so ESLint cannot see a top-level name that no module uses, or
   two modules declaring the same name (a later function silently replaces an earlier one).
   This reports engine declarations referenced nowhere else in the source, duplicates, and window.KA
   keys that no mode, test or tool reads. */
import { engineFiles, engineScope, manifest, read } from "./modules.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const man = manifest();
const all = [...engineFiles(), ...man.modes, ...man.trailer.modes, man.worker.exports, "net/p2p-transport.js"]
  .map(read)
  .join("\n");
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
/* window.KA (game/exports.js) is the surface for the modes, tests and tools: a key that none of them
   reads as K.name or KA.name is dead weight */
const exp = read("game/exports.js"),
  apiAt = exp.indexOf("const KA_API = {"),
  api = exp.slice(apiAt, exp.indexOf("\n};", apiAt));
const keys = [...api.matchAll(/^ {2}(?:get |set )?([A-Za-z_$][\w$]*)\s*(?:[,:(]|$)/gm)].map(m => m[1]);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const walk = d =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap(e =>
      e.isDirectory()
        ? /^(node_modules|out|visual)$/.test(e.name)
          ? []
          : walk(path.join(d, e.name))
        : /\.(js|mjs|cjs)$/.test(e.name) && e.name !== "exports.js"
          ? [path.join(d, e.name)]
          : []
    );
const readers = ["src", "tests", "tools"]
  .flatMap(d => walk(path.join(ROOT, d)))
  .map(f => fs.readFileSync(f, "utf8"))
  .join("\n");
const unread = keys.filter(
  k => !new RegExp(`\\b(K|KA)\\.${k.replace(/\$/g, "\\$")}(?![\\w$])`).test(readers)
);
if (unread.length) {
  console.error(`window.KA keys nothing reads (src/game/exports.js):\n  ${unread.join("\n  ")}`);
  process.exit(1);
}
console.log("no unused engine declarations or KA keys");
