/* ============ TONE: the tone curve as a lookup table ============
   The composite pass tone-maps every sample it reads (anti-aliasing and sharpening read up to 13 per
   pixel), so the curve has to be cheap. Each curve is baked once into a 33^3 half-float 3D table indexed
   by each channel's log2 brightness (2^-10 to 2^7); a sample then costs three log2s and one filtered
   fetch whatever the curve is. Curves (per map, see MAP_LOOK in render/pipeline.js):
   - aces:    the fitted ACES curve the game used until now (per channel; brightest lights go white);
   - agx:     AgX (three.js's implementation): keeps the hue of bright saturated light, so neon strips,
              team colors and plasma stay colored instead of burning to yellow and white;
   - neutral: Khronos PBR Neutral: true to the authored colors, gentle highlight roll-off. Exposed 1.6x
              first: the scene was lit for the ACES fit, which puts mid grey (0.18) at 0.27; Neutral
              alone puts it at 0.14, a stop darker. */
const TONE = { n: 33, lo: -10, hi: 7, luts: {} };
const TONE_CURVES = {
  aces: c => c.map(x => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)))),
  agx(c) {
    /* (matrices as GLSL writes them: columns) */
    const mul = (m, v) => [0, 1, 2].map(i => m[0][i] * v[0] + m[1][i] * v[1] + m[2][i] * v[2]);
    const toRec2020 = [
        [0.6274, 0.0691, 0.0164],
        [0.3293, 0.9195, 0.088],
        [0.0433, 0.0113, 0.8956],
      ],
      fromRec2020 = [
        [1.6605, -0.1246, -0.0182],
        [-0.5876, 1.1329, -0.1006],
        [-0.0728, -0.0083, 1.1187],
      ],
      inset = [
        [0.856627153315983, 0.137318972929847, 0.11189821299995],
        [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
        [0.0482516061458583, 0.101439036467562, 0.811302368396859],
      ],
      outset = [
        [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
        [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
        [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
      ];
    const lo = -12.47393,
      hi = 4.026069;
    let v = mul(inset, mul(toRec2020, c)).map(x => {
      const e = Math.min(1, Math.max(0, (Math.log2(Math.max(x, 1e-10)) - lo) / (hi - lo)));
      const e2 = e * e,
        e4 = e2 * e2;
      return (
        15.5 * e4 * e2 - 40.14 * e4 * e + 31.96 * e4 - 6.868 * e2 * e + 0.4298 * e2 + 0.1191 * e - 0.00232
      );
    });
    v = mul(outset, v).map(x => Math.pow(Math.max(0, x), 2.2));
    return mul(fromRec2020, v).map(x => Math.min(1, Math.max(0, x)));
  },
  neutral(c) {
    c = c.map(v => v * 1.6);
    const start = 0.76,
      desat = 0.15;
    const x = Math.min(c[0], c[1], c[2]),
      off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    c = c.map(v => v - off);
    const peak = Math.max(c[0], c[1], c[2]);
    if (peak < start) return c;
    const d = 1 - start,
      np = 1 - (d * d) / (peak + d - start);
    c = c.map(v => (v * np) / peak);
    const g = 1 - 1 / (desat * (peak - np) + 1);
    return c.map(v => v + (np - v) * g);
  },
};
/** the 3D table for a curve, made the first time it is asked for */
function toneLut(kind) {
  if (TONE.luts[kind]) return TONE.luts[kind];
  const N = TONE.n,
    f = TONE_CURVES[kind] || TONE_CURVES.aces,
    d = new Uint16Array(N * N * N * 4),
    lin = i => Math.pow(2, TONE.lo + (i / (N - 1)) * (TONE.hi - TONE.lo));
  const half = THREE.DataUtils.toHalfFloat;
  for (let b = 0, k = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++, k += 4) {
        const o = f([lin(r), lin(g), lin(b)]);
        d[k] = half(o[0]);
        d[k + 1] = half(o[1]);
        d[k + 2] = half(o[2]);
        d[k + 3] = half(1);
      }
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return (TONE.luts[kind] = t);
}
/* the shader side: aces(x) keeps its old name (the trailer's cinematic pass calls it too) */
const TONE_GLSL = `uniform highp sampler3D tTone;
vec3 aces(vec3 x){vec3 e=clamp((log2(max(x,vec3(1e-6)))-(${TONE.lo}.))/(${TONE.hi - TONE.lo}.),0.,1.);
return texture(tTone,e*${(TONE.n - 1) / TONE.n}+${0.5 / TONE.n}).rgb;}`;
