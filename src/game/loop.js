/* ============ main loop ============
   frame() runs once per display refresh (requestAnimationFrame) and calls frameBody(), which in order:
   advances time; handles menus and the gamepad; hands the frame to a full-screen mode or the menu camera
   if one owns it; respawns you (pods: respawnStart / steerPod) or steps your Body at a fixed 120 Hz from
   input; fires, reloads, throws; runs the drones and the mode (EXT.tick); places the camera; animates the
   viewmodel, effects and rigs; runs the per-frame hooks (onFrame); updates the HUD and network presence;
   then renders. See docs/EXECUTION.md for the whole picture. */
const pend = { j: false, c: false, t: false, m: false },
  prevPos = new V3(),
  rpos = new V3();
let physAcc = 0,
  clWas = false,
  /* a thrust's lurch: how much is left (1..0) and which way it rolls the view */
  thrK = 0,
  thrS = 0,
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
  slideDustT = 0,
  jetOn = false,
  jetPuff = 0,
  fovX = 0;
/* scoping eases in over ADS_IN seconds and out over ADS_OUT (in log zoom, so 5x to 10x takes as long as
   1x to 2x): quick enough to keep up with a duel, slow enough to read as the gun coming up to the eye */
const ADS_IN = 0.15,
  ADS_OUT = 0.1,
  zEase = { from: 0, to: 0, at: 0, t: 1, w: -1 };
