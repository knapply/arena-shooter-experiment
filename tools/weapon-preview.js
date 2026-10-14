/* Screenshots of every weapon, for working on weapons/models.js, viewmodels.js and weaponParts in characters/rig.js.
     THREE_PATH=... node tools/weapon-preview.js [out-dir]
   first person: each weapon at the hip, aimed down its sights and at the hip with a low magazine;
   third person: a line of pilots holding every weapon, from close beside them and from 14 m away.
   Real three.js (software WebGL). */
const fs = require("fs"),
  path = require("path");
const { launch, open } = require("../tests/lib/browser.js");
const out = process.argv[2] || "weapon-shots";
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
      for (const o of K.bots) o.body.pos.set(60, -40, 60);
      K.me.pos.set(s[0], s[1], s[2]);
      K.me.vel.set(0, 0, 0);
      K.me.yaw = Math.atan2(s[0], s[2]);
      K.me.pitch = -0.06;
      K.me.dead = false;
    });
  const key = (type, code) =>
    p.evaluate(([t, c]) => dispatchEvent(new KeyboardEvent(t, { code: c })), [type, code]);
  for (let i = 0; i < 7; i++) {
    await place();
    await p.evaluate(i => KA.giveWeapon(i), i);
    await p.waitForTimeout(900);
    await shot(`fp${i}-hip`);
    await shot(`fp${i}-hip-zoom`, { x: 420, y: 230, width: 540, height: 310 });
    await key("keydown", "Mouse2");
    await p.waitForTimeout(700);
    await shot(`fp${i}-ads`);
    await key("keyup", "Mouse2");
    await p.evaluate(i => KA.giveWeapon(i, [1, 99]), i);
    await p.waitForTimeout(900);
    await shot(`fp${i}-low`);
  }
  /* third person: seven pilots in a row, each holding one weapon */
  await p.evaluate(() => {
    const K = KA,
      s = K.SPAWNS[0];
    window.__line = [];
    for (let i = 0; i < 7; i++) {
      const a = K.addPilot(
        new K.Pilot({ id: "actor:w" + i, color: i % 2 ? "#ffb347" : "#4aa8ff", ctl: "script" })
      );
      a.body.pos.set(s[0] + (i - 3) * 1.3, s[1], s[2]);
      a.body.yaw = Math.PI / 2;
      a.body.ground = true;
      window.__line.push(a);
    }
    K.vmRoot.scale.setScalar(1e-4);
  });
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
  for (let i = 0; i < 7; i++) {
    await p.evaluate(i => {
      const K = KA,
        a = window.__line[3];
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
