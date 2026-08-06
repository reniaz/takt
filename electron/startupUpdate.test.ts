import { describe, expect, it } from 'vitest';

import { isNewerVersion } from './startupUpdate';

/**
 * The comparison the whole update path hangs on.
 *
 * `updateInfo.version` is only ever "the feed's latest release" — it is not a claim that
 * an update applies. The original mistake this guards is comparing with `!==`, which
 * treats a *newer* local build as an update; `downloadUpdate()` then throws "Please check
 * update first" and updates silently stop working for anyone running a dev build.
 */
describe('isNewerVersion', () => {
  it('recognises a higher version', () => {
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
  });

  it('is false for the same version', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('is false when the local build is ahead of the feed', () => {
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
  });

  it('compares numerically, not as strings', () => {
    // The string comparison every naive implementation makes: '9' > '10'.
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false);
    expect(isNewerVersion('2.0.0', '10.0.0')).toBe(false);
  });

  it('treats missing segments as zero', () => {
    expect(isNewerVersion('1.1', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.1', '1.0')).toBe(true);
  });

  it('ignores a pre-release suffix', () => {
    expect(isNewerVersion('1.2.0-beta.1', '1.1.0')).toBe(true);
    expect(isNewerVersion('1.2.0-beta.1', '1.2.0')).toBe(false);
  });

  it('does not throw on junk', () => {
    expect(isNewerVersion('', '1.0.0')).toBe(false);
    expect(isNewerVersion('not.a.version', '1.0.0')).toBe(false);
  });
});
