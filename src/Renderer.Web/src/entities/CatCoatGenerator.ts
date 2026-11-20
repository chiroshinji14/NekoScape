import { Graphics } from 'pixi.js';
import { normalizeCatBreed, type CatBreed, type Vec2 } from '../types/simulation';
import {
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
  | 'groom'
  | 'roll_belly'
  | 'meerkat'
  | 'zoomies'
  | 'pounce'
  | 'scratch'
  | 'eating';

export type CatEyeExpression =
  | 'normal'
  | 'dilated'
  | 'closed'
  | 'happy'
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
  meerkatFactor?: number;
  time?: number;
}

export interface TailRenderOptions {
  puffFactor?: number;
  isCurled?: boolean;
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
  rollPhase?: number;
  stretchFactor?: number;
  headPos?: Vec2;
  headAngle?: number;
}

export interface HeadRenderOptions {
  /** Ear flatten in radians (negative = flattened/airplane ears back, positive = perked forward). */
  earFlatten?: number;
  earTwitchLeft?: number;
  earTwitchRight?: number;
  eyeExpression?: CatEyeExpression;
  isCurled?: boolean;
  nightMode?: boolean;
  time?: number;
  poseMode?: CatPoseMode;
  groomPhase?: number;
}

export interface EyeRenderOptions {
  expression: CatEyeExpression;
  isCurled?: boolean;
  nightMode?: boolean;
  time?: number;
}

