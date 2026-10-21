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
  /* slowing down with no input or less of it (0: the same as accel) */
  decel: 0,
  airAccel: 18,
  thrust: 17,
  thrustCD: 2.2,
  slideBoost: 3.2,
  slideCap: 15,
  /* the share of a slide's speed kept after a second of sliding */
  slideKeep: 0.32,
  /* how long a thrust's burst lasts */
  thrustT: 0.24,
  /* speed while aiming a low-zoom optic, and a sniper scope (a share of run speed) */
  adsMove: 0.9,
  scopeMove: 0.72,
  /* seconds to bring the gun up after a sprint ends before it can fire */
  raise: 0,
  /* seconds of hover from aiming in the air (stabilize) */
  stab: 1.3,
  /* hovering nearly pins you: the most you can drift while stabilized (m/s), and how hard steering bites
     there (a share of air control) */
  stabDrift: 0.5,
  stabSteer: 0.3,
  /* seconds a sprint takes to build from run speed to full sprint speed (0 = at once) */
  sprintRamp: 0,
  /* how long a slide lasts, and how long a clamber takes (a multiple of its base time) */
  slideT: 0.8,
  clamberK: 1,
  /* seconds without damage before shields (then health) recharge: 3, down from 4 by simulation in every
     mode (docs/TUNING.md, "Every mode, every rule"); then shield and health points restored a second */
  regenDelay: 3,
  /* 1: sprint, thrust, hover and ground pound all restart the recharge delay (Body.regen) */
  exertHold: 1,
  shieldRate: 48,
  healthRate: 28,
  /* seconds to charge a ground pound, and the reach of its blast in metres (it kills at the centre and
     fades to a light hit at the edge) */
  poundCharge: 0.55,
  poundR: 5,
  /* seconds after the trigger breaks a held sprint before it picks up again (0: a fresh press) */
  sprintResume: 0.3,
  /* 1: a body walking or running down stairs (or off a kerb) sets down on the step below (0: it sails
     off every edge) */
  stepDown: 1,
};
const TUNE = Object.assign({}, TUNE_DEF);
/* pilots are solid to each other: modes say who else is in the world (anything with pos, h and dead) */
const NO_PILOTS = [];
let pilotsFn = null;
/** @param {((self: any) => any[]) | null} fn */
function setPilotCollider(fn) {
  pilotsFn = fn;
}
/* the broad phase: an XZ grid of SOLID's indices, so a query looks at the boxes near a point instead of
   all of them. A query returns the candidates in SOLID's own order (the scans below resolve contacts in
   that order), so every result is exactly what a scan of the whole array gives. The grid rebuilds itself
   when SOLID is replaced or changes length; code that swaps boxes in place calls solidChanged(). Boxes
   only ever move vertically after they are added (blast gates), and the grid is XZ only. */
const GRID_CELL = 4;
const GRID = {
  n: -1,
  ver: -1,
  first: null,
  last: null,
  x0: 0,
  z0: 0,
  nx: 0,
  nz: 0,
  cells: [],
  seen: new Uint32Array(0),
  mark: 0,
};
let solidVer = 0;
function solidChanged() {
  solidVer++;
}
function gridFresh() {
  const n = SOLID.length;
  if (GRID.n === n && GRID.ver === solidVer && GRID.first === SOLID[0] && GRID.last === SOLID[n - 1]) return;
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const b of SOLID) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.z0 < z0) z0 = b.z0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.z1 > z1) z1 = b.z1;
  }
  if (!n) x0 = z0 = x1 = z1 = 0;
  GRID.x0 = x0;
  GRID.z0 = z0;
  GRID.nx = Math.max(1, Math.ceil((x1 - x0) / GRID_CELL) + 1);
  GRID.nz = Math.max(1, Math.ceil((z1 - z0) / GRID_CELL) + 1);
  const cells = (GRID.cells = []);
  for (let i = 0; i < GRID.nx * GRID.nz; i++) cells.push([]);
  /* each box goes in every cell its footprint touches (a hair wider, for the 1e-4 overlap margins) */
  for (let i = 0; i < n; i++) {
    const b = SOLID[i];
    const cx0 = gridCol(b.x0 - 0.01, GRID.x0, GRID.nx),
      cx1 = gridCol(b.x1 + 0.01, GRID.x0, GRID.nx),
      cz0 = gridCol(b.z0 - 0.01, GRID.z0, GRID.nz),
      cz1 = gridCol(b.z1 + 0.01, GRID.z0, GRID.nz);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) cells[cz * GRID.nx + cx].push(i);
  }
  GRID.seen = new Uint32Array(n);
  GRID.mark = 0;
  GRID.n = n;
  GRID.ver = solidVer;
  GRID.first = SOLID[0];
  GRID.last = SOLID[n - 1];
}
function gridCol(v, o, nc) {
  const c = Math.floor((v - o) / GRID_CELL);
  return c >= 0 ? (c < nc ? c : nc - 1) : 0;
}
/** a fresh stamp for GRID.seen (each query marks the boxes it has already looked at) */
function gridMark() {
  if (++GRID.mark === 0xffffffff) {
    GRID.seen.fill(0);
    GRID.mark = 1;
  }
  return GRID.mark;
}
/** fill out (an array reused by the caller) with the indices of the boxes whose footprint may touch the
    XZ rectangle [x0, x1] x [z0, z1], in SOLID order; returns how many */
