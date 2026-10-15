/* ============ GAME MODES ============
   A mode is a small module registered with defineMode({ id, name, settings, start(opts) }). While it
   runs it hands the engine a hooks object through extPlay(hooks) (or extFull for cinematic modes);
   every hook is optional:
     tick(dt)              per frame while playing (rules, AI, networking, HUD)
     targets()             what your shots can hit beyond the arena's pilots: [{ kind: "ext", ref, pos, h }]
     respawn()             place yourself after death;   respawnDelay  seconds dead
     onPlayerDeath(src)    you died (src: who, weapon, headshot)
     onFx(kind, a, b, g)   you threw a grenade or similar, for the mode to network
     pickups()             weapon pickups on the map
     scores(tbody)         fill the scoreboard;   switchTeam()   the team-switch key
     exit()                leaving the mode: clean up everything it made
   The practice arena is the engine's own mode (the arena with drones and online players dropping in)
   and is registered here; the four match modes (capture the flag, Team Slayer, free-for-all and
   oddball, in modes/ctf/modes.js), spectating and (in the trailer build) the trailer register
   themselves from their modules. Numbers come from data/modes.js, with each match mode's rules
   (score and time limits) editable in Settings → Modes (modeRules). */
/** @type {Map<string, { id: string, name: string, settings?: any, start: (opts?: any) => void }>} */
const MODE_DEFS = new Map();
function defineMode(def) {
  MODE_DEFS.set(def.id, def);
  return def;
}
function startMode(id, opts) {
  const d = MODE_DEFS.get(id);
  if (!d) throw new Error("unknown mode " + id);
  d.start(opts || {});
}
const modeList = () => [...MODE_DEFS.values()].map(d => ({ id: d.id, name: d.name }));
/* ---- adaptive bot skill: offline matches start at the picked skill. A loss eases the bots off and a
   win brings them back, never above the picked skill: the pick is the most they will be (down to
   Trainee, easier than Recruit, for a player who keeps losing on Recruit). Settings → Gameplay, on by
   default. Levels run −1 (Trainee) to 3 (Legendary); the AI interpolates between them
   (CTF.skillAt). The level is saved ("botLevel") with the pick it started from, so picking another
   skill starts over from there. ---- */
const BOT_LEVELS = ["recruit", "normal", "heroic", "legendary"];
/** a loss eases the bots off this far, a win brings them back this far (a level is 1) */
const BOT_DOWN = 0.4,
  BOT_UP = 0.25;
/** the level offline bot matches play at now: the adaptive level (never above the pick), or the pick */
function botLevel() {
  const pick = Math.max(0, BOT_LEVELS.indexOf($("botSkill").value));
  if (!SET.adaptBots) return pick;
  const d = STORE.load("botLevel");
  return d && d.base === $("botSkill").value && d.lvl != null ? Math.min(d.lvl, pick) : pick;
}
/** a level's name: the nearest skill, with + or − in between ("Normal+", "Heroic−", "Trainee") */
function botLevelName(l) {
  const i = Math.round(l),
    off = l - i,
    n = i < 0 ? "trainee" : BOT_LEVELS[i];
  return n[0].toUpperCase() + n.slice(1) + (off > 0.12 ? "+" : off < -0.12 ? "−" : "");
}
/** after an offline match: score 1 (won) to −1 (lost) moves the bots; returns { from, to } or null */
function botAdapt(score) {
  if (!SET.adaptBots) return null;
  const pick = Math.max(0, BOT_LEVELS.indexOf($("botSkill").value)),
    sc = clamp(score, -1, 1),
    from = botLevel(),
    to = clamp(Math.round((from + sc * (sc < 0 ? BOT_DOWN : BOT_UP)) * 100) / 100, -1, pick);
  STORE.save("botLevel", { lvl: to, base: $("botSkill").value });
  return { from, to };
}
/** the results screen's line about it: "Bots next match: Heroic− (up from Normal+)" */
function botAdaptNote(r) {
  if (!r) return "";
  const a = botLevelName(r.from),
    b = botLevelName(r.to);
  if (r.to === r.from && r.to >= 0 && r.to === Math.max(0, BOT_LEVELS.indexOf($("botSkill").value)))
    return `Bots next match: ${b} (the skill you picked)`;
  if (a === b)
    return `Bots next match: ${b}${r.to === r.from ? "" : r.to > r.from ? " (a little harder)" : " (a little easier)"}`;
  return `Bots next match: ${b} (${r.to > r.from ? "up" : "down"} from ${a})`;
}
/** a match mode's rules as set in Settings → Modes: { scoreLimit, timeLimit (s), respawn, ballReset } */
function modeRules(id) {
  const P = PLAY_MODES.find(p => p.id === id) || PLAY_MODES[0],
    D = MODE_DATA[P.data];
  const n = (k, d) => (Number.isFinite(+SET[k]) ? +SET[k] : d);
  const pre = { ctf: "ctf", slayer: "slayer", ffa: "ffa", oddball: "odd" }[P.id];
  return {
    scoreLimit: n(pre === "odd" ? "oddWin" : pre + "Score", D.scoreLimit),
    timeLimit: n(pre + "Time", D.timeLimit / 60) * 60,
    respawn: D.respawn,
    ballReset: P.id === "oddball" ? n("oddReset", D.ballReset) : 0,
  };
}

