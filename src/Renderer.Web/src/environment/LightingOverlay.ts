import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type {
  EffectiveLightingMode,
  LightingMode,
  SceneTheme,
  WarmZone,
} from '../types/simulation';
import {
  SCENE_THEME_DEFS,
  createSeededRng,
  type SceneThemeDefinition,
} from './SceneThemes';

export type { EffectiveLightingMode };

interface MoteState {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseAlpha: number;
  phase: number;
  freq: number;
  radius: number;
}

interface WarmPoolSlot {
  id: string;
  x: number;
  y: number;
  radius: number;
  targetIntensity: number;
  currentIntensity: number;
  phase: number;
  outerSprite: Sprite;
  coreSprite: Sprite;
}

export function resolveEffectiveMode(
  mode: LightingMode,
  date: Date = new Date(),
): EffectiveLightingMode {
  if (mode !== 'auto') {
    return mode;
  }
  const hour = date.getHours();
  if (hour >= 7 && hour <= 15) {
    return 'day';
  }
  if (hour >= 16 && hour <= 19) {
    return 'golden';
  }
  return 'night';
}

/**
 * Sun- and theme-synced atmosphere overlay: window panes, shoji lattice grids,
 * dappled courtyard canopy shafts + fireflies, and cozy cafe pendant pools.
 */
export class LightingOverlay extends Container {
  private mode: LightingMode;
  private effectiveMode: EffectiveLightingMode;
  private theme: SceneTheme;
  private viewWidth: number;
  private viewHeight: number;
  private time = 0;
  private autoCheckAccum = 0;

  private readonly gradeSprite: Sprite;
  private readonly beamSprite: Sprite;
  private readonly warmZoneLayer: Container;
  private readonly moteLayer: Container;
  private readonly motes: MoteState[] = [];
  private readonly warmPoolSlots = new Map<string, WarmPoolSlot>();
  private externalWarmZones: WarmZone[] = [];

  private gradeTexture: Texture | null = null;
  private beamTexture: Texture | null = null;
  private warmGlowTexture: Texture | null = null;

  constructor(
    width: number,
    height: number,
    mode: LightingMode = 'golden',
    theme: SceneTheme = 'study',
  ) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.viewWidth = Math.max(1, Math.round(width));
    this.viewHeight = Math.max(1, Math.round(height));
    this.mode = mode;
    this.effectiveMode = resolveEffectiveMode(mode);
    this.theme = theme;

    this.gradeSprite = new Sprite(Texture.EMPTY);
    this.beamSprite = new Sprite(Texture.EMPTY);
    this.beamSprite.blendMode = 'screen';

    this.warmZoneLayer = new Container();
    this.warmZoneLayer.eventMode = 'none';
    this.warmZoneLayer.interactiveChildren = false;

    this.moteLayer = new Container();
    this.moteLayer.eventMode = 'none';
    this.moteLayer.interactiveChildren = false;

    this.addChild(this.gradeSprite);
    this.addChild(this.beamSprite);
    this.addChild(this.warmZoneLayer);
    this.addChild(this.moteLayer);

