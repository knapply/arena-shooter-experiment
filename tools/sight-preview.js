/* Screenshots of every weapon's reticle and aiming sight, for working on ui/reticle.js and its styles.
     THREE_PATH=... node tools/sight-preview.js [out-dir] [--only weapon-key]
   per weapon: at the hip, at the hip with an enemy under the reticle (red) and a hit marker, aiming
   down sights; the sniper also at its second zoom level and with a controller (the hint shows the
   controller's button). Real three.js (software WebGL); the world is frozen (timescale 0) for each shot. */
const fs = require("fs"),
  path = require("path");
const { launch, ROOT, routeThree } = require("../tests/lib/browser.js");
const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith("--") ? args[0] : "sight-shots";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
if (!process.env.THREE_PATH) {
  console.error(
    "set THREE_PATH to three.module.min.js (three.js at the version in src/manifest.json, three.core.min.js beside it)"
  );
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const pad = (btns = {}) => ({
  connected: true,
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!btns[i], value: btns[i] ? 1 : 0 })),
});
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => console.log("page error:", e.message));
  await p.addInitScript(() => {
    window.__pad = null;
    navigator.getGamepads = () => (window.__pad ? [window.__pad] : []);
    localStorage.setItem(
      "ka-doc-settings",
      JSON.stringify({
        app: "kinetic-arena",
        doc: "settings",
        version: 3,
        data: { settings: { intros: false, dropIn: false }, keys: {}, pad: {} },
      })
    );
  });
  await routeThree(p);
  await p.goto("file://" + path.join(ROOT, "index.html"));
  await p.waitForTimeout(1200);
  await p.click("#deploy");
  await p.waitForFunction(() => KA.playing !== false && !KA.me.dead, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  /* a first click takes the mouse (the aim button needs it) */
  await p.mouse.click(640, 360);
  const run = async (s, ms) => {
    await p.evaluate(s => KA.CON.run("timescale " + s), s);
    await p.waitForTimeout(ms);
    await p.evaluate(() => KA.CON.run("timescale 0"));
    await p.waitForTimeout(120);
  };
  const shot = async name => {
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(out, name + ".png") });
    console.log("  " + name);
  };
  /** you facing the longest open sight line, a drone d metres ahead (or out of the way) */
  const scene = d =>
    p.evaluate(d => {
      const me = KA.me,
        V = KA.THREE.Vector3;
      me.pos.set(-30, 0, 30);
      let best = 0;
      for (let i = 0; i < 72; i++) {
        const y = (i / 72) * Math.PI * 2,
          L = KA.rayWorld(new V(-30, 1.6, 30), new V(-Math.sin(y), 0, -Math.cos(y)), 120);
        if (L > best) {
          best = L;
          me.yaw = y;
        }
      }
      me.pitch = -0.02;
      me.shield = 70;
      me.spawnT = -99;
      KA.bots.forEach((x, i) => x.body.pos.set(60 + i * 3, -40, 60));
      if (d) {
        const t = KA.bots[0].body;
        t.dead = false;
        t.pos.set(me.pos.x - Math.sin(me.yaw) * d, 0, me.pos.z - Math.cos(me.yaw) * d);
        t.yaw = me.yaw + Math.PI;
        /* (it holds its fire, so no damage arcs in the shots) */
        KA.bots[0].acqT = KA.bots[0].seenT = 1e9;
      }
    }, d);
  const keys = await p.evaluate(() => KA.WEAPON_DATA.map(w => w.key));
  for (const key of ["pistol", "carbine", "sniper", "rocket", "scatter", "shotgun"]) {
    if (!keys.includes(key) || (only && only !== key)) continue;
    await p.evaluate(t => KA.giveWeapon(t, null), keys.indexOf(key));
    await scene(0);
    await run(1, 600);
    await shot(`${key}-hip`);
    await scene(key === "scatter" || key === "shotgun" ? 8 : 18);
    await run(0.05, 200);
    await p.evaluate(() => KA.hitMarker("sh"));
    await run(0.02, 60);
    await shot(`${key}-red-hit`);
    await scene(key === "sniper" ? 40 : 18);
    await p.mouse.move(640, 360);
    await p.mouse.down({ button: "right" });
    await run(1, 200);
    /* (a click that only took the mouse doesn't count: press again) */
    for (let i = 0; i < 3 && !(await p.evaluate(() => KA.aiming)); i++) {
      await p.mouse.up({ button: "right" });
      await p.mouse.down({ button: "right" });
      await run(1, 200);
    }
    await run(1, 300);
    await shot(`${key}-ads`);
    if (key === "sniper") {
      await p.keyboard.press("ShiftLeft");
      await run(1, 400);
      await shot(`${key}-ads2`);
    }
    await p.mouse.up({ button: "right" });
    await run(1, 400);
    if (key === "sniper") {
      /* the controller: hold the aim trigger, then the left stick click for the second level */
      await p.evaluate(p => (window.__pad = p), pad({ 6: 1 }));
      await run(1, 500);
      await shot(`${key}-pad-ads`);
      await p.evaluate(p => (window.__pad = p), pad({ 6: 1, 10: 1 }));
      await run(1, 100);
      await p.evaluate(p => (window.__pad = p), pad({ 6: 1 }));
      await run(1, 400);
      await shot(`${key}-pad-ads2`);
      await p.evaluate(() => (window.__pad = null));
      await run(1, 300);
    }
  }
  await b.close();
})();
