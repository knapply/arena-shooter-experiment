/* ============ game state ============
   Your state (the Body "me", name, score, weapon timers), the arena's spawn picking, the practice drones
   (makeBots / botStep: their own simple AI with carbine and magnum), damage to you (hurtMe: shields, the
   melee rule, damage arcs, death), the kill feed and hit markers (hitMarker / hitKind). */
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

/* where fighting happened lately, for spawn safety: hits and kills you saw, and online, every
   player's shots (from the fire bit everyone already sends, so every client knows the same fights) */
const ARENA_FIGHTS = [];
EVENTS.on("kill", e => {
  const p = pilotById(e.victim);
  if (p && p.body) noteFight(ARENA_FIGHTS, p.body.pos, now);
});
EVENTS.on("damage", e => {
  for (const id of [e.victim, e.by]) {
    const p = pilotById(id);
    if (p && p.body) noteFight(ARENA_FIGHTS, p.body.pos, now);
  }
});
/**
 * the safest arena spawn for `self` (a body, or nothing for you): everyone else alive is an enemy
 * (free for all), scored by world/spawns.js
 */
function spawnPoint(self) {
  const foes = [];
  if (self !== me && playing && !me.dead) foes.push(me);
  for (const b of bots) if (b.body !== self && !b.body.dead) foes.push(b.body);
  for (const r of remotes.values())
    if (r.has && !r.dead && r.rig)
      foes.push({ pos: r.rig.root.position, h: r.crouch ? H_CROUCH : H_STAND, yaw: r.rig.root.rotation.y });
  return pickSpawn(SPAWNS, foes, ARENA_FIGHTS, now, Math.random, takenSpots(self));
}
/** where nobody should land or appear: every pilot standing in the arena (but `self`) and every pod on
    its way down or just landed (game/pods.js podSpots) */
function takenSpots(self) {
  const out = podSpots(null);
  if (self !== me && playing && !me.dead) out.push(me.pos);
  for (const b of bots) if (b.body !== self && !b.body.dead) out.push(b.body.pos);
  for (const r of remotes.values()) if (r.has && !r.dead && r.rig) out.push(r.rig.root.position);
  return out;
}
function spawn(b) {
  const s = spawnPoint(b);
  b.reset();
  b.pos.set(s[0] + rnd(-1, 1), s[1] + 0.01, s[2] + rnd(-1, 1));
  b.yaw = Math.atan2(b.pos.x, b.pos.z);
  b.pitch = 0;
  b.spawnT = now;
}

