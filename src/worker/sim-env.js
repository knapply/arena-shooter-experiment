/* ============ SIM ENVIRONMENT: what the simulation needs from a page, inside a worker (or Node) ============ */
(function (g) {
  g.window = g;
  if (typeof g.document === "undefined") {
    const ctx2d = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
    g.document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }) };
  }
})(typeof self !== "undefined" ? self : globalThis);
