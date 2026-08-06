import { formatTime } from '../audio/time';
import { usePlayer } from '../state/player';
import { Icon } from './Icon';

export function TrackList() {
  const queue = usePlayer((s) => s.queue);
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playAt = usePlayer((s) => s.playAt);

  if (!queue.length) return <EmptyState />;

  return (
    <div className="tracklist" role="list">
      {queue.map((id, i) => {
        const track = tracks.get(id);
        if (!track) return null;
        const isCurrent = i === index;

        return (
          <div
            key={id}
            role="listitem"
            className={`row ${isCurrent ? 'row--current' : ''}`}
            onDoubleClick={() => playAt(i)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') playAt(i);
            }}
          >
            <div className="row__index">
              {isCurrent && isPlaying
                ? <Bars />
                : <span className="row__number">{i + 1}</span>}
            </div>

            <div className="row__art">
              {track.artwork
                ? <img src={`takt://art/${track.artwork}`} alt="" loading="lazy" />
                : <Icon name="music" size={14} />}
            </div>

            <div className="row__main">
              <div className="row__title">{track.title}</div>
              <div className="row__sub">{track.artist ?? 'Unknown artist'}</div>
            </div>

            <div className="row__album">{track.album ?? ''}</div>
            <div className="row__time">{track.duration ? formatTime(track.duration) : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The playing indicator: the app mark, animated.
 *
 * Same 3-1-2-1 stroke pattern as the icon, so "this row is playing" and "this app is
 * Takt" are visibly the same idea rather than two unrelated glyphs.
 */
function Bars() {
  return (
    <span className="bars" aria-label="Playing">
      <i /><i /><i /><i />
    </span>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty__mark">
        <svg width="52" height="52" viewBox="0 0 16 16" aria-hidden="true">
          <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" fill="none">
            <path d="M4.25 3.5v9" />
            <path d="M6.75 6.5v3" />
            <path d="M9.25 5v6" />
            <path d="M11.75 6.5v3" />
          </g>
        </svg>
      </div>
      <h2>Nothing here yet</h2>
      <p>Add some files or a folder to get started.</p>
      <div className="empty__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => usePlayer.getState().addTracks(await window.takt.pickFolder())}
        >
          <Icon name="folder" size={16} />
          Add folder
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => usePlayer.getState().addTracks(await window.takt.pickFiles())}
        >
          <Icon name="file" size={16} />
          Add files
        </button>
      </div>
    </div>
  );
}
