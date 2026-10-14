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
      case "bshot":
        /* one round of a burst: tight and punchy, no tail */
        nz(t, 0.06, "bandpass", 1400, 0.24 * vol, 1.2);
        tone(t, "square", 260, 70, 0.05, 0.07 * vol, 0.002);
        break;
      case "sgshot":
        /* a heavy boom, then the pump racked back and forward */
        nz(t, 0.3, "lowpass", 900, 0.6 * vol, 0.8);
        tone(t, "sawtooth", 140, 34, 0.3, 0.2 * vol, 0.003);
        nz(t, 0.1, "highpass", 2600, 0.2 * vol);
        nz(t + 0.42, 0.05, "bandpass", 2000, 0.16 * vol, 3);
        tone(t + 0.55, "square", 1000, 760, 0.03, 0.05 * vol);
        break;
      case "beam":
        /* one tick of the arc beam (every 0.05 s while it fires): quiet, buzzy, no tail */
        tone(t, "sawtooth", 120, 110, 0.045, 0.03 * vol, 0.004);
        nz(t, 0.04, "bandpass", 5200, 0.03 * vol, 4);
        break;
      case "pulse": {
        /* the pulse grenade: an electrical whump and a descending zap */
        tone(t, "sine", 110, 40, 0.5, 0.5 * vol, 0.005);
        nz(t, 0.4, "lowpass", 700, 0.4 * vol);
        tone(t, "sawtooth", 2400, 160, 0.45, 0.09 * vol, 0.003);
        const f = nz(t, 0.35, "bandpass", 4000, 0.16 * vol, 4);
        f.frequency.exponentialRampToValueAtTime(500, t + 0.33);
        break;
      }
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
      case "step":
        nz(t, 0.07, "lowpass", 420, 0.22 * vol, 1);
        nz(t, 0.03, "highpass", 3000, 0.03 * vol);
        break;
      case "land":
        nz(t, 0.16, "lowpass", 300, 0.4 * vol);
        tone(t, "sine", 80, 45, 0.15, 0.2 * vol);
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
}
function distVol(p, max = 40) {
  return clamp(1 - camera.position.distanceTo(p) / max, 0, 1);
}
/* positional sound: sfx() routed through a stereo panner set from where the sound is relative to
   where you look, and a curve that is loud up close and falls away fast (you hear someone right
   next to you before you see them) */
let sfxOut = null;
const _sfxV = new THREE.Vector3(),
  _sfxR = new THREE.Vector3();
function sfxAt(kind, p, max = 40, vol = 1) {
  const d = camera.position.distanceTo(p);
  if (d >= max) return;
  const near = 1 - d / max;
  const v = vol * near * near * (1 + Math.max(0, 1 - d / 6) * 0.6);
  if (SFX_TAP || !AC || !AC.createStereoPanner) return sfx(kind, v);
  const pan = AC.createStereoPanner();
  _sfxR.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _sfxV.copy(p).sub(camera.position);
  const L = _sfxV.length();
  pan.pan.value = L > 0.5 ? clamp(_sfxV.dot(_sfxR) / L, -1, 1) * 0.85 : 0;
  pan.connect(master);
  sfxOut = pan;
  try {
    sfx(kind, v);
  } finally {
    sfxOut = null;
  }
}

/**
 * schedule sound effects ([seconds, kind, volume] each) into an OfflineAudioContext before it renders,
 * through the same synthesis the game uses. Call the returned function once rendering finishes.
 * @param {OfflineAudioContext} ctx
 * @param {AudioNode} out
 * @param {[number, string, number][]} list
 */
function renderSfx(ctx, out, list, gain = 1) {
  const keep = { AC, master, NOISE, tap: SFX_TAP };
  SFX_TAP = null;
  AC = /** @type {any} */ (ctx);
  NOISE = null;
  master = ctx.createGain();
  master.gain.value = gain;
  master.connect(out);
  for (const k in SFX_LAST) delete SFX_LAST[k];
  sfxVoices = 0;
  sfxVoiceT = -1;
  /* the offline context can only pause on 128-frame boundaries; group sounds by the boundary they start on */
  const groups = new Map();
  for (const [t, kind, vol] of list) {
    const f = Math.round((t * ctx.sampleRate) / 128);
    if ((f * 128) / ctx.sampleRate >= ctx.length / ctx.sampleRate - 0.05) continue;
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push([kind, vol]);
  }
  for (const [f, evs] of groups)
    ctx.suspend((f * 128) / ctx.sampleRate).then(() => {
      for (const [kind, vol] of evs) sfx(kind, vol);
      ctx.resume();
    });
  return () => {
    AC = keep.AC;
    master = keep.master;
    NOISE = keep.NOISE;
    SFX_TAP = keep.tap;
  };
}
