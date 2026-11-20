import type { AabbRect } from '../types/simulation';
import { PerlinNoise } from './PerlinNoise';

export interface IconSdfBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface IconSdfDirtyBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export interface IconSdfGrid {
  cols: number;
  rows: number;
  step: number;
  width: number;
  height: number;
  values: Float32Array;
  dirtyBounds?: IconSdfDirtyBounds;
}

export interface IconSdfOptions {
  step?: number;
  blendK?: number;
  padding?: number;
  roundness?: number;
  warpAmp?: number;
  seed?: number;
  bounds?: IconSdfBounds;
}

interface PaddedBox {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  bx: number;
  by: number;
  r: number;
}

const MAX_WARP_CACHE_ENTRIES = 4;
const FAR_DISTANCE = 2000;
const warpCache = new Map<string, Float32Array>();

/**
 * Clears the cached static FBM warp fields (primarily useful for deterministic tests).
 */
export function clearIconSdfWarpCache(): void {
  warpCache.clear();
}

function getOrCreateWarpField(
  cols: number,
  rows: number,
  step: number,
  seed: number,
  warpAmp: number,
): Float32Array {
  const normalizedSeed = seed === 0 ? 0 : seed;
  const key = `${cols}:${rows}:${step}:${normalizedSeed}:${warpAmp}`;
  const cached = warpCache.get(key);
  if (cached) {
    // Refresh LRU order on hit.
    warpCache.delete(key);
    warpCache.set(key, cached);
    return cached;
  }

  const warp = new Float32Array(cols * rows);
  const noise = new PerlinNoise(seed);
  for (let row = 0; row < rows; row++) {
    const py = row * step;
    const rowOffset = row * cols;
    for (let col = 0; col < cols; col++) {
      const px = col * step;
      warp[rowOffset + col] = noise.fbm2D(px * 0.018, py * 0.018, 2) * warpAmp;
    }
  }

  if (warpCache.size >= MAX_WARP_CACHE_ENTRIES) {
    const oldestKey = warpCache.keys().next().value;
    if (oldestKey !== undefined) {
      warpCache.delete(oldestKey);
    }
  }
  warpCache.set(key, warp);
  return warp;
}

/**
 * Computes a downsampled 2D rounded-box signed distance field over desktop icon AABBs
 * with polynomial smooth-union blending, cached static FBM edge warping, and bounded fast-skip.
 */