const KAPPA = 0.55228475;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
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
): void {
  const body = breedProfile.anatomy.body;
  const headSpec = breedProfile.anatomy.head;
  const groundOff = body.shadowOffsetScale;
  const shX = 7 * zHeight + 2.5 * groundOff;
  const shY = 13 * zHeight + 4 * groundOff;
  const alpha = clamp(0.28 * (1 - zHeight * 0.54), 0.06, 0.3);
  const shadowMul = body.shadowScale * scaleZ;

  gfx.clear();

  if (poseMode === 'meerkat') {
    gfx
      .circle(hips.x + shX, hips.y + shY, body.hipRadius * 1.08 * scaleZ)
      .fill({ color: 0x22140b, alpha })
      .circle(torso.x + shX * 0.85, torso.y + shY * 0.85, body.torsoRadius * 0.9 * scaleZ)
      .fill({ color: 0x22140b, alpha: alpha * 0.8 });
    return;
  }

  const rHip = (body.hipRadius + 0.8) * shadowMul;
  const rTorso = (body.torsoRadius + 0.8) * shadowMul;
  const rHead = Math.max(headSpec.radiusX, headSpec.radiusY) * 0.94 * scaleZ;

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
  const count = nodes.length - 1;

  const widthAt = (t: number): number => {
    const baseWidth =
      t < 0.5
        ? tailSpec.rootWidth + (tailSpec.midWidth - tailSpec.rootWidth) * (t * 2)
        : tailSpec.midWidth + (tailSpec.tipWidth - tailSpec.midWidth) * ((t - 0.5) * 2);
    const puffScale =
      tailSpec.style === 'hairless_whip'
        ? 1 + puff * 0.08
        : tailSpec.style === 'plume_brush'
          ? 1 + puff * 0.24
          : 1 + puff * 0.42;
    return baseWidth * puffScale;
  };

  if (tailSpec.style === 'plume_brush') {
    // Persian luxurious feathered bottle-brush plume
    for (let i = 0; i < count; i++) {
      const p0 = nodes[i];
      const p1 = nodes[i + 1];
      const tMid = (i + 0.5) / count;
      const w = widthAt(tMid);
      const segColor =
        coat.pattern === 'calico'
          ? i >= count - 2
            ? coat.tailTipColor
            : coat.tailBaseColor
          : mixColor(coat.tailBaseColor, coat.tailTipColor, tMid * 0.85);
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);

      // Soft outer rim under-plume
      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: w + 2.2, color: coat.eyeRimColor, alpha: 0.22, cap: 'round' });

      // Overlapping feathered fur tufts fanning gently along both sides of the plume
      const steps = 2;
      for (let s = 0; s < steps; s++) {
        const u = (s + 0.5) / steps;
        const mx = p0.x + (p1.x - p0.x) * u;
        const my = p0.y + (p1.y - p0.y) * u;
        const plumeRx = Math.max(4.5, w * 0.56);
        const plumeRy = Math.max(4.8, w * 0.64);
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

  // Standard, whip, plush blunt, plump upright, and hairless whip tails
  for (let i = 0; i < count; i++) {
    const p0 = nodes[i];
    const p1 = nodes[i + 1];
    const t = i / count;
    const tMid = (i + 0.5) / count;
    const width = widthAt(tMid);

    let color: number;
    if (coat.pattern === 'colorpoint') {
      color = mixColor(coat.tailBaseColor, coat.pointColor, Math.pow(tMid, 0.72));
    } else if (coat.pattern === 'tuxedo' || coat.pattern === 'bicolor') {
      color = i === count - 1 ? coat.tailTipColor : coat.tailBaseColor;
    } else if (coat.pattern === 'calico') {
      color = i >= count - 2 ? coat.tailTipColor : coat.tailBaseColor;
    } else {
      color = mixColor(coat.tailBaseColor, coat.tailTipColor, t * 0.85);
    }

    gfx
      .moveTo(p0.x, p0.y)
      .lineTo(p1.x, p1.y)
      .stroke({ width: width + 1.4, color: coat.eyeRimColor, alpha: 0.28, cap: 'round' })
      .moveTo(p0.x, p0.y)
      .lineTo(p1.x, p1.y)
      .stroke({ width, color, alpha: 1, cap: 'round' });

    // Subtle tabby tail rings on mackerel/classic tabbies
    if (
      (coat.pattern === 'tabby_mackerel' || coat.pattern === 'tabby_classic') &&
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
        .stroke({ width: 1.8, color: coat.stripeColor, alpha: 0.65, cap: 'round' });
    }

    // British Shorthair velvety plush highlight & blunt tip emphasis
    if (tailSpec.style === 'plush_blunt' && i < count - 1) {
      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: width * 0.28, color: coat.highlightColor, alpha: 0.28, cap: 'round' });
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
  const scale = Math.min(bodyScaleX, bodyScaleY);
  const torsoAngle = Math.atan2(torsoDir.y, torsoDir.x);
  const hipAngle = Math.atan2(hipDir.y, hipDir.x);
  const pawR = leg.pawRadius * scale;

  if (pose === 'loaf') {
    // Only tiny cozy front mitten tips barely peeking under the chest
    const frontPeek = leg.tuckedClose ? 3.0 : 4.2;
    const sidePeek = leg.frontSideSpan * 0.48 * bodyScaleY;
    const fl = pt(torso, torsoDir, frontPeek * bodyScaleX, -sidePeek);
    const fr = pt(torso, torsoDir, frontPeek * bodyScaleX, sidePeek);
    return [
      { x: fl.x, y: fl.y, radius: pawR * 0.72, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 0.72, angle: torsoAngle, showPads: false, isFront: true, side: 1 },
    ];
  }

  if (pose === 'roll_belly') {
    const phase = options.rollPhase ?? spine.rollPhase ?? 0;
    const wiggleA = Math.sin(phase * Math.PI * 2) * 2.2;
    const wiggleB = Math.cos(phase * Math.PI * 2) * 2.2;
    const fSpan = leg.frontSideSpan * 0.62 * bodyScaleY;
    const bSpan = leg.backSideSpan * 0.64 * bodyScaleY;

    const fl = pt(torso, torsoDir, (leg.frontReach * 0.55 + wiggleA) * bodyScaleX, -fSpan);
    const fr = pt(torso, torsoDir, (leg.frontReach * 0.55 - wiggleA) * bodyScaleX, fSpan);
    const bl = pt(hips, hipDir, (leg.backReach * 0.4 + wiggleB) * bodyScaleX, -bSpan);
    const br = pt(hips, hipDir, (leg.backReach * 0.4 - wiggleB) * bodyScaleX, bSpan);

    return [
      { x: fl.x, y: fl.y, radius: pawR * 0.96, angle: torsoAngle + 0.35, showPads: true, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 0.96, angle: torsoAngle - 0.35, showPads: true, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR * 0.96, angle: hipAngle - 0.3, showPads: true, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR * 0.96, angle: hipAngle + 0.3, showPads: true, isFront: false, side: 1 },
    ];
  }

  if (pose === 'meerkat') {
    // Hind paws planted wide under hips; cute tiny front paws tucked dangling in front of chest!
    const fSpan = leg.frontSideSpan * 0.44 * bodyScaleY;
    const bSpan = leg.backSideSpan * 0.88 * bodyScaleY;
    const frontY = leg.tuckedClose ? 5.6 : 7.4;

    const fl = pt(torso, torsoDir, frontY * bodyScaleX, -fSpan);
    const fr = pt(torso, torsoDir, frontY * bodyScaleX, fSpan);
    const bl = pt(hips, hipDir, 1.5 * bodyScaleX, -bSpan);
    const br = pt(hips, hipDir, 1.5 * bodyScaleX, bSpan);

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
      (3.5 + lickWave * 3.0) * bodyScaleX,
      (6.4 - lickWave * 1.8) * bodyScaleY,
    );
    const planted = pt(torso, torsoDir, leg.frontReach * 0.72 * bodyScaleX, -leg.frontSideSpan * 0.78 * bodyScaleY);
    const bl = pt(hips, hipDir, leg.backReach * 0.6 * bodyScaleX, -leg.backSideSpan * 0.82 * bodyScaleY);
    const br = pt(hips, hipDir, leg.backReach * 0.6 * bodyScaleX, leg.backSideSpan * 0.82 * bodyScaleY);

    return [
      { x: planted.x, y: planted.y, radius: pawR, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: lifted.x, y: lifted.y, radius: pawR * 0.95, angle: torsoAngle - 0.6, showPads: true, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR * 0.92, angle: hipAngle, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR * 0.92, angle: hipAngle, showPads: false, isFront: false, side: 1 },
    ];
  }

  if (pose === 'stretch') {
    const sf = clamp(options.stretchFactor ?? spine.stretchFactor ?? 1, 0, 1);
    const frontReach = leg.frontReach + (leg.tuckedClose ? 6.5 : 10.5) * sf;
    const backReach = leg.backReach - (leg.tuckedClose ? 2.5 : 4.5) * sf;
    const frontSpan = leg.frontSideSpan * 0.72 * bodyScaleY;
    const backSpan = leg.backSideSpan * 0.92 * bodyScaleY;

    const fl = pt(torso, torsoDir, frontReach * bodyScaleX, -frontSpan);
    const fr = pt(torso, torsoDir, frontReach * bodyScaleX, frontSpan);
    const bl = pt(hips, hipDir, backReach * bodyScaleX, -backSpan);
    const br = pt(hips, hipDir, backReach * bodyScaleX, backSpan);

    return [
      { x: fl.x, y: fl.y, radius: pawR * 1.04, angle: torsoAngle, showPads: false, isFront: true, side: -1 },
      { x: fr.x, y: fr.y, radius: pawR * 1.04, angle: torsoAngle, showPads: false, isFront: true, side: 1 },
      { x: bl.x, y: bl.y, radius: pawR, angle: hipAngle, showPads: false, isFront: false, side: -1 },
      { x: br.x, y: br.y, radius: pawR, angle: hipAngle, showPads: false, isFront: false, side: 1 },
    ];
  }

  if (pose === 'sunbathe') {
    const fl = pt(torso, torsoDir, (leg.frontReach + 3.2) * bodyScaleX, -leg.frontSideSpan * 0.92 * bodyScaleY);
    const fr = pt(torso, torsoDir, (leg.frontReach + 2.4) * bodyScaleX, leg.frontSideSpan * 1.02 * bodyScaleY);
    const bl = pt(hips, hipDir, (leg.backReach - 3.0) * bodyScaleX, -leg.backSideSpan * 1.02 * bodyScaleY);
    const br = pt(hips, hipDir, (leg.backReach - 2.2) * bodyScaleX, leg.backSideSpan * 0.94 * bodyScaleY);
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

  let frontLeftReach = isPounce ? leg.frontReach + 5.0 : leg.frontReach;
  let frontRightReach = frontLeftReach;
  let backLeftReach = isPounce ? leg.backReach - 4.8 : leg.backReach;
  let backRightReach = backLeftReach;
  let frontSideSpan = leg.frontSideSpan * bodyScaleY;
  const backSideSpan = leg.backSideSpan * bodyScaleY;

  if (isScratch) {
    const scratchWave = Math.sin((options.scratchPhase ?? 0) * 9 * Math.PI * 2);
    const reachBase = leg.tuckedClose ? 8.5 : 13.0;
    const reachAmp = leg.tuckedClose ? 4.8 : 7.0;
    frontLeftReach = reachBase + scratchWave * reachAmp;
    frontRightReach = reachBase - scratchWave * reachAmp;
    backLeftReach = leg.backReach - 1.0;
    backRightReach = leg.backReach - 1.0;
    frontSideSpan = leg.frontSideSpan * 0.8 * bodyScaleY;
  } else {
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

  const fl = pt(torso, torsoDir, frontLeftReach * bodyScaleX, -frontSideSpan);
  const fr = pt(torso, torsoDir, frontRightReach * bodyScaleX, frontSideSpan);
  const bl = pt(hips, hipDir, backLeftReach * bodyScaleX, -backSideSpan);
  const br = pt(hips, hipDir, backRightReach * bodyScaleX, backSideSpan);

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
    if (!paw.showPads && (leg.visibleToes || (pose === 'stretch' && paw.isFront))) {
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
  const scale = Math.min(bodyScaleX, bodyScaleY);

  const isCompact = isLoaf || pose === 'loaf' || pose === 'curled';
  let rHip = (isCompact ? bodySpec.loafHipRadius : bodySpec.hipRadius) * scale;
  let rTorso = (isCompact ? bodySpec.loafTorsoRadius : bodySpec.torsoRadius) * scale;
  let rNeck = (isCompact ? bodySpec.loafNeckRadius : bodySpec.neckRadius) * scale;

  if (pose === 'stretch') {
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
  }

  const hPerp = perp(hipDir);
  const tPerp = perp(torsoDir);
  const torsoAngle = Math.atan2(torsoDir.y, torsoDir.x);
  const hipAngle = Math.atan2(hipDir.y, hipDir.x);

  // Persian layered feathered fur scallops around outer silhouette (drawn behind main fill for crisp feathered contour)
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

  // Prominent Persian fluffy chest mane / ruff collar peeking beneath chin & shoulders
  if (bodySpec.hasChestMane && bodySpec.maneScale > 0) {
    const maneR = rNeck * 0.76 * bodySpec.maneScale;
    const maneCenter = pt(torso, torsoDir, rTorso * 0.44, 0);
    const maneColor = coat.pattern === 'calico' ? coat.bellyColor : coat.highlightColor;
    for (const sideAngle of [-0.62, -0.22, 0.22, 0.62]) {
      const ang = torsoAngle + sideAngle;
      const mx = maneCenter.x + Math.cos(ang) * (maneR * 0.42);
      const my = maneCenter.y + Math.sin(ang) * (maneR * 0.42);
      drawRotatedEllipse(gfx, mx, my, maneR * 0.56, maneR * 0.42, ang)
        .fill({ color: maneColor, alpha: 0.84 });
    }
  }

  // Exposed soft belly when cat flops over in ROLL_BELLY pose
  if (pose === 'roll_belly') {
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
  const sx = bodyScaleX;
  const sy = bodyScaleY;
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
  if (pose === 'roll_belly') {
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
    } else if (bodySpec.coatType === 'longhair') {
      // Fluffy Persian belly fur whorls
      for (const s of [-0.35, 0.25]) {
        const c = pt(midOrigin, midDir, s * 9 * sx, 0);
        drawRotatedEllipse(gfx, c.x, c.y, 5.2 * sx, 6.2 * sy, midAngle)
          .fill({ color: profile.highlightColor, alpha: 0.42 });
      }
    }
    return;
  }

  // Pattern rendering across all 6 breeds and coat variants
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

    case 'shaded': {
      // Persian Chinchilla Silver / Shaded Golden luminous tipped longhair mantle
      const mantle = pt(midOrigin, midDir, -0.5 * sx, 0);
      drawRotatedEllipse(gfx, mantle.x, mantle.y, 12.2 * sx, 8.6 * sy, midAngle)
        .fill({ color: profile.stripeColor, alpha: 0.26 });
      const dorsalTip = pt(midOrigin, midDir, -1 * sx, 0);
      drawRotatedEllipse(gfx, dorsalTip.x, dorsalTip.y, 9.5 * sx, 4.8 * sy, midAngle)
        .fill({ color: profile.stripeColor, alpha: 0.22 });
      break;
    }

    case 'calico': {
      // Warm apricot/terracotta shoulder saddle, espresso opposite-flank hip patch, small tail-base spot
      const scaleW = bodySpec.torsoRadius / 12.2;
      const p1 = pt(torso, torsoDir, -2 * sx, -5.2 * sy * scaleW);
      drawRotatedEllipse(gfx, p1.x, p1.y, 8.4 * sx * scaleW, 5.8 * sy * scaleW, torsoAngle)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.94 });

      const p2 = pt(hips, hipDir, 2 * sx, 4.6 * sy * scaleW);
      drawRotatedEllipse(gfx, p2.x, p2.y, 7.8 * sx * scaleW, 5.4 * sy * scaleW, hipAngle)
        .fill({ color: profile.stripeColor, alpha: 0.92 });

      const p3 = pt(hips, hipDir, -5 * sx, -2.0 * sy * scaleW);
      gfx
        .circle(p3.x, p3.y, 4.2 * Math.min(sx, sy) * scaleW)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.9 });
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
      // Crisp white chest bib & lower flank wrap contrasting cleanly with rich ginger saddle
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
        : breedProfile.breed === 'munchkin'
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
        // Dense plush velvety sheen (British Blue / Lilac / Cream & Persian Cream)
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

  // Persian feathered longhair surface wisps across back for unmistakable fluffy texture
  if (bodySpec.coatType === 'longhair') {
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
): void {
  const ear = breedProfile.anatomy.ears;
  const x = ear.offsetX;
  const y = ear.offsetY * side;
  const angle = side * ear.baseAngle - side * earFlatten + side * earTwitch;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = (lx: number, ly: number) => x + lx * cos - ly * sin;
  const ty = (lx: number, ly: number) => y + lx * sin + ly * cos;

  const len = ear.length;
  const halfW = ear.width * 0.5;

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

  if (ear.shape === 'small_rounded' || ear.shape === 'medium_rounded') {
    // Persian & British Shorthair soft rounded-dome ears
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

    // Persian signature fluffy pale inner-ear furnishings (ear tufts) extending visibly past the ear rim
    if (ear.hasEarTufts && ear.tuftLength > 0) {
      const tuftColor = coat.highlightColor;
      for (const spread of [-0.38, 0, 0.38]) {
        const sx0 = len * 0.14;
        const sy0 = spread * halfW * 0.36 * side;
        const ex0 = sx0 + ear.tuftLength * 0.96;
        const ey0 = sy0 + spread * ear.tuftLength * 0.62 * side;
        gfx
          .moveTo(tx(sx0, sy0), ty(sx0, sy0))
          .lineTo(tx(ex0, ey0), ty(ex0, ey0))
          .stroke({ width: 1.25, color: tuftColor, alpha: 0.92, cap: 'round' });
      }
    }
    return;
  }

  // Pointed triangular ears (Siamese tall wedge ears, Munchkin perky alert ears, DSH medium pointed ears)
  const b1x = -len * 0.34;
  const b1y = -halfW * 0.92 * side;
  const b2x = -len * 0.48;
  const b2y = halfW * 1.12 * side;
  const tipX = len * 0.78;
  const tipY = 0;

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

    case 'calico': {
      // Asymmetrical terracotta left temple cap + rich espresso right brow patch
      gfx
        .ellipse(-2.4, -headRadiusY * 0.46, headRadiusX * 0.56, headRadiusY * 0.44)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.94 })
        .ellipse(-3.4, headRadiusY * 0.44, headRadiusX * 0.5, headRadiusY * 0.42)
        .fill({ color: profile.stripeColor, alpha: 0.92 });
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
        .moveTo(-3.8, -4.5)
        .lineTo(0.8, -3.2)
        .lineTo(-1.3, 0)
        .lineTo(0.8, 3.2)
        .lineTo(-3.8, 4.5)
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
 * Draws expressive breed-shaped eyes in head-local coordinates (+X forward, +Y right).
 */
