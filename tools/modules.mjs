/* Shared knowledge about the module layout, used by the build, the linter config and the docs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SRC = path.join(ROOT, "src");
export const read = p => fs.readFileSync(path.join(SRC, p), "utf8");
export const manifest = () => JSON.parse(read("manifest.json"));
/* top-level names a module declares (functions, classes, every declarator of const/let/var) */
export function declarations(code) {
  const ast = acorn.parse(code, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowReturnOutsideFunction: true,
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
  for (const n of ast.body) {
    if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") names.push(n.id.name);
    else if (n.type === "VariableDeclaration") n.declarations.forEach(d => pat(d.id));
  }
  return names;
}
/* engine modules share one scope: map each module to what it declares */
export function engineScope() {
  const m = manifest();
  return m.engine.map(p => ({ path: p, names: declarations(read(p)) }));
}
