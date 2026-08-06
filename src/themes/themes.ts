/**
 * A theme is defined by eleven semantic colours, not by the ~40 CSS variables the UI
 * actually reads.
 *
 * Everything else is derived. That is what makes a colour picker usable — editing eleven
 * swatches is a reasonable thing to ask of someone, editing forty is not — and it keeps
 * derived relationships (hover states, tints, rgb companions) internally consistent
 * instead of leaving the user to keep them in sync by hand.
 *
 * The seed shape and the on-disk file format are shared with Draht, so a theme written for
 * one loads unmodified in the other.
 */
export type ThemeSeed = {
  /** Page background — the deepest surface. */
  background: string;
  /** Panels, the sidebar, the player bar. */
  surface: string;
  /** Raised elements: hover states, the selected row, the seek bar track. */
  raised: string;
  /** Dividers and outlines. */
  border: string;
  /** Primary text. */
  text: string;
  /** Timestamps, secondary labels, icons. */
  textMuted: string;
  /** Transport buttons, the played portion of the seek bar, active states. */
  accent: string;
  /** Links, and the artist/album cross-references. */
  link: string;
  error: string;
  success: string;
  /**
   * Tracks whose file is no longer on disk. Distinct from `error` so "this file moved"
   * can read differently from "something went wrong" — the same slot Draht uses for
   * deleted messages, which is why the file format stays compatible.
   */
  deleted: string;
};

export type Theme = {
  id: string;
  label: string;
  seed: ThemeSeed;
};

/* ---------- colour helpers ---------- */

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;

  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function triplet(hex: string) {
  return parseHex(hex).join(', ');
}

/** Blends two colours. `amount` 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, amount: number) {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);

  return toHex([
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  ]);
}

export function lighten(hex: string, amount: number) {
  return mix(hex, '#ffffff', amount);
}

export function darken(hex: string, amount: number) {
  return mix(hex, '#000000', amount);
}

export function rgba(hex: string, alpha: number) {
  return `rgba(${triplet(hex)}, ${alpha})`;
}

/** Rough perceptual luminance, 0–1. Used to decide what reads on top of the accent. */
export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ---------- seed -> CSS variables ---------- */

/**
 * Expands a seed into the variables the UI reads.
 *
 * `brightness` lifts every colour toward white by that fraction, which is a single dial
 * for "a bit lighter overall" rather than eleven separate edits.
 */
export function buildThemeVars(seed: ThemeSeed, brightness = 0): Record<string, string> {
  const b = Math.max(0, Math.min(0.5, brightness));
  const lift = (hex: string) => (b ? lighten(hex, b) : hex);

  const background = lift(seed.background);
  const surface = lift(seed.surface);
  const raised = lift(seed.raised);
  const border = lift(seed.border);
  const text = lift(seed.text);
  const textMuted = lift(seed.textMuted);
  const accent = lift(seed.accent);
  const link = lift(seed.link);
  const error = lift(seed.error);
  const success = lift(seed.success);
  const missing = lift(seed.deleted);

  // Derived steps, so hover and active states stay consistent with whatever was picked.
  const surfaceHover = mix(surface, text, 0.06);
  const raisedHover = mix(raised, text, 0.08);
  const subtle = mix(background, surface, 0.6);

  /*
   * Light themes need dark text on the accent and dark themes need light text, and a seed
   * says nothing about which it is. Deciding from the accent's own luminance means a user
   * inventing a pale-yellow accent gets readable button labels without being asked.
   */
  const onAccent = luminance(accent) > 0.55 ? darken(accent, 0.72) : '#ffffff';

  return {
    '--takt-bg': background,
    '--takt-surface': surface,
    '--takt-surface-hover': surfaceHover,
    '--takt-raised': raised,
    '--takt-raised-hover': raisedHover,
    '--takt-subtle': subtle,

    '--takt-border': border,
    '--takt-border-strong': mix(border, text, 0.2),
    '--takt-divider': subtle,

    '--takt-text': text,
    '--takt-text-rgb': triplet(text),
    '--takt-text-muted': textMuted,
    '--takt-text-faint': mix(textMuted, background, 0.35),

    '--takt-accent': accent,
    '--takt-accent-rgb': triplet(accent),
    '--takt-accent-hover': lighten(accent, 0.12),
    '--takt-accent-shade': darken(accent, 0.14),
    '--takt-accent-soft': rgba(accent, 0.16),
    '--takt-on-accent': onAccent,

    '--takt-link': link,
    '--takt-error': error,
    '--takt-success': success,
    '--takt-missing': missing,

    '--takt-shadow': rgba('#000000', 0.45),
    '--takt-shadow-soft': rgba('#000000', 0.2),
    '--takt-overlay': rgba(background, 0.72),
    '--takt-scrollbar': rgba(text, 0.18),
    '--takt-scrollbar-hover': rgba(text, 0.3),
  };
}

/* ---------- bundled themes ---------- */

