/* Quick looks at the trailer while working on it (the full recording is tools/record-trailer.js).
     node tools/trailer-preview.js audio [out.wav]       the soundtrack alone (score and effects)
     node tools/trailer-preview.js check                 run it without drawing; print each scene's beats
                                                         (missed ones marked), collisions,
                                                         camera-in-geometry frames and the event log
     THREE_PATH=... node tools/trailer-preview.js stills 3,12.5,40 [out.jpg]
                                                         a contact sheet of single frames
     THREE_PATH=... node tools/trailer-preview.js clip 11 15.5 [fps] [out.mp4]
                                                         a small video of a stretch, with the score
   Stills and clips render at 640x360 with real WebGL, so they need three.js (THREE_PATH: three.module.min.js, three.core.min.js beside it). */
const { launch, open } = require("../tests/lib/browser.js");
const { trailerWav } = require("./trailer-audio.js");
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  { execFileSync } = require("child_process");
const [mode = "check", ...args] = process.argv.slice(2);
(async () => {
  const draw = mode === "stills" || mode === "clip";
  const b = await launch({ gpu: draw });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  const p = await open(ctx, { realThree: draw, trailer: true });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    KA.SET.dynRes = false;
    KA.applySettings();
    KA.trailer.record();
  });
  if (mode === "audio") {
    /* the whole soundtrack (score and effects) without drawing anything */
    await p.evaluate(() => {
      const TR = KA.trailer;
      while (TR.t < TR.END) TR.step(1 / 30, false);
    });
    const out = args[0] || path.join(os.tmpdir(), "trailer.wav");
    fs.writeFileSync(out, await trailerWav(p, { sr: 22050 }));
    console.log("wrote " + out);
  } else if (mode === "check") {
    const r = await p.evaluate(() => {
      const TR = KA.trailer,
        samples = [];
      while (TR.t < TR.END) {
        TR.step(1 / 30, false);
        if (Math.abs(TR.t * 2 - Math.round(TR.t * 2)) < 0.017)
          samples.push(
            TR.t.toFixed(1) +
              " " +
              KA.camera.position
                .toArray()
                .map(v => v.toFixed(1))
                .join(",")
          );
      }
      return { diag: TR.diag, samples };
    });
    console.log("beats:");
    for (const b of r.diag.beats) console.log(`  ${b.ok ? "ok  " : "MISS"} ${b.t}	${b.shot}: ${b.what}`);
    console.log("bumps:", JSON.stringify(r.diag.bumps));
    console.log("camera inside geometry:", JSON.stringify(r.diag.cam.slice(0, 30)), r.diag.cam.length);
    console.log("events:");
    for (const e of r.diag.log) console.log(`  ${e.t}\t${e.st}\t${e.who}\t${e.ev}`);
    if (args.includes("-v")) console.log(r.samples.join("\n"));
  } else if (mode === "stills") {
    const ts = String(args[0] || "3")
        .split(",")
        .map(Number),
      out = args[1] || path.join(os.tmpdir(), "trailer-stills.jpg"),
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stills-"));
    let i = 0;
    for (const t of ts.sort((a, b) => a - b)) {
      await p.evaluate(t => {
        KA.trailer.seek(t - 1 / 30);
        KA.trailer.step(1 / 30);
      }, t);
      await p.screenshot({
        path: path.join(tmp, String(i++).padStart(3, "0") + ".jpg"),
        type: "jpeg",
        quality: 90,
      });
    }
    const cols = Math.min(3, ts.length);
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-i",
      path.join(tmp, "%03d.jpg"),
      "-vf",
      `tile=${cols}x${Math.ceil(ts.length / cols)}:padding=4`,
      "-frames:v",
      "1",
      out,
    ]);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("wrote " + out);
  } else if (mode === "clip") {
    const t0 = +args[0],
      t1 = +args[1],
      fps = +(args[2] || 15),
      out = args[3] || path.join(os.tmpdir(), "trailer-clip.mp4"),
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clip-"));
    await p.evaluate(t => KA.trailer.seek(t), t0);
    const n = Math.ceil((t1 - t0) * fps);
    for (let i = 0; i < n; i++) {
      await p.evaluate(dt => KA.trailer.step(dt), 1 / fps);
      await p.screenshot({
        path: path.join(tmp, String(i).padStart(5, "0") + ".jpg"),
        type: "jpeg",
        quality: 85,
      });
    }
    /* the score and the sound effects for the same stretch, rendered offline */
    const wav = await trailerWav(p, { sr: 22050, t0, t1 });
    fs.writeFileSync(path.join(tmp, "score.wav"), wav);
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(fps),
      "-i",
      path.join(tmp, "%05d.jpg"),
      "-i",
      path.join(tmp, "score.wav"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      out,
    ]);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("wrote " + out);
  }
  if (p.errors.length) console.error(p.errors);
  await b.close();
})();
