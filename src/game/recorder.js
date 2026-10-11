/* ============ RECORDER: a rolling record of every pilot, for kill cams, highlights and replays ============
   30 times a second the recorder keeps where every pilot was and the full pose state their rig was
   drawn with (the same object rig.update consumes), for the last 45 seconds. Together with the event
   log (game/events.js), whose events carry the same ids and times, that is enough to replay any
   moment: re-pose the rigs from the frames, put the camera at anyone's eye.
   Simulation-side determinism (core/rng.js) makes whole matches reproducible from seed + inputs. */
const REC = (() => {
  const HZ = 30,
    KEEP = 45;
  /** @type {{ t: number, poses: Map<string, { x: number, y: number, z: number, st: any }> }[]} */
  let frames = [];
  let cur = null,
    lastT = -1;
  const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  return {
    HZ,
    KEEP,
    /** true during a frame that is being recorded */
    get sampling() {
      return !!cur;
    },
    /** called once per rendered frame with the game clock */
    tick(t) {
      cur = null;
      if (t < lastT) lastT = -1; /* clock reset */
      if (lastT >= 0 && t - lastT < 1 / HZ - 1e-4) return;
      lastT = t;
      cur = { t, poses: new Map() };
      frames.push(cur);
      let drop = 0;
      while (drop < frames.length && t - frames[drop].t > KEEP) drop++;
      if (drop) frames.splice(0, drop);
    },
    put(id, pos, st) {
      if (cur) cur.poses.set(id, { x: pos.x, y: pos.y, z: pos.z, st });
    },
    clear() {
      frames = [];
      cur = null;
      lastT = -1;
    },
    frames: () => frames,
    /** frames with t0 <= t <= t1 */
    range(t0, t1) {
      return frames.filter(f => f.t >= t0 && f.t <= t1);
    },
    /** one pilot's interpolated pose at time t: {x, y, z, yaw, pitch, st}, or null if not recorded */
    sample(id, t) {
      let lo = -1;
      for (let i = frames.length - 1; i >= 0; i--)
        if (frames[i].t <= t && frames[i].poses.has(id)) {
          lo = i;
          break;
        }
      if (lo < 0) return null;
      const a = frames[lo].poses.get(id);
      let hi = -1;
      for (let i = lo + 1; i < frames.length; i++)
        if (frames[i].poses.has(id)) {
          hi = i;
          break;
        }
      if (hi < 0) return { x: a.x, y: a.y, z: a.z, yaw: a.st.yaw, pitch: a.st.pitch, st: a.st };
      const b = frames[hi].poses.get(id),
        k = Math.max(0, Math.min(1, (t - frames[lo].t) / (frames[hi].t - frames[lo].t || 1)));
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
