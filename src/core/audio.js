/* ============ audio ============ */
let AC = null,
  master = null;
function audio() {
  if (AC) {
    if (AC.state === "suspended") AC.resume();
    return;
  }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = SET.master * SET.sfx;
    master.connect(AC.destination);
    LIVE_AC = AC;
    /* the reverb's impulse is generated now, on the first click, not in the middle of a fight */
    space();
  } catch (e) {}
}
let NOISE = null;
function noise() {
  if (!NOISE) {
    NOISE = [];
    for (let k = 0; k < 3; k++) {
      const b = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      NOISE.push(b);
    }
  }
  const s = AC.createBufferSource();
  s.buffer = NOISE[(Math.random() * 3) | 0];
  return s;
}
function env(g, t, peak, dur, attack = 0.003) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function nz(t, dur, type, freq, peak, q = 1, attack) {
  const n = noise();
  const f = AC.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = AC.createGain();
  n.connect(f);
  f.connect(g);
  g.connect(sfxOut || master);
  env(g, t, peak, dur, attack);
  /* the noise buffers are a second long: longer bursts loop one */
  if (dur > 0.97) {
    n.loop = true;
    n.start(t, Math.random());
    n.stop(t + dur + 0.03);
  } else n.start(t, Math.random() * Math.max(0, 0.97 - dur), Math.min(1, dur + 0.03));
  return f;
}
function tone(t, type, f0, f1, dur, peak, attack) {
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain();
  o.connect(g);
  g.connect(sfxOut || master);
  env(g, t, peak, dur, attack);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
const SFX_LAST = {};
let sfxVoices = 0,
  sfxVoiceT = 0;
/* trailer capture listens to sound effects instead of playing them, then renders them to a file */
let SFX_TAP = null;
function sfxTap(fn) {
  SFX_TAP = fn;
}
/** a blow landing on a body: a hard knock, a deep thump through the chest and its low ring after,
    under whatever the armor adds (k: how heavy) */
function bodyThud(t, vol, k) {
  nz(t, 0.012, "bandpass", 2400, 0.22 * vol, 1.2, 0.001);
  nz(t, 0.08, "lowpass", 260, 0.75 * vol * k, 1.5, 0.002);
  tone(t, "sine", 95 / k, 44 / k, 0.16 * k, 0.85 * vol, 0.002);
  tone(t + 0.018, "sine", 64 / k, 38 / k, 0.26 * k, 0.5 * vol, 0.006);
}
function sfx(kind, vol = 1) {
  if (SFX_TAP) {
    if (vol > 0.01) SFX_TAP(kind, vol);
    return;
  }
  if (!AC || vol <= 0.01) return;
  const t = AC.currentTime;
  if (t - (SFX_LAST[kind] || -1) < 0.016) return;
  SFX_LAST[kind] = t;
  if (t - sfxVoiceT > 0.1) {
    sfxVoiceT = t;
    sfxVoices = 0;
  }
  if (++sfxVoices > 14 && vol < 0.5) return;
  /* your own sounds in the world go through the body bus, which echoes when you are enclosed */
  const out0 = sfxOut;
  if (!sfxOut && BODY_KINDS.has(kind)) {
    const S = space();
    if (S) sfxOut = S.body;
  }
  try {
    switch (kind) {
      case "shot":
        nz(t, 0.08, "bandpass", 1800, 0.2 * vol, 1);
        tone(t, "square", 220, 60, 0.07, 0.06 * vol);
        break;
      case "crumble":
        nz(t, 0.9, "lowpass", 420, 0.55 * vol, 1, 0.01);
        nz(t, 0.35, "bandpass", 1600, 0.18 * vol, 1.5);
        tone(t, "sine", 70, 40, 0.6, 0.3 * vol);
        break;
      case "boom":
        tone(t, "sine", 95, 26, 1, 0.75 * vol, 0.005);
        nz(t, 0.7, "lowpass", 650, 0.6 * vol);
        nz(t, 0.18, "highpass", 2400, 0.22 * vol);
        break;
      case "rocket": {
        tone(t, "sine", 110, 55, 0.25, 0.35 * vol, 0.004);
        const f = nz(t, 0.7, "bandpass", 500, 0.35 * vol, 1.2, 0.01);
        f.frequency.exponentialRampToValueAtTime(1600, t + 0.6);
        nz(t, 0.12, "highpass", 3000, 0.12 * vol);
        break;
      }
      case "pod": {
        /* a drop pod's re-entry: a long whistle over a rising roar of burning air */
        const T = POD_TIME;
        const o = tone(t, "sawtooth", 1600, 240, T, 0.045 * vol, 0.4);
        o.detune.value = 8;
        const f = nz(t, T, "bandpass", 3200, 0.15 * vol, 1.5, 0.5);
        f.frequency.exponentialRampToValueAtTime(400, t + T - 0.05);
        nz(t + 0.2, T - 0.2, "lowpass", 500, 0.22 * vol, 1, T * 0.6);
        break;
      }
      case "podq": {
        /* a short drop (trailer close-ups) */
        const o = tone(t, "sawtooth", 1400, 260, 1.3, 0.05 * vol, 0.25);
        o.detune.value = 8;
        const f = nz(t, 1.3, "bandpass", 3000, 0.16 * vol, 1.5, 0.3);
        f.frequency.exponentialRampToValueAtTime(400, t + 1.25);
        break;
      }
      case "podland":
        tone(t, "sine", 90, 28, 1.1, 0.8 * vol, 0.004);
        nz(t, 0.9, "lowpass", 900, 0.7 * vol);
        nz(t, 0.25, "highpass", 2500, 0.25 * vol);
        tone(t + 0.35, "square", 600, 400, 0.05, 0.05 * vol);
        nz(t + 0.36, 0.3, "bandpass", 1800, 0.15 * vol, 2);
        break;
      case "podcrack":
        /* the ground giving way under a landing pod: a crunch and a rattle of rubble */
        nz(t, 0.5, "lowpass", 300, 0.5 * vol, 1, 0.005);
        nz(t + 0.03, 0.6, "bandpass", 1100, 0.22 * vol, 0.8);
        nz(t + 0.25, 0.5, "bandpass", 2600, 0.08 * vol, 2, 0.05);
        break;
      case "podbolts":
        /* the shell's explosive bolts, then the hiss of venting air */
        nz(t, 0.09, "highpass", 1800, 0.35 * vol);
        tone(t, "square", 160, 50, 0.12, 0.12 * vol, 0.002);
        nz(t + 0.04, 0.12, "highpass", 2200, 0.25 * vol);
        nz(t + 0.1, 0.9, "highpass", 4000, 0.07 * vol, 1, 0.08);
        break;
      case "pickup":
        tone(t, "triangle", 620, 930, 0.12, 0.08 * vol);
        tone(t + 0.08, "triangle", 930, 1240, 0.14, 0.07 * vol);
        break;
      case "stick":
        tone(t, "sine", 900, 1500, 0.14, 0.07 * vol);
        nz(t, 0.1, "bandpass", 4000, 0.05 * vol, 3);
        break;
      case "clink":
        tone(t, "triangle", 2600, 2300, 0.05, 0.05 * vol);
        break;
      /* the optic powering up, stepping a level, and dropping away */
      case "zin":
      case "zstep":
        tone(t, "sine", kind === "zin" ? 1100 : 1500, 2100, 0.07, 0.035 * vol);
        nz(t, 0.05, "highpass", 5000, 0.03 * vol);
        break;
      case "zout":
        tone(t, "sine", 1700, 900, 0.06, 0.025 * vol);
        break;
      case "sshot":
        nz(t, 0.22, "bandpass", 900, 0.55 * vol, 0.8);
        tone(t, "sawtooth", 190, 38, 0.35, 0.16 * vol);
        nz(t, 1.1, "lowpass", 260, 0.3 * vol, 1, 0.02);
        break;
      case "pshot":
        nz(t, 0.12, "bandpass", 1100, 0.32 * vol, 1);
        tone(t, "square", 160, 45, 0.1, 0.09 * vol);
        nz(t, 0.2, "lowpass", 500, 0.12 * vol);
        break;
      case "sgshot":
        /* a heavy boom, then the pump racked back and forward */
        nz(t, 0.3, "lowpass", 900, 0.6 * vol, 0.8);
        tone(t, "sawtooth", 140, 34, 0.3, 0.2 * vol, 0.003);
        nz(t, 0.1, "highpass", 2600, 0.2 * vol);
        nz(t + 0.42, 0.05, "bandpass", 2000, 0.16 * vol, 3);
        tone(t + 0.55, "square", 1000, 760, 0.03, 0.05 * vol);
        break;
      case "thrust": {
        const f = nz(t, 0.4, "lowpass", 3000, 0.28 * vol, 1, 0.01);
        f.frequency.exponentialRampToValueAtTime(300, t + 0.38);
        tone(t, "sawtooth", 90, 55, 0.3, 0.05 * vol, 0.02);
        break;
      }
      case "slam":
        tone(t, "sine", 120, 30, 0.55, 0.55 * vol);
        nz(t, 0.35, "lowpass", 900, 0.4 * vol);
        break;
      case "whoosh": {
        const f = nz(t, 0.35, "bandpass", 400, 0.22 * vol, 2, 0.05);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
        break;
      }
      case "hit":
        tone(t, "triangle", 1400, 1400, 0.05, 0.08 * vol);
        break;
      case "hithead":
        /* a crisp ping that cuts through */
        tone(t, "sine", 2600, 2600, 0.09, 0.12 * vol, 0.002);
        tone(t, "triangle", 1300, 1300, 0.07, 0.06 * vol, 0.002);
        break;
      case "hitbrk":
        /* glassy shatter */
        nz(t, 0.22, "highpass", 4200, 0.16 * vol);
        tone(t, "sawtooth", 1900, 700, 0.18, 0.05 * vol);
        tone(t + 0.03, "triangle", 2400, 2400, 0.08, 0.05 * vol);
        break;
      case "hitkill":
        /* a deep thunk and a bright confirm */
        tone(t, "sine", 160, 60, 0.18, 0.22 * vol, 0.002);
        tone(t + 0.05, "triangle", 1760, 1760, 0.16, 0.08 * vol, 0.003);
        break;
      case "hitsh":
        tone(t, "triangle", 2100, 1700, 0.06, 0.06 * vol);
        nz(t, 0.06, "highpass", 5000, 0.05 * vol);
        break;
      case "charge":
        tone(t, "sawtooth", 140, 480, 0.55, 0.05 * vol, 0.02);
        break;
      case "hurt":
        tone(t, "square", 90, 80, 0.1, 0.06 * vol);
        break;
      case "shieldhit":
        nz(t, 0.14, "bandpass", 3600, 0.13 * vol, 4);
        tone(t, "sine", 1650, 1300, 0.12, 0.04 * vol);
        break;
      case "pop":
        nz(t, 0.25, "highpass", 2500, 0.3 * vol);
        tone(t, "sawtooth", 1300, 180, 0.35, 0.12 * vol);
        tone(t, "sine", 90, 40, 0.3, 0.25 * vol);
        break;
      case "recharge":
        tone(t, "sine", 280, 1250, 0.9, 0.09 * vol, 0.05);
        tone(t, "triangle", 560, 2500, 0.9, 0.03 * vol, 0.05);
        break;
      case "alarm":
        tone(t, "square", 880, 880, 0.07, 0.035 * vol);
        break;
      /* a shield breaking: a glassy crack, shards tinkling off, an electric zap and a thump under it
         (unlike a hit's soft "shieldhit", it can't be mistaken) */
      case "shbreak":
        nz(t, 0.06, "highpass", 4800, 0.4 * vol);
        for (let i = 0; i < 5; i++)
          nz(t + 0.02 + i * 0.022, 0.035, "bandpass", 2600 + i * 650, 0.14 * vol * (1 - i * 0.12), 7);
        tone(t, "sawtooth", 1700, 210, 0.24, 0.1 * vol, 0.002);
        tone(t, "sine", 150, 42, 0.38, 0.5 * vol, 0.003);
        nz(t, 0.32, "lowpass", 950, 0.28 * vol);
        break;
      /* a downed shield's armor crackling */
      case "crackle":
        for (let i = 0; i < 3; i++) nz(t + i * 0.028, 0.016, "highpass", 2400 + i * 900, 0.08 * vol);
        break;
      /* your shield running low: a soft two-note warning (the "alarm" takes over once it is down) */
      case "shlow":
        tone(t, "triangle", 740, 740, 0.09, 0.07 * vol, 0.006);
        tone(t + 0.13, "triangle", 590, 590, 0.1, 0.06 * vol, 0.006);
        break;
      /* feet by surface (footSurf): floor plates thud, raised metal decks ring hollow, gratings rattle */
      case "step":
        nz(t, 0.07, "lowpass", 420, 0.22 * vol, 1);
        nz(t, 0.03, "highpass", 3000, 0.03 * vol);
        break;
      case "stepm":
        nz(t, 0.06, "lowpass", 520, 0.18 * vol, 1);
        tone(t, "triangle", 210, 185, 0.11, 0.045 * vol, 0.002);
        nz(t, 0.05, "bandpass", 2600, 0.05 * vol, 9);
        break;
      case "stepg":
        nz(t, 0.05, "lowpass", 360, 0.16 * vol, 1);
        nz(t, 0.03, "bandpass", 1900, 0.08 * vol, 2);
        nz(t + 0.028, 0.03, "bandpass", 3100, 0.05 * vol, 3);
        nz(t + 0.055, 0.02, "highpass", 4200, 0.025 * vol);
        break;
      case "land":
        nz(t, 0.16, "lowpass", 300, 0.4 * vol);
        tone(t, "sine", 80, 45, 0.15, 0.2 * vol);
        break;
      case "landm":
        nz(t, 0.14, "lowpass", 380, 0.34 * vol);
        tone(t, "sine", 95, 55, 0.18, 0.18 * vol);
        tone(t, "triangle", 160, 140, 0.32, 0.06 * vol, 0.003);
        nz(t, 0.22, "bandpass", 2300, 0.06 * vol, 10);
        break;
      case "landg":
        nz(t, 0.14, "lowpass", 300, 0.3 * vol);
        tone(t, "sine", 80, 45, 0.12, 0.14 * vol);
        for (let i = 0; i < 4; i++)
          nz(t + i * 0.035, 0.04, "bandpass", 1700 + i * 450, 0.1 * vol * (1 - i * 0.2), 2);
        break;
      case "magout":
        tone(t, "square", 700, 500, 0.03, 0.05 * vol);
        nz(t, 0.09, "bandpass", 2200, 0.08 * vol, 3);
        break;
      case "magin":
        tone(t, "square", 1100, 900, 0.025, 0.07 * vol);
        nz(t, 0.05, "lowpass", 600, 0.2 * vol);
        break;
      case "slap":
        tone(t, "square", 1500, 1200, 0.02, 0.06 * vol);
        tone(t + 0.07, "square", 1300, 1000, 0.02, 0.06 * vol);
        nz(t + 0.07, 0.04, "lowpass", 800, 0.15 * vol);
        break;
      case "slide": {
        const f = nz(t, 0.6, "bandpass", 900, 0.12 * vol, 0.7, 0.02);
        f.frequency.exponentialRampToValueAtTime(250, t + 0.6);
        break;
      }
      case "slidem": {
        const f = nz(t, 0.6, "bandpass", 1500, 0.11 * vol, 1.2, 0.02);
        f.frequency.exponentialRampToValueAtTime(420, t + 0.6);
        tone(t, "sawtooth", 880, 620, 0.45, 0.012 * vol, 0.05);
        break;
      }
      case "slideg": {
        const f = nz(t, 0.55, "bandpass", 700, 0.1 * vol, 0.7, 0.02);
        f.frequency.exponentialRampToValueAtTime(260, t + 0.55);
        for (let i = 0; i < 6; i++)
          nz(t + i * 0.07, 0.03, "bandpass", 2400, 0.06 * vol * (1 - i * 0.13), 2.5);
        break;
      }
      case "clamber":
        nz(t, 0.12, "lowpass", 500, 0.25 * vol);
        tone(t, "square", 300, 280, 0.03, 0.03 * vol);
        break;
      /* flag calls: each event has its own sound, readable without looking */
      case "flagTaken":
        tone(t, "triangle", 520, 520, 0.12, 0.16 * vol, 0.005);
        tone(t + 0.1, "triangle", 780, 780, 0.12, 0.16 * vol, 0.005);
        tone(t + 0.2, "triangle", 1040, 1040, 0.28, 0.18 * vol, 0.005);
        tone(t, "sine", 70, 55, 0.4, 0.2 * vol, 0.01);
        break;
      case "flagLost":
        for (let i = 0; i < 3; i++) {
          tone(t + i * 0.16, "sawtooth", 740, 520, 0.14, 0.06 * vol, 0.005);
        }
        tone(t, "sine", 90, 45, 0.6, 0.22 * vol, 0.01);
        break;
      case "flagDrop":
        tone(t, "triangle", 660, 640, 0.14, 0.15 * vol, 0.005);
        tone(t + 0.14, "triangle", 440, 420, 0.3, 0.15 * vol, 0.005);
        nz(t + 0.14, 0.25, "lowpass", 400, 0.18 * vol);
        break;
      case "flagReturn":
        tone(t, "sine", 880, 880, 0.18, 0.13 * vol, 0.004);
        tone(t + 0.09, "sine", 1320, 1320, 0.35, 0.12 * vol, 0.004);
        tone(t + 0.09, "sine", 1760, 1760, 0.3, 0.05 * vol, 0.004);
        break;
      case "stinger":
        tone(t, "sine", 65, 58, 0.7, 0.18 * vol, 0.08);
        nz(t, 0.5, "lowpass", 300, 0.08 * vol, 1, 0.1);
        break;
      case "boltback":
        /* the charging handle or slide pulled back: a ratchet and a click */
        nz(t, 0.06, "bandpass", 2400, 0.22 * vol, 3);
        tone(t + 0.05, "square", 900, 700, 0.03, 0.05 * vol);
        break;
      case "boltfwd":
        /* and slammed home: a sharp metallic clack */
        nz(t, 0.05, "highpass", 3500, 0.3 * vol);
        tone(t, "triangle", 1700, 1100, 0.07, 0.12 * vol, 0.002);
        tone(t, "sine", 180, 90, 0.08, 0.12 * vol, 0.002);
        break;
      case "swing": {
        const f = nz(t, 0.18, "bandpass", 700, 0.18 * vol, 2, 0.02);
        f.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
        break;
      }
      /* melee impacts (meleeImpact in render/fx.js): a blow on a pilot is a meaty thud with an armor
         clank; on the world, a hard ringing clank with grit falling after it. The charge's pair is
         heavier and leads in with a short rush of air. */
      case "mhit":
        bodyThud(t, vol, 1);
        tone(t, "sine", 150, 55, 0.2, 0.5 * vol, 0.002);
        nz(t, 0.13, "lowpass", 650, 0.5 * vol, 1, 0.002);
        tone(t, "triangle", 420, 300, 0.08, 0.09 * vol, 0.002);
        nz(t, 0.05, "bandpass", 1300, 0.14 * vol, 2);
        break;
      case "mkill":
        /* the blow from behind: deeper, longer, a crunch on top */
        bodyThud(t, vol, 1.3);
        tone(t, "sine", 120, 32, 0.42, 0.7 * vol, 0.002);
        nz(t, 0.3, "lowpass", 420, 0.6 * vol, 1, 0.002);
        nz(t, 0.12, "bandpass", 900, 0.3 * vol, 1.5);
        tone(t, "square", 260, 170, 0.09, 0.07 * vol, 0.002);
        break;
      case "mcrack":
        /* the shield giving way under the blow: a glassy crack and two splinters */
        nz(t, 0.2, "highpass", 3800, 0.2 * vol);
        tone(t, "sawtooth", 2300, 520, 0.18, 0.06 * vol, 0.002);
        tone(t + 0.025, "triangle", 3100, 2900, 0.04, 0.05 * vol, 0.002);
        tone(t + 0.06, "triangle", 2600, 2450, 0.04, 0.04 * vol, 0.002);
        break;
      case "mwall":
        tone(t, "triangle", 1150, 960, 0.14, 0.14 * vol, 0.001);
        tone(t, "square", 2350, 2150, 0.05, 0.035 * vol, 0.001);
        nz(t, 0.06, "highpass", 3000, 0.22 * vol);
        nz(t, 0.1, "lowpass", 520, 0.35 * vol, 1, 0.002);
        for (let i = 0; i < 3; i++)
          nz(
            t + 0.05 + i * 0.04 + Math.random() * 0.02,
            0.025,
            "bandpass",
            2400 + Math.random() * 2200,
            0.07 * vol,
            4
          );
        break;
      case "chit": {
        const f = nz(t, 0.07, "bandpass", 600, 0.16 * vol, 1.5, 0.04);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
        bodyThud(t + 0.04, vol, 1.5);
        tone(t + 0.04, "sine", 120, 34, 0.38, 0.75 * vol, 0.002);
        nz(t + 0.04, 0.26, "lowpass", 700, 0.6 * vol, 1, 0.002);
        tone(t + 0.04, "triangle", 330, 210, 0.11, 0.11 * vol, 0.002);
        nz(t + 0.04, 0.06, "bandpass", 1500, 0.18 * vol, 2);
        break;
      }
      case "cwall": {
        const f = nz(t, 0.07, "bandpass", 600, 0.16 * vol, 1.5, 0.04);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
        tone(t + 0.04, "sine", 95, 30, 0.42, 0.6 * vol, 0.002);
        tone(t + 0.04, "triangle", 900, 700, 0.2, 0.13 * vol, 0.001);
        tone(t + 0.04, "square", 1900, 1750, 0.06, 0.04 * vol, 0.001);
        nz(t + 0.04, 0.3, "lowpass", 450, 0.5 * vol, 1, 0.002);
        nz(t + 0.04, 0.08, "highpass", 2800, 0.24 * vol);
        for (let i = 0; i < 5; i++)
          nz(
            t + 0.09 + i * 0.045 + Math.random() * 0.025,
            0.025,
            "bandpass",
            2000 + Math.random() * 2500,
            0.06 * vol,
            4
          );
        break;
      }
      /* sprint thrusters: a soft breath of jet on sprint start, then quiet pulses while it lasts */
      case "jetstart": {
        const f = nz(t, 0.32, "bandpass", 500, 0.2 * vol, 1.2, 0.04);
        f.frequency.exponentialRampToValueAtTime(1500, t + 0.28);
        nz(t, 0.18, "highpass", 4200, 0.04 * vol, 1, 0.03);
        break;
      }
      case "jet": {
        const f = nz(t, 0.3, "bandpass", 800, 0.09 * vol, 0.9, 0.1);
        f.frequency.exponentialRampToValueAtTime(1150, t + 0.28);
        break;
      }
      /* blast gates (world/gates.js): a two-tone klaxon before they move, hydraulics, the stop */
      case "klaxon":
        tone(t, "sawtooth", 520, 520, 0.2, 0.07 * vol, 0.01);
        tone(t + 0.22, "sawtooth", 390, 390, 0.2, 0.07 * vol, 0.01);
        break;
      case "gatemove": {
        const T = GATE_CYCLE.move;
        nz(t, T, "lowpass", 190, 0.4 * vol, 1, 0.25);
        tone(t, "sawtooth", 46, 58, T, 0.07 * vol, 0.3);
        nz(t, 0.45, "highpass", 3600, 0.09 * vol, 1, 0.02);
        break;
      }
      case "gateslam":
        tone(t, "sine", 72, 30, 0.7, 0.55 * vol, 0.004);
        nz(t, 0.4, "lowpass", 600, 0.45 * vol);
        nz(t, 0.09, "bandpass", 2200, 0.16 * vol);
        break;
    }
  } catch (e) {}
  sfxOut = out0;
}
function distVol(p, max = 40) {
  return clamp(1 - camera.position.distanceTo(p) / max, 0, 1);
}
/* ---- space: a short reverb inside enclosed areas ----
   One convolver for the whole game, fed by a send per positional sound and by the body bus (your own
   sounds), so the node count stays bounded whatever is playing. Its impulse is generated: decaying
   stereo noise that darkens as it dies away, over a few early reflections off nearby metal. Both
   paths end in `master`, so the volume settings apply to the echo too. */
let LIVE_AC = null,
  SPACE = null;
/** kinds you make yourself in the world (not the HUD's beeps and calls), which echo where you stand */
const BODY_KINDS = new Set(
  "shot sshot pshot sgshot boom rocket crumble thrust slam whoosh charge magout magin slap boltback boltfwd swing mhit mkill mcrack mwall chit cwall clamber jetstart podland podcrack gateslam step stepm stepg land landm landg slide slidem slideg shbreak".split(
    " "
  )
);
/** the reverb's impulse response for a sample rate: two channels of decaying, darkening noise */
function spaceImpulse(sr) {
  const len = Math.round(sr * 0.9),
    out = [new Float32Array(len), new Float32Array(len)];
  for (let c = 0; c < 2; c++) {
    const d = out[c];
    const kd = Math.exp(-7.5 / sr),
      kb = Math.exp(-6 / sr);
    let lp = 0,
      amp = 1,
      bright = 0.75;
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * (0.2 + bright);
      d[i] = lp * amp * Math.min(1, (i * 300) / sr);
      amp *= kd;
      bright *= kb;
    }
    for (const [ms, g] of [
      [7, 0.6],
      [13, -0.45],
      [19, 0.4],
      [29, -0.3],
      [41, 0.25],
    ])
      d[Math.round(((ms + c * 1.9) * sr) / 1000)] += c ? -g : g;
  }
  return out;
}
/* made while the page is idle, for the usual output rates, so the first click doesn't wait for it */
const SPACE_IR = new Map();
{
  const idle = /** @type {any} */ (window).requestIdleCallback || (f => setTimeout(f, 200));
  for (const sr of [48000, 44100]) idle(() => SPACE_IR.has(sr) || SPACE_IR.set(sr, spaceImpulse(sr)));
}
function space() {
  /* the trailer's offline render swaps AC: it gets no reverb */
  if (!AC || AC !== LIVE_AC) return null;
  if (SPACE || !AC.createConvolver) return SPACE;
  const sr = AC.sampleRate,
    data = SPACE_IR.get(sr) || spaceImpulse(sr),
    ir = AC.createBuffer(2, data[0].length, sr);
  for (let c = 0; c < 2; c++) ir.getChannelData(c).set(data[c]);
  const conv = AC.createConvolver();
  conv.buffer = ir;
  const send = AC.createGain(),
    ret = AC.createGain(),
    body = AC.createGain(),
    bodySend = AC.createGain();
  ret.gain.value = 0.75;
  bodySend.gain.value = 0;
  send.connect(conv);
  conv.connect(ret);
  ret.connect(master);
  body.connect(master);
  body.connect(bodySend);
  bodySend.connect(send);
  SPACE = { send, body, bodySend };
  return SPACE;
}
/* how enclosed a point is, 0 (open sky) to 1 (a roofed room): a roof overhead within 10 m, and how
   many of 8 level rays at 2.2 m (over waist-high cover) meet a wall within 14 m, closer counting more.
   Without a roof, only lanes between tall walls echo, and only a little. Cached per 2 m cell; the
   cache resets when the collision world changes (another map, cover destroyed or rebuilt, a gate). */
