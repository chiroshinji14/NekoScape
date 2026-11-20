import {
  IDLE_NAP_SECONDS,
  type LaserTarget,
  type Vec2,
} from '../types/simulation';

const SPLIT_COLORS = [0xff3b30, 0xffb340, 0x52e5ff] as const;
const SPLIT_OFFSETS = [-0.52, 0, 0.52] as const;
const SPLIT_DIST_FACTORS = [0.92, 1.08, 0.96] as const;

function clampPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number,
): Vec2 {
  const safeW = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeH = Math.max(1, Number.isFinite(height) ? height : 1);
  const mx = Math.min(margin, safeW * 0.25);
  const my = Math.min(margin, safeH * 0.25);

  const cx = Number.isFinite(x) ? x : safeW * 0.5;
  const cy = Number.isFinite(y) ? y : safeH * 0.5;

  return {
    x: Math.max(mx, Math.min(cx, Math.max(mx, safeW - mx))),
    y: Math.max(my, Math.min(cy, Math.max(my, safeH - my))),
  };
}

/**
 * Computes either a single primary crimson laser dot or 3 diverging prism-split targets
 * clamped safely inside viewport margins with guaranteed distinct coordinates.
 */
export function computeLaserTargets(
  cursor: Vec2,
  prismPos: Vec2,
  prismRadius: number,
  width: number,
  height: number,
  forceSplit = false,
): { targets: LaserTarget[]; splitActive: boolean } {
  const margin = 24;
  const safeW = Math.max(1, Number.isFinite(width) ? width : 800);
  const safeH = Math.max(1, Number.isFinite(height) ? height : 600);

  const dx = cursor.x - prismPos.x;
  const dy = cursor.y - prismPos.y;
  const distToPrism = Math.hypot(dx, dy);
  const splitActive = Boolean(forceSplit) || distToPrism <= Math.max(0, prismRadius);

  if (!splitActive) {
    const clamped = clampPoint(cursor.x, cursor.y, safeW, safeH, margin);
    return {
      splitActive: false,
      targets: [
        {
          id: 'laser-primary',
          x: clamped.x,
          y: clamped.y,
          color: SPLIT_COLORS[0],
          isSplitBeam: false,
        },
      ],
    };
  }

  const centerAngle = Math.atan2(safeH * 0.5 - prismPos.y, safeW * 0.5 - prismPos.x);
  let baseAngle = distToPrism > 4 ? Math.atan2(-dy, -dx) : -Math.PI * 0.15;
  const baseDist = Math.max(140, Math.min(260, Math.min(safeW, safeH) * 0.28));

  // If the cursor-driven outgoing beam points directly into a close border wall,
  // steer toward the open room interior so the 3 beams never collapse onto one corner.
  const probe = clampPoint(
    prismPos.x + Math.cos(baseAngle) * baseDist,
    prismPos.y + Math.sin(baseAngle) * baseDist,
    safeW,
    safeH,
    margin,
  );
  if (Math.hypot(probe.x - prismPos.x, probe.y - prismPos.y) < 48) {
    baseAngle = centerAngle;
  }

  const rawPoints = SPLIT_OFFSETS.map((offset, idx) => {
    const angle = baseAngle + offset;
    const dist = baseDist * SPLIT_DIST_FACTORS[idx];
    return clampPoint(
      prismPos.x + Math.cos(angle) * dist,
      prismPos.y + Math.sin(angle) * dist,
      safeW,
      safeH,
      margin,
    );
  });

  // Safety guarantee: ensure all 3 coordinates stay strictly distinct even in narrow viewports.
  const minSeparation = Math.min(24, Math.min(safeW, safeH) * 0.15);
  for (let i = 0; i < rawPoints.length; i++) {
    for (let j = 0; j < i; j++) {
      const sep = Math.hypot(rawPoints[i].x - rawPoints[j].x, rawPoints[i].y - rawPoints[j].y);
      if (sep < minSeparation) {
        const fallbackAngle = centerAngle + (i - 1) * 0.9;
        const fallbackDist = Math.max(40, Math.min(safeW, safeH) * 0.22);
        rawPoints[i] = clampPoint(
          safeW * 0.5 + Math.cos(fallbackAngle) * fallbackDist,
          safeH * 0.5 + Math.sin(fallbackAngle) * fallbackDist,
          safeW,
          safeH,
          margin,
        );
      }
    }
  }

  const targets: LaserTarget[] = rawPoints.map((pt, idx) => ({
    id: `prism-${idx}`,
    x: pt.x,
    y: pt.y,
    color: SPLIT_COLORS[idx],
    isSplitBeam: true,
  }));

  return { splitActive: true, targets };
}

/**
 * Deterministic modular partitioning of cats across active laser beams without state locks.
 */
export function assignCatToLaserTarget(
  catIndex: number,
  targets: readonly LaserTarget[],
): LaserTarget | null {
  if (targets.length === 0) {
    return null;
  }
  const safeIndex = Number.isFinite(catIndex) ? Math.floor(catIndex) : 0;
  const idx = ((safeIndex % targets.length) + targets.length) % targets.length;
  return targets[idx];
}

/**
 * Checks whether input inactivity has reached the idle-nap threshold (default 300s).
 */
export function shouldEnterIdleNap(
  idleSeconds: number,
  thresholdSeconds = IDLE_NAP_SECONDS,
): boolean {
  if (!Number.isFinite(idleSeconds) || !Number.isFinite(thresholdSeconds)) {
    return false;
  }
  return idleSeconds >= thresholdSeconds;
}
