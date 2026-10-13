/* global Image */
/* Visual regression: render key scenes with real three.js (software WebGL) and compare them with the
   approved screenshots in tests/visual/. Comparison is on a downscaled image with a tolerance, so tiny
   rasterization differences pass but a broken material, missing mesh or color shift fails.
     THREE_PATH=/path/to/three.min.js node tests/visual.test.js           compare
     THREE_PATH=... VISUAL_UPDATE=1 node tests/visual.test.js              approve the current look */
const fs = require("fs"),
  path = require("path");
const { check, finish } = require("./lib/check.js");
const { launch, open } = require("./lib/browser.js");
const DIR = path.join(__dirname, "visual");
const UPDATE = !!process.env.VISUAL_UPDATE;
/* mean absolute difference per channel (0-255) and share of pixels that changed a lot, at 160x90 */
async function compare(p, a, b) {
  return p.evaluate(
    async ([a, b]) => {
      const load = src =>
        new Promise((ok, no) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = no;
          i.src = src;
        });
      const px = img => {
        const c = document.createElement("canvas");
        c.width = 160;
        c.height = 90;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, 160, 90);
        return x.getImageData(0, 0, 160, 90).data;
      };
      const A = px(await load(a)),
        B = px(await load(b));
      let sum = 0,
        big = 0;
      for (let i = 0; i < A.length; i += 4) {
        const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
        sum += d;
        if (d > 48) big++;
      }
      const n = A.length / 4;
      return { mean: +(sum / n).toFixed(2), changed: +((big / n) * 100).toFixed(2) };
    },
    [a, b]
  );
}
(async () => {
  if (!process.env.THREE_PATH) {
    console.log("visual: skipped (set THREE_PATH to a three.js r128 build)");
    return;
  }
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  let p = await open(ctx, { tag: "v", realThree: true, hash: "#dev", init: ["seeded-random.js"] });
  const shots = {};
  /* wait for three fresh frames (software rendering is slow, and new materials compile first) */
  const frames = () =>
    p.evaluate(
      () =>
        new Promise(r => {
          let n = 0;
          (function f() {
            if (++n > 3) r();
            else requestAnimationFrame(f);
          })();
        })
    );
  const shoot = async name => {
    await frames();
    shots[name] = "data:image/png;base64," + (await p.screenshot()).toString("base64");
  };
  try {
    await p.evaluate(() => {
      /* classic spawns: a pod falling into the shot at a random moment would make it differ run to run */
      Object.assign(KA.SET, { grain: 0, dynRes: false, spawnStyle: "classic" });
      KA.applySettings();
    });
    await p.waitForTimeout(1500);
    /* the 3D scene behind the menu (menu text itself depends on the machine's fonts, as does the
       frame counter) */
    await p.addStyleTag({ content: "#fps { visibility: hidden !important; }" });
    await p.evaluate(() => {
      KA.CON.run("timescale 0");
      /* the backdrop camera orbits with time: pin it so every machine frames the same view */
      KA.menuT = 1.2;
      document.getElementById("menu").style.visibility = "hidden";
      /* the practice drones wander (and bump into each other) on their own: leave them out */
      KA.hideBots();
    });
    await shoot("menu");
    await p.evaluate(() => KA.showWorld());
    await p.evaluate(() => (document.getElementById("menu").style.visibility = ""));
    await p.evaluate(() => {
      KA.CON.run("timescale 1");
      document.getElementById("bots").checked = false;
    });
    await p.click("#deploy");
    await p.waitForTimeout(800);
    /* the HUD is text in the machine's fonts (and a fading toast): compare the 3D scene only */
    await p.addStyleTag({ content: "#hud, #toast, .status, #fps { visibility: hidden !important; }" });
    /* hold the camera still every frame (a page without pointer lock turns with the cursor), on
       open floor (a spot inside a block gets pushed out differently from run to run) */
    await p.evaluate(() => {
      (function hold() {
        KA.me.pos.set(-22, 0, 15);
        KA.me.vel.set(0, 0, 0);
        KA.me.yaw = 0.3;
        KA.me.pitch = -0.06;
        if (!window.__release) requestAnimationFrame(hold);
      })();
    });
    await p.waitForTimeout(500);
    await p.evaluate(() => KA.CON.run("timescale 0"));
    await shoot("arena");
    /* a pilot close up, in a settled pose */
    await p.evaluate(() => {
      const q = KA.addPilot(new KA.Pilot({ id: "visual", name: "", color: "#62cdff", ctl: "script" }));
      q.rig.showTag(false);
      /* 3.5 m in front of wherever the camera really is, facing it */
      const c = KA.camera.getWorldPosition(new KA.THREE.Vector3()),
        d = KA.camera.getWorldDirection(new KA.THREE.Vector3());
      d.y = 0;
      d.normalize();
      q.body.pos.set(c.x + d.x * 3.5, KA.groundBelow(c.x + d.x * 3.5, c.z + d.z * 3.5, c.y), c.z + d.z * 3.5);
      q.body.yaw = Math.atan2(d.x, d.z);
      for (let i = 0; i < 90; i++) q.pose(1 / 60, { wpn: 1 });
    });
    await shoot("pilot");
    await p.evaluate(() => {
      window.__release = true;
      KA.pilotById("visual").dispose();
      KA.CON.run("timescale 1");
      KA.extStop && KA.extStop();
    });
    /* a trailer frame from the trailer build, stepped deterministically */
    check(p.errors.length === 0, "no page errors in the game", p.errors.slice(0, 3));
    await p.close();
    /* a fresh context: nothing the game page saved (settings) carries over */
    const tctx = await b.newContext({ viewport: { width: 640, height: 360 } });
    p = await open(tctx, { tag: "vt", realThree: true, trailer: true, init: ["seeded-random.js"] });
    await p.waitForTimeout(1500);
    await p.evaluate(() => {
      /* fixed resolution, as the recorder captures it (dynamic resolution follows the machine's load) */
      KA.SET.dynRes = false;
      KA.SET.grain = 0;
      KA.SET.renderScale = 1;
      KA.SET.upscale = "native";
      KA.applySettings();
      window.__seedRandom(7);
      KA.RNG.seed(7);
      KA.trailer.record();
      KA.trailer.seek(12.2);
      KA.trailer.step(1 / 30);
      /* the 3D picture only: title cards depend on the machine's fonts */
      document.getElementById("trCard").style.visibility = "hidden";
    });
    await shoot("trailer");
    await p.evaluate(() => KA.trailer.stop());
  } catch (e) {
    check(false, "test script error", e.message.split("\n")[0]);
  }
  for (const [name, url] of Object.entries(shots)) {
    const f = path.join(DIR, name + ".png");
    if (UPDATE || !fs.existsSync(f)) {
      fs.writeFileSync(f, Buffer.from(url.split(",")[1], "base64"));
      console.log(`  approved ${name}.png`);
      continue;
    }
    const d = await compare(p, url, "data:image/png;base64," + fs.readFileSync(f).toString("base64"));
    const ok = d.mean <= 6 && d.changed <= 3;
    check(ok, `${name} looks like the approved screenshot`, d);
    if (!ok) fs.writeFileSync(path.join(DIR, name + ".actual.png"), Buffer.from(url.split(",")[1], "base64"));
  }
  check(p.errors.length === 0, "no page errors", p.errors.slice(0, 3));
  await b.close();
  finish("visual");
})();
