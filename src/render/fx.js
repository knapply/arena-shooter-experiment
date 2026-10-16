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
  REC.proj(o, key);
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
/* ---- particles on the GPU: dust, smoke, fire, sparks and flashes are instanced quads in two shared
   pools (one draw call each: soft blended, glow additive). A particle is written once, when it is
   spawned (where, how fast, when, how long, how it grows, drags and falls, its color and kind), and the
   vertex shader works out where it is at any moment in closed form, so the CPU never touches it again.
   Kinds: 0 a soft round blob, 1 smoke and 2 fire (a 4x4 flipbook of rolling noise, drawn once at load;
   fire burns white-yellow, then orange, then red as it ages), 3 a spark (stretched along its motion),
   4 a muzzle-flash star. ---- */
const PT_N = 1200;
const _ptC = new THREE.Color(),
  _ptV2 = new THREE.Vector2();
const PT_T = { value: 0 };
/** the flipbook: 16 frames of a billowing, thinning noise puff, 64 px each (alpha = density) */
const FLIPBOOK = (() => {
  const S = 64,
    N = S * 4,
    d = new Uint8Array(N * N * 4);
  const h = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x, y) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy,
      u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy),
      b = h(ix + 1, iy),
      c = h(ix, iy + 1),
      e = h(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  };
  for (let f = 0; f < 16; f++) {
    const t = f / 15,
      ox = (f % 4) * S,
      oy = Math.floor(f / 4) * S;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const px = (x + 0.5) / S - 0.5,
          py = (y + 0.5) / S - 0.5;
        const r = Math.hypot(px, py) * 2;
        /* rolling noise, drifting outward over the frames */
        const q = 3.2 + t * 1.5,
          n =
            vn(px * q + 7 + t * 1.3, py * q + 3 - t * 2) * 0.55 +
            vn(px * q * 2.1 + 1, py * q * 2.1 + t * 3) * 0.3 +
            vn(px * q * 4.3, py * q * 4.3 - t * 4) * 0.15;
        const edge = 0.55 + 0.35 * t;
        let a = Math.max(0, Math.min(1, (edge - r) / 0.35 + (n - 0.5) * 1.6));
        /* (never reaching the frame's edge, so no puff shows a straight side) */
        a *= (1 - t * 0.55) * Math.min(1, Math.max(0, (1 - r) / 0.18));
        const o = ((oy + y) * N + ox + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = Math.round(255 * Math.min(1, 0.55 + n * 0.6));
        d[o + 3] = Math.round(255 * a);
      }
  }
  const tex = new THREE.DataTexture(d, N, N);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
})();
function makePts(additive) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute("position", base.attributes.position);
  const at = name => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(PT_N * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  /* a0 = spawn point, spawn time; a1 = velocity, life; a2 = size, growth, drag, gravity;
     a3 = color, opacity; a4 = fade length, kind, spin, seed */
  /* used: slots written since the pool last emptied (only those are drawn); end: when the last one dies */
  const P = {
    a: [at("a0"), at("a1"), at("a2"), at("a3"), at("a4")],
    next: 0,
    lo: PT_N,
    hi: -1,
    used: 0,
    end: 0,
    mesh: null,
  };
  geo.instanceCount = 0;
  /* (everything starts long dead) */
  P.a[1].array.fill(0);
  for (let i = 0; i < PT_N; i++) P.a[0].array[i * 4 + 3] = -1e9;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(
      { uT: PT_T, map: { value: FLIPBOOK }, star: { value: STAR } },
      additive
        ? {}
        : {
            fogColor: { value: new THREE.Color() },
            fogNear: { value: 1 },
            fogFar: { value: 2000 },
            fogDensity: { value: 0 },
          }
    ),
    vertexShader: `attribute vec4 a0;attribute vec4 a1;attribute vec4 a2;attribute vec4 a3;attribute vec4 a4;uniform float uT;
varying vec4 vC;varying vec2 vUv;varying float vAge;varying float vKind;varying float vSeed;
#include <fog_pars_vertex>
void main(){float age=uT-a0.w;
if(age<0.||age>a1.w){gl_Position=vec4(2.,2.,2.,1.);return;}
float k=a2.z;vec3 g=vec3(0.,-a2.w,0.);vec3 p,v;
if(k>1e-4){float e=exp(-k*age);p=a0.xyz+(a1.xyz-g/k)*(1.-e)/k+g*age/k;v=(a1.xyz-g/k)*e+g/k;}
else{p=a0.xyz+a1.xyz*age+.5*g*age*age;v=a1.xyz+g*age;}
float sz=a2.x*exp(a2.y*age);
vec4 mvPosition=viewMatrix*vec4(p,1.);
vec2 c=position.xy;
if(a4.y>2.5&&a4.y<3.5){
/* a spark: stretched along its motion on screen */
vec3 vv=(viewMatrix*vec4(v,0.)).xyz;vec2 d=vv.xy;float L=length(d);
vec2 ax=L>1e-4?d/L:vec2(1.,0.);vec2 ay=vec2(-ax.y,ax.x);
mvPosition.xy+=ax*c.x*(sz+L*.035)+ay*c.y*sz*.35;}
else{float r=a4.z*age+a4.w*6.28;float cs=cos(r),sn=sin(r);mvPosition.xy+=vec2(c.x*cs-c.y*sn,c.x*sn+c.y*cs)*sz;}
gl_Position=projectionMatrix*mvPosition;
vUv=c+.5;vAge=age/a1.w;vKind=a4.y;vSeed=a4.w;
/* opacity falls with the time left, over the fade length (it may start below full) */
vC=vec4(a3.rgb,a3.a*(a1.w-age)/max(a4.x,1e-3));
#include <fog_vertex>
}`,
    fragmentShader: `uniform sampler2D map;uniform sampler2D star;varying vec4 vC;varying vec2 vUv;varying float vAge;varying float vKind;varying float vSeed;
#include <fog_pars_fragment>
vec4 book(float t){float f=min(t*15.,15.);float f0=floor(f);vec2 o0=vec2(mod(f0,4.),floor(f0/4.))/4.;float f1=min(f0+1.,15.);vec2 o1=vec2(mod(f1,4.),floor(f1/4.))/4.;
vec2 uv=(vSeed>.5?vec2(1.-vUv.x,vUv.y):vUv)/4.;return mix(texture2D(map,o0+uv),texture2D(map,o1+uv),f-f0);}
void main(){vec4 c;
if(vKind<.5){float r=length(vUv-.5)*2.;c=vec4(vC.rgb,vC.a*(1.-smoothstep(0.,1.,r))*(1.-smoothstep(0.,1.,r)));}
else if(vKind<1.5){vec4 b=book(vAge*.85+vSeed*.15);c=vec4(vC.rgb*(.7+.5*b.r),vC.a*b.a);}
else if(vKind<2.5){vec4 b=book(vAge*.8);float hot=1.-vAge;
/* white-hot, orange, deep red, then charred to smoke that fades */
vec3 fire=mix(vec3(.06,.04,.035),mix(vec3(.75,.12,.03),mix(vec3(1.,.45,.09),vec3(1.,.93,.72),smoothstep(.6,.95,hot)),smoothstep(.3,.62,hot)),smoothstep(.12,.38,hot));
c=vec4(fire*vC.rgb*(.6+.8*b.r)*(1.+2.*hot*hot),vC.a*b.a*smoothstep(0.,.35,hot));}
else if(vKind<3.5){float r=length((vUv-.5)*vec2(1.,2.))*2.;c=vec4(vC.rgb,vC.a*(1.-smoothstep(.2,1.,r)));}
else{vec4 s=texture2D(star,vUv);c=vec4(vC.rgb*s.rgb,vC.a*s.a);}
gl_FragColor=c;
#include <fog_fragment>
}`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: !additive,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 2;
  scene.add(m);
  P.mesh = m;
  return P;
}
const PTS = { soft: makePts(false), glow: makePts(true) };
/** the kind a particle is drawn as, by name */
const PT_KIND = { blob: 0, smoke: 1, fire: 2, spark: 3, flash: 4 };
/**
 * one particle. size: world diameter (m); grow: size growth per second; op: starting opacity; o.max:
 * the time the fade is spread over (default its life); o.kind: blob, smoke, fire, spark or flash
 * (default blob, or spark for a small fast glow); o.spin: radians per second. When a pool is full the
 * oldest particle makes way; nothing is allocated per particle.
 * @param {any} P PTS.soft or PTS.glow
 */
