import { Container, Graphics } from 'pixi.js';
import type { LaserTarget, Vec2 } from '../types/simulation';
import { computeLaserTargets } from './PrismMath';

const PRISM_RADIUS = 24;

/**
 * Faceted crystal prism prop + glowing red laser dot and refractive 3-way split beams
 * computed via PrismMath.computeLaserTargets.
 */
export class PrismLaser extends Container {
  readonly prismContainer: Container;

  private readonly prismGfx: Graphics;
  private readonly beamGfx: Graphics;

  private viewWidth: number;
  private viewHeight: number;
  private prismPos: Vec2;
  private cursorPos: Vec2;
  private active = false;
  private forceSplit = false;
  private splitActive = false;
  private activeTargets: LaserTarget[] = [];
  private phase = 0;
  private activeDurationSec = 0;

  constructor(width: number, height: number, prismX?: number, prismY?: number) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.viewWidth = Math.max(100, width);
    this.viewHeight = Math.max(100, height);
    this.prismPos = {
      x: prismX ?? Math.round(this.viewWidth * 0.62),
      y: prismY ?? Math.round(this.viewHeight * 0.42),
    };
    this.cursorPos = { x: this.prismPos.x, y: this.prismPos.y };

    this.prismContainer = new Container();
    this.prismContainer.eventMode = 'none';
    this.prismContainer.interactiveChildren = false;

    this.prismGfx = new Graphics();
    this.prismContainer.addChild(this.prismGfx);

    this.beamGfx = new Graphics();
    this.beamGfx.blendMode = 'add';

    this.addChild(this.prismContainer);
    this.addChild(this.beamGfx);

