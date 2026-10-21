/* ============ networking ============ */
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
function cleanName(s, max) {
  return (
    String(s == null ? "" : s)
      .replace(BAD_CHARS, "")
      .trim()
      .slice(0, max || 14) || "Pilot"
  );
}
function num(v, lo, hi, d) {
  v = +v;
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d || 0;
}
function vec(a, out) {
  return Array.isArray(a) && a.length >= 3
    ? out.set(num(a[0], -200, 200), num(a[1], -50, 100), num(a[2], -200, 200))
    : null;
}
const DMG_CAP = {
  rifle: 16,
  pistol: 50,
  sniper: 999,
  melee: 70,
  charge: 999,
  pound: 120,
  frag: 105,
  stick: 999,
  rocket: 999,
  /* a melee by a flag or skull carrier kills in one hit */
  flag: 999,
  skull: 999,
};
const budgets = new Map();
/* every remote shooter gets a refilling damage budget, so a modified client cannot delete you instantly */
function allowDamage(peer, n, w) {
  const t = performance.now() / 1000;
  let b = budgets.get(peer);
  if (!b) {
    b = { tok: 320, t };
    budgets.set(peer, b);
  }
  b.tok = Math.min(320, b.tok + (t - b.t) * 230);
  b.t = t;
  /* own keys only ("toString" is not a weapon), and a finite positive amount: NaN would poison the
     budget for good */
  if (!Number.isFinite(n) || n <= 0) return 0;
  const cap = Object.hasOwn(DMG_CAP, w) ? DMG_CAP[w] : 16;
  n = Math.min(n, cap);
  if (
    w === "stick" ||
    w === "sniper" ||
    w === "rocket" ||
    w === "flag" ||
    w === "skull" ||
    (w === "charge" && n > 85)
  ) {
    if (b.tok < 120) return 0;
    b.tok -= 120;
    return n;
  }
  if (b.tok < n) return 0;
  b.tok -= n;
  return n;
}
/* online sandbox: the room host's tuning applies to the whole room while you're in it */
const amHub = () => !!(window.KAHOST && window.KAHOST.net.hub && window.KAHOST.net.hub().me);
const hubPeer = () => (window.KAHOST && window.KAHOST.net.hub ? window.KAHOST.net.hub().id : null);
let sbSeen = "";
function adoptSandbox(sb) {
  const k = JSON.stringify(sb);
  if (k === sbSeen) return;
  sbSeen = k;
  setSandboxOverride(sb);
}
let room = null,
  lastSend = 0,
  lastFast = 0,
  fastSeq = 0,
  sentEv = "";
/* movement goes over the fast channel ~40 times a second when the transport has one; presence
   (names, scores, hits, effects, deaths) is reliable and sent ~10 times a second, or at once when
   there is a new hit, effect or death to deliver */
