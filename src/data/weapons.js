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
  /* ---- lab weapons (docs/PROPOSALS.md): only on the maps' lab pickups and in the power rotation
     while their LABS flag is on ---- */
  {
    key: "burst",
    lab: "burst",
    name: "MR-3 burst rifle",
    /* three-round bursts: each round goes where the reticle is at that instant, so tracking through
       the burst is the skill. Four bursts kill (the last two rounds to the head once shields drop) */
    mag: 36,
    reserve: Infinity,
    rate: 0.36,
    burst: 3,
    burstGap: 0.06,
    auto: true,
    precision: true,
    body: 8,
    head: 22,
    reload: 2.0,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.022,
    recover: 14,
    zoom: [2],
    muzzle: [0, 0.012, -0.66],
    dmg: "burst",
    snd: "bshot",
    rum: [0.12, 0.22, 45],
    kick: 0.035,
    scope: "holo",
  },
  {
    key: "scatter",
    lab: "scatter",
    name: "SG-12 scattergun",
    /* nine pellets in a cone, full damage to 5 m, falling to a quarter by 16 m: one shot kills up
       close, two at mid range, and the pump between shots is the opening */
    mag: 6,
    reserve: 12,
    rate: 0.8,
    auto: false,
    precision: false,
    pellets: 9,
    body: 14,
    head: 14,
    falloff: [5, 16, 0.25],
    range: 40,
    reload: 2.6,
    spread: 0.05,
    adsSpread: 0.042,
    bloom: 0,
    recoil: 0.12,
    recover: 7,
    zoom: [1.25],
    muzzle: [0, 0.02, -0.72],
    dmg: "scatter",
    snd: "sgshot",
    rum: [0.85, 0.55, 160],
    kick: 0.14,
    scope: "smart",
    power: true,
  },
  {
    key: "beam",
    lab: "beam",
    name: "AR-1 arc beam",
    /* a continuous beam: no spread and no headshots, damage only while it stays on target, so
       tracking a strafing pilot is the whole skill. The cell vents (reloads) after 2.5 s of beam */
    mag: 50,
    reserve: Infinity,
    rate: 0.05,
    auto: true,
    precision: true,
    body: 4,
    head: 4,
    falloff: [22, 40, 0.4],
    range: 50,
    reload: 1.6,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.002,
    recover: 100,
    zoom: [1.5],
    muzzle: [0, 0.01, -0.58],
    dmg: "beam",
    snd: "beam",
    rum: [0.05, 0.12, 30],
    kick: 0.004,
    scope: "holo",
  },
];
/* seconds to bring the other gun up (players and AI) */
const SWITCH_TIME = 0.36;
/* the power weapons the centre spawn rotates through */
const POWER_ROTATION = ["sniper", "rocket"];
/* ---- LABS: prototype content from docs/PROPOSALS.md, all off by default. The Labs settings turn
   it on for offline matches (online play always uses the shipped game: LABS.on is false there), and
   tools/tune.js turns it on for simulations.
     burst    burst rifle pickups on the maps        scatter  the scattergun joins the power rotation
     beam     arc beam pickups on the maps           pulse    pulse grenades (strip shields, jam thrust)
     melee    a melee blow takes at most 40 shield (meleeDamage)
     gates    blast gates rise and sink on both maps (world/gates.js)
     mods     map changes by name (MAP_MODS, data/maps.js) */
const LABS = {
  on: true,
  burst: false,
  scatter: false,
  beam: false,
  pulse: false,
  melee: false,
  gates: false,
  mods: /** @type {string[]} */ ([]),
};
/** is a lab feature live right now? */
const labOn = k => LABS.on && !!LABS[k];
/** the power rotation, with any live lab power weapons added */
function powerRotation() {
  return POWER_ROTATION.concat(WEAPON_DATA.filter(w => w.power && w.lab && labOn(w.lab)).map(w => w.key));
}
/** damage share at range d for a weapon with falloff [full to, lowest from, lowest share] */
function falloffAt(w, d) {
  const f = w.falloff;
  if (!f || d <= f[0]) return 1;
  return d >= f[1] ? f[2] : 1 - ((d - f[0]) / (f[1] - f[0])) * (1 - f[2]);
}
/** shots and time to kill a full-shield pilot: best case (headshot once shields drop) and body shots only */
function killStats(w) {
  const run = heads => {
    let sh = PILOT_SHIELD,
      hp = PILOT_HEALTH,
      n = 0;
    while (hp > 0 && n < 99) {
      const head = heads && (w.headAlways || sh <= 0);
      let d = (head ? w.head : w.body) * (w.pellets || 1);
      n++;
      const s = Math.min(sh, d);
      sh -= s;
      d -= s;
      hp -= d;
    }
    /* a burst weapon: whole bursts at its rate, the rounds inside a burst at its gap */
    const b = w.burst || 1,
      t = Math.floor((n - 1) / b) * w.rate + ((n - 1) % b) * (w.burstGap || 0);
    return { shots: n, time: +t.toFixed(2) };
  };
  return { best: run(true), body: run(false) };
}
/* melee: a blow from behind kills outright; otherwise the first blow always takes the shield down
   (exactly what was left of it, nothing carries into health) and a blow on an unshielded pilot
   kills. The shoulder charge keeps its own numbers. */
const MELEE_KILL = 999;
/** damage for a melee blow on a pilot with `shield` left; `behind` from meleeBehind */
function meleeDamage(shield, behind) {
  if (behind || shield <= 0) return MELEE_KILL;
  /* lab (LABS.melee): a blow takes at most MELEE_LAB_SHIELD of the shield, so melee finishes fights
     the guns start instead of winning them on its own */
  return labOn("melee") ? Math.min(shield, MELEE_LAB_SHIELD) : shield;
}
const MELEE_LAB_SHIELD = 40;
/** is the attacker (at ax, az) behind a victim at (vx, vz) facing `yaw`? (more than ~110° off their facing) */
function meleeBehind(ax, az, vx, vz, yaw) {
  const dx = ax - vx,
    dz = az - vz,
    L = Math.hypot(dx, dz) || 1;
  /* facing is (-sin yaw, -cos yaw) */
  return (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / L < -0.35;
}
