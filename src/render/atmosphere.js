/* ============ ATMOSPHERE: the air and light that make a map feel alive, at almost no cost ============
   - Dust motes: a few hundred specks drifting in the light around you. One draw call; the drift is
     done in the vertex shader (each speck wraps around a box that follows the camera), so the CPU
     never touches them.
   - Searchlights over the city: drawn by the sky shader itself (SKY_TIME drives their sweep), so
     they cost nothing extra.
   - Breathing lights: the light strips and guide lights pulse gently, each at its own pace.
   Particles scale with the Particles setting; everything here is visual only. */
const ATMO = { motes: null, strips: null, t: 0 };
const MOTE_BOX = 16;
function makeMotes() {
  const n = Math.round(420 * Math.min(1.5, SET.particles));
  if (n <= 0) return null;
  const pos = new Float32Array(n * 3),
    seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = Math.random() * MOTE_BOX * 2;
    pos[i * 3 + 1] = Math.random() * MOTE_BOX * 2;
    pos[i * 3 + 2] = Math.random() * MOTE_BOX * 2;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      t: { value: 0 },
      cam: { value: new THREE.Vector3() },
      box: { value: MOTE_BOX },
      deep: SKY_DEEP,
      scale: { value: 500 },
      map: { value: SOFT },
    },
    vertexShader: `uniform float t;uniform vec3 cam;uniform float box;uniform float scale;uniform float deep;attribute float seed;varying float vA;
void main(){
  /* slow drift with a little sway, wrapped into a box around the camera */
  vec3 drift=vec3(.18+.12*seed,.05*sin(t*.4+seed*20.),.1-.2*seed)*t;
  /* under the sea: marine snow, sinking */
  drift=mix(drift,vec3(.04*sin(t*.3+seed*9.),-.12-.1*seed,.03)*t,deep);
  vec3 sway=vec3(sin(t*.7+seed*31.),cos(t*.5+seed*17.),sin(t*.6+seed*11.))*.25;
  vec3 p=mod(position+drift-cam+box,2.*box)-box+cam+sway;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  float d=-mv.z;
  gl_PointSize=(.035+.03*seed)*scale/max(d,.1);
  /* fade near the camera and toward the box edge, and twinkle */
  vA=smoothstep(.6,2.5,d)*(1.-smoothstep(box*.55,box,length(p-cam)))*(.55+.45*sin(t*(1.+seed*2.)+seed*40.));
}`,
    fragmentShader: `uniform sampler2D map;varying float vA;
uniform float deep;void main(){float a=texture2D(map,gl_PointCoord).a*vA*.55;gl_FragColor=vec4(mix(vec3(1.,.93,.82),vec3(.7,.95,1.),deep)*a,a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.onBeforeRender = (r, sc, cam) => {
    const rt = r.getRenderTarget();
    const h = rt ? rt.height : r.getDrawingBufferSize(_ptV2).y;
    m.uniforms.scale.value = (h * 0.5) / Math.tan(((cam.fov || 60) * Math.PI) / 360);
    cam.getWorldPosition(m.uniforms.cam.value);
  };
  scene.add(pts);
  return pts;
}
function updAtmosphere(dt) {
  ATMO.t += dt;
  SKY_TIME.value = ATMO.t;
  PROP_T.value = ATMO.t;
  /* the dust: made on first use, remade when the Particles setting changes */
  const want = Math.round(420 * Math.min(1.5, SET.particles));
  if (!ATMO.motes || ATMO.motes.geometry.attributes.position.count !== want) {
    if (ATMO.motes) {
      scene.remove(ATMO.motes);
      ATMO.motes.geometry.dispose();
      ATMO.motes.material.dispose();
    }
    ATMO.motes = makeMotes();
  }
  if (ATMO.motes) ATMO.motes.material.uniforms.t.value = ATMO.t;
  /* the light strips breathe, each material at its own pace */
  if (!ATMO.strips)
    ATMO.strips = Object.keys(MATS)
      .filter(k => /strip/i.test(k) && MATS[k].color)
      .map((k, i) => ({ m: MATS[k], base: MATS[k].color.clone(), ph: i * 1.7 }));
  for (const s of ATMO.strips)
    s.m.color.copy(s.base).multiplyScalar(1 + 0.09 * Math.sin(ATMO.t * (0.9 + s.ph * 0.13) + s.ph));
}
onFrame(updAtmosphere, { menu: true, full: true });
