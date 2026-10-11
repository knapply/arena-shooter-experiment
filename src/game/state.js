/* ============ game state ============ */
let EXT = null;
const me = new Body();
let myName = "Pilot",
  playing = false,
  paused = false,
  now = 0;
let kills = 0,
  deaths = 0,
  mag = 32,
  reloadT = 0,
  fireCD = 0,
  myPeer = null,
  killedBy = "",
  respawnAt = 0,
  lastFireT = -9;
const RELOAD_TIME = 1.8;
/* you, as a pilot: same id scheme as everyone else; name and score read through to the live values */
const mePilot = addPilot(new Pilot({ id: "local", ctl: "local", body: me, rig: false }));
Object.defineProperties(mePilot, {
  name: { get: () => myName },
  color: { get: () => myColor },
  k: { get: () => kills },
  d: { get: () => deaths },
});
const hitsOut = [];
let hitSeq = 0;
const fxOut = [];
let fxSeq = 0;
let dth = null;
let deathSeq = 0;
/** @type {Map<string, any>} */
const remotes = new Map();
let bots = [];
let botsOn = true;
const feed = [];

function spawnPoint() {
  const occupied = [
    ...bots.filter(b => !b.body.dead).map(b => b.body.pos),
    ...[...remotes.values()].filter(r => r.has && r.rig).map(r => r.rig.root.position),
  ];
  let best = null,
    bd = -1;
  for (let i = 0; i < 6; i++) {
    const s = SPAWNS[(Math.random() * SPAWNS.length) | 0];
    let md = 999;
    for (const o of occupied) md = Math.min(md, Math.hypot(o.x - s[0], o.z - s[2]));
    if (md > bd) {
      bd = md;
      best = s;
    }
  }
  return best;
}
function spawn(b) {
  const s = spawnPoint();
  b.reset();
  b.pos.set(s[0] + rnd(-1, 1), s[1] + 0.01, s[2] + rnd(-1, 1));
  b.yaw = Math.atan2(b.pos.x, b.pos.z);
  b.pitch = 0;
  b.spawnT = now;
}

/* bots */
const BOT_NAMES = ["Drone-04", "Drone-11", "Drone-27"];
const BOT_COLORS = ["#8b9aa3", "#a0a8ad", "#7f8f99"];
function makeBots() {
  bots.forEach(b => b.dispose());
  bots = [];
  if (!botsOn) return;
  for (let i = 0; i < 3; i++) {
    const p = addPilot(new Pilot({ id: "bot:" + i, name: BOT_NAMES[i], color: BOT_COLORS[i], ctl: "ai" }));
    const b = Object.assign(p, {
      wp: null,
      fireCD: 0,
      think: 0,
      strafe: 1,
      respawn: 0,
      burst: 0,
      mag: 24,
      reloadT: 0,
      firedT: -9,
    });
    spawn(b.body);
    b.rig.setLabel(b.name, "practice drone");
    bots.push(b);
  }
}
function losTo(a, b) {
  const d = b.clone().sub(a);
  const L = d.length();
  d.normalize();
  return rayWorld(a, d, L) >= L - 0.05;
}
function botStep(b, dt) {
  const B = b.body;
  if (B.dead) {
    if (now > b.respawn) {
      spawn(B);
      b.rig.revive();
      b.mag = 24;
      b.reloadT = 0;
    }
    return;
  }
  const eye = B.pos.clone().add(new V3(0, 1.55, 0));
  const myEye = me.pos.clone().add(new V3(0, me.h - 0.2, 0));
  const dist = eye.distanceTo(myEye);
  const sees = playing && !me.dead && !paused && dist < 45 && losTo(eye, myEye);
  const inp = {
    f: 0,
    s: 0,
    sprint: false,
    thrust: false,
    crouch: false,
    crouchP: false,
    jumpP: false,
    aim: false,
    meleeP: false,
  };
  b.think -= dt;
  b.reloadT = Math.max(0, b.reloadT - dt);
  if (b.reloadT === 0 && b.mag === 0) b.mag = 24;
  if (sees) {
    const want = Math.atan2(-(myEye.x - eye.x), -(myEye.z - eye.z));
    let dy = want - B.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    B.yaw += clamp(dy, -4 * dt, 4 * dt);
    B.pitch = Math.atan2(myEye.y - eye.y, Math.hypot(myEye.x - eye.x, myEye.z - eye.z));
    if (b.think < 0) {
      b.think = rnd(0.5, 1.4);
      b.strafe = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.18) inp.thrust = true;
      if (Math.random() < 0.15) inp.jumpP = true;
    }
    inp.s = b.strafe;
    inp.f = dist > 16 ? 0.8 : dist < 7 ? -0.6 : 0;
    b.fireCD -= dt;
    if (Math.abs(dy) < 0.25 && b.fireCD <= 0 && b.reloadT <= 0) {
      b.fireCD = 0.16;
      b.burst++;
      b.mag--;
      b.firedT = now;
      if (b.burst > 7) {
        b.burst = 0;
        b.fireCD = 0.9;
      }
      if (b.mag <= 0) {
        b.reloadT = RELOAD_TIME;
        b.fireCD = RELOAD_TIME;
        b.mag = 0;
      }
      const d = B.aimDir();
      d.x += rnd(-0.055, 0.055);
      d.y += rnd(-0.045, 0.045);
      d.z += rnd(-0.055, 0.055);
      d.normalize();
      const wt = rayWorld(eye, d, 80);
      const hit = rayTarget(eye, d, me.pos, me.h, wt);
      const end = eye.clone().addScaledVector(d, hit ? hit.t : Math.min(wt, 60));
      tracer(eye.clone().add(new V3(0.1, -0.3, 0)), end, 0xc9d3d8);
      sfx("shot", Math.max(0.1, 0.6 - dist / 80));
      if (hit) hurtMe(hit.head ? 10 : 6, { bot: b, w: "rifle" });
      else if (wt < 60) spark(end);
    }
  } else {
    if (!b.wp || B.pos.distanceTo(b.wp) < 2 || b.think < -6) {
      const s = SPAWNS[(Math.random() * SPAWNS.length) | 0];
      b.wp = new V3(s[0] + rnd(-4, 4), s[1], s[2] + rnd(-4, 4));
      b.think = 0;
    }
    const want = Math.atan2(-(b.wp.x - B.pos.x), -(b.wp.z - B.pos.z));
    let dy = want - B.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    B.yaw += clamp(dy, -3 * dt, 3 * dt);
    B.pitch *= 0.9;
    inp.f = 1;
    inp.sprint = Math.abs(dy) < 0.3 && b.reloadT <= 0;
    if (B.vel.lengthSq() < 1 && B.ground && Math.random() < 0.05) inp.jumpP = true;
    if (b.mag < 24 && b.reloadT <= 0 && Math.random() < dt * 0.5) {
      b.reloadT = RELOAD_TIME;
      b.mag = 0;
    }
  }
  B.step(dt, inp, (t, d) => {
    if (t === "thrust") {
      thrustPuff(B.pos, d.dir);
      sfx("thrust", distVol(B.pos) * 0.5);
    } else if (t === "land" && d.vy > 9) dust(B.pos, 6, 2, 0.4);
  });
  B.regen(dt, now);
}

