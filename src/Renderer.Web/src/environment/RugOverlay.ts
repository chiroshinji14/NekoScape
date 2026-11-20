import { Container, Sprite, Texture } from 'pixi.js';
import type { SurfaceManager } from '../core/SurfaceManager';
import type { RugBounds, SceneTheme } from '../types/simulation';
import {
  SCENE_THEME_DEFS,
  createSeededRng,
  roundedRectPath,
  type RgbColor,
  type SceneThemeDefinition,
} from './SceneThemes';

const PAD_X = 30;
const PAD_Y = 24;

/**
 * Centered nap-zone mat synced to SurfaceManager.getRugBounds().
 * Adapts across all four scene themes while caching its Canvas2D texture.
 */
export class RugOverlay extends Container {
  private readonly surfaceManager: SurfaceManager;
  private readonly sprite: Sprite;
  private cachedTexture: Texture | null = null;
  private lastBounds: RugBounds | null = null;
  private lastRenderedTheme: SceneTheme | null = null;
  private theme: SceneTheme;

  constructor(surfaceManager: SurfaceManager, theme: SceneTheme = 'study') {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;
    this.surfaceManager = surfaceManager;
    this.theme = theme;
    this.sprite = new Sprite(Texture.EMPTY);
    this.addChild(this.sprite);
    this.syncToSurface();
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme && this.lastRenderedTheme === theme && this.cachedTexture !== null) {
      return;
    }
    this.theme = theme;
    this.syncToSurface();
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  syncToSurface(): void {
    const bounds = this.surfaceManager.getRugBounds();
    if (
      this.lastBounds &&
      this.cachedTexture &&
      this.lastRenderedTheme === this.theme &&
      this.lastBounds.width === bounds.width &&
      this.lastBounds.height === bounds.height &&
      this.lastBounds.cornerRadius === bounds.cornerRadius
    ) {
      this.sprite.position.set(bounds.x - PAD_X, bounds.y - PAD_Y);
      this.lastBounds = { ...bounds };
      return;
    }

    this.lastBounds = { ...bounds };
    this.lastRenderedTheme = this.theme;
    this.rebuildTexture(bounds);
    this.sprite.position.set(bounds.x - PAD_X, bounds.y - PAD_Y);
  }

  private rebuildTexture(bounds: RugBounds): void {
    const rugW = Math.max(40, Math.round(bounds.width));
    const rugH = Math.max(40, Math.round(bounds.height));
    const canvasW = rugW + PAD_X * 2;
    const canvasH = rugH + PAD_Y * 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const def = SCENE_THEME_DEFS[this.theme];
    const rx = PAD_X;
    const ry = PAD_Y;
    const cr = Math.min(bounds.cornerRadius, rugW * 0.25, rugH * 0.25);

    switch (this.theme) {
      case 'tatami':
        this.paintTatamiKotatsuMat(ctx, rx, ry, rugW, rugH, cr, def);
        break;
      case 'garden':
        this.paintGardenCloverPatch(ctx, rx, ry, rugW, rugH, cr, def);
        break;
      case 'cafe':
        this.paintCafeVelvetMat(ctx, rx, ry, rugW, rugH, cr, def);
        break;
      case 'study':
      default:
        this.paintStudyBoucleRug(ctx, rx, ry, rugW, rugH, cr, def);
        break;
    }

    const nextTexture = Texture.from(canvas, true);
    const oldTexture = this.cachedTexture;
    this.sprite.texture = nextTexture;
    this.sprite.width = canvasW;
    this.sprite.height = canvasH;
    this.cachedTexture = nextTexture;

    if (oldTexture && oldTexture !== Texture.EMPTY) {
      oldTexture.destroy(true);
    }
  }

  private drawContactShadow(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rugW: number,
    rugH: number,
    cr: number,
    shadowRgb: RgbColor,
  ): void {
    ctx.save();
    for (let pass = 0; pass < 3; pass++) {
      const spread = 10 - pass * 3;
      const offsetY = 5 - pass * 1.2;
      const offsetX = 2 - pass * 0.5;
      roundedRectPath(
        ctx,
        rx - spread * 0.4 + offsetX,
        ry - spread * 0.25 + offsetY,
        rugW + spread * 0.8,
        rugH + spread * 0.6,
        cr + spread * 0.35,
      );
      ctx.fillStyle = `rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, ${0.11 + pass * 0.05})`;
      ctx.fill();
    }
    ctx.restore();
  }

