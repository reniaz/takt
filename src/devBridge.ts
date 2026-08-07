import type { PlaylistInfo, TaktApi, TrackInfo } from '../electron/preload';

/**
 * A stand-in for the preload bridge, installed only in `vite dev` and only when the real
 * one is absent.
 *
 * Opening http://localhost:5273 in a browser is a much faster loop for working on layout
 * and themes than rebuilding the shell and relaunching Electron. Without this the page
 * dies on the first `window.takt` call and shows nothing at all.
 *
 * Playlists are kept in memory here, so creating and filling one behaves as it does in the
 * app. Audio does not: there is no takt:// scheme outside Electron, so nothing will play.
 */

const SAMPLE: TrackInfo[] = [
  { id: 'dev-1', path: 'C:\\Music\\Neu.flac', title: 'Hallogallo', artist: 'Neu!', album: 'Neu!', duration: 610 },
  { id: 'dev-2', path: 'C:\\Music\\Autobahn.flac', title: 'Autobahn', artist: 'Kraftwerk', album: 'Autobahn', duration: 1424 },
  { id: 'dev-3', path: 'C:\\Music\\Spiegel.flac', title: 'Spiegelbild', artist: 'Harmonia', album: 'Musik von Harmonia', duration: 287 },
  { id: 'dev-4', path: 'C:\\Music\\E2E4.flac', title: 'E2-E4', artist: 'Manuel Göttsching', album: 'E2-E4', duration: 3538 },
  { id: 'dev-5', path: 'C:\\Music\\Sonne.flac', title: 'Sonnenschein', artist: 'Cluster', album: 'Zuckerzeit', duration: 195 },
  { id: 'dev-6', path: 'C:\\Music\\Ruckzuck.flac', title: 'Ruckzuck', artist: 'Kraftwerk', album: 'Kraftwerk', duration: 462 },
];

export function installDevBridge() {
  /*
   * `window.takt` is declared non-optional, because in the real app it always is. Testing
   * for it with `'takt' in window` therefore narrows the *absent* branch to `never` and
   * nothing can be assigned. Going through an alias that admits it might be missing is what
   * makes the one place that has to check able to say so.
   */
  const host = window as Window & { takt?: TaktApi };
  if (!import.meta.env.DEV || host.takt) return;

  let maximized = false;
  let library: TrackInfo[] = [];
  let playlists: PlaylistInfo[] = [];

  const noop = () => () => {};
  const snapshot = async () => playlists.map((p) => ({ ...p, trackIds: [...p.trackIds] }));

  const find = (id: string) => playlists.find((p) => p.id === id);

  host.takt = {
    getVersion: async () => '0.0.0-dev',
    signalReady: () => {},

    minimize: () => {},
    toggleMaximize: () => { maximized = !maximized; },
    close: () => {},
    isMaximized: async () => maximized,
    onWindowState: noop,

    library: async () => library,
    pickFiles: async () => { library = SAMPLE; return SAMPLE; },
    pickFolder: async () => { library = SAMPLE; return SAMPLE; },
    addPaths: async () => { library = SAMPLE; return SAMPLE; },
    removeTracks: async (ids) => { library = library.filter((t) => !ids.includes(t.id)); return library; },
    notePlayed: () => {},
    reveal: async () => {},
    pathForFile: () => '',
    onScanProgress: noop,
    onOpenFiles: noop,

    playlists: snapshot,
    createPlaylist: async (name, trackIds) => {
      playlists = [...playlists, { id: `pl-${playlists.length + 1}`, name, trackIds: [...(trackIds ?? [])] }];
      return snapshot();
    },
    renamePlaylist: async (id, name) => {
      const list = find(id);
      if (list) list.name = name;
      return snapshot();
    },
    deletePlaylist: async (id) => { playlists = playlists.filter((p) => p.id !== id); return snapshot(); },
    addToPlaylist: async (id, trackIds) => {
      const list = find(id);
      if (list) list.trackIds = [...list.trackIds, ...trackIds.filter((t) => !list.trackIds.includes(t))];
      return snapshot();
    },
    removeFromPlaylist: async (id, trackIds) => {
      const list = find(id);
      if (list) list.trackIds = list.trackIds.filter((t) => !trackIds.includes(t));
      return snapshot();
    },
    reorderPlaylist: async (id, trackIds) => {
      const list = find(id);
      if (list) list.trackIds = [...trackIds];
      return snapshot();
    },
    pickPlaylistThumbnail: snapshot,
    clearPlaylistThumbnail: async (id) => {
      const list = find(id);
      if (list) delete list.thumbnail;
      return snapshot();
    },
    importPlaylist: async () => {
      library = SAMPLE;
      playlists = [...playlists, { id: `pl-${playlists.length + 1}`, name: 'Imported', trackIds: SAMPLE.map((t) => t.id) }];
      return { playlists: await snapshot(), tracks: SAMPLE };
    },
    exportPlaylist: async () => true,

    onUpdateReady: noop,
    installUpdate: () => {},
  };

  console.info('[takt] dev bridge installed — metadata is fake and nothing will play');
}
