/* ===== Match presentation for every mode: rigs, flags and the skull, comms feed, minimap, waypoints, announcer =====
   One HUD bar for every set of rules: capture the flag (each team's score and who has its flag), Team
   Slayer (kills), free-for-all (your kills and place against the leader) and oddball (each team's held
   time and who has the skull). */
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
    miniMap = "",
    marks = [];
  /** rigs are cached per team and slot ("team:slot") and reused across matches */
  const RIGS = new Map();
  let FLAGS = null,
    SKULL = null;
  const SKULL_HEX = "#f2e6c9";
  /** the event stream's mode name for a match ("ctf", "slayer", "ffa", "oddball"; "-spectate" for AI vs AI) */
  UI.modeId = g => (g.rules || "ctf") + (mode === "sim" ? "-spectate" : "");
  UI.attach = function (game, m) {
    G = game;
    mode = m;
    K.EVENTS.setContext({ map: CTF.MAP_KEY || "ctf", mode: UI.modeId(G) });
    UI.rigAll();
    const flags = G.flags.length > 0;
    if (flags && !FLAGS) FLAGS = [CTF.makeFlag(0), CTF.makeFlag(1)];
    flagObjs = flags ? FLAGS : [];
    for (const f of flagObjs) {
      f.group.visible = true;
      f.home.visible = true;
      f.home.position.copy(CTF.FLAG_HOME[f === FLAGS[0] ? 0 : 1]);
    }
    if (G.ball) {
      if (!SKULL) SKULL = makeSkull();
      SKULL.group.visible = false;
    }
    G.onEvent = onEvent;
    G.onComms = onComms;
    const h = $("ctfHud");
    h.hidden = false;
    h.dataset.rules = G.rules || "ctf";
    h.classList.toggle("play", m === "play");
    h.classList.toggle("intel", m === "sim" && UI.intelOn !== false && (G.rules || "ctf") === "ctf");
    $("cCtl").hidden = m !== "sim";
    $("cPlan").hidden = m !== "sim" || (G.rules || "ctf") !== "ctf";
    $("cComms").textContent = "";
    $("cBanner").hidden = true;
    $("cMarks").textContent = "";
    marks = [];
    buildMini();
    hudT = 0;
  };
  UI.detach = function () {
    if (!G) return;
    K.setPilotCollider(null);
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
    if (SKULL) SKULL.group.visible = false;
    $("ctfHud").hidden = true;
    $("cMarks").textContent = "";
    marks = [];
    G = null;
    K.EVENTS.setContext({ map: "arena", mode: "ffa" });
  };
  UI.game = () => G;
  UI.rigFor = function (a) {
    const k = a.idx % 8,
      key = a.team + ":" + k;
    let r = RIGS.get(key);
    if (!r) {
      r = K.makePilot(CTF.rigColor(a.team, k), a.name);
      RIGS.set(key, r);
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
      /* names over teammates only (every name in free-for-all would give everyone away) */
      r.showTag(!(mode !== "sim" && G.human && (G.ffa || a.team !== G.human.team)));
      if (a.dead && !r.dead) r.die();
    }
    for (const r of RIGS.values()) if (!used.has(r)) r.root.visible = false;
  };
  /* ---------- the skull ---------- */
  function makeSkull() {
    const g = new T.Group();
    const bone = new T.MeshStandardMaterial({
      color: SKULL_HEX,
      emissive: "#ffcf6b",
      emissiveIntensity: 0.25,
      roughness: 0.55,
      metalness: 0.1,
    });
    const dark = new T.MeshBasicMaterial({ color: "#120c08" });
    const s = new T.Group();
    const cran = new T.Mesh(new T.SphereGeometry(0.17, 18, 14), bone);
    cran.scale.set(1, 1.05, 1.15);
    const face = new T.Mesh(new T.BoxGeometry(0.2, 0.12, 0.16), bone);
    face.position.set(0, -0.1, -0.08);
    const jaw = new T.Mesh(new T.BoxGeometry(0.16, 0.05, 0.13), bone);
    jaw.position.set(0, -0.19, -0.1);
    for (const x of [-0.06, 0.06]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.042, 10, 8), dark);
      eye.position.set(x, -0.04, -0.165);
      s.add(eye);
    }
    const nose = new T.Mesh(new T.BoxGeometry(0.03, 0.04, 0.02), dark);
    nose.position.set(0, -0.1, -0.165);
    s.add(cran, face, jaw, nose);
    s.position.y = 0.45;
    g.add(s);
    const glow = new T.Sprite(
      new T.SpriteMaterial({
        color: "#ffd77a",
        transparent: true,
        opacity: 0.5,
        blending: T.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(1.4, 1.4, 1);
    glow.position.y = 0.45;
    g.add(glow);
    const beam = new T.Mesh(
      new T.CylinderGeometry(0.1, 0.1, 40, 8, 1, true),
      new T.MeshBasicMaterial({
        color: "#ffd77a",
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: T.AdditiveBlending,
      })
    );
    beam.position.y = 20.4;
    g.add(beam);
    K.scene.add(g);
    return {
      group: g,
      /** carried: the skull is in the carrier's hands, and its glow and beam mark the carrier */
      animate(t, carried) {
        s.visible = !carried;
        s.rotation.y = t * 1.6;
        s.position.y = 0.45 + Math.sin(t * 2.4) * 0.06;
        glow.position.y = carried ? 1.25 : 0.45;
        glow.scale.setScalar(carried ? 2.2 : 1.4);
        glow.material.opacity = (carried ? 0.28 : 0.35) + 0.2 * Math.sin(t * (carried ? 6 : 4));
      },
    };
  }
  /* ---------- per-frame ---------- */
  UI.frame = function (dt) {
    if (!G) return;
    const B = G.ball;
    for (const a of G.agents) {
      const r = a.rig;
      if (!r) continue;
      if (a.dead && !r.dead) r.die();
      const fl = G.flags.find(f => f.state === "carried" && f.carrier === a);
      const sk = !!B && B.state === "carried" && B.carrier === a;
      K.posePilot(a, dt, {
        reload: a.reloadT > 0 ? 1 - a.reloadT / (a.gun ? a.gun().reload : K.RELOAD_TIME) : -1,
        fire: G.t - a.firedT < 0.1,
        wpn: a.remote ? a.wpn : a.held(),
        /* a carrier holds the flag, or the skull, in both hands */
        flag: !!fl || sk,
        flagColor: fl ? CTF.TEAM_HEX[fl.team] : null,
        skull: sk,
      });
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
        /* the carrier's rig holds it (and you see your own in first person) */
        gp.visible = false;
        gp.position.set(b.pos.x + Math.sin(b.yaw) * 0.32, b.pos.y + 0.15, b.pos.z + Math.cos(b.yaw) * 0.32);
        gp.rotation.y = b.yaw;
      } else {
        gp.visible = true;
        gp.position.copy(f.pos);
        gp.rotation.y = 0;
      }
      o.animate(G.t, f.state === "carried");
    }
    if (B && SKULL) {
      /* on the floor it floats and turns over its spot; carried, the carrier's rig holds it and the
         carrier glows under a beam everyone can see (except you, carrying it yourself) */
      const held = B.state === "carried" && !!B.carrier;
      SKULL.group.visible =
        B.state === "home" || B.state === "dropped" || (held && !B.carrier.local && B.carrier.alive);
      SKULL.group.position.copy(held ? B.carrier.pos : B.pos);
      SKULL.animate(G.t, held);
    }
    if (mode === "play") updMarks();
    else if (mode === "sim") updCarrierMarks();
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
  const pid = a => K.pidOf(a);
  /** forward rule events into the engine's event stream (feed, medals, stats, the results screen) */
  function forward(type, d) {
    const E = K.EVENTS;
    if (type === "kill")
      E.emit("kill", {
        killer: pid(d.killer),
        killerName: d.killer ? d.killer.name : d.type === "pod" ? "Skull pod" : "Fall",
        victim: pid(d.victim),
        victimName: d.victim.name,
        weapon: d.type || "rifle",
        head: !!d.head,
        /* what the victim was carrying ("flag", "ball"), a carrier stopped near their stand, where */
        carried: d.carried || "",
        denial: !!d.denial,
        zone: d.victim && d.victim.pos ? K.zoneAt(d.victim.pos) : "",
        team: d.killer ? d.killer.team : -1,
        vteam: d.victim.team,
      });
    else if (type === "flagTaken" || type === "flagDrop" || type === "flagReturn" || type === "capture")
      E.emit(type, {
        pilot: pid(d.by),
        pilotName: d.by ? d.by.name : "",
        team: d.flag ? d.flag.team : d.team,
        clutch: !!d.clutch,
      });
    else if (type === "flagReset") E.emit(type, { team: d.flag.team });
    else if (type === "ballTaken" || type === "ballDrop")
      E.emit(type, {
        pilot: pid(d.by),
        pilotName: d.by ? d.by.name : "",
        team: d.by ? d.by.team : -1,
      });
    else if (type === "ballReset" || type === "ballSpawn") E.emit(type, {});
    else if (type === "pickup") E.emit("pickup", { pilot: pid(d.by), item: d.id });
    else if (type === "damage")
      E.emit("damage", {
        by: pid(d.by),
        victim: pid(d.victim),
        amount: d.amount,
        weapon: d.weapon,
        head: d.head,
        shieldBroken: !!d.brk,
      });
    else if (type === "shot") E.emit("shot", { pilot: pid(d.by), weapon: d.weapon });
    else if (type === "start") E.emit("matchStart", {});
    else if (type === "end") E.emit("matchEnd", Object.assign({ winner: d.winner }, UI.endInfo(G, d.winner)));
  }
  /** facts about a finished match for the stats and announcer: how close it was */
  UI.endInfo = function (g, w) {
    if (!g || !g.ball || w < 0) return {};
    const held = g.teams.map(t => t.held);
    const other = Math.max(...held.filter((v, i) => i !== w));
    /* a last-second hold: won by holding when the other team was within ten seconds of winning */
    return { lastHold: g.scoreLimit - other < 10, holder: g.ball.carrier ? pid(g.ball.carrier) : "" };
  };
  /** who a team is, for lines and calls: "Red", "Blue", or the pilot in free-for-all */
  const teamName = t =>
    G && G.ffa ? (G.teams[t] && G.teams[t].agents[0] ? G.teams[t].agents[0].name : "?") : TN[t];
  UI.teamName = teamName;
  function onEvent(type, d) {
    forward(type, d || {});
    const hum = G.human,
      ht = hum ? hum.team : -1;
    switch (type) {
      case "pod":
        if (G.render !== false && d.pos) K.dropPod(d.pos, CTF.teamHex(d.a.team), { dur: K.POD_TIME });
        break;
      case "ballPod":
        /* the skull comes down by pod, somewhere new each time (CTF.skullSpots) */
        if (G.render !== false && d.pos) K.dropPod(d.pos, SKULL_HEX, { dur: K.POD_TIME, kind: "skull" });
        line("sys", "Skull incoming");
        say("Skull incoming");
        break;
      case "ballSpawn":
        line("sys", `The skull is down: ${CTF.zoneName(ht >= 0 ? ht : 0, d.pos)}`);
        K.sfx("flagReturn", 0.7);
        break;
      case "ballTaken": {
        const by = d.by,
          mine = ht >= 0 && by.team === ht;
        line("sys", `${by.name} has the skull`);
        say(
          by.local
            ? "You have the skull"
            : ht < 0
              ? `${teamName(by.team)} has the skull`
              : mine
                ? "We have the skull"
                : "They have the skull"
        );
        K.sfx(ht >= 0 && !mine ? "flagLost" : "flagTaken", 0.8);
        if (by.local) K.toast("You have the skull · melee kills in one hit · no guns");
        break;
      }
      case "ballDrop":
        line("sys", `${d.by.name} dropped the skull`);
        say(d.by.local ? "You dropped the skull" : "Skull dropped");
        K.sfx("flagDrop", 0.8);
        break;
      case "ballReset":
        line("sys", "Skull reset");
        say("Skull reset");
        break;
      case "kill": {
        const k = d.killer,
          v = d.victim;
        const how =
          d.type === "pound"
            ? " · pound"
            : d.type === "charge"
              ? " · charge"
              : d.type === "melee"
                ? " · melee"
                : d.type === "flag"
                  ? " · flag"
                  : d.type === "skull"
                    ? " · skull"
                    : d.type === "pod"
                      ? " · pod"
                      : d.head
                        ? " · headshot"
                        : "";
        line("kill", `${k ? k.name : d.type === "pod" ? "Skull pod" : "Fall"} › ${v.name}${how}`);
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
        /* your flag going is an alarm; taking theirs is a rising call */
        K.sfx(ht >= 0 && ft === ht ? "flagLost" : "flagTaken", 0.8);
        if (d.by.local) K.toast("No guns · melee kills in one hit · sprint or thrust drops it");
        break;
      }
      case "flagDrop": {
        const ft = d.flag.team;
        line("sys", `${TN[ft]} flag dropped`);
        say(
          ht < 0
            ? `${TN[ft]} flag dropped`
            : ft === ht
              ? "Their carrier is down, return our flag"
              : d.by && d.by.local
                ? "You dropped the flag"
                : "Our carrier is down, pick up the flag"
        );
        K.sfx("flagDrop", 0.8);
        break;
      }
      case "flagReturn":
        line("sys", `${d.by.name} returned ${TN[d.flag.team]} flag`);
        say(
          ht >= 0 && d.flag.team === ht
            ? "Flag returned"
            : ht < 0
              ? `${TN[d.flag.team]} flag returned`
              : "Their flag was returned"
        );
        K.sfx("flagReturn", 0.8);
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
        if (G.ffa) say(w < 0 ? "Draw" : ht === w ? "Victory" : `${teamName(w)} wins`);
        else say(w < 0 ? "Draw" : ht < 0 ? `${TN[w]} team wins` : w === ht ? "Victory" : "Defeat");
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
  /* who has each flag: home, dropped (with its reset timer) or the carrier's name */
  function flagText(f) {
    if (f.state === "home") return "Flag home";
    if (f.state === "dropped")
      return `Dropped · ${Math.max(0, Math.ceil((G.flagReset || 15) - (G.t - f.dropT)))}s`;
    if (f.carrier && f.carrier.local) return "⚑ You have it";
    return `⚑ ${f.carrier ? f.carrier.name : "Taken"}`;
  }
  const mmss = s => `${(s / 60) | 0}:${String((s % 60) | 0).padStart(2, "0")}`;
  /** where the skull is, for the team holding it (or everyone when it's loose) */
  function ballText(t) {
    const B = G.ball;
    if (B.state === "carried" && B.carrier) {
      if (B.carrier.team !== t) return "";
      return B.carrier.local ? "☠ You have it" : `☠ ${B.carrier.name}`;
    }
    if (t !== 0) return "";
    if (B.state === "incoming") return "Skull incoming";
    if (B.state === "dropped")
      return `Skull loose · ${Math.max(0, Math.ceil((G.ballReset || 15) - (G.t - B.dropT)))}s`;
    return "Skull in the middle";
  }
  /** free-for-all: pilots by kills, best first */
  const standings = () =>
    G.teams
      .map(tm => ({ t: tm.team, s: tm.score, a: tm.agents[0] }))
      .filter(r => r.a)
      .sort((x, y) => y.s - x.s);
  const ordinal = n =>
    n +
    (n % 10 === 1 && n !== 11
      ? "st"
      : n % 10 === 2 && n !== 12
        ? "nd"
        : n % 10 === 3 && n !== 13
          ? "rd"
          : "th");
  /** the HUD bar's two sides: [label, score, color, alert class] */
  UI.sides = function () {
    const rules = G.rules || "ctf";
    if (rules === "ffa") {
      const st = standings();
      const me = G.human || st[0].a;
      const mine = st.findIndex(r => r.a === me);
      const top = st[0];
      const rival = top.a === me ? st[1] : top;
      return [
        [
          mode === "play" ? `You · ${ordinal(mine + 1)}` : top.a.name,
          String(mode === "play" ? (st[mine] || top).s : top.s),
          G.human ? K.myColor : CTF.teamHex(me.team),
          "",
        ],
        [
          rival ? `${rival.a === top.a ? "Leader" : "Next"} · ${rival.a.name}` : "",
          rival ? String(rival.s) : "",
          rival ? CTF.teamHex(rival.t) : "",
          "",
        ],
      ];
    }
    return [0, 1].map(t => {
      const tm = G.teams[t];
      if (rules === "oddball") {
        const txt = ballText(t);
        return [txt, mmss(tm.held), CTF.TEAM_HEX[t], txt.startsWith("☠") ? "alert taken" : ""];
      }
      if (rules === "ctf") {
        const s = G.flags[t].state;
        return [
          flagText(G.flags[t]),
          String(tm.score),
          CTF.TEAM_HEX[t],
          s === "home" ? "" : s === "dropped" ? "alert dropped" : "alert taken",
        ];
      }
      return [t === 0 ? `${TN[0]} kills` : `${TN[1]} kills`, String(tm.score), CTF.TEAM_HEX[t], ""];
    });
  };
  function updHud() {
    const sides = UI.sides();
    for (let t = 0; t < 2; t++) {
      const [label, score, color, cls] = sides[t];
      $("cS" + t).textContent = score;
      const el = $("cF" + t);
      el.textContent = label;
      el.className = cls;
      /* free-for-all colors come from the pilots; the teams keep red and blue from the stylesheet */
      const side = /** @type {HTMLElement} */ (el.parentElement);
      side.style.borderBottomColor = G.ffa ? color : "";
      $("cS" + t).style.color = G.ffa ? color : "";
    }
    /* what wins, under the clock */
    const P = (K.PLAY_MODES || []).find(p => p.id === (G.rules === "slayer" ? "slayer" : G.rules));
    $("cGoal").textContent = G.ball
      ? `Hold ${mmss(G.scoreLimit)}`
      : `First to ${G.scoreLimit}${P ? " " + P.unit : ""}`;
    /* (an opening drop adds its fall to the limit: the clock reads full until the pods land) */
    const left = Math.max(0, G.timeLimit - Math.max(G.t, G.dropT || 0));
    $("cClock").textContent = mmss(left);
    if (mode === "sim" && (G.rules || "ctf") === "ctf")
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
  /* ---------- minimap: the map's walkable grid, scaled to fit, the long side vertical ---------- */
  const MW = 78,
    MH = 150;
  let MS = 1.5,
    MX = 0,
    MZ = 0;
  function buildMini() {
    const c = $("cMini");
    mini = c.getContext("2d");
    const B = CTF.MAP.bounds;
    if (miniMap === CTF.MAP.id && miniBg) return;
    miniMap = CTF.MAP.id;
    const w = B.x1 - B.x0,
      d = B.z1 - B.z0;
    MS = Math.min(MW / w, MH / d);
    MX = (B.x0 + B.x1) / 2;
    MZ = (B.z0 + B.z1) / 2;
    const img = mini.createImageData(MW, MH);
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const wx = MX + (x - MW / 2) / MS,
          wz = MZ - (y - MH / 2) / MS;
        const cell = NAV.cell(wx, wz);
        const i = (y * MW + x) * 4;
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
    const P = p => [MW / 2 + (p.x - MX) * MS, MH / 2 - (p.z - MZ) * MS];
    const ht = G.human ? G.human.team : -1;
    const mem = ht >= 0 ? G.teams[ht].brain.enemyMem : null;
    const box = (p, col) => {
      const [x, y] = P(p);
      mini.fillStyle = col;
      mini.fillRect(x - 3, y - 3, 6, 6);
      mini.strokeStyle = "#fff";
      mini.lineWidth = 1;
      mini.strokeRect(x - 3.5, y - 3.5, 7, 7);
    };
    for (const f of G.flags)
      box(f.state === "carried" && f.carrier ? f.carrier.pos : f.pos, CTF.TEAM_HEX[f.team]);
    if (G.ball && G.ball.state !== "incoming") box(G.ball.pos, SKULL_HEX);
    for (const a of G.agents) {
      if (!a.alive) continue;
      if (ht >= 0 && a.team !== ht) {
        const m = mem.get(a.id);
        if (!m || G.t - m.t > 2.5) continue;
      }
      const [x, y] = P(a.pos);
      mini.fillStyle = a.local ? "#ffffff" : CTF.teamHex(a.team);
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
  /** a waypoint: team 0/1 colors it red or blue, "skull" bone white, a "#hex" any color */
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
    const hex = typeof team === "string" && team[0] === "#" ? team : "";
    el.className = "cmark " + (hex ? "tx" : team === "skull" ? "skull" : "t" + team);
    el.style.color = hex;
    el.children[1].style.background = hex;
    el.children[0].textContent = label;
    const d = (mode === "play" ? K.me.pos : K.camera.position).distanceTo(pos);
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
    const rules = G.rules || "ctf";
    if (rules === "oddball") return ballMarks();
    if (rules !== "ctf") {
      mark(0, 0, null, "");
      mark(1, 1, null, "");
      return;
    }
    const ht = G.human.team,
      et = 1 - ht;
    const of = G.flags[ht],
      ef = G.flags[et];
    /* a waypoint on every carrier: theirs to kill (with their name), ours to escort */
    if (of.state === "home") mark(0, ht, of.pos, "Defend");
    else if (of.state === "dropped") mark(0, ht, of.pos, "Return");
    else
      mark(
        0,
        ht,
        of.carrier ? of.carrier.pos : of.pos,
        of.carrier ? `Kill ⚑ ${of.carrier.name}` : "Kill carrier"
      );
    if (ef.state === "carried" && ef.carrier) {
      if (ef.carrier.local) {
        mark(1, ht, CTF.FLAG_HOME[ht], of.state === "home" ? "Score" : "Hold");
      } else mark(1, ht, ef.carrier.pos, `Escort ⚑ ${ef.carrier.name}`);
    } else mark(1, et, ef.pos, ef.state === "dropped" ? "Grab" : "Capture");
  }
  /* oddball: the skull where it lies (or where it's coming down), the carrier highlighted in their
     team's color: theirs to kill, ours to cover */
  function ballMarks() {
    const B = G.ball,
      ht = G.human.team;
    mark(1, 1, null, "");
    if (B.state === "carried" && B.carrier) {
      const c = B.carrier;
      if (c.local) mark(0, "skull", null, "");
      else mark(0, c.team, c.pos, c.team === ht ? `Cover ☠ ${c.name}` : `Kill ☠ ${c.name}`);
    } else
      mark(
        0,
        "skull",
        B.state === "incoming" ? CTF.BALL_HOME : B.pos,
        B.state === "incoming" ? "Skull incoming" : "Take the skull"
      );
  }
  /* spectating: every carrier gets a waypoint in the color of what they carry */
  function updCarrierMarks() {
    if (G.ball) {
      const B = G.ball;
      if (B.state === "carried" && B.carrier) mark(0, B.carrier.team, B.carrier.pos, `☠ ${B.carrier.name}`);
      else mark(0, "skull", B.state === "incoming" ? null : B.pos, "Skull");
      mark(1, 1, null, "");
      return;
    }
    for (let t = 0; t < 2; t++) {
      const f = G.flags[t];
      if (f && f.state === "carried" && f.carrier) mark(t, t, f.carrier.pos, `⚑ ${f.carrier.name}`);
      else mark(t, t, null, "");
    }
  }
})();
