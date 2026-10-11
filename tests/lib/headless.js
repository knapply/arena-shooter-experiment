/* Loads the simulation-relevant engine modules plus the CTF rules into Node, with a stubbed renderer.
   Used for fast headless AI matches (no browser). */
const fs = require("fs"),
  path = require("path");
const SRC = path.join(__dirname, "..", "..", "src");
const read = p => fs.readFileSync(path.join(SRC, p), "utf8");
global.window = global;
global.localStorage = {
  _: {},
  getItem(k) {
    return this._[k] || null;
  },
  setItem(k, v) {
    this._[k] = v;
  },
  removeItem(k) {
    delete this._[k];
  },
};
const THREE = require("../stubs/three-node.js");
global.THREE = THREE;
const ctx = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
global.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
const ENGINE = ["world/destruction.js", "world/maps/arena.js", "world/physics.js", "weapons/grenades.js"];
const prelude = `const V3=THREE.Vector3;const POOL=new Map();const SET={destruct:'full',destructStrength:1,debris:1,regen:'45',particles:1};const SET_HOOKS=[];let now=0;
const detailMat=()=>{};const scaleBoxUV=()=>{};const pc=n=>n;const num=(v,lo,hi,d)=>{v=+v;return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):(d||0);};
const me={pos:new V3()};const bots=[];const scene=new THREE.Scene();scene.fog={};const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const rnd=(a,b)=>a+Math.random()*(b-a);
`;
const exportsJs = `window.KA={detailMat,DESTR,damageBox,damageRadius,rayWorldHit,resetDestruction,NadeWorld,NADES,MAIN_NADES,nadeDmg,losClear,solveThrow,toast(){},THREE,clamp,rnd,scene,SOLID,MATS,box,strip,stairs,ARENA_G,setMapGroup(g){MAPG=g;},
 Body,R,H_STAND,H_CROUCH,GRAV,groundBelow,freeAt,rayWorld,rayTarget,rayBox,RELOAD_TIME:1.8,myName:"You",wi:1,
 hurtMe(){},tracer(){},spark(){},sfx(){},distVol(){return 0},shock(){},thrustPuff(){},dust(){},updPickups(){}};`;
(0, eval)(`(function(){${prelude}\n${ENGINE.map(read).join("\n")}\n${exportsJs}})()`);
for (const f of [
  "modes/ctf/map.js",
  "modes/ctf/nav.js",
  "modes/ctf/brain.js",
  "modes/ctf/agent.js",
  "modes/ctf/rules.js",
])
  (0, eval)(read(f));
module.exports = window.CTF;
