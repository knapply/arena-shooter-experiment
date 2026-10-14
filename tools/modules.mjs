/* Shared knowledge about the module layout, used by the build, the linter config and the docs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as acorn from "acorn";
/* engine modules written as ES modules build into the shared scope too (tools/esm.cjs) */
export const { isEsm, toScript } = createRequire(import.meta.url)("./esm.cjs");
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SRC = path.join(ROOT, "src");
export const read = p => fs.readFileSync(path.join(SRC, p), "utf8");
/* a module as it goes into the shared scope (an ES module's imports and export keywords dropped) */
export const readScript = p => toScript(read(p), p);
export const manifest = () => JSON.parse(read("manifest.json"));
/* top-level names a module declares (functions, classes, every declarator of const/let/var; in an ES
   module, its exported and unexported declarations, not what it imports) */
export function declarations(code) {
  const esm = isEsm(code);
  const ast = acorn.parse(code, {
    ecmaVersion: "latest",
    sourceType: esm ? "module" : "script",
    allowReturnOutsideFunction: !esm,
  });
  const names = [];
  const pat = p => {
    if (!p) return;
    if (p.type === "Identifier") names.push(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach(q => pat(q.value || q.argument));
    else if (p.type === "ArrayPattern") p.elements.forEach(pat);
    else if (p.type === "AssignmentPattern") pat(p.left);
    else if (p.type === "RestElement") pat(p.argument);
  };
  for (let n of ast.body) {
    if (n.type === "ExportNamedDeclaration" && n.declaration) n = n.declaration;
    if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") names.push(n.id.name);
    else if (n.type === "VariableDeclaration") n.declarations.forEach(d => pat(d.id));
  }
  return names;
}
/* every module that runs in the engine's shared scope in some build: the game's engine list, then the
   trailer build's additions and the simulation bundle's own modules (worker-only, like data/map-check.js) */
export function engineFiles() {
  const m = manifest();
  const extra = [...m.trailer.engine, ...m.worker.engine].filter(p => !m.engine.includes(p));
  return [...m.engine, ...new Set(extra)];
}
/* engine modules share one scope: map each module to what it declares */
export function engineScope() {
  return engineFiles().map(p => ({ path: p, names: declarations(read(p)) }));
}
