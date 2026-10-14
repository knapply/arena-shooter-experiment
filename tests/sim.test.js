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
/* Hadal Station: capture the flag gets pulls and runs, and team deathmatch on it (flags off) finishes */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 5, map: "hadal" });
  let grabs = 0;
  G.onEvent = t => {
    if (t === "flagTaken") grabs++;
  };
  G.start();
  for (let i = 0; i < 30 * 180 && !G.over; i++) G.step(1 / 30);
  check(!G.tdm && grabs > 0, "capture the flag on Hadal Station pulls flags", grabs);
  K.STORE.setBackend(K.STORE.memoryBackend());
  const H = CTF.Game({ mode: "sim", render: false, seed: 5, map: "hadal", tdm: true, scoreLimit: 25 });
  H.start();
  while (!H.over && H.t < 900) H.step(1 / 30);
  check(
    H.tdm && H.flags.length === 0 && Math.max(H.teams[0].score, H.teams[1].score) === 25,
    "team deathmatch on Hadal Station: kills score and the match finishes",
    { score: H.teams.map(t => t.score), t: H.t | 0 }
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
/* blast gates (world/gates.js) on Twin Foundry: the AI paths through an open gate and around a shut one,
   a match with gates replays exactly, and nobody ends up inside a gate */
{
  const NAV = CTF.NAV;
  const G = CTF.Game({ mode: "sim", render: false, seed: 5, gates: true });
  const mid = K.GATES.live.find(g => g.id === "gate-mid"),
    b = mid.boxes[0];
  const through = path =>
    path.some(c => {
      const q = NAV.pos(c);
      return q.x > b.x0 - 0.5 && q.x < b.x1 + 0.5 && q.z > b.z0 - 0.5 && q.z < b.z1 + 0.5;
    });
  const route = () => NAV.path(NAV.nearest(0, -24, 0), NAV.nearest(0, -12, 0));
  /* at 5 s every gate is open; at 9 s the mid gate is about to rise (the AI treats it as shut) */
  K.gatesAt(5, true);
  const open = route();
  K.gatesAt(9, true);
  const shut = route();
  check(open && through(open) && open.length < 16, "the AI paths through an open gate", open && open.length);
  check(
    shut && !through(shut) && shut.length > open.length,
    "the AI paths round a gate about to shut",
    shut && shut.length
  );
  K.gatesAt(23.5, true);
  check(through(route()), "and through it again once it is down");
  void G;
  const run = () => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const M = CTF.Game({ mode: "sim", render: false, seed: 9, gates: true });
    const log = [];
    let inside = 0,
      crossed = 0;
    const side = new Map();
    M.onEvent = (t, d) => {
      if (t === "kill") log.push([M.t.toFixed(3), d.killer && d.killer.idx, d.victim.idx]);
    };
    M.start();
    for (let n = 0; n < 30 * 90 && !M.over; n++) {
      M.step(1 / 30);
      for (const a of M.agents) {
        if (!a.alive) continue;
        const p = a.pos;
        for (const g of K.GATES.live)
          for (const x of g.boxes)
            if (
              g.lift > 0 &&
              p.x > x.x0 - 0.3 &&
              p.x < x.x1 + 0.3 &&
              p.z > x.z0 - 0.3 &&
              p.z < x.z1 + 0.3 &&
              p.y < x.y1 - 0.05
            )
              inside++;
        /* crossings of the mid gate line between the wing walls */
        if (Math.abs(p.x) < 9) {
          const s = Math.sign(p.z - b.z0);
          if (side.has(a) && side.get(a) !== s && Math.abs(p.z - b.z0) < 2) crossed++;
          side.set(a, s);
        } else side.delete(a);
      }
    }
    const lifts = K.GATES.live.map(g => g.lift.toFixed(4));
    return {
      sig: JSON.stringify([log, lifts, M.agents.map(a => a.body.pos.toArray().map(v => v.toFixed(4)))]),
      inside,
      crossed,
    };
  };
  const r1 = run(),
    r2 = run();
  check(r1.sig === r2.sig, "a match with gates replays exactly", r1.sig.length);
  check(r1.inside === 0, "no pilot is ever inside a raised gate", r1.inside);
  check(r1.crossed > 0, "the AI goes through the mid gate while it is open", r1.crossed);
  K.gatesAt(0, false);
}
finish("sim");
