import { describe, expect, it } from 'vitest';

import { formatTime, parseTimeInput } from './time';

describe('formatTime', () => {
  it('formats under an hour without an hours segment', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(83)).toBe('1:23');
    expect(formatTime(599)).toBe('9:59');
  });

  it('pads minutes once hours appear', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3730)).toBe('1:02:10');
  });

  it('survives the values a media element actually produces before metadata loads', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('parseTimeInput', () => {
  const at = (raw: string) => parseTimeInput(raw, 100, 300);

  it('reads plain seconds', () => {
    expect(at('83')).toBe(83);
    expect(at('0')).toBe(0);
  });

  it('reads clock time', () => {
    expect(at('1:23')).toBe(83);
    expect(at('1:02:03')).toBe(3723 > 300 ? 300 : 3723);
    expect(parseTimeInput('1:02:03', 0, 7200)).toBe(3723);
  });

  it('treats a single digit after the colon as seconds, not tens', () => {
    expect(at('1:2')).toBe(62);
  });

  it('applies relative jumps against the current position', () => {
    expect(at('+15')).toBe(115);
    expect(at('-30')).toBe(70);
    expect(at('+ 15')).toBe(115);
    expect(at('-1:00')).toBe(40);
  });

  it('clamps to the track', () => {
    expect(at('9999')).toBe(300);
    expect(at('-9999')).toBe(0);
  });

  it('rejects what it cannot read rather than seeking to NaN', () => {
    expect(at('')).toBeUndefined();
    expect(at('   ')).toBeUndefined();
    expect(at('abc')).toBeUndefined();
    expect(at('1:2:3:4')).toBeUndefined();
    expect(at('1::2')).toBeUndefined();
    expect(at(':30')).toBeUndefined();
    expect(at('1:-2')).toBeUndefined();
  });

  it('falls back to the typed value when the duration is not known yet', () => {
    expect(parseTimeInput('120', 0, Number.NaN)).toBe(120);
    expect(parseTimeInput('120', 0, Number.POSITIVE_INFINITY)).toBe(120);
  });
});
