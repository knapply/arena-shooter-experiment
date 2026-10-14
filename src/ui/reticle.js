/* ============ reticle and scope ============
   Every frame: whether the crosshair is on an enemy in range (it turns red), the scope overlay for the
   weapon in hand (holo, smart-link, sniper) and its zoom and range readout. RANGE is each weapon class's
   effective range in metres. */
const _sd = new V3();
const RANGE = [42, 60, 220, 0, 55, 14, 30];
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
  /* the optic fades in over the last three quarters of the zoom and settles from slightly large; it
     fades out the same way when you let go or are shot out of it */
  const op = W().scope === "holo" ? 0 : clamp((adsP - 0.25) / 0.75, 0, 1),
    on = op > 0;
  sc.hidden = !on;
  if (on) {
    sc.style.opacity = String(op);
    sc.style.transform = `scale(${1.08 - 0.08 * op})`;
    sc.className = "sc-" + W().scope + (red ? " lock" : "");
    if (aiming) $("sZoom").textContent = zoomK() + "×";
    $("sRange").textContent = tr < 299 ? tr.toFixed(1) + " m" : "– m";
  }
}
