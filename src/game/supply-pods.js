/* ============ SUPPLY PODS: power weapons drop in from orbit ============
   A power weapon spawn (p.power: the rotating sniper / rockets / scatter) arrives in a supply pod of
   its own: an armored crate with a hazard-striped band and a blue beacon (the power ring's colour).
   It falls with a re-entry trail, punches into its pad with the drop pods' crater, pops its lid and
   holds the weapon over a glowing rack; once the weapon is taken the crate sinks away.
   It is presentation only. The pickup's own clock (availIn, the same for the simulation, the host
   and every client) times it: the pod launches SUPPLY_FALL before the weapon is due and lands
   SUPPLY_EARLY before it, so the lid is open when the weapon becomes available, and pickup timing
   never changes. Nothing is solid and nothing is hurt: pilots on the pad stand through it. A match
   that opens with a drop (game/loop.js matchDrop) brings its power weapons in by pod too, while
   everyone is still in the air. Where the pad has no open sky the weapon just appears, as before.
   supplyTick(p, avail) runs per power pickup from updPickups; the crates are drawn instanced. */
const SUPPLY = [];
/** per pickup id: { pod } (cleared when a match starts) */
const SUP_STATE = new Map();
const SUPPLY_FALL = 2.2,
  SUPPLY_EARLY = 0.3,
  SUPPLY_H = 140,
  /** how deep a crate punches in */
  SUPPLY_BURY = 0.3,
  SUPPLY_N = 8;
const SUP_BEACON = 0x5ab8ff;
/* the crate's one texture: plate grey (left half), hazard stripes (top right) and the glow (bottom
   right, also the emissive map), so the body, its band, the beacon and the rack are one draw */
function supplyAtlas() {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    return c;
  };
  const c = mk(),
    x = c.getContext("2d");
  x.fillStyle = "#3c4148";
  x.fillRect(0, 0, 32, 32);
  x.fillStyle = "#141414";
  x.fillRect(32, 0, 32, 16);
  x.fillStyle = "#d9a21e";
  for (let i = 16; i < 72; i += 8) {
    x.beginPath();
    x.moveTo(i, 16);
    x.lineTo(i + 4, 16);
    x.lineTo(i + 12, 0);
    x.lineTo(i + 8, 0);
    x.fill();
  }
  x.fillStyle = "#0b1a26";
  x.fillRect(32, 16, 32, 16);
  const e = mk(),
    y = e.getContext("2d");
  y.fillStyle = "#000";
  y.fillRect(0, 0, 64, 32);
  y.fillStyle = "#fff";
  y.fillRect(32, 16, 32, 16);
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  };
  return { map: tex(c, true), glow: tex(e, true) };
}
/** point a geometry's uvs into a region of the atlas (u0, v0 its corner; su, sv its size) */
function atlasUv(g, u0, v0, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * su, v0 + uv.getY(i) * sv);
  return g;
}
const SUP_GREY = g => atlasUv(g, 0.1, 0.1, 0.3, 0.8),
  SUP_STRIPE = g => atlasUv(g, 0.5, 0.52, 0.5, 0.46),
  SUP_GLOW = g => atlasUv(g, 0.6, 0.1, 0.3, 0.3);
