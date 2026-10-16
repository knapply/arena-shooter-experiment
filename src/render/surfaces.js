/* ============ SURFACES: what the map's standard materials add on top of three.js lighting ============
   surfMat(material) patches a MeshStandardMaterial once (onBeforeCompile):
   - Baked light (world/bake.js): the `bake` attribute's occlusion darkens ambient and reflected light,
     its color is strip light bounced onto the surface. Free, so it is on at every preset.
   - Surface detail (SURF, the "Surface detail" setting): panels laid out in world space on every
     face (staggered rows, some split, a few inset, bolts at the corners) as a bump from the seams,
     each panel a little different in tint and roughness; worn bare metal along the box's own edges
     and chipped seams; grime rising from the foot of each wall with streaks below; broad mottling
     so no two walls match.
   - Floors (SURF_FLOOR): the map's painted markings (bakeMarkings: spawn rings, pickup brackets,
     lane lines, sector letters, hazard bands at stairs) worn by foot traffic, and wet patches that go
     dark and mirror-smooth.
   - Reflectivity for the screen-space reflection pass (render/pipeline.js, High and Ultra), carried in
     the scene target's alpha as 1 - refl/2: wet patches 1, polished floor plates about a third (less
     under paint), the tops of decks and platforms a little (none in seams or grime); walls 0. Sky is
     alpha 0 (the light shafts' mask).
   Materials without the attributes (destructible cover, anything unbaked) read neutral defaults. */