const ENC = { key: "", cells: new Map() };
const _encO = new THREE.Vector3(),
  _encD = new THREE.Vector3();
function enclosure(p) {
  const key = SOLID.length + ":" + (SOLID.length ? SOLID[0].id : 0);
  if (key !== ENC.key) {
    ENC.key = key;
    ENC.cells.clear();
  }
  const cx = Math.floor(p.x / 2),
    cy = Math.floor(p.y / 2),
    cz = Math.floor(p.z / 2),
    ck = cx + "," + cy + "," + cz;
  let e = ENC.cells.get(ck);
  if (e !== undefined) return e;
  /* from the cell's centre, so a cell reads the same whichever point asked first */
  const x = cx * 2 + 1,
    y = cy * 2 + 0.6,
    z = cz * 2 + 1;
  let roof = 0,
    w = 0;
  for (const b of SOLID)
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y0 > y && b.y0 < y + 10) {
      roof = 1;
      break;
    }
  _encO.set(x, y + 1.6, z);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4,
      t = rayWorld(_encO, _encD.set(Math.cos(a), 0, Math.sin(a)), 14);
    if (t > 0.05 && t < 14) w += 1 - t / 28;
  }
  w /= 8;
  e = roof ? 0.45 + 0.55 * w : 0.55 * w * w;
  if (ENC.cells.size > 4096) ENC.cells.clear();
  ENC.cells.set(ck, e);
  return e;
}
/* your own sounds echo as much as the space you stand in */
onFrame(
  () => {
    if (SPACE && AC === LIVE_AC)
      SPACE.bodySend.gain.setTargetAtTime(enclosure(camera.position) * 0.6, AC.currentTime, 0.12);
  },
  { menu: true, full: true }
);
/* ---- what's underfoot: the collision box a point stands on; map pieces carry a material ----
   floor plates (the default), raised metal decks (platforms, cover, walls, gates) and gratings (stairs) */
