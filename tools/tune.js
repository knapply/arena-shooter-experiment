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
     node tools/tune.js modDoors labGates       lab content (docs/PROPOSALS.md) as knobs: 1 turns it on
                                                 (modDoors modSplit modPads on Twin Foundry, modRing
                                                 modPillars on the arena,
                                                 labGates on both; labGateOpen/Shut/Move: the gate cycle,
                                                 with GATES=1, which turns the gates on in every variant)
     node tools/tune.js aiHoldRange aiRhythm    the AI's habits (modes/ctf/memory.js CTF.AI), 0 turns
                                                 one off; aiMemory 1 starts every match with a memory of
                                                 the map learned from two earlier matches; AIMEM=1 does
                                                 that for every variant (then aiPreAim 0 measures pre-aim)
     node tools/tune.js ruRegenDelay ruShield  rules the Sandbox tab doesn't expose (ru*: shield, health,
                                                 recharge, melee, carrier one-hit, AI grenades, power
                                                 respawns, reserves, respawn delay, pods, flag and skull
                                                 resets; sp*: spawn safety weights), patched into the
                                                 simulation only; a full sweep leaves them out
     PILOTS=6 MODE=ffa node tools/tune.js       free-for-all size; MIX=1 mixed-skill teams (n of the better
                                                 level, the rest of the worse); LIMITS=1 the real score limits
                                                 (LIMIT=n sets one), for who wins and lead changes
     HEAT=1 node tools/tune.js                  map heat in the output; node tools/heat-report.js reads it
     SKILLONLY=1 PAIR=normal,recruit node tools/tune.js   the skill ladder: only the skill matches, with
                                                 the worse side's K/D, time to death, deaths by melee,
                                                 grenade and spawn, its wins and objective touches, and
                                                 both sides' headshot share ("ladder" in the output);
                                                 MIXR=1 puts one pilot of the worse level on the worse team
                                                 and the rest of the better level
   Besides skill share, time to kill and grenades, every variant reports: the spread of time to kill
   (quartiles), each weapon's share of kills and of time held, how much skill decides fights with each
   weapon (the better team's share of that weapon's kills), captures and time to capture, the share of
   deaths within 3 s of spawning, lane use in the middle of a lane map, how long flag and skull
   carriers last and how their carries end, whether the half-time leader won and how often the lead
   changed hands (LIMITS), and the spread of kills across pilots with the top pilot's margin.
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
  HEAT = process.env.HEAT === "1",
  /* SKILLONLY=1: only the skill matches (the ladder measures come from them); MIXR=n: the worse team
     is n pilots of the worse level and the rest of the better level (does one weak pilot drag a team?) */
  SKILLONLY = process.env.SKILLONLY === "1",
  MIXR = +(process.env.MIXR || 0);
/* NOVICE=1: one pilot on team 0 plays like a new human player instead of a bot (the "novice"): slow to
   react (0.42 s) and to turn, wide aim, no strafing, no movement tech, melee only point-blank. Every
   run then reports how the novice fares (novice in the output): K/D, how often they die a minute, how
   long they live, how often two or more pilots hurt them in the 3 s before a death (focus), and how
   they die. Read it from the even matches, with DIFF set to the level to measure (DIFF=recruit) */
