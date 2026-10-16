/* ============ pilot rig ============
   An armored pilot built procedurally from 32 bones: pelvis, a two-segment spine and chest, neck
   and head, clavicles, shoulders, elbows, wrists, two-joint fingers and a thumb on each hand, hips,
   knees, ankles and toes, front hip tassets and a sprung antenna. Every armor part is attached to a
   bone and the whole body is skinned rigidly into one mesh per material, so a pilot draws in about
   ten calls however many joints it has (the skinned geometry is shared by every pilot).
   Motion: locomotion comes from motion capture (characters/anim.js: the pelvis, spine and legs, with
   the feet placed by two-bone leg IK); on top of it, two-bone IK arms with clavicles that shrug into
   the reach, hands that close around whatever they hold (weapon, flag), a head that looks at the aim,
   breathing, the special moves' legs, and springs for lean, bank, landing, flinch, recoil, tassets
   and antenna. */
const DOWN = new V3(0, -1, 0);
/** @type {[string, number][]} */
const SIDES = [
  ["L", -1],
  ["R", 1],
];
const _a = new V3(),
  _b = new V3(),
  _c = new V3(),
  _q1 = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _q3 = new THREE.Quaternion(),
  _m1 = new THREE.Matrix4(),
  _e1 = new THREE.Euler(),
  _pole = new V3(),
  _lk = new V3(),
  _rk = new V3(),
  _kA = new V3(),
  _kB = new V3(),
  _dl = new V3(),
  _sp = new V3();
const _up = new THREE.Object3D();
function solve2(up, lo, a, b, S, T, pole) {
  const u = _a.subVectors(T, S);
  let d = u.length();
  if (d < 1e-4) return;
  u.multiplyScalar(1 / d);
  d = clamp(d, Math.abs(a - b) + 0.01, a + b - 0.002);
  const p = _b.copy(pole).addScaledVector(u, -pole.dot(u));
  if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
  p.normalize();
  const ca = (a * a + d * d - b * b) / (2 * a * d),
    sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const e = _c
    .copy(u)
    .multiplyScalar(a * ca)
    .addScaledVector(p, a * sa);
  _dl.copy(u).multiplyScalar(d).sub(e).normalize();
  e.normalize();
  up.quaternion.setFromUnitVectors(DOWN, e);
  _q1.copy(up.quaternion).invert();
  _dl.applyQuaternion(_q1);
  lo.quaternion.setFromUnitVectors(DOWN, _dl);
}
function capsule(r, len, seg = 10) {
  const pts = [];
  const half = Math.max(0, len / 2 - r);
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i * (Math.PI / 2)) / 5;
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r), -half + Math.sin(a) * r));
  }
  for (let i = 0; i <= 5; i++) {
    const a = (i * (Math.PI / 2)) / 5;
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r), half + Math.sin(a) * r));
  }
  return new THREE.LatheGeometry(pts, seg);
}
/** a box with rounded edges (r), for armor plates that catch the light instead of reading as blocks */
function rbox(w, h, d, r = 0.012) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const P = g.attributes.position,
    hx = Math.max(0, w / 2 - r),
    hy = Math.max(0, h / 2 - r),
    hz = Math.max(0, d / 2 - r);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    const cx = clamp(x, -hx, hx),
      cy = clamp(y, -hy, hy),
      cz = clamp(z, -hz, hz);
    const dx = x - cx,
      dy = y - cy,
      dz = z - cz,
      L = Math.hypot(dx, dy, dz);
    if (L > 1e-6) P.setXYZ(i, cx + (dx / L) * r, cy + (dy / L) * r, cz + (dz / L) * r);
  }
  g.computeVertexNormals();
  return g;
}
const GEO = {};
const geo = (k, f) => {
  if (!GEO[k]) {
    GEO[k] = f();
    GEO[k].userData.k = k;
  }
  return GEO[k];
};
const SHIELD_GOLD = new THREE.Color("#ffd36b"),
  SHIELD_BROKEN = new THREE.Color("#ff6a2e"),
  HIT_RED = new THREE.Color("#ff3a2a"),
  HIT_WHITE = new THREE.Color("#ffffff");
function shieldMaterial() {
  /* the shield shimmer, skinned like the body it wraps */
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uT: { value: 0 }, uC: { value: new THREE.Color("#ffd36b") } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: [
      "#include <common>",
      "#include <skinning_pars_vertex>",
      "varying vec3 vN;varying vec3 vV;varying vec3 vP;",
      "void main(){",
      "#include <beginnormal_vertex>",
      "#include <skinbase_vertex>",
      "#include <skinnormal_vertex>",
      "#include <begin_vertex>",
      "#include <skinning_vertex>",
      "vec4 mv=modelViewMatrix*vec4(transformed,1.);vN=normalize(normalMatrix*objectNormal);vV=normalize(-mv.xyz);",
      "vP=(modelMatrix*vec4(transformed,1.)).xyz;gl_Position=projectionMatrix*mv;}",
    ].join("\n"),
    fragmentShader:
      "uniform float uI;uniform float uT;uniform vec3 uC;varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.5);float band=.5+.5*sin(vP.y*42.-uT*26.)*sin(vP.x*23.+vP.z*19.+uT*11.);float a=clamp(uI*(f*1.4+.2)*(.45+.55*band),0.,1.);gl_FragColor=vec4(uC*(1.+f*1.5),a);}",
  });
}
/* where the weapon sits (in the chest's frame) for each stance, and per weapon: grip and support-hand
   points. A fighting carry: the gun up and pushed out in front, even at a run (port arms) */
const POSE = {
  aim: { p: new V3(0.11, 0.075, -0.26), r: [0, 0, 0] },
  /* carried, not firing: level at the chest, angled down and across (it comes up to the shoulder to
     shoot); the magnum two-handed at the sternum */
  carry: { p: new V3(0.07, -0.05, -0.24), r: [-0.32, 0.38, 0.22] },
  pistolCarry: { p: new V3(0.04, -0.03, -0.27), r: [-0.42, 0.05, 0] },
  /* sprinting: hugged high against the chest in the right hand, muzzle up past the left shoulder
     (the free arm pumps) */
  sprint: { p: new V3(0.06, 0.03, -0.17), r: [1.05, 0.5, 0.35] },
  /* sliding, hovering in a ground pound: held across the chest, muzzle up and to the left */
  across: { p: new V3(0.03, -0.02, -0.21), r: [0.55, 0.55, 0.4] },
  /* a shoulder charge: held upright beside the head, the right shoulder leading */
  charge: { p: new V3(0.15, 0.12, -0.06), r: [1.25, 0.1, -0.1] },
  reload: { p: new V3(0.08, 0.02, -0.25), r: [0.22, 0.25, 0.65] },
  low: { p: new V3(0.12, -0.12, -0.14), r: [-0.7, 0.2, 0.2] },
  rocket: { p: new V3(0.15, 0.13, -0.08), r: [0, 0, 0] },
  rocketRun: { p: new V3(0.12, 0.06, -0.04), r: [-0.35, 0.25, 0.1] },
  /* aiming down sights: the gun comes up to the eye, stock at the cheek (rifles) or arms out (magnum) */
  ads: { p: new V3(0.05, 0.19, -0.2), r: [0, 0, 0] },
  adsPistol: { p: new V3(0.02, 0.2, -0.55), r: [0, 0, 0] },
  /* the magnum: two hands, out in front on the centerline, elbows wide */
  pistol: { p: new V3(0.05, 0.1, -0.38), r: [0, 0, 0] },
};
/* the free hand's path through a grenade throw (chest frame), t in seconds */
const RIG_THROW_KEYS = [
  [0, -0.18, 0.05, -0.3],
  [0.08, -0.22, 0.45, 0.08],
  [0.13, -0.06, 0.32, -0.5],
  [0.24, -0.3, -0.2, -0.12],
  [0.45, -0.22, -0.05, -0.28],
];
function throwHand(t, out) {
  const K = RIG_THROW_KEYS;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[i],
    b = K[i + 1],
    u = sstep(a[0], b[0], t);
  return out.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
}
/** the torso's turn through a throw: the free shoulder goes back, then drives through */
const throwTwist = t =>
  t >= 0.45
    ? 0
    : t < 0.09
      ? 0.3 * sstep(0, 0.09, t)
      : t < 0.25
        ? 0.3 - 0.55 * sstep(0.09, 0.2, t)
        : -0.25 * (1 - sstep(0.25, 0.45, t));
/* a blow in three parts over its 0..1: the wind-up (w, cocking back), the strike (s, fast out to full
   reach and held), the follow-through past it (f), then the recovery; contact is at MEL_HIT */
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const MEL = { w: 0, s: 0, f: 0 },
  MEL_HIT = 0.28;
function meleeShape(u) {
  MEL.w = u < 0 ? 0 : u < 0.1 ? Math.sin((u / 0.1) * 1.5708) : u < 0.17 ? 1 - (u - 0.1) / 0.07 : 0;
  const k = clamp((u - 0.1) / (MEL_HIT - 0.1), 0, 1);
  MEL.s =
    u < 0.1
      ? 0
      : u < 0.55
        ? 1 - (1 - k) * (1 - k) * (1 - k)
        : 0.5 + 0.5 * Math.cos(((u - 0.55) / 0.45) * Math.PI);
  MEL.f = u > MEL_HIT && u < 0.55 ? Math.sin(((u - MEL_HIT) / (0.55 - MEL_HIT)) * Math.PI) : 0;
  return MEL;
}
const WPN_RIG = [
  { grip: new V3(0, -0.08, 0.1), fore: new V3(0, -0.05, -0.22), kick: 3, every: 0.1 },
  { grip: new V3(0, -0.08, 0.09), fore: new V3(-0.026, -0.093, 0.076), kick: 8, every: 0.26, flip: 1 },
  { grip: new V3(0, -0.08, 0.14), fore: new V3(0, -0.05, -0.28), kick: 9, every: 0.62 },
  { grip: new V3(0, -0.15, 0.08), fore: new V3(0, -0.14, -0.26), kick: 12, every: 0.9, foreGrip: 1 },
  { grip: new V3(0, -0.08, 0.12), fore: new V3(0, -0.06, -0.31), kick: 10, every: 0.8 },
];
const MAGSLOT = new V3(0, -0.11, -0.08);
/* one reload, shared by the first-person viewmodel and every rig (fractions of the reload time):
   grab the magazine, pull it out (it drops), reach to the pouch, bring the new one up under the
   well, seat it, slap it home, then reach for the charging handle (slide on the magnum), pull it
   back and let it go */
