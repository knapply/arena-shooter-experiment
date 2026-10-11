/* ============ REMOTE PLAYBACK: smooth, timestamped remote movement ============
   Each remote player gets a small buffer of timestamped states (sender clock). We estimate the
   clock offset from arrival times (the fastest arrivals are closest to the true offset), keep an
   adaptive delay of about one send interval plus measured jitter, and draw the player at
   "now - offset - delay" by interpolating between the two states around that time. If packets stop
   (loss), we extrapolate along the last velocity for a short while and then hold, and the next
   real state blends in instead of snapping. Used by the arena and by CTF clients. */
class Playback {
  constructor() {
    /** @type {{ ts: number, p: number[], v: number[], y: number, pt: number }[]} */
    this.buf = [];
    this.offset = null;
    this.jit = 0.01;
    this.gap = 1 / 30;
    this.delay = 0.08;
    this.lastArrive = 0;
  }
  /** add a state stamped ts (sender seconds) that arrived at local time now (seconds) */
  push(ts, s, now) {
    const b = this.buf;
    if (b.length && ts <= b[b.length - 1].ts) {
      /* late or duplicate (unordered channel): slot it in if it is still useful */
      if (ts <= b[0].ts || b.some(x => x.ts === ts)) return;
      b.push(Object.assign({ ts }, s));
      b.sort((x, y) => x.ts - y.ts);
      return;
    }
    const o = now - ts;
    if (this.offset == null || o < this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.005; /* the route got slower: drift up slowly */
    this.jit += (Math.abs(o - this.offset) - this.jit) * 0.08;
    if (b.length) this.gap += (Math.min(0.25, ts - b[b.length - 1].ts) - this.gap) * 0.1;
    b.push(Object.assign({ ts }, s));
    if (b.length > 40) b.shift();
    const want = Math.min(0.3, Math.max(0.04, this.gap * 1.5 + this.jit * 2.5));
    this.delay += (want - this.delay) * 0.05;
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
    if (t >= b[b.length - 1].ts) {
      /* ran out of data: extrapolate briefly, then hold */
      a = c = b[b.length - 1];
      const e = Math.min(t - a.ts, 0.08);
      out.x = a.p[0] + a.v[0] * e;
      out.y = a.p[1] + Math.max(-2, a.v[1] * e);
      out.z = a.p[2] + a.v[2] * e;
      out.yaw = a.y;
      out.pitch = a.pt;
      out.vx = a.v[0];
      out.vy = a.v[1];
      out.vz = a.v[2];
      out.s = a;
      return out;
    }
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
    return out;
  }
  /** seconds this player is drawn behind their own clock (for lag compensation and the net panel) */
  get behind() {
    return this.delay;
  }
}
