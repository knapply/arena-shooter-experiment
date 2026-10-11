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
  const cap = DMG_CAP[w] != null ? DMG_CAP[w] : 16;
  n = Math.min(n, cap);
  if (w === "stick" || w === "sniper" || (w === "charge" && n > 85)) {
    if (b.tok < 120) return 0;
    b.tok -= 120;
    return n;
  }
  if (b.tok < n) return 0;
  b.tok -= n;
  return n;
}
let room = null,
  lastSend = 0;
function sendPresence(force) {
  if (!room || !playing || EXT) return;
  if (!force && now - lastSend < 0.045) return;
  lastSend = now;
  const st =
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
    (wi === 1 ? 8192 : 0) |
    (wi === 2 ? 32768 : 0);
  room
    .presence({
      n: myName,
      c: myColor,
      p: v3a(me.pos),
      v: v3a(me.vel),
      y: r2(me.yaw),
      pt: r2(me.pitch),
      st,
      sh: Math.ceil(me.shield),
      dead: me.dead ? 1 : 0,
      k: kills,
      d: deaths,
      hits: hitsOut.slice(),
      fx: fxOut.slice(),
      dth,
      br: DESTR.recent.slice(),
    })
    .catch(() => {});
}
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
    });
    addPilot(r);
    remotes.set(peer, r);
  }
  return r;
}
function applyPeer(pe) {
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
    r.color = color;
    r.name = name;
    r.rig.root.position.set(+pr.p[0] || 0, +pr.p[1] || 0, +pr.p[2] || 0);
  }
  if (r.name !== name) {
    r.name = name;
    r.rig.setLabel(name);
  }
  r.has = true;
  vec(pr.p, r.tgt);
  if (!vec(pr.v, r.vel)) r.vel.set(0, 0, 0);
  r.vel.clampLength ? r.vel.clampLength(0, 60) : 0;
  r.rx = performance.now() / 1000;
  r.yaw = num(pr.y, -1e4, 1e4);
  r.pitch = num(pr.pt, -1.6, 1.6);
  const st = pr.st | 0;
  if (st & 64 && !(r.st & 64)) r.rlStart = now;
  if (st & 128 && !(r.st & 128)) r.mlStart = now;
  r.st = st;
  r.crouch = !!(st & 1);
  r.sh = num(pr.sh, 0, 70);
  r.k = num(pr.k, 0, 9999) | 0;
  r.d = num(pr.d, 0, 9999) | 0;
  if (Array.isArray(pr.br)) applyBreaks(pr.br, true, "a:" + pe.peer);
  const dead = !!pr.dead;
  if (dead && !r.dead) r.rig.die();
  else if (!dead && r.dead) r.rig.revive();
  r.dead = dead;
  const hits = Array.isArray(pr.hits) ? pr.hits.slice(-16) : [],
    fx = Array.isArray(pr.fx) ? pr.fx.slice(-8) : [];
  const dt_ = pr.dth && typeof pr.dth === "object" ? pr.dth : null;
  if (!r.init) {
    r.init = true;
    r.seenHit = Math.max(-1, ...hits.map(h => h.s | 0));
    r.seenFx = Math.max(-1, ...fx.map(f => f.s | 0));
    r.seenDth = dt_ ? dt_.s | 0 : -1;
    return;
  }
  for (const h of hits) {
    const s = h.s | 0;
    if (s <= r.seenHit) continue;
    r.seenHit = s;
    if (myPeer && h.t === myPeer && playing && !me.dead && !EXT && r.tgt.distanceTo(me.pos) < 100) {
      const w = String(h.w || "rifle").slice(0, 10);
      const n = allowDamage(pe.peer, num(h.d, 0, 999), w);
      if (n > 0) hurtMe(n, { peer: pe.peer, name: r.name, w, hd: !!h.hd });
    }
  }
  for (const f of fx) {
    const s = f.s | 0;
    if (s <= r.seenFx) continue;
    r.seenFx = s;
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
      sfx("thrust", distVol(a) * 0.5);
    } else if (f.k === "pk" && ARENA_PICKS[f.g | 0])
      ARENA_PICKS[f.g | 0].availAt = now + ARENA_PICKS[f.g | 0].respawn;
    else if (f.k === "nade" && a && b && b.length() < 45)
      MAIN_NADES.throw(f.g === 1 ? "plasma" : "frag", a, b, null);
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
      updateLive();
    }
  );
  room.onConnection(() => updateLive());
  updateLive();
})();
updateLive();
