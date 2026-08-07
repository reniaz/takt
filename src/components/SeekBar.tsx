import { useEffect, useRef, useState } from 'react';

import { formatTime, parseTimeInput } from '../audio/time';
import { useWaveform } from '../audio/useWaveform';
import { usePlayer } from '../state/player';
import { Waveform } from './Waveform';

/**
 * Position readout, scrub bar, and duration.
 *
 * While dragging, the bar shows the dragged value rather than the element's — otherwise
 * every `timeupdate` during the drag yanks the handle back to where playback actually is,
 * and the control fights the pointer.
 */
export function SeekBar() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const trackId = usePlayer((s) => s.queue[s.index]);

  const peaks = useWaveform(trackId);

  const [dragging, setDragging] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  const shown = dragging ?? position;
  const max = duration || 0;

  return (
    <div className="seek">
      {editing ? (
        <TimeInput
          position={position}
          duration={duration}
          onCommit={(value) => { seek(value); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          className="seek__time seek__time--editable"
          onClick={() => hasTrack && setEditing(true)}
          title="Click to type a position"
          disabled={!hasTrack}
        >
          {formatTime(shown)}
        </button>
      )}

      {/*
        The waveform sits behind the range input rather than replacing it. The input stays
        the control — keyboard, screen readers and drag all keep working — and the drawing
        is decoration layered under it.
      */}
      <div className={`seek__track ${peaks ? 'seek__track--wave' : ''}`}>
        {peaks && <Waveform peaks={peaks} progress={max ? Math.min(shown, max) / max : 0} />}

        <input
          className="seek__range"
          type="range"
          min={0}
          max={max || 1}
          step={0.1}
          value={Math.min(shown, max || 1)}
          disabled={!hasTrack || !max}
          aria-label="Seek"
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={() => {
            if (dragging !== undefined) seek(dragging);
            setDragging(undefined);
          }}
          onKeyUp={() => {
            if (dragging !== undefined) seek(dragging);
            setDragging(undefined);
          }}
          style={{ '--progress': `${max ? (Math.min(shown, max) / max) * 100 : 0}%` } as React.CSSProperties}
        />
      </div>

      <span className="seek__time seek__time--total">{formatTime(max)}</span>
    </div>
  );
}

/**
 * The direct-entry field.
 *
 * Accepts `83`, `1:23`, `1:02:03` and relative `+15` / `-30`. Unparseable input leaves the
 * position alone instead of seeking to NaN, which would put the element into a permanently
 * broken state that only reloading the track clears.
 */
function TimeInput({
  position,
  duration,
  onCommit,
  onCancel,
}: {
  position: number;
  duration: number;
  onCommit: (value: number) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState(() => formatTime(position));

  useEffect(() => {
    ref.current?.select();
  }, []);

  const commit = () => {
    const value = parseTimeInput(raw, position, duration);
    if (value === undefined) onCancel();
    else onCommit(value);
  };

  return (
    <input
      ref={ref}
      className="seek__time seek__input"
      value={raw}
      aria-label="Jump to position"
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onCancel();
        // The global shortcuts treat arrows as seek and space as play/pause. While this
        // field has focus they belong to the text cursor.
        e.stopPropagation();
      }}
    />
  );
}
