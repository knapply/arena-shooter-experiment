/* ============ gamepad (Xbox standard mapping) ============ */
const GPB = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};
const GP = {
  b: new Array(17).fill(false),
  pb: new Array(17).fill(false),
  ax: [0, 0, 0, 0],
  lt: 0,
  rt: 0,
  sprint: false,
  blocked: false,
  navT: 0,
  lastT: -99,
  hold: 0,
  warned: false,
};
const gpDown = i => GP.b[i] && !GP.pb[i];
const padRecent = () => performance.now() - GP.lastT < 4000;
addEventListener("gamepadconnected", () => {
  toast("Controller connected");
  GP.lastT = performance.now();
});
addEventListener("gamepaddisconnected", () => {
  toast("Controller disconnected");
  pad.on = false;
  pad.fire = pad.aim = false;
});
function pollPad() {
  for (let i = 0; i < 17; i++) GP.pb[i] = GP.b[i];
  if (GP.blocked) return false;
  let gp = null;
  try {
    const ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of ps) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
  } catch (e) {
    GP.blocked = true;
    if (!GP.warned) {
      GP.warned = true;
      toast("Controllers are blocked in this view");
    }
    return false;
  }
  if (!gp) {
    pad.on = false;
    pad.fire = pad.aim = false;
    return false;
  }
  pad.on = true;
  const B = gp.buttons;
  let any = false;
  for (let i = 0; i < 17; i++) {
    const v = !!(B[i] && (B[i].pressed || B[i].value > 0.4));
    GP.b[i] = v;
    if (v) any = true;
  }
  GP.lt = B[6] ? B[6].value : 0;
  GP.rt = B[7] ? B[7].value : 0;
  GP.pad = gp;
  const dzl = SET.padMoveDeadzone,
    dzr = SET.padDeadzone;
  const lx = gp.axes[0] || 0,
    ly = gp.axes[1] || 0,
    lm = Math.hypot(lx, ly),
    ls = lm < dzl ? 0 : Math.min(1, (lm - dzl) / (1 - dzl)) / lm;
  GP.ax[0] = lx * ls;
  GP.ax[1] = ly * ls;
  const rx = gp.axes[2] || 0,
    ry = gp.axes[3] || 0,
    rm = Math.hypot(rx, ry),
    rs = rm < dzr ? 0 : Math.min(1, (rm - dzr) / (1 - dzr)) / rm;
  GP.ax[2] = rx * rs;
  GP.ax[3] = ry * rs;
  if (any || lm > 0.3 || rm > 0.3) GP.lastT = performance.now();
  pad.fire = GP.rt > 0.35;
  pad.aim = GP.lt > 0.35;
  return true;
}
const _aa = new V3(),
  _ab = new V3();
