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
  /* three.js needs WebGL 2 (r163 on); the WebGL 1 fallbacks below are kept only where they cost nothing */
  webgl2: true,
  cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  env: null,
  failed: false,
  lastKey: "",
  b3: null,
  b4: null,
  /* half-resolution occlusion (ao1, ao2) and floor reflections (ssr), quarter-resolution light shafts (sh) */
  ssr: null,
  ao1: null,
  ao2: null,
  sh: null,
  /* cinematic look (the trailer): see CINE.look; its pass and shaders are render/cine-look.js, in the
     trailer build only */
  look: null,
  lookPass: null,
  /* a brief radial colour split (red out, blue in) when your shield breaks (game/loop.js) */
  split: 0,
  /* the environment capture is waiting for the first frames (render/environment.js) */
  envWait: false,
  /* environment light's strength before the map's look scales it */
  envI: 1,
  frame: 0,
  /* SMAA (three's addon, loaded from the CDN the first time it is chosen): the pass, the composite's
     output it reads (ldr), and whether loading failed (then FXAA stands in) */
  smaa: null,
  smaaLoad: null,
  ldr: null,
  /* a map look shown instead of the map's own (the developer console's "look" command) */
  lookId: "",
  /* a tone curve that overrides the map's (the developer console's "tone" command) */
  tone: "",
  /* TAA: two full-size histories (read one, write the other), this frame's sub-pixel nudge, whether the
     history can be trusted; mb: the motion-blurred copy; pvp, pPos, pDir, pT: last frame's camera */
  taaA: null,
  taaB: null,
  taaN: 0,
  jx: 0,
  jy: 0,
  taaOk: false,
  mb: null,
  pvp: new THREE.Matrix4(),
  pPos: new THREE.Vector3(),
  pDir: new THREE.Vector3(),
  pT: 0,
  /* camera cuts seen (each drops the TAA history and skips the blur for a frame) */
  cuts: 0,
};
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
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
/* view positions rebuilt from depth, and each pixel's normal from the flatter side of its neighbours
   (the scene has no normal buffer: see "Why no G-buffer" in docs/ARCHITECTURE.md; the map is built from
   flat faces, so these are its true face normals) */
const VIEWPOS =
  "uniform sampler2D tD;uniform vec2 clip;uniform vec2 proj;float lz(vec2 uv){float d=texture2D(tD,uv).x;return clip.x*clip.y/(clip.y-d*(clip.y-clip.x));}vec3 vp(vec2 uv){float z=lz(uv);return vec3((uv*2.-1.)*proj*z,-z);}";
const VIEWNRM =
  VIEWPOS +
  "uniform vec2 dtx;vec3 vn(vec2 uv,vec3 P){vec3 r=vp(uv+vec2(dtx.x,0.)),l=vp(uv-vec2(dtx.x,0.)),u=vp(uv+vec2(0.,dtx.y)),b=vp(uv-vec2(0.,dtx.y));vec3 dx=abs(r.z-P.z)<abs(P.z-l.z)?r-P:P-l;vec3 dy=abs(u.z-P.z)<abs(P.z-b.z)?u-P:P-b;return normalize(cross(dx,dy));}float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}";
/* ground-truth ambient occlusion (GTAO) at half resolution: in two slices through each pixel (turned a
   little every frame under TAA, which then averages them), walk out both ways within `rad` metres for the
   highest horizon, and integrate the cosine-weighted sky left open between the two horizons around the
   pixel's normal. Unlike a plain sample count this darkens by how much of the hemisphere is really
   blocked, so creases go dark and open floor stays clean. */
const ssaoMat = new THREE.ShaderMaterial({
  defines: { SLICES: 2, STEPS: 6 },
  uniforms: {
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    dtx: { value: new THREE.Vector2(1, 1) },
    rad: { value: 1.3 },
    k: { value: 1.4 },
    fr: { value: 0 },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform float rad;uniform float k;uniform float fr;varying vec2 vUv;${VIEWNRM}
void main(){if(texture2D(tD,vUv).x>=1.){gl_FragColor=vec4(1.);return;}
vec3 P=vp(vUv);
/* (not the weapon in your hands, and fading out far away where a pixel spans more than the radius) */
if(P.z>-1.){gl_FragColor=vec4(1.);return;}
vec3 N=vn(vUv,P);vec3 V=normalize(-P);
vec2 sr=rad/(-P.z*proj)*.5;
float n0=ign(gl_FragCoord.xy+fr*5.588),j0=ign(gl_FragCoord.yx+17.+fr*7.31);
float vis=0.;
for(int s=0;s<SLICES;s++){float phi=(float(s)+n0)*3.14159/float(SLICES);vec2 om=vec2(cos(phi),sin(phi));
vec3 dv=vec3(om,0.);vec3 od=dv-dot(dv,V)*V;vec3 ax=normalize(cross(od,V));
vec3 pn=N-ax*dot(N,ax);float pl=length(pn);float cn=clamp(dot(pn,V)/max(pl,1e-4),0.,1.);
float n=sign(dot(od,pn))*acos(cn);
float h0=cos(n+1.5708),h1=cos(n-1.5708),lo0=h0,lo1=h1;
for(int i=0;i<STEPS;i++){float t=(float(i)+j0)/float(STEPS);vec2 o=om*max(sr*t*t,dtx*3.*(float(i)+1.));
vec3 d0=vp(vUv+o)-P,d1=vp(vUv-o)-P;float L0=length(d0),L1=length(d1);
float w0=1.-smoothstep(rad*.4,rad,L0),w1=1.-smoothstep(rad*.4,rad,L1);
h0=max(h0,mix(lo0,dot(d0,V)/max(L0,1e-4)-.04,w0));h1=max(h1,mix(lo1,dot(d1,V)/max(L1,1e-4)-.04,w1));}
float a1=n+clamp(acos(clamp(h0,-1.,1.))-n,-1.5708,1.5708),a0=n+clamp(-acos(clamp(h1,-1.,1.))-n,-1.5708,1.5708);
float sn=sin(n);vis+=pl*((cn+2.*a0*sn-cos(2.*a0-n))+(cn+2.*a1*sn-cos(2.*a1-n)))*.25;}
vis=mix(clamp(vis/float(SLICES),0.,1.),1.,smoothstep(40.,90.,-P.z));
gl_FragColor=vec4(vec3(pow(vis,k)),1.);}`,
});
/* edge-aware blur of the occlusion in one pass (5x5 taps): neighbours at a different depth don't bleed across */
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
void main(){float z0=lz(vUv);float s=0.,w=0.;
for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++){vec2 uv=vUv+dir*vec2(float(i),float(j))*1.5;
float wi=exp(-abs(lz(uv)-z0)/(z0*.04+.02))*(1.-.1*float(i*i+j*j));s+=texture2D(t,uv).r*wi;w+=wi;}
gl_FragColor=vec4(vec3(s/w),1.);}`,
});
/* light shafts: march from each pixel toward the sun through the sky (alpha 0 in the scene target),
   so walls and towers cut the rays. The light is the open sky's own brightness plus a glow around the
   sun's disk, so rays fan out from every edge that crosses the sun even where the sky is not blown out;
   the march is jittered per pixel to hide its steps. */
const shaftMat = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: null },
    sunUv: { value: new THREE.Vector2() },
    vis: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D t;uniform vec2 sunUv;uniform float vis;uniform float aspect;varying vec2 vUv;
