import { existsSync, readFileSync } from 'node:fs';

import { BrowserWindow } from 'electron';

/**
 * Startup splash, shown while checking for and installing updates.
 *
 * Rendered from a data URL rather than a packaged file so it cannot fail to load — this
 * window's whole job is to be reliable when the app itself has not started yet.
 */
function buildHtml(pngPath: string) {
  let icon = '';
  // A PNG specifically: the data URL declares its type, and an .ico labelled image/png
  // only renders because Chromium sniffs past the lie.
  if (existsSync(pngPath) && pngPath.endsWith('.png')) {
    icon = `<img src="data:image/png;base64,${readFileSync(pngPath).toString('base64')}" alt="">`;
  }

  return `<!doctype html>
<meta charset="utf-8">
<title>Takt</title>
<style>
  :root { color-scheme: dark; }
  body {
    display: flex; align-items: center; gap: 18px;
    margin: 0; padding: 24px;
    font: 14px/1.4 "Segoe UI", system-ui, sans-serif;
    color: #c6b4a6; background: #262726;
    -webkit-app-region: drag; user-select: none;
  }
  img { width: 56px; height: 56px; flex-shrink: 0; }
  .body { flex: 1; min-width: 0; }
  .title { margin-bottom: 2px; font-size: 15px; font-weight: 500; color: #e4d8cd; }
  .status { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #808278; }
  .track {
    height: 4px; margin-top: 12px; overflow: hidden;
    background: #434844; border-radius: 2px;
    opacity: 0; transition: opacity 150ms;
  }
  .track.on { opacity: 1; }
  .bar {
    width: 0%; height: 100%;
    background: #e0a33e; border-radius: 2px;
    transition: width 200ms ease-out;
  }
</style>
<body>
  ${icon}
  <div class="body">
    <div class="title">Takt</div>
    <div class="status" id="status">Checking for updates…</div>
    <div class="track" id="track"><div class="bar" id="bar"></div></div>
  </div>
</body>`;
}

export type Splash = {
  setStatus: (text: string) => void;
  setProgress: (percent: number) => void;
  close: () => void;
};

export function showSplash(pngPath: string, windowIcon: string): Splash {
  const win = new BrowserWindow({
    width: 380,
    height: 132,
    // The window is frameless, so this is what the taskbar and Alt-Tab show. Without it
    // the first thing a user sees of Takt is an Electron icon labelled with a data URL.
    title: 'Takt',
    icon: existsSync(windowIcon) ? windowIcon : undefined,
    frame: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#262726',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(pngPath))}`);
  win.once('ready-to-show', () => win.show());

  const run = (script: string) => {
    if (!win.isDestroyed()) void win.webContents.executeJavaScript(script).catch(() => {});
  };

  return {
    setStatus(text) {
      run(`document.getElementById('status').textContent = ${JSON.stringify(text)}`);
    },
    setProgress(percent) {
      run(
        `document.getElementById('track').classList.add('on');`
        + `document.getElementById('bar').style.width = '${Math.max(0, Math.min(100, percent))}%'`,
      );
    },
    close() {
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
