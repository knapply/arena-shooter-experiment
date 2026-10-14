/* ============ first-person viewmodels: the models in weapons/models.js, sights, hands and their poses ============ */
const vmRoot = new THREE.Group();
camera.add(vmRoot);
const vmArmor = new THREE.MeshStandardMaterial({ color: myColor, roughness: 0.42, metalness: 0.55 });
vmArmor.color.multiplyScalar(0.55);
const vmDark = new THREE.MeshStandardMaterial({ color: "#232b30", roughness: 0.55, metalness: 0.5 });
const vmSuit = new THREE.MeshStandardMaterial({ color: "#1a2024", roughness: 0.8 });
const vmAcc = new THREE.MeshStandardMaterial({
  color: "#c98a3a",
  emissive: "#ff9a2e",
  emissiveIntensity: 0.25,
  roughness: 0.4,
  metalness: 0.4,
});
const vmGlove = new THREE.MeshStandardMaterial({ color: "#2a3237", roughness: 0.7, metalness: 0.15 });
const vmPlate = new THREE.MeshStandardMaterial({ color: "#3a454c", roughness: 0.4, metalness: 0.7 });
const vmArc = new THREE.MeshStandardMaterial({
  color: "#2a5a6a",
  emissive: "#8a5cff",
  emissiveIntensity: 0.9,
  roughness: 0.3,
  metalness: 0.3,
});
/* the weapon's lights: the held weapon's colour, a flare on each shot, red and blinking on low ammo (vmLights) */
const vmGlow = new THREE.MeshStandardMaterial({
  color: "#000000",
  emissive: "#5ad2ff",
  emissiveIntensity: 1.2,
});
const vmGlass = new THREE.MeshBasicMaterial({
  color: 0x7fd4ff,
  transparent: true,
  opacity: 0.07,
  depthWrite: false,
  side: THREE.DoubleSide,
});
/* the ammo counter: one small canvas shared by every weapon's display (only the held one is drawn) */
const vmCtrC = document.createElement("canvas");
vmCtrC.width = 64;
vmCtrC.height = 32;
const vmCtrT = new THREE.CanvasTexture(vmCtrC);
vmCtrT.encoding = THREE.sRGBEncoding;
const vmCtr = new THREE.MeshBasicMaterial({ map: vmCtrT });
vmCtr.color.setScalar(1.8);
const VM_MAT = { D: vmDark, P: vmPlate, A: vmArmor, S: vmSuit, G: vmGlow, C: vmAcc, X: vmArc };
function vmBox(p, w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  p.add(o);
  return o;
}
function dot(p, color, size, x, y, z) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  s.scale.setScalar(size);
  s.position.set(x, y, z);
  s.renderOrder = 20;
  p.add(s);
  return s;
}
/* draw-call budget: a weapon's parts merge into one mesh per material; the magazine is one more
   (the reload moves it), merged around where it seats; the counter, sight glass and dots are separate */
function vmModel(i) {
  const g = new THREE.Group(),
    by = new Map(),
    mag = [];
  for (const p of gunParts(i)) {
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(p.rx, p.ry, 0))
      .setPosition(p.x, p.y, p.z);
    if (p.k === "n") {
      const o = new THREE.Mesh(gunGeo(p, true), vmCtr);
      o.applyMatrix4(m);
      g.add(o);
      continue;
    }
    const mt = VM_MAT[p.m];
    if (!p.mag && !by.has(mt)) by.set(mt, []);
    (p.mag ? mag : by.get(mt)).push([gunGeo(p, true), m, p]);
  }
  for (const [mt, list] of by) g.add(new THREE.Mesh(mergeGeos(list), mt));
  const s = mag[0][2],
    mg = new THREE.Mesh(
      mergeGeos(
        mag.map(([gg, m]) => [gg, m.premultiply(new THREE.Matrix4().makeTranslation(-s.x, -s.y, -s.z))])
      ),
      VM_MAT[s.m]
    );
  mg.position.set(s.x, s.y, s.z);
  g.add(mg);
  for (const [gg] of [...by.values()].flat().concat(mag)) gg.dispose();
  g.visible = i === 0;
  vmRoot.add(g);
  return { g, mag: mg, slot: mg.position.clone() };
}
/* a holo sight's glass and red dot at (0, y, z); the dot is the sight line, so ADS centres it on screen
   where rounds go */
