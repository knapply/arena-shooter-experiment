/* ============ DROP PODS: spawns that fall from orbit ============
   With Spawns set to "Drop pods" (Gameplay settings), pilots come back in a pod that streaks down
   from the sky, fires its retros just before impact, slams in with a shockwave and blows its doors
   off; the pilot steps out where it landed. A pod that lands on an enemy takes them out. Pods only
   use spawn points with open sky above them (otherwise the pilot appears in place, as before).
   dropPod(pos, color, { dur, onLand }) starts one; updPods runs them (from updFX). */
const PODS = [];
const POD_TIME = 1.35;
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
  add(G0.nose, POD_MAT.burn, 0, 0, 0);
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
  return { g, doors, fire, retro, team };
}
/**
 * start a drop pod falling onto `pos`. onLand() runs on impact (place the pilot then).
 * @param {any} pos
 * @param {string} color team or pilot color
 * @param {{ dur?: number, onLand?: Function, quiet?: boolean }} [o]
 */
function dropPod(pos, color, o = {}) {
  const p = Object.assign(makePod(color), {
    at: pos.clone(),
    t: 0,
    dur: o.dur || POD_TIME,
    landed: false,
    life: 0,
    onLand: o.onLand || null,
  });
  p.g.position.set(pos.x, pos.y + 70, pos.z);
  p.g.rotation.y = Math.random() * 6;
  if (!o.quiet) sfx("pod", distVol(pos, 70));
  PODS.push(p);
  return p;
}
const _podV = new V3();
function updPods(dt) {
  for (let i = PODS.length - 1; i >= 0; i--) {
    const p = PODS[i];
    if (!p.landed) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      /* falls fast and accelerates; retros flare in the last moments */
      const h = 70 * (1 - k * k * (0.35 + 0.65 * k));
      p.g.position.set(p.at.x, p.at.y + h, p.at.z);
      p.g.rotation.y += dt * 2.5;
      p.fire.material.opacity = 0.6 + Math.random() * 0.4;
      p.retro.material.opacity = k > 0.75 ? (k - 0.75) * 4 * (0.7 + Math.random() * 0.3) : 0;
      POD_MAT.burn.emissiveIntensity = 1.2;
      if (Math.random() < dt * 30) dust(_podV.copy(p.g.position).setY(p.g.position.y + 3), 1, 0.4, 1.5, 0.6);
      if (k >= 1) {
        p.landed = true;
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
        if (p.onLand) p.onLand(p.at);
      }
      continue;
    }
    /* landed: the doors tumble away, the pod cools, then sinks out of sight */
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
  p.fire.material.dispose();
  p.retro.material.dispose();
}
function clearPods() {
  for (const p of PODS) disposePod(p);
  PODS.length = 0;
}
