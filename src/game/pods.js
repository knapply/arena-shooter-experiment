/* ============ DROP PODS: spawns that fall from orbit ============
   With Spawns set to "Drop pods" (Gameplay settings), pilots come back in a pod that drops from
   POD_HEIGHT (320 m) in POD_TIME (data/modes.js), slow at first and faster all the way down: its nose glows white-hot and it trails a re-entry
   burn of flame, embers and smoke you can see from anywhere on the map, fires its retros just before
   impact and punches into the ground: it buries itself up to the collar (podSeat), cracks a crater
   with slabs of floor kicked up around the rim and a dust shockwave, then blows its upper shell off
   (three petals and the cap) and the pilot steps out of the smoking wreck, which sinks away.
   A pod that lands on an enemy takes them out. Pods only use spawn points with open sky above them
   (otherwise the pilot appears in place, as before). Nothing here is solid or touches the simulation.
   dropPod(pos, color, { dur, h, onLand, rider }) starts one; updPods runs them (from updFX). Riding
   your own pod is drawn from inside it (game/pod-view.js). */
const PODS = [];
const podsOn = () => SET.spawnStyle !== "classic";
/* pod-local heights (y 0 is the landing point): the nose tip sits POD_NOSE under it, the collar
   (what stays of the hull) ends at 1.55, the petals and cap above it blow off on landing */
/** how much of its height a pod has left, k (0..1) of the way through its fall: it starts slow and
    accelerates all the way to a hard impact (ease-in) */
const podLeft = k => 1 - k * k * k;
/** its speed then, as a multiple of height / fall time */
const podSpeed = k => 3 * k * k;
/** the re-entry burn builds with speed and dims under the retros at the end */
const podHeat = k => (k < 0.8 ? Math.min(1, 0.35 + podSpeed(k) * 0.4) : Math.max(0.25, 1 - (k - 0.8) * 3.5));
/** your own pod is not drawn (nor its burn) while you look out from inside it, or wait where it lands */
const podHidden = p => p.rider && (p.inside || p.skip);
const POD_R = 0.76,
  POD_NOSE = 0.35,
  POD_BURY = 0.95,
  /** where the rider's eyes are, in the pod */
  POD_EYE = 1.9,
  /** seconds after impact that the shell blows */
  POD_BLOW = 0.08;
/* the pod's fixed parts are merged once into one geometry per material and shared by every pod
   (drawn instanced for every pod at once: see POD_DRAW) */
