/** `83` -> `1:23`, `3730` -> `1:02:10`. Hours only appear when there are any. */
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);

  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * Parses whatever someone types into the elapsed-time field.
 *
 * Accepts plain seconds (`83`), clock time (`1:23`, `1:02:03`), and relative jumps
 * (`+15`, `-30`). Returns `undefined` for anything it cannot read, so the caller can
 * leave the field alone rather than seeking to NaN.
 *
 * `1:2` means 1:02 — a single digit after the colon is a count of seconds, not a
 * truncated pair. Reading it as `1:20` would make a typo skip somewhere unexpected.
 */
export function parseTimeInput(
  raw: string,
  current: number,
  duration: number,
): number | undefined {
  const input = raw.trim();
  if (!input) return undefined;

  const relative = /^([+-])\s*(.+)$/.exec(input);
  const body = relative ? (relative[2] as string) : input;

  const parts = body.split(':');
  if (parts.length > 3) return undefined;

  let seconds = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    // An empty segment (`1::2`, `:30`) is a typo, not a zero.
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
    seconds = seconds * 60 + Number(trimmed);
  }

  if (!Number.isFinite(seconds)) return undefined;

  const target = relative
    ? current + (relative[1] === '-' ? -seconds : seconds)
    : seconds;

  const limit = Number.isFinite(duration) && duration > 0 ? duration : target;
  return Math.min(Math.max(0, target), limit);
}
