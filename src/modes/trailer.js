/* ===== Trailer: a scripted cinematic cut of the game, synced to the score in modes/trailer-score.js.
   Scenes drive real pilots (engine physics, rigs and effects) with scripted input: pilots follow
   routes that are steered every physics step, so they run where the shot needs them and never into
   walls (any collision at speed is logged in TR.diag.bumps, and the tests fail on one). The first
   person scenes are played the way the game is played: the player's own pilot, viewmodel and HUD from
   the real game loop, fed scripted input (game/trailer-fp.js), so every round, grenade, rocket, jump
   and melee in them is the game's own. Every scene says what it is about (its beats: the shot hits,
   the target drops, the grenade lands on its mark, the jump makes its ledge, the pod lands where it
   is framed), and tests/trailer.test.js steps the whole cut and fails on a beat that misses: a
   retuned weapon or move breaks the test, not the video. The live matches are seeded, so the test and
   a recording see the same match. The camera and lighting are graded per scene (depth of field,
   split-tone grade and color push, lens fringing, anamorphic streaks, a lighting mood), with impacts
   that kick the lens, digital glitches at chosen cuts, whip pans, crash zooms and dolly zooms.
   The timeline is a pure function of trailer time, so the same cut can play live (clocked by the
   music) or be stepped frame by frame for video capture.

   The cut ("Ignition", 120 BPM, a bar is 2 s, 84 s):
     0-12    cold open: a holo line boots on black; three pods burn in from orbit at dusk; riding the
             hero's pod down; your own pod from the cockpit; the squad's pods slam in (slow motion);
             the hero rises out of the crater, low angle into the sun, and a crash zoom to black: FIGHT
     12-30   ignition, cutting first person against third: a slide under fire and a thrust out of it,
             the chase cam on a sprint and a jump-thrust, a sideways thrust out of a burst, the
             carbine through a shield, over the shoulder into first person with the magnum, a vault
             over a rising blast gate, a hover on the stabilizer and two kills from the air, the camera
             circling the hover, a ground pound with a dolly zoom, the shoulder charge in first person
             and from outside, a kill from behind, a shield shattered and recharged in cover
     30-46   the arsenal: the sniper at 4.5x and 10x, the long shot with a rack focus, the rocket in
             first person and riding a rocket into a pair, the scattergun, the frag, the plasma stuck
             to a runner, a supply pod from orbit, the squad advancing, a slide with the magnum
     46-60   the arena: a drone over a blast gate rising, a capture of the flag, the carrier's walk,
             the skull's pod, free-for-all from above, the spectator's free camera
     60-75   the set piece: two squads collide, a burst in first person, a thrust back out of a rocket,
             the chase up the core and off its edge, bullet time circling the hero in the air, time
             snaps back and three drop, a ground pound and a dolly zoom, the walk out of the dust, the
             play of the game over the shoulder into first person
     75-84   the title
*/
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
  /** what went wrong in the last run: pilots hitting walls, the camera inside geometry, an event
      log, and each scene's beats (did the shot hit, the grenade land on its mark, the jump reach its
      ledge: [{ t, shot, what, ok, info }], checked as each scene ends) */
  const diag = { bumps: [], cam: [], log: [], beats: [] };
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
    END: SC.LENGTH,
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
      broke: false,
      slamT: null,
    });
    a.rig.showTag(false);
    a.rig.root.visible = false;
    actors.push(a);
    return a;
  }
  let hero, ally, ally2, foe1, foe2, foe3, foe4, foe5;
  function cast() {
    if (hero) return;
    hero = mk(COL.hero);
    ally = mk(COL.ally);
    ally2 = mk(COL.ally2);
    foe1 = mk(COL.foe);
    foe2 = mk(COL.foe2);
    foe3 = mk(COL.foe3);
    foe4 = mk(COL.foe);
    foe5 = mk(COL.foe2);
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
      broke: false,
      slamT: null,
    });
    a.once.clear();
  }
  const face = (a, p) => (a.body.yaw = yawTo(a.body.pos, p));
  function clearStage() {
    for (const a of actors) {
      a.on = false;
      a.rig.root.visible = false;
    }
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
      a.slamT = T;
      punch(1.3);
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
    punch(0.35);
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
  function boom(p, color, r, dmg = 4000) {
    K.blast(p, color, r * 1.4);
    K.shock(p);
    K.dust(p, 30, 3, 1.4, 0.8);
    K.sfx("boom", 1);
    K.damageRadius(p, r, dmg, true);
    CINE.shake(0.6);
    punch(1);
  }

  /* ---------------- camera, look and mood ---------------- */
  function cam(p, l, fov = 50, smooth = 0, dt = 0, roll = 0) {
    CINE.apply({ p, l, fov }, smooth, dt, roll);
  }
  const LOOK0 = {
    dof: 0,
    focus: 10,
    range: 6,
    near: 1,
    grade: 1.1,
    ca: 0.006,
    streak: 0.45,
    vig: 0.18,
    tint: [-0.1, 0.04, 0.16],
  };
  /* first person is the game's own look, lightly graded */
  const LOOK_FP = { dof: 0, grade: 0.6, ca: 0.003, streak: 0.2, vig: 0.08 };

  /* ---------------- impacts, glitches and whip pans ----------------
     punch(): a kill, a blast or a slam kicks the lens (fringing, streaks, a zoom blur), and it fades.
     GLITCH: [start, seconds, strength] digital tears at chosen cuts. A scene's whipIn / whipOut (+1 or
     -1) whips the camera into or out of it. All of it rides on top of each scene's own look. */
  let punchV = 0;
  const punch = (s = 1) => (punchV = Math.max(punchV, s));
  /** @type {[number, number, number][]} */
  const GLITCH = [];
  function glitchAt(t) {
    let g = 0;
    for (const [t0, d, s] of GLITCH) if (t >= t0 && t < t0 + d) g = Math.max(g, s * (1 - (t - t0) / d));
    return g;
  }
  let whipV = 0;
  /** a whip pan's swing at this moment of a scene (radians, signed) */
  function whipAt(S, lt) {
    const W = 0.14,
      nx = SHOTS[shotI + 1];
    if (S.whipIn && lt < W) return S.whipIn * Math.pow(1 - lt / W, 2);
    if (S.whipOut && nx && nx.t - T < W) return -S.whipOut * Math.pow(1 - (nx.t - T) / W, 2);
    return 0;
  }
  /** a scene's look with the punch, the glitches and the whip on top */
  function withFx(L) {
    const o = Object.assign({}, L),
      g = glitchAt(T);
    if (g > 0) {
      o.glitch = Math.max(o.glitch || 0, g);
      o.gseed = Math.floor(T * 30) % 97;
    }
    if (punchV > 0.01) {
      o.ca = (o.ca || 0) + punchV * 0.016;
      o.streak = (o.streak || 0) + punchV * 0.5;
      o.zoom = (o.zoom || 0) + punchV * 0.1;
    }
    if (whipV) o.smear = [whipV * 0.07, 0];
    return o;
  }

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
          if (had && a.body.shield <= 0) {
            K.shieldPop(chest(a));
            a.broke = true;
          }
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
  /* the player's eye height standing (game/loop.js) */
  const EYE = 1.62;
  /**
   * the camera pitch at which the player's frag goes off on a mark: each candidate is thrown the way
   * weapons/grenades.js throws it (the view direction lifted by 0.12, the game's throw speed) in a
   * world of its own (no damage), with the game's gravity, skips, rolling and fuse, stepped the way the
   * trailer steps (1/30 s), and the one whose blast is nearest the mark wins (of those that never carry
   * more than 2.5 m past it: frags skip and roll a long way). Retuned grenades move the pitch with them.
   */
  function solveThrow(eye, yaw, mark) {
    let best = 0,
      bestD = 1e9;
    for (let p = -1; p <= 0.7; p += 0.005) {
      const cp = Math.cos(p),
        d = V(-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp);
      d.y += 0.12;
      d.normalize();
      const w = new K.NadeWorld(false),
        n = w.throw(
          "frag",
          eye.clone().addScaledVector(d, 0.45),
          d.clone().multiplyScalar(K.NADE_TUNE.throw),
          null
        );
      const L = Math.hypot(mark.x - eye.x, mark.z - eye.z),
        ux = (mark.x - eye.x) / L,
        uz = (mark.z - eye.z) / L;
      let past = 0;
      for (let i = 0; i < 300 && w.list.length; i++) {
        w.step(1 / 30);
        past = Math.max(past, (n.pos.x - eye.x) * ux + (n.pos.z - eye.z) * uz - L);
      }
      const miss = Math.hypot(n.pos.x - mark.x, n.pos.z - mark.z);
      if (past < 2.5 && miss < bestD) {
        bestD = miss;
        best = p;
      }
    }
    return { pitch: best, miss: bestD };
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
    /* (moods are in the legacy light units the game was tuned in) */
    sun.intensity = m.i * K.LIGHT_K;
    if (hemi) hemi.intensity = m.hemi * K.LIGHT_K;
    fog.color.set(m.fog);
    fog.near = m.near;
    fog.far = m.far;
    if (K.scene.background && K.scene.background.set) K.scene.background.set(m.fog);
    if (K.skyTint) K.skyTint.set(m.sky[0], m.sky[1], m.sky[2]);
  }

  /* ---------------- overlay: cards, black, fades, flashes, the replay and spectator frames, the title ----------------
     Cards: "holoBlack" (a holographic HUD card on black, typed in) or "holo" (a holo lower third over the
     picture). They flicker on, type themselves in, and tear with the glitches. */
  /** @type {{t: number, d: number, eb?: string, big?: string, sub?: string, kind: string}[]} */
  const CARDS = [];
  /* [start, end, from, to] opacity of the black layer */
  /** @type {[number, number, number, number][]} */
  const FADES = [];
  /* [time, strength] white flashes */
  /** @type {[number, number][]} */
  const FLASH = [];
  let TITLE = 999;
  /* a cheap repeatable flicker: 0..1 from a number */
  const hash = n => {
    const s = Math.sin(n * 91.345 + 7.13) * 43758.5453;
    return s - Math.floor(s);
  };
  /** the first n characters of a line, with a cursor while it types */
  const typed = (s, n) => (n >= s.length ? s : s.slice(0, Math.max(0, n)) + "▌");
  function updOverlay() {
    let i = -1;
    for (let k = 0; k < CARDS.length; k++) {
      const c = CARDS[k],
        pad = c.kind === "holoBlack" ? 0 : 0.35;
      if (T >= c.t - pad && T < c.t + c.d + pad) i = k;
    }
    const el = $("trCard");
    if (i !== cardI) {
      cardI = i;
      if (i >= 0) el.className = CARDS[i].kind;
    }
    let black = 0;
    if (i >= 0) {
      const c = CARDS[i],
        tt = T - c.t;
      /* the eyebrow types in, then the line, then the line under it */
      el.querySelector(".eb").textContent = typed(c.eb || "", Math.floor(tt * 60));
      el.querySelector(".big").textContent = typed(c.big || "", Math.floor((tt - 0.1) * 36));
      el.querySelector(".sub").textContent = typed(c.sub || "", Math.floor((tt - 0.28) * 60));
      if (c.kind === "holoBlack") black = 1;
      /* it flickers on, holds and flickers off; a glitch tears it sideways */
      const fl = tt < 0.16 || c.t + c.d - T < 0.12 ? (hash(Math.floor(T * 60)) > 0.4 ? 1 : 0.15) : 1,
        g = glitchAt(T),
        io = c.kind === "holo" ? ease(tt / 0.2) * (1 - ease((T - (c.t + c.d)) / 0.3)) : 1;
      el.style.opacity = (fl * io).toFixed(3);
      el.style.filter = g > 0 ? `blur(${(g * 2.2).toFixed(1)}px)` : "none";
      const jx = g > 0 ? (hash(T * 77) - 0.5) * 34 * g : 0;
      el.style.transform = `${c.kind === "holo" ? "" : "translateY(-50%) "}translateX(${jx.toFixed(1)}px) scale(${(1 + 0.012 * tt).toFixed(4)})`;
    } else el.style.opacity = "0";
    for (const [t0, t1, a, b] of FADES)
      if (T >= t0 && T < t1) black = Math.max(black, lerp(a, b, ease((T - t0) / (t1 - t0))));
    if (shot && shot.black) black = 1;
    $("trFade").style.opacity = black.toFixed(3);
    let f = 0;
    for (const [t, s] of FLASH) if (T >= t) f = Math.max(f, s * (1 - (T - t) / 0.4));
    $("trFlash").style.opacity = Math.max(0, f).toFixed(3);
    /* the replay's frame and scanlines; the spectator's viewfinder */
    const rp = !!(shot && shot.replay),
      sp = !!(shot && shot.spec);
    $("trReplay").hidden = !rp;
    $("trScan").style.opacity = rp ? "0.3" : "0";
    if (rp)
      $("trReplay").querySelector(".tc").textContent =
        `00:${(14.2 + (T - 72.75) * 0.6).toFixed(2).padStart(5, "0")}`;
    $("trSpec").hidden = !sp;
    if (sp) $("trSpec").querySelector(".alt").textContent = `Alt ${K.camera.position.y.toFixed(1)} m`;
    /* letterbox: 2.39:1 throughout, opening out for the title (first person is full frame) */
    const tt = T - TITLE,
      lb = shot && shot.fp ? 0 : 12.8 * (1 - ease(tt / 1.2));
    for (const x of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("#trailer .lb")))
      x.style.height = Math.max(0, lb).toFixed(2) + "vh";
    /* title: the logo resolves out of blur through a glitch, a light sweep crosses it, then the lines below */
    const ti = $("trTitle"),
      lg = ease(tt / 1.5),
      g = tt > 0 ? glitchAt(T) : 0,
      fl = tt > 0 && tt < 0.35 ? (hash(Math.floor(T * 60) + 3) > 0.35 ? 1 : 0.2) : 1;
    ti.style.opacity = tt < 0 ? "0" : (Math.min(1, tt / 0.6) * fl).toFixed(3);
    ti.style.filter = `blur(${((1 - lg) * 12 + g * 3).toFixed(1)}px)`;
    const jx = g > 0 ? (hash(T * 53) - 0.5) * 40 * g : 0;
    ti.style.transform = `translateY(-50%) translateX(${jx.toFixed(1)}px) scale(${(1.16 - 0.16 * lg + Math.max(0, tt) * 0.006).toFixed(4)})`;
    const logo = /** @type {HTMLElement} */ (ti.querySelector(".logo"));
    logo.style.backgroundPosition = `${(140 - 180 * ease((tt - 1.0) / 1.6)).toFixed(1)}% 50%`;
    /** @type {HTMLElement} */ (ti.querySelector(".tag")).style.opacity = ease((tt - 1.8) / 0.7).toFixed(3);
    /** @type {HTMLElement} */ (ti.querySelector(".foot")).style.opacity = ease((tt - 2.8) / 0.7).toFixed(3);
  }

  /* ---------------- the cut's toolkit ---------------- */
  /* (actors by name: they are cast when the trailer starts, after the scenes are built) */
  const actorNamed = n => ({ hero, ally, ally2, foe1, foe2, foe3, foe4, foe5 })[n];
  /** a beat: these pilots are down (or the ones still up, with their shield and health) */
  const dead =
    (...names) =>
    () => {
      const fs = names.map(actorNamed);
      return {
        ok: fs.every(x => x.dead),
        alive: fs.filter(x => !x.dead).map(x => [x.id, Math.round(x.body.shield), Math.round(x.body.health)]),
      };
    };
  /** a beat: a pilot's move (thrust, slide, clamber, jump, charge, slam...) happened during the scene */
  const happened = (who, ev) =>
    function () {
      const id = actorNamed(who).id;
      return diag.log.some(e => e.who === id && e.ev === ev && e.t >= this.t - 1e-6);
    };
  TR.actor = actorNamed;
  const near = (p, q, r) => !!p && !!q && Math.hypot(p.x - q.x, p.z - q.z) <= r;
  const fwdOf = yaw => V(-Math.sin(yaw), 0, -Math.cos(yaw)),
    rightOf = yaw => V(Math.cos(yaw), 0, -Math.sin(yaw));
  /** a dolly zoom: the distance that keeps a subject the same size when the lens goes from fov0 to fov */
  const dollyD = (d0, fov0, fov) => (d0 * Math.tan((fov0 * PI) / 360)) / Math.tan((fov * PI) / 360);
  /**
   * first person: the yaw and pitch that put the camera (where the game fires from, along its view) on
   * a point. The view is the pilot's look plus the gun's sway, kick and the scope's drift, so this
   * steers by the camera's own last direction: the difference between where it points and where it
   * should, closed a share k a frame
   */
  function aimFP(p, k = 1) {
    const c = K.camera,
      d = c.getWorldDirection(_a),
      m = F.me,
      e = c.position;
    const cy = Math.atan2(-d.x, -d.z),
      cp = Math.asin(clamp(d.y, -1, 1));
    const wy = Math.atan2(-(p.x - e.x), -(p.z - e.z)),
      wp = Math.atan2(p.y - e.y, Math.hypot(p.x - e.x, p.z - e.z));
    return { yaw: m.yaw + angD(cy, wy) * k, pitch: m.pitch + (wp - cp) * k };
  }
  /** first person: hold the trigger for a moment at each of these shot times (the gun fires once a pull) */
  const pull = (st, times, len = 0.1) => times.some(t => st >= t && st < t + len);
  /** step the first-person game in slices no longer than a frame (a fast-forwarded shot) */
  function fpSteps(dt, inp) {
    const n = Math.max(1, Math.ceil(dt / (1 / 30) - 1e-6));
    for (let i = 0; i < n; i++) F.step(dt / n, i === 0 ? inp : Object.assign({}, inp, { press: [] }));
  }
  /** the enemy's fire at a point: tracers past it, from a pilot (miss: how wide) */
  function fireAt(a, p, rate, dt, miss = 1.4) {
    if (a.dead || !a.on) return;
    aimAt(a, p, 0.3);
    if (rnd() < dt * rate) shoot(a, null, { at: p, miss, color: 0x9fdcff, snd: "shot" });
  }
  /** first person: the player's eye (for enemies to fire at) */
  const fpEye = () => V(F.me.pos.x, F.me.pos.y + 1.5, F.me.pos.z);
  /** a head, led by the frame to come (the round leaves along this frame's view next frame): a burst at
      the head does body damage while the shield holds, then the kill */
  const leadHead = (a, dt) => head(a).addScaledVector(a.body.vel, dt);
  /* the frag's spot search: the farthest spot down a line, and the pitch, whose frag (the game's own
     speed, gravity, skips and fuse) goes off on a mark */
  function fragSpot(mark, z, x0, x1) {
    for (let x = x0; x <= x1; x += 0.5) {
      const floor = K.groundBelow(x, z, 6, 0.3),
        s = solveThrow(V(x, floor + EYE, z), yawTo(V(x, 0, z), mark), mark);
      if (s.miss < 0.6) return { from: [x, 0, z], pitch: s.pitch, miss: s.miss };
    }
    return { from: [(x0 + x1) / 2, 0, z], pitch: 0.08, miss: -1 };
  }
  /**
   * the yaw and pitch that stick a plasma grenade on a pilot running in a straight line: each candidate
   * is thrown the way weapons/grenades.js throws it, in a world of its own, against where the pilot will
   * be (p0 + v t, `lag` seconds after now), and the one that sticks nearest the chest wins
   */
  function solvePlasma(eye, p0, v, lag, yaw0) {
    let best = null;
    for (let dy = -0.4; dy <= 0.4; dy += 0.01)
      for (let p = -0.25; p <= 0.5; p += 0.01) {
        const yaw = yaw0 + dy,
          cp = Math.cos(p),
          d = V(-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp);
        d.y += 0.12;
        d.normalize();
        let t = lag;
        /** @type {{ t: number } | null} */
        let stuck = null;
        const at = new V3();
        const owner = {
          stickables() {
            at.copy(p0).addScaledVector(v, t);
            return [{ pos: at, h: 1.8, ref: "tgt" }];
          },
          onStick() {
            stuck = { t };
          },
        };
        const w = new K.NadeWorld(false),
          n = w.throw(
            "plasma",
            eye.clone().addScaledVector(d, 0.45),
            d.clone().multiplyScalar(K.NADE_TUNE.throw),
            owner
          );
        for (let i = 0; i < 60 && w.list.length && !stuck; i++) {
          w.step(1 / 30);
          t += 1 / 30;
        }
        if (stuck) {
          const c = at.clone().setY(at.y + 1.8 * 0.6),
            e = n.pos.distanceTo(c);
          if (!best || e < best.e) best = { yaw, pitch: p, e, t: stuck.t };
        }
      }
    return best;
  }
  /** the gates' highest top (a gate rising) */
  const gateTop = id => {
    const g = K.GATES.live.find(x => x.id === id);
    return g ? g.lift * g.h : 0;
  };
  /* where the squad's pods come down, and the hero's */
  const LZ = { hero: [-22, 0, 8], ally: [-26, 0, 4.5], ally2: [-28, 0, 8.5] };
  /* where the supply pod comes down: the arena's power weapon pad, on top of the core */
  const SUPPLY_AT = [0, 4.5, 0];
  /* the bullet-time finale: the hero hangs over the south lane, three pilots below */
  const HANG = [-2.4, 4.4, -8.6],
    BELOW = [
      [-5.2, 0, -15.2],
      [-2.2, 0, -16.0],
      [1.8, 0, -15.4],
    ];

  /* ================= the scenes, in order =================
     setup(): place actors (omit to carry on the last scene's action). update(lt, dt, st): lt = real
     seconds into the scene, dt = this frame's simulated time, st = simulated seconds. ts(lt): time scale
     (slow motion, speed ramps). look(lt): the post look. fp: played in first person by the game itself.
     whipIn / whipOut: a whip pan into or out of the scene (the sign is the direction). beats: what the
     scene is about, checked as it ends ([what, fn], fn called on the scene: true or { ok }). */
  /** @type {any[]} */
  const SCENES = [
    /* ===== COLD OPEN ===== */
    /* black: the system boots, a holo line types itself in */
    { name: "boot", black: true, setup: clearStage, update() {} },
    /* dusk over the arena: three pods burn in from orbit */
    {
      name: "sky",
      mood: "dusk",
      setup() {
        clearStage();
        K.resetDestruction();
        F.gatesAt(0, false);
        this.pods = [hero, ally, ally2].map((a, i) => {
          const p = LZ[["hero", "ally", "ally2"][i]];
          return K.dropPod(V(p[0], 0, p[2]), a.color, { h: 170, dur: 2.5 + i * 0.25, quiet: i > 0 });
        });
        this.y0 = this.pods.map(p => p.g.position.y);
      },
      update(lt, dt) {
        const k = ease(lt / 2),
          g = this.pods[0].g.position;
        this.aim = this.aim || g.clone();
        this.aim.lerp(g, Math.min(1, dt * 6));
        cam(V(-6 + k * 0.6, 0.4 + k * 0.4, -31), this.aim, lerp(16, 24, k), 0, dt);
      },
      look: () => ({ dof: 0, streak: 1.1, vig: 0.35 }),
      beats: [
        [
          "three pods burn in from orbit",
          function () {
            const y = this.pods.map(p => +p.g.position.y.toFixed(0));
            return { ok: this.pods.every((p, i) => !p.landed && y[i] < this.y0[i] - 40), y };
          },
        ],
      ],
    },
    /* riding the hero's pod down: the arena rushing up under it */
    {
      name: "ride",
      mood: "dusk",
      setup() {
        clearStage();
        this.pod = K.dropPod(V(LZ.hero[0], 0, LZ.hero[2]), hero.color, { h: 120, dur: 1.7 });
        this.y0 = this.pod.g.position.y;
      },
      update(lt, dt) {
        const g = this.pod.g.position,
          h = hand(lt * 3, 0.08);
        cam(
          V(g.x + 3.2 + h.x, g.y + 2.4 + h.y, g.z - 4.2),
          V(g.x - 2, g.y - 14, g.z + 7),
          lerp(58, 72, ease(lt / 1.5)),
          0,
          dt,
          Math.sin(lt * 2.2) * 0.1
        );
        CINE.shake(0.12);
      },
      look: lt => ({ dof: 0, streak: 1, zoom: 0.15 + 0.25 * ease(lt / 1.5), vig: 0.4 }),
      beats: [
        [
          "the pod falls toward the arena",
          function () {
            const y = this.pod.g.position.y;
            return { ok: !this.pod.landed && y < this.y0 - 60 && y > 8, y };
          },
        ],
      ],
    },
    /* your own pod, from the cockpit, down to the deck: the doors blow and you step out */
    {
      name: "cockpit",
      fp: true,
      mood: "dusk",
      setup() {
        clearStage();
        const at = [-19.5, 0, 4.2];
        F.begin({
          pos: at,
          yaw: yawTo(V(at[0], 0, at[2]), V(-8, 0, 2)),
          w: 0,
          pod: { at, h: 170, dur: 1.7 },
        });
      },
      update(lt, dt) {
        F.step(dt, {});
      },
      beats: [["your pod lands and you step out", () => !F.me.dead && !K.myPod]],
    },
    /* the squad's pods slam in, low and wide, in slow motion */
    {
      name: "impact",
      mood: "dusk",
      setup() {
        clearStage();
        K.resetDestruction();
        this.drops = [
          [hero, LZ.hero, -PI / 2 + 0.25, 0.3],
          [ally, LZ.ally, -PI / 2 - 0.3, 0.46],
          [ally2, LZ.ally2, -PI / 2 + 0.1, 0.58],
        ].map(([a, p, yaw, at]) => {
          const d = { a, p, yaw, at, pod: null, put: false };
          d.pod = K.dropPod(V(p[0], 0, p[2]), a.color, {
            h: 90,
            dur: at,
            quiet: a !== hero,
            onLand: () => {
              put(a, p, yaw);
              a.ctl = (b, s2) => ({ ...NO, crouch: s2 < 0.55 });
              d.put = true;
              CINE.shake(a === hero ? 0.8 : 0.4);
              punch(a === hero ? 1 : 0.5);
            },
          });
          return d;
        });
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [0.27, 1],
            [0.33, 0.22],
            [0.95, 0.22],
            [1.25, 1],
          ],
          lt
        ),
      update(lt, dt) {
        for (const a of [hero, ally, ally2]) drive(a, dt);
        const h = hand(lt, 0.02);
        cam(V(-15.4 + h.x, 0.3 + h.y, 6.2), V(-23.6, 1.5, 7.3), 32, 0, dt, -0.03);
      },
      look: () => ({ dof: 0.5, focus: 8.5, range: 9, streak: 0.8 }),
      beats: [
        [
          "the three pods land where they are framed",
          function () {
            const off = this.drops.map(
              d => +Math.hypot(d.a.body.pos.x - d.p[0], d.a.body.pos.z - d.p[2]).toFixed(2)
            );
            return { ok: this.drops.every(d => d.put && d.pod.landed) && off.every(o => o < 0.6), off };
          },
        ],
      ],
    },
    /* the hero rises out of the crater, low angle, the sun behind; then a crash zoom into the visor */
    {
      name: "hero-rise",
      mood: "dusk",
      setup() {
        hero.ctl = (a, st) => ({ ...NO, crouch: st < 0.4, aim: st > 0.8 });
        ally.ctl = (a, st) => ({ ...NO, aim: st > 0.6 });
        ally2.ctl = (a, st) => ({ ...NO, aim: st > 0.7 });
      },
      update(lt, dt) {
        for (const a of [hero, ally, ally2]) drive(a, dt);
        aimAt(hero, V(-12, 1.6, 2), 0.1);
        const p = hero.body.pos,
          up = ease(lt / 1.15),
          z = ease((lt - 1.2) / 0.5);
        const l = V(p.x, lerp(0.7, 1.72, up), p.z);
        cam(V(-20.4, 0.16 + up * 0.1, 5.7), l, lerp(lerp(30, 25, up), 6, z), 0, dt);
      },
      look(lt) {
        const z = ease((lt - 1.2) / 0.5);
        return Object.assign(af(head(hero), 2.6), { streak: 1.2, zoom: z * 0.55 });
      },
      beats: [["the hero stands and raises the carbine", () => !hero.body.crouch && hero.body.aiming]],
    },
    /* black: one word */
    { name: "card-fight", black: true, setup: clearStage, update() {} },

    /* ===== IGNITION: speed is armor ===== */
    /* first person: a sprint down the lane under fire, a slide, out of it with a jump and a thrust */
    {
      name: "fp-slide",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 120;
        put(foe1, [-5.4, 0, -6.8], PI / 2);
        foe1.ctl = () => ({ ...NO, aim: true });
        fpTargets = [];
        F.begin({ pos: [-31, 0, -6], yaw: -PI / 2, pitch: -0.02, w: 0 });
        this.s = 0;
        this.slid = this.airThrust = false;
      },
      update(lt, dt, st) {
        drive(foe1, dt);
        const m = F.me,
          e = fpEye();
        /* the burst goes high: where the head was before the slide */
        if (st > 0.2) fireAt(foe1, e.clone().add(V(0, 0.9, 0)), 10, dt, 1.2);
        const hold = ["forward"],
          press = [];
        if (this.s === 0) {
          hold.push("sprint");
          if (st > 0.42) {
            press.push("crouch");
            this.s = 1;
          }
        } else if (this.s === 1) {
          hold.push("crouch");
          if (st > 0.92) {
            press.push("jump");
            this.s = 2;
          }
        } else if (this.s === 2 && st > 1.02) {
          press.push("thrust");
          this.s = 3;
        }
        F.step(dt, { hold, press, pitch: lerp(m.pitch, this.s === 1 ? 0.05 : -0.02, Math.min(1, dt * 6)) });
        if (m.slideT > 0) this.slid = true;
        if (m.thrustT > 0 && !m.ground) this.airThrust = true;
      },
      beats: [
        [
          "a slide under the fire, then out of it with a jump and a thrust",
          function () {
            return { ok: this.slid && this.airThrust, slid: this.slid, thrust: this.airThrust };
          },
        ],
      ],
    },
    /* the chase cam, low behind a sprint: a jump and a thrust forward */
    {
      name: "chase-thrust",
      mood: "hot",
      setup() {
        clearStage();
        seed = 132;
        put(hero, [-6, 0, -32], PI);
        hero.ctl = (a, st) => {
          const inp = steer(
            a,
            [
              [-6, -32],
              [-6, -8],
            ],
            { ...NO },
            { stop: false }
          );
          if (st > 0.72 && once(a, "j")) inp.jumpP = true;
          if (st > 0.84 && once(a, "t")) {
            inp.thrust = true;
            inp.f = 1;
          }
          return inp;
        };
        preroll([hero], 0.55);
        this.cx = null;
      },
      update(lt, dt) {
        drive(hero, dt);
        const b = hero.body,
          p = b.pos,
          h = hand(lt * 2, 0.05);
        cam(
          V(p.x + 0.8 + h.x, 0.55 + p.y * 0.6 + h.y, p.z - 3.3),
          V(p.x, p.y + 1.2, p.z + 6),
          66,
          10,
          dt,
          0.03
        );
        if (b.thrustT > 0) CINE.shake(0.3);
      },
      look: () => af(chest(hero), 3, { streak: 0.8 }),
      beats: [["the chase cam rides a sprint, a jump and a thrust", happened("hero", "thrust")]],
    },
    /* a thrust sideways out of a burst, in slow motion */
    {
      name: "dodge",
      mood: "hot",
      whipOut: 1,
      setup() {
        clearStage();
        seed = 142;
        put(hero, [31, 0, -6], PI / 2);
        put(foe1, [10, 0, -6.2], -PI / 2);
        hero.ctl = (a, st) => {
          const inp = steer(
            a,
            [
              [31, -6],
              [12, -6],
            ],
            { ...NO },
            { stop: false }
          );
          if (st > 0.4 && once(a, "t")) Object.assign(inp, { thrust: true, s: -1, f: 0.1 });
          return inp;
        };
        this.z0 = -6;
      },
      ts: () => (hero.body.thrustT > 0 ? 0.26 : 1),
      update(lt, dt, st) {
        drive(hero, dt);
        drive(foe1, dt);
        const p = hero.body.pos;
        aimAt(foe1, chest(hero), 0.5);
        /* the burst comes down the lane at chest height, through where the pilot was */
        for (const at of [0.34, 0.42, 0.5, 0.58, 0.68, 0.8])
          if (st > at && once(hero, "b" + at))
            shoot(foe1, null, {
              at: V(p.x - 6, 1.35, -6 + (rnd() - 0.5) * 0.4),
              color: 0x9fdcff,
              snd: "shot",
              life: 0.35,
            });
        const h = hand(lt, 0.02);
        cam(V(p.x - 5.6 + h.x, 0.9 + h.y, -8.8), V(p.x, p.y + 1.0, p.z), 42, 6, dt);
      },
      look: () => af(chest(hero), 2.6),
      beats: [
        [
          "the thrust takes the pilot sideways out of the burst",
          function () {
            const dz = hero.body.pos.z - this.z0;
            return { ok: happened("hero", "thrust").call(this) && dz > 1.5, dz };
          },
        ],
      ],
    },
    /* first person: the carbine's bursts break a shield, and the next one is a head shot */
    {
      name: "fp-carbine",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 155;
        put(foe1, [-6, 0, 16.4], 0, 0, 25);
        foe1.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 2.6) * 0.35 });
        fpTargets = [foe1];
        F.begin({ pos: [-6, 0, 30], yaw: 0, pitch: -0.03, w: 0 });
      },
      update(lt, dt, st) {
        drive(foe1, dt);
        fireAt(foe1, fpEye(), 7, dt, 1.3);
        const hold = [];
        if (st > 0.3) hold.push("aim");
        if (st > 0.48 && !foe1.dead) hold.push("fire");
        const look = aimFP(leadHead(foe1, dt), st < 0.3 ? 0.25 : 1);
        F.step(dt, { hold, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [
        [
          "the bursts break the shield and the head shot drops the pilot",
          () => ({ ok: foe1.dead && foe1.broke, broke: !!foe1.broke }),
        ],
      ],
    },
    /* over the shoulder on the platform: the magnum's first round on a pilot below... */
    {
      name: "ots",
      mood: "hot",
      setup() {
        clearStage();
        seed = 170;
        put(hero, [-21.2, 2.6, -21.2], 0);
        hero.wpn = 1;
        hero.ctl = () => ({ ...NO, aim: true });
        put(foe2, [-12.4, 0, -16.6], 0, 0, 40);
        face(foe2, hero.body.pos);
        foe2.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 2.4) * 0.3 });
        aimAt(hero, head(foe2), 1);
        this.fired = false;
      },
      update(lt, dt, st) {
        aimAt(hero, head(foe2), 0.5);
        drive(hero, dt);
        drive(foe2, dt);
        fireAt(foe2, head(hero), 4, dt, 1.3);
        if (st > 0.72 && !this.fired) {
          this.fired = true;
          shoot(hero, foe2, { dmg: 20, snd: "pshot", power: 1.2 });
          punch(0.3);
        }
        const b = hero.body,
          f = b.aimDir(),
          r = rightOf(b.yaw);
        cam(
          V(b.pos.x - f.x * 2.6 + r.x * 0.95, b.pos.y + 2.2, b.pos.z - f.z * 2.6 + r.z * 0.95),
          head(foe2),
          lerp(46, 38, ease(lt)),
          0,
          dt
        );
      },
      look: () => af(chest(foe2), 9, { near: 0.4 }),
      beats: [
        [
          "the first magnum round lands on the shield",
          () => ({ ok: !foe2.dead && foe2.body.shield <= 21, sh: foe2.body.shield }),
        ],
      ],
    },
    /* ...and into first person, mid-fight: the shield goes, then the head */
    {
      name: "fp-magnum",
      fp: true,
      mood: "hot",
      setup() {
        const b = hero.body;
        hero.on = false;
        hero.rig.root.visible = false;
        fpTargets = [foe2];
        F.begin({ pos: [b.pos.x, b.pos.y, b.pos.z], yaw: b.yaw, pitch: b.pitch, w: 1, w2: 0 });
        this.n = 0;
      },
      update(lt, dt, st) {
        drive(foe2, dt);
        fireAt(foe2, fpEye(), 4, dt, 1.3);
        const hold = ["aim"];
        if (pull(st, [0.14, 0.5])) hold.push("fire");
        const look = aimFP(leadHead(foe2, dt), 0.8);
        F.step(dt, { hold, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [["the magnum breaks the shield and finishes it", dead("foe2")]],
    },
    /* a blast gate rises across the lane; the pilot vaults it */
    {
      name: "gate-vault",
      mood: "hot",
      setup() {
        clearStage();
        K.resetDestruction();
        seed = 190;
        this.clock = 11.0;
        F.gatesAt(this.clock, true);
        put(hero, [-8.6, 0, 13.9], -PI / 2);
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = steer(
              a,
              [
                [-8.6, 13.9],
                [9, 13.9],
              ],
              { ...NO },
              { stop: false }
            );
          if (b.pos.x > -2.7 && once(a, "j")) inp.jumpP = true;
          if (a.once.has("j") && !b.ground) inp.crouch = true;
          return inp;
        };
      },
      update(lt, dt) {
        /* the gate keeps rising, but holds still while the pilot is on its edge (a clamber is a move onto
           a ledge, not a ride) */
        if (!hero.body.clamber) this.clock += dt;
        F.gatesAt(this.clock, true);
        drive(hero, dt);
        const p = hero.body.pos,
          k = ease(lt / 1.4);
        cam(
          V(7.4, 0.5, 9.6),
          V(lerp(-1.2, 1.4, k), lerp(1.8, 3.4, k) + Math.max(0, p.y - 3.5) * 0.5, 13.9),
          50,
          0,
          dt
        );
      },
      look: () => af(chest(hero), 4, { streak: 0.9 }),
      beats: [
        [
          "the pilot clambers over the rising gate",
          function () {
            return {
              ok: happened("hero", "clamber").call(this) && hero.body.pos.x > 0.6,
              x: hero.body.pos.x,
              top: gateTop("gate-n"),
            };
          },
        ],
      ],
    },
    /* first person: off the core roof, a hover on the stabilizer, two bursts down into two pilots */
    {
      name: "fp-hover",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        F.gatesAt(0, false);
        seed = 205;
        put(foe1, [-4.4, 0, -12.6], 0, 0, 0);
        put(foe2, [-1.6, 0, -13.9], 0, 0, 0);
        for (const f of [foe1, foe2])
          f.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 2 + a.id.length) * 0.25 });
        fpTargets = [foe1, foe2];
        F.begin({ pos: [-3, 3.2, -2.2], yaw: 0, pitch: -0.12, w: 0 });
        this.s = 0;
        this.hovered = false;
      },
      update(lt, dt, st) {
        const m = F.me,
          e = fpEye();
        for (const f of [foe1, foe2]) {
          drive(f, dt);
          fireAt(f, e, 4, dt, 1.4);
        }
        const hold = [],
          press = [];
        if (this.s === 0) {
          hold.push("forward");
          if (m.pos.z < -4.4) {
            press.push("jump");
            this.s = 1;
          }
        } else if (this.s === 1) {
          hold.push("forward");
          if (m.vel.y < 1.2) this.s = 2;
        } else hold.push("aim");
        const tgt = !foe1.dead ? foe1 : foe2;
        if (this.s === 2 && m.stabbing && !tgt.dead && st > 0.75) hold.push("fire");
        if (m.stabbing) this.hovered = true;
        const look = this.s === 2 ? aimFP(leadHead(tgt, dt), 0.9) : lookAt(leadHead(tgt, dt), 0.12);
        F.step(dt, {
          hold,
          press,
          yaw: look.yaw,
          pitch: this.s === 2 ? look.pitch : lerp(m.pitch, -0.3, dt * 3),
        });
      },
      beats: [
        [
          "a hover on the stabilizer and two kills from the air",
          function () {
            return { ok: this.hovered && foe1.dead && foe2.dead, hovered: this.hovered };
          },
        ],
      ],
    },
    /* outside, in slow motion: hanging on the stabilizer over the north stairs, the camera circling */
    {
      name: "hover-orbit",
      mood: "hot",
      setup() {
        clearStage();
        seed = 220;
        put(hero, [2.7, 3.2, 2.4], PI);
        hero.wpn = 1;
        put(foe3, [5.4, 0, 13.4], 0, 0, 0);
        put(foe4, [0.8, 0, 11.6], 0.3, 0, 30);
        put(foe5, [3.8, 0, 12.6], -0.2, 0, 30);
        const DIVE = V(2.3, 0, 11.8);
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = { ...NO };
          if (b.ground && b.pos.y > 3) {
            steer(
              a,
              [
                [2.7, 2.4],
                [2.7, 9],
              ],
              inp,
              { stop: false }
            );
            if (b.pos.z > 4.4 && once(a, "j")) inp.jumpP = true;
            return inp;
          }
          /* in the air: hang on the stabilizer, aiming down, then the ground pound */
          const e = _a.copy(b.pos).setY(b.pos.y + 1.6);
          b.yaw = yawTo(b.pos, DIVE);
          b.pitch = Math.atan2(DIVE.y - e.y, Math.hypot(DIVE.x - e.x, DIVE.z - e.z));
          if (st < 1.05) inp.aim = true;
          else if (a.poundAt == null) {
            inp.crouchP = inp.crouch = true;
            a.poundAt = st;
          } else inp.crouch = st < a.poundAt + 0.6;
          return inp;
        };
        hero.poundAt = null;
        hero.slamT = null;
        preroll([hero], 0.42);
        for (const f of [foe3, foe4, foe5]) face(f, hero.body.pos);
        this.shot = false;
      },
      ts: () => 0.32,
      update(lt, dt, st) {
        drive(hero, dt);
        for (const f of [foe3, foe4, foe5]) {
          drive(f, dt);
          fireAt(f, head(hero), 3, dt, 1.6);
        }
        if (!this.shot && hero.body.stabbing && st > 0.2) {
          this.shot = true;
          hero.wpn = 1;
          aimAt(hero, head(foe3), 1);
          shoot(hero, foe3, { headshot: true, snd: "pshot", power: 2 });
          punch(0.4);
        }
        const p = hero.body.pos,
          a = lerp(-0.4, 1.3, ease(lt / 1.5)),
          r = 3.9;
        cam(V(p.x + Math.sin(a) * r, p.y + 0.5, p.z - Math.cos(a) * r), V(p.x, p.y + 1.1, p.z), 46, 0, dt);
      },
      look: () => af(chest(hero), 2.4, { streak: 0.8 }),
      beats: [
        [
          "hanging on the stabilizer, a head shot from the air",
          function () {
            return { ok: foe3.dead && !!this.shot, shot: !!this.shot };
          },
        ],
      ],
    },
    /* the ground pound: the dive, the slam, the crater; then a dolly zoom on the pilot in it */
    {
      name: "pound",
      mood: "hot",
      ts() {
        if (hero.slamT == null || hero.slamT < this.t) return 1;
        const k = T - hero.slamT;
        return k < 0.5 ? 0.25 : k < 0.7 ? 0.6 : 1;
      },
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe4, foe5]) {
          drive(f, dt);
          fireAt(f, head(hero), 3, dt, 1.6);
        }
        const slam = hero.slamT != null && hero.slamT >= this.t,
          c = V(2.3, 1.0, 11.8),
          k = slam ? ease((T - hero.slamT - 0.15) / 0.75) : 0;
        /* low and wide at the impact; after it the lens narrows as the camera pulls in (the background swells) */
        const fov = slam ? lerp(30, 66, k) : 44,
          d = dollyD(8.4, 30, fov),
          dir = V(0.66, -0.12, 0.74).normalize();
        const p = slam ? hero.body.pos : null;
        const hp = hero.body.pos,
          look = slam
            ? V(p.x, p.y + 0.9, p.z)
            : V(lerp(c.x, hp.x, 0.7), lerp(1.2, hp.y + 0.6, 0.85), lerp(c.z, hp.z, 0.7));
        cam(
          V(look.x + dir.x * d, Math.max(0.35, look.y - dir.y * d), look.z + dir.z * d),
          look,
          fov,
          slam ? 0 : 6,
          dt
        );
      },
      look: () => af(chest(hero), 3, { streak: 0.9 }),
      beats: [
        [
          "the ground pound slams down among them and takes both",
          () => ({ ok: hero.slamT != null && foe4.dead && foe5.dead, slam: hero.slamT != null }),
        ],
      ],
    },
    /* first person: a sprint and the shoulder charge */
    {
      name: "fp-charge",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 250;
        put(foe1, [18.4, 0, -6.3], PI / 2, 0, 0);
        foe1.ctl = () => ({ ...NO, aim: true });
        fpTargets = [foe1];
        F.begin({ pos: [6.6, 0, -6.2], yaw: -PI / 2, pitch: -0.04, w: 0 });
        this.hit = false;
        this.charged = false;
      },
      update(lt, dt, st) {
        drive(foe1, dt);
        fireAt(foe1, fpEye(), 6, dt, 1.2);
        const m = F.me,
          press = [],
          hold = this.hit ? [] : ["forward", "sprint"];
        if (!this.hit && m.sprintT > 0.88 && m.pos.distanceTo(foe1.body.pos) < 3.4) {
          this.hit = true;
          press.push("melee");
        }
        if (m.chargeT > 0) this.charged = true;
        const look = lookAt(chest(foe1), 0.3);
        F.step(dt, { hold, press, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [
        [
          "the shoulder charge connects",
          function () {
            return { ok: this.charged && foe1.dead, charged: this.charged };
          },
        ],
      ],
    },
    /* and from outside: the charge in slow motion */
    {
      name: "charge",
      mood: "hot",
      whipOut: -1,
      setup() {
        clearStage();
        seed = 262;
        put(hero, [-14, 0, 22], -PI / 2);
        put(foe1, [-3, 0, 22], PI / 2);
        hero.ctl = (a, st) => {
          const inp = steer(
            a,
            [
              [-14, 22],
              [0, 22],
            ],
            { ...NO },
            { stop: false }
          );
          if (a.hitT != null) return { ...NO };
          if (a.body.sprintT > 0.86 && a.body.pos.distanceTo(foe1.body.pos) < 3.3 && once(a, "m"))
            inp.meleeP = true;
          return inp;
        };
        hero.hitT = null;
        preroll([hero], 0.72);
      },
      ts: lt =>
        hero.hitT != null
          ? curve(
              [
                [0, 0.18],
                [0.45, 0.18],
                [0.7, 1],
              ],
              lt - hero.hitT
            )
          : 1,
      update(lt, dt) {
        drive(hero, dt);
        fireAt(foe1, head(hero), 5, dt, 1.2);
        drive(foe1, dt);
        if (hero.body.chargeT > 0 && !foe1.dead && hero.body.pos.distanceTo(foe1.body.pos) < 1.9) {
          hero.hitT = lt;
          kill(foe1, hero.body.pos, 4);
          K.sfx("land", 1);
          K.sfx("boom", 0.4);
          K.shock(chest(foe1));
          CINE.shake(0.6);
          punch(1);
        }
        const m = _c.copy(hero.body.pos).lerp(foe1.body.pos, 0.5);
        cam(V(m.x + 0.8, 0.42, 19.4), V(m.x, 1.1, 22), 34, 5, dt, 0.04);
      },
      look: () => af(chest(foe1), 3),
      beats: [
        [
          "the shoulder charge flattens the pilot",
          function () {
            return { ok: foe1.dead && happened("hero", "charge").call(this) };
          },
        ],
      ],
    },
    /* first person: crouched, up behind a pilot who never turns; one blow from behind */
    {
      name: "fp-assassin",
      fp: true,
      mood: "cool",
      setup() {
        clearStage();
        seed = 272;
        put(foe1, [-10, 0, 19.6], PI, 0, 70);
        foe1.ctl = () => ({ ...NO, aim: true });
        fpTargets = [foe1];
        F.begin({ pos: [-10.2, 0, 15.3], yaw: PI, pitch: 0.02, w: 0 });
        this.hit = false;
        this.sh = 70;
      },
      update(lt, dt) {
        drive(foe1, dt);
        aimAt(foe1, V(-9, 1.6, 40), 0.2);
        const m = F.me,
          press = [],
          hold = this.hit ? ["crouch"] : ["forward", "crouch"];
        if (!this.hit && m.pos.distanceTo(foe1.body.pos) < 1.9) {
          this.hit = true;
          this.sh = foe1.body.shield;
          press.push("melee");
        }
        const look = lookAt(chest(foe1), 0.3);
        F.step(dt, { hold, press, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [
        [
          "one blow from behind kills through a full shield",
          function () {
            return { ok: foe1.dead && this.sh >= 69, sh: this.sh };
          },
        ],
      ],
    },
    /* first person: the shield shatters; a thrust into cover, and time runs fast while it recharges */
    {
      name: "fp-shields",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 287;
        put(foe1, [-9, 0, -4.6], PI / 2);
        foe1.ctl = () => ({ ...NO, aim: true });
        fpTargets = [];
        F.begin({ pos: [-21.5, 0, -5.4], yaw: -PI / 2, pitch: 0, w: 0 });
        this.hitDone = this.th = false;
        this.low = 70;
      },
      ts: lt => (lt < 0.52 ? 1 : lerp(1, 7, ease((lt - 0.52) / 0.12))),
      update(lt, dt, st) {
        drive(foe1, dt);
        const m = F.me;
        if (!this.hitDone && st > 0.08) {
          this.hitDone = true;
          shoot(foe1, null, { at: fpEye(), color: 0x9fdcff, snd: "shot" });
          K.hurtMe(72, { w: "rifle", pos: foe1.body.pos });
        } else if (st < 0.3) fireAt(foe1, fpEye(), 8, dt, 0.9);
        const hold = [],
          press = [];
        if (!this.th && st > 0.24) {
          this.th = true;
          press.push("thrust");
          hold.push("right");
        } else if (st > 0.24 && st < 0.4) hold.push("right");
        if (st > 0.5) hold.push("crouch");
        this.low = Math.min(this.low, m.shield);
        const look = lookAt(V(-9, 1.4, -4.6), st < 0.3 ? 0.2 : 0.05);
        fpSteps(dt, { hold, press, yaw: look.yaw, pitch: lerp(m.pitch, -0.08, Math.min(1, dt * 2)) });
      },
      beats: [
        [
          "the shield breaks, then recharges in cover",
          function () {
            return {
              ok: this.low <= 0 && F.me.shield >= 69 && !F.me.dead,
              low: this.low,
              sh: Math.round(F.me.shield),
            };
          },
        ],
      ],
    },

    /* ===== ARSENAL ===== */
    { name: "card-arsenal", black: true, setup: clearStage, update() {} },
    /* first person: the sniper's scope at 4.5x, then 10x, onto a pilot running far below */
    {
      name: "fp-sniper",
      fp: true,
      mood: "cool",
      setup() {
        clearStage();
        seed = 307;
        put(foe1, [16, 0, -21.5], PI / 2, 0, 70);
        foe1.ctl = a =>
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
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [1.1, 1],
            [1.16, 0.22],
            [1.6, 0.22],
            [1.72, 1],
          ],
          lt
        ),
      update(lt, dt, st) {
        drive(foe1, dt);
        const press = [],
          hold = [];
        if (st > 0.04) hold.push("aim");
        if (this.z === 0 && st > 0.55) {
          press.push("zoom");
          this.z++;
        }
        const look = aimFP(leadHead(foe1, dt), lt < 0.85 ? 0.3 : 1);
        if (lt >= 1.0 && lt < 1.1) hold.push("fire");
        F.step(dt, { hold, press, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [["the sniper's head shot at 10x", dead("foe1")]],
    },
    /* the long shot from outside: sharp on the rifle, the round goes, focus racks out to the target */
    {
      name: "snipe-rack",
      mood: "cool",
      whipIn: 1,
      setup() {
        clearStage();
        seed = 325;
        put(hero, [-0.8, 3.2, -3.8], 0);
        hero.wpn = 2;
        hero.ctl = () => ({ ...NO, aim: true });
        put(foe2, [-16, 0, -21.5], -PI / 2, 0, 0);
        foe2.ctl = a =>
          steer(
            a,
            [
              [-16, -21.5],
              [-2, -21.5],
            ],
            { ...NO },
            { stop: false }
          );
        preroll([foe2], 0.3);
        this.fired = -1;
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [0.85, 1],
            [0.9, 0.3],
            [1.35, 0.3],
            [1.5, 1],
          ],
          lt
        ),
      update(lt, dt) {
        drive(foe2, dt);
        aimAt(hero, head(foe2), 1);
        drive(hero, dt);
        if (lt >= 0.88 && this.fired < 0) {
          this.fired = lt;
          shoot(hero, foe2, { headshot: true, color: 0x9fd8ff, snd: "sshot", power: 2.8, life: 0.9 });
          CINE.shake(0.25);
          punch(0.5);
        }
        const b = hero.body,
          f = b.aimDir(),
          r = rightOf(b.yaw),
          hp = head(hero);
        cam(
          V(hp.x - f.x * 2.6 + r.x * 0.9, hp.y + 0.35, hp.z - f.z * 2.6 + r.z * 0.9),
          _c.copy(hp).addScaledVector(f, 12),
          30,
          0,
          dt
        );
      },
      look(lt) {
        const nearF = 2.8,
          farF = K.camera.position.distanceTo(chest(foe2)),
          k = this.fired < 0 ? 0 : ease((lt - this.fired) / 0.3);
        return { dof: 1, focus: lerp(nearF, farF, k), range: lerp(0.8, 6, k), near: 1, streak: 0.6 };
      },
      beats: [["the long shot drops the runner", dead("foe2")]],
    },
    /* first person: the rocket launcher, into a pair (the blast takes both) */
    {
      name: "fp-rocket",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        K.resetDestruction();
        seed = 340;
        put(foe1, [2.6, 0, -16.2], PI / 2);
        put(foe2, [4.4, 0, -15.1], PI / 2 + 0.2);
        for (const f of [foe1, foe2]) f.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 3 + a.id.length) * 0.2 });
        fpTargets = [foe1, foe2];
        this.mark = V(3.5, 0.15, -15.65);
        F.begin({ pos: [-8.6, 0, -12.6], yaw: yawTo(V(-8.6, 0, -12.6), this.mark), pitch: -0.05, w: 3 });
        this.fired = false;
        this.at = null;
        this.blast = null;
      },
      update(lt, dt, st) {
        const e = fpEye();
        for (const f of [foe1, foe2]) {
          drive(f, dt);
          fireAt(f, e, 4, dt, 1.5);
        }
        const hold = [];
        /* the mark moves with them (the rocket is 0.4 s on its way) */
        this.mark.set((foe1.body.pos.x + foe2.body.pos.x) / 2, 0.15, (foe1.body.pos.z + foe2.body.pos.z) / 2);
        const look = lookAt(this.mark, st < 0.36 ? 0.2 : 1);
        if (st > 0.38 && !this.fired) {
          this.fired = true;
          hold.push("fire");
        }
        const r = K.MAIN_ROCKETS.list[0];
        if (r) this.at = r.pos.clone();
        else if (this.fired && this.at && !this.blast) {
          this.blast = this.at.clone();
          for (const f of [foe1, foe2]) if (chest(f).distanceTo(this.blast) < 4.2) kill(f, this.blast, 4.2);
          punch(1);
        }
        F.step(dt, { hold, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [
        [
          "the rocket lands between the pair and takes both",
          function () {
            const mid = foe1.body.pos.clone().lerp(foe2.body.pos, 0.5);
            return { ok: near(this.blast, mid, 2.5) && foe1.dead && foe2.dead, blast: this.blast, mid };
          },
        ],
      ],
    },
    /* riding a rocket: the camera flies behind it all the way into the pair */
    {
      name: "rocket-ride",
      mood: "hot",
      whipIn: -1,
      setup() {
        clearStage();
        K.resetDestruction();
        seed = 352;
        put(hero, [-14, 0, 20.4], -PI / 2);
        hero.wpn = 3;
        hero.ctl = () => ({ ...NO, aim: true });
        put(foe1, [1.6, 0, 22.2], PI / 2);
        put(foe2, [3.2, 0, 21.0], PI / 2 + 0.2);
        for (const f of [foe1, foe2]) f.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 3 + a.id.length) * 0.2 });
        rockets.clear();
        this.tgt = V(2.4, 0.15, 21.6);
        this.blast = null;
        this.blastT = -1;
        this.cp = null;
      },
      ts(lt) {
        const r = rockets.list[0];
        if (r && r.pos.distanceTo(this.tgt) < 3.2) return 0.25;
        if (this.blastT >= 0) return lt - this.blastT < 0.45 ? 0.25 : 1;
        return 1;
      },
      update(lt, dt, st) {
        aimAt(hero, this.tgt, 0.6);
        drive(hero, dt);
        for (const f of [foe1, foe2]) {
          drive(f, dt);
          fireAt(f, head(hero), 4, dt, 1.5);
        }
        if (st > 0.2 && once(hero, "rk")) {
          const y = hero.body.yaw,
            m = hero.body.pos
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
          const S = this;
          rockets.fire(m, this.tgt.clone().sub(m).normalize(), {
            targets: () => [],
            onExplode(c) {
              S.blast = c.clone();
              S.blastT = T - S.t;
              CINE.shake(1);
              punch(1.4);
              for (const f of [foe1, foe2]) if (chest(f).distanceTo(c) < 4.2) kill(f, c, 4.4);
            },
          });
        }
        rockets.step(dt);
        const r = rockets.list[0],
          p = hero.body.pos;
        if (!hero.once.has("rk")) {
          cam(V(p.x + 2.4, 1.3, p.z + 1.8), V(p.x, p.y + 1.45, p.z), 36, 0, dt);
        } else if (r) {
          const d = this.tgt.clone().sub(r.pos).normalize();
          this.cp = r.pos
            .clone()
            .addScaledVector(d, -2.4)
            .add(V(0, 0.5, 0.7));
          cam(this.cp, r.pos.clone().addScaledVector(d, 5), 58, 0, dt, 0.06);
        } else if (this.cp) {
          cam(
            this.cp.clone().lerp(this.tgt, 0.12 * ease(lt - this.blastT)),
            this.tgt.clone().setY(1),
            58,
            0,
            dt,
            0.06
          );
        }
      },
      look() {
        const r = rockets.list[0];
        return r
          ? { dof: 1, focus: 2.4, range: 6, near: 0, streak: 1, zoom: 0.12 }
          : af(this.tgt, 5, { streak: 1 });
      },
      beats: [
        [
          "the rocket lands between the pair and takes both",
          function () {
            const mid = foe1.body.pos.clone().lerp(foe2.body.pos, 0.5);
            return { ok: near(this.blast, mid, 2.5) && foe1.dead && foe2.dead, blast: this.blast };
          },
        ],
      ],
    },
    /* first person: the scattergun as a pilot rushes in, the pump racked between two blasts */
    {
      name: "fp-scatter",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 367;
        put(foe1, [23.4, 0, -5.6], 0, 0, 70);
        foe1.ctl = () => ({ ...NO, f: 1 });
        fpTargets = [foe1];
        F.begin({ pos: [23.5, 0, -16.5], yaw: PI, pitch: -0.02, w: 4 });
        this.n = 0;
      },
      update(lt, dt, st) {
        drive(foe1, dt);
        fireAt(foe1, fpEye(), 5, dt, 1.2);
        const hold = [];
        if (pull(st, [0.22, 1.06])) hold.push("fire");
        const look = lookAt(chest(foe1), 0.6);
        F.step(dt, { hold, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [["two blasts of the scattergun stop the rush", dead("foe1")]],
    },
    /* first person: the overhand throw, a frag skipping down the lane onto a pair */
    {
      name: "fp-frag",
      fp: true,
      mood: "hot",
      setup() {
        clearStage();
        seed = 380;
        put(foe1, [-14.1, 0, -6.7], PI / 2);
        put(foe2, [-13.3, 0, -5.3], PI / 2 + 0.3);
        for (const f of [foe1, foe2]) f.ctl = () => ({ ...NO, aim: true });
        fpTargets = [foe1, foe2];
        this.mark = V(-13.7, 0, -6);
        const s = (this.spot = fragSpot(this.mark, -6, -32.4, -17));
        this.yaw = yawTo(V(s.from[0], 0, s.from[2]), this.mark);
        this.pitch = s.pitch;
        F.begin({ pos: s.from, yaw: this.yaw, pitch: this.pitch, w: 0 });
        this.thrown = this.solved = false;
        this.at = this.blast = null;
      },
      ts() {
        return this.blast ? 0.45 : 1;
      },
      update(lt, dt, st) {
        for (const f of [foe1, foe2]) {
          drive(f, dt);
          fireAt(f, fpEye(), 3, dt, 1.4);
        }
        const press = [];
        /* just before the throw: solve from where the camera really is (the throw uses that view) */
        if (!this.solved && st > 0.12) {
          this.solved = true;
          this.pitch = solveThrow(K.camera.position.clone(), this.yaw, this.mark).pitch;
        }
        if (!this.thrown && st > 0.25) {
          this.thrown = true;
          press.push("grenade");
        }
        const n = K.MAIN_NADES.list[0];
        if (n) this.at = n.pos.clone();
        else if (this.thrown && this.at && !this.blast) {
          this.blast = this.at.clone();
          for (const f of [foe1, foe2])
            if (chest(f).distanceTo(this.blast) < K.NADES.frag.r) kill(f, this.blast, 3.4);
          punch(1);
        }
        F.step(dt, { press, yaw: this.yaw, pitch: this.pitch });
      },
      beats: [
        [
          "the frag goes off within 1.5 m of its mark and takes the pair",
          function () {
            return {
              ok: near(this.blast, this.mark, 1.5) && foe1.dead && foe2.dead,
              blast: this.blast,
              mark: this.mark,
              spot: this.spot,
            };
          },
        ],
      ],
    },
    /* first person: the plasma grenade, led onto a pilot running across: it sticks, and it goes */
    {
      name: "fp-plasma",
      fp: true,
      mood: "cool",
      setup() {
        clearStage();
        seed = 400;
        put(foe1, [14.4, 0, 30.5], 0, 0, 70);
        foe1.ctl = a =>
          steer(
            a,
            [
              [14.4, 30.5],
              [14.4, 15],
            ],
            { ...NO },
            { sprint: false }
          );
        fpTargets = [foe1];
        F.begin({ pos: [4.6, 0, 20.4], yaw: yawTo(V(4.6, 0, 20.4), V(14.4, 0, 22)), pitch: 0.05, w: 0 });
        this.sw = this.thrown = false;
        this.sol = null;
        this.stuck = false;
      },
      update(lt, dt, st) {
        drive(foe1, dt);
        fireAt(foe1, fpEye(), 3, dt, 1.4);
        const press = [];
        if (!this.sw && st > 0.04) {
          this.sw = true;
          press.push("swapNade");
        }
        /* the frame before the throw: where they will be, and the throw that meets them */
        if (!this.sol && st > 0.28) {
          this.sol = solvePlasma(
            K.camera.position.clone(),
            foe1.body.pos.clone(),
            foe1.body.vel.clone().setY(0),
            1 / 30,
            F.me.yaw
          );
          this.solT = st;
        } else if (this.sol && !this.thrown && st > this.solT) {
          this.thrown = true;
          press.push("grenade");
        }
        const n = K.MAIN_NADES.list[0];
        if (n && n.stuck) this.stuck = true;
        const look = this.sol ? this.sol : lookAt(chest(foe1), 0.3);
        F.step(dt, { press, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [
        [
          "the plasma sticks to the runner and takes them",
          function () {
            return {
              ok: this.stuck && foe1.dead,
              stuck: this.stuck,
              sol: this.sol && +this.sol.e.toFixed(2),
            };
          },
        ],
      ],
    },
    /* a power weapon arrives: the supply pod punches onto its pad on the core, seen from under it */
    {
      name: "supply",
      mood: "hot",
      setup() {
        clearStage();
        K.resetDestruction();
        F.clearSupply();
        this.sent = false;
        this.pod = null;
      },
      ts: lt =>
        curve(
          [
            [0, 1],
            [1.38, 1],
            [1.44, 0.25],
            [1.7, 0.25],
          ],
          lt
        ),
      update(lt, dt, st) {
        if (!this.sent && st > 0.02) {
          this.sent = true;
          this.pod = F.supply(SUPPLY_AT, 1.4);
        }
        const pad = V(SUPPLY_AT[0], SUPPLY_AT[1] + 0.9, SUPPLY_AT[2]),
          c = this.pod && !this.pod.landed ? this.pod.g.position : pad,
          up = clamp((c.y - pad.y) / 140, 0, 1);
        cam(V(2.6, 3.55, -3.5), c, lerp(46, 9, Math.sqrt(up)), 0, dt, 0.05);
      },
      look() {
        return this.pod && !this.pod.landed
          ? { dof: 0, streak: 1.2 }
          : Object.assign(af(V(SUPPLY_AT[0], SUPPLY_AT[1] + 0.9, SUPPLY_AT[2]), 4), { streak: 1 });
      },
      beats: [
        [
          "the supply pod lands on its pad",
          function () {
            return !!this.pod && this.pod.landed;
          },
        ],
      ],
    },
    /* the squad advances on the camera, all three firing */
    {
      name: "squad-push",
      mood: "dusk",
      setup() {
        clearStage();
        seed = 435;
        put(hero, [-4, 0, 31], 0);
        put(ally, [-7.6, 0, 30.4], 0);
        put(ally2, [3.6, 0, 30.6], 0);
        for (const a of [hero, ally, ally2]) a.ctl = (b, st) => ({ ...NO, f: 0.55, aim: true });
        ally.wpn = 0;
        ally2.wpn = 3;
        put(foe1, [-5.4, 0, 15.6], PI);
        put(foe2, [5.0, 0, 16.2], PI);
        for (const f of [foe1, foe2])
          f.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 2.2 + a.id.length) * 0.3 });
        this.z0 = [hero, ally, ally2].map(a => a.body.pos.z);
      },
      update(lt, dt) {
        const ours = [hero, ally, ally2],
          theirs = [foe1, foe2];
        ours.forEach((a, i) => {
          const tgt = theirs[i % 2];
          aimAt(a, chest(tgt), 0.4);
          drive(a, dt);
          if (rnd() < dt * 4.5) shoot(a, null, { at: chest(tgt), miss: 1.0, snd: "shot" });
        });
        for (const f of theirs) {
          drive(f, dt);
          fireAt(f, chest(hero), 5, dt, 2.2);
        }
        const k = ease(lt / 1.5);
        const mid = V(
          (hero.body.pos.x + ally.body.pos.x + ally2.body.pos.x) / 3,
          1.5,
          (hero.body.pos.z + ally.body.pos.z + ally2.body.pos.z) / 3
        );
        cam(V(lerp(-3.6, -2.4, k), 0.4, lerp(21.2, 21.8, k)), mid, 46, 4, dt, -0.03);
      },
      look: () => af(chest(hero), 5, { streak: 0.8 }),
      beats: [
        [
          "the squad advances together",
          function () {
            const moved = [hero, ally, ally2].map((a, i) => +(this.z0[i] - a.body.pos.z).toFixed(2));
            return { ok: moved.every(m => m > 2), moved };
          },
        ],
      ],
    },
    /* low and side on, in slow motion: a slide with the magnum out, two rounds into a pilot */
    {
      name: "slide-shoot",
      mood: "hot",
      whipOut: 1,
      setup() {
        clearStage();
        seed = 450;
        put(hero, [30, 0, 5.2], PI / 2);
        hero.wpn = 1;
        put(foe1, [12.2, 0, 5.4], -PI / 2, 0, 20);
        foe1.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 2) * 0.3 });
        hero.ctl = (a, st) => {
          const inp = steer(
            a,
            [
              [30, 5.2],
              [12, 5.2],
            ],
            { ...NO },
            { stop: false }
          );
          if (st > 0.5) {
            inp.crouch = true;
            if (once(a, "s")) inp.crouchP = true;
          }
          return inp;
        };
        preroll([hero], 0.4);
        this.n = 0;
      },
      ts: () => (hero.body.slideT > 0 ? 0.38 : 1),
      update(lt, dt, st) {
        drive(hero, dt);
        drive(foe1, dt);
        fireAt(foe1, head(hero), 5, dt, 1.2);
        const into = hero.body.slideT > 0 ? 0.8 - hero.body.slideT : -1;
        if (into >= 0 && ((this.n === 0 && into > 0.1) || (this.n === 1 && into > 0.24))) {
          this.n++;
          aimAt(hero, head(foe1), 1);
          hero.wpn = 1;
          shoot(hero, foe1, {
            dmg: this.n === 1 ? 20 : 200,
            headshot: this.n === 2,
            snd: "pshot",
            power: 1.8,
          });
          punch(0.5);
        }
        if (hero.body.slideT > 0) aimAt(hero, head(foe1), 0.4);
        const p = hero.body.pos;
        this.cx = this.cx == null ? p.x - 1.2 : lerp(this.cx, p.x - 1.2, Math.min(1, dt * 8));
        cam(V(this.cx, 0.32, 8.25), V(p.x - 0.4, p.y + 0.8, p.z), 38, 0, dt, 0.05);
      },
      look: () => af(chest(hero), 2.4, { streak: 0.9 }),
      beats: [
        [
          "a slide and two magnum rounds from it",
          function () {
            return { ok: foe1.dead && happened("hero", "slide").call(this) };
          },
        ],
      ],
    },

    /* ===== THE ARENA ===== */
    /* a drone high over the core: a blast gate rises out of the floor (the map moves while you play) */
    {
      name: "drone-gates",
      mood: "cool",
      setup() {
        stopCTF();
        clearStage();
        K.resetDestruction();
        this.clock = 9.7;
        F.gatesAt(this.clock, true);
        this.top0 = gateTop("gate-n");
      },
      update(lt, dt) {
        this.clock += dt;
        F.gatesAt(this.clock, true);
        const k = ease(lt / 3),
          a = 2.6 + k * 0.5;
        cam(V(Math.sin(a) * 22, lerp(44, 36, k), 12 + Math.cos(a) * 22), V(0, 0, 12), 50, 0, dt);
      },
      look: () => ({ dof: 0, streak: 0.5, vig: 0.3 }),
      beats: [
        [
          "the north gate rises across its lane",
          function () {
            const top = gateTop("gate-n");
            return { ok: this.top0 < 0.5 && top > 3.5, from: this.top0, to: top };
          },
        ],
      ],
    },
    /* capture the flag, AI against AI: the carrier runs it home */
    {
      name: "ctf-capture",
      ctf: true,
      mood: null,
      setup() {
        /* play the seeded match to its first capture, then the same match again to just before it */
        startCTF("ctf", undefined, 4, g => g.teams.some(t => t.score > 0), 9000);
        const tCap = G.t;
        startCTF("ctf", undefined, 4, g => g.t >= tCap - 1.7, 9000);
        this.c = G.agents.find(x => x.carrying) || null;
        this.score0 = G.teams.map(t => t.score);
      },
      update(lt, dt) {
        const c = this.c && this.c.alive ? this.c : null;
        if (!c) {
          const m = action();
          cam(V(m.x + 10, 14, m.z + 10), _c.copy(m).setY(0), 50, 2, dt);
          return;
        }
        /* in front of the carrier, a little to the side, backing away with them */
        const b = c.body,
          fx = -Math.sin(b.yaw),
          fz = -Math.cos(b.yaw),
          hd = _a.set(b.pos.x, b.pos.y + 1.5, b.pos.z);
        const want = V(b.pos.x + fx * 3.6 + fz * 1.2, b.pos.y + 1.2, b.pos.z + fz * 3.6 - fx * 1.2);
        const d = want.clone().sub(hd),
          L = d.length(),
          hit = K.rayWorld(hd, d.normalize(), L);
        if (hit < L) want.copy(hd).addScaledVector(d, Math.max(0.8, hit - 0.3));
        cam(want, V(b.pos.x, b.pos.y + 1.1, b.pos.z), 48, 6, dt);
      },
      look() {
        const c = this.c && this.c.alive ? this.c : null;
        return c ? af(chest(c), 1.8) : { dof: 0 };
      },
      beats: [
        [
          "the carrier scores the capture",
          function () {
            const s = G ? G.teams.map(t => t.score) : [];
            return { ok: s.some((v, i) => v > this.score0[i]), from: this.score0, to: s };
          },
        ],
      ],
    },
    /* first person: their flag in both hands, walking it home (carriers walk) */
    {
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
        this.from = F.me.pos.clone();
      },
      update(lt, dt) {
        F.step(dt, { hold: ["forward"] });
      },
      beats: [
        [
          "the carrier walks the flag",
          function () {
            return !!this.from && F.me.pos.distanceTo(this.from) > 1.5;
          },
        ],
      ],
    },
    /* oddball: the skull burns in from orbit in its own pod */
    {
      name: "oddball",
      ctf: true,
      setup() {
        startCTF("oddball", "arena", 57, g => g.ball && g.t >= g.ball.landAt - K.POD_TIME, 3000);
        /* a second of the pod's fall, silently: the cut opens on it burning in, not on empty sky (the
           match now; its pod, which appears with the first frame, on that frame) */
        K.sfxTap(() => {});
        for (let i = 0; i < 30; i++) G.step(1 / 30);
        CTF.UI.frame(1 / 30);
        K.sfxTap(TR.recording ? tap : null);
        this.pod = null;
      },
      update(lt, dt) {
        /* riding beside the skull's pod as it plunges, violet, toward the arena (the camera falls with it) */
        const pod = K.PODS.find(p => !p.landed) || this.pod;
        this.pod = pod;
        const home = pod ? pod.at : G && G.ball ? G.ball.pos : CTF.BALL_HOME;
        const g = pod ? pod.g.position : V(home.x, home.y + 3, home.z),
          h = hand(lt * 3, 0.08);
        cam(
          V(g.x + 3.8 + h.x, g.y + 1.2 + h.y, g.z + 4.6),
          V(g.x, g.y - 1.6, g.z),
          lerp(56, 70, ease(lt / 2.25)),
          0,
          dt,
          Math.sin(lt * 2) * 0.08
        );
        CINE.shake(0.1);
      },
      look: lt => ({ dof: 0, streak: 1.2, zoom: 0.15 + 0.2 * ease(lt / 2.25), vig: 0.35 }),
      beats: [["the skull's pod lands", () => !!G && !!G.ball && G.ball.state !== "incoming"]],
    },
    /* free-for-all: eight pilots, every one for themself, seen from high and steep */
    {
      name: "ffa",
      ctf: true,
      setup() {
        startCTF("ffa", "arena", 33);
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        const c = focus ? focus.body.pos : action(),
          a = 0.6 + lt * 0.12;
        cam(V(c.x + Math.sin(a) * 8, 12, c.z + Math.cos(a) * 8), V(c.x, 0.8, c.z), 40, 2, dt);
      },
      look: () => af(focus ? focus.body.pos : action(), 5, { near: 0.5 }),
      beats: [
        [
          "eight pilots in the fight",
          () => ({ ok: !!G && G.agents.length >= 8, n: G ? G.agents.length : 0 }),
        ],
      ],
    },
    /* spectating: the free camera flies anywhere over a live match */
    {
      name: "freecam",
      ctf: true,
      spec: true,
      mood: null,
      setup() {
        startCTF("ctf", undefined, 12);
      },
      update(lt, dt) {
        const k = ease(lt / 2.25);
        cam(
          V(lerp(-16, 10, k), lerp(17, 9, k), lerp(-32, -8, k)),
          V(lerp(-4, 14, k), 1, lerp(-8, 10, k)),
          56,
          3,
          dt,
          lerp(-0.06, 0.04, k)
        );
      },
      look: () => ({ dof: 0 }),
      beats: [
        ["the match plays on under the free camera", () => ({ ok: !!G && G.agents.some(a => a.alive) })],
      ],
    },
    { name: "card-now", black: true, setup: clearStage, update() {} },

    /* ===== THE SET PIECE ===== */
    /* two squads meet across the north lane at dusk */
    {
      name: "clash",
      mood: "dusk",
      whipOut: -1,
      setup() {
        stopCTF();
        clearStage();
        K.resetDestruction();
        F.gatesAt(0, false);
        seed = 600;
        const run = (a, x0, z, x1) => {
          put(a, [x0, 0, z], x1 > x0 ? -PI / 2 : PI / 2);
          a.ctl = b =>
            steer(
              b,
              [
                [x0, z],
                [x1, z],
              ],
              { ...NO },
              { stop: true }
            );
        };
        run(hero, -15, 21.5, -6.5);
        run(ally, -16.6, 23.2, -8.2);
        run(ally2, -16.2, 19.8, -8);
        run(foe1, 15, 21.2, 6.2);
        run(foe2, 16.4, 19.8, 8);
        run(foe3, 15.8, 22, 7.6);
        for (const a of [hero, ally, ally2, foe1, foe2, foe3]) a.wpn = 0;
        this.boom = false;
      },
      update(lt, dt, st) {
        const ours = [hero, ally, ally2],
          theirs = [foe1, foe2, foe3];
        ours.forEach((a, i) => {
          drive(a, dt);
          if (st > 0.5) {
            aimAt(a, chest(theirs[i]), 0.3);
            if (rnd() < dt * 5) shoot(a, null, { at: chest(theirs[i]), miss: 1.6, snd: "shot" });
          }
        });
        theirs.forEach((a, i) => {
          drive(a, dt);
          if (st > 0.5) fireAt(a, chest(ours[i]), 5, dt, 1.6);
        });
        if (st > 0.75 && !this.boom) {
          this.boom = true;
          boom(V(0.6, 0.2, 21.4), 0xffa040, 2.6, 0);
          punch(0.8);
        }
        const k = ease(lt / 1.25);
        cam(V(lerp(-1.2, 1.2, k), lerp(9.4, 8.6, k), 34), V(0, 0.8, 21.4), 50, 0, dt);
      },
      look: () => ({ dof: 0.4, focus: 6, range: 8, streak: 1 }),
      beats: [
        [
          "both squads charge in",
          () => ({
            ok: hero.body.pos.x > -9 && foe1.body.pos.x < 9,
            hx: hero.body.pos.x,
            fx: foe1.body.pos.x,
          }),
        ],
      ],
    },
    /* first person in the middle of it: a burst through a shield, one to the head */
    {
      name: "fp-clash",
      fp: true,
      mood: "dusk",
      setup() {
        const b = hero.body;
        hero.on = false;
        hero.rig.root.visible = false;
        foe1.body.shield = 25;
        foe1.ctl = (a, st) => ({ ...NO, s: Math.sin(st * 3) * 0.4 });
        fpTargets = [foe1];
        F.begin({ pos: [b.pos.x, 0, b.pos.z], yaw: yawTo(b.pos, foe1.body.pos), pitch: 0, w: 0 });
      },
      update(lt, dt, st) {
        const e = fpEye();
        for (const a of [ally, ally2]) {
          drive(a, dt);
          if (rnd() < dt * 4) shoot(a, null, { at: chest(foe2), miss: 1.6, snd: "shot" });
        }
        for (const f of [foe1, foe2, foe3]) {
          drive(f, dt);
          fireAt(f, e, 3, dt, 1.6);
        }
        const hold = st > 0.12 && !foe1.dead ? ["fire", "aim"] : ["aim"];
        const look = aimFP(leadHead(foe1, dt), st < 0.1 ? 0.4 : 1);
        F.step(dt, { hold, yaw: look.yaw, pitch: look.pitch });
      },
      beats: [
        [
          "a burst through the shield, then the head",
          () => ({ ok: foe1.dead && foe1.broke, broke: !!foe1.broke }),
        ],
      ],
    },
    /* a rocket bursts in front of the hero: a thrust straight back out of it, in slow motion */
    {
      name: "blast-thrust",
      mood: "dusk",
      whipIn: 1,
      setup() {
        clearStage();
        seed = 625;
        put(hero, [-6, 0, 21.4], -PI / 2);
        hero.wpn = 0;
        put(foe2, [8, 0, 21.6], PI / 2);
        foe2.wpn = 3;
        hero.ctl = (a, st) => {
          if (st > 0.38 && once(a, "t")) return { ...NO, thrust: true, f: -1 };
          return { ...NO, f: st < 0.38 ? 0.4 : 0, aim: true };
        };
        rockets.clear();
        this.blastAt = null;
        this.x0 = hero.body.pos.x;
      },
      ts() {
        const r = rockets.list[0];
        if (hero.body.thrustT > 0 || (r && r.pos.x < -1.5)) return 0.28;
        return this.blastAt != null && T - this.blastAt < 0.35 ? 0.35 : 1;
      },
      update(lt, dt, st) {
        drive(hero, dt);
        drive(foe2, dt);
        aimAt(foe2, chest(hero), 0.5);
        aimAt(hero, chest(foe2), 0.3);
        if (st > 0.12 && once(foe2, "rk")) {
          const m = chest(foe2).add(V(-0.8, 0.2, 0));
          foe2.firedT = shotSim;
          const S = this;
          rockets.fire(m, V(-4.4, 0.12, 21.4).sub(m).normalize(), {
            targets: () => [],
            onExplode() {
              S.blastAt = T;
              CINE.shake(1);
              punch(1.2);
            },
          });
        }
        rockets.step(dt);
        const p = hero.body.pos;
        cam(V(p.x + 2.4, 0.42, 25.0), V(p.x + 1.4, 1.0, 21.4), 42, 4, dt, -0.04);
      },
      look: () => af(chest(hero), 3, { streak: 1 }),
      beats: [
        [
          "a thrust straight back out of the blast",
          function () {
            const dx = hero.body.pos.x - this.x0;
            return {
              ok: happened("hero", "thrust").call(this) && dx < -2 && this.blastAt != null && !hero.dead,
              dx,
            };
          },
        ],
      ],
    },
    /* the chase cam up the core stairs at a sprint */
    {
      name: "core-run",
      mood: "dusk",
      setup() {
        clearStage();
        seed = 638;
        put(hero, [0, 0, 13.6], 0);
        hero.wpn = 1;
        const R = [
          [0, 13.6],
          [0, 6],
          [-2.4, 2],
          [-2.4, -12],
        ];
        hero.ctl = (a, st) => {
          const b = a.body,
            inp = { ...NO };
          if (b.ground && !a.once.has("j")) {
            steer(a, R, inp, { stop: false });
            if (b.pos.y > 3 && b.pos.z < -4.4 && once(a, "j")) inp.jumpP = true;
            return inp;
          }
          if (!b.ground && a.once.has("j") && b.vel.y < 1.5 && once(a, "t"))
            Object.assign(inp, { thrust: true, f: 1 });
          if (!b.ground && a.once.has("t")) Object.assign(inp, { f: 0.3, aim: b.thrustT <= 0 });
          return inp;
        };
        preroll([hero], 0.3);
      },
      update(lt, dt) {
        drive(hero, dt);
        const b = hero.body,
          p = b.pos,
          f = fwdOf(b.yaw),
          h = hand(lt * 2, 0.04);
        cam(
          V(p.x - f.x * 3.2 + h.x, p.y + 1.0 + h.y, p.z - f.z * 3.2),
          V(p.x + f.x * 5, p.y + 1.4, p.z + f.z * 5),
          64,
          8,
          dt,
          0.02
        );
      },
      look: () => af(chest(hero), 3, { streak: 0.8 }),
      beats: [["up the stairs and onto the roof", () => ({ ok: hero.body.pos.y > 3.1, y: hero.body.pos.y })]],
    },
    /* off the edge: the leap and a thrust, from below, against the sky */
    {
      name: "leap-off",
      mood: "dusk",
      update(lt, dt) {
        drive(hero, dt);
        const p = hero.body.pos;
        cam(V(-4.8, 0.25, -12.2), V(p.x, p.y + 1.1, p.z), 40, 4, dt, 0.05);
      },
      look: () => af(chest(hero), 4, { streak: 1.3 }),
      beats: [
        [
          "a running leap off the roof and a thrust",
          function () {
            return {
              ok: happened("hero", "jump").call(this) || hero.once.has("j"),
              thrust: hero.once.has("t"),
            };
          },
        ],
      ],
    },
    /* bullet time: hanging on the stabilizer, time all but stops; three rounds, the camera circling */
    {
      name: "freeze",
      mood: "dusk",
      setup() {
        seed = 660;
        BELOW.forEach((p, i) => {
          const f = [foe1, foe2, foe3][i];
          put(f, p, 0, 0, 0);
          face(f, hero.body.pos);
          f.ctl = () => ({ ...NO, aim: true });
        });
        hero.ctl = () => ({ ...NO, aim: true });
        hero.wpn = 1;
        this.times = [0.6, 1.3, 2.0];
        this.fired = 0;
        this.inAir = true;
      },
      ts: lt =>
        curve(
          [
            [0, 0.3],
            [0.3, 0.03],
            [3, 0.03],
          ],
          lt
        ),
      update(lt, dt) {
        drive(hero, dt);
        const fs = [foe1, foe2, foe3];
        for (const f of fs) {
          aimAt(f, head(hero), 0.3);
          drive(f, dt);
        }
        /* three rounds inside the frozen moment; they land when time snaps back */
        while (this.fired < 3 && lt >= this.times[this.fired]) {
          const f = fs[this.fired++];
          this.inAir = this.inAir && !hero.body.ground;
          aimAt(hero, head(f), 1);
          shoot(hero, null, { at: head(f), snd: "pshot", life: 4 });
          hero.firedT = shotSim;
        }
        const p = hero.body.pos,
          k = ease(lt / 3),
          a = lerp(PI - 0.3, PI + 3.4, k),
          r = lerp(3.4, 4.8, k);
        cam(
          V(p.x + Math.sin(a) * r, p.y + lerp(0.5, 1.5, k), p.z + Math.cos(a) * r),
          V(p.x, p.y + 1.1, p.z),
          lerp(38, 48, k),
          0,
          dt
        );
      },
      look: () => af(chest(hero), 2.4, { streak: 1, tint: [-0.16, 0.06, 0.22] }),
      beats: [
        [
          "all three rounds are fired in the air",
          function () {
            return { ok: this.inAir && this.fired === 3 && !hero.body.ground, fired: this.fired };
          },
        ],
      ],
    },
    /* time snaps back: the three drop at once, and the hero dives into a ground pound */
    {
      name: "snap",
      mood: "dusk",
      setup() {
        for (const [i, f] of [foe1, foe2, foe3].entries()) {
          K.shieldPop(chest(f));
          kill(f, hero.body.pos, 2.2 + i * 0.3);
        }
        K.sfx("pop", 0.9);
        punch(1.2);
        const DIVE = V(BELOW[1][0], 0, BELOW[1][2] + 1.6);
        hero.ctl = (a, st) => {
          const b = a.body,
            e = _a.copy(b.pos).setY(b.pos.y + 1.6);
          b.yaw = yawTo(b.pos, DIVE);
          b.pitch = Math.atan2(-e.y, Math.hypot(DIVE.x - e.x, DIVE.z - e.z));
          if (a.poundAt == null) {
            a.poundAt = st;
            return { ...NO, crouchP: true, crouch: true };
          }
          return { ...NO, crouch: st < a.poundAt + 0.58 };
        };
        hero.poundAt = null;
        hero.slamT = null;
      },
      ts: lt => (lt < 0.25 ? 0.5 : 1),
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2, foe3]) drive(f, dt);
        const p = hero.body.pos;
        cam(
          V(8.2, 0.5, -12.6),
          V(lerp(-1.5, p.x, 0.6), lerp(1.4, p.y + 1, 0.6), lerp(-15, p.z, 0.6)),
          48,
          5,
          dt,
          0.04
        );
      },
      look: () => af(chest(hero), 6, { streak: 1 }),
      beats: [["time snaps back: all three drop", dead("foe1", "foe2", "foe3")]],
    },
    /* the slam: the crater, and a dolly zoom on the pilot in it */
    {
      name: "slam",
      mood: "dusk",
      ts() {
        if (hero.slamT == null) return 1;
        const k = T - hero.slamT;
        return k < 0.45 ? 0.25 : k < 0.65 ? 0.55 : 1;
      },
      update(lt, dt) {
        drive(hero, dt);
        for (const f of [foe1, foe2, foe3]) drive(f, dt);
        const p = hero.body.pos,
          k = hero.slamT == null ? 0 : ease((T - hero.slamT - 0.1) / 0.9),
          fov = lerp(26, 64, k),
          d = dollyD(9, 26, fov),
          dir = V(0.55, 0.14, 0.82).normalize(),
          l = V(p.x, p.y + 0.95, p.z);
        cam(
          V(l.x + dir.x * d, Math.max(0.3, l.y + dir.y * d), l.z + dir.z * d),
          l,
          fov,
          hero.slamT == null ? 6 : 0,
          dt
        );
      },
      look: () => af(chest(hero), 2.5, { streak: 1.2 }),
      beats: [["the ground pound lands", () => ({ ok: hero.slamT != null })]],
    },
    /* low and slow: the hero stands in the dust and walks out of it, the sun behind */
    {
      name: "hero-walk",
      mood: "dusk",
      setup() {
        hero.ctl = (a, st) => ({ ...NO, f: st > 0.35 ? 0.22 : 0, aim: false });
        hero.body.yaw = yawTo(hero.body.pos, V(-5.6, 0, -17.5));
        K.dust(hero.body.pos, 30, 3, 1.2, 0.8);
      },
      update(lt, dt) {
        drive(hero, dt);
        const p = hero.body.pos,
          k = ease(lt / 1.25);
        cam(V(-5.8, 0.22, -17.6), V(p.x, lerp(1.0, 1.55, k), p.z), lerp(30, 26, k), 0, dt, 0.03);
      },
      look: () => Object.assign(af(chest(hero), 2.2), { streak: 1.4 }),
      beats: [["the hero walks out of the crater", () => !hero.dead && hero.body.ground]],
    },
    /* the play of the game: the replay, over the shoulder... */
    {
      name: "potg",
      mood: "dusk",
      replay: true,
      setup() {
        clearStage();
        seed = 730;
        put(hero, HANG, 0, -0.6);
        hero.wpn = 1;
        hero.ctl = () => ({ ...NO, aim: true });
        BELOW.forEach((p, i) => {
          const f = [foe1, foe2, foe3][i];
          put(f, p, 0, 0, 0);
          face(f, V(HANG[0], 0, HANG[2]));
          f.ctl = () => ({ ...NO, aim: true });
        });
        this.fired = false;
      },
      ts: () => 0.6,
      update(lt, dt, st) {
        drive(hero, dt);
        for (const f of [foe1, foe2, foe3]) {
          aimAt(f, head(hero), 0.3);
          drive(f, dt);
        }
        aimAt(hero, head(foe1), 0.6);
        if (st > 0.36 && !this.fired) {
          this.fired = true;
          aimAt(hero, head(foe1), 1);
          shoot(hero, foe1, { headshot: true, snd: "pshot", power: 2 });
          punch(0.5);
        }
        const b = hero.body,
          f = b.aimDir(),
          r = rightOf(b.yaw);
        cam(
          V(b.pos.x - f.x * 2.2 + r.x * 0.7, b.pos.y + 2.0, b.pos.z - f.z * 2.2 + r.z * 0.7),
          chest(foe1),
          50,
          0,
          dt
        );
      },
      look: () => ({ dof: 0.4, focus: 6, range: 8, grade: 0.6, tint: [0.06, 0.02, -0.06] }),
      beats: [["the replay's first round", dead("foe1")]],
    },
    /* ...and into first person, mid-air: two more */
    {
      name: "potg-fp",
      fp: true,
      mood: "dusk",
      replay: true,
      setup() {
        const b = hero.body;
        hero.on = false;
        hero.rig.root.visible = false;
        fpTargets = [foe2, foe3];
        F.begin({ pos: [b.pos.x, b.pos.y, b.pos.z], yaw: b.yaw, pitch: b.pitch, w: 1, w2: 0 });
        this.n = 0;
      },
      update(lt, dt, st) {
        for (const f of [foe2, foe3]) {
          drive(f, dt);
          aimAt(f, fpEye(), 0.3);
        }
        const tgt = !foe2.dead ? foe2 : foe3,
          hold = ["aim"];
        if (pull(st, [0.22, 0.6])) hold.push("fire");
        const look = aimFP(leadHead(tgt, dt), 0.85);
        F.step(dt, { hold, yaw: look.yaw, pitch: look.pitch });
      },
      look: () => ({ grade: 0.6, tint: [0.06, 0.02, -0.06] }),
      beats: [["two more from the air, in first person", dead("foe2", "foe3")]],
    },
    /* ===== the title over a slow aerial ===== */
    {
      name: "title",
      mood: "dusk",
      setup() {
        clearStage();
        K.resetDestruction();
      },
      update(lt) {
        const k = ease(lt / 9),
          a = 2.4 + k * 0.45;
        cam(V(Math.sin(a) * 46, lerp(16, 24, k), Math.cos(a) * 46), V(0, 2, 0), 40);
      },
      look: () => ({ dof: 0.6, focus: 46, range: 18, streak: 0.8 }),
    },
  ];
  /* ================= THE CUT: "Ignition" ================= */
  const LIB = new Map(SCENES.map(sh => [sh.name, sh]));
  /** @type {[string, number][]} */
  const CUT = [
    /* cold open */
    ["boot", 0],
    ["sky", 2],
    ["ride", 4],
    ["cockpit", 5.5],
    ["impact", 7.5],
    ["hero-rise", 9],
    ["card-fight", 10.75],
    /* ignition */
    ["fp-slide", 12],
    ["chase-thrust", 13.25],
    ["dodge", 14.25],
    ["fp-carbine", 15.5],
    ["ots", 17],
    ["fp-magnum", 18],
    ["gate-vault", 19],
    ["fp-hover", 20.5],
    ["hover-orbit", 22],
    ["pound", 23.5],
    ["fp-charge", 25],
    ["charge", 26.25],
    ["fp-assassin", 27.25],
    ["fp-shields", 28.75],
    /* the arsenal */
    ["card-arsenal", 30],
    ["fp-sniper", 30.75],
    ["snipe-rack", 32.5],
    ["fp-rocket", 34],
    ["rocket-ride", 35.25],
    ["fp-scatter", 36.75],
    ["fp-frag", 38],
    ["fp-plasma", 40],
    ["supply", 41.75],
    ["squad-push", 43.5],
    ["slide-shoot", 45],
    /* the arena */
    ["drone-gates", 46],
    ["ctf-capture", 49],
    ["fp-flag", 52],
    ["oddball", 53.25],
    ["ffa", 55.5],
    ["freecam", 57.5],
    ["card-now", 59.75],
    /* the set piece */
    ["clash", 60],
    ["fp-clash", 61.25],
    ["blast-thrust", 62.5],
    ["core-run", 63.75],
    ["leap-off", 65],
    ["freeze", 66],
    ["snap", 69],
    ["slam", 69.8],
    ["hero-walk", 71.5],
    ["potg", 72.75],
    ["potg-fp", 74],
    ["title", 75.25],
  ];
  /** @type {any[]} */
  const SHOTS = [];
  for (const [name, at] of CUT) {
    const sh = LIB.get(name);
    if (!sh) throw new Error("trailer: no scene " + name);
    SHOTS.push(Object.assign(sh, { t: at }));
  }
  CARDS.push(
    {
      t: 0.2,
      d: 1.65,
      eb: "Kinetic systems // live fire",
      big: "Orbital proving ground",
      sub: "Sector 7 · pilot certification",
      kind: "holoBlack",
    },
    { t: 10.85, d: 1.08, eb: "Round one", big: "Fight", kind: "holoBlack" },
    { t: 30.05, d: 0.66, eb: "Arsenal", big: "Five weapons", sub: "Two grenades", kind: "holoBlack" },
    { t: 42.1, d: 1.3, eb: "From orbit", big: "Supply drops", kind: "holo" },
    { t: 46.4, d: 2.2, eb: "The map moves", big: "Blast gates", kind: "holo" },
    { t: 49.4, d: 2.2, eb: "4 v 4", big: "Capture the flag", kind: "holo" },
    { t: 53.6, d: 1.5, eb: "Hold the skull", big: "Oddball", kind: "holo" },
    { t: 55.8, d: 1.4, eb: "Eight pilots", big: "Free for all", kind: "holo" },
    { t: 73.0, d: 2.0, eb: "Replay", big: "Play of the game", sub: "Triple kill · mid-air", kind: "holo" }
  );
  FADES.push([75.25, 75.7, 1, 0.5], [75.7, 82.6, 0.5, 0.5], [82.6, 84, 0.5, 1]);
  FLASH.push([7.82, 0.55], [12, 0.22], [30, 0.25], [60, 0.3], [69, 0.6]);
  GLITCH.push(
    [1.9, 0.14, 0.8],
    [10.6, 0.17, 0.9],
    [11.95, 0.1, 0.6],
    [29.92, 0.12, 0.8],
    [45.95, 0.12, 0.6],
    [59.7, 0.3, 0.9],
    [72.75, 0.3, 1],
    [75.2, 0.22, 0.7],
    [75.75, 0.3, 0.6]
  );
  TITLE = 75.7;
  TR.shots = SHOTS.map(s => ({ t: s.t, name: s.name }));

  /* ---------------- CTF montage support ---------------- */
  /**
   * a live AI-vs-AI match of any mode (rules: ctf, slayer, ffa or oddball; map: a MAPS key), seeded
   * (seedN) and fast-forwarded silently into the action: until(G) stops the fast-forward early (at most
   * max steps)
   */
  /* a map's first match builds it, drawing random numbers as it goes: each mode and map gets one
     throwaway match first, so every seeded match starts from the same state */
  const warmed = new Set();
  function startCTF(rules = "ctf", map = undefined, seedN = 1, until = null, max = 1150) {
    stopCTF();
    clearStage();
    setMood(null);
    const key = rules + ":" + (map || "ctf");
    if (!warmed.has(key)) {
      warmed.add(key);
      const W = CTF.Game({
        mode: "sim",
        render: true,
        diff: ["legendary", "legendary"],
        rules,
        map,
        memory: null,
        saveMemory: false,
      });
      CTF.UI.attach(W, "sim");
      CTF.UI.quiet = true;
      K.sfxTap(() => {});
      W.start();
      CTF.UI.detach();
      CTF.exitMap();
      K.sfxTap(TR.recording ? tap : null);
    }
    /* the AI draws from the game's seeded generator, and the match's setup from Math.random: both are
       seeded while a trailer match runs, so the same seed plays the same match in a test and a recording */
    K.RNG.seed(seedN);
    seedMath(seedN);
    K.resetDestruction();
    K.clearPods();
    F.clearSupply();
    /* (and without the map memory saved by earlier matches: a trailer match is the same every time) */
    G = CTF.Game({
      mode: "sim",
      render: true,
      diff: ["legendary", "legendary"],
      rules,
      map,
      memory: null,
      saveMemory: false,
    });
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
  /* Math.random, seeded for the length of a live match (mulberry32), and the browser's own put back after */
  let mathKeep = null;
  function seedMath(n) {
    if (!mathKeep) mathKeep = Math.random;
    let s = (n * 2654435761) >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stopCTF() {
    if (mathKeep) {
      Math.random = mathKeep;
      mathKeep = null;
    }
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
  /** a scene's beats, checked as it ends: what it is about either happened or it didn't */
  function judge(S) {
    for (const [what, fn] of S.beats || []) {
      let ok = false,
        info = null;
      try {
        const r = fn.call(S);
        ok = r === true || (!!r && r.ok === true);
        if (r && typeof r === "object") info = r;
      } catch (e) {
        info = String(e);
      }
      diag.beats.push({ t: +T.toFixed(2), shot: S.name, what, ok, info });
    }
  }
  function frame(dt, render = true) {
    F.quiet = !render;
    punchV *= Math.exp(-dt * 4.5);
    let i = SHOTS.length - 1;
    while (i > 0 && T < SHOTS[i].t) i--;
    if (i !== shotI) {
      shotI = i;
      const was = shot;
      if (was) judge(was);
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
      whipV = 0;
      CINE.look(withFx(Object.assign({}, LOOK0, LOOK_FP, S.look ? S.look(lt) : null)));
      S.update(lt, sdt, shotSim);
      updOverlay();
      return;
    }
    S.update(lt, sdt, shotSim);
    if (!S.black) unclip(S);
    /* a whip pan swings the camera off the shot it leaves or into the one it enters */
    whipV = whipAt(S, lt);
    if (whipV) K.camera.rotateY(whipV * 0.75);
    K.updFX(sdt);
    if (TR.recording) F.hooks(sdt);
    updOverlay();
    if (!render || S.black) return;
    CINE.look(withFx(Object.assign({}, LOOK0, S.look ? S.look(lt) : null)));
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
    punchV = whipV = 0;
    diag.bumps.length = diag.cam.length = diag.log.length = diag.beats.length = 0;
    for (const sh of SHOTS) sh.judged = false;
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
    $("trReplay").hidden = $("trSpec").hidden = true;
    $("trScan").style.opacity = "0";
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
    if (T >= TR.END && shot && !shot.judged) {
      shot.judged = true;
      judge(shot);
    }
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
