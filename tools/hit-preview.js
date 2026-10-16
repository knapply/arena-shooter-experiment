/* Screenshots of the hit feedback, for working on the hit vignette, the shield break's colour split and
   the kill feed's icons (game/state.js hurtMe, ui/feed-icons.js, render/pipeline.js split).
     THREE_PATH=... node tools/hit-preview.js [out-dir]
   a shield hit, the moment your shield breaks (the split and the break wash), a hull hit with the shield
   down, and a kill feed with one kill by each weapon, grenade and glyph (headshots marked). Real
   three.js (software WebGL); the world is frozen (timescale 0) for each shot. */
const fs = require("fs"),
  path = require("path");
const { launch, ROOT, routeThree } = require("../tests/lib/browser.js");
const out = process.argv[2] || "hit-shots";
if (!process.env.THREE_PATH) {
  console.error(
    "set THREE_PATH to three.module.min.js (three.js at the version in src/manifest.json, three.core.min.js beside it)"
  );
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => console.log("page error:", e.message));
  await p.addInitScript(() => {
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
  const shot = async name => {
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(out, name + ".png") });
    console.log("  " + name);
  };
  const setup = () =>
    p.evaluate(() => {
      KA.CON.run("timescale 1");
      const me = KA.me;
      me.pos.set(-30, 0, 30);
      me.yaw = 2.3;
      me.pitch = -0.05;
      me.shield = 70;
      me.health = 45;
      me.spawnT = -99;
      KA.bots.forEach((x, i) => x.body.pos.set(60 + i * 3, -40, 60));
    });
  /* a hit frozen at its first frame */
  const hit = (n, shield) =>
    p.evaluate(
      ([n, shield]) => {
        KA.me.shield = shield;
        KA.hurtMe(n, { name: "Drone-04", w: "rifle" });
        KA.CON.run("timescale 0");
      },
      [n, shield]
    );
  await setup();
  await p.waitForTimeout(400);
  await hit(12, 70);
  await shot("shield-hit");
  await setup();
  await p.waitForTimeout(800);
  await hit(30, 20);
  await shot("shield-break");
  await setup();
  await p.waitForTimeout(800);
  await p.evaluate(() => (KA.me.shield = 0));
  await hit(12, 0);
  await shot("hull-hit");
  /* the feed: one kill each way */
  await setup();
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const kills = [
      ["Drone-04", "Pilot", "rifle", false],
      ["Pilot", "Drone-11", "pistol", true],
      ["Drone-27", "Drone-04", "sniper", true],
      ["Pilot", "Drone-27", "rocket", false],
      ["Drone-11", "Pilot", "scatter", false],
    ];
    for (const [a, v, w, hd] of kills)
      KA.EVENTS.emit("kill", {
        killer: a === "Pilot" ? "local" : "bot:0",
        killerName: a,
        victim: v === "Pilot" ? "local" : "bot:1",
        victimName: v,
        weapon: w,
        head: hd,
      });
    KA.CON.run("timescale 0");
  });
  await shot("feed-guns");
  await p.evaluate(() => {
    KA.CON.run("timescale 1");
    for (const [a, w] of [
      ["Drone-04", "frag"],
      ["Pilot", "stick"],
      ["Drone-27", "melee"],
      ["Pilot", "pound"],
      ["Drone-11", "pod"],
    ])
      KA.EVENTS.emit("kill", {
        killer: a === "Pilot" ? "local" : "bot:0",
        killerName: a,
        victim: "bot:1",
        victimName: "Drone-11",
        weapon: w,
        head: false,
      });
    KA.CON.run("timescale 0");
  });
  await shot("feed-other");
  /* the gun icons up close, as rendered from the models */
  const urls = await p.evaluate(() =>
    KA.WEAPON_DATA.map(w => {
      return [w.key, KA.feedIconMask(w.dmg).slice(0, 60)];
    })
  );
  console.log(urls.map(u => u.join(": ")).join("\n"));
  await b.close();
})();
