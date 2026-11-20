import { Graphics } from 'pixi.js';
import {
  normalizeCatBreed,
  type CatBreed,
  type CatEarPose,
  type ToyKind,
  type Vec2,
} from '../types/simulation';
import {
  KITTEN_BODY_SCALE,
  getBreedProfile,
  type CatBreedProfile,
  type CoatPatternKind,
  type CoatVariantPalette,
} from './CatBreeds';

export interface CatCoatProfile {
  breed: CatBreed;
  variantId: string;
  variantName: string;
  coatVariantIndex: number;
  pattern: CoatPatternKind;
  baseColor: number;
  shadowColor: number;
  highlightColor: number;
  bellyColor: number;
  muzzleColor: number;
  pawColor: number;
  pawPadColor: number;
  earOuterColor: number;
  earInnerColor: number;
  noseColor: number;
  eyeIrisColor: number;
  eyeRimColor: number;
  nightEyeGlowColor: number;
  tailBaseColor: number;
  tailTipColor: number;
  stripeColor: number;
  secondaryPatchColor: number;
  pointColor: number;
  wrinkleColor: number;
  whiskerColor: number;
}

export type CatPoseMode =
  | 'normal'
  | 'stalk'
  | 'loaf'
  | 'curled'
  | 'sunbathe'
  | 'stretch'
  | 'stretch_yawn'
  | 'groom'
  | 'roll_belly'
  | 'belly_up_sleep'
  | 'meerkat'
  | 'zoomies'
  | 'pounce'
  | 'butt_wiggle'
  | 'scratch'
  | 'eating'
  | 'drinking'
  | 'kneading'
  | 'slow_blink'
  | 'flehmen'
  | 'chatter'
  | 'carrying_toy';

export type CatEyeExpression =
  | 'normal'
  | 'dilated'
  | 'closed'
  | 'happy'
  | 'slow_blink'
  | 'wide_startled'
  | 'dizzy'
  | 'half_closed';

export interface SpineRenderPoints {
  hips: Vec2;
  torso: Vec2;
  head: Vec2;
  hipDir: Vec2;
  torsoDir: Vec2;
  headDir: Vec2;
  bodyScaleX: number;
  bodyScaleY: number;
  isLoaf: boolean;
  poseMode?: CatPoseMode;
  stretchFactor?: number;
  rollPhase?: number;
  groomPhase?: number;
  kneadPhase?: number;
  meerkatFactor?: number;
  time?: number;
  isKitten?: boolean;
  collarColor?: string | number | null;
  hasBell?: boolean;
  rimLightIntensity?: number;
  sunbeamWarmth?: number;
}

export interface TailRenderOptions {
  puffFactor?: number;
  isCurled?: boolean;
  isKitten?: boolean;
  rimLightIntensity?: number;
  sunbeamWarmth?: number;
  time?: number;
}

export interface PawLayoutPoint {
  x: number;
  y: number;
  radius: number;
  angle: number;
  showPads: boolean;
  isFront: boolean;
  side: -1 | 1;
}

export interface PawRenderOptions {
  poseMode?: CatPoseMode;
  walkPhase?: number;
  speed?: number;
  isPounce?: boolean;
  isScratch?: boolean;
  scratchPhase?: number;
  groomPhase?: number;
  kneadPhase?: number;
  rollPhase?: number;
  stretchFactor?: number;
  headPos?: Vec2;
  headAngle?: number;
  isKitten?: boolean;
  time?: number;
}

export interface HeadRenderOptions {
  /** Ear flatten in radians (negative = flattened/airplane ears back, positive = perked forward). */
  earFlatten?: number;
  earPose?: CatEarPose;
  earTwitchLeft?: number;
  earTwitchRight?: number;
  eyeExpression?: CatEyeExpression;
  /** Dynamic pupil dilation in [0..1]: 0.15-0.28 thin sunlight slit, 0.78-0.98 wide night/excited saucer. */
  pupilDilation?: number;
  /** Independent whisker oscillation [-1..1] for sniffing, dreaming, or chattering. */
  whiskerTwitch?: number;
  isCurled?: boolean;
  isKitten?: boolean;
  nightMode?: boolean;
  rimLightIntensity?: number;
  sunbeamWarmth?: number;
  carriedToyKind?: ToyKind | null;
  mouthOpen?: number;
  time?: number;
  poseMode?: CatPoseMode;
  groomPhase?: number;
}

export interface EyeRenderOptions {
  expression: CatEyeExpression;
  pupilDilation?: number;
  isCurled?: boolean;
  isKitten?: boolean;
  nightMode?: boolean;
  time?: number;
}

export interface ShadowRenderOptions {
  isKitten?: boolean;
}

const KAPPA = 0.55228475;
const KITTEN_HEAD_ABSOLUTE_SCALE = 0.84;
const KITTEN_EAR_SCALE = 1.15;
const KITTEN_EYE_SCALE = 1.18;
const SUNBEAM_RIM_COLOR = 0xffdf99;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function parseCollarColor(color: string | number | null | undefined): number | null {
  if (color === null || color === undefined) {
    return null;
  }
  if (typeof color === 'number') {
    return Number.isFinite(color) ? color & 0xffffff : null;
  }
  const trimmed = color.trim();
  if (!trimmed) {
    return null;
  }
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split('')
      .map((c) => c + c)
      .join('');
    return parseInt(expanded, 16);
  }
  if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
    return parseInt(hex, 16);
  }
  return null;
}

function resolveWarmRimStrength(rimLightIntensity?: number, sunbeamWarmth?: number): number {
  return clamp(Math.max(rimLightIntensity ?? 0, sunbeamWarmth ?? 0), 0, 1);
}

function perp(dir: Vec2): Vec2 {
  return { x: -dir.y, y: dir.x };
}

function pt(origin: Vec2, dir: Vec2, forward: number, side: number): Vec2 {
  const n = perp(dir);
  return {
    x: origin.x + dir.x * forward + n.x * side,
    y: origin.y + dir.y * forward + n.y * side,
  };
}

function mixColor(a: number, b: number, t: number): number {
  const k = clamp(t, 0, 1);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

function drawRotatedEllipse(
  gfx: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
): Graphics {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;

  const px = (lx: number, ly: number) => cx + lx * cos - ly * sin;
  const py = (lx: number, ly: number) => cy + lx * sin + ly * cos;

  return gfx
    .moveTo(px(rx, 0), py(rx, 0))
    .bezierCurveTo(px(rx, ky), py(rx, ky), px(kx, ry), py(kx, ry), px(0, ry), py(0, ry))
    .bezierCurveTo(px(-kx, ry), py(-kx, ry), px(-rx, ky), py(-rx, ky), px(-rx, 0), py(-rx, 0))
    .bezierCurveTo(px(-rx, -ky), py(-rx, -ky), px(-kx, -ry), py(-kx, -ry), px(0, -ry), py(0, -ry))
    .bezierCurveTo(px(kx, -ry), py(kx, -ry), px(rx, -ky), py(rx, -ky), px(rx, 0), py(rx, 0))
    .closePath();
}

function resolveLegacyDefaultVariant(rawBreed: string): { breed: CatBreed; defaultIndex: number } {
  const key = rawBreed.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (key) {
    case 'calico':
      return { breed: 'persian', defaultIndex: 3 };
    case 'tuxedo':
      return { breed: 'munchkin', defaultIndex: 0 };
    case 'black':
      return { breed: 'domestic_shorthair', defaultIndex: 4 };
    case 'blue_grey':
      return { breed: 'british_shorthair', defaultIndex: 0 };
    case 'orange_tabby':
      return { breed: 'domestic_shorthair', defaultIndex: 0 };
    default:
      return { breed: normalizeCatBreed(rawBreed), defaultIndex: 0 };
  }
}

function paletteToCoatProfile(
  breed: CatBreed,
  palette: CoatVariantPalette,
  coatVariantIndex: number,
): CatCoatProfile {
  return {
    breed,
    variantId: palette.id,
    variantName: palette.name,
    coatVariantIndex,
    pattern: palette.pattern,
    baseColor: palette.baseColor,
    shadowColor: palette.shadowColor,
    highlightColor: palette.highlightColor,
    bellyColor: palette.bellyColor,
    muzzleColor: palette.muzzleColor,
    pawColor: palette.pawColor,
    pawPadColor: palette.pawPadColor,
    earOuterColor: palette.earOuterColor,
    earInnerColor: palette.earInnerColor,
    noseColor: palette.noseColor,
    eyeIrisColor: palette.eyeIrisColor,
    eyeRimColor: palette.eyeRimColor,
    nightEyeGlowColor: palette.nightEyeGlowColor,
    tailBaseColor: palette.tailBaseColor,
    tailTipColor: palette.tailTipColor,
    stripeColor: palette.stripeColor,
    secondaryPatchColor: palette.secondaryPatchColor,
    pointColor: palette.pointColor ?? palette.muzzleColor,
    wrinkleColor: palette.wrinkleColor ?? palette.shadowColor,
    whiskerColor: palette.whiskerColor,
  };
}

/**
 * Returns a breed-authentic coat palette for the requested breed and optional coat variant index.
 * Gracefully handles legacy coat identifiers ('calico', 'tuxedo', 'black', 'blue-grey', 'orange-tabby').
 */
export function getCoatProfile(
  breed: CatBreed | string,
  variantIndex?: number,
): CatCoatProfile {
  const { breed: resolvedBreed, defaultIndex } = resolveLegacyDefaultVariant(String(breed));
  const breedProfile = getBreedProfile(resolvedBreed);
  const variants = breedProfile.coatVariants;
  const rawIndex =
    variantIndex !== undefined && Number.isFinite(variantIndex)
      ? Math.floor(variantIndex)
      : defaultIndex;
  const safeIndex = ((rawIndex % variants.length) + variants.length) % variants.length;
  return paletteToCoatProfile(resolvedBreed, variants[safeIndex], safeIndex);
}

/**
 * Draws breed-scaled dynamic drop shadow on the ground layer, adjusting ground closeness
 * (e.g. Munchkin's low-slung shadow) and airborne detachment during leaps/box jumps.
 */
export function drawBreedShadow(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  hips: Vec2,
  torso: Vec2,
  head: Vec2,
  zHeight: number,
  scaleZ: number,
  poseMode: CatPoseMode = 'normal',
  options: ShadowRenderOptions = {},
): void {
  const body = breedProfile.anatomy.body;
  const headSpec = breedProfile.anatomy.head;
  const bodySizeMul = options.isKitten ? KITTEN_BODY_SCALE : 1;
  const headSizeMul = options.isKitten ? KITTEN_HEAD_ABSOLUTE_SCALE : 1;
  const groundOff = body.shadowOffsetScale;
  const shX = 7 * zHeight + 2.5 * groundOff;
  const shY = 13 * zHeight + 4 * groundOff;
  const alpha = clamp(0.28 * (1 - zHeight * 0.54), 0.06, 0.3);
  const shadowMul = body.shadowScale * scaleZ * bodySizeMul;

  gfx.clear();

  if (poseMode === 'meerkat') {
    gfx
      .circle(hips.x + shX, hips.y + shY, body.hipRadius * 1.08 * scaleZ * bodySizeMul)
      .fill({ color: 0x22140b, alpha })
      .circle(torso.x + shX * 0.85, torso.y + shY * 0.85, body.torsoRadius * 0.9 * scaleZ * bodySizeMul)
      .fill({ color: 0x22140b, alpha: alpha * 0.8 });
    return;
  }

  const rHip = (body.hipRadius + 0.8) * shadowMul;
  const rTorso = (body.torsoRadius + 0.8) * shadowMul;
  const rHead = Math.max(headSpec.radiusX, headSpec.radiusY) * 0.94 * scaleZ * headSizeMul;

  gfx
    .circle(hips.x + shX, hips.y + shY, rHip)
    .fill({ color: 0x22140b, alpha })
    .circle(torso.x + shX, torso.y + shY, rTorso)
    .fill({ color: 0x22140b, alpha })
    .circle(head.x + shX, head.y + shY, rHead)
    .fill({ color: 0x22140b, alpha });
}

/**
 * Draws a breed-authentic tail along the Verlet chain:
 * - Persian: sumptuous plumed bottle-brush with overlapping feathered tufts
 * - Siamese: long thin colorpoint-shaded whip
 * - British Shorthair: thick dense plush tail with signature blunt rounded tip
 * - Munchkin: plump expressive medium tail
 * - Sphynx: sleek hairless slender whip with delicate base skin folds
 * - Domestic Shorthair: classic smoothly tapered feline tail with pattern tips/rings
 */
export function drawBreedTail(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  nodes: readonly Vec2[],
  options: TailRenderOptions = {},
): void {
  if (nodes.length < 2) {
    return;
  }

  const tailSpec = breedProfile.anatomy.tail;
  const puff = clamp(options.puffFactor ?? 0, 0, 1);
  const kittenMul = options.isKitten ? 0.78 : 1;
  const warmRim = resolveWarmRimStrength(options.rimLightIntensity, options.sunbeamWarmth);
  const count = nodes.length - 1;

  const isPlumeStyle =
    tailSpec.style === 'plume_brush' ||
    tailSpec.style === 'giant_plume' ||
    tailSpec.style === 'silky_plume' ||
    tailSpec.style === 'feathered_plume';

  const widthAt = (t: number): number => {
    const baseWidth =
      t < 0.5
        ? tailSpec.rootWidth + (tailSpec.midWidth - tailSpec.rootWidth) * (t * 2)
        : tailSpec.midWidth + (tailSpec.tipWidth - tailSpec.midWidth) * ((t - 0.5) * 2);
    const puffScale =
      tailSpec.style === 'hairless_whip'
        ? 1 + puff * 0.08
        : isPlumeStyle
          ? 1 + puff * 0.24
          : 1 + puff * 0.42;
    return baseWidth * puffScale * kittenMul;
  };

  // Japanese Bobtail iconic fluffy pom-pom bunny bobtail!
  if (tailSpec.style === 'pom_pom_bobtail') {
    const root = nodes[0];
    const tip = nodes[nodes.length - 1];
    const cx = (root.x + tip.x) * 0.5;
    const cy = (root.y + tip.y) * 0.5;
    const puffR = (tailSpec.midWidth * 0.52 + puff * 2.2) * kittenMul;
    const isCalico = coat.pattern === 'mike_calico' || coat.pattern === 'calico';

    // Outer subtle rim
    gfx
      .circle(cx, cy, puffR + 1.4)
      .fill({ color: coat.eyeRimColor, alpha: 0.24 });

    // Multi-lobe fluffy bunny pom-pom cluster
    const lobes = 6;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const lx = cx + Math.cos(a) * (puffR * 0.42);
      const ly = cy + Math.sin(a) * (puffR * 0.42);
      const lobeColor = isCalico
        ? i % 3 === 0
          ? coat.secondaryPatchColor
          : i % 3 === 1
            ? coat.stripeColor
            : coat.baseColor
        : coat.tailBaseColor;
      gfx.circle(lx, ly, puffR * 0.64).fill({ color: lobeColor, alpha: 0.98 });
    }
    gfx
      .circle(tip.x, tip.y, puffR * 0.72)
      .fill({ color: isCalico ? coat.tailTipColor : coat.highlightColor, alpha: 0.85 });

    if (warmRim > 0.02) {
      gfx
        .circle(cx, cy, puffR + 0.8)
        .stroke({ width: 1.5, color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.55 });
    }
    return;
  }

  if (isPlumeStyle) {
    // Persian / Maine Coon / Ragdoll / American Curl luxurious feathered plume
    for (let i = 0; i < count; i++) {
      const p0 = nodes[i];
      const p1 = nodes[i + 1];
      const tMid = (i + 0.5) / count;
      const w = widthAt(tMid);
      const segColor =
        coat.pattern === 'calico' || coat.pattern === 'mike_calico' || coat.pattern === 'tortoiseshell'
          ? i >= count - 2
            ? coat.tailTipColor
            : coat.tailBaseColor
          : coat.pattern === 'mitted_colorpoint' || coat.pattern === 'colorpoint'
            ? mixColor(coat.tailBaseColor, coat.pointColor, Math.pow(tMid, 0.7))
            : mixColor(coat.tailBaseColor, coat.tailTipColor, tMid * 0.85);
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);

      // Soft outer rim under-plume
      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: w + 2.2, color: coat.eyeRimColor, alpha: 0.22, cap: 'round' });

      if (warmRim > 0.02) {
        gfx
          .moveTo(p0.x, p0.y)
          .lineTo(p1.x, p1.y)
          .stroke({ width: w + 3.0, color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.36, cap: 'round' });
      }

      // Overlapping feathered fur tufts fanning gently along both sides of the plume
      const steps = tailSpec.style === 'giant_plume' ? 3 : 2;
      for (let s = 0; s < steps; s++) {
        const u = (s + 0.5) / steps;
        const mx = p0.x + (p1.x - p0.x) * u;
        const my = p0.y + (p1.y - p0.y) * u;
        const plumeRx = Math.max(4.0, w * 0.56);
        const plumeRy = Math.max(4.3, w * 0.64);
        drawRotatedEllipse(gfx, mx, my, plumeRx, plumeRy, ang)
          .fill({ color: segColor, alpha: 0.96 });
      }
    }

    // Soft bright feathered highlight plumes down the center ridge
    for (let i = 0; i < count; i++) {
      const p0 = nodes[i];
      const p1 = nodes[i + 1];
      const tMid = (i + 0.5) / count;
      const w = widthAt(tMid);
      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: w * 0.34, color: coat.highlightColor, alpha: 0.36, cap: 'round' });
    }
    return;
  }

  // Standard, whip, plush blunt/tapered, plump upright, leopard, ticked, and hairless whip tails
  for (let i = 0; i < count; i++) {
    const p0 = nodes[i];
    const p1 = nodes[i + 1];
    const t = i / count;
    const tMid = (i + 0.5) / count;
    const width = widthAt(tMid);

    let color: number;
    if (coat.pattern === 'colorpoint' || coat.pattern === 'mitted_colorpoint') {
      color = mixColor(coat.tailBaseColor, coat.pointColor, Math.pow(tMid, 0.72));
    } else if (coat.pattern === 'tuxedo' || coat.pattern === 'bicolor') {
      color = i === count - 1 ? coat.tailTipColor : coat.tailBaseColor;
    } else if (coat.pattern === 'calico' || coat.pattern === 'mike_calico' || coat.pattern === 'tortoiseshell') {
      color = i >= count - 2 ? coat.tailTipColor : coat.tailBaseColor;
    } else if (coat.pattern === 'ticked_agouti') {
      color = i >= count - 2 ? mixColor(coat.tailBaseColor, coat.tailTipColor, (tMid - 0.5) * 2) : coat.tailBaseColor;
    } else {
      color = mixColor(coat.tailBaseColor, coat.tailTipColor, t * 0.85);
    }

    if (warmRim > 0.02) {
      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: width + 2.6, color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.38, cap: 'round' });
    }

    gfx
      .moveTo(p0.x, p0.y)
      .lineTo(p1.x, p1.y)
      .stroke({ width: width + 1.4, color: coat.eyeRimColor, alpha: 0.28, cap: 'round' })
      .moveTo(p0.x, p0.y)
      .lineTo(p1.x, p1.y)
      .stroke({ width, color, alpha: 1, cap: 'round' });

    // Subtle tabby/leopard tail rings
    if (
      (coat.pattern === 'tabby_mackerel' ||
        coat.pattern === 'tabby_classic' ||
        coat.pattern === 'rosette_spotted' ||
        coat.pattern === 'rosette_marbled') &&
      i > 0
    ) {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      const halfSpan = width * 0.44;
      gfx
        .moveTo(mx - nx * halfSpan, my - ny * halfSpan)
        .lineTo(mx + nx * halfSpan, my + ny * halfSpan)
        .stroke({
          width: coat.pattern.startsWith('rosette') ? 2.2 : 1.8,
          color: coat.stripeColor,
          alpha: coat.pattern.startsWith('rosette') ? 0.78 : 0.65,
          cap: 'round',
        });
    }

    // British Shorthair / Scottish Fold / Russian Blue velvety plush highlight
    if (
      (tailSpec.style === 'plush_blunt' ||
        tailSpec.style === 'plush_tapered' ||
        tailSpec.style === 'sleek_tapered') &&
      i < count - 1
    ) {
      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: width * 0.28, color: coat.highlightColor, alpha: 0.3, cap: 'round' });
    }

    // Sphynx delicate root skin-fold rings on segment 0
    if (tailSpec.style === 'hairless_whip' && i === 0) {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      for (const u of [0.28, 0.58]) {
        const mx = p0.x + dx * u;
        const my = p0.y + dy * u;
        const hs = width * 0.42;
        gfx
          .moveTo(mx - nx * hs, my - ny * hs)
          .lineTo(mx + nx * hs, my + ny * hs)
          .stroke({ width: 0.9, color: coat.wrinkleColor, alpha: 0.42, cap: 'round' });
      }
    }
  }

  // Emphasize British Shorthair's iconic blunt rounded tip cap
  if (tailSpec.style === 'plush_blunt') {
    const tip = nodes[nodes.length - 1];
    gfx
      .circle(tip.x, tip.y, widthAt(1) * 0.52)
      .fill({ color: coat.tailTipColor, alpha: 1 });
  }
}

