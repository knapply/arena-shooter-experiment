/* ============ REPLAY: play back a window of the match recording ============
   Plays recorded frames (live from REC, or a saved clip) through "ghost" rigs while the live
   pilots are hidden, with the camera driven by a shot from the cinema toolkit. The world keeps
   simulating underneath (you're dead or the match is over), so nothing is paused for anyone.
     REPLAY.play({ t0, t1, frames?, fx?, events?, shot(t, sample), hide?: [ids], speed?: t => scale,
                   cues?: [{ t, fn }], vmColor?, caption, onEnd, letterbox })
   shot(t, sample) returns a camera sample; sample(id, t) gives any recorded pose. A first-person
   shot sets eye: true, vm (the weapon index in their hands) and vmSt (their recorded pose state),
   and the replay poses the viewmodel from it: their aim, sprint, reload and melee.
   What was drawn is drawn again from the recorder's effects track (fx, or live from REC): tracers
   (with the subject's muzzle flash, recoil and sound when the shot is theirs), explosions,
   shockwaves, grenades, rockets and drop pods in flight. Kills and damage from the event log
   (events, or live) knock the ghosts down and flash their shields.
   Kill cams and Play of the Game are built on this. */
const REPLAY = (() => {
  /** @type {Map<string, any>} */
  const ghosts = new Map();
  let R = null;
  const hiddenLive = new Set(),
    hiddenProj = new Set();
  const projPool = new Map();
  const _v = new V3(),
    _w = new V3(),
    _vel = new V3();
  let vmPh = 0,
    keepArmor = 0;
  function ghostFor(id) {
    const meta = REC.metaOf(id) || {};
    const color = meta.color || "#dbe6ea";
    let g = ghosts.get(id);
    if (!g || g.color !== color) {
      if (g) scene.remove(g.root);
      g = makePilot(color, "");
      g.showTag(false);
      g.root.userData.ghost = true;
      ghosts.set(id, g);
    }
    return g;
  }
  /* ---- projectiles drawn from the recording: 1 frag, 3 plasma, 4 rocket, 5 drop pod ---- */
  function projMesh(type) {
    const pool = projPool.get(type) || projPool.set(type, []).get(type);
    let m = pool.pop();
    if (!m) {
      if (type === 3) {
        m = new THREE.Sprite(plasMat.clone());
        m.scale.setScalar(0.32);
      } else if (type === 4) {
        m = new THREE.Group();
        m.add(new THREE.Mesh(rocketGeo, rocketMat));
        const f = new THREE.Sprite(rocketFlame.clone());
        f.position.z = 0.32;
        f.scale.setScalar(0.5);
        m.add(f);
      } else if (type === 5) m = makePod("#9aa4ab").g;
      else m = new THREE.Mesh(fragGeo, fragMat);
      m.userData.ghost = true;
    }
    m.visible = true;
    scene.add(m);
    return m;
  }
  function projFree(type, m) {
    scene.remove(m);
    projPool.get(type).push(m);
  }
  /** an effects record joins the replay: projectile samples become tracks, the rest a timeline */
  function ingest(r) {
    if (r.k === REC.PROJ) {
      let tr = R.tracks.get(r.b.x);
      if (!tr) R.tracks.set(r.b.x, (tr = { type: r.b.y, pts: [], i: 0, m: null, seen: false }));
      tr.pts.push(r);
    } else R.fx.push(r);
  }
  /** the subject's own shot: muzzle flash, recoil and the sound of the gun in their hands */
  function subjectShot(sound) {
    R.shots++;
    flashT = 0.06;
    vmS.kick = 1;
    if (sound) sfx(sound, 0.7);
  }
  function playFx(r, k) {
    const a = new V3(r.a.x, r.a.y, r.a.z),
      b = new V3(r.b.x, r.b.y, r.b.z);
    REC.mute(true);
    if (r.k === REC.TRACER) {
      tracer(a, b, r.c, 0.1 / Math.max(0.3, k));
      if (R.eye && a.distanceToSquared(R.eye) < 2.6) subjectShot((WEAPONS[R.vmW] || WEAPONS[0]).snd);
      else sfxAt("shot", a, 70, 0.6);
    } else if (r.k === REC.BLAST) {
      blast(a, r.c, r.b.x);
      sfxAt("boom", a, 120, 1);
      if (R.eye) CINE.shake(Math.max(0, 0.5 - a.distanceTo(R.eye) / 30));
    } else if (r.k === REC.SHOCK) {
      shock(a);
      sfxAt("slam", a, 50, 0.9);
    }
    REC.mute(false);
  }
  function stepProjectiles(dt) {
    for (const tr of R.tracks.values()) {
      const P = tr.pts,
        last = P[P.length - 1];
      if (R.t < P[0].t || R.t > last.t + 0.05) {
        if (tr.m) {
          projFree(tr.type, tr.m);
          tr.m = null;
        }
        continue;
      }
      while (tr.i < P.length - 2 && P[tr.i + 1].t <= R.t) tr.i++;
      const a = P[tr.i],
        b = P[Math.min(tr.i + 1, P.length - 1)];
      const k = b.t > a.t ? clamp((R.t - a.t) / (b.t - a.t), 0, 1) : 0;
      if (!tr.m) tr.m = projMesh(tr.type);
      const m = tr.m;
      m.position.set(a.a.x + (b.a.x - a.a.x) * k, a.a.y + (b.a.y - a.a.y) * k, a.a.z + (b.a.z - a.a.z) * k);
      _vel.set(b.a.x - a.a.x, b.a.y - a.a.y, b.a.z - a.a.z);
      if (tr.type === 4 && _vel.lengthSq() > 1e-6) m.lookAt(_w.copy(m.position).sub(_vel));
      else if (tr.type <= 2) m.rotation.x += dt * 12;
      /* thrown or fired by the subject: their arm or launcher does it */
      if (!tr.seen) {
        tr.seen = true;
        if (R.eye && tr.i === 0 && _v.set(a.a.x, a.a.y, a.a.z).distanceToSquared(R.eye) < 6.5) {
          if (tr.type === 4) subjectShot("rocket");
          else if (tr.type <= 3) vmS.throwT = THROW_T;
        }
      }
    }
  }
  function playEvent(e, sample) {
    if (e.type === "kill") {
      if (!REC.hasMeta(e.victim) || (e.victim === R.subject && R.eye)) return;
      const g = ghostFor(e.victim),
        s = sample(e.killer, e.t);
      g.die(s ? _v.set(s.x, s.y + 1.5, s.z) : camera.position, hitPower(e.weapon));
      R.dead.set(e.victim, e.t);
    } else if (e.type === "damage" && e.victim !== R.subject && !R.dead.has(e.victim)) {
      const g = ghosts.get(e.victim),
        s = sample(e.by, e.t),
        v = sample(e.victim, e.t);
      if (g && g.root.visible)
        g.flashHit(
          s ? _v.set(s.x, s.y + 1.5, s.z) : camera.position,
          e.shieldBroken ? "brk" : e.head ? "head" : v && v.st && v.st.shield > 0 ? "sh" : ""
        );
    }
  }
  /** pose the viewmodel from a recorded pose state (their weapon, aim, sprint, reload, melee) */
  function vmReplay(dt, st, w) {
    const keepW = wi,
      keepS = switchT;
    wi = w;
    if (R.vmShown !== w) {
      R.vmShown = w;
      showVM();
    }
    switchT = 0;
    const hs = Math.hypot(st.vx || 0, st.vz || 0),
      cy = Math.cos(st.yaw),
      sy = Math.sin(st.yaw),
      lr = (st.vx || 0) * cy - (st.vz || 0) * sy;
    if (st.ground) vmPh += (hs * dt) / (st.sprint ? 2.3 : st.crouch ? 1.1 : 1.7);
    updVM(dt, {
      replay: true,
      aim: !!st.aim,
      sprint: !!st.sprint && !!st.ground,
      reload: st.reload != null ? st.reload : -1,
      melee: st.melee >= 0 ? st.melee : st.charge ? 0.5 : -1,
      clamber: !!st.clamber,
      low: st.pound === 1 || !!st.clamber,
      pound1: st.pound === 1,
      thrust: !!st.thrust,
      lr,
      strafe: clamp(lr / 6, -1, 1),
      stepPh: vmPh,
      moving: hs > 1 && !!st.ground,
      landDip: 0,
      vel: _vel.set(st.vx || 0, st.vy || 0, st.vz || 0),
      yaw: st.yaw,
      ground: !!st.ground,
    });
    wi = keepW;
    switchT = keepS;
  }
  function end(skipped) {
    if (!R) return;
    const r = R;
    for (const tr of r.tracks.values()) if (tr.m) projFree(tr.type, tr.m);
    R = null;
    for (const g of ghosts.values()) g.root.visible = false;
    for (const root of hiddenLive) root.visible = true;
    hiddenLive.clear();
    for (const m of hiddenProj) if (m.parent) m.visible = true;
    hiddenProj.clear();
    showVM();
    vmRoot.visible = false;
    if (r.vmColor) vmArmor.color.setHex(keepArmor);
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
    /** where the replay is (tests): replay time, window, subject and the last camera sample */
    get state() {
      if (!R) return null;
      const c = R.cam;
      return {
        t: R.t,
        t0: R.t0,
        t1: R.t1,
        subject: R.subject,
        p: c ? [c.p.x, c.p.y, c.p.z] : null,
        l: c ? [c.l.x, c.l.y, c.l.z] : null,
        /* recorded grenades, rockets and pods on screen */
        proj: [...R.tracks.values()].filter(tr => tr.m).length,
        /* the subject's own shots and launches replayed so far */
        shots: R.shots,
      };
    },
    play(o) {
      if (R) end(true);
      R = Object.assign({ t: o.t0, speed: () => 1, hide: [], cues: [] }, o);
      R.sample = (id, t) => (R.frames ? REC.sampleIn(R.frames, id, t) : REC.sample(id, t));
      R.subject = o.subject || null;
      R.fx = [];
      R.fxI = 0;
      R.tracks = new Map();
      R.dead = new Map();
      R.cam = null;
      R.eye = null;
      R.vmW = 0;
      R.vmShown = -1;
      R.shots = 0;
      /* effects: a saved clip's, or the live recording's (topped up each frame) */
      if (o.fx) for (const r of o.fx) ingest(r);
      else {
        for (const r of REC.fxRange(o.t0 - 0.5, now)) ingest(r);
        R.pulled = now;
      }
      while (R.fxI < R.fx.length && R.fx[R.fxI].t < o.t0) R.fxI++;
      /* events: kills and damage; the live log is read again as the replay catches up */
      R.events = (o.events || EVENTS.recent(400)).filter(
        e => (e.type === "kill" || e.type === "damage") && e.t >= o.t0 - 3.2
      );
      R.lastSeq = R.events.length ? R.events[R.events.length - 1].seq : 0;
      R.evI = 0;
      for (const g of ghosts.values()) if (g.dead) g.revive();
      if (o.vmColor) {
        keepArmor = vmArmor.color.getHex();
        vmArmor.color.set(o.vmColor).multiplyScalar(0.55);
      }
      if (o.letterbox !== false) CINE.letterbox(true);
      CINE.caption(o.caption || "");
      CINE.cut();
      document.body.classList.add("replaying");
    },
    /** called by the loop just before rendering; dt is real time */
    frame(dt) {
      if (!R) return;
      /* live rigs and projectiles out of the way (they keep simulating) */
      scene.children.forEach(o => {
        if (o.userData.pilotRig && o.visible && !o.userData.ghost) {
          o.visible = false;
          hiddenLive.add(o);
        }
      });
      /* live power weapon marks too */
      for (const m of PW_MARKS) m.visible = false;
      for (const m of REC.liveProjectiles())
        if (m.visible) {
          m.visible = false;
          hiddenProj.add(m);
        }
      const k = R.speed(R.t - R.t0);
      const step = dt * k;
      R.t += step;
      const frames = R.frames || REC.frames();
      if (!R.frames) {
        for (const r of REC.fxRange(R.pulled, now)) ingest(r);
        R.pulled = now;
        for (const e of EVENTS.recent(40))
          if (e.seq > R.lastSeq && (e.type === "kill" || e.type === "damage")) R.events.push(e);
        if (R.events.length) R.lastSeq = Math.max(R.lastSeq, R.events[R.events.length - 1].seq);
      }
      /* the camera first: shots fired this frame need the subject's eye */
      const cam = R.shot(R.t, R.sample);
      R.cam = cam;
      R.eye = cam && cam.eye ? cam.p : null;
      if (cam && cam.vm != null) R.vmW = cam.vm;
      for (; R.evI < R.events.length && R.events[R.evI].t <= R.t; R.evI++) {
        const e = R.events[R.evI];
        playEvent(e, R.sample);
        /* someone who went down before the window opened is already down */
        if (e.type === "kill" && e.t < R.t0) {
          const g = ghosts.get(e.victim),
            s = R.sample(e.victim, R.t0);
          if (g && s)
            for (let a = R.t0 - e.t; a > 0; a -= 0.1) g.update(0.1, Object.assign({}, s.st, { yaw: s.yaw }));
        }
      }
      for (const [id, t] of R.dead)
        if (R.t - t > 3.2) {
          R.dead.delete(id);
          const g = ghosts.get(id);
          if (g) g.revive();
        }
      for (; R.fxI < R.fx.length && R.fx[R.fxI].t <= R.t; R.fxI++) playFx(R.fx[R.fxI], k);
      stepProjectiles(step);
      while (R.cues.length && R.cues[0].t <= R.t) R.cues.shift().fn();
      const lo = REC.frameAt(frames, R.t + 0.1);
      const ids = new Set();
      for (let i = lo; i >= 0 && frames[i].t >= R.t - 0.1; i--)
        for (const id of frames[i].poses.keys()) ids.add(id);
      for (const [id, g] of ghosts) if (!ids.has(id)) g.root.visible = false;
      const hidden = typeof R.hide === "function" ? R.hide(R.t - R.t0) : R.hide;
      for (const id of ids) {
        const s = R.sample(id, R.t);
        const g = ghostFor(id);
        if (!s || hidden.includes(id)) {
          g.root.visible = false;
          continue;
        }
        g.root.visible = true;
        g.root.position.set(s.x, s.y, s.z);
        g.root.rotation.y = s.yaw;
        const gst = Object.assign({}, s.st, { yaw: s.yaw });
        rigEvents(g, g.update(Math.max(1e-4, step), gst), gst);
      }
      /* blast gates as they were then (their state is a function of the gate clock) */
      if (GATES.on) gateDraw(R.t + GATES.t - now);
      if (cam) CINE.apply(cam, cam.smooth || 0, dt, cam.roll || 0);
      /* the subject's weapon in first person */
      if (cam && cam.vm != null && cam.vmSt) {
        vmRoot.visible = true;
        vmReplay(step, cam.vmSt, cam.vm);
      } else vmRoot.visible = false;
      if (R.t >= R.t1) end(false);
    },
    skip() {
      end(true);
    },
  };
})();

