#!/usr/bin/env node
/* Development server: rebuilds the game from src/ on every change and reloads open browser tabs.
     node tools/dev-server.mjs [port]      then open http://localhost:5173
   The dev build is unminified and kept in memory; the committed index.html is not touched. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { build } from "../build.mjs";
import { ROOT, SRC } from "./modules.mjs";

const PORT = +(process.argv[2] || process.env.PORT || 5173);
const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".html": "text/html",
};
const RELOAD = `<script>new EventSource("/__reload").onmessage=()=>location.reload();</script>`;
let page = "",
  error = "";
const clients = new Set();
function rebuild() {
  const t0 = Date.now();
  try {
    page = build({ dev: true }).html.replace("</body>", RELOAD + "</body>");
    error = "";
    console.log(`rebuilt in ${Date.now() - t0} ms`);
  } catch (e) {
    error = e.message;
    console.error(e.message);
  }
  for (const res of clients) res.write("data: reload\n\n");
}
rebuild();
let timer = null;
fs.watch(SRC, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 60);
});
http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/__reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url === "/" || url === "/index.html") {
      res.writeHead(error ? 500 : 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(error ? `<pre>${error.replace(/</g, "&lt;")}</pre>${RELOAD}` : page);
      return;
    }
    const file = path.normalize(path.join(ROOT, url));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () =>
    console.log(`dev server on http://localhost:${PORT}  (edit src/ and the page reloads)`)
  );
