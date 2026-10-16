/* ============ MODE SETTINGS ============
   The numbers that define each game mode. Modes read these instead of hard-coding them, so a
   playlist, a custom game screen or a mode file only has to change data. */
export const MODE_DATA = {
  /* free-for-all: the AI match (every pilot for themselves) and the arena's drop-in practice */
  ffa: {
    name: "Free-for-all Slayer",
    scoreLimit: 15,
    timeLimit: 600,
    respawn: 5,
    restartDelay: 8,
    /* pilots in an AI free-for-all match (you included) */
    pilots: 8,
  },
  ctf: {
    name: "Capture the Flag",
    scoreLimit: 3,
    timeLimit: 480,
    respawn: 6,
    teamSize: 4,
    /* a dropped flag goes home after this long */
    flagReset: 15,
  },
  /* team deathmatch: a kill on the other team scores (played as Team Slayer; the AI also plays it on
     the arena for the balance simulations) */
  tdm: { name: "Team Slayer", scoreLimit: 50, timeLimit: 600, respawn: 5, teamSize: 4 },
  /* oddball: the first team to hold the skull for scoreLimit seconds in total wins */
  oddball: {
    name: "Team Oddball",
    scoreLimit: 120,
    timeLimit: 600,
    respawn: 5,
    teamSize: 4,
    /* a skull left on the floor this long is taken away and dropped into the middle again */
    ballReset: 15,
    /* seconds from the start (after any opening drop) until the first skull lands */
    ballFirst: 4,
  },
};
/* the four playable modes, in menu order. `rules` is what modes/ctf/rules.js plays, `data` the
   MODE_DATA entry with its numbers, `maps` the maps it can be played on (the first is the default),
   `unit` what the score counts. The menu cards, intros and results read their words from here. */
export const PLAY_MODES = [
  {
    id: "ctf",
    data: "ctf",
    name: "Capture the Flag",
    short: "CTF",
    line: "Take their flag from their base and bring it home while yours is still there.",
    points: [
      "Hold Interact at their flag to take it",
      "Carrying it: no guns, but a melee kills in one hit",
      "Sprinting or thrusting drops it",
    ],
    teams: true,
    maps: ["ctf"],
    unit: "captures",
  },
  {
    id: "slayer",
    data: "tdm",
    name: "Team Slayer",
    short: "Slayer",
    line: "Red against blue. Every kill on the other team scores a point.",
    points: ["Teams spawn together on opposite sides", "Kills on the other team score"],
    teams: true,
    maps: ["arena", "ctf"],
    unit: "kills",
  },
  {
    id: "ffa",
    data: "ffa",
    name: "Free-for-all Slayer",
    short: "FFA",
    line: "Every pilot for themselves. The first to the kill limit wins.",
    points: ["No teams: everyone is an enemy", "The AI pilots fight each other as well as you"],
    teams: false,
    maps: ["arena", "ctf"],
    unit: "kills",
  },
  {
    id: "oddball",
    data: "oddball",
    name: "Team Oddball",
    short: "Oddball",
    line: "Grab the skull and keep it. The first team to hold it long enough wins.",
    points: [
      "The skull drops by pod into the middle",
      "Holding it: no guns, but a melee kills in one hit",
      "Your team scores every second you hold it",
    ],
    teams: true,
    maps: ["arena", "ctf"],
    unit: "seconds",
  },
];
/* AI skill levels, shared by CTF agents and arena drones.
   react    seconds from spotting someone to engaging (and to re-targeting)
   err      aim error, radians-ish per metre of range (scaled up while moving or airborne)
   turn     how fast they turn (radians per second)
   magErr   extra aim error with the magnum (a precision weapon needs a steadier hand)
   magPace  extra pause between magnum shots on top of its fire rate (trigger discipline)
   magFrom  range in metres from which they prefer the magnum over the carbine
   sight    how far they spot enemies (metres; drones see 60% of it)
   dodge    how often they jink and thrust out of fire (1 = the full repertoire)
   nades    how many grenades they carry and how keen they are to throw (1 = 2 frags + 1 plasma)
   rhythm   the magnum's perfect-kill rhythm (0.5 and up): while landing, fire at its rate exactly;
            after a miss, hold fire until the aim is right on them
   minRange the closest they like to fight from (metres): a new player can't win a brawl, so the low
            levels keep their distance instead of walking into melee range
   melee    how keen they are to melee and charge (1 = every chance; below 1 they hesitate)
   focus    how much they gang up on someone a teammate called as cracked (1 = fully)
   Recruit is the gentle start (the default for your first bot match): slow to react, loose aim,
   short sight, few dodges and grenades, keeps its distance and rarely melees; it was tuned against a
   model of a new player (tools/tune.js NOVICE=1, docs/TUNING.md) to an even fight. Trainee is
   easier still, only reached by adaptive bots after losses. */
