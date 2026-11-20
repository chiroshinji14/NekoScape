import { describe, expect, it } from 'vitest';
import {
  CatBrain,
  FRIENDSHIP_XP_THRESHOLDS,
  clearFriendshipStorage,
  deriveCatArchetype,
  getCircadianLabel,
  getCircadianPhase,
  isValidCircadianPhase,
  safeReadStorage,
  safeWriteStorage,
  xpToFriendshipLevel,
} from '@/core/CatBrain';
import { generateBreedPersonality } from '@/entities/CatBreeds';
import { CAT_ARCHETYPES, CAT_BREEDS, CIRCADIAN_PHASES } from '@/types/simulation';

function makeBrain(overrides: Partial<ConstructorParameters<typeof CatBrain>[0]> = {}): CatBrain {
  const breed = overrides.breed ?? 'domestic_shorthair';
  const seed = overrides.seed ?? 1337;
  return new CatBrain({
    catId: overrides.catId ?? 1,
    seed,
    breed,
    personality: overrides.personality ?? generateBreedPersonality(breed, seed),
    storageKey: overrides.storageKey ?? `test.brain.${seed}.${Math.random()}`,
    ...overrides,
  });
}

describe('CatBrain — Hidden Needs, Crepuscular Clock, Archetypes, Friendship & Overstimulation', () => {
  it('classifies all 24 hours of PC clock into dawn, midday, dusk, and night phases', () => {
    const expectedByHour: Record<number, string> = {
      0: 'night', 1: 'night', 2: 'night', 3: 'night', 4: 'night', 5: 'night',
      6: 'dawn', 7: 'dawn', 8: 'dawn',
      9: 'midday', 12: 'midday', 16: 'midday',
      17: 'dusk', 19: 'dusk', 21: 'dusk',
      22: 'night', 23: 'night',
    };
    for (const [h, phase] of Object.entries(expectedByHour)) {
      const d = new Date(2026, 5, 1, Number(h), 30, 0);
      expect(getCircadianPhase(d)).toBe(phase);
    }
    for (const phase of CIRCADIAN_PHASES) {
      expect(isValidCircadianPhase(phase)).toBe(true);
      expect(getCircadianLabel(phase).length).toBeGreaterThan(3);
    }
    expect(isValidCircadianPhase('midnight')).toBe(false);
  });

  it('keeps hidden needs (energy, hunger, boredom, comfort, curiosity) bounded in [0, 100] across state ticks', () => {
    const brain = makeBrain({
      initialNeeds: { energy: 50, hunger: 50, boredom: 50, comfort: 50, curiosity: 50 },
    });

    // Sleeping restores energy & comfort while slowly increasing hunger
    const beforeSleep = brain.getNeeds();
    for (let i = 0; i < 20; i++) {
      brain.tick(0.2, 'DEEP_SLEEP', { isOnWarmZone: true, isOnRug: true });
    }
    const afterSleep = brain.getNeeds();
    expect(afterSleep.energy).toBeGreaterThan(beforeSleep.energy);
    expect(afterSleep.comfort).toBeGreaterThan(beforeSleep.comfort);
    expect(afterSleep.hunger).toBeGreaterThan(beforeSleep.hunger);

    // Eating & drinking drop hunger significantly
    for (let i = 0; i < 12; i++) {
      brain.tick(0.2, 'EATING_TREAT');
    }
    expect(brain.getNeeds().hunger).toBeLessThan(afterSleep.hunger);

    // Zoomies drain energy & reduce boredom
    const preZoomies = brain.getNeeds();
    for (let i = 0; i < 15; i++) {
      brain.tick(0.2, 'ZOOMIES');
    }
    const postZoomies = brain.getNeeds();
    expect(postZoomies.energy).toBeLessThan(preZoomies.energy);
    expect(postZoomies.boredom).toBeLessThan(preZoomies.boredom);

    // Extreme clamping check
    brain.setNeeds({ energy: 999, hunger: -50, boredom: 150, comfort: -1, curiosity: 42 });
    expect(brain.getNeeds()).toEqual({
      energy: 100,
      hunger: 0,
      boredom: 100,
      comfort: 0,
      curiosity: 42,
    });
  });

  it('derives deterministic personality archetypes across all 6 archetypes and respects kitten mode', () => {
    const seen = new Set<string>();
    const probes = [
      { laziness: 0.98, warmthAffinity: 0.95, sociability: 0.4, curiosity: 0.2, playfulness: 0.1, zoomieProneness: 0.1 },
      { laziness: 0.1, warmthAffinity: 0.2, sociability: 0.4, curiosity: 0.4, playfulness: 0.95, zoomieProneness: 0.98 },
      { laziness: 0.9, warmthAffinity: 0.1, sociability: 0.05, curiosity: 0.1, playfulness: 0.05, zoomieProneness: 0.05 },
      { laziness: 0.3, warmthAffinity: 0.2, sociability: 0.3, curiosity: 0.95, playfulness: 0.2, zoomieProneness: 0.1 },
      { laziness: 0.1, warmthAffinity: 0.3, sociability: 0.3, curiosity: 0.95, playfulness: 0.95, zoomieProneness: 0.3 },
      { laziness: 0.2, warmthAffinity: 0.9, sociability: 0.98, curiosity: 0.3, playfulness: 0.3, zoomieProneness: 0.1 },
    ];
    for (let i = 0; i < probes.length; i++) {
      const breed = i === 3 ? 'british_shorthair' : CAT_BREEDS[i];
      seen.add(deriveCatArchetype(100 + i, breed, probes[i], false));
    }
    for (let i = 0; i < 180; i++) {
      const breed = CAT_BREEDS[i % CAT_BREEDS.length];
      const seed = 100 + i * 7919;
      const personality = generateBreedPersonality(breed, seed);
      const arch = deriveCatArchetype(seed, breed, personality, false);
      expect(CAT_ARCHETYPES).toContain(arch);
      seen.add(arch);
    }
    expect(seen.size).toBe(CAT_ARCHETYPES.length);

    // Kitten mode biases toward hyper_kitten
    let hyperCount = 0;
    for (let i = 0; i < 40; i++) {
      const p = generateBreedPersonality('munchkin', i + 1);
      if (deriveCatArchetype(i + 1, 'munchkin', p, true) === 'hyper_kitten') {
        hyperCount++;
      }
    }
    expect(hyperCount).toBeGreaterThanOrEqual(15);
  });

  it('progresses friendship XP & levels 1..5 and persists safely in Node without localStorage', () => {
    expect(xpToFriendshipLevel(0)).toBe(1);
    expect(xpToFriendshipLevel(FRIENDSHIP_XP_THRESHOLDS[1])).toBe(2);
    expect(xpToFriendshipLevel(FRIENDSHIP_XP_THRESHOLDS[2])).toBe(3);
    expect(xpToFriendshipLevel(FRIENDSHIP_XP_THRESHOLDS[3])).toBe(4);
    expect(xpToFriendshipLevel(FRIENDSHIP_XP_THRESHOLDS[4])).toBe(5);
    expect(xpToFriendshipLevel(99999)).toBe(5);

    const key = 'test.friendship.persist.unit';
    clearFriendshipStorage(key);
    safeWriteStorage(key, JSON.stringify({ xp: 80, level: 3, pets: 5, treats: 2, plays: 1 }));
    expect(safeReadStorage(key)).toContain('80');

    const loaded = makeBrain({ storageKey: key, archetype: 'cuddlebug' });
    expect(loaded.getFriendshipLevel()).toBe(3);
    expect(loaded.getFriendshipXp()).toBe(80);

    // Treats & gifts grant XP and eventually level up to 4 and 5
    let leveledTo4 = false;
    for (let i = 0; i < 10; i++) {
      const res = loaded.recordInteraction('gift');
      if (res.leveledUp && res.friendshipLevel >= 4) {
        leveledTo4 = true;
      }
    }
    expect(leveledTo4).toBe(true);
    expect(loaded.getFriendshipLevel()).toBeGreaterThanOrEqual(4);
    expect(loaded.getFriendshipXp()).toBeGreaterThanOrEqual(140);

    // Fresh brain with same key picks up persisted friendship
    const reloaded = makeBrain({ storageKey: key });
    expect(reloaded.getFriendshipLevel()).toBe(loaded.getFriendshipLevel());
    expect(reloaded.getFriendshipXp()).toBe(loaded.getFriendshipXp());
    clearFriendshipStorage(key);
  });

  it('triggers over-petting irritation (OVERSTIMULATED) faster for aloof cats than cuddlebugs', () => {
    const aloof = makeBrain({ archetype: 'aloof_senior' });
    const cuddle = makeBrain({ archetype: 'cuddlebug' });

    let aloofTrippedAt = -1;
    let cuddleTrippedAt = -1;
    for (let i = 1; i <= 15; i++) {
      if (aloofTrippedAt < 0 && aloof.recordInteraction('click').overstimulated) {
        aloofTrippedAt = i;
      }
      if (cuddleTrippedAt < 0 && cuddle.recordInteraction('click').overstimulated) {
        cuddleTrippedAt = i;
      }
    }
    expect(aloofTrippedAt).toBeGreaterThan(0);
    expect(aloofTrippedAt).toBeLessThanOrEqual(6);
    expect(cuddleTrippedAt).toBeGreaterThan(aloofTrippedAt);

    // Continuous petting also detects overstimulation
    const continuous = makeBrain({ archetype: 'aloof_senior' });
    let hitContinuous = false;
    for (let i = 0; i < 60; i++) {
      if (continuous.recordContinuousPet(0.1).overstimulated) {
        hitContinuous = true;
        break;
      }
    }
    expect(hitContinuous).toBe(true);
  });

  it('occasionally ignores clicks on aloof_senior cats and supports laser boredom cooldown', () => {
    const aloof = makeBrain({ archetype: 'aloof_senior', seed: 42 });
    let ignoredCount = 0;
    for (let i = 0; i < 40; i++) {
      // Allow overstimulation to decay between clicks
      for (let t = 0; t < 15; t++) aloof.tick(0.2, 'IDLE');
      const res = aloof.recordInteraction('click');
      if (res.ignored) ignoredCount++;
    }
    expect(ignoredCount).toBeGreaterThan(0);

    // Sustained laser chase triggers realistic laser boredom after ~8..12.2s
    const hunter = makeBrain({ archetype: 'curious_hunter' });
    expect(hunter.isLaserBored()).toBe(false);
    let becameBored = false;
    for (let i = 0; i < 150; i++) {
      if (hunter.trackLaserChase(0.1, true)) {
        becameBored = true;
        break;
      }
    }
    expect(becameBored).toBe(true);
    expect(hunter.isLaserBored()).toBe(true);
  });

  it('biases autonomous behavior selection by crepuscular clock and world stimuli', () => {
    const middayCounts = new Map<string, number>();
    const nightCounts = new Map<string, number>();

    const middayDate = new Date(2026, 5, 1, 13, 0, 0);
    const nightDate = new Date(2026, 5, 1, 2, 0, 0);

    for (let i = 0; i < 160; i++) {
      const bMid = makeBrain({
        seed: 500 + i,
        initialNeeds: { energy: 25, boredom: 20, comfort: 70, curiosity: 30, hunger: 20 },
      });
      const sMid = bMid.chooseNextBehavior({ date: middayDate, hasWarmSpot: true });
      middayCounts.set(sMid, (middayCounts.get(sMid) ?? 0) + 1);

      const bNight = makeBrain({
        seed: 500 + i,
        initialNeeds: { energy: 90, boredom: 80, comfort: 60, curiosity: 60, hunger: 20 },
      });
      const sNight = bNight.chooseNextBehavior({ date: nightDate, hasToys: true });
      nightCounts.set(sNight, (nightCounts.get(sNight) ?? 0) + 1);
    }

    const restfulMidday =
      (middayCounts.get('NAP') ?? 0) +
      (middayCounts.get('SUNBATHE') ?? 0) +
      (middayCounts.get('LOAFING') ?? 0) +
      (middayCounts.get('GROOMING') ?? 0);
    const activeNight =
      (nightCounts.get('ZOOMIES') ?? 0) + (nightCounts.get('PLAY_TOY') ?? 0);

    expect(restfulMidday).toBeGreaterThan(80);
    expect(activeNight).toBeGreaterThan(50);
  });

  it('produces rare quirky events (CARRY_GIFT, HAIRBALL, TRIP_RECOVER, SNEEZE_HICCUP, STARE_VOID, FLEHMEN)', () => {
    const rareSeen = new Set<string>();
    const toy = {
      id: 'mouse-1',
      kind: 'mouse_toy' as const,
      x: 300,
      y: 300,
      vx: 0,
      vy: 0,
      radius: 15,
      isCarriedByCatId: null,
      isCatnip: true,
      isFood: false,
      isScary: false,
      active: true,
      createdAt: 0,
      expiresAt: null,
    };

    for (let i = 0; i < 120; i++) {
      const key = `rare.test.${i}`;
      clearFriendshipStorage(key);
      safeWriteStorage(key, JSON.stringify({ xp: 60, level: 2, pets: 2, treats: 2, plays: 2 }));
      const b = makeBrain({ seed: 1000 + i * 31, storageKey: key, isKitten: i % 2 === 0 });
      // Advance cooldowns past initial rare/hairball/gift timers (~160s)
      for (let t = 0; t < 700; t++) {
        b.tick(0.25, 'WANDER');
      }
      const rare = b.tryPickRareEvent({ availableToys: [toy] });
      if (rare) rareSeen.add(rare);
      clearFriendshipStorage(key);
    }

    expect(rareSeen.has('CARRY_GIFT')).toBe(true);
    expect(rareSeen.has('TRIP_RECOVER')).toBe(true);
    expect(rareSeen.has('SNEEZE_HICCUP')).toBe(true);
    expect(rareSeen.has('STARE_VOID')).toBe(true);
    expect(rareSeen.has('FLEHMEN')).toBe(true);
  });
});