const RELOAD_T = {
  grab: 0.1,
  out: 0.24,
  pouch: 0.38,
  well: 0.54,
  seat: 0.66,
  slap: 0.72,
  reach: 0.8,
  back: 0.88,
  release: 0.93,
};
const RIG_RELOAD = [
  [0, "F"],
  [RELOAD_T.grab, [0, -0.17, -0.08]],
  [RELOAD_T.out, [0, -0.42, -0.04]],
  [RELOAD_T.pouch, [-0.06, -0.52, 0.1]],
  [RELOAD_T.well, [0, -0.36, -0.08]],
  [RELOAD_T.seat, [0, -0.2, -0.08]],
  [RELOAD_T.slap, [0, -0.15, -0.08]],
  [RELOAD_T.reach, [-0.05, 0.07, 0.0]],
  [RELOAD_T.back, [-0.05, 0.075, 0.12]],
  [RELOAD_T.release, [-0.05, 0.07, 0.03]],
  [1, "F"],
];
/** is the magazine in the support hand at reload fraction r? (out to pouch, and pouch to seated) */
const magInHand = r => (r >= RELOAD_T.grab && r < RELOAD_T.out) || (r >= RELOAD_T.pouch && r < RELOAD_T.seat);
/** the gun's own motion through a reload: tilt to show the well, a jolt on the slap, a tug on the bolt */
function reloadGunMotion(r, pos, rot) {
  const T = RELOAD_T;
  const bump = (a, b) => (r > a && r < b ? Math.sin(((r - a) / (b - a)) * Math.PI) : 0);
  /* present the magazine well to the support hand */
  const tilt = bump(T.grab - 0.04, T.slap + 0.04);
  rot.z += 0.38 * tilt;
  rot.y -= 0.12 * tilt;
  /* the slap: a sharp upward jolt as the magazine seats */
  pos.y += 0.035 * bump(T.seat, T.slap + 0.05);
  /* the bolt: the gun rolls toward the hand pulling it, then snaps forward on release */
  const bolt = bump(T.reach, T.release);
  rot.z += 0.22 * bolt;
  pos.z -= 0.025 * bump(T.release - 0.01, T.release + 0.05);
}
function reloadKey(keys, r, fore, out) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i],
      [t1, b] = keys[i + 1];
    if (r <= t1) {
      let k = (r - t0) / (t1 - t0);
      k = k * k * (3 - 2 * k);
      const A = a === "F" ? _kA.copy(fore) : _kA.set(a[0], a[1], a[2]);
      const B = b === "F" ? _kB.copy(fore) : _kB.set(b[0], b[1], b[2]);
      return out.copy(A).lerp(B, k);
    }
  }
  return out.copy(fore);
}
/* where the palm's centre is in a hand's frame (the right hand's; the left mirrors x) */
const PALM = new V3(0.0375, -0.06, 0);
const _gx = new V3(),
  _gy = new V3(),
  _gz = new V3(),
  _gv = new V3(),
  _gpull = new V3(),
  _gc = new V3(),
  _gn = new V3(),
  _gk = new V3(),
  _gqL = new THREE.Quaternion(),
  _gqR = new THREE.Quaternion();
/* damped spring (substepped for stability at low frame rates) */
const spr = () => ({ x: 0, v: 0 });
function spring(s, t, dt, f, z) {
  const w = 6.2832 * f;
  let n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  while (n--) {
    s.v += (w * w * (t - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
}
const glowMat = new THREE.SpriteMaterial({
  color: 0x9fdcff,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

/* ---- the skeleton: [name, parent, x, y, z] in the parent's frame, rest pose ---- */
const BONES = [["pivot", null, 0, 0, 0]];
(() => {
  const B = (n, p, x, y, z) => BONES.push([n, p, x, y, z]);
  B("pelvis", "pivot", 0, 0.96, 0);
  B("spine", "pelvis", 0, 0.05, 0);
  B("spine2", "spine", 0, 0.14, 0);
  B("chest", "spine2", 0, 0.14, 0);
  B("neck", "chest", 0, 0.27, 0);
  B("head", "neck", 0, 0.04, 0);
  B("antenna", "chest", 0.12, 0.27, 0.22);
  for (const [s, sd] of SIDES) {
    B("clav" + s, "chest", sd * 0.085, 0.19, 0);
    B("sh" + s, "clav" + s, sd * 0.185, -0.02, 0);
    B("el" + s, "sh" + s, 0, -0.3, 0);
    B("hand" + s, "el" + s, 0, -0.29, 0);
    B("fing" + s, "hand" + s, 0, -0.08, 0);
    B("tip" + s, "fing" + s, 0, -0.045, 0);
    B("thumb" + s, "hand" + s, -sd * 0.022, -0.035, -0.05);
    B("hip" + s, "pelvis", sd * 0.11, -0.05, 0);
    B("kn" + s, "hip" + s, 0, -0.44, 0);
    B("an" + s, "kn" + s, 0, -0.43, 0);
    B("toe" + s, "an" + s, 0, -0.06, -0.1);
    B("tas" + s, "pelvis", sd * 0.1, -0.02, -0.13);
  }
  /* the tabard: a front and a back flap of cloth hung from the belt, two segments each */
  for (const [n, z] of [
    ["tabF", -0.165],
    ["tabB", 0.15],
  ]) {
    B(n, "pelvis", 0, 0.03, z);
    B(n + "2", n, 0, -0.16, 0);
  }
  /* sprung attachments (the armour hangs its parts on them): the shoulder pads hinge at their top inner
     edge, the belt pouches and the rear plate hang from the belt's top edge, the pack from its top edge */
  for (const [s, sd] of SIDES) {
    B("pad" + s, "sh" + s, sd * 0.03, 0.09, 0);
    B("pouch" + s, "pelvis", sd * 0.12, 0.065, 0.15);
  }
  B("pouchB", "pelvis", 0, 0.035, 0.125);
  B("pack", "chest", 0, 0.26, 0.21);
})();
/* material roles shared by every pilot's skinned geometry */
const SUIT = 0,
  ARM = 1,
  ARM2 = 2,
  TRIM = 3,
  VISOR = 4,
  GLOW = 5,
  /* the vents' heat cores (characters/armour.js): dark at rest, hot with the movement kit */
  HEAT = 6;
/* (the armour itself, its distance levels and the skinning: characters/armour.js) */
/* ---- weapons and the carried flag: ordinary meshes in the chest's frame (one is shown at a time) ---- */
const WGEO = new Map();
/* each weapon's model (weapons/models.js) moved so its grip sits where WPN_RIG puts the hand, drawn with
   only the materials that weapon has always used (one draw each per pilot); parts made of another
   material take the nearest it has */
/** @type {[number, number, number[]][]} */
const WPN_FIT = [
  [0.02, 0.02, [TRIM, ARM, GLOW, SUIT]],
  [-0.008, 0.042, [TRIM, SUIT, GLOW]],
  [0.02, 0.02, [TRIM, GLOW, SUIT, ARM2]],
  [0.06, 0.04, [ARM2, TRIM, GLOW, SUIT]],
  [0.02, 0.06, [TRIM, ARM2, SUIT, ARM, GLOW]],
];
const WPN_ROLE = { D: TRIM, P: ARM2, A: ARM, S: SUIT, G: GLOW, C: ARM };
function weaponParts(i) {
  if (i >= 0) {
    const [oy, oz, has] = WPN_FIT[i];
    return gunParts(i)
      .filter(p => !p.fp && p.k !== "n" && !(i === 0 && p.mag))
      .map(p => {
        let role = WPN_ROLE[p.m];
        if (!has.includes(role)) role = role === ARM ? ARM2 : role === ARM2 ? ARM : TRIM;
        if (!has.includes(role)) role = TRIM;
        return { g: gunGeo(p, false), role, x: p.x, y: p.y + oy, z: p.z + oz, rx: p.rx };
      });
  }
  /* the flag: a pole held across the body (the cloth is added per pilot) */
  const cy = (k, a, b, h, s = 12) => geo("wc:" + k, () => new THREE.CylinderGeometry(a, b, h, s));
  return [
    { g: cy("fpole", 0.02, 0.02, 1.9, 8), role: TRIM, x: 0, y: 0, z: 0, rx: 0 },
    { g: sph0("ftip"), role: GLOW, x: 0, y: 0.96, z: 0, rx: 0 },
  ];
}
const sph0 = k => geo("ws:" + k, () => new THREE.SphereGeometry(0.035, 10, 8));
function weaponMeshes(i, mats) {
  if (!WGEO.has(i)) {
    const by = new Map();
    for (const p of weaponParts(i)) {
      const m = new THREE.Matrix4().compose(
        new V3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx, 0, 0)),
        new V3(1, 1, 1)
      );
      if (!by.has(p.role)) by.set(p.role, []);
      by.get(p.role).push([p.g, m]);
    }
    WGEO.set(
      i,
      [...by].map(([role, list]) => [role, mergeGeos(list)])
    );
  }
  /* one mesh per material; only the weapon's main body casts a shadow (the small parts' shadows
     are lost inside the pilot's, and each would cost a shadow-pass draw per pilot) */
  const g = new THREE.Group();
  WGEO.get(i).forEach(([role, gg], k) => {
    const m = new THREE.Mesh(gg, mats[role]);
    m.castShadow = k === 0 && role !== GLOW;
    m.userData.role = role;
    g.add(m);
  });
  return g;
}
/* the carbine's grip with its magazine seated, merged: the loose magazine is only drawn mid-reload */
let GRIP_MAG = null;
/** the oddball skull as a carrier holds it (one shared geometry; held between the hands of the flag grip) */
let SKULL_GEO = null;
function carriedSkull() {
  if (!SKULL_GEO) {
    const cran = new THREE.SphereGeometry(0.15, 14, 10);
    /* (as a matrix: the headless three.js stand-in treats .scale as a property) */
    cran.applyMatrix4(new THREE.Matrix4().makeScale(1, 1.05, 1.15));
    const face = new THREE.BoxGeometry(0.18, 0.1, 0.14);
    face.translate(0, -0.09, -0.07);
    SKULL_GEO = mergeGeos([
      [cran, new THREE.Matrix4()],
      [face, new THREE.Matrix4()],
    ]);
  }
  const m = new THREE.Mesh(
    SKULL_GEO,
    new THREE.MeshStandardMaterial({
      color: "#f2e6c9",
      emissive: "#ffcf6b",
      emissiveIntensity: 0.3,
      roughness: 0.55,
    })
  );
  /* at the carry's origin, the face forward (the hands grip its sides: rig.update) */
  m.rotation.set(-0.15, 0, 0);
  return m;
}
function flagCloth(color) {
  const g = new THREE.PlaneGeometry(0.62, 0.4, 8, 3);
  g.translate(0.31, 0, 0);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.6,
    })
  );
  m.userData.base = g.attributes.position.array.slice();
  return m;
}

