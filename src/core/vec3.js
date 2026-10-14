/* ============ VEC3: the game's own 3D vector ============
   The simulation (movement, collision, grenades, rockets, the AI and rules) does its math with this, in
   the game, the background worker and the headless tests alike, so a three.js upgrade cannot change how
   a match plays out, and seeded matches replay the same everywhere. It is the engine's V3 and what
   KA.THREE.Vector3 hands the modes. In the browser its prototype continues into three's Vector3
   (core/prelude.js), so rendering code can still call three's methods on it (project, applyMatrix4,
   applyQuaternion ...) and three accepts it anywhere it takes a vector; the methods below are the
   game's own and take precedence. */
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setY(y) {
    this.y = y;
    return this;
  }
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }
  copy(v) {
    return this.set(v.x, v.y, v.z);
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  subVectors(a, b) {
    return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  length() {
    return Math.sqrt(this.lengthSq());
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  normalize() {
    const l = this.length() || 1;
    return this.multiplyScalar(1 / l);
  }
  lerp(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }
  lerpVectors(a, b, t) {
    return this.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  }
  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  /** as three's: into `array` at `offset` (a new array by default) */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }
}
/** three.js checks this flag where it takes a vector or numbers (lookAt, Box3, ...) */
// @ts-ignore: a prototype flag, as three's own Vector3 has
Vec3.prototype.isVector3 = true;
