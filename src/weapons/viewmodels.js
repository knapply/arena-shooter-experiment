/* ============ first-person viewmodels: carbine with holo sight, sidearm with iron sights ============ */
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
const vmGlass = new THREE.MeshBasicMaterial({
  color: 0x7fd4ff,
  transparent: true,
  opacity: 0.07,
  depthWrite: false,
  side: THREE.DoubleSide,
});
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
// carbine
const vmGun = new THREE.Group();
vmRoot.add(vmGun);
vmBox(vmGun, 0.08, 0.11, 0.58, vmDark, 0, 0, -0.1);
vmBox(vmGun, 0.06, 0.03, 0.36, vmAcc, 0, 0.065, -0.1);
vmBox(vmGun, 0.05, 0.09, 0.16, vmDark, 0, -0.01, 0.25);
{
  const g = vmBox(vmGun, 0.05, 0.12, 0.06, vmDark, 0, -0.1, 0.08);
  g.rotation.x = 0.25;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), vmDark);
  b.rotation.x = Math.PI / 2;
  b.position.set(0, 0.01, -0.47);
  vmGun.add(b);
}
const vmMag = vmBox(vmGun, 0.05, 0.15, 0.075, vmSuit, 0, -0.13, -0.12);
// holo sight: the red dot sits exactly on the sight line, so ADS centers it on screen where rounds go
const HOLO = new V3(0, 0.128, -0.08);
vmBox(vmGun, 0.07, 0.012, 0.07, vmDark, 0, 0.086, -0.08);
vmBox(vmGun, 0.008, 0.05, 0.012, vmDark, -0.035, 0.115, -0.08);
vmBox(vmGun, 0.008, 0.05, 0.012, vmDark, 0.035, 0.115, -0.08);
vmBox(vmGun, 0.078, 0.008, 0.012, vmDark, 0, 0.144, -0.08);
{
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.046), vmGlass);
  gl.position.copy(HOLO);
  vmGun.add(gl);
}
dot(vmGun, 0xff3b30, 0.0042, HOLO.x, HOLO.y, HOLO.z);
// sidearm
const vmPis = new THREE.Group();
vmRoot.add(vmPis);
vmPis.visible = false;
vmBox(vmPis, 0.04, 0.04, 0.21, vmDark, 0, 0.027, -0.04);
vmBox(vmPis, 0.03, 0.008, 0.17, vmPlate, 0, 0.05, -0.045); /* slide + top rib */
for (let i = 0; i < 5; i++)
  vmBox(vmPis, 0.042, 0.03, 0.004, vmPlate, 0, 0.027, 0.035 + i * 0.01); /* rear serrations */
