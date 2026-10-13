/* ============ COMBAT FX: what a gunfight leaves in the air and on the walls ============
   Layered on the pooled effects in render/fx.js, gated by the Combat effects and Dynamic lights settings:
   - dynamic lights: three pooled point lights (only in the scene while the setting is on, so Low pays
     nothing) for muzzle flashes, explosions and pods; each flash takes the dimmest one;
   - shell casings: one instanced mesh, simple bounces, gone after a few seconds;
   - decals: one instanced mesh of 96 quads in a ring, bullet holes, scorch marks and pod craters drawn in the
     shader, glowing hot for a moment and fading out over half a minute;
   - impacts: sparks thrown off the surface's normal and a puff of dust;
   - explosions: fireball, embers, a smoke column, tumbling debris, a scorch, a flash of light;
   - heat haze (Ultra): rockets and fresh explosions bend the picture in the composite pass.
   onShotFx is called by tracer() and blastFx by blast(), so every shooter and explosion gets it. */
const CFX = { lights: [], heat: [], t: 0 };
const _cf = new THREE.Vector3(),
  _cf2 = new THREE.Vector3(),
  _cq = new THREE.Quaternion(),
  _cm = new THREE.Matrix4(),
  _cz = new THREE.Vector3(0, 0, 1),
  _cs = new THREE.Vector3();
const fxOn = () => SET.fxDetail !== "low";
/* ---- dynamic lights ---- */
function syncDynLights() {
  const want = SET.dynLights ? 3 : 0;
  while (CFX.lights.length < want) {
    const l = new THREE.PointLight(0xffaa55, 0, 9, 2);
    l.userData.life = l.userData.max = l.userData.i = 0;
    scene.add(l);
    CFX.lights.push(l);
  }
  while (CFX.lights.length > want) scene.remove(CFX.lights.pop());
}
SET_HOOKS.push(syncDynLights);
function dynLight(p, color, intensity, life, range = 9) {
  if (!CFX.lights.length) return;
  let best = CFX.lights[0];
  for (const l of CFX.lights) if (l.intensity < best.intensity) best = l;
  if (best.intensity > intensity) return;
  best.position.copy(p);
  best.color.setHex(color);
  best.distance = range;
  Object.assign(best.userData, { life, max: life, i: intensity });
  best.intensity = intensity;
}
/* ---- heat haze: sources for this frame, read by the composite pass ---- */
/** a heat source: for one frame (life 0), or fading over life seconds */
function heatAt(p, r, k = 1, life = 0) {
  if (SET.fxDetail !== "ultra" || CFX.heat.length >= 12) return;
  const h = HEAT_POOL.pop() || { p: new THREE.Vector3(), r, k, life, max: life };
  h.p.copy(p);
  h.r = r;
  h.k = k;
  h.life = h.max = life;
  CFX.heat.push(h);
}
/** used sources, reused so one-frame sources (sprint exhaust) allocate nothing */
const HEAT_POOL = [];
function heatDone(i) {
  HEAT_POOL.push(CFX.heat[i]);
  CFX.heat.splice(i, 1);
}
/* ---- shell casings and explosion debris: small things that tumble, bounce and settle, each kind
   one instanced mesh (one draw call however many are flying) ---- */
