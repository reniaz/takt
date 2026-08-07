import { BAND_Q, BANDS, dbToGain, FLAT } from './eq';

/**
 * The playback graph.
 *
 *   deck A: <audio> -> source -> rgGain -> fadeGain -.
 *                                                     >- preGain -> [10 biquads] -> master -> analyser -> out
 *   deck B: <audio> -> source -> rgGain -> fadeGain -'
 *
 * Two decks, because gapless and crossfade both need the next track decoded and running
 * before the current one stops. One element cannot do that: changing `src` tears down the
 * decoder, and whatever buffer was in flight goes with it.
 *
 * ReplayGain sits on each deck rather than on the shared `preGain`, because during a
 * crossfade two tracks are audible at once and they rarely want the same correction. The
 * fade envelope is a separate node from the gain so the two can be written independently —
 * multiplying them by hand would mean recomputing the whole envelope every time a level
 * changed.
 *
 * `preGain` carries the EQ preamp and nothing else, ahead of the filters so it never
 * changes the shape of the curve. `master` is volume, after them, so turning it down never
 * alters the tone.
 */

/**
 * Volume is not linear.
 *
 * Perceived loudness tracks roughly the cube of amplitude, so a linear slider spends its
 * bottom third on changes nobody can hear and crams every useful step into the top.
 */
const VOLUME_CURVE = 2.5;

/** Ramp time for level changes. Short enough to feel instant, long enough not to click. */
const RAMP = 0.02;

/** How early the next track is told to buffer. */
const PRELOAD_LEAD = 15;

/**
 * How close to the end a gapless handover fires.
 *
 * `timeupdate` only fires about four times a second, which is far too coarse to hand over
 * on — so the position is polled on an animation frame instead and this is the margin that
 * absorbs the remaining jitter.
 */
const GAPLESS_LEAD = 0.12;

/** Points in a crossfade envelope. Enough that the curve is smooth, few enough to be free. */
const CURVE_STEPS = 64;

export type EngineEvents = {
  time: (position: number, duration: number) => void;
  ended: () => void;
  playing: (isPlaying: boolean) => void;
  error: (message: string) => void;
  /** The engine moved to the preloaded track on its own. The queue must catch up. */
  advanced: () => void;
};

export type NextTrack = { src: string; replayGainDb: number };

type Deck = {
  element: HTMLAudioElement;
  source?: MediaElementAudioSourceNode;
  rgGain?: GainNode;
  fadeGain?: GainNode;
};

function makeDeck(): Deck {
  const element = new Audio();
  element.preload = 'auto';
  /*
   * Volume is handled entirely in the graph. Using the element's own control as well would
   * put one stage outside it, where it cannot be ramped and does not compose with the
   * ReplayGain or the EQ preamp.
   */
  element.volume = 1;
  element.crossOrigin = 'anonymous';
  return { element };
}

export class Engine {
  private context: AudioContext | undefined;
  private preGain: GainNode | undefined;
  private master: GainNode | undefined;
  private analyser: AnalyserNode | undefined;
  private filters: BiquadFilterNode[] = [];

  private decks: [Deck, Deck] = [makeDeck(), makeDeck()];
  private active: 0 | 1 = 0;

  private next: NextTrack | undefined;
  private preloaded = false;
  private handingOver = false;
  private frame = 0;

  private volume = 1;
  private gains: number[] = [...FLAT];
  private preampDb = 0;
  private replayGainDb = 0;
  private crossfadeSeconds = 0;

  private listeners = new Map<keyof EngineEvents, Set<(...args: unknown[]) => void>>();

  constructor() {
    for (const deck of this.decks) this.wire(deck);
  }

  private get deck() {
    return this.decks[this.active];
  }

  private get idle() {
    return this.decks[this.active === 0 ? 1 : 0];
  }

