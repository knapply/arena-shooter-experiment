/* ============ reticle and scope ============
   Each weapon has its own reticle (drawn in SVG, sized to the screen like the references': the pistol a
   small ring with a dot, the rifles four arcs round a split cross that spread with bloom, the sniper a
   ring with four ticks, the rocket a bracketed sight, the shotgun one wide ring that shows its spread).
   It turns red while an enemy is under it and within the weapon's effective range (RANGE, metres).
   Hits flash short diagonal ticks just outside it. Aiming down sights brings up that weapon's sight
   over the view: a glowing smart-link ring for the pistol, the rocket and the shotgun, a holographic
   ring with range lines for the rifles (the hip reticle stays in the middle of those), and for the
   sniper a full visor frame with its own crosshair, the zoom levels (the live one lit), the range and
   which button gives the other zoom level on the device in use. The sight fades in over the last
   three quarters of the zoom and settles from slightly large. */
const _sd = new V3();
const RANGE = {
  carbine: 42,
  pistol: 60,
  sniper: 220,
  rocket: 60,
  burst: 55,
  scatter: 14,
  shotgun: 14,
  beam: 30,
};
/** which reticle and sight a weapon uses, by WEAPON_DATA key */
const SIGHT = {
  pistol: "smart",
  carbine: "holo",
  burst: "holo",
  beam: "holo",
  sniper: "sniper",
  rocket: "rocket",
  scatter: "shotgun",
  shotgun: "shotgun",
};
const sightOf = w => SIGHT[w.key] || (w.zoom[0] >= 3 ? "sniper" : "smart");
const SVG_NS = "http://www.w3.org/2000/svg";
/* ---- hip reticles: viewBox -50..50, the box is 13% of the screen height ---- */
const arcPath = (r, a0, a1) => {
  const p = a => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}`;
};
const deg = d => (d * Math.PI) / 180;
const RETICLE = {
  /* a small ring with a dot ring in it */
  smart: '<circle r="14"/><circle r="3.4"/>',
  /* four arcs on the diagonals (they spread with bloom) round a cross split in the middle */
  holo:
    '<g class="bl">' +
    [45, 135, 225, 315].map(a => `<path d="${arcPath(24, deg(a - 32), deg(a + 32))}"/>`).join("") +
    "</g>" +
    '<path d="M0 -10V-3.5M0 3.5V10M-10 0H-3.5M3.5 0H10"/>',
  /* a ring with four ticks outside it and a dot ring */
  sniper: '<circle r="12"/><path d="M0 -12V-18M0 12V18M-12 0H-18M12 0H18"/><circle r="2.6"/>',
  /* a dot ring inside four corner brackets */
  rocket:
    '<circle r="5"/><circle r="0.9" class="fill"/>' +
    '<path d="M-22 -14V-22H-14M14 -22H22V-14M22 14V22H14M-14 22H-22V14"/>' +
    '<path d="M0 -30V-25M0 25V30M-30 0H-25M25 0H30" class="dim"/>',
  /* one wide ring (the spread) and a faint centre dot */
  shotgun: '<circle r="44"/><circle r="1.1" class="fill dim"/>',
};
/* hit ticks: four short diagonals just outside each reticle (inside the shotgun's wide ring, and inside
   the rocket's brackets), from radius r0 to r1 */
const HIT_R = { smart: [18, 26], holo: [29, 37], sniper: [21, 29], rocket: [8, 15], shotgun: [7, 14] };
const hitTicks = ([r0, r1]) =>
  [45, 135, 225, 315]
    .map(a => {
      const c = Math.cos(deg(a)),
        s = Math.sin(deg(a));
      return `<path d="M${(c * r0).toFixed(2)} ${(s * r0).toFixed(2)}L${(c * r1).toFixed(2)} ${(s * r1).toFixed(2)}"/>`;
    })
    .join("");
let xhKind = "",
  xhSvg = null;
function drawReticle(kind) {
  if (kind === xhKind) return;
  xhKind = kind;
  const xh = $("xh");
  if (!xhSvg) {
    xhSvg = document.createElementNS(SVG_NS, "svg");
    xhSvg.setAttribute("viewBox", "-50 -50 100 100");
    xhSvg.setAttribute("aria-hidden", "true");
    xh.appendChild(xhSvg);
    const hm = document.createElementNS(SVG_NS, "svg");
    hm.setAttribute("viewBox", "-50 -50 100 100");
    $("hitm").appendChild(hm);
  }
  $("hitm").firstElementChild.innerHTML = hitTicks(HIT_R[kind] || HIT_R.smart);
  xhSvg.innerHTML = RETICLE[kind] || RETICLE.smart;
  xh.dataset.kind = kind;
}
/** the reticle's spread: sp is the old tick offset (9 at rest, 4 aimed, more with bloom and recoil);
    the rifles' arcs open and close with it, the others only kick a little with recoil */
function xhBloom(sp) {
  const k = xhKind === "holo" ? clamp(sp / 9, 0.55, 2.4) : 1 + clamp(recoil * 6, 0, 0.25);
  $("xh").style.setProperty("--bl", k.toFixed(3));
}
/* ---- sights while aiming: an SVG over the whole view, in screen pixels ---- */
let scKey = "",
  scSvg = null;
const scH = (tag, attrs, text) =>
  `<${tag} ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${typeof v === "number" ? v.toFixed(1) : v}"`)
    .join(" ")}>${text != null ? text : ""}</${tag}>`;
/** a ring of ticks: n of them from radius r0 to r1 (skipping angles in skip) */
function ringTicks(cx, cy, r0, r1, n, cls = "") {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a);
    d += `M${(cx + c * r0).toFixed(1)} ${(cy + s * r0).toFixed(1)}L${(cx + c * r1).toFixed(1)} ${(cy + s * r1).toFixed(1)}`;
  }
  return scH("path", { d, class: cls });
}
/** the sniper's visor: a dark frame round a chamfered window, with its crosshair and readouts */
function sniperSight(W, H, lvl, zs) {
  const u = H / 100,
    cx = W / 2,
    cy = H / 2,
    L = Math.max(W * 0.07, cx - 75 * u),
    R = W - L,
    T = H * 0.19,
    B = H * 0.8,
    c = 5 * u,
    n = 3.2 * u;
  const win = `M${L + c} ${T}H${R - c}L${R} ${T + c}V${cy - 9 * u}L${R + n} ${cy - 6 * u}V${cy + 6 * u}L${R} ${cy + 9 * u}V${B - c}L${R - c} ${B}H${L + c}L${L} ${B - c}V${cy + 9 * u}L${L - n} ${cy + 6 * u}V${cy - 6 * u}L${L} ${cy - 9 * u}V${T + c}Z`;
  let s = "";
  s += scH("path", { d: `M0 0H${W}V${H}H0Z${win}`, class: "frame", "fill-rule": "evenodd" });
  s += scH("path", { d: win, class: "edge" });
  /* the window darkens toward its edges */
  s += scH("rect", { x: L - n, y: T, width: R - L + 2 * n, height: B - T, fill: "url(#scVig)" });
  /* the horizontal line, ticked every 4 units (longer every 16), split round the middle */
  let d = `M${L + 2 * u} ${cy}H${cx - 1.6 * u}M${cx + 1.6 * u} ${cy}H${R - 2 * u}`;
  for (let k = 4; cx + k * u < R - 3 * u; k += 4) {
    const h = k % 16 ? 0.7 * u : 1.5 * u;
    d += `M${cx + k * u} ${cy - h}V${cy + h}M${cx - k * u} ${cy - h}V${cy + h}`;
  }
  /* the vertical line under the middle */
  d += `M${cx} ${cy + 3 * u}V${B}`;
  for (let k = 8; cy + k * u < B - u; k += 8) d += `M${cx - u} ${cy + k * u}H${cx + u}`;
  s += scH("path", { d, class: "cross" });
  s += scH("circle", { cx, cy, r: 0.9 * u, class: "cross" });
  /* the range ring, with a heavy arc low on the right; smaller at the second level */
  const rr = (lvl > 1 ? 10 : 16) * u;
  s += scH("circle", { cx, cy, r: rr, class: "faint" });
  const a0 = deg(18),
    a1 = deg(78);
  s += scH("path", {
    d: `M${cx + Math.cos(a0) * rr} ${cy + Math.sin(a0) * rr}A${rr} ${rr} 0 0 1 ${cx + Math.cos(a1) * rr} ${cy + Math.sin(a1) * rr}`,
    class: "arc",
    "stroke-width": 1.4 * u,
  });
  /* the side columns of ticks and the lights at the ends of the line */
  let t = "";
  for (let y = T + 6 * u; y < B - 5 * u; y += 4.5 * u)
    if (Math.abs(y - cy) > 8 * u) t += `M${L + 2.5 * u} ${y}h${1.2 * u}M${R - 2.5 * u} ${y}h${-1.2 * u}`;
  s += scH("path", { d: t, class: "faint" });
  s += scH("circle", { cx: L + 1.4 * u, cy, r: 0.5 * u, class: "light" });
  s += scH("circle", { cx: R - 1.4 * u, cy, r: 0.5 * u, class: "light" });
  /* the zoom levels, the live one lit */
  zs.forEach((z, i) => {
    const x = L + 6 * u + i * 7.4 * u,
      y = T + 3.4 * u,
      on = i + 1 === lvl;
    s += scH("rect", { x, y, width: 6.4 * u, height: 3.4 * u, class: on ? "zbox on" : "zbox" });
    s += scH(
      "text",
      { x: x + 3.2 * u, y: y + 2.45 * u, class: on ? "ztxt on" : "ztxt", "font-size": 2 * u },
      z + "×"
    );
  });
  return s;
}
/** the low-zoom sights: a ring that frames the middle of the view */
function ringSight(kind, W, H) {
  const u = H / 100,
    cx = W / 2,
    cy = H / 2;
  let s = "";
  if (kind === "holo") {
    const r = 20 * u;
    s += scH("circle", { cx, cy, r, class: "ring thin" });
    s += ringTicks(cx, cy, r - 1.6 * u, r, 4, "ring");
    s += ringTicks(cx, cy, r - 0.7 * u, r, 24, "faint");
    /* range lines out to the sides, fading */
    for (const k of [-1, 1]) {
      s += scH("path", { d: `M${cx + k * (r + 1.2 * u)} ${cy}H${cx + k * (r + 22 * u)}`, class: "line" });
      s += scH("path", {
        d: `M${cx + k * (r + 3 * u)} ${cy + 2.4 * u}H${cx + k * (r + 12 * u)}`,
        class: "line faint",
      });
    }
    return s;
  }
  const r = (kind === "shotgun" ? 24 : kind === "rocket" ? 17 : 15) * u;
  s += scH("circle", { cx, cy, r, class: "ring" });
  s += ringTicks(cx, cy, r - 1.1 * u, r, 12, "faint");
  s += ringTicks(cx, cy, r - 2.2 * u, r, 4, "ring");
  for (const k of [-1, 1])
    s += scH("path", { d: `M${cx + k * (r + 0.8 * u)} ${cy}H${cx + k * (r + 5 * u)}`, class: "ring" });
  if (kind === "rocket") {
    const b = 11 * u,
      e = 4 * u;
    let d = "";
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ])
      d += `M${cx + sx * b} ${cy + sy * (b - e)}V${cy + sy * b}H${cx + sx * (b - e)}`;
    s += scH("path", { d, class: "warm" });
  }
  if (kind === "shotgun") s += scH("circle", { cx, cy, r: r - 3 * u, class: "faint" });
  return s;
}
/** (re)draw the sight for this weapon, zoom level and screen size */
function drawSight(kind, lvl) {
  const W = innerWidth,
    H = innerHeight,
    key = [kind, lvl, W, H, wi].join();
  if (key === scKey) return;
  scKey = key;
  if (!scSvg) {
    scSvg = document.createElementNS(SVG_NS, "svg");
    scSvg.setAttribute("aria-hidden", "true");
    $("scope").prepend(scSvg);
  }
  scSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  scSvg.innerHTML =
    '<defs><radialGradient id="scVig"><stop offset="0.55" stop-color="#02060a" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#02060a" stop-opacity="0.55"/></radialGradient></defs>' +
    (kind === "sniper" ? sniperSight(W, H, lvl, WEAPONS[wi].zoom) : ringSight(kind, W, H));
  /* readouts: the sniper's under its window, the others under their ring */
  const u = H / 100;
  const info = /** @type {HTMLElement} */ ($("scope").querySelector(".sinfo"));
  info.style.top =
    (kind === "sniper"
      ? H * 0.8 + 2.2 * u
      : H / 2 + (kind === "holo" ? 22 : kind === "shotgun" ? 26 : 19) * u) + "px";
  const zh = $("zHint");
  zh.style.left = (kind === "sniper" ? Math.max(W * 0.07, W / 2 - 75 * u) + 6 * u : W / 2 + 20 * u) + "px";
  zh.style.top = (kind === "sniper" ? H * 0.19 + 8.6 * u : H / 2 - 24 * u) + "px";
}
/** the second zoom level's button on the device in use, or "" when there is none to show */
function zoomHint(lvl) {
  const zs = W().zoom;
  if (zs.length < 2 || !lvl) return "";
  const next = zs[lvl >= zs.length ? 0 : lvl] + "×",
    dev = hudDevice();
  if (dev === "touch") return `<kbd>Zoom</kbd> ${next}`;
  if (dev === "pad") {
    const b = (PADB.zoom || [])[0];
    return b == null ? "" : `<kbd>${PAD_NAMES[b]}</kbd> ${next}`;
  }
  const k = SET.aimMode === "cycle" ? (BIND.aim || [])[0] : (BIND.zoom || [])[0];
  return k ? `<kbd>${keyLabel(k)}</kbd> ${next}` : "";
}
function updAim() {
  if (!playing || me.dead) {
    $("scope").hidden = true;
    return;
  }
  const kind = sightOf(W());
  drawReticle(kind);
  const o = camera.position;
  const d = _sd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const r = rayWorld(o, d, 300);
  let tr = r,
    hit = false;
  for (const t of targets()) {
    const h = rayTarget(o, d, t.pos, t.h, tr);
    if (h) {
      tr = h.t;
      hit = true;
    }
  }
  const red = hit && tr <= (RANGE[W().key] || 40);
  $("xh").classList.toggle("red", red);
  /* the sniper's visor has its own crosshair; the others keep the hip reticle in the middle */
  $("xh").style.opacity = String(kind === "sniper" ? 1 - adsP : 1);
  const sc = $("scope");
  /* the sight fades in over the last three quarters of the zoom and settles from slightly large; it
     fades out the same way when you let go or are shot out of it */
  const op = clamp((adsP - 0.25) / 0.75, 0, 1),
    on = op > 0;
  sc.hidden = !on;
  const tz = $("tZoom");
  if (tz) tz.hidden = !(aiming && W().zoom.length > 1);
  if (on) {
    const lvl = Math.max(1, zoomLvl);
    drawSight(kind, lvl);
    sc.style.opacity = String(op);
    sc.style.transform = `scale(${1.06 - 0.06 * op})`;
    sc.className = "sc-" + kind + (red ? " lock" : "");
    $("sZoom").textContent = zoomK() + "×";
    $("sRange").textContent = tr < 299 ? tr.toFixed(1) + " m" : "– m";
    const zh = zoomHint(aiming ? zoomLvl : 0);
    const zEl = $("zHint");
    if (zEl.dataset.h !== zh) {
      zEl.dataset.h = zh;
      zEl.innerHTML = zh;
    }
  }
}
