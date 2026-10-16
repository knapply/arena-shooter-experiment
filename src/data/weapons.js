/* ============ WEAPON DATA ============
   Every number that decides a fight lives here, shared by players, AI and the docs.
   Arena rules: shields absorb everything, damage past a broken shield carries into health, and
   headshots only count once shields are down (except weapons with headAlways).
   docs/SANDBOX.md (kill-time table) is generated from this file by `node build.mjs`.

   precision: true  → no random spread at all (hip or aimed, moving or airborne); the shot goes
                      exactly where the reticle is. Recoil is a visual kick that returns to center
                      before the next shot at full fire rate, so the rhythm can be learned.
   recover          → how fast (per second, exponential) the recoil kick returns to center.
   reserve          → rounds carried besides the magazine. Nothing is endless: the starting guns carry
                      about what a pilot fires in a long life (the 95th percentile of rounds fired per
                      life in simulated matches, tools/tune.js lifeShots; docs/TUNING.md), so running
                      dry is rare but possible, and drops and ammo pickups matter. */
const PILOT_SHIELD = 70,
  PILOT_HEALTH = 45;
const WEAPON_DATA = [
  {
    key: "carbine",
    name: "VK-7 pulse carbine",
    /* the reference's burst rifle, measured from footage (docs/TUNING.md, "Five weapons from footage"):
       three precision rounds 0.035 s apart, a burst every 0.4 s while the trigger is held; 11 rounds
       take the shield and one headshot then kills (a four-burst kill, 1.27 s) */
    mag: 36,
    reserve: 108,
    rate: 0.4,
    burst: 3,
    burstGap: 0.035,
    auto: true,
    precision: true,
    body: 6.5,
    head: 45,
    reload: 1.4,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.0035,
    recover: 14,
    zoom: [2],
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
    reserve: 48,
    rate: 0.3,
    auto: false,
    precision: true,
    body: 20,
    head: 50,
    reload: 1.15,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.009,
    recover: 22,
    zoom: [1.5],
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
    rate: 0.78,
    auto: false,
    precision: true,
    body: 60,
    head: 999,
    headAlways: true,
    reload: 2.5,
    spread: 0,
    adsSpread: 0,
    bloom: 0,
    recoil: 0.07,
    recover: 12,
    zoom: [4.5, 10],
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
    reload: 4,
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
  {
    key: "scatter",
    name: "SG-12 scattergun",
    /* nine pellets in a cone, full damage to 7 m, falling to a quarter by 16 m: one shot kills up
       close, two at mid range, and the pump between shots is the opening */
    mag: 6,
    reserve: 12,
    rate: 0.8,
    auto: false,
    precision: false,
    pellets: 9,
    body: 14,
    head: 14,
    falloff: [7, 16, 0.25],
    range: 40,
    reload: 4.2,
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
];
/* seconds to bring the other gun up (players and AI) */
const SWITCH_TIME = 0.36;
/* the power weapons the centre spawn rotates through */
const POWER_ROTATION = ["sniper", "rocket", "scatter"];
/* ---- LABS: prototype map changes from docs/PROPOSALS.md, all off by default. The Labs settings turn
   them on for offline matches (online play always uses the shipped game: LABS.on is false there), and
   tools/tune.js turns them on for simulations.
     gates    blast gates rise and sink on both maps (world/gates.js)
     mods     map changes by name (MAP_MODS, data/maps.js) */
const LABS = {
  on: true,
  gates: false,
  mods: /** @type {string[]} */ ([]),
};
/** is a lab feature live right now? */
const labOn = k => LABS.on && !!LABS[k];
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
/* melee: a blow from behind kills outright; otherwise a blow takes up to MELEE.shield of the shield
   (nothing carries into health), and a blow on an unshielded pilot kills. From full shields that is
   three blows, or one blow to finish a pilot the guns have opened up. It took the whole shield until
   the skill-ladder pass: 40 gives new players about 0.16 s more once they're rushed and leaves the
   top of the ladder untouched (docs/TUNING.md, "The skill ladder"). The shoulder charge keeps its own
   numbers. */
const MELEE = {
  shield: 40,
  /* the reach of a blow in metres, and how far round a victim's back counts as behind: the cosine of
     the angle off their facing, so -0.35 is anything more than about 110 degrees off */
  range: 2.3,
  back: -0.35,
};
const MELEE_KILL = 999;
/** damage for a melee blow on a pilot with `shield` left; `behind` from meleeBehind */
function meleeDamage(shield, behind) {
  if (behind || shield <= 0) return MELEE_KILL;
  return Math.min(shield, MELEE.shield);
}
/** is the attacker (at ax, az) behind a victim at (vx, vz) facing `yaw`? (more than ~110° off their facing) */
function meleeBehind(ax, az, vx, vz, yaw) {
  const dx = ax - vx,
    dz = az - vz,
    L = Math.hypot(dx, dz) || 1;
  /* facing is (-sin yaw, -cos yaw) */
  return (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / L < MELEE.back;
}
