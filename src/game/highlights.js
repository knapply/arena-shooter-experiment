/* ============ HIGHLIGHTS and PLAY OF THE GAME ============
   Every kill, capture and return is scored as a possible highlight (multikills, sprees, power-move
   kills, captures). The best few keep a saved clip of the recording around them (the rolling
   recording only holds 45 s). When a match ends, the top moment plays as a cinematic replay:
   letterbox, a title card with the player and the feat, first-person with slow motion on the key
   kills, then an orbit. Each player's game picks from what it saw, so online players see the same
   moment in nearly every match. Jump skips it. */
const HL = { top: [], pending: [], chains: new Map(), sprees: new Map(), playing: false };
const HL_KEEP = 3,
  HL_BEFORE = 6,
  HL_AFTER = 1.4;
const HL_POWER = new Set(["sniper", "pound", "charge", "stick", "frag", "melee"]);
function hlConsider(c) {
  const worst = HL.top.length < HL_KEEP ? -1 : HL.top[HL.top.length - 1].score;
  if (c.score <= worst) return;
  /* a newer, better moment by the same player replaces their older one if they overlap */
  HL.pending = HL.pending.filter(p => !(p.pilot === c.pilot && c.t - p.t < HL_BEFORE));
  HL.pending.push(c);
}
EVENTS.on("matchStart", () => {
  HL.top = [];
  HL.pending = [];
  HL.chains.clear();
  HL.sprees.clear();
});
EVENTS.on("kill", e => {
  if (e.mode && /spectate|trailer/.test(e.mode)) return;
  HL.sprees.set(e.victim, 0);
  if (!e.killer || e.killer === "world" || e.killer === e.victim) return;
  const ch = (HL.chains.get(e.killer) || []).filter(t => e.t - t < 4.5);
  ch.push(e.t);
  HL.chains.set(e.killer, ch);
  const spree = (HL.sprees.get(e.killer) || 0) + 1;
  HL.sprees.set(e.killer, spree);
  const multi = ch.length;
  let score = 2 + (e.head ? 1 : 0) + (HL_POWER.has(e.weapon) ? 2 : 0);
  let feat = e.head ? "Headshot" : "Kill";
  if (multi >= 2) {
    score += 6 * Math.pow(multi - 1, 1.4);
    feat =
      ["", "", "Double kill", "Triple kill", "Overkill", "Killtacular"][Math.min(5, multi)] +
      ` · ${multi} kills in ${(e.t - ch[0]).toFixed(1)} s`;
  }
  if (spree >= 5 && spree % 5 === 0) {
    score += 4 + spree;
    if (multi < 2) feat = `Killing spree · ${spree} kills`;
  }
  hlConsider({ score, t: e.t, pilot: e.killer, name: e.killerName, feat, kills: ch.slice() });
});
EVENTS.on("capture", e =>
  hlConsider({ score: 14, t: e.t, pilot: e.pilot, name: e.pilotName, feat: "Flag capture", kills: [e.t] })
);
EVENTS.on("flagReturn", e =>
  hlConsider({ score: 5, t: e.t, pilot: e.pilot, name: e.pilotName, feat: "Flag return", kills: [e.t] })
);
/** per frame: once a candidate's "after" window has been recorded, save its clip */
function hlTick() {
  for (const c of HL.pending.slice())
    if (now - c.t >= HL_AFTER || now < c.t) {
      HL.pending.splice(HL.pending.indexOf(c), 1);
      const clip = REC.clip(c.t - HL_BEFORE, c.t + HL_AFTER);
      if (clip.length < 20 || !clip.some(f => f.poses.has(c.pilot))) continue;
      c.clip = clip;
      /* what was drawn and who went down, so the replay shows the shots, blasts and kills too */
      c.fx = REC.fxRange(clip[0].t - 0.5, clip[clip.length - 1].t);
      c.events = EVENTS.recent(400).filter(
        e =>
          (e.type === "kill" || e.type === "damage") &&
          e.t >= clip[0].t - 3.2 &&
          e.t <= clip[clip.length - 1].t
      );
      c.meta = REC.metaOf(c.pilot);
      HL.top.push(c);
      HL.top.sort((a, b) => b.score - a.score);
      HL.top.length = Math.min(HL.top.length, HL_KEEP);
    }
}
/** play the best moment of the match; returns false if there is none */
function playOfTheGame(onEnd) {
  const c = HL.top[0];
  if (!c || REPLAY.active) return false;
  const t0 = c.clip[0].t,
    t1 = c.clip[c.clip.length - 1].t,
    orbitAt = t1 - 1.6;
  const near = t => c.kills.some(k => Math.abs(t - k) < 0.35);
  const eyes = eyesShot(c.pilot);
  HL.playing = true;
  sfx("stinger", 0.9);
  CINE.card("Play of the game", c.name || "", c.feat, 2.6);
  REPLAY.play({
    t0,
    t1,
    frames: c.clip,
    fx: c.fx,
    events: c.events,
    subject: c.pilot,
    vmColor: c.meta && c.meta.color,
    caption: "Play of the game",
    /* hidden while we look through their eyes, shown when the camera circles them */
    hide: t => (t0 + t < orbitAt ? [c.pilot] : []),
    /* slow motion on the key kills */
    speed: t => (near(t0 + t) ? 0.4 : 1),
    shot: (t, sample) => {
      if (t < orbitAt) return eyes(t, sample);
      const s = sample(c.pilot, t);
      if (!s) return null;
      /* the last moments from outside, circling the player */
      return Object.assign(
        CINE.orbit(new V3(s.x, s.y + 1.1, s.z), 4.2, 1.4, s.yaw + 0.6, 0.55, 58)(t - orbitAt),
        { smooth: 6 }
      );
    },
    onEnd: skipped => {
      HL.playing = false;
      if (onEnd) onEnd(skipped);
    },
  });
  return true;
}
