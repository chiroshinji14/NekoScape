import { describe, expect, it, vi } from 'vitest';
import { CatAudioEngine } from '@/core/CatAudioEngine';
import { captureCanvasPhoto, formatPhotoFilename } from '@/core/PhotoCapture';
import { CAT_SOUND_EVENTS } from '@/types/simulation';

describe('CatAudioEngine — Procedural Web Audio Synthesizer', () => {
  it('is mute-by-default, uses 0.45 default volume, and clamps invalid or out-of-range volumes', () => {
    const engine = new CatAudioEngine();
    expect(engine.isEnabled()).toBe(false);
    expect(engine.getVolume()).toBeCloseTo(0.45, 5);
    expect(engine.getActiveVoiceCount()).toBe(0);

    engine.setVolume(1.8);
    expect(engine.getVolume()).toBe(1);

    engine.setVolume(-0.4);
    expect(engine.getVolume()).toBe(0);

    engine.setVolume(Number.NaN);
    expect(engine.getVolume()).toBe(0);

    engine.setVolume(0.62);
    expect(engine.getVolume()).toBeCloseTo(0.62, 5);

    engine.destroy();
  });

  it('is completely safe in headless Node without AudioContext across all 14 sound events', async () => {
    const engine = new CatAudioEngine({ enabled: false, volume: 0.5 });

    // Even when AudioContext is absent in Node, none of the lifecycle or play calls should throw
    expect(engine.isSupported()).toBe(false);
    await expect(engine.unlock()).resolves.toBe(false);

    for (const event of CAT_SOUND_EVENTS) {
      expect(engine.play(event)).toBe(false);
    }

    engine.setEnabled(true);
    expect(engine.isEnabled()).toBe(true);
    for (const event of CAT_SOUND_EVENTS) {
      expect(engine.play(event)).toBe(false);
    }

    engine.setEnabled(false);
    expect(engine.isEnabled()).toBe(false);
    engine.destroy();
    expect(engine.play('purr')).toBe(false);
  });

  it('plays and enforces polyphony + cooldown when a mock AudioContext is present', async () => {
    const createdOscs: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
    const mockParam = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });

    class MockAudioContext {
      state: AudioContextState = 'suspended';
      currentTime = 1.0;
      sampleRate = 44100;
      destination = {};

      resume = vi.fn(async () => {
        this.state = 'running';
      });
      suspend = vi.fn(async () => {
        this.state = 'suspended';
      });
      close = vi.fn(async () => {
        this.state = 'closed';
      });
      createGain = vi.fn(() => ({
        gain: mockParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBiquadFilter = vi.fn(() => ({
        type: 'bandpass',
        frequency: mockParam(),
        Q: mockParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createOscillator = vi.fn(() => {
        const osc = {
          type: 'sine',
          frequency: mockParam(),
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        createdOscs.push(osc);
        return osc;
      });
      createBuffer = vi.fn((_ch: number, len: number) => ({
        getChannelData: () => new Float32Array(len),
      }));
      createBufferSource = vi.fn(() => ({
        buffer: null as unknown,
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
    }

    vi.stubGlobal('AudioContext', MockAudioContext);
    try {
      const engine = new CatAudioEngine({ enabled: true, volume: 0.5, maxPolyphony: 2 });
      expect(engine.isSupported()).toBe(true);
      await expect(engine.unlock()).resolves.toBe(true);

      expect(engine.play('bell')).toBe(true);
      // Same sound immediately should be blocked by cooldown
      expect(engine.play('bell')).toBe(false);

      expect(engine.play('shutter')).toBe(true);
      // Third concurrent voice should be blocked by maxPolyphony: 2
      expect(engine.play('meow')).toBe(false);
      expect(engine.getActiveVoiceCount()).toBe(2);
      expect(createdOscs.length).toBeGreaterThan(0);

      engine.destroy();
      expect(engine.getActiveVoiceCount()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PhotoCapture — Filename Formatting & Snapshot Helpers', () => {
  it('formats deterministic filenames as nekoscape-YYYYMMDD-HHmmss.png and sanitizes prefixes', () => {
    const sampleDate = new Date(2026, 10, 21, 9, 5, 3); // 2026-11-21 09:05:03 local
    expect(formatPhotoFilename(sampleDate)).toBe('nekoscape-20261121-090503.png');
    expect(formatPhotoFilename(sampleDate, '  my shot:v2.png  ')).toBe(
      'my-shotv2-20261121-090503.png',
    );
  });

  it('hides UI elements during capture, triggers onFlash, prefers Pixi extract, and restores UI elements', async () => {
    const date = new Date(2026, 0, 2, 14, 30, 59);
    const uiEl = { style: { display: 'flex' } } as unknown as HTMLElement;
    const dockEl = { style: { display: 'block' } } as unknown as HTMLElement;
    let displayDuringFlash = '';
    const onFlash = vi.fn(() => {
      displayDuringFlash = uiEl.style.display;
    });

    const extractedCanvas = {
      width: 1920,
      height: 1080,
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
      toDataURL: vi.fn(() => 'data:image/png;base64,EXTRACTED'),
    } as unknown as HTMLCanvasElement;

    const fallbackCanvas = {
      width: 800,
      height: 600,
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
      toDataURL: vi.fn(() => 'data:image/png;base64,FALLBACK'),
    } as unknown as HTMLCanvasElement;

    const app = {
      stage: { label: 'root' },
      renderer: {
        render: vi.fn(),
        extract: {
          canvas: vi.fn(() => extractedCanvas),
        },
      },
    };

    const result = await captureCanvasPhoto(fallbackCanvas, {
      date,
      hideElements: [uiEl, null, dockEl],
      onFlash,
      app,
    });

    expect(result.ok).toBe(true);
    expect(result.filename).toBe('nekoscape-20260102-143059.png');
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.dataUrl).toBe('data:image/png;base64,EXTRACTED');
    expect(onFlash).toHaveBeenCalledTimes(1);
    expect(displayDuringFlash).toBe('none');
    expect(app.renderer.render).toHaveBeenCalledWith(app.stage);
    expect(app.renderer.extract.canvas).toHaveBeenCalledWith(app.stage);
    // Elements must be restored to original display values after capture
    expect(uiEl.style.display).toBe('flex');
    expect(dockEl.style.display).toBe('block');
  });

  it('restores hidden elements even if canvas extraction/encoding fails', async () => {
    const uiEl = { style: { display: 'grid' } } as unknown as HTMLElement;
    const brokenCanvas = {
      width: 1280,
      height: 720,
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
      toDataURL: vi.fn(() => ''),
    } as unknown as HTMLCanvasElement;

    const result = await captureCanvasPhoto(brokenCanvas, {
      hideElements: [uiEl],
      onFlash: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(uiEl.style.display).toBe('grid');
  });
});
