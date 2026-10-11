/* ============ HUD ============ */
function renderScores() {
  if (EXT && EXT.scores) {
    EXT.scores($("sbody"));
    return;
  }
  /** @type {{ n: string, c: string, k: number, d: number, me?: boolean }[]} */
  const rows = [{ n: myName + " (you)", c: myColor, k: kills, d: deaths, me: true }];
  for (const r of remotes.values()) if (r.has) rows.push({ n: r.name, c: r.color, k: r.k, d: r.d });
  for (const b of bots) rows.push({ n: b.name + " · drone", c: "#8b9aa3", k: b.k, d: b.d });
  rows.sort((a, b) => b.k - a.k || a.d - b.d);
  const tb = $("sbody");
  tb.textContent = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.me) tr.className = "me";
    const a = document.createElement("td");
    const sw = document.createElement("span");
    sw.className = "sw2";
    sw.style.background = r.c;
    a.append(sw, document.createTextNode(r.n));
    const k = document.createElement("td");
    k.textContent = String(r.k);
    const d = document.createElement("td");
    d.textContent = String(r.d);
    tr.append(a, k, d);
    tb.appendChild(tr);
  }
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
  $("kd").textContent = `${kills} K · ${deaths} D`;
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
  const sp = (aiming ? 4 : 9) + bloom * 400 + recoil * 200;
  xhEls[0].style.transform = `translateY(${-sp / 3}px)`;
  xhEls[1].style.transform = `translateY(${sp / 3}px)`;
  xhEls[2].style.transform = `translateX(${-sp / 3}px)`;
  xhEls[3].style.transform = `translateX(${sp / 3}px)`;
  $("xh").style.opacity = String(aiming ? 0 : 1);
  if (!$("scores").hidden) renderScores();
}
