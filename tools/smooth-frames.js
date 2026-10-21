/* Frame smoothness in real play: how evenly frames arrive and what causes the uneven ones. Opens the
   game (the real three.js from THREE_PATH, the machine's GPU, vsync on as a player has it), picks a
   graphics preset and plays a script of scenes:
     menu      the menu, its orbiting camera and drones
     deploy    menu → the practice arena: the pod drop and the match intro
     arena     the practice arena with the drones fighting you
     run       running straight ahead (camera speed jitter: the 120 Hz physics against the display)
     killcam   dying, the kill cam, and back
     potg      Play of the Game
     ctf       menu → capture the flag (4 v 4): pods, intro, play
     fight     an 8 v 8 Slayer match, spectated
   For each scene: frame interval p50/p95/p99, hitches (an interval over twice the median) a minute, the
   game loop's own work per frame (p50/p99, max), long tasks, shader programs linked and texture uploads
   during the scene (and how many fell on a hitch frame), GC time (the CPU profile's collector), dynamic
   resolution changes, and for "run" the frame-to-frame jitter of the camera's speed.
     THREE_PATH=.../three.module.min.js node tools/smooth-frames.js [preset,...] [scene,...]
   Prints a table; writes out/smooth-<preset>.json. */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { routeThree, ROOT } = require("../tests/lib/browser.js");
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.module.min.js");
  process.exit(1);
}
const PRESETS = (process.argv[2] || "low,high,ultra").split(","),
  SCENES = (process.argv[3] || "menu,deploy,arena,run,killcam,potg,ctf,fight").split(",");

/* in the page, before the game: every frame's timestamp, the time the game's own animation-frame
   callbacks take, and the GPU uploads and shader links made in each frame */
function instrument() {
  const S = (window.__sm = { on: false, f: [], long: [], cur: null });
  const newFrame = t => ({ t, work: 0, link: 0, first: 0, tex: 0, buf: 0, dyn: 0, cam: null });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb =>
    raf(t => {
      if (!S.cur || S.cur.t !== t) {
        if (S.on && S.cur) S.f.push(S.cur);
        S.cur = newFrame(t);
      }
      const s = performance.now();
      try {
        cb(t);
      } finally {
        S.cur.work += performance.now() - s;
      }
    });
  const wrap = (P, name, key, big) => {
    const f = P[name];
    if (!f) return;
    P[name] = function (...a) {
      if (S.cur && (!big || (a[1] && a[1].byteLength > 65536))) S.cur[key]++;
      return f.apply(this, a);
    };
  };
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    wrap(P, "linkProgram", "link");
    for (const n of [
      "texImage2D",
      "texImage3D",
      "texSubImage2D",
      "texSubImage3D",
      "compressedTexImage2D",
      "texStorage2D",
    ])
      wrap(P, n, "tex");
    wrap(P, "bufferData", "buf", true);
    /* a program drawn with for the first time (where a driver that compiles lazily stalls) */
    const use = P.useProgram,
      used = new WeakSet();
    P.useProgram = function (pr) {
      if (pr && !used.has(pr)) {
        used.add(pr);
        if (S.cur) S.cur.first++;
      }
      return use.call(this, pr);
    };
  }
  try {
    new window.PerformanceObserver(l => {
      if (S.on) for (const e of l.getEntries()) S.long.push(+e.duration.toFixed(1));
    }).observe({ type: "longtask", buffered: false });
  } catch (e) {}
}

const q = (a, p) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
};
const r1 = v => +v.toFixed(1),
  r2 = v => +v.toFixed(2);

