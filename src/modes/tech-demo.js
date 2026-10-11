/* ============ tech demo ============ */
let demo = false,
  seg = 0,
  segT = 0,
  snapCam = false,
  demoRig = null;
const segOnce = new Set();
const camLook = new V3();
let dummies = [];
function makeDummies() {
  if (dummies.length) return;
  dummies = [0, 1].map(i => {
    const n = "Target-0" + (i + 1);
    const d = {
      name: n,
      body: new Body(),
      rig: makePilot("#8b9aa3", n),
      k: 0,
      d: 0,
      respawn: 0,
      fireCD: 0,
      active: false,
      strafe: false,
    };
    d.rig.setLabel(n, "demo target");
    d.rig.root.visible = false;
    return d;
  });
}
function placeDummy(i, x, y, z, shield) {
  const d = dummies[i];
  d.body.reset();
  d.body.pos.set(x, y, z);
  d.body.spawnT = -99;
  d.body.shield = shield;
  d.rig.revive();
  d.rig.S.sh = shield;
  d.rig.root.visible = true;
  d.active = true;
}
function placeMe(x, y, z, yaw, pitch = 0) {
  me.reset();
  me.pos.set(x, y, z);
  me.yaw = yaw;
  me.pitch = pitch;
  me.spawnT = 1e9;
  slots[0] = 0;
  slots[1] = 1;
  setSlot(0, true);
  mag = 32;
  ammo[0] = 32;
  reloadT = 0;
  prevReload = 0;
}
function once(k, t, at) {
  if (t >= at && !segOnce.has(k)) {
    segOnce.add(k);
    return true;
  }
  return false;
}
const PI = Math.PI;
const SEGS = [
  {
    title: "Sprint into slide",
    keys: ["{sprint}", "then {crouch}"],
    text: "Sprint, then crouch to slide. The slide keeps your speed and drops your hitbox low.",
    dur: 3,
    cam: "chase",
    setup() {
      placeMe(-30, 0, -6, -PI / 2);
    },
    input(t, I) {
      I.f = 1;
      I.sprint = t < 1.36;
      if (t >= 1.3 && t < 2.2) I.crouch = true;
      if (once("c", t, 1.3)) I.crouchP = true;
    },
  },
  {
    title: "Thruster dash",
    keys: ["{thrust}"],
    text: "A short directional burst on the ground or in the air. It recharges in about two seconds.",
    dur: 4.2,
    cam: "wide",
    setup() {
      placeMe(17.4, 0, -21, PI / 2);
    },
    input(t, I) {
      I.f = 0.5;
      if (once("a", t, 0.5)) {
        I.f = 0;
        I.s = -1;
        I.thrust = true;
      }
      if (once("b", t, 1.5)) {
        me.thrustCD = 0;
        I.f = 0;
        I.s = 1;
        I.thrust = true;
      }
      if (once("j", t, 2.5)) I.jumpP = true;
      if (once("c", t, 2.8)) {
        me.thrustCD = 0;
        I.f = 1;
        I.thrust = true;
      }
    },
  },
  {
    title: "Clamber",
    keys: ["{jump}", "hold {forward}"],
    text: "Jump at a ledge while moving forward and the pilot pulls up onto it.",
    dur: 2.6,
    cam: "side",
    side: [21, 3.2, 7],
    setup() {
      placeMe(24, 0, 0.5, PI / 2);
    },
    input(t, I) {
      I.f = t < 1.6 ? 1 : 0;
      if (once("j", t, 0.42)) I.jumpP = true;
    },
  },
  {
    title: "Stabilize",
    keys: ["{aim} in the air"],
    text: "Aim in midair to hover for about a second, firing down from the high ground. Watch the target's shield flare gold on every hit.",
    dur: 3.4,
    cam: "chase",
    target: 0,
    setup() {
      placeMe(18.5, 2.5, 0, PI / 2);
      placeDummy(0, 11.5, 0, -2.5, 45);
    },
    input(t, I) {
      I.f = t < 0.55 ? 1 : 0;
      if (once("j", t, 0.25)) I.jumpP = true;
      I.aim = t > 0.6 && t < 2.2;
      I.fire = I.aim && t > 0.75;
    },
  },
  {
    title: "Ground pound",
    keys: ["Hold {crouch} in the air"],
    text: "Hold crouch midair to charge, aim the landing, then release. The impact hits everything nearby.",
    dur: 3.4,
    cam: "side",
    side: [9, 3.5, 10],
    setup() {
      placeMe(7.5, 5.21, 0, -PI / 2, -0.95);
      placeDummy(0, 14.3, 0, -1.3, 10);
      placeDummy(1, 14.7, 0, 1.4, 10);
    },
    input(t, I) {
      I.f = t < 0.45 ? 0.8 : 0;
      if (once("j", t, 0.15)) I.jumpP = true;
      I.crouch = t > 0.62 && t < 1.35;
      if (once("c", t, 0.62)) I.crouchP = true;
    },
  },
  {
    title: "Shoulder charge",
    keys: ["{sprint}", "then {melee}"],
    text: "Sprint for a beat, then melee to lunge. A connected charge takes most of a full health bar.",
    dur: 2.8,
    cam: "chase",
    setup() {
      placeMe(-30, 0, -6, -PI / 2);
      placeDummy(0, -15, 0, -6, 25);
    },
    input(t, I) {
      I.f = t < 1.6 ? 1 : 0;
      I.sprint = t < 1.2;
      if (once("m", t, 1.15)) I.meleeP = true;
    },
  },
  {
    title: "Reload",
    keys: ["{reload}"],
    text: "Tilt, drop the spent magazine, seat a fresh one and slap the charging handle. It takes 1.8 seconds, so pick your moment.",
    dur: 3,
    cam: "close",
    setup() {
      placeMe(-8, 0, -24, -PI / 2);
      mag = 6;
    },
    input(t, I) {
      I.f = t > 0.2 && t < 2.6 ? 0.25 : 0;
      if (once("r", t, 0.4)) reloadT = RELOAD_TIME;
    },
  },
  {
    title: "Firefight",
    keys: ["{fire}", "{left} / {right}", "{thrust}"],
    text: "Shields soak damage first and pop when they break, then recharge once you stop taking hits. Headshots land for nearly double.",
    dur: 5,
    cam: "chase",
    target: 0,
    setup() {
      placeMe(-8, 0, -24, -PI / 2);
      placeDummy(0, 7, 0, -24, 70);
      dummies[0].strafe = true;
    },
    input(t, I) {
      I.aim = true;
      I.fire = t > 0.4;
      I.s = -Math.sin(t * 2.6) * 0.8;
      if (once("a", t, 1.6)) {
        me.thrustCD = 0;
        I.thrust = true;
        I.s = 1;
      }
    },
  },
];
SEGS.forEach(() => {
  const i = document.createElement("i");
  i.appendChild(document.createElement("b"));
  $("dProg").appendChild(i);
});
function nextSeg(i) {
  seg = (i + SEGS.length) % SEGS.length;
  segT = 0;
  segOnce.clear();
  for (const d of dummies) {
    d.active = false;
    d.strafe = false;
    d.rig.root.visible = false;
  }
  const S = SEGS[seg];
  S.setup();
  snapCam = true;
  demoRig.revive();
  demoRig.showTag(false);
  demoRig.S.sh = 70;
  $("dStep").textContent = `Tech demo · ${seg + 1} of ${SEGS.length}`;
  $("dTitle").textContent = S.title;
  $("dText").textContent = S.text;
  const k = $("dKeys");
  k.textContent = "";
  const lab = document.createElement("span");
  lab.textContent = "Keys";
  k.appendChild(lab);
  S.keys.forEach(x => {
    const e = document.createElement("kbd");
    e.textContent = x.replace(/\{(\w+)\}/g, (m, a) => bindLabel(a).split(" / ")[0]);
    k.appendChild(e);
  });
  [...$("dProg").children].forEach((el, j) => {
    const fill = /** @type {HTMLElement} */ (el.firstChild);
    fill.style.transform = `scaleX(${j < seg ? 1 : 0})`;
  });
  try {
    $("dfade").animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduceMotion ? 1 : 450 });
  } catch (e) {}
  sfx("stinger", 0.5);
  say(S.title, true);
}
function startDemo() {
  makeDummies();
  audio();
  VO.on = $("vo").checked;
  demo = true;
  kills = deaths = 0;
  feed.length = 0;
  streak = 0;
  multi = 0;
  firstBlood = true;
  $("menu").hidden = true;
  $("hud").hidden = false;
  $("hud").classList.add("demo");
  $("demoUI").hidden = false;
  for (const b of bots) b.rig.root.visible = false;
  const nm = ($("callsign").value || "Pilot").trim().slice(0, 14) || "Pilot";
  if (!demoRig || demoRig.color !== myColor) {
    if (demoRig) scene.remove(demoRig.root);
    demoRig = makePilot(myColor, nm);
  }
  myName = nm;
  demoRig.setLabel(nm);
  demoRig.root.visible = true;
  vmRoot.visible = false;
  camera.fov = 70;
  camera.updateProjectionMatrix();
  nextSeg(0);
}
function exitDemo() {
  demo = false;
  $("demoUI").hidden = true;
  $("hud").hidden = true;
  $("hud").classList.remove("demo");
  $("menu").hidden = false;
  for (const d of dummies) {
    d.active = false;
    d.rig.root.visible = false;
  }
  if (demoRig) demoRig.root.visible = false;
  for (const b of bots) b.rig.root.visible = !b.body.dead;
  me.reset();
  kills = deaths = 0;
  feed.length = 0;
  renderFeed();
  firstBlood = false;
  camera.fov = 78;
  camera.updateProjectionMatrix();
  camera.rotation.z = 0;
  try {
    if (hasTTS) speechSynthesis.cancel();
  } catch (e) {}
}
$("watch").onclick = startDemo;
$("dExit").onclick = exitDemo;
$("dSkip").onclick = () => nextSeg(seg + 1);
addEventListener("keydown", e => {
  if (demo && e.code === "Escape") exitDemo();
});
function demoFrame(dt) {
  const S = SEGS[seg];
  segT += dt;
  const I = {
    f: 0,
    s: 0,
    sprint: false,
    thrust: false,
    crouch: false,
    crouchP: false,
    jumpP: false,
    aim: false,
    meleeP: false,
    fire: false,
  };
  S.input(segT, I);
  if (S.target != null) {
    const d = dummies[S.target];
    if (d.active && !d.body.dead) {
      const e = me.pos.clone().add(new V3(0, me.h - 0.2, 0));
      const tp = d.body.pos.clone().add(new V3(0, 1.25, 0));
      const want = Math.atan2(-(tp.x - e.x), -(tp.z - e.z));
      let dy = want - me.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      me.yaw += dy * Math.min(1, dt * 10);
      const wp = Math.atan2(tp.y - e.y, Math.hypot(tp.x - e.x, tp.z - e.z));
      me.pitch += (wp - me.pitch) * Math.min(1, dt * 10);
    } else I.fire = false;
  }
  aiming = I.aim;
  me.step(dt, I, meEvent);
  chargeCheck();
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
  if (I.fire && fireCD <= 0 && !me.sprint && me.pound === 0 && !me.clamber && reloadT <= 0) {
    const o = me.pos.clone().add(new V3(0, me.h - 0.2, 0));
    const d = me.aimDir();
    const rt = new V3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    fire({
      o,
      d,
      muzzle: o
        .clone()
        .addScaledVector(d, 0.75)
        .addScaledVector(rt, 0.18)
        .add(new V3(0, -0.28, 0)),
    });
  }
  bloom = Math.max(0, bloom - dt * 0.05);
  recoil = Math.max(0, recoil - dt * 0.12);
  for (const d of dummies) {
    if (!d.active) continue;
    const B = d.body;
    B.yaw = Math.atan2(-(me.pos.x - B.pos.x), -(me.pos.z - B.pos.z));
    B.step(
      dt,
      {
        f: 0,
        s: d.strafe && !B.dead ? (Math.sin(segT * 1.8) > 0 ? 1 : -1) : 0,
        sprint: false,
        thrust: false,
        crouch: false,
        crouchP: false,
        jumpP: false,
        aim: false,
        meleeP: false,
      },
      () => {}
    );
    let fired = false;
    if (d.strafe && !B.dead) {
      d.fireCD -= dt;
      if (d.fireCD <= 0) {
        d.fireCD = 0.17;
        fired = true;
        const a = B.pos.clone().add(new V3(0, 1.25, 0));
        const b = me.pos.clone().add(new V3(rnd(-0.6, 0.6), rnd(0.6, 1.7), rnd(-0.6, 0.6)));
        tracer(a, b, 0xc9d3d8);
        sfx("shot", 0.25);
        if (Math.random() < 0.45) {
          me.shield = Math.max(0, me.shield - 6);
          me.lastDmg = now;
          spark(b, 2, 0xffd36b);
        } else spark(b);
      }
    }
    const rg = d.rig;
    rg.root.position.copy(B.pos);
    rg.root.rotation.y = B.yaw;
    rigEvents(rg, rg.update(dt, bodyState(B, { fire: fired })));
  }
  const rg = demoRig;
  rg.root.position.copy(me.pos);
  rg.root.rotation.y = me.yaw;
  rigEvents(
    rg,
    rg.update(
      dt,
      bodyState(me, { reload: reloadT > 0 ? 1 - reloadT / W().reload : -1, fire: now - lastFireT < 0.1 })
    )
  );
  const f = me.fwd(),
    rt = new V3(Math.cos(me.yaw), 0, -Math.sin(me.yaw)),
    p = me.pos;
  let want;
  const look = p.clone().add(new V3(0, 1.1, 0));
  if (S.cam === "side") want = new V3(S.side[0], S.side[1], S.side[2]);
  else if (S.cam === "close") {
    want = p
      .clone()
      .addScaledVector(f, 1.7)
      .addScaledVector(rt, 1.25)
      .add(new V3(0, 1.55, 0));
    look.add(new V3(0, 0.25, 0)).addScaledVector(rt, 0.15);
  } else {
    const w = S.cam === "wide";
    want = p
      .clone()
      .addScaledVector(f, w ? -7 : -4.6)
      .addScaledVector(rt, w ? 3.6 : 1.4)
      .add(new V3(0, w ? 3.4 : 2.2, 0));
    look.addScaledVector(f, 3);
  }
  if (snapCam) {
    camera.position.copy(want);
    camLook.copy(look);
    snapCam = false;
  } else {
    camera.position.lerp(want, 1 - Math.exp(-5 * dt));
    camLook.lerp(look, 1 - Math.exp(-8 * dt));
  }
  shakeT = Math.max(0, shakeT - dt);
  if (shakeT > 0 && !reduceMotion) {
    camera.position.x += rnd(-1, 1) * shakeT * 0.3;
    camera.position.y += rnd(-1, 1) * shakeT * 0.3;
  }
  camera.lookAt(camLook);
  updFX(dt);
  updRigs(dt);
  hud();
  const hs = Math.hypot(me.vel.x, me.vel.z);
  $("speed").style.opacity = String(
    reduceMotion ? 0 : me.thrustT > 0 ? 0.6 : me.pound === 2 ? 0.7 : clamp((hs - 10) / 6, 0, 0.5)
  );
  toastT -= dt;
  if (toastT <= 0) $("toast").style.opacity = "0";
  const bar = $("dProg").children[seg];
  if (bar)
    /** @type {HTMLElement} */ (bar.firstChild).style.transform = `scaleX(${Math.min(1, segT / S.dur)})`;
  if (segT >= S.dur + 0.6) nextSeg(seg + 1);
  renderFrame();
}
