/* ============ AUDIO OFFLINE: sound effects rendered to a file (trailer build only, manifest trailer.engine) ============
   tools/trailer-audio.js renders the trailer's effects through the same synthesis the game uses. */
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
Object.assign(KA_API, { renderSfx });
