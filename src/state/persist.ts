import { FLAT } from '../audio/eq';
import { DEFAULT_THEME_ID } from '../themes/themes';

import type { Preset } from '../audio/eq';
import type { Repeat } from './player';

/**
 * Settings that outlive the window.
 *
 * localStorage rather than a file in the main process, for the same reason Draht keeps
 * plugin settings there: it is synchronous. The theme has to be applied on the first paint,
 * and an async round trip to main means a frame of the wrong colours on every launch.
 *
 * Only preferences are kept here. The library and the queue are a different problem with a
 * different lifetime and belong in SQLite.
 */

const KEY = 'takt-settings';

/** Coalesces the bursts a slider produces into one write. */
const WRITE_DELAY = 150;

export type Persisted = {
  themeId: string;
  brightness: number;
  volume: number;
  muted: boolean;
  repeat: Repeat;
  shuffle: boolean;
  eqEnabled: boolean;
  eqGains: number[];
  eqPreamp: number;
  eqPreampAuto: boolean;
  customPresets: Preset[];
};

export const DEFAULTS: Persisted = {
  themeId: DEFAULT_THEME_ID,
  brightness: 0,
  volume: 0.7,
  muted: false,
  repeat: 'off',
  shuffle: false,
  eqEnabled: false,
  eqGains: [...FLAT],
  eqPreamp: 0,
  eqPreampAuto: true,
  customPresets: [],
};

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };

    const parsed = JSON.parse(raw) as Partial<Persisted>;

    /*
     * Merged over the defaults rather than trusted wholesale. A settings file written by an
     * older version is missing whatever was added since, and spreading it directly would
     * leave those keys `undefined` — which is not the same as absent once it reaches a
     * slider's `value`.
     */
    return {
      ...DEFAULTS,
      ...parsed,
      // The band count is part of the audio graph's shape. A saved curve from a build with
      // a different number of bands would misalign every filter.
      eqGains: parsed.eqGains?.length === DEFAULTS.eqGains.length
        ? parsed.eqGains
        : [...DEFAULTS.eqGains],
    };
  } catch {
    // Corrupt JSON should cost the settings, not the app.
    return { ...DEFAULTS };
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function save(state: Persisted) {
  if (timer) clearTimeout(timer);

  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // A full or blocked storage is not worth interrupting playback over.
    }
  }, WRITE_DELAY);
}
