/**
 * Reduces decoded audio to one amplitude per pixel of seek bar.
 *
 * Separate from the worker that runs it so it can be tested directly — the worker is only
 * a way to get this off the main thread, and there is nothing about a `postMessage` worth
 * testing.
 */
export function reducePeaks(samples: Float32Array, buckets: number) {
  const peaks = new Uint8Array(buckets);
  if (!samples.length || buckets <= 0) return peaks;

  const per = samples.length / buckets;

  for (let i = 0; i < buckets; i += 1) {
    const start = Math.floor(i * per);
    // At least one sample per bucket: with more buckets than samples the floors collide
    // and every bucket after the first would read an empty range and come out silent.
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((i + 1) * per)));

    /*
     * The largest absolute sample in the bucket, not the average.
     *
     * A waveform swings either side of zero, so an average over thousands of samples tends
     * toward zero and draws every track as a flat line however loud it is. The peak is
     * what makes the shape recognisable.
     */
    let max = 0;
    for (let s = start; s < end; s += 1) {
      const value = samples[s] as number;
      const magnitude = value < 0 ? -value : value;
      if (magnitude > max) max = magnitude;
    }

    // Clamped: floating-point sample values can exceed 1 without being an error.
    peaks[i] = Math.min(255, Math.round(max * 255));
  }

  return peaks;
}
