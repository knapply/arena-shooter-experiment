/* ============ kill feed icons ============
   Between the names, the kill feed shows how it happened: a gun as a side-on silhouette rendered from
   its own model (weapons/models.js, through the floor model's merged parts), once per weapon when a
   match starts, so the icons follow any change to the models; the grenades as the HUD's grenade icons;
   melee, the shoulder charge, the ground pound, a drop pod and your own hand as small glyphs. A
   headshot adds a mark. Where the renderer can't read pixels back (the tests' stand-in three.js) a gun
   falls back to the HUD's drawn outline. Every icon is a CSS mask, so it takes the feed's colour. */
const FEED_ICON = new Map();
const svgURL = (vb, body) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`)}")`;
/** glyphs for kills without a gun (viewBox 0 0 32 20) */
const FEED_GLYPH = {
  /* a fist side on: four knuckles over a thumb, the wrist behind */
  melee:
    '<path d="M2 7h6v6H2z"/><path d="M10 3h15a3 3 0 0 1 3 3v8a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V4a1 1 0 0 1 1-1zm4.5 1v6h1V4zm4 0v6h1V4zm4 0v6h1V4zM12 12v1.5h11V12z" fill-rule="evenodd"/>',
  /* a shoulder driving forward */
  charge: '<path d="M4 6h10l4-4h6l-6 8 6 8h-6l-4-4H4z"/><path d="M25 7h4v6h-4z"/>',
  /* arrows into a ground line */
  pound: '<path d="M10 1h4v7h4l-6 7-6-7h4zM18 1h4v7h4l-6 7-6-7h4z"/><path d="M3 17h26v2H3z"/>',
  /* a pod coming down */
  pod: '<path d="M16 1c4 0 7 4 7 9v6l-3 3h-8l-3-3v-6c0-5 3-9 7-9z"/>',
  /* a broken ring: your own doing, or the world */
  self: '<path d="M16 3a7 7 0 1 1-6.2 3.8l2.7 1.3A4 4 0 1 0 16 6z"/><path d="M14 13h4v4h-4z"/>',
};
/** the damage type (an event's weapon) → what to draw: a WEAPON_DATA index, a grenade, a glyph */
function feedKind(w) {
  const t = WEAPONS.findIndex(x => x.dmg === w || x.key === w);
  if (t >= 0) return { t };
  if (w === "frag") return { nade: "frag" };
  if (w === "stick" || w === "plasma") return { nade: "plasma" };
  return { glyph: FEED_GLYPH[w] ? w : "self" };
}
const _fiBox = new THREE.Box3(),
  _fiV = new THREE.Vector3();
/** a gun's side-on silhouette from its model, as a data URL (null where pixels can't be read back) */
function renderGunIcon(t) {
  if (typeof renderer.readRenderTargetPixels !== "function" || !THREE.WebGLRenderTarget) return null;
  const W = 384,
    H = 128;
  const scene = new THREE.Scene(),
    mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [geo] of floorParts(t)) scene.add(new THREE.Mesh(geo, mat));
  _fiBox.setFromObject(scene);
  if (_fiBox.isEmpty()) return null;
  const c = _fiBox.getCenter(_fiV),
    len = _fiBox.max.z - _fiBox.min.z,
    tall = _fiBox.max.y - _fiBox.min.y;
  /* side on from +x: the muzzle (-z) points right; the gun fills the width, or the height if stubby */
  const half = Math.max(len / 2, (tall / 2) * (W / H)) * 1.06;
  const cam = new THREE.OrthographicCamera(-half, half, half * (H / W), -half * (H / W), 0.01, 10);
  cam.position.set(c.x + 3, c.y, c.z);
  cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(W, H);
  const keepRT = renderer.getRenderTarget(),
    keepC = renderer.getClearColor(new THREE.Color()),
    keepA = renderer.getClearAlpha();
  const px = new Uint8Array(W * H * 4);
  try {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  } finally {
    renderer.setRenderTarget(keepRT);
    renderer.setClearColor(keepC, keepA);
    rt.dispose();
    mat.dispose();
  }
  /* into a 2D canvas, flipped (GL rows run bottom up); the alpha is the mask */
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return null;
  const img = x.createImageData(W, H);
  let any = false;
  for (let y = 0; y < H; y++)
    for (let i = 0; i < W; i++) {
      const s = ((H - 1 - y) * W + i) * 4,
        d = (y * W + i) * 4,
        a = Math.max(px[s], px[s + 1], px[s + 2]) > 8 ? 255 : 0;
      img.data[d] = img.data[d + 1] = img.data[d + 2] = 255;
      img.data[d + 3] = a;
      if (a) any = true;
    }
  if (!any) return null;
  x.putImageData(img, 0, 0);
  return `url("${cv.toDataURL("image/png")}")`;
}
/** the CSS mask for a kill's icon (rendered guns cached per weapon) */
function feedIconMask(w) {
  const k = feedKind(w);
  if (k.t != null) {
    if (!FEED_ICON.has(k.t)) {
      let url = null;
      try {
        url = renderGunIcon(k.t);
      } catch (e) {
        url = null;
      }
      FEED_ICON.set(
        k.t,
        url || svgURL("0 0 64 20", `<path d="${WEAPON_SIL[WEAPONS[k.t].key] || WEAPON_SIL.carbine}"/>`)
      );
    }
    return FEED_ICON.get(k.t);
  }
  if (k.nade) return svgURL("0 0 20 24", NADE_ICON[k.nade]);
  return svgURL("0 0 32 20", FEED_GLYPH[k.glyph]);
}
/** the icon element for a kill: the weapon (or how), and a headshot mark */
function feedIcon(w, head) {
  const s = document.createElement("span");
  s.className = "fi";
  const k = feedKind(w);
  const i = document.createElement("i");
  i.className = k.t != null ? "gun" : k.nade ? "nade" : "glyph";
  i.style.setProperty("--m", feedIconMask(w));
  i.title = k.t != null ? WEAPONS[k.t].name : k.nade ? k.nade : k.glyph;
  s.appendChild(i);
  if (head) {
    const h = document.createElement("b");
    h.className = "hs";
    h.title = "headshot";
    s.appendChild(h);
  }
  return s;
}
/* the guns are rendered as a match starts, not at the first kill (a readback stalls the GPU briefly) */
EVENTS.on("matchStart", () => {
  for (let t = 0; t < WEAPONS.length; t++) feedIconMask(WEAPONS[t].dmg);
});
