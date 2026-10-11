/* Loads the background-simulation bundle (the same code as sim-worker.js, see the "worker" section of
   src/manifest.json) into Node, for fast headless AI matches and scenario tests. */
const fs = require("fs"),
  path = require("path");
const SRC = path.join(__dirname, "..", "..", "src");
const read = p => fs.readFileSync(path.join(SRC, p), "utf8");
const simBundle = require("../../tools/sim-bundle.cjs");
global.window = global;
global.localStorage = {
  _: {},
  getItem(k) {
    return this._[k] || null;
  },
  setItem(k, v) {
    this._[k] = v;
  },
  removeItem(k) {
    delete this._[k];
  },
};
(0, eval)(simBundle(read, JSON.parse(read("manifest.json")), { entry: false }));
module.exports = window.CTF;