/**
 * Computes breed-accurate positions for all 4 paws across walk, loaf, stretch, groom,
 * roll-belly, meerkat-peek, sunbathe, scratch, and pounce poses.
 */
export function computeBreedPawLayout(
  breedProfile: CatBreedProfile,
  spine: SpineRenderPoints,
  options: PawRenderOptions = {},
): PawLayoutPoint[] {
  const pose = options.poseMode ?? spine.poseMode ?? (spine.isLoaf ? 'loaf' : 'normal');
  if (pose === 'curled') {
    return [];
  }

  const leg = breedProfile.anatomy.legs;
  const { hips, torso, hipDir, torsoDir, bodyScaleX, bodyScaleY } = spine;
  const isKitten = options.isKitten ?? spine.isKitten ?? false;
  const kMul = isKitten ? KITTEN_BODY_SCALE : 1;
  const sx = bodyScaleX * kMul;
  const sy = bodyScaleY * kMul;
  const scale = Math.min(sx, sy);
  const torsoAngle = Math.atan2(torsoDir.y, torsoDir.x);
  const hipAngle = Math.atan2(hipDir.y, hipDir.x);
  const pawR = leg.pawRadius * scale;

  if (pose === 'loaf' || pose === 'slow_blink') {
    // Only tiny cozy front mitten tips barely peeking under the chest
    const frontPeek = leg.tuckedClose ? 3.0 : 4.2;
    const sidePeek = leg.frontSideSpan * 0.48 * sy;
    const fl = pt(torso, torsoDir, frontPeek * sx, -sidePeek);
    const fr = pt(torso, torsoDir, frontPeek * sx, sidePeek);
    return [
      { x: fl.x, y: fl.y, radius: pawR * 0.72, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 0.72, angle: torsoAngle, showPads: false, isFront: true, side: 1 },
    ];
  }

  if (pose === 'roll_belly' || pose === 'belly_up_sleep') {
    const phase =
      pose === 'belly_up_sleep'
        ? Math.sin((options.time ?? spine.time ?? 0) * 1.4) * 0.12
        : (options.rollPhase ?? spine.rollPhase ?? 0);
    const wiggleA = pose === 'belly_up_sleep' ? phase * 4.0 : Math.sin(phase * Math.PI * 2) * 2.2;
    const wiggleB = pose === 'belly_up_sleep' ? -phase * 4.0 : Math.cos(phase * Math.PI * 2) * 2.2;
    const fSpan = leg.frontSideSpan * (pose === 'belly_up_sleep' ? 0.74 : 0.62) * sy;
    const bSpan = leg.backSideSpan * (pose === 'belly_up_sleep' ? 0.78 : 0.64) * sy;

    const fl = pt(torso, torsoDir, (leg.frontReach * 0.55 + wiggleA) * sx, -fSpan);
    const fr = pt(torso, torsoDir, (leg.frontReach * 0.55 - wiggleA) * sx, fSpan);
    const bl = pt(hips, hipDir, (leg.backReach * 0.4 + wiggleB) * sx, -bSpan);
    const br = pt(hips, hipDir, (leg.backReach * 0.4 - wiggleB) * sx, bSpan);

    return [
      { x: fl.x, y: fl.y, radius: pawR * 0.96, angle: torsoAngle + 0.35, showPads: true, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 0.96, angle: torsoAngle - 0.35, showPads: true, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR * 0.96, angle: hipAngle - 0.3, showPads: true, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR * 0.96, angle: hipAngle + 0.3, showPads: true, isFront: false, side: 1 },
    ];
  }

  if (pose === 'kneading') {
    // Rhythmic alternating "making biscuits" front paw press-and-flex
    const kPhase = options.kneadPhase ?? spine.kneadPhase ?? (options.time ?? spine.time ?? 0) * 4.2;
    const pressL = Math.sin(kPhase) * 3.4;
    const pressR = Math.sin(kPhase + Math.PI) * 3.4;
    const fSpan = leg.frontSideSpan * 0.68 * sy;
    const bSpan = leg.backSideSpan * 0.72 * sy;

    const fl = pt(torso, torsoDir, (leg.frontReach + 2.4 + pressL) * sx, -fSpan);
    const fr = pt(torso, torsoDir, (leg.frontReach + 2.4 + pressR) * sx, fSpan);
    const bl = pt(hips, hipDir, leg.backReach * 0.5 * sx, -bSpan);
    const br = pt(hips, hipDir, leg.backReach * 0.5 * sx, bSpan);

    return [
      { x: fl.x, y: fl.y, radius: pawR * (1.02 + Math.max(0, pressL) * 0.04), angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * (1.02 + Math.max(0, pressR) * 0.04), angle: torsoAngle, showPads: false, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR * 0.85, angle: hipAngle, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR * 0.85, angle: hipAngle, showPads: false, isFront: false, side: 1 },
    ];
  }

  if (pose === 'meerkat') {
    // Hind paws planted wide under hips; cute tiny front paws tucked dangling in front of chest!
    const fSpan = leg.frontSideSpan * 0.44 * sy;
    const bSpan = leg.backSideSpan * 0.88 * sy;
    const frontY = leg.tuckedClose ? 5.6 : 7.4;

    const fl = pt(torso, torsoDir, frontY * sx, -fSpan);
    const fr = pt(torso, torsoDir, frontY * sx, fSpan);
    const bl = pt(hips, hipDir, 1.5 * sx, -bSpan);
    const br = pt(hips, hipDir, 1.5 * sx, bSpan);

    return [
      { x: fl.x, y: fl.y, radius: pawR * 0.88, angle: torsoAngle + 0.25, showPads: true, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 0.88, angle: torsoAngle - 0.25, showPads: true, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR * 1.05, angle: hipAngle, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR * 1.05, angle: hipAngle, showPads: false, isFront: false, side: 1 },
    ];
  }

  if (pose === 'groom') {
    const gPhase = options.groomPhase ?? spine.groomPhase ?? 0;
    const lickWave = Math.sin(gPhase * Math.PI * 2);
    const headAnchor = options.headPos ?? spine.head;
    const headDir =
      options.headAngle !== undefined
        ? { x: Math.cos(options.headAngle), y: Math.sin(options.headAngle) }
        : spine.headDir;

    // Right front paw raised cyclically near right cheek/ear to groom; left front planted
    const lifted = pt(
      headAnchor,
      headDir,
      (3.5 + lickWave * 3.0) * sx,
      (6.4 - lickWave * 1.8) * sy,
    );
    const planted = pt(torso, torsoDir, leg.frontReach * 0.72 * sx, -leg.frontSideSpan * 0.78 * sy);
    const bl = pt(hips, hipDir, leg.backReach * 0.6 * sx, -leg.backSideSpan * 0.82 * sy);
    const br = pt(hips, hipDir, leg.backReach * 0.6 * sx, leg.backSideSpan * 0.82 * sy);

    return [
      { x: planted.x, y: planted.y, radius: pawR, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: lifted.x, y: lifted.y, radius: pawR * 0.95, angle: torsoAngle - 0.6, showPads: true, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR * 0.92, angle: hipAngle, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR * 0.92, angle: hipAngle, showPads: false, isFront: false, side: 1 },
    ];
  }

  if (pose === 'stretch' || pose === 'stretch_yawn') {
    const sf = clamp(options.stretchFactor ?? spine.stretchFactor ?? 1, 0, 1);
    const frontReach = leg.frontReach + (leg.tuckedClose ? 6.5 : 10.5) * sf;
    const backReach = leg.backReach - (leg.tuckedClose ? 2.5 : 4.5) * sf;
    const frontSpan = leg.frontSideSpan * 0.72 * sy;
    const backSpan = leg.backSideSpan * 0.92 * sy;

    const fl = pt(torso, torsoDir, frontReach * sx, -frontSpan);
    const fr = pt(torso, torsoDir, frontReach * sx, frontSpan);
    const bl = pt(hips, hipDir, backReach * sx, -backSpan);
    const br = pt(hips, hipDir, backReach * sx, backSpan);

    return [
      { x: fl.x, y: fl.y, radius: pawR * 1.04, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 1.04, angle: torsoAngle, showPads: false, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR, angle: hipAngle, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR, angle: hipAngle, showPads: false, isFront: false, side: 1 },
    ];
  }

  if (pose === 'sunbathe') {
    const fl = pt(torso, torsoDir, (leg.frontReach + 3.2) * sx, -leg.frontSideSpan * 0.92 * sy);
    const fr = pt(torso, torsoDir, (leg.frontReach + 2.4) * sx, leg.frontSideSpan * 1.02 * sy);
    const bl = pt(hips, hipDir, (leg.backReach - 3.0) * sx, -leg.backSideSpan * 1.02 * sy);
    const br = pt(hips, hipDir, (leg.backReach - 2.2) * sx, leg.backSideSpan * 0.94 * sy);
    return [
      { x: fl.x, y: fl.y, radius: pawR, angle: torsoAngle - 0.25, showPads: false, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR, angle: torsoAngle + 0.35, showPads: false, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR, angle: hipAngle + 0.2, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR, angle: hipAngle - 0.25, showPads: false, isFront: false, side: 1 },
    ];
  }

  const isPounce = options.isPounce || pose === 'pounce';
  const isScratch = options.isScratch || pose === 'scratch';
  const isZoomies = pose === 'zoomies';
  const isButtWiggle = pose === 'butt_wiggle';

  let frontLeftReach = isPounce ? leg.frontReach + 5.0 : isButtWiggle ? leg.frontReach * 0.82 : leg.frontReach;
  let frontRightReach = frontLeftReach;
  let backLeftReach = isPounce ? leg.backReach - 4.8 : isButtWiggle ? leg.backReach - 2.2 : leg.backReach;
  let backRightReach = backLeftReach;
  let frontSideSpan = leg.frontSideSpan * sy;
  const backSideSpan = leg.backSideSpan * (isButtWiggle ? 1.12 : 1) * sy;

  if (isScratch) {
    const scratchWave = Math.sin((options.scratchPhase ?? 0) * 9 * Math.PI * 2);
    const reachBase = leg.tuckedClose ? 8.5 : 13.0;
    const reachAmp = leg.tuckedClose ? 4.8 : 7.0;
    frontLeftReach = reachBase + scratchWave * reachAmp;
    frontRightReach = reachBase - scratchWave * reachAmp;
    backLeftReach = leg.backReach - 1.0;
    backRightReach = leg.backReach - 1.0;
    frontSideSpan = leg.frontSideSpan * 0.8 * sy;
  } else if (!isButtWiggle) {
    const speedNorm = clamp((options.speed ?? 0) / 90, 0, isZoomies ? 1.45 : 1.0);
    const amp = leg.stepAmplitude * speedNorm;
    const phase = options.walkPhase ?? 0;
    const s1 = Math.sin(phase) * amp;
    const s2 = Math.sin(phase + Math.PI) * amp;
    frontLeftReach += s1;
    frontRightReach += s2;
    backLeftReach += s2;
    backRightReach += s1;
  }

  const fl = pt(torso, torsoDir, frontLeftReach * sx, -frontSideSpan);
  const fr = pt(torso, torsoDir, frontRightReach * sx, frontSideSpan);
  const bl = pt(hips, hipDir, backLeftReach * sx, -backSideSpan);
  const br = pt(hips, hipDir, backRightReach * sx, backSideSpan);

  return [
    { x: fl.x, y: fl.y, radius: pawR, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
    { x: fr.x, y: fr.y, radius: pawR, angle: torsoAngle, showPads: false, isFront: true, side: 1 },
    { x: bl.x, y: bl.y, radius: pawR, angle: hipAngle, showPads: false, isFront: false, side: -1 },
    { x: br.x, y: br.y, radius: pawR, angle: hipAngle, showPads: false, isFront: false, side: 1 },
  ];
}

/**
 * Draws breed-authentic paws (including fluffy Persian mittens, tiny stubby Munchkin paws,
 * slender dark Siamese paws, long-toed Sphynx paws, and adorable belly-roll toe-beans).
 */
export function drawBreedPaws(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  spine: SpineRenderPoints,
  options: PawRenderOptions = {},
): void {
  const paws = computeBreedPawLayout(breedProfile, spine, options);
  if (paws.length === 0) {
    return;
  }

  const leg = breedProfile.anatomy.legs;
  const pose = options.poseMode ?? spine.poseMode ?? 'normal';

  for (const paw of paws) {
    const rx = paw.radius * leg.pawAspectX;
    const ry = paw.radius;

    // Fluffy Persian paw feathering
    if (leg.fluffyPaws && !paw.showPads) {
      drawRotatedEllipse(gfx, paw.x, paw.y, rx * 1.18, ry * 1.14, paw.angle)
        .fill({ color: coat.highlightColor, alpha: 0.45 });
    }

    drawRotatedEllipse(gfx, paw.x, paw.y, rx, ry, paw.angle)
      .fill({ color: coat.pawColor, alpha: 1 })
      .stroke({ width: 0.9, color: coat.eyeRimColor, alpha: 0.32 });

    // Subtle delicate toe crease lines for Sphynx or stretching front paws
    if (!paw.showPads && (leg.visibleToes || ((pose === 'stretch' || pose === 'stretch_yawn') && paw.isFront))) {
      const cos = Math.cos(paw.angle);
      const sin = Math.sin(paw.angle);
      for (const offset of [-0.34, 0.34]) {
        const bx = paw.x + cos * (rx * 0.25) - sin * (ry * offset);
        const by = paw.y + sin * (rx * 0.25) + cos * (ry * offset);
        const ex = paw.x + cos * (rx * 0.85) - sin * (ry * offset * 1.1);
        const ey = paw.y + sin * (rx * 0.85) + cos * (ry * offset * 1.1);
        gfx
          .moveTo(bx, by)
          .lineTo(ex, ey)
          .stroke({ width: 0.7, color: coat.wrinkleColor, alpha: 0.45, cap: 'round' });
      }
    }

    // Adorable pink/mauve toe-beans when paws are turned up (ROLL_BELLY, MEERKAT_PEEK, GROOMING)
    if (paw.showPads) {
      const cos = Math.cos(paw.angle);
      const sin = Math.sin(paw.angle);
      const padX = paw.x - cos * (rx * 0.12);
      const padY = paw.y - sin * (rx * 0.12);
      gfx
        .circle(padX, padY, Math.max(1.1, paw.radius * 0.34))
        .fill({ color: coat.pawPadColor, alpha: 0.92 });

      for (const toeOff of [-0.46, 0, 0.46]) {
        const tx = paw.x + cos * (rx * 0.38) - sin * (ry * toeOff);
        const ty = paw.y + sin * (rx * 0.38) + cos * (ry * toeOff);
        gfx
          .circle(tx, ty, Math.max(0.75, paw.radius * 0.19))
          .fill({ color: coat.pawPadColor, alpha: 0.92 });
      }
    }
  }
}

/**
 * Draws the breed-authentic organic body silhouette along the 3-node spine:
 * - Persian: wide round body + layered feathered fur scallops + prominent fluffy chest mane
 * - Siamese: slender elongated tubular silhouette
 * - British Shorthair: cobby broad-shouldered velvety teddy torso
 * - Munchkin: cute elongated low-slung sausage silhouette
 * - Sphynx: sleek hairless suede contour with zero fluff and subtle pear-belly curve
 * - Domestic Shorthair: balanced athletic feline silhouette
 */
export function drawBreedBody(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  spine: SpineRenderPoints,
): void {
  const bodySpec = breedProfile.anatomy.body;
  const { hips, torso, head, hipDir, torsoDir, bodyScaleX, bodyScaleY, isLoaf } = spine;
  const pose = spine.poseMode ?? (isLoaf ? 'loaf' : 'normal');
  const kMul = spine.isKitten ? KITTEN_BODY_SCALE : 1;
  const scale = Math.min(bodyScaleX, bodyScaleY) * kMul;
  const warmRim = resolveWarmRimStrength(spine.rimLightIntensity, spine.sunbeamWarmth);

  const isCompact = isLoaf || pose === 'loaf' || pose === 'curled' || pose === 'slow_blink';
  let rHip = (isCompact ? bodySpec.loafHipRadius : bodySpec.hipRadius) * scale;
  let rTorso = (isCompact ? bodySpec.loafTorsoRadius : bodySpec.torsoRadius) * scale;
  let rNeck = (isCompact ? bodySpec.loafNeckRadius : bodySpec.neckRadius) * scale;

  if (pose === 'stretch' || pose === 'stretch_yawn') {
    const sf = clamp(spine.stretchFactor ?? 1, 0, 1);
    rHip *= 1 + 0.06 * sf;
    rTorso *= 1 - 0.14 * sf;
    rNeck *= 1 - 0.08 * sf;
  } else if (pose === 'sunbathe') {
    rHip *= 1.07;
    rTorso *= 1.08;
  } else if (pose === 'meerkat') {
    rHip *= 1.12;
    rTorso *= 0.94;
    rNeck *= 0.9;
  } else if (pose === 'butt_wiggle') {
    rHip *= 1.08;
    rTorso *= 0.96;
  }

  const hPerp = perp(hipDir);
  const tPerp = perp(torsoDir);
  const torsoAngle = Math.atan2(torsoDir.y, torsoDir.x);
  const hipAngle = Math.atan2(hipDir.y, hipDir.x);

  // Subtle warm golden fur rim halo when basking in a sunbeam or near a warm lamp/fireplace
  if (warmRim > 0.02) {
    gfx
      .circle(hips.x, hips.y, rHip + 2.4)
      .fill({ color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.34 })
      .circle(torso.x, torso.y, rTorso + 2.4)
      .fill({ color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.34 });
  }

  // Fluffy downy kitten fur halo
  if (spine.isKitten) {
    const downyCount = 10;
    for (let i = 0; i < downyCount; i++) {
      const a = (i / downyCount) * Math.PI * 2;
      const anchor = Math.cos(a - torsoAngle) >= 0 ? torso : hips;
      const baseR = anchor === torso ? rTorso : rHip;
      const fx = anchor.x + Math.cos(a) * (baseR - 0.4);
      const fy = anchor.y + Math.sin(a) * (baseR - 0.4);
      gfx
        .circle(fx, fy, 2.3)
        .fill({ color: coat.highlightColor, alpha: 0.42 });
    }
  }

  // Layered feathered fur scallops around outer silhouette (Persian, Maine Coon, Ragdoll, American Curl)
  if (bodySpec.furScallopCount > 0 && bodySpec.furScallopDepth > 0) {
    const depth = bodySpec.furScallopDepth * scale;
    const scallopCount = bodySpec.furScallopCount;

    // Outer rim halo for feathered contour readability
    for (let i = 0; i < scallopCount; i++) {
      const a = (i / scallopCount) * Math.PI * 2;
      const anchor = Math.cos(a - torsoAngle) >= 0 ? torso : hips;
      const baseR = anchor === torso ? rTorso : rHip;
      const fx = anchor.x + Math.cos(a) * (baseR - depth * 0.18);
      const fy = anchor.y + Math.sin(a) * (baseR - depth * 0.18);
      gfx
        .circle(fx, fy, depth * 1.28 + 1.0)
        .fill({ color: coat.eyeRimColor, alpha: 0.18 });
    }

    // Plush longhair fur scallops
    for (let i = 0; i < scallopCount; i++) {
      const a = (i / scallopCount) * Math.PI * 2;
      const anchor = Math.cos(a - torsoAngle) >= 0 ? torso : hips;
      const baseR = anchor === torso ? rTorso : rHip;
      const fx = anchor.x + Math.cos(a) * (baseR - depth * 0.18);
      const fy = anchor.y + Math.sin(a) * (baseR - depth * 0.18);
      gfx
        .circle(fx, fy, depth * 1.24)
        .fill({ color: coat.baseColor, alpha: 0.98 });
    }
  }

  const hlx = hips.x - hPerp.x * rHip;
  const hly = hips.y - hPerp.y * rHip;
  const hrx = hips.x + hPerp.x * rHip;
  const hry = hips.y + hPerp.y * rHip;

  const tlx = torso.x - tPerp.x * rTorso;
  const tly = torso.y - tPerp.y * rTorso;
  const trx = torso.x + tPerp.x * rTorso;
  const try_ = torso.y + tPerp.y * rTorso;

  const nlx = head.x - tPerp.x * rNeck * 0.72;
  const nly = head.y - tPerp.y * rNeck * 0.72;
  const nrx = head.x + tPerp.x * rNeck * 0.72;
  const nry = head.y + tPerp.y * rNeck * 0.72;

  const rimAlpha = bodySpec.coatType === 'hairless' ? 0.28 : 0.24;

  // Soft outer edge outline for crisp readability on light rugs & dark floors
  gfx
    .circle(hips.x, hips.y, rHip + 1.1)
    .fill({ color: coat.eyeRimColor, alpha: rimAlpha })
    .circle(torso.x, torso.y, rTorso + 1.1)
    .fill({ color: coat.eyeRimColor, alpha: rimAlpha })
    .poly([hlx, hly, tlx, tly, nlx, nly, nrx, nry, trx, try_, hrx, hry], true)
    .stroke({ width: 2.2, color: coat.eyeRimColor, alpha: rimAlpha, join: 'round' });

  // Main organic capsule body fill joining hips -> torso -> neck
  gfx
    .circle(hips.x, hips.y, rHip)
    .fill({ color: coat.baseColor, alpha: 1 })
    .circle(torso.x, torso.y, rTorso)
    .fill({ color: coat.baseColor, alpha: 1 })
    .poly([hlx, hly, tlx, tly, nlx, nly, nrx, nry, trx, try_, hrx, hry], true)
    .fill({ color: coat.baseColor, alpha: 1 });

  // Prominent fluffy chest mane / lion ruff collar peeking beneath chin & shoulders (Persian, Maine Coon, Ragdoll)
  if (bodySpec.hasChestMane && bodySpec.maneScale > 0) {
    const maneR = rNeck * 0.76 * bodySpec.maneScale;
    const maneCenter = pt(torso, torsoDir, rTorso * 0.44, 0);
    const maneColor =
      coat.pattern === 'calico' || coat.pattern === 'mitted_colorpoint'
        ? coat.bellyColor
        : coat.highlightColor;
    for (const sideAngle of [-0.62, -0.22, 0.22, 0.62]) {
      const ang = torsoAngle + sideAngle;
      const mx = maneCenter.x + Math.cos(ang) * (maneR * 0.42);
      const my = maneCenter.y + Math.sin(ang) * (maneR * 0.42);
      drawRotatedEllipse(gfx, mx, my, maneR * 0.56, maneR * 0.42, ang)
        .fill({ color: maneColor, alpha: 0.84 });
    }
  }

  // Exposed soft belly when cat flops over in ROLL_BELLY or BELLY_UP_SLEEP pose
  if (pose === 'roll_belly' || pose === 'belly_up_sleep') {
    const midX = (hips.x + torso.x) * 0.5;
    const midY = (hips.y + torso.y) * 0.5;
    const midAngle = Math.atan2(torso.y - hips.y, torso.x - hips.x);
    const spanLen = Math.hypot(torso.x - hips.x, torso.y - hips.y) * 0.58 + rTorso * 0.52;
    const bellyW = Math.min(rHip, rTorso) * 0.78;
    drawRotatedEllipse(gfx, midX, midY, spanLen, bellyW, midAngle)
      .fill({ color: coat.bellyColor, alpha: 0.96 });
    drawRotatedEllipse(gfx, midX, midY, spanLen * 0.76, bellyW * 0.56, midAngle)
      .fill({ color: coat.highlightColor, alpha: 0.34 });
    return;
  }

  // Subtle shaded lower flank curvature for volume
  drawRotatedEllipse(
    gfx,
    hips.x + hPerp.x * (rHip * 0.18),
    hips.y + hPerp.y * (rHip * 0.18),
    rHip * 0.74,
    rHip * 0.56,
    hipAngle,
  ).fill({ color: coat.shadowColor, alpha: bodySpec.coatType === 'hairless' ? 0.28 : 0.2 });

  // Silvery-blue double-coat shimmer (Russian Blue) or golden glitter pelt sheen (Bengal)
  if (bodySpec.coatSheen && bodySpec.coatSheen > 0) {
    const midX = (hips.x + torso.x) * 0.5;
    const midY = (hips.y + torso.y) * 0.5;
    drawRotatedEllipse(gfx, midX, midY, rTorso * 0.96, rTorso * 0.54, torsoAngle)
      .fill({ color: coat.highlightColor, alpha: bodySpec.coatSheen * 0.52 });
  }

  // Soft warm suede highlight along Sphynx spine/hips so hairless contour looks tactile
  if (bodySpec.coatType === 'hairless') {
    const midX = (hips.x + torso.x) * 0.5;
    const midY = (hips.y + torso.y) * 0.5;
    drawRotatedEllipse(gfx, midX, midY, rTorso * 0.86, rTorso * 0.42, torsoAngle)
      .fill({ color: coat.highlightColor, alpha: 0.32 });
  }
}

/**
 * Draws breed-specific dorsal torso/hip markings, colorpoint shading, tabby patterns,
 * Persian feathered tipping, or Sphynx anatomical skin-fold wrinkle lines along the spine.
 */
export function drawCatCollar(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  spine: SpineRenderPoints,
  collarColor: string | number | null | undefined,
  hasBell = true,
): void {
  const resolvedColor = parseCollarColor(collarColor);
  if (resolvedColor === null) {
    return;
  }

  const bodySpec = breedProfile.anatomy.body;
  const { torso, head, torsoDir, bodyScaleX, bodyScaleY } = spine;
  const kMul = spine.isKitten ? KITTEN_BODY_SCALE : 1;
  const sx = bodyScaleX * kMul;
  const sy = bodyScaleY * kMul;
  const n = perp(torsoDir);

  // Position collar cleanly along the neck/shoulder line just behind the head
  const neckAnchor: Vec2 = {
    x: torso.x * 0.42 + head.x * 0.58,
    y: torso.y * 0.42 + head.y * 0.58,
  };
  const halfSpan = bodySpec.neckRadius * 0.94 * sy;
  const curveFwd = 2.6 * sx;
  const strapW = Math.max(2.1, 2.8 * Math.min(sx, sy));

  const lx = neckAnchor.x - n.x * halfSpan - torsoDir.x * 1.4 * sx;
  const ly = neckAnchor.y - n.y * halfSpan - torsoDir.y * 1.4 * sx;
  const rx = neckAnchor.x + n.x * halfSpan - torsoDir.x * 1.4 * sx;
  const ry = neckAnchor.y + n.y * halfSpan - torsoDir.y * 1.4 * sx;
  const cx = neckAnchor.x + torsoDir.x * curveFwd;
  const cy = neckAnchor.y + torsoDir.y * curveFwd;

  // Collar shadow/rim + rich colored band + subtle top highlight
  gfx
    .moveTo(lx, ly)
    .quadraticCurveTo(cx, cy, rx, ry)
    .stroke({ width: strapW + 1.2, color: 0x1a1210, alpha: 0.34, cap: 'round' })
    .moveTo(lx, ly)
    .quadraticCurveTo(cx, cy, rx, ry)
    .stroke({ width: strapW, color: resolvedColor, alpha: 0.98, cap: 'round' })
    .moveTo(lx, ly)
    .quadraticCurveTo(cx, cy, rx, ry)
    .stroke({ width: strapW * 0.35, color: mixColor(resolvedColor, 0xffffff, 0.45), alpha: 0.48, cap: 'round' });

  // Gleaming tiny gold/silver jingle bell right under the chin/neck!
  if (hasBell) {
    const bellCenter = pt(neckAnchor, torsoDir, curveFwd * 0.95 + 1.4 * sx, 0);
    const bellR = Math.max(2.1, 2.65 * Math.min(sx, sy));
    const isWarmGold = ((resolvedColor >> 16) & 0xff) < 200 || ((resolvedColor >> 8) & 0xff) < 160;
    const bellBase = isWarmGold ? 0xf2c64b : 0xdce4ee;
    const bellRim = isWarmGold ? 0x8f6714 : 0x626e7d;
    const bellGlint = 0xfffdf2;

    gfx
      .circle(bellCenter.x + 0.5, bellCenter.y + 0.7, bellR + 0.6)
      .fill({ color: 0x1a120c, alpha: 0.28 })
      .circle(bellCenter.x, bellCenter.y, bellR)
      .fill({ color: bellBase, alpha: 1 })
      .stroke({ width: 0.8, color: bellRim, alpha: 0.9 })
      // Little jingle slit across the bell
      .moveTo(bellCenter.x - n.x * (bellR * 0.55), bellCenter.y - n.y * (bellR * 0.55))
      .lineTo(bellCenter.x + n.x * (bellR * 0.55), bellCenter.y + n.y * (bellR * 0.55))
      .stroke({ width: 0.85, color: bellRim, alpha: 0.9, cap: 'round' })
      // Tiny metallic specular glint
      .circle(bellCenter.x - bellR * 0.28, bellCenter.y - bellR * 0.28, bellR * 0.32)
      .fill({ color: bellGlint, alpha: 0.94 });
  }
}

/**
 * Draws breed-specific dorsal torso/hip markings, colorpoint shading, tabby patterns,
 * Bengal rosettes, Abyssinian ticked agouti, Japanese Mi-Ke calico, Ragdoll bib,
 * Persian/Maine Coon feathered wisps, or Sphynx anatomical skin-fold wrinkle lines.
 */
export function drawBodyMarkings(
  gfx: Graphics,
  profile: CatCoatProfile,
  spine: SpineRenderPoints,
  breedProfileOverride?: CatBreedProfile,
): void {
  const breedProfile = breedProfileOverride ?? getBreedProfile(profile.breed);
  const bodySpec = breedProfile.anatomy.body;
  const { hips, torso, hipDir, torsoDir, bodyScaleX, bodyScaleY, isLoaf } = spine;
  const pose = spine.poseMode ?? (isLoaf ? 'loaf' : 'normal');
  const kMul = spine.isKitten ? KITTEN_BODY_SCALE : 1;
  const sx = bodyScaleX * kMul;
  const sy = bodyScaleY * kMul;
  const midX = (hips.x + torso.x) * 0.5;
  const midY = (hips.y + torso.y) * 0.5;
  const rawMidX = (hipDir.x + torsoDir.x) * 0.5 || torsoDir.x;
  const rawMidY = (hipDir.y + torsoDir.y) * 0.5 || torsoDir.y;
  const midLen = Math.hypot(rawMidX, rawMidY) || 1;
  const midDir: Vec2 = { x: rawMidX / midLen, y: rawMidY / midLen };
  const midAngle = Math.atan2(midDir.y, midDir.x);
  const torsoAngle = Math.atan2(torsoDir.y, torsoDir.x);
  const hipAngle = Math.atan2(hipDir.y, hipDir.x);
  const midOrigin: Vec2 = { x: midX, y: midY };

  // When rolled on back exposing belly, draw gentle belly details instead of dorsal saddle markings
  if (pose === 'roll_belly' || pose === 'belly_up_sleep') {
    if (bodySpec.hasWrinkles) {
      // Soft tummy skin folds on Sphynx
      for (const s of [-0.4, 0, 0.4]) {
        const c = pt(midOrigin, midDir, s * 10 * sx, 0);
        const n = perp(midDir);
        const span = 5.4 * sy;
        gfx
          .moveTo(c.x - n.x * span, c.y - n.y * span)
          .quadraticCurveTo(
            c.x + midDir.x * 1.4 * sx,
            c.y + midDir.y * 1.4 * sx,
            c.x + n.x * span,
            c.y + n.y * span,
          )
          .stroke({ width: 1.0, color: profile.wrinkleColor, alpha: 0.36, cap: 'round' });
      }
    } else if (bodySpec.coatType === 'longhair' || bodySpec.coatType === 'shaggy_longhair' || bodySpec.coatType === 'silky_semilong') {
      // Fluffy longhair belly fur whorls
      for (const s of [-0.35, 0.25]) {
        const c = pt(midOrigin, midDir, s * 9 * sx, 0);
        drawRotatedEllipse(gfx, c.x, c.y, 5.2 * sx, 6.2 * sy, midAngle)
          .fill({ color: profile.highlightColor, alpha: 0.42 });
      }
    }
    if (spine.collarColor) {
      drawCatCollar(gfx, breedProfile, spine, spine.collarColor, spine.hasBell ?? true);
    }
    return;
  }

  // Pattern rendering across all 14 breeds and coat variants
  switch (profile.pattern) {
    case 'hairless_bicolor': {
      // Soft dusky seal-taupe dorsal saddle + hip cloud on suede peach skin
      const saddle = pt(torso, torsoDir, -2.5 * sx, -2.6 * sy);
      drawRotatedEllipse(gfx, saddle.x, saddle.y, 7.6 * sx, 5.4 * sy, torsoAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.84 });
      const hipPatch = pt(hips, hipDir, -1.5 * sx, 2.2 * sy);
      drawRotatedEllipse(gfx, hipPatch.x, hipPatch.y, 6.8 * sx, 4.8 * sy, hipAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.8 });
      break;
    }

    case 'hairless_solid': {
      // Soft velvety warm skin depth along shoulders
      const shoulderGlow = pt(torso, torsoDir, 1.5 * sx, 0);
      drawRotatedEllipse(gfx, shoulderGlow.x, shoulderGlow.y, 6.8 * sx, 5.2 * sy, torsoAngle)
        .fill({ color: profile.highlightColor, alpha: 0.24 });
      break;
    }

    case 'colorpoint': {
      // Iconic Siamese temperature-sensitive toasted dorsal shading transitioning toward dark points
      const outerToast = pt(midOrigin, midDir, -1 * sx, 0);
      drawRotatedEllipse(gfx, outerToast.x, outerToast.y, 11.4 * sx, 6.0 * sy, midAngle)
        .fill({ color: profile.stripeColor, alpha: 0.16 });
      const innerSpineToast = pt(midOrigin, midDir, -1.6 * sx, 0);
      drawRotatedEllipse(gfx, innerSpineToast.x, innerSpineToast.y, 8.2 * sx, 3.4 * sy, midAngle)
        .fill({ color: profile.pointColor, alpha: 0.14 });
      // Slightly deeper toast near tail root and shoulder tips
      const tailRootShade = pt(hips, hipDir, -4.8 * sx, 0);
      drawRotatedEllipse(gfx, tailRootShade.x, tailRootShade.y, 4.4 * sx, 4.2 * sy, hipAngle)
        .fill({ color: profile.pointColor, alpha: 0.28 });
      break;
    }

    case 'mitted_colorpoint': {
      // Ragdoll silky colorpoint mantle + snowy white chest bib peeking at front!
      const outerToast = pt(midOrigin, midDir, -1.2 * sx, 0);
      drawRotatedEllipse(gfx, outerToast.x, outerToast.y, 12.0 * sx, 7.2 * sy, midAngle)
        .fill({ color: profile.stripeColor, alpha: 0.18 });
      const tailRootShade = pt(hips, hipDir, -5.0 * sx, 0);
      drawRotatedEllipse(gfx, tailRootShade.x, tailRootShade.y, 4.8 * sx, 4.4 * sy, hipAngle)
        .fill({ color: profile.pointColor, alpha: 0.26 });
      // Snowy white Ragdoll chest bib
      const bib = pt(torso, torsoDir, 6.8 * sx, 0);
      drawRotatedEllipse(gfx, bib.x, bib.y, 5.4 * sx, 6.8 * sy, torsoAngle)
        .fill({ color: profile.bellyColor, alpha: 0.96 });
      break;
    }

    case 'shaded': {
      // Persian Chinchilla Silver / Shaded Golden / Russian Blue Frosted luminous tipped mantle
      const mantle = pt(midOrigin, midDir, -0.5 * sx, 0);
      drawRotatedEllipse(gfx, mantle.x, mantle.y, 12.2 * sx, 8.6 * sy, midAngle)
        .fill({ color: profile.stripeColor, alpha: 0.26 });
      const dorsalTip = pt(midOrigin, midDir, -1 * sx, 0);
      drawRotatedEllipse(gfx, dorsalTip.x, dorsalTip.y, 9.5 * sx, 4.8 * sy, midAngle)
        .fill({ color: profile.stripeColor, alpha: 0.22 });
      break;
    }

    case 'rosette_spotted': {
      // Bengal authentic two-tone dark-outlined wild leopard rosettes + dorsal spine spots!
      const spineSpots = [-0.58, -0.18, 0.22, 0.58];
      for (const s of spineSpots) {
        const sp = pt(midOrigin, midDir, s * 14 * sx, 0);
        drawRotatedEllipse(gfx, sp.x, sp.y, 2.2 * sx, 1.35 * sy, midAngle)
          .fill({ color: profile.stripeColor, alpha: 0.86 });
      }

      // Two-tone rosettes: darker outer ring wrapping warm rich inner amber/sepia center
      const rosetteOffsets: readonly [number, number, number][] = [
        [-4.2, -5.8, 3.0],
        [-3.8, 5.9, 2.9],
        [1.8, -6.2, 3.2],
        [2.2, 6.1, 3.1],
        [7.4, -4.8, 2.6],
        [7.0, 4.9, 2.7],
        [-9.2, -4.2, 2.5],
        [-8.8, 4.4, 2.5],
      ];
      for (const [fwd, sideOff, r] of rosetteOffsets) {
        const c = pt(midOrigin, midDir, fwd * sx, sideOff * sy);
        const rr = r * Math.min(sx, sy);
        drawRotatedEllipse(gfx, c.x, c.y, rr * 1.16, rr * 0.92, midAngle + sideOff * 0.04)
          .fill({ color: profile.secondaryPatchColor, alpha: 0.9 })
          .stroke({ width: 1.55 * Math.min(sx, sy), color: profile.stripeColor, alpha: 0.88 });
      }
      break;
    }

    case 'rosette_marbled': {
      // Bengal marbled swirling horizontal leopard ribbons
      for (const side of [-1, 1] as const) {
        const swirl = pt(midOrigin, midDir, 0, side * 5.4 * sy);
        drawRotatedEllipse(gfx, swirl.x, swirl.y, 9.2 * sx, 3.6 * sy, midAngle + side * 0.14)
          .fill({ color: profile.secondaryPatchColor, alpha: 0.84 })
          .stroke({ width: 1.7 * Math.min(sx, sy), color: profile.stripeColor, alpha: 0.86 });
        const inner = pt(midOrigin, midDir, side * 1.5 * sx, side * 5.2 * sy);
        drawRotatedEllipse(gfx, inner.x, inner.y, 4.4 * sx, 1.7 * sy, midAngle)
          .fill({ color: profile.highlightColor, alpha: 0.42 });
      }
      break;
    }

    case 'ticked_agouti': {
      // Abyssinian warm ticked-agouti dorsal spine band + fine shimmering agouti ticking flecks
      const tailBase = pt(hips, hipDir, -6.2 * sx, 0);
      const neckBase = pt(torso, torsoDir, 6.2 * sx, 0);
      gfx
        .moveTo(tailBase.x, tailBase.y)
        .quadraticCurveTo(midX, midY, neckBase.x, neckBase.y)
        .stroke({ width: 3.4 * sy, color: profile.stripeColor, alpha: 0.56, cap: 'round' });

      drawRotatedEllipse(gfx, midX, midY, 10.6 * sx, 5.2 * sy, midAngle)
        .fill({ color: profile.shadowColor, alpha: 0.24 });

      // Subtle multi-band agouti ticking flecks across flanks
      for (const [fwd, sideOff] of [
        [-6, -4.5],
        [-3, 4.2],
        [0.5, -5.2],
        [3.5, 4.8],
        [6.2, -3.6],
      ] as const) {
        const dot = pt(midOrigin, midDir, fwd * sx, sideOff * sy);
        gfx.circle(dot.x, dot.y, 1.15 * Math.min(sx, sy)).fill({ color: profile.stripeColor, alpha: 0.42 });
        gfx.circle(dot.x + midDir.x * 1.6 * sx, dot.y + midDir.y * 1.6 * sx, 0.9 * Math.min(sx, sy))
          .fill({ color: profile.highlightColor, alpha: 0.48 });
      }
      break;
    }

    case 'tortoiseshell': {
      // Maine Coon / Tortie dappled dark espresso + warm amber/cinnamon mottled patches
      const scaleW = bodySpec.torsoRadius / 12.2;
      const patches: readonly [number, number, number, number, number][] = [
        [-4.5, -4.6, 5.8, 4.0, profile.secondaryPatchColor],
        [3.2, 4.4, 6.2, 4.2, profile.secondaryPatchColor],
        [-1.0, 2.2, 4.4, 3.2, profile.highlightColor],
        [5.5, -3.5, 4.8, 3.4, profile.highlightColor],
        [-7.0, 3.2, 4.0, 2.8, profile.secondaryPatchColor],
      ];
      for (const [fwd, sideOff, rx, ry, col] of patches) {
        const p = pt(midOrigin, midDir, fwd * sx, sideOff * sy * scaleW);
        drawRotatedEllipse(gfx, p.x, p.y, rx * sx * scaleW, ry * sy * scaleW, midAngle + sideOff * 0.05)
          .fill({ color: col, alpha: 0.78 });
      }
      break;
    }

    case 'calico':
    case 'mike_calico': {
      // Warm apricot/vermilion shoulder saddle, espresso/ink opposite-flank hip patch, tail-base spot
      const scaleW = bodySpec.torsoRadius / 12.2;
      const isMiKe = profile.pattern === 'mike_calico';
      const p1 = pt(torso, torsoDir, -2 * sx, -5.2 * sy * scaleW);
      drawRotatedEllipse(gfx, p1.x, p1.y, 8.2 * sx * scaleW, 5.6 * sy * scaleW, torsoAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: isMiKe ? 0.97 : 0.94 });

      const p2 = pt(hips, hipDir, 2 * sx, 4.6 * sy * scaleW);
      drawRotatedEllipse(gfx, p2.x, p2.y, 7.6 * sx * scaleW, 5.2 * sy * scaleW, hipAngle)
        .fill({ color: profile.stripeColor, alpha: isMiKe ? 0.96 : 0.92 });

      const p3 = pt(hips, hipDir, -5 * sx, -2.0 * sy * scaleW);
      gfx
        .circle(p3.x, p3.y, 4.0 * Math.min(sx, sy) * scaleW)
        .fill({ color: isMiKe ? profile.stripeColor : profile.secondaryPatchColor, alpha: 0.92 });
      break;
    }

    case 'tuxedo': {
      // Crisp white chest bib peeking ahead of shoulders + glossy charcoal back sheen
      const bib = pt(torso, torsoDir, 6.2 * sx, 0);
      drawRotatedEllipse(gfx, bib.x, bib.y, 5.0 * sx, 6.4 * sy, torsoAngle)
        .fill({ color: profile.bellyColor, alpha: 0.98 });

      drawRotatedEllipse(gfx, midX, midY, 9.2 * sx, 4.4 * sy, midAngle)
        .fill({ color: profile.highlightColor, alpha: 0.3 });
      break;
    }

    case 'bicolor': {
      // Crisp white chest bib & lower flank wrap contrasting cleanly with rich coat saddle
      const bib = pt(torso, torsoDir, 6.4 * sx, 0);
      drawRotatedEllipse(gfx, bib.x, bib.y, 5.4 * sx, 6.6 * sy, torsoAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.96 });

      const leftWhite = pt(midOrigin, midDir, 0.5 * sx, -7.2 * sy);
      drawRotatedEllipse(gfx, leftWhite.x, leftWhite.y, 7.4 * sx, 3.6 * sy, midAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.92 });

      const rightWhite = pt(midOrigin, midDir, 1.0 * sx, 7.2 * sy);
      drawRotatedEllipse(gfx, rightWhite.x, rightWhite.y, 7.0 * sx, 3.4 * sy, midAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.92 });
      break;
    }

    case 'tabby_mackerel': {
      // Crisp dorsal spine stripe + swept-back curved mackerel rib stripes
      const tailBase = pt(hips, hipDir, -6 * sx, 0);
      const neckBase = pt(torso, torsoDir, 6 * sx, 0);
      gfx
        .moveTo(tailBase.x, tailBase.y)
        .quadraticCurveTo(midX, midY, neckBase.x, neckBase.y)
        .stroke({ width: 2.5 * sy, color: profile.stripeColor, alpha: 0.8, cap: 'round' });

      const stripeStations = isLoaf
        ? [-0.35, 0.1, 0.55]
        : breedProfile.breed === 'munchkin' || breedProfile.breed === 'maine_coon'
          ? [-0.62, -0.25, 0.12, 0.48, 0.78]
          : [-0.55, -0.15, 0.25, 0.65];

      const maxHalfSpan = bodySpec.torsoRadius * 0.78;
      for (const s of stripeStations) {
        const cx = midX + midDir.x * s * 15 * sx;
        const cy = midY + midDir.y * s * 15 * sx;
        const n = perp(midDir);
        const span = (maxHalfSpan - Math.abs(s) * 2.0) * sy;
        const sweepX = -midDir.x * 2.8 * sx;
        const sweepY = -midDir.y * 2.8 * sx;
        gfx
          .moveTo(cx - n.x * span + sweepX, cy - n.y * span + sweepY)
          .quadraticCurveTo(cx, cy, cx + n.x * span + sweepX, cy + n.y * span + sweepY)
          .stroke({ width: 2.0 * sy, color: profile.stripeColor, alpha: 0.7, cap: 'round' });
      }
      break;
    }

    case 'tabby_classic': {
      // Authentic classic tabby: wide dorsal band + shoulder butterfly + concentric bullseye flank whorls!
      const tailBase = pt(hips, hipDir, -6.5 * sx, 0);
      const neckBase = pt(torso, torsoDir, 6.5 * sx, 0);
      gfx
        .moveTo(tailBase.x, tailBase.y)
        .quadraticCurveTo(midX, midY, neckBase.x, neckBase.y)
        .stroke({ width: 3.1 * sy, color: profile.stripeColor, alpha: 0.78, cap: 'round' });

      // Concentric bullseye oyster whorls on left & right flanks
      for (const side of [-1, 1] as const) {
        const flank = pt(midOrigin, midDir, -1.2 * sx, side * (bodySpec.torsoRadius * 0.52) * sy);
        drawRotatedEllipse(gfx, flank.x, flank.y, 6.2 * sx, 4.0 * sy, midAngle)
          .stroke({ width: 2.1 * sy, color: profile.stripeColor, alpha: 0.76 });
        drawRotatedEllipse(gfx, flank.x, flank.y, 2.5 * sx, 1.6 * sy, midAngle)
          .fill({ color: profile.stripeColor, alpha: 0.78 });

        // Shoulder butterfly wings
        const wing = pt(torso, torsoDir, 3.8 * sx, side * 5.2 * sy);
        drawRotatedEllipse(gfx, wing.x, wing.y, 3.8 * sx, 2.4 * sy, torsoAngle + side * 0.45)
          .fill({ color: profile.stripeColor, alpha: 0.68 });
      }
      break;
    }

    case 'solid': {
      if (profile.variantId === 'dsh_glossy_black_void') {
        // Luminous plum-satin curved sheen so Glossy Black Void pops crisply on dark floors
        const sheen = pt(midOrigin, midDir, 1 * sx, -1.5 * sy);
        gfx
          .moveTo(
            sheen.x - Math.cos(midAngle) * 8.4 * sx,
            sheen.y - Math.sin(midAngle) * 8.4 * sx,
          )
          .quadraticCurveTo(
            sheen.x + Math.sin(midAngle) * 2.8,
            sheen.y - Math.cos(midAngle) * 2.8,
            sheen.x + Math.cos(midAngle) * 8.4 * sx,
            sheen.y + Math.sin(midAngle) * 8.4 * sx,
          )
          .stroke({ width: 3.3 * sy, color: profile.highlightColor, alpha: 0.48, cap: 'round' });
      } else {
        // Dense plush velvety sheen (British Blue / Russian Blue / Scottish Fold / Persian Cream)
        drawRotatedEllipse(gfx, midX, midY, 11.2 * sx, 5.6 * sy, midAngle)
          .fill({ color: profile.highlightColor, alpha: 0.34 });
        const shoulderSheen = pt(torso, torsoDir, 1.5 * sx, 0);
        gfx
          .circle(shoulderSheen.x, shoulderSheen.y, 5.8 * Math.min(sx, sy))
          .fill({ color: profile.secondaryPatchColor, alpha: 0.22 });
      }
      break;
    }
  }

  // Feathered longhair surface wisps across back for Persian, Maine Coon & Ragdoll
  if (
    bodySpec.coatType === 'longhair' ||
    bodySpec.coatType === 'shaggy_longhair' ||
    bodySpec.coatType === 'silky_semilong'
  ) {
    for (const station of [-0.45, 0.05, 0.48]) {
      const c = pt(midOrigin, midDir, station * 12 * sx, 0);
      const n = perp(midDir);
      const span = bodySpec.torsoRadius * 0.56 * sy;
      gfx
        .moveTo(c.x - n.x * span, c.y - n.y * span)
        .quadraticCurveTo(
          c.x - midDir.x * 2.8 * sx,
          c.y - midDir.y * 2.8 * sx,
          c.x + n.x * span,
          c.y + n.y * span,
        )
        .stroke({ width: 1.5 * sy, color: profile.highlightColor, alpha: 0.36, cap: 'round' });
    }
  }

  // Sphynx iconic anatomical skin-fold wrinkle arcs across neck collar, shoulders, and haunches!
  if (bodySpec.hasWrinkles) {
    const wrinkleColor = profile.wrinkleColor;
    const baseAlpha = bodySpec.wrinkleAlpha;

    // 3 curved skin-fold arcs stacked around the slender neck collar
    const neckFolds = [
      { fwd: 7.4, span: 5.4, curve: -1.6, alpha: baseAlpha * 1.1 },
      { fwd: 5.2, span: 6.4, curve: -1.8, alpha: baseAlpha },
      { fwd: 2.8, span: 7.0, curve: -1.6, alpha: baseAlpha * 0.88 },
    ];
    for (const f of neckFolds) {
      const c = pt(torso, torsoDir, f.fwd * sx, 0);
      const n = perp(torsoDir);
      gfx
        .moveTo(c.x - n.x * f.span * sy, c.y - n.y * f.span * sy)
        .quadraticCurveTo(
          c.x + torsoDir.x * f.curve * sx,
          c.y + torsoDir.y * f.curve * sx,
          c.x + n.x * f.span * sy,
          c.y + n.y * f.span * sy,
        )
        .stroke({ width: 1.15, color: wrinkleColor, alpha: f.alpha, cap: 'round' });
    }

    // 2 delicate shoulder-blade wrinkle folds
    for (const side of [-1, 1] as const) {
      const sh = pt(torso, torsoDir, -1.6 * sx, side * 5.2 * sy);
      gfx
        .moveTo(sh.x - torsoDir.x * 2.8 * sx, sh.y - torsoDir.y * 2.8 * sx)
        .quadraticCurveTo(
          sh.x + perp(torsoDir).x * side * 1.6 * sy,
          sh.y + perp(torsoDir).y * side * 1.6 * sy,
          sh.x + torsoDir.x * 2.6 * sx,
          sh.y + torsoDir.y * 2.6 * sx,
        )
        .stroke({ width: 1.0, color: wrinkleColor, alpha: baseAlpha * 0.78, cap: 'round' });
    }

    // 2 curved haunch/hip skin-fold arcs
    const hipFolds = [
      { fwd: 1.8, span: 6.4, curve: 1.6, alpha: baseAlpha * 0.88 },
      { fwd: -2.2, span: 5.4, curve: 1.5, alpha: baseAlpha * 0.82 },
    ];
    for (const f of hipFolds) {
      const c = pt(hips, hipDir, f.fwd * sx, 0);
      const n = perp(hipDir);
      gfx
        .moveTo(c.x - n.x * f.span * sy, c.y - n.y * f.span * sy)
        .quadraticCurveTo(
          c.x + hipDir.x * f.curve * sx,
          c.y + hipDir.y * f.curve * sx,
          c.x + n.x * f.span * sy,
          c.y + n.y * f.span * sy,
        )
        .stroke({ width: 1.05, color: wrinkleColor, alpha: f.alpha, cap: 'round' });
    }
  }

  // Warm sunbeam/lamp rim highlight along upper dorsal edge
  const warmRim = resolveWarmRimStrength(spine.rimLightIntensity, spine.sunbeamWarmth);
  if (warmRim > 0.02) {
    const rimStart = pt(hips, hipDir, -2.0 * sx, -bodySpec.hipRadius * 0.88 * sy);
    const rimCtrl = pt(midOrigin, midDir, 0, -bodySpec.torsoRadius * 0.96 * sy);
    const rimEnd = pt(torso, torsoDir, 4.5 * sx, -bodySpec.neckRadius * 0.85 * sy);
    gfx
      .moveTo(rimStart.x, rimStart.y)
      .quadraticCurveTo(rimCtrl.x, rimCtrl.y, rimEnd.x, rimEnd.y)
      .stroke({ width: 2.1 * Math.min(sx, sy), color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.56, cap: 'round' });
  }

  // Optional neck collar + jingle bell
  if (spine.collarColor) {
    drawCatCollar(gfx, breedProfile, spine, spine.collarColor, spine.hasBell ?? true);
  }
}

