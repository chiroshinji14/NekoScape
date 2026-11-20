import { computeIconSdfGrid, sampleIconSdf, type IconSdfBounds } from '../core/IconFieldSdf';
import type { AabbRect, SceneTheme } from '../types/simulation';
import { SCENE_THEME_DEFS, smoothstep } from './SceneThemes';

export interface IconMatsWorkerRequest {
  jobId: number;
  icons: AabbRect[];
  viewWidth: number;
  viewHeight: number;
  cw: number;
  ch: number;
  theme: SceneTheme;
}

export interface IconMatsWorkerResponse {
  jobId: number;
  cw: number;
  ch: number;
  theme: SceneTheme;
  pixelsBuffer: ArrayBuffer;
  hasIcons: boolean;
}

const CANVAS_STEP = 2;
const DIRTY_MARGIN = 48;

function pixelHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothCellNoise(cx: number, cy: number, cellSize: number): number {
  const gx = Math.floor(cx / cellSize);
  const gy = Math.floor(cy / cellSize);
  const fx = (cx - gx * cellSize) / cellSize;
  const fy = (cy - gy * cellSize) / cellSize;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const n00 = pixelHash(gx, gy);
  const n10 = pixelHash(gx + 1, gy);
  const n01 = pixelHash(gx, gy + 1);
  const n11 = pixelHash(gx + 1, gy + 1);
  const top = n00 + (n10 - n00) * u;
  const bot = n01 + (n11 - n01) * u;
  return top + (bot - top) * v;
}