/** a first-person shot through a recorded pilot's eyes: their look, zoom and the weapon in their hands */
function eyesShot(id) {
  return (t, sample) => {
    const s = sample(id, t);
    if (!s) return null;
    const w = s.st && s.st.wpn != null && WEAPONS[s.st.wpn | 0] ? s.st.wpn | 0 : 0;
    const zoom = s.st && s.st.aim ? WEAPONS[w].zoom[0] : 1;
    const c = CINE.firstPerson(s, SET.fov / zoom);
    /* scoped: the scope fills the view, no viewmodel */
    return Object.assign(c, { eye: true, vm: zoom >= 3 ? null : w, vmSt: s.st });
  };
}

/* ---- kill cam: when you die, the last seconds through your killer's eyes, ending on the kill ---- */
/* tunable: seconds of their view before the kill (at most len, at least min, as the respawn allows),
   seconds after it, the delay after you die, and the slow motion around the killing blow. With drop
   pods your pod waits for the kill cam (killCamHolds): it launches when the cam ends or is skipped */
const KILLCAM_T = {
  len: 4.5,
  min: 2,
  after: 0.6,
  delay: 0.35,
  slowFrom: 0.15,
  slowTo: 0.35,
  slowK: 0.5,
};
const KILLCAM = { pending: null, on: false, last: null };
const KILL_NAMES = {
  rifle: "Carbine",
  pistol: "Magnum",
  sniper: "Sniper rifle",
  rocket: "Rocket launcher",
  scatter: "Scattergun",
  frag: "Frag grenade",
  plasma: "Plasma grenade",
  stick: "Plasma grenade",
  pound: "Ground pound",
  charge: "Shoulder charge",
  melee: "Melee",
  pod: "Drop pod",
  fall: "Fall",
  self: "Own goal",
};
EVENTS.on("kill", e => {
  if (e.victim !== "local" || !SET.killCam) return;
  KILLCAM.pending = {
    killer: e.killer,
    name: e.killerName,
    weapon: e.weapon,
    head: e.head,
    at: e.t,
    startAt: e.t + KILLCAM_T.delay,
  };
});
/** was this pilot recorded within half a second before t */
function recordedNear(id, t) {
  const f = REC.frames();
  for (let i = REC.frameAt(f, t); i >= 0 && f[i].t > t - 0.5; i--) if (f[i].poses.has(id)) return true;
  return false;
}
/** a kill cam is playing, or about to (your drop pod waits for it) */
function killCamHolds() {
  return KILLCAM.on || (!!KILLCAM.pending && me.dead);
}
function killCamTick() {
  if (REPLAY.active && (P("jump") || P("melee"))) REPLAY.skip();
  /* back in the fight (a mode respawned you early): the kill cam is over */
  if (KILLCAM.on && REPLAY.active && !me.dead) REPLAY.skip();
  const k = KILLCAM.pending;
  if (!k || REPLAY.active || now < k.startAt) return;
  KILLCAM.pending = null;
  if (me.dead && recordedNear("local", k.at)) playKillCam(k);
}
function playKillCam(k) {
  const T = KILLCAM_T;
  const slowReal = (T.slowFrom + T.slowTo) / T.slowK + (T.after - T.slowTo);
  /* over before you respawn: in place, just before it; with pods, by the time your pod would launch,
     or (when the respawn is too quick for that) after its shortest slow-motion cut, the pod waiting */
  const pods = podsOn() && !INTRO.active;
  let budget = (pods ? respawnStart() : respawnAt - 0.15) - now;
  if (pods) budget = Math.max(budget, T.min - T.slowFrom + slowReal);
  let slow = true,
    len = budget - slowReal + T.slowFrom;
  if (len < T.min) {
    slow = false;
    len = budget - T.after;
  }
  len = Math.min(T.len, len);
  if (len < 0.8) return;
  /* through their eyes, unless there is no killer to look through (a fall, your own grenade, a pod) */
  const eyes =
    k.killer !== "world" && k.killer !== "local" && k.weapon !== "pod" && recordedNear(k.killer, k.at);
  /* from outside, a couple of seconds is enough */
  if (!eyes) len = Math.min(len, 2.5);
  const t0 = k.at - len,
    t1 = k.at + T.after;
  const wName =
    KILL_NAMES[k.weapon] || (WEAPON_DATA.find(w => w.dmg === k.weapon) || { name: k.weapon }).name;
  let shot;
  if (eyes) shot = eyesShot(k.killer);
  else {
    /* your own death from outside: a slow orbit around where you went down, from a side with a clear view */
    const me0 = REC.sample("local", k.at);
    const c = new V3(me0.x, me0.y + 1, me0.z);
    let a0 = me0.yaw + 2.4;
    for (let i = 0; i < 8; i++) {
      const a = me0.yaw + 2.4 + (i * Math.PI) / 4,
        d = new V3(Math.sin(a) * 5, 1.4, Math.cos(a) * 5);
      const L = d.length();
      if (rayWorld(c, d.normalize(), L) >= L - 0.3) {
        a0 = a;
        break;
      }
    }
    const orbit = CINE.orbit(c, 5, 1.4, a0, 0.2, 62);
    shot = (t, sample) => {
      const s = sample("local", t);
      const o = orbit(t - t0);
      if (s) o.l = new V3(s.x, s.y + 1, s.z);
      return Object.assign(o, { smooth: 5 });
    };
  }
  KILLCAM.on = true;
  KILLCAM.last = { killer: k.killer, at: k.at, t0, t1, eyes };
  REPLAY.play({
    t0,
    t1,
    subject: eyes ? k.killer : null,
    caption: eyes ? `Kill cam · ${k.name}` : "Kill cam",
    hide: eyes ? [k.killer] : [],
    vmColor: eyes ? (REC.metaOf(k.killer) || {}).color : null,
    /* real time, then slow motion around the killing blow */
    speed: t => (slow && t0 + t >= k.at - T.slowFrom && t0 + t <= k.at + T.slowTo ? T.slowK : 1),
    shot,
    /* a flash on the killing blow; their name and weapon once the slow beat has shown it */
    cues: [
      { t: k.at, fn: () => CINE.flash(0.2) },
      {
        t: k.at + (slow ? T.slowTo : 0.15),
        fn() {
          CINE.card(
            eyes ? "Killed by" : "Taken out",
            eyes ? pilotText(k.name, pilotKind(k.killer)) : wName,
            eyes ? `${wName}${k.head ? " · headshot" : ""}` : "",
            1.8
          );
        },
      },
    ],
    onEnd() {
      KILLCAM.on = false;
      const s = REC.sample(k.killer, k.at);
      const sh = eyes && s && s.st ? Math.ceil(s.st.shield) : null;
      $("deadBy").textContent =
        `${pilotText(k.name, pilotKind(k.killer))} · ${wName}${k.head ? " · headshot" : ""}${sh != null ? ` · their shield ${sh}` : ""}`;
    },
  });
}