const FAST_HZ = 40;
function myBits() {
  return (
    (me.crouch ? 1 : 0) |
    (me.sprint ? 2 : 0) |
    (me.slideT > 0 ? 4 : 0) |
    (me.thrustT > 0 ? 8 : 0) |
    (me.stabbing ? 16 : 0) |
    (me.pound === 1 ? 32 : 0) |
    (reloadT > 0 ? 64 : 0) |
    (me.meleeT > 0 ? 128 : 0) |
    (me.clamber ? 256 : 0) |
    (!me.ground ? 512 : 0) |
    (me.chargeT > 0 ? 1024 : 0) |
    (me.pound === 2 ? 2048 : 0) |
    (now - lastFireT < 0.12 ? 4096 : 0) |
    (wi & 1 ? 8192 : 0) |
    (wi & 2 ? 32768 : 0) |
    (wi & 4 ? 131072 : 0) |
    (aiming && !me.sprint && !me.dead ? 65536 : 0)
  );
}
function sendPresence(force) {
  const t0 = netT0();
  sendPresence1(force);
  netProf("arena.send", t0);
}
function sendPresence1(force) {
  if (!room || !playing || EXT) return;
  const fast = typeof room.fast === "function";
  if (fast && now - lastFast >= 1 / FAST_HZ - 0.002) {
    lastFast = now;
    const ts = Math.round(performance.now()) >>> 0;
    /* what everyone sees of you is what hits on you are checked against (hitcheck.js) */
    MY_HIST.push(ts / 1000, me.pos, me.yaw, me.pitch, myBits(), me.dead);
    room.fast(
      MSG.encode("arenaState", {
        seq: ++fastSeq & 0xffff,
        ts,
        p: me.pos,
        v: me.vel,
        y: me.yaw,
        pt: me.pitch,
        st: myBits(),
        sh: Math.ceil(me.shield),
        dead: me.dead,
        k: kills,
        d: deaths,
      })
    );
  }
  const ev =
    hitSeq +
    "," +
    fxSeq +
    "," +
    deathSeq +
    "," +
    DESTR.recent.length +
    ":" +
    DESTR.recent[DESTR.recent.length - 1];
  const fresh = ev !== sentEv;
  if (!force && !fresh && now - lastSend < (fast ? 0.1 : 0.045)) return;
  if (!force && fresh && now - lastSend < 0.016) return;
  sentEv = ev;
  lastSend = now;
  /* movement rides the fast channel; presence repeats it once a second, as a fallback (and with
     presence deltas, unchanged fields cost nothing) */
  if (!fast || now - presMv.t >= 1 || now < presMv.t) {
    presMv.t = now;
    Object.assign(presMv.o, {
      p: v3a(me.pos),
      v: v3a(me.vel),
      y: r2(me.yaw),
      pt: r2(me.pitch),
      st: myBits(),
      sh: Math.ceil(me.shield),
      dead: me.dead ? 1 : 0,
      k: kills,
      d: deaths,
    });
  }
  room
    .presence({
      n: myName,
      c: myColor,
      ...presMv.o,
      hits: hitsOut.slice(),
      fx: fxOut.slice(),
      dth,
      /* hits on you that failed the checks: [shooter, their hit seq, why] */
      hr: hitRej.slice(),
      br: DESTR.recent.slice(),
      /* the room host's sandbox is everyone's (movement, weapon and grenade tuning) */
      sb: amHub() ? sandboxRules() : null,
    })
    .catch(() => {});
}
const presMv = { t: -9, o: {} };
function remoteFor(peer) {
  let r = remotes.get(peer);
  if (!r) {
    r = Object.assign(new Pilot({ id: "peer:" + peer, ctl: "net", rig: false }), {
      peer,
      has: false,
      seenHit: -1,
      seenFx: -1,
      seenDth: -1,
      init: false,
      rig: null,
      name: "",
      color: "",
      dead: false,
      crouch: false,
      k: 0,
      d: 0,
      sh: 70,
      tgt: new V3(),
      vel: new V3(),
      rx: 0,
      yaw: 0,
      pitch: 0,
      st: 0,
      rlStart: -1,
      mlStart: -1,
      pb: new Playback(),
      /** their reported movement in their clock, and their claims so far (hitcheck.js) */
      hist: new MoveHist(),
      stream: HITCHK.newStream(),
      seenRej: -1,
      fastAt: -9,
    });
    addPilot(r);
    remotes.set(peer, r);
  }
  return r;
}
function remoteState(r, st, sh, dead) {
  if (st & 64 && !(r.st & 64)) r.rlStart = now;
  if (st & 128 && !(r.st & 128)) r.mlStart = now;
  /* their shots mark a fight for spawn safety (state.js), at most twice a second */
  if (st & 4096 && r.rig && now - (r.fightT || -9) > 0.5) {
    r.fightT = now;
    noteFight(ARENA_FIGHTS, r.rig.root.position, now);
  }
  r.st = st;
  r.crouch = !!(st & 1);
  r.sh = sh;
  if (r.rig) {
    if (dead && !r.dead) r.rig.die();
    else if (!dead && r.dead) r.rig.revive();
  }
  r.dead = dead;
}
/** movement from the fast channel: into the player's playback buffer */
function onFastPacket(from, buf) {
  const t0 = netT0();
  onFastPacket1(from, buf);
  netProf("arena.fast", t0);
}
function onFastPacket1(from, buf) {
  const m = MSG.decode(buf);
  if (!m || m.name !== "arenaState" || EXT) return;
  const r = remotes.get(from);
  if (!r || !r.has || !r.rig) return;
  const d = m.data,
    t = performance.now() / 1000;
  r.pb.push(d.ts / 1000, { p: d.p, v: d.v, y: d.y, pt: d.pt, st: d.st }, t);
  r.hist.push(d.ts / 1000, d.p, d.y, d.pt, d.st, d.dead);
  /* only the newest packet changes discrete state (packets can arrive out of order) */
  if (r.pb.buf[r.pb.buf.length - 1].ts === d.ts / 1000) {
    r.fastAt = t;
    remoteState(r, d.st, d.sh, d.dead);
    r.k = d.k;
    r.d = d.d;
  }
}
function applyPeer(pe) {
  const t0 = netT0();
  applyPeer1(pe);
  netProf("arena.presence", t0);
}
function applyPeer1(pe) {
  const pr = pe.presence || {};
  const r0 = remotes.get(pe.peer);
  if (!pr.p || !Array.isArray(pr.p) || pr.m === "ctf") {
    if (r0) {
      r0.dispose();
      remotes.delete(pe.peer);
    }
    return;
  }
  const r = remoteFor(pe.peer);
  const name = cleanName(pr.n);
  const color = COLORS.includes(pr.c) ? pr.c : "#dbe6ea";
  if (!r.rig || r.color !== color) {
    if (r.rig) scene.remove(r.rig.root);
    r.rig = makePilot(color, name);
    r.rig.setLabel(name, "", "human");
    r.color = color;
    r.name = name;
    r.rig.root.position.set(+pr.p[0] || 0, +pr.p[1] || 0, +pr.p[2] || 0);
  }
  if (r.name !== name) {
    r.name = name;
    r.rig.setLabel(name, "", "human");
  }
  r.has = true;
  /* while fast-channel movement is arriving, presence movement is older news: skip it */
  if (performance.now() / 1000 - r.fastAt > 0.6) {
    vec(pr.p, r.tgt);
    if (!vec(pr.v, r.vel)) r.vel.set(0, 0, 0);
    r.vel.clampLength ? r.vel.clampLength(0, 60) : 0;
    r.rx = performance.now() / 1000;
    r.yaw = num(pr.y, -1e4, 1e4);
    r.pitch = num(pr.pt, -1.6, 1.6);
    remoteState(r, pr.st | 0, num(pr.sh, 0, 70), !!pr.dead);
    r.k = num(pr.k, 0, 9999) | 0;
    r.d = num(pr.d, 0, 9999) | 0;
  }
  if (Array.isArray(pr.br)) applyBreaks(pr.br, true, "a:" + pe.peer);
  if (pr.sb && typeof pr.sb === "object" && !amHub() && hubPeer() === pe.peer) adoptSandbox(pr.sb);
  const hits = Array.isArray(pr.hits) ? pr.hits.slice(-16) : [],
    fx = Array.isArray(pr.fx) ? pr.fx.slice(-8) : [];
  const dt_ = pr.dth && typeof pr.dth === "object" ? pr.dth : null;
  if (!r.init) {
    r.init = true;
    r.seenHit = Math.max(-1, ...hits.map(h => h.s | 0));
    r.seenFx = Math.max(-1, ...fx.map(f => f.s | 0));
    r.seenDth = dt_ ? dt_.s | 0 : -1;
    r.seenRej = Math.max(-1, ...rejOf(pr).map(x => x[1]));
    return;
  }
  for (const h of hits) {
    if (!h || typeof h !== "object") continue;
    const s = h.s | 0;
    if (s <= r.seenHit) continue;
    r.seenHit = s;
    const mine = !!myPeer && h.t === myPeer;
    const v = checkHit(r, h, mine);
    /* what the hit check cannot see (no ray): the weapon must be one we know, and an explosion or a
       blow needs evidence that they could have dealt it */
    if (v.ok && mine) {
      const why = arenaEvidence(r, String(h.w || "rifle").slice(0, 10), h);
      if (why) {
        v.ok = false;
        v.why = why;
      }
    }
    if (mine && playing && !me.dead && !EXT && r.tgt.distanceTo(me.pos) < 100) {
      if (!v.ok) {
        HITCHK.me.rejected++;
        hitRej.push([pe.peer, s, v.why]);
        while (hitRej.length > 8) hitRej.shift();
        continue;
      }
      HITCHK.me.taken++;
      HITCHK.me.rewinds.push(Math.round(v.rewind * 1000));
      HITCHK.me.misses.push(Math.round(v.miss * 100));
      if (HITCHK.me.rewinds.length > 200) HITCHK.me.rewinds.shift();
      if (HITCHK.me.misses.length > 200) HITCHK.me.misses.shift();
      const w = String(h.w || "rifle").slice(0, 10);
      const n = allowDamage(pe.peer, num(h.d, 0, 999), w);
      if (n > 0) hurtMe(n, { peer: pe.peer, name: r.name, w, hd: !!h.hd });
    }
  }
  /* your hits this player refused */
  for (const x of rejOf(pr))
    if (x[0] === myPeer && x[1] > r.seenRej) {
      r.seenRej = x[1];
      HITCHK.me.refused++;
    }
  for (const f of fx) {
    if (!f || typeof f !== "object") continue;
    const s = f.s | 0;
    if (s <= r.seenFx) continue;
    r.seenFx = s;
    /* effects (pods, projectiles, dropped items) at a human rate: a flood is dropped */
    const tn = performance.now() / 1000;
    r.fxTok = Math.min(16, (r.fxTok == null ? 16 : r.fxTok) + (tn - (r.fxT || tn)) * 8);
    r.fxT = tn;
    if (r.fxTok < 1) continue;
    r.fxTok--;
    const a = vec(f.a, new V3()),
      b = vec(f.b, new V3());
    if (f.k === "shot" && a && b) {
      tracer(a, b, new THREE.Color(color).getHex());
      sfx("shot", clamp(1 - a.distanceTo(me.pos) / 60, 0.08, 0.6));
    } else if (f.k === "slam" && a) {
      shock(a);
      sfx("slam", distVol(a, 50));
    } else if (f.k === "thrust" && a && b) {
      thrustPuff(a, b);
      sfxAt("thrust", a, 45, 0.8);
    } else if (f.k === "mhit" && a && b) meleeImpact(a, b, (f.g | 0) & 15);
    else if (f.k === "pk" && ARENA_PICKS[f.g | 0]) ARENA_PICKS[f.g | 0].consume();
    else if (f.k === "pod" && a && a.distanceTo(me.pos) < 300) r.pod = dropPod(a, color);
    /* they steered it: it lands somewhere else now */ else if (
      f.k === "podto" &&
      a &&
      r.pod &&
      !r.pod.landed
    )
      r.pod.at.copy(a);
    else if ((f.k === "drop" || f.k === "take") && Array.isArray(f.b)) remoteItem(f.k, a, f.b, f.g | 0);
    else if (f.k === "nade" && a && b) {
      /* a launch: the evidence an explosion claim from them needs (arenaEvidence) */
      r.launches = (r.launches || []).filter(x => tn - x.t < 10).concat([{ t: tn, at: a.clone() }]);
      remoteProjectile(f.g | 0, a, b);
      /* (a grenade, not a rocket: their free arm throws it) */
      if ((f.g | 0) !== 2 && r.rig) r.rig.throwNade();
    }
  }
  if (dt_ && (dt_.s | 0) > r.seenDth) {
    r.seenDth = dt_.s | 0;
    let killer = dt_.bn ? cleanName(dt_.bn) : "Unknown";
    let kid = "world";
    if (dt_.by && dt_.by === myPeer) {
      killer = myName;
      kid = "local";
      kills++;
      hitMarker("kill");
    } else if (dt_.by) {
      const kr = remotes.get(dt_.by);
      if (kr) killer = kr.name;
      kid = "peer:" + cleanName(dt_.by, 64);
    }
    EVENTS.emit("kill", {
      killer: kid,
      killerName: killer,
      victim: r.id,
      victimName: r.name,
      weapon: cleanName(String(dt_.w || "rifle"), 12),
      head: !!dt_.hd,
    });
  }
}
/** hits on you refused by the checks, published so the shooter knows: [shooter, seq, why] */
const hitRej = [];
const rejOf = pr =>
  (Array.isArray(pr.hr) ? pr.hr.slice(-8) : []).filter(
    x => Array.isArray(x) && typeof x[0] === "string" && Number.isFinite(x[1])
  );
