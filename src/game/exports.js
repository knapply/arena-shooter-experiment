/* The engine API used by mode modules (CTF, trailer, tests). Its TypeScript type is inferred from this object. */
const KA_API = {
  get zoomLvl() {
    return zoomLvl;
  },
  get aiming() {
    return aiming;
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
  podsOn,
  PODS,
  clearPods,
  ITEMS,
  ARENA_PICKS,
  dropItems,
  nadeInv,
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
  CINE,
  MODE_DATA,
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
  fire,
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
