import { describe, expect, it } from 'vitest';
import { SurfaceManager } from '@/core/SurfaceManager';
import {
  InteractivePropWorld,
  computeScenePropDefinitions,
  isPropAttracting,
} from '@/environment/InteractiveProp';
import { SCENE_THEMES, type PropKind, type SceneThemeName } from '@/types/simulation';

const W = 1280;
const H = 720;

function makeWorld(theme: SceneThemeName = 'study'): InteractivePropWorld {
  const surface = new SurfaceManager(W, H);
  return new InteractivePropWorld(W, H, surface.getRugBounds(), theme);
}

describe('InteractivePropWorld — 13 Scenes, Enlarged Koi Pond, Moving Sunbeam, Tip-able Plants', () => {
  it('defines exactly 13 canonical scenes', () => {
    expect(SCENE_THEMES).toHaveLength(13);
    expect(new Set(SCENE_THEMES).size).toBe(13);
  });

  it('populates >= 4 distinct interactive props in every one of the 13 scenes clear of the rug and FAB zone', () => {
    const surface = new SurfaceManager(W, H);
    const rug = surface.getRugBounds();

    for (const theme of SCENE_THEMES) {
      const defs = computeScenePropDefinitions(theme, W, H, rug);
      expect(defs.length, `scene ${theme}`).toBeGreaterThanOrEqual(4);
      expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);

      for (const prop of defs) {
        expect(prop.scene).toBe(theme);
        expect(prop.radius).toBeGreaterThanOrEqual(24);
        expect(prop.attractRadius).toBeGreaterThanOrEqual(150);
        expect(prop.interactPoint).toBeDefined();
        expect(Number.isFinite(prop.x) && Number.isFinite(prop.y)).toBe(true);

        const rx = prop.radiusX ?? prop.radius;
        const ry = prop.radiusY ?? prop.radius;

        // Props stay in-bounds
        expect(prop.x - rx).toBeGreaterThanOrEqual(0);
        expect(prop.y - ry).toBeGreaterThanOrEqual(0);
        expect(prop.x + rx).toBeLessThanOrEqual(W);
        expect(prop.y + ry).toBeLessThanOrEqual(H);

        // Not overlapping the bottom-right FAB exclusion footprint (114x114)
        const inFabZone = prop.x + rx > W - 114 && prop.y + ry > H - 114;
        expect(inFabZone, `${prop.id} overlaps FAB`).toBe(false);

        // Not overlapping the central rug rectangle (prop centre must be outside rug)
        const centreInsideRug =
          prop.x > rug.x &&
          prop.x < rug.x + rug.width &&
          prop.y > rug.y &&
          prop.y < rug.y + rug.height;
        expect(centreInsideRug, `${prop.id} centre inside rug`).toBe(false);
      }
    }
  });

  it('keeps props within a scene from stacking directly on top of one another', () => {
    const surface = new SurfaceManager(W, H);
    const rug = surface.getRugBounds();
    for (const theme of SCENE_THEMES) {
      const defs = computeScenePropDefinitions(theme, W, H, rug);
      for (let i = 0; i < defs.length; i++) {
        for (let j = i + 1; j < defs.length; j++) {
          const dist = Math.hypot(defs[j].x - defs[i].x, defs[j].y - defs[i].y);
          const minR = Math.min(
            defs[i].radiusY ?? defs[i].radius,
            defs[j].radiusY ?? defs[j].radius,
          );
          expect(dist, `${defs[i].id} vs ${defs[j].id}`).toBeGreaterThan(minR);
        }
      }
    }
  });

  it('hit-tests, hovers, and clicks every prop in all 13 scenes with particles and cat attraction', () => {
    const world = makeWorld('study');

    for (const theme of SCENE_THEMES) {
      world.setTheme(theme);
      const props = world.getProps();
      expect(props.length).toBeGreaterThanOrEqual(4);

      for (const prop of props) {
        const hovered = world.handlePointerMove(prop.x, prop.y);
        expect(hovered).not.toBeNull();
        expect(prop.hitTest(prop.x, prop.y)).toBe(true);
        expect(prop.hitTest(prop.x + (prop.radiusX ?? prop.radius) + 60, prop.y)).toBe(false);

        const hit = world.handlePointerClick(prop.x, prop.y);
        expect(hit, `${theme}/${prop.id} click`).not.toBeNull();
        expect(hit?.label.length).toBeGreaterThan(0);
        expect(hit?.feedbackText.length).toBeGreaterThan(3);
        expect(hit?.particles.length).toBeGreaterThan(0);
        expect(hit?.attractPoint).toBeDefined();
        // Switching a warmth source OFF (lamp/lantern/fireplace) legitimately emits no attraction pulse
        const switchedOff = hit?.interactionType === 'warmth' && hit.prop.isActive === false;
        if (!switchedOff) {
          expect(hit?.attractRadius, `${theme}/${prop.id}`).toBeGreaterThan(100);
        }
      }
      // far away from every prop (top-left corner) hovers nothing
      expect(world.handlePointerMove(2, 2)).toBeNull();
    }
  });

  it('enlarges the Garden Koi Pond (radius >= 65), exposes drink interaction, drink points, and elliptical hit testing', () => {
    const world = makeWorld('garden');
    const pond = world.getPropById('garden-koi-pond');
    expect(pond).not.toBeNull();
    expect(pond!.kind).toBe('koi_pond');
    expect(pond!.radius).toBeGreaterThanOrEqual(65);
    expect(pond!.interactionType).toBe('drink');
    expect(pond!.drinkPoints?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(pond!.radiusX).toBeGreaterThan(pond!.radiusY ?? 0);

    // Generous footprint: edges of the ellipse are clickable
    expect(pond!.hitTest(pond!.x + pond!.radiusX! - 6, pond!.y)).toBe(true);
    expect(pond!.hitTest(pond!.x, pond!.y + pond!.radiusY! - 6)).toBe(true);
    expect(pond!.hitTest(pond!.x + pond!.radiusX! + 40, pond!.y)).toBe(false);

    const hit = world.handlePointerClick(pond!.x, pond!.y);
    expect(hit?.interactionType).toBe('drink');
    expect(hit?.prop.id).toBe('garden-koi-pond');
  });

  it('at least one prop in every drink-capable scene exposes `drink` interaction (cafe, kitchen, rooftop, balcony, aquarium)', () => {
    for (const theme of ['garden', 'cafe', 'kitchen', 'night_balcony', 'rainy_window', 'aquarium', 'rooftop'] as const) {
      const world = makeWorld(theme);
      expect(
        world.getProps().some((p) => p.interactionType === 'drink'),
        `${theme} should have drink prop`,
      ).toBe(true);
    }
  });

  it('toggles warm light zones when clicking Brass Desk Lamp (study) and Paper Andon Lantern (tatami)', () => {
    const world = makeWorld('study');

    const lamp = world.getPropById('study-brass-lamp')!;
    expect(lamp).not.toBeNull();
    expect(lamp.isActive).toBe(true);
    expect(world.getWarmZones().some((z) => z.id === 'study-brass-lamp')).toBe(true);

    const offHit = world.handlePointerClick(lamp.x, lamp.y);
    expect(offHit?.prop.isActive).toBe(false);
    expect(world.getWarmZones().some((z) => z.id === 'study-brass-lamp')).toBe(false);

    const onHit = world.handlePointerClick(lamp.x, lamp.y);
    expect(onHit?.prop.isActive).toBe(true);
    expect(onHit?.attractDurationSec).toBeGreaterThan(0);
    expect(world.getWarmZones().some((z) => z.id === 'study-brass-lamp')).toBe(true);

    world.setTheme('tatami');
    const lantern = world.getPropById('tatami-andon-lantern')!;
    expect(lantern.isActive).toBe(true);
    world.handlePointerClick(lantern.x, lantern.y);
    expect(lantern.isActive).toBe(false);
    expect(world.getWarmZones().some((z) => z.id === 'tatami-andon-lantern')).toBe(false);
    world.handlePointerClick(lantern.x, lantern.y);
    expect(lantern.isActive).toBe(true);
    expect(world.getWarmZones().some((z) => z.id === 'tatami-andon-lantern')).toBe(true);
  });

  it('drifts the Sunbeam scene patch over time and updates getWarmZones() positions accordingly', () => {
    const world = makeWorld('sunbeam');
    const beam = world.getProps().find((p) => p.kind === 'drifting_sunbeam');
    expect(beam).toBeDefined();
    expect(beam!.interactionType).toBe('sunbeam');
    expect(beam!.isActive).toBe(true);

    const zoneAt = () => world.getWarmZones().find((z) => z.id === beam!.id);
    expect(zoneAt()).toBeDefined();

    const x0 = beam!.x;
    const y0 = beam!.y;
    const zone0 = { ...zoneAt()! };

    for (let i = 0; i < 400; i++) {
      world.update(0.05);
    }

    const moved = Math.hypot(beam!.x - x0, beam!.y - y0);
    expect(moved).toBeGreaterThan(8);

    const zone1 = zoneAt();
    expect(zone1).toBeDefined();
    expect(zone1!.x).toBe(beam!.x);
    expect(zone1!.y).toBe(beam!.y);
    expect(Math.hypot(zone1!.x - zone0.x, zone1!.y - zone0.y)).toBeGreaterThan(8);
    expect(zone1!.radius).toBeGreaterThan(40);
    expect(zone1!.intensity).toBeGreaterThan(0.3);
  });

  it('tip-able houseplants toggle tipped <-> upright on click and via tipProp()', () => {
    let tested = 0;
    for (const theme of SCENE_THEMES) {
      const world = makeWorld(theme);
      const tippables = world.getProps().filter((p) => p.tippable);
      for (const plant of tippables) {
        expect(plant.isTipped).toBe(false);
        expect(world.tipProp(plant.id)).toBe(true);
        expect(plant.isTipped).toBe(true);
        // Already tipped: cannot tip again
        expect(world.tipProp(plant.id)).toBe(false);

        const hit = world.handlePointerClick(plant.x, plant.y);
        expect(hit?.prop.id).toBe(plant.id);
        expect(plant.isTipped).toBe(false);
        expect(hit?.feedbackText.length).toBeGreaterThan(3);
        tested++;
      }
    }
    expect(tested).toBeGreaterThanOrEqual(5);

    const living = makeWorld('living_room');
    expect(living.getProps().some((p) => p.kind === 'houseplant' && p.tippable)).toBe(true);
  });

  it('non-tippable props refuse tipProp() and unknown ids return false', () => {
    const world = makeWorld('study');
    expect(world.tipProp('does-not-exist')).toBe(false);
    expect(world.tipProp('study-brass-lamp')).toBe(false);
  });

  it('supports aquarium, litter box, fireplace, and rainy/snowy window props cleanly', () => {
    const required: Array<[SceneThemeName, PropKind]> = [
      ['aquarium', 'tabletop_aquarium'],
      ['bedroom', 'litter_box'],
      ['living_room', 'fireplace_hearth'],
      ['rainy_window', 'rainy_window_pane'],
      ['snowy_window', 'snowy_window_pane'],
    ];

    for (const [theme, kind] of required) {
      const world = makeWorld(theme);
      const prop = world.getProps().find((p) => p.kind === kind);
      expect(prop, `${theme} should include ${kind}`).toBeDefined();

      const hit = world.handlePointerClick(prop!.x, prop!.y);
      expect(hit).not.toBeNull();
      expect(hit?.prop.kind).toBe(kind);
      expect(hit?.feedbackText.length).toBeGreaterThan(3);
      expect(hit?.particles.length).toBeGreaterThan(0);

      // Update loop must be stable with these props
      for (let i = 0; i < 40; i++) {
        world.update(0.033);
      }
      expect(Number.isFinite(prop!.x)).toBe(true);
    }

    // Fireplace is a warm zone source; litter box exposes the `litter` interaction
    const living = makeWorld('living_room');
    expect(living.getWarmZones().some((z) => z.id.includes('fireplace'))).toBe(true);

    const bedroom = makeWorld('bedroom');
    expect(bedroom.getProps().find((p) => p.kind === 'litter_box')!.interactionType).toBe('litter');
  });

  it('flags props as attracting cats for the duration after a click', () => {
    const world = makeWorld('study');
    const journal = world.getPropById('study-leather-journal')!;
    const hit = world.handlePointerClick(journal.x, journal.y);
    expect(hit?.attractDurationSec).toBeGreaterThan(0);
    expect(isPropAttracting(journal, world.getTime())).toBe(true);
  });

  it('spawns butterfly/firefly from garden butterfly stone by lighting, and dispenses treats in cafe', () => {
    const world = makeWorld('garden');

    world.setLighting('golden');
    const stone = world.getPropById('garden-butterfly-stone')!;
    expect(stone).not.toBeNull();
    const dayClick = world.handlePointerClick(stone.x, stone.y);
    expect(dayClick?.spawnedCritter).toBe('butterfly');

    world.setLighting('night');
    const nightClick = world.handlePointerClick(stone.x, stone.y);
    expect(nightClick?.spawnedCritter).toBe('firefly');

    const critter = world.getAmbientCritters()[0];
    expect(critter).toBeDefined();
    const critterHit = world.handlePointerClick(critter.x, critter.y);
    expect(critterHit).not.toBeNull();
    expect(['play', 'watch']).toContain(critterHit?.interactionType);

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

  it('disabling props returns no props, obstacles, or warm zones', () => {
    const world = makeWorld('living_room');
    expect(world.getProps().length).toBeGreaterThan(0);
    world.setEnabled(false);
    expect(world.getProps()).toHaveLength(0);
    expect(world.getObstacles()).toHaveLength(0);
    expect(world.getWarmZones()).toHaveLength(0);
    world.setEnabled(true);
    expect(world.getProps().length).toBeGreaterThan(0);
  });

  it('re-layouts cleanly on resize across all scenes without NaN or out-of-bounds props', () => {
    const sizes: Array<[number, number]> = [
      [1920, 1080],
      [1366, 768],
      [1024, 600],
      [800, 600],
    ];
    for (const [w, h] of sizes) {
      const surface = new SurfaceManager(w, h);
      for (const theme of SCENE_THEMES) {
        const defs = computeScenePropDefinitions(theme, w, h, surface.getRugBounds());
        for (const d of defs) {
          expect(Number.isFinite(d.x) && Number.isFinite(d.y), `${theme} ${w}x${h} ${d.id}`).toBe(true);
          expect(d.x).toBeGreaterThan(0);
          expect(d.y).toBeGreaterThan(0);
          expect(d.x).toBeLessThan(w);
          expect(d.y).toBeLessThan(h);
        }
      }
    }
  });
});
