#!/usr/bin/env node
/* Where the shipped bytes go: each module minified on its own (wrapped in a function, so its top-level
   names shrink the way they do in the real bundle), the inline scripts, the styles and the page markup.
     node tools/sizes.mjs [--json]    largest first; the total is close to the built index.html */
import { transformSync } from "esbuild";
import { read, readScript, manifest } from "./modules.mjs";

const man = manifest();
const min = (code, loader = "js") =>
  transformSync(code, { loader, minify: true, target: "es2020", legalComments: "none" }).code.length;
const page = read("html/index.html");
const markup = s => s.replace(/<!--(?!@)[\s\S]*?-->/g, "").replace(/\n\s+/g, "\n");
const rows = [
  ...man.engine.map(p => [p, min(`(()=>{"use strict";${readScript(p)}})();`)]),
  ...man.modes.map(p => [p, min(read(p))]),
  ...[...page.matchAll(/<!--@script ([\w./-]+)-->/g)].map(([, p]) => [p + " (inline script)", min(read(p))]),
  ["styles", min(man.styles.map(read).join("\n"), "css")],
  [
    "html/index.html (markup and partials)",
    markup(page.replace(/<!--@partial ([\w./-]+)-->/g, (_, p) => read(p))).replace(/<!--@[^>]*-->/g, "")
      .length,
  ],
];
rows.sort((a, b) => b[1] - a[1]);
if (process.argv.includes("--json")) console.log(JSON.stringify(Object.fromEntries(rows)));
else {
  for (const [p, n] of rows) console.log(`${(n / 1024).toFixed(1).padStart(7)} KB  ${p}`);
  console.log(`${(rows.reduce((s, r) => s + r[1], 0) / 1024).toFixed(1).padStart(7)} KB  total`);
}
