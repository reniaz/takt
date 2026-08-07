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
  const levels = new Float32Array(buckets);
  let loudest = 0;

  for (let i = 0; i < buckets; i += 1) {
    const start = Math.floor(i * per);
    // At least one sample per bucket: with more buckets than samples the floors collide
    // and every bucket after the first would read an empty range and come out silent.
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((i + 1) * per)));

    /*
     * RMS, not the peak.
     *
     * The peak is the obvious choice and draws almost anything modern as a solid block:
     * mastering limits the loudest sample to just under full scale, and after that nearly
     * every bucket contains one. RMS measures how much energy is actually in the bucket,
     * so a quiet intro, a dense chorus and a fade still look different from each other.
     */
    let sum = 0;
    for (let s = start; s < end; s += 1) {
      const value = samples[s] as number;
      sum += value * value;
    }

    const rms = Math.sqrt(sum / (end - start));
    levels[i] = rms;
    if (rms > loudest) loudest = rms;
  }

  // Silence has no shape, and dividing by its level would be dividing by zero.
  if (loudest === 0) return peaks;

  /*
   * Scaled against the track's own loudest moment rather than against full scale.
   *
   * RMS of even a loud master sits around a third of full scale, so drawing it absolutely
   * would leave every waveform a third of the height of the bar. What the picture is for
   * is the shape of *this* track, so this track's peak defines the top of the bar.
   */
  for (let i = 0; i < buckets; i += 1) {
    peaks[i] = Math.min(255, Math.round(((levels[i] as number) / loudest) * 255));
  }

  return peaks;
}
