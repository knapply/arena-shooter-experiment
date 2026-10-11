/* Performance budgets that do not need a GPU: shipped size and simulation cost per step. */
const fs = require("fs"),
  path = require("path");
const { check, finish } = require("./lib/check.js");
const B = require("./budgets.json");
const kb = fs.statSync(path.join(__dirname, "..", "index.html")).size / 1024;
check(kb <= B.buildKB, `index.html within ${B.buildKB} KB`, `${kb.toFixed(0)} KB`);
const CTF = require("./lib/headless.js");
CTF.NAV.build(CTF.buildMap().solids);
const G = CTF.Game({ mode: "sim", render: false });
G.start();
let n = 0;
const t0 = process.hrtime.bigint();
while (!G.over) {
  G.step(1 / 30);
  n++;
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
check(
  ms <= B.simStepMs,
  `AI simulation step within ${B.simStepMs} ms`,
  `${ms.toFixed(3)} ms over ${n} steps`
);
finish("perf");
