import { contextBridge, ipcRenderer } from 'electron';

import type { IpcRendererEvent } from 'electron';

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

  /* Files */
  pickFiles: (): Promise<TrackInfo[]> => ipcRenderer.invoke('takt:pick-files'),
  pickFolder: (): Promise<TrackInfo[]> => ipcRenderer.invoke('takt:pick-folder'),
  /** Files handed to the app by Explorer — double-click, "Open with", or drag onto the exe. */
  onOpenFiles: (listener: (tracks: TrackInfo[]) => void) => on('takt:open-files', listener),

  /* Updates */
  onUpdateReady: (listener: () => void) => on('takt:update-ready', listener),
  installUpdate: () => ipcRenderer.send('takt:install-update'),
} as const;

export type TrackInfo = {
  id: string;
  path: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  artwork?: string;
};

export type TaktApi = typeof api;

contextBridge.exposeInMainWorld('takt', api);
