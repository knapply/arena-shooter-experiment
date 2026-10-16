/* ============ HUD ============
   The default layout: grenades top left (each type's icon and count, the selected one lit, and how to
   change type on the device you're using), shield over hull top middle, both weapons and the ammo
   counter (magazine and reserve) top right, the motion tracker bottom left (ui/tracker.js), abilities
   bottom middle. Panels scale with the HUD size setting (ui/settings-ui.js) and hide during pod rides,
   kill cams and replays (styles/cinema.css). */
/* the roster (hold Tab): the in-match stats table (ui/stats-ui.js), refreshed a few times a second */
let scoresT = 0;
function renderScores() {
  if (now - scoresT < 0.25) return;
  scoresT = now;
  renderStatsRoster();
}
/** the input device the HUD's hints are for: a controller if it was used since the keyboard or mouse */
function hudDevice() {
  if (pad.on && GP.lastT >= keysT) return "pad";
  return isTouch ? "touch" : "keys";
}
/* ---- icons: angular silhouettes, filled with currentColor ---- */
/** each weapon's side view (viewBox 0 0 64 20), by WEAPON_DATA key */
const WEAPON_SIL = {
  carbine:
    "M2 9 10 7 14 5 40 5 42 3 50 3 50 6 62 6 62 9 50 9 46 11 40 11 38 16 33 16 34 11 24 11 22 15 16 15 18 11 10 11 2 13Z",
  pistol: "M16 5 52 5 54 3 58 3 58 5 60 5 60 10 32 10 30 18 20 18 23 10 16 10Z",
  sniper:
    "M0 9 8 7 14 7 18 5 32 5 34 2 46 2 46 5 64 5 64 8 40 8 36 11 30 11 28 16 23 16 25 11 14 11 4 13 0 13Z",
  rocket: "M2 5 56 5 60 3 64 3 64 13 60 13 56 11 36 11 34 17 29 17 30 11 22 11 20 16 15 16 16 11 2 11Z",
  burst:
    "M2 9 8 6 16 6 18 4 44 4 46 6 60 6 60 10 46 10 44 12 38 12 36 17 31 17 32 12 24 12 22 17 16 17 18 12 8 12 2 13Z",
  scatter: "M4 8 12 6 20 6 22 4 50 4 50 7 58 7 58 11 40 11 38 13 30 13 28 17 22 17 24 12 12 12 4 13Z",
  beam: "M2 9 10 6 18 6 20 3 40 3 44 1 50 1 54 4 62 4 62 10 54 10 50 13 44 13 40 11 34 11 32 16 27 16 28 11 12 11 2 13Z",
};
/** grenade types (viewBox 0 0 20 24) */
const NADE_ICON = {
  frag: '<path d="M7 2h6v3H7z"/><path d="M13 3.5 17.5 8 16.5 9 12.5 5z"/><path d="M10 5.5c4.2 0 7 3.6 7 8.2S14.2 22 10 22s-7-3.7-7-8.3 2.8-8.2 7-8.2zm-4 8.2h8v1.4H6zm1.2-3.4h5.6v1.3H7.2zm0 7h5.6v1.3H7.2z" fill-rule="evenodd"/>',
  plasma:
    '<circle cx="10" cy="13" r="6.2"/><path d="M1 13c0-2.2 4-3.9 9-3.9s9 1.7 9 3.9-4 3.9-9 3.9-9-1.7-9-3.9zm2 0c0 1.1 3.1 2.4 7 2.4s7-1.3 7-2.4-3.1-2.4-7-2.4-7 1.3-7 2.4z" fill-rule="evenodd"/><path d="M8.5 2.5h3v4h-3z"/>',
  pulse:
    '<path d="M10 3 18 7.5v9L10 21l-8-4.5v-9zm0 4.5L5.5 10v5L10 17.5l4.5-2.5v-5z" fill-rule="evenodd"/><circle cx="10" cy="12.5" r="2.2"/>',
};
const NADE_NAME = { frag: "Frag", plasma: "Plasma", pulse: "Pulse" };
/** a short name for a weapon (the model number dropped): "pulse carbine", "magnum" */
const hudWName = t => WEAPONS[t].name.split(" ").slice(1).join(" ") || WEAPONS[t].name;
/** the grenade swap hint for the device in use, from your bindings */
function nadeHint(dev) {
  if (dev === "touch") return "Tap to swap";
  if (dev === "pad") {
    const bs = PADB.swapNade || [];
    if (!bs.length) return "Unbound";
    if (bs.includes(GPB.LEFT) && bs.includes(GPB.RIGHT)) return "<kbd>D-pad ◂ ▸</kbd>";
    return bs.map(i => `<kbd>${PAD_NAMES[i]}</kbd>`).join(" ");
  }
  const k = (BIND.swapNade || [])[0];
  return k ? `<kbd>${keyLabel(k)}</kbd> swap` : "Unbound";
}
let nadeKey = "";
/** the grenade panel: redrawn only when something on it changes */
function drawNadeHud() {
  const box = $("nadeList");
  if (!box) return;
  const types = nadeTypes(),
    dev = hudDevice(),
    hint = nadeHint(dev);
  const key = types.map(t => t + nadeInv[t]).join() + nadeSel + hint;
  if (key === nadeKey) return;
  nadeKey = key;
  box.innerHTML = types
    .map(
      t =>
        `<div class="nd ${t}${t === nadeSel ? " sel" : ""}${nadeInv[t] > 0 ? "" : " empty"}" title="${NADE_NAME[t]}">` +
        `<svg viewBox="0 0 20 24" aria-hidden="true">${NADE_ICON[t]}</svg><b>${nadeInv[t]}</b><u>${NADE_NAME[t]}</u></div>`
    )
    .join("");
  $("nadeHint").innerHTML = hint;
}
/* on a touch screen the grenade panel is the swap button */
if (isTouch) {
  const nh = $("nadeHud");
  nh.classList.add("tap");
  nh.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (playing && !me.dead) swapNade(1);
  });
}
let weapKey = "";
/** the weapons panel: the gun in hand (silhouette, magazine over reserve, a pip per round), and the
    holstered one with what it has left */
