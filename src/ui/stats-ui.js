/* ============ STATS SCREENS ============
   The roster (hold Tab / View) and the post-match screen share one table built from STATS.rows():
   every pilot, AI included, with sortable columns (headers are buttons, so mouse, touch and the
   gamepad's menu navigation all work), your row highlighted and, in team modes, team totals. */
const TEAM_NAMES = ["Red", "Blue"];
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const STAT_COLS = [
  { k: "name", h: "Pilot", title: "Pilot" },
  { k: "k", h: "K", title: "Kills" },
  { k: "d", h: "D", title: "Deaths" },
  { k: "a", h: "A", title: "Assists" },
  { k: "kd", h: "K/D", title: "Kills per death", f: v => v.toFixed(2) },
  { k: "dmg", h: "Dmg", title: "Damage dealt" },
  { k: "acc", h: "Acc", title: "Accuracy", f: v => (v < 0 ? "–" : Math.round(v * 100) + "%") },
  { k: "hs", h: "HS", title: "Headshot kills" },
  { k: "medals", h: "Med", title: "Medals" },
  { k: "spree", h: "Spree", title: "Current spree" },
  { k: "power", h: "Power", title: "Power weapon held", f: v => (v ? capWord(v) : "") },
  { k: "caps", h: "Caps", title: "Flag captures", team: true, mode: "ctf" },
  { k: "rets", h: "Ret", title: "Flag returns", team: true, mode: "ctf" },
  { k: "carries", h: "Carry", title: "Flag carries", team: true, mode: "ctf" },
  { k: "flagT", h: "Flag", title: "Time carrying the flag", team: true, mode: "ctf", f: fmtTime },
  { k: "ballT", h: "Skull", title: "Time holding the skull", team: true, mode: "oddball", f: fmtTime },
];
const SUM_KEYS = ["k", "d", "a", "dmg", "hs", "medals", "caps", "rets", "carries", "flagT", "ballT"];
/** build the stats table into `box`; onSort re-renders after a header is chosen */
function statsTable(box, rows, onSort) {
  const teams = rows.some(r => r.team >= 0);
  /* objective columns only in their own mode (the event stream knows which one is playing) */
  const md = String(EVENTS.context().mode || "").replace(/-spectate$/, "");
  const cols = STAT_COLS.filter(c => (!c.team || teams) && (!c.mode || c.mode === md));
  const t = document.createElement("table");
  t.className = "stats";
  const hr = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.h;
    b.title = c.title;
    b.dataset.k = c.k;
    const sk = STATS.sort.key === "mode" ? STATS.modeKey() : STATS.sort.key;
    if (sk === c.k) b.className = STATS.sort.dir < 0 ? "desc" : "asc";
    b.onclick = () => {
      if (sk === c.k) STATS.sort = { key: c.k, dir: -STATS.sort.dir };
      else STATS.sort = { key: c.k, dir: c.k === "name" ? 1 : -1 };
      if (onSort) onSort();
    };
    th.appendChild(b);
    hr.appendChild(th);
  }
  const th = document.createElement("thead");
  th.appendChild(hr);
  t.appendChild(th);
  const tb = document.createElement("tbody");
  const cell = (tr, c, r) => {
    const td = document.createElement("td");
    if (c.k === "name") {
      /* players, AI and you, marked (ui/pilot-kind.js); team totals are plain */
      td.appendChild(
        r.id ? pilotName(r.name, r.me ? "you" : pilotKind(r.id)) : document.createTextNode(r.name)
      );
      if (String(r.id).startsWith("peer:")) td.appendChild(pingBars(pingOf(String(r.id).slice(5))));
    } else {
      const v = r[c.k];
      td.textContent = c.f ? c.f(v) : String(v);
    }
    tr.appendChild(td);
  };
  const groups = teams ? [0, 1].map(tm => rows.filter(r => r.team === tm)) : [rows];
  groups.forEach((g, gi) => {
    if (teams) {
      const h = document.createElement("tr");
      h.className = "team t" + gi;
      const td = document.createElement("td");
      td.colSpan = cols.length;
      td.textContent = TEAM_NAMES[gi];
      h.appendChild(td);
      tb.appendChild(h);
    }
    for (const r of g) {
      const tr = document.createElement("tr");
      if (r.me) tr.className = "me";
      if (teams) tr.classList.add("t" + r.team);
      for (const c of cols) cell(tr, c, r);
      tb.appendChild(tr);
    }
    if (teams) {
      const sum = { name: `${TEAM_NAMES[gi]} total`, power: "" };
      for (const k of SUM_KEYS) sum[k] = g.reduce((a, r) => a + r[k], 0);
      sum.kd = sum.k / Math.max(1, sum.d);
      const sh = g.reduce((a, r) => a + r.shots, 0);
      sum.acc = sh ? g.reduce((a, r) => a + (r.acc < 0 ? 0 : r.acc * r.shots), 0) / sh : -1;
      sum.spree = Math.max(0, ...g.map(r => r.spree));
      const tr = document.createElement("tr");
      tr.className = "total t" + gi;
      for (const c of cols) cell(tr, c, sum);
      tb.appendChild(tr);
    }
  });
  t.appendChild(tb);
  box.textContent = "";
  box.appendChild(t);
}
/** the roster: the in-match stats table */
function renderStatsRoster() {
  statsTable($("statsTab"), STATS.rows(), renderStatsRoster);
}
/* ---------- the post-match screen ---------- */
const POST = { open: false, onAgain: null, onChange: null, onLeave: null, autoT: 0 };
/**
 * show the results after Play of the Game
 * @param {{ title: string, sub?: string, note?: string, mode?: string, color?: string, again?: Function, change?: Function, leave?: Function, auto?: number }} o
 */
