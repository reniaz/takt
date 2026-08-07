import { useEffect } from 'react';

import { formatTime } from '../audio/time';
import { useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { Icon } from './Icon';
import { Visualizer } from './Visualizer';

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
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);

  useEffect(() => {
    window.takt.setFullscreen(true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stopped so the shortcut layer underneath does not also act on it.
      e.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.takt.setFullscreen(false);
    };
  }, [onClose]);

  const progress = duration ? (position / duration) * 100 : 0;

  return (
    <div className="viz">
      <Visualizer active />

      <div className="viz__content">
        <div className="viz__art">
          {track?.artwork
            ? <img src={`takt://art/${track.artwork}`} alt="" />
            : <Icon name="music" size={64} />}
        </div>

        <div className="viz__title">{track?.title ?? 'Nothing playing'}</div>
        <div className="viz__artist">{track?.artist ?? ''}</div>
        {track?.album && <div className="viz__album">{track.album}</div>}

        <div className="viz__bar">
          <span>{formatTime(position)}</span>
          <div className="viz__track"><div style={{ width: `${progress}%` }} /></div>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="viz__controls">
          <button type="button" className="ctl" onClick={previous} aria-label="Previous">
            <Icon name="previous" size={22} />
          </button>
          <button type="button" className="ctl ctl--primary viz__play" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
          </button>
          <button type="button" className="ctl" onClick={() => next(true)} aria-label="Next">
            <Icon name="next" size={22} />
          </button>

          {track && (
            <button
              type="button"
              className={`ctl ${track.favourite ? 'ctl--on' : ''}`}
              aria-pressed={Boolean(track.favourite)}
              aria-label={track.favourite ? 'Remove from favourites' : 'Add to favourites'}
              onClick={() => toggleFavourite([track.id])}
            >
              <Icon name={track.favourite ? 'heartFull' : 'heart'} size={20} />
            </button>
          )}
        </div>
      </div>

      <button type="button" className="ctl viz__close" onClick={onClose} title="Exit fullscreen (Esc)" aria-label="Exit fullscreen">
        <Icon name="collapse" size={18} />
      </button>
    </div>
  );
}
