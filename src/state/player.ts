import { create } from 'zustand';

import { Engine } from '../audio/engine';
import { autoPreamp, FLAT } from '../audio/eq';
import { DEFAULT_THEME_ID } from '../themes/themes';

import type { TrackInfo } from '../../electron/preload';

export type Repeat = 'off' | 'queue' | 'track';

export const engine = new Engine();

/**
 * Shuffles everything after `keep` in place, Fisher–Yates.
 *
 * The current track stays where it is rather than being thrown back into the pool —
 * toggling shuffle mid-song should reorder what comes next, not restart the queue
 * somewhere else.
 */
function shuffleAfter(ids: readonly string[], keep: number) {
  const out = [...ids];
  for (let i = out.length - 1; i > keep; i -= 1) {
    const j = keep + 1 + Math.floor(Math.random() * (i - keep));
    [out[i], out[j]] = [out[j] as string, out[i] as string];
  }
  return out;
}

type State = {
  /** Everything known about, keyed by id. */
  tracks: Map<string, TrackInfo>;
  /** Ids in playback order. */
  queue: string[];
  /**
   * The order the queue had before shuffling, kept only while shuffle is on.
   *
   * Retaining it is what makes shuffle reversible: turning it off restores exactly what
   * was there, rather than sorting into some order that was never chosen.
   */
  unshuffled: string[] | undefined;
  index: number;

  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  error: string | undefined;

  eqEnabled: boolean;
  eqGains: number[];

  themeId: string;
  brightness: number;
};

type Actions = {
  addTracks: (tracks: readonly TrackInfo[], playFirst?: boolean) => void;
  playAt: (index: number) => void;
  playId: (id: string) => void;
  toggle: () => void;
  next: (manual?: boolean) => void;
  previous: () => void;
  seek: (seconds: number) => void;
  nudgeVolume: (delta: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  setEqEnabled: (on: boolean) => void;
  setEqGains: (gains: readonly number[]) => void;
  setTheme: (id: string) => void;
  setBrightness: (value: number) => void;
};

export const usePlayer = create<State & Actions>((set, get) => ({
  tracks: new Map(),
  queue: [],
  unshuffled: undefined,
  index: -1,

  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.7,
  muted: false,
  shuffle: false,
  repeat: 'off',
  error: undefined,

  eqEnabled: false,
  eqGains: [...FLAT],

  themeId: DEFAULT_THEME_ID,
  brightness: 0,

  addTracks: (incoming, playFirst = false) => {
    if (!incoming.length) return;

    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);

    const existing = get().queue;
    const fresh = incoming.map((t) => t.id).filter((id) => !existing.includes(id));
    const queue = [...existing, ...fresh];

    set({ tracks, queue });

    if (playFirst || get().index < 0) {
      const target = queue.indexOf(incoming[0]!.id);
      get().playAt(target < 0 ? 0 : target);
    }
  },

  playAt: (index) => {
    const { queue, tracks } = get();
    const id = queue[index];
    const track = id ? tracks.get(id) : undefined;
    if (!track) return;

    set({ index, error: undefined, position: 0, duration: track.duration ?? 0 });
    engine.load(`takt://media/${track.id}`);
    void engine.play();
  },

  playId: (id) => {
    const at = get().queue.indexOf(id);
    if (at >= 0) get().playAt(at);
  },

  toggle: () => {
    if (get().index < 0 && get().queue.length) {
      get().playAt(0);
      return;
    }
    void engine.toggle();
  },

  next: (manual = false) => {
    const { queue, index, repeat } = get();
    if (!queue.length) return;

    // Repeat-one only auto-repeats. Pressing next is an explicit request to move on, and
    // trapping someone on one track because a mode is set is never what they meant.
    if (repeat === 'track' && !manual) {
      engine.seek(0);
      void engine.play();
      return;
    }

    const at = index + 1;
    if (at < queue.length) {
      get().playAt(at);
    } else if (repeat === 'queue') {
      get().playAt(0);
    } else {
      engine.pause();
      set({ isPlaying: false });
    }
  },

  previous: () => {
    const { index } = get();
    // The universal behaviour: the first press restarts the track, and only a second
    // press within a few seconds goes back one.
    if (engine.position > 3) {
      engine.seek(0);
      return;
    }
    if (index > 0) get().playAt(index - 1);
    else engine.seek(0);
  },

  seek: (seconds) => {
    engine.seek(seconds);
    set({ position: engine.position });
  },

  setVolume: (value) => {
    const volume = Math.min(1, Math.max(0, value));
    engine.setVolume(volume);
    set({ volume, muted: volume === 0 });
  },

  nudgeVolume: (delta) => get().setVolume(get().volume + delta),

  toggleMute: () => {
    const { muted, volume } = get();
    engine.setVolume(muted ? volume || 0.5 : 0);
    set({ muted: !muted });
  },

  toggleShuffle: () => {
    const { shuffle, queue, index, unshuffled } = get();

    if (shuffle) {
      const restored = unshuffled ?? queue;
      const currentId = queue[index];
      set({
        shuffle: false,
        queue: restored,
        unshuffled: undefined,
        index: currentId ? restored.indexOf(currentId) : index,
      });
      return;
    }

    set({
      shuffle: true,
      unshuffled: queue,
      queue: shuffleAfter(queue, Math.max(0, index)),
    });
  },

  cycleRepeat: () => {
    const order: Repeat[] = ['off', 'queue', 'track'];
    const at = order.indexOf(get().repeat);
    set({ repeat: order[(at + 1) % order.length] as Repeat });
  },

  removeFromQueue: (target) => {
    const { queue, index } = get();
    if (target < 0 || target >= queue.length) return;

    const next = queue.filter((_, i) => i !== target);
    set({
      queue: next,
      // Removing something above the cursor shifts the cursor down with it.
      index: target < index ? index - 1 : Math.min(index, next.length - 1),
      unshuffled: get().unshuffled?.filter((id) => id !== queue[target]),
    });
  },

  reorderQueue: (from, to) => {
    const { queue, index } = get();
    if (from === to) return;

    const next = [...queue];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);

    const currentId = queue[index];
    set({ queue: next, index: currentId ? next.indexOf(currentId) : index });
  },

  clearQueue: () => {
    engine.pause();
    set({ queue: [], unshuffled: undefined, index: -1, isPlaying: false, position: 0, duration: 0 });
  },

  setEqEnabled: (on) => {
    const gains = on ? get().eqGains : [...FLAT];
    engine.setEqGains(gains);
    engine.setPreamp(on ? autoPreamp(gains) : 0);
    set({ eqEnabled: on });
  },

  setEqGains: (gains) => {
    const next = [...gains];
    set({ eqGains: next });
    if (get().eqEnabled) {
      engine.setEqGains(next);
      engine.setPreamp(autoPreamp(next));
    }
  },

  setTheme: (themeId) => set({ themeId }),
  setBrightness: (brightness) => set({ brightness }),
}));

/* Engine -> store. Registered once, at module load. */

engine.on('time', (position, duration) => usePlayer.setState({ position, duration }));
engine.on('playing', (isPlaying) => usePlayer.setState({ isPlaying }));
engine.on('error', (error) => usePlayer.setState({ error, isPlaying: false }));
engine.on('ended', () => usePlayer.getState().next());

engine.setVolume(usePlayer.getState().volume);

export function currentTrack() {
  const { queue, index, tracks } = usePlayer.getState();
  const id = queue[index];
  return id ? tracks.get(id) : undefined;
}
