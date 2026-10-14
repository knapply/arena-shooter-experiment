/* ============ MODE SELECT (the main menu) ============
   The four match modes (PLAY_MODES, data/modes.js) as cards: the name, one line on what you do, the
   key rules, and the limits from Settings → Modes. Under them the chosen mode's setup (map, team,
   team size or pilots, bot skill, a Rules button that opens its settings), one summary line that says
   exactly what Play starts, and the Play button, which names it.
   Online, a match already running in your room takes over: its card is marked, the summary says
   whose match it is, and Play joins it. The pick is saved (the "menu" document; the team is
   "ctfTeam"). Cards are a radio group: arrow keys, mouse, touch and the gamepad's menu navigation
   all pick one. Modes register their start with defineMode; the room's lobby (who hosts what) comes
   from the match modes through MENU.lobby. */
const MENU = {
  /** the pick: the mode, each mode's map and size, and the team */
  sel: { mode: "ctf", maps: {}, size: {}, team: 0 },
  /** the room's lobby, from the match modes: () => ({ room, host: { name, mode, map, players } | null, others }) */
  lobby: null,
  /** the team pick changed (the match modes share it with the room) */
  onTeam: null,
};
/** team sizes (per side) and free-for-all pilot counts on offer */
const MENU_SIZES = { team: [1, 2, 3, 4, 5], ffa: [2, 4, 6, 8, 10] };
/** each mode's first rule in Settings → Modes (the Rules button opens it there) */
const MODE_RULE_KEY = { ctf: "ctfScore", slayer: "slayerScore", ffa: "ffaScore", oddball: "oddWin" };
const menuMode = id => PLAY_MODES.find(p => p.id === id) || PLAY_MODES[0];
{
  const s = STORE.load("menu");
  if (s) {
    if (s.mode) MENU.sel.mode = s.mode;
    MENU.sel.maps = s.maps;
    MENU.sel.size = s.size;
  }
  MENU.sel.team = STORE.load("ctfTeam") === 1 ? 1 : 0;
}
MENU.mode = () => menuMode(MENU.sel.mode);
/** the map the chosen mode plays on (a MAPS key) */
MENU.map = () => {
  const P = MENU.mode(),
    m = MENU.sel.maps[P.id];
  return P.maps.includes(m) ? m : P.maps[0];
};
const sizeList = P => (P.teams ? MENU_SIZES.team : MENU_SIZES.ffa);
/** pilots per team (free-for-all: pilots in the match) */
MENU.size = () => {
  const P = MENU.mode(),
    s = MENU.sel.size[P.id];
  return sizeList(P).includes(s) ? s : P.teams ? MODE_DATA[P.data].teamSize : MODE_DATA.ffa.pilots;
};
const mapName = key => (MAPS[key] ? MAPS[key].name : key);
const mmssM = s => `${(s / 60) | 0}:${String((s % 60) | 0).padStart(2, "0")}`;
/** what wins and how long it lasts: "first to 3 captures · 8 min" */
function modeGoal(P) {
  const R = modeRules(P.id),
    min = Math.round(R.timeLimit / 60) + " min";
  if (P.id === "oddball") return `hold the skull ${mmssM(R.scoreLimit)} · ${min}`;
  const unit = R.scoreLimit === 1 ? P.unit.replace(/s$/, "") : P.unit;
  return `first to ${R.scoreLimit} ${unit} · ${min}`;
}
/** the card's limits line: who plays and what wins */
function modeLimits(P) {
  const n =
    P.id === MENU.sel.mode ? MENU.size() : P.teams ? MODE_DATA[P.data].teamSize : MODE_DATA.ffa.pilots;
  return `${P.teams ? `${n} v ${n}` : `${n} pilots`} · ${modeGoal(P)}`;
}
function saveMenu() {
  STORE.save("menu", { mode: MENU.sel.mode, maps: MENU.sel.maps, size: MENU.sel.size });
}
/* ---- the cards ---- */
const MCARDS = PLAY_MODES.map(P => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mcard";
  b.id = "mode-" + P.id;
  b.dataset.mode = P.id;
  b.setAttribute("role", "radio");
  const name = document.createElement("b");
  name.className = "mname";
  name.textContent = P.name;
  const line = document.createElement("span");
  line.className = "mline";
  line.textContent = P.line;
  const ul = document.createElement("ul");
  ul.className = "mpts";
  for (const t of P.points) {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  }
  const lim = document.createElement("span");
  lim.className = "mlim";
  const tag = document.createElement("span");
  tag.className = "mtag";
  tag.hidden = true;
  b.append(name, line, ul, lim, tag);
  b.onclick = () => pickMode(P.id);
  $("modeCards").appendChild(b);
  return b;
});
/** the live match in your room, if any (its mode takes over the picker) */
const menuHost = () => {
  const L = MENU.lobby ? MENU.lobby() : null;
  return L && L.host && PLAY_MODES.some(p => p.id === L.host.mode) ? L.host : null;
};
function pickMode(id) {
  const h = menuHost();
  if (h && h.mode !== id) {
    $("modeSum").textContent =
      `Your room is playing ${menuMode(h.mode).name} right now. Join it, or leave the room to play something else.`;
    return;
  }
  if (MENU.sel.mode !== id) {
    MENU.sel.mode = id;
    saveMenu();
  }
  renderMenu();
}
/* arrow keys move the pick round the cards (a radio group); Home and End jump to the ends */
$("modeCards").addEventListener("keydown", e => {
  const i = MCARDS.indexOf(/** @type {any} */ (document.activeElement));
  if (i < 0) return;
  const n = MCARDS.length;
  const to =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? (i + 1) % n
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? (i + n - 1) % n
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? n - 1
            : -1;
  if (to < 0) return;
  e.preventDefault();
  MCARDS[to].focus();
  pickMode(MCARDS[to].dataset.mode);
});
/* ---- the chosen mode's setup ---- */
function fillSelect(sel, opts, val) {
  const key = opts.map(o => o[0] + o[1]).join("|");
  if (sel.dataset.k !== key) {
    sel.dataset.k = key;
    sel.textContent = "";
    for (const [v, t] of opts) {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = t;
      sel.appendChild(o);
    }
  }
  sel.value = String(val);
}
$("mapPick").addEventListener("change", () => {
  MENU.sel.maps[MENU.sel.mode] = $("mapPick").value;
  saveMenu();
  renderMenu();
});
$("sizePick").addEventListener("change", () => {
  MENU.sel.size[MENU.sel.mode] = +$("sizePick").value;
  saveMenu();
  renderMenu();
});
/* picking a bot skill starts the adaptive level over from it */
$("botSkill").addEventListener("change", () => {
  STORE.save("botLevel", { lvl: BOT_LEVELS.indexOf($("botSkill").value), base: $("botSkill").value });
  renderMenu();
});
function setTeam(t) {
  MENU.sel.team = t;
  STORE.save("ctfTeam", t);
  $("ctfRed").setAttribute("aria-pressed", String(t === 0));
  $("ctfBlue").setAttribute("aria-pressed", String(t === 1));
  if (MENU.onTeam) MENU.onTeam(t);
  renderMenu();
}
$("ctfRed").onclick = () => setTeam(0);
$("ctfBlue").onclick = () => setTeam(1);
$("modeRules").onclick = () => openSettings("menu", T_MODE, MODE_RULE_KEY[MENU.sel.mode]);
/** the summary under the setup: exactly what Play starts */
function menuSummary(P, h, L) {
  if (h) {
    const n = h.players | 0;
    return `Joining ${h.name}'s ${P.name} on ${mapName(h.map)} · ${n} player${n === 1 ? "" : "s"} in it · ${modeGoal(P)}. You take a bot's place.`;
  }
  const n = MENU.size(),
    /* adaptive bots: where they are now (offline only); otherwise the pick */
    adapt = SET.adaptBots && !(L && L.room),
    pick = $("botSkill").options[$("botSkill").selectedIndex].textContent,
    bots = k =>
      adapt
        ? `${k} bot${k > 1 ? "s" : ""} (${botLevelName(botLevel())}, adapting)`
        : `${k} ${pick} bot${k > 1 ? "s" : ""}`;
  const who = P.teams
    ? `you${n > 1 ? ` and ${bots(n - 1)}` : ""} on ${MENU.sel.team ? "Blue" : "Red"} against ${n}`
    : `you and ${bots(n - 1)}, every pilot for themselves`;
  const room = L && L.room ? " Friends in your room can join." : "";
  return `${P.name} on ${mapName(MENU.map())}: ${who} · ${modeGoal(P)}.${room}`;
}
function renderMenu() {
  const L = MENU.lobby ? MENU.lobby() : null,
    h = menuHost();
  /* a match running in your room picks the mode */
  const P = h ? menuMode(h.mode) : MENU.mode();
  MCARDS.forEach((b, i) => {
    const Q = PLAY_MODES[i],
      on = Q.id === P.id;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle("off", !!h && !on);
    b.setAttribute("aria-disabled", String(!!h && !on));
    /** @type {HTMLElement} */ (b.querySelector(".mlim")).textContent = modeLimits(Q);
    const tag = /** @type {HTMLElement} */ (b.querySelector(".mtag"));
    tag.hidden = !(h && on);
    tag.textContent = h && on ? `${h.name}'s match` : "";
  });
  const maps = h ? [h.map] : P.maps;
  fillSelect(
    $("mapPick"),
    maps.map(k => [k, mapName(k)]),
    h ? h.map : MENU.map()
  );
  $("mapPick").disabled = maps.length < 2;
  $("teamPick").hidden = !P.teams;
  $("sizeLab").textContent = P.teams ? "Team size" : "Pilots";
  fillSelect(
    $("sizePick"),
    sizeList(P).map(n => [n, P.teams ? `${n} v ${n}` : String(n)]),
    MENU.size()
  );
  $("sizePick").disabled = !!h;
  $("modeSum").textContent = menuSummary(P, h, L);
  $("play").textContent = `${h ? "Join" : L && L.room ? "Host" : "Play"} ${P.name}`;
  $("play").dataset.mode = P.id;
  $("watchAI").textContent = `Watch AI play ${P.short}`;
  /* the room line: who else is here */
  if (L) $("lobby").textContent = L.text || "";
}
MENU.refresh = renderMenu;
/** start what the menu shows: join the room's match, or the picked mode */
MENU.play = function () {
  const h = menuHost();
  if (h) return startMode(h.mode, { join: h });
  startMode(MENU.sel.mode, {
    map: MENU.map(),
    team: MENU.sel.team,
    size: MENU.size(),
    diff: $("botSkill").value,
  });
};
$("play").onclick = () => MENU.play();
$("watchAI").onclick = () =>
  startMode("spectate", { rules: MENU.mode().id, map: MENU.map(), size: MENU.size() });
SET_HOOKS.push(renderMenu);
setInterval(() => {
  if (!$("menu").hidden) renderMenu();
}, 1000);
setTeam(MENU.sel.team);
