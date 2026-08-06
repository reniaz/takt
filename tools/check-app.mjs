#!/usr/bin/env node
/**
 * Launches the built main process and proves it actually booted.
 *
 *   npm run check:app
 *
 * This exists because of a failure mode that is easy to ship and impossible to notice in
 * development: a bare `require` surviving into the bundle. The packaged app carries no
 * node_modules, so the call throws — and if it throws at import time, Electron shows a
 * JavaScript error dialog and the process *stays alive holding it open*. "Still running"
 * is therefore not evidence of anything.
 *
 * The only honest check is whether the app reached the point of doing its job, so this
 * waits for `takt:ready`, which main.ts prints from `did-finish-load`. Not from
 * `ready-to-show`: a window appears whether or not the renderer loaded, so keying on the
 * window would pass with a completely broken protocol handler.
 *
 * Both runs set TAKT_FORCE_PROD_RENDERER, so the app serves `build/` over takt:// exactly
 * as a packaged one does. Without it an unpackaged run points at the Vite dev server, and
 * the custom protocol — the thing most likely to break in a packaged build, and the thing
 * carrying the byte-range logic audio seeking depends on — would never be exercised until
 * someone installed the release.
 *
 * It runs twice because the startup splash only opens in a packaged app, so a plain run
 * never exercises the window that briefly exists alone at launch — and closing that window
 * before the main one exists fires `window-all-closed` and quits mid-launch, with status 0
 * and no error. TAKT_FORCE_SPLASH opens it regardless, so that ordering is tested here
 * rather than by whoever installs the release.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TIMEOUT_MS = 45_000;
const SETTLE_MS = 4000;
const ENTRY = 'electron/dist/main.cjs';
const READY = 'takt:ready';

/**
 * The phrases a bundling mistake prints before the dialog appears, plus the renderer's
 * own load failure — a protocol handler that 404s leaves an empty window and would
 * otherwise look like a slow start rather than a broken build.
 */
const FATAL = /Dynamic require of|Uncaught Exception|Cannot find module|MODULE_NOT_FOUND|takt:load-failed/;

if (!existsSync(ENTRY)) {
  console.error(`\n  ${ENTRY} not found — run \`npm run build:shell\` first.\n`);
  process.exit(1);
}

if (!existsSync('build/index.html')) {
  console.error('\n  No renderer build — run `npm run build:renderer` first.\n');
  process.exit(1);
}

function fail(label, reason, output) {
  console.error(`\n  FAIL (${label}): ${reason}\n`);
  const trimmed = output.trim().split('\n').slice(0, 20).map((l) => `    ${l}`).join('\n');
  if (trimmed) console.error(`${trimmed}\n`);
  process.exit(1);
}

async function boot(label, extraEnv) {
  /*
   * Electron's single-instance lock is keyed on the user data directory, so each run gets
   * its own. Sharing one means the second app quits the moment it starts — which looks
   * exactly like a failure to boot, and would also make this check unrunnable whenever
   * Takt happens to be open.
   */
  const userData = mkdtempSync(join(tmpdir(), 'takt-check-'));

  console.log(`Launching the built app (${label})...`);

  const child = spawn('npx', ['electron', ENTRY, `--user-data-dir=${userData}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });

  let output = '';
  let ready = false;

  const collect = (data) => {
    output += data;
    if (output.includes(READY)) ready = true;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline && !ready) {
    if (child.exitCode !== null) break;
    await new Promise((r) => { setTimeout(r, 250); });
  }

  /*
   * Reaching ready is necessary but not sufficient: the splash-ordering bug quits the app
   * *after* the window has shown. Wait, then confirm it is still alive.
   */
  let quitEarly = false;
  if (ready) {
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });
    quitEarly = child.exitCode !== null;
  }

  /*
   * `shell: true` means the child is cmd.exe, and killing that leaves Electron running —
   * still holding its lock. The whole tree has to go.
   */
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }

  await new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    setTimeout(resolve, 5000);
  });

  try { rmSync(userData, { recursive: true, force: true }); } catch { /* best effort */ }

  const fatal = FATAL.exec(output);
  if (fatal) fail(label, `fatal error in the bundle: ${fatal[0]}`, output);
  if (!ready) fail(label, `the app never printed "${READY}".`, output);
  if (quitEarly) {
    fail(label, 'the app started, then quit on its own. A window closing before the main window exists will do this.', output);
  }

  console.log(`  OK (${label}): main process booted and showed its window.`);
}

await boot('takt:// protocol', { TAKT_FORCE_PROD_RENDERER: '1' });
await boot('launch splash', { TAKT_FORCE_PROD_RENDERER: '1', TAKT_FORCE_SPLASH: '1' });

console.log('');