const POD_GEO = {};
function podGeo() {
  if (POD_GEO.hull) return POD_GEO;
  const at = (g, x, y, z, ry = 0, rx = 0) => [
    g,
    new THREE.Matrix4()
      .makeRotationY(ry)
      .multiply(new THREE.Matrix4().makeRotationX(rx))
      .setPosition(x, y, z),
  ];
  const nose = new THREE.ConeGeometry(0.62, 0.7, 14);
  nose.rotateX(Math.PI);
  /* the collar: an open tube with a deck the pilot stands on (level with the ground once buried) and
     a thick lip; it is all that stays above ground after landing */
  const hull = [
    at(new THREE.CylinderGeometry(0.72, 0.62, 1.2, 14, 1, true), 0, 0.95, 0),
    at(new THREE.CircleGeometry(0.66, 14), 0, POD_BURY + 0.03, 0, 0, -Math.PI / 2),
    at(new THREE.CylinderGeometry(0.77, 0.77, 0.12, 14, 1, true), 0, 1.5, 0),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    hull.push(at(new THREE.BoxGeometry(0.1, 0.9, 0.08), Math.sin(a) * 0.7, 1.0, Math.cos(a) * 0.7, a));
  }
  /* four swept wedge fins on the collar, each with a nozzle at its foot lit in the pod's colour
     (in the bands' mesh); once the pod is buried they stand out of the crater */
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.3, 0.12);
  fin.lineTo(0.3, 0.38);
  fin.lineTo(0, 0.6);
  fin.lineTo(0, 0);
  const finGeo = () => {
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false });
    g.translate(0, 0, -0.03);
    return g;
  };
  const nozzles = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2,
      s = Math.sin(a),
      c = Math.cos(a);
    hull.push(at(finGeo(), s * 0.66, 0.9, c * 0.66, a - Math.PI / 2));
    nozzles.push(at(new THREE.BoxGeometry(0.075, 0.06, 0.11), s * 0.92, 0.98, c * 0.92, a));
  }
  POD_GEO.hull = mergeGeos(hull);
  POD_GEO.nose = mergeGeos([at(nose, 0, 0, 0)]);
  const band = () => new THREE.CylinderGeometry(0.735, 0.735, 0.08, 14, 1, true);
  POD_GEO.bands = mergeGeos([at(band(), 0, 1.3, 0), at(band(), 0, 0.75, 0), ...nozzles]);
  /* the skull's pod alone wears a crown of bone spikes round its collar */
  const spikes = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    spikes.push(at(new THREE.ConeGeometry(0.07, 0.5, 4), Math.sin(a) * 0.8, 1.72, Math.cos(a) * 0.8, a, 0.4));
  }
  POD_GEO.spikes = mergeGeos(spikes);
  /* a petal: a third of the upper shell with a rib down its middle, centred on its own origin so it
     can tumble away */
  const L = (Math.PI * 2) / 3 - 0.05;
  POD_GEO.petal = mergeGeos([
    at(new THREE.CylinderGeometry(0.72, 0.72, 1.0, 6, 1, true, -L / 2, L), 0, 0, -0.72),
    at(new THREE.BoxGeometry(0.12, 1.0, 0.07), 0, 0, 0.02),
    at(new THREE.BoxGeometry(0.5, 0.06, 0.06), 0, 0.42, 0.0),
  ]);
  /* the cap: a heat shield cone with a beacon on top */
  POD_GEO.cap = mergeGeos([
    at(new THREE.CylinderGeometry(0.42, 0.74, 0.45, 14), 0, 0, 0),
    at(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 8), 0, 0.3, 0),
  ]);
  return POD_GEO;
}
const POD_MAT = {
  hull: new THREE.MeshStandardMaterial({
    color: "#3a4349",
    roughness: 0.45,
    metalness: 0.75,
    side: THREE.DoubleSide,
  }),
  dark: new THREE.MeshStandardMaterial({ color: "#1d2226", roughness: 0.6, metalness: 0.5 }),
};
/* (the soft round sprite texture: without it the flame is a hard-edged card) */
const podFireMat = new THREE.SpriteMaterial({
  map: SOFT,
  color: 0xff9a40,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
/** is there open sky above this point (a pod can come straight down)? */
function skyClear(p) {
  return rayWorld(new V3(p.x, p.y + 2.2, p.z), new V3(0, 1, 0), 60) >= 59;
}
/* ---- where a pod comes to rest. The pilot always appears at the landing point; the pod itself may
   sit up to 45 cm off it so it never cuts into a wall, an overhang or the air past a ledge, and
   buries only as deep as the ground under it goes (all of it over the map's floor, where nothing
   below is ever seen; less on a thin bridge) ---- */
function inSolid(x, y, z) {
  for (const b of SOLID)
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) return true;
  return false;
}
/** how far solid ground goes down from y at (x, z): Infinity when it reaches the map's floor */
function solidDepth(x, y, z) {
  let top = y;
  for (let i = 0; i < 8; i++) {
    let next = null;
    for (const b of SOLID)
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 >= top - 0.08 && b.y0 < top - 0.01)
        if (!next || b.y0 < next.y0) next = b;
    if (!next) break;
    top = next.y0;
  }
  if (top > y - 0.01) return 0;
  return groundBelow(x, z, top - 0.01, 0.01) < -49 ? Infinity : y - top;
}
/** does a pod standing at (x, y, z) cut into anything above the ground, all the way up its fall? */
function podBlocked(x, y, z) {
  for (const b of SOLID) {
    if (b.y1 <= y + 0.06) continue;
    const dx = Math.max(b.x0 - x, 0, x - b.x1),
      dz = Math.max(b.z0 - z, 0, z - b.z1);
    if (dx * dx + dz * dz < POD_R * POD_R) return true;
  }
  return false;
}
const SEAT_TRY = [[0, 0]];
for (const r of [0.15, 0.3, 0.45])
  for (let i = 0; i < 8; i++)
    SEAT_TRY.push([Math.sin((i * Math.PI) / 4) * r, Math.cos((i * Math.PI) / 4) * r]);
/**
 * where the pod sits for a landing point: offset (x, z) from it, how deep it buries, and whether the
 * ground goes down to the map's floor (deep: it can sink out of sight); ok is false if no spot fits
 * @param {any} at
 */
function podSeat(at) {
  let off = null;
  for (const [ox, oz] of SEAT_TRY) {
    const x = at.x + ox,
      z = at.z + oz;
    if (podBlocked(x, at.y, z)) continue;
    let held = inSolid(x, at.y - 0.06, z);
    for (let i = 0; held && i < 8; i++) {
      const a = (i * Math.PI) / 4;
      held = inSolid(x + Math.sin(a) * 0.62, at.y - 0.06, z + Math.cos(a) * 0.62);
    }
    if (held) {
      off = [ox, oz];
      break;
    }
  }
  const [x, z] = off || [0, 0];
  let d = Infinity;
  for (const [sx, sz] of [
    [0, 0],
    [0.5, 0],
    [-0.5, 0],
    [0, 0.5],
    [0, -0.5],
  ])
    d = Math.min(d, solidDepth(at.x + x + sx, at.y, at.z + z + sz));
  const bury = off ? Math.max(0, Math.min(POD_BURY, d - POD_NOSE - 0.08)) : 0;
  return { x, z, bury, deep: d === Infinity, ok: !!off, key: at.x * 1e4 + at.y * 1e2 + at.z };
}
/* ---- drawing: every pod's parts are one instanced mesh per part (hull, nose, bands, petal, cap),
   so all the pods in the world cost five draws, plus the hull's shadow. A pod is a group whose
   petal and cap nodes carry their own transforms; podDraw() writes them out each frame before the
   render. The nose and bands take a per-pod tint (podTint: rgb multiplies the colour, a the glow) ---- */
