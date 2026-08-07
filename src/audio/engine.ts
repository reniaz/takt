import { BAND_Q, BANDS, dbToGain, FLAT } from './eq';

/**
 * The playback graph.
 *
 *   <audio> -> source -> preGain -> [ 10 biquads ] -> master -> analyser -> destination
 *
 * `preGain` is where ReplayGain and the EQ preamp land, ahead of the filters, so neither
 * changes the shape of the EQ curve. `master` is volume, after the filters, so turning it
 * down never alters the tone.
 *
 * The filter chain exists from the start even when every band is flat. A flat biquad is
 * transparent and costs nothing measurable, and building it up front means enabling the
 * equalizer later is a parameter change rather than a graph rebuild — reconnecting nodes
 * mid-playback is audible.
 */

/**
 * Volume is not linear.
 *
 * Perceived loudness tracks roughly the cube of amplitude, so a linear slider spends its
 * bottom third on changes nobody can hear and crams every useful step into the top. The
 * exponent maps slider travel onto something that feels evenly spaced.
 */
const VOLUME_CURVE = 2.5;

/** Ramp time for volume changes. Short enough to feel instant, long enough to not click. */
const RAMP = 0.02;

export type EngineEvents = {
  time: (position: number, duration: number) => void;
  ended: () => void;
  playing: (isPlaying: boolean) => void;
  error: (message: string) => void;
};

export class Engine {
  readonly element: HTMLAudioElement;

  private context: AudioContext | undefined;
  private preGain: GainNode | undefined;
  private master: GainNode | undefined;
  private analyser: AnalyserNode | undefined;
  private filters: BiquadFilterNode[] = [];

  private volume = 1;
  private gains: number[] = [...FLAT];
  private preampDb = 0;
  private replayGainDb = 0;

  /*
   * Erased to a common call signature. A `{ [K]: Set<EngineEvents[K]> }` map cannot be
   * written to through a generic key — TypeScript has to assume the worst case, which is
   * the intersection of every listener type, and nothing satisfies that.
   */
  private listeners = new Map<keyof EngineEvents, Set<(...args: unknown[]) => void>>();

  constructor() {
    this.element = new Audio();
    this.element.preload = 'auto';
    /*
     * Volume is handled by the master GainNode, never by the element. Using both would
     * put one control outside the graph, where it could not be ramped and would not
     * compose with the EQ preamp.
     */
    this.element.volume = 1;
    this.element.crossOrigin = 'anonymous';

    this.element.addEventListener('timeupdate', () => {
      this.emit('time', this.element.currentTime, this.duration);
    });
    this.element.addEventListener('loadedmetadata', () => {
      this.emit('time', this.element.currentTime, this.duration);
    });
    this.element.addEventListener('ended', () => this.emit('ended'));
    this.element.addEventListener('play', () => this.emit('playing', true));
    this.element.addEventListener('pause', () => this.emit('playing', false));
    this.element.addEventListener('error', () => {
      const code = this.element.error?.code;
      this.emit('error', code === 4 ? 'Unsupported or unreadable file' : 'Playback failed');
    });
  }

  /* ---------- events ---------- */

  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    const fn = listener as (...args: unknown[]) => void;
    set.add(fn);
    return () => { set.delete(fn); };
  }

  private emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  /* ---------- graph ---------- */

  /**
   * Built on first play rather than in the constructor.
   *
   * An AudioContext created before any user gesture starts suspended, and Chromium logs a
   * warning for it. Deferring until the first play means the context is always created
   * inside a gesture and starts running.
   */
  private ensureGraph() {
    if (this.context) return this.context;

    const context = new AudioContext();
    const source = context.createMediaElementSource(this.element);

    const preGain = context.createGain();
    const master = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    this.filters = BANDS.map((band) => {
      const filter = context.createBiquadFilter();
      filter.type = band.kind;
      filter.frequency.value = band.frequency;
      filter.Q.value = BAND_Q;
      filter.gain.value = 0;
      return filter;
    });

    const chain: AudioNode[] = [source, preGain, ...this.filters, master, analyser];
    for (let i = 0; i < chain.length - 1; i += 1) {
      (chain[i] as AudioNode).connect(chain[i + 1] as AudioNode);
    }
    analyser.connect(context.destination);

    this.context = context;
    this.preGain = preGain;
    this.master = master;
    this.analyser = analyser;

    this.applyVolume();
    this.applyPreGain();
    this.applyBands();

    return context;
  }

  private applyVolume() {
    if (!this.context || !this.master) return;
    const target = this.volume ** VOLUME_CURVE;
    this.master.gain.setTargetAtTime(target, this.context.currentTime, RAMP);
  }

  private applyPreGain() {
    if (!this.context || !this.preGain) return;
    const target = dbToGain(this.preampDb + this.replayGainDb);
    this.preGain.gain.setTargetAtTime(target, this.context.currentTime, RAMP);
  }

  private applyBands() {
    if (!this.context) return;
    this.filters.forEach((filter, i) => {
      filter.gain.setTargetAtTime(this.gains[i] ?? 0, this.context!.currentTime, RAMP);
    });
  }

  /* ---------- transport ---------- */

  get duration() {
    const value = this.element.duration;
    return Number.isFinite(value) ? value : 0;
  }

  get position() {
    return this.element.currentTime;
  }

  get paused() {
    return this.element.paused;
  }

  load(src: string) {
    this.element.src = src;
    this.element.load();
  }

  async play() {
    const context = this.ensureGraph();
    if (context.state === 'suspended') await context.resume();

    try {
      await this.element.play();
    } catch {
      // An aborted play() — because the source changed underneath it — is not an error
      // worth surfacing; the element fires its own `error` event for real failures.
    }
  }

  pause() {
    this.element.pause();
  }

  async toggle() {
    if (this.element.paused) await this.play();
    else this.pause();
  }

  seek(seconds: number) {
    const limit = this.duration;
    this.element.currentTime = limit ? Math.min(Math.max(0, seconds), limit) : Math.max(0, seconds);
    this.emit('time', this.element.currentTime, this.duration);
  }

  /**
   * Seeks as soon as the element knows how long the track is.
   *
   * Setting `currentTime` before metadata has loaded is silently ignored, which is what
   * happens when restoring a position at startup: the load has been asked for but nothing
   * has arrived over the protocol yet.
   */
  seekWhenReady(seconds: number) {
    if (this.element.readyState >= 1) {
      this.seek(seconds);
      return;
    }

    this.element.addEventListener('loadedmetadata', () => this.seek(seconds), { once: true });
  }

  /* ---------- levels ---------- */

  /** `value` is slider travel, 0–1. The perceptual curve is applied inside. */
  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    this.applyVolume();
  }

  setEqGains(gains: readonly number[]) {
    this.gains = [...gains];
    this.applyBands();
  }

  setPreamp(db: number) {
    this.preampDb = db;
    this.applyPreGain();
  }

  setReplayGain(db: number) {
    this.replayGainDb = db;
    this.applyPreGain();
  }

  /** For the visualizer. Returns undefined until the graph exists. */
  getAnalyser() {
    return this.analyser;
  }
}
