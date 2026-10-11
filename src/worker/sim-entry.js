/* ============ SIMULATION WORKER ============
   Runs capture-the-flag matches on a background thread (AI, physics, navigation, destruction),
   so training the AI never stalls rendering. Messages:
     in:  { type: "train", n, models }   models = the saved ctfBrain document (or null)
     out: { type: "progress", i, n, res } after each match, then { type: "done", res, models } */
(function () {
  const CTF = self.CTF,
    K = self.KA;
  self.onmessage = e => {
    const m = e.data || {};
    if (m.type !== "train") return;
    K.STORE.setBackend(K.STORE.memoryBackend());
    if (m.models) K.STORE.save("ctfBrain", m.models);
    const n = Math.max(1, Math.min(500, m.n | 0));
    const res = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const G = CTF.Game({ mode: "sim", render: false });
      G.start();
      while (!G.over) G.step(1 / 30);
      res[G.winner < 0 ? 2 : G.winner]++;
      self.postMessage({ type: "progress", i: i + 1, n, res: res.slice() });
    }
    self.postMessage({ type: "done", res, models: K.STORE.load("ctfBrain") });
  };
})();
