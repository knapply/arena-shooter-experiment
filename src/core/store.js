/* ============ STORE: one place for everything the game saves ============
   Each saved thing is a named, versioned document. On disk (localStorage today) it is wrapped in an
   envelope {app, doc, version, savedAt, data}. Loading runs any needed migrations (version n → n+1),
   then the document's own clean() so a hand-edited or hostile file can only ever produce valid data.
   Saving first copies the previous copy to "<key>.bak", so one bad write never loses a player's data.

   The backend is swappable ({get, set, remove, keys}): a chosen folder or desktop files can replace
   localStorage later without touching the code that saves things. Career stats and map files will be
   more documents defined the same way.

   Documents: pilot (callsign, color, voice), settings (options, keys, pad), ctfTeam, ctfBrain
   (the AI's learned tactics). Each also reads its pre-store localStorage key once, then moves it. */
const STORE = (() => {
  const APP = "kinetic-arena";
  /** in-memory fallback when storage is blocked (private windows, sandboxed previews) */
  function memoryBackend() {
    const m = new Map();
    return {
      get: k => (m.has(k) ? m.get(k) : null),
      set: (k, v) => void m.set(k, v),
      remove: k => void m.delete(k),
      keys: () => [...m.keys()],
    };
  }
  function localBackend() {
    try {
      const t = "__ka_probe";
      localStorage.setItem(t, "1");
      localStorage.removeItem(t);
    } catch (e) {
      return memoryBackend();
    }
    return {
      get: k => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      remove: k => localStorage.removeItem(k),
      keys: () => Object.keys(localStorage),
    };
  }
  let backend = localBackend();
  /** @type {Record<string, {key: string, version: number, migrate: Record<number, (d: any) => any>, clean: (d: any) => any, legacy?: string, fromLegacy?: (raw: string) => any}>} */
  const DOCS = {};
  const MAX = 2_000_000;

  function define(name, o) {
    DOCS[name] = Object.assign({ key: "ka-doc-" + name, migrate: {}, clean: d => d }, o);
  }
  /** read and upgrade a document; null when there is nothing usable */
  function load(name) {
    const D = DOCS[name];
    if (!D) throw new Error("unknown document " + name);
    let env = null;
    try {
      const raw = backend.get(D.key);
      if (raw && raw.length < MAX) env = JSON.parse(raw);
    } catch (e) {}
    /* one-time move from the pre-store key */
    if (!env && D.legacy) {
      try {
        const raw = backend.get(D.legacy);
        if (raw && raw.length < MAX) {
          const data = D.fromLegacy ? D.fromLegacy(raw) : JSON.parse(raw);
          if (data != null) {
            env = { app: APP, doc: name, version: 1, data };
            save(name, upgrade(D, env));
            backend.remove(D.legacy);
            return D.clean(upgrade(D, env));
          }
        }
      } catch (e) {}
    }
    if (!env || typeof env !== "object" || env.app !== APP || env.doc !== name) return null;
    if (!(env.version >= 1) || env.version > D.version)
      return null; /* written by a newer build: leave it alone */
    try {
      return D.clean(upgrade(D, env));
    } catch (e) {
      return null;
    }
  }
  function upgrade(D, env) {
    let v = env.version | 0,
      d = env.data;
    while (v < D.version) {
      const step = D.migrate[v];
      if (step) d = step(d);
      v++;
    }
    return d;
  }
  /** write a document (backing up the previous copy first); returns false if storage refused it */
  function save(name, data) {
    const D = DOCS[name];
    if (!D) throw new Error("unknown document " + name);
    const text = JSON.stringify({ app: APP, doc: name, version: D.version, savedAt: Date.now(), data });
    if (text.length > MAX) return false;
    try {
      const prev = backend.get(D.key);
      if (prev && prev !== text) backend.set(D.key + ".bak", prev);
      backend.set(D.key, text);
      return true;
    } catch (e) {
      return false;
    }
  }
  function remove(name) {
    const D = DOCS[name];
    try {
      const prev = backend.get(D.key);
      if (prev) backend.set(D.key + ".bak", prev);
      backend.remove(D.key);
    } catch (e) {}
  }
  /** put the previous copy back (undo the last save) */
  function restoreBackup(name) {
    const D = DOCS[name];
    try {
      const b = backend.get(D.key + ".bak");
      if (!b) return false;
      backend.set(D.key, b);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---- documents ---- */
  define("pilot", {
    version: 1,
    legacy: "ka-pilot",
    clean: d => ({
      n: typeof d?.n === "string" ? d.n.slice(0, 14) : "",
      c: typeof d?.c === "string" ? d.c : "",
      vo: d?.vo !== false,
      /* bot skill for drones and CTF bots ("" until you pick one: the menu starts on Recruit) */
      sk: ["recruit", "normal", "heroic", "legendary"].includes(d?.sk) ? d.sk : "",
    }),
  });
  define("settings", {
    version: 2,
    legacy: "ka-settings-v1",
    /* v1 was the settings export file itself ({app, version, settings, keys, pad}); v2 keeps just the parts */
    migrate: { 1: d => ({ settings: d?.settings || {}, keys: d?.keys || {}, pad: d?.pad || {} }) },
    clean: d => (d && typeof d === "object" ? d : null),
  });
  define("ctfTeam", {
    version: 1,
    legacy: "ka-ctf-team",
    fromLegacy: raw => (raw === "1" ? 1 : 0),
    clean: d => (d === 1 ? 1 : 0),
  });
  define("ctfBrain", { version: 1, legacy: "ka-ctf-brain-v1", clean: d => (Array.isArray(d) ? d : null) });

  return {
    define,
    load,
    save,
    remove,
    restoreBackup,
    /** swap where documents live (a folder or desktop files later); default is localStorage */
    setBackend(b) {
      backend = b || localBackend();
    },
    memoryBackend,
    docs: () => Object.keys(DOCS),
  };
})();
