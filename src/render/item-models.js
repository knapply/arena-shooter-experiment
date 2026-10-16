/* ============ ITEM MODELS: what a match is played around ============
   Grenades (in flight, on the floor and as pickups), the stands map pickups sit on, and the oddball
   skull. Original designs in the game's own language (angular wedge plates, graphite with amber, team
   colours only for team things). Following the style guide's principles, each class of item has a
   signal no other class uses:
   - a map pickup's stand (a low hex plinth; a power weapon's adds three wedge prongs): an amber
     beam of light rising from it, and amber light, outside both team colours; the power weapon's
     pulses while it is up. The weapon floats a little above it and turns slowly;
   - grenades: a point light and a timing signal. The frag (a graphite octagonal puck with an
     orange band) glows steadily in flight and tumbles, then flashes five times a second from just
     after it lands; the plasma (a teal-green core in a four-point graphite cage) glows steadily,
     then swells for its last 0.4 s;
   - the skull: faceted bone with a graphite crest and slit eyes that glow orange.
   (Dropped weapons look inert: weapons/pickups.js lays them flat, unlit and still.)
   Each model is a handful of merged pieces (one or two draws), built once and shared. Drop pods,
   supply pods and the flags have their own modules (game/pods.js, game/supply-pods.js, the CTF map). */
const ITEM_MAT = {
  graphite: new THREE.MeshStandardMaterial({ color: "#2b3136", roughness: 0.45, metalness: 0.7 }),
  bone: new THREE.MeshStandardMaterial({
    color: "#f2e6c9",
    emissive: "#ffcf6b",
    emissiveIntensity: 0.18,
    roughness: 0.55,
    metalness: 0.1,
  }),
};
const ITEM_GEO = {};
const _imAt = (g, x, y, z, rx = 0, ry = 0, rz = 0) => [
  g,
  new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")).setPosition(x, y, z),
];
/** the frag's body (graphite puck and caps) and band (lit) */
function fragGeos() {
  if (ITEM_GEO.frag) return ITEM_GEO.frag;
  ITEM_GEO.frag = {
    body: mergeGeos([
      _imAt(new THREE.CylinderGeometry(0.072, 0.072, 0.06, 8), 0, 0, 0),
      _imAt(new THREE.CylinderGeometry(0.045, 0.072, 0.03, 8), 0, 0.045, 0),
      _imAt(new THREE.CylinderGeometry(0.072, 0.045, 0.03, 8), 0, -0.045, 0),
      _imAt(new THREE.BoxGeometry(0.03, 0.02, 0.05), 0, 0.068, 0),
    ]),
    band: mergeGeos([_imAt(new THREE.CylinderGeometry(0.076, 0.076, 0.02, 8), 0, 0, 0)]),
  };
  return ITEM_GEO.frag;
}
/** the plasma grenade's cage (four graphite points round a core) and core (lit) */
function plasmaGeos() {
  if (ITEM_GEO.plasma) return ITEM_GEO.plasma;
  const pts = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  const cage = [];
  for (const [x, y, z] of pts) {
    const k = 0.07 / Math.sqrt(3);
    const t = new THREE.TetrahedronGeometry(0.035);
    cage.push(_imAt(t, x * k, y * k, z * k, Math.atan2(y, Math.hypot(x, z)), Math.atan2(x, z)));
  }
  ITEM_GEO.plasma = {
    cage: mergeGeos(cage),
    core: mergeGeos([_imAt(new THREE.OctahedronGeometry(0.055), 0, 0, 0)]),
  };
  return ITEM_GEO.plasma;
}
/* the plasma grenade's colour: a teal-green of its own */
const PLASMA_HEX = 0x38f5b0;
/**
 * a grenade to throw or draw: a group whose userData.tick(fuseLeft, sinceLanded) runs its signal
 * (sinceLanded < 0 while it flies)
 * @param {string} type "frag" or "plasma"
 */
