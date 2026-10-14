/* ============ SPAWN SAFETY ============
   Every spawn (drop pods and classic, arena and CTF, players and AI) scores the map's spawn points
   against the enemies in play and takes the safest: out of enemy sight lines (worse when they are
   looking that way), away from enemies, and away from where fighting just happened. A little
   randomness keeps equally safe spots from being predictable. Pure simulation (no rendering), so
   the CTF rules use it in the worker and headless too. */
const SPAWN_W = {
  /** an enemy with a clear line to the spot, looking toward it / looking away */
  seen: 60,
  seenAway: 25,
  /** enemies closer than `near` metres cost `nearW` per metre inside it */
  near: 30,
  nearW: 1.5,
  /** fights in the last `fightAge` seconds closer than `fight` metres cost `fightW` per metre (fading) */
  fight: 18,
  fightAge: 10,
  fightW: 1.2,
  /** random spread among equally safe spots */
  jitter: 4,
  /** half-angle (radians) of an enemy's view: inside it they'd see you appear */
  view: 1.2,
  /** a spot with a pilot (or a pod on its way down) closer than this is taken */
  clear: 2.5,
};
const _spE = new V3(),
  _spD = new V3();
/**
 * how safe a spawn point is: 0 is perfectly safe, lower is worse
 * @param {number[]} s spawn point [x, y, z]
 * @param {{ pos: any, h?: number, yaw?: number }[]} foes enemies in play (feet position, height, facing)
 * @param {{ pos: any, t: number }[]} fights recent fights (where and when)
 * @param {number} t the current time on the fights' clock
 */
function spawnScore(s, foes, fights, t) {
  let v = 0;
  for (const f of foes) {
    const p = f.pos,
      dx = s[0] - p.x,
      dz = s[2] - p.z,
      d = Math.hypot(dx, dz);
    if (d < SPAWN_W.near) v -= (SPAWN_W.near - d) * SPAWN_W.nearW;
    /* line of sight from their eyes to your chest */
    _spE.set(p.x, p.y + (f.h || H_STAND) - 0.2, p.z);
    _spD.set(s[0], s[1] + 1.2, s[2]).sub(_spE);
    const L = _spD.length();
    if (L < 1e-3) {
      v -= SPAWN_W.seen;
      continue;
    }
    _spD.multiplyScalar(1 / L);
    if (rayWorld(_spE, _spD, L) < L - 0.3) continue;
    let facing = true;
    if (f.yaw != null) {
      const a = Math.atan2(-dx, -dz) - f.yaw;
      facing = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < SPAWN_W.view;
    }
    v -= facing ? SPAWN_W.seen : SPAWN_W.seenAway;
  }
  for (const g of fights) {
    const age = t - g.t;
    if (age < 0 || age > SPAWN_W.fightAge) continue;
    const d = Math.hypot(s[0] - g.pos.x, s[2] - g.pos.z);
    if (d < SPAWN_W.fight) v -= (SPAWN_W.fight - d) * (1 - age / SPAWN_W.fightAge) * SPAWN_W.fightW;
  }
  return v;
}
/**
 * the safest of `points` (see spawnScore); rand01 is the jitter's random source (seeded in CTF)
 * @param {number[][]} points
 * @param {{ pos: any, h?: number, yaw?: number }[]} foes
 * @param {{ pos: any, t: number }[]} fights
 * @param {number} t
 * @param {() => number} rand01
 * @param {{ x: number, y: number, z: number }[]} [taken] where pilots stand and pods are coming down:
 *   spots within SPAWN_W.clear of one are passed over while any other is free
 */
function pickSpawn(points, foes, fights, t, rand01, taken) {
  let best = null,
    bv = -Infinity,
    any = points[0],
    av = -Infinity;
  for (const s of points) {
    const v = spawnScore(s, foes, fights, t) + rand01() * SPAWN_W.jitter;
    if (v > av) {
      av = v;
      any = s;
    }
    if (taken && spotTaken(s[0], s[1], s[2], taken)) continue;
    if (v > bv) {
      bv = v;
      best = s;
    }
  }
  return best || any;
}
/** is there a pilot or an incoming pod within SPAWN_W.clear of (x, y, z)? */
function spotTaken(x, y, z, taken) {
  for (const p of taken)
    if (Math.abs(p.y - y) < 3 && Math.hypot(p.x - x, p.z - z) < SPAWN_W.clear) return true;
  return false;
}
/** remember a fight (a hit or a kill) for spawn scoring; keeps the last 32 */
function noteFight(list, pos, t) {
  list.push({ pos: pos.clone(), t });
  if (list.length > 32) list.shift();
}
