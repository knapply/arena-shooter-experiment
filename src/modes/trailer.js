/* ===== Trailer: a scripted cinematic cut of the game, synced to the score in modes/trailer-score.js.
   Shots drive real pilots (engine physics, rigs and effects) with scripted input: pilots follow
   routes that are steered every physics step, so they run where the shot needs them and never into
   walls (any collision at speed is logged in TR.diag.bumps, and the tests fail on one). A few
   seconds here and there are first person, played the way the game is played: the player's own
   pilot, viewmodel and HUD from the real game loop, fed scripted input (game/trailer-fp.js). The
   fourth act cuts between live AI-vs-AI matches of every mode. The camera and lighting are graded
   per shot (depth of field, split-tone grade, lens fringing, anamorphic streaks, a lighting mood).
   The timeline is a pure function of trailer time, so the same cut can play live (clocked by the
   music) or be stepped frame by frame for video capture.

   Structure (120 BPM, a bar is 2 s):
     0-10   cold open: a dolly past cover to the squad at dusk; the squad burns in from orbit in drop
            pods, then you ride yours down from inside the cockpit
     10-28  three rules, each on a black card then shown: speed (first person: sprint, thrust and fire;
            then a slide under fire), height (first person over a blast gate, then a ground pound),
            nothing is safe (a frag through cover)
     28-41  the drop: one shot per bar (charge, rocket, a scoped sniper shot in first person, air
            shots, melee, plasma)
     41-60  every mode, live: the mode picker, capture the flag (and a flag carry in first person),
            Team Slayer, oddball (the skull drops in by pod, then a carry in first person),
            free-for-all, and a power weapon arriving in a supply pod
     60-64  under the hood: thousands of simulated matches tune every number
     64-73  motion captured: a weighted stop and pivot, a running leap and a hard landing, hits
            that rock a pilot and a crumple, then the squad celebrates at night
     73-79  the climax: a leap frozen in time while the camera circles, then time snaps back
     79-88  title */
