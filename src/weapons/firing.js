/* ============ outgoing combat ============ */
function targets() {
  if (EXT && EXT.targets) return EXT.targets();
  const t = [];
  for (const b of bots) if (!b.body.dead) t.push({ kind: "bot", ref: b, pos: b.body.pos, h: b.body.h });
  for (const [peer, r] of remotes)
    if (r.has && !r.dead && r.rig)
      t.push({ kind: "peer", ref: r, peer, pos: r.rig.root.position, h: r.crouch ? H_CROUCH : H_STAND });
  return t;
}
const HEAVY = new Set(["sniper", "scatter", "charge", "frag", "stick", "pound"]);
const hitPower = w => (HEAVY.has(w) ? 2 : 1);
function dealDamage(t, n, type, head) {
  if (t.kind === "ext") {
    const r = t.ref.onHit(n, type, head);
    hitMarker(r.died ? "kill" : r.brk ? "brk" : head && !r.sh ? "head" : r.sh ? "sh" : "");
    if (r.died) kills++; /* the mode emits the kill event (and with it the medals) */
    return;
  }
  if (t.kind === "bot") {
    const b = t.ref;
    const had = b.body.shield > 0;
    const died = b.body.damage(n, now);
    EVENTS.emit("damage", {
      by: "local",
      victim: b.id,
      amount: n,
      weapon: type,
      head: !!head,
      shieldBroken: had && b.body.shield <= 0,
    });
    const kind = hitKind(died, had, b.body.shield, head);
    hitMarker(kind);
    b.hurtT = now;
    if (!died) b.rig.flashHit(camera.position, kind);
    if (died) {
      kills++;
      b.d++;
      b.respawn = now + 3;
      /* drones drop the gun in their hands, and sometimes a grenade */
      const gun = { type: b.wpn === 1 ? 1 : 0, ammo: [WEAPON_DATA[b.wpn === 1 ? 1 : 0].mag, Infinity] };
      dropItems(
        Math.random() < 0.5 ? [gun, { type: -1, nades: { frag: 1, plasma: 0 } }] : [gun],
        b.body.pos,
        false
      );
      b.rig.die(camera.position, hitPower(type));
      spark(b.body.pos.clone().add(new V3(0, 1.1, 0)), 14);
      EVENTS.emit("kill", {
        killer: "local",
        killerName: myName,
        victim: b.id,
        victimName: b.name,
        weapon: type,
        head: !!head,
      });
    }
  } else {
    const r = t.ref;
    hitsOut.push({ s: ++hitSeq, t: t.peer, d: n, w: type, hd: head ? 1 : 0, at: Date.now() });
    while (hitsOut.length > 12) hitsOut.shift();
    const kind = hitKind(false, r.sh > 0, r.sh - n, head);
    hitMarker(kind);
    r.rig.flashHit(camera.position, kind);
  }
}
function emitFx(k, a, b, g) {
  if (EXT && EXT.onFx) EXT.onFx(k, a, b, g);
  fxOut.push({ s: ++fxSeq, k, a, b, g });
  while (fxOut.length > 6) fxOut.shift();
}
function v3a(v) {
  return [r2(v.x), r2(v.y), r2(v.z)];
}