  private wire(deck: Deck) {
    const { element } = deck;

    element.addEventListener('timeupdate', () => {
      if (deck === this.deck) this.emit('time', element.currentTime, this.duration);
    });
    element.addEventListener('loadedmetadata', () => {
      if (deck === this.deck) this.emit('time', element.currentTime, this.duration);
    });
    element.addEventListener('play', () => {
      if (deck === this.deck) { this.emit('playing', true); this.watch(); }
    });
    element.addEventListener('pause', () => {
      if (deck === this.deck) { this.emit('playing', false); this.unwatch(); }
    });
    element.addEventListener('ended', () => {
      // With a handover in flight the idle deck is already playing, and this is just the
      // old one running out — not the end of anything.
      if (deck === this.deck && !this.handingOver) this.emit('ended');
    });
    element.addEventListener('error', () => {
      if (deck !== this.deck) return;
      const code = element.error?.code;
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
   * warning for it. Deferring until the first play means it is always created inside a
   * gesture and starts running.
   */
  private ensureGraph() {
    if (this.context) return this.context;

    const context = new AudioContext();

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

    this.decks.forEach((deck, i) => {
      deck.source = context.createMediaElementSource(deck.element);
      deck.rgGain = context.createGain();
      deck.fadeGain = context.createGain();
      // Only the active deck is audible until a handover opens the other one.
      deck.fadeGain.gain.value = i === this.active ? 1 : 0;

      deck.source.connect(deck.rgGain).connect(deck.fadeGain).connect(preGain);
    });

    const chain: AudioNode[] = [preGain, ...this.filters, master, analyser];
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

    const { rgGain } = this.deck;
    if (rgGain) rgGain.gain.value = dbToGain(this.replayGainDb);

    return context;
  }

  private applyVolume() {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.volume ** VOLUME_CURVE, this.context.currentTime, RAMP);
  }

  private applyPreGain() {
    if (!this.context || !this.preGain) return;
    this.preGain.gain.setTargetAtTime(dbToGain(this.preampDb), this.context.currentTime, RAMP);
  }

  private applyBands() {
    if (!this.context) return;
    this.filters.forEach((filter, i) => {
      filter.gain.setTargetAtTime(this.gains[i] ?? 0, this.context!.currentTime, RAMP);
    });
  }

  /* ---------- handover ---------- */

  /**
   * What to play after the current track, or `undefined` if nothing should follow.
   *
   * Set by the queue whenever the order changes. Nothing is preloaded until the current
   * track is close to ending — buffering the next one immediately would spend bandwidth
   * and memory on a choice the listener may well change.
   */
  setNext(next: NextTrack | undefined) {
    if (next?.src === this.next?.src) return;

    this.next = next;
    this.preloaded = false;

    if (!next) {
      this.idle.element.removeAttribute('src');
      this.idle.element.load();
    }
  }

  setCrossfade(seconds: number) {
    this.crossfadeSeconds = Math.max(0, Math.min(12, seconds));
  }

  /**
   * Polls the playing deck on an animation frame.
   *
   * `timeupdate` fires roughly four times a second, so a handover driven by it would be up
   * to 250 ms late — audible as exactly the gap this exists to remove.
   */
  private watch() {
    if (this.frame) return;

    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      this.checkHandover();
    };

    this.frame = requestAnimationFrame(tick);
  }

  private unwatch() {
    if (!this.frame) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private checkHandover() {
    const { element } = this.deck;
    const duration = this.duration;
    if (!duration || this.handingOver || !this.next) return;

    const remaining = duration - element.currentTime;

    if (!this.preloaded && remaining <= Math.max(PRELOAD_LEAD, this.crossfadeSeconds + 2)) {
      this.preloaded = true;
      this.idle.element.src = this.next.src;
      this.idle.element.load();
    }

    const lead = this.crossfadeSeconds > 0 ? this.crossfadeSeconds : GAPLESS_LEAD;
    if (remaining <= lead) this.handover();
  }

  /** Equal power, so the total stays constant instead of dipping in the middle. */
  private fadeCurve(rising: boolean) {
    const curve = new Float32Array(CURVE_STEPS);
    for (let i = 0; i < CURVE_STEPS; i += 1) {
      const t = (i / (CURVE_STEPS - 1)) * (Math.PI / 2);
      curve[i] = rising ? Math.sin(t) : Math.cos(t);
    }
    return curve;
  }

  private handover() {
    const next = this.next;
    const context = this.context;
    if (!next || !context) return;

    this.handingOver = true;

    const from = this.deck;
    const to = this.idle;

    if (to.element.src !== next.src) {
      to.element.src = next.src;
      to.element.load();
    }

    to.element.currentTime = 0;
    if (to.rgGain) to.rgGain.gain.value = dbToGain(next.replayGainDb);

    void to.element.play().catch(() => {});

    const now = context.currentTime;
    const seconds = this.crossfadeSeconds;

    if (seconds > 0 && from.fadeGain && to.fadeGain) {
      from.fadeGain.gain.cancelScheduledValues(now);
      to.fadeGain.gain.cancelScheduledValues(now);
      from.fadeGain.gain.setValueCurveAtTime(this.fadeCurve(false), now, seconds);
      to.fadeGain.gain.setValueCurveAtTime(this.fadeCurve(true), now, seconds);
    } else {
      // Gapless: no fade at all. Anything else would be an audible dip exactly where the
      // recording expects continuity.
      if (from.fadeGain) from.fadeGain.gain.setValueAtTime(0, now);
      if (to.fadeGain) to.fadeGain.gain.setValueAtTime(1, now);
    }

    this.active = this.active === 0 ? 1 : 0;
    this.replayGainDb = next.replayGainDb;
    this.next = undefined;
    this.preloaded = false;

    // The outgoing deck keeps playing under the fade; stopping it once the fade is done
    // frees the decoder. With no fade it is silenced already.
    const stopAfter = seconds > 0 ? seconds * 1000 : 0;
    setTimeout(() => {
      from.element.pause();
      this.handingOver = false;
    }, stopAfter);

    this.emit('advanced');
    this.watch();
  }

  /* ---------- transport ---------- */

  get duration() {
    const value = this.deck.element.duration;
    return Number.isFinite(value) ? value : 0;
  }

  get position() {
    return this.deck.element.currentTime;
  }

  get paused() {
    return this.deck.element.paused;
  }

  /** For the visualizer. Undefined until the graph exists. */
  getAnalyser() {
    return this.analyser;
  }

  /**
   * Loads a track directly, cancelling any handover in progress.
   *
   * This is what an explicit choice does — clicking a track, or pressing next. It is
   * deliberately not how the queue advances on its own, which goes through `handover` so
   * the audio never stops.
   */
  load(src: string, replayGainDb = 0) {
    this.handingOver = false;
    this.next = undefined;
    this.preloaded = false;
    this.replayGainDb = replayGainDb;

    this.idle.element.pause();

    const { element, rgGain, fadeGain } = this.deck;
    if (rgGain) rgGain.gain.value = dbToGain(replayGainDb);
    if (fadeGain && this.context) {
      fadeGain.gain.cancelScheduledValues(this.context.currentTime);
      fadeGain.gain.value = 1;
    }
    if (this.idle.fadeGain && this.context) {
      this.idle.fadeGain.gain.cancelScheduledValues(this.context.currentTime);
      this.idle.fadeGain.gain.value = 0;
    }

    element.src = src;
    element.load();
  }

  async play() {
    const context = this.ensureGraph();
    if (context.state === 'suspended') await context.resume();

    try {
      await this.deck.element.play();
    } catch {
      // An aborted play() — because the source changed underneath it — is not an error
      // worth surfacing; the element fires its own `error` event for real failures.
    }
  }

  pause() {
    this.deck.element.pause();
    this.idle.element.pause();
  }

  async toggle() {
    if (this.deck.element.paused) await this.play();
    else this.pause();
  }

  seek(seconds: number) {
    const limit = this.duration;
    const { element } = this.deck;
    element.currentTime = limit ? Math.min(Math.max(0, seconds), limit) : Math.max(0, seconds);

    // Seeking backwards out of the handover window means the next track should no longer
    // be on its way in.
    this.preloaded = false;
    this.emit('time', element.currentTime, this.duration);
  }

  /**
   * Seeks as soon as the element knows how long the track is.
   *
   * Setting `currentTime` before metadata has loaded is silently ignored, which is what
   * happens when restoring a position at startup: the load has been asked for but nothing
   * has arrived over the protocol yet.
   */
  seekWhenReady(seconds: number) {
    const { element } = this.deck;

    if (element.readyState >= 1) {
      this.seek(seconds);
      return;
    }

    element.addEventListener('loadedmetadata', () => this.seek(seconds), { once: true });
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
    const { rgGain } = this.deck;
    if (rgGain && this.context) rgGain.gain.setTargetAtTime(dbToGain(db), this.context.currentTime, RAMP);
  }
}
