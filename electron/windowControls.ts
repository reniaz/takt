import { app, BrowserWindow, ipcMain } from 'electron';

/**
 * The window is frameless, so minimise, maximise and close have to be driven from the
 * renderer's own titlebar.
 *
 * Every handler resolves the window from the sender rather than closing over one, so the
 * same channels work for the mini player without a second set of names.
 */
export function initWindowControls() {
  ipcMain.handle('takt:app-version', () => app.getVersion());

  // The end-to-end readiness signal: the protocol served the document, the bundle
  // executed, and React mounted. tools/check-app.mjs waits for this line.
  ipcMain.on('takt:renderer-ready', () => console.log('takt:ready'));

  ipcMain.on('takt:window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('takt:window-toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on('takt:window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('takt:window-is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  /*
   * Real fullscreen, not a maximised window.
   *
   * The visualizer is meant to be the only thing on screen; a maximised window still shows
   * the taskbar and, on a frameless window, leaves the drag region live at the top edge.
   */
  ipcMain.on('takt:set-fullscreen', (event, on: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(on);
  });
}

/**
 * Pushes maximise state to the renderer so the titlebar button can swap its glyph.
 *
 * Needed as an event rather than a query because the state also changes from outside the
 * app — Win+Up, Aero snap, double-clicking the drag region — and the renderer has no way
 * to learn about those on its own.
 */
export function trackMaximizeState(window: BrowserWindow) {
  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('takt:window-state', { isMaximized: window.isMaximized() });
    }
  };

  window.on('maximize', send);
  window.on('unmaximize', send);
  window.on('enter-full-screen', send);
  window.on('leave-full-screen', send);
}
