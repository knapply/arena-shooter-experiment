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
async function open(ctx, { tag = "", init = [], realThree = false, hash = "" } = {}) {
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", e => p.errors.push(tag + " " + e.message));
  p.on("console", m => {
    if (m.type() === "error") p.errors.push(tag + " console: " + m.text());
  });
  for (const f of init) await p.addInitScript({ path: path.join(__dirname, "..", "stubs", f) });
  const three =
    realThree && process.env.THREE_PATH
      ? fs.readFileSync(process.env.THREE_PATH, "utf8")
      : fs.readFileSync(path.join(__dirname, "..", "stubs", "three-browser.js"), "utf8");
  await p.route("**/three.min.js", r => r.fulfill({ contentType: "application/javascript", body: three }));
  await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
  await p.goto(GAME + hash);
  return p;
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
module.exports = { launch, open, text, visible, roster, ROOT };
