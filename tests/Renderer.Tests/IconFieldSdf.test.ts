import { describe, expect, it, vi } from 'vitest';
import {
  clearIconSdfWarpCache,
  computeIconSdfGrid,
  sampleIconSdf,
} from '@/core/IconFieldSdf';
import { PerlinNoise } from '@/core/PerlinNoise';
import type { AabbRect } from '@/types/simulation';

describe('PerlinNoise', () => {
  it('is deterministic per seed, bounded strictly within [-1, 1], and varies by seed', () => {
    const n1 = new PerlinNoise(42);
    const n1Copy = new PerlinNoise(42);
    const n2 = new PerlinNoise(99);

    let differs = false;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 15;
      const y = i * 0.23 + 4;
      const v1 = n1.noise2D(x, y);
      const v1Copy = n1Copy.noise2D(x, y);
      const f1 = n1.fbm2D(x, y, 4);
      const v2 = n2.noise2D(x, y);

      expect(v1).toBe(v1Copy);
      expect(v1).toBeGreaterThanOrEqual(-1);
      expect(v1).toBeLessThanOrEqual(1);
      expect(f1).toBeGreaterThanOrEqual(-1);
      expect(f1).toBeLessThanOrEqual(1);
      if (Math.abs(v1 - v2) > 1e-6) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
    expect(n1.noise2D(Number.NaN, 0)).toBe(0);
    expect(n1.fbm2D(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('IconFieldSdf', () => {
  it('returns negative distance inside icons and positive distance far away', () => {
    const icons: AabbRect[] = [
      { id: 1, x: 100, y: 100, width: 72, height: 72, label: 'Projects' },
    ];
    const grid = computeIconSdfGrid(icons, 600, 400);

    const inside = sampleIconSdf(grid, 136, 136);
    const farOutside = sampleIconSdf(grid, 500, 350);

    expect(inside).toBeLessThan(-20);
    expect(farOutside).toBeGreaterThan(200);
  });

  it('smoothly merges adjacent icons into an organic bridge', () => {
    const iconA: AabbRect = { id: 1, x: 100, y: 100, width: 70, height: 70, label: 'A' };
    const iconB: AabbRect = { id: 2, x: 196, y: 100, width: 70, height: 70, label: 'B' };

    const gridMerged = computeIconSdfGrid([iconA, iconB], 500, 400, {
      blendK: 30,
      padding: 12,
      warpAmp: 0,
    });
    const gridSingleA = computeIconSdfGrid([iconA], 500, 400, {
      blendK: 30,
      padding: 12,
      warpAmp: 0,
    });

    // Midpoint between iconA (right=170, padded=182) and iconB (left=196, padded=184)
    const midX = 183;
    const midY = 135;
    const mergedVal = sampleIconSdf(gridMerged, midX, midY);
    const singleVal = sampleIconSdf(gridSingleA, midX, midY);

    // Smooth-min bridges the gap into negative mat territory
    expect(singleVal).toBeGreaterThan(0);
    expect(mergedVal).toBeLessThan(0);
    expect(mergedVal).toBeLessThan(singleVal);
  });

  it('fills grid with large positive values when icons array is empty', () => {
    const grid = computeIconSdfGrid([], 320, 240);
    expect(sampleIconSdf(grid, 160, 120)).toBe(2000);
    expect(grid.values.every((v) => v === 2000)).toBe(true);
    expect(grid.dirtyBounds).toBeUndefined();
  });

  it('fast-skips distant regions and matches unbounded SDF inside active bounds', () => {
    clearIconSdfWarpCache();
    const icons: AabbRect[] = [
      { id: 1, x: 48, y: 48, width: 72, height: 72, label: 'Projects' },
      { id: 2, x: 48, y: 144, width: 72, height: 72, label: 'Notes' },
    ];

    // Full 1920x1080 viewport with icons clustered on top-left cuts evaluated cells by >75%
    const fullView = computeIconSdfGrid(icons, 1920, 1080);
    expect(fullView.dirtyBounds).toBeDefined();
    const db = fullView.dirtyBounds!;
    const evaluatedCells = (db.maxCol - db.minCol + 1) * (db.maxRow - db.minRow + 1);
    const totalCells = fullView.cols * fullView.rows;
    expect(evaluatedCells).toBeLessThan(totalCells * 0.25);
    expect(sampleIconSdf(fullView, 84, 84)).toBeLessThan(-20);
    expect(sampleIconSdf(fullView, 1600, 900)).toBe(2000);

    // Explicit bounds around one icon in a multi-icon layout skips icons outside bounds
    const twoFarIcons: AabbRect[] = [
      { id: 1, x: 100, y: 100, width: 72, height: 72, label: 'Left' },
      { id: 2, x: 800, y: 600, width: 72, height: 72, label: 'Right' },
    ];
    const unbounded = computeIconSdfGrid(twoFarIcons, 1000, 800);
    const bounded = computeIconSdfGrid(twoFarIcons, 1000, 800, {
      bounds: { minX: 60, minY: 60, maxX: 220, maxY: 220 },
    });

    expect(bounded.dirtyBounds).toEqual({
      minCol: 15,
      maxCol: 55,
      minRow: 15,
      maxRow: 55,
    });
    expect(sampleIconSdf(bounded, 136, 136)).toBeCloseTo(sampleIconSdf(unbounded, 136, 136), 5);
    expect(sampleIconSdf(bounded, 172, 136)).toBeCloseTo(sampleIconSdf(unbounded, 172, 136), 5);
    // Second icon is outside bounds so its region remains 2000
    expect(sampleIconSdf(bounded, 836, 636)).toBe(2000);

    // Non-intersecting bounds leave entire grid at 2000 with no dirtyBounds
    const disjoint = computeIconSdfGrid([twoFarIcons[0]], 1000, 800, {
      bounds: { minX: 600, minY: 500, maxX: 800, maxY: 700 },
    });
    expect(disjoint.dirtyBounds).toBeUndefined();
    expect(disjoint.values.every((v) => v === 2000)).toBe(true);
  });

  it('caches static FBM warp fields during icon drags with an LRU capacity of 4', () => {
    clearIconSdfWarpCache();
    const fbmSpy = vi.spyOn(PerlinNoise.prototype, 'fbm2D');

    try {
      const iconStart: AabbRect = { id: 1, x: 80, y: 80, width: 64, height: 64, label: 'DragMe' };
      const iconDragged: AabbRect = { id: 1, x: 240, y: 180, width: 64, height: 64, label: 'DragMe' };

      const grid1 = computeIconSdfGrid([iconStart], 640, 480, {
        step: 16,
        seed: 701,
        warpAmp: 4,
      });
      const expectedCalls = grid1.cols * grid1.rows;
      expect(fbmSpy).toHaveBeenCalledTimes(expectedCalls);

      // Dragging the icon with identical grid dimensions/seed/warpAmp reuses cached warp
      const gridDragged = computeIconSdfGrid([iconDragged], 640, 480, {
        step: 16,
        seed: 701,
        warpAmp: 4,
      });
      expect(fbmSpy).toHaveBeenCalledTimes(expectedCalls);

      // Compare against fresh uncached computation at dragged location
      clearIconSdfWarpCache();
      fbmSpy.mockClear();
      const gridFresh = computeIconSdfGrid([iconDragged], 640, 480, {
        step: 16,
        seed: 701,
        warpAmp: 4,
      });
      expect(fbmSpy).toHaveBeenCalledTimes(expectedCalls);
      expect(sampleIconSdf(gridDragged, 272, 212)).toBeCloseTo(
        sampleIconSdf(gridFresh, 272, 212),
        5,
      );

      // Verify LRU max 4 entries eviction policy
      clearIconSdfWarpCache();
      fbmSpy.mockClear();
      const smallIcon: AabbRect = { id: 9, x: 32, y: 32, width: 48, height: 48, label: 'Small' };

      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 1, warpAmp: 4 });
      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 2, warpAmp: 4 });
      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 3, warpAmp: 4 });
      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 4, warpAmp: 4 });
      const afterFour = fbmSpy.mock.calls.length;

      // Refresh seed 1 so seed 2 becomes least recently used
      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 1, warpAmp: 4 });
      expect(fbmSpy).toHaveBeenCalledTimes(afterFour);

      // Inserting seed 5 evicts seed 2 while keeping seed 1 cached
      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 5, warpAmp: 4 });
      const afterFive = fbmSpy.mock.calls.length;
      expect(afterFive).toBeGreaterThan(afterFour);

      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 1, warpAmp: 4 });
      expect(fbmSpy).toHaveBeenCalledTimes(afterFive);

      computeIconSdfGrid([smallIcon], 160, 120, { step: 16, seed: 2, warpAmp: 4 });
      expect(fbmSpy.mock.calls.length).toBeGreaterThan(afterFive);
    } finally {
      fbmSpy.mockRestore();
      clearIconSdfWarpCache();
    }
  });
});
