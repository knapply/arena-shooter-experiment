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
     MODE=ffa MAP=arena node tools/tune.js      the rules to play: ctf, slayer, ffa (eight pilots, every
                                                 one for themselves; the skill match alternates the two
                                                 levels, so "skill" is the better half's share of kills)
                                                 or oddball (also reports the better team's share of the
                                                 time holding the skull). Default: ctf on a map with
                                                 flags, slayer otherwise
     PAIR=normal,recruit node tools/tune.js     the skill matches' better and worse levels
                                                 (default legendary,normal)
     TEAM=1 MAP=arena node tools/tune.js        pilots per team (1 on the arena: one-on-one duels, the
                                                 closest the AI comes to free-for-all)
     node tools/tune.js labBurst modDoors       lab content (docs/PROPOSALS.md) as knobs: 1 turns it on
                                                 (labBurst labScatter labBeam labPulse labWeapons, modDoors
                                                 modSplit on Twin Foundry, modRing modPillars on the arena,
                                                 labGates on both; labGateOpen/Shut/Move: the gate cycle,
                                                 with GATES=1, which turns the gates on in every variant);
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
  /* the map: ctf (Twin Foundry) or arena */
  MAPID = process.env.MAP || "ctf",
  /* the rules: ctf, slayer, ffa or oddball (default: capture the flag where the map has flags) */
  RULES = process.env.MODE || (MAPID === "arena" ? "slayer" : "ctf"),
  /* the skill matches: the better level first */
  PAIR = (process.env.PAIR || "legendary,normal").split(","),
  TEAM = +(process.env.TEAM || 4),
  /* PILOTS=n free-for-all pilots (default the mode data), MIX=n mixed-skill teams, LIMITS=1 the real
     score limits (LIMIT=n sets one), HEAT=1 heat maps */
  PILOTS = +(process.env.PILOTS || 0),
  MIX = +(process.env.MIX || 0),
  LIMITS = process.env.LIMITS === "1" || !!process.env.LIMIT,
  LIMIT = +(process.env.LIMIT || 0),
  HEAT = process.env.HEAT === "1";
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
  sbAccel: { set: v => (K.TUNE.accel = v), def: 80, try: [60, 100] },
  sbAir: { set: v => (K.TUNE.airAccel = v), def: 18, try: [12, 24] },
  sbJump: { set: v => (K.TUNE.jump = v), def: 7.4, try: [6.8, 8] },
  sbGrav: { set: v => (K.TUNE.grav = v), def: 24, try: [20, 28] },
  sbThrust: { set: v => (K.TUNE.thrust = v), def: 17, try: [14, 20] },
  sbReverse: { set: v => (K.TUNE.reverse = v), def: 95, try: [70, 120] },
  sbThrustCD: { set: v => (K.TUNE.thrustCD = v), def: 2.2, try: [1.8, 2.6] },
  sbSlide: { set: v => (K.TUNE.slideBoost = v), def: 3.2, try: [2.4, 4] },
  /* speed while aiming a low-zoom optic (0.72 is how the AI moved before it used the player's rule) */
  sbAdsMove: { set: v => (K.TUNE.adsMove = v), def: 0.9, try: [0.72, 1] },
  /* time to raise the gun after a sprint before it can fire */
  sbRaise: { set: v => (K.TUNE.raise = v), def: 0, try: [0.15, 0.3] },
  sbStab: { set: v => (K.TUNE.stab = v), def: 1.3, try: [2] },
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
  sbNadeFuse: { set: v => (K.NADES.frag.fuse = v), def: 2.6, try: [2.2, 3] },
  sbNadeRadius: { set: v => (K.NADES.frag.r = v), def: 4.2, try: [3.6, 4.8] },
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
  /* blast gates (both maps), and their cycle in seconds (GATES=1 turns the gates on for every variant) */
  labGates: { set: lab("gates"), def: 0, try: [1] },
  labGateOpen: { set: v => (K.GATE_CYCLE.open = v), def: 10, try: [7, 14] },
  labGateShut: { set: v => (K.GATE_CYCLE.shut = v), def: 8, try: [5, 11] },
  labGateMove: { set: v => (K.GATE_CYCLE.move = v), def: 2.5, try: [1.5, 3.5] },
  /* a subset of the gates: 1 the mid gates (Twin Foundry) or north and south (arena), 2 the others
     (none on Twin Foundry, which only has mid gates now) */
  labGateOnly: {
    set: v => K.GATES.all.forEach(g => (g.off = v ? /mid|gate-[ns]$/.test(g.id) !== (v === 1) : false)),
    def: 0,
    try: [1, 2],
  },
};
/* ---- rule knobs: pilot durability, melee, grenades, items, respawns, spawns and objectives. These
   are numbers the Sandbox tab doesn't expose, so the simulation sets them through RULE (hooks below
   patch the simulation in this process only; shipped code is untouched). Every default reproduces
   the game exactly. ---- */
