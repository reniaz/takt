import { useEffect, useMemo, useState } from 'react';

import { formatTime } from '../audio/time';
import {
  albumKey, byDiscAndTrack, creditedArtist, favourites, filterTracks, recentlyPlayed,
  sortTracks, type SortKey,
} from '../state/browse';
import { playlistTracks, useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { AlbumHeader } from './Browse';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { Icon } from './Icon';
import { NamePrompt } from './NamePrompt';
import { PlaylistArt } from './PlaylistArt';

import type { QueueSource } from '../state/player';
import type { TrackInfo } from '../../electron/preload';

/** An album's tracks in their recorded order. */
function albumTracks(key: string, all: Map<string, TrackInfo>) {
  return [...all.values()].filter((t) => albumKey(t) === key).sort(byDiscAndTrack);
}

/** Everything credited to one artist, grouped by record rather than run together. */
function artistTracks(name: string, all: Map<string, TrackInfo>) {
  return [...all.values()]
    .filter((t) => creditedArtist(t) === name)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0)
      || (a.album ?? '').localeCompare(b.album ?? '', undefined, { numeric: true })
      || byDiscAndTrack(a, b));
}

export function TrackList() {
  const view = useLibrary((s) => s.view);
  const all = useLibrary((s) => s.tracks);
  const playlists = useLibrary((s) => s.playlists);
  const setPlaylists = useLibrary((s) => s.setPlaylists);
  const removeTracks = useLibrary((s) => s.removeTracks);
  const setView = useLibrary((s) => s.setView);
  const toggleFavourite = useLibrary((s) => s.toggleFavourite);

  const currentId = usePlayer((s) => s.queue[s.index]);
  const source = usePlayer((s) => s.source);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playNow = usePlayer((s) => s.playNow);
  const playNext = usePlayer((s) => s.playNext);
  const enqueue = usePlayer((s) => s.enqueue);
  const toggle = usePlayer((s) => s.toggle);

  const [menu, setMenu] = useState<MenuState>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [naming, setNaming] = useState<string[] | undefined>(undefined);

  const query = useLibrary((s) => s.query);
  const sort = useLibrary((s) => s.sort);
  const toggleSort = useLibrary((s) => s.toggleSort);

  const listId = view.kind === 'playlist' ? view.id : undefined;
  const playlist = listId ? playlists.find((p) => p.id === listId) : undefined;

  /*
   * A playlist and an album are ordered by their own logic; the library is not.
   *
   * Sorting is applied only where there is no inherent order to destroy — imposing "by
   * title" on a record would scramble the sequence it was meant to be heard in, and on a
   * playlist it would throw away the order someone arranged by hand.
   */
  const ordered = view.kind === 'playlist'
    ? playlistTracks(view.id)
    : view.kind === 'album'
      ? albumTracks(view.key, all)
      : view.kind === 'artist'
        ? artistTracks(view.name, all)
        : view.kind === 'recent'
          ? recentlyPlayed([...all.values()])
          : view.kind === 'favourites'
            ? favourites([...all.values()])
            : sortTracks([...all.values()], sort);

  const keepsOwnOrder = view.kind === 'playlist' || view.kind === 'album'
    || view.kind === 'artist' || view.kind === 'recent' || view.kind === 'favourites';

  const tracks: TrackInfo[] = filterTracks(ordered, query);

  const here: QueueSource = listId ? { kind: 'playlist', id: listId } : { kind: 'library' };

  /*
   * A track can be in the library and in several playlists at once, so matching on id
   * alone lights it up in every list that contains it. It only counts as playing in the
   * list the queue was actually started from.
   */
  const isSourceOfPlayback = source?.kind === here.kind
    && (source.kind !== 'playlist' || source.id === listId);

  // Selection belongs to a view; carrying it across would act on rows that are no longer
  // on screen.
  useEffect(() => setSelected([]), [view.kind, listId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(tracks.map((t) => t.id));
      } else if (e.key === 'Escape') {
        setSelected([]);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tracks]);

  const asTracks = useMemo(
    () => (ids: readonly string[]) => ids.map((i) => all.get(i)).filter((t): t is TrackInfo => Boolean(t)),
    [all],
  );

  if (!tracks.length && !playlist) {
    return query ? <NoMatches query={query} /> : <EmptyLibrary />;
  }

  /** Acting on a row that is not selected acts on that row alone, as every file list does. */
  const targets = (id: string) => (selected.includes(id) ? selected : [id]);

  const addToPlaylistItems = (ids: string[]): MenuItem[] => [
    { kind: 'label', label: 'Add to playlist' },
    ...playlists.map((p): MenuItem => ({
      label: p.name,
      icon: 'plus',
      onSelect: async () => setPlaylists(await window.takt.addToPlaylist(p.id, ids)),
    })),
    { label: 'New playlist…', icon: 'plus', onSelect: () => setNaming(ids) },
  ];

  const menuFor = (id: string): MenuItem[] => {
    const ids = targets(id);
    const chosen = asTracks(ids);
    const many = ids.length > 1;

    return [
      { label: many ? `Play ${ids.length} tracks` : 'Play', icon: 'play', onSelect: () => playNow(chosen, 0, here) },
      { label: 'Play next', icon: 'next', onSelect: () => playNext(chosen) },
      { label: 'Add to queue', icon: 'queue', onSelect: () => enqueue(chosen) },
      { kind: 'separator' },
      {
        label: chosen[0]?.favourite
          ? (many ? 'Remove from favourites' : 'Remove from favourites')
          : (many ? `Add ${ids.length} to favourites` : 'Add to favourites'),
        icon: chosen[0]?.favourite ? 'heartFull' : 'heart',
        onSelect: () => toggleFavourite(ids),
      },
      ...addToPlaylistItems(ids),
      { kind: 'separator' },
      ...(playlist
        ? [{
          label: many ? `Remove ${ids.length} from ${playlist.name}` : `Remove from ${playlist.name}`,
          icon: 'close' as const,
          onSelect: async () => {
            setPlaylists(await window.takt.removeFromPlaylist(playlist.id, ids));
            setSelected([]);
          },
        }]
        : []),
      { label: 'Show in Explorer', icon: 'folder', onSelect: () => void window.takt.reveal(id) },
      {
        // Removes it from Takt's index. The file itself is not touched — deleting
        // someone's music from a right-click menu is not a risk worth taking.
        label: many ? `Remove ${ids.length} from library` : 'Remove from library',
        icon: 'trash',
        danger: true,
        onSelect: async () => { await removeTracks(ids); setSelected([]); },
      },
    ];
  };

  return (
    <div className="tracklist">
      <BackLink />

      {playlist && <PlaylistHeader id={playlist.id} tracks={tracks} source={here} />}
      {view.kind === 'album' && <AlbumHeader albumKey={view.key} />}
      {view.kind === 'artist' && <SimpleHeader kind="Artist" title={view.name} tracks={tracks} source={here} />}
      {view.kind === 'recent' && <SimpleHeader kind="Recently played" title="Recently played" tracks={tracks} source={here} />}
      {view.kind === 'favourites' && <SimpleHeader kind="Favourites" title="Favourites" tracks={tracks} source={here} />}

      {!keepsOwnOrder && (
        <div className="cols" role="row">
          <span />
          <span />
          <SortHeader label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
          <SortHeader label="Album" sortKey="album" sort={sort} onSort={toggleSort} />
          <span />
          <SortHeader label="Plays" sortKey="plays" sort={sort} onSort={toggleSort} align="right" />
          <SortHeader label="Time" sortKey="duration" sort={sort} onSort={toggleSort} align="right" />
        </div>
      )}

      {!tracks.length && playlist && (
        <div className="empty empty--inline">
          <h2>Nothing in here yet</h2>
          <p>Drag tracks onto it in the sidebar, or right-click a track and add it here.</p>
        </div>
      )}

      <div className="rows" role="list">
        {tracks.map((track, i) => {
          const isCurrent = track.id === currentId && isSourceOfPlayback;
          const isSelected = selected.includes(track.id);

          return (
            <div
              key={track.id}
              role="listitem"
              className={`row ${isCurrent ? 'row--current' : ''} ${isSelected ? 'row--selected' : ''}`}
              tabIndex={0}
              draggable
              onDragStart={(e) => {
                const ids = targets(track.id);
                e.dataTransfer.setData('application/x-takt-tracks', JSON.stringify(ids));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  setSelected((s) => (s.includes(track.id) ? s.filter((x) => x !== track.id) : [...s, track.id]));
                } else if (e.shiftKey && selected.length) {
                  const from = tracks.findIndex((t) => t.id === selected[selected.length - 1]);
                  const [a, b] = from < i ? [from, i] : [i, from];
                  setSelected(tracks.slice(a, b + 1).map((t) => t.id));
                } else {
                  setSelected([track.id]);
                }
              }}
              // Playing starts the whole visible list from here, so the queue is what you
              // were looking at rather than one orphaned track.
              onDoubleClick={() => playNow(tracks, i, here)}
              onKeyDown={(e) => { if (e.key === 'Enter') playNow(tracks, i, here); }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.includes(track.id)) setSelected([track.id]);
                setMenu({ x: e.clientX, y: e.clientY, items: menuFor(track.id) });
              }}
            >
              <div className="row__index">
                {isCurrent && isPlaying ? <Bars /> : <span className="row__number">{i + 1}</span>}
              </div>

              {/*
                The artwork doubles as the play button on hover. Double-click still works,
                but nothing should have to be discovered by trying it twice.
              */}
              <button
                type="button"
                className="row__art"
                aria-label={isCurrent ? (isPlaying ? `Pause ${track.title}` : `Resume ${track.title}`) : `Play ${track.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isCurrent) toggle();
                  else playNow(tracks, i, here);
                }}
              >
                {track.artwork
                  ? <img src={`takt://art/${track.artwork}`} alt="" loading="lazy" />
                  : <Icon name="music" size={14} />}
                <span className="row__play">
                  <Icon name={isCurrent && isPlaying ? 'pause' : 'play'} size={13} />
                </span>
              </button>

              <div className="row__main">
                <div className="row__title">{track.title}</div>
                <div className="row__sub">{track.artist ?? 'Unknown artist'}</div>
              </div>

              <div className="row__album">{track.album ?? ''}</div>

              {/*
                Filled hearts stay visible; empty ones appear on hover. A column of hollow
                outlines down an entire library is noise, and the ones that are set are
                exactly the thing worth seeing at a glance.
              */}
              <button
                type="button"
                className={`row__fav ${track.favourite ? 'row__fav--on' : ''}`}
                aria-pressed={Boolean(track.favourite)}
                aria-label={track.favourite ? `Remove ${track.title} from favourites` : `Add ${track.title} to favourites`}
                title={track.favourite ? 'Remove from favourites' : 'Add to favourites'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavourite(targets(track.id));
                }}
              >
                <Icon name={track.favourite ? 'heartFull' : 'heart'} size={14} />
              </button>

              <div className="row__plays">{track.playCount || ''}</div>
              <div className="row__time">{track.duration ? formatTime(track.duration) : ''}</div>
            </div>
          );
        })}
      </div>

      {selected.length > 1 && (
        <SelectionBar
          count={selected.length}
          onPlay={() => playNow(asTracks(selected), 0, here)}
          onPlayNext={() => playNext(asTracks(selected))}
          onQueue={() => enqueue(asTracks(selected))}
          onAdd={(e) => setMenu({ x: e.clientX, y: e.clientY - 8, items: addToPlaylistItems(selected) })}
          onClear={() => setSelected([])}
        />
      )}

      {naming && (
        <NamePrompt
          title="New playlist"
          initial="New playlist"
          note={`${naming.length} track${naming.length === 1 ? '' : 's'} will be added.`}
          onCancel={() => setNaming(undefined)}
          onConfirm={async (name) => {
            const next = await window.takt.createPlaylist(name, naming);
            setPlaylists(next);
            setNaming(undefined);
            const created = next[next.length - 1];
            if (created) setView({ kind: 'playlist', id: created.id });
          }}
        />
      )}

      <ContextMenu state={menu} onClose={() => setMenu(undefined)} />
    </div>
  );
}

