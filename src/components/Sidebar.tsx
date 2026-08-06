import { usePlayer } from '../state/player';
import { Icon } from './Icon';
import { ThemePicker } from './ThemePicker';

export function Sidebar() {
  const addTracks = usePlayer((s) => s.addTracks);
  const count = usePlayer((s) => s.queue.length);

  return (
    <nav className="sidebar">
      <div className="sidebar__section">
        <div className="sidebar__label">Library</div>
        <button type="button" className="navitem navitem--active">
          <Icon name="music" size={16} />
          <span>All tracks</span>
          <span className="navitem__count">{count || ''}</span>
        </button>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__label">Add</div>
        <button
          type="button"
          className="navitem"
          onClick={async () => addTracks(await window.takt.pickFolder())}
        >
          <Icon name="folder" size={16} />
          <span>Folder…</span>
        </button>
        <button
          type="button"
          className="navitem"
          onClick={async () => addTracks(await window.takt.pickFiles())}
        >
          <Icon name="file" size={16} />
          <span>Files…</span>
        </button>
      </div>

      <div className="sidebar__spacer" />

      <ThemePicker />
    </nav>
  );
}
