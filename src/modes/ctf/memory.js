/* ===== What the AI remembers about a map across matches (CTF.MapMemory), and skill between levels (CTF.skillAt) =====
   Map memory: two heat maps per map on a 3 m grid, kept as a saved document ("aiMaps", keyed by map id):
     fight   where pilots died and killed (a death counts fully, the killer's spot half)
     seen    where enemies were spotted (each fresh sighting a little)
   A match adds to a fresh layer; at its end the layer is folded into what was known (the old heat fades
   to 80% first) and the hottest cells are kept (MEM_KEEP per kind), so the document stays small and
   recent matches count most. Bots read only what was known before the match (prior), so a match plays
   the same for the same memory and seed. Rendered matches load and save it; headless simulations get
   none unless they pass one in (tools/tune.js aiMemory knob).
   Skill levels: AI_SKILL's four levels are points 0 (Recruit) to 3 (Legendary); CTF.skillAt(level)
   interpolates every number between them, so adaptive difficulty can step by fractions. */
(function () {
  const K = window.KA,
    CTF = window.CTF;
  const MEM_CELL = 3,
    MEM_KEEP = 300,
    MEM_FADE = 0.8;
  class MapMemory {
    /** doc: the map document; saved: { w, h, f: [cell, heat, ...], s: [...], n } or null */
    constructor(doc, saved) {
      const B = doc.bounds;
      this.id = doc.id;
      this.x0 = B.x0;
      this.z0 = B.z0;
      this.w = Math.ceil((B.x1 - B.x0) / MEM_CELL);
      this.h = Math.ceil((B.z1 - B.z0) / MEM_CELL);
      const N = this.w * this.h;
      this.prior = { fight: new Float32Array(N), seen: new Float32Array(N) };
      this.now = { fight: new Float32Array(N), seen: new Float32Array(N) };
      this.n = 0;
      if (saved && saved.w === this.w && saved.h === this.h) {
        unpack(saved.f, this.prior.fight);
        unpack(saved.s, this.prior.seen);
        this.n = saved.n | 0;
      }
      this.norm();
    }
    cell(x, z) {
      const i = Math.floor((x - this.x0) / MEM_CELL),
        j = Math.floor((z - this.z0) / MEM_CELL);
      return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
    }
    /** the centre of a cell, at ground height */
    at(c, out) {
      const x = this.x0 + ((c % this.w) + 0.5) * MEM_CELL,
        z = this.z0 + (Math.floor(c / this.w) + 0.5) * MEM_CELL;
      return out.set(x, K.groundBelow(x, z, 30, 0.05), z);
    }
    add(kind, p, amt) {
      const c = this.cell(p.x, p.z);
      if (c >= 0) this.now[kind][c] += amt;
    }
    /** what was known before this match, 0..1 (1 the hottest cell), around a point (3x3 cells) */
    heat(kind, x, z) {
      const c = this.cell(x, z);
      if (c < 0) return 0;
      const a = this.prior[kind],
        w = this.w;
      let s = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const k = c + dj * w + di;
          if (k >= 0 && k < a.length) s += a[k] * (di || dj ? 0.5 : 1);
        }
      return Math.min(1, s / this.max[kind]);
    }
    /** the hottest known cells of a kind, hottest first (cached until the next commit) */
    hot(kind, n) {
      const key = kind + n;
      if (this._hot && this._hot[key]) return this._hot[key];
      const a = this.prior[kind],
        idx = [];
      for (let i = 0; i < a.length; i++) if (a[i] > 0) idx.push(i);
      idx.sort((p, q) => a[q] - a[p] || p - q);
      this._hot = this._hot || {};
      return (this._hot[key] = idx.slice(0, n));
    }
    norm() {
      this.max = {};
      for (const k of ["fight", "seen"]) {
        let m = 0;
        for (const v of this.prior[k]) if (v > m) m = v;
        this.max[k] = m || 1;
      }
      this._hot = null;
    }
    /** fold this match into what is known (old heat fades), keep the hottest cells */
    commit() {
      for (const k of ["fight", "seen"]) {
        const p = this.prior[k],
          q = this.now[k];
        for (let i = 0; i < p.length; i++) p[i] = p[i] * MEM_FADE + q[i];
        trim(p);
        q.fill(0);
      }
      this.n++;
      this.norm();
    }
    toJSON() {
      return { w: this.w, h: this.h, n: this.n, f: pack(this.prior.fight), s: pack(this.prior.seen) };
    }
  }
  /** keep only the MEM_KEEP hottest cells */
  function trim(a) {
    const vals = [];
    for (const v of a) if (v > 0) vals.push(v);
    if (vals.length <= MEM_KEEP) return;
    vals.sort((x, y) => y - x);
    const cut = vals[MEM_KEEP - 1];
    let kept = 0;
    for (let i = 0; i < a.length; i++)
      if (a[i] < cut || (a[i] === cut && kept >= MEM_KEEP)) a[i] = 0;
      else if (a[i] > 0) kept++;
  }
  function pack(a) {
    const o = [];
    for (let i = 0; i < a.length; i++) if (a[i] > 0.01) o.push(i, Math.round(a[i] * 100) / 100);
    return o;
  }
  function unpack(o, a) {
    if (!Array.isArray(o)) return;
    for (let i = 0; i + 1 < o.length && i < 2 * MEM_KEEP; i += 2) {
      const c = o[i] | 0,
        v = +o[i + 1];
      if (c >= 0 && c < a.length && Number.isFinite(v) && v > 0) a[c] = Math.min(1e4, v);
    }
  }
  CTF.MapMemory = MapMemory;
  /** the saved memory for a map (a fresh one if there is none) */
  CTF.loadMemory = function (doc) {
    const all = K.STORE.load("aiMaps");
    return new MapMemory(doc, all && all.maps ? all.maps[doc.id] : null);
  };
  /** save a map's memory with the others (at most 8 maps, the most played kept) */
  CTF.saveMemory = function (mem) {
    const all = K.STORE.load("aiMaps") || { maps: {} };
    all.maps[mem.id] = mem.toJSON();
    const ids = Object.keys(all.maps).sort((a, b) => (all.maps[b].n | 0) - (all.maps[a].n | 0));
    for (const id of ids.slice(8)) delete all.maps[id];
    K.STORE.save("aiMaps", all);
  };
  /* ---------- skill between levels ---------- */
  /* level -1 is Trainee (adaptive bots only), 0 Recruit ... 3 Legendary */
  const LEVELS = ["trainee", "recruit", "normal", "heroic", "legendary"];
  CTF.LEVELS = LEVELS;
  const SKILL_AT = new Map();
  /** AI_SKILL at a level −1 (Trainee) to 3 (Legendary), every number interpolated (in steps of 0.05) */
  CTF.skillAt = function (level) {
    const L = Math.round(Math.max(-1, Math.min(3, +level || 0)) * 20) / 20;
    let s = SKILL_AT.get(L);
    if (s) return s;
    const i = Math.min(3, Math.floor(L) + 1),
      u = L + 1 - i,
      a = K.AI_SKILL[LEVELS[i]],
      b = K.AI_SKILL[LEVELS[i + 1]];
    s = {};
    for (const k of Object.keys(a))
      s[k] = typeof a[k] === "number" ? a[k] + ((b[k] != null ? b[k] : a[k]) - a[k]) * u : a[k];
    SKILL_AT.set(L, s);
    return s;
  };
})();
/* switches for the AI's newer habits (tools/tune.js turns them off to measure them):
   holdRange  a hunter in a fight keeps its range instead of charging in
   rhythm     the magnum's perfect-kill rhythm at Legendary (AI_SKILL rhythm)
   preAim     watching known sight lines while moving (needs the map memory)
   memory     using the map memory at all (hunting where fights happen, quiet spots for the skull) */
window.CTF.AI = { holdRange: true, rhythm: true, preAim: true, memory: true };
