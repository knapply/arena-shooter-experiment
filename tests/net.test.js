/* Network smoothness under simulated conditions. One player moves along a known path; the other records
   where it sees them on screen. Reports how far behind and how far off the remote player is drawn, plus
   jumps, and checks the measured ping. Numbers are printed so netcode changes can be compared.
     node tests/net.test.js            run ideal and bad-network conditions
     NET_JSON=out.json node tests/...  also write the metrics to a file */
const fs = require("fs");
const { check, finish } = require("./lib/check.js");
const { launch, open, text } = require("./lib/browser.js");
const CONDITIONS = [
  { name: "ideal", sim: { latency: 0, jitter: 0, loss: 0 }, maxDelay: 160, maxP95: 0.4, maxJumps: 12 },
  {
    name: "bad (75 ms each way, ±25 jitter, 3% loss)",
    sim: { latency: 75, jitter: 25, loss: 0.03 },
    maxDelay: 320,
    maxP95: 0.6,
    maxJumps: 12,
  },
];
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
function analyze(truth, seen) {
  const at = t => {
    let lo = 0,
      hi = truth.length - 1;
    if (t <= truth[0][0] || t >= truth[hi][0]) return null;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (truth[m][0] <= t) lo = m;
      else hi = m;
    }
    const [t0, x0, z0] = truth[lo],
      [t1, x1, z1] = truth[hi],
      k = (t - t0) / (t1 - t0 || 1);
    return [x0 + (x1 - x0) * k, z0 + (z1 - z0) * k];
  };
  let best = null;
  for (let off = 0; off <= 900; off += 10) {
    const err = [];
    for (const [t, x, z] of seen) {
      const p = at(t - off);
      if (p) err.push(Math.hypot(p[0] - x, p[1] - z));
    }
    if (err.length < 20) continue;
    const med = pct(err, 0.5);
    if (!best || med < best.med) best = { off, med, p95: pct(err, 0.95), n: err.length };
  }
  /* a pop is a frame-to-frame move that differs from how far the real player moved over the same
     (delayed) interval by more than 0.5 m: the sender's own frame hitches don't count against us */
  let jumps = 0;
  for (let i = 1; i < seen.length; i++) {
    const a0 = at(seen[i - 1][0] - best.off),
      a1 = at(seen[i][0] - best.off);
    if (!a0 || !a1) continue;
    const ds = [seen[i][1] - seen[i - 1][1], seen[i][2] - seen[i - 1][2]],
      dt_ = [a1[0] - a0[0], a1[1] - a0[1]];
    if (Math.hypot(ds[0] - dt_[0], ds[1] - dt_[1]) > 0.5) jumps++;
  }
  const secs = (seen[seen.length - 1][0] - seen[0][0]) / 1000;
  return {
    delayMs: best.off,
    medianErrM: +best.med.toFixed(3),
    p95ErrM: +best.p95.toFixed(3),
    jumpsPerMin: +((jumps / secs) * 60).toFixed(1),
    samples: best.n,
  };
}
(async () => {
  const b = await launch();
  const results = {};
  try {
    for (const C of CONDITIONS) {
      const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
      const A = await open(ctx, { tag: "A", init: ["fake-peer.js"] }),
        B = await open(ctx, { tag: "B", init: ["fake-peer.js"] });
      await A.waitForTimeout(600);
      for (const p of [A, B])
        await p.evaluate(s => {
          window.KAHOST.net.setSim(s);
          Object.assign(KA.SET, {
            shadows: "off",
            bloom: 0,
            renderScale: 0.5,
            dynRes: false,
            reflections: "off",
          });
          KA.applySettings();
        }, C.sim);
      await A.click("#p2pHost");
      await A.waitForTimeout(800);
      const code = await text(A, "#p2pCodeShow");
      await B.fill("#p2pCode", code);
      await B.click("#p2pJoin");
      await B.waitForTimeout(2500);
      for (const p of [A, B]) {
        await p.evaluate(() => {
          document.getElementById("bots").checked = false;
        });
        await p.click("#deploy");
      }
      await A.waitForTimeout(1500);
      /* A follows a known path: a figure-eight at up to ~12 m/s */
      await A.evaluate(() => {
        const t0 = Date.now();
        window.__truth = [];
        (function f() {
          const t = (Date.now() - t0) / 1000,
            x = -10 + 9 * Math.sin(t * 1.3),
            z = 20 + 5 * Math.sin(t * 2.6);
          KA.me.pos.set(x, 0, z);
          KA.me.vel.set(9 * 1.3 * Math.cos(t * 1.3), 0, 5 * 2.6 * Math.cos(t * 2.6));
          KA.me.spawnT = 1e9;
          window.__truth.push([Date.now(), x, z]);
          if (t < 11) requestAnimationFrame(f);
        })();
      });
      await B.evaluate(() => {
        window.__seen = [];
        const t0 = Date.now();
        (function f() {
          for (const r of KA.remotes.values())
            if (r.has && r.rig) {
              window.__seen.push([Date.now(), r.rig.root.position.x, r.rig.root.position.z]);
              break;
            }
          if (Date.now() - t0 < 10000) requestAnimationFrame(f);
        })();
      });
      await B.waitForTimeout(10500);
      const truth = await A.evaluate(() => window.__truth),
        seen = (await B.evaluate(() => window.__seen)).filter(s => s[0] > truth[0][0] + 1500);
      const st = await B.evaluate(() => window.KAHOST.net.stats());
      const ping = st.links[0] ? st.links[0].rtt : -1;
      const m = seen.length > 30 ? analyze(truth, seen) : null;
      results[C.name] = Object.assign({ pingMs: ping, lossSeen: st.links[0] ? st.links[0].loss : null }, m);
      console.log(`  ${C.name}: ${JSON.stringify(results[C.name])}`);
      check(!!m, `${C.name}: remote player is visible and moving`, seen.length + " samples");
      if (m) {
        check(
          m.delayMs <= C.maxDelay,
          `${C.name}: drawn within ${C.maxDelay} ms of the truth`,
          m.delayMs + " ms"
        );
        check(m.p95ErrM <= C.maxP95, `${C.name}: 95% of frames within ${C.maxP95} m`, m.p95ErrM + " m");
        check(m.jumpsPerMin <= C.maxJumps, `${C.name}: no visible pops (≤ ${C.maxJumps}/min)`, m.jumpsPerMin);
      }
      const expect = 2 * C.sim.latency + C.sim.jitter;
      check(
        ping >= 0 && Math.abs(ping - expect) < 40 + expect * 0.3,
        `${C.name}: measured ping matches conditions`,
        `${ping} ms vs ~${expect}`
      );
      check(
        A.errors.length + B.errors.length === 0,
        `${C.name}: no page errors`,
        [...A.errors, ...B.errors].slice(0, 3)
      );
      await ctx.close();
    }
    /* capture the flag over a bad network: how smoothly does a client see the host's AI? */
    {
      const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
      const A = await open(ctx, { tag: "A", init: ["fake-peer.js"] }),
        B = await open(ctx, { tag: "B", init: ["fake-peer.js"] });
      await A.waitForTimeout(600);
      for (const p of [A, B])
        await p.evaluate(() => {
          window.KAHOST.net.setSim({ latency: 75, jitter: 25, loss: 0.03 });
          Object.assign(KA.SET, {
            shadows: "off",
            bloom: 0,
            renderScale: 0.5,
            dynRes: false,
            reflections: "off",
          });
          KA.applySettings();
        });
      await A.click("#p2pHost");
      await A.waitForTimeout(800);
      await B.fill("#p2pCode", await text(A, "#p2pCodeShow"));
      await B.click("#p2pJoin");
      await B.waitForTimeout(2500);
      await A.click("#ctfPlay");
      await A.waitForTimeout(2500);
      await B.click("#ctfBlue");
      await B.click("#ctfPlay");
      await B.waitForTimeout(4000);
      /* the host drives one enemy AI along a known path (in the open, in front of where the client
         will stand); the client records where it draws it */
      const id = await A.evaluate(() => {
        const a = CTF.UI.game().agents.find(x => !x.human && x.team === 0);
        const t0 = Date.now();
        window.__truth = [];
        window.__script = true;
        (function f() {
          const t = (Date.now() - t0) / 1000,
            x = -19.5 + 3 * Math.sin(t * 2),
            z = 8 + 1.5 * Math.sin(t * 4);
          a.dead = false;
          a.body.shield = 70;
          a.body.health = 45;
          a.body.pos.set(x, KA.groundBelow(-19.5, 8, 20), z);
          a.body.vel.set(6 * Math.cos(t * 2), 0, 6 * Math.cos(t * 4));
          if (t < 11) window.__truth.push([Date.now(), x, z]);
          if (window.__script) requestAnimationFrame(f);
        })();
        return a.id;
      });
      await B.evaluate(id => {
        const t0 = Date.now();
        window.__seen = [];
        (function f() {
          const a = CTF.UI.game().map.get(id);
          if (a) window.__seen.push([Date.now(), a.body.pos.x, a.body.pos.z]);
          if (Date.now() - t0 < 10000) requestAnimationFrame(f);
        })();
      }, id);
      await B.waitForTimeout(10500);
      const truth = await A.evaluate(() => window.__truth),
        seen = (await B.evaluate(() => window.__seen)).filter(s => s[0] > truth[0][0] + 1500);
      const m = seen.length > 30 ? analyze(truth, seen) : null;
      results.ctf = m;
      console.log(`  ctf bad network: ${JSON.stringify(m)}`);
      check(
        !!m && m.p95ErrM <= 0.8,
        "CTF: a client sees the host's AI within 0.8 m 95% of the time (bad network)",
        m
      );
      check(!!m && m.jumpsPerMin <= 12, "CTF: no visible pops on the client", m && m.jumpsPerMin);
      /* hit registration: the client shoots a moving target where it sees it; the host re-checks
         every claim against where the target was at that moment */
      for (let i = 0; i < 30; i++) {
        await B.evaluate(id => {
          const me = KA.me;
          me.pos.set(-22, KA.groundBelow(-22, 0, 20), 0);
          me.vel.set(0, 0, 0);
          me.shield = 70;
          me.spawnT = KA.now;
          const a = CTF.UI.game().map.get(id);
          if (!a) return;
          const o = me.pos.clone();
          o.y += 1.6;
          const d = a.body.pos.clone();
          d.y += 1.0;
          d.sub(o).normalize();
          KA.refill();
          KA.fire({ o, d, muzzle: o });
        }, id);
        await B.waitForTimeout(160);
      }
      await B.waitForTimeout(1500);
      const hs = await A.evaluate(() => Object.assign({}, CTF.NET.hitStats));
      const rate = hs.ok / Math.max(1, hs.ok + hs.bad);
      results.hitreg = Object.assign({ rate: +rate.toFixed(2) }, hs);
      console.log(`  ctf hit registration: ${JSON.stringify(results.hitreg)}`);
      check(
        hs.ok >= 20 && rate >= 0.9,
        "hit registration: 90%+ of on-screen hits count under a bad network",
        hs
      );
      /* a forged claim (the shot went straight up) is rejected */
      await B.evaluate(id => {
        const S = KA.SHOT;
        S.o.copy(KA.me.pos);
        S.o.y += 1.6;
        S.d.set(0, 1, 0);
        S.t = KA.now;
        CTF.UI.game().queueHit(id, 30, "rifle", false);
      }, id);
      await B.waitForTimeout(1500);
      const hs2 = await A.evaluate(() => Object.assign({}, CTF.NET.hitStats));
      check(hs2.bad === hs.bad + 1 && hs2.ok === hs.ok, "a claimed hit whose shot missed is rejected", hs2);
      await A.evaluate(() => (window.__script = false));
      check(
        A.errors.length + B.errors.length === 0,
        "CTF: no page errors",
        [...A.errors, ...B.errors].slice(0, 3)
      );
      await ctx.close();
    }
    /* mesh, fast channel and host migration with three players */
    {
      const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
      const pg = [];
      for (const tag of ["A", "B", "C"]) pg.push(await open(ctx, { tag, init: ["fake-peer.js"] }));
      const [A, B, C] = pg;
      await A.waitForTimeout(600);
      await A.click("#p2pHost");
      await A.waitForTimeout(800);
      const code = await text(A, "#p2pCodeShow");
      for (const p of [B, C]) {
        await p.fill("#p2pCode", code);
        await p.click("#p2pJoin");
      }
      await A.waitForTimeout(3500);
      const sB = await B.evaluate(() => window.__p2p.state),
        sC = await C.evaluate(() => window.__p2p.state);
      const ids = await Promise.all(pg.map(p => p.evaluate(() => window.KAHOST.net.stats().me)));
      check(
        sB.fast.includes(ids[2]) && sC.fast.includes(ids[1]) && sB.fast.includes(ids[0]),
        "players open direct links to each other (full mesh)",
        { B: sB.fast.length, C: sC.fast.length }
      );
      check(
        !!sB.backup && sB.backup === sC.backup && sB.backup !== ids[0],
        "the host names a backup",
        sB.backup
      );
      await C.evaluate(() => {
        window.__got = [];
        window.KA.room.onFast((from, buf) => window.__got.push([from, new Uint8Array(buf)[0]]));
      });
      await B.evaluate(() => window.KA.room.fast(new Uint8Array([7, 1, 2, 3]).buffer));
      await C.waitForTimeout(300);
      const got = await C.evaluate(() => window.__got);
      check(
        got.some(g => g[0] === ids[1] && g[1] === 7),
        "fast packets arrive directly",
        got
      );
      for (const p of pg) {
        await p.evaluate(() => {
          document.getElementById("bots").checked = false;
        });
        await p.click("#deploy");
      }
      await A.waitForTimeout(1500);
      await A.close();
      await B.waitForTimeout(5000);
      const after = await Promise.all(
        [B, C].map(p =>
          p.evaluate(() => ({
            st: window.__p2p.state,
            live: [...window.KA.remotes.values()].filter(r => r.has).length,
            msg: document.getElementById("p2pMsg").textContent,
          }))
        )
      );
      const hubs = after.filter(x => x.st.hub).length;
      check(
        hubs === 1 && after.every(x => x.st.connected && x.live === 1),
        "when the host leaves, the backup takes over and the others stay in the room",
        after.map(x => ({ hub: x.st.hub, connected: x.st.connected, live: x.live, msg: x.msg.slice(0, 60) }))
      );
      await ctx.close();
    }
    /* the CTF match survives its host leaving: a player in it takes over */
    {
      const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
      const pg = [];
      for (const tag of ["A", "B", "C"]) pg.push(await open(ctx, { tag, init: ["fake-peer.js"] }));
      const [A, B, C] = pg;
      await A.waitForTimeout(600);
      await A.click("#p2pHost");
      await A.waitForTimeout(800);
      const code = await text(A, "#p2pCodeShow");
      for (const p of [B, C]) {
        await p.fill("#p2pCode", code);
        await p.click("#p2pJoin");
      }
      await A.waitForTimeout(2500);
      await A.click("#ctfPlay");
      await A.waitForTimeout(2500);
      await B.click("#ctfBlue");
      await B.click("#ctfPlay");
      await C.click("#ctfPlay");
      await C.waitForTimeout(3500);
      await A.evaluate(() => (CTF.UI.game().teams[0].score = 2));
      await A.waitForTimeout(800);
      await A.close();
      await B.waitForTimeout(9000);
      const after = await Promise.all(
        [B, C].map(p =>
          p.evaluate(() => {
            const g = CTF.UI.game();
            return {
              inMatch: !!g && !g.over,
              hosting: !!g && !g.map,
              agents: g ? g.agents.length : 0,
              score: g ? g.teams[0].score : -1,
            };
          })
        )
      );
      check(
        after.every(x => x.inMatch && x.agents === 8 && x.score === 2) &&
          after.filter(x => x.hosting).length === 1,
        "when the CTF host leaves, a player takes over the match and the score carries on",
        after
      );
      check(
        B.errors.length + C.errors.length === 0,
        "CTF migration: no page errors",
        [...B.errors, ...C.errors].slice(0, 3)
      );
      await ctx.close();
    }
    /* handing the room to another player */
    {
      const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
      const A = await open(ctx, { tag: "A", init: ["fake-peer.js"] }),
        B = await open(ctx, { tag: "B", init: ["fake-peer.js"] });
      await A.waitForTimeout(600);
      await A.click("#p2pHost");
      await A.waitForTimeout(800);
      await B.fill("#p2pCode", await text(A, "#p2pCodeShow"));
      await B.click("#p2pJoin");
      await A.waitForTimeout(2500);
      const bId = await B.evaluate(() => window.KAHOST.net.stats().me);
      await A.evaluate(id => window.KAHOST.net.handover(id), bId);
      await A.waitForTimeout(3500);
      const sa = await A.evaluate(() => window.__p2p.state),
        sb = await B.evaluate(() => window.__p2p.state);
      check(
        sb.hub && !sa.hub && sa.connected && sa.hubId === bId,
        "the host can hand the room to another player",
        { a: sa, b: { hub: sb.hub, peers: sb.peers } }
      );
      await ctx.close();
    }
    /* protocol handshake: a friend on another build is told why they cannot join */
    {
      const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
      const A = await open(ctx, { tag: "A", init: ["fake-peer.js"] }),
        B = await open(ctx, { tag: "B", init: ["fake-peer.js"] });
      await A.waitForTimeout(600);
      await B.evaluate(() => (window.KAHOST.protocol = 999));
      await A.click("#p2pHost");
      await A.waitForTimeout(800);
      await B.fill("#p2pCode", await text(A, "#p2pCodeShow"));
      await B.click("#p2pJoin");
      await B.waitForTimeout(1500);
      const m = (await text(B, "#p2pMsg")) || "";
      check(/different versions/.test(m), "a different game version gets a clear message", m);
      await ctx.close();
    }
  } catch (e) {
    check(false, "test script error", e.message.split("\n")[0]);
  }
  if (process.env.NET_JSON) fs.writeFileSync(process.env.NET_JSON, JSON.stringify(results, null, 2));
  await b.close();
  finish("net");
})();