const POD_N = 40;
function podTintMat(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 podTint;\nvarying vec4 vTint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTint = podTint;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec4 vTint;")
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse * vTint.rgb, opacity );"
      )
      .replace(
        "vec3 totalEmissiveRadiance = emissive;",
        "vec3 totalEmissiveRadiance = emissive * vTint.rgb * vTint.a;"
      );
  };
  m.customProgramCacheKey = () => "podTint";
  return m;
}
const POD_DRAW = (() => {
  const G0 = podGeo();
  const make = (geo, mat, n, tint, shadow = false) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tint) {
      const t = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      t.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("podTint", t);
    }
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.count = 0;
    m.visible = false;
    scene.add(m);
    return m;
  };
  /* (the nose and band geometries get the tint attribute: they are only drawn here) */
  return {
    hull: make(G0.hull, POD_MAT.hull, POD_N, false, true),
    nose: make(
      G0.nose,
      podTintMat(new THREE.MeshStandardMaterial({ color: "#2a1e18", roughness: 0.9, emissive: "#ff5a1a" })),
      POD_N,
      true
    ),
    bands: make(
      G0.bands,
      podTintMat(
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          emissive: "#ffffff",
          roughness: 0.4,
          side: THREE.DoubleSide,
        })
      ),
      POD_N,
      true
    ),
    petal: make(G0.petal, POD_MAT.hull, POD_N * 3),
    cap: make(G0.cap, POD_MAT.dark, POD_N),
    spikes: make(G0.spikes, ITEM_MAT.bone, 8),
  };
})();
/** every pod body in the world (live pods and the replay's ghosts) */
const POD_BODIES = new Set();
const _pdM = new THREE.Matrix4();
/** is this object and everything above it visible and in the scene? */
function podShown(o) {
  for (let i = 0; o && i < 16; o = o.parent, i++) {
    if (!o.visible) return false;
    if (o === scene) return true;
  }
  return false;
}
/** write every pod's parts into the instanced meshes (called just before the frame renders) */
function podDraw() {
  const D = POD_DRAW;
  let n = 0,
    np = 0,
    ns = 0;
  for (const b of POD_BODIES) {
    if (n >= POD_N || !podShown(b.g)) continue;
    b.g.updateMatrixWorld();
    const w = b.g.matrixWorld;
    D.hull.setMatrixAt(n, w);
    D.nose.setMatrixAt(n, w);
    D.bands.setMatrixAt(n, w);
    D.nose.geometry.attributes.podTint.setXYZW(n, 1, 1, 1, b.heatGlow);
    D.bands.geometry.attributes.podTint.setXYZW(n, b.color.r, b.color.g, b.color.b, b.glow);
    for (const d of b.doors) {
      if (d.cap) D.cap.setMatrixAt(n, _pdM.multiplyMatrices(w, d.m.matrix));
      else D.petal.setMatrixAt(np++, _pdM.multiplyMatrices(w, d.m.matrix));
    }
    if (b.kind === "skull" && ns < 8) D.spikes.setMatrixAt(ns++, w);
    n++;
  }
  for (const m of [D.hull, D.nose, D.bands, D.cap, D.petal, D.spikes]) {
    m.count = m === D.petal ? np : m === D.spikes ? ns : n;
    m.visible = m.count > 0;
    if (m.count) m.instanceMatrix.needsUpdate = true;
  }
  if (n) {
    D.nose.geometry.attributes.podTint.needsUpdate = true;
    D.bands.geometry.attributes.podTint.needsUpdate = true;
  }
  /* and the power weapons' supply pods (game/supply-pods.js) */
  supplyDraw();
}
function makePod(color) {
  const g = new THREE.Group();
  /* the upper shell: three petals and the cap, blown off on landing (nodes: drawn by podDraw) */
  const node = (x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const doors = [0, 1, 2].map(i => {
    const a = (i * Math.PI * 2) / 3;
    const d = node(Math.sin(a) * 0.72, 2.05, Math.cos(a) * 0.72);
    d.rotation.order = "YXZ";
    d.rotation.y = a;
    return { m: d, a, v: new V3(), spin: 0, cap: false, rest: false };
  });
  doors.push({ m: node(0, 2.775, 0), a: 0, v: new V3(), spin: 0, cap: true, rest: false });
  const fire = new THREE.Sprite(podFireMat.clone());
  fire.position.y = 3.1;
  fire.scale.set(1.6, 2.6, 1);
  g.add(fire);
  const retro = new THREE.Sprite(podFireMat.clone());
  retro.position.y = -0.4;
  retro.scale.set(1.2, 1.6, 1);
  retro.material.opacity = 0;
  retro.visible = false;
  g.add(retro);
  scene.add(g);
  /* glow: the team bands' brightness; heatGlow: the nose's */
  const body = { g, doors, fire, retro, color: new THREE.Color(color), glow: 1.6, heatGlow: 0 };
  POD_BODIES.add(body);
  return body;
}
/**
 * start a drop pod falling onto `pos`. onLand() runs on impact (place the pilot then).
 * h: the height it falls from (the trailer uses a short drop for its close shots)
 * @param {any} pos
 * @param {string} color team or pilot color
 * steer: { r, ok(x, z) } lets the rider nudge the landing point within r metres of where it was
 *   aimed, onto open ground that ok() accepts (CTF keeps you near your base); see steerPod
 * rider: this is your own pod (its hull and the burn around it are not drawn while you are inside)
 * kind: "pilot" (the default) or "skull": the trail it leaves (POD_TRAILS)
 * @param {{ dur?: number, h?: number, onLand?: Function, quiet?: boolean, rider?: boolean, kind?: string, steer?: { r: number, ok?: (x: number, z: number) => boolean } }} [o]
 */
function dropPod(pos, color, o = {}) {
  const h = o.h || POD_HEIGHT;
  const p = Object.assign(makePod(color), {
    at: pos.clone(),
    t: 0,
    dur: o.dur || POD_TIME,
    h,
    landed: false,
    life: 0,
    onLand: o.onLand || null,
    prev: new V3(pos.x, pos.y + h, pos.z),
    fog: null,
    /* steering: where it was aimed, and where it is drawn (eases toward at) */
    base: pos.clone(),
    vis: pos.clone(),
    steer: o.steer || null,
    skip: false,
    rider: !!o.rider,
    /** pilot, supply or skull: how its trail looks (POD_TRAILS) */
    kind: o.kind || "pilot",
    /** the rider is in the cockpit (game/pod-view.js); before that the opening shot sees it from outside */
    inside: false,
    /* where it comes to rest (podSeat), and the offset it eases toward on the way down */
    seat: null,
    ox: 0,
    oz: 0,
    heat: 1,
    blown: false,
  });
  p.g.position.copy(p.prev);
  p.g.rotation.y = Math.random() * 6;
  if (!o.quiet) sfx(p.dur < 2 ? "podq" : "pod", distVol(pos, 140));
  PODS.push(p);
  return p;
}
const _podV = new V3(),
  _podW = new V3();
/* the re-entry burn: red, orange and ember-yellow flame shed from the nose */
const BURN_COLS = [0xff3a14, 0xff6a1c, 0xff9a30, 0xffc45a];
/* each kind of pod reads differently from across the map, by colour and by more than colour:
   - a pilot: orange flame over a dark grey-brown smoke column, a plain straight trail;
   - a supply pod (a power weapon): a white-hot flame and pale smoke, the brightest of the three,
     with a strobe at its head (game/supply-pods.js);
   - the skull: a violet flame under black smoke, wrapped in a bright two-strand spiral of sparks. */
const POD_TRAILS = {
  pilot: {
    burn: BURN_COLS,
    smoke: [0x4a423c, 0x5c534b],
    ember: [0xffb347, 0xff5a1a],
    head: [0xffc070, 0xfff0d0],
  },
  supply: {
    burn: [0xfff4dc, 0xffe2a8, 0xffffff, 0xffd690],
    smoke: [0xd6dde4, 0xe8edf2],
    ember: [0xbfe6ff, 0xffffff],
    head: [0xffe2a8, 0xffffff],
  },
  skull: {
    burn: [0x7a24ff, 0xa83cff, 0xd05aff, 0x5a18e0],
    smoke: [0x161019, 0x221a26],
    ember: [0xe0a0ff, 0xffffff],
    head: [0xb070ff, 0xf2e0ff],
    spiral: true,
  },
};
const podTrailOf = p => POD_TRAILS[p.kind] || POD_TRAILS.pilot;
/** the re-entry trail between where the pod was last frame and where it is now (heat: 0..1; near
    shrinks the flame of a pod right beside the one you ride) */
function podTrail(p, heat, near = 1) {
  const a = p.prev,
    b = p.g.position,
    T = podTrailOf(p);
  const n = Math.min(10, pc(Math.ceil(a.distanceTo(b) / 1.6)));
  for (let i = 0; i < n; i++) {
    _podV.lerpVectors(a, b, (i + Math.random()) / n);
    _podV.y -= 0.2;
    /* the plasma sheath: big, bright and short-lived; it hangs where the pod passed (from inside, the
       cockpit draws its own) */
    if (!podHidden(p))
      ptAdd(
        PTS.glow,
        _podV,
        new V3(rnd(-1, 1), rnd(2, 6), rnd(-1, 1)),
        rnd(2.6, 4.4) * (0.5 + heat * 0.6) * near,
        T.burn[(Math.random() * T.burn.length) | 0],
        0.9 * heat,
        rnd(0.6, 1.4),
        { max: 1.4, grow: -0.5, drag: 2 }
      );
    /* smoke: a dark column that lingers and spreads */
    if (!podHidden(p) && Math.random() < 0.7)
      ptAdd(
        PTS.soft,
        _podW.copy(_podV).add(_fx.set(rnd(-0.4, 0.4), 1.5, rnd(-0.4, 0.4))),
        new V3(rnd(-0.6, 0.6), rnd(0.5, 1.5), rnd(-0.6, 0.6)),
        rnd(3, 4.8) * Math.max(0.5, near),
        T.smoke[Math.random() < 0.5 ? 0 : 1],
        0.55 * heat,
        rnd(2.5, 4),
        { max: 4, grow: 0.5, drag: 0.6 }
      );
    /* embers flung off the sheath */
    if (!podHidden(p) && Math.random() < 0.5)
      ptAdd(
        PTS.glow,
        _podV,
        new V3(rnd(-6, 6), rnd(-2, 8), rnd(-6, 6)),
        rnd(0.18, 0.35),
        T.ember[Math.random() < 0.5 ? 0 : 1],
        1,
        rnd(0.8, 1.6),
        { max: 1.6, g: 9, drag: 0.8 }
      );
    /* the skull's spiral: two strands of bright sparks wound round the trail, left hanging */
    if (T.spiral && !podHidden(p))
      for (const s of [0, Math.PI]) {
        const w = now * 9 + (i / n) * 1.2 + s;
        ptAdd(
          PTS.glow,
          _podW.set(_podV.x + Math.cos(w) * 1.4, _podV.y, _podV.z + Math.sin(w) * 1.4),
          new V3(0, rnd(0.5, 1.5), 0),
          0.5,
          T.ember[s ? 1 : 0],
          1,
          1.4,
          { max: 1.4, grow: -0.2 }
        );
      }
  }
}
/* ---- steering your own pod: the landing point moves with your input, never past the pod's
   radius, never onto ground without open sky above it, and only where the mode allows; it locks
   for the last moments so everyone can see where it will hit ---- */
const POD_STEER_SPEED = 9,
  POD_STEER_LOCK = 0.82;
const _stC = new V3();
/** is steering still open for this pod? */
const podSteerable = p => !!p.steer && !p.landed && p.t / p.dur < POD_STEER_LOCK;
/** move the landing point by (dx, dz) world metres per second; returns true if it moved */
function steerPod(p, dx, dz, dt) {
  if (!podSteerable(p) || (!dx && !dz)) return false;
  const s = p.steer;
  _stC.set(p.at.x + dx * POD_STEER_SPEED * dt, 0, p.at.z + dz * POD_STEER_SPEED * dt);
  /* stay within the radius around where it was aimed */
  const ox = _stC.x - p.base.x,
    oz = _stC.z - p.base.z,
    L = Math.hypot(ox, oz);
  if (L > s.r) {
    _stC.x = p.base.x + (ox / L) * s.r;
    _stC.z = p.base.z + (oz / L) * s.r;
  }
  if (s.ok && !s.ok(_stC.x, _stC.z)) return false;
  /* the ground there, and open sky above it */
  _stC.y = groundBelow(_stC.x, _stC.z, p.base.y + 8, 0.6) + 0.02;
  if (_stC.y < -10 || !skyClear(_stC) || !freeAt(_stC.x, _stC.y + 0.05, _stC.z, H_STAND)) return false;
  p.at.copy(_stC);
  return true;
}
/** where pods are coming down or have just landed (their pilots may still be standing there),
    other than `except` */
function podSpots(except) {
  const out = [];
  for (const p of PODS) if (p !== except && (!p.landed || p.life < 4)) out.push(p.at);
  return out;
}
/* the landing marker under your own pod while you can steer it */
const POD_MARK = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1.25, 40),
  new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false })
);
POD_MARK.rotation.x = -Math.PI / 2;
POD_MARK.visible = false;
scene.add(POD_MARK);
function podMarker(p) {
  POD_MARK.visible = !!p && !p.landed;
  if (!POD_MARK.visible) return;
  POD_MARK.position.set(p.vis.x, p.at.y + 0.06, p.vis.z);
  POD_MARK.material.color.setHex(podSteerable(p) ? 0xffb347 : 0xff5a3a);
  /* from 320 m up the ring would be a speck: it grows with height so it stays a target */
  const up = p.skip ? 0 : Math.max(0, p.g.position.y - p.at.y);
  POD_MARK.scale.setScalar((1 + Math.sin(now * 8) * 0.06) * (1 + up * 0.012));
}
/* riding your pod down: the fog and far plane lift with your height so the ground stays in view */
function podView(p) {
  if (!p.fog) p.fog = { near: scene.fog.near, far: scene.fog.far, cam: camera.far };
  const up = Math.max(0, p.g.position.y - p.at.y);
  scene.fog.near = p.fog.near + up;
  scene.fog.far = p.fog.far + up;
  camera.far = p.fog.cam + up;
  camera.updateProjectionMatrix();
}
function podViewEnd(p) {
  if (!p || !p.fog) return;
  scene.fog.near = p.fog.near;
  scene.fog.far = p.fog.far;
  camera.far = p.fog.cam;
  camera.updateProjectionMatrix();
  p.fog = null;
}
/* ---- the crater: slabs of floor kicked up around the rim (one instanced mesh shared by every pod,
   one draw call) over a cracked, scorched decal (kind 2 in render/combat-fx.js) ---- */
