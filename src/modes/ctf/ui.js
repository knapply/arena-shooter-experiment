/* ===== CTF presentation: rigs, flags, comms feed, minimap, waypoints, announcer ===== */
(function () {
  const K = window.KA,
    T = K.THREE,
    CTF = window.CTF,
    NAV = CTF.NAV,
    $ = K.$;
  const V3 = T.Vector3;
  const TN = CTF.TEAM_NAMES;
  /** when each comms line was posted, for fading old lines */
  const commsT = new WeakMap();
  const UI = (CTF.UI = /** @type {CTFUI} */ ({ quiet: false, onEvent: null }));
  let G = null,
    mode = null,
    flagObjs = [],
    hudT = 0,
    mini = null,
    miniBg = null,
    marks = [];
  const RIGS = [[], []];
  let FLAGS = null;
  UI.attach = function (game, m) {
    G = game;
    mode = m;
    UI.rigAll();
    if (!FLAGS) FLAGS = [CTF.makeFlag(0), CTF.makeFlag(1)];
    flagObjs = FLAGS;
    for (const f of FLAGS) {
      f.group.visible = true;
      f.home.visible = true;
    }
    G.onEvent = onEvent;
    G.onComms = onComms;
    const h = $("ctfHud");
    h.hidden = false;
    h.classList.toggle("play", m === "play");
    h.classList.toggle("intel", m === "sim" && UI.intelOn !== false);
    $("cCtl").hidden = m !== "sim";
    $("cPlan").hidden = m !== "sim";
    $("cComms").textContent = "";
    $("cBanner").hidden = true;
    $("cMarks").textContent = "";
    marks = [];
    buildMini();
    hudT = 0;
  };
  UI.detach = function () {
    if (!G) return;
    G.nades.clear();
    for (const a of G.agents)
      if (a.rig) {
        a.rig.root.visible = false;
        a.rig = null;
      }
    for (const f of flagObjs) {
      f.group.visible = false;
      f.home.visible = false;
    }
    flagObjs = [];
    $("ctfHud").hidden = true;
    $("cMarks").textContent = "";
    marks = [];
    G = null;
  };
  UI.game = () => G;
  /* rigs are cached per team slot and reused across matches; humans get their slot's armor */
  UI.rigFor = function (a) {
    const k = a.idx % 8;
    let r = RIGS[a.team][k];
    if (!r) {
      r = K.makePilot(CTF.TEAM_COLORS[a.team][k % 4], a.name);
      RIGS[a.team][k] = r;
    }
    return r;
  };
  UI.rigAll = function () {
    if (!G) return;
    const used = new Set();
    for (const a of G.agents) {
      if (a.local) {
        a.rig = null;
        continue;
      }
      const r = UI.rigFor(a);
      if (used.has(r)) {
        a.rig = null;
        continue;
      }
      used.add(r);
      if (a.rig !== r) {
        a.rig = r;
        r.revive();
        r.root.visible = !a.dead && !!a.spawned;
        a._lab = null;
      }
      r.showTag(!(mode !== "sim" && G.human && a.team !== G.human.team));
      if (a.dead && !r.dead) r.die();
    }
    for (const t of [0, 1]) for (const r of RIGS[t]) if (r && !used.has(r)) r.root.visible = false;
  };
  /* ---------- per-frame ---------- */
  UI.frame = function (dt) {
    if (!G) return;
    for (const a of G.agents) {
      const r = a.rig;
      if (!r) continue;
      if (a.dead && !r.dead) r.die();
      r.root.position.copy(a.body.pos);
      r.root.rotation.y = a.body.yaw;
      K.rigEvents(
        r,
        r.update(
          dt,
          K.bodyState(a.body, {
            reload: a.reloadT > 0 ? 1 - a.reloadT / K.RELOAD_TIME : -1,
            fire: G.t - a.firedT < 0.1,
            wpn: a.sniper > 0 ? 2 : a.wpn,
          })
        )
      );
      if (mode === "sim" && a._lab !== a.role) {
        a._lab = a.role;
        r.setLabel(a.name, a.role);
      } else if (mode === "play" && a._lab !== a.name) {
        a._lab = a.name;
        r.setLabel(a.name, a.human ? "player" : "");
      }
    }
    for (const f of G.flags) {
      const o = flagObjs[f.team];
      const gp = o.group;
      if (f.state === "carried" && f.carrier) {
        const b = f.carrier.body;
        gp.visible = !f.carrier.local;
        gp.position.set(b.pos.x + Math.sin(b.yaw) * 0.32, b.pos.y + 0.15, b.pos.z + Math.cos(b.yaw) * 0.32);
        gp.rotation.y = b.yaw;
      } else {
        gp.visible = true;
        gp.position.copy(f.pos);
        gp.rotation.y = 0;
      }
      o.animate(G.t, f.state === "carried");
    }
    if (mode === "play") updMarks();
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      updHud();
      drawMini();
    }
  };
  /* ---------- events ---------- */
  function say(t) {
    if (!UI.quiet) K.say(t, true);
  }
  function onEvent(type, d) {
    const hum = G.human,
      ht = hum ? hum.team : -1;
    switch (type) {
      case "kill": {
        const k = d.killer,
          v = d.victim;
        line(
          "kill",
          `${k ? k.name : "Fall"} › ${v.name}${d.type === "pound" ? " · pound" : d.type === "charge" ? " · charge" : d.type === "melee" ? " · melee" : d.head ? " · headshot" : ""}`
        );
        if (mode === "play" && !v.local) K.pushFeed(k ? k.name : "Fall", v.name, !!(k && k.local), false);
        break;
      }
      case "flagTaken": {
        const ft = d.flag.team;
        line("sys", `${d.by.name} took ${TN[ft]} flag`);
        say(
          ht < 0
            ? `${TN[ft]} flag taken`
            : ft === ht
              ? "Your flag has been taken"
              : d.by.local
                ? "You have the flag"
                : "We have the flag"
        );
        K.sfx("stinger", 0.45);
        break;
      }
      case "flagDrop":
        line("sys", `${TN[d.flag.team]} flag dropped`);
        say("Flag dropped");
        break;
      case "flagReturn":
        line("sys", `${d.by.name} returned ${TN[d.flag.team]} flag`);
        say(
          ht >= 0 && d.flag.team === ht
            ? "Flag recovered"
            : ht < 0
              ? `${TN[d.flag.team]} flag recovered`
              : "Their flag was recovered"
        );
        break;
      case "flagReset":
        line("sys", `${TN[d.flag.team]} flag reset`);
        say("Flag reset");
        break;
      case "capture":
        line("sys", `${d.by.name} captured! ${TN[0]} ${G.teams[0].score} – ${G.teams[1].score} ${TN[1]}`);
        K.sfx("stinger", 0.9);
        say(ht < 0 ? `${TN[d.team]} team scores` : d.team === ht ? "Flag captured" : "Enemy team scores");
        if (d.by.local) K.toast("Flag captured");
        break;
      case "roster":
        UI.rigAll();
        break;
      case "end": {
        const w = d.winner;
        say(w < 0 ? "Draw" : ht < 0 ? `${TN[w]} team wins` : w === ht ? "Victory" : "Defeat");
        break;
      }
    }
    if (UI.onEvent) UI.onEvent(type, d);
  }
  function onComms(m) {
    if (mode === "play" && m.team !== G.human.team) return;
    line("t" + m.team, m.text, m.from.name);
  }
  function line(cls, text, who) {
    const box = $("cComms");
    const el = document.createElement("div");
    el.className = cls;
    if (who) {
      const b = document.createElement("b");
      b.textContent = who;
      el.appendChild(b);
    }
    el.appendChild(document.createTextNode(text));
    commsT.set(el, performance.now());
    box.appendChild(el);
    while (box.children.length > (mode === "play" ? 6 : 9)) box.firstChild.remove();
  }
  UI.line = line;
  /* ---------- HUD bar ---------- */
  function flagText(f) {
    if (f.state === "home") return "Flag home";
    if (f.state === "dropped") return `Dropped · ${Math.max(0, Math.ceil(15 - (G.t - f.dropT)))}s`;
    return `Taken · ${f.carrier ? f.carrier.name : ""}`;
  }
  function updHud() {
    for (let t = 0; t < 2; t++) {
      $("cS" + t).textContent = G.teams[t].score;
      const el = $("cF" + t);
      el.textContent = flagText(G.flags[t]);
      el.className = G.flags[t].state === "home" ? "" : "alert";
    }
    const left = Math.max(0, G.timeLimit - G.t);
    $("cClock").textContent = `${(left / 60) | 0}:${String((left % 60) | 0).padStart(2, "0")}`;
    if (mode === "sim")
      for (let t = 0; t < 2; t++) {
        const p = G.teams[t].brain.plan;
        $("cP" + t).textContent =
          `${p.strat} ${CTF.LANE_NAMES[p.lane]}${p.staging ? " · staging" : ""} · reads ${G.teams[t].brain.enemyStratGuess.toLowerCase()}`;
      }
    const now = performance.now();
    for (const el of $("cComms").children) {
      const age = now - (commsT.get(el) || now);
      el.classList.toggle("old", age > 7000);
      if (age > 16000) el.remove();
    }
    if (UI.extraHud) UI.extraHud();
  }
  /* ---------- minimap ---------- */
  const MS = 1.5;
  function buildMini() {
    const c = $("cMini");
    mini = c.getContext("2d");
    const img = mini.createImageData(78, 150);
    for (let y = 0; y < 150; y++)
      for (let x = 0; x < 78; x++) {
        const wx = -26 + x / MS,
          wz = 50 - y / MS;
        const cell = NAV.cell(wx, wz);
        const i = (y * 78 + x) * 4;
        if (cell < 0 || !NAV.ok[cell]) {
          img.data[i] = 34;
          img.data[i + 1] = 44;
          img.data[i + 2] = 50;
          img.data[i + 3] = 255;
          continue;
        }
        const h = NAV.top[cell];
        const v = 58 + h * 16;
        img.data[i] = v * 0.75;
        img.data[i + 1] = v * 0.9;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    miniBg = img;
  }
  function drawMini() {
    if (!mini) return;
    mini.putImageData(miniBg, 0, 0);
    const P = p => [(p.x + 26) * MS, (50 - p.z) * MS];
    const ht = G.human ? G.human.team : -1;
    const mem = ht >= 0 ? G.teams[ht].brain.enemyMem : null;
    for (const f of G.flags) {
      const [x, y] = P(f.state === "carried" && f.carrier ? f.carrier.pos : f.pos);
      mini.fillStyle = CTF.TEAM_HEX[f.team];
      mini.fillRect(x - 3, y - 3, 6, 6);
      mini.strokeStyle = "#fff";
      mini.lineWidth = 1;
      mini.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
    for (const a of G.agents) {
      if (!a.alive) continue;
      if (ht >= 0 && a.team !== ht) {
        const m = mem.get(a.id);
        if (!m || G.t - m.t > 2.5) continue;
      }
      const [x, y] = P(a.pos);
      mini.fillStyle = a.local ? "#ffffff" : CTF.TEAM_HEX[a.team];
      mini.beginPath();
      mini.arc(x, y, a.local ? 3 : 2.4, 0, 6.3);
      mini.fill();
      if (a.carrying) {
        mini.strokeStyle = "#ffd36b";
        mini.lineWidth = 1.5;
        mini.beginPath();
        mini.arc(x, y, 5, 0, 6.3);
        mini.stroke();
      }
    }
  }
  /* ---------- objective waypoints (play) ---------- */
  const _p = new V3();
  function mark(i, team, pos, label) {
    let el = marks[i];
    if (!el) {
      el = document.createElement("div");
      el.className = "cmark";
      const s = document.createElement("span"),
        ic = document.createElement("i"),
        sm = document.createElement("small");
      el.append(s, ic, sm);
      $("cMarks").appendChild(el);
      marks[i] = el;
    }
    if (!pos) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = "cmark t" + team;
    el.children[0].textContent = label;
    const d = K.me.pos.distanceTo(pos);
    el.children[2].textContent = Math.round(d) + "m";
    _p.copy(pos);
    _p.y += 2.7;
    _p.project(K.camera);
    let x = _p.x,
      y = _p.y;
    if (_p.z > 1) {
      x = -x;
      y = -1;
    }
    const W = innerWidth,
      H = innerHeight,
      m = 34;
    let sx = (x * 0.5 + 0.5) * W,
      sy = (-y * 0.5 + 0.5) * H;
    sx = Math.max(m, Math.min(W - m, sx));
    sy = Math.max(m + 40, Math.min(H - m - 60, sy));
    el.style.left = sx + "px";
    el.style.top = sy + "px";
  }
  function updMarks() {
    const ht = G.human.team,
      et = 1 - ht;
    const of = G.flags[ht],
      ef = G.flags[et];
    if (of.state === "home") mark(0, ht, of.pos, "Defend");
    else if (of.state === "dropped") mark(0, ht, of.pos, "Return");
    else mark(0, ht, of.carrier ? of.carrier.pos : of.pos, "Kill carrier");
    if (ef.state === "carried" && ef.carrier) {
      if (ef.carrier.local) {
        mark(1, ht, CTF.FLAG_HOME[ht], of.state === "home" ? "Score" : "Hold");
      } else mark(1, ht, ef.carrier.pos, "Escort");
    } else mark(1, et, ef.pos, ef.state === "dropped" ? "Grab" : "Capture");
  }
})();
