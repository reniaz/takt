import { useEffect, useState } from 'react';

import { Equalizer } from './components/Equalizer';
import { Icon } from './components/Icon';
import { PlayerBar } from './components/PlayerBar';
import { Queue } from './components/Queue';
import { SettingsPage } from './components/settings/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { TrackList } from './components/TrackList';
import { usePlayer } from './state/player';
import { useMediaSession } from './state/useMediaSession';
import { useShortcuts } from './state/useShortcuts';
import { useTheme } from './themes/useTheme';

export function App() {
  const [queueOpen, setQueueOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [dropping, setDropping] = useState(false);

  const addTracks = usePlayer((s) => s.addTracks);

  useTheme();
  useShortcuts();
  useMediaSession();

  useEffect(() => {
    void window.takt.getVersion().then(setVersion);
    // Nothing in the main process can tell "the app started" apart from "the protocol
    // handler 404'd and Chromium rendered the error body" — both finish loading. Saying so
    // from here is the only signal that means the app is actually up.
    window.takt.signalReady();
    // Files handed over by Explorer, either at launch or from a second instance.
    return window.takt.onOpenFiles((tracks) => addTracks(tracks, true));
  }, [addTracks]);

  useEffect(() => {
    const onQueueKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setQueueOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onQueueKey);
    return () => window.removeEventListener('keydown', onQueueKey);
  }, []);

  return (
    <div
      className={`app ${dropping ? 'app--dropping' : ''}`}
      /*
       * Without preventDefault on dragover, Chromium navigates the window to the dropped
       * file — which unloads the app and leaves a bare audio player behind.
       */
      onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        // The renderer is sandboxed and cannot read a path off a File; main resolves
        // them, so this is left to the Explorer hand-off path for now.
      }}
    >
      <TitleBar />

      <div className="app__body">
        <Sidebar
          settingsOpen={settingsOpen}
          onOpenSettings={() => setSettingsOpen((open) => !open)}
        />

        <main className="app__main">
          {settingsOpen ? <SettingsPage onClose={() => setSettingsOpen(false)} /> : <TrackList />}
        </main>

        {queueOpen && <Queue onClose={() => setQueueOpen(false)} />}
      </div>

      {eqOpen && (
        <Equalizer
          onClose={() => setEqOpen(false)}
          onOpenSettings={() => { setSettingsOpen(true); setEqOpen(false); }}
        />
      )}

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
