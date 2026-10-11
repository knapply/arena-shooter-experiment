/* ============ MODE SETTINGS ============
   The numbers that define each game mode. Modes read these instead of hard-coding them, so a
   playlist, a custom game screen or a mode file only has to change data. */
const MODE_DATA = {
  ffa: { name: "Free for all", scoreLimit: 15, timeLimit: 600, respawn: 5, restartDelay: 8 },
  ctf: { name: "Capture the flag", scoreLimit: 3, timeLimit: 480, respawn: 6, teamSize: 4 },
};
