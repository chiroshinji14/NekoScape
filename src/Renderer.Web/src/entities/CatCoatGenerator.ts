import { Graphics } from 'pixi.js';
import type { CatBreed, Vec2 } from '../types/simulation';

export interface CatCoatProfile {
  breed: CatBreed;
  baseColor: number;
  shadowColor: number;
  highlightColor: number;
  bellyColor: number;
  muzzleColor: number;
  pawColor: number;
  earOuterColor: number;
  earInnerColor: number;
  noseColor: number;
  eyeIrisColor: number;
  eyeRimColor: number;
  tailBaseColor: number;
  tailTipColor: number;
  stripeColor: number;
  secondaryPatchColor: number;
}

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
}

const COAT_PROFILES: Record<CatBreed, CatCoatProfile> = {
  calico: {
    breed: 'calico',
    baseColor: 0xf5ebde,
    shadowColor: 0xe2d3c0,
    highlightColor: 0xfbf5ec,
    bellyColor: 0xf8f1e6,
    muzzleColor: 0xfaf3ea,
    pawColor: 0xf7efe4,
    earOuterColor: 0xc9663e,
    earInnerColor: 0xe5a9a5,
    noseColor: 0xde8e8a,
    eyeIrisColor: 0x58a863,
    eyeRimColor: 0x3b2a1e,
    tailBaseColor: 0x423027,
    tailTipColor: 0xcc6b40,
    stripeColor: 0x423027,
    secondaryPatchColor: 0xcc6b40,
  },
  tuxedo: {
    breed: 'tuxedo',
    baseColor: 0x2a2628,
    shadowColor: 0x1d1a1c,
    highlightColor: 0x3f393d,
    bellyColor: 0xf3ece4,
    muzzleColor: 0xf4ede5,
    pawColor: 0xf4ede5,
    earOuterColor: 0x262224,
    earInnerColor: 0xe5a9a5,
    noseColor: 0xd98f91,
    eyeIrisColor: 0x7bc456,
    eyeRimColor: 0x1b181a,
    tailBaseColor: 0x2a2628,
    tailTipColor: 0xf3ece4,
    stripeColor: 0x1c191b,
    secondaryPatchColor: 0xf3ece4,
  },
  black: {
    breed: 'black',
    baseColor: 0x222024,
    shadowColor: 0x171518,
    highlightColor: 0x3c3840,
    bellyColor: 0x2a272d,
    muzzleColor: 0x28252b,
    pawColor: 0x1e1c20,
    earOuterColor: 0x201e22,
    earInnerColor: 0xe5a9a5,
    noseColor: 0x3f393e,
    eyeIrisColor: 0xb9e348,
    eyeRimColor: 0x151316,
    tailBaseColor: 0x222024,
    tailTipColor: 0x2b282e,
    stripeColor: 0x1a181c,
    secondaryPatchColor: 0x343038,
  },
  'blue-grey': {
    breed: 'blue-grey',
    baseColor: 0x6f7c8c,
    shadowColor: 0x576372,
    highlightColor: 0x99a8b8,
    bellyColor: 0x8997a6,
    muzzleColor: 0x8d9ba9,
    pawColor: 0x637080,
    earOuterColor: 0x677484,
    earInnerColor: 0xe5a9a5,
    noseColor: 0x4b535e,
    eyeIrisColor: 0x7be2ea,
    eyeRimColor: 0x323b45,
    tailBaseColor: 0x6b7888,
    tailTipColor: 0x566270,
    stripeColor: 0x5a6675,
    secondaryPatchColor: 0x9eb0c2,
  },
  siamese: {
    breed: 'siamese',
    baseColor: 0xeee0cc,
    shadowColor: 0xd9c6ad,
    highlightColor: 0xf7ede0,
    bellyColor: 0xf4eadb,
    muzzleColor: 0x4e3b31,
    pawColor: 0x4d3a30,
    earOuterColor: 0x4b382f,
    earInnerColor: 0xe5a9a5,
    noseColor: 0x3a2a22,
    eyeIrisColor: 0x4ba5f2,
    eyeRimColor: 0x34261f,
    tailBaseColor: 0xdfd0ba,
    tailTipColor: 0x4b382f,
    stripeColor: 0x614c40,
    secondaryPatchColor: 0x543f35,
  },
  'orange-tabby': {
    breed: 'orange-tabby',
    baseColor: 0xdf8942,
    shadowColor: 0xc26e2c,
    highlightColor: 0xeeaa6b,
    bellyColor: 0xf6dfc2,
    muzzleColor: 0xf7e3c9,
    pawColor: 0xf4dcc0,
    earOuterColor: 0xd47c36,
    earInnerColor: 0xe5a9a5,
    noseColor: 0xd98477,
    eyeIrisColor: 0x7ec05a,
    eyeRimColor: 0x5e3418,
    tailBaseColor: 0xdc843c,
    tailTipColor: 0xf3d7b5,
    stripeColor: 0xa64e1a,
    secondaryPatchColor: 0xf3caa0,
  },
};

