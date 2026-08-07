import { create } from 'zustand';

import { Engine } from '../audio/engine';
import { autoPreamp, FLAT } from '../audio/eq';
import { gainFor } from '../audio/replaygain';
import { load, save } from './persist';

import type { Preset } from '../audio/eq';
import type { ReplayGainMode } from '../audio/replaygain';
import type { TrackInfo } from '../../electron/preload';

export type Repeat = 'off' | 'queue' | 'track';

export const engine = new Engine();

/*
 * Told whenever a track actually starts.
 *
 * The library store needs this to keep its play counts current, but it already imports
 * this module — importing it back would make a cycle. A callback it registers at load
 * inverts the dependency, and keeps "a track started" a fact this module states rather
 * than one the library has to infer from watching the index change (which would also fire
 * for a restored queue that never played anything).
 */
let trackStarted: ((id: string) => void) | undefined;

export function onTrackStarted(fn: (id: string) => void) {
  trackStarted = fn;
}

/**
 * Consulted when a track finishes on its own, before the queue moves.
 *
 * Returning true means something else has taken over — the sleep timer stopping playback —
 * and the queue must not advance past it. Same inversion as `trackStarted`: the sleep
 * store already imports this module.
 */
let trackEnded: ((queueExhausted: boolean) => boolean) | undefined;

export function onTrackEnded(fn: (queueExhausted: boolean) => boolean) {
  trackEnded = fn;
}

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

/**
 * Where the queue was started from.
 *
 * A track can sit in the library and in several playlists at once, so "is this the playing
 * track" is not enough to decide whether a row should show as playing — by id alone it
 * lights up in every list that contains it. The source records which list the queue
 * actually came from, and only that one shows it.
 */
export type QueueSource = { kind: 'library' } | { kind: 'playlist'; id: string };

type State = {
  /** Everything known about, keyed by id. */
  tracks: Map<string, TrackInfo>;
  /** Ids in playback order. */
  queue: string[];
  source: QueueSource | undefined;
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

  replayGain: ReplayGainMode;
  replayGainPreamp: number;
  replayGainUntagged: number;

  gapless: boolean;
  crossfade: number;

  sidebarWidth: number;

  themeId: string;
  brightness: number;
};

