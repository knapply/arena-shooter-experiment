/* ============ SIM ENVIRONMENT: what the simulation needs from a page, inside a worker (or Node) ============ */
(function (g) {
  g.window = g;
  if (typeof g.document === "undefined") {
    /* a 2D context where every drawing call is a no-op (textures are never seen here) */
    const grad = { addColorStop() {} };
    const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => grad) });
    g.document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }) };
  }
})(typeof self !== "undefined" ? self : globalThis);
