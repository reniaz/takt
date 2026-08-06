import type { TaktApi } from '../../electron/preload';

declare global {
  interface Window {
    /**
     * The preload bridge. Always present — the renderer only ever runs inside Electron,
     * so there is no `?` here and no guard at every call site.
     */
    takt: TaktApi;
  }
}

export {};
