import { autoPreamp, BANDS, MAX_GAIN_DB, PRESETS } from '../audio/eq';
import { usePlayer } from '../state/player';
import { Icon } from './Icon';

export function Equalizer({ onClose }: { onClose: () => void }) {
  const enabled = usePlayer((s) => s.eqEnabled);
  const gains = usePlayer((s) => s.eqGains);
  const setEnabled = usePlayer((s) => s.setEqEnabled);
  const setGains = usePlayer((s) => s.setEqGains);

  const setBand = (i: number, value: number) => {
    const next = [...gains];
    next[i] = value;
    setGains(next);
  };

  const activePreset = PRESETS.find((p) => p.gains.every((g, i) => g === gains[i]));

  return (
    <div className="eq">
      <div className="eq__head">
        <label className="eq__toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Equalizer</span>
        </label>

        <select
          className="eq__preset"
          value={activePreset?.id ?? 'custom'}
          onChange={(e) => {
            const preset = PRESETS.find((p) => p.id === e.target.value);
            if (preset) setGains(preset.gains);
          }}
        >
          {!activePreset && <option value="custom">Custom</option>}
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>

        <button type="button" className="ctl" onClick={onClose} title="Close" aria-label="Close equalizer">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className={`eq__bands ${enabled ? '' : 'eq__bands--off'}`}>
        {BANDS.map((band, i) => (
          <div className="eq__band" key={band.frequency}>
            <span className="eq__db">{(gains[i] ?? 0) > 0 ? `+${gains[i]}` : gains[i] ?? 0}</span>
            <input
              className="eq__slider"
              type="range"
              min={-MAX_GAIN_DB}
              max={MAX_GAIN_DB}
              step={1}
              value={gains[i] ?? 0}
              disabled={!enabled}
              aria-label={`${band.label} hertz`}
              onChange={(e) => setBand(i, Number(e.target.value))}
              onDoubleClick={() => setBand(i, 0)}
            />
            <span className="eq__hz">{band.label}</span>
          </div>
        ))}
      </div>

      <div className="eq__foot">
        {/*
          Shown rather than hidden: a boost that is silently compensated looks like the
          slider "did nothing", and the number explains where the level went.
        */}
        <span>Preamp {autoPreamp(gains)} dB</span>
        <span className="eq__hint">Double-click a slider to reset it</span>
      </div>
    </div>
  );
}