const FOOT_SURF = { floor: "", step: "g", grate: "g" };
function footSurf(p) {
  let g = -50,
    best = null;
  for (const b of SOLID)
    if (
      p.x > b.x0 - 0.05 &&
      p.x < b.x1 + 0.05 &&
      p.z > b.z0 - 0.05 &&
      p.z < b.z1 + 0.05 &&
      b.y1 <= p.y + 0.3 &&
      b.y1 > g
    ) {
      g = b.y1;
      best = b;
    }
  if (!best || p.y - g > 1.5) return "";
  const s = FOOT_SURF[best.mat];
  return s == null ? "m" : s;
}
const FOOT_KINDS = { step: 1, land: 1, slide: 1 };
/** a step, landing or slide at p, as the surface there sounds */
function footKind(kind, p) {
  return FOOT_KINDS[kind] ? kind + footSurf(p) : kind;
}
/* positional sound: sfx() routed through a stereo panner set from where the sound is relative to
   where you look, and a curve that is loud up close and falls away fast (you hear someone right
   next to you before you see them). Farther sounds lose their highs (a low-pass that closes with
   distance, scaled by the sound's range), and send to the reverb by how enclosed the sound and you
   are. Steps, landings and slides take the surface under them. */
let sfxOut = null;
const _sfxV = new THREE.Vector3(),
  _sfxR = new THREE.Vector3();