function ptAdd(P, pos, vel, size, hex, op, life, o = {}) {
  const i = P.next;
  P.next = (P.next + 1) % PT_N;
  P.used = Math.max(P.used, i + 1);
  P.end = Math.max(P.end, PT_T.value + life);
  if (i < P.lo) P.lo = i;
  if (i > P.hi) P.hi = i;
  _ptC.setHex(hex);
  const kind =
    o.kind != null
      ? PT_KIND[o.kind] || 0
      : P === PTS.glow && o.g && size < 0.3 && vel.lengthSq() > 4
        ? PT_KIND.spark
        : PT_KIND.blob;
  const k = i * 4,
    A = P.a;
  A[0].array.set([pos.x, pos.y, pos.z, PT_T.value], k);
  A[1].array.set([vel.x, vel.y, vel.z, life], k);
  A[2].array.set([size, o.grow || 0, o.drag || 0, o.g || 0], k);
  A[3].array.set([_ptC.r, _ptC.g, _ptC.b, op], k);
  A[4].array.set([o.max || life, kind, o.spin || (Math.random() - 0.5) * 1.5, Math.random()], k);
}
function updPts(dt) {
  PT_T.value += dt;
  for (const P of [PTS.soft, PTS.glow]) {
    /* all dead: draw nothing, and start the ring over */
    if (P.used && PT_T.value > P.end) P.used = P.next = 0;
    P.mesh.geometry.instanceCount = P.used;
    P.mesh.visible = P.used > 0;
    if (P.hi < 0) continue;
    for (const a of P.a) {
      a.clearUpdateRanges();
      a.addUpdateRange(P.lo * 4, (P.hi - P.lo + 1) * 4);
      a.needsUpdate = true;
    }
    P.lo = PT_N;
    P.hi = -1;
  }
}
/** end particles that were spawned below the given height (render/prewarm.js clears its samples) */
function ptClearBelow(y) {
  for (const P of [PTS.soft, PTS.glow]) {
    const a0 = P.a[0].array;
    for (let i = 0; i < PT_N; i++)
      if (a0[i * 4 + 1] < y) {
        a0[i * 4 + 3] = -1e9;
        if (i < P.lo) P.lo = i;
        if (i > P.hi) P.hi = i;
      }
  }
}
const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
/* how fast a tracer streak flies (m/s): quick enough to read as a bullet, slow enough to be seen */
const TRACER_V = 360;
/* the sniper's trail and the beam: a ribbon that keeps its width in pixels at any distance (a bright
   core and a soft glow across it, pulses running along it, tapered at the ends) */
const ribbonGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 1, 24);
  g.translate(0, 0.5, 0);
  return g;
})();
const _rbA = new THREE.Vector2();
function makeRibbon() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      pa: { value: new THREE.Vector3() },
      pb: { value: new THREE.Vector3() },
      col: { value: new THREE.Color() },
      op: { value: 1 },
      px: { value: 6 },
      res: { value: new THREE.Vector2(1, 1) },
      t: { value: 0 },
    },
    vertexShader: `uniform vec3 pa;uniform vec3 pb;uniform float px;uniform vec2 res;varying vec2 vS;
void main(){vec4 ca=projectionMatrix*viewMatrix*vec4(pa,1.),cb=projectionMatrix*viewMatrix*vec4(pb,1.);
/* (an end behind the camera is pulled to just in front of it) */
if(ca.w<.05)ca=mix(cb,ca,(cb.w-.05)/max(cb.w-ca.w,1e-4));if(cb.w<.05)cb=mix(ca,cb,(ca.w-.05)/max(ca.w-cb.w,1e-4));
vec4 c=mix(ca,cb,position.y);vec2 d=(cb.xy/cb.w-ca.xy/ca.w)*res;float L=length(d);d=L>1e-4?d/L:vec2(1.,0.);
c.xy+=vec2(-d.y,d.x)*position.x*px*2./res*c.w;gl_Position=c;vS=vec2(position.x*2.,position.y);}`,
    fragmentShader: `uniform vec3 col;uniform float op;uniform float t;varying vec2 vS;
void main(){float x=abs(vS.x);float core=exp(-x*x*28.),glow=exp(-x*x*4.);
float end=smoothstep(0.,.04,vS.y)*smoothstep(1.,.9,vS.y);
float pulse=.75+.25*sin(vS.y*90.-t*40.);
gl_FragColor=vec4((col*glow*.7*pulse+vec3(1.)*core)*op*end,1.);}`,
    transparent: true,
    depthWrite: false,
    /* (which way the strip faces depends on the line's direction on screen) */
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(ribbonGeo, mat);
  m.frustumCulled = false;
  m.onBeforeRender = r => {
    const rt = r.getRenderTarget();
    if (rt) mat.uniforms.res.value.set(rt.width, rt.height);
    else mat.uniforms.res.value.copy(r.getDrawingBufferSize(_rbA));
    mat.uniforms.op.value = mat.opacity;
    mat.uniforms.t.value = PT_T.value;
  };
  return m;
}
function tracer(a, b, color, life) {
  life = life || 0.1;
  _fx.copy(b).sub(a);
  const L = _fx.length(),
    s = Math.min(3.5, L * 0.3),
    streak = life <= 0.12 && L > 2;
  let m;
  if (!streak && SET.fxDetail !== "low") {
    /* a line drawn at once that fades: the sniper's trail, the beam (a ribbon above Basic effects) */
    m = fxGet("rb", makeRibbon);
    const U = m.material.uniforms;
    U.pa.value.copy(a);
    U.pb.value.copy(b);
    U.col.value.setHex(color);
    U.px.value = life > 0.4 ? 7 : 5;
    m.material.opacity = 1;
    fxPush({ m, key: "rb", life, max: life, fade: true, op: 1 });
  } else {
    m = fxGet(
      "tr",
      () =>
        new THREE.Mesh(
          tracerGeo,
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false })
        )
    );
    m.material.color.setHex(color);
    m.lookAt(b);
    if (streak) {
      /* a round in flight: a short bright streak flying from the muzzle to where it hits */
      m.position.copy(a).addScaledVector(_fx, s / 2 / L);
      m.scale.set(0.8, 0.8, s);
      m.material.opacity = 0.95;
      const t = (L - s) / TRACER_V;
      fxPush({ m, key: "tr", life: t, max: t, vel: _fx.clone().multiplyScalar(TRACER_V / L) });
    } else {
      m.position.copy(a).addScaledVector(_fx, 0.5);
      m.scale.set(1, 1, L);
      fxPush({ m, key: "tr", life, max: life, fade: true });
    }
  }
  /* recorded for replays; while one plays, live shots elsewhere stay out of the picture */
  if (!REC.muted) {
    REC.fx(REC.TRACER, a, b, color);
    if (REPLAY.active) m.visible = false;
  }
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
      { max: 0.7, grow: 1.6, drag: 3, kind: "smoke" }
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
  REC.fx(REC.SHOCK, p);
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
  REC.fx(REC.BLAST, p, _fx.set(r, 0, 0), color);
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
/** a shield breaking at p (a pilot's chest): unlike a hit's flare on the shell, it bursts into a sphere
    of warm white light, sheds gold shards and sparks, and lights the
    area for a moment (the reference's gold-white pop) */
