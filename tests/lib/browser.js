/* Shared Playwright setup. Env:
   CPU_SLOW     throttle every page's CPU by this factor (find timing-sensitive tests)
   CHROME_PATH  use a specific Chromium build
   THREE_PATH   serve a real three.min.js (r128) from disk instead of the stub (enables render tests) */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..", "..");
const GAME = "file://" + path.join(ROOT, "index.html");
/* the trailer build (out/trailer.html: the game plus the cinematic trailer), rebuilt once per run */
let trailerBuilt = false;
function trailerPage() {
  if (!trailerBuilt) {
    require("child_process").execFileSync(process.execPath, [path.join(ROOT, "build.mjs"), "--trailer"], {
      cwd: ROOT,
    });
    trailerBuilt = true;
  }
  return "file://" + path.join(ROOT, "out", "trailer.html");
}
async function launch(opts = {}) {
  const args = opts.gpu
    ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    : [];
  args.push("--mute-audio");
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
/* tests start with match intros and the opening pod drop off (they would hold input for a few
   seconds after every deploy); pass intros: true or drops: true to test them. trailer: true opens
   the trailer build instead of the game */
async function open(
  ctx,
  {
    tag = "",
    init = [],
    realThree = false,
    hash = "",
    http = false,
    intros = false,
    drops = false,
    trailer = false,
  } = {}
) {
  if (http) await serveRepo(ctx);
  const p = await ctx.newPage();
  /* CPU_SLOW=4 throttles every page's CPU, to run the tests the way a slow CI machine does */
  if (process.env.CPU_SLOW)
    await (
      await ctx.newCDPSession(p)
    ).send("Emulation.setCPUThrottlingRate", { rate: +process.env.CPU_SLOW });
  p.errors = [];
  p.on("pageerror", e => p.errors.push(tag + " " + e.message));
  p.on("console", m => {
    if (m.type() === "error") p.errors.push(tag + " console: " + m.text());
  });
  for (const f of init) await p.addInitScript({ path: path.join(__dirname, "..", "stubs", f) });
  if (!intros || !drops)
    await p.addInitScript(
      o => {
        try {
          if (!localStorage.getItem("ka-doc-settings"))
            localStorage.setItem(
              "ka-doc-settings",
              JSON.stringify({
                app: "kinetic-arena",
                doc: "settings",
                version: 2,
                data: { settings: o, keys: {}, pad: {} },
              })
            );
        } catch (e) {}
      },
      { intros, dropIn: drops }
    );
  const three =
    realThree && process.env.THREE_PATH
      ? fs.readFileSync(process.env.THREE_PATH, "utf8")
      : fs.readFileSync(path.join(__dirname, "..", "stubs", "three-browser.js"), "utf8");
  await p.route("**/three.min.js", r => r.fulfill({ contentType: "application/javascript", body: three }));
  await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
  await p.goto((trailer ? trailerPage() : http ? "http://ka.test/index.html" : GAME) + hash);
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
/** wait for fn(arg) in the page to be true (false after the timeout): waits on game state, not time,
    so a slow machine (CI's software renderer) only takes longer */
const until = (p, fn, arg, timeout = 30000) =>
  p.waitForFunction(fn, arg, { timeout, polling: 50 }).then(
    () => true,
    () => false
  );
module.exports = { launch, open, text, visible, roster, ROOT, closeTab, until };
