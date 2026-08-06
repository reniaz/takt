import { describe, expect, it } from 'vitest';

import { resolveRange } from './protocol';

/**
 * These are the exact request shapes Chromium issues while loading and seeking audio.
 * Getting any of them wrong produces a file that plays from the start but cannot be
 * scrubbed, and reports `Infinity` as its duration.
 */
describe('resolveRange', () => {
  const SIZE = 1000;

  it('serves the whole file when there is no Range header', () => {
    expect(resolveRange(null, SIZE)).toEqual({ kind: 'full' });
  });

  it('serves the whole file for a header it does not understand', () => {
    // Multipart ranges are legal but no media element sends them; the whole file is a
    // correct, if unhelpful, answer, whereas a guess would be wrong.
    expect(resolveRange('bytes=0-99,200-299', SIZE)).toEqual({ kind: 'full' });
    expect(resolveRange('items=0-10', SIZE)).toEqual({ kind: 'full' });
  });

  it('reads a closed range inclusively', () => {
    // bytes=0-99 is 100 bytes, not 99.
    expect(resolveRange('bytes=0-99', SIZE)).toEqual({ kind: 'partial', start: 0, end: 99 });
  });

  it('runs an open-ended range to the last byte', () => {
    expect(resolveRange('bytes=500-', SIZE)).toEqual({ kind: 'partial', start: 500, end: 999 });
    expect(resolveRange('bytes=0-', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  it('reads a suffix range as the last N bytes', () => {
    // The form used to read trailing container metadata. Treating it as "0 to 500" would
    // return the wrong end of the file and break duration detection.
    expect(resolveRange('bytes=-500', SIZE)).toEqual({ kind: 'partial', start: 500, end: 999 });
  });

  it('clamps a suffix longer than the file to the whole file', () => {
    expect(resolveRange('bytes=-5000', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  it('clamps an end past the last byte', () => {
    expect(resolveRange('bytes=900-5000', SIZE)).toEqual({ kind: 'partial', start: 900, end: 999 });
  });

  it('serves the final byte', () => {
    expect(resolveRange('bytes=999-', SIZE)).toEqual({ kind: 'partial', start: 999, end: 999 });
  });

  it('rejects a start at or past the end of the file', () => {
    expect(resolveRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(resolveRange('bytes=5000-6000', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('rejects a backwards range', () => {
    expect(resolveRange('bytes=800-200', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('rejects a bare "bytes=-"', () => {
    expect(resolveRange('bytes=-', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('never returns a negative end for an empty file', () => {
    // `size - 1` is -1 here, which would become a createReadStream with end: -1.
    expect(resolveRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
    expect(resolveRange(null, 0)).toEqual({ kind: 'full' });
  });

  it('tolerates whitespace around the header value', () => {
    expect(resolveRange('  bytes=10-20  ', SIZE)).toEqual({ kind: 'partial', start: 10, end: 20 });
  });
});