export interface EarRenderOptions {
  earPose?: CatEarPose;
  isKitten?: boolean;
  rimLight?: number;
}

/**
 * Draws a single breed-shaped ear in head-local coordinates (+X forward, +Y right).
 */
export function drawBreedEar(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  side: -1 | 1,
  earFlatten = 0,
  earTwitch = 0,
  options: EarRenderOptions = {},
): void {
  const ear = breedProfile.anatomy.ears;
  const headScale = options.isKitten ? KITTEN_HEAD_ABSOLUTE_SCALE : 1;
  const earScale = options.isKitten ? KITTEN_HEAD_ABSOLUTE_SCALE * KITTEN_EAR_SCALE : 1;
  const pose = options.earPose ?? 'normal';
  const poseFlatten =
    pose === 'forward'
      ? 0.24
      : pose === 'airplane'
        ? -0.44
        : pose === 'flat_back'
          ? -0.68
          : 0;
  const effectiveFlatten = earFlatten + poseFlatten;
  const x = ear.offsetX * headScale;
  const y = ear.offsetY * side * headScale;
  const angle = side * ear.baseAngle - side * effectiveFlatten + side * earTwitch;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = (lx: number, ly: number) => x + lx * cos - ly * sin;
  const ty = (lx: number, ly: number) => y + lx * sin + ly * cos;

  const foreshorten = pose === 'flat_back' ? 0.84 : pose === 'airplane' ? 0.92 : 1;
  const len = ear.length * earScale * foreshorten;
  const halfW = ear.width * 0.5 * earScale;
  const warmRim = options.rimLight ?? 0;

  // Scottish Fold signature forward-folded rounded "owl" ear cap!
  if (ear.isFolded || ear.shape === 'folded_owl') {
    const foldX = (ear.offsetX + 1.8) * headScale;
    const foldY = ear.offsetY * 0.92 * side * headScale;
    const foldAng = side * (0.28 - effectiveFlatten * 0.4 + earTwitch * 0.5);
    if (warmRim > 0.02) {
      drawRotatedEllipse(gfx, foldX, foldY, len * 0.64 + 1.1, halfW * 0.84 + 1.1, foldAng)
        .fill({ color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.45 });
    }
    drawRotatedEllipse(gfx, foldX, foldY, len * 0.64, halfW * 0.84, foldAng)
      .fill({ color: coat.earOuterColor, alpha: 1 })
      .stroke({ width: 0.95, color: coat.eyeRimColor, alpha: 0.36 });
    // Soft fold-crease shadow under the folded forward tip
    drawRotatedEllipse(
      gfx,
      foldX + Math.cos(foldAng) * (len * 0.24),
      foldY + Math.sin(foldAng) * (len * 0.24),
      len * 0.32,
      halfW * 0.62,
      foldAng,
    ).fill({ color: coat.shadowColor, alpha: 0.45 });
    return;
  }

  // American Curl signature gracefully backward-curled crescent ears!
  if (ear.isCurledBack || ear.shape === 'curled_back') {
    const b1x = -len * 0.28;
    const b1y = -halfW * 0.88 * side;
    const b2x = -len * 0.42;
    const b2y = halfW * 0.96 * side;
    // Tip curls smoothly backward toward the skull (-X) and outward
    const tipX = len * 0.42;
    const tipY = -halfW * 0.84 * side;

    if (warmRim > 0.02) {
      gfx
        .moveTo(tx(b1x, b1y), ty(b1x, b1y))
        .quadraticCurveTo(tx(len * 0.48, -halfW * 0.56 * side), ty(len * 0.48, -halfW * 0.56 * side), tx(tipX, tipY), ty(tipX, tipY))
        .quadraticCurveTo(tx(len * 0.62, halfW * 0.42 * side), ty(len * 0.62, halfW * 0.42 * side), tx(b2x, b2y), ty(b2x, b2y))
        .stroke({ width: 2.2, color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.45, cap: 'round' });
    }

    gfx
      .moveTo(tx(b1x, b1y), ty(b1x, b1y))
      .quadraticCurveTo(
        tx(len * 0.48, -halfW * 0.56 * side),
        ty(len * 0.48, -halfW * 0.56 * side),
        tx(tipX, tipY),
        ty(tipX, tipY),
      )
      .quadraticCurveTo(
        tx(len * 0.62, halfW * 0.42 * side),
        ty(len * 0.62, halfW * 0.42 * side),
        tx(b2x, b2y),
        ty(b2x, b2y),
      )
      .closePath()
      .fill({ color: coat.earOuterColor, alpha: 1 })
      .stroke({ width: 0.95, color: coat.eyeRimColor, alpha: 0.34, join: 'round' });

    const sc = ear.innerScale;
    gfx
      .moveTo(tx(b1x * sc, b1y * sc), ty(b1x * sc, b1y * sc))
      .quadraticCurveTo(
        tx(len * 0.46, -halfW * 0.14 * side),
        ty(len * 0.46, -halfW * 0.14 * side),
        tx(b2x * sc, b2y * sc),
        ty(b2x * sc, b2y * sc),
      )
      .closePath()
      .fill({ color: coat.earInnerColor, alpha: 0.9 });

    if (ear.hasEarTufts && ear.tuftLength > 0) {
      for (const spread of [-0.25, 0.25]) {
        gfx
          .moveTo(tx(len * 0.12, spread * halfW * 0.3 * side), ty(len * 0.12, spread * halfW * 0.3 * side))
          .lineTo(tx(len * 0.12 + ear.tuftLength * headScale, spread * ear.tuftLength * 0.5 * side), ty(len * 0.12 + ear.tuftLength * headScale, spread * ear.tuftLength * 0.5 * side))
          .stroke({ width: 1.05, color: coat.highlightColor, alpha: 0.85, cap: 'round' });
      }
    }
    return;
  }

  if (ear.shape === 'giant_bat') {
    // Sphynx iconic oversized wide-flared bat ear with translucent pink inner ear & anatomical cartilage ridges!
    const b1x = -len * 0.24;
    const b1y = -halfW * 0.92 * side;
    const b2x = -len * 0.34;
    const b2y = halfW * 1.05 * side;
    const tipX = len * 0.86;
    const tipY = halfW * 0.08 * side;

    gfx
      .moveTo(tx(b1x, b1y), ty(b1x, b1y))
      .quadraticCurveTo(
        tx(len * 0.38, -halfW * 0.72 * side),
        ty(len * 0.38, -halfW * 0.72 * side),
        tx(tipX, tipY),
        ty(tipX, tipY),
      )
      .quadraticCurveTo(
        tx(len * 0.36, halfW * 0.96 * side),
        ty(len * 0.36, halfW * 0.96 * side),
        tx(b2x, b2y),
        ty(b2x, b2y),
      )
      .closePath()
      .fill({ color: coat.earOuterColor, alpha: 1 })
      .stroke({ width: 1.0, color: coat.eyeRimColor, alpha: 0.38, join: 'round' });

    // Large translucent blush-pink inner ear cup
    const sc = ear.innerScale;
    gfx
      .moveTo(tx(b1x * sc, b1y * sc), ty(b1x * sc, b1y * sc))
      .quadraticCurveTo(
        tx(len * 0.36, -halfW * 0.44 * side),
        ty(len * 0.36, -halfW * 0.44 * side),
        tx(tipX * 0.76, tipY),
        ty(tipX * 0.76, tipY),
      )
      .quadraticCurveTo(
        tx(len * 0.34, halfW * 0.62 * side),
        ty(len * 0.34, halfW * 0.62 * side),
        tx(b2x * sc, b2y * sc),
        ty(b2x * sc, b2y * sc),
      )
      .closePath()
      .fill({ color: coat.earInnerColor, alpha: 0.92 });

    // Delicate inner-ear anatomical cartilage ridges + tragus fold
    if (ear.hasCartilageDetail) {
      gfx
        .moveTo(tx(len * 0.02, -halfW * 0.14 * side), ty(len * 0.02, -halfW * 0.14 * side))
        .quadraticCurveTo(
          tx(len * 0.28, -halfW * 0.06 * side),
          ty(len * 0.28, -halfW * 0.06 * side),
          tx(len * 0.56, halfW * 0.02 * side),
          ty(len * 0.56, halfW * 0.02 * side),
        )
        .stroke({ width: 0.85, color: coat.wrinkleColor, alpha: 0.46, cap: 'round' })
        .moveTo(tx(-len * 0.08, halfW * 0.32 * side), ty(-len * 0.08, halfW * 0.32 * side))
        .quadraticCurveTo(
          tx(len * 0.16, halfW * 0.44 * side),
          ty(len * 0.16, halfW * 0.44 * side),
          tx(len * 0.38, halfW * 0.28 * side),
          ty(len * 0.38, halfW * 0.28 * side),
        )
        .stroke({ width: 0.8, color: coat.wrinkleColor, alpha: 0.4, cap: 'round' });
    }
    return;
  }

  if (ear.shape === 'small_rounded' || ear.shape === 'medium_rounded' || ear.shape === 'alert_medium_rounded') {
    // Persian, British Shorthair & Bengal soft rounded-dome ears
    const b1x = -len * 0.35;
    const b1y = -halfW * 0.95 * side;
    const b2x = -len * 0.45;
    const b2y = halfW * 1.05 * side;
    const tipX = len * 0.72;
    const tipY = 0;

    gfx
      .moveTo(tx(b1x, b1y), ty(b1x, b1y))
      .bezierCurveTo(
        tx(len * 0.38, -halfW * 0.88 * side),
        ty(len * 0.38, -halfW * 0.88 * side),
        tx(tipX + 0.8, -halfW * 0.44 * side),
        ty(tipX + 0.8, -halfW * 0.44 * side),
        tx(tipX, tipY),
        ty(tipX, tipY),
      )
      .bezierCurveTo(
        tx(tipX + 0.8, halfW * 0.46 * side),
        ty(tipX + 0.8, halfW * 0.46 * side),
        tx(len * 0.34, halfW * 0.92 * side),
        ty(len * 0.34, halfW * 0.92 * side),
        tx(b2x, b2y),
        ty(b2x, b2y),
      )
      .closePath()
      .fill({ color: coat.earOuterColor, alpha: 1 })
      .stroke({ width: 0.9, color: coat.eyeRimColor, alpha: 0.3, join: 'round' });

    const sc = ear.innerScale;
    gfx
      .moveTo(tx(b1x * sc, b1y * sc), ty(b1x * sc, b1y * sc))
      .quadraticCurveTo(
        tx(tipX * 0.78, 0),
        ty(tipX * 0.78, 0),
        tx(b2x * sc, b2y * sc),
        ty(b2x * sc, b2y * sc),
      )
      .closePath()
      .fill({ color: coat.earInnerColor, alpha: 0.86 });

    // Fluffy pale inner-ear furnishings (ear tufts)
    if (ear.hasEarTufts && ear.tuftLength > 0) {
      const tuftColor = coat.highlightColor;
      for (const spread of [-0.38, 0, 0.38]) {
        const sx0 = len * 0.14;
        const sy0 = spread * halfW * 0.36 * side;
        const ex0 = sx0 + ear.tuftLength * headScale * 0.96;
        const ey0 = sy0 + spread * ear.tuftLength * headScale * 0.62 * side;
        gfx
          .moveTo(tx(sx0, sy0), ty(sx0, sy0))
          .lineTo(tx(ex0, ey0), ty(ex0, ey0))
          .stroke({ width: 1.25, color: tuftColor, alpha: 0.92, cap: 'round' });
      }
    }
    return;
  }

  // Pointed triangular ears (Siamese, Munchkin, DSH, Maine Coon lynx-tufted, Ragdoll, Russian Blue, Abyssinian, Japanese Bobtail)
  const b1x = -len * 0.34;
  const b1y = -halfW * 0.92 * side;
  const b2x = -len * 0.48;
  const b2y = halfW * 1.12 * side;
  const tipX = len * 0.78;
  const tipY = 0;

  if (warmRim > 0.02) {
    gfx
      .poly([tx(b1x, b1y), ty(b1x, b1y), tx(tipX, tipY), ty(tipX, tipY), tx(b2x, b2y), ty(b2x, b2y)], true)
      .stroke({ width: 2.2, color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.42, join: 'round' });
  }

  gfx
    .poly([tx(b1x, b1y), ty(b1x, b1y), tx(tipX, tipY), ty(tipX, tipY), tx(b2x, b2y), ty(b2x, b2y)], true)
    .fill({ color: coat.earOuterColor, alpha: 1 })
    .stroke({ width: 0.9, color: coat.eyeRimColor, alpha: 0.34, join: 'round' });

  const sc = ear.innerScale;
  gfx
    .poly(
      [
        tx(b1x * sc, b1y * sc),
        ty(b1x * sc, b1y * sc),
        tx(tipX * (sc + 0.08), 0),
        ty(tipX * (sc + 0.08), 0),
        tx(b2x * sc, b2y * sc),
        ty(b2x * sc, b2y * sc),
      ],
      true,
    )
    .fill({ color: coat.earInnerColor, alpha: 0.9 });

  // Maine Coon iconic wispy lynx ear-tip spikes!
  if (ear.hasLynxTips && ear.tuftLength > 0) {
    const spike = ear.tuftLength * headScale;
    gfx
      .moveTo(tx(tipX * 0.92, -0.6 * side), ty(tipX * 0.92, -0.6 * side))
      .lineTo(tx(tipX + spike * 0.95, -0.8 * side), ty(tipX + spike * 0.95, -0.8 * side))
      .moveTo(tx(tipX * 0.96, 0), ty(tipX * 0.96, 0))
      .lineTo(tx(tipX + spike * 1.15, 0), ty(tipX + spike * 1.15, 0))
      .moveTo(tx(tipX * 0.92, 0.6 * side), ty(tipX * 0.92, 0.6 * side))
      .lineTo(tx(tipX + spike * 0.85, 0.8 * side), ty(tipX + spike * 0.85, 0.8 * side))
      .stroke({ width: 1.2, color: coat.earOuterColor, alpha: 0.95, cap: 'round' });
  }

  // Inner-ear furnishings for Ragdoll, Abyssinian, Maine Coon
  if (ear.hasEarTufts && ear.tuftLength > 0) {
    const tLen = Math.min(3.4, ear.tuftLength * 0.65) * headScale;
    for (const spread of [-0.32, 0.32]) {
      gfx
        .moveTo(tx(len * 0.1, spread * halfW * 0.32 * side), ty(len * 0.1, spread * halfW * 0.32 * side))
        .lineTo(tx(len * 0.1 + tLen, spread * tLen * 0.65 * side), ty(len * 0.1 + tLen, spread * tLen * 0.65 * side))
        .stroke({ width: 1.05, color: coat.highlightColor, alpha: 0.85, cap: 'round' });
    }
  }
}

