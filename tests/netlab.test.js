/* The network lab at CI size: three separate browser processes form a room over the lab relay with bad
   links (75 ms each way, ±25 jitter, 3% loss, 1.5 Mbit/s), play short arena and capture-the-flag
   matches with automated players, and lose their host. tools/net-lab.js runs the full lab.
     node tests/netlab.test.js           NETLAB_JSON=out.json also writes the report */
const fs = require("fs");
const { check, finish } = require("./lib/check.js");
const { runLab, markdown } = require("./lib/netlab.js");
(async () => {
  let R = null;
  try {
    R = await runLab({
      n: 3,
      modes: ["arena", "ctf"],
      profile: "bad",
      secs: 20,
      /* enough hit claims for the false rejection rate to mean something */
      minClaims: 20,
      maxSecs: 60,
      migrate: true,
      log: s => console.log("  " + s.slice(0, 220)),
    });
  } catch (e) {
    check(false, "lab run", String(e).split("\n")[0]);
  }
  if (R) {
    console.log(markdown(R).split("\n").slice(0, 8).join("\n"));
    if (process.env.NETLAB_JSON) fs.writeFileSync(process.env.NETLAB_JSON, JSON.stringify(R, null, 1));
    for (const [mode, r] of Object.entries(R.modes)) {
      if (!check(!r.error, `${mode}: the room plays a match`, r.error)) continue;
      check(r.pos.pairs >= 2, `${mode}: every instance draws the others`, r.pos.pairs);
      check(
        r.pos.p95ErrM != null && r.pos.p95ErrM <= 1.2 && r.pos.popsPerMin <= 20,
        `${mode}: remote pilots drawn within 1.2 m (95%) without popping, on bad links`,
        r.pos
      );
      check(
        r.hits.claimed < 5 || r.hits.falseRejectRate <= 0.15,
        `${mode}: honest hits are not rejected (bad links)`,
        r.hits
      );
      check(r.kills.notShown <= 1, `${mode}: every kill reaches every player`, r.kills);
      if (mode !== "arena")
        check(
          r.desync.rate != null && r.desync.rate <= 0.05,
          `${mode}: clients agree with the host`,
          r.desync
        );
      check(
        !!r.migration && r.migration.ms > 0 && r.migration.ms < 12000 && r.migration.hosts === 1,
        `${mode}: the room carries on when the host leaves`,
        r.migration
      );
      const errs = r.instances.flatMap(x => x.errors);
      check(errs.length === 0, `${mode}: no page errors`, errs.slice(0, 3));
    }
  }
  finish("netlab");
})();
