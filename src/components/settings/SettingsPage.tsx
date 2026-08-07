import { useState } from 'react';

import { autoPreamp, BANDS, FLAT, MAX_GAIN_DB, PRESETS } from '../../audio/eq';
import { usePlayer } from '../../state/player';
import { THEMES } from '../../themes/themes';
import { EqCurve } from '../EqCurve';
import { Icon } from '../Icon';
import { VersionFooter } from './VersionFooter';

export function SettingsPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings">
      <div className="settings__head">
        <button type="button" className="ctl" onClick={onClose} aria-label="Back" title="Back">
          <Icon name="back" size={18} />
        </button>
        <h1>Settings</h1>
      </div>

      <div className="settings__body">
        <Appearance />
        <Playback />
        <EqualizerSettings />
        <VersionFooter />
      </div>
    </div>
  );
}

/* ---------- appearance ---------- */

function Appearance() {
  const themeId = usePlayer((s) => s.themeId);
  const brightness = usePlayer((s) => s.brightness);
  const setTheme = usePlayer((s) => s.setTheme);
  const setBrightness = usePlayer((s) => s.setBrightness);

  return (
    <section className="settings__section">
      <h2>Appearance</h2>
      <p className="settings__note">
        A theme is eleven colours; hover states, tints and the colour of a glyph on the
        accent are derived from them. The file format is shared with Draht, so a theme
        written for either works in both.
      </p>

      <div className="themecards">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`themecard ${theme.id === themeId ? 'themecard--active' : ''}`}
            onClick={() => setTheme(theme.id)}
            aria-pressed={theme.id === themeId}
          >
            {/* The seed is its own preview — the real background, panel and accent. */}
            <span className="themecard__preview" style={{ background: theme.seed.background }}>
              <span style={{ background: theme.seed.surface }} />
              <span style={{ background: theme.seed.raised }} />
              <span className="themecard__accent" style={{ background: theme.seed.accent }} />
            </span>
            <span className="themecard__label">
              {theme.label}
              {theme.id === themeId && <Icon name="check" size={13} />}
            </span>
          </button>
        ))}
      </div>

      <Row
        label="Brightness"
        hint="Lifts every colour in the theme toward white. One dial instead of eleven edits."
        value={`+${Math.round(brightness * 100)}%`}
      >
        <input
          type="range"
          min={0}
          max={0.4}
          step={0.01}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          style={{ '--progress': `${(brightness / 0.4) * 100}%` } as React.CSSProperties}
        />
      </Row>

      <p className="settings__note">
        Custom themes: drop a JSON file into <code>%APPDATA%\Takt\themes\</code>.
      </p>
    </section>
  );
}

/* ---------- playback ---------- */

function Playback() {
  const mode = usePlayer((s) => s.replayGain);
  const preamp = usePlayer((s) => s.replayGainPreamp);
  const untagged = usePlayer((s) => s.replayGainUntagged);
  const setMode = usePlayer((s) => s.setReplayGain);
  const setPreamp = usePlayer((s) => s.setReplayGainPreamp);
  const setUntagged = usePlayer((s) => s.setReplayGainUntagged);
  const gapless = usePlayer((s) => s.gapless);
  const crossfade = usePlayer((s) => s.crossfade);
  const setGapless = usePlayer((s) => s.setGapless);
  const setCrossfade = usePlayer((s) => s.setCrossfade);

  return (
    <section className="settings__section">
      <h2>Playback</h2>

      <Row
        label="Gapless playback"
        hint="Buffers the next track while the current one is still playing, so albums recorded to run continuously do so. MP3 keeps a few milliseconds of encoder padding; FLAC, Opus and WAV are seamless."
      >
        <label className="settings__switch settings__switch--inline">
          <input type="checkbox" checked={gapless} onChange={(e) => setGapless(e.target.checked)} />
          <span>{gapless ? 'On' : 'Off'}</span>
        </label>
      </Row>

      <Row
        label="Crossfade"
        hint="Overlaps the end of one track with the start of the next. Right for shuffled listening, wrong for a continuous album — leave it at zero for pure gapless."
        value={crossfade === 0 ? 'Off' : `${crossfade.toFixed(1)} s`}
      >
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={crossfade}
          aria-label="Crossfade seconds"
          onChange={(e) => setCrossfade(Number(e.target.value))}
          style={{ '--progress': `${(crossfade / 12) * 100}%` } as React.CSSProperties}
        />
      </Row>

      <h3>Volume normalization</h3>
      <p className="settings__note">
        Volume normalization uses the ReplayGain tags already in your files, so a quiet
        master and a loud one play at the same perceived level without touching the volume
        control. Nothing is analysed or written — untagged files are left alone apart from
        the offset below.
      </p>

      <Row
        label="Volume normalization"
        hint="Album mode keeps the relative levels within a record intact, which matters for anything mixed to be heard in order. Track mode levels every song against every other."
      >
        <div className="segmented">
          {(['off', 'track', 'album'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? 'is-on' : ''}
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
            >
              {option === 'off' ? 'Off' : option === 'track' ? 'Track' : 'Album'}
            </button>
          ))}
        </div>
      </Row>

      <Row
        label="Preamp"
        hint="Applied on top of the tagged gain. ReplayGain targets a fairly quiet reference level, so a few dB here is normal."
        value={`${preamp > 0 ? '+' : ''}${preamp.toFixed(1)} dB`}
      >
        <input
          type="range"
          min={-12}
          max={12}
          step={0.5}
          value={preamp}
          disabled={mode === 'off'}
          aria-label="ReplayGain preamp"
          onChange={(e) => setPreamp(Number(e.target.value))}
          style={{ '--progress': `${((preamp + 12) / 24) * 100}%` } as React.CSSProperties}
        />
      </Row>

      <Row
        label="Untagged files"
        hint="What to apply to files with no ReplayGain tags. Leaving them at 0 while everything else is pulled down makes them the loudest thing you own."
        value={`${untagged > 0 ? '+' : ''}${untagged.toFixed(1)} dB`}
      >
        <input
          type="range"
          min={-12}
          max={12}
          step={0.5}
          value={untagged}
          disabled={mode === 'off'}
          aria-label="Gain for untagged files"
          onChange={(e) => setUntagged(Number(e.target.value))}
          style={{ '--progress': `${((untagged + 12) / 24) * 100}%` } as React.CSSProperties}
        />
      </Row>
    </section>
  );
}

