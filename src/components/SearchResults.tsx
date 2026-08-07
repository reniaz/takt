import { formatTime } from '../audio/time';
import { albumKey, creditedArtist } from '../state/browse';
import { Icon } from './Icon';

import type { RecentPick } from '../state/recentSearches';
import type { PlaylistInfo, TrackInfo } from '../../electron/preload';

/**
 * One row of the search dropdown, flattened.
 *
 * Everything is reduced to the same shape so keyboard navigation is an index into a single
 * list. Grouped arrays would mean the arrow keys had to know how many groups there were
 * and which of them were empty — a source of off-by-ones for no gain.
 */
export type ResultRow = {
  /** Stable per row, for React keys and for comparing the highlighted one. */
  id: string;
  kind: 'track' | 'album' | 'artist' | 'playlist';
  label: string;
  sub: string;
  /** An artwork hash, resolved to `takt://art/...` when drawn. */
  artwork?: string;
  /** Shown on the right. A duration, a track count. */
  meta?: string;
  /** What this row stands for, so picking it can be remembered. */
  pick: RecentPick;
  activate: () => void;
  /** Tracks play; everything else opens. Only the former gets a play glyph. */
  playable: boolean;
};

export function trackRow(track: TrackInfo, activate: () => void): ResultRow {
  return {
    id: `track:${track.id}`,
    kind: 'track',
    label: track.title,
    sub: track.artist ?? creditedArtist(track),
    ...(track.artwork ? { artwork: track.artwork } : undefined),
    ...(track.duration ? { meta: formatTime(track.duration) } : undefined),
    pick: { kind: 'track', id: track.id },
    activate,
    playable: true,
  };
}

export function albumRow(
  album: { key: string; title: string; artist: string; artwork?: string; trackIds: string[] },
  activate: () => void,
): ResultRow {
  return {
    id: `album:${album.key}`,
    kind: 'album',
    label: album.title,
    sub: album.artist,
    ...(album.artwork ? { artwork: album.artwork } : undefined),
    meta: `${album.trackIds.length}`,
    pick: { kind: 'album', key: album.key },
    activate,
    playable: false,
  };
}

export function artistRow(
  artist: { name: string; artwork?: string; trackIds: string[] },
  activate: () => void,
): ResultRow {
  return {
    id: `artist:${artist.name}`,
    kind: 'artist',
    label: artist.name,
    sub: 'Artist',
    ...(artist.artwork ? { artwork: artist.artwork } : undefined),
    meta: `${artist.trackIds.length}`,
    pick: { kind: 'artist', name: artist.name },
    activate,
    playable: false,
  };
}

export function playlistRow(list: PlaylistInfo, artwork: string | undefined, activate: () => void): ResultRow {
  return {
    id: `playlist:${list.id}`,
    kind: 'playlist',
    label: list.name,
    sub: 'Playlist',
    ...(artwork ? { artwork } : undefined),
    meta: `${list.trackIds.length}`,
    pick: { kind: 'playlist', id: list.id },
    activate,
    playable: false,
  };
}

/** Resolves a remembered pick back to a row, or nothing if it no longer exists. */
export function pickToRow(
  pick: RecentPick,
  tracks: Map<string, TrackInfo>,
  playlists: readonly PlaylistInfo[],
  activate: (pick: RecentPick) => void,
): ResultRow | undefined {
  switch (pick.kind) {
    case 'track': {
      const track = tracks.get(pick.id);
      return track ? trackRow(track, () => activate(pick)) : undefined;
    }
    case 'album': {
      const members = [...tracks.values()].filter((t) => albumKey(t) === pick.key);
      const first = members[0];
      if (!first) return undefined;

      return albumRow({
        key: pick.key,
        title: first.album ?? 'Unknown album',
        artist: creditedArtist(first),
        ...(members.find((t) => t.artwork)?.artwork ? { artwork: members.find((t) => t.artwork)?.artwork } : undefined),
        trackIds: members.map((t) => t.id),
      }, () => activate(pick));
    }
    case 'artist': {
      const members = [...tracks.values()].filter((t) => creditedArtist(t) === pick.name);
      if (!members.length) return undefined;

      return artistRow({
        name: pick.name,
        ...(members.find((t) => t.artwork)?.artwork ? { artwork: members.find((t) => t.artwork)?.artwork } : undefined),
        trackIds: members.map((t) => t.id),
      }, () => activate(pick));
    }
    case 'playlist': {
      const list = playlists.find((p) => p.id === pick.id);
      if (!list) return undefined;

      const artwork = list.trackIds.map((id) => tracks.get(id)?.artwork).find(Boolean);
      return playlistRow(list, artwork, () => activate(pick));
    }
    default:
      return undefined;
  }
}

const ICONS = { track: 'music', album: 'album', artist: 'artist', playlist: 'queue' } as const;

export function ResultList({
  rows,
  highlighted,
  onHover,
  onRemove,
}: {
  rows: readonly ResultRow[];
  highlighted: number;
  onHover: (index: number) => void;
  onRemove?: (row: ResultRow) => void;
}) {
  return (
    <div className="results__list" role="listbox">
      {rows.map((row, i) => (
        <div
          key={row.id}
          role="option"
          aria-selected={i === highlighted}
          className={`result ${i === highlighted ? 'result--on' : ''}`}
          onMouseEnter={() => onHover(i)}
          // Pointer down rather than click: the input's blur closes the panel, and on a
          // click that fires first, so the row would be gone before it was activated.
          onPointerDown={(e) => { e.preventDefault(); row.activate(); }}
        >
          <span className={`result__art ${row.kind === 'artist' ? 'result__art--round' : ''}`}>
            {row.artwork
              ? <img src={`takt://art/${row.artwork}`} alt="" loading="lazy" />
              : <Icon name={ICONS[row.kind]} size={14} />}
            {row.playable && <span className="result__play"><Icon name="play" size={11} /></span>}
          </span>

          <span className="result__text">
            <span className="result__label">{row.label}</span>
            <span className="result__sub">{row.sub}</span>
          </span>

          {row.meta && <span className="result__meta">{row.meta}</span>}

          {onRemove && (
            <button
              type="button"
              className="result__remove"
              aria-label={`Forget ${row.label}`}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(row); }}
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