type Actions = {
  addTracks: (tracks: readonly TrackInfo[], playFirst?: boolean) => void;
  /** Replaces the queue and starts at `startAt`. What clicking play on a track does. */
  playNow: (tracks: readonly TrackInfo[], startAt?: number, source?: QueueSource) => void;
  /** Shuffles the whole list and starts it. Not the same as playing then toggling shuffle. */
  playShuffled: (tracks: readonly TrackInfo[], source?: QueueSource) => void;
  /** Inserts straight after the current track, so it is what plays next. */
  playNext: (tracks: readonly TrackInfo[]) => void;
  enqueue: (tracks: readonly TrackInfo[]) => void;
  playAt: (index: number) => void;
  playId: (id: string) => void;
  toggle: () => void;
  pauseNow: () => void;
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
  setReplayGain: (mode: ReplayGainMode) => void;
  setReplayGainPreamp: (db: number) => void;
  setReplayGainUntagged: (db: number) => void;
  setGapless: (on: boolean) => void;
  setCrossfade: (seconds: number) => void;
  setSidebarWidth: (px: number) => void;
  /** Rebuilds the queue from persisted ids once the library has loaded. */
  restoreQueue: (tracks: Map<string, TrackInfo>) => void;
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
  source: undefined,
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

  replayGain: saved.replayGain,
  replayGainPreamp: saved.replayGainPreamp,
  replayGainUntagged: saved.replayGainUntagged,

  gapless: saved.gapless,
  crossfade: saved.crossfade,

  sidebarWidth: saved.sidebarWidth,

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

  playNow: (incoming, startAt = 0, source) => {
    if (!incoming.length) return;

    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);

    // A fresh queue, so shuffle's saved order refers to something that still exists.
    set({
      tracks,
      queue: incoming.map((t) => t.id),
      unshuffled: undefined,
      shuffle: false,
      source,
    });
    get().playAt(Math.max(0, Math.min(startAt, incoming.length - 1)));
  },

  /*
   * Every track is in play, including the first.
   *
   * `toggleShuffle` deliberately pins the current track at the head — it reorders what is
   * still to come without interrupting what is playing. Starting a playlist shuffled is
   * the opposite situation: nothing is playing yet, so pinning anything would make the
   * first track never random, which is exactly the one people notice.
   */
  playShuffled: (incoming, source) => {
    if (!incoming.length) return;

    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);

    const order = incoming.map((t) => t.id);
    const shuffled = [...order];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
    }

    set({ tracks, queue: shuffled, unshuffled: order, shuffle: true, source });
    get().playAt(0);
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

    engine.load(`takt://media/${track.id}`, gainFor(track, get().replayGain, get().replayGainPreamp, get().replayGainUntagged));
    void engine.play();
    window.takt.notePlayed(track.id);
    trackStarted?.(track.id);

    armNext(get());
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

  pauseNow: () => {
    engine.pause();
    set({ isPlaying: false });
  },

  next: (manual = false) => {
    const { queue, index, repeat } = get();
    if (!queue.length) return;

    // A track running out is the sleep timer's cue. Pressing next is not — that is someone
    // still listening, and stopping on them would be perverse.
    if (!manual) {
      const exhausted = repeat === 'off' && index + 1 >= queue.length;
      if (trackEnded?.(exhausted)) return;
    }

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

  /*
   * Gapless is expressed entirely by whether the engine is given a next track: with it off
   * and no crossfade, nothing is armed and the plain `ended` event drives the queue. The
   * engine has no separate switch to set.
   */
  setGapless: (gapless) => {
    set({ gapless });
    armNext(get());
  },

  setCrossfade: (seconds) => {
    const crossfade = Math.max(0, Math.min(12, seconds));
    set({ crossfade });
    engine.setCrossfade(crossfade);
    armNext(get());
  },

  setReplayGain: (replayGain) => {
    set({ replayGain });
    applyReplayGain(get());
  },

  setReplayGainPreamp: (db) => {
    set({ replayGainPreamp: Math.max(-12, Math.min(12, db)) });
    applyReplayGain(get());
  },

  setReplayGainUntagged: (db) => {
    set({ replayGainUntagged: Math.max(-12, Math.min(12, db)) });
    applyReplayGain(get());
  },

  restoreQueue: (tracks) => {
    // Only ever restores into an untouched session. Anything already queued was put there
    // by the user in this session and outranks what was saved.
    if (get().queue.length) return;

    const queue = saved.queue.filter((id) => tracks.has(id));
    if (!queue.length) return;

    const currentId = saved.queue[saved.queueIndex];
    const index = currentId ? queue.indexOf(currentId) : -1;

    set({
      tracks: new Map(tracks),
      queue,
      index,
      position: saved.queuePosition,
      source: saved.queueSource,
    });

    /*
     * Loaded and seeked, but deliberately not played.
     *
     * Launching straight into audio is startling, and the app has no way to know whether
     * this launch was for listening or for tidying a playlist. Pressing play resumes from
     * exactly where it left off.
     */
    const track = index >= 0 ? tracks.get(queue[index] as string) : undefined;
    if (!track) return;

    set({ duration: track.duration ?? 0 });
    engine.setReplayGain(gainFor(track, get().replayGain, get().replayGainPreamp, get().replayGainUntagged));
    engine.load(`takt://media/${track.id}`);
    engine.seekWhenReady(saved.queuePosition);
  },

  // Clamped here rather than only in the drag handler, so a settings file edited by hand
  // cannot leave the sidebar wider than the window.
  setSidebarWidth: (px) => set({ sidebarWidth: Math.max(170, Math.min(460, Math.round(px))) }),

  setTheme: (themeId) => set({ themeId }),
  setBrightness: (brightness) => set({ brightness }),
}));

function applyReplayGain(state: State) {
  const id = state.queue[state.index];
  const track = id ? state.tracks.get(id) : undefined;
  engine.setReplayGain(gainFor(track, state.replayGain, state.replayGainPreamp, state.replayGainUntagged));
}

