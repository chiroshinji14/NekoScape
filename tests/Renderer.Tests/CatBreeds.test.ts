import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => ({
  Graphics: class {},
  Container: class {},
}));

import {
  BREED_PROFILES,
  generateBreedPersonality,
  generateCatIdentity,
  getBreedCoatVariants,
  getBreedProfile,
  pickBreedName,
  pickDiverseBreedOrder,
} from '@/entities/CatBreeds';
import {
  computeBreedPawLayout,
  getCoatProfile,
  type SpineRenderPoints,
} from '@/entities/CatCoatGenerator';
import {
  CAT_BREEDS,
  CAT_BREED_LABELS,
  CAT_BREED_MODES,
  normalizeBreedMode,
  normalizeCatBreed,
  type CatBreed,
} from '@/types/simulation';

describe('CatBreeds & CatCoatGenerator — 6 Real-Life Cat Breeds', () => {
  it('defines all 6 canonical real-life cat breeds with distinct labels and profiles', () => {
    expect(CAT_BREEDS).toEqual([
      'persian',
      'siamese',
      'british_shorthair',
      'munchkin',
      'sphynx',
      'domestic_shorthair',
    ]);
    expect(CAT_BREED_MODES).toEqual(['mix', ...CAT_BREEDS]);

    for (const breed of CAT_BREEDS) {
      const profile = getBreedProfile(breed);
      expect(profile).toBeDefined();
      expect(profile.breed).toBe(breed);
      expect(profile.label).toBe(CAT_BREED_LABELS[breed]);
      expect(profile.coatVariants.length).toBeGreaterThanOrEqual(4);
      expect(profile.defaultNames.length).toBeGreaterThanOrEqual(6);
      expect(profile.clickCaptions.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('enforces breed-authentic anatomical dimensions, ear/tail/leg specs, and locomotion profiles', () => {
    const persian = BREED_PROFILES.persian;
    const siamese = BREED_PROFILES.siamese;
    const british = BREED_PROFILES.british_shorthair;
    const munchkin = BREED_PROFILES.munchkin;
    const sphynx = BREED_PROFILES.sphynx;
    const dsh = BREED_PROFILES.domestic_shorthair;

    // 1. Persian: ultra-fluffy longhair, flat brachycephalic face, small rounded tufted ears, plume brush tail, regal slow stride
    expect(persian.anatomy.body.coatType).toBe('longhair');
    expect(persian.anatomy.body.fluffIntensity).toBe(1.0);
    expect(persian.anatomy.body.furScallopCount).toBeGreaterThanOrEqual(12);
    expect(persian.anatomy.body.hasChestMane).toBe(true);
    expect(persian.anatomy.body.hasCheekRuffs).toBe(true);
    expect(persian.anatomy.head.shape).toBe('brachycephalic');
    expect(persian.anatomy.head.muzzleOffset).toBeLessThan(0.6);
    expect(persian.anatomy.ears.shape).toBe('small_rounded');
    expect(persian.anatomy.ears.hasEarTufts).toBe(true);
    expect(persian.anatomy.eyes.shape).toBe('large_round');
    expect(persian.anatomy.tail.style).toBe('plume_brush');
    expect(persian.anatomy.tail.midWidth).toBeGreaterThan(12);
    expect(persian.locomotion.walkSpeedMultiplier).toBeLessThan(0.82);
    expect(persian.behaviorAffinities.grooming).toBeGreaterThanOrEqual(0.9);
    expect(persian.behaviorAffinities.loafing).toBeGreaterThanOrEqual(0.9);

    // 2. Siamese: sleek elongated tubular body, wedge head, large pointed ears, slanted sapphire eyes, 7-node whip tail
    expect(siamese.anatomy.body.coatType).toBe('sleek');
    const siameseSpineLen =
      siamese.anatomy.body.headToTorsoLen + siamese.anatomy.body.torsoToHipsLen;
    const persianSpineLen =
      persian.anatomy.body.headToTorsoLen + persian.anatomy.body.torsoToHipsLen;
    expect(siameseSpineLen).toBeGreaterThan(persianSpineLen + 6);
    expect(siamese.anatomy.body.torsoRadius).toBeLessThan(british.anatomy.body.torsoRadius - 3.5);
    expect(siamese.anatomy.head.shape).toBe('wedge');
    expect(siamese.anatomy.ears.shape).toBe('large_pointed');
    expect(siamese.anatomy.ears.length).toBeGreaterThan(10.5);
    expect(siamese.anatomy.eyes.shape).toBe('slanted_almond');
    expect(siamese.anatomy.tail.style).toBe('whip');
    expect(siamese.anatomy.tail.segments).toBe(7);
    expect(siamese.locomotion.walkSpeedMultiplier).toBeGreaterThan(1.1);
    expect(siamese.locomotion.jumpArcMultiplier).toBeGreaterThan(1.1);

    // 3. British Shorthair: stocky cobby plush body, Cheshire jowls, medium rounded ears, thick plush blunt tail
    expect(british.anatomy.body.coatType).toBe('plush_dense');
    expect(british.anatomy.body.torsoRadius).toBeGreaterThanOrEqual(14);
    expect(british.anatomy.body.hasCheekRuffs).toBe(true);
    expect(british.anatomy.body.cheekRuffScale).toBeGreaterThanOrEqual(1.4);
    expect(british.anatomy.head.shape).toBe('round_jowls');
    expect(british.anatomy.ears.shape).toBe('medium_rounded');
    expect(british.anatomy.tail.style).toBe('plush_blunt');
    expect(british.anatomy.tail.tipWidth).toBeGreaterThanOrEqual(7.0);
    expect(british.behaviorAffinities.loafing).toBeGreaterThanOrEqual(0.95);
    expect(british.behaviorAffinities.perching).toBeGreaterThanOrEqual(0.88);

    // 4. Munchkin: low-slung body, stubby short legs tucked close, rapid high-frequency patter gait & bouncy hop
    expect(munchkin.anatomy.legs.tuckedClose).toBe(true);
    expect(munchkin.anatomy.legs.pawRadius).toBeLessThan(dsh.anatomy.legs.pawRadius);
    expect(munchkin.anatomy.legs.frontReach).toBeLessThan(dsh.anatomy.legs.frontReach * 0.6);
    expect(munchkin.anatomy.body.shadowOffsetScale).toBeLessThan(0.7);
    expect(munchkin.locomotion.strideFrequencyMultiplier).toBeGreaterThanOrEqual(1.85);
    expect(munchkin.locomotion.hopBounceFactor).toBeGreaterThanOrEqual(0.5);
    expect(munchkin.behaviorAffinities.zoomies).toBeGreaterThanOrEqual(0.95);
    expect(munchkin.behaviorAffinities.meerkatPeek).toBeGreaterThanOrEqual(0.95);

    // 5. Sphynx: hairless suede skin with wrinkles, giant bat ears with cartilage detail, lemon eyes, high warmth affinity
    expect(sphynx.anatomy.body.coatType).toBe('hairless');
    expect(sphynx.anatomy.body.fluffIntensity).toBe(0);
    expect(sphynx.anatomy.body.furScallopCount).toBe(0);
    expect(sphynx.anatomy.body.hasWrinkles).toBe(true);
    expect(sphynx.anatomy.body.wrinkleAlpha).toBeGreaterThan(0.35);
    expect(sphynx.anatomy.head.shape).toBe('angular_cheekbones');
    expect(sphynx.anatomy.head.whiskerLength).toBeLessThan(4);
    expect(sphynx.anatomy.ears.shape).toBe('giant_bat');
    expect(sphynx.anatomy.ears.length).toBeGreaterThan(13.5);
    expect(sphynx.anatomy.ears.hasCartilageDetail).toBe(true);
    expect(sphynx.anatomy.eyes.shape).toBe('lemon');
    expect(sphynx.anatomy.tail.style).toBe('hairless_whip');
    expect(sphynx.personalityPriors.warmthAffinity).toBeGreaterThanOrEqual(0.95);
    expect(sphynx.behaviorAffinities.sunbathing).toBeGreaterThanOrEqual(0.95);
    expect(sphynx.behaviorAffinities.socialCuddle).toBeGreaterThanOrEqual(0.95);

    // 6. Domestic Shorthair: balanced athletic reference build with 5 classic real-life coats
    expect(dsh.anatomy.body.coatType).toBe('shorthair');
    expect(dsh.anatomy.head.shape).toBe('classic');
    expect(dsh.anatomy.ears.shape).toBe('medium_pointed');
    expect(dsh.anatomy.tail.style).toBe('tapered');
    expect(dsh.locomotion.walkSpeedMultiplier).toBe(1.0);
    expect(dsh.locomotion.strideFrequencyMultiplier).toBe(1.0);
    expect(dsh.coatVariants).toHaveLength(5);

    // Ensure every breed has a unique head shape, ear shape, coat type, and tail style
    expect(new Set(CAT_BREEDS.map((b) => BREED_PROFILES[b].anatomy.head.shape)).size).toBe(6);
    expect(new Set(CAT_BREEDS.map((b) => BREED_PROFILES[b].anatomy.ears.shape)).size).toBe(6);
    expect(new Set(CAT_BREEDS.map((b) => BREED_PROFILES[b].anatomy.body.coatType)).size).toBe(6);
    expect(new Set(CAT_BREEDS.map((b) => BREED_PROFILES[b].anatomy.tail.style)).size).toBe(6);
  });

  it('generates distinct coat profiles for all 25 variants across the 6 breeds and normalizes legacy coat names', () => {
    const seenVariantIds = new Set<string>();
    for (const breed of CAT_BREEDS) {
      const variants = getBreedCoatVariants(breed);
      for (let i = 0; i < variants.length; i++) {
        const coat = getCoatProfile(breed, i);
        expect(coat.breed).toBe(breed);
        expect(coat.coatVariantIndex).toBe(i);
        expect(coat.variantId).toBe(variants[i].id);
        expect(seenVariantIds.has(coat.variantId)).toBe(false);
        seenVariantIds.add(coat.variantId);

        if (breed === 'siamese') {
          expect(coat.pattern).toBe('colorpoint');
          expect(coat.pointColor).not.toBe(coat.baseColor);
        }
        if (breed === 'sphynx') {
          expect(coat.pattern.startsWith('hairless')).toBe(true);
          expect(coat.wrinkleColor).toBeDefined();
        }
      }
    }
    expect(seenVariantIds.size).toBe(25);

    // Legacy coat normalization backward compatibility
    expect(normalizeCatBreed('calico')).toBe('persian');
    expect(normalizeCatBreed('tuxedo')).toBe('munchkin');
    expect(normalizeCatBreed('blue-grey')).toBe('british_shorthair');
    expect(normalizeCatBreed('orange-tabby')).toBe('domestic_shorthair');
    expect(normalizeCatBreed('black')).toBe('domestic_shorthair');
    expect(normalizeBreedMode('mix')).toBe('mix');
    expect(normalizeBreedMode('siamese')).toBe('siamese');
    expect(normalizeBreedMode('blue-grey')).toBe('british_shorthair');
    expect(normalizeBreedMode('unknown_value')).toBe('mix');
  });

  it('computes breed-aware paw layouts across walking, grooming, stretching, meerkat, and belly-roll poses', () => {
    const spine: SpineRenderPoints = {
      hips: { x: 100, y: 100 },
      torso: { x: 116, y: 100 },
      head: { x: 132, y: 100 },
      hipDir: { x: 1, y: 0 },
      torsoDir: { x: 1, y: 0 },
      headDir: { x: 1, y: 0 },
      bodyScaleX: 1,
      bodyScaleY: 1,
      isLoaf: false,
    };

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
    // Munchkin paws stay tucked significantly closer to torso than Siamese long legs
    expect(munchkinWalk[0].x).toBeLessThan(siameseWalk[0].x - 3);

    // Loaf shows only 2 tiny tucked front mitten tips; curled hides all 4 paws
    const loafPaws = computeBreedPawLayout(
      BREED_PROFILES.british_shorthair,
      { ...spine, isLoaf: true, poseMode: 'loaf' },
      { poseMode: 'loaf' },
    );
    expect(loafPaws).toHaveLength(2);
    expect(loafPaws.every((p) => p.isFront && !p.showPads)).toBe(true);

    const curledPaws = computeBreedPawLayout(
      BREED_PROFILES.british_shorthair,
      { ...spine, isLoaf: true, poseMode: 'curled' },
      { poseMode: 'curled' },
    );
    expect(curledPaws).toHaveLength(0);

    // Belly roll exposes toe-bean pads on all 4 paws
    const bellyPaws = computeBreedPawLayout(BREED_PROFILES.persian, spine, {
      poseMode: 'roll_belly',
      rollPhase: 1.2,
    });
    expect(bellyPaws).toHaveLength(4);
    expect(bellyPaws.every((p) => p.showPads)).toBe(true);

    // Grooming lifts front-right paw with visible toe pads toward the face
    const groomPaws = computeBreedPawLayout(BREED_PROFILES.persian, spine, {
      poseMode: 'groom',
      groomPhase: 1.0,
      headPos: { x: 136, y: 100 },
      headAngle: 0,
    });
    expect(groomPaws).toHaveLength(4);
    expect(groomPaws.some((p) => p.isFront && p.showPads)).toBe(true);
  });

  it('produces showcase breed diversity in mix mode and decorrelated breed-authentic personalities', () => {
    const mix6 = pickDiverseBreedOrder(6, 'mix');
    expect(new Set(mix6).size).toBe(6);
    expect(mix6).toEqual(CAT_BREEDS);

    const single4 = pickDiverseBreedOrder(4, 'munchkin');
    expect(single4).toEqual(['munchkin', 'munchkin', 'munchkin', 'munchkin']);

    const persianP = generateBreedPersonality('persian', 101);
    const munchkinP = generateBreedPersonality('munchkin', 202);
    const sphynxP = generateBreedPersonality('sphynx', 303);
    const siameseP = generateBreedPersonality('siamese', 404);

    for (const p of [persianP, munchkinP, sphynxP, siameseP]) {
      for (const val of Object.values(p)) {
        expect(val).toBeGreaterThanOrEqual(0.05);
        expect(val).toBeLessThanOrEqual(0.98);
      }
    }

    expect(persianP.laziness).toBeGreaterThan(siameseP.laziness);
    expect(munchkinP.zoomieProneness).toBeGreaterThan(persianP.zoomieProneness);
    expect(sphynxP.warmthAffinity).toBeGreaterThan(munchkinP.warmthAffinity);

    // Distinct seeds yield distinct personality vectors for the same breed
    const pSeedA = generateBreedPersonality('domestic_shorthair', 1111);
    const pSeedB = generateBreedPersonality('domestic_shorthair', 9999);
    expect(pSeedA).not.toEqual(pSeedB);

    // Identity generator assigns valid breed labels, names, and cycling coat variants
    const identities = ([1, 2, 3, 4] as const).map((id) =>
      generateCatIdentity(id, 'siamese', id * 7919),
    );
    const variantIndices = new Set(identities.map((id) => id.coatVariantIndex));
    expect(variantIndices.size).toBe(4);
    expect(pickBreedName('munchkin', 0)).toBe('Mochi');
  });
});
