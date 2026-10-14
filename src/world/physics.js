/* ============ physics ============ */
const R = 0.38,
  H_STAND = 1.8,
  H_CROUCH = 1.2;
/* movement tuning. The defaults were chosen by simulation (tools/tune.js, docs/TUNING.md); the
   Sandbox settings tab can change every one of them. */
const TUNE_DEF = {
  run: 6.4,
  sprint: 9,
  crouchSpeed: 3.2,
  jump: 7.4,
  grav: 24,
  accel: 80,
  reverse: 95,
  airAccel: 18,
  thrust: 17,
  thrustCD: 2.2,
  slideBoost: 3.2,
  slideCap: 15,
};
const TUNE = Object.assign({}, TUNE_DEF);
/* pilots are solid to each other: modes say who else is in the world (anything with pos, h and dead) */
const NO_PILOTS = [];
let pilotsFn = null;
/** @param {((self: any) => any[]) | null} fn */
function setPilotCollider(fn) {
  pilotsFn = fn;
}
function ov(px, py, pz, h, b) {
  return (
    px + R > b.x0 + 1e-4 &&
    px - R < b.x1 - 1e-4 &&
    py + h > b.y0 + 1e-4 &&
    py < b.y1 - 1e-4 &&
    pz + R > b.z0 + 1e-4 &&
    pz - R < b.z1 - 1e-4
  );
}
function freeAt(x, y, z, h) {
  for (const b of SOLID) if (ov(x, y, z, h, b)) return false;
  return true;
}
function groundBelow(x, z, y, r = R) {
  let g = -50;
  for (const b of SOLID) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 <= y + 0.05 && b.y1 > g)
      g = b.y1;
  }
  return g;
}
function rayBox(o, d, b, maxT) {
  let t0 = 0,
    t1 = maxT,
    ta,
    tb,
    s;
  if (d.x > -1e-9 && d.x < 1e-9) {
    if (o.x < b.x0 || o.x > b.x1) return -1;
  } else {
    ta = (b.x0 - o.x) / d.x;
    tb = (b.x1 - o.x) / d.x;
    if (ta > tb) {
      s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (d.y > -1e-9 && d.y < 1e-9) {
    if (o.y < b.y0 || o.y > b.y1) return -1;
  } else {
    ta = (b.y0 - o.y) / d.y;
    tb = (b.y1 - o.y) / d.y;
    if (ta > tb) {
      s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (d.z > -1e-9 && d.z < 1e-9) {
    if (o.z < b.z0 || o.z > b.z1) return -1;
  } else {
    ta = (b.z0 - o.z) / d.z;
    tb = (b.z1 - o.z) / d.z;
    if (ta > tb) {
      s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}
function rayWorld(o, d, maxT) {
  let best = maxT;
  for (const b of SOLID) {
    const t = rayBox(o, d, b, best);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}
function raySphere(o, d, c, r) {
  const ox = o.x - c.x,
    oy = o.y - c.y,
    oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}
function rayTarget(o, d, p, h, maxT) {
  const ht = raySphere(o, d, { x: p.x, y: p.y + h - 0.24, z: p.z }, 0.25);
  const bt = rayBox(
    o,
    d,
    { x0: p.x - 0.4, x1: p.x + 0.4, y0: p.y, y1: p.y + h - 0.45, z0: p.z - 0.4, z1: p.z + 0.4 },
    maxT
  );
  let r = null;
  if (bt >= 0) r = { t: bt, head: false };
  if (ht >= 0 && (!r || ht < r.t)) r = { t: ht, head: true };
  return r && r.t < maxT ? r : null;
}

class Body {
  constructor() {
    this.pos = new V3();
    this.vel = new V3();
    this._f = new V3();
    this._r = new V3();
    this._w = new V3();
    this.yaw = 0;
    this.pitch = 0;
    this.h = H_STAND;
    this.ground = false;
    this.reset();
  }
  reset() {
    this.vel.set(0, 0, 0);
    this.sprint = false;
    this.sprintT = 0;
    this.thrustCD = 0;
    this.thrustT = 0;
    this.slideT = 0;
    this.slideCD = 0;
    this.stabT = 0;
    this.stabbing = false;
    this.pound = 0;
    this.poundT = 0;
    this.clamber = null;
    this.chargeT = 0;
    this.meleeCD = 0;
    this.meleeT = 0;
    this.crouch = false;
    this.h = H_STAND;
    this.landLock = 0;
    this.shield = 70;
    this.health = 45;
    this.lastDmg = -99;
    this.dead = false;
    this.spawnT = 0;
    this.speedMul = 1;
    this.jumpBuf = 0;
    this.crouchBuf = 0;
    this.thrustBuf = 0;
    this.tuck = false;
    this.coyote = 0;
    /** seconds since last on the ground, and whether this time in the air began with a jump or thrust */
    this.airT = 0;
    this.launched = false;
  }
  fwd() {
    return new V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  aimDir() {
    const cp = Math.cos(this.pitch);
    return new V3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  step(dt, inp, ev) {
    const p = this.pos,
      v = this.vel,
      f = this._f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)),
      rt = this._r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    /** aiming down sights this step (drawn by the rig, sent to other players) */
    this.aiming = !!inp.aim && !this.sprint;
    this.thrustCD = Math.max(0, this.thrustCD - dt);
    this.slideCD = Math.max(0, this.slideCD - dt);
    this.meleeCD = Math.max(0, this.meleeCD - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.landLock = Math.max(0, this.landLock - dt);
    /* a blast gate rising where you stand moves you out of its way (world/gates.js) */
    gateShove(this);
    if (this.clamber) {
      const c = this.clamber;
      c.t += dt;
      const k = Math.min(1, c.t / c.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      p.lerpVectors(c.from, c.to, e);
      p.y = c.from.y + (c.to.y - c.from.y) * Math.min(1, k * 1.6);
      if (k >= 1) {
        this.clamber = null;
        v.set(f.x * 4, 0, f.z * 4);
        this.ground = true;
      }
      return;
    }
    if (inp.jumpP) this.jumpBuf = 0.13;
    if (inp.crouchP) this.crouchBuf = 0.15;
    if (inp.thrust) this.thrustBuf = 0.12;
    this.jumpBuf -= dt;
    this.crouchBuf -= dt;
    this.thrustBuf -= dt;
    this.coyote = this.ground ? 0.1 : this.coyote - dt;
    this.airT = this.ground ? 0 : this.airT + dt;
    if (this.ground) this.launched = false;
    const wish = this._w.set(0, 0, 0).addScaledVector(f, inp.f).addScaledVector(rt, inp.s);
    if (wish.lengthSq() > 1) wish.normalize();
    const canSprint = inp.sprint && inp.f > 0.3 && this.ground && this.slideT <= 0 && !inp.aim;
    if (canSprint) {
      this.sprint = true;
      this.sprintT += dt;
    } else if (this.ground) {
      this.sprint = false;
      this.sprintT = 0;
    }
    if (this.thrustBuf > 0 && this.thrustCD <= 0 && this.pound === 0 && this.landLock <= 0) {
      this.thrustBuf = 0;
      const dir = wish.lengthSq() > 0.01 ? wish.clone().normalize() : f.clone();
      v.x = dir.x * TUNE.thrust;
      v.z = dir.z * TUNE.thrust;
      if (!this.ground) v.y = Math.max(v.y, 0);
      this.thrustT = 0.24;
      this.launched = true;
      this.thrustCD = TUNE.thrustCD;
      this.sprint = false;
      this.sprintT = 0;
      this.slideT = 0;
      this.stabbing = false;
      ev("thrust", { dir });
    }
    const hs0 = Math.hypot(v.x, v.z);
    if (this.crouchBuf > 0 && this.ground && (this.sprint || hs0 > 7.5) && this.slideCD <= 0) {
      this.crouchBuf = 0;
      /* thrust into slide is the fastest way to cover ground, capped so it stays a technique, not a teleport */
      const sp = Math.min(Math.max(hs0, TUNE.sprint) + TUNE.slideBoost, TUNE.slideCap),
        il = 1 / Math.max(hs0, 1e-4);
      v.x *= il * sp;
      v.z *= il * sp;
      this.slideT = 0.8;
      this.slideCD = 1.1;
      this.sprint = false;
      this.thrustT = 0;
      ev("slide", {});
    }
    const hAbove = p.y - groundBelow(p.x, p.z, p.y);
    if (inp.crouchP && !this.ground && this.pound === 0 && hAbove > 2.2) {
      this.pound = 1;
      this.poundT = 0;
      this.stabbing = false;
      ev("poundCharge", {});
    }
    if (this.pound === 1) {
      this.poundT += dt;
      v.multiplyScalar(Math.pow(0.02, dt));
      v.y = Math.max(v.y, -1);
      if (!inp.crouch) {
        if (this.poundT >= 0.55) {
          const d = this.aimDir();
          if (d.y > -0.45) {
            d.y = -0.45;
          }
          d.normalize();
          v.copy(d).multiplyScalar(42);
          this.pound = 2;
          ev("poundGo", {});
        } else {
          this.pound = 0;
        }
      }
      if (this.ground) this.pound = 0;
    }
    this.stabbing = false;
    if (inp.aim && !this.ground && this.pound === 0 && this.stabT < 1.3 && this.thrustT <= 0 && v.y < 2) {
      this.stabbing = true;
      this.stabT += dt;
      v.y *= Math.pow(0.001, dt);
      v.x *= Math.pow(0.25, dt);
      v.z *= Math.pow(0.25, dt);
    }
    if (this.jumpBuf > 0 && (this.ground || this.coyote > 0) && v.y <= 0.5 && this.landLock <= 0) {
      this.jumpBuf = 0;
      this.coyote = 0;
      v.y = TUNE.jump;
      this.ground = false;
      this.launched = true;
      const slid = this.slideT > 0;
      this.slideT = 0;
      ev("jump", { slid });
    }
    if (inp.meleeP && this.meleeCD <= 0) {
      if (this.sprintT > 0.85 && this.ground) {
        this.chargeT = 0.38;
        this.meleeCD = 1.3;
        ev("charge", {});
      } else {
        this.meleeCD = 0.75;
        this.meleeT = 0.4;
        ev("melee", {});
      }
      this.sprint = false;
      this.sprintT = 0;
    }
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      v.x = f.x * 16;
      v.z = f.z * 16;
    }
    const wantCrouch = (inp.crouch && this.ground) || this.slideT > 0;
    if (wantCrouch) this.h = H_CROUCH;
    else if (this.h < H_STAND && freeAt(p.x, p.y, p.z, H_STAND)) this.h = H_STAND;
    this.crouch = this.h < H_STAND;
    if (this.thrustT > 0) {
      this.thrustT -= dt;
    } else if (this.chargeT > 0) {
      /* charging: the lunge velocity was set when the charge started; no other movement applies */
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.pow(0.32, dt);
      v.x *= k;
      v.z *= k;
      v.x += wish.x * 6 * dt;
      v.z += wish.z * 6 * dt;
      if (!inp.crouch && this.slideT < 0.55) this.slideT = 0;
    } else if (this.pound === 0) {
      /* aiming slows you a little with low-zoom scopes and more with a sniper scope (inp.aimMul) */
      const speed =
        (this.crouch
          ? TUNE.crouchSpeed
          : this.sprint
            ? TUNE.sprint
            : inp.aim
              ? TUNE.run * (inp.aimMul || 0.72)
              : TUNE.run) * (this.speedMul || 1);
      const tx = wish.x * speed,
        tz = wish.z * speed;
      if (this.ground) {
        const hs = Math.hypot(v.x, v.z);
        if (hs > speed + 0.5) {
          const k = Math.pow(0.02, dt);
          v.x = tx + (v.x - tx) * k;
          v.z = tz + (v.z - tz) * k;
        } else {
          /* strafing as a skill: reversing direction bites harder (95) than speeding up (70), so a
             well-timed change of direction is quick enough to make someone miss, but not instant */
          const a = (tx * v.x + tz * v.z < 0 ? TUNE.reverse : TUNE.accel) * dt;
          v.x += clamp(tx - v.x, -a, a);
          v.z += clamp(tz - v.z, -a, a);
        }
      } else {
        const a = TUNE.airAccel * dt;
        const nx = v.x + clamp(tx - v.x, -a, a),
          nz = v.z + clamp(tz - v.z, -a, a);
        if (Math.hypot(nx, nz) <= Math.max(Math.hypot(v.x, v.z), speed)) {
          v.x = nx;
          v.z = nz;
        }
      }
    }
    /* crouch-jump: tucking your legs in the air lets you clamber ledges ~0.45 m higher */
    this.tuck = !this.ground && !!inp.crouch && this.pound === 0;
    if (!(this.thrustT > 0 && !this.ground) && !this.stabbing && this.pound !== 1) v.y -= TUNE.grav * dt;
    if (this.pound === 2) v.y = Math.min(v.y, -30);
    if (
      !this.ground &&
      (inp.f > 0.3 || (this.thrustT > 0 && wish.lengthSq() > 0.1)) &&
      this.pound === 0 &&
      !this.clamber &&
      v.y < 6 &&
      /* walking off a step or down a flight of stairs leaves you in the air for a moment: that is not
         a reason to clamber (the probe would see the step after next as a ledge). Clambering needs a
         jump or thrust, or a real fall */
      (this.launched || this.airT > 0.25)
    ) {
      const base = Math.atan2(
        -(wish.lengthSq() > 0.01 ? wish.x : f.x),
        -(wish.lengthSq() > 0.01 ? wish.z : f.z)
      );
      for (const off of [0, 0.6, -0.6]) {
        const a = base + off,
          dx = -Math.sin(a),
          dz = -Math.cos(a);
        const ax = p.x + dx * 0.55,
          az = p.z + dz * 0.55;
        let done = false;
        for (const b of SOLID) {
          if (!(ax + R > b.x0 && ax - R < b.x1 && az + R > b.z0 && az - R < b.z1)) continue;
          const dy = b.y1 - p.y;
          if (dy > 0.3 && dy < (this.tuck ? 2.95 : 2.5)) {
            const to = new V3(p.x + dx * 0.95, b.y1 + 0.01, p.z + dz * 0.95);
            if (freeAt(to.x, to.y, to.z, H_STAND) && freeAt(p.x, b.y1 + 0.01, p.z, 0.4)) {
              this.clamber = { from: p.clone(), to, t: 0, dur: 0.2 + dy * 0.03 };
              v.set(0, 0, 0);
              this.thrustT = 0;
              this.stabbing = false;
              ev("clamber", {});
              done = true;
              break;
            }
          }
        }
        if (done) return;
      }
    }
    const wasGround = this.ground;
    this.ground = false;
    const vyPre = v.y;
    p.y += v.y * dt;
    for (const b of SOLID) {
      if (ov(p.x, p.y, p.z, this.h, b)) {
        if (v.y <= 0) {
          p.y = b.y1;
          this.ground = true;
        } else {
          p.y = b.y0 - this.h;
        }
        v.y = 0;
      }
    }
    for (const ax of ["x", "z"]) {
      const d = v[ax] * dt;
      if (!d) continue;
      p[ax] += d;
      for (const b of SOLID) {
        if (!ov(p.x, p.y, p.z, this.h, b)) continue;
        const rise = b.y1 - p.y;
        if (
          rise > 0 &&
          rise <= 0.46 &&
          !b.gate &&
          (this.ground || wasGround || (this.coyote > 0 && v.y <= 0)) &&
          freeAt(p.x, b.y1 + 0.001, p.z, this.h)
        ) {
          p.y = b.y1 + 0.001;
          continue;
        }
        if (d > 0) p[ax] = b[ax + "0"] - R - 1e-4;
        else p[ax] = b[ax + "1"] + R + 1e-4;
        /* running into something solid at speed (scripted pilots are checked against this) */
        if (Math.abs(v[ax]) > 2.5) ev("bump", { ax, speed: Math.abs(v[ax]), box: b });
        v[ax] = 0;
        if (this.chargeT > 0) this.chargeT = 0;
      }
    }
    if (pilotsFn) this.pushPilots(pilotsFn(this) || NO_PILOTS);
    if (this.ground) {
      this.stabT = 0;
      if (!wasGround) {
        ev("land", { vy: -vyPre });
      }
      if (this.pound === 2) {
        this.pound = 0;
        this.landLock = 0.35;
        v.set(0, 0, 0);
        ev("slam", { pos: p.clone() });
      }
      if (this.pound === 1) this.pound = 0;
    }
    if (p.y < -20) {
      p.set(0, 8, 0);
      v.set(0, 0, 0);
    }
  }
  /** step out of any other pilot we overlap (2R apart), and stop moving into them */
  pushPilots(list) {
    const p = this.pos,
      v = this.vel,
      min = 2 * R;
    for (const o of list) {
      if (!o || o === this || o.dead) continue;
      const op = o.pos;
      if (p.y + this.h <= op.y + 0.1 || op.y + (o.h || H_STAND) <= p.y + 0.1) continue;
      const dx = p.x - op.x,
        dz = p.z - op.z,
        d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2),
        nx = dx / d,
        nz = dz / d;
      if (d < 1e-4) {
        nx = Math.sin(this.yaw);
        nz = Math.cos(this.yaw);
        d = 0;
      }
      const push = min - d,
        x0 = p.x,
        z0 = p.z;
      p.x += nx * push;
      p.z += nz * push;
      if (!freeAt(p.x, p.y + 0.02, p.z, this.h - 0.04)) {
        p.x = x0;
        p.z = z0;
      }
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        v.x -= vn * nx;
        v.z -= vn * nz;
      }
    }
  }
  damage(n, now) {
    if (this.dead || now < this.spawnT + 1.2) return false;
    this.lastDmg = now;
    const s = Math.min(this.shield, n);
    this.shield -= s;
    n -= s;
    this.health -= n;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }
  regen(dt, now) {
    if (this.dead) return 0;
    if (this.sprint && this.shield < 70) {
      this.lastDmg = Math.max(this.lastDmg, now - 3.3);
      return 0;
    }
    let ev = 0;
    if (now - this.lastDmg > 4) {
      if (this.shield < 70) {
        if (this.shield <= 0) ev = 1;
        this.shield = Math.min(70, this.shield + 48 * dt);
      } else this.health = Math.min(45, this.health + 28 * dt);
    }
    return ev;
  }
}