export const AI_SKILL = {
  /* not a pick: the floor adaptive bots ease down to when a player keeps losing on Recruit */
  trainee: {
    react: 0.8,
    err: 0.095,
    turn: 2.6,
    magErr: 1.5,
    magPace: 0.6,
    magFrom: 26,
    sight: 30,
    dodge: 0,
    nades: 0,
    rhythm: 0,
    minRange: 14,
    melee: 0.1,
    focus: 0.1,
  },
  recruit: {
    react: 0.58,
    err: 0.068,
    turn: 4,
    magErr: 1.4,
    magPace: 0.42,
    magFrom: 24,
    sight: 40,
    dodge: 0.2,
    nades: 0.3,
    rhythm: 0,
    minRange: 10,
    melee: 0.5,
    focus: 0.4,
  },
  normal: {
    react: 0.42,
    err: 0.05,
    turn: 5.5,
    magErr: 1.2,
    magPace: 0.2,
    magFrom: 20,
    sight: 60,
    dodge: 0.7,
    nades: 0.7,
    rhythm: 0,
    minRange: 8,
    melee: 0.5,
    focus: 0.6,
  },
  heroic: {
    react: 0.24,
    err: 0.022,
    turn: 10,
    magErr: 1.05,
    magPace: 0.08,
    magFrom: 18,
    sight: 75,
    dodge: 1,
    nades: 1,
    rhythm: 0,
    minRange: 0,
    melee: 1,
    focus: 1,
  },
  legendary: {
    react: 0.17,
    err: 0.013,
    turn: 14,
    magErr: 0.95,
    magPace: 0.03,
    magFrom: 16,
    sight: 75,
    dodge: 1,
    nades: 1,
    rhythm: 1,
    minRange: 0,
    melee: 1,
    focus: 1,
  },
};
/* drop pods fall from POD_HEIGHT metres in POD_TIME seconds (a re-entry burn visible across the map),
   slow at first and faster all the way down (see podLeft in game/pods.js) */
export const POD_TIME = 3,
  POD_HEIGHT = 320;
/* the longer fall is spectacle only: a pod launches POD_EARLY seconds before the respawn time, so
   wait + fall is the same as it was with the old 1.35 s drop (an in-place spawn is unchanged) */
export const POD_EARLY = POD_TIME - 1.35;
/* Sandbox presets (Settings → Sandbox): named sets of Sandbox values; anything a preset leaves out goes
   back to its default. "Classic feel" is the reference arena shooter as measured from its footage and
   data-mined values (docs/TUNING.md, "Classic feel"). Each line says what it reproduces. */
export const SANDBOX_PRESETS = {
  defaults: { name: "Defaults", values: {} },
  classic: {
    name: "Classic feel",
    values: {
      /* run 4.31 eye heights/s, sprint 1.3x run, a 0.9 s wind-up to full sprint */
      sbRun: 7,
      sbSprint: 9.1,
      sbSprintRamp: 0.9,
      /* softer ground grip: 0.2 s to start or stop, 0.4 s to reverse a strafe */
      sbAccel: 35,
      sbReverse: 35,
      /* a jump of about 1.5 body heights, 1.33 s in the air */
      sbJump: 8.2,
      sbGrav: 12.3,
      /* a shorter thrust (about 1.6 body heights) on a 4 s recharge, a 0.5 s slide, a 0.6 s clamber */
      sbThrust: 12,
      sbThrustCD: 4,
      sbSlideT: 0.5,
      sbClamber: 2.3,
      sbPoundCharge: 0.65,
      sbPoundRadius: 3.2,
      /* the trigger breaks a sprint and the shot leaves about 2 frames later (no raise delay); a sprint
         comes back only with a fresh sprint press; no slowdown while scoped */
      sbSprintResume: 0,
      sbAdsMove: 1,
      /* shields come back after 4 s and refill in 2 s, health in 6 s; two melee blows kill */
      sbRegenDelay: 4,
      sbShieldRate: 35,
      sbHealthRate: 7.5,
      sbMeleeShield: 70,
      /* magnum: 0.3 s between shots, 1.5x sight, 1.15 s reload, a small kick */
      sbMagRate: 0.3,
      sbMagZoom: 1.5,
      sbMagReload: 1.15,
      sbMagRecoil: 0.009,
      /* carbine (the automatic rifle): 7.8 a round, headshots double once shields are down, a tight
         first shot that blooms, 1.5 s reload, a small kick */
      sbCarbDmg: 7.8,
      sbCarbHead: 2,
      sbCarbSpread: 0.003,
      sbCarbReload: 1.5,
      sbCarbRecoil: 0.006,
      /* sniper: 0.78 s between shots */
      sbSnipeRate: 0.78,
    },
    /* the controller's look response, measured from input-display footage (your own settings, applied
       with the preset): about 105 deg/s at full tilt (from 88% of the stick's travel), a steep curve
       below it, then a boost that ramps evenly with no wait to about 360 deg/s over about 1 s; vertical at half */
    look: {
      padSens: 0.57,
      padCurve: 3,
      padEdge: 0.88,
      padAccel: 2.4,
      padAccelDelay: 0,
      padAccelTime: 1.05,
      padVertical: 0.5,
    },
  },
};