/* crate-local heights: the nose's tip at -0.35, the crate from 0 to 0.9, the lid on top */
const SUP_DRAW = (() => {
  const at = (g, x, y, z, ry = 0) => [g, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)];
  const nose = new THREE.ConeGeometry(0.62, 0.45, 4);
  nose.rotateX(Math.PI);
  nose.rotateY(Math.PI / 4);
  const body = [
    at(SUP_GREY(new THREE.BoxGeometry(1.0, 0.9, 1.0)), 0, 0.45, 0),
    at(SUP_GREY(nose), 0, -0.12, 0),
  ];
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    body.push(at(SUP_GREY(new THREE.BoxGeometry(0.16, 1.02, 0.16)), x * 0.5, 0.5, z * 0.5));
  /* the hazard band round the middle */
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    body.push(
      at(
        SUP_STRIPE(new THREE.BoxGeometry(0.86, 0.16, 0.02)),
        Math.sin(a) * 0.505,
        0.62,
        Math.cos(a) * 0.505,
        a
      )
    );
  }
  /* the beacon on one corner post, and the rack's two glowing bars across the open top */
  body.push(
    at(SUP_GLOW(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8)), 0.5, 1.08, 0.5),
    at(SUP_GLOW(new THREE.BoxGeometry(0.7, 0.05, 0.06)), 0, 0.92, 0.2),
    at(SUP_GLOW(new THREE.BoxGeometry(0.7, 0.05, 0.06)), 0, 0.92, -0.2)
  );
  const lid = [
    at(SUP_GREY(new THREE.BoxGeometry(1.06, 0.1, 1.06)), 0, 0, 0),
    at(SUP_GREY(new THREE.BoxGeometry(0.5, 0.06, 0.14)), 0, 0.08, 0),
  ];
  const A = supplyAtlas();
  const mat = new THREE.MeshStandardMaterial({
    map: A.map,
    emissiveMap: A.glow,
    emissive: SUP_BEACON,
    emissiveIntensity: 2,
    roughness: 0.5,
    metalness: 0.6,
  });
  const make = (geo, shadow) => {
    const m = new THREE.InstancedMesh(geo, mat, SUPPLY_N);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.count = 0;
    m.visible = false;
    scene.add(m);
    return m;
  };
  return { body: make(mergeGeos(body), true), lid: make(mergeGeos(lid), false), mat };
})();
const _spM = new THREE.Matrix4();
/** write the crates into their instanced meshes (from podDraw, just before the frame renders) */
function supplyDraw() {
  const D = SUP_DRAW;
  let n = 0;
  for (const s of SUPPLY) {
    if (n >= SUPPLY_N) break;
    s.g.updateMatrixWorld();
    D.body.setMatrixAt(n, s.g.matrixWorld);
    D.lid.setMatrixAt(n, _spM.multiplyMatrices(s.g.matrixWorld, s.lid.matrix));
    n++;
  }
  for (const m of [D.body, D.lid]) {
    m.count = n;
    m.visible = n > 0;
    if (n) m.instanceMatrix.needsUpdate = true;
  }
  /* the beacon pulses */
  D.mat.emissiveIntensity = 1.6 + Math.sin(now * 6) * 0.8;
}
/** drop a supply pod onto a power pickup's pad, landing in dur seconds; null if it can't come down */
function launchSupply(p, dur) {
  const gy = groundBelow(p.pos.x, p.pos.z, p.pos.y + 0.3, 0.3);
  if (gy < -10) return null;
  const at = new V3(p.pos.x, gy + 0.02, p.pos.z);
  if (!skyClear(at)) return null;
  const seat = podSeat(at);
  if (!seat.ok) return null;
  seat.bury = Math.min(SUPPLY_BURY, seat.bury);
  const g = new THREE.Group();
  const lid = new THREE.Object3D();
  lid.position.y = 0.95;
  g.add(lid);
  const fire = new THREE.Sprite(podFireMat.clone());
  fire.position.y = 1.4;
  fire.scale.set(1.1, 1.8, 1);
  fire.material.color.setHex(0x9fd4ff);
  g.add(fire);
  g.rotation.y = Math.random() * 6;
  scene.add(g);
  const s = {
    id: p.id,
    g,
    lid,
    fire,
    at,
    seat,
    t: 0,
    dur: Math.max(0.6, dur),
    h: SUPPLY_H,
    prev: new V3(at.x, at.y + SUPPLY_H, at.z),
    landed: false,
    life: 0,
    open: false,
    leaving: -1,
    rider: false,
    lidV: new V3(),
    lidSpin: 0,
    lidRest: false,
    /** the weapon has been on its rack (so its going means it was taken) */
    held: false,
  };
  g.position.copy(s.prev);
  SUPPLY.push(s);
  sfx("podq", distVol(at, 120) * 0.8);
  return s;
}
function disposeSupply(s) {
  scene.remove(s.g);
  s.gone = true;
  s.fire.material.dispose();
  const i = SUPPLY.indexOf(s);
  if (i >= 0) SUPPLY.splice(i, 1);
}
function clearSupply() {
  while (SUPPLY.length) disposeSupply(SUPPLY[0]);
  SUP_STATE.clear();
}
/* a new match: every power weapon comes in fresh (and by pod, if the match opens with a drop) */
EVENTS.on("matchStart", () => clearSupply());
/**
 * per power pickup, every frame: launch its pod in time, and say whether the weapon is still in the
 * air or sealed in its crate (hidden) and whether it is on its way (the HUD and label say so)
 * @returns {{ hide: boolean, incoming: boolean, lift: number }}
 */