export function drawBreedEyes(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  options: EyeRenderOptions,
): void {
  const eyeSpec = breedProfile.anatomy.eyes;
  const ex = eyeSpec.offsetX;
  const ey = eyeSpec.offsetY;
  const expr = options.expression;
  const time = options.time ?? 0;

  if (expr === 'closed') {
    for (const side of [-1, 1] as const) {
      const y = side * ey;
      gfx
        .moveTo(ex - 1.2, y - 2.4)
        .quadraticCurveTo(ex + 1.2, y, ex - 1.2, y + 2.4)
        .stroke({ width: 1.5, color: coat.eyeRimColor, alpha: 0.88, cap: 'round' });
    }
    return;
  }

  if (expr === 'happy') {
    for (const side of [-1, 1] as const) {
      const y = side * ey;
      gfx
        .moveTo(ex - 1.1, y - 2.6)
        .quadraticCurveTo(ex + 2.0, y, ex - 1.1, y + 2.6)
        .stroke({ width: 1.75, color: coat.eyeRimColor, alpha: 0.94, cap: 'round' });
    }
    return;
  }

  if (expr === 'dizzy') {
    const spin = time * 16;
    for (const side of [-1, 1] as const) {
      const cy = side * ey;
      const r = Math.max(2.3, eyeSpec.irisRadius * 0.82);
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
  const irisBase = eyeSpec.irisRadius * (options.isCurled ? 0.9 : 1);

  for (const side of [-1, 1] as const) {
    const cy = side * ey;

    // Luminous night-mode tapetum eye gleam
    if (options.nightMode) {
      gfx
        .circle(ex, cy, irisBase + 1.5)
        .fill({ color: coat.nightEyeGlowColor, alpha: eyeSpec.nightGlowAlpha });
    }

    // Breed-authentic iris shape
    if (eyeSpec.shape === 'slanted_almond' || eyeSpec.shape === 'lemon') {
      const rx = eyeSpec.shape === 'lemon' ? irisBase * 0.92 : irisBase * 0.82;
      const ry = eyeSpec.shape === 'lemon' ? irisBase * 1.16 : irisBase * 1.12;
      const tilt = -side * eyeSpec.slantRad;
      drawRotatedEllipse(gfx, ex, cy, rx, ry, tilt)
        .fill({ color: coat.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.75, color: coat.eyeRimColor, alpha: 0.82 });
    } else if (eyeSpec.shape === 'walnut' || eyeSpec.shape === 'almond') {
      const rx = irisBase * 0.94;
      const ry = irisBase * 1.06;
      const tilt = -side * eyeSpec.slantRad;
      drawRotatedEllipse(gfx, ex, cy, rx, ry, tilt)
        .fill({ color: coat.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.72, color: coat.eyeRimColor, alpha: 0.78 });
    } else {
      // Persian & British Shorthair iconic huge round doll/copper eyes
      gfx
        .circle(ex, cy, irisBase)
        .fill({ color: coat.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.85, color: coat.eyeRimColor, alpha: 0.85 });
    }

    // Pupil: wide round when excited/curious/dilated, crisp vertical slit otherwise
    if (isDilated) {
      gfx
        .circle(ex + 0.28, cy, irisBase * 0.68 * eyeSpec.pupilScale)
        .fill({ color: 0x141010, alpha: 0.97 });
    } else {
      gfx
        .ellipse(
          ex + 0.28,
          cy,
          irisBase * 0.38 * eyeSpec.pupilScale,
          irisBase * 0.64 * eyeSpec.pupilScale,
        )
        .fill({ color: 0x141010, alpha: 0.96 });
    }

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

/**
 * Draws the complete breed-authentic head in head-local coordinates (+X forward/nose, +Y right cheek):
 * ears, sculpted skull/cheeks/ruffs, facial markings, eyes, nose, and whiskers.
 */
export function drawBreedHead(
  gfx: Graphics,
  breedProfile: CatBreedProfile,
  coat: CatCoatProfile,
  options: HeadRenderOptions = {},
): void {
  const headSpec = breedProfile.anatomy.head;
  const bodySpec = breedProfile.anatomy.body;
  const rx = headSpec.radiusX;
  const ry = headSpec.radiusY;

  const earFlatten = options.earFlatten ?? 0;
  const earTwitchLeft = options.earTwitchLeft ?? 0;
  const earTwitchRight = options.earTwitchRight ?? 0;

  // 1. Breed-shaped ears
  drawBreedEar(gfx, breedProfile, coat, -1, earFlatten, earTwitchLeft);
  drawBreedEar(gfx, breedProfile, coat, 1, earFlatten, earTwitchRight);

  // 2. Sculpted skull & breed cheek silhouette
  const drawSkullShape = (pad: number): void => {
    const sx = rx + pad;
    const sy = ry + pad;

    if (headSpec.shape === 'wedge') {
      // Siamese sleek refined triangular-almond wedge tapering cleanly to narrow muzzle
      gfx
        .moveTo(sx * 1.04, 0)
        .bezierCurveTo(sx * 0.82, -sy * 0.56, sx * 0.16, -sy * 1.04, -sx * 0.52, -sy * 0.92)
        .bezierCurveTo(-sx * 0.98, -sy * 0.76, -sx * 1.02, sy * 0.76, -sx * 0.52, sy * 0.92)
        .bezierCurveTo(sx * 0.16, sy * 1.04, sx * 0.82, sy * 0.56, sx * 1.04, 0)
        .closePath();
      return;
    }

    if (headSpec.shape === 'angular_cheekbones') {
      // Sphynx sculpted angular wedge with prominent cheekbones and slender muzzle
      gfx
        .moveTo(sx * 1.02, 0)
        .bezierCurveTo(sx * 0.88, -sy * 0.42, sx * 0.36, -sy * 0.98, -sx * 0.08, -sy * 1.05)
        .bezierCurveTo(-sx * 0.72, -sy * 0.96, -sx * 1.04, -sy * 0.46, -sx * 0.98, 0)
        .bezierCurveTo(-sx * 1.04, sy * 0.46, -sx * 0.72, sy * 0.96, -sx * 0.08, sy * 1.05)
        .bezierCurveTo(sx * 0.36, sy * 0.98, sx * 0.88, sy * 0.42, sx * 1.02, 0)
        .closePath();
      return;
    }

    // Round / brachycephalic / Cheshire / classic feline skull
    gfx.ellipse(0, 0, sx, sy);
  };

  // Soft outer rim
  drawSkullShape(1.05);
  gfx.fill({ color: coat.eyeRimColor, alpha: 0.26 });

  // Persian lush multi-lobed feathered cheek ruffs (under-rim + plush fill)
  if (headSpec.shape === 'brachycephalic' && bodySpec.hasCheekRuffs) {
    const ruffScale = bodySpec.cheekRuffScale;
    for (const side of [-1, 1] as const) {
      for (const [ox, oy, erx, ery] of [
        [-1.8, side * ry * 0.82, 4.4 * ruffScale, 3.8 * ruffScale],
        [1.4, side * ry * 0.78, 4.1 * ruffScale, 3.4 * ruffScale],
        [-4.6, side * ry * 0.64, 3.8 * ruffScale, 3.2 * ruffScale],
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

  // Breed cheek volumes (Persian cheek ruffs, British Shorthair Cheshire jowls, Munchkin/DSH soft cheeks)
  if (headSpec.shape === 'brachycephalic') {
    const ruffScale = bodySpec.cheekRuffScale;
    for (const side of [-1, 1] as const) {
      gfx
        .ellipse(-1.8, side * ry * 0.82, 4.4 * ruffScale, 3.8 * ruffScale)
        .fill({ color: coat.baseColor, alpha: 1 })
        .ellipse(1.4, side * ry * 0.78, 4.1 * ruffScale, 3.4 * ruffScale)
        .fill({ color: coat.baseColor, alpha: 1 })
        .ellipse(-4.6, side * ry * 0.64, 3.8 * ruffScale, 3.2 * ruffScale)
        .fill({ color: coat.baseColor, alpha: 1 })
        .ellipse(0.6, side * ry * 0.8, 2.8 * ruffScale, 1.9 * ruffScale)
        .fill({ color: coat.highlightColor, alpha: 0.32 });
    }
  } else if (headSpec.shape === 'round_jowls') {
    // British Shorthair unmistakable plump round "Cheshire" jowls!
    const jowlScale = bodySpec.cheekRuffScale;
    for (const side of [-1, 1] as const) {
      gfx
        .ellipse(2.2, side * ry * 0.72, 4.8 * jowlScale * 0.74, 4.0 * jowlScale * 0.74)
        .fill({ color: coat.eyeRimColor, alpha: 0.18 })
        .ellipse(2.2, side * ry * 0.7, 4.6 * jowlScale * 0.72, 3.8 * jowlScale * 0.72)
        .fill({ color: coat.baseColor, alpha: 1 });
    }
  } else if (bodySpec.hasCheekRuffs && bodySpec.cheekRuffScale > 0) {
    const sc = bodySpec.cheekRuffScale;
    for (const side of [-1, 1] as const) {
      gfx
        .ellipse(1.4, side * ry * 0.7, 4.2 * sc, 3.1 * sc)
        .fill({ color: coat.baseColor, alpha: 1 });
    }
  }

  // 3. Breed facial markings (colorpoint mask, forehead 'M', calico patches, Sphynx forehead wrinkles, etc.)
  drawHeadMarkings(gfx, coat, rx, ry, breedProfile);

  // 4. Expressive breed eyes
  drawBreedEyes(gfx, breedProfile, coat, {
    expression: options.eyeExpression ?? 'normal',
    isCurled: options.isCurled,
    nightMode: options.nightMode,
    time: options.time,
  });

  // 5. Breed-accurate nose (recessed flat button nose on Persian, sleek forward tip on Siamese, etc.)
  const noseX = rx * headSpec.noseOffsetX;
  const ns = headSpec.noseSize;
  if (headSpec.shape === 'brachycephalic') {
    // Tiny adorable recessed Persian button nose right between the huge round eyes
    gfx
      .ellipse(noseX, 0, ns * 0.78, ns * 1.05)
      .fill({ color: coat.noseColor, alpha: 0.96 });
  } else {
    gfx
      .poly([noseX - ns * 0.85, -ns, noseX + ns * 0.45, 0, noseX - ns * 0.85, ns], true)
      .fill({ color: coat.noseColor, alpha: 0.96 });
  }

  // 6. Whiskers (lush on Persian, sleek on Siamese/DSH/BSH/Munchkin, authentically stubby/minimal on Sphynx)
  if (headSpec.whiskerLength > 0 && headSpec.whiskerCountPerSide > 0) {
    const count = headSpec.whiskerCountPerSide;
    const spread = headSpec.whiskerSpread;
    const len = headSpec.whiskerLength;
    const alpha = bodySpec.coatType === 'hairless' ? 0.34 : 0.58;
    const width = bodySpec.coatType === 'hairless' ? 0.65 : 0.85;

    for (const side of [-1, 1] as const) {
      for (let i = 0; i < count; i++) {
        const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
        const ang = u * spread;
        const bx = rx * headSpec.muzzleOffset;
        const by = side * (headSpec.muzzleWidth * 0.88);
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
