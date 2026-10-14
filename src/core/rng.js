/* ============ RNG: seeded randomness for anything that changes the simulation ============
   AI decisions, spawn choices and rules draw from rand(), so a match started with the same seed and
   the same inputs plays out the same way (replays, bug reproduction, deterministic tests).
   Purely visual randomness (sparks, debris, camera shake) keeps using Math.random. */
export const RNG = (() => {
  let s = (Math.random() * 4294967296) >>> 0,
    seed0 = s;
  /** mulberry32: fast, small state, good enough for gameplay */
  function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    rand,
    /** restart the sequence; returns the seed so it can be recorded */
    seed(n) {
      seed0 = s = (n == null ? Math.random() * 4294967296 : n) >>> 0;
      return seed0;
    },
    get current() {
      return seed0;
    },
  };
})();
export const rand = RNG.rand;