/* ---------- playlist header ---------- */

function PlaylistHeader({ id, tracks, source }: { id: string; tracks: TrackInfo[]; source: QueueSource }) {
  const playlists = useLibrary((s) => s.playlists);
  const setPlaylists = useLibrary((s) => s.setPlaylists);
  const playNow = usePlayer((s) => s.playNow);
  const enqueue = usePlayer((s) => s.enqueue);

  const playShuffled = usePlayer((s) => s.playShuffled);

  const [renaming, setRenaming] = useState(false);
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return null;

  return (
    <header className="plhead">
      {/* The cover is the control for changing it — there is nowhere else it would live. */}
      <button
        type="button"
        className="plhead__cover"
        title="Change cover"
        aria-label="Change playlist cover"
        onClick={async () => setPlaylists(await window.takt.pickPlaylistThumbnail(id))}
      >
        <PlaylistArt playlist={playlist} size={92} />
        <span className="plhead__coverHint"><Icon name="image" size={16} /></span>
      </button>

      <div className="plhead__text">
        <div className="plhead__kind">Playlist</div>

        <h1>
          <button
            type="button"
            className="plhead__name"
            title="Rename"
            onClick={() => setRenaming(true)}
          >
            {playlist.name}
          </button>
        </h1>

        <div className="plhead__meta">
          {tracks.length} track{tracks.length === 1 ? '' : 's'}
          {' · '}
          {formatTime(tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0))}
        </div>

        <div className="plhead__actions">
          <button type="button" className="btn btn--primary" disabled={!tracks.length} onClick={() => playNow(tracks, 0, source)}>
            <Icon name="play" size={14} /> Play
          </button>
          <button type="button" className="btn" disabled={!tracks.length} onClick={() => playShuffled(tracks, source)}>
            <Icon name="shuffle" size={14} /> Shuffle
          </button>
          <button type="button" className="btn" disabled={!tracks.length} onClick={() => enqueue(tracks)}>
            <Icon name="queue" size={14} /> Add to queue
          </button>
        </div>
      </div>

      {renaming && (
        <NamePrompt
          title="Rename playlist"
          initial={playlist.name}
          confirmLabel="Rename"
          onCancel={() => setRenaming(false)}
          onConfirm={async (name) => {
            setPlaylists(await window.takt.renamePlaylist(id, name));
            setRenaming(false);
          }}
        />
      )}
    </header>
  );
}

