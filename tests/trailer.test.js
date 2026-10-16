/* The trailer's beats with the real three.js (THREE_PATH): the whole cut is stepped without drawing
   (first-person stretches run the real game loop, so the camera, weapons and grenades are the game's),
   and each scene's intended outcome must happen: the shot hits, the target goes down, the grenade goes
   off on its mark, the jump lands where it should (modes/trailer.js, BEATS). A tuning change that
   breaks a beat fails here instead of shipping in a video. */
const { check, finish } = require("./lib/check.js");
const { launch, open } = require("./lib/browser.js");
if (!process.env.THREE_PATH) {
  console.log("trailer: skipped (set THREE_PATH to three.module.min.js)");
  process.exit(0);
}
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  try {
    const p = await open(ctx, { realThree: true, trailer: true, init: ["seeded-random.js"] });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      KA.SET.dynRes = false;
      KA.applySettings();
      window.__seedRandom(7);
      KA.RNG.seed(7);
      const TR = KA.trailer;
      TR.record();
      while (TR.t < TR.END) TR.step(1 / 30, false);
      const d = TR.diag;
      const out = { beats: d.beats, bumps: d.bumps.slice(0, 5), cam: d.cam.slice(0, 5) };
      TR.stop();
      return JSON.parse(JSON.stringify(out));
    });
    check(r.beats.length >= 20, "every scene with a beat was judged", r.beats.length);
    for (const bt of r.beats) check(bt.ok, `${bt.shot}: ${bt.what}`, bt.info || "");
    check(r.bumps.length === 0, "trailer pilots never run into walls", r.bumps);
    check(r.cam.length === 0, "the trailer camera never goes inside the level", r.cam);
    check(p.errors.length === 0, "no page errors", p.errors.slice(0, 3));
  } catch (e) {
    check(false, "test script error", e.message.split("\n").slice(0, 3).join(" | "));
  }
  await b.close();
  finish("trailer");
})();
