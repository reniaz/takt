import { create } from 'zustand';

import { engine, onTrackEnded, usePlayer } from './player';

/**
 * The sleep timer.
 *
 * Three ways to say when, because they answer different questions: "in twenty minutes" is
 * about you, "at the end of this track" and "when the queue runs out" are about the music.
 * A timer that only counts minutes ends records mid-song.
 */

/** Long enough to be unmistakably a fade rather than a cut, short enough not to outlast sleep. */
const FADE_SECONDS = 8;

export type SleepMode = 'minutes' | 'track' | 'queue';

type State = {
  /** When the timer fires, for the countdown. Absent while waiting on a track or the queue. */
  endsAt: number | undefined;
  mode: SleepMode | undefined;
  /** True once the fade has started, so the UI can say so rather than show 0:00. */
  fading: boolean;
};

type Actions = {
  start: (mode: SleepMode, minutes?: number) => void;
  cancel: () => void;
  /**
   * Called when a track ends on its own.
   *
   * @returns true when the timer stopped playback, so the queue does not advance past it.
   */
  noteTrackEnded: (queueExhausted: boolean) => boolean;
};

let timer: ReturnType<typeof setTimeout> | undefined;
let cancelFade: (() => void) | undefined;

function clear() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  cancelFade?.();
  cancelFade = undefined;
}

export const useSleep = create<State & Actions>((set, get) => ({
  endsAt: undefined,
  mode: undefined,
  fading: false,

  start: (mode, minutes = 30) => {
    clear();

    if (mode !== 'minutes') {
      // Nothing to count down; the queue decides when this fires.
      set({ mode, endsAt: undefined, fading: false });
      return;
    }

    const ms = Math.max(1, minutes) * 60_000;
    set({ mode, endsAt: Date.now() + ms, fading: false });

    // The fade is subtracted from the wait, so the timer is silent at the moment asked
    // for rather than only starting to fade then.
    timer = setTimeout(() => {
      set({ fading: true });
      cancelFade = engine.fadeOutAndPause(FADE_SECONDS);
      timer = setTimeout(() => get().cancel(), FADE_SECONDS * 1000 + 200);
    }, Math.max(0, ms - FADE_SECONDS * 1000));
  },

  cancel: () => {
    clear();
    set({ endsAt: undefined, mode: undefined, fading: false });
  },

  noteTrackEnded: (queueExhausted) => {
    const { mode } = get();
    if (mode !== 'track' && !(mode === 'queue' && queueExhausted)) return false;

    usePlayer.getState().pauseNow();
    get().cancel();
    return true;
  },
}));

/* The queue asks before advancing; returning true stops it here. */
onTrackEnded((queueExhausted) => useSleep.getState().noteTrackEnded(queueExhausted));

/** Milliseconds left, or undefined when the timer is not counting one. */
export function remaining(endsAt: number | undefined) {
  if (!endsAt) return undefined;
  return Math.max(0, endsAt - Date.now());
}
