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
   back to its default. "Classic feel" matches the pacing measured from reference arena-shooter footage
   (docs/TUNING.md, "Classic feel"): a quicker run with a narrower gap to sprint and a sprint that winds
   up, a floatier jump that reaches the same ledges, a shorter slide, a slower clamber, a longer thrust
   cooldown, a short raise before firing out of a sprint, no slowdown while scoped and a slower magnum. */
export const SANDBOX_PRESETS = {
  defaults: { name: "Defaults", values: {} },
  classic: {
    name: "Classic feel",
    values: {
      sbRun: 7,
      sbSprintRamp: 0.8,
      sbJump: 3.4,
      sbGrav: 5.2,
      sbSlideT: 0.5,
      sbClamber: 2.3,
      sbThrustCD: 4,
      sbRaise: 0.15,
      sbAdsMove: 1,
      sbMagRate: 0.28,
    },
  },
};
