import { usePlayer } from '../state/player';
import { Icon } from './Icon';

/**
 * Mute button and slider.
 *
 * Shared by the player bar and the fullscreen screen rather than written twice: the icon
 * thresholds and the wheel step are the sort of thing that drifts apart the moment there
 * are two copies, and then the same control behaves differently depending on where you
 * found it.
 *
 * The perceptual curve lives in the engine, not here — this is slider travel, 0 to 1.
 */
export function VolumeControl({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const nudgeVolume = usePlayer((s) => s.nudgeVolume);

  const level = muted ? 0 : volume;
  const icon = level === 0 ? 'volumeMuted' : level < 0.5 ? 'volumeLow' : 'volume';

  return (
    <div
      className={`volume ${size === 'large' ? 'volume--large' : ''}`}
      // Scrolling over a volume control is the one gesture everyone tries first.
      onWheel={(e) => nudgeVolume(e.deltaY < 0 ? 0.05 : -0.05)}
    >
      <button type="button" className="ctl" onClick={toggleMute} title="Mute (M)" aria-label="Mute">
        <Icon name={icon} size={size === 'large' ? 20 : 18} />
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
