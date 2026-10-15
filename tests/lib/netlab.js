/* The network lab: separate game instances (each its own browser process) party up in a room, play
   real matches with automated players (tests/stubs/lab-bot.js) and are measured. Used by
   tools/net-lab.js (the full lab, by hand) and tests/netlab.test.js (a CI-sized run).

   Transports
     relay   the PeerJS stand-in (tests/stubs/lab-peer.js) over a local WebSocket relay run here, which
             applies each link's simulated network: delay, jitter, loss (bursty if asked), reordering,
             latency spikes and a bandwidth cap. Reliable channels never lose a message: a loss costs a
             retransmit delay and holds up what follows, like a real reliable data channel.
     webrtc  real WebRTC data channels between the browsers, signalled by a local PeerJS server (the
             `peer` package) on 127.0.0.1. Network profiles then apply on each sender (KAHOST.net.setSim),
             the same for all its links.
   Nothing leaves this machine: pages may only load files and 127.0.0.1, and WebRTC runs with no
   STUN or TURN servers. */
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { open, text } = require("./browser.js");

/* ---- network profiles (per direction of a link) ---- */
const PROFILES = {
  good: { lat: 15, jit: 3, loss: 0 },
  /* home Wi-Fi: some jitter, a little loss, a hiccup now and then */
  wifi: { lat: 30, jit: 15, loss: 0.01, spike: { every: 4000, dur: 120, add: 60 }, bw: 4000 },
  bad: { lat: 75, jit: 25, loss: 0.03, bw: 1500 },
  /* bursts of loss (a Gilbert-Elliott channel) and latency spikes */
  spikes: {
    lat: 30,
    jit: 10,
    loss: 0.005,
    burst: { enter: 0.01, exit: 0.25, loss: 0.6 },
    spike: { every: 3000, dur: 250, add: 200 },
  },
};
/** the profile of the link from instance a to instance b, for a named run profile with n instances */
function linkProfile(name, a, b, n) {
  if (name === "asym") return a === n - 1 || b === n - 1 ? PROFILES.bad : PROFILES.good;
  return PROFILES[name] || PROFILES.good;
}

