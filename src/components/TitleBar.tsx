import { useEffect, useState } from 'react';

import { currentTrack, usePlayer } from '../state/player';

/**
 * The window's title bar, drawn by the page.
 *
 * There is no system frame, so this is the whole of it: the icon, the title, the buttons,
 * and the region you drag the window by. It uses the same surface as the panels below so
 * the top of the window reads as one piece rather than as a strip of chrome laid over the
 * app.
 *
 * Adapted from Draht's, including the behaviour that took it several passes to get right:
 * hiding when maximised, and revealing on the top edge in JS rather than with `:hover`.
 */

/** How close to the top edge opens the hidden bar. */
const REVEAL_AT = 4;

/**
 * How far down closes it again — past the bar itself, not past the trigger.
 *
 * This is the whole reason the reveal is tracked here instead of with `:hover`. A hover has
 * no memory: the trigger is a few pixels at the very top, so the bar vanished the instant
 * the pointer moved off them — which is on the way to the bar, making it nearly impossible
 * to click. Opening at the edge and closing only once the pointer is clear of the whole bar
 * gives it somewhere to be.
 */
const HIDE_BELOW = 40;

export function TitleBar() {
  const [isMaximized, setMaximized] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Re-render when the track changes, so the bar's label follows it.
  usePlayer((s) => s.index);
  const track = currentTrack();
  const title = track ? `${track.title}${track.artist ? ` — ${track.artist}` : ''}` : 'Takt';

  /*
   * The taskbar, Alt-Tab and this bar all say the same thing, decided in one place.
   *
   * Draht reads `document.title` back out through a MutationObserver because telegram-tt
   * owns it there. Takt owns it, so the string is derived once and both consumers are fed
   * from it — an observer here would only be watching for its own writes.
   */
  useEffect(() => {
    document.title = track ? `${title} · Takt` : 'Takt';
  }, [title, track]);

  useEffect(() => {
    void window.takt.isMaximized().then(setMaximized);
    // Maximising also happens from keyboard shortcuts and snap gestures, so the window is
    // asked rather than assumed.
    return window.takt.onWindowState((state) => setMaximized(state.isMaximized));
  }, []);

  useEffect(() => {
    if (!isMaximized) {
      setRevealed(false);
      return undefined;
    }

    const onMove = (e: MouseEvent) => {
      if (e.clientY <= REVEAL_AT) setRevealed(true);
      else if (e.clientY > HIDE_BELOW) setRevealed(false);
    };

    // Leaving through the top — into the bar's own buttons, or off the window entirely —
    // must not count as moving away from it.
    const onLeave = (e: MouseEvent) => {
      if (e.clientY > HIDE_BELOW) setRevealed(false);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [isMaximized]);

  const state = [
    'titlebar-host',
    isMaximized ? 'titlebar-host--hidden' : '',
    isMaximized && revealed ? 'titlebar-host--revealed' : '',
  ].join(' ');

  return (
    <div className={state}>
      <div className="titlebar" onDoubleClick={() => window.takt.toggleMaximize()}>
        <TaktMark />
        <span className="titlebar__text">{title}</span>

        <div className="titlebar__buttons">
          <button
            type="button"
            className="titlebar__button"
            aria-label="Minimise"
            onClick={() => window.takt.minimize()}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" /></svg>
          </button>

          <button
            type="button"
            className="titlebar__button"
            aria-label={isMaximized ? 'Restore' : 'Maximise'}
            onClick={() => window.takt.toggleMaximize()}
          >
            {isMaximized ? (
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 2.5V0.5h7v7h-2" />
                <path d="M0.5 2.5h7v7h-7z" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0.5 0.5h9v9h-9z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="titlebar__button titlebar__button--close"
            aria-label="Close"
            onClick={() => window.takt.close()}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** The app mark, in accent colour so it picks up the theme. */
function TaktMark() {
  return (
    <svg className="titlebar__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" fill="none">
        <path d="M4.25 3.5v9" />
        <path d="M6.75 6.5v3" />
        <path d="M9.25 5v6" />
        <path d="M11.75 6.5v3" />
      </g>
    </svg>
  );
}
