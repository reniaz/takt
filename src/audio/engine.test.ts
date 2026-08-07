import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Engine } from './engine';

/**
 * The graph's opening values.
 *
 * A spike here is silent in every test that only checks the final level, and audible to
 * anyone who launches the app — the first moment of the first track came out at full
 * volume. What makes it possible is that `setTargetAtTime` approaches a target from
 * wherever the parameter already is, and a fresh GainNode is at 1.0.
 */

type FakeParam = { value: number; calls: string[] };

function fakeParam(initial: number): FakeParam & Record<string, unknown> {
  const param = {
    value: initial,
    calls: [] as string[],
    setTargetAtTime(target: number) { param.calls.push(`target:${target}`); },
    setValueAtTime(target: number) { param.calls.push(`at:${target}`); param.value = target; },
    cancelScheduledValues() {},
    setValueCurveAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  };
  return param as FakeParam & Record<string, unknown>;
}

function node(gainStart = 1) {
  const self: Record<string, unknown> = {
    gain: fakeParam(gainStart),
    frequency: fakeParam(0),
    Q: fakeParam(0),
    type: '',
    connect: (to: unknown) => to,
    disconnect: () => {},
  };
  return self;
}

const created: Record<string, unknown>[] = [];

beforeEach(() => {
  created.length = 0;

  class FakeContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48000;
    destination = node();

    createGain() { const n = node(1); created.push(n); return n; }
    createBiquadFilter() { const n = node(1); created.push(n); return n; }
    createAnalyser() { return { ...node(), fftSize: 2048, smoothingTimeConstant: 0.8, frequencyBinCount: 1024 }; }
    createMediaElementSource() { return node(); }
    resume() { return Promise.resolve(); }
  }

  vi.stubGlobal('AudioContext', FakeContext);
  // The engine constructs media elements; jsdom's cannot play, which does not matter here.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

describe('graph construction', () => {
  it('opens at the configured volume instead of ramping down from full', async () => {
    const engine = new Engine();
    engine.setVolume(0.5);

    await engine.play();

    // The master gain is the last plain gain node built: decks' rg/fade gains, then
    // preGain, then master.
    const assigned = created.filter((n) => (n.gain as FakeParam).value !== 1);
    expect(assigned.length).toBeGreaterThan(0);

    // Nothing may be left sitting at 1.0 waiting for a ramp to bring it down.
    const master = created.find((n) => Math.abs((n.gain as FakeParam).value - 0.5 ** 2.5) < 1e-6);
    expect(master, 'master gain should be assigned directly, not ramped').toBeDefined();
  });

  it('assigns rather than schedules the opening values', async () => {
    const engine = new Engine();
    engine.setVolume(0.5);

    await engine.play();

    const master = created.find((n) => Math.abs((n.gain as FakeParam).value - 0.5 ** 2.5) < 1e-6);
    const calls = (master?.gain as FakeParam).calls;

    // `setTargetAtTime` here is what produced the spike: it starts from 1.0 and decays.
    expect(calls.some((c) => c.startsWith('target:'))).toBe(false);
  });

  it('applies a saved equalizer curve without sliding into it', async () => {
    const engine = new Engine();
    const gains = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3];
    engine.setEqGains(gains);

    await engine.play();

    // Every band should already hold its value the moment the graph exists.
    for (const gain of gains) {
      expect(created.some((n) => (n.gain as FakeParam).value === gain)).toBe(true);
    }
  });
});
