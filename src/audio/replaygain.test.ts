import { describe, expect, it } from 'vitest';

import { gainFor } from './replaygain';

import type { TrackInfo } from '../../electron/preload';

const track = (rg: Partial<Pick<TrackInfo, 'rgTrack' | 'rgAlbum'>>): TrackInfo => ({
  id: 't', path: 'C:\\a.flac', title: 'A', ...rg,
});

describe('gainFor', () => {
  it('is silent when switched off, whatever the tags say', () => {
    expect(gainFor(track({ rgTrack: -9 }), 'off', 6, 3)).toBe(0);
  });

  it('uses the track gain in track mode and the album gain in album mode', () => {
    const both = track({ rgTrack: -8, rgAlbum: -5 });
    expect(gainFor(both, 'track', 0, 0)).toBe(-8);
    expect(gainFor(both, 'album', 0, 0)).toBe(-5);
  });

  it('falls back to the other tag when the preferred one is missing', () => {
    // Common for anything not tagged as part of a set: album mode with no album gain
    // should still normalise rather than silently doing nothing.
    expect(gainFor(track({ rgTrack: -7 }), 'album', 0, 0)).toBe(-7);
    expect(gainFor(track({ rgAlbum: -4 }), 'track', 0, 0)).toBe(-4);
  });

  it('adds the preamp to a tagged gain', () => {
    expect(gainFor(track({ rgTrack: -8 }), 'track', 5, 0)).toBe(-3);
  });

  it('applies the untagged offset instead of the preamp for files with no tags', () => {
    // Leaving these at 0 while everything else is pulled down makes them the loudest
    // thing in the library, which is the opposite of normalising.
    expect(gainFor(track({}), 'track', 6, -4)).toBe(-4);
    expect(gainFor(track({}), 'album', 6, 0)).toBe(0);
  });

  it('treats a tagged gain of exactly 0 as tagged, not as missing', () => {
    // The bug a truthiness check would introduce: 0 dB is a real, correct value.
    expect(gainFor(track({ rgTrack: 0 }), 'track', 3, -9)).toBe(3);
  });

  it('clamps so a preamp cannot push a track into clipping', () => {
    expect(gainFor(track({ rgTrack: 6 }), 'track', 12, 0)).toBe(12);
    expect(gainFor(track({ rgTrack: -30 }), 'track', -12, 0)).toBe(-24);
  });

  it('is silent with no track', () => {
    expect(gainFor(undefined, 'track', 6, 3)).toBe(0);
  });
});
