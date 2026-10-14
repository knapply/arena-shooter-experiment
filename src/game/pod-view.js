/* ============ POD COCKPIT: riding your own drop pod down, from inside ============
   While your pod falls (unless you skipped it), the camera sits at the rider's eyes looking down
   through the pod's window: the ground rushes up around the landing marker, re-entry plasma licks
   the window's edges, the interior is lit red and shakes harder the lower it gets, and readouts on
   the frame give altitude, speed, time to impact and whether you can still steer, with brackets on
   the landing point. On impact: a white flash and a thump, the frame's two halves blow outward, and
   the camera rises out of the buried pod to your eye height (podExitCam).
   The cockpit is HTML and SVG over the canvas (no draw calls). The vibration follows the Screen
   shake setting and stops for reduced motion. podCockpit(p) runs every frame you ride; podCockpitIdle
   every other frame (the step out, then nothing). */
const PV = {
  /** the size the frame was drawn for */
  w: 0,
  h: 0,
  on: false,
  /** seconds since your pod landed (the step out), or -1 */
  exit: -1,
  /** the camera's height and pitch inside the buried pod, where the step out starts */
  y0: 0,
  pitch: 0,
  /** what the readouts last showed (only changed text is written) */
  txt: {},
  steer: null,
};
/** how long the step out takes (s), and how long the frame stays on screen */
const PV_RISE = 0.55,
  PV_END = 0.8;
const pvEl = () => $("podView");
const pvLerp = (a, b, t) => a + (b - a) * t;
/** draw the frame for this screen size: a window with chamfered corners, split down the middle into
   two blast doors, each with struts, seams, rivets and a hazard band, lit from above */
