#!/usr/bin/env node
/**
 * Clears out the build output that has already been published.
 *
 *   npm run clean
 *
 * electron-builder leaves an unpacked tree beside the installer, and every release adds
 * another installer next to the last. Once the artefacts are on GitHub the local copies
 * are just disk — the installer for the current version is kept so it can be tested
 * without rebuilding.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RELEASE_DIR = 'release';

export function cleanRelease(keepVersion) {
  if (!existsSync(RELEASE_DIR)) return;

  let freed = 0;
  const removed = [];

  for (const entry of readdirSync(RELEASE_DIR)) {
    const full = join(RELEASE_DIR, entry);
    const stat = statSync(full);

    const isUnpacked = stat.isDirectory()
      && (entry.endsWith('-unpacked') || entry === 'mac' || entry === 'linux-unpacked');

    // Installers and their blockmaps, for any version other than the one being kept.
    const match = /^Takt-Setup-(.+?)\.exe(\.blockmap)?$/.exec(entry);
    const isOldInstaller = Boolean(match) && match[1] !== keepVersion;

    if (!isUnpacked && !isOldInstaller) continue;

    freed += stat.isDirectory() ? dirSize(full) : stat.size;
    rmSync(full, { recursive: true, force: true });
    removed.push(entry);
  }

  if (removed.length) {
    console.log(`  Cleaned ${removed.length} item(s), ${(freed / 1024 / 1024).toFixed(0)} MB:`);
    for (const entry of removed) console.log(`    ${entry}`);
  }
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

// Run directly: keep whatever package.json currently says.
if (process.argv[1]?.endsWith('clean-release.mjs')) {
  const { readFileSync } = await import('node:fs');
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  cleanRelease(version);
}