  private paintStudyBoucleRug(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rugW: number,
    rugH: number,
    cr: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(7331);
    this.drawContactShadow(ctx, rx, ry, rugW, rugH, cr, def.rug.shadowRgb);
    this.drawFringeTassels(ctx, rx, ry, rugW, rugH, cr, def.rug.trimHex, rng);

    ctx.save();
    roundedRectPath(ctx, rx, ry, rugW, rugH, cr);
    ctx.clip();

    const baseGrad = ctx.createLinearGradient(rx, ry, rx + rugW, ry + rugH);
    baseGrad.addColorStop(0, def.rug.baseStops[0]);
    baseGrad.addColorStop(0.5, def.rug.baseStops[1]);
    baseGrad.addColorStop(1, def.rug.baseStops[2]);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(rx, ry, rugW, rugH);

    ctx.lineWidth = 1;
    for (let y = ry + 2; y < ry + rugH; y += 4) {
      ctx.strokeStyle =
        rng() > 0.5 ? 'rgba(255, 250, 244, 0.36)' : 'rgba(196, 178, 156, 0.24)';
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rugW, y);
      ctx.stroke();
    }

    for (let x = rx + 2; x < rx + rugW; x += 5) {
      ctx.strokeStyle =
        rng() > 0.5 ? 'rgba(252, 245, 236, 0.22)' : 'rgba(182, 163, 141, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x, ry);
      ctx.lineTo(x, ry + rugH);
      ctx.stroke();
    }

    const nubCount = Math.floor((rugW * rugH) / 140);
    for (let i = 0; i < nubCount; i++) {
      const nx = rx + 6 + rng() * (rugW - 12);
      const ny = ry + 6 + rng() * (rugH - 12);
      ctx.fillStyle = rng() > 0.45 ? 'rgba(255, 251, 246, 0.35)' : 'rgba(176, 156, 134, 0.22)';
      ctx.fillRect(nx, ny, 2.2, 1.4);
    }

    const outerInset = 14;
    const innerInset = 22;

