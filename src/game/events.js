/* ============ EVENTS: one stream for everything that happens in a match ============
   Game code emits; the kill feed, medals, announcer and (later) stats, highlights and challenges
   subscribe. Every event carries the stable pilot ids from game/pilot.js plus names for display,
   the weapon where relevant, and the current map and mode, so a stats recorder can be added later
   as just another subscriber without touching gameplay code.

   Types and their fields (all also get seq, t, map, mode):
     kill        killer, killerName, victim, victimName, weapon, head
     damage      by, victim, amount, weapon, head, shieldBroken
     medal       pilot, medal
     spree       pilot, count            (5, 10, 15, 20 kills without dying)
     pickup      pilot, item
     spawn       pilot
     flagTaken / flagDrop / flagReturn / flagReset / capture   pilot, team
     matchStart  —
     matchEnd    winner
   Ids: "local" is you; "world" is a fall or anything without a pilot. */
const EVENTS = (() => {
  /** @type {Map<string, Set<(e: any) => void>>} */
  const subs = new Map();
  /** @type {Set<(e: any) => void>} */
  const all = new Set();
  const ctx = { map: "arena", mode: "ffa" };
  const log = [];
  const LOG_MAX = 400;
  let seq = 0;
  /** subscribe to one type, or "*" for everything; returns an unsubscribe function */
  function on(type, fn) {
    const set = type === "*" ? all : subs.get(type) || subs.set(type, new Set()).get(type);
    set.add(fn);
    return () => set.delete(fn);
  }
  function emit(type, data) {
    const e = Object.assign({ type, seq: ++seq, t: now }, ctx, data);
    log.push(e);
    if (log.length > LOG_MAX) log.shift();
    const set = subs.get(type);
    /* one broken subscriber must not take the others (or the game loop) down with it */
    if (set)
      for (const fn of set)
        try {
          fn(e);
        } catch (err) {
          console.error("event subscriber", type, err);
        }
    for (const fn of all)
      try {
        fn(e);
      } catch (err) {
        console.error("event subscriber *", err);
      }
    return e;
  }
  return {
    on,
    emit,
    /** map and mode stamped onto every following event */
    setContext(o) {
      Object.assign(ctx, o);
    },
    context: () => Object.assign({}, ctx),
    /** the last n events (newest last) */
    recent: (n = 50) => log.slice(-n),
  };
})();
