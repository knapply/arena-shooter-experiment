/* ============ MODE SETTINGS ============
   The numbers that define each game mode. Modes read these instead of hard-coding them, so a
   playlist, a custom game screen or a mode file only has to change data. */
const MODE_DATA = {
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
const PLAY_MODES = [
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
   Recruit is the gentle start (the default for your first bot match): slow to react, loose aim,
   short sight, few dodges and grenades. */
const AI_SKILL = {
  recruit: {
    react: 0.5,
    err: 0.055,
    turn: 5,
    magErr: 1.3,
    magPace: 0.32,
    magFrom: 22,
    sight: 42,
    dodge: 0.3,
    nades: 0.4,
  },
  normal: {
    react: 0.32,
    err: 0.035,
    turn: 7,
    magErr: 1.15,
    magPace: 0.16,
    magFrom: 20,
    sight: 75,
    dodge: 1,
    nades: 1,
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
  },
};
/* drop pods fall from POD_HEIGHT metres in POD_TIME seconds (a re-entry burn visible across the map),
   slow at first and faster all the way down (see podLeft in game/pods.js) */
const POD_TIME = 3,
  POD_HEIGHT = 320;
/* the longer fall is spectacle only: a pod launches POD_EARLY seconds before the respawn time, so
   wait + fall is the same as it was with the old 1.35 s drop (an in-place spawn is unchanged) */
const POD_EARLY = POD_TIME - 1.35;
