/* ============ MOTION TRACKER ============
   A 25 m radar: enemies show up while they run, sprint, jump or shoot, and vanish when they
   crouch-walk or stand still, so moving quietly is a choice. Teammates always show (dimmer). Up is
   where you're looking. Modes can supply their own contacts with EXT.radar(); the arena uses its
   drones and online players. Off in Gameplay settings for a no-radar competitive game, and its
   corner and size are settings too (trackerPos, trackerSize: body[data-trk] and --trk in CSS). */
const TRACK_RANGE = 25,
  TRACK_SPEED = 3.6,
  /* drawing resolution: sharp up to the largest size setting on a high-density screen */
  TRACK_PX = 300;
let trackEl = null,
  trackT = 0;
/** the arena's contacts: { pos, vel, firing, ally } */
function arenaContacts() {
  const out = [];
  for (const b of bots)
    if (!b.body.dead)
      out.push({ pos: b.body.pos, vel: b.body.vel, firing: now - b.firedT < 0.5, ally: false });
  for (const r of remotes.values())
    if (r.has && !r.dead && r.rig)
      out.push({ pos: r.rig.root.position, vel: r.vel, firing: !!(r.st & 4096), ally: false });
  return out;
}
/** contacts the tracker shows right now, in view space: { x, z (meters, forward = -z), y, ally, firing } */
function trackerShown() {
  const out = [];
  const list = EXT && EXT.radar ? EXT.radar() : arenaContacts();
  const cy = Math.cos(me.yaw),
    sy = Math.sin(me.yaw);
  for (const c of list) {
    const dx = c.pos.x - me.pos.x,
      dz = c.pos.z - me.pos.z;
    if (Math.hypot(dx, dz) > TRACK_RANGE) continue;
    const loud = c.firing || Math.hypot(c.vel.x, c.vel.z) > TRACK_SPEED || Math.abs(c.vel.y) > 2;
    if (!c.ally && !loud) continue;
    out.push({
      x: dx * cy - dz * sy,
      z: dx * sy + dz * cy,
      y: c.pos.y - me.pos.y,
      ally: !!c.ally,
      firing: !!c.firing,
    });
  }
  return out;
}
function updTracker(dt) {
  if (!trackEl) {
    trackEl = /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (document.createElement("canvas")));
    trackEl.id = "tracker";
    trackEl.width = trackEl.height = TRACK_PX;
    $("hud").appendChild(trackEl);
  }
  const on = SET.tracker && playing && !me.dead;
  trackEl.hidden = !on;
  if (!on) return;
  trackT -= dt;
  if (trackT > 0) return;
  trackT = 1 / 20;
  const x = trackEl.getContext("2d"),
    W = TRACK_PX,
    C = W / 2,
    R = C - 6;
  x.clearRect(0, 0, W, W);
  x.fillStyle = "#0b1216b8";
  x.beginPath();
  x.arc(C, C, R, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "#dbe6ea30";
  x.lineWidth = 2;
  for (const k of [1, 0.5]) {
    x.beginPath();
    x.arc(C, C, R * k, 0, Math.PI * 2);
    x.stroke();
  }
  /* your facing cone */
  x.fillStyle = "#dbe6ea14";
  x.beginPath();
  x.moveTo(C, C);
  x.arc(C, C, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
  x.fill();
  x.fillStyle = "#dbe6ea";
  x.beginPath();
  x.arc(C, C, 5.5, 0, Math.PI * 2);
  x.fill();
  trackerGates(x, C, R);
  for (const c of trackerShown()) {
    const px = C + (c.x / TRACK_RANGE) * R,
      py = C + (c.z / TRACK_RANGE) * R;
    const above = c.y > 2.5,
      below = c.y < -2.5;
    x.fillStyle = c.ally ? "#62cdffaa" : c.firing ? "#ff5f57" : "#ffb347";
    x.beginPath();
    if (above || below) {
      /* a triangle: up for above you, down for below */
      const s = above ? -1 : 1;
      x.moveTo(px, py + 12 * s);
      x.lineTo(px - 11, py - 8 * s);
      x.lineTo(px + 11, py - 8 * s);
      x.closePath();
    } else x.arc(px, py, c.ally ? 7 : 9.5, 0, Math.PI * 2);
    x.fill();
  }
}
/** blast gates on the tracker: a bar along each leaf that is up or about to move (flashing) */
function trackerGates(x, C, R) {
  if (!GATES.on) return;
  const cy = Math.cos(me.yaw),
    sy = Math.sin(me.yaw),
    k = R / TRACK_RANGE,
    G = GATE_CYCLE;
  x.save();
  x.beginPath();
  x.arc(C, C, R, 0, Math.PI * 2);
  x.clip();
  x.lineCap = "round";
  for (const g of GATES.live) {
    const u = gateCycleT(g, GATES.t);
    if (g.lift <= 0 && !(u >= G.open - G.warn && u < G.open)) continue;
    /* steady while it is shut and staying shut; flashing while it warns or moves */
    const steady = g.lift >= 1 && u < G.open + G.move + G.shut - G.warn;
    x.strokeStyle = steady ? "#ffae2ecc" : Math.sin(now * Math.PI * 5) > 0 ? "#ffae2eee" : "#ffae2e44";
    for (const b of g.boxes) {
      const thin = b.ax === "x";
      const mx = (b.x0 + b.x1) / 2,
        mz = (b.z0 + b.z1) / 2;
      x.lineWidth = Math.max(4, (thin ? b.x1 - b.x0 : b.z1 - b.z0) * k);
      x.beginPath();
      for (const s of [-1, 1]) {
        const dx = (thin ? mx : s > 0 ? b.x1 : b.x0) - me.pos.x,
          dz = (thin ? (s > 0 ? b.z1 : b.z0) : mz) - me.pos.z;
        const px = C + (dx * cy - dz * sy) * k,
          py = C + (dx * sy + dz * cy) * k;
        if (s < 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.stroke();
    }
  }
  x.restore();
}
