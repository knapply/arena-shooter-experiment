/* weapons: Arena-style rules. Headshot damage only applies once shields are down, except the sniper. */
/* the numbers live in data/weapons.js; here they get engine types */
const WEAPONS = WEAPON_DATA.map(w =>
  Object.assign({}, w, { muzzle: new V3(w.muzzle[0], w.muzzle[1], w.muzzle[2]) })
);
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
  switchT = instant ? 0 : SWITCH_TIME;
  zoomLvl = 0;
  showVM();
  wpnHud();
  if (!instant) sfx("magin", 0.35);
}
function setWeapon(type, instant) {
  const i = slots.indexOf(type);
  if (i >= 0) setSlot(i, instant);
}
/* picking up a weapon replaces the one in hand (arena rules); a dropped weapon keeps the ammo it had */
function giveWeapon(type, am) {
  ammo[wi] = mag;
  slots[cur] = type;
  wi = type;
  ammo[type] = am ? Math.min(WEAPONS[type].mag, am[0]) : WEAPONS[type].mag;
  reserve[type] = am ? am[1] : WEAPONS[type].reserve;
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
  reloadT = 0;
  zoomLvl = 0;
  showVM();
  wpnHud();
  if (typeof nadeRefill === "function") nadeRefill();
}
