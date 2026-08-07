import type { ReactNode } from 'react';

/**
 * The icon set, as inline SVG.
 *
 * Inline rather than an icon font or a sprite sheet: there are a dozen of them, they are
 * all simple, and `currentColor` means they follow the theme with no extra plumbing. A
 * font would also have to load before the first paint, which is exactly when the transport
 * controls need to be visible.
 *
 * Each entry draws into a 24x24 box. Strokes are the default; the few solid glyphs opt in
 * with `fill="currentColor" stroke="none"` on their own path, so a speaker cone can be
 * filled while the waves beside it stay stroked.
 */

const solid = { fill: 'currentColor', stroke: 'none' } as const;

const SPEAKER = <path {...solid} d="M11 5 6.5 9H3v6h3.5L11 19z" />;

const ICONS = {
  play: <path {...solid} d="M8 5.14v13.72a1 1 0 0 0 1.5.87l11.14-6.86a1 1 0 0 0 0-1.74L9.5 4.27A1 1 0 0 0 8 5.14z" />,
  pause: <path {...solid} d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" />,
  previous: <path d="M7 5v14M19.5 5.9v12.2a1 1 0 0 1-1.53.85l-9.7-6.1a1 1 0 0 1 0-1.7l9.7-6.1A1 1 0 0 1 19.5 5.9z" />,
  next: <path d="M17 5v14M4.5 5.9v12.2a1 1 0 0 0 1.53.85l9.7-6.1a1 1 0 0 0 0-1.7l-9.7-6.1A1 1 0 0 0 4.5 5.9z" />,
  shuffle: <path d="M16.5 4.5 20 8l-3.5 3.5M16.5 16.5 20 20l-3.5 3.5M20 8h-3.2a5 5 0 0 0-4.1 2.1l-3.4 4.8A5 5 0 0 1 5.2 17H3M3 8h2.2a5 5 0 0 1 4.1 2.1l.5.7M20 20h-3.2a5 5 0 0 1-4.1-2.1l-.5-.7" />,
  repeat: <path d="M16.5 2.5 20 6l-3.5 3.5M7.5 21.5 4 18l3.5-3.5M20 6H8a5 5 0 0 0-5 5v1M4 18h12a5 5 0 0 0 5-5v-1" />,

  volume: <>{SPEAKER}<path d="M14.6 9.2a4 4 0 0 1 0 5.6M17.6 6.2a8 8 0 0 1 0 11.6" /></>,
  volumeLow: <>{SPEAKER}<path d="M14.6 9.2a4 4 0 0 1 0 5.6" /></>,
  volumeMuted: <>{SPEAKER}<path d="M15 9.5l5 5M20 9.5l-5 5" /></>,

  equalizer: <path d="M5 21v-6M5 11V3M12 21v-9M12 8V3M19 21v-4M19 13V3M2 15h6M9 8h6M16 17h6" />,
  queue: <path d="M3 6h13M3 12h13M3 18h8M17.5 12.5v6l5-3z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />,
  music: <path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />,
  palette: <path d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.21-1.79 4-4 4h-2.2a1.8 1.8 0 0 0-1.3 3.04A1.8 1.8 0 0 1 12 21z" />,

  close: <path d="M5 5l14 14M19 5 5 19" />,
  minimize: <path d="M5 12h14" />,
  maximize: <path d="M5.5 5.5h13v13h-13z" />,
  restore: <path d="M8.5 8.5V5.5h10v10h-3M5.5 8.5h10v10h-10z" />,

  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  /*
   * The usual cog: a toothed ring around a hub, rather than a circle with spokes radiating
   * past it. The spoked version reads as a sun or a brightness control at 16px, which is
   * what it was being mistaken for.
   */
  settings: <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
  reset: <path d="M3.5 5.5v5h5M3.9 10.5a8.5 8.5 0 1 1 .6 5" />,
  edit: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M4 17l4.5-4.5 3 3L15 12l5 5" /></>,
  download: <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />,
  upload: <path d="M12 17V5M7 9l5-5 5 5M4 20h16" />,
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5" /></>,
  album: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /></>,
  artist: <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.4 2" /></>,
  moon: <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z" />,
  sortAsc: <path d="M6 18V6M6 6 2.5 9.5M6 6l3.5 3.5M13 7h8M13 12h6M13 17h4" />,
  sortDesc: <path d="M6 6v12M6 18l-3.5-3.5M6 18l3.5-3.5M13 7h4M13 12h6M13 17h8" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  mini: <><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><rect x="12" y="12" width="8" height="6" rx="1" /></>,
  heart: <path d="M12 20.4 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z" />,
  // Same outline, filled. Drawn as its own entry rather than toggling `fill` on the other,
  // so the stroke stays and the shape does not visibly grow when it fills.
  heartFull: <path {...solid} d="M12 20.4 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 20, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}
