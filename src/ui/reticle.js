const _sd = new V3();
const RANGE = [42, 60, 220];
/* Arena-style reticle: turns red when a target is under it and within the weapon's effective range */
function updAim() {
  if (!playing || me.dead) {
    $("scope").hidden = true;
    return;
  }
  const o = camera.position;
  const d = _sd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const r = rayWorld(o, d, 300);
  let tr = r,
    hit = false;
  for (const t of targets()) {
    const h = rayTarget(o, d, t.pos, t.h, tr);
    if (h) {
      tr = h.t;
      hit = true;
    }
  }
  const red = hit && tr <= RANGE[wi];
  $("xh").classList.toggle("red", red);
  const sc = $("scope");
  const on = aiming && W().scope !== "holo";
  sc.hidden = !on;
  if (on) {
    sc.className = "sc-" + W().scope + (red ? " lock" : "");
    $("sZoom").textContent = zoomK() + "×";
    $("sRange").textContent = tr < 299 ? tr.toFixed(1) + " m" : "– m";
  }
}