/* bots */
/** the practice drones' skill level (AI_SKILL in data/modes.js) */
let botSkill = "normal";
/* a drone's carbine holds 24 rounds; its magnum is the player's */
const DRONE_MAG = 24;
const droneGun = b => WEAPON_DATA[b.wpn === 1 ? 1 : 0];
const droneCap = w => (w === 1 ? WEAPON_DATA[1].mag : DRONE_MAG);
/** a full load of reserve rounds for each drone gun (the player's numbers) */
const droneRsv = () => [WEAPON_DATA[0].reserve, WEAPON_DATA[1].reserve];
/** a drone's gun has rounds in it or to reload */
const droneHas = (b, w) => b.ammo[w] > 0 || b.rsv[w] > 0;
/** a drone's reload: as many rounds as the magazine takes, from what it carries */
function droneReload(b) {
  const take = Math.min(droneCap(b.wpn) - b.ammo[b.wpn], b.rsv[b.wpn]);
  b.ammo[b.wpn] += take;
  b.rsv[b.wpn] -= take;
}
/** start a drone's reload if it has rounds to load */
function droneStartReload(b) {
  if (b.rsv[b.wpn] <= 0) return false;
  b.reloadT = droneGun(b).reload;
  b.reloading = true;
  return true;
}
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
      /* carbine and magnum, each with its own magazine and reserve */
      wpn: 0,
      ammo: [DRONE_MAG, WEAPON_DATA[1].mag],
      rsv: droneRsv(),
      reloadT: 0,
      reloading: false,
      switchT: 0,
      lastSwitch: -9,
      firedT: -9,
    });
    spawn(b.body);
    b.rig.setLabel(b.name, "practice drone");
    bots.push(b);
  }
}
/* arena pilots are solid to each other: you, the drones and online players */
const ARENA_COL = [];
const arenaColliders = () => ARENA_COL;
function updArenaColliders() {
  ARENA_COL.length = 0;
  if (playing && !me.dead) ARENA_COL.push(me);
  for (const b of bots) if (!b.body.dead) ARENA_COL.push(b.body);
  for (const r of remotes.values())
    if (r.has && !r.dead && r.rig) {
      const c = r.col || (r.col = { pos: r.rig.root.position, h: H_STAND, dead: false });
      c.pos = r.rig.root.position;
      c.h = r.crouch ? H_CROUCH : H_STAND;
      ARENA_COL.push(c);
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
    /* a pod launches POD_EARLY before the respawn time (see data/modes.js); the spot is picked once */
    if (!b.pod && now > b.respawn - (podsOn() ? POD_EARLY : 0)) {
      if (!b.pick || b.pick.for !== b.respawn) {
        const s = spawnPoint(B),
          p = new V3(s[0], s[1] + 0.01, s[2]);
        b.pick = { for: b.respawn, at: p, sky: podsOn() && skyClear(p) };
      }
      const at = b.pick.at;
      const up = () => {
        spawn(B);
        B.pos.copy(at);
        b.rig.revive();
        b.wpn = 0;
        b.ammo[0] = DRONE_MAG;
        b.ammo[1] = WEAPON_DATA[1].mag;
        b.rsv = droneRsv();
        b.reloadT = 0;
        b.reloading = false;
        b.switchT = 0;
      };
      /* drones drop in by pod too (and a pod landing on you takes you out) */
      if (b.pick.sky) {
        b.pick = null;
        b.pod = dropPod(at, b.color, {
          onLand() {
            b.pod = null;
            up();
            if (
              playing &&
              !me.dead &&
              Math.hypot(me.pos.x - at.x, me.pos.z - at.z) < 1.5 &&
              Math.abs(me.pos.y - at.y) < 2.2
            )
              hurtMe(999, { bot: b, w: "pod" });
          },
        });
      } else if (now > b.respawn) {
        b.pick = null;
        up();
      }
    }
    return;
  }
  const S = AI_SKILL[botSkill] || AI_SKILL.normal;
  const eye = B.pos.clone().add(new V3(0, 1.55, 0));
  const myEye = me.pos.clone().add(new V3(0, me.h - 0.2, 0));
  const dist = eye.distanceTo(myEye);
  /* drones notice you the way a player would: in front of them, heard (your gunfire, or sprinting
     and thrusting close by), shooting at them, or seen a moment ago. Then they need line of sight. */
  const ang = Math.abs(
    Math.atan2(
      Math.sin(Math.atan2(-(myEye.x - eye.x), -(myEye.z - eye.z)) - B.yaw),
      Math.cos(Math.atan2(-(myEye.x - eye.x), -(myEye.z - eye.z)) - B.yaw)
    )
  );
  const aware =
    ang < 1.1 ||
    (now - lastFireT < 1 && dist < 30) ||
    (dist < 7 && (me.sprint || me.thrustT > 0)) ||
    now - (b.hurtT || -9) < 2 ||
    now - (b.seenT || -9) < 1.5;
  const sees = playing && !me.dead && !paused && dist < S.sight * 0.6 && aware && losTo(eye, myEye);
  /* a fresh sighting takes their reaction time before they open fire */
  if (sees && now - (b.seenT || -9) > 1.5) b.acqT = now + S.react;
  if (sees) b.seenT = now;
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
  if (b.reloadT === 0 && b.reloading) {
    b.reloading = false;
    droneReload(b);
  }
  b.switchT = Math.max(0, b.switchT - dt);
  if (sees && b.switchT <= 0) {
    /* carbine up close and to break shields; magnum at range and to finish you once your shields
       are down; switching beats reloading when a magazine runs dry */
    const o = 1 - b.wpn;
    let w = b.wpn;
    if (b.ammo[b.wpn] <= 0)
      w = (b.ammo[o] > 0 || !droneHas(b, b.wpn)) && droneHas(b, o) && dist > 3 ? o : b.wpn;
    else if (me.shield <= 0 && dist > 8) w = 1;
    else if (dist >= S.magFrom) w = 1;
    else if (dist <= S.magFrom - 6) w = 0;
    if (w !== b.wpn && (now - b.lastSwitch > 0.8 || b.ammo[b.wpn] <= 0)) {
      b.wpn = w;
      b.reloadT = 0;
      b.reloading = false;
      b.switchT = SWITCH_TIME;
      b.lastSwitch = now;
      b.burst = 0;
    }
  }
  /* an empty magazine reloads from the reserve (a drone with nothing left in either gun can't shoot) */
  if (b.ammo[b.wpn] <= 0 && b.reloadT <= 0 && b.switchT <= 0) droneStartReload(b);
  if (sees) {
    const want = Math.atan2(-(myEye.x - eye.x), -(myEye.z - eye.z));
    let dy = want - B.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const tr = (4 * S.turn) / 7;
    B.yaw += clamp(dy, -tr * dt, tr * dt);
    B.pitch = Math.atan2(myEye.y - eye.y, Math.hypot(myEye.x - eye.x, myEye.z - eye.z));
    if (b.think < 0) {
      b.think = rnd(0.5, 1.4);
      b.strafe = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.18 * S.dodge) inp.thrust = true;
      if (Math.random() < 0.15 * S.dodge) inp.jumpP = true;
    }
    inp.s = b.strafe;
    inp.f = dist > 16 ? 0.8 : dist < 7 ? -0.6 : 0;
    b.fireCD -= dt;
    const M = b.wpn === 1,
      Wd = droneGun(b);
    if (
      Math.abs(dy) < (M ? 0.12 : 0.25) &&
      b.fireCD <= 0 &&
      b.reloadT <= 0 &&
      b.switchT <= 0 &&
      b.ammo[b.wpn] > 0 &&
      now >= (b.acqT || 0)
    ) {
      if (M) b.fireCD = Wd.rate + S.magPace + 0.12;
      else {
        b.fireCD = 0.16;
        b.burst++;
        if (b.burst > 7) {
          b.burst = 0;
          b.fireCD = 0.9;
        }
      }
      b.ammo[b.wpn]--;
      b.firedT = now;
      B.spawnT = -1e9; /* firing ends spawn protection */
      EVENTS.emit("shot", { pilot: b.id, weapon: Wd.dmg });
      if (b.ammo[b.wpn] <= 0 && droneStartReload(b)) b.fireCD = Wd.reload;
      /* aim error scales with skill (normal is the drones' classic spray); the magnum's with magErr */
      const sp = (S.err / 0.035) * (M ? S.magErr : 1);
      const d = B.aimDir();
      d.x += rnd(-0.055, 0.055) * sp;
      d.y += rnd(-0.045, 0.045) * sp;
      d.z += rnd(-0.055, 0.055) * sp;
      d.normalize();
      const wt = rayWorld(eye, d, 80);
      const hit = rayTarget(eye, d, me.pos, me.h, wt);
      const end = eye.clone().addScaledVector(d, hit ? hit.t : Math.min(wt, 60));
      tracer(eye.clone().add(new V3(0.1, -0.3, 0)), end, 0xc9d3d8);
      sfx(Wd.snd, Math.max(0.1, 0.6 - dist / 80));
      /* the drone carbine is a practice gun (6 body, 10 head); the magnum hits like yours */
      if (hit)
        hurtMe(M ? (hit.head && me.shield <= 0 ? Wd.head : Wd.body) : hit.head ? 10 : 6, {
          bot: b,
          w: Wd.dmg,
          hd: hit.head,
        });
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
    if (b.ammo[b.wpn] < droneCap(b.wpn) && b.reloadT <= 0 && Math.random() < dt * 0.5) droneStartReload(b);
  }
  B.step(dt, inp, (t, d) => {
    if (t === "thrust") {
      thrustPuff(B.pos, d.dir);
      sfxAt("thrust", B.pos, 45, 0.8);
    } else if (t === "land" && d.vy > 9) dust(B.pos, 6, 2, 0.4);
  });
  B.regen(dt, now);
}

