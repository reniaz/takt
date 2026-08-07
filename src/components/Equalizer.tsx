import { autoPreamp, FLAT, PRESETS } from '../audio/eq';
import { usePlayer } from '../state/player';
import { EqCurve } from './EqCurve';
import { Icon } from './Icon';

/**
 * The equalizer in its compact form, over the player bar.
 *
 * Everything needed while listening — on/off, a preset, and a curve you can reshape by
 * dragging — and nothing that needs reading. Preamp control, saving presets and the wider
 * canvas live in Settings.
 */
export function Equalizer({ onClose }: { onClose: () => void }) {
  const enabled = usePlayer((s) => s.eqEnabled);
  const gains = usePlayer((s) => s.eqGains);
  const custom = usePlayer((s) => s.customPresets);
  const auto = usePlayer((s) => s.eqPreampAuto);
  const manual = usePlayer((s) => s.eqPreamp);
  const setEnabled = usePlayer((s) => s.setEqEnabled);
  const setGains = usePlayer((s) => s.setEqGains);

  const all = [...PRESETS, ...custom];
  const active = all.find((p) => p.gains.every((g, i) => g === gains[i]) && p.gains.length === gains.length);
  const preamp = auto ? autoPreamp(gains) : manual;

  return (
    <div className="eq">
      <div className="eq__head">
        <label className="eq__toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Equalizer</span>
        </label>

        <select
          className="eq__preset"
          value={active?.id ?? 'custom'}
          onChange={(e) => {
            const preset = all.find((p) => p.id === e.target.value);
            if (preset) setGains(preset.gains);
          }}
        >
          {!active && <option value="custom">Custom</option>}
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          {custom.length > 0 && (
            <optgroup label="Saved">
              {custom.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </optgroup>
          )}
        </select>

        <button type="button" className="ctl" onClick={() => setGains(FLAT)} title="Reset to flat" aria-label="Reset equalizer">
          <Icon name="reset" size={15} />
        </button>
        <button type="button" className="ctl" onClick={onClose} title="Close" aria-label="Close equalizer">
          <Icon name="close" size={15} />
        </button>
      </div>

      <EqCurve gains={gains} onChange={setGains} disabled={!enabled} height={140} labels />

      <div className="eq__foot">
        {/*
          Shown rather than hidden: a boost that is silently compensated looks like the
          curve "did nothing", and the number explains where the level went.
        */}
        <span>Preamp {preamp > 0 ? '+' : ''}{preamp.toFixed(1)} dB{auto ? ' (auto)' : ''}</span>
        <span className="eq__hint">Drag across to shape · double-click to reset a band</span>
      </div>
    </div>
  );
}
