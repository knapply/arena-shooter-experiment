/* ============ WEAPON DATA ============
   Every number that decides a fight lives here, shared by players, AI and the docs.
   Arena rules: shields absorb everything, damage past a broken shield carries into health, and
   headshots only count once shields are down (except weapons with headAlways).
   docs/SANDBOX.md (kill-time table) is generated from this file by `node build.mjs`.

   precision: true  → no random spread at all (hip or aimed, moving or airborne); the shot goes
                      exactly where the reticle is. Recoil is a visual kick that returns to center
                      before the next shot at full fire rate, so the rhythm can be learned.
   recover          → how fast (per second, exponential) the recoil kick returns to center. */
const PILOT_SHIELD = 70,
  PILOT_HEALTH = 45;
const WEAPON_DATA = [
  {
    key: "carbine",
    name: "VK-7 pulse carbine",
    mag: 32,
    reserve: Infinity,
    rate: 0.1,
    auto: true,
    precision: false,
    body: 9,
    head: 11,
    reload: 1.8,
    spread: 0.012,
    adsSpread: 0.004,
    bloom: 0.004,
    recoil: 0.016,
    recover: 8,
    zoom: [1.4],
    muzzle: [0, 0.01, -0.6],
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
    precision: true,
    body: 20,
    head: 50,
    reload: 1.3,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.045,
    recover: 22,
    zoom: [1.8],
    muzzle: [0, 0.026, -0.16],
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
    precision: true,
    body: 60,
    head: 999,
    headAlways: true,
    reload: 2.4,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.07,
    recover: 12,
    zoom: [5, 10],
    muzzle: [0, 0.015, -0.95],
    dmg: "sniper",
    snd: "sshot",
    rum: [0.7, 0.6, 140],
    kick: 0.1,
    scope: "sniper",
    power: true,
  },
  {
    key: "rocket",
    name: "HX-2 rocket launcher",
    mag: 2,
    reserve: 4,
    rate: 0.9,
    auto: false,
    precision: true,
    /* a direct hit kills; the blast (splash at the centre, radius in metres) falls off with distance */
    body: 999,
    head: 999,
    splash: 150,
    radius: 4.2,
    speed: 32,
    projectile: true,
    reload: 3.2,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.11,
    recover: 6,
    zoom: [1.8],
    muzzle: [0, 0.0, -0.75],
    dmg: "rocket",
    snd: "rocket",
    rum: [0.9, 0.7, 220],
    kick: 0.16,
    scope: "smart",
    power: true,
  },
];
/* seconds to bring the other gun up (players and AI) */
const SWITCH_TIME = 0.36;
/* the power weapons the centre spawn rotates through */
const POWER_ROTATION = ["sniper", "rocket"];
/** shots and time to kill a full-shield pilot: best case (headshot once shields drop) and body shots only */
function killStats(w) {
  const run = heads => {
    let sh = PILOT_SHIELD,
      hp = PILOT_HEALTH,
      n = 0;
    while (hp > 0 && n < 99) {
      const head = heads && (w.headAlways || sh <= 0);
      let d = head ? w.head : w.body;
      n++;
      const s = Math.min(sh, d);
      sh -= s;
      d -= s;
      hp -= d;
    }
    return { shots: n, time: +((n - 1) * w.rate).toFixed(2) };
  };
  return { best: run(true), body: run(false) };
}
/* melee: a blow from behind kills outright; otherwise the first blow always takes the shield down
   (exactly what was left of it, nothing carries into health) and a blow on an unshielded pilot
   kills. The shoulder charge keeps its own numbers. */
const MELEE_KILL = 999;
/** damage for a melee blow on a pilot with `shield` left; `behind` from meleeBehind */
function meleeDamage(shield, behind) {
  return behind || shield <= 0 ? MELEE_KILL : shield;
}
/** is the attacker (at ax, az) behind a victim at (vx, vz) facing `yaw`? (more than ~110° off their facing) */
function meleeBehind(ax, az, vx, vz, yaw) {
  const dx = ax - vx,
    dz = az - vz,
    L = Math.hypot(dx, dz) || 1;
  /* facing is (-sin yaw, -cos yaw) */
  return (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / L < -0.35;
}
