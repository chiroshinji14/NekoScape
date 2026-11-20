import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => ({
  Graphics: class {},
  Container: class {},
}));

import {
  BREED_PROFILES,
  KITTEN_BODY_SCALE,
  generateBreedPersonality,
  generateCatIdentity,
  getBreedBodyScale,
  getBreedCoatVariants,
  getBreedProfile,
  pickBreedName,
  pickDiverseBreedOrder,
} from '@/entities/CatBreeds';
import {
  computeBreedPawLayout,
  drawBodyMarkings,
  drawBreedBody,
  drawBreedEar,
  drawBreedEyes,
  drawBreedHead,
  drawBreedPaws,
  drawBreedShadow,
  drawBreedTail,
  drawCatCollar,
  getCoatProfile,
  parseCollarColor,
  type CatPoseMode,
  type SpineRenderPoints,
} from '@/entities/CatCoatGenerator';
import {
  CAT_BREEDS,
  CAT_BREED_LABELS,
  CAT_BREED_MODES,
  normalizeBreedMode,
  normalizeCatBreed,
  type CatBreed,
  type CatEarPose,
} from '@/types/simulation';

const EXPECTED_BREEDS: readonly CatBreed[] = [
  'persian',
  'siamese',
  'british_shorthair',
  'munchkin',
  'sphynx',
  'domestic_shorthair',
  'maine_coon',
  'scottish_fold',
  'bengal',
  'ragdoll',
  'russian_blue',
  'abyssinian',
  'american_curl',
  'japanese_bobtail',
];

/** Graphics stand-in that records draw calls and accepts any chained Pixi v8 Graphics method. */
function createGfx() {
  let calls = 0;
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === '__calls') return calls;
      if (prop === 'then') return undefined;
      return (..._args: unknown[]) => {
        calls++;
        return proxy;
      };
    },
  });
  return proxy as import('pixi.js').Graphics & { __calls: number };
}

function makeSpine(overrides: Partial<SpineRenderPoints> = {}): SpineRenderPoints {
  return {
    hips: { x: 100, y: 100 },
    torso: { x: 116, y: 100 },
    head: { x: 132, y: 100 },
    hipDir: { x: 1, y: 0 },
    torsoDir: { x: 1, y: 0 },
    headDir: { x: 1, y: 0 },
    bodyScaleX: 1,
    bodyScaleY: 1,
    isLoaf: false,
    ...overrides,
  };
}