/**
 * caelus — warm, muted, dark. Adapted from the palette of the same name by dacctal.
 * The same values Draht ships, so the two apps sit side by side without clashing.
 */
const CAELUS: ThemeSeed = {
  background: '#262726',
  surface: '#2f3230',
  raised: '#434844',
  border: '#434844',
  text: '#c6b4a6',
  textMuted: '#808278',
  accent: '#c05f5a',
  link: '#c47a42',
  error: '#c05f5a',
  success: '#6aa76c',
  deleted: '#c05f5a',
};

const CATPPUCCIN_MOCHA: ThemeSeed = {
  background: '#1e1e2e',
  surface: '#181825',
  raised: '#313244',
  border: '#313244',
  text: '#cdd6f4',
  textMuted: '#a6adc8',
  accent: '#cba6f7',
  link: '#89b4fa',
  error: '#f38ba8',
  success: '#a6e3a1',
  deleted: '#f38ba8',
};

/** The one light theme, so a player with nine dark options is not the only choice. */
const CATPPUCCIN_LATTE: ThemeSeed = {
  background: '#eff1f5',
  surface: '#e6e9ef',
  raised: '#dce0e8',
  border: '#ccd0da',
  text: '#4c4f69',
  textMuted: '#6c6f85',
  accent: '#8839ef',
  link: '#1e66f5',
  error: '#d20f39',
  success: '#40a02b',
  deleted: '#e64553',
};

const NORD: ThemeSeed = {
  background: '#2e3440',
  surface: '#3b4252',
  raised: '#434c5e',
  border: '#4c566a',
  text: '#eceff4',
  textMuted: '#81a1c1',
  accent: '#88c0d0',
  link: '#8fbcbb',
  error: '#bf616a',
  success: '#a3be8c',
  deleted: '#bf616a',
};

const GRUVBOX_DARK: ThemeSeed = {
  background: '#282828',
  surface: '#32302f',
  raised: '#3c3836',
  border: '#504945',
  text: '#ebdbb2',
  textMuted: '#928374',
  accent: '#fe8019',
  link: '#83a598',
  error: '#fb4934',
  success: '#b8bb26',
  deleted: '#fb4934',
};

const DRACULA: ThemeSeed = {
  background: '#282a36',
  surface: '#21222c',
  raised: '#44475a',
  border: '#44475a',
  text: '#f8f8f2',
  textMuted: '#6272a4',
  accent: '#bd93f9',
  link: '#8be9fd',
  error: '#ff5555',
  success: '#50fa7b',
  deleted: '#ff79c6',
};

const TOKYO_NIGHT: ThemeSeed = {
  background: '#1a1b26',
  surface: '#16161e',
  raised: '#292e42',
  border: '#292e42',
  text: '#c0caf5',
  textMuted: '#565f89',
  accent: '#7aa2f7',
  link: '#7dcfff',
  error: '#f7768e',
  success: '#9ece6a',
  deleted: '#f7768e',
};

const ROSE_PINE: ThemeSeed = {
  background: '#191724',
  surface: '#1f1d2e',
  raised: '#26233a',
  border: '#26233a',
  text: '#e0def4',
  textMuted: '#908caa',
  accent: '#c4a7e7',
  link: '#9ccfd8',
  error: '#eb6f92',
  success: '#31748f',
  deleted: '#eb6f92',
};

const EVERFOREST_DARK: ThemeSeed = {
  background: '#2d353b',
  surface: '#343f44',
  raised: '#3d484d',
  border: '#4f585e',
  text: '#d3c6aa',
  textMuted: '#859289',
  accent: '#a7c080',
  link: '#7fbbb3',
  error: '#e67e80',
  success: '#a7c080',
  deleted: '#e67e80',
};

export const DEFAULT_SEED = CAELUS;
export const DEFAULT_THEME_ID = 'caelus';

export const THEMES: Theme[] = [
  { id: 'caelus', label: 'caelus', seed: CAELUS },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', seed: CATPPUCCIN_MOCHA },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', seed: CATPPUCCIN_LATTE },
  { id: 'nord', label: 'Nord', seed: NORD },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', seed: GRUVBOX_DARK },
  { id: 'dracula', label: 'Dracula', seed: DRACULA },
  { id: 'tokyo-night', label: 'Tokyo Night', seed: TOKYO_NIGHT },
  { id: 'rose-pine', label: 'Rosé Pine', seed: ROSE_PINE },
  { id: 'everforest-dark', label: 'Everforest Dark', seed: EVERFOREST_DARK },
];

export function getTheme(id: string) {
  return THEMES.find((theme) => theme.id === id);
}

export const SEED_LABELS: Record<keyof ThemeSeed, string> = {
  background: 'Background',
  surface: 'Panels',
  raised: 'Raised & hover',
  border: 'Borders',
  text: 'Text',
  textMuted: 'Secondary text',
  accent: 'Accent',
  link: 'Links',
  error: 'Errors',
  success: 'Success',
  deleted: 'Missing files',
};
