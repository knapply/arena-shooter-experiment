/* Screenshots of the arena and Twin Foundry at a graphics preset, for working on the look.
     THREE_PATH=... node tools/gfx-preview.js [preset] [outDir] [--hw] [--fx]
   preset   low | medium | high | ultra (default high)
   --hw     use the machine's GPU instead of software WebGL (also reports GPU time per pass when the
            browser exposes timer queries)
   --fx     fire a burst and set off an explosion in front of the camera before each shot
   --pilot  put a pilot 3.5 m in front of the camera, its shield just hit
   --cmd=c  run a developer console command first (e.g. --cmd="bake on")
   --only=v only the views whose name contains v
   Writes <outDir>/<preset>-<view>.png (default tools/out/) and prints draw calls per view. */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { open } = require("../tests/lib/browser.js");
const args = process.argv.slice(2);
const flags = new Set(args);
const [preset = "high", outArg] = args.filter(a => !a.startsWith("--"));
const OUT = outArg || path.join(__dirname, "out");
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.js r128's three.min.js");
  process.exit(1);
}
/* [name, map, x, y, z, yaw, pitch]; yaw "sun" looks just under the sun */
const VIEWS = [
  ["arena-mid", "arena", -22, 0, 15, 0.3, -0.06],
  ["arena-corner", "arena", 30, 0, -30, 2.4, 0.02],
  ["arena-up", "arena", 0, 0, -26, 3.1, 0.35],
  ["arena-wall", "arena", 6, 0, -27, 0.5, 0.18],
  ["arena-fan", "arena", -24, 0, -32, 0.15, 0.1],
  ["arena-sky", "arena", 0, 0, 20, 3.3, 0.12],
  ["arena-sun", "arena", -20, 0, -20, "sun", 0],
  ["arena-sunwall", "arena", -30, 0, -30, "sun", 0],
  ["foundry", "ctf", 0, 0, -40, 0, -0.04],
  ["foundry-mid", "ctf", 8, 0, -6, 2.6, 0.02],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const hw = flags.has("--hw");
  const b = await chromium.launch({
    args: hw
      ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"]
      : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await open(ctx, { realThree: true, hash: "#dev" });
  await p.waitForTimeout(1500);
  await p.click("#openSet");
  await p.selectOption("#set_preset", preset);
  await p.click("#setDone");
  await p.evaluate(() => {
    Object.assign(KA.SET, { dynRes: false, spawnStyle: "classic", perfOverlay: true });
    KA.applySettings();
  });
  for (const a of args.filter(a => a.startsWith("--cmd="))) await p.evaluate(c => KA.CON.run(c), a.slice(6));
  await p.click("#deploy");
  await p.waitForTimeout(1500);
  await p.addStyleTag({ content: "#toast, .status { visibility: hidden !important; }" });
  const only = (args.find(a => a.startsWith("--only=")) || "").slice(7);
  for (const [name, map, x, y, z, yaw, pitch] of VIEWS) {
    if (only && !name.includes(only)) continue;
    if (map !== "arena") {
      await p.evaluate(id => {
        const C = window.CTF;
        C.useMap(id);
        C.buildMap();
        C.enterMap();
      }, map);
      await p.waitForTimeout(500);
    }
    await p.evaluate(
      ([x, y, z, yaw, pitch]) => {
        if (yaw === "sun") {
          const s = KA.sun.position.clone().normalize();
          yaw = Math.atan2(-s.x, -s.z);
          pitch = Math.asin(s.y) - 0.3;
        }
        window.__hold = { x, y, z, yaw, pitch };
        if (window.__holding) return;
        window.__holding = true;
        (function hold() {
          const h = window.__hold;
          KA.me.pos.set(h.x, h.y, h.z);
          KA.me.vel.set(0, 0, 0);
          KA.me.yaw = h.yaw;
          KA.me.pitch = h.pitch;
          for (const o of KA.bots) o.body.pos.set(200, -50, 200);
          requestAnimationFrame(hold);
        })();
      },
      [x, y, z, yaw, pitch]
    );
    await p.waitForTimeout(hw ? 1500 : 3000);
    if (flags.has("--fx"))
      await p.evaluate(() => {
        const c = KA.camera.getWorldPosition(new KA.THREE.Vector3()),
          d = KA.camera.getWorldDirection(new KA.THREE.Vector3());
        const at = c.clone().addScaledVector(d, 9);
        at.y = Math.max(0.3, at.y - 1);
        KA.blast(at, 0xffa040, 4);
        for (let i = 0; i < 6; i++)
          KA.tracer(
            c.clone().add(new KA.THREE.Vector3(2, -0.4, 0)),
            at.clone().add(new KA.THREE.Vector3(i - 3, 1, 4)),
            0xffd28a
          );
      });
    if (flags.has("--pilot"))
      await p.evaluate(() => {
        const K = KA;
        let q = K.pilotById("actor:look");
        if (!q) {
          q = K.addPilot(new K.Pilot({ id: "actor:look", name: "", color: "#ff6a5c", ctl: "script" }));
          q.rig.showTag(false);
        }
        const c = K.camera.getWorldPosition(new K.THREE.Vector3()),
          d = K.camera.getWorldDirection(new K.THREE.Vector3());
        d.y = 0;
        d.normalize();
        q.body.pos.set(
          c.x + d.x * 2.2,
          K.groundBelow(c.x + d.x * 2.2, c.z + d.z * 2.2, c.y),
          c.z + d.z * 2.2
        );
        q.body.yaw = Math.atan2(d.x, d.z) + 0.5;
        for (let i = 0; i < 60; i++) q.pose(1 / 60, { wpn: 1 });
        q.rig.flashHit(c, "body");
        for (let i = 0; i < 6; i++) q.pose(1 / 60, { wpn: 1 });
        K.CON.run("timescale 0");
      });
    if (flags.has("--fx") || flags.has("--pilot")) await p.waitForTimeout(hw ? 120 : 400);
    const file = path.join(OUT, `${preset}-${name}.png`);
    await p.screenshot({ path: file });
    const info = await p.evaluate(() => ({
      calls: KA.renderer.info.render.calls,
      tris: KA.renderer.info.render.triangles,
      perf: document.getElementById("perfHud") ? document.getElementById("perfHud").innerText : "",
    }));
    console.log(`${name}: ${info.calls} calls, ${(info.tris / 1000).toFixed(1)}k tris -> ${file}`);
    if (hw) console.log(info.perf.replace(/\n/g, " | "));
  }
  if (ctx.pages()[0].errors) console.log("errors:", ctx.pages()[0].errors.slice(0, 5));
  await b.close();
})();
