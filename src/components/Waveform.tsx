import { useMemo } from 'react';

/**
 * The waveform behind the seek bar.
 *
 * Drawn as two copies of one path — the whole track, and the same path clipped to how far
 * in you are. Clipping rather than drawing two different shapes means the played and
 * unplayed halves can never disagree about where a peak is, and the progress update is a
 * single rect width rather than a rebuilt path.
 */

const HEIGHT = 32;

export function Waveform({ peaks, progress }: { peaks: Uint8Array; progress: number }) {
  const id = useMemo(() => `wave-${Math.random().toString(36).slice(2)}`, []);

  const path = useMemo(() => {
    const width = peaks.length;
    const mid = HEIGHT / 2;
    const parts: string[] = [];

    for (let i = 0; i < width; i += 1) {
      // A floor of one pixel: silence is still part of the track, and a gap in the middle
      // of the bar reads as a rendering fault rather than as a quiet passage.
      const height = Math.max(1, ((peaks[i] as number) / 255) * (HEIGHT - 2));
      parts.push(`M${i} ${mid - height / 2}V${mid + height / 2}`);
    }

    return parts.join('');
  }, [peaks]);

  return (
    <svg
      className="wave"
      viewBox={`0 0 ${peaks.length} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" height={HEIGHT} width={peaks.length * Math.min(1, Math.max(0, progress))} />
        </clipPath>
      </defs>

      <path className="wave__rest" d={path} />
      <path className="wave__played" d={path} clipPath={`url(#${id})`} />
    </svg>
  );
}
