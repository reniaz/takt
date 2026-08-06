import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { isAudio, readTracks, walk } from './library/files';
import { pathFor } from './library/registry';
import { APP_ORIGIN, registerHandlers, registerScheme, setTrackResolver } from './protocol';
import { closeStartupSplash, runStartupUpdate } from './startupUpdate';
import { initUpdater } from './updater';
import { initWindowControls, trackMaximizeState } from './windowControls';

const DIR_NAME = __dirname;

/*
 * Two levels up, not one.
 *
 * The bundle lives at `<root>/electron/dist/main.cjs`, so `__dirname` is
 * `<root>/electron/dist` — one `dirname` only reaches `<root>/electron`, which is where
 * the renderer is *not*. The same shape holds when packaged, where the root is the asar:
 * `app.asar/electron/dist` -> `app.asar`.
 *
 * Getting this wrong produces a window that opens and says "Not found", because the
 * protocol handler is looking for `build/` inside `electron/`.
 */
const ROOT = dirname(dirname(DIR_NAME));
const ASSETS = join(ROOT, 'electron', 'assets');

/** The window and taskbar icon. Windows wants the multi-size .ico here. */
const ICON = join(ASSETS, 'icon-takt.ico');

/*
 * The splash inlines its icon as a data URL, which needs a real PNG.
 *
 * Draht hands the same `.ico` to both and labels it `image/png`; Chromium usually sniffs
 * past that, but it is a broken image waiting to happen and there is a correct file right
 * here.
 */
const SPLASH_ICON = join(ASSETS, 'icon-takt-512.png');
const RENDERER_ROOT = join(ROOT, 'build');

/** Vite's dev server. Only consulted when the app is not packaged. */
const DEV_URL = 'http://localhost:5273';

let mainWindow: BrowserWindow | undefined;

/*
 * Must happen before `app.ready`, and before anything else touches `protocol`.
 */
registerScheme();

/*
 * A second launch — from the Start menu, or by double-clicking an .mp3 — hands its
 * arguments to the running copy instead of starting a rival instance with its own
 * database handle.
 */
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) {
  app.quit();
}

function audioArgs(argv: readonly string[]) {
  return argv.slice(1).filter((arg) => !arg.startsWith('--') && isAudio(arg) && existsSync(arg));
}

async function sendOpenFiles(paths: readonly string[]) {
  if (!paths.length || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('takt:open-files', await readTracks(paths));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    show: false,
    // Frameless: the titlebar is part of the theme, so a Gruvbox Takt is Gruvbox all the
    // way to the top edge. `resizable` stays true or Windows Snap and drag-to-maximize
    // stop working.
    frame: false,
    // Paints before the renderer has loaded, so launching does not flash white. Matches
    // the caelus background, which is the default theme.
    backgroundColor: '#262726',
    icon: existsSync(ICON) ? ICON : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(DIR_NAME, 'preload.cjs'),
    },
  });

  trackMaximizeState(window);

  window.once('ready-to-show', () => {
    window.show();
    // Closed only once the main window is up. Closing it earlier would leave Electron
    // with zero windows, which fires `window-all-closed` and quits mid-launch.
    closeStartupSplash();
  });

  /*
   * Load failures worth seeing, but not the readiness signal.
   *
   * `did-finish-load` is not evidence the app started: a protocol handler that 404s still
   * finishes loading, because Chromium renders the error body as a perfectly good
   * document. And `did-fail-load` does not fire for HTTP status codes at all — only for
   * network-level failures. A check keyed on either passes with a completely broken
   * build, which is worse than no check.
   *
   * `takt:ready` is therefore sent by the renderer, from React's own mount effect. See
   * `signalReady` in preload.ts.
   */
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`takt:load-failed ${code} ${description} ${url}`);
  });

  /*
   * Nothing navigates away from the app, and nothing opens a window inside it. Links go
   * to the system browser instead, where they are the OS's problem rather than a page
   * with access to the preload bridge.
   */
  const external = (url: string) => {
    if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url);
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN) && !url.startsWith(DEV_URL)) {
      event.preventDefault();
      external(url);
    }
  });

  window.on('closed', () => {
    mainWindow = undefined;
  });

  /*
   * TAKT_FORCE_PROD_RENDERER makes an unpackaged run serve from `build/` over takt://,
   * exactly as a packaged one does. That is what lets the smoke test exercise the custom
   * protocol — including Range — before anything has been packaged, rather than only
   * finding out on an installed copy.
   */
  const useBundle = app.isPackaged || Boolean(process.env.TAKT_FORCE_PROD_RENDERER);
  void window.loadURL(useBundle ? `${APP_ORIGIN}/index.html` : DEV_URL);

  return window;
}

function initFilePicking() {
  ipcMain.handle('takt:pick-files', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add music',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav'] }],
    });

    return result.canceled ? [] : readTracks(result.filePaths);
  });

  ipcMain.handle('takt:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add a music folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) return [];
    return readTracks(await walk(result.filePaths[0]));
  });
}

app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  void sendOpenFiles(audioArgs(argv));
});

app.on('window-all-closed', () => {
  app.quit();
});

if (isPrimary) {
  void app.whenReady().then(async () => {
    setTrackResolver(pathFor);
    registerHandlers(RENDERER_ROOT);

    // Runs behind the splash, before there is a main window. Returns true when an install
    // is starting, in which case the app is about to be replaced and must not open a
    // window it would only tear straight back down.
    if (await runStartupUpdate(SPLASH_ICON, ICON)) return;

    initWindowControls();
    initFilePicking();

    mainWindow = createWindow();
    initUpdater(() => mainWindow);

    // Files this launch was started with, once the renderer exists to receive them.
    const pending = audioArgs(process.argv);
    if (pending.length) {
      mainWindow.webContents.once('did-finish-load', () => void sendOpenFiles(pending));
    }
  });
}