/**
 * Draws breed-specific facial markings in head-local coordinates (+X forward/nose, +Y right cheek).
 */
export function drawHeadMarkings(
  gfx: Graphics,
  profile: CatCoatProfile,
  headRadiusX: number,
  headRadiusY: number,
  breedProfileOverride?: CatBreedProfile,
): void {
  const breedProfile = breedProfileOverride ?? getBreedProfile(profile.breed);
  const bodySpec = breedProfile.anatomy.body;
  const headSpec = breedProfile.anatomy.head;

  switch (profile.pattern) {
    case 'colorpoint': {
      // Iconic Siamese smooth diamond mask spanning muzzle & eyes with soft transition halo
      gfx
        .ellipse(headRadiusX * 0.32, 0, headRadiusX * 0.64, headRadiusY * 0.68)
        .fill({ color: profile.pointColor, alpha: 0.34 })
        .poly(
          [
            headRadiusX * 1.0, 0,
            headRadiusX * 0.42, -headRadiusY * 0.56,
            -headRadiusX * 0.14, 0,
            headRadiusX * 0.42, headRadiusY * 0.56,
          ],
          true,
        )
        .fill({ color: profile.pointColor, alpha: 0.88 })
        .ellipse(headRadiusX * 0.58, 0, headRadiusX * 0.4, headRadiusY * 0.44)
        .fill({ color: profile.pointColor, alpha: 0.94 });
      break;
    }

    case 'mitted_colorpoint': {
      // Ragdoll soft colorpoint mask + signature snowy white chin & inverted V-blaze on bicolors
      gfx
        .ellipse(headRadiusX * 0.28, 0, headRadiusX * 0.64, headRadiusY * 0.7)
        .fill({ color: profile.pointColor, alpha: 0.48 })
        .ellipse(headRadiusX * 0.56, 0, headRadiusX * 0.42, headRadiusY * 0.46)
        .fill({ color: profile.pointColor, alpha: 0.78 });
      if (profile.variantId === 'ragdoll_blue_bicolor') {
        gfx
          .poly(
            [
              headRadiusX * 0.08, 0,
              headRadiusX * 0.92, -headRadiusY * 0.42,
              headRadiusX * 0.98, 0,
              headRadiusX * 0.92, headRadiusY * 0.42,
            ],
            true,
          )
          .fill({ color: profile.bellyColor, alpha: 0.96 });
      } else {
        // Snowy white Ragdoll chin/muzzle highlight
        gfx
          .ellipse(headRadiusX * 0.72, 0, headRadiusX * 0.24, headRadiusY * 0.32)
          .fill({ color: profile.bellyColor, alpha: 0.92 });
      }
      break;
    }

    case 'hairless_bicolor': {
      // Seal-taupe cap/mask accents on blush peach suede head
      gfx
        .ellipse(-headRadiusX * 0.25, -headRadiusY * 0.35, headRadiusX * 0.45, headRadiusY * 0.38)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.8 })
        .ellipse(headRadiusX * 0.62, 0, headRadiusX * 0.34, headRadiusY * 0.32)
        .fill({ color: profile.muzzleColor, alpha: 0.72 });
      break;
    }

    case 'hairless_solid': {
      // Subtle warm suede crown highlight
      gfx
        .ellipse(-headRadiusX * 0.1, 0, headRadiusX * 0.46, headRadiusY * 0.38)
        .fill({ color: profile.highlightColor, alpha: 0.28 });
      break;
    }

    case 'tortoiseshell': {
      // Asymmetrical warm amber & cinnamon tortoiseshell facial blaze
      gfx
        .ellipse(-headRadiusX * 0.15, -headRadiusY * 0.42, headRadiusX * 0.48, headRadiusY * 0.38)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.86 })
        .ellipse(headRadiusX * 0.48, headRadiusY * 0.25, headRadiusX * 0.32, headRadiusY * 0.28)
        .fill({ color: profile.highlightColor, alpha: 0.78 });
      break;
    }

    case 'calico':
    case 'mike_calico': {
      // Asymmetrical terracotta/vermilion left temple cap + rich espresso/ink right brow patch
      gfx
        .ellipse(-headRadiusX * 0.22, -headRadiusY * 0.46, headRadiusX * 0.56, headRadiusY * 0.44)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.95 })
        .ellipse(-headRadiusX * 0.3, headRadiusY * 0.44, headRadiusX * 0.5, headRadiusY * 0.42)
        .fill({ color: profile.stripeColor, alpha: 0.94 });
      break;
    }

    case 'tuxedo':
    case 'bicolor': {
      // Crisp inverted white muzzle blaze tapering neatly up between the eyes
      gfx
        .poly(
          [
            headRadiusX * 0.06, 0,
            headRadiusX * 0.88, -headRadiusY * 0.38,
            headRadiusX * 0.96, 0,
            headRadiusX * 0.88, headRadiusY * 0.38,
          ],
          true,
        )
        .fill({ color: profile.muzzleColor, alpha: 0.98 });
      break;
    }

    case 'rosette_spotted':
    case 'rosette_marbled': {
      // Bengal vivid wild-cat cream muzzle cushions + dark cheetah mascara + bold forehead scarab 'M'
      gfx
        .ellipse(headRadiusX * 0.56, -headRadiusY * 0.24, headRadiusX * 0.3, headRadiusY * 0.24)
        .fill({ color: profile.muzzleColor, alpha: 0.94 })
        .ellipse(headRadiusX * 0.56, headRadiusY * 0.24, headRadiusX * 0.3, headRadiusY * 0.24)
        .fill({ color: profile.muzzleColor, alpha: 0.94 });

      gfx
        .moveTo(-headRadiusX * 0.36, -headRadiusY * 0.4)
        .lineTo(headRadiusX * 0.08, -headRadiusY * 0.28)
        .lineTo(-headRadiusX * 0.12, 0)
        .lineTo(headRadiusX * 0.08, headRadiusY * 0.28)
        .lineTo(-headRadiusX * 0.36, headRadiusY * 0.4)
        .stroke({ width: 1.75, color: profile.stripeColor, alpha: 0.9, cap: 'round', join: 'round' });

      for (const side of [-1, 1]) {
        gfx
          .moveTo(headRadiusX * 0.16, side * headRadiusY * 0.54)
          .lineTo(-headRadiusX * 0.38, side * headRadiusY * 0.78)
          .stroke({ width: 1.4, color: profile.stripeColor, alpha: 0.82, cap: 'round' });
      }
      break;
    }

    case 'ticked_agouti': {
      // Abyssinian soft cream muzzle + delicate 'M' crown + expressive dark eye-liner
      gfx
        .ellipse(headRadiusX * 0.58, 0, headRadiusX * 0.3, headRadiusY * 0.34)
        .fill({ color: profile.muzzleColor, alpha: 0.86 })
        .moveTo(-headRadiusX * 0.32, -headRadiusY * 0.34)
        .lineTo(headRadiusX * 0.06, -headRadiusY * 0.24)
        .lineTo(-headRadiusX * 0.1, 0)
        .lineTo(headRadiusX * 0.06, headRadiusY * 0.24)
        .lineTo(-headRadiusX * 0.32, headRadiusY * 0.34)
        .stroke({ width: 1.3, color: profile.stripeColor, alpha: 0.72, cap: 'round', join: 'round' });
      break;
    }

    case 'tabby_mackerel':
    case 'tabby_classic': {
      // Cream muzzle cushions
      gfx
        .ellipse(headRadiusX * 0.56, -2.7, headRadiusX * 0.3, headRadiusY * 0.24)
        .fill({ color: profile.muzzleColor, alpha: 0.92 })
        .ellipse(headRadiusX * 0.56, 2.7, headRadiusX * 0.3, headRadiusY * 0.24)
        .fill({ color: profile.muzzleColor, alpha: 0.92 });

      // Classic tabby forehead 'M' facing forward (+X)
      gfx
        .moveTo(-headRadiusX * 0.36, -headRadiusY * 0.38)
        .lineTo(headRadiusX * 0.08, -headRadiusY * 0.27)
        .lineTo(-headRadiusX * 0.12, 0)
        .lineTo(headRadiusX * 0.08, headRadiusY * 0.27)
        .lineTo(-headRadiusX * 0.36, headRadiusY * 0.38)
        .stroke({ width: 1.5, color: profile.stripeColor, alpha: 0.84, cap: 'round', join: 'round' });

      // Subtle tabby cheek mascara lines
      for (const side of [-1, 1]) {
        gfx
          .moveTo(headRadiusX * 0.12, side * headRadiusY * 0.58)
          .lineTo(-headRadiusX * 0.34, side * headRadiusY * 0.78)
          .stroke({ width: 1.1, color: profile.stripeColor, alpha: 0.62, cap: 'round' });
      }
      break;
    }

    case 'shaded': {
      // Persian Chinchilla Silver / Shaded Golden soft tipped crown + snowy flat muzzle pillows
      gfx
        .ellipse(-headRadiusX * 0.22, 0, headRadiusX * 0.52, headRadiusY * 0.62)
        .fill({ color: profile.stripeColor, alpha: 0.24 })
        .ellipse(headRadiusX * 0.44, -2.6, headRadiusX * 0.28, headRadiusY * 0.22)
        .fill({ color: profile.muzzleColor, alpha: 0.9 })
        .ellipse(headRadiusX * 0.44, 2.6, headRadiusX * 0.28, headRadiusY * 0.22)
        .fill({ color: profile.muzzleColor, alpha: 0.9 });
      break;
    }

    case 'solid': {
      if (profile.variantId === 'dsh_glossy_black_void') {
        gfx
          .ellipse(-2, -1.8, headRadiusX * 0.46, headRadiusY * 0.32)
          .fill({ color: profile.highlightColor, alpha: 0.42 });
      } else {
        // Plush velvet cheek/muzzle highlight sheen
        gfx
          .ellipse(headRadiusX * 0.42, 0, headRadiusX * 0.38, headRadiusY * 0.52)
          .fill({ color: profile.muzzleColor, alpha: 0.34 });
      }
      break;
    }
  }

  // Persian flat brachycephalic face plush cheek cushions
  if (headSpec.shape === 'brachycephalic') {
    gfx
      .ellipse(headRadiusX * headSpec.muzzleOffset, -2.8, 3.0, 2.7)
      .fill({ color: profile.muzzleColor, alpha: 0.72 })
      .ellipse(headRadiusX * headSpec.muzzleOffset, 2.8, 3.0, 2.7)
      .fill({ color: profile.muzzleColor, alpha: 0.72 });
  }

  // Sphynx delicate forehead worry-wrinkle arcs between ears and brows!
  if (bodySpec.hasWrinkles) {
    const wc = profile.wrinkleColor;
    const wa = bodySpec.wrinkleAlpha;
    for (const wx of [-3.4, -1.4, 0.5]) {
      const span = 4.2 - (wx + 3.4) * 0.28;
      gfx
        .moveTo(wx - 0.7, -span)
        .quadraticCurveTo(wx + 0.9, 0, wx - 0.7, span)
        .stroke({ width: 1.0, color: wc, alpha: wa, cap: 'round' });
    }
    // Subtle cheekbone contour lines
    for (const side of [-1, 1]) {
      gfx
        .moveTo(headRadiusX * 0.15, side * headRadiusY * 0.72)
        .quadraticCurveTo(
          headRadiusX * 0.42,
          side * headRadiusY * 0.62,
          headRadiusX * 0.62,
          side * headRadiusY * 0.42,
        )
        .stroke({ width: 0.85, color: wc, alpha: wa * 0.65, cap: 'round' });
    }
  }
}