void main(){vec2 st=(sunUv-vUv)/36.;vec2 uv=vUv+st*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
vec3 acc=vec3(0.);float dec=1.;
for(int i=0;i<36;i++){vec4 s=texture2D(t,uv);float g=max(0.,1.-length((uv-sunUv)*vec2(aspect,1.))*3.2);
acc+=(min(max(s.rgb-.3,0.),vec3(6.))+vec3(1.,.8,.55)*g*g*g*3.)*(1.-smoothstep(0.,.2,s.a))*dec;dec*=.965;uv+=st;}
gl_FragColor=vec4(acc*vis/36.,1.);}`,
});
/* screen-space reflections (the Reflections setting: "ssr" at High, "ssrhi" at Ultra). The map's
   surfaces leave how mirror-like they are in the scene's alpha (render/surfaces.js: wet patches fully,
   polished floor plates, deck tops and trim partly); each such pixel reflects its view ray about its own
   normal (rebuilt from depth), marches it through the depth buffer and takes the color it hits, fading at the screen's edges. Rougher surfaces
   scatter the ray and leave their roughness in alpha, which the composite blurs by. The high quality
   takes twice the steps and refines each hit by bisection. */
const ssrMat = new THREE.ShaderMaterial({
  defines: { STEPS: 20, GROW: "1.17", REFINE: 0 },
  uniforms: {
    tS: { value: null },
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    pm: { value: new THREE.Matrix4() },
    upV: { value: new THREE.Vector3() },
    dtx: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D tS;uniform mat4 pm;uniform vec3 upV;varying vec2 vUv;${VIEWNRM}
vec2 suv(vec3 q){vec4 c=pm*vec4(q,1.);return c.xy/c.w*.5+.5;}
void main(){/* (sky, and smoke drawn over it, reflect nothing) */
if(texture2D(tD,vUv).x>=1.){gl_FragColor=vec4(0.);return;}
float a=texture2D(tS,vUv).a;float w=clamp((1.-a)*2.,0.,1.);
if(a<.25||w<.04){gl_FragColor=vec4(0.);return;}
float rough=clamp(1.-w*1.3,0.,1.);
vec3 P=vp(vUv);vec3 V=normalize(P);float j=ign(gl_FragCoord.xy),j2=ign(gl_FragCoord.yx+17.);
/* the surface's own normal, rebuilt from depth (walls and ramps reflect too); the floor's exactly up,
   so distant floor doesn't ripple with the depth buffer's steps */
vec3 G=vn(vUv,P);if(dot(G,V)>0.)G=-G;if(dot(G,upV)>.96)G=upV;
vec3 T=normalize(cross(G,abs(G.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))),B=cross(G,T);
vec3 N=normalize(G+rough*.1*(T*(j2-.5)+B*(j-.5)));vec3 R=reflect(V,N);
float fres=.06+.94*pow(1.-max(dot(-V,G),0.),5.);
float st=.18-P.z*.015;vec3 Q=P+R*st*j;vec3 hit=vec3(0.);float found=0.;
for(int i=0;i<STEPS;i++){vec3 Q0=Q;Q+=R*st;st*=GROW;vec2 uv=suv(Q);
if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.||Q.z>-.05)break;
float dz=-Q.z-lz(uv);
if(dz>0.&&dz<st*2.5+.15){
#if REFINE
for(int k=0;k<4;k++){vec3 M=(Q0+Q)*.5;if(-M.z-lz(suv(M))>0.)Q=M;else Q0=M;}uv=suv(Q);
#endif
hit=texture2D(tS,uv).rgb;vec2 e=abs(uv-.5)*2.;found=(1.-smoothstep(.8,1.,max(e.x,e.y)))*(1.-float(i)/float(STEPS));break;}}
gl_FragColor=vec4(min(hit,vec3(8.))*found*w*fres,rough);}`,
});
/* temporal anti-aliasing (the "taa" choice of Anti-aliasing; Ultra's default). Each frame the camera is
   nudged by a different fraction of a pixel (a Halton sequence); this pass finds where each pixel was a
   frame ago (its depth, rebuilt into the world, through last frame's camera) and blends this frame into
   that history, so edges and fine detail average out across frames. The history is clamped to the colors
   around the pixel now (a box from their mean and spread), so things that moved don't leave ghosts, and
   it's dropped wherever it falls off screen, after a camera cut and on any resize. The weapon in your
   hands moves with the camera: it keeps its own place. Anything that moved on its own is caught by its
   depth (kept in the history's alpha) not matching. Colors blend in a compressed range so a muzzle
   flash doesn't smear. */
