/* ============ graphics pipeline: scaled scene -> bloom -> composite (ACES, FXAA, sharpen, grade) ============ */
var gfxReady = false;
const GFX = {
  on: true,
  rt: null,
  b1: null,
  b2: null,
  w: 1,
  h: 1,
  dyn: 1,
  webgl2: !!renderer.capabilities.isWebGL2,
  cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  env: null,
  failed: false,
  lastKey: "",
  b3: null,
  b4: null,
  /* half-resolution occlusion (ao1, ao2) and wet-floor reflections (ssr), quarter-resolution light shafts (sh) */
  ssr: null,
  ao1: null,
  ao2: null,
  sh: null,
  /* cinematic look (trailer and cutscenes): see CINE.look */
  look: null,
};
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputEncoding = THREE.LinearEncoding;
const FSV = "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
const brightMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, th: { value: 0.9 } },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader:
    "uniform sampler2D t;uniform float th;varying vec2 vUv;void main(){vec3 c=texture2D(t,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(th,th+.55,l),1.);}",
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader:
    "uniform sampler2D t;uniform vec2 dir;varying vec2 vUv;void main(){vec3 c=texture2D(t,vUv).rgb*.227027;c+=texture2D(t,vUv+dir*1.3846).rgb*.316216;c+=texture2D(t,vUv-dir*1.3846).rgb*.316216;c+=texture2D(t,vUv+dir*3.2308).rgb*.07027;c+=texture2D(t,vUv-dir*3.2308).rgb*.07027;gl_FragColor=vec4(c,1.);}",
});
/* depth of field: each pixel's color weighted by how out of focus it is (alpha = weight), so sharp
   foreground subjects don't bleed into the blurred background */
const DOF_COC =
  "uniform sampler2D tD;uniform vec4 dof;uniform vec2 clip;float lz(vec2 uv){float d=texture2D(tD,uv).x;return clip.x*clip.y/(clip.y-d*(clip.y-clip.x));}float coc(vec2 uv){float z=lz(uv);float k=clamp(abs(z-dof.y)/dof.z,0.,1.);if(z<dof.y)k=min(1.,k*(1.+dof.w));return smoothstep(0.,1.,k);}";
const cocMat = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: null },
    tD: { value: null },
    dof: { value: new THREE.Vector4() },
    clip: { value: new THREE.Vector2(0.1, 500) },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader:
    "uniform sampler2D t;varying vec2 vUv;" +
    DOF_COC +
    "void main(){float k=coc(vUv);gl_FragColor=vec4(texture2D(t,vUv).rgb*k,k);}",
});
const blur4Mat = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader:
    "uniform sampler2D t;uniform vec2 dir;varying vec2 vUv;void main(){vec4 c=texture2D(t,vUv)*.227027;c+=texture2D(t,vUv+dir*1.3846)*.316216;c+=texture2D(t,vUv-dir*1.3846)*.316216;c+=texture2D(t,vUv+dir*3.2308)*.07027;c+=texture2D(t,vUv-dir*3.2308)*.07027;gl_FragColor=c;}",
});
/* screen-space ambient occlusion at half resolution: view positions rebuilt from depth, normals from
   the flatter side of each pixel's neighbours, ten samples on a rotated spiral within `rad` metres */
const VIEWPOS =
  "uniform sampler2D tD;uniform vec2 clip;uniform vec2 proj;float lz(vec2 uv){float d=texture2D(tD,uv).x;return clip.x*clip.y/(clip.y-d*(clip.y-clip.x));}vec3 vp(vec2 uv){float z=lz(uv);return vec3((uv*2.-1.)*proj*z,-z);}";
