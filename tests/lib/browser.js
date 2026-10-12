/* Shared Playwright setup. Env:
   CHROME_PATH  use a specific Chromium build
   THREE_PATH   serve a real three.min.js (r128) from disk instead of the stub (enables render tests) */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..", "..");
const GAME = "file://" + path.join(ROOT, "index.html");
async function launch(opts = {}) {
  const args = opts.gpu
    ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    : [];
  return chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args });
}
/* http: true serves the repo from a fake origin (http://ka.test/), as GitHub Pages would: needed for
   anything a file:// page can't do, such as the simulation worker */
async function serveRepo(ctx) {
  if (ctx.__served) return;
  ctx.__served = true;
  await ctx.route("http://ka.test/**", r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, "") || "index.html";
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    const type = /\.js$/.test(f)
      ? "application/javascript"
      : /\.html$/.test(f)
        ? "text/html"
        : "application/octet-stream";
    r.fulfill({ contentType: type, body: fs.readFileSync(f) });
  });
}
/* tests start with match intros off (they would hold input for a few seconds after every deploy);
   pass intros: true to test them */
async function open(
  ctx,
  { tag = "", init = [], realThree = false, hash = "", http = false, intros = false } = {}
) {
  if (http) await serveRepo(ctx);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", e => p.errors.push(tag + " " + e.message));
  p.on("console", m => {
    if (m.type() === "error") p.errors.push(tag + " console: " + m.text());
  });
  for (const f of init) await p.addInitScript({ path: path.join(__dirname, "..", "stubs", f) });
  if (!intros)
    await p.addInitScript(() => {
      try {
        if (!localStorage.getItem("ka-doc-settings"))
          localStorage.setItem(
            "ka-doc-settings",
            JSON.stringify({
              app: "kinetic-arena",
              doc: "settings",
              version: 2,
              data: { settings: { intros: false }, keys: {}, pad: {} },
            })
          );
      } catch (e) {}
    });
  const three =
    realThree && process.env.THREE_PATH
      ? fs.readFileSync(process.env.THREE_PATH, "utf8")
      : fs.readFileSync(path.join(__dirname, "..", "stubs", "three-browser.js"), "utf8");
  await p.route("**/three.min.js", r => r.fulfill({ contentType: "application/javascript", body: three }));
  await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
  await p.goto((http ? "http://ka.test/index.html" : GAME) + hash);
  return p;
}
/** close a tab the way a browser does: pagehide first (the game says goodbye), then close */
async function closeTab(p) {
  try {
    await p.evaluate(() => dispatchEvent(new Event("pagehide")));
    await p.waitForTimeout(150);
  } catch (e) {}
  await p.close();
}
const text = (p, s) =>
  p.evaluate(s => {
    const e = document.querySelector(s);
    return e ? e.textContent : null;
  }, s);
const visible = (p, s) =>
  p.evaluate(s => {
    const e = document.querySelector(s);
    return !!e && !e.hidden && !e.closest("[hidden]");
  }, s);
const roster = p =>
  p.evaluate(() => {
    const tb = document.createElement("tbody");
    KA.EXT.scores(tb);
    return [...tb.rows].map(r => r.cells[0].textContent);
  });
module.exports = { launch, open, text, visible, roster, ROOT, closeTab };
