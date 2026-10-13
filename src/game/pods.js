/* ============ DROP PODS: spawns that fall from orbit ============
   With Spawns set to "Drop pods" (Gameplay settings), pilots come back in a pod that drops from
   POD_HEIGHT (200 m) in POD_TIME (data/modes.js): its nose glows white-hot and it trails a re-entry
   burn of flame, embers and smoke you can see from anywhere on the map, fires its retros just before
   impact, slams in with a shockwave and blows its doors off; the pilot steps out where it landed.
   A pod that lands on an enemy takes them out. Pods only use spawn points with open sky above them
   (otherwise the pilot appears in place, as before).
   dropPod(pos, color, { dur, h, onLand }) starts one; updPods runs them (from updFX). */
const PODS = [];
const podsOn = () => SET.spawnStyle !== "classic";
/* the pod's fixed parts are merged once into one geometry per material and shared by every pod
   (a pod draws in seven calls: hull, nose, frame, team bands and the three doors) */
const POD_GEO = {};
function podGeo() {
  if (POD_GEO.hull) return POD_GEO;
  const at = (g, x, y, z, ry = 0) => [g, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)];
  const nose = new THREE.ConeGeometry(0.62, 0.7, 14);
  nose.rotateX(Math.PI);
  POD_GEO.hull = mergeGeos([at(new THREE.CylinderGeometry(0.72, 0.62, 2.2, 14), 0, 1.45, 0)]);
  POD_GEO.nose = mergeGeos([at(nose, 0, 0, 0)]);
  const frame = [at(new THREE.CylinderGeometry(0.42, 0.74, 0.45, 14), 0, 2.75, 0)];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    frame.push(at(new THREE.BoxGeometry(0.08, 1.2, 0.5), Math.sin(a) * 0.72, 1.6, Math.cos(a) * 0.72, a));
  }
  POD_GEO.frame = mergeGeos(frame);
  const band = () => new THREE.CylinderGeometry(0.735, 0.735, 0.08, 14);
  POD_GEO.bands = mergeGeos([at(band(), 0, 2.2, 0), at(band(), 0, 0.7, 0)]);
  POD_GEO.door = new THREE.BoxGeometry(0.62, 1.7, 0.08);
  return POD_GEO;
}
const POD_MAT = {
  hull: new THREE.MeshStandardMaterial({ color: "#3a4349", roughness: 0.45, metalness: 0.75 }),
  dark: new THREE.MeshStandardMaterial({ color: "#1d2226", roughness: 0.6, metalness: 0.5 }),
  burn: new THREE.MeshStandardMaterial({
    color: "#2a1e18",
    roughness: 0.9,
    emissive: "#ff5a1a",
    emissiveIntensity: 0,
  }),
};
const podFireMat = new THREE.SpriteMaterial({
  color: 0xff9a40,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
/** is there open sky above this point (a pod can come straight down)? */
function skyClear(p) {
  return rayWorld(new V3(p.x, p.y + 2.2, p.z), new V3(0, 1, 0), 60) >= 59;
}
function makePod(color) {
  const G0 = podGeo();
  const g = new THREE.Group();
  const team = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  add(G0.hull, POD_MAT.hull, 0, 0, 0);
  /* each pod's nose heats and cools on its own */
  const burn = POD_MAT.burn.clone();
  add(G0.nose, burn, 0, 0, 0);
  add(G0.frame, POD_MAT.dark, 0, 0, 0);
  add(G0.bands, team, 0, 0, 0);
  /* three doors that blow off on landing */
  const doors = [0, 1, 2].map(i => {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const d = add(G0.door, POD_MAT.hull, Math.sin(a) * 0.7, 1.4, Math.cos(a) * 0.7);
    d.rotation.y = a;
    return { m: d, a, v: new V3(), spin: 0 };
  });
  const fire = new THREE.Sprite(podFireMat.clone());
  fire.position.y = 3.1;
  fire.scale.set(1.6, 2.6, 1);
  g.add(fire);
  const retro = new THREE.Sprite(podFireMat.clone());
  retro.position.y = -0.4;
  retro.scale.set(1.2, 1.6, 1);
  retro.material.opacity = 0;
  g.add(retro);
  scene.add(g);
  return { g, doors, fire, retro, team, burn };
}
/**
 * start a drop pod falling onto `pos`. onLand() runs on impact (place the pilot then).
 * h: the height it falls from (the trailer uses a short drop for its close shots)
 * @param {any} pos
 * @param {string} color team or pilot color
 * steer: { r, ok(x, z) } lets the rider nudge the landing point within r metres of where it was
 *   aimed, onto open ground that ok() accepts (CTF keeps you near your base); see steerPod
 * @param {{ dur?: number, h?: number, onLand?: Function, quiet?: boolean, steer?: { r: number, ok?: (x: number, z: number) => boolean } }} [o]
 */
function dropPod(pos, color, o = {}) {
  const h = o.h || POD_HEIGHT;
  const p = Object.assign(makePod(color), {
    at: pos.clone(),
    t: 0,
    dur: o.dur || POD_TIME,
    h,
    landed: false,
    life: 0,
    onLand: o.onLand || null,
    prev: new V3(pos.x, pos.y + h, pos.z),
    fog: null,
    /* steering: where it was aimed, and where it is drawn (eases toward at) */
    base: pos.clone(),
    vis: pos.clone(),
    steer: o.steer || null,
    skip: false,
  });
  p.g.position.copy(p.prev);
  p.g.rotation.y = Math.random() * 6;
  if (!o.quiet) sfx(p.dur < 2 ? "podq" : "pod", distVol(pos, 140));
  PODS.push(p);
  return p;
}
const _podV = new V3(),
  _podW = new V3();
/* the re-entry burn: red, orange and ember-yellow flame shed from the nose */
const BURN_COLS = [0xff3a14, 0xff6a1c, 0xff9a30, 0xffc45a];
/** the re-entry trail between where the pod was last frame and where it is now (heat: 0..1) */
function podTrail(p, heat) {
  const a = p.prev,
    b = p.g.position;
  const n = Math.min(10, pc(Math.ceil(a.distanceTo(b) / 1.6)));
  for (let i = 0; i < n; i++) {
    _podV.lerpVectors(a, b, (i + Math.random()) / n);
    _podV.y -= 0.2;
    /* the plasma sheath: big, bright and short-lived; it hangs where the pod passed */
    ptAdd(
      PTS.glow,
      _podV,
      new V3(rnd(-1, 1), rnd(2, 6), rnd(-1, 1)),
      rnd(2.6, 4.4) * (0.5 + heat * 0.6),
      BURN_COLS[(Math.random() * BURN_COLS.length) | 0],
      0.9 * heat,
      rnd(0.6, 1.4),
      { max: 1.4, grow: -0.5, drag: 2 }
    );
    /* smoke: a dark column that lingers and spreads */
    if (Math.random() < 0.7)
      ptAdd(
        PTS.soft,
        _podW.copy(_podV).add(_fx.set(rnd(-0.4, 0.4), 1.5, rnd(-0.4, 0.4))),
        new V3(rnd(-0.6, 0.6), rnd(0.5, 1.5), rnd(-0.6, 0.6)),
        rnd(3, 4.8),
        Math.random() < 0.5 ? 0x4a423c : 0x5c534b,
        0.55 * heat,
        rnd(2.5, 4),
        { max: 4, grow: 0.5, drag: 0.6 }
      );
    /* embers flung off the sheath */
    if (Math.random() < 0.5)
      ptAdd(
        PTS.glow,
        _podV,
        new V3(rnd(-6, 6), rnd(-2, 8), rnd(-6, 6)),
        rnd(0.18, 0.35),
        Math.random() < 0.5 ? 0xffb347 : 0xff5a1a,
        1,
        rnd(0.8, 1.6),
        { max: 1.6, g: 9, drag: 0.8 }
      );
  }
}
/* ---- steering your own pod: the landing point moves with your input, never past the pod's
   radius, never onto ground without open sky above it, and only where the mode allows; it locks
   for the last moments so everyone can see where it will hit ---- */
const POD_STEER_SPEED = 9,
  POD_STEER_LOCK = 0.82;
const _stC = new V3();
/** is steering still open for this pod? */
const podSteerable = p => !!p.steer && !p.landed && p.t / p.dur < POD_STEER_LOCK;
/** move the landing point by (dx, dz) world metres per second; returns true if it moved */
function steerPod(p, dx, dz, dt) {
  if (!podSteerable(p) || (!dx && !dz)) return false;
  const s = p.steer;
  _stC.set(p.at.x + dx * POD_STEER_SPEED * dt, 0, p.at.z + dz * POD_STEER_SPEED * dt);
  /* stay within the radius around where it was aimed */
  const ox = _stC.x - p.base.x,
    oz = _stC.z - p.base.z,
    L = Math.hypot(ox, oz);
  if (L > s.r) {
    _stC.x = p.base.x + (ox / L) * s.r;
    _stC.z = p.base.z + (oz / L) * s.r;
  }
  if (s.ok && !s.ok(_stC.x, _stC.z)) return false;
  /* the ground there, and open sky above it */
  _stC.y = groundBelow(_stC.x, _stC.z, p.base.y + 8, 0.6) + 0.02;
  if (_stC.y < -10 || !skyClear(_stC) || !freeAt(_stC.x, _stC.y + 0.05, _stC.z, H_STAND)) return false;
  p.at.copy(_stC);
  return true;
}
/* the landing marker under your own pod while you can steer it */
const POD_MARK = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1.25, 40),
  new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false })
);
POD_MARK.rotation.x = -Math.PI / 2;
POD_MARK.visible = false;
scene.add(POD_MARK);
function podMarker(p) {
  POD_MARK.visible = !!p && !p.landed;
  if (!POD_MARK.visible) return;
  POD_MARK.position.set(p.vis.x, p.at.y + 0.06, p.vis.z);
  POD_MARK.material.color.setHex(podSteerable(p) ? 0xffb347 : 0xff5a3a);
  POD_MARK.scale.setScalar(1 + Math.sin(now * 8) * 0.06);
}
/* riding your pod down: the fog and far plane lift with your height so the ground stays in view */
function podView(p) {
  if (!p.fog) p.fog = { near: scene.fog.near, far: scene.fog.far, cam: camera.far };
  const up = Math.max(0, p.g.position.y - p.at.y);
  scene.fog.near = p.fog.near + up;
  scene.fog.far = p.fog.far + up;
  camera.far = p.fog.cam + up;
  camera.updateProjectionMatrix();
}
function podViewEnd(p) {
  if (!p || !p.fog) return;
  scene.fog.near = p.fog.near;
  scene.fog.far = p.fog.far;
  camera.far = p.fog.cam;
  camera.updateProjectionMatrix();
  p.fog = null;
}
function updPods(dt) {
  for (let i = PODS.length - 1; i >= 0; i--) {
    const p = PODS[i];
    if (!p.landed) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      /* falls fast and accelerates; retros flare in the last moments */
      const h = p.h * (1 - k * k * (0.35 + 0.65 * k));
      p.prev.copy(p.g.position);
      p.vis.lerp(p.at, Math.min(1, dt * 8));
      p.g.position.set(p.vis.x, p.at.y + h, p.vis.z);
      p.g.rotation.y += dt * 2.5;
      p.fire.material.opacity = 0.6 + Math.random() * 0.4;
      p.retro.material.opacity = k > 0.8 ? (k - 0.8) * 5 * (0.7 + Math.random() * 0.3) : 0;
      /* the nose runs white-hot through the burn and dims as the retros take over */
      const heat = k < 0.8 ? 1 : Math.max(0.25, 1 - (k - 0.8) * 3.5);
      p.burn.emissiveIntensity = 1.4 + heat * 2.6;
      podTrail(p, heat);
      /* the fireball at the head of the trail */
      ptAdd(PTS.glow, p.g.position, new V3(), 7 * heat, 0xffc070, 1, 0.05);
      ptAdd(PTS.glow, p.g.position, new V3(), 3 * heat, 0xfff0d0, 1, 0.05);
      /* the burn lights the ground as it comes in, and the air shimmers around it */
      if (h < 70) {
        dynLight(p.g.position, 0xff9a50, 5 * heat * (1 - h / 70), 0.05, 26);
        heatAt(p.g.position, 2.2 * heat, 1.2);
      }
      if (k >= 1) {
        p.landed = true;
        p.vis.copy(p.at);
        p.g.position.copy(p.at);
        p.fire.visible = false;
        p.retro.visible = false;
        shock(p.at);
        blast(_podV.copy(p.at).setY(p.at.y + 0.4), 0xffb070, 3.5);
        dust(p.at, 34, 4.5, 1.6, 0.9);
        sfx("podland", distVol(p.at, 60));
        const near = distVol(p.at, 30);
        if (near > 0) {
          shakeT = Math.max(shakeT, near * 0.5);
          rumble(near, near * 0.8, 260);
        }
        for (const d of p.doors) {
          d.v.set(Math.sin(d.a) * 5 + rnd(-1, 1), 3 + rnd(0, 2), Math.cos(d.a) * 5 + rnd(-1, 1));
          d.spin = rnd(-6, 6);
        }
        podViewEnd(p);
        if (p.onLand) p.onLand(p.at);
      }
      continue;
    }
    /* landed: the doors tumble away, the hot nose cools and smokes, then the pod sinks out of sight */
    p.life += dt;
    for (const d of p.doors) {
      if (d.m.position.y < 0.05 && p.life > 0.2) continue;
      d.v.y -= 16 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.spin * dt;
      if (d.m.position.y < 0.05) {
        d.m.position.y = 0.05;
        d.v.set(0, 0, 0);
      }
    }
    p.team.emissiveIntensity = Math.max(0.3, 1.6 - p.life * 0.4);
    p.burn.emissiveIntensity = Math.max(0, 2 - p.life * 0.5);
    if (p.life < 3 && Math.random() < dt * 6)
      ptAdd(
        PTS.soft,
        _podV.copy(p.at).add(_fx.set(rnd(-0.5, 0.5), 0.4, rnd(-0.5, 0.5))),
        new V3(rnd(-0.3, 0.3), rnd(0.8, 1.6), rnd(-0.3, 0.3)),
        rnd(0.8, 1.4),
        0x5c534b,
        0.35,
        2.5,
        { grow: 0.6, drag: 0.5 }
      );
    if (p.life > 6) p.g.position.y = p.at.y - (p.life - 6) * 1.2;
    if (p.life > 8.5) {
      disposePod(p);
      PODS.splice(i, 1);
    }
  }
}
/* the geometry is shared; the per-pod materials are not */
function disposePod(p) {
  scene.remove(p.g);
  p.team.dispose();
  p.burn.dispose();
  p.fire.material.dispose();
  p.retro.material.dispose();
}
function clearPods() {
  for (const p of PODS) {
    podViewEnd(p);
    disposePod(p);
  }
  PODS.length = 0;
}
