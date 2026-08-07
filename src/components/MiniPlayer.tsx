import { useEffect, useState } from 'react';

import { formatTime } from '../audio/time';
import { useTheme } from '../themes/useTheme';
import { Icon } from './Icon';

import type { PlayerState } from '../../electron/preload';

/**
 * The compact always-on-top window.
 *
 * Renders what it is told and sends commands back; it never touches the audio engine. Two
 * windows each with their own `<audio>` would play the same track twice, a fraction of a
 * second apart, which sounds like a broken file rather than a bug in a window.
 */
export function MiniPlayer() {
  const [state, setState] = useState<PlayerState | undefined>(undefined);

  // The theme is stored per-machine, not per-window, so this picks up the same one.
  useTheme();

  useEffect(() => {
    // It has missed every update sent before it opened.
    void window.takt.currentState().then(setState);
    window.takt.signalReady();
    return window.takt.onPlayerState(setState);
  }, []);

  const track = state ?? {
    title: 'Nothing playing', artist: '', album: '', artwork: '',
    isPlaying: false, canPlay: false, position: 0, duration: 0,
  };

  const progress = track.duration ? (track.position / track.duration) * 100 : 0;

  return (
    <div className="mini">
      {/* The whole window drags, except the controls. Double-click returns to the app. */}
      <div className="mini__art" title="Double-click to show Takt" onDoubleClick={() => window.takt.showMain()}>
        {track.artwork
          ? <img src={track.artwork} alt="" />
          : <Icon name="music" size={20} />}
      </div>

      <div className="mini__body">
        {/*
          Close sits on the title's line rather than in a column of its own. Given its own
          column it aligned to the top of the window instead of to anything inside it,
          which read as a control someone had forgotten to place.
        */}
        <div className="mini__top">
          <div className="mini__title" title={track.title}>{track.title}</div>
          <button
            type="button"
            className="ctl mini__close"
            onClick={() => window.takt.closeMini()}
            title="Close"
            aria-label="Close mini player"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="mini__artist">{track.artist || ' '}</div>

        <div className="mini__transport">
          <button
            type="button"
            className="ctl"
            disabled={!track.canPlay}
            onClick={() => window.takt.sendCommand('previous')}
            aria-label="Previous"
          >
            <Icon name="previous" size={16} />
          </button>
          <button
            type="button"
            className="ctl ctl--primary"
            disabled={!track.canPlay}
            onClick={() => window.takt.sendCommand('toggle')}
            aria-label={track.isPlaying ? 'Pause' : 'Play'}
          >
            <Icon name={track.isPlaying ? 'pause' : 'play'} size={15} />
          </button>
          <button
            type="button"
            className="ctl"
            disabled={!track.canPlay}
            onClick={() => window.takt.sendCommand('next')}
            aria-label="Next"
          >
            <Icon name="next" size={16} />
          </button>

          <span className="mini__time">
            {formatTime(track.position)} / {formatTime(track.duration)}
          </span>
        </div>
      </div>

      {/* Progress as a hairline along the bottom edge: readable at a glance, no height. */}
      <div className="mini__progress" style={{ width: `${progress}%` }} />
    </div>
  );
}
