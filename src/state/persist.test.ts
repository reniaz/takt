import { beforeEach, describe, expect, it } from 'vitest';

import { autoPreamp, BAND_COUNT } from '../audio/eq';
import { DEFAULTS, load, save } from './persist';

beforeEach(() => localStorage.clear());

describe('load', () => {
  it('returns the defaults when nothing has been saved', () => {
    expect(load()).toEqual(DEFAULTS);
  });

  it('fills in keys a older settings file does not have', () => {
    // What an upgrade looks like: a file written before `customPresets` existed. Spreading
    // it directly would leave the key `undefined`, which is not the same as absent once it
    // reaches `.map()`.
    localStorage.setItem('takt-settings', JSON.stringify({ themeId: 'nord', volume: 0.3 }));

    const loaded = load();
    expect(loaded.themeId).toBe('nord');
    expect(loaded.volume).toBe(0.3);
    expect(loaded.customPresets).toEqual([]);
    expect(loaded.eqGains).toHaveLength(BAND_COUNT);
  });

  it('discards a saved curve with the wrong number of bands', () => {
    // The band count is the shape of the audio graph. A curve from a build with a
    // different one would misalign every filter.
    localStorage.setItem('takt-settings', JSON.stringify({ eqGains: [1, 2, 3] }));
    expect(load().eqGains).toEqual(DEFAULTS.eqGains);
  });

  it('keeps a curve that does match', () => {
    const gains = Array.from({ length: BAND_COUNT }, (_, i) => i - 4);
    localStorage.setItem('takt-settings', JSON.stringify({ eqGains: gains }));
    expect(load().eqGains).toEqual(gains);
  });

  it('falls back to defaults on corrupt JSON rather than throwing', () => {
    localStorage.setItem('takt-settings', '{not json');
    expect(load()).toEqual(DEFAULTS);
  });
});

describe('save', () => {
  it('coalesces a burst of writes into one', async () => {
    for (let i = 0; i < 20; i += 1) save({ ...DEFAULTS, volume: i / 20 });

    // Debounced, so nothing has landed yet.
    expect(localStorage.getItem('takt-settings')).toBeNull();

    await new Promise((r) => { setTimeout(r, 250); });
    expect(load().volume).toBe(19 / 20);
  });
});

describe('autoPreamp', () => {
  it('backs off by the largest boost', () => {
    expect(autoPreamp([0, 6, 3, 0, 0, 0, 0, 0, 0, 0])).toBe(-6);
    expect(autoPreamp([0, 12, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(-12);
  });

  it('leaves a curve that only cuts alone', () => {
    // Nothing is louder than the source, so there is no headroom to reclaim.
    expect(autoPreamp([-6, -3, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(autoPreamp(Array(10).fill(0))).toBe(0);
  });
});