function tumblers(geo, mat, n, rest, sound) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  m.count = 0;
  m.castShadow = false;
  scene.add(m);
  return { mesh: m, list: [], n, rest, sound };
}
const casings = (() => {
  const g = new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6);
  g.rotateX(Math.PI / 2);
  return tumblers(
    g,
    new THREE.MeshStandardMaterial({ color: "#c8933c", roughness: 0.3, metalness: 0.9 }),
    48,
    0.007,
    true
  );
})();
const chunks = tumblers(
  new THREE.BoxGeometry(0.09, 0.06, 0.12),
  new THREE.MeshStandardMaterial({ color: "#23282c", roughness: 0.7, metalness: 0.4 }),
  40,
  0.03,
  false
);
function toss(T, p, v, spin, life, scale = 1, g = 9.8) {
  if (T.list.length >= T.n) T.list.shift();
  T.list.push({
    p: p.clone(),
    v,
    r: new THREE.Euler(rnd(0, 6), rnd(0, 6), 0),
    w: spin,
    life,
    s: scale,
    g,
    rest: false,
  });
}
function ejectCasing(p, dir) {
  _cs.set(dir.z, 0, -dir.x).normalize();
  toss(
    casings,
    p,
    _cs
      .clone()
      .multiplyScalar(rnd(1.6, 2.6))
      .add(new THREE.Vector3(0, rnd(1.4, 2.4), 0))
      .addScaledVector(dir, -0.6),
    new THREE.Vector3(rnd(-25, 25), rnd(-25, 25), rnd(-10, 10)),
    3
  );
}
function updTumblers(T, dt) {
  const L = T.list;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    c.life -= dt;
    if (c.life <= 0) continue;
    if (!c.rest) {
      c.v.y -= c.g * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt;
      c.r.y += c.w.y * dt;
      c.r.z += c.w.z * dt;
      const fl = groundBelow(c.p.x, c.p.z, c.p.y + 0.05, 0.01) + T.rest * c.s;
      if (c.p.y < fl) {
        c.p.y = fl;
        if (c.v.y < -1) {
          c.v.y *= -0.35;
          c.v.x *= 0.5;
          c.v.z *= 0.5;
          c.w.multiplyScalar(0.5);
          if (T.sound && Math.random() < 0.4) sfxAt("clink", c.p, 10, 0.5);
        } else {
          c.rest = true;
          c.r.x = T.sound ? Math.PI / 2 : 0;
          c.r.z = 0;
        }
      }
    }
    L[n++] = c;
    _cq.setFromEuler(c.r);
    _cs.setScalar(c.s * (c.life < 0.4 ? c.life / 0.4 : 1));
    _cm.compose(c.p, _cq, _cs);
    T.mesh.setMatrixAt(n - 1, _cm);
  }
  L.length = n;
  T.mesh.count = n;
  T.mesh.visible = n > 0;
  if (n) T.mesh.instanceMatrix.needsUpdate = true;
}
/* ---- decals ---- */
const DEC_N = 96;
const decals = (() => {
  const g = new THREE.PlaneGeometry(1, 1);
  const dd = new THREE.InstancedBufferAttribute(new Float32Array(DEC_N * 4), 4);
  dd.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("dd", dd);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `attribute vec4 dd;varying vec2 vUv;varying vec4 vD;
void main(){vUv=uv;vD=dd;vec4 p=vec4(position,1.);
#ifdef USE_INSTANCING
p=instanceMatrix*p;
#endif
gl_Position=projectionMatrix*modelViewMatrix*p;}`,
    /* dd: birth time, kind (0 bullet hole, 1 scorch, 2 pod crater), seed, - */
    fragmentShader: `uniform float uT;varying vec2 vUv;varying vec4 vD;
float h(float x){return fract(sin(x)*43758.5453);}
void main(){vec2 q=vUv-.5;float r=length(q)*2.;float a=atan(q.y,q.x);float age=uT-vD.x;
float jag=.5+.5*sin(a*7.+vD.z*40.)*sin(a*13.-vD.z*17.);
float m,glow;vec3 gc;
if(vD.y<.5){m=smoothstep(.36,.2,r)+.55*smoothstep(1.,.45,r+jag*.25)*smoothstep(.2,.4,r);
glow=smoothstep(.35,0.,r)*exp(-age*7.);gc=vec3(1.,.55,.2);
m*=1.-smoothstep(16.,22.,age);}
else if(vD.y>1.5){float s=a*1.4324+vD.z*7.;float d=abs(fract(s+.12*sin(r*11.+vD.z*30.))-.5);
float len=.55+.45*h(floor(s+.5)+vD.z);float ck=smoothstep(.045,.0,d*r)*smoothstep(len,len-.15,r)*step(.3,r);
float bowl=smoothstep(.5,.22,r);float ring=smoothstep(.95,.5,r+jag*.18);
m=max(max(bowl*.92,ring*.62),ck*.95);
glow=(ck*smoothstep(.75,.3,r)+bowl*.6)*exp(-age*.9)*1.6;gc=vec3(1.,.45,.14);
m*=1.-smoothstep(18.,26.,age);}
else{m=smoothstep(1.,.25,r+jag*.3)*(.75+.25*h(floor(a*9.)+vD.z));
glow=smoothstep(.75,0.,r+jag*.2)*exp(-age*1.4)*1.5;gc=vec3(1.,.42,.12);
m*=1.-smoothstep(26.,32.,age);}
m=clamp(m,0.,.92);
gl_FragColor=vec4(gc*glow*2.+vec3(.012,.01,.009)*m,m);}`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const m = new THREE.InstancedMesh(g, mat, DEC_N);
  m.frustumCulled = false;
  m.count = 0;
  m.renderOrder = 1;
  m.visible = false;
  scene.add(m);
  return { mesh: m, dd, next: 0, n: 0 };
})();
function decal(p, n, kind, size) {
  const i = decals.next;
  decals.next = (i + 1) % DEC_N;
  decals.n = Math.min(DEC_N, decals.n + 1);
  _cq.setFromUnitVectors(_cz, n);
  _cq.multiply(new THREE.Quaternion().setFromAxisAngle(_cz, rnd(0, 6.28)));
  _cf2.copy(p).addScaledVector(n, 0.012);
  _cm.compose(_cf2, _cq, _cs.setScalar(size));
  decals.mesh.setMatrixAt(i, _cm);
  decals.dd.setXYZW(i, CFX.t, kind, Math.random(), 0);
  decals.mesh.count = decals.n;
  decals.mesh.visible = true;
  decals.mesh.instanceMatrix.needsUpdate = true;
  decals.dd.needsUpdate = true;
}
/** the outward normal of the static surface a point lies on, or null (open air, a pilot) */
function surfNormal(p, out) {
  let best = 0.06,
    hit = false;
  for (const b of SOLID) {
    if (p.x < b.x0 - best || p.x > b.x1 + best || p.y < b.y0 - best || p.y > b.y1 + best) continue;
    if (p.z < b.z0 - best || p.z > b.z1 + best) continue;
    for (const [d, nx, ny, nz] of [
      [Math.abs(p.x - b.x0), -1, 0, 0],
      [Math.abs(p.x - b.x1), 1, 0, 0],
      [Math.abs(p.y - b.y0), 0, -1, 0],
      [Math.abs(p.y - b.y1), 0, 1, 0],
      [Math.abs(p.z - b.z0), 0, 0, -1],
      [Math.abs(p.z - b.z1), 0, 0, 1],
    ])
      if (d < best) {
        best = d;
        out.set(nx, ny, nz);
        hit = true;
      }
  }
  return hit ? out : null;
}
/* ---- hooks from fx.js ---- */
const _cn = new THREE.Vector3();
function onShotFx(a, b) {
  if (SET.dynLights)
    dynLight(_cf.copy(b).sub(a).normalize().multiplyScalar(0.4).add(a), 0xffc27a, 2.4, 0.07, 7);
  if (!fxOn()) return;
  const cam = camera.position;
  _cf.copy(b).sub(a).normalize();
  if (a.distanceToSquared(cam) < 625) ejectCasing(_cf2.copy(a).addScaledVector(_cf, -0.45), _cf);
  const n = surfNormal(b, _cn);
  if (!n) return;
  decal(b, n, 0, rnd(0.09, 0.15));
  /* sparks glance off the surface */
  const k = pc(5);
  for (let i = 0; i < k; i++) {
    const v = _cf
      .clone()
      .reflect(n)
      .multiplyScalar(rnd(3, 7))
      .add(new THREE.Vector3(rnd(-2, 2), rnd(-1, 2), rnd(-2, 2)));
    ptAdd(PTS.glow, b, v, rnd(0.04, 0.08), 0xffd08a, 1, rnd(0.12, 0.3), { g: 9 });
  }
  ptAdd(
    PTS.soft,
    _cf2.copy(b).addScaledVector(n, 0.1),
    n.clone().multiplyScalar(0.6),
    0.25,
    0x8a8178,
    0.4,
    0.6,
    {
      grow: 2,
      drag: 2,
    }
  );
}
function blastFx(p, color, r) {
  if (SET.dynLights) dynLight(p, 0xff9a48, 7, 0.5, r * 4);
  heatAt(p, r * 0.8, 1.2, 0.6);
  if (!fxOn()) return;
  /* fireball: hot core blooming outward, then embers and a smoke column */
  for (let i = 0, n = pc(8); i < n; i++)
    ptAdd(
      PTS.glow,
      p,
      new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1.2), rnd(-1, 1)).multiplyScalar(r * 0.9),
      r * rnd(0.35, 0.6),
      i < 3 ? 0xfff0c8 : 0xff7a2a,
      0.9,
      rnd(0.25, 0.45),
      { grow: 1.8, drag: 4 }
    );
  for (let i = 0, n = pc(12); i < n; i++)
    ptAdd(
      PTS.glow,
      p,
      new THREE.Vector3(rnd(-6, 6), rnd(2, 9), rnd(-6, 6)),
      rnd(0.05, 0.1),
      0xffa040,
      1,
      rnd(0.6, 1.2),
      {
        g: 9,
        drag: 0.6,
      }
    );
  for (let i = 0, n = pc(9); i < n; i++)
    ptAdd(
      PTS.soft,
      _cf.copy(p).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0, 0.6), rnd(-0.5, 0.5)).multiplyScalar(r * 0.5)),
      new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.8, 2.2), rnd(-0.6, 0.6)),
      r * rnd(0.4, 0.7),
      0x2c2826,
      0.55,
      rnd(1.8, 2.8),
      { grow: 0.7, drag: 0.9 }
    );
  /* debris tumbling out and bouncing */
  for (let i = 0, n = Math.round(pc(6)); i < n; i++)
    toss(
      chunks,
      p,
      new THREE.Vector3(rnd(-7, 7), rnd(3, 9), rnd(-7, 7)),
      new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)),
      rnd(1.4, 2.4),
      rnd(0.6, 1.4),
      14
    );
  /* scorch on the ground under it, or on the wall beside it */
  const gy = groundBelow(p.x, p.z, p.y + 0.4, 0.05);
  if (p.y - gy < 1.4) decal(_cf.set(p.x, gy, p.z), _cn.set(0, 1, 0), 1, r * 1.3);
  else {
    _cf.copy(p);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const t = rayWorld(p, _cf2.set(dx, 0, dz), 1.5);
      if (t < 1.5) {
        decal(_cf.copy(p).addScaledVector(_cf2, t), _cn.set(-dx, 0, -dz), 1, r);
        break;
      }
    }
  }
}
/* ---- melee impacts: what a blow or a charge sounds and looks like where it lands ----
   Whoever's game decides the blow (you, or the AI on the machine running it) calls meleeFx with the
   contact point, the swing direction and MFX flags; it plays here and goes to the room as an "mhit"
   fx, so everyone nearby hears it from where it landed. A whiff keeps the swing sound alone. */
