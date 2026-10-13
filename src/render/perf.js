/* ============ performance overlay: frame time split (logic / render / post), GPU timing when the browser
   exposes timer queries, draw calls, triangles, scene resources, memory and network stats ============ */
const PERF = {
  on: false,
  t0: 0,
  frameMs: 0,
  renderCpu: 0,
  postCpu: 0,
  hist: new Float32Array(120),
  hi: 0,
  /** GPU milliseconds per pass label (scene, ssao, shafts, ssr, bloom, comp), smoothed; seen: frames since */
  gpu: { ok: false },
  gpuSeen: {},
  nextDraw: 0,
};
/* GPU timer queries (WebGL2 EXT_disjoint_timer_query_webgl2): results arrive a few frames later */
const GPUQ = (() => {
  const gl = renderer.getContext();
  const ext = gl.getExtension && gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!ext || !(gl instanceof WebGL2RenderingContext)) return null;
  const pending = [];
  let cur = null;
  return {
    begin(label) {
      if (!PERF.on || cur) return;
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      cur = { q, label };
    },
    end() {
      if (!cur) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(cur);
      cur = null;
    },
    poll() {
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const p = pending[0];
        if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        if (!disjoint) {
          const ms = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
          const was = PERF.gpu[p.label] || 0;
          PERF.gpu[p.label] = was + (ms - was) * 0.1;
          PERF.gpuSeen[p.label] = PERF.t0;
          PERF.gpu.ok = true;
        }
        gl.deleteQuery(p.q);
      }
      while (pending.length > 12) gl.deleteQuery(pending.shift().q);
    },
  };
})();
renderer.info.autoReset = false;
function perfBegin() {
  PERF.on = !!SET.perfOverlay;
  PERF.t0 = performance.now();
  PERF.renderCpu = PERF.postCpu = 0;
  renderer.info.reset();
}
function perfEnd() {
  const ms = performance.now() - PERF.t0;
  PERF.frameMs += (ms - PERF.frameMs) * 0.1;
  PERF.hist[PERF.hi++ % PERF.hist.length] = ms;
  const el = $("perfHud");
  if (!PERF.on) {
    if (el && !el.hidden) el.hidden = true;
    return;
  }
  if (GPUQ) GPUQ.poll();
  if (!el || PERF.t0 < PERF.nextDraw) return;
  PERF.nextDraw = PERF.t0 + 250;
  el.hidden = false;
  let worst = 0,
    sum = 0;
  for (const v of PERF.hist) {
    worst = Math.max(worst, v);
    sum += v;
  }
  const i = renderer.info,
    mem = /** @type {any} */ (performance).memory;
  const logic = Math.max(0, ms - PERF.renderCpu - PERF.postCpu);
  /* passes that ran in the last second (a pass that turned off drops out) */
  const passes = Object.keys(PERF.gpuSeen).filter(k => PERF.t0 - PERF.gpuSeen[k] < 1000);
  const gpuPost = passes.filter(k => k !== "scene").reduce((a, k) => a + PERF.gpu[k], 0);
  const rows = [
    ["frame", `${(sum / PERF.hist.length).toFixed(2)} ms avg · ${worst.toFixed(1)} worst (2 s)`],
    ["logic", `${logic.toFixed(2)} ms cpu`],
    [
      "render",
      `${PERF.renderCpu.toFixed(2)} ms cpu${PERF.gpu.ok ? ` · ${(PERF.gpu.scene || 0).toFixed(2)} ms gpu` : ""}`,
    ],
    ["post", `${PERF.postCpu.toFixed(2)} ms cpu${PERF.gpu.ok ? ` · ${gpuPost.toFixed(2)} ms gpu` : ""}`],
    ...(PERF.gpu.ok
      ? [["passes", passes.map(k => `${k} ${PERF.gpu[k].toFixed(2)}`).join(" · ") + " ms gpu"]]
      : []),
    ["draws", `${i.render.calls} calls · ${(i.render.triangles / 1000).toFixed(1)}k tris`],
    [
      "scene",
      `${i.memory.geometries} geometries · ${i.memory.textures} textures · ${i.programs ? i.programs.length : "?"} shaders`,
    ],
    ["res", `${Math.round(gfxScale() * 100)}% · ${GFX.w || 0}×${GFX.h || 0}`],
  ];
  if (mem) rows.push(["heap", `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB`]);
  const nl = netLine();
  if (nl) rows.push(["net", nl]);
  if (!GPUQ) rows.push(["gpu", "timer queries unavailable: render/post show CPU submit time"]);
  el.textContent = "";
  for (const [k, v] of rows) {
    const r = document.createElement("div"),
      a = document.createElement("b");
    a.textContent = k;
    r.append(a, document.createTextNode(v));
    el.appendChild(r);
  }
}
