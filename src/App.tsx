import { useEffect, useRef, useState } from 'react';

import { Equalizer } from './components/Equalizer';
import { Icon } from './components/Icon';
import { PlayerBar } from './components/PlayerBar';
import { Queue } from './components/Queue';
import { Resizer } from './components/Resizer';
import { SettingsPage } from './components/settings/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { TrackList } from './components/TrackList';
import { useLibrary } from './state/library';
import { usePlayer } from './state/player';
import { useMediaSession } from './state/useMediaSession';
import { useShortcuts } from './state/useShortcuts';
import { useTheme } from './themes/useTheme';

export function App() {
  const [queueOpen, setQueueOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [dropping, setDropping] = useState(false);

  const view = useLibrary((s) => s.view);
  const setView = useLibrary((s) => s.setView);
  const init = useLibrary((s) => s.init);
  const merge = useLibrary((s) => s.merge);
  const setScan = useLibrary((s) => s.setScan);
  const enqueue = usePlayer((s) => s.enqueue);
  const sidebarWidth = usePlayer((s) => s.sidebarWidth);

  const mainRef = useRef<HTMLElement>(null);

  /*
   * Every view starts at the top.
   *
   * The scroller is shared between the library, each playlist and settings, so opening a
   * playlist otherwise inherits however far down the previous list had been scrolled —
   * landing halfway into a playlist whose name and cover are off-screen above.
   */
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view.kind, view.kind === 'playlist' ? view.id : undefined]);

  useTheme();
  useShortcuts();
  useMediaSession();

  useEffect(() => {
    void window.takt.getVersion().then(setVersion);
    // Nothing in the main process can tell "the app started" apart from "the protocol
    // handler 404'd and Chromium rendered the error body" — both finish loading. Saying so
    // from here is the only signal that means the app is actually up.
    window.takt.signalReady();
    void init();
  }, [init]);

  useEffect(() => window.takt.onScanProgress(setScan), [setScan]);

  useEffect(() => window.takt.onOpenFiles((tracks) => {
    merge(tracks);
    enqueue(tracks);
  }), [merge, enqueue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setQueueOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`app ${dropping ? 'app--dropping' : ''}`}
      /*
       * Without preventDefault on dragover, Chromium navigates the window to the dropped
       * file — which unloads the app and leaves a bare audio player behind.
       */
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={async (e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(false);

        /*
         * `webUtils.getPathForFile` is the only way to get a path from a dropped File under
         * context isolation — `File.path` was removed in Electron 32. Main expands folders
         * and indexes whatever it finds.
         */
        const paths = [...e.dataTransfer.files].map((file) => window.takt.pathForFile(file)).filter(Boolean);
        if (!paths.length) return;

        const tracks = await window.takt.addPaths(paths);
        merge(tracks);
        enqueue(tracks);
      }}
    >
      <TitleBar />

      <div className="app__body" style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        <Sidebar />
        <Resizer />

        <main className="app__main" ref={mainRef}>
          {view.kind === 'settings'
            ? <SettingsPage onClose={() => setView({ kind: 'library' })} />
            : <TrackList />}
        </main>

        {queueOpen && <Queue onClose={() => setQueueOpen(false)} />}
      </div>

      {eqOpen && <Equalizer onClose={() => setEqOpen(false)} />}

      <PlayerBar
        queueOpen={queueOpen}
        eqOpen={eqOpen}
        onToggleQueue={() => setQueueOpen((open) => !open)}
        onToggleEq={() => setEqOpen((open) => !open)}
      />

      <UpdateBanner />

      <span className="app__version" title={`Takt ${version}`}>{version}</span>
    </div>
  );
}

/**
 * Shown when the in-session watcher finds a newer release.
 *
 * Deliberately names no version: nothing has been downloaded at this point, so quoting a
 * number would promise a specific build that could already be superseded by the time the
 * app restarts and the splash actually fetches one.
 */
function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => window.takt.onUpdateReady(() => setReady(true)), []);

  if (!ready) return null;

  return (
    <div className="update" role="status">
      <Icon name="music" size={16} />
      <span>An update is available.</span>
      <button type="button" className="btn btn--primary" onClick={() => window.takt.installUpdate()}>
        Restart now
      </button>
      <button type="button" className="btn" onClick={() => setReady(false)}>Later</button>
    </div>
  );
}