/* aim assist: slows the reticle over an enemy's center mass (friction only, no snapping) */
function aimFriction() {
  const o = camera.position;
  _aa.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = 1;
  for (const t of targets()) {
    _ab.copy(t.pos);
    _ab.y += t.h * 0.6;
    _ab.sub(o);
    const L = _ab.length();
    if (L > 48 || L < 0.5) continue;
    const ang = Math.acos(clamp(_ab.dot(_aa) / L, -1, 1)),
      zone = (0.75 / L + 0.015) * 2.2;
    if (ang < zone) best = Math.min(best, 0.42 + (0.58 * ang) / zone);
  }
  return best;
}
function padGame(dt) {
  const rx = GP.ax[2],
    ry = GP.ax[3],
    m = Math.min(1, Math.hypot(rx, ry));
  if (m > 0) {
    /* full tilt: the stick past padEdge (by default the old 94% threshold, with no rescaling) */
    const edge = SET.padEdge,
      me2 = Math.min(1, m / edge);
    GP.hold = m > Math.min(0.94, edge * 0.99) ? GP.hold + dt : 0;
    const curve = Math.pow(me2, SET.padCurve) / m;
    const accel = 1 + Math.min(1, Math.max(0, GP.hold - SET.padAccelDelay) / SET.padAccelTime) * SET.padAccel;
    const fr = 1 - (1 - aimFriction()) * SET.aimAssist;
    const sens = 3.2 * SET.padSens * lookSens(SET.padAdsSens) * accel * fr;
    me.yaw -= rx * curve * sens * dt;
    me.pitch = clamp(
      me.pitch - ry * curve * sens * SET.padVertical * dt * (SET.padInvertY ? -1 : 1),
      -1.5,
      1.5
    );
  } else GP.hold = 0;
  const at = SET.aimAssist > 0 && m > 0.06 ? assistTarget() : null;
  if (at && GP.lastAt && GP.lastAt.ref === at.ref) {
    const dy = Math.atan2(Math.sin(at.yaw - GP.lastAt.yaw), Math.cos(at.yaw - GP.lastAt.yaw));
    if (Math.abs(dy) < 0.1) {
      me.yaw += dy * 0.5 * SET.aimAssist;
      me.pitch = clamp(me.pitch + (at.pitch - GP.lastAt.pitch) * 0.35 * SET.aimAssist, -1.5, 1.5);
    }
  }
  GP.lastAt = at;
  if (SET.padSprint === "toggle" && -GP.ax[1] < 0.3) GP.sprint = false;
}
/* controller buttons -> actions through the controller bindings */
function padActions() {
  for (const [a] of ACTIONS) {
    const bs = PADB[a];
    if (!bs || !bs.length) {
      continue;
    }
    let held = false,
      down = false;
    for (const i of bs) {
      if (GP.b[i]) held = true;
      if (gpDown(i)) down = true;
    }
    if (a === "sprint") {
      if (SET.padSprint === "toggle") {
        if (down) GP.sprint = !GP.sprint;
      } else GP.sprint = held;
      continue;
    }
    if (held) virtHeld.add(a);
    else virtHeld.delete(a);
    if (down) frameHits.add(a);
  }
}
function rumble(strong, weak, ms) {
  if (!SET.rumble || !pad.on || !GP.pad) return;
  const va = GP.pad.vibrationActuator;
  if (va && va.playEffect) {
    try {
      const r = va.playEffect("dual-rumble", {
        duration: ms,
        strongMagnitude: Math.min(1, strong * SET.rumble),
        weakMagnitude: Math.min(1, weak * SET.rumble),
      });
      if (r && r.catch) r.catch(() => {});
    } catch (e) {}
  }
}
function padCommon() {
  if (gpDown(GPB.MENU) && playing) {
    if (paused) {
      $("resume").click();
    } else if (locked) {
      try {
        document.exitPointerLock();
      } catch (e) {}
    } else {
      paused = true;
      mouseL = mouseR = false;
      $("pause").hidden = false;
    }
  }
}
/* menu navigation: d-pad or left stick moves focus, A activates, B backs out */
function padMenu(dt) {
  const ov = !$("settings").hidden
    ? $("settings")
    : POST.open
      ? $("post")
      : !$("pause").hidden
        ? $("pause")
        : !$("menu").hidden
          ? $("menu")
          : EXT && EXT.full
            ? $("ctfHud")
            : null;
  if (!ov) return;
  const items = /** @type {El[]} */ ([...ov.querySelectorAll("button,select,input")]).filter(
    el => el.offsetParent !== null && !el.disabled
  );
  if (!items.length) return;
  let i = items.indexOf(/** @type {El} */ (document.activeElement)),
    dir = 0;
  if (gpDown(GPB.DOWN) || gpDown(GPB.RIGHT)) dir = 1;
  if (gpDown(GPB.UP) || gpDown(GPB.LEFT)) dir = -1;
  const vx = GP.ax[0],
    vy = GP.ax[1];
  GP.navT -= dt;
  if (!dir && GP.navT <= 0 && (Math.abs(vy) > 0.6 || Math.abs(vx) > 0.6)) {
    dir = vy > 0.6 || vx > 0.6 ? 1 : -1;
    GP.navT = 0.22;
  }
  if (Math.abs(vy) < 0.3 && Math.abs(vx) < 0.3) GP.navT = 0;
  if (dir) {
    i = i < 0 ? 0 : (i + dir + items.length) % items.length;
    items[i].focus();
  }
  if (gpDown(GPB.A)) {
    const el = i >= 0 ? items[i] : items[0];
    el.focus();
    if (el.tagName === "SELECT") {
      el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
      el.dispatchEvent(new Event("change"));
    } else if (el.type === "checkbox") {
      el.checked = !el.checked;
      el.dispatchEvent(new Event("change"));
    } else if (el.tagName !== "INPUT") el.click();
  }
  if (gpDown(GPB.B)) {
    if (ov.id === "settings") {
      if (!SUI.padCap) closeSettings();
    } else if (ov.id === "pause") $("resume").click();
    else if (ov.id === "ctfHud") {
      const x = $("cExit");
      if (x) x.click();
    }
  }
}
