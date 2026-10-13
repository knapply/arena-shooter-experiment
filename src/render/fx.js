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
/* ---- batched particles: dust, puffs and sparks are points in two shared buffers (one draw call
   each, however many are alive), instead of a sprite per particle ---- */
const PT_N = 1200;
const _ptC = new THREE.Color(),
  _ptV2 = new THREE.Vector2();
function makePts(additive) {
  const geo = new THREE.BufferGeometry();
  const at = (n, k) => {
    const a = new THREE.BufferAttribute(new Float32Array(PT_N * k), k);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(n, a);
    return a;
  };
  const P = {
    pos: at("position", 3),
    col: at("pcol", 3),
    size: at("psize", 1),
    alpha: at("palpha", 1),
    list: [],
    geo,
    mesh: null,
  };
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(
      { uScale: { value: 500 }, map: { value: additive ? SOFT : SMOKE } },
      additive
        ? {}
        : {
            fogColor: { value: new THREE.Color() },
            fogNear: { value: 1 },
            fogFar: { value: 2000 },
            fogDensity: { value: 0 },
          }
    ),
    vertexShader: `attribute vec3 pcol;attribute float psize;attribute float palpha;uniform float uScale;
varying vec3 vC;varying float vA;
#include <fog_pars_vertex>
void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
gl_PointSize=psize*uScale/max(.05,-mvPosition.z);vC=pcol;vA=palpha;
#include <fog_vertex>
}`,
    fragmentShader: `uniform sampler2D map;varying vec3 vC;varying float vA;
#include <fog_pars_fragment>
void main(){vec4 t=texture2D(map,vec2(gl_PointCoord.x,1.-gl_PointCoord.y));
gl_FragColor=vec4(vC*t.rgb,vA*t.a);
#include <fog_fragment>
}`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: !additive,
  });
  const m = new THREE.Points(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 2;
  /* a point's size is in pixels: scale world size by the target's height and the field of view */
  m.onBeforeRender = (r, sc, cam) => {
    const rt = r.getRenderTarget();
    const h = rt ? rt.height : r.getDrawingBufferSize(_ptV2).y;
    mat.uniforms.uScale.value = (h * 0.5) / Math.tan(((cam.fov || 60) * Math.PI) / 360);
  };
  scene.add(m);
  P.mesh = m;
  return P;
}
const PTS = { soft: makePts(false), glow: makePts(true) };
/**
 * one particle. size: world diameter (m); grow: size growth per second; op: starting opacity
 * @param {any} P PTS.soft or PTS.glow
 */
function ptAdd(P, pos, vel, size, hex, op, life, o = {}) {
  if (P.list.length >= PT_N) P.list.shift();
  _ptC.setHex(hex);
  P.list.push({
    p: pos.clone(),
    v: vel,
    s: size,
    r: _ptC.r,
    g: _ptC.g,
    b: _ptC.b,
    op,
    life,
    max: o.max || life,
    grow: o.grow || 0,
    drag: o.drag || 0,
    grav: o.g || 0,
  });
}
function updPts(dt) {
  for (const P of [PTS.soft, PTS.glow]) {
    const L = P.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const q = L[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      if (q.drag) q.v.multiplyScalar(Math.exp(-q.drag * dt));
      if (q.grav) q.v.y -= q.grav * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.grow) q.s *= 1 + q.grow * dt;
      L[n++] = q;
      const j = n - 1;
      P.pos.setXYZ(j, q.p.x, q.p.y, q.p.z);
      P.col.setXYZ(j, q.r, q.g, q.b);
      P.size.setX(j, q.s);
      P.alpha.setX(j, (q.op * q.life) / q.max);
    }
    L.length = n;
    P.geo.setDrawRange(0, n);
    P.mesh.visible = n > 0;
    if (n) for (const a of [P.pos, P.col, P.size, P.alpha]) a.needsUpdate = true;
  }
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
  /* muzzle light, casing, the hole and the sparks off the wall (render/combat-fx.js) */
  onShotFx(a, b);
}
function spark(p, n = 1, color) {
  n = pc(n);
  for (let i = 0; i < n; i++)
    ptAdd(
      PTS.glow,
      p,
      new V3(rnd(-3, 3), rnd(0, 3.5), rnd(-3, 3)),
      rnd(0.1, 0.24),
      color || 0xffe0a8,
      0.9,
      rnd(0.15, 0.3),
      {
        max: 0.3,
        g: 6,
      }
    );
}
function thrustPuff(p, dir) {
  const n = pc(8);
  for (let i = 0; i < n; i++)
    ptAdd(
      PTS.soft,
      _fx.copy(p).add(new V3(rnd(-0.2, 0.2), rnd(0.8, 1.4), rnd(-0.2, 0.2))),
      new V3(-dir.x * rnd(3, 7), rnd(-0.5, 0.5), -dir.z * rnd(3, 7)),
      rnd(0.25, 0.45),
      0x9fdcff,
      0.7,
      0.35,
      { grow: 2 }
    );
}
function dust(p, n, spread, up = 0.6, size = 0.35) {
  n = pc(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    ptAdd(
      PTS.soft,
      _fx.copy(p).add(new V3(rnd(-0.15, 0.15), 0.08, rnd(-0.15, 0.15))),
      new V3(Math.cos(a) * spread * rnd(0.5, 1), rnd(0, up), Math.sin(a) * spread * rnd(0.5, 1)),
      rnd(size * 0.6, size),
      0x8a8178,
      0.45,
      rnd(0.35, 0.7),
      { max: 0.7, grow: 1.6, drag: 3 }
    );
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
  /* fireball, smoke, debris, scorch, light and heat (render/combat-fx.js) */
  blastFx(p, color, r);
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
  updPts(dt);
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
