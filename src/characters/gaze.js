/* ============ GAZE AND GESTURES ============
   Where every pilot looks and when it gestures: bots, other players and CTF agents alike
   (characters/rig.js turns the head, characters/anim.js plays the gestures).
   - Gaze, four times a second for pilots near the camera: the head turns toward the most pressing
     enemy in view (near and in front counts most), or, for the local player's teammates, toward a
     ping of theirs for a moment after it goes up. The aim still leads; the head adds what a neck can.
   - Gestures: a killer standing still flexes or shrugs; when a match ends the winners cheer or flex
     and the rest shrug or wave (an emote only plays standing, and gives way to moving or shooting).
   Pilots are told apart by the stable id and team posePilot gives each rig. */
/** every rig made (makePilot adds it; one taken out of the scene drops out) */
const RIGS = new Set();
/** gestures waiting to play: { rig, name, at } */
const GESTURES = [];
let gazeT = 0;
function rigById(id) {
  for (const r of RIGS) if (r.pid === id) return r;
  return null;
}
function updGaze(dt) {
  gazeT += dt;
  for (let i = GESTURES.length - 1; i >= 0; i--)
    if (gazeT >= GESTURES[i].at) {
      GESTURES[i].rig.emote(GESTURES[i].name);
      GESTURES.splice(i, 1);
    }
  if (Math.floor(gazeT * 4) === Math.floor((gazeT - dt) * 4)) return;
  const mine = rigById("local"),
    myTeam = mine ? mine.team : -1;
  for (const r of RIGS) {
    if (!r.root.parent) {
      RIGS.delete(r);
      continue;
    }
    const p = r.root.position;
    if (r.dead || !r.root.visible || p.distanceToSquared(camera.position) > 1600) {
      r.look(0, 0, 0, 0);
      continue;
    }
    const yaw = r.root.rotation.y,
      fx = -Math.sin(yaw),
      fz = -Math.cos(yaw);
    let best = null,
      bs = 0;
    for (const o of RIGS) {
      if (o === r || o.dead || !o.root.parent || !o.root.visible) continue;
      if (r.team >= 0 && o.team === r.team) continue;
      const dx = o.root.position.x - p.x,
        dz = o.root.position.z - p.z,
        d = Math.hypot(dx, dz);
      if (d > 35 || d < 0.5) continue;
      const c = (dx * fx + dz * fz) / d;
      if (c < -0.2) continue;
      const sc = (1 + c) / (1 + d * 0.1);
      if (sc > bs) {
        bs = sc;
        best = o;
      }
    }
    if (best) {
      const q = best.root.position;
      r.look(q.x, q.y + 1.4, q.z, 0.75);
      continue;
    }
    /* the local player's teammates glance at a fresh ping */
    let ping = null;
    if (myTeam >= 0 && r.team === myTeam && r !== mine)
      for (const q of PINGS.list)
        if (now - q.t0 < 2.5 && q.pos && q.pos.distanceToSquared(p) < 1600) ping = q;
    if (ping) r.look(ping.pos.x, ping.pos.y, ping.pos.z, 0.85);
    else r.look(0, 0, 0, 0);
  }
}
onFrame(updGaze, { full: true });
EVENTS.on("kill", e => {
  const r = e.killer !== "local" && rigById(e.killer);
  if (r) GESTURES.push({ rig: r, name: Math.random() < 0.5 ? "flex" : "shrug", at: gazeT + 0.6 });
});
EVENTS.on("matchEnd", e => {
  for (const r of RIGS) {
    if (r.pid === "local" || !r.root.parent) continue;
    const won = r.pid === e.winner || (typeof e.winner === "number" && r.team === e.winner);
    const name = won ? (Math.random() < 0.6 ? "cheer" : "flex") : Math.random() < 0.6 ? "shrug" : "wave";
    GESTURES.push({ rig: r, name, at: gazeT + 0.3 + Math.random() * 0.8 });
  }
});
