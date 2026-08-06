import { useEffect } from 'react';

import { currentTrack, engine, usePlayer } from './player';

/**
 * Publishes what is playing to the OS.
 *
 * Chromium maps `navigator.mediaSession` onto the Windows System Media Transport Controls,
 * so this one API gets the Win11 volume-flyout card, the lockscreen entry, and hardware
 * media keys while the app has focus — with no native module and no globalShortcut, which
 * would take those keys away from every other app on the machine.
 */
export function useMediaSession() {
  const index = usePlayer((s) => s.index);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const duration = usePlayer((s) => s.duration);
  const position = usePlayer((s) => s.position);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const track = currentTrack();
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      artwork: track.artwork
        ? [{ src: `takt://art/${track.artwork}`, sizes: '512x512' }]
        : [],
    });
  }, [index]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const player = usePlayer.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void engine.play()],
      ['pause', () => engine.pause()],
      ['nexttrack', () => player.next(true)],
      ['previoustrack', () => player.previous()],
      ['seekto', (details) => {
        if (details.seekTime !== undefined) player.seek(details.seekTime);
      }],
      ['seekbackward', (details) => player.seek(engine.position - (details.seekOffset ?? 10))],
      ['seekforward', (details) => player.seek(engine.position + (details.seekOffset ?? 10))],
      ['stop', () => engine.pause()],
    ];

    for (const [action, handler] of handlers) {
      // Not every action exists in every Chromium build; an unknown one throws rather
      // than being ignored, and would take the rest of the list down with it.
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* unsupported action */
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* unsupported action */
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!duration) return;

    // Drives the scrubber in the OS overlay. Guarded because a position past the duration
    // — which happens for a frame at track end — throws.
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate: 1,
      });
    } catch {
      /* transient out-of-range position */
    }
  }, [duration, position]);
}
