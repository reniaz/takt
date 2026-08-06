import { beforeEach, describe, expect, it, vi } from 'vitest';

import { engine, usePlayer } from './player';

import type { TrackInfo } from '../../electron/preload';

const TRACKS: TrackInfo[] = Array.from({ length: 6 }, (_, i) => ({
  id: `t${i + 1}`,
  path: `C:\\m\\${i + 1}.flac`,
  title: `Track ${i + 1}`,
}));

const ids = () => usePlayer.getState().queue;

beforeEach(() => {
  // The engine talks to a media element jsdom cannot actually play; the queue logic under
  // test never depends on what it returns.
  vi.spyOn(engine, 'load').mockImplementation(() => {});
  vi.spyOn(engine, 'play').mockResolvedValue(undefined);
  vi.spyOn(engine, 'pause').mockImplementation(() => {});
  vi.spyOn(engine, 'seek').mockImplementation(() => {});

  usePlayer.setState({
    tracks: new Map(),
    queue: [],
    unshuffled: undefined,
    index: -1,
    isPlaying: false,
    shuffle: false,
    repeat: 'off',
  });
});

describe('queue', () => {
  it('starts playing the first added track', () => {
    usePlayer.getState().addTracks(TRACKS);
    expect(ids()).toHaveLength(6);
    expect(usePlayer.getState().index).toBe(0);
  });

  it('does not add the same track twice', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().addTracks(TRACKS.slice(0, 3));
    expect(ids()).toHaveLength(6);
  });

  it('keeps the cursor on the same track when something above it is removed', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(3);

    usePlayer.getState().removeFromQueue(1);

    expect(usePlayer.getState().index).toBe(2);
    expect(ids()[2]).toBe('t4');
  });

  it('keeps the cursor on the same track when a row is dragged past it', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(2);
    const playing = ids()[2];

    usePlayer.getState().reorderQueue(5, 0);

    const { index, queue } = usePlayer.getState();
    expect(queue[index]).toBe(playing);
    expect(index).toBe(3);
  });
});

describe('shuffle', () => {
  it('leaves the current track where it is', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(2);
    const playing = ids()[2];

    usePlayer.getState().toggleShuffle();

    expect(ids()[2]).toBe(playing);
    expect(usePlayer.getState().index).toBe(2);
  });

  it('restores the exact original order when turned off', () => {
    usePlayer.getState().addTracks(TRACKS);
    const original = [...ids()];

    usePlayer.getState().toggleShuffle();
    usePlayer.getState().toggleShuffle();

    expect(ids()).toEqual(original);
  });

  it('keeps every track — shuffling is a permutation, not a resample', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().toggleShuffle();

    expect([...ids()].sort()).toEqual(TRACKS.map((t) => t.id).sort());
  });

  it('follows the current track back to its original position', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(0);
    usePlayer.getState().toggleShuffle();

    // Move on within the shuffled order, then unshuffle.
    usePlayer.getState().next(true);
    const playing = ids()[usePlayer.getState().index];

    usePlayer.getState().toggleShuffle();

    const { index, queue } = usePlayer.getState();
    expect(queue[index]).toBe(playing);
  });
});

describe('repeat', () => {
  it('cycles off -> queue -> track -> off', () => {
    const { cycleRepeat } = usePlayer.getState();
    cycleRepeat();
    expect(usePlayer.getState().repeat).toBe('queue');
    cycleRepeat();
    expect(usePlayer.getState().repeat).toBe('track');
    cycleRepeat();
    expect(usePlayer.getState().repeat).toBe('off');
  });

  it('stops at the end of the queue when off', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(5);
    usePlayer.getState().next();

    expect(usePlayer.getState().index).toBe(5);
    expect(engine.pause).toHaveBeenCalled();
  });

  it('wraps to the start when repeating the queue', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().cycleRepeat();
    usePlayer.getState().playAt(5);
    usePlayer.getState().next();

    expect(usePlayer.getState().index).toBe(0);
  });

  it('repeats one track when a track ends, but lets the next button escape it', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.setState({ repeat: 'track' });
    usePlayer.getState().playAt(2);

    // Auto-advance at end of track: stay put.
    usePlayer.getState().next();
    expect(usePlayer.getState().index).toBe(2);

    // Pressing next is explicit: move on regardless of the mode.
    usePlayer.getState().next(true);
    expect(usePlayer.getState().index).toBe(3);
  });
});

describe('volume', () => {
  it('clamps to 0..1', () => {
    usePlayer.getState().setVolume(5);
    expect(usePlayer.getState().volume).toBe(1);
    usePlayer.getState().setVolume(-2);
    expect(usePlayer.getState().volume).toBe(0);
  });

  it('nudges relative to the current level', () => {
    usePlayer.getState().setVolume(0.5);
    usePlayer.getState().nudgeVolume(0.05);
    expect(usePlayer.getState().volume).toBeCloseTo(0.55);
  });
});
