/* ===== CTF team brain: opponent modeling, strategy learning, roles, team comms ===== */
(function () {
  const K = window.KA,
    T = K.THREE,
    CTF = window.CTF,
    NAV = CTF.NAV;
  const V3 = T.Vector3;
  const STRATS = ["Split", "Stack", "Rush", "Turtle", "Control"];
  const STRAT_DESC = {
    Split: "2 attack on separate lanes, 1 holds mid, 1 defends",
    Stack: "3 push one lane together, 1 defends",
    Rush: "all 4 push at once",
    Turtle: "2 defend, 1 holds mid, 1 probes",
    Control: "2 fight for mid tower, then 1 attack + 1 defend collapse",
  };
  const ROLE_COUNTS = {
    Split: { attack: 2, mid: 1, defend: 1 },
    Stack: { attack: 3, defend: 1 },
    Rush: { attack: 4 },
    Turtle: { defend: 2, mid: 1, attack: 1 },
    Control: { mid: 2, attack: 1, defend: 1 },
  };
  CTF.STRATS = STRATS;
  CTF.STRAT_DESC = STRAT_DESC;
  /* evolvable play-style genes (0..1 unless noted) */
  const GENES = {
    aggr: 0.55,
    regroup: 0.5,
    strafeVar: 0.5,
    thrustDodge: 0.55,
    pound: 0.45,
    charge: 0.5,
    escortTight: 0.5,
    peek: 0.5,
    flankBias: 0.5,
  };
  CTF.GENES = GENES;
  const rint = n => (Math.random() * n) | 0;
  function gammaSample(k) {
    if (k < 1) {
      return gammaSample(1 + k) * Math.pow(Math.random(), 1 / k);
    }
    const d = k - 1 / 3,
      c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do {
        const u1 = Math.random(),
          u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  const betaSample = (a, b) => {
    const x = gammaSample(a),
      y = gammaSample(b);
    return x / (x + y);
  };

  /* ---------- persistent model ---------- */
  function freshModel() {
    const m = {
      v: 1,
      games: 0,
      wins: 0,
      caps: 0,
      capsAgainst: 0,
      arms: {},
      laneAtk: [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      enemyLane: [1, 1, 1],
      enemyDefLane: [1, 1, 1],
      enemyStrat: {},
      range: [
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      enemyRev: 1.1,
      enemyRevN: 0,
      genes: Object.assign({}, GENES),
      acc: [0, 0],
      accAgainst: [0, 0],
      danger: [],
      history: [],
    };
    return m;
  }
  CTF.loadModels = function () {
    const s = K.STORE.load("ctfBrain");
    if (!s || !Array.isArray(s) || s.length !== 2) return [freshModel(), freshModel()];
    return s.map(cleanModel);
  };
  /* saved learning is re-validated field by field: only known keys, finite numbers, bounded sizes */
  function cleanModel(m) {
    const f = freshModel();
    if (!m || typeof m !== "object") return f;
    const n = (v, lo, hi, d) => {
      v = +v;
      return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    };
    for (const k of ["games", "wins", "caps", "capsAgainst"]) f[k] = n(m[k], 0, 1e7, 0) | 0;
    if (m.arms && typeof m.arms === "object")
      for (const k of Object.keys(m.arms).slice(0, 80)) {
        const [s, t] = k.split("|");
        if (!STRATS.includes(s) || !(t === "*" || STRATS.includes(t))) continue;
        const ab = m.arms[k];
        if (Array.isArray(ab)) f.arms[k] = [n(ab[0], 0.01, 1e4, 1), n(ab[1], 0.01, 1e4, 1)];
      }
    for (const k of ["laneAtk", "range"]) {
      const src = m[k];
      if (Array.isArray(src))
        f[k] = f[k].map((d, i) =>
          Array.isArray(src[i]) ? [n(src[i][0], 0.01, 1e4, 1), n(src[i][1], 0.01, 1e4, 1)] : d
        );
    }
    for (const k of ["enemyLane", "enemyDefLane"]) {
      const src = m[k];
      if (Array.isArray(src)) f[k] = f[k].map((d, i) => n(src[i], 0.01, 1e4, d));
    }
    if (m.enemyStrat && typeof m.enemyStrat === "object")
      for (const s of STRATS) if (m.enemyStrat[s] != null) f.enemyStrat[s] = n(m.enemyStrat[s], 0, 1e4, 0);
    f.enemyRev = n(m.enemyRev, 0.1, 3, 1.1);
    f.enemyRevN = n(m.enemyRevN, 0, 400, 0) | 0;
    if (m.genes && typeof m.genes === "object")
      for (const k in GENES) f.genes[k] = n(m.genes[k], 0, 1, GENES[k]);
    if (Array.isArray(m.acc)) f.acc = [n(m.acc[0], 0, 1e9, 0), n(m.acc[1], 0, 1e9, 0)];
    if (Array.isArray(m.danger)) f.danger = m.danger.slice(0, 12000).map(v => n(v, 0, 1e4, 0));
    if (Array.isArray(m.history))
      f.history = m.history.slice(-40).map(h => ({
        w: h && h.w ? 1 : 0,
        c: n(h && h.c, 0, 99, 0) | 0,
        a: n(h && h.a, 0, 99, 0) | 0,
        s: STRATS.includes(h && h.s) ? h.s : "?",
      }));
    return f;
  }
  CTF.saveModels = function (brains) {
    K.STORE.save(
      "ctfBrain",
      brains.map(b => {
        b.model.danger = b.danger.toJSON();
        return b.model;
      })
    );
  };
  CTF.resetModels = function () {
    K.STORE.remove("ctfBrain");
  };

  /* ---------- zone names for callouts (team-relative) ---------- */
  CTF.zoneName = function (team, p) {
    const z = team === 0 ? p.z : -p.z;
    const lane = CTF.relLane(team, p.x);
    if (z < -34) return p.y > 1.8 ? "our flag stand" : "our base";
    if (z > 34) return p.y > 1.8 ? "their flag stand" : "their base";
    if (Math.abs(z) < 6 && lane === 1) return p.y > 2.5 ? "top of mid" : "under mid";
    const side = z < 0 ? "our " : "their ";
    if (lane !== 1 && Math.abs(p.x) > 22 && p.y > 2) return CTF.LANE_NAMES[lane] + " catwalk";
    return side + CTF.LANE_NAMES[lane];
  };

  /* ---------- TeamBrain ---------- */
  class TeamBrain {
    constructor(team, model) {
      this.team = team;
      this.model = model;
      this.danger = new NAV.Danger();
      this.danger.load(model.danger);
      this.enemyMem = new Map();
      this.comms = [];
      this.roles = new Map();
      this.plan = { strat: "Split", lane: 1, lane2: 2, pushAt: 0, staging: false };
      this.segStart = 0;
      this.segFlagPulls = 0;
      this.roleT = 0;
      this.obsT = 0;
      this.lastSay = new Map();
      this.focus = null;
      this.focusT = 0;
      this.obsAtk = new Map();
      this.obsDef = new Map();
      this.enemyStratGuess = this.topEnemyStrat();
      this.matchStratCounts = {};
    }
    get genes() {
      return this.model.genes;
    }
    topEnemyStrat() {
      const e = this.model.enemyStrat;
      let best = "Split",
        bv = -1;
      for (const k in e)
        if (e[k] > bv) {
          bv = e[k];
          best = k;
        }
      return best;
    }
    arm(k) {
      return this.model.arms[k] || (this.model.arms[k] = [1, 1]);
    }
    /* Thompson sampling over (my strategy | their observed strategy) */
    chooseStrategy(G, why) {
      const theirs = this.enemyStratGuess;
      let best = null,
        bv = -1;
      const scores = {};
      for (const s of STRATS) {
        const [a, b] = this.arm(s + "|" + theirs);
        const [a2, b2] = this.arm(s + "|*");
        const v = 0.7 * betaSample(a, b) + 0.3 * betaSample(a2, b2);
        scores[s] = v;
        if (v > bv) {
          bv = v;
          best = s;
        }
      }
      // pick attack lanes: success prior x (1 - observed defensive presence)
      const dl = this.model.enemyDefLane,
        tot = dl[0] + dl[1] + dl[2];
      const ls = [0, 1, 2].map(l => {
        const [a, b] = this.model.laneAtk[l];
        return betaSample(a, b) * (1.25 - dl[l] / tot) + (l !== 1 ? this.genes.flankBias * 0.15 : 0);
      });
      const ord = [0, 1, 2].sort((a, b) => ls[b] - ls[a]);
      this.plan = { strat: best, lane: ord[0], lane2: ord[1], pushAt: 0, staging: true, since: G.t, theirs };
      this.segStart = G.t;
      this.segFlagPulls = 0;
      this.matchStratCounts[best] = (this.matchStratCounts[best] || 0) + 1;
      const lead = this.leader(G);
      if (lead) {
        const lt = CTF.LANE_NAMES[this.plan.lane];
        const lines = {
          Split: `Split it up. ${lt} and ${CTF.LANE_NAMES[this.plan.lane2]}, I'll call the push.`,
          Stack: `Stack ${lt}, three of us together. Hold for the call.`,
          Rush: `Everyone go. Full send ${lt}.`,
          Turtle: `Lock it down. Two on flag, poke ${lt} when it's clear.`,
          Control: `Take mid first, then we collapse ${lt}.`,
        };
        this.say(G, lead, "plan", (why ? why + " " : "") + lines[best], true);
      }
      return best;
    }
    leader(G) {
      const a = G.teams[this.team].agents.filter(x => !x.human);
      return a.find(x => !x.dead) || a[0];
    }
    /* reward a finished segment (capture or timeout) */
    endSegment(G, reward) {
      const s = this.plan.strat,
        th = this.plan.theirs || "Split";
      const r = Math.max(0, Math.min(1, reward));
      for (const k of [s + "|" + th, s + "|*"]) {
        const ab = this.arm(k);
        ab[0] += r;
        ab[1] += 1 - r;
        if (ab[0] + ab[1] > 40) {
          ab[0] *= 0.9;
          ab[1] *= 0.9;
        }
      }
    }
    /* ---------- observation ---------- */
    observeEnemy(G, e, by) {
      const m = this.enemyMem.get(e.id);
      const fresh = !m || G.t - m.t > 2.5;
      this.enemyMem.set(e.id, {
        pos: e.body.pos.clone(),
        vel: e.body.vel.clone(),
        t: G.t,
        carrier: !!e.carrying,
        sh: e.body.shield,
        agent: e,
      });
      const z = this.team === 0 ? e.body.pos.z : -e.body.pos.z;
      if (z < -8) {
        this.obsAtk.set(e.id, G.t);
        if (z < -14) this.model.enemyLane[CTF.relLane(this.team, e.body.pos.x)] += 0.05;
      }
      if (z > 30) {
        this.obsDef.set(e.id, G.t);
        this.model.enemyDefLane[CTF.relLane(this.team, e.body.pos.x)] += 0.02;
      }
      return fresh;
    }
    observeStrafe(dtRev) {
      const m = this.model;
      m.enemyRevN = Math.min(m.enemyRevN + 1, 400);
      const k = 1 / Math.min(m.enemyRevN, 60);
      m.enemyRev += (dtRev - m.enemyRev) * k;
    }
    duel(range, won) {
      const b = range < 6 ? 0 : range < 14 ? 1 : range < 25 ? 2 : 3;
      this.model.range[b][won ? 0 : 1] += 1;
    }
    prefRange() {
      let bi = 1,
        bv = -1;
      this.model.range.forEach(([a, b], i) => {
        const v = a / (a + b);
        if (v > bv) {
          bv = v;
          bi = i;
        }
      });
      return [4, 10, 19, 28][bi];
    }
    classifyEnemy(G) {
      const now = G.t;
      let atk = 0,
        def = 0;
      for (const [, t] of this.obsAtk) if (now - t < 14) atk++;
      for (const [, t] of this.obsDef) if (now - t < 14) def++;
      let s = "Split";
      if (atk >= 4) s = "Rush";
      else if (atk === 3) s = "Stack";
      else if (def >= 2) s = "Turtle";
      else if (atk <= 1 && def <= 1) s = "Control";
      this.enemyStratGuess = s;
      this.model.enemyStrat[s] = (this.model.enemyStrat[s] || 0) * 0.995 + 0.02;
      return s;
    }
    /* ---------- comms ---------- */
    say(G, from, type, text, force) {
      if (!from) return;
      const key = from.id + type;
      const last = this.lastSay.get(key) || -99;
      if (!force && G.t - last < 4) return;
      this.lastSay.set(key, G.t);
      const msg = { team: this.team, from, type, text, t: G.t };
      this.comms.push(msg);
      if (this.comms.length > 40) this.comms.shift();
      if (G.onComms) G.onComms(msg);
    }
    /* someone shares a spotted enemy: whole team now knows */
    callSpot(G, from, e) {
      const fresh = this.observeEnemy(G, e, from);
      if (!fresh) return;
      const near = [...this.enemyMem.values()].filter(
        m => G.t - m.t < 1.5 && m.pos.distanceTo(e.body.pos) < 9
      ).length;
      const where = CTF.zoneName(this.team, e.body.pos);
      if (e.carrying)
        this.say(
          G,
          from,
          "spotc",
          `Carrier at ${where}!`,
          G.t - (this.lastSay.get(from.id + "spotc") || -99) > 2.5
        );
      else
        this.say(
          G,
          from,
          "spot",
          near >= 2
            ? `${["", "", "Two", "Three", "Four"][near] || near} at ${where}`
            : `One at ${where}, ${e.body.shield <= 0 ? "cracked" : "full shields"}`
        );
    }
    callFocus(G, from, e) {
      this.focus = e;
      this.focusT = G.t;
      this.say(G, from, "focus", `${e.name} is cracked, finish him`);
    }
    /* ---------- roles ---------- */
    tick(G, dt) {
      for (const [id, m] of this.enemyMem) if (G.t - m.t > 8) this.enemyMem.delete(id);
      if (this.focus && (G.t - this.focusT > 3 || this.focus.dead)) this.focus = null;
      this.obsT -= dt;
      if (this.obsT <= 0) {
        this.obsT = 3;
        const prev = this.enemyStratGuess;
        const s = this.classifyEnemy(G);
        if (s !== prev && G.t - this.plan.since > 18) {
          const l = this.leader(G);
          this.say(G, l, "read", `They switched to ${s.toLowerCase()} play. Adjusting.`, true);
          this.chooseStrategy(G);
        }
      }
      this.roleT -= dt;
      if (this.roleT <= 0) {
        this.roleT = 0.5;
        this.assign(G);
      }
      this.coordinatePush(G);
    }
    assign(G) {
      const me = this.team,
        them = 1 - me;
      const team = G.teams[me].agents;
      const bots = team.filter(a => !a.human);
      const ourFlag = G.flags[me],
        theirFlag = G.flags[them];
      const weCarry = theirFlag.state === "carried" && theirFlag.carrier && theirFlag.carrier.team === me;
      const theyCarry = ourFlag.state === "carried";
      const roles = new Map();
      const free = new Set(bots);
      const take = (role, n, score) => {
        const arr = [...free].sort((a, b) => score(a) - score(b));
        for (let i = 0; i < n && i < arr.length; i++) {
          roles.set(arr[i], role);
          free.delete(arr[i]);
        }
      };
      const dist = p => a => (a.dead ? 999 : a.body.pos.distanceTo(p));
      if (weCarry && !theirFlag.carrier.human) {
        roles.set(theirFlag.carrier, "carry");
        free.delete(theirFlag.carrier);
      }
      if (theyCarry) {
        const n = Math.min(free.size, weCarry ? 1 : 2);
        take("chase", n, dist(ourFlag.pos));
      } else if (ourFlag.state === "dropped") {
        take("return", 1, dist(ourFlag.pos));
      }
      if (weCarry) {
        const threat = [...this.enemyMem.values()].filter(m => G.t - m.t < 3).length;
        const n = Math.min(free.size, threat >= 2 || this.genes.escortTight > 0.6 ? 2 : 1);
        take("escort", n, dist(theirFlag.pos));
      }
      if (theirFlag.state === "dropped" && !weCarry) {
        take("grab", 1, dist(theirFlag.pos));
      }
      if (weCarry && theyCarry) {
        /* standoff: carrier holds at home, others hunt */
      }
      const counts = ROLE_COUNTS[this.plan.strat];
      const order = ["defend", "mid", "attack"];
      for (const r of order) {
        const want = counts[r] || 0;
        if (!want || !free.size) continue;
        const have = [...roles.values()].filter(x => x === r).length;
        const n = Math.max(0, want - have);
        take(
          r,
          n,
          a =>
            (this.roles.get(a) === r ? -50 : 0) +
            (r === "defend"
              ? a.body.pos.distanceTo(CTF.FLAG_HOME[me])
              : r === "attack"
                ? -a.body.pos.distanceTo(CTF.FLAG_HOME[me])
                : a.body.pos.length())
        );
      }
      for (const a of free) roles.set(a, "attack");
      for (const [a, r] of roles) {
        const old = this.roles.get(a);
        if (old !== r) {
          a.roleSince = G.t;
          a.path = null;
          if (r === "chase" && old !== "chase") this.say(G, a, "chase", "On their carrier");
          else if (r === "escort")
            this.say(G, a, "escort", `Escorting ${theirFlag.carrier ? theirFlag.carrier.name : "carrier"}`);
          else if (r === "return") this.say(G, a, "ret", "Going for our flag");
        }
        a.role = r;
      }
      this.roles = roles;
    }
    /* attackers regroup at a staging point, leader calls the push */
    coordinatePush(G) {
      const p = this.plan;
      if (!p.staging) return;
      const atk = G.teams[this.team].agents.filter(a => !a.human && a.role === "attack");
      if (!atk.length) {
        return;
      }
      const stage = this.stagePoint(p.lane);
      const ready = atk.filter(a => !a.dead && a.body.pos.distanceTo(stage) < 7).length;
      const waited = G.t - p.since;
      const maxWait = 4 + this.genes.regroup * 9;
      if (
        (ready >= Math.min(atk.length, p.strat === "Split" ? 1 : atk.length) && waited > 2.5) ||
        waited > maxWait ||
        (p.strat === "Rush" && waited > 1.5)
      ) {
        p.staging = false;
        p.pushAt = G.t;
        const lead = atk.find(a => !a.dead) || atk[0];
        const lines = [
          "Go go go!",
          "Pushing now, stay on me",
          "Push. Trade in, don't peek solo",
          "Moving in, three two one",
        ];
        this.say(G, lead, "push", lines[rint(lines.length)], true);
      }
    }
    stagePoint(lane) {
      const z = this.team === 0 ? -12 : 12;
      return new V3(CTF.laneX(this.team, lane) * 0.8, 0, z);
    }
    /* per-cell cost for this team's pathing: learned danger + lane bias for attackers */
    costFn(agent) {
      const d = this.danger.v;
      const lane =
        agent.role === "attack" ? (agent.laneOverride != null ? agent.laneOverride : this.plan.lane) : -1;
      const team = this.team;
      const avoid = (agent.carrying ? 2.2 : 1) * 0.9;
      const wl = NAV.wl,
        cz = NAV.cz;
      const wlane = lane < 0 ? -1 : team === 0 ? lane : 2 - lane;
      const sg = team === 0 ? 1 : -1;
      if (wlane < 0)
        return c => {
          const v = d[c];
          return (v > 6 ? 6 : v) * avoid;
        };
      return c => {
        const v = d[c];
        let k = (v > 6 ? 6 : v) * avoid;
        const zz = cz[c] * sg;
        if (zz > -30 && zz < 34 && wl[c] !== wlane) k += 1.6;
        return k;
      };
    }
    /* learning after match */
    endMatch(G, won, myCaps, theirCaps, enemyGenes) {
      const m = this.model;
      m.games++;
      if (won) m.wins++;
      m.caps += myCaps;
      m.capsAgainst += theirCaps;
      // evolve play style: losers imitate winners and mutate harder
      const sigma = won ? 0.04 : 0.1;
      for (const k in GENES) {
        let v = m.genes[k];
        if (!won && enemyGenes) v += (enemyGenes[k] - v) * 0.35;
        v += (Math.random() * 2 - 1) * sigma;
        m.genes[k] = Math.max(0, Math.min(1, v));
      }
      const top = Object.entries(this.matchStratCounts).sort((a, b) => b[1] - a[1])[0];
      m.history.push({ w: won ? 1 : 0, c: myCaps, a: theirCaps, s: top ? top[0] : "?" });
      if (m.history.length > 40) m.history.shift();
      for (const k of ["enemyLane", "enemyDefLane"]) {
        const a = m[k],
          t = a[0] + a[1] + a[2];
        if (t > 30) for (let i = 0; i < 3; i++) a[i] *= 30 / t;
      }
      this.danger.decay(0.85);
      this.matchStratCounts = {};
    }
  }
  CTF.TeamBrain = TeamBrain;
})();
