/* Screenshots of every shield state, yours and another pilot's, for working on how shields read.
     THREE_PATH=... node tools/shield-preview.js [outDir] [--hw]
   Yours: full, low (the warning), the moment it breaks, down (the alarm), the recharge starting.
   A pilot 3 m in front: a hit on its shield, the moment it breaks and just after, unshielded, recharging.
   Writes <outDir>/<state>.png (default tools/out/shields/). */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { open } = require("../tests/lib/browser.js");
const args = process.argv.slice(2);
const OUT = args.find(a => !a.startsWith("--")) || path.join(__dirname, "out", "shields");
if (!process.env.THREE_PATH) {
  console.error(
    "set THREE_PATH to three.module.min.js (three.js at the version in src/manifest.json, three.core.min.js beside it)"
  );
  process.exit(1);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const hw = args.includes("--hw");
  const b = await chromium.launch({
    args: hw
      ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"]
      : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await open(ctx, { realThree: true });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    Object.assign(KA.SET, {
      dynRes: false,
      spawnStyle: "classic",
      intros: false,
      dropIn: false,
      killCam: false,
    });
    KA.applySettings();
  });
  await p.click("#deploy");
  await p.waitForTimeout(1500);
  /* hold the view; a pilot stands in front, posed every frame; the drones are away */
  await p.evaluate(() => {
    const K = KA;
    let q = K.pilotById("actor:shield");
    if (!q) q = K.addPilot(new K.Pilot({ id: "actor:shield", name: "", color: "#62cdff", ctl: "script" }));
    q.rig.showTag(false);
    window.__q = q;
    (function hold() {
      K.me.pos.set(6, 0, -27);
      K.me.vel.set(0, 0, 0);
      K.me.yaw = 0.5;
      K.me.pitch = 0.02;
      for (const o of K.bots) o.body.pos.set(200, -50, 200);
      const c = K.camera.getWorldPosition(new K.THREE.Vector3()),
        d = K.camera.getWorldDirection(new K.THREE.Vector3());
      d.y = 0;
      d.normalize();
      q.body.pos.set(c.x + d.x * 3, 0, c.z + d.z * 3);
      q.body.yaw = Math.atan2(d.x, d.z) + 0.6;
      q.pose(1 / 60, { wpn: 1 });
      requestAnimationFrame(hold);
    })();
  });
  const wait = ms => p.waitForTimeout(ms);
  const shot = async name => {
    await p.screenshot({ path: path.join(OUT, name + ".png") });
    console.log(name);
  };
  const me = (s, h = 45) =>
    p.evaluate(
      ([s, h]) => {
        KA.me.shield = s;
        KA.me.health = h;
        KA.me.lastDmg = KA.now;
        KA.me.spawnT = -99;
      },
      [s, h]
    );
  /* the pilot: its shield set directly, a hit flashed from where you stand */
  const pilot = (s, hit) =>
    p.evaluate(
      ([s, hit]) => {
        const q = window.__q;
        q.body.shield = s;
        if (hit) q.rig.flashHit(KA.camera.getWorldPosition(new KA.THREE.Vector3()), hit);
      },
      [s, hit]
    );
  /* yours */
  await me(70);
  await pilot(70);
  await wait(1200);
  await shot("self-full");
  await me(14);
  await wait(900);
  await shot("self-low");
  await p.evaluate(() => KA.hurtMe(20, { w: "rifle" }));
  await wait(60);
  await shot("self-break");
  await wait(1200);
  await shot("self-down");
  await p.evaluate(() => (KA.me.lastDmg = -99));
  await wait(300);
  await shot("self-recharge");
  /* the pilot's */
  await me(70);
  await pilot(70);
  await wait(800);
  await pilot(40, "body");
  await wait(70);
  await shot("pilot-hit");
  await wait(600);
  await pilot(0, "brk");
  await wait(60);
  await shot("pilot-break");
  await wait(250);
  await shot("pilot-break-after");
  await wait(1500);
  await shot("pilot-down");
  for (let i = 1; i <= 6; i++) {
    await pilot(i * 6);
    await wait(50);
  }
  await shot("pilot-recharge");
  if (p.errors && p.errors.length) console.log("errors:", p.errors.slice(0, 3));
  await b.close();
})();