const MFX = { WORLD: 1, CHARGE: 2, CRACK: 4, HEAVY: 8 };
/** the sound kind for a set of MFX flags */
function meleeSound(f) {
  if (f & MFX.WORLD) return f & MFX.CHARGE ? "cwall" : "mwall";
  return f & MFX.CHARGE ? "chit" : f & MFX.HEAVY ? "mkill" : "mhit";
}
function meleeImpact(p, dir, f) {
  const charge = f & MFX.CHARGE;
  sfxAt(meleeSound(f), p, charge ? 48 : 40, 1);
  if (f & MFX.CRACK && !(f & MFX.WORLD)) sfxAt("mcrack", p, 40, 0.9);
  if (!(f & MFX.WORLD)) return;
  /* sparks glance off the surface, with a puff of grit (Combat effects) */
  const n = surfNormal(p, _cn) || _cn.copy(dir).multiplyScalar(-1),
    dn = 2 * dir.dot(n);
  for (let i = 0, k = pc(charge ? 9 : 6); i < k; i++) {
    _cf.copy(dir).addScaledVector(n, -dn).multiplyScalar(rnd(2, 5));
    _cf.x += rnd(-2, 2);
    _cf.y += rnd(-0.5, 2.5);
    _cf.z += rnd(-2, 2);
    ptAdd(PTS.glow, p, _cf, rnd(0.04, 0.09), 0xffd08a, 1, rnd(0.12, 0.3), { g: 9 });
  }
  if (!fxOn()) return;
  for (let i = 0, k = pc(charge ? 4 : 2); i < k; i++) {
    _cf2.copy(n).multiplyScalar(rnd(0.4, 1.2));
    _cf2.x += rnd(-0.4, 0.4);
    _cf2.y += rnd(-0.6, 0.2);
    _cf2.z += rnd(-0.4, 0.4);
    ptAdd(
      PTS.soft,
      _cf.copy(p).addScaledVector(n, 0.08),
      _cf2,
      rnd(0.18, 0.3),
      0x8a8178,
      0.45,
      rnd(0.5, 0.8),
      {
        grow: 1.8,
        drag: 2.5,
        g: 1.5,
      }
    );
  }
  /* a charge knocks a chip loose (toss keeps the vectors it is given) */
  if (charge)
    toss(chunks, p, new THREE.Vector3(n.x * 3, 2.5, n.z * 3), new THREE.Vector3(9, 6, -7), 1.2, 0.35, 14);
}
/** play a melee impact here and send it to the room */
function meleeFx(p, dir, f) {
  meleeImpact(p, dir, f);
  emitFx("mhit", v3a(p), [r2(dir.x), r2(dir.y), r2(dir.z)], f);
}
const _mo = new THREE.Vector3(),
  _md = new THREE.Vector3();
