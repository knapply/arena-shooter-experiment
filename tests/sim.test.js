/* Headless CTF: two full AI-vs-AI matches with destruction and the sniper pickup. */
const { check, finish } = require("./lib/check.js");
const CTF = require("./lib/headless.js");
const K = window.KA;
CTF.NAV.build(CTF.buildMap().solids);
let ok = 0;
for (const v of CTF.NAV.ok) ok += v;
check(ok > 4000, "nav grid has walkable cells", ok);
const p = CTF.NAV.path(CTF.NAV.nearest(0, -43, 2.4), CTF.NAV.nearest(0, 43, 2.4));
check(p && p.length > 20, "base-to-base path exists", p && p.length);
/* a fast capture can end a match before anyone reaches the sniper, so pickups are counted across matches */
let pickups = 0,
  magKills = 0,
  carbKills = 0;
for (let m = 0; m < 2; m++) {
  const G = CTF.Game({ mode: "sim", render: false });
  const ev = {};
  const kinds = {};
  let breaks = 0;
  const ob = K.DESTR.onChange;
  K.DESTR.onChange = (b, r) => {
    if (!r) breaks++;
    if (ob) ob(b, r);
  };
  G.onEvent = (t, d) => {
    ev[t] = (ev[t] || 0) + 1;
    if (t === "kill") kinds[d.type] = (kinds[d.type] || 0) + 1;
  };
  let comms = 0;
  G.onComms = () => comms++;
  G.start();
  const t0 = Date.now();
  while (!G.over) G.step(1 / 30);
  const ms = Date.now() - t0;
  check(
    G.over && G.t > 0,
    `match ${m + 1} finishes`,
    `${G.teams[0].score}-${G.teams[1].score} in ${G.t | 0}s, ${ms}ms cpu`
  );
  check((ev.kill || 0) > 40, `match ${m + 1} has combat`, ev.kill);
  check((ev.flagTaken || 0) > 0, `match ${m + 1} flags get pulled`, ev.flagTaken);
  pickups += ev.pickup || 0;
  magKills += kinds.pistol || 0;
  carbKills += kinds.rifle || 0;
  check(comms > 20, `match ${m + 1} team comms`, comms);
  check(breaks > 0, `match ${m + 1} cover gets destroyed`, breaks);
  check(ms < 60000, `match ${m + 1} runs fast enough headless`, ms + "ms");
  K.DESTR.onChange = ob;
}
check(pickups > 0, "the sniper gets picked up", pickups);
check(magKills > 0 && carbKills > 0, "the AI scores kills with both the carbine and the magnum", {
  carbine: carbKills,
  magnum: magKills,
});
/* determinism: same seed and inputs → same match (replays and bug reproduction depend on it) */
{
  const run = seed => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed });
    const log = [];
    G.onEvent = (t, d) => {
      if (t === "kill") log.push([G.t.toFixed(3), d.killer && d.killer.idx, d.victim.idx, d.type]);
    };
    G.start();
    for (let n = 0; n < 30 * 60 && !G.over; n++) G.step(1 / 30);
    return JSON.stringify([log, G.agents.map(a => a.body.pos.toArray().map(v => v.toFixed(4)))]);
  };
  const a = run(42),
    b = run(42),
    c = run(43);
  check(a === b, "same seed replays the same match", a.length);
  check(a !== c, "a different seed plays differently");
}
/* Recruit is the gentle start: a Recruit team loses most fights to Normal */
{
  let kR = 0,
    kN = 0;
  for (let m = 0; m < 2; m++) {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const R = m % 2;
    const G = CTF.Game({
      mode: "sim",
      render: false,
      seed: 300 + m,
      diff: R ? ["normal", "recruit"] : ["recruit", "normal"],
    });
    G.onEvent = (t, d) => {
      if (t === "kill" && d.killer && d.killer.team !== d.victim.team) {
        if (d.killer.team === R) kR++;
        else kN++;
      }
    };
    G.start();
    for (let i = 0; i < 3 * 60 * 30 && !G.over; i++) G.step(1 / 30);
  }
  check(
    kR + kN > 40 && kR / (kR + kN) < 0.4,
    "Recruit bots win well under half their fights against Normal",
    {
      recruit: kR,
      normal: kN,
    }
  );
}
finish("sim");