/* ---------- selection ---------- */

function SelectionBar({
  count,
  onPlay,
  onPlayNext,
  onQueue,
  onAdd,
  onClear,
}: {
  count: number;
  onPlay: () => void;
  onPlayNext: () => void;
  onQueue: () => void;
  onAdd: (e: React.MouseEvent) => void;
  onClear: () => void;
}) {
  return (
    <div className="selbar" role="toolbar" aria-label="Selected tracks">
      <span className="selbar__count">{count} selected</span>
      <button type="button" className="btn btn--primary" onClick={onPlay}><Icon name="play" size={14} /> Play</button>
      <button type="button" className="btn" onClick={onPlayNext}><Icon name="next" size={14} /> Play next</button>
      <button type="button" className="btn" onClick={onQueue}><Icon name="queue" size={14} /> Queue</button>
      <button type="button" className="btn" onClick={onAdd}><Icon name="plus" size={14} /> Add to playlist</button>
      <button type="button" className="ctl" onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)">
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}

/**
 * The playing indicator: the app mark's 3-1-2-1 stroke pattern, animated. Same shape as the
 * icon, so "playing" and "Takt" read as one idea rather than two glyphs.
 */
function Bars() {
  return <span className="bars" aria-label="Playing"><i /><i /><i /><i /></span>;
}

