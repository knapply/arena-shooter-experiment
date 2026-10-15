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
  powerRotation,
  falloffAt,
  pulseBody,
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
  skyTint,
  blast,
  THREE,
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
  setPilotCollider,
  groundBelow,
  freeAt,
  rayWorld,
  rayTarget,
  SPAWNS,
  makePilot,
  ANIM,
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