function showPost(o) {
  POST.open = true;
  POST.onAgain = o.again || null;
  POST.onChange = o.change || null;
  POST.onLeave = o.leave || null;
  POST.autoT = o.auto || 0;
  $("postAgain").textContent = "Play again";
  $("postMode").textContent = o.mode || "";
  $("postWin").textContent = o.title;
  $("postWin").style.color = o.color || "";
  $("postScore").textContent = o.sub || "";
  /* a line under the score (adaptive bots: where they go next) */
  $("postNote").textContent = o.note || "";
  $("postNote").hidden = !o.note;
  renderPost();
  $("post").hidden = false;
  $("cBanner").hidden = true;
  $("scores").hidden = true;
  try {
    document.exitPointerLock();
  } catch (e) {}
  setTimeout(() => {
    if (POST.open) $("postAgain").focus();
  }, 50);
}
function renderPost() {
  const rows = STATS.rows();
  statsTable($("postTab"), rows, renderPost);
  /* your match */
  const mine = rows.find(r => r.me);
  const me_ = $("postMe");
  me_.textContent = "";
  if (mine) {
    const line = (k, v) => {
      const d = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = v;
      d.append(k, b);
      me_.appendChild(d);
    };
    line("Kills · deaths · assists", `${mine.k} · ${mine.d} · ${mine.a}`);
    line("Accuracy", mine.acc < 0 ? "–" : Math.round(mine.acc * 100) + "%");
    line("Damage dealt", String(mine.dmg));
    line("Best spree", String(mine.best));
    const kw = Object.entries(mine.kw).sort((a, b) => b[1] - a[1]);
    line("Kills by weapon", kw.length ? kw.map(([w, n]) => `${STATS.weaponName(w)} ${n}`).join(" · ") : "–");
    const med = mine.medalList.filter(m => MEDAL[m]).map(m => MEDAL[m][1]);
    line(
      "Medals",
      med.length
        ? [...new Set(med)]
            .map(
              m => `${m}${med.filter(x => x === m).length > 1 ? " ×" + med.filter(x => x === m).length : ""}`
            )
            .join(" · ")
        : "–"
    );
  }
  /* awards */
  const aw = $("postAwards");
  aw.textContent = "";
  for (const a of STATS.awards(rows)) {
    const d = document.createElement("div");
    d.className = "award" + (a.me ? " me" : "");
    const t = document.createElement("small");
    t.textContent = a.title;
    const n = document.createElement("b");
    n.textContent = a.name;
    const v = document.createElement("span");
    v.textContent = a.value;
    d.append(t, n, v);
    aw.appendChild(d);
  }
  /* a short timeline: the key moments, oldest first */
  const tl = $("postTl");
  tl.textContent = "";
  /* the first blood, then the latest moments (flag pickups are too many to list) */
  const all = STATS.timeline.filter(e => e.kind !== "flag");
  const keep = all.length > 10 && all[0].kind === "first" ? [all[0], ...all.slice(-9)] : all.slice(-10);
  for (const e of keep.length ? keep : [{ t: 0, text: "No highlights this time", team: -1 }]) {
    const li = document.createElement("li");
    if (e.team >= 0) li.className = "t" + e.team;
    const tm = document.createElement("time");
    tm.textContent = fmtTime(e.t);
    li.append(tm, e.text);
    tl.appendChild(li);
  }
}
function closePost() {
  POST.open = false;
  $("post").hidden = true;
}
function postAct(fn) {
  closePost();
  if (fn) fn();
}
function updPost(dt) {
  if (!POST.open || !POST.autoT) return;
  POST.autoT -= dt;
  $("postAgain").textContent = `Play again · ${Math.max(0, Math.ceil(POST.autoT))}`;
  if (POST.autoT <= 0) postAct(POST.onAgain);
}
$("postAgain").onclick = () => postAct(POST.onAgain);
$("postChange").onclick = () => postAct(POST.onChange);
$("postLeave").onclick = () => postAct(POST.onLeave);
onFrame(updPost);
