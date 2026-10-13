/* Sandbox tuning by simulation: plays headless capture-the-flag matches with small variations of the
   movement, weapon and grenade numbers (the Sandbox settings tab) and measures what each one does to
   the game. Two kinds of match per variant:
     skill   legendary AI vs normal AI   → how much skill decides fights (the skill ceiling)
     even    normal vs normal            → how fights feel for everyone (time to kill, grenade self-kills)
   Each knob is varied one at a time around the defaults; the report lists the effect of each step.
   Matches run in parallel on every CPU core (one worker thread per core; JOBS=n to change).
     node tools/tune.js                 sweep every knob
     node tools/tune.js sbJump sbNadeThrow   only these knobs
     MATCHES=6 MINUTES=4 node tools/tune.js  more samples per variant
     SEED=500 node tools/tune.js              a different set of matches (to check a result holds)
     TRY="sbAccel=80,90" node tools/tune.js sbAccel   try other values
     LOCK=magnum node tools/tune.js sbMagDmg     every AI pilot uses only that weapon: carbine, magnum,
                                                 sniper, rocket or nades (grenades only); several
                                                 (LOCK=carbine,magnum) run the sweep once per lock
     KNOBS=none node tools/tune.js              baselines only
     DIFF=recruit node tools/tune.js            the even matches use this difficulty (default normal)
     MAP=arena node tools/tune.js               team deathmatch on the arena instead of capture the flag
                                                 on Twin Foundry (the arena's own combat, 4 v 4)
     PAIR=normal,recruit node tools/tune.js     the skill matches' better and worse levels
                                                 (default legendary,normal)
     TEAM=1 MAP=arena node tools/tune.js        pilots per team (1 on the arena: one-on-one duels, the
                                                 closest the AI comes to free-for-all)
     node tools/tune.js labBurst modDoors       lab content (docs/PROPOSALS.md) as knobs: 1 turns it on
                                                 (labBurst labScatter labBeam labPulse labWeapons, modDoors
                                                 modSplit on Twin Foundry, modRing modPillars on the arena);
                                                 LOCK=burst, scatter or beam locks a lab weapon
   Besides skill share, time to kill and grenades, every variant reports: the spread of time to kill
   (quartiles), each weapon's share of kills and of time held, how much skill decides fights with each
   weapon (the better team's share of that weapon's kills), captures and time to capture, the share of
   deaths within 3 s of spawning, and lane use in the middle of a lane map.
   Output: a table on stdout and tools/out/tune.json (OUT=name.json). tools/tune-merge.js combines
   several outputs. See docs/TUNING.md for how defaults were chosen. */
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const { Worker, isMainThread, parentPort } = require("worker_threads");
const CTF = require("../tests/lib/headless.js");
const K = window.KA;
const SEED = +(process.env.SEED || 100),
  MATCHES = +(process.env.MATCHES || 4),
  MINUTES = +(process.env.MINUTES || 3),
  EVEN = process.env.DIFF || "normal",
  /* the map (and with it the mode): ctf (capture the flag on Twin Foundry) or arena (team deathmatch) */
  MAPID = process.env.MAP || "ctf",
  /* the skill matches: the better level first */
  PAIR = (process.env.PAIR || "legendary,normal").split(","),
  TEAM = +(process.env.TEAM || 4);
