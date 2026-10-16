/* Outlines of every weapon design, for checking a design's silhouette against others (side and top views,
   solid black on white, all at one scale) without lighting or detail in the way.
     node tools/gun-silhouettes.js [out.html]        one page with every weapon, side above top
     node tools/gun-silhouettes.js out.html file.js  the designs in another part-list file (same format as
                                                    GUN_MODELS in src/weapons/models.js: a variants sheet)
   Reads the part lists directly (no three.js, no browser); open the page, or screenshot it, to compare. */
const fs = require("fs"),
  path = require("path");
const [outArg, srcArg] = process.argv.slice(2);
const out = outArg || "gun-silhouettes.html";
const src = fs.readFileSync(srcArg || path.join(__dirname, "../src/weapons/models.js"), "utf8");
/* the part lists and their parser, without the geometry builders (they need three.js) */
const body = src.slice(0, src.indexOf("/** a part's geometry"));
const { GUN_MODELS, gunParts } = new Function(body + "; return { GUN_MODELS, gunParts };")();
const names = [...src.matchAll(/^ {2}\/\* ([^:\n]+?)[:,]/gm)].map(m => m[1].trim());
const PX = 700; /* px per metre */
/** one weapon in one view: x along the barrel (muzzle to the left), y up (side) or across (top) */
function view(parts, top) {
  const shapes = [];
  for (const p of parts) {
    if (p.k === "n" || p.m === "E") continue;
    const zc = -p.z,
      yc = top ? p.x : p.y;
    if (p.k === "b" || p.k === "r") {
      const w = p.c,
        h = top ? p.a : p.b,
        rot = top ? 0 : (p.rx * 180) / Math.PI;
      shapes.push({ k: "rect", x: zc, y: yc, w, h, rot });
    } else if (p.k === "c") {
      shapes.push({ k: "taper", x: zc, y: yc, len: p.c, rf: p.a, rb: p.b });
    } else if (p.k === "v") {
      if (top) shapes.push({ k: "circ", x: zc, y: yc, r: Math.max(p.a, p.b) });
      else shapes.push({ k: "rect", x: zc, y: yc, w: 2 * Math.max(p.a, p.b), h: p.c, rot: 0 });
    } else if (p.k === "s") {
      if (top) shapes.push({ k: "rect", x: zc, y: yc, w: 2 * Math.max(p.a, p.b), h: p.c, rot: 0 });
      else shapes.push({ k: "circ", x: zc, y: yc, r: Math.max(p.a, p.b) });
    }
  }
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  for (const s of shapes) {
    const rx = s.k === "circ" ? s.r : s.k === "taper" ? s.len / 2 : Math.hypot(s.w, s.h) / 2,
      ry = s.k === "circ" ? s.r : s.k === "taper" ? Math.max(s.rf, s.rb) : Math.hypot(s.w, s.h) / 2;
    x0 = Math.min(x0, s.x - rx);
    x1 = Math.max(x1, s.x + rx);
    y0 = Math.min(y0, s.y - ry);
    y1 = Math.max(y1, s.y + ry);
  }
  const m = 0.02,
    W = (x1 - x0 + 2 * m) * PX,
    H = (y1 - y0 + 2 * m) * PX;
  const X = x => (x - x0 + m) * PX,
    Y = y => (y1 - y + m) * PX;
  const el = shapes.map(s => {
    if (s.k === "circ") return `<circle cx="${X(s.x)}" cy="${Y(s.y)}" r="${s.r * PX}"/>`;
    if (s.k === "taper") {
      /* muzzle end (front radius) on the left */
      const a = X(s.x - s.len / 2),
        b = X(s.x + s.len / 2);
      return `<polygon points="${a},${Y(s.y + s.rf)} ${b},${Y(s.y + s.rb)} ${b},${Y(s.y - s.rb)} ${a},${Y(s.y - s.rf)}"/>`;
    }
    return `<rect x="${X(s.x) - (s.w * PX) / 2}" y="${Y(s.y) - (s.h * PX) / 2}" width="${s.w * PX}" height="${s.h * PX}" transform="rotate(${-s.rot} ${X(s.x)} ${Y(s.y)})"/>`;
  });
  return `<svg width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W} ${H}" fill="#000">${el.join("")}</svg>`;
}
const cells = GUN_MODELS.map(
  (_, i) =>
    `<figure><figcaption>${names[i] || "weapon " + i}</figcaption>${view(gunParts(i), false)}<br>${view(gunParts(i), true)}</figure>`
);
fs.writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Weapon silhouettes</title><style>body{background:#fff;font:14px sans-serif;margin:16px}figure{display:inline-block;vertical-align:top;margin:0 24px 24px 0}figcaption{margin-bottom:6px}</style>${cells.join("")}`
);
console.log("wrote " + out);
