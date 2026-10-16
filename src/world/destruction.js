/* ============ destructible cover ============ */
const DESTR = {
  all: [],
  broken: new Map(),
  onChange: null,
  bodies: null,
  recent: [],
  seq: 0,
  nextId: 0,
  seen: new Map(),
  locked: false,
};
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
function isDestructible(b) {
  return b.mat === "cover";
}
function boxHP(b) {
  const vol = (b.x1 - b.x0) * (b.y1 - b.y0) * (b.z1 - b.z0);
  return 160 * Math.sqrt(vol) * SET.destructStrength;
}
function rayWorldHit(o, d, maxT) {
  let best = maxT,
    bb = null;
  for (const b of SOLID) {
    const t = rayBox(o, d, b, best);
    if (t >= 0 && t < best) {
      best = t;
      bb = b;
    }
  }
  return { t: best, b: bb };
}
function boxTint(b) {
  if (!b.mesh) return;
  const k = Math.max(0, b.hp / b.maxHp);
  if (k >= 0.999) {
    if (b.dmgMat) {
      b.mesh.material = b.baseMat;
    }
    return;
  }
  if (!b.dmgMat) {
    b.baseMat = b.mesh.material;
    b.dmgMat = b.baseMat.clone();
  }
  b.mesh.material = b.dmgMat;
  b.dmgMat.color.copy(b.baseMat.color).multiplyScalar(0.45 + 0.55 * k);
}
/* kind: "bullet" | "blast"; render false for headless AI training */
function damageBox(b, dmg, at, kind, render) {
  if (!b || b.broken || !isDestructible(b) || SET.destruct === "off") return false;
  if (kind === "bullet" && SET.destruct !== "full") return false;
  if (b.hp == null) {
    b.maxHp = boxHP(b);
    b.hp = b.maxHp;
  }
  b.hp -= dmg;
  /* progressive damage: each time health passes a stage, a chunk comes off where it was hit */
  const fr = b.hp / b.maxHp;
  while ((b.stage || 0) < CHIP_STAGES.length && fr < CHIP_STAGES[b.stage || 0]) {
    b.stage = (b.stage || 0) + 1;
    if (render !== false && fr > 0) chipBox(b, at);
  }
  if (render !== false) {
    boxTint(b);
    if (kind === "bullet" && at && SET.debris > 0 && Math.random() < 0.5 * SET.debris) chips(at, 2);
  }
  if (b.hp <= 0) {
    breakBox(b, at, render !== false, true);
    return true;
  }
  return false;
}
/* ---- chipping: cover loses chunks as it is damaged, before it collapses ---- */
const CHIP_STAGES = [0.8, 0.6, 0.4, 0.2];
const _cp = new V3(),
  _cv = new V3();
