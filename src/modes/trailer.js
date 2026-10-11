/* ===== Trailer: a scripted cinematic cut of the game, synced to the score in modes/trailer-score.js.
   Shots drive real pilots (engine physics, rigs and effects) with scripted inputs; the second half cuts
   to a live AI-vs-AI capture-the-flag match. The timeline is a pure function of trailer time, so the
   same cut can play live (clocked by the music) or be stepped frame by frame for video capture. ===== */
(function () {
  const K = window.KA,
    THREE = K.THREE,
    $ = K.$,
    V3 = THREE.Vector3,
    CTF = window.CTF,
    SC = K.trailerScore;
  const TR = (K.trailer = {
    active: false,
    recording: false,
    get t() {
      return T;
    },
    END: 66,
  });
  let T = 0,
    shotI = -1,
    music = null,
    musicStart = 0,
    lastWall = 0,
    G = null,
    shakeT = 0,
    cardI = -1,
    focus = null,
    focusT = 0;
  const camS = { p: new V3(), l: new V3(), init: false };
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
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)),
    lerp = (a, b, t) => a + (b - a) * t,
    PI = Math.PI;
  const COL = { hero: "#ffb347", ally: "#ff6f91", foe: "#62cdff", foe2: "#8be3ff" };
  /* ---------------- actors: real bodies and rigs driven by scripted input ---------------- */
  const actors = [];
  function mk(color) {
    const a = {
      body: new K.Body(),
      rig: K.makePilot(color, ""),
      wpn: 1,
      firedT: -9,
      on: false,
      acc: 0,
      once: new Set(),
      reload: -1,
    };
    a.rig.showTag(false);
    a.rig.root.visible = false;
    actors.push(a);
    return a;
  }
  let hero, ally, foe1, foe2;
  function cast() {
    if (hero) return;
    hero = mk(COL.hero);
    ally = mk(COL.ally);
    foe1 = mk(COL.foe);
    foe2 = mk(COL.foe2);
  }
  function put(a, x, y, z, yaw, pitch = 0, shield = 70) {
    const b = a.body;
    b.reset();
    b.pos.set(x, y, z);
    b.yaw = yaw;
    b.pitch = pitch;
    b.spawnT = -99;
    b.shield = shield;
    b.thrustCD = 0;
    a.rig.revive();
    a.rig.showTag(false);
    a.rig.S.sh = shield;
    a.rig.root.visible = true;
    a.rig.root.position.copy(b.pos);
    a.rig.root.rotation.y = yaw;
    a.on = true;
    a.acc = 0;
    a.once.clear();
    a.reload = -1;
    a.wpn = 1;
    a.firedT = -9;
    a.dead = false;
  }
  function clearStage() {
    for (const a of actors) {
      a.on = false;
      a.rig.root.visible = false;
    }
    for (const g of grenades) g.mesh.visible = false;
    grenades.length = 0;
  }
  const once = (a, k) => {
    if (a.once.has(k)) return false;
    a.once.add(k);
    return true;
  };
  /* fixed 120 Hz physics, same as the player, so timings are identical live and in capture */
  function drive(a, dt, inp) {
    if (!a.on) return;
    a.acc += dt;
    const H = 1 / 120;
    let n = 0;
    while (a.acc >= H && n < 24) {
      if (!a.dead) a.body.step(H, Object.assign({}, NO, inp), (ty, d) => onBody(a, ty, d));
      inp.jumpP = inp.thrust = inp.crouchP = inp.meleeP = false;
      a.acc -= H;
      n++;
    }
    a.rig.root.position.copy(a.body.pos);
    a.rig.root.rotation.y = a.body.yaw;
    K.rigEvents(
      a.rig,
      a.rig.update(dt, K.bodyState(a.body, { fire: T - a.firedT < 0.1, wpn: a.wpn, reload: a.reload }))
    );
  }
  function onBody(a, ty, d) {
    if (ty === "slam") {
      K.shock(d.pos);
      K.blast(_a.copy(d.pos).setY(d.pos.y + 0.4), 0xffc070, 5);
      K.dust(d.pos, 26, 3.4, 1.4, 0.7);
      K.sfx("slam", 1);
      K.damageRadius(d.pos, 7, 900, true);
      shakeT = Math.max(shakeT, 0.7);
      for (const o of actors)
        if (o !== a && o.on && !o.dead && o.body.pos.distanceTo(d.pos) < 5.5) kill(o, d.pos, 3.4);
    } else if (ty === "thrust") {
      K.thrustPuff(a.body.pos, d.dir);
      K.sfx("thrust", 0.6);
    } else if (ty === "land" && d.vy > 9) K.dust(a.body.pos, 8, 1.6, 0.5);
  }
  function kill(o, from, power) {
    if (o.dead) return;
    o.dead = true;
    o.body.shield = 0;
    o.rig.die(from, power);
    K.spark(o.rig.chestWorld(_c), 14, 0xff7a6a);
  }
  function aimAt(a, p, k = 1) {
    const e = _a.copy(a.body.pos);
    e.y += a.body.h - 0.2;
    const dx = p.x - e.x,
      dy = p.y - e.y,
      dz = p.z - e.z;
    const yaw = Math.atan2(-dx, -dz);
    let d = yaw - a.body.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.body.yaw += d * k;
    a.body.pitch = lerp(a.body.pitch, Math.atan2(dy, Math.hypot(dx, dz)), k);
  }
  const chest = (o, out = new V3()) => out.copy(o.body.pos).add(_b.set(0, o.body.h * 0.68, 0)),
    head = (o, out = new V3()) => out.copy(o.body.pos).add(_b.set(0, o.body.h - 0.22, 0));
  /* a visible shot: tracer from the shooter's muzzle, shield flare or blood spark, damage and kills */
  function shoot(
    a,
    tgt,
    {
      at = null,
      dmg = 20,
      headshot = false,
      miss = 0,
      color = 0xffd9a0,
      snd = "pshot",
      power = 1.4,
      life,
    } = {}
  ) {
    const fw = _a.set(-Math.sin(a.body.yaw), 0, -Math.cos(a.body.yaw)),
      rt = _b.set(Math.cos(a.body.yaw), 0, -Math.sin(a.body.yaw));
    const m = a.body.pos.clone().addScaledVector(fw, 0.75).addScaledVector(rt, 0.18);
    m.y += a.body.h - 0.45;
    const p = at ? at.clone() : tgt ? (headshot ? head(tgt) : chest(tgt)) : m.clone().addScaledVector(fw, 30);
    if (miss)
      p.add(
        _c.set(
          (Math.random() - 0.5) * miss,
          Math.random() * miss * 0.6 + miss * 0.3,
          (Math.random() - 0.5) * miss
        )
      );
    K.tracer(m, p, color, life);
    a.firedT = T;
    K.sfx(snd, 0.55);
    if (tgt && !miss && !tgt.dead) {
      const had = tgt.body.shield > 0;
      K.spark(p, 3, had ? 0xffd36b : 0xff7a6a);
      tgt.rig.flashHit(a.body.pos);
      if (headshot && !had) {
        kill(tgt, a.body.pos, power);
        return;
      }
      const s = Math.min(tgt.body.shield, dmg);
      tgt.body.shield -= s;
      if (had && tgt.body.shield <= 0) {
        K.shieldPop(chest(tgt));
        K.sfx("pop", 0.8);
      }
      if (dmg - s > 40) kill(tgt, a.body.pos, power);
    } else K.spark(p, 2);
  }
  /* thrown grenades are scripted arcs that land where the shot needs them */
  const grenades = [];
  function nadeMesh(color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color }));
    m.material.color.multiplyScalar(3);
    K.scene.add(m);
    return m;
  }
  function throwNade(from, to, flight, color, onLand, stick) {
    const g = {
      mesh: nadeMesh(color),
      a: from.clone(),
      b: to.clone(),
      t0: T,
      flight,
      onLand,
      stick,
      done: false,
    };
    grenades.push(g);
    K.sfx("swing", 0.6);
    return g;
  }
  function updNades() {
    for (const g of grenades) {
      if (g.done) continue;
      const k = Math.min(1, (T - g.t0) / g.flight);
      if (g.stick && k >= 1) {
        g.mesh.position.copy(chest(g.stick));
        g.mesh.scale.setScalar(1 + 0.35 * Math.sin(T * 30));
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
  /* ---------------- camera ---------------- */
  function cam(p, l, fov = 55, roll = 0, smooth = 0, dt = 0) {
    const c = K.camera;
    if (smooth && camS.init) {
      const k = 1 - Math.exp(-smooth * dt);
      camS.p.lerp(p, k);
      camS.l.lerp(l, k);
    } else {
      camS.p.copy(p);
      camS.l.copy(l);
      camS.init = true;
    }
    c.position.copy(camS.p);
    if (shakeT > 0 && !K.reduceMotion) {
      const s = shakeT * 0.35;
      c.position.x += (Math.random() - 0.5) * s;
      c.position.y += (Math.random() - 0.5) * s;
      c.position.z += (Math.random() - 0.5) * s;
    }
    c.lookAt(camS.l);
    if (roll) c.rotateZ(roll);
    if (c.fov !== fov) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }
  const V = (x, y, z) => new V3(x, y, z);
  const behind = (a, back, side, up, out = new V3()) => {
    const y = a.body.yaw;
    return out.set(
      a.body.pos.x + Math.sin(y) * back + Math.cos(y) * side,
      a.body.pos.y + up,
      a.body.pos.z + Math.cos(y) * back - Math.sin(y) * side
    );
  };
  const ahead = (a, d, up, out = new V3()) => {
    const y = a.body.yaw;
    return out.set(a.body.pos.x - Math.sin(y) * d, a.body.pos.y + up, a.body.pos.z - Math.cos(y) * d);
  };
  /* ---------------- title cards ---------------- */
  const CARDS = [
    { t: 0.9, d: 2.7, eb: "Orbital proving ground", big: "Foundry Basin" },
    { t: 5, d: 2.6, big: "", sub: "Shields up. Visors down." },
    { t: 8.25, d: 1.4, big: "Move", punch: 1 },
    { t: 10.25, d: 1.4, big: "Faster", punch: 1 },
    { t: 12.25, d: 1.4, big: "Higher", punch: 1 },
    { t: 14.55, d: 1.3, big: "Harder", punch: 1 },
    { t: 32.3, d: 3.1, eb: "4 v 4", big: "Capture the flag" },
    { t: 36.3, d: 3.1, eb: "Adaptive AI", big: "They learn", sub: "how you play" },
    { t: 40.3, d: 3.1, eb: "Peer to peer", big: "Bring friends", sub: "No install. No accounts." },
    { t: 44.3, d: 3.1, eb: "Destructible cover", big: "Nothing is safe" },
    { t: 48.4, d: 3.2, big: "Every second", punch: 1 },
    { t: 52.4, d: 3.2, big: "is a weapon", punch: 1 },
  ];
  const FLASH = [16, 56, 62];
  /* overlay animation is computed from trailer time (not CSS keyframes) so frame-stepped capture matches live playback */
  function updOverlay() {
    let i = -1;
    for (let k = 0; k < CARDS.length; k++)
      if (T >= CARDS[k].t - 0.4 && T < CARDS[k].t + CARDS[k].d + 0.4) i = k;
    const el = $("trCard");
    if (i !== cardI) {
      cardI = i;
      if (i >= 0) {
        const c = CARDS[i];
        el.querySelector(".eb").textContent = c.eb || "";
        el.querySelector(".big").textContent = c.big || "";
        el.querySelector(".sub").textContent = c.sub || "";
        el.className = c.punch ? "punch" : "";
      }
    }
    if (i >= 0) {
      const c = CARDS[i],
        pin = ease((T - c.t) / 0.5),
        pout = ease((T - (c.t + c.d)) / 0.35),
        o = pin * (1 - pout);
      el.style.opacity = o.toFixed(3);
      el.style.filter = `blur(${((1 - pin) * 8 + pout * 6).toFixed(1)}px)`;
      el.style.letterSpacing = `${((c.punch ? 0.2 : 0.13) + (1 - pin) * 0.35).toFixed(3)}em`;
      el.style.transform = `translateY(-50%) scale(${(1 + (c.punch ? 0.06 : 0.02) * (T - c.t)).toFixed(4)})`;
    } else el.style.opacity = 0;
    let f = 0;
    for (const t of FLASH) if (T >= t) f = Math.max(f, 1 - (T - t) / 0.45);
    $("trFlash").style.opacity = Math.max(0, f).toFixed(3);
    const tt = T - 56,
      lb = tt < 0 ? 11.5 : 11.5 * (1 - ease(tt / 0.8));
    for (const x of document.querySelectorAll("#trailer .lb")) x.style.height = lb.toFixed(2) + "vh";
    const ti = $("trTitle"),
      lg = ease(tt / 1.6),
      tg = ease((tt - 1.4) / 0.8);
    ti.style.opacity = tt < 0 ? 0 : Math.min(1, tt / 0.9).toFixed(3);
    ti.style.filter = `blur(${((1 - lg) * 14).toFixed(1)}px)`;
    ti.style.transform = `translateY(-50%) scale(${(1.25 - 0.25 * lg + (tt > 0 ? tt * 0.008 : 0)).toFixed(4)})`;
    ti.querySelector(".tag").style.opacity = tg.toFixed(3);
    if (T > TR.END - 1.6)
      $("trailer").style.background = `rgba(0,0,0,${ease((T - (TR.END - 1.6)) / 1.4).toFixed(3)})`;
    else $("trailer").style.background = "";
  }
  /* ---------------- shot list (seconds; music is 120 BPM, a bar is 2 s) ---------------- */
  const SHOTS = [
    {
      t: 0,
      name: "aerial",
      setup() {
        K.resetDestruction();
        put(hero, -10, 0, -14, 0.3);
        put(ally, -16, 0, 12, 1.8);
        put(foe1, 12, 0, 10, 2.6);
        put(foe2, 8, 0, -20, -1.2);
      },
      update(lt, dt) {
        for (const [a, turn] of [
          [hero, 0.35],
          [ally, -0.3],
          [foe1, 0.28],
          [foe2, -0.25],
        ]) {
          a.body.yaw += turn * dt;
          drive(a, dt, { f: 1 });
        }
        const ang = 0.5 + lt * 0.11;
        cam(V(Math.sin(ang) * 40, 25 - lt * 1.5, Math.cos(ang) * 40), V(0, 1, 0), 48);
      },
    },
    {
      t: 4,
      name: "visor",
      setup() {
        clearStage();
        put(hero, -20, 0, -4, -PI / 2, 0.04);
        put(foe1, -8, 0, -2, PI / 2);
      },
      update(lt, dt) {
        hero.body.yaw = -PI / 2 + 0.07 * Math.sin(lt * 0.9);
        hero.reload = lt > 1.6 && lt < 3.4 ? (lt - 1.6) / 1.8 : -1;
        drive(hero, dt, {});
        drive(foe1, dt, {});
        const e = ease(lt / 4),
          y = hero.body.yaw,
          fx = -Math.sin(y),
          fz = -Math.cos(y),
          rx = Math.cos(y),
          rz = -Math.sin(y),
          d = 2.1 - 0.55 * e,
          s = 0.45 - 0.2 * e;
        cam(
          V(hero.body.pos.x + fx * d + rx * s, 1.78 + 0.03 * e, hero.body.pos.z + fz * d + rz * s),
          V(hero.body.pos.x, 1.66, hero.body.pos.z),
          30 - 5 * e
        );
      },
    },
    {
      t: 8,
      name: "boots",
      setup() {
        clearStage();
        put(hero, 14, 0, -26.2, PI / 2);
      },
      update(lt, dt) {
        drive(hero, dt, { f: 1, sprint: true });
        cam(V(3, 0.3, -28), V(hero.body.pos.x, 0.45, -26.2), 58);
      },
    },
    {
      t: 10,
      name: "thrust",
      setup() {
        clearStage();
        put(hero, -22, 0, 8, -PI / 2);
        put(foe1, 4, 0, 10, PI / 2);
      },
      update(lt, dt) {
        const I = { f: 1, sprint: lt < 0.4 };
        if (lt > 0.42 && once(hero, "t1")) {
          I.thrust = true;
          I.f = 0;
          I.s = -1;
        }
        if (lt > 1.15 && once(hero, "t2")) {
          hero.body.thrustCD = 0;
          I.thrust = true;
          I.f = 0;
          I.s = 1;
        }
        drive(hero, dt, I);
        drive(foe1, dt, {});
        cam(behind(hero, 5.2, 2.2, 2.1), ahead(hero, 4, 1.1), 62, 0, 9, dt);
      },
    },
    {
      t: 12,
      name: "clamber",
      setup() {
        clearStage();
        put(hero, 24, 0, 0.5, PI / 2);
      },
      update(lt, dt) {
        const I = { f: lt < 1.7 ? 1 : 0 };
        if (lt > 0.42 && once(hero, "j")) I.jumpP = true;
        drive(hero, dt, I);
        cam(V(21, 3.2, 7.5), _c.copy(hero.body.pos).setY(hero.body.pos.y + 1.1), 50, 0, 6, dt);
      },
    },
    {
      t: 14.492,
      name: "pound",
      setup() {
        clearStage();
        K.resetDestruction();
        put(hero, 7.5, 5.21, 0, -PI / 2, -0.95);
        put(foe1, 14.3, 0, -1.3, PI / 2 - 0.2, 40);
        put(foe2, 14.7, 0, 1.4, PI / 2 + 0.2, 40);
      },
      ts(lt) {
        const k = lt - 1.508;
        return k > 0 && k < 0.9 ? 0.32 : 1;
      },
      update(lt, dt) {
        const I = { f: lt < 0.45 ? 0.8 : 0, crouch: lt > 0.62 && lt < 1.35 };
        if (lt > 0.15 && once(hero, "j")) I.jumpP = true;
        if (lt > 0.62 && once(hero, "c")) I.crouchP = true;
        drive(hero, dt, I);
        for (const f of [foe1, foe2]) {
          if (!f.dead) aimAt(f, head(hero), 0.2);
          drive(f, dt, {});
          if (!f.dead && lt > 0.5 && lt < 1.4 && Math.random() < dt * 7)
            shoot(f, null, { at: head(hero), miss: 1.6, color: 0x9fdcff });
        }
        if (lt < 1.508)
          cam(V(13, 1.1, 7.5), _c.copy(hero.body.pos).setY(hero.body.pos.y + 0.6), 36, -0.05, 5, dt);
        else cam(V(10.2, 0.75, 6.8), V(14.6, 1, 0), 58, 0.03);
      },
    },
    {
      t: 18,
      name: "slide",
      setup() {
        clearStage();
        put(hero, -30, 0, -6, -PI / 2);
        put(foe1, -12, 0, -7.6, PI / 2);
      },
      update(lt, dt) {
        const I = { f: 1, sprint: lt < 0.72, crouch: lt > 0.72 && lt < 1.7 };
        if (lt > 0.72 && once(hero, "c")) I.crouchP = true;
        drive(hero, dt, I);
        aimAt(foe1, head(hero), 0.3);
        drive(foe1, dt, {});
        if (Math.random() < dt * 9)
          shoot(foe1, null, { at: head(hero).add(_a.set(0, 0.55, 0)), miss: 0.8, color: 0x9fdcff });
        cam(V(hero.body.pos.x + 1.6, 0.62, -10.3), V(hero.body.pos.x + 2.4, 0.8, -6), 54, 0, 10, dt);
      },
    },
    {
      t: 20,
      name: "charge",
      setup() {
        clearStage();
        hero.hitT = null;
        put(hero, -30, 0, -6, -PI / 2);
        put(foe1, -16.5, 0, -6, PI / 2, 0);
      },
      ts(lt) {
        return hero.hitT != null && lt - hero.hitT < 0.7 ? 0.28 : 1;
      },
      update(lt, dt) {
        const I = { f: lt < 1.65 ? 1 : 0, sprint: lt < 1.2 };
        if (lt > 1.12 && once(hero, "m")) I.meleeP = true;
        drive(hero, dt, I);
        if (!foe1.dead) {
          aimAt(foe1, head(hero), 0.4);
          if (Math.random() < dt * 5) shoot(foe1, null, { at: head(hero), miss: 1.2, color: 0x9fdcff });
        }
        drive(foe1, dt, {});
        if (hero.body.chargeT > 0 && !foe1.dead && hero.body.pos.distanceTo(foe1.body.pos) < 1.9) {
          hero.hitT = lt;
          kill(foe1, hero.body.pos, 3.6);
          K.sfx("land", 1);
          K.sfx("boom", 0.4);
          K.shock(chest(foe1));
          shakeT = 0.5;
        }
        cam(V(-14.2, 1.15, -3.6), _c.copy(hero.body.pos).lerp(foe1.body.pos, 0.35).setY(1.2), 46, 0, 8, dt);
      },
    },
    {
      t: 22,
      name: "duel",
      setup() {
        clearStage();
        hero.hitT = null;
        put(hero, -8, 0, -24, -PI / 2);
        put(foe1, 6, 0, -24, PI / 2);
      },
      update(lt, dt) {
        drive(hero, dt, { s: -Math.sin(lt * 2.8) * 0.8, aim: true });
        drive(foe1, dt, { s: Math.sin(lt * 2.3 + 1) * 0.9 });
        if (!foe1.dead) aimAt(hero, chest(foe1), 0.5);
        aimAt(foe1, chest(hero), 0.5);
        const sh = Math.floor(lt / 0.27);
        if (sh !== hero.lastSh && lt > 0.25 && !foe1.dead) {
          hero.lastSh = sh;
          shoot(hero, foe1, { dmg: 18, headshot: foe1.body.shield <= 0, power: 1.8 });
        }
        if (!foe1.dead && Math.random() < dt * 6)
          shoot(foe1, null, { at: chest(hero), miss: 1.4, color: 0x9fdcff });
        const p = behind(hero, 2.5, 0.85, 1.78),
          l = _c.copy(chest(foe1));
        cam(p, l, 42, 0, 12, dt);
      },
    },
    {
      t: 24,
      name: "frag",
      setup() {
        clearStage();
        hero.lastSh = null;
        K.resetDestruction();
        put(hero, 3, 0, 6, 0);
        aimAt(hero, V(13.5, 1, 13.5), 1);
        put(foe1, 14.6, 0, 15.6, PI * 0.75, 70);
        put(foe2, 12.4, 0, 16.2, PI * 0.8, 70);
      },
      update(lt, dt) {
        drive(hero, dt, {});
        for (const f of [foe1, foe2]) {
          if (!f.dead) aimAt(f, head(hero), 0.3);
          drive(f, dt, {});
        }
        if (lt > 0.15 && once(hero, "n")) {
          const from = head(hero).addScaledVector(
            _a.set(-Math.sin(hero.body.yaw), 0, -Math.cos(hero.body.yaw)),
            0.6
          );
          throwNade(from, V(13.3, 0.15, 15.1), 1.05, 0xffa040, g => {
            const p = g.b;
            K.blast(p, 0xffa040, 6.5);
            K.shock(p);
            K.sfx("boom", 1);
            K.damageRadius(p, 4.6, 4000, true);
            shakeT = 0.6;
            g.mesh.visible = false;
            g.done = true;
            for (const f of [foe1, foe2]) kill(f, p, 3.2);
          });
        }
        updNades();
        const e = ease(lt / 2);
        cam(V(lerp(5.5, 7.5, e), lerp(3.8, 3, e), lerp(5, 7, e)), V(13, 1.2, 14), 50, 0, 6, dt);
      },
    },
    {
      t: 26,
      name: "sniper",
      setup() {
        clearStage();
        put(foe1, 30, 0, -13, PI * 0.0, 70);
        foe1.wpn = 1;
        $("trScope").hidden = false;
      },
      ts(lt) {
        return lt > 0.92 && lt < 1.6 ? 0.3 : 1;
      },
      update(lt, dt) {
        drive(foe1, dt, { s: foe1.dead ? 0 : 1, f: 0 });
        foe1.body.yaw = -PI / 2;
        const eye = V(4.4, 4.85, -3.6),
          hp = head(foe1);
        if (lt < 1 && !foe1.dead) {
          _c.copy(hp).add(_a.set(Math.sin(lt * 3) * 0.25, Math.cos(lt * 2.3) * 0.12, 0));
        } else _c.copy(camS.l.distanceTo(hp) < 3 ? camS.l : hp);
        if (lt >= 1 && once(foe1, "snipe")) {
          K.tracer(V(eye.x + 0.3, eye.y - 0.25, eye.z), hp, 0x9fd8ff, 0.6);
          K.sfx("sshot", 1);
          K.spark(hp, 10, 0xff7a6a);
          kill(foe1, eye, 2.6);
          shakeT = 0.25;
        }
        cam(eye, _c, 78 / 5, 0, lt < 1 ? 14 : 0, dt);
      },
    },
    {
      t: 28,
      name: "plasma",
      setup() {
        clearStage();
        $("trScope").hidden = true;
        put(hero, -9, 0, 4, PI);
        put(foe1, -25, 0, -8, -PI / 2, 70);
      },
      update(lt, dt) {
        drive(foe1, dt, { f: foe1.dead ? 0 : 1, sprint: lt < 1.6 });
        drive(hero, dt, {});
        aimAt(hero, chest(foe1), 0.3);
        if (lt > 0.15 && once(hero, "p")) {
          const from = head(hero);
          const g = throwNade(from, chest(foe1).add(_a.set(5.2, 0, 0)), 0.7, 0x52b8ff, null, foe1);
          g.onLand = gg => {
            K.sfx("stick", 1);
          };
        }
        if (lt > 1.55 && once(foe1, "boom")) {
          const p = chest(foe1);
          K.blast(p, 0x52b8ff, 6);
          K.shock(p);
          K.sfx("boom", 1);
          shakeT = 0.5;
          kill(foe1, p, 3);
          for (const g of grenades) {
            g.done = true;
            g.mesh.visible = false;
          }
        }
        updNades();
        cam(
          _c.copy(foe1.body.pos).add(_a.set(4.2, 1.15, 4.2)),
          _b.copy(foe1.body.pos).add(V(0, 1.1, 0)),
          46,
          0,
          7,
          dt
        );
      },
    },
    {
      t: 30,
      name: "bullet-time",
      setup() {
        clearStage();
        put(hero, 21.5, 2.6, 21.5, PI / 4);
        put(foe1, 13, 0, 14.5, 0, 70);
        put(foe2, 11.5, 0, 17, 0.4, 70);
      },
      ts(lt) {
        return lt > 0.42 && lt < 1.85 ? 0.26 : 1;
      },
      update(lt, dt) {
        const I = { f: lt < 0.35 ? 1 : 0, aim: lt > 0.42 };
        if (lt > 0.05 && once(hero, "j")) I.jumpP = true;
        if (lt > 0.3 && once(hero, "t")) {
          I.thrust = true;
        }
        drive(hero, dt, I);
        for (const f of [foe1, foe2]) {
          drive(f, dt, {});
          if (!f.dead) aimAt(f, head(hero), 0.4);
        }
        const tgt = !foe1.dead ? foe1 : foe2;
        if (!tgt.dead) aimAt(hero, head(tgt), 0.6);
        const sh = Math.floor(lt / 0.12);
        if (lt > 0.5 && sh !== hero.lastSh && !tgt.dead) {
          hero.lastSh = sh;
          shoot(hero, tgt, { dmg: 24, headshot: tgt.body.shield <= 0, power: 2, snd: "shot" });
        }
        const ang = lt * 1.1 + 0.6,
          h = hero.body.pos;
        cam(
          V(h.x + Math.sin(ang) * 4.6, h.y + 0.9, h.z + Math.cos(ang) * 4.6),
          V(h.x, h.y + 1.2, h.z),
          56,
          0,
          14,
          dt
        );
      },
    },
    /* ----- live AI capture-the-flag ----- */
    {
      t: 32,
      name: "ctf-crane",
      setup() {
        clearStage();
        hero.lastSh = null;
        startCTF();
      },
      ctf: true,
      update(lt, dt) {
        const c = action();
        const e = ease(lt / 4);
        cam(V(lerp(-44, -30, e), lerp(30, 22, e), lerp(-30, -6, e)), _c.copy(c).setY(0), 50, 0, 2, dt);
      },
    },
    {
      t: 36,
      name: "ctf-chase",
      ctf: true,
      setup() {
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        const a = focus;
        if (!a) return;
        cam(behind(a, 4.6, 1.5, 2.1), ahead(a, 4, 1.2), 58, 0, 4, dt);
      },
    },
    {
      t: 40,
      name: "ctf-orbit",
      ctf: true,
      setup() {
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        if (!focus) return;
        const p = focus.body.pos,
          ang = lt * 0.45 + 1;
        cam(
          V(p.x + Math.sin(ang) * 7.5, p.y + 3.2, p.z + Math.cos(ang) * 7.5),
          V(p.x, p.y + 1.2, p.z),
          55,
          0,
          4,
          dt
        );
      },
    },
    {
      t: 44,
      name: "ctf-flank",
      ctf: true,
      setup() {
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        if (!focus) return;
        const p = focus.body.pos,
          y = focus.body.yaw;
        cam(V(p.x + Math.cos(y) * 9, p.y + 2.4, p.z - Math.sin(y) * 9), V(p.x, p.y + 1.2, p.z), 48, 0, 3, dt);
      },
    },
    {
      t: 48,
      name: "ctf-slowmo",
      ctf: true,
      ts() {
        return 0.3;
      },
      setup() {
        pickFocus(true);
      },
      update(lt, dt) {
        pickFocus();
        if (!focus) return;
        const p = focus.body.pos,
          ang = lt * 0.18 + 2;
        cam(
          V(p.x + Math.sin(ang) * 6, p.y + 1.6 + lt * 0.25, p.z + Math.cos(ang) * 6),
          V(p.x, p.y + 1.2, p.z),
          50,
          0,
          3,
          dt
        );
      },
    },
    {
      t: 56,
      name: "title",
      ctf: true,
      ts() {
        return 0.55;
      },
      setup() {},
      update(lt, dt) {
        const e = ease(lt / 10);
        cam(V(lerp(-20, 10, e), lerp(14, 34, e), lerp(-58, -40, e)), V(0, lerp(4, 0, e), 0), 46, 0, 2, dt);
        if (lt > 6 && once(hero, "end")) shakeT = 0.6;
      },
    },
  ];
  /* ---------------- CTF montage support ---------------- */
  function startCTF() {
    if (G) return;
    G = CTF.Game({ mode: "sim", render: true, diff: ["legendary", "legendary"] });
    CTF.UI.attach(G, "sim");
    CTF.UI.quiet = true;
    $("ctfHud").hidden = true;
    G.start();
    for (let i = 0; i < 1150; i++) G.step(1 / 30);
    CTF.UI.frame(1 / 30);
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
  function score(a) {
    let s = 0;
    if (a.carrying) s += 100;
    if (a.target && G.t >= a.acqT) s += 30;
    if (a.role === "attack" || a.role === "escort" || a.role === "carry") s += 8;
    s -= a.body.pos.length() * 0.05;
    return s;
  }
  function pickFocus(force) {
    if (!G) return;
    if (!focus) force = true;
    focusT -= 1 / 30;
    if (!force && focus && focus.alive && focusT > 0) return;
    let best = null,
      bs = -1e9;
    for (const a of G.agents) {
      if (!a.alive) continue;
      const s = score(a);
      if (s > bs) {
        bs = s;
        best = a;
      }
    }
    if (best !== focus) {
      focus = best;
      camS.init = camS.init && !force;
    }
    focusT = 2.5;
  }
  /* ---------------- frame ---------------- */
  function frame(dt) {
    let i = SHOTS.length - 1;
    while (i > 0 && T < SHOTS[i].t) i--;
    if (i !== shotI) {
      shotI = i;
      camS.init = false;
      SHOTS[i].setup();
    }
    const S = SHOTS[i],
      lt = T - S.t,
      ts = S.ts ? S.ts(lt) : 1,
      sdt = dt * ts;
    if (S.ctf && G) {
      let r = sdt;
      while (r > 1e-6) {
        const h = Math.min(r, 1 / 30);
        G.step(h);
        r -= h;
      }
      CTF.UI.frame(sdt);
    }
    S.update(lt, sdt);
    shakeT = Math.max(0, shakeT - dt);
    K.updFX(sdt);
    updOverlay();
    K.renderFrame();
  }
  /* ---------------- start / stop ---------------- */
  function begin(record) {
    cast();
    K.audio();
    T = 0;
    shotI = -1;
    cardI = -1;
    focus = null;
    camS.init = false;
    TR.active = true;
    TR.recording = !!record;
    K.extFull({ full: liveFrame, exit: cleanup });
    K.vmRoot.visible = false;
    const ov = $("trailer");
    ov.hidden = false;
    ov.classList.toggle("rec", !!record);
    $("trCard").className = "";
    $("trCard").style.opacity = 0;
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
    for (const g of grenades) K.scene.remove(g.mesh);
    grenades.length = 0;
    clearStage();
    if (G) {
      CTF.UI.detach();
      G = null;
      CTF.exitMap();
    }
    K.resetDestruction();
    $("trailer").hidden = true;
    $("trScope").hidden = true;
    const fp = $("fps");
    if (fp) fp.style.visibility = "";
    K.camera.fov = 78;
    K.camera.updateProjectionMatrix();
    K.camera.rotation.z = 0;
  }
  function stop() {
    if (TR.active) K.extStop();
  }
  TR.start = () => begin(false);
  TR.stop = stop;
  /* capture: step the timeline by a fixed amount and render, without audio */
  TR.record = () => begin(true);
  TR.step = dt => {
    T += dt;
    frame(dt);
    return T;
  };
  TR.seek = t => {
    while (T < t - 1e-6) TR.step(Math.min(1 / 30, t - T));
  };
  $("trailerBtn").onclick = () => TR.start();
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
