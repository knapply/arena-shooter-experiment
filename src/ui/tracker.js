/* ============ MOTION TRACKER ============
   A 25 m radar: an enemy shows only while they sprint, thrust or hover (stabilize in the air);
   walking, crouching, standing and firing stay off it, so moving quietly is a choice. A contact that
   goes quiet fades out over half a second. Teammates always show (dimmer), and so do danger marks.
   Up is where you are looking. Modes supply their own contacts with EXT.radar() ({ pos, ally, body }
   or { pos, ally, loud }); the arena uses its drones and online players. Off in Gameplay settings for
   a no-radar competitive game; its corner and size are settings too (trackerPos, trackerSize:
   body[data-trk] and --trk in CSS). */
const TRACK_RANGE = 25,
  /** how long a contact lingers, fading, after it goes quiet (seconds) */
  TRACK_ECHO = 0.5,
  /* drawing resolution: sharp up to the largest size setting */
  TRACK_PX = 400;
let trackEl = null,
  trackT = 0;
/** loud enough for the tracker: sprinting, thrusting, or hovering (stabilizing in the air) */
const trackLoud = b => !!b && (!!b.sprint || b.thrustT > 0 || !!b.stabbing);
/** the arena's contacts: { pos, ally, loud, key } */
function arenaContacts() {
  const out = [];
  for (const b of bots)
    if (!b.body.dead) out.push({ pos: b.body.pos, ally: false, loud: trackLoud(b.body), key: b });
  /* online players: their state bits (net/arena-net.js): 2 sprint, 8 thrust, 16 stabilize */
  for (const r of remotes.values())
    if (r.has && !r.dead && r.rig)
      out.push({ pos: r.rig.root.position, ally: false, loud: !!(r.st & 26), key: r });
  return out;
}
/** contacts the tracker shows right now, in view space: { x, z (meters, forward = -z), y, ally, key } */
function trackerShown() {
  const out = [];
  const list = EXT && EXT.radar ? EXT.radar() : arenaContacts();
  const cy = Math.cos(me.yaw),
    sy = Math.sin(me.yaw);
  for (const c of list) {
    const dx = c.pos.x - me.pos.x,
      dz = c.pos.z - me.pos.z;
    if (Math.hypot(dx, dz) > TRACK_RANGE) continue;
    const loud = c.loud != null ? !!c.loud : trackLoud(c.body);
    if (!c.ally && !loud) continue;
    out.push({
      x: dx * cy - dz * sy,
      z: dx * sy + dz * cy,
      y: c.pos.y - me.pos.y,
      ally: !!c.ally,
      key: c.key || c.body || c.pos,
      wx: c.pos.x,
      wz: c.pos.z,
    });
  }
  return out;
}
/** enemies that went quiet a moment ago: key → { wx, wz, y, t } (drawn fading, where they were last loud) */
const trackEcho = new Map();
/** the tracker's face: a dark glass disc, range rings, a tick every 30°, your facing cone */
function trackerFace(x, C, R) {
  const g = x.createRadialGradient(C, C, R * 0.15, C, C, R);
  g.addColorStop(0, "#0d2230c8");
  g.addColorStop(1, "#06111ae0");
  x.fillStyle = g;
  x.beginPath();
  x.arc(C, C, R, 0, Math.PI * 2);
  x.fill();
  x.save();
  x.shadowColor = "#7fdcff";
  x.shadowBlur = 10;
  x.strokeStyle = "#7fdcffb0";
  x.lineWidth = 3;
  x.beginPath();
  x.arc(C, C, R - 1.5, 0, Math.PI * 2);
  x.stroke();
  x.restore();
  x.strokeStyle = "#7fdcff38";
  x.lineWidth = 2;
  x.beginPath();
  x.arc(C, C, R * 0.5, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(C - R, C);
  x.lineTo(C + R, C);
  x.moveTo(C, C - R);
  x.lineTo(C, C + R);
  x.stroke();
  x.strokeStyle = "#7fdcff90";
  x.lineWidth = 3;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2,
      r0 = k % 3 ? R - 12 : R - 22;
    x.beginPath();
    x.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
    x.lineTo(C + Math.cos(a) * (R - 4), C + Math.sin(a) * (R - 4));
    x.stroke();
  }
  /* your facing cone */
  const cone = x.createRadialGradient(C, C, 0, C, C, R);
  cone.addColorStop(0, "#7fdcff30");
  cone.addColorStop(1, "#7fdcff00");
  x.fillStyle = cone;
  x.beginPath();
  x.moveTo(C, C);
  x.arc(C, C, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
  x.fill();
  x.fillStyle = "#e6f7ff";
  x.beginPath();
  x.moveTo(C, C - 10);
  x.lineTo(C + 7, C + 7);
  x.lineTo(C, C + 3);
  x.lineTo(C - 7, C + 7);
  x.closePath();
  x.fill();
  x.fillStyle = "#7fdcffb0";
  x.font = "600 22px 'IBM Plex Mono', monospace";
  x.textAlign = "center";
  x.fillText(TRACK_RANGE + "m", C, C + R * 0.5 - 8);
}
/** one contact: a dot on your level, a triangle pointing up or down when above or below you */
function trackerBlip(x, C, R, c, alpha) {
  const px = C + (c.x / TRACK_RANGE) * R,
    py = C + (c.z / TRACK_RANGE) * R;
  const above = c.y > 2.5,
    below = c.y < -2.5;
  x.globalAlpha = alpha * (c.ally ? 0.6 : 1);
  x.fillStyle = c.ally ? "#7fdcff" : "#ff4a3d";
  x.shadowColor = x.fillStyle;
  x.shadowBlur = c.ally ? 6 : 16;
  x.beginPath();
  if (above || below) {
    const s = above ? -1 : 1;
    x.moveTo(px, py + 13 * s);
    x.lineTo(px - 12, py - 8 * s);
    x.lineTo(px + 12, py - 8 * s);
    x.closePath();
  } else x.arc(px, py, c.ally ? 7.5 : 11, 0, Math.PI * 2);
  x.fill();
  x.shadowBlur = 0;
  x.globalAlpha = 1;
}
/** danger marks within range: a red warning triangle */
function trackerDanger(x, C, R) {
  const cy = Math.cos(me.yaw),
    sy = Math.sin(me.yaw);
  for (const p of PINGS.list) {
    if (p.kind !== "danger") continue;
    const dx = p.pos.x - me.pos.x,
      dz = p.pos.z - me.pos.z;
    if (Math.hypot(dx, dz) > TRACK_RANGE) continue;
    const px = C + ((dx * cy - dz * sy) / TRACK_RANGE) * R,
      py = C + ((dx * sy + dz * cy) / TRACK_RANGE) * R;
    x.strokeStyle = "#ff6a3a";
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(px, py - 15);
    x.lineTo(px + 14, py + 11);
    x.lineTo(px - 14, py + 11);
    x.closePath();
    x.stroke();
    x.fillStyle = "#ff6a3a";
    x.fillRect(px - 2, py - 6, 4, 9);
    x.fillRect(px - 2, py + 5, 4, 3);
  }
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
  /* it fades out as you zoom in, as the references' radar does */
  trackEl.style.opacity = String(1 - adsP);
  if (!on) {
    trackEcho.clear();
    return;
  }
  trackT -= dt;
  if (trackT > 0) return;
  trackT = 1 / 20;
  const x = trackEl.getContext("2d"),
    W = TRACK_PX,
    C = W / 2,
    R = C - 8;
  x.clearRect(0, 0, W, W);
  trackerFace(x, C, R);
  trackerGates(x, C, R);
  trackerDanger(x, C, R);
  const shown = trackerShown();
  for (const c of shown) if (!c.ally) trackEcho.set(c.key, { wx: c.wx, wz: c.wz, y: c.y, t: now });
  const live = new Set(shown.map(c => c.key)),
    cy = Math.cos(me.yaw),
    sy = Math.sin(me.yaw);
  for (const [k, e] of trackEcho) {
    if (now - e.t > TRACK_ECHO) trackEcho.delete(k);
    else if (!live.has(k)) {
      const dx = e.wx - me.pos.x,
        dz = e.wz - me.pos.z;
      trackerBlip(
        x,
        C,
        R,
        { x: dx * cy - dz * sy, z: dx * sy + dz * cy, y: e.y, ally: false },
        1 - (now - e.t) / TRACK_ECHO
      );
    }
  }
  for (const c of shown) trackerBlip(x, C, R, c, 1);
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
