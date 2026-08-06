import { describe, expect, it } from 'vitest';

import { extractNotes, selectPreviousTag } from './notes.mjs';

describe('extractNotes', () => {
  it('takes only the trailered lines', () => {
    const log = [
      'Player: Fix the seek bar',
      '',
      'Release-note: Seeking no longer jumps back a second',
      '',
      'Dev: Bump a dependency',
      '',
      'Nothing user-facing here.',
    ].join('\n');

    expect(extractNotes(log)).toEqual(['Seeking no longer jumps back a second']);
  });

  it('drops exact duplicates', () => {
    const log = 'Release-note: Adds an equalizer\nRelease-note: Adds an equalizer';
    expect(extractNotes(log)).toEqual(['Adds an equalizer']);
  });

  it('drops an earlier note that the fuller one grew out of', () => {
    // Newest first, so the grown line arrives before its own beginning.
    const log = [
      'Release-note: Adds an equalizer with presets',
      'Release-note: Adds an equalizer',
    ].join('\n');

    expect(extractNotes(log)).toEqual(['Adds an equalizer with presets']);
  });

  it('is indifferent to leading whitespace and case', () => {
    const log = '\trelease-note:   Trimmed and matched  ';
    expect(extractNotes(log)).toEqual(['Trimmed and matched']);
  });

  it('returns nothing when no commit opted in', () => {
    expect(extractNotes('Refactoring: move a file\n\nNo trailer at all.')).toEqual([]);
  });
});

describe('selectPreviousTag', () => {
  // Version-sorted descending, which is how release.mjs asks git for them.
  const tags = ['v0.10.0', 'v0.9.0', 'v0.2.0', 'v0.1.0'];

  it('returns the next tag down the version order', () => {
    expect(selectPreviousTag(tags, 'v0.10.0')).toBe('v0.9.0');
    expect(selectPreviousTag(tags, 'v0.2.0')).toBe('v0.1.0');
  });

  it('returns undefined for the very first release', () => {
    expect(selectPreviousTag(tags, 'v0.1.0')).toBeUndefined();
  });

  it('returns undefined when the tag is not in the list', () => {
    expect(selectPreviousTag(tags, 'v9.9.9')).toBeUndefined();
  });
});
