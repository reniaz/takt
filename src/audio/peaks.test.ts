import { describe, expect, it } from 'vitest';

import { reducePeaks } from './peaks';

/** A sine, which is what real audio looks like at this resolution. */
function sine(length: number, amplitude = 1) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Math.sin((i / length) * Math.PI * 40) * amplitude;
  return out;
}

describe('reducePeaks', () => {
  it('produces one value per bucket', () => {
    expect(reducePeaks(sine(10_000), 480)).toHaveLength(480);
  });

  it('fills the bar, scaling against the track own loudest moment', () => {
    // RMS of even a loud master sits near a third of full scale; drawn absolutely, every
    // waveform would be a third of the height available.
    expect(Math.max(...reducePeaks(sine(10_000), 100))).toBe(255);
  });

  it('draws the same shape however loud the track is', () => {
    /*
     * The picture is of *this* track's structure, not of its level — which the volume
     * control and ReplayGain already deal with. A quiet recording gets the same shape as a
     * loud one rather than a flat line near the bottom.
     */
    const loud = reducePeaks(sine(10_000, 1), 60);
    const quiet = reducePeaks(sine(10_000, 0.05), 60);
    expect([...quiet]).toEqual([...loud]);
  });

  it('shows dynamics that a peak reading would flatten', () => {
    /*
     * The reason for RMS. Limiting puts a near-full-scale sample in almost every bucket of
     * a modern master, so peak-per-bucket draws a solid block; the energy in the bucket
     * still differs, and that is what makes a shape.
     */
    const samples = new Float32Array(10_000);
    for (let i = 0; i < 10_000; i += 1) {
      // Dense in the first half, sparse in the second — same peak throughout.
      const dense = i < 5_000;
      samples[i] = dense || i % 8 === 0 ? (i % 2 ? 1 : -1) : 0;
    }

    const peaks = reducePeaks(samples, 10);
    const first = Math.max(...peaks.slice(0, 5));
    const second = Math.max(...peaks.slice(5));
    expect(second).toBeLessThan(first / 2);
  });

  it('reads silence as zero', () => {
    expect([...reducePeaks(new Float32Array(5_000), 50)].every((p) => p === 0)).toBe(true);
  });

  it('treats negative swings as energy, not as nothing', () => {
    const samples = new Float32Array([-1, -1, -1, -1]);
    expect(reducePeaks(samples, 1)[0]).toBe(255);
  });

  it('fills every bucket when there are more buckets than samples', () => {
    // The floors collide here; without a minimum span every bucket after the first would
    // read an empty range and come out silent, drawing a track as one spike.
    const peaks = reducePeaks(new Float32Array([1, 1, 1]), 10);
    expect([...peaks].every((p) => p === 255)).toBe(true);
  });

  it('returns an empty-but-correct array for no samples', () => {
    const peaks = reducePeaks(new Float32Array(0), 16);
    expect(peaks).toHaveLength(16);
    expect([...peaks].every((p) => p === 0)).toBe(true);
  });

  it('locates a loud passage in the right part of the track', () => {
    const samples = new Float32Array(1000);
    for (let i = 500; i < 1000; i += 1) samples[i] = 1;

    const peaks = reducePeaks(samples, 10);
    expect(Math.max(...peaks.slice(0, 5))).toBe(0);
    expect(Math.min(...peaks.slice(5))).toBe(255);
  });
});
