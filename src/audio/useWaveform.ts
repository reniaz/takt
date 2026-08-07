import { useEffect, useState } from 'react';

import PeaksWorker from './peaks.worker?worker';

/**
 * The peaks for a track's seek bar.
 *
 * Cached in SQLite, so a track revisited draws instantly; computed once otherwise. Only
 * ever for the track being played — precomputing a whole library would spin the CPU for
 * hours to draw pictures nobody has asked to see.
 *
 * Returns `undefined` until peaks exist, which the seek bar renders as a plain line.
 */

/** One per pixel of a seek bar at any realistic width. */
const BUCKETS = 480;

/**
 * Decoding needs an AudioContext, and a worker cannot have one.
 *
 * So the decode happens here and only the reduction is handed off. This context is never
 * connected to anything and never renders; it exists because `decodeAudioData` is a method
 * on a context.
 */
let decoder: OfflineAudioContext | undefined;

function decodeContext() {
  decoder ??= new OfflineAudioContext(1, 1, 48000);
  return decoder;
}

async function computePeaks(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  const encoded = await response.arrayBuffer();
  if (signal.aborted) return undefined;

  const audio = await decodeContext().decodeAudioData(encoded);
  if (signal.aborted) return undefined;

  /*
   * One channel is enough for a shape. Mixing both would double the work and the two are
   * near-identical at this resolution — any difference is far below one pixel.
   */
  const samples = audio.getChannelData(0);
  // Copied because the decoded buffer is not transferable and is still owned by the context.
  const transferable = new Float32Array(samples);

  return new Promise<Uint8Array | undefined>((resolve) => {
    const worker = new PeaksWorker();

    const done = (value: Uint8Array | undefined) => {
      worker.terminate();
      resolve(value);
    };

    worker.onmessage = (event: MessageEvent<Uint8Array>) => done(signal.aborted ? undefined : event.data);
    worker.onerror = () => done(undefined);
    signal.addEventListener('abort', () => done(undefined), { once: true });

    worker.postMessage({ samples: transferable, buckets: BUCKETS }, [transferable.buffer]);
  });
}

export function useWaveform(trackId: string | undefined) {
  const [peaks, setPeaks] = useState<Uint8Array | undefined>(undefined);

  useEffect(() => {
    setPeaks(undefined);
    if (!trackId) return undefined;

    // Aborted when the track changes, so a slow decode cannot land on the wrong seek bar.
    const controller = new AbortController();

    void (async () => {
      const cached = await window.takt.getWaveform(trackId);
      if (controller.signal.aborted) return;

      if (cached?.length) {
        setPeaks(new Uint8Array(cached));
        return;
      }

      try {
        const computed = await computePeaks(`takt://media/${trackId}`, controller.signal);
        if (!computed || controller.signal.aborted) return;

        setPeaks(computed);
        // A copy: the array handed to IPC is structured-cloned, and the state copy must
        // not be detached by it.
        window.takt.putWaveform(trackId, new Uint8Array(computed));
      } catch {
        // An undecodable file still plays through the media element, which has its own
        // decoder. A missing waveform is not worth surfacing.
      }
    })();

    return () => controller.abort();
  }, [trackId]);

  return peaks;
}
