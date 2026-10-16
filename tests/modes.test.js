/* Browser tests for the four match modes and the mode select menu: the menu (cards, keyboard, map and
   team, the summary and the Play button, a mode's rules in Settings), each mode started from the menu
   and played to a win and the results screen, the carrier rules (flag and skull), free-for-all AI
   fighting each other, and an online room playing the host's mode. Waits are on game state, not
   time, so a slow machine only takes longer. */
const { check, finish } = require("./lib/check.js");
const { launch, open, text, visible, until } = require("./lib/browser.js");
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    /* ---------- the menu ---------- */
    const p = await open(ctx, { tag: "modes", init: ["fake-peer.js"] });
    await until(p, () => document.querySelectorAll(".mcard").length === 4);
    const cards = await p.evaluate(() =>
      [...document.querySelectorAll(".mcard")].map(c => ({
        id: c.dataset.mode,
        role: c.getAttribute("role"),
        on: c.getAttribute("aria-checked") === "true",
        name: c.querySelector(".mname").textContent,
        lim: c.querySelector(".mlim").textContent,
      }))
    );
    check(
      cards.length === 4 &&
        cards.every(c => c.role === "radio" && c.lim) &&
        cards.filter(c => c.on).length === 1 &&
        cards.map(c => c.id).join() === "ctf,slayer,ffa,oddball",
      "the menu shows the four modes as cards, one picked, each with its limits",
      cards.map(c => `${c.name}: ${c.lim}`)
    );
    check(
      (await p.evaluate(() => document.getElementById("modeCards").getAttribute("role"))) === "radiogroup",
      "the cards are a radio group"
    );
    await p.click("#mode-ctf");
    await p.keyboard.press("ArrowRight");
    const s1 = await p.evaluate(() => ({
      on: document.querySelector(".mcard[aria-checked=true]").dataset.mode,
      focus: document.activeElement.id,
      play: document.getElementById("play").textContent,
      sum: document.getElementById("modeSum").textContent,
    }));
    check(
      s1.on === "slayer" &&
        s1.focus === "mode-slayer" &&
        /Play Team Slayer/.test(s1.play) &&
        /^Team Slayer on Proving Grounds/.test(s1.sum),
      "an arrow key picks the next mode; the summary and the Play button name it",
      s1
    );
    await p.selectOption("#mapPick", "ctf");
    check(
      /^Team Slayer on Twin Foundry/.test((await text(p, "#modeSum")) || ""),
      "the map you pick shows in the summary",
      await text(p, "#modeSum")
    );
    await p.selectOption("#mapPick", "arena");
    await p.click("#mode-ffa");
    const f1 = await p.evaluate(() => ({
      team: !document.getElementById("teamPick").hidden,
      size: document.getElementById("sizeLab").textContent,
      sum: document.getElementById("modeSum").textContent,
    }));
    check(
      !f1.team && f1.size === "Pilots" && /every pilot for themselves/.test(f1.sum),
      "free-for-all: no team to pick, a pilot count instead of a team size",
      f1
    );
    await p.click("#mode-ctf");
    check(
      await p.evaluate(
        () =>
          document.getElementById("mapPick").disabled &&
          /Twin Foundry/.test(document.getElementById("mapPick").textContent)
      ),
      "capture the flag plays on Twin Foundry only"
    );
    /* a mode's rules: the Rules button opens them in Settings → Modes; a change shows on the card */
    await p.click("#mode-oddball");
    await p.click("#modeRules");
    const r1 = await p.evaluate(() => ({
      open: !document.getElementById("settings").hidden,
      tab: (document.querySelector(".stab[aria-selected=true]") || {}).textContent,
      focus: document.activeElement.id,
    }));
    check(r1.open && r1.tab === "Modes" && r1.focus === "set_oddWin", "Rules opens the mode's settings", r1);
    await p.evaluate(() => {
      const el = /** @type {HTMLInputElement} */ (document.getElementById("set_oddWin"));
      el.value = "60";
      el.dispatchEvent(new Event("input"));
    });
    await p.click("#setDone");
    check(
      /hold the skull 1:00/i.test((await text(p, "#mode-oddball .mlim")) || ""),
      "a rule changed in Settings shows on the mode's card",
      await text(p, "#mode-oddball .mlim")
    );
    const tall = await p.evaluate(() =>
      Math.min(...[...document.querySelectorAll(".mcard")].map(c => c.getBoundingClientRect().height))
    );
    check(tall >= 44, "every card is big enough to tap", tall);
    await p.reload();
    await until(p, () => document.querySelectorAll(".mcard").length === 4);
    check(
      (await p.evaluate(() => document.querySelector(".mcard[aria-checked=true]").dataset.mode)) ===
        "oddball",
      "the mode you picked is remembered"
    );
    await p.evaluate(() => {
      KA.SET.oddWin = 120;
      KA.applySettings();
    });
    /* ---------- each mode from the menu, played to a win ---------- */
    const kills = () =>
      p.evaluate(() => {
        window.__k = [];
        KA.EVENTS.on("kill", e => window.__k.push({ k: e.killer, v: e.victim, w: e.weapon }));
      });
    await kills();
    /** start a mode from its card */
    const play = async (id, map) => {
      await p.click("#mode-" + id);
      if (map) await p.selectOption("#mapPick", map);
      await p.click("#play");
      const ok = await until(
        p,
        id => KA.playing && CTF.UI.game() && CTF.UI.game().rules === id && !KA.me.dead,
        id
      );
      await p.mouse.click(640, 400);
      return ok;
    };
    /** an enemy AI pilot right in front of you, holding still */
    const enemyAhead = () =>
      p.evaluate(() => {
        const g = CTF.UI.game(),
          e = g.agents.find(a => !a.human && a.alive && a.team !== g.human.team);
        e.think = () => ({
          f: 0,
          s: 0,
          sprint: false,
          thrust: false,
          crouch: false,
          crouchP: false,
          jumpP: false,
          aim: false,
          scoped: false,
          meleeP: false,
        });
        e.body.pos.set(KA.me.pos.x, KA.me.pos.y, KA.me.pos.z - 1.5);
        e.body.vel.set(0, 0, 0);
        e.body.shield = 70;
        e.body.spawnT = -99;
        KA.me.yaw = 0;
        KA.me.pitch = 0;
        return e.id;
      });
    /** a melee at an enemy right in front of you, once you stand still and can swing (no sprint
        built up, which would make it a shoulder charge; no thrust; melee ready), retried a few
        times on a slow machine; true when that enemy died to weapon w */
    const swing = async w => {
      for (let i = 0; i < 4; i++) {
        await p.evaluate(() => {
          KA.me.vel.set(0, 0, 0);
        });
        await until(
          p,
          () =>
            KA.me.ground && KA.me.thrustT <= 0 && KA.me.meleeCD <= 0 && KA.me.sprintT < 0.1 && !KA.me.dead,
          null,
          10000
        );
        const v = await enemyAhead();
        await p.keyboard.press("KeyF");
        if (
          await until(
            p,
            a => window.__k.some(k => k.v === "ctf:" + a[0] && k.w === a[1] && k.k === "local"),
            [v, w],
            4000
          )
        )
          return true;
      }
      return false;
    };
    /** the match ends: Play of the Game, then the results screen */
    const results = async () => {
      const ok = await until(p, () => KA.POST.open, null, 90000);
      const r = await p.evaluate(() => ({
        title: document.getElementById("postWin").textContent,
        mode: document.getElementById("postMode").textContent,
        note: document.getElementById("postNote").textContent,
      }));
      await p.click("#postChange");
      await until(p, () => !document.getElementById("menu").hidden);
      return ok && r;
    };
    const quiet = () =>
      p.evaluate(() => {
        /* the rest of the match holds still (only what the test does happens) */
        for (const a of CTF.UI.game().agents)
          if (!a.human)
            a.think = () => ({
              f: 0,
              s: 0,
              sprint: false,
              thrust: false,
              crouch: false,
              crouchP: false,
              jumpP: false,
              aim: false,
              scoped: false,
              meleeP: false,
            });
        KA.CON.run("god on");
      });
    /* capture the flag: the carrier rules, then a capture to win */
    check(await play("ctf"), "Capture the Flag starts from the menu");
    await quiet();
    const take = () =>
      p.evaluate(() => {
        const g = CTF.UI.game(),
          f = g.flags[1 - g.human.team];
        f.state = "home";
        f.pos.copy(CTF.FLAG_HOME[f.team]);
        KA.me.pos.copy(f.pos);
        KA.me.vel.set(0, 0, 0);
        return g.humanTakeFlag(g.human);
      });
    const carry = () => p.evaluate(() => KA.EXT.carrying());
    /* empty-handed, the trigger fires */
    const f0 = await p.evaluate(() => KA.lastFireT);
    await p.mouse.down();
    await p.waitForTimeout(300);
    await p.mouse.up();
    check((await p.evaluate(() => KA.lastFireT)) !== f0, "empty-handed, the trigger fires");
    check(
      (await take()) && (await carry()) === "flag",
      "holding Interact at their flag takes it (carrying: flag)"
    );
    await p.keyboard.down("KeyW");
    await p.keyboard.down("ShiftLeft");
    await until(p, () => !KA.EXT.carrying(), null, 5000);
    await p.keyboard.up("ShiftLeft");
    await p.keyboard.up("KeyW");
    check(!(await carry()), "sprinting with the flag drops it", await carry());
    await take();
    await p.waitForTimeout(100);
    await p.keyboard.press("KeyQ");
    await until(p, () => !KA.EXT.carrying(), null, 5000);
    check(!(await carry()), "thrusting with the flag drops it", await carry());
    await take();
    const ft = await p.evaluate(() => {
      window.__shot = 0;
      KA.EVENTS.on("shot", e => e.pilot === "local" && window.__shot++);
      return KA.lastFireT;
    });
    await p.mouse.down();
    await p.waitForTimeout(300);
    await p.mouse.up();
    check((await p.evaluate(() => KA.lastFireT)) === ft, "a flag carrier can't shoot");
    check(
      await swing("flag"),
      "a melee by the flag carrier kills in one hit",
      await p.evaluate(() => window.__k.slice(-2))
    );
    await p.evaluate(() => {
      const g = CTF.UI.game();
      g.scoreLimit = g.teams[g.human.team].score + 1;
      g.flags[g.human.team].state = "home";
      g.flags[g.human.team].pos.copy(CTF.FLAG_HOME[g.human.team]);
      KA.me.pos.copy(CTF.FLAG_HOME[g.human.team]);
    });
    check(
      await until(p, () => CTF.UI.game() && CTF.UI.game().teams[CTF.UI.game().human.team].score >= 1),
      "bringing it home scores",
      await text(p, ".cbar")
    );
    const rc = await results();
    check(
      rc && rc.title === "Victory" && /Capture the Flag · Twin Foundry/.test(rc.mode),
      "the capture wins and the results show",
      rc
    );
    /* adaptive bots (on by default offline): the pick is the most they will be, so a win on Recruit
       keeps them there, and the menu says where they are */
    check(
      rc && /Bots next match: Recruit \(the skill you picked\)/.test(rc.note),
      "after a win the adaptive bots stay at the skill you picked, and the results say so",
      rc && rc.note
    );
    check(
      /Recruit, adapting/.test((await text(p, "#modeSum")) || ""),
      "the menu shows where the adaptive bots are",
      await text(p, "#modeSum")
    );
    /* a loss eases them off (below Recruit too); wins bring them back, never above the pick */
    const ad = await p.evaluate(() => {
      const name = () => KA.botLevelName(KA.botLevel());
      const out = [name()];
      KA.botAdapt(-1);
      out.push(name());
      KA.botAdapt(-1);
      KA.botAdapt(-1);
      out.push(name());
      for (let i = 0; i < 8; i++) KA.botAdapt(1);
      out.push(name(), KA.botLevel());
      return out;
    });
    check(
      ad[0] === "Recruit" &&
        ad[1] === "Recruit−" &&
        ad[2] === "Trainee" &&
        ad[3] === "Recruit" &&
        ad[4] === 0,
      "adaptive bots: a loss eases them off (down to Trainee), wins bring them back up to the pick and no further",
      ad
    );
    check(
      await p.evaluate(() => {
        const m = KA.STORE.load("aiMaps");
        return !!(m && m.maps["twin-foundry"] && m.maps["twin-foundry"].n >= 1);
      }),
      "the AI remembers the map after the match (saved per map)"
    );
    /* Team Slayer and free-for-all: kills score, the score limit wins */
    for (const [id, name] of [
      ["slayer", "Team Slayer"],
      ["ffa", "Free-for-all Slayer"],
    ]) {
      check(await play(id, "arena"), `${name} starts from the menu on the arena`);
      check(
        (await p.evaluate(() => document.getElementById("ctfHud").dataset.rules)) === id,
        `${name}: the HUD shows the mode`,
        await text(p, ".cbar")
      );
      if (id === "ffa") {
        /* the AI fights each other, not just you */
        await p.evaluate(() => KA.CON.run("god on") || KA.CON.run("timescale 4"));
        check(
          await until(
            p,
            () => window.__k.some(k => /^ctf:/.test(k.k) && /^ctf:/.test(k.v) && k.k !== k.v),
            null,
            90000
          ),
          "free-for-all: AI pilots kill each other",
          await p.evaluate(() => window.__k.slice(-4))
        );
        await p.evaluate(() => KA.CON.run("timescale 1"));
      }
      await quiet();
      const before = await p.evaluate(() => CTF.UI.game().teams[CTF.UI.game().human.team].score);
      await p.evaluate(() => {
        const g = CTF.UI.game(),
          e = g.agents.find(a => !a.human && a.alive && a.team !== g.human.team);
        g.kill(e, g.human, "rifle", false);
      });
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => ({
        s: CTF.UI.game().teams[CTF.UI.game().human.team].score,
        hud: document.getElementById("cS0").textContent,
      }));
      check(
        after.s === before + 1 && after.hud === String(after.s),
        `${name}: a kill scores and the HUD shows it`,
        { before, after }
      );
      await p.evaluate(() => {
        const g = CTF.UI.game();
        g.scoreLimit = g.teams[g.human.team].score + 1;
        const e = g.agents.find(a => !a.human && a.alive && a.team !== g.human.team);
        g.kill(e, g.human, "rifle", false);
      });
      const r = await results();
      check(
        r && r.title === "Victory" && r.mode.startsWith(name),
        `${name}: reaching the kill limit wins`,
        r
      );
    }
    /* oddball: the skull drops in, you hold it (no guns, no grenades, a one-hit melee), held time wins */
    check(await play("oddball", "arena"), "Team Oddball starts from the menu");
    await quiet();
    await p.evaluate(() => (CTF.UI.game().ball.landAt = CTF.UI.game().t));
    check(
      await until(p, () => CTF.UI.game().ball.state === "home"),
      "the skull comes down in the middle",
      await p.evaluate(() => CTF.UI.game().ball.state)
    );
    await p.evaluate(() => {
      KA.me.pos.copy(CTF.UI.game().ball.pos);
      KA.me.vel.set(0, 0, 0);
    });
    check(
      await until(p, () => KA.EXT.carrying() === "skull", null, 10000),
      "walking over the skull picks it up",
      await p.evaluate(() => CTF.UI.game().ball.state)
    );
    const held0 = await p.evaluate(() => CTF.UI.game().teams[CTF.UI.game().human.team].held);
    const nades = await p.evaluate(() => JSON.stringify(KA.nadeInv));
    const ft2 = await p.evaluate(() => KA.lastFireT);
    await p.mouse.down();
    await p.waitForTimeout(300);
    await p.mouse.up();
    await p.keyboard.press("KeyG");
    await p.waitForTimeout(200);
    check(
      (await p.evaluate(() => KA.lastFireT)) === ft2 &&
        (await p.evaluate(() => JSON.stringify(KA.nadeInv))) === nades,
      "holding the skull: no shooting, no grenades"
    );
    check(
      await swing("skull"),
      "a melee with the skull kills in one hit",
      await p.evaluate(() => window.__k.slice(-2))
    );
    check(
      await until(p, h => CTF.UI.game().teams[CTF.UI.game().human.team].held > h + 0.5, held0, 10000),
      "holding it scores for your team",
      await text(p, ".cbar")
    );
    const marks = await p.evaluate(() => document.getElementById("cMarks").textContent);
    check(
      /Hold/.test((await text(p, "#cGoal")) || ""),
      "the HUD says how long to hold it",
      await text(p, "#cGoal")
    );
    await p.evaluate(() => {
      const g = CTF.UI.game();
      g.scoreLimit = g.teams[g.human.team].held + 1;
    });
    const ro = await results();
    check(
      ro && ro.title === "Victory" && /Team Oddball · Proving Grounds/.test(ro.mode),
      "holding it long enough wins",
      { ro, marks }
    );
    await until(p, () => document.activeElement && document.activeElement.id === "play", null, 3000);
    check(
      (await p.evaluate(() => document.activeElement.id)) === "play",
      "Change mode returns to the menu, on Play"
    );
    /* ---------- watching AI play: the free camera ---------- */
    await p.click("#mode-slayer");
    await p.selectOption("#mapPick", "arena");
    await p.click("#watchAI");
    check(await until(p, () => !!(CTF.UI.game() && CTF.spectator)), "Watch AI starts AI vs AI");
    /* the camera button cycles director, tactical, free, then each pilot */
    for (let i = 0; i < 12 && (await p.evaluate(() => CTF.spectator.mode)) !== "free"; i++)
      await p.click("#cCam");
    const fc = await p.evaluate(() => ({
      mode: CTF.spectator.mode,
      label: document.getElementById("cCam").textContent,
      hint: !document.getElementById("cFreeHint").hidden && document.getElementById("cFreeHint").textContent,
    }));
    check(
      fc.mode === "free" && /free/.test(fc.label) && /WASD/.test(fc.hint) && /RT/.test(fc.hint),
      "the camera cycles to a free camera, with its keys and buttons on screen",
      fc
    );
    /* flying: W moves the way it looks, Space climbs, it eases in (game-state waits, not time) */
    const camAt = () => p.evaluate(() => KA.camera.position.toArray());
    await p.evaluate(() => {
      const F = CTF.spectator.free;
      F.pos.set(0, 20, 0);
      F.vel.set(0, 0, 0);
      F.yaw = 0;
      F.pitch = 0;
    });
    await p.keyboard.down("KeyW");
    const slow = await p.evaluate(() => CTF.spectator.free.vel.length());
    check(await until(p, () => CTF.spectator.free.pos.z < -6, null, 20000), "W flies forward", await camAt());
    const vmax = await p.evaluate(() => CTF.spectator.free.vel.length());
    await p.keyboard.up("KeyW");
    check(slow < vmax && vmax <= 14.01, "it speeds up smoothly to its cruising speed", { slow, vmax });
    await p.keyboard.down("Space");
    check(await until(p, () => CTF.spectator.free.pos.y > 26, null, 20000), "Space climbs", await camAt());
    await p.keyboard.up("Space");
    check(
      await until(p, () => CTF.spectator.free.vel.length() < 0.5, null, 20000),
      "letting go eases it to a stop"
    );
    /* through walls, but kept over the map */
    await p.evaluate(() => {
      CTF.spectator.free.pos.set(500, -40, -500);
    });
    check(
      await until(
        p,
        () => {
          const q = CTF.spectator.free.pos,
            B = CTF.MAP.bounds;
          return q.x <= B.x1 + 4 && q.z >= B.z0 - 4 && q.y >= 0.5;
        },
        null,
        10000
      ),
      "it stays inside the map's bounds and above the floor",
      await camAt()
    );
    /* a controller: the left stick flies, the right stick looks */
    await p.evaluate(() => {
      const F = CTF.spectator.free;
      F.pos.set(0, 20, 0);
      F.vel.set(0, 0, 0);
      F.yaw = 0;
      F.pitch = 0;
      const btn = () => ({ pressed: false, value: 0 });
      const pad = { connected: true, axes: [0, -1, 0.6, 0], buttons: Array.from({ length: 17 }, btn) };
      window.__padNav = navigator.getGamepads;
      navigator.getGamepads = () => [pad];
    });
    check(
      await until(
        p,
        () =>
          CTF.spectator.free.pos.distanceTo(new KA.THREE.Vector3(0, 20, 0)) > 4 &&
          CTF.spectator.free.yaw < -0.2,
        null,
        20000
      ),
      "a controller flies it (left stick) and turns it (right stick)",
      await p.evaluate(() => [CTF.spectator.free.pos.toArray(), CTF.spectator.free.yaw])
    );
    await p.evaluate(() => (navigator.getGamepads = window.__padNav));
    /* the camera picked last is where the next spectated match starts */
    await p.evaluate(() => KA.extStop());
    await until(p, () => !document.getElementById("menu").hidden);
    check((await visible(p, "#cFreeHint")) === false, "the free camera's hint goes with the spectator");
    await p.click("#watchAI");
    check(
      await until(p, () => !!CTF.UI.game() && CTF.spectator.mode === "free", null, 20000),
      "watching again starts on the free camera picked last time",
      await p.evaluate(() => CTF.spectator.mode)
    );
    await p.keyboard.press("KeyV");
    check(
      await until(p, () => CTF.spectator.mode === "follow", null, 5000),
      "V moves on to the next camera",
      await p.evaluate(() => CTF.spectator.mode)
    );
    await p.evaluate(() => KA.extStop());
    await until(p, () => !document.getElementById("menu").hidden);
    /* ---------- online: the host's mode is the room's ---------- */
    await p.evaluate(() => KA.CON.run("god off"));
    const A = await open(ctx, { tag: "A", init: ["fake-peer.js"] });
    const B = await open(ctx, { tag: "B", init: ["fake-peer.js"] });
    await until(A, () => document.querySelectorAll(".mcard").length === 4);
    await A.fill("#callsign", "Host");
    await A.click("#p2pHost");
    await until(A, () => /^[A-Z0-9]{5}$/.test(document.getElementById("p2pCodeShow").textContent));
    const code = await text(A, "#p2pCodeShow");
    await B.fill("#callsign", "Friend");
    await B.fill("#p2pCode", code);
    await B.click("#p2pJoin");
    await until(B, () => /Connected/.test(document.getElementById("p2pMsg").textContent));
    await A.click("#mode-oddball");
    await A.selectOption("#mapPick", "arena");
    check(
      await until(
        A,
        () => /Host Team Oddball/.test(document.getElementById("play").textContent),
        null,
        10000
      ),
      "in a room, Play hosts the mode",
      await text(A, "#play")
    );
    await A.click("#play");
    check(
      await until(
        B,
        () => /Join Team Oddball/.test(document.getElementById("play").textContent),
        null,
        20000
      ),
      "a friend's menu offers to join the host's mode",
      await text(B, "#play")
    );
    const bm = await B.evaluate(() => ({
      sum: document.getElementById("modeSum").textContent,
      on: document.querySelector(".mcard[aria-checked=true]").dataset.mode,
      off: [...document.querySelectorAll(".mcard.off")].length,
    }));
    check(
      /Joining Host's Team Oddball on Proving Grounds/.test(bm.sum) && bm.on === "oddball" && bm.off === 3,
      "joiners see which mode and map they are joining",
      bm
    );
    await B.click("#play");
    check(
      await until(
        B,
        () => CTF.UI.game() && CTF.UI.game().rules === "oddball" && CTF.UI.game().mapKey === "arena",
        null,
        20000
      ),
      "the friend joins the host's oddball match on the arena"
    );
    await A.evaluate(() => (CTF.UI.game().ball.landAt = CTF.UI.game().t));
    check(
      await until(
        B,
        () => {
          const g = CTF.UI.game();
          return g && g.ball && g.ball.state !== "incoming";
        },
        null,
        30000
      ),
      "the friend sees the skull come down",
      await B.evaluate(() => CTF.UI.game() && CTF.UI.game().ball && CTF.UI.game().ball.state)
    );
    await B.evaluate(() => KA.extStop());
    await A.evaluate(() => KA.extStop());
    /* free-for-all online: the friend gets a pilot slot of their own */
    await A.click("#mode-ffa");
    await A.click("#play");
    await until(
      B,
      () => /Join Free-for-all Slayer/.test(document.getElementById("play").textContent),
      null,
      20000
    );
    await B.click("#play");
    check(
      await until(
        A,
        () => {
          const g = CTF.UI.game();
          const f = g && g.agents.find(a => a.remote);
          return !!f && f.team !== g.human.team && g.teams[f.team].agents.length === 1;
        },
        null,
        20000
      ),
      "free-for-all online: the friend takes a pilot slot of their own",
      await A.evaluate(() => CTF.UI.game() && CTF.UI.game().agents.map(a => [a.name, a.team]))
    );
    check(
      await until(B, () => CTF.UI.game() && CTF.UI.game().ffa && CTF.UI.game().human.team > 0, null, 20000),
      "and knows which one",
      await B.evaluate(() => CTF.UI.game() && CTF.UI.game().human.team)
    );
    check(!(await visible(B, "#swTeam")), "there is no team to switch to in free-for-all");
    const errs = [...p.errors, ...A.errors, ...B.errors];
    check(errs.length === 0, "no page errors", errs.slice(0, 5));
  } catch (e) {
    check(false, "test script error", e.message);
  }
  await b.close();
  finish("modes");
})();