export function getCoatProfile(breed: CatBreed): CatCoatProfile {
  return COAT_PROFILES[breed];
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

/**
 * Draws breed-specific dorsal torso/hip markings in scene/entity space along the spine.
 */
export function drawBodyMarkings(
  gfx: Graphics,
  profile: CatCoatProfile,
  spine: SpineRenderPoints,
): void {
  const { hips, torso, hipDir, torsoDir, bodyScaleX, bodyScaleY, isLoaf } = spine;
  const sx = bodyScaleX;
  const sy = bodyScaleY;
  const midX = (hips.x + torso.x) * 0.5;
  const midY = (hips.y + torso.y) * 0.5;
  const midDir = {
    x: (hipDir.x + torsoDir.x) * 0.5 || torsoDir.x,
    y: (hipDir.y + torsoDir.y) * 0.5 || torsoDir.y,
  };
  const midLen = Math.hypot(midDir.x, midDir.y) || 1;
  midDir.x /= midLen;
  midDir.y /= midLen;

  switch (profile.breed) {
    case 'calico': {
      // Terracotta saddle patch over left shoulder/mid-back
      const p1 = pt(torso, torsoDir, -2 * sx, -5.5 * sy);
      gfx
        .ellipse(p1.x, p1.y, 8.2 * sx, 5.6 * sy)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.94 });

      // Espresso hip patch on opposite flank
      const p2 = pt(hips, hipDir, 2 * sx, 4.8 * sy);
      gfx
        .ellipse(p2.x, p2.y, 7.6 * sx, 5.2 * sy)
        .fill({ color: profile.stripeColor, alpha: 0.92 });

      // Small terracotta spot near tail base
      const p3 = pt(hips, hipDir, -5 * sx, -2.2 * sy);
      gfx
        .circle(p3.x, p3.y, 4.2 * Math.min(sx, sy))
        .fill({ color: profile.secondaryPatchColor, alpha: 0.9 });
      break;
    }

    case 'tuxedo': {
      // Crisp white chest bib peeking ahead of shoulders
      const bib = pt(torso, torsoDir, 6.5 * sx, 0);
      gfx
        .ellipse(bib.x, bib.y, 5.2 * sx, 6.4 * sy)
        .fill({ color: profile.bellyColor, alpha: 0.96 });

      // Glossy charcoal back highlight
      const sheen = pt({ x: midX, y: midY }, midDir, 0, 0);
      gfx
        .ellipse(sheen.x, sheen.y, 9 * sx, 4.5 * sy)
        .fill({ color: profile.highlightColor, alpha: 0.28 });
      break;
    }

    case 'black': {
      // Sleek subtle dorsal sheen so silhouette reads cleanly on dark floors
      const sheen = pt({ x: midX, y: midY }, midDir, 1 * sx, -1.5 * sy);
      const midAngle = Math.atan2(midDir.y, midDir.x);
      gfx
        .moveTo(
          sheen.x - Math.cos(midAngle) * 8 * sx,
          sheen.y - Math.sin(midAngle) * 8 * sx,
        )
        .quadraticCurveTo(
          sheen.x + Math.sin(midAngle) * 2.5,
          sheen.y - Math.cos(midAngle) * 2.5,
          sheen.x + Math.cos(midAngle) * 8 * sx,
          sheen.y + Math.sin(midAngle) * 8 * sx,
        )
        .stroke({ width: 3.2 * sy, color: profile.highlightColor, alpha: 0.42, cap: 'round' });
      break;
    }

    case 'blue-grey': {
      // Silver-blue dorsal sheen along spine and soft lighter flank guard hairs
      const sheen = pt({ x: midX, y: midY }, midDir, 0, 0);
      gfx
        .ellipse(sheen.x, sheen.y, 11 * sx, 5.2 * sy)
        .fill({ color: profile.highlightColor, alpha: 0.34 });
      const shoulderSheen = pt(torso, torsoDir, 1 * sx, 0);
      gfx
        .circle(shoulderSheen.x, shoulderSheen.y, 5.5 * Math.min(sx, sy))
        .fill({ color: profile.secondaryPatchColor, alpha: 0.22 });
      break;
    }

    case 'siamese': {
      // Subtle toasted warm-taupe dorsal shading along center back
      const saddle = pt({ x: midX, y: midY }, midDir, -1 * sx, 0);
      gfx
        .ellipse(saddle.x, saddle.y, 10.5 * sx, 6.2 * sy)
        .fill({ color: profile.stripeColor, alpha: 0.16 });
      break;
    }

    case 'orange-tabby': {
      // Dorsal mackerel spine stripe + 4 curved rib stripes across back
      const tailBase = pt(hips, hipDir, -6 * sx, 0);
      const neckBase = pt(torso, torsoDir, 6 * sx, 0);
      gfx
        .moveTo(tailBase.x, tailBase.y)
        .quadraticCurveTo(midX, midY, neckBase.x, neckBase.y)
        .stroke({ width: 2.5 * sy, color: profile.stripeColor, alpha: 0.78, cap: 'round' });

      const stripeStations = isLoaf ? [-0.35, 0.1, 0.55] : [-0.55, -0.15, 0.25, 0.65];
      for (const s of stripeStations) {
        const cx = midX + midDir.x * s * 15 * sx;
        const cy = midY + midDir.y * s * 15 * sx;
        const n = perp(midDir);
        const span = (8.8 - Math.abs(s) * 2.1) * sy;
        const sweep = -midDir.x * 2.8 * sx;
        const sweepY = -midDir.y * 2.8 * sx;
        gfx
          .moveTo(cx - n.x * span + sweep, cy - n.y * span + sweepY)
          .quadraticCurveTo(cx, cy, cx + n.x * span + sweep, cy + n.y * span + sweepY)
          .stroke({ width: 2.1 * sy, color: profile.stripeColor, alpha: 0.68, cap: 'round' });
      }
      break;
    }
  }
}

