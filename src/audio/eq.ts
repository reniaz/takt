export type BandKind = 'lowshelf' | 'peaking' | 'highshelf';

export type Band = {
  frequency: number;
  kind: BandKind;
  /** Shown on the slider. `31` rather than `31 Hz`, the unit is in the axis label. */
  label: string;
};

/**
 * Ten bands on the usual ISO-ish octave centres.
 *
 * The first and last are shelves, not peaks. A peaking filter at 31 Hz leaves everything
 * below 31 Hz untouched, so dragging the leftmost slider up would do almost nothing to the
 * sub-bass someone is obviously reaching for. A low shelf lifts the whole bottom end,
 * which is what the control looks like it promises. Same argument at the top.
 */
export const BANDS: readonly Band[] = [
  { frequency: 31, kind: 'lowshelf', label: '31' },
  { frequency: 62, kind: 'peaking', label: '62' },
  { frequency: 125, kind: 'peaking', label: '125' },
  { frequency: 250, kind: 'peaking', label: '250' },
  { frequency: 500, kind: 'peaking', label: '500' },
  { frequency: 1000, kind: 'peaking', label: '1k' },
  { frequency: 2000, kind: 'peaking', label: '2k' },
  { frequency: 4000, kind: 'peaking', label: '4k' },
  { frequency: 8000, kind: 'peaking', label: '8k' },
  { frequency: 16000, kind: 'highshelf', label: '16k' },
];

export const BAND_COUNT = BANDS.length;
export const MAX_GAIN_DB = 12;

/**
 * Roughly one octave of bandwidth, which is what makes ten sliders tile the spectrum
 * without leaving dips between them. Only meaningful for the peaking bands; shelves
 * ignore Q.
 */
export const BAND_Q = 1.41;

export const FLAT: readonly number[] = Array<number>(BAND_COUNT).fill(0);

export type Preset = {
  id: string;
  label: string;
  gains: readonly number[];
};

export const PRESETS: readonly Preset[] = [
  { id: 'flat', label: 'Flat', gains: FLAT },
  { id: 'bass', label: 'Bass boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', label: 'Treble boost', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: 'vocal', label: 'Vocal', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  { id: 'loudness', label: 'Loudness', gains: [6, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
  { id: 'rock', label: 'Rock', gains: [5, 4, 2, -1, -2, 0, 2, 4, 5, 5] },
  { id: 'jazz', label: 'Jazz', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: 'classical', label: 'Classical', gains: [4, 3, 2, 0, -1, -1, 0, 2, 3, 4] },
  { id: 'electronic', label: 'Electronic', gains: [5, 4, 1, 0, -2, 2, 1, 1, 4, 5] },
];

/**
 * How much to pull the signal down ahead of the filters so boosts do not clip.
 *
 * Boosting a band raises the peak level of anything with energy there, and a track
 * mastered near full scale — which is most of them — has no headroom to absorb it. The
 * result is clipping that sounds like the EQ itself is broken. Backing off by the largest
 * boost trades a little level for never distorting; overlapping bands can still stack
 * beyond this, so it is a floor rather than a guarantee.
 */
export function autoPreamp(gains: readonly number[]) {
  return -Math.max(0, ...gains);
}

/** dB to a linear gain multiplier. */
export function dbToGain(db: number) {
  return 10 ** (db / 20);
}
