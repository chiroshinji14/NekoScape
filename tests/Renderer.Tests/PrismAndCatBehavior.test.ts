import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignCatToLaserTarget,
  computeLaserTargets,
  shouldEnterIdleNap,
} from '@/entities/PrismMath';
import type { SceneTheme as IpcSceneTheme } from '@/types/ipc';
import {
  CAT_STATES,
  DEFAULT_SETTINGS,
  IDLE_NAP_SECONDS,
  SCENE_THEMES,
  normalizeCatCount,
  type CatStateName,
  type NekoSettings,
  type SceneTheme,
} from '@/types/simulation';

describe('PrismMath & Cat Behavior Helpers', () => {
  it('returns 1 clamped crimson target normally and 3 distinct in-bounds targets when split', () => {
    const single = computeLaserTargets(
      { x: 5, y: 5 },
      { x: 640, y: 360 },
      40,
      1280,
      720,
      false,
    );
    expect(single.splitActive).toBe(false);
    expect(single.targets).toHaveLength(1);
    expect(single.targets[0].x).toBe(24);
    expect(single.targets[0].y).toBe(24);
    expect(single.targets[0].isSplitBeam).toBe(false);

    // Sweep cursor inside prism radius
    const splitByCursor = computeLaserTargets(
      { x: 650, y: 365 },
      { x: 640, y: 360 },
      40,
      1280,
      720,
      false,
    );
    expect(splitByCursor.splitActive).toBe(true);
    expect(splitByCursor.targets).toHaveLength(3);
    for (const target of splitByCursor.targets) {
      expect(target.isSplitBeam).toBe(true);
      expect(target.x).toBeGreaterThanOrEqual(24);
      expect(target.x).toBeLessThanOrEqual(1280 - 24);
      expect(target.y).toBeGreaterThanOrEqual(24);
      expect(target.y).toBeLessThanOrEqual(720 - 24);
    }

    // Verify all 3 target coordinates are distinct even if prism is near corner
    const cornerSplit = computeLaserTargets(
      { x: 30, y: 30 },
      { x: 32, y: 32 },
      40,
      1280,
      720,
      true,
    );
    expect(cornerSplit.splitActive).toBe(true);
    expect(cornerSplit.targets).toHaveLength(3);
    const coordKeys = new Set(
      cornerSplit.targets.map((t) => `${Math.round(t.x)},${Math.round(t.y)}`),
    );
    expect(coordKeys.size).toBe(3);
    for (const t of cornerSplit.targets) {
      expect(t.x).toBeGreaterThanOrEqual(24);
      expect(t.x).toBeLessThanOrEqual(1280 - 24);
      expect(t.y).toBeGreaterThanOrEqual(24);
      expect(t.y).toBeLessThanOrEqual(720 - 24);
    }
  });

  it('partitions cats deterministically across 3 split laser targets', () => {
    const { targets } = computeLaserTargets(
      { x: 640, y: 360 },
      { x: 640, y: 360 },
      40,
      1280,
      720,
      true,
    );

    const assigned = [0, 1, 2, 3, 4, 5].map((i) => assignCatToLaserTarget(i, targets));
    expect(assigned[0]?.id).toBe(targets[0].id);
    expect(assigned[1]?.id).toBe(targets[1].id);
    expect(assigned[2]?.id).toBe(targets[2].id);
    expect(assigned[3]?.id).toBe(targets[0].id);
    expect(assigned[4]?.id).toBe(targets[1].id);
    expect(assigned[5]?.id).toBe(targets[2].id);

    expect(assignCatToLaserTarget(0, [])).toBeNull();
  });

  it('triggers idle nap strictly at or above 300s (IDLE_NAP_SECONDS)', () => {
    expect(IDLE_NAP_SECONDS).toBe(300);
    expect(shouldEnterIdleNap(0)).toBe(false);
    expect(shouldEnterIdleNap(299.9)).toBe(false);
    expect(shouldEnterIdleNap(300)).toBe(true);
    expect(shouldEnterIdleNap(420)).toBe(true);
    expect(shouldEnterIdleNap(Number.NaN)).toBe(false);
  });

  it('defines all 13 SCENE_THEMES, default study sceneTheme, unlimited catCount, and 50 CatStateName contract', () => {
    expect(SCENE_THEMES).toEqual([
      'study',
      'tatami',
      'garden',
      'cafe',
      'living_room',
      'rainy_window',
      'night_balcony',
      'kitchen',
      'bedroom',
      'snowy_window',
      'sunbeam',
      'aquarium',
      'rooftop',
    ]);
    expect(DEFAULT_SETTINGS.sceneTheme).toBe('study');
    expect(normalizeCatCount(25)).toBe(25);
    expect(normalizeCatCount(100)).toBe(100);
    expect(normalizeCatCount(0)).toBe(1);

    const defaultJsonPath = resolve(__dirname, '../../config/default-settings.json');
    const jsonSettings = JSON.parse(readFileSync(defaultJsonPath, 'utf8')) as NekoSettings;
    expect(jsonSettings).toEqual(DEFAULT_SETTINGS);
    expect(jsonSettings.sceneTheme).toBe('study');

    const themeRef: IpcSceneTheme = DEFAULT_SETTINGS.sceneTheme;
    const typedTheme: SceneTheme = themeRef;
    expect(SCENE_THEMES).toContain(typedTheme);

    const allStates: readonly CatStateName[] = [...CAT_STATES];
    expect(new Set(allStates).size).toBe(50);
  });
});
