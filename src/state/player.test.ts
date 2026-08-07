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
  vi.spyOn(engine, 'setNext').mockImplementation(() => {});

  usePlayer.setState({
    tracks: new Map(),
    queue: [],
    unshuffled: undefined,
    index: -1,
    isPlaying: false,
    shuffle: false,
    repeat: 'off',
    gapless: true,
    crossfade: 0,
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

describe('queue actions', () => {
  it('playNow replaces the queue and starts where told', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playNow(TRACKS.slice(2, 5), 1);

    expect(ids()).toEqual(['t3', 't4', 't5']);
    expect(usePlayer.getState().index).toBe(1);
    expect(ids()[usePlayer.getState().index]).toBe('t4');
  });

  it('playNext inserts straight after the current track', () => {
    usePlayer.getState().addTracks(TRACKS.slice(0, 3));
    usePlayer.getState().playAt(0);

    usePlayer.getState().playNext([TRACKS[5]!]);

    expect(ids()).toEqual(['t1', 't6', 't2', 't3']);
    // The cursor stays on what is playing, not on what was inserted.
    expect(ids()[usePlayer.getState().index]).toBe('t1');
  });

  it('playNext moves a track already queued rather than duplicating it', () => {
    usePlayer.getState().addTracks(TRACKS.slice(0, 4));
    usePlayer.getState().playAt(0);

    usePlayer.getState().playNext([TRACKS[3]!]);

    expect(ids()).toEqual(['t1', 't4', 't2', 't3']);
    expect(ids().filter((id) => id === 't4')).toHaveLength(1);
  });

  it('playNext on an empty queue starts playing', () => {
    usePlayer.getState().playNext(TRACKS.slice(0, 2));

    expect(ids()).toEqual(['t1', 't2']);
    expect(usePlayer.getState().index).toBe(0);
  });

  it('enqueue appends without disturbing what is playing', () => {
    usePlayer.getState().addTracks(TRACKS.slice(0, 3));
    usePlayer.getState().playAt(1);

    usePlayer.getState().enqueue([TRACKS[4]!, TRACKS[5]!]);

    expect(ids()).toEqual(['t1', 't2', 't3', 't5', 't6']);
    expect(usePlayer.getState().index).toBe(1);
  });

  it('enqueue ignores what is already in the queue', () => {
    usePlayer.getState().addTracks(TRACKS.slice(0, 3));
    usePlayer.getState().enqueue([TRACKS[0]!, TRACKS[4]!]);

    expect(ids()).toEqual(['t1', 't2', 't3', 't5']);
  });
});

describe('queue source', () => {
  it('records which list the queue came from', () => {
    usePlayer.getState().playNow(TRACKS.slice(0, 3), 0, { kind: 'playlist', id: 'pl-1' });
    expect(usePlayer.getState().source).toEqual({ kind: 'playlist', id: 'pl-1' });

    usePlayer.getState().playNow(TRACKS, 0, { kind: 'library' });
    expect(usePlayer.getState().source).toEqual({ kind: 'library' });
  });

  it('is undefined when nothing said where playback came from', () => {
    usePlayer.getState().playNow(TRACKS.slice(0, 2));
    expect(usePlayer.getState().source).toBeUndefined();
  });

  it('survives being restored with the queue', () => {
    // The same track can sit in the library and several playlists; without the source, a
    // resumed session would light it up in all of them.
    usePlayer.getState().playNow(TRACKS.slice(0, 3), 1, { kind: 'playlist', id: 'pl-7' });

    const { source, index, queue } = usePlayer.getState();
    expect(source).toEqual({ kind: 'playlist', id: 'pl-7' });
    expect(queue[index]).toBe('t2');
  });
});

describe('gapless handover', () => {
  const armed = () => (engine.setNext as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[0] as
    { src: string } | undefined;

  it('arms the next track once something is playing', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(0);

    expect(armed()?.src).toBe('takt://media/t2');
  });

  it('re-arms when the queue is reordered under the cursor', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(0);

    usePlayer.getState().playNext([TRACKS[4]!]);

    expect(armed()?.src).toBe('takt://media/t5');
  });

  it('arms nothing at the end of the queue when not repeating', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(5);

    expect(armed()).toBeUndefined();
  });

  it('wraps to the start when repeating the queue', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.setState({ repeat: 'queue' });
    usePlayer.getState().playAt(5);

    expect(armed()?.src).toBe('takt://media/t1');
  });

  it('arms the same track again on repeat-one, for a seamless loop', () => {
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.setState({ repeat: 'track' });
    usePlayer.getState().playAt(2);

    expect(armed()?.src).toBe('takt://media/t3');
  });

  it('arms nothing when gapless is off and there is no crossfade', () => {
    usePlayer.setState({ gapless: false, crossfade: 0 });
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(0);

    expect(armed()).toBeUndefined();
  });

  it('arms even with gapless off, once a crossfade is set', () => {
    usePlayer.setState({ gapless: false, crossfade: 4 });
    usePlayer.getState().addTracks(TRACKS);
    usePlayer.getState().playAt(0);

    expect(armed()?.src).toBe('takt://media/t2');
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
