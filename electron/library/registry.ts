import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Maps stable ids to absolute file paths, so the renderer can name a track without ever
 * handling a path.
 *
 * The id is a hash of the resolved path, which makes it deterministic: the same file gets
 * the same id across restarts, so a persisted queue still resolves after a relaunch. A
 * counter would not survive that, and a raw path would put the filesystem in the URL.
 *
 * This is the whole of track storage until the SQLite library lands; `db.ts` will take
 * over as the resolver and this stays as the in-memory index in front of it.
 */

const paths = new Map<string, string>();

export function idFor(path: string) {
  return createHash('sha1').update(resolve(path)).digest('hex').slice(0, 16);
}

export function register(path: string) {
  const full = resolve(path);
  const id = idFor(full);
  paths.set(id, full);
  return id;
}

export function registerAll(list: readonly string[]) {
  return list.map(register);
}

export function pathFor(id: string) {
  return paths.get(id);
}

export function clear() {
  paths.clear();
}
