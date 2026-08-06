import { useEffect, useState } from 'react';

/**
 * The version line at the foot of Settings.
 *
 * Draht builds this as a raw DOM node and measures the scroller to place it, because it is
 * grafted into a settings panel it does not own. Takt owns this page, so `margin-top: auto`
 * in a flex column does the same job: at the end of the content on a long page, at the
 * bottom of the panel on a short one, and nothing to keep in sync.
 */
export function VersionFooter() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.takt.getVersion().then(setVersion);
  }, []);

  return (
    <div className="version">
      <div>Takt {version}</div>
      <div>made by nejan</div>
    </div>
  );
}