export function computeIconSdfGrid(
  icons: readonly AabbRect[],
  width: number,
  height: number,
  options?: IconSdfOptions,
): IconSdfGrid {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const step = Math.max(1, Math.floor(Number.isFinite(options?.step) ? (options?.step as number) : 4));
  const blendK = Math.max(0, Number.isFinite(options?.blendK) ? (options?.blendK as number) : 30);
  const padding = Number.isFinite(options?.padding) ? (options?.padding as number) : 12;
  const roundness = Math.max(
    0,
    Math.min(1, Number.isFinite(options?.roundness) ? (options?.roundness as number) : 0.45),
  );
  const warpAmp = Math.max(0, Number.isFinite(options?.warpAmp) ? (options?.warpAmp as number) : 4);
  const seed = Number.isFinite(options?.seed) ? (options?.seed as number) : 17;

  const cols = Math.max(2, Math.ceil(safeWidth / step) + 1);
  const rows = Math.max(2, Math.ceil(safeHeight / step) + 1);
  const values = new Float32Array(cols * rows);
  values.fill(FAR_DISTANCE);

  if (icons.length === 0) {
    return { cols, rows, step, width: safeWidth, height: safeHeight, values };
  }

  let unionMinX = Infinity;
  let unionMinY = Infinity;
  let unionMaxX = -Infinity;
  let unionMaxY = -Infinity;

  const boxCount = icons.length;
  const boxes: PaddedBox[] = new Array(boxCount);
  for (let i = 0; i < boxCount; i++) {
    const icon = icons[i];
    if (icon.x < unionMinX) unionMinX = icon.x;
    if (icon.y < unionMinY) unionMinY = icon.y;
    if (icon.x + icon.width > unionMaxX) unionMaxX = icon.x + icon.width;
    if (icon.y + icon.height > unionMaxY) unionMaxY = icon.y + icon.height;

    const hx = Math.max(1, icon.width * 0.5 + padding);
    const hy = Math.max(1, icon.height * 0.5 + padding);
    const r = Math.min(hx, hy) * roundness;
    boxes[i] = {
      cx: icon.x + icon.width * 0.5,
      cy: icon.y + icon.height * 0.5,
      hx,
      hy,
      bx: hx - r,
      by: hy - r,
      r,
    };
  }

  const expand = Math.max(0, padding) + blendK + warpAmp + 24;
  let activeMinX = unionMinX - expand;
  let activeMinY = unionMinY - expand;
  let activeMaxX = unionMaxX + expand;
  let activeMaxY = unionMaxY + expand;

  if (options?.bounds) {
    const b = options.bounds;
    if (Number.isFinite(b.minX)) activeMinX = Math.max(activeMinX, b.minX);
    if (Number.isFinite(b.minY)) activeMinY = Math.max(activeMinY, b.minY);
    if (Number.isFinite(b.maxX)) activeMaxX = Math.min(activeMaxX, b.maxX);
    if (Number.isFinite(b.maxY)) activeMaxY = Math.min(activeMaxY, b.maxY);
  }

  if (activeMinX > activeMaxX || activeMinY > activeMaxY) {
    return { cols, rows, step, width: safeWidth, height: safeHeight, values };
  }

  const minCol = Math.max(0, Math.floor(activeMinX / step));
  const maxCol = Math.min(cols - 1, Math.ceil(activeMaxX / step));
  const minRow = Math.max(0, Math.floor(activeMinY / step));
  const maxRow = Math.min(rows - 1, Math.ceil(activeMaxY / step));

  if (minCol > maxCol || minRow > maxRow) {
    return { cols, rows, step, width: safeWidth, height: safeHeight, values };
  }

  const warp = warpAmp > 0 ? getOrCreateWarpField(cols, rows, step, seed, warpAmp) : null;

  for (let row = minRow; row <= maxRow; row++) {
    const py = row * step;
    const rowOffset = row * cols;

    for (let col = minCol; col <= maxCol; col++) {
      const px = col * step;

      let d = 1e6;
      for (let i = 0; i < boxCount; i++) {
        const b = boxes[i];
        const dx = px >= b.cx ? px - b.cx : b.cx - px;
        const dy = py >= b.cy ? py - b.cy : b.cy - py;

        // Skip distant boxes that cannot affect the smooth-min result.
        if (i > 0) {
          const lInf = dx - b.hx > dy - b.hy ? dx - b.hx : dy - b.hy;
          if (lInf >= d + blendK) {
            continue;
          }
        }

        const qx = dx - b.bx;
        const qy = dy - b.by;
        const ox = qx > 0 ? qx : 0;
        const oy = qy > 0 ? qy : 0;
        const insideDist = qx > qy ? (qx < 0 ? qx : 0) : (qy < 0 ? qy : 0);
        const sd = Math.sqrt(ox * ox + oy * oy) + insideDist - b.r;

        if (i === 0) {
          d = sd;
        } else if (blendK > 0) {
          const diff = d >= sd ? d - sd : sd - d;
          if (diff < blendK) {
            const hh = (blendK - diff) / blendK;
            d = (d < sd ? d : sd) - hh * hh * blendK * 0.25;
          } else if (sd < d) {
            d = sd;
          }
        } else if (sd < d) {
          d = sd;
        }
      }

      const idx = rowOffset + col;
      values[idx] = warp ? d + warp[idx] : d;
    }
  }

  return {
    cols,
    rows,
    step,
    width: safeWidth,
    height: safeHeight,
    values,
    dirtyBounds: { minCol, maxCol, minRow, maxRow },
  };
}

/**
 * Samples the SDF grid at arbitrary world coordinates using bilinear interpolation.
 */
export function sampleIconSdf(grid: IconSdfGrid, x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || grid.values.length === 0) {
    return 2000;
  }

  const gx = Math.max(0, Math.min(x / grid.step, grid.cols - 1));
  const gy = Math.max(0, Math.min(y / grid.step, grid.rows - 1));

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, grid.cols - 1);
  const y1 = Math.min(y0 + 1, grid.rows - 1);

  const tx = gx - x0;
  const ty = gy - y0;

  const row0 = y0 * grid.cols;
  const row1 = y1 * grid.cols;

  const v00 = grid.values[row0 + x0];
  const v10 = grid.values[row0 + x1];
  const v01 = grid.values[row1 + x0];
  const v11 = grid.values[row1 + x1];

  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}