const HULL_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function makePilot(color, label) {
  /* layered look: dark undersuit, team-coloured plates over a graphite second layer, gunmetal trim,
     dark lit eye slits and team-lit seams that catch the bloom (physical lobes on High: look.js) */
  const armorM = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.55 });
  armorM.color.multiplyScalar(0.62);
  const armor2M = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0.45 });
  armor2M.color.multiplyScalar(0.36);
  const suitM = new THREE.MeshPhysicalMaterial({
    color: "#1b2125",
    roughness: 0.82,
    metalness: 0.1,
  });
  const trimM = new THREE.MeshStandardMaterial({
    color: "#363f45",
    roughness: 0.38,
    metalness: 0.8,
  });
  const visorM = new THREE.MeshPhysicalMaterial({
    color: "#0d1418",
    emissive: "#7fe0ff",
    emissiveIntensity: 0.6,
    roughness: 0.08,
    metalness: 0.9,
  });
  const glowM = new THREE.MeshStandardMaterial({
    color: "#000000",
    emissive: color,
    emissiveIntensity: 1.5,
    roughness: 0.5,
  });
  const heatM = new THREE.MeshStandardMaterial({
    color: "#0c0d0e",
    emissive: "#ff3a0c",
    emissiveIntensity: 0.03,
    roughness: 0.6,
  });
  const mats = [suitM, armorM, armor2M, trimM, visorM, glowM, heatM];
  /* weapons and the flag are plain meshes with their own copies of the materials (three.js compiles a
     skinned and an unskinned program either way; separate copies keep their settings apart) */
  const wmats = mats.map(m => m.clone());
  const shieldM = shieldMaterial();
  /* bones */
  const root = new THREE.Group();
  const byName = {},
    bones = [];
  for (const [n, p, x, y, z] of BONES) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(x, y, z);
    (p ? byName[p] : root).add(b);
    byName[n] = b;
    bones.push(b);
  }
  root.updateMatrixWorld(true);
  if (!SKIN) SKIN = buildSkin(bones, byName);
  /* (the near level to start with; rig.update picks the level by distance) */
  const skel = new THREE.Skeleton(bones);
  const ident = new THREE.Matrix4();
  const skinned = SKIN.levels[0].roles.map((g, r) => {
    const m = new THREE.SkinnedMesh(g, mats[r]);
    m.bind(skel, ident);
    /* (up close the shadow hull casts the shadow: see below) */
    m.castShadow = false;
    root.add(m);
    return m;
  });
  const shellMesh = new THREE.SkinnedMesh(SKIN.levels[0].shell, shieldM);
  shellMesh.bind(skel, ident);
  shellMesh.visible = false;
  shellMesh.renderOrder = 5;
  root.add(shellMesh);
  /* the shadow hull (characters/armour.js): drawn into the shadow map only (in the view it writes
     neither colour nor depth), so a near pilot's shadow costs the far level's triangles */
  const hullMesh = new THREE.SkinnedMesh(SKIN.hull, HULL_MAT);
  hullMesh.bind(skel, ident);
  hullMesh.castShadow = true;
  root.add(hullMesh);
  const { pivot, pelvis, spine, spine2, chest, neck, head, antenna, tabF, tabF2, tabB, tabB2 } = byName;
  /* sprung attachments: each swings against its mount's acceleration (about x and z, in the mount's
     frame) on a spring, a few degrees at most; a pad also flaps its outer edge against a rise or fall.
     jig(bone, swing per m/s^2, most radians, spring frequency, damping, flap side) */
  /** @param {string} n @param {number} k @param {number} max @param {number} fq @param {number} z @param {number} flap */
  const jig = (n, k, max, fq, z, flap) => ({
    b: byName[n],
    k,
    max,
    fq,
    z,
    flap,
    p: new V3(),
    v: new V3(),
    sx: spr(),
    sz: spr(),
    on: false,
  });
  const JIG = [
    ...SIDES.map(([s, sd]) => jig("pad" + s, 0.005, 0.1, 5, 0.4, sd)),
    ...SIDES.map(([s]) => jig("pouch" + s, 0.007, 0.18, 4, 0.4, 0)),
    jig("pouchB", 0.006, 0.15, 4, 0.4, 0),
    jig("pack", 0.003, 0.06, 2.5, 0.45, 0),
  ];
  const arms = SIDES.map(([s, side]) => ({
    clav: byName["clav" + s],
    sh: byName["sh" + s],
    el: byName["el" + s],
    hand: byName["hand" + s],
    fing: byName["fing" + s],
    tip: byName["tip" + s],
    thumb: byName["thumb" + s],
    side,
    grip: 0,
  }));
  const legs = SIDES.map(([s, side]) => ({
    hip: byName["hip" + s],
    kn: byName["kn" + s],
    an: byName["an" + s],
    toe: byName["toe" + s],
    tas: byName["tas" + s],
    side,
    cur: new V3(side * 0.12, -0.89, 0),
    /* the tasset trails the thigh on a spring */
    spT: spr(),
  }));
  /* thruster glows */
  const glows = [-0.1, 0.1].map(x => {
    const s = new THREE.Sprite(glowMat.clone());
    s.position.set(x, -0.24, 0.26);
    s.scale.set(0.22, 0.34, 1);
    chest.add(s);
    return s;
  });
  /* weapons and flag ride in the chest's frame */
  const gun = new THREE.Group();
  chest.add(gun);
  gun.position.copy(POSE.aim.p);
  const wpnG = WPN_RIG.map((_, i) => {
    const g = weaponMeshes(i, wmats);
    g.visible = i === 0;
    gun.add(g);
    return g;
  });
  const mag = new THREE.Mesh(
    geo("gmag", () => rbox(0.045, 0.14, 0.07, 0.01)),
    wmats[SUIT]
  );
  mag.position.copy(MAGSLOT);
  mag.visible = false;
  wpnG[0].add(mag);
  const grip = wpnG[0].children.find(m => m.userData.role === SUIT),
    gripBase = grip.geometry;
  if (!GRIP_MAG)
    GRIP_MAG = mergeGeos([
      [gripBase, new THREE.Matrix4()],
      [mag.geometry, new THREE.Matrix4().makeTranslation(MAGSLOT.x, MAGSLOT.y, MAGSLOT.z)],
    ]);
  grip.geometry = GRIP_MAG;
  /* the weapon's lights flare with each shot */
  for (const g of wpnG)
    for (const m of g.children)
      if (m.userData.role === GLOW)
        m.onBeforeRender = () =>
          (wmats[GLOW].emissiveIntensity = 1.5 + 2.5 * Math.exp(-12 * Math.max(0, S.t - S.lastKick)));
  const flagG = weaponMeshes(-1, wmats);
  flagG.visible = false;
  chest.add(flagG);
  let cloth = null,
    skullM = null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const x = c.getContext("2d");
  const tagTex = new THREE.CanvasTexture(c);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true })
  );
  tag.scale.set(1.8, 0.45, 1);
  tag.position.y = 2.25;
  root.add(tag);
  root.userData.pilotRig = true;
  scene.add(root);
  /* animation state. Springs give lean, bounce, flinch, recoil and armor some follow-through. */
  const S = {
    lod: 0,
    t: Math.random() * 10,
    pel: 0.96,
    /* motion-captured locomotion (characters/anim.js) and its per-frame input */
    loco: ANIM.make(),
    li: {
      dt: 0,
      lr: 0,
      lf: 0,
      spd: 0,
      crouch: false,
      sprint: false,
      air: false,
      vy: 0,
      gd: 9,
      x: 0,
      z: 0,
      yaw: 0,
      gL: 0,
      gR: 0,
      stepDy: 0,
      near: true,
      aim: false,
      busy: false,
    },
    mocap: false,
    /* a look toward a threat or a ping (characters/gaze.js): target, weight, and the eased turn */
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    lookW: 0,
    lkW: 0,
    lkY: 0,
    lkP: 0,
    /* fatigue: builds while sprinting, shows in the breathing, the shoulders and the head */
    fat: 0,
    /* the gun comes up to the shoulder while firing or aiming (and for a moment after), and is
       carried at the chest otherwise */
    hotT: 0,
    /* the hips easing over a stair the body stepped up or down at once */
    stepOff: 0,
    stepDy: 0,
    /** @type {number | null} */
    bodyY: null,
    spGy: spr(),
    spGx: spr(),
    /** @type {number | null} */
    rootY: null,
    offT: 0,
    /* a grenade throw: seconds since it began (9: none) */
    thT: 9,
    carry: 1,
    spTw: spr(),
    spTs: spr(),
    gly: 0,
    lh: new V3(-0.2, -0.1, -0.3),
    rh: new V3(0.1, -0.1, -0.2),
    sh: 70,
    uI: 0,
    shellVis: false,
    deadT: 0,
    lastR: -1,
    air: false,
    vy: 0,
    lf: 0,
    yaw: null,
    accF: 0,
    turn: 0,
    vx: 0,
    vz: 0,
    gL: 0,
    gR: 0,
    lastKick: -9,
    wp: 0,
    flag: false,
    skull: false,
    idle: 0,
    glance: 0,
    glanceT: 2,
    spP: spr(),
    spLean: spr(),
    spRoll: spr(),
    spFl: spr(),
    spFr: spr(),
    spKick: spr(),
    spAnt: spr(),
    spAntR: spr(),
    clA: new V3(),
    spTF: spr(),
    spTB: spr(),
    spTF2: spr(),
    spTB2: spr(),
    fall: null,
  };
  const yawOf = () => (S.yaw == null ? root.rotation.y : S.yaw);
  /* direction of a world point in this pilot's frame: x = right, z = back */
  const localDir = (wx, wz, out) => {
    const y = yawOf(),
      cc = Math.cos(y),
      s = Math.sin(y);
    return out.set(wx * cc - wz * s, 0, wx * s + wz * cc);
  };
  /* arm IK in the chest frame, through the clavicle; the clavicle shrugs toward high or far reaches */
  /* (push: a shot drives the shoulder back on its clavicle) */
  function solveArm(A, T, pole, near, push = 0) {
    if (near) {
      const raise = clamp((T.y - 0.02) * 0.55, -0.08, 0.26),
        reach = clamp(-T.z * 0.22 - 0.03, -0.1, 0.16);
      A.clav.rotation.set(0, -A.side * (reach - push), A.side * raise);
    } else A.clav.rotation.set(0, 0, 0);
    _sp.copy(A.sh.position).applyQuaternion(A.clav.quaternion).add(A.clav.position);
    solve2(_up, A.el, 0.3, 0.29, _sp, T, pole);
    A.sh.quaternion.copy(A.clav.quaternion).invert().multiply(_up.quaternion);
  }
  /* point a hand along a frame given in the chest's space (blend 0..1), and close its fingers */
  /* a hand's grip on a carried object (chest frame): c, the point the palm presses on; n, the way the
     palm faces (into the object); kn, the line of the knuckles (along a pole). Writes the wrist to put
     the arm's IK at, and the hand's frame (its palm faces -x on the right hand, +x on the left; the
     fingers run down -y; the knuckles along z) */
  function gripAt(A, c, n, kn, wrist, q) {
    _gx.copy(n).multiplyScalar(-A.side);
    _gz.copy(kn).addScaledVector(_gx, -kn.dot(_gx)).normalize();
    _gy.crossVectors(_gz, _gx);
    q.setFromRotationMatrix(_m1.makeBasis(_gx, _gy, _gz));
    return wrist.copy(c).sub(
      _gv
        .copy(PALM)
        .setX(-A.side * PALM.x)
        .applyQuaternion(q)
    );
  }
  function handTo(A, frameQ, k, curl) {
    _q3.copy(A.clav.quaternion).multiply(A.sh.quaternion).multiply(A.el.quaternion).invert();
    _q2.copy(_q3).multiply(frameQ);
    A.hand.quaternion.identity().slerp(_q2, k);
    A.grip += (curl - A.grip) * 0.35;
    const g = A.grip;
    A.fing.rotation.set(0, 0, -A.side * g * 1.25);
    A.tip.rotation.set(0, 0, -A.side * g * 1.1);
    A.thumb.rotation.set(-g * 0.9, 0, -A.side * g * 0.4);
  }
  const rig = {
    root,
    dead: false,
    S,
    color,
    /* sprint assist (0..1, from rig.update) and the two exhaust sprites, for the effects in rigEvents */
    jet: 0,
    /** the suit's heat, 0 to 1, for its vents' glow: a thrust or a ground pound runs it up at once, a
        slide nearly so, a charge and a sprint less; it bleeds off over about a second (rig.update) */
    heat: 0,
    jets: glows,
    /** where the last footstep came down (world) */
    stepAt: new V3(),
    /** the pilot's stable id and team (posePilot sets them; characters/gaze.js reads them) */
    pid: "",
    team: -1,
    /** the name over their head; kind "human" or "ai" marks real players and AI (ui/pilot-kind.js):
        a ◆ and warm white for a player, muted with an AI tag for AI, a stripe in their armor colour */
    labelKind: "",
    setLabel(t, sub, kind) {
      rig.labelKind = kind || "";
      x.clearRect(0, 0, 256, 64);
      x.font = "600 28px Chakra Petch, Arial Narrow, sans-serif";
      x.textAlign = "center";
      x.fillStyle = "#0b1216cc";
      const text = kind === "human" ? PK.human.glyph + " " + t : t;
      const tw = x.measureText(text).width,
        tagW = kind === "ai" ? 34 : 0;
      const w = Math.min(250, tw + tagW + 24);
      x.fillRect(128 - w / 2, 8, w, 36);
      if (kind) {
        /* their armor (or team) colour, as a stripe under the name */
        x.fillStyle = color;
        x.fillRect(128 - w / 2, 40, w, 4);
      }
      x.fillStyle = kind === "human" ? PK.human.color : kind === "ai" ? PK.ai.color : color;
      x.fillText(text, 128 - tagW / 2, 36);
      if (kind === "ai") {
        const tx = 128 - tagW / 2 + tw / 2 + 6;
        x.strokeStyle = PK.ai.color;
        x.lineWidth = 2;
        x.strokeRect(tx, 16, 28, 20);
        x.font = "600 14px IBM Plex Mono, monospace";
        x.fillText(PK.ai.tag, tx + 14, 31);
      }
      if (sub) {
        x.font = "500 15px IBM Plex Mono, monospace";
        x.fillStyle = "#dbe6ea";
        x.fillText(sub, 128, 60);
      }
      tag.material.map.needsUpdate = true;
    },
    showTag(v) {
      tag.visible = v;
    },
    /* from: attacker world position (optional). Shields flash; the body flinches away from the hit. */
    /** a hit lands: the shield shimmers, or with shields down the body flashes (red, white on a headshot) */
    flashHit(from, kind) {
      if (S.sh > 0 && kind !== "head") S.uI = Math.max(S.uI, kind === "brk" ? 1.6 : 1.05);
      else {
        S.uI = Math.max(S.uI, kind === "head" ? 1.3 : 0.85);
        S.hurt = 1;
        S.hurtC = kind === "head" ? HIT_WHITE : HIT_RED;
      }
      if (from) {
        localDir(root.position.x - from.x, root.position.z - from.z, _dl);
        const L = Math.hypot(_dl.x, _dl.z) || 1;
        /* (a hit barely moves an armored body: the shield shimmers instead; only a hull or head hit
           shows a small push, from the captured stumble) */
        S.spFl.v -= (0.8 * _dl.z) / L;
        S.spFr.v -= (0.7 * _dl.x) / L;
        if (S.sh <= 0 || kind === "head")
          ANIM.hit(S.loco, _dl.x / L, _dl.z / L, kind === "head" ? 0.4 : 0.25);
      } else {
        S.spFl.v -= 0.5;
        S.spFr.v += rnd(-0.4, 0.4);
      }
    },
    /* momentum-based fall: carries running speed, gets knocked away from the killer, harder hits throw further */
    die(from, power = 1) {
      if (rig.dead) return;
      rig.dead = true;
      S.deadT = 0;
      tag.visible = false;
      let mr = S.vx * Math.cos(yawOf()) - S.vz * Math.sin(yawOf()),
        mb = S.vx * Math.sin(yawOf()) + S.vz * Math.cos(yawOf());
      mr *= 0.45;
      mb *= 0.45;
      if (from) {
        localDir(root.position.x - from.x, root.position.z - from.z, _dl);
        const L = Math.hypot(_dl.x, _dl.z) || 1;
        mr += (_dl.x / L) * 2.2 * power;
        mb += (_dl.z / L) * 2.2 * power;
      } else mb += 1.4;
      const L = Math.hypot(mr, mb) || 1;
      /* where the body would come down: a wall in the way stops the topple (it slumps against it), a
         step up ahead takes the head higher, a drop ahead lets it drape over the edge */
      const y = yawOf(),
        wx = (mr / L) * Math.cos(y) + (mb / L) * Math.sin(y),
        wz = (-mr / L) * Math.sin(y) + (mb / L) * Math.cos(y),
        rp = root.position;
      let maxA = 1.45;
      const wall = rayWorld(_kA.set(rp.x, rp.y + 1.1, rp.z), _kB.set(wx, 0, wz), 1.8);
      if (wall < 1.75) maxA = Math.min(maxA, Math.asin(clamp((wall - 0.25) / 1.4, 0.25, 1)));
      const g = groundBelow(rp.x + wx * 1.5, rp.z + wz * 1.5, rp.y + 1.2, 0.15) - rp.y;
      if (g > 0.05) maxA = Math.min(maxA, Math.acos(clamp(g / 1.5, 0, 1)));
      else if (g < -0.35 && wall >= 1.75) maxA = 1.68;
      S.fall = {
        bx: mr / L,
        bz: mb / L,
        ang: 0,
        angV: S.air ? 3 : 1,
        g: 9 + power * 3,
        vx: mr * 0.8,
        vz: mb * 0.8,
        spin: S.air ? rnd(-2, 2) : 0,
        maxA,
        /* how it goes down: a heavy blow throws the body (arms flung up, it spins); anything else
           buckles the knees first and folds it forward over them */
        thrown: power > 1.5 || S.air,
        /* slumped against a wall: the body sits down it instead of lying flat */
        slump: maxA < 1.1 ? 1 - maxA / 1.1 : 0,
        /* when it came to rest, for the crumple after */
        restT: -1,
      };
      /* what they held goes with the death drop, not the body */
      gun.visible = false;
      flagG.visible = false;
    },
    revive() {
      rig.dead = false;
      S.fall = null;
      pivot.rotation.set(0, 0, 0);
      pivot.position.set(0, 0, 0);
      root.visible = true;
      tag.visible = true;
      gun.visible = true;
      S.sh = 70;
      S.uI = 0;
      S.yaw = null;
      S.spP.x = S.spP.v = 0;
      S.stepOff = 0;
      S.rootY = null;
      ANIM.reset(S.loco);
    },
    /** a short emote (cheer, flex, wave, shrug), only standing; false if the pilot is busy */
    /** a grenade leaves this pilot's hand: the free arm throws it overhand */
    throwNade() {
      if (!rig.dead) S.thT = 0;
    },
    emote(name) {
      return !rig.dead && ANIM.emote(S.loco, name);
    },
    /** turn the head toward a world point (w 0..1; 0 lets go) */
    look(x, y, z, w) {
      S.lookX = x;
      S.lookY = y;
      S.lookZ = z;
      S.lookW = w;
    },
    chestWorld(out) {
      return out.copy(root.position).add(_kA.set(0, 1.25, 0));
    },
    update(dt, st) {
      S.t += dt;
      /* the armour's distance level (characters/armour.js): a geometry swap, the draws stay the same */
      {
        const d2 = root.position.distanceToSquared(camera.position),
          a = ARMOUR_LOD[0] * (S.lod === 0 ? 1.08 : 0.92),
          b = ARMOUR_LOD[1] * (S.lod <= 1 ? 1.08 : 0.92),
          lod = d2 < a * a ? 0 : d2 < b * b ? 1 : 2;
        if (lod !== S.lod) {
          S.lod = lod;
          skinned.forEach((m, r) => {
            m.geometry = SKIN.levels[lod].roles[r];
            /* (near and mid, the hull casts the shadow; far off, the far level's own plates do) */
            m.castShadow = lod === 2 && r !== GLOW && r !== VISOR;
          });
          shellMesh.geometry = SKIN.levels[lod].shell;
          hullMesh.visible = lod < 2;
        }
      }
      /* a throw: from rig.throwNade, or played back from a recording (st.throw, which a live throw
         writes into the state it is drawn with, so replays and kill cams keep it) */
      if (st.throw >= 0 && (S.thT >= 0.5 || st.throw < S.thT - 0.1)) S.thT = st.throw;
      if (S.thT < 0.5) {
        S.thT += dt;
        if (!(st.throw >= 0)) st.throw = S.thT;
      }
      const k = 1 - Math.exp(-14 * dt),
        kf = 1 - Math.exp(-26 * dt);
      let ev = null;
      const sh = st.shield == null ? S.sh : st.shield;
      if (sh < S.sh - 0.5) {
        if (sh <= 0 && S.sh > 0) {
          S.uI = 2;
          ev = { pop: true };
        } else if (S.sh > 0) S.uI = Math.max(S.uI, 1);
      } else if (sh > S.sh + 0.5 && S.sh <= 0.5) {
        /* the shield coming back: a bright flare, white-gold, and its sound */
        S.uI = Math.max(S.uI, 1.5);
        S.charge = 1;
        ev = { recharge: true };
      }
      S.sh = sh;
      /* shield down: the shell crackles in broken red-orange arcs and sparks spit off the armor */
      if (sh <= 0 && !rig.dead && Math.random() < dt * 11) {
        S.uI = Math.max(S.uI, 0.35 + Math.random() * 0.45);
        if (Math.random() < 0.5) ev = Object.assign(ev || {}, { crackle: true });
      }
      S.uI *= Math.exp(-5 * dt);
      if (rig.dead) S.uI = 0;
      shieldM.uniforms.uI.value = S.uI;
      /* the shell's color: shield gold (white-gold while it recharges), broken red-orange while it is
         down, washed to the hit color for a moment after a hull hit */
      S.hurt = (S.hurt || 0) * Math.exp(-7 * dt);
      S.charge = (S.charge || 0) * Math.exp(-3 * dt);
      shieldM.uniforms.uC.value.copy(sh <= 0 ? SHIELD_BROKEN : SHIELD_GOLD);
      if (S.charge > 0.01) shieldM.uniforms.uC.value.lerp(HIT_WHITE, S.charge * 0.6);
      if (S.hurt > 0.01) shieldM.uniforms.uC.value.lerp(S.hurtC, Math.min(1, S.hurt * 1.4));
      shieldM.uniforms.uT.value = S.t;
      const vis = S.uI > 0.02;
      if (vis !== S.shellVis) {
        S.shellVis = vis;
        shellMesh.visible = vis;
      }
      if (rig.dead) {
        deathPose(dt);
        return ev;
      }
      /* detail fades with distance: fingers, foot roll, clavicles and idle life only up close */
      const near = root.position.distanceToSquared(camera.position) < 900;
      const cy = Math.cos(st.yaw),
        sy = Math.sin(st.yaw);
      const lr = st.vx * cy - st.vz * sy,
        lf = -st.vx * sy - st.vz * cy,
        spd = Math.hypot(lr, lf);
      /* stepping down a stair or off a kerb leaves the body in the air for a moment: that is not a jump,
         so it keeps walking (and does not land on every step) */
      S.offT = st.ground ? 0 : (S.offT || 0) + dt;
      let air = !st.ground;
      if (air && S.offT < 0.25 && st.vy < 1 && !st.thrust && !st.pound && !st.stab && !st.clamber) {
        const rp = root.position;
        if (rp.y - groundBelow(rp.x, rp.z, rp.y + 0.05, 0.25) < 0.55) air = false;
      }
      /* and a stair the body steps up (or down) all at once is eased into by the hips, the planted feet
         staying on their steps */
      const dy = root.position.y - (S.rootY == null ? root.position.y : S.rootY);
      S.rootY = root.position.y;
      S.stepDy = !air && Math.abs(dy) > 0.04 && Math.abs(dy) < 0.5 ? dy : 0;
      S.stepOff -= S.stepDy;
      /* (the ground under each foot is kept relative to the body: it moved by the step) */
      S.gL = clamp(S.gL - S.stepDy, -0.45, 0.4);
      S.gR = clamp(S.gR - S.stepDy, -0.45, 0.4);
      S.stepOff *= Math.exp(-14 * dt);
      S.vx = st.vx;
      S.vz = st.vz;
      /* landing: the knees take the impact (feet stay planted, pelvis springs down then recovers) */
      /* time in the air, and (a little before landing) how far the ground is below */
      if (!S.air && air) S.airT = 0;
      S.airT = (S.airT || 0) + dt;
      if (air && st.vy < -3 && near)
        S.gd = root.position.y - groundBelow(root.position.x, root.position.z, root.position.y, 0.2);
      else S.gd = 9;
      if (S.air && !air) {
        /* (by the height of the fall, so a floaty preset's landings weigh the same) */
        S.spP.v -= clamp(Math.sqrt((S.vy * S.vy) / Math.max(1, TUNE.grav)) * 0.55, 0, 2.4);
        /* a heavy landing is heard (rigEvents plays it, positional) */
        if (S.vy < -6) ev = Object.assign(ev || {}, { land: -S.vy });
      }
      S.air = air;
      S.vy = st.vy;
      /* acceleration and turn rate feed lean and bank */
      const idt = 1 / Math.max(dt, 1e-3);
      if (S.yaw == null) S.yaw = st.yaw;
      let dyaw = st.yaw - S.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      S.yaw = st.yaw;
      S.accF += (clamp((lf - S.lf) * idt, -40, 40) - S.accF) * Math.min(1, dt * 8);
      S.lf = lf;
      S.turn += (clamp(dyaw * idt, -8, 8) - S.turn) * Math.min(1, dt * 10);
      const still = !air && spd < 0.4 && !st.crouch;
      S.idle = still ? Math.min(1, S.idle + dt * 0.8) : Math.max(0, S.idle - dt * 4);
      /* locomotion comes from motion capture (characters/anim.js: walk, run, sprint, strafe,
         backpedal, crouch, jump and land, idle); the special moves (slide, ground pound, clamber,
         jetpack, stabilizer) keep procedural legs */
      const mocap = !(st.slide || st.pound || st.clamber || st.stab || st.thrust),
        wasMocap = S.mocap;
      /* into a special move the hips start where the capture had them; out of one, the legs and hips
         ease back into the capture for a moment instead of snapping */
      if (wasMocap && !mocap) S.pel = pelvis.position.y;
      if (!wasMocap && mocap) S.mix = 1;
      S.mix = Math.max(0, (S.mix || 0) - dt * 4);
      /* a clamber, by the body's own progress (or by time, for a body seen over the network): reach,
         grab, a knee up onto the ledge, over the top */
      S.clT = st.clamber ? (S.clT || 0) + dt : 0;
      const clK = st.clamber ? (st.clK >= 0 ? st.clK : Math.min(1, S.clT / 0.27)) : 0;
      if (st.clamber && S.clT === dt) {
        const fx = -Math.sin(st.yaw),
          fz = -Math.cos(st.yaw);
        S.clA.set(
          root.position.x + fx * 0.5 + fz * 0.2,
          root.position.y + (st.clH || 1.2),
          root.position.z + fz * 0.5 - fx * 0.2
        );
      }
      const LO = S.loco;
      if (mocap) {
        /* the ground under each foot (stairs, ledges), where the feet were last frame */
        if (!air && root.position.distanceToSquared(camera.position) < 1600) {
          const rp = root.position;
          for (let i = 0; i < 2; i++) {
            const lx = LO.ank[i * 3],
              lz = LO.ank[i * 3 + 2];
            const wx = rp.x + lx * cy + lz * sy,
              wz = rp.z - lx * sy + lz * cy;
            const g = clamp(groundBelow(wx, wz, rp.y + 0.5, 0.06) - rp.y, -0.45, 0.4);
            if (i) S.gR += (g - S.gR) * kf;
            else S.gL += (g - S.gL) * kf;
          }
        } else {
          S.gL *= 1 - kf;
          S.gR *= 1 - kf;
        }
        const I = S.li;
        I.dt = dt;
        I.lr = lr;
        I.lf = lf;
        I.spd = spd;
        I.crouch = !!st.crouch && !air;
        I.sprint = !!st.sprint;
        I.air = air;
        I.vy = st.vy;
        I.gd = S.gd;
        I.x = root.position.x;
        I.z = root.position.z;
        I.yaw = st.yaw;
        I.gL = S.gL;
        I.gR = S.gR;
        I.stepDy = S.stepDy;
        I.near = near;
        I.aim = !!st.aim;
        I.busy = !!st.aim || !!st.fire || st.melee >= 0 || st.reload >= 0;
        if (!S.mocap) ANIM.reset(LO);
        ANIM.update(LO, I);
      }
      S.mocap = mocap;
      {
        const h = st.thrust || st.pound ? 1 : st.slide ? 0.75 : st.charge ? 0.6 : st.sprint ? 0.2 : 0;
        rig.heat += (h - rig.heat) * Math.min(1, dt * (h > rig.heat ? 18 : 1.6));
      }
      /* the body's lean: a fighting hunch, forward over the gun, in every stance (the capture leans
         into its own gait, so speed adds less of it here); hard into a sprint */
      let pel = 0.96,
        lean = 0.09 + Math.min(0.16, spd * 0.022) * (mocap ? 0.4 : 1),
        roll = 0;
      if (!air && st.crouch) {
        pel = 0.7;
        lean = 0.32;
      }
      if (!air && st.sprint) lean = mocap ? 0.24 : 0.32;
      /* a slide: low, leaning back against the lead leg, rolled toward the tucked one */
      if (st.slide) {
        pel = 0.42;
        lean = -0.1;
        roll = -0.05;
      }
      if (air) {
        lean = 0.17;
        roll = clamp(-lr * 0.025, -0.24, 0.24);
      }
      /* a thrust: the body leans into the burst, forward, back or to the side */
      if (st.thrust) {
        const tl = spd > 0.5 ? lf / spd : 1,
          tr = spd > 0.5 ? lr / spd : 0;
        lean = 0.45 * tl;
        roll = -0.5 * tr;
      }
      if (st.stab) lean = 0.05;
      /* a ground pound: sat upright in the hover, then straight down */
      if (st.pound === 1) lean = 0.1;
      else if (st.pound === 2) lean = 0.15;
      if (st.charge) lean = 0.6;
      if (st.clamber) {
        lean = 0.3 + 0.45 * Math.sin(Math.PI * clK);
        pel = 0.9 - 0.14 * Math.sin(Math.PI * clK);
      }
      /* a blow: wound up, driven through with the whole body, followed through */
      const mOn = st.melee >= 0,
        M = meleeShape(st.melee),
        strike = mOn ? M.s : 0,
        wind = mOn ? M.w : 0,
        fol = mOn ? M.f : 0;
      if (mOn) lean += strike * 0.6 + fol * 0.2 - wind * 0.15;
      /* a shot rocks the shoulders back */
      lean -= S.spKick.x * 0.6;
      /* aiming down sights eases in: the head drops to the sights */
      S.ads = (S.ads || 0) + ((st.aim && !st.sprint ? 1 : 0) - (S.ads || 0)) * Math.min(1, dt * 12);
      if (!air && !st.slide) {
        /* lean into acceleration and bank into turns, harder the faster the pilot goes */
        const sk = 0.6 + 0.4 * Math.min(1, spd / 6);
        lean += clamp(S.accF * 0.012 * sk, -0.2, 0.2);
        roll += clamp(-S.turn * spd * 0.02, -0.34, 0.34);
      }
      /* breathing (faster and deeper after running), and a slow weight shift at rest */
      S.puff = clamp((S.puff || 0) + (spd > 4 ? dt * 0.12 : -dt * 0.05), 0, 1);
      /* fatigue builds over a long sprint and fades over a few seconds' rest */
      S.fat = clamp(S.fat + (st.sprint && !air ? dt * 0.12 : -dt * (spd < 1 ? 0.18 : 0.08)), 0, 1);
      S.brT = (S.brT || 0) + dt * (1.7 + 1.6 * S.puff + 1.2 * S.fat);
      const br = Math.sin(S.brT) * (1 + S.puff + S.fat),
        sway = Math.sin(S.t * 0.45) * S.idle;
      if (!mocap) roll += sway * 0.025;
      S.pel += (pel - S.pel) * k;
      const leanS = spring(S.spLean, lean, dt, 4.5, 0.6) + spring(S.spFl, 0, dt, 3.2, 0.35),
        rollS = spring(S.spRoll, roll, dt, 4, 0.55) + spring(S.spFr, 0, dt, 3.2, 0.35);
      /* (critically damped: a landing sinks and comes back up without bouncing past rest) */
      const pOff = clamp(spring(S.spP, 0, dt, 4.2, 1), -0.32, 0.12);
      if (!mocap) {
        S.gL *= 1 - kf;
        S.gR *= 1 - kf;
      }
      const drop = Math.min(0, S.gL, S.gR);
      /* the pelvis: the capture's (with the hips turned toward the travel), or held for a special move */
      if (mocap) {
        _kB.set(LO.pelP[0], LO.pelP[1] + pOff * 0.5, LO.pelP[2]);
        /* (blending in from another pose: from where the hips were in the world, over the step) */
        if (S.mix > 0) pelvis.position.setY(pelvis.position.y - S.stepDy).lerp(_kB, kf);
        else pelvis.position.copy(_kB);
        pelvis.quaternion.fromArray(LO.pelQ);
        /* (a fast turn: the hips trail it, the torso half as much, the head stays on the aim) */
        pelvis.quaternion.premultiply(
          _q1.setFromAxisAngle(_a.set(0, 1, 0), clamp(-S.turn * 0.03, -0.3, 0.3))
        );
      } else {
        pelvis.position.set(sway * 0.02, S.pel + pOff + drop + S.stepOff, 0);
        pelvis.rotation.set(0, 0, sway * 0.03);
      }
      /* the spine shares lean and bank between its two segments on top of the capture; breathing
         lifts the chest; a melee blow twists the torso into the strike */
      /* the upper body follows through: the twist of a blow and the rock of a shot carry on a spring */
      const mtw = spring(
          S.spTw,
          strike * 0.85 + fol * 0.3 - wind * 0.5 + (st.charge ? 0.4 : 0) + throwTwist(S.thT),
          dt,
          3.4,
          0.5
        ),
        rock = spring(S.spTs, S.spKick.x * 0.5, dt, 2.6, 0.45);
      spine.rotation.set(
        (-leanS + st.pitch * 0.3 - rock) * 0.5,
        mtw * 0.5 + (mocap ? clamp(S.turn * 0.015, -0.15, 0.15) : 0),
        rollS * 0.5
      );
      /* (running, the shoulders rock with each step) */
      const rockStep =
        mocap && !air
          ? Math.sin(S.loco.phase * Math.PI * 2) * 0.09 * Math.min(1, S.loco.moving) * Math.min(1, spd / 5)
          : 0;
      spine2.rotation.set(
        (-leanS + st.pitch * 0.3 - rock) * 0.5 + br * 0.012,
        mtw * 0.5,
        rollS * 0.5 + rockStep
      );
      /* the clamber's body comes from a capture of stepping up and over */
      if (st.clamber && near) {
        const V = ANIM.clipPose(S.loco, "vault", clK * ANIM.clips.vault.T);
        spine.quaternion.premultiply(_q1.fromArray(V, ANIM.bone("spine") * 4).slerp(_q3.identity(), 0.4));
        spine2.quaternion.premultiply(_q1.fromArray(V, ANIM.bone("spine2") * 4).slerp(_q3.identity(), 0.4));
      }
      if (mocap) {
        spine.quaternion.premultiply(_q1.fromArray(LO.spine, 0));
        spine2.quaternion.premultiply(_q1.fromArray(LO.spine, 4));
        chest.quaternion.fromArray(LO.spine, 8);
      } else chest.quaternion.identity();
      chest.position.y = 0.14 + br * 0.004;
      /* the head looks where the pilot aims, whatever the body does, and glances around at rest */
      S.glanceT -= dt;
      if (S.glanceT < 0) {
        S.glanceT = 1.5 + Math.random() * 3;
        S.glance = S.idle > 0.5 ? (Math.random() - 0.5) * 0.9 : 0;
      }
      S.gly += (S.glance * S.idle - S.gly) * Math.min(1, dt * 4);
      /* a look toward a threat or a teammate's ping, on top of the aim (limited to what a neck can do) */
      S.lkW += (S.lookW - S.lkW) * Math.min(1, dt * 3);
      let lkY = 0,
        lkP = 0;
      if (S.lkW > 0.01) {
        const dx = S.lookX - root.position.x,
          dz = S.lookZ - root.position.z;
        localDir(dx, dz, _dl);
        lkY = clamp(Math.atan2(-_dl.x, -_dl.z), -1.1, 1.1) * S.lkW;
        lkP =
          clamp(
            Math.atan2(S.lookY - root.position.y - 1.6, Math.hypot(dx, dz)) - st.pitch * 0.68,
            -0.5,
            0.5
          ) * S.lkW;
      }
      S.lkY += (lkY - S.lkY) * Math.min(1, dt * 7);
      S.lkP += (lkP - S.lkP) * Math.min(1, dt * 7);
      _q1
        .copy(pelvis.quaternion)
        .multiply(spine.quaternion)
        .multiply(spine2.quaternion)
        .multiply(chest.quaternion);
      _q2.setFromEuler(
        _e1.set(
          st.pitch * 0.68 + leanS * 0.25 - S.ads * (S.wp === 1 ? 0.2 : 0.1) + S.lkP + br * 0.02 * S.fat,
          S.gly - S.turn * 0.02 + S.lkY,
          0,
          "YXZ"
        )
      );
      _q1.invert().multiply(_q2);
      neck.quaternion.identity().slerp(_q1, 0.5);
      head.quaternion.copy(neck.quaternion);
      /* sighting in, the head tilts onto the stock */
      head.quaternion.multiply(_q3.setFromEuler(_e1.set(S.ads * 0.14, 0, -S.ads * 0.12, "XYZ")));
      head.rotation.x -= br * 0.01;
      const gy = -pelvis.position.y + 0.07;
      /* travel direction in the body's frame, for the jetpack's legs */
      const mx = spd > 0.05 ? lr / spd : 0,
        mz = spd > 0.05 ? -lf / spd : -1;
      legs.forEach((g, i) => {
        const side = g.side;
        let roll = 0,
          toe = 0;
        if (mocap) {
          /* the capture's leg: two-bone IK to its (planted, ground-following) ankle, the knee where
             the capture bends it, the foot turned as the capture's */
          if (S.mix > 0) g.cur.lerp(_kA.fromArray(LO.tgt, i * 3), kf);
          else g.cur.fromArray(LO.tgt, i * 3);
          _pole.fromArray(LO.pole, i * 3);
          solve2(g.hip, g.kn, 0.44, 0.43, g.hip.position, g.cur, _pole);
          _q1.copy(g.hip.quaternion).multiply(g.kn.quaternion).invert();
          g.an.quaternion.copy(_q1).multiply(_q2.fromArray(LO.ankQ, i * 4));
          g.toe.rotation.x = near ? LO.toe[i] : 0;
        } else {
          const tg = _lk;
          /* the slide: the lead leg out straight ahead, the other folded under it, knee out to the side */
          if (st.slide) tg.set(i === 0 ? -0.06 : 0.2, i === 0 ? gy + 0.05 : gy + 0.02, i === 0 ? -0.8 : 0.1);
          /* the pound's hover: sat in the air, thighs level and shins hanging; the slam: legs straight */ else if (
            st.pound === 1
          )
            tg.set(side * 0.15, -0.5, -0.36);
          else if (st.pound === 2) tg.set(side * 0.17, -0.85, 0.04);
          else if (st.clamber) {
            /* the ledge's top and near edge, in the hips' frame, as the body rises and moves over it */
            const ly = (st.clH || 1.2) * (1 - Math.min(1, clK * 1.6)) - pelvis.position.y + 0.07,
              e = clK < 0.5 ? 2 * clK * clK : 1 - 2 * (1 - clK) * (1 - clK),
              lz = -0.45 + 0.95 * e;
            if (i === 0) {
              /* the lead knee comes up and the foot plants on the ledge, then steps through */
              const up = sstep(0.08, 0.35, clK),
                over = sstep(0.7, 1, clK);
              tg.set(
                side * 0.1,
                gy + (Math.max(gy, ly) - gy) * up,
                0.05 + (Math.min(lz + 0.12, -0.05) - 0.05) * up
              );
              tg.y += (gy - tg.y) * over;
              tg.z += (-0.12 - tg.z) * over;
            } else
              /* the trailing leg hangs, then swings up under the body and through */
              tg.set(side * 0.13, gy + 0.32 * Math.sin(Math.PI * clK), 0.18 - 0.3 * clK);
          } else if (st.stab)
            /* hovering: one knee up at the hip, the other leg hanging straight */
            tg.set(side * 0.12, i === 0 ? -0.5 : -0.86, i === 0 ? -0.38 : 0.04 + Math.sin(S.t * 2.4) * 0.02);
          else if (st.thrust) {
            /* a thrust: the legs split like a leap along the burst, the lead knee bent */
            const dx = spd > 0.5 ? lr / spd : 0,
              dz = spd > 0.5 ? -lf / spd : -1;
            if (i === 0) tg.set(side * 0.1 + dx * 0.28, -0.55, dz * 0.28);
            else tg.set(side * 0.12 - dx * 0.42, -0.74, -dz * 0.42);
          } else if (!air) tg.set(side * 0.13, gy, 0.02 * (i ? 1 : -1));
          else {
            /* the jetpack: legs trail the thrust, reaching for the ground before a landing */
            const tx = side * 0.12 - mx * 0.22,
              tz = -mz * 0.28;
            if (st.vy > -3.5 || S.gd > 1.6) {
              const tuck = clamp((st.vy + 3) * 0.035, 0, 0.2);
              tg.set(tx, (i === 0 ? -0.6 : -0.52) + tuck, (i === 0 ? -0.24 : 0.16) + tz);
              roll = -0.35;
            } else {
              tg.set(tx, i === 0 ? -0.82 : -0.76, (i === 0 ? -0.1 : 0.08) + tz);
              roll = 0.15;
            }
          }
          g.cur.lerp(tg, kf);
          if (st.slide && i === 1) _pole.set(1, -0.55, -0.25);
          else if (st.clamber && i === 0) _pole.set(side * 0.2, 0.4, -1);
          else _pole.set(side * 0.15, 0, -1);
          solve2(g.hip, g.kn, 0.44, 0.43, g.hip.position, g.cur, _pole);
          _q1.copy(g.hip.quaternion).multiply(g.kn.quaternion).invert();
          g.an.quaternion.copy(_q1).multiply(_q2.setFromAxisAngle(_a.set(1, 0, 0), roll));
          g.toe.rotation.x = toe;
        }
        /* tassets ride the thigh as it swings forward */
        g.tas.rotation.x = spring(
          g.spT,
          clamp(-g.cur.z * 1.4, -0.1, 0.95) + (st.crouch || st.slide ? 0.6 : 0),
          dt,
          5,
          0.35
        );
      });
      /* the tabard: the thighs kick its flaps out as they swing, the run drags them back, and each
         lower half trails its upper on a spring */
      {
        const fw = Math.max(-legs[0].cur.z, -legs[1].cur.z, 0),
          bk = Math.max(legs[0].cur.z, legs[1].cur.z, 0),
          sit = st.crouch || st.slide ? 0.7 : 0,
          drag = clamp(lf * 0.05, -0.4, 0.5) + (air ? clamp(st.vy * 0.03, -0.5, 0.3) : 0);
        const a = spring(S.spTF, clamp(fw * 1.3, 0, 1) + sit - drag, dt, 3.2, 0.3),
          b = spring(S.spTB, -clamp(bk * 1.3, 0, 1) - sit * 0.4 - drag, dt, 3.2, 0.3);
        tabF.rotation.x = a;
        tabB.rotation.x = b;
        tabF2.rotation.x = spring(S.spTF2, a * 0.5, dt, 2.4, 0.25) - a * 0.35;
        tabB2.rotation.x = spring(S.spTB2, b * 0.5, dt, 2.4, 0.25) - b * 0.35;
      }
      /* pads, pouches and the pack: their mount's acceleration (from where it was drawn the last two
         frames; a jump of more than a metre, such as a respawn, starts them over) */
      for (const j of JIG) {
        const par = j.b.parent;
        _a.setFromMatrixPosition(par.matrixWorld);
        if (!near || !j.on || dt <= 0 || _a.distanceToSquared(j.p) > 1) {
          j.p.copy(_a);
          j.v.set(0, 0, 0);
          j.sx.x = j.sx.v = j.sz.x = j.sz.v = 0;
          j.b.rotation.set(0, 0, 0);
          j.on = near;
          continue;
        }
        _b.copy(_a).sub(j.p).divideScalar(dt);
        _c.copy(_b).sub(j.v).divideScalar(dt).clampLength(0, 30);
        j.p.copy(_a);
        j.v.copy(_b);
        _c.applyQuaternion(_q1.setFromRotationMatrix(par.matrixWorld).invert());
        j.b.rotation.x = spring(j.sx, clamp(_c.z * j.k, -j.max, j.max), dt, j.fq, j.z);
        j.b.rotation.z = spring(j.sz, clamp((-_c.x - j.flap * _c.y) * j.k, -j.max, j.max), dt, j.fq, j.z);
      }
      /* weapon or flag */
      const rl = st.flag ? -1 : st.reload;
      const wp = st.wpn | 0,
        R = WPN_RIG[wp] || WPN_RIG[0],
        rocket = wp === 3;
      if (wp !== S.wp || !!st.flag !== S.flag || !!st.skull !== S.skull) {
        S.wp = wp;
        S.flag = !!st.flag;
        S.skull = !!st.skull;
        wpnG.forEach((g, i) => (g.visible = i === wp && !S.flag));
        flagG.visible = S.flag;
        if (S.flag && !cloth) {
          cloth = flagCloth(st.flagColor || "#ffffff");
          cloth.position.set(0, 0.72, 0);
          flagG.add(cloth);
        }
        /* the oddball skull is held in the same two-handed grip, in place of the pole and cloth */
        if (S.skull && !skullM) {
          skullM = carriedSkull();
          flagG.add(skullM);
        }
        for (const c of flagG.children) c.visible = c === skullM ? S.skull : !S.skull;
        if (cloth && st.flagColor) {
          cloth.material.color.set(st.flagColor);
          cloth.material.emissive.set(st.flagColor);
        }
      }
      let gp = rocket
        ? POSE.rocket
        : st.aim
          ? wp === 1
            ? POSE.adsPistol
            : POSE.ads
          : wp === 1
            ? POSE.pistol
            : POSE.aim;
      if (rl >= 0) gp = POSE.reload;
      else if (!air && st.sprint) gp = rocket ? POSE.rocketRun : POSE.sprint;
      else if (st.charge) gp = POSE.charge;
      else if (st.slide || st.pound === 1) gp = POSE.across;
      else if (st.pound === 2 || st.clamber) gp = POSE.low;
      /* recoil: each shot kicks the weapon back and up through a spring, heavier for heavier guns */
      if (st.fire && S.t - S.lastKick > R.every) {
        S.lastKick = S.t;
        S.spKick.v += R.kick * 1.35;
      }
      const kick = spring(S.spKick, 0, dt, 9, 0.42);
      /* the team seams flare with each shot and with the shield: up with a hit's shimmer, a weak
         flicker with the shield down */
      /* the vents glow with the suit's heat (rig.heat, above): dark at rest, then dull red, orange and a
         pale yellow at the peak */
      {
        const h = rig.heat;
        heatM.emissive.setRGB(1, 0.14 + 0.42 * h * h, 0.03 + 0.12 * h * h * h);
        heatM.emissiveIntensity = 0.03 + 2.4 * h * Math.sqrt(h);
      }
      glowM.emissiveIntensity =
        1.3 +
        Math.min(2.4, Math.abs(kick) * 9) +
        S.uI * 1.6 +
        (S.sh <= 0 ? -0.5 + 0.4 * Math.sin(S.t * 13) : 0);
      /* the gun is shouldered to fire (or aim) and for a moment after, carried at the chest otherwise */
      S.hotT = st.fire || st.aim || st.melee >= 0 ? 1.4 : Math.max(0, S.hotT - dt);
      S.carry += ((S.hotT > 0 || st.stab || rocket ? 0 : 1) - S.carry) * Math.min(1, dt * 8);
      const cw = gp === POSE.aim || gp === POSE.pistol ? S.carry : 0,
        cp = wp === 1 ? POSE.pistolCarry : POSE.carry;
      _c.copy(gp.p).lerp(cp.p, cw);
      /* aimed guns follow the look pitch (fully when sighted in) */
      const pf =
        gp === POSE.ads || gp === POSE.adsPistol
          ? 0.95
          : gp === POSE.aim || gp === POSE.pistol || gp === POSE.rocket
            ? 0.6
            : 0;
      /* (an aimed gun stays on the aim however far the body leans) */
      _e1.set(
        gp.r[0] +
          (cp.r[0] - gp.r[0]) * cw +
          st.pitch * pf * (1 - 0.6 * cw) +
          kick * (R.flip || 0.5) +
          (pf > 0 ? leanS * 0.85 : 0),
        gp.r[1] + (cp.r[1] - gp.r[1]) * cw,
        gp.r[2] + (cp.r[2] - gp.r[2]) * cw
      );
      if (rl >= 0) reloadGunMotion(rl, _c, _e1);
      _q2.setFromEuler(_e1);
      if (st.melee >= 0) {
        /* the strike: the gun swings across and forward, stock first */
        _c.z += 0.12 * wind - 0.48 * strike - 0.05 * fol;
        _c.x += 0.06 * wind - 0.18 * strike - 0.06 * fol;
        _c.y += 0.12 * strike;
        /* (the magnum whips: cocked up, rolled onto its side and brought down hard) */
        if (wp === 1) {
          _c.y += 0.08 * wind + 0.1 * strike;
          _q1.setFromEuler(
            _e1.set(0.45 * wind - 1.1 * strike - 0.3 * fol, 0.35 * strike, 1.1 * strike + 0.2 * fol)
          );
        } else
          _q1.setFromEuler(
            _e1.set(-0.5 * strike, -0.35 * wind + 1.1 * strike + 0.35 * fol, 0.5 * strike + 0.2 * fol)
          );
        _q2.multiply(_q1);
        /* the swing is heard and seen (rigEvents draws its arc) */
        if ((S.lastMel == null || S.lastMel < 0.08) && st.melee >= 0.08)
          ev = Object.assign(ev || {}, { swing: true });
      }
      S.lastMel = st.melee;
      _c.z += kick * 0.1;
      _c.y += br * 0.004;
      /* an emote: the gun rides in the capture's right hand, pointing along the arm */
      const em = S.mocap ? S.loco.emote : 0;
      if (em > 0.01) {
        const h = S.loco.hand;
        _kA.set(h[3], h[4], h[5]);
        _kB.set(h[3] - 0.27, h[4] - 0.17, h[5]).normalize();
        _q1.setFromUnitVectors(_a.set(0, 0, -1), _kB);
        _c.lerp(_kA.sub(_kB.multiplyScalar(0.12)), em);
        _q2.slerp(_q1, em);
      }
      /* a throw: the gun stays in the right hand, dipping down and to the right while the free arm
         swings, back up by about 0.45 s */
      if (S.thT < 0.45) {
        const d = Math.sin(Math.PI * Math.min(1, S.thT / 0.45));
        _c.y -= 0.09 * d;
        _c.x += 0.05 * d;
        _q2.multiply(_q1.setFromEuler(_e1.set(-0.3 * d, -0.15 * d, 0)));
      }
      const kg = Math.min(1, k * 1.5);
      /* the gun's weight: it trails the body's rise and fall and a turn on a spring, settling back */
      const bodyY = root.position.y + pelvis.position.y,
        vyB = S.bodyY == null ? 0 : (bodyY - S.bodyY) / Math.max(dt, 1e-3);
      S.bodyY = bodyY;
      _c.y += spring(S.spGy, clamp(-vyB * 0.012, -0.05, 0.05), dt, 3.5, 0.55);
      _c.x += spring(S.spGx, clamp(S.turn * 0.008, -0.04, 0.04), dt, 3, 0.6);
      gun.position.lerp(_c, kg);
      gun.quaternion.slerp(_q2, kg);
      gun.updateMatrix();
      /* the support hand is on the gun's fore grip (not reloading, throwing, swinging or grabbing) */
      let onFore = false;
      let curlL = 1,
        curlR = 1;
      if (S.flag) {
        /* carrying, in both hands: the flag's pole across the body, up over the right shoulder, or the
           oddball skull held out in front. Each hand closes on its own contact on the object (the pole,
           or a side of the skull) and the wrist is solved back from there, so the hands sit on it, and
           the carry swings with a blow (wound up, driven, followed through) */
        const sw = S.mocap ? Math.sin(S.loco.phase * Math.PI * 2) * 0.05 * Math.min(1, S.loco.moving) : 0;
        if (S.skull) {
          flagG.position.set(
            0,
            -0.08 + sw * 0.2 + 0.18 * wind - 0.12 * strike,
            -0.32 + 0.06 * wind - 0.13 * strike
          );
          flagG.rotation.set(-0.4 * wind + 0.6 * strike, 0, 0);
        } else {
          flagG.position.set(0.04, -0.02 + sw * 0.3, -0.24 - 0.06 * strike);
          flagG.rotation.set(
            0.35 + sw - 0.3 * wind + 0.35 * strike,
            0,
            -0.5 - 0.2 * wind + 0.35 * strike + 0.12 * fol
          );
        }
        flagG.updateMatrix();
        /* (if a grip is out of an arm's reach, the object comes in toward the body by the shortfall,
           so both hands stay on it through a swing) */
        for (let pass = 0; pass < 3; pass++) {
          let over = 0;
          for (let i = 0; i < 2; i++) {
            const A = arms[i];
            if (S.skull) {
              /* palms on the skull's sides, fingers up round it */
              _gn.set(A.side < 0 ? 1 : -1, 0, 0).applyQuaternion(flagG.quaternion);
              _gc.copy(flagG.position).addScaledVector(_gn, -0.155);
              _gk.set(0, 0, -1).applyQuaternion(flagG.quaternion);
            } else {
              /* round the pole (right hand high, left low), palms forward */
              _gk.set(0, 1, 0).applyQuaternion(flagG.quaternion);
              _gc.set(0, i ? -0.12 : -0.4, 0).applyMatrix4(flagG.matrix);
              _gn.set(0, 0, -1).addScaledVector(_gk, _gk.z).normalize();
              _gc.addScaledVector(_gn, -0.02);
            }
            gripAt(A, _gc, _gn, _gk, i ? _rk : _lk, i ? _gqR : _gqL);
            _gv.set(A.side * 0.26, 0.17, 0);
            const d = _gv.distanceTo(i ? _rk : _lk) - 0.57;
            if (d > over) {
              over = d;
              _gpull
                .copy(_gv)
                .sub(i ? _rk : _lk)
                .normalize();
            }
          }
          if (over <= 0.005 || pass === 2) break;
          flagG.position.addScaledVector(_gpull, over);
          flagG.updateMatrix();
        }
        curlL = curlR = S.skull ? 0.5 : 1;
        if (cloth) {
          const a = cloth.geometry.attributes.position,
            b0 = cloth.userData.base,
            sp = 5 + Math.min(8, spd);
          for (let i = 0; i < a.count; i++) {
            const xx = b0[i * 3];
            a.setZ(i, b0[i * 3 + 2] + Math.sin(S.t * sp + xx * 6) * 0.07 * xx + spd * 0.02 * xx);
          }
          a.needsUpdate = true;
        }
      } else {
        _rk.copy(R.grip).applyMatrix4(gun.matrix);
        if (rl >= 0) reloadKey(RIG_RELOAD, rl, R.fore, _lk).applyMatrix4(gun.matrix);
        else if (st.clamber) {
          /* the free hand grabs the ledge's edge and holds it while the body goes over */
          if (near && clK < 0.75) {
            chest.updateMatrixWorld(true);
            chest.worldToLocal(_lk.copy(S.clA));
          } else _lk.set(-0.22, 0.42, -0.38);
          curlL = 0.3;
        } else if (!air && st.sprint && !rocket && S.mocap) {
          /* the free arm swings with the stride as the capture's does, held a little off the body */
          /* (pumped hard: the fist comes up to the helmet, the elbow out) */
          const h = S.loco.hand;
          _lk.set(Math.min(h[0] - 0.04, -0.3), clamp(h[1] * 1.5 + 0.22, -0.25, 0.48), h[2] * 1.25 - 0.04);
          curlL = 1;
        } else if (st.pound === 2) {
          /* the slam: the free arm straight out to the side, fist closed */
          _lk.set(-0.78, -0.04, -0.12);
          curlL = 1;
        } else {
          _lk.copy(R.fore).applyMatrix4(gun.matrix);
          onFore = true;
          /* (held low, a long gun's handguard can be beyond the arm: the hand slides back along it,
             toward the trigger hand, to where it reaches) */
          const A = arms[0];
          _sp.copy(A.sh.position).add(A.clav.position);
          if (_lk.distanceToSquared(_sp) > 0.57 * 0.57) {
            _kA.copy(_lk);
            let lo = 0,
              hi = 1;
            for (let i = 0; i < 7; i++) {
              const m = (lo + hi) / 2;
              if (_kB.copy(_kA).lerp(_rk, m).distanceToSquared(_sp) > 0.57 * 0.57) lo = m;
              else hi = m;
            }
            _lk.copy(_kA).lerp(_rk, hi);
          }
        }
        /* (an emote frees the left hand: it does what the capture's does) */
        if (S.mocap && S.loco.emote > 0.01) {
          const h = S.loco.hand;
          _lk.lerp(_kA.set(h[0], h[1], h[2]), S.loco.emote);
          curlL = 1 - 0.6 * S.loco.emote;
          onFore = false;
        }
        /* a grenade, overhand with the free hand: up beside the helmet, forward to the centre (it
           leaves the hand at about 0.12 s), down and across to the hip, then back to the gun */
        if (S.thT < 0.45) {
          throwHand(S.thT, _kA);
          _lk.lerp(_kA, sstep(0, 0.04, S.thT) * (1 - sstep(0.3, 0.45, S.thT)));
          curlL = S.thT < 0.12 ? 1 : 0.35;
          onFore = false;
        }
      }
      if (air && !st.thrust && !st.stab && st.vy < -6) curlL = Math.min(curlL, 0.4);
      /* (a carried object's grip is held exactly: easing toward it would leave the hands trailing it) */
      if (S.flag) {
        S.lh.copy(_lk);
        S.rh.copy(_rk);
      } else {
        S.lh.lerp(_lk, kf);
        S.rh.lerp(_rk, Math.min(1, kf * 1.5));
      }
      /* (elbows out, not tucked) */
      /* (the recoil goes back through the shoulders, the trigger side more) */
      solveArm(arms[0], S.lh, _pole.set(-1, -0.2, 0.3), near, kick * 0.05);
      solveArm(arms[1], S.rh, _pole.set(1, -0.2, 0.35), near, kick * 0.11);
      /* (a carried object's grip at any distance; a weapon's hands only up close) */
      if (S.flag) {
        handTo(arms[1], _gqR, 1, curlR);
        handTo(arms[0], _gqL, 1, curlL);
      } else if (near) {
        handTo(arms[1], gun.quaternion, 0.85, curlR);
        /* (a vertical fore grip is held like the trigger grip, the hand closed round it) */
        if (R.foreGrip && onFore) handTo(arms[0], gun.quaternion, 0.85, 1);
        else handTo(arms[0], gun.quaternion, curlL > 0.7 ? 0.7 : 0.2, curlL);
      }
      /* the reload's sounds, heard from anyone: seat, slap, bolt */
      if (rl >= 0 && S.lastRS >= 0) {
        if (S.lastRS < RELOAD_T.slap && rl >= RELOAD_T.slap) ev = Object.assign(ev || {}, { slap: true });
        if (S.lastRS < RELOAD_T.release && rl >= RELOAD_T.release)
          ev = Object.assign(ev || {}, { bolt: true });
      }
      S.lastRS = rl >= 0 ? rl : -1;
      if (rl >= 0 && wp === 0) {
        grip.geometry = gripBase;
        const inHand = magInHand(rl);
        mag.visible = !(rl >= RELOAD_T.out && rl < RELOAD_T.pouch);
        if (inHand) {
          _m1.copy(gun.matrix).invert();
          mag.position.copy(S.lh).applyMatrix4(_m1);
          mag.position.y += 0.03;
        } else mag.position.copy(MAGSLOT);
        if (S.lastR >= 0 && S.lastR < RELOAD_T.out && rl >= RELOAD_T.out) {
          root.updateMatrixWorld(true);
          ev = Object.assign(ev || {}, {
            drop: mag.getWorldPosition(new V3()),
            dropQ: mag.getWorldQuaternion(new THREE.Quaternion()),
          });
        }
        if (S.lastR >= 0 && S.lastR < RELOAD_T.seat && rl >= RELOAD_T.seat)
          ev = Object.assign(ev || {}, { magIn: true });
        S.lastR = rl;
      } else {
        grip.geometry = GRIP_MAG;
        mag.visible = false;
        mag.position.copy(MAGSLOT);
        S.lastR = -1;
      }
      /* antenna whips with acceleration and turns */
      antenna.rotation.set(
        spring(S.spAnt, clamp(S.accF * 0.02 + (air ? -S.vy * 0.015 : 0), -0.5, 0.5), dt, 2.2, 0.18),
        0,
        spring(S.spAntR, clamp(S.turn * 0.06, -0.5, 0.5), dt, 2, 0.2)
      );
      /* sprinting, the pack's thrusters assist: a low flickering burn, brighter with speed */
      const hs = Math.hypot(st.vx, st.vz),
        slow = TUNE.run * 0.7;
      rig.jet = st.sprint && !air ? clamp((hs - slow) / Math.max(0.1, TUNE.sprint - slow), 0.2, 1) : 0;
      const gl = st.thrust
        ? 1
        : st.stab
          ? 0.55 + Math.random() * 0.3
          : st.pound === 1
            ? 0.4 + Math.random() * 0.4
            : st.pound === 2
              ? 0.8
              : rig.jet * (0.38 + Math.random() * 0.24);
      for (const g of glows) {
        g.material.opacity += (gl - g.material.opacity) * kf;
        g.scale.y = 0.25 + g.material.opacity * 0.35;
        /* (a sprite draws even when it is fully transparent) */
        g.visible = g.material.opacity > 0.01;
      }
      if (S.mocap && S.loco.step && !air) {
        /* (at the foot that came down, so the sound takes the surface under it) */
        const o = S.loco.stepFoot * 3,
          lx = S.loco.ank[o],
          lz = S.loco.ank[o + 2];
        rig.stepAt.set(
          root.position.x + lx * cy + lz * sy,
          root.position.y,
          root.position.z - lx * sy + lz * cy
        );
        ev = Object.assign(ev || {}, { step: true, sprint: st.sprint, at: rig.stepAt });
      }
      return ev;
    },
  };
  /* death: topple in the direction of momentum, knees buckle first, hands go limp, then a small settle bounce */
  function deathPose(dt) {
    const F =
      S.fall ||
      (S.fall = {
        bx: 0,
        bz: 1,
        ang: 0,
        angV: 0.4,
        g: 7,
        vx: 0,
        vz: 0,
        spin: 0,
        maxA: 1.45,
        slump: 0,
        restT: -1,
        thrown: false,
      });
    S.deadT += dt;
    const kf = 1 - Math.exp(-20 * dt);
    /* a buckle: the knees go first (a quarter second), then the body pitches over them */
    const bk = F.thrown ? 0 : sstep(0, 0.28, S.deadT);
    if (F.thrown || S.deadT > 0.18) F.angV += F.g * dt;
    F.ang += F.angV * dt;
    /* the topple meets the ground (or the wall, or the step): a bounce, then rest */
    if (F.ang > F.maxA) {
      F.ang = F.maxA;
      F.angV = Math.abs(F.angV) > 0.6 ? -F.angV * 0.22 : 0;
      if (F.restT < 0) F.restT = S.deadT;
    }
    /* then the crumple: settled on the ground, the knees fold and the body sags into it */
    const cr = F.restT < 0 ? 0 : sstep(0, 0.45, S.deadT - F.restT);
    pivot.rotation.set(F.ang * F.bz, F.spin * Math.min(1, S.deadT), -F.ang * F.bx);
    /* (sliding stops at a wall) */
    const fr = Math.exp(-(F.slump > 0 ? 9 : 2.6) * dt);
    F.vx *= fr;
    F.vz *= fr;
    pivot.position.x += F.vx * dt;
    pivot.position.z += F.vz * dt;
    const c = Math.min(1, S.deadT * 3.4);
    pelvis.position.y = 0.96 - (F.thrown ? 0.3 * c * c : 0.42 * bk + 0.04 * c) - (0.25 * F.slump + 0.06) * cr;
    pelvis.rotation.y = 0;
    /* the hit's jolt: the torso whips away from the blow and the head snaps, before the slump */
    const jolt = S.deadT < 0.3 ? Math.sin((S.deadT / 0.3) * Math.PI) : 0;
    spine.rotation.set(
      -0.15 * c + 0.3 * jolt * F.bz - 0.18 * cr,
      0.25 * jolt * F.bx,
      F.bx * (0.1 * c + 0.2 * jolt + 0.1 * cr)
    );
    spine2.rotation.set(
      -0.15 * c + 0.3 * jolt * F.bz - 0.12 * cr,
      0.15 * jolt * F.bx,
      F.bx * (0.1 * c + 0.2 * jolt)
    );
    neck.rotation.set(0.45 * c + 0.4 * jolt, 0, 0);
    head.rotation.set(0.2 * c + 0.3 * jolt, F.bx * 0.4 * c, 0);
    legs.forEach((g, i) => {
      _lk.set(
        g.side * (0.15 + 0.05 * c + 0.06 * cr),
        -pelvis.position.y + 0.08 + 0.18 * c * (i ? 1 : 0.4) + (0.16 + 0.2 * F.slump) * cr * (i ? 0.6 : 1),
        (-0.08 + i * 0.22) * c - (0.12 + 0.2 * F.slump) * cr + 0.3 * bk
      );
      /* (thrown, the legs trail loose) */
      if (F.thrown) _lk.y += 0.25 * Math.sin(Math.min(1, S.deadT * 2) * Math.PI) * (i ? 1 : 0.6);
      g.cur.lerp(_lk, kf);
      solve2(g.hip, g.kn, 0.44, 0.43, g.hip.position, g.cur, _pole.set(g.side * 0.15, 0, -1));
      _q1.copy(g.hip.quaternion).multiply(g.kn.quaternion).invert();
      g.an.quaternion.copy(_q1).multiply(_q2.setFromAxisAngle(_a.set(1, 0, 0), -0.6 * c));
      g.toe.rotation.x = 0;
    });
    const fl = Math.min(1, S.deadT * 2.5);
    S.lh.lerp(_lk.set(-0.56, -0.02 + 0.38 * fl * F.bz, 0.2 + 0.25 * fl), kf * 0.7);
    S.rh.lerp(_rk.set(0.56, -0.02 + 0.33 * fl * F.bz, 0.15 + 0.3 * fl), kf * 0.7);
    /* (thrown, the arms fly up beside the head for a moment, then go limp) */
    if (F.thrown && S.deadT < 0.45) {
      const up = Math.sin((S.deadT / 0.45) * Math.PI);
      S.lh.lerp(_lk.set(-0.42, 0.62, 0.05), up * kf);
      S.rh.lerp(_rk.set(0.42, 0.6, 0.05), up * kf);
    }
    solveArm(arms[0], S.lh, _pole.set(-0.9, -0.5, 0.5), false);
    solveArm(arms[1], S.rh, _pole.set(0.9, -0.5, 0.5), false);
    for (const A of arms) {
      A.hand.quaternion.identity();
      A.grip += (0.25 - A.grip) * kf;
      A.fing.rotation.set(0, 0, -A.side * A.grip);
      A.tip.rotation.set(0, 0, -A.side * A.grip);
    }
    for (const g of glows) {
      g.material.opacity = 0;
      g.visible = false;
    }
    rig.jet = 0;
    if (S.deadT > 3.4) root.visible = false;
  }
  rig.setLabel(label);
  RIGS.add(rig);
  /* materials only: rim light, panel lines, team pattern, visor, shield ripple (characters/look.js) */
  styleRig(rig);
  return rig;
}
function bodyState(B, extra) {
  return {
    vx: B.vel.x,
    vz: B.vel.z,
    vy: B.vel.y,
    yaw: B.yaw,
    ground: B.ground && !B.clamber,
    sprint: B.sprint && B.ground,
    slide: B.slideT > 0,
    crouch: B.crouch && B.slideT <= 0,
    thrust: B.thrustT > 0,
    stab: B.stabbing,
    pound: B.pound,
    clamber: !!B.clamber,
    /* (how far through it, and how high the ledge: only known where the body is simulated) */
    clK: B.clamber && B.clamber.dur ? Math.min(1, B.clamber.t / B.clamber.dur) : -1,
    clH: B.clamber && B.clamber.to ? B.clamber.to.y - B.clamber.from.y : 0,
    charge: B.chargeT > 0,
    melee: B.meleeT > 0 ? 1 - B.meleeT / 0.4 : -1,
    aim: !!B.aiming,
    pitch: B.pitch,
    shield: B.shield,
    reload: extra && extra.reload != null ? extra.reload : -1,
    fire: extra && extra.fire,
    wpn: extra && extra.wpn | 0,
    flag: !!(extra && extra.flag),
    flagColor: extra && extra.flagColor,
    /* the carried thing is the oddball skull, not a flag */
    skull: !!(extra && extra.skull),
    /* seconds since a grenade left the hand (-1: none) */
    throw: extra && extra.throw != null ? extra.throw : -1,
  };
}
