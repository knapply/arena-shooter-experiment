/* Scenario runner: script a situation (pilots, positions, inputs per tick) and run it headlessly
   against the real movement, collision and hit code in a few milliseconds.

     const { scenario } = require("../lib/scenario.js");
     const r = scenario({
       map: "arena",                                   // or "ctf"
       pilots: { a: { pos: [0, 0, 20], yaw: 0 } },     // Body fields to set (pos, yaw, pitch, shield, ...)
       seconds: 1.5,
       input: (t, P) => ({ a: { f: 1, sprint: true } }), // held inputs per pilot; *P presses are one-tick
       every: (t, P, r) => {},                          // optional probe each tick
     });
     r.P.a.pos, r.events (body callbacks: land, slam, ...), r.trace.a ([t, x, y, z] at 30 Hz)
   Helpers: shoot(from, to, targets) for hitscan through world geometry, dist2d, seed(n). */
const CTF = require("./headless.js");
const K = window.KA;
const NO = {
  f: 0,
  s: 0,
  sprint: false,
  thrust: false,
  crouch: false,
  crouchP: false,
  jumpP: false,
  aim: false,
  meleeP: false,
};
const HZ = 120;
let map = "arena";
function useMap(m) {
  if (m === map) return;
  if (m === "ctf") CTF.enterMap();
  else CTF.exitMap();
  map = m;
}
function scenario(o) {
  useMap(o.map || "arena");
  K.resetDestruction();
  if (o.seed != null) K.RNG.seed(o.seed);
  const P = {};
  for (const [id, cfg] of Object.entries(o.pilots || {})) {
    const b = new K.Body();
    b.reset();
    const { pos, vel, ...rest } = cfg;
    if (pos) b.pos.set(pos[0], pos[1], pos[2]);
    if (vel) b.vel.set(vel[0], vel[1], vel[2]);
    Object.assign(b, rest);
    /* settle onto the floor unless placed in the air on purpose */
    if (!cfg.air) {
      b.pos.y = Math.max(b.pos.y, K.groundBelow(b.pos.x, b.pos.z, b.pos.y + 0.5));
      b.ground = true;
    }
    P[id] = b;
  }
  const events = [],
    trace = {};
  for (const id in P) trace[id] = [];
  const steps = Math.round((o.seconds || 1) * HZ);
  let t = 0;
  for (let n = 0; n < steps; n++) {
    const inp = o.input ? o.input(t, P) || {} : {};
    for (const id in P) {
      const b = P[id];
      if (b.dead) continue;
      b.step(1 / HZ, Object.assign({}, NO, inp[id] || {}), (type, d) => events.push({ t, id, type, d }));
    }
    t += 1 / HZ;
    if (o.every) o.every(t, P);
    if (n % 4 === 0)
      for (const id in P) trace[id].push([+t.toFixed(4), P[id].pos.x, P[id].pos.y, P[id].pos.z]);
  }
  return { P, events, trace, t };
}
/** hitscan from a point to a point: what it hits first ({id, head} for a pilot, "world", or null) */
function shoot(from, to, targets) {
  const o = new K.THREE.Vector3(from[0], from[1], from[2]);
  const d = new K.THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const max = d.length();
  d.normalize();
  const wall = K.rayWorld(o, d, max + 50);
  let best = null;
  for (const [id, b] of Object.entries(targets || {})) {
    if (b.dead) continue;
    const r = K.rayTarget(o, d, b.pos, b.h, max + 50);
    if (r && (!best || r.t < best.t)) best = { id, head: r.head, t: r.t };
  }
  if (best && best.t < wall) return best;
  return wall < max + 50 ? "world" : null;
}
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
module.exports = { scenario, shoot, dist2d, K, CTF, HZ };
