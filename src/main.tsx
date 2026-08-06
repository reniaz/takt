import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { installDevBridge } from './devBridge';
import './styles/app.scss';

// Must run before the first render — App reads window.takt in its mount effect.
installDevBridge();

const root = document.getElementById('root');
if (!root) throw new Error('No #root — index.html did not load');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
