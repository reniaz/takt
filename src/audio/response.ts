import { BAND_Q, BANDS } from './eq';

/**
 * The combined frequency response of the filter chain, in dB.
 *
 * Computed from real `BiquadFilterNode`s rather than by drawing a spline through the band
 * gains, because those are not the same curve and the difference is exactly what makes an
 * equalizer hard to use. Two adjacent bands at +6 dB overlap and produce nearly +10 dB
 * between them; a spline through the handles draws +6 and quietly lies about the result.
 * Cascaded filters multiply, so their magnitudes add once converted to dB.
 *
 * The nodes are built against a throwaway OfflineAudioContext. Nothing is rendered — the
 * context exists only because `getFrequencyResponse` is a method on a node, and a node has
 * to belong to something.
 */

let context: OfflineAudioContext | undefined;

function analysisContext() {
  // One frame at a standard rate. The response is analytic, so length and rate only matter
  // in that the rate sets the Nyquist limit the curve is defined up to.
  context ??= new OfflineAudioContext(1, 1, 48000);
  return context;
}

/** Log-spaced probe frequencies across the audible range. */
export function probeFrequencies(count: number, min = 20, max = 22000): Float32Array<ArrayBuffer> {
  const out = new Float32Array(count) as Float32Array<ArrayBuffer>;
  const ratio = Math.log(max / min);

  for (let i = 0; i < count; i += 1) {
    out[i] = min * Math.exp((i / (count - 1)) * ratio);
  }

  return out;
}

/*
 * `Float32Array<ArrayBuffer>` rather than a plain `Float32Array`.
 *
 * The Web Audio types require a view over a real ArrayBuffer, not the `ArrayBufferLike`
 * that a bare `Float32Array` widens to — a SharedArrayBuffer-backed view cannot be passed
 * to `getFrequencyResponse`, and the type reflects that.
 */
type Probe = Float32Array<ArrayBuffer>;

export function responseDb(gains: readonly number[], frequencies: Probe): Probe {
  const total = new Float32Array(frequencies.length) as Probe;

  let ctx: OfflineAudioContext;
  try {
    ctx = analysisContext();
  } catch {
    // No Web Audio (a test environment, say). A flat curve is wrong but harmless; the
    // handles still show where the bands are.
    return total;
  }

  const magnitude = new Float32Array(frequencies.length) as Probe;
  const phase = new Float32Array(frequencies.length) as Probe;

  BANDS.forEach((band, i) => {
    const gain = gains[i] ?? 0;
    // A 0 dB filter is transparent, so skipping it saves the work and avoids accumulating
    // floating-point noise across ten no-op bands.
    if (gain === 0) return;

    const filter = ctx.createBiquadFilter();
    filter.type = band.kind;
    filter.frequency.value = band.frequency;
    filter.Q.value = BAND_Q;
    filter.gain.value = gain;

    filter.getFrequencyResponse(frequencies, magnitude, phase);

    for (let k = 0; k < total.length; k += 1) {
      total[k] = (total[k] ?? 0) + 20 * Math.log10(Math.max(magnitude[k] ?? 1, 1e-6));
    }
  });

  return total;
}
