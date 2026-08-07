import { useEffect } from 'react';

import { currentTrack, usePlayer } from './player';

/**
 * Publishes what is playing to main, and obeys commands sent back.
 *
 * Only the main window runs this. It owns the audio element, so it is the only place that
 * knows the truth and the only place that can act on it — the mini player, the tray and
 * the taskbar buttons all go through here.
 *
 * The position is deliberately coarse. It changes several times a second, and every update
 * crosses a process boundary and rebuilds a tray menu; one second is as much precision as
 * any of those surfaces can show.
 */
export function usePublishState() {
  const index = usePlayer((s) => s.index);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const duration = usePlayer((s) => s.duration);
  const second = Math.floor(usePlayer((s) => s.position));

  useEffect(() => {
    const track = currentTrack();

    window.takt.publishState({
      title: track?.title ?? 'Nothing playing',
      artist: track?.artist ?? '',
      album: track?.album ?? '',
      artwork: track?.artwork ? `takt://art/${track.artwork}` : '',
      isPlaying,
      canPlay: Boolean(track),
      position: second,
      duration,
    });
  }, [index, isPlaying, duration, second]);

  useEffect(() => window.takt.onCommand((command) => {
    const player = usePlayer.getState();

    switch (command) {
      case 'toggle': player.toggle(); break;
      case 'next': player.next(true); break;
      case 'previous': player.previous(); break;
      case 'stop': player.pauseNow(); break;
    }
  }), []);
}
