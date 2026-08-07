import { useState } from 'react';

import { Modal } from './Modal';

/**
 * Asks for a name before creating something.
 *
 * A playlist called "New playlist" is a chore left for later, and later never comes — so
 * the name is asked for at the moment the intent exists, with a sensible default already
 * filled in and selected.
 */
export function NamePrompt({
  title,
  initial,
  confirmLabel = 'Create',
  note,
  onConfirm,
  onCancel,
}: {
  title: string;
  initial: string;
  confirmLabel?: string;
  note?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const name = value.trim();

  const submit = () => {
    if (name) onConfirm(name);
  };

  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={(
        <>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!name}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <input
        className="modal__input"
        value={value}
        autoFocus
        aria-label={title}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        }}
      />
      {note && <p className="modal__note">{note}</p>}
    </Modal>
  );
}
