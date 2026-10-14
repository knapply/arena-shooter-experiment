/* Screenshots of the mode select menu and of each mode in play, for working on ui/menu.js,
   modes/ctf/ui.js and modes/ctf/modes.js.
     THREE_PATH=... node tools/mode-preview.js [out-dir]
   menu-<mode>: the menu with each mode picked; play-<mode>-<map>: a few seconds into a match (the
   opening drop and intro skipped); carry-flag / carry-skull: carrying in first person; spectate-oddball:
   AI vs AI with the skull carrier marked. Real three.js (software WebGL). */
const fs = require("fs"),
  path = require("path");
const { launch, open } = require("../tests/lib/browser.js");
const out = process.argv[2] || "mode-shots";
if (!process.env.THREE_PATH) {
  console.error("set THREE_PATH to three.js r128's three.min.js");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await launch({ gpu: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await open(ctx, { realThree: true });
  p.on("pageerror", e => console.log("page error:", e.message));
  await p.waitForTimeout(1500);
  const shot = async name => {
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(out, name + ".png") });
    console.log("  " + name);
  };
  /* game time runs fast until cond() holds */
  const until = async (cond, arg, ts = 4, tries = 400) => {
    await p.evaluate(ts => KA.CON.run("timescale " + ts), ts);
    for (let i = 0; i < tries; i++) {
      if (await p.evaluate(cond, arg)) break;
      await p.waitForTimeout(50);
    }
    await p.evaluate(() => KA.CON.run("timescale 1"));
  };
  for (const id of ["ctf", "slayer", "ffa", "oddball"]) {
    await p.click("#mode-" + id);
    await shot("menu-" + id);
  }
  /* a phone-sized menu, scrolled to the picker */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => document.getElementById("modeSum").scrollIntoView({ block: "center" }));
  await shot("menu-phone");
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.evaluate(() => document.getElementById("menu").scrollTo(0, 0));
  const play = async (id, map) => {
    await p.click("#mode-" + id);
    await p.selectOption("#mapPick", map).catch(() => {});
    await p.click("#play");
    await p.evaluate(() => KA.CON.run("god on"));
    await until(() => KA.playing && !KA.me.dead && !KA.INTRO.active);
    await until(() => (CTF.UI.game() || { t: 0 }).t > 8, null, 4);
    await p.evaluate(() => KA.CON.run("timescale 0"));
    await shot(`play-${id}-${map}`);
    await p.evaluate(() => KA.CON.run("timescale 1"));
  };
  const leave = async () => {
    await p.evaluate(() => KA.extStop());
    await p.waitForTimeout(400);
  };
  await play("ctf", "ctf");
  /* carrying the flag: take theirs */
  await p.evaluate(() => {
    const g = CTF.UI.game(),
      f = g.flags[1 - g.human.team];
    KA.me.pos.copy(f.pos);
    g.humanTakeFlag(g.human);
  });
  await p.waitForTimeout(400);
  await shot("carry-flag");
  await leave();
  await play("slayer", "arena");
  await leave();
  await play("ffa", "arena");
  await leave();
  await play("oddball", "ctf");
  await until(() => CTF.UI.game().ball.state !== "incoming", null, 4);
  /* whoever has it lets go, and the skull lands at your feet */
  await p.evaluate(() => {
    const g = CTF.UI.game(),
      B = g.ball;
    if (B.carrier) g.dropFlagBy(B.carrier);
    KA.CON.run("god on");
    B.noPick = null;
    B.pos.copy(KA.me.pos);
  });
  await until(() => CTF.UI.game().ball.carrier === CTF.UI.game().human, null, 1, 60);
  await p.evaluate(() => KA.CON.run("timescale 0"));
  await shot("carry-skull");
  await p.evaluate(() => KA.CON.run("timescale 1"));
  await leave();
  await play("oddball", "arena");
  await leave();
  await play("slayer", "ctf");
  await leave();
  await p.click("#mode-oddball");
  await p.click("#watchAI");
  await until(() => {
    const g = CTF.UI.game();
    return g && g.ball && g.ball.state === "carried";
  });
  await p.waitForTimeout(1500);
  await shot("spectate-oddball");
  await leave();
  await b.close();
})();