/* local damage */
function hurtMe(n, src) {
  if (me.dead || !playing) return;
  if (now < me.spawnT + 1.2) return;
  rumble(Math.min(1, n / 40), Math.min(1, n / 25), 120);
  if (aiming && W().zoom[0] >= 1.5) {
    zoomLvl = 0;
    descoped = true;
    aimLatch = false;
  } else flinch = Math.min(0.06, flinch + n * 0.0016);
  const hadShield = me.shield > 0;
  const died = me.damage(n, now);
  EVENTS.emit("damage", {
    by: src.bot ? src.bot.id : src.peer ? "peer:" + src.peer : src.agent ? src.agent.id : "world",
    victim: "local",
    amount: n,
    weapon: src.w || "rifle",
    head: !!src.hd,
    shieldBroken: hadShield && me.shield <= 0,
  });
  if (hadShield) {
    sflashT = Math.max(sflashT, me.shield <= 0 ? 1 : 0.55);
    sfx(me.shield <= 0 ? "pop" : "shieldhit");
    if (me.shield <= 0) shakeT = Math.max(shakeT, 0.25);
  } else {
    sfx("hurt");
    vigT = 0.35;
  }
  shbHit = 0.12;
  if (died) {
    deaths++;
    streak = 0;
    multi = 0;
    const name = src.bot ? src.bot.name : src.name || "Unknown";
    killedBy = name;
    lastKiller = name;
    if (src.bot) src.bot.k++;
    dth = {
      s: ++deathSeq,
      by: src.peer || null,
      bn: src.bot ? src.bot.name : null,
      w: src.w || "rifle",
      hd: src.hd ? 1 : 0,
      t: Date.now(),
    };
    /* modes with their own rules (CTF) report the kill through their own event */
    if (!EXT)
      EVENTS.emit("kill", {
        killer: src.bot ? src.bot.id : src.peer ? "peer:" + src.peer : src.w === "self" ? "local" : "world",
        killerName: src.w === "self" ? myName : name,
        victim: "local",
        victimName: myName,
        weapon: src.w || "rifle",
        head: !!src.hd,
      });
    respawnAt = now + ((EXT && EXT.respawnDelay) || 3);
    $("dead").hidden = false;
    $("deadBy").textContent = "Taken out by " + name;
    rumble(0.9, 0.6, 260);
    if (EXT && EXT.onPlayerDeath) EXT.onPlayerDeath(src);
  }
}

/* the kill feed is a subscriber; spectator modes keep it quiet */
EVENTS.on("kill", e => {
  if (!/spectate|trailer/.test(e.mode))
    pushFeed(e.killerName, e.victimName, e.killer === "local", e.victim === "local");
});
function pushFeed(a, b, mine, victim) {
  feed.unshift({ a, b, mine, victim, t: now });
  if (feed.length > 5) feed.pop();
  renderFeed();
}
function renderFeed() {
  const el = $("feed");
  el.textContent = "";
  for (const f of feed) {
    const d = document.createElement("div");
    const A = document.createElement("span");
    A.textContent = f.a;
    if (f.mine) A.className = "me";
    const X = document.createElement("span");
    X.className = "x";
    X.textContent = "›";
    const Bn = document.createElement("span");
    Bn.textContent = f.b;
    if (f.victim) Bn.className = "me";
    d.append(A, X, Bn);
    el.appendChild(d);
  }
}
let toastT = 0;
function toast(t) {
  $("toast").textContent = t;
  $("toast").style.opacity = "1";
  toastT = 1.2;
}
let hitmT = 0;
function hitMarker(kind) {
  const h = $("hitm");
  h.className = kind === "kill" ? "kill" : kind === "sh" ? "sh" : "";
  h.style.opacity = "1";
  hitmT = kind === "kill" ? 0.4 : 0.15;
  if (SET.hitSounds) sfx(kind === "sh" ? "hitsh" : "hit");
}
let vigT = 0,
  sflashT = 0,
  shakeT = 0,
  shbHit = 0,
  alarmT = 0,
  rechargeShown = 0;