    this.warmGlowTexture = this.buildWarmGlowTexture();
    this.initMotes();
    this.rebuildTextures();
  }

  /**
   * Synchronizes dynamic warm light pools (e.g., clickable Brass Desk Lamp or Paper Andon Lantern)
   * with smooth fade-in / fade-out transitions.
   */
  setWarmZones(zones: readonly WarmZone[]): void {
    this.externalWarmZones = zones.map((z) => ({ ...z }));
    const incomingIds = new Set<string>();

    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      incomingIds.add(zone.id);
      let slot = this.warmPoolSlots.get(zone.id);
      if (!slot) {
        const tex = this.warmGlowTexture ?? Texture.EMPTY;
        const outerSprite = new Sprite(tex);
        outerSprite.anchor.set(0.5);
        outerSprite.blendMode = 'screen';
        outerSprite.alpha = 0;

        const coreSprite = new Sprite(tex);
        coreSprite.anchor.set(0.5);
        coreSprite.blendMode = 'screen';
        coreSprite.alpha = 0;

        this.warmZoneLayer.addChild(outerSprite, coreSprite);
        slot = {
          id: zone.id,
          x: zone.x,
          y: zone.y,
          radius: zone.radius,
          targetIntensity: zone.intensity,
          currentIntensity: 0,
          phase: i * 1.9 + 0.4,
          outerSprite,
          coreSprite,
        };
        this.warmPoolSlots.set(zone.id, slot);
      }

      slot.x = zone.x;
      slot.y = zone.y;
      slot.radius = Math.max(24, zone.radius);
      slot.targetIntensity = Math.max(0, Math.min(1.5, zone.intensity));
    }

    for (const [id, slot] of this.warmPoolSlots.entries()) {
      if (!incomingIds.has(id)) {
        slot.targetIntensity = 0;
      }
    }

    this.applyWarmZoneVisuals(0);
  }

  getWarmZones(): readonly WarmZone[] {
    return this.externalWarmZones;
  }

  setMode(mode: LightingMode): void {
    const nextEffective = resolveEffectiveMode(mode);
    const modeChanged = this.mode !== mode;
    const effectiveChanged = this.effectiveMode !== nextEffective;
    this.mode = mode;
    this.effectiveMode = nextEffective;

    if (effectiveChanged || (modeChanged && this.gradeTexture === null)) {
      this.rebuildTextures();
      this.recolorMotes();
    }
  }

  getMode(): LightingMode {
    return this.mode;
  }

  getEffectiveLighting(): EffectiveLightingMode {
    return this.effectiveMode;
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme && this.gradeTexture !== null) {
      return;
    }
    this.theme = theme;
    this.rebuildTextures();
    this.recolorMotes();
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.viewWidth && h === this.viewHeight && this.gradeTexture !== null) {
      return;
    }

    const scaleX = w / this.viewWidth;
    const scaleY = h / this.viewHeight;
    for (const mote of this.motes) {
      mote.x *= scaleX;
      mote.y *= scaleY;
    }

    this.viewWidth = w;
    this.viewHeight = h;
    this.rebuildTextures();
  }

  update(dt: number): void {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    this.time += safeDt;

    if (this.mode === 'auto') {
      this.autoCheckAccum += safeDt;
      if (this.autoCheckAccum >= 15) {
        this.autoCheckAccum = 0;
        const resolved = resolveEffectiveMode('auto');
        if (resolved !== this.effectiveMode) {
          this.effectiveMode = resolved;
          this.rebuildTextures();
          this.recolorMotes();
        }
      }
    }

    const w = this.viewWidth;
    const h = this.viewHeight;
    const isFireflyNight = this.theme === 'garden' && this.effectiveMode === 'night';
    const alphaMult = SCENE_THEME_DEFS[this.theme].lighting.moteAlphaMult[this.effectiveMode];

    for (const mote of this.motes) {
      if (isFireflyNight) {
        const wanderX = Math.sin(this.time * 0.9 + mote.phase) * 9;
        const wanderY = Math.cos(this.time * 0.72 + mote.phase * 1.4) * 7.5;
        mote.x += (mote.vx * 0.45 + wanderX) * safeDt;
        mote.y += (mote.vy * 0.35 + wanderY) * safeDt;
      } else {
        const driftX = mote.vx + Math.sin(this.time * 0.7 + mote.phase) * 3.5;
        const driftY = mote.vy + Math.cos(this.time * 0.55 + mote.phase * 1.3) * 2.5;
        mote.x += driftX * safeDt;
        mote.y += driftY * safeDt;
      }

      if (mote.x < -16) mote.x = w + 16;
      if (mote.x > w + 16) mote.x = -16;
      if (mote.y < -16) mote.y = h + 16;
      if (mote.y > h + 16) mote.y = -16;

      let pulse: number;
      if (isFireflyNight) {
        const wave = Math.max(0, Math.sin(this.time * (mote.freq * 0.85) + mote.phase));
        pulse = 0.14 + 0.86 * Math.pow(wave, 2.2);
      } else {
        pulse = 0.55 + 0.45 * Math.sin(this.time * mote.freq + mote.phase);
      }

      mote.gfx.position.set(mote.x, mote.y);
      mote.gfx.alpha = Math.min(1, mote.baseAlpha * alphaMult * pulse);
    }

    this.applyWarmZoneVisuals(safeDt);
  }

  private applyWarmZoneVisuals(dt: number): void {
    const propsPalette = SCENE_THEME_DEFS[this.theme].props;
    const modeBoost =
      this.effectiveMode === 'night'
        ? 0.62
        : this.effectiveMode === 'golden'
          ? 0.34
          : 0.18;

    const toDelete: string[] = [];
    for (const [id, slot] of this.warmPoolSlots.entries()) {
      const rate = dt > 0 ? Math.min(1, dt * 7.5) : 0.28;
      slot.currentIntensity += (slot.targetIntensity - slot.currentIntensity) * rate;

      if (slot.targetIntensity <= 0.001 && slot.currentIntensity < 0.01) {
        this.warmZoneLayer.removeChild(slot.outerSprite, slot.coreSprite);
        slot.outerSprite.destroy();
        slot.coreSprite.destroy();
        toDelete.push(id);
        continue;
      }

      const breathe = 1 + Math.sin(this.time * 2.4 + slot.phase) * 0.045;
      const eff = Math.max(0, slot.currentIntensity) * modeBoost;

      slot.outerSprite.position.set(slot.x, slot.y);
      slot.outerSprite.width = slot.radius * 2.5 * breathe;
      slot.outerSprite.height = slot.radius * 2.5 * breathe;
      slot.outerSprite.tint = propsPalette.warmGlowColor;
      slot.outerSprite.alpha = Math.min(0.85, eff * 0.78);

      slot.coreSprite.position.set(slot.x, slot.y);
      slot.coreSprite.width = slot.radius * 1.15 * breathe;
      slot.coreSprite.height = slot.radius * 1.15 * breathe;
      slot.coreSprite.tint = propsPalette.warmCoreColor;
      slot.coreSprite.alpha = Math.min(0.75, eff * 0.62);
    }

    for (const id of toDelete) {
      this.warmPoolSlots.delete(id);
    }
  }

  private buildWarmGlowTexture(): Texture | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.32, 'rgba(255, 250, 240, 0.52)');
    grad.addColorStop(0.68, 'rgba(255, 242, 220, 0.16)');
    grad.addColorStop(1, 'rgba(255, 240, 210, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(canvas, true);
  }

  private initMotes(): void {
    const rng = createSeededRng(9187);
    const count = 28;
    for (let i = 0; i < count; i++) {
      const radius = 1.4 + rng() * 2.4;
      const gfx = new Graphics();
      gfx.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 1 });
      gfx.circle(0, 0, radius * 2.4).fill({ color: 0xffffff, alpha: 0.24 });
      this.moteLayer.addChild(gfx);

      const speedScale = 6 + rng() * 10;
      this.motes.push({
        gfx,
        x: rng() * this.viewWidth,
        y: rng() * this.viewHeight,
        vx: speedScale * 0.72,
        vy: speedScale * 0.36 + (rng() - 0.5) * 4,
        baseAlpha: 0.18 + rng() * 0.34,
        phase: rng() * Math.PI * 2,
        freq: 0.9 + rng() * 1.4,
        radius,
      });
    }
    this.recolorMotes();
  }

  private recolorMotes(): void {
    const cfg = SCENE_THEME_DEFS[this.theme].lighting;
    const tint = cfg.moteTints[this.effectiveMode];
    const alphaMult = cfg.moteAlphaMult[this.effectiveMode];
    const isFireflyNight = this.theme === 'garden' && this.effectiveMode === 'night';

    for (const mote of this.motes) {
      mote.gfx.tint = tint;
      mote.gfx.scale.set(isFireflyNight ? 1.25 : 1);
      mote.gfx.alpha = Math.min(1, mote.baseAlpha * alphaMult);
    }
  }

  private rebuildTextures(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const w = this.viewWidth;
    const h = this.viewHeight;

    const gradeCanvas = document.createElement('canvas');
    gradeCanvas.width = w;
    gradeCanvas.height = h;
    const gCtx = gradeCanvas.getContext('2d');

    const beamCanvas = document.createElement('canvas');
    beamCanvas.width = w;
    beamCanvas.height = h;
    const bCtx = beamCanvas.getContext('2d');

    if (gCtx && bCtx) {
      const def = SCENE_THEME_DEFS[this.theme];
      if (this.effectiveMode === 'day') {
        this.paintDay(gCtx, bCtx, w, h, def);
      } else if (this.effectiveMode === 'golden') {
        this.paintGolden(gCtx, bCtx, w, h, def);
      } else {
        this.paintNight(gCtx, bCtx, w, h, def);
      }
    }

    const nextGrade = Texture.from(gradeCanvas, true);
    const nextBeam = Texture.from(beamCanvas, true);

    const oldGrade = this.gradeTexture;
    const oldBeam = this.beamTexture;

    this.gradeSprite.texture = nextGrade;
    this.gradeSprite.width = w;
    this.gradeSprite.height = h;
    this.gradeTexture = nextGrade;

    this.beamSprite.texture = nextBeam;
    this.beamSprite.width = w;
    this.beamSprite.height = h;
    this.beamTexture = nextBeam;

    if (oldGrade && oldGrade !== Texture.EMPTY) oldGrade.destroy(true);
    if (oldBeam && oldBeam !== Texture.EMPTY) oldBeam.destroy(true);
  }

  private paintDay(
    gCtx: CanvasRenderingContext2D,
    bCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    def: SceneThemeDefinition,
  ): void {
    const airGrad = gCtx.createLinearGradient(0, 0, w, h);
    airGrad.addColorStop(0, def.lighting.dayGradeTop);
    airGrad.addColorStop(0.65, def.lighting.dayGradeMid);
    airGrad.addColorStop(1, def.lighting.dayGradeBot);
    gCtx.fillStyle = airGrad;
    gCtx.fillRect(0, 0, w, h);

    this.paintThemeDayBeams(
      gCtx,
      bCtx,
      w,
      h,
      def.lighting.dayBeamStart,
      def.lighting.dayBeamMid,
      def.lighting.dayBeamEnd,
    );
  }

  private paintGolden(
    gCtx: CanvasRenderingContext2D,
    bCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    def: SceneThemeDefinition,
  ): void {
    const warmGrad = gCtx.createRadialGradient(
      w * 0.16,
      h * 0.12,
      Math.min(w, h) * 0.05,
      w * 0.45,
      h * 0.48,
      Math.hypot(w, h) * 0.65,
    );
    warmGrad.addColorStop(0, def.lighting.goldenStart);
    warmGrad.addColorStop(0.55, def.lighting.goldenMid);
    warmGrad.addColorStop(1, def.lighting.goldenEdge);
    gCtx.fillStyle = warmGrad;
    gCtx.fillRect(0, 0, w, h);

    this.paintThemeDayBeams(
      gCtx,
      bCtx,
      w,
      h,
      def.lighting.goldenBeamStart,
      def.lighting.goldenBeamMid,
      def.lighting.goldenBeamEnd,
    );
  }

  private paintThemeDayBeams(
    gCtx: CanvasRenderingContext2D,
    bCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    startColor: string,
    midColor: string,
    endColor: string,
  ): void {
    switch (this.theme) {
      case 'tatami':
        this.drawShojiLatticeBeams(bCtx, w, h, startColor, midColor, endColor);
        break;
      case 'garden':
        this.drawCanopyDappledBeams(gCtx, bCtx, w, h, startColor, midColor, endColor);
        break;
      case 'cafe':
        this.drawCafeStorefrontBeams(gCtx, bCtx, w, h, startColor, midColor, endColor);
        break;
      case 'study':
      default:
        this.drawWindowShafts(bCtx, w, h, startColor, midColor, endColor);
        break;
    }
  }

  private paintNight(
    gCtx: CanvasRenderingContext2D,
    bCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    def: SceneThemeDefinition,
  ): void {
    const cx = w * 0.5;
    const cy = h * 0.49;
    const lampRadius = Math.min(w, h) * 0.44;

    const moonGrad = gCtx.createRadialGradient(
      cx,
      cy,
      lampRadius * 0.25,
      cx,
      cy,
      Math.hypot(w, h) * 0.58,
    );
    moonGrad.addColorStop(0, def.lighting.nightInner);
    moonGrad.addColorStop(0.45, def.lighting.nightMid);
    moonGrad.addColorStop(1, def.lighting.nightEdge);
    gCtx.fillStyle = moonGrad;
    gCtx.fillRect(0, 0, w, h);

    // Subtle cool moon wash from top-right
    const moonBeam = bCtx.createLinearGradient(w * 0.85, 0, w * 0.4, h * 0.75);
    moonBeam.addColorStop(0, def.lighting.nightCoolShaft);
    moonBeam.addColorStop(1, 'rgba(136, 168, 224, 0)');
    bCtx.fillStyle = moonBeam;
    bCtx.beginPath();
    bCtx.moveTo(w * 0.58, 0);
    bCtx.lineTo(w, 0);
    bCtx.lineTo(w, h * 0.52);
    bCtx.lineTo(w * 0.34, h * 0.88);
    bCtx.closePath();
    bCtx.fill();

    if (this.theme === 'tatami') {
      // Primary warm paper lantern (andon) glow + secondary subtle lantern corner halo
      this.drawWarmPool(
        bCtx,
        cx,
        cy,
        lampRadius * 0.95,
        def.lighting.nightPoolInner,
        def.lighting.nightPoolMid,
        def.lighting.nightPoolEdge,
      );
      this.drawWarmPool(
        bCtx,
        w * 0.16,
        h * 0.2,
        lampRadius * 0.65,
        'rgba(255, 190, 104, 0.14)',
        'rgba(235, 152, 72, 0.06)',
        def.lighting.nightPoolEdge,
      );
    } else if (this.theme === 'cafe') {
      // Three cozy cafe Edison pendant light pools across lounge & tables
      this.drawWarmPool(
        bCtx,
        cx,
        cy,
        lampRadius * 0.88,
        def.lighting.nightPoolInner,
        def.lighting.nightPoolMid,
        def.lighting.nightPoolEdge,
      );
      this.drawWarmPool(
        bCtx,
        w * 0.23,
        h * 0.33,
        lampRadius * 0.62,
        'rgba(255, 200, 122, 0.17)',
        'rgba(238, 164, 84, 0.07)',
        def.lighting.nightPoolEdge,
      );
      this.drawWarmPool(
        bCtx,
        w * 0.78,
        h * 0.64,
        lampRadius * 0.6,
        'rgba(255, 198, 120, 0.15)',
        'rgba(238, 164, 84, 0.06)',
        def.lighting.nightPoolEdge,
      );
    } else if (this.theme === 'garden') {
      // Warm stone-garden lantern pool near courtyard edge & soft center moon glow
      this.drawWarmPool(
        bCtx,
        w * 0.24,
        h * 0.26,
        lampRadius * 0.68,
        def.lighting.nightPoolInner,
        def.lighting.nightPoolMid,
        def.lighting.nightPoolEdge,
      );
      this.drawWarmPool(
        bCtx,
        cx,
        cy,
        lampRadius * 0.82,
        'rgba(180, 214, 240, 0.09)',
        'rgba(140, 180, 216, 0.03)',
        'rgba(140, 180, 216, 0)',
      );
    } else {
      // Warm circular amber study desk-lamp glow pool over center rug
      this.drawWarmPool(
        bCtx,
        cx,
        cy,
        lampRadius,
        def.lighting.nightPoolInner,
        def.lighting.nightPoolMid,
        def.lighting.nightPoolEdge,
      );
    }
  }

  private drawWarmPool(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    inner: string,
    mid: string,
    edge: string,
  ): void {
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
    glow.addColorStop(0, inner);
    glow.addColorStop(0.55, mid);
    glow.addColorStop(1, edge);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
  }

  private drawWindowShafts(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    startColor: string,
    midColor: string,
    endColor: string,
  ): void {
    const shafts = [
      { topX0: -0.05 * w, topX1: 0.18 * w, botX0: 0.22 * w, botX1: 0.5 * w },
      { topX0: 0.22 * w, topX1: 0.44 * w, botX0: 0.54 * w, botX1: 0.8 * w },
      { topX0: 0.48 * w, topX1: 0.64 * w, botX0: 0.84 * w, botX1: 1.04 * w },
    ];

    for (const shaft of shafts) {
      const grad = ctx.createLinearGradient(
        (shaft.topX0 + shaft.topX1) * 0.5,
        0,
        (shaft.botX0 + shaft.botX1) * 0.5,
        h * 0.92,
      );
      grad.addColorStop(0, startColor);
      grad.addColorStop(0.75, midColor);
      grad.addColorStop(1, endColor);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(shaft.topX0, 0);
      ctx.lineTo(shaft.topX1, 0);
      ctx.lineTo(shaft.botX1, h);
      ctx.lineTo(shaft.botX0, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawShojiLatticeBeams(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    startColor: string,
    midColor: string,
    endColor: string,
  ): void {
    // Broad warm shoji screen sun wash
    const washGrad = ctx.createLinearGradient(w * 0.15, 0, w * 0.65, h * 0.95);
    washGrad.addColorStop(0, startColor);
    washGrad.addColorStop(0.68, midColor);
    washGrad.addColorStop(1, endColor);

    ctx.fillStyle = washGrad;
    ctx.beginPath();
    ctx.moveTo(-0.04 * w, 0);
    ctx.lineTo(0.68 * w, 0);
    ctx.lineTo(1.06 * w, h);
    ctx.lineTo(0.24 * w, h);
    ctx.closePath();
    ctx.fill();

    // Soft kumiko lattice bars carved out with gentle feathered destination-out
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.lineCap = 'round';

    const cols = 4;
    ctx.lineWidth = Math.max(8, Math.round(w * 0.008));
    for (let c = 1; c < cols; c++) {
      const frac = c / cols;
      const topX = -0.04 * w + frac * 0.72 * w;
      const botX = 0.24 * w + frac * 0.82 * w;
      ctx.beginPath();
      ctx.moveTo(topX, 0);
      ctx.lineTo(botX, h);
      ctx.stroke();
    }

    const rows = 4;
    ctx.lineWidth = Math.max(7, Math.round(h * 0.009));
    for (let r = 1; r < rows; r++) {
      const y = (r / rows) * h;
      ctx.beginPath();
      ctx.moveTo(0, y - h * 0.04);
      ctx.lineTo(w, y + h * 0.05);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawCanopyDappledBeams(
    gCtx: CanvasRenderingContext2D,
    bCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    startColor: string,
    midColor: string,
    endColor: string,
  ): void {
    const rng = createSeededRng(33409);

    // Subtle olive canopy shadow pockets on grade layer
    for (let i = 0; i < 8; i++) {
      const sx = rng() * w;
      const sy = rng() * h;
      const sr = Math.min(w, h) * (0.14 + rng() * 0.16);
      const canopyShadow = gCtx.createRadialGradient(sx, sy, sr * 0.1, sx, sy, sr);
      canopyShadow.addColorStop(0, 'rgba(22, 34, 18, 0.07)');
      canopyShadow.addColorStop(1, 'rgba(22, 34, 18, 0)');
      gCtx.fillStyle = canopyShadow;
      gCtx.fillRect(0, 0, w, h);
    }

    // Broad warm courtyard shafts
    this.drawWindowShafts(bCtx, w, h, startColor, midColor, endColor);

    // Carve soft dappled foliage shadow cutouts inside beams
    bCtx.save();
    bCtx.globalCompositeOperation = 'destination-out';
    const holeCount = 26;
    for (let i = 0; i < holeCount; i++) {
      const hx = rng() * w;
      const hy = rng() * h;
      const rx = 24 + rng() * 54;
      const hole = bCtx.createRadialGradient(hx, hy, rx * 0.15, hx, hy, rx);
      hole.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
      hole.addColorStop(0.65, 'rgba(0, 0, 0, 0.35)');
      hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
      bCtx.fillStyle = hole;
      bCtx.beginPath();
      bCtx.arc(hx, hy, rx, 0, Math.PI * 2);
      bCtx.fill();
    }
    bCtx.restore();

    // Soft warm sun-flecks breaking through canopy leaves
    for (let i = 0; i < 16; i++) {
      const fx = w * (0.08 + rng() * 0.84);
      const fy = h * (0.08 + rng() * 0.8);
      const fr = 16 + rng() * 28;
      const fleck = bCtx.createRadialGradient(fx, fy, 2, fx, fy, fr);
      fleck.addColorStop(0, midColor);
      fleck.addColorStop(1, endColor);
      bCtx.fillStyle = fleck;
      bCtx.beginPath();
      bCtx.arc(fx, fy, fr, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  private drawCafeStorefrontBeams(
    gCtx: CanvasRenderingContext2D,
    bCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    startColor: string,
    midColor: string,
    endColor: string,
  ): void {
    // Gentle cafe awning shade along upper edge
    const awningGrad = gCtx.createLinearGradient(0, 0, 0, h * 0.22);
    awningGrad.addColorStop(0, 'rgba(42, 26, 18, 0.14)');
    awningGrad.addColorStop(1, 'rgba(42, 26, 18, 0)');
    gCtx.fillStyle = awningGrad;
    gCtx.fillRect(0, 0, w, h * 0.22);

    // Two wide warm storefront window beams
    const panes = [
      { topX0: 0.04 * w, topX1: 0.36 * w, botX0: 0.22 * w, botX1: 0.62 * w },
      { topX0: 0.4 * w, topX1: 0.72 * w, botX0: 0.66 * w, botX1: 1.02 * w },
    ];
    for (const pane of panes) {
      const grad = bCtx.createLinearGradient(
        (pane.topX0 + pane.topX1) * 0.5,
        h * 0.04,
        (pane.botX0 + pane.botX1) * 0.5,
        h * 0.94,
      );
      grad.addColorStop(0, startColor);
      grad.addColorStop(0.75, midColor);
      grad.addColorStop(1, endColor);
      bCtx.fillStyle = grad;
      bCtx.beginPath();
      bCtx.moveTo(pane.topX0, 0);
      bCtx.lineTo(pane.topX1, 0);
      bCtx.lineTo(pane.botX1, h);
      bCtx.lineTo(pane.botX0, h);
      bCtx.closePath();
      bCtx.fill();
    }
  }

  override destroy(): void {
    if (this.gradeTexture && this.gradeTexture !== Texture.EMPTY) {
      this.gradeTexture.destroy(true);
      this.gradeTexture = null;
    }
    if (this.beamTexture && this.beamTexture !== Texture.EMPTY) {
      this.beamTexture.destroy(true);
      this.beamTexture = null;
    }
    if (this.warmGlowTexture && this.warmGlowTexture !== Texture.EMPTY) {
      this.warmGlowTexture.destroy(true);
      this.warmGlowTexture = null;
    }
    this.warmPoolSlots.clear();
    super.destroy({ children: true });
  }
}
