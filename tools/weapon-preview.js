/* Screenshots of every weapon, for working on weapons/models.js, viewmodels.js and weaponParts in characters/rig.js.
     THREE_PATH=... node tools/weapon-preview.js [out-dir] [--quick]
   first person: each weapon at the hip, aimed down its sights and at the hip with a low magazine, then
   frozen mid-motion: coming up after a draw, the frame of a shot, sprinting and half-way through a reload, and the carbine through a grenade throw;
   third person: a line of pilots holding every weapon, from close beside them and from 14 m away.
   Real three.js (software WebGL). */
const fs = require("fs"),
  path = require("path");
const { launch, open } = require("../tests/lib/browser.js");
const out = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "weapon-shots";
/* --quick: only the first-person stills (hip, ADS, low ammo), for iterating on a look */
const QUICK = process.argv.includes("--quick");
if (!process.env.THREE_PATH) {
  console.error(
    "set THREE_PATH to three.module.min.js (three.js at the version in src/manifest.json, three.core.min.js beside it)"
  );
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const p = await open(ctx, { realThree: true });
  p.on("pageerror", e => console.log("page error:", e.message));
  await p.waitForTimeout(1500);
  await p.click("#deploy");
  await p.waitForTimeout(1500);
  /* full resolution, so small parts and the counter stay legible */
  await p.evaluate(() => {
    KA.SET.dynRes = false;
    KA.SET.renderScale = 1;
    KA.applySettings();
  });
  const shot = async (name, clip) => {
    await p.evaluate(tp => {
      for (const id of ["toast", "tracker"]) document.getElementById(id).style.visibility = "hidden";
      if (tp) document.getElementById("hud").style.visibility = "hidden";
    }, name.startsWith("tp"));
    await p.screenshot({ path: path.join(out, name + ".png"), clip });
    console.log("  " + name);
  };
  /* stand still somewhere open, looking along the arena, drones out of the way */
  const place = () =>
    p.evaluate(() => {
      const K = KA,
        s = K.SPAWNS[0];
      for (const o of K.bots) o.body.pos.set(400, -40, 400);
      K.me.pos.set(s[0], s[1], s[2]);
      K.me.vel.set(0, 0, 0);
      K.me.yaw = Math.atan2(s[0], s[2]);
      K.me.pitch = -0.06;
      K.me.dead = false;
    });
  /* waits are on game state and game time, not the clock (software rendering runs a few frames a
     second, and a frame counts at most 50 ms of game time) */
  const until = async (cond, arg) => {
    for (let n = 0; n < 1500 && !(await p.evaluate(cond, arg)); n++) await p.waitForTimeout(15);
  };
  /** let 0.7 s of game time pass (a draw or a pose settles) */
  const settle = async () => until(t => KA.now > t + 0.7, await p.evaluate(() => KA.now));
  /* every weapon, in WEAPON_DATA order */
  const NW = await p.evaluate(() => KA.WEAPON_DATA.length);
  const key = (type, code) =>
    p.evaluate(([t, c]) => dispatchEvent(new KeyboardEvent(t, { code: c })), [type, code]);
  for (let i = 0; i < NW; i++) {
    await place();
    await p.evaluate(i => KA.giveWeapon(i), i);
    await settle();
    await shot(`fp${i}-hip`);
    await shot(`fp${i}-hip-zoom`, { x: 420, y: 230, width: 540, height: 310 });
    await key("keydown", "Mouse2");
    await p.waitForTimeout(700);
    await shot(`fp${i}-ads`);
    await key("keyup", "Mouse2");
    await p.evaluate(i => KA.giveWeapon(i, [1, 99]), i);
    await settle();
    await shot(`fp${i}-low`);
  }
  if (QUICK) return b.close();
  /* in motion, each frozen mid-way (timescale 0): coming up after a draw, the frame of a shot (flash,
     kick, tracer), a sprint, and the middle of a reload. Waits are on game state, not the clock */
  const freeze = async (name, clip) => {
    await p.evaluate(() => KA.CON.run("timescale 0"));
    await p.waitForTimeout(250);
    await shot(name, clip);
    await p.evaluate(() => KA.CON.run("timescale 1"));
  };
  for (let i = 0; i < NW; i++) {
    await place();
    await p.evaluate(i => KA.giveWeapon(i), i);
    await until(() => KA.now > 0);
    const t0 = await p.evaluate(() => KA.now);
    await until(t => KA.now > t + 0.12, t0);
    await freeze(`fp${i}-draw`);
    await settle();
    const m0 = await p.evaluate(() => KA.mag);
    /* (slowed, so the flash and the streak outlive a frame of software rendering) */
    await p.evaluate(() => KA.CON.run("timescale 0.1"));
    await key("keydown", "Mouse0");
    await until(m => KA.mag < m, m0);
    if (i === 6) await p.waitForTimeout(300);
    await freeze(`fp${i}-fire`);
    await key("keyup", "Mouse0");
    await p.waitForTimeout(600);
    await key("keydown", "KeyW");
    await key("keydown", "ShiftLeft");
    await settle();
    await freeze(`fp${i}-sprint`);
    await key("keyup", "ShiftLeft");
    await key("keyup", "KeyW");
    await place();
    await p.evaluate(i => KA.giveWeapon(i, [1, 99]), i);
    await settle();
    /* (the last round fired starts it: R may be the pickup key where this stands) */
    await key("keydown", "Mouse0");
    await until(() => KA.reloadT > 0);
    await key("keyup", "Mouse0");
    const r0 = await p.evaluate(() => KA.reloadT);
    await until(r => KA.reloadT < r * 0.5, r0);
    await freeze(`fp${i}-reload`);
    await until(() => KA.reloadT <= 0);
  }
  /* a grenade throw with the carbine up, frozen through it: the off hand coming in, the release, the
     follow-through and the gun coming back up (slowed: the swing is a few frames long) */
  await place();
  await p.evaluate(() => KA.giveWeapon(0));
  await settle();
  await p.evaluate(() => KA.CON.run("timescale 0.05"));
  const g0 = await p.evaluate(() => KA.now);
  await key("keydown", "KeyG");
  await until(t => KA.now > t + 0.004, g0);
  await key("keyup", "KeyG");
  for (const u of [0.015, 0.05, 0.11, 0.18, 0.3]) {
    await until(([t, u]) => KA.now >= t + u, [g0, u]);
    await p.evaluate(() => KA.CON.run("timescale 0"));
    await p.waitForTimeout(250);
    await shot(`fp-throw-${Math.round(u * 1000)}ms`);
    await p.evaluate(() => KA.CON.run("timescale 0.05"));
  }
  await p.evaluate(() => KA.CON.run("timescale 1"));
  /* third person: a row of pilots, each holding one weapon */
  await p.evaluate(NW => {
    const K = KA,
      s = K.SPAWNS[0];
    window.__line = [];
    for (let i = 0; i < NW; i++) {
      const a = K.addPilot(
        new K.Pilot({ id: "actor:w" + i, color: i % 2 ? "#ffb347" : "#4aa8ff", ctl: "script" })
      );
      a.body.pos.set(s[0] + (i - (NW >> 1)) * 1.3, s[1], s[2]);
      a.body.yaw = Math.PI / 2;
      a.body.ground = true;
      window.__line.push(a);
    }
    K.vmRoot.scale.setScalar(1e-4);
  }, NW);
  const view = (dist, aim) =>
    p.evaluate(
      ([dist, aim]) => {
        const K = KA,
          s = K.SPAWNS[0];
        for (let f = 0; f < 40; f++)
          window.__line.forEach((a, i) => a.pose(1 / 60, { reload: -1, fire: false, wpn: i, aim }));
        K.me.pos.set(s[0], s[1], s[2] + dist);
        K.me.vel.set(0, 0, 0);
        K.me.yaw = 0;
        K.me.pitch = dist > 6 ? -0.02 : -0.1;
      },
      [dist, aim]
    );
  for (const [name, dist, aim] of [
    ["tp-near", 4.2, false],
    ["tp-near-ads", 4.2, true],
    ["tp-far", 14, false],
  ]) {
    await view(dist, aim);
    await p.waitForTimeout(400);
    await shot(name);
  }
  /* and each one close, held by the middle pilot, from in front and to its side */
  for (let i = 0; i < NW; i++) {
    await p.evaluate(i => {
      const K = KA,
        a = window.__line[window.__line.length >> 1];
      for (let f = 0; f < 30; f++)
        window.__line.forEach((b, j) =>
          b.pose(1 / 60, { reload: -1, fire: false, wpn: b === a ? i : j, aim: false })
        );
      K.me.pos.set(a.body.pos.x - 0.4, a.body.pos.y - 0.3, a.body.pos.z + 1.15);
      K.me.vel.set(0, 0, 0);
      K.me.yaw = -0.33;
      K.me.pitch = -0.12;
    }, i);
    await p.waitForTimeout(400);
    await shot(`tp${i}-close`, { x: 160, y: 90, width: 640, height: 360 });
  }
  await b.close();
})();
