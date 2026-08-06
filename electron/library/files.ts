import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { app } from 'electron';

import { register } from './registry';

import type { TrackInfo } from '../preload';

/** What Chromium can decode without a bundled ffmpeg. */
export const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.wav'];

export function isAudio(path: string) {
  return AUDIO_EXTENSIONS.includes(extname(path).toLowerCase());
}

function artworkDir() {
  return join(app.getPath('userData'), 'artwork');
}

/**
 * Writes embedded cover art out once per distinct image.
 *
 * Keyed by a hash of the picture bytes, not by album or by track: a 50-track album
 * embeds the same JPEG 50 times, and hashing the content collapses those to one file on
 * disk while still handling the case where two albums happen to share a cover.
 */
async function saveArtwork(data: Uint8Array, format: string) {
  const hash = createHash('sha1').update(data).digest('hex');
  const ext = format.includes('png') ? '.png' : format.includes('webp') ? '.webp' : '.jpg';
  const file = join(artworkDir(), `${hash}${ext}`);

  if (!existsSync(file)) {
    await mkdir(artworkDir(), { recursive: true });
    await writeFile(file, data);
  }

  return `${hash}${ext}`;
}

/**
 * Reads tags for one file.
 *
 * Never throws: a corrupt or half-written file should appear in the list under its
 * filename rather than take down the whole import. `duration: true` costs a full parse on
 * formats without a duration in the header (notably VBR MP3 without a Xing frame), which
 * is worth it — a missing duration breaks the seek bar.
 */
export async function readTrack(path: string): Promise<TrackInfo> {
  const id = register(path);
  const fallback = basename(path, extname(path));

  try {
    const { parseFile } = await import('music-metadata');
    const { common, format } = await parseFile(path, { duration: true });

    const picture = common.picture?.[0];
    const artwork = picture
      ? await saveArtwork(picture.data, picture.format)
      : undefined;

    return {
      id,
      path,
      title: common.title?.trim() || fallback,
      ...(common.artist ? { artist: common.artist } : undefined),
      ...(common.album ? { album: common.album } : undefined),
      ...(format.duration ? { duration: format.duration } : undefined),
      ...(artwork ? { artwork } : undefined),
    };
  } catch {
    return { id, path, title: fallback };
  }
}

export async function readTracks(paths: readonly string[]) {
  const tracks: TrackInfo[] = [];
  for (const path of paths) tracks.push(await readTrack(path));
  return tracks;
}

/** Walks a folder for playable files. Symlinks are not followed, to avoid cycles. */
export async function walk(dir: string, depth = 8): Promise<string[]> {
  if (depth < 0) return [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full, depth - 1));
    else if (entry.isFile() && isAudio(full)) found.push(full);
  }

  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
