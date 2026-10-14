/* Screenshots of the in-game HUD, for working on ui/hud.js, ui/tracker.js, ui/pings.js and the HUD styles.
     THREE_PATH=... node tools/hud-preview.js [out-dir] [--only name]
   first person in the arena at desktop width (keyboard hints, then controller hints, low ammo, a
   danger mark), at phone width in landscape and portrait (touch), at the largest HUD size, and in
   capture the flag (the shield under the score bar). Real three.js (software WebGL); the world is
   frozen (timescale 0) for each shot. Fonts load from the web when it is reachable. */
const fs = require("fs"),
  path = require("path");
const { launch, ROOT, routeThree } = require("../tests/lib/browser.js");
const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith("--") ? args[0] : "hud-shots";
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
/** a page with the game, intros and the opening drop off, a fake controller slot, real three.js */
async function page(b, ctxOpts) {
  const ctx = await b.newContext(ctxOpts);
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
  return { ctx, p };
}
/** deploy into the arena and set up a readable scene: drones around you, one sprinting in range */
async function deploy(p, { ctf = false } = {}) {
  if (ctf) {
    await p.click("#ctfPlay");
    await p.waitForFunction(() => window.CTF && CTF.UI.game() && !KA.me.dead, null, { timeout: 30000 });
  } else {
    await p.click("#deploy");
    await p.waitForFunction(() => KA.playing !== false && !KA.me.dead, null, { timeout: 30000 });
  }
  await p.waitForTimeout(1500);
  await p.evaluate(ctf => {
    KA.CON.run("timescale 0");
    const me = KA.me;
    if (!ctf) {
      me.pos.set(-22, 0, 22);
      me.yaw = Math.PI * 0.75;
      me.pitch = -0.04;
      const [a, b2, c] = KA.bots;
      a.body.pos.set(-14, 0, 12);
      a.body.sprint = true;
      b2.body.pos.set(-30, 0, 18);
      b2.body.sprint = false;
      b2.body.thrustT = 0.2;
      c.body.pos.set(-12, 0, 40);
      c.body.sprint = false;
    }
    me.shield = 46;
    me.health = 45;
  }, ctf);
  await p.waitForTimeout(300);
}
const step = async (p, s = 0.1) => {
  await p.evaluate(s => KA.CON.run("timescale " + s), s);
  await p.waitForTimeout(120);
  await p.evaluate(() => KA.CON.run("timescale 0"));
  await p.waitForTimeout(120);
};
async function shot(p, name) {
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(out, name + ".png") });
  console.log("  " + name);
}
const want = n => !only || n === only;
(async () => {
  const b = await launch({ gpu: true });
  try {
    if (want("desktop-keys") || want("desktop-pad") || want("desktop-low") || want("desktop-danger")) {
      const { ctx, p } = await page(b, { viewport: { width: 1280, height: 720 } });
      await deploy(p);
      await p.keyboard.press("Digit2");
      await step(p, 1);
      await p.evaluate(() => {
        KA.mag = 19;
        KA.reserve[KA.wi] = 64;
        KA.nadeInv.frag = 1;
      });
      await step(p);
      if (want("desktop-keys")) await shot(p, "desktop-keys");
      if (want("desktop-pad")) {
        /* a button press makes the controller the device in use */
        await p.evaluate(p => (window.__pad = p), pad({ 13: 1 }));
        await step(p);
        await p.evaluate(p => (window.__pad = p), pad());
        await step(p);
        await shot(p, "desktop-pad");
        await p.keyboard.press("KeyY");
        await step(p);
      }
      if (want("desktop-low")) {
        await p.evaluate(() => {
          KA.mag = 4;
          KA.reserve[KA.wi] = 0;
          KA.nadeInv.frag = 0;
          KA.nadeInv.plasma = 1;
          KA.nadeSel = "plasma";
          KA.me.shield = 0;
          KA.me.health = 22;
        });
        await step(p);
        await shot(p, "desktop-low");
      }
      if (want("desktop-danger")) {
        await p.evaluate(() => {
          KA.me.shield = 70;
          KA.me.health = 45;
          KA.mag = 0;
          KA.reserve[KA.wi] = 0;
          KA.pingNow();
          KA.pingNow();
        });
        await step(p);
        await shot(p, "desktop-danger");
      }
      await ctx.close();
    }
    /* a phone lays the page out 980 px wide (there is no viewport meta tag) and scales it down; the
       narrow shot is a true 375 px layout, the compact HUD */
    for (const [name, vp, mobile] of [
      ["phone-landscape", { width: 812, height: 375 }, true],
      ["phone-portrait", { width: 375, height: 760 }, true],
      ["phone-narrow", { width: 375, height: 700 }, false],
    ]) {
      if (!want(name)) continue;
      const { ctx, p } = await page(b, {
        viewport: vp,
        hasTouch: true,
        isMobile: mobile,
        deviceScaleFactor: 2,
      });
      await deploy(p);
      await shot(p, name);
      await ctx.close();
    }
    if (want("desktop-big")) {
      const { ctx, p } = await page(b, { viewport: { width: 1600, height: 900 } });
      await p.evaluate(() => {
        KA.SET.hudScale = 1.4;
        KA.applySettings();
      });
      await deploy(p);
      await shot(p, "desktop-big");
      await ctx.close();
    }
    if (want("ctf")) {
      const { ctx, p } = await page(b, { viewport: { width: 1280, height: 720 } });
      await deploy(p, { ctf: true });
      await shot(p, "ctf");
      await ctx.close();
    }
  } finally {
    await b.close();
  }
})();
