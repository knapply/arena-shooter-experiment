/* ============ renderer / scene ============ */
/* color management: three r128 takes hex and CSS colors as linear values, so after the final gamma step every
   color came out brighter and greyer than authored. Convert colors to linear once, where they are set. */
{
  const C = THREE.Color.prototype,
    setHex = C.setHex,
    setStyle = C.setStyle;
  let inStyle = false;
  C.setHex = function (h) {
    setHex.call(this, h);
    return inStyle ? this : this.convertSRGBToLinear();
  };
  C.setStyle = function (s) {
    inStyle = true;
    try {
      setStyle.call(this, s);
    } finally {
      inStyle = false;
    }
    return this.convertSRGBToLinear();
  };
}
const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#141e24");
scene.fog = new THREE.Fog("#141e24", 40, 120);
const camera = new THREE.PerspectiveCamera(78, 1, 0.03, 300);
scene.add(camera);
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (gfxReady) gfxResize();
}
addEventListener("resize", resize);
resize();

const hemi = new THREE.HemisphereLight(0xb4cbe0, 0x5a4a3c, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2c0, 2.3);
sun.position.set(30, 50, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 130 });
sun.shadow.bias = -0.0006;
scene.add(sun);
const _skyP = new THREE.Vector3();
/* sky tint: cutscenes grade the sky with the scene (1,1,1 is the normal sky) */
const skyTint = new THREE.Vector3(1, 1, 1);
{
  const g = new THREE.SphereGeometry(40, 32, 16);
  const m = new THREE.ShaderMaterial({
    uniforms: { tint: { value: skyTint } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader:
      "varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    /* dusk gradient, a ringed planet, stars and a faint nebula overhead, and a distant megacity
       skyline with lit windows along the horizon (all procedural, one draw call) */
    fragmentShader: `uniform vec3 tint;varying vec3 v;
float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}
void main(){vec3 d=normalize(v);float h=d.y;
vec3 lo=vec3(.07,.10,.13),mid=vec3(.36,.26,.24),hi=vec3(.04,.06,.11);
vec3 c=h<.08?mix(lo,mid,smoothstep(-.2,.08,h)):mix(mid,hi,smoothstep(.08,.6,h));
float az=atan(d.z,d.x);
/* nebula band and stars, fading in with height */
float up=smoothstep(.12,.55,h);
float neb=n2(vec2(az*3.,h*6.))*n2(vec2(az*7.+3.,h*11.));
c+=up*neb*vec3(.10,.05,.16)*1.6;
vec2 sg=vec2(az*160.,h*160.);float st=h1(floor(sg));
c+=up*step(.9965,st)*vec3(.9,.95,1.)*(.4+.6*h1(floor(sg)+7.));
/* the planet */
vec3 pd=normalize(vec3(-.55,.32,-.77));float pa=dot(d,pd);
float r=.12;float pr=sqrt(max(0.,1.-pa*pa));
if(pa>0.&&pr<r){float k=pr/r;vec3 n=normalize(d-pd*pa);
float lit=clamp(dot(n,normalize(vec3(.8,.4,.5)))*.8+.25,0.,1.);
float bands=.6+.4*sin(dot(d,vec3(0,1,0))*90.+n2(d.xz*40.)*3.);
c=mix(c,vec3(.55,.42,.36)*bands*lit,smoothstep(1.,.97,k));
c+=vec3(.35,.25,.2)*pow(k,8.)*.6;}
else if(pa>0.){c+=vec3(.25,.18,.14)*exp(-(pr-r)*60.)*.5;}
/* rings: a tilted ellipse around the planet */
vec3 ax=normalize(cross(pd,vec3(.25,1,0)));vec3 ay=normalize(cross(ax,pd));
vec2 q=vec2(dot(d,ax),dot(d,ay)*3.4);float rr=length(q);
if(pa>0.&&rr>.15&&rr<.25&&!(pr<r&&dot(d,ay)>0.)){c=mix(c,vec3(.62,.54,.48),.55*(.6+.4*sin(rr*260.))*smoothstep(.15,.16,rr)*smoothstep(.25,.24,rr));}
/* the skyline: towers and spires against the horizon glow, with windows */
float col=floor(az*38.);float th=.03+.045*pow(h1(vec2(col,1.)),2.)+.025*n2(vec2(az*6.,0.));
if(h1(vec2(col,5.))>.93)th+=.05;
if(h>-.05&&h<th){vec3 sk=vec3(.035,.045,.06);
vec2 w=vec2(az*240.,h*190.);float win=step(.84,h1(floor(w)))*smoothstep(.2,.4,fract(w.x))*smoothstep(.25,.45,fract(w.y));
sk+=win*mix(vec3(1.,.7,.35),vec3(.4,.8,1.),h1(vec2(col,3.)))*.4;
if(h>th-.004&&h1(vec2(col,9.))>.6)sk+=vec3(1.,.25,.2)*.9;
c=sk;}
gl_FragColor=vec4(pow(c,vec3(2.2))*1.5*tint,1.);}`,
  }); /* the sky follows whichever camera renders it and draws behind everything, so it is never clipped by the far plane */
  const sky = new THREE.Mesh(g, m);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.onBeforeRender = (r, sc, cam) => {
    sky.position.copy(cam.getWorldPosition(_skyP));
    sky.updateMatrixWorld();
    sky.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, sky.matrixWorld);
  };
  scene.add(sky);
}
