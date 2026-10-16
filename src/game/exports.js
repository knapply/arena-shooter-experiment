/* The engine API used by mode modules (CTF, trailer, tests). Its TypeScript type is inferred from this object. */
const KA_API = {
  get zoomLvl() {
    return zoomLvl;
  },
  get aiming() {
    return aiming;
  },
  /** how far the scope has eased in (0 at the hip, 1 scoped) */
  get adsP() {
    return adsP;
  },
  updPickups,
  giveWeapon,
  hitMarker,
  /** the kill feed's icon for a damage type (ui/feed-icons.js) */
  feedIconMask,
  /** the post pipeline's state (render/pipeline.js): the shield break's colour split is GFX.split */
  GFX,
  /** the controller's state (core/gamepad.js) */
  GP,
  refill,
  DESTR,
  damageBox,
  damageRadius,
  rayWorldHit,
  resetDestruction,
  applyBreaks,
  syncBroken,
  renderFrame,
  SET,
  applySettings,
  cleanName,
  num,
  vec,
  allowDamage,
  get room() {
    return room;
  },
  get myPeer() {
    return myPeer;
  },
  addKill(type, head, victim) {
    /* medals come from the mode's kill event; this only credits the score and marker */
    kills++;
    hitMarker("kill");
  },
  setArmor(c) {
    vmArmor.color.set(c).multiplyScalar(0.55);
  },
  NadeWorld,
  RocketWorld,
  MAIN_ROCKETS,
  rocketDmg,
  remoteProjectile,
  dropPod,
  matchDrop,
  podSeat,
  podSpots,
  PODS,
  SUPPLY,
  launchSupply,
  clearPods,
  ITEMS,
  ARENA_PICKS,
  dropItems,
  nadeInv,
  /* match stats and the post-match screen (game/stats.js, ui/stats-ui.js) */
  showPost,
  get POST() {
    return POST;
  },
  /** in an online room right now */
  get inRoom() {
    return !!room;
  },
  /** power weapon marks on screen right now (ui/power.js) */
  get powerMarks() {
    return PW_MARKS.filter(m => m.visible).length;
  },
  /** the pause menu is up */
  /** held sounds playing (a hover's thrusters, core/audio.js), for tests */
  get holdSounds() {
    return HOLD.size;
  },
  get paused() {
    return paused;
  },
  get myPod() {
    return myPod;
  },
  /** where the menu backdrop camera is in its orbit (tests pin it for a repeatable shot) */
  get menuT() {
    return menuT;
  },
  set menuT(v) {
    menuT = v;
  },
  POWER_ROTATION,
  LABS,
  labOn,
  falloffAt,
  mapDoc,
  MAP_MODS,
  PLAY_MODES,
  mapZone,
  zoneLabel,
  setPlayMap,
  zoneAt,
  GATES,
  GATE_CYCLE,
  gatesAt,
  gateLift,
  mapGates,
  NADES,
  NADE_TUNE,
  MAIN_NADES,
  nadeDmg,
  losClear,
  solveThrow,
  setWeapon,
  get wi() {
    return wi;
  },
  sun,
  hemi,
  LIGHT_K,
  skyTint,
  blast,
  /* three, with the game's own vector (core/vec3.js) as its Vector3: the modes simulate with it too. A
     lookup, not Object.create: the page's THREE is an ES module namespace, and writing through one as a
     prototype throws in current browsers (the menu then never starts a match) */
  THREE: /** @type {typeof THREE & { Vector3: typeof Vec3 }} */ (
    new Proxy({}, { get: (_, k) => (k === "Vector3" ? Vec3 : THREE[k]) })
  ),
  $,
  clamp,
  rnd,
  scene,
  camera,
  renderer,
  SOLID,
  box,
  stairs,
  ARENA_G,
  MAPS,
  buildMap,
  mapPieces,
  Body,
  R,
  H_STAND,
  H_CROUCH,
  TUNE,
  TUNE_DEF,
  SANDBOX_PRESETS,
  setPilotCollider,
  groundBelow,
  freeAt,
  rayWorld,
  rayTarget,
  SPAWNS,
  makePilot,
  /** triangles in weapon i as other pilots hold it (far: its distance level) */
  weaponTris: (i, far) =>
    weaponGeos(i, !!far).reduce(
      (n, [, g]) => n + (g.index ? g.index.count : g.attributes.position.count) / 3,
      0
    ),
  ANIM,
  rigThrowAt,
  EVENTS,
  PINGS,
  addPing,
  pingNow,
  pingTarget,
  dangerTarget,
  /* ammo and grenades (weapons/arsenal.js, grenades.js): magazine and reserve of the gun in hand */
  get mag() {
    return mag;
  },
  set mag(v) {
    mag = v;
  },
  ammo,
  reserve,
  startReload,
  autoTake,
  get nadeSel() {
    return nadeSel;
  },
  set nadeSel(v) {
    nadeSel = v;
  },
  throwNade,
  swapNade,
  /** the input device the HUD's hints are for: "pad", "touch" or "keys" */
  /** your key and controller bindings (core/settings.js) */
  get BIND() {
    return BIND;
  },
  trackerShown,
  INTRO,
  playIntro,
  HL,
  playOfTheGame,
  REPLAY,
  KILLCAM,
  CINE,
  MODE_DATA,
  AI_SKILL,
  SWITCH_TIME,
  POD_TIME,
  POD_EARLY,
  meleeDamage,
  MELEE,
  meleeBehind,
  SPAWN_W,
  pickSpawn,
  spawnPoint,
  noteFight,
  defineMode,
  startMode,
  modeList,
  modeRules,
  botLevel,
  botLevelName,
  botAdapt,
  botAdaptNote,
  MENU,
  SHOT,
  Playback,
  WEAPON_DATA,
  killStats,
  CON,
  REC,
  /* hit checks and lag compensation (net/hitcheck.js) */
  HITCHK,
  MoveHist,
  netProf,
  timed,
  /** automated input (the network lab's players, tools/net-lab.js): hold an action, or press it once */
  input: {
    hold(a, on) {
      if (on) virtHeld.add(a);
      else virtHeld.delete(a);
    },
    press(a) {
      hitActs.add(a);
    },
  },
  pidOf,
  RNG,
  rand,
  STORE,
  MSG,
  dealDamage,
  meleeHit,
  fire,
  /** the free-for-all match state (clock start t0, over) */
  FFA,
  get bots() {
    return bots;
  },
  Pilot,
  PILOTS,
  addPilot,
  pilotById,
  posePilot,
  tracer,
  spark,
  thrustPuff,
  MFX,
  meleeFx,
  meleeImpact,
  meleeWorldHit,
  meleeContact,
  chargeWallFx,
  dust,
  shock,
  shieldPop,
  updFX,
  sfx,
  sfxTap,

  audio,
  distVol,
  sfxAt,
  footSurf,
  enclosure,
  audioSpace: space,
  say,
  medal,
  toast,
  hurtMe,
  me,
  RELOAD_TIME,
  extPlay,
  extFull,
  extStop,
  get now() {
    return now;
  },
  get playing() {
    return playing;
  },
  get myName() {
    return myName;
  },
  get kills() {
    return kills;
  },
  get deaths() {
    return deaths;
  },
  /** the armor colours on offer (presence colours are checked against them) */
  COLORS,
  get myColor() {
    return myColor;
  },
  get reloadT() {
    return reloadT;
  },
  get lastFireT() {
    return lastFireT;
  },
  get EXT() {
    return EXT;
  },
  /** arena players seen over the network, keyed by peer id (read-only use) */
  get remotes() {
    return remotes;
  },
  get AC() {
    return AC;
  },
  vmRoot,
  showWorld,
  hideBots,
  netStats,
  pingOf,
  pingBars,
};
window.KA = /** @type {KAApi} */ (KA_API);
requestAnimationFrame(frame);
