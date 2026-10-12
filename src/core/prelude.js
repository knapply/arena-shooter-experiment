/** @type {(id: string) => El} */
const $ = id => /** @type {El} */ (document.getElementById(id));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = v => Math.round(v * 100) / 100;
const isTouch = matchMedia("(pointer:coarse)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion:reduce)").matches;
const V3 = THREE.Vector3;
const COLORS = ["#ffb347", "#62cdff", "#ff6f91", "#8be38b", "#c9a7ff", "#f2f2f2"];
let myColor = COLORS[0];
/** your armor color right now (your color in the arena, your team's in team modes) */
let myArmor = myColor;
{
  const s = STORE.load("pilot");
  if (s) {
    if (s.n) $("callsign").value = s.n;
    if (COLORS.includes(s.c)) myColor = s.c;
    if (s.vo === false) $("vo").checked = false;
    if (s.sk) $("botSkill").value = s.sk;
  }
}

COLORS.forEach(c => {
  const b = document.createElement("button");
  b.className = "sw";
  b.style.background = c;
  b.setAttribute("aria-label", "Armor color " + c);
  b.setAttribute("aria-pressed", String(c === myColor));
  b.onclick = () => {
    myColor = c;
    [...$("swatches").children].forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  };
  $("swatches").appendChild(b);
});
if (isTouch) {
  $("keysDesk").hidden = true;
  $("keysTouch").hidden = false;
}