(function () {
  const K = window.KA,
    THREE = K.THREE,
    $ = K.$,
    V3 = THREE.Vector3,
    CTF = window.CTF,
    SC = K.trailerScore,
    CINE = K.CINE;
  const PI = Math.PI,
    H = 1 / 120;
  const diag = { bumps: [], cam: [], log: [] };
  /** sound effects heard during a capture: [seconds, kind, volume] (rendered into the video's audio) */
  const sfxLog = [];
  /* captured effects: the live match's constant gunfire sits under the scripted action */
  const tap = (kind, vol) => sfxLog.push([+T.toFixed(4), kind, shot && shot.ctf ? vol * 0.5 : vol]);
  const TR = (K.trailer = /** @type {KAExtensions["trailer"]} */ ({
    active: false,
    recording: false,
    get t() {
      return T;
    },
    END: 88,
    diag,
    sfxLog,
  }));
  let T = 0,
    shotI = -1,
    shot = null,
    shotSim = 0,
    music = null,
    musicStart = 0,
    lastWall = 0,
    G = null,
    cardI = -1,
    focus = null,
    focusT = 0,
    seed = 1;
  const NO = {
    f: 0,
    s: 0,
    sprint: false,
    thrust: false,
    crouch: false,
    crouchP: false,
    jumpP: false,
    aim: false,
    meleeP: false,
  };
  const _a = new V3(),
    _b = new V3(),
    _c = new V3();
  /* ---------------- small math ---------------- */
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)),
    lerp = (a, b, t) => a + (b - a) * t,
    clamp = (x, a, b) => (x < a ? a : x > b ? b : x),
    V = (x, y, z) => new V3(x, y, z),
    yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)),
    angD = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  /** a value through [time, value] keys, eased between them */
  function curve(k, t) {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++)
      if (t < k[i][0]) {
        const [t0, v0] = k[i - 1],
          [t1, v1] = k[i];
        return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
      }
    return k[k.length - 1][1];
  }
  /* a seeded generator, reset per shot, so a re-record matches the last one */
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  /* handheld camera: a few slow sines, smooth and repeatable */
  const hand = (t, a, out = new V3()) =>
    out.set(
      a * (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 3.1 + 1) * 0.3 + Math.sin(t * 7.7 + 2) * 0.1),
      a * (Math.sin(t * 1.7 + 4) * 0.5 + Math.sin(t * 4.3 + 3) * 0.3 + Math.sin(t * 9.1) * 0.1),
      a * (Math.sin(t * 1.1 + 2) * 0.6 + Math.sin(t * 2.9 + 5) * 0.3)
    );

  /* ---------------- actors: real bodies and rigs driven by scripted input ---------------- */
  const actors = [];
  /* actors never collide with pilots left over from a mode (a frozen practice drone can block a route) */
  const NO_PILOTS = () => [];
  const COL = {
    hero: "#ffb347",
    ally: "#ff6f91",
    ally2: "#c58bff",
    foe: "#62cdff",
    foe2: "#8be3ff",
    foe3: "#4fe0c0",
  };
  function mk(color) {
    const a = Object.assign(K.addPilot(new K.Pilot({ id: "actor:" + actors.length, color, ctl: "script" })), {
      wpn: 1,
      firedT: -9,
      on: false,
      acc: 0,
      st: 0,
      pi: 0,
      dead: false,
      once: new Set(),
      reload: -1,
      ctl: null,
      arrived: false,
      leapT: 0,
      leapt: false,
      poundAt: null,
      hitT: null,
      lastSh: null,
    });
    a.rig.showTag(false);
    a.rig.root.visible = false;
    actors.push(a);
    return a;
  }
  let hero, ally, ally2, foe1, foe2, foe3;
  function cast() {
    if (hero) return;
    hero = mk(COL.hero);
    ally = mk(COL.ally);
    ally2 = mk(COL.ally2);
    foe1 = mk(COL.foe);
    foe2 = mk(COL.foe2);
    foe3 = mk(COL.foe3);
  }
  /** place an actor: p = [x, y, z], yaw (0 faces -z), optional pitch and shield */
  function put(a, p, yaw, pitch = 0, shield = 70) {
    const b = a.body;
    b.reset();
    b.pos.set(p[0], p[1], p[2]);
    b.yaw = yaw;
    b.pitch = pitch;
    b.spawnT = -99;
    b.shield = shield;
    b.thrustCD = 0;
    b.ground = true;
    a.rig.revive();
    a.rig.showTag(false);
    a.rig.S.sh = shield;
    a.rig.root.visible = true;
    a.rig.root.position.copy(b.pos);
    a.rig.root.rotation.y = yaw;
    Object.assign(a, {
      on: true,
      acc: 0,
      st: 0,
      pi: 0,
      reload: -1,
      wpn: 1,
      firedT: -9,
      dead: false,
      ctl: null,
      arrived: false,
      leapT: 0,
      leapt: false,
      poundAt: null,
      hitT: null,
      lastSh: null,
    });
    a.once.clear();
  }
  const face = (a, p) => (a.body.yaw = yawTo(a.body.pos, p));
  function clearStage() {
    for (const a of actors) {
      a.on = false;
      a.rig.root.visible = false;
    }
    for (const g of grenades) K.scene.remove(g.mesh);
    grenades.length = 0;
    rockets.clear();
    K.clearPods();
    $("trScope").hidden = true;
  }
  /** true the first time it is asked with this key (per placement) */
  const once = (a, k) => {
    if (a.once.has(k)) return false;
    a.once.add(k);
    return true;
  };
  /* fixed 120 Hz physics, same as the player. ctl(actor, simTime) is asked for input every physics
     step, so steering and timing don't depend on the frame rate (live and captured runs match). */
  function drive(a, dt) {
    if (!a.on) return;
    a.acc += dt;
    let n = 0;
    while (a.acc >= H && n < 24) {
      const inp = Object.assign({}, NO, a.ctl && !a.dead ? a.ctl(a, a.st) : null);
      if (!a.dead) a.body.step(H, inp, (ty, d) => onBody(a, ty, d));
      a.st += H;
      a.acc -= H;
      n++;
    }
    a.pose(dt, { fire: shotSim - a.firedT < 0.1, wpn: a.wpn, reload: a.reload });
  }
  function onBody(a, ty, d) {
    if (ty === "bump") {
      diag.bumps.push({
        t: +T.toFixed(2),
        shot: shot ? shot.name : "",
        who: a.id,
        speed: +d.speed.toFixed(1),
      });
      return;
    }
    if (ty !== "land" || d.vy > 6)
      diag.log.push({ t: +T.toFixed(2), st: +a.st.toFixed(2), who: a.id, ev: ty });
    if (ty === "slam") {
      K.shock(d.pos);
      K.blast(_a.copy(d.pos).setY(d.pos.y + 0.4), 0xffc070, 6);
      K.dust(d.pos, 30, 3.6, 1.5, 0.8);
      K.sfx("slam", 1);
      K.damageRadius(d.pos, 6, 900, true);
      CINE.shake(0.8);
      for (const o of actors)
        if (o !== a && o.on && !o.dead && o.body.pos.distanceTo(d.pos) < 5.8) kill(o, d.pos, 3.6);
    } else if (ty === "thrust") {
      K.thrustPuff(a.body.pos, d.dir);
      K.sfx("thrust", 0.6);
    } else if (ty === "slide") K.sfx("slide", 0.6);
    else if (ty === "land" && d.vy > 9) K.dust(a.body.pos, 10, 1.8, 0.6);
  }
  function kill(o, from, power) {
    if (o.dead) return;
    o.dead = true;
    o.body.shield = 0;
    o.rig.die(from, power);
    K.spark(o.rig.chestWorld(_c), 16, 0xff7a6a);
  }
  /** turn an actor's aim toward a point (k = 1 snaps, smaller eases) */
  function aimAt(a, p, k = 1) {
    const e = _a.copy(a.body.pos);
    e.y += a.body.h - 0.2;
    const dx = p.x - e.x,
      dy = p.y - e.y,
      dz = p.z - e.z;
    a.body.yaw += angD(a.body.yaw, Math.atan2(-dx, -dz)) * k;
    a.body.pitch = lerp(a.body.pitch, Math.atan2(dy, Math.hypot(dx, dz)), k);
  }
  const chest = (o, out = new V3()) => out.copy(o.body.pos).add(_b.set(0, o.body.h * 0.68, 0)),
    head = (o, out = new V3()) => out.copy(o.body.pos).add(_b.set(0, o.body.h - 0.22, 0));
  /**
   * steer an actor along a route of [x, z] points: turn toward a point a little ahead on the route
   * (rate-limited, like a person turning), run, and stop at the end. Fills and returns inp.
   */
  function steer(a, route, inp, { look = 1.8, turn = 7, sprint = true, stop = true } = {}) {
    const p = a.body.pos;
    /* advance past segments we've gone beyond */
    for (;;) {
      if (a.pi >= route.length - 2) break;
      const [x0, z0] = route[a.pi],
        [x1, z1] = route[a.pi + 1];
      const dx = x1 - x0,
        dz = z1 - z0,
        L2 = dx * dx + dz * dz;
      if (((p.x - x0) * dx + (p.z - z0) * dz) / L2 >= 1) a.pi++;
      else break;
    }
    /* the point `look` metres ahead of our projection on the route */
    let i = Math.min(a.pi, route.length - 2),
      [x0, z0] = route[i],
      [x1, z1] = route[i + 1];
    let dx = x1 - x0,
      dz = z1 - z0,
      L = Math.hypot(dx, dz);
    let s = clamp(((p.x - x0) * dx + (p.z - z0) * dz) / (L * L), 0, 1) * L + look;
    while (s > L && i < route.length - 2) {
      s -= L;
      i++;
      [x0, z0] = route[i];
      [x1, z1] = route[i + 1];
      dx = x1 - x0;
      dz = z1 - z0;
      L = Math.hypot(dx, dz);
    }
    s = Math.min(s, L);
    const tx = x0 + (dx / L) * s,
      tz = z0 + (dz / L) * s;
    const want = Math.atan2(-(tx - p.x), -(tz - p.z));
    a.body.yaw += clamp(angD(a.body.yaw, want), -turn * H, turn * H);
    const [ex, ez] = route[route.length - 1],
      left = Math.hypot(ex - p.x, ez - p.z);
    if (stop && left < 0.45) {
      inp.f = 0;
      inp.sprint = false;
      a.arrived = true;
    } else {
      inp.f = stop && left < 1.6 ? 0.55 : 1;
      inp.sprint = sprint && !(stop && left < 2.5);
    }
    return inp;
  }
  /* a visible shot: tracer from the muzzle, shield flare or blood spark, damage and kills */
  function shoot(
    a,
    tgt,
    {
      at = null,
      from = null,
      dmg = 20,
      headshot = false,
      miss = 0,
      color = 0xffd9a0,
      snd = "pshot",
      power = 1.4,
      life = undefined,
    } = {}
  ) {
    let m;
    if (from) m = from.clone();
    else {
      const fw = _a.set(-Math.sin(a.body.yaw), 0, -Math.cos(a.body.yaw)),
        rt = _b.set(Math.cos(a.body.yaw), 0, -Math.sin(a.body.yaw));
      m = a.body.pos.clone().addScaledVector(fw, 0.75).addScaledVector(rt, 0.18);
      m.y += a.body.h - 0.45;
      a.firedT = shotSim;
    }
    const p = at ? at.clone() : tgt ? (headshot ? head(tgt) : chest(tgt)) : m.clone();
    if (miss) p.add(_c.set((rnd() - 0.5) * miss, rnd() * miss * 0.6 + miss * 0.3, (rnd() - 0.5) * miss));
    K.tracer(m, p, color, life);
    K.sfx(snd, 0.55);
    if (tgt && !miss && !tgt.dead) {
      const had = tgt.body.shield > 0;
      K.spark(p, 3, had ? 0xffd36b : 0xff7a6a);
      tgt.rig.flashHit(m);
      if (headshot && !had) return kill(tgt, m, power);
      const s = Math.min(tgt.body.shield, dmg);
      tgt.body.shield -= s;
      tgt.rig.S.sh = tgt.body.shield;
      if (had && tgt.body.shield <= 0) {
        K.shieldPop(chest(tgt));
        K.sfx("pop", 0.8);
      }
      if (dmg - s > 40) kill(tgt, m, power);
    }
  }
  /* rockets fly for real (the game's rocket code), with a scripted owner that decides who dies */
  const rockets = new K.RocketWorld(true);
  /* thrown grenades are scripted arcs that land where the shot needs them */
  const grenades = [];
  function throwNade(from, to, flight, color, onLand, stick) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color }));
    m.material.color.multiplyScalar(3);
    K.scene.add(m);
    const g = {
      mesh: m,
      a: from.clone(),
      b: to.clone(),
      t0: shotSim,
      flight,
      onLand,
      stick,
      done: false,
      landed: false,
    };
    grenades.push(g);
    K.sfx("swing", 0.6);
    return g;
  }
  function updNades() {
    for (const g of grenades) {
      if (g.done) continue;
      const k = Math.min(1, (shotSim - g.t0) / g.flight);
      if (g.stick && k >= 1) {
        g.mesh.position.copy(chest(g.stick));
        g.mesh.scale.setScalar(1 + 0.35 * Math.sin(shotSim * 30));
      } else {
        g.mesh.position.lerpVectors(g.a, g.b, k);
        g.mesh.position.y += Math.sin(PI * k) * Math.max(1.2, g.a.distanceTo(g.b) * 0.18);
      }
      g.mesh.visible = true;
      if (k >= 1 && g.onLand && !g.landed) {
        g.landed = true;
        g.onLand(g);
      }
    }
  }
  function boom(p, color, r, dmg = 4000) {
    K.blast(p, color, r * 1.4);
    K.shock(p);
    K.dust(p, 30, 3, 1.4, 0.8);
    K.sfx("boom", 1);
    K.damageRadius(p, r, dmg, true);
    CINE.shake(0.6);
  }
  const endNade = g => {
    g.done = true;
    g.mesh.visible = false;
  };

  /* ---------------- camera, look and mood ---------------- */
  function cam(p, l, fov = 50, smooth = 0, dt = 0, roll = 0) {
    CINE.apply({ p, l, fov }, smooth, dt, roll);
  }
  const LOOK0 = { dof: 0, focus: 10, range: 6, near: 1, grade: 0.9, ca: 0.006, streak: 0.4 };
  /* first person is the game's own look, lightly graded */
  const LOOK_FP = { dof: 0, grade: 0.45, ca: 0.003, streak: 0.15 };

  /* ---------------- first person: the player's own pilot, viewmodel and HUD (game/trailer-fp.js) ---------------- */
  const F = K.trailerFP;
  /** what the player can shoot (the shot's actors), what the tracker shows and what they carry */
  let fpTargets = [],
    fpCarry = "",
    fpTeam = 0;
  function asTarget(a) {
    return {
      kind: "ext",
      pos: a.body.pos,
      h: a.body.h,
      ref: {
        body: a.body,
        onHit(n) {
          const had = a.body.shield > 0;
          const died = !a.dead && a.body.damage(n, K.now);
          a.rig.S.sh = a.body.shield;
          a.rig.flashHit(K.camera.position);
          if (had && a.body.shield <= 0) K.shieldPop(chest(a));
          if (died) kill(a, K.camera.position, 2.4);
          return { died, brk: had && a.body.shield <= 0, sh: a.body.shield > 0 };
        },
      },
    };
  }
  const EXT_HOOKS = {
    targets: () => fpTargets.filter(a => a.on && !a.dead).map(asTarget),
    radar: () =>
      G
        ? G.agents
            .filter(a => a.alive && !a.human)
            .map(a => ({ pos: a.body.pos, ally: !G.ffa && a.team === fpTeam, body: a.body }))
        : actors.filter(a => a.on && !a.dead).map(a => ({ pos: a.body.pos, ally: false, body: a.body })),
    carrying: () => fpCarry,
    respawn() {},
  };
  /** aim the player toward a point: returns the yaw and pitch to look along (k eases toward it) */
  function lookAt(p, k = 1) {
    const m = F.me,
      e = _a.copy(m.pos).setY(m.pos.y + 1.62);
    const dx = p.x - e.x,
      dy = p.y - e.y,
      dz = p.z - e.z;
    return {
      yaw: m.yaw + angD(m.yaw, Math.atan2(-dx, -dz)) * k,
      pitch: lerp(m.pitch, Math.atan2(dy, Math.hypot(dx, dz)), k),
    };
  }
  /* the menu shot picks mode cards as a player would; the player's own pick is put back after */
  let menuKeep = null;
  function menuRestore() {
    if (menuKeep == null) return;
    const el = document.getElementById("mode-" + menuKeep);
    menuKeep = null;
    if (el) el.click();
  }
  /** simulate actors ahead without drawing (a shot that starts partway into its action) */
  function preroll(list, secs) {
    for (let t = 0; t < secs - 1e-6; t += 0.1) for (const a of list) drive(a, Math.min(0.1, secs - t));
  }
  /** depth of field focused on a point (distance from the camera this frame) */
  const af = (p, range = 2, extra = {}) =>
    Object.assign({ dof: 1, focus: K.camera.position.distanceTo(p), range }, extra);
  /* lighting moods: sun direction (from the origin), color and strength, sky and fog */
  const MOODS = {
    dusk: {
      sun: [-12, 14, 60],
      col: 0xffa262,
      i: 3.2,
      hemi: 0.55,
      fog: "#3b2d26",
      near: 6,
      far: 80,
      sky: [1.35, 0.95, 0.75],
    },
    cool: {
      sun: [42, 30, -16],
      col: 0xe6ecff,
      i: 2.6,
      hemi: 0.95,
      fog: "#16212a",
      near: 18,
      far: 110,
      sky: [0.8, 0.95, 1.15],
    },
    hot: {
      sun: [26, 34, 44],
      col: 0xffc28a,
      i: 2.9,
      hemi: 1.0,
      fog: "#2a2220",
      near: 22,
      far: 115,
      sky: [1.2, 1.0, 0.85],
    },
    night: {
      sun: [-30, 40, -20],
      col: 0xb8c8ff,
      i: 1.6,
      hemi: 0.5,
      fog: "#0b1016",
      near: 10,
      far: 90,
      sky: [0.5, 0.6, 0.8],
    },
  };
  let mood0 = null;
  function setMood(name) {
    const sun = K.sun,
      hemi = K.hemi,
      fog = K.scene.fog;
    if (!mood0)
      mood0 = {
        sun: sun.position.clone(),
        col: sun.color.getHex(),
        i: sun.intensity,
        hemi: hemi ? hemi.intensity : 1,
        fog: fog.color.getHex(),
        near: fog.near,
        far: fog.far,
        bg: K.scene.background && K.scene.background.getHex ? K.scene.background.getHex() : null,
      };
    if (!name) {
      const m = mood0;
      sun.position.copy(m.sun);
      sun.color.setHex(m.col);
      sun.intensity = m.i;
      if (hemi) hemi.intensity = m.hemi;
      fog.color.setHex(m.fog);
      fog.near = m.near;
      fog.far = m.far;
      if (m.bg != null) K.scene.background.setHex(m.bg);
      if (K.skyTint) K.skyTint.set(1, 1, 1);
      mood0 = null;
      return;
    }
    const m = MOODS[name];
    sun.position.set(m.sun[0], m.sun[1], m.sun[2]);
    sun.color.setHex(m.col);
    sun.intensity = m.i;
    if (hemi) hemi.intensity = m.hemi;
    fog.color.set(m.fog);
    fog.near = m.near;
    fog.far = m.far;
    if (K.scene.background && K.scene.background.set) K.scene.background.set(m.fog);
    if (K.skyTint) K.skyTint.set(m.sky[0], m.sky[1], m.sky[2]);
  }

  /* ---------------- overlay: cards, black interstitials, fades, flashes, title ---------------- */
  const CARDS = [
    {
      t: 1.5,
      d: 3.1,
      eb: "Orbital proving ground",
      big: "",
      sub: "Every pilot learns three rules",
      kind: "low",
    },
    { t: 10, d: 0.95, big: "Speed is armor", kind: "black" },
    { t: 15.5, d: 0.95, big: "Height is power", kind: "black" },
    { t: 23, d: 0.95, big: "Nothing is safe", kind: "black" },
    { t: 43.4, d: 1.9, eb: "4 v 4", big: "Capture the flag", sub: "Carriers walk", kind: "lower" },
    { t: 47.9, d: 2.2, eb: "Kill to win", big: "Team Slayer", kind: "lower" },
    { t: 51.0, d: 2.1, eb: "Hold the skull", big: "Oddball", sub: "It drops in from orbit", kind: "lower" },
    { t: 55.9, d: 1.7, eb: "Eight pilots", big: "Free for all", kind: "lower" },
    { t: 58.3, d: 1.4, eb: "Power weapons", big: "Supply drops", kind: "lower" },
    {
      t: 60.4,
      d: 3.3,
      eb: "Tuned by simulation",
      big: "Thousands of matches",
      sub: "Headless AI matches measure every number",
      kind: "stats",
    },
    {
      t: 64.3,
      d: 2.4,
      eb: "Real performances",
      big: "Motion captured",
      sub: "Every stop, leap, landing, hit and fall",
      kind: "lower",
    },
    {
      t: 71.4,
      d: 1.5,
      eb: "Peer to peer",
      big: "Bring friends",
      sub: "No install. No accounts.",
      kind: "lower",
    },
  ];
  /* the stats card: the skill ladder from docs/TUNING.md (share of kills Legendary AI takes against
     Normal, in headless matches of each mode) */
  /** @type {[string, number][]} */
  const STATS = [
    ["Capture the flag", 0.85],
    ["Team Slayer", 0.85],
    ["Free for all", 0.77],
    ["Oddball", 0.91],
  ];
  /* [start, end, from, to] opacity of the black layer */
  const FADES = [
    [0, 1.6, 1, 0],
    [28.5, 29, 1, 1],
    [79, 79.6, 1, 1],
    [79.6, 81.5, 1, 0.62],
    [81.5, 86.4, 0.62, 0.62],
    [86.4, 88, 0.62, 1],
  ];
  const FLASH = [
    [29, 0.5],
    [41, 0.3],
    [73, 0.35],
    [78.02, 0.8],
  ];
  const TITLE = 79.6;
  function updOverlay() {
    let i = -1;
    for (let k = 0; k < CARDS.length; k++) {
      const c = CARDS[k],
        pad = c.kind === "black" ? 0 : 0.4;
      if (T >= c.t - pad && T < c.t + c.d + pad) i = k;
    }
    const el = $("trCard");
    if (i !== cardI) {
      cardI = i;
      if (i >= 0) {
        const c = CARDS[i];
        el.querySelector(".eb").textContent = c.eb || "";
        el.querySelector(".big").textContent = c.big || "";
        el.querySelector(".sub").textContent = c.sub || "";
        el.className = c.kind || "";
      }
    }
    let black = 0;
    if (i >= 0) {
      const c = CARDS[i];
      if (c.kind === "black") {
        /* hard cut to black; the words track in tight and hold */
        const k = (T - c.t) / c.d;
        black = 1;
        el.style.opacity = String(Math.min(1, k * 6).toFixed(3));
        el.style.filter = `blur(${(Math.max(0, 1 - k * 5) * 6).toFixed(1)}px)`;
        el.style.letterSpacing = `${(0.32 - 0.12 * ease(k * 1.6)).toFixed(3)}em`;
        el.style.transform = `translateY(-50%) scale(${(1.04 - 0.04 * ease(k * 2)).toFixed(4)})`;
      } else {
        const pin = ease((T - c.t) / 0.5),
          pout = ease((T - (c.t + c.d)) / 0.35),
          o = pin * (1 - pout);
        el.style.opacity = o.toFixed(3);
        el.style.filter = `blur(${((1 - pin) * 8 + pout * 6).toFixed(1)}px)`;
        el.style.letterSpacing = `${(0.13 + (1 - pin) * 0.3).toFixed(3)}em`;
        el.style.transform = `${c.kind === "low" || c.kind === "lower" || c.kind === "stats" ? "" : "translateY(-50%) "}scale(${(1 + 0.02 * (T - c.t)).toFixed(4)})`;
      }
    } else el.style.opacity = "0";
    /* the stats card's bars fill one after another */
    const sc = i >= 0 && CARDS[i].kind === "stats" ? CARDS[i] : null,
      st = $("trStats");
    if (sc) {
      if (st.childElementCount < 2)
        for (const [name] of STATS) {
          const r = document.createElement("div");
          r.innerHTML = "<b></b><i><s></s></i><em></em>";
          /** @type {HTMLElement} */ (r.firstElementChild).textContent = name;
          st.appendChild(r);
        }
      st.style.opacity = el.style.opacity;
      STATS.forEach(([, v], k) => {
        const row = /** @type {HTMLElement} */ (st.children[k + 1]),
          g = ease((T - sc.t - 0.5 - k * 0.22) / 0.9);
        /** @type {HTMLElement} */ (row.querySelector("s")).style.transform = `scaleX(${(g * v).toFixed(3)})`;
        row.querySelector("em").textContent = `${Math.round(g * v * 100)}%`;
      });
    } else st.style.opacity = "0";
    for (const [t0, t1, a, b] of FADES)
      if (T >= t0 && T < t1) black = Math.max(black, lerp(a, b, ease((T - t0) / (t1 - t0))));
    if (shot && shot.black) black = 1;
    $("trFade").style.opacity = black.toFixed(3);
    let f = 0;
    for (const [t, s] of FLASH) if (T >= t) f = Math.max(f, s * (1 - (T - t) / 0.5));
    $("trFlash").style.opacity = Math.max(0, f).toFixed(3);
    /* letterbox: 2.39:1 throughout, opening out for the title (first person and the menu are full frame) */
    const tt = T - TITLE,
      lb = shot && (shot.fp || shot.nolb) ? 0 : 12.8 * (1 - ease(tt / 1.2));
    for (const x of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("#trailer .lb")))
      x.style.height = Math.max(0, lb).toFixed(2) + "vh";
    /* title: the logo resolves out of blur, a light sweep crosses it, then the lines below */
    const ti = $("trTitle"),
      lg = ease(tt / 1.8);
    ti.style.opacity = tt < 0 ? "0" : Math.min(1, tt / 0.9).toFixed(3);
    ti.style.filter = `blur(${((1 - lg) * 16).toFixed(1)}px)`;
    ti.style.transform = `translateY(-50%) scale(${(1.22 - 0.22 * lg + Math.max(0, tt) * 0.006).toFixed(4)})`;
    const logo = /** @type {HTMLElement} */ (ti.querySelector(".logo"));
    logo.style.backgroundPosition = `${(140 - 180 * ease((tt - 1.2) / 1.6)).toFixed(1)}% 50%`;
    /** @type {HTMLElement} */ (ti.querySelector(".tag")).style.opacity = ease((tt - 2.4) / 0.8).toFixed(3);
    /** @type {HTMLElement} */ (ti.querySelector(".foot")).style.opacity = ease((tt - 3.6) / 0.8).toFixed(3);
  }

  /* ---------------- shot list ----------------
     t: start (s). setup(): place actors (omit to continue the previous shot's action).
     update(lt, dt, st): lt = real seconds into the shot, dt = this frame's simulated time,
     st = simulated seconds into the shot. ts(lt): time scale (slow motion). look(lt): post look.
     mood: lighting. black: covered by a black card (not rendered). */
  const LANE_S = [
    [-35.4, -6],
    [-10, -6],
  ];
  /* the arena's north blast gate: a clock time at which it is shut, where the run to it starts and
     where the jump is pressed */
  const GATE_SHUT = 14,
    GATE_RUN = [-5.8, 13.9],
    GATE_JUMP = -1.7;
  /* the running leap: where on the deck's run (z) the jump is pressed; its edge is at -5.5 */
  const LEAP_Z = -4.4;
  /* where the supply pod comes down: the arena's power weapon pad, on top of the core */
  const SUPPLY_AT = [0, 4.5, 0];
  /* the sky's clock for the night shot: a shooting star crosses during it */
  const STAR_T = 5.5 * 7 - 0.4;
  /* the trailer's pods take a little less than the game's fall, to keep the cut on the music */
  const DROP_FALL = 2.3;
  const SHOTS = [
    /* ===== ACT I: cold open ===== */
    {
      t: 0,
      name: "cold-open",
      mood: "dusk",
      setup() {
        K.resetDestruction();
        put(hero, [-6.6, 5.2, 0], 0, -0.05);
        put(ally, [-2.7, 3.2, -3.7], 0.18);
        put(ally2, [2.5, 3.2, -3.9], -0.22);
      },
      update(lt, dt) {
        for (const a of [hero, ally, ally2]) drive(a, dt);
        /* low past the crates, a long lens on the squad on the high ground */
        const k = ease(lt / 5.2);
        cam(
          V(lerp(-8.7, -8.3, k), lerp(0.32, 0.62, k), lerp(-27.6, -22.8, k)),
          V(lerp(-5.9, -6.3, k), lerp(5.7, 6.2, k), 0),
          lerp(20, 13, k)
        );
      },
      look(lt) {
        const far = af(head(hero), lerp(2.5, 9, ease((lt - 2.4) / 1.2))).focus;
        return {
          dof: 1,
          focus: curve(
            [
              [0, 1.6],
              [2.3, 1.6],
              [3.4, far],
            ],
            lt
          ),
          range: curve(
            [
              [0, 1.2],
              [3.4, 7],
            ],
            lt
          ),
        };
      },
    },
    /* ===== the squad drops in from orbit: three pods burn in from 200 m, then doors off, pilots out ===== */
    {
      t: 5,
      name: "drop",
      mood: "cool",
      setup() {
        clearStage();
        K.resetDestruction();
        this.pods = [
          { a: hero, at: 0, p: [-22, 0, -6], yaw: -PI / 2 + 0.35, out: [-19.6, -6.4] },
          { a: ally, at: 0.22, p: [-25.6, 0, -3.6], yaw: -PI / 2 - 0.2, out: [-23.4, -2.9] },
          { a: ally2, at: 0.4, p: [-26.4, 0, -8.6], yaw: -PI / 2 + 0.3, out: [-24.2, -9.2] },
        ];
        for (const q of this.pods) q.sent = false;
        this.heroPod = null;
      },
      /* slow motion as the hero's pod hits */
      ts: lt =>
        curve(
          [
            [0, 1],
            [2.25, 1],
            [2.38, 0.3],
            [2.8, 0.3],
            [3.05, 1],
          ],
          lt
        ),
      update(lt, dt, st) {
        for (const q of this.pods)
          if (!q.sent && st >= q.at) {
            q.sent = true;
            const c = new V3(q.p[0], q.p[1], q.p[2]);
            const pod = K.dropPod(c, q.a.color, {
              dur: DROP_FALL,
              h: 200,
              onLand: () => {
                put(q.a, q.p, q.yaw);
                q.a.ctl = (a, s2) =>
                  s2 < 0.3 ? { ...NO } : steer(a, [[q.p[0], q.p[2]], q.out], { ...NO }, { sprint: false });
                CINE.shake(q.a === hero ? 0.7 : 0.35);
              },
            });
            if (q.a === hero) this.heroPod = pod;
          }
        for (const a of [hero, ally, ally2]) drive(a, dt);
        /* low and wide, looking up into the sky at the burning pods, then riding the hero's pod down to
           the deck and settling on the squad */
        const pod = this.heroPod,
          py = pod && !pod.landed ? pod.g.position.y : 1.3;
        const k = ease((lt - 1.7) / 0.8),
          s2 = ease((lt - 2.5) / 1.2);
        const h = hand(lt, 0.012);
        cam(
          /* a fast dolly in, arcing up over the low cover on the way */
          V(
            lerp(12, -15.6, k) + h.x,
            lerp(0.6, 0.32, k) + Math.sin(Math.PI * k) * 1.6 + h.y,
            lerp(-12, -4.4, k)
          ),
          V(lerp(-21.6, -22.6, s2), clamp(lerp(Math.min(py, 46), 1.3, s2), 1.3, 46), lerp(-5.6, -5.6, s2)),
          lerp(lerp(58, 46, k), 34, s2),
          0,
          dt
        );
      },
      look(lt) {
        return lt < 2.2 ? { dof: 0.3, focus: 60, range: 60 } : af(chest(hero), 2.2);
      },
    },
    /* ===== then you: your own pod, ridden down from inside the cockpit, and the step out by the squad ===== */
    {
      t: 7.6,
      name: "cockpit",
      fp: true,
      mood: "cool",
      setup() {
        const at = [-16.8, 0, -1.8];
        F.begin({
          pos: at,
          yaw: yawTo(V(at[0], 0, at[2]), V(-23, 0, -6)),
          w: 0,
          pod: { at, h: 170, dur: 1.85 },
        });
      },
      update(lt, dt) {
        for (const a of [hero, ally, ally2]) drive(a, dt);
        F.step(dt, {});
      },
    },
    { t: 10, name: "card-speed", black: true, setup: clearStage, update() {} },
    /* ===== speed is armor, in first person: sprint on the suit's thrusters, thrust aside from a burst,
       then the carbine down the lane ===== */
    {
      t: 11,
      name: "fp-run",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 11;
        put(foe1, [-11.2, 0, -6.4], PI / 2, 0, 30);
        foe1.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 2.4) * 0.35 });
        fpTargets = [foe1];
        F.begin({ pos: [-34.6, 0, -6], yaw: -PI / 2, w: 0 });
        this.th = false;
      },
      update(lt, dt, st) {
        const m = F.me,
          eye = V(m.pos.x, m.pos.y + 1.5, m.pos.z);
        if (!foe1.dead) {
          aimAt(foe1, eye, 0.3);
          if (st > 0.25 && rnd() < dt * 8)
            shoot(foe1, null, { at: eye, miss: 1.5, color: 0x9fdcff, snd: "shot" });
        }
        drive(foe1, dt);
        const hold = [],
          press = [];
        let look = lookAt(chest(foe1), 0.04);
        if (st < 0.72) hold.push("forward", "sprint");
        else if (st < 0.95) {
          hold.push("forward", "left");
          if (!this.th) {
            this.th = true;
            press.push("thrust");
          }
        } else {
          hold.push("forward", "fire");
          if (st > 1.25) hold.push("aim");
          look = lookAt(chest(foe1), 0.22);
        }
        F.step(dt, { hold, press, yaw: look.yaw, pitch: look.pitch });
      },
    },
    /* ===== ...and from outside: a slide under the next burst ===== */
    {
      t: 13.2,
      name: "dodge",
      mood: "hot",
      setup() {
        clearStage();
        seed = 13;
        put(hero, [-27.6, 0, -6], -PI / 2);
        hero.ctl = (a, st) => {
          const inp = steer(a, LANE_S, { ...NO });
          if (st > 1.12 && st < 1.95) {
            inp.crouch = true;
            if (once(a, "slide")) inp.crouchP = true;
          }
          return inp;
        };
        preroll([hero], 0.6);
      },
      ts: () => (hero.body.slideT > 0 ? 0.42 : 1),
      update(lt, dt, st) {
        drive(hero, dt);
        /* the burst from up the lane: high, where the pilot's head was before the slide */
        const src = V(hero.body.pos.x + 26, 1.5, -8.5);
        for (const [at, dz, dy] of [
          [0.42, 0.5, 0.4],
          [0.55, -0.3, 0.55],
          [0.66, 0.1, 0.45],
          [0.8, 0.6, 0.6],
          [0.95, -0.2, 0.5],
        ])
          if (st > at && once(hero, "b" + at))
            shoot(foe1, null, {
              from: src,
              at: V(hero.body.pos.x - 4, 1.35 + dy, -6 + dz),
              color: 0x9fdcff,
              snd: "shot",
              life: 0.35,
            });
        const p = hero.body.pos,
          h = hand(lt, 0.03);
        cam(V(p.x + 6.4 + h.x, 1.0 + h.y, -7.5), V(p.x, p.y + 1.0, p.z), 36, 7, dt);
      },
      look: () => af(chest(hero), 2.6),
    },
    { t: 15.5, name: "card-height", black: true, setup: clearStage, update() {} },
    /* ===== height is power, in first person: a blast gate rises across the lane, and you go over it ===== */
    {
      t: 16.5,
      name: "fp-gate",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        K.resetDestruction();
        /* the north gate, shut (world/gates.js: a pure function of the clock) */
        F.gatesAt(GATE_SHUT, true);
        F.begin({ pos: [GATE_RUN[0], 0, GATE_RUN[1]], yaw: -PI / 2, pitch: 0.12, w: 1 });
        this.j = false;
      },
      update(lt, dt, st) {
        const m = F.me,
          hold = ["forward", "sprint"],
          press = [];
        /* a crouch-jump at the wall: tucking the legs in the air reaches the top */
        if (!this.j && m.pos.x > GATE_JUMP) {
          this.j = true;
          press.push("jump");
        }
        if (this.j && !m.ground) hold.push("crouch");
        F.step(dt, { hold, press, pitch: lerp(m.pitch, 0.04, Math.min(1, dt * 4)) });
        void st;
      },
    },
    /* ===== up the stairs, onto the pylon, ground pound into two pilots ===== */
    {
      t: 17.7,
      name: "stairs",
      mood: "hot",
      setup() {
        F.gatesAt(0, false);
        K.resetDestruction();
        seed = 16;
        put(hero, [0, 0, 15.4], 0);
        put(foe1, [14.9, 0, 3.4], 0);
        put(foe2, [16.2, 0, 6.5], 0);
        const UP = [
          [0, 15.4],
          [0, 4.4],
          [3.6, 0.45],
          [7.5, 0.45],
        ];
        const TGT = V(15.2, 0, 4.9);
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = { ...NO };
          if (!a.leapT && b.pos.y < 5) {
            steer(a, UP, inp, { stop: false });
            if (b.pos.y > 3.1 && b.pos.x > 2.75 && once(a, "j1")) inp.jumpP = true;
            return inp;
          }
          /* on the pylon: turn to the targets, hold a beat, two steps and leap off the edge */
          if (!a.leapT) {
            if (!b.ground) return inp;
            b.yaw += clamp(angD(b.yaw, yawTo(b.pos, TGT)), -5 * H, 5 * H);
            if (Math.abs(angD(b.yaw, yawTo(b.pos, TGT))) < 0.04) a.leapT = st + 0.45;
            return inp;
          }
          if (st < a.leapT) return inp;
          if (a.poundAt == null) {
            inp.f = 1;
            b.yaw = yawTo(b.pos, TGT);
            if (b.pos.x > 7.45 && once(a, "leap")) inp.jumpP = true;
            if (!b.ground && b.vel.y < 1.2 && b.pos.x > 8.9) {
              inp.crouchP = inp.crouch = true;
              a.poundAt = st;
            }
            return inp;
          }
          const e = _a.copy(b.pos).setY(b.pos.y + 1.6);
          b.pitch = Math.atan2(TGT.y - e.y, Math.hypot(TGT.x - e.x, TGT.z - e.z));
          b.yaw = yawTo(b.pos, TGT);
          inp.crouch = st < a.poundAt + 0.62;
          return inp;
        };
        for (const f of [foe1, foe2]) face(f, hero.body.pos);
        /* the climb started 1.2 s ago (the first person shot came first) */
        preroll([hero], 1.2);
      },
      update(lt, dt) {
        drive(hero, dt);
        const p = hero.body.pos,
          k = ease((lt + 1.2) / 1.9);
        cam(V(2.7 - k * 0.6, lerp(0.45, 3.9, k), lerp(14.2, 9.6, k)), V(p.x, p.y + 1.1, p.z), 44, 6, dt);
      },
      look: () => af(chest(hero), 3),
    },
    {
      t: 18.45,
      name: "pylon",
      mood: "hot",
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2]) {
          aimAt(f, head(hero), 0.15);
          drive(f, dt);
        }
        const p = hero.body.pos;
        cam(V(15.2, 2.9, 6.8), V(p.x, p.y + 1.2, p.z), 24, 8, dt);
      },
      look: () => af(chest(hero), 5),
    },
    {
      t: 19.75,
      name: "pound",
      mood: "hot",
      ts(lt) {
        const pa = hero.poundAt;
        if (pa == null) return 1;
        const k = hero.st - pa;
        return k < 0.15 ? 0.5 : k < 0.62 ? 0.3 : 1;
      },
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2]) {
          if (!f.dead) {
            aimAt(f, head(hero), 0.2);
            if (rnd() < dt * 6) shoot(f, null, { at: head(hero), miss: 1.6, color: 0x9fdcff });
          }
          drive(f, dt);
        }
        const p = hero.body.pos,
          a = 2.1 + lt * 0.75;
        cam(V(p.x + Math.sin(a) * 4.6, p.y + 0.6, p.z + Math.cos(a) * 4.6), V(p.x, p.y + 1, p.z), 46, 10, dt);
      },
      look: () => af(chest(hero), 3),
    },
    {
      t: 21.8,
      name: "impact",
      mood: "hot",
      ts: lt =>
        curve(
          [
            [0, 0.35],
            [0.5, 0.35],
            [1.0, 1],
          ],
          lt
        ),
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2]) drive(f, dt);
        cam(V(20.5, 0.45, 8.3), V(15.2, 1.0, 4.9), 44, 0, dt, -0.05);
      },
      look: () => af(V(15.2, 1, 4.9), 4),
    },
    { t: 23, name: "card-safe", black: true, setup: clearStage, update() {} },
    /* ===== nothing is safe: a frag through the crate cluster the pilots hide behind ===== */
    {
      t: 24,
      name: "frag",
      mood: "hot",
      setup() {
        K.resetDestruction();
        seed = 23;
        put(hero, [17.2, 0, -5.4], 0);
        put(foe1, [26.7, 0, -14.3], 0);
        put(foe2, [24.5, 0, -13.9], 0.3);
        face(hero, V(25.8, 0, -10));
        for (const f of [foe1, foe2]) f.ctl = (a, st) => ({ ...NO, crouch: st < 0.5 || st > 1.6 });
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [1.45, 1],
            [1.6, 0.14],
            [2.9, 0.14],
            [3.3, 0.6],
          ],
          lt
        ),
      update(lt, dt, st) {
        drive(hero, dt);
        for (const f of [foe1, foe2]) {
          if (!f.dead) aimAt(f, head(hero), 0.25);
          drive(f, dt);
          if (!f.dead && st > 0.55 && st < 1.35 && rnd() < dt * 5)
            shoot(f, null, { at: head(hero), miss: 1.4, color: 0x9fdcff });
        }
        if (st > 0.45 && once(hero, "n")) {
          hero.firedT = st;
          throwNade(head(hero), V(25.6, 0.15, -9.15), 1.0, 0xffa040, g => {
            boom(g.b, 0xffa040, 4.8);
            endNade(g);
            for (const f of [foe1, foe2]) kill(f, g.b, 3.4);
          });
        }
        updNades();
        const h = hand(lt, 0.02);
        cam(
          V(31.6 + h.x, 0.7 + h.y, -13.2),
          V(lerp(24.8, 24.2, ease(lt / 2)), 1.0, lerp(-11.6, -10.8, ease(lt / 2))),
          46,
          0,
          dt,
          -0.03
        );
      },
      look(lt) {
        /* focus on the pilots behind cover as they rise to fire, then rack to the cover as it goes */
        const near = K.camera.position.distanceTo(chest(foe2));
        const f = curve(
          [
            [0, near],
            [1.45, near],
            [1.75, 6.6],
          ],
          lt
        );
        return { dof: 1, focus: f, range: 3 };
      },
    },
    { t: 28.5, name: "breath", black: true, setup: clearStage, update() {} },
    /* ===== the drop: one shot per bar ===== */
    {
      t: 29,
      name: "charge",
      mood: "hot",
      setup() {
        seed = 28;
        put(hero, [-17.4, 0, -21.5], -PI / 2);
        put(foe1, [-6.4, 0, -21.5], PI / 2);
        const R = [
          [-17.4, -21.5],
          [-4, -21.5],
        ];
        hero.ctl = (a, st) => {
          const inp = steer(a, R, { ...NO }, { stop: false });
          if (a.hitT != null) return { ...NO };
          if (a.body.sprintT > 0.85 && a.body.pos.distanceTo(foe1.body.pos) < 3.3 && once(a, "m"))
            inp.meleeP = true;
          return inp;
        };
        hero.hitT = null;
      },
      ts: lt =>
        hero.hitT != null
          ? curve(
              [
                [0, 0.2],
                [0.55, 0.2],
                [0.8, 1],
              ],
              lt - hero.hitT
            )
          : 1,
      update(lt, dt) {
        drive(hero, dt);
        if (!foe1.dead) {
          aimAt(foe1, head(hero), 0.4);
          if (rnd() < dt * 5) shoot(foe1, null, { at: head(hero), miss: 1.2, color: 0x9fdcff });
        }
        drive(foe1, dt);
        if (hero.body.chargeT > 0 && !foe1.dead && hero.body.pos.distanceTo(foe1.body.pos) < 1.9) {
          hero.hitT = lt;
          kill(foe1, hero.body.pos, 3.8);
          K.sfx("land", 1);
          K.sfx("boom", 0.4);
          K.shock(chest(foe1));
          CINE.shake(0.5);
        }
        const m = _c.copy(hero.body.pos).lerp(foe1.body.pos, 0.4).setY(1.15);
        cam(V(m.x - 1.5, 0.95, -17.6), m, 40, 6, dt);
      },
      look: () => af(chest(hero), 3),
    },
    /* ===== the power weapon: a rocket into a pair holding the lane ===== */
    {
      t: 31,
      name: "rocket",
      mood: "hot",
      setup() {
        K.resetDestruction();
        seed = 30;
        put(hero, [-8.6, 0, -12.6], -PI / 2);
        put(foe1, [2.6, 0, -16.2], PI / 2);
        put(foe2, [4.4, 0, -15.1], PI / 2 + 0.2);
        hero.wpn = 3;
        hero.hitT = null;
        this.aim = null;
        rockets.clear();
        for (const f of [foe1, foe2]) f.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 3 + a.id.length) * 0.4 });
      },
      ts: lt =>
        hero.hitT != null
          ? curve(
              [
                [0, 0.22],
                [0.7, 0.22],
                [1, 1],
              ],
              lt - hero.hitT
            )
          : 1,
      update(lt, dt, st) {
        const tgt = V(3.5, 0.25, -15.6);
        aimAt(hero, tgt, 0.6);
        drive(hero, dt);
        for (const f of [foe1, foe2]) {
          if (!f.dead) {
            aimAt(f, head(hero), 0.3);
            if (rnd() < dt * 5) shoot(f, null, { at: head(hero), miss: 1.5, color: 0x9fdcff });
          }
          drive(f, dt);
        }
        if (st > 0.45 && once(hero, "rk")) {
          const y = hero.body.yaw;
          const m = hero.body.pos
            .clone()
            .add(
              _a.set(
                -Math.sin(y) * 0.8 + Math.cos(y) * 0.22,
                hero.body.h - 0.3,
                -Math.cos(y) * 0.8 - Math.sin(y) * 0.22
              )
            );
          hero.firedT = shotSim;
          K.thrustPuff(m, _b.set(Math.sin(y), 0, Math.cos(y)));
          rockets.fire(m, tgt.clone().sub(m).normalize(), {
            targets: () => [],
            onExplode(c) {
              hero.hitT = lt;
              CINE.shake(0.9);
              for (const f of [foe1, foe2]) kill(f, c, 4.2);
            },
          });
        }
        rockets.step(dt);
        /* the launcher comes up in a front three-quarter; on the shot, cut wide and pan with the
           rocket all the way into the pair */
        const p = hero.body.pos,
          r = rockets.list[0];
        if (!r && hero.hitT == null && !hero.once.has("rk")) {
          const k = ease(lt / 0.45);
          cam(V(p.x + 2.6, lerp(1.2, 1.45, k), p.z + 1.9), V(p.x, p.y + 1.45, p.z), 34, 4, dt);
        } else {
          if (once(hero, "cut")) CINE.cut();
          const lookAt = r ? r.pos : tgt;
          this.aim = this.aim || new V3();
          this.aim.lerp(lookAt, r ? 1 : Math.min(1, dt * 6));
          cam(V(-4.4, 1.05, -10.3), _c.copy(this.aim).setY(Math.max(0.6, this.aim.y)), 44, 3, dt);
        }
      },
      look: lt => (hero.once.has("rk") ? af(V(1.5, 1, -14.6), 7, { near: 0 }) : af(chest(hero), 2.8)),
    },
    /* ===== in first person: the scope eases up to 5x, then 10x, onto a pilot crossing far below ===== */
    {
      t: 33,
      name: "fp-sniper",
      fp: true,
      mood: "cool",
      setup() {
        clearStage();
        seed = 32;
        put(foe1, [16, 0, -21.5], PI / 2);
        foe1.ctl = (a, st) =>
          steer(
            a,
            [
              [16, -21.5],
              [3, -21.5],
            ],
            { ...NO },
            { stop: false }
          );
        fpTargets = [foe1];
        F.begin({ pos: [0.6, 3.23, -3.6], yaw: yawTo(V(0.6, 0, -3.6), V(12, 0, -21.5)), pitch: -0.18, w: 2 });
        this.z = 0;
        this.fired = false;
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [0.98, 1],
            [1.05, 0.25],
            [1.6, 0.25],
            [1.8, 1],
          ],
          lt
        ),
      update(lt, dt, st) {
        drive(foe1, dt);
        const press = [],
          hold = [];
        /* two clicks of the scope: 5x, then 10x */
        if ((this.z === 0 && st > 0.04) || (this.z === 1 && st > 0.42)) {
          press.push("aim");
          this.z++;
        }
        /* tracking the head, a little behind it, then on it for the shot */
        const hp = head(foe1);
        let look = lookAt(hp, 0.3);
        if (lt >= 1 && !this.fired) {
          this.fired = true;
          hold.push("fire");
          look = lookAt(hp, 1);
        }
        F.step(dt, { hold, press, yaw: look.yaw, pitch: look.pitch });
      },
    },
    {
      t: 35,
      name: "air",
      mood: "hot",
      setup() {
        seed = 34;
        $("trScope").hidden = true;
        put(hero, [22.2, 2.6, 24.4], PI / 2);
        put(foe1, [12.2, 0, 19.6], 0, 0, 40);
        put(foe2, [11.0, 0, 22.8], 0, 0, 40);
        for (const f of [foe1, foe2]) face(f, hero.body.pos);
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = { ...NO };
          if (b.ground && b.pos.y > 2) {
            steer(
              a,
              [
                [22.2, 24.4],
                [17, 24.1],
              ],
              inp,
              { stop: false }
            );
            if (b.pos.x < 19.7 && once(a, "j")) inp.jumpP = true;
          } else {
            inp.f = 0.3;
            inp.aim = true;
          }
          return inp;
        };
        hero.lastSh = null;
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [0.45, 1],
            [0.6, 0.3],
            [1.6, 0.3],
            [1.85, 1],
          ],
          lt
        ),
      update(lt, dt, st) {
        drive(hero, dt);
        const tgt = !foe1.dead ? foe1 : foe2;
        if (!hero.body.ground && !tgt.dead) {
          aimAt(hero, head(tgt), 0.5);
          const sh = Math.floor(st / 0.11);
          if (sh !== hero.lastSh && st > 0.4) {
            hero.lastSh = sh;
            shoot(hero, tgt, { dmg: 26, headshot: tgt.body.shield <= 0, power: 2, snd: "shot" });
          }
        }
        for (const f of [foe1, foe2]) {
          if (!f.dead) aimAt(f, head(hero), 0.3);
          drive(f, dt);
        }
        const p = hero.body.pos;
        cam(V(15.6, 2.6, 28.4), V(p.x - 0.6, p.y + 1.1, p.z), 38, 9, dt, 0.04);
      },
      look: () => af(chest(hero), 4),
    },
    {
      t: 37,
      name: "melee",
      mood: "hot",
      setup() {
        seed = 36;
        put(hero, [-25.2, 0, 15.5], -PI / 2);
        put(foe1, [-18.4, 0, 15.5], PI / 2);
        hero.hitT = null;
        hero.ctl = (a, st) => {
          const inp = { ...NO, f: a.hitT == null ? 1 : 0 };
          if (st > 0.3 && once(a, "t")) inp.thrust = true;
          if (a.body.pos.distanceTo(foe1.body.pos) < 2.2 && once(a, "m")) inp.meleeP = true;
          return inp;
        };
      },
      ts: lt =>
        hero.hitT != null
          ? curve(
              [
                [0, 0.18],
                [0.6, 0.18],
                [0.9, 1],
              ],
              lt - hero.hitT
            )
          : 1,
      update(lt, dt) {
        drive(hero, dt);
        if (!foe1.dead) {
          aimAt(foe1, head(hero), 0.4);
          if (rnd() < dt * 6) shoot(foe1, null, { at: head(hero), miss: 1.3, color: 0x9fdcff });
        }
        drive(foe1, dt);
        if (hero.body.meleeT > 0 && !foe1.dead && hero.body.pos.distanceTo(foe1.body.pos) < 2.4) {
          hero.hitT = lt;
          kill(foe1, hero.body.pos, 3.4);
          K.shock(chest(foe1));
          K.sfx("land", 1);
          CINE.shake(0.45);
        }
        const p = hero.body.pos;
        cam(V(-21.1, 0.6, 12.4), V(lerp(p.x, foe1.body.pos.x, 0.5), 1.1, 15.5), 38, 6, dt, 0.1);
      },
      look: () => af(chest(hero), 3),
    },
    {
      t: 39,
      name: "plasma",
      mood: "cool",
      setup() {
        seed = 38;
        put(foe1, [-32, 0, 7], -PI / 2);
        foe1.ctl = (a, st) =>
          steer(
            a,
            [
              [-32, 7],
              [-8, 7],
            ],
            { ...NO }
          );
      },
      update(lt, dt, st) {
        drive(foe1, dt);
        if (st > 0.15 && once(foe1, "p")) {
          const g = throwNade(
            V(-24, 1.6, -1),
            chest(foe1).add(_a.set(6.4, 0, 0)),
            0.65,
            0x52b8ff,
            null,
            foe1
          );
          g.onLand = () => K.sfx("stick", 1);
        }
        if (st > 1.45 && once(foe1, "boom")) {
          const p = chest(foe1);
          K.blast(p, 0x52b8ff, 7);
          K.shock(p);
          K.sfx("boom", 1);
          CINE.shake(0.5);
          kill(foe1, p, 3);
          for (const g of grenades) endNade(g);
        }
        updNades();
        const p = foe1.body.pos;
        cam(V(p.x + 1.8, 1.9, 11.7), V(p.x, 1.1, p.z), 40, 5, dt);
      },
      look: () => af(chest(foe1), 3),
    },
    /* ===== every mode, live: the mode picker over the arena ===== */
    {
      t: 41,
      name: "menu",
      nolb: true,
      mood: "dusk",
      setup() {
        clearStage();
        menuKeep = K.MENU.sel.mode;
        $("menu").hidden = false;
        /* the mode cards in view */
        const card = document.getElementById("mode-ctf");
        if (card) card.scrollIntoView({ block: "center" });
        this.picks = ["ctf", "slayer", "ffa", "oddball"];
        this.i = 0;
      },
      update(lt) {
        /* the cards are picked one after another, as a player would */
        while (this.i < this.picks.length && lt >= 0.15 + this.i * 0.45) {
          const el = document.getElementById("mode-" + this.picks[this.i++]);
          if (el) el.click();
        }
        const a = 0.6 + lt * 0.09;
        cam(V(Math.sin(a) * 30, 14, Math.cos(a) * 30), V(0, 2, 0), 50);
      },
      look: () => ({ dof: 0 }),
    },
    /* capture the flag on Twin Foundry, AI against AI */
    {
      t: 43,
      name: "ctf-crane",
      ctf: true,
      mood: null,
      setup() {
        $("menu").hidden = true;
        menuRestore();
        startCTF("ctf", undefined, g => g.t > 25 && g.agents.some(a => a.carrying && a.alive), 6000);
        this.c = G.agents.find(a => a.carrying) || null;
      },
      update(lt, dt) {
        const c = this.c && this.c.carrying && this.c.alive ? this.c : null;
        if (!c) {
          const m = action(),
            e = ease(lt / 2.5);
          cam(V(lerp(-44, -32, e), lerp(30, 21, e), lerp(-30, -10, e)), _c.copy(m).setY(0), 50, 2, dt);
          return;
        }
        /* in front of the carrier, a little to the side, walking backwards with them */
        const b = c.body,
          fx = -Math.sin(b.yaw),
          fz = -Math.cos(b.yaw),
          head = _a.set(b.pos.x, b.pos.y + 1.5, b.pos.z);
        const want = V(b.pos.x + fx * 3.4 + fz * 1.1, b.pos.y + 1.35, b.pos.z + fz * 3.4 - fx * 1.1);
        const d = want.clone().sub(head),
          L = d.length(),
          hit = K.rayWorld(head, d.normalize(), L);
        if (hit < L) want.copy(head).addScaledVector(d, Math.max(0.8, hit - 0.3));
        cam(want, V(b.pos.x, b.pos.y + 1.1, b.pos.z), 46, 6, dt);
      },
      look() {
        const c = this.c && this.c.carrying && this.c.alive ? this.c : null;
        return c ? af(chest(c), 1.6) : { dof: 0 };
      },
    },
    /* in first person: their flag in both hands, walking it home (carriers walk) */
    {
      t: 45.5,
      name: "fp-flag",
      fp: true,
      ctf: true,
      setup() {
        const h = CTF.FLAG_HOME[1],
          to = CTF.FLAG_HOME[0];
        const d = _a.copy(to).sub(h).setY(0).normalize();
        fpTeam = 0;
        fpCarry = "flag";
        F.begin({ pos: [h.x + d.x * 4, h.y + 0.05, h.z + d.z * 4], yaw: yawTo(h, to), w: 1 });
      },
      update(lt, dt) {
        F.step(dt, { hold: ["forward"] });
      },
    },
    /* Team Slayer on the arena: the camera rides with whoever is in the fight */
    {
      t: 47.5,
      name: "slayer",
      ctf: true,
      setup() {
        startCTF("slayer", "arena");
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        if (!focus) return;
        CINE.apply(CINE.track(focus, 4.4, 1.5, 1.9, 4, 54)(), 4, dt);
      },
      look: () => (focus ? af(chest(focus), 3.5) : {}),
    },
    /* oddball: the skull burns in from orbit in its own pod */
    {
      t: 50.5,
      name: "oddball",
      ctf: true,
      setup() {
        startCTF("oddball", "arena", g => g.ball && g.t >= g.ball.landAt - K.POD_TIME + 0.2);
        this.aim = null;
      },
      update(lt, dt) {
        /* low and wide, the lens on the burning pod all the way down, then on the skull */
        const home = CTF.BALL_HOME,
          pod = K.PODS.find(p => !p.landed);
        this.pod = pod || this.pod;
        const tgt = pod ? pod.g.position.clone() : V(home.x, home.y + 0.6, home.z);
        this.aim = this.aim || tgt.clone();
        this.aim.lerp(tgt, pod ? 1 : Math.min(1, dt * 6));
        const h = hand(lt, 0.02),
          up = pod ? clamp((pod.g.position.y - home.y) / 200, 0, 1) : 0;
        cam(V(home.x + 5.5 + h.x, home.y + 2.5 + h.y, home.z + 9.5), this.aim, lerp(46, 26, up), 0, dt);
      },
      look: () => (K.PODS.some(p => !p.landed) ? { dof: 0 } : af(CTF.BALL_HOME, 6)),
    },
    /* in first person: the skull in hand (a carrier can't shoot; the team fights around them) */
    {
      t: 53.5,
      name: "fp-skull",
      fp: true,
      ctf: true,
      setup() {
        const h = CTF.BALL_HOME;
        fpTeam = 0;
        fpCarry = "skull";
        F.begin({ pos: [h.x + 2.4, h.y + 0.05, h.z + 1.2], yaw: yawTo(h, V(0, 0, 20)), w: 1 });
      },
      update(lt, dt) {
        F.step(dt, { hold: ["forward", "sprint"] });
      },
    },
    /* free-for-all: eight pilots, every one for themself, seen from high and steep */
    {
      t: 55.5,
      name: "ffa",
      ctf: true,
      setup() {
        startCTF("ffa", "arena");
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        const c = focus ? focus.body.pos : action(),
          a = 0.6 + lt * 0.1;
        cam(V(c.x + Math.sin(a) * 12, 19, c.z + Math.cos(a) * 12), V(c.x, 0, c.z), 34, 2, dt);
      },
      look: () => af(focus ? focus.body.pos : action(), 5, { near: 0.5 }),
    },
    /* a power weapon arrives in a supply pod: the crate punches into its pad and the lid blows */
    {
      t: 58,
      name: "supply",
      mood: "hot",
      setup() {
        stopCTF();
        K.resetDestruction();
        F.clearSupply();
        clearStage();
        this.sent = false;
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [1.38, 1],
            [1.45, 0.3],
            [1.8, 0.3],
            [1.95, 1],
          ],
          lt
        ),
      update(lt, dt, st) {
        if (!this.sent && st > 0.05) {
          this.sent = true;
          this.pod = F.supply(SUPPLY_AT, 1.4);
        }
        /* the lens rides the crate down out of the sky onto its pad */
        const pad = V(SUPPLY_AT[0], SUPPLY_AT[1] + 0.9, SUPPLY_AT[2]),
          c = this.pod && !this.pod.landed ? this.pod.g.position : pad;
        const up = clamp((c.y - pad.y) / 140, 0, 1);
        cam(V(SUPPLY_AT[0] + 2.3, SUPPLY_AT[1] + 1.2, SUPPLY_AT[2] + 8.7), c, lerp(44, 22, up), 0, dt);
      },
      look() {
        return this.pod && !this.pod.landed
          ? { dof: 0 }
          : af(V(SUPPLY_AT[0], SUPPLY_AT[1] + 0.9, SUPPLY_AT[2]), 5);
      },
    },
    /* ===== under the hood: thousands of headless matches tune every number ===== */
    {
      t: 60,
      name: "sim-tilt",
      ctf: true,
      mood: null,
      setup() {
        startCTF("ctf");
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        const c = focus ? focus.body.pos : action(),
          a = 0.9 + lt * 0.07;
        cam(V(c.x + Math.sin(a) * 11, 21, c.z + Math.cos(a) * 11), V(c.x, 0, c.z), 32, 2, dt);
      },
      look: () => af(focus ? focus.body.pos : action(), 5, { near: 0.5 }),
    },
    /* ===== motion captured: a weighted stop, a pivot and the push-off back ===== */
    {
      t: 64,
      name: "pivot",
      mood: "hot",
      setup() {
        stopCTF();
        K.resetDestruction();
        seed = 64;
        put(hero, [-33.5, 0, -6], -PI / 2);
        /* a sprint down the lane, a hard stop, a beat, then round and back the way it came */
        hero.ctl = (a, st) => {
          const b = a.body;
          if (st < 1.15) return steer(a, LANE_S, { ...NO }, { stop: false });
          if (st < 1.75) return { ...NO };
          b.yaw += clamp(angD(b.yaw, PI / 2), -8 * H, 8 * H);
          return { ...NO, f: Math.abs(angD(b.yaw, PI / 2)) < 0.5 ? 1 : 0, sprint: true };
        };
      },
      ts: () => (hero.st > 1.12 && hero.st < 1.5 ? 0.45 : 1),
      update(lt, dt) {
        drive(hero, dt);
        const p = hero.body.pos,
          h = hand(lt, 0.025);
        this.cx = this.cx == null ? p.x : lerp(this.cx, p.x, Math.min(1, dt * 3));
        cam(V(this.cx + 1.5 + h.x, 0.7 + h.y, -11.2), V(p.x, p.y + 0.95, p.z), 34, 0, dt);
      },
      look: () => af(chest(hero), 2.2),
    },
    /* ===== a running leap off the deck, and the hard landing four metres down ===== */
    {
      t: 66.4,
      name: "leap",
      mood: "hot",
      setup() {
        seed = 66;
        put(hero, [-4, 3.25, 1.4], 0);
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = { ...NO };
          if (b.ground && b.pos.y > 2.5) {
            steer(
              a,
              [
                [-4, 1.4],
                [-4, -12],
              ],
              inp,
              { stop: false }
            );
            if (b.pos.z < LEAP_Z && once(a, "j")) {
              inp.jumpP = true;
              a.jT = st;
            }
          } else if (b.ground && once(a, "down")) a.downT = st;
          else if (!b.ground) inp.f = 1;
          return inp;
        };
        hero.downT = hero.jT = null;
      },
      /* slow at the takeoff and on the landing */
      ts: () => {
        if (hero.downT != null) return hero.st - hero.downT < 0.55 ? 0.3 : 1;
        return hero.jT != null && hero.st - hero.jT < 0.3 ? 0.4 : 1;
      },
      update(lt, dt) {
        drive(hero, dt);
        const p = hero.body.pos,
          h = hand(lt, 0.02);
        cam(V(-10.5 + h.x, 0.6 + h.y, -10.5), V(p.x, p.y + 0.9, p.z), 30, 6, dt);
      },
      look: () => af(chest(hero), 3),
    },
    /* ===== hits land: each one rocks the pilot the way it came, the shield goes, and they crumple ===== */
    {
      t: 69.3,
      name: "hits",
      mood: "hot",
      setup() {
        clearStage();
        seed = 69;
        put(foe1, [-8.2, 0, -9.2], PI / 2, 0, 50);
        foe1.ctl = () => ({ ...NO });
        this.n = 0;
      },
      ts: () => (foe1.dead ? 0.4 : 1),
      update(lt, dt, st) {
        drive(foe1, dt);
        /* a magnum's rhythm: four on the shield and the body, from the left */
        const T0 = [0.25, 0.6, 0.95, 1.3];
        while (this.n < T0.length && st >= T0[this.n]) {
          const last = ++this.n === T0.length;
          /* from off screen down the floor, a little to the left each time */
          shoot(foe1, foe1, {
            from: V(-24, 1.45, -9.6 - this.n * 0.3),
            dmg: last ? 200 : 22,
            snd: "pshot",
            power: 1.2,
          });
        }
        const p = foe1.body.pos;
        cam(V(p.x + 2.4, 0.95, p.z + 2.8), V(p.x, 1.05, p.z), 36, 0, dt, 0.03);
      },
      look: () => af(chest(foe1), 2),
    },
    /* ===== at night on the high ground: the squad celebrates (captured cheer, flex and wave) ===== */
    {
      t: 71.2,
      name: "emotes",
      mood: "night",
      setup() {
        clearStage();
        K.resetDestruction();
        /* in a row on the deck's edge, facing the camera */
        put(hero, [-3.4, 3.2, -1.2], 0);
        put(ally, [-1.6, 3.2, -2.6], 0);
        put(ally2, [-2.2, 3.2, -0.2], 0);
        for (const a of [hero, ally, ally2]) face(a, V(-5.6, 0, -11));
        this.em = [
          [ally, 0.05, "cheer"],
          [hero, 0.2, "flex"],
          [ally2, 0.35, "wave"],
        ];
        this.i = 0;
        F.sky(STAR_T);
      },
      update(lt, dt, st) {
        for (const a of [hero, ally, ally2]) drive(a, dt);
        while (this.i < this.em.length && st >= this.em[this.i][1]) {
          const [a, , name] = this.em[this.i++];
          a.rig.emote(name);
        }
        /* low and slow, pushing in, the night sky over their heads */
        const k = ease(lt / 1.8);
        cam(
          V(lerp(-6.4, -5.8, k), lerp(3.7, 3.9, k), lerp(-11.4, -10.4, k)),
          V(-2.6, 4.3, -1.4),
          lerp(30, 26, k),
          0,
          dt
        );
      },
      look: () => af(chest(hero), 5, { streak: 0.7 }),
    },
    /* ===== climax: a leap frozen in time ===== */
    {
      t: 73,
      name: "run-up",
      mood: "dusk",
      setup() {
        stopCTF();
        K.resetDestruction();
        seed = 56;
        put(hero, [22, 0, -12.3], PI);
        put(foe1, [20.6, 0, 12.6], 0);
        put(foe2, [24.1, 0, 12.2], 0);
        put(foe3, [22.4, 0, 14.8], 0);
        for (const f of [foe1, foe2, foe3]) face(f, hero.body.pos);
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = { ...NO };
          if (b.ground && !a.leapt) {
            steer(
              a,
              [
                [22, -12.3],
                [22, 8],
              ],
              inp,
              { stop: false }
            );
            if (b.pos.z > 1.2 && once(a, "j")) {
              inp.jumpP = true;
              a.leapt = true;
            }
          } else {
            inp.f = 0.4;
            inp.aim = true;
            if (b.vel.y < 4 && once(a, "t")) {
              inp.thrust = true;
              inp.f = 1;
            }
          }
          return inp;
        };
        hero.leapt = false;
      },
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2, foe3]) {
          aimAt(f, head(hero), 0.2);
          drive(f, dt);
        }
        const p = hero.body.pos,
          h = hand(lt, 0.04);
        cam(V(22.6 + h.x, 0.9 + h.y, p.z + 7.2), V(p.x, p.y + 1.0, p.z), 38, 6, dt);
      },
      look: () => af(chest(hero), 3),
    },
    {
      t: 75,
      name: "freeze",
      mood: "dusk",
      setup() {
        this.shots = [0.55, 1.25, 1.95];
        this.fired = 0;
      },
      ts: lt =>
        curve(
          [
            [0, 0.25],
            [0.25, 0.035],
            [2.85, 0.035],
            [3.02, 1],
          ],
          lt
        ),
      update(lt, dt) {
        drive(hero, dt);
        const fs = [foe1, foe2, foe3];
        /* three shots inside the frozen moment; they land when time snaps back */
        while (this.fired < 3 && lt >= this.shots[this.fired]) {
          const f = fs[this.fired++];
          aimAt(hero, head(f), 1);
          shoot(hero, null, { at: head(f), snd: "shot", life: 3 });
          hero.firedT = shotSim;
        }
        if (lt >= 3.02 && once(hero, "snap"))
          fs.forEach((f, i) => {
            K.shieldPop(chest(f));
            K.sfx("pop", 0.9);
            kill(f, hero.body.pos, 2.2 + i * 0.3);
          });
        for (const f of fs) drive(f, dt);
        /* the camera circles the pilot in real time while the world holds still */
        const p = hero.body.pos,
          k = ease(lt / 3.1),
          a = lerp(PI - 0.45, PI + 2.7, k),
          r = lerp(3.6, 5.2, k);
        cam(
          V(p.x + Math.sin(a) * r, p.y + lerp(0.6, 1.4, k), p.z + Math.cos(a) * r),
          V(p.x, p.y + 1.1, p.z),
          lerp(40, 50, k),
          0,
          dt
        );
      },
      look: () => af(chest(hero), 2.4, { streak: 0.7 }),
    },
    {
      t: 78.2,
      name: "aftermath",
      mood: "dusk",
      ts: lt =>
        curve(
          [
            [0, 0.5],
            [0.6, 0.5],
            [0.8, 1],
          ],
          lt
        ),
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2, foe3]) drive(f, dt);
        cam(V(25.6, 0.5, 17.2), V(22, 1.1, 10), 42, 0, dt, 0.04);
      },
      look: () => af(V(22, 1, 12.8), 4),
    },
    /* ===== title over a slow aerial ===== */
    {
      t: 79,
      name: "title",
      mood: "dusk",
      setup() {
        clearStage();
        K.resetDestruction();
      },
      update(lt) {
        const k = ease(lt / 12),
          a = 2.4 + k * 0.5;
        cam(V(Math.sin(a) * 46, lerp(16, 26, k), Math.cos(a) * 46), V(0, 2, 0), 40);
      },
      look: () => ({ dof: 0.6, focus: 46, range: 18 }),
    },
  ];
  TR.shots = SHOTS.map(s => ({ t: s.t, name: s.name }));

  /* ---------------- CTF montage support ---------------- */
  /**
   * a live AI-vs-AI match of any mode (rules: ctf, slayer, ffa or oddball; map: a MAPS key), fast-
   * forwarded silently into the action: until(G) stops the fast-forward early (at most max steps)
   */
  function startCTF(rules = "ctf", map = undefined, until = null, max = 1150) {
    if (G && G.rules === rules && G.mapKey === (map || "ctf")) return;
    stopCTF();
    clearStage();
    setMood(null);
    G = CTF.Game({ mode: "sim", render: true, diff: ["legendary", "legendary"], rules, map });
    CTF.UI.attach(G, "sim");
    CTF.UI.quiet = true;
    $("ctfHud").hidden = true;
    /* fast-forward into the match silently (the play before the cut isn't heard) */
    K.sfxTap(() => {});
    G.start();
    for (let i = 0; i < max && !(until && until(G)); i++) G.step(1 / 30);
    CTF.UI.frame(1 / 30);
    K.sfxTap(TR.recording ? tap : null);
  }
  function stopCTF() {
    if (!G) return;
    CTF.UI.detach();
    G = null;
    focus = null;
    CTF.exitMap();
    K.setPilotCollider(TR.active ? NO_PILOTS : null);
  }
  function action() {
    if (!G) return V(0, 0, 0);
    const c = new V3();
    let n = 0;
    for (const a of G.agents)
      if (a.alive) {
        c.add(a.body.pos);
        n++;
      }
    return n ? c.multiplyScalar(1 / n) : c;
  }
  /* who the camera follows in the live match: the flag carrier and pilots in a fight, moving fast
     with open ground ahead. A pilot pressed against a wall (or who just bumped one) makes a poor shot. */
  const _f = new V3();
  function watch(a) {
    if (a._tw) return;
    a._tw = true;
    const on = a.onEvent.bind(a);
    a.onEvent = (ty, d) => {
      if (ty === "bump") a._bumpT = G.t;
      on(ty, d);
    };
  }
  function clearAhead(a) {
    const b = a.body,
      sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp < 0.5) return 0;
    _f.set(b.vel.x / sp, 0, b.vel.z / sp);
    return K.rayWorld(_c.copy(b.pos).setY(b.pos.y + 1.0), _f, 4);
  }
  function interest(a) {
    watch(a);
    const b = a.body;
    let s = 0;
    if (a.carrying) s += 100;
    if (a.target && G.t >= a.acqT) s += 30;
    if (a.role === "attack" || a.role === "escort" || a.role === "carry") s += 8;
    s += Math.min(9, Math.hypot(b.vel.x, b.vel.z)) * 2.5;
    if (clearAhead(a) < 2.5) s -= 40;
    if (a._bumpT != null && G.t - a._bumpT < 2) s -= 60;
    s -= b.pos.length() * 0.05;
    return s;
  }
  function pickFocus(force) {
    if (!G) return;
    if (!focus) force = true;
    focusT -= 1 / 30;
    const stuck = focus && focus._bumpT != null && G.t - focus._bumpT < 0.3;
    if (!force && !stuck && focus && focus.alive && focusT > 0) return;
    let best = null,
      bs = -1e9;
    for (const a of G.agents) {
      if (!a.alive) continue;
      const s = interest(a);
      if (s > bs) {
        bs = s;
        best = a;
      }
    }
    if (best !== focus) {
      focus = best;
      if (!force) CINE.cut();
    }
    focusT = 2.5;
  }

  /* ---------------- frame ---------------- */
  /** is a point inside level geometry (the camera must never be) */
  function inside(p) {
    const m = 0.06;
    for (const b of K.SOLID)
      if (
        p.x > b.x0 - m &&
        p.x < b.x1 + m &&
        p.y > b.y0 - m &&
        p.y < b.y1 + m &&
        p.z > b.z0 - m &&
        p.z < b.z1 + m
      )
        return b;
    return null;
  }
  /* safety net: a camera that ends up inside geometry slides toward what it looks at until it is
     clear. Scripted shots are designed never to need it (logged in diag.cam and tested); the live
     match's chase cameras can. */
  const _l = new V3(),
    _q = new V3();
  function unclip(S) {
    const c = K.camera,
      b = inside(c.position);
    if (!b) return;
    if (!S.ctf) diag.cam.push({ t: +T.toFixed(2), shot: S.name, box: b.id || b.pid || "" });
    c.getWorldDirection(_l);
    _q.copy(c.position);
    for (let d = 0.25; d < 12; d += 0.25) {
      c.position.copy(_q).addScaledVector(_l, d);
      if (!inside(c.position)) return;
    }
    c.position.copy(_q);
  }
  function frame(dt, render = true) {
    let i = SHOTS.length - 1;
    while (i > 0 && T < SHOTS[i].t) i--;
    if (i !== shotI) {
      shotI = i;
      const was = shot;
      shot = SHOTS[i];
      shotSim = 0;
      CINE.cut();
      /* out of first person: back to the trailer's own cameras */
      if (was && was.fp && !shot.fp) {
        F.end();
        fpTargets = [];
        fpCarry = "";
      }
      if (shot.setup) shot.setup();
      if (shot.mood !== undefined) setMood(shot.mood);
    }
    const S = shot,
      lt = T - S.t,
      ts = S.ts ? S.ts(lt) : 1,
      sdt = dt * ts;
    shotSim += sdt;
    if (S.ctf && G) {
      let r = sdt;
      while (r > 1e-6) {
        const h = Math.min(r, 1 / 30);
        G.step(h);
        r -= h;
      }
      CTF.UI.frame(sdt);
    }
    if (S.fp) {
      /* first person: the game loop moves the player, places the camera, runs the effects and the
         HUD, and renders (S.update calls F.step) */
      CINE.look(Object.assign({}, LOOK0, LOOK_FP, S.look ? S.look(lt) : null));
      S.update(lt, sdt, shotSim);
      updOverlay();
      return;
    }
    S.update(lt, sdt, shotSim);
    if (!S.black) unclip(S);
    K.updFX(sdt);
    if (TR.recording) F.hooks(sdt);
    updOverlay();
    if (!render || S.black) return;
    CINE.look(Object.assign({}, LOOK0, S.look ? S.look(lt) : null));
    K.renderFrame();
  }

  /* ---------------- start / stop ---------------- */
  function begin(record) {
    K.setPilotCollider(NO_PILOTS);
    cast();
    K.EVENTS.setContext({ map: "arena", mode: "trailer" });
    K.audio();
    T = 0;
    shotI = -1;
    shot = null;
    cardI = -1;
    focus = null;
    diag.bumps.length = diag.cam.length = diag.log.length = 0;
    TR.active = true;
    TR.recording = !!record;
    sfxLog.length = 0;
    K.sfxTap(record ? tap : null);
    K.extFull(Object.assign({ full: liveFrame, exit: cleanup }, EXT_HOOKS));
    F.capture(!!record);
    K.vmRoot.visible = false;
    const ov = $("trailer");
    ov.hidden = false;
    ov.classList.toggle("rec", !!record);
    $("trCard").className = "";
    $("trCard").style.opacity = "0";
    $("trScope").hidden = true;
    const fp = $("fps");
    if (fp) fp.style.visibility = "hidden";
    if (!record && K.AC) {
      const ac = K.AC;
      music = ac.createGain();
      music.gain.value = Math.max(0.0001, K.SET.master);
      music.connect(ac.destination);
      musicStart = ac.currentTime + 0.12;
      SC.score(ac, music, musicStart);
      $("trSound").hidden = ac.state === "running";
    }
    lastWall = performance.now();
  }
  /* live: the audio clock is the master clock, so picture stays locked to the music */
  let lastAt = -1,
    lastAtWall = 0;
  function liveFrame() {
    if (TR.recording) return;
    const ac = K.AC,
      w = performance.now(),
      wallDt = Math.min(0.05, (w - lastWall) / 1000);
    let t = T + wallDt;
    if (music && ac && ac.state === "running") {
      const at = Math.max(0, ac.currentTime - musicStart);
      $("trSound").hidden = true;
      if (at !== lastAt) {
        lastAt = at;
        lastAtWall = w;
        t = at;
      } else if (w - lastAtWall < 250) t = T;
    } /* a stalled audio clock falls back to wall time */
    lastWall = w;
    const dt = Math.min(0.05, Math.max(0, t - T));
    T = t;
    frame(dt);
    if (T >= TR.END) stop();
  }
  function cleanup() {
    TR.active = false;
    K.sfxTap(null);
    SC.stop();
    if (music) {
      try {
        music.gain.setTargetAtTime(0, K.AC.currentTime, 0.05);
        const m = music;
        setTimeout(() => {
          try {
            m.disconnect();
          } catch (e) {}
        }, 400);
      } catch (e) {}
      music = null;
    }
    F.end();
    F.capture(false);
    F.gatesAt(0, false);
    F.clearSupply();
    fpTargets = [];
    fpCarry = "";
    menuRestore();
    clearStage();
    stopCTF();
    setMood(null);
    CINE.look(null);
    K.resetDestruction();
    $("trailer").hidden = true;
    const fp = $("fps");
    if (fp) fp.style.visibility = "";
    K.camera.fov = 78;
    K.camera.updateProjectionMatrix();
    K.camera.rotation.z = 0;
    K.setPilotCollider(null);
  }
  function stop() {
    if (TR.active) K.extStop();
  }
  TR.start = () => begin(false);
  TR.stop = stop;
  /* capture: step the timeline by a fixed amount and render, without audio */
  TR.record = () => begin(true);
  TR.step = (dt, render = true) => {
    T += dt;
    frame(dt, render);
    return T;
  };
  /** jump ahead by simulating (not drawing) every step on the way */
  TR.seek = t => {
    while (T < t - 1e-6) TR.step(Math.min(1 / 30, t - T), false);
    CINE.look(Object.assign({}, LOOK0, shot && shot.look ? shot.look(T - shot.t) : null));
  };
  K.defineMode({ id: "trailer", name: "Trailer", start: () => TR.start() });
  $("trExit").onclick = stop;
  $("trSound").onclick = () => {
    const ac = K.AC;
    if (ac) ac.resume();
  };
  addEventListener("keydown", e => {
    if (TR.active && !TR.recording && e.code === "Escape") {
      e.preventDefault();
      stop();
    }
  });
})();
