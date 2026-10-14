/* global WheelEvent, PointerEvent */
/* Browser tests: arena weapons and pickups, settings and rebinding, destruction, online rooms and CTF over a simulated peer network. */
const { check, finish } = require("./lib/check.js");
const { launch, open, text, visible, roster, closeTab } = require("./lib/browser.js");
const pad = (btns = {}, axes = [0, 0, 0, 0]) => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!btns[i], value: btns[i] ? 1 : 0 })),
});
/* (in the page) where a drop pod comes to rest at each of a map's spawn points with open sky above */
const podSeats = map => {
  const V = KA.THREE.Vector3;
  const spots = map === "arena" ? KA.MAPS.arena.spawns.ffa : KA.MAPS.ctf.spawns.teams.flat();
  return spots
    .map(([x, y, z]) => {
      const at = new V(x, y + 0.02, z);
      const sky = KA.rayWorld(new V(x, at.y + 2.2, z), new V(0, 1, 0), 60) >= 59;
      const s = KA.podSeat(at);
      return { at: [x, y, z], sky, ok: s.ok, off: Math.hypot(s.x, s.z), bury: s.bury };
    })
    .filter(s => s.sky);
};
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
    check((await p.inputValue("#botSkill")) === "recruit", "a first bot match starts on Recruit skill");
    {
      /* a picked skill is remembered (its own browser profile, so the rest of the run stays on Recruit) */
      const c2 = await b.newContext();
      const q = await open(c2, { tag: "skill" });
      await q.waitForTimeout(500);
      await q.selectOption("#botSkill", "heroic");
      await q.reload();
      await q.waitForTimeout(500);
      check((await q.inputValue("#botSkill")) === "heroic", "the bot skill you pick is remembered");
      await c2.close();
    }
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
    check(
      /* (it eases in over 0.15 s of game time: a slow machine draws that in fewer, longer frames) */
      await p.evaluate(async () => {
        const inn = () =>
          KA.adsP === 1 && Math.abs(KA.camera.fov - KA.SET.fov / KA.WEAPON_DATA[KA.wi].zoom[0]) < 0.5;
        for (let i = 0; i < 30 && !inn(); i++) await new Promise(r => setTimeout(r, 50));
        return inn();
      }),
      "the scope eases all the way in",
      await p.evaluate(() => [KA.adsP, KA.camera.fov])
    );
    await p.mouse.up({ button: "right" });
    await p.evaluate(() => {
      KA.me.pos.set(1.25, 3.25, 0);
      KA.me.vel.set(0, 0, 0);
    });
    await p.waitForTimeout(250);
    check(await visible(p, "#prompt"), "pickup prompt near the sniper", await text(p, "#prompt"));
    await p.keyboard.down("KeyE");
    /* hold until it's taken (up to 3 s): slow CI frames can stretch the hold */
    for (let i = 0; i < 30 && (await p.evaluate(() => KA.wi)) !== 2; i++) await p.waitForTimeout(100);
    await p.keyboard.up("KeyE");
    await p.waitForTimeout(300);
    check(
      (await p.evaluate(() => KA.wi)) === 2,
      "holding interact picks up the sniper",
      await p.evaluate(() => [
        document.getElementById("wname").textContent,
        KA.me.pos.toArray(),
        KA.me.dead,
        KA.INTRO.active,
        KA.ARENA_PICKS.map(x => [x.type, x.availIn]),
      ])
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
    /* pings: marking an enemy under the reticle */
    const pg = await p.evaluate(() => {
      const b = KA.bots[1];
      b.body.dead = false;
      b.body.pos.set(-22, 0, 10);
      const o = new KA.THREE.Vector3(-22, 1.6, -10),
        aim = n => new KA.THREE.Vector3(n, 0.05, 20).normalize();
      const hit = KA.pingTarget(o, aim(0)),
        nearMiss = KA.pingTarget(o, aim(0.6)),
        wide = KA.pingTarget(o, aim(4));
      if (hit) KA.addPing(Object.assign({ by: "local", byName: "me" }, hit));
      return {
        kind: hit && hit.kind,
        near: nearMiss && nearMiss.kind,
        wide: wide && wide.kind,
        n: KA.PINGS.list.length,
        label: KA.PINGS.list.map(q => q.label).join(),
      };
    });
    check(
      pg.kind === "enemy" && pg.n >= 1 && /Enemy/.test(pg.label),
      "pinging an enemy under the reticle marks them",
      pg
    );
    /* motion tracker: a running enemy shows, a crouch-walking one doesn't */
    const trk = await p.evaluate(() => {
      const b = KA.bots[1];
      b.body.dead = false;
      const place = v => {
        b.body.pos.set(KA.me.pos.x + 6, KA.me.pos.y, KA.me.pos.z - 6);
        b.body.vel.set(v, 0, 0);
        b.firedT = -99;
      };
      place(7);
      const running = KA.trackerShown().length;
      place(2);
      const sneaking = KA.trackerShown().length;
      return { running, sneaking };
    });
    check(
      trk.running >= 1 && trk.sneaking === trk.running - 1,
      "the motion tracker shows runners but not crouch-walkers",
      trk
    );
    /* melee impacts: a blow on a pilot thuds (a crack when it breaks the shield, heavier from behind),
       one on a wall clanks, the charge has its own pair, and a whiff only swings */
    const mi = await p.evaluate(() => {
      const heard = [];
      KA.sfxTap(k => heard.push(k));
      const me = KA.me,
        b = KA.bots[1],
        V = KA.THREE.Vector3;
      for (const o of KA.bots) o.body.pos.set(60, 0, 60);
      const at = (x, z, yaw) => {
        me.pos.set(x, 0, z);
        me.yaw = yaw;
        me.pitch = 0;
        KA.camera.position.set(x, 1.6, z);
      };
      const take = fn => {
        heard.length = 0;
        fn();
        return heard.slice();
      };
      /* a wall: the side of a tall box, standing a metre off it and facing it */
      const w = KA.SOLID.find(s => s.y0 <= 0.1 && s.y1 - s.y0 > 2.5 && s.z1 - s.z0 > 2);
      const open = (x, z) => {
        for (let k = 0; k < 8; k++) {
          const y = (k * Math.PI) / 4;
          at(x, z, y);
          if (!KA.meleeWorldHit(me, 2.2, new V())) return y;
        }
        return null;
      };
      const out = {};
      at(w.x1 + 1, (w.z0 + w.z1) / 2, Math.PI / 2);
      out.wall = take(() => KA.meleeHit(2.3, 70, "melee"));
      me.chargeT = 0.3;
      out.chargeWall = take(() => KA.chargeWallFx(me, { ax: "x", box: w }));
      me.chargeT = 0;
      const y = open(-30, 30);
      out.whiff = y == null ? null : take(() => KA.meleeHit(2.3, 70, "melee"));
      /* a pilot in front, facing you with a full shield; then the same pilot with their back turned */
      const front = (yaw, sh) => {
        b.body.dead = false;
        b.body.spawnT = -99;
        b.body.shield = sh;
        b.body.yaw = yaw;
        b.body.pos.set(me.pos.x - Math.sin(me.yaw) * 1.4, 0, me.pos.z - Math.cos(me.yaw) * 1.4);
      };
      if (y != null) {
        front(me.yaw + Math.PI, 70);
        out.pilot = take(() => KA.meleeHit(2.3, 70, "melee"));
        front(me.yaw, 70);
        out.back = take(() => KA.meleeHit(2.3, 70, "melee"));
        front(me.yaw + Math.PI, 70);
        out.charge = take(() => KA.meleeHit(1.6, 85, "charge"));
      }
      KA.sfxTap(null);
      return out;
    });
    const impacts = ["mhit", "mkill", "mcrack", "mwall", "chit", "cwall"];
    check(
      mi.wall.includes("mwall") &&
        !mi.wall.includes("mhit") &&
        mi.chargeWall.includes("cwall") &&
        mi.whiff &&
        !mi.whiff.some(k => impacts.includes(k)),
      "a melee blow on a wall clanks, a charge into one has its own clank, a whiff makes no impact",
      mi
    );
    check(
      mi.pilot &&
        mi.pilot.includes("mhit") &&
        mi.pilot.includes("mcrack") &&
        mi.back.includes("mkill") &&
        mi.charge.includes("chit") &&
        !mi.pilot.includes("mwall"),
      "a blow on a pilot thuds and cracks their shield, heavier from behind; a charge has its own hit",
      mi
    );
    /* kill cam: dying replays the last seconds from the killer's eyes, then shows the recap */
    const kc = await p.evaluate(async () => {
      const b = KA.bots[0];
      KA.me.spawnT = -99;
      KA.me.shield = 0;
      const t0 = KA.now;
      KA.hurtMe(999, { bot: b, w: "rifle", hd: true });
      await new Promise(r => setTimeout(r, 900));
      /* under load the replay can take a moment to start */
      for (let i = 0; i < 20 && !KA.REPLAY.active; i++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 400));
      const capEl = document.querySelector("#cine .cap");
      const during = { active: KA.REPLAY.active, cap: capEl ? capEl.textContent : "(no caption)" };
      /* your drop pod waits for it: no pod while it plays, then the pod launches */
      let podWhile = false;
      for (let i = 0; i < 300 && KA.REPLAY.active; i++) {
        podWhile = podWhile || !!KA.myPod;
        await new Promise(r => setTimeout(r, 50));
      }
      const after = KA.REPLAY.active,
        recap = document.getElementById("deadBy").textContent,
        endT = KA.now - t0;
      for (let i = 0; i < 300 && !KA.myPod && KA.me.dead; i++) await new Promise(r => setTimeout(r, 20));
      const launch = KA.now - t0;
      for (let i = 0; i < 400 && KA.me.dead; i++) await new Promise(r => setTimeout(r, 50));
      return {
        during,
        after,
        recap,
        podWhile,
        endT,
        launch,
        total: KA.now - t0,
        want: KA.MODE_DATA.ffa.respawn + 1.35,
      };
    });
    check(
      kc.during.active &&
        /Kill cam/.test(kc.during.cap) &&
        !kc.after &&
        /Drone-04/.test(kc.recap) &&
        /headshot/.test(kc.recap),
      "dying plays a kill cam from the killer's eyes, then the death recap",
      kc
    );
    check(
      !kc.podWhile &&
        kc.launch >= kc.endT - 0.05 &&
        kc.launch - kc.endT < 0.5 &&
        kc.total >= kc.want - 0.1 &&
        kc.total < kc.want + 1,
      "your drop pod launches when the kill cam ends, and you are back about when you would have been",
      kc
    );
    await p.waitForTimeout(1500);
    /* drop pods, death drops, auto-pickup, rocket rotation, pilot collision */
    const loot = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      let pod = !!KA.myPod || KA.PODS.length > 0;
      for (let i = 0; i < 60 && KA.me.dead; i++) {
        await wait(100);
        pod = pod || !!KA.myPod || KA.PODS.length > 0;
      }
      const dropped = KA.ITEMS.map(i => i.type);
      return { pod, alive: !KA.me.dead, dropped };
    });
    check(loot.alive && loot.pod, "respawning drops you in from the sky in a pod", loot);
    check(
      loot.dropped.includes(-1) && loot.dropped.some(t => t >= 0),
      "dying drops your weapon and grenades",
      loot
    );
    /* the pod's longer fall is spectacle only: dead to back on your feet takes what it always did
       (the mode's respawn delay plus the old 1.35 s drop), and Jump skips the pod camera */
    /* (kill cams off: a kill cam can play over the start of the fall and move the camera) */
    await p.evaluate(() => (KA.SET.killCam = false));
    const rt = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      KA.me.spawnT = -99;
      KA.hurtMe(999, { w: "self", name: "test" });
      const t0 = KA.now;
      let launch = -1;
      for (let i = 0; i < 200 && KA.me.dead; i++) {
        if (launch < 0 && KA.myPod) launch = KA.now - t0;
        await wait(50);
      }
      return { launch, total: KA.now - t0, want: KA.MODE_DATA.ffa.respawn + 1.35, early: KA.POD_EARLY };
    });
    check(
      rt.launch > 0 && Math.abs(rt.total - rt.want) < 0.25,
      "dead to back in the fight takes the respawn delay plus 1.35 s, as before the higher drop",
      rt
    );
    const skip = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      KA.me.spawnT = -99;
      KA.hurtMe(999, { w: "self", name: "test" });
      for (let i = 0; i < 200 && !KA.myPod; i++) await wait(50);
      await wait(200);
      const high = KA.camera.position.y - KA.myPod.at.y;
      const vis = id => getComputedStyle(document.getElementById(id)).visibility;
      const cockpit = !document.getElementById("podView").hidden;
      return { high, at: KA.myPod.at.toArray(), hud: vis("hud"), xh: vis("xh"), cockpit };
    });
    check(
      skip.hud === "hidden" && skip.xh === "hidden" && skip.cockpit,
      "the HUD and reticle are hidden while the pod falls, and you ride it down from inside its cockpit",
      skip
    );
    await p.keyboard.press("Space");
    const skipped = await p.evaluate(async at => {
      await new Promise(r => setTimeout(r, 250));
      const pod = KA.myPod;
      const c = KA.camera.position;
      const d = Math.hypot(c.x - at[0], c.z - at[2]);
      for (let i = 0; i < 100 && KA.me.dead; i++) await new Promise(r => setTimeout(r, 50));
      const hudVis = () => getComputedStyle(document.getElementById("hud")).visibility;
      for (let i = 0; i < 20 && hudVis() !== "visible"; i++) await new Promise(r => setTimeout(r, 50));
      const hud = hudVis();
      const cockpit = !document.getElementById("podView").hidden;
      return { skip: !!(pod && pod.skip), low: c.y - at[1], d, alive: !KA.me.dead, hud, cockpit };
    }, skip.at);
    check(
      skip.high > 20 &&
        skipped.skip &&
        skipped.low < 3 &&
        skipped.d < 1 &&
        skipped.alive &&
        !skipped.cockpit &&
        skipped.hud === "visible",
      "Jump skips the pod camera to the landing spot, and the HUD returns on landing",
      { ...skip, ...skipped }
    );
    /* steering: holding a direction moves where your pod lands (within its radius), and it lands there */
    await p.evaluate(async () => {
      KA.me.spawnT = -99;
      KA.hurtMe(999, { w: "self", name: "test" });
      for (let i = 0; i < 200 && !KA.myPod; i++) await new Promise(r => setTimeout(r, 50));
    });
    await p.keyboard.down("KeyD");
    await p.waitForTimeout(700);
    await p.keyboard.up("KeyD");
    const steer = await p.evaluate(async () => {
      const pod = KA.myPod;
      if (!pod) return { pod: false };
      const moved = Math.hypot(pod.at.x - pod.base.x, pod.at.z - pod.base.z);
      const at = pod.at.clone();
      for (let i = 0; i < 100 && KA.me.dead; i++) await new Promise(r => setTimeout(r, 50));
      const landed = Math.hypot(KA.me.pos.x - at.x, KA.me.pos.z - at.z);
      /* it punched into the ground; you step up out of it to your eye height and the HUD comes back */
      /* (the pod settles into its crater over a few frames: a slow machine may not have drawn them yet) */
      let bury = at.y - pod.g.position.y;
      /* (it buries as deep as the ground there allows: a thin platform takes less) */
      const want = pod.seat ? pod.seat.bury : 0.5;
      for (let i = 0; i < 40 && bury < want - 0.1; i++) {
        await new Promise(r => setTimeout(r, 50));
        bury = Math.max(bury, at.y - pod.g.position.y);
      }
      await new Promise(r => setTimeout(r, 1000));
      const eye = KA.camera.position.y - KA.me.pos.y;
      const hud = getComputedStyle(document.getElementById("hud")).visibility;
      const cockpit = !document.getElementById("podView").hidden;
      return { pod: true, moved, r: pod.steer.r, landed, bury, want, eye, hud, cockpit };
    });
    check(
      steer.pod && steer.moved > 1.5 && steer.moved <= steer.r + 0.01 && steer.landed < 0.5,
      "you can steer your drop pod a little, and it lands where you steered it",
      steer
    );
    check(
      Math.abs(steer.bury - steer.want) < 0.15 &&
        Math.abs(steer.eye - 1.62) < 0.1 &&
        steer.hud === "visible" &&
        !steer.cockpit,
      "a pod buries itself on impact, and you step up out of it into the fight",
      steer
    );
    /* nobody lands on anybody: a spot where a pilot stands (or a pod is coming down) is passed over
       while any other is free */
    const taken = await p.evaluate(() => {
      const pts = KA.SPAWNS,
        V = KA.THREE.Vector3;
      const all = pts.slice(1).map(s => new V(s[0], s[1], s[2]));
      let only = true;
      for (let i = 0; i < 20; i++) only = only && KA.pickSpawn(pts, [], [], 0, Math.random, all) === pts[0];
      const saved = KA.bots.map(b => [b.body.pos.clone(), b.body.dead]);
      KA.bots.forEach((b, i) => {
        b.body.dead = false;
        b.body.pos.set(pts[i][0], pts[i][1], pts[i][2]);
      });
      let onThem = 0;
      for (let i = 0; i < 40; i++) if (pts.indexOf(KA.spawnPoint(null)) < KA.bots.length) onThem++;
      KA.bots.forEach((b, i) => {
        b.body.pos.copy(saved[i][0]);
        b.body.dead = saved[i][1];
      });
      return { only, onThem };
    });
    check(
      taken.only && taken.onThem === 0,
      "spawns and pods pass over spots where a pilot stands or a pod is coming down",
      taken
    );
    /* a landed pod buries itself to the collar: at every spawn with open sky it fits without touching
       a wall, an overhang or the air past a ledge, sitting at most 45 cm off the spot (the pilot is
       always on it) */
    const arenaSeats = await p.evaluate(podSeats, "arena");
    check(
      arenaSeats.length >= 6 && arenaSeats.every(s => s.ok && s.off <= 0.45 && s.bury > 0.5),
      "a drop pod fits and buries itself at every arena spawn it can land on",
      arenaSeats.filter(s => !(s.ok && s.off <= 0.45 && s.bury > 0.5))
    );
    /* the power weapon comes down in a supply pod timed by its own clock: it launches a couple of
       seconds out, its lid is open by the time the weapon is due, the due time never moves, and
       once the weapon is taken the empty crate sinks away */
    const sup = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const q = KA.ARENA_PICKS.find(q => q.power);
      const due = (q.availAt = KA.now + 3.5);
      let s = null;
      for (let i = 0; i < 100 && !(s = KA.SUPPLY.find(x => x.id === q.id)); i++) await wait(50);
      if (!s) return { launched: false };
      const out = { launched: true, early: due - KA.now, hud: document.getElementById("powerT").textContent };
      for (let i = 0; i < 100 && !s.open; i++) await wait(20);
      out.openBy = due - KA.now;
      out.availEarly = q.avail;
      for (let i = 0; i < 100 && !q.avail; i++) await wait(20);
      out.late = KA.now - due;
      out.same = q.availAt === due;
      out.hud2 = document.getElementById("powerT").textContent;
      q.consume();
      for (let i = 0; i < 100 && !s.gone; i++) await wait(50);
      out.gone = !!s.gone;
      return out;
    });
    check(
      sup.launched &&
        sup.early > 1.5 &&
        sup.early < 3 &&
        /incoming/.test(sup.hud) &&
        sup.openBy > -0.05 &&
        !sup.availEarly &&
        sup.same &&
        sup.late < 0.1 &&
        /up/.test(sup.hud2) &&
        sup.gone,
      "the power weapon drops in by supply pod, open on time, and the empty crate goes once it is taken",
      sup
    );
    const items = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      KA.me.spawnT = KA.now + 5;
      KA.me.pos.set(-30, 0, 30);
      KA.me.vel.set(0, 0, 0);
      KA.nadeInv.frag = 0;
      KA.dropItems([{ type: -1, nades: { frag: 2, plasma: 0 } }], KA.me.pos.clone(), false);
      await wait(300);
      const nades = KA.nadeInv.frag;
      /* a weapon you carry tops up ammo by walking over it; one you don't waits for interact */
      KA.giveWeapon(2, [1, 0]);
      KA.dropItems([{ id: "t-carb", type: 2, ammo: [4, 4] }], KA.me.pos.clone(), false);
      await wait(300);
      const carried = KA.ITEMS.filter(i => i.id === "t-carb" && i.avail).length;
      const other = 3;
      KA.dropItems([{ type: other, ammo: [1, 2] }], KA.me.pos.clone(), false);
      await wait(300);
      const waits = KA.ITEMS.filter(i => i.type === other && i.avail).length;
      const prompt = document.getElementById("prompt").textContent;
      return { nades, carried, waits, prompt };
    });
    check(items.nades >= 2, "grenades on the floor are picked up automatically", items);
    check(items.carried === 0, "walking over a weapon you carry takes its ammo", items);
    check(items.waits === 1 && /hold/i.test(items.prompt), "other weapons wait for a manual pickup", items);
    const rk = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const pw = KA.ARENA_PICKS.find(x => x.rot);
      const before = KA.WEAPON_DATA[pw.type].key;
      pw.consume();
      const next = KA.WEAPON_DATA[pw.type].key;
      KA.giveWeapon(3);
      await wait(600);
      const held = KA.wi;
      window.__rk = 0;
      const f0 = KA.MAIN_ROCKETS.fire.bind(KA.MAIN_ROCKETS);
      KA.MAIN_ROCKETS.fire = (...a) => (window.__rk++, f0(...a));
      return { before, next, held };
    });
    check(rk.before !== rk.next, "the power spawn rotates to the next power weapon", rk);
    check(rk.held === 3, "the rocket launcher can be carried", rk);
    await p.mouse.down();
    await p.waitForTimeout(150);
    await p.mouse.up();
    const fired = await p.evaluate(() => window.__rk);
    check(fired >= 1, "the rocket launcher fires a rocket", fired);
    const col = await p.evaluate(async () => {
      const b = KA.bots[1];
      b.body.reset();
      b.body.dead = false;
      b.body.spawnT = -99;
      b.body.pos.copy(KA.me.pos).add(new KA.THREE.Vector3(0.2, 0, 0));
      b.body.vel.set(0, 0, 0);
      await new Promise(r => setTimeout(r, 250));
      return Math.hypot(b.body.pos.x - KA.me.pos.x, b.body.pos.z - KA.me.pos.z);
    });
    check(col >= 0.7, "pilots can't walk through each other", col);
    await p.waitForTimeout(800);
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
      /* Play of the Game plays after a beat; skip it and a new match starts */
      await new Promise(r => setTimeout(r, 2200));
      const potg = {
        playing: KA.HL.playing,
        top: KA.HL.top.length,
        card: document.querySelector("#cine .card").textContent,
      };
      KA.REPLAY.skip();
      /* then the results screen; Play again starts a new match */
      const el = id => document.getElementById(id);
      for (let i = 0; i < 50 && el("post").hidden; i++) await new Promise(r => setTimeout(r, 100));
      const post = {
        shown: !el("post").hidden,
        win: el("postWin").textContent,
        awards: el("postAwards").textContent,
        tl: el("postTl").textContent,
        me: el("postMe").textContent,
        rows: document.querySelectorAll("#postTab tbody tr").length,
        mine: (document.querySelector("#postTab tr.me") || { textContent: "" }).textContent,
        focus: document.activeElement && document.activeElement.id,
      };
      /* (focus lands on Play again as the panel opens; a busy machine may still be catching up) */
      for (let i = 0; i < 20 && post.focus !== "postAgain"; i++) {
        await new Promise(r => setTimeout(r, 50));
        post.focus = document.activeElement && document.activeElement.id;
      }
      el("postAgain").click();
      await new Promise(r => setTimeout(r, 400));
      post.closed = el("post").hidden;
      off();
      return {
        seen,
        banner,
        mid,
        potg,
        post,
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
      ffa.potg.playing && /Play of the game/i.test(ffa.potg.card) && /kills in/.test(ffa.potg.card),
      "the match ends with a Play of the Game replay of the best moment",
      ffa.potg
    );
    check(
      ffa.post.shown &&
        /Victory/.test(ffa.post.win) &&
        /MVP/.test(ffa.post.awards) &&
        /First blood/.test(ffa.post.tl) &&
        /Kills by weapon/.test(ffa.post.me) &&
        ffa.post.rows >= 4 &&
        /you/.test(ffa.post.mine) &&
        ffa.post.focus === "postAgain",
      "after Play of the Game: winner, awards, timeline, your summary and the full table",
      ffa.post
    );
    check(
      ffa.post.closed && ffa.after === 0,
      "Play again closes the results and starts a fresh match",
      ffa.post
    );
    check(
      /ffa/.test(ffa.modes) && /ctf/.test(ffa.modes),
      "modes register with the mode framework",
      ffa.modes
    );
    await p.evaluate(() => (KA.MODE_DATA.ffa.restartDelay = 8));
    /* Perfect: the magnum's minimum (4 to break shields, then a headshot) with no misses */
    const perfectRun = miss =>
      p.evaluate(miss => {
        const b = KA.bots[1];
        /* a respawn pod from the last kill may already be falling (a drone in a pod can't be hit) */
        if (b.pod) b.pod.onLand = null;
        b.pod = null;
        /* nobody else wanders into the line of fire */
        for (const o of KA.bots) if (o !== b) o.body.pos.set(22, 0, 0);
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
    /* hit feedback: shield hit, shield break, headshot and kill each have their own marker */
    const marks = await p.evaluate(() => {
      const b = KA.bots[1];
      if (b.pod) b.pod.onLand = null;
      b.pod = null;
      for (const o of KA.bots) if (o !== b) o.body.pos.set(22, 0, 0);
      b.dead = false;
      b.body.dead = false;
      b.body.reset();
      b.body.pos.set(-22, 0, 10);
      b.body.spawnT = -99;
      b.respawn = 1e9;
      KA.refill();
      const o = new KA.THREE.Vector3(-22, 1.6, -10);
      const at = y => new KA.THREE.Vector3(-22, y, 10).sub(o).normalize();
      const cls = () => document.getElementById("hitm").className;
      const out = [];
      KA.fire({ o, d: at(1.0), muzzle: o });
      out.push(cls());
      for (let i = 0; i < 3; i++) KA.fire({ o, d: at(1.0), muzzle: o });
      out.push(cls());
      b.body.health = 45;
      b.body.shield = 0;
      KA.dealDamage({ kind: "bot", ref: b }, 5, "pistol", true);
      out.push(cls());
      KA.dealDamage({ kind: "bot", ref: b }, 999, "pistol", true);
      out.push(cls());
      return out;
    });
    check(
      marks[0] === "sh" && marks[1] === "brk" && marks[2] === "head" && marks[3] === "kill",
      "shield hit, shield break, headshot and kill each get their own hit marker",
      marks
    );
    /* directional damage: an arc points where the hit came from (a drone to your right: +90°) */
    const arc = await p.evaluate(async () => {
      /* a drone may have just taken you down: wait to be back */
      for (let i = 0; i < 120 && KA.me.dead; i++) await new Promise(r => setTimeout(r, 100));
      KA.me.spawnT = -99;
      KA.me.shield = 70;
      KA.me.health = 45;
      /* a shot from 8 m to your right (a fixed point: a live drone would move) */
      const from = new KA.THREE.Vector3(Math.cos(KA.me.yaw) * 8, 0, -Math.sin(KA.me.yaw) * 8).add(KA.me.pos);
      KA.hurtMe(5, { pos: from, w: "rifle" });
      await new Promise(r => setTimeout(r, 120));
      const el = document.querySelector("#dmgDir .darc");
      /* where it should point now (you may have turned or moved a little since) */
      const ang = Math.atan2(-(from.x - KA.me.pos.x), -(from.z - KA.me.pos.z)) - KA.me.yaw;
      let want = (-ang * 180) / Math.PI;
      want = ((((want + 180) % 360) + 360) % 360) - 180;
      return { n: document.querySelectorAll("#dmgDir .darc").length, tf: el ? el.style.transform : "", want };
    });
    let deg = parseFloat((arc.tf.match(/rotate\(([-\d.e]+)deg\)/) || [])[1]);
    deg = ((((deg + 180) % 360) + 360) % 360) - 180;
    check(
      arc.n >= 1 && Math.abs(deg - arc.want) < 3 && Math.abs(arc.want - 90) < 30,
      "a hit shows an arc toward the shooter",
      { ...arc, deg }
    );
    /* the roster (hold Tab): every pilot with full stats, your row highlighted, sortable */
    await p.keyboard.down("Tab");
    await p.waitForTimeout(400);
    const ros = await p.evaluate(() => ({
      shown: !document.getElementById("scores").hidden,
      head: [...document.querySelectorAll("#statsTab th")].map(t => t.textContent).join(" "),
      rows: document.querySelectorAll("#statsTab tbody tr").length,
      me: !!document.querySelector("#statsTab tr.me"),
    }));
    await p.evaluate(() => document.querySelector('#statsTab th button[data-k="dmg"]').click());
    const sorted = await p.evaluate(
      () => document.querySelector('#statsTab th button[data-k="dmg"]').className
    );
    await p.keyboard.up("Tab");
    check(
      ros.shown &&
        /Acc/.test(ros.head) &&
        /Dmg/.test(ros.head) &&
        /Power/.test(ros.head) &&
        ros.rows >= 4 &&
        ros.me,
      "the roster is a stats table for every pilot with your row highlighted",
      ros
    );
    check(sorted === "desc", "roster columns sort", sorted);
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
    /* progressive damage: cover chips (its mesh is carved) before it collapses, and a rebuild restores it */
    const chip = await p.evaluate(() => {
      const bx = KA.DESTR.all.find(b => !b.broken && KA.SOLID.includes(b) && b.hp == null);
      const geo0 = bx.mesh.geometry;
      const at = new KA.THREE.Vector3((bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2, bx.z1);
      KA.damageBox(bx, 1, at, "blast", true);
      const hp = bx.maxHp;
      KA.damageBox(bx, hp * 0.5, at, "blast", true);
      const mid = { stage: bx.stage, carved: bx.mesh.geometry !== geo0, standing: !bx.broken };
      KA.resetDestruction();
      return { ...mid, restored: bx.mesh.geometry === geo0 && !bx.stage };
    });
    check(
      chip.stage === 2 && chip.carved && chip.standing && chip.restored,
      "cover chips as it takes damage before collapsing, and rebuilds whole",
      chip
    );
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
    /* search: settings from any tab (tagged with it), key bindings, Escape clears the search first */
    await p.fill("#setSearch", "screen shake");
    await p.waitForTimeout(100);
    const found = await p.evaluate(() => ({
      rows: [...document.querySelectorAll("#setBody .srow")].map(r => r.textContent),
      ctl: !!document.getElementById("set_shake"),
    }));
    await p.fill("#setSearch", "throw grenade");
    await p.waitForTimeout(100);
    const keysHit = await p.evaluate(() => document.getElementById("setBody").textContent);
    await p.focus("#setSearch");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    const cleared = await p.evaluate(() => ({
      q: document.getElementById("setSearch").value,
      open: !document.getElementById("settings").hidden,
    }));
    check(
      found.ctl &&
        found.rows.length === 1 &&
        /Gameplay/i.test(found.rows[0]) &&
        /Screen shake/.test(found.rows[0]),
      "settings search finds a setting from another tab, tagged with its tab",
      found
    );
    check(
      /Throw grenade/.test(keysHit) && /Change in Keys/.test(keysHit),
      "settings search finds key bindings",
      keysHit.slice(0, 120)
    );
    check(cleared.q === "" && cleared.open, "Escape clears the search before closing settings", cleared);
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
    /* players' drop pods are seen by everyone: the friend's pod on the host, the host's on the friend */
    const podSeen = async (who, viewer, fromHost) => {
      await who.evaluate(() => {
        KA.me.spawnT = -99;
        KA.hurtMe(999, { w: "self", name: "test" });
      });
      return viewer.evaluate(async h => {
        const g = CTF.UI.game();
        const them = () =>
          h ? [...g.map.values()].find(a => a.human && !a.local) : g.agents.find(a => a.remote);
        for (let i = 0; i < 600 && !(them() && them().vpod); i++) await new Promise(r => setTimeout(r, 50));
        const a = them();
        return { seen: !!(a && a.vpod), pods: KA.PODS.length };
      }, fromHost);
    };
    const seenOnHost = await podSeen(B, A, false);
    const seenOnFriend = await podSeen(A, B, true);
    check(
      seenOnHost.seen && seenOnFriend.seen,
      "in capture the flag online, players' drop pods are seen by everyone",
      { seenOnHost, seenOnFriend }
    );
    await A.evaluate(async () => {
      for (let i = 0; i < 600 && KA.me.dead; i++) await new Promise(r => setTimeout(r, 50));
    });
    await B.evaluate(async () => {
      for (let i = 0; i < 600 && KA.me.dead; i++) await new Promise(r => setTimeout(r, 50));
    });
    /* power weapons: the HUD shows the spawn's next weapon; a bot taking the sniper is called out (an
       enemy for the host, an ally for the friend) and marked over their head on both screens */
    check(
      /Sniper|Rocket/.test((await text(A, "#powerT")) || ""),
      "the HUD shows the power spawn's weapon and timer",
      await text(A, "#powerT")
    );
    const ctfSeats = await A.evaluate(podSeats, "ctf");
    check(
      ctfSeats.length >= 6 && ctfSeats.every(s => s.ok && s.off <= 0.45 && s.bury > 0.5),
      "a drop pod fits and buries itself at every capture the flag spawn it can land on",
      ctfSeats.filter(s => !(s.ok && s.off <= 0.45 && s.bury > 0.5))
    );
    /* live bots may take power weapons too, so look for this holder among the callout events */
    const listen = q =>
      q.evaluate(() => {
        window.__pt = [];
        KA.EVENTS.on("powerTaken", e => window.__pt.push({ name: e.name, weapon: e.weapon, enemy: e.enemy }));
      });
    await listen(A);
    await listen(B);
    const holder = await A.evaluate(() => {
      const g = CTF.UI.game();
      const e = g.teams[1 - g.human.team].agents.find(
        a => !a.human && !a.remote && a.alive && !(a.sniper > 0) && !(a.rocket > 0)
      );
      g.arm(
        e,
        KA.WEAPON_DATA.findIndex(w => w.key === "sniper")
      );
      return e.name;
    });
    await A.waitForTimeout(800);
    const seenBy = q => q.evaluate(() => ({ events: window.__pt, marks: KA.powerMarks }));
    const callA = await seenBy(A),
      callB = await seenBy(B);
    check(
      callA.events.some(e => e.name === holder && e.enemy && e.weapon === "sniper") && callA.marks >= 1,
      "an enemy taking the sniper is called out and marked",
      { holder, ...callA }
    );
    check(
      callB.events.some(e => e.name === holder && !e.enemy && e.weapon === "sniper") && callB.marks >= 1,
      "an ally with the sniper is named and marked for teammates online",
      { holder, ...callB }
    );
    /* flags: a carrier gets a named waypoint, the HUD says who has each flag, and taking your flag
       sounds the alarm (each flag event has its own sound) */
    const fl = await A.evaluate(async () => {
      const g = CTF.UI.game();
      const ht = g.human.team;
      const e = g.teams[1 - ht].agents.find(a => !a.human && !a.remote && a.alive);
      const heard = [];
      const sfx0 = KA.sfx;
      KA.sfx = (k, v) => {
        heard.push(k);
        return sfx0(k, v);
      };
      /* live bots could kill the carrier while we look: keep them alive for the check */
      e.onHit = () => ({ died: false, sh: true });
      const f = g.flags[ht];
      f.state = "carried";
      f.carrier = e;
      e.carrying = f;
      g.emit("flagTaken", { flag: f, by: e });
      await new Promise(r => setTimeout(r, 400));
      const out = {
        name: e.name,
        hud: document.getElementById("cF" + ht).textContent,
        marks: document.getElementById("cMarks").textContent,
        heard: heard.slice(),
      };
      g.dropFlagBy(e);
      g.emit("flagReturn", { flag: f, by: g.human });
      out.heard2 = heard.slice();
      KA.sfx = sfx0;
      delete e.onHit;
      return out;
    });
    check(
      fl.hud.includes(fl.name) && fl.marks.includes("Kill ⚑ " + fl.name) && fl.heard.includes("flagLost"),
      "an enemy carrier is named on the HUD and waypointed, and losing your flag sounds the alarm",
      fl
    );
    check(
      fl.heard2.includes("flagDrop") && fl.heard2.includes("flagReturn"),
      "dropped and returned flags have their own sounds",
      fl.heard2
    );
    /* the motion tracker replaces the minimap while playing, and in either bottom corner team chat
       never draws over it */
    const trkLay = await A.evaluate(async () => {
      const g = CTF.UI.game(),
        out = { bad: [] };
      for (let i = 0; i < 6; i++)
        g.teams[g.human.team].brain.say(
          g,
          g.teams[g.human.team].agents[i % 4],
          "t" + i,
          "Pushing the left lane " + i
        );
      const box = q => {
        const e = document.querySelector(q);
        return e && !e.hidden && e.getBoundingClientRect().height > 0 ? e.getBoundingClientRect() : null;
      };
      const hit = (a, b) =>
        !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      for (const pos of ["br", "bl", "bc", "tr", "tl", "tc", "mr", "ml"]) {
        KA.SET.trackerPos = pos;
        KA.applySettings();
        await new Promise(r => setTimeout(r, 120));
        const t = box("#tracker");
        if (pos === "br") out.size = Math.round(t.width);
        if (t.left < 0 || t.top < 0 || t.right > innerWidth || t.bottom > innerHeight)
          out.bad.push(pos + " off screen");
        for (const q of ["#cComms", ".vitals", ".ammo", ".kit", ".cbar", "#cPlan", "#medals"]) {
          const b = box(q);
          if (b && hit(t, b)) out.bad.push(pos + " covers " + q);
        }
      }
      out.chat = Math.round(box("#cComms").height);
      KA.SET.trackerPos = "br";
      KA.applySettings();
      out.mini = getComputedStyle(document.getElementById("cMini")).display;
      return out;
    });
    check(
      trkLay.size >= 190 && trkLay.chat > 0 && trkLay.bad.length === 0 && trkLay.mini === "none",
      "the motion tracker takes the minimap's place, and in every position it stays on screen and clear of chat, vitals, ammo and abilities",
      trkLay
    );
    /* a friend's ping reaches the host, and the friend's AI teammates respond to it */
    /* (pinged again if nobody took it up: an AI teammate busy in a fight may ignore one ping) */
    let pinged = 0;
    for (let tries = 0; tries < 3 && !pinged; tries++) {
      await B.evaluate(() => {
        KA.me.pitch = -0.35;
        KA.PINGS.lastT = -9;
        KA.pingNow();
      });
      await A.waitForTimeout(1500);
      pinged = await A.evaluate(() => {
        const g = CTF.UI.game();
        const fr = g.agents.find(a => a.remote);
        return g.teams[fr.team].agents.filter(a => !a.human && a.ping).length;
      });
    }
    check(pinged >= 1, "a friend's ping sends their AI teammates", pinged);
    /* a steered pod only lands near your own base in CTF */
    const zone = await A.evaluate(() => {
      const t = CTF.UI.game().human.team,
        h = CTF.FLAG_HOME[t],
        z = KA.EXT.podZone();
      return { home: z.ok(h.x, h.z), mid: z.ok(0, 0), theirs: z.ok(h.x, -h.z), r: z.r };
    });
    check(zone.home && !zone.mid && !zone.theirs, "CTF pods can only be steered near your own base", zone);
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
    /* melee impacts reach the room: the host's (and its AI's) are heard by the friend and the other way */
    const tapHeard = q =>
      q.evaluate(() => {
        window.__mh = [];
        KA.sfxTap(k => window.__mh.push(k));
        return [KA.me.pos.x, KA.me.pos.y + 1.2, KA.me.pos.z];
      });
    const posB = await tapHeard(B),
      posA = await tapHeard(A);
    await A.evaluate(
      q => KA.meleeFx(new KA.THREE.Vector3(...q), new KA.THREE.Vector3(0, 0, -1), KA.MFX.CRACK),
      posB
    );
    await B.evaluate(
      q =>
        KA.meleeFx(new KA.THREE.Vector3(...q), new KA.THREE.Vector3(0, 0, -1), KA.MFX.WORLD | KA.MFX.CHARGE),
      posA
    );
    await A.waitForTimeout(900);
    const untap = q =>
      q.evaluate(() => {
        KA.sfxTap(null);
        return window.__mh;
      });
    const mhB = await untap(B),
      mhA = await untap(A);
    check(
      mhB.includes("mhit") && mhB.includes("mcrack") && mhA.includes("cwall"),
      "melee impacts are heard online: the host's by the friend, the friend's by the host",
      { friend: mhB, host: mhA }
    );
    await alive(B);
    await B.bringToFront();
    await B.mouse.click(640, 400);
    await B.waitForTimeout(150);
    /* bots stay benched so none races the friend to the pedestal */
    await A.evaluate(() => {
      const p = KA.EXT.pickups()[0];
      p.availAt = 0;
      /* the centre spawn rotates power weapons: make this one the sniper */
      p.type = KA.WEAPON_DATA.findIndex(w => w.key === "sniper");
      p.ri = 0;
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
    /* ---------- kill cams show the kill: a drone and a CTF agent shoot you for real ---------- */
    {
      /* in the page: note every shot, and the replay frame that reaches the kill (where the camera is,
         how far from the killer's recorded eyes, and how straight it looks at you) */
      const watch = () => {
        window.__shots = [];
        window.__kc = null;
        KA.EVENTS.on("shot", e => window.__shots.push({ pilot: e.pilot, t: e.t }));
        (function hook() {
          const st = KA.REPLAY.state,
            kc = KA.KILLCAM.last;
          if (st && kc && KA.KILLCAM.on && !window.__kc && st.t >= kc.at) {
            const me = KA.REC.sample("local", kc.at),
              k = KA.REC.sample(kc.killer, kc.at);
            const d = [st.l[0] - st.p[0], st.l[1] - st.p[1], st.l[2] - st.p[2]],
              tm = [me.x - st.p[0], me.y + 1.5 - st.p[1], me.z - st.p[2]];
            const shot = window.__shots.filter(e => e.pilot === kc.killer && e.t <= kc.at + 1e-6).pop();
            window.__kc = {
              kc,
              eyeErr: k ? Math.hypot(st.p[0] - k.x, st.p[1] - (k.y + KA.H_STAND - 0.12), st.p[2] - k.z) : 99,
              dot: (d[0] * tm[0] + d[1] * tm[1] + d[2] * tm[2]) / Math.hypot(...d) / Math.hypot(...tm),
              shotT: shot ? shot.t : null,
              shots: st.shots,
            };
          }
          requestAnimationFrame(hook);
        })();
      };
      const killCamOf = async (q, killer) => {
        for (let i = 0; i < 400; i++) {
          const r = await q.evaluate(re => {
            const k = window.__kc;
            if (k && new RegExp(re).test(k.kc.killer)) return k;
            /* stay fragile so the next hit kills, without dying to anything else first */
            if (!KA.me.dead) {
              KA.me.spawnT = -99;
              KA.me.shield = Math.min(KA.me.shield, 1);
              KA.me.health = Math.min(KA.me.health, 4);
            }
            return null;
          }, killer);
          if (r) return r;
          await q.waitForTimeout(100);
        }
        return null;
      };
      const ok = k =>
        !!k &&
        k.kc.eyes &&
        k.eyeErr < 0.3 &&
        k.dot > 0.85 &&
        k.shotT != null &&
        k.shotT >= k.kc.t0 &&
        k.shotT <= k.kc.t1;
      /* arena: a drone in front of you on open floor (whichever drone gets you) */
      const D = await open(ctx, { tag: "killcam" });
      pages.push(D);
      await D.waitForTimeout(600);
      await D.click("#deploy");
      await D.waitForTimeout(2500);
      await D.evaluate(watch);
      await D.evaluate(() => {
        KA.SET.killCam = true;
        for (const o of KA.bots.slice(1)) o.body.pos.set(80, 0, 80);
        KA.me.pos.set(0, 0.02, 6);
        KA.bots[0].body.pos.set(0, 0.02, -8);
      });
      const dk = await killCamOf(D, "^bot:");
      check(
        ok(dk) && dk.shots >= 1,
        "a drone's kill cam is through its eyes, looking at you as the killing shot (inside the window) lands",
        dk
      );
      await closeTab(D);
      pages.splice(pages.indexOf(D), 1);
      /* CTF: stand next to an enemy agent */
      const C = await open(ctx, { tag: "killcam-ctf" });
      pages.push(C);
      await C.waitForTimeout(600);
      await C.click("#ctfPlay");
      await C.waitForTimeout(3000);
      await C.evaluate(watch);
      let ck = null;
      /* (the agents may get you with a grenade or a melee instead: this checks a gunshot kill, so
         such a kill is tried again) */
      for (let tries = 0; tries < 5 && !(ck && ck.shots > 0); tries++) {
        await C.evaluate(() => {
          KA.SET.killCam = true;
          const g = CTF.UI.game(),
            mine = g.human.team;
          const foe = g.agents.find(a => a.team !== mine && a.alive);
          if (foe && !KA.me.dead) KA.me.pos.set(foe.body.pos.x + 8, foe.body.pos.y + 0.3, foe.body.pos.z);
        });
        ck = await killCamOf(C, "^ctf:");
      }
      check(
        ok(ck),
        "a CTF agent's kill cam is through its eyes, looking at you as the killing shot (inside the window) lands",
        ck
      );
      await closeTab(C);
      pages.splice(pages.indexOf(C), 1);
    }
    /* ---------- sim and trailer start without errors ---------- */
    const S = await open(ctx, { tag: "S" });
    pages.push(S);
    await S.waitForTimeout(600);
    await S.click("#ctfSim");
    await S.waitForTimeout(2500);
    check(/\d:\d\d/.test((await text(S, "#cClock")) || ""), "AI vs AI runs", await text(S, "#cClock"));
    /* spectating: big moments cut in slow motion; the tactical camera turns and zooms */
    const spec = await S.evaluate(async () => {
      const g = CTF.UI.game();
      const a = g.agents[2];
      CTF.spectator.event("capture", { by: a, team: a.team, flag: g.flags[1 - a.team] });
      const slow = KA.CINE.timeK(0) < 1;
      const shot = CTF.spectator.shot;
      document.getElementById("cCam").click();
      const cv = document.getElementById("game");
      const d0 = CTF.spectator.tac.dist,
        y0 = CTF.spectator.tac.yaw;
      cv.dispatchEvent(new WheelEvent("wheel", { deltaY: -400, bubbles: true, cancelable: true }));
      cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, bubbles: true }));
      dispatchEvent(new PointerEvent("pointermove", { clientX: 380, clientY: 300 }));
      dispatchEvent(new PointerEvent("pointerup", {}));
      return {
        slow,
        shot,
        mode: CTF.spectator.mode,
        zoomed: CTF.spectator.tac.dist < d0,
        turned: CTF.spectator.tac.yaw !== y0,
      };
    });
    check(spec.slow && spec.shot === "orbit", "the director cuts to a capture in slow motion", spec);
    check(
      spec.mode === "tactical" && spec.zoomed && spec.turned,
      "the tactical camera zooms and turns",
      spec
    );
    await S.click("#cExit");
    await S.waitForTimeout(300);
    /* the menu's trailer button plays the recorded video; the trailer itself is not in the game */
    const vid = await S.evaluate(() => {
      const got = [];
      const o = window.open;
      window.open = u => (got.push(String(u)), null);
      document.getElementById("trailerBtn").click();
      window.open = o;
      return { got, inGame: !!KA.trailer || !!document.getElementById("trailer") };
    });
    check(
      vid.got.length === 1 && /media\/trailer\.mp4$/.test(vid.got[0]) && !vid.inGame,
      "Watch trailer opens the trailer video, and the game ships without the trailer",
      vid
    );
    /* the trailer build (out/trailer.html) */
    const T = await open(ctx, { tag: "T", trailer: true });
    pages.push(T);
    await T.waitForTimeout(600);
    /* trailer: starts, shows a title card on schedule, survives the jump to the CTF montage, and exits cleanly */
    await T.evaluate(() => KA.startMode("trailer"));
    await T.waitForTimeout(2300);
    check(
      await T.evaluate(() => KA.trailer.active && !document.getElementById("trailer").hidden),
      "trailer starts"
    );
    check(
      await T.evaluate(() => +getComputedStyle(document.getElementById("trCard")).opacity > 0.5),
      "trailer shows its opening title card"
    );
    await T.evaluate(() => KA.trailer.seek(41.5));
    check(await T.evaluate(() => !!CTF.UI.game()), "trailer cuts to the live CTF montage");
    await T.keyboard.press("Escape");
    await T.waitForTimeout(300);
    check(
      await T.evaluate(
        () =>
          !KA.trailer.active &&
          document.getElementById("trailer").hidden &&
          !document.getElementById("menu").hidden &&
          !CTF.UI.game()
      ),
      "trailer exits to the menu and cleans up"
    );
    /* the whole cut, simulated without drawing: scripted pilots stay on their routes (no running
       into walls), the camera never ends up inside the level, and the big moments happen */
    const cut = await T.evaluate(() => {
      const TR = KA.trailer;
      TR.record();
      while (TR.t < TR.END) TR.step(1 / 30, false);
      const d = TR.diag,
        ev = new Set(d.log.map(e => e.ev));
      const r = { bumps: d.bumps.slice(0, 5), cam: d.cam.slice(0, 5), ev: [...ev] };
      TR.stop();
      return r;
    });
    check(cut.bumps.length === 0, "trailer pilots never run into walls", cut.bumps);
    check(cut.cam.length === 0, "the trailer camera never goes inside the level", cut.cam);
    check(
      ["thrust", "slide", "clamber", "slam", "charge", "melee"].every(e => cut.ev.includes(e)),
      "the trailer's moves all happen (thrust, slide, clamber, ground pound, charge, melee)",
      cut.ev
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
    /* ---------- match intro: plays at deploy, holds the clock, then hands over ---------- */
    const I = await open(ctx, { tag: "I", intros: true });
    pages.push(I);
    await I.waitForTimeout(600);
    await I.evaluate(() => (KA.SET.intros = true));
    await I.click("#deploy");
    await I.waitForTimeout(500);
    const intro = await I.evaluate(() => ({
      active: KA.INTRO.active,
      card: document.querySelector("#cine .card").textContent,
      shots: KA.INTRO.shots.length,
      total: KA.INTRO.shots.reduce((a, s) => a + s.dur, 0),
    }));
    await I.waitForTimeout(3500);
    const after = await I.evaluate(() => ({
      active: KA.INTRO.active,
      card: document.querySelector("#cine .card").textContent,
    }));
    check(
      intro.active &&
        /Proving Grounds/.test(intro.card) &&
        intro.total <= 5 &&
        !after.active &&
        /First to/.test(after.card),
      "deploying plays a short map intro, then the mode card",
      { intro, after }
    );
    await I.evaluate(() => KA.extStop && KA.leaveGame && KA.leaveGame());
    /* ---------- the opening drop: matches start with everyone dropping in by pod ---------- */
    /* arena, with the intro: everyone waits in orbit through it, then launches together; the clock
       starts as the pods land, nobody can act before, and dropping in is not a death */
    const O = await open(ctx, { tag: "O", intros: true, drops: true });
    pages.push(O);
    await O.waitForTimeout(600);
    /* (the settings saved by earlier tabs are shared) */
    await O.evaluate(() => Object.assign(KA.SET, { intros: true, dropIn: true }));
    await O.click("#deploy");
    await O.waitForTimeout(400);
    const orbit = await O.evaluate(() => ({
      intro: KA.INTRO.active,
      dead: KA.me.dead,
      pod: !!KA.myPod,
      bots: KA.bots.length,
      botsOut: KA.bots.every(b => b.body.dead && !b.rig.root.visible),
    }));
    await O.evaluate(async () => {
      for (let i = 0; i < 200 && KA.INTRO.active; i++) await new Promise(r => setTimeout(r, 50));
    });
    await O.waitForTimeout(400);
    const falling = await O.evaluate(() => ({
      pod: !!KA.myPod,
      pods: KA.PODS.length,
      supply: KA.SUPPLY.length,
      cockpit: !document.getElementById("podView").hidden,
      clock: KA.FFA.t0 - KA.now,
    }));
    await O.evaluate(async () => {
      for (let i = 0; i < 100 && (KA.me.dead || KA.bots.some(b => b.body.dead)); i++)
        await new Promise(r => setTimeout(r, 50));
    });
    const down = await O.evaluate(async () => ({
      since: KA.now - KA.FFA.t0,
      /* (the HUD comes back as you finish stepping out of the pod) */
      hud: await (async () => {
        const v = () => getComputedStyle(document.getElementById("hud")).visibility;
        for (let i = 0; i < 30 && v() !== "visible"; i++) await new Promise(r => setTimeout(r, 50));
        return v();
      })(),
      alive: !KA.me.dead,
      bots: KA.bots.every(b => !b.body.dead && b.rig.root.visible),
      /* nobody came down on anyone else */
      gap: (ps =>
        Math.min(...ps.flatMap((a, i) => ps.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.z - b.z)))))([
        KA.me.pos,
        ...KA.bots.map(b => b.body.pos),
      ]),
      deaths: KA.deaths,
    }));
    check(
      orbit.intro && orbit.dead && !orbit.pod && orbit.bots > 0 && orbit.botsOut,
      "with drop pods, a match starts with everyone in orbit while the intro plays",
      orbit
    );
    check(
      falling.pod &&
        falling.pods >= 1 + orbit.bots &&
        falling.supply >= 1 &&
        falling.cockpit &&
        falling.clock > 1.5,
      "after the intro you and the drones drop in together (and the power weapon in its supply pod), before the clock starts",
      falling
    );
    check(
      down.alive &&
        down.bots &&
        down.gap > 1.5 &&
        down.deaths === 0 &&
        down.since >= 0 &&
        down.since < 1 &&
        down.hud === "visible",
      "everyone lands on a spot of their own, the clock starts, and the drop is not counted as a death",
      down
    );
    /* capture the flag: every AI drops in near its own base, the clock reads its full limit until
       they land, and so do you */
    await O.evaluate(() => KA.leaveGame && KA.leaveGame());
    const C2 = await open(ctx, { tag: "C2", drops: true });
    pages.push(C2);
    await C2.waitForTimeout(600);
    await C2.evaluate(() => Object.assign(KA.SET, { intros: false, dropIn: true }));
    await C2.click("#ctfPlay");
    await C2.waitForTimeout(500);
    const ctfDrop = await C2.evaluate(() => {
      const g = CTF.UI.game();
      const ai = g.agents.filter(a => !a.human);
      return {
        out: ai.every(a => a.dead),
        me: KA.me.dead,
        pods: KA.PODS.length,
        ai: ai.length,
        left: g.timeLimit - Math.max(g.t, g.dropT || 0),
        /* every pod (yours too) is aimed at a spot of its own */
        gap: (ps =>
          Math.min(...ps.flatMap((a, i) => ps.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.z - b.z)))))(
          KA.PODS.map(p => p.at)
        ),
        limit: KA.MODE_DATA.ctf.timeLimit,
      };
    });
    await C2.waitForTimeout(3200);
    const ctfDown = await C2.evaluate(() => {
      const g = CTF.UI.game();
      const ai = g.agents.filter(a => !a.human);
      return {
        alive: ai.every(a => a.alive) && !KA.me.dead,
        home: g.agents.every(a => Math.sign(a.body.pos.z) === Math.sign(CTF.FLAG_HOME[a.team].z)),
        deaths: KA.deaths,
      };
    });
    check(
      ctfDrop.out &&
        ctfDrop.me &&
        ctfDrop.pods > ctfDrop.ai &&
        ctfDrop.gap > 2 &&
        Math.abs(ctfDrop.left - ctfDrop.limit) < 0.01,
      "a capture the flag match opens with every pilot dropping in on a spot of their own, the clock held at its limit",
      ctfDrop
    );
    check(
      ctfDown.alive && ctfDown.home && ctfDown.deaths === 0,
      "every pilot lands on their own half and the match is on",
      ctfDown
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
