import { useEffect, useMemo, useRef, useState } from 'react';

import { BANDS, MAX_GAIN_DB } from '../audio/eq';
import { probeFrequencies, responseDb } from '../audio/response';

/**
 * The equalizer, as a curve you draw on.
 *
 * Ten vertical sliders are a faithful picture of the filter chain and a bad way to shape a
 * sound: each one has to be found, grabbed and dragged on its own, so building a curve
 * means ten separate gestures and no view of the result until the last one lands.
 *
 * Here the whole surface is the control. Pressing anywhere sets the nearest band, and
 * dragging sideways keeps setting whichever band is under the pointer — so a curve is one
 * stroke. The line behind the handles is the real combined response, not an interpolation
 * of the handle positions, which is what makes overlapping bands legible.
 */

const MIN_HZ = 20;
const MAX_HZ = 22000;
const PROBES = 160;

/** Gains snap to this, or to a tenth of it while Shift is held. */
const STEP = 0.5;
const FINE_STEP = 0.1;

const GRID_DB = [-12, -6, 0, 6, 12];
const GRID_HZ = [100, 1000, 10000];

type Props = {
  gains: readonly number[];
  onChange: (gains: number[]) => void;
  disabled?: boolean;
  height?: number;
  /** Frequency and dB axis labels. Off in the compact popover, on in settings. */
  labels?: boolean;
};

function toX(hz: number) {
  return Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
}

function snap(value: number, fine: boolean) {
  const step = fine ? FINE_STEP : STEP;
  return Math.round(value / step) * step;
}

export function EqCurve({ gains, onChange, disabled = false, height = 150, labels = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<number | undefined>(undefined);

  // Viewport units. The SVG scales to its container, so these are just a coordinate space.
  const W = 1000;
  const H = 300;
  const padY = 18;

  const frequencies = useMemo(() => probeFrequencies(PROBES, MIN_HZ, MAX_HZ), []);
  const curve = useMemo(() => responseDb(gains, frequencies), [gains, frequencies]);

  const dbToY = (db: number) => padY + ((MAX_GAIN_DB - db) / (MAX_GAIN_DB * 2)) * (H - padY * 2);
  const yToDb = (y: number) => MAX_GAIN_DB - ((y - padY) / (H - padY * 2)) * (MAX_GAIN_DB * 2);
  const hzToX = (hz: number) => toX(hz) * W;

  const bandX = useMemo(() => BANDS.map((b) => hzToX(b.frequency)), []);

  const path = useMemo(() => {
    const points = Array.from(curve, (db, i) => {
      const x = (i / (PROBES - 1)) * W;
      return `${x.toFixed(1)},${dbToY(Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, db))).toFixed(1)}`;
    });
    return `M${points.join('L')}`;
  }, [curve]);

  /** Which band a pointer at this position is acting on. */
  const bandAt = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;

    const x = ((clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;

    bandX.forEach((bx, i) => {
      const distance = Math.abs(bx - x);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });

    return nearest;
  };

  const gainAt = (clientY: number, fine: boolean) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;

    const y = ((clientY - rect.top) / rect.height) * H;
    return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, snap(yToDb(y), fine)));
  };

  const apply = (event: { clientX: number; clientY: number; shiftKey: boolean }) => {
    const index = bandAt(event.clientX);
    const value = gainAt(event.clientY, event.shiftKey);
    if (gains[index] === value) return;

    const next = [...gains];
    next[index] = value;
    onChange(next);
  };

  /*
   * Tracked on the window, not on the SVG.
   *
   * A drag that leaves the element still belongs to the control — releasing outside it
   * would otherwise never be seen, and the curve would keep following the pointer after
   * the button was let go.
   */
  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (e: PointerEvent) => apply(e);
    const onUp = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, gains]);

  const nudge = (index: number, delta: number) => {
    const next = [...gains];
    next[index] = Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, (gains[index] ?? 0) + delta));
    onChange(next);
  };

  return (
    <div className={`eqcurve ${disabled ? 'eqcurve--disabled' : ''}`} style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="group"
        aria-label="Equalizer curve"
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
          apply(e);
        }}
        onPointerMove={(e) => !dragging && setHovered(bandAt(e.clientX))}
        onPointerLeave={() => setHovered(undefined)}
        onDoubleClick={(e) => {
          if (disabled) return;
          const next = [...gains];
          next[bandAt(e.clientX)] = 0;
          onChange(next);
        }}
      >
        {GRID_DB.map((db) => (
          <line
            key={db}
            className={db === 0 ? 'eqcurve__zero' : 'eqcurve__grid'}
            x1={0}
            x2={W}
            y1={dbToY(db)}
            y2={dbToY(db)}
          />
        ))}

        {GRID_HZ.map((hz) => (
          <line key={hz} className="eqcurve__grid" x1={hzToX(hz)} x2={hzToX(hz)} y1={padY} y2={H - padY} />
        ))}

        {/* Filled to the zero line, so cut and boost read as opposite rather than as one wavy line. */}
        <path className="eqcurve__fill" d={`${path}L${W},${dbToY(0)}L0,${dbToY(0)}Z`} />
        <path className="eqcurve__line" d={path} />

        {BANDS.map((band, i) => {
          const gain = gains[i] ?? 0;
          const active = hovered === i;

          return (
            <g key={band.frequency} className={`eqcurve__handle ${active ? 'is-active' : ''}`}>
              <line className="eqcurve__stem" x1={bandX[i]} x2={bandX[i]} y1={dbToY(0)} y2={dbToY(gain)} />
              {/*
                Small on purpose. The dot marks where a band sits; it is not the target —
                the whole surface is, and the invisible hit circle below is 22 units wide.
                A large dot only covers the curve it is supposed to annotate.
              */}
              <circle cx={bandX[i]} cy={dbToY(gain)} r={active ? 6 : 4.5} />
              {/*
                A focusable, keyboard-operable proxy for each handle. The pointer path never
                touches it; it exists so the control is reachable without a mouse, which a
                bare <svg> with pointer handlers is not.
              */}
              <circle
                className="eqcurve__hit"
                cx={bandX[i]}
                cy={dbToY(gain)}
                r={22}
                tabIndex={disabled ? -1 : 0}
                role="slider"
                aria-label={`${band.label} hertz`}
                aria-valuemin={-MAX_GAIN_DB}
                aria-valuemax={MAX_GAIN_DB}
                aria-valuenow={gain}
                aria-valuetext={`${gain > 0 ? '+' : ''}${gain} decibels`}
                onKeyDown={(e) => {
                  if (disabled) return;
                  const step = e.shiftKey ? FINE_STEP : STEP;
                  if (e.key === 'ArrowUp') { e.preventDefault(); nudge(i, step); }
                  else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(i, -step); }
                  else if (e.key === 'Home' || e.key === '0') { e.preventDefault(); nudge(i, -gain); }
                }}
              />
            </g>
          );
        })}
      </svg>

      {labels && (
        <div className="eqcurve__axis">
          {BANDS.map((band, i) => (
            <span key={band.frequency} style={{ left: `${toX(band.frequency) * 100}%` }}>
              <b>{gains[i] ? `${(gains[i] ?? 0) > 0 ? '+' : ''}${gains[i]}` : '0'}</b>
              {band.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