    this.drawPrismProp();
  }

  attachPrismTo(propsLayer: Container): void {
    propsLayer.addChild(this.prismContainer);
  }

  resize(width: number, height: number): void {
    const prevW = this.viewWidth;
    const prevH = this.viewHeight;
    this.viewWidth = Math.max(100, width);
    this.viewHeight = Math.max(100, height);

    if (prevW > 0 && prevH > 0) {
      this.prismPos.x = Math.max(40, Math.min(this.viewWidth - 40, (this.prismPos.x / prevW) * this.viewWidth));
      this.prismPos.y = Math.max(40, Math.min(this.viewHeight - 40, (this.prismPos.y / prevH) * this.viewHeight));
    }
    this.recomputeTargets();
    this.drawPrismProp();
  }

  setCursor(x: number, y: number, active: boolean, forceSplit = false): void {
    this.cursorPos.x = x;
    this.cursorPos.y = y;
    const wasActive = this.active;
    this.active = active;
    if (!active || !wasActive) {
      this.activeDurationSec = 0;
    }
    this.forceSplit = forceSplit;
    this.recomputeTargets();
  }

  setPrismPosition(x: number, y: number): void {
    this.prismPos.x = Math.max(32, Math.min(this.viewWidth - 32, x));
    this.prismPos.y = Math.max(32, Math.min(this.viewHeight - 32, y));
    this.recomputeTargets();
    this.drawPrismProp();
  }

  getPrismPosition(): Vec2 {
    return { x: this.prismPos.x, y: this.prismPos.y };
  }

  getPrismRadius(): number {
    return PRISM_RADIUS;
  }

  getActiveTargets(): LaserTarget[] {
    return this.activeTargets;
  }

  isSplitActive(): boolean {
    return this.active && this.splitActive;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Returns continuous active laser chase duration in seconds (0 when inactive).
   */
  getActiveDuration(): number {
    return this.active ? this.activeDurationSec : 0;
  }

  resetActiveDuration(): void {
    this.activeDurationSec = 0;
  }

  containsPrismPoint(x: number, y: number): boolean {
    return Math.hypot(x - this.prismPos.x, y - this.prismPos.y) <= PRISM_RADIUS + 10;
  }

  update(dt: number): void {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    this.phase += safeDt;
    if (this.active) {
      this.activeDurationSec += safeDt;
    } else {
      this.activeDurationSec = 0;
    }
    this.render(0);
  }

  render(dtStep = 0.016): void {
    if (dtStep > 0) {
      this.phase += dtStep;
    }

    this.drawPrismProp();
    this.beamGfx.clear();

    if (!this.active || this.activeTargets.length === 0) {
      return;
    }

    const pulse = 0.85 + 0.15 * Math.sin(this.phase * 11);

    if (this.splitActive) {
      // Incoming crimson beam from cursor into prism crystal
      this.beamGfx
        .moveTo(this.cursorPos.x, this.cursorPos.y)
        .lineTo(this.prismPos.x, this.prismPos.y)
        .stroke({ width: 5, color: 0xff3b30, alpha: 0.22, cap: 'round' })
        .moveTo(this.cursorPos.x, this.cursorPos.y)
        .lineTo(this.prismPos.x, this.prismPos.y)
        .stroke({ width: 1.8, color: 0xff8a80, alpha: 0.72, cap: 'round' });

      // Specular refraction burst inside prism core
      this.beamGfx
        .circle(this.prismPos.x, this.prismPos.y, 14 * pulse)
        .fill({ color: 0xffe6cc, alpha: 0.22 })
        .circle(this.prismPos.x, this.prismPos.y, 6)
        .fill({ color: 0xfff5ea, alpha: 0.68 });

      // 3 diverging refractive beams -> target dots
      for (const target of this.activeTargets) {
        this.beamGfx
          .moveTo(this.prismPos.x, this.prismPos.y)
          .lineTo(target.x, target.y)
          .stroke({ width: 6, color: target.color, alpha: 0.16, cap: 'round' })
          .moveTo(this.prismPos.x, this.prismPos.y)
          .lineTo(target.x, target.y)
          .stroke({ width: 2.1, color: target.color, alpha: 0.62, cap: 'round' })
          .moveTo(this.prismPos.x, this.prismPos.y)
          .lineTo(target.x, target.y)
          .stroke({ width: 0.9, color: 0xfff6eb, alpha: 0.52, cap: 'round' });

        this.drawLaserDot(target.x, target.y, target.color, pulse);
      }
    } else {
      const target = this.activeTargets[0];
      this.drawLaserDot(target.x, target.y, target.color, pulse);
    }
  }

  private drawLaserDot(x: number, y: number, color: number, pulse: number): void {
    this.beamGfx
      .circle(x, y, 16 * pulse)
      .fill({ color, alpha: 0.16 })
      .circle(x, y, 8.5 * pulse)
      .fill({ color, alpha: 0.42 })
      .circle(x, y, 4.2)
      .fill({ color, alpha: 0.95 })
      .circle(x, y, 1.9)
      .fill({ color: 0xfff5ee, alpha: 0.96 });
  }

  private recomputeTargets(): void {
    if (!this.active) {
      this.activeTargets = [];
      this.splitActive = false;
      return;
    }

    const res = computeLaserTargets(
      this.cursorPos,
      this.prismPos,
      PRISM_RADIUS,
      this.viewWidth,
      this.viewHeight,
      this.forceSplit,
    );
    this.activeTargets = res.targets;
    this.splitActive = res.splitActive;
  }

  private drawPrismProp(): void {
    const px = this.prismPos.x;
    const py = this.prismPos.y;
    const r = PRISM_RADIUS;

    this.prismContainer.position.set(px, py);
    this.prismGfx.clear();

    // Soft contact shadow + subtle refractive rainbow caustics when active
    this.prismGfx
      .regularPoly(3.5, 5.5, r * 0.98, 6, Math.PI / 6)
      .fill({ color: 0x22140b, alpha: 0.24 });

    if (this.active && this.splitActive) {
      this.prismGfx
        .circle(0, 0, r * 1.45)
        .fill({ color: 0xffe4b8, alpha: 0.14 });
    }

    // Outer hexagonal quartz crystal silhouette
    const verts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      verts.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }

    this.prismGfx
      .poly(verts, true)
      .fill({ color: 0xd7eef8, alpha: 0.46 })
      .stroke({ width: 1.5, color: 0xf4fbff, alpha: 0.8 });

    // Faceted inner crown apex shifted slightly top-left for 3D depth
    const apexX = -3.2;
    const apexY = -2.8;
    const facetColors = [0xf5fbff, 0xcee8f5, 0xa8d4eb, 0x9ac6df, 0xbbe1f2, 0xe8f7fe];
    const facetAlphas = [0.58, 0.42, 0.36, 0.32, 0.44, 0.54];

    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      const x1 = verts[i * 2];
      const y1 = verts[i * 2 + 1];
      const x2 = verts[next * 2];
      const y2 = verts[next * 2 + 1];

      this.prismGfx
        .poly([apexX, apexY, x1, y1, x2, y2], true)
        .fill({ color: facetColors[i], alpha: facetAlphas[i] });
    }

    // Crisp inner crown hexagon + radial facet edges
    const innerVerts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      innerVerts.push(apexX + Math.cos(angle) * (r * 0.46), apexY + Math.sin(angle) * (r * 0.46));
    }

    for (let i = 0; i < 6; i++) {
      this.prismGfx
        .moveTo(innerVerts[i * 2], innerVerts[i * 2 + 1])
        .lineTo(verts[i * 2], verts[i * 2 + 1])
        .stroke({ width: 0.9, color: 0xf7fcff, alpha: 0.68 });
    }

    this.prismGfx
      .poly(innerVerts, true)
      .fill({ color: 0xf6fcff, alpha: 0.44 })
      .stroke({ width: 1.1, color: 0xfffdf9, alpha: 0.82 });

    // Subtle specular glint fleck
    this.prismGfx
      .circle(apexX - 2, apexY - 2, 2.2)
      .fill({ color: 0xfffdf9, alpha: 0.78 });
  }

  override destroy(): void {
    this.prismContainer.destroy({ children: true });
    super.destroy({ children: true });
  }
}
