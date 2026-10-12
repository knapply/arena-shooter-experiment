/* ============ fx (pooled meshes and materials, hard cap on live particles) ============ */
const FX = [];
const FXMAX = 360;
const POOL = new Map();
const _fx = new V3();
function fxGet(key, make) {
  let p = POOL.get(key);
  if (!p) {
    p = [];
    POOL.set(key, p);
  }
  const o = p.length ? p.pop() : make();
  o.visible = true;
  scene.add(o);
  return o;
}
function fxKill(i) {
  const f = FX[i];
  scene.remove(f.m);
  POOL.get(f.key).push(f.m);
  FX[i] = FX[FX.length - 1];
  FX.pop();
}
function fxPush(f) {
  if (FX.length >= FXMAX) fxKill(0);
  FX.push(f);
}
const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
function tracer(a, b, color, life) {
  life = life || 0.1;
  const m = fxGet(
    "tr",
    () =>
      new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false })
      )
  );
  m.material.color.setHex(color);
  _fx.copy(b).sub(a);
  m.position.copy(a).addScaledVector(_fx, 0.5);
  m.scale.set(1, 1, _fx.length());
  m.lookAt(b);
  fxPush({ m, key: "tr", life, max: life, fade: true });
}
const sparkMat = new THREE.SpriteMaterial({
  color: 0xffe0a8,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
function spark(p, n = 1, color) {
  n = pc(n);
  for (let i = 0; i < n; i++) {
    const s = fxGet("sp", () => new THREE.Sprite(sparkMat.clone()));
    s.material.color.setHex(color || 0xffe0a8);
    s.position.copy(p);
    s.scale.setScalar(rnd(0.1, 0.24));
    fxPush({
      m: s,
      key: "sp",
      life: rnd(0.15, 0.3),
      max: 0.3,
      fade: true,
      vel: new V3(rnd(-3, 3), rnd(0, 3.5), rnd(-3, 3)),
      g: 6,
    });
  }
}
const puffMat = new THREE.SpriteMaterial({
  color: 0x9fdcff,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});
function thrustPuff(p, dir) {
  const n = pc(8);
  for (let i = 0; i < n; i++) {
    const s = fxGet("pf", () => new THREE.Sprite(puffMat.clone()));
    s.position.copy(p).add(_fx.set(rnd(-0.2, 0.2), rnd(0.8, 1.4), rnd(-0.2, 0.2)));
    s.scale.setScalar(rnd(0.25, 0.45));
    fxPush({
      m: s,
      key: "pf",
      life: 0.35,
      max: 0.35,
      fade: true,
      grow: 2,
      vel: new V3(-dir.x * rnd(3, 7), rnd(-0.5, 0.5), -dir.z * rnd(3, 7)),
    });
  }
}
const dustMat = new THREE.SpriteMaterial({
  color: 0x8a8178,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
function dust(p, n, spread, up = 0.6, size = 0.35) {
  n = pc(n);
  for (let i = 0; i < n; i++) {
    const s = fxGet("du", () => new THREE.Sprite(dustMat.clone()));
    s.position.copy(p).add(_fx.set(rnd(-0.15, 0.15), 0.08, rnd(-0.15, 0.15)));
    s.scale.setScalar(rnd(size * 0.6, size));
    const a = Math.random() * Math.PI * 2;
    fxPush({
      m: s,
      key: "du",
      life: rnd(0.35, 0.7),
      max: 0.7,
      fade: true,
      grow: 1.6,
      op: 0.45,
      vel: new V3(Math.cos(a) * spread * rnd(0.5, 1), rnd(0, up), Math.sin(a) * spread * rnd(0.5, 1)),
      drag: 3,
    });
  }
}
const ringGeo = new THREE.RingGeometry(0.6, 1, 40);
function ring(p, color, size) {
  const m = fxGet("rg", () => {
    const r = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    r.rotation.x = -Math.PI / 2;
    return r;
  });
  m.material.color.setHex(color);
  m.position.copy(p).add(_fx.set(0, 0.08, 0));
  m.scale.setScalar(1);
  fxPush({ m, key: "rg", life: 0.5, max: 0.5, fade: true, ring: size || 6 });
}
function shock(p) {
  ring(p, 0xffb347, 6);
  spark(
    _fx
      .copy(p)
      .add(new V3(0, 0.3, 0))
      .clone(),
    10
  );
  dust(p, 14, 7, 1.5, 0.6);
}
const flashMat = new THREE.SpriteMaterial({
  color: 0xffc070,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
function blast(p, color, r) {
  const s = fxGet("fl", () => new THREE.Sprite(flashMat.clone()));
  s.material.color.setHex(color);
  s.position.copy(p);
  s.scale.setScalar(r * 0.9);
  fxPush({ m: s, key: "fl", life: 0.28, max: 0.28, fade: true, grow: 3 });
  ring(p, color, r * 1.2);
  spark(p, 12, color);
  dust(p, 10, 5, 2, 0.7);
}
const magGeo = new THREE.BoxGeometry(0.045, 0.14, 0.07),
  magMat = new THREE.MeshStandardMaterial({
    color: "#1d2428",
    roughness: 0.6,
    metalness: 0.4,
    transparent: true,
  });
function dropMag(pos, q) {
  const m = fxGet("mg", () => {
    const o = new THREE.Mesh(magGeo, magMat.clone());
    o.castShadow = true;
    return o;
  });
  m.position.copy(pos);
  if (q) m.quaternion.copy(q);
  m.material.opacity = 1;
  fxPush({
    m,
    key: "mg",
    life: 3,
    max: 3,
    fadeTail: 0.5,
    vel: new V3(rnd(-0.4, 0.4), -0.5, rnd(-0.4, 0.4)),
    g: 9.8,
    spin: new V3(rnd(-6, 6), rnd(-4, 4), rnd(-6, 6)),
    floor: groundBelow(pos.x, pos.z, pos.y, 0.05) + 0.035,
  });
}
const shardMat = new THREE.SpriteMaterial({
  color: 0xffd36b,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
function shieldPop(p) {
  const n = pc(18);
  for (let i = 0; i < n; i++) {
    const s = fxGet("sh", () => new THREE.Sprite(shardMat.clone()));
    s.position.copy(p).add(_fx.set(rnd(-0.3, 0.3), rnd(-0.5, 0.5), rnd(-0.3, 0.3)));
    s.scale.set(rnd(0.04, 0.08), rnd(0.2, 0.4), 1);
    fxPush({
      m: s,
      key: "sh",
      life: rnd(0.25, 0.5),
      max: 0.5,
      fade: true,
      vel: new V3(rnd(-5, 5), rnd(-1, 4), rnd(-5, 5)),
      g: 3,
    });
  }
}
function updFX(dt) {
  updPods(dt);
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i];
    f.life -= dt;
    const k = Math.max(0, f.life / f.max);
    if (f.vel) {
      if (f.drag) f.vel.multiplyScalar(Math.exp(-f.drag * dt));
      if (f.g) f.vel.y -= f.g * dt;
      f.m.position.addScaledVector(f.vel, dt);
    }
    if (f.spin && f.vel) {
      f.m.rotation.x += f.spin.x * dt;
      f.m.rotation.y += f.spin.y * dt;
      f.m.rotation.z += f.spin.z * dt;
    }
    if (f.floor != null && f.m.position.y < f.floor) {
      f.m.position.y = f.floor;
      if (f.vel) {
        if (Math.abs(f.vel.y) > 1.2) {
          f.vel.y *= -0.3;
          f.vel.x *= 0.5;
          f.vel.z *= 0.5;
          if (f.spin) f.spin.multiplyScalar(0.4);
        } else {
          f.vel = null;
        }
      }
    }
    if (f.grow) f.m.scale.multiplyScalar(1 + f.grow * dt);
    if (f.ring) f.m.scale.setScalar(1 + (1 - k) * f.ring);
    if (f.fade) f.m.material.opacity = k * (f.ring ? 0.8 : f.op || 0.9);
    if (f.fadeTail) f.m.material.opacity = Math.min(1, f.life / f.fadeTail);
    if (f.key === "db" && f.life < 0.5) f.m.scale.multiplyScalar(Math.max(0, 1 - dt * 7));
    if (f.life <= 0) fxKill(i);
  }
}
