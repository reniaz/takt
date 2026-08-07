import { useEffect, useMemo, useRef, useState } from 'react';

import { searchEverything } from '../state/browse';
import { playlistTracks, useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import {
  addPick, clearPicks, loadPicks, removePick, type RecentPick,
} from '../state/recentSearches';
import { Icon } from './Icon';
import {
  albumRow, artistRow, pickToRow, playlistRow, ResultList, trackRow, type ResultRow,
} from './SearchResults';


/**
 * Search across the whole library, with results under the box.
 *
 * The panel is the search. Typing also narrows whatever list is open behind it — that is
 * useful inside a long playlist and costs nothing — but finding something you cannot see
 * is what this is for, and that means results you can act on without leaving the box.
 */
export function SearchBar() {
  const query = useLibrary((s) => s.query);
  const setQuery = useLibrary((s) => s.setQuery);
  const setView = useLibrary((s) => s.setView);
  const tracks = useLibrary((s) => s.tracks);
  const playlists = useLibrary((s) => s.playlists);

  const playNow = usePlayer((s) => s.playNow);

  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [picks, setPicks] = useState<RecentPick[]>(() => loadPicks());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const remember = (pick: RecentPick) => setPicks((current) => addPick(current, pick));

  const close = () => {
    setOpen(false);
    ref.current?.blur();
  };

  /** Opening a result closes the box; the query stays, so the view behind stays narrowed. */
  const openPick = (pick: RecentPick) => {
    remember(pick);

    switch (pick.kind) {
      case 'track': {
        const track = tracks.get(pick.id);
        if (track) playNow([track], 0, { kind: 'library' });
        break;
      }
      case 'album': setView({ kind: 'album', key: pick.key }); break;
      case 'artist': setView({ kind: 'artist', name: pick.name }); break;
      case 'playlist': setView({ kind: 'playlist', id: pick.id }); break;
    }

    close();
  };

  const results = useMemo(
    () => searchEverything([...tracks.values()], playlists, query),
    [tracks, playlists, query],
  );

  /* One flat list, so the arrow keys are an index rather than a walk across groups. */
  const rows: ResultRow[] = useMemo(() => {
    if (!query.trim()) {
      return picks
        .map((pick) => pickToRow(pick, tracks, playlists, openPick))
        // A pick whose track was removed or whose playlist was deleted simply drops out.
        .filter((row): row is ResultRow => Boolean(row));
    }

    return [
      ...results.tracks.map((track) => trackRow(track, () => {
        remember({ kind: 'track', id: track.id });
        // The whole result set becomes the queue, so what follows is the rest of what was
        // found rather than silence.
        playNow(results.tracks, results.tracks.indexOf(track), { kind: 'library' });
        close();
      })),
      ...results.albums.map((album) => albumRow(album, () => openPick({ kind: 'album', key: album.key }))),
      ...results.artists.map((artist) => artistRow(artist, () => openPick({ kind: 'artist', name: artist.name }))),
      ...results.playlists.map((list) => {
        const artwork = playlistTracks(list.id).map((t) => t.artwork).find(Boolean);
        return playlistRow(list, artwork, () => openPick({ kind: 'playlist', id: list.id }));
      }),
    ];
  }, [query, results, picks, tracks, playlists]);

  // A stale index would highlight a row that is no longer there, or nothing at all.
  useEffect(() => setHighlighted(0), [query, rows.length]);

  const showPanel = open && (rows.length > 0 || Boolean(query.trim()));

  return (
    <div className="searchbox">
      <div className="search">
        <Icon name="search" size={15} />
        <input
          ref={ref}
          value={query}
          placeholder="Search"
          aria-label="Search"
          spellCheck={false}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            // Space is play/pause and single letters are shortcuts everywhere else.
            e.stopPropagation();

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHighlighted((i) => (rows.length ? (i + 1) % rows.length : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlighted((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              rows[highlighted]?.activate();
            } else if (e.key === 'Escape') {
              if (showPanel) setOpen(false);
              else if (query) setQuery('');
              else e.currentTarget.blur();
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            aria-label="Clear search"
            onPointerDown={(e) => { e.preventDefault(); setQuery(''); ref.current?.focus(); }}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="results" id="search-results">
          <div className="results__head">
            <span>{query.trim() ? 'Results' : 'Recent'}</span>
            {!query.trim() && rows.length > 0 && (
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); setPicks(clearPicks()); }}
              >
                Clear
              </button>
            )}
          </div>

          {rows.length === 0
            ? <p className="results__empty">Nothing found.</p>
            : (
              <ResultList
                rows={rows}
                highlighted={highlighted}
                onHover={setHighlighted}
                {...(query.trim()
                  ? {}
                  : { onRemove: (row: ResultRow) => setPicks((c) => removePick(c, row.pick)) })}
              />
            )}
        </div>
      )}
    </div>
  );
}

