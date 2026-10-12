/* ============ MATCH STATS ============
   Built only from the event stream (game/events.js), so it works the same offline, hosting, as an
   online client and after a host hands over: every pilot is a stable id, and the mode's roster
   (EXT.roster, or the arena's players) supplies who is in the match, their team and the
   authoritative kills and deaths. A pilot whose id changed (a migrated match rebuilds its AI)
   keeps their stats through their name and team.
   STATS.rows() → one row per pilot; STATS.timeline → the moments worth showing after the match. */
const ASSIST_WINDOW = 6;
const GUN_WEAPONS = new Set(["rifle", "pistol", "sniper"]);
const STATS = {
  /** @type {Map<string, any>} */
  byId: new Map(),
  /** @type {{ t: number, text: string, base: string, n: number, team: number, kind: string }[]} */
  timeline: [],
  t0: 0,
  firstBlood: false,
  sort: { key: "score", dir: -1 },
  /** a pilot's row, made on first sight */
  row(id, name) {
    if (!id || id === "world") return null;
    let r = this.byId.get(id);
    if (!r) {
      r = {
        id,
        name: name || id,
        team: -1,
        k: 0,
        d: 0,
        a: 0,
        dmg: 0,
        shots: 0,
        hits: 0,
        hs: 0,
        medals: [],
        spree: 0,
        best: 0,
        kw: {},
        caps: 0,
        rets: 0,
        carries: 0,
        flagT: 0,
        carryAt: -1,
        /** who hurt this pilot lately: id → time (for assists) */
        hurtBy: new Map(),
      };
      this.byId.set(id, r);
    }
    if (name) r.name = name;
    return r;
  },
  reset() {
    this.byId.clear();
    this.timeline.length = 0;
    this.t0 = now;
    this.firstBlood = false;
  },
  /** a moment for the timeline; the same moment again right after folds into "×n" */
  mark(text, kind, team = -1) {
    const last = this.timeline[this.timeline.length - 1];
    if (last && last.base === text) {
      last.n++;
      last.text = `${text} ×${last.n}`;
      return;
    }
    this.timeline.push({ t: now - this.t0, text, base: text, n: 1, team, kind });
    /* the first blood always stays; the rest is a rolling window */
    if (this.timeline.length > 60) this.timeline.splice(this.timeline[0].kind === "first" ? 1 : 0, 1);
  },
};
const WEAPON_NAMES = {
  rifle: "Carbine",
  pistol: "Magnum",
  sniper: "Sniper",
  rocket: "Rocket",
  frag: "Frag",
  stick: "Plasma",
  pound: "Pound",
  charge: "Charge",
  melee: "Melee",
  pod: "Pod",
};
EVENTS.on("matchStart", () => STATS.reset());
EVENTS.on("shot", e => {
  const r = STATS.row(e.pilot);
  if (r) r.shots++;
});
EVENTS.on("damage", e => {
  const by = STATS.row(e.by),
    v = STATS.row(e.victim);
  if (by && e.by !== e.victim) {
    by.dmg += e.amount || 0;
    if (GUN_WEAPONS.has(e.weapon)) by.hits++;
  }
  if (v && by && e.by !== e.victim) v.hurtBy.set(e.by, now);
});
EVENTS.on("kill", e => {
  const k = STATS.row(e.killer, e.killerName),
    v = STATS.row(e.victim, e.victimName);
  if (v) {
    v.d++;
    v.spree = 0;
    /* everyone else who hurt them in the last few seconds gets an assist */
    for (const [id, t] of v.hurtBy)
      if (id !== e.killer && id !== e.victim && now - t < ASSIST_WINDOW) {
        const a = STATS.row(id);
        if (a) a.a++;
      }
    v.hurtBy.clear();
    if (v.carryAt >= 0) {
      v.flagT += now - v.carryAt;
      v.carryAt = -1;
    }
  }
  if (k && e.killer !== e.victim) {
    k.k++;
    k.spree++;
    k.best = Math.max(k.best, k.spree);
    k.kw[e.weapon] = (k.kw[e.weapon] || 0) + 1;
    if (e.head) k.hs++;
    if (!STATS.firstBlood) {
      STATS.firstBlood = true;
      STATS.mark(`First blood: ${k.name} on ${v ? v.name : "?"}`, "first", k.team);
    }
    if (k.spree === 5 || k.spree === 10 || k.spree === 15)
      STATS.mark(`${k.name}: ${k.spree} kills without dying`, "spree", k.team);
  }
});
EVENTS.on("medal", e => {
  const r = STATS.row(e.pilot);
  /* every kill earns a plain "kill" medal; only the real ones count */
  if (!r || e.medal === "kill") return;
  r.medals.push(e.medal);
  if (/^(double|triple|quad|mass)$/.test(e.medal))
    STATS.mark(`${r.name}: ${MEDAL[e.medal] ? MEDAL[e.medal][1] : e.medal}`, "multi", r.team);
});
EVENTS.on("flagTaken", e => {
  const r = STATS.row(e.pilot, e.pilotName);
  if (!r) return;
  r.carries++;
  r.carryAt = now;
  STATS.mark(`${r.name} took the flag`, "flag", r.team);
});
const endCarry = e => {
  const r = STATS.byId.get(e.pilot);
  if (r && r.carryAt >= 0) {
    r.flagT += now - r.carryAt;
    r.carryAt = -1;
  }
  return r;
};
EVENTS.on("flagDrop", e => endCarry(e));
EVENTS.on("capture", e => {
  const r = endCarry(e) || STATS.row(e.pilot, e.pilotName);
  if (!r) return;
  r.caps++;
  STATS.mark(`${r.name} captured the flag`, "capture", r.team);
});
EVENTS.on("flagReturn", e => {
  const r = STATS.row(e.pilot, e.pilotName);
  if (r) r.rets++;
});
/** who is in the match right now: the mode's roster, or the arena's players */
function statRoster() {
  if (EXT && EXT.roster) return EXT.roster();
  const out = [{ id: "local", name: myName, k: kills, d: deaths, team: -1, me: true }];
  for (const r of remotes.values())
    if (r.has) out.push({ id: r.id, name: r.name, k: r.k, d: r.d, team: -1, me: false });
  for (const b of bots) out.push({ id: b.id, name: b.name, k: b.k, d: b.d, team: -1, me: false });
  return out;
}
/** who holds a power weapon now (id → weapon key) */
function powerHeld() {
  const m = new Map();
  if (playing && !me.dead && WEAPON_DATA[wi] && WEAPON_DATA[wi].power) m.set("local", WEAPON_DATA[wi].key);
  const list = EXT && EXT.powerHolders ? EXT.powerHolders() : arenaPowerHolders();
  for (const h of list) m.set(h.pid || h.id, h.key);
  return m;
}
/** a pilot's contribution, for sorting and MVP */
const statScore = r => r.k + r.a * 0.5 + r.caps * 3 + r.rets + r.dmg / 400 - r.d * 0.25;
/** every pilot in the match with their numbers (roster order is replaced by the current sort) */
STATS.rows = function () {
  const roster = statRoster();
  const held = powerHeld();
  const used = new Set();
  const rows = roster.map(p => {
    let r = STATS.byId.get(p.id);
    /* a migrated match gave this pilot a new id: carry their stats over by name and team */
    if (!r)
      for (const o of STATS.byId.values())
        if (
          !used.has(o.id) &&
          o.name === p.name &&
          (o.team === p.team || o.team < 0) &&
          !roster.some(q => q.id === o.id)
        ) {
          r = o;
          STATS.byId.delete(o.id);
          o.id = p.id;
          STATS.byId.set(p.id, o);
          break;
        }
    r = r || STATS.row(p.id, p.name);
    used.add(p.id);
    r.name = p.name;
    r.team = p.team;
    /* the mode's kills and deaths are the score of record */
    if (p.k != null) r.k = p.k;
    if (p.d != null) r.d = p.d;
    const carry = r.carryAt >= 0 ? now - r.carryAt : 0;
    return {
      id: r.id,
      name: r.name,
      team: r.team,
      me: !!p.me,
      k: r.k,
      d: r.d,
      a: r.a,
      kd: r.k / Math.max(1, r.d),
      dmg: Math.round(r.dmg),
      acc: r.shots ? Math.min(1, r.hits / r.shots) : -1,
      shots: r.shots,
      hs: r.hs,
      medals: r.medals.length,
      medalList: r.medals.slice(),
      spree: r.spree,
      best: r.best,
      kw: Object.assign({}, r.kw),
      power: held.get(r.id) || "",
      caps: r.caps,
      rets: r.rets,
      carries: r.carries,
      flagT: r.flagT + carry,
      score: statScore(r),
    };
  });
  const { key, dir } = STATS.sort;
  rows.sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : b.score - a.score));
  return rows;
};
/** awards for the post-match screen: [{ title, name, value }] */
STATS.awards = function (rows) {
  /** @param {(r: any) => number} f @param {(r: any) => boolean} [ok] */
  const best = (f, ok = r => !!r) => {
    let w = null;
    for (const r of rows) if (ok(r) && (!w || f(r) > f(w))) w = r;
    return w;
  };
  const out = [];
  const mvp = best(r => r.score);
  if (mvp)
    out.push({ title: "MVP", name: mvp.name, value: `${mvp.k} K · ${mvp.a} A · ${mvp.d} D`, me: mvp.me });
  const dmg = best(r => r.dmg);
  if (dmg && dmg.dmg > 0)
    out.push({ title: "Most damage", name: dmg.name, value: String(dmg.dmg), me: dmg.me });
  const acc = best(
    r => r.acc,
    r => r.shots >= 20
  );
  if (acc)
    out.push({ title: "Best accuracy", name: acc.name, value: Math.round(acc.acc * 100) + "%", me: acc.me });
  const run = best(
    r => r.flagT + r.caps * 30,
    r => r.carries > 0
  );
  if (run)
    out.push({
      title: "Top flag runner",
      name: run.name,
      value: `${run.caps} caps · ${Math.round(run.flagT)} s`,
      me: run.me,
    });
  return out;
};
STATS.weaponName = w => WEAPON_NAMES[w] || w;