/* ---- the relay ---- */
class Relay {
  constructor(profile, n) {
    this.profile = profile;
    this.n = n;
    this.inst = new Map(); /* ws -> instance */
    this.socks = []; /* instance -> ws */
    this.owner = new Map(); /* peer id -> instance */
    this.links = new Map(); /* "a>b" -> state */
    this.t0 = Date.now();
  }
  async start() {
    const { WebSocketServer } = require("ws");
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise(r => this.wss.on("listening", r));
    this.wss.on("connection", (ws, req) => {
      const i = +new URL(req.url, "http://x").searchParams.get("inst");
      this.inst.set(ws, i);
      this.socks[i] = ws;
      ws.on("message", (data, isBin) => this.onMsg(i, Buffer.from(data)));
      ws.on("close", () => this.onClose(i, ws));
    });
    return this.wss.address().port;
  }
  stop() {
    for (const ws of this.inst.keys()) ws.terminate();
    this.wss.close();
  }
  link(a, b) {
    const k = a + ">" + b;
    let l = this.links.get(k);
    if (!l) {
      l = {
        p: linkProfile(this.profile, a, b, this.n),
        bad: false,
        free: 0,
        last: new Map(),
        bytes: 0,
        msgs: 0,
        lost: 0,
      };
      this.links.set(k, l);
    }
    return l;
  }
  header(buf) {
    const n = buf.readUInt32BE(0);
    return JSON.parse(buf.toString("utf8", 4, 4 + n));
  }
  send(to, buf) {
    const ws = this.socks[to];
    if (ws && ws.readyState === 1) ws.send(buf);
  }
  onClose(i, ws) {
    if (this.socks[i] === ws) this.socks[i] = null;
    /* the instance is gone: so are its peers (as when a browser closes) */
    for (const [id, o] of this.owner)
      if (o === i) {
        this.owner.delete(id);
        const h = Buffer.from(JSON.stringify({ type: "gone", id }));
        const f = Buffer.alloc(4 + h.length);
        f.writeUInt32BE(h.length, 0);
        h.copy(f, 4);
        for (let j = 0; j < this.socks.length; j++) if (j !== i) this.send(j, f);
      }
  }
  onMsg(from, buf) {
    let m;
    try {
      m = this.header(buf);
    } catch (e) {
      return;
    }
    if (m.type === "who") this.owner.set(m.id, from);
    const dst = m.to != null && this.owner.has(m.to) ? [this.owner.get(m.to)] : null;
    const targets = dst || [...this.socks.keys()].filter(j => j !== from);
    for (const to of targets) {
      if (to === from) continue;
      if (m.type !== "data") {
        /* signalling: the link's base latency, never lost */
        const d = this.link(from, to).p.lat;
        setTimeout(() => this.send(to, buf), d);
        continue;
      }
      this.deliver(from, to, m, buf);
    }
  }
  deliver(from, to, m, buf) {
    const l = this.link(from, to),
      p = l.p,
      now = Date.now();
    l.bytes += buf.length;
    l.msgs++;
    let d = p.lat + Math.random() * (p.jit || 0);
    if (p.spike && (now - this.t0) % p.spike.every < p.spike.dur) d += p.spike.add;
    /* loss: independent, or bursty (good and bad states) */
    let lost = Math.random() < (p.loss || 0);
    if (p.burst) {
      if (l.bad) {
        if (Math.random() < p.burst.exit) l.bad = false;
      } else if (Math.random() < p.burst.enter) l.bad = true;
      if (l.bad && Math.random() < p.burst.loss) lost = true;
    }
    /* bandwidth: the link sends one message after another */
    if (p.bw) {
      const ms = (buf.length * 8) / p.bw; /* kbit/s → ms */
      l.free = Math.max(l.free, now) + ms;
      const q = l.free - now;
      if (!m.rel && q > 250) {
        l.lost++;
        return; /* the queue is full: an unreliable packet is dropped */
      }
      d += q;
    }
    if (m.rel) {
      /* reliable and ordered: a loss costs a retransmit, and nothing overtakes */
      if (lost) d += Math.max(200, p.lat * 3);
      const at = Math.max(now + d, l.last.get(m.cid) || 0);
      l.last.set(m.cid, at);
      setTimeout(() => this.send(to, buf), at - now);
    } else {
      if (lost) {
        l.lost++;
        return;
      }
      setTimeout(() => this.send(to, buf), d);
    }
  }
  stats() {
    const o = {};
    for (const [k, l] of this.links) o[k] = { bytes: l.bytes, msgs: l.msgs, lost: l.lost };
    return o;
  }
}