const ssaoMat = new THREE.ShaderMaterial({
  uniforms: {
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    texel: { value: new THREE.Vector2(1, 1) },
    rad: { value: 1.1 },
    k: { value: 1.25 },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform vec2 texel;uniform float rad;uniform float k;varying vec2 vUv;${VIEWPOS}
void main(){if(texture2D(tD,vUv).x>=1.){gl_FragColor=vec4(1.);return;}
vec3 P=vp(vUv);
vec3 r=vp(vUv+vec2(texel.x,0.)),l=vp(vUv-vec2(texel.x,0.)),u=vp(vUv+vec2(0.,texel.y)),b=vp(vUv-vec2(0.,texel.y));
vec3 dx=abs(r.z-P.z)<abs(P.z-l.z)?r-P:P-l;vec3 dy=abs(u.z-P.z)<abs(P.z-b.z)?u-P:P-b;
vec3 N=normalize(cross(dx,dy));
vec2 sr=rad/(-P.z*proj)*.5;
float a0=6.2831*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
float ao=0.;
for(int i=0;i<10;i++){float f=(float(i)+.6)/10.;float a=a0+float(i)*2.39996;
vec3 v=vp(vUv+vec2(cos(a),sin(a))*sr*f)-P;float L=length(v);
ao+=max(0.,dot(v,N)/max(L,1e-4)-.08)*(1.-smoothstep(rad*.6,rad*1.6,L));}
ao=clamp(1.-ao*k/10.,0.,1.);
gl_FragColor=vec4(vec3(ao*ao),1.);}`,
});
/* edge-aware blur of the occlusion: neighbours at a different depth don't bleed across */
const aoBlurMat = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: null },
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    dir: { value: new THREE.Vector2() },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D t;uniform vec2 dir;varying vec2 vUv;${VIEWPOS}
void main(){float z0=lz(vUv);float s=texture2D(t,vUv).r,w=1.;
for(int i=-3;i<=3;i++){if(i==0)continue;vec2 uv=vUv+dir*float(i);
float wi=exp(-abs(lz(uv)-z0)/(z0*.04+.02))*(1.-abs(float(i))*.2);s+=texture2D(t,uv).r*wi;w+=wi;}
gl_FragColor=vec4(vec3(s/w),1.);}`,
});
/* light shafts: march from each pixel toward the sun through the sky (alpha 0 in the scene target),
   so walls and towers cut the rays */
const shaftMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, sunUv: { value: new THREE.Vector2() }, vis: { value: 0 } },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D t;uniform vec2 sunUv;uniform float vis;varying vec2 vUv;
void main(){vec2 st=(sunUv-vUv)/36.;vec2 uv=vUv;vec3 acc=vec3(0.);float dec=1.;
for(int i=0;i<36;i++){vec4 s=texture2D(t,uv);acc+=min(max(s.rgb-.3,0.),vec3(6.))*(1.-smoothstep(0.,.2,s.a))*dec;dec*=.97;uv+=st;}
gl_FragColor=vec4(acc*vis/36.,1.);}`,
});
/* screen-space reflections on wet floor (Ultra): the floor shader leaves its wetness in the scene's
   alpha; each wet pixel marches its reflected view ray through the depth buffer and takes the color it
   hits, fading at the screen's edges */
const ssrMat = new THREE.ShaderMaterial({
  uniforms: {
    tS: { value: null },
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    pm: { value: new THREE.Matrix4() },
    upV: { value: new THREE.Vector3() },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D tS;uniform mat4 pm;uniform vec3 upV;varying vec2 vUv;${VIEWPOS}
void main(){float a=texture2D(tS,vUv).a;float w=clamp((1.-a)*2.,0.,1.);
if(a<.25||w<.05){gl_FragColor=vec4(0.);return;}
vec3 P=vp(vUv);vec3 V=normalize(P);vec3 R=reflect(V,upV);
float fres=.06+.94*pow(1.-max(dot(-V,upV),0.),5.);
float st=.18-P.z*.015;vec3 Q=P+R*st*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));vec3 hit=vec3(0.);float found=0.;
for(int i=0;i<32;i++){Q+=R*st;st*=1.1;vec4 c=pm*vec4(Q,1.);vec2 uv=c.xy/c.w*.5+.5;
if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.||Q.z>-.05)break;
float dz=-Q.z-lz(uv);
if(dz>0.&&dz<st*2.5+.15){hit=texture2D(tS,uv).rgb;vec2 e=abs(uv-.5)*2.;found=(1.-smoothstep(.8,1.,max(e.x,e.y)))*(1.-float(i)/32.);break;}}
gl_FragColor=vec4(min(hit,vec3(8.))*found*w*fres,1.);}`,
});
/* each map's own color mood, applied after tone mapping: shadow tint (lift), highlight tint (gain),
   vibrance. Picked by whichever map group is showing (MAP_GROUPS, world/bake.js). */
