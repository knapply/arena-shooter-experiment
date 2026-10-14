/* Save data: versioned documents, migrations, backups and hostile input. */
const fs = require("fs"),
  path = require("path");
const { check, finish } = require("./lib/check.js");
const mem = new Map();
global.window = global;
global.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: k => void mem.delete(k),
};
const { toScript } = require("../tools/esm.cjs");
const STORE = (0, eval)(
  toScript(fs.readFileSync(path.join(__dirname, "..", "src", "core", "store.js"), "utf8")) + "\nSTORE"
);

/* legacy keys move into versioned documents once */
mem.set("ka-pilot", JSON.stringify({ n: "Ace", c: "#62cdff", vo: false }));
const p = STORE.load("pilot");
check(p && p.n === "Ace" && p.vo === false, "old pilot save is read", p);
check(!mem.has("ka-pilot"), "old key is removed after the move");
const env = JSON.parse(mem.get("ka-doc-pilot") || "null");
check(
  env && env.app === "kinetic-arena" && env.doc === "pilot" && env.version === 1,
  "documents are wrapped in a versioned envelope",
  env
);

/* settings v1 (the export file format) migrates to the current version */
mem.clear();
mem.set(
  "ka-settings-v1",
  JSON.stringify({
    app: "kinetic-arena",
    version: 1,
    settings: { fov: 95 },
    keys: { jump: ["Space"] },
    pad: {},
  })
);
const s = STORE.load("settings");
check(
  s && s.settings.fov === 95 && s.keys.jump[0] === "Space" && !("app" in s),
  "settings migrate from v1 to the current version",
  s
);
check(
  JSON.parse(mem.get("ka-doc-settings")).version === 3,
  "migrated settings are saved at the current version"
);
/* v3: the motion tracker's default moved to bottom left; a save on the old default moves with it,
   any other spot stays */
for (const [from, to] of [
  ["br", "bl"],
  ["tc", "tc"],
]) {
  mem.clear();
  mem.set(
    "ka-doc-settings",
    JSON.stringify({
      app: "kinetic-arena",
      doc: "settings",
      version: 2,
      data: { settings: { trackerPos: from, fov: 90 }, keys: {}, pad: {} },
    })
  );
  const t = STORE.load("settings");
  check(
    t && t.settings.trackerPos === to && t.settings.fov === 90,
    `a v2 save with the tracker at ${from} loads with it at ${to}`,
    t
  );
}

/* backup before overwrite, and restore */
STORE.save("settings", { settings: { fov: 100 }, keys: {}, pad: {} });
STORE.save("settings", { settings: { fov: 70 }, keys: {}, pad: {} });
check(STORE.load("settings").settings.fov === 70, "latest save wins");
check(
  JSON.parse(mem.get("ka-doc-settings.bak")).data.settings.fov === 100,
  "previous copy is kept as a backup"
);
STORE.restoreBackup("settings");
check(STORE.load("settings").settings.fov === 100, "restoring the backup undoes the last save");

/* data from a newer build is left alone, junk is ignored, documents are cleaned */
mem.set("ka-doc-settings", JSON.stringify({ app: "kinetic-arena", doc: "settings", version: 99, data: {} }));
check(STORE.load("settings") === null, "a save from a newer version is not loaded or overwritten");
check(JSON.parse(mem.get("ka-doc-settings")).version === 99, "the newer save is still intact");
for (const junk of [
  "{",
  "null",
  "[]",
  '"x"',
  JSON.stringify({ app: "other", doc: "pilot", version: 1, data: {} }),
]) {
  mem.set("ka-doc-pilot", junk);
  let ok = true;
  try {
    ok = STORE.load("pilot") === null;
  } catch (e) {
    ok = false;
  }
  check(ok, "junk is ignored: " + junk.slice(0, 30));
}
mem.set(
  "ka-doc-pilot",
  JSON.stringify({
    app: "kinetic-arena",
    doc: "pilot",
    version: 1,
    data: { n: "x".repeat(99), c: 5, vo: "no" },
  })
);
const c = STORE.load("pilot");
check(c.n.length === 14 && c.c === "" && c.vo === true, "loaded documents are cleaned", c);

/* the backend can be swapped (a folder or desktop files later) */
STORE.setBackend(STORE.memoryBackend());
check(STORE.load("pilot") === null, "a fresh backend starts empty");
STORE.save("ctfTeam", 1);
check(STORE.load("ctfTeam") === 1, "documents round-trip through a swapped backend");
finish("store");
