/* Screenshots of a drop pod respawn, for working on game/pods.js and game/pod-view.js.
     THREE_PATH=... node tools/pod-preview.js [out-dir] [--map ctf]
   first person: high up, mid-fall, under the retros, the impact flash, the doors blowing, the step out
   and looking down at the wreck; third person: a pod landing beside you, from impact to the wreck
   sinking. Real three.js (software WebGL); the world is frozen (timescale 0) for each shot. */
const fs = require("fs"),
  path = require("path");
const { launch, open } = require("../tests/lib/browser.js");
const out = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "pod-shots";
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.js r128's three.min.js");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await open(ctx, { realThree: true });
  p.on("pageerror", e => console.log("page error:", e.message));
  await p.waitForTimeout(1500);
  await p.click("#deploy");
  await p.waitForTimeout(1500);
  const shot = async name => {
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(out, name + ".png") });
    console.log("  " + name);
  };
  /* run the world slowly until cond() holds, then freeze it */
  const until = async (cond, arg, ts = 0.25) => {
    await p.evaluate(ts => KA.CON.run("timescale " + ts), ts);
    for (let i = 0; i < 600; i++) {
      if (await p.evaluate(cond, arg)) break;
      await p.waitForTimeout(20);
    }
    await p.evaluate(() => KA.CON.run("timescale 0"));
  };
  await p.evaluate(() => {
    for (const o of KA.bots) o.body.pos.set(60, -40, 60);
    KA.me.spawnT = -99;
    KA.hurtMe(999, { w: "self", name: "test" });
  });
  await until(() => !!KA.myPod, null, 1);
  const stages = [
    ["fp1-high", 0.12],
    ["fp2-mid", 0.5],
    ["fp3-retro", 0.9],
  ];
  for (const [name, k] of stages) {
    await until(k => KA.myPod && KA.myPod.t / KA.myPod.dur >= k, k);
    await shot(name);
  }
  const land = [
    ["fp4-impact", 0.02],
    ["fp5-doors", 0.16],
    ["fp6-rise", 0.4],
    ["fp7-out", 1.0],
  ];
  for (const [name, t] of land) {
    await until(t => !KA.myPod && KA.PODS.length && KA.PODS[KA.PODS.length - 1].life >= t, t, 0.1);
    await shot(name);
  }
  /* look down at the wreck you stepped out of */
  await p.evaluate(() => {
    KA.me.pitch = -0.9;
    KA.CON.run("timescale 0.0001");
  });
  await shot("fp8-down");
  /* third person: watch a pod land on open floor a few metres away */
  const view = await p.evaluate(() => {
    KA.CON.run("timescale 0");
    const K = KA,
      me = K.me,
      V = K.THREE.Vector3;
    for (const [x, , z] of K.MAPS.arena.spawns.ffa) {
      if (Math.abs(K.groundBelow(x, z, 1, 0.6)) > 0.01) continue;
      const at = new V(x, 0.02, z),
        s = K.podSeat(at);
      if (!s.ok || s.x || s.z) continue;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        for (const d of [6, 7, 8]) {
          const vx = x + Math.sin(a) * d,
            vz = z + Math.cos(a) * d,
            vy = K.groundBelow(vx, vz, 8, 0.4);
          if (Math.abs(vy) > 0.05 || !K.freeAt(vx, vy + 0.05, vz, 1.8)) continue;
          const eye = new V(vx, vy + 1.62, vz),
            dir = new V(x, 1, z).sub(eye);
          const L = dir.length();
          if (K.rayWorld(eye, dir.normalize(), L) < L - 0.5) continue;
          me.pos.set(vx, vy + 0.01, vz);
          me.vel.set(0, 0, 0);
          me.yaw = Math.atan2(vx - x, vz - z);
          me.pitch = -Math.atan2(eye.y - 0.5, Math.hypot(vx - x, vz - z));
          window.__pod = K.dropPod(at, "#62cdff");
          return [x, z, vx, vy, vz];
        }
      }
    }
    return null;
  });
  console.log("  third person view", view);
  for (const [name, t] of [
    ["tp1-fall", -0.25],
    ["tp2-impact", 0.03],
    ["tp3-blow", 0.25],
    ["tp4-wreck", 2],
    ["tp5-sink", 7],
  ]) {
    if (t < 0) await until(t => window.__pod.t >= window.__pod.dur + t, t);
    else await until(t => window.__pod.landed && window.__pod.life >= t, t, t > 1 ? 2 : 0.25);
    await shot(name);
  }
  await b.close();
})();
