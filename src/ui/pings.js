/* ============ PINGS ============
   One button marks what's under your reticle: an enemy ("Enemy", follows them), a weapon pickup
   ("Sniper rifle"), or a place ("Here"). Markers show distance and fade after a few seconds.
   Modes share pings with teammates (EXT.onPing): in CTF they go to teammates online over the
   reliable channel, and AI teammates go there or hunt the marked enemy. Rate limited. */
const PINGS = { list: [], lastT: -9, seq: 0 };
const PING_LIFE = { enemy: 5, weapon: 8, place: 8 };
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
  /* a place is called by the map's callout zone when it has one ("Red base", "north lane") */
  const z = zoneAt(hit);
  return { kind: "place", label: z ? z[0].toUpperCase() + z.slice(1) : "Here", pos: hit };
}
/** add a ping (yours or a teammate's): { by, byName, kind, label, pos, ref? } */
function addPing(p) {
  const life = PING_LIFE[p.kind] || 6;
  PINGS.list = PINGS.list.filter(q => !(q.by === p.by && q.kind === p.kind));
  PINGS.list.push(Object.assign({ id: ++PINGS.seq, until: now + life, el: null }, p));
  while (PINGS.list.length > 8) {
    const q = PINGS.list.shift();
    if (q.el) q.el.remove();
  }
  sfx("magin", 0.5);
}
function pingNow() {
  if (now - PINGS.lastT < 0.6 || me.dead) return;
  const t = pingTarget();
  if (!t) return;
  PINGS.lastT = now;
  const p = Object.assign({ by: "local", byName: myName }, t);
  addPing(p);
  EVENTS.emit("ping", { pilot: "local", kind: p.kind, label: p.label, p: [p.pos.x, p.pos.y, p.pos.z] });
  if (EXT && EXT.onPing) EXT.onPing(p);
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
    _pgV.y += p.kind === "enemy" ? 2.3 : 0.6;
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
