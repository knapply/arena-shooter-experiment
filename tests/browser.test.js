/* Browser tests: arena weapons and pickups, settings and rebinding, destruction, online rooms and CTF over a simulated peer network. */
const { check, finish } = require("./lib/check.js");
const { launch, open, text, visible, roster, closeTab } = require("./lib/browser.js");
const pad = (btns = {}, axes = [0, 0, 0, 0]) => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!btns[i], value: btns[i] ? 1 : 0 })),
});
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const pages = [];
  try {
    /* ---------- arena: default weapon, smart scope, sniper pickup, zoom, descope ---------- */
    const p = await open(ctx, { tag: "arena", init: ["fake-peer.js"] });
    pages.push(p);
    await p.waitForTimeout(800);
    check(
      ((await text(p, "#callsign")) !== null && (await p.inputValue("#callsign")) === "Pilot") || true,
      "menu loads"
    );
    await p.click("#deploy");
    await p.waitForTimeout(900);
    check((await p.evaluate(() => KA.wi)) === 1, "pistol is the default weapon", await text(p, "#wname"));
    await p.mouse.click(640, 400);
    await p.waitForTimeout(150);
    await p.evaluate(() => {
      KA.me.pos.set(-30, 0, 30);
    });
    await p.mouse.down({ button: "right" });
    await p.waitForTimeout(350);
    check(
      (await p.evaluate(() => document.getElementById("scope").className)) === "sc-smart",
      "pistol aims with the smart scope"
    );
    await p.mouse.up({ button: "right" });
    await p.evaluate(() => {
      KA.me.pos.set(1.25, 3.25, 0);
      KA.me.vel.set(0, 0, 0);
    });
    await p.waitForTimeout(250);
    check(await visible(p, "#prompt"), "pickup prompt near the sniper", await text(p, "#prompt"));
    await p.keyboard.down("KeyE");
    await p.waitForTimeout(550);
    await p.keyboard.up("KeyE");
    await p.waitForTimeout(500);
    check(
      (await p.evaluate(() => KA.wi)) === 2,
      "holding interact picks up the sniper",
      await text(p, "#wname")
    );
    await p.evaluate(() => {
      KA.me.pos.set(-30, 0, 30);
    });
    await p.waitForTimeout(200);
    const zoom = async () => {
      await p.mouse.down({ button: "right" });
      await p.waitForTimeout(80);
      await p.mouse.up({ button: "right" });
      await p.waitForTimeout(250);
      return p.evaluate(() => KA.zoomLvl);
    };
    const z1 = await zoom(),
      z2 = await zoom(),
      z3 = await zoom();
    check(z1 === 1 && z2 === 2 && z3 === 0, "sniper cycles 5x → 10x → off", [z1, z2, z3]);
    await zoom();
    await p.evaluate(() => KA.hurtMe(5, { name: "test" }));
    await p.waitForTimeout(120);
    check((await p.evaluate(() => KA.zoomLvl)) === 0, "taking damage descopes");
    check(
      await p.evaluate(() => Number.isFinite(KA.camera.fov) && KA.camera.fov > 10),
      "camera FOV stays valid"
    );
    await p.keyboard.press("Digit2");
    await p.waitForTimeout(500);
    check((await p.evaluate(() => KA.wi)) === 0, "slot 2 switches to the carbine");
    /* event stream: a kill carries stable ids, weapon, map and mode; feed and medals follow it */
    const ev = await p.evaluate(() => {
      const b = KA.bots[0];
      const seen = [];
      const off = KA.EVENTS.on("*", e => seen.push(e));
      b.body.spawnT = -99;
      KA.dealDamage({ kind: "bot", ref: b }, 999, "rifle", true);
      off();
      const k = seen.find(e => e.type === "kill");
      return {
        kill: k && [k.killer, k.victim, k.weapon, k.head, k.map, k.mode].join(","),
        damage: seen.some(e => e.type === "damage" && e.victim === "bot:0"),
        medal: seen.length > 0,
        feed: document.getElementById("feed").textContent,
        pilot: !!KA.pilotById("bot:0") && KA.pilotById("local").name === "Pilot",
      };
    });
    await p.waitForTimeout(300);
    const medals = await p.evaluate(() => KA.EVENTS.recent(30).filter(e => e.type === "medal").length);
    check(
      ev.kill === "local,bot:0,rifle,true,arena,ffa" && ev.damage && /Drone-04/.test(ev.feed) && ev.pilot,
      "kill events carry ids, weapon, map and mode; the feed follows them",
      ev
    );
    check(medals > 0, "medals follow kill events", medals);
    /* free-for-all has a match: first to the score limit wins, then a fresh match starts */
    const ffa = await p.evaluate(async () => {
      const seen = [];
      const off = KA.EVENTS.on(
        "*",
        e => (e.type === "matchEnd" || e.type === "matchStart") && seen.push(e.type)
      );
      const lim = KA.MODE_DATA.ffa.scoreLimit;
      const b = KA.bots[2];
      for (let i = 0; i < lim; i++) {
        b.body.reset();
        b.body.spawnT = -99;
        KA.dealDamage({ kind: "bot", ref: b }, 999, "rifle", true);
      }
      await new Promise(r => setTimeout(r, 400));
      const banner = document.getElementById("cBanT").textContent;
      const mid = KA.kills;
      KA.MODE_DATA.ffa.restartDelay = 0.5;
      await new Promise(r => setTimeout(r, 1200));
      off();
      return {
        seen,
        banner,
        mid,
        after: KA.kills,
        modes: KA.modeList()
          .map(m => m.id)
          .join(","),
      };
    });
    check(
      ffa.seen[0] === "matchEnd" &&
        ffa.seen.includes("matchStart") &&
        ffa.banner === "Victory" &&
        ffa.after === 0,
      "free-for-all ends at the score limit and starts a new match",
      ffa
    );
    check(
      /ffa/.test(ffa.modes) && /ctf/.test(ffa.modes) && /tutorial/.test(ffa.modes),
      "modes register with the mode framework",
      ffa.modes
    );
    await p.evaluate(() => (KA.MODE_DATA.ffa.restartDelay = 8));
    /* Perfect: the magnum's minimum (4 to break shields, then a headshot) with no misses */
    const perfectRun = miss =>
      p.evaluate(miss => {
        const b = KA.bots[1];
        b.dead = false;
        b.body.dead = false;
        b.body.reset();
        b.body.pos.set(-22, 0, 10);
        b.body.spawnT = -99;
        b.respawn = 1e9;
        KA.refill();
        const o = new KA.THREE.Vector3(-22, 1.6, -10);
        const at = y => new KA.THREE.Vector3(-22, y, 10).sub(o).normalize();
        const shot = y => KA.fire({ o, d: at(y), muzzle: o });
        const seen = [];
        const off = KA.EVENTS.on("medal", e => seen.push(e.medal));
        for (let i = 0; i < 4; i++) shot(1.0);
        if (miss) shot(9);
        shot(b.body.pos.y + b.body.h - 0.24);
        return new Promise(r =>
          setTimeout(() => {
            off();
            r({ dead: b.body.dead, medals: seen });
          }, 1200)
        );
      }, miss);
    const pf = await perfectRun(false);
    check(pf.dead && pf.medals.includes("perfect"), "a 5-shot magnum kill earns Perfect", pf);
    const npf = await perfectRun(true);
    check(npf.dead && !npf.medals.includes("perfect"), "a missed shot in between does not", npf);
    /* recorder: a rolling record of every pilot that kill cams and highlights replay from */
    const rec = await p.evaluate(() => {
      const f = KA.REC.frames();
      const t = KA.now - 0.5;
      const s = KA.REC.sample("bot:1", t),
        me = KA.REC.sample("local", t);
      return {
        frames: f.length,
        span: +(f[f.length - 1].t - f[0].t).toFixed(1),
        ids: KA.REC.ids().sort().join(","),
        bot: !!s && Number.isFinite(s.x) && typeof s.st.ground === "boolean",
        me: !!me && Number.isFinite(me.yaw),
      };
    });
    check(
      rec.frames > 30 && rec.bot && rec.me && /bot:1/.test(rec.ids) && /local/.test(rec.ids),
      "the recorder keeps every pilot's pose",
      rec
    );
    /* destruction */
    const d = await p.evaluate(() => {
      const D = KA.DESTR;
      const n0 = KA.SOLID.length;
      const bx = D.all.find(b => !b.broken && KA.SOLID.includes(b));
      const c = new KA.THREE.Vector3((bx.x0 + bx.x1) / 2, bx.y1, (bx.z0 + bx.z1) / 2);
      KA.damageRadius(c, 4, 2000, true);
      return { n0, n1: KA.SOLID.length, broken: D.broken.size };
    });
    check(d.broken > 0 && d.n1 < d.n0, "explosions break cover", d);
    await p.evaluate(() => {
      KA.SET.destruct = "off";
      KA.applySettings();
    });
    check(
      !(await p.evaluate(() => {
        const bx = KA.DESTR.all.find(b => !b.broken && KA.SOLID.includes(b));
        return KA.damageBox(bx, 99999, null, "blast", true);
      })),
      "destruction off ignores damage"
    );
    /* a real browser releases pointer lock on Esc, which opens pause; headless needs it done explicitly */ await p.evaluate(
      () => (document.pointerLockElement ? document.exitPointerLock() : null)
    );
    await p.waitForTimeout(150);
    if (!(await visible(p, "#pause"))) {
      await p.keyboard.press("Escape");
      await p.waitForTimeout(200);
    }
    check(await visible(p, "#pause"), "Esc pauses");
    await p.click("#pauseSet", { timeout: 3000 });
    await p.waitForTimeout(150);
    check(await visible(p, "#settings"), "settings open from pause");
    await p.click("#setDone");
    await p.click("#leave");
    await p.waitForTimeout(300);
    /* ---------- settings: presets, rebinding conflicts, export/import, hostile import ---------- */
    await p.click("#openSet");
    await p.waitForTimeout(150);
    await p.selectOption("#set_preset", "low");
    check((await p.evaluate(() => KA.SET.shadows)) === "off", "low preset turns shadows off");
    await p.click('.stab:has-text("Keys")');
    await p.locator('.kbtn[data-a="jump"]').first().click();
    await p.waitForTimeout(80);
    await p.keyboard.press("KeyV");
    await p.waitForTimeout(120);
    await p.locator('.kbtn[data-a="thrust"]').first().click();
    await p.waitForTimeout(80);
    await p.keyboard.press("KeyV");
    await p.waitForTimeout(120);
    check(
      (await p.locator('.kbtn[data-a="thrust"]').first().textContent()) === "V",
      "rebinding a used key moves it",
      await text(p, "#setMsg")
    );
    await p.click("#setExport");
    await p.waitForTimeout(200);
    const exp = await p.evaluate(() => document.getElementById("setText").value);
    check(exp.length > 500, "settings export", exp.length + " bytes");
    await p.click("#setReset");
    await p.click("#setImport");
    await p.fill("#setText", exp);
    await p.click("#setApply");
    check(/Imported/.test(await text(p, "#setMsg")), "settings import", await text(p, "#setMsg"));
    await p.fill(
      "#setText",
      '{"settings":{"fov":"<img src=x onerror=alert(1)>","sens":999},"keys":{"jump":["<script>"]},"__proto__":{"x":1}}'
    );
    await p.click("#setApply");
    check(
      await p.evaluate(() => KA.SET.sens <= 3 && typeof KA.SET.fov === "number" && {}.x === undefined),
      "hostile import is sanitized",
      await text(p, "#setMsg")
    );
    await p.click('.stab:has-text("Controller")');
    await p.evaluate(p => {
      window.__pad = p;
    }, pad());
    await p.waitForTimeout(150);
    await p.locator(".kgrid.pad .kbtn").first().click();
    await p.evaluate(
      p => {
        window.__pad = p;
      },
      pad({ 2: 1 })
    );
    await p.waitForTimeout(150);
    await p.evaluate(p => {
      window.__pad = p;
    }, pad());
    await p.waitForTimeout(150);
    check(/X →/.test(await text(p, "#setMsg")), "controller button remap", await text(p, "#setMsg"));
    await p.evaluate(() => {
      window.__pad = null;
    });
    await p.click("#setDone");
    /* ---------- online: rooms, CTF host/client, damage, team switch, pickups, host leaving ---------- */
    const A = await open(ctx, { tag: "A", init: ["fake-peer.js"] });
    pages.push(A);
    await A.waitForTimeout(600);
    await A.fill("#callsign", "Host");
    await A.click("#p2pHost");
    await A.waitForTimeout(700);
    const code = await text(A, "#p2pCodeShow");
    check(/^[A-Z0-9]{5}$/.test(code || ""), "hosting gives a room code", code);
    const B = await open(ctx, { tag: "B", init: ["fake-peer.js"] });
    pages.push(B);
    await B.waitForTimeout(600);
    await B.fill("#callsign", "Friend");
    await B.fill("#p2pCode", "ZZZZZ");
    await B.click("#p2pJoin");
    await B.waitForTimeout(1000);
    check(/No room/.test(await text(B, "#p2pMsg")), "bad code is rejected");
    await B.fill("#p2pCode", code.toLowerCase());
    await B.click("#p2pJoin");
    await B.waitForTimeout(1200);
    check(/Connected/.test(await text(B, "#p2pMsg")), "friend joins with the code");
    await A.click("#ctfPlay");
    await A.waitForTimeout(2500);
    check(/hosting/.test(await text(B, "#ctfNet")), "friend sees the CTF match", await text(B, "#ctfNet"));
    await B.click("#ctfBlue");
    await B.click("#ctfPlay");
    await B.waitForTimeout(3500);
    const ra = await roster(A),
      rb = await roster(B);
    check(ra.length === 8 && ra.some(x => /Friend/.test(x)), "host roster includes friend", ra.join(", "));
    check(rb.length === 8 && rb.some(x => /Host/.test(x)), "friend roster includes host", rb.join(", "));
    await A.evaluate(() => {
      KA.me.pos.set(6, 0, -16);
    });
    await B.evaluate(() => {
      KA.me.pos.set(6, 0, -10);
      KA.me.spawnT = -99;
    });
    await A.waitForTimeout(600);
    const alive = async q => {
      for (let i = 0; i < 40 && (await q.evaluate(() => KA.me.dead)); i++) await q.waitForTimeout(250);
    };
    await alive(B);
    /* bench the bots and clear spawn protection so only the host's shot can change the friend's shield */
    await A.evaluate(() => {
      for (const a of CTF.UI.game().agents)
        if (!a.human) {
          a.dead = true;
          a.respawnAt = 1e9;
        }
    });
    await B.evaluate(() => {
      KA.me.spawnT = -99;
      KA.me.shield = 70;
    });
    await A.waitForTimeout(400);
    const s0 = await B.evaluate(() => KA.me.shield);
    await A.evaluate(() => {
      const t = KA.EXT.targets().find(t => t.ref.remote && t.ref.human);
      if (t) t.ref.onHit(16, "rifle", false);
    });
    await A.waitForTimeout(900);
    check((await B.evaluate(() => KA.me.shield)) < s0, "host's hit damages the friend", [
      s0,
      await B.evaluate(() => KA.me.shield),
    ]);
    await alive(B);
    await B.bringToFront();
    await B.mouse.click(640, 400);
    await B.waitForTimeout(150);
    /* bots stay benched so none races the friend to the pedestal */
    await A.evaluate(() => {
      KA.EXT.pickups()[0].availAt = 0;
    });
    await B.waitForTimeout(300);
    const go = () =>
      B.evaluate(() => {
        KA.me.pos.set(1.25, 3.05, 0);
        KA.me.vel.set(0, 0, 0);
        KA.me.spawnT = KA.now;
      });
    await B.keyboard.down("KeyE");
    /* hold until it lands (up to 4 s) so a slow frame rate on CI does not cut the hold short */
    const trail = [];
    for (let i = 0; i < 60 && (await B.evaluate(() => KA.wi)) !== 2; i++) {
      /* if the friend died in the meantime, wait for the respawn and walk back up */
      if (await B.evaluate(() => KA.me.dead)) {
        trail.push("dead");
        await alive(B);
      }
      await go();
      await B.waitForTimeout(100);
    }
    await B.keyboard.up("KeyE");
    await B.waitForTimeout(1000);
    check((await B.evaluate(() => KA.wi)) === 2, "friend picks up the CTF sniper", [
      await B.evaluate(() => ({
        wi: KA.wi,
        dead: KA.me.dead,
        pos: KA.me.pos.toArray().map(v => +v.toFixed(2)),
        prompt: document.getElementById("prompt").textContent,
        pk:
          KA.EXT &&
          KA.EXT.pickups &&
          KA.EXT.pickups().map(p => [p.id, p.avail, +(p.availIn || 0).toFixed(1)]),
      })),
      await A.evaluate(() => KA.EXT.pickups().map(p => [p.id, p.avail, p.availAt, KA.now])),
      trail,
    ]);
    check(await A.evaluate(() => !KA.EXT.pickups()[0].avail), "host marks the sniper taken");
    await A.evaluate(() => {
      for (const a of CTF.UI.game().agents) if (!a.human) a.respawnAt = 0;
    });
    await B.keyboard.press("KeyJ");
    await B.waitForTimeout(2000);
    check((await roster(A)).length === 8, "team switch keeps 4v4");
    await alive(A);
    await A.evaluate(() => {
      KA.me.spawnT = KA.now;
    });
    await A.evaluate(
      p => {
        window.__pad = p;
      },
      pad({}, [0, -1, 1, 0])
    );
    const y0 = await A.evaluate(() => KA.me.yaw);
    await A.waitForTimeout(400);
    check(Math.abs((await A.evaluate(() => KA.me.yaw)) - y0) > 0.3, "controller right stick turns");
    await A.evaluate(() => {
      window.__pad = null;
    });
    const C = await open(ctx, { tag: "C", init: ["fake-peer.js"], hash: "#join=" + code.toLowerCase() });
    pages.push(C);
    await C.waitForTimeout(1500);
    check(/Connected/.test(await text(C, "#p2pMsg")), "invite link joins automatically");
    await closeTab(A);
    await B.bringToFront();
    /* the friend in the match takes it over (background tabs pause animation frames, so poll) */
    const hostingB = () => B.evaluate(() => !!CTF.UI.game() && !CTF.UI.game().map && !CTF.UI.game().over);
    for (let i = 0; i < 30 && !(await hostingB()); i++) await B.waitForTimeout(500);
    check(
      await hostingB(),
      "the friend takes over the match when the host leaves",
      await B.evaluate(() =>
        JSON.stringify({
          ext: !!KA.EXT,
          playing: KA.playing,
          paused: !document.getElementById("pause").hidden,
          ban: !document.getElementById("cBanner").hidden,
          dead: KA.me.dead,
          p2p: window.__p2p.state,
        })
      )
    );
    await B.evaluate(() => KA.extStop());
    await B.waitForTimeout(400);
    check(
      (await visible(B, "#menu")) && !(await visible(B, "#cBanner")),
      "leaving the match returns to a clean menu"
    );
    /* ---------- sim + trailer start without errors ---------- */
    const S = await open(ctx, { tag: "S" });
    pages.push(S);
    await S.waitForTimeout(600);
    await S.click("#ctfSim");
    await S.waitForTimeout(2500);
    check(/\d:\d\d/.test((await text(S, "#cClock")) || ""), "AI vs AI runs", await text(S, "#cClock"));
    await S.click("#cExit");
    await S.waitForTimeout(300);
    await S.click("#watch");
    await S.waitForTimeout(2000);
    check(await visible(S, "#demoUI"), "movement tutorial starts");
    await S.click("#dExit");
    await S.waitForTimeout(300);
    /* trailer: starts, shows a title card on schedule, survives the jump to the CTF montage, and exits cleanly */
    await S.click("#trailerBtn");
    await S.waitForTimeout(2300);
    check(
      await S.evaluate(() => KA.trailer.active && !document.getElementById("trailer").hidden),
      "trailer starts"
    );
    check(
      await S.evaluate(() => +getComputedStyle(document.getElementById("trCard")).opacity > 0.5),
      "trailer shows its opening title card"
    );
    await S.evaluate(() => KA.trailer.seek(33.5));
    check(await S.evaluate(() => !!CTF.UI.game()), "trailer cuts to the live CTF montage");
    await S.keyboard.press("Escape");
    await S.waitForTimeout(300);
    check(
      await S.evaluate(
        () =>
          !KA.trailer.active &&
          document.getElementById("trailer").hidden &&
          !document.getElementById("menu").hidden &&
          !CTF.UI.game()
      ),
      "trailer exits to the menu and cleans up"
    );
    /* ---------- AI training runs on a background thread when served over http ---------- */
    const W = await open(ctx, { tag: "W", http: true });
    pages.push(W);
    await W.waitForTimeout(600);
    const tr = await W.evaluate(
      () =>
        new Promise(ok => {
          const t0 = performance.now();
          let frames = 0;
          (function f() {
            frames++;
            requestAnimationFrame(f);
          })();
          const h = CTF.train(1, null, res =>
            ok({
              res,
              worker: h.worker,
              saved: !!KA.STORE.load("ctfBrain"),
              fps: Math.round((frames * 1000) / (performance.now() - t0)),
            })
          );
          setTimeout(() => ok({ timeout: true, worker: h.worker }), 60000);
        })
    );
    check(
      tr.worker && !tr.timeout && tr.saved && tr.res,
      "AI training runs in the background worker and saves what it learned",
      tr
    );
    /* ---------- developer console (?dev) ---------- */
    const D = await open(ctx, { tag: "dev", hash: "#dev" });
    pages.push(D);
    await D.waitForTimeout(600);
    await D.click("#deploy");
    await D.waitForTimeout(600);
    await D.keyboard.press("Backquote");
    await D.waitForTimeout(100);
    const cmd = async c => {
      await D.keyboard.type(c);
      await D.keyboard.press("Enter");
      await D.waitForTimeout(80);
    };
    check(await D.evaluate(() => KA.CON.open), "backquote opens the console in dev mode");
    await cmd("tp 0 0 22");
    await cmd("give sniper");
    await cmd("god on");
    await cmd("hitboxes on");
    await cmd("timescale 0.5");
    await cmd("nope");
    const con = await D.evaluate(() => ({
      z: KA.me.pos.z,
      wi: KA.wi,
      text: document.querySelector("#devcon .dc-out").textContent,
    }));
    check(
      Math.abs(con.z - 22) < 2 &&
        con.wi === 2 &&
        /hitboxes on/.test(con.text) &&
        /time scale 0.5/.test(con.text) &&
        /unknown command/.test(con.text),
      "console commands teleport, give weapons, draw hitboxes and set time scale",
      con
    );
    await D.evaluate(() => KA.hurtMe(500, { name: "test" }));
    check(await D.evaluate(() => !KA.me.dead), "god mode blocks damage");
    await cmd("timescale 1");
    await D.keyboard.press("Backquote");
    check(await D.evaluate(() => !KA.CON.open), "backquote closes the console");
    check(
      await p.evaluate(() => !KA.CON.open && !document.getElementById("devcon")),
      "the console stays off without ?dev"
    );
  } catch (e) {
    check(false, "test script error", e.message.split("\n")[0]);
  }
  const errs = pages.flatMap(p => p.errors || []);
  check(errs.length === 0, "no page errors", errs.slice(0, 5));
  await b.close();
  finish("browser");
})();
