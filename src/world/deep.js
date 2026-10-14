/* ============ DEEP: a map built on the sea floor (a map document's look: "deep") ============
   Hadal Station's look, for any map that asks for it:
   - set pieces (from dressMap): the pressure hull's frame arching over the whole map, big pipes along
     the wall tops, moon pools of dark water around the subs, and bubble columns rising out of them;
   - while such a map is showing (render/pipeline.js calls deepShow): the sky becomes the water
     column (render/renderer.js, SKY_DEEP), the fog turns teal and the dust motes become marine snow
     drifting down (render/atmosphere.js).
   Nothing here collides; the frame and pipes merge with the rest of the map's dressing. */
const DEEP_MATS = {
  frame: new THREE.MeshStandardMaterial({ color: "#2b3a42", roughness: 0.5, metalness: 0.75 }),
  water: new THREE.MeshStandardMaterial({
    color: "#06222a",
    emissive: "#05303a",
    roughness: 0.06,
    metalness: 0.3,
  }),
};
DEEP_MATS.frame.userData.envK = 1;
DEEP_MATS.water.userData.envK = 1.4;
/** the deep set pieces for a map document; add(mat, x, y, z, w, h, d, shadow) is dressMap's box helper */
function dressDeep(doc, add) {
  const B = doc.bounds,
    W = B.x1 - B.x0,
    D = B.z1 - B.z0,
    wx = B.x1 + 1.2;
  /* the hull's frame: a rib across the map every 12 m, on posts standing on the side walls, and a
     longeron along each wall top joining them */
  for (let z = B.z0 + 6; z < B.z1 - 3; z += 12) {
    add(DEEP_MATS.frame, 0, 11, z, W + 3.6, 0.7, 0.9, true);
    for (const s of [-1, 1]) add(DEEP_MATS.frame, s * wx, 7, z, 1, 4.7, 1);
  }
  for (const s of [-1, 1]) {
    add(DEEP_MATS.frame, s * wx, 10.6, 0, 1.1, 0.5, D + 2);
    /* a pressure pipe along the wall top, with collars */
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, D, 10), DEEP_MATS.frame);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(s * wx, 7.45, 0);
    MAPG.add(pipe);
    for (let z = B.z0 + 3; z < B.z1; z += 6) add(DRESS_MATS.trim, s * wx, 6.95, z, 1.05, 1, 0.3);
  }
  /* moon pools around the subs, each with a rim and a column of bubbles at both ends */
  const vents = [];
  for (const pc of mapPieces(doc).filter(p => /^hull~?$/.test(p.id))) {
    const [x, , z] = pc.p,
      [w, , d] = pc.s;
    add(DEEP_MATS.water, x, 0, z, w + 2.4, 0.02, d + 2.4);
    add(DRESS_MATS.trim, x, 0, z, w + 3, 0.012, d + 3);
    vents.push([x, z - d / 2 - 0.7], [x, z + d / 2 + 0.7]);
  }
  if (vents.length) MAPG.add(bubbles(vents));
}
/** rising bubbles over each [x, z] vent: one draw call, animated in the vertex shader */
function bubbles(vents) {
  const per = 40,
    n = vents.length * per,
    pos = new Float32Array(n * 3),
    seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, z] = vents[(i / per) | 0];
    pos.set([x + (Math.random() - 0.5) * 0.8, 0, z + (Math.random() - 0.5) * 0.8], i * 3);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { t: PROP_T, scale: { value: 500 } },
    vertexShader: `uniform float t;uniform float scale;attribute float seed;varying float vA;
void main(){float k=fract(seed*7.3+t*(.07+.05*seed));vec3 p=position;
p.y=k*12.;p.x+=sin(t*2.+seed*40.)*.15*k;p.z+=cos(t*1.7+seed*23.)*.15*k;
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
gl_PointSize=(.05+.08*seed)*(.6+k)*scale/max(-mv.z,.1);vA=smoothstep(0.,.08,k)*(1.-smoothstep(.75,1.,k));}`,
    fragmentShader: `varying float vA;
void main(){float r=length(gl_PointCoord-.5);float a=(smoothstep(.5,.38,r)-.7*smoothstep(.36,.2,r))*vA;
gl_FragColor=vec4(vec3(.6,.95,1.)*a,a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  const v2 = new THREE.Vector2();
  pts.onBeforeRender = (r, sc, cam) => {
    const rt = r.getRenderTarget();
    const h = rt ? rt.height : r.getDrawingBufferSize(v2).y;
    m.uniforms.scale.value = (h * 0.5) / Math.tan(((cam.fov || 60) * Math.PI) / 360);
  };
  return pts;
}
/* the deep sky, fog and snow follow whichever map is showing; the fog color is put back after */
let deepFog = null;
function deepShow(on) {
  if (!!SKY_DEEP.value === on) return;
  SKY_DEEP.value = on ? 1 : 0;
  if (on) {
    deepFog = scene.fog.color.getHex();
    scene.fog.color.set("#06232b");
  } else if (deepFog != null) scene.fog.color.setHex(deepFog);
}