vmBox(vmPis, 0.006, 0.016, 0.035, vmPlate, 0.021, 0.035, -0.05); /* ejection port */
vmBox(vmPis, 0.036, 0.028, 0.17, vmPlate, 0, -0.006, -0.035);
vmBox(vmPis, 0.03, 0.004, 0.15, vmAcc, 0, -0.021, -0.04); /* frame + accent line */
{
  vmBox(vmPis, 0.008, 0.03, 0.05, vmPlate, 0, -0.035, 0); /* trigger guard */
  const tr = vmBox(vmPis, 0.006, 0.018, 0.006, vmDark, 0, -0.03, 0.004);
  tr.rotation.x = 0.3;
  const br = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 10), vmPlate);
  br.rotation.x = Math.PI / 2;
  br.position.set(0, 0.028, -0.152);
  vmPis.add(br);
}
{
  const g = vmBox(vmPis, 0.036, 0.11, 0.052, vmSuit, 0, -0.07, 0.045);
  g.rotation.x = 0.22;
}
const vmPisMag = vmBox(vmPis, 0.026, 0.08, 0.034, vmDark, 0, -0.09, 0.05);
// iron sights: front post and rear notch tops share y = PIS.y
const PIS = new V3(0, 0.0585, -0.135);
vmBox(vmPis, 0.006, 0.012, 0.008, vmDark, 0, 0.0525, -0.135);
vmBox(vmPis, 0.009, 0.012, 0.01, vmDark, -0.011, 0.0525, 0.05);
vmBox(vmPis, 0.009, 0.012, 0.01, vmDark, 0.011, 0.0525, 0.05);
dot(vmPis, 0x8cffb0, 0.0035, 0, PIS.y - 0.002, PIS.z + 0.001);
const VM_RELOAD = [
  [0, "F"],
  [0.12, [0, -0.2, -0.12]],
  [0.3, [0, -0.44, -0.08]],
  [0.45, [-0.08, -0.62, 0.12]],
  [0.62, [0, -0.4, -0.12]],
  [0.78, [0, -0.2, -0.12]],
  [0.88, [0.07, 0.07, -0.02]],
  [1, "F"],
];
const PIS_RELOAD = [
  [0, "F"],
  [0.15, [0, -0.15, 0.05]],
  [0.32, [-0.02, -0.36, 0.08]],
  [0.5, [-0.05, -0.5, 0.12]],
  [0.68, [0, -0.3, 0.06]],
  [0.82, [0, -0.14, 0.05]],
  [0.9, [0, 0.06, -0.03]],
  [1, "F"],
];
const VMW = [
  {
    g: vmGun,
    mag: vmMag,
    grip: new V3(0, -0.1, 0.08),
    fore: new V3(0, -0.07, -0.24),
    slot: new V3(0, -0.13, -0.12),
    keys: VM_RELOAD,
    P: {
      hip: { p: new V3(0.2, -0.2, -0.38), r: [0, 0, 0] },
      aim: { p: new V3(-HOLO.x, -HOLO.y, -0.24), r: [0, 0, 0] },
      sprint: { p: new V3(0.15, -0.3, -0.34), r: [-0.35, 0.55, 0.35] },
      reload: { p: new V3(0.13, -0.22, -0.36), r: [0.18, 0.1, 0.55] },
      low: { p: new V3(0.18, -0.42, -0.3), r: [-0.6, 0.3, 0.3] },
    },
  },
  {
    g: vmPis,
    mag: vmPisMag,
    grip: new V3(0, -0.072, 0.048),
    fore: new V3(-0.018, -0.09, 0.04),
    slot: new V3(0, -0.09, 0.05),
    keys: PIS_RELOAD,
    P: {
      hip: { p: new V3(0.18, -0.19, -0.37), r: [0, 0, 0] },
      /* the slide sits just under the reticle, so the smart-link reticle (the aim point) stays clear */
      aim: { p: new V3(-PIS.x, -PIS.y - 0.024, -0.27), r: [0, 0, 0] },
      sprint: { p: new V3(0.13, -0.28, -0.3), r: [-0.7, 0.2, 0.15] },
      reload: { p: new V3(0.1, -0.18, -0.32), r: [0.35, 0.15, 0.5] },
      low: { p: new V3(0.15, -0.36, -0.28), r: [-0.8, 0.2, 0.2] },
    },
  },
];
/* gloved hand: palm on the grip, fingers wrapped around its front, armored back plate, suit sleeve with a gauntlet over it */
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
  ring.rotation.set(-1.0 + (Math.PI / 2) * 0, 0, side * 0.3);
  ring.rotation.x = -1.0;
  g.add(ring);
  vmRoot.add(g);
  return g;
}
const vmR = vmHand(1),
  vmL = vmHand(-1);
