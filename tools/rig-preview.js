/* Contact sheets of the pilot rig's animation, for working on characters/rig.js and anim.js.
     THREE_PATH=... node tools/rig-preview.js [gait|loco|poses|moves] [out.png]
   gait   a run, a sprint and a jump, seen from the side, six frames each (stepped at exactly 60 Hz)
   loco   the other motion-captured gaits: a walk, a strafe (from the front), a backpedal and a crouched run
   poses  idle, aiming down sights (carbine and magnum), a melee strike, the reload's slap and bolt;
          the magnum held, its pistol-whip and its reload
   moves  the armor from the front, three-quarters and behind; crouch, ADS, sprint, a slide and a death
   A pilot really travels (planted feet lock to the ground) across the largest open floor of the
   arena, with the camera keeping pace beside it; real three.js (software WebGL); needs ffmpeg on the PATH. */
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
  /* a pilot facing -x in the middle of the largest open floor; drones out of the way */
  await p.evaluate(() => {
    const K = KA;
    for (const o of K.bots) o.body.pos.set(40, 0, 40);
    document.getElementById("toast").style.display = "none";
    let best = null;
    for (let cx = -30; cx <= 30; cx += 2)
      for (let cz = -30; cz <= 30; cz += 2) {
        let r = 0;
        grow: for (; r < 14; r++)
          for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++)
              if (
                Math.abs(K.groundBelow(cx + dx, cz + dz, 1, 0.3)) > 0.01 ||
                !K.freeAt(cx + dx, 0.05, cz + dz, 1.9)
              )
                break grow;
        if (!best || r > best.r) best = { cx, cz, r };
      }
    const a = K.addPilot(new K.Pilot({ id: "actor:preview", color: "#ffb347", ctl: "script" }));
    a.body.yaw = Math.PI / 2;
    a.body.ground = true;
    window.__a = a;
    window.__c = best;
    window.__m = { v: 0, dir: 0, sprint: false, crouch: false, jumpT: -1, cam: "side", st: {} };
  });
  /* step the pilot n frames at 60 Hz: speed v in direction dir (relative to facing, + right),
     a jump arc when jumpT >= 0; the camera keeps pace, beside it or in front */
  const step = n =>
    p.evaluate(n => {
      const K = KA,
        a = window.__a,
        m = window.__m,
        B = a.body;
      for (let i = 0; i < n; i++) {
        const dt = 1 / 60;
        /* (facing -x: forward is -x, right is -z) */
        B.vel.set(-m.v * Math.cos(m.dir), B.vel.y, -m.v * Math.sin(m.dir));
        B.pos.x += B.vel.x * dt;
        B.pos.z += B.vel.z * dt;
        B.sprint = m.sprint;
        B.crouch = m.crouch || m.slide;
        B.slideT = m.slide ? 0.5 : 0;
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
            B.vel.y = 0;
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
      /* the camera's bearing around the pilot: side (0), front (-90 deg), or any angle in degrees */
      const ca = ((m.cam === "front" ? -90 : m.cam === "side" ? 0 : +m.cam) * Math.PI) / 180,
        cr = m.r || (m.cam === "side" ? 3 : 3.2);
      K.me.pos.set(B.pos.x + Math.sin(ca) * cr, 0, B.pos.z + Math.cos(ca) * cr);
      K.me.yaw = ca;
      K.me.pitch = -0.08;
    }, n);
  /* a new gait: start far enough back that the frames are taken near the middle of the floor */
  const set = (m, lead) =>
    p.evaluate(
      ([m, lead]) => {
        Object.assign(window.__m, m);
        const c = window.__c,
          B = window.__a.body,
          v = window.__m.v,
          d = window.__m.dir;
        B.pos.set(c.cx + v * lead * Math.cos(d), 0, c.cz + v * lead * Math.sin(d));
      },
      [m, lead]
    );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rig-"));
  const frames = [];
  const take = async () => {
    await p.waitForTimeout(60);
    const f = path.join(dir, `f${frames.length}.png`);
    await p.screenshot({ path: f, clip: { x: 300, y: 70, width: 360, height: 430 } });
    frames.push(f);
  };
  const base = {
    v: 0,
    dir: 0,
    sprint: false,
    crouch: false,
    slide: false,
    jumpT: -1,
    cam: "side",
    r: 0,
    st: {},
  };
  if (mode === "moves") {
    for (const [m, n] of [
      [{ cam: -40, r: 2.4 }, 40],
      [{ cam: "front", r: 2.4 }, 40],
      [{ cam: 140, r: 2.4 }, 40],
      [{ crouch: true }, 40],
      [{ cam: -40, st: { aim: true } }, 40],
      [{ cam: -40, v: 9, sprint: true }, 70],
      [{ slide: true, v: 9 }, 4],
      [{ slide: true, v: 8 }, 20],
      [{ slide: true, v: 7, cam: -40 }, 30],
      [{ slide: true, v: 7, cam: "front" }, 30],
    ]) {
      await set(Object.assign({}, base, m), (n + 4) / 60);
      await step(n);
      await take();
    }
    /* a death, seen from the side: going down, and down */
    await set(Object.assign({}, base, { v: 6.4 }), 0.5);
    await step(30);
    await p.evaluate(() => window.__a.rig.die(null, 1));
    for (const n of [12, 50]) {
      await step(n);
      await take();
    }
  } else if (mode === "poses") {
    for (const st of [
      {},
      { aim: true },
      { aim: true, wpn: 1 },
      { melee: 0.3 },
      { reload: 0.72 },
      { reload: 0.88 },
      { wpn: 1 },
      { wpn: 1, melee: 0.3 },
      { wpn: 1, reload: 0.72 },
    ]) {
      await set(Object.assign({}, base, { st }), 0);
      await step(40);
      await take();
    }
  } else {
    const gaits =
      mode === "loco"
        ? [
            [{ v: 1.3 }, 8],
            [{ v: 6.4, dir: Math.PI / 2, cam: "front" }, 3],
            [{ v: 6.4, dir: Math.PI }, 3],
            [{ v: 3.2, crouch: true }, 4],
          ]
        : [
            [{ v: 6.4 }, 3],
            [{ v: 9, sprint: true }, 3],
          ];
    for (const [m, per] of gaits) {
      const warm = 70;
      await set(Object.assign({}, base, m), ((warm + 3 * per) / 60) * 1);
      await step(warm);
      for (let i = 0; i < 6; i++) {
        await step(per);
        await take();
      }
    }
    if (mode !== "loco") {
      await set(Object.assign({}, base, { v: 6.4 }), 1.2);
      await step(40);
      await p.evaluate(() => (window.__m.jumpT = 0));
      for (let i = 0; i < 6; i++) {
        await step(7);
        await take();
      }
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