const MAP_GRADE = {
  arena: { lift: [-0.012, 0.008, 0.03], gain: [1.05, 1.0, 0.94], vib: 0.18 },
  "twin-foundry": { lift: [0.018, -0.004, 0.04], gain: [1.06, 0.98, 0.9], vib: 0.22 },
};
/* heat haze sources for the composite pass, filled by heatUniforms (render/combat-fx.js) */
const HEAT_U = Array.from({ length: 6 }, () => new THREE.Vector4());
const compMat = new THREE.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  vertexShader: FSV,
  uniforms: {
    tS: { value: null },
    tB: { value: null },
    texel: { value: new THREE.Vector2(1, 1) },
    fx: { value: 1 },
    sharp: { value: 0.3 },
    bloom: { value: 0.7 },
    expo: { value: 1 },
    sat: { value: 1 },
    vig: { value: 0.3 },
    grain: { value: 0.04 },
    time: { value: 0 },
    /* cinematic look: depth of field (needs tD and tF), split-tone grade, lens fringing, anamorphic streaks */
    cine: { value: 0 },
    tD: { value: null },
    tF: { value: null },
    dof: { value: new THREE.Vector4(0, 10, 6, 0) },
    clip: { value: new THREE.Vector2(0.1, 500) },
    grade: { value: 0 },
    ca: { value: 0 },
    streak: { value: 0 },
    /* ambient occlusion, light shafts and the map's grade */
    tA: { value: null },
    aoK: { value: 0 },
    tR: { value: null },
    ssrK: { value: 0 },
    tSh: { value: null },
    shaftK: { value: 0 },
    gOn: { value: 0 },
    gLift: { value: new THREE.Vector3() },
    gGain: { value: new THREE.Vector3(1, 1, 1) },
    gVib: { value: 0 },
    /* heat haze: up to six sources (screen uv, radius, strength), see render/combat-fx.js */
    heat: { value: HEAT_U },
    heatN: { value: 0 },
    hT: { value: 0 },
    aspect: { value: 1 },
  },
  fragmentShader: [
    "uniform sampler2D tS;uniform sampler2D tB;uniform vec2 texel;uniform float fx;uniform float sharp;uniform float bloom;uniform float expo;uniform float sat;uniform float vig;uniform float grain;uniform float time;varying vec2 vUv;",
    "uniform float cine;uniform sampler2D tF;uniform float grade;uniform float ca;uniform float streak;",
    "uniform vec4 heat[6];uniform float heatN;uniform float hT;uniform float aspect;uniform sampler2D tR;uniform float ssrK;uniform sampler2D tA;uniform float aoK;uniform sampler2D tSh;uniform float shaftK;uniform float gOn;uniform vec3 gLift;uniform vec3 gGain;uniform float gVib;",
    DOF_COC,
    "vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}",
    "float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}",
    "vec3 S(vec2 uv){return aces(texture2D(tS,uv).rgb*expo);}",
    "vec3 fxaa(vec2 uv){vec3 nw=S(uv+vec2(-1.,-1.)*texel),ne=S(uv+vec2(1.,-1.)*texel),sw=S(uv+vec2(-1.,1.)*texel),se=S(uv+vec2(1.,1.)*texel),m=S(uv);",
    " float lnw=luma(nw),lne=luma(ne),lsw=luma(sw),lse=luma(se),lm=luma(m);float lmin=min(lm,min(min(lnw,lne),min(lsw,lse))),lmax=max(lm,max(max(lnw,lne),max(lsw,lse)));",
    " vec2 d=vec2(-((lnw+lne)-(lsw+lse)),(lnw+lsw)-(lne+lse));float red=max((lnw+lne+lsw+lse)*.03125,.0078125);float rcp=1./(min(abs(d.x),abs(d.y))+red);",
    " d=clamp(d*rcp,vec2(-8.),vec2(8.))*texel;vec3 a=.5*(S(uv+d*(-1./6.))+S(uv+d*(1./6.)));vec3 b=a*.5+.25*(S(uv-d*.5)+S(uv+d*.5));float lb=luma(b);",
    " if(lb<lmin||lb>lmax)return a;return b;}",
    "void main(){vec2 uv=vUv;",
    " if(heatN>0.)for(int i=0;i<6;i++){vec4 h=heat[i];if(h.w<=0.)continue;vec2 d=(uv-h.xy)*vec2(aspect,1.);float f=h.w*(1.-smoothstep(0.,h.z,length(d)));uv+=f*.004*vec2(sin(uv.y*140.+hT*31.+float(i)),cos(uv.x*120.-hT*27.));}",
    " vec3 c=fx>.5?fxaa(uv):S(uv);",
    " if(sharp>.001){vec3 n=S(uv-vec2(0.,texel.y)),s=S(uv+vec2(0.,texel.y)),e=S(uv+vec2(texel.x,0.)),w=S(uv-vec2(texel.x,0.));vec3 mn=min(c,min(min(n,s),min(e,w))),mx=max(c,max(max(n,s),max(e,w)));c=clamp(c+(4.*c-n-s-e-w)*sharp*.3,mn,mx);}",
    " vec2 q=uv-.5;",
    " if(cine>.5){",
    /* lens fringing: red and blue sampled apart toward the frame edges */
    "  if(ca>0.){vec2 o2=q*dot(q,q)*ca;c.r=S(uv+o2).r;c.b=S(uv-o2).b;}",
    /* depth of field: blend toward a blurred copy by circle of confusion (dof = amount, focus m, range m, near blur) */
    "  if(dof.x>0.){vec4 F=texture2D(tF,uv);float k=coc(uv)*dof.x*smoothstep(0.,.25,F.a);c=mix(c,aces(F.rgb/max(F.a,.001)*expo),k);}",
    /* anamorphic streaks: bloom smeared sideways, tinted cool */
    "  if(streak>0.){vec3 s2=vec3(0.);for(int i=1;i<7;i++){float f=float(i)*.022;s2+=(texture2D(tB,uv+vec2(f,0.)).rgb+texture2D(tB,uv-vec2(f,0.)).rgb)*(1.-float(i)/7.);}c+=aces(s2*expo*.18)*vec3(.55,.8,1.)*streak;}",
    " }",
    /* occlusion darkens everything but what glows */
    " if(aoK>0.){float a=texture2D(tA,uv).r;c*=mix(1.,a,aoK*(1.-smoothstep(.75,1.,luma(c))));}",
    " if(ssrK>0.)c+=aces(texture2D(tR,uv).rgb*expo)*ssrK;",
    " if(shaftK>0.)c+=aces(texture2D(tSh,uv).rgb*expo)*vec3(1.,.86,.66)*shaftK;",
    " c+=aces(texture2D(tB,uv).rgb*expo)*bloom;",
    " float l=luma(c);c=max(mix(vec3(l),c,sat),0.);",
    " c*=1.-vig*smoothstep(.3,.95,length(q)*1.25);",
    " float g=fract(sin(dot(uv+fract(time),vec2(12.9898,78.233)))*43758.5453);vec3 o=pow(clamp(c,0.,1.),vec3(1./2.2));",
    /* split-tone grade: cool shadows, warm highlights, a gentle S-curve */
    " if(cine>.5&&grade>0.){float L=luma(o);o+=grade*((1.-L)*(1.-L)*vec3(-.035,.012,.05)+L*L*vec3(.05,.012,-.045));o=mix(o,o*o*(3.-2.*o),grade*.35);}",
    " if(gOn>.5){o=o*gGain+gLift*(1.-o);float L=luma(o),mx=max(o.r,max(o.g,o.b)),mn=min(o.r,min(o.g,o.b));o=mix(vec3(L),o,1.+gVib*(1.-(mx-mn)));}",
    " gl_FragColor=vec4(o+(g-.5)*grain*.6,1.);}" /* grain after gamma so dark areas are not swamped by noise */,
  ].join("\n"),
});
const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat);
fsQuad.frustumCulled = false;
const fsScene = new THREE.Scene();
fsScene.add(fsQuad);
const UPS = { native: 1, quality: 0.77, balanced: 0.67, performance: 0.5, ultraperf: 0.33 };
function gfxScale() {
  return Math.max(0.25, Math.min(2, (UPS[SET.upscale] || 1) * SET.renderScale * GFX.dyn));
}
function gfxResize() {
  const W = Math.max(1, renderer.domElement.width),
    H = Math.max(1, renderer.domElement.height);
  const s = gfxScale();
  const w = Math.max(1, Math.round(W * s)),
    h = Math.max(1, Math.round(H * s));
  const msaa = SET.aa === "msaa" && GFX.webgl2 && THREE.WebGLMultisampleRenderTarget;
  const wantDof = !!(GFX.look && GFX.look.dof > 0) && GFX.webgl2;
  const wantAo = SET.ao === "ssao" && GFX.webgl2,
    wantSh = !!SET.lightShafts,
    wantSsr = SET.reflections === "ssr" && GFX.webgl2;
  /* the scene's depth as a texture (depth of field, occlusion); WebGL2 resolves it from MSAA too */
  const wantDepth = wantDof || wantAo || wantSsr;
  const key =
    w +
    "x" +
    h +
    (msaa ? "m" : "") +
    (SET.bloom > 0 ? "b" : "") +
    (wantDof ? "d" : "") +
    (wantAo ? "a" : "") +
    (wantSh ? "s" : "") +
    (wantSsr ? "r" : "");
  if (key === GFX.lastKey && GFX.rt) return;
  GFX.lastKey = key;
  for (const k of ["rt", "b1", "b2", "b3", "b4", "ao1", "ao2", "sh", "ssr"])
    if (GFX[k]) {
      GFX[k].dispose();
      GFX[k] = null;
    }
  const opt = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: GFX.webgl2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  };
  try {
    GFX.rt = msaa
      ? new THREE.WebGLMultisampleRenderTarget(w, h, opt)
      : new THREE.WebGLRenderTarget(w, h, opt);
    if (msaa) GFX.rt.samples = 4;
    if (wantDepth) {
      GFX.rt.depthTexture = new THREE.DepthTexture(w, h);
      GFX.rt.depthTexture.type = THREE.UnsignedIntType;
    }
    const bo = Object.assign({}, opt, { depthBuffer: false });
    const bw = Math.max(1, w >> 2),
      bh = Math.max(1, h >> 2);
    GFX.b1 = new THREE.WebGLRenderTarget(bw, bh, bo);
    GFX.b2 = new THREE.WebGLRenderTarget(bw, bh, bo);
    if (wantAo) {
      const ao = Object.assign({}, bo, { type: THREE.UnsignedByteType });
      GFX.ao1 = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), ao);
      GFX.ao2 = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), ao);
    }
    if (wantSh) GFX.sh = new THREE.WebGLRenderTarget(bw, bh, bo);
    if (wantSsr) GFX.ssr = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), bo);
    if (wantDof) {
      const fw = Math.max(1, w >> 1),
        fh = Math.max(1, h >> 1);
      GFX.b3 = new THREE.WebGLRenderTarget(fw, fh, bo);
      GFX.b4 = new THREE.WebGLRenderTarget(fw, fh, bo);
    }
  } catch (e) {
    GFX.on = false;
  }
  GFX.w = w;
  GFX.h = h;
  compMat.uniforms.texel.value.set(1 / w, 1 / h);
}
const _sunS = new THREE.Vector3(),
  _sunF = new THREE.Vector3();
