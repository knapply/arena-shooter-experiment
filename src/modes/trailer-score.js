/* ===== Trailer score: an original piece synthesized live with Web Audio (no samples), scored to the
   picture in modes/trailer.js ("The Drop"): a drone and a heartbeat for the drop, a hit on each black
   card, slow motion answered by sub drops and bells, the full band for the weapons and the modes, a
   plucked breakdown for the numbers, a frozen-time climax and a choir on the title.
   score(ctx, out, t0) schedules everything on any AudioContext, including OfflineAudioContext for rendering to a file. ===== */
(function () {
  const BPM = 120,
    BEAT = 60 / BPM,
    BAR = BEAT * 4;
  const midi = s => {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    return (
      12 * (+m[3] + 1) +
      { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] +
      (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)
    );
  };
  const hz = n => 440 * Math.pow(2, ((typeof n === "string" ? midi(n) : n) - 69) / 12);
  /* no acts inserted: the arrangement below is written at the cut's own times (modes/trailer.js) */
  /** @type {[number, number][]} */
  const INSERTS = [];
  const remap = x => x;
  const LENGTH = 112;
  /* chord tones for each bar of the drop and theme (D minor: i - VI - III - VII) */
  const PROG = [
    ["D3", "F3", "A3"],
    ["Bb2", "D3", "F3"],
    ["F3", "A3", "C4"],
    ["C3", "E3", "G3"],
  ];
  const ROOT = ["D2", "Bb1", "F2", "C2"];
  let timer = 0;
  /** stop feeding a live score (the trailer ended early) */
  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
  }
  function score(ctx, out, t0) {
    const sr = ctx.sampleRate;
    /* ---------- shared buses ---------- */
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 0.82;
    comp.connect(master);
    master.connect(out);
    const bus = ctx.createGain();
    bus.connect(comp);
    const verb = ctx.createConvolver();
    {
      const len = Math.floor(sr * 3.4),
        ir = ctx.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      verb.buffer = ir;
    }
    const verbIn = ctx.createGain();
    verbIn.gain.value = 0.5;
    verbIn.connect(verb);
    verb.connect(comp);
    const dly = ctx.createDelay(1);
    dly.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const dlf = ctx.createBiquadFilter();
    dlf.type = "lowpass";
    dlf.frequency.value = 2600;
    dly.connect(dlf);
    dlf.connect(fb);
    fb.connect(dly);
    const dlyIn = ctx.createGain();
    dlyIn.gain.value = 0.35;
    dlyIn.connect(dly);
    dlf.connect(bus);
    let NB = null;
    const noise = () => {
      if (!NB) {
        NB = ctx.createBuffer(1, sr * 2, sr);
        const d = NB.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = ctx.createBufferSource();
      s.buffer = NB;
      s.loop = true;
      return s;
    };
    /* old arrangement times go through remap; the new acts are written at their own (absolute) times */
    let mapT = remap;
    const at = x => t0 + mapT(x);
    const gainEnv = (g, t, a, peak, hold, rel) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0005, t + a + hold + rel);
    };
    const send = (node, dry, wet, dl) => {
      const g = ctx.createGain();
      g.gain.value = dry;
      node.connect(g);
      g.connect(bus);
      if (wet) {
        const w = ctx.createGain();
        w.gain.value = wet;
        node.connect(w);
        w.connect(verbIn);
      }
      if (dl) {
        const d = ctx.createGain();
        d.gain.value = dl;
        node.connect(d);
        d.connect(dlyIn);
      }
    };
    /* ---------- instruments ---------- */
    const VOWEL = { ah: [730, 1090, 2440], oh: [570, 840, 2410], oo: [400, 800, 2300] };
    /* choir voice: detuned saws through a formant filter bank with slow attack and vibrato */
    function choir(t, note, dur, vel = 0.12, vowel = "ah", wet = 0.9) {
      const f = hz(note);
      const g = ctx.createGain();
      const sum = ctx.createGain();
      sum.gain.value = 0.33;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.1;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.8);
      lfo.connect(lg);
      lfo.start(t);
      lfo.stop(t + dur + 1.2);
      for (const d of [-7, 0, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f * Math.pow(2, d / 1200);
        lg.connect(o.frequency);
        o.connect(sum);
        o.start(t);
        o.stop(t + dur + 1.2);
      }
      const F = VOWEL[vowel];
      [1, 0.5, 0.2].forEach((a, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = F[i];
        bp.Q.value = i ? 6 : 4.5;
        const ga = ctx.createGain();
        ga.gain.value = a * 2.2;
        sum.connect(bp);
        bp.connect(ga);
        ga.connect(g);
      });
      /* chest resonance: keeps the sung fundamental and low partials that the vowel filters remove */
      {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = Math.min(900, f * 3.2);
        lp.Q.value = 0.6;
        const ga = ctx.createGain();
        ga.gain.value = 0.55;
        sum.connect(lp);
        lp.connect(ga);
        ga.connect(g);
      }
      gainEnv(g, t, 0.38, vel, Math.max(0, dur - 0.38), 0.9);
      send(g, 0.55, wet);
    }
    function drone(t, note, dur, vel = 0.08) {
      const f = hz(note);
      const g = ctx.createGain();
      for (const [type, m, a] of /** @type {[OscillatorType, number, number][]} */ ([
        ["sine", 1, 1],
        ["triangle", 2, 0.35],
        ["sine", 0.5, 0.6],
      ])) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * m;
        const ga = ctx.createGain();
        ga.gain.value = a;
        o.connect(ga);
        ga.connect(g);
        o.start(t);
        o.stop(t + dur + 2.5);
      }
      gainEnv(g, t, 1.6, vel, Math.max(0, dur - 1.6), 2);
      send(g, 0.8, 0.5);
    }
    function taiko(t, vel = 1) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.45);
      const g = ctx.createGain();
      gainEnv(g, t, 0.004, 0.75 * vel, 0.02, 0.6);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.8);
      send(g, 0.9, 0.35);
      const n = noise(),
        lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      const ng = ctx.createGain();
      gainEnv(ng, t, 0.002, 0.45 * vel, 0, 0.18);
      n.connect(lp);
      lp.connect(ng);
      n.start(t);
      n.stop(t + 0.3);
      send(ng, 0.8, 0.3);
    }
    function kick(t, vel = 1) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = ctx.createGain();
      gainEnv(g, t, 0.002, 0.95 * vel, 0.03, 0.32);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.45);
      send(g, 1, 0);
      const c = noise(),
        hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2500;
      const cg = ctx.createGain();
      gainEnv(cg, t, 0.001, 0.12 * vel, 0, 0.02);
      c.connect(hp);
      hp.connect(cg);
      c.start(t);
      c.stop(t + 0.05);
      send(cg, 1, 0);
    }
    function snare(t, vel = 1) {
      const n = noise(),
        bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1900;
      bp.Q.value = 0.55;
      const g = ctx.createGain();
      gainEnv(g, t, 0.002, 0.5 * vel, 0.01, 0.2);
      n.connect(bp);
      bp.connect(g);
      n.start(t);
      n.stop(t + 0.3);
      send(g, 0.8, 0.45);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(210, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      const og = ctx.createGain();
      gainEnv(og, t, 0.002, 0.35 * vel, 0, 0.1);
      o.connect(og);
      o.start(t);
      o.stop(t + 0.15);
      send(og, 0.8, 0.2);
    }
    function hat(t, vel = 1, open = false) {
      const n = noise(),
        hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7200;
      const g = ctx.createGain();
      gainEnv(g, t, 0.001, 0.13 * vel, 0, open ? 0.22 : 0.045);
      n.connect(hp);
      hp.connect(g);
      n.start(t);
      n.stop(t + 0.3);
      send(g, 0.7, 0.05);
    }
    function clap(t, vel = 1) {
      for (const d of [0, 0.011, 0.024]) {
        const n = noise(),
          bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1500;
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        gainEnv(g, t + d, 0.001, 0.16 * vel, 0, d === 0.024 ? 0.16 : 0.03);
        n.connect(bp);
        bp.connect(g);
        n.start(t + d);
        n.stop(t + d + 0.3);
        send(g, 0.6, 0.25);
      }
    }
    function crash(t, vel = 1) {
      const n = noise(),
        hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4200;
      const g = ctx.createGain();
      gainEnv(g, t, 0.002, 0.12 * vel, 0, 1.8);
      n.connect(hp);
      hp.connect(g);
      n.start(t);
      n.stop(t + 2.2);
      send(g, 0.6, 0.3);
    }
    /* driving 16th-note synth pulse (the synthwave engine under the drop) */
    function pulse(t, note, vel = 0.06) {
      const o = ctx.createOscillator(),
        o2 = ctx.createOscillator(),
        lp = ctx.createBiquadFilter(),
        g = ctx.createGain();
      o.type = "sawtooth";
      o2.type = "square";
      o.frequency.value = hz(note);
      o2.frequency.value = hz(note) * 1.003;
      lp.type = "lowpass";
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(380, t + 0.11);
      gainEnv(g, t, 0.003, vel, 0, 0.1);
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g);
      o.start(t);
      o2.start(t);
      o.stop(t + 0.16);
      o2.stop(t + 0.16);
      g.connect(shaper);
      send(g, 0.15, 0.2);
    }
    function tom(t, note, vel = 1) {
      const o = ctx.createOscillator();
      o.type = "sine";
      const f = hz(note);
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      const g = ctx.createGain();
      gainEnv(g, t, 0.002, 0.6 * vel, 0.02, 0.42);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.6);
      send(g, 0.85, 0.5);
    }
    /* synthwave bass: saw + sub through a plucky lowpass, lightly driven */
    const shaper = ctx.createWaveShaper();
    {
      const c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = i / 511.5 - 1;
        c[i] = Math.tanh(x * 2.2);
      }
      shaper.curve = c;
    }
    const bassBus = ctx.createGain();
    bassBus.gain.value = 0.5;
    bassBus.connect(shaper);
    shaper.connect(bus);
    function bass(t, note, dur, vel = 1) {
      const f = hz(note);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(220, t);
      lp.frequency.linearRampToValueAtTime(1500 * vel, t + 0.012);
      lp.frequency.exponentialRampToValueAtTime(260, t + dur * 0.9);
      const g = ctx.createGain();
      gainEnv(g, t, 0.004, 0.5 * vel, dur * 0.5, dur * 0.45);
      for (const [type, m, a] of /** @type {[OscillatorType, number, number][]} */ ([
        ["sawtooth", 1, 0.7],
        ["square", 0.5, 0.5],
      ])) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * m;
        const ga = ctx.createGain();
        ga.gain.value = a;
        o.connect(ga);
        ga.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
      lp.connect(g);
      g.connect(bassBus);
    }
    /* gated pad, ducked on every beat like a sidechained synth */
    function pad(t, notes, dur, vel = 0.05) {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2100;
      lp.Q.value = 0.7;
      lp.connect(g);
      for (const n of notes)
        for (const d of [-9, 9]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = hz(n) * Math.pow(2, d / 1200);
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + 0.4);
        }
      g.gain.setValueAtTime(0, t);
      for (let b = 0; b < dur / BEAT - 0.01; b++) {
        const bt = t + b * BEAT;
        g.gain.setValueAtTime(vel * 0.18, bt);
        g.gain.linearRampToValueAtTime(vel, bt + BEAT * 0.7);
      }
      g.gain.setValueAtTime(vel, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.35);
      send(g, 0.75, 0.35);
    }
    function pluck(t, note, vel = 0.1) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = hz(note);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.16);
      const g = ctx.createGain();
      gainEnv(g, t, 0.002, vel, 0, 0.17);
      o.connect(lp);
      lp.connect(g);
      o.start(t);
      o.stop(t + 0.25);
      send(g, 0.55, 0.2, 0.9);
    }
    /* lead: one continuous voice with glide, detuned saws plus a square an octave down, vibrato, delay and reverb */
    function lead(t, line, vel = 0.11) {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3400;
      lp.Q.value = 1.2;
      lp.connect(g);
      const oscs = [
        ["sawtooth", 1, -8, 0.5],
        ["sawtooth", 1, 8, 0.5],
        ["square", 0.5, 0, 0.32],
      ].map(([type, m, det, a]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.detune.value = det;
        const ga = ctx.createGain();
        ga.gain.value = a;
        o.connect(ga);
        ga.connect(lp);
        return [o, m];
      });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.6;
      const lg = ctx.createGain();
      lg.gain.value = 0;
      lfo.connect(lg);
      for (const [o] of oscs) lg.connect(o.detune);
      let x = t;
      g.gain.setValueAtTime(0, t);
      for (const [n, beats] of line) {
        const d = beats * BEAT;
        if (n) {
          for (const [o, m] of oscs) {
            o.frequency.setTargetAtTime(hz(n) * m, x, 0.025);
          }
          g.gain.setTargetAtTime(vel, x, 0.02);
          lg.gain.setValueAtTime(0, x);
          lg.gain.linearRampToValueAtTime(d > 0.6 ? 14 : 0, x + Math.min(d, 0.5));
        } else g.gain.setTargetAtTime(0, x, 0.04);
        x += d;
      }
      g.gain.setTargetAtTime(0, x, 0.15);
      for (const [o] of oscs) {
        o.start(t);
        o.stop(x + 1.5);
      }
      lfo.start(t);
      lfo.stop(x + 1.5);
      send(g, 0.7, 0.4, 0.55);
      return x;
    }
    /* trailer sound design */
    function boom(t, vel = 1) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(24, t + 1.6);
      const g = ctx.createGain();
      gainEnv(g, t, 0.005, 0.9 * vel, 0.1, 2.4);
      o.connect(g);
      o.start(t);
      o.stop(t + 3);
      send(g, 0.9, 0.6);
      const n = noise(),
        lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(120, t + 1.5);
      const ng = ctx.createGain();
      gainEnv(ng, t, 0.003, 0.55 * vel, 0.05, 1.6);
      n.connect(lp);
      lp.connect(ng);
      n.start(t);
      n.stop(t + 2);
      send(ng, 0.6, 0.8);
    }
    function braam(t, dur = 2.6, vel = 0.22, notes = ["D1", "D2", "A2", "D3"]) {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 4;
      lp.frequency.setValueAtTime(180, t);
      lp.frequency.exponentialRampToValueAtTime(1600, t + 0.35);
      lp.frequency.exponentialRampToValueAtTime(300, t + dur);
      lp.connect(g);
      for (const n of notes)
        for (const d of [-12, 0, 12]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = hz(n);
          o.detune.value = d;
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + 0.5);
        }
      gainEnv(g, t, 0.06, vel, dur * 0.4, dur * 0.6);
      g.connect(shaper);
      send(g, 0.4, 0.6);
    }
    function riser(t, dur, vel = 0.3) {
      const n = noise(),
        bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(250, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0005, t);
      g.gain.exponentialRampToValueAtTime(vel, t + dur);
      g.gain.setValueAtTime(0, t + dur + 0.01);
      n.connect(bp);
      bp.connect(g);
      n.start(t);
      n.stop(t + dur + 0.05);
      send(g, 0.7, 0.6);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(880, t + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0005, t);
      og.gain.exponentialRampToValueAtTime(vel * 0.18, t + dur);
      og.gain.setValueAtTime(0, t + dur + 0.01);
      o.connect(og);
      o.start(t);
      o.stop(t + dur + 0.05);
      send(og, 0.6, 0.4);
    }
    function whoosh(t, vel = 0.2) {
      const n = noise(),
        bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
      const g = ctx.createGain();
      gainEnv(g, t, 0.18, vel, 0, 0.3);
      n.connect(bp);
      bp.connect(g);
      n.start(t);
      n.stop(t + 0.6);
      send(g, 0.6, 0.3);
    }

    /* Live playback queues every note and creates its nodes only a few seconds before it sounds: built
       all at once, the thousands of idle filters and gains would overload the audio thread. Offline
       rendering builds everything up front. */
    /* a soft double thump, like a heartbeat */
    function heart(t, vel = 0.5) {
      for (const [d, v] of [
        [0, 1],
        [0.19, 0.6],
      ]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(68, t + d);
        o.frequency.exponentialRampToValueAtTime(38, t + d + 0.22);
        const g = ctx.createGain();
        gainEnv(g, t + d, 0.006, vel * v, 0.03, 0.28);
        o.connect(g);
        o.start(t + d);
        o.stop(t + d + 0.45);
        send(g, 0.9, 0.15);
      }
    }
    /* the floor drops out: a sine falling an octave and a half */
    function subdrop(t, vel = 0.8, dur = 1.8) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(28, t + dur);
      const g = ctx.createGain();
      gainEnv(g, t, 0.01, vel, dur * 0.3, dur * 0.7);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.2);
      g.connect(shaper);
      send(g, 0.7, 0.3);
    }
    /* a glassy bell with a long tail */
    function ping(t, note, vel = 0.08) {
      const f = hz(note);
      for (const [m, a, d] of [
        [1, 1, 2.6],
        [2.76, 0.35, 1.2],
        [5.4, 0.12, 0.6],
      ]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * m;
        const g = ctx.createGain();
        gainEnv(g, t, 0.003, vel * a, 0, d);
        o.connect(g);
        o.start(t);
        o.stop(t + d + 0.2);
        send(g, 0.5, 0.9, 0.5);
      }
    }
    /* string tremolo: detuned saws, gated fast, for tension */
    function trem(t, notes, dur, vel = 0.05) {
      const g = ctx.createGain(),
        am = ctx.createGain(),
        lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1200, t);
      lp.frequency.exponentialRampToValueAtTime(4200, t + dur);
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator(),
        lg = ctx.createGain();
      lfo.type = "square";
      lfo.frequency.value = 13;
      lg.gain.value = 0.5;
      lfo.connect(lg);
      lg.connect(am.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.6);
      for (const n of notes)
        for (const d of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = hz(n);
          o.detune.value = d;
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + 0.6);
        }
      lp.connect(am);
      am.connect(g);
      g.gain.setValueAtTime(0.0005, t);
      g.gain.exponentialRampToValueAtTime(vel, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.4);
      send(g, 0.6, 0.6);
    }
    const raw = {
      choir,
      drone,
      taiko,
      kick,
      snare,
      hat,
      clap,
      crash,
      pulse,
      tom,
      bass,
      pad,
      pluck,
      lead,
      boom,
      braam,
      riser,
      whoosh,
      heart,
      subdrop,
      ping,
      trem,
    };
    const live = typeof OfflineAudioContext === "undefined" || !(ctx instanceof OfflineAudioContext);
    /** @type {[number, Function, any[]][]} */
    const queue = [];
    const I = live
      ? Object.fromEntries(
          Object.entries(raw).map(([k, fn]) => [k, (t, ...args) => queue.push([t, fn, args])])
        )
      : raw;
    arrange(/** @type {typeof raw} */ (I));
    /* every time below is in seconds from the start, matched to the picture (modes/trailer.js) */
    function arrange({
      choir,
      drone,
      taiko,
      kick,
      snare,
      hat,
      clap,
      crash,
      pulse,
      tom,
      bass,
      pad,
      pluck,
      lead,
      boom,
      braam,
      riser,
      whoosh,
      heart,
      subdrop,
      ping,
      trem,
    }) {
      const hit = (x, v = 1, notes = undefined) => {
        braam(at(x), 2.2, 0.25 * v, notes);
        boom(at(x), 1.05 * v);
        crash(at(x), 0.55 * v);
        taiko(at(x), v);
      };
      const THEME = [
        [
          ["D4", 1],
          ["F4", 1],
          ["A4", 1.5],
          ["G4", 0.5],
        ],
        [
          ["F4", 1],
          ["D4", 1],
          ["Bb3", 2],
        ],
        [
          ["C4", 1],
          ["F4", 1],
          ["A4", 1],
          ["C5", 1],
        ],
        [
          ["Bb4", 1.5],
          ["A4", 0.5],
          ["G4", 1],
          ["E4", 1],
        ],
        [
          ["D4", 1],
          ["F4", 1],
          ["A4", 1.5],
          ["D5", 0.5],
        ],
        [
          ["C5", 1],
          ["Bb4", 1],
          ["A4", 2],
        ],
      ];
      const groove = (t0, bars, { kickOn = true, leadOn = true, lift = 0 } = {}) => {
        for (let bar = 0; bar < bars; bar++) {
          const t = t0 + bar * BAR,
            ch = PROG[bar % 4],
            root = ROOT[bar % 4];
          crash(at(t), bar === 0 ? 0.8 : 0.35);
          pad(
            at(t),
            ch.map(n => midi(n) + 12),
            BAR,
            0.035
          );
          for (let s = 0; s < 16; s++) {
            const x = t + s * (BEAT / 4);
            if (kickOn && (s === 0 || s === 8 || s === 10)) kick(at(x), 1);
            if (s === 4 || s === 12) {
              snare(at(x), 0.95);
              clap(at(x), 0.7);
            }
            hat(at(x), s % 2 ? 0.22 : 0.4, s === 14);
            if (s % 2 === 0) bass(at(x), midi(root) + (s % 4 === 2 ? 12 : 0), BEAT * 0.45, 0.9);
            pulse(at(x), ch[s % 3], 0.03 + lift * 0.01);
          }
        }
        if (leadOn) {
          const line = [];
          for (let bar = 0; bar < bars; bar++)
            for (const [n, b] of THEME[bar % THEME.length]) line.push([lift ? midi(n) + 12 : n, b]);
          lead(at(t0), line, 0.1);
        }
      };
      /* ===== the drop (0-12.5): a drone and a heartbeat, the pods' impacts, your own ===== */
      drone(at(0), "D2", 12.5, 0.09);
      drone(at(0.5), "A2", 12, 0.045);
      pad(at(1.4), ["D3", "F3", "A3"], 11, 0.03);
      for (let k = 1; k < 7; k++) heart(at(k), 0.1 + k * 0.03);
      choir(at(4.5), "D4", 5, 0.06, "oo");
      choir(at(4.5), "A3", 5, 0.05, "oo");
      whoosh(at(5), 0.3);
      for (let x = 5; x < 7.3; x += 0.25) hat(at(x), 0.12 + (x - 5) * 0.08);
      boom(at(7.35), 1.1);
      subdrop(at(7.35), 0.5, 1.2);
      for (let x = 7.6; x < 9.45; x += 0.125) pulse(at(x), "D2", 0.02 + (x - 7.6) * 0.02);
      riser(at(7.9), 1.55, 0.3);
      boom(at(9.45), 1.3);
      crash(at(9.45), 0.8);
      subdrop(at(9.45), 0.6, 1.6);
      choir(at(10), "F4", 2.5, 0.055, "ah");
      for (const x of [10, 10.5, 11, 11.5, 12, 12.25]) taiko(at(x), 0.4 + (x - 10) * 0.12);
      /* ===== three rules (12.5-34) ===== */
      hit(12.5, 0.9, ["D1", "D2", "A2", "D3"]);
      hit(14);
      for (let x = 15; x < 17.2; x += 0.25) {
        taiko(at(x), x % 0.5 ? 0.35 : 0.7);
        bass(at(x), midi("D2"), 0.2, 0.8);
      }
      whoosh(at(17.6), 0.32);
      subdrop(at(17.7), 0.4);
      ping(at(17.8), "A5", 0.07);
      for (let x = 18.2; x < 19.5; x += 0.25) {
        const beat = Math.round((x - 18.2) / 0.25);
        if (beat % 2 === 0) kick(at(x), 0.85);
        if (beat % 4 === 2) snare(at(x), 0.7);
        hat(at(x), 0.3);
      }
      for (let x = 19; x < 19.5; x += 0.125) snare(at(x), 0.3 + (x - 19) * 1.2);
      hit(19.5, 1, ["Bb0", "Bb1", "F2", "Bb2"]);
      for (let x = 20.5; x < 23.9; x += 0.25) {
        const beat = Math.round((x - 20.5) / 0.25);
        if (beat % 4 === 0) kick(at(x), 0.9);
        if (beat % 8 === 4) {
          snare(at(x), 0.8);
          clap(at(x), 0.6);
        }
        hat(at(x), beat % 2 ? 0.25 : 0.4);
        pulse(at(x), ["D3", "D3", "F3", "A3"][beat % 4], 0.04);
      }
      crash(at(21.7), 0.5);
      /* the ground pound charging in slow motion, and the slam */
      trem(at(23.9), ["A3", "D4", "Eb4"], 2.2, 0.06);
      riser(at(23.9), 2.2, 0.32);
      heart(at(24.4), 0.55);
      heart(at(25.2), 0.6);
      boom(at(26.1), 1.35);
      crash(at(26.1), 1);
      subdrop(at(26.1), 0.9);
      braam(at(26.1), 0.9, 0.2);
      hit(27, 1, ["C1", "C2", "G2", "C3"]);
      drone(at(28), "D2", 4.5, 0.07);
      for (let x = 28; x < 29.45; x += 0.125) pulse(at(x), "D2", 0.025 + (x - 28) * 0.02);
      boom(at(29.45), 1.25);
      crash(at(29.45), 0.7);
      ping(at(29.6), "D6", 0.06);
      choir(at(29.5), "D4", 3, 0.06, "ah");
      choir(at(29.5), "F4", 3, 0.05, "ah");
      /* the breath: the reload, alone */
      pad(at(32.5), ["D3", "A3"], 1.5, 0.03);
      for (let x = 33; x < 34; x += 0.0625) snare(at(x), 0.15 + (x - 33) * 0.4);
      riser(at(32.5), 1.5, 0.34);
      /* ===== five weapons (34-56): the full band, a boom on every cut ===== */
      hit(34, 1.1);
      groove(35, 5);
      groove(45, 5, { lift: 1 });
      for (const x of [37, 39, 40.1, 42.1, 44.1, 46.1, 48.1, 51.1, 53.1]) boom(at(x), 0.55);
      crash(at(45), 0.8);
      for (let x = 55; x < 56.1; x += 0.0625) snare(at(x), 0.2 + (x - 55) * 0.6);
      riser(at(54.1), 2, 0.38);
      /* ===== every mode (56-79) ===== */
      crash(at(56.1), 0.6);
      whoosh(at(55.8), 0.3);
      choir(at(56.1), "D4", 2, 0.06, "ah");
      choir(at(56.1), "A3", 2, 0.05, "oh");
      pad(at(56.1), ["D4", "F4", "A4"], 2, 0.035);
      for (const [x, n] of [
        [56.25, "D5"],
        [56.7, "F5"],
        [57.15, "A5"],
        [57.6, "D6"],
      ])
        ping(at(x), n, 0.06);
      riser(at(57.1), 1, 0.3);
      hit(58.1, 0.8);
      groove(58.1, 7, { lift: 1 });
      for (const x of [60.6, 62.6, 65.6, 68.6, 70.6]) boom(at(x), 0.6);
      /* the two maps from the air: wide and slow, a choir over drums */
      hit(73.1, 0.9);
      drone(at(73.1), "D2", 6, 0.07);
      pad(at(73.1), ["D3", "F3", "A3"], 6, 0.03);
      for (let k = 0; k < 6; k++) taiko(at(73.1 + k), k % 3 === 0 ? 0.8 : 0.45);
      braam(at(73.1), 2.4, 0.18, ["D1", "D2", "A2", "D3"]);
      for (const [x, n] of [
        [73.1, "D4"],
        [75.1, "F4"],
        [77.1, "A4"],
      ]) {
        choir(at(x), n, 1.9, 0.07, "ah");
        choir(at(x), midi(n) - 12, 1.9, 0.05, "oh");
      }
      ping(at(77.4), "A5", 0.07);
      /* ===== under the hood (79-91.6): the numbers, then the drive comes back ===== */
      drone(at(79.1), "D2", 4, 0.06);
      pad(at(79.1), ["D4", "F4", "A4", "C5"], 4, 0.035);
      for (let x = 79.1; x < 83.1; x += 0.125) {
        const s = Math.round((x - 79.1) * 8);
        pulse(at(x), ["D3", "A3", "F3", "C4"][s % 4], 0.035);
        if (s % 8 === 0) kick(at(x), 0.55);
        if (s % 4 === 2) hat(at(x), 0.22);
        if (s % 2 === 0) pluck(at(x), ["D5", "F5", "A5", "C6", "A5", "F5"][(s / 2) % 6], 0.045);
      }
      hit(83.1, 0.75);
      groove(83.1, 4);
      boom(at(86.1), 0.7);
      choir(at(89.6), "D4", 2, 0.06, "oo");
      choir(at(89.6), "A4", 2, 0.05, "oo");
      ping(at(89.9), "A5", 0.07);
      /* ===== motion captured (91.6-98.8): the stop, the leap and its landing, the hits ===== */
      hit(91.6, 0.75);
      groove(91.6, 3);
      whoosh(at(92.6), 0.3);
      whoosh(at(95.3), 0.4);
      boom(at(96.37), 1.25);
      subdrop(at(96.37), 0.6, 1.2);
      crash(at(96.37), 0.7);
      for (const x of [97.52, 97.76, 98.0]) taiko(at(x), 0.7);
      boom(at(98.24), 1);
      /* ===== the finale (98.8-105.4): drive, then a leap frozen in time ===== */
      hit(98.8, 1);
      for (let x = 98.8; x < 100.8; x += 0.125) {
        pulse(at(x), ["D3", "F3", "A3", "D4"][Math.round((x - 98.8) * 8) % 4], 0.045);
        if (Math.round((x - 98.8) * 8) % 4 === 0) kick(at(x), 0.9);
        if (Math.round((x - 98.8) * 8) % 2 === 0) bass(at(x), midi("D2"), 0.1, 0.9);
      }
      choir(at(98.8), "A4", 2, 0.07, "ah");
      whoosh(at(100.35), 0.3);
      subdrop(at(100.8), 0.35, 2.4);
      choir(at(100.8), "D5", 3, 0.05, "oo");
      choir(at(100.8), "A4", 3, 0.045, "oo");
      for (const x of [101.1, 102.1, 103.1]) heart(at(x), 0.5);
      ping(at(101.35), "A5", 0.08);
      ping(at(102.05), "C6", 0.08);
      ping(at(102.75), "D6", 0.09);
      riser(at(102.4), 1.42, 0.5);
      hit(103.82, 1.1);
      subdrop(at(103.82), 0.6, 2.2);
      boom(at(104.8), 0.9);
      /* ===== title (105.4-112) ===== */
      drone(at(105.2), "D2", 6.8, 0.08);
      for (const n of ["D3", "A3", "D4", "F4", "E4"]) choir(at(105.4), n, 6, 0.05, "ah");
      pad(at(105.4), ["D4", "F4", "A4", "E5"], 6.2, 0.04);
      for (const [x, n] of [
        [106.6, "D5"],
        [106.85, "F5"],
        [107.1, "A5"],
        [107.35, "E6"],
        [107.6, "D6"],
      ])
        pluck(at(x), n, 0.06);
      ping(at(107.8), "D5", 0.07);
      ping(at(109), "A5", 0.05);
      braam(at(105.4), 5, 0.1);
    }
    if (live) {
      queue.sort((x, y) => x[0] - y[0]);
      let qi = 0;
      const flush = () => {
        const until = ctx.currentTime + 4;
        while (qi < queue.length && queue[qi][0] < until) {
          const [t, fn, args] = queue[qi++];
          fn(t, ...args);
        }
        if (qi >= queue.length) stop();
      };
      stop();
      flush();
      if (qi < queue.length) timer = setInterval(flush, 250);
    }
    master.gain.setValueAtTime(0.82, t0 + LENGTH - 1.6);
    master.gain.linearRampToValueAtTime(0, t0 + LENGTH);
    return LENGTH;
  }
  const api = { score, stop, BPM, BEAT, BAR, LENGTH, INSERTS, remap };
  if (window.KA) window.KA.trailerScore = api;
  else window.TRAILER_SCORE = api;
})();
