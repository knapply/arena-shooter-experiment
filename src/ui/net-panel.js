/* ============ network panel (F4), roster connection bars and the overlay's network line ============ */
/** @returns {any} stats from the host page's transport, or null when offline / not supported */
function netStats() {
  const n = window.KAHOST && window.KAHOST.net;
  return n ? n.stats() : null;
}
/** round trip to a peer in ms (direct, or through the room host), or null if unknown */
function pingOf(peer) {
  const s = netStats();
  const p = s && s.peers[peer];
  return p && p.rtt > 0 ? p.rtt : null;
}
/** a small four-bar connection indicator for roster rows */
function pingBars(rtt) {
  const el = document.createElement("span");
  el.className = "pbars";
  if (rtt == null) {
    el.title = "connecting";
    el.dataset.q = "0";
    return el;
  }
  const q = rtt < 60 ? 4 : rtt < 110 ? 3 : rtt < 180 ? 2 : 1;
  el.dataset.q = String(q);
  el.title = `${rtt} ms`;
  for (let i = 0; i < 4; i++) el.appendChild(document.createElement("i"));
  return el;
}
const kbps = b => (b / 1024).toFixed(1) + " kB/s";
/** one-line summary for the performance overlay */
function netLine() {
  const s = netStats();
  if (!s || s.role === "offline") return null;
  if (!s.links.length) return `${s.role} · waiting for players`;
  const worst = s.links.reduce((a, l) => (l.rtt > a.rtt ? l : a), s.links[0]);
  const inB = s.links.reduce((a, l) => a + l.inBps, 0),
    outB = s.links.reduce((a, l) => a + l.outBps, 0);
  return `${s.role} · ping ${worst.rtt} ms ±${worst.jitter} · loss ${Math.round(worst.loss * 100)}% · in ${kbps(inB)} · out ${kbps(outB)}${s.sim ? " · SIMULATED" : ""}`;
}
let netNext = 0;
function updNetHud() {
  const el = $("netHud");
  if (!el) return;
  if (!SET.netOverlay) {
    if (!el.hidden) el.hidden = true;
    return;
  }
  const t = performance.now();
  if (t < netNext) return;
  netNext = t + 300;
  el.hidden = false;
  const s = netStats();
  el.textContent = "";
  const head = document.createElement("div");
  head.className = "nh";
  head.textContent = !s
    ? "Network: not available in this build"
    : s.role === "offline"
      ? "Network: offline · host or join a room to see connection stats"
      : `Network · ${s.role}${s.code ? " · room " + s.code.toUpperCase() : ""}`;
  el.appendChild(head);
  if (s && s.sim) {
    const w = document.createElement("div");
    w.className = "nsim";
    w.textContent = `Simulating ${s.sim.latency} ms ±${s.sim.jitter} one way, ${Math.round(s.sim.loss * 100)}% loss`;
    el.appendChild(w);
  }
  if (s && s.role !== "offline") hitPanel(el);
  if (!s || !s.links.length) return;
  const tb = document.createElement("table");
  const hr = tb.insertRow();
  for (const h of ["player", "ping", "jitter", "loss", "last", "in", "out"]) {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  }
  for (const l of s.links) {
    const r = tb.insertRow();
    for (const v of [
      l.name + (s.role === "client" ? " (host)" : ""),
      l.rtt + " ms",
      "±" + l.jitter,
      Math.round(l.loss * 100) + "%",
      l.age + " ms",
      kbps(l.inBps),
      kbps(l.outBps),
    ])
      r.insertCell().textContent = v;
  }
  el.appendChild(tb);
}
