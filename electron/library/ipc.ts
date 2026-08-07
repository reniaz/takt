import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';

import { dialog, ipcMain, shell } from 'electron';

import * as db from './db';
import { AUDIO_EXTENSIONS, importPaths, isAudio, toTrackInfo, walk } from './files';
import { forget, idFor } from './registry';

import type { BrowserWindow } from 'electron';
import type { PlaylistInfo, TrackInfo } from '../preload';

const FILTERS = [{ name: 'Audio', extensions: AUDIO_EXTENSIONS.map((e) => e.slice(1)) }];

function library(): TrackInfo[] {
  return db.allTracks().map(toTrackInfo);
}

function playlists(): PlaylistInfo[] {
  return db.allPlaylists().map((row) => ({
    id: row.id,
    name: row.name,
    ...(row.thumbnail ? { thumbnail: row.thumbnail } : undefined),
    trackIds: db.playlistTrackIds(row.id),
  }));
}

/**
 * Reads an .m3u/.m3u8 into absolute paths.
 *
 * Entries are usually relative to the playlist file, so they are resolved against its
 * directory. `#` lines are comments and `#EXTINF` metadata, which is ignored — the tags in
 * the files themselves are better than whatever the exporting program wrote down.
 */
async function readM3u(file: string) {
  const text = await readFile(file, 'utf8');
  const base = dirname(file);

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    // Remote entries are legal in the format and cannot be played from the library.
    .filter((line) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(line))
    .map((line) => resolve(base, line))
    .filter((path) => isAudio(path) && existsSync(path));
}

