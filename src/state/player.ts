import { create } from 'zustand';

import { Engine } from '../audio/engine';
import { autoPreamp, FLAT } from '../audio/eq';
import { load, save } from './persist';

import type { Preset } from '../audio/eq';
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
  /** Manual preamp in dB. Ignored while `eqPreampAuto` is on. */
  eqPreamp: number;
  eqPreampAuto: boolean;
  customPresets: Preset[];

  themeId: string;
  brightness: number;
};

type Actions = {
  addTracks: (tracks: readonly TrackInfo[], playFirst?: boolean) => void;
  /** Replaces the queue and starts at `startAt`. What double-clicking a track does. */
  playNow: (tracks: readonly TrackInfo[], startAt?: number) => void;
  /** Inserts straight after the current track, so it is what plays next. */
  playNext: (tracks: readonly TrackInfo[]) => void;
  enqueue: (tracks: readonly TrackInfo[]) => void;
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
  setEqPreamp: (db: number) => void;
  setEqPreampAuto: (auto: boolean) => void;
  saveEqPreset: (label: string) => void;
  deleteEqPreset: (id: string) => void;
  setTheme: (id: string) => void;
  setBrightness: (value: number) => void;
};

const saved = load();

/** The preamp actually in effect, given the auto/manual choice. */
function effectivePreamp(state: Pick<State, 'eqPreampAuto' | 'eqPreamp' | 'eqGains'>) {
  return state.eqPreampAuto ? autoPreamp(state.eqGains) : state.eqPreamp;
}

export const usePlayer = create<State & Actions>((set, get) => ({
  tracks: new Map(),
  queue: [],
  unshuffled: undefined,
  index: -1,

  isPlaying: false,
  position: 0,
  duration: 0,
  volume: saved.volume,
  muted: saved.muted,
  shuffle: saved.shuffle,
  repeat: saved.repeat,
  error: undefined,

  eqEnabled: saved.eqEnabled,
  eqGains: saved.eqGains,
  eqPreamp: saved.eqPreamp,
  eqPreampAuto: saved.eqPreampAuto,
  customPresets: saved.customPresets,

  themeId: saved.themeId,
  brightness: saved.brightness,

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

  playNow: (incoming, startAt = 0) => {
    if (!incoming.length) return;

    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);

    // A fresh queue, so shuffle's saved order refers to something that still exists.
    set({ tracks, queue: incoming.map((t) => t.id), unshuffled: undefined, shuffle: false });
    get().playAt(Math.max(0, Math.min(startAt, incoming.length - 1)));
  },

  playNext: (incoming) => {
    if (!incoming.length) return;

    const { queue, index } = get();
    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);

    const ids = incoming.map((t) => t.id);
    // Anything already queued moves rather than duplicating — "play next" is a statement
    // about position, not a request for a second copy.
    const rest = queue.filter((id, i) => i <= index && !ids.includes(id));
    const tail = queue.filter((id, i) => i > index && !ids.includes(id));
    const head = index < 0 ? [] : rest;

    set({ tracks, queue: [...head, ...ids, ...tail], index: head.length - 1, unshuffled: undefined });
    if (index < 0) get().playAt(0);
  },

  enqueue: (incoming) => {
    if (!incoming.length) return;

    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);

    const queue = get().queue;
    const fresh = incoming.map((t) => t.id).filter((id) => !queue.includes(id));
    set({ tracks, queue: [...queue, ...fresh] });

    if (get().index < 0 && fresh.length) get().playAt(0);
  },

  playAt: (index) => {
    const { queue, tracks } = get();
    const id = queue[index];
    const track = id ? tracks.get(id) : undefined;
    if (!track) return;

    set({ index, error: undefined, position: 0, duration: track.duration ?? 0 });
    engine.load(`takt://media/${track.id}`);
    void engine.play();
    window.takt.notePlayed(track.id);
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
    set({ eqEnabled: on });
    // Bypassed by flattening the filters rather than by rebuilding the graph. Disconnecting
    // and reconnecting nodes mid-playback is audible; a flat biquad is not.
    engine.setEqGains(on ? get().eqGains : FLAT);
    engine.setPreamp(on ? effectivePreamp(get()) : 0);
  },

  setEqGains: (gains) => {
    const next = [...gains];
    set({ eqGains: next });
    if (!get().eqEnabled) return;
    engine.setEqGains(next);
    engine.setPreamp(effectivePreamp(get()));
  },

  setEqPreamp: (db) => {
    const eqPreamp = Math.max(-24, Math.min(12, db));
    set({ eqPreamp });
    if (get().eqEnabled) engine.setPreamp(effectivePreamp(get()));
  },

  setEqPreampAuto: (eqPreampAuto) => {
    set({ eqPreampAuto });
    if (get().eqEnabled) engine.setPreamp(effectivePreamp(get()));
  },

  saveEqPreset: (label) => {
    const name = label.trim();
    if (!name) return;

    const gains = [...get().eqGains];
    const existing = get().customPresets.find((p) => p.label.toLowerCase() === name.toLowerCase());

    // Saving under a name already in use overwrites it, rather than leaving two presets
    // with the same label and no way to tell them apart.
    set({
      customPresets: existing
        ? get().customPresets.map((p) => (p.id === existing.id ? { ...p, gains } : p))
        : [...get().customPresets, { id: `custom-${Date.now().toString(36)}`, label: name, gains }],
    });
  },

  deleteEqPreset: (id) => {
    set({ customPresets: get().customPresets.filter((p) => p.id !== id) });
  },

  setTheme: (themeId) => set({ themeId }),
  setBrightness: (brightness) => set({ brightness }),
}));

/* Engine -> store. Registered once, at module load. */

engine.on('time', (position, duration) => usePlayer.setState({ position, duration }));
engine.on('playing', (isPlaying) => usePlayer.setState({ isPlaying }));
engine.on('error', (error) => usePlayer.setState({ error, isPlaying: false }));
engine.on('ended', () => usePlayer.getState().next());

/* Restore what was saved, so the first sound matches the last session. */
{
  const initial = usePlayer.getState();
  engine.setVolume(initial.muted ? 0 : initial.volume);
  engine.setEqGains(initial.eqEnabled ? initial.eqGains : FLAT);
  engine.setPreamp(initial.eqEnabled ? effectivePreamp(initial) : 0);
}

/*
 * Store -> disk.
 *
 * Subscribing to the whole store and writing a fixed slice, rather than saving inside each
 * action: there are a dozen actions that touch a persisted value and any new one would
 * have to remember to call save(). The write is debounced, so the burst a slider produces
 * still lands as one.
 */
usePlayer.subscribe((state) => {
  save({
    themeId: state.themeId,
    brightness: state.brightness,
    volume: state.volume,
    muted: state.muted,
    repeat: state.repeat,
    shuffle: state.shuffle,
    eqEnabled: state.eqEnabled,
    eqGains: state.eqGains,
    eqPreamp: state.eqPreamp,
    eqPreampAuto: state.eqPreampAuto,
    customPresets: state.customPresets,
  });
});

export function currentTrack() {
  const { queue, index, tracks } = usePlayer.getState();
  const id = queue[index];
  return id ? tracks.get(id) : undefined;
}