function sfxAt(kind, p, max = 40, vol = 1) {
  const d = camera.position.distanceTo(p);
  if (d >= max) return;
  const near = 1 - d / max;
  const v = vol * near * near * (1 + Math.max(0, 1 - d / 6) * 0.6);
  kind = footKind(kind, p);
  if (SFX_TAP || !AC || !AC.createStereoPanner) return sfx(kind, v);
  if (v <= 0.01) return;
  const pan = AC.createStereoPanner();
  _sfxR.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _sfxV.copy(p).sub(camera.position);
  const L = _sfxV.length();
  pan.pan.value = L > 0.5 ? clamp(_sfxV.dot(_sfxR) / L, -1, 1) * 0.85 : 0;
  pan.connect(master);
  sfxOut = pan;
  /* under a crowd of voices, skip the extras (sfx drops the quiet ones anyway) */
  const busy = sfxVoices > 10 && AC.currentTime - sfxVoiceT < 0.1;
  if (d > 4 && !busy) {
    const f = AC.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = clamp(18000 * Math.exp((-3 * d) / max), 500, 18000);
    f.Q.value = 0.5;
    f.connect(pan);
    sfxOut = f;
  }
  const S = !busy && space();
  if (S) {
    const wet = (enclosure(p) + enclosure(camera.position)) * 0.4 * (0.7 + 0.5 * (d / max));
    if (wet > 0.02) {
      const g = AC.createGain();
      g.gain.value = wet;
      pan.connect(g);
      g.connect(S.send);
    }
  }
  try {
    sfx(kind, v);
  } finally {
    sfxOut = null;
  }
}

