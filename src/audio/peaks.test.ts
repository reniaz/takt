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

  it('takes the peak, not the average', () => {
    /*
     * The distinction the whole drawing depends on: a waveform swings either side of zero,
     * so an average tends toward zero and would draw every track as a flat line.
     */
    const peaks = reducePeaks(sine(10_000), 100);
    expect(Math.max(...peaks)).toBeGreaterThan(240);
  });

  it('scales with amplitude, so a quiet track looks quiet', () => {
    const loud = Math.max(...reducePeaks(sine(10_000, 1), 100));
    const quiet = Math.max(...reducePeaks(sine(10_000, 0.25), 100));
    expect(quiet).toBeLessThan(loud / 3);
  });

  it('reads silence as zero', () => {
    expect([...reducePeaks(new Float32Array(5_000), 50)].every((p) => p === 0)).toBe(true);
  });

  it('treats negative swings as amplitude, not as nothing', () => {
    const samples = new Float32Array([-1, -0.5, -0.9, -0.2]);
    expect(reducePeaks(samples, 1)[0]).toBe(255);
  });

  it('clamps samples above full scale rather than wrapping', () => {
    // Floating-point audio can exceed 1 without being an error.
    expect(reducePeaks(new Float32Array([4]), 1)[0]).toBe(255);
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
    // Quiet first half, loud second: the shape has to end up where the audio was.
    const samples = new Float32Array(1000);
    for (let i = 500; i < 1000; i += 1) samples[i] = 1;

    const peaks = reducePeaks(samples, 10);
    expect(Math.max(...peaks.slice(0, 5))).toBe(0);
    expect(Math.min(...peaks.slice(5))).toBe(255);
  });
});
