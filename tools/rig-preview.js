/* Contact sheets of the pilot rig's animation, for working on characters/rig.js and anim.js.
     THREE_PATH=... node tools/rig-preview.js [gait|loco|poses|moves|climb|carry|react|emote|abilities] [out.png]
   gait   a run, a sprint and a jump, seen from the side, six frames each (stepped at exactly 60 Hz)
   loco   the other motion-captured gaits: a walk, a strafe (from the front), a backpedal and a crouched run
   poses  idle, aiming down sights (carbine and magnum), a melee strike, the reload's slap and bolt;
          the magnum held, its pistol-whip and its reload
   moves  the armor from the front, three-quarters and behind; crouch, ADS, sprint, a slide and a death
   climb  a clamber up a 1.3 m ledge (the body's own clamber state, as physics drives it), side and 3/4
   carry  the flag, then the oddball skull, in both hands: standing (close, from the front and the
          side), running, mid-swing of a carry melee
   react  the motion-captured transitions: a run braking to a stop, a run reversing (the plant), a
          push-off from a standstill, a drop from 3 m landing hard, hits from behind and from the
          left, a death on open floor (the crumple) and one against a wall (the slump)
   emote  the three captured idles, then the emotes: cheer, flex, wave, shrug (from the front)
   abilities  the gun carried, then shouldered to fire; thrusts forward (side view) and sideways (front);
          the stabilizer's hover; a ground pound's hover and slam; a shoulder charge
   A pilot really travels (planted feet lock to the ground) across the largest open floor of the
   arena, with the camera keeping pace beside it; real three.js (software WebGL); needs ffmpeg on the PATH. */
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  { execFileSync } = require("child_process");
const { launch, open } = require("../tests/lib/browser.js");
const [mode = "gait", outArg] = process.argv.slice(2);
if (!process.env.THREE_PATH) {
  console.error(
    "set THREE_PATH to three.module.min.js (three.js at the version in src/manifest.json, three.core.min.js beside it)"
  );
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
    /* (the first-person viewmodel would sit in the shot: shrink it away; the loop keeps it "visible") */
    for (const c of K.camera.children) c.scale.setScalar(1e-4);
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
        B.thrustT = m.thrust ? 0.3 : 0;
        B.stabbing = !!m.stab;
        B.pound = m.pound | 0;
        B.chargeT = m.charge ? 0.3 : 0;
        if (B.clamber) {
          /* as world/physics.js moves a clambering body */
          const c = B.clamber;
          c.t += dt;
          const k = Math.min(1, c.t / c.dur),
            e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          B.pos.lerpVectors(c.from, c.to, e);
          B.pos.y = c.from.y + (c.to.y - c.from.y) * Math.min(1, k * 1.6);
          B.ground = false;
          B.vel.set(0, 0, 0);
          if (k >= 1) {
            B.clamber = null;
            B.ground = true;
          }
        } else if (m.hover) {
          /* held in the air (a thrust, a hover, a pound) at m.hover metres */
          B.ground = false;
          B.vel.y = m.vy || 0;
          B.pos.y = m.hover;
        } else if (m.dropT >= 0) {
          /* a fall from m.dropH metres, landing hard */
          m.dropT += dt;
          const y = m.dropH - 12 * m.dropT * m.dropT;
          if (y <= 0) {
            m.dropT = -1;
            B.ground = true;
            B.pos.y = 0;
            B.vel.y = 0;
          } else {
            B.ground = false;
            B.vel.y = -24 * m.dropT;
            B.pos.y = y;
          }
        } else if (m.jumpT >= 0) {
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
          if (!m.keepY) B.pos.y = 0;
        }
        a.pose(dt, {
          reload: m.st.reload == null ? -1 : m.st.reload,
          fire: !!m.st.fire,
          wpn: m.st.wpn | 0,
          flag: !!m.st.carry,
          skull: m.st.carry === "skull",
          flagColor: "#ff5a4a",
        });
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
    dropT: -1,
    dropH: 3,
    hover: 0,
    vy: 0,
    thrust: false,
    stab: false,
    pound: 0,
    charge: false,
    cam: "side",
    r: 0,
    st: {},
  };
  if (mode === "carry") {
    for (const carry of ["flag", "skull"])
      for (const [m, n] of [
        [{ cam: -60, r: 1.7 }, 40],
        [{ cam: 20, r: 1.7 }, 40],
        [{ v: 6.4 }, 60],
        [{ st: { melee: 0.08 } }, 30],
        [{ st: { melee: 0.3 } }, 30],
        [{ cam: -40, r: 2.2, st: { melee: 0.3 } }, 30],
      ]) {
        await set(Object.assign({}, base, m, { st: Object.assign({ carry }, m.st) }), (n + 4) / 60);
        await step(n);
        await take();
      }
  } else if (mode === "abilities") {
    const shots = [
      /* carried while running, then firing while running */
      [{ v: 6.4, cam: -40 }, 60],
      [{ v: 6.4, cam: -40, st: { fire: true } }, 30],
      /* thrusts: forward from the side, to the right from the front */
      [{ v: 12, hover: 0.3, thrust: true }, 10],
      [{ v: 12, dir: Math.PI / 2, hover: 0.3, thrust: true, cam: "front" }, 10],
      /* the stabilizer's hover, aiming */
      [{ v: 0, hover: 0.6, stab: true, st: { aim: true }, cam: -40 }, 30],
      [{ v: 0, hover: 0.6, stab: true, st: { aim: true } }, 30],
      /* a ground pound: the hover, then the slam */
      [{ v: 0, hover: 0.8, pound: 1, cam: -40 }, 30],
      [{ v: 0, hover: 0.5, pound: 2, vy: -30, cam: -40 }, 12],
      /* a shoulder charge */
      [{ v: 9, sprint: true, charge: true }, 20],
      [{ v: 9, sprint: true, charge: true, cam: -40 }, 20],
      /* the magnum carried, then fired */
      [{ v: 0, cam: -40, st: { wpn: 1 } }, 60],
      [{ v: 0, cam: -40, st: { wpn: 1, fire: true } }, 20],
    ];
    for (const [m, n] of shots) {
      await set(Object.assign({}, base, m), (n + 4) / 60);
      await step(n);
      await take();
    }
  } else if (mode === "react") {
    /* frames picked through each transition (60 Hz steps between them) */
    const row = async (m, lead, warm, change, gaps) => {
      await set(Object.assign({}, base, m), lead);
      await step(warm);
      await change();
      for (const g of gaps) {
        await step(g);
        await take();
      }
    };
    const to = m => () => p.evaluate(m => Object.assign(window.__m, m), m);
    await row({ v: 6.4 }, 1.6, 70, to({ v: 0 }), [3, 6, 6, 6, 9, 15]);
    await row({ v: 6.4 }, 1.6, 70, to({ dir: Math.PI }), [2, 4, 4, 5, 6, 8]);
    await row({ v: 0 }, -0.6, 60, to({ v: 6.4 }), [3, 5, 5, 6, 7, 8]);
    await row({ v: 0, keepY: true }, 0, 20, to({ dropT: 0 }), [16, 7, 5, 8, 12, 20]);
    /* hits: from behind (thrown forward), then from its left (thrown right) */
    const hitFrom = (dx, dz) => () =>
      p.evaluate(
        ([dx, dz]) => {
          const P = window.__a.body.pos;
          window.__a.rig.flashHit(new KA.THREE.Vector3(P.x + dx, P.y, P.z + dz), "body");
        },
        [dx, dz]
      );
    await row({ v: 0 }, 0, 50, hitFrom(5, 0), [6, 8, 14]);
    await row({ v: 0 }, 0, 50, hitFrom(0, -5), [6, 8, 14]);
    /* deaths: on open floor (topple, then crumple), then backed up to a wall */
    await row({ v: 0, cam: -40 }, 0, 30, () => p.evaluate(() => window.__a.rig.die(null, 1)), [14, 30, 50]);
    await set(Object.assign({}, base, { v: 0, cam: -60, r: 3.4 }), 0);
    await p.evaluate(() => {
      /* a wall: walk back (+x, behind the pilot) from the floor's centre until something solid */
      const c = window.__c,
        B = window.__a.body;
      let x = c.cx;
      while (x < c.cx + 40 && KA.freeAt(x + 0.9, 0.05, c.cz, 1.9)) x += 0.2;
      B.pos.set(x, 0, c.cz);
      window.__a.rig.revive();
    });
    await step(30);
    await p.evaluate(() => {
      const P = window.__a.body.pos;
      window.__a.rig.die(new KA.THREE.Vector3(P.x - 5, P.y, P.z), 1);
    });
    for (const g of [14, 30, 50]) {
      await step(g);
      await take();
    }
  } else if (mode === "emote") {
    for (const idle of ["idle", "idle2", "idle3"]) {
      await set(Object.assign({}, base, { cam: -30 }), 0);
      await p.evaluate(n => {
        const lo = window.__a.rig.S.loco;
        lo.idleA = KA.ANIM.clips[n];
        lo.idleB = null;
        lo.idleNext = 99;
      }, idle);
      await step(40);
      await take();
      await step(50);
      await take();
    }
    for (const e of ["cheer", "flex", "wave", "shrug"]) {
      await set(Object.assign({}, base, { cam: "front", r: 3 }), 0);
      await step(30);
      await p.evaluate(e => window.__a.rig.emote(e), e);
      const n = e === "wave" ? [20, 40, 30] : [15, 25, 20];
      for (const g of n) {
        await step(g);
        await take();
      }
    }
  } else if (mode === "climb") {
    for (const cam of ["side", -40]) {
      await set(Object.assign({}, base, { cam, v: 0, keepY: true }), 0);
      await step(20);
      await p.evaluate(() => {
        const B = window.__a.body;
        B.clamber = {
          from: B.pos.clone(),
          to: B.pos.clone().add(new KA.THREE.Vector3(-0.95, 1.3, 0)),
          t: 0,
          dur: 0.239,
        };
      });
      for (let i = 0; i < 6; i++) {
        await step(i < 5 ? 3 : 12);
        await take();
      }
    }
  } else if (mode === "moves") {
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
