import { createRequire } from 'node:module';
import { join } from 'node:path';

import { app } from 'electron';

/**
 * `node:sqlite` is loaded through a runtime require, not an import.
 *
 * esbuild only leaves a `node:` specifier alone if it recognises the name as a builtin,
 * and its list predates this module. A plain `import ... from 'node:sqlite'` is therefore
 * rewritten to `require("sqlite")` — the prefix silently stripped — and the app dies at
 * load with "Cannot find module 'sqlite'". Neither tsup's `noExternal` nor esbuild's own
 * `external` prevents it, because the rewrite happens after both.
 *
 * Going through `createRequire` keeps the specifier a runtime string the bundler does not
 * analyse. `node:module` itself is old enough to be in the list, so it survives intact.
 */
const nodeRequire = createRequire(__filename);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

type DatabaseSync = InstanceType<typeof DatabaseSync>;

/**
 * The library, on disk.
 *
 * `node:sqlite` rather than better-sqlite3: it is built into the Node that Electron ships,
 * so there is no native module to rebuild per platform and no `node_modules` to include in
 * the package — which is what keeps the asar at under two megabytes.
 *
 * Everything here is synchronous. The main process is not serving anything while a query
 * runs, the queries are single-table lookups over a few thousand rows, and an async layer
 * would buy nothing but the chance to interleave two writes.
 */

let db: DatabaseSync | undefined;

export type TrackRow = {
  id: string;
  path: string;
  mtime: number;
  size: number;
  title: string;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  genre: string | null;
  duration: number | null;
  codec: string | null;
  artwork: string | null;
  rgTrack: number | null;
  rgAlbum: number | null;
  addedAt: number;
  playCount: number;
  lastPlayedAt: number | null;
};

