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
   Free-for-all is the engine's own mode (the arena with drones and online players) and is
   registered here; capture the flag, spectating, the tutorial and the trailer register themselves
   from their modules. Settings come from data/modes.js. */
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

/* ---- free-for-all: first to the score limit, or the most kills when time runs out ---- */
const FFA = { t0: 0, over: false, overT: 0, potg: false };
defineMode({
  id: "ffa",
  name: MODE_DATA.ffa.name,
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
    if (FFA.overT > S.restartDelay && FFA.potg && !HL.playing) ffaRestart();
    return;
  }
  const top = ffaStandings()[0];
  if (top.k >= S.scoreLimit || now - FFA.t0 >= S.timeLimit) ffaEnd(top);
}
function ffaEnd(top) {
  FFA.over = true;
  FFA.overT = 0;
  FFA.potg = false;
  EVENTS.emit("matchEnd", { winner: top.id, winnerName: top.name });
  $("cBanT").textContent = top.me ? "Victory" : `${top.name} wins`;
  $("cBanT").style.color = top.me ? "#ffb347" : "";
  $("cBanS").textContent = `${top.k} kills · ${top.d} deaths · next match in ${MODE_DATA.ffa.restartDelay} s`;
  $("cBanner").hidden = false;
  say(top.me ? "Victory" : "Game over", true);
}
function ffaRestart() {
  kills = deaths = 0;
  streak = multi = 0;
  for (const b of bots) {
    b.k = b.d = 0;
    spawn(b.body);
  }
  if (!me.dead) spawn(me);
  refill();
  ffaStart();
  EVENTS.emit("matchStart", {});
  say("Arena online", true);
}