const flash = new THREE.PointLight(0xffb347, 0, 6);
flash.position.set(0, 0.01, -0.7);
vmGun.add(flash);
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
vmGun.add(flashSprite);
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
// sniper rifle viewmodel
const vmSnp = new THREE.Group();
vmRoot.add(vmSnp);
vmSnp.visible = false;
vmBox(vmSnp, 0.075, 0.1, 0.62, vmDark, 0, 0, -0.12);
vmBox(vmSnp, 0.06, 0.12, 0.22, vmDark, 0, -0.01, 0.3);
vmBox(vmSnp, 0.05, 0.04, 0.4, vmAcc, 0, 0.06, -0.15);
{
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.55, 10), vmDark);
  b.rotation.x = Math.PI / 2;
  b.position.set(0, 0.015, -0.68);
  vmSnp.add(b);
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 14), vmDark);
  s.rotation.x = Math.PI / 2;
  s.position.set(0, 0.115, -0.08);
  vmSnp.add(s);
  const l = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 16),
    new THREE.MeshBasicMaterial({ color: 0x2a7fff })
  );
  l.position.set(0, 0.115, -0.231);
  l.rotation.y = Math.PI;
  vmSnp.add(l);
  const g = vmBox(vmSnp, 0.05, 0.12, 0.06, vmDark, 0, -0.1, 0.12);
  g.rotation.x = 0.25;
}
const vmSnpMag = vmBox(vmSnp, 0.05, 0.12, 0.07, vmSuit, 0, -0.11, -0.02);
VMW.push({
  g: vmSnp,
  mag: vmSnpMag,
  grip: new V3(0, -0.1, 0.12),
  fore: new V3(0, -0.07, -0.3),
  slot: new V3(0, -0.11, -0.02),
  keys: VM_RELOAD,
  P: {
    hip: { p: new V3(0.2, -0.21, -0.36), r: [0, 0, 0] },
    aim: { p: new V3(0.06, -0.24, -0.2), r: [0, 0, 0] },
    sprint: { p: new V3(0.15, -0.3, -0.32), r: [-0.35, 0.55, 0.35] },
    reload: { p: new V3(0.13, -0.22, -0.36), r: [0.18, 0.1, 0.55] },
    low: { p: new V3(0.18, -0.42, -0.3), r: [-0.6, 0.3, 0.3] },
  },
});
// rocket launcher viewmodel: a launch tube on the right shoulder with a side sight
const vmRkt = new THREE.Group();
vmRoot.add(vmRkt);
vmRkt.visible = false;
{
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 16), vmPlate);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0, -0.18);
  vmRkt.add(tube);
  for (const [z, r, m] of [
    [-0.66, 0.088, vmDark],
    [0.3, 0.095, vmDark],
    [-0.5, 0.079, vmAcc],
  ]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 16), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, z);
    vmRkt.add(ring);
  }
  vmBox(vmRkt, 0.05, 0.12, 0.06, vmDark, 0, -0.12, 0.05).rotation.x = 0.2;
  vmBox(vmRkt, 0.045, 0.1, 0.05, vmDark, 0, -0.11, -0.3);
  vmBox(vmRkt, 0.05, 0.07, 0.15, vmDark, -0.1, 0.05, -0.12);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.022, 14),
    new THREE.MeshBasicMaterial({ color: 0xff7a3a })
  );
  lens.position.set(-0.1, 0.055, -0.196);
  lens.rotation.y = Math.PI;
  vmRkt.add(lens);
}
const vmRktMag = vmBox(vmRkt, 0.06, 0.06, 0.12, vmAcc, 0, 0, 0.36);
VMW.push({
  g: vmRkt,
  mag: vmRktMag,
  grip: new V3(0, -0.12, 0.05),
  fore: new V3(0, -0.11, -0.3),
  slot: new V3(0, 0, 0.36),
  keys: VM_RELOAD,
  P: {
    hip: { p: new V3(0.2, -0.13, -0.3), r: [0, 0, 0] },
    aim: { p: new V3(0.1, -0.12, -0.26), r: [0, 0, 0] },
    sprint: { p: new V3(0.16, -0.24, -0.3), r: [-0.3, 0.4, 0.25] },
    reload: { p: new V3(0.16, -0.2, -0.32), r: [0.25, 0.1, 0.4] },
    low: { p: new V3(0.18, -0.36, -0.3), r: [-0.5, 0.3, 0.3] },
  },
});
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
