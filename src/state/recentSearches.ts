/**
 * What you picked out of search, most recent first.
 *
 * References, not copies. A track's title, a playlist's name and an album's cover all
 * change; storing a snapshot would show the old one forever, and storing it for something
 * since deleted would offer a row that goes nowhere. Resolving against the live library at
 * render time means the list is always describing things that still exist.
 *
 * Queries themselves are deliberately not kept. "sprite" is not what you were looking for;
 * the track called Sprite is, and offering the word back means typing it again.
 */

const KEY = 'takt-recent-picks';
const LIMIT = 10;

export type RecentPick =
  | { kind: 'track'; id: string }
  | { kind: 'album'; key: string }
  | { kind: 'artist'; name: string }
  | { kind: 'playlist'; id: string };

export function samePick(a: RecentPick, b: RecentPick) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'track' && b.kind === 'track') return a.id === b.id;
  if (a.kind === 'album' && b.kind === 'album') return a.key === b.key;
  if (a.kind === 'artist' && b.kind === 'artist') return a.name === b.name;
  if (a.kind === 'playlist' && b.kind === 'playlist') return a.id === b.id;
  return false;
}

export function loadPicks(): RecentPick[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    // Filtered rather than trusted: an older build may have written a shape this one does
    // not understand, and one bad entry should not cost the whole list.
    return parsed.filter((entry): entry is RecentPick => {
      if (!entry || typeof entry !== 'object') return false;
      const e = entry as RecentPick;
      switch (e.kind) {
        case 'track': return typeof e.id === 'string';
        case 'album': return typeof e.key === 'string';
        case 'artist': return typeof e.name === 'string';
        case 'playlist': return typeof e.id === 'string';
        default: return false;
      }
    }).slice(0, LIMIT);
  } catch {
    return [];
  }
}

function write(picks: RecentPick[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    /* storage full or blocked; a history is not worth interrupting anything over */
  }
}

/** Moves an existing entry to the front rather than adding a second copy of it. */
export function addPick(picks: readonly RecentPick[], pick: RecentPick) {
  const next = [pick, ...picks.filter((p) => !samePick(p, pick))].slice(0, LIMIT);
  write(next);
  return next;
}

export function removePick(picks: readonly RecentPick[], pick: RecentPick) {
  const next = picks.filter((p) => !samePick(p, pick));
  write(next);
  return next;
}

export function clearPicks() {
  write([]);
  return [];
}
