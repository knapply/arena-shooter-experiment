window.KA = {
  get zoomLvl() {
    return zoomLvl;
  },
  get aiming() {
    return aiming;
  },
  updPickups,
  giveWeapon,
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
    kills++;
    hitMarker("kill");
    onKill(type, head, victim);
  },
  setArmor(c) {
    vmArmor.color.set(c).multiplyScalar(0.55);
  },
  NadeWorld,
  NADES,
  MAIN_NADES,
  nadeDmg,
  losClear,
  solveThrow,
  setWeapon,
  get wi() {
    return wi;
  },
  sun,
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
  setMapGroup(g) {
    MAPG = g;
  },
  Body,
  R,
  H_STAND,
  H_CROUCH,
  GRAV,
  groundBelow,
  freeAt,
  rayWorld,
  rayTarget,
  rayBox,
  makePilot,
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
  get AC() {
    return AC;
  },
  vmRoot,
  showWorld,
  hideBots,
  bindLabel,
};
requestAnimationFrame(frame);