/**
 * where a blow from this body meets the world within reach, or null: a ray from the chest along the
 * swing (looking down reaches the floor). Writes the point into out and the swing into dirOut.
 */
function meleeWorldHit(body, reach, out, dirOut) {
  const pitch = clamp(body.pitch, -1.1, 0.6),
    cp = Math.cos(pitch);
  _md.set(-Math.sin(body.yaw) * cp, Math.sin(pitch), -Math.cos(body.yaw) * cp).normalize();
  _mo.copy(body.pos);
  _mo.y += body.h * 0.72;
  const t = rayWorld(_mo, _md, reach);
  if (dirOut) dirOut.copy(_md);
  return t < reach ? out.copy(_mo).addScaledVector(_md, t) : null;
}
const _mc = new THREE.Vector3(),
  _mcd = new THREE.Vector3();
/** a body's physics bump (e: {ax, box}) while it charges: the shoulder meets the wall, heard and sent */
function chargeWallFx(body, e) {
  if (body.chargeT <= 0 || !e || !e.box) return;
  const s = e.box[e.ax + "0"] > body.pos[e.ax] ? 1 : -1;
  _mc.copy(body.pos);
  _mc.y += body.h * 0.6;
  _mc[e.ax] += s * R;
  _mcd.set(0, 0, 0)[e.ax] = s;
  meleeFx(_mc, _mcd, MFX.WORLD | MFX.CHARGE);
}
/** the point a blow lands on a pilot standing at `at`, struck from `from`: their chest, on your side */
function meleeContact(from, at, out) {
  out.set(from.x - at.x, 0, from.z - at.z);
  const l = out.length();
  if (l > 0.01) out.multiplyScalar(0.3 / l);
  out.x += at.x;
  out.z += at.z;
  out.y = at.y + 1.2;
  return out;
}
/* ---- sprint thrusters: a sprinting pilot's pack assists with a low burn (rig.jet, the glow is the
   rig's own); here, exhaust sparks streaming back from the nozzles (Combat effects, within 60 m), a
   breath of heat haze (Ultra) and a soft whoosh, louder as the sprint starts ---- */
