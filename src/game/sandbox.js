/* ============ SANDBOX: the tuning settings applied to movement, weapons and grenades ============
   Every number in the Sandbox settings tab lands here: movement in TUNE (physics), weapons in
   WEAPON_DATA / WEAPONS, grenades in NADES / NADE_TUNE. Online, the host's sandbox is the match's:
   hosts share theirs (sandboxRules) and everyone else plays by it (setSandboxOverride) until they
   leave, without touching their own saved settings. */
let SB_OVERRIDE = null;
function sandboxValues() {
  const o = {};
  for (const [k] of SANDBOX_DEFS) o[k] = SB_OVERRIDE && k in SB_OVERRIDE ? SB_OVERRIDE[k] : SET[k];
  return o;
}
/** this player's sandbox, to send when hosting */
function sandboxRules() {
  const o = {};
  for (const [k] of SANDBOX_DEFS) o[k] = SET[k];
  return o;
}
/** play by the host's sandbox (validated against each setting's range), or null for your own */
function setSandboxOverride(o) {
  if (!o || typeof o !== "object") SB_OVERRIDE = null;
  else {
    SB_OVERRIDE = {};
    for (const [k, , , min, max] of SANDBOX_DEFS) {
      const v = +o[k];
      if (Number.isFinite(v)) SB_OVERRIDE[k] = Math.max(min, Math.min(max, v));
    }
  }
  applySandbox();
}
function applySandbox() {
  const v = sandboxValues();
  Object.assign(TUNE, {
    run: v.sbRun,
    sprint: v.sbSprint,
    accel: v.sbAccel,
    reverse: v.sbReverse,
    airAccel: v.sbAir,
    jump: v.sbJump,
    grav: v.sbGrav,
    thrust: v.sbThrust,
    thrustCD: v.sbThrustCD,
    slideBoost: v.sbSlide,
  });
  const set = (key, fields) => {
    for (const list of [WEAPON_DATA, WEAPONS]) {
      const w = list.find(x => x.key === key);
      if (w) Object.assign(w, fields);
    }
  };
  /* headshots keep the same ratio to body damage */
  set("carbine", {
    body: v.sbCarbDmg,
    head: Math.round(v.sbCarbDmg * (11 / 9)),
    rate: v.sbCarbRate,
    spread: v.sbCarbSpread,
    adsSpread: v.sbCarbSpread / 3,
    bloom: v.sbCarbBloom,
  });
  set("pistol", { body: v.sbMagDmg, head: Math.round(v.sbMagDmg * 2.5), rate: v.sbMagRate });
  set("sniper", { rate: v.sbSnipeRate });
  set("rocket", { speed: v.sbRocketSpeed, radius: v.sbRocketRadius });
  NADE_TUNE.throw = v.sbNadeThrow;
  NADE_TUNE.bounce = v.sbNadeBounce;
  NADES.frag.fuse = v.sbNadeFuse;
  NADES.frag.r = v.sbNadeRadius;
}
SET_HOOKS.push(applySandbox);
applySandbox();
