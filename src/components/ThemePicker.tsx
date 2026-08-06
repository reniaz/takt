import { usePlayer } from '../state/player';
import { THEMES } from '../themes/themes';
import { Icon } from './Icon';

export function ThemePicker() {
  const themeId = usePlayer((s) => s.themeId);
  const brightness = usePlayer((s) => s.brightness);
  const setTheme = usePlayer((s) => s.setTheme);
  const setBrightness = usePlayer((s) => s.setBrightness);

  return (
    <div className="sidebar__section themes">
      <div className="sidebar__label">
        <Icon name="palette" size={13} />
        <span>Theme</span>
      </div>

      <div className="themes__grid">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`swatch ${theme.id === themeId ? 'swatch--active' : ''}`}
            onClick={() => setTheme(theme.id)}
            title={theme.label}
            aria-label={theme.label}
            aria-pressed={theme.id === themeId}
          >
            {/* The seed itself is the preview — background, panel, accent, in that order. */}
            <span style={{ background: theme.seed.background }} />
            <span style={{ background: theme.seed.surface }} />
            <span style={{ background: theme.seed.accent }} />
          </button>
        ))}
      </div>

      <label className="themes__brightness">
        <span>Brightness</span>
        <input
          type="range"
          min={0}
          max={0.4}
          step={0.01}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          style={{ '--progress': `${(brightness / 0.4) * 100}%` } as React.CSSProperties}
        />
      </label>
    </div>
  );
}
