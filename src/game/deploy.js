/* ============ deploy ============ */
function savePrefs() {
  STORE.save("pilot", { n: myName, c: myColor, vo: VO.on, sk: $("botSkill").value });
}
/* one bot skill for the drones and CTF bots; the choice is remembered */
$("botSkill").addEventListener("change", () =>
  STORE.save("pilot", Object.assign({}, STORE.load("pilot"), { sk: $("botSkill").value }))
);
$("deploy").onclick = () => {
  myName = ($("callsign").value || "Pilot").trim().slice(0, 14) || "Pilot";
  VO.on = $("vo").checked;
  savePrefs();
  botsOn = $("bots").checked;
  botSkill = $("botSkill").value;
  makeBots();
  EVENTS.setContext({ map: "arena", mode: "ffa" });
  ffaStart();
  EVENTS.emit("matchStart", {});
  audio();
  myArmor = myColor;
  vmArmor.color.set(myColor).multiplyScalar(0.55);
  if (document.activeElement) /** @type {HTMLElement} */ (document.activeElement).blur();
  spawn(me);
  /* everyone drops in (game/loop.js matchDrop), or starts on the ground; the clock starts as the
     pods land, after the intro if there is one */
  const fall = matchDrop(true);
  if (!fall) EVENTS.emit("spawn", { pilot: "local" });
  FFA.t0 = now + fall;
  if (SET.intros)
    playIntro(
      MAPS.arena,
      { mode: MODE_DATA.ffa.name, limit: `First to ${MODE_DATA.ffa.scoreLimit}` },
      () => (FFA.t0 = now + fall)
    );
  playing = true;
  reloadT = 0;
  refill();
  streak = 0;
  multi = 0;
  $("menu").hidden = true;
  $("hud").hidden = false;
  if (isTouch) $("touch").hidden = false;
  else if (!padRecent()) lock();
  sfx("stinger");
  say("Arena online", true);
  sendPresence(true);
};
function leaveGame() {
  closePost();
  MAIN_NADES.clear();
  MAIN_ROCKETS.clear();
  clearPods();
  if (EXT) {
    const e = EXT;
    EXT = null;
    if (e.exit) e.exit();
    showWorld();
  }
  playing = false;
  paused = false;
  $("pause").hidden = true;
  $("hud").hidden = true;
  $("touch").hidden = true;
  $("dead").hidden = true;
  $("menu").hidden = false;
  try {
    document.exitPointerLock();
  } catch (e) {}
  if (room) room.presence({ p: null }).catch(() => {});
}
$("callsign").addEventListener("keydown", e => {
  if (e.key === "Enter") $("deploy").click();
});