/* ---- instances ---- */
async function poll(p, fn, arg, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => false);
    if (v || Date.now() > end) return v;
    await new Promise(r => setTimeout(r, 200));
  }
}
async function launchInstance(i, o) {
  const args = ["--mute-audio", "--enable-precise-memory-info"];
  if (o.transport === "webrtc") args.push("--disable-features=WebRtcHideLocalIpsWithMdns");
  if (o.render)
    args.push(
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist"
    );
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  /* nothing leaves this machine */
  await ctx.route(/^(https?|wss?):\/\//, r => {
    const h = new URL(r.request().url()).hostname;
    if (h === "127.0.0.1" || h === "localhost") return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(cfg => (window.__LAB = cfg), {
    url: o.url + "?inst=" + i,
    inst: i,
    bot: o.bot !== false,
  });
  const init = ["lab-bot.js"];
  if (o.transport === "webrtc")
    await ctx.addInitScript({
      path: path.join(__dirname, "..", "..", "node_modules", "peerjs", "dist", "peerjs.min.js"),
    });
  else init.unshift("lab-peer.js");
  const page = await open(ctx, {
    tag: "I" + i,
    init,
    realThree: !!o.render,
    hash: o.transport === "webrtc" ? "#peerhost=127.0.0.1:" + o.peerPort : "",
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  return { i, browser, ctx, page, cdp, errors: page.errors };
}
/** the room: instance 0 hosts, the rest join */
async function formRoom(I) {
  const [H, ...rest] = I;
  for (const x of I) {
    await poll(x.page, () => !!window.KA && !!document.getElementById("p2pHost"), null, 30000);
    await x.page.fill("#callsign", "Lab" + x.i);
  }
  for (const x of I)
    await x.page.evaluate(() => {
      Object.assign(KA.SET, {
        shadows: "off",
        bloom: 0,
        renderScale: 0.5,
        dynRes: false,
        reflections: "off",
      });
      KA.applySettings();
    });
  const t0 = Date.now();
  await H.page.click("#p2pHost");
  await poll(
    H.page,
    () => /^[A-Z0-9]{5}$/.test(document.getElementById("p2pCodeShow").textContent),
    null,
    30000
  );
  const code = await text(H.page, "#p2pCodeShow");
  await Promise.all(
    rest.map(async x => {
      await x.page.fill("#p2pCode", code);
      await x.page.click("#p2pJoin");
    })
  );
  const ok = await poll(H.page, n => window.__p2p.state.peers >= n, rest.length, 60000);
  for (const x of rest) await poll(x.page, () => window.__p2p.state.connected, null, 30000);
  const ids = await Promise.all(I.map(x => x.page.evaluate(() => window.KAHOST.net.stats().me)));
  I.forEach((x, k) => (x.peer = ids[k]));
  return { ok: !!ok, joinMs: Date.now() - t0 };
}
const inMatch = (p, hostPeer) =>
  poll(
    p,
    hp => {
      const g = window.CTF && CTF.UI.game();
      if (!g || g.over || !KA.EXT) return false;
      if (!hp) return !g.map && !!CTF.NET.room;
      return !!g.map && g.hostPeer === hp;
    },
    hostPeer,
    60000
  );
/** start a mode with everyone in it; returns ms from the host's Play to the last player in */
async function startMode(I, mode) {
  const t0 = Date.now();
  if (mode === "arena") {
    for (const x of I) {
      await x.page.evaluate(() => (document.getElementById("bots").checked = false));
      await x.page.click("#deploy");
    }
    for (const x of I)
      await poll(
        x.page,
        n => KA.playing && [...KA.remotes.values()].filter(r => r.has).length >= n,
        I.length - 1,
        60000
      );
    return Date.now() - t0;
  }
  const [H, ...rest] = I;
  await H.page.click("#mode-" + mode);
  if (mode !== "ctf") await H.page.selectOption("#mapPick", "arena").catch(() => {});
  await H.page.click("#play");
  await inMatch(H.page, null);
  let k = 0;
  for (const x of rest) {
    /* as a player would: once the menu offers to join (clicking while it still says Host starts a
       second match) */
    await poll(x.page, () => /^Join/.test(document.getElementById("play").textContent), null, 30000);
    if (mode !== "ffa") await x.page.click(k++ % 2 ? "#ctfRed" : "#ctfBlue").catch(() => {});
    await x.page.click("#play");
  }
  for (const x of rest) await inMatch(x.page, H.peer);
  return Date.now() - t0;
}
/** reset the counters at the start of the measured window */
async function mark(I) {
  for (const x of I) {
    if (x.dead) continue;
    x.base = await x.page.evaluate(() => {
      window.__lab.collect();
      window.KAHOST.net.traffic(true, true);
      window.KAHOST.prof.read(true);
      const g = window.CTF && CTF.UI.game();
      return {
        hc: KA.HITCHK ? JSON.parse(JSON.stringify(KA.HITCHK.me)) : null,
        ht: KA.HITCHK ? Object.assign({}, KA.HITCHK.total) : null,
        hs: window.CTF && CTF.NET.hitStats ? Object.assign({}, CTF.NET.hitStats) : null,
        claims: g && g.map ? g.hsS || 0 : 0,
      };
    });
    x.cpu0 = await metrics(x);
  }
}
async function metrics(x) {
  const m = await x.cdp.send("Performance.getMetrics").catch(() => ({ metrics: [] }));
  const o = {};
  for (const e of m.metrics) o[e.name] = e.value;
  return o;
}
async function collect(I) {
  const out = [];
  for (const x of I) {
    if (x.dead) continue;
    const d = await x.page.evaluate(() => {
      const g = window.CTF && CTF.UI.game();
      return {
        rec: window.__lab.collect(),
        traffic: window.KAHOST.net.traffic(false),
        prof: window.KAHOST.prof.read(false),
        stats: window.KAHOST.net.stats(),
        msgs: KA.MSG.list().map(m => [m.id, m.name]),
        hc: KA.HITCHK ? JSON.parse(JSON.stringify(KA.HITCHK.me)) : null,
        ht: KA.HITCHK ? Object.assign({}, KA.HITCHK.total) : null,
        hrows: KA.HITCHK ? KA.HITCHK.rows() : [],
        hs: window.CTF && CTF.NET.hitStats ? Object.assign({}, CTF.NET.hitStats) : null,
        claims: g && g.map ? g.hsS || 0 : 0,
        role: g ? (g.map ? "client" : "host") : window.__p2p.state.hub ? "hub" : "peer",
      };
    });
    const cpu1 = await metrics(x);
    d.cpu = {
      script: (cpu1.ScriptDuration || 0) - (x.cpu0.ScriptDuration || 0),
      task: (cpu1.TaskDuration || 0) - (x.cpu0.TaskDuration || 0),
      heapMB: (cpu1.JSHeapUsedSize || 0) / 1048576,
    };
    d.i = x.i;
    d.base = x.base;
    d.errors = x.errors.slice(0, 5);
    out.push(d);
  }
  return out;
}
/** close the host and time how long until the match (or the room) carries on with a new host:
    one instance hosting and every other one following it */
async function migrate(I, mode) {
  const [H, ...rest] = I;
  /* the room host as the others know it (the room code's peer id, until the new host claims it) */
  const old = await rest[0].page.evaluate(() => window.__p2p.state.hubId);
  const t0 = Date.now();
  /* closing a browser can take seconds on some machines: time from the moment it starts */
  const closing = H.browser.close().catch(() => {});
  H.dead = true;
  let last = null;
  while (Date.now() - t0 < 30000) {
    const st = await Promise.all(
      rest.map(x =>
        x.page
          .evaluate(() => {
            const g = window.CTF && CTF.UI.game();
            const s = window.__p2p.state;
            return {
              me: window.KAHOST.net.stats().me,
              hubId: s.hubId,
              conn: s.connected,
              hosting: !!g && !g.map && !g.over && !!KA.EXT,
              hp: g && g.map ? g.hostPeer : null,
              fresh: !!g && !!g.map && performance.now() - g.lastHost < 400,
            };
          })
          .catch(() => null)
      )
    );
    last = st;
    if (st.every(Boolean)) {
      if (mode === "arena") {
        if (st.every(x => x.conn && x.hubId && x.hubId !== old && x.hubId === st[0].hubId)) {
          const ms = Date.now() - t0;
          return closing.then(() => ({ ms, hosts: 1 }));
        }
      } else {
        const h = st.filter(x => x.hosting);
        if (h.length === 1 && st.every(x => x.hosting || (x.hp === h[0].me && x.fresh))) {
          const ms = Date.now() - t0;
          return closing.then(() => ({ ms, hosts: 1 }));
        }
      }
    }
    await new Promise(r => setTimeout(r, 50));
  }
  await closing;
  return { ms: -1, hosts: last ? last.filter(x => x && (x.hosting || x.hubId === x.me)).length : 0, last };
}

/* ---- analysis ---- */
const pct = (a, p) =>
  a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const r3 = v => (v == null ? null : Math.round(v * 1000) / 1000);
/** truth series by pilot id (from whichever instance is the authority) */
function truthOf(D) {
  const T = new Map();
  for (const d of D)
    for (const [t, id, x, z, alive] of d.rec.truth) {
      let s = T.get(id);
      if (!s) T.set(id, (s = { owner: d.i, pts: [] }));
      if (s.owner === d.i) s.pts.push([t, x, z, alive]);
    }
  for (const s of T.values()) s.pts.sort((a, b) => a[0] - b[0]);
  return T;
}
function at(pts, t) {
  let lo = 0,
    hi = pts.length - 1;
  if (!pts.length || t <= pts[0][0] || t >= pts[hi][0]) return null;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (pts[m][0] <= t) lo = m;
    else hi = m;
  }
  const a = pts[lo],
    b = pts[hi];
  /* skip respawns, deaths and gaps: no smooth truth to compare with */
  if (!a[3] || !b[3] || b[0] - a[0] > 250 || Math.hypot(b[1] - a[1], b[2] - a[2]) > 4) return null;
  const k = (t - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
/** how one instance draws one pilot: delay that fits best, error at it, pops */
function pair(truth, seen) {
  let best = null;
  for (let off = 0; off <= 900; off += 10) {
    const err = [];
    for (const [t, x, z] of seen) {
      const p = at(truth, t - off);
      if (p) err.push(Math.hypot(p[0] - x, p[1] - z));
    }
    if (err.length < 30) continue;
    const med = pct(err, 0.5);
    if (!best || med < best.med) best = { off, med, p95: pct(err, 0.95), n: err.length };
  }
  if (!best) return null;
  let pops = 0;
  for (let i = 1; i < seen.length; i++) {
    if (seen[i][0] - seen[i - 1][0] > 100) continue;
    const a0 = at(truth, seen[i - 1][0] - best.off),
      a1 = at(truth, seen[i][0] - best.off);
    if (!a0 || !a1) continue;
    const ds = [seen[i][1] - seen[i - 1][1], seen[i][2] - seen[i - 1][2]],
      dt = [a1[0] - a0[0], a1[1] - a0[1]];
    if (Math.hypot(ds[0] - dt[0], ds[1] - dt[1]) > 0.5) pops++;
  }
  return { delay: best.off, med: best.med, p95: best.p95, n: best.n, pops };
}
function analyze(D, secs, mode) {
  const T = truthOf(D);
  const rep = { instances: [], pos: {}, hits: {}, kills: {}, desync: {}, bw: {} };
  /* positions: every observer, every pilot it draws */
  const all = [];
  for (const d of D) {
    const by = new Map();
    for (const [t, id, x, z] of d.rec.drawn) {
      let s = by.get(id);
      if (!s) by.set(id, (s = []));
      s.push([t, x, z]);
    }
    for (const [id, seen] of by) {
      const tr = T.get(id);
      if (!tr || tr.owner === d.i) continue;
      const r = pair(tr.pts, seen);
      if (r)
        all.push(
          Object.assign(
            { obs: d.i, owner: tr.owner, id, mins: (seen[seen.length - 1][0] - seen[0][0]) / 60000 },
            r
          )
        );
    }
  }
  const mins = all.reduce((a, r) => a + r.mins, 0);
  rep.pos = {
    pairs: all.length,
    delayMs: pct(
      all.map(r => r.delay),
      0.5
    ),
    medianErrM: r3(
      pct(
        all.map(r => r.med),
        0.5
      )
    ),
    p95ErrM: r3(
      pct(
        all.map(r => r.p95),
        0.95
      )
    ),
    popsPerMin: r1(mins ? all.reduce((a, r) => a + r.pops, 0) / mins : null),
    worst: all
      .slice()
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 3)
      .map(r => ({ obs: r.obs, owner: r.owner, id: r.id, delay: r.delay, p95: r3(r.p95), pops: r.pops })),
  };
  /* playback */
  const pb = D.flatMap(d => d.rec.pb);
  rep.playback = {
    delayMs: r1(mean(pb.map(x => x[2]))),
    gapMs: r1(mean(pb.map(x => x[3]))),
    jitterMs: r1(mean(pb.map(x => x[4]))),
  };
  /* bandwidth by kind, per instance (bytes per second) */
  const names = new Map((D[0] && D[0].msgs) || []);
  const kindName = k => (/^f\d+$/.test(k) ? (names.get(+k.slice(1)) || k) + " (fast)" : k);
  for (const d of D) {
    const s = d.traffic.secs || secs;
    const row = { role: d.role, upKBps: 0, downKBps: 0, up: {}, down: {} };
    for (const [dir, key, tot] of [
      ["tx", "up", "upKBps"],
      ["rx", "down", "downKBps"],
    ])
      for (const [k, [b, n]] of Object.entries(d.traffic[dir])) {
        const kb = b / 1024 / s;
        if (!k.startsWith("pf:")) row[tot] += kb;
        row[key][kindName(k)] = { KBps: r3(kb), perSec: r1(n / s) };
      }
    row.upKBps = r3(row.upKBps);
    row.downKBps = r3(row.downKBps);
    rep.bw[d.i] = row;
  }
  /* net code time and garbage */
  for (const d of D) {
    const frames = d.rec.frames || 1;
    /* parts nest: "total" is the outermost time only */
    const ms = d.prof.total ? d.prof.total[0] : 0;
    const parts = {};
    for (const [k, [t]] of Object.entries(d.prof)) if (k !== "total") parts[k] = r3(t / frames);
    rep.instances.push({
      i: d.i,
      role: d.role,
      fps: r1(d.rec.frames / Math.max(1, d.rec.ft)),
      netMsPerFrame: r3(ms / frames),
      parts,
      scriptMsPerSec: r1((d.cpu.script * 1000) / secs),
      gcPerMin: r1((d.rec.heap.gcs / secs) * 60),
      heapChurnMBps: r3(d.rec.heap.freed / 1048576 / secs),
      errors: d.errors,
    });
  }
  /* hit registration */
  {
    const dd = (d, k, f) => (d[k] && d.base && d.base[k] ? d[k][f] - d.base[k][f] : 0);
    if (mode === "arena") {
      const sent = D.reduce((a, d) => a + dd(d, "hc", "sent"), 0),
        taken = D.reduce((a, d) => a + dd(d, "hc", "taken"), 0),
        rejected = D.reduce((a, d) => a + dd(d, "hc", "rejected"), 0);
      rep.hits = {
        claimed: sent,
        applied: taken,
        rejected,
        falseRejectRate: r3(rejected / Math.max(1, taken + rejected)),
      };
    } else {
      const host = D.find(d => d.role === "host");
      const claims = D.reduce(
        (a, d) => a + (d.role === "client" ? d.claims - (d.base ? d.base.claims : 0) : 0),
        0
      );
      const ok = host ? dd(host, "hs", "ok") : 0,
        bad = host ? dd(host, "hs", "bad") : 0;
      const why = {};
      if (host)
        for (const r of host.hrows) for (const [k, n] of Object.entries(r.why)) why[k] = (why[k] || 0) + n;
      rep.hits = {
        claimed: claims,
        applied: ok,
        rejected: bad,
        falseRejectRate: r3(bad / Math.max(1, ok + bad)),
        why,
      };
    }
  }
  /* kill to display: from the first instance that showed a kill to each of the others */
  {
    const seen = new Map();
    for (const d of D)
      for (const [t, k, v] of d.rec.kills) {
        const key = k + ">" + v;
        let l = seen.get(key);
        if (!l) seen.set(key, (l = []));
        l.push([t, d.i]);
      }
    const lat = [];
    let missed = 0;
    for (const l of seen.values()) {
      l.sort((a, b) => a[0] - b[0]);
      /* group by occurrence: the same pair can kill twice */
      const used = new Set();
      for (let i = 0; i < l.length; i++) {
        if (used.has(i)) continue;
        const first = l[i];
        const insts = new Set([first[1]]);
        used.add(i);
        for (let j = i + 1; j < l.length; j++)
          if (!used.has(j) && !insts.has(l[j][1]) && l[j][0] - first[0] < 4000) {
            insts.add(l[j][1]);
            used.add(j);
            lat.push(l[j][0] - first[0]);
          }
        missed += Math.max(0, D.length - insts.size);
      }
    }
    rep.kills = { n: seen.size, medianMs: pct(lat, 0.5), p95Ms: pct(lat, 0.95), notShown: missed };
  }
  /* desyncs: a client's score, flags or skull differing from every host state of the last 1.5 s */
  {
    const host = D.find(d => d.role === "host");
    if (host && host.rec.state.length) {
      const hs = host.rec.state;
      let n = 0,
        bad = 0,
        run = 0,
        longest = 0;
      for (const d of D) {
        if (d.role !== "client") continue;
        let last = null;
        for (const s of d.rec.state) {
          n++;
          const win = hs.filter(h => h[0] <= s[0] && h[0] >= s[0] - 1500);
          const ok = !win.length || win.some(h => h[1] === s[1] && h[2] === s[2] && h[3] === s[3]);
          if (!ok) {
            bad++;
            run = last ? run + (s[0] - last) : 250;
            longest = Math.max(longest, run);
          } else run = 0;
          last = s[0];
        }
      }
      rep.desync = { samples: n, outOfSync: bad, rate: r3(bad / Math.max(1, n)), longestMs: longest };
    }
  }
  return rep;
}

/* ---- a run: instances, room, modes ---- */
/**
 * @param {{ n?: number, modes?: string[], profile?: string, transport?: "relay" | "webrtc", secs?: number,
 *   render?: boolean, migrate?: boolean, log?: (s: string) => void }} o
 */
async function runLab(o) {
  const n = o.n || 4,
    secs = o.secs || 45,
    log = o.log || (() => {});
  const profile = o.profile || "good";
  const transport = o.transport || "relay";
  const relay = new Relay(profile, n);
  const report = { n, profile, transport, secs, startedAt: new Date().toISOString(), modes: {} };
  let peerServer = null;
  const port = await relay.start();
  const opts = { url: "ws://127.0.0.1:" + port + "/", transport, render: o.render };
  if (transport === "webrtc") {
    const { PeerServer } = require("peer");
    opts.peerPort = 19000 + Math.floor(Math.random() * 900);
    peerServer = PeerServer({ host: "127.0.0.1", port: opts.peerPort, path: "/" });
  }
  for (const mode of o.modes || ["arena", "ctf", "slayer", "ffa", "oddball"]) {
    const I = [];
    try {
      log(`${mode}: launching ${n} instances (${transport}, ${profile})`);
      for (let i = 0; i < n; i++) I.push(await launchInstance(i, opts));
      if (transport === "webrtc") {
        const p = PROFILES[profile] || PROFILES.good;
        for (const x of I)
          await x.page.evaluate(s => window.KAHOST.net.setSim(s), {
            latency: p.lat,
            jitter: p.jit,
            loss: p.loss + (p.burst ? 0.02 : 0),
          });
      }
      const room = await formRoom(I);
      log(`${mode}: room formed in ${room.joinMs} ms`);
      const startMs = await startMode(I, mode);
      log(`${mode}: everyone in the match after ${startMs} ms; playing ${secs} s`);
      await new Promise(r => setTimeout(r, 3000));
      await mark(I);
      await new Promise(r => setTimeout(r, secs * 1000));
      const D = await collect(I);
      const rep = analyze(D, secs, mode);
      rep.joinMs = room.joinMs;
      rep.startMs = startMs;
      rep.relay = transport === "relay" ? relay.stats() : null;
      if (o.migrate && mode !== "ffa-skip") {
        rep.migration = await migrate(I, mode);
        log(`${mode}: host migration ${rep.migration.ms} ms (${rep.migration.hosts} host)`);
      }
      report.modes[mode] = rep;
      log(
        `${mode}: ${JSON.stringify({ pos: rep.pos, hits: rep.hits, kills: rep.kills, desync: rep.desync })}`
      );
    } catch (e) {
      report.modes[mode] = {
        error: String((e && e.stack) || e)
          .split("\n")
          .slice(0, 3)
          .join(" | "),
      };
      log(`${mode}: ERROR ${report.modes[mode].error}`);
    } finally {
      for (const x of I) await x.browser.close().catch(() => {});
    }
  }
  relay.stop();
  if (peerServer && peerServer.close) peerServer.close();
  return report;
}

/* ---- the report ---- */
function markdown(R) {
  const L = [];
  L.push(`# Network lab: ${R.n} instances, ${R.profile} links, ${R.transport}`);
  L.push("");
  L.push(`${R.startedAt} · ${R.secs} s measured per mode`);
  L.push("");
  L.push(
    "| mode | delay ms | error p50/p95 m | pops/min | hits applied/claimed | false rejects | kill→display p50/p95 ms | desync | migration ms | up KB/s (host/client) |"
  );
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const [m, r] of Object.entries(R.modes)) {
    if (r.error) {
      L.push(`| ${m} | error: ${r.error.slice(0, 80)} |||||||||`);
      continue;
    }
    const bws = Object.values(r.bw);
    const hostBw = bws.find(b => b.role === "host" || b.role === "hub");
    const cl = bws.filter(b => b !== hostBw);
    L.push(
      `| ${m} | ${r.pos.delayMs} | ${r.pos.medianErrM} / ${r.pos.p95ErrM} | ${r.pos.popsPerMin} | ${r.hits.applied}/${r.hits.claimed} | ${r.hits.rejected} (${r.hits.falseRejectRate}) | ${r.kills.medianMs} / ${r.kills.p95Ms} | ${r.desync.rate != null ? r.desync.rate + " (" + r.desync.longestMs + " ms)" : "–"} | ${r.migration ? r.migration.ms : "–"} | ${hostBw ? hostBw.upKBps : "–"} / ${cl.length ? r3(mean(cl.map(b => b.upKBps))) : "–"} |`
    );
  }
  for (const [m, r] of Object.entries(R.modes)) {
    if (r.error) continue;
    L.push("", `## ${m}`, "");
    L.push(
      `Playback: delay ${r.playback.delayMs} ms, packet gap ${r.playback.gapMs} ms, jitter ${r.playback.jitterMs} ms.`
    );
    if (r.hits.why && Object.keys(r.hits.why).length)
      L.push(`Hit check reasons: ${JSON.stringify(r.hits.why)}.`);
    L.push(
      "",
      "| instance | role | fps | net ms/frame | script ms/s | GC/min | heap churn MB/s | up KB/s | down KB/s |",
      "|---|---|---|---|---|---|---|---|---|"
    );
    for (const x of r.instances) {
      const b = r.bw[x.i] || {};
      L.push(
        `| ${x.i} | ${x.role} | ${x.fps} | ${x.netMsPerFrame} | ${x.scriptMsPerSec} | ${x.gcPerMin} | ${x.heapChurnMBps} | ${b.upKBps} | ${b.downKBps} |`
      );
    }
    const host =
      Object.values(r.bw).find(b => b.role === "host" || b.role === "hub") || Object.values(r.bw)[0];
    if (host) {
      L.push("", "Host upload by kind (KB/s, messages/s):", "");
      for (const [k, v] of Object.entries(host.up)
        .sort((a, b) => b[1].KBps - a[1].KBps)
        .slice(0, 14))
        L.push(`- ${k}: ${v.KBps} KB/s, ${v.perSec}/s`);
    }
  }
  return L.join("\n") + "\n";
}
function writeReport(R, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `net-lab-${R.profile}-${R.transport}-${R.n}`);
  fs.writeFileSync(base + ".json", JSON.stringify(R, null, 1));
  fs.writeFileSync(base + ".md", markdown(R));
  return base;
}
module.exports = {
  runLab,
  analyze,
  writeReport,
  markdown,
  PROFILES,
  Relay,
  launchInstance,
  formRoom,
  startMode,
  migrate,
};
