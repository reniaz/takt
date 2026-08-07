import { useEffect, useRef } from 'react';

import { engine } from '../state/player';

/**
 * The spectrum, drawn from the analyser already in the audio graph.
 *
 * Canvas rather than SVG or DOM: this redraws sixty times a second, and a few hundred
 * rects reconciled every frame is the one thing React is genuinely bad at.
 */

/** Enough bars to read as a spectrum, few enough that each is a solid shape. */
const BARS = 64;

/**
 * The range worth drawing.
 *
 * An FFT's bins are linear in frequency, so half of them describe 11 kHz and above — where
 * music has almost no energy. Drawn as-is, the right-hand half of any visualizer is a flat
 * line. Mapping bars logarithmically across this range spends the width where the music is.
 */
const MIN_HZ = 30;
const MAX_HZ = 16000;

export function Visualizer({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const analyser = engine.getAnalyser();
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : undefined;

    /*
     * Each bar's slice of the FFT, worked out once.
     *
     * `sampleRate / fftSize` is the width of one bin, so a frequency maps to a bin index by
     * division. Recomputing this per frame would be sixty times the arithmetic for a
     * mapping that only changes if the graph is rebuilt.
     */
    const ranges: [number, number][] = [];
    if (analyser) {
      const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
      const ratio = Math.log(MAX_HZ / MIN_HZ);

      for (let i = 0; i < BARS; i += 1) {
        const from = MIN_HZ * Math.exp((i / BARS) * ratio);
        const to = MIN_HZ * Math.exp(((i + 1) / BARS) * ratio);
        const start = Math.floor(from / hzPerBin);
        ranges.push([start, Math.max(start + 1, Math.floor(to / hzPerBin))]);
      }
    }

    // Smoothed here as well as in the analyser: the analyser smooths each bin over time,
    // this stops a bar snapping down the instant its band goes quiet.
    const heights = new Float32Array(BARS);
    let frame = 0;

    /*
     * Sized from the element's measured box, watched rather than sampled once.
     *
     * Reading `clientWidth` at mount catches the canvas before layout has settled, and the
     * bitmap ends up a different size from the box it is drawn into — which the browser
     * then scales, blurring everything. A ResizeObserver fires after every layout that
     * changes it, including the one that happens on the first frame.
     */
    const resize = () => {
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const height = Math.max(1, Math.floor(canvas.clientHeight * scale));

      // Assigning either dimension clears the canvas, so only do it when it changed.
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      frame = requestAnimationFrame(draw);

      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);

      if (analyser && bins) analyser.getByteFrequencyData(bins);

      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue('--takt-accent').trim() || '#c05f5a';
      const muted = style.getPropertyValue('--takt-raised-hover').trim() || '#434844';

      const gap = Math.max(1, width / BARS / 6);
      const barWidth = width / BARS - gap;
      const floor = Math.max(2, height * 0.006);

      for (let i = 0; i < BARS; i += 1) {
        let level = 0;

        if (bins && ranges[i]) {
          const [start, end] = ranges[i] as [number, number];
          let sum = 0;
          let count = 0;
          for (let b = start; b < end && b < bins.length; b += 1) {
            sum += bins[b] as number;
            count += 1;
          }
          level = count ? sum / count / 255 : 0;
        }

        /*
         * A gentle tilt upward with frequency.
         *
         * Recorded music falls off steeply toward the top, so an untilted spectrum is a
         * ramp down to nothing however lively the track is.
         */
        const tilted = Math.min(1, level * (1 + (i / BARS) * 1.4));

        const previous = heights[i] as number;
        heights[i] = tilted > previous ? tilted : previous * 0.86 + tilted * 0.14;

        const barHeight = Math.max(floor, (heights[i] as number) * height * 0.8);
        const x = i * (barWidth + gap) + gap / 2;

        context.fillStyle = (heights[i] as number) > 0.02 ? accent : muted;
        // Mirrored around the middle, so the shape reads as a waveform rather than as a
        // bar chart growing off the floor.
        context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
      }
    };

    resize();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="viz__canvas" aria-hidden="true" />;
}
