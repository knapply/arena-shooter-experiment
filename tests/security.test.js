/* Security checks: what a hostile page link or a hostile player can and cannot do.
     node tests/security.test.js        (THREE_PATH=... also checks the real three.js loads with its hashes)
   - the page refuses a three.js that is not the pinned build (Subresource Integrity)
   - a link cannot point the game's signalling at another machine (?peerhost)
   - damage claims with a made-up weapon or no evidence are refused; NaN cannot poison the budget
   - a player's malformed update cannot stop the host; they cannot drop weapons they never had, hand
     out kills, or keep a flag through a teleport; presence cannot grow without bound
   - the console's match-changing commands are offline only */
const path = require("path");
const fs = require("fs");
const { check, finish } = require("./lib/check.js");
const { launch, open, text } = require("./lib/browser.js");
const GAME = "file://" + path.join(__dirname, "..", "index.html");
async function poll(p, fn, arg, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => false);
    if (v || Date.now() > end) return v;
    await p.waitForTimeout(150);
  }
}
async function room(b, n) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
  const P = [];
  for (let i = 0; i < n; i++) P.push(await open(ctx, { tag: "ABC"[i], init: ["fake-peer.js"] }));
  await P[0].waitForTimeout(600);
  await P[0].click("#p2pHost");
  await poll(
    P[0],
    () => /^[A-Z0-9]{5}$/.test(document.getElementById("p2pCodeShow").textContent),
    null,
    15000
  );
  const code = await text(P[0], "#p2pCodeShow");
  for (const p of P.slice(1)) {
    await p.fill("#p2pCode", code);
    await p.click("#p2pJoin");
  }
  for (const p of P.slice(1)) await poll(p, () => window.__p2p.state.connected, null, 15000);
  const ids = await Promise.all(P.map(p => p.evaluate(() => window.KAHOST.net.stats().me)));
  return { ctx, P, ids };
}
(async () => {
  const b = await launch();
  try {
    /* 1. Subresource Integrity: a three.js that is not the pinned build is refused */
    {
      const ctx = await b.newContext();
      const p = await ctx.newPage();
      const errs = [];
      p.on("console", m => m.type() === "error" && errs.push(m.text()));
      const stub = fs.readFileSync(path.join(__dirname, "stubs", "three-browser.js"), "utf8");
      await p.route("**/three.module.min.js", r =>
        r.fulfill({ contentType: "application/javascript", body: stub })
      );
      await p.route("**/three.core.min.js", r =>
        r.fulfill({ contentType: "application/javascript", body: "" })
      );
      await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
      await p.goto(GAME);
      await p.waitForTimeout(1500);
      const got = await p.evaluate(() => !!window.THREE);
      check(
        !got && errs.some(e => /integrity/i.test(e)),
        "a three.js that is not the pinned build is refused (integrity)",
        { THREE: got, errs: errs.slice(0, 2) }
      );
      await ctx.close();
      if (process.env.THREE_PATH) {
        const ctx2 = await b.newContext();
        const q = await open(ctx2, { tag: "R", realThree: true });
        const ok = await poll(q, () => !!window.THREE && !!window.KA, null, 20000);
        check(
          ok && q.errors.length === 0,
          "the pinned three.js loads with its integrity hashes",
          q.errors.slice(0, 2)
        );
        await ctx2.close();
      }
    }
    /* 2. a link cannot send signalling elsewhere; the lab's local server still works */
    {
      const ctx = await b.newContext();
      const p1 = await open(ctx, { tag: "L", init: ["fake-peer.js"], hash: "#peerhost=evil.example:9000" });
      const p2 = await open(ctx, { tag: "M", init: ["fake-peer.js"], hash: "#peerhost=127.0.0.1:9000" });
      const [s1, s2] = await Promise.all([p1, p2].map(p => p.evaluate(() => window.__p2p.signal)));
      check(!s1 && !!s2 && s2.host === "127.0.0.1", "?peerhost only on this machine", { s1, s2 });
      await ctx.close();
    }
    /* 3. arena: damage claims */
    {
      const { ctx, P, ids } = await room(b, 2);
      const [A, B] = P;
      for (const p of P) {
        await p.evaluate(() => (document.getElementById("bots").checked = false));
        await p.click("#deploy");
      }
      await poll(A, () => [...KA.remotes.values()].some(r => r.has && r.rig), null, 15000);
      const budget = await A.evaluate(() => [
        KA.allowDamage("x", NaN, "rifle"),
        KA.allowDamage("y", 20, "toString"),
      ]);
      check(
        budget[0] === 0 && Number.isFinite(budget[1]) && budget[1] <= 16,
        "the damage budget refuses NaN and unknown weapons get the default cap",
        budget
      );
      const r0 = await A.evaluate(() => ({ ...KA.HITCHK.me }));
      /* B claims a rocket hit (never launched one) and a hit with a made-up weapon */
      await B.evaluate(a => {
        const r = KA.remotes.get(a);
        const t = { kind: "peer", ref: r, peer: a, pos: r.rig.root.position, h: KA.H_STAND };
        KA.dealDamage(t, 99, "rocket", false);
        KA.dealDamage(t, 99, "toString", false);
      }, ids[0]);
      const r1 = await poll(
        A,
        n => (KA.HITCHK.me.rejected >= n + 2 ? { ...KA.HITCHK.me } : null),
        r0.rejected,
        8000
      );
      check(!!r1 && r1.taken === r0.taken, "claims with no launched rocket or a made-up weapon are refused", {
        r0,
        r1,
      });
      await ctx.close();
    }
    /* 4. capture the flag: the host against a hostile client */
    {
      const { ctx, P, ids } = await room(b, 2);
      const [A, B] = P;
      await A.click("#mode-ctf");
      await A.click("#play");
      await poll(B, () => /^Join/.test(document.getElementById("play").textContent), null, 30000);
      await B.click("#play");
      await poll(A, bp => CTF.UI.game().net.remote.has(bp), ids[1], 20000);
      const t0 = await B.evaluate(() => CTF.UI.game().t);
      /* a malformed drop list (a null entry), and a power weapon they never picked up */
      await B.evaluate(() => {
        const p = KA.me.pos;
        CTF.NET.send({ dr: [900, p.x, p.y, p.z, [null]] });
      });
      await B.waitForTimeout(500);
      await B.evaluate(() => {
        const p = KA.me.pos;
        CTF.NET.send({ dr: [901, p.x, p.y, p.z, [[2, 4, 99]]] });
      });
      const going = await poll(B, t => CTF.UI.game().t > t + 2, t0, 15000);
      check(
        going && A.errors.length === 0,
        "a malformed update does not stop the host",
        A.errors.slice(0, 2)
      );
      const items = await A.evaluate(bp => {
        const a = CTF.UI.game().net.remote.get(bp);
        return CTF.UI.game().items.filter(i => i.avail && i.type === 2 && i.pos.distanceTo(a.pos) < 6).length;
      }, ids[1]);
      check(items === 0, "a player cannot drop a weapon they never had", items);
      /* a reported death naming an AI that never hurt them: no kill for it */
      const ai = await A.evaluate(() => {
        const g = CTF.UI.game();
        const a = g.agents.find(x => !x.human && x.team !== g.net.remote.values().next().value.team);
        return { id: a.id, k: a.k };
      });
      await B.evaluate(id => {
        CTF.NET.send({ dth: [77, id, "rifle", 0] });
      }, ai.id);
      await A.waitForTimeout(1500);
      const k1 = await A.evaluate(id => CTF.UI.game().byId(id).k, ai.id);
      check(k1 === ai.k, "a player cannot hand out kills by reporting deaths", { before: ai.k, after: k1 });
      /* a teleport: the host notices */
      await B.evaluate(() => {
        KA.me.pos.x += 60;
      });
      const warped = await poll(A, bp => CTF.UI.game().net.remote.get(bp).warpT > 0, ids[1], 5000);
      check(!!warped, "the host notices a teleport (no flag or pickups for 3 s)");
      /* the console's match-changing commands, typed while in a room */
      await B.evaluate(() => KA.CON.run("god on", true));
      const god = await B.evaluate(() =>
        document.querySelector("#devcon .dc-out") ? document.querySelector("#devcon .dc-out").textContent : ""
      );
      check(
        /offline only/.test(god) || god === "",
        "typed cheats are offline only in a room",
        god.slice(-80)
      );
      await ctx.close();
    }
    /* 5. presence cannot grow without bound */
    {
      const { ctx, P, ids } = await room(b, 2);
      const [A, B] = P;
      await B.evaluate(async () => {
        const R = await window.KAHOST.use("room");
        /* a small presence first (it arrives), then one with 80 keys (refused: the small one stays) */
        await R.presence({ hello: 1 });
        await new Promise(r => setTimeout(r, 400));
        const big = {};
        for (let i = 0; i < 80; i++) big["k" + i] = i;
        await R.presence(big).catch(() => {});
      });
      await A.waitForTimeout(800);
      const keys = await A.evaluate(async bp => {
        const R = await window.KAHOST.use("room");
        const e = R.peers().find(p => p.peer === bp);
        return e ? Object.keys(e.presence).length : -1;
      }, ids[1]);
      check(keys > 0 && keys <= 64, "a peer's presence is capped (keys)", keys);
      await ctx.close();
    }
  } catch (e) {
    check(false, "test script error", String(e && e.message).split("\n")[0]);
  }
  await b.close();
  finish("security");
})();
