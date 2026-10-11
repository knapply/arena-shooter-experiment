/* The background simulation bundle: simulation modules with rendering stubbed out (see the "worker"
   section of src/manifest.json). Used by build.mjs for sim-worker.js and by tests/lib/headless.js. */
module.exports = function simBundle(read, man, { entry = true } = {}) {
  const w = man.worker;
  return [
    ...w.env.map(read),
    `(function () {\n"use strict";\n${read(w.prelude)}\n${w.engine.map(read).join("\n")}\n${read(w.exports)}\n})();`,
    ...w.modes.map(read),
    entry ? read(w.entry) : "",
  ].join("\n");
};