/** the box's mesh gets a subdivided copy of its geometry on the first chip, so craters have room */
function chipGeo(b) {
  if (b.chipGeo) return b.chipGeo;
  const sx = b.x1 - b.x0,
    sy = b.y1 - b.y0,
    sz = b.z1 - b.z0;
  const seg = v => Math.max(2, Math.min(7, Math.round(v / 0.4)));
  const box = new THREE.BoxGeometry(sx, sy, sz, seg(sx), seg(sy), seg(sz));
  scaleBoxUV(box, sx, sy, sz, 2.5);
  /* unshared vertices: each facet of a crater shades flat, so it reads as broken, not bent */
  const g = box.toNonIndexed();
  box.dispose();
  b.baseGeo = b.mesh.geometry;
  b.chipGeo = g;
  b.mesh.geometry = g;
  return g;
}
/** carve a crater at world point `at` (or a random spot on top) and throw a few chunks off it */
function chipBox(b, at) {
  if (!b.mesh || SET.debris <= 0) return;
  const g = chipGeo(b),
    pos = g.attributes.position,
    c = b.mesh.position;
  const sx = b.x1 - b.x0,
    sy = b.y1 - b.y0,
    sz = b.z1 - b.z0,
    thin = Math.min(sx, sy, sz);
  if (at) _cp.copy(at).sub(c);
  else _cp.set(rnd(-sx, sx) * 0.4, sy / 2, rnd(-sz, sz) * 0.4);
  /* the impact, pulled onto the box's surface */
  _cp.set(clamp(_cp.x, -sx / 2, sx / 2), clamp(_cp.y, -sy / 2, sy / 2), clamp(_cp.z, -sz / 2, sz / 2));
  const r = clamp(thin * 0.7, 0.3, 0.8) * rnd(0.85, 1.15),
    depth = Math.min(r * 0.55, thin * 0.3);
  for (let i = 0; i < pos.count; i++) {
    _cv.fromBufferAttribute(pos, i);
    const d = _cv.distanceTo(_cp);
    if (d >= r) continue;
    /* toward the centre, deepest at the impact, with a jagged edge */
    const f = (1 - d / r) * (0.75 + Math.random() * 0.5);
    const L = _cv.length() || 1;
    _cv.multiplyScalar(1 - Math.min(0.6, (depth * f) / L));
    pos.setXYZ(i, _cv.x, _cv.y, _cv.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  /* the chunks that came off, flying out from the face */
  const w = _cv.copy(_cp).add(c);
  const out = _cp.clone().normalize();
  const n = Math.round(rnd(3, 6) * SET.debris);
  /* pieces of the crate itself, in one draw call (render/combat-fx.js) */
  if (typeof chunkChips === "function") chunkChips(w, out, n, true);
  for (let k = 0; k < (typeof chunkChips === "function" ? 0 : n); k++) {
    const m = fxGet("db", () => {
      const o = new THREE.Mesh(debrisGeo, MATS.cover);
      o.castShadow = true;
      return o;
    });
    m.material = b.baseMat || b.mesh.material;
    m.position.copy(w).add(new V3(rnd(-0.15, 0.15), rnd(-0.15, 0.15), rnd(-0.15, 0.15)));
    m.scale.set(rnd(0.1, 0.26), rnd(0.08, 0.22), rnd(0.1, 0.26));
    fxPush({
      m,
      key: "db",
      life: rnd(2.5, 4),
      max: 4,
      fadeTail: 0,
      vel: new V3(out.x * rnd(2, 5) + rnd(-1, 1), rnd(1.5, 4), out.z * rnd(2, 5) + rnd(-1, 1)),
      g: 16,
      spin: new V3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)),
      floor: groundBelow(m.position.x, m.position.z, b.y1 + 0.05, 0.05) + 0.06,
    });
  }
  dust(w, 6, 1.5, 0.8, 0.5);
  sfx("crumble", distVol(w, 40) * 0.35);
}
/** back to the whole box (a rebuild or a new match) */
function unchipBox(b) {
  b.stage = 0;
  if (!b.chipGeo) return;
  if (b.mesh) b.mesh.geometry = b.baseGeo;
  b.chipGeo.dispose();
  b.chipGeo = null;
}
function damageRadius(c, r, dmg, render) {
  if (SET.destruct === "off") return;
  for (const b of SOLID.slice()) {
    if (!isDestructible(b)) continue;
    const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1),
      dy = Math.max(b.y0 - c.y, 0, c.y - b.y1),
      dz = Math.max(b.z0 - c.z, 0, c.z - b.z1),
      d = Math.hypot(dx, dy, dz);
    if (d < r) damageBox(b, dmg * (1 - d / r), c, "blast", render);
  }
}
function chips(p, n) {
  n = pc(n);
  if (typeof chunkChips === "function") return chunkChips(p, _cv.set(rnd(-1, 1), 0, rnd(-1, 1)), n, false);
  for (let i = 0; i < n; i++) {
    const m = fxGet("db", () => {
      const o = new THREE.Mesh(debrisGeo, MATS.cover);
      o.castShadow = true;
      return o;
    });
    m.material = MATS.cover;
    m.position.copy(p);
    m.scale.setScalar(rnd(0.05, 0.12));
    fxPush({
      m,
      key: "db",
      life: rnd(0.8, 1.4),
      max: 1.4,
      vel: new V3(rnd(-3, 3), rnd(1, 4), rnd(-3, 3)),
      g: 14,
      spin: new V3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)),
      floor: groundBelow(p.x, p.z, p.y + 0.2, 0.05) + 0.04,
    });
  }
}
function breakBox(b, at, render, local) {
  if (b.broken) return;
  b.broken = true;
  /* remember every solid's build order (first break of the map), so a restore puts it back in place */
  if (b.ord == null) SOLID.forEach((s, k) => s.ord == null && (s.ord = k));
  const i = SOLID.indexOf(b);
  if (i >= 0) SOLID.splice(i, 1);
  DESTR.broken.set(b.id, { b, t: now });
  if (local) {
    DESTR.recent.push([++DESTR.seq, b.id]);
    if (DESTR.recent.length > 12) DESTR.recent.shift();
  }
  if (b.mesh) b.mesh.visible = false;
  if (render) {
    const cx = (b.x0 + b.x1) / 2,
      cy = (b.y0 + b.y1) / 2,
      cz = (b.z0 + b.z1) / 2,
      sx = b.x1 - b.x0,
      sy = b.y1 - b.y0,
      sz = b.z1 - b.z0;
    const vol = sx * sy * sz;
    const n = Math.round(Math.min(40, 10 * Math.sqrt(vol)) * SET.debris);
    const from = at || new V3(cx, cy - 1, cz);
    /* the box in pieces of itself, in one draw call (render/combat-fx.js) */
    if (typeof chunkBurst === "function") chunkBurst(b, from);
    for (let k = 0; k < (typeof chunkBurst === "function" ? 0 : n); k++) {
      const m = fxGet("db", () => {
        const o = new THREE.Mesh(debrisGeo, MATS.cover);
        o.castShadow = true;
        return o;
      });
      m.material = b.baseMat || MATS.cover;
      m.position.set(
        cx + rnd(-sx / 2, sx / 2) * 0.8,
        cy + rnd(-sy / 2, sy / 2) * 0.8,
        cz + rnd(-sz / 2, sz / 2) * 0.8
      );
      m.scale.set(rnd(0.15, 0.45), rnd(0.12, 0.4), rnd(0.15, 0.45));
      const dir = new V3(m.position.x - from.x, Math.abs(m.position.y - from.y) + 0.6, m.position.z - from.z)
        .normalize()
        .multiplyScalar(rnd(2, 7));
      fxPush({
        m,
        key: "db",
        life: rnd(3.5, 6),
        max: 6,
        fadeTail: 0,
        vel: dir,
        g: 16,
        spin: new V3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)),
        floor: groundBelow(m.position.x, m.position.z, b.y0 + 0.05, 0.05) + 0.08,
      });
    }
    dust(new V3(cx, b.y0, cz), Math.round(12 + vol * 2), 4, 1.4, 0.9);
    sfx("crumble", distVol(new V3(cx, cy, cz), 60));
  }
  if (DESTR.onChange) DESTR.onChange(b, false);
}
function restoreBox(b, fx) {
  if (!b.broken) return;
  b.broken = false;
  b.hp = null;
  unchipBox(b);
  if (b.dmgMat && b.mesh) {
    b.mesh.material = b.baseMat;
  }
  /* back where it was: the collision list's order decides ray and collision ties, and a match
     replayed from the same seed has to see the same list */
  let at = SOLID.length;
  if (b.ord != null) {
    at = SOLID.findIndex(s => s.ord != null && s.ord > b.ord);
    if (at < 0) at = SOLID.length;
  }
  SOLID.splice(at, 0, b);
  DESTR.broken.delete(b.id);
  if (b.mesh) {
    b.mesh.visible = true;
    if (fx) {
      ring(new V3((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2), 0x62cdff, 3);
    }
  }
  if (DESTR.onChange) DESTR.onChange(b, true);
}
function bodiesNear(b) {
  const list = DESTR.bodies ? DESTR.bodies() : [me, ...bots.map(x => x.body)];
  for (const B of list) {
    if (!B || !B.pos) continue;
    const p = B.pos;
    if (
      p.x + R > b.x0 - 0.2 &&
      p.x - R < b.x1 + 0.2 &&
      p.z + R > b.z0 - 0.2 &&
      p.z - R < b.z1 + 0.2 &&
      p.y < b.y1 + 0.2 &&
      p.y + (B.h || 1.8) > b.y0
    )
      return true;
  }
  return false;
}
function destrTick() {
  const rg = +SET.regen;
  for (const [, o] of DESTR.broken) {
    if (DESTR.locked) break;
    if (rg > 0 && now - o.t > rg && !bodiesNear(o.b)) restoreBox(o.b, true);
  }
}
function resetDestruction() {
  for (const [, o] of [...DESTR.broken]) restoreBox(o.b, false);
  for (const b of DESTR.all) {
    b.hp = null;
    unchipBox(b);
    if (b.dmgMat && b.mesh) b.mesh.material = b.baseMat;
  }
  DESTR.recent.length = 0;
}
function boxById(id) {
  return DESTR.all.find(b => b.id === id) || null;
}
/* apply a peer's list of breaks (ids are map-build order, identical on every client) */
function applyBreaks(list, render, peer) {
  if (!Array.isArray(list) || SET.destruct === "off") return;
  let seen = DESTR.seen.has(peer) ? DESTR.seen.get(peer) : -1;
  for (const e of list.slice(-12)) {
    if (!Array.isArray(e)) continue;
    const s = num(e[0], 0, 1e9);
    if (s <= seen) continue;
    seen = Math.max(seen, s);
    const b = boxById(num(e[1], 0, 1e5) | 0);
    if (b && !b.broken && isDestructible(b)) breakBox(b, null, render, false);
  }
  DESTR.seen.set(peer, seen);
}
/* host-authoritative exact set (online CTF clients) */
function syncBroken(ids) {
  if (!Array.isArray(ids)) return;
  const want = new Set(ids.slice(0, 60).map(v => num(v, 0, 1e5) | 0));
  for (const id of want) {
    const b = boxById(id);
    if (b && !b.broken && isDestructible(b)) breakBox(b, null, true, false);
  }
  for (const [id, o] of [...DESTR.broken]) if (!want.has(id)) restoreBox(o.b, true);
}
SET_HOOKS.push(() => {
  if (SET.destruct === "off") resetDestruction();
  for (const b of DESTR.all)
    if (b.hp != null) {
      const k = b.hp / b.maxHp;
      b.maxHp = boxHP(b);
      b.hp = b.maxHp * k;
    }
});
