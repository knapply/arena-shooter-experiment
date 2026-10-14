/* ============ HUD ============ */
/* the roster (hold Tab): the in-match stats table (ui/stats-ui.js), refreshed a few times a second */
let scoresT = 0;
function renderScores() {
  if (now - scoresT < 0.25) return;
  scoresT = now;
  renderStatsRoster();
}
const xhEls = ["t", "b", "l", "r"].map(c => /** @type {HTMLElement} */ (document.querySelector("#xh ." + c)));
function hud() {
  $("shb").style.transform = `scaleX(${me.shield / 70})`;
  $("hpb").style.transform = `scaleX(${me.health / 45})`;
  $("shb").className = shbHit > 0 ? "hit" : rechargeShown > 0 ? "charge" : "";
  $("shN").textContent = String(Math.ceil(me.shield));
  $("hpN").textContent = String(Math.ceil(me.health));
  $("vitals").classList.toggle("low", me.shield <= 0 && !me.dead);
  $("mag").textContent = String(reloadT > 0 ? "··" : mag);
  {
    const rv = $("rsv");
    if (rv) rv.textContent = " / " + (reserve[wi] === Infinity ? "∞" : reserve[wi]);
  }
  updAim();
  $("kd").textContent = EXT
    ? `${kills} K · ${deaths} D`
    : `${kills} K · ${deaths} D · first to ${MODE_DATA.ffa.scoreLimit}`;
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
    $("poundArc").setAttribute("stroke-dashoffset", String(239 * (1 - Math.min(1, me.poundT / 0.55))));
  } else pa.style.opacity = "0";
  const sp = 9 - 5 * adsP + bloom * 400 + recoil * 200;
  xhEls[0].style.transform = `translateY(${-sp / 3}px)`;
  xhEls[1].style.transform = `translateY(${sp / 3}px)`;
  xhEls[2].style.transform = `translateX(${-sp / 3}px)`;
  xhEls[3].style.transform = `translateX(${sp / 3}px)`;
  $("xh").style.opacity = String(1 - adsP);
  if (!$("scores").hidden) renderScores();
}
