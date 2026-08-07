import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { app } from 'electron';

import { isCurrent, upsertTracks, type TrackRow } from './db';
import { idFor } from './registry';

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
 * Keyed by a hash of the picture bytes, not by album or by track: a 50-track album embeds
 * the same JPEG 50 times, and hashing the content collapses those to one file on disk
 * while still handling two albums that happen to share a cover.
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

/** ReplayGain arrives as `{ dB: number }`, a bare number, or a "-7.2 dB" string. */
function gainToDb(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'dB' in value) {
    const db = (value as { dB: unknown }).dB;
    return typeof db === 'number' ? db : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/*
 * What reading a file's tags can tell you.
 *
 * `favourite` is excluded along with the play statistics: none of them come from the file,
 * and all of them must survive a rescan. The upsert leaves these columns alone for the
 * same reason — retagging an album should not empty the Favourites list.
 */
type ParsedTrack = Omit<TrackRow, 'addedAt' | 'playCount' | 'lastPlayedAt' | 'favourite'>;

/**
 * Reads tags for one file.
 *
 * Never throws: a corrupt or half-written file should appear under its filename rather than
 * take down the whole import. `duration: true` costs a full parse on formats without a
 * duration in the header (notably VBR MP3 without a Xing frame), which is worth it — a
 * missing duration breaks the seek bar.
 */
async function parse(path: string): Promise<ParsedTrack> {
  const stat = statSync(path);
  const base = {
    id: idFor(path),
    path,
    mtime: Math.floor(stat.mtimeMs),
    size: stat.size,
  };

  const fallback = basename(path, extname(path));

  try {
    const { parseFile } = await import('music-metadata');
    const { common, format } = await parseFile(path, { duration: true });

    const picture = common.picture?.[0];

    return {
      ...base,
      title: common.title?.trim() || fallback,
      artist: common.artist ?? null,
      albumArtist: common.albumartist ?? null,
      album: common.album ?? null,
      year: common.year ?? null,
      trackNo: common.track?.no ?? null,
      discNo: common.disk?.no ?? null,
      genre: common.genre?.[0] ?? null,
      duration: format.duration ?? null,
      codec: format.codec ?? null,
      artwork: picture ? await saveArtwork(picture.data, picture.format) : null,
      rgTrack: gainToDb(common.replaygain_track_gain),
      rgAlbum: gainToDb(common.replaygain_album_gain),
    };
  } catch {
    return {
      ...base,
      title: fallback,
      artist: null,
      albumArtist: null,
      album: null,
      year: null,
      trackNo: null,
      discNo: null,
      genre: null,
      duration: null,
      codec: null,
      artwork: null,
      rgTrack: null,
      rgAlbum: null,
    };
  }
}

export function toTrackInfo(row: TrackRow): TrackInfo {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    ...(row.artist ? { artist: row.artist } : undefined),
    ...(row.albumArtist ? { albumArtist: row.albumArtist } : undefined),
    ...(row.album ? { album: row.album } : undefined),
    ...(row.year ? { year: row.year } : undefined),
    ...(row.trackNo ? { trackNo: row.trackNo } : undefined),
    ...(row.discNo ? { discNo: row.discNo } : undefined),
    ...(row.genre ? { genre: row.genre } : undefined),
    ...(row.duration ? { duration: row.duration } : undefined),
    ...(row.artwork ? { artwork: row.artwork } : undefined),
    // Zero is a real gain, and zero plays is a real count, so these are tested against
    // null rather than for truthiness.
    ...(row.rgTrack !== null ? { rgTrack: row.rgTrack } : undefined),
    ...(row.rgAlbum !== null ? { rgAlbum: row.rgAlbum } : undefined),
    addedAt: row.addedAt,
    playCount: row.playCount,
    ...(row.lastPlayedAt !== null ? { lastPlayedAt: row.lastPlayedAt } : undefined),
    favourite: row.favourite === 1,
  };
}

/**
 * Parses and indexes a set of files.
 *
 * Files whose size and mtime are unchanged since the last scan are not re-parsed — tag
 * reading is the whole cost of an import, and re-reading an unchanged 5,000-file library
 * on every launch would make startup unusable. They are still returned, from the database.
 */
export async function importPaths(
  paths: readonly string[],
  onProgress?: (done: number, total: number) => void,
) {
  const parsed: ParsedTrack[] = [];
  const unchanged: string[] = [];

  for (const [index, path] of paths.entries()) {
    const id = idFor(path);

    let skip = false;
    try {
      const stat = statSync(path);
      skip = isCurrent(id, Math.floor(stat.mtimeMs), stat.size);
    } catch {
      continue; // Vanished between listing and reading.
    }

    if (skip) unchanged.push(id);
    else parsed.push(await parse(path));

    onProgress?.(index + 1, paths.length);
  }

  if (parsed.length) upsertTracks(parsed);

  return { changed: parsed.length, unchanged: unchanged.length };
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
