import { vi } from 'vitest';

import type { TaktApi } from '../electron/preload';

/**
 * A stub preload bridge for tests.
 *
 * The renderer always runs inside Electron, so `window.takt` is declared non-optional and
 * the stores call it directly. Guarding every call with `?.` to keep tests happy would put
 * a check in production code for a state that cannot happen; supplying the bridge here
 * models reality instead.
 */
/*
 * jsdom has no media pipeline, so `load()` logs "Not implemented" for every call the
 * engine makes. The queue logic under test does not depend on it; stubbing keeps the
 * output readable.
 */
HTMLMediaElement.prototype.load = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

const noop = () => () => {};

const stub = {
  getVersion: async () => '0.0.0-test',
  signalReady: vi.fn(),

  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: async () => false,
  onWindowState: noop,

  library: async () => [],
  pickFiles: async () => [],
  pickFolder: async () => ({ tracks: [], name: '' }),
  addPaths: async () => [],
  removeTracks: async () => [],
  notePlayed: vi.fn(),
  reveal: async () => {},
  pathForFile: () => '',
  onScanProgress: noop,
  onOpenFiles: noop,

  playlists: async () => [],
  createPlaylist: async () => [],
  renamePlaylist: async () => [],
  deletePlaylist: async () => [],
  addToPlaylist: async () => [],
  removeFromPlaylist: async () => [],
  reorderPlaylist: async () => [],
  pickPlaylistThumbnail: async () => [],
  clearPlaylistThumbnail: async () => [],
  importPlaylist: async () => ({ playlists: [], tracks: [] }),
  exportPlaylist: async () => true,

  onUpdateReady: noop,
  installUpdate: vi.fn(),
} satisfies TaktApi;

(window as Window & { takt?: TaktApi }).takt = stub;