/* ---- held sounds: a hover's thrusters, sustained while it lasts ----
   holdSound(key, on, p, vol) every frame for each source (key: who); with p it is positional like
   sfxAt (panned, quieter and duller with distance, echoing in enclosed places), without p it is yours
   (the body bus). A low thruster hum with a fast flutter and an airy hiss over it: steady, unlike a
   sprint's whooshing pulses. It fades in over 0.12 s and out over 0.25 s, then its nodes are released.
   At most one set of nodes per source, so a crowd of hovering pilots stays bounded. */
const HOLD = new Map();
function holdSound(key, on, p, vol = 1) {
  let h = HOLD.get(key);
  if (!on) {
    if (h && !h.off && AC) {
      h.off = true;
      h.g.gain.setTargetAtTime(0, AC.currentTime, 0.08);
      h.stopAt = AC.currentTime + 0.4;
    }
    if (h && h.off && AC && AC.currentTime > h.stopAt) {
      for (const n of h.src) n.stop();
      h.out.disconnect();
      HOLD.delete(key);
    }
    return;
  }
  if (SFX_TAP || !AC || AC !== LIVE_AC) return;
  let v = vol,
    d = 0,
    max = 34;
  if (p) {
    d = camera.position.distanceTo(p);
    const near = Math.max(0, 1 - d / max);
    v *= near * near;
  }
  if (!h || h.off) {
    /* (one still fading out is cut, and a fresh one starts) */
    if (h) {
      for (const n of h.src) n.stop();
      h.out.disconnect();
    }
    const t = AC.currentTime,
      g = AC.createGain(),
      lp = AC.createBiquadFilter(),
      out = p ? AC.createStereoPanner() : AC.createGain();
    g.gain.value = 0;
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    /* the hum: a sawtooth through a low-pass, fluttering at 7 Hz */
    const o = AC.createOscillator(),
      of = AC.createBiquadFilter(),
      og = AC.createGain(),
      lfo = AC.createOscillator(),
      lg = AC.createGain();
    o.type = "sawtooth";
    o.frequency.value = 96;
    of.type = "lowpass";
    of.frequency.value = 380;
    og.gain.value = 0.11;
    lfo.frequency.value = 7;
    lg.gain.value = 0.045;
    lfo.connect(lg);
    lg.connect(og.gain);
    o.connect(of);
    of.connect(og);
    og.connect(g);
    /* the hiss: noise through a band-pass high up */
    const n = noise(),
      nf = AC.createBiquadFilter(),
      ng = AC.createGain();
    n.loop = true;
    nf.type = "bandpass";
    nf.frequency.value = 2600;
    nf.Q.value = 0.7;
    ng.gain.value = 0.05;
    n.connect(nf);
    nf.connect(ng);
    ng.connect(g);
    g.connect(lp);
    lp.connect(out);
    if (p) {
      out.connect(master);
      const S = space();
      if (S) {
        const sg = AC.createGain();
        sg.gain.value = enclosure(p) * 0.4;
        out.connect(sg);
        sg.connect(S.send);
      }
    } else {
      const S = space();
      out.connect(S ? S.body : master);
    }
    for (const x of [o, lfo, n]) x.start(t);
    h = { g, lp, out, src: [o, lfo, n], off: false, stopAt: 0, last: t };
    HOLD.set(key, h);
  }
  const t = AC.currentTime;
  h.last = t;
  h.g.gain.setTargetAtTime(v, t, 0.04);
  h.lp.frequency.setTargetAtTime(
    p && d > 4 ? Math.max(500, 16000 * Math.exp((-3 * d) / max)) : 16000,
    t,
    0.05
  );
  if (p && h.out.pan) {
    _sfxR.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _sfxV.copy(p).sub(camera.position);
    const L = _sfxV.length();
    h.out.pan.setTargetAtTime(L > 0.5 ? clamp(_sfxV.dot(_sfxR) / L, -1, 1) * 0.85 : 0, t, 0.03);
  }
}
/* a source that stops reporting (a pilot gone mid-hover) fades out; faded ones are released */
onFrame(
  () => {
    if (!AC) return;
    for (const [k, h] of HOLD) if (h.off || AC.currentTime - h.last > 0.3) holdSound(k, false);
  },
  { menu: true, full: true }
);