function fsPass(mat, target) {
  fsQuad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(fsScene, GFX.cam);
}
/* if the post shaders fail to compile on this GPU, fall back to plain rendering instead of a black screen */
let gfxChecked = false;
function renderFrame() {
  const tr = performance.now();
  if (!GFX.on || !GFX.rt) {
    renderer.setRenderTarget(null);
    if (GPUQ) GPUQ.begin("scene");
    renderer.render(scene, camera);
    if (GPUQ) GPUQ.end();
    PERF.renderCpu += performance.now() - tr;
    return;
  }
  let errs = 0;
  const oe = console.error;
  if (!gfxChecked)
    console.error = function () {
      errs++;
      return oe.apply(console, arguments);
    };
  try {
    renderer.setRenderTarget(GFX.rt);
    if (GPUQ) GPUQ.begin("scene");
    renderer.render(scene, camera);
    if (GPUQ) GPUQ.end();
    const tp = performance.now();
    PERF.renderCpu += tp - tr;
    const U = compMat.uniforms;
    /* occlusion: half resolution, then blurred across and down without crossing depth edges */
    U.aoK.value = 0;
    if (GFX.ao1 && GFX.rt.depthTexture) {
      if (GPUQ) GPUQ.begin("ssao");
      const tanY = Math.tan((camera.fov * Math.PI) / 360);
      for (const M of [ssaoMat, aoBlurMat]) {
        M.uniforms.tD.value = GFX.rt.depthTexture;
        M.uniforms.clip.value.set(camera.near, camera.far);
        M.uniforms.proj.value.set(tanY * camera.aspect, tanY);
      }
      ssaoMat.uniforms.texel.value.set(1 / GFX.ao1.width, 1 / GFX.ao1.height);
      fsPass(ssaoMat, GFX.ao1);
      aoBlurMat.uniforms.t.value = GFX.ao1.texture;
      aoBlurMat.uniforms.dir.value.set(1 / GFX.ao1.width, 0);
      fsPass(aoBlurMat, GFX.ao2);
      aoBlurMat.uniforms.t.value = GFX.ao2.texture;
      aoBlurMat.uniforms.dir.value.set(0, 1 / GFX.ao1.height);
      fsPass(aoBlurMat, GFX.ao1);
      U.tA.value = GFX.ao1.texture;
      U.aoK.value = 0.85;
      if (GPUQ) GPUQ.end();
    }
    U.ssrK.value = 0;
    if (GFX.ssr && GFX.rt.depthTexture) {
      if (GPUQ) GPUQ.begin("ssr");
      const tanY = Math.tan((camera.fov * Math.PI) / 360),
        M = ssrMat.uniforms;
      M.tS.value = GFX.rt.texture;
      M.tD.value = GFX.rt.depthTexture;
      M.clip.value.set(camera.near, camera.far);
      M.proj.value.set(tanY * camera.aspect, tanY);
      M.pm.value.copy(camera.projectionMatrix);
      M.upV.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      fsPass(ssrMat, GFX.ssr);
      U.tR.value = GFX.ssr.texture;
      U.ssrK.value = 0.9;
      if (GPUQ) GPUQ.end();
    }
    /* light shafts: only while the sun is in front of the camera */
    U.shaftK.value = 0;
    if (GFX.sh) {
      _sunS.copy(sun.position).normalize();
      camera.getWorldDirection(_sunF);
      const facing = _sunS.dot(_sunF);
      if (facing > 0.1) {
        _sunS.multiplyScalar(100).add(camera.getWorldPosition(_sunF)).project(camera);
        const off = Math.max(Math.abs(_sunS.x), Math.abs(_sunS.y));
        const vis = Math.min(1, (facing - 0.1) * 2.5) * (1 - Math.min(1, Math.max(0, off - 1) / 1.2));
        if (vis > 0.01) {
          if (GPUQ) GPUQ.begin("shafts");
          shaftMat.uniforms.t.value = GFX.rt.texture;
          shaftMat.uniforms.sunUv.value.set(_sunS.x * 0.5 + 0.5, _sunS.y * 0.5 + 0.5);
          shaftMat.uniforms.vis.value = vis;
          fsPass(shaftMat, GFX.sh);
          U.tSh.value = GFX.sh.texture;
          U.shaftK.value = 1.5;
          if (GPUQ) GPUQ.end();
        }
      }
    }
    /* the showing map: its markings and its grade */
    const cur = MAP_GROUPS.find(m => m.g.visible && m.g.parent);
    if (cur && cur.mark) {
      SURF_U.surfMark.value = cur.mark.tex;
      SURF_U.surfMarkB.value.copy(cur.mark.b);
    }
    const gr = SET.grade && !GFX.look && cur && MAP_GRADE[cur.id];
    U.gOn.value = gr ? 1 : 0;
    if (gr) {
      U.gLift.value.fromArray(gr.lift);
      U.gGain.value.fromArray(gr.gain);
      U.gVib.value = gr.vib;
    }
    if (GPUQ) GPUQ.begin("bloom");
    if (SET.bloom > 0) {
      brightMat.uniforms.t.value = GFX.rt.texture;
      fsPass(brightMat, GFX.b1);
      for (let i = 0; i < 2; i++) {
        blurMat.uniforms.t.value = GFX.b1.texture;
        blurMat.uniforms.dir.value.set(1 / GFX.b1.width, 0);
        fsPass(blurMat, GFX.b2);
        blurMat.uniforms.t.value = GFX.b2.texture;
        blurMat.uniforms.dir.value.set(0, 1 / GFX.b1.height);
        fsPass(blurMat, GFX.b1);
      }
    }
    if (GPUQ) GPUQ.end();
    const L = GFX.look;
    U.cine.value = L ? 1 : 0;
    if (L) {
      const dofOn = L.dof > 0 && !!GFX.b3 && !!GFX.rt.depthTexture;
      if (dofOn) {
        /* a half-resolution blurred copy of the out-of-focus parts of the scene */
        const C = cocMat.uniforms;
        C.t.value = GFX.rt.texture;
        C.tD.value = GFX.rt.depthTexture;
        C.dof.value.set(1, L.focus || 10, L.range || 6, L.near == null ? 1 : L.near);
        C.clip.value.set(camera.near, camera.far);
        fsPass(cocMat, GFX.b3);
        for (let i = 0; i < 2; i++) {
          blur4Mat.uniforms.t.value = GFX.b3.texture;
          blur4Mat.uniforms.dir.value.set((1.6 + i) / GFX.b3.width, 0);
          fsPass(blur4Mat, GFX.b4);
          blur4Mat.uniforms.t.value = GFX.b4.texture;
          blur4Mat.uniforms.dir.value.set(0, (1.6 + i) / GFX.b3.height);
          fsPass(blur4Mat, GFX.b3);
        }
        U.tD.value = GFX.rt.depthTexture;
        U.tF.value = GFX.b3.texture;
      }
      U.dof.value.set(dofOn ? L.dof : 0, L.focus || 10, L.range || 6, L.near == null ? 1 : L.near);
      U.clip.value.set(camera.near, camera.far);
      U.grade.value = L.grade || 0;
      U.ca.value = L.ca || 0;
      U.streak.value = SET.bloom > 0 ? L.streak || 0 : 0;
    }
    if (GPUQ) GPUQ.begin("comp");
    U.tS.value = GFX.rt.texture;
    U.tB.value = GFX.b1.texture;
    U.fx.value = SET.aa === "fxaa" ? 1 : 0;
    U.bloom.value = SET.bloom;
    U.expo.value = SET.exposure;
    U.sat.value = SET.saturation;
    U.vig.value = SET.vignette;
    U.grain.value = SET.grain;
    const up = gfxScale() < 0.97;
    U.sharp.value = SET.sharpen * (up ? 1.3 : 1);
    U.time.value = (U.time.value + 0.0173) % 1;
    U.heatN.value = SET.fxDetail === "ultra" && !L ? heatUniforms() : (CFX.heat.length = 0);
    U.hT.value = CFX.t;
    U.aspect.value = GFX.w / GFX.h;
    fsPass(compMat, null);
    if (GPUQ) GPUQ.end();
    PERF.postCpu += performance.now() - tp;
    exposureCheck();
  } catch (e) {
    errs++;
  } finally {
    if (!gfxChecked) {
      console.error = oe;
      gfxChecked = true;
      if (errs) {
        GFX.on = false;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputEncoding = THREE.sRGBEncoding;
        recompileAll();
        toast("Effects disabled on this GPU");
      }
    }
  }
}
/* safety net: if the center of the screen is pure white after rendering starts, back off the effects */
let gfxFrames = 0;
const pxBuf = new Uint8Array(256);
function exposureCheck() {
  gfxFrames++;
  if (gfxFrames !== 90 && gfxFrames !== 240) return;
  try {
    const gl = renderer.getContext(),
      w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    gl.readPixels((w >> 1) - 4, (h >> 1) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, pxBuf);
    let sum = 0;
    for (let i = 0; i < 256; i += 4) sum += pxBuf[i] + pxBuf[i + 1] + pxBuf[i + 2];
    const avg = sum / 192;
    if (avg > 248) {
      if (SET.reflections !== "off") {
        SET.reflections = "off";
        applySettings();
        saveSettings();
        toast("Reflections off: the scene was overexposed");
        gfxFrames = 100;
      } else {
        GFX.on = false;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputEncoding = THREE.sRGBEncoding;
        recompileAll();
        toast("Effects off: the scene was overexposed");
      }
    }
  } catch (e) {}
}
function recompileAll() {
  scene.traverse(o => {
    const m = o.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true));
  });
}
/* soft sprite textures (particles were square before) */
function radialTex(size, stops) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}
const SOFT = radialTex(64, [
    [0, 1],
    [0.35, 0.75],
    [1, 0],
  ]),
  SMOKE = radialTex(64, [
    [0, 0.85],
    [0.5, 0.4],
    [1, 0],
  ]);
