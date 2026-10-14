/* ============ GATES: blast walls that rise out of the floor and sink back on a fixed cycle ============
   A map document may list gates ({ id, leaves: [[x, z, width, depth], ...], h, phase, twin }). Each
   one is open (sunk flush with the floor), then rises (move), stays shut, then sinks (move). Its state
   is a pure function of the match clock: phase (0..1 of a cycle) staggers the gates so the shut one
   rotates round the map, and before its first cycle a gate is open. Every peer, headless simulation
   and replay that knows the match time therefore agrees on every gate without sending anything.
   Leaves are ordinary collision boxes (SOLID), so movement, bullets, grenades, rockets and AI sight
   all see them; they rise and sink in place (y0 and y1 move together). A rising gate never lifts or
   traps a pilot: anyone inside a leaf is moved out to the side they were on (gateShove, from Body.step).
   The AI's grid treats a gate as shut from GATE_CYCLE.lead seconds before it starts to rise until it
   is fully down again (gatesAt patches the cells, like destruction does), so bots route away early. */
const GATE_CYCLE = { open: 10, move: 2.5, shut: 8, warn: 1.5, lead: 2 };
const GATES = {
  /** every gate of every built map */
  all: /** @type {any[]} */ ([]),
  /** the gates of the world in play (gatesAt) */
  live: /** @type {any[]} */ ([]),
  /** gate clock of the last gatesAt, and whether gates were on */
  t: 0,
  on: false,
  /** bumped whenever a gate opens or closes for the AI's grid (agents repath) */
  rev: 0,
  /** (box) => void: a gate's cells changed for navigation (CTF.enterMap sets it) */
  onNav: null,
};
const gatePeriod = () => GATE_CYCLE.open + GATE_CYCLE.shut + 2 * GATE_CYCLE.move;
/** where gate g is in its cycle at time t: seconds into the cycle, or -1 before its first one */
function gateCycleT(g, t) {
  const T = gatePeriod(),
    u = t - g.phase * T;
  return u < 0 ? -1 : u % T;
}
const gateEase = k => k * k * (3 - 2 * k);
/** how far gate g is up at time t: 0 open (sunk), 1 shut */
function gateLift(g, t) {
  const C = GATE_CYCLE;
  let u = gateCycleT(g, t);
  if (u < C.open) return 0;
  u -= C.open;
  if (u < C.move) return gateEase(u / C.move);
  u -= C.move;
  if (u < C.shut) return 1;
  return 1 - gateEase(Math.min(1, (u - C.shut) / C.move));
}
/** does the AI treat gate g as shut at time t (from just before it rises until it is down again)? */
function gateNavShut(g, t) {
  const u = gateCycleT(g, t);
  return u >= GATE_CYCLE.open - GATE_CYCLE.lead;
}
/** a map document's gates with their twins expanded (a twin is rotated 180° and shares the phase) */
function mapGates(doc) {
  const out = [];
  for (const gd of doc.gates || []) {
    out.push(gd);
    if (gd.twin)
      out.push(
        Object.assign({}, gd, {
          id: gd.id + "~",
          twin: false,
          leaves: gd.leaves.map(([x, z, w, d]) => [-x, -z, w, d]),
        })
      );
  }
  return out;
}
/** build a map's gates into the collision list being built (from buildMap, after the static world) */
function buildGates(doc, group) {
  for (const gd of mapGates(doc)) {
    const g = { id: gd.id, map: doc.id, h: gd.h, phase: gd.phase, lift: 0, navShut: false, boxes: [] };
    let sx = 0,
      sz = 0;
    for (const [x, z, w, d] of gd.leaves) {
      const b = { x0: x - w / 2, x1: x + w / 2, y0: -gd.h, y1: 0, z0: z - d / 2, z1: z + d / 2, gate: g };
      /* the thin axis: the way a pilot is moved out of a rising leaf */
      b.ax = w < d ? "x" : "z";
      g.boxes.push(b);
      SOLID.push(b);
      sx += x;
      sz += z;
    }
    g.cx = sx / gd.leaves.length;
    g.cz = sz / gd.leaves.length;
    GATES.all.push(g);
    if (typeof gateLook === "function") gateLook(g, group);
  }
}
/** put the gates of the world in play where they are at gate time t (on false: every gate open) */
function gatesAt(t, on) {
  GATES.t = t;
  GATES.on = !!on;
  const live = GATES.live;
  live.length = 0;
  for (const g of GATES.all) if (SOLID.includes(g.boxes[0])) live.push(g);
  for (const g of live) {
    /* g.off: a gate left out (tools/tune.js tries subsets) */
    const run = !!on && !g.off;
    const lift = run ? gateLift(g, t) : 0;
    if (lift !== g.lift) {
      g.lift = lift;
      for (const b of g.boxes) {
        b.y1 = lift * g.h;
        b.y0 = b.y1 - g.h;
      }
    }
    const shut = run && gateNavShut(g, t);
    if (shut !== g.navShut) {
      g.navShut = shut;
      GATES.rev++;
      if (GATES.onNav) for (const b of g.boxes) GATES.onNav(b);
    }
  }
}
/** a pilot inside a gate leaf (it rose into them) steps out to the side they were on, or the other
    side if that one is blocked; their speed into the gate is dropped. Called at the start of Body.step. */
function gateShove(B) {
  const live = GATES.live;
  if (!live.length) return;
  const p = B.pos;
  for (let i = 0; i < live.length; i++) {
    const g = live[i];
    if (g.lift <= 0) continue;
    for (const b of g.boxes) {
      if (!ov(p.x, p.y, p.z, B.h, b)) continue;
      const a = b.ax,
        lo = b[a + "0"] - R - 0.02,
        hi = b[a + "1"] + R + 0.02,
        keep = p[a];
      const side = keep >= (lo + hi) / 2 ? 1 : -1;
      for (const s of [side, -side]) {
        p[a] = s > 0 ? hi : lo;
        if (freeAt(p.x, p.y, p.z, B.h)) {
          if (B.vel[a] * s < 0) B.vel[a] = 0;
          B.clamber = null;
          break;
        }
        p[a] = keep;
      }
    }
  }
}