const SURF_MATS = [];
/* the developer console's "bake" view */
const SURF_DEBUG = { on: false };
/* the showing map's markings: texture and its placement (x0, z0, 1/width, 1/depth) */
const SURF_U = {
  surfMark: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) },
  surfMarkB: { value: new THREE.Vector4(0, 0, 0, 0) },
};
SURF_U.surfMark.value.needsUpdate = true;
const SURF_GLSL = `uniform sampler2D surfMark;uniform vec4 surfMarkB;
float sh1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float sn2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sh1(i),sh1(i+vec2(1,0)),f.x),mix(sh1(i+vec2(0,1)),sh1(i+vec2(1,1)),f.x),f.y);}
float sfbm(vec2 p){return sn2(p)*.5+sn2(p*2.1+7.)*.3+sn2(p*4.3+3.)*.2;}
float wetMask(vec2 xz){return smoothstep(.62,.7,sfbm(xz*.13)+.12*sn2(xz*1.1));}
/* x: height (0 in a seam, 1 on a panel, lower on inset panels, raised bolts), y: the panel's hash, z: metres to its edge */
vec3 panel(vec2 p,vec2 s){float row=floor(p.y/s.y);p.x+=sh1(vec2(row,3.1))*s.x;
vec2 c=floor(p/s);float hc=sh1(c+vec2(row*.37,1.7));
if(hc>.62){s.x*=.5;c=floor(p/s);}
vec2 f=fract(p/s);vec2 d=min(f,1.-f)*s;float e=min(d.x,d.y);
float h=smoothstep(0.,.022,e);
if(hc<.12)h-=.55*smoothstep(.07,.1,e);
h+=.7*(1.-smoothstep(.012,.024,length(d-.09)));
return vec3(h,sh1(c*1.3+vec2(9.2,row)),e);}`;
function surfMat(m) {
  if (m.userData.surf) return;
  m.userData.surf = true;
  SURF_MATS.push(m);
  const floor = m === MATS.floor;
  m.defines = m.defines || {};
  if (floor) m.defines.SURF_FLOOR = "";
  /* the dressing's trim and ribs are too small for panels: plain metal, worn at the edges */
  if (Object.values(DRESS_MATS).includes(m)) m.defines.SURF_PLAIN = "";
  /* a mesh without the attributes reads these (no occlusion, no bounce, no edges) */
  /** @type {any} */ (m).defaultAttributeValues = { bake: [0, 0, 0, 1], edge: [0, 0, 0, 0] };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, SURF_U);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 bake;attribute vec4 edge;varying vec4 vBake;varying vec4 vEdge;varying vec3 vWP;varying vec3 vWN;"
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvBake=bake;vEdge=edge;vWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);"
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec4 vBake;varying vec4 vEdge;varying vec3 vWP;varying vec3 vWN;\n#ifdef SURF\n" +
          SURF_GLSL +
          "\n#endif"
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float sRough=0.,sMetal=-1.,sWet=0.,sH=0.,sRefl=0.;
#if defined(SURF_FLOOR)&&!defined(SURF)
sRefl=.3*step(.5,normalize(vWN).y);
#endif
#ifdef SURF
vec3 sN=normalize(vWN);bool sTop=abs(sN.y)>.5;
vec3 sT=sTop?vec3(1.,0.,0.):vec3(-sN.z,0.,sN.x);
vec2 sp=sTop?vWP.xz:vec2(dot(vWP,sT),vWP.y);
#ifdef SURF_FLOOR
vec4 mk=texture2D(surfMark,(vWP.xz-surfMarkB.xy)*surfMarkB.zw);
float pa=mk.a*smoothstep(.22,.55,sfbm(vWP.xz*1.6))*step(.5,sN.y);
diffuseColor.rgb=mix(diffuseColor.rgb,mk.rgb,pa*.9);
sWet=wetMask(vWP.xz)*step(.5,sN.y);
sH=dot(diffuseColor.rgb,vec3(.3,.6,.1))*(1.-sWet)*1.6;
diffuseColor.rgb*=mix(.7,1.,smoothstep(.35,.95,vBake.a))*(.88+.24*sfbm(vWP.xz*.4))*(1.-.4*sWet);
sRough=-.12*pa-.7*sWet;
sRefl=max(sWet,.38*(1.-.6*pa)*(.55+.45*sfbm(vWP.xz*.7)))*step(.5,sN.y);
#else
#ifdef SURF_PLAIN
vec3 pn=vec3(1.,.5,9.);
#else
vec3 pn=panel(sp,sTop?vec2(2.,2.):vec2(2.4,1.2));
#endif
sH=pn.x;
diffuseColor.rgb*=(.9+.2*pn.y)*mix(vec3(1.),vec3(.93,.98,1.07),step(.72,fract(pn.y*7.)))*(.84+.32*sfbm(sp*.3));
float hgt=sTop?9.:sp.y-vEdge.z;
float grime=(1.-smoothstep(0.,1.7,hgt))*(.5+.5*sn2(sp*vec2(2.5,.9)));
grime=max(grime,smoothstep(.6,.95,sn2(vec2(sp.x*4.,sp.y*.3)))*.4);
diffuseColor.rgb*=1.-grime*.5;
float sE=vEdge.y>vEdge.x?min(min(sp.x-vEdge.x,vEdge.y-sp.x),min(sp.y-vEdge.z,vEdge.w-sp.y)):9.;
float wear=(1.-smoothstep(0.,.015+.05*sn2(sp*7.),sE))*smoothstep(.45,.6,sn2(sp*13.));
wear=max(wear,(1.-smoothstep(.0,.03,pn.z))*.22*step(.7,sn2(sp*9.)));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.4,.42,.44),wear*.8);
sRough=(pn.y-.5)*.2+grime*.25-wear*.3;sMetal=wear;
#ifndef SURF_PLAIN
sRefl=.18*step(.5,sN.y)*smoothstep(.6,1.,pn.x)*(.5+.5*pn.y)*(1.-grime);
#endif
#endif
#endif`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
roughnessFactor=clamp(roughnessFactor+sRough,.04,1.);if(sMetal>0.)metalnessFactor=mix(metalnessFactor,.85,sMetal);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
#ifdef SURF
{vec3 dpx=dFdx(vWP),dpy=dFdy(vWP);float hx=dFdx(sH),hy=dFdy(sH);
vec3 sR1=cross(dpy,sN),sR2=cross(sN,dpx);float sDet=dot(dpx,sR1);
vec3 bn=abs(sDet)>1e-12?normalize(abs(sDet)*sN-sign(sDet)*(hx*sR1+hy*sR2)*.012):sN;
normal=normalize((viewMatrix*vec4(faceDirection*bn,0.)).xyz);}
#endif`
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
float bAO=vBake.a;
reflectedLight.indirectDiffuse*=bAO;reflectedLight.indirectSpecular*=bAO*bAO;
reflectedLight.directDiffuse*=mix(1.,bAO,.4);reflectedLight.directSpecular*=mix(1.,bAO,.4);
totalEmissiveRadiance+=vBake.rgb*diffuseColor.rgb;`
      )
      .replace(
        "#include <tonemapping_fragment>",
        "gl_FragColor.a=1.-.5*sRefl;\n#include <tonemapping_fragment>"
      );
    if (SURF_DEBUG.on)
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\ngl_FragColor=vec4(vec3(vBake.a)*.3+vBake.rgb*.5,1.);"
      );
  };
  /* the program changes with the debug view */
  m.customProgramCacheKey = () => (SURF_DEBUG.on ? "surf-dbg" : "surf");
  applySurf(m);
}
/** the Surface detail setting: procedural detail on, the old tiled panel textures off */
function applySurf(m) {
  const on = SET.textures === "high";
  if (on !== Object.prototype.hasOwnProperty.call(m.defines, "SURF")) {
    if (on) m.defines.SURF = "";
    else delete m.defines.SURF;
  }
  m.needsUpdate = true;
}
/* ---- floor markings: painted per map from its document, sampled in world space ---- */
function bakeMarkings(doc, solids) {
  const B = doc.bounds,
    W = B.x1 - B.x0 + 8,
    D = B.z1 - B.z0 + 8,
    x0 = B.x0 - 4,
    z0 = B.z0 - 4;
  const N = 1024,
    k = N / Math.max(W, D);
  const c = document.createElement("canvas");
  c.width = Math.ceil(W * k);
  c.height = Math.ceil(D * k);
  const x = c.getContext("2d");
  /* world metres -> canvas */
  x.setTransform(k, 0, 0, k, -x0 * k, -z0 * k);
  const team = doc.symmetry === "rotate180";
  const zoneCol = (px, pz) =>
    team
      ? Math.abs(pz) < 12
        ? "#b98cff"
        : pz < 0
          ? "#ff6a5c"
          : "#5aa9ff"
      : px >= 0
        ? pz >= 0
          ? "#62cdff"
          : "#58f0b4"
        : pz >= 0
          ? "#b98cff"
          : "#ffb347";
  const open = (px, pz, r) =>
    !solids.some(
      b => b.y0 < 0.3 && b.y1 > 0.3 && px + r > b.x0 && px - r < b.x1 && pz + r > b.z0 && pz - r < b.z1
    );
  const AMBER = "#e9a23b",
    WHITE = "#d9dee0";
  x.lineCap = "butt";
  /* lane lines through the middle, dashed */
  x.setLineDash([1.6, 1.2]);
  x.lineWidth = 0.12;
  for (const [ax, az, bx, bz] of [
    [B.x0 + 3, 0, B.x1 - 3, 0],
    [0, B.z0 + 3, 0, B.z1 - 3],
  ]) {
    x.strokeStyle = WHITE;
    x.beginPath();
    x.moveTo(ax, az);
    x.lineTo(bx, bz);
    x.stroke();
  }
  x.setLineDash([]);
  /* spawn rings with a heading tick */
  const spawns = doc.spawns.teams ? doc.spawns.teams.flat() : doc.spawns.ffa;
  for (const s of spawns) {
    if (s[1] > 0.2) continue;
    x.strokeStyle = zoneCol(s[0], s[2]);
    x.lineWidth = 0.1;
    x.beginPath();
    x.arc(s[0], s[2], 0.95, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 0.05;
    x.beginPath();
    x.arc(s[0], s[2], 1.25, 0.3, Math.PI * 2 - 0.3);
    x.stroke();
    x.fillStyle = x.strokeStyle;
    x.beginPath();
    x.moveTo(s[0] - 0.25, s[2] - 1.05);
    x.lineTo(s[0] + 0.25, s[2] - 1.05);
    x.lineTo(s[0], s[2] - 1.5);
    x.fill();
  }
  /* flag stands: a dashed team circle */
  for (const [i, f] of (doc.flags || []).entries()) {
    x.strokeStyle = i ? "#5aa9ff" : "#ff6a5c";
    x.lineWidth = 0.18;
    x.setLineDash([0.7, 0.4]);
    x.beginPath();
    x.arc(f[0], f[2], 2.6, 0, Math.PI * 2);
    x.stroke();
    x.setLineDash([]);
  }
  /* weapon pads: corner brackets and the weapon's name */
  for (const p of doc.pickups || []) {
    if (p.p[1] > 0.2 && !open(p.p[0], p.p[2], 0.5)) continue;
    x.strokeStyle = AMBER;
    x.lineWidth = 0.1;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      x.beginPath();
      x.moveTo(p.p[0] + sx * 1.3, p.p[2] + sz * 0.8);
      x.lineTo(p.p[0] + sx * 1.3, p.p[2] + sz * 1.3);
      x.lineTo(p.p[0] + sx * 0.8, p.p[2] + sz * 1.3);
      x.stroke();
    }
  }
  /* hazard bands at the foot of every flight of stairs */
  for (const pc of mapPieces(doc)) {
    if (pc.type !== "stairs") continue;
    const [dx, dz] = pc.dir,
      len = pc.steps * 0.72;
    const fx = pc.p[0] + dx * (len + 0.35),
      fz = pc.p[1] + dz * (len + 0.35);
    x.save();
    x.translate(fx, fz);
    x.rotate(Math.atan2(dz, dx));
    x.beginPath();
    x.rect(-0.2, -pc.width / 2, 0.4, pc.width);
    x.clip();
    x.fillStyle = AMBER;
    x.fillRect(-0.2, -pc.width / 2, 0.4, pc.width);
    x.fillStyle = "#15191c";
    for (let s = -pc.width; s < pc.width; s += 0.5) {
      x.beginPath();
      x.moveTo(-0.2, s);
      x.lineTo(-0.2, s + 0.25);
      x.lineTo(0.2, s + 0.5);
      x.lineTo(0.2, s + 0.25);
      x.fill();
    }
    x.restore();
  }
  /* sector letters and stencils in open floor, seeded by the map */
  let seed = 7;
  for (const ch of String(doc.id)) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) | 0) >>> 8) / 16777216;
  const words = ["NO STANDING", "KEEP CLEAR", "DECK 7", "LOAD ZONE", "VENT 3", "BAY 12"];
  /** @type {[number, number, string][]} */
  const quads = team
    ? [
        [0, -30, "R"],
        [0, 30, "B"],
        [-14, 0, "M"],
      ]
    : [
        [-18, -18, "D"],
        [18, -18, "C"],
        [18, 18, "A"],
        [-18, 18, "B"],
      ];
  x.textAlign = "center";
  x.textBaseline = "middle";
  for (const [qx, qz, letter] of quads) {
    for (let t = 0; t < 30; t++) {
      const px = qx + (rnd() - 0.5) * 16,
        pz = qz + (rnd() - 0.5) * 16;
      if (!open(px, pz, 2.4)) continue;
      x.save();
      x.translate(px, pz);
      x.rotate(Math.round(rnd() * 4) * (Math.PI / 2));
      x.fillStyle = zoneCol(px, pz);
      x.font = "bold 3.4px Arial, sans-serif";
      x.fillText(letter, 0, 0);
      x.font = "bold 0.42px monospace";
      x.fillStyle = WHITE;
      x.fillText(words[(rnd() * words.length) | 0], 0, 2.25);
      x.restore();
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { tex: t, b: new THREE.Vector4(x0, z0, 1 / (c.width / k), 1 / (c.height / k)) };
}
