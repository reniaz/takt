import type { TaktApi, TrackInfo } from '../electron/preload';

/**
 * A stand-in for the preload bridge, installed only in `vite dev` and only when the real
 * one is absent.
 *
 * Opening http://localhost:5273 in a browser is much the faster loop for working on
 * layout and themes than rebuilding the shell and relaunching Electron. Without this the
 * page dies on the first `window.takt` call and shows nothing at all.
 *
 * It fakes metadata but not audio: there is no takt:// scheme outside Electron, so tracks
 * added here will not play. Anything about playback has to be checked in the real app.
 */

const SAMPLE: TrackInfo[] = [
  { id: 'dev-1', path: 'C:\\Music\\Neu.flac', title: 'Hallogallo', artist: 'Neu!', album: 'Neu!', duration: 610 },
  { id: 'dev-2', path: 'C:\\Music\\Autobahn.flac', title: 'Autobahn', artist: 'Kraftwerk', album: 'Autobahn', duration: 1424 },
  { id: 'dev-3', path: 'C:\\Music\\Spiegel.flac', title: 'Spiegelbild', artist: 'Harmonia', album: 'Musik von Harmonia', duration: 287 },
  { id: 'dev-4', path: 'C:\\Music\\E2E4.flac', title: 'E2-E4', artist: 'Manuel Göttsching', album: 'E2-E4', duration: 3538 },
  { id: 'dev-5', path: 'C:\\Music\\Sonne.flac', title: 'Sonnenschein', artist: 'Cluster', album: 'Zuckerzeit', duration: 195 },
];

export function installDevBridge() {
  /*
   * `window.takt` is declared non-optional, because in the real app it always is. Testing
   * for it with `'takt' in window` therefore narrows the *absent* branch to `never` and
   * nothing can be assigned. Going through an alias that admits it might be missing is
   * what makes the one place that has to check able to say so.
   */
  const host = window as Window & { takt?: TaktApi };
  if (!import.meta.env.DEV || host.takt) return;

  let maximized = false;
  const noop = () => () => {};

  host.takt = {
    getVersion: async () => '0.0.0-dev',
    signalReady: () => {},
    minimize: () => {},
    toggleMaximize: () => { maximized = !maximized; },
    close: () => {},
    isMaximized: async () => maximized,
    onWindowState: noop,
    pickFiles: async () => SAMPLE,
    pickFolder: async () => SAMPLE,
    onOpenFiles: noop,
    onUpdateReady: noop,
    installUpdate: () => {},
  };

  console.info('[takt] dev bridge installed — metadata is fake and nothing will play');
}
