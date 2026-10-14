/* Arena hit fairness under simulated network conditions (used by tests/net.test.js).
   Three players: A hosts and watches, B shoots, C strafes along a known path in the open. B sends
   hit claims the way a client does (the shot's ray, when it fired, when on C's clock it was seeing C)
   in four kinds:
     honest  aimed at C where B draws them
     edge    aimed at the edge of C's hit box where B draws them (0.35 m to the side)
     stale   aimed at where B drew C 0.6 s earlier (a laggy or rewinding client)
     miss    aimed 1.6 m beside C (a forged claim)
     rate    honest aim, but 12 pistol claims in 0.6 s (faster than it fires)
   C counts what it accepted (damage taken) and rejected; A counts what its host checks rejected. */
const { open, text } = require("./browser.js");
const PHASES = [
  { kind: "honest", n: 12, gap: 300 },
  { kind: "edge", n: 8, gap: 300 },
  { kind: "stale", n: 8, gap: 300 },
  { kind: "miss", n: 8, gap: 300 },
  { kind: "rate", n: 12, gap: 50 },
];
async function poll(p, fn, arg, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await p.evaluate(fn, arg);
    if (v || Date.now() > end) return v;
    await p.waitForTimeout(150);
  }
}
async function fairness(b, conditions) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 225 } });
  const pg = [];
  for (const tag of ["A", "B", "C"]) pg.push(await open(ctx, { tag, init: ["fake-peer.js"] }));
  const [A, B, C] = pg;
  const out = { errors: [] };
  try {
    await A.waitForTimeout(600);
    for (const p of pg)
      await p.evaluate(() => {
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
    const code = await text(A, "#p2pCodeShow");
    for (const p of [B, C]) {
      await p.fill("#p2pCode", code);
      await p.click("#p2pJoin");
    }
    await poll(A, () => window.KAHOST.net.stats().links.length >= 2, null, 15000);
    for (const p of pg) {
      await p.evaluate(() => (document.getElementById("bots").checked = false));
      await p.click("#deploy");
    }
    const ids = await Promise.all(pg.map(p => p.evaluate(() => window.KAHOST.net.stats().me)));
    const bPeer = ids[1],
      cPeer = ids[2];
    /* everyone sees everyone (with a rig) before we start */
    for (const p of pg)
      await poll(p, () => [...KA.remotes.values()].filter(r => r.has && r.rig).length >= 2, null, 15000);
    await A.evaluate(() => {
      KA.me.pos.set(26, 0, -26);
      KA.me.vel.set(0, 0, 0);
    });
    /* C strafes a figure-eight in the open (up to ~10 m/s) and never dies */
    await C.evaluate(bPeer => {
      window.__dmg = 0;
      KA.EVENTS.on("damage", e => {
        if (e.victim === "local" && e.by === "peer:" + bPeer) window.__dmg++;
      });
      const t0 = performance.now();
      (function f() {
        const t = (performance.now() - t0) / 1000,
          x = -8 + 5 * Math.sin(t * 1.3),
          z = 24 + 3 * Math.sin(t * 2.6);
        const me = KA.me;
        me.pos.set(x, 0, z);
        me.vel.set(5 * 1.3 * Math.cos(t * 1.3), 0, 3 * 2.6 * Math.cos(t * 2.6));
        me.spawnT = -1e9;
        me.shield = 70;
        me.health = 45;
        if (!window.__stop) requestAnimationFrame(f);
      })();
    }, bPeer);
    await B.evaluate(() => KA.refill());
    /* B stands 12 m away and tracks C where it draws them (its reported aim follows the target) */
    await B.evaluate(cPeer => {
      window.__drawn = [];
      (function f() {
        const me = KA.me,
          r = KA.remotes.get(cPeer);
        me.pos.set(-8, 0, 12);
        me.vel.set(0, 0, 0);
        me.spawnT = -1e9;
        me.shield = 70;
        me.health = 45;
        if (r && r.rig) {
          const p = r.rig.root.position;
          window.__drawn.push([performance.now(), p.x, p.y, p.z]);
          if (window.__drawn.length > 600) window.__drawn.shift();
          const dx = p.x - me.pos.x,
            dy = p.y + 1.0 - (me.pos.y + 1.6),
            dz = p.z - me.pos.z,
            L = Math.hypot(dx, dy, dz);
          me.yaw = Math.atan2(-dx, -dz);
          me.pitch = Math.asin(dy / L);
        }
        if (!window.__stop) requestAnimationFrame(f);
      })();
    }, cPeer);
    const hc = p => p.evaluate(() => (KA.HITCHK ? JSON.parse(JSON.stringify(KA.HITCHK.me)) : null));
    const ht = p => p.evaluate(() => (KA.HITCHK ? Object.assign({}, KA.HITCHK.total) : null));
    for (const cond of conditions) {
      for (const p of pg) await p.evaluate(s => window.KAHOST.net.setSim(s), cond.sim);
      /* let the playback delay and clock estimates settle to the new conditions */
      await B.waitForTimeout(3000);
      const res = {};
      for (const ph of PHASES) {
        /* a weapon swap between phases starts a fresh magazine (the ammo check follows reloads,
           deaths and swaps) */
        await B.evaluate(async () => {
          KA.setWeapon(0, true);
          await new Promise(r => setTimeout(r, 200));
          KA.setWeapon(1, true);
          await new Promise(r => setTimeout(r, 200));
        });
        const c0 = await hc(C),
          h0 = await ht(A),
          b0 = await hc(B),
          seen0 = await C.evaluate(bp => KA.remotes.get(bp).seenHit, bPeer),
          d0 = await C.evaluate(() => window.__dmg);
        await B.evaluate(
          async ({ ph, cPeer }) => {
            const V = KA.THREE.Vector3,
              me = KA.me;
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            for (let i = 0; i < ph.n; i++) {
              const r = KA.remotes.get(cPeer);
              const o = new V(me.pos.x, me.pos.y + 1.6, me.pos.z);
              let at = r.rig.root.position.clone();
              if (ph.kind === "stale") {
                const want = performance.now() - 600,
                  d = window.__drawn.find(x => x[0] >= want) || window.__drawn[0];
                at = new V(d[1], d[2], d[3]);
              }
              at.y += 1.0;
              const dir = at.sub(o).normalize();
              if (ph.kind === "miss" || ph.kind === "edge") {
                /* to the side at the target's distance: 1.6 m (well clear), or 0.35 m (the edge of
                   the 0.4 m hit box: an honest hit) */
                const side = new V(-dir.z, 0, dir.x).normalize();
                const L = r.rig.root.position.distanceTo(o);
                dir
                  .multiplyScalar(L)
                  .addScaledVector(side, ph.kind === "miss" ? 1.6 : 0.35 * (i % 2 ? 1 : -1))
                  .normalize();
              }
              const S = KA.SHOT;
              S.o.copy(o);
              S.d.copy(dir);
              S.t = KA.now;
              S.live = true;
              KA.dealDamage(
                { kind: "peer", ref: r, peer: cPeer, pos: r.rig.root.position, h: KA.H_STAND },
                5,
                "pistol",
                false
              );
              S.live = false;
              await sleep(ph.gap);
            }
          },
          { ph, cPeer }
        );
        /* wait until C has read every claim */
        await poll(
          C,
          ({ bp, want }) => KA.remotes.get(bp).seenHit >= want,
          { bp: bPeer, want: seen0 + ph.n },
          10000
        );
        await C.waitForTimeout(400);
        const c1 = await hc(C),
          h1 = await ht(A),
          b1 = await hc(B),
          d1 = await C.evaluate(() => window.__dmg);
        const read = (await C.evaluate(bp => KA.remotes.get(bp).seenHit, bPeer)) - seen0;
        const r = { claims: ph.n, read, damaged: d1 - d0 };
        if (c1) {
          r.accepted = c1.taken - c0.taken;
          r.rejected = c1.rejected - c0.rejected;
          r.hostRejected = h1.rejected - h0.rejected;
          r.hostFlagged = h1.flagged - h0.flagged;
          r.refusedSeen = b1.refused - b0.refused;
          if (ph.kind === "honest" || ph.kind === "edge") {
            const q = a => {
              const s = a.slice(-r.accepted).sort((x, y) => x - y);
              return s.length ? { median: s[s.length >> 1], max: s[s.length - 1] } : null;
            };
            r.rewindMs = q(c1.rewinds);
            r.missCm = q(c1.misses);
          }
        } else r.accepted = r.damaged;
        res[ph.kind] = r;
      }
      out[cond.name] = res;
    }
    out.hostLog = await A.evaluate(() => (KA.HITCHK ? (KA.HITCHK.replay(true), KA.HITCHK.rows()) : null));
  } finally {
    for (const p of pg) await p.evaluate(() => (window.__stop = true)).catch(() => {});
    out.errors = pg.flatMap(p => p.errors);
    await ctx.close();
  }
  return out;
}
module.exports = { fairness };
