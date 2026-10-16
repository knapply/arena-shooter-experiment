/* Close-ups of the items a match is played around, for working on their models: the power weapon's
   stand, a dropped weapon and grenades, frag and plasma grenades on the floor, the drop pods (a pilot's,
   a supply pod and the skull's) falling and landed, a capture-the-flag flag on its stand and the
   oddball skull.
     THREE_PATH=... node tools/item-preview.js [out-dir]
   Real three.js (software WebGL); the world is frozen (timescale 0) for each shot, the HUD and the
   viewmodel hidden. */
const fs = require("fs"),
  path = require("path");
const { launch, open } = require("../tests/lib/browser.js");
const out = process.argv[2] || "item-shots";
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.js's module build");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const shot = async (p, name) => {
    await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(out, name + ".png") });
    console.log("  " + name);
  };
  /* stand at `from` (feet) and look at `at` */
  const look = (p, from, at) =>
    p.evaluate(
      ([f, a]) => {
        KA.CON.run(`tp ${f[0]} ${f[1]} ${f[2]}`);
        const ex = f[0],
          ey = f[1] + 1.62,
          ez = f[2];
        KA.me.yaw = Math.atan2(-(a[0] - ex), -(a[2] - ez));
        KA.me.pitch = Math.atan2(a[1] - ey, Math.hypot(a[0] - ex, a[2] - ez));
        /* (the loop sets the viewmodel visible every frame: shrink it away instead) */
        KA.vmRoot.scale.setScalar(1e-4);
        for (const id of ["hud", "ctfHud", "tracker"]) {
          const el = document.getElementById(id);
          if (el) el.style.visibility = "hidden";
        }
      },
      [from, at]
    );
  /* look at `at` from `dist` metres away, from whichever side has open floor and a clear view */
  const lookClear = (p, at, dist, up = 0) =>
    p.evaluate(
      ([a, d, up]) => {
        const V = KA.THREE.Vector3;
        for (let i = 0; i < 16; i++) {
          const ang = 0.4 + (i * Math.PI) / 8;
          const x = a[0] + Math.sin(ang) * d,
            z = a[2] + Math.cos(ang) * d;
          const y = KA.groundBelow(x, z, a[1] + 2 + up, 0.4);
          if (Math.abs(y - a[1]) > 1.5 + up || !KA.freeAt(x, y + 0.05, z, 1.8)) continue;
          const eye = new V(x, y + 1.62, z),
            dir = new V(a[0], a[1], a[2]).sub(eye);
          const L = dir.length();
          if (KA.rayWorld(eye, dir.normalize(), L) < L - 0.3) continue;
          return [x, y, z];
        }
        return [a[0] + d, a[1], a[2]];
      },
      [at, dist, up]
    );
  const run = (p, ts) => p.evaluate(ts => KA.CON.run("timescale " + ts), ts);

  /* ---- the arena: pickups, grenades, pods ---- */
  const p = await open(ctx, { realThree: true });
  p.on("pageerror", e => console.log("page error:", e.message));
  await p.waitForTimeout(1500);
  await p.click("#deploy");
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    for (const o of KA.bots) o.body.pos.set(60, -40, 60);
    KA.CON.run("god on");
  });
  /* the power weapon on its stand (the core's top) */
  const pw = await p.evaluate(() => KA.ARENA_PICKS.find(q => q.power).pos.toArray());
  await look(p, await lookClear(p, [pw[0], pw[1] - 1.3, pw[2]], 2.8, 1.3), [pw[0], pw[1] + 0.5, pw[2]]);
  await run(p, 0.0001);
  await shot(p, "pickup-power");
  /* a dropped weapon and grenades, and frag and plasma grenades on the floor */
  await p.evaluate(() => {
    KA.CON.run("timescale 1");
    const V = KA.THREE.Vector3;
    KA.dropItems(
      [
        { type: 0, ammo: [20, 40] },
        { type: -1, nades: { frag: 2, plasma: 1 } },
      ],
      new V(-1.2, 0.02, -19),
      false
    );
    window.__nf = KA.MAIN_NADES.throw("frag", new V(0.6, 0.3, -18.6), new V(0, 0, 0), null);
    window.__np = KA.MAIN_NADES.throw("plasma", new V(1.4, 0.3, -18.9), new V(0, 0, 0), null);
  });
  await p.waitForTimeout(400);
  await run(p, 0);
  await look(p, [0.2, 0, -17.1], [0, 0.1, -19.2]);
  await shot(p, "pickup-drops-and-grenades");
  /* grenades in flight */
  await p.evaluate(() => {
    for (const n of KA.MAIN_NADES.list.slice()) n.t = 99;
    const V = KA.THREE.Vector3;
    KA.CON.run("timescale 0.15");
    window.__fly = [
      KA.MAIN_NADES.throw("frag", new V(-1, 1.6, -19), new V(2, 3, 0), null),
      KA.MAIN_NADES.throw("plasma", new V(-1, 1.9, -19.6), new V(2, 3, 0), null),
    ];
  });
  await p.waitForTimeout(500);
  await run(p, 0);
  await look(p, [0.2, 0, -17.4], [-0.4, 1.7, -19.3]);
  await shot(p, "grenades-flying");
  await p.evaluate(() => {
    for (const n of KA.MAIN_NADES.list) n.t = 99;
  });
  /* the three pods coming down, then landed */
  await p.evaluate(() => {
    KA.CON.run("timescale 1");
    const V = KA.THREE.Vector3;
    window.__pods = [
      KA.dropPod(new V(-5, 0.02, -26), "#62cdff"),
      KA.dropPod(new V(5, 0.02, -26), "#f2e6c9", { kind: "skull" }),
    ];
    window.__sup = KA.launchSupply({ id: "x", pos: new V(0, 0.5, -30), type: 4 }, KA.POD_TIME);
  });
  await p.evaluate(async () => {
    for (let i = 0; i < 400 && window.__pods[0].t < 2.55; i++) await new Promise(r => setTimeout(r, 10));
    KA.CON.run("timescale 0");
  });
  await look(p, [0, 0, -17.4], [0, 75, -27]);
  await shot(p, "pods-falling");
  await p.evaluate(async () => {
    KA.CON.run("timescale 1");
    for (let i = 0; i < 400 && !(window.__pods[0].landed && window.__pods[0].life > 1.5); i++)
      await new Promise(r => setTimeout(r, 10));
    KA.CON.run("timescale 0");
  });
  await look(p, [0, 0, -17], [0, 0.8, -27]);
  await shot(p, "pods-landed");
  await p.close();

  /* ---- capture the flag: a flag on its stand ---- */
  const c = await open(ctx, { realThree: true });
  await c.waitForTimeout(1500);
  await c.evaluate(() => KA.startMode("ctf", { diff: "recruit" }));
  await c.waitForTimeout(2500);
  const fh = await c.evaluate(() => {
    KA.CON.run("god on");
    for (const a of CTF.UI.game().agents) if (!a.human) a.body.pos.set(0, -60, 0);
    return CTF.FLAG_HOME[1].toArray();
  });
  await look(c, [fh[0] + 3.5, fh[1], fh[2] - 3], [fh[0], fh[1] + 1.2, fh[2]]);
  await run(c, 0.0001);
  await shot(c, "flag");
  await c.close();

  /* ---- oddball: the skull on its spot ---- */
  const o = await open(ctx, { realThree: true });
  await o.waitForTimeout(1500);
  await o.evaluate(() => KA.startMode("oddball", { diff: "recruit", map: "arena" }));
  await o.waitForTimeout(1500);
  const bh = await o.evaluate(async () => {
    KA.CON.run("god on");
    const g = CTF.UI.game();
    for (let i = 0; i < 600 && g.ball.state !== "home"; i++) await new Promise(r => setTimeout(r, 20));
    /* once its pod has blown open, freeze it there before anyone runs over to take it */
    const t0 = g.t;
    for (let i = 0; i < 600 && g.t < t0 + 1.2; i++) {
      for (const a of g.agents) if (!a.human) a.body.pos.set(0, -60, 0);
      await new Promise(r => setTimeout(r, 20));
    }
    KA.CON.run("timescale 0");
    return g.ball.pos.toArray();
  });
  await look(o, await lookClear(o, bh, 3.6), [bh[0], bh[1] + 1.2, bh[2]]);
  await run(o, 0.0001);
  await shot(o, "skull");
  await o.close();
  await b.close();
})();
