import { Container, Sprite, Texture } from 'pixi.js';
import { computeIconSdfGrid, sampleIconSdf, type IconSdfBounds } from '../core/IconFieldSdf';
import type { AabbRect, SceneTheme } from '../types/simulation';
import type { EffectiveLightingMode } from './LightingOverlay';
import { SCENE_THEME_DEFS, smoothstep } from './SceneThemes';

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

/**
 * Iconscape-inspired coalesced organic floor mats underneath desktop icons.
 * Uses a persistent offscreen canvas, ImageData, and single PixiJS Texture per viewport
 * with dirty-rect clearing and a zero-interpolation fast drag pass.
 */
export class IconMatsOverlay extends Container {
  private readonly sprite: Sprite;
  private cachedTexture: Texture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private cw = 0;
  private ch = 0;

  private viewWidth: number;
  private viewHeight: number;
  private icons: readonly AabbRect[] = [];
  private prevDirtyCssRect: IconSdfBounds | null = null;
  private theme: SceneTheme;
  private lightingMode: EffectiveLightingMode = 'golden';

  constructor(width: number, height: number, theme: SceneTheme = 'study') {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;
    this.theme = theme;

    this.viewWidth = Math.max(1, Math.round(width));
    this.viewHeight = Math.max(1, Math.round(height));

    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.visible = false;
    this.addChild(this.sprite);

    this.initSurface(this.viewWidth, this.viewHeight);
  }

