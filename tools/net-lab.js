/* The network lab, by hand: separate game instances (one browser process each) form a room, play real
   matches with automated players, and are measured (tests/lib/netlab.js has the details).
     node tools/net-lab.js                                 4 instances, every mode, good links
     node tools/net-lab.js --n 8 --profile bad             8 instances on bad links
     node tools/net-lab.js --modes ctf,oddball --secs 90   some modes, longer
     node tools/net-lab.js --profile all                   good, wifi, bad, asym and spikes in turn
     node tools/net-lab.js --transport webrtc              real WebRTC with a local signalling server
     node tools/net-lab.js --migrate                       close the host after each mode: migration time
     node tools/net-lab.js --render                        real three.js (THREE_PATH) instead of the stub
   Profiles: good, wifi, bad, asym (the last instance on a bad link), spikes (burst loss, lag spikes).
   Reports (JSON and markdown) go to tools/out/net-lab/. Nothing leaves this machine. */
const path = require("path");
const { runLab, writeReport } = require("../tests/lib/netlab.js");
const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
(async () => {
  const profiles =
    arg("profile", "good") === "all" ? ["good", "wifi", "bad", "asym", "spikes"] : [arg("profile", "good")];
  const out = arg("out", path.join(__dirname, "out", "net-lab"));
  for (const profile of profiles) {
    const R = await runLab({
      n: +arg("n", 4),
      modes: String(arg("modes", "arena,ctf,slayer,ffa,oddball")).split(","),
      profile,
      transport: arg("transport", "relay"),
      secs: +arg("secs", 45),
      render: !!arg("render", false),
      migrate: !!arg("migrate", false),
      log: s => console.log(`[${profile}] ${s}`),
    });
    const base = writeReport(R, out);
    console.log(`report: ${base}.md`);
  }
  /* the local signalling server keeps the process alive otherwise */
  process.exit(0);
})();
