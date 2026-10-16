/* Real-GPU render checks (software WebGL in CI). Needs THREE_PATH pointing at three.module.min.js (three.core.min.js beside it).
   Guards against blown-out or black frames on every graphics preset. */
const { check, finish } = require("./lib/check.js");
const { launch, open } = require("./lib/browser.js");
if (!process.env.THREE_PATH) {
  console.log("render: skipped (set THREE_PATH to three.module.min.js)");
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
  try {
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
      if (preset === "high") {
        /* another pilot's shield in the world: its break and recharge are heard where it stands, and
           its thrusters hum while it hovers, then stop */
        const w = await p.evaluate(async () => {
          const K = KA,
            heard = [];
          const q = K.addPilot(
            new K.Pilot({ id: "actor:shield", name: "", color: "#62cdff", ctl: "script" })
          );
          const c = K.camera.getWorldPosition(new K.THREE.Vector3());
          q.body.pos.set(c.x + 2, 0, c.z + 2);
          let run = true;
          (function pose() {
            if (!run) return;
            q.pose(1 / 60, { wpn: 1 });
            requestAnimationFrame(pose);
          })();
          const frames = n =>
            new Promise(r => {
              let k = 0;
              (function f() {
                if (++k >= n) r();
                else requestAnimationFrame(f);
              })();
            });
          await frames(5);
          K.sfxTap(k => heard.push(k));
          q.body.shield = 0;
          await frames(3);
          q.body.shield = 30;
          await frames(3);
          K.sfxTap(null);
          K.audio();
          q.body.stabbing = true;
          await frames(10);
          const hovering = K.holdSounds;
          q.body.stabbing = false;
          for (let i = 0; i < 300 && K.holdSounds; i++) await frames(2);
          run = false;
          return { heard, hovering, after: K.holdSounds };
        });
        check(
          w.heard.includes("shbreak") && w.heard.includes("recharge"),
          "a pilot's shield breaking and coming back is heard where it stands",
          w
        );
        check(
          w.hovering === 1 && w.after === 0,
          "a hovering pilot's thrusters hum, and stop when it drops",
          w
        );
      }
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
      /* a carried flag or skull is really held: through standing, running, sprinting, jumping, crouching
         and every phase of a carry blow, each palm stays on the object (on the pole's surface, 2 cm off
         its axis; on the skull's side, 15.5 cm from its centre) and each wrist reaches its grip. Posed
         directly (no waiting on frames), so it is the same on a slow machine */
      const grip = await p.evaluate(() => {
        const T = KA.THREE,
          a = KA.addPilot(new KA.Pilot({ id: "actor:grip", color: "#4aa3ff", ctl: "script" })),
          B = a.body,
          bones = {};
        a.rig.root.traverse(o => o.isBone && (bones[o.name] = o));
        const held = bones.chest.children.filter(o => o.isGroup && !o.isBone).pop();
        const palm = (h, sd) => new T.Vector3(-sd * 0.0375, -0.06, 0).applyMatrix4(h.matrixWorld);
        let worst = 0,
          at = "";
        for (const carry of ["flag", "skull"])
          for (const [name, set] of [
            ["stand", () => {}],
            ["run", () => B.vel.set(0, 0, -6.4)],
            ["sprint", () => (B.vel.set(0, 0, -9), (B.sprint = true))],
            ["jump", () => ((B.ground = false), B.vel.set(0, 3, -5))],
            ["crouch", () => (B.crouch = true)],
            ...[0.05, 0.15, 0.3, 0.45, 0.7].map(m => ["blow " + m, () => (B.meleeT = 0.4 * (1 - m))]),
          ]) {
            B.pos.set(0, 30, 0);
            B.vel.set(0, 0, 0);
            B.sprint = B.crouch = false;
            B.ground = true;
            B.meleeT = 0;
            for (let i = 0; i < 30; i++) {
              set();
              a.pose(1 / 60, { reload: -1, wpn: 0, flag: true, skull: carry === "skull", flagColor: "#f00" });
            }
            a.rig.root.updateMatrixWorld(true);
            for (const [s, sd] of [
              ["L", -1],
              ["R", 1],
            ]) {
              const pc = palm(bones["hand" + s], sd);
              let off;
              if (carry === "flag") {
                const o = new T.Vector3().setFromMatrixPosition(held.matrixWorld),
                  ax = new T.Vector3(0, 1, 0).transformDirection(held.matrixWorld),
                  v = pc.sub(o);
                off = Math.abs(v.sub(ax.multiplyScalar(v.dot(ax))).length() - 0.02);
              } else
                off = Math.abs(
                  pc.distanceTo(new T.Vector3().setFromMatrixPosition(held.matrixWorld)) - 0.155
                );
              const want = bones.chest.localToWorld((s === "L" ? a.rig.S.lh : a.rig.S.rh).clone()),
                miss = new T.Vector3().setFromMatrixPosition(bones["hand" + s].matrixWorld).distanceTo(want);
              if (Math.max(off, miss) > worst) {
                worst = Math.max(off, miss);
                at = carry + " " + name + " " + s;
              }
            }
          }
        a.dispose();
        return { worst: +worst.toFixed(3), at };
      });
      check(grip.worst < 0.02, "a carried flag or skull is held: palms on it, wrists at the grips", grip);
      /* every weapon is held by both hands: standing, running and aiming, each wrist reaches its grip
         (the trigger grip and the weapon's own fore grip: a handguard, a pump, a vertical grip, or the
         other hand on a pistol) */
      const hold = await p.evaluate(() => {
        const T = KA.THREE,
          a = KA.addPilot(new KA.Pilot({ id: "actor:hold", color: "#4aa3ff", ctl: "script" })),
          B = a.body,
          bones = {};
        a.rig.root.traverse(o => o.isBone && (bones[o.name] = o));
        let worst = 0,
          at = "";
        for (let wpn = 0; wpn < 5; wpn++)
          for (const [name, set, aim] of [
            ["stand", () => {}, false],
            ["run", () => B.vel.set(0, 0, -6.4), false],
            ["aim", () => {}, true],
            ["strafe aiming", () => B.vel.set(4, 0, 0), true],
          ]) {
            B.pos.set(0, 30, 0);
            B.vel.set(0, 0, 0);
            B.sprint = B.crouch = false;
            B.ground = true;
            B.aiming = aim;
            for (let i = 0; i < 40; i++) {
              set();
              a.pose(1 / 60, { reload: -1, wpn });
            }
            a.rig.root.updateMatrixWorld(true);
            for (const s of ["L", "R"]) {
              const want = bones.chest.localToWorld((s === "L" ? a.rig.S.lh : a.rig.S.rh).clone()),
                miss = new T.Vector3().setFromMatrixPosition(bones["hand" + s].matrixWorld).distanceTo(want);
              if (miss > worst) {
                worst = miss;
                at = wpn + " " + name + " " + s;
              }
            }
          }
        a.dispose();
        return { worst: +worst.toFixed(3), at };
      });
      check(
        hold.worst < 0.02,
        "every weapon is held: both wrists at their grips, standing, running and aiming",
        hold
      );
      /* stairs: a pilot runs down a real flight (8 steps of 0.4 m) and back up it, stepped by the actual
         physics Body. The body stays on the steps (it does not sail over them and land every third one),
         the rig keeps running (never airborne, never landing), and its hips ride the flight without the
         body's 0.4 m jolt at each step (the hips' frame-to-frame change of speed, over the flight) */
      const stairs = await p.evaluate(() => {
        const a = KA.addPilot(new KA.Pilot({ id: "actor:stairs", color: "#4aa3ff", ctl: "script" })),
          B = a.body,
          dt = 1 / 60,
          ex = { reload: -1, wpn: 0 },
          w = new KA.THREE.Vector3(),
          ys = [],
          rys = [],
          zs = [];
        let pel = null,
          air = 0,
          lands = 0;
        B.pos.set(0, 3.2, 3.6);
        B.vel.set(0, 0, 0);
        B.ground = true;
        B.yaw = Math.PI;
        for (let i = 0; i < 40; i++) {
          B.step(dt, { f: 0, s: 0 }, () => {});
          a.pose(dt, ex);
        }
        a.rig.root.traverse(o => o.isBone && o.name === "pelvis" && (pel = o));
        for (const [yaw, n] of [
          [Math.PI, 150],
          [0, 125],
        ]) {
          B.yaw = yaw;
          for (let i = 0; i < n; i++) {
            B.step(dt, { f: 1, s: 0 }, t => t === "land" && lands++);
            a.pose(dt, ex);
            a.rig.root.updateMatrixWorld(true);
            if (a.rig.S.air) air++;
            ys.push(w.setFromMatrixPosition(pel.matrixWorld).y);
            rys.push(a.rig.root.position.y);
            zs.push(B.pos.z);
          }
        }
        a.dispose();
        const jolt = v => {
          let m = 0;
          for (let i = 2; i < v.length; i++)
            if (zs[i] > 5 && zs[i] < 11.5) m = Math.max(m, Math.abs(v[i] - 2 * v[i - 1] + v[i - 2]));
          return +m.toFixed(3);
        };
        return {
          air,
          lands,
          jolt: jolt(ys),
          rootJolt: jolt(rys),
          rise: +(Math.max(...rys) - Math.min(...rys)).toFixed(2),
        };
      });
      check(
        stairs.air === 0 && stairs.lands === 0 && stairs.rise > 3 && stairs.jolt < 0.75 * stairs.rootJolt,
        "down and up a flight of stairs: on the steps, running all the way, the hips riding it smoothly",
        stairs
      );
      /* the suit's heat (rig.heat, for the armour's vents): a thrust runs it up at once, and it bleeds off
         over about a second */
      const heat = await p.evaluate(() => {
        const a = KA.addPilot(new KA.Pilot({ id: "actor:heat", color: "#4aa3ff", ctl: "script" })),
          B = a.body,
          ex = { reload: -1, wpn: 0 },
          at = [];
        B.pos.set(0, 30, 0);
        B.ground = true;
        for (let i = 0; i < 20; i++) a.pose(1 / 60, ex);
        at.push(a.rig.heat);
        for (let i = 0; i < 10; i++) {
          B.thrustT = 0.2;
          a.pose(1 / 60, ex);
        }
        at.push(a.rig.heat);
        B.thrustT = 0;
        for (let i = 0; i < 90; i++) a.pose(1 / 60, ex);
        at.push(a.rig.heat);
        a.dispose();
        return at.map(v => +v.toFixed(2));
      });
      check(
        heat[0] < 0.05 && heat[1] > 0.9 && heat[2] < 0.15,
        "a thrust heats the suit, and it cools in about a second",
        heat
      );
      check(p.errors.length === 0, "budget scenes have no errors", p.errors.slice(0, 3));
      await p.close();
      /* CTF play at its heaviest: just after the opening drop, every pilot and every fresh wreck on
         the map, the world frozen; the worst view from every team spawn at eight headings */
      const q = await open(ctx, {
        tag: "budget-ctf",
        realThree: true,
        drops: true,
        init: ["seeded-random.js"],
      });
      await q.waitForTimeout(1500);
      await q.evaluate(() => {
        Object.assign(KA.SET, { intros: false, dropIn: true, killCam: false });
        /* (nobody can take you out before the freeze) */
        KA.CON.run("god on");
      });
      await q.click("#play");
      const landed = await q.evaluate(async () => {
        /* the opening pods down and you out of yours (a pilot taken out meanwhile may already be
           falling again in a respawn pod, so count landed pods rather than wait for every pod) */
        const down = () =>
          !KA.myPod &&
          !document.body.classList.contains("podding") &&
          KA.PODS.filter(p => p.landed).length >= 8;
        /* game time runs 6x while we wait: CI's software renderer draws this scene at about a frame a
           second, and a frame counts at most 50 ms of game time, so the fall would take minutes */
        KA.CON.run("timescale 6");
        for (let i = 0; i < 1200 && !down(); i++) await new Promise(r => setTimeout(r, 50));
        KA.CON.run("timescale 0");
        /* (what the match looked like, if the drop never came down) */
        return {
          down: down(),
          pods: KA.PODS.filter(p => p.landed).length,
          all: KA.PODS.length,
          myPod: !!KA.myPod,
          podding: document.body.classList.contains("podding"),
          dead: KA.me.dead,
          game: !!CTF.UI.game(),
          t: +KA.now.toFixed(2),
          wall: +(performance.now() / 1000).toFixed(1),
        };
      });
      let c = { calls: 0, tris: 0 };
      const spots = await q.evaluate(() => CTF.SPAWNS.flat());
      for (const s of spots)
        for (let k = 0; k < 8; k++) {
          await q.evaluate(
            ([s, yaw]) => {
              KA.CON.run(`tp ${s[0]} ${s[1]} ${s[2]}`);
              KA.me.yaw = yaw;
              KA.me.pitch = 0;
            },
            [s, (k * Math.PI) / 4]
          );
          await q.waitForTimeout(120);
          const v = await q.evaluate(() => ({
            calls: KA.renderer.info.render.calls,
            tris: KA.renderer.info.render.triangles,
          }));
          c = { calls: Math.max(c.calls, v.calls), tris: Math.max(c.tris, v.tris) };
        }
      check(
        landed.down && landed.pods >= 8 && c.calls <= B.ctf.drawCalls && c.tris <= B.ctf.triangles,
        "CTF view within draw budget, with the opening drop's wrecks on the map",
        { ...c, ...landed }
      );
      check(q.errors.length === 0, "the CTF budget scene has no errors", q.errors.slice(0, 3));
      await q.close();
    }
  } catch (e) {
    /* report it as a failed check, so CI shows what went wrong */
    check(false, "test script error", e.message.split("\n").slice(0, 3).join(" | "));
  }
  await b.close();
  finish("render");
})();