/**
 * Draws breed-specific facial markings in head-local coordinates (+X is forward/nose, +Y is right cheek).
 */
export function drawHeadMarkings(
  gfx: Graphics,
  profile: CatCoatProfile,
  headRadiusX: number,
  headRadiusY: number,
): void {
  switch (profile.breed) {
    case 'calico': {
      // Terracotta cap over left ear/temple and espresso patch over right brow
      gfx
        .ellipse(-2.5, -headRadiusY * 0.48, headRadiusX * 0.58, headRadiusY * 0.44)
        .fill({ color: profile.secondaryPatchColor, alpha: 0.94 });
      gfx
        .ellipse(-3.5, headRadiusY * 0.46, headRadiusX * 0.52, headRadiusY * 0.42)
        .fill({ color: profile.stripeColor, alpha: 0.92 });
      break;
    }

    case 'tuxedo': {
      // Crisp inverted white muzzle/blaze between the eyes down to nose
      gfx
        .poly([
          headRadiusX * 0.08, 0,
          headRadiusX * 0.88, -headRadiusY * 0.36,
          headRadiusX * 0.95, 0,
          headRadiusX * 0.88, headRadiusY * 0.36,
        ])
        .fill({ color: profile.muzzleColor, alpha: 0.98 });
      break;
    }

    case 'black': {
      // Soft glossy crown highlight
      gfx
        .ellipse(-2, -2, headRadiusX * 0.45, headRadiusY * 0.32)
        .fill({ color: profile.highlightColor, alpha: 0.36 });
      break;
    }

    case 'blue-grey': {
      // Subtle silvery-blue cheek/muzzle plush sheen
      gfx
        .ellipse(headRadiusX * 0.42, 0, headRadiusX * 0.38, headRadiusY * 0.48)
        .fill({ color: profile.muzzleColor, alpha: 0.35 });
      break;
    }

    case 'siamese': {
      // Iconic seal-point diamond mask across muzzle & eyes
      gfx
        .ellipse(headRadiusX * 0.34, 0, headRadiusX * 0.58, headRadiusY * 0.62)
        .fill({ color: profile.muzzleColor, alpha: 0.92 });
      break;
    }

    case 'orange-tabby': {
      // Cream muzzle cushions
      gfx
        .ellipse(headRadiusX * 0.56, -2.8, headRadiusX * 0.3, headRadiusY * 0.25)
        .fill({ color: profile.muzzleColor, alpha: 0.9 })
        .ellipse(headRadiusX * 0.56, 2.8, headRadiusX * 0.3, headRadiusY * 0.25)
        .fill({ color: profile.muzzleColor, alpha: 0.9 });

      // Classic tabby forehead 'M' facing forward (+X)
      gfx
        .moveTo(-3.8, -4.6)
        .lineTo(0.8, -3.4)
        .lineTo(-1.4, 0)
        .lineTo(0.8, 3.4)
        .lineTo(-3.8, 4.6)
        .stroke({ width: 1.5, color: profile.stripeColor, alpha: 0.82, cap: 'round', join: 'round' });
      break;
    }
  }
}