function drawWeapHud() {
  const Wd = W(),
    o = slots[1 - cur],
    rl = reloadT > 0,
    low = !rl && mag <= Math.max(1, Math.floor(Wd.mag / 4)),
    dry = mag <= 0 && reserve[wi] <= 0,
    oTotal = ammo[o] + reserve[o];
  const key = [wi, o, mag, reserve[wi], rl, oTotal, hudDevice()].join();
  if (key === weapKey) return;
  weapKey = key;
  const hud = $("weapHud");
  hud.classList.toggle("low", low && !dry);
  hud.classList.toggle("dry", dry);
  hud.classList.toggle("rl", rl);
  $("wSil").firstElementChild.setAttribute("d", WEAPON_SIL[Wd.key] || WEAPON_SIL.carbine);
  $("mag").textContent = rl ? "··" : String(mag);
  $("rsv").textContent = reserve[wi] === Infinity ? "∞" : String(reserve[wi]);
  const pips = $("pips");
  pips.style.setProperty("--n", String(Wd.mag));
  pips.classList.toggle("solid", Wd.mag > 40);
  /** @type {HTMLElement} */ (pips.firstElementChild).style.transform = `scaleX(${rl ? 0 : mag / Wd.mag})`;
  $("wname").textContent = hudWName(wi);
  const rk = hudDevice() === "pad" ? PAD_NAMES[(PADB.reload || [])[0]] : keyLabel((BIND.reload || [])[0]);
  $("ammoHint").textContent = dry
    ? "No ammo"
    : !rl && reserve[wi] <= 0
      ? "Last mag"
      : low
        ? `Reload${rk ? " · " + rk : ""}`
        : "";
  const nx = $("wNext");
  nx.classList.toggle("dry", oTotal <= 0);
  nx.querySelector("path").setAttribute("d", WEAPON_SIL[WEAPONS[o].key] || WEAPON_SIL.carbine);
  nx.querySelector(".wn").textContent = hudWName(o);
  nx.querySelector("small").textContent = oTotal === Infinity ? "∞" : String(oTotal);
}
function hud() {
  $("shb").style.transform = `scaleX(${me.shield / 70})`;
  $("hpb").style.transform = `scaleX(${me.health / 45})`;
  $("shb").className = shbHit > 0 ? "hit" : rechargeShown > 0 ? "charge" : "";
  $("shN").textContent = String(Math.ceil(me.shield));
  $("hpN").textContent = String(Math.ceil(me.health));
  $("vitals").classList.toggle("low", me.shield <= 0 && !me.dead);
  $("vitals").classList.toggle("hurt", me.health < 45 && !me.dead);
  drawWeapHud();
  drawNadeHud();
  updAim();
  $("kd").textContent = `${kills} K · ${deaths} D`;
  $("kdGoal").textContent = EXT ? "" : `first to ${MODE_DATA.ffa.scoreLimit}`;
  $("uThrust").style.transform = `scaleX(${1 - me.thrustCD / 2.2})`;
  {
    const tk = 1 - me.thrustCD / 2.2;
    $("thrustFill").setAttribute("stroke-dashoffset", String(44 * (1 - tk)));
    $("thrustArc").classList.toggle("full", tk >= 1);
  }
  $("cThrust").className = "chip" + (me.thrustT > 0 ? " on" : me.thrustCD <= 0 ? " ready" : "");
  $("cSlide").className = "chip" + (me.slideT > 0 ? " on" : me.sprint && me.slideCD <= 0 ? " ready" : "");
  $("cStab").className = "chip" + (me.stabbing ? " on" : !me.ground && me.stabT < 1.3 ? " ready" : "");
  $("cPound").className =
    "chip" +
    (me.pound
      ? " on"
      : !me.ground && me.pos.y - groundBelow(me.pos.x, me.pos.z, me.pos.y) > 2.2
        ? " ready"
        : "");
  $("cCharge").className = "chip" + (me.chargeT > 0 ? " on" : me.sprintT > 0.85 ? " ready" : "");
  const pa = $("pound");
  if (me.pound === 1) {
    pa.style.opacity = "1";
    $("poundArc").setAttribute(
      "stroke-dashoffset",
      String(239 * (1 - Math.min(1, me.poundT / TUNE.poundCharge)))
    );
  } else pa.style.opacity = "0";
  const sp = 9 - 5 * adsP + bloom * 400 + recoil * 200;
  xhBloom(sp);
  if (!$("scores").hidden) renderScores();
}