/**
 * Draws expressive breed-shaped eyes in head-local coordinates (+X forward, +Y right)
 * with continuous pupilDilation (0..1) and slow_blink / wide_startled support.
 */
export function drawBreedEyes(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  options: EyeRenderOptions,
): void {
  const eyeSpec = breedProfile.anatomy.eyes;
  const headScale = options.isKitten ? KITTEN_HEAD_ABSOLUTE_SCALE : 1;
  const eyeScale = options.isKitten ? KITTEN_HEAD_ABSOLUTE_SCALE * KITTEN_EYE_SCALE : 1;
  const ex = eyeSpec.offsetX * headScale;
  const ey = eyeSpec.offsetY * headScale;
  const expr = options.expression;
  const time = options.time ?? 0;

  if (expr === 'closed') {
    for (const side of [-1, 1] as const) {
      const y = side * ey;
      gfx
        .moveTo(ex - 1.2 * eyeScale, y - 2.4 * eyeScale)
        .quadraticCurveTo(ex + 1.2 * eyeScale, y, ex - 1.2 * eyeScale, y + 2.4 * eyeScale)
        .stroke({ width: 1.5, color: coat.eyeRimColor, alpha: 0.88, cap: 'round' });
    }
    return;
  }

  if (expr === 'happy' || expr === 'slow_blink') {
    const curveLift = expr === 'slow_blink' ? 1.75 : 2.0;
    const strokeAlpha = expr === 'slow_blink' ? 0.9 : 0.94;
    for (const side of [-1, 1] as const) {
      const y = side * ey;
      gfx
        .moveTo(ex - 1.1 * eyeScale, y - 2.6 * eyeScale)
        .quadraticCurveTo(ex + curveLift * eyeScale, y, ex - 1.1 * eyeScale, y + 2.6 * eyeScale)
        .stroke({ width: 1.7, color: coat.eyeRimColor, alpha: strokeAlpha, cap: 'round' });
    }
    return;
  }

  if (expr === 'dizzy') {
    const spin = time * 16;
    for (const side of [-1, 1] as const) {
      const cy = side * ey;
      const r = Math.max(2.3, eyeSpec.irisRadius * eyeScale * 0.82);
      const dx1 = Math.cos(spin) * r;
      const dy1 = Math.sin(spin) * r;
      const dx2 = Math.cos(spin + Math.PI * 0.5) * r;
      const dy2 = Math.sin(spin + Math.PI * 0.5) * r;
      gfx
        .moveTo(ex - dx1, cy - dy1)
        .lineTo(ex + dx1, cy + dy1)
        .moveTo(ex - dx2, cy - dy2)
        .lineTo(ex + dx2, cy + dy2)
        .stroke({ width: 1.4, color: coat.eyeRimColor, alpha: 0.92, cap: 'round' });
    }
    return;
  }

  const isHalfClosed = expr === 'half_closed';
  const isDilated = expr === 'dilated';
  const isStartled = expr === 'wide_startled';
  const irisBase =
    eyeSpec.irisRadius *
    eyeScale *
    (options.isCurled ? 0.9 : isStartled ? 1.14 : 1);

  const resolvedDilation = clamp(
    options.pupilDilation !== undefined
      ? options.pupilDilation
      : isStartled
        ? 0.92
        : isDilated
          ? 0.88
          : options.nightMode
            ? 0.84
            : 0.25,
    0.08,
    0.98,
  );

  for (const side of [-1, 1] as const) {
    const cy = side * ey;

    // Luminous night-mode tapetum eye gleam
    if (options.nightMode) {
      gfx
        .circle(ex, cy, irisBase + 1.5)
        .fill({ color: coat.nightEyeGlowColor, alpha: eyeSpec.nightGlowAlpha });
    }

    // Subtle startled white sclera halo on wide_startled expression
    if (isStartled) {
      gfx
        .circle(ex, cy, irisBase + 0.95)
        .fill({ color: 0xfffaf4, alpha: 0.92 });
    }

    // Breed-authentic iris shape
    if (eyeSpec.shape === 'slanted_almond' || eyeSpec.shape === 'lemon' || eyeSpec.shape === 'vivid_almond' || eyeSpec.shape === 'expressive_almond') {
      const rx = eyeSpec.shape === 'lemon' ? irisBase * 0.92 : irisBase * 0.85;
      const ry = eyeSpec.shape === 'lemon' ? irisBase * 1.16 : irisBase * 1.12;
      const tilt = -side * eyeSpec.slantRad;
      drawRotatedEllipse(gfx, ex, cy, rx, ry, tilt)
        .fill({ color: coat.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.78, color: coat.eyeRimColor, alpha: 0.84 });
    } else if (
      eyeSpec.shape === 'walnut' ||
      eyeSpec.shape === 'almond' ||
      eyeSpec.shape === 'oval_expressive' ||
      eyeSpec.shape === 'sapphire_oval' ||
      eyeSpec.shape === 'bright_walnut' ||
      eyeSpec.shape === 'lively_oval'
    ) {
      const rx = irisBase * 0.94;
      const ry = irisBase * 1.06;
      const tilt = -side * eyeSpec.slantRad;
      drawRotatedEllipse(gfx, ex, cy, rx, ry, tilt)
        .fill({ color: coat.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.72, color: coat.eyeRimColor, alpha: 0.78 });
    } else {
      // Persian, British Shorthair, Scottish Fold saucer & Russian Blue jewel round eyes
      gfx
        .circle(ex, cy, irisBase)
        .fill({ color: coat.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.85, color: coat.eyeRimColor, alpha: 0.85 });
    }

    // Dynamic continuous pupil dilation: thin vertical almond slit (0.15-0.28) -> wide round saucer (0.78-0.98)
    const pupilRx = irisBase * (0.14 + resolvedDilation * 0.58) * eyeSpec.pupilScale;
    const pupilRy = irisBase * (0.62 + resolvedDilation * 0.14) * eyeSpec.pupilScale;
    gfx
      .ellipse(ex + 0.28, cy, pupilRx, pupilRy)
      .fill({ color: 0x141010, alpha: 0.97 });

    // Half-closed sleepy/loafing upper eyelid hood
    if (isHalfClosed) {
      gfx
        .ellipse(ex - irisBase * 0.36, cy, irisBase * 0.68, irisBase * 1.04)
        .fill({ color: coat.baseColor, alpha: 0.94 })
        .moveTo(ex - 0.1, cy - irisBase * 0.9)
        .quadraticCurveTo(ex + 0.7, cy, ex - 0.1, cy + irisBase * 0.9)
        .stroke({ width: 1.0, color: coat.eyeRimColor, alpha: 0.8, cap: 'round' });
    }

    // Crisp specular eye catchlights
    const glintR = options.nightMode ? 0.98 : 0.78;
    gfx
      .circle(ex + irisBase * 0.3, cy - irisBase * 0.28, glintR)
      .fill({ color: 0xfffaf2, alpha: options.nightMode ? 0.98 : 0.9 });

    if (eyeSpec.doubleCatchlight && !isHalfClosed) {
      gfx
        .circle(ex - irisBase * 0.22, cy + irisBase * 0.32, glintR * 0.48)
        .fill({ color: 0xfffaf2, alpha: 0.7 });
    }
  }
}

