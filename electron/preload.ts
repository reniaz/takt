import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { PlayerCommand, PlayerState } from './miniPlayer';
import type { IpcRendererEvent } from 'electron';

export type { PlayerCommand, PlayerState };

/**
 * The entire surface the renderer gets. Nothing else crosses the boundary — the renderer
 * runs sandboxed with context isolation, so it has no `require`, no `fs`, and no way to
 * reach a file except by asking for a track id over `takt://`.
 *
 * Every listener returns its own unsubscribe function. Handing back a disposer rather than
 * exposing a `removeListener` means a React effect can clean up without having to hold on
 * to the exact callback identity it registered.
 */

function on<T>(channel: string, listener: (payload: T) => void) {
  const wrapped = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  // Braced so the disposer returns void. `removeListener` returns the IpcRenderer, and a
  // React effect cleanup that returns a value is a type error at every call site.
  return () => { ipcRenderer.removeListener(channel, wrapped); };
}

const api = {
  /* App */
  getVersion: (): Promise<string> => ipcRenderer.invoke('takt:app-version'),
  /**
   * Told to main once React has mounted.
   *
   * This is the readiness signal tools/check-app.mjs keys on, and it has to come from the
   * renderer because nothing observable in the main process distinguishes "the app
   * started" from "the protocol handler returned a 404 and Chromium rendered the error
   * body". Both fire `did-finish-load`.
   */
  signalReady: () => ipcRenderer.send('takt:renderer-ready'),

  /* Window — the titlebar is drawn by the renderer, so it has to drive these. */
  minimize: () => ipcRenderer.send('takt:window-minimize'),
  toggleMaximize: () => ipcRenderer.send('takt:window-toggle-maximize'),
  close: () => ipcRenderer.send('takt:window-close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('takt:window-is-maximized'),
  onWindowState: (listener: (state: { isMaximized: boolean }) => void) =>
    on('takt:window-state', listener),

  /* Library */
  library: (): Promise<TrackInfo[]> => ipcRenderer.invoke('takt:library'),
  pickFiles: (): Promise<TrackInfo[]> => ipcRenderer.invoke('takt:pick-files'),
  /** The folder's name comes back too, as the obvious playlist name to offer. */
  pickFolder: (): Promise<{ tracks: TrackInfo[]; name: string }> => ipcRenderer.invoke('takt:pick-folder'),
  addPaths: (paths: string[]): Promise<TrackInfo[]> => ipcRenderer.invoke('takt:add-paths', paths),
  /**
   * The path behind a dropped File.
   *
   * `File.path` was removed in Electron 32, and a sandboxed renderer has no way back to
   * the filesystem — `webUtils` in the preload is what is left. It is synchronous and does
   * not touch disk; it only reads what the drop already told the browser process.
   */
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  removeTracks: (ids: string[]): Promise<TrackInfo[]> => ipcRenderer.invoke('takt:remove-tracks', ids),
  notePlayed: (id: string) => ipcRenderer.send('takt:note-played', id),
  reveal: (id: string): Promise<void> => ipcRenderer.invoke('takt:reveal', id),
  /** `undefined` when a scan finishes, so the progress bar knows to disappear. */
  onScanProgress: (listener: (progress: { done: number; total: number } | undefined) => void) =>
    on('takt:scan-progress', listener),
  /** Files handed to the app by Explorer — double-click, "Open with", or drag onto the exe. */
  onOpenFiles: (listener: (tracks: TrackInfo[]) => void) => on('takt:open-files', listener),

  /* Playlists. Each returns the full list, so the renderer never patches state by hand. */
  playlists: (): Promise<PlaylistInfo[]> => ipcRenderer.invoke('takt:playlists'),
  createPlaylist: (name: string, trackIds?: string[]): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-create', name, trackIds ?? []),
  renamePlaylist: (id: string, name: string): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-rename', id, name),
  deletePlaylist: (id: string): Promise<PlaylistInfo[]> => ipcRenderer.invoke('takt:playlist-delete', id),
  addToPlaylist: (id: string, trackIds: string[]): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-add', id, trackIds),
  removeFromPlaylist: (id: string, trackIds: string[]): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-remove', id, trackIds),
  reorderPlaylist: (id: string, trackIds: string[]): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-reorder', id, trackIds),
  pickPlaylistThumbnail: (id: string): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-thumbnail', id),
  clearPlaylistThumbnail: (id: string): Promise<PlaylistInfo[]> =>
    ipcRenderer.invoke('takt:playlist-thumbnail-clear', id),
  importPlaylist: (): Promise<{ playlists: PlaylistInfo[]; tracks: TrackInfo[] }> =>
    ipcRenderer.invoke('takt:playlist-import'),
  exportPlaylist: (id: string): Promise<boolean> => ipcRenderer.invoke('takt:playlist-export', id),

  /*
   * Mini player, tray and taskbar buttons.
   *
   * The main window publishes state; every other surface renders it and sends commands
   * back. Only one window ever owns an audio element — two would play the same track
   * twice, slightly out of step.
   */
  publishState: (state: PlayerState) => ipcRenderer.send('takt:player-state', state),
  currentState: (): Promise<PlayerState> => ipcRenderer.invoke('takt:player-state-now'),
  onPlayerState: (listener: (state: PlayerState) => void) => on('takt:player-state', listener),
  sendCommand: (command: PlayerCommand) => ipcRenderer.send('takt:player-command', command),
  onCommand: (listener: (command: PlayerCommand) => void) => on('takt:player-command', listener),
  toggleMini: (): Promise<boolean> => ipcRenderer.invoke('takt:mini-toggle'),
  closeMini: () => ipcRenderer.send('takt:mini-close'),
  showMain: () => ipcRenderer.send('takt:show-main'),

  /* Updates */
  onUpdateReady: (listener: () => void) => on('takt:update-ready', listener),
  installUpdate: () => ipcRenderer.send('takt:install-update'),
} as const;

export type TrackInfo = {
  id: string;
  path: string;
  title: string;
  artist?: string;
  /**
   * Who the *record* is by, which is not always who the track is by.
   *
   * The distinction is what keeps a compilation or a guest appearance from splintering
   * into one album per featured artist.
   */
  albumArtist?: string;
  album?: string;
  year?: number;
  trackNo?: number;
  discNo?: number;
  genre?: string;
  duration?: number;
  /** Filename under the artwork cache, served as `takt://art/<artwork>`. */
  artwork?: string;
  /** ReplayGain, in dB, as tagged. Absent means the file carries no gain information. */
  rgTrack?: number;
  rgAlbum?: number;
  addedAt?: number;
  playCount?: number;
  lastPlayedAt?: number;
};

export type PlaylistInfo = {
  id: string;
  name: string;
  /** An absolute path to a chosen cover. Absent means the UI builds a mosaic. */
  thumbnail?: string;
  trackIds: string[];
};

export type TaktApi = typeof api;

contextBridge.exposeInMainWorld('takt', api);
