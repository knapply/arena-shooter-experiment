/* ============ rockets: the rocket launcher's projectiles ============
   A rocket flies straight at the weapon's speed, trailing smoke, and bursts on the first wall, floor
   or pilot it reaches (or after 4 s). The blast damages everyone in range by distance (a direct hit
   always kills) and breaks cover. Owners decide who takes damage (`onExplode`, like grenades);
   rockets without an owner are another player's, drawn here for show. */
const ROCKET_STATS = () => {
  const w = WEAPON_DATA.find(x => x.key === "rocket");
  return { speed: w.speed, r: w.radius, dmg: w.splash };
};
const _rk1 = new V3(),
  _rk2 = new V3();
const rocketGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.42, 10);
rocketGeo.rotateX(Math.PI / 2);
const rocketMat = new THREE.MeshStandardMaterial({ color: "#3a4248", roughness: 0.4, metalness: 0.7 });
const rocketFlame = new THREE.SpriteMaterial({
  color: 0xffb060,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
/** splash damage at distance d from a rocket's blast centre */
function rocketDmg(d) {
  const R = ROCKET_STATS();
  return d >= R.r ? 0 : R.dmg * Math.pow(1 - d / R.r, 0.7);
}
class RocketWorld {
  constructor(render) {
    this.list = [];
    this.render = render;
  }
  /**
   * @param {any} o origin
   * @param {any} d direction (normalized)
   * @param {any} owner { team?, targets(): [{ref,pos,h}], onExplode(pos, direct) } or null for visuals only
   */
  fire(o, d, owner, speed) {
    if (this.list.length > 16) return null;
    const r = {
      pos: o.clone(),
      vel: d.clone().multiplyScalar(speed || ROCKET_STATS().speed),
      t: 4,
      owner,
      mesh: null,
      glow: null,
      smoke: 0,
    };
    if (this.render) {
      r.mesh = fxGet("rk", () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(rocketGeo, rocketMat);
        body.castShadow = true;
        g.add(body);
        const f = new THREE.Sprite(rocketFlame.clone());
        f.position.z = 0.32;
        f.scale.setScalar(0.5);
        g.add(f);
        g.userData.flame = f;
        return g;
      });
      r.mesh.position.copy(r.pos);
      r.mesh.lookAt(_rk1.copy(r.pos).sub(r.vel));
      sfx("rocket", distVol(r.pos, 60));
    }
    this.list.push(r);
    return r;
  }
  step(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const r = L[i];
      r.t -= dt;
      const step = r.vel.length() * dt;
      _rk1.copy(r.vel).normalize();
      const wh = rayWorldHit(r.pos, _rk1, step + 0.1);
      let hit = wh.t < step + 0.1 ? wh.t : -1,
        direct = null;
      if (r.owner && r.owner.targets)
        for (const t of r.owner.targets()) {
          const h = rayTarget(r.pos, _rk1, t.pos, t.h, hit >= 0 ? hit : step + 0.15);
          if (h && (hit < 0 || h.t < hit)) {
            hit = h.t;
            direct = t.ref;
          }
        }
      if (hit >= 0 || r.t <= 0) {
        if (hit >= 0) r.pos.addScaledVector(_rk1, Math.max(0, hit - 0.05));
        this.explode(r, direct, wh.b && !direct ? wh.b : null);
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      r.pos.addScaledVector(r.vel, dt);
      if (r.mesh) {
        r.mesh.position.copy(r.pos);
        r.mesh.lookAt(_rk2.copy(r.pos).sub(r.vel));
        r.mesh.userData.flame.scale.setScalar(0.42 + Math.random() * 0.2);
        r.smoke -= dt;
        if (r.smoke <= 0) {
          r.smoke = 0.03;
          dust(_rk2.copy(r.pos).addScaledVector(_rk1, -0.35), 1, 0.15, 0.2, 0.28);
        }
      }
    }
  }
  explode(r, direct, box) {
    const R = ROCKET_STATS();
    if (this.render) {
      blast(r.pos, 0xffa040, R.r * 1.25);
      shock(r.pos);
      dust(r.pos, 24, 4, 1.6, 0.8);
      sfx("boom", distVol(r.pos, 80));
      const dv = distVol(r.pos, 24);
      if (dv > 0) rumble(dv, dv * 0.9, 300);
      if (r.mesh) fxPut("rk", r.mesh);
    }
    if (box) damageBox(box, 900, r.pos, "blast", this.render);
    damageRadius(r.pos, R.r * 1.1, R.dmg * 4, this.render);
    if (r.owner && r.owner.onExplode) r.owner.onExplode(r.pos, direct);
  }
  clear() {
    for (const r of this.list) if (r.mesh) fxPut("rk", r.mesh);
    this.list.length = 0;
  }
}
const MAIN_ROCKETS = new RocketWorld(true);
/* your rockets: the same targets your bullets can hit, and you can hurt yourself */
const playerRocketOwner = {
  targets() {
    return targets();
  },
  onExplode(c, direct) {
    for (const t of targets()) {
      const ch = _rk2.copy(t.pos);
      ch.y += t.h * 0.5;
      const d = ch.distanceTo(c);
      const dmg = t.ref === direct ? 999 : losClear(c, ch) ? rocketDmg(d) : 0;
      if (dmg > 1) dealDamage(t, Math.round(dmg), "rocket", false);
    }
    if (playing && !me.dead) {
      const ch = _rk2.copy(me.pos);
      ch.y += me.h * 0.5;
      const d = ch.distanceTo(c);
      if (d < ROCKET_STATS().r && losClear(c, ch)) {
        const n = Math.round(rocketDmg(d) * 0.85);
        if (n > 1) hurtMe(n, { name: myName, w: "self" });
      }
    }
  },
};
function fireRocket(o, d, muzzle) {
  const start = muzzle ? muzzle.clone() : o.clone().addScaledVector(d, 0.6);
  /* fly from the muzzle toward where the reticle points */
  const far = rayWorld(o, d, 200);
  const aim = o.clone().addScaledVector(d, Math.min(far, 200));
  const dir = aim.sub(start).normalize();
  MAIN_ROCKETS.fire(start, dir, playerRocketOwner);
  emitFx("nade", v3a(start), v3a(dir.multiplyScalar(ROCKET_STATS().speed)), 2);
}
/** someone else's grenade or rocket, seen over the network (g: 0 frag, 1 plasma, 2 rocket) */
function remoteProjectile(g, p, v) {
  if (!p || !v) return;
  const L = v.length();
  if (g === 2) {
    if (L > 1 && L < 70) MAIN_ROCKETS.fire(p, v.clone().multiplyScalar(1 / L), null, L);
  } else if (L < 45) MAIN_NADES.throw(g === 1 ? "plasma" : "frag", p, v, null);
}