describe('CatBreeds & CatCoatGenerator — 14 Real-Life Cat Breeds', () => {
  it('defines all 14 canonical real-life breeds with labels, coat variants, names, and click captions', () => {
    expect([...CAT_BREEDS]).toEqual([...EXPECTED_BREEDS]);
    expect(CAT_BREEDS).toHaveLength(14);
    expect(CAT_BREED_MODES).toEqual(['mix', ...CAT_BREEDS]);

    for (const breed of CAT_BREEDS) {
      const profile = getBreedProfile(breed);
      expect(profile, breed).toBeDefined();
      expect(profile.breed).toBe(breed);
      expect(profile.label).toBe(CAT_BREED_LABELS[breed]);
      expect(profile.coatVariants.length, `${breed} coats`).toBeGreaterThanOrEqual(3);
      expect(profile.defaultNames.length, `${breed} names`).toBeGreaterThanOrEqual(6);
      expect(profile.clickCaptions.length, `${breed} captions`).toBeGreaterThanOrEqual(4);
      expect(BREED_PROFILES[breed]).toBe(profile);
    }
  });

  it('gives every breed a unique head shape, ear shape, tail style and a sane anatomy', () => {
    const profiles = CAT_BREEDS.map((b) => BREED_PROFILES[b]);
    expect(new Set(profiles.map((p) => p.anatomy.head.shape)).size).toBe(14);
    expect(new Set(profiles.map((p) => p.anatomy.ears.shape)).size).toBe(14);
    expect(new Set(profiles.map((p) => p.anatomy.tail.style)).size).toBe(14);

    for (const p of profiles) {
      expect(p.anatomy.body.torsoRadius).toBeGreaterThan(5);
      expect(p.anatomy.body.headToTorsoLen).toBeGreaterThan(5);
      expect(p.anatomy.body.torsoToHipsLen).toBeGreaterThan(5);
      expect(p.anatomy.body.bodyScale).toBeGreaterThan(0.5);
      expect(p.anatomy.ears.length).toBeGreaterThan(3);
      expect(p.anatomy.tail.segments).toBeGreaterThanOrEqual(2);
      expect(p.locomotion.walkSpeedMultiplier).toBeGreaterThan(0.3);
      expect(p.locomotion.walkSpeedMultiplier).toBeLessThan(2.5);
    }
  });

  it('enforces breed-authentic anatomy for the six original breeds', () => {
    const persian = BREED_PROFILES.persian;
    const siamese = BREED_PROFILES.siamese;
    const british = BREED_PROFILES.british_shorthair;
    const munchkin = BREED_PROFILES.munchkin;
    const sphynx = BREED_PROFILES.sphynx;
    const dsh = BREED_PROFILES.domestic_shorthair;

    expect(persian.anatomy.body.coatType).toBe('longhair');
    expect(persian.anatomy.body.hasChestMane).toBe(true);
    expect(persian.anatomy.head.shape).toBe('brachycephalic');
    expect(persian.anatomy.ears.hasEarTufts).toBe(true);
    expect(persian.locomotion.walkSpeedMultiplier).toBeLessThan(0.82);

    const siameseSpine = siamese.anatomy.body.headToTorsoLen + siamese.anatomy.body.torsoToHipsLen;
    const persianSpine = persian.anatomy.body.headToTorsoLen + persian.anatomy.body.torsoToHipsLen;
    expect(siameseSpine).toBeGreaterThan(persianSpine);
    expect(siamese.anatomy.head.shape).toBe('wedge');
    expect(siamese.locomotion.walkSpeedMultiplier).toBeGreaterThan(1.1);

    expect(british.anatomy.body.coatType).toBe('plush_dense');
    expect(british.anatomy.head.shape).toBe('round_jowls');

    expect(munchkin.anatomy.legs.tuckedClose).toBe(true);
    expect(munchkin.anatomy.legs.pawRadius).toBeLessThan(dsh.anatomy.legs.pawRadius);
    expect(munchkin.locomotion.strideFrequencyMultiplier).toBeGreaterThanOrEqual(1.85);

    expect(sphynx.anatomy.body.coatType).toBe('hairless');
    expect(sphynx.anatomy.body.hasWrinkles).toBe(true);
    expect(sphynx.anatomy.ears.shape).toBe('giant_bat');

    expect(dsh.anatomy.body.coatType).toBe('shorthair');
    expect(dsh.locomotion.walkSpeedMultiplier).toBe(1.0);
  });

  it('gives the 8 new breeds their signature traits', () => {
    const maine = BREED_PROFILES.maine_coon;
    const dsh = BREED_PROFILES.domestic_shorthair;
    expect(maine.anatomy.body.bodyScale).toBeGreaterThan(1.1);
    expect(maine.anatomy.body.bodyScale).toBeGreaterThan(dsh.anatomy.body.bodyScale);

    expect(BREED_PROFILES.scottish_fold.anatomy.ears.shape).toBe('folded_owl');
    expect(BREED_PROFILES.japanese_bobtail.anatomy.tail.style).toBe('pom_pom_bobtail');
    expect(BREED_PROFILES.japanese_bobtail.anatomy.tail.segments).toBeLessThanOrEqual(3);
    expect(BREED_PROFILES.american_curl.anatomy.ears.shape).toBe('curled_back');
    expect(BREED_PROFILES.russian_blue.anatomy.ears.shape).toBe('tall_wide_pointed');
    expect(BREED_PROFILES.abyssinian.anatomy.ears.shape).toBe('cupped_alert');
    expect(BREED_PROFILES.maine_coon.anatomy.tail.style).toBe('giant_plume');
    expect(BREED_PROFILES.ragdoll.anatomy.tail.style).toBe('silky_plume');
    expect(BREED_PROFILES.bengal.anatomy.tail.style).toBe('muscular_leopard');

    // Bengal is a fast hunter; Ragdoll is a gentle lap cat
    expect(BREED_PROFILES.bengal.locomotion.walkSpeedMultiplier).toBeGreaterThan(1.0);
    expect(BREED_PROFILES.ragdoll.locomotion.walkSpeedMultiplier).toBeLessThanOrEqual(1.0);
  });

  it('generates distinct, valid coat profiles for every variant of every breed and normalizes legacy names', () => {
    const seenVariantIds = new Set<string>();
    let total = 0;
    for (const breed of CAT_BREEDS) {
      const variants = getBreedCoatVariants(breed);
      for (let i = 0; i < variants.length; i++) {
        const coat = getCoatProfile(breed, i);
        expect(coat.breed).toBe(breed);
        expect(coat.coatVariantIndex).toBe(i);
        expect(coat.variantId).toBe(variants[i].id);
        expect(seenVariantIds.has(coat.variantId), `dup ${coat.variantId}`).toBe(false);
        seenVariantIds.add(coat.variantId);
        total++;
        for (const key of ['baseColor', 'pawColor', 'noseColor', 'eyeIrisColor', 'tailBaseColor'] as const) {
          expect(Number.isFinite(coat[key])).toBe(true);
          expect(coat[key]).toBeGreaterThanOrEqual(0);
          expect(coat[key]).toBeLessThanOrEqual(0xffffff);
        }
        if (breed === 'siamese') expect(coat.pattern).toBe('colorpoint');
        if (breed === 'sphynx') expect(coat.pattern.startsWith('hairless')).toBe(true);
      }
      // wrap-around variant indexes remain safe
      expect(getCoatProfile(breed, 9999).breed).toBe(breed);
      expect(getCoatProfile(breed, -3).breed).toBe(breed);
    }
    expect(total).toBeGreaterThanOrEqual(14 * 3);
    expect(seenVariantIds.size).toBe(total);

    expect(normalizeCatBreed('calico')).toBe('persian');
    expect(normalizeCatBreed('tuxedo')).toBe('munchkin');
    expect(normalizeCatBreed('blue-grey')).toBe('british_shorthair');
    expect(normalizeCatBreed('orange-tabby')).toBe('domestic_shorthair');
    expect(normalizeCatBreed('Maine Coon')).toBe('maine_coon');
    expect(normalizeCatBreed('scottish-fold')).toBe('scottish_fold');
    expect(normalizeCatBreed('Russian Blue')).toBe('russian_blue');
    expect(normalizeBreedMode('mix')).toBe('mix');
    expect(normalizeBreedMode('bengal')).toBe('bengal');
    expect(normalizeBreedMode('japanese_bobtail')).toBe('japanese_bobtail');
    expect(normalizeBreedMode('blue-grey')).toBe('british_shorthair');
    expect(normalizeBreedMode('unknown_value')).toBe('mix');
    expect(normalizeBreedMode(42)).toBe('mix');
  });

  it('Kitten Mode: 0.68x scale constant, getBreedBodyScale applies kitten multiplier for all breeds', () => {
    expect(KITTEN_BODY_SCALE).toBeCloseTo(0.68, 5);
    for (const breed of CAT_BREEDS) {
      const adult = getBreedBodyScale(breed, false);
      const kitten = getBreedBodyScale(breed, true);
      expect(kitten).toBeCloseTo(adult * KITTEN_BODY_SCALE, 5);
      expect(kitten).toBeLessThan(adult);
    }
  });

  it('computes breed-aware paw layouts across walking, grooming, loaf, curled, belly-roll poses', () => {
    const spine = makeSpine();
    const munchkinWalk = computeBreedPawLayout(BREED_PROFILES.munchkin, spine, {
      poseMode: 'normal',
      walkPhase: 0.8,
      speed: 90,
    });
    const siameseWalk = computeBreedPawLayout(BREED_PROFILES.siamese, spine, {
      poseMode: 'normal',
      walkPhase: 0.8,
      speed: 90,
    });
    expect(munchkinWalk).toHaveLength(4);
    expect(siameseWalk).toHaveLength(4);
    expect(munchkinWalk[0].x).toBeLessThan(siameseWalk[0].x - 3);

    const loafPaws = computeBreedPawLayout(
      BREED_PROFILES.british_shorthair,
      { ...spine, isLoaf: true, poseMode: 'loaf' },
      { poseMode: 'loaf' },
    );
    expect(loafPaws).toHaveLength(2);

    const curledPaws = computeBreedPawLayout(
      BREED_PROFILES.british_shorthair,
      { ...spine, isLoaf: true, poseMode: 'curled' },
      { poseMode: 'curled' },
    );
    expect(curledPaws).toHaveLength(0);

    const bellyPaws = computeBreedPawLayout(BREED_PROFILES.persian, spine, {
      poseMode: 'roll_belly',
      rollPhase: 1.2,
    });
    expect(bellyPaws).toHaveLength(4);
    expect(bellyPaws.every((p) => p.showPads)).toBe(true);

    const groomPaws = computeBreedPawLayout(BREED_PROFILES.persian, spine, {
      poseMode: 'groom',
      groomPhase: 1.0,
      headPos: { x: 136, y: 100 },
      headAngle: 0,
    });
    expect(groomPaws.some((p) => p.isFront && p.showPads)).toBe(true);
  });

  it('kitten mode shrinks paw layouts for every breed', () => {
    for (const breed of CAT_BREEDS) {
      const adult = computeBreedPawLayout(BREED_PROFILES[breed], makeSpine(), { poseMode: 'normal', speed: 0 });
      const kitten = computeBreedPawLayout(
        BREED_PROFILES[breed],
        makeSpine({ isKitten: true }),
        { poseMode: 'normal', speed: 0, isKitten: true },
      );
      expect(kitten).toHaveLength(adult.length);
      const adultR = adult.reduce((s, p) => s + p.radius, 0);
      const kittenR = kitten.reduce((s, p) => s + p.radius, 0);
      expect(kittenR, `${breed} kitten paws smaller`).toBeLessThan(adultR);
    }
  });

  it('parses collar colors (hex, shorthand, number) and rejects invalid values', () => {
    expect(parseCollarColor('#d94f5c')).toBe(0xd94f5c);
    expect(parseCollarColor('#fff')).toBe(0xffffff);
    expect(parseCollarColor(0x2fa69a)).toBe(0x2fa69a);
    expect(parseCollarColor(null)).toBeNull();
    expect(parseCollarColor(undefined)).toBeNull();
    expect(parseCollarColor('')).toBeNull();
    expect(parseCollarColor(Number.NaN)).toBeNull();
  });

  it('renders every breed (body, markings, tail, paws, ears, eyes, head, shadow) in every pose, adult and kitten, without throwing', () => {
    const poses: CatPoseMode[] = [
      'normal', 'stalk', 'loaf', 'curled', 'sunbathe', 'stretch', 'stretch_yawn', 'groom',
      'roll_belly', 'belly_up_sleep', 'meerkat', 'zoomies', 'pounce', 'butt_wiggle', 'scratch',
      'eating', 'drinking', 'kneading', 'slow_blink', 'flehmen', 'chatter', 'carrying_toy',
    ];
    const tailNodes = Array.from({ length: 8 }, (_, i) => ({ x: 90 - i * 6, y: 100 + Math.sin(i) * 4 }));

    for (const breed of CAT_BREEDS) {
      const profile = BREED_PROFILES[breed];
      for (let v = 0; v < profile.coatVariants.length; v++) {
        const coat = getCoatProfile(breed, v);
        for (const isKitten of [false, true]) {
          const gfx = createGfx();
          const spine = makeSpine({ isKitten, collarColor: '#d94f5c', hasBell: true, rimLightIntensity: 0.6, sunbeamWarmth: 0.5 });
          expect(() => {
            drawBreedBody(gfx, profile, coat, spine);
            drawBodyMarkings(gfx, coat, spine, profile);
            drawBreedTail(gfx, profile, coat, tailNodes, { isKitten, time: 1 });
            drawBreedPaws(gfx, profile, coat, spine, { isKitten });
            drawBreedHead(gfx, profile, coat, { isKitten, pupilDilation: 0.9, earPose: 'forward' });
            drawBreedShadow(gfx, profile, spine.hips, spine.torso, spine.head, 0, 1, 'normal', { isKitten });
          }, `${breed}#${v} kitten=${isKitten}`).not.toThrow();
          expect(gfx.__calls).toBeGreaterThan(20);
        }
      }

      const coat = getCoatProfile(breed, 0);
      for (const pose of poses) {
        const gfx = createGfx();
        const spine = makeSpine({ poseMode: pose, isLoaf: pose === 'loaf' || pose === 'curled', time: 2, kneadPhase: 1, groomPhase: 1, rollPhase: 1, stretchFactor: 0.7, meerkatFactor: 0.8 });
        expect(() => {
          drawBreedBody(gfx, profile, coat, spine);
          drawBreedPaws(gfx, profile, coat, spine, { poseMode: pose, walkPhase: 1, speed: 60, kneadPhase: 1, groomPhase: 1, rollPhase: 1, stretchFactor: 0.7, headPos: spine.head, headAngle: 0 });
          drawBreedHead(gfx, profile, coat, { poseMode: pose, groomPhase: 1, mouthOpen: 0.7 });
        }, `${breed} pose ${pose}`).not.toThrow();
      }
    }
  });

  it('supports all 4 ear poses, dynamic pupil dilation range, collars and bells with visible draw output', () => {
    const earPoses: CatEarPose[] = ['normal', 'forward', 'airplane', 'flat_back'];
    for (const breed of CAT_BREEDS) {
      const profile = BREED_PROFILES[breed];
      const coat = getCoatProfile(breed, 0);
      for (const earPose of earPoses) {
        const gfx = createGfx();
        expect(() => {
          drawBreedEar(gfx, profile, coat, -1, 0, 0, { earPose });
          drawBreedEar(gfx, profile, coat, 1, 0, 0, { earPose });
          drawBreedHead(gfx, profile, coat, { earPose });
        }, `${breed} ear ${earPose}`).not.toThrow();
        expect(gfx.__calls).toBeGreaterThan(0);
      }

      // Pupil dilation 0 (slit) through 1 (saucer), plus out-of-range clamping
      for (const dilation of [0, 0.15, 0.5, 0.95, 1, -1, 5]) {
        const gfx = createGfx();
        expect(() => {
          drawBreedEyes(gfx, profile, coat, { expression: 'normal', pupilDilation: dilation });
        }, `${breed} pupil ${dilation}`).not.toThrow();
        expect(gfx.__calls).toBeGreaterThan(0);
      }
      for (const expression of ['normal', 'dilated', 'closed', 'happy', 'slow_blink', 'wide_startled', 'dizzy', 'half_closed'] as const) {
        const gfx = createGfx();
        expect(() => drawBreedEyes(gfx, profile, coat, { expression })).not.toThrow();
      }

      // Collar + bell draws extra geometry vs no collar
      const spine = makeSpine();
      const withCollar = createGfx();
      drawCatCollar(withCollar, profile, spine, '#2fa69a', true);
      expect(withCollar.__calls, `${breed} collar draws`).toBeGreaterThan(0);

      const noBell = createGfx();
      drawCatCollar(noBell, profile, spine, '#2fa69a', false);
      expect(noBell.__calls).toBeGreaterThan(0);
      expect(withCollar.__calls).toBeGreaterThan(noBell.__calls);

      const noCollar = createGfx();
      drawCatCollar(noCollar, profile, spine, null, true);
      expect(noCollar.__calls).toBe(0);
    }
  });

  it('produces showcase breed diversity in mix mode across all 14 breeds and decorrelated personalities', () => {
    const mix14 = pickDiverseBreedOrder(14, 'mix');
    expect(new Set(mix14).size).toBe(14);
    expect(mix14).toEqual(CAT_BREEDS);

    // 50 cats cycle through every breed evenly
    const mix50 = pickDiverseBreedOrder(50, 'mix');
    expect(mix50).toHaveLength(50);
    expect(new Set(mix50).size).toBe(14);

    expect(pickDiverseBreedOrder(4, 'munchkin')).toEqual(['munchkin', 'munchkin', 'munchkin', 'munchkin']);
    expect(pickDiverseBreedOrder(0, 'mix')).toEqual([]);

    const persianP = generateBreedPersonality('persian', 101);
    const munchkinP = generateBreedPersonality('munchkin', 202);
    const sphynxP = generateBreedPersonality('sphynx', 303);
    const siameseP = generateBreedPersonality('siamese', 404);

    for (const breed of CAT_BREEDS) {
      for (const val of Object.values(generateBreedPersonality(breed, 77))) {
        expect(val).toBeGreaterThanOrEqual(0.05);
        expect(val).toBeLessThanOrEqual(0.98);
      }
    }
    expect(persianP.laziness).toBeGreaterThan(siameseP.laziness);
    expect(munchkinP.zoomieProneness).toBeGreaterThan(persianP.zoomieProneness);
    expect(sphynxP.warmthAffinity).toBeGreaterThan(munchkinP.warmthAffinity);

    expect(generateBreedPersonality('domestic_shorthair', 1111)).not.toEqual(
      generateBreedPersonality('domestic_shorthair', 9999),
    );

    const identities = ([1, 2, 3, 4] as const).map((id) => generateCatIdentity(id, 'siamese', id * 7919));
    expect(new Set(identities.map((i) => i.coatVariantIndex)).size).toBe(4);
    expect(pickBreedName('munchkin', 0)).toBe('Mochi');
  });

  it('generates valid identities for 100 cats with unique ids and well-formed fields', () => {
    const breeds = pickDiverseBreedOrder(100, 'mix');
    const ids = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const identity = generateCatIdentity(i + 1, breeds[i], (i + 1) * 104729);
      ids.add(identity.id);
      expect(identity.breed).toBe(breeds[i]);
      expect(identity.breedLabel).toBe(CAT_BREED_LABELS[breeds[i]]);
      expect(identity.name.length).toBeGreaterThan(0);
      expect(identity.coatVariantIndex).toBeGreaterThanOrEqual(0);
      expect(identity.coatVariantIndex).toBeLessThan(BREED_PROFILES[breeds[i]].coatVariants.length);
    }
    expect(ids.size).toBe(100);
  });
});