/* ---- Perfect kills: the weapon's minimum shots, every shot on target, with a precision weapon ---- */
const engage = new Map();
/** the last hitscan shot fired by you */
const SHOT = { o: new V3(), d: new V3(), t: -9 };
function targetId(t) {
  return t.kind === "bot" ? t.ref.id : t.kind === "peer" ? "peer:" + t.peer : pidOf(t.ref);
}
/** count one shot: a hit adds to that target's run, a miss spoils every run in progress */
function engageShot(id) {
  if (!id) {
    for (const r of engage.values()) r.miss = true;
    return;
  }
  let r = engage.get(id);
  if (!r || r.w !== wi || now - r.last > 4) engage.set(id, (r = { w: wi, hits: 0, miss: false, last: now }));
  r.hits++;
  r.last = now;
}
/** called when you kill someone: was it perfect? (clears that target's run either way) */
function perfectKill(id) {
  const r = engage.get(id);
  engage.delete(id);
  if (!r || r.miss) return false;
  const w = WEAPONS[r.w];
  return !!w.precision && !w.headAlways && r.hits === killStats(w).best.shots;
}
/** rounds left in the burst in progress (burst weapons fire the rest without the trigger) */
let burstLeft = 0;
/** this frame's length (set by the loop): a shot is "on time" if the gun became ready this frame */
let fireStep = 1 / 60;
function fire(src) {
  if (reloadT > 0) return;
  if (mag <= 0) {
    burstLeft = 0;
    startReload();
    return;
  }
  mag--;
  ammo[wi] = mag;
  const Wd = W();
  /* a shot fired the frame the gun became ready keeps the cadence exact: the part of the frame
     it was late by comes off the next interval, so a held trigger fires at the weapon's real rate
     at any frame rate (resetting made a 0.1 s carbine fire 7.5 rounds a second at 30 fps and under
     9 at 60). A shot after a pause starts a fresh interval, so pausing never banks time */
  const late = fireCD > -fireStep ? fireCD : 0;
  fireCD = late + Wd.rate;
  /* a burst: the rounds inside it come at its gap, and the next burst starts `rate` after this one */
  if (Wd.burst) {
    burstLeft = burstLeft > 0 ? burstLeft - 1 : Wd.burst - 1;
    fireCD = late + (burstLeft > 0 ? Wd.burstGap : Wd.rate - (Wd.burst - 1) * Wd.burstGap);
  } else burstLeft = 0;
  lastFireT = now;
  /* firing ends spawn protection */
  if (!src) {
    me.spawnT = -1e9;
    EVENTS.emit("shot", { pilot: "local", weapon: Wd.dmg });
  }
  semiLatch = true;
  const o = src ? src.o : camera.getWorldPosition(new V3());
  const d = new V3();
  if (src) d.copy(src.d);
  else camera.getWorldDirection(d);
  /* precision weapons go exactly where the reticle is; automatics keep spread and bloom; pellet
     weapons spread every pellet over their cone */
  let spread = 0;
  if (!Wd.precision) {
    const moving = Math.hypot(me.vel.x, me.vel.z) > 1;
    spread = (aiming ? Wd.adsSpread : Wd.spread) + (moving ? 0.006 : 0) + (me.ground ? 0 : 0.008);
    spread += bloom;
    bloom = Math.min(0.03, bloom + Wd.bloom);
    if (!Wd.pellets) {
      d.x += rnd(-spread, spread);
      d.y += rnd(-spread, spread);
      d.z += rnd(-spread, spread);
    }
  }
  d.normalize();
  /* projectile weapons (the rocket launcher) launch from the muzzle toward the reticle */
  if (Wd.projectile) {
    fireRocket(o, d, src ? src.muzzle : VMW[wi].g.localToWorld(Wd.muzzle.clone()));
    sfx(Wd.snd);
    rumble(Wd.rum[0], Wd.rum[1], Wd.rum[2]);
    recoil += Wd.recoil;
    flashT = 0.08;
    vmS.kick = 1;
    shakeT = Math.max(shakeT, 0.12);
    if (mag === 0) startReload();
    return;
  }
  /* the exact ray of this shot, for online hit claims (the host re-checks it: lag compensation) */
  SHOT.o.copy(o);
  SHOT.d.copy(d);
  SHOT.t = now;
  const R = Wd.range || 120,
    muzzle = src ? src.muzzle : VMW[wi].g.localToWorld(Wd.muzzle.clone()),
    col = wi === 2 ? 0x9fd8ff : Wd.key === "beam" ? 0xb98aff : 0xffd28a,
    /** damage per target over every pellet of this shot (one hit marker each) */
    dealt = new Map();
  let anyHit = null;
  for (let p = 0; p < (Wd.pellets || 1); p++) {
    const pd = Wd.pellets ? d.clone() : d;
    if (Wd.pellets) {
      pd.x += rnd(-spread, spread);
      pd.y += rnd(-spread, spread);
      pd.z += rnd(-spread, spread);
      pd.normalize();
    }
    const wh = rayWorldHit(o, pd, R),
      wt = wh.t;
    let best = null;
    for (const t of targets()) {
      const h = rayTarget(o, pd, t.pos, t.h, wt);
      if (h && (!best || h.t < best.h.t)) best = { t, h };
    }
    const end = o.clone().addScaledVector(pd, best ? best.h.t : Math.min(wt, R));
    if (p < 5) tracer(muzzle, end, col, wi === 2 ? 0.6 : 0.1);
    if (best) {
      const shielded = best.t.ref.body ? best.t.ref.body.shield > 0 : best.t.ref.sh > 0;
      const hd = best.h.head && (Wd.headAlways || !shielded);
      const n = (hd ? Wd.head : Wd.body) * falloffAt(Wd, best.h.t);
      const e = dealt.get(best.t) || { n: 0, hd: false };
      e.n += n;
      e.hd = e.hd || hd;
      dealt.set(best.t, e);
      anyHit = best.t;
      spark(end, 2, shielded ? 0xffd36b : 0xff7a6a);
    } else if (wt < R) {
      spark(end);
      if (wh.b) damageBox(wh.b, Math.min(Wd.body, 40) * 0.6, end, "bullet", true);
    }
    if (p === 0) emitFx("shot", v3a(muzzle), v3a(end));
  }
  engageShot(anyHit ? targetId(anyHit) : null);
  for (const [t, e] of dealt) dealDamage(t, Math.max(1, Math.round(e.n)), Wd.dmg, e.hd);
  sfx(Wd.snd);
  rumble(Wd.rum[0], Wd.rum[1], Wd.rum[2]);
  recoil += Wd.recoil;
  flashT = 0.05;
  vmS.kick = 1;
  if (mag === 0) startReload();
}
function startReload() {
  if (reloadT > 0 || mag >= W().mag || switchT > 0 || reserve[wi] <= 0) return;
  reloadT = W().reload;
  zoomLvl = 0;
}
function meleeHit(range, dmg, type) {
  me.spawnT = -1e9; /* attacking ends spawn protection */
  const f = me.fwd();
  let best = null,
    bd = range;
  for (const t of targets()) {
    const dx = t.pos.x - me.pos.x,
      dz = t.pos.z - me.pos.z,
      dy = t.pos.y - me.pos.y;
    const dist = Math.hypot(dx, dz);
    if (Math.abs(dy) > 1.6) continue;
    if (dist < bd && (dx * f.x + dz * f.z) / Math.max(dist, 0.01) > 0.55) {
      bd = dist;
      best = t;
    }
  }
  if (best) {
    const r = best.ref,
      tsh = r.body ? r.body.shield : r.sh || 0;
    let n = type === "charge" && tsh <= 0 ? 999 : dmg;
    if (type === "melee") {
      /* the melee rule (data/weapons.js): from behind kills, otherwise shield first, then the kill */
      const yaw = r.body ? r.body.yaw : r.rig ? r.rig.root.rotation.y : 0;
      n = meleeDamage(tsh, meleeBehind(me.pos.x, me.pos.z, best.pos.x, best.pos.z, yaw));
    }
    dealDamage(best, n, type, false);
    /* the impact: a thud on armor, a crack if the shield broke, heavier for the kill from behind */
    let fl = type === "charge" ? MFX.CHARGE : 0;
    if (tsh > 0 && n >= tsh) fl |= MFX.CRACK;
    if (type === "melee" && n >= MELEE_KILL) fl |= MFX.HEAVY;
    meleeLand(meleeContact(me.pos, best.pos, _mlp), f, fl);
    return true;
  }
  /* nobody in reach: a swing that meets a wall, cover or the floor clanks off it */
  if (type === "melee" && meleeWorldHit(me, 2, _mlp, _mld)) meleeLand(_mlp, _mld, MFX.WORLD);
  return false;
}
const _mlp = new V3(),
  _mld = new V3();
function slamDamage(p) {
  for (const t of targets()) {
    const dd = t.pos.distanceTo(p);
    if (dd < 5) dealDamage(t, Math.round(120 - dd * 18), "pound", false);
  }
}