  setIcons(icons: readonly AabbRect[], options?: { fast?: boolean }): void {
    this.icons = icons.map((icon) => ({ ...icon }));
    this.renderMats(options?.fast === true);
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme) {
      return;
    }
    this.theme = theme;
    this.applyLightingTint();
    if (this.icons.length > 0) {
      this.renderMats(false);
    }
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.viewWidth && h === this.viewHeight && this.cachedTexture !== null) {
      return;
    }
    this.viewWidth = w;
    this.viewHeight = h;
    this.initSurface(w, h);
    if (this.icons.length > 0) {
      this.renderMats(false);
    } else {
      this.sprite.visible = false;
    }
  }

  setLighting(mode: EffectiveLightingMode): void {
    this.lightingMode = mode;
    this.applyLightingTint();
  }

  private applyLightingTint(): void {
    if (this.lightingMode === 'night') {
      const matCfg = SCENE_THEME_DEFS[this.theme].mat;
      this.sprite.tint = matCfg.nightTint;
      this.sprite.alpha = matCfg.nightAlpha;
    } else {
      this.sprite.tint = 0xffffff;
      this.sprite.alpha = 1;
    }
  }

  private initSurface(w: number, h: number): void {
    const oldTexture = this.cachedTexture;

    this.cw = Math.max(1, Math.ceil(w / CANVAS_STEP));
    this.ch = Math.max(1, Math.ceil(h / CANVAS_STEP));

    const canvas = document.createElement('canvas');
    canvas.width = this.cw;
    canvas.height = this.ch;
    const ctx = canvas.getContext('2d');

    this.canvas = canvas;
    this.ctx = ctx;
    this.imageData = ctx ? ctx.createImageData(this.cw, this.ch) : null;

    const nextTexture = Texture.from(canvas, true);
    this.cachedTexture = nextTexture;
    this.sprite.texture = nextTexture;
    this.sprite.width = this.cw * CANVAS_STEP;
    this.sprite.height = this.ch * CANVAS_STEP;
    this.prevDirtyCssRect = null;

    if (oldTexture && oldTexture !== Texture.EMPTY) {
      oldTexture.destroy(true);
    }
  }

  private clearPreviousDirtyRect(): void {
    if (!this.prevDirtyCssRect || !this.ctx || !this.imageData || !this.cachedTexture) {
      this.prevDirtyCssRect = null;
      return;
    }

    const cw = this.cw;
    const ch = this.ch;
    const c0 = Math.max(0, Math.floor(this.prevDirtyCssRect.minX / CANVAS_STEP));
    const c1 = Math.min(cw - 1, Math.floor(this.prevDirtyCssRect.maxX / CANVAS_STEP));
    const r0 = Math.max(0, Math.floor(this.prevDirtyCssRect.minY / CANVAS_STEP));
    const r1 = Math.min(ch - 1, Math.floor(this.prevDirtyCssRect.maxY / CANVAS_STEP));

    if (c0 <= c1 && r0 <= r1) {
      const data = this.imageData.data;
      const rowByteLen = (c1 - c0 + 1) * 4;
      for (let y = r0; y <= r1; y++) {
        const start = (y * cw + c0) * 4;
        data.fill(0, start, start + rowByteLen);
      }
      this.ctx.putImageData(this.imageData, 0, 0, c0, r0, c1 - c0 + 1, r1 - r0 + 1);
      this.cachedTexture.source.update();
    }

    this.prevDirtyCssRect = null;
  }

  private renderMats(fast: boolean): void {
    if (!this.ctx || !this.imageData || !this.cachedTexture) {
      return;
    }

    if (this.icons.length === 0) {
      this.clearPreviousDirtyRect();
      this.sprite.visible = false;
      return;
    }

    const w = this.viewWidth;
    const h = this.viewHeight;
    const cw = this.cw;
    const ch = this.ch;

    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < this.icons.length; i++) {
      const icon = this.icons[i];
      if (icon.x < minX) minX = icon.x;
      if (icon.y < minY) minY = icon.y;
      if (icon.x + icon.width > maxX) maxX = icon.x + icon.width;
      if (icon.y + icon.height > maxY) maxY = icon.y + icon.height;
    }

    const newBounds: IconSdfBounds = {
      minX: Math.max(0, Math.floor(minX - DIRTY_MARGIN)),
      minY: Math.max(0, Math.floor(minY - DIRTY_MARGIN)),
      maxX: Math.min(w, Math.ceil(maxX + DIRTY_MARGIN)),
      maxY: Math.min(h, Math.ceil(maxY + DIRTY_MARGIN)),
    };

    if (newBounds.minX >= newBounds.maxX || newBounds.minY >= newBounds.maxY) {
      this.clearPreviousDirtyRect();
      this.sprite.visible = false;
      return;
    }

    const clearBounds: IconSdfBounds = this.prevDirtyCssRect
      ? {
          minX: Math.max(0, Math.min(this.prevDirtyCssRect.minX, newBounds.minX)),
          minY: Math.max(0, Math.min(this.prevDirtyCssRect.minY, newBounds.minY)),
          maxX: Math.min(w, Math.max(this.prevDirtyCssRect.maxX, newBounds.maxX)),
          maxY: Math.min(h, Math.max(this.prevDirtyCssRect.maxY, newBounds.maxY)),
        }
      : newBounds;

    const c0 = Math.max(0, Math.floor(clearBounds.minX / CANVAS_STEP));
    const c1 = Math.min(cw - 1, Math.floor(clearBounds.maxX / CANVAS_STEP));
    const r0 = Math.max(0, Math.floor(clearBounds.minY / CANVAS_STEP));
    const r1 = Math.min(ch - 1, Math.floor(clearBounds.maxY / CANVAS_STEP));

    if (c0 > c1 || r0 > r1) {
      return;
    }

    const data = this.imageData.data;
    const rowByteLen = (c1 - c0 + 1) * 4;
    for (let y = r0; y <= r1; y++) {
      const start = (y * cw + c0) * 4;
      data.fill(0, start, start + rowByteLen);
    }

    const sdfGrid = computeIconSdfGrid(this.icons, w, h, {
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

    if (fast) {
      this.paintFastDragBlocks(data, cw, sdfGrid, nc0, nc1, nr0, nr1);
    } else {
      this.paintCrispThemeMats(data, cw, sdfGrid, nc0, nc1, nr0, nr1);
    }

    this.ctx.putImageData(this.imageData, 0, 0, c0, r0, c1 - c0 + 1, r1 - r0 + 1);
    this.cachedTexture.source.update();
    this.sprite.visible = true;
    this.prevDirtyCssRect = newBounds;
  }

  private paintFastDragBlocks(
    data: Uint8ClampedArray,
    cw: number,
    sdfGrid: ReturnType<typeof computeIconSdfGrid>,
    nc0: number,
    nc1: number,
    nr0: number,
    nr1: number,
  ): void {
    const matCfg = SCENE_THEME_DEFS[this.theme].mat;
    const { r: cr, g: cg, b: cb } = matCfg.centerRgb;
    const { r: er, g: eg, b: eb } = matCfg.edgeRgb;
    const { r: br, g: bg, b: bb } = matCfg.borderRgb;
    const { r: sr, g: sg, b: sb } = matCfg.shadowRgb;
    const isGarden = this.theme === 'garden';

    const sdfValues = sdfGrid.values;
    const sdfCols = sdfGrid.cols;
    const sdfRows = sdfGrid.rows;
    const sdfMinCol = Math.max(0, nc0 >> 1);
    const sdfMaxCol = Math.min(sdfCols - 1, nc1 >> 1);
    const sdfMinRow = Math.max(0, nr0 >> 1);
    const sdfMaxRow = Math.min(sdfRows - 1, nr1 >> 1);

    for (let sdfRow = sdfMinRow; sdfRow <= sdfMaxRow; sdfRow++) {
      const cy0 = sdfRow * 2;
      const yStart = cy0 < nr0 ? nr0 : cy0;
      const yEnd = cy0 + 1 > nr1 ? nr1 : cy0 + 1;
      const sdfRowOff = sdfRow * sdfCols;

      for (let sdfCol = sdfMinCol; sdfCol <= sdfMaxCol; sdfCol++) {
        const sdfIdx = sdfRowOff + sdfCol;
        const d = sdfValues[sdfIdx];
        if (d > 20.5) continue;

        let outR: number;
        let outG: number;
        let outB: number;
        let outA: number;

        if (d > 6) {
          const t = 1 - (d - 6) / 14;
          outR = sr;
          outG = sg;
          outB = sb;
          outA = Math.round(t * t * 0.34 * 255);
        } else {
          const matCoverage = 1 - smoothstep(4.6, 6.0, d);
          const edgeMix = smoothstep(-8, 5.5, d);
          let r = cr + (er - cr) * edgeMix;
          let g = cg + (eg - cg) * edgeMix;
          let b = cb + (eb - cb) * edgeMix;

          // Direct finite difference from immediate SDF neighbors (zero sampleIconSdf calls)
          if (sdfCol > 0 && sdfCol < sdfCols - 1 && sdfRow > 0 && sdfRow < sdfRows - 1) {
            const dL = sdfValues[sdfIdx - 1];
            const dR = sdfValues[sdfIdx + 1];
            const dU = sdfValues[sdfIdx - sdfCols];
            const dD = sdfValues[sdfIdx + sdfCols];
            if (dL < 1000 && dR < 1000 && dU < 1000 && dD < 1000) {
              const bevel = (dR - dL + (dD - dU)) * 0.55;
              r += bevel;
              g += bevel * 0.92;
              b += bevel * 0.85;
            }
          }

          if (isGarden) {
            if (d > 0.8 && d <= 5.4) {
              const mossMix = (1 - Math.abs(d - 3.1) / 2.3) * 0.72;
              if (mossMix > 0) {
                r += (br - r) * mossMix;
                g += (bg - g) * mossMix;
                b += (bb - b) * mossMix;
              }
            }
          } else {
            if (d > 2.2 && d < 4.8) {
              const rim = 1 - Math.abs(d - 3.5) / 1.3;
              r += rim * 7;
              g += rim * 6;
              b += rim * 4;
            }
            if (d >= -4.0 && d <= -1.6) {
              const borderMix = (1 - Math.abs(d + 2.8) / 1.2) * 0.55;
              r += (br - r) * borderMix;
              g += (bg - g) * borderMix;
              b += (bb - b) * borderMix;
            }
          }

          const finalAlpha = matCoverage * 0.94 + (1 - matCoverage) * 0.34;
          outR = Math.max(0, Math.min(255, Math.round(r * matCoverage + sr * (1 - matCoverage))));
          outG = Math.max(0, Math.min(255, Math.round(g * matCoverage + sg * (1 - matCoverage))));
          outB = Math.max(0, Math.min(255, Math.round(b * matCoverage + sb * (1 - matCoverage))));
          outA = Math.round(finalAlpha * 255);
        }

        const cx0 = sdfCol * 2;
        const xStart = cx0 < nc0 ? nc0 : cx0;
        const xEnd = cx0 + 1 > nc1 ? nc1 : cx0 + 1;

        for (let py = yStart; py <= yEnd; py++) {
          const rowBase = py * cw;
          for (let px = xStart; px <= xEnd; px++) {
            const pIdx = (rowBase + px) * 4;
            data[pIdx] = outR;
            data[pIdx + 1] = outG;
            data[pIdx + 2] = outB;
            data[pIdx + 3] = outA;
          }
        }
      }
    }
  }

  private paintCrispThemeMats(
    data: Uint8ClampedArray,
    cw: number,
    sdfGrid: ReturnType<typeof computeIconSdfGrid>,
    nc0: number,
    nc1: number,
    nr0: number,
    nr1: number,
  ): void {
    const matCfg = SCENE_THEME_DEFS[this.theme].mat;
    const { r: cr, g: cg, b: cb } = matCfg.centerRgb;
    const { r: er, g: eg, b: eb } = matCfg.edgeRgb;
    const { r: br, g: bg, b: bb } = matCfg.borderRgb;
    const { r: ar, g: ag, b: ab } = matCfg.accentRgb;
    const { r: sr, g: sg, b: sb } = matCfg.shadowRgb;
    const theme = this.theme;

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
          data[idx] = sr;
          data[idx + 1] = sg;
          data[idx + 2] = sb;
          data[idx + 3] = Math.round(shadowAlpha * 255);
          continue;
        }

        const matCoverage = 1 - smoothstep(4.6, 6.0, d);
        const edgeMix = smoothstep(-8, 5.5, d);
        let r = cr + (er - cr) * edgeMix;
        let g = cg + (eg - cg) * edgeMix;
        let b = cb + (eb - cb) * edgeMix;

        const hash = pixelHash(cx, cy);

        if (theme === 'tatami') {
          // Cedar-bamboo horizontal slat tray texture + cane node joints
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

          // Roasted cedar beveled rim
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

          // Woven bamboo cord lashing seam inside rim
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
          // Smooth river-stone mineral grain
          const grain = (hash - 0.5) * 12;
          r += grain;
          g += grain * 0.96;
          b += grain * 0.9;

          // Subtle stone bevel highlight
          if (d > -0.5 && d < 2.2) {
            const highlight = (1 - Math.abs(d - 0.85) / 1.35) * 11;
            r += highlight;
            g += highlight;
            b += highlight * 0.9;
          }

          // Carved inner hairline stone groove
          if (d >= -4.6 && d <= -2.4) {
            const carve = (1 - Math.abs(d + 3.5) / 1.1) * 0.28;
            r -= 24 * carve;
            g -= 24 * carve;
            b -= 22 * carve;
          }

          // Velvety organic emerald-moss rim clinging around stepping-stone edge
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
          // Honed cream terrazzo coaster with deterministic multi-colored stone aggregate chips
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
              // Terracotta fleck
              r = 196;
              g = 122;
              b = 92;
            } else if (chipKind === 1) {
              // Sage fleck
              r = 118;
              g = 146;
              b = 118;
            } else if (chipKind === 2) {
              // Espresso fleck
              r = 104;
              g = 82;
              b = 66;
            } else {
              // Warm ochre fleck
              r = 212;
              g = 166;
              b = 98;
            }
          }

          // Smooth coaster rim highlight
          if (d > 2.2 && d < 4.9) {
            const rim = (1 - Math.abs(d - 3.55) / 1.35) * 10;
            r += (ar - r) * 0.25 + rim * 0.4;
            g += (ag - g) * 0.25 + rim * 0.4;
            b += (ab - b) * 0.25 + rim * 0.4;
          }

          // Fine warm brass/taupe coaster inlay ring
          if (d >= -4.0 && d <= -1.7) {
            const ring = (1 - Math.abs(d + 2.85) / 1.15) * 0.56;
            r += (br - r) * ring;
            g += (bg - g) * ring;
            b += (bb - b) * ring;
          }
        } else {
          // 'study': warm stitched cork & woven felt grain
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
        data[idx] = Math.max(0, Math.min(255, Math.round(r * matCoverage + sr * (1 - matCoverage))));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * matCoverage + sg * (1 - matCoverage))));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * matCoverage + sb * (1 - matCoverage))));
        data[idx + 3] = Math.round(finalAlpha * 255);
      }
    }
  }

  override destroy(): void {
    if (this.cachedTexture && this.cachedTexture !== Texture.EMPTY) {
      this.cachedTexture.destroy(true);
      this.cachedTexture = null;
    }
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
    super.destroy({ children: true });
  }
}