function vmHolo(g, y, z, w, h) {
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vmGlass);
  gl.position.set(0, y, z);
  g.add(gl);
  dot(g, 0xff3b30, 0.0042, 0, y, z);
  return y;
}
const HOLO = new V3(0, 0.128, -0.08);
// magnum iron sights: front post and rear notch tops share y = PIS.y
const PIS = new V3(0, 0.0585, -0.135);
/* the support hand through a reload (RELOAD_T in characters/rig.js): out, pouch, in, a palm slap,
   then the charging handle (carbine) or the slide (magnum) pulled back and let go */
const VM_RELOAD = [
  [0, "F"],
  [RELOAD_T.grab, [0, -0.2, -0.12]],
  [RELOAD_T.out, [0, -0.44, -0.08]],
  [RELOAD_T.pouch, [-0.08, -0.62, 0.12]],
  [RELOAD_T.well, [0, -0.4, -0.12]],
  [RELOAD_T.seat, [0, -0.22, -0.12]],
  [RELOAD_T.slap, [0, -0.16, -0.12]],
  [RELOAD_T.reach, [-0.04, 0.07, 0.0]],
  [RELOAD_T.back, [-0.04, 0.075, 0.1]],
  [RELOAD_T.release, [-0.06, 0.06, 0.02]],
  [1, "F"],
];
/* (the magnum's is quicker to the eye: the magazine stripped and flung, a fresh one driven home
   with the heel of the hand) */