function shieldPop(p) {
  const f = fxGet("fl", () => new THREE.Sprite(flashMat.clone()));
  f.material.color.setHex(0xfff0d2);
  f.position.copy(p);
  f.scale.setScalar(2);
  fxPush({ m: f, key: "fl", life: 0.22, max: 0.22, fade: true, grow: 2.6 });
  const n = pc(34);
  for (let i = 0; i < n; i++) {
    const s = fxGet("sh", () => new THREE.Sprite(shardMat.clone()));
    s.material.color.setHex(i % 3 ? 0xffd36b : 0xfff4dc);
    s.position.copy(p).add(_fx.set(rnd(-0.3, 0.3), rnd(-0.6, 0.5), rnd(-0.3, 0.3)));
    s.scale.set(rnd(0.05, 0.1), rnd(0.25, 0.5), 1);
    fxPush({
      m: s,
      key: "sh",
      life: rnd(0.3, 0.6),
      max: 0.6,
      fade: true,
      vel: new V3(rnd(-6.5, 6.5), rnd(-1, 5), rnd(-6.5, 6.5)),
      g: 3,
    });
  }
  spark(p, 16, 0xffe6a8);
  dynLight(p, 0xffe0a8, 4, 0.2, 7);
}
/** crackle on a pilot whose shield is down: a few sparks off the armor (rigEvents, a rig's `crackle`) */
function shieldCrackle(p) {
  spark(_fx.copy(p).add(new V3(rnd(-0.25, 0.25), rnd(-0.6, 0.45), rnd(-0.25, 0.25))), 3, 0xff9a52);
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
