/* ============ deploy ============ */
/* the free-for-all map: the arena is the engine's home world; any other is built and swapped in the
   way the team modes do it (CTF.useMap / enterMap), with its spawns and power weapons. Online,
   everyone plays the room hub's pick (arena-net sends it) */
let ffaKey = "arena";
function useFfaMap(key) {
  key = ffaMap(key);
  if (key === ffaKey) return;
  ffaKey = key;
  const C = window.CTF,
    doc = MAPS[key];
  if (key === "arena") C.exitMap();
  else {
    C.useMap(key);
    if (C.NAV.mapId !== doc.id) C.NAV.build(C.buildMap().solids);
    C.enterMap();
  }
  SPAWNS.splice(0, SPAWNS.length, ...doc.spawns.ffa);
  ARENA_PICKS.splice(0, ARENA_PICKS.length, ...(doc.pickups || []).map(d => powerSpawn(d, () => now)));
  for (const b of bots) b.path = b.wp = null;
}
/** the cells from a to b on the current map's nav grid (off the arena only), as points to walk */
function droneRoute(a, b) {
  const N = ffaKey !== "arena" && window.CTF.NAV;
  const p = N && N.path(N.nearest(a.x, a.z, a.y), N.nearest(b.x, b.z, b.y), null, 6000);
  return p ? p.map(c => N.pos(c)) : null;
}
function savePrefs() {
  STORE.save("pilot", { n: myName, c: myColor, vo: VO.on, sk: $("botSkill").value });
}
/* one bot skill for the drones and CTF bots; the choice is remembered */
$("botSkill").addEventListener("change", () =>
  STORE.save("pilot", Object.assign({}, STORE.load("pilot"), { sk: $("botSkill").value }))
);
$("ffaMap").value = ffaMap((STORE.load("mapPick") || {}).f);
$("ffaMap").addEventListener("change", () =>
  STORE.save("mapPick", Object.assign({}, STORE.load("mapPick"), { f: ffaMap($("ffaMap").value) }))
);
$("deploy").onclick = () => {
  myName = ($("callsign").value || "Pilot").trim().slice(0, 14) || "Pilot";
  VO.on = $("vo").checked;
  savePrefs();
  botsOn = $("bots").checked;
  botSkill = $("botSkill").value;
  /* online, the hub's map; otherwise the menu's */
  useFfaMap(room && hubMap ? hubMap : $("ffaMap").value);
  makeBots();
  EVENTS.setContext({ map: ffaKey, mode: "ffa" });
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
      MAPS[ffaKey],
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
  /* the menu shows the arena */
  useFfaMap("arena");
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
