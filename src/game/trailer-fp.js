/* ============ TRAILER FIRST PERSON (trailer build only, manifest trailer.engine) ============
   A few seconds of the trailer are played as the game is played: your own pilot, viewmodel, HUD,
   motion tracker, scope, pod cockpit and sounds, all from the real game loop. TFP.begin places you;
   TFP.step(dt, input) feeds one frame of scripted input (held and pressed actions, where you look)
   through frameBody with a fixed time step, while the trailer stays the full-screen mode the rest of
   the time (so the animation-frame loop keeps idling under it). The trailer supplies what you can
   shoot and what the tracker shows through its mode hooks (targets, radar, carrying). */
const TFP = {
  on: false,
  /** the player settings a scripted run needs (hold to aim, crouch and sprint), restored after */
  keep: null,
  /**
   * put the player in the world: o = { pos: [x, y, z], yaw, pitch, w (weapon index), w2 (the other
   * slot), mag (rounds left in the magazine), shield, pod: { at: [x, y, z], h, dur, onLand } (ride a
   * drop pod down from inside instead) }
   */
  begin(o) {
    if (!TFP.on) {
      TFP.keep = {
        aimMode: SET.aimMode,
        padAimMode: SET.padAimMode,
        crouchMode: SET.crouchMode,
        sprintMode: SET.sprintMode,
      };
      Object.assign(SET, { aimMode: "hold", padAimMode: "hold", crouchMode: "hold", sprintMode: "hold" });
    }
    TFP.on = true;
    playing = true;
    paused = false;
    virtHeld.clear();
    hitActs = new Set();
    me.reset();
    me.pos.set(o.pos[0], o.pos[1], o.pos[2]);
    me.yaw = o.yaw || 0;
    me.pitch = o.pitch || 0;
    me.spawnT = -99;
    me.dead = false;
    if (o.shield != null) me.shield = o.shield;
    prevPos.copy(me.pos);
    rpos.copy(me.pos);
    physAcc = 0;
    smY = me.pos.y;
    eyeCur = 1.62;
    landDip = fovK = fovX = thrK = camRoll = 0;
    recoil = bloom = flinch = 0;
    fireCD = flashT = 0;
    burstLeft = 0;
    refill();
    slots[0] = o.w2 != null ? o.w2 : 1;
    slots[1] = o.w != null ? o.w : 0;
    setSlot(1, true);
    switchT = 0;
    /* a magazine already partly spent (o.mag rounds left) */
    if (o.mag != null) mag = ammo[wi] = Math.min(o.mag, W().mag);
    zoomLvl = 0;
    aiming = false;
    zEase.from = zEase.to = zEase.at = 0;
    zEase.t = 1;
    $("hud").hidden = false;
    $("dead").hidden = true;
    if (o.pod) {
      /* riding your pod down: the loop's dead branch and the cockpit view take it from here */
      me.dead = true;
      const at = new V3(o.pod.at[0], o.pod.at[1], o.pod.at[2]);
      myPod = dropPod(at, myColor, {
        rider: true,
        h: o.pod.h,
        dur: o.pod.dur,
        onLand(p) {
          const pod = myPod;
          myPod = null;
          me.dead = false;
          me.shield = 70;
          me.health = 45;
          respawnMe(p);
          if (pod) podCockpitLand(pod);
          if (o.pod.onLand) o.pod.onLand(p);
        },
      });
    }
  },
  /**
   * one frame of play. inp = { hold: [actions], press: [actions], yaw, pitch } (actions are the
   * key binding names: forward, back, left, right, sprint, crouch, aim, fire, jump, thrust, melee,
   * grenade, reload...). The frame renders, HUD and all.
   */
  step(dt, inp = {}) {
    virtHeld.clear();
    for (const a of inp.hold || []) virtHeld.add(a);
    for (const a of inp.press || []) hitActs.add(a);
    if (inp.yaw != null) me.yaw = inp.yaw;
    if (inp.pitch != null) me.pitch = inp.pitch;
    const ext = EXT,
      full = ext.full;
    ext.full = null;
    try {
      frameBody(last + dt * 1000);
    } finally {
      ext.full = full;
    }
  },
  /** back to the trailer's own cameras: no HUD, no viewmodel, the player settings as they were */
  end() {
    if (!TFP.on) return;
    TFP.on = false;
    virtHeld.clear();
    if (myPod) myPod = null;
    playing = false;
    me.dead = false;
    $("hud").hidden = true;
    vmRoot.visible = false;
    flashT = 0;
    flashSprite.material.opacity = 0;
    if (PV.on) pvHide();
    PV.exit = -1;
    document.body.classList.remove("podding");
    podding = false;
    if (TFP.keep) Object.assign(SET, TFP.keep);
    TFP.keep = null;
  },
  /** the player's body */
  get me() {
    return me;
  },
  /* ---- capture: while the trailer records, the full-screen frame hooks (effects, atmosphere, supply
     pods) run on trailer time from TFP.hooks instead of on the page clock between captured frames,
     so a recording is the same every time ---- */
  held: /** @type {((dt: number) => void)[] | null} */ (null),
  capture(on) {
    if (on && !TFP.held) {
      TFP.held = FRAME_HOOKS.full.slice();
      FRAME_HOOKS.full.length = 0;
    } else if (!on && TFP.held) {
      FRAME_HOOKS.full.push(...TFP.held);
      TFP.held = null;
    }
  },
  /** run the held full-screen hooks for one trailer frame */
  hooks(dt) {
    if (TFP.held) runFrameHooks(TFP.held, dt);
  },
  /** a supply pod coming down on a spot (presentation only), landing in dur seconds */
  supply(p, dur) {
    return launchSupply({ id: "trailer:" + p.join(","), pos: new V3(p[0], p[1], p[2]) }, dur);
  },
  clearSupply,
  /** the sky's clock (stars, shooting stars, searchlights, clouds) */
  sky(t) {
    SKY_TIME.value = t;
    ATMO.t = t;
  },
  gatesAt,
};
Object.assign(KA_API, { trailerFP: TFP });
