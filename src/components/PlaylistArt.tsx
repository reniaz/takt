import { mosaicArt, useLibrary } from '../state/library';
import { Icon } from './Icon';

import type { PlaylistInfo } from '../../electron/preload';

/**
 * A playlist's picture.
 *
 * A chosen cover if there is one, otherwise a mosaic of the first four distinct album
 * covers in it. The mosaic is built in CSS from the artwork already on disk rather than
 * rendered to an image file: nothing to generate, nothing to invalidate, and it is correct
 * the instant a track is added.
 */
export function PlaylistArt({ playlist, size = 34 }: { playlist: PlaylistInfo; size?: number }) {
  const tracks = useLibrary((s) => s.tracks);

  if (playlist.thumbnail) {
    return (
      <span className="plart" style={{ width: size, height: size }}>
        <img src={`takt://cover/${playlist.id}`} alt="" />
      </span>
    );
  }

  const art = mosaicArt(playlist, tracks);

  if (!art.length) {
    return (
      <span className="plart plart--empty" style={{ width: size, height: size }}>
        <Icon name="queue" size={Math.round(size * 0.5)} />
      </span>
    );
  }

  // One cover fills the square; two, three or four tile it. Three leaves the last cell to
  // the background, which reads as deliberate at this size.
  return (
    <span
      className={`plart plart--mosaic ${art.length === 1 ? 'plart--single' : ''}`}
      style={{ width: size, height: size }}
    >
      {art.map((hash) => <img key={hash} src={`takt://art/${hash}`} alt="" />)}
    </span>
  );
}
