/* ===== Trailer score: an original piece synthesized live with Web Audio (no samples), scored to the
   picture in modes/trailer.js ("Ignition"): a drone, a typed line and a heartbeat for the cold open, the
   pods answered by booms and a braam, a drop at "Fight" with a hit on every kill, the band lifted for
   the arsenal, a wide breakdown for the arena that climbs back to a second drop, bullet time down to a
   heartbeat and bells, the snap and the slam, and a choir on the title.
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
  const LENGTH = 84;
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
      /* the band: kick, snare and clap, sixteenth hats, the bass on eighths and the synth pulse, a pad per
         bar, and the theme on the lead. dbl: a busier kick and open hats for the drops */
      const groove = (t0, bars, { leadOn = true, lift = 0, dbl = false, half = false } = {}) => {
        for (let bar = 0; bar < bars; bar++) {
          const t = t0 + bar * BAR,
            ch = PROG[bar % 4],
            root = ROOT[bar % 4];
          crash(at(t), bar === 0 ? 0.8 : 0.3);
          pad(
            at(t),
            ch.map(n => midi(n) + 12),
            BAR,
            0.035
          );
          for (let s = 0; s < 16; s++) {
            const x = t + s * (BEAT / 4);
            if (half) {
              if (s === 0 || s === 10) kick(at(x), 0.9);
              if (s === 8) {
                snare(at(x), 0.85);
                clap(at(x), 0.6);
              }
              if (s % 2 === 0) hat(at(x), 0.25);
              if (s === 0 || s === 8) bass(at(x), midi(root), BEAT * 1.8, 0.8);
              if (s % 2 === 0) pulse(at(x), ch[(s / 2) % 3], 0.022);
              continue;
            }
            if (s === 0 || s === 8 || s === 10 || (dbl && (s === 6 || s === 14))) kick(at(x), 1);
            if (s === 4 || s === 12) {
              snare(at(x), 0.95);
              clap(at(x), 0.7);
            }
            hat(at(x), s % 2 ? 0.22 : 0.42, dbl ? s % 4 === 2 : s === 14);
            if (s % 2 === 0) bass(at(x), midi(root) + (s % 4 === 2 ? 12 : 0), BEAT * 0.45, 0.9);
            pulse(at(x), ch[s % 3], 0.03 + lift * 0.012);
          }
        }
        if (leadOn) {
          const line = [];
          for (let bar = 0; bar < bars; bar++)
            for (const [n, b] of THEME[bar % THEME.length]) line.push([lift ? midi(n) + 12 : n, b]);
          lead(at(t0), line, 0.1);
        }
      };
      /** a fill into a cut: a snare roll rising to it */
      const roll = (t0, t1, v = 0.6) => {
        for (let x = t0; x < t1 - 1e-6; x += 0.0625) snare(at(x), 0.12 + ((x - t0) / (t1 - t0)) * v);
      };
      /* ===== cold open (0-12): the holo line types in over a drone, the pods burn in, the ride down ===== */
      drone(at(0), "D2", 12, 0.085);
      drone(at(0.4), "A1", 11.5, 0.05);
      let ti = 0;
      for (let x = 0.2; x < 1.85; x += 1 / 16) pluck(at(x), ["D6", "A5", "F6", "C6"][ti++ % 4], 0.016);
      heart(at(0.5), 0.25);
      heart(at(1.5), 0.3);
      whoosh(at(1.82), 0.3);
      subdrop(at(1.95), 0.55, 1.6);
      choir(at(2), "D4", 2.4, 0.05, "oo");
      choir(at(2), "A3", 2.4, 0.04, "oo");
      pad(at(2), ["D3", "F3", "A3"], 4, 0.025);
      for (const x of [2.5, 3.4, 4.2, 4.9, 5.5, 6.05, 6.5, 6.9, 7.2]) heart(at(x), 0.3 + x * 0.04);
      riser(at(3.1), 2.4, 0.3);
      whoosh(at(4), 0.4);
      trem(at(4), ["D3", "A3", "D4"], 1.5, 0.05);
      riser(at(5.9), 1.35, 0.36);
      boom(at(7.25), 0.9);
      /* the squad's pods slam in, slowed */
      boom(at(7.8), 1.35);
      crash(at(7.8), 0.9);
      subdrop(at(7.8), 0.7, 1.6);
      braam(at(7.8), 1.6, 0.22);
      boom(at(8.42), 0.7);
      boom(at(8.97), 0.6);
      /* the hero rises: the braam and the choir; the crash zoom; one word */
      braam(at(9), 2.4, 0.26);
      for (const n of ["D4", "F4", "A4"]) choir(at(9), n, 1.7, 0.055, "ah");
      ping(at(9.6), "A5", 0.06);
      whoosh(at(10.25), 0.38);
      hit(10.6, 1);
      for (const x of [10.75, 11.0, 11.25, 11.5, 11.625, 11.75, 11.875])
        taiko(at(x), 0.45 + (x - 10.75) * 0.4);
      roll(11.25, 12, 0.7);
      riser(at(10.75), 1.25, 0.45);
      /* ===== ignition (12-30): the first drop, a hit on every kill ===== */
      hit(12, 1.1);
      groove(12, 9, { dbl: true, leadOn: false });
      lead(at(20), [].concat(...[0, 1, 2, 3, 4].map(b => THEME[b % THEME.length])), 0.095);
      for (const x of [16.47, 18.5, 21.23, 22.6, 26.1, 26.53]) boom(at(x), 0.55);
      whoosh(at(13.45), 0.3);
      whoosh(at(14.6), 0.3);
      whoosh(at(19.8), 0.3);
      /* the ground pound: it charges, it slams */
      riser(at(23.6), 0.8, 0.36);
      boom(at(24.4), 1.35);
      crash(at(24.4), 0.9);
      subdrop(at(24.4), 0.8, 1.4);
      /* a kill from behind, a shield shattered, time running fast */
      boom(at(28.07), 0.85);
      crash(at(28.83), 0.7);
      whoosh(at(28.83), 0.35);
      riser(at(29.25), 0.75, 0.42);
      /* ===== the arsenal (30-46): the band lifted, a boom on every kill ===== */
      hit(30, 1.15);
      groove(30.75, 7, { lift: 1, dbl: true });
      for (const x of [33.4, 34.73, 37.8, 41.7, 43.2, 45.67]) boom(at(x), 0.6);
      /* the sniper's round in slow motion */
      subdrop(at(31.77), 0.7, 1.4);
      ping(at(31.77), "A5", 0.08);
      boom(at(31.77), 0.8);
      /* the rocket ridden in, the frag, the plasma stuck */
      boom(at(36.43), 1.2);
      subdrop(at(36.43), 0.6, 1.2);
      boom(at(39.65), 1.1);
      ping(at(40.67), "D6", 0.07);
      roll(44.75, 46, 0.7);
      riser(at(44.75), 1.25, 0.42);
      /* ===== the arena (46-60): wide and slow, then building ===== */
      hit(46, 0.8);
      drone(at(46), "D2", 14, 0.06);
      for (const [x, ns] of /** @type {[number, string[]][]} */ ([
        [46, ["D4", "A3"]],
        [48, ["F4", "C4"]],
      ])) {
        for (const n of ns) choir(at(x), n, 1.9, 0.055, "ah");
      }
      for (let k = 0; k < 3; k++) taiko(at(46 + k), k === 0 ? 0.8 : 0.45);
      groove(49, 4, { half: true, leadOn: false });
      for (const x of [49.4, 53.7, 56.4]) boom(at(x), 0.5);
      whoosh(at(55.6), 0.3);
      boom(at(56.25), 0.9);
      /* the free camera: arpeggios climbing, then the floor drops away */
      for (let x = 57.5, s = 0; x < 59.75; x += 0.125, s++)
        pluck(at(x), ["D5", "F5", "A5", "C6", "D6", "C6", "A5", "F5"][s % 8], 0.04 + s * 0.0015);
      riser(at(57.5), 2.25, 0.5);
      roll(58.75, 59.75, 0.8);
      /* ===== the set piece (60-75): the second drop, bullet time, the snap, the play of the game ===== */
      hit(60, 1.3);
      groove(60, 3, { lift: 1, dbl: true });
      for (const x of [60.77, 61.83]) boom(at(x), 0.6);
      boom(at(63.27), 1.1);
      whoosh(at(65.75), 0.4);
      /* bullet time: everything falls away to a heartbeat; a bell on each round */
      subdrop(at(66), 0.6, 2.5);
      choir(at(66), "D5", 3, 0.05, "oo");
      choir(at(66), "A4", 3, 0.045, "oo");
      for (const x of [66.4, 67.4, 68.4]) heart(at(x), 0.55);
      ping(at(66.6), "A5", 0.08);
      ping(at(67.3), "C6", 0.08);
      ping(at(68), "D6", 0.09);
      riser(at(67.6), 1.4, 0.5);
      /* time snaps back; the slam */
      hit(69, 1.35);
      boom(at(69.83), 1.4);
      subdrop(at(69.83), 0.8, 1.8);
      crash(at(69.83), 1);
      for (const n of ["D4", "F4", "A4", "D5"]) choir(at(70.3), n, 2.4, 0.055, "ah");
      braam(at(70.3), 2.2, 0.2);
      for (const x of [70.3, 70.8, 71.3, 71.8, 72.05, 72.3, 72.55]) taiko(at(x), 0.5 + (x - 70.3) * 0.15);
      /* the play of the game */
      hit(72.75, 0.8);
      groove(72.75, 1, { dbl: true, leadOn: false });
      for (const x of [73.33, 74.23, 74.6]) boom(at(x), 0.55);
      roll(74.75, 75.25, 0.6);
      /* ===== the title (75.25-84) ===== */
      hit(75.25, 1.1);
      drone(at(75.25), "D2", 8.6, 0.08);
      for (const n of ["D3", "A3", "D4", "F4", "E4"]) choir(at(75.5), n, 7, 0.05, "ah");
      pad(at(75.5), ["D4", "F4", "A4", "E5"], 7.5, 0.04);
      for (const [x, n] of /** @type {[number, string][]} */ ([
        [76.7, "D5"],
        [76.95, "F5"],
        [77.2, "A5"],
        [77.45, "E6"],
        [77.7, "D6"],
      ]))
        pluck(at(x), n, 0.06);
      ping(at(77.9), "D5", 0.07);
      ping(at(79.2), "A5", 0.05);
      braam(at(75.5), 5, 0.1);
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
