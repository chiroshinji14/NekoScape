import { describe, expect, it } from 'vitest';
import { SurfaceManager } from '@/core/SurfaceManager';
import { FRICTION_HARDWOOD, FRICTION_RUG } from '@/types/simulation';

describe('SurfaceManager', () => {
  it('centers and clamps rug bounds sensibly across viewport sizes', () => {
    const sm = new SurfaceManager(1920, 1080);
    const large = sm.getRugBounds();
    expect(large.width).toBe(880);
    expect(large.height).toBeCloseTo(1080 * 0.48, 3);
    expect(large.x).toBeCloseTo((1920 - large.width) / 2, 3);
    expect(large.y).toBeCloseTo((1080 - large.height) / 2, 3);
    expect(large.cornerRadius).toBe(28);

    sm.resize(400, 300);
    const small = sm.getRugBounds();
    expect(small.width).toBe(240);
    expect(small.height).toBe(180);
    expect(small.x).toBeCloseTo(80, 3);
    expect(small.y).toBeCloseTo(60, 3);
  });

  it('distinguishes hardwood vs rug surfaces and returns 0.82 vs 0.96 friction', () => {
    const sm = new SurfaceManager(1280, 720);
    const rug = sm.getRugBounds();

    // Center is on rug
    expect(sm.isOnRug(640, 360)).toBe(true);
    expect(sm.getSurfaceAt(640, 360)).toBe('rug');
    expect(sm.getFrictionAt(640, 360)).toBe(FRICTION_RUG);

    // Top-left corner of desktop is hardwood
    expect(sm.isOnRug(20, 20)).toBe(false);
    expect(sm.getSurfaceAt(20, 20)).toBe('hardwood');
    expect(sm.getFrictionAt(20, 20)).toBe(FRICTION_HARDWOOD);

    // Exact bounding box corner outside rounded radius is hardwood
    expect(sm.isOnRug(rug.x + 1, rug.y + 1)).toBe(false);
  });

  it('samples random rug spots strictly inside the rug bounds', () => {
    const sm = new SurfaceManager(1280, 720);
    const rug = sm.getRugBounds();
    const margin = 30;

    for (let i = 0; i < 50; i++) {
      const spot = sm.getRandomRugSpot(margin);
      expect(sm.isOnRug(spot.x, spot.y)).toBe(true);
      expect(spot.x).toBeGreaterThanOrEqual(rug.x + margin - 1e-6);
      expect(spot.x).toBeLessThanOrEqual(rug.x + rug.width - margin + 1e-6);
      expect(spot.y).toBeGreaterThanOrEqual(rug.y + margin - 1e-6);
      expect(spot.y).toBeLessThanOrEqual(rug.y + rug.height - margin + 1e-6);
    }
  });
});
