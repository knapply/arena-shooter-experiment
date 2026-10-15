/* ============ CHARACTER LOOK: shading on top of the pilot rig's materials ============
   styleRig(rig) runs once per pilot (the last thing makePilot does) and only touches materials, so
   the rig's animation code stays its own:
   - Armor (CHAR, with Surface detail): a rim light in the team color, panel lines cut into the
     plates (laid out on the bind pose, so they ride with the body), and a team pattern on the main
     plates (chevrons for warm teams, a digital camo for cool ones, stripes for the rest).
   - The visor pulses with the shield: a steady warm glow when full, quicker and redder as it drops,
     a hard flicker with no shield at all.
   - The shield shell (Combat effects above Basic): a hex lattice that lights up and a ripple that
     runs out from where the hit landed. */
const RIG_LOOK = new Set();
const _rh = new THREE.Vector3(),
  _rh2 = new THREE.Vector3();
const CHAR_GLSL = `varying vec3 vOP;uniform vec3 cTeam;uniform float cPat;
float ch1(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}`;
function charPatch(m, team, pat, main) {
  m.defines = m.defines || {};
  if (main) m.defines.CHAR_MAIN = "";
  m.onBeforeCompile = sh => {
    sh.uniforms.cTeam = { value: team };
    sh.uniforms.cPat = { value: pat };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vOP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOP=position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n#ifdef CHAR\n" + CHAR_GLSL + "\n#endif")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float cLine=0.;
#ifdef CHAR
{vec3 p=vOP;
float ly=abs(fract(p.y*7.3+.15*sin(p.x*9.))-.5);float lx=abs(p.x);
cLine=max(smoothstep(.43,.49,ly),1.-smoothstep(.004,.009,lx))*step(.25,abs(fract(p.z*3.1)-.5)+.2);
diffuseColor.rgb*=1.-.5*cLine;
#ifdef CHAR_MAIN
float pt=0.;
if(cPat<.5)pt=step(fract(p.y*5.-abs(p.x)*5.),.2);
else if(cPat<1.5)pt=step(.68,ch1(floor(p*vec3(16.,22.,16.))));
else pt=step(fract((p.x+p.y+p.z)*6.),.22);
diffuseColor.rgb*=1.-.28*pt;
#endif
}
#endif`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
#ifdef CHAR
{float fr=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);
totalEmissiveRadiance+=mix(cTeam,vec3(.55,.7,1.),.35)*fr*.45*(1.-cLine);}
#endif`
      );
  };
  m.customProgramCacheKey = () => "char";
  RIG_LOOK.add(m);
  applyCharLook(m);
}
function applyCharLook(m) {
  const on = SET.textures === "high";
  if (on !== "CHAR" in m.defines) {
    if (on) m.defines.CHAR = "";
    else delete m.defines.CHAR;
    m.needsUpdate = true;
  }
}
/* the team pattern follows the armor's hue: warm teams chevrons, cool teams camo, the rest stripes */
function teamPattern(c) {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.h < 0.12 || hsl.h > 0.9 ? 0 : hsl.h > 0.45 && hsl.h < 0.75 ? 1 : 2;
}
const HEX_FRAG = `uniform float uI;uniform float uT;uniform vec3 uC;uniform vec4 uH;uniform float uHex;varying vec3 vN;varying vec3 vV;varying vec3 vP;varying vec3 vO;
float hexD(vec2 p){const vec2 s=vec2(1.,1.7320508);vec2 a=mod(p,s)-s*.5,b=mod(p-s*.5,s)-s*.5;vec2 g=dot(a,a)<dot(b,b)?a:b;vec2 q=abs(g);return max(dot(q,vec2(.5,.8660254)),q.x);}
void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.5);
float band=.5+.5*sin(vP.y*42.-uT*26.)*sin(vP.x*23.+vP.z*19.+uT*11.);
float a=clamp(uI*(f*1.4+.2)*(.45+.55*band),0.,1.);
if(uHex>.5){float age=uT-uH.w;float r=distance(vP,uH.xyz);
float hx=smoothstep(.36,.47,hexD(vec2(atan(vO.x,vO.z)*.55,vO.y)*16.));
float ring=exp(-pow((r-age*3.2)*9.,2.))*exp(-age*2.5);float spot=exp(-r*7.)*exp(-age*6.);
a=clamp(a*(.55+.9*hx)+(ring*(.35+hx)+spot)*step(0.,age)*1.4,0.,1.);}
gl_FragColor=vec4(uC*(1.+f*1.5),a);}`;
function styleRig(rig) {
  const sk = rig.root.children.filter(o => o.isSkinnedMesh);
  if (sk.length < 7) return;
  const team = new THREE.Color(rig.color);
  const pat = teamPattern(team);
  charPatch(sk[ARM].material, team, pat, true);
  charPatch(sk[ARM2].material, team, pat, false);
  /* the visor follows the shield */
  const visor = sk[VISOR].material,
    base = visor.emissive.clone(),
    low = new THREE.Color("#ff3a1e");
  sk[VISOR].onBeforeRender = () => {
    if (SET.textures !== "high") {
      visor.emissive.copy(base);
      visor.emissiveIntensity = 0.22;
      return;
    }
    const S = rig.S,
      k = Math.max(0, Math.min(1, S.sh / 70));
    const t = S.t;
    const pulse = k > 0 ? 0.5 + 0.5 * Math.sin(t * (2 + (1 - k) * 9)) : Math.random() < 0.5 ? 1 : 0.2;
    visor.emissive.copy(base).lerp(low, 1 - k);
    visor.emissiveIntensity = 0.25 + pulse * (0.25 + (1 - k) * 0.9);
  };
  /* the shield shell: hex lattice and a ripple from the hit */
  const shell = sk[6].material;
  if (shell.uniforms && shell.fragmentShader.includes("uniform float uI")) {
    shell.uniforms.uH = { value: new THREE.Vector4(0, -99, 0, -9) };
    shell.uniforms.uHex = { value: 1 };
    shell.vertexShader = shell.vertexShader
      .replace("varying vec3 vP;", "varying vec3 vP;varying vec3 vO;")
      .replace("vP=(modelMatrix", "vO=position;vP=(modelMatrix");
    shell.fragmentShader = HEX_FRAG;
    shell.onBeforeCompile = () => (shell.uniforms.uHex.value = fxOn() ? 1 : 0);
    const flash = rig.flashHit;
    rig.flashHit = function (from, kind) {
      rig.chestWorld(_rh);
      if (from) _rh2.copy(from).sub(_rh).setY(0).normalize().multiplyScalar(0.32);
      else _rh2.set(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3));
      shell.uniforms.uH.value.set(_rh.x + _rh2.x, _rh.y + rnd(-0.35, 0.3), _rh.z + _rh2.z, rig.S.t);
      shell.uniforms.uHex.value = fxOn() ? 1 : 0;
      return flash.call(this, from, kind);
    };
  }
}
SET_HOOKS.push(() => {
  for (const m of RIG_LOOK) applyCharLook(m);
});
