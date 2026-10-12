/* ============ outgoing combat ============ */
function targets() {
  if (EXT && EXT.targets) return EXT.targets();
  const t = [];
  if (demo) {
    for (const d of dummies)
      if (d.active && !d.body.dead) t.push({ kind: "bot", ref: d, pos: d.body.pos, h: d.body.h });
    return t;
  }
  for (const b of bots) if (!b.body.dead) t.push({ kind: "bot", ref: b, pos: b.body.pos, h: b.body.h });
  for (const [peer, r] of remotes)
    if (r.has && !r.dead && r.rig)
      t.push({ kind: "peer", ref: r, peer, pos: r.rig.root.position, h: r.crouch ? H_CROUCH : H_STAND });
  return t;
}
const HEAVY = new Set(["sniper", "charge", "frag", "stick", "pound"]);
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
function fire(src) {
  if (reloadT > 0) return;
  if (mag <= 0) {
    startReload();
    return;
  }
  mag--;
  ammo[wi] = mag;
  fireCD = W().rate;
  lastFireT = now;
  /* firing ends spawn protection */
  if (!src) {
    me.spawnT = -1e9;
    EVENTS.emit("shot", { pilot: "local", weapon: W().dmg });
  }
  semiLatch = true;
  const o = src ? src.o : camera.getWorldPosition(new V3());
  const d = new V3();
  if (src) d.copy(src.d);
  else camera.getWorldDirection(d);
  /* precision weapons go exactly where the reticle is; automatics keep spread and bloom */
  if (!W().precision) {
    const moving = Math.hypot(me.vel.x, me.vel.z) > 1;
    let spread = (aiming ? W().adsSpread : W().spread) + (moving ? 0.006 : 0) + (me.ground ? 0 : 0.008);
    spread += bloom;
    bloom = Math.min(0.03, bloom + W().bloom);
    d.x += rnd(-spread, spread);
    d.y += rnd(-spread, spread);
    d.z += rnd(-spread, spread);
  }
  d.normalize();
  /* projectile weapons (the rocket launcher) launch from the muzzle toward the reticle */
  if (W().projectile) {
    fireRocket(o, d, src ? src.muzzle : VMW[wi].g.localToWorld(W().muzzle.clone()));
    sfx(W().snd);
    rumble(W().rum[0], W().rum[1], W().rum[2]);
    recoil += W().recoil;
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
  const wh = rayWorldHit(o, d, 120),
    wt = wh.t;
  let best = null;
  for (const t of targets()) {
    const h = rayTarget(o, d, t.pos, t.h, wt);
    if (h && (!best || h.t < best.h.t)) best = { t, h };
  }
  const end = o.clone().addScaledVector(d, best ? best.h.t : Math.min(wt, 120));
  const muzzle = src ? src.muzzle : VMW[wi].g.localToWorld(W().muzzle.clone());
  tracer(muzzle, end, wi === 2 ? 0x9fd8ff : 0xffd28a, wi === 2 ? 0.6 : 0.1);
  engageShot(best ? targetId(best.t) : null);
  if (best) {
    const shielded = best.t.ref.body ? best.t.ref.body.shield > 0 : best.t.ref.sh > 0;
    const hd = best.h.head && (W().headAlways || !shielded);
    dealDamage(best.t, hd ? W().head : W().body, W().dmg, hd);
    spark(end, 2, shielded ? 0xffd36b : 0xff7a6a);
  } else if (wt < 120) {
    spark(end);
    if (wh.b) damageBox(wh.b, Math.min(W().body, 40) * 0.6, end, "bullet", true);
  }
  emitFx("shot", v3a(muzzle), v3a(end));
  sfx(W().snd);
  rumble(W().rum[0], W().rum[1], W().rum[2]);
  recoil += W().recoil;
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
    const tsh = best.ref.body ? best.ref.body.shield : best.ref.sh || 0;
    dealDamage(best, type === "charge" && tsh <= 0 ? 999 : dmg, type, false);
    shakeT = Math.max(shakeT, 0.15);
    sfx("land", 0.8);
    return true;
  }
  return false;
}
function slamDamage(p) {
  for (const t of targets()) {
    const dd = t.pos.distanceTo(p);
    if (dd < 5) dealDamage(t, Math.round(120 - dd * 18), "pound", false);
  }
}
