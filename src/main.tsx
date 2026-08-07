import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { MiniPlayer } from './components/MiniPlayer';
import { installDevBridge } from './devBridge';
import './styles/app.scss';

// Must run before the first render — both roots read window.takt in a mount effect.
installDevBridge();

const root = document.getElementById('root');
if (!root) throw new Error('No #root — index.html did not load');

/*
 * One bundle, two windows.
 *
 * The mini player is the same build at a different route rather than a second entry point:
 * it shares the theme system, the icons and the time formatting, and there is no chance of
 * the two windows drifting onto different versions of any of them.
 */
// Read here rather than through the bridge: the preload has no DOM lib, and this is the
// renderer's own address.
const isMini = window.location.hash.startsWith('#/mini');

createRoot(root).render(
  <StrictMode>
    {isMini ? <MiniPlayer /> : <App />}
  </StrictMode>,
);

if (isMini) document.body.classList.add('is-mini');
