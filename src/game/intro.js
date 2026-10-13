/* ============ MATCH INTRO: a fast cut sequence before play starts (at most 5 s) ============
   Built from the map document, so a new map gets an intro for free: map name over a flyover,
   each team's base with its pilots standing at their spawns, the objective, the power weapons with
   their respawn times, and the mode card. The match clock is held while it plays (no play time
   lost), everyone online sees it at match start, and jump skips it. When the match opens with a
   drop (game/loop.js matchDrop), everyone waits in orbit through it (the bases are empty) and the
   pods launch as it ends. */
const INTRO = { active: false, t: 0, shots: [], i: -1, onEnd: null };
const _ic = new V3();
const centroid = pts => {
  const c = new V3();
  for (const p of pts) c.add(_ic.set(p[0], p[1], p[2]));
  return c.multiplyScalar(1 / pts.length);
};
/**
 * @param {any} map the map document
 * @param {{ mode: string, limit: string, teams?: string[][], teamNames?: string[], teamColors?: string[] }} o
 */
function playIntro(map, o, onEnd) {
  const shots = [];
  const B = map.bounds,
    mid = new V3((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2),
    span = Math.max(B.x1 - B.x0, B.z1 - B.z0);
  const WN = Object.fromEntries(
    WEAPON_DATA.map(w => [w.key, w.name.split(" ").slice(1).join(" ") || w.name])
  );
  /* 1: flyover with the map name */
  shots.push({
    dur: o.teams ? 1.0 : 1.3,
    card: [o.mode, map.name, ""],
    shot: CINE.crane(
      CINE.orbit(mid, span * 0.62, span * 0.42, 0.7, 0.35, 60),
      CINE.orbit(mid, span * 0.45, span * 0.26, 0.9, 0.35, 60)
    ),
  });
  /* 2-3: each team's base, pilots at their spawns */
  if (o.teams && map.spawns.teams)
    map.spawns.teams.forEach((sp, t) => {
      const c = centroid(sp),
        out = c.clone().sub(mid).setY(0).normalize();
      const from = c
          .clone()
          .addScaledVector(out, -13)
          .setY(c.y + 4.6),
        to = c
          .clone()
          .addScaledVector(out, -10)
          .setY(c.y + 3.2);
      shots.push({
        dur: 1.2,
        card: [`${o.teamNames[t]} team`, "", o.teams[t].join(" · ")],
        color: o.teamColors[t],
        shot: CINE.crane(
          CINE.fixed(from, c.clone().setY(c.y + 1.2), 58),
          CINE.fixed(to, c.clone().setY(c.y + 1.1), 52)
        ),
      });
    });
  /* 4: the objective */
  if (map.flags) {
    const f = map.flags[1],
      fv = new V3(f[0], f[1] + 0.8, f[2]);
    shots.push({
      dur: 0.8,
      card: ["Objective", "Capture their flag", "Bring it to your stand"],
      shot: CINE.orbit(fv, 7, 2.6, 0.4, 0.6, 56),
    });
  }
  /* 5: power weapons */
  if (map.pickups && map.pickups.length) {
    const p = map.pickups[0],
      pv = new V3(p.p[0], p.p[1] + 0.3, p.p[2]);
    shots.push({
      dur: 0.8,
      card: ["Power weapon", WN[p.weapon] || p.weapon, `Every ${p.respawn} s`],
      shot: CINE.orbit(pv, 4.5, 1.6, 2.2, 0.7, 52),
    });
  }
  /* trim to 5 s in total */
  let total = 0;
  for (const s of shots) total += s.dur;
  if (total > 5) for (const s of shots) s.dur *= 5 / total;
  Object.assign(INTRO, { active: true, t: 0, shots, i: -1, onEnd, mode: o });
  document.body.classList.add("cinematic");
  CINE.letterbox(true);
  CINE.cut();
  sfx("stinger", 0.7);
}
function endIntro() {
  if (!INTRO.active) return;
  INTRO.active = false;
  document.body.classList.remove("cinematic");
  CINE.letterbox(false);
  CINE.caption("");
  CINE.cut();
  const o = INTRO.mode;
  CINE.card(o.mode, o.limit, "", 1.6);
  if (INTRO.onEnd) INTRO.onEnd();
}
/** per frame while playing: drives the camera; call after the game set its own camera */
function introFrame(dt) {
  if (!INTRO.active) return;
  if (P("jump") || P("fire")) return endIntro();
  INTRO.t += dt;
  let t = INTRO.t,
    i = 0;
  while (i < INTRO.shots.length && t > INTRO.shots[i].dur) {
    t -= INTRO.shots[i].dur;
    i++;
  }
  if (i >= INTRO.shots.length) return endIntro();
  const s = INTRO.shots[i];
  if (i !== INTRO.i) {
    INTRO.i = i;
    CINE.cut();
    if (s.card) CINE.card(s.card[0], s.card[1], s.card[2], s.dur);
  }
  CINE.apply(s.shot(t / s.dur), 0, dt);
  vmRoot.visible = false;
}
