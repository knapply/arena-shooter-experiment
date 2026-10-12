/* ============ MODE SETTINGS ============
   The numbers that define each game mode. Modes read these instead of hard-coding them, so a
   playlist, a custom game screen or a mode file only has to change data. */
const MODE_DATA = {
  ffa: { name: "Free for all", scoreLimit: 15, timeLimit: 600, respawn: 5, restartDelay: 8 },
  ctf: { name: "Capture the flag", scoreLimit: 3, timeLimit: 480, respawn: 6, teamSize: 4 },
};
/* AI skill levels, shared by CTF agents and arena drones.
   react    seconds from spotting someone to engaging (and to re-targeting)
   err      aim error, radians-ish per metre of range (scaled up while moving or airborne)
   turn     how fast they turn (radians per second)
   magErr   extra aim error with the magnum (a precision weapon needs a steadier hand)
   magPace  extra pause between magnum shots on top of its fire rate (trigger discipline)
   magFrom  range in metres from which they prefer the magnum over the carbine */
const AI_SKILL = {
  normal: { react: 0.32, err: 0.035, turn: 7, magErr: 1.15, magPace: 0.16, magFrom: 20 },
  heroic: { react: 0.24, err: 0.022, turn: 10, magErr: 1.05, magPace: 0.08, magFrom: 18 },
  legendary: { react: 0.17, err: 0.013, turn: 14, magErr: 0.95, magPace: 0.03, magFrom: 16 },
};
/* drop pods fall from POD_HEIGHT metres in POD_TIME seconds (a re-entry burn visible across the map) */
const POD_TIME = 2.6,
  POD_HEIGHT = 200;
/* the longer fall is spectacle only: a pod launches POD_EARLY seconds before the respawn time, so
   wait + fall is the same as it was with the old 1.35 s drop (an in-place spawn is unchanged) */
const POD_EARLY = POD_TIME - 1.35;