async function scene(p, cdp, name, body) {
  await p.evaluate(() => {
    const S = window.__sm;
    S.f = [];
    S.long = [];
    S.run = null;
    S.dyn0 = window.KA && KA.GFX ? KA.GFX.dyn : 1;
    S.on = true;
  });
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await body();
  const secs = (Date.now() - t0) / 1000;
  const { profile } = await cdp.send("Profiler.stop");
  const d = await p.evaluate(() => {
    const S = window.__sm;
    S.on = false;
    return { f: S.f, long: S.long, run: S.run || null };
  });
  /* GC: total, and the longest run of consecutive collector samples */
  const gcId = new Set(
    profile.nodes.filter(n => n.callFrame.functionName === "(garbage collector)").map(n => n.id)
  );
  let gc = 0,
    burst = 0,
    best = 0;
  profile.samples.forEach((id, i) => {
    const dt = (profile.timeDeltas[i] || 0) / 1000;
    if (gcId.has(id)) {
      gc += dt;
      burst += dt;
      best = Math.max(best, burst);
    } else burst = 0;
  });
  const f = d.f,
    iv = [];
  for (let i = 1; i < f.length; i++) iv.push(f[i].t - f[i - 1].t);
  const med = q(iv, 0.5);
  const hitch = [];
  for (let i = 1; i < f.length; i++) if (iv[i - 1] > 2 * med) hitch.push(f[i]);
  const work = f.map(x => x.work);
  const sum = k => f.reduce((a, x) => a + x[k], 0);
  const onHitch = k => hitch.filter(x => x[k] > 0).length;
  const out = {
    scene: name,
    secs: r1(secs),
    frames: f.length,
    p50: r2(med),
    p95: r2(q(iv, 0.95)),
    p99: r2(q(iv, 0.99)),
    max: r1(Math.max(0, ...iv)),
    hitches: hitch.length,
    hitchPerMin: r1((hitch.length / Math.max(1, secs)) * 60),
    workP50: r2(q(work, 0.5)),
    workP99: r2(q(work, 0.99)),
    workMax: r1(Math.max(0, ...work)),
    longTasks: d.long.length,
    longMax: Math.max(0, ...d.long),
    links: sum("link"),
    firstUse: sum("first"),
    firstOnHitch: onHitch("first"),
    linksOnHitch: onHitch("link"),
    texUploads: sum("tex"),
    texOnHitch: onHitch("tex"),
    bigBuffers: sum("buf"),
    gcMs: r1(gc),
    gcBurstMs: r1(best),
    dynChanges: d.f.filter((x, i) => i && x.dyn !== d.f[i - 1].dyn).length,
  };
  if (d.run) out.camSpeedJitter = d.run;
  /* the worst hitches and what happened in those frames */
  out.worst = [];
  for (let i = 1; i < f.length; i++)
    if (iv[i - 1] > 2 * med)
      out.worst.push({
        at: r1((f[i].t - f[0].t) / 1000),
        ms: r1(iv[i - 1]),
        work: r1(f[i - 1].work),
        link: f[i - 1].link + f[i].link,
        first: f[i - 1].first + f[i].first,
        tex: f[i - 1].tex + f[i].tex,
        dyn: f[i].dyn !== f[i - 1].dyn || f[i - 1].dyn !== (f[i - 2] || f[i - 1]).dyn,
      });
  out.worst = out.worst.sort((a, b) => b.ms - a.ms).slice(0, 6);
  return out;
}

