import { currentTrack, usePlayer } from '../state/player';
import { Icon } from './Icon';
import { SeekBar } from './SeekBar';
import { SleepTimer } from './SleepTimer';

export function PlayerBar({
  onToggleQueue,
  onToggleEq,
  queueOpen,
  eqOpen,
}: {
  onToggleQueue: () => void;
  onToggleEq: () => void;
  queueOpen: boolean;
  eqOpen: boolean;
}) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const error = usePlayer((s) => s.error);
  const hasQueue = usePlayer((s) => s.queue.length > 0);

  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);

  // Subscribing to the whole map would re-render on every metadata write; the index and
  // queue identity are what actually change the displayed track.
  usePlayer((s) => s.index);
  const track = currentTrack();

  return (
    <footer className="player">
      <div className="player__now">
        <div className="player__art">
          {track?.artwork
            ? <img src={`takt://art/${track.artwork}`} alt="" />
            : <Icon name="music" size={22} />}
        </div>
        <div className="player__meta">
          <div className="player__title" title={track?.path}>
            {track?.title ?? 'Nothing playing'}
          </div>
          <div className="player__artist">
            {error ? <span className="player__error">{error}</span> : (track?.artist ?? '')}
          </div>
        </div>
      </div>

      <div className="player__center">
        <div className="player__transport">
          <button
            type="button"
            className={`ctl ${shuffle ? 'ctl--on' : ''}`}
            onClick={toggleShuffle}
            title="Shuffle (S)"
            aria-pressed={shuffle}
          >
            <Icon name="shuffle" size={18} />
          </button>

          <button type="button" className="ctl" onClick={previous} disabled={!hasQueue} title="Previous (Ctrl+Left)">
            <Icon name="previous" size={20} />
          </button>

          <button
            type="button"
            className="ctl ctl--primary"
            onClick={toggle}
            disabled={!hasQueue}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
          </button>

          <button type="button" className="ctl" onClick={() => next(true)} disabled={!hasQueue} title="Next (Ctrl+Right)">
            <Icon name="next" size={20} />
          </button>

          <button
            type="button"
            className={`ctl ${repeat !== 'off' ? 'ctl--on' : ''}`}
            onClick={cycleRepeat}
            title={`Repeat: ${repeat} (R)`}
          >
            <Icon name="repeat" size={18} />
            {repeat === 'track' && <span className="ctl__badge">1</span>}
          </button>
        </div>

        <SeekBar />
      </div>

      <div className="player__right">
        <button
          type="button"
          className={`ctl ${eqOpen ? 'ctl--on' : ''}`}
          onClick={onToggleEq}
          title="Equalizer"
          aria-pressed={eqOpen}
        >
          <Icon name="equalizer" size={18} />
        </button>

        <button
          type="button"
          className="ctl"
          onClick={() => void window.takt.toggleMini()}
          title="Mini player"
          aria-label="Mini player"
        >
          <Icon name="mini" size={17} />
        </button>

        <SleepTimer />

        <VolumeControl />

        <button
          type="button"
          className={`ctl ${queueOpen ? 'ctl--on' : ''}`}
          onClick={onToggleQueue}
          title="Queue (Ctrl+Q)"
          aria-pressed={queueOpen}
        >
          <Icon name="queue" size={18} />
        </button>
      </div>
    </footer>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const nudgeVolume = usePlayer((s) => s.nudgeVolume);

  const level = muted ? 0 : volume;
  const icon = level === 0 ? 'volumeMuted' : level < 0.5 ? 'volumeLow' : 'volume';

  return (
    <div
      className="volume"
      // Scrolling over a volume control is the one gesture everyone tries first.
      onWheel={(e) => nudgeVolume(e.deltaY < 0 ? 0.05 : -0.05)}
    >
      <button type="button" className="ctl" onClick={toggleMute} title="Mute (M)">
        <Icon name={icon} size={18} />
      </button>
      <input
        className="volume__range"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        aria-label="Volume"
        onChange={(e) => setVolume(Number(e.target.value))}
        style={{ '--progress': `${level * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}