export function initLibrary(getWindow: () => BrowserWindow | undefined) {
  db.open();

  const send = (channel: string, payload?: unknown) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  /**
   * Parses files and reports progress.
   *
   * A folder of a few thousand tracks takes long enough that a frozen window looks like a
   * crash, so the renderer is told how far along it is rather than left waiting on one
   * unresolved promise.
   */
  const ingest = async (paths: readonly string[]) => {
    if (!paths.length) return [];

    send('takt:scan-progress', { done: 0, total: paths.length });
    await importPaths(paths, (done, total) => send('takt:scan-progress', { done, total }));
    send('takt:scan-progress', undefined);

    const ids = new Set(paths.map(idFor));
    return db.allTracks().filter((row) => ids.has(row.id)).map(toTrackInfo);
  };

  /* ---------- library ---------- */

  ipcMain.handle('takt:library', () => library());

  ipcMain.handle('takt:pick-files', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add music',
      properties: ['openFile', 'multiSelections'],
      filters: FILTERS,
    });

    return result.canceled ? [] : ingest(result.filePaths);
  });

  /**
   * The folder's own name comes back with its tracks.
   *
   * It is what the renderer offers as the playlist name, and only the main process knows
   * it — the renderer never sees a path.
   */
  ipcMain.handle('takt:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add a music folder',
      properties: ['openDirectory'],
    });

    const dir = result.filePaths[0];
    if (result.canceled || !dir) return { tracks: [], name: '' };

    return { tracks: await ingest(await walk(dir)), name: basename(dir) };
  });

  /** Paths dropped on the window, or handed over by Explorer. */
  ipcMain.handle('takt:add-paths', async (_event, paths: string[]) => {
    const expanded: string[] = [];

    for (const path of paths) {
      if (!existsSync(path)) continue;
      if (isAudio(path)) expanded.push(path);
      else if (!extname(path)) expanded.push(...await walk(path));
    }

    return ingest(expanded);
  });

  ipcMain.handle('takt:remove-tracks', (_event, ids: string[]) => {
    db.removeTracks(ids);
    forget(ids);
    return library();
  });

  ipcMain.on('takt:note-played', (_event, id: string) => db.notePlayed(id));

  /* ---------- playlists ---------- */

  ipcMain.handle('takt:playlists', () => playlists());

  ipcMain.handle('takt:playlist-create', (_event, name: string, trackIds: string[] = []) => {
    const id = db.createPlaylist(name.trim() || 'New playlist');
    if (trackIds.length) db.addToPlaylist(id, trackIds);
    return playlists();
  });

  ipcMain.handle('takt:playlist-rename', (_event, id: string, name: string) => {
    if (name.trim()) db.renamePlaylist(id, name.trim());
    return playlists();
  });

  ipcMain.handle('takt:playlist-delete', (_event, id: string) => {
    db.deletePlaylist(id);
    return playlists();
  });

  ipcMain.handle('takt:playlist-add', (_event, id: string, trackIds: string[]) => {
    db.addToPlaylist(id, trackIds);
    return playlists();
  });

  ipcMain.handle('takt:playlist-remove', (_event, id: string, trackIds: string[]) => {
    db.removeFromPlaylist(id, trackIds);
    return playlists();
  });

  ipcMain.handle('takt:playlist-reorder', (_event, id: string, trackIds: string[]) => {
    db.setPlaylistOrder(id, trackIds);
    return playlists();
  });

  /**
   * A custom cover.
   *
   * The chosen file is referenced where it lies rather than copied into the app's own
   * storage. Copying would mean a second copy of every cover and a cache to invalidate;
   * the cost is that moving the original leaves the playlist without a picture, which the
   * mosaic fallback already handles.
   */
  ipcMain.handle('takt:playlist-thumbnail', async (_event, id: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a playlist cover',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });

    if (result.canceled || !result.filePaths[0]) return playlists();

    db.setPlaylistThumbnail(id, result.filePaths[0]);
    return playlists();
  });

  ipcMain.handle('takt:playlist-thumbnail-clear', (_event, id: string) => {
    db.setPlaylistThumbnail(id, undefined);
    return playlists();
  });

  /* ---------- m3u ---------- */

  ipcMain.handle('takt:playlist-import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import a playlist',
      properties: ['openFile'],
      filters: [{ name: 'Playlists', extensions: ['m3u', 'm3u8'] }],
    });

    if (result.canceled || !result.filePaths[0]) return { playlists: playlists(), tracks: [] };

    const file = result.filePaths[0];
    const paths = await readM3u(file);
    const tracks = await ingest(paths);

    const name = file.replace(/^.*[\\/]/, '').replace(/\.m3u8?$/i, '');
    const id = db.createPlaylist(name || 'Imported');
    // The file's order is the playlist's order, so ingest order must not be relied on.
    db.addToPlaylist(id, paths.map(idFor));

    return { playlists: playlists(), tracks };
  });

  ipcMain.handle('takt:playlist-export', async (_event, id: string) => {
    const list = db.allPlaylists().find((p) => p.id === id);
    if (!list) return false;

    const result = await dialog.showSaveDialog({
      title: 'Export playlist',
      defaultPath: `${list.name.replace(/[\\/:*?"<>|]/g, '_')}.m3u8`,
      filters: [{ name: 'Playlist', extensions: ['m3u8'] }],
    });

    if (result.canceled || !result.filePath) return false;

    const rows = db.allTracks();
    const byId = new Map(rows.map((r) => [r.id, r]));

    const lines = ['#EXTM3U'];
    for (const trackId of db.playlistTrackIds(id)) {
      const track = byId.get(trackId);
      if (!track) continue;
      const seconds = track.duration ? Math.round(track.duration) : -1;
      lines.push(`#EXTINF:${seconds},${track.artist ? `${track.artist} - ` : ''}${track.title}`);
      lines.push(track.path);
    }

    // Absolute paths and a BOM-less UTF-8 file: what every other player reads without
    // argument, and what makes the export survive being opened from another folder.
    await writeFile(result.filePath, `${lines.join('\r\n')}\r\n`, 'utf8');
    return true;
  });

  /* By id, so the renderer never handles a filesystem path. */
  ipcMain.handle('takt:reveal', (_event, id: string) => {
    const path = db.trackPath(id);
    if (path) shell.showItemInFolder(path);
  });
}