function pvBuild() {
  const W = innerWidth,
    H = innerHeight;
  PV.w = W;
  PV.h = H;
  const cx = W / 2,
    cy = H / 2,
    a = W * 0.36,
    b = H * 0.37,
    c = Math.min(a, b) * 0.32,
    s = Math.min(W, H);
  const f = n => n.toFixed(1);
  const win = `M${f(cx)} ${f(cy - b)}L${f(cx - a + c)} ${f(cy - b)}L${f(cx - a)} ${f(cy - b + c)}L${f(cx - a)} ${f(cy + b - c)}L${f(cx - a + c)} ${f(cy + b)}L${f(cx)} ${f(cy + b)}Z`;
  const door = `M0 0H${f(cx)}V${H}H0Z${win}`;
  const rimPts = `${f(cx)},${f(cy - b)} ${f(cx - a + c)},${f(cy - b)} ${f(cx - a)},${f(cy - b + c)} ${f(cx - a)},${f(cy + b - c)} ${f(cx - a + c)},${f(cy + b)} ${f(cx)},${f(cy + b)}`;
  /* struts from the window's corners out to the screen's */
  const sw = s * 0.035;
  const strut = (x0, y0, x1, y1) => {
    const L = Math.hypot(x1 - x0, y1 - y0),
      nx = (-(y1 - y0) / L) * sw,
      ny = ((x1 - x0) / L) * sw;
    return `<path class="st" d="M${f(x0 - nx)} ${f(y0 - ny)}L${f(x1 - nx)} ${f(y1 - ny)}L${f(x1 + nx)} ${f(y1 + ny)}L${f(x0 + nx)} ${f(y0 + ny)}Z"/><path class="sh" d="M${f(x0 - nx)} ${f(y0 - ny)}L${f(x1 - nx)} ${f(y1 - ny)}"/>`;
  };
  let rivets = "";
  const rv = s * 0.006;
  for (let y = cy - b + c + s * 0.04; y < cy + b - c - s * 0.02; y += s * 0.055)
    rivets += `<circle cx="${f(cx - a - s * 0.03)}" cy="${f(y)}" r="${f(rv)}"/>`;
  for (let x = cx - a + c + s * 0.03; x < cx - s * 0.03; x += s * 0.055)
    rivets += `<circle cx="${f(x)}" cy="${f(cy - b - s * 0.028)}" r="${f(rv)}"/><circle cx="${f(x)}" cy="${f(cy + b + s * 0.028)}" r="${f(rv)}"/>`;
  const seams = [0.18, 0.5, 0.82]
    .map(k => `<path class="sm" d="M0 ${f(H * k)}H${f(cx - a - s * 0.06)}"/>`)
    .join("");
  const hz = s * 0.03;
  const half = `
    <path d="${door}" fill="url(#pvMetal)" fill-rule="evenodd"/>
    ${seams}
    ${strut(cx - a + c * 0.5, cy - b + c * 0.5, 0, 0)}
    ${strut(cx - a + c * 0.5, cy + b - c * 0.5, 0, H)}
    <rect class="hz" x="${f(cx - a + c)}" y="${f(cy + b + s * 0.05)}" width="${f(a - c)}" height="${f(hz)}" fill="url(#pvHaz)"/>
    <rect class="hz" x="${f(cx - a + c)}" y="${f(cy - b - s * 0.05 - hz)}" width="${f(a - c)}" height="${f(hz)}" fill="url(#pvHaz)"/>
    <g class="rv">${rivets}</g>
    <rect class="edge" x="${f(cx - s * 0.014)}" y="0" width="${f(s * 0.014)}" height="${f(cy - b)}"/>
    <rect class="edge" x="${f(cx - s * 0.014)}" y="${f(cy + b)}" width="${f(s * 0.014)}" height="${f(H - cy - b)}"/>
    <path d="${door}" fill="url(#pvLamp)" fill-rule="evenodd"/>
    <polyline class="bz" stroke-width="${f(s * 0.03)}" points="${rimPts}"/>
    <polyline class="rim" points="${rimPts}"/>
    <circle class="led" cx="${f(cx - a * 0.55)}" cy="${f(cy - b - s * 0.09)}" r="${f(s * 0.008)}"/>
    <circle class="led b" cx="${f(cx - a * 0.55 + s * 0.03)}" cy="${f(cy - b - s * 0.09)}" r="${f(s * 0.008)}"/>`;
  const defs = `<defs>
    <linearGradient id="pvMetal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b3339"/><stop offset=".45" stop-color="#181d21"/><stop offset="1" stop-color="#232a30"/>
    </linearGradient>
    <radialGradient id="pvLamp" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="0" r="${f(Math.max(W, H) * 0.75)}">
      <stop offset="0" class="lamp0"/><stop offset="1" class="lamp1"/>
    </radialGradient>
    <pattern id="pvHaz" patternUnits="userSpaceOnUse" width="${f(hz * 1.4)}" height="${f(hz * 1.4)}" patternTransform="rotate(45)">
      <rect width="${f(hz * 0.7)}" height="${f(hz * 1.4)}" fill="#c99a1e"/><rect x="${f(hz * 0.7)}" width="${f(hz * 0.7)}" height="${f(hz * 1.4)}" fill="#141414"/>
    </pattern>
  </defs>`;
  const svg = (mirror, body) =>
    `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${mirror ? "" : defs}<g${mirror ? ` transform="translate(${W} 0) scale(-1 1)"` : ""}>${body}</g></svg>`;
  const el = pvEl();
  const L = el.querySelector(".pv-door.l"),
    R = el.querySelector(".pv-door.r");
  /* the readouts sit on the side panels, beside the window */
  const side = cx - a;
  L.innerHTML =
    svg(false, half) +
    `<div class="pv-read" style="left:${f(side * 0.14)}px;top:${f(cy - b * 0.5)}px;width:${f(side * 0.72)}px">
      <small>ALT</small><b data-k="alt">200</b><small>M</small>
      <div class="pv-bar"><i data-k="bar"></i></div>
      <small>VEL</small><span data-k="vel">0</span><small>M/S</small></div>`;
  R.innerHTML =
    svg(true, half) +
    `<div class="pv-read r" style="right:${f(side * 0.14)}px;top:${f(cy - b * 0.5)}px;width:${f(side * 0.72)}px">
      <small>STEER</small><b data-k="steer">OPEN</b><small data-k="hint">MOVE KEYS</small>
      <small class="gap">IMPACT</small><span data-k="eta">2.6</span><small>S</small></div>`;
  PV.txt = {};
}
/** write a readout only when it changes */
function pvSet(k, v) {
  if (PV.txt[k] === v) return;
  PV.txt[k] = v;
  for (const n of pvEl().querySelectorAll(`[data-k="${k}"]`)) {
    if (k === "bar") /** @type {HTMLElement} */ (n).style.transform = `scaleY(${v})`;
    else n.textContent = v;
  }
}
function pvShow() {
  const el = pvEl();
  if (!el) return false;
  if (PV.w !== innerWidth || PV.h !== innerHeight) pvBuild();
  if (!PV.on) {
    PV.on = true;
    el.hidden = false;
    el.classList.remove("impact", "blown");
  }
  return true;
}
function pvHide() {
  if (!PV.on) return;
  PV.on = false;
  PV.exit = -1;
  const el = pvEl();
  el.hidden = true;
  el.classList.remove("impact", "blown");
  el.style.transform = "";
}
const _pvP = new V3();
/** the camera and cockpit while you ride your pod down */
function podCockpit(p, dt) {
  podView(p);
  if (!pvShow()) return;
  PV.exit = -1;
  const el = pvEl();
  const k = clamp(p.t / p.dur, 0, 1),
    g = p.g.position,
    up = Math.max(0, g.y - p.at.y);
  /* the vibration builds as it comes in and peaks under the retros */
  const vib = reduceMotion ? 0 : SET.shake * (0.2 + 0.8 * k * k) * (k > 0.8 ? 1.5 : 1);
  const j = n => (Math.random() * 2 - 1) * n * vib;
  /* looking nearly straight down at first, tipping forward a little as the ground comes up */
  PV.pitch = pvLerp(-1.42, -1.12, k * k * (3 - 2 * k));
  camera.position.set(g.x + j(0.015), g.y + POD_EYE + j(0.015), g.z + j(0.015));
  camera.rotation.order = "YXZ";
  camera.rotation.y = me.yaw + j(0.004);
  camera.rotation.x = PV.pitch + j(0.004);
  camera.rotation.z = Math.sin(now * 1.3) * 0.015 + j(0.004);
  camera.fov = 76;
  camera.updateProjectionMatrix();
  el.style.transform = vib ? `translate(${j(3).toFixed(1)}px,${j(3).toFixed(1)}px)` : "";
  /* plasma and lamp: the burn high up, the retros' glow from below at the end */
  const retro = k > 0.8 ? Math.min(1, (k - 0.8) * 6) : 0;
  el.style.setProperty("--heat", (p.heat * (0.75 + Math.random() * 0.25) * (1 - retro * 0.6)).toFixed(2));
  el.style.setProperty("--retro", (retro * (0.7 + Math.random() * 0.3)).toFixed(2));
  el.style.setProperty(
    "--lamp",
    (0.55 + Math.random() * 0.15 + (Math.random() < 0.03 ? -0.35 : 0)).toFixed(2)
  );
  /* readouts: altitude, speed (the fall's own curve), time to impact, steering */
  pvSet("alt", String(Math.round(up)).padStart(3, "0"));
  pvSet("bar", (up / p.h).toFixed(3));
  pvSet("vel", String(Math.round((p.h / p.dur) * podSpeed(k))));
  pvSet("eta", Math.max(0, p.dur - p.t).toFixed(1));
  const steer = podSteerable(p);
  pvSet("steer", p.steer ? (steer ? "OPEN" : "LOCKED") : "—");
  pvSet("hint", p.steer ? (steer ? (pad.on ? "LEFT STICK" : "MOVE KEYS") : "BRACE") : "BRACE");
  if (steer !== PV.steer) {
    PV.steer = steer;
    el.classList.toggle("locked", !steer);
  }
  /* brackets on the landing point */
  const tg = /** @type {HTMLElement} */ (el.querySelector(".pv-tgt"));
  _pvP.set(p.vis.x, p.at.y, p.vis.z).project(camera);
  if (_pvP.z < 1 && Math.abs(_pvP.x) < 1.2 && Math.abs(_pvP.y) < 1.2) {
    const dist = Math.max(1, camera.position.distanceTo(_pvP.set(p.vis.x, p.at.y, p.vis.z)));
    const px =
      (POD_MARK.scale.x * 1.25 * (innerHeight / 2)) / (dist * Math.tan((camera.fov * Math.PI) / 360));
    const sz = Math.max(34, Math.min(innerHeight * 0.5, px * 2.4));
    _pvP.project(camera);
    tg.style.transform = `translate(${(((_pvP.x + 1) / 2) * innerWidth - sz / 2).toFixed(1)}px,${(((1 - _pvP.y) / 2) * innerHeight - sz / 2).toFixed(1)}px)`;
    tg.style.width = tg.style.height = sz.toFixed(1) + "px";
    tg.style.opacity = "1";
  } else tg.style.opacity = "0";
  void dt;
}
/** your pod hit the ground: flash, thump, blow the doors, and start the step out */
function podCockpitLand(p) {
  if (!PV.on) return;
  PV.exit = 0;
  PV.y0 = p.at.y - (p.seat ? p.seat.bury : 0) + POD_EYE;
  const el = pvEl();
  el.classList.add("impact");
  el.style.transform = "";
  el.style.setProperty("--heat", "0");
  el.style.setProperty("--retro", "0");
  el.style.setProperty("--lamp", "0.9");
}
/** every frame you are not riding a pod: the step out after a landing (after the game camera is placed) */
function podCockpitIdle(dt) {
  if (!PV.on) return;
  if (PV.exit < 0 || !playing) return pvHide();
  PV.exit += dt;
  const u = PV.exit,
    el = pvEl();
  if (u >= POD_BLOW && !el.classList.contains("blown")) el.classList.add("blown");
  if (u >= PV_END) return pvHide();
  /* under the flash you look up from the window to the world; then you rise out of the crater to
     your eyes as you step out */
  const ease = e => e * e * (3 - 2 * e);
  camera.rotation.x = pvLerp(PV.pitch, camera.rotation.x, ease(clamp(u / 0.16, 0, 1)));
  camera.position.y = pvLerp(PV.y0, camera.position.y, ease(clamp((u - 0.04) / PV_RISE, 0, 1)));
}