function easeZoom(dt) {
  const to = aiming ? Math.log(zoomK()) : 0,
    z = zEase;
  if (wi !== z.w) {
    z.w = wi;
    z.at = z.to = z.from = 0;
  }
  if (to !== z.to) {
    sfx(to > z.to ? (z.to ? "zstep" : "zin") : "zout", to > z.to ? 0.6 : 0.4);
    z.from = z.at;
    z.to = to;
    z.t = 0;
  }
  z.t = Math.min(1, z.t + dt / (to > z.from ? ADS_IN : ADS_OUT));
  z.at = z.from + (to - z.from) * (1 - Math.pow(1 - z.t, 3));
  zoomNow = Math.exp(z.at);
  adsP = clamp(z.at / Math.log(W().zoom[0]), 0, 1);
}
function meEvent(type, d) {
  if (type === "thrust") {
    sfx("thrust");
    sfx("whoosh", 0.55);
    thrustPuff(me.pos, d.dir);
    emitFx("thrust", v3a(me.pos), v3a(d.dir));
    /* the burst kicks the lens wide and lurches the view into it; the gun is thrown back against it */
    fovK = 1.35;
    thrK = 1;
    const side = d.dir.x * Math.cos(me.yaw) - d.dir.z * Math.sin(me.yaw),
      fwd = -d.dir.x * Math.sin(me.yaw) - d.dir.z * Math.cos(me.yaw);
    thrS = side;
    vmS.inX.v -= side * 0.9;
    vmS.inZ.v += fwd * 0.7;
    rumble(0.3, 0.6, 120);
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
    /* the impact: the lens slams wide and the view is punched down */
    fovK = 1.9;
    vmS.punch = 1.4;
  } else if (type === "poundCharge") {
    sfx("charge", 0.6);
  } else if (type === "poundGo") {
    fovK = 1.4;
    sfx("whoosh");
  } else if (type === "charge") {
    sfx("charge");
    fovK = 1.2;
    rumble(0.35, 0.5, 140);
  } else if (type === "melee") {
    sfx("swing");
    /* make the blow felt: a camera punch and a swipe across the view */
    fovK = Math.max(fovK, 0.8);
    shakeT = Math.max(shakeT, 0.08);
    const sw = $("mswipe");
    sw.classList.remove("on");
    void sw.offsetWidth;
    sw.classList.add("on");
    rumble(0.2, 0.45, 70);
    /* (the first-person blow starts now, so its impact can wait for the moment of contact) */
    vmS.mc = 0;
    meleeHit(2.3, 70, "melee");
  } else if (type === "slide") {
    sfx(footKind("slide", me.pos));
    fovK = 0.6;
  } else if (type === "jump") {
    sfx(footKind("step", me.pos), 0.5);
    if (d.slid) fovK = 0.5;
  } else if (type === "land") {
    if (d.vy > 4) {
      landDip = Math.min(0.28, d.vy * 0.014);
      sfx(footKind("land", me.pos), clamp(d.vy / 14, 0.2, 1));
    }
    if (d.vy > 10) {
      dust(me.pos, 8, 2.5, 0.4);
      shakeT = Math.max(shakeT, 0.12);
    }
  } else if (type === "clamber") {
    landDip = 0.05;
    sfx("clamber");
  } else if (type === "bump") chargeWallFx(me, d);
}
function chargeCheck() {
  if (me.chargeT > 0) {
    if (meleeHit(1.6, 85, "charge")) me.chargeT = 0;
  }
}
function myFeel(dt) {
  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (me.ground && me.slideT <= 0 && !me.clamber) {
    const stride = me.sprint ? 2.3 : me.crouch ? 1.1 : 1.7;
    const prev = stepAcc;
    stepAcc += (hs * dt) / stride;
    if (Math.floor(stepAcc) > Math.floor(prev) && hs > 1.2) {
      sfx(footKind("step", me.pos), me.sprint ? 0.9 : me.crouch ? 0.3 : 0.55);
      if (me.sprint) dust(me.pos, 2, 0.6, 0.2, 0.25);
    }
  }
  /* the suit's thrusters assist a sprint: a soft whoosh as it starts, quiet pulses while it lasts */
  if (me.sprint && me.ground && !me.dead) {
    if (!jetOn) {
      jetOn = true;
      jetPuff = 0.3;
      sfx("jetstart", 0.45);
    } else if ((jetPuff -= dt) <= 0) {
      jetPuff = 0.34;
      sfx("jet", 0.3);
    }
  } else jetOn = false;
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
/* each animation frame: measured for the performance overlay */
/** add your own pose to this frame's recording (you have no third-person rig to record from) */
function recLocal() {
  if (!REC.sampling || !playing) return;
  if (!REC.hasMeta("local")) REC.setMeta("local", { color: myArmor, name: myName });
  REC.put(
    "local",
    me.pos,
    bodyState(me, {
      reload: reloadT > 0 ? 1 - reloadT / RELOAD_TIME : -1,
      fire: now - lastFireT < 0.1,
      wpn: wi,
    })
  );
}
function frame(t) {
  requestAnimationFrame(frame);
  perfBegin();
  frameBody(t);
  recLocal();
  CON.frame();
  updNetHud();
  perfEnd();
}
/* ---- respawning (in place, or out of a drop pod) ---- */
/* podding: the HUD is hidden (body.podding) while your pod falls */
let podding = false,
  myPod = null,
  /** when your pod's steering last changed its landing point (0: sent) */
  podSteerSent = 0;
/** where this respawn will happen, picked once when it starts (a pod needs open sky above it) */
let spawnPick = null;
/** when your respawn starts: a pod launches POD_EARLY before respawnAt and lands when you would have */
const respawnStart = () => respawnAt - (podsOn() && !INTRO.active ? POD_EARLY : 0);
/** skip the pod camera: watch from where you will land instead (you're out until it does) */
function skipPodCam(p) {
  p.skip = true;
  podViewEnd(p);
  me.pos.copy(p.at);
  me.vel.set(0, 0, 0);
  prevPos.copy(me.pos);
  me.yaw = Math.atan2(p.at.x, p.at.z);
  me.pitch = 0;
}
function respawnMe(at) {
  if (EXT && EXT.respawn) EXT.respawn();
  else {
    spawn(me);
    EVENTS.emit("spawn", { pilot: "local" });
  }
  if (at) {
    me.pos.copy(at);
    me.vel.set(0, 0, 0);
    prevPos.copy(me.pos);
  }
  $("dead").hidden = true;
  reloadT = 0;
  refill();
}
/* ---- the match start: with drop pods (and Drop in at match start on), a match opens with everyone
   dropping in. Your first spawn is a pod, as after a death (no death counted, no "Down" screen);
   the arena drones' too; CTF's agents start out the same way (G.start(true)). While the intro
   plays the drop waits, then everyone launches together and the clock starts as they land ---- */
let dropHold = false;
/** what you carry in both hands in a mode: "" (nothing), "flag" or "skull" (EXT.carrying) */
const carried = () => {
  const c = EXT && EXT.carrying ? EXT.carrying() : "";
  return c === true ? "flag" : c || "";
};
/** you wanted to sprint last frame (a carrier's fresh sprint press drops the flag) */
let carryRunPrev = false;
const dropsOn = () => podsOn() && SET.dropIn;
/**
 * open a match with a drop: you (and the arena drones, with bots) are out until your pods land.
 * Returns how long from launch to landing (0 when matches start on the ground).
 */
function matchDrop(withBots = false) {
  if (!dropsOn()) return 0;
  me.dead = true;
  me.vel.set(0, 0, 0);
  respawnAt = now + POD_EARLY;
  dropHold = true;
  $("dead").hidden = true;
  /* everyone comes down on a spot of their own: yours the safest, the drones' the others */
  let mine = null;
  if (!EXT) {
    mine = spawnPoint(me);
    spawnPick = { for: respawnAt, at: new V3(mine[0], mine[1] + 0.02, mine[2]) };
  } else spawnPick = null;
  if (withBots) {
    const free = SPAWNS.filter(s => s !== mine).sort(() => Math.random() - 0.5);
    bots.forEach((b, i) => {
      const s = free[i % free.length],
        at = new V3(s[0], s[1] + 0.01, s[2]);
      b.body.dead = true;
      b.respawn = now + POD_EARLY;
      b.pick = { for: b.respawn, at, sky: skyClear(at) };
      b.rig.root.visible = false;
    });
  }
  return POD_TIME;
}
/** put the camera straight on you after a teleport: no smoothing from where you were (it holds even
    with the world frozen) */
function snapView() {
  prevPos.copy(me.pos);
  smY = me.pos.y;
}
/** everyone else standing in the world: the mode's (its radar sees everyone but you), or the arena's */
function othersStanding() {
  if (EXT && EXT.radar) return EXT.radar().map(c => c.pos);
  const out = [];
  for (const b of bots) if (!b.body.dead) out.push(b.body.pos);
  for (const r of remotes.values()) if (r.has && !r.dead && r.rig) out.push(r.rig.root.position);
  return out;
}
/** may your pod's landing point move to (x, z)? onto a free spot, or at least further from a taken one */
function podSteerClear(x, z) {
  if (!myPod) return true;
  const taken = podSpots(myPod).concat(othersStanding());
  const y = myPod.at.y;
  if (!spotTaken(x, y, z, taken)) return true;
  const near = (px, pz) => {
    let d = Infinity;
    for (const p of taken) if (Math.abs(p.y - y) < 3) d = Math.min(d, Math.hypot(p.x - px, p.z - pz));
    return d;
  };
  return near(x, z) > near(myPod.at.x, myPod.at.z);
}
/** a pod landing on someone takes them out */
function podCrush(at) {
  for (const t of targets())
    if (Math.hypot(t.pos.x - at.x, t.pos.z - at.z) < 1.5 && Math.abs(t.pos.y - at.y) < 2.2) {
      dealDamage(t, 999, "pod", false);
      toast("Pod kill!");
    }
}
function frameBody(t) {
  const raw = Math.max(1e-4, (t - last) / 1000);
  let dt = Math.min(0.05, raw) * timeScale * CINE.timeK(raw);
  last = t;
  now += dt;
  REC.tick(now);
  perf(raw);
  frameHits = hitActs;
  hitActs = new Set();
  destrTick();
  /* the arena's blast gates run on the match clock (behind the menu, on the page clock); a mode moves
     its own (CTF: G.t) */
  if (!EXT) gatesAt(playing ? now - FFA.t0 : now, labOn("gates"));
  pollPad();
  padCapture();
  if (pad.on && $("settings").hidden) padActions();
  padCommon();
  if (playing && !paused && P("switchTeam") && EXT && EXT.switchTeam) EXT.switchTeam();
  if (P("perfHud")) {
    SET.perfOverlay = !SET.perfOverlay;
    saveSettings();
  }
  if (P("netHud")) {
    SET.netOverlay = !SET.netOverlay;
    saveSettings();
  }
  if (playing || EXT) {
    const sr = A("roster");
    if (sr !== rosterShown) {
      rosterShown = sr;
      $("scores").hidden = !sr;
    }
    if (sr) renderScores();
  }
  if (pad.on && (!$("menu").hidden || !$("settings").hidden || paused || POST.open || (EXT && EXT.full)))
    padMenu(dt);
  if (EXT && EXT.full) {
    runFrameHooks(FRAME_HOOKS.full, dt);
    EXT.full(dt);
    return;
  }
  if (!EXT) {
    updArenaColliders();
    setPilotCollider(arenaColliders);
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
    runFrameHooks(FRAME_HOOKS.menu, dt);
    renderFrame();
    return;
  }
  /* the sniper's own scope takes over once it is most of the way to the eye */
  vmRoot.visible = !me.dead && !(wi === 2 && adsP > 0.6);
  vmCarry(carried());
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
  /* a pod cleared from under you (leaving the match) is no longer yours */
  if (myPod && !PODS.includes(myPod)) myPod = null;
  /* the opening drop waits for the intro, then everyone launches together */
  if (dropHold) {
    if (INTRO.active) {
      respawnAt = now + POD_EARLY;
      if (spawnPick) spawnPick.for = respawnAt;
      for (const b of bots)
        if (b.body.dead) {
          b.respawn = now + POD_EARLY;
          if (b.pick) b.pick.for = b.respawn;
        }
    } else dropHold = false;
  }
  if (me.dead) {
    if (myPod) {
      /* riding the drop pod down; Jump, Fire or Melee skips the pod camera */
      if (!myPod.skip && !REPLAY.active && (P("jump") || P("fire") || P("melee"))) skipPodCam(myPod);
      /* move (keys or stick) steers where it lands, relative to where you look */
      const fw = clamp(
          (A("forward") ? 1 : 0) - (A("back") ? 1 : 0) + touch.f - (pad.on ? GP.ax[1] : 0),
          -1,
          1
        ),
        sw = clamp((A("right") ? 1 : 0) - (A("left") ? 1 : 0) + touch.s + (pad.on ? GP.ax[0] : 0), -1, 1);
      if (fw || sw) {
        const sy = Math.sin(me.yaw),
          cy = Math.cos(me.yaw);
        if (steerPod(myPod, -sy * fw + cy * sw, -cy * fw - sy * sw, dt)) {
          if (myPod.skip) me.pos.copy(myPod.at);
          podSteerSent = podSteerSent || now;
        }
      }
      /* tell the room where it will land now (a few times a second) */
      if (podSteerSent && now - podSteerSent > 0.2) {
        podSteerSent = 0;
        emitFx("podto", v3a(myPod.at), [0, 0, 0], 0);
      }
    } else if (now > respawnStart() && !(podsOn() && killCamHolds())) {
      /* (with pods, your pod launches once the kill cam is over or skipped) */
      if (!spawnPick || spawnPick.for !== respawnAt) {
        const sp = EXT && EXT.spawnPoint ? EXT.spawnPoint() : spawnPoint(me);
        spawnPick = { for: respawnAt, at: sp ? new V3(sp[0], sp[1] + 0.02, sp[2]) : null };
      }
      const at = spawnPick.at;
      if (at && podsOn() && !INTRO.active && skyClear(at)) {
        spawnPick = null;
        $("dead").hidden = true;
        const zone = EXT && EXT.podZone ? EXT.podZone() : null;
        /* you ride it down facing the way you will come out (the mouse turns it) */
        me.yaw = Math.atan2(at.x, at.z);
        me.pitch = 0;
        myPod = dropPod(at, myColor, {
          rider: true,
          /* steering stays within the mode's zone, and off spots where someone stands or another pod
             is coming down (it may always move further away from them) */
          steer: { r: zone ? zone.r : 14, ok: (x, z) => (!zone || zone.ok(x, z)) && podSteerClear(x, z) },
          onLand(p) {
            const pod = myPod;
            /* you step out facing where you looked on the way down */
            const look = [me.yaw, pod && pod.skip ? me.pitch : 0];
            myPod = null;
            respawnMe(p);
            [me.yaw, me.pitch] = look;
            if (pod && !pod.skip) podCockpitLand(pod);
            podCrush(p);
          },
        });
        emitFx("pod", v3a(at), [0, 0, 0], 0);
        toast("Jump to skip the pod camera");
      } else if (now > respawnAt) {
        /* no open sky there: appear in place at the usual time */
        spawnPick = null;
        respawnMe(null);
      }
    } else $("deadT").textContent = `Respawning in ${Math.ceil(respawnStart() - now)}`;
  } else if (!paused && !INTRO.active && !POST.open) {
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
      scoped: W().zoom[0] >= 3,
      meleeP: P("melee"),
    };
    if (touch.sprint && inp.f < 0.3) touch.sprint = false;
    /* carrying the flag (EXT.carryNoRun): a fresh press of sprint, or a thrust, lets it go; otherwise
       a carrier walks (auto-sprint or a sprint held since the pickup just doesn't happen) */
    const wantRun = inp.sprint && inp.f >= 0.3;
    if (carried() && EXT.carryNoRun && EXT.carryNoRun()) {
      if ((wantRun && !carryRunPrev) || inp.thrust) {
        if (EXT.dropFlag) EXT.dropFlag();
        toast("Sprinting or thrusting drops the flag");
      } else inp.sprint = false;
    }
    carryRunPrev = wantRun;
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
    fireStep = dt;
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
    /* both hands are on the flag or the skull: no grenades either */
    if (P("grenade") && !carried()) throwNade();
    if (P("swapNade")) swapNade();
    if (P("reload") && !pkNear) startReload();
    /* carrying the flag: both hands are on it, so no shooting, and switching weapons lets it go */
    const carrying = !!carried();
    if (carrying && (P("weapon1") || P("weapon2") || P("swapWeapon"))) {
      if (EXT.dropFlag) EXT.dropFlag();
    } else {
      if (P("weapon1")) setSlot(0);
      if (P("weapon2")) setSlot(1);
      if (P("swapWeapon")) setSlot(1 - cur);
    }
    const trig = A("fire") || touch.fire;
    if (!trig) semiLatch = false;
    /* a burst already started finishes without the trigger (weapons/firing.js) */
    if (switchT > 0 || carrying) burstLeft = 0;
    if (
      ((trig && (W().auto || !semiLatch)) || burstLeft > 0) &&
      fireCD <= 0 &&
      switchT <= 0 &&
      !me.sprint &&
      me.raiseT <= 0 &&
      me.chargeT <= 0 &&
      me.pound === 0 &&
      !me.clamber &&
      !carrying
    )
      fire();
  }
  bloom = Math.max(0, bloom - dt * 0.05);
  recoil *= Math.exp(-dt * W().recover);
  flinch *= Math.exp(-9 * dt);
  if (EXT) {
    if (EXT.tick) EXT.tick(dt);
  } else if (!INTRO.active) for (const b of bots) botStep(b, dt);
  const hs = Math.hypot(me.vel.x, me.vel.z);
  const lr = me.vel.x * Math.cos(me.yaw) - me.vel.z * Math.sin(me.yaw);
  rpos.copy(prevPos).lerp(me.pos, physAcc * 120);
  if (me.dead || paused) rpos.copy(me.pos);
  /* the eye: standing, crouched, or well below a crouch in a slide (presentation only: the body
     keeps its crouched height), dropping in fast with a dip that bottoms out a fifth of a second in */
  const slid = me.slideT > 0 ? clamp((0.8 - me.slideT) / 0.22, 0, 1) : 1;
  const eyeT = me.slideT > 0 ? 0.76 - 0.12 * Math.sin(Math.PI * slid) : me.h === H_STAND ? 1.62 : 1.02;
  eyeCur += (eyeT - eyeCur) * Math.min(1, dt * (me.slideT > 0 ? 24 : 14));
  const eyeH = eyeCur;
  if (me.ground && rpos.y > smY && rpos.y - smY < 0.7) smY += (rpos.y - smY) * Math.min(1, dt * 16);
  else smY = rpos.y;
  /* clambering, the view pulls up in an eased arc (slow off the wall, slowing again over the top)
     and nods toward the hands on the ledge; it settles once you are over */
  const cl = me.clamber,
    clK = cl && cl.dur ? Math.min(1, cl.t / cl.dur) : -1;
  if (clK >= 0) {
    const x = Math.min(1, clK * 1.6);
    smY = cl.from.y + (cl.to.y - cl.from.y) * x * x * (3 - 2 * x) + 0.05 * Math.sin(Math.PI * clK);
    clWas = true;
  } else if (clWas) {
    clWas = false;
    landDip = Math.max(landDip, 0.13);
  }
  landDip = Math.max(0, landDip - dt * 1.2);
  shakeT = Math.max(0, shakeT - dt);
  const bobY =
    me.ground && me.slideT <= 0
      ? Math.sin(stepAcc * Math.PI * 2) * (me.sprint ? 0.045 : 0.025) * clamp(hs / 6, 0, 1) * SET.bob
      : 0;
  /* charging a ground pound, the hover trembles harder as it builds and the view tunnels in */
  const pk = me.pound === 1 ? Math.min(1, me.poundT / 0.55) : 0;
  const sh = reduceMotion ? 0 : (shakeT * 0.25 + (me.pound === 1 ? 0.006 + 0.016 * pk : 0)) * SET.shake;
  thrK = Math.max(0, thrK - dt * 4);
  camera.position.set(
    rpos.x + rnd(-sh, sh),
    smY + eyeH - landDip * SET.bob + bobY + rnd(-sh, sh),
    rpos.z + rnd(-sh, sh)
  );
  const rollT =
    (me.slideT > 0 ? 0.1 + 0.06 * Math.sin(Math.PI * slid) : 0) +
    clamp(-lr * 0.004, -0.04, 0.04) +
    (me.thrustT > 0 ? clamp(-lr * 0.006, -0.08, 0.08) : 0) -
    thrS * 0.06 * thrK * thrK +
    (me.sprint ? Math.sin(stepAcc * Math.PI) * 0.012 : 0);
  camRoll += (rollT - camRoll) * Math.min(1, dt * 8);
  camera.rotation.order = "YXZ";
  camera.rotation.y = me.yaw;
  /* (a blow that lands punches the view down and over) */
  camera.rotation.x =
    me.pitch +
    recoil +
    flinch -
    vmS.punch * 0.04 -
    (clK >= 0 ? 0.12 * Math.sin(Math.PI * clK) : 0) -
    /* (a landing nods the view, and a hard one more) */
    landDip * 0.16 * SET.bob;
  camera.rotation.z = camRoll + (me.stabbing ? Math.sin(now * 6) * 0.01 : 0) + vmS.punch * 0.035;
  fovK = Math.max(0, fovK - dt * 3);
  const fb = SET.fov;
  easeZoom(dt);
  /* the motion widening (sprint, slide, thrust, pound) gives way as the scope comes up */
  fovX += ((me.sprint ? 7 : 0) + (me.slideT > 0 ? 5 : 0) + fovK * 10 - pk * 9 - fovX) * Math.min(1, dt * 12);
  camera.fov = fb / zoomNow + fovX * (1 - adsP);
  if (!(camera.fov > 1 && camera.fov < 170)) camera.fov = fb;
  camera.updateProjectionMatrix();
  /* riding your pod down, from inside (game/pod-view.js); then stepping out of it */
  if (myPod && !myPod.skip) podCockpit(myPod, dt);
  else podCockpitIdle(dt);
  podMarker(myPod);
  const pd = !!myPod || PV.exit >= 0;
  if (pd !== podding) document.body.classList.toggle("podding", (podding = pd));
  updVM(dt, {
    aim: aiming,
    aimK: adsP,
    sprint: me.sprint && me.ground,
    reload: reloadT > 0 ? 1 - reloadT / W().reload : -1,
    melee: me.meleeT > 0 ? 1 - me.meleeT / 0.4 : me.chargeT > 0 ? 0.5 : -1,
    charge: me.chargeT > 0,
    clamber: !!me.clamber,
    cl: me.clamber,
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
  flash.intensity = flashT > 0 ? 2.2 * LIGHT_K : 0;
  if (flashT > 0) camera.worldToLocal(flashSprite.getWorldPosition(flash.position));
  flashSprite.material.opacity = flashT > 0 ? 0.95 : 0;
  flashSprite.material.rotation = Math.random() * 6;
  updFX(dt);
  MAIN_NADES.step(dt);
  MAIN_ROCKETS.step(dt);
  if (!EXT) updRigs(dt);
  ffaTick(dt);
  updPickups(dt);
  runFrameHooks(FRAME_HOOKS.play, dt);
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
  updTracker(dt);
  if (playing && !paused && P("ping")) pingNow();
  updPings();
  killCamTick();
  hlTick();
  introFrame(Math.min(0.05, raw));
  if (REPLAY.active) REPLAY.frame(Math.min(0.05, raw));
  renderFrame();
}
const _est = new V3(),
  _pbs = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, s: null };
function updRigs(dt) {
  const tnow = performance.now() / 1000;
  for (const r of remotes.values()) {
    if (!r.rig || !r.has) continue;
    const root = r.rig.root;
    if (tnow - r.fastAt < 1 && r.pb.sample(tnow, _pbs)) {
      /* fast channel: timestamped playback, already smooth; only a tiny blend hides corrections */
      _est.set(_pbs.x, _pbs.y, _pbs.z);
      if (root.position.distanceTo(_est) > 4) root.position.copy(_est);
      else root.position.lerp(_est, 1 - Math.exp(-60 * dt));
      r.vel.set(_pbs.vx, _pbs.vy, _pbs.vz);
      r.tgt.copy(_est);
      r.pitch = _pbs.pitch;
      root.rotation.y = _pbs.yaw;
    } else {
      const age = Math.min(0.15, tnow - r.rx);
      const est = _est.copy(r.tgt).addScaledVector(r.vel, age);
      if (root.position.distanceTo(est) > 6) root.position.copy(est);
      else root.position.lerp(est, 1 - Math.exp(-18 * dt));
      let dy = r.yaw - root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * Math.min(1, dt * 15);
    }
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
      wpn: (s & 40960) === 40960 ? 3 : s & 32768 ? 2 : s & 8192 ? 1 : 0,
      aim: !!(s & 65536),
    };
    if (REC.sampling) {
      REC.put(r.id, root.position, st);
      if (!REC.hasMeta(r.id)) REC.setMeta(r.id, { color: r.color, name: r.name });
    }
    rigEvents(r.rig, r.rig.update(dt, st), st);
    /* keep the pilot's body where it is drawn, so body-based features (kill cams, events) see it */
    r.body.pos.copy(root.position);
    r.body.yaw = root.rotation.y;
    r.body.pitch = r.pitch;
  }
  for (const b of bots)
    b.pose(dt, {
      reload: b.reloadT > 0 ? 1 - b.reloadT / droneGun(b).reload : -1,
      fire: now - b.firedT < 0.1,
      wpn: b.wpn,
    });
}
/** a melee swing's arc: a short-lived bright crescent in front of the pilot, so you see the blow coming */
function meleeArc(rig) {
  const r = rig.root,
    yaw = r.rotation.y,
    n = pc(9);
  for (let i = 0; i < n; i++) {
    const a = yaw + 1.05 - (2.1 * i) / Math.max(1, n - 1);
    const p = new V3(
      r.position.x - Math.sin(a) * 1.05,
      r.position.y + 1.25 - i * 0.03,
      r.position.z - Math.cos(a) * 1.05
    );
    ptAdd(
      PTS.glow,
      p,
      new V3(-Math.sin(a) * 1.5, 0, -Math.cos(a) * 1.5),
      0.32,
      0xdff4ff,
      0.75,
      0.14 + i * 0.012,
      { max: 0.25, grow: -1.5 }
    );
  }
}
function rigEvents(rig, ev, st) {
  if (rig.jet > 0 || (rig.jetS && rig.jetS.on)) sprintJets(rig);
  const p = rig.root.position;
  /* someone else's slide starting, on the surface under them */
  const sl = !!(st && st.slide);
  if (sl && !rig.slideHeard) sfxAt("slide", p, 28, 0.8);
  rig.slideHeard = sl;
  if (!ev) return;
  if (ev.pop) {
    shieldPop(rig.chestWorld(new V3()));
    sfx("pop", distVol(p, 35));
  }
  if (ev.drop) dropMag(ev.drop, ev.dropQ);
  if (ev.magIn) sfxAt("magin", p, 22, 0.7);
  if (ev.slap) sfxAt("slap", p, 22, 0.6);
  if (ev.bolt) sfxAt("boltfwd", p, 24, 0.7);
  /* someone's melee: a swoosh and a bright arc in front of them */
  if (ev.swing) {
    sfxAt("swing", p, 30, 0.9);
    meleeArc(rig);
  }
  if (ev.land) sfxAt("land", p, 32, Math.min(1, ev.land / 14));
  /* footsteps: positional and loud up close (sprinting louder still) */
  if (ev.step) {
    sfxAt("step", p, 30, ev.sprint ? 1 : 0.6);
    if (ev.sprint) dust(p, 1, 0.5, 0.2, 0.22);
  }
}
