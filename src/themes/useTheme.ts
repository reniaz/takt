import { useEffect } from 'react';

import { usePlayer } from '../state/player';
import { buildThemeVars, DEFAULT_SEED, getTheme } from './themes';

/**
 * Writes the active theme onto the document element.
 *
 * Set as inline custom properties rather than by swapping a stylesheet or a class, because
 * a theme is a set of values rather than a set of rules — user themes loaded from disk have
 * no stylesheet to swap to. Nothing here needs `!important`: the app owns every rule that
 * reads these, so there is nothing to fight.
 */
export function useTheme() {
  const themeId = usePlayer((s) => s.themeId);
  const brightness = usePlayer((s) => s.brightness);

  useEffect(() => {
    const seed = getTheme(themeId)?.seed ?? DEFAULT_SEED;
    const vars = buildThemeVars(seed, brightness);
    const root = document.documentElement;

    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }

    /*
     * Tells Chromium which way round the theme is, so form controls, the caret and the
     * scrollbar gutter it draws itself match. Derived from the background rather than
     * stored on the seed, so a user theme gets it right without declaring it.
     */
    const isLight = /^#(\w\w)(\w\w)(\w\w)$/.test(seed.background)
      && parseInt(seed.background.slice(1, 3), 16) > 0x80;
    root.style.colorScheme = isLight ? 'light' : 'dark';
  }, [themeId, brightness]);
}
