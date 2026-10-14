/* ============ PINGS ============
   One button marks what's under your reticle: an enemy ("Enemy", follows them), a weapon pickup
   ("Sniper rifle"), or a place ("Here"). Double-tapping it marks danger at the reticle point, enemy
   or not: a red warning with its own sound and callout. Markers show distance and fade after a few
   seconds. Each player has one mark at a time: a new ping (any kind) replaces your last one, here
   and for teammates. Modes share pings with teammates (EXT.onPing): in CTF they go to teammates
   online over the reliable channel, and AI teammates go there or hunt the marked enemy, or keep
   clear of a danger mark and watch it. Rate limited. */
const PINGS = { list: [], lastT: -9, seq: 0, tapT: -9, tapDanger: false };
const PING_LIFE = { enemy: 5, weapon: 8, place: 8, danger: 10 };
/** a second press this soon after the first (real seconds) is a double tap: danger */
const PING_TAP = 0.35;
const _pgD = new V3(),
  _pgO = new V3(),
  _pgV = new V3();
/** what's under the reticle (or along any ray): { kind, label, pos, ref? } */
function pingTarget(origin, dir) {
  const o = origin || camera.getWorldPosition(_pgO),
    d = dir || camera.getWorldDirection(_pgD);
  const wall = rayWorld(o, d, 150);
  /* enemies: a forgiving cone (about 2.5°) so a quick ping on a moving target works */
  let best = null,
    ba = 0.045;
  for (const t of targets()) {
    _pgV.copy(t.pos);
    _pgV.y += t.h * 0.6;
    _pgV.sub(o);
    const L = _pgV.length();
    if (L > Math.min(wall + 1, 150)) continue;
    const a = Math.acos(clamp(_pgV.dot(d) / L, -1, 1));
    if (a < ba) {
      ba = a;
      best = t;
    }
  }
  if (best) return { kind: "enemy", label: "Enemy", pos: best.pos, ref: best.ref };
  const hit = o.clone().addScaledVector(d, Math.min(wall, 150));
  for (const p of pickupList())
    if (p.pos.distanceTo(hit) < 4 || p.pos.distanceTo(o) < 3)
      return {
        kind: "weapon",
        label: WEAPONS[p.type].name.split(" ").slice(1).join(" ") || "Weapon",
        pos: p.pos.clone(),
      };
  if (wall >= 150) return null;
  return { kind: "place", label: "Here", pos: hit };
}
/** a danger mark at the reticle point (or along any ray): the first wall or floor it meets, or 80 m
    out when it meets nothing */
function dangerTarget(origin, dir) {
  const o = origin || camera.getWorldPosition(_pgO),
    d = dir || camera.getWorldDirection(_pgD);
  return {
    kind: "danger",
    label: "Danger",
    pos: o.clone().addScaledVector(d, Math.min(rayWorld(o, d, 80), 80)),
  };
}
/** the danger mark's sound: two quick falling tones */
function dangerSfx(vol = 1) {
  if (SFX_TAP) return SFX_TAP("danger", vol);
  if (!AC) return;
  const t = AC.currentTime;
  tone(t, "square", 1180, 900, 0.09, 0.045 * vol);
  tone(t + 0.12, "square", 1180, 900, 0.09, 0.045 * vol);
  tone(t, "sine", 320, 220, 0.25, 0.08 * vol);
}
/** add a ping (yours or a teammate's): { by, byName, kind, label, pos, ref? }; it replaces that
    player's last one */
function addPing(p) {
  const life = PING_LIFE[p.kind] || 6;
  PINGS.list = PINGS.list.filter(q => {
    if (q.by !== p.by) return true;
    if (q.el) q.el.remove();
    return false;
  });
  PINGS.list.push(Object.assign({ id: ++PINGS.seq, t0: now, until: now + life, el: null }, p));
  while (PINGS.list.length > 8) {
    const q = PINGS.list.shift();
    if (q.el) q.el.remove();
  }
  if (p.kind === "danger") {
    dangerSfx(p.by === "local" ? 1 : 0.8);
    hudCallout(p.by === "local" ? "Danger marked" : `Danger · ${p.byName || "teammate"}`, true, 1.8);
    if (p.by !== "local") say("Danger", false);
  } else sfx("magin", 0.5);
}
/** share a ping of yours: the event stream and the mode's teammates */
function sharePing(p) {
  addPing(p);
  EVENTS.emit("ping", { pilot: "local", kind: p.kind, label: p.label, p: [p.pos.x, p.pos.y, p.pos.z] });
  if (EXT && EXT.onPing) EXT.onPing(p);
}
/** the ping button: a ping, or on a double tap a danger mark in its place */
function pingNow() {
  if (me.dead) return;
  const t = performance.now() / 1000,
    dbl = t - PINGS.tapT < PING_TAP && !PINGS.tapDanger;
  PINGS.tapT = t;
  PINGS.tapDanger = dbl;
  if (dbl) {
    PINGS.lastT = now;
    sharePing(Object.assign({ by: "local", byName: myName }, dangerTarget()));
    return;
  }
  if (now - PINGS.lastT < 0.6) return;
  const tg = pingTarget();
  if (!tg) return;
  PINGS.lastT = now;
  sharePing(Object.assign({ by: "local", byName: myName }, tg));
}
let pingLayer = null;
function updPings() {
  if (!pingLayer) {
    pingLayer = document.createElement("div");
    pingLayer.id = "pings";
    $("hud").appendChild(pingLayer);
  }
  PINGS.list = PINGS.list.filter(p => {
    const alive = now < p.until && !(p.ref && (p.ref.dead || (p.ref.body && p.ref.body.dead)));
    if (!alive && p.el) p.el.remove();
    return alive;
  });
  const W = innerWidth,
    H = innerHeight;
  for (const p of PINGS.list) {
    if (!p.el) {
      p.el = document.createElement("div");
      p.el.className = "ping " + p.kind;
      p.el.innerHTML = "<i></i><b></b><span></span>";
      p.el.querySelector("b").textContent = p.label + (p.by !== "local" && p.byName ? " · " + p.byName : "");
      pingLayer.appendChild(p.el);
    }
    const src = p.ref && p.ref.body ? p.ref.body.pos : p.ref && p.ref.rig ? p.ref.rig.root.position : p.pos;
    _pgV.copy(src);
    _pgV.y += p.kind === "enemy" ? 2.3 : p.kind === "danger" ? 1.2 : 0.6;
    const dist = _pgV.distanceTo(camera.position);
    _pgV.project(camera);
    const behind = _pgV.z > 1;
    let x = (_pgV.x * 0.5 + 0.5) * W,
      y = (-_pgV.y * 0.5 + 0.5) * H;
    if (behind) {
      x = W - x;
      y = H - 40;
    }
    p.el.style.transform = `translate(${clamp(x, 30, W - 30)}px, ${clamp(y, 40, H - 40)}px)`;
    p.el.querySelector("span").textContent = Math.round(dist) + " m";
    p.el.style.opacity = String(clamp((p.until - now) / 1.2, 0, 1));
  }
}