const RULE = {
  shield: 70,
  health: 45,
  /* seconds without damage before recharging, and shield / health points a second */
  regenDelay: 4,
  shieldRate: 48,
  healthRate: 28,
  /* seconds between melee swings, and after a shoulder charge */
  meleeCD: 0.75,
  chargeCD: 1.3,
  /* 1: a flag or skull carrier's melee kills in one hit; 0: it follows the normal melee rule */
  carryHit: 1,
  /* the AI's grenades at spawn (a multiple of its level's count), and its pause after a throw */
  nades: 1,
  nadeCD: 1,
  /* power spawn respawn times, and the starting guns' reserves (multiples of the map's / the data's) */
  power: 1,
  reserve: 1,
  /* seconds added to the respawn delay; drop pods (1) or in-place spawns (0) */
  respawn: 0,
  pods: 0,
  /* a dropped flag's return, a dropped skull's reset (seconds; 0 keeps the mode's own) */
  flagReset: 0,
  ballReset: 0,
};
const RULE_DEF = Object.assign({}, RULE);
const rule = k => v => (RULE[k] = v);
Object.assign(KNOBS, {
  ruShield: { set: rule("shield"), def: 70, try: [55, 85] },
  ruHealth: { set: rule("health"), def: 45, try: [35, 55] },
  ruRegenDelay: { set: rule("regenDelay"), def: 4, try: [3, 5] },
  ruShieldRate: { set: rule("shieldRate"), def: 48, try: [32, 64] },
  ruMeleeCD: { set: rule("meleeCD"), def: 0.75, try: [0.55, 1] },
  ruChargeCD: { set: rule("chargeCD"), def: 1.3, try: [1, 1.8] },
  ruCarryHit: { set: rule("carryHit"), def: 1, try: [0] },
  ruNades: { set: rule("nades"), def: 1, try: [0.5, 1.5] },
  ruNadeCD: { set: rule("nadeCD"), def: 1, try: [0.6, 1.5] },
  ruPower: { set: rule("power"), def: 1, try: [0.67, 1.5] },
  ruReserve: { set: rule("reserve"), def: 1, try: [0.5, 2] },
  ruRespawn: { set: rule("respawn"), def: 0, try: [-2, 2] },
  ruPods: { set: rule("pods"), def: 0, try: [1] },
  ruFlagReset: { set: rule("flagReset"), def: 0, try: [10, 25] },
  ruBallReset: { set: rule("ballReset"), def: 0, try: [8, 25] },
  /* spawn safety weights (world/spawns.js) */
  spSeen: { set: v => (K.SPAWN_W.seen = v), def: 60, try: [30, 120] },
  spNear: { set: v => (K.SPAWN_W.near = v), def: 30, try: [20, 40] },
  spFight: { set: v => (K.SPAWN_W.fightW = v), def: 1.2, try: [0.6, 2.4] },
});
KNOBS.spSeen.def = K.SPAWN_W.seen;
KNOBS.spNear.def = K.SPAWN_W.near;
KNOBS.spFight.def = K.SPAWN_W.fightW;
const RES_DEF = K.WEAPON_DATA.map(w => w.reserve);
/* the hooks: each one is the shipped behaviour exactly when RULE holds its defaults */
{
  const B = K.Body.prototype;
  const reset0 = B.reset;
  B.reset = function () {
    reset0.call(this);
    this.shield = RULE.shield;
    this.health = RULE.health;
  };
  B.regen = function (dt, now) {
    /* world/physics.js Body.regen with RULE's numbers */
    if (this.dead) return 0;
    if (this.sprint && this.shield < RULE.shield) {
      this.lastDmg = Math.max(this.lastDmg, now - (RULE.regenDelay === 4 ? 3.3 : RULE.regenDelay - 0.7));
      return 0;
    }
    let ev = 0;
    if (now - this.lastDmg > RULE.regenDelay) {
      if (this.shield < RULE.shield) {
        if (this.shield <= 0) ev = 1;
        this.shield = Math.min(RULE.shield, this.shield + RULE.shieldRate * dt);
      } else this.health = Math.min(RULE.health, this.health + RULE.healthRate * dt);
    }
    return ev;
  };
  const step0 = B.step;
  B.step = function (dt, inp, ev) {
    const m0 = this.meleeCD;
    const r = step0.call(this, dt, inp, ev);
    /* a swing this step set the cooldown to the shipped 0.75 or 1.3 */
    if (this.meleeCD > m0) this.meleeCD = this.meleeCD === 1.3 ? RULE.chargeCD : RULE.meleeCD;
    return r;
  };
  const A = CTF.Agent.prototype;
  const spawn0 = A.spawn;
  A.spawn = function (p) {
    const r = spawn0.call(this, p);
    if (RULE.nades !== 1) {
      const nk = this.skill().nades;
      this.nadeInv.frag = Math.round(2 * nk * RULE.nades);
      this.nadeInv.plasma = Math.round(nk * RULE.nades);
    }
    return r;
  };
  const throw0 = A.throwNade;
  A.throwNade = function (type, at) {
    const r = throw0.call(this, type, at);
    if (RULE.nadeCD !== 1) this.nadeCD *= RULE.nadeCD;
    return r;
  };
}
/* per-pilot skill levels (MIX: mixed-skill teams) */
function setLevel(a, level) {
  a.skill = () => K.AI_SKILL[level];
}
const LAB_KNOBS = Object.keys(KNOBS).filter(k => /^(lab|mod)/.test(k));
const RULE_KNOBS = Object.keys(KNOBS).filter(k => /^(ru|sp)/.test(k));
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
KNOBS.labGateOpen.def = K.GATE_CYCLE.open;
KNOBS.labGateShut.def = K.GATE_CYCLE.shut;
KNOBS.labGateMove.def = K.GATE_CYCLE.move;
for (const [k, f] of [
  ["sbRun", "run"],
  ["sbSprint", "sprint"],
  ["sbAccel", "accel"],
  ["sbAir", "airAccel"],
  ["sbJump", "jump"],
  ["sbGrav", "grav"],
  ["sbThrust", "thrust"],
  ["sbReverse", "reverse"],
  ["sbThrustCD", "thrustCD"],
  ["sbSlide", "slideBoost"],
  ["sbAdsMove", "adsMove"],
  ["sbRaise", "raise"],
  ["sbStab", "stab"],
])
  KNOBS[k].def = K.TUNE_DEF[f];