const _jw = new THREE.Vector3(),
  _jv = new THREE.Vector3();
function sprintJets(rig) {
  const J = rig.jetS || (rig.jetS = { on: false, t: now, puff: 0, acc: 0, side: 0 });
  const dt = clamp(now - J.t, 0, 0.1),
    k = rig.jet;
  J.t = now;
  if (k <= 0) {
    J.on = false;
    return;
  }
  const p = rig.root.position;
  if (!J.on) {
    J.on = true;
    J.puff = 0.3;
    sfxAt("jetstart", p, 30, 0.3 + 0.4 * k);
  } else if ((J.puff -= dt) <= 0) {
    J.puff = 0.34;
    sfxAt("jet", p, 22, 0.5 + 0.3 * k);
  }
  const d2 = p.distanceToSquared(camera.position);
  if (d2 > 3600 || !fxOn()) return;
  J.acc = Math.min(J.acc + dt * 36 * k * SET.particles, 4);
  const yaw = rig.root.rotation.y,
    bx = Math.sin(yaw),
    bz = Math.cos(yaw);
  while (J.acc >= 1) {
    J.acc--;
    rig.jets[(J.side ^= 1)].getWorldPosition(_jw);
    _jv.set(bx * rnd(1.5, 3) + rnd(-0.3, 0.3), rnd(-2.2, -1), bz * rnd(1.5, 3) + rnd(-0.3, 0.3));
    ptAdd(PTS.glow, _jw, _jv, rnd(0.07, 0.14), 0xa8dcff, 0.85, rnd(0.1, 0.2), { drag: 3, grow: -0.3 });
  }
  /* a faint shimmer behind the pack, never crowding out explosions' haze */
  if (d2 < 900 && CFX.heat.length < 3)
    heatAt(_jw.set(p.x + bx * 0.45, p.y + 1, p.z + bz * 0.45), 0.35, 0.3 * k);
}
function updCombatFx(dt) {
  CFX.t += dt;
  decals.mesh.material.uniforms.uT.value = CFX.t;
  for (const l of CFX.lights) {
    const u = l.userData;
    if (u.life <= 0) {
      l.intensity = 0;
      continue;
    }
    u.life -= dt;
    l.intensity = u.i * Math.max(0, u.life / u.max) ** 1.5;
  }
  updTumblers(casings, dt);
  updTumblers(chunks, dt);
  for (let i = CFX.heat.length - 1; i >= 0; i--) {
    const h = CFX.heat[i];
    if (h.max && (h.life -= dt) <= 0) heatDone(i);
  }
}
onFrame(updCombatFx, { menu: true, full: true });
/* heat haze: the composite pass reads up to six sources a frame, projected to the screen; one-frame
   sources are used up here */
function heatUniforms() {
  const tanY = Math.tan((camera.fov * Math.PI) / 360);
  let n = 0;
  for (let i = CFX.heat.length - 1; i >= 0; i--) {
    const h = CFX.heat[i];
    if (n < 6) {
      _cf.copy(h.p).applyMatrix4(camera.matrixWorldInverse);
      if (_cf.z < -0.5) {
        const d = -_cf.z;
        _cf.applyMatrix4(camera.projectionMatrix);
        const k = h.max ? Math.max(0, h.life / h.max) : 1;
        HEAT_U[n++].set(_cf.x * 0.5 + 0.5, _cf.y * 0.5 + 0.5, (h.r / (d * tanY)) * 0.5, h.k * k);
      }
    }
    if (!h.max) heatDone(i);
  }
  for (let i = n; i < 6; i++) HEAT_U[i].set(0, 0, 0, 0);
  return n;
}
