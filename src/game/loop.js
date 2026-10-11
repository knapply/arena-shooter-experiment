/* ============ main loop ============ */
const pend = { j: false, c: false, t: false, m: false },
  prevPos = new V3(),
  rpos = new V3();
let physAcc = 0,
  eyeCur = 1.62,
  smY = 0,
  rosterShown = false;
let last = performance.now(),
  menuT = 0,
  landDip = 0,
  fovK = 0,
  prevReload = 0,
  stepAcc = 0,
  camRoll = 0,
  slideDustT = 0;
function meEvent(type, d) {
  if (type === "thrust") {
    sfx("thrust");
    sfx("whoosh", 0.55);
    thrustPuff(me.pos, d.dir);
    emitFx("thrust", v3a(me.pos), v3a(d.dir));
    fovK = 1;
    dust(me.pos, 5, 2, 0.3);
  } else if (type === "slam") {
    sfx("slam");
    rumble(1, 0.8, 320);
    damageRadius(d.pos, 5, 260, true);
    shock(d.pos);
    slamDamage(d.pos);
    emitFx("slam", v3a(d.pos), null);
    landDip = 0.35;
    shakeT = 0.45;
  } else if (type === "poundCharge") {
    sfx("charge", 0.6);
  } else if (type === "poundGo") {
    fovK = 1.4;
    sfx("whoosh");
  } else if (type === "charge") {
    sfx("charge");
    fovK = 1.2;
  } else if (type === "melee") {
    sfx("swing");
    meleeHit(2.3, 70, "melee");
  } else if (type === "slide") {
    sfx("slide");
    fovK = 0.6;
  } else if (type === "jump") {
    sfx("step", 0.5);
    if (d.slid) fovK = 0.5;
  } else if (type === "land") {
    if (d.vy > 4) {
      landDip = Math.min(0.28, d.vy * 0.014);
      sfx("land", clamp(d.vy / 14, 0.2, 1));
    }
    if (d.vy > 10) {
      dust(me.pos, 8, 2.5, 0.4);
      shakeT = Math.max(shakeT, 0.12);
    }
  } else if (type === "clamber") {
    landDip = 0.12;
    sfx("clamber");
  }
}
function chargeCheck() {
  if (me.chargeT > 0) {
    if (meleeHit(1.6, 85, "charge")) {
      me.chargeT = 0;
      sfx("slam", 0.5);
    }
  }
}
function myFeel(dt) {
  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (me.ground && me.slideT <= 0 && !me.clamber) {
    const stride = me.sprint ? 2.3 : me.crouch ? 1.1 : 1.7;
    const prev = stepAcc;
    stepAcc += (hs * dt) / stride;
    if (Math.floor(stepAcc) > Math.floor(prev) && hs > 1.2) {
      sfx("step", me.sprint ? 0.9 : me.crouch ? 0.3 : 0.55);
      if (me.sprint) dust(me.pos, 2, 0.6, 0.2, 0.25);
    }
  }
  if (me.slideT > 0) {
    slideDustT -= dt;
    if (slideDustT <= 0) {
      slideDustT = 0.04;
      dust(me.pos, 1, 1, 0.3, 0.3);
    }
  }
  const ev = me.regen(dt, now);
  if (ev === 1) {
    sfx("recharge", 0.9);
    rechargeShown = 0.9;
  }
  if (me.shield <= 0 && !me.dead && playing) {
    alarmT -= dt;
    if (alarmT <= 0) {
      alarmT = 0.55;
      sfx("alarm");
    }
  } else alarmT = 0;
}
let fpsAcc = 0,
  fpsN = 0,
  fpsVal = 60,
  fpsMax = 60,
  prGood = 0;
