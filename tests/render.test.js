/* Real-GPU render checks (software WebGL in CI). Needs THREE_PATH pointing at three.js r128's three.min.js.
   Guards against blown-out or black frames on every graphics preset. */
const { check, finish } = require("./lib/check.js");
const { launch, open } = require("./lib/browser.js");
if (!process.env.THREE_PATH) {
  console.log("render: skipped (set THREE_PATH to three.min.js r128)");
  process.exit(0);
}
const stats = async p => {
  const png = (await p.screenshot()).toString("base64");
  return p.evaluate(async b64 => {
    const img = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, 160, 90);
    const d = x.getImageData(0, 0, 160, 90).data;
    let s = 0,
      s2 = 0,
      white = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      s += l;
      s2 += l * l;
      if (l > 245) white++;
    }
    const m = s / n;
    return {
      mean: +m.toFixed(1),
      contrast: +Math.sqrt(s2 / n - m * m).toFixed(1),
      white: +((white / n) * 100).toFixed(1),
    };
  }, png);
};
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  for (const preset of ["low", "medium", "high", "ultra"]) {
    const p = await open(ctx, { tag: preset, realThree: true });
    await p.waitForTimeout(1500);
    await p.click("#openSet");
    await p.selectOption("#set_preset", preset);
    await p.click("#setDone");
    await p.click("#deploy");
    await p.waitForTimeout(5000);
    await p.evaluate(() => {
      const e = document.querySelector(".toast");
      if (e) e.remove();
    });
    const s = await stats(p);
    check(
      s.mean > 25 && s.mean < 200 && s.white < 15 && s.contrast > 12,
      `${preset} preset renders a normal frame`,
      s
    );
    check(p.errors.length === 0, `${preset} preset has no errors`, p.errors.slice(0, 3));
    await p.close();
  }
  /* draw-call and triangle budgets (tests/budgets.json) */
  {
    const B = require("./budgets.json");
    const p = await open(ctx, { tag: "budget", realThree: true });
    await p.waitForTimeout(1500);
    const info = () =>
      p.evaluate(() => ({ calls: KA.renderer.info.render.calls, tris: KA.renderer.info.render.triangles }));
    await p.click("#deploy");
    await p.waitForTimeout(2500);
    /* spawn points are random, so measure the worst view from every spawn at eight headings */
    let a = { calls: 0, tris: 0 };
    const nSp = await p.evaluate(() => KA.SPAWNS.length);
    for (let i = 0; i < nSp; i++)
      for (let k = 0; k < 8; k++) {
        await p.evaluate(
          ([i, yaw]) => {
            const s = KA.SPAWNS[i];
            KA.me.pos.set(s[0], s[1], s[2]);
            KA.me.vel.set(0, 0, 0);
            KA.me.yaw = yaw;
            KA.me.pitch = 0;
          },
          [i, (k * Math.PI) / 4]
        );
        await p.waitForTimeout(120);
        const v = await info();
        a = { calls: Math.max(a.calls, v.calls), tris: Math.max(a.tris, v.tris) };
      }
    check(a.calls <= B.arena.drawCalls && a.tris <= B.arena.triangles, "arena view within draw budget", a);
    await p.evaluate(() => KA.extStop());
    await p.waitForTimeout(400);
    await p.click("#ctfSim");
    await p.waitForTimeout(2500);
    /* the spectator camera moves on its own, so take the worst of several samples */
    let c = { calls: 0, tris: 0 };
    for (let i = 0; i < 16; i++) {
      await p.waitForTimeout(400);
      const v = await info();
      c = { calls: Math.max(c.calls, v.calls), tris: Math.max(c.tris, v.tris) };
    }
    check(c.calls <= B.ctf.drawCalls && c.tris <= B.ctf.triangles, "CTF view within draw budget", c);
    check(p.errors.length === 0, "budget scenes have no errors", p.errors.slice(0, 3));
    await p.close();
  }
  await b.close();
  finish("render");
})();
