import { useEffect, useRef } from 'react';

import { useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { Icon } from './Icon';
import { SeekBar } from './SeekBar';
import { Visualizer } from './Visualizer';
import { VolumeControl } from './VolumeControl';

/**
 * The fullscreen now-playing screen.
 *
 * Takes the whole display rather than just the window: a maximised window still shows the
 * taskbar, and the point of this is that nothing else is on screen. The window is put back
 * on the way out, so leaving cannot strand it fullscreen with no controls.
 */
export function NowPlayingScreen({ onClose }: { onClose: () => void }) {
  const playingId = usePlayer((s) => s.queue[s.index]);
  const track = useLibrary((s) => (playingId ? s.tracks.get(playingId) : undefined));
  const toggleFavourite = useLibrary((s) => s.toggleFavourite);

  const isPlaying = usePlayer((s) => s.isPlaying);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);

  /*
   * The callback is held in a ref rather than depended on.
   *
   * `onClose` is created fresh on every render of the parent, and the parent re-renders
   * about once a second while something is playing. Depending on it ran this effect's
   * cleanup and body at that rate — leaving and re-entering fullscreen every second, which
   * flickers the window, the taskbar, and clears the canvas underneath.
   */
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    window.takt.setFullscreen(true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stopped so the shortcut layer underneath does not also act on it.
      e.stopPropagation();
      close.current();
    };

    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.takt.setFullscreen(false);
    };
  }, []);

  return (
    <div className="viz">
      <Visualizer active />

      <div className="viz__content">
        <div className="viz__art">
          {track?.artwork
            ? <img src={`takt://art/${track.artwork}`} alt="" />
            : <Icon name="music" size={64} />}

          {/*
            On the artwork rather than in the transport row.

            A heart among the playback controls competes with them for a glance; over the
            cover it is next to the thing it refers to, and stays out of the way until the
            pointer is already there. A set favourite stays visible regardless — that is
            the state worth seeing without hunting for it.
          */}
          {track && (
            <button
              type="button"
              className="viz__fav"
              aria-pressed={Boolean(track.favourite)}
              aria-label={track.favourite ? 'Remove from favourites' : 'Add to favourites'}
              title={track.favourite ? 'Remove from favourites' : 'Add to favourites'}
              onClick={() => toggleFavourite([track.id])}
            >
              {/*
                The whole cover is the target — a hover state reacting to a 40px corner is
                a worse thing to aim at than the picture it sits on.

                Hidden until hovered whether or not it is set; only the icon differs, so
                the artwork is never covered by a badge and the two states behave alike.
              */}
              <span className="viz__favHover">
                <Icon name={track.favourite ? 'heartFull' : 'heart'} size={54} />
              </span>
            </button>
          )}
        </div>

        <div className="viz__title">{track?.title ?? 'Nothing playing'}</div>
        <div className="viz__artist">{track?.artist ?? ''}</div>
        {track?.album && <div className="viz__album">{track.album}</div>}

        {/*
          The same seek bar as the player bar, not a second one. It was a plain progress
          div here, which looked identical and did nothing when clicked — and it already
          carries dragging, click-to-type and the waveform.
        */}
        <div className="viz__seek"><SeekBar /></div>

        <div className="viz__controls">
          {/* The same set as the player bar, which is hidden behind this. */}
          <button
            type="button"
            className={`ctl ${shuffle ? 'ctl--on' : ''}`}
            onClick={toggleShuffle}
            aria-pressed={shuffle}
            aria-label="Shuffle"
            title="Shuffle (S)"
          >
            <Icon name="shuffle" size={20} />
          </button>

          <button type="button" className="ctl" onClick={previous} aria-label="Previous">
            <Icon name="previous" size={22} />
          </button>
          <button type="button" className="ctl ctl--primary viz__play" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
          </button>
          <button type="button" className="ctl" onClick={() => next(true)} aria-label="Next">
            <Icon name="next" size={22} />
          </button>

          <button
            type="button"
            className={`ctl ${repeat !== 'off' ? 'ctl--on' : ''}`}
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            title={`Repeat: ${repeat} (R)`}
          >
            <Icon name="repeat" size={20} />
            {repeat === 'track' && <span className="ctl__badge">1</span>}
          </button>
        </div>

      </div>

      <div className="viz__volume"><VolumeControl size="large" /></div>

      <button type="button" className="ctl viz__close" onClick={onClose} title="Exit fullscreen (Esc)" aria-label="Exit fullscreen">
        <Icon name="collapse" size={18} />
      </button>
    </div>
  );
}