function drawCarriedToyAtMouth(
  gfx: Graphics,
  mouthX: number,
  mouthY: number,
  toyKind: ToyKind | null | undefined,
): void {
  const kind = toyKind ?? 'mouse_toy';
  if (kind === 'fish_toy') {
    // Tiny plush blue-teal fish held crosswise at mouth
    gfx
      .ellipse(mouthX + 2.6, mouthY, 3.8, 2.1)
      .fill({ color: 0x4b9ac9, alpha: 0.98 })
      .poly([mouthX - 0.6, mouthY, mouthX - 3.2, mouthY - 2.1, mouthX - 3.2, mouthY + 2.1], true)
      .fill({ color: 0x34749c, alpha: 0.98 })
      .circle(mouthX + 4.4, mouthY - 0.5, 0.55)
      .fill({ color: 0x16191e, alpha: 1 });
    return;
  }

  // Classic cute plush mouse toy held at mouth
  gfx
    .ellipse(mouthX + 2.4, mouthY, 3.4, 2.2)
    .fill({ color: 0x9aa2ad, alpha: 0.98 })
    .circle(mouthX + 4.0, mouthY - 1.5, 1.1)
    .fill({ color: 0xe6a8b2, alpha: 0.95 })
    .circle(mouthX + 4.0, mouthY + 1.5, 1.1)
    .fill({ color: 0xe6a8b2, alpha: 0.95 })
    .moveTo(mouthX - 0.8, mouthY)
    .quadraticCurveTo(mouthX - 3.6, mouthY + 2.2, mouthX - 5.2, mouthY + 0.6)
    .stroke({ width: 0.9, color: 0xd99ca6, alpha: 0.92, cap: 'round' });
}