const RUBBLE_N = 64;
const RUBBLE = (() => {
  /* a broken floor plate: a slab with its corners pulled about (the same corner moves the same way
     on every face that shares it) */
  const g = new THREE.BoxGeometry(0.62, 0.1, 0.46);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    const h = Math.sin(x * 12.9898 + z * 78.233 + y * 3.1) * 43758.5453;
    const r = h - Math.floor(h);
    P.setXYZ(i, x * (0.75 + r * 0.5), y * (0.6 + r * 0.8), z * (1.2 - r * 0.5));
  }
  g.computeVertexNormals();
  const m = new THREE.InstancedMesh(
    g,
    new THREE.MeshStandardMaterial({ color: "#3b4045", roughness: 0.8, metalness: 0.45, flatShading: true }),
    RUBBLE_N
  );
  m.frustumCulled = false;
  m.count = 0;
  m.visible = false;
  scene.add(m);
  return { mesh: m, list: [] };
})();
const _rbE = new THREE.Euler(0, 0, 0, "YXZ"),
  _rbQ = new THREE.Quaternion(),
  _rbM = new THREE.Matrix4(),
  _rbS = new V3();
/** crack the ground around a landed pod centred at c (the ground is at c.y); size scales it (supply pods) */
function podCrater(p, c, size = 1) {
  decal(_podV.set(c.x, c.y, c.z), _podW.set(0, 1, 0), 2, 4.2 * size);
  const n = Math.round(11 * size),
    a0 = Math.random() * 6;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + rnd(-0.18, 0.18),
      r = rnd(0.98, 1.45) * size;
    const x = c.x + Math.sin(a) * r,
      z = c.z + Math.cos(a) * r;
    /* only on ground that is there, and never into a wall */
    if (!inSolid(x, c.y - 0.06, z) || inSolid(x, c.y + 0.14, z)) continue;
    if (RUBBLE.list.length >= RUBBLE_N) RUBBLE.list.shift();
    RUBBLE.list.push({
      p,
      x,
      y: c.y - 0.03,
      z,
      a,
      tilt: -rnd(0.3, 0.75),
      roll: rnd(-0.25, 0.25),
      s: rnd(0.75, 1.5) * size,
    });
  }
  /* the shockwave: a low ring of dust racing out along the ground */
  for (let i = 0, k = pc(28 * size); i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rnd(-0.1, 0.1),
      v = rnd(8, 11) * size;
    ptAdd(
      PTS.soft,
      _podV.set(c.x + Math.sin(a) * 1.1 * size, c.y + 0.3, c.z + Math.cos(a) * 1.1 * size),
      new V3(Math.sin(a) * v, rnd(0.2, 1), Math.cos(a) * v),
      rnd(1, 1.7),
      0x8a8178,
      0.5,
      rnd(0.8, 1.3),
      { max: 1.3, grow: 1.5, drag: 2.4 }
    );
  }
}
function updRubble() {
  const L = RUBBLE.list;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const r = L[i];
    /* (a pod or supply pod that is gone takes its slabs with it) */
    if (r.p.gone) continue;
    L[n++] = r;
    /* the slabs go down with the wreck */
    const sink = r.p.g.position.y - (r.p.at.y - r.p.seat.bury);
    _rbE.set(r.tilt, r.a, r.roll);
    _rbQ.setFromEuler(_rbE);
    _rbM.compose(_podV.set(r.x, r.y + Math.min(0, sink), r.z), _rbQ, _rbS.setScalar(r.s * r.p.g.scale.x));
    RUBBLE.mesh.setMatrixAt(n - 1, _rbM);
  }
  L.length = n;
  RUBBLE.mesh.count = n;
  RUBBLE.mesh.visible = n > 0;
  if (n) RUBBLE.mesh.instanceMatrix.needsUpdate = true;
}
/** the landing: the pod punches into the ground and cracks it */
function podImpact(p) {
  p.landed = true;
  p.vis.copy(p.at);
  if (!p.seat || p.seat.key !== p.at.x * 1e4 + p.at.y * 1e2 + p.at.z) p.seat = podSeat(p.at);
  const s = p.seat;
  p.ox = s.x;
  p.oz = s.z;
  p.g.position.set(p.at.x + s.x, p.at.y - s.bury, p.at.z + s.z);
  p.g.visible = true;
  p.fire.visible = false;
  p.retro.visible = false;
  const c = _podW.set(p.at.x + s.x, p.at.y - 0.02, p.at.z + s.z).clone();
  shock(p.at);
  /* (from inside, the cockpit flashes white instead) */
  if (!p.rider) blast(_podV.copy(c).setY(c.y + 0.4), 0xffb070, 3);
  dust(c, 34, 4.5, 1.6, 0.9);
  podCrater(p, c);
  sfx("podland", distVol(p.at, 60));
  sfx("podcrack", distVol(p.at, 40));
  const near = distVol(p.at, 34);
  if (near > 0) {
    shakeT = Math.max(shakeT, near * 0.5);
    rumble(near, near * 0.8, 260);
  }
  podViewEnd(p);
}
/** the shell blows: three petals out, the cap up */
function podBlow(p) {
  p.blown = true;
  for (const d of p.doors) {
    if (d.cap) {
      const a = rnd(0, 6.28),
        v = rnd(2.4, 3.4);
      d.v.set(Math.sin(a) * v, rnd(7, 9), Math.cos(a) * v);
      d.spin = rnd(-8, 8);
    } else {
      /* outward, in the pod's own (turned) frame */
      const v = rnd(4.5, 6.5);
      d.v.set(Math.sin(d.a) * v, rnd(3, 5), Math.cos(d.a) * v);
      d.spin = rnd(3, 7);
    }
  }
  /* the explosive bolts: a white puff at each seam */
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 3 + p.g.rotation.y;
    _podV.set(
      p.g.position.x + Math.sin(a) * 0.75,
      p.g.position.y + 2.05,
      p.g.position.z + Math.cos(a) * 0.75
    );
    ptAdd(PTS.glow, _podV, new V3(), 1.1, 0xfff0d0, 1, 0.12);
    for (let j = 0; j < 3; j++)
      ptAdd(
        PTS.soft,
        _podV,
        new V3(Math.sin(a) * rnd(1.5, 3), rnd(0.5, 2), Math.cos(a) * rnd(1.5, 3)),
        rnd(0.6, 1),
        0xc9c2b8,
        0.5,
        rnd(0.7, 1.1),
        { grow: 1.4, drag: 2 }
      );
  }
  sfx("podbolts", distVol(p.at, 50));
}
function updPods(dt) {
  /* pods falling right beside the one you ride burn smaller, so your window is not all flame */
  const ride = PODS.find(q => q.rider && q.inside && !q.landed && !q.skip);
  for (let i = PODS.length - 1; i >= 0; i--) {
    const p = PODS[i];
    if (!p.landed) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      /* slow at first, faster all the way to a hard impact; retros flare in the last moments */
      const h = p.h * podLeft(k);
      p.prev.copy(p.g.position);
      p.vis.lerp(p.at, Math.min(1, dt * 8));
      /* where it will come to rest, once the landing point is nearly settled */
      if (k > 0.6 && (!p.seat || p.seat.key !== p.at.x * 1e4 + p.at.y * 1e2 + p.at.z)) p.seat = podSeat(p.at);
      if (p.seat) {
        p.ox += (p.seat.x - p.ox) * Math.min(1, dt * 6);
        p.oz += (p.seat.z - p.oz) * Math.min(1, dt * 6);
      }
      p.g.position.set(p.vis.x + p.ox, p.at.y + h, p.vis.z + p.oz);
      p.g.rotation.y += dt * 2.5;
      /* your own pod is drawn from inside (game/pod-view.js) */
      p.g.visible = !podHidden(p);
      p.fire.material.opacity = 0.6 + Math.random() * 0.4;
      p.retro.material.opacity = k > 0.8 ? (k - 0.8) * 5 * (0.7 + Math.random() * 0.3) : 0;
      /* a sprite draws even when it is fully transparent */
      p.retro.visible = p.retro.material.opacity > 0.01;
      /* the nose runs white-hot through the burn and dims as the retros take over */
      /* (your own opening shot sees it burn bright from the start) */
      const heat = p.rider && !p.inside && !p.skip ? Math.max(0.75, podHeat(k)) : podHeat(k);
      p.heat = heat;
      p.heatGlow = 1.4 + heat * 2.6;
      const near =
        ride && ride !== p
          ? clamp(
              (Math.hypot(p.g.position.x - ride.g.position.x, p.g.position.z - ride.g.position.z) - 2) / 10,
              0.3,
              1
            )
          : 1;
      /* your own opening shot is a few metres away: a tighter burn, at the nose, so the hull shows */
      const close = p.rider && !p.inside && !p.skip;
      podTrail(p, heat, close ? 0.3 : near);
      /* the fireball at the head of the trail */
      if (!podHidden(p)) {
        const f = close ? 0.2 : near;
        _podW.copy(p.g.position);
        if (close) _podW.y -= 0.5;
        const hc = podTrailOf(p).head;
        ptAdd(PTS.glow, _podW, new V3(), 7 * heat * f, hc[0], close ? 0.8 : near, 0.05);
        ptAdd(PTS.glow, _podW, new V3(), 3 * heat * f, hc[1], 1, 0.05);
      }
      /* the burn lights the ground as it comes in, and the air shimmers around it */
      if (h < 70) {
        dynLight(p.g.position, 0xff9a50, 5 * heat * (1 - h / 70), 0.05, 26);
        if (!podHidden(p)) heatAt(p.g.position, 2.2 * heat, 1.2);
      }
      if (k >= 1) {
        podImpact(p);
        if (p.onLand) p.onLand(p.at);
      }
      continue;
    }
    /* landed: the shell blows, the petals and cap tumble away, the wreck smokes in its crater, then
       sinks out of sight (or, on a thin floor, shrinks away) */
    p.life += dt;
    if (!p.blown && p.life >= POD_BLOW) podBlow(p);
    const rest = p.seat.bury;
    if (p.blown)
      for (const d of p.doors) {
        if (d.rest) continue;
        d.v.y -= 16 * dt;
        d.m.position.addScaledVector(d.v, dt);
        if (d.cap) {
          d.m.rotation.x += d.spin * dt;
          d.m.rotation.z += d.spin * 0.6 * dt;
        } else d.m.rotation.x += d.spin * dt;
        const floor = rest + (d.cap ? 0.24 : 0.1);
        if (d.m.position.y < floor && d.v.y < 0) {
          d.m.position.y = floor;
          d.rest = true;
          /* petals settle on their backs, the cap upright */
          if (d.cap) d.m.rotation.set(0, d.m.rotation.y, 0);
          else d.m.rotation.x = Math.PI / 2;
        }
      }
    p.glow = Math.max(0.3, 1.6 - p.life * 0.4);
    p.heatGlow = Math.max(0, 2 - p.life * 0.5);
    /* the hot wreck smokes, and the crater glows a little */
    if (p.life < 4 && (!p.rider || p.life > 1.2) && Math.random() < dt * 8)
      ptAdd(
        PTS.soft,
        _podV.set(p.g.position.x + rnd(-0.5, 0.5), p.at.y + 0.5, p.g.position.z + rnd(-0.5, 0.5)),
        new V3(rnd(-0.3, 0.3), rnd(0.8, 1.6), rnd(-0.3, 0.3)),
        rnd(0.8, 1.4),
        0x5c534b,
        0.35,
        2.5,
        { grow: 0.6, drag: 0.5 }
      );
    if (p.life < 1.5 && Math.random() < dt * 10)
      ptAdd(
        PTS.glow,
        _podV.set(p.g.position.x + rnd(-1.2, 1.2), p.at.y + 0.1, p.g.position.z + rnd(-1.2, 1.2)),
        new V3(rnd(-0.5, 0.5), rnd(1, 3), rnd(-0.5, 0.5)),
        rnd(0.08, 0.16),
        0xff9a40,
        1,
        rnd(0.5, 1),
        { g: 4 }
      );
    if (p.life > 6) {
      if (p.seat.deep) p.g.position.y = p.at.y - rest - (p.life - 6) * 1.4;
      else p.g.scale.setScalar(Math.max(0.001, 1 - (p.life - 6) / 2.5));
    }
    if (p.life > 8.5) {
      disposePod(p);
      PODS.splice(i, 1);
    }
  }
  updRubble();
}
/* the geometry is shared; the per-pod materials are not */
function disposePod(p) {
  scene.remove(p.g);
  p.gone = true;
  POD_BODIES.delete(p);
  p.fire.material.dispose();
  p.retro.material.dispose();
}
function clearPods() {
  for (const p of PODS) {
    podViewEnd(p);
    disposePod(p);
  }
  PODS.length = 0;
  clearSupply();
  updRubble();
}