function nadeModel(type) {
  const g = new THREE.Group();
  if (type === "plasma") {
    const G = plasmaGeos();
    const cage = new THREE.Mesh(G.cage, ITEM_MAT.graphite);
    const coreM = new THREE.MeshStandardMaterial({
      color: "#0a2a20",
      emissive: PLASMA_HEX,
      emissiveIntensity: 2.4,
    });
    const core = new THREE.Mesh(G.core, coreM);
    const glow = new THREE.Sprite(plasMat.clone());
    glow.scale.setScalar(0.3);
    g.add(cage, core, glow);
    g.userData.tick = fuse => {
      /* steady, then a swell over its last 0.4 s to nearly three times the size */
      const k = Math.max(0, 1 - fuse / 0.4);
      coreM.emissiveIntensity = 2.4 + 3 * k;
      glow.scale.setScalar(0.3 * (1 + 1.7 * k * k));
    };
  } else {
    const G = fragGeos();
    const body = new THREE.Mesh(G.body, ITEM_MAT.graphite);
    const bandM = new THREE.MeshStandardMaterial({
      color: "#5a2a08",
      emissive: "#ff8a2a",
      emissiveIntensity: 2,
    });
    const band = new THREE.Mesh(G.band, bandM);
    body.castShadow = true;
    g.add(body, band);
    g.userData.tick = (fuse, landed) => {
      /* steady in flight; from a third of a second after it lands, a short flash every 0.2 s */
      const flash = landed >= 0.33 && (landed - 0.33) % 0.2 < 0.035;
      bandM.emissiveIntensity = landed < 0.33 ? 2 : flash ? 6 : 0.6;
    };
  }
  return g;
}
/** the grenades lying on the floor as a pickup (one frag, one plasma), as [geometry, material] pairs */
function nadeFloorParts() {
  const F = fragGeos(),
    P = plasmaGeos();
  const lit = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 1.6 });
  const at = (geo, x, y, z, rx = 0) => {
    const c = geo.clone();
    c.applyMatrix4(new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z));
    return c;
  };
  return [
    [
      mergeGeos([
        [at(F.body, -0.09, 0, 0, 1.2), new THREE.Matrix4()],
        [at(P.cage, 0.09, 0, 0), new THREE.Matrix4()],
      ]),
      ITEM_MAT.graphite,
    ],
    [at(F.band, -0.09, 0, 0, 1.2), lit("#5a2a08", "#ff8a2a")],
    [at(P.core, 0.09, 0, 0), lit("#0a2a20", "#38f5b0")],
  ];
}
/** a map pickup's stand: the plinth, and its light (power weapons add three wedge prongs) */
function standGeos(power) {
  const key = power ? "standP" : "standL";
  if (ITEM_GEO[key]) return ITEM_GEO[key];
  const body = [
    _imAt(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 6), 0, 0.06, 0),
    _imAt(new THREE.CylinderGeometry(0.46, 0.6, 0.06, 6), 0, 0.15, 0),
  ];
  const light = [_imAt(new THREE.TorusGeometry(0.53, 0.02, 3, 6), 0, 0.125, 0, Math.PI / 2, Math.PI / 6)];
  if (power)
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
      const x = Math.sin(a) * 0.5,
        z = Math.cos(a) * 0.5;
      /* leaning in toward the weapon */
      body.push(_imAt(new THREE.BoxGeometry(0.09, 0.42, 0.16), x, 0.36, z, -0.35, a));
      light.push(_imAt(new THREE.BoxGeometry(0.095, 0.06, 0.165), x * 0.86, 0.56, z * 0.86, -0.35, a));
    }
  ITEM_GEO[key] = { body: mergeGeos(body), light: mergeGeos(light) };
  return ITEM_GEO[key];
}
/* free items are amber: outside both team colours */
const ITEM_AMBER = "#ffb347";
/** the soft cone of light that rises from a pickup's stand */
let STAND_BEAM = null;
/**
 * a map pickup's stand; userData.tick(avail, t) pulses its light while the weapon is up
 * @param {boolean} power
 */
