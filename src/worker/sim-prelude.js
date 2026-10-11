/* ============ SIM PRELUDE: the engine globals the simulation modules expect, minus rendering ============ */
const V3 = THREE.Vector3;
const POOL = new Map();
const SET = { destruct: "full", destructStrength: 1, debris: 1, regen: "45", particles: 1 };
const SET_HOOKS = [];
let now = 0;
const detailMat = () => {};
const scaleBoxUV = () => {};
const pc = n => n;
const num = (v, lo, hi, d) => {
  v = +v;
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d || 0;
};
const me = { pos: new V3() };
const bots = [];
const scene = new THREE.Scene();
scene.fog = {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
