import { useMemo } from 'react';

import { formatTime } from '../audio/time';
import { filterTracks, groupAlbums, groupArtists } from '../state/browse';
import { useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { Icon } from './Icon';

import type { TrackInfo } from '../../electron/preload';

/**
 * The album grid and the artist list.
 *
 * Both are derived from the same flat library on every render rather than kept as their
 * own state. Grouping a few thousand tracks costs well under a frame, and a cache would
 * have to be invalidated by every import, retag and deletion — three chances to show a
 * record that no longer exists.
 */

export function Albums() {
  const tracks = useLibrary((s) => s.tracks);
  const query = useLibrary((s) => s.query);
  const setView = useLibrary((s) => s.setView);
  const playNow = usePlayer((s) => s.playNow);

  const albums = useMemo(
    () => groupAlbums(filterTracks([...tracks.values()], query)),
    [tracks, query],
  );

  if (!albums.length) return <NoResults query={query} what="albums" />;

  return (
    <div className="grid">
      {albums.map((album) => (
        <div
          key={album.key}
          className="card"
          role="button"
          tabIndex={0}
          onClick={() => setView({ kind: 'album', key: album.key })}
          onKeyDown={(e) => { if (e.key === 'Enter') setView({ kind: 'album', key: album.key }); }}
        >
          <div className="card__art">
            {album.artwork
              ? <img src={`takt://art/${album.artwork}`} alt="" loading="lazy" />
              : <Icon name="album" size={30} />}
            <button
              type="button"
              className="card__play"
              aria-label={`Play ${album.title}`}
              onClick={(e) => {
                e.stopPropagation();
                const ordered = album.trackIds
                  .map((id) => tracks.get(id))
                  .filter((t): t is TrackInfo => Boolean(t));
                playNow(ordered, 0, { kind: 'library' });
              }}
            >
              <Icon name="play" size={16} />
            </button>
          </div>
          <div className="card__title">{album.title}</div>
          <div className="card__sub">
            {album.artist}{album.year ? ` · ${album.year}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Artists() {
  const tracks = useLibrary((s) => s.tracks);
  const query = useLibrary((s) => s.query);
  const setView = useLibrary((s) => s.setView);

  const artists = useMemo(
    () => groupArtists(filterTracks([...tracks.values()], query)),
    [tracks, query],
  );

  if (!artists.length) return <NoResults query={query} what="artists" />;

  return (
    <div className="artists">
      {artists.map((artist) => (
        <button
          key={artist.name}
          type="button"
          className="artistrow"
          onClick={() => setView({ kind: 'artist', name: artist.name })}
        >
          <span className="artistrow__art">
            {artist.artwork
              ? <img src={`takt://art/${artist.artwork}`} alt="" loading="lazy" />
              : <Icon name="artist" size={18} />}
          </span>
          <span className="artistrow__name">{artist.name}</span>
          <span className="artistrow__meta">
            {artist.albumCount} album{artist.albumCount === 1 ? '' : 's'}
            {' · '}
            {artist.trackIds.length} track{artist.trackIds.length === 1 ? '' : 's'}
          </span>
          <Icon name="chevronRight" size={15} />
        </button>
      ))}
    </div>
  );
}

/** Header above the tracks of one album, with its cover and totals. */
export function AlbumHeader({ albumKey: key }: { albumKey: string }) {
  const tracks = useLibrary((s) => s.tracks);
  const playNow = usePlayer((s) => s.playNow);
  const playShuffled = usePlayer((s) => s.playShuffled);
  const enqueue = usePlayer((s) => s.enqueue);

  const album = useMemo(
    () => groupAlbums([...tracks.values()]).find((a) => a.key === key),
    [tracks, key],
  );

  if (!album) return null;

  const ordered = album.trackIds
    .map((id) => tracks.get(id))
    .filter((t): t is TrackInfo => Boolean(t));

  return (
    <header className="plhead">
      <span className="plart" style={{ width: 92, height: 92 }}>
        {album.artwork
          ? <img src={`takt://art/${album.artwork}`} alt="" />
          : <Icon name="album" size={34} />}
      </span>

      <div className="plhead__text">
        <div className="plhead__kind">Album</div>
        <h1>{album.title}</h1>
        <div className="plhead__meta">
          {album.artist}
          {album.year ? ` · ${album.year}` : ''}
          {' · '}
          {ordered.length} track{ordered.length === 1 ? '' : 's'}
          {' · '}
          {formatTime(album.duration)}
        </div>
        <div className="plhead__actions">
          <button type="button" className="btn btn--primary" onClick={() => playNow(ordered, 0, { kind: 'library' })}>
            <Icon name="play" size={14} /> Play
          </button>
          <button type="button" className="btn" onClick={() => playShuffled(ordered, { kind: 'library' })}>
            <Icon name="shuffle" size={14} /> Shuffle
          </button>
          <button type="button" className="btn" onClick={() => enqueue(ordered)}>
            <Icon name="queue" size={14} /> Add to queue
          </button>
        </div>
      </div>
    </header>
  );
}

function NoResults({ query, what }: { query: string; what: string }) {
  return (
    <div className="empty">
      <h2>{query ? `No ${what} match “${query}”` : `No ${what} yet`}</h2>
      {!query && <p>Add some music from the sidebar.</p>}
    </div>
  );
}
