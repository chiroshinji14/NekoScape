import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneTheme } from '../types/simulation';
import {
  SCENE_THEME_DEFS,
  createSeededRng,
  shiftHexColor,
  type SceneThemeDefinition,
} from './SceneThemes';

const PLANK_HEIGHT = 52;
const MIN_PLANK_LEN = 240;
const MAX_PLANK_LEN = 420;

interface PlankStyleOptions {
  seed: number;
  plankHeight: number;
  highlightRgba: string;
  grainDarkRgba: string;
  knotChance: number;
  isCoolSlate?: boolean;
  isFrosted?: boolean;
  isStudioPaint?: boolean;
  isAquariumCaustics?: boolean;
}

/**
 * Procedural desktop floor surface cached to an offscreen Canvas2D texture.
 * Supports all 13 switchable NekoScape v2.0 scenes.
 */
export class HardwoodFloor extends Container {
  private readonly sprite: Sprite;
  private cachedTexture: Texture | null = null;
  private floorWidth = 0;
  private floorHeight = 0;
  private theme: SceneTheme;

  constructor(width: number, height: number, theme: SceneTheme = 'study') {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;
    this.theme = theme;
    this.sprite = new Sprite(Texture.EMPTY);
    this.addChild(this.sprite);
    this.resize(width, height);
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme && this.cachedTexture !== null) {
      return;
    }
    this.theme = theme;
    if (this.floorWidth > 0 && this.floorHeight > 0) {
      this.rebuildTexture(this.floorWidth, this.floorHeight);
    }
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.floorWidth && h === this.floorHeight && this.cachedTexture !== null) {
      return;
    }

    this.floorWidth = w;
    this.floorHeight = h;
    this.rebuildTexture(w, h);
  }

  private rebuildTexture(width: number, height: number): void {
    if (typeof document === 'undefined') {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const def = SCENE_THEME_DEFS[this.theme] ?? SCENE_THEME_DEFS.study;

    switch (this.theme) {
      case 'tatami':
        this.paintTatamiFloor(ctx, width, height, def);
        break;
      case 'garden':
        this.paintGardenFloor(ctx, width, height, def);
        break;
      case 'cafe':
        this.paintCafeFloor(ctx, width, height, def);
        break;
      case 'living_room':
        this.paintHerringboneParquetFloor(ctx, width, height, def);
        break;
      case 'rainy_window':
        this.paintPlankFloor(ctx, width, height, def, {
          seed: 51107,
          plankHeight: 48,
          highlightRgba: 'rgba(204, 224, 242, 0.12)',
          grainDarkRgba: 'rgba(34, 42, 50, 0.16)',
          knotChance: 0.14,
          isCoolSlate: true,
        });
        break;
      case 'night_balcony':
        this.paintDeckingFloor(ctx, width, height, def);
        break;
      case 'kitchen':
        this.paintKitchenTileFloor(ctx, width, height, def);
        break;
      case 'bedroom':
        this.paintPlankFloor(ctx, width, height, def, {
          seed: 64219,
          plankHeight: 60,
          highlightRgba: 'rgba(255, 245, 228, 0.16)',
          grainDarkRgba: 'rgba(116, 88, 60, 0.11)',
          knotChance: 0.12,
        });
        break;
      case 'snowy_window':
        this.paintPlankFloor(ctx, width, height, def, {
          seed: 78133,
          plankHeight: 54,
          highlightRgba: 'rgba(242, 250, 255, 0.18)',
          grainDarkRgba: 'rgba(84, 102, 118, 0.14)',
          knotChance: 0.15,
          isFrosted: true,
        });
        break;
      case 'sunbeam':
        this.paintPlankFloor(ctx, width, height, def, {
          seed: 89411,
          plankHeight: 50,
          highlightRgba: 'rgba(255, 240, 200, 0.17)',
          grainDarkRgba: 'rgba(104, 68, 34, 0.12)',
          knotChance: 0.1,
          isStudioPaint: true,
        });
        break;
      case 'aquarium':
        this.paintPlankFloor(ctx, width, height, def, {
          seed: 93701,
          plankHeight: 52,
          highlightRgba: 'rgba(130, 218, 232, 0.09)',
          grainDarkRgba: 'rgba(18, 22, 28, 0.22)',
          knotChance: 0.1,
          isAquariumCaustics: true,
        });
        break;
      case 'rooftop':
        this.paintRooftopPaverFloor(ctx, width, height, def);
        break;
      case 'study':
      default:
        this.paintStudyFloor(ctx, width, height, def);
        break;
    }

    // Top-left ambient daylight falloff
    const sunGrad = ctx.createRadialGradient(
      width * 0.14,
      height * 0.1,
      Math.min(width, height) * 0.04,
      width * 0.34,
      height * 0.32,
      Math.max(width, height) * 0.85,
    );
    sunGrad.addColorStop(0, def.floor.sunTintRgba[0]);
    sunGrad.addColorStop(0.45, def.floor.sunTintRgba[1]);
    sunGrad.addColorStop(1, def.floor.sunTintRgba[2]);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle radial vignette around edges so desktop icons and cats stay crisp
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.3,
      width * 0.5,
      height * 0.5,
      Math.hypot(width, height) * 0.56,
    );
    vignette.addColorStop(0, def.floor.vignetteRgba[0]);
    vignette.addColorStop(0.7, def.floor.vignetteRgba[1]);
    vignette.addColorStop(1, def.floor.vignetteRgba[2]);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const nextTexture = Texture.from(canvas, true);
    const oldTexture = this.cachedTexture;
    this.sprite.texture = nextTexture;
    this.sprite.width = width;
    this.sprite.height = height;
    this.cachedTexture = nextTexture;

    if (oldTexture && oldTexture !== Texture.EMPTY) {
      oldTexture.destroy(true);
    }
  }

  private paintStudyFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    this.paintPlankFloor(ctx, width, height, def, {
      seed: 48271,
      plankHeight: PLANK_HEIGHT,
      highlightRgba: 'rgba(246, 214, 174, 0.14)',
      grainDarkRgba: 'rgba(84, 52, 29, 0.14)',
      knotChance: 0.22,
    });
  }

  private paintPlankFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
    opts: PlankStyleOptions,
  ): void {
    const rng = createSeededRng(opts.seed);
    const palette = def.floor.palette;
    const grooveColor = def.floor.grooveHex;
    const plankH = opts.plankHeight;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const rows = Math.ceil(height / plankH) + 1;
    let prevPaletteIdx = -1;

    for (let row = 0; row < rows; row++) {
      const y = row * plankH;
      let x = -Math.round(((row * 163 + 47) % 280) + 40);

      while (x < width) {
        const len = Math.round(MIN_PLANK_LEN + rng() * (MAX_PLANK_LEN - MIN_PLANK_LEN));
        let paletteIdx = Math.floor(rng() * palette.length);
        if (paletteIdx === prevPaletteIdx) {
          paletteIdx = (paletteIdx + 1 + Math.floor(rng() * (palette.length - 1))) % palette.length;
        }
        prevPaletteIdx = paletteIdx;

        const baseHex = palette[paletteIdx];
        const midHex = palette[(paletteIdx + 1) % palette.length];
        const endHex = palette[(paletteIdx + 2) % palette.length];
        const toneShift = Math.round((rng() - 0.5) * 14);
        const plankColor = shiftHexColor(baseHex, toneShift);

        this.drawPlank(
          ctx,
          x,
          y,
          len,
          plankH,
          plankColor,
          midHex,
          endHex,
          toneShift,
          grooveColor,
          opts,
          rng,
        );
        x += len;
      }

      ctx.fillStyle = grooveColor;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(0, y, width, 1.5);
      ctx.globalAlpha = 1;
    }

    if (opts.isCoolSlate) {
      // Cool rainy window glass reflection band near the top edge
      const rainWash = ctx.createLinearGradient(0, 0, 0, Math.min(180, height * 0.28));
      rainWash.addColorStop(0, 'rgba(176, 212, 240, 0.24)');
      rainWash.addColorStop(0.55, 'rgba(148, 186, 216, 0.08)');
      rainWash.addColorStop(1, 'rgba(148, 186, 216, 0)');
      ctx.fillStyle = rainWash;
      ctx.fillRect(0, 0, width, Math.min(180, height * 0.28));
    }

    if (opts.isFrosted) {
      // Frosted snow-perimeter rim glow along upper window wall
      const frostWash = ctx.createLinearGradient(0, 0, 0, Math.min(150, height * 0.24));
      frostWash.addColorStop(0, 'rgba(235, 246, 255, 0.36)');
      frostWash.addColorStop(0.6, 'rgba(216, 236, 252, 0.12)');
      frostWash.addColorStop(1, 'rgba(216, 236, 252, 0)');
      ctx.fillStyle = frostWash;
      ctx.fillRect(0, 0, width, Math.min(150, height * 0.24));
    }

    if (opts.isStudioPaint) {
      // Subtle dried pastel artist studio flecks near edges
      const fleckColors = ['rgba(226, 132, 96, 0.14)', 'rgba(116, 166, 178, 0.14)', 'rgba(232, 194, 96, 0.16)'];
      for (let i = 0; i < 24; i++) {
        const fx = 60 + rng() * (width - 120);
        const fy = 40 + rng() * (height - 80);
        ctx.fillStyle = fleckColors[i % fleckColors.length];
        ctx.beginPath();
        ctx.arc(fx, fy, 1.5 + rng() * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (opts.isAquariumCaustics) {
      // Soft aqua pool sheen radiating near the upper-right tank area
      const caustic = ctx.createRadialGradient(
        width * 0.74,
        height * 0.2,
        12,
        width * 0.74,
        height * 0.2,
        Math.min(width, height) * 0.42,
      );
      caustic.addColorStop(0, 'rgba(104, 224, 242, 0.16)');
      caustic.addColorStop(0.55, 'rgba(72, 178, 204, 0.06)');
      caustic.addColorStop(1, 'rgba(72, 178, 204, 0)');
      ctx.fillStyle = caustic;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private drawPlank(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    plankColor: string,
    midHex: string,
    endHex: string,
    toneShift: number,
    grooveColor: string,
    opts: PlankStyleOptions,
    rng: () => number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const plankGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    plankGrad.addColorStop(0, plankColor);
    plankGrad.addColorStop(0.55, shiftHexColor(midHex, toneShift - 3));
    plankGrad.addColorStop(1, shiftHexColor(endHex, toneShift - 7));
    ctx.fillStyle = plankGrad;
    ctx.fillRect(x, y, w, h);

    const streakCount = 8 + Math.floor(rng() * 7);
    const hasKnot = rng() < opts.knotChance;
    const knotX = x + w * (0.22 + rng() * 0.56);
    const knotY = y + h * (0.28 + rng() * 0.44);
    const knotRadius = 4 + rng() * 4.5;

    for (let i = 0; i < streakCount; i++) {
      const baseY = y + 4 + ((i + rng() * 0.6) / streakCount) * (h - 8);
      const isHighlight = i % 3 === 0;
      ctx.strokeStyle = isHighlight ? opts.highlightRgba : opts.grainDarkRgba;
      ctx.lineWidth = isHighlight ? 0.9 : 1.1;

      const phase = rng() * Math.PI * 2;
      const amp = 1.2 + rng() * 2.2;
      const freq = 0.012 + rng() * 0.015;
      const segs = 10;

      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const px = x + (s / segs) * w;
        let py = baseY + Math.sin(px * freq + phase) * amp;

        if (hasKnot) {
          const dx = px - knotX;
          const dy = baseY - knotY;
          const distSq = dx * dx + dy * dy;
          if (distSq < 1800) {
            const influence = Math.exp(-distSq / 650);
            py += Math.sign(dy || 1) * influence * knotRadius * 1.1;
          }
        }

        if (s === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    if (hasKnot) {
      for (let ring = 2; ring >= 1; ring--) {
        ctx.beginPath();
        ctx.ellipse(
          knotX,
          knotY,
          knotRadius * (1 + ring * 0.45),
          knotRadius * (0.55 + ring * 0.25),
          (rng() - 0.5) * 0.25,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = opts.grainDarkRgba;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(knotX, knotY, knotRadius * 0.72, knotRadius * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = opts.grainDarkRgba;
      ctx.fill();
    }

    ctx.fillStyle = opts.highlightRgba;
    ctx.fillRect(x, y + 1.5, w, 1.5);
    ctx.fillStyle = opts.grainDarkRgba;
    ctx.fillRect(x, y + h - 2, w, 2);

    ctx.fillStyle = grooveColor;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(x, y, 1.5, h);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private paintHerringboneParquetFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(41179);
    const palette = def.floor.palette;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const blockW = 74;
    const blockH = 26;
    const stepX = blockW * 0.7071;
    const stepY = blockH * 1.4142;

    const cols = Math.ceil(width / stepX) + 4;
    const rows = Math.ceil(height / stepY) + 4;

    for (let r = -2; r < rows; r++) {
      for (let c = -2; c < cols; c++) {
        const cx = c * stepX + (r % 2) * (stepX * 0.5);
        const cy = r * stepY;
        const angle = (c + r) % 2 === 0 ? Math.PI * 0.25 : -Math.PI * 0.25;
        const baseHex = palette[Math.floor(rng() * palette.length)];
        const shift = Math.round((rng() - 0.5) * 14);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        const grad = ctx.createLinearGradient(-blockW * 0.5, 0, blockW * 0.5, 0);
        grad.addColorStop(0, shiftHexColor(baseHex, shift + 4));
        grad.addColorStop(0.6, shiftHexColor(baseHex, shift));
        grad.addColorStop(1, shiftHexColor(baseHex, shift - 6));

        ctx.fillStyle = grad;
        ctx.fillRect(-blockW * 0.5, -blockH * 0.5, blockW, blockH);

        // Subtle walnut satin grain
        ctx.strokeStyle = 'rgba(42, 22, 10, 0.16)';
        ctx.lineWidth = 0.9;
        for (let g = -1; g <= 1; g++) {
          const gy = g * 6 + (rng() - 0.5) * 2;
          ctx.beginPath();
          ctx.moveTo(-blockW * 0.45, gy);
          ctx.lineTo(blockW * 0.45, gy + (rng() - 0.5) * 2);
          ctx.stroke();
        }

        ctx.strokeStyle = def.floor.grooveHex;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-blockW * 0.5, -blockH * 0.5, blockW, blockH);

        ctx.fillStyle = 'rgba(255, 224, 186, 0.08)';
        ctx.fillRect(-blockW * 0.5 + 1, -blockH * 0.5 + 1, blockW - 2, 1.2);
        ctx.restore();
      }
    }
  }

  private paintDeckingFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(57391);
    const palette = def.floor.palette;
    const slatH = 38;
    const gap = 4;

    // Deep dark balcony shadow bed beneath slatted decking
    ctx.fillStyle = '#151214';
    ctx.fillRect(0, 0, width, height);

    const rows = Math.ceil(height / slatH) + 1;
    for (let row = 0; row < rows; row++) {
      const y = row * slatH + gap * 0.5;
      const h = slatH - gap;
      let x = -Math.round(((row * 131 + 29) % 240) + 20);

      while (x < width) {
        const len = Math.round(220 + rng() * 190);
        const baseHex = palette[Math.floor(rng() * palette.length)];
        const shift = Math.round((rng() - 0.5) * 10);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, len - 2, h);
        ctx.clip();

        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, shiftHexColor(baseHex, shift + 4));
        grad.addColorStop(0.55, shiftHexColor(baseHex, shift));
        grad.addColorStop(1, shiftHexColor(baseHex, shift - 6));
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, len - 2, h);

        // Weathered outdoor cedar grain lines
        for (let i = 0; i < 6; i++) {
          const gy = y + 4 + (i / 6) * (h - 8);
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(170, 148, 136, 0.1)' : 'rgba(20, 14, 12, 0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.lineTo(x + len, gy + (rng() - 0.5) * 2);
          ctx.stroke();
        }

        // Subtle deck screw heads near board ends
        const screwX = x + 12;
        if (screwX > 0 && screwX < width) {
          ctx.fillStyle = 'rgba(24, 18, 16, 0.65)';
          ctx.beginPath();
          ctx.arc(screwX, y + 7, 1.8, 0, Math.PI * 2);
          ctx.arc(screwX, y + h - 7, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Moonlit top lip highlight
        ctx.fillStyle = 'rgba(182, 206, 240, 0.08)';
        ctx.fillRect(x, y, len - 2, 1.2);
        ctx.restore();

        x += len;
      }
    }
  }

  private paintKitchenTileFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(71237);
    const palette = def.floor.palette;
    const tileSize = 54;
    const grout = 2.5;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const cols = Math.ceil(width / tileSize) + 1;
    const rows = Math.ceil(height / tileSize) + 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Warm cream primary tiles with muted sage accent tiles in classic diamond pattern
        const isSage = (row % 2 === 0 && col % 2 === 0) || (row % 4 === 2 && col % 4 === 2);
        const poolOffset = isSage ? 3 : 0;
        const baseHex = palette[poolOffset + Math.floor(rng() * 3)];
        const shift = Math.round((rng() - 0.5) * 8);

        const tx = col * tileSize + grout * 0.5;
        const ty = row * tileSize + grout * 0.5;
        const tw = tileSize - grout;
        const th = tileSize - grout;

        const grad = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
        grad.addColorStop(0, shiftHexColor(baseHex, shift + 4));
        grad.addColorStop(1, shiftHexColor(baseHex, shift - 4));
        ctx.fillStyle = grad;
        ctx.fillRect(tx, ty, tw, th);

        // Glazed ceramic sheen highlight
        ctx.fillStyle = 'rgba(255, 253, 248, 0.34)';
        ctx.fillRect(tx + 1, ty + 1, tw - 2, 1.6);
        ctx.fillRect(tx + 1, ty + 1, 1.6, th - 2);
        ctx.fillStyle = 'rgba(92, 82, 68, 0.14)';
        ctx.fillRect(tx, ty + th - 1.5, tw, 1.5);
        ctx.fillRect(tx + tw - 1.5, ty, 1.5, th);
      }
    }

    // Warm butcher-block oak kitchen counter edge strip along top edge
    const stripH = 26;
    const stripGrad = ctx.createLinearGradient(0, 0, 0, stripH);
    stripGrad.addColorStop(0, '#C5925E');
    stripGrad.addColorStop(0.85, '#B27E4B');
    stripGrad.addColorStop(1, '#7A512B');
    ctx.fillStyle = stripGrad;
    ctx.fillRect(0, 0, width, stripH);
    ctx.fillStyle = 'rgba(42, 26, 14, 0.24)';
    ctx.fillRect(0, stripH, width, 4);
  }

  private paintRooftopPaverFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(98413);
    const palette = def.floor.palette;
    const paverW = 86;
    const paverH = 64;
    const grout = 4;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const rows = Math.ceil(height / paverH) + 1;
    const cols = Math.ceil(width / paverW) + 2;

    for (let r = 0; r < rows; r++) {
      const xOffset = (r % 2) * (paverW * 0.5);
      for (let c = -1; c < cols; c++) {
        const px = c * paverW + xOffset + grout * 0.5;
        const py = r * paverH + grout * 0.5;
        const pw = paverW - grout;
        const ph = paverH - grout;
        const baseHex = palette[Math.floor(rng() * palette.length)];
        const shift = Math.round((rng() - 0.5) * 12);

        const grad = ctx.createLinearGradient(px, py, px + pw, py + ph);
        grad.addColorStop(0, shiftHexColor(baseHex, shift + 5));
        grad.addColorStop(0.6, shiftHexColor(baseHex, shift));
        grad.addColorStop(1, shiftHexColor(baseHex, shift - 6));
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, pw, ph);

        // Concrete aggregate specks
        for (let s = 0; s < 10; s++) {
          const sx = px + 6 + rng() * (pw - 12);
          const sy = py + 6 + rng() * (ph - 12);
          ctx.fillStyle = rng() > 0.5 ? 'rgba(246, 212, 198, 0.14)' : 'rgba(54, 40, 44, 0.16)';
          ctx.beginPath();
          ctx.arc(sx, sy, 0.8 + rng() * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255, 224, 196, 0.14)';
        ctx.fillRect(px, py, pw, 1.5);
        ctx.fillStyle = 'rgba(42, 26, 32, 0.18)';
        ctx.fillRect(px, py + ph - 1.5, pw, 1.5);
      }
    }
  }

  private paintTatamiFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(61403);
    const palette = def.floor.palette;
    const heriHex = def.floor.accentHex;
    const grooveHex = def.floor.grooveHex;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const u = 132;
    const moduleSize = u * 3;
    const offsetX = -Math.round((moduleSize - (width % moduleSize)) * 0.5);
    const offsetY = -Math.round((moduleSize - (height % moduleSize)) * 0.5);

    const panels: ReadonlyArray<{ dx: number; dy: number; dw: number; dh: number; horizontal: boolean }> = [
      { dx: 0, dy: 0, dw: 2 * u, dh: u, horizontal: true },
      { dx: 2 * u, dy: 0, dw: u, dh: 2 * u, horizontal: false },
      { dx: u, dy: u, dw: u, dh: u, horizontal: true },
      { dx: 0, dy: u, dw: u, dh: 2 * u, horizontal: false },
      { dx: u, dy: 2 * u, dw: 2 * u, dh: u, horizontal: true },
    ];

    for (let my = offsetY; my < height; my += moduleSize) {
      for (let mx = offsetX; mx < width; mx += moduleSize) {
        for (const p of panels) {
          const px = mx + p.dx;
          const py = my + p.dy;
          if (px + p.dw < 0 || py + p.dh < 0 || px > width || py > height) {
            continue;
          }
          const baseHex = palette[Math.floor(rng() * palette.length)];
          const shift = Math.round((rng() - 0.5) * 10);
          this.drawTatamiPanel(
            ctx,
            px,
            py,
            p.dw,
            p.dh,
            p.horizontal,
            baseHex,
            shift,
            heriHex,
            grooveHex,
            rng,
          );
        }
      }
    }
  }

  private drawTatamiPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    horizontalWeave: boolean,
    baseHex: string,
    toneShift: number,
    heriHex: string,
    grooveHex: string,
    rng: () => number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const grad = horizontalWeave
      ? ctx.createLinearGradient(x, y, x, y + h)
      : ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, shiftHexColor(baseHex, toneShift + 4));
    grad.addColorStop(0.5, shiftHexColor(baseHex, toneShift));
    grad.addColorStop(1, shiftHexColor(baseHex, toneShift - 5));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    const reedStep = 3.5;
    if (horizontalWeave) {
      for (let ry = y + 2; ry < y + h; ry += reedStep) {
        const highlight = ((Math.round(ry) + Math.floor(rng() * 2)) & 1) === 0;
        ctx.strokeStyle = highlight
          ? 'rgba(245, 240, 206, 0.19)'
          : 'rgba(98, 94, 54, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ry);
        ctx.lineTo(x + w, ry);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(116, 112, 68, 0.13)';
      ctx.lineWidth = 1;
      for (let wx = x + 16; wx < x + w; wx += 26) {
        ctx.beginPath();
        ctx.moveTo(wx, y);
        ctx.lineTo(wx, y + h);
        ctx.stroke();
      }
    } else {
      for (let rx = x + 2; rx < x + w; rx += reedStep) {
        const highlight = ((Math.round(rx) + Math.floor(rng() * 2)) & 1) === 0;
        ctx.strokeStyle = highlight
          ? 'rgba(245, 240, 206, 0.19)'
          : 'rgba(98, 94, 54, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rx, y);
        ctx.lineTo(rx, y + h);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(116, 112, 68, 0.13)';
      ctx.lineWidth = 1;
      for (let wy = y + 16; wy < y + h; wy += 26) {
        ctx.beginPath();
        ctx.moveTo(x, wy);
        ctx.lineTo(x + w, wy);
        ctx.stroke();
      }
    }

    const heriWidth = 13;
    if (horizontalWeave) {
      this.drawHeriStrip(ctx, x, y, w, heriWidth, true, heriHex);
      this.drawHeriStrip(ctx, x, y + h - heriWidth, w, heriWidth, true, heriHex);
    } else {
      this.drawHeriStrip(ctx, x, y, heriWidth, h, false, heriHex);
      this.drawHeriStrip(ctx, x + w - heriWidth, y, heriWidth, h, false, heriHex);
    }

    ctx.strokeStyle = 'rgba(248, 243, 212, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    ctx.strokeStyle = grooveHex;
    ctx.globalAlpha = 0.74;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private drawHeriStrip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    horizontal: boolean,
    heriHex: string,
  ): void {
    ctx.fillStyle = heriHex;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(195, 186, 134, 0.24)';
    if (horizontal) {
      ctx.fillRect(x, y + 1, w, 1);
      ctx.fillRect(x, y + h - 2, w, 1);
    } else {
      ctx.fillRect(x + 1, y, 1, h);
      ctx.fillRect(x + w - 2, y, 1, h);
    }

    ctx.strokeStyle = 'rgba(176, 166, 114, 0.28)';
    ctx.lineWidth = 1;
    const step = 12;
    ctx.beginPath();
    if (horizontal) {
      const cy = y + h * 0.5;
      for (let px = x + 6; px < x + w; px += step) {
        ctx.moveTo(px - 3.5, cy);
        ctx.lineTo(px, cy - 3);
        ctx.lineTo(px + 3.5, cy);
        ctx.lineTo(px, cy + 3);
        ctx.closePath();
      }
    } else {
      const cx = x + w * 0.5;
      for (let py = y + 6; py < y + h; py += step) {
        ctx.moveTo(cx, py - 3.5);
        ctx.lineTo(cx + 3, py);
        ctx.lineTo(cx, py + 3.5);
        ctx.lineTo(cx - 3, py);
        ctx.closePath();
      }
    }
    ctx.stroke();
  }

  private paintGardenFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(73129);
    const palette = def.floor.palette;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const mossDotCount = Math.floor((width * height) / 420);
    for (let i = 0; i < mossDotCount; i++) {
      const mx = rng() * width;
      const my = rng() * height;
      const mr = 2 + rng() * 5;
      ctx.fillStyle =
        rng() > 0.45 ? 'rgba(104, 138, 76, 0.34)' : 'rgba(42, 58, 32, 0.32)';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }

    const joint = 8;
    let y = -12;
    let rowIdx = 0;

    while (y < height + 16) {
      const rowH = 74 + Math.round(rng() * 18);
      let x = -Math.round(((rowIdx * 59 + 23) % 85) + 18);

      while (x < width + 20) {
        const stoneW = 94 + Math.round(rng() * 68);
        const isTerracotta = rng() < 0.32;
        const poolOffset = isTerracotta ? 3 : 0;
        const baseHex = palette[poolOffset + Math.floor(rng() * 3)];
        const shift = Math.round((rng() - 0.5) * 14);

        this.drawFlagstone(
          ctx,
          x + joint * 0.5,
          y + joint * 0.5,
          stoneW - joint,
          rowH - joint,
          baseHex,
          shift,
          isTerracotta,
          rng,
        );
        x += stoneW;
      }

      y += rowH;
      rowIdx++;
    }
  }

  private drawFlagstone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    baseHex: string,
    toneShift: number,
    isTerracotta: boolean,
    rng: () => number,
  ): void {
    const chamfer = 6 + rng() * 4;
    const j = () => (rng() - 0.5) * 3.5;

    const pts: ReadonlyArray<readonly [number, number]> = [
      [x + chamfer + j(), y + j()],
      [x + w * 0.5 + j(), y + (rng() - 0.5) * 2],
      [x + w - chamfer + j(), y + j()],
      [x + w + j(), y + chamfer + j()],
      [x + w + (rng() - 0.5) * 2, y + h * 0.5 + j()],
      [x + w + j(), y + h - chamfer + j()],
      [x + w - chamfer + j(), y + h + j()],
      [x + w * 0.5 + j(), y + h + (rng() - 0.5) * 2],
      [x + chamfer + j(), y + h + j()],
      [x + j(), y + h - chamfer + j()],
      [x + (rng() - 0.5) * 2, y + h * 0.5 + j()],
      [x + j(), y + chamfer + j()],
    ];

    const traceStone = (): void => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
    };

    ctx.save();
    ctx.translate(1.5, 2.5);
    traceStone();
    ctx.fillStyle = 'rgba(22, 32, 16, 0.34)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    traceStone();
    ctx.clip();

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, shiftHexColor(baseHex, toneShift + 5));
    grad.addColorStop(0.6, shiftHexColor(baseHex, toneShift));
    grad.addColorStop(1, shiftHexColor(baseHex, toneShift - 8));
    ctx.fillStyle = grad;
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);

    const specks = 12 + Math.floor(rng() * 10);
    for (let i = 0; i < specks; i++) {
      const sx = x + 6 + rng() * (w - 12);
      const sy = y + 6 + rng() * (h - 12);
      const sr = 0.8 + rng() * 1.8;
      ctx.fillStyle =
        rng() > 0.5
          ? isTerracotta
            ? 'rgba(235, 198, 174, 0.18)'
            : 'rgba(232, 228, 218, 0.18)'
          : 'rgba(54, 50, 44, 0.18)';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    if (rng() < 0.24) {
      const cx0 = x + w * (0.2 + rng() * 0.6);
      const cy0 = y + h * (0.15 + rng() * 0.3);
      ctx.strokeStyle = 'rgba(48, 44, 38, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx0 + (rng() - 0.5) * 26, cy0 + 14 + rng() * 16);
      ctx.lineTo(cx0 + (rng() - 0.5) * 34, cy0 + 28 + rng() * 20);
      ctx.stroke();
    }

    traceStone();
    ctx.strokeStyle = 'rgba(248, 242, 226, 0.18)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();

    if (rng() < 0.65) {
      const tuftCorner = pts[Math.floor(rng() * 4) * 3];
      const tuftCount = 3 + Math.floor(rng() * 3);
      for (let t = 0; t < tuftCount; t++) {
        const tx = tuftCorner[0] + (rng() - 0.5) * 14;
        const ty = tuftCorner[1] + (rng() - 0.5) * 14;
        const tr = 2.5 + rng() * 4.5;
        ctx.fillStyle = rng() > 0.45 ? 'rgba(98, 134, 68, 0.72)' : 'rgba(72, 102, 48, 0.78)';
        ctx.beginPath();
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private paintCafeFloor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(82917);
    const palette = def.floor.palette;
    const tileSize = 68;
    const grout = 3;

    ctx.fillStyle = def.floor.baseHex;
    ctx.fillRect(0, 0, width, height);

    const cols = Math.ceil(width / tileSize) + 1;
    const rows = Math.ceil(height / tileSize) + 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isTerracotta = (row + col) % 2 === 1;
        const poolOffset = isTerracotta ? 3 : 0;
        const baseHex = palette[poolOffset + Math.floor(rng() * 3)];
        const shift = Math.round((rng() - 0.5) * 8);

        const tx = col * tileSize + grout * 0.5;
        const ty = row * tileSize + grout * 0.5;
        const tw = tileSize - grout;
        const th = tileSize - grout;

        this.drawCafeTile(ctx, tx, ty, tw, th, baseHex, shift, isTerracotta, rng);
      }
    }
  }

  private drawCafeTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    baseHex: string,
    toneShift: number,
    isTerracotta: boolean,
    rng: () => number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, shiftHexColor(baseHex, toneShift + 4));
    grad.addColorStop(0.55, shiftHexColor(baseHex, toneShift));
    grad.addColorStop(1, shiftHexColor(baseHex, toneShift - 5));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    if (isTerracotta) {
      for (let i = 0; i < 8; i++) {
        const gx = x + 6 + rng() * (w - 12);
        const gy = y + 6 + rng() * (h - 12);
        ctx.fillStyle = rng() > 0.5 ? 'rgba(235, 188, 166, 0.16)' : 'rgba(116, 62, 44, 0.14)';
        ctx.beginPath();
        ctx.arc(gx, gy, 0.8 + rng() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const veins = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < veins; i++) {
        const vy = y + 10 + rng() * (h - 20);
        ctx.strokeStyle = rng() > 0.45 ? 'rgba(182, 162, 136, 0.22)' : 'rgba(255, 249, 240, 0.25)';
        ctx.lineWidth = 1 + rng() * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, vy);
        ctx.bezierCurveTo(
          x + w * 0.35,
          vy + (rng() - 0.5) * 6,
          x + w * 0.65,
          vy + (rng() - 0.5) * 6,
          x + w,
          vy + (rng() - 0.5) * 4,
        );
        ctx.stroke();
      }
      for (let p = 0; p < 5; p++) {
        const px = x + 8 + rng() * (w - 16);
        const py = y + 8 + rng() * (h - 16);
        ctx.fillStyle = 'rgba(162, 142, 118, 0.22)';
        ctx.fillRect(px, py, 2 + rng() * 2.5, 1.1);
      }
    }

    ctx.fillStyle = 'rgba(255, 248, 238, 0.22)';
    ctx.fillRect(x, y, w, 1.5);
    ctx.fillRect(x, y, 1.5, h);
    ctx.fillStyle = 'rgba(62, 42, 30, 0.15)';
    ctx.fillRect(x, y + h - 1.5, w, 1.5);
    ctx.fillRect(x + w - 1.5, y, 1.5, h);

    ctx.restore();
  }

  override destroy(): void {
    if (this.cachedTexture && this.cachedTexture !== Texture.EMPTY) {
      this.cachedTexture.destroy(true);
      this.cachedTexture = null;
    }
    super.destroy({ children: true });
  }
}
