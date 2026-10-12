/* The trailer's soundtrack for a capture: the score plus every sound effect heard while the
   trailer was stepped (KA.trailer.sfxLog), synthesized offline by the game's own audio code and
   mixed to a 16-bit WAV. Used by record-trailer.js and trailer-preview.js. */
const SFX_GAIN = 1.8;
/**
 * @param {import("playwright").Page} page a page that has just captured the trailer (record mode)
 * @param {{ sr?: number, t0?: number, t1?: number }} [o] sample rate and the stretch to keep
 * @returns {Promise<Buffer>} WAV file contents
 */
async function trailerWav(page, o = {}) {
  const b64 = await page.evaluate(
    async ({ sr, t0, t1, gain }) => {
      const S = KA.trailerScore,
        oc = new OfflineAudioContext(2, Math.ceil(sr * S.LENGTH), sr);
      S.score(oc, oc.destination, 0);
      const done = KA.renderSfx(oc, oc.destination, KA.trailer.sfxLog, gain);
      const buf = await oc.startRendering();
      done();
      const a = Math.floor(t0 * sr),
        n = Math.min(buf.length - a, Math.floor(((t1 == null ? S.LENGTH : t1) - t0) * sr)),
        L = buf.getChannelData(0),
        R = buf.getChannelData(1);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      const g = peak ? Math.min(1, 0.89 / peak) : 1;
      const v = new DataView(new ArrayBuffer(44 + n * 4)),
        ws = (at, s) => {
          for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
        };
      ws(0, "RIFF");
      v.setUint32(4, 36 + n * 4, true);
      ws(8, "WAVE");
      ws(12, "fmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 2, true);
      v.setUint32(24, sr, true);
      v.setUint32(28, sr * 4, true);
      v.setUint16(32, 4, true);
      v.setUint16(34, 16, true);
      ws(36, "data");
      v.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[a + i] * g)) * 32767, true);
        v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[a + i] * g)) * 32767, true);
      }
      const u = new Uint8Array(v.buffer);
      let s = "";
      for (let i = 0; i < u.length; i += 32768)
        s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
      return btoa(s);
    },
    { sr: o.sr || 44100, t0: o.t0 || 0, t1: o.t1 == null ? null : o.t1, gain: SFX_GAIN }
  );
  return Buffer.from(b64, "base64");
}
module.exports = { trailerWav };