/** The track the queue would move to on its own, or nothing if it would stop. */
function upcoming(state: State) {
  const { queue, index, repeat } = state;
  if (!queue.length || index < 0) return undefined;

  // Repeat-one plays the same file again; handing it to the other deck is exactly right,
  // and gives a seamless loop rather than a seek back to zero.
  if (repeat === 'track') return state.tracks.get(queue[index] as string);

  const at = index + 1;
  if (at < queue.length) return state.tracks.get(queue[at] as string);

  return repeat === 'queue' ? state.tracks.get(queue[0] as string) : undefined;
}

/**
 * Tells the engine what follows, so it can buffer it before the current track ends.
 *
 * Called after anything that changes what comes next — the queue, the cursor, the repeat
 * mode, or the gapless settings. With both gapless and crossfade off there is nothing to
 * prepare, and the plain `ended` event drives the queue as before.
 */
function armNext(state: State) {
  if (!state.gapless && state.crossfade === 0) {
    engine.setNext(undefined);
    return;
  }

  const track = upcoming(state);
  if (!track) {
    engine.setNext(undefined);
    return;
  }

  engine.setNext({
    src: `takt://media/${track.id}`,
    replayGainDb: gainFor(track, state.replayGain, state.replayGainPreamp, state.replayGainUntagged),
  });
}

/* Engine -> store. Registered once, at module load. */

engine.on('time', (position, duration) => usePlayer.setState({ position, duration }));
engine.on('playing', (isPlaying) => usePlayer.setState({ isPlaying }));
engine.on('error', (error) => usePlayer.setState({ error, isPlaying: false }));
engine.on('ended', () => usePlayer.getState().next());

/*
 * The engine handed over to the preloaded deck by itself.
 *
 * The audio has already moved on, so this only catches the queue up — calling `playAt`
 * here would reload the file that is currently playing and reintroduce the very gap the
 * handover exists to avoid.
 */
engine.on('advanced', () => {
  const state = usePlayer.getState();
  const { queue, index, repeat } = state;

  const at = repeat === 'track'
    ? index
    : index + 1 < queue.length ? index + 1 : 0;

  const id = queue[at];
  const track = id ? state.tracks.get(id) : undefined;

  usePlayer.setState({ index: at, position: 0, duration: track?.duration ?? 0, error: undefined });
  if (id) {
    window.takt.notePlayed(id);
    trackStarted?.(id);
  }

  armNext(usePlayer.getState());
});

/* Restore what was saved, so the first sound matches the last session. */
{
  const initial = usePlayer.getState();
  engine.setVolume(initial.muted ? 0 : initial.volume);
  engine.setEqGains(initial.eqEnabled ? initial.eqGains : FLAT);
  engine.setPreamp(initial.eqEnabled ? effectivePreamp(initial) : 0);
  engine.setCrossfade(initial.crossfade);
}

/*
 * Anything that changes what plays next has to re-arm the engine, and there are enough
 * such actions that doing it inside each one would eventually miss one. Subscribing to the
 * queue shape catches them all; `armNext` is cheap and ignores a repeat call.
 */
usePlayer.subscribe((state, previous) => {
  if (state.queue === previous.queue && state.index === previous.index && state.repeat === previous.repeat) return;
  armNext(state);
});

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
    replayGain: state.replayGain,
    replayGainPreamp: state.replayGainPreamp,
    replayGainUntagged: state.replayGainUntagged,
    gapless: state.gapless,
    crossfade: state.crossfade,
    sidebarWidth: state.sidebarWidth,
    queue: state.queue,
    queueIndex: state.index,
    // Rounded: `position` changes several times a second, and storing the exact float
    // would rewrite the settings on every tick for a precision nobody can hear.
    queuePosition: Math.floor(state.position),
    queueSource: state.source,
  });
});

export function currentTrack() {
  const { queue, index, tracks } = usePlayer.getState();
  const id = queue[index];
  return id ? tracks.get(id) : undefined;
}
