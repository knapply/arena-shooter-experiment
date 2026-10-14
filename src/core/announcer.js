/* ============ announcer ============ */
const VO = { voice: null, on: true };
const hasTTS =
  typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return null;
    const pref = [
      /Daniel/i,
      /Google UK English Male/i,
      /Arthur/i,
      /Alex/i,
      /Fred/i,
      /Male/i,
      /en-GB/i,
      /en-US/i,
      /^en/i,
    ];
    for (const r of pref) {
      const v = vs.find(v => r.test(v.name) || r.test(v.lang));
      if (v) return v;
    }
    return vs[0];
  } catch (e) {
    return null;
  }
}
if (hasTTS) {
  try {
    speechSynthesis.onvoiceschanged = () => {
      VO.voice = pickVoice();
    };
    VO.voice = pickVoice();
  } catch (e) {}
}
let lastSay = -9;
function say(text, urgent) {
  if (!VO.on || !hasTTS) return;
  try {
    if (urgent || now - lastSay > 3) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!VO.voice) VO.voice = pickVoice();
    if (VO.voice) u.voice = VO.voice;
    u.rate = SET.voRate;
    u.pitch = 0.42;
    u.volume = SET.voVol;
    speechSynthesis.speak(u);
    lastSay = now;
  } catch (e) {}
}
const MEDAL = {
  double: ["X2", "Double kill", "#ffb347"],
  triple: ["X3", "Triple kill", "#ffb347"],
  quad: ["X4", "Quad kill", "#ffb347"],
  mass: ["X5", "Massacre", "#ff5f57"],
  spree: ["5", "Killing spree", "#ff5f57"],
  rampage: ["10", "Rampage", "#ff5f57"],
  unstop: ["15", "Unstoppable", "#ff5f57"],
  untouch: ["20", "Untouchable", "#ff5f57"],
  head: ["H", "Headshot", "#62cdff"],
  stick: ["S", "Stuck", "#5ad2ff"],
  frag: ["G", "Grenade kill", "#ffa040"],
  pound: ["P", "Ground pound", "#dbe6ea"],
  charge: ["C", "Shoulder charge", "#dbe6ea"],
  melee: ["M", "Melee kill", "#dbe6ea"],
  first: ["1", "First blood", "#ff5f57"],
  revenge: ["R", "Revenge", "#c9a7ff"],
  kill: ["K", "Kill", "#7f939c"],
  airborne: ["A", "Airborne", "#62cdff"],
  perfect: ["✦", "Perfect", "#ffd36b"],
  /* mode medals: the objective and the drop pods */
  podkill: ["▼", "Pod kill", "#ffa040"],
  carrier: ["K", "Carrier kill", "#7dde6a"],
  denial: ["D", "Flag denial", "#7dde6a"],
  flagkill: ["⚑", "Flag swing", "#ffd36b"],
  skullkill: ["☠", "Skull kill", "#f2e6c9"],
  capture: ["⚑", "Flag capture", "#ffb347"],
  clutch: ["!", "Clutch return", "#62cdff"],
  lasthold: ["☠", "Last-second hold", "#ffb347"],
};
function medal(key) {
  const m = MEDAL[key];
  if (!m) return;
  EVENTS.emit("medal", { pilot: "local", medal: key });
  const el = document.createElement("div");
  el.className = "medal";
  const i = document.createElement("i");
  i.style.background = m[2];
  i.textContent = m[0];
  const s = document.createElement("span");
  s.textContent = m[1];
  el.append(i, s);
  const bx = $("medals");
  bx.appendChild(el);
  while (bx.children.length > 4) bx.firstChild.remove();
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3100);
}
let streak = 0,
  multi = 0,
  lastKillT = -99,
  firstBlood = false,
  lastKiller = null;
/** e: the kill event (what the victim carried, whether it denied a capture) */
function onKill(type, head, victim, perfect, e) {
  streak++;
  multi = now - lastKillT < 4.5 ? multi + 1 : 1;
  lastKillT = now;
  const ks = [];
  if (!firstBlood) {
    firstBlood = true;
    ks.push("first");
  }
  if (multi >= 2) ks.push(multi === 2 ? "double" : multi === 3 ? "triple" : multi === 4 ? "quad" : "mass");
  if (streak % 5 === 0 && streak <= 20) EVENTS.emit("spree", { pilot: "local", count: streak });
  if (streak === 5) ks.push("spree");
  else if (streak === 10) ks.push("rampage");
  else if (streak === 15) ks.push("unstop");
  else if (streak === 20) ks.push("untouch");
  if (type === "stick") ks.push("stick");
  else if (type === "frag") ks.push("frag");
  else if (type === "pound") ks.push("pound");
  else if (type === "charge") ks.push("charge");
  else if (type === "melee") ks.push("melee");
  else if (type === "pod") ks.push("podkill");
  else if (type === "flag") ks.push("flagkill");
  else if (type === "skull") ks.push("skullkill");
  else if (head) ks.push("head");
  /* stopping a carrier: a denial when they were nearly home with our flag */
  if (e && e.denial) ks.push("denial");
  else if (e && e.carried) ks.push("carrier");
  if (perfect) ks.push("perfect");
  if (!me.ground && type === "rifle") ks.push("airborne");
  if (lastKiller && victim === lastKiller) {
    ks.push("revenge");
    lastKiller = null;
  }
  if (!ks.length) ks.push("kill");
  ks.forEach((k, i) => setTimeout(() => medal(k), i * 160));
  const prio = [
    "denial",
    "skullkill",
    "flagkill",
    "podkill",
    "mass",
    "quad",
    "triple",
    "double",
    "untouch",
    "unstop",
    "rampage",
    "spree",
    "perfect",
    "first",
    "revenge",
    "stick",
    "pound",
    "charge",
    "frag",
    "head",
    "melee",
    "airborne",
    "carrier",
  ];
  const top = prio.find(p => ks.includes(p));
  if (top) {
    sfx("stinger", 0.8);
    setTimeout(() => say(MEDAL[top][1], true), 120);
  }
}
/* medals and sprees follow your kills, whichever mode or network path credited them */
EVENTS.on("kill", e => {
  if (e.killer === "local" && e.victim !== "local")
    onKill(e.weapon, e.head, e.victimName, perfectKill(e.victim), e);
});
/* objective medals: your capture, a return that saved a capture, holding the skull to the very end */
function objMedal(key) {
  medal(key);
  sfx("stinger", 0.7);
  setTimeout(() => say(MEDAL[key][1], true), 120);
}
EVENTS.on("capture", e => e.pilot === "local" && objMedal("capture"));
EVENTS.on("flagReturn", e => e.pilot === "local" && e.clutch && objMedal("clutch"));
EVENTS.on("matchEnd", e => e.lastHold && e.holder === "local" && objMedal("lasthold"));
