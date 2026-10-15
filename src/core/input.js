/* ============ input ============ */
const pad = { aim: false, fire: false, on: false };
let wheelT = 0;
/* physical inputs (keys, mouse buttons, wheel) map to actions through the player's bindings */
const codesDown = new Set(),
  virtHeld = new Set();
let hitActs = new Set(),
  frameHits = new Set(),
  rebindCapture = null,
  mdx = 0,
  mdy = 0,
  aimLatch = false,
  crouchLatch = false,
  sprintLatch = false,
  /* seconds left in which the trigger keeps you out of a sprint (see the game loop's sprint input) */
  fireNoSprint = 0;
/** when the keyboard or mouse was last used (performance.now ms): the HUD's hints follow the device in use */
let keysT = 0;
function A(a) {
  const b = BIND[a];
  if (b) for (const c of b) if (codesDown.has(c)) return true;
  return virtHeld.has(a);
}
const P = a => frameHits.has(a);
function pressCode(c) {
  const acts = CODE2ACT.get(c);
  if (!acts) return false;
  for (const a of acts) if (!A(a)) hitActs.add(a);
  codesDown.add(c);
  return true;
}
addEventListener(
  "wheel",
  e => {
    if (rebindCapture) {
      rebindCapture(e.deltaY < 0 ? "WheelUp" : "WheelDown", e);
      return;
    }
    if (!playing || paused || me.dead) return;
    const t = performance.now();
    if (t - wheelT < 160) return;
    wheelT = t;
    const c = e.deltaY < 0 ? "WheelUp" : "WheelDown";
    pressCode(c);
    codesDown.delete(c);
  },
  { passive: true }
);
addEventListener("blur", () => codesDown.clear());
let mouseL = false,
  mouseR = false,
  aiming = false,
  recoil = 0,
  bloom = 0,
  flashT = 0,
  locked = false,
  lockFailed = false;
const touch = { f: 0, s: 0, fire: false, aim: false, crouch: false, sprint: false, sprintStick: false };
addEventListener("keydown", e => {
  if (rebindCapture) {
    rebindCapture(e.code, e);
    return;
  }
  const tg = /** @type {HTMLElement} */ (e.target).tagName;
  if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
  if (e.repeat) {
    if (CODE2ACT.has(e.code) && playing) e.preventDefault();
    return;
  }
  keysT = performance.now();
  if (e.code === "Escape" && playing && !locked && !paused && $("settings").hidden) {
    paused = true;
    $("pause").hidden = false;
    return;
  }
  if (pressCode(e.code) && playing) e.preventDefault();
});
addEventListener("keyup", e => codesDown.delete(e.code));
canvas.addEventListener("mousedown", e => {
  if (!playing || isTouch) return;
  keysT = performance.now();
  /* not captured: every click asks again. A refused capture (the browser won't re-lock for about a
     second after Esc, or an embedded view blocks it) leaves look following the cursor only until a
     capture succeeds; it used to stay that way for the rest of the match, with the cursor stuck at
     the window edge */
  if (!locked) {
    const first = !lockFailed;
    lock();
    if (first) return;
  }
  pressCode("Mouse" + e.button);
});
addEventListener("mouseup", e => codesDown.delete("Mouse" + e.button));
addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("pointerlockerror", () => {
  lockFailed = true;
  toast("Mouse capture blocked · click again to capture it");
});
addEventListener("mousemove", e => {
  if (!playing || paused || isTouch || (!locked && !lockFailed)) return;
  const s = 0.0022 * SET.sens * lookSens(SET.adsSens);
  mdx += e.movementX * s;
  mdy += e.movementY * s * (SET.invertY ? -1 : 1);
});
function lock() {
  const plain = () => {
    try {
      const q = canvas.requestPointerLock();
      if (q && q.catch)
        q.catch(() => {
          lockFailed = true;
        });
    } catch (e) {
      lockFailed = true;
    }
  };
  try {
    const p = canvas.requestPointerLock(SET.rawInput ? { unadjustedMovement: true } : undefined);
    if (p && p.catch)
      p.catch(err => {
        if (SET.rawInput && err && err.name === "NotSupportedError") plain();
        else lockFailed = true;
      });
  } catch (e) {
    plain();
  }
}
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  if (locked) lockFailed = false;
  if (!locked && playing && !isTouch) {
    paused = true;
    $("pause").hidden = false;
    codesDown.clear();
  } else {
    paused = false;
    $("pause").hidden = true;
  }
});
$("resume").onclick = () => {
  if (!padRecent()) lock();
  paused = false;
  $("pause").hidden = true;
};
$("leave").onclick = () => leaveGame();

if (isTouch) {
  const stick = $("stick"),
    knob = $("knob");
  let sid = null,
    lookId = null,
    lx = 0,
    ly = 0;
  stick.addEventListener("pointerdown", e => {
    sid = e.pointerId;
    stick.setPointerCapture(sid);
    mv(e);
  });
  stick.addEventListener("pointermove", e => {
    if (e.pointerId === sid) mv(e);
  });
  const end = e => {
    if (e.pointerId === sid) {
      sid = null;
      touch.f = touch.s = 0;
      touch.sprintStick = false;
      knob.style.transform = "";
    }
  };
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
  function mv(e) {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2),
      y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const L = Math.hypot(x, y);
    if (L > 1) {
      x /= L;
      y /= L;
    }
    knob.style.transform = `translate(${x * 41}px,${y * 41}px)`;
    touch.s = x;
    touch.f = -y;
    touch.sprintStick = L > 0.92 && -y > 0.6;
  }
  canvas.addEventListener("pointerdown", e => {
    if (lookId === null && e.clientX > innerWidth * 0.35) {
      lookId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    }
  });
  addEventListener("pointermove", e => {
    if (e.pointerId !== lookId) return;
    const s = aiming ? 0.0035 : 0.006;
    me.yaw -= (e.clientX - lx) * s;
    me.pitch = clamp(me.pitch - (e.clientY - ly) * s, -1.5, 1.5);
    lx = e.clientX;
    ly = e.clientY;
  });
  addEventListener("pointerup", e => {
    if (e.pointerId === lookId) lookId = null;
  });
  addEventListener("pointercancel", e => {
    if (e.pointerId === lookId) lookId = null;
  });
  const btn = (id, down, up) => {
    const el = $(id);
    el.addEventListener("pointerdown", e => {
      e.preventDefault();
      el.classList.add("dn");
      down();
    });
    const u = () => {
      el.classList.remove("dn");
      if (up) up();
    };
    el.addEventListener("pointerup", u);
    el.addEventListener("pointercancel", u);
    el.addEventListener("pointerleave", u);
  };
  btn(
    "tFire",
    () => (touch.fire = true),
    () => (touch.fire = false)
  );
  btn(
    "tAim",
    () => (touch.aim = true),
    () => (touch.aim = false)
  );
  btn(
    "tCrouch",
    () => {
      touch.crouch = true;
      hitActs.add("crouch");
    },
    () => (touch.crouch = false)
  );
  btn("tJump", () => hitActs.add("jump"));
  btn("tThrust", () => hitActs.add("thrust"));
  btn("tMelee", () => hitActs.add("melee"));
  btn("tReload", () => hitActs.add("reload"));
  btn("tSprint", () => (touch.sprint = !touch.sprint));
  $("tscore").onclick = () => {
    $("scores").hidden = !$("scores").hidden;
    renderScores();
  };
}
