/* Sandbox tuning by simulation: plays headless capture-the-flag matches with small variations of the
   movement, weapon and grenade numbers (the Sandbox settings tab) and measures what each one does to
   the game. Two kinds of match per variant:
     skill   legendary AI vs normal AI   → how much skill decides fights (the skill ceiling)
     even    normal vs normal            → how fights feel for everyone (time to kill, grenade self-kills)
   Each knob is varied one at a time around the defaults; the report lists the effect of each step.
     node tools/tune.js                 sweep every knob (a few minutes)
     node tools/tune.js sbJump sbNadeThrow   only these knobs
     MATCHES=6 MINUTES=4 node tools/tune.js  more samples per variant
     SEED=500 node tools/tune.js              a different set of matches (to check a result holds)
     TRY="sbAccel=80,90" node tools/tune.js sbAccel   try other values
   Output: a table on stdout and tools/out/tune.json. See docs/TUNING.md for how defaults were chosen. */
const fs = require("fs"),
  path = require("path");
const CTF = require("../tests/lib/headless.js");
const K = window.KA;
const SEED = +(process.env.SEED || 100),
  MATCHES = +(process.env.MATCHES || 4),
  MINUTES = +(process.env.MINUTES || 3);
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
    try: [20, 26],
  },
  sbMagRate: { set: v => (W("pistol").rate = v), def: 0.28, try: [0.24, 0.32] },
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
const pick = process.argv.slice(2).filter(k => KNOBS[k]);
const names = pick.length ? pick : Object.keys(KNOBS);
/* read the real defaults from the data so the table always starts from what ships */
KNOBS.sbCarbDmg.def = W("carbine").body;
KNOBS.sbCarbRate.def = W("carbine").rate;
KNOBS.sbCarbSpread.def = W("carbine").spread;
KNOBS.sbCarbBloom.def = W("carbine").bloom;
KNOBS.sbMagDmg.def = W("pistol").body;
KNOBS.sbMagRate.def = W("pistol").rate;
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
function match(diff, seed) {
  K.STORE.setBackend(K.STORE.memoryBackend());
  const G = CTF.Game({ mode: "sim", render: false, seed, diff });
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
const median = a => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
};
/** play a variant: skill matches (legendary on team 0, then swapped sides) and even matches */
function variant() {
  let kL = 0,
    kN = 0,
    capL = 0,
    capN = 0,
    ttk = [],
    nk = 0,
    self = 0,
    kills = 0,
    team = 0;
  for (let m = 0; m < MATCHES; m++) {
    const swap = m % 2 === 1;
    const r = match(swap ? ["normal", "legendary"] : ["legendary", "normal"], SEED + m);
    const L = swap ? 1 : 0;
    kL += r.k[L];
    kN += r.k[1 - L];
    capL += r.cap[L];
    capN += r.cap[1 - L];
    const e = match(["normal", "normal"], SEED + 1000 + m);
    ttk = ttk.concat(e.ttk);
    nk += e.nadeKills;
    self += e.selfNade;
    kills += e.kills;
    team += e.team;
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
const t0 = Date.now();
resetAll();
/* a throwaway match first: lazy setup on the first run would otherwise skew the baseline */
match(["normal", "normal"], 1);
const base = variant();
console.log(`baseline (${MATCHES} matches x ${MINUTES} min each kind)`, JSON.stringify(base));
const rows = [];
for (const n of names) {
  for (const v of KNOBS[n].try) {
    resetAll();
    KNOBS[n].set(v);
    const r = variant();
    rows.push({ knob: n, value: v, def: KNOBS[n].def, ...r });
    console.log(
      `${n.padEnd(13)} ${String(v).padStart(6)} (def ${KNOBS[n].def})  skill ${r.skill} (${(r.skill - base.skill >= 0 ? "+" : "") + (r.skill - base.skill).toFixed(3)})  ttk ${r.ttk}s  kpm ${r.kpm}  nades ${r.nadeShare} self ${r.selfNade}  tk ${r.teamKills}`
    );
  }
}
resetAll();
fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "out", process.env.OUT || "tune.json"),
  JSON.stringify({ base, rows, MATCHES, MINUTES }, null, 1)
);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