const LOCKS = ["carbine", "magnum", "sniper", "rocket", "nades", "burst", "scatter", "beam"];
/* lab content: a flag in K.LABS, or a map mod in K.LABS.mods */
const lab = k => v => (K.LABS[k] = !!v);
const mod = m => v => {
  K.LABS.mods = K.LABS.mods.filter(x => x !== m);
  if (v) K.LABS.mods.push(m);
};
/* each knob: how to apply a value to the simulation, its default and the values to try */
const W = key => K.WEAPON_DATA.find(w => w.key === key);
const KNOBS = {
  sbRun: { set: v => (K.TUNE.run = v), def: 6.4, try: [5.8, 7] },
  sbSprint: { set: v => (K.TUNE.sprint = v), def: 9, try: [8.2, 9.8] },
  sbAccel: { set: v => (K.TUNE.accel = v), def: 70, try: [50, 90] },
  sbAir: { set: v => (K.TUNE.airAccel = v), def: 18, try: [12, 24] },
  sbJump: { set: v => (K.TUNE.jump = v), def: 7.4, try: [6.8, 8] },
  sbGrav: { set: v => (K.TUNE.grav = v), def: 24, try: [20, 28] },
  sbThrust: { set: v => (K.TUNE.thrust = v), def: 17, try: [14, 20] },
  sbCarbDmg: {
    set: v => Object.assign(W("carbine"), { body: v, head: Math.round(v * (11 / 9)) }),
    def: 9,
    try: [8, 10],
  },
  sbCarbRate: { set: v => (W("carbine").rate = v), def: 0.1, try: [0.09, 0.115] },
  sbCarbSpread: {
    set: v => Object.assign(W("carbine"), { spread: v, adsSpread: v / 3 }),
    def: 0.012,
    try: [0.008, 0.016],
  },
  sbCarbBloom: { set: v => (W("carbine").bloom = v), def: 0.004, try: [0.002, 0.007] },
  sbMagDmg: {
    set: v => Object.assign(W("pistol"), { body: v, head: Math.round(v * 2.5) }),
    def: 23,
    try: [18, 22],
  },
  sbMagRate: { set: v => (W("pistol").rate = v), def: 0.28, try: [0.22, 0.3] },
  sbSnipeDmg: { set: v => (W("sniper").body = v), def: 60, try: [50, 70] },
  sbSnipeRate: { set: v => (W("sniper").rate = v), def: 0.62, try: [0.5, 0.75] },
  sbRocketSplash: { set: v => (W("rocket").splash = v), def: 150, try: [120, 180] },
  sbRocketRadius: { set: v => (W("rocket").radius = v), def: 4.2, try: [3.4, 5] },
  sbNadeThrow: { set: v => (K.NADE_TUNE.throw = v), def: 19, try: [16, 22] },
  sbNadeBounce: { set: v => (K.NADE_TUNE.bounce = v), def: 0.38, try: [0.25, 0.5] },
  sbNadeFuse: { set: v => (K.NADES.frag.fuse = v), def: 2.2, try: [1.8, 2.6] },
  sbNadeRadius: { set: v => (K.NADES.frag.r = v), def: 5, try: [4.2, 5.8] },
  labBurst: { set: lab("burst"), def: 0, try: [1] },
  labScatter: { set: lab("scatter"), def: 0, try: [1] },
  labBeam: { set: lab("beam"), def: 0, try: [1] },
  labPulse: { set: lab("pulse"), def: 0, try: [1] },
  labMelee: { set: lab("melee"), def: 0, try: [1] },
  /* lab weapon numbers (for reworks; use with LOCK or the lab on) */
  labBeamDmg: { set: v => Object.assign(W("beam"), { body: v, head: v }), def: 4, try: [5, 6] },
  labBurstDmg: {
    set: v => Object.assign(W("burst"), { body: v, head: Math.round(v * 2.75) }),
    def: 8,
    try: [7, 9],
  },
  labWeapons: { set: v => ["burst", "scatter", "beam", "pulse"].forEach(k => lab(k)(v)), def: 0, try: [1] },
  modDoors: { set: mod("doors"), def: 0, try: [1] },
  modSplit: { set: mod("split"), def: 0, try: [1] },
  modPads: { set: mod("pads"), def: 0, try: [1] },
  modRing: { set: mod("ring"), def: 0, try: [1] },
  modPillars: { set: mod("pillars"), def: 0, try: [1] },
};
const LAB_KNOBS = Object.keys(KNOBS).filter(k => /^(lab|mod)/.test(k));
/* TRY="sbAccel=80,90;sbRun=6.8" replaces the values tried for those knobs */
for (const part of (process.env.TRY || "").split(";").filter(Boolean)) {
  const [k, vals] = part.split("=");
  if (KNOBS[k]) KNOBS[k].try = vals.split(",").map(Number);
}
/* read the real defaults from the data so the table always starts from what ships */
KNOBS.sbCarbDmg.def = W("carbine").body;
KNOBS.sbCarbRate.def = W("carbine").rate;
KNOBS.sbCarbSpread.def = W("carbine").spread;
KNOBS.sbCarbBloom.def = W("carbine").bloom;
KNOBS.sbMagDmg.def = W("pistol").body;
KNOBS.sbMagRate.def = W("pistol").rate;
KNOBS.sbSnipeDmg.def = W("sniper").body;
KNOBS.sbSnipeRate.def = W("sniper").rate;
KNOBS.sbRocketSplash.def = W("rocket").splash;
KNOBS.sbRocketRadius.def = W("rocket").radius;
KNOBS.sbNadeFuse.def = K.NADES.frag.fuse;
KNOBS.sbNadeRadius.def = K.NADES.frag.r;
for (const [k, f] of [
  ["sbRun", "run"],
  ["sbSprint", "sprint"],
  ["sbAccel", "accel"],
  ["sbAir", "airAccel"],
  ["sbJump", "jump"],
  ["sbGrav", "grav"],
  ["sbThrust", "thrust"],
])
  KNOBS[k].def = K.TUNE_DEF[f];