async function play(browser, preset) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.addInitScript(instrument);
  await routeThree(p, true);
  await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
  await p.goto("file://" + path.join(ROOT, "index.html"));
  await p.waitForFunction(() => window.KA && KA.startMode, null, { timeout: 60000 });
  await p.click("#openSet");
  await p.selectOption("#set_preset", preset);
  await p.click("#setDone");
  /* (each frame also notes the dynamic resolution scale and the camera) */
  await p.evaluate(() => {
    const S = window.__sm;
    const tag = () => {
      if (S.cur) {
        S.cur.dyn = KA.GFX.dyn;
        const c = KA.camera.position;
        S.cur.cam = [c.x, c.y, c.z];
      }
      requestAnimationFrame(tag);
    };
    tag();
  });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  const wait = ms => p.waitForTimeout(ms);
  const until = (fn, ms = 30000) =>
    p.waitForFunction(fn, null, { timeout: ms, polling: 100 }).then(
      () => true,
      () => false
    );
  const res = [];
  const resume = () =>
    p.evaluate(() => {
      if (KA.paused) document.getElementById("resume").click();
    });
  const S = {
    menu: async () => wait(8000),
    deploy: async () => {
      await p.click("#deploy");
      /* (until you are down out of the pod, alive, and the intro is over) */
      await until(() => KA.playing && !KA.myPod && !KA.me.dead && !(KA.INTRO && KA.INTRO.active), 40000);
      await wait(1000);
    },
    arena: async () => {
      await resume();
      await wait(15000);
    },
    run: async () => {
      await resume();
      await until(() => !KA.me.dead && !KA.myPod, 30000);
      await p.evaluate(() => {
        KA.me.spawnT = KA.now + 60;
        KA.me.pos.set(-20, 0, 0);
        KA.me.yaw = -Math.PI / 2;
        KA.me.pitch = 0;
        for (const o of KA.bots) o.body.pos.set(60, 0, 60);
      });
      await wait(500);
      /* hold forward; the camera's speed over each frame, against the median, while the body runs */
      await p.evaluate(async () => {
        const S = window.__sm,
          sp = [];
        KA.input.hold("forward", true);
        await new Promise(r => setTimeout(r, 600));
        let last = null;
        await new Promise(r => {
          const t0 = performance.now();
          const step = t => {
            const c = KA.camera.position;
            if (last) {
              const dt = (t - last.t) / 1000;
              const d = Math.hypot(c.x - last.x, c.z - last.z);
              if (dt > 0) sp.push(d / dt);
            }
            last = { t, x: c.x, z: c.z };
            if (performance.now() - t0 < 2500) requestAnimationFrame(step);
            else r();
          };
          requestAnimationFrame(step);
        });
        KA.input.hold("forward", false);
        const m = sp.slice().sort((a, b) => a - b)[sp.length >> 1] || 1;
        const dev = sp.map(v => Math.abs(v - m) / m);
        S.run = {
          speed: +m.toFixed(2),
          meanDev: +(dev.reduce((a, b) => a + b, 0) / dev.length).toFixed(4),
          maxDev: +Math.max(...dev).toFixed(3),
        };
      });
    },
    killcam: async () => {
      await resume();
      await p.evaluate(() => {
        KA.SET.killCam = true;
        KA.me.spawnT = -99;
        KA.me.shield = 0;
        KA.me.health = 5;
        const b = KA.bots[0];
        if (b) b.body.pos.set(KA.me.pos.x + 6, KA.me.pos.y, KA.me.pos.z);
      });
      const seen = await until(() => KA.KILLCAM.on, 30000);
      if (seen) await until(() => !KA.KILLCAM.on && !KA.me.dead, 30000);
      await wait(2000);
    },
    potg: async () => {
      const ok = await p.evaluate(() => !!(KA.playOfTheGame && KA.playOfTheGame(() => {})));
      if (ok) await until(() => !KA.REPLAY.active, 30000);
      await wait(1000);
    },
    ctf: async () => {
      await p.evaluate(() => KA.extStop && KA.extStop());
      await wait(1500);
      await p.evaluate(() => KA.startMode("ctf", {}));
      await wait(20000);
    },
    fight: async () => {
      await p.evaluate(() => KA.extStop && KA.extStop());
      await wait(1500);
      await p.evaluate(() => KA.startMode("spectate", { rules: "slayer", map: "arena", size: 8 }));
      await wait(20000);
    },
  };
  for (const name of SCENES) res.push(await scene(p, cdp, name, S[name]));
  await ctx.close();
  return { preset, scenes: res, errors: errors.slice(0, 3) };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  for (const preset of PRESETS) {
    const r = await play(browser, preset);
    fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "out", `smooth-${preset}.json`), JSON.stringify(r, null, 1));
    console.log(`\n${preset}${r.errors.length ? "  ERRORS: " + r.errors.join(" | ") : ""}`);
    console.log(
      "scene     p50   p95   p99    max  hitch/min  work p50/p99/max  long  links(hitch) first(hitch)  tex(hitch)  gc/burst  dyn"
    );
    for (const s of r.scenes)
      console.log(
        `${s.scene.padEnd(8)} ${String(s.p50).padStart(5)} ${String(s.p95).padStart(5)} ${String(s.p99).padStart(5)} ${String(s.max).padStart(6)}  ${String(s.hitchPerMin).padStart(8)}  ${s.workP50}/${s.workP99}/${s.workMax}`.padEnd(
          70
        ) +
          `  ${s.longTasks}  ${s.links}(${s.linksOnHitch}) ${s.firstUse}(${s.firstOnHitch})  ${s.texUploads}(${s.texOnHitch})  ${s.gcMs}/${s.gcBurstMs}  ${s.dynChanges}${s.camSpeedJitter ? "  run " + JSON.stringify(s.camSpeedJitter) : ""}`
      );
  }
  await browser.close();
})();
/* (the worst hitches are in the JSON: out/smooth-<preset>.json, scenes[].worst) */
