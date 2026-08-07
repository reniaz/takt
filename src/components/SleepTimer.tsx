import { useEffect, useState } from 'react';

import { remaining, useSleep } from '../state/sleep';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { Icon } from './Icon';

const PRESETS = [15, 30, 45, 60, 90];

/**
 * The sleep timer control.
 *
 * Shows the countdown once one is running, so the timer is never a thing you set and then
 * have to trust — the most common reason people do not use one is not knowing whether it
 * took.
 */
export function SleepTimer() {
  const mode = useSleep((s) => s.mode);
  const endsAt = useSleep((s) => s.endsAt);
  const fading = useSleep((s) => s.fading);
  const start = useSleep((s) => s.start);
  const cancel = useSleep((s) => s.cancel);

  const [menu, setMenu] = useState<MenuState>(undefined);
  const [, tick] = useState(0);

  // A countdown has to re-render on its own; nothing else changes while it runs.
  useEffect(() => {
    if (!endsAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const left = remaining(endsAt);
  const label = fading
    ? 'Fading out'
    : left !== undefined
      ? `${Math.ceil(left / 60_000)}m`
      : mode === 'track'
        ? 'End of track'
        : mode === 'queue'
          ? 'End of queue'
          : undefined;

  const items: MenuItem[] = [
    { kind: 'label', label: 'Sleep after' },
    ...PRESETS.map((minutes): MenuItem => ({
      label: `${minutes} minutes`,
      icon: 'clock',
      onSelect: () => start('minutes', minutes),
    })),
    { kind: 'separator' },
    { label: 'End of this track', icon: 'next', onSelect: () => start('track') },
    { label: 'End of the queue', icon: 'queue', onSelect: () => start('queue') },
    ...(mode ? [{ kind: 'separator' as const }, { label: 'Cancel timer', icon: 'close' as const, onSelect: cancel }] : []),
  ];

  return (
    <>
      <button
        type="button"
        className={`ctl ${mode ? 'ctl--on' : ''} ${label ? 'ctl--wide' : ''}`}
        title={label ? `Sleep timer: ${label}` : 'Sleep timer'}
        aria-label="Sleep timer"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.top - 8, items });
        }}
      >
        <Icon name="moon" size={17} />
        {label && <span className="ctl__label">{label}</span>}
      </button>

      <ContextMenu state={menu} onClose={() => setMenu(undefined)} />
    </>
  );
}
