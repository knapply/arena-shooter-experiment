/* ============ items on the floor: power weapon spawns and death drops ============
   An item is { id, type (weapon index, or -1 for grenades), pos, avail, availIn, take(), ammo?,
   nades?, power? }. Power spawns come from the map (the centre one rotates through POWER_ROTATION,
   one weapon each time it spawns); drops are what pilots leave when they die.
   Walking over grenades takes them; walking over a weapon you already carry takes its ammo; any
   other weapon needs a hold of Interact and swaps with the one in your hands (which you drop).
   Modes can offer more things to hold Interact on (the CTF flag) through EXT.interactables(). */
const PICKMAT = new THREE.MeshStandardMaterial({ color: "#2a3338", roughness: 0.4, metalness: 0.6 }),
  PICKACC = new THREE.MeshStandardMaterial({ color: "#5ab8ff", emissive: "#2a7fff", emissiveIntensity: 1.4 }),
  PICKHOT = new THREE.MeshStandardMaterial({ color: "#ff8a3a", emissive: "#ff6a1a", emissiveIntensity: 1.2 }),
  NADEMAT = new THREE.MeshStandardMaterial({ color: "#56604a", roughness: 0.6, metalness: 0.4 }),
  NADEGLOW = new THREE.MeshStandardMaterial({
    color: "#000000",
    emissive: "#5ad2ff",
    emissiveIntensity: 1.6,
  });
const NADE_CAP = 2;
const wName = t => (t < 0 ? "Grenades" : WEAPONS[t].name.split(" ").slice(1).join(" ") || WEAPONS[t].name);
const capWord = s => s.charAt(0).toUpperCase() + s.slice(1);
/* each weapon's floor model is merged into one mesh per material once, and shared by every copy
   (a floor full of drops stays a handful of draw calls) */