function solidNear(x0, z0, x1, z1, out) {
  gridFresh();
  if (!GRID.n) return 0;
  const cx0 = gridCol(x0, GRID.x0, GRID.nx),
    cx1 = gridCol(x1, GRID.x0, GRID.nx),
    cz0 = gridCol(z0, GRID.z0, GRID.nz),
    cz1 = gridCol(z1, GRID.z0, GRID.nz);
  const seen = GRID.seen,
    mark = gridMark();
  let k = 0;
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const cell = GRID.cells[cz * GRID.nx + cx];
      for (let j = 0; j < cell.length; j++) {
        const i = cell[j];
        if (seen[i] === mark) continue;
        seen[i] = mark;
        /* insertion sort: the lists are short */
        let at = k++;
        while (at > 0 && out[at - 1] > i) {
          out[at] = out[at - 1];
          at--;
        }
        out[at] = i;
      }
    }
  return k;
}
/* one result list per kind of query, so a query made while another's results are being walked (freeAt
   inside the movement passes) never overwrites them */
const NEAR_MOVE = [],
  NEAR_FREE = [],
  NEAR_GROUND = [],
  NEAR_CLIMB = [];
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
  const n = solidNear(x - R, z - R, x + R, z + R, NEAR_FREE);
  for (let k = 0; k < n; k++) if (ov(x, y, z, h, SOLID[NEAR_FREE[k]])) return false;
  return true;
}
function groundBelow(x, z, y, r = R) {
  let g = -50;
  const n = solidNear(x - r, z - r, x + r, z + r, NEAR_GROUND);
  for (let k = 0; k < n; k++) {
    const b = SOLID[NEAR_GROUND[k]];
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
  gridFresh();
  /* the nearest hit over all boxes does not depend on the order they are tried in, so walk the grid
     cells the ray crosses (nearest first) and stop once a cell starts beyond the nearest hit. Anything
     unusual (no grid, NaN, an infinite length) takes the full scan */
  if (
    !GRID.n ||
    !Number.isFinite(maxT) ||
    !(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z)) ||
    !(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z))
  ) {
    for (const b of SOLID) {
      const t = rayBox(o, d, b, best);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
  const C = GRID_CELL,
    gx0 = GRID.x0,
    gz0 = GRID.z0,
    gx1 = gx0 + GRID.nx * C,
    gz1 = gz0 + GRID.nz * C;
  /* the part of the ray over the grid */
  let ta = 0,
    tb = maxT;
  if (d.x === 0) {
    if (o.x < gx0 || o.x > gx1) return best;
  } else {
    const t1 = (gx0 - o.x) / d.x,
      t2 = (gx1 - o.x) / d.x;
    ta = Math.max(ta, Math.min(t1, t2));
    tb = Math.min(tb, Math.max(t1, t2));
  }
  if (d.z === 0) {
    if (o.z < gz0 || o.z > gz1) return best;
  } else {
    const t1 = (gz0 - o.z) / d.z,
      t2 = (gz1 - o.z) / d.z;
    ta = Math.max(ta, Math.min(t1, t2));
    tb = Math.min(tb, Math.max(t1, t2));
  }
  if (ta > tb) return best;
  let cx = gridCol(o.x + d.x * ta, gx0, GRID.nx),
    cz = gridCol(o.z + d.z * ta, gz0, GRID.nz);
  const sx = d.x > 0 ? 1 : d.x < 0 ? -1 : 0,
    sz = d.z > 0 ? 1 : d.z < 0 ? -1 : 0;
  let tx = sx > 0 ? (gx0 + (cx + 1) * C - o.x) / d.x : sx < 0 ? (gx0 + cx * C - o.x) / d.x : Infinity,
    tz = sz > 0 ? (gz0 + (cz + 1) * C - o.z) / d.z : sz < 0 ? (gz0 + cz * C - o.z) / d.z : Infinity;
  const dtx = sx ? C / Math.abs(d.x) : Infinity,
    dtz = sz ? C / Math.abs(d.z) : Infinity;
  const seen = GRID.seen,
    mark = gridMark();
  for (;;) {
    const cell = GRID.cells[cz * GRID.nx + cx];
    for (let j = 0; j < cell.length; j++) {
      const i = cell[j];
      if (seen[i] === mark) continue;
      seen[i] = mark;
      const t = rayBox(o, d, SOLID[i], best);
      if (t >= 0 && t < best) best = t;
    }
    const next = tx < tz ? tx : tz;
    if (next > best || next > tb) return best;
    if (tx < tz) {
      cx += sx;
      tx += dtx;
      if (cx < 0 || cx >= GRID.nx) return best;
    } else {
      cz += sz;
      tz += dtz;
      if (cz < 0 || cz >= GRID.nz) return best;
    }
  }
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
    this.raiseT = 0;
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
    /* when the suit's thrusters last worked (sprint, thrust, hover, ground pound): they hold the recharge */
    this.lastExert = -99;
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
    this.raiseT = Math.max(0, this.raiseT - dt);
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
      if (this.sprint) this.raiseT = TUNE.raise;
      this.sprint = false;
      this.sprintT = 0;
    }
    if (this.thrustBuf > 0 && this.thrustCD <= 0 && this.pound === 0 && this.landLock <= 0) {
      this.thrustBuf = 0;
      const dir = wish.lengthSq() > 0.01 ? wish.clone().normalize() : f.clone();
      v.x = dir.x * TUNE.thrust;
      v.z = dir.z * TUNE.thrust;
      if (!this.ground) v.y = Math.max(v.y, 0);
      this.thrustT = TUNE.thrustT;
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
      this.slideT = TUNE.slideT;
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
      v.multiplyScalar(Math.pow(0.003, dt));
      v.y = Math.max(v.y, -1);
      if (!inp.crouch) {
        if (this.poundT >= TUNE.poundCharge) {
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
    if (
      inp.aim &&
      !this.ground &&
      this.pound === 0 &&
      this.stabT < TUNE.stab &&
      this.thrustT <= 0 &&
      v.y < 2
    ) {
      this.stabbing = true;
      this.stabT += dt;
      v.y *= Math.pow(0.001, dt);
      /* the momentum you came in with bleeds off fast: a sprint into a hover is down to a walk within a third of a second */
      v.x *= Math.pow(0.003, dt);
      v.z *= Math.pow(0.003, dt);
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
      const k = Math.pow(TUNE.slideKeep, dt);
      v.x *= k;
      v.z *= k;
      v.x += wish.x * 6 * dt;
      v.z += wish.z * 6 * dt;
      if (!inp.crouch && this.slideT < TUNE.slideT - 0.25) this.slideT = 0;
    } else if (this.pound === 0) {
      /* aiming slows you a little with low-zoom optics and more with a sniper scope (inp.scoped) */
      const speed =
        (this.crouch
          ? TUNE.crouchSpeed
          : this.sprint
            ? TUNE.sprint -
              (TUNE.sprint - TUNE.run) * Math.max(0, 1 - this.sprintT / Math.max(TUNE.sprintRamp, 1e-3))
            : inp.aim
              ? TUNE.run * (inp.scoped ? TUNE.scopeMove : TUNE.adsMove)
              : TUNE.run) * (this.speedMul || 1);
      const tx = wish.x * speed,
        tz = wish.z * speed;
      if (this.ground) {
        const hs = Math.hypot(v.x, v.z);
        if (hs > speed + 0.5) {
          const k = Math.pow(0.003, dt);
          v.x = tx + (v.x - tx) * k;
          v.z = tz + (v.z - tz) * k;
        } else {
          /* strafing as a skill: reversing direction bites harder (95) than speeding up (80), so a
             well-timed change of direction is quick enough to make someone miss, but not instant */
          const rev = tx * v.x + tz * v.z < 0,
            slow = !rev && tx * tx + tz * tz < hs * hs - 0.01;
          const a = (rev ? TUNE.reverse : slow && TUNE.decel > 0 ? TUNE.decel : TUNE.accel) * dt;
          v.x += clamp(tx - v.x, -a, a);
          v.z += clamp(tz - v.z, -a, a);
        }
      } else {
        let a = TUNE.airAccel * dt,
          ux = tx,
          uz = tz;
        if (this.stabbing) {
          a *= TUNE.stabSteer;
          const k = Math.min(1, TUNE.stabDrift / (Math.hypot(tx, tz) || 1));
          ux *= k;
          uz *= k;
        }
        const nx = v.x + clamp(ux - v.x, -a, a),
          nz = v.z + clamp(uz - v.z, -a, a);
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
        const nc = solidNear(ax - R, az - R, ax + R, az + R, NEAR_CLIMB);
        for (let k = 0; k < nc; k++) {
          const b = SOLID[NEAR_CLIMB[k]];
          if (!(ax + R > b.x0 && ax - R < b.x1 && az + R > b.z0 && az - R < b.z1)) continue;
          const dy = b.y1 - p.y;
          if (dy > 0.3 && dy < (this.tuck ? 2.95 : 2.5)) {
            const to = new V3(p.x + dx * 0.95, b.y1 + 0.01, p.z + dz * 0.95);
            if (freeAt(to.x, to.y, to.z, H_STAND) && freeAt(p.x, b.y1 + 0.01, p.z, 0.4)) {
              this.clamber = { from: p.clone(), to, t: 0, dur: (0.2 + dy * 0.03) * TUNE.clamberK };
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
    const ny = solidNear(p.x - R, p.z - R, p.x + R, p.z + R, NEAR_MOVE);
    for (let k = 0; k < ny; k++) {
      const b = SOLID[NEAR_MOVE[k]];
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
      /* the box can push p back toward where it was, never past it: look over both */
      let lo = ax === "x" ? Math.min(p.x, p.x - d) : p.x,
        hi = ax === "x" ? Math.max(p.x, p.x - d) : p.x,
        zlo = ax === "z" ? Math.min(p.z, p.z - d) : p.z,
        zhi = ax === "z" ? Math.max(p.z, p.z - d) : p.z;
      let nm = solidNear(lo - R, zlo - R, hi + R, zhi + R, NEAR_MOVE);
      for (let k = 0; k < nm; k++) {
        const i = NEAR_MOVE[k],
          b = SOLID[i];
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
        /* a body that started inside a box can be pushed back past where it was, out of the area looked
           over: from here on, every later box (as a scan of the whole world would) */
        if (p.x < lo || p.x > hi || p.z < zlo || p.z > zhi) {
          nm = k + 1;
          for (let j = i + 1; j < SOLID.length; j++) NEAR_MOVE[nm++] = j;
          lo = zlo = -Infinity;
          hi = zhi = Infinity;
        }
      }
    }
    /* walking or running down stairs (or off a kerb) keeps the feet on the ground: a body that was
       standing, did not jump, thrust, slide, sprint or charge, and finds a step within a stair's height
       below sets down on it at once (no landing: it never left), instead of sailing over the flight and
       landing every third step. Anything faster than a run still launches off the edge */
    if (
      TUNE.stepDown &&
      !this.ground &&
      wasGround &&
      v.y <= 0 &&
      !this.launched &&
      !this.sprint &&
      this.thrustT <= 0 &&
      this.slideT <= 0 &&
      this.chargeT <= 0 &&
      this.pound === 0 &&
      v.x * v.x + v.z * v.z <= TUNE.run * TUNE.run * 1.1
    ) {
      const g = groundBelow(p.x, p.z, p.y);
      if (p.y - g <= 0.46 && freeAt(p.x, g + 0.001, p.z, this.h)) {
        p.y = g;
        v.y = 0;
        this.ground = true;
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
    /* the suit's thrusters hold the recharge: sprinting, a thrust, hovering or a ground pound restart the
       delay, so shields come back only after regenDelay with neither damage nor any of those
       (TUNE.exertHold 0: the old rule, where only sprinting held it, and 0.7 s at most) */
    if (TUNE.exertHold) {
      if (this.sprint || this.thrustT > 0 || this.stabbing || this.pound > 0) this.lastExert = now;
    } else if (this.sprint && this.shield < 70) {
      this.lastDmg = Math.max(this.lastDmg, now - (TUNE.regenDelay - 0.7));
      return 0;
    }
    let ev = 0;
    if (now - Math.max(this.lastDmg, this.lastExert) > TUNE.regenDelay) {
      if (this.shield < 70) {
        if (this.shield <= 0) ev = 1;
        this.shield = Math.min(70, this.shield + TUNE.shieldRate * dt);
      } else this.health = Math.min(45, this.health + TUNE.healthRate * dt);
    }
    return ev;
  }
}
