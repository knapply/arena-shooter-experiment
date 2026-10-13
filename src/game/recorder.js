/* ============ RECORDER: a rolling record of every pilot, for kill cams, highlights and replays ============
   30 times a second the recorder keeps where every pilot was and the full pose state their rig was
   drawn with (the same object rig.update consumes), for the last 45 seconds. Together with the event
   log (game/events.js), whose events carry the same ids and times, that is enough to replay any
   moment: re-pose the rigs from the frames, put the camera at anyone's eye.
   Alongside the poses, an effects track keeps what was drawn: every tracer (tracer() in
   render/fx.js, so every shooter: you, drones, CTF agents, online players), explosion and ground
   pound shockwave, and 30 times a second where each grenade, rocket and drop pod in flight was. It is
   a preallocated ring (no allocation per record), so recording costs nothing in the hot path.
   Simulation-side determinism (core/rng.js) makes whole matches reproducible from seed + inputs. */
const REC = (() => {
  const HZ = 30,
    KEEP = 45;
  /** @type {{ t: number, poses: Map<string, { x: number, y: number, z: number, st: any }> }[]} */
  let frames = [];
  /** id -> { color, name }: how to draw a pilot in a replay */
  const meta = new Map();
  let cur = null,
    lastT = -1;
  const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  /* ---- the effects track: records of [t, kind, ax, ay, az, bx, by, bz] plus a colour or type word ---- */
  const FX_N = 16384,
    FX_K = 8;
  const fxBuf = new Float64Array(FX_N * FX_K),
    fxCol = new Uint32Array(FX_N);
  let fxStart = 0,
    fxCount = 0,
    muted = 0;
  function fxPush(kind, ax, ay, az, bx, by, bz, col) {
    const i = (fxStart + fxCount) % FX_N;
    if (fxCount < FX_N) fxCount++;
    else fxStart = (fxStart + 1) % FX_N;
    const o = i * FX_K;
    fxBuf[o] = now;
    fxBuf[o + 1] = kind;
    fxBuf[o + 2] = ax;
    fxBuf[o + 3] = ay;
    fxBuf[o + 4] = az;
    fxBuf[o + 5] = bx;
    fxBuf[o + 6] = by;
    fxBuf[o + 7] = bz;
    fxCol[i] = col >>> 0;
  }
  /** the first logical record index with time > t (records are in time order) */
  function fxAfter(t) {
    let lo = 0,
      hi = fxCount;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (fxBuf[((fxStart + m) % FX_N) * FX_K] > t) hi = m;
      else lo = m + 1;
    }
    return lo;
  }
  /* projectiles in flight: grenade and rocket meshes (render/fx.js tells us when one is taken from
     the pool) and drop pods; each gets a number of its own for as long as it flies */
  const PROJ_TYPE = { nf: 1, nu: 2, np: 3, rk: 4 };
  /** @type {Map<any, number>} mesh -> type */
  const projLive = new Map();
  /** @type {WeakMap<any, number>} */
  const projId = new WeakMap();
  let projSeq = 0;
  function sampleProjectiles() {
    for (const [m, type] of projLive) {
      if (!m.parent) {
        projLive.delete(m);
        continue;
      }
      const p = m.position;
      fxPush(4, p.x, p.y, p.z, projId.get(m) || 0, type, 0, 0);
    }
    for (const p of PODS) {
      if (p.landed) continue;
      let id = projId.get(p);
      if (!id) projId.set(p, (id = ++projSeq));
      const g = p.g.position;
      fxPush(4, g.x, g.y, g.z, id, 5, 0, 0);
    }
  }
  /** binary search: the last frame index with t <= time (-1 if none) */
  function frameAt(list, time) {
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (list[m].t > time) hi = m;
      else lo = m + 1;
    }
    return lo - 1;
  }
  return {
    HZ,
    KEEP,
    /* effects track kinds */
    TRACER: 1,
    BLAST: 2,
    SHOCK: 3,
    PROJ: 4,
    /** true during a frame that is being recorded */
    get sampling() {
      return !!cur;
    },
    /** true while a replay draws recorded effects (they must not be recorded again) */
    get muted() {
      return muted > 0;
    },
    mute(on) {
      muted = Math.max(0, muted + (on ? 1 : -1));
    },
    /** called once per rendered frame with the game clock */
    tick(t) {
      cur = null;
      if (t < lastT) {
        /* clock reset */
        lastT = -1;
        fxStart = fxCount = 0;
      }
      if (lastT >= 0 && t - lastT < 1 / HZ - 1e-4) return;
      lastT = t;
      cur = { t, poses: new Map() };
      frames.push(cur);
      let drop = 0;
      while (drop < frames.length && t - frames[drop].t > KEEP) drop++;
      if (drop) frames.splice(0, drop);
      sampleProjectiles();
    },
    put(id, pos, st) {
      if (cur) cur.poses.set(id, { x: pos.x, y: pos.y, z: pos.z, st });
    },
    /** a drawn effect: TRACER (a to b, colour), BLAST (at a, radius b.x, colour), SHOCK (at a) */
    fx(kind, a, b, col = 0) {
      if (muted) return;
      fxPush(kind, a.x, a.y, a.z, b ? b.x : 0, b ? b.y : 0, b ? b.z : 0, col);
    },
    /** a grenade or rocket mesh was taken from the pool (render/fx.js fxGet) */
    proj(mesh, key) {
      const type = PROJ_TYPE[key];
      if (!type || muted) return;
      projLive.set(mesh, type);
      projId.set(mesh, ++projSeq);
    },
    /** the effects recorded with t0 < t <= t1, oldest first, as plain records (replays, saved clips) */
    fxRange(t0, t1, out = []) {
      for (let i = fxAfter(t0); i < fxCount; i++) {
        const j = (fxStart + i) % FX_N,
          o = j * FX_K;
        if (fxBuf[o] > t1) break;
        out.push({
          t: fxBuf[o],
          k: fxBuf[o + 1],
          a: { x: fxBuf[o + 2], y: fxBuf[o + 3], z: fxBuf[o + 4] },
          b: { x: fxBuf[o + 5], y: fxBuf[o + 6], z: fxBuf[o + 7] },
          c: fxCol[j],
        });
      }
      return out;
    },
    /** grenade and rocket meshes flying right now (a replay hides them) */
    liveProjectiles: () => projLive.keys(),
    clear() {
      frames = [];
      meta.clear();
      cur = null;
      lastT = -1;
      fxStart = fxCount = 0;
    },
    frames: () => frames,
    setMeta(id, m) {
      meta.set(id, m);
    },
    metaOf: id => meta.get(id) || null,
    hasMeta: id => meta.has(id),
    /** a copy of the frames between t0 and t1, kept after the rolling window moves on (highlights) */
    clip(t0, t1) {
      return frames.filter(f => f.t >= t0 && f.t <= t1).map(f => ({ t: f.t, poses: new Map(f.poses) }));
    },
    /** frames with t0 <= t <= t1 */
    range(t0, t1) {
      return frames.filter(f => f.t >= t0 && f.t <= t1);
    },
    frameAt,
    /** one pilot's interpolated pose at time t: {x, y, z, yaw, pitch, st}, or null if not recorded */
    sample(id, t) {
      return REC.sampleIn(frames, id, t);
    },
    /** the same, over any list of frames (a saved clip) */
    sampleIn(list, id, t) {
      let lo = -1;
      for (let i = frameAt(list, t); i >= 0; i--)
        if (list[i].poses.has(id)) {
          lo = i;
          break;
        }
      if (lo < 0) return null;
      const a = list[lo].poses.get(id);
      let hi = -1;
      for (let i = lo + 1; i < list.length; i++)
        if (list[i].poses.has(id)) {
          hi = i;
          break;
        }
      /* not recorded since (gone, or a gap of over half a second): hold the last pose */
      if (hi < 0 || list[hi].t - list[lo].t > 0.5)
        return { x: a.x, y: a.y, z: a.z, yaw: a.st.yaw, pitch: a.st.pitch, st: a.st };
      const b = list[hi].poses.get(id),
        k = Math.max(0, Math.min(1, (t - list[lo].t) / (list[hi].t - list[lo].t || 1)));
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        z: a.z + (b.z - a.z) * k,
        yaw: lerpAng(a.st.yaw, b.st.yaw, k),
        pitch: a.st.pitch + (b.st.pitch - a.st.pitch) * k,
        st: k < 0.5 ? a.st : b.st,
      };
    },
    /** ids seen between t0 and t1 */
    ids(t0 = -Infinity, t1 = Infinity) {
      const s = new Set();
      for (const f of frames) if (f.t >= t0 && f.t <= t1) for (const id of f.poses.keys()) s.add(id);
      return [...s];
    },
  };
})();
/* a new match starts a new recording */
EVENTS.on("matchStart", () => REC.clear());
