/* Frame profiling in a real browser: where the main thread's time and allocations go while the game
   renders. Builds an unminified copy (out/profile.html, so function names survive), opens it with the
   real three.js (THREE_PATH), picks a graphics preset, starts a scene and samples it with the Chrome
   DevTools protocol:
     - script, style/layout and total task time per frame (Performance.getMetrics), frames per second;
     - the hottest functions by self time (Profiler);
     - the allocation rate and the functions that allocate most (HeapProfiler sampling).
   Scenes: ctf (AI-vs-AI capture the flag, spectator camera), fight (8 v 8 Slayer on Proving Grounds,
   lots of fire and explosions). Presets: low, ultra.
     THREE_PATH=.../three.module.min.js node tools/profile-frames.js [scene,...] [preset,...] [seconds]
     GPU=1 uses the machine's GPU without vsync, so fps shows headroom (default: SwiftShader, as in CI)
   Writes a JSON summary to out/profile-<scene>-<preset>.json and prints one line per run. */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { routeThree, ROOT } = require("../tests/lib/browser.js");
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.module.min.js");
  process.exit(1);
}
const SCENES = (process.argv[2] || "ctf,fight").split(","),
  PRESETS = (process.argv[3] || "low,ultra").split(","),
  SECONDS = +(process.argv[4] || 20),
  TOP = 15;
const START = {
  ctf: { rules: "ctf", map: "ctf" },
  fight: { rules: "slayer", map: "arena", size: 8 },
};

async function buildDev() {
  const { build } = await import("file://" + path.join(ROOT, "build.mjs").replace(/\\/g, "/"));
  const f = path.join(ROOT, "out", "profile.html");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, build({ dev: true }).html);
  return "file://" + f;
}
/** top functions by a per-node weight; nodes are merged by name and location */
function topBy(nodes, weight, total) {
  const m = new Map();
  for (const n of nodes) {
    const cf = n.callFrame,
      w = weight(n);
    if (!w) continue;
    const key = `${cf.functionName || "(anonymous)"} ${path.basename(cf.url || "")}:${cf.lineNumber + 1}`;
    m.set(key, (m.get(key) || 0) + w);
  }
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([k, v]) => [k, +((100 * v) / total).toFixed(1)]);
}
function flatten(head, out = []) {
  out.push(head);
  for (const c of head.children || []) flatten(c, out);
  return out;
}

async function run(browser, url, scene, preset) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.addInitScript(() => {
    try {
      localStorage.setItem(
        "ka-doc-settings",
        JSON.stringify({
          app: "kinetic-arena",
          doc: "settings",
          version: 2,
          data: { settings: { intros: false, dropIn: false }, keys: {}, pad: {} },
        })
      );
    } catch (e) {}
  });
  await routeThree(p, true);
  await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
  await p.goto(url);
  await p.waitForFunction(() => window.KA && KA.startMode, null, { timeout: 60000 });
  await p.click("#openSet");
  await p.selectOption("#set_preset", preset);
  await p.click("#setDone");
  await p.evaluate(o => KA.startMode("spectate", o), START[scene]);
  /* let the pods land and the fighting start, and shaders compile */
  await p.waitForTimeout(8000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("HeapProfiler.enable");
  const metrics = async () =>
    Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  await p.evaluate(() => {
    window.__frames = 0;
    const f = () => {
      window.__frames++;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  const f0 = await p.evaluate(() => window.__frames);
  const m0 = await metrics();
  await cdp.send("Profiler.start");
  await cdp.send("HeapProfiler.startSampling", {
    samplingInterval: 16384,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await p.waitForTimeout(SECONDS * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  const { profile: heap } = await cdp.send("HeapProfiler.stopSampling");
  const m1 = await metrics();
  const frames = (await p.evaluate(() => window.__frames)) - f0;
  const per = k => +((1000 * (m1[k] - m0[k])) / Math.max(1, frames)).toFixed(3);
  /* CPU profile: self time per node from the samples */
  const nodes = profile.nodes,
    self = new Map(nodes.map(n => [n.id, 0]));
  const dts = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, self.get(id) + (dts[i] || 0)));
  const busy = nodes
    .filter(n => !/^\((idle|program|garbage collector)\)$/.test(n.callFrame.functionName))
    .reduce((a, n) => a + self.get(n.id), 0);
  const gc = nodes
    .filter(n => n.callFrame.functionName === "(garbage collector)")
    .reduce((a, n) => a + self.get(n.id), 0);
  const heapNodes = flatten(heap.head),
    allocated = heapNodes.reduce((a, n) => a + n.selfSize, 0);
  const out = {
    scene,
    preset,
    gpu: !!process.env.GPU,
    seconds: SECONDS,
    fps: +(frames / SECONDS).toFixed(1),
    scriptMsPerFrame: per("ScriptDuration"),
    taskMsPerFrame: per("TaskDuration"),
    styleLayoutMsPerFrame: +(per("RecalcStyleDuration") + per("LayoutDuration")).toFixed(3),
    gcShare: +((100 * gc) / Math.max(1, busy + gc)).toFixed(1),
    /* every sampled allocation in the window, including what the GC already collected */
    allocKBPerFrame: +(allocated / 1024 / Math.max(1, frames)).toFixed(1),
    heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1),
    hotSelf: topBy(
      nodes,
      n => (/^\((idle|program|garbage collector)\)$/.test(n.callFrame.functionName) ? 0 : self.get(n.id)),
      busy
    ),
    hotAlloc: topBy(heapNodes, n => n.selfSize, allocated),
    errors: errors.slice(0, 3),
  };
  await ctx.close();
  return out;
}

(async () => {
  const url = await buildDev();
  const args = process.env.GPU
    ? ["--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: [...args, "--mute-audio"],
  });
  for (const scene of SCENES)
    for (const preset of PRESETS) {
      const r = await run(browser, url, scene, preset);
      fs.writeFileSync(path.join(ROOT, "out", `profile-${scene}-${preset}.json`), JSON.stringify(r, null, 1));
      console.log(
        `${scene} ${preset}: ${r.fps} fps, script ${r.scriptMsPerFrame} ms/frame, task ${r.taskMsPerFrame}, style+layout ${r.styleLayoutMsPerFrame}, gc ${r.gcShare}%, alloc ${r.allocKBPerFrame} KB/frame, heap ${r.heapMB} MB${r.errors.length ? " ERR " + r.errors[0] : ""}`
      );
    }
  await browser.close();
})();