/**
 * check a claimed hit (hitcheck.js). Everyone runs it on every claim, so each shooter's fire rate
 * and ammo are followed the same way everywhere; the victim decides their own hits with it, and the
 * room host logs every verdict for the network panel and the results screen.
 */
function checkHit(r, h, mine) {
  const tn = performance.now() / 1000;
  const w = String(h.w || "rifle").slice(0, 10);
  const ft = Number.isFinite(h.ft) ? h.ft / 1000 : null,
    vt = Number.isFinite(h.vt) ? h.vt / 1000 : 0;
  const o = Array.isArray(h.o) ? h.o.slice(0, 3).map(Number) : null,
    d = Array.isArray(h.r) ? h.r.slice(0, 3).map(Number) : null;
  const sOff = r.pb.ready ? r.pb.offset : null;
  /* the victim, in their own clock: you (your history), or for the host anyone it relays */
  const hub = amHub();
  const vr = mine ? null : remotes.get(h.t);
  const vic = mine ? MY_HIST : hub && vr && vr.hist.ready ? vr.hist : null;
  const vOff = mine ? 0 : vr && vr.pb.ready ? vr.pb.offset : null;
  const ftV = ft != null && sOff != null && vOff != null ? ft + sOff - vOff : null;
  const v = HITCHK.check({
    w,
    o,
    d,
    ft,
    vt,
    ftV,
    now: vOff != null ? tn - vOff : null,
    victim: vic,
    shooter: r.hist.ready ? r.hist : null,
    stream: r.stream,
  });
  if (hub && vic) {
    /* game times for the replay check: when this machine drew each of them at those moments */
    const g = (t, off, pb) => now - (tn - (t + off + (pb ? pb.delay : 0)));
    HITCHK.note(
      r.peer,
      r.name,
      v,
      v.t == null
        ? null
        : {
            w,
            o,
            d,
            vid: mine ? "local" : vr.id,
            sid: r.id,
            gv: g(v.t || 0, vOff, mine ? null : vr.pb),
            gs: ft != null && sOff != null ? g(ft, sOff, r.pb) : now,
          }
    );
  }
  return v;
}
/* weapons a hit may name (damage types of data/weapons.js, and the moves) */
const ARENA_W = new Set([...Object.keys(DMG_CAP), "burst", "scatter", "beam", "plasma"]);
const EXPLOSIVE = new Set(["frag", "stick", "plasma", "rocket"]);
/**
 * a hit on you without a ray to check (an explosion, a blow): "" if it could be real, else why not.
 * An explosion needs a grenade or rocket they launched in the last 10 s, within 80 m of you; a melee,
 * charge or pound needs them (as last reported) within reach
 */
