/* ============ REMOTE PLAYBACK: smooth, timestamped remote movement ============
   Each remote player gets a small buffer of timestamped states (sender clock). We estimate the
   clock offset from arrival times (the fastest arrivals are closest to the true offset), keep an
   adaptive delay of about one send interval plus measured jitter, and draw the player at
   "now - offset - delay" between the two states around that time. (A cubic curve through the states'
   velocities measured no better: reported velocity and movement disagree around collisions.)
   The delay rises quickly when a packet turns up after we needed it, and falls slowly.
   If packets stop (loss), we extrapolate along the last velocity, easing off (never more than
   80 ms of travel past the last state), and when real data resumes any jump is not
   shown as a snap: the difference is kept as an offset that fades out over a few frames (60 ms)
   (position, yaw and pitch separately). Only a jump of over 5 m (a respawn) snaps.
   Used by the arena, CTF clients (the host's movement) and the CTF host (players' movement). */
const PB_TAU = 0.06, // s: how fast a correction fades (position)
  PB_TAU_ANG = 0.08, // s: yaw and pitch
  PB_EXTRAP = 0.08, // s: the most travel extrapolation adds past the last state (it eases toward it)
  PB_SNAP = 5; // m: a jump this big is a teleport (a respawn): drawn as one
class Playback {
  constructor() {
    /** @type {{ ts: number, p: number[], v: number[], y: number, pt: number }[]} */
    this.buf = [];
    this.offset = null;
    this.jit = 0.01;
    this.gap = 1 / 30;
    this.delay = 0.08;
    this.lastArrive = 0;
    /** packets that arrived after we needed them (we were extrapolating past them) */
    this.late = 0;
    /* the correction being faded out, and what we drew last (raw curve and the time) */
    this.err = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.prev = null;
  }
  /** add a state stamped ts (sender seconds) that arrived at local time now (seconds) */
  push(ts, s, now) {
    const b = this.buf;
    if (b.length && ts <= b[b.length - 1].ts) {
      /* late or duplicate (unordered channel): slot it in if it is still useful */
      if (ts <= b[0].ts || b.some(x => x.ts === ts)) return;
      b.push(Object.assign({ ts }, s));
      b.sort((x, y) => x.ts - y.ts);
      /* bounded like the in-order path: a stream of late stamps cannot grow it */
      if (b.length > 40) b.shift();
      /* the path we are drawing may have changed shape under us */
      this.reshaped = true;
      return;
    }
    const o = now - ts;
    if (this.offset == null || o < this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.005; /* the route got slower: drift up slowly */
    this.jit += (Math.abs(o - this.offset) - this.jit) * 0.08;
    if (b.length) this.gap += (Math.min(0.25, ts - b[b.length - 1].ts) - this.gap) * 0.1;
    /* it came after the moment we were drawing: we had run past the data. Make room at once */
    const need = now - this.offset - this.delay - ts;
    if (b.length && need > 0) {
      this.late++;
      this.delay = Math.min(0.3, this.delay + need * 0.3);
    }
    b.push(Object.assign({ ts }, s));
    if (b.length > 40) b.shift();
    const want = Math.min(0.3, Math.max(0.04, this.gap * 1.5 + this.jit * 2.5));
    /* up quickly, down slowly: a short wait is cheaper than a freeze and a catch-up */
    this.delay += (want - this.delay) * (want > this.delay ? 0.2 : 0.05);
    this.lastArrive = now;
  }
  get ready() {
    return this.buf.length > 0;
  }
  /** where to draw the player now: {x, y, z, yaw, pitch, vx, vy, vz, s} (s = the state record in effect) */
  sample(now, out) {
    const b = this.buf;
    if (!b.length) return null;
    const t = now - this.offset - this.delay;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].ts > t) i--;
    let a, c, k;
    const wasEx = this.extrap;
    this.extrap = t >= b[b.length - 1].ts;
    if (this.extrap) {
      /* ran out of data: extrapolate along the last velocity, easing off */
      a = c = b[b.length - 1];
      const run = t - a.ts,
        e = PB_EXTRAP * (1 - Math.exp(-run / PB_EXTRAP));
      out.x = a.p[0] + a.v[0] * e;
      out.y = a.p[1] + Math.max(-2, a.v[1] * e);
      out.z = a.p[2] + a.v[2] * e;
      out.yaw = a.y;
      out.pitch = a.pt;
      const fade = Math.exp(-run / PB_EXTRAP);
      out.vx = a.v[0] * fade;
      out.vy = a.v[1] * fade;
      out.vz = a.v[2] * fade;
      out.s = a;
    } else {
      if (t <= b[0].ts) {
        a = c = b[0];
        k = 0;
      } else {
        a = b[i - 1];
        c = b[i];
        k = (t - a.ts) / (c.ts - a.ts || 1);
      }
      /* drop states we will never need again */
      if (i > 2) b.splice(0, i - 2);
      out.x = a.p[0] + (c.p[0] - a.p[0]) * k;
      out.y = a.p[1] + (c.p[1] - a.p[1]) * k;
      out.z = a.p[2] + (c.p[2] - a.p[2]) * k;
      out.yaw = a.y + Math.atan2(Math.sin(c.y - a.y), Math.cos(c.y - a.y)) * k;
      out.pitch = a.pt + (c.pt - a.pt) * k;
      out.vx = a.v[0] + (c.v[0] - a.v[0]) * k;
      out.vy = a.v[1] + (c.v[1] - a.v[1]) * k;
      out.vz = a.v[2] + (c.v[2] - a.v[2]) * k;
      out.s = k < 0.5 ? a : c;
    }
    /* a jump in the curve can only come from new data: real data after extrapolating, or a late
       packet slotted in. Only then is a correction faded in (anything else is real motion) */
    this.smooth(now, out, (wasEx && !this.extrap) || this.reshaped);
    this.reshaped = false;
    return out;
  }
  /** fade corrections instead of showing them: where the curve jumps (new data after extrapolating,
      a late packet reshaping the path), keep drawing where we were and let the difference fade */
  smooth(now, out, fresh) {
    const E = this.err,
      P = this.prev;
    if (P && fresh) {
      const dt = Math.min(0.1, Math.max(0, now - P.t));
      /* where the curve would have continued, against where it is now */
      const ex = P.x + P.vx * dt - out.x,
        ey = P.y + P.vy * dt - out.y,
        ez = P.z + P.vz * dt - out.z;
      const jump = Math.hypot(ex, ey, ez);
      if (jump > PB_SNAP) E.x = E.y = E.z = E.yaw = E.pitch = 0;
      else if (jump > 0.05) {
        E.x += ex;
        E.y += ey;
        E.z += ez;
      }
      const dy = Math.atan2(Math.sin(P.yaw - out.yaw), Math.cos(P.yaw - out.yaw));
      if (jump <= PB_SNAP && Math.abs(dy) > 0.05) E.yaw += dy;
      if (jump <= PB_SNAP && Math.abs(P.pitch - out.pitch) > 0.05) E.pitch += P.pitch - out.pitch;
    }
    if (P) {
      const dt = Math.min(0.1, Math.max(0, now - P.t));
      const f = Math.exp(-dt / PB_TAU),
        fa = Math.exp(-dt / PB_TAU_ANG);
      E.x *= f;
      E.y *= f;
      E.z *= f;
      E.yaw *= fa;
      E.pitch *= fa;
    }
    this.prev = {
      t: now,
      x: out.x,
      y: out.y,
      z: out.z,
      vx: out.vx,
      vy: out.vy,
      vz: out.vz,
      yaw: out.yaw,
      pitch: out.pitch,
    };
    out.x += E.x;
    out.y += E.y;
    out.z += E.z;
    out.yaw += E.yaw;
    out.pitch += E.pitch;
  }
  /** seconds this player is drawn behind their own clock (for lag compensation and the net panel) */
  get behind() {
    return this.delay;
  }
}
