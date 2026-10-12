/* Contact sheets of the pilot rig's animation, for working on characters/rig.js.
     THREE_PATH=... node tools/rig-preview.js [gait|poses] [out.png]
   gait   a side view of a run, a sprint and a jump, six frames each (stepped at exactly 60 Hz)
   poses  idle, aiming down sights (carbine and magnum), a melee strike, the reload's slap and bolt
   A pilot is posed by hand in the arena with real three.js (software WebGL); needs ffmpeg on the PATH. */
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  { execFileSync } = require("child_process");
const { launch, open } = require("../tests/lib/browser.js");
const [mode = "gait", outArg] = process.argv.slice(2);
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.js r128's three.min.js");
  process.exit(1);
}
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const p = await open(ctx, { realThree: true });
  await p.waitForTimeout(1500);
  await p.click("#deploy");
  await p.waitForTimeout(1000);
  /* a pilot in an open stretch of the arena, seen from the side; drones out of the way */
  await p.evaluate(() => {
    const K = KA;
    for (const o of K.bots) o.body.pos.set(40, 0, 40);
    document.getElementById("toast").style.display = "none";
    const a = K.addPilot(new K.Pilot({ id: "actor:preview", color: "#ffb347", ctl: "script" }));
    a.body.pos.set(-30, 0, 25.6);
    a.body.yaw = Math.PI / 2;
    a.body.ground = true;
    window.__a = a;
    window.__m = { v: 0, sprint: false, jumpT: -1, st: {} };
  });
  /* step the pilot n frames at 60 Hz: run speed v along its facing, a jump arc when jumpT >= 0 */
  const step = n =>
    p.evaluate(n => {
      const K = KA,
        a = window.__a,
        m = window.__m,
        B = a.body;
      for (let i = 0; i < n; i++) {
        const dt = 1 / 60;
        B.vel.set(-m.v, 0, 0);
        B.sprint = m.sprint;
        B.aiming = !!m.st.aim;
        B.meleeT = m.st.melee >= 0 ? 0.4 * (1 - m.st.melee) : 0;
        if (m.jumpT >= 0) {
          m.jumpT += dt;
          const vy = 7.4 - 24 * m.jumpT,
            y = 7.4 * m.jumpT - 12 * m.jumpT * m.jumpT;
          if (y <= 0 && m.jumpT > 0.1) {
            m.jumpT = -1;
            B.ground = true;
            B.pos.y = 0;
          } else {
            B.ground = false;
            B.vel.y = vy;
            B.pos.y = Math.max(0, y);
          }
        } else {
          B.ground = true;
          B.vel.y = 0;
          B.pos.y = 0;
        }
        a.pose(dt, { reload: m.st.reload == null ? -1 : m.st.reload, fire: false, wpn: m.st.wpn | 0 });
      }
      K.me.pos.set(-30, 0, 28.6);
      K.me.yaw = 0;
      K.me.pitch = -0.08;
    }, n);
  const set = m => p.evaluate(m => Object.assign(window.__m, m), m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rig-"));
  const frames = [];
  const take = async () => {
    await p.waitForTimeout(60);
    const f = path.join(dir, `f${frames.length}.png`);
    await p.screenshot({ path: f, clip: { x: 300, y: 70, width: 360, height: 430 } });
    frames.push(f);
  };
  if (mode === "poses") {
    for (const st of [
      {},
      { aim: true },
      { aim: true, wpn: 1 },
      { melee: 0.3 },
      { reload: 0.72 },
      { reload: 0.88 },
    ]) {
      await set({ v: 0, sprint: false, jumpT: -1, st });
      await step(40);
      await take();
    }
  } else {
    for (const [m, per] of [
      [{ v: 6.4, sprint: false, jumpT: -1 }, 4],
      [{ v: 9, sprint: true, jumpT: -1 }, 3],
    ]) {
      await set(Object.assign(m, { st: {} }));
      await step(120);
      for (let i = 0; i < 6; i++) {
        await step(per);
        await take();
      }
    }
    await set({ v: 6.4, sprint: false, jumpT: 0, st: {} });
    for (let i = 0; i < 6; i++) {
      await step(6);
      await take();
    }
  }
  await b.close();
  const out = outArg || path.join(os.tmpdir(), `rig-${mode}.png`);
  execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-i",
    path.join(dir, "f%d.png"),
    "-vf",
    "tile=6x" + Math.ceil(frames.length / 6) + ",scale=1440:-1",
    "-frames:v",
    "1",
    out,
  ]);
  console.log("wrote " + out);
})();