const NOVICE = process.env.NOVICE === "1";
const NOVICE_SKILL = {
  react: 0.42,
  err: 0.08,
  turn: 3,
  magErr: 1.4,
  magPace: 0.45,
  magFrom: 24,
  sight: 55,
  dodge: 0,
  nades: 0.5,
  rhythm: 0,
};
/* AIMEM=1: every variant starts with a memory of the map (so aiPreAim measures something) */
const AIMEM_ENV = process.env.AIMEM === "1";
/** aiMemory: matches start with a memory of the map (see match) */
const AIMEM = { on: AIMEM_ENV };
const LOCKS = ["carbine", "magnum", "sniper", "rocket", "nades", "scatter"];
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
  sbSprintRamp: { set: v => (K.TUNE.sprintRamp = v), def: 0, try: [0.8] },
  sbSlideT: { set: v => (K.TUNE.slideT = v), def: 0.8, try: [0.5] },
  sbClamber: { set: v => (K.TUNE.clamberK = v), def: 1, try: [2.3] },
  /* a floatier jump with the same apex: air time 1 s (8 = grav 9.1, jump 4.56) or 1.33 s (grav 5.2, jump 3.87) */
  /* the Sandbox's recharge numbers: the simulation's recharge reads RULE (below), so set both */
  sbRegenDelay: { set: v => (K.TUNE.regenDelay = RULE.regenDelay = v), def: 3, try: [4] },
  sbShieldRate: { set: v => (K.TUNE.shieldRate = RULE.shieldRate = v), def: 48, try: [35] },
  sbHealthRate: { set: v => (K.TUNE.healthRate = RULE.healthRate = v), def: 28, try: [7.5] },
  sbMeleeShield: { set: v => (K.MELEE.shield = v), def: 40, try: [70] },
  sbCarbHead: { set: v => (W("carbine").head = Math.round(W("carbine").body * v)), def: 11 / 9, try: [2] },
  sbCarbReload: { set: v => (W("carbine").reload = v), def: 1.8, try: [2.1] },
  sbMagReload: { set: v => (W("pistol").reload = v), def: 1.3, try: [1.5] },
  sbMagZoom: { set: v => (W("pistol").zoom = [v]), def: 1.8, try: [1.5] },
  /* view kick (the player's aim only; the AI has no recoil) */
  sbMagRecoil: { set: v => (W("pistol").recoil = v), def: 0.045, try: [0.009] },
  sbCarbRecoil: { set: v => (W("carbine").recoil = v), def: 0.016, try: [0.006] },
  /* the reference's higher jump: about 1.5 body heights, 1.33 s in the air */
  sbJumpHi: {
    set: v => Object.assign(K.TUNE, v ? { jump: 8.2, grav: 12.3 } : { jump: 7.4, grav: 24 }),
    def: 0,
    try: [1],
  },
  sbSprintResume: { set: v => (K.TUNE.sprintResume = v), def: 0.3, try: [0] },
  sbPoundCharge: { set: v => (K.TUNE.poundCharge = v), def: 0.55, try: [0.65] },
  sbPoundRadius: { set: v => (K.TUNE.poundR = v), def: 5, try: [3.2] },
  /* the whole "Classic feel" Sandbox preset (data/modes.js) at once */
  sbClassic: {
    set: v => {
      if (v) for (const [k, x] of Object.entries(K.SANDBOX_PRESETS.classic.values)) KNOBS[k].set(x);
    },
    def: 0,
    try: [1],
  },
  sbFloat: {
    set: v =>
      Object.assign(
        K.TUNE,
        v ? { grav: (8 * 1.14) / (v * v), jump: (4 * 1.14) / v } : { grav: 24, jump: 7.4 }
      ),
    def: 0,
    try: [1, 1.33],
  },
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
  /* the most of a shield a melee blow takes (data/weapons.js MELEE; 999: the whole shield, as before the
     skill-ladder pass) */
  ruMeleeShield: { set: v => (K.MELEE.shield = v), def: 40, try: [999, 25] },
  modDoors: { set: mod("doors"), def: 0, try: [1] },
  modSplit: { set: mod("split"), def: 0, try: [1] },
  modPads: { set: mod("pads"), def: 0, try: [1] },
  modRing: { set: mod("ring"), def: 0, try: [1] },
  modPillars: { set: mod("pillars"), def: 0, try: [1] },
  /* pass four's layout changes undone (the skull spots; the spread free-for-all spawns), to re-measure */
  modOneSkull: { set: mod("oneskull"), def: 0, try: [1] },
  modOldSpawns: { set: mod("oldspawns"), def: 0, try: [1] },
  modTeamSpread: { set: mod("teamspread"), def: 0, try: [1] },
  modDropExits: { set: mod("dropexits"), def: 0, try: [1] },
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
  /* the AI's habits (modes/ctf/memory.js CTF.AI): 0 turns one off. aiMemory 1 gives every match a
     memory of the map learned from two earlier headless matches (seeded, so still deterministic) */
  aiHoldRange: { set: v => (CTF.AI.holdRange = !!v), def: 1, try: [0] },
  aiRhythm: { set: v => (CTF.AI.rhythm = !!v), def: 1, try: [0] },
  aiPreAim: { set: v => (CTF.AI.preAim = !!v), def: 1, try: [0] },
  aiMemory: { set: v => (AIMEM.on = !!v), def: AIMEM_ENV ? 1 : 0, try: [AIMEM_ENV ? 0 : 1] },
};
/* ---- rule knobs: pilot durability, melee, grenades, items, respawns, spawns and objectives. These
   are numbers the Sandbox tab doesn't expose, so the simulation sets them through RULE (hooks below
   patch the simulation in this process only; shipped code is untouched). Every default reproduces
   the game exactly. ---- */
