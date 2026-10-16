/* ============ HIGHLIGHTS and PLAY OF THE GAME ============
   Every kill, capture and return is scored as a possible highlight (multikills, sprees, power-move
   kills, captures). The best few keep a saved clip of the recording around them (the rolling
   recording only holds 45 s). When a match ends, the top moment plays as a cinematic replay:
   letterbox, a title card with the player and the feat, the play over their shoulder with slow motion
   on the key kills (the Replay view action, V or the controller's Y, switches to their eyes and
   back while it plays; a hint on screen says so), then an orbit. Each player's game picks from what
   it saw, so online players see the same moment in nearly every match. Jump skips it. */
const HL = { top: [], pending: [], chains: new Map(), sprees: new Map(), playing: false, fp: false };
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
  /* the play of the game: over the shoulder or through their eyes */
  if (HL.playing && P("replayView")) {
    HL.fp = !HL.fp;
    CINE.cut();
  }
  hlHint();
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
/** a recorded pose seen from just behind and to the right of its shoulder, looking where it aims.
    Against a wall it tries the left shoulder, then higher and closer, and only then pulls in */
const _hlE = new V3(),
  _hlD = new V3(),
  _hlP = new V3();
const HL_SHOULDER = [
  [2.5, 0.7, 0.32],
  [2.5, -0.7, 0.32],
  [1.7, 0.45, 0.9],
];
function overShoulder(s, fov = 62) {
  const eye = _hlE.set(s.x, s.y + (s.st && s.st.crouch ? H_CROUCH : H_STAND) - 0.12, s.z),
    cp = Math.cos(s.pitch),
    dx = -Math.sin(s.yaw) * cp,
    dy = Math.sin(s.pitch),
    dz = -Math.cos(s.yaw) * cp,
    rx = Math.cos(s.yaw),
    rz = -Math.sin(s.yaw);
  let best = null,
    bestK = -1;
  for (const [back, side, up] of HL_SHOULDER) {
    _hlP.set(eye.x - dx * back + rx * side, eye.y - dy * back * 0.48 + up, eye.z - dz * back + rz * side);
    _hlD.copy(_hlP).sub(eye);
    const L = _hlD.length();
    _hlD.multiplyScalar(1 / L);
    const hit = rayWorld(eye, _hlD, L),
      k = Math.min(1, (hit - 0.25) / L);
    if (k > bestK) {
      bestK = k;
      best = eye.clone().addScaledVector(_hlD, Math.max(0.35, Math.min(L, hit - 0.25)));
    }
    if (k >= 1) break;
  }
  return { p: best, l: new V3(eye.x + dx * 10, eye.y + dy * 10, eye.z + dz * 10), fov, smooth: 9 };
}
/** the hint while the play of the game runs: which key or button switches the view, and skips it */
let hlHintEl = null,
  hlHintTxt = "";
function hlHint() {
  if (!hlHintEl) {
    hlHintEl = document.createElement("div");
    hlHintEl.id = "potgHint";
    document.body.appendChild(hlHintEl);
  }
  const on = HL.playing && REPLAY.active;
  hlHintEl.hidden = !on;
  if (!on) return;
  const padUse = hudDevice() === "pad";
  const k = (a, pd) => (padUse ? PAD_NAMES[(PADB[a] || [pd])[0]] : keyLabel((BIND[a] || [])[0]));
  const txt = `${k("replayView", 3)} · ${HL.fp ? "Third person" : "First person"}   ${k("jump", 0)} · Skip`;
  if (txt !== hlHintTxt) hlHintEl.textContent = hlHintTxt = txt;
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
  /* over the shoulder to begin with; Replay view switches to their eyes */
  HL.fp = false;
  sfx("stinger", 0.9);
  CINE.card("Play of the game", c.name ? pilotText(c.name, pilotKind(c.pilot)) : "", c.feat, 2.6);
  REPLAY.play({
    t0,
    t1,
    frames: c.clip,
    fx: c.fx,
    events: c.events,
    subject: c.pilot,
    vmColor: c.meta && c.meta.color,
    caption: "Play of the game",
    /* hidden while we look through their eyes, shown over their shoulder and when the camera circles them */
    hide: t => (HL.fp && t0 + t < orbitAt ? [c.pilot] : []),
    /* slow motion on the key kills */
    speed: t => (near(t0 + t) ? 0.4 : 1),
    shot: (t, sample) => {
      if (t < orbitAt && HL.fp) return eyes(t, sample);
      const s = sample(c.pilot, t);
      if (!s) return null;
      if (t < orbitAt) return overShoulder(s);
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
