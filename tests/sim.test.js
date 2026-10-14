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
  /* seeded, so the test is the same every run (an unseeded 8-minute stalemate is possible) */
  const G = CTF.Game({ mode: "sim", render: false, seed: 1 + m });
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
  /* ...even after other matches broke cover in between (destruction and the AI's walkable grid are
     restored exactly, so a match never depends on what was played before it) */
  const long = seed => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed });
    G.start();
    for (let n = 0; n < 30 * 150 && !G.over; n++) G.step(1 / 30);
  };
  long(101);
  long(7);
  check(run(42) === a, "a match plays the same after other matches broke cover");
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
/* team deathmatch on the arena (the AI on a map without flags): kills score, the match finishes, and
   capture the flag still plays normally afterwards */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 3, map: "arena" });
  let kills = 0;
  G.onEvent = t => {
    if (t === "kill") kills++;
  };
  G.start();
  while (!G.over) G.step(1 / 30);
  const top = Math.max(G.teams[0].score, G.teams[1].score);
  check(
    G.tdm && G.flags.length === 0 && top === G.scoreLimit && kills >= top,
    "team deathmatch on the arena: kills score and the match finishes",
    { score: G.teams.map(t => t.score), kills, t: G.t | 0, nav: CTF.NAV.mapId }
  );
  K.STORE.setBackend(K.STORE.memoryBackend());
  const H = CTF.Game({ mode: "sim", render: false, seed: 1 });
  let flags = 0;
  H.onEvent = t => {
    if (t === "flagTaken") flags++;
  };
  H.start();
  /* up to 4 of the match's 8 minutes, until the first grab (this seed's first comes at 3 minutes) */
  for (let i = 0; i < 30 * 240 && !H.over && !flags; i++) H.step(1 / 30);
  check(
    !H.tdm && H.flags.length === 2 && flags > 0,
    "capture the flag after it still has its flags and pulls them",
    flags
  );
}
/* the AI fires at the weapon's real rate even though it thinks in 30 Hz steps (the carbine's 0.1 s
   interval used to round up to 4 steps: 7.5 rounds a second) */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 3, map: "arena", scoreLimit: 1e9, lock: "carbine" });
  const last = new Map(),
    gaps = [];
  G.onEvent = (t, d) => {
    if (t !== "shot") return;
    const p = last.get(d.by);
    if (p != null && G.t - p < 0.15) gaps.push(G.t - p);
    last.set(d.by, G.t);
  };
  G.start();
  for (let i = 0; i < 30 * 30; i++) G.step(1 / 30);
  const rate = gaps.length / gaps.reduce((a, b) => a + b, 0);
  check(
    gaps.length > 100 && rate > 9,
    "AI carbine fire holds close to 10 rounds a second (pauses to re-aim aside)",
    rate.toFixed(2)
  );
}
finish("sim");