/**
 * Draws the complete breed-authentic head in head-local coordinates (+X forward/nose, +Y right cheek):
 * ears, sculpted skull/cheeks/ruffs, facial markings, eyes, nose, expressions, toys, and whiskers.
 */
export function drawBreedHead(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  options: HeadRenderOptions = {},
): void {
  const headSpec = breedProfile.anatomy.head;
  const bodySpec = breedProfile.anatomy.body;
  const isKitten = options.isKitten ?? false;
  const headScale = isKitten ? KITTEN_HEAD_ABSOLUTE_SCALE : 1;
  const rx = headSpec.radiusX * headScale;
  const ry = headSpec.radiusY * headScale;

  const earFlatten = options.earFlatten ?? 0;
  const earTwitchLeft = options.earTwitchLeft ?? 0;
  const earTwitchRight = options.earTwitchRight ?? 0;
  const warmRim = resolveWarmRimStrength(options.rimLightIntensity, options.sunbeamWarmth);

  // 1. Breed-shaped ears (with independent earPose + kitten scale + warm rim)
  const earOpts: EarRenderOptions = {
    earPose: options.earPose,
    isKitten,
    rimLight: warmRim,
  };
  drawBreedEar(gfx, breedProfile, coat, -1, earFlatten, earTwitchLeft, earOpts);
  drawBreedEar(gfx, breedProfile, coat, 1, earFlatten, earTwitchRight, earOpts);

  // 2. Sculpted skull & breed cheek silhouette
  const drawSkullShape = (pad: number): void => {
    const sx = rx + pad;
    const sy = ry + pad;

    if (
      headSpec.shape === 'wedge' ||
      headSpec.shape === 'broad_wedge' ||
      headSpec.shape === 'sculpted_wedge' ||
      headSpec.shape === 'modified_wedge' ||
      headSpec.shape === 'chiseled_triangle'
    ) {
      // Sleek refined wedge tapering to muzzle (Siamese, Ragdoll, Russian Blue, Abyssinian, Japanese Bobtail)
      const cheekCurve = headSpec.shape === 'broad_wedge' ? 1.06 : 1.02;
      gfx
        .moveTo(sx * 1.04, 0)
        .bezierCurveTo(sx * 0.82, -sy * 0.56, sx * 0.16, -sy * cheekCurve, -sx * 0.52, -sy * 0.92)
        .bezierCurveTo(-sx * 0.98, -sy * 0.76, -sx * 1.02, sy * 0.76, -sx * 0.52, sy * 0.92)
        .bezierCurveTo(sx * 0.16, sy * cheekCurve, sx * 0.82, sy * 0.56, sx * 1.04, 0)
        .closePath();
      return;
    }

    if (headSpec.shape === 'angular_cheekbones' || headSpec.shape === 'wild_broad') {
      // Sphynx sculpted angular wedge or Bengal broad wild-cat cheekbones
      gfx
        .moveTo(sx * 1.02, 0)
        .bezierCurveTo(sx * 0.88, -sy * 0.44, sx * 0.36, -sy * 0.98, -sx * 0.08, -sy * 1.05)
        .bezierCurveTo(-sx * 0.72, -sy * 0.96, -sx * 1.04, -sy * 0.46, -sx * 0.98, 0)
        .bezierCurveTo(-sx * 1.04, sy * 0.46, -sx * 0.72, sy * 0.96, -sx * 0.08, sy * 1.05)
        .bezierCurveTo(sx * 0.36, sy * 0.98, sx * 0.88, sy * 0.44, sx * 1.02, 0)
        .closePath();
      return;
    }

    if (headSpec.shape === 'square_muzzle') {
      // Maine Coon strong broad square muzzle box + cheekbones
      gfx
        .moveTo(sx * 1.02, -sy * 0.28)
        .lineTo(sx * 1.02, sy * 0.28)
        .bezierCurveTo(sx * 0.82, sy * 0.72, sx * 0.24, sy * 1.04, -sx * 0.48, sy * 0.96)
        .bezierCurveTo(-sx * 0.98, sy * 0.84, -sx * 0.98, -sy * 0.84, -sx * 0.48, -sy * 0.96)
        .bezierCurveTo(sx * 0.24, -sy * 1.04, sx * 0.82, -sy * 0.72, sx * 1.02, -sy * 0.28)
        .closePath();
      return;
    }

    // Round / brachycephalic / owl_round / Cheshire / modified_round / classic feline skull
    gfx.ellipse(0, 0, sx, sy);
  };

  // Warm sunbeam rim glow on head contour
  if (warmRim > 0.02) {
    drawSkullShape(2.1);
    gfx.fill({ color: SUNBEAM_RIM_COLOR, alpha: warmRim * 0.36 });
  }

  // Soft outer rim
  drawSkullShape(1.05);
  gfx.fill({ color: coat.eyeRimColor, alpha: 0.26 });

  // Persian / Maine Coon / Ragdoll lush multi-lobed feathered cheek ruffs
  if ((headSpec.shape === 'brachycephalic' || headSpec.shape === 'square_muzzle') && bodySpec.hasCheekRuffs) {
    const ruffScale = bodySpec.cheekRuffScale * headScale;
    for (const side of [-1, 1] as const) {
      for (const [ox, oy, erx, ery] of [
        [-1.8 * headScale, side * ry * 0.82, 4.4 * ruffScale, 3.8 * ruffScale],
        [1.4 * headScale, side * ry * 0.78, 4.1 * ruffScale, 3.4 * ruffScale],
        [-4.6 * headScale, side * ry * 0.64, 3.8 * ruffScale, 3.2 * ruffScale],
      ] as const) {
        gfx
          .ellipse(ox, oy, erx + 0.9, ery + 0.9)
          .fill({ color: coat.eyeRimColor, alpha: 0.2 });
      }
    }
  }

  // Main skull fill
  drawSkullShape(0);
  gfx.fill({ color: coat.baseColor, alpha: 1 });

  // Breed cheek volumes
  if (headSpec.shape === 'brachycephalic' || headSpec.shape === 'square_muzzle') {
    const ruffScale = bodySpec.cheekRuffScale * headScale;
    for (const side of [-1, 1] as const) {
      gfx
        .ellipse(-1.8 * headScale, side * ry * 0.82, 4.4 * ruffScale, 3.8 * ruffScale)
        .fill({ color: coat.baseColor, alpha: 1 })
        .ellipse(1.4 * headScale, side * ry * 0.78, 4.1 * ruffScale, 3.4 * ruffScale)
        .fill({ color: coat.baseColor, alpha: 1 })
        .ellipse(-4.6 * headScale, side * ry * 0.64, 3.8 * ruffScale, 3.2 * ruffScale)
        .fill({ color: coat.baseColor, alpha: 1 })
        .ellipse(0.6 * headScale, side * ry * 0.8, 2.8 * ruffScale, 1.9 * ruffScale)
        .fill({ color: coat.highlightColor, alpha: 0.32 });
    }
  } else if (headSpec.shape === 'round_jowls' || headSpec.shape === 'owl_round') {
    // British Shorthair Cheshire jowls & Scottish Fold plush owl cheeks
    const jowlScale = bodySpec.cheekRuffScale * headScale;
    for (const side of [-1, 1] as const) {
      gfx
        .ellipse(2.2 * headScale, side * ry * 0.72, 4.8 * jowlScale * 0.74, 4.0 * jowlScale * 0.74)
        .fill({ color: coat.eyeRimColor, alpha: 0.18 })
        .ellipse(2.2 * headScale, side * ry * 0.7, 4.6 * jowlScale * 0.72, 3.8 * jowlScale * 0.72)
        .fill({ color: coat.baseColor, alpha: 1 });
    }
  } else if (bodySpec.hasCheekRuffs && bodySpec.cheekRuffScale > 0) {
    const sc = bodySpec.cheekRuffScale * headScale;
    for (const side of [-1, 1] as const) {
      gfx
        .ellipse(1.4 * headScale, side * ry * 0.7, 4.2 * sc, 3.1 * sc)
        .fill({ color: coat.baseColor, alpha: 1 });
    }
  }

  // 3. Breed facial markings
  drawHeadMarkings(gfx, coat, rx, ry, breedProfile);

  // 4. Expressive breed eyes (supports slow_blink pose & dynamic pupilDilation!)
  const pose = options.poseMode ?? 'normal';
  const resolvedEyeExpr: CatEyeExpression =
    pose === 'slow_blink' && (!options.eyeExpression || options.eyeExpression === 'normal')
      ? 'slow_blink'
      : pose === 'belly_up_sleep' && (!options.eyeExpression || options.eyeExpression === 'normal')
        ? 'closed'
        : pose === 'flehmen' && (!options.eyeExpression || options.eyeExpression === 'normal')
          ? 'wide_startled'
          : (options.eyeExpression ?? 'normal');

  drawBreedEyes(gfx, breedProfile, coat, {
    expression: resolvedEyeExpr,
    pupilDilation: options.pupilDilation,
    isCurled: options.isCurled,
    isKitten,
    nightMode: options.nightMode,
    time: options.time,
  });

  // 5. Breed-accurate nose
  const noseX = rx * headSpec.noseOffsetX;
  const ns = headSpec.noseSize * headScale;
  if (headSpec.shape === 'brachycephalic') {
    gfx
      .ellipse(noseX, 0, ns * 0.78, ns * 1.05)
      .fill({ color: coat.noseColor, alpha: 0.96 });
  } else {
    gfx
      .poly([noseX - ns * 0.85, -ns, noseX + ns * 0.45, 0, noseX - ns * 0.85, ns], true)
      .fill({ color: coat.noseColor, alpha: 0.96 });
  }

  // 5b. Expressive pose mouths, lapping tongue, and carried toys!
  const mouthX = noseX + ns * 0.65;
  const time = options.time ?? 0;
  if (pose === 'stretch_yawn' || (options.mouthOpen ?? 0) > 0.45) {
    const yawnOpen = options.mouthOpen ?? 0.92;
    gfx
      .ellipse(mouthX + 0.6, 0, 2.2 * headScale * yawnOpen, 2.4 * headScale * yawnOpen)
      .fill({ color: 0xe3848e, alpha: 0.96 })
      .stroke({ width: 0.8, color: coat.eyeRimColor, alpha: 0.7 });
  } else if (pose === 'flehmen') {
    // Hilarious wide-eyed open-mouth Flehmen grimace!
    gfx
      .ellipse(mouthX + 0.5, 0, 1.8 * headScale, 2.7 * headScale)
      .fill({ color: 0xd96f7b, alpha: 0.96 })
      .stroke({ width: 0.85, color: coat.eyeRimColor, alpha: 0.8 });
  } else if (pose === 'drinking') {
    // Tiny cute pink tongue lapping outward rhythmically!
    const lap = 0.6 + 0.4 * Math.sin(time * 18);
    gfx
      .ellipse(mouthX + 1.8 * lap * headScale, 0, 2.2 * lap * headScale, 1.25 * headScale)
      .fill({ color: 0xf29aa6, alpha: 0.96 });
  } else if (pose === 'chatter') {
    // Vibrating ek-ek-ek chattering jaw!
    const vib = Math.abs(Math.sin(time * 36));
    gfx
      .ellipse(mouthX + 0.4, 0, (0.9 + vib * 1.1) * headScale, (1.2 + vib * 0.7) * headScale)
      .fill({ color: 0xde7a85, alpha: 0.92 });
  } else if (pose === 'carrying_toy') {
    drawCarriedToyAtMouth(gfx, mouthX + 1.2 * headScale, 0, options.carriedToyKind);
  }

  // 6. Whiskers with independent whiskerTwitch oscillation!
  if (headSpec.whiskerLength > 0 && headSpec.whiskerCountPerSide > 0) {
    const count = headSpec.whiskerCountPerSide;
    const spread = headSpec.whiskerSpread;
    const len = headSpec.whiskerLength * headScale;
    const alpha = bodySpec.coatType === 'hairless' ? 0.34 : 0.58;
    const width = bodySpec.coatType === 'hairless' ? 0.65 : 0.85;
    const rawTwitch =
      options.whiskerTwitch !== undefined
        ? options.whiskerTwitch
        : pose === 'chatter'
          ? Math.sin(time * 34) * 0.85
          : 0;

    for (const side of [-1, 1] as const) {
      for (let i = 0; i < count; i++) {
        const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
        const twitchRad = rawTwitch * 0.18 * (1 + i * 0.15) * (side === -1 ? 1 : -1);
        const ang = u * spread + twitchRad;
        const bx = rx * headSpec.muzzleOffset;
        const by = side * (headSpec.muzzleWidth * 0.88 * headScale);
        const wx = bx + Math.sin(ang) * (len * 0.4);
        const wy = by + side * Math.cos(ang) * len;
        gfx
          .moveTo(bx, by)
          .lineTo(wx, wy)
          .stroke({ width, color: coat.whiskerColor, alpha, cap: 'round' });
      }
    }
  }
}
