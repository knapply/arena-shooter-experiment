/* ============ PILOTS ============
   Every player-shaped thing is a Pilot: you, practice drones, online players, CTF agents,
   tutorial targets and trailer actors. A pilot is a stable id, a Body (movement and health),
   an optional rig (the animated model) and a controller kind that says who decides its input:
     "local"  your keyboard, mouse or pad
     "ai"     a bot brain (arena drones, CTF agents)
     "net"    snapshots from another player
     "script" the tutorial and the trailer
   Stable ids are what events, recordings and a future career-stats file key on:
     "local", "bot:<n>", "peer:<peerId>", "dummy:<n>", "actor:<n>", and CTF agent ids ("a<n>", "h:<peerId>").
   Features that only need a body and a rig (posing, hit effects, kill cams) are written once
   against this shape. CTF agents carry the same fields without registering here, because the
   match owns their lifetime. */
/** @type {Map<string, Pilot>} */
const PILOTS = new Map();

/** copy a body's transform onto its rig and animate it; works for anything with {body, rig} */
function posePilot(p, dt, extra) {
  const rg = p.rig;
  if (!rg) return;
  rg.root.position.copy(p.body.pos);
  rg.root.rotation.y = p.body.yaw;
  rigEvents(rg, rg.update(dt, bodyState(p.body, extra)));
}

class Pilot {
  /** @param {{ id: string, name?: string, color?: string, team?: number, ctl?: string, body?: Body, rig?: boolean }} o */
  constructor(o) {
    this.id = o.id;
    this.name = o.name || "";
    this.color = o.color || "#dbe6ea";
    this.team = o.team == null ? -1 : o.team;
    this.ctl = o.ctl || "ai";
    this.body = o.body || new Body();
    /** @type {any} */
    this.rig = o.rig === false ? null : makePilot(this.color, this.name);
    this.k = 0;
    this.d = 0;
    this.firedT = -9;
    this.reloadT = 0;
    this.wpn = 0;
  }
  pose(dt, extra) {
    posePilot(this, dt, extra);
  }
  /** take the pilot out of the world and the registry */
  dispose() {
    if (this.rig) scene.remove(this.rig.root);
    this.rig = null;
    if (PILOTS.get(this.id) === this) PILOTS.delete(this.id);
  }
}

/** register a pilot, replacing (and disposing) any older pilot with the same id */
function addPilot(p) {
  const old = PILOTS.get(p.id);
  if (old && old !== p) old.dispose();
  PILOTS.set(p.id, p);
  return p;
}
function pilotById(id) {
  return PILOTS.get(id) || null;
}