const PIS_RELOAD = [
  [0, "F"],
  [RELOAD_T.grab, [-0.01, -0.13, 0.05]],
  [RELOAD_T.out, [-0.07, -0.42, 0.1]],
  [RELOAD_T.pouch, [-0.06, -0.52, 0.12]],
  [RELOAD_T.well, [0, -0.27, 0.06]],
  [RELOAD_T.seat, [0, -0.14, 0.05]],
  [RELOAD_T.slap, [0, -0.075, 0.05]],
  [RELOAD_T.reach, [0, 0.06, 0.02]],
  [RELOAD_T.back, [0, 0.065, 0.1]],
  [RELOAD_T.release, [-0.03, 0.05, 0.03]],
  [1, "F"],
];
const RIFLE_P = {
  hip: { p: new V3(0.2, -0.2, -0.38), r: [0, 0, 0] },
  aim: { p: new V3(-HOLO.x, -HOLO.y, -0.24), r: [0, 0, 0] },
  sprint: { p: new V3(0.15, -0.3, -0.34), r: [-0.35, 0.55, 0.35] },
  reload: { p: new V3(0.13, -0.22, -0.36), r: [0.18, 0.1, 0.55] },
  low: { p: new V3(0.18, -0.42, -0.3), r: [-0.6, 0.3, 0.3] },
};
/* lab rifles share the carbine's poses but for ADS, which lines up their own sight */
const labP = (y, z) => ({ ...RIFLE_P, aim: { p: new V3(0, -y, z), r: [0, 0, 0] } });
/* per weapon (WEAPON_DATA order): hand points, reload path, poses, light colour */
const VMW = [
  {
    grip: new V3(0, -0.1, 0.08),
    fore: new V3(0, -0.07, -0.24),
    keys: VM_RELOAD,
    P: RIFLE_P,
    glow: 0x5ad2ff,
  },
  {
    grip: new V3(0, -0.072, 0.048),
    fore: new V3(-0.026, -0.085, 0.034),
    /* a combat grip: both hands, punched out on the centerline; ADS at near full extension; a
       sharp muzzle snap on each shot; the melee is a pistol-whip */
    flip: 2.4,
    whip: true,
    slot: new V3(0, -0.09, 0.05),
    keys: PIS_RELOAD,
    P: {
      hip: { p: new V3(0.1, -0.16, -0.44), r: [0.03, 0.05, 0] },
      /* the slide sits just under the reticle, so the smart-link reticle (the aim point) stays clear */
      aim: { p: new V3(-PIS.x, -PIS.y - 0.034, -0.39), r: [0, 0, 0] },
      sprint: { p: new V3(0.13, -0.28, -0.3), r: [-0.7, 0.2, 0.15] },
      reload: { p: new V3(0.1, -0.18, -0.32), r: [0.35, 0.15, 0.5] },
      low: { p: new V3(0.15, -0.36, -0.28), r: [-0.8, 0.2, 0.2] },
    },
    glow: 0x8cffb0,
  },
  {
    grip: new V3(0, -0.1, 0.12),
    fore: new V3(0, -0.07, -0.3),
    keys: VM_RELOAD,
    P: {
      ...RIFLE_P,
      hip: { p: new V3(0.2, -0.21, -0.36), r: [0, 0, 0] },
      aim: { p: new V3(0.06, -0.24, -0.2), r: [0, 0, 0] },
      sprint: { p: new V3(0.15, -0.3, -0.32), r: [-0.35, 0.55, 0.35] },
    },
    glow: 0x4a9bff,
  },
  {
    grip: new V3(0, -0.21, 0.04),
    fore: new V3(0, -0.2, -0.3),
    keys: VM_RELOAD,
    P: {
      hip: { p: new V3(0.2, -0.13, -0.3), r: [0, 0, 0] },
      aim: { p: new V3(0.1, -0.12, -0.26), r: [0, 0, 0] },
      sprint: { p: new V3(0.16, -0.24, -0.3), r: [-0.3, 0.4, 0.25] },
      reload: { p: new V3(0.16, -0.2, -0.32), r: [0.25, 0.1, 0.4] },
      low: { p: new V3(0.18, -0.36, -0.3), r: [-0.5, 0.3, 0.3] },
    },
    glow: 0xff7a3a,
  },
  /* ---- lab weapons: burst rifle (a bullpup, so its reload is further back), scattergun, arc beam ---- */
  {
    grip: new V3(0, -0.1, -0.02),
    fore: new V3(0, -0.07, -0.28),
    keys: VM_RELOAD.map(([t, p]) => [t, p === "F" ? p : [p[0], p[1], p[2] + 0.22]]),
    P: labP(0.1, -0.24),
    glow: 0x52e0ff,
  },
  {
    grip: new V3(0, -0.1, 0.06),
    fore: new V3(0, -0.08, -0.37),
    keys: VM_RELOAD,
    P: labP(0.085, -0.3),
    glow: 0xffb347,
  },
  {
    grip: new V3(0, -0.1, 0.08),
    fore: new V3(0, -0.07, -0.26),
    keys: VM_RELOAD,
    P: labP(0.095, -0.24),
    glow: 0xb48cff,
  },
].map((o, i) => Object.assign(vmModel(i), o));
vmHolo(VMW[0].g, HOLO.y, HOLO.z, 0.062, 0.046);
dot(VMW[1].g, 0x8cffb0, 0.0035, 0, PIS.y - 0.002, PIS.z + 0.001);
vmHolo(VMW[4].g, 0.1, -0.12, 0.052, 0.04);
vmHolo(VMW[6].g, 0.095, -0.06, 0.052, 0.04);
/* gloved hand: palm on the grip, fingers wrapped around its front, armored back plate, suit sleeve with a
   gauntlet over it; merged per material like the weapons */
