import type { TrackInfo } from '../../electron/preload';

export type ReplayGainMode = 'off' | 'track' | 'album';

/**
 * How far the preamp may push an untagged or quiet track.
 *
 * Without a ceiling, a preamp of +12 dB applied to a track that is already near full scale
 * clips it — the correction meant to make listening comfortable becomes the loudest thing
 * in the session.
 */
export const MAX_GAIN_DB = 12;
export const MIN_GAIN_DB = -24;

export function clampGain(db: number) {
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, db));
}

/**
 * The gain to apply for a track, in dB.
 *
 * Album mode falls back to the track value when a file has no album gain, which is the
 * common case for anything not tagged as part of a set. Files with no gain at all get the
 * preamp for untagged material instead — leaving them at 0 dB while everything around them
 * is pulled down makes the untagged ones jump out, which is the opposite of the point.
 */
export function gainFor(
  track: TrackInfo | undefined,
  mode: ReplayGainMode,
  preamp: number,
  untaggedPreamp: number,
) {
  if (!track || mode === 'off') return 0;

  const tagged = mode === 'album'
    ? track.rgAlbum ?? track.rgTrack
    : track.rgTrack ?? track.rgAlbum;

  if (tagged === undefined) return clampGain(untaggedPreamp);

  return clampGain(tagged + preamp);
}