function supplyTick(p, av) {
  let st = SUP_STATE.get(p.id);
  const first = !st;
  if (!st) SUP_STATE.set(p.id, (st = { pod: null }));
  let s = st.pod && !st.pod.gone ? st.pod : null;
  if (!s) {
    if (!av && p.availIn > 0 && p.availIn <= SUPPLY_FALL + SUPPLY_EARLY)
      s = st.pod = launchSupply(p, p.availIn - SUPPLY_EARLY);
    /* the match opens with a drop: the power weapons come down with everyone */ else if (
      av &&
      first &&
      dropsOn()
    )
      s = st.pod = launchSupply(p, 1.6);
    if (s && !first && playing) say(`${capWord(wName(p.type))} incoming`);
  }
  /* taken: the empty crate sinks away */
  if (s && av) s.held = true;
  if (s && s.held && !av && s.leaving < 0) s.leaving = 0;
  const sealed = !!s && !s.open && s.leaving < 0;
  /* on its rack: the weapon floats over the open crate (it is taken from the pad as always) */
  const lift = s && s.landed && s.leaving < 0 ? Math.max(0, 0.95 - s.seat.bury - 0.25) : 0;
  return { hide: sealed, incoming: sealed, lift };
}
/** a power pickup with a crate on its way or sealed (for the HUD) */
function supplyIncoming(id) {
  const st = SUP_STATE.get(id);
  return !!(st && st.pod && !st.pod.gone && !st.pod.open);
}
const _spV = new V3();
function updSupply(dt) {
  for (let i = SUPPLY.length - 1; i >= 0; i--) {
    const s = SUPPLY[i];
    if (!s.landed) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const h = s.h * podLeft(k);
      s.prev.copy(s.g.position);
      s.g.position.set(s.at.x + s.seat.x, s.at.y + h, s.at.z + s.seat.z);
      s.g.rotation.y += dt * 1.5;
      s.fire.material.opacity = 0.6 + Math.random() * 0.4;
      const heat = Math.max(0.3, podHeat(k));
      podTrail(s, heat, 0.55);
      /* a blue-white head, so it reads as a supply drop and not a pilot */
      ptAdd(PTS.glow, s.g.position, new V3(), 3.6 * heat, 0x9fd4ff, 1, 0.05);
      ptAdd(PTS.glow, s.g.position, new V3(), 1.6 * heat, 0xffffff, 1, 0.05);
      if (h < 50) dynLight(s.g.position, 0x9fd4ff, 3 * heat * (1 - h / 50), 0.05, 18);
      if (k >= 1) {
        s.landed = true;
        s.fire.visible = false;
        s.g.position.set(s.at.x + s.seat.x, s.at.y - s.seat.bury, s.at.z + s.seat.z);
        const c = _spV.set(s.at.x + s.seat.x, s.at.y - 0.02, s.at.z + s.seat.z).clone();
        shock(s.at);
        dust(c, 18, 3, 1.2, 0.7);
        podCrater(s, c, 0.62);
        sfx("podland", distVol(s.at, 50) * 0.7);
        sfx("podcrack", distVol(s.at, 30) * 0.7);
        const near = distVol(s.at, 16);
        if (near > 0) shakeT = Math.max(shakeT, near * 0.25);
      }
      continue;
    }
    s.life += dt;
    /* the lid pops: bolts, a puff, and it tumbles off to one side */
    if (!s.open && s.life >= 0.12) {
      s.open = true;
      const a = Math.random() * 6.28;
      s.lidV.set(Math.sin(a) * 2.2, 5.5, Math.cos(a) * 2.2);
      s.lidSpin = rnd(4, 8) * (Math.random() < 0.5 ? -1 : 1);
      sfx("podbolts", distVol(s.at, 40) * 0.8);
      _spV.set(s.g.position.x, s.at.y + 0.9, s.g.position.z);
      ptAdd(PTS.glow, _spV, new V3(), 1.4, 0xbfe6ff, 1, 0.15);
      for (let j = 0; j < 6; j++)
        ptAdd(
          PTS.soft,
          _spV,
          new V3(rnd(-2, 2), rnd(0.8, 2.2), rnd(-2, 2)),
          rnd(0.5, 0.9),
          0xc9c2b8,
          0.5,
          rnd(0.6, 1),
          { grow: 1.3, drag: 2 }
        );
    }
    if (s.open && !s.lidRest) {
      s.lidV.y -= 16 * dt;
      s.lid.position.addScaledVector(s.lidV, dt);
      s.lid.rotation.x += s.lidSpin * dt;
      const floor = s.seat.bury + 0.06;
      if (s.lid.position.y < floor && s.lidV.y < 0) {
        s.lid.position.y = floor;
        s.lid.rotation.x = Math.round(s.lid.rotation.x / Math.PI) * Math.PI;
        s.lidRest = true;
      }
    }
    /* the rack glows the weapon in for a moment after it opens */
    if (s.life < 1.2 && Math.random() < dt * 14)
      ptAdd(
        PTS.glow,
        _spV.set(s.g.position.x + rnd(-0.35, 0.35), s.at.y + 0.5, s.g.position.z + rnd(-0.35, 0.35)),
        new V3(0, rnd(0.6, 1.4), 0),
        rnd(0.06, 0.12),
        SUP_BEACON,
        1,
        rnd(0.4, 0.8)
      );
    /* empty: it sinks out of sight (or shrinks, on a thin floor), lid and all */
    if (s.leaving >= 0) {
      s.leaving += dt;
      if (s.seat.deep) s.g.position.y = s.at.y - s.seat.bury - s.leaving * 1.2;
      else s.g.scale.setScalar(Math.max(0.001, 1 - s.leaving / 1.5));
      if (s.leaving > 1.5) disposeSupply(s);
    }
  }
}
onFrame(updSupply, { full: true });
