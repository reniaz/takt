import { useEffect } from 'react';

import { engine, usePlayer } from './player';

/**
 * Keyboard control for the whole window.
 *
 * Bound on `window` rather than on a focused container so the shortcuts work wherever the
 * pointer left focus — clicking a track row should not silently disable the space bar.
 * Typing into a field is the one exception, checked per event rather than by tracking
 * focus, which drifts out of sync the moment something is removed while focused.
 */
export function useShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Range inputs are `INPUT`, but arrow keys on a slider are already doing the right
      // thing, and space on one does nothing — so only text-ish fields opt out.
      const isText = typing && !(target instanceof HTMLInputElement && target.type === 'range');
      if (isText) return;

      const player = usePlayer.getState();
      const ctrl = event.ctrlKey || event.metaKey;
      const step = event.shiftKey ? 30 : 5;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          player.toggle();
          break;

        case 'ArrowLeft':
          event.preventDefault();
          if (ctrl) player.previous();
          else player.seek(engine.position - step);
          break;

        case 'ArrowRight':
          event.preventDefault();
          if (ctrl) player.next(true);
          else player.seek(engine.position + step);
          break;

        case 'ArrowUp':
          event.preventDefault();
          player.nudgeVolume(0.05);
          break;

        case 'ArrowDown':
          event.preventDefault();
          player.nudgeVolume(-0.05);
          break;

        default:
          if (ctrl) break;
          if (event.key === 's' || event.key === 'S') player.toggleShuffle();
          else if (event.key === 'r' || event.key === 'R') player.cycleRepeat();
          else if (event.key === 'm' || event.key === 'M') player.toggleMute();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
