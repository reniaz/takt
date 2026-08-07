import { create } from 'zustand';

import { onTrackStarted, usePlayer } from './player';

import type { Sort, SortKey } from './browse';
import type { PlaylistInfo, TrackInfo } from '../../electron/preload';

/*
 * Sort order is kept apart from the audio settings blob.
 *
 * It belongs to how the library is being looked at, not to how anything sounds, and
 * threading one more UI preference through the player store's persistence would put it
 * where nobody would look for it.
 */
const SORT_KEY = 'takt-sort';
const DEFAULT_SORT: Sort = { key: 'title', dir: 'asc' };

function loadSort(): Sort {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<Sort>;
    return parsed.key && parsed.dir ? { key: parsed.key, dir: parsed.dir } : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

function saveSort(sort: Sort) {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  } catch {
    /* storage full or blocked; the order is not worth interrupting anything over */
  }
}

/**
 * The library and playlists, mirrored from the database.
 *
 * Every mutating call returns the whole playlist list and the store replaces its copy with
 * it, rather than applying the same change twice — once in SQLite and once here. Two
 * implementations of "add a track unless it is already there" is two chances to disagree,
 * and the one the user sees would be the wrong one.
 */

export type View =
  | { kind: 'library' }
  | { kind: 'favourites' }
  | { kind: 'recent' }
  | { kind: 'albums' }
  | { kind: 'artists' }
  | { kind: 'album'; key: string }
  | { kind: 'artist'; name: string }
  | { kind: 'playlist'; id: string }
  | { kind: 'settings' };

type State = {
  tracks: Map<string, TrackInfo>;
  playlists: PlaylistInfo[];
  view: View;
  /** Where "back" goes from an album or artist, so drilling in is reversible. */
  previous: View | undefined;
  query: string;
  sort: Sort;
  scan: { done: number; total: number } | undefined;
  loaded: boolean;
};

type Actions = {
  init: () => Promise<void>;
  merge: (tracks: readonly TrackInfo[]) => void;
  setPlaylists: (playlists: PlaylistInfo[]) => void;
  setView: (view: View) => void;
  goBack: () => void;
  setQuery: (query: string) => void;
  toggleSort: (key: SortKey) => void;
  setScan: (scan: { done: number; total: number } | undefined) => void;
  removeTracks: (ids: readonly string[]) => Promise<void>;
  notePlayed: (id: string) => void;
  /** Toggles one track, or sets a whole selection to the same state. */
  toggleFavourite: (ids: readonly string[]) => void;
};

export const useLibrary = create<State & Actions>((set, get) => ({
  tracks: new Map(),
  playlists: [],
  view: { kind: 'library' },
  previous: undefined,
  query: '',
  sort: loadSort(),
  scan: undefined,
  loaded: false,

  init: async () => {
    const [tracks, playlists] = await Promise.all([window.takt.library(), window.takt.playlists()]);
    const byId = new Map(tracks.map((t) => [t.id, t]));

    set({ tracks: byId, playlists, loaded: true });

    // Only now: the saved queue is a list of ids, and there is nothing to resolve them
    // against until the library has arrived.
    usePlayer.getState().restoreQueue(byId);
  },

  merge: (incoming) => {
    if (!incoming.length) return;
    const tracks = new Map(get().tracks);
    for (const track of incoming) tracks.set(track.id, track);
    set({ tracks });
  },

  setPlaylists: (playlists) => set({ playlists }),

  setView: (view) => {
    const current = get().view;
    set({
      view,
      // Only drilling in is worth a back step. Remembering "settings" as the place to
      // return to from an album makes back mean something nobody intended.
      previous: view.kind === 'album' || view.kind === 'artist' ? current : undefined,
      // A search belongs to the list it was typed over.
      query: '',
    });
  },

  goBack: () => set({ view: get().previous ?? { kind: 'library' }, previous: undefined, query: '' }),

  setQuery: (query) => set({ query }),

  toggleSort: (key) => {
    const { sort } = get();
    // Clicking the active column flips direction; clicking another starts it ascending,
    // which is what every file list does.
    const next: Sort = sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' };

    set({ sort: next });
    saveSort(next);
  },

  setScan: (scan) => set({ scan }),

  /**
   * Bumps the local copy when a track starts.
   *
   * Main owns the durable count, but it does not push the updated row back — so without
   * this the "plays" column and the recently-played list would show whatever was true when
   * the library was last loaded, which is to say never the track you just played.
   */
  notePlayed: (id) => {
    const track = get().tracks.get(id);
    if (!track) return;

    const tracks = new Map(get().tracks);
    tracks.set(id, { ...track, playCount: (track.playCount ?? 0) + 1, lastPlayedAt: Date.now() });
    set({ tracks });
  },

  /**
   * Applied locally first, then persisted.
   *
   * A heart has to fill the instant it is clicked; waiting on a round trip to main to
   * redraw would make it feel broken even though nothing is slow.
   *
   * With several tracks selected the first one decides the direction for all of them —
   * toggling each independently would just invert a mixed selection, which is never what
   * anyone means by clicking one heart.
   */
  toggleFavourite: (ids) => {
    if (!ids.length) return;

    const current = get().tracks;
    const first = current.get(ids[0] as string);
    const next = !first?.favourite;

    const tracks = new Map(current);
    for (const id of ids) {
      const track = tracks.get(id);
      if (!track || Boolean(track.favourite) === next) continue;

      tracks.set(id, { ...track, favourite: next });
      window.takt.setFavourite(id, next);
    }

    set({ tracks });
  },

  removeTracks: async (ids) => {
    const remaining = await window.takt.removeTracks([...ids]);
    set({
      tracks: new Map(remaining.map((t) => [t.id, t])),
      // Deleting a track cascades to every playlist it was in, so those have to be refetched
      // rather than assumed unchanged.
      playlists: await window.takt.playlists(),
    });
  },
}));

/* Keeps the local play counts current without the library having to watch the player. */
onTrackStarted((id) => useLibrary.getState().notePlayed(id));

/** Tracks of a playlist, in its stored order, skipping any whose file has gone. */
export function playlistTracks(id: string) {
  const { playlists, tracks } = useLibrary.getState();
  const list = playlists.find((p) => p.id === id);
  if (!list) return [];

  return list.trackIds.map((trackId) => tracks.get(trackId)).filter((t): t is TrackInfo => Boolean(t));
}

/**
 * Up to four distinct covers for a playlist's mosaic.
 *
 * Distinct, because an album added whole would otherwise tile the same picture four times
 * and look like a rendering bug rather than a playlist.
 */
export function mosaicArt(list: PlaylistInfo, tracks: Map<string, TrackInfo>) {
  const seen: string[] = [];

  for (const id of list.trackIds) {
    const art = tracks.get(id)?.artwork;
    if (art && !seen.includes(art)) seen.push(art);
    if (seen.length === 4) break;
  }

  return seen;
}