/* local damage */
function hurtMe(n, src) {
  if (me.dead || !playing || godMode) return;
  if (now < me.spawnT + 1.2) return;
  /* the melee rule, decided here too so hits from other players and the AI follow it */
  if (src.w === "melee") {
    const a = hitSource(src);
    const behind = n >= MELEE_KILL || (!!a && meleeBehind(a.x, a.z, me.pos.x, me.pos.z, me.yaw));
    n = meleeDamage(me.shield, behind);
  }
  rumble(Math.min(1, n / 40), Math.min(1, n / 25), 120);
  /* a hit knocks you out of any scope (hold aim again to come back in); at the hip it only nudges the aim */
  if (aiming) {
    zoomLvl = 0;
    descoped = true;
    aimLatch = false;
  } else flinch = Math.min(0.06, flinch + n * 0.0016);
  const hadShield = me.shield > 0;
  const died = me.damage(n, now);
  EVENTS.emit("damage", {
    by: src.bot ? src.bot.id : src.peer ? "peer:" + src.peer : src.agent ? pidOf(src.agent) : "world",
    victim: "local",
    amount: n,
    weapon: src.w || "rifle",
    head: !!src.hd,
    shieldBroken: hadShield && me.shield <= 0,
  });
  damageArc(src, hadShield);
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
    /* your weapon and grenades fall where you died */
    if (EXT && EXT.dropItems) EXT.dropItems(myLoadoutDrop(), me.pos);
    else if (!EXT) dropItems(myLoadoutDrop(), me.pos);
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
    respawnAt = now + ((EXT && EXT.respawnDelay) || MODE_DATA.ffa.respawn);
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
/** your hit landed: kind is "kill", "brk" (broke their shield), "head" (a headshot that counts),
    "sh" (shield) or "" (hull); each has its own marker and sound */
const HITM = {
  kill: { cls: "kill", t: 0.4, snd: "hitkill" },
  brk: { cls: "brk", t: 0.3, snd: "hitbrk" },
  head: { cls: "head", t: 0.25, snd: "hithead" },
  sh: { cls: "sh", t: 0.15, snd: "hitsh" },
  "": { cls: "", t: 0.15, snd: "hit" },
};
function hitMarker(kind) {
  const m = HITM[kind] || HITM[""];
  const h = $("hitm");
  h.className = m.cls;
  h.style.opacity = "1";
  hitmT = m.t;
  if (SET.hitSounds) sfx(m.snd);
}
/** which marker a hit earns, from the target's shield before and after */
function hitKind(died, had, after, head) {
  return died ? "kill" : had && after <= 0 ? "brk" : head && !had ? "head" : had ? "sh" : "";
}
let vigT = 0,
  sflashT = 0,
  shakeT = 0,
  shbHit = 0,
  alarmT = 0,
  rechargeShown = 0;