const REPROJ =
  "uniform mat4 pvp;uniform mat3 camW;uniform vec3 camP;vec2 prevUv(vec2 uv,float z){if(z<1.)return uv;vec3 q=vec3((uv*2.-1.)*proj*z,-z);vec4 c=pvp*vec4(camP+camW*q,1.);return c.xy/c.w*.5+.5;}";
const taaMat = new THREE.ShaderMaterial({
  uniforms: {
    tC: { value: null },
    tH: { value: null },
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    pvp: { value: new THREE.Matrix4() },
    camW: { value: new THREE.Matrix3() },
    camP: { value: new THREE.Vector3() },
    size: { value: new THREE.Vector2(1, 1) },
    hOk: { value: 0 },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D tC;uniform sampler2D tH;uniform vec2 size;uniform float hOk;varying vec2 vUv;${VIEWPOS}${REPROJ}
vec3 tm(vec3 c){return c/(1.+max(c.r,max(c.g,c.b)));}
vec3 itm(vec3 c){return c/max(1e-4,1.-max(c.r,max(c.g,c.b)));}
vec3 yc(vec3 c){return vec3(.25*c.r+.5*c.g+.25*c.b,.5*c.r-.5*c.b,-.25*c.r+.5*c.g-.25*c.b);}
vec3 rgb(vec3 y){float t=y.x-y.z;return vec3(t+y.y,y.x+y.z,t-y.y);}
vec3 hist(vec2 uv){vec2 sp=uv*size,tp=floor(sp-.5)+.5,f=sp-tp;
vec2 w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f),w12=w1+w2;
vec2 t0=(tp-1.)/size,t3=(tp+2.)/size,t12=(tp+w2/w12)/size;
vec3 r=tm(texture2D(tH,vec2(t12.x,t0.y)).rgb)*w12.x*w0.y+tm(texture2D(tH,vec2(t0.x,t12.y)).rgb)*w0.x*w12.y+tm(texture2D(tH,t12).rgb)*w12.x*w12.y+tm(texture2D(tH,vec2(t3.x,t12.y)).rgb)*w3.x*w12.y+tm(texture2D(tH,vec2(t12.x,t3.y)).rgb)*w12.x*w3.y;
return max(r/(w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y),0.);}
void main(){vec2 cu=vUv;vec4 c0=texture2D(tC,cu);vec3 c=tm(c0.rgb);
vec3 m1=vec3(0.),m2=vec3(0.);
for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec3 y=yc(tm(texture2D(tC,cu+vec2(float(i),float(j))/size).rgb));m1+=y;m2+=y*y;}
m1/=9.;vec3 sd=sqrt(max(m2/9.-m1*m1,0.));
/* where it was: from the nearest depth around it, so edges move with what's in front */
float zc=lz(vUv),z=zc;for(int i=-1;i<=1;i+=2)for(int j=-1;j<=1;j+=2)z=min(z,lz(vUv+vec2(float(i),float(j))/size));
vec2 pu=prevUv(vUv,z);vec2 v=(vUv-pu)*size;
float a=hOk<.5||pu.x<0.||pu.y<0.||pu.x>1.||pu.y>1.?1.:mix(.09,.3,clamp(length(v)/12.,0.,1.));
/* the history keeps each pixel's depth: where last frame had something else there (a player stepping
   into or out of it: the camera's motion alone can't tell), this frame is taken as it is, so a distant
   player is never blended into the wall behind them */
float ez=zc;if(zc>=1.){vec4 e=pvp*vec4(camP+camW*vec3((vUv*2.-1.)*proj*zc,-zc),1.);ez=e.w;}
float hz=texelFetch(tH,ivec2(clamp(pu,0.,1.)*size),0).a;
a=mix(a,1.,smoothstep(.04,.1,abs(hz-ez)/(ez+.3)));
vec3 h=yc(hist(pu));vec3 e=sd*1.15+.002;vec3 d=h-m1;vec3 u=abs(d/e);float mx=max(u.x,max(u.y,u.z));h=mx>1.?m1+d/mx:h;
gl_FragColor=vec4(itm(clamp(mix(rgb(h),c,a),0.,.98)),zc);}`,
});
/* camera motion blur (Ultra, with its own off switch): each pixel smeared along how far it moved across
   the screen since last frame, as a camera with a half-frame shutter at 60 fps would (scaled to the frame
   rate), capped short. Only the camera's motion counts: the weapon in your hands stays sharp and never
   smears into the world. */
const mbMat = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: null },
    tD: { value: null },
    clip: { value: new THREE.Vector2(0.1, 500) },
    proj: { value: new THREE.Vector2(1, 1) },
    pvp: { value: new THREE.Matrix4() },
    camW: { value: new THREE.Matrix3() },
    camP: { value: new THREE.Vector3() },
    k: { value: 0.5 },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader: `uniform sampler2D t;uniform float k;varying vec2 vUv;${VIEWPOS}${REPROJ}
void main(){vec4 c0=texture2D(t,vUv);float z=lz(vUv);vec2 v=(vUv-prevUv(vUv,z))*k;float L=length(v);
if(z<1.||L<.0015){gl_FragColor=c0;return;}
v*=min(L,.035)/L;float j=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
vec3 s=c0.rgb;float w=1.;
for(int i=0;i<8;i++){vec2 uv=vUv+v*((float(i)+j)/7.-.5);if(lz(uv)<1.)continue;s+=texture2D(t,uv).rgb;w+=1.;}
gl_FragColor=vec4(s/w,c0.a);}`,
});
/* each map's own color mood, applied after tone mapping: shadow tint (lift), highlight tint (gain),
   vibrance. Picked by whichever map group is showing (MAP_GROUPS, world/bake.js). */
/* each map's time of day and weather: tone curve (render/tone.js), grade (shadow and highlight tints,
   vibrance), sun (direction, color, brightness in the old light units), sky and ground ambient, fog
   (color, and its near and far as shares of the usual), the sky (see SKY_U in render/renderer.js) and
   whether a storm throws lightning, and how strongly its light shafts show (Ultra). Applied when the map that is showing changes (applyLook). */
const MAP_LOOK = {
  /* Proving Grounds at dusk */
  arena: {
    tone: "neutral",
    lift: [-0.012, 0.008, 0.03],
    gain: [1.05, 1.0, 0.94],
    vib: 0.18,
    sun: [30, 30, 18, "#ffe2c0", 2.3],
    hemi: ["#b4cbe0", "#5a4a3c", 1.35],
    fog: ["#141e24", 1, 1],
    haze: [0.6, 0.02, 0, 0.35, 0.22, 2.2],
    cones: 0.7,
    sky: {
      lo: [0.07, 0.1, 0.13],
      mid: [0.36, 0.26, 0.24],
      hi: [0.04, 0.06, 0.11],
      k: [1, 1, 0, 0],
      cloudA: [0.15, 0.12, 0.16],
      cloudB: [0.66, 0.44, 0.33],
      sun: [1, 0.84, 0.62, 1],
      glow: [1, 0.7, 0.35],
    },
  },
  /* Twin Foundry: a hazy night under a storm, lit by moonlight from above and sodium lamps from the
     city below; lightning in the clouds now and then */
  "twin-foundry": {
    tone: "neutral",
    lift: [0.02, 0.0, 0.035],
    gain: [1.08, 0.97, 0.86],
    vib: 0.25,
    sun: [-20, 34, 26, "#a9bde6", 1.05],
    hemi: ["#3a4868", "#85522a", 1.35],
    fog: ["#2b2118", 0.55, 0.85],
    haze: [0.7, 0.03, 0, 0.35, 0.18, 2.2],
    cones: 0.5,
    /* (no sun at night: the lit cloud deck would only flood the light shafts) */
    shafts: 0,
    storm: true,
    envK: 0.8,
    envSky: 0.35,
    sky: {
      lo: [0.13, 0.08, 0.045],
      mid: [0.1, 0.07, 0.06],
      hi: [0.015, 0.02, 0.04],
      k: [0, 0.35, 1, 0],
      cloudA: [0.05, 0.045, 0.055],
      cloudB: [0.3, 0.17, 0.08],
      sun: [0.75, 0.82, 1, 0.45],
      glow: [1, 0.62, 0.25],
    },
  },
  /* Hadal Station on the sea floor: blue-green light from the surface far above, dense blue water */
  hadal: {
    tone: "neutral",
    lift: [-0.02, 0.012, 0.04],
    gain: [0.9, 1.02, 1.08],
    vib: 0.2,
    sun: [6, 60, 10, "#8fdfe6", 1.5],
    hemi: ["#2d6f86", "#0b1a22", 1.25],
    fog: ["#06222d", 0.3, 0.7],
    haze: [0.85, 0.04, 0, 0.08, 0.35, 1.8],
    cones: 1.4,
    sky: {
      lo: [0.01, 0.05, 0.07],
      mid: [0.02, 0.12, 0.16],
      hi: [0.05, 0.25, 0.3],
      k: [0, 0, 0, 1],
      cloudA: [0, 0, 0],
      cloudB: [0, 0, 0],
      sun: [0.5, 0.9, 1, 0],
      glow: [0.4, 0.9, 1],
    },
  },
};
/* the look in effect: its id, base ambient (lightning adds to it), fog shares, storm */
const LOOK_NOW = { id: "", hemiI: 1.35, hemiShare: 1, envK: 1, fogNear: 1, fogFar: 1, storm: false };
function applyLook(id) {
  const L = MAP_LOOK[id] || MAP_LOOK.arena;
  LOOK_NOW.id = id;
  sun.position.set(L.sun[0], L.sun[1], L.sun[2]);
  sun.color.set(L.sun[3]);
  sun.intensity = L.sun[4] * LIGHT_K;
  hemi.color.set(L.hemi[0]);
  hemi.groundColor.set(L.hemi[1]);
  hemi.intensity = (LOOK_NOW.hemiI = L.hemi[2]) * LIGHT_K;
  scene.fog.color.set(L.fog[0]);
  scene.background.set(L.fog[0]);
  LOOK_NOW.fogNear = L.fog[1];
  LOOK_NOW.fogFar = L.fog[2];
  applyFog();
  LOOK_NOW.storm = !!L.storm;
  /* how strongly the captured surroundings light and reflect (a storm-lit sky would flood the floor) */
  LOOK_NOW.envK = L.envK || 1;
  scene.environmentIntensity = GFX.envI * LOOK_NOW.envK;
  const S = L.sky;
  SKY_U.skyLo.value.fromArray(S.lo);
  SKY_U.skyMid.value.fromArray(S.mid);
  SKY_U.skyHi.value.fromArray(S.hi);
  SKY_U.skyK.value.fromArray(S.k);
  SKY_U.cloudA.value.fromArray(S.cloudA);
  SKY_U.cloudB.value.fromArray(S.cloudB);
  SKY_U.sunC.value.fromArray(S.sun);
  SKY_U.glowC.value.fromArray(S.glow);
}
/* heat haze sources for the composite pass, filled by heatUniforms (render/combat-fx.js) */
const HEAT_U = Array.from({ length: 6 }, () => new THREE.Vector4());
const compMat = new THREE.ShaderMaterial({
  /** @type {Record<string, string>} */
  defines: {},
  depthTest: false,
  depthWrite: false,
  vertexShader: FSV,
  uniforms: {
    tS: { value: null },
    tB: { value: null },
    /* the map's tone curve (render/tone.js) */
    tTone: { value: null },
    texel: { value: new THREE.Vector2(1, 1) },
    fx: { value: 1 },
    sharp: { value: 0.3 },
    bloom: { value: 0.7 },
    expo: { value: 1 },
    sat: { value: 1 },
    vig: { value: 0.3 },
    grain: { value: 0.04 },
    time: { value: 0 },
    /* ambient occlusion, light shafts and the map's grade */
    tZ: { value: null },
    hz: { value: new THREE.Vector4() },
    hzF: { value: new THREE.Vector4(0.35, 0, 0, 0) },
    hzC: { value: new THREE.Vector3() },
    camP: { value: new THREE.Vector3() },
    camW: { value: new THREE.Matrix3() },
    zClip: { value: new THREE.Vector2(0.1, 300) },
    zProj: { value: new THREE.Vector2(1, 1) },
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
    split: { value: 0 },
  },
  fragmentShader: [
    "uniform sampler2D tS;uniform sampler2D tB;uniform vec2 texel;uniform float fx;uniform float sharp;uniform float bloom;uniform float expo;uniform float sat;uniform float vig;uniform float grain;uniform float time;varying vec2 vUv;",
    "uniform sampler2D tZ;uniform vec4 hz;uniform vec4 hzF;uniform vec3 hzC;uniform vec3 camP;uniform mat3 camW;uniform vec2 zClip;uniform vec2 zProj;",
    "uniform vec4 heat[6];uniform float heatN;uniform float hT;uniform float aspect;uniform sampler2D tR;uniform float ssrK;uniform sampler2D tA;uniform float aoK;uniform sampler2D tSh;uniform float shaftK;uniform float gOn;uniform vec3 gLift;uniform vec3 gGain;uniform float gVib;uniform float split;",
    /* the cinematic look (render/cine-look.js, trailer build) splices in at these markers, compiled in
       only while a look is on (CINE) */
    "#ifdef CINE",
    "/*@cine-head*/",
    "#endif",
    TONE_GLSL,
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
    /* the shield break's colour split: nothing at the centre, growing to the edges */
    " if(split>0.){vec2 o=(uv-.5)*split;c.r=S(uv+o).r;c.b=S(uv-o).b;}",
    " if(sharp>.001){vec3 n=S(uv-vec2(0.,texel.y)),s=S(uv+vec2(0.,texel.y)),e=S(uv+vec2(texel.x,0.)),w=S(uv-vec2(texel.x,0.));vec3 mn=min(c,min(min(n,s),min(e,w))),mx=max(c,max(max(n,s),max(e,w)));c=clamp(c+(4.*c-n-s-e-w)*sharp*.3,mn,mx);}",
    " vec2 q=uv-.5;",
    "#ifdef CINE",
    "/*@cine-color*/",
    "#endif",
    /* occlusion darkens everything but what glows */
    " if(aoK>0.){float a=texture2D(tA,uv).r;c*=mix(1.,a,aoK*(1.-smoothstep(.75,1.,luma(c))));}",
    /* haze: thicker with distance and toward the ground (hz = amount, density per m, base height,
       falloff per m), never more than hzF.x, so a pilot across the map stays readable */
    " if(hz.x>0.){float zd=texture2D(tZ,uv).x;if(zd<1.){float z=zClip.x*zClip.y/(zClip.y-zd*(zClip.y-zClip.x));vec3 vq=vec3((uv*2.-1.)*zProj*z,-z);vec3 wq=camP+camW*vq;",
    /* (and none within fighting range: it starts at hzF.y metres, full by hzF.z) */
    "  float dq=length(vq);float f=hz.x*(1.-exp(-dq*hz.y))*exp(-max(wq.y-hz.z,0.)*hz.w)*smoothstep(hzF.y,hzF.z,dq);c=mix(c,aces(hzC*expo),min(f,hzF.x));}}",
    /* reflections: rough ones blurred by the roughness the reflection pass left in alpha */
    " if(ssrK>0.){vec4 r=texture2D(tR,uv);vec3 rc=r.rgb;if(r.a>.05){vec2 o=texel*(1.5+5.*r.a);rc=mix(rc,(texture2D(tR,uv+o).rgb+texture2D(tR,uv-o).rgb+texture2D(tR,uv+vec2(o.x,-o.y)).rgb+texture2D(tR,uv-vec2(o.x,-o.y)).rgb)*.25,min(1.,r.a*1.5));}c+=aces(rc*expo)*ssrK;}",
    " if(shaftK>0.)c+=aces(texture2D(tSh,uv).rgb*expo)*vec3(1.,.86,.66)*shaftK;",
    " c+=aces(texture2D(tB,uv).rgb*expo)*bloom;",
    " float l=luma(c);c=max(mix(vec3(l),c,sat),0.);",
    " c*=1.-vig*smoothstep(.3,.95,length(q)*1.25);",
    " float g=fract(sin(dot(uv+fract(time),vec2(12.9898,78.233)))*43758.5453);vec3 o=pow(clamp(c,0.,1.),vec3(1./2.2));",
    "#ifdef CINE",
    "/*@cine-grade*/",
    "#endif",
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
  const msaa = SET.aa === "msaa" && GFX.webgl2;
  const wantDof = !!(GFX.look && GFX.look.dof > 0) && GFX.webgl2;
  const wantAo = SET.ao === "ssao" && GFX.webgl2,
    wantSh = !!SET.lightShafts,
    ssrQ = GFX.webgl2 ? { ssr: 1, ssrhi: 2 }[SET.reflections] || 0 : 0,
    wantSsr = ssrQ > 0;
  /* the scene's depth as a texture (depth of field, occlusion); WebGL2 resolves it from MSAA too */
  const wantHaze = !!SET.haze && GFX.webgl2;
  const wantTaa = SET.aa === "taa" && GFX.webgl2,
    wantMb = !!SET.motionBlur && GFX.webgl2;
  const wantDepth = wantDof || wantAo || wantSsr || wantHaze || wantTaa || wantMb;
  const key =
    w +
    "x" +
    h +
    (msaa ? "m" : "") +
    (SET.bloom > 0 ? "b" : "") +
    (wantDof ? "d" : "") +
    (wantAo ? "a" : "") +
    (wantSh ? "s" : "") +
    (wantSsr ? "r" + ssrQ : "") +
    (wantHaze ? "h" : "") +
    (wantTaa ? "t" : "") +
    (wantMb ? "v" : "");
  if (key === GFX.lastKey && GFX.rt) return;
  GFX.lastKey = key;
  GFX.taaOk = false;
  for (const k of ["rt", "b1", "b2", "b3", "b4", "ao1", "ao2", "sh", "ssr", "taaA", "taaB", "mb"])
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
    GFX.rt = new THREE.WebGLRenderTarget(w, h, msaa ? { ...opt, samples: 4 } : opt);
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
    if (wantSsr) {
      GFX.ssr = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), bo);
      Object.assign(
        ssrMat.defines,
        ssrQ > 1 ? { STEPS: 40, GROW: "1.08", REFINE: 1 } : { STEPS: 20, GROW: "1.17", REFINE: 0 }
      );
      ssrMat.needsUpdate = true;
    }
    if (wantTaa) {
      GFX.taaA = new THREE.WebGLRenderTarget(w, h, bo);
      GFX.taaB = new THREE.WebGLRenderTarget(w, h, bo);
    }
    if (wantMb) GFX.mb = new THREE.WebGLRenderTarget(w, h, bo);
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
  smaaSize(W, H);
}
/** SMAA on the finished image: the composite draws into ldr, the pass draws that to the screen */
function smaaWanted() {
  if (SET.aa !== "smaa" || GFX.smaaLoad === false) return false;
  if (!GFX.smaaLoad) {
    const base = /** @type {any} */ (window).THREE_URL;
    if (!base) return (GFX.smaaLoad = false);
    GFX.smaaLoad = import(base.replace(/build\/$/, "examples/jsm/") + "postprocessing/SMAAPass.js")
      .then(m => {
        if (!m.SMAAPass) throw new Error("no SMAA");
        GFX.smaa = new m.SMAAPass();
        GFX.smaa.renderToScreen = true;
        smaaSize(renderer.domElement.width, renderer.domElement.height);
      })
      .catch(() => (GFX.smaaLoad = false));
  }
  return !!GFX.smaa;
}
function smaaSize(W, H) {
  if (!GFX.smaa) return;
  if (!GFX.ldr || GFX.ldr.width !== W || GFX.ldr.height !== H) {
    if (GFX.ldr) GFX.ldr.dispose();
    GFX.ldr = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
  }
  GFX.smaa.setSize(W, H);
}
const _hzC = new THREE.Color();
const _sunS = new THREE.Vector3(),
  _sunF = new THREE.Vector3();
function fsPass(mat, target) {
  fsQuad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(fsScene, GFX.cam);
}
/** the n-th number of the Halton sequence in a base (TAA's sub-pixel nudges) */
function halton(n, b) {
  let r = 0,
    f = 1;
  for (; n > 0; n = Math.floor(n / b)) r += (f /= b) * (n % b);
  return r;
}
const _taaD = new THREE.Vector3(),
  _taaP = new THREE.Vector3();
/**
 * TAA and motion blur, after the scene and before the composite: both find where each pixel was last frame
 * from its depth and last frame's camera. A camera cut (a respawn, a killcam, a replay) drops the history
 * and the blur for a frame. Returns the image the composite should read.
 */
function temporalPasses(taa) {
  const now = performance.now(),
    dt = Math.max(1, now - GFX.pT) / 1000;
  GFX.pT = now;
  camera.getWorldPosition(_taaP);
  camera.getWorldDirection(_taaD);
  const cut = _taaP.distanceTo(GFX.pPos) > 3 || _taaD.dot(GFX.pDir) < 0.5 || dt > 0.25;
  if (cut) GFX.cuts++;
  GFX.pPos.copy(_taaP);
  GFX.pDir.copy(_taaD);
  let out = GFX.rt.texture;
  const mb = !!GFX.mb && !!GFX.rt.depthTexture && !GFX.look;
  if (taa || mb) {
    const tanY = Math.tan((camera.fov * Math.PI) / 360);
    for (const M of [taaMat, mbMat]) {
      const u = M.uniforms;
      u.tD.value = GFX.rt.depthTexture;
      u.clip.value.set(camera.near, camera.far);
      u.proj.value.set(tanY * camera.aspect, tanY);
      u.pvp.value.copy(GFX.pvp);
      u.camW.value.setFromMatrix4(camera.matrixWorld);
      u.camP.value.copy(_taaP);
    }
  }
  if (taa) {
    if (GPUQ) GPUQ.begin("taa");
    const T = taaMat.uniforms;
    T.tC.value = GFX.rt.texture;
    T.tH.value = GFX.taaB.texture;
    T.size.value.set(GFX.w, GFX.h);
    T.hOk.value = GFX.taaOk && !cut ? 1 : 0;
    fsPass(taaMat, GFX.taaA);
    out = GFX.taaA.texture;
    const t = GFX.taaA;
    GFX.taaA = GFX.taaB;
    GFX.taaB = t;
    GFX.taaOk = true;
    if (GPUQ) GPUQ.end();
  } else GFX.taaOk = false;
  if (mb && !cut) {
    if (GPUQ) GPUQ.begin("blur");
    mbMat.uniforms.t.value = out;
    /* a half-frame shutter at 60 fps, whatever the frame rate */
    mbMat.uniforms.k.value = Math.min(1.2, Math.max(0.2, 1 / 120 / dt));
    fsPass(mbMat, GFX.mb);
    out = GFX.mb.texture;
    if (GPUQ) GPUQ.end();
  }
  GFX.pvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return out;
}
/* if the post shaders fail to compile on this GPU, fall back to plain rendering instead of a black screen */
let gfxChecked = false;
function renderFrame() {
  const tr = performance.now();
  /* drop pods are drawn instanced: their parts go out once everything has moved (game/pods.js) */
  podDraw();
  /* low shadows redraw every other frame */
  if (!renderer.shadowMap.autoUpdate) renderer.shadowMap.needsUpdate = (++GFX.frame & 1) === 0;
  /* the shadow square follows the view, on frames the shadow map is redrawn */
  if (renderer.shadowMap.autoUpdate || renderer.shadowMap.needsUpdate) fitShadow();
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
    /* TAA nudges the camera by a fraction of a pixel, different every frame (not under a cutscene's look) */
    const taa = !!GFX.taaA && !!GFX.rt.depthTexture && !GFX.look;
    if (taa) {
      const n = (GFX.taaN = (GFX.taaN % 8) + 1);
      GFX.jx = halton(n, 2) - 0.5;
      GFX.jy = halton(n, 3) - 0.5;
      camera.setViewOffset(GFX.w, GFX.h, GFX.jx, GFX.jy, GFX.w, GFX.h);
    }
    renderer.setRenderTarget(GFX.rt);
    if (GPUQ) GPUQ.begin("scene");
    renderer.render(scene, camera);
    if (GPUQ) GPUQ.end();
    if (taa) camera.clearViewOffset();
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
      ssaoMat.uniforms.dtx.value.set(1 / GFX.w, 1 / GFX.h);
      /* (under TAA the slices turn every frame and the history averages them) */
      ssaoMat.uniforms.fr.value = taa ? GFX.taaN : 0;
      fsPass(ssaoMat, GFX.ao1);
      aoBlurMat.uniforms.t.value = GFX.ao1.texture;
      aoBlurMat.uniforms.dir.value.set(1 / GFX.ao1.width, 1 / GFX.ao1.height);
      fsPass(aoBlurMat, GFX.ao2);
      U.tA.value = GFX.ao2.texture;
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
      M.dtx.value.set(1 / GFX.w, 1 / GFX.h);
      fsPass(ssrMat, GFX.ssr);
      U.tR.value = GFX.ssr.texture;
      U.ssrK.value = 0.9;
      if (GPUQ) GPUQ.end();
    }
    /* light shafts: only while the sun is in front of the camera */
    U.shaftK.value = 0;
    if (GFX.sh) {
      sunDir(_sunS);
      camera.getWorldDirection(_sunF);
      const facing = _sunS.dot(_sunF);
      if (facing > 0.1) {
        _sunS.multiplyScalar(100).add(camera.getWorldPosition(_sunF)).project(camera);
        const off = Math.max(Math.abs(_sunS.x), Math.abs(_sunS.y));
        const vis = Math.min(1, (facing - 0.1) * 2.5) * (1 - Math.min(1, Math.max(0, off - 1) / 1.2));
        const sL = MAP_LOOK[LOOK_NOW.id],
          sK = sL && sL.shafts != null ? sL.shafts : 1;
        if (vis > 0.01 && sK > 0) {
          if (GPUQ) GPUQ.begin("shafts");
          shaftMat.uniforms.t.value = GFX.rt.texture;
          shaftMat.uniforms.sunUv.value.set(_sunS.x * 0.5 + 0.5, _sunS.y * 0.5 + 0.5);
          shaftMat.uniforms.vis.value = vis;
          shaftMat.uniforms.aspect.value = camera.aspect;
          fsPass(shaftMat, GFX.sh);
          U.tSh.value = GFX.sh.texture;
          U.shaftK.value = 1.5 * sK;
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
    /* (not while a cutscene sets its own mood) */
    const lookId = GFX.lookId || (cur && cur.id);
    if (lookId && lookId !== LOOK_NOW.id && !GFX.look) applyLook(lookId);
    const look = lookId && MAP_LOOK[lookId];
    mapEnvFrame(cur);
    U.tTone.value = toneLut(GFX.tone || (look && look.tone) || "aces");
    const gr = SET.grade && !GFX.look && look;
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
    if (!!L !== Object.prototype.hasOwnProperty.call(compMat.defines, "CINE")) {
      if (L) compMat.defines.CINE = "";
      else delete compMat.defines.CINE;
      compMat.needsUpdate = true;
    }
    if (L && GFX.lookPass) GFX.lookPass(U, L);
    const src = temporalPasses(taa);
    if (GPUQ) GPUQ.begin("comp");
    U.tS.value = src;
    U.tB.value = GFX.b1.texture;
    const smaa = smaaWanted();
    /* (FXAA stands in for SMAA while it loads, or if it can't) */
    U.fx.value = SET.aa === "fxaa" || (SET.aa === "smaa" && !smaa) || (SET.aa === "taa" && !taa) ? 1 : 0;
    U.bloom.value = SET.bloom;
    U.expo.value = SET.exposure;
    U.sat.value = SET.saturation;
    U.vig.value = SET.vignette;
    U.grain.value = SET.grain;
    U.split.value = GFX.split;
    const up = gfxScale() < 0.97;
    U.sharp.value = SET.sharpen * (up ? 1.3 : 1);
    U.time.value = (U.time.value + 0.0173) % 1;
    U.heatN.value = SET.fxDetail === "ultra" && !L ? heatUniforms() : (CFX.heat.length = 0);
    U.hT.value = CFX.t;
    U.aspect.value = GFX.w / GFX.h;
    /* the map's light cones (world/bake.js), with Haze */
    LIGHT_CONE_K.value = SET.haze && look ? look.cones || 0 : 0;
    if (cur && cur.cones) cur.cones.visible = LIGHT_CONE_K.value > 0;
    /* the map's haze, from the depth buffer (High and Ultra) */
    const hzL = look && look.haze;
    if (SET.haze && hzL && GFX.rt.depthTexture && !L) {
      const tanY = Math.tan((camera.fov * Math.PI) / 360);
      U.tZ.value = GFX.rt.depthTexture;
      U.hz.value.set(hzL[0], hzL[1], hzL[2], hzL[3]);
      U.hzF.value.set(hzL[4], 30, 80, 0);
      _hzC.set(look.fog[0]);
      U.hzC.value.set(_hzC.r, _hzC.g, _hzC.b).multiplyScalar(hzL[5]);
      camera.getWorldPosition(U.camP.value);
      U.camW.value.setFromMatrix4(camera.matrixWorld);
      U.zClip.value.set(camera.near, camera.far);
      U.zProj.value.set(tanY * camera.aspect, tanY);
    } else U.hz.value.x = 0;
    if (smaa) {
      fsPass(compMat, GFX.ldr);
      if (GPUQ) GPUQ.end();
      if (GPUQ) GPUQ.begin("smaa");
      GFX.smaa.render(renderer, null, GFX.ldr);
    } else fsPass(compMat, null);
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
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        recompileAll();
        toast("Effects disabled on this GPU");
      }
    }
  }
}
/* safety net: if the center of the screen is pure white after rendering starts, back off the effects */
let gfxFrames = 0;
const pxBuf = new Uint8Array(256);
/* WebGL2 reads the pixels into a buffer and picks them up once the GPU is done (a fence), so the
   check never stalls a frame; WebGL1 reads them directly */
const pxRead = { buf: null, sync: null };
function exposureCheck() {
  gfxFrames++;
  const gl = /** @type {any} */ (renderer.getContext());
  if (pxRead.sync) {
    const st = gl.clientWaitSync(pxRead.sync, 0, 0);
    if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) return;
    gl.deleteSync(pxRead.sync);
    pxRead.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pxRead.buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pxBuf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    exposureVerdict();
    return;
  }
  if (gfxFrames !== 90 && gfxFrames !== 240) return;
  try {
    const w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    if (GFX.webgl2) {
      if (!pxRead.buf) {
        pxRead.buf = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pxRead.buf);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, 256, gl.STREAM_READ);
      } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pxRead.buf);
      gl.readPixels((w >> 1) - 4, (h >> 1) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      pxRead.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      return;
    }
    gl.readPixels((w >> 1) - 4, (h >> 1) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, pxBuf);
    exposureVerdict();
  } catch (e) {}
}
function exposureVerdict() {
  try {
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
        renderer.outputColorSpace = THREE.SRGBColorSpace;
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
/* map materials whose roughness the glossy reflections option lowers (their panels are drawn in the
   shader by render/surfaces.js; the canvas panel textures that used to cost ~300 ms at load are gone) */
function detailMat(m) {
  m.userData.rough = m.roughness;
}
/* environment lighting: a prefiltered capture of the sky plus the arena's light strips */
