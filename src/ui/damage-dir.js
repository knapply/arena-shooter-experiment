/* ============ DAMAGE DIRECTION ============
   When you're hit, an arc around the crosshair points at where it came from (and keeps pointing
   there as you turn): pale blue while your shield takes it, red once it's hull. A few at once. */
const DARCS = [];
const DARC_LIFE = 1.4;
/** where a hit on you came from (a live position, so the arc follows them), or null */
function hitSource(src) {
  if (!src) return null;
  if (src.bot && src.bot.body) return src.bot.body.pos;
  if (src.agent && src.agent.body) return src.agent.body.pos;
  if (src.peer) {
    const r = remotes.get(src.peer);
    if (r && r.rig) return r.rig.root.position;
  }
  return src.pos || null;
}
function damageArc(src, shield) {
  const from = hitSource(src);
  if (!from) return;
  /* the same attacker refreshes their arc instead of stacking another */
  let a = DARCS.find(d => d.from === from);
  if (!a) {
    if (DARCS.length >= 4) DARCS.shift().el.remove();
    const el = document.createElement("i");
    el.className = "darc";
    $("dmgDir").appendChild(el);
    a = { el, from, t: 0 };
    DARCS.push(a);
  }
  a.t = DARC_LIFE;
  a.el.classList.toggle("hull", !shield);
}
function updDamageArcs(dt) {
  for (let i = DARCS.length - 1; i >= 0; i--) {
    const a = DARCS[i];
    a.t -= dt;
    if (a.t <= 0 || me.dead) {
      a.el.remove();
      DARCS.splice(i, 1);
      continue;
    }
    /* yaw turns left as it grows, so an attacker to your left has a positive relative angle */
    const ang = Math.atan2(-(a.from.x - me.pos.x), -(a.from.z - me.pos.z)) - me.yaw;
    a.el.style.transform = `rotate(${(-ang * 180) / Math.PI}deg)`;
    a.el.style.opacity = String(Math.min(1, a.t / 0.5));
  }
}
