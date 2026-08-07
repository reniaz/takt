import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { trackPath } from './db';

/**
 * Track ids.
 *
 * A hash of the resolved path, so it is deterministic: the same file gets the same id
 * across restarts, which is what lets a saved playlist or queue still resolve after a
 * relaunch. A counter would not survive that, and a raw path would put the filesystem into
 * every URL the renderer handles.
 *
 * Truncated to 16 hex characters. Collisions need roughly 2^32 distinct paths before they
 * become likely, which is several orders of magnitude past any music library.
 */
export function idFor(path: string) {
  return createHash('sha1').update(resolve(path)).digest('hex').slice(0, 16);
}

/*
 * Paths are looked up in SQLite, with a small cache in front.
 *
 * `takt://media/<id>` is hit for every seek, and Chromium issues a range request per seek,
 * so this is the hottest path in the app. Caching keeps that off the database without
 * making the database less than the source of truth.
 */
const cache = new Map<string, string>();

export function pathFor(id: string) {
  const cached = cache.get(id);
  if (cached) return cached;

  const path = trackPath(id);
  if (path) cache.set(id, path);

  return path;
}

export function forget(ids: readonly string[]) {
  for (const id of ids) cache.delete(id);
}
