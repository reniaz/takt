import { describe, expect, it } from 'vitest';

import {
  albumKey, byDiscAndTrack, creditedArtist, filterTracks, groupAlbums, groupArtists,
  recentlyPlayed, searchEverything, sortTracks, UNKNOWN_ALBUM, UNKNOWN_ARTIST,
} from './browse';

import type { TrackInfo } from '../../electron/preload';

const t = (id: string, fields: Partial<TrackInfo> = {}): TrackInfo => ({
  id, path: `C:\\m\\${id}.flac`, title: id, ...fields,
});

describe('creditedArtist', () => {
  it('prefers the album artist', () => {
    // Without this a guest appearance credits the record to the guest.
    expect(creditedArtist(t('a', { artist: 'Guest', albumArtist: 'Host' }))).toBe('Host');
  });

  it('falls back to the track artist, then to a placeholder', () => {
    expect(creditedArtist(t('a', { artist: 'Neu!' }))).toBe('Neu!');
    expect(creditedArtist(t('a'))).toBe(UNKNOWN_ARTIST);
  });

  it('ignores whitespace-only tags', () => {
    expect(creditedArtist(t('a', { albumArtist: '   ', artist: 'Cluster' }))).toBe('Cluster');
  });
});

describe('albumKey', () => {
  it('separates identically titled records by different artists', () => {
    // "Greatest Hits" is not one album.
    const a = albumKey(t('a', { artist: 'A', album: 'Greatest Hits' }));
    const b = albumKey(t('b', { artist: 'B', album: 'Greatest Hits' }));
    expect(a).not.toBe(b);
  });

  it('keeps a compilation together under its album artist', () => {
    const a = albumKey(t('a', { artist: 'One', albumArtist: 'Various', album: 'Mix' }));
    const b = albumKey(t('b', { artist: 'Two', albumArtist: 'Various', album: 'Mix' }));
    expect(a).toBe(b);
  });

  it('cannot be forged by a title that looks like a key', () => {
    // The separator is a character that cannot appear in a tag.
    const real = albumKey(t('a', { artist: 'X', album: 'Y' }));
    const fake = albumKey(t('b', { artist: 'X Y', album: UNKNOWN_ALBUM }));
    expect(real).not.toBe(fake);
  });
});