const MODEL_PARTS = new Map();
function floorParts(type) {
  if (MODEL_PARTS.has(type)) return MODEL_PARTS.get(type);
  /** @type {Map<any, any[]>} */
  const by = new Map();
  const put = (geo, m, x, y, z, rx = 0) => {
    const mx = new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
    if (!by.has(m)) by.set(m, []);
    by.get(m).push([geo, mx]);
  };
  if (type < 0) {
    /* a frag and a plasma grenade */
    put(new THREE.SphereGeometry(0.09, 10, 8), NADEMAT, -0.08, 0, 0);
    put(new THREE.SphereGeometry(0.08, 10, 8), NADEGLOW, 0.09, 0, 0);
  } else
    /* the weapon's own model (weapons/models.js) in two materials: its lights (and the rocket's paint) glow */
    for (const p of gunParts(type))
      if (!p.fp && p.k !== "n") {
        const hot = WEAPONS[type].key === "rocket";
        const lit = "GX".includes(p.m) || (hot && p.m === "C");
        put(gunGeo(p, false), lit ? (hot ? PICKHOT : PICKACC) : PICKMAT, p.x, p.y, p.z, p.rx);
      }
  const parts = [...by].map(([m, list]) => {
    /* mergeGeos keeps uvs only when every piece has them; these all do */
    const g = mergeGeos(list);
    for (const [geo] of list) geo.dispose();
    return [g, m];
  });
  MODEL_PARTS.set(type, parts);
  return parts;
}
/** a weapon (or grenades, type -1) lying on the floor; power weapons also cast a shadow */
function weaponModel(type, shadow = true) {
  const g = new THREE.Group();
  for (const [geo, m] of floorParts(type)) {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = shadow;
    g.add(o);
  }
  return g;
}
function labelSprite() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const x = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.48, 1);
  s.userData.draw = (t, col) => {
    x.clearRect(0, 0, 256, 64);
    x.font = "600 30px Chakra Petch, Arial Narrow, sans-serif";
    x.textAlign = "center";
    x.fillStyle = "#0b1216cc";
    const w = Math.min(250, x.measureText(t).width + 26);
    x.fillRect(128 - w / 2, 8, w, 44);
    x.fillStyle = col;
    x.fillText(t, 128, 40);
    tex.needsUpdate = true;
  };
  return s;
}
const PK_VIS = new Map();
const RING_GEO = new THREE.RingGeometry(0.55, 0.68, 32);
const ringMat = c => {
  const m = new THREE.MeshBasicMaterial({
    color: c,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  m.color.multiplyScalar(2);
  return m;
};
/* drops share one ring material (they are always available while shown) */
const DROP_RING = ringMat(0xffc070);
function pkVisual(p) {
  let v = PK_VIS.get(p.id);
  if (v && v.type === p.type) return v;
  if (v) {
    v.g.remove(v.model);
    v.model = weaponModel(p.type, !!p.power);
    v.g.add(v.model);
    v.type = p.type;
    v.last = "";
    return v;
  }
  const g = new THREE.Group();
  const model = weaponModel(p.type, !!p.power);
  g.add(model);
  const ring = new THREE.Mesh(RING_GEO, p.power ? ringMat(0x5ab8ff) : DROP_RING);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.scale.setScalar(p.power ? 1 : 0.6);
  g.add(ring);
  let label = null;
  if (p.power) {
    label = labelSprite();
    label.position.y = 1.5;
    g.add(label);
  }
  g.position.copy(p.pos);
  scene.add(g);
  v = { g, model, ring, label, last: "", type: p.type };
  PK_VIS.set(p.id, v);
  return v;
}
/* ---- power spawns (the map's), with rotation ---- */
function powerSpawn(d, clock) {
  const rot = d.rotate ? POWER_ROTATION.map(k => WEAPON_DATA.findIndex(w => w.key === k)) : null;
  const type = WEAPON_DATA.findIndex(w => w.key === d.weapon);
  const p = {
    id: d.id,
    /* lab rifles (docs/PROPOSALS.md) are ordinary pickups, shown only while their lab is on */
    power: !!WEAPON_DATA[type].power,
    lab: d.lab || null,
    rot,
    ri: rot ? Math.max(0, POWER_ROTATION.indexOf(d.weapon)) : 0,
    type,
    pos: new V3(d.p[0], d.p[1], d.p[2]),
    respawn: d.respawn,
    availAt: 0,
    get avail() {
      return clock() >= this.availAt;
    },
    get availIn() {
      return Math.max(0, this.availAt - clock());
    },
    /** taken: start the respawn timer, and the next weapon in the rotation is the one that comes back */
    consume() {
      this.availAt = clock() + this.respawn;
      if (this.rot) {
        /* the rotation as it is now: live lab power weapons join it */
        this.rot = powerRotation().map(k => WEAPON_DATA.findIndex(w => w.key === k));
        this.ri = (this.ri + 1) % this.rot.length;
        this.type = this.rot[this.ri];
      }
    },
    take() {
      if (!this.avail) return false;
      this.consume();
      emitFx("pk", [0, 0, 0], [0, 0, 0], ARENA_PICKS.indexOf(this));
      EVENTS.emit("pickup", { pilot: "local", item: this.id });
      return true;
    },
  };
  return p;
}
const ARENA_PICKS = MAPS.arena.pickups.map(d => powerSpawn(d, () => now));
/* ---- drops ---- */
const ITEM_LIFE = 30;
/** an item on the floor: a weapon with the ammo it had, or grenades */
function makeItem(o, clock, onTake) {
  const it = {
    id: o.id,
    type: o.type,
    pos: o.pos.clone(),
    ammo: o.ammo || null,
    nades: o.nades || null,
    until: clock() + (o.life || ITEM_LIFE),
    gone: false,
    get avail() {
      return !it.gone && clock() < it.until;
    },
    availIn: 0,
    take() {
      if (!it.avail) return false;
      it.gone = true;
      if (onTake) onTake(it);
      return true;
    },
  };
  return it;
}
const ITEMS = [];
let itemSeq = (Math.random() * 1e6) | 0;
/** drop items at a position (spread a little so they don't stack) and tell the room */
function dropItems(list, at, broadcast = true) {
  list.forEach((o, i) => {
    const a = (i / Math.max(1, list.length)) * Math.PI * 2 + Math.random();
    const pos = at.clone().add(new V3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5));
    pos.y = groundBelow(pos.x, pos.z, at.y + 1, 0.05) + 0.02;
    const id = o.id != null ? o.id : ++itemSeq;
    ITEMS.push(makeItem(Object.assign({}, o, { id, pos }), () => now, itemTaken));
    if (broadcast) {
      const am = o.ammo ? [o.ammo[0], o.ammo[1] === Infinity ? -1 : o.ammo[1]] : [0, 0];
      emitFx("drop", v3a(pos), o.type < 0 ? [-1, o.nades.frag, o.nades.plasma] : [o.type, am[0], am[1]], id);
    }
  });
}
function itemTaken(it) {
  emitFx("take", [0, 0, 0], [0, 0, 0], it.id);
}
/** another player's drop or pickup (arena, online) */
function remoteItem(kind, a, b, id) {
  if (kind === "drop" && a && b) {
    if (ITEMS.some(i => i.id === id)) return;
    const t = b[0] | 0;
    if (t >= WEAPONS.length || t < -1) return;
    const o =
      t < 0
        ? { type: -1, nades: { frag: clamp(b[1] | 0, 0, NADE_CAP), plasma: clamp(b[2] | 0, 0, NADE_CAP) } }
        : { type: t, ammo: [clamp(b[1] | 0, 0, 99), b[2] < 0 ? Infinity : clamp(b[2] | 0, 0, 99)] };
    ITEMS.push(makeItem(Object.assign(o, { id, pos: a }), () => now, itemTaken));
  } else if (kind === "take") {
    const it = ITEMS.find(i => i.id === id);
    if (it) it.gone = true;
  }
}
/**
 * what you carry when you die: the weapon in your hands (with its ammo) and your grenades
 * @returns {{ type: number, ammo?: number[], nades?: { frag: number, plasma: number } }[]}
 */
function myLoadoutDrop() {
  ammo[wi] = mag;
  /** @type {{ type: number, ammo?: number[], nades?: { frag: number, plasma: number } }[]} */
  const out = [{ type: wi, ammo: [mag, reserve[wi]] }];
  if (nadeInv.frag + nadeInv.plasma > 0)
    out.push({ type: -1, nades: { frag: nadeInv.frag, plasma: nadeInv.plasma } });
  return out;
}
function pickupList() {
  if (EXT) return EXT.pickups ? EXT.pickups() : [];
  for (let i = ITEMS.length - 1; i >= 0; i--) if (!ITEMS[i].avail) ITEMS.splice(i, 1);
  return ARENA_PICKS.filter(p => !p.lab || labOn(p.lab)).concat(ITEMS);
}
/* ---- you and the items around you ---- */
let pkHold = 0,
  pkNear = null,
  /* after a pickup, interact has to be let go before the next one (no swapping straight back) */
  pkLatch = false;
const pkAnn = new Map();
/** grenades and ammo for what you already carry are taken just by walking over them */
function autoTake(p) {
  if (p.type < 0) {
    const n = p.nades || { frag: 1, plasma: 0 };
    const f = Math.min(n.frag, NADE_CAP - nadeInv.frag),
      pl = Math.min(n.plasma, NADE_CAP - nadeInv.plasma);
    if (f <= 0 && pl <= 0) return false;
    if (!p.take(true)) return false;
    nadeInv.frag += f;
    nadeInv.plasma += pl;
    updNadeHud();
    sfx("pickup", 0.6);
    toast(`+${f ? f + " frag" : ""}${f && pl ? " " : ""}${pl ? pl + " plasma" : ""}`);
    return true;
  }
  if (!slots.includes(p.type) || p.power) return false;
  const W0 = WEAPONS[p.type];
  if (W0.reserve === Infinity) return false;
  const max = W0.reserve + W0.mag,
    have = reserve[p.type] + (wi === p.type ? mag : ammo[p.type]);
  if (have >= max) return false;
  const give = p.ammo ? p.ammo[0] + (p.ammo[1] === Infinity ? 0 : p.ammo[1]) : W0.mag;
  if (!p.take(true)) return false;
  reserve[p.type] = Math.min(W0.reserve, reserve[p.type] + give);
  sfx("pickup", 0.6);
  toast(`${wName(p.type)} ammo`);
  return true;
}
/** swap the weapon in your hands for this one (yours drops where you stand) */
function swapFor(p) {
  const before = { type: wi, ammo: [mag, reserve[wi]] };
  const got = p.ammo ? p.ammo.slice() : null;
  /* read the type first: taking a rotating power spawn moves it on to the next weapon */
  const type = p.type;
  if (!p.take()) return;
  if (slots.includes(type)) {
    reserve[type] = WEAPONS[type].reserve;
    ammo[type] = WEAPONS[type].mag;
    if (wi === type) mag = ammo[wi];
    toast(`${wName(type)} ammo`);
    return;
  }
  if (EXT && EXT.dropItems) EXT.dropItems([before], me.pos);
  else dropItems([before], me.pos);
  giveWeapon(type, got);
}
function updPickups(dt) {
  const list = pickupList();
  const seen = new Set();
  pkNear = null;
  let best = 99;
  for (const p of list) {
    seen.add(p.id);
    const av = p.avail;
    if (!av && !p.power) continue;
    const v = pkVisual(p);
    v.g.visible = true;
    v.g.position.copy(p.pos);
    /* a power weapon comes down in its own supply pod: hidden until the lid opens (game/supply-pods.js) */
    const sup = p.power ? supplyTick(p, av) : null;
    v.model.visible = av && !(sup && sup.hide);
    v.model.rotation.y += dt * 1.1;
    v.model.position.y =
      (p.power ? 0.6 : 0.3) + (sup ? sup.lift : 0) + Math.sin(now * 2 + v.g.position.x) * 0.08;
    v.ring.material.opacity = av ? 0.75 : 0.2;
    if (p.power && v.label) {
      const s = Math.ceil(p.availIn);
      const nm = capWord(wName(p.type));
      const txt =
        sup && sup.incoming
          ? `${nm} incoming`
          : av
            ? nm
            : `${nm} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (txt !== v.last) {
        v.last = txt;
        v.label.userData.draw(txt, av ? "#9fe1ff" : "#7f939c");
      }
      const st = pkAnn.get(p.id) || { a: av, w: av };
      if (playing) {
        if (av && !st.a) {
          say(`${nm} has spawned`, true);
          sfx("stinger", 0.4);
        }
        if (!av && p.availIn <= 30 && !st.w) say(`${nm} will spawn in 30 seconds`);
      }
      st.a = av;
      st.w = av || p.availIn <= 30;
      pkAnn.set(p.id, st);
    }
    if (!playing || me.dead || !av) continue;
    const d = Math.hypot(me.pos.x - p.pos.x, me.pos.z - p.pos.z);
    if (d > 1.7 || Math.abs(me.pos.y - p.pos.y) > 1.6) continue;
    if (d < 1.2 && autoTake(p)) continue;
    if (p.type >= 0 && d < best && !(EXT && EXT.carrying && EXT.carrying())) {
      best = d;
      pkNear = p;
    }
  }
  for (const [id, v] of PK_VIS)
    if (!seen.has(id)) {
      v.g.visible = false;
      /* a drop that's gone for good: let its visual go too */
      if (v.ring.material === DROP_RING) {
        scene.remove(v.g);
        PK_VIS.delete(id);
      }
    }
  /* the prompt: the nearest weapon, or what the mode offers (the flag) */
  let act = null;
  if (pkNear) act = { label: `pick up ${wName(pkNear.type)}`, hold: 0.35, go: () => swapFor(pkNear) };
  if (EXT && EXT.interactables && playing && !me.dead) {
    const extra = EXT.interactables();
    if (extra && extra.length) act = extra[0];
  }
  const pr = $("prompt");
  if (act && !paused) {
    if (!A("interact")) pkLatch = false;
    if (A("interact") && !pkLatch) pkHold += dt;
    else pkHold = 0;
    pr.hidden = false;
    const k = (BIND.interact || [])[0];
    const pb = (PADB.interact || [])[0];
    const lbl = pad.on && pb != null ? PAD_NAMES[pb] : keyLabel(k);
    pr.textContent = "";
    const b = document.createElement("b");
    b.textContent = lbl;
    pr.append("Hold ", b, " to " + act.label);
    const bar = document.createElement("i");
    bar.style.transform = `scaleX(${Math.min(1, pkHold / act.hold)})`;
    pr.appendChild(bar);
    if (pkHold >= act.hold) {
      pkHold = 0;
      pkLatch = true;
      act.go();
    }
  } else {
    pr.hidden = true;
    pkHold = 0;
  }
}
