import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Icon, type IconName } from './Icon';

export type MenuItem =
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | {
    kind?: 'item';
    label: string;
    icon?: IconName;
    danger?: boolean;
    disabled?: boolean;
    onSelect: () => void;
  };

export type MenuState = { x: number; y: number; items: MenuItem[] } | undefined;

/**
 * A right-click menu.
 *
 * Positioned at the pointer and then pulled back inside the window if it would overflow —
 * a menu opened near the bottom edge otherwise renders mostly off-screen, which is where
 * "delete" tends to be.
 */
export function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!state || !ref.current) return;

    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(state.x, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(state.y, window.innerHeight - height - 4)),
    });
  }, [state]);

  useEffect(() => {
    if (!state) return undefined;

    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };

    // `scroll` in the capture phase: a menu anchored to a row that scrolls away would
    // otherwise float over unrelated content still claiming to act on the original.
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, onClose]);

  if (!state) return null;

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      // The window-level pointerdown above would close the menu before a click on one of
      // its own items ever landed.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {state.items.map((item, i) => {
        if (item.kind === 'separator') return <div key={i} className="menu__sep" />;
        if (item.kind === 'label') return <div key={i} className="menu__label">{item.label}</div>;

        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
            disabled={item.disabled}
            onClick={() => { item.onSelect(); onClose(); }}
          >
            {item.icon ? <Icon name={item.icon} size={15} /> : <span className="menu__gap" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
