import { useEffect, useState } from 'react';

import { usePlayer } from '../state/player';

/** Reset target for a double-click, and what a fresh install starts at. */
const DEFAULT_WIDTH = 220;

/**
 * The drag handle between the sidebar and the content.
 *
 * A hairline is the right thing to look at and the wrong thing to aim at, so the element
 * is a few pixels wide and widened further by a transparent margin — the cursor changes
 * over a target you can actually hit without the divider looking heavy.
 */
export function Resizer() {
  const width = usePlayer((s) => s.sidebarWidth);
  const setWidth = usePlayer((s) => s.setSidebarWidth);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return undefined;

    // The sidebar starts at the window's left edge, so the pointer's x is the width.
    const onMove = (e: PointerEvent) => setWidth(e.clientX);
    const onUp = () => setDragging(false);

    /*
     * While dragging, the pointer regularly leaves the handle — that is the whole point of
     * dragging — so the listeners live on the window. `user-select` is suppressed globally
     * because a drag across the track list would otherwise select its text.
     */
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.body.classList.add('is-resizing');

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-resizing');
    };
  }, [dragging, setWidth]);

  return (
    <div
      className={`resizer ${dragging ? 'resizer--active' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={170}
      aria-valuemax={460}
      tabIndex={0}
      onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}
      onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 24 : 8;
        if (e.key === 'ArrowLeft') { e.preventDefault(); setWidth(width - step); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setWidth(width + step); }
        else if (e.key === 'Home') { e.preventDefault(); setWidth(DEFAULT_WIDTH); }
      }}
    />
  );
}
