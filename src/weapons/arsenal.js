/* weapons: Arena-style rules. Headshot damage only applies once shields are down, except the sniper. */
const WEAPONS = [
  {
    key: "carbine",
    name: "VK-7 pulse carbine",
    mag: 32,
    reserve: Infinity,
    rate: 0.1,
    auto: true,
    body: 9,
    head: 11,
    reload: 1.8,
    spread: 0.012,
    adsSpread: 0.004,
    bloom: 0.004,
    recoil: 0.016,
    zoom: [1.4],
    muzzle: new V3(0, 0.01, -0.6),
    dmg: "rifle",
    snd: "shot",
    rum: [0.08, 0.18, 35],
    kick: 0.03,
    scope: "holo",
  },
  {
    key: "pistol",
    name: "M9 magnum",
    mag: 12,
    reserve: Infinity,
    rate: 0.26,
    auto: false,
    body: 20,
    head: 50,
    reload: 1.3,
    spread: 0.008,
    adsSpread: 0.0008,
    bloom: 0.012,
    recoil: 0.045,
    zoom: [1.8],
    muzzle: new V3(0, 0.026, -0.16),
    dmg: "pistol",
    snd: "pshot",
    rum: [0.25, 0.35, 70],
    kick: 0.06,
    scope: "smart",
  },
  {
    key: "sniper",
    name: "SRS-9 sniper rifle",
    mag: 4,
    reserve: 8,
    rate: 0.62,
    auto: false,
    body: 60,
    head: 999,
    headAlways: true,
    reload: 2.4,
    spread: 0.035,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.07,
    zoom: [5, 10],
    muzzle: new V3(0, 0.015, -0.95),
    dmg: "sniper",
    snd: "sshot",
    rum: [0.7, 0.6, 140],
    kick: 0.1,
    scope: "sniper",
    power: true,
  },
];
const slots = [1, 0];
let cur = 0,
  wi = 1,
  switchT = 0,
  semiLatch = false,
  zoomLvl = 0,
  descoped = false,
  flinch = 0;
const ammo = WEAPONS.map(w => w.mag),
  reserve = WEAPONS.map(w => w.reserve);
const W = () => WEAPONS[wi];
const zoomK = () => {
  const z = W().zoom;
  return zoomLvl > 0 ? z[Math.min(zoomLvl, z.length) - 1] : 1;
};
function showVM() {
  VMW.forEach((v, i) => (v.g.visible = i === wi));
  const V = VMW[wi];
  if (flash.parent) flash.parent.remove(flash);
  V.g.add(flash);
  flash.position.copy(W().muzzle);
  if (flashSprite.parent) flashSprite.parent.remove(flashSprite);
  V.g.add(flashSprite);
  flashSprite.position.copy(W().muzzle);
}
function wpnHud() {
  const wn = $("wname");
  if (wn) wn.textContent = W().name;
}
function setSlot(i, instant) {
  if (i === cur && !instant) return;
  ammo[wi] = mag;
  cur = i;
  wi = slots[cur];
  mag = ammo[wi];
  reloadT = 0;
  prevReload = 0;
  switchT = instant ? 0 : 0.36;
  zoomLvl = 0;
  showVM();
  wpnHud();
  if (!instant) sfx("magin", 0.35);
}
function setWeapon(type, instant) {
  const i = slots.indexOf(type);
  if (i >= 0) setSlot(i, instant);
}
/* picking up a weapon replaces the one in hand (arena rules) */
function giveWeapon(type) {
  ammo[wi] = mag;
  slots[cur] = type;
  wi = type;
  ammo[type] = WEAPONS[type].mag;
  reserve[type] = WEAPONS[type].reserve;
  mag = ammo[type];
  reloadT = 0;
  switchT = 0.4;
  zoomLvl = 0;
  showVM();
  wpnHud();
  sfx("magin", 0.8);
  toast(WEAPONS[type].name);
}
function refill() {
  slots[0] = 1;
  slots[1] = 0;
  for (let i = 0; i < WEAPONS.length; i++) {
    ammo[i] = WEAPONS[i].mag;
    reserve[i] = WEAPONS[i].reserve;
  }
  cur = 0;
  wi = 1;
  mag = ammo[wi];
  zoomLvl = 0;
  showVM();
  wpnHud();
  if (typeof nadeRefill === "function") nadeRefill();
}
