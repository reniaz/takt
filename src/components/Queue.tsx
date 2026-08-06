import { formatTime } from '../audio/time';
import { usePlayer } from '../state/player';
import { Icon } from './Icon';

/**
 * The play queue, as a side panel.
 *
 * Rows are reorderable with native HTML drag and drop rather than a library — a flat list
 * with no nesting and no cross-container moves is exactly the case it handles well, and
 * it keeps a dependency out of the first release.
 */
export function Queue({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((s) => s.queue);
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playAt = usePlayer((s) => s.playAt);
  const remove = usePlayer((s) => s.removeFromQueue);
  const reorder = usePlayer((s) => s.reorderQueue);
  const clear = usePlayer((s) => s.clearQueue);

  return (
    <aside className="queue">
      <div className="queue__head">
        <h2>Queue</h2>
        <div className="queue__headActions">
          <button type="button" className="ctl" onClick={clear} title="Clear queue" disabled={!queue.length}>
            <Icon name="trash" size={16} />
          </button>
          <button type="button" className="ctl" onClick={onClose} title="Close" aria-label="Close queue">
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {queue.length === 0 && <p className="queue__empty">The queue is empty.</p>}

      <div className="queue__list">
        {queue.map((id, i) => {
          const track = tracks.get(id);
          if (!track) return null;

          return (
            <div
              key={id}
              className={`qrow ${i === index ? 'qrow--current' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(i));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData('text/plain'));
                if (Number.isInteger(from)) reorder(from, i);
              }}
              onDoubleClick={() => playAt(i)}
            >
              <div className="qrow__main">
                <div className="qrow__title">{track.title}</div>
                <div className="qrow__sub">{track.artist ?? 'Unknown artist'}</div>
              </div>
              <span className="qrow__time">{track.duration ? formatTime(track.duration) : ''}</span>
              <button
                type="button"
                className="qrow__remove"
                onClick={() => remove(i)}
                title="Remove"
                aria-label={`Remove ${track.title}`}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
