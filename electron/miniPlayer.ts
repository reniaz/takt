import { existsSync } from 'node:fs';

import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';

import type { NativeImage } from 'electron';

/**
 * The mini player, the tray icon and the taskbar thumbnail buttons.
 *
 * All three are views onto the main window's player, never a second one. The mini window
 * loads the same bundle at `#/mini`, but its audio engine is never started: it sends
 * commands and renders what it is told. Two windows each holding their own `<audio>` would
 * play the same track twice, slightly out of step.
 *
 * So the flow is always: a control anywhere -> main -> the main window -> state back out
 * to everything that displays it.
 */

export type PlayerState = {
  title: string;
  artist: string;
  album: string;
  /** `takt://art/...`, or empty. The mini window can load it; the tray cannot. */
  artwork: string;
  isPlaying: boolean;
  canPlay: boolean;
  position: number;
  duration: number;
};

export type PlayerCommand = 'toggle' | 'next' | 'previous' | 'stop';

const EMPTY: PlayerState = {
  title: 'Nothing playing',
  artist: '',
  album: '',
  artwork: '',
  isPlaying: false,
  canPlay: false,
  position: 0,
  duration: 0,
};

let mini: BrowserWindow | undefined;
let tray: Tray | undefined;
let state: PlayerState = EMPTY;

/** Where the mini window loads from — the same bundle as the main window, a different route. */
let appUrl = '';
let iconPath = '';
let assetsDir = '';
let preloadPath = '';

function thumbarIcon(name: string): NativeImage {
  const file = `${assetsDir}/${name}.png`;
  return existsSync(file) ? nativeImage.createFromPath(file) : nativeImage.createEmpty();
}

/**
 * The Windows taskbar thumbnail buttons.
 *
 * Rebuilt on every state change because there is no way to update one button — the whole
 * set is replaced, which is also how the play/pause glyph gets swapped.
 */
function updateThumbar(main: BrowserWindow, send: (command: PlayerCommand) => void) {
  if (process.platform !== 'win32' || main.isDestroyed()) return;

  // An empty set removes the buttons, which is right when there is nothing to control.
  if (!state.canPlay) {
    main.setThumbarButtons([]);
    return;
  }

  main.setThumbarButtons([
    { tooltip: 'Previous', icon: thumbarIcon('thumb-previous'), click: () => send('previous') },
    {
      tooltip: state.isPlaying ? 'Pause' : 'Play',
      icon: thumbarIcon(state.isPlaying ? 'thumb-pause' : 'thumb-play'),
      click: () => send('toggle'),
    },
    { tooltip: 'Next', icon: thumbarIcon('thumb-next'), click: () => send('next') },
  ]);
}

function trayTooltip() {
  if (!state.canPlay) return 'Takt';
  return state.artist ? `${state.title}\n${state.artist}` : state.title;
}

function updateTray(main: BrowserWindow, send: (command: PlayerCommand) => void) {
  if (!tray || tray.isDestroyed()) return;

  tray.setToolTip(trayTooltip());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: state.canPlay ? state.title : 'Nothing playing', enabled: false },
    ...(state.artist ? [{ label: state.artist, enabled: false }] : []),
    { type: 'separator' },
    { label: state.isPlaying ? 'Pause' : 'Play', enabled: state.canPlay, click: () => send('toggle') },
    { label: 'Next', enabled: state.canPlay, click: () => send('next') },
    { label: 'Previous', enabled: state.canPlay, click: () => send('previous') },
    { type: 'separator' },
    { label: mini ? 'Close mini player' : 'Mini player', click: () => toggleMini() },
    { label: 'Show Takt', click: () => { main.show(); main.focus(); } },
    { type: 'separator' },
    // `app.quit()` rather than closing the window: the tray is the one place where
    // "quit" has to actually mean it.
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createMini() {
  const window = new BrowserWindow({
    width: 340,
    height: 116,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    // It is a companion to the main window, not a second entry in the switcher.
    skipTaskbar: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: 'Takt',
    icon: existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#262726',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  void window.loadURL(`${appUrl}#/mini`);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { mini = undefined; });

  return window;
}

export function toggleMini() {
  if (mini && !mini.isDestroyed()) {
    mini.close();
    mini = undefined;
    return false;
  }

  mini = createMini();
  return true;
}

export function initMiniPlayer(options: {
  getWindow: () => BrowserWindow | undefined;
  url: string;
  icon: string;
  assets: string;
  preload: string;
}) {
  appUrl = options.url;
  iconPath = options.icon;
  assetsDir = options.assets;
  preloadPath = options.preload;

  const send = (command: PlayerCommand) => {
    const main = options.getWindow();
    if (main && !main.isDestroyed()) main.webContents.send('takt:player-command', command);
  };

  /* The main window is the only writer of state. */
  ipcMain.on('takt:player-state', (_event, next: PlayerState) => {
    state = next;

    if (mini && !mini.isDestroyed()) mini.webContents.send('takt:player-state', state);

    const main = options.getWindow();
    if (!main || main.isDestroyed()) return;

    updateTray(main, send);
    updateThumbar(main, send);
  });

  /* Anything that is not the main window asks for changes rather than making them. */
  ipcMain.on('takt:player-command', (_event, command: PlayerCommand) => send(command));

  ipcMain.handle('takt:mini-toggle', () => toggleMini());
  ipcMain.on('takt:mini-close', () => {
    if (mini && !mini.isDestroyed()) mini.close();
  });

  ipcMain.on('takt:show-main', () => {
    const main = options.getWindow();
    if (!main || main.isDestroyed()) return;
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  });

  /* A newly opened mini window has missed every update so far. */
  ipcMain.handle('takt:player-state-now', () => state);

  const main = options.getWindow();
  if (main) {
    tray = new Tray(existsSync(iconPath) ? iconPath : nativeImage.createEmpty());
    tray.setToolTip('Takt');
    // Double-click is the long-standing way back to a window from the tray.
    tray.on('double-click', () => { main.show(); main.focus(); });
    updateTray(main, send);
  }

  app.on('before-quit', () => {
    tray?.destroy();
    tray = undefined;
  });
}