export type PlaylistRow = {
  id: string;
  name: string;
  /** A custom cover, if one was chosen. Otherwise the UI builds a mosaic from the tracks. */
  thumbnail: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Schema versions, applied in order.
 *
 * Numbered and recorded in `user_version` rather than guessed at with "create table if not
 * exists": once a column has to change, the only way to know which shape is on disk is to
 * have written down which migrations ran.
 */
const MIGRATIONS: string[] = [
  `
  create table tracks (
    id            text primary key,
    path          text not null unique,
    mtime         integer not null,
    size          integer not null,
    title         text not null,
    artist        text,
    albumArtist   text,
    album         text,
    year          integer,
    trackNo       integer,
    discNo        integer,
    genre         text,
    duration      real,
    codec         text,
    artwork       text,
    rgTrack       real,
    rgAlbum       real,
    addedAt       integer not null,
    playCount     integer not null default 0,
    lastPlayedAt  integer
  );

  create index tracks_album on tracks(album);
  create index tracks_artist on tracks(artist);

  create table playlists (
    id         text primary key,
    name       text not null,
    thumbnail  text,
    sortOrder  integer not null,
    createdAt  integer not null,
    updatedAt  integer not null
  );

  create table playlist_tracks (
    playlistId text not null references playlists(id) on delete cascade,
    trackId    text not null references tracks(id) on delete cascade,
    position   integer not null,
    primary key (playlistId, trackId)
  );

  create index playlist_tracks_order on playlist_tracks(playlistId, position);
  `,

  `
  create table waveforms (
    trackId text primary key references tracks(id) on delete cascade,
    -- Stored alongside the peaks rather than only on the track, so a lookup can tell in
    -- one query whether the cache is still describing the same file.
    mtime   integer not null,
    peaks   blob not null
  );
  `,
];

export function open() {
  if (db) return db;

  const handle = new DatabaseSync(join(app.getPath('userData'), 'library.db'));

  // WAL so a long import does not block reads. `foreign_keys` is off by default in SQLite,
  // and without it the `on delete cascade` above is decoration.
  handle.exec('pragma journal_mode = WAL');
  handle.exec('pragma foreign_keys = ON');

  const { user_version: version } = handle.prepare('pragma user_version').get() as { user_version: number };

  for (let i = version; i < MIGRATIONS.length; i += 1) {
    handle.exec('begin');
    try {
      handle.exec(MIGRATIONS[i] as string);
      handle.exec(`pragma user_version = ${i + 1}`);
      handle.exec('commit');
    } catch (err) {
      handle.exec('rollback');
      throw err;
    }
  }

  db = handle;
  return handle;
}

function conn() {
  return db ?? open();
}

/* ---------- tracks ---------- */

const UPSERT_TRACK = `
  insert into tracks (
    id, path, mtime, size, title, artist, albumArtist, album, year, trackNo, discNo,
    genre, duration, codec, artwork, rgTrack, rgAlbum, addedAt
  ) values (
    :id, :path, :mtime, :size, :title, :artist, :albumArtist, :album, :year, :trackNo,
    :discNo, :genre, :duration, :codec, :artwork, :rgTrack, :rgAlbum, :addedAt
  )
  on conflict(id) do update set
    path = excluded.path, mtime = excluded.mtime, size = excluded.size,
    title = excluded.title, artist = excluded.artist, albumArtist = excluded.albumArtist,
    album = excluded.album, year = excluded.year, trackNo = excluded.trackNo,
    discNo = excluded.discNo, genre = excluded.genre, duration = excluded.duration,
    codec = excluded.codec, artwork = excluded.artwork,
    rgTrack = excluded.rgTrack, rgAlbum = excluded.rgAlbum
`;

type TrackInput = Omit<TrackRow, 'addedAt' | 'playCount' | 'lastPlayedAt'>;

export function upsertTracks(tracks: readonly TrackInput[]) {
  const handle = conn();
  const statement = handle.prepare(UPSERT_TRACK);
  const addedAt = Date.now();

  // One transaction for the whole import. Committing per row turns a 5,000-file folder
  // into 5,000 fsyncs, which is the difference between a second and several minutes.
  handle.exec('begin');
  try {
    for (const track of tracks) statement.run({ ...track, addedAt });
    handle.exec('commit');
  } catch (err) {
    handle.exec('rollback');
    throw err;
  }
}

export function allTracks() {
  return conn().prepare('select * from tracks order by albumArtist, album, discNo, trackNo, title')
    .all() as unknown as TrackRow[];
}

export function trackPath(id: string) {
  const row = conn().prepare('select path from tracks where id = ?').get(id) as { path?: string } | undefined;
  return row?.path;
}

/** Whether this file is already indexed and unchanged, so a rescan can skip parsing it. */
export function isCurrent(id: string, mtime: number, size: number) {
  const row = conn().prepare('select mtime, size from tracks where id = ?').get(id) as
    { mtime: number; size: number } | undefined;

  return Boolean(row && row.mtime === mtime && row.size === size);
}

export function removeTracks(ids: readonly string[]) {
  const statement = conn().prepare('delete from tracks where id = ?');
  for (const id of ids) statement.run(id);
}

export function notePlayed(id: string) {
  conn().prepare('update tracks set playCount = playCount + 1, lastPlayedAt = ? where id = ?')
    .run(Date.now(), id);
}

/* ---------- playlists ---------- */

export function allPlaylists() {
  return conn().prepare('select * from playlists order by sortOrder, createdAt')
    .all() as unknown as PlaylistRow[];
}

export function playlistTrackIds(playlistId: string) {
  const rows = conn()
    .prepare('select trackId from playlist_tracks where playlistId = ? order by position')
    .all(playlistId) as unknown as { trackId: string }[];

  return rows.map((r) => r.trackId);
}

export function createPlaylist(name: string) {
  const handle = conn();
  const id = `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const { next } = handle.prepare('select coalesce(max(sortOrder), -1) + 1 as next from playlists')
    .get() as { next: number };

  handle.prepare(
    'insert into playlists (id, name, thumbnail, sortOrder, createdAt, updatedAt) values (?, ?, null, ?, ?, ?)',
  ).run(id, name, next, now, now);

  return id;
}

export function renamePlaylist(id: string, name: string) {
  conn().prepare('update playlists set name = ?, updatedAt = ? where id = ?').run(name, Date.now(), id);
}

export function setPlaylistThumbnail(id: string, thumbnail: string | undefined) {
  conn().prepare('update playlists set thumbnail = ?, updatedAt = ? where id = ?')
    .run(thumbnail ?? null, Date.now(), id);
}

export function deletePlaylist(id: string) {
  // playlist_tracks rows go with it, via the cascade the foreign_keys pragma enables.
  conn().prepare('delete from playlists where id = ?').run(id);
}

/**
 * Appends tracks, skipping any already in the playlist.
 *
 * A playlist is a set with an order, not a bag: adding an album twice should not produce
 * every track twice, which is what a plain insert would do the moment someone clicks the
 * same menu item again.
 */
export function addToPlaylist(playlistId: string, trackIds: readonly string[]) {
  const handle = conn();
  const { next } = handle
    .prepare('select coalesce(max(position), -1) + 1 as next from playlist_tracks where playlistId = ?')
    .get(playlistId) as { next: number };

  const statement = handle.prepare(
    'insert or ignore into playlist_tracks (playlistId, trackId, position) values (?, ?, ?)',
  );

  handle.exec('begin');
  try {
    let position = next;
    for (const trackId of trackIds) {
      statement.run(playlistId, trackId, position);
      position += 1;
    }
    handle.prepare('update playlists set updatedAt = ? where id = ?').run(Date.now(), playlistId);
    handle.exec('commit');
  } catch (err) {
    handle.exec('rollback');
    throw err;
  }
}

export function removeFromPlaylist(playlistId: string, trackIds: readonly string[]) {
  const statement = conn().prepare('delete from playlist_tracks where playlistId = ? and trackId = ?');
  for (const trackId of trackIds) statement.run(playlistId, trackId);
  conn().prepare('update playlists set updatedAt = ? where id = ?').run(Date.now(), playlistId);
}

/* ---------- waveforms ---------- */

/**
 * Cached peaks for the seek bar.
 *
 * Keyed by mtime as well as id, so a retagged or replaced file is redrawn rather than
 * shown with the shape of whatever used to be at that path. Decoding a track takes long
 * enough that this is the difference between the waveform appearing instantly on a
 * revisit and appearing a second late every single time.
 */
export function getWaveform(trackId: string) {
  const row = conn()
    .prepare('select w.peaks as peaks from waveforms w join tracks t on t.id = w.trackId '
      + 'where w.trackId = ? and w.mtime = t.mtime')
    .get(trackId) as { peaks?: Uint8Array } | undefined;

  return row?.peaks;
}

export function putWaveform(trackId: string, peaks: Uint8Array) {
  const handle = conn();
  const row = handle.prepare('select mtime from tracks where id = ?').get(trackId) as
    { mtime: number } | undefined;

  // No track means nothing to key the cache against; the peaks would never match again.
  if (!row) return;

  handle
    .prepare('insert into waveforms (trackId, mtime, peaks) values (?, ?, ?) '
      + 'on conflict(trackId) do update set mtime = excluded.mtime, peaks = excluded.peaks')
    .run(trackId, row.mtime, peaks);
}

/** Rewrites the whole order. Simpler than shuffling positions, and the lists are small. */
export function setPlaylistOrder(playlistId: string, trackIds: readonly string[]) {
  const handle = conn();
  const statement = handle.prepare(
    'update playlist_tracks set position = ? where playlistId = ? and trackId = ?',
  );

  handle.exec('begin');
  try {
    trackIds.forEach((trackId, position) => statement.run(position, playlistId, trackId));
    handle.prepare('update playlists set updatedAt = ? where id = ?').run(Date.now(), playlistId);
    handle.exec('commit');
  } catch (err) {
    handle.exec('rollback');
    throw err;
  }
}