const STAR = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.translate(32, 32);
  for (let i = 0; i < 6; i++) {
    x.rotate(Math.PI / 3);
    const g = x.createLinearGradient(0, 0, 30, 0);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, -4);
    x.lineTo(30, 0);
    x.lineTo(0, 4);
    x.fill();
  }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 14);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(-14, -14, 28, 28);
  return new THREE.CanvasTexture(c);
})();
/* procedural panel surfaces: color + normal map generated from a height field */
function panelMaps() {
  const N = 256,
    c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d");
  x.fillStyle = "#808080";
  x.fillRect(0, 0, N, N);
  const R = (a, b) => a + Math.random() * (b - a);
  x.fillStyle = "#9a9a9a";
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) x.fillRect(i * 128 + 6, j * 128 + 6, 116, 116);
  x.fillStyle = "#707070";
  x.fillRect(0, 124, N, 8);
  x.fillRect(124, 0, 8, N);
  for (let k = 0; k < 5; k++) {
    x.fillStyle = Math.random() < 0.5 ? "#b0b0b0" : "#6a6a6a";
    x.fillRect((R(0, 3) | 0) * 64 + 14, (R(0, 3) | 0) * 64 + 14, R(18, 46), R(10, 30));
  }
  x.fillStyle = "#c8c8c8";
  for (const [i, j] of [
    [12, 12],
    [116, 12],
    [12, 116],
    [116, 116],
    [140, 12],
    [244, 12],
    [140, 116],
    [244, 116],
    [12, 140],
    [116, 140],
    [12, 244],
    [116, 244],
    [140, 140],
    [244, 140],
    [140, 244],
    [244, 244],
  ]) {
    x.beginPath();
    x.arc(i, j, 3, 0, 7);
    x.fill();
  }
  const h = x.getImageData(0, 0, N, N),
    hd = h.data;
  for (let i = 0; i < hd.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, hd[i] + n));
  }
  const nc = document.createElement("canvas");
  nc.width = nc.height = N;
  const nx = nc.getContext("2d");
  const nd = nx.createImageData(N, N);
  const H = (i, j) => hd[(((j + N) % N) * N + ((i + N) % N)) * 4] / 255;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const dx = (H(i + 1, j) - H(i - 1, j)) * 3.5,
        dy = (H(i, j + 1) - H(i, j - 1)) * 3.5;
      const l = Math.hypot(dx, dy, 1);
      const o = (j * N + i) * 4;
      nd.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      nd.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nd.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nd.data[o + 3] = 255;
    }
  nx.putImageData(nd, 0, 0);
  const cc = document.createElement("canvas");
  cc.width = cc.height = N;
  const cx = cc.getContext("2d");
  const cd = cx.createImageData(N, N);
  for (let i = 0; i < hd.length; i += 4) {
    const v = 180 + (hd[i] - 128) * 0.45 + (Math.random() - 0.5) * 10;
    cd.data[i] = cd.data[i + 1] = cd.data[i + 2] = Math.max(0, Math.min(255, v));
    cd.data[i + 3] = 255;
  }
  cx.putImageData(cd, 0, 0);
  const map = new THREE.CanvasTexture(cc),
    nmap = new THREE.CanvasTexture(nc);
  for (const t of [map, nmap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  map.encoding = THREE.sRGBEncoding;
  return { map, nmap };
}
const DETAIL = panelMaps();
const DETAIL_MATS = [];
function detailMat(m) {
  if (!DETAIL_MATS.includes(m)) {
    DETAIL_MATS.push(m);
    m.userData.rough = m.roughness;
  }
  applyDetail(m);
}
function applyDetail(m) {
  /* map materials draw their panels procedurally (render/surfaces.js) */
  const on = SET.textures === "high" && !m.userData.surf;
  m.map = on ? DETAIL.map : null;
  m.normalMap = on ? DETAIL.nmap : null;
  m.normalScale && m.normalScale.set(0.6, 0.6);
  m.needsUpdate = true;
}
/* environment lighting: a prefiltered capture of the sky plus the arena's light strips */
