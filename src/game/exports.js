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
  detailMat,
  SET,
  applySettings,
  gfxScale,
  cleanName,
  num,
  vec,
  allowDamage,
  DMG_CAP,
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
  podsOn,
  PODS,
  SUPPLY,
  clearPods,
  ITEMS,
  ARENA_PICKS,
  dropItems,
  nadeInv,
  /* match stats and the post-match screen (game/stats.js, ui/stats-ui.js) */
  STATS,
  showPost,
  closePost,
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
  ring,
  fxGet,
  fxPush,
  THREE,
  $,
  clamp,
  rnd,
  scene,
  camera,
  renderer,
  SOLID,
  MATS,
  box,
  strip,
  stairs,
  ARENA_G,
  MAPS,
  buildMap,
  validateMap,
  mapPieces,
  mergeMapGroup,
  setMapGroup(g) {
    MAPG = g;
  },
  Body,
  R,
  H_STAND,
  H_CROUCH,
  get GRAV() {
    return TUNE.grav;
  },
  TUNE,
  TUNE_DEF,
  setPilotCollider,
  groundBelow,
  freeAt,
  rayWorld,
  rayTarget,
  rayBox,
  SPAWNS,
  makePilot,
  EVENTS,
  PINGS,
  addPing,
  pingNow,
  pingTarget,
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
  spawnScore,
  pickSpawn,
  spawnPoint,
  noteFight,
  defineMode,
  startMode,
  modeList,
  ffaStandings,
  SHOT,
  Playback,
  WEAPON_DATA,
  killStats,
  CON,
  REC,
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
  mePilot,
  bodyState,
  rigEvents,
  tracer,
  spark,
  thrustPuff,
  MFX,
  meleeFx,
  meleeImpact,
  meleeSound,
  meleeWorldHit,
  meleeContact,
  chargeWallFx,
  dust,
  shock,
  shieldPop,
  dropMag,
  updFX,
  sfx,
  sfxTap,
  renderSfx,
  audio,
  distVol,
  sfxAt,
  footSurf,
  enclosure,
  audioSpace: space,
  say,
  VO,
  medal,
  hitMarker,
  pushFeed,
  renderFeed,
  toast,
  hurtMe,
  me,
  RELOAD_TIME,
  extPlay,
  extFull,
  extStop,
  isTouch,
  reduceMotion,
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
  bindLabel,
  netStats,
  pingOf,
  pingBars,
};
window.KA = /** @type {KAApi} */ (KA_API);
requestAnimationFrame(frame);