const RULE = {
  shield: 70,
  health: 45,
  /* seconds without damage before recharging (world/physics.js REGEN_DELAY), and shield / health
     points a second */
  regenDelay: 3,
  shieldRate: 48,
  healthRate: 28,
  /* 1: sprint, thrust, hover and ground pound restart the recharge delay; 0: the old rule (sprinting
     alone held it, 0.7 s at most) */
  exertHold: 1,
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
  /* seconds of spawn protection (no damage after spawning until you fire) */
  spawnProt: 1.2,
  /* aim magnetism for spread weapons: a miss that passes within this many metres of a pilot's body
     counts as a body hit (0: off) */
  magnet: 0,
};
const RULE_DEF = Object.assign({}, RULE);
const rule = k => v => (RULE[k] = v);
Object.assign(KNOBS, {
  ruShield: { set: rule("shield"), def: 70, try: [55, 85] },
  ruHealth: { set: rule("health"), def: 45, try: [35, 55] },
  ruRegenDelay: { set: rule("regenDelay"), def: 3, try: [2.5, 3.5] },
  ruShieldRate: { set: rule("shieldRate"), def: 48, try: [32, 64] },
  ruExertHold: { set: rule("exertHold"), def: 1, try: [0] },
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
  ruSpawnProt: { set: rule("spawnProt"), def: 1.2, try: [0.6, 2.4] },
  ruMagnet: { set: rule("magnet"), def: 0, try: [0.1, 0.2] },
  /* headshot damage once shields are down: the magnum's and the carbine's */
  sbMagHead: { set: v => (W("pistol").head = v), def: 50, try: [40, 60] },
  sbCarbHead: { set: v => (W("carbine").head = v), def: 11, try: [9, 14] },
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
    if (RULE.exertHold) {
      if (this.sprint || this.thrustT > 0 || this.stabbing || this.pound > 0) this.lastExert = now;
    } else if (this.sprint && this.shield < RULE.shield) {
      this.lastDmg = Math.max(this.lastDmg, now - (RULE.regenDelay - 0.7));
      return 0;
    }
    let ev = 0;
    if (now - Math.max(this.lastDmg, this.lastExert) > RULE.regenDelay) {
      if (this.shield < RULE.shield) {
        if (this.shield <= 0) ev = 1;
        this.shield = Math.min(RULE.shield, this.shield + RULE.shieldRate * dt);
      } else this.health = Math.min(RULE.health, this.health + RULE.healthRate * dt);
    }
    return ev;
  };
  const dmg0 = B.damage;
  B.damage = function (n, now) {
    /* world/physics.js Body.damage's spawn protection, with RULE's length */
    if (
      RULE.spawnProt !== 1.2 &&
      !this.dead &&
      now >= this.spawnT + RULE.spawnProt &&
      now < this.spawnT + 1.2
    ) {
      const s = this.spawnT;
      this.spawnT = now - 1.2;
      const r = dmg0.call(this, n, now);
      this.spawnT = s;
      return r;
    }
    if (RULE.spawnProt > 1.2 && now < this.spawnT + RULE.spawnProt) return false;
    return dmg0.call(this, n, now);
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
  /* aim magnetism: while an AI pilot fires a spread weapon, a ray that misses a pilot but passes within
     RULE.magnet of the body's axis (at a height inside the body) counts as a body hit */
  let spreadShot = false;
  const shoot0 = A.shoot;
  A.shoot = function (tgt) {
    spreadShot = !!RULE.magnet && !this.armed && !this.gun().precision;
    try {
      return shoot0.call(this, tgt);
    } finally {
      spreadShot = false;
    }
  };
  const rt0 = K.rayTarget;
  K.rayTarget = function (o, d, p, h, maxT) {
    const r = rt0(o, d, p, h, maxT);
    if (r || !spreadShot) return r;
    const L = Math.hypot(d.x, d.z) || 1e-9,
      t = ((p.x - o.x) * d.x + (p.z - o.z) * d.z) / (L * L);
    if (t <= 0 || t >= maxT) return null;
    const dx = o.x + d.x * t - p.x,
      dz = o.z + d.z * t - p.z,
      y = o.y + d.y * t;
    return Math.hypot(dx, dz) < 0.4 + RULE.magnet && y > p.y && y < p.y + h - 0.45
      ? { t, head: false }
      : null;
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
/* interpolated AI levels, for the rating ladder only: r33 and r67 a third and two thirds of the way
   from Recruit to Normal, n33 n67 from Normal to Heroic, h33 h67 from Heroic to Legendary (the four
   real levels are untouched) */
{
  const LV = ["recruit", "normal", "heroic", "legendary"],
    S = K.AI_SKILL;
  for (let i = 0; i < 3; i++)
    for (const f of [1 / 3, 2 / 3]) {
      const a = S[LV[i]],
        b = S[LV[i + 1]],
        o = {};
      for (const k of Object.keys(a)) o[k] = typeof a[k] === "number" ? a[k] + (b[k] - a[k]) * f : a[k];
      S[LV[i][0] + (f < 0.5 ? "33" : "67")] = o;
    }
}
/* ---- restricted play (Jaffe): in a skill match the second team plays without one verb or weapon
   (ruMinus), or over-uses one (ruPrefer, a decoy). Same levels on both sides (PAIR=normal,normal):
   the reported skill share is then the full team's share ---- */
const VERBS = [
  "",
  "melee",
  "backmelee",
  "frag",
  "plasma",
  "magnum",
  "carbine",
  "sniper",
  "rocket",
  "thrust",
  "slide",
  "clamber",
  "pound",
  "charge",
  "sprint",
  "hover",
];
const PREFS = ["", "magnum", "carbine", "nades", "melee"];
const RP = { minus: "", prefer: "" };
/** the melee swing being resolved (for the back-melee restriction and swing accuracy) */
let CUR_SWING = null;
Object.assign(KNOBS, {
  ruMinus: { set: v => (RP.minus = VERBS[v]), def: 0, try: VERBS.map((_, i) => i).slice(1) },
  ruPrefer: { set: v => (RP.prefer = PREFS[v]), def: 0, try: [1, 2, 3, 4] },
  /* melee reach and back cone (data/weapons.js MELEE): -0.5 is about 120 degrees off the facing
     (a back cone of +-60), -0.77 about 140 (+-40) */
  ruMeleeRange: { set: v => (K.MELEE.range = v), def: 2.3, try: [1.725, 1.15] },
  ruMeleeBack: { set: v => (K.MELEE.back = v), def: -0.35, try: [-0.5, -0.77] },
  /* flag carriers (not the rules: simulation variants): 1 lets the AI carrier sprint, a speed
     multiple, a damage multiple; a skull carrier's speed multiple */
  ruCarrySprint: { set: rule("carrySprint"), def: 0, try: [1] },
  ruCarrySpeed: { set: rule("carrySpeed"), def: 1, try: [1.2] },
  ruCarryDmg: { set: rule("carryDmg"), def: 1, try: [0.8] },
  ruBallSpeed: { set: rule("ballSpeed"), def: 1, try: [0.9] },
  /* spawn veto: never spawn where an enemy can see the spot or closer than this many metres */
  ruSpawnVeto: { set: rule("spawnVeto"), def: 0, try: [15, 20, 25] },
  /* wave respawns: everyone dead comes back on the next multiple of this many seconds */
  ruWave: { set: rule("wave"), def: 0, try: [6] },
});
Object.assign(RULE, { carrySprint: 0, carrySpeed: 1, carryDmg: 1, ballSpeed: 1, spawnVeto: 0, wave: 0 });
Object.assign(RULE_DEF, { carrySprint: 0, carrySpeed: 1, carryDmg: 1, ballSpeed: 1, spawnVeto: 0, wave: 0 });
{
  const A = CTF.Agent.prototype,
    B = K.Body.prototype;
  const think0 = A.think;
  A.think = function (dt) {
    const inp = think0.call(this, dt);
    if (!inp) return inp;
    const b = this.body,
      m = this.__minus,
      p = this.__prefer;
    const charging = b.sprintT > 0.85 && b.ground;
    if (m === "melee" && !charging) inp.meleeP = false;
    else if (m === "charge" && charging) inp.meleeP = false;
    else if (m === "thrust") inp.thrust = false;
    else if (m === "sprint") inp.sprint = false;
    else if (m === "slide" && b.ground) inp.crouchP = false;
    else if (m === "pound" && !b.ground) {
      inp.crouchP = false;
      inp.crouch = false;
      this.poundHold = 0;
    } else if (m === "hover" && !b.ground) inp.aim = false;
    /* the melee decoy: swing at anyone close */
    if (p === "melee" && this.target && this.target.alive && this.pos.distanceTo(this.target.pos) < 5) {
      inp.meleeP = true;
      inp.sprint = true;
    }
    const G = this.G;
    if (this.carrying && this.carrying !== G.ball) {
      if (RULE.carrySprint && inp.f > 0.5) inp.sprint = true;
      if (RULE.carrySpeed !== 1) b.speedMul = RULE.carrySpeed;
    } else if (this.carrying && RULE.ballSpeed !== 1) b.speedMul = RULE.ballSpeed;
    return inp;
  };
  const pick0 = A.pickGun;
  A.pickGun = function (tgt) {
    const m = this.__minus,
      p = this.__prefer;
    if (m === "magnum" || p === "carbine") return 0;
    if (m === "carbine" || p === "magnum") return 1;
    return pick0.call(this, tgt);
  };
  const throwR = A.throwNade;
  A.throwNade = function (type, at) {
    if (this.__minus && this.__minus === type) {
      this.nadeCD = 1.5;
      return;
    }
    if (this.__stats && type === "frag") this.__stats.thrown++;
    const r = throwR.call(this, type, at);
    if (this.__prefer === "nades") this.nadeCD *= 0.3;
    return r;
  };
  const onEvent0 = A.onEvent;
  A.onEvent = function (type, d) {
    if (type !== "melee") return onEvent0.call(this, type, d);
    CUR_SWING = { a: this, hit: false };
    try {
      return onEvent0.call(this, type, d);
    } finally {
      if (this.__stats) {
        this.__stats.swings++;
        if (CUR_SWING.hit) this.__stats.swingHits++;
      }
      CUR_SWING = null;
    }
  };
  const behind0 = K.meleeBehind;
  K.meleeBehind = function (ax, az, vx, vz, yaw) {
    if (CUR_SWING && CUR_SWING.a.__minus === "backmelee") return false;
    return behind0(ax, az, vx, vz, yaw);
  };
  /* a frag's blast: did it land within 3 m of an enemy? */
  const own0 = A.nadeOwner;
  A.nadeOwner = function () {
    const own = own0.call(this),
      me = this;
    if (!own.__ladder) {
      own.__ladder = true;
      const ex = own.onExplode;
      own.onExplode = (c, type, stuck) => {
        if (me.__stats && type === "frag") {
          let d = 99;
          for (const e of me.G.foes(me.team)) if (e.alive) d = Math.min(d, e.body.pos.distanceTo(c));
          me.__stats.frags++;
          if (d < 3) me.__stats.fragNear++;
        }
        return ex(c, type, stuck);
      };
    }
    return own;
  };
  const stepC = B.step;
  B.step = function (dt, inp, ev) {
    const r = stepC.call(this, dt, inp, ev);
    if (this.__noClamber && this.clamber) this.clamber = null;
    return r;
  };
  /* the spawn veto: drop every spot an enemy can see or is within RULE.spawnVeto of (all of them
     vetoed: the usual choice) */
  const V3 = K.THREE.Vector3,
    _e = new V3(),
    _d = new V3();
  const seen = (s, f) => {
    _e.set(f.pos.x, f.pos.y + (f.h || K.H_STAND) - 0.2, f.pos.z);
    _d.set(s[0], s[1] + 1.2, s[2]).sub(_e);
    const L = _d.length();
    if (L < 1e-3) return true;
    _d.multiplyScalar(1 / L);
    return K.rayWorld(_e, _d, L) >= L - 0.3;
  };
  const spawn0 = K.pickSpawn;
  K.pickSpawn = function (points, foes, fights, t, rand01, taken) {
    if (RULE.spawnVeto > 0 && foes && foes.length) {
      const ok = points.filter(s =>
        foes.every(f => Math.hypot(s[0] - f.pos.x, s[2] - f.pos.z) >= RULE.spawnVeto && !seen(s, f))
      );
      if (ok.length) points = ok;
    }
    return spawn0(points, foes, fights, t, rand01, taken);
  };
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
KNOBS.sbMagHead.def = W("pistol").head;
KNOBS.sbCarbHead.def = W("carbine").head;
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
  ["sbSprintRamp", "sprintRamp"],
  ["sbSlideT", "slideT"],
  ["sbClamber", "clamberK"],
])
  KNOBS[k].def = K.TUNE_DEF[f];
KNOBS.sbNadeThrow.def = K.NADE_TUNE.throw;
KNOBS.sbNadeBounce.def = K.NADE_TUNE.bounce;
let CUR_MINUS_TEAM = -1;
function resetAll() {
  RP.minus = RP.prefer = "";
  K.MELEE.range = 2.3;
  K.MELEE.back = -0.35;
  for (const k of Object.keys(KNOBS)) KNOBS[k].set(KNOBS[k].def);
  Object.assign(RULE, RULE_DEF);
  K.WEAPON_DATA.forEach((w, i) => (w.reserve = RES_DEF[i]));
  if (process.env.GATES === "1") K.LABS.gates = true;
}
/** one match: returns kills by team, captures, times to kill and grenade outcomes */
function match(diff, seed, lock) {
  K.STORE.setBackend(K.STORE.memoryBackend());
  /* aiMemory: two earlier matches on the same map (other seeds) teach the AI where fights happen */
  let memory = null;
  if (AIMEM.on) {
    for (const s of [seed + 50000, seed + 60000]) {
      const T = CTF.Game({
        mode: "sim",
        render: false,
        seed: s,
        diff,
        map: MAPID,
        rules: RULES,
        perTeam: TEAM,
        memory,
        saveMemory: false,
      });
      if (!memory) memory = T.mem = new CTF.MapMemory(CTF.MAP, null);
      T.start();
      for (let i = 0; i < 3 * 60 * 30 && !T.over; i++) T.step(1 / 30);
      if (!T.over) memory.commit();
    }
  }
  /* everything but capture the flag plays the full time (a score limit would end matches at different
     lengths) */
  /* free-for-all: the two skill levels alternate between pilots, so "team" below is the pilot's half */
  const side = a => (G.ffa ? a.team % 2 : a.team);
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
    memory,
    saveMemory: false,
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
  if (MIXR && diff[0] !== diff[1]) {
    const worse = diff[0] === PAIR[0] ? 1 : 0;
    G.teams[worse].agents.forEach((a, i) => setLevel(a, i < MIXR ? PAIR[1] : PAIR[0]));
  }
  /* restricted play: the second team of a skill match (CUR_MINUS_TEAM) plays without RP.minus or
     prefers RP.prefer */
  for (const a of G.agents) {
    a.__stats = { swings: 0, swingHits: 0, thrown: 0, frags: 0, fragNear: 0 };
    if (CUR_MINUS_TEAM >= 0 && side(a) === CUR_MINUS_TEAM) {
      a.__minus = RP.minus;
      a.__prefer = RP.prefer;
      if (RP.minus === "clamber") a.body.__noClamber = true;
    }
  }
  const arm0 = G.arm;
  G.arm = (a, type, ammo) =>
    a.__minus && a.__minus === K.WEAPON_DATA[type].key ? undefined : arm0(a, type, ammo);
  /* wave respawns */
  const kill0 = G.kill;
  G.kill = (v, k, type, head) => {
    const r = kill0(v, k, type, head);
    if (RULE.wave && v.respawnAt) v.respawnAt = Math.ceil(v.respawnAt / RULE.wave) * RULE.wave;
    return r;
  };

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
    /* per side (team; free-for-all: the skill half): deaths, by melee and by grenade, spawn deaths,
       headshot kills, times from first hit to death, flag grabs */
    sd: [
      { deaths: 0, melee: 0, nade: 0, spawn: 0, head: 0, ttd: [], grabs: 0 },
      { deaths: 0, melee: 0, nade: 0, spawn: 0, head: 0, ttd: [], grabs: 0 },
    ],
    /* HEAT=1: where pilots were (once a second), died and killed from, in 2 m cells; spawn deaths
       per spawn point */
    heat: HEAT ? { occ: {}, death: {}, kill: {}, spawn: {}, zocc: {}, zdeath: {}, zkill: {} } : null,
    /* lives: [seconds alive, 1 died / 0 still alive at the end, side]; engagements and escapes
       (an engagement that ended without the victim dying) by the victim's side; seconds alive and
       seconds fighting (fired or was hit in the last second) by side; carries for survival curves:
       [seconds, metres, 2 captured / 1 lost / 0 still carrying]; melee and frag accuracy by side */
    lives: [],
    eng: [0, 0],
    esc: [0, 0],
    alive: [0, 0],
    fight: [0, 0],
    carryKM: [],
    comp: [
      { swings: 0, swingHits: 0, thrown: 0, frags: 0, fragNear: 0 },
      { swings: 0, swingHits: 0, thrown: 0, frags: 0, fragNear: 0 },
    ],
  };
  const takenAt = new Map(),
    carryFrom = new Map();
  const cell = p => `${Math.floor(p.x / 2)},${Math.floor(p.z / 2)}`;
  const zone = p => K.zoneLabel(CTF.MAP, p, -1) || "(no zone)";
  const bump = (o, k) => (o[k] = (o[k] || 0) + 1);
  const carryEnd = (a, how) => {
    if (!carryFrom.has(a)) return;
    out.carryKM.push([
      +(G.t - carryFrom.get(a)).toFixed(1),
      +(a.__cd || 0).toFixed(1),
      how === "capture" ? 2 : how === "reset" ? 0 : 1,
    ]);
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
      if (v.__sp != null) out.lives.push([+(G.t - v.__sp).toFixed(1), 1, side(v)]);
      if (k && k !== v) {
        const S = out.sd[side(v)];
        S.deaths++;
        if (/melee|charge|flag|skull|pound/.test(w)) S.melee++;
        if (/frag|stick|plasma|nade/.test(w)) S.nade++;
        if (v.__sp != null && G.t - v.__sp < 3) S.spawn++;
        if (v.__first != null) S.ttd.push(+(G.t - v.__first).toFixed(2));
        if (d.head && k.team !== v.team) out.sd[side(k)].head++;
      }
      if (v.__sp != null && G.t - v.__sp < 3) {
        out.spawnDeaths++;
        if (out.heat && v.__spAt) bump(out.heat.spawn, v.__spAt);
      }
      v.__sp = null;
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
      out.sd[side(d.by)].grabs++;
      carryFrom.set(d.by, G.t);
      d.by.__cd = 0;
      d.by.__cp = d.by.pos.clone();
      /* time to capture runs from the grab at the stand */
      if (!takenAt.has(d.flag) && d.flag.pos.distanceTo(CTF.FLAG_HOME[d.flag.team]) < 2)
        takenAt.set(d.flag, G.t);
    } else if (t === "flagReset" || t === "flagReturn") takenAt.delete(d.flag);
    else if (t === "ballTaken") {
      out.turns++;
      carryFrom.set(d.by, G.t);
      d.by.__cd = 0;
      d.by.__cp = d.by.pos.clone();
    } else if ((t === "flagDrop" || t === "ballDrop") && d.by && !d.by.dead && !d.killer)
      carryEnd(d.by, "dropped");
  };
  G.start();
  /* NOVICE=1: team 0's first pilot plays like a new player (see NOVICE_SKILL) */
  const nv = NOVICE ? G.teams[0].agents[0] : null,
    nvLives = [],
    nvHurt = [],
    nvHow = {};
  let nvFocus = 0;
  if (nv) {
    nv.skill = () => NOVICE_SKILL;
    const think = nv.think.bind(nv);
    nv.think = dt => {
      const inp = think(dt),
        t = nv.target;
      /* no strafing in a fight, no thrust, slide, pound or jink; melee only with someone in your face */
      if (t && G.t >= nv.acqT) inp.s = 0;
      inp.thrust = false;
      inp.crouchP = false;
      inp.crouch = false;
      if (t && inp.jumpP && nv.stuckT <= 0.5) inp.jumpP = false;
      if (inp.meleeP && !(t && t.pos.distanceTo(nv.pos) < 1.8)) inp.meleeP = false;
      return inp;
    };
    const prev = G.onEvent;
    G.onEvent = (t, d) => {
      prev(t, d);
      if (t === "damage" && d.victim === nv && d.by && d.by !== nv) nvHurt.push([G.t, d.by]);
      else if (t === "kill" && d.victim === nv) {
        const by = new Set(nvHurt.filter(([at]) => G.t - at < 3).map(([, a]) => a));
        if (by.size >= 2) nvFocus++;
        nvHurt.length = 0;
        const w = d.type || "?",
          k = /melee|charge|flag|skull/.test(w)
            ? "melee"
            : /frag|stick|rocket/.test(w)
              ? "explosive"
              : w === "pod"
                ? "pod"
                : "gun";
        nvHow[k] = (nvHow[k] || 0) + 1;
        if (nv.__sp != null) nvLives.push(G.t - nv.__sp);
      }
    };
  }
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
      if (a.__first == null || G.t - a.__lastHit > 3) {
        /* a new engagement; the last one (if any) ended without a death: an escape */
        if (a.__first != null) out.esc[side(a)]++;
        out.eng[side(a)]++;
        a.__first = G.t;
      }
      a.__lastHit = G.t;
      if (CUR_SWING && att === CUR_SWING.a) CUR_SWING.hit = true;
      if (RULE.carryDmg !== 1 && a.carrying && a.carrying !== G.ball && n < 999)
        n = Math.max(1, Math.round(n * RULE.carryDmg));
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
  const lanes = !!CTF.MAP.lanes,
    timeline = [];
  for (let i = 0; i < steps && !G.over; i++) {
    G.step(1 / 30);
    if (i % 30) continue;
    /* the score once a second: half time is half of the match actually played */
    timeline.push(scores());
    /* once a second: what each pilot holds, and where the ones in the middle of the map are */
    for (const a of G.agents) {
      if (!a.alive) continue;
      const s = side(a);
      out.alive[s]++;
      if (G.t - (a.firedT || -9) < 1 || G.t - (a.__lastHit || -99) < 1) out.fight[s]++;
      if (a.carrying && a.__cp) {
        a.__cd += a.__cp.distanceTo(a.pos);
        a.__cp.copy(a.pos);
      }
      const key = K.WEAPON_DATA[a.held()].key;
      out.held[key] = (out.held[key] || 0) + 1;
      if (lanes && Math.abs(a.pos.z) < 30) out.lanes[CTF.worldLane(a.pos.x)]++;
      if (out.heat) {
        bump(out.heat.occ, cell(a.pos));
        bump(out.heat.zocc, zone(a.pos));
      }
    }
  }
  out.half = timeline[timeline.length >> 1] || scores();
  /* how many times the lead changed hands (ties don't count as a change) */
  let leader = -1;
  out.leadChanges = 0;
  for (const s of timeline) {
    const l = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1;
    if (l >= 0 && leader >= 0 && l !== leader) out.leadChanges++;
    if (l >= 0) leader = l;
  }
  out.final = scores();
  /* lame-duck time: the share of the match after the last change of lead (Isaksen) */
  let last = -1,
    lead = -1;
  timeline.forEach((s, i) => {
    const l = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1;
    if (l >= 0 && l !== lead) {
      last = i;
      lead = l;
    }
  });
  out.lameDuck = last >= 0 && timeline.length ? +(1 - last / timeline.length).toFixed(3) : null;
  for (const a of G.agents) {
    if (a.alive && a.__sp != null) out.lives.push([+(G.t - a.__sp).toFixed(1), 0, side(a)]);
    for (const k of Object.keys(out.comp[0])) out.comp[side(a)][k] += a.__stats[k];
  }
  out.pk = G.agents.map(a => a.k);
  if (nv) {
    if (nv.alive && nv.__sp != null) nvLives.push(G.t - nv.__sp);
    out.novice = { k: nv.k, d: nv.d, lives: nvLives, focus: nvFocus, how: nvHow, min: G.t / 60 };
  }
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
    /* restricted play applies to the second team of a skill match (the first is the full agent) */
    CUR_MINUS_TEAM = job.kind === "skill" ? (job.m % 2 === 1 ? 0 : 1) : -1;
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
    vr.left = MATCHES * (SKILLONLY ? 1 : 2);
    vr.res = [];
    for (let m = 0; m < MATCHES; m++) {
      const swap = m % 2 === 1;
      const base = { vi, m, knob: vr.knob, value: vr.value, lock: vr.lock };
      jobs.push({ ...base, kind: "skill", diff: swap ? [PAIR[1], PAIR[0]] : [PAIR[0], PAIR[1]] });
      jobs[jobs.length - 1].seed = SEED + m;
      if (!SKILLONLY) jobs.push({ ...base, kind: "even", diff: [EVEN, EVEN], seed: SEED + 1000 + m });
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
/** a 95% interval for the better side's kill share, resampling whole matches (seeded, so repeatable) */
function bootCI(pm) {
  let s = 12345;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  for (let b = 0; b < 1000; b++) {
    let x = 0,
      y = 0;
    for (let i = 0; i < pm.length; i++) {
      const m = pm[(r() * pm.length) | 0];
      x += m[0];
      y += m[1];
    }
    out.push(x / Math.max(1, x + y));
  }
  out.sort((a, b) => a - b);
  return [+out[25].toFixed(3), +out[974].toFixed(3)];
}
/** Kaplan-Meier survival at the given times, from [time, event 1 / censored 0] */
function km(list, at) {
  const s = list.slice().sort((a, b) => a[0] - b[0]);
  let n = s.length,
    S = 1,
    i = 0;
  const out = {};
  for (const t of at) {
    while (i < s.length && s[i][0] <= t) {
      if (s[i][1]) S *= 1 - 1 / n;
      n--;
      i++;
    }
    out[t] = +S.toFixed(3);
  }
  return out;
}
/** the spawn hazard ratio: deaths a second alive in the first 3 s over the same in 10-30 s */
function hazard(lives) {
  const rate = (a, b) => {
    let d = 0,
      exp = 0;
    for (const [T, died] of lives) {
      if (T <= a) continue;
      exp += Math.min(T, b) - a;
      if (died && T <= b) d++;
    }
    return exp > 0 ? d / exp : 0;
  };
  const late = rate(10, 30);
  return late > 0 ? +(rate(0, 3) / late).toFixed(2) : null;
}
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
  novice: r.novice,
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
  leadChanges: r.leadChanges,
  spread: r.killSpread,
  margin: r.margin,
  ttc: r.ttc,
  lanes: r.lanes,
  lifeShots: r.lifeShots,
  ladder: r.ladder,
  std: r.std,
});
/** a variant's matches: skill matches (legendary on team 0, then swapped sides) and even matches */
/** the novice (NOVICE=1) over a variant's even matches */
function noviceSum(list) {
  if (!list.length) return null;
  const k = list.reduce((a, n) => a + n.k, 0),
    d = list.reduce((a, n) => a + n.d, 0),
    min = list.reduce((a, n) => a + n.min, 0),
    focus = list.reduce((a, n) => a + n.focus, 0),
    lives = list.flatMap(n => n.lives),
    how = {};
  for (const n of list) add(how, n.how);
  return {
    kd: +(k / Math.max(1, d)).toFixed(2),
    kpm: +(k / Math.max(0.01, min)).toFixed(2),
    dpm: +(d / Math.max(0.01, min)).toFixed(2),
    life: +median(lives).toFixed(1),
    focus: +(focus / Math.max(1, d)).toFixed(2),
    how: shares(how),
  };
}
function summarize(vr) {
  const nov = [];
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
    leadWon = 0,
    leadChanges = 0;
  /* the ladder: the worse side in the skill matches (W) against the better (B) */
  const LW = { deaths: 0, melee: 0, nade: 0, spawn: 0, head: 0, ttd: [], grabs: 0, kills: 0 },
    LB = { deaths: 0, melee: 0, nade: 0, spawn: 0, head: 0, ttd: [], grabs: 0, kills: 0 };
  /* the standing measures (skill matches): per side W (worse) and B (better) */
  const SX = [0, 1].map(() => ({
    lives: [],
    eng: 0,
    esc: 0,
    alive: 0,
    fight: 0,
    comp: { swings: 0, swingHits: 0, thrown: 0, frags: 0, fragNear: 0 },
  }));
  const perMatch = [],
    carryKM = [],
    lame = [],
    entropy = [];
  let sCaps = 0,
    sTurns = 0,
    sMin = 0,
    sEng = 0;
  const sLanes = [0, 0, 0],
    meleeK = [0, 0];
  let lMatches = 0,
    lWins = 0,
    lDecided = 0,
    lTouch = 0;
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
      if (r.lives) {
        /* SX[0] the better side, SX[1] the worse */
        for (const [T, died, s] of r.lives) SX[s === L ? 0 : 1].lives.push([T, died]);
        for (const s of [0, 1]) {
          const X = SX[s === L ? 0 : 1];
          X.eng += r.eng[s];
          X.esc += r.esc[s];
          X.alive += r.alive[s];
          X.fight += r.fight[s];
          for (const k of Object.keys(X.comp)) X.comp[k] += r.comp[s][k];
        }
        perMatch.push([r.k[L], r.k[1 - L]]);
        carryKM.push(...r.carryKM);
        if (r.lameDuck != null) lame.push(r.lameDuck);
        const pk = (r.pk || []).filter(v => v > 0),
          n = pk.reduce((a, b) => a + b, 0);
        if (n > 0 && r.pk.length > 1)
          entropy.push(-pk.reduce((a, v) => a + (v / n) * Math.log(v / n), 0) / Math.log(r.pk.length));
        sCaps += r.cap[0] + r.cap[1];
        sTurns += r.turns || 0;
        sMin += r.min || MINUTES;
        sEng += r.eng[0] + r.eng[1];
        for (let i = 0; i < 3; i++) sLanes[i] += (r.lanes || [0, 0, 0])[i];
        /* melee kills by side (r.wk0 is team / skill-half 0's) */
        for (const [w, n] of Object.entries(r.wk || {}))
          if (/melee|charge|flag|skull|pound/.test(w)) {
            const t0 = (r.wk0 || {})[w] || 0;
            meleeK[0] += L === 0 ? t0 : n - t0;
            meleeK[1] += L === 0 ? n - t0 : t0;
          }
      }
      if (r.sd) {
        lMatches++;
        for (const [S, from] of [
          [LB, r.sd[L]],
          [LW, r.sd[1 - L]],
        ]) {
          for (const k of ["deaths", "melee", "nade", "spawn", "head", "grabs"]) S[k] += from[k];
          S.ttd.push(...from.ttd);
        }
        LB.kills += r.k[L];
        LW.kills += r.k[1 - L];
        /* who won: the score (kills, captures or skull seconds) at the end */
        const f = r.final || [0, 0];
        if (f[0] !== f[1]) {
          lDecided++;
          if (f[1 - L] > f[L]) lWins++;
        }
        /* did the worse side ever touch the objective (flag grabbed, skull held)? */
        if (r.sd[1 - L].grabs > 0 || (r.hold && r.hold[1 - L] > 0)) lTouch++;
      }
      add(swk, r.wk);
      /* r.wk0 counts team 0's kills; the better team is team L */
      for (const [w, n] of Object.entries(r.wk || {})) {
        const t0 = (r.wk0 || {})[w] || 0;
        swkL[w] = (swkL[w] || 0) + (L === 0 ? t0 : n - t0);
      }
    } else {
      nEven++;
      if (r.novice) nov.push(r.novice);
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
      leadChanges += r.leadChanges || 0;
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
    /* NOVICE=1: how the novice player fares against the even matches' level */
    novice: noviceSum(nov),
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
    leadChanges: +(leadChanges / Math.max(1, nEven)).toFixed(2),
    killSpread: spreads.length ? +(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(3) : null,
    margin: margins.length ? +(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(2) : null,
    heat: HEAT ? heat : undefined,
    /* the ladder, from the skill matches: the worse side's K/D, median time to death once hit, share
       of its deaths by melee, by grenade and within 3 s of spawning, the share of matches it won, and
       of matches where it touched the objective; both sides' headshot share of their kills */
    ladder: lMatches
      ? {
          wKD: +(LW.kills / Math.max(1, LW.deaths)).toFixed(3),
          wTTD: +median(LW.ttd).toFixed(2),
          bTTD: +median(LB.ttd).toFixed(2),
          wMelee: +(LW.melee / Math.max(1, LW.deaths)).toFixed(3),
          wNade: +(LW.nade / Math.max(1, LW.deaths)).toFixed(3),
          wSpawn: +(LW.spawn / Math.max(1, LW.deaths)).toFixed(3),
          wWins: +(lWins / Math.max(1, lDecided)).toFixed(3),
          wTouch: +(lTouch / lMatches).toFixed(3),
          wHead: +(LW.head / Math.max(1, LW.kills)).toFixed(3),
          bHead: +(LB.head / Math.max(1, LB.kills)).toFixed(3),
          decided: lDecided,
          wWon: lWins,
        }
      : null,
    /* the standing measures from the skill matches (b better side, w worse): a 95% interval for the
       skill share from a bootstrap over whole matches; win rate beside kill share; the spawn hazard
       ratio (deaths a second in the first 3 s alive over 10-30 s alive); survival curves; escape rate;
       the share of time spent fighting; melee and frag accuracy; lame-duck time and kill entropy;
       guards (captures and engagements per match and minute, skull changes of hands) */
    std: perMatch.length
      ? {
          skillCI: bootCI(perMatch),
          bWin: lDecided ? +(1 - lWins / lDecided).toFixed(3) : null,
          hazard: [hazard(SX[0].lives), hazard(SX[1].lives)],
          survive: [km(SX[0].lives, [3, 10, 30, 60]), km(SX[1].lives, [3, 10, 30, 60])],
          escape: SX.map(X => +(X.esc / Math.max(1, X.eng)).toFixed(3)),
          fighting: SX.map(X => +(X.fight / Math.max(1, X.alive)).toFixed(3)),
          meleeHit: SX.map(X => +(X.comp.swingHits / Math.max(1, X.comp.swings)).toFixed(3)),
          swingsPerMin: SX.map(X => +(X.comp.swings / Math.max(0.01, sMin)).toFixed(2)),
          fragNear: SX.map(X => +(X.comp.fragNear / Math.max(1, X.comp.frags)).toFixed(3)),
          fragsPerMin: SX.map(X => +(X.comp.frags / Math.max(0.01, sMin)).toFixed(2)),
          carryHold: carryKM.length
            ? km(
                carryKM.map(c => [c[0], c[2] === 1 ? 1 : 0]),
                [5, 10, 20, 30]
              )
            : null,
          carryDist: carryKM.length
            ? km(
                carryKM.map(c => [c[1], c[2] === 1 ? 1 : 0]),
                [10, 20, 30, 50]
              )
            : null,
          carryCapture: carryKM.length
            ? +(carryKM.filter(c => c[2] === 2).length / carryKM.length).toFixed(3)
            : null,
          lameDuck: lame.length ? +(lame.reduce((a, b) => a + b, 0) / lame.length).toFixed(3) : null,
          entropy: entropy.length ? +(entropy.reduce((a, b) => a + b, 0) / entropy.length).toFixed(3) : null,
          capsPerMatch: +(sCaps / perMatch.length).toFixed(2),
          turnsPerMatch: +(sTurns / perMatch.length).toFixed(1),
          engPerMin: +(sEng / Math.max(0.01, sMin)).toFixed(1),
          /* melee's share of each side's kills; lane use in the middle of a lane map */
          meleeKills: [+(meleeK[0] / Math.max(1, kL)).toFixed(3), +(meleeK[1] / Math.max(1, kN)).toFixed(3)],
          lanes:
            sLanes[0] + sLanes[1] + sLanes[2]
              ? sLanes.map(n => +(n / (sLanes[0] + sLanes[1] + sLanes[2])).toFixed(3))
              : null,
        }
      : null,
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
