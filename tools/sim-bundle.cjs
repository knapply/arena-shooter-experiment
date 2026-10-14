/* The background simulation bundle: simulation modules with rendering stubbed out (see the "worker"
   section of src/manifest.json). Used by build.mjs for sim-worker.js and by tests/lib/headless.js. */
const { toScript } = require("./esm.cjs");
module.exports = function simBundle(readRaw, man, { entry = true } = {}) {
  const w = man.worker;
  /* engine modules written as ES modules join the shared scope like the rest (tools/esm.cjs) */
  const read = p => toScript(readRaw(p), p);
  return [
    ...w.env.map(read),
    `(function () {\n"use strict";\n${read(w.prelude)}\n${w.engine.map(read).join("\n")}\n${read(w.exports)}\n})();`,
    ...w.modes.map(read),
    entry ? read(w.entry) : "",
  ].join("\n");
};
