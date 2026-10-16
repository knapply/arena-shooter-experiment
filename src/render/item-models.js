/* ============ ITEM MODELS: what a match is played around ============
   Grenades (in flight, on the floor and as pickups), the stands map pickups sit on, and the oddball
   skull. Original designs in the game's own language (angular wedge plates, graphite with orange,
   team and power colours for light), each told apart at a glance by more than colour:
   - frag grenade: a graphite octagonal puck with an orange band whose light blinks, faster as the
     fuse runs down; it tumbles in flight;
   - plasma grenade: a cyan core in a four-point graphite cage, its glow pulsing;
   - a map pickup's stand: a low hex plinth with a lit inset; a power weapon's adds three wedge
     prongs and pulses blue while it is up (lab weapons glow orange, steady);
   - the skull: faceted bone with a graphite crest and slit eyes that glow orange.
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
/**
 * a grenade to throw or draw: a group whose userData.tick(fuseLeft, t) blinks or pulses its light
 * @param {string} type "frag" or "plasma"
 */
function nadeModel(type) {
  const g = new THREE.Group();
  if (type === "plasma") {
    const G = plasmaGeos();
    const cage = new THREE.Mesh(G.cage, ITEM_MAT.graphite);
    const coreM = new THREE.MeshStandardMaterial({
      color: "#0b2a33",
      emissive: "#5ad2ff",
      emissiveIntensity: 2.4,
    });
    const core = new THREE.Mesh(G.core, coreM);
    const glow = new THREE.Sprite(plasMat.clone());
    glow.scale.setScalar(0.32);
    g.add(cage, core, glow);
    g.userData.tick = (fuse, t) => {
      const k = 0.5 + 0.5 * Math.sin(t * (fuse < 0.6 ? 26 : 12));
      coreM.emissiveIntensity = 1.6 + 1.6 * k;
      glow.scale.setScalar(0.26 + 0.12 * k);
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
    g.userData.tick = (fuse, t) => {
      /* blinks four times a second, then faster in its last half second */
      const on = Math.sin(t * (fuse < 0.5 ? 60 : 25)) > 0;
      bandM.emissiveIntensity = on ? 3 : 0.35;
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
    [at(P.core, 0.09, 0, 0), lit("#0b2a33", "#5ad2ff")],
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
/**
 * a map pickup's stand; userData.tick(avail, t) pulses its light while the weapon is up
 * @param {boolean} power
 */
function standModel(power) {
  const G = standGeos(power);
  const g = new THREE.Group();
  const col = power ? "#5ab8ff" : "#ffa040";
  const lightM = new THREE.MeshStandardMaterial({ color: "#10161a", emissive: col, emissiveIntensity: 1.5 });
  const body = new THREE.Mesh(G.body, ITEM_MAT.graphite);
  body.receiveShadow = true;
  g.add(body, new THREE.Mesh(G.light, lightM));
  g.userData.tick = (avail, t) => {
    lightM.emissiveIntensity = !avail ? 0.25 : power ? 1.4 + Math.sin(t * 4) * 0.8 : 1.4;
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
      _imAt(new THREE.CylinderGeometry(0.026, 0.038, 2.1, 6), 0, 1.15, 0),
      _imAt(new THREE.ConeGeometry(0.06, 0.22, 4), 0, 2.31, 0),
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
