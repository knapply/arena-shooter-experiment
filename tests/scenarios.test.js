/* Scenario tests: movement feel, hit registration and mode rules, scripted and run headlessly.
   The movement numbers are the sandbox's current "feel contract": a change to them should be a
   deliberate tuning change (update the range here in the same commit), never an accident. */
const { check, finish } = require("./lib/check.js");
const { scenario, shoot, K, CTF } = require("./lib/scenario.js");
const t0 = Date.now();
/* an open runway in the arena: start at (-30, -6) running +x */
const RUN = [-30, 0, -6],
  EAST = 1.5 * Math.PI;
const ran = r => Math.hypot(r.P.a.pos.x - RUN[0], r.P.a.pos.z - RUN[2]);
const between = (v, lo, hi) => v >= lo && v <= hi;
const fix = v => +v.toFixed(2);

/* ---------- movement ---------- */
{
  const walk = ran(
    scenario({ pilots: { a: { pos: RUN, yaw: EAST } }, seconds: 1, input: () => ({ a: { f: 1 } }) })
  );
  check(between(walk, 5.5, 6.8), "walking covers ~6 m in a second", fix(walk));
  const sprint = scenario({
    pilots: { a: { pos: RUN, yaw: EAST } },
    seconds: 2,
    input: () => ({ a: { f: 1, sprint: true } }),
  });
  const top = Math.hypot(sprint.P.a.vel.x, sprint.P.a.vel.z);
  check(between(top, 8.5, 9.5), "sprint top speed ~9 m/s", fix(top));
  const strafe = ran(
    scenario({ pilots: { a: { pos: RUN, yaw: 0 } }, seconds: 1, input: () => ({ a: { s: 1 } }) })
  );
  check(Math.abs(strafe - walk) < 0.3, "strafing is as fast as running forward", fix(strafe));
  const w06 = ran(
    scenario({ pilots: { a: { pos: RUN, yaw: EAST } }, seconds: 0.6, input: () => ({ a: { f: 1 } }) })
  );
  const th06 = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: EAST } },
      seconds: 0.6,
      input: t => ({ a: { f: 1, thrust: t < 0.01 } }),
    })
  );
  check(th06 > w06 * 1.8, "thrust more than doubles short-range movement", {
    thrust: fix(th06),
    walk: fix(w06),
  });
  let apex = 0;
  const jump = scenario({
    pilots: { a: { pos: RUN, yaw: 0 } },
    seconds: 1.5,
    input: t => ({ a: { jumpP: t < 0.01 } }),
    every: (t, P) => (apex = Math.max(apex, P.a.pos.y)),
  });
  check(
    between(apex, 1.0, 1.3) && jump.events.some(e => e.type === "land"),
    "jump reaches ~1.1 m and lands",
    fix(apex)
  );
  const slide = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: EAST } },
      seconds: 2.2,
      input: t => ({ a: { f: 1, sprint: true, crouchP: Math.abs(t - 1.2) < 0.005, crouch: t > 1.2 } }),
    })
  );
  const noSlide = ran(
    scenario({
      pilots: { a: { pos: RUN, yaw: EAST } },
      seconds: 2.2,
      input: () => ({ a: { f: 1, sprint: true } }),
    })
  );
  check(slide >= noSlide - 0.5, "sliding out of a sprint keeps your momentum", {
    slide: fix(slide),
    run: fix(noSlide),
  });
  const pound = scenario({
    pilots: { a: { pos: [-30, 10, -6], air: true, pitch: -1.2 } },
    seconds: 2,
    input: t => ({ a: { crouchP: t < 0.01, crouch: t < 0.65 } }),
  });
  const slam = pound.events.find(e => e.type === "slam");
  check(!!slam && slam.t < 1.3, "ground pound charges, dives and slams", slam && fix(slam.t));
  const tap = scenario({
    pilots: { a: { pos: [-30, 10, -6], air: true } },
    seconds: 2,
    input: t => ({ a: { crouchP: t < 0.01, crouch: t < 0.2 } }),
  });
  check(!tap.events.some(e => e.type === "slam"), "releasing early cancels the pound");
}

/* ---------- hit registration ---------- */
{
  const T = scenario({
    pilots: { b: { pos: [-22, 0, 10] }, c: { pos: [-20, 0, 10], crouch: true } },
    seconds: 0.05,
  }).P;
  T.c.h = K.H_CROUCH;
  const headY = T.b.pos.y + T.b.h - 0.24;
  const head = shoot([-22, 1.6, -10], [-22, headY, 10], { b: T.b });
  const body = shoot([-22, 1.6, -10], [-22, T.b.pos.y + 1.0, 10], { b: T.b });
  check(head && head.id === "b" && head.head, "a shot at the head is a headshot at 20 m", head);
  check(body && body.id === "b" && !body.head, "a shot at the chest is a body shot", body);
  const over = shoot([-20, 1.6, -10], [-20, headY, 10], { c: T.c });
  check(
    over === null || over === "world" || !over.head,
    "standing head height passes over a crouched pilot",
    over
  );
  const wide = shoot([-22, 1.6, -10], [-21.3, headY, 10], { b: T.b });
  check(wide === null || wide === "world", "a shot 0.7 m wide misses", wide);
  const wall = shoot([0, 1.5, -20], [0, 1.5, 20], {
    c: scenario({ pilots: { c: { pos: [0, 0, 20] } }, seconds: 0.05 }).P.c,
  });
  check(wall === "world", "the central core blocks shots", wall);
}

/* ---------- capture-the-flag rules ---------- */
{
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed: 1 });
  const ev = [];
  G.onEvent = (t, d) => ev.push(t);
  G.start();
  for (let i = 0; i < 30; i++) G.step(1 / 30);
  const a = G.agents.find(x => x.team === 0);
  const hold = (pos, n) => {
    for (let i = 0; i < n; i++) {
      a.body.pos.copy(pos);
      a.body.vel.set(0, 0, 0);
      a.body.shield = 70;
      a.body.health = 45;
      G.step(1 / 30);
    }
  };
  hold(CTF.FLAG_HOME[1], 6);
  check(
    G.flags[1].state === "carried" && G.flags[1].carrier === a,
    "touching the enemy flag picks it up",
    G.flags[1].state
  );
  const s0 = G.teams[0].score;
  if (G.flags[0].state === "home") {
    hold(CTF.FLAG_HOME[0], 6);
    check(G.teams[0].score === s0 + 1 && ev.includes("capture"), "bringing it home scores", G.teams[0].score);
    check(G.flags[1].state === "home", "the captured flag resets to its base", G.flags[1].state);
  } else check(false, "own flag stayed home for the capture test", G.flags[0].state);
  /* a carrier who dies drops the flag; it returns home after 15 s untouched */
  hold(CTF.FLAG_HOME[1], 6);
  /* bench everyone else so no defender returns it by touch */
  for (const x of G.agents)
    if (x !== a) {
      x.dead = true;
      x.body.dead = true;
      x.respawnAt = 1e9;
    }
  G.kill(a, null, "rifle", false);
  a.respawnAt = 1e9;
  G.step(1 / 30);
  check(G.flags[1].state === "dropped", "a carrier's death drops the flag", G.flags[1].state);
  for (let i = 0; i < 16 * 30 && G.flags[1].state === "dropped"; i++) G.step(1 / 30);
  check(
    G.flags[1].state === "home" && ev.includes("flagReset"),
    "a dropped flag resets after 15 s",
    ev.slice(-4)
  );
}
check(Date.now() - t0 < 15000, "scenarios run in seconds", Date.now() - t0 + " ms");
finish("scenarios");
