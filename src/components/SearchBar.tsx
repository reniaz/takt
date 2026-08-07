import { useEffect, useRef } from 'react';

import { useLibrary } from '../state/library';
import { Icon } from './Icon';

/**
 * Filters whatever list is on screen.
 *
 * Deliberately not a global "search everything" page. The query applies to the view you
 * are already looking at, so narrowing a playlist and narrowing the library are the same
 * gesture, and clearing it puts you back where you were rather than somewhere new.
 */
export function SearchBar() {
  const query = useLibrary((s) => s.query);
  const setQuery = useLibrary((s) => s.setQuery);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="search">
      <Icon name="search" size={15} />
      <input
        ref={ref}
        value={query}
        placeholder="Search"
        aria-label="Search"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Space is play/pause and single letters are shortcuts everywhere else.
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (query) setQuery('');
            else e.currentTarget.blur();
          }
        }}
      />
      {query && (
        <button type="button" className="search__clear" onClick={() => setQuery('')} aria-label="Clear search">
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}
