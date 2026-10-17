/* ============ CINEMA: the shared camera toolkit ============
   Shots are small functions of time that return where the camera is and what it looks at; CINE.apply
   puts the camera there (with optional smoothing, shake, roll and field of view). Used by the
   trailer, the match intro, kill cams, Play of the Game and the spectator director.
     CINE.orbit(center, radius, height, angle0, speed)      circle a point
     CINE.track(pilot, back, side, up, lead)                 chase a pilot (over the shoulder with side ≠ 0)
     CINE.firstPerson(pose)                                  a recorded pilot's eyes ({x,y,z,yaw,pitch})
     CINE.crane(fromShot, toShot, ease)                      blend between two shots over t = 0..1
     CINE.fixed(p, look)
   Presentation: letterbox(on), card(eyebrow, big, sub, seconds), caption(text), flash(strength),
   shake(amount), slowmo(scale, seconds), look({ dof, focus, range, grade, ca, streak }) for the
   cinematic post look. Easing: CINE.ease.inOut/out/in. */
const CINE = (() => {
  const _p = new V3(),
    _l = new V3(),
    _t = new V3();
  const state = { p: new V3(), l: new V3(), init: false, shake: 0, slowT: 0, slowK: 1 };
  const ease = {
    linear: x => x,
    in: x => x * x,
    out: x => 1 - (1 - x) * (1 - x),
    inOut: x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)),
  };
  /* ---- shots: (t) => { p, l, fov? } ---- */
  const fixed = (p, l, fov) => () => ({ p, l, fov });
  const orbit =
    (center, radius, height, a0 = 0, speed = 0.3, fov) =>
    t => {
      const a = a0 + t * speed;
      return {
        p: _p
          .set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius)
          .clone(),
        l: center,
        fov,
      };
    };
  /** behind (back > 0) a pilot, offset to the side, looking a little ahead of them; avoids walls */
  const track =
    (pilot, back = 5.5, side = 1.6, up = 2.6, lead = 3, fov) =>
    () => {
      const b = pilot.body,
        fx = -Math.sin(b.yaw),
        fz = -Math.cos(b.yaw);
      const l = new V3(b.pos.x + fx * lead, b.pos.y + 1.3, b.pos.z + fz * lead);
      const want = new V3(b.pos.x - fx * back + fz * side, b.pos.y + up, b.pos.z - fz * back - fx * side);
      const head = _t.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
      const dir = want.clone().sub(head),
        L = dir.length();
      if (L > 0.01) {
        dir.multiplyScalar(1 / L);
        const hit = rayWorld(head, dir, L);
        if (hit < L) want.copy(head).addScaledVector(dir, Math.max(0.6, hit - 0.4));
      }
      return { p: want, l, fov };
    };
  /** a recorded pose's eyes: { x, y, z, yaw, pitch, st } from REC.sample */
  const firstPerson = (pose, fov = 78) => {
    const h = pose.st && pose.st.crouch ? H_CROUCH : H_STAND;
    const cp = Math.cos(pose.pitch);
    const p = new V3(pose.x, pose.y + h - 0.12, pose.z);
    return {
      p,
      l: p.clone().add(_l.set(-Math.sin(pose.yaw) * cp, Math.sin(pose.pitch), -Math.cos(pose.yaw) * cp)),
      fov,
    };
  };
  const crane =
    (a, b, e = ease.inOut) =>
    t => {
      const k = e(Math.max(0, Math.min(1, t))),
        A = a(t),
        B = b(t);
      return {
        p: A.p.clone().lerp(B.p, k),
        l: A.l.clone().lerp(B.l, k),
        fov: A.fov != null && B.fov != null ? A.fov + (B.fov - A.fov) * k : A.fov || B.fov,
      };
    };
  /** put the camera on a shot sample. smooth: follow rate (0 = cut), dt: frame time */
  function apply(s, smooth = 0, dt = 0, roll = 0) {
    const c = camera;
    if (smooth && state.init) {
      const k = 1 - Math.exp(-smooth * dt);
      state.p.lerp(s.p, k);
      state.l.lerp(s.l, k);
    } else {
      state.p.copy(s.p);
      state.l.copy(s.l);
      state.init = true;
    }
    c.position.copy(state.p);
    if (state.shake > 0 && !reduceMotion) {
      const a = state.shake * 0.35;
      c.position.x += (Math.random() - 0.5) * a;
      c.position.y += (Math.random() - 0.5) * a;
      c.position.z += (Math.random() - 0.5) * a;
      state.shake = Math.max(0, state.shake - dt * 2.5);
    }
    c.lookAt(state.l);
    if (roll) c.rotateZ(roll);
    const fov = s.fov || 62;
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }
  /* ---- presentation overlay (letterbox, card, caption, flash) ---- */
  let el = null;
  function ui() {
    if (el) return el;
    el = document.createElement("div");
    el.id = "cine";
    el.innerHTML =
      '<div class="lb top"></div><div class="lb bot"></div><div class="cap"></div><div class="card"><div class="eb"></div><div class="big"></div><div class="sub"></div></div><div class="fl"></div>';
    document.body.appendChild(el);
    return el;
  }
  const q = s => /** @type {HTMLElement} */ (ui().querySelector(s));
  let cardTimer = 0;
  return {
    ease,
    fixed,
    orbit,
    track,
    firstPerson,
    crane,
    apply,
    /**
     * the cinematic look for the post pipeline, or null for the normal game look.
     * dof: 0..1 blur strength, focus: distance in focus (m), range: depth of field (m), near: extra
     * foreground blur; grade: split-tone strength; ca: lens fringing; streak: anamorphic flares
     * (the trailer's look adds glitch, zoom, smear [x, y], vig and tint [r, g, b]: render/cine-look.js; game:
     * keep the game's own map look, grade, TAA and motion blur under it)
     * @param {{dof?: number, focus?: number, range?: number, near?: number, grade?: number, ca?: number, streak?: number, glitch?: number, zoom?: number, smear?: number[], vig?: number, tint?: number[], gseed?: number, game?: boolean} | null} l
     */
    look(l) {
      GFX.look = l;
      if (gfxReady) gfxResize();
    },
    /** forget the smoothed camera (next apply cuts) */
    cut() {
      state.init = false;
    },
    shake(a) {
      state.shake = Math.max(state.shake, a);
    },
    letterbox(on) {
      ui().classList.toggle("on", !!on);
    },
    caption(text) {
      q(".cap").textContent = text || "";
      ui().classList.toggle("capOn", !!text);
    },
    card(eb, big, sub, seconds = 2.5) {
      q(".eb").textContent = eb || "";
      q(".big").textContent = big || "";
      q(".sub").textContent = sub || "";
      const c = q(".card");
      c.classList.remove("show");
      void c.offsetWidth;
      c.classList.add("show");
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => c.classList.remove("show"), seconds * 1000);
    },
    flash(strength = 1) {
      const f = q(".fl");
      f.style.transition = "none";
      f.style.opacity = String(Math.min(1, strength));
      void f.offsetWidth;
      f.style.transition = "opacity .45s ease-out";
      f.style.opacity = "0";
    },
    /** slow the world down (game time) for a moment; scale 0..1 */
    slowmo(scale, seconds) {
      state.slowK = scale;
      state.slowT = seconds;
    },
    /** the time multiplier the loop applies this frame (from slowmo) */
    timeK(rawDt) {
      if (state.slowT <= 0) return 1;
      state.slowT -= rawDt;
      return state.slowT > 0 ? state.slowK : 1;
    },
    /** hide everything (leaving a cinematic) */
    clear() {
      if (!el) return;
      el.classList.remove("on", "capOn");
      q(".card").classList.remove("show");
      state.slowT = 0;
    },
  };
})();
