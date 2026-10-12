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
  g.connect(master);
  env(g, t, peak, dur, attack);
  n.start(t, Math.random() * Math.max(0, 0.97 - dur), Math.min(1, dur + 0.03));
  return f;
}
function tone(t, type, f0, f1, dur, peak, attack) {
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain();
  o.connect(g);
  g.connect(master);
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
      case "stick":
        tone(t, "sine", 900, 1500, 0.14, 0.07 * vol);
        nz(t, 0.1, "bandpass", 4000, 0.05 * vol, 3);
        break;
      case "clink":
        tone(t, "triangle", 2600, 2300, 0.05, 0.05 * vol);
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
      case "stinger":
        tone(t, "sine", 65, 58, 0.7, 0.18 * vol, 0.08);
        nz(t, 0.5, "lowpass", 300, 0.08 * vol, 1, 0.1);
        break;
      case "swing": {
        const f = nz(t, 0.18, "bandpass", 700, 0.18 * vol, 2, 0.02);
        f.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
        break;
      }
    }
  } catch (e) {}
}
function distVol(p, max = 40) {
  return clamp(1 - camera.position.distanceTo(p) / max, 0, 1);
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
