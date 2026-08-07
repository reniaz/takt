import { useState } from 'react';

import { formatTime } from '../audio/time';
import { playlistTracks, useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { Icon } from './Icon';
import { PlaylistArt } from './PlaylistArt';

import type { TrackInfo } from '../../electron/preload';

export function TrackList() {
  const view = useLibrary((s) => s.view);
  const all = useLibrary((s) => s.tracks);
  const playlists = useLibrary((s) => s.playlists);
  const setPlaylists = useLibrary((s) => s.setPlaylists);
  const removeTracks = useLibrary((s) => s.removeTracks);
  const setView = useLibrary((s) => s.setView);

  const currentId = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playNow = usePlayer((s) => s.playNow);
  const playNext = usePlayer((s) => s.playNext);
  const enqueue = usePlayer((s) => s.enqueue);

  const [menu, setMenu] = useState<MenuState>(undefined);
  const [selected, setSelected] = useState<string[]>([]);

  const list = view.kind === 'playlist' ? view.id : undefined;
  const tracks: TrackInfo[] = list ? playlistTracks(list) : [...all.values()];
  const playlist = list ? playlists.find((p) => p.id === list) : undefined;

  if (!tracks.length) return <EmptyState playlist={playlist?.name} />;

  /** Acting on a row that is not selected acts on that row alone, as every file list does. */
  const targets = (id: string) => (selected.includes(id) ? selected : [id]);
  const asTracks = (ids: string[]) => ids.map((i) => all.get(i)).filter((t): t is TrackInfo => Boolean(t));

  const menuFor = (id: string): MenuItem[] => {
    const ids = targets(id);
    const chosen = asTracks(ids);
    const many = ids.length > 1;

    return [
      { label: many ? `Play ${ids.length} tracks` : 'Play', icon: 'play', onSelect: () => playNow(chosen) },
      { label: 'Play next', icon: 'next', onSelect: () => playNext(chosen) },
      { label: 'Add to queue', icon: 'queue', onSelect: () => enqueue(chosen) },
      { kind: 'separator' },
      { kind: 'label', label: 'Add to playlist' },
      ...playlists.map((p): MenuItem => ({
        label: p.name,
        icon: 'plus',
        onSelect: async () => setPlaylists(await window.takt.addToPlaylist(p.id, ids)),
      })),
      {
        label: 'New playlist…',
        icon: 'plus',
        onSelect: async () => {
          const next = await window.takt.createPlaylist('New playlist', ids);
          setPlaylists(next);
          const created = next[next.length - 1];
          if (created) setView({ kind: 'playlist', id: created.id });
        },
      },
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
      {playlist && (
        <header className="plhead">
          <PlaylistArt playlist={playlist} size={92} />
          <div className="plhead__text">
            <div className="plhead__kind">Playlist</div>
            <h1>{playlist.name}</h1>
            <div className="plhead__meta">
              {tracks.length} track{tracks.length === 1 ? '' : 's'}
              {' · '}
              {formatTime(tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0))}
            </div>
            <div className="plhead__actions">
              <button type="button" className="btn btn--primary" onClick={() => playNow(tracks)}>
                <Icon name="play" size={14} /> Play
              </button>
              <button type="button" className="btn" onClick={() => enqueue(tracks)}>
                <Icon name="queue" size={14} /> Add to queue
              </button>
            </div>
          </div>
        </header>
      )}

      <div className="rows" role="list">
        {tracks.map((track, i) => {
          const isCurrent = track.id === currentId;
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
              onDoubleClick={() => playNow(tracks, i)}
              onKeyDown={(e) => { if (e.key === 'Enter') playNow(tracks, i); }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.includes(track.id)) setSelected([track.id]);
                setMenu({ x: e.clientX, y: e.clientY, items: menuFor(track.id) });
              }}
            >
              <div className="row__index">
                {isCurrent && isPlaying ? <Bars /> : <span className="row__number">{i + 1}</span>}
              </div>

              <div className="row__art">
                {track.artwork
                  ? <img src={`takt://art/${track.artwork}`} alt="" loading="lazy" />
                  : <Icon name="music" size={14} />}
              </div>

              <div className="row__main">
                <div className="row__title">{track.title}</div>
                <div className="row__sub">{track.artist ?? 'Unknown artist'}</div>
              </div>

              <div className="row__album">{track.album ?? ''}</div>
              <div className="row__time">{track.duration ? formatTime(track.duration) : ''}</div>
            </div>
          );
        })}
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(undefined)} />
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

function EmptyState({ playlist }: { playlist?: string }) {
  const merge = useLibrary((s) => s.merge);

  if (playlist !== undefined) {
    return (
      <div className="empty">
        <h2>{playlist} is empty</h2>
        <p>Drag tracks onto it in the sidebar, or right-click a track and add it here.</p>
      </div>
    );
  }

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
      <p>Add some files or a folder to get started.</p>
      <div className="empty__actions">
        <button type="button" className="btn btn--primary" onClick={async () => merge(await window.takt.pickFolder())}>
          <Icon name="folder" size={16} />
          Add folder
        </button>
        <button type="button" className="btn" onClick={async () => merge(await window.takt.pickFiles())}>
          <Icon name="file" size={16} />
          Add files
        </button>
      </div>
    </div>
  );
}