    roundedRectPath(
      ctx,
      rx + outerInset,
      ry + outerInset,
      rugW - outerInset * 2,
      rugH - outerInset * 2,
      Math.max(6, cr - outerInset * 0.65),
    );
    ctx.strokeStyle = 'rgba(74, 55, 43, 0.48)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    roundedRectPath(
      ctx,
      rx + innerInset,
      ry + innerInset,
      rugW - innerInset * 2,
      rugH - innerInset * 2,
      Math.max(4, cr - innerInset * 0.65),
    );
    ctx.strokeStyle = 'rgba(196, 109, 83, 0.72)';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    const trackInset = 29;
    roundedRectPath(
      ctx,
      rx + trackInset,
      ry + trackInset,
      rugW - trackInset * 2,
      rugH - trackInset * 2,
      Math.max(4, cr - trackInset * 0.65),
    );
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(74, 55, 43, 0.32)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    const sheenGrad = ctx.createRadialGradient(
      rx + rugW * 0.35,
      ry + rugH * 0.3,
      10,
      rx + rugW * 0.5,
      ry + rugH * 0.5,
      Math.max(rugW, rugH) * 0.7,
    );
    sheenGrad.addColorStop(0, 'rgba(255, 250, 240, 0.16)');
    sheenGrad.addColorStop(1, 'rgba(130, 106, 84, 0.08)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(rx, ry, rugW, rugH);

    ctx.restore();

    roundedRectPath(ctx, rx, ry, rugW, rugH, cr);
    ctx.strokeStyle = 'rgba(128, 102, 79, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  private paintTatamiKotatsuMat(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rugW: number,
    rugH: number,
    cr: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(42071);
    this.drawContactShadow(ctx, rx, ry, rugW, rugH, cr, def.rug.shadowRgb);

    // Cozy knotted corner kimono ties
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [rx + cr * 0.32, ry + cr * 0.32, -1, -1],
      [rx + rugW - cr * 0.32, ry + cr * 0.32, 1, -1],
      [rx + cr * 0.32, ry + rugH - cr * 0.32, -1, 1],
      [rx + rugW - cr * 0.32, ry + rugH - cr * 0.32, 1, 1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.strokeStyle = 'rgba(28, 22, 16, 0.24)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + 1.5);
      ctx.lineTo(cx + dx * 11, cy + dy * 11 + 1.5);
      ctx.stroke();

      ctx.strokeStyle = def.rug.borderHex;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * 11, cy + dy * 11);
      ctx.stroke();

      ctx.fillStyle = def.rug.trimHex;
      ctx.beginPath();
      ctx.arc(cx + dx * 2, cy + dy * 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    roundedRectPath(ctx, rx, ry, rugW, rugH, cr);
    ctx.clip();

    // Persimmon-rust quilted outer border base
    const outerGrad = ctx.createLinearGradient(rx, ry, rx + rugW, ry + rugH);
    outerGrad.addColorStop(0, '#CC6647');
    outerGrad.addColorStop(0.5, '#BC583A');
    outerGrad.addColorStop(1, '#A94B30');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(rx, ry, rugW, rugH);

    // Subtle quilted puff compartments along outer border
    const borderSize = Math.min(34, rugW * 0.14, rugH * 0.16);
    ctx.strokeStyle = 'rgba(84, 30, 16, 0.26)';
    ctx.lineWidth = 1.4;
    for (let x = rx + borderSize; x < rx + rugW - borderSize * 0.5; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, ry);
      ctx.lineTo(x, ry + rugH);
      ctx.stroke();
    }
    for (let y = ry + borderSize; y < ry + rugH - borderSize * 0.5; y += 38) {
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rugW, y);
      ctx.stroke();
    }

    // Cream sashiko running-stitch border just outside indigo trim
    roundedRectPath(
      ctx,
      rx + 9,
      ry + 9,
      rugW - 18,
      rugH - 18,
      Math.max(6, cr - 6),
    );
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(245, 234, 218, 0.58)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);

    // Dark indigo-moss trim frame around center cream cushion
    const innerX = rx + borderSize;
    const innerY = ry + borderSize;
    const innerW = Math.max(24, rugW - borderSize * 2);
    const innerH = Math.max(24, rugH - borderSize * 2);
    const innerCr = Math.max(6, cr - borderSize * 0.55);

    roundedRectPath(ctx, innerX - 3, innerY - 3, innerW + 6, innerH + 6, innerCr + 2);
    ctx.fillStyle = def.rug.accentHex;
    ctx.fill();

    // Inner quilted cream futon panel
    ctx.save();
    roundedRectPath(ctx, innerX, innerY, innerW, innerH, innerCr);
    ctx.clip();

    const creamGrad = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH);
    creamGrad.addColorStop(0, def.rug.baseStops[0]);
    creamGrad.addColorStop(0.5, def.rug.baseStops[1]);
    creamGrad.addColorStop(1, def.rug.baseStops[2]);
    ctx.fillStyle = creamGrad;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Gentle woven cotton grain
    for (let y = innerY + 2; y < innerY + innerH; y += 4) {
      ctx.strokeStyle =
        rng() > 0.5 ? 'rgba(255, 251, 245, 0.34)' : 'rgba(182, 165, 144, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerX, y);
      ctx.lineTo(innerX + innerW, y);
      ctx.stroke();
    }

    // Quilted grid channels + tufted persimmon stitch knots
    const cols = Math.max(3, Math.round(innerW / 76));
    const rows = Math.max(2, Math.round(innerH / 68));
    const cellW = innerW / cols;
    const cellH = innerH / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = innerX + (c + 0.5) * cellW;
        const cy = innerY + (r + 0.5) * cellH;
        const puff = ctx.createRadialGradient(
          cx - cellW * 0.08,
          cy - cellH * 0.08,
          2,
          cx,
          cy,
          Math.max(cellW, cellH) * 0.6,
        );
        puff.addColorStop(0, 'rgba(255, 252, 246, 0.24)');
        puff.addColorStop(1, 'rgba(176, 152, 126, 0.14)');
        ctx.fillStyle = puff;
        ctx.fillRect(innerX + c * cellW, innerY + r * cellH, cellW, cellH);
      }
    }

    ctx.strokeStyle = 'rgba(164, 138, 112, 0.36)';
    ctx.lineWidth = 1.2;
    for (let c = 1; c < cols; c++) {
      const gx = innerX + c * cellW;
      ctx.beginPath();
      ctx.moveTo(gx, innerY);
      ctx.lineTo(gx, innerY + innerH);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const gy = innerY + r * cellH;
      ctx.beginPath();
      ctx.moveTo(innerX, gy);
      ctx.lineTo(innerX + innerW, gy);
      ctx.stroke();
    }

    // Persimmon tufted knots at internal quilt intersections
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        const kx = innerX + c * cellW;
        const ky = innerY + r * cellH;
        ctx.fillStyle = 'rgba(92, 66, 48, 0.24)';
        ctx.beginPath();
        ctx.arc(kx + 0.6, ky + 1, 3.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = def.rug.borderHex;
        ctx.beginPath();
        ctx.arc(kx, ky, 2.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(250, 242, 232, 0.72)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(kx - 2.6, ky - 2.6);
        ctx.lineTo(kx + 2.6, ky + 2.6);
        ctx.moveTo(kx + 2.6, ky - 2.6);
        ctx.lineTo(kx - 2.6, ky + 2.6);
        ctx.stroke();
      }
    }

    ctx.restore();
    ctx.restore();

    // Crisp outer stitched piping edge
    roundedRectPath(ctx, rx, ry, rugW, rugH, cr);
    ctx.strokeStyle = 'rgba(92, 42, 26, 0.56)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  private paintGardenCloverPatch(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rugW: number,
    rugH: number,
    cr: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(58193);
    this.drawContactShadow(ctx, rx, ry, rugW, rugH, cr, def.rug.shadowRgb);

    // Organic scalloped moss tufts hugging the perimeter of the rounded patch
    const traceTurfSilhouette = (expand: number): void => {
      roundedRectPath(
        ctx,
        rx - expand,
        ry - expand,
        rugW + expand * 2,
        rugH + expand * 2,
        cr + expand * 0.5,
      );
    };

    // Outer mossy edge puffs around perimeter
    const perimeter = 2 * (rugW + rugH);
    const tuftCount = Math.max(48, Math.floor(perimeter / 14));
    for (let i = 0; i < tuftCount; i++) {
      const t = i / tuftCount;
      const p = this.sampleRoundedRectPerimeter(rx, ry, rugW, rugH, cr, t);
      const jitterR = 6 + rng() * 6.5;
      const ox = p.x + p.nx * (rng() * 3.5 - 1);
      const oy = p.y + p.ny * (rng() * 3.5 - 1);

      ctx.fillStyle = 'rgba(22, 34, 16, 0.25)';
      ctx.beginPath();
      ctx.arc(ox + 1.5, oy + 2.2, jitterR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rng() > 0.45 ? '#557B3E' : '#4A6E35';
      ctx.beginPath();
      ctx.arc(ox, oy, jitterR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    traceTurfSilhouette(1);
    ctx.clip();

    const turfGrad = ctx.createRadialGradient(
      rx + rugW * 0.44,
      ry + rugH * 0.42,
      12,
      rx + rugW * 0.5,
      ry + rugH * 0.5,
      Math.max(rugW, rugH) * 0.68,
    );
    turfGrad.addColorStop(0, def.rug.baseStops[0]);
    turfGrad.addColorStop(0.62, def.rug.baseStops[1]);
    turfGrad.addColorStop(1, def.rug.baseStops[2]);
    ctx.fillStyle = turfGrad;
    ctx.fillRect(rx - 8, ry - 8, rugW + 16, rugH + 16);

    // Subtle soft sun-dappled lawn variation
    const mottleCount = Math.floor((rugW * rugH) / 900);
    for (let i = 0; i < mottleCount; i++) {
      const mx = rx + rng() * rugW;
      const my = ry + rng() * rugH;
      const mr = 8 + rng() * 18;
      ctx.fillStyle =
        rng() > 0.5 ? 'rgba(130, 174, 92, 0.16)' : 'rgba(54, 86, 36, 0.16)';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine meadow grass blades
    const bladeCount = Math.floor((rugW * rugH) / 145);
    ctx.lineCap = 'round';
    for (let i = 0; i < bladeCount; i++) {
      const gx = rx + 8 + rng() * (rugW - 16);
      const gy = ry + 8 + rng() * (rugH - 16);
      const lean = (rng() - 0.5) * 4.5;
      const h = 4 + rng() * 4.5;
      ctx.strokeStyle =
        rng() > 0.45 ? 'rgba(138, 182, 98, 0.48)' : 'rgba(58, 90, 38, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + lean * 0.4, gy - h * 0.5, gx + lean, gy - h);
      ctx.stroke();
    }

    // Scattered 3-leaf (and occasional lucky 4-leaf) clover clusters
    const cloverCount = Math.max(24, Math.floor((rugW * rugH) / 2200));
    for (let i = 0; i < cloverCount; i++) {
      const cx = rx + 16 + rng() * (rugW - 32);
      const cy = ry + 16 + rng() * (rugH - 32);
      const leafSize = 3.2 + rng() * 2.2;
      const leaves = rng() < 0.08 ? 4 : 3;
      const rot = rng() * Math.PI * 2;
      const fill = rng() > 0.5 ? '#7BA65C' : '#68934B';
      this.drawClover(ctx, cx, cy, leafSize, leaves, rot, fill);
    }

    // Tiny white & butter-gold daisies scattered gracefully near edges & corners
    const daisyCount = Math.max(12, Math.floor((rugW * rugH) / 5600));
    for (let i = 0; i < daisyCount; i++) {
      let dx = rx + 18 + rng() * (rugW - 36);
      let dy = ry + 18 + rng() * (rugH - 36);
      // Bias slightly away from exact center so napping cats shine
      const distCx = Math.abs(dx - (rx + rugW * 0.5)) / (rugW * 0.5);
      const distCy = Math.abs(dy - (ry + rugH * 0.5)) / (rugH * 0.5);
      if (distCx < 0.35 && distCy < 0.35) {
        dx = rng() > 0.5 ? rx + 22 + rng() * 54 : rx + rugW - 22 - rng() * 54;
      }
      const radius = 3.6 + rng() * 1.8;
      this.drawDaisy(ctx, dx, dy, radius, def.rug.accentHex, def.rug.trimHex, rng);
    }

    ctx.restore();
  }

  private sampleRoundedRectPerimeter(
    x: number,
    y: number,
    w: number,
    h: number,
    cr: number,
    t: number,
  ): { x: number; y: number; nx: number; ny: number } {
    const straightW = Math.max(0, w - cr * 2);
    const straightH = Math.max(0, h - cr * 2);
    const total = 2 * (straightW + straightH) + 2 * Math.PI * cr;
    let d = ((t % 1) + 1) % 1 * total;

    if (d < straightW) {
      return { x: x + cr + d, y, nx: 0, ny: -1 };
    }
    d -= straightW;
    const qArc = Math.PI * 0.5 * cr;
    if (d < qArc) {
      const a = -Math.PI * 0.5 + d / Math.max(1, cr);
      return {
        x: x + w - cr + Math.cos(a) * cr,
        y: y + cr + Math.sin(a) * cr,
        nx: Math.cos(a),
        ny: Math.sin(a),
      };
    }
    d -= qArc;
    if (d < straightH) {
      return { x: x + w, y: y + cr + d, nx: 1, ny: 0 };
    }
    d -= straightH;
    if (d < qArc) {
      const a = d / Math.max(1, cr);
      return {
        x: x + w - cr + Math.cos(a) * cr,
        y: y + h - cr + Math.sin(a) * cr,
        nx: Math.cos(a),
        ny: Math.sin(a),
      };
    }
    d -= qArc;
    if (d < straightW) {
      return { x: x + w - cr - d, y: y + h, nx: 0, ny: 1 };
    }
    d -= straightW;
    if (d < qArc) {
      const a = Math.PI * 0.5 + d / Math.max(1, cr);
      return {
        x: x + cr + Math.cos(a) * cr,
        y: y + h - cr + Math.sin(a) * cr,
        nx: Math.cos(a),
        ny: Math.sin(a),
      };
    }
    d -= qArc;
    if (d < straightH) {
      return { x, y: y + h - cr - d, nx: -1, ny: 0 };
    }
    d -= straightH;
    const a = Math.PI + d / Math.max(1, cr);
    return {
      x: x + cr + Math.cos(a) * cr,
      y: y + cr + Math.sin(a) * cr,
      nx: Math.cos(a),
      ny: Math.sin(a),
    };
  }

  private drawClover(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    leafSize: number,
    leaves: number,
    rot: number,
    fill: string,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    ctx.fillStyle = 'rgba(34, 54, 22, 0.3)';
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * leafSize * 0.8 + 0.8, Math.sin(a) * leafSize * 0.8 + 1, leafSize * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = fill;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * leafSize * 0.8, Math.sin(a) * leafSize * 0.8, leafSize * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawDaisy(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    petalHex: string,
    centerHex: string,
    rng: () => number,
  ): void {
    const petals = 6;
    const rot = rng() * Math.PI;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    ctx.fillStyle = 'rgba(28, 46, 18, 0.34)';
    ctx.beginPath();
    ctx.arc(0.8, 1.2, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = petalHex;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const px = Math.cos(a) * radius * 0.72;
      const py = Math.sin(a) * radius * 0.72;
      ctx.beginPath();
      ctx.ellipse(px, py, radius * 0.56, radius * 0.34, a, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = centerHex;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private paintCafeVelvetMat(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rugW: number,
    rugH: number,
    cr: number,
    def: SceneThemeDefinition,
  ): void {
    const rng = createSeededRng(91243);
    this.drawContactShadow(ctx, rx, ry, rugW, rugH, cr, def.rug.shadowRgb);

    ctx.save();
    roundedRectPath(ctx, rx, ry, rugW, rugH, cr);
    ctx.clip();

    // Plush sage-velvet gradient
    const velvetGrad = ctx.createLinearGradient(rx, ry, rx + rugW, ry + rugH);
    velvetGrad.addColorStop(0, def.rug.baseStops[0]);
    velvetGrad.addColorStop(0.5, def.rug.baseStops[1]);
    velvetGrad.addColorStop(1, def.rug.baseStops[2]);
    ctx.fillStyle = velvetGrad;
    ctx.fillRect(rx, ry, rugW, rugH);

    // Subtle velvet nap grain
    const grainCount = Math.floor((rugW * rugH) / 160);
    for (let i = 0; i < grainCount; i++) {
      const gx = rx + 4 + rng() * (rugW - 8);
      const gy = ry + 4 + rng() * (rugH - 8);
      ctx.fillStyle = rng() > 0.5 ? 'rgba(218, 232, 216, 0.08)' : 'rgba(48, 66, 48, 0.08)';
      ctx.fillRect(gx, gy, 2.5, 1.5);
    }

    // Soft tufted diamond cushion sheen + dimples
    const cols = Math.max(3, Math.round(rugW / 96));
    const rows = Math.max(2, Math.round(rugH / 84));
    const cellW = (rugW - 36) / cols;
    const cellH = (rugH - 36) / rows;
    const innerX = rx + 18;
    const innerY = ry + 18;

    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        const tx = innerX + c * cellW;
        const ty = innerY + r * cellH;
        const dimple = ctx.createRadialGradient(tx, ty, 1, tx, ty, 14);
        dimple.addColorStop(0, 'rgba(38, 54, 40, 0.28)');
        dimple.addColorStop(0.55, 'rgba(56, 78, 58, 0.08)');
        dimple.addColorStop(1, 'rgba(56, 78, 58, 0)');
        ctx.fillStyle = dimple;
        ctx.beginPath();
        ctx.arc(tx, ty, 14, 0, Math.PI * 2);
        ctx.fill();

        // Cream fabric-covered tuft button
        ctx.fillStyle = def.rug.accentHex;
        ctx.beginPath();
        ctx.arc(tx, ty, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bolstered pillow highlight near center
    const sheen = ctx.createRadialGradient(
      rx + rugW * 0.36,
      ry + rugH * 0.3,
      14,
      rx + rugW * 0.5,
      ry + rugH * 0.5,
      Math.max(rugW, rugH) * 0.68,
    );
    sheen.addColorStop(0, 'rgba(232, 244, 228, 0.16)');
    sheen.addColorStop(1, 'rgba(38, 54, 40, 0.14)');
    ctx.fillStyle = sheen;
    ctx.fillRect(rx, ry, rugW, rugH);

    // Inset cream saddle-stitch seam
    const stitchInset = 17;
    roundedRectPath(
      ctx,
      rx + stitchInset,
      ry + stitchInset,
      rugW - stitchInset * 2,
      rugH - stitchInset * 2,
      Math.max(6, cr - stitchInset * 0.65),
    );
    ctx.setLineDash([6, 4.5]);
    ctx.strokeStyle = 'rgba(244, 235, 221, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // Welted cream piping cord around outer edge
    roundedRectPath(ctx, rx + 1.5, ry + 1.5, rugW - 3, rugH - 3, Math.max(4, cr - 1.5));
    ctx.strokeStyle = def.rug.borderHex;
    ctx.lineWidth = 6;
    ctx.stroke();

    roundedRectPath(ctx, rx + 1, ry + 1, rugW - 2, rugH - 2, Math.max(4, cr - 1));
    ctx.strokeStyle = def.rug.accentHex;
    ctx.lineWidth = 3.2;
    ctx.stroke();

    roundedRectPath(ctx, rx + 0.5, ry + 0.5, rugW - 1, rugH - 1, Math.max(4, cr - 0.5));
    ctx.strokeStyle = 'rgba(255, 252, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawFringeTassels(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rugW: number,
    rugH: number,
    cr: number,
    trimHex: string,
    rng: () => number,
  ): void {
    const startY = ry + Math.max(10, cr * 0.72);
    const endY = ry + rugH - Math.max(10, cr * 0.72);
    const step = 8.5;

    for (let y = startY; y <= endY; y += step) {
      const lenLeft = 11 + rng() * 5;
      const lenRight = 11 + rng() * 5;
      const swayL = (rng() - 0.5) * 2.2;
      const swayR = (rng() - 0.5) * 2.2;

      ctx.strokeStyle = 'rgba(42, 26, 16, 0.22)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(rx + 1, y + 1.5);
      ctx.quadraticCurveTo(rx - lenLeft * 0.5, y + 1.5 + swayL * 0.5, rx - lenLeft, y + 1.5 + swayL);
      ctx.stroke();

      ctx.strokeStyle = trimHex;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(rx + 1, y);
      ctx.quadraticCurveTo(rx - lenLeft * 0.5, y + swayL * 0.5, rx - lenLeft, y + swayL);
      ctx.stroke();

      ctx.fillStyle = '#D5C3AE';
      ctx.beginPath();
      ctx.arc(rx - 0.5, y, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(42, 26, 16, 0.22)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(rx + rugW - 1, y + 1.5);
      ctx.quadraticCurveTo(
        rx + rugW + lenRight * 0.5,
        y + 1.5 + swayR * 0.5,
        rx + rugW + lenRight,
        y + 1.5 + swayR,
      );
      ctx.stroke();

      ctx.strokeStyle = trimHex;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(rx + rugW - 1, y);
      ctx.quadraticCurveTo(
        rx + rugW + lenRight * 0.5,
        y + swayR * 0.5,
        rx + rugW + lenRight,
        y + swayR,
      );
      ctx.stroke();

      ctx.fillStyle = '#D5C3AE';
      ctx.beginPath();
      ctx.arc(rx + rugW + 0.5, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  override destroy(): void {
    if (this.cachedTexture && this.cachedTexture !== Texture.EMPTY) {
      this.cachedTexture.destroy(true);
      this.cachedTexture = null;
    }
    super.destroy({ children: true });
  }
}