export function rasterizeCrispIconMatsBuffer(
  icons: readonly AabbRect[],
  viewWidth: number,
  viewHeight: number,
  cw: number,
  ch: number,
  theme: SceneTheme,
): { pixels: Uint8ClampedArray; hasIcons: boolean } {
  const pixels = new Uint8ClampedArray(cw * ch * 4);
  if (icons.length === 0) {
    return { pixels, hasIcons: false };
  }

  let minX = viewWidth;
  let minY = viewHeight;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];
    if (icon.x < minX) minX = icon.x;
    if (icon.y < minY) minY = icon.y;
    if (icon.x + icon.width > maxX) maxX = icon.x + icon.width;
    if (icon.y + icon.height > maxY) maxY = icon.y + icon.height;
  }

  const newBounds: IconSdfBounds = {
    minX: Math.max(0, Math.floor(minX - DIRTY_MARGIN)),
    minY: Math.max(0, Math.floor(minY - DIRTY_MARGIN)),
    maxX: Math.min(viewWidth, Math.ceil(maxX + DIRTY_MARGIN)),
    maxY: Math.min(viewHeight, Math.ceil(maxY + DIRTY_MARGIN)),
  };

  if (newBounds.minX >= newBounds.maxX || newBounds.minY >= newBounds.maxY) {
    return { pixels, hasIcons: false };
  }

  const sdfGrid = computeIconSdfGrid(icons, viewWidth, viewHeight, {
    step: 4,
    blendK: 30,
    padding: 12,
    roundness: 0.45,
    warpAmp: 4,
    seed: 17,
    bounds: newBounds,
  });

  const nc0 = Math.max(0, Math.floor(newBounds.minX / CANVAS_STEP));
  const nc1 = Math.min(cw - 1, Math.floor(newBounds.maxX / CANVAS_STEP));
  const nr0 = Math.max(0, Math.floor(newBounds.minY / CANVAS_STEP));
  const nr1 = Math.min(ch - 1, Math.floor(newBounds.maxY / CANVAS_STEP));

  const matCfg = SCENE_THEME_DEFS[theme].mat;
  const { r: cr, g: cg, b: cb } = matCfg.centerRgb;
  const { r: er, g: eg, b: eb } = matCfg.edgeRgb;
  const { r: br, g: bg, b: bb } = matCfg.borderRgb;
  const { r: ar, g: ag, b: ab } = matCfg.accentRgb;
  const { r: sr, g: sg, b: sb } = matCfg.shadowRgb;

  for (let cy = nr0; cy <= nr1; cy++) {
    const worldY = (cy + 0.5) * CANVAS_STEP;
    const rowBase = cy * cw;

    for (let cx = nc0; cx <= nc1; cx++) {
      const worldX = (cx + 0.5) * CANVAS_STEP;
      const d = sampleIconSdf(sdfGrid, worldX, worldY);
      if (d > 20.5) continue;

      const idx = (rowBase + cx) * 4;

      if (d > 6) {
        const t = 1 - (d - 6) / 14;
        const shadowAlpha = t * t * 0.34;
        pixels[idx] = sr;
        pixels[idx + 1] = sg;
        pixels[idx + 2] = sb;
        pixels[idx + 3] = Math.round(shadowAlpha * 255);
        continue;
      }

      const matCoverage = 1 - smoothstep(4.6, 6.0, d);
      const edgeMix = smoothstep(-8, 5.5, d);
      let r = cr + (er - cr) * edgeMix;
      let g = cg + (eg - cg) * edgeMix;
      let b = cb + (eb - cb) * edgeMix;

      const hash = pixelHash(cx, cy);

      if (theme === 'tatami') {
        const slatMod = cy % 5;
        if (slatMod === 0) {
          r -= 20;
          g -= 18;
          b -= 14;
        } else if (slatMod === 1) {
          r += 8;
          g += 7;
          b += 5;
        }
        const slatIdx = Math.floor(cy / 5);
        const nodeX = Math.floor(pixelHash(slatIdx, 97) * 42) + 18;
        if (cx % 64 === nodeX && slatMod >= 1 && slatMod <= 4) {
          r -= 16;
          g -= 14;
          b -= 10;
        }
        r += (hash - 0.5) * 6;
        g += (hash - 0.5) * 5;
        b += (hash - 0.5) * 4;

        if (d > 1.2 && d <= 5.5) {
          const rimMix = smoothstep(1.2, 3.8, d) * 0.72;
          r += (br - r) * rimMix;
          g += (bg - g) * rimMix;
          b += (bb - b) * rimMix;
          if (d > 1.6 && d < 3.4) {
            r += 10;
            g += 8;
            b += 5;
          }
        }

        if (d >= -4.2 && d <= -1.4) {
          const seam = 1 - Math.abs(d + 2.8) / 1.4;
          if (seam > 0) {
            const gx =
              sampleIconSdf(sdfGrid, worldX + 2, worldY) -
              sampleIconSdf(sdfGrid, worldX - 2, worldY);
            const gy =
              sampleIconSdf(sdfGrid, worldX, worldY + 2) -
              sampleIconSdf(sdfGrid, worldX, worldY - 2);
            const coord = Math.abs(gx) > Math.abs(gy) ? worldY : worldX;
            const lash = smoothstep(-0.15, 0.35, Math.sin(coord * 0.45));
            const mix = seam * lash * 0.65;
            r += (br - r) * mix;
            g += (bg - g) * mix;
            b += (bb - b) * mix;
          }
        }
      } else if (theme === 'garden') {
        const grain = (hash - 0.5) * 12;
        r += grain;
        g += grain * 0.96;
        b += grain * 0.9;

        if (d > -0.5 && d < 2.2) {
          const highlight = (1 - Math.abs(d - 0.85) / 1.35) * 11;
          r += highlight;
          g += highlight;
          b += highlight * 0.9;
        }

        if (d >= -4.6 && d <= -2.4) {
          const carve = (1 - Math.abs(d + 3.5) / 1.1) * 0.28;
          r -= 24 * carve;
          g -= 24 * carve;
          b -= 22 * carve;
        }

        const mossNoise =
          smoothCellNoise(cx, cy, 8) * 0.65 + smoothCellNoise(cx + 19, cy + 31, 4) * 0.35;
        const mossThreshold = 0.4 + (mossNoise - 0.5) * 3.4;
        if (d >= mossThreshold) {
          const mossDepth = smoothstep(mossThreshold, mossThreshold + 1.8, d);
          const mossVar = (hash - 0.5) * 18;
          const mr = br + mossVar * 0.6;
          const mg = bg + 14 * mossNoise + mossVar * 0.8;
          const mb = bb + mossVar * 0.4;
          const mossMix = mossDepth * 0.9;
          r += (mr - r) * mossMix;
          g += (mg - g) * mossMix;
          b += (mb - b) * mossMix;
        }
      } else if (theme === 'cafe') {
        const grain = (hash - 0.5) * 6;
        r += grain;
        g += grain * 0.95;
        b += grain * 0.9;

        const cellSize = 7;
        const cellX = Math.floor(cx / cellSize);
        const cellY = Math.floor(cy / cellSize);
        const chipHx = pixelHash(cellX * 3 + 1, cellY * 5 + 7);
        const chipHy = pixelHash(cellX * 7 + 11, cellY * 2 + 13);
        const chipCx = cellX * cellSize + 1.5 + chipHx * (cellSize - 3);
        const chipCy = cellY * cellSize + 1.5 + chipHy * (cellSize - 3);
        const dx = cx - chipCx;
        const dy = cy - chipCy;
        const chipR = 1.05 + pixelHash(cellX + 29, cellY + 41) * 1.25;
        if (dx * dx + dy * dy <= chipR * chipR) {
          const chipKind = Math.floor(pixelHash(cellX * 13, cellY * 17) * 4);
          if (chipKind === 0) {
            r = 196;
            g = 122;
            b = 92;
          } else if (chipKind === 1) {
            r = 118;
            g = 146;
            b = 118;
          } else if (chipKind === 2) {
            r = 104;
            g = 82;
            b = 66;
          } else {
            r = 212;
            g = 166;
            b = 98;
          }
        }

        if (d > 2.2 && d < 4.9) {
          const rim = (1 - Math.abs(d - 3.55) / 1.35) * 10;
          r += (ar - r) * 0.25 + rim * 0.4;
          g += (ag - g) * 0.25 + rim * 0.4;
          b += (ab - b) * 0.25 + rim * 0.4;
        }

        if (d >= -4.0 && d <= -1.7) {
          const ring = (1 - Math.abs(d + 2.85) / 1.15) * 0.56;
          r += (br - r) * ring;
          g += (bg - g) * ring;
          b += (bb - b) * ring;
        }
      } else {
        const warpThread = (cx & 1) === 0 ? 1 : -1;
        const weftThread = (cy & 1) === 0 ? 1 : -1;
        const weave = warpThread * 2.2 + weftThread * 1.8;
        const grain = (hash - 0.5) * 8 + weave;
        r += grain;
        g += grain * 0.92;
        b += grain * 0.85;

        if (d > 2.2 && d < 4.8) {
          const rim = 1 - Math.abs(d - 3.5) / 1.3;
          r += rim * 7;
          g += rim * 6;
          b += rim * 4;
        }

        if (d >= -4.2 && d <= -1.3) {
          const seamStrength = 1 - Math.abs(d + 2.75) / 1.45;
          if (seamStrength > 0) {
            const gx =
              sampleIconSdf(sdfGrid, worldX + 2, worldY) -
              sampleIconSdf(sdfGrid, worldX - 2, worldY);
            const gy =
              sampleIconSdf(sdfGrid, worldX, worldY + 2) -
              sampleIconSdf(sdfGrid, worldX, worldY - 2);
            const dashCoord = Math.abs(gx) > Math.abs(gy) ? worldY : worldX;
            const dash = smoothstep(-0.08, 0.28, Math.sin(dashCoord * 0.68));
            const stitchMix = seamStrength * dash * 0.72;
            r += (br - r) * stitchMix;
            g += (bg - g) * stitchMix;
            b += (bb - b) * stitchMix;
          }
        }
      }

      const finalAlpha = matCoverage * 0.94 + (1 - matCoverage) * 0.34;
      pixels[idx] = Math.max(0, Math.min(255, Math.round(r * matCoverage + sr * (1 - matCoverage))));
      pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(g * matCoverage + sg * (1 - matCoverage))));
      pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b * matCoverage + sb * (1 - matCoverage))));
      pixels[idx + 3] = Math.round(finalAlpha * 255);
    }
  }

  return { pixels, hasIcons: true };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event: MessageEvent<IconMatsWorkerRequest>) => {
    const req = event.data;
    if (!req || typeof req.jobId !== 'number') {
      return;
    }

    const { pixels, hasIcons } = rasterizeCrispIconMatsBuffer(
      req.icons,
      req.viewWidth,
      req.viewHeight,
      req.cw,
      req.ch,
      req.theme,
    );

    const buffer = pixels.buffer as ArrayBuffer;
    const response: IconMatsWorkerResponse = {
      jobId: req.jobId,
      cw: req.cw,
      ch: req.ch,
      theme: req.theme,
      pixelsBuffer: buffer,
      hasIcons,
    };

    (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
      response,
      [buffer],
    );
  });
}
