/* Engine modules can be written as ES modules: explicit `import { x } from "./y.js"` and `export` on
   their top-level declarations, so their dependencies are visible and checked. They still build into
   the engine's one shared scope: toScript drops the import statements and the export keywords, and
   the manifest order (each module after what it imports) keeps every name defined before use.
   Supported: `import { a, b } from "./m.js";` and `export const|let|function|class ...`. */
const isEsm = code => /^(import|export)\s/m.test(code);
function toScript(code, file = "module") {
  if (!isEsm(code)) return code;
  const out = code
    .replace(/^import\s*\{[^}]*\}\s*from\s*"[^"]+";[ \t]*\r?\n/gm, "")
    .replace(/^export\s+(?=(?:const|let|function|class|async)\b)/gm, "");
  if (/^(import|export)\b/m.test(out))
    throw new Error(`${file}: only "import { names } from" and "export <declaration>" are supported`);
  return out;
}
module.exports = { isEsm, toScript };
