/* ============ HIT CHECKS: lag compensation and validation of claimed hits ============
   A hit claimed by another player carries the shot's ray, the shooter's clock when they fired (ft)
   and the victim's clock time they were seeing the victim at (vt). Everyone keeps a short history of
   each pilot's reported movement in that pilot's own clock (MoveHist), so a claim can be re-checked
   against where the victim really was on the shooter's screen: the rewind.
     - The rewind is capped (HITCHK.CAP): a shot reaching back further than that is checked against
       where the victim was CAP seconds before the shot landed, so a very laggy shooter has to lead.
     - The victim decides arena hits on themself (arena-net.js), with this check; the room host runs
       the same checks on every hit it relays, logs the verdicts per shooter and re-checks failed
       ones against the match recording (REC) once the moments around them are recorded. Everyone
       uses the same rules on the same reported movement, so verdicts agree.
     - Geometry, line of sight, range and fire rate reject a hit. Aim (the ray against the way the
       shooter was reported looking) and ammo depend on every movement packet arriving, so they only
       flag it. Tolerances were tuned with tests/net.test.js under simulated lag, jitter and loss. */
class MoveHist {
  constructor(keep = 1.6) {
    this.keep = keep;
    /** @type {{ ts: number, x: number, y: number, z: number, yaw: number, pitch: number, h: number }[]} */
    this.buf = [];
    /** the newest time (pilot clock) a reload, death or weapon change was reported: ammo starts over */
    this.resetAt = -1e9;
    this.lastSt = -1;
  }
  /** a reported state: ts in the pilot's clock (seconds), p = [x, y, z] or a vector */
  push(ts, p, yaw, pitch, st, dead) {
    const b = this.buf;
    const x = Array.isArray(p) ? p[0] : p.x,
      y = Array.isArray(p) ? p[1] : p.y,
      z = Array.isArray(p) ? p[2] : p.z;
    const r = { ts, x, y, z, yaw, pitch, h: st & 1 && !(st & 4) ? H_CROUCH : H_STAND };
    if (!b.length || ts > b[b.length - 1].ts) b.push(r);
    else {
      /* late packet: slot it in */
      if (b.some(q => q.ts === ts)) return;
      let i = b.length;
      while (i > 0 && b[i - 1].ts > ts) i--;
      b.splice(i, 0, r);
    }
    const wpn = st & 40960;
    if (dead || st & 64 || (this.lastSt >= 0 && wpn !== (this.lastSt & 40960)))
      this.resetAt = Math.max(this.resetAt, ts);
    if (ts >= b[b.length - 1].ts) this.lastSt = st;
    const newest = b[b.length - 1].ts;
    while (b.length > 2 && newest - b[0].ts > this.keep) b.shift();
  }
  get ready() {
    return this.buf.length > 0;
  }
  /** interpolated state at time t (pilot clock); past the ends it holds the end state (edge = seconds outside) */
  at(t, out = {}) {
    const b = this.buf;
    if (!b.length) return null;
    let a, c;
    if (t <= b[0].ts) a = c = b[0];
    else if (t >= b[b.length - 1].ts) a = c = b[b.length - 1];
    else {
      let i = b.length - 1;
      while (i > 0 && b[i - 1].ts > t) i--;
      a = b[i - 1];
      c = b[i];
    }
    const k = c === a ? 0 : (t - a.ts) / (c.ts - a.ts || 1);
    out.x = a.x + (c.x - a.x) * k;
    out.y = a.y + (c.y - a.y) * k;
    out.z = a.z + (c.z - a.z) * k;
    out.yaw = a.yaw + Math.atan2(Math.sin(c.yaw - a.yaw), Math.cos(c.yaw - a.yaw)) * k;
    out.pitch = a.pitch + (c.pitch - a.pitch) * k;
    out.h = k < 0.5 ? a.h : c.h;
    out.edge = t < b[0].ts ? b[0].ts - t : t > b[b.length - 1].ts ? t - b[b.length - 1].ts : 0;
    return out;
  }
}
const HITCHK = (() => {
  const T = {
    /** the furthest back a shot can reach (s): from the victim's view time to when the shot landed */
    CAP: 0.5,
    /** the ray must pass this close to the body's axis (feet to head); the hit boxes reach 0.57 m */
    RAD: 0.8,
    /** positions within this many seconds either side of the rewound time count (clock estimates) */
    SLACK_T: 0.05,
    /** the ray starts this close to the shooter's reported body when they fired (m) */
    ORIGIN: 1.6,
    /** the ray points this close to where the shooter was reported looking (radians): flag only */
    AIM: 0.4,
    /** walls may cut a ray this much short of the target (destruction and rounding differ a little) */
    LOS: 0.7,
    /** fire rate: distinct shots in any second may exceed the weapon's rate by this factor (+ a burst) */
    RATE: 1.25,
    /** ammo: shots without a reported reload past a magazine (flag only) */
    AMMO: 2,
  };
  const HITSCAN = new Set(["rifle", "pistol", "sniper", "burst", "scatter", "beam"]);
  const wpnOf = w => WEAPON_DATA.find(x => x.dmg === w) || null;
  const _o = new V3(),
    _d = new V3(),
    _c = new V3(),
    _s = {},
    _v = {};
  /** closest approach between a ray and the vertical segment of a body (feet to head), and where */
  function rayBody(o, d, p, h) {
    /* ray o + d·t (t ≥ 0) against segment p + up·s (0 ≤ s ≤ h) */
    const wx = o.x - p.x,
      wy = o.y - p.y,
      wz = o.z - p.z;
    const b = d.y,
      dd = d.x * wx + d.y * wy + d.z * wz,
      e = wy;
    const den = 1 - b * b;
    let t, s;
    if (den < 1e-6) {
      t = 0;
      s = e;
    } else {
      t = (b * e - dd) / den;
      s = e + b * t;
    }
    s = Math.max(0, Math.min(h, s));
    t = Math.max(0, (p.x - o.x) * d.x + (p.y + s - o.y) * d.y + (p.z - o.z) * d.z);
    const cx = o.x + d.x * t - p.x,
      cy = o.y + d.y * t - (p.y + s),
      cz = o.z + d.z * t - p.z;
    return { dist: Math.hypot(cx, cy, cz), t };
  }
  /** a stream of claims from one shooter, as seen by one checker (fire rate, ammo) */
  const newStream = () => ({ shots: [], lastFt: -1e9, n: 0, ammoFrom: -1e9, ammoW: "" });
  /**
   * check one claimed hit.
   * @param {{ w: string, o?: number[] | null, d?: number[] | null, ft?: number, vt?: number, ftV?: number | null,
   *   victim?: { at(t: number, out?: any): any } | null, shooter?: MoveHist | { at(t: number, out?: any): any } | null,
   *   stream?: any, now?: number | null }} c
   *   ft: shooter clock (s) when fired; vt: victim clock (s) the shooter was seeing; ftV: the shot time
   *   in the victim's clock (null if unknown); now: the victim clock now (bounds the rewind without ftV)
   * @returns {{ ok: boolean, why: string, flags: string[], rewind: number, miss: number, t: number | null }}
   *   rewind: how far back the victim was checked (s); miss: how far the ray passed from their body
   *   axis (m, -1 if not checked); t: the victim clock time checked (null if not checked)
   */
  function check(c) {
    const r = { ok: true, why: "", flags: [], rewind: 0, miss: -1, t: /** @type {number | null} */ (null) };
    const fail = why => {
      if (r.ok) {
        r.ok = false;
        r.why = why;
      }
    };
    const Wd = wpnOf(c.w);
    const hitscan = HITSCAN.has(c.w);
    /* fire rate and ammo: every distinct shot (one shot can hit two players: same ft) */
    const st = c.stream,
      vic = c.victim,
      sh = c.shooter;
    if (st && hitscan && Wd && c.ft != null && c.ft !== st.lastFt) {
      if (c.ft < st.lastFt - 0.001) r.flags.push("order");
      st.lastFt = Math.max(st.lastFt, c.ft);
      st.shots.push(c.ft);
      while (st.shots.length && st.shots[0] < c.ft - 1) st.shots.shift();
      const per = Wd.burst ? Wd.rate / Wd.burst : Wd.rate;
      const limit = Math.floor((1 / per) * T.RATE) + (Wd.burst || 1) + 1;
      if (st.shots.length > limit) fail("rate");
      const reset = sh && "resetAt" in sh ? sh.resetAt : -1e9;
      if (st.ammoW !== c.w || reset > st.ammoFrom) {
        st.ammoW = c.w;
        st.ammoFrom = Math.max(reset, st.ammoFrom);
        st.n = 0;
      }
      if (++st.n > Wd.mag + T.AMMO) r.flags.push("ammo");
    }
    if (!hitscan) {
      /* melee and charge: the victim within reach of where the shooter was */
      if ((c.w === "melee" || c.w === "charge") && vic && sh && c.vt && c.ft != null) {
        const v = vic.at(c.vt, _v),
          s = sh.at(c.ft, _s);
        if (v && s && v.edge < 0.5 && s.edge < 0.5 && Math.hypot(v.x - s.x, v.z - s.z) > 6.5) fail("reach");
      }
      return r;
    }
    /* a shot always carries its ray; without one there is nothing to check it against */
    const okRay = a => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(Number.isFinite);
    if (okRay(c.o) && okRay(c.d)) {
      _o.set(c.o[0], c.o[1], c.o[2]);
      _d.set(c.d[0], c.d[1], c.d[2]);
    }
    if (!okRay(c.o) || !okRay(c.d) || _d.lengthSq() < 0.5) {
      if (vic) fail("ray");
      return r;
    }
    _d.normalize();
    /* where the shooter was when they fired: the ray starts at them and points their way */
    if (sh && c.ft != null) {
      const s = sh.at(c.ft, _s);
      if (s && s.edge < 0.25) {
        _c.set(s.x, s.y, s.z);
        const dx = _o.x - s.x,
          dz = _o.z - s.z,
          dy = _o.y < s.y ? s.y - _o.y : _o.y > s.y + s.h + 0.3 ? _o.y - s.y - s.h - 0.3 : 0;
        if (Math.hypot(dx, dy, dz) > T.ORIGIN + s.edge * 12) fail("origin");
        const cp = Math.cos(s.pitch);
        const ax = -Math.sin(s.yaw) * cp,
          ay = Math.sin(s.pitch),
          az = -Math.cos(s.yaw) * cp;
        const dot = Math.max(-1, Math.min(1, ax * _d.x + ay * _d.y + az * _d.z));
        if (Math.acos(dot) > T.AIM) r.flags.push("aim");
      }
    }
    if (!vic || !c.vt) return r;
    /* the rewind: where the victim was on the shooter's screen, capped */
    let tR = c.vt;
    if (c.ftV != null) tR = Math.max(c.vt, c.ftV - T.CAP);
    else if (c.now != null) tR = Math.max(c.vt, c.now - T.CAP - 0.25);
    r.t = tR;
    r.rewind = c.ftV != null ? c.ftV - tR : c.now != null ? c.now - tR : 0;
    let best = null;
    for (let k = -2; k <= 2; k++) {
      const v = vic.at(tR + (k * T.SLACK_T) / 2, _v);
      if (!v) continue;
      _c.set(v.x, v.y, v.z);
      const q = rayBody(_o, _d, _c, v.h);
      if (!best || q.dist < best.dist) best = { dist: q.dist, t: q.t };
    }
    if (!best) return r;
    r.miss = best.dist;
    if (best.dist > T.RAD) fail("miss");
    const R = (Wd && Wd.range) || 120;
    if (best.t > R * 1.15 + 3) fail("range");
    /* line of sight along the claimed ray, up to the victim */
    if (best.t > 1 && rayWorld(_o, _d, best.t) < best.t - T.LOS) fail("wall");
    return r;
  }

  /* ---- the host's record: every claimed hit it relays, per shooter ---- */
  /** @type {Map<string, { name: string, hits: number, rejected: number, flagged: number, confirmed: number, cleared: number, why: Record<string, number>, conf: Record<string, number> }>} */
  const log = new Map();
  /** failed checks waiting for the recording to cover them: re-checked from REC */
  let pending = [];
  /** victims' and shooters' verdicts on hits (this client) */
  const me_ = {
    sent: 0,
    refused: 0,
    taken: 0,
    rejected: 0,
    /** how far back hits on you were checked (ms), and how far their rays passed from your body axis (cm) */
    rewinds: /** @type {number[]} */ ([]),
    misses: /** @type {number[]} */ ([]),
  };
  const total = { checked: 0, rejected: 0, flagged: 0, confirmed: 0, cleared: 0 };
  function row(key, name) {
    let e = log.get(key);
    if (!e)
      log.set(
        key,
        (e = { name, hits: 0, rejected: 0, flagged: 0, confirmed: 0, cleared: 0, why: {}, conf: {} })
      );
    if (name) e.name = name;
    return e;
  }
  /**
   * the host notes a verdict. rc (optional) is what a replay check needs: { vid, sid } recorded pilot
   * ids, { gs, gv } the game times (REC clock) of the shot and of the victim's rewound place, { o, d, w }
   */
  function note(key, name, v, rc) {
    const e = row(key, name);
    e.hits++;
    total.checked++;
    if (!v.ok) {
      e.rejected++;
      total.rejected++;
      e.why[v.why] = (e.why[v.why] || 0) + 1;
    } else if (v.flags.length) {
      e.flagged++;
      total.flagged++;
      for (const f of v.flags) e.why[f] = (e.why[f] || 0) + 1;
    }
    if ((!v.ok || v.flags.length) && rc)
      pending.push(Object.assign({ key, at: now, why: v.why, flags: v.flags }, rc));
  }
  /** a recorded pilot as a history for check(): times are game time (REC) */
  const recHist = id => ({
    at(t, out = {}) {
      const s = REC.sample(id, t);
      if (!s) return null;
      out.x = s.x;
      out.y = s.y;
      out.z = s.z;
      out.yaw = s.yaw;
      out.pitch = s.pitch;
      out.h = s.st && s.st.crouch ? H_CROUCH : H_STAND;
      out.edge = 0;
      return out;
    },
  });
  /** re-check failed hits against the recording, once it holds the moments around them */
  function replay(all) {
    if (!pending.length) return;
    const keep = [];
    for (const p of pending) {
      if (!all && now - p.at < 1) {
        keep.push(p);
        continue;
      }
      const v = check({
        w: p.w,
        o: p.o,
        d: p.d,
        ft: p.gs,
        vt: p.gv,
        victim: recHist(p.vid),
        shooter: p.sid ? recHist(p.sid) : null,
      });
      const e = log.get(p.key);
      /* fire rate and ammo are not in the recording: those verdicts stand */
      const bad = !v.ok || v.flags.includes("aim") || p.why === "rate" || p.flags.includes("ammo");
      if (e) {
        if (bad) e.confirmed++;
        else e.cleared++;
        /* what the replay found, by the live verdict: "miss+" confirmed, "miss-" cleared */
        const k = (p.why || p.flags[0] || "?") + (bad ? "+" : "-");
        e.conf[k] = (e.conf[k] || 0) + 1;
      }
      if (bad) total.confirmed++;
      else total.cleared++;
    }
    pending = keep;
  }
  onFrame(() => replay(false), { menu: true, full: true });
  EVENTS.on("matchEnd", () => replay(true));
  EVENTS.on("matchStart", () => {
    log.clear();
    pending = [];
    Object.assign(total, { checked: 0, rejected: 0, flagged: 0, confirmed: 0, cleared: 0 });
    Object.assign(me_, { sent: 0, refused: 0, taken: 0, rejected: 0, rewinds: [], misses: [] });
  });
  return {
    T,
    check,
    rayBody,
    newStream,
    note,
    replay,
    recHist,
    log,
    total,
    me: me_,
    get pending() {
      return pending.length;
    },
    /** the host's summary rows, worst first */
    rows: () =>
      [...log.values()].sort(
        (a, b) => b.confirmed - a.confirmed || b.rejected - a.rejected || b.hits - a.hits
      ),
    /** reset everything (tests) */
    reset() {
      log.clear();
      pending = [];
      Object.assign(total, { checked: 0, rejected: 0, flagged: 0, confirmed: 0, cleared: 0 });
      Object.assign(me_, { sent: 0, refused: 0, taken: 0, rejected: 0, rewinds: [], misses: [] });
    },
  };
})();
/** your own movement, in your own clock: what other players saw of you (the victim's rewind) */
const MY_HIST = new MoveHist();
/* ---- where the verdicts show: the network panel (F4) and, for the host, the results screen ---- */
const pctOf = (n, of) => (of ? Math.round((n / of) * 100) + "%" : "–");
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}
/** lines for the network panel: your claims, hits on you, and (host) every claim it checked */
function hitPanel(el) {
  const m = HITCHK.me,
    t = HITCHK.total;
  const line = (txt, cls) => {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = txt;
    el.appendChild(d);
  };
  if (m.sent || m.taken || m.rejected)
    line(
      `Hits · yours ${m.sent}${m.refused ? `, ${m.refused} refused` : ""} · on you ${m.taken}` +
        `${m.rejected ? `, ${m.rejected} rejected` : ""}` +
        (m.rewinds.length ? ` · rewind ${median(m.rewinds)} ms (cap ${Math.round(HITCHK.T.CAP * 1000)})` : "")
    );
  if (!t.checked) return;
  line(
    `Host checks · ${t.checked} hits · ${t.rejected} rejected · ${t.flagged} flagged · replay: ${t.confirmed} confirmed, ${t.cleared} cleared`
  );
  for (const r of HITCHK.rows())
    if (r.rejected || r.flagged)
      line(
        `  ${r.name}: ${r.rejected} rejected, ${r.flagged} flagged of ${r.hits} (${Object.entries(r.why)
          .map(([k, n]) => k + " " + n)
          .join(", ")})${r.confirmed ? ` · ${r.confirmed} confirmed` : ""}`,
        r.confirmed ? "nbad" : ""
      );
}
const WHY = {
  miss: "missed where they were",
  wall: "through a wall",
  range: "out of range",
  origin: "fired from elsewhere",
  rate: "too fast",
  ray: "no shot",
  reach: "out of reach",
  aim: "aim",
  ammo: "ammo",
  order: "order",
};
let postHitsShown = false;
/** the host's results screen gets a hit check summary: who had hits rejected, and what the replay found */
function postHits() {
  if (!POST.open) {
    postHitsShown = false;
    return;
  }
  if (postHitsShown) return;
  postHitsShown = true;
  HITCHK.replay(true);
  /** @type {any} */
  let box = $("postHits");
  const t = HITCHK.total;
  if (!t.checked) {
    if (box) box.parentElement.hidden = true;
    return;
  }
  if (!box) {
    const sec = document.createElement("section"),
      h = document.createElement("h3");
    h.textContent = "Hit check";
    box = document.createElement("div");
    box.id = "postHits";
    sec.append(h, box);
    const me_ = $("postMe");
    if (!me_ || !me_.parentElement || !me_.parentElement.parentElement) return;
    me_.parentElement.parentElement.appendChild(sec);
  }
  box.parentElement.hidden = false;
  box.textContent = "";
  const line = (k, v) => {
    const d = document.createElement("div"),
      b = document.createElement("b");
    b.textContent = v;
    d.append(k, b);
    box.appendChild(d);
  };
  line("Hits checked", `${t.checked} · ${pctOf(t.checked - t.rejected, t.checked)} fair`);
  line("Rejected · flagged", `${t.rejected} · ${t.flagged}`);
  line("Replay check", `${t.confirmed} confirmed · ${t.cleared} cleared`);
  for (const r of HITCHK.rows().slice(0, 4))
    if (r.rejected || r.flagged) {
      const top = Object.entries(r.why).sort((a, b) => b[1] - a[1])[0];
      line(
        r.name,
        `${r.rejected + r.flagged}/${r.hits}${top ? " · " + (WHY[top[0]] || top[0]) : ""}${r.confirmed ? " · " + r.confirmed + " confirmed" : ""}`
      );
    }
}
onFrame(postHits, { menu: true, full: true });