function standModel(power) {
  const G = standGeos(power);
  const g = new THREE.Group();
  const col = ITEM_AMBER;
  const lightM = new THREE.MeshStandardMaterial({ color: "#10161a", emissive: col, emissiveIntensity: 1.5 });
  const body = new THREE.Mesh(G.body, ITEM_MAT.graphite);
  body.receiveShadow = true;
  if (!STAND_BEAM) {
    STAND_BEAM = new THREE.CylinderGeometry(0.2, 0.42, 1.5, 6, 1, true);
    STAND_BEAM.translate(0, 0.93, 0);
  }
  const beamM = new THREE.MeshBasicMaterial({
    color: ITEM_AMBER,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  g.add(body, new THREE.Mesh(G.light, lightM), new THREE.Mesh(STAND_BEAM, beamM));
  g.userData.tick = (avail, t) => {
    const k = !avail ? 0.2 : power ? 0.8 + Math.sin(t * 4) * 0.2 : 0.8;
    lightM.emissiveIntensity = 1.8 * k;
    beamM.opacity = 0.17 * k;
  };
  return g;
}
/** the oddball skull's geometry: faceted bone with a graphite crest, and its eyes (lit) */
function skullGeos() {
  if (ITEM_GEO.skull) return ITEM_GEO.skull;
  const cran = new THREE.IcosahedronGeometry(0.16, 0);
  cran.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.92, 1.12));
  ITEM_GEO.skull = {
    bone: mergeGeos([
      [cran, new THREE.Matrix4()],
      /* a wedge brow, cheek plates and a tapered jaw, all flat-faced */
      _imAt(new THREE.BoxGeometry(0.25, 0.05, 0.09), 0, 0.0, -0.13, 0.25),
      _imAt(new THREE.CylinderGeometry(0.1, 0.065, 0.11, 5), 0, -0.12, -0.08, 0.2, Math.PI / 5),
      _imAt(new THREE.BoxGeometry(0.05, 0.08, 0.12), 0.11, -0.07, -0.05, 0, 0.3),
      _imAt(new THREE.BoxGeometry(0.05, 0.08, 0.12), -0.11, -0.07, -0.05, 0, -0.3),
    ]),
    crest: mergeGeos([_imAt(new THREE.BoxGeometry(0.025, 0.07, 0.26), 0, 0.15, 0.02, -0.15)]),
    eyes: mergeGeos([
      _imAt(new THREE.BoxGeometry(0.075, 0.022, 0.03), 0.055, -0.035, -0.17, 0, 0, 0.3),
      _imAt(new THREE.BoxGeometry(0.075, 0.022, 0.03), -0.055, -0.035, -0.17, 0, 0, -0.3),
    ]),
  };
  return ITEM_GEO.skull;
}
/** the skull: bone, crest and eyes (shared by the one on the floor and the one in a carrier's hands) */
function skullModel() {
  const G = skullGeos();
  const g = new THREE.Group();
  const eyesM = new THREE.MeshStandardMaterial({
    color: "#3a1404",
    emissive: "#ff7a1a",
    emissiveIntensity: 2.4,
  });
  g.add(
    new THREE.Mesh(G.bone, ITEM_MAT.bone),
    new THREE.Mesh(G.crest, ITEM_MAT.graphite),
    new THREE.Mesh(G.eyes, eyesM)
  );
  g.userData.tick = t => (eyesM.emissiveIntensity = 1.8 + Math.sin(t * 3) * 0.8);
  return g;
}
/** a capture-the-flag flag's mast (a hex foot, a tapering shaft and a wedge finial), its stand (a hex
    plinth with three wedge pylons) and the stand's hex ring of light */
function flagGeos() {
  if (ITEM_GEO.flag) return ITEM_GEO.flag;
  const pylons = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    pylons.push(
      _imAt(new THREE.BoxGeometry(0.16, 0.5, 0.28), Math.sin(a) * 0.98, 0.3, Math.cos(a) * 0.98, 0.3, a)
    );
  }
  const ring = new THREE.RingGeometry(0.95, 1.1, 6, 1);
  ring.rotateX(-Math.PI / 2);
  ITEM_GEO.flag = {
    mast: mergeGeos([
      _imAt(new THREE.CylinderGeometry(0.11, 0.16, 0.22, 6), 0, 0.11, 0),
      _imAt(new THREE.CylinderGeometry(0.03, 0.045, 3.0, 6), 0, 1.6, 0),
      _imAt(new THREE.ConeGeometry(0.07, 0.26, 4), 0, 3.23, 0),
      _imAt(new THREE.BoxGeometry(0.1, 0.06, 0.1), 0, 1.42, 0),
    ]),
    stand: mergeGeos([
      _imAt(new THREE.CylinderGeometry(0.9, 1.05, 0.14, 6), 0, 0.07, 0),
      _imAt(new THREE.CylinderGeometry(0.72, 0.9, 0.06, 6), 0, 0.17, 0),
      ...pylons,
    ]),
    ring,
  };
  return ITEM_GEO.flag;
}
/** a flag's banner: cloth cut in a chevron at its end, with a diamond core at the mast (its own
    geometry: the cloth's vertices wave) */
function flagBanner() {
  const g = new THREE.PlaneGeometry(0.95, 0.6, 10, 4);
  g.translate(0.475, 0, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i);
    if (x > 0.6) {
      const d = 0.24 * (1 - Math.abs(y) / 0.3);
      p.setX(i, 0.6 + ((x - 0.6) / 0.35) * (0.35 - d));
    }
  }
  const core = new THREE.OctahedronGeometry(0.1);
  core.translate(0.05, 0, 0);
  return mergeGeos([
    [g, new THREE.Matrix4()],
    [core, new THREE.Matrix4()],
  ]);
}
