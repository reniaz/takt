import { reducePeaks } from './peaks';

/**
 * Runs the peak reduction off the main thread.
 *
 * Decoding is already off it inside `decodeAudioData`, but the reduction is a plain loop
 * over every sample — around fourteen million for a five-minute track — and on the main
 * thread that is a visible stall exactly when a track starts.
 *
 * The sample data arrives transferred rather than copied, so handing it over costs nothing.
 */
export type PeaksRequest = { samples: Float32Array; buckets: number };

self.onmessage = (event: MessageEvent<PeaksRequest>) => {
  const { samples, buckets } = event.data;
  const peaks = reducePeaks(samples, buckets);
  (self as unknown as Worker).postMessage(peaks, [peaks.buffer]);
};
