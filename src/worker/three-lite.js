/* ============ THREE-LITE: just enough of three.js for the simulation to run without a GPU ============
   The game's own vectors (core/vec3.js, loaded before this) and everything else (meshes, materials,
   scenes) as inert stand-ins. Used by the background simulation worker and by the headless tests. */
function U() {
  const store = {};
  const f = function () {
    return p;
  };
  const p = new Proxy(f, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === "then" || k === "toJSON") return undefined;
      const v = U();
      store[k] = v;
      return v;
    },
    set(t, k, v) {
      store[k] = v;
      return true;
    },
    construct() {
      return U();
    },
    apply() {
      return p;
    },
  });
  return p;
}
const THREE = new Proxy(
  { Vector3: Vec3 },
  {
    get(t, k) {
      return (
        t[k] ||
        function () {
          return U();
        }
      );
    },
  }
);

if (typeof module !== "undefined") module.exports = THREE;