KNOBS.sbNadeThrow.def = K.NADE_TUNE.throw;
KNOBS.sbNadeBounce.def = K.NADE_TUNE.bounce;
function resetAll() {
  for (const k of Object.keys(KNOBS)) KNOBS[k].set(KNOBS[k].def);
}
/** one match: returns kills by team, captures, times to kill and grenade outcomes */
function match(diff, seed, lock) {
  K.STORE.setBackend(K.STORE.memoryBackend());
  /* team deathmatch plays the full time (a score limit would end matches at different lengths) */
  const G = CTF.Game({
    mode: "sim",
    render: false,
    seed,
    diff,
    lock,
    map: MAPID,
    scoreLimit: MAPID === "arena" ? 1e9 : 0,
    perTeam: TEAM,
  });
  const out = {
    k: [0, 0],
    cap: [0, 0],
    ttk: [],
    nadeKills: 0,
    selfNade: 0,
    kills: 0,
    team: 0,
    /* kills by weapon (all, and by team 0), seconds held by weapon, spawn deaths, flags, lanes */
    wk: {},
    wk0: {},
    held: {},
    spawnDeaths: 0,
    grabs: 0,
    ttc: [],
    lanes: [0, 0, 0],
  };
  const takenAt = new Map();
  G.onEvent = (t, d) => {
    if (t === "kill") {
      out.kills++;
      const v = d.victim,
        k = d.killer;
      const w = d.type || "?";
      if (k && k.team !== v.team) {
        out.wk[w] = (out.wk[w] || 0) + 1;
        if (k.team === 0) out.wk0[w] = (out.wk0[w] || 0) + 1;
      }
      if (v.__sp != null && G.t - v.__sp < 3) out.spawnDeaths++;
      if (k && k.team !== v.team) out.k[k.team]++;
      if (k && k.team === v.team) out.team++;
      if (/frag|stick|plasma|nade/.test(d.type || "")) {
        out.nadeKills++;
        if (k === v) out.selfNade++;
      }
      if (v.__first != null) out.ttk.push(G.t - v.__first);
      v.__first = null;
    } else if (t === "capture") {
      out.cap[d.by ? d.by.team : d.flag ? 1 - d.flag.team : 0]++;
      if (takenAt.has(d.flag)) out.ttc.push(G.t - takenAt.get(d.flag));
      takenAt.delete(d.flag);
    } else if (t === "flagTaken") {
      out.grabs++;
      /* time to capture runs from the grab at the stand */
      if (!takenAt.has(d.flag) && d.flag.pos.distanceTo(CTF.FLAG_HOME[d.flag.team]) < 2)
        takenAt.set(d.flag, G.t);
    } else if (t === "flagReset" || t === "flagReturn") takenAt.delete(d.flag);
  };
  G.start();
  for (const a of G.agents) {
    const sp = a.spawn.bind(a);
    a.spawn = p => {
      a.__sp = G.t;
      return sp(p);
    };
    const on = a.onHit.bind(a);
    a.onHit = (n, type, head, att) => {
      if (a.__first == null || G.t - a.__lastHit > 3) a.__first = G.t;
      a.__lastHit = G.t;
      return on(n, type, head, att);
    };
  }
  const steps = MINUTES * 60 * 30;
  const lanes = !!CTF.MAP.lanes;
  for (let i = 0; i < steps && !G.over; i++) {
    G.step(1 / 30);
    if (i % 30) continue;
    /* once a second: what each pilot holds, and where the ones in the middle of the map are */
    for (const a of G.agents) {
      if (!a.alive) continue;
      const key = K.WEAPON_DATA[a.held()].key;
      out.held[key] = (out.held[key] || 0) + 1;
      if (lanes && Math.abs(a.pos.z) < 30) out.lanes[CTF.worldLane(a.pos.x)]++;
    }
  }
  /* minutes actually played (a capture limit can end a match early) */
  out.min = G.t / 60;
  return out;
}

if (!isMainThread) {
  /* worker: play the matches it is handed, one at a time */
  match(["normal", "normal"], 1, null); /* a throwaway match first: lazy setup happens here */
  parentPort.on("message", job => {
    resetAll();
    if (job.knob) KNOBS[job.knob].set(job.value);
    const r = match(job.diff, job.seed, job.lock);
    parentPort.postMessage({ id: job.id, r });
  });
} else main();