/* ---- free-for-all: first to the score limit, or the most kills when time runs out ---- */
const FFA = { t0: 0, over: false, overT: 0, potg: false, post: false, top: null };
defineMode({
  id: "practice",
  name: "Practice arena",
  settings: MODE_DATA.ffa,
  start: () => $("deploy").click(),
});
/** everyone in the arena, best first: { id, name, k, d, me } */
function ffaStandings() {
  const rows = [{ id: "local", name: myName, k: kills, d: deaths, me: true }];
  for (const r of remotes.values())
    if (r.has) rows.push({ id: r.id, name: r.name, k: r.k, d: r.d, me: false });
  for (const b of bots) rows.push({ id: b.id, name: b.name, k: b.k, d: b.d, me: false });
  return rows.sort((a, b) => b.k - a.k || a.d - b.d);
}
function ffaStart() {
  FFA.t0 = now;
  FFA.over = false;
  $("cBanner").hidden = true;
}
function ffaTick(dt) {
  if (EXT || !playing) return;
  const S = MODE_DATA.ffa;
  if (FFA.over) {
    FFA.overT += dt;
    /* Play of the Game after a beat, then a fresh match once it's done */
    if (!FFA.potg && FFA.overT > 1.5) {
      FFA.potg = true;
      if (playOfTheGame()) $("cBanner").hidden = true;
    }
    /* then the results: play again, change mode or leave (online, the next match starts by itself) */
    if (FFA.overT > 2.5 && FFA.potg && !HL.playing && !FFA.post) {
      FFA.post = true;
      const top = FFA.top;
      showPost({
        mode: `Practice arena · ${MAPS.arena.name || "Arena"}`,
        title: top.me ? "Victory" : `${top.name} wins`,
        color: top.me ? "#ffb347" : "",
        sub: `${top.k} kills · ${top.d} deaths`,
        again: ffaRestart,
        change: () => postToMenu("play"),
        leave: () => postToMenu("deploy"),
        auto: room ? 20 : 0,
      });
    }
    return;
  }
  const top = ffaStandings()[0];
  if (top.k >= S.scoreLimit || now - FFA.t0 >= S.timeLimit) ffaEnd(top);
}
function ffaEnd(top) {
  FFA.over = true;
  FFA.overT = 0;
  FFA.potg = false;
  FFA.post = false;
  FFA.top = top;
  EVENTS.emit("matchEnd", { winner: top.id, winnerName: top.name });
  $("cBanT").textContent = top.me ? "Victory" : `${top.name} wins`;
  $("cBanT").style.color = top.me ? "#ffb347" : "";
  $("cBanS").textContent = `${top.k} kills · ${top.d} deaths`;
  $("cBanner").hidden = false;
  say(top.me ? "Victory" : "Game over", true);
}
function ffaRestart() {
  closePost();
  kills = deaths = 0;
  streak = multi = 0;
  for (const b of bots) {
    b.k = b.d = 0;
    spawn(b.body);
  }
  if (!me.dead) spawn(me);
  refill();
  ffaStart();
  /* the next match drops in too */
  FFA.t0 = now + matchDrop(true);
  EVENTS.emit("matchStart", {});
  say("Arena online", true);
}
/** leave the match for the menu, with a button there focused (the room, if any, stays open) */
function postToMenu(focusId) {
  closePost();
  leaveGame();
  setTimeout(() => {
    const el = $(focusId);
    if (el) el.focus();
  }, 30);
}
