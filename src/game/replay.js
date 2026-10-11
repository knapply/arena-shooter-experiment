/* ============ REPLAY: play back a window of the match recording ============
   Plays recorded frames (live from REC, or a saved clip) through "ghost" rigs while the live
   pilots are hidden, with the camera driven by a shot from the cinema toolkit. The world keeps
   simulating underneath (you're dead or the match is over), so nothing is paused for anyone.
     REPLAY.play({ t0, t1, frames?, shot(t, sample), hide?: [ids], speed?: t => scale,
                   caption, onEnd, letterbox })
   shot(t, sample) returns a camera sample; sample(id, t) gives any recorded pose.
   Kill cams and Play of the Game are built on this. */
const REPLAY = (() => {
  /** @type {Map<string, any>} */
  const ghosts = new Map();
  let R = null;
  const hiddenLive = new Set();
  function ghostFor(id) {
    const meta = REC.metaOf(id) || {};
    const color = meta.color || "#dbe6ea";
    let g = ghosts.get(id);
    if (!g || g.color !== color) {
      if (g) scene.remove(g.root);
      g = makePilot(color, "");
      g.showTag(false);
      ghosts.set(id, g);
    }
    return g;
  }
  function end(skipped) {
    if (!R) return;
    const r = R;
    R = null;
    for (const g of ghosts.values()) g.root.visible = false;
    for (const root of hiddenLive) root.visible = true;
    hiddenLive.clear();
    VMW.forEach((v, i) => (v.g.visible = i === wi));
    CINE.letterbox(false);
    CINE.caption("");
    CINE.cut();
    document.body.classList.remove("replaying");
    if (r.onEnd) r.onEnd(!!skipped);
  }
  return {
    get active() {
      return !!R;
    },
    play(o) {
      if (R) end(true);
      R = Object.assign({ t: o.t0, speed: () => 1, hide: [] }, o);
      R.sample = (id, t) => (R.frames ? REC.sampleIn(R.frames, id, t) : REC.sample(id, t));
      if (o.letterbox !== false) CINE.letterbox(true);
      CINE.caption(o.caption || "");
      CINE.cut();
      document.body.classList.add("replaying");
    },
    /** called by the loop just before rendering; dt is real time */
    frame(dt) {
      if (!R) return;
      /* live rigs out of the way (they keep simulating) */
      scene.children.forEach(o => {
        if (o.userData.pilotRig && o.visible && !o.userData.ghost) {
          o.visible = false;
          hiddenLive.add(o);
        }
      });
      const k = R.speed(R.t - R.t0);
      const step = dt * k;
      R.t += step;
      const frames = R.frames || REC.frames();
      const ids = new Set();
      for (const f of frames)
        if (f.t >= R.t - 0.1 && f.t <= R.t + 0.1) for (const id of f.poses.keys()) ids.add(id);
      for (const [id, g] of ghosts) if (!ids.has(id)) g.root.visible = false;
      for (const id of ids) {
        const s = R.sample(id, R.t);
        const g = ghostFor(id);
        const hidden = typeof R.hide === "function" ? R.hide(R.t - R.t0) : R.hide;
        if (!s || hidden.includes(id)) {
          g.root.visible = false;
          continue;
        }
        g.root.userData.ghost = true;
        g.root.visible = true;
        g.root.position.set(s.x, s.y, s.z);
        g.root.rotation.y = s.yaw;
        g.update(Math.max(1e-4, step), Object.assign({}, s.st, { yaw: s.yaw }));
      }
      const cam = R.shot(R.t, R.sample);
      if (cam) CINE.apply(cam, cam.smooth || 0, dt, cam.roll || 0);
      /* the subject's weapon in first person */
      if (cam && cam.vm != null) {
        vmRoot.visible = true;
        VMW.forEach((v, i) => (v.g.visible = i === cam.vm));
      } else vmRoot.visible = false;
      if (R.t >= R.t1) end(false);
    },
    skip() {
      end(true);
    },
  };
})();

/* ---- kill cam: when you die, see the last few seconds through your killer's eyes ---- */
const KILLCAM = { pending: null };
EVENTS.on("kill", e => {
  if (e.victim !== "local" || e.killer === "local" || e.killer === "world" || !SET.killCam) return;
  KILLCAM.pending = {
    killer: e.killer,
    name: e.killerName,
    weapon: e.weapon,
    head: e.head,
    at: now,
    startAt: now + 0.6,
  };
});
function killCamTick() {
  if (REPLAY.active && (P("jump") || P("melee"))) REPLAY.skip();
  const k = KILLCAM.pending;
  if (!k || REPLAY.active || now < k.startAt) return;
  KILLCAM.pending = null;
  if (!me.dead || !REC.sample(k.killer, k.at - 0.2)) return;
  const len = Math.min(3.6, Math.max(1.5, respawnAt - now - 0.9));
  const t1 = k.at + 0.25,
    t0 = t1 - len;
  const W_NAMES = {
    rifle: "Carbine",
    pistol: "Magnum",
    sniper: "Sniper rifle",
    frag: "Frag grenade",
    stick: "Plasma grenade",
    pound: "Ground pound",
    charge: "Shoulder charge",
    melee: "Melee",
  };
  REPLAY.play({
    t0,
    t1,
    caption: `Kill cam · ${k.name}`,
    hide: [k.killer],
    /* real time until the last half second, which plays at half speed */
    speed: t => (t > len - 0.6 ? 0.5 : 1),
    shot: (t, sample) => {
      const s = sample(k.killer, t);
      if (!s) return null;
      const c = CINE.firstPerson(s);
      c.vm = s.st && s.st.wpn != null ? s.st.wpn : 0;
      return c;
    },
    onEnd() {
      const s = REC.sample(k.killer, k.at);
      const sh = s && s.st ? Math.ceil(s.st.shield) : null;
      $("deadBy").textContent =
        `${k.name} · ${W_NAMES[k.weapon] || k.weapon}${k.head ? " · headshot" : ""}${sh != null ? ` · their shield ${sh}` : ""}`;
    },
  });
}