function arenaEvidence(r, w, h) {
  if (!ARENA_W.has(w)) return "weapon";
  if (EXPLOSIVE.has(w)) {
    const tn = performance.now() / 1000;
    const ok = (r.launches || []).some(x => tn - x.t < 10 && x.at.distanceTo(me.pos) < 80);
    return ok ? "" : "launch";
  }
  if (w === "melee" || w === "charge" || w === "pound" || w === "flag" || w === "skull")
    return r.tgt.distanceTo(me.pos) < (w === "pound" ? 9 : 7) ? "" : "reach";
  return "";
}
function updateLive() {
  const n = [...remotes.values()].filter(r => r.has).length;
  $("liveDot").className = "dotlive" + (room && room.connected() ? " on" : "");
  $("liveTxt").textContent = room ? (n ? `${n + 1} pilots live` : "Waiting for pilots") : "Solo";
  $("netState").textContent = !room
    ? "Solo for now · host or join a room to play with friends"
    : n
      ? `${n} pilot${n > 1 ? "s" : ""} in the arena now`
      : "Room open · send friends your code";
}
(async () => {
  let r = null;
  try {
    r = await (window.KAHOST && window.KAHOST.use ? window.KAHOST.use("room") : null);
  } catch (e) {}
  if (!r) {
    updateLive();
    return;
  }
  room = r;
  /* lab content stays offline: everyone in a room plays the shipped game */
  LABS.on = false;
  if (typeof room.onFast === "function") room.onFast(onFastPacket);
  room.onPeers(
    ch => {
      for (const p of ch.peers) if (p.sameTab) myPeer = p.peer;
      for (const p of ch.left) {
        const rr = remotes.get(p.peer);
        if (rr) {
          rr.dispose();
          remotes.delete(p.peer);
        }
      }
      for (const p of [...ch.joined, ...ch.updated]) {
        if (p.sameTab || p.kind !== "viewer") continue;
        applyPeer(p);
      }
      updateLive();
    },
    () => {
      room = null;
      LABS.on = true;
      sbSeen = "";
      setSandboxOverride(null);
      updateLive();
    }
  );
  room.onConnection(() => updateLive());
  updateLive();
})();
updateLive();