function vmHand(side) {
  const g = new THREE.Group();
  vmBox(g, 0.03, 0.085, 0.095, vmGlove, side * 0.03, -0.012, 0.005);
  for (let i = 0; i < 4; i++) {
    const f = vmBox(g, 0.058, 0.017, 0.024, vmGlove, side * 0.004, 0.018 - i * 0.021, -0.044);
    f.rotation.y = side * 0.12;
  }
  const th = vmBox(g, 0.02, 0.02, 0.06, vmGlove, -side * 0.022, 0.032, -0.018);
  th.rotation.set(0, side * 0.35, 0);
  vmBox(g, 0.012, 0.062, 0.07, vmArmor, side * 0.05, -0.006, 0.008);
  vmBox(g, 0.004, 0.04, 0.006, vmAcc, side * 0.057, -0.006, -0.022);
  const sl = new THREE.Mesh(capsule(0.043, 0.42), vmSuit);
  sl.position.set(side * 0.05, -0.12, 0.18);
  sl.rotation.set(-1.0, 0, side * 0.3);
  g.add(sl);
  const gt = new THREE.Mesh(capsule(0.052, 0.2), vmArmor);
  gt.position.set(side * 0.045, -0.075, 0.105);
  gt.rotation.set(-1.0, 0, side * 0.3);
  g.add(gt);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 14), vmPlate);
  ring.position.set(side * 0.04, -0.05, 0.06);
  ring.rotation.x = -1.0;
  g.add(ring);
  const by = new Map();
  for (const o of g.children) {
    o.updateMatrix();
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(o);
  }
  for (const [m, list] of by) {
    if (list.length < 2) continue;
    for (const o of list) g.remove(o);
    g.add(new THREE.Mesh(mergeGeos(list.map(o => [o.geometry, o.matrix])), m));
  }
  vmRoot.add(g);
  return g;
}
const vmR = vmHand(1),
  vmL = vmHand(-1);
/* the muzzle light rides on the camera, not the viewmodel: hiding the viewmodel (menu, death, scope)
   would change the scene's light count, and every lit shader would recompile; it follows the flash
   sprite each frame (game/loop.js) */
const flash = new THREE.PointLight(0xffb347, 0, 6);
flash.position.set(0.2, -0.2, -0.9);
camera.add(flash);
const flashSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    color: 0xffd28a,
    transparent: true,
    opacity: 0,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
);
flashSprite.scale.set(0.14, 0.14, 0.14);
flashSprite.position.set(0, 0.01, -0.62);
VMW[0].g.add(flashSprite);
const vmS = {
  lh: new V3(),
  lastR: -1,
  swayY: 0,
  swayP: 0,
  lastYaw: 0,
  lastPitch: 0,
  kick: 0,
  throwT: 0,
  inX: spr(),
  inY: spr(),
  inZ: spr(),
  lvx: 0,
  lvy: 0,
  lfw: 0,
  air: false,
};
/* the held weapon's lights and counter: a flare on each shot; red, blinking, at a quarter of a
   magazine or less; the counter redraws only when what it shows changes */
let vmCtrK = "";
function vmLights() {
  const w = W(),
    rl = reloadT > 0,
    low = !rl && mag <= Math.max(1, Math.floor(w.mag / 4)),
    c = low ? 0xff3a1e : VMW[wi].glow;
  vmGlow.emissive.setHex(c);
  vmGlow.emissiveIntensity = 1.2 + vmS.kick * 3 + (low && now % 0.5 < 0.25 ? 1.2 : 0);
  const k = (rl ? "--" : String(mag).padStart(2, "0")) + c;
  if (k === vmCtrK) return;
  vmCtrK = k;
  const x = vmCtrC.getContext("2d"),
    hex = "#" + c.toString(16).padStart(6, "0");
  x.fillStyle = "#04090c";
  x.fillRect(0, 0, 64, 32);
  x.fillStyle = hex;
  x.font = "700 24px Chakra Petch, monospace";
  x.textAlign = "center";
  x.fillText(k.slice(0, 2), 32, 23);
  x.fillRect(4, 27, rl ? 0 : (56 * mag) / w.mag, 2);
  vmCtrT.needsUpdate = true;
}
onFrame(vmLights);
/* carrying the flag in first person: the weapon goes away and the flag pole sits across your hands */
const vmFlag = new THREE.Group();
vmRoot.add(vmFlag);
vmFlag.visible = false;
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 10), vmPlate);
  pole.position.set(0, 0.45, 0);
  vmFlag.add(pole);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), vmAcc);
  tip.position.set(0, 1.25, 0);
  vmFlag.add(tip);
  vmFlag.position.set(0.16, -0.32, -0.42);
  vmFlag.rotation.set(-0.35, 0, -0.55);
}
let vmFlagOn = false;
function vmCarry(on) {
  if (on === vmFlagOn) return;
  vmFlagOn = on;
  vmFlag.visible = on;
  if (on) VMW.forEach(v => (v.g.visible = false));
  else showVM();
}