function main() {
  const knobArg = process.argv.slice(2);
  const bad = knobArg.filter(k => !KNOBS[k]);
  if (bad.length) {
    console.error(`unknown knob(s): ${bad.join(" ")}\nknobs: ${Object.keys(KNOBS).join(" ")}`);
    process.exit(1);
  }
  /* a full sweep is the sandbox knobs; lab content runs only when named */
  const names =
    process.env.KNOBS === "none"
      ? []
      : knobArg.length
        ? knobArg
        : Object.keys(KNOBS).filter(k => !LAB_KNOBS.includes(k));
  const locks = (process.env.LOCK || "").split(",").filter(Boolean);
  for (const l of locks)
    if (!LOCKS.includes(l)) {
      console.error(`unknown LOCK ${l} (one of ${LOCKS.join(", ")})`);
      process.exit(1);
    }
  /* variants: the baseline and each knob value, once per lock */
  const variants = [];
  for (const lock of locks.length ? locks : [null]) {
    variants.push({ lock, knob: null, value: null });
    for (const n of names) for (const v of KNOBS[n].try) variants.push({ lock, knob: n, value: v });
  }
  /* jobs: every match of every variant. The same seeds for every variant, so differences come from
     the setting and not from which matches were drawn */
  const jobs = [];
  variants.forEach((vr, vi) => {
    vr.left = MATCHES * 2;
    vr.res = [];
    for (let m = 0; m < MATCHES; m++) {
      const swap = m % 2 === 1;
      const base = { vi, m, knob: vr.knob, value: vr.value, lock: vr.lock };
      jobs.push({ ...base, kind: "skill", diff: swap ? [PAIR[1], PAIR[0]] : [PAIR[0], PAIR[1]] });
      jobs[jobs.length - 1].seed = SEED + m;
      jobs.push({ ...base, kind: "even", diff: [EVEN, EVEN], seed: SEED + 1000 + m });
    }
  });
  jobs.forEach((j, i) => (j.id = i));
  const nWorkers = Math.max(1, Math.min(jobs.length, +(process.env.JOBS || os.availableParallelism())));
  const t0 = Date.now();
  console.log(
    `${variants.length} variants x ${MATCHES * 2} matches (${MINUTES} min each, ${MAPID}, ${TEAM} v ${TEAM}), seed ${SEED}, ${nWorkers} workers` +
      (locks.length ? `, lock ${locks.join(",")}` : "")
  );
  const base = new Map(); /* lock → baseline result */
  const rows = [];
  const lockName = l => l || "none";
  function finish(vr) {
    const r = summarize(vr);
    if (!vr.knob) {
      base.set(vr.lock, r);
      console.log(`baseline [${lockName(vr.lock)}]`, JSON.stringify(r));
      console.log(`  ${JSON.stringify(extra(r))}`);
    } else {
      const b = base.get(vr.lock);
      rows.push({ knob: vr.knob, value: vr.value, def: KNOBS[vr.knob].def, lock: vr.lock, ...r });
      const ds = b ? r.skill - b.skill : 0;
      console.log(
        `${vr.knob.padEnd(13)} ${String(vr.value).padStart(6)} (def ${KNOBS[vr.knob].def}) [${lockName(vr.lock)}]  skill ${r.skill} (${(ds >= 0 ? "+" : "") + ds.toFixed(3)})  ttk ${r.ttk}s  kpm ${r.kpm}  nades ${r.nadeShare} self ${r.selfNade}  tk ${r.teamKills}`
      );
      console.log(`  ${JSON.stringify(extra(r))}`);
    }
  }
  /* variants report in order, so a knob's line always follows its baseline */
  let nextReport = 0;
  function flush() {
    while (nextReport < variants.length && variants[nextReport].left === 0) finish(variants[nextReport++]);
  }
  let next = 0,
    live = nWorkers;
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(__filename, { env: process.env });
    const feed = () => {
      if (next < jobs.length) w.postMessage(jobs[next++]);
      else {
        w.terminate();
        if (--live === 0) done();
      }
    };
    w.on("message", ({ id, r }) => {
      const j = jobs[id],
        vr = variants[j.vi];
      vr.res.push({ j, r });
      vr.left--;
      flush();
      feed();
    });
    w.on("error", e => {
      console.error(e);
      process.exit(1);
    });
    feed();
  }
  function done() {
    flush();
    const baseOut = Object.fromEntries([...base].map(([l, r]) => [lockName(l), r]));
    fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, "out", process.env.OUT || "tune.json"),
      JSON.stringify(
        {
          base: base.get(locks.length ? locks[0] : null),
          bases: baseOut,
          rows,
          MATCHES,
          MINUTES,
          SEED,
          DIFF: EVEN,
          PAIR,
          MAP: MAPID,
          TEAM,
        },
        null,
        1
      )
    );
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
const median = a => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
};
const quart = (a, q) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2) : 0;
};
/** shares of a tally, largest first, to three places */
const shares = o => {
  const n = Object.values(o).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, +(v / n).toFixed(3)])
  );
};
const add = (to, o) => {
  for (const [k, v] of Object.entries(o || {})) to[k] = (to[k] || 0) + v;
};
/** the extra measures in one line (the full set is in the JSON) */
const extra = r => ({
  ttkQ: r.ttkQ,
  kills: r.wShare,
  held: r.held,
  wSkill: r.wSkill,
  spawnDeaths: r.spawnDeaths,
  caps: r.capsPerMatch,
  ttc: r.ttc,
  lanes: r.lanes,
});
/** a variant's matches: skill matches (legendary on team 0, then swapped sides) and even matches */
function summarize(vr) {
  let kL = 0,
    kN = 0,
    capL = 0,
    capN = 0,
    ttk = [],
    nk = 0,
    self = 0,
    kills = 0,
    team = 0,
    minutes = 0,
    spawnDeaths = 0,
    caps = 0,
    grabs = 0,
    nEven = 0;
  const wk = {},
    held = {},
    lanes = [0, 0, 0],
    ttc = [],
    /* skill matches: each weapon's kills, and the better team's */
    swk = {},
    swkL = {};
  /* in match order, so the result doesn't depend on which worker finished first */
  vr.res.sort((a, b) => a.j.id - b.j.id);
  for (const { j, r } of vr.res) {
    if (j.kind === "skill") {
      const L = j.m % 2 === 1 ? 1 : 0;
      kL += r.k[L];
      kN += r.k[1 - L];
      capL += r.cap[L];
      capN += r.cap[1 - L];
      add(swk, r.wk);
      /* r.wk0 counts team 0's kills; the better team is team L */
      for (const [w, n] of Object.entries(r.wk || {})) {
        const t0 = (r.wk0 || {})[w] || 0;
        swkL[w] = (swkL[w] || 0) + (L === 0 ? t0 : n - t0);
      }
    } else {
      nEven++;
      add(wk, r.wk);
      add(held, r.held);
      for (let i = 0; i < 3; i++) lanes[i] += (r.lanes || [0, 0, 0])[i];
      spawnDeaths += r.spawnDeaths || 0;
      caps += r.cap[0] + r.cap[1];
      grabs += r.grabs || 0;
      ttc.push(...(r.ttc || []));
      ttk = ttk.concat(r.ttk);
      nk += r.nadeKills;
      self += r.selfNade;
      kills += r.kills;
      team += r.team;
      minutes += r.min || MINUTES;
    }
  }
  return {
    /* the share of kills the better team gets: higher means skill shows more */
    skill: +(kL / Math.max(1, kL + kN)).toFixed(3),
    capGap: capL - capN,
    /* for everyone: the median time from first hit to the kill, and grenade outcomes */
    ttk: +median(ttk).toFixed(2),
    kpm: +(kills / Math.max(0.01, minutes)).toFixed(1),
    nadeShare: +(nk / Math.max(1, kills)).toFixed(3),
    selfNade: self,
    teamKills: team,
    ttkQ: [quart(ttk, 0.25), quart(ttk, 0.5), quart(ttk, 0.75)],
    wShare: shares(wk),
    held: shares(held),
    /* only weapons with enough kills to say anything */
    wSkill: Object.fromEntries(
      Object.entries(swk)
        .filter(([, n]) => n >= 30)
        .sort((a, b) => b[1] - a[1])
        .map(([w, n]) => [w, +(swkL[w] / n).toFixed(3)])
    ),
    spawnDeaths: +(spawnDeaths / Math.max(1, kills)).toFixed(3),
    capsPerMatch: +(caps / Math.max(1, nEven)).toFixed(2),
    grabsPerMatch: +(grabs / Math.max(1, nEven)).toFixed(2),
    ttc: ttc.length ? +median(ttc).toFixed(1) : null,
    lanes:
      lanes[0] + lanes[1] + lanes[2]
        ? lanes.map(n => +(n / (lanes[0] + lanes[1] + lanes[2])).toFixed(3))
        : null,
  };
}
