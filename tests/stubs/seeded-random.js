/* Visual tests: a seeded Math.random, so presentation-only randomness (idle phases, glances,
   flinches) draws the same frame on every run. The menu runs for however many frames the machine
   manages before a capture, so tests reseed with __seedRandom(n) right before stepping a scene. */
(() => {
  let s = 1;
  window.__seedRandom = n => (s = n | 0);
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
