/* ============ GATE LOOK: the blast walls' meshes, warning lamps and sounds (engine only) ============
   One mesh per gate (its leaves merged) with its own material, so its hazard chevrons can flash on
   their own. A sunk gate leaves its striped top flush with the floor, so you can see where a wall will
   come up; it flashes and the klaxon sounds GATE_CYCLE.warn seconds before a gate moves either way. */
let GATE_TEX = null;
function gateTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#2b3138";
  x.fillRect(0, 0, 128, 256);
  /* armour plates with dark seams */
  x.fillStyle = "#353c44";
  for (const [y, h] of [
    [50, 86],
    [142, 82],
  ])
    for (const px of [4, 66]) x.fillRect(px, y, 58, h);
  /* hazard chevrons along the top and bottom (these glow: the texture is the emissive map too) */
  const band = (y0, h) => {
    x.fillStyle = "#14171a";
    x.fillRect(0, y0, 128, h);
    x.fillStyle = "#ffae2e";
    for (let k = -1; k < 9; k++) {
      x.beginPath();
      x.moveTo(k * 16, y0 + h);
      x.lineTo(k * 16 + 8, y0 + h);
      x.lineTo(k * 16 + 16 + 8, y0);
      x.lineTo(k * 16 + 16, y0);
      x.fill();
    }
  };
  band(4, 30);
  band(230, 26);
  /* the lamp strip under the top band */
  x.fillStyle = "#ff8a3c";
  x.fillRect(0, 38, 128, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
/** a gate's mesh (from buildGates, while its map is built) */
function gateLook(g, group) {
  if (!GATE_TEX) GATE_TEX = gateTex();
  const mat = new THREE.MeshStandardMaterial({
    color: "#8a96a2",
    map: GATE_TEX,
    emissiveMap: GATE_TEX,
    emissive: new THREE.Color("#ff9a2e"),
    emissiveIntensity: 0.25,
    roughness: 0.5,
    metalness: 0.55,
  });
  const items = g.boxes.map(b => {
    const w = b.x1 - b.x0,
      d = b.z1 - b.z0;
    const geo = new THREE.BoxGeometry(w, g.h, d);
    /* one texture tile is the gate's height: the chevrons sit at its top and bottom */
    scaleBoxUV(geo, w, g.h, d, g.h);
    return [geo, new THREE.Matrix4().makeTranslation((b.x0 + b.x1) / 2, -g.h / 2, (b.z0 + b.z1) / 2)];
  });
  const m = new THREE.Mesh(mergeGeos(items), mat);
  for (const [geo] of items) geo.dispose();
  m.receiveShadow = true;
  m.visible = false;
  group.add(m);
  g.mesh = m;
  g.snd = -2;
}
/** draw the live gates as they are at gate time t (the replays pass a time in the past) */
function gateDraw(t) {
  for (const g of GATES.live) {
    const m = g.mesh;
    if (!m) continue;
    m.visible = GATES.on;
    if (!GATES.on) continue;
    const lift = gateLift(g, t),
      u = gateCycleT(g, t),
      C = GATE_CYCLE;
    /* a sunk gate's top stays 2 cm proud of the floor, so its stripes show where it will rise */
    m.position.y = Math.max(0.02, lift * g.h);
    m.castShadow = lift > 0.05;
    const up = C.open + C.move + C.shut;
    const warn = (u >= C.open - C.warn && u < C.open) || (u >= up - C.warn && u < up);
    const moving = (u >= C.open && u < C.open + C.move) || u >= up;
    m.material.emissiveIntensity = warn
      ? 0.3 + 1.7 * (Math.sin(t * Math.PI * 5) > 0 ? 1 : 0)
      : moving
        ? 1.6
        : lift > 0
          ? 0.5
          : 0.25;
  }
}
const _gp = new THREE.Vector3();
/** sounds as each gate passes the points of its cycle: klaxon, the hydraulics, the stop */
function gateSounds() {
  if (!GATES.on || REPLAY.active) return;
  const C = GATE_CYCLE,
    up = C.open + C.move + C.shut;
  for (const g of GATES.live) {
    const u = gateCycleT(g, GATES.t);
    /* a sound step: half-seconds of a warning, then the starts and stops */
    const s =
      u < 0
        ? -1
        : u < C.open - C.warn
          ? 0
          : u < C.open
            ? 100 + Math.floor((u - C.open + C.warn) * 2)
            : u < C.open + C.move
              ? 200
              : u < up - C.warn
                ? 300
                : u < up
                  ? 400 + Math.floor((u - up + C.warn) * 2)
                  : 500;
    const was = g.snd;
    g.snd = s;
    if (s === was || was === -2) continue;
    /* heard from the nearest point of the gate */
    let bx = 0,
      bd = Infinity;
    for (const b of g.boxes) {
      const px = clamp(camera.position.x, b.x0, b.x1),
        pz = clamp(camera.position.z, b.z0, b.z1),
        d = Math.hypot(px - camera.position.x, pz - camera.position.z);
      if (d < bd) {
        bd = d;
        bx = b;
        _gp.set(px, 1.2, pz);
      }
    }
    if (!bx) continue;
    if ((s >= 100 && s < 200) || (s >= 400 && s < 500)) sfxAt("klaxon", _gp, 70, s % 2 ? 0.5 : 0.7);
    else if (s === 200 || s === 500) sfxAt("gatemove", _gp, 60);
    else if ((s === 300 && was === 200) || (s === 0 && was === 500)) sfxAt("gateslam", _gp, 60, s ? 1 : 0.6);
  }
}
onFrame(
  () => {
    gateDraw(GATES.t);
    gateSounds();
  },
  { menu: true, full: true }
);
