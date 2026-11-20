import { describe, expect, it } from 'vitest';
import { SurfaceManager } from '@/core/SurfaceManager';
import {
  InteractivePropWorld,
  computeScenePropDefinitions,
  isPropAttracting,
} from '@/environment/InteractiveProp';
import { SCENE_THEMES, type SceneTheme } from '@/types/simulation';

describe('InteractivePropWorld — Interactive Props Across All 4 Scenes', () => {
  it('populates 4 distinct interactive props in every scene clear of the central rug and FAB zone', () => {
    const surface = new SurfaceManager(1280, 720);
    const rug = surface.getRugBounds();

    const expectedKindsByScene: Record<SceneTheme, string[]> = {
      study: ['brass_lamp', 'monstera_scratcher', 'coffee_mug', 'leather_journal'],
      tatami: ['tetsubin_tea', 'andon_lantern', 'zabuton_cushion', 'bamboo_clacker'],
      garden: ['koi_birdbath', 'wind_chime', 'catnip_planter', 'butterfly_stone'],
      cafe: ['latte_saucer', 'cat_tree_tower', 'donut_cat_bed', 'treat_jar'],
    };

    for (const theme of SCENE_THEMES) {
      const defs = computeScenePropDefinitions(theme, 1280, 720, rug);
      expect(defs).toHaveLength(4);
      expect(defs.map((d) => d.kind)).toEqual(expectedKindsByScene[theme]);

      for (const prop of defs) {
        expect(prop.scene).toBe(theme);
        expect(prop.radius).toBeGreaterThanOrEqual(28);
        expect(prop.attractRadius).toBeGreaterThanOrEqual(200);
        expect(prop.interactPoint).toBeDefined();

        // Props must not overlap the bottom-right FAB exclusion footprint (114x114)
        const inFabZone = prop.x + prop.radius > 1280 - 114 && prop.y + prop.radius > 720 - 114;
        expect(inFabZone).toBe(false);

        // Props must stay outside the central rug rectangle
        const insideRug =
          prop.x > rug.x + prop.radius &&
          prop.x < rug.x + rug.width - prop.radius &&
          prop.y > rug.y + prop.radius &&
          prop.y < rug.y + rug.height - prop.radius;
        expect(insideRug).toBe(false);
      }

      // Pairwise props in the same scene must not overlap
      for (let i = 0; i < defs.length; i++) {
        for (let j = i + 1; j < defs.length; j++) {
          const dist = Math.hypot(defs[j].x - defs[i].x, defs[j].y - defs[i].y);
          expect(dist).toBeGreaterThanOrEqual(defs[i].radius + defs[j].radius);
        }
      }
    }
  });

  it('hit-tests pointer hover and click on every prop across all 4 scenes, triggering particles and cat attraction', () => {
    const surface = new SurfaceManager(1280, 720);
    const rug = surface.getRugBounds();
    const world = new InteractivePropWorld(1280, 720, rug, 'study');

    for (const theme of SCENE_THEMES) {
      world.setTheme(theme);
      const props = world.getProps();
      expect(props).toHaveLength(4);

      for (const prop of props) {
        // Hover hit-test works at prop center and clears far away
        const hovered = world.handlePointerMove(prop.x, prop.y);
        expect(hovered?.id).toBe(prop.id);
        expect(prop.hovered).toBe(true);
        expect(prop.hitTest(prop.x + prop.radius * 0.5, prop.y)).toBe(true);
        expect(prop.hitTest(prop.x + prop.radius + 30, prop.y)).toBe(false);

        const hit = world.handlePointerClick(prop.x, prop.y);
        expect(hit).not.toBeNull();
        expect(hit?.prop.id).toBe(prop.id);
        expect(hit?.label).toBe(prop.label);
        expect(hit?.feedbackText.length).toBeGreaterThan(4);
        expect(hit?.particles.length).toBeGreaterThan(0);

        if (prop.kind !== 'brass_lamp' && prop.kind !== 'andon_lantern') {
          expect(prop.isActive).toBe(true);
          expect(hit?.attractDurationSec).toBeGreaterThan(0);
          expect(hit?.attractRadius).toBeGreaterThan(150);
          expect(isPropAttracting(prop, world.getTime())).toBe(true);
        }
      }

      expect(world.handlePointerMove(640, 360)).toBeNull();
    }
  });

  it('toggles warm light zones when clicking Brass Desk Lamp (study) and Paper Andon Lantern (tatami)', () => {
    const surface = new SurfaceManager(1280, 720);
    const world = new InteractivePropWorld(1280, 720, surface.getRugBounds(), 'study');

    const lamp = world.getPropById('study-brass-lamp')!;
    expect(lamp).not.toBeNull();
    expect(lamp.isActive).toBe(true);
    expect(world.getWarmZones().some((z) => z.id === 'study-brass-lamp')).toBe(true);

    // First click toggles lamp OFF -> removes warm zone
    const offHit = world.handlePointerClick(lamp.x, lamp.y);
    expect(offHit?.prop.isActive).toBe(false);
    expect(world.getWarmZones().some((z) => z.id === 'study-brass-lamp')).toBe(false);

    // Second click toggles lamp back ON -> restores warm zone and emits attraction pulse
    const onHit = world.handlePointerClick(lamp.x, lamp.y);
    expect(onHit?.prop.isActive).toBe(true);
    expect(onHit?.attractDurationSec).toBeGreaterThan(0);
    expect(world.getWarmZones().some((z) => z.id === 'study-brass-lamp')).toBe(true);

    // Tatami Andon Lantern toggles warm zone similarly
    world.setTheme('tatami');
    const lantern = world.getPropById('tatami-andon-lantern')!;
    expect(lantern.isActive).toBe(true);
    world.handlePointerClick(lantern.x, lantern.y);
    expect(lantern.isActive).toBe(false);
    expect(world.getWarmZones()).toHaveLength(0);
    world.handlePointerClick(lantern.x, lantern.y);
    expect(lantern.isActive).toBe(true);
    expect(world.getWarmZones()).toHaveLength(1);
  });

  it('spawns butterfly in day/golden and firefly at night from garden butterfly stone, and dispenses treats in cafe', () => {
    const surface = new SurfaceManager(1280, 720);
    const world = new InteractivePropWorld(1280, 720, surface.getRugBounds(), 'garden');

    world.setLighting('golden');
    const stone = world.getPropById('garden-butterfly-stone')!;
    const dayClick = world.handlePointerClick(stone.x, stone.y);
    expect(dayClick?.spawnedCritter).toBe('butterfly');

    world.setLighting('night');
    const nightClick = world.handlePointerClick(stone.x, stone.y);
    expect(nightClick?.spawnedCritter).toBe('firefly');

    // Direct click on a critter startles it and attracts cats
    const critter = world.getAmbientCritters()[0];
    const critterHit = world.handlePointerClick(critter.x, critter.y);
    expect(critterHit).not.toBeNull();
    expect(critterHit?.interactionType).toBe('play');

    // Cafe treat jar click spawns a DroppedTreat that cats can consume in 3 bites
    world.setTheme('cafe');
    const jar = world.getPropById('cafe-treat-jar')!;
    const beforeTreats = world.getActiveTreats().length;
    const jarHit = world.handlePointerClick(jar.x, jar.y);
    expect(jarHit?.interactionType).toBe('treat');
    expect(jarHit?.spawnedTreatPoint).toBeDefined();
    expect(world.getActiveTreats().length).toBe(beforeTreats + 1);

    const treat = world.getActiveTreats()[0];
    expect(treat.remainingBites).toBe(3);
    expect(world.consumeTreatBite(treat.id, 1)).toBe(true);
    expect(treat.remainingBites).toBe(2);
    expect(world.consumeTreatBite(treat.id, 1)).toBe(true);
    expect(world.consumeTreatBite(treat.id, 1)).toBe(true);
    expect(world.getActiveTreats()).toHaveLength(0);
  });
});
