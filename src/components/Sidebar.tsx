import { useRef, useState } from 'react';

import { playlistTracks, useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { ContextMenu, type MenuState } from './ContextMenu';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { NamePrompt } from './NamePrompt';
import { PlaylistArt } from './PlaylistArt';

import type { TrackInfo } from '../../electron/preload';

export function Sidebar() {
  const view = useLibrary((s) => s.view);
  const setView = useLibrary((s) => s.setView);
  const playlists = useLibrary((s) => s.playlists);
  const setPlaylists = useLibrary((s) => s.setPlaylists);
  const merge = useLibrary((s) => s.merge);
  const trackCount = useLibrary((s) => s.tracks.size);

  const enqueue = usePlayer((s) => s.enqueue);
  const playNow = usePlayer((s) => s.playNow);
  const playNext = usePlayer((s) => s.playNext);

  const [menu, setMenu] = useState<MenuState>(undefined);
  const [renaming, setRenaming] = useState<string | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [imported, setImported] = useState<{ tracks: TrackInfo[]; name: string } | undefined>(undefined);

  const addFiles = async () => {
    const tracks = await window.takt.pickFiles();
    merge(tracks);
    if (tracks.length) setView({ kind: 'library' });
  };

  const addFolder = async () => {
    const result = await window.takt.pickFolder();
    if (!result.tracks.length) return;

    merge(result.tracks);
    setView({ kind: 'library' });
    // The tracks are already in the library; the only open question is whether the folder
    // should also become a playlist, which is asked once rather than guessed.
    setImported(result);
  };

  return (
    <nav className="sidebar">
      <div className="sidebar__section">
        <button
          type="button"
          className={`navitem ${view.kind === 'library' ? 'navitem--active' : ''}`}
          onClick={() => setView({ kind: 'library' })}
        >
          <Icon name="music" size={16} />
          <span>All tracks</span>
          <span className="navitem__count">{trackCount || ''}</span>
        </button>

        {/* Drilling into one of these sets `previous`, so the album view can go back. */}
        <button
          type="button"
          className={`navitem ${view.kind === 'albums' || view.kind === 'album' ? 'navitem--active' : ''}`}
          onClick={() => setView({ kind: 'albums' })}
        >
          <Icon name="album" size={16} />
          <span>Albums</span>
        </button>

        <button
          type="button"
          className={`navitem ${view.kind === 'artists' || view.kind === 'artist' ? 'navitem--active' : ''}`}
          onClick={() => setView({ kind: 'artists' })}
        >
          <Icon name="artist" size={16} />
          <span>Artists</span>
        </button>

        <button
          type="button"
          className={`navitem ${view.kind === 'recent' ? 'navitem--active' : ''}`}
          onClick={() => setView({ kind: 'recent' })}
        >
          <Icon name="clock" size={16} />
          <span>Recently played</span>
        </button>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__label">
          <span>Playlists</span>
          <button
            type="button"
            className="sidebar__add"
            title="New playlist"
            aria-label="New playlist"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        {playlists.length === 0 && <p className="sidebar__empty">None yet.</p>}

        {playlists.map((list) => (
          <div
            key={list.id}
            className={`navitem navitem--playlist ${view.kind === 'playlist' && view.id === list.id ? 'navitem--active' : ''} ${dropTarget === list.id ? 'navitem--drop' : ''}`}
            onClick={() => setView({ kind: 'playlist', id: list.id })}
            onDoubleClick={() => playNow(playlistTracks(list.id), 0, { kind: 'playlist', id: list.id })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setView({ kind: 'playlist', id: list.id }); }}
            /* Tracks can be dragged from any list straight onto a playlist. */
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-takt-tracks')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDropTarget(list.id);
            }}
            onDragLeave={() => setDropTarget((c) => (c === list.id ? undefined : c))}
            onDrop={async (e) => {
              e.preventDefault();
              setDropTarget(undefined);
              const raw = e.dataTransfer.getData('application/x-takt-tracks');
              if (!raw) return;
              setPlaylists(await window.takt.addToPlaylist(list.id, JSON.parse(raw) as string[]));
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  {
                    label: 'Play',
                    icon: 'play',
                    onSelect: () => playNow(playlistTracks(list.id), 0, { kind: 'playlist', id: list.id }),
                  },
                  { label: 'Play next', icon: 'next', onSelect: () => playNext(playlistTracks(list.id)) },
                  { label: 'Add to queue', icon: 'queue', onSelect: () => enqueue(playlistTracks(list.id)) },
                  { kind: 'separator' },
                  { label: 'Rename', icon: 'edit', onSelect: () => setRenaming(list.id) },
                  {
                    label: 'Choose cover…',
                    icon: 'image',
                    onSelect: async () => setPlaylists(await window.takt.pickPlaylistThumbnail(list.id)),
                  },
                  {
                    label: 'Use album covers',
                    icon: 'reset',
                    disabled: !list.thumbnail,
                    onSelect: async () => setPlaylists(await window.takt.clearPlaylistThumbnail(list.id)),
                  },
                  { kind: 'separator' },
                  {
                    label: 'Export as .m3u8',
                    icon: 'download',
                    disabled: list.trackIds.length === 0,
                    onSelect: () => void window.takt.exportPlaylist(list.id),
                  },
                  {
                    label: 'Delete',
                    icon: 'trash',
                    danger: true,
                    onSelect: async () => {
                      setPlaylists(await window.takt.deletePlaylist(list.id));
                      if (view.kind === 'playlist' && view.id === list.id) setView({ kind: 'library' });
                    },
                  },
                ],
              });
            }}
          >
            <PlaylistArt playlist={list} size={22} />

            {renaming === list.id ? (
              <RenameField
                initial={list.name}
                onCommit={async (name) => {
                  if (name && name !== list.name) setPlaylists(await window.takt.renamePlaylist(list.id, name));
                  setRenaming(undefined);
                }}
                onCancel={() => setRenaming(undefined)}
              />
            ) : (
              <>
                <span className="navitem__name">{list.name}</span>
                <span className="navitem__count">{list.trackIds.length || ''}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar__section">
        <div className="sidebar__label"><span>Add</span></div>
        <button type="button" className="navitem" onClick={addFolder}>
          <Icon name="folder" size={16} />
          <span>Folder…</span>
        </button>
        <button type="button" className="navitem" onClick={addFiles}>
          <Icon name="file" size={16} />
          <span>Files…</span>
        </button>
        <button
          type="button"
          className="navitem"
          onClick={async () => {
            const { playlists: next, tracks } = await window.takt.importPlaylist();
            merge(tracks);
            setPlaylists(next);
          }}
        >
          <Icon name="upload" size={16} />
          <span>Import .m3u8…</span>
        </button>
      </div>

      <div className="sidebar__spacer" />

      <ScanProgress />

      <button
        type="button"
        className={`navitem ${view.kind === 'settings' ? 'navitem--active' : ''}`}
        onClick={() => setView(view.kind === 'settings' ? { kind: 'library' } : { kind: 'settings' })}
        aria-pressed={view.kind === 'settings'}
      >
        <Icon name="settings" size={16} />
        <span>Settings</span>
      </button>

      {creating && (
        <NamePrompt
          title="New playlist"
          initial="New playlist"
          onCancel={() => setCreating(false)}
          onConfirm={async (name) => {
            const next = await window.takt.createPlaylist(name);
            setPlaylists(next);
            setCreating(false);
            const created = next[next.length - 1];
            if (created) setView({ kind: 'playlist', id: created.id });
          }}
        />
      )}

      {imported && (
        <Modal
          title="Folder added"
          onClose={() => setImported(undefined)}
          actions={(
            <>
              <button type="button" className="btn" onClick={() => setImported(undefined)}>
                Just add the tracks
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={async () => {
                  const next = await window.takt.createPlaylist(
                    imported.name,
                    imported.tracks.map((t) => t.id),
                  );
                  setPlaylists(next);
                  setImported(undefined);
                  const created = next[next.length - 1];
                  if (created) setView({ kind: 'playlist', id: created.id });
                }}
              >
                Also make a playlist
              </button>
            </>
          )}
        >
          <p className="modal__note">
            {imported.tracks.length} track{imported.tracks.length === 1 ? '' : 's'} from
            {' '}<strong>{imported.name}</strong> are in your library. Make a playlist of
            them under the same name?
          </p>
        </Modal>
      )}

      <ContextMenu state={menu} onClose={() => setMenu(undefined)} />
    </nav>
  );
}

/**
 * The inline name field.
 *
 * Enter commits directly rather than by calling `blur()` and letting the blur handler do
 * it. Routing a deliberate keypress through a focus side effect means the commit only
 * happens if focus actually moves, which is one more thing that can quietly not happen —
 * and leaves the field open with the typed name still in it.
 *
 * A `committed` flag keeps the two paths from both firing: Enter commits, the resulting
 * unmount blurs the field, and without it the blur handler would commit a second time.
 */
function RenameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value.trim());
  };

  return (
    <input
      className="navitem__rename"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        // Space is play/pause, and every letter is a shortcut, everywhere else.
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { done.current = true; onCancel(); }
      }}
    />
  );
}

/** Shown only while a scan is running; a folder of a few thousand files is not instant. */
function ScanProgress() {
  const scan = useLibrary((s) => s.scan);
  if (!scan) return null;

  return (
    <div className="scan">
      <div className="scan__text">Reading tags… {scan.done} / {scan.total}</div>
      <div className="scan__track">
        <div className="scan__bar" style={{ width: `${(scan.done / Math.max(1, scan.total)) * 100}%` }} />
      </div>
    </div>
  );
}
