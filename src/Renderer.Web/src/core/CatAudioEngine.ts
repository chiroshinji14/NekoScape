import type { CatSoundEvent } from '../types/simulation';

export interface CatAudioEngineOptions {
  enabled?: boolean;
  volume?: number;
  maxPolyphony?: number;
}

const DEFAULT_ENABLED = false;
const DEFAULT_VOLUME = 0.45;
const DEFAULT_MAX_POLYPHONY = 4;
const MAX_PITCH_JITTER = 0.35;

/** Per-event cooldowns (ms) prevent audio spam even when 30+ cats act together. */
const SOUND_COOLDOWNS_MS: Readonly<Record<CatSoundEvent, number>> = {
  purr: 700,
  meow: 500,
  kitten_mew: 400,
  chirp: 320,
  trill: 420,
  chatter: 450,
  startle: 350,
  sneeze: 500,
  water_lap: 260,
  crunch: 240,
  bell: 280,
  bubble_pop: 140,
  crinkle: 300,
  shutter: 250,
};

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const scope = globalThis as Record<string, unknown>;
  const ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return typeof ctor === 'function' ? (ctor as AudioContextConstructor) : null;
}

function clampUnit(value: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * 100% procedural Web Audio API synthesizer for NekoScape cat vocals,
 * interactive toy cues, and Photo Mode shutter sound.
 * Safe in headless Node/Vitest environments where AudioContext is unavailable.
 */
export class CatAudioEngine {
  private enabled: boolean;
  private volume: number;
  private readonly maxPolyphony: number;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private activeVoices = 0;
  private destroyed = false;
  private readonly lastPlayedMs = new Map<CatSoundEvent, number>();
  private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: CatAudioEngineOptions = {}) {
    this.enabled = Boolean(options.enabled ?? DEFAULT_ENABLED);
    this.volume = clampUnit(options.volume ?? DEFAULT_VOLUME, DEFAULT_VOLUME);
    const poly = options.maxPolyphony ?? DEFAULT_MAX_POLYPHONY;
    this.maxPolyphony =
      typeof poly === 'number' && Number.isFinite(poly)
        ? Math.max(1, Math.round(poly))
        : DEFAULT_MAX_POLYPHONY;
  }

  public isSupported(): boolean {
    return resolveAudioContextConstructor() !== null;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getActiveVoiceCount(): number {
    return this.activeVoices;
  }

  public setEnabled(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.enabled === next || this.destroyed) {
      return;
    }
    this.enabled = next;

    if (this.ctx && this.masterGain) {
      this.syncMasterGain();
      if (this.enabled && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      } else if (!this.enabled && this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => {});
      }
    }
  }

  public setVolume(vol: number): void {
    const next = clampUnit(vol, this.volume);
    this.volume = next;
    if (this.ctx && this.masterGain) {
      this.syncMasterGain();
    }
  }

  public async unlock(): Promise<boolean> {
    if (this.destroyed) {
      return false;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return false;
    }
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      this.syncMasterGain();
      return ctx.state === 'running' || !this.enabled;
    } catch {
      return false;
    }
  }

  public play(event: CatSoundEvent, pitchJitter = 0.08): boolean {
    if (this.destroyed || !this.enabled || this.volume <= 0) {
      return false;
    }

    const cooldown = SOUND_COOLDOWNS_MS[event] ?? 300;
    const now = nowMs();
    const prev = this.lastPlayedMs.get(event) ?? -Infinity;
    if (now - prev < cooldown) {
      return false;
    }

    if (this.activeVoices >= this.maxPolyphony) {
      return false;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      return false;
    }

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const clampedJitter =
      typeof pitchJitter === 'number' && Number.isFinite(pitchJitter)
        ? Math.max(0, Math.min(MAX_PITCH_JITTER, pitchJitter))
        : 0;
    const pitchMul =
      clampedJitter > 0 ? 1 + (Math.random() * 2 - 1) * clampedJitter : 1;

    try {
      const durationSec = this.synthesizeEvent(
        ctx,
        this.masterGain,
        event,
        ctx.currentTime + 0.005,
        pitchMul,
      );
      this.lastPlayedMs.set(event, now);
      this.trackVoiceLifetime(durationSec);
      return true;
    } catch {
      return false;
    }
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.enabled = false;

    for (const timer of this.cleanupTimers) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.lastPlayedMs.clear();
    this.activeVoices = 0;
    this.noiseBuffer = null;

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore disconnect errors during teardown
      }
      this.masterGain = null;
    }

    if (this.ctx) {
      const closing = this.ctx;
      this.ctx = null;
      try {
        void closing.close().catch(() => {});
      } catch {
        // Ignore close errors in mocked or restricted audio environments
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    const Ctor = resolveAudioContextConstructor();
    if (!Ctor) {
      return null;
    }
    try {
      const ctx = new Ctor();
      const masterGain = ctx.createGain();
      masterGain.gain.value = this.enabled ? this.volume : 0;
      masterGain.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = masterGain;
      return ctx;
    } catch {
      return null;
    }
  }

  private syncMasterGain(): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    const target = this.enabled ? this.volume : 0;
    const t = this.ctx.currentTime;
    try {
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
      this.masterGain.gain.linearRampToValueAtTime(target, t + 0.03);
    } catch {
      this.masterGain.gain.value = target;
    }
  }

  private trackVoiceLifetime(durationSec: number): void {
    this.activeVoices++;
    const timeoutMs = Math.max(40, Math.ceil(durationSec * 1000) + 40);
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(timer);
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, timeoutMs);
    this.cleanupTimers.add(timer);
  }

  private getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.max(1024, Math.floor(sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private synthesizeEvent(
    ctx: AudioContext,
    dest: AudioNode,
    event: CatSoundEvent,
    t0: number,
    pitch: number,
  ): number {
    switch (event) {
      case 'purr':
        return this.synthPurr(ctx, dest, t0, pitch);
      case 'meow':
        return this.synthVocalSweep(ctx, dest, t0, {
          startHz: 410 * pitch,
          peakHz: 590 * pitch,
          endHz: 360 * pitch,
          formantHz: 940 * pitch,
          duration: 0.34,
          peakGain: 0.24,
        });
      case 'kitten_mew':
        return this.synthVocalSweep(ctx, dest, t0, {
          startHz: 790 * pitch,
          peakHz: 1080 * pitch,
          endHz: 740 * pitch,
          formantHz: 1550 * pitch,
          duration: 0.18,
          peakGain: 0.2,
        });
      case 'chirp':
        return this.synthTone(ctx, dest, t0, {
          type: 'sine',
          startHz: 660 * pitch,
          endHz: 1240 * pitch,
          duration: 0.13,
          attack: 0.014,
          peakGain: 0.2,
        });
      case 'trill':
        return this.synthTrill(ctx, dest, t0, pitch);
      case 'chatter':
        return this.synthChatter(ctx, dest, t0, pitch);
      case 'startle':
        return this.synthVocalSweep(ctx, dest, t0, {
          startHz: 560 * pitch,
          peakHz: 1320 * pitch,
          endHz: 880 * pitch,
          formantHz: 1700 * pitch,
          duration: 0.16,
          peakGain: 0.24,
        });
      case 'sneeze':
        this.synthNoiseBurst(ctx, dest, t0, {
          filterType: 'bandpass',
          freqHz: 2400 * pitch,
          q: 1.1,
          duration: 0.11,
          attack: 0.006,
          peakGain: 0.22,
        });
        this.synthTone(ctx, dest, t0, {
          type: 'sine',
          startHz: 260 * pitch,
          endHz: 130 * pitch,
          duration: 0.055,
          attack: 0.005,
          peakGain: 0.12,
        });
        return 0.12;
      case 'water_lap':
        this.synthTone(ctx, dest, t0, {
          type: 'sine',
          startHz: 370 * pitch,
          endHz: 820 * pitch,
          duration: 0.085,
          attack: 0.006,
          peakGain: 0.18,
        });
        this.synthNoiseBurst(ctx, dest, t0 + 0.012, {
          filterType: 'bandpass',
          freqHz: 1650 * pitch,
          q: 2.0,
          duration: 0.025,
          attack: 0.003,
          peakGain: 0.07,
        });
        return 0.095;
      case 'crunch':
        return this.synthStaggeredNoise(ctx, dest, t0, [0, 0.042, 0.084], {
          filterType: 'bandpass',
          freqHz: 2150 * pitch,
          q: 1.5,
          burstDuration: 0.028,
          peakGain: 0.16,
        });
      case 'bell':
        this.synthTone(ctx, dest, t0, {
          type: 'sine',
          startHz: 3600 * pitch,
          endHz: 3580 * pitch,
          duration: 0.16,
          attack: 0.003,
          peakGain: 0.16,
        });
        this.synthTone(ctx, dest, t0, {
          type: 'sine',
          startHz: 5400 * pitch,
          endHz: 5370 * pitch,
          duration: 0.12,
          attack: 0.003,
          peakGain: 0.11,
        });
        return 0.16;
      case 'bubble_pop':
        return this.synthTone(ctx, dest, t0, {
          type: 'sine',
          startHz: 440 * pitch,
          endHz: 1480 * pitch,
          duration: 0.065,
          attack: 0.004,
          peakGain: 0.2,
          exponentialFreq: true,
        });
      case 'crinkle':
        return this.synthStaggeredNoise(ctx, dest, t0, [0, 0.036, 0.078, 0.122], {
          filterType: 'highpass',
          freqHz: 3100 * pitch,
          q: 0.8,
          burstDuration: 0.034,
          peakGain: 0.13,
        });
      case 'shutter':
        this.synthNoiseBurst(ctx, dest, t0, {
          filterType: 'highpass',
          freqHz: 2600,
          q: 0.9,
          duration: 0.024,
          attack: 0.002,
          peakGain: 0.22,
        });
        this.synthTone(ctx, dest, t0, {
          type: 'triangle',
          startHz: 1450,
          endHz: 580,
          duration: 0.022,
          attack: 0.002,
          peakGain: 0.14,
        });
        this.synthNoiseBurst(ctx, dest, t0 + 0.038, {
          filterType: 'highpass',
          freqHz: 2900,
          q: 0.9,
          duration: 0.022,
          attack: 0.002,
          peakGain: 0.16,
        });
        this.synthTone(ctx, dest, t0 + 0.038, {
          type: 'triangle',
          startHz: 1850,
          endHz: 720,
          duration: 0.02,
          attack: 0.002,
          peakGain: 0.1,
        });
        return 0.08;
    }
  }

  private synthPurr(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    pitch: number,
  ): number {
    const duration = 0.56;
    const carrier = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    const amGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(58 * pitch, t0);
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(116 * pitch, t0);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.28;

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(26, t0);
    lfoDepth.gain.value = 0.36;
    amGain.gain.value = 0.56;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(230, t0);
    filter.Q.value = 0.9;

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.24, t0 + 0.12);
    env.gain.setValueAtTime(0.22, t0 + duration - 0.18);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    carrier.connect(amGain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(amGain);
    lfo.connect(lfoDepth);
    lfoDepth.connect(amGain.gain);

    amGain.connect(filter);
    filter.connect(env);
    env.connect(dest);

    carrier.start(t0);
    overtone.start(t0);
    lfo.start(t0);
    carrier.stop(t0 + duration + 0.01);
    overtone.stop(t0 + duration + 0.01);
    lfo.stop(t0 + duration + 0.01);

    return duration;
  }

  private synthVocalSweep(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    spec: {
      startHz: number;
      peakHz: number;
      endHz: number;
      formantHz: number;
      duration: number;
      peakGain: number;
    },
  ): number {
    const { startHz, peakHz, endHz, formantHz, duration, peakGain } = spec;
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const harmonicGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startHz, t0);
    osc.frequency.exponentialRampToValueAtTime(peakHz, t0 + duration * 0.35);
    osc.frequency.exponentialRampToValueAtTime(endHz, t0 + duration);

    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(startHz * 2, t0);
    harmonic.frequency.exponentialRampToValueAtTime(peakHz * 2, t0 + duration * 0.35);
    harmonic.frequency.exponentialRampToValueAtTime(endHz * 2, t0 + duration);
    harmonicGain.gain.value = 0.22;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(formantHz * 1.4, t0);
    filter.frequency.exponentialRampToValueAtTime(formantHz * 0.85, t0 + duration);
    filter.Q.value = 1.6;

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peakGain, t0 + Math.min(0.035, duration * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(filter);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(filter);
    filter.connect(env);
    env.connect(dest);

    osc.start(t0);
    harmonic.start(t0);
    osc.stop(t0 + duration + 0.01);
    harmonic.stop(t0 + duration + 0.01);

    return duration;
  }

  private synthTrill(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    pitch: number,
  ): number {
    const duration = 0.22;
    const osc = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    const env = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(510 * pitch, t0);
    osc.frequency.exponentialRampToValueAtTime(890 * pitch, t0 + duration);

    vib.type = 'sine';
    vib.frequency.setValueAtTime(28, t0);
    vibGain.gain.value = 42;

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.2, t0 + 0.025);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    vib.connect(vibGain);
    vibGain.connect(osc.frequency);
    osc.connect(env);
    env.connect(dest);

    osc.start(t0);
    vib.start(t0);
    osc.stop(t0 + duration + 0.01);
    vib.stop(t0 + duration + 0.01);

    return duration;
  }

  private synthChatter(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    pitch: number,
  ): number {
    const offsets = [0, 0.068, 0.136];
    for (let i = 0; i < offsets.length; i++) {
      const start = t0 + offsets[i];
      const stepPitch = pitch * (1 + i * 0.04);
      this.synthTone(ctx, dest, start, {
        type: 'triangle',
        startHz: 940 * stepPitch,
        endHz: 680 * stepPitch,
        duration: 0.042,
        attack: 0.004,
        peakGain: 0.14,
      });
      this.synthNoiseBurst(ctx, dest, start, {
        filterType: 'bandpass',
        freqHz: 2200 * stepPitch,
        q: 2.2,
        duration: 0.024,
        attack: 0.002,
        peakGain: 0.09,
      });
    }
    return 0.19;
  }

  private synthTone(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    spec: {
      type: OscillatorType;
      startHz: number;
      endHz: number;
      duration: number;
      attack: number;
      peakGain: number;
      exponentialFreq?: boolean;
    },
  ): number {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.startHz, t0);
    if (spec.exponentialFreq) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, spec.endHz),
        t0 + spec.duration,
      );
    } else {
      osc.frequency.linearRampToValueAtTime(spec.endHz, t0 + spec.duration);
    }

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(spec.peakGain, t0 + spec.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);

    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + spec.duration + 0.01);
    return spec.duration;
  }

  private synthNoiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    spec: {
      filterType: BiquadFilterType;
      freqHz: number;
      q: number;
      duration: number;
      attack: number;
      peakGain: number;
    },
  ): number {
    const src = ctx.createBufferSource();
    src.buffer = this.getOrCreateNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = spec.filterType;
    filter.frequency.setValueAtTime(spec.freqHz, t0);
    filter.Q.value = spec.q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(spec.peakGain, t0 + spec.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);
    src.start(t0);
    src.stop(t0 + spec.duration + 0.01);
    return spec.duration;
  }

  private synthStaggeredNoise(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    offsets: readonly number[],
    spec: {
      filterType: BiquadFilterType;
      freqHz: number;
      q: number;
      burstDuration: number;
      peakGain: number;
    },
  ): number {
    let maxEnd = 0;
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      const freqJitter = 1 + ((i % 2 === 0 ? 1 : -1) * 0.12);
      this.synthNoiseBurst(ctx, dest, t0 + offset, {
        filterType: spec.filterType,
        freqHz: spec.freqHz * freqJitter,
        q: spec.q,
        duration: spec.burstDuration,
        attack: 0.003,
        peakGain: spec.peakGain,
      });
      maxEnd = Math.max(maxEnd, offset + spec.burstDuration);
    }
    return maxEnd;
  }
}