KNOBS.sbNadeThrow.def = K.NADE_TUNE.throw;
KNOBS.sbNadeBounce.def = K.NADE_TUNE.bounce;
function resetAll() {
  for (const k of Object.keys(KNOBS)) KNOBS[k].set(KNOBS[k].def);
  Object.assign(RULE, RULE_DEF);
  K.WEAPON_DATA.forEach((w, i) => (w.reserve = RES_DEF[i]));
  if (process.env.GATES === "1") K.LABS.gates = true;
}
/** one match: returns kills by team, captures, times to kill and grenade outcomes */
function match(diff, seed, lock) {
  K.STORE.setBackend(K.STORE.memoryBackend());
  /* everything but capture the flag plays the full time (a score limit would end matches at different
     lengths) */
  const G = CTF.Game({
    mode: "sim",
    render: false,
    seed,
    diff,
    lock,
    map: MAPID,
    rules: RULES,
    /* LIMITS=1: every mode plays to its real score limit (matches end early; "who wins" measures) */
    scoreLimit: RULES === "ctf" || LIMITS ? 0 : 1e9,
    perTeam: TEAM,
    pilots: PILOTS || undefined,
    pods: !!RULE.pods,
  });
  /* rule knobs that live on the match */
  G.respawnDelay += RULE.respawn;
  if (RULE.flagReset) G.flagReset = RULE.flagReset;
  if (RULE.ballReset) G.ballReset = RULE.ballReset;
  if (LIMIT) G.scoreLimit = LIMIT;
  for (const p of G.pickups || []) if (p.power) p.respawn *= RULE.power;
  if (RULE.reserve !== 1)
    for (const w of ["carbine", "pistol"])
      W(w).reserve = Math.round(RES_DEF[K.WEAPON_DATA.indexOf(W(w))] * RULE.reserve);
  /* MIX=n: in a skill match, the better team is n pilots of the better level and the rest of the
     worse level (does one strong pilot carry a team?) */
  if (MIX && diff[0] !== diff[1]) {
    const better = diff[0] === PAIR[0] ? 0 : 1;
    G.teams[better].agents.forEach((a, i) => setLevel(a, i < MIX ? PAIR[0] : PAIR[1]));
  }
  /* free-for-all: the two skill levels alternate between pilots, so "team" below is the pilot's half */
  const side = a => (G.ffa ? a.team % 2 : a.team);
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
    /* rounds each pilot fired with each weapon over one whole life (spawn to death) */
    life: {},
    /* oddball: seconds each side held the skull, and how often it changed hands */
    hold: [0, 0],
    turns: 0,
    /* carriers (flag or skull): seconds from pick-up to losing it, and how each carry ended */
    carry: [],
    carryEnd: { capture: 0, killed: 0, dropped: 0, reset: 0 },
    /* score of each side at half time, and at the end (who led, who won) */
    half: null,
    final: null,
    /* kills each pilot scored (spread, and the free-for-all leader's margin) */
    pk: [],
    /* HEAT=1: where pilots were (once a second), died and killed from, in 2 m cells; spawn deaths
       per spawn point */
    heat: HEAT ? { occ: {}, death: {}, kill: {}, spawn: {}, zocc: {}, zdeath: {}, zkill: {} } : null,
  };
  const takenAt = new Map(),
    carryFrom = new Map();
  const cell = p => `${Math.floor(p.x / 2)},${Math.floor(p.z / 2)}`;
  const zone = p => K.zoneLabel(CTF.MAP, p, -1) || "(no zone)";
  const bump = (o, k) => (o[k] = (o[k] || 0) + 1);
  const carryEnd = (a, how) => {
    if (!carryFrom.has(a)) return;
    out.carry.push(+(G.t - carryFrom.get(a)).toFixed(1));
    out.carryEnd[how]++;
    carryFrom.delete(a);
  };
  G.onEvent = (t, d) => {
    if (t === "shot") {
      const a = d.by;
      if (a && a.__life) {
        const key = K.WEAPON_DATA[a.held()].key;
        a.__life[key] = (a.__life[key] || 0) + 1;
      }
      return;
    }
    if (t === "kill") {
      out.kills++;
      const v = d.victim,
        k = d.killer;
      const w = d.type || "?";
      if (k && k.team !== v.team) {
        out.wk[w] = (out.wk[w] || 0) + 1;
        if (side(k) === 0) out.wk0[w] = (out.wk0[w] || 0) + 1;
      }
      if (v.__sp != null && G.t - v.__sp < 3) {
        out.spawnDeaths++;
        if (out.heat && v.__spAt) bump(out.heat.spawn, v.__spAt);
      }
      if (out.heat && k && k !== v) {
        bump(out.heat.death, cell(v.pos));
        bump(out.heat.kill, cell(k.pos));
        bump(out.heat.zdeath, zone(v.pos));
        bump(out.heat.zkill, zone(k.pos));
      }
      carryEnd(v, "killed");
      if (k && k.team !== v.team) out.k[side(k)]++;
      if (k && k.team === v.team) out.team++;
      if (/frag|stick|plasma|nade/.test(d.type || "")) {
        out.nadeKills++;
        if (k === v) out.selfNade++;
      }
      if (v.__life) {
        for (const w of new Set(["carbine", "pistol", ...Object.keys(v.__life)]))
          (out.life[w] = out.life[w] || []).push(v.__life[w] || 0);
        v.__life = null;
      }
      if (v.__first != null) out.ttk.push(G.t - v.__first);
      v.__first = null;
    } else if (t === "capture") {
      if (d.by) carryEnd(d.by, "capture");
      out.cap[d.by ? d.by.team : d.flag ? 1 - d.flag.team : 0]++;
      if (takenAt.has(d.flag)) out.ttc.push(G.t - takenAt.get(d.flag));
      takenAt.delete(d.flag);
    } else if (t === "flagTaken") {
      out.grabs++;
      carryFrom.set(d.by, G.t);
      /* time to capture runs from the grab at the stand */
      if (!takenAt.has(d.flag) && d.flag.pos.distanceTo(CTF.FLAG_HOME[d.flag.team]) < 2)
        takenAt.set(d.flag, G.t);
    } else if (t === "flagReset" || t === "flagReturn") takenAt.delete(d.flag);
    else if (t === "ballTaken") {
      out.turns++;
      carryFrom.set(d.by, G.t);
    } else if ((t === "flagDrop" || t === "ballDrop") && d.by && !d.by.dead && !d.killer)
      carryEnd(d.by, "dropped");
  };
  G.start();
  for (const a of G.agents) {
    const sp = a.spawn.bind(a);
    a.spawn = p => {
      a.__sp = G.t;
      a.__spAt = p ? `${Math.round(p[0])},${Math.round(p[2])}` : null;
      a.__life = {};
      return sp(p);
    };
    const on = a.onHit.bind(a);
    a.onHit = (n, type, head, att) => {
      if (a.__first == null || G.t - a.__lastHit > 3) a.__first = G.t;
      a.__lastHit = G.t;
      /* RULE.carryHit 0: a carrier's swing follows the normal melee rule */
      if (!RULE.carryHit && n >= 999 && (type === "flag" || type === "skull") && att && att.pos)
        n = K.meleeDamage(a.body.shield, K.meleeBehind(att.pos.x, att.pos.z, a.pos.x, a.pos.z, a.body.yaw));
      return on(n, type, head, att);
    };
  }
  /* the score of each side (teams; in free-for-all the best pilot of each skill half) */
  const scores = () =>
    G.ffa
      ? [0, 1].map(s => Math.max(0, ...G.agents.filter(a => side(a) === s).map(a => a.k)))
      : G.teams.map(T => T.score);
  const steps = MINUTES * 60 * 30;
  const lanes = !!CTF.MAP.lanes;
  for (let i = 0; i < steps && !G.over; i++) {
    G.step(1 / 30);
    if (i === steps >> 1) out.half = scores();
    if (i % 30) continue;
    /* once a second: what each pilot holds, and where the ones in the middle of the map are */
    for (const a of G.agents) {
      if (!a.alive) continue;
      const key = K.WEAPON_DATA[a.held()].key;
      out.held[key] = (out.held[key] || 0) + 1;
      if (lanes && Math.abs(a.pos.z) < 30) out.lanes[CTF.worldLane(a.pos.x)]++;
      if (out.heat) {
        bump(out.heat.occ, cell(a.pos));
        bump(out.heat.zocc, zone(a.pos));
      }
    }
  }
  if (!out.half) out.half = scores();
  out.final = scores();
  out.pk = G.agents.map(a => a.k);
  for (const a of [...carryFrom.keys()]) carryEnd(a, "reset");
  /* minutes actually played (a capture limit can end a match early) */
  out.min = G.t / 60;
  if (G.ball) out.hold = [G.teams[0].held, G.teams[1].held];
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
        : Object.keys(KNOBS).filter(k => !LAB_KNOBS.includes(k) && !RULE_KNOBS.includes(k));
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
    `${variants.length} variants x ${MATCHES * 2} matches (${MINUTES} min each, ${RULES} on ${MAPID}, ${TEAM} v ${TEAM}), seed ${SEED}, ${nWorkers} workers` +
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
          MODE: RULES,
          MODS: K.LABS.mods.slice(),
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
  hold: r.holdSkill,
  turns: r.turnsPerMatch,
  carry: r.carry,
  leadWins: r.leadWins,
  spread: r.killSpread,
  margin: r.margin,
  ttc: r.ttc,
  lanes: r.lanes,
  lifeShots: r.lifeShots,
});
/** a variant's matches: skill matches (legendary on team 0, then swapped sides) and even matches */
function summarize(vr) {
  let kL = 0,
    kN = 0,
    capL = 0,
    capN = 0,
    holdL = 0,
    holdN = 0,
    turns = 0,
    ttk = [],
    nk = 0,
    self = 0,
    kills = 0,
    team = 0,
    minutes = 0,
    spawnDeaths = 0,
    caps = 0,
    grabs = 0,
    nEven = 0,
    leads = 0,
    leadWon = 0;
  const carry = [],
    carryEnds = { capture: 0, killed: 0, dropped: 0, reset: 0 },
    spreads = [],
    margins = [],
    heat = { occ: {}, death: {}, kill: {}, spawn: {}, zocc: {}, zdeath: {}, zkill: {} };
  const wk = {},
    life = {},
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
      holdL += (r.hold || [0, 0])[L];
      holdN += (r.hold || [0, 0])[1 - L];
      add(swk, r.wk);
      /* r.wk0 counts team 0's kills; the better team is team L */
      for (const [w, n] of Object.entries(r.wk || {})) {
        const t0 = (r.wk0 || {})[w] || 0;
        swkL[w] = (swkL[w] || 0) + (L === 0 ? t0 : n - t0);
      }
    } else {
      nEven++;
      carry.push(...(r.carry || []));
      add(carryEnds, r.carryEnd);
      if (r.heat) for (const k of Object.keys(heat)) add(heat[k], r.heat[k]);
      /* kill spread: the coefficient of variation of pilots' kills; the top pilot's lead over the next */
      const pk = (r.pk || []).slice().sort((a, b) => b - a);
      if (pk.length > 1) {
        const m = pk.reduce((a, b) => a + b, 0) / pk.length;
        if (m > 0) spreads.push(Math.sqrt(pk.reduce((a, b) => a + (b - m) ** 2, 0) / pk.length) / m);
        margins.push(pk[0] - pk[1]);
      }
      /* did whoever led at half time win? (ties at half or at the end don't count) */
      if (r.half && r.final && r.half[0] !== r.half[1] && r.final[0] !== r.final[1]) {
        leads++;
        if (r.half[0] > r.half[1] === r.final[0] > r.final[1]) leadWon++;
      }
      add(wk, r.wk);
      add(held, r.held);
      for (const [w, a] of Object.entries(r.life || {})) (life[w] = life[w] || []).push(...a);
      for (let i = 0; i < 3; i++) lanes[i] += (r.lanes || [0, 0, 0])[i];
      spawnDeaths += r.spawnDeaths || 0;
      caps += r.cap[0] + r.cap[1];
      grabs += r.grabs || 0;
      turns += r.turns || 0;
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
    /* oddball: the better team's share of the time holding the skull, and changes of hands a match */
    holdSkill: holdL + holdN ? +(holdL / (holdL + holdN)).toFixed(3) : null,
    turnsPerMatch: +(turns / Math.max(1, nEven)).toFixed(1),
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
    /* carriers: median seconds held, and how carries ended */
    carry: carry.length ? { med: +median(carry).toFixed(1), n: carry.length, ...carryEnds } : null,
    /* whoever led at half time won this share of the matches with a leader (even matches) */
    leadWins: leads ? +(leadWon / leads).toFixed(3) : null,
    killSpread: spreads.length ? +(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(3) : null,
    margin: margins.length ? +(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(2) : null,
    heat: HEAT ? heat : undefined,
    ttc: ttc.length ? +median(ttc).toFixed(1) : null,
    /* rounds fired per life with each weapon (even matches, whole lives): median, 95th and 99th
       percentiles, and how many lives */
    lifeShots: Object.fromEntries(
      Object.entries(life).map(([w, a]) => [w, [quart(a, 0.5), quart(a, 0.95), quart(a, 0.99), a.length]])
    ),
    lanes:
      lanes[0] + lanes[1] + lanes[2]
        ? lanes.map(n => +(n / (lanes[0] + lanes[1] + lanes[2])).toFixed(3))
        : null,
  };
}
