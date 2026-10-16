/* Headless matches: capture the flag (two full AI-vs-AI matches with destruction and the sniper pickup),
   then every other mode on every map it plays on, each replayed from its seed. */
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
/* blast gates (world/gates.js) on Twin Foundry: the AI paths through an open gate and around a shut one,
   a match with gates replays exactly, and nobody ends up inside a gate */
{
  const NAV = CTF.NAV;
  const G = CTF.Game({ mode: "sim", render: false, seed: 5, gates: true, map: "ctf" });
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
  /* a shut gate low enough to jump onto is a ledge for the AI: the path climbs over it (a jump edge) */
  mid.h = 2;
  K.gatesAt(9, true);
  const low = route();
  check(
    low && through(low) && low.some(c => Math.abs(NAV.top[c] - 2) < 0.01),
    "the AI climbs over a shut gate low enough to jump onto",
    low && low.length
  );
  K.gatesAt(23.5, true);
  mid.h = 3.9;
  void G;
  const run = () => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    /* (seed 5: pilots cross the mid gate in most matches but not all; this one has several crossings) */
    const M = CTF.Game({ mode: "sim", render: false, seed: 5, gates: true, map: "ctf" });
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
/* every mode on every map it plays on: a full match headless that ends with a winner, and the same
   seed replaying the same match */
{
  const MODES = [
    ["slayer", "arena"],
    ["slayer", "ctf"],
    ["ffa", "arena"],
    ["ffa", "ctf"],
    ["oddball", "arena"],
    ["oddball", "ctf"],
  ];
  const play = (rules, map, seed, cap) => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({ mode: "sim", render: false, seed, rules, map });
    const ev = {},
      log = [],
      /* where each skull pod came down, and how close the nearest pilot stood when it was picked */
      spots = [];
    G.onEvent = (t, d) => {
      if (t === "ballPod") spots.push([d.pos.x, d.pos.y, d.pos.z]);
      if (t === "ballReset") {
        const h = CTF.BALL_HOME;
        const near = Math.min(
          ...G.agents.filter(a => a.alive).map(a => Math.hypot(a.pos.x - h.x, a.pos.z - h.z))
        );
        log.push([G.t.toFixed(3), "reset", near >= 4 ? "clear" : "near"]);
      }
      ev[t] = (ev[t] || 0) + 1;
      /* pilots by team and slot (ids count up across matches) */
      const who = a => (a ? a.team + "." + a.idx : "-");
      if (t === "kill") log.push([G.t.toFixed(3), who(d.killer), who(d.victim), d.type]);
      if (t === "ballTaken") log.push([G.t.toFixed(3), "ball", who(d.by)]);
    };
    G.start();
    for (let n = 0; n < cap * 30 && !G.over; n++) G.step(1 / 30);
    return {
      G,
      ev,
      spots,
      log,
      sig: JSON.stringify([
        spots,
        log,
        G.teams.map(t => [t.score, +t.held.toFixed(3)]),
        G.agents.map(a => a.body.pos.toArray().map(v => v.toFixed(4))),
      ]),
    };
  };
  for (const [rules, map] of MODES) {
    const t0 = Date.now();
    const r = play(rules, map, 21, 900);
    const G = r.G;
    const scores = G.teams.map(t => (G.ball ? Math.round(t.held) : t.score));
    check(
      G.over && (G.winner >= 0 || G.t >= G.timeLimit - 0.1) && (r.ev.kill || 0) > 20,
      `${rules} on ${map} plays a whole match headless`,
      `winner ${G.winner}, ${scores.join("-")} in ${G.t | 0}s, ${r.ev.kill} kills, ${Date.now() - t0}ms`
    );
    if (G.ball)
      check(
        (r.ev.ballTaken || 0) >= 2 && (r.ev.ballPod || 0) >= 1,
        `${rules} on ${map}: the skull comes down by pod and changes hands`,
        { taken: r.ev.ballTaken, pods: r.ev.ballPod, drops: r.ev.ballDrop }
      );
    if (G.ball) {
      /* somewhere new each time: one of the map's skull places, 15 m or more from the last, never
         picked within 4 m of a pilot */
      const all = CTF.skullSpots();
      const on = list => list.every(p => all.some(q => q[0] === p[0] && q[2] === p[2]));
      const clear = r.log.filter(l => l[1] === "reset").every(l => l[2] === "clear");
      /* and twelve drops in a row from a fresh match: varied, apart, the same again from the same seed */
      const drops = seed => {
        K.STORE.setBackend(K.STORE.memoryBackend());
        const M = CTF.Game({ mode: "sim", render: false, seed, rules, map });
        M.start();
        const out = [];
        for (let i = 0; i < 12; i++) {
          M.nextBallSpot();
          out.push([CTF.BALL_HOME.x, CTF.BALL_HOME.y, CTF.BALL_HOME.z]);
        }
        return out;
      };
      const d1 = drops(41),
        d2 = drops(41);
      const apart = d1.every((p, i) => !i || Math.hypot(p[0] - d1[i - 1][0], p[2] - d1[i - 1][2]) >= 15);
      const places = new Set(d1.map(p => p[0] + "," + p[2])).size;
      check(
        on(r.spots) &&
          on(d1) &&
          clear &&
          apart &&
          places >= 4 &&
          JSON.stringify(d1) === JSON.stringify(d2) &&
          all.length >= 8,
        `${rules} on ${map}: the skull drops somewhere new each time (seeded), never on a pilot`,
        { choices: all.length, places, apart, clear, same: JSON.stringify(d1) === JSON.stringify(d2) }
      );
    }
    const a = play(rules, map, 31, 60),
      b = play(rules, map, 31, 60);
    check(a.sig === b.sig, `${rules} on ${map}: the same seed replays the same match`, a.sig.length);
  }
}
/* a map memory (what the AI learned on the map before) keeps matches deterministic: the same memory and
   seed replay the same match */
{
  const learn = () => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const T = CTF.Game({ mode: "sim", render: false, seed: 41, rules: "slayer", map: "arena" });
    const mem = (T.mem = new CTF.MapMemory(CTF.MAP, null));
    T.start();
    for (let i = 0; i < 90 * 30 && !T.over; i++) T.step(1 / 30);
    mem.commit();
    return mem.toJSON();
  };
  const saved = learn();
  check(saved.f.length > 10 && saved.s.length > 10, "a match teaches the map memory", {
    fights: saved.f.length / 2,
    seen: saved.s.length / 2,
  });
  const run = () => {
    K.STORE.setBackend(K.STORE.memoryBackend());
    const G = CTF.Game({
      mode: "sim",
      render: false,
      seed: 42,
      rules: "slayer",
      map: "arena",
      memory: new CTF.MapMemory(K.MAPS.arena, saved),
    });
    const log = [];
    G.onEvent = (t, d) =>
      t === "kill" &&
      log.push([
        G.t.toFixed(3),
        d.killer && d.killer.team + "." + d.killer.idx,
        d.victim.team + "." + d.victim.idx,
      ]);
    G.start();
    for (let i = 0; i < 60 * 30 && !G.over; i++) G.step(1 / 30);
    return JSON.stringify([log, G.agents.map(a => a.body.pos.toArray().map(v => v.toFixed(4)))]);
  };
  const a = run(),
    b = run();
  check(a === b, "with a map memory, the same seed replays the same match", a.length);
}
finish("sim");
