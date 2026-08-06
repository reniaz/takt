import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

import type { BrowserWindow } from 'electron';

/**
 * The in-session update watcher.
 *
 * Deliberately never downloads. `startupUpdate.ts` does the fetching, at launch, where
 * "newest right now" is always the answer. All this does is notice that a release exists
 * and offer to restart — the restart is what triggers the real download.
 *
 * That split is why "Restart now" here is literally just a relaunch, with no staged
 * installer to hand over to.
 */

const CHECK_INTERVAL = 10 * 60 * 1000;

let announced: string | undefined;
let timer: NodeJS.Timeout | undefined;

export function initUpdater(getWindow: () => BrowserWindow | undefined) {
  // Unpackaged runs have no app-update.yml, and checking throws.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('error', (err) => {
    // Being offline, or rate-limited by GitHub, is normal and must stay silent.
    console.error('[updater]', err instanceof Error ? err.message : err);
  });

  autoUpdater.on('update-available', (info) => {
    // Announced once per version, so a ten-minute timer does not become a ten-minute
    // nag for someone who has already decided to restart later.
    if (info.version === announced || info.version === app.getVersion()) return;
    announced = info.version;

    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('takt:update-ready', {});
  });

  ipcMain.on('takt:install-update', () => {
    app.relaunch();
    app.quit();
  });

  const check = () => { autoUpdater.checkForUpdates().catch(() => {}); };

  check();
  timer = setInterval(check, CHECK_INTERVAL);
  app.on('before-quit', () => { if (timer) clearInterval(timer); });
}
