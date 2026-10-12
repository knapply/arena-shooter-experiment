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
     PAIR=normal,recruit node tools/tune.js     the skill matches' better and worse levels
                                                 (default legendary,normal)
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
  /* the skill matches: the better level first */
  PAIR = (process.env.PAIR || "legendary,normal").split(",");
const LOCKS = ["carbine", "magnum", "sniper", "rocket", "nades"];
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
};
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
  const G = CTF.Game({ mode: "sim", render: false, seed, diff, lock });
  const out = { k: [0, 0], cap: [0, 0], ttk: [], nadeKills: 0, selfNade: 0, kills: 0, team: 0 };
  G.onEvent = (t, d) => {
    if (t === "kill") {
      out.kills++;
      const v = d.victim,
        k = d.killer;
      if (k && k.team !== v.team) out.k[k.team]++;
      if (k && k.team === v.team) out.team++;
      if (/frag|stick|plasma|nade/.test(d.type || "")) {
        out.nadeKills++;
        if (k === v) out.selfNade++;
      }
      if (v.__first != null) out.ttk.push(G.t - v.__first);
      v.__first = null;
    } else if (t === "capture") out.cap[d.by ? d.by.team : d.flag ? 1 - d.flag.team : 0]++;
  };
  G.start();
  for (const a of G.agents) {
    const on = a.onHit.bind(a);
    a.onHit = (n, type, head, att) => {
      if (a.__first == null || G.t - a.__lastHit > 3) a.__first = G.t;
      a.__lastHit = G.t;
      return on(n, type, head, att);
    };
  }
  const steps = MINUTES * 60 * 30;
  for (let i = 0; i < steps && !G.over; i++) G.step(1 / 30);
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
  const names = process.env.KNOBS === "none" ? [] : knobArg.length ? knobArg : Object.keys(KNOBS);
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
    `${variants.length} variants x ${MATCHES * 2} matches (${MINUTES} min each), seed ${SEED}, ${nWorkers} workers` +
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
    } else {
      const b = base.get(vr.lock);
      rows.push({ knob: vr.knob, value: vr.value, def: KNOBS[vr.knob].def, lock: vr.lock, ...r });
      const ds = b ? r.skill - b.skill : 0;
      console.log(
        `${vr.knob.padEnd(13)} ${String(vr.value).padStart(6)} (def ${KNOBS[vr.knob].def}) [${lockName(vr.lock)}]  skill ${r.skill} (${(ds >= 0 ? "+" : "") + ds.toFixed(3)})  ttk ${r.ttk}s  kpm ${r.kpm}  nades ${r.nadeShare} self ${r.selfNade}  tk ${r.teamKills}`
      );
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
    team = 0;
  /* in match order, so the result doesn't depend on which worker finished first */
  vr.res.sort((a, b) => a.j.id - b.j.id);
  for (const { j, r } of vr.res) {
    if (j.kind === "skill") {
      const L = j.m % 2 === 1 ? 1 : 0;
      kL += r.k[L];
      kN += r.k[1 - L];
      capL += r.cap[L];
      capN += r.cap[1 - L];
    } else {
      ttk = ttk.concat(r.ttk);
      nk += r.nadeKills;
      self += r.selfNade;
      kills += r.kills;
      team += r.team;
    }
  }
  return {
    /* the share of kills the better team gets: higher means skill shows more */
    skill: +(kL / Math.max(1, kL + kN)).toFixed(3),
    capGap: capL - capN,
    /* for everyone: the median time from first hit to the kill, and grenade outcomes */
    ttk: +median(ttk).toFixed(2),
    kpm: +(kills / (MATCHES * MINUTES)).toFixed(1),
    nadeShare: +(nk / Math.max(1, kills)).toFixed(3),
    selfNade: self,
    teamKills: team,
  };
}
