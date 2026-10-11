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
  },
  fragmentShader: [
    "uniform sampler2D tS;uniform sampler2D tB;uniform vec2 texel;uniform float fx;uniform float sharp;uniform float bloom;uniform float expo;uniform float sat;uniform float vig;uniform float grain;uniform float time;varying vec2 vUv;",
    "vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}",
    "float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}",
    "vec3 S(vec2 uv){return aces(texture2D(tS,uv).rgb*expo);}",
    "vec3 fxaa(vec2 uv){vec3 nw=S(uv+vec2(-1.,-1.)*texel),ne=S(uv+vec2(1.,-1.)*texel),sw=S(uv+vec2(-1.,1.)*texel),se=S(uv+vec2(1.,1.)*texel),m=S(uv);",
    " float lnw=luma(nw),lne=luma(ne),lsw=luma(sw),lse=luma(se),lm=luma(m);float lmin=min(lm,min(min(lnw,lne),min(lsw,lse))),lmax=max(lm,max(max(lnw,lne),max(lsw,lse)));",
    " vec2 d=vec2(-((lnw+lne)-(lsw+lse)),(lnw+lsw)-(lne+lse));float red=max((lnw+lne+lsw+lse)*.03125,.0078125);float rcp=1./(min(abs(d.x),abs(d.y))+red);",
    " d=clamp(d*rcp,vec2(-8.),vec2(8.))*texel;vec3 a=.5*(S(uv+d*(-1./6.))+S(uv+d*(1./6.)));vec3 b=a*.5+.25*(S(uv-d*.5)+S(uv+d*.5));float lb=luma(b);",
    " if(lb<lmin||lb>lmax)return a;return b;}",
    "void main(){vec2 uv=vUv;vec3 c=fx>.5?fxaa(uv):S(uv);",
    " if(sharp>.001){vec3 n=S(uv-vec2(0.,texel.y)),s=S(uv+vec2(0.,texel.y)),e=S(uv+vec2(texel.x,0.)),w=S(uv-vec2(texel.x,0.));vec3 mn=min(c,min(min(n,s),min(e,w))),mx=max(c,max(max(n,s),max(e,w)));c=clamp(c+(4.*c-n-s-e-w)*sharp*.3,mn,mx);}",
    " c+=aces(texture2D(tB,uv).rgb*expo)*bloom;",
    " float l=luma(c);c=max(mix(vec3(l),c,sat),0.);",
    " vec2 q=uv-.5;c*=1.-vig*smoothstep(.3,.95,length(q)*1.25);",
    " float g=fract(sin(dot(uv+fract(time),vec2(12.9898,78.233)))*43758.5453);vec3 o=pow(clamp(c,0.,1.),vec3(1./2.2));",
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
  const key = w + "x" + h + (msaa ? "m" : "") + (SET.bloom > 0 ? "b" : "");
  if (key === GFX.lastKey && GFX.rt) return;
  GFX.lastKey = key;
  for (const k of ["rt", "b1", "b2"])
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
    const bo = Object.assign({}, opt, { depthBuffer: false });
    const bw = Math.max(1, w >> 2),
      bh = Math.max(1, h >> 2);
    GFX.b1 = new THREE.WebGLRenderTarget(bw, bh, bo);
    GFX.b2 = new THREE.WebGLRenderTarget(bw, bh, bo);
  } catch (e) {
    GFX.on = false;
  }
  GFX.w = w;
  GFX.h = h;
  compMat.uniforms.texel.value.set(1 / w, 1 / h);
}
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
    if (GPUQ) GPUQ.begin("post");
    const U = compMat.uniforms;
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
  const on = SET.textures === "high";
  m.map = on ? DETAIL.map : null;
  m.normalMap = on ? DETAIL.nmap : null;
  m.normalScale && m.normalScale.set(0.6, 0.6);
  m.needsUpdate = true;
}
/* environment lighting: a prefiltered capture of the sky plus the arena's light strips */
