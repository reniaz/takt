import { create } from 'zustand';

import { usePlayer } from './player';

import type { PlaylistInfo, TrackInfo } from '../../electron/preload';

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
  | { kind: 'playlist'; id: string }
  | { kind: 'settings' };

type State = {
  tracks: Map<string, TrackInfo>;
  playlists: PlaylistInfo[];
  view: View;
  scan: { done: number; total: number } | undefined;
  loaded: boolean;
};

type Actions = {
  init: () => Promise<void>;
  merge: (tracks: readonly TrackInfo[]) => void;
  setPlaylists: (playlists: PlaylistInfo[]) => void;
  setView: (view: View) => void;
  setScan: (scan: { done: number; total: number } | undefined) => void;
  removeTracks: (ids: readonly string[]) => Promise<void>;
};

export const useLibrary = create<State & Actions>((set, get) => ({
  tracks: new Map(),
  playlists: [],
  view: { kind: 'library' },
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
  setView: (view) => set({ view }),
  setScan: (scan) => set({ scan }),

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