describe('byDiscAndTrack', () => {
  it('orders by disc, then track, then title', () => {
    const list = [
      t('d2t1', { discNo: 2, trackNo: 1 }),
      t('d1t2', { discNo: 1, trackNo: 2 }),
      t('d1t1', { discNo: 1, trackNo: 1 }),
    ];
    expect([...list].sort(byDiscAndTrack).map((x) => x.id)).toEqual(['d1t1', 'd1t2', 'd2t1']);
  });

  it('treats a missing disc number as disc one', () => {
    const list = [t('b', { discNo: 2, trackNo: 1 }), t('a', { trackNo: 5 })];
    expect([...list].sort(byDiscAndTrack).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('groupAlbums', () => {
  const tracks = [
    t('a2', { artist: 'Neu!', album: 'Neu!', trackNo: 2, year: 1972 }),
    t('a1', { artist: 'Neu!', album: 'Neu!', trackNo: 1, year: 1972, artwork: 'cover.jpg' }),
    t('b1', { artist: 'Cluster', album: 'Zuckerzeit', trackNo: 1, year: 1974 }),
  ];

  it('groups and orders tracks within a record', () => {
    const albums = groupAlbums(tracks);
    expect(albums).toHaveLength(2);
    expect(albums.find((x) => x.title === 'Neu!')?.trackIds).toEqual(['a1', 'a2']);
  });

  it('sorts by artist', () => {
    expect(groupAlbums(tracks).map((a) => a.artist)).toEqual(['Cluster', 'Neu!']);
  });

  it('takes the cover from whichever track has one', () => {
    expect(groupAlbums(tracks).find((a) => a.title === 'Neu!')?.artwork).toBe('cover.jpg');
  });

  it('takes the earliest year, so a reissue tag does not age the record forward', () => {
    const reissued = [
      t('x', { artist: 'A', album: 'R', trackNo: 1, year: 1975 }),
      t('y', { artist: 'A', album: 'R', trackNo: 2, year: 2011 }),
    ];
    expect(groupAlbums(reissued)[0]?.year).toBe(1975);
  });

  it('sums duration across the record', () => {
    const timed = [
      t('x', { artist: 'A', album: 'R', duration: 100 }),
      t('y', { artist: 'A', album: 'R', duration: 50 }),
    ];
    expect(groupAlbums(timed)[0]?.duration).toBe(150);
  });
});

describe('groupArtists', () => {
  it('counts distinct albums per artist', () => {
    const tracks = [
      t('a', { artist: 'Neu!', album: 'Neu!' }),
      t('b', { artist: 'Neu!', album: 'Neu!' }),
      t('c', { artist: 'Neu!', album: 'Neu! 2' }),
    ];
    const [artist] = groupArtists(tracks);
    expect(artist?.albumCount).toBe(2);
    expect(artist?.trackIds).toHaveLength(3);
  });

  it('files a guest track under the album artist', () => {
    const tracks = [t('a', { artist: 'Guest', albumArtist: 'Host', album: 'X' })];
    expect(groupArtists(tracks).map((a) => a.name)).toEqual(['Host']);
  });
});

describe('filterTracks', () => {
  const tracks = [
    t('a', { title: 'Hallogallo', artist: 'Neu!', album: 'Neu!' }),
    t('b', { title: 'Autobahn', artist: 'Kraftwerk', album: 'Autobahn' }),
    t('c', { title: 'Spiegelbild', artist: 'Harmonia', genre: 'Krautrock' }),
  ];

  it('returns everything for an empty query', () => {
    expect(filterTracks(tracks, '   ')).toHaveLength(3);
  });

  it('matches across fields in any order', () => {
    // The point of splitting into terms: nobody remembers which way round they go.
    expect(filterTracks(tracks, 'neu hallo').map((x) => x.id)).toEqual(['a']);
    expect(filterTracks(tracks, 'hallo neu').map((x) => x.id)).toEqual(['a']);
  });

  it('is case insensitive and matches genre', () => {
    expect(filterTracks(tracks, 'KRAUT').map((x) => x.id)).toEqual(['c']);
  });

  it('requires every term', () => {
    expect(filterTracks(tracks, 'neu kraftwerk')).toHaveLength(0);
  });
});

describe('searchEverything', () => {
  const tracks = [
    t('a', { title: 'Hallogallo', artist: 'Neu!', album: 'Neu!', playCount: 2 }),
    t('b', { title: 'Negativland', artist: 'Neu!', album: 'Neu!', playCount: 9 }),
    t('c', { title: 'Autobahn', artist: 'Kraftwerk', album: 'Autobahn' }),
  ];
  const lists = [
    { id: 'p1', name: 'Neu stuff', trackIds: ['a'] },
    { id: 'p2', name: 'Evening', trackIds: ['c'] },
  ];

  it('returns nothing for an empty query rather than everything', () => {
    const found = searchEverything(tracks, lists, '   ');
    expect(found.total).toBe(0);
  });

  it('finds tracks, albums, artists and playlists at once', () => {
    const found = searchEverything(tracks, lists, 'neu');
    expect(found.tracks.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(found.albums.map((x) => x.title)).toEqual(['Neu!']);
    expect(found.artists.map((x) => x.name)).toEqual(['Neu!']);
    expect(found.playlists.map((x) => x.name)).toEqual(['Neu stuff']);
  });

  it('matches an artist by name even when no track title contains it', () => {
    // The usual case, and the reason artists are matched on their own name rather than
    // gathered from whichever tracks happened to match.
    const found = searchEverything(tracks, lists, 'kraftwerk');
    expect(found.artists.map((x) => x.name)).toEqual(['Kraftwerk']);
  });

  it('puts the more played track first', () => {
    const found = searchEverything(tracks, lists, 'neu');
    expect(found.tracks[0]?.id).toBe('b');
  });

  it('caps each group', () => {
    const many = Array.from({ length: 30 }, (_, i) => t(`x${i}`, { title: `Song ${i}`, artist: 'A' }));
    const found = searchEverything(many, [], 'song', { tracks: 4, albums: 2, artists: 2, playlists: 1 });
    expect(found.tracks).toHaveLength(4);
  });

  it('requires every term, across fields', () => {
    expect(searchEverything(tracks, lists, 'neu autobahn').total).toBe(0);
    expect(searchEverything(tracks, lists, 'kraftwerk autobahn').tracks.map((x) => x.id)).toEqual(['c']);
  });
});

describe('sortTracks', () => {
  const tracks = [
    t('b', { title: 'B', duration: 200, playCount: 5 }),
    t('a', { title: 'A', duration: 100, playCount: 0 }),
    t('c', { title: 'C', duration: 300, playCount: 2 }),
  ];

  it('sorts ascending and descending', () => {
    expect(sortTracks(tracks, { key: 'title', dir: 'asc' }).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortTracks(tracks, { key: 'title', dir: 'desc' }).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by duration and play count', () => {
    expect(sortTracks(tracks, { key: 'duration', dir: 'asc' }).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortTracks(tracks, { key: 'plays', dir: 'desc' }).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps tracks with no value last in both directions', () => {
    // A track with no album does not belong before A or after Z; it has no place in that
    // ordering, and heading the list on every flip is worse than being buried.
    const mixed = [t('none'), t('has', { album: 'M' })];
    expect(sortTracks(mixed, { key: 'album', dir: 'asc' }).map((x) => x.id)).toEqual(['has', 'none']);
    expect(sortTracks(mixed, { key: 'album', dir: 'desc' }).map((x) => x.id)).toEqual(['has', 'none']);
  });

  it('does not mutate its input', () => {
    const original = tracks.map((x) => x.id);
    sortTracks(tracks, { key: 'title', dir: 'desc' });
    expect(tracks.map((x) => x.id)).toEqual(original);
  });
});

describe('recentlyPlayed', () => {
  it('returns only played tracks, most recent first', () => {
    const tracks = [
      t('old', { lastPlayedAt: 1000 }),
      t('never'),
      t('new', { lastPlayedAt: 3000 }),
    ];
    expect(recentlyPlayed(tracks).map((x) => x.id)).toEqual(['new', 'old']);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => t(`t${i}`, { lastPlayedAt: i }));
    expect(recentlyPlayed(many, 3).map((x) => x.id)).toEqual(['t9', 't8', 't7']);
  });
});