/**
 * Where drilling in came from.
 *
 * A row of its own at the top rather than a button floating beside the header. Absolutely
 * positioned it landed level with the Play button and read as one more action, which is
 * the opposite of what it does. Naming the destination also means the label answers
 * "back to what" without having to remember.
 */
function BackLink() {
  const previous = useLibrary((s) => s.previous);
  const playlists = useLibrary((s) => s.playlists);
  const goBack = useLibrary((s) => s.goBack);

  if (!previous) return null;

  const label = previous.kind === 'albums' ? 'Albums'
    : previous.kind === 'artists' ? 'Artists'
      : previous.kind === 'recent' ? 'Recently played'
        : previous.kind === 'playlist'
          ? playlists.find((p) => p.id === previous.id)?.name ?? 'Playlist'
          : 'All tracks';

  return (
    <button type="button" className="backlink" onClick={goBack}>
      <Icon name="back" size={15} />
      {label}
    </button>
  );
}

/** A column header that sorts. The arrow only appears on the column actually in effect. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;

  return (
    <button
      type="button"
      className={`col ${active ? 'col--active' : ''} ${align === 'right' ? 'col--right' : ''}`}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active && <Icon name={sort.dir === 'asc' ? 'sortAsc' : 'sortDesc'} size={12} />}
    </button>
  );
}

/** Header for the views that have a name and a track list but nothing to edit. */
function SimpleHeader({
  kind,
  title,
  tracks,
  source,
}: {
  kind: string;
  title: string;
  tracks: TrackInfo[];
  source: QueueSource;
}) {
  const playNow = usePlayer((s) => s.playNow);
  const playShuffled = usePlayer((s) => s.playShuffled);
  const enqueue = usePlayer((s) => s.enqueue);

  return (
    <header className="plhead plhead--simple">
      <div className="plhead__text">
        <div className="plhead__kind">{kind}</div>
        <h1>{title}</h1>
        <div className="plhead__meta">
          {tracks.length} track{tracks.length === 1 ? '' : 's'}
          {' · '}
          {formatTime(tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0))}
        </div>
        <div className="plhead__actions">
          <button type="button" className="btn btn--primary" disabled={!tracks.length} onClick={() => playNow(tracks, 0, source)}>
            <Icon name="play" size={14} /> Play
          </button>
          <button type="button" className="btn" disabled={!tracks.length} onClick={() => playShuffled(tracks, source)}>
            <Icon name="shuffle" size={14} /> Shuffle
          </button>
          <button type="button" className="btn" disabled={!tracks.length} onClick={() => enqueue(tracks)}>
            <Icon name="queue" size={14} /> Add to queue
          </button>
        </div>
      </div>
    </header>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <div className="empty">
      <h2>Nothing matches “{query}”</h2>
      <p>Try fewer words — every one of them has to match.</p>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="empty">
      <div className="empty__mark">
        <svg width="52" height="52" viewBox="0 0 16 16" aria-hidden="true">
          <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" fill="none">
            <path d="M4.25 3.5v9" /><path d="M6.75 6.5v3" />
            <path d="M9.25 5v6" /><path d="M11.75 6.5v3" />
          </g>
        </svg>
      </div>
      <h2>Nothing here yet</h2>
      <p>Add some files or a folder from the sidebar to get started.</p>
    </div>
  );
}
