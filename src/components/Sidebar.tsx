import { usePlayer } from '../state/player';
import { Icon } from './Icon';

export function Sidebar({
  settingsOpen,
  onOpenSettings,
}: {
  settingsOpen: boolean;
  onOpenSettings: () => void;
}) {
  const addTracks = usePlayer((s) => s.addTracks);
  const count = usePlayer((s) => s.queue.length);

  return (
    <nav className="sidebar">
      <div className="sidebar__section">
        <div className="sidebar__label">Library</div>
        <button type="button" className={`navitem ${settingsOpen ? '' : 'navitem--active'}`}>
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

      {/* Appearance lives in Settings. The sidebar is for getting to music. */}
      <button
        type="button"
        className={`navitem ${settingsOpen ? 'navitem--active' : ''}`}
        onClick={onOpenSettings}
        aria-pressed={settingsOpen}
      >
        <Icon name="settings" size={16} />
        <span>Settings</span>
      </button>
    </nav>
  );
}
