import { useEffect, useRef } from 'react';

/**
 * A themed dialog.
 *
 * Not `dialog.showMessageBox`: a native box is drawn by Windows in Windows' colours, which
 * on a Gruvbox or Rosé Pine window looks like something else entirely has appeared. This
 * inherits the theme like everything else.
 */
export function Modal({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus moves inside, so Escape and Enter reach the dialog rather than the shortcuts
    // bound on the window.
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="scrim" onPointerDown={onClose}>
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // The scrim closes on any press; a press inside the dialog is not that.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal__title">{title}</h2>
        <div className="modal__body">{children}</div>
        <div className="modal__actions">{actions}</div>
      </div>
    </div>
  );
}