/* ---------- equalizer ---------- */

function EqualizerSettings() {
  const enabled = usePlayer((s) => s.eqEnabled);
  const gains = usePlayer((s) => s.eqGains);
  const custom = usePlayer((s) => s.customPresets);
  const auto = usePlayer((s) => s.eqPreampAuto);
  const manual = usePlayer((s) => s.eqPreamp);

  const setEnabled = usePlayer((s) => s.setEqEnabled);
  const setGains = usePlayer((s) => s.setEqGains);
  const setPreamp = usePlayer((s) => s.setEqPreamp);
  const setPreampAuto = usePlayer((s) => s.setEqPreampAuto);
  const savePreset = usePlayer((s) => s.saveEqPreset);
  const deletePreset = usePlayer((s) => s.deleteEqPreset);

  const [name, setName] = useState('');

  const all = [...PRESETS, ...custom];
  const active = all.find((p) => p.gains.length === gains.length && p.gains.every((g, i) => g === gains[i]));
  const effective = auto ? autoPreamp(gains) : manual;

  const setBand = (i: number, value: number) => {
    const next = [...gains];
    next[i] = Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, value));
    setGains(next);
  };

  return (
    <section className="settings__section">
      <h2>Equalizer</h2>

      <label className="settings__switch">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Enable the equalizer</span>
      </label>

      <p className="settings__note">
        Drag anywhere on the curve to shape it — dragging sideways keeps setting whichever
        band is under the pointer, so a whole curve is one stroke. Double-click a band to
        reset it, hold <kbd>Shift</kbd> for fine steps, or type an exact value below. The
        line is the real combined response, so overlapping bands show their true sum rather
        than a smooth lie.
      </p>

      <EqCurve gains={gains} onChange={setGains} disabled={!enabled} height={230} labels />

      <div className={`bandfields ${enabled ? '' : 'bandfields--off'}`}>
        {BANDS.map((band, i) => (
          <label key={band.frequency} className="bandfield">
            <span>{band.label}</span>
            <input
              type="number"
              min={-MAX_GAIN_DB}
              max={MAX_GAIN_DB}
              step={0.5}
              value={gains[i] ?? 0}
              disabled={!enabled}
              aria-label={`${band.label} hertz gain in decibels`}
              onChange={(e) => setBand(i, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <Row
        label="Preamp"
        hint={
          'Boosting a band raises the peak level, and most masters have no headroom left to '
          + 'absorb it — the result is clipping that sounds like the equalizer is broken. '
          + 'Auto backs off by the largest boost.'
        }
        value={`${effective > 0 ? '+' : ''}${effective.toFixed(1)} dB`}
      >
        <div className="preamp">
          <label className="settings__switch settings__switch--inline">
            <input type="checkbox" checked={auto} onChange={(e) => setPreampAuto(e.target.checked)} />
            <span>Auto</span>
          </label>
          <input
            type="range"
            min={-24}
            max={12}
            step={0.5}
            value={effective}
            disabled={auto || !enabled}
            aria-label="Preamp in decibels"
            onChange={(e) => setPreamp(Number(e.target.value))}
            style={{ '--progress': `${((effective + 24) / 36) * 100}%` } as React.CSSProperties}
          />
        </div>
      </Row>

      <h3>Presets</h3>
      <div className="presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`chip ${active?.id === preset.id ? 'chip--active' : ''}`}
            onClick={() => setGains(preset.gains)}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setGains(FLAT)}>
          <Icon name="reset" size={13} /> Reset
        </button>
      </div>

      {custom.length > 0 && (
        <>
          <h3>Saved</h3>
          <div className="presets">
            {custom.map((preset) => (
              <span key={preset.id} className={`chip chip--saved ${active?.id === preset.id ? 'chip--active' : ''}`}>
                <button type="button" onClick={() => setGains(preset.gains)}>{preset.label}</button>
                <button
                  type="button"
                  className="chip__remove"
                  onClick={() => deletePreset(preset.id)}
                  aria-label={`Delete ${preset.label}`}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      <form
        className="savepreset"
        onSubmit={(e) => {
          e.preventDefault();
          savePreset(name);
          setName('');
        }}
      >
        <input
          value={name}
          placeholder="Name this curve…"
          aria-label="Preset name"
          onChange={(e) => setName(e.target.value)}
          // Space is play/pause everywhere else in the window.
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button type="submit" className="btn" disabled={!name.trim()}>
          <Icon name="plus" size={14} />
          Save preset
        </button>
      </form>
    </section>
  );
}

/* ---------- shared ---------- */

function Row({
  label,
  hint,
  value,
  children,
}: {
  label: string;
  hint?: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settingrow">
      <div className="settingrow__text">
        <div className="settingrow__label">
          {label}
          {value && <span className="settingrow__value">{value}</span>}
        </div>
        {hint && <div className="settingrow__hint">{hint}</div>}
      </div>
      <div className="settingrow__control">{children}</div>
    </div>
  );
}