const fpsEl = $("fps");
function perf(raw) {
  fpsAcc += raw;
  fpsN++;
  if (fpsAcc < 0.5) return;
  fpsVal = fpsN / fpsAcc;
  fpsAcc = 0;
  fpsN = 0;
  fpsMax = Math.max(fpsMax * 0.995, fpsVal);
  const sc = gfxScale();
  if (fpsEl)
    fpsEl.textContent =
      Math.round(fpsVal) + " fps" + (Math.abs(sc - 1) > 0.01 ? " · " + Math.round(sc * 100) + "% res" : "");
  if (document.hidden) return;
  if (!SET.dynRes) {
    if (GFX.dyn !== 1) {
      GFX.dyn = 1;
      gfxResize();
    }
    return;
  }
  const tgt = Math.min(+SET.targetFps, fpsMax * 0.97);
  if (fpsVal < tgt * 0.9 && GFX.dyn > 0.5) {
    GFX.dyn = Math.max(0.5, GFX.dyn - 0.1);
    gfxResize();
    prGood = 0;
  } else if (fpsVal > tgt * 0.98 && GFX.dyn < 1) {
    if (++prGood >= 6) {
      GFX.dyn = Math.min(1, GFX.dyn + 0.1);
      gfxResize();
      prGood = 0;
    }
  } else prGood = 0;
}
function frame(t) {
  requestAnimationFrame(frame);
  const raw = Math.max(1e-4, (t - last) / 1000);
  let dt = Math.min(0.05, raw);
  last = t;
  now += dt;
  perf(raw);
  frameHits = hitActs;
  hitActs = new Set();
  destrTick();
  pollPad();
  padCapture();
  if (pad.on && $("settings").hidden) padActions();
  padCommon();
  if (playing && !paused && P("switchTeam") && EXT && EXT.switchTeam) EXT.switchTeam();
  if (playing || EXT) {
    const sr = A("roster");
    if (sr !== rosterShown) {
      rosterShown = sr;
      $("scores").hidden = !sr;
    }
    if (sr) renderScores();
  }
  if (pad.on && (!$("menu").hidden || !$("settings").hidden || paused || demo || (EXT && EXT.full)))
    padMenu(dt);
  if (demo) {
    demoFrame(dt);
    return;
  }
  if (EXT && EXT.full) {
    EXT.full(dt);
    return;
  }
  if (!playing) {
    menuT += dt * 0.08;
    camera.position.set(Math.sin(menuT) * 30, 14, Math.cos(menuT) * 30);
    camera.lookAt(0, 2, 0);
    vmRoot.visible = false;
    for (const b of bots) botStep(b, dt);
    updFX(dt);
    updRigs(dt);
    updPickups(dt);
    renderFrame();
    return;
  }
  vmRoot.visible = !me.dead && !(aiming && wi === 2);
  if (SET.aimMode === "toggle") {
    if (P("aim")) aimLatch = !aimLatch;
  } else aimLatch = false;
  if (SET.crouchMode === "toggle") {
    if (P("crouch")) crouchLatch = !crouchLatch;
  } else crouchLatch = false;
  if (SET.sprintMode === "toggle" && P("sprint")) sprintLatch = !sprintLatch;
  const aimHeld =
    (SET.aimMode === "toggle" ? aimLatch : A("aim")) ||
    touch.aim ||
    (SET.aimMode === "toggle" && virtHeld.has("aim"));
  if (descoped && (!aimHeld || P("aim"))) descoped = false;
  const canAim = !me.dead && reloadT <= 0 && !me.sprint && switchT <= 0;
  if (W().zoom.length > 1) {
    if (P("aim") && canAim) zoomLvl = (zoomLvl + 1) % (W().zoom.length + 1);
    if (!canAim) zoomLvl = 0;
  } else zoomLvl = aimHeld && canAim && !descoped ? 1 : 0;
  aiming = zoomLvl > 0;
  if (!aiming && (me.sprint || reloadT > 0)) aimLatch = false;
  if (!Number.isFinite(mdx) || !Number.isFinite(mdy)) {
    mdx = 0;
    mdy = 0;
  }
  if (!paused && !me.dead && (mdx || mdy)) {
    const k = 1 - SET.smoothing;
    const ax = mdx * k,
      ay = mdy * k;
    me.yaw -= ax;
    me.pitch = clamp(me.pitch - ay, -1.5, 1.5);
    mdx -= ax;
    mdy -= ay;
    if (Math.abs(mdx) < 1e-5) mdx = 0;
    if (Math.abs(mdy) < 1e-5) mdy = 0;
  }
  if (me.dead) {
    if (now > respawnAt) {
      if (EXT && EXT.respawn) EXT.respawn();
      else spawn(me);
      $("dead").hidden = true;
      reloadT = 0;
      refill();
    } else $("deadT").textContent = `Respawning in ${Math.ceil(respawnAt - now)}`;
  } else if (!paused) {
    if (pad.on) padGame(dt);
    const fw = clamp((A("forward") ? 1 : 0) - (A("back") ? 1 : 0) + touch.f - (pad.on ? GP.ax[1] : 0), -1, 1),
      sw = clamp((A("right") ? 1 : 0) - (A("left") ? 1 : 0) + touch.s + (pad.on ? GP.ax[0] : 0), -1, 1);
    if (fw < 0.3) {
      sprintLatch = false;
    }
    const sprint = SET.sprintMode === "auto" ? true : SET.sprintMode === "toggle" ? sprintLatch : A("sprint");
    if (P("jump")) crouchLatch = false;
    const inp = {
      f: fw,
      s: sw,
      sprint: sprint || touch.sprint || touch.sprintStick || GP.sprint,
      thrust: P("thrust"),
      crouch: A("crouch") || crouchLatch || touch.crouch,
      crouchP: P("crouch"),
      jumpP: P("jump"),
      aim: aimHeld,
      meleeP: P("melee"),
    };
    if (touch.sprint && inp.f < 0.3) touch.sprint = false;
    // fixed 120 Hz movement with interpolation: identical feel at any frame rate
    pend.j = pend.j || inp.jumpP;
    pend.c = pend.c || inp.crouchP;
    pend.t = pend.t || inp.thrust;
    pend.m = pend.m || inp.meleeP;
    physAcc += dt;
    let n = 0;
    const H = 1 / 120;
    while (physAcc >= H && n < 8) {
      prevPos.copy(me.pos);
      inp.jumpP = pend.j;
      inp.crouchP = pend.c;
      inp.thrust = pend.t;
      inp.meleeP = pend.m;
      pend.j = pend.c = pend.t = pend.m = false;
      me.step(H, inp, meEvent);
      chargeCheck();
      physAcc -= H;
      n++;
    }
    if (n >= 8) physAcc = 0;
    if (prevPos.distanceTo(me.pos) > 3) prevPos.copy(me.pos);
    myFeel(dt);
    fireCD -= dt;
    reloadT = Math.max(0, reloadT - dt);
    if (reloadT <= 0 && mag < W().mag && prevReload > 0) {
      const take = Math.min(W().mag - mag, reserve[wi]);
      mag += take;
      if (reserve[wi] !== Infinity) reserve[wi] -= take;
      ammo[wi] = mag;
    }
    prevReload = reloadT;
    switchT = Math.max(0, switchT - dt);
    nadeCD = Math.max(0, nadeCD - dt);
    if (P("grenade")) throwNade();
    if (P("swapNade")) swapNade();
    if (P("reload") && !pkNear) startReload();
    if (P("weapon1")) setSlot(0);
    if (P("weapon2")) setSlot(1);
    if (P("swapWeapon")) setSlot(1 - cur);
    const trig = A("fire") || touch.fire;
    if (!trig) semiLatch = false;
    if (
      trig &&
      (W().auto || !semiLatch) &&
      fireCD <= 0 &&
      switchT <= 0 &&
      !me.sprint &&
      me.chargeT <= 0 &&
      me.pound === 0 &&
      !me.clamber
    )
      fire();
  }
  bloom = Math.max(0, bloom - dt * 0.05);
  recoil = Math.max(0, recoil - dt * 0.12);
  flinch *= Math.exp(-9 * dt);
  if (EXT) {
    if (EXT.tick) EXT.tick(dt);
  } else for (const b of bots) botStep(b, dt);
  const hs = Math.hypot(me.vel.x, me.vel.z);
  const lr = me.vel.x * Math.cos(me.yaw) - me.vel.z * Math.sin(me.yaw);
  rpos.copy(prevPos).lerp(me.pos, physAcc * 120);
  if (me.dead || paused) rpos.copy(me.pos);
  eyeCur += ((me.h === H_STAND ? 1.62 : 1.02) - eyeCur) * Math.min(1, dt * 14);
  const eyeH = eyeCur;
  if (me.ground && rpos.y > smY && rpos.y - smY < 0.7) smY += (rpos.y - smY) * Math.min(1, dt * 16);
  else smY = rpos.y;
  landDip = Math.max(0, landDip - dt * 1.2);
  shakeT = Math.max(0, shakeT - dt);
  const bobY =
    me.ground && me.slideT <= 0
      ? Math.sin(stepAcc * Math.PI * 2) * (me.sprint ? 0.045 : 0.025) * clamp(hs / 6, 0, 1) * SET.bob
      : 0;
  const sh = reduceMotion ? 0 : (shakeT * 0.25 + (me.pound === 1 ? 0.015 : 0)) * SET.shake;
  camera.position.set(
    rpos.x + rnd(-sh, sh),
    smY + eyeH - landDip * SET.bob + bobY + rnd(-sh, sh),
    rpos.z + rnd(-sh, sh)
  );
  const rollT =
    (me.slideT > 0 ? 0.07 : 0) +
    clamp(-lr * 0.004, -0.04, 0.04) +
    (me.thrustT > 0 ? clamp(-lr * 0.006, -0.08, 0.08) : 0) +
    (me.sprint ? Math.sin(stepAcc * Math.PI) * 0.012 : 0);
  camRoll += (rollT - camRoll) * Math.min(1, dt * 8);
  camera.rotation.order = "YXZ";
  camera.rotation.y = me.yaw;
  camera.rotation.x = me.pitch + recoil + flinch;
  camera.rotation.z = camRoll + (me.stabbing ? Math.sin(now * 6) * 0.01 : 0);
  fovK = Math.max(0, fovK - dt * 3);
  const fb = SET.fov;
  const zf = aiming ? zoomK() : 1;
  const tf = fb / zf + (aiming ? 0 : (me.sprint ? 7 : 0) + (me.slideT > 0 ? 5 : 0) + fovK * 10);
  camera.fov += (tf - camera.fov) * Math.min(1, dt * (zf > 3 ? 30 : 12));
  if (!(camera.fov > 1 && camera.fov < 170)) camera.fov = fb;
  camera.updateProjectionMatrix();
  updVM(dt, {
    aim: aiming,
    sprint: me.sprint && me.ground,
    reload: reloadT > 0 ? 1 - reloadT / W().reload : -1,
    melee: me.meleeT > 0 ? 1 - me.meleeT / 0.4 : me.chargeT > 0 ? 0.5 : -1,
    clamber: !!me.clamber,
    low: me.pound === 1 || !!me.clamber,
    pound1: me.pound === 1,
    thrust: me.thrustT > 0,
    lr,
    strafe: clamp(lr / 6, -1, 1),
    stepPh: stepAcc,
    moving: hs > 1 && me.ground,
    landDip,
    vel: me.vel,
    yaw: me.yaw,
    ground: me.ground,
  });
  flashT = Math.max(0, flashT - dt);
  flash.intensity = flashT > 0 ? 2.2 : 0;
  flashSprite.material.opacity = flashT > 0 ? 0.95 : 0;
  flashSprite.material.rotation = Math.random() * 6;
  updFX(dt);
  MAIN_NADES.step(dt);
  if (!EXT) updRigs(dt);
  updPickups(dt);
  updPoundRing();
  hitmT -= dt;
  $("hitm").style.opacity = String(hitmT > 0 ? 1 : 0);
  vigT = Math.max(0, vigT - dt);
  $("vig").style.opacity = String(Math.max(vigT * 1.8, me.shield <= 0 && !me.dead ? 0.4 : 0));
  sflashT = Math.max(0, sflashT - dt * 2.2);
  shbHit = Math.max(0, shbHit - dt);
  rechargeShown = Math.max(0, rechargeShown - dt);
  $("sflash").style.opacity = String(Math.max(sflashT, rechargeShown * 0.25));
  const sl = me.thrustT > 0 ? 0.8 : me.pound === 2 ? 0.9 : clamp((hs - 10) / 6, 0, 0.7);
  $("speed").style.opacity = String(reduceMotion || !SET.speedLines ? 0 : sl);
  toastT -= dt;
  if (toastT <= 0) $("toast").style.opacity = "0";
  sendPresence(false);
  hud();
  renderFrame();
}
function updRigs(dt) {
  const tnow = performance.now() / 1000;
  for (const r of remotes.values()) {
    if (!r.rig || !r.has) continue;
    const age = Math.min(0.15, tnow - r.rx);
    const est = r.tgt.clone().addScaledVector(r.vel, age);
    const root = r.rig.root;
    if (root.position.distanceTo(est) > 6) root.position.copy(est);
    else root.position.lerp(est, 1 - Math.exp(-18 * dt));
    let dy = r.yaw - root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    root.rotation.y += dy * Math.min(1, dt * 15);
    const s = r.st;
    const st = {
      vx: r.vel.x,
      vz: r.vel.z,
      vy: r.vel.y,
      yaw: root.rotation.y,
      ground: !(s & 512),
      sprint: !!(s & 2),
      slide: !!(s & 4),
      crouch: !!(s & 1) && !(s & 4),
      thrust: !!(s & 8),
      stab: !!(s & 16),
      pound: s & 2048 ? 2 : s & 32 ? 1 : 0,
      clamber: !!(s & 256),
      charge: !!(s & 1024),
      melee: s & 128 ? clamp((now - r.mlStart) / 0.4, 0, 1) : -1,
      reload: s & 64 ? clamp((now - r.rlStart) / RELOAD_TIME, 0, 1) : -1,
      pitch: r.pitch,
      shield: r.sh,
      fire: !!(s & 4096),
      wpn: s & 32768 ? 2 : s & 8192 ? 1 : 0,
    };
    rigEvents(r.rig, r.rig.update(dt, st));
  }
  for (const b of bots) {
    const rg = b.rig;
    rg.root.position.copy(b.body.pos);
    rg.root.rotation.y = b.body.yaw;
    rigEvents(
      rg,
      rg.update(
        dt,
        bodyState(b.body, {
          reload: b.reloadT > 0 ? 1 - b.reloadT / RELOAD_TIME : -1,
          fire: now - b.firedT < 0.1,
        })
      )
    );
  }
}
function rigEvents(rig, ev) {
  if (!ev) return;
  const p = rig.root.position;
  if (ev.pop) {
    shieldPop(rig.chestWorld(new V3()));
    sfx("pop", distVol(p, 35));
  }
  if (ev.drop) dropMag(ev.drop, ev.dropQ);
  if (ev.magIn) sfx("magin", distVol(p, 18) * 0.6);
  if (ev.step) {
    const v = distVol(p, 22);
    if (v > 0) sfx("step", v * (ev.sprint ? 0.6 : 0.35));
    if (ev.sprint) dust(p, 1, 0.5, 0.2, 0.22);
  }
}
