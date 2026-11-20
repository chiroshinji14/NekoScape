import { Container, Graphics } from 'pixi.js';
import type {
  AabbRect,
  AmbientCritter,
  DroppedTreat,
  EffectiveLightingMode,
  InteractivePropState,
  PropHitResult,
  PropParticleBurst,
  RugBounds,
  SceneTheme,
  WarmZone,
} from '../types/simulation';
import {
  InteractivePropWorld,
  type AmbientCritterRuntime,
  type InteractivePropRuntime,
} from './InteractiveProp';
import { SCENE_THEME_DEFS } from './SceneThemes';

export interface SceneCuriositySpot {
  x: number;
  y: number;
  kind: 'watch' | 'nap' | 'sniff';
  label: string;
}

interface PropVisualNode {
  prop: InteractivePropRuntime;
  root: Container;
  hoverRing: Graphics;
  shadowGfx: Graphics;
  bodyGfx: Graphics;
  animGfx: Graphics;
  glowGfx: Graphics | null;
}

interface SteamWisp {
  gfx: Graphics;
  prop: InteractivePropRuntime;
  offsetX: number;
  offsetY: number;
  phase: number;
  speed: number;
  driftX: number;
}

interface SakuraPetal {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  freq: number;
}

/**
 * Renders rich, handcrafted top-down PixiJS v8 interactive props across all 4 scenes
 * (`study`, `tatami`, `garden`, `cafe`), plus user-dropped treats, warm lamp/lantern halos,
 * subtle hover highlight rings, click animations, and drifting butterflies / fireflies / sakura.
 */
export class ScenePropsOverlay {
  readonly underContainer: Container;
  readonly overContainer: Container;

  private readonly world: InteractivePropWorld;
  private readonly propsUnderLayer: Container;
  private readonly treatsLayer: Container;
  private readonly glowOverLayer: Container;
  private readonly steamOverLayer: Container;
  private readonly effectsOverLayer: Container;
  private readonly crittersOverLayer: Container;
  private readonly ambientOverLayer: Container;

  private readonly propNodes: PropVisualNode[] = [];
  private readonly steamWisps: SteamWisp[] = [];
  private readonly sakuraPetals: SakuraPetal[] = [];
  private readonly treatGraphics = new Map<string, Graphics>();
  private readonly critterGraphics = new Map<string, Graphics>();
  private readonly effectsGfx: Graphics;

  private viewWidth: number;
  private viewHeight: number;
  private rugBounds: RugBounds;

  constructor(
    width: number,
    height: number,
    rugBounds: RugBounds,
    theme: SceneTheme = 'study',
  ) {
    this.viewWidth = Math.max(320, Math.round(width));
    this.viewHeight = Math.max(240, Math.round(height));
    this.rugBounds = { ...rugBounds };

    this.world = new InteractivePropWorld(this.viewWidth, this.viewHeight, this.rugBounds, theme);

    this.underContainer = new Container();
    this.underContainer.eventMode = 'none';
    this.underContainer.interactiveChildren = false;

    this.overContainer = new Container();
    this.overContainer.eventMode = 'none';
    this.overContainer.interactiveChildren = false;

    this.propsUnderLayer = new Container();
    this.treatsLayer = new Container();
    this.underContainer.addChild(this.propsUnderLayer, this.treatsLayer);

    this.glowOverLayer = new Container();
    this.steamOverLayer = new Container();
    this.effectsOverLayer = new Container();
    this.crittersOverLayer = new Container();
    this.ambientOverLayer = new Container();

    this.effectsGfx = new Graphics();
    this.effectsOverLayer.addChild(this.effectsGfx);

    this.overContainer.addChild(
      this.glowOverLayer,
      this.steamOverLayer,
      this.effectsOverLayer,
      this.crittersOverLayer,
      this.ambientOverLayer,
    );

    this.rebuildVisuals();
  }

  public setTheme(theme: SceneTheme): void {
    if (this.world.getTheme() === theme && this.propNodes.length > 0) {
      return;
    }
    this.world.setTheme(theme);
    this.rebuildVisuals();
  }

  public getTheme(): SceneTheme {
    return this.world.getTheme();
  }

  public setNightMode(night: boolean): void {
    this.world.setNightMode(night);
  }

  public setLightingMode(mode: EffectiveLightingMode): void {
    this.world.setLighting(mode);
  }

  public setPropsEnabled(enabled: boolean): void {
    this.world.setEnabled(enabled);
    this.propsUnderLayer.visible = enabled;
    this.glowOverLayer.visible = enabled;
    this.steamOverLayer.visible = enabled;
    this.ambientOverLayer.visible = enabled;
  }

  public isPropsEnabled(): boolean {
    return this.world.isEnabled();
  }

  public resize(width: number, height: number, rugBounds: RugBounds): void {
    this.viewWidth = Math.max(320, Math.round(width));
    this.viewHeight = Math.max(240, Math.round(height));
    this.rugBounds = { ...rugBounds };
    this.world.resize(this.viewWidth, this.viewHeight, this.rugBounds);
    this.rebuildVisuals();
  }

  public getTime(): number {
    return this.world.getTime();
  }

  public getObstacles(): readonly AabbRect[] {
    return this.world.getObstacles();
  }

  public getInteractiveProps(): readonly InteractivePropState[] {
    return this.world.getProps();
  }

  public getPropById(propId: string): InteractivePropState | null {
    return this.world.getPropById(propId);
  }

  public getWarmZones(): WarmZone[] {
    return this.world.getWarmZones();
  }

  public getActiveTreats(): readonly DroppedTreat[] {
    return this.world.getActiveTreats();
  }

  public getAmbientCritters(): readonly AmbientCritter[] {
    return this.world.getAmbientCritters();
  }

  public getCuriositySpots(): readonly SceneCuriositySpot[] {
    return this.world.getProps().map((prop) => {
      const kind: SceneCuriositySpot['kind'] =
        prop.interactionType === 'cozy' || prop.interactionType === 'warmth'
          ? 'nap'
          : prop.interactionType === 'play' || prop.interactionType === 'water'
            ? 'watch'
            : 'sniff';
      return {
        x: prop.interactPoint.x,
        y: prop.interactPoint.y,
        kind,
        label: prop.label,
      };
    });
  }

  public spawnTreat(x?: number, y?: number): DroppedTreat {
    const treat = this.world.spawnTreat(x, y);
    this.syncTreatVisuals();
    return treat;
  }

  public consumeTreatBite(treatId: string, catId: number): boolean {
    const consumed = this.world.consumeTreatBite(treatId, catId);
    if (consumed) {
      this.syncTreatVisuals();
    }
    return consumed;
  }

  public notifyCatInteract(propId: string, catId: number): PropParticleBurst[] {
    return this.world.notifyCatInteract(propId, catId);
  }

  public handlePointerMove(x: number, y: number): InteractivePropState | null {
    return this.world.handlePointerMove(x, y);
  }

  public handlePointerClick(x: number, y: number): PropHitResult | null {
    const result = this.world.handlePointerClick(x, y);
    if (result) {
      if (result.spawnedTreatPoint) {
        this.syncTreatVisuals();
      }
      if (result.spawnedCritter) {
        this.syncCritterVisuals();
      }
    }
    return result;
  }

  public update(dt: number): void {
    const safeDt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
    this.world.update(safeDt);

    const time = this.world.getTime();
    const lighting = this.world.getEffectiveLighting();
    const palette = SCENE_THEME_DEFS[this.world.getTheme()].props;

    // 1. Update each interactive prop's hover halo, squash/bounce, and custom animation layer
    if (this.world.isEnabled()) {
      for (const node of this.propNodes) {
        this.updatePropVisual(node, time, lighting, palette);
      }

      // 2. Update rising steam wisps (boosted right after click)
      for (const w of this.steamWisps) {
        const boost = 1 + w.prop.pulseTime * 1.45 + (w.prop.isActive ? 0.35 : 0);
        const u = (((time * w.speed * (1 + w.prop.pulseTime * 0.4) + w.phase) % 1) + 1) % 1;
        const sway = Math.sin(u * Math.PI * 2 + w.phase * 4.5) * (4.2 * boost);
        w.gfx.position.set(
          w.prop.x + w.offsetX + sway + u * w.driftX,
          w.prop.y + w.offsetY - u * (17 + w.prop.pulseTime * 8),
        );
        const scale = (0.62 + u * 0.72) * (1 + w.prop.pulseTime * 0.25);
        w.gfx.scale.set(scale);
        w.gfx.alpha = Math.sin(u * Math.PI) * Math.min(0.75, 0.42 * boost);
      }

      // 3. Update drifting Tatami sakura petals
      for (const p of this.sakuraPetals) {
        p.x += p.vx * safeDt;
        p.y += p.vy * safeDt;
        if (p.x < -28) p.x = this.viewWidth + 24;
        if (p.x > this.viewWidth + 28) p.x = -24;
        if (p.y < -28) p.y = this.viewHeight + 24;
        if (p.y > this.viewHeight + 28) p.y = -24;

        const bobX = Math.sin(time * p.freq + p.phase) * 6;
        const bobY = Math.cos(time * p.freq * 0.75 + p.phase) * 4;
        p.gfx.position.set(p.x + bobX, p.y + bobY);
        p.gfx.rotation = time * 1.05 + p.phase;
      }
    }

    // 4. Update dynamic user-dropped treats (gentle pulsing attraction glow)
    this.syncTreatVisuals();
    for (const treat of this.world.getActiveTreats()) {
      const gfx = this.treatGraphics.get(treat.id);
      if (!gfx) continue;
      this.drawTreatGraphic(gfx, treat, time);
    }

    // 5. Update ambient & launched butterflies / fireflies
    this.syncCritterVisuals();
    for (const critter of this.world.getAmbientCritters()) {
      const gfx = this.critterGraphics.get(critter.id);
      if (!gfx) continue;
      this.updateCritterVisual(gfx, critter, time);
    }

    // 6. Update click ripple / acoustic chime / catnip aura rings
    this.drawClickEffects();
  }

  public destroy(): void {
    this.propNodes.length = 0;
    this.steamWisps.length = 0;
    this.sakuraPetals.length = 0;
    this.treatGraphics.clear();
    this.critterGraphics.clear();
    this.underContainer.destroy({ children: true });
    this.overContainer.destroy({ children: true });
  }

  // ============================================================================
  // Visual Construction & Synchronization
  // ============================================================================

  private rebuildVisuals(): void {
    this.propNodes.length = 0;
    this.steamWisps.length = 0;
    this.sakuraPetals.length = 0;

    this.propsUnderLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.glowOverLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.steamOverLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ambientOverLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    const props = this.world.getAllPropsInternal();
    const palette = SCENE_THEME_DEFS[this.world.getTheme()].props;

    for (const prop of props) {
      const root = new Container();
      root.position.set(prop.x, prop.y);

      const hoverRing = new Graphics();
      const shadowGfx = new Graphics();
      const bodyGfx = new Graphics();
      const animGfx = new Graphics();

      root.addChild(hoverRing, shadowGfx, bodyGfx, animGfx);
      this.propsUnderLayer.addChild(root);

      let glowGfx: Graphics | null = null;
      if (prop.kind === 'brass_lamp' || prop.kind === 'andon_lantern') {
        glowGfx = new Graphics();
        glowGfx.position.set(prop.x, prop.y);
        glowGfx.blendMode = 'screen';
        this.glowOverLayer.addChild(glowGfx);
      }

      const node: PropVisualNode = {
        prop,
        root,
        hoverRing,
        shadowGfx,
        bodyGfx,
        animGfx,
        glowGfx,
      };
      this.drawPropStaticLayers(node, palette.shadowColor);
      this.registerPropSteam(prop);
      this.propNodes.push(node);
    }

    // Drifting ambient sakura petals for Kyoto Tatami
    if (this.world.getTheme() === 'tatami') {
      this.buildSakuraPetals();
    }

    this.syncTreatVisuals();
    this.syncCritterVisuals();

    // Paint initial frame of animated layers cleanly.
    const time = this.world.getTime();
    const lighting = this.world.getEffectiveLighting();
    for (const node of this.propNodes) {
      this.updatePropVisual(node, time, lighting, palette);
    }
  }

  private registerPropSteam(prop: InteractivePropRuntime): void {
    if (prop.kind === 'coffee_mug') {
      this.addSteamWisps(prop, 0, -4, 3, 0xf7efe6);
    } else if (prop.kind === 'tetsubin_tea') {
      this.addSteamWisps(prop, -12, -6, 2, 0xf4f0e8);
      this.addSteamWisps(prop, 14, 4, 2, 0xe2f0d5);
    } else if (prop.kind === 'latte_saucer') {
      this.addSteamWisps(prop, -11, -7, 3, 0xf9f0e4);
    }
  }

  private addSteamWisps(
    prop: InteractivePropRuntime,
    offsetX: number,
    offsetY: number,
    count: number,
    color: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const gfx = new Graphics();
      gfx
        .moveTo(0, 4)
        .quadraticCurveTo(-3, 0, 1.2, -4.5)
        .quadraticCurveTo(3.8, -8.5, -1, -12.5)
        .stroke({ width: 1.6, color, alpha: 0.82, cap: 'round' });
      this.steamOverLayer.addChild(gfx);
      this.steamWisps.push({
        gfx,
        prop,
        offsetX,
        offsetY,
        phase: i / count,
        speed: 0.4 + i * 0.08,
        driftX: (i - (count - 1) * 0.5) * 4,
      });
    }
  }

  private buildSakuraPetals(): void {
    for (let i = 0; i < 8; i++) {
      const petal = new Graphics();
      petal
        .moveTo(0, -3.4)
        .bezierCurveTo(3.3, -3.4, 3.8, 1.8, 0, 3.8)
        .bezierCurveTo(-3.8, 1.8, -3.3, -3.4, 0, -3.4)
        .fill({ color: i % 2 === 0 ? 0xf6c2cc : 0xfbe0e5, alpha: 0.84 });
      this.ambientOverLayer.addChild(petal);
      this.sakuraPetals.push({
        gfx: petal,
        x: ((i * 211 + 80) % Math.max(260, this.viewWidth - 100)) + 50,
        y: ((i * 139 + 45) % Math.max(180, this.viewHeight - 80)) + 40,
        vx: -13 - (i % 3) * 4,
        vy: 8 + (i % 3) * 3,
        phase: i * 1.1,
        freq: 1.7 + (i % 3) * 0.35,
      });
    }
  }

  private syncTreatVisuals(): void {
    const active = this.world.getActiveTreats();
    const activeIds = new Set(active.map((t) => t.id));

    for (const [id, gfx] of this.treatGraphics.entries()) {
      if (!activeIds.has(id)) {
        this.treatsLayer.removeChild(gfx);
        gfx.destroy();
        this.treatGraphics.delete(id);
      }
    }

    for (const treat of active) {
      if (!this.treatGraphics.has(treat.id)) {
        const gfx = new Graphics();
        this.treatsLayer.addChild(gfx);
        this.treatGraphics.set(treat.id, gfx);
        this.drawTreatGraphic(gfx, treat, this.world.getTime());
      }
    }
  }

  private syncCritterVisuals(): void {
    const active = this.world.getAmbientCritters();
    const activeIds = new Set(active.map((c) => c.id));

    for (const [id, gfx] of this.critterGraphics.entries()) {
      if (!activeIds.has(id)) {
        this.crittersOverLayer.removeChild(gfx);
        gfx.destroy();
        this.critterGraphics.delete(id);
      }
    }

    for (const critter of active) {
      if (!this.critterGraphics.has(critter.id)) {
        const gfx = new Graphics();
        this.crittersOverLayer.addChild(gfx);
        this.critterGraphics.set(critter.id, gfx);
        this.updateCritterVisual(gfx, critter, this.world.getTime());
      }
    }
  }

  // ============================================================================
  // Per-Prop Top-Down Procedural PixiJS v8 Art (Static Base + Contact Shadows)
  // ============================================================================

  private drawPropStaticLayers(node: PropVisualNode, shadowColor: number): void {
    const { prop, shadowGfx, bodyGfx } = node;
    shadowGfx.clear();
    bodyGfx.clear();

    switch (prop.kind) {
      case 'brass_lamp':
        this.drawBrassLampBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'coffee_mug':
        this.drawCoffeeMugBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'leather_journal':
        this.drawLeatherJournalBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'monstera_scratcher':
        this.drawMonsteraScratcherBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'andon_lantern':
        this.drawAndonLanternBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'tetsubin_tea':
        this.drawTetsubinTeaBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'zabuton_cushion':
        this.drawZabutonBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'bamboo_clacker':
        this.drawBambooClackerBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'koi_birdbath':
        this.drawKoiBirdbathBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'catnip_planter':
        this.drawCatnipPlanterBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'butterfly_stone':
        this.drawButterflyStoneBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'wind_chime':
        this.drawWindChimeBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'cat_tree_tower':
        this.drawCatTreeBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'treat_jar':
        this.drawTreatJarBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'latte_saucer':
        this.drawLatteSaucerBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'donut_cat_bed':
        this.drawDonutBedBase(shadowGfx, bodyGfx, shadowColor);
        break;
      default:
        shadowGfx.circle(3, 5, prop.radius).fill({ color: shadowColor, alpha: 0.24 });
        bodyGfx.circle(0, 0, prop.radius - 2).fill({ color: 0xc99f72, alpha: 1 });
        break;
    }
  }

  // --- Scene 1: Golden Study ---

  private drawBrassLampBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Grounded contact shadow
    shadow
      .circle(4, 6, 26)
      .fill({ color: shadowColor, alpha: 0.24 })
      .ellipse(-10, 12, 14, 11)
      .fill({ color: shadowColor, alpha: 0.18 });

    // Heavy stepped circular brass foot tucked slightly offset under shade
    body
      .circle(-11, 9, 13)
      .fill({ color: 0x8b6229, alpha: 1 })
      .stroke({ width: 1.2, color: 0x573b16, alpha: 0.9 })
      .circle(-11, 9, 9.5)
      .fill({ color: 0xc49446, alpha: 1 })
      .circle(-12.5, 7.5, 4)
      .fill({ color: 0xefd08d, alpha: 0.5 });

    // Small brass toggle switch nub on base
    body
      .circle(-18, 12, 2.3)
      .fill({ color: 0xf4dca2, alpha: 0.95 })
      .stroke({ width: 0.8, color: 0x624318, alpha: 0.8 });

    // Articulated brass swan-neck stem reaching to lamp shade center
    body
      .moveTo(-10, 8)
      .quadraticCurveTo(-6, 1, 0, 0)
      .stroke({ width: 3.4, color: 0x9b7031, alpha: 1, cap: 'round' })
      .moveTo(-9.5, 7.5)
      .quadraticCurveTo(-5.5, 0.5, 0, 0)
      .stroke({ width: 1.4, color: 0xe6c37a, alpha: 0.8, cap: 'round' });
  }

  private drawCoffeeMugBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Grounded coaster shadow
    shadow
      .circle(3, 5, 27)
      .fill({ color: shadowColor, alpha: 0.22 })
      .circle(4, 6, 17)
      .fill({ color: shadowColor, alpha: 0.16 });

    // Warm stitched walnut & cork coaster
    body
      .circle(0, 0, 26)
      .fill({ color: 0x6b452a, alpha: 1 })
      .stroke({ width: 1.4, color: 0x472c1a, alpha: 0.9 })
      .circle(0, 0, 21.5)
      .fill({ color: 0xc49562, alpha: 1 })
      .circle(0, 0, 19)
      .stroke({ width: 0.9, color: 0x8f663d, alpha: 0.55 });

    // Tiny brass teaspoon resting on coaster edge
    body
      .moveTo(-18, 12)
      .lineTo(-9, 6)
      .stroke({ width: 2, color: 0xd4aa63, alpha: 0.92, cap: 'round' })
      .ellipse(-19.5, 13, 3.6, 2.2)
      .fill({ color: 0xe7c580, alpha: 0.95 });

    // Ceramic mug handle
    body
      .arc(13, -1, 5.5, -Math.PI * 0.55, Math.PI * 0.55)
      .stroke({ width: 3.4, color: 0xf4ece0, alpha: 1, cap: 'round' })
      .arc(13, -1, 5.5, -Math.PI * 0.45, Math.PI * 0.45)
      .stroke({ width: 1, color: 0xd5c5b2, alpha: 0.65 });

    // Cream ceramic mug body & rim
    body
      .circle(0, -1, 14.5)
      .fill({ color: 0xf5ede2, alpha: 1 })
      .stroke({ width: 1.2, color: 0xc8b7a2, alpha: 0.9 })
      .circle(0, -1, 11.2)
      .fill({ color: 0x452614, alpha: 1 });

    // Subtle specular ceramic rim highlight
    body
      .arc(-1, -2, 13, -Math.PI * 0.85, -Math.PI * 0.25)
      .stroke({ width: 1.4, color: 0xffffff, alpha: 0.72, cap: 'round' });
  }

  private drawLeatherJournalBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Contact shadow
    shadow
      .roundRect(-29, -20, 60, 44, 6)
      .fill({ color: shadowColor, alpha: 0.25 });

    // Rich oxblood / saddle leather open hardcover
    body
      .roundRect(-31, -23, 60, 44, 5)
      .fill({ color: 0x6e3226, alpha: 1 })
      .stroke({ width: 1.4, color: 0x421b13, alpha: 0.92 });

    // Gold corner emboss accents
    body
      .circle(-27.5, -19.5, 1.8)
      .circle(25.5, -19.5, 1.8)
      .circle(-27.5, 17.5, 1.8)
      .circle(25.5, 17.5, 1.8)
      .fill({ color: 0xd8b062, alpha: 0.8 });

    // Left cream page block
    body
      .roundRect(-27.5, -19.5, 26, 37, 2)
      .fill({ color: 0xf4ead8, alpha: 1 })
      .stroke({ width: 0.8, color: 0xd3c2a6, alpha: 0.85 });

    // Right cream page block
    body
      .roundRect(-0.5, -19.5, 26, 37, 2)
      .fill({ color: 0xf8f0e1, alpha: 1 })
      .stroke({ width: 0.8, color: 0xd3c2a6, alpha: 0.85 });

    // Center spine crease shadow
    body
      .moveTo(-1, -19.5)
      .lineTo(-1, 17.5)
      .stroke({ width: 2.2, color: 0x9c8669, alpha: 0.55 });

    // Fine handwritten sepia journal lines on left & right pages
    for (let ly = -13; ly <= 10; ly += 5) {
      body
        .moveTo(-23, ly)
        .lineTo(-6, ly)
        .moveTo(4, ly)
        .lineTo(ly === 10 ? 15 : 21, ly)
        .stroke({ width: 0.9, color: 0x8f7458, alpha: 0.42, cap: 'round' });
    }

    // Crimson silk bookmark ribbon trailing cleanly from bottom spine
    body
      .poly([-3, 17.5, 1, 17.5, 2, 26, -1, 23.5, -4, 26])
      .fill({ color: 0xb53c34, alpha: 0.95 });

    // Small brass-capped inkwell at top-right corner
    body
      .circle(27, -21, 6.2)
      .fill({ color: 0x2a323b, alpha: 0.96 })
      .stroke({ width: 1.2, color: 0xcba158, alpha: 0.9 })
      .circle(27, -21, 2.8)
      .fill({ color: 0x141a21, alpha: 1 });
  }

  private drawMonsteraScratcherBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Contact shadows for paired planter + mini sisal post
    shadow
      .circle(-9, 5, 24)
      .fill({ color: shadowColor, alpha: 0.24 })
      .circle(21, 10, 15)
      .fill({ color: shadowColor, alpha: 0.22 });

    // Mini Sisal Scratcher base & braided rope post (right side)
    body
      .circle(19, 6, 15.5)
      .fill({ color: 0x9d6f45, alpha: 1 })
      .stroke({ width: 1.3, color: 0x654325, alpha: 0.9 })
      .circle(19, 6, 11.2)
      .fill({ color: 0xd4b27c, alpha: 1 })
      .stroke({ width: 1.6, color: 0xa6834e, alpha: 0.9 });

    // Braided sisal ring texture & birch wood top cap
    body
      .circle(19, 6, 8.6)
      .stroke({ width: 1.1, color: 0xb69158, alpha: 0.75 })
      .circle(19, 6, 6.2)
      .fill({ color: 0xe6d1b0, alpha: 1 })
      .circle(19, 6, 2.2)
      .fill({ color: 0xc29e70, alpha: 0.6 });

    // Ribbed terracotta planter pot (left side)
    body
      .circle(-11, 0, 18.5)
      .fill({ color: 0xb96244, alpha: 1 })
      .stroke({ width: 1.6, color: 0x7a3a25, alpha: 0.9 })
      .circle(-11, 0, 14.2)
      .fill({ color: 0x452e1f, alpha: 1 });

    // Subtle terracotta rim highlight
    body
      .arc(-11, 0, 16.5, -Math.PI * 0.85, -Math.PI * 0.2)
      .stroke({ width: 1.3, color: 0xe39678, alpha: 0.55, cap: 'round' });
  }

  // --- Scene 2: Kyoto Tatami ---

  private drawAndonLanternBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .roundRect(-21, -19, 46, 46, 7)
      .fill({ color: shadowColor, alpha: 0.28 });

    // Dark Hinoki cedar outer square frame
    body
      .roundRect(-23, -23, 46, 46, 6)
      .fill({ color: 0x332016, alpha: 1 })
      .stroke({ width: 1.4, color: 0x1c100a, alpha: 0.95 });

    // Corner bronze bracket pins
    body
      .circle(-19, -19, 1.6)
      .circle(19, -19, 1.6)
      .circle(-19, 19, 1.6)
      .circle(19, 19, 1.6)
      .fill({ color: 0xb88c49, alpha: 0.75 });
  }

  private drawTetsubinTeaBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .roundRect(-32, -23, 68, 50, 11)
      .fill({ color: shadowColor, alpha: 0.28 });

    // Lacquered dark cedar serving tray
    body
      .roundRect(-34, -26, 68, 50, 10)
      .fill({ color: 0x4e281e, alpha: 1 })
      .stroke({ width: 1.8, color: 0x2b140e, alpha: 0.95 })
      .roundRect(-30, -22, 60, 42, 7)
      .stroke({ width: 1, color: 0xd8aa60, alpha: 0.42 });

    // Bamboo trivet + Cast-iron Tetsubin Teapot (left)
    body
      .circle(-13, -4, 15.5)
      .fill({ color: 0xa6895a, alpha: 1 })
      .circle(-13, -4, 13)
      .fill({ color: 0x2c2928, alpha: 1 })
      .stroke({ width: 1.2, color: 0x161413, alpha: 0.95 });

    // Spout pointing toward matcha bowl
    body
      .moveTo(-2, -1)
      .lineTo(5, 2)
      .stroke({ width: 3.4, color: 0x2c2928, alpha: 1, cap: 'round' });

    // Hobnail dots & brass lid finial on tetsubin
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      body
        .circle(-13 + Math.cos(a) * 9.5, -4 + Math.sin(a) * 9.5, 1.1)
        .fill({ color: 0x4d4745, alpha: 0.85 });
    }
    body
      .circle(-13, -4, 6.2)
      .fill({ color: 0x3b3634, alpha: 1 })
      .circle(-13, -4, 2.3)
      .fill({ color: 0xd8ac5a, alpha: 1 });

    // Curved iron handle arch across teapot
    body
      .moveTo(-22, -12)
      .quadraticCurveTo(-13, -17, -4, -12)
      .stroke({ width: 2.2, color: 0x1f1d1c, alpha: 0.95, cap: 'round' });

    // Stoneware Matcha Chawan cup (right)
    body
      .circle(15, 5, 11.5)
      .fill({ color: 0xdfd5c5, alpha: 1 })
      .stroke({ width: 1.2, color: 0x9b8f7f, alpha: 0.9 })
      .circle(15, 5, 8.8)
      .fill({ color: 0x62964a, alpha: 1 });

    // Tiny sakura mochi sweet on cedar leaf corner (top-right)
    body
      .ellipse(17, -13, 6.5, 4.8)
      .fill({ color: 0x527945, alpha: 0.92 })
      .circle(17, -13, 3.8)
      .fill({ color: 0xf4bcc7, alpha: 0.98 });
  }

  private drawZabutonBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .roundRect(-27, -23, 58, 52, 11)
      .fill({ color: shadowColor, alpha: 0.24 });

    // Corner gold silk tassels
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [-26, -24, -5, -5],
      [26, -24, 5, -5],
      [-26, 24, -5, 5],
      [26, 24, 5, 5],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      body
        .moveTo(cx, cy)
        .lineTo(cx + dx, cy + dy)
        .stroke({ width: 2.6, color: 0xdcb56b, alpha: 0.95, cap: 'round' })
        .circle(cx + dx, cy + dy, 2.3)
        .fill({ color: 0xedd08c, alpha: 1 });
    }

    // Deep indigo brocade zabuton body
    body
      .roundRect(-27, -25, 54, 50, 10)
      .fill({ color: 0x334b60, alpha: 1 })
      .stroke({ width: 1.6, color: 0xd8b26b, alpha: 0.9 });

    // Subtle quilted puff highlight & gold embroidery frame
    body
      .roundRect(-21, -19, 42, 38, 7)
      .stroke({ width: 1, color: 0xe6c88a, alpha: 0.45 })
      .ellipse(-6, -6, 12, 9)
      .fill({ color: 0x4b6a84, alpha: 0.35 });

    // Central pinched tuft shadow & crimson-gold cross stitch
    body
      .circle(0, 0, 6)
      .fill({ color: 0x1e2e3d, alpha: 0.42 })
      .moveTo(-5, -5)
      .lineTo(5, 5)
      .moveTo(5, -5)
      .lineTo(-5, 5)
      .stroke({ width: 1.6, color: 0xe8c987, alpha: 0.95, cap: 'round' });
  }

  private drawBambooClackerBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Grounded stone basin shadow
    shadow
      .circle(3, 6, 30)
      .fill({ color: shadowColor, alpha: 0.28 });

    // Carved mossy granite tsukubai water basin
    body
      .circle(0, 0, 29)
      .fill({ color: 0x7b756c, alpha: 1 })
      .stroke({ width: 1.6, color: 0x4d4841, alpha: 0.92 })
      .circle(-2, 2, 21)
      .fill({ color: 0x2b625c, alpha: 1 })
      .circle(-2, 2, 16)
      .fill({ color: 0x397a72, alpha: 0.72 });

    // Moss patches hugging rim
    body
      .circle(-21, -14, 6.5)
      .circle(-15, -20, 5)
      .circle(18, 17, 5.5)
      .fill({ color: 0x5c8549, alpha: 0.88 });

    // Submerged river pebbles
    body
      .circle(-8, 7, 3.2)
      .circle(5, 11, 2.8)
      .circle(-11, -3, 2.5)
      .fill({ color: 0xc2b8a3, alpha: 0.25 });

    // Two dark bamboo pivot cradle posts
    body
      .circle(-2, -11, 3.2)
      .circle(-2, 10, 3.2)
      .fill({ color: 0x4a6b35, alpha: 1 })
      .stroke({ width: 0.9, color: 0x2c441e, alpha: 0.9 });
  }

  // --- Scene 3: Sunlit Courtyard ---

  private drawKoiBirdbathBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Grounded basin shadow
    shadow
      .ellipse(4, 7, 45, 39)
      .fill({ color: shadowColor, alpha: 0.28 });

    // Ring of weathered mossy river boulders
    const stoneColors = [0x827a70, 0x6f675f, 0x91887d, 0x627358];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const sx = Math.cos(a) * 37;
      const sy = Math.sin(a) * 31;
      body
        .ellipse(sx, sy, 10 + (i % 3) * 1.8, 8.2 + (i % 2) * 1.6)
        .fill({ color: stoneColors[i % stoneColors.length], alpha: 1 })
        .stroke({ width: 1, color: 0x3e3933, alpha: 0.5 });
    }

    // Translucent emerald-teal birdbath / mini koi water
    body
      .ellipse(0, 0, 33, 27)
      .fill({ color: 0x215550, alpha: 1 })
      .ellipse(-2, -2, 27, 21)
      .fill({ color: 0x31746d, alpha: 0.85 })
      .ellipse(-5, -5, 18, 13)
      .fill({ color: 0x458e85, alpha: 0.45 });

    // Submerged pebbles
    body
      .circle(-10, 8, 3.2)
      .circle(12, 9, 2.6)
      .circle(4, -9, 3)
      .fill({ color: 0xc9bca4, alpha: 0.2 });

    // Cozy velvet moss clusters on rim stones
    body
      .circle(-31, -15, 5.5)
      .circle(-24, -22, 4.2)
      .circle(28, 18, 5)
      .fill({ color: 0x5d874a, alpha: 0.88 });
  }

  private drawCatnipPlanterBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(3, 6, 29)
      .fill({ color: shadowColor, alpha: 0.26 });

    // Weathered terracotta courtyard pot & rim
    body
      .circle(0, 0, 27)
      .fill({ color: 0xb96749, alpha: 1 })
      .stroke({ width: 1.6, color: 0x7c3e28, alpha: 0.92 })
      .circle(0, 0, 21.5)
      .fill({ color: 0x453020, alpha: 1 });

    // Rim clay highlight
    body
      .arc(0, 0, 24.5, -Math.PI * 0.85, -Math.PI * 0.15)
      .stroke({ width: 1.4, color: 0xe49d80, alpha: 0.5, cap: 'round' });
  }

  private drawButterflyStoneBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .ellipse(3, 5, 29, 24)
      .fill({ color: shadowColor, alpha: 0.24 });

    // Warm sunlit flat garden stepping stone
    body
      .poly([
        -24, -10,
        -12, -22,
        14, -20,
        26, -6,
        23, 14,
        6, 22,
        -18, 18,
        -27, 4,
      ])
      .fill({ color: 0xb9b2a2, alpha: 1 })
      .stroke({ width: 1.5, color: 0x797366, alpha: 0.85 });

    // Inner sunlit bevel face & faint carved garden spiral
    body
      .ellipse(-2, -2, 17, 13)
      .fill({ color: 0xd0cab9, alpha: 0.65 })
      .arc(0, 0, 7, 0, Math.PI * 1.65)
      .stroke({ width: 1.1, color: 0x8f8878, alpha: 0.45, cap: 'round' });

    // Tiny clover cluster & white daisy hugging the stone edge
    body
      .circle(-20, 14, 4.2)
      .circle(-15, 17, 3.8)
      .circle(-22, 9, 3.4)
      .fill({ color: 0x5c8a47, alpha: 0.92 });

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      body
        .ellipse(18 + Math.cos(a) * 3.2, -13 + Math.sin(a) * 3.2, 2.6, 1.5)
        .fill({ color: 0xfaf6ec, alpha: 0.95 });
    }
    body.circle(18, -13, 2).fill({ color: 0xeab949, alpha: 1 });
  }

  private drawWindChimeBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(3, 5, 27)
      .fill({ color: shadowColor, alpha: 0.22 });

    // Mossy woven stepping cushion beneath chime
    body
      .circle(0, 0, 26)
      .fill({ color: 0x678352, alpha: 1 })
      .stroke({ width: 1.5, color: 0x455d35, alpha: 0.88 })
      .circle(0, 0, 20)
      .fill({ color: 0x829f69, alpha: 0.82 })
      .circle(0, 0, 14)
      .stroke({ width: 1, color: 0xc2d6a6, alpha: 0.35 });

    // Small bamboo hanger bracket peeking from top-left edge
    body
      .moveTo(-22, -14)
      .lineTo(0, 0)
      .stroke({ width: 3.2, color: 0x8a653e, alpha: 0.95, cap: 'round' });
  }

  // --- Scene 4: Cat Cafe Tile ---

  private drawCatTreeBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .roundRect(-35, -29, 76, 66, 15)
      .fill({ color: shadowColor, alpha: 0.26 });

    // Rounded warm birchwood base platform
    body
      .roundRect(-38, -32, 76, 64, 15)
      .fill({ color: 0xcda476, alpha: 1 })
      .stroke({ width: 1.6, color: 0x8a623c, alpha: 0.9 })
      .roundRect(-34, -28, 68, 56, 12)
      .stroke({ width: 1, color: 0xf1dcc0, alpha: 0.35 });

    // Braided sisal scratching post column (left)
    body
      .circle(-18, -6, 13)
      .fill({ color: 0xb38a5d, alpha: 1 })
      .stroke({ width: 1.5, color: 0x775634, alpha: 0.9 })
      .circle(-18, -6, 9.2)
      .stroke({ width: 1.2, color: 0xd5b485, alpha: 0.75 })
      .circle(-18, -6, 5.5)
      .fill({ color: 0xdfc196, alpha: 1 });

    // Elevated plush sage & cream top perch (right) with cast tier shadow
    body
      .circle(12, -1, 24)
      .fill({ color: shadowColor, alpha: 0.22 })
      .circle(9, -4, 23.5)
      .fill({ color: 0x718d74, alpha: 1 })
      .stroke({ width: 1.4, color: 0x4f6751, alpha: 0.9 })
      .circle(9, -4, 16.5)
      .fill({ color: 0xeee3d5, alpha: 1 })
      .circle(9, -4, 11)
      .stroke({ width: 0.9, color: 0xcab9a4, alpha: 0.45 });
  }

  private drawTreatJarBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .roundRect(-31, -18, 66, 42, 12)
      .fill({ color: shadowColor, alpha: 0.24 });

    // Speckled terrazzo feeding mat
    body
      .roundRect(-33, -21, 66, 42, 12)
      .fill({ color: 0xebe0d0, alpha: 1 })
      .stroke({ width: 1.3, color: 0xb9a287, alpha: 0.85 });

    // Tiny terrazzo mineral flecks
    const flecks: ReadonlyArray<readonly [number, number, number]> = [
      [-26, -13, 0xc8785a],
      [25, -14, 0x758d76],
      [-24, 14, 0xd8a85a],
      [24, 13, 0xc8785a],
      [0, -15, 0x8d7a66],
      [1, 15, 0x758d76],
    ];
    for (const [fx, fy, col] of flecks) {
      body.circle(fx, fy, 1.8).fill({ color: col, alpha: 0.72 });
    }

    // Left: Ceramic Treat Jar base body
    body
      .circle(-14, 0, 14.5)
      .fill({ color: 0xf7efe4, alpha: 1 })
      .stroke({ width: 1.4, color: 0xb99d80, alpha: 0.9 })
      .circle(-14, 0, 11)
      .fill({ color: 0x623f25, alpha: 0.85 });

    // Right: Terracotta Kibble Bowl brimming with biscuits
    body
      .circle(15, 1, 13.5)
      .fill({ color: 0xc97354, alpha: 1 })
      .stroke({ width: 1.3, color: 0x87452e, alpha: 0.9 })
      .circle(15, 1, 10)
      .fill({ color: 0x573620, alpha: 1 });

    // Crunchy kibble nuggets inside bowl
    const nuggets: ReadonlyArray<readonly [number, number]> = [
      [-3.5, -2.5],
      [2.5, -3],
      [-2.5, 3],
      [3.5, 2.5],
      [0, 0],
      [0.5, -4.5],
    ];
    for (const [nx, ny] of nuggets) {
      body
        .circle(15 + nx, 1 + ny, 2.3)
        .fill({ color: 0xd98e4c, alpha: 1 })
        .circle(14.5 + nx, 0.5 + ny, 0.9)
        .fill({ color: 0xf3be7a, alpha: 0.75 });
    }
  }

  private drawLatteSaucerBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(4, 6, 35)
      .fill({ color: shadowColor, alpha: 0.25 });

    // Round Carrara marble bistro coaster-table with brushed brass rim
    body
      .circle(0, 0, 34)
      .fill({ color: 0xf4ede3, alpha: 1 })
      .stroke({ width: 2.2, color: 0xbc8e4b, alpha: 0.92 });

    // Subtle grey marble veins
    body
      .moveTo(-22, -10)
      .quadraticCurveTo(-2, -1, 18, -14)
      .moveTo(-14, 14)
      .quadraticCurveTo(6, 7, 22, 16)
      .stroke({ width: 1.1, color: 0xb8aca0, alpha: 0.35, cap: 'round' });

    // Latte saucer & cup (top-left)
    body
      .circle(-11, -7, 12.5)
      .fill({ color: 0xe6dac9, alpha: 1 })
      .circle(-11, -7, 9.5)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 0.9, color: 0xd2c3b0, alpha: 0.85 })
      .circle(-11, -7, 7.6)
      .fill({ color: 0x8b5736, alpha: 1 });

    // Pastry plate with golden crescent croissant & berry tart (bottom-right)
    body
      .circle(12, 10, 14)
      .fill({ color: 0xe7dbca, alpha: 1 })
      .stroke({ width: 0.9, color: 0xcabaa5, alpha: 0.8 });

    body
      .arc(11, 10, 6.2, -0.65, Math.PI * 0.92)
      .stroke({ width: 5.5, color: 0xd68c3e, alpha: 1, cap: 'round' })
      .arc(11, 10, 6.2, -0.35, Math.PI * 0.65)
      .stroke({ width: 2.1, color: 0xf2ba6b, alpha: 0.72, cap: 'round' });

    // Tiny strawberry tartlet
    body
      .circle(17, 5, 3.6)
      .fill({ color: 0xd94b45, alpha: 0.96 })
      .circle(16.2, 4.2, 1.1)
      .fill({ color: 0xf7b2ad, alpha: 0.8 });
  }

  private drawDonutBedBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(3, 6, 33)
      .fill({ color: shadowColor, alpha: 0.24 });

    // Plush tufted outer terracotta-rose bolster ring
    body
      .circle(0, 0, 32)
      .fill({ color: 0xc86e54, alpha: 1 })
      .stroke({ width: 1.4, color: 0x8e4733, alpha: 0.85 });

    // Soft radial velvet bolster pleats
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      body
        .moveTo(Math.cos(a) * 19, Math.sin(a) * 19)
        .lineTo(Math.cos(a) * 31, Math.sin(a) * 31)
        .stroke({ width: 1.2, color: 0x6b3222, alpha: 0.28 });
    }

    // Warm cream sherpa inner nest well
    body
      .circle(0, 0, 20.5)
      .fill({ color: 0xf3e5d2, alpha: 1 })
      .stroke({ width: 1.2, color: 0xb79072, alpha: 0.35 })
      .circle(-3, -3, 12)
      .fill({ color: 0xfaf2e6, alpha: 0.45 });

    // Cute woven leather tag on side
    body
      .roundRect(27, -4, 6, 8, 2)
      .fill({ color: 0x8c5a38, alpha: 0.95 });
  }

  // ============================================================================
  // Per-Frame Animated Sub-Parts & Hover / Active Feedback
  // ============================================================================

  private updatePropVisual(
    node: PropVisualNode,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { hoverRingColor: number; activeRingColor: number; warmGlowColor: number; warmCoreColor: number },
  ): void {
    const { prop, hoverRing, bodyGfx, animGfx, glowGfx } = node;

    // 1. Subtle hover & active highlight ring beneath prop (clean, crisp, never cluttered)
    hoverRing.clear();
    const hoverAlpha = prop.hoverGlow * 0.48;
    const pulseActive = !this.isWarmLamp(prop.kind) && prop.isActive ? 0.16 + Math.sin(time * 4.2) * 0.06 : 0;
    const ringAlpha = Math.max(hoverAlpha, pulseActive);
    if (ringAlpha > 0.015) {
      const ringRadius = prop.radius + 4 + prop.hoverGlow * 2.5;
      const ringColor = prop.hoverGlow > 0.15 ? palette.hoverRingColor : palette.activeRingColor;
      hoverRing
        .circle(0, 0, ringRadius)
        .fill({ color: ringColor, alpha: ringAlpha * 0.22 })
        .circle(0, 0, ringRadius)
        .stroke({ width: 1.5, color: ringColor, alpha: Math.min(0.75, ringAlpha * 1.15) });
    }

    // 2. Tactile spring squash-and-stretch click/knead bounce for plush cushions & interactive props
    let sx = 1;
    let sy = 1;
    if (prop.pulseTime > 0) {
      const wave = Math.sin(prop.pulseTime * Math.PI * 2.5) * prop.pulseTime;
      if (prop.kind === 'zabuton_cushion' || prop.kind === 'donut_cat_bed') {
        sx = 1 + wave * 0.13;
        sy = 1 - wave * 0.1;
      } else {
        const pop = 1 + Math.sin(prop.pulseTime * Math.PI) * 0.055;
        sx = pop;
        sy = pop;
      }
    }
    bodyGfx.scale.set(sx, sy);
    animGfx.scale.set(sx, sy);

    // 3. Per-prop dynamic animated geometry
    animGfx.clear();
    switch (prop.kind) {
      case 'brass_lamp':
        this.drawBrassLampAnimated(animGfx, glowGfx, prop, time, lighting, palette);
        break;
      case 'coffee_mug':
        this.drawCoffeeMugAnimated(animGfx, prop, time);
        break;
      case 'leather_journal':
        this.drawLeatherJournalAnimated(animGfx, prop, time);
        break;
      case 'monstera_scratcher':
        this.drawMonsteraAnimated(animGfx, prop, time);
        break;
      case 'andon_lantern':
        this.drawAndonLanternAnimated(animGfx, glowGfx, prop, time, lighting, palette);
        break;
      case 'tetsubin_tea':
        this.drawTetsubinTeaAnimated(animGfx, prop, time);
        break;
      case 'bamboo_clacker':
        this.drawBambooClackerAnimated(animGfx, prop, time);
        break;
      case 'koi_birdbath':
        this.drawKoiBirdbathAnimated(animGfx, prop, time);
        break;
      case 'catnip_planter':
        this.drawCatnipPlanterAnimated(animGfx, prop, time);
        break;
      case 'butterfly_stone':
        this.drawButterflyStoneAnimated(animGfx, prop, time, lighting);
        break;
      case 'wind_chime':
        this.drawWindChimeAnimated(animGfx, prop, time);
        break;
      case 'cat_tree_tower':
        this.drawCatTreeAnimated(animGfx, prop, time);
        break;
      case 'treat_jar':
        this.drawTreatJarAnimated(animGfx, prop);
        break;
      case 'latte_saucer':
        this.drawLatteSaucerAnimated(animGfx, prop, time);
        break;
      default:
        break;
    }
  }

  private isWarmLamp(kind: string): boolean {
    return kind === 'brass_lamp' || kind === 'andon_lantern';
  }

  private drawBrassLampAnimated(
    anim: Graphics,
    glow: Graphics | null,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { warmGlowColor: number; warmCoreColor: number },
  ): void {
    const lit = prop.activeBlend;
    const flicker = 1 + Math.sin(time * 2.8) * 0.03;

    // Warm pleated linen shade (switches clearly between warm lit amber and muted off linen)
    const shadeOuter = lit > 0.35 ? 0xe5b86d : 0xbaa88f;
    const shadeInner = lit > 0.35 ? 0xfff0c8 : 0xd8cbb6;

    anim
      .circle(0, 0, 22)
      .fill({ color: shadeOuter, alpha: 1 })
      .stroke({ width: 1.5, color: 0x865d28, alpha: 0.9 })
      .circle(0, 0, 15.5)
      .fill({ color: shadeInner, alpha: 0.72 + lit * 0.28 });

    // Radial pleated linen shade lines
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      anim
        .moveTo(Math.cos(a) * 6, Math.sin(a) * 6)
        .lineTo(Math.cos(a) * 21, Math.sin(a) * 21)
        .stroke({ width: 0.9, color: 0x8a612d, alpha: 0.28 });
    }

    // Luminous filament glow center when lit
    if (lit > 0.02) {
      anim
        .circle(0, 0, 11 * flicker)
        .fill({ color: 0xfff7dc, alpha: lit * 0.55 });
    }

    // Polished brass finial cap
    anim
      .circle(0, 0, 4.4)
      .fill({ color: 0xbd8a3a, alpha: 1 })
      .stroke({ width: 0.9, color: 0x694819, alpha: 0.85 })
      .circle(-1.2, -1.2, 1.5)
      .fill({ color: 0xf7e0a8, alpha: 0.85 });

    if (glow) {
      glow.clear();
      if (lit > 0.01) {
        const modeAlpha = lighting === 'night' ? 0.42 : lighting === 'golden' ? 0.28 : 0.16;
        glow
          .circle(0, 0, 86 * flicker)
          .fill({ color: palette.warmGlowColor, alpha: lit * modeAlpha * 0.55 })
          .circle(0, 0, 42 * flicker)
          .fill({ color: palette.warmCoreColor, alpha: lit * modeAlpha });
      }
    }
  }

  private drawCoffeeMugAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    // Rotating golden crema latte swirl inside mug
    const swirlRot = time * 0.35 + prop.pulseTime * 4.5;
    anim
      .arc(0, -1, 5.2, swirlRot, swirlRot + Math.PI * 1.15)
      .stroke({ width: 1.5, color: 0xe3bd8d, alpha: 0.82, cap: 'round' })
      .arc(0, -1, 2.6, swirlRot + 1.5, swirlRot + Math.PI * 1.4)
      .stroke({ width: 1.1, color: 0xf4dfc0, alpha: 0.72, cap: 'round' });
  }

  private drawLeatherJournalAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    // 1. Page-flip animation sweeping across the spine on click
    if (prop.pageFlipProgress > 0 && prop.pageFlipProgress < 1) {
      const t = prop.pageFlipProgress;
      const eased = 1 - Math.pow(1 - t, 3);
      const leafX = 25 * (1 - eased * 2); // +25 -> -25 across spine
      const liftY = Math.sin(eased * Math.PI) * 5;

      // Soft shadow cast by turning page
      anim
        .poly([-1, -19, leafX, -19 - liftY * 0.4, leafX, 17 - liftY * 0.4, -1, 17])
        .fill({ color: 0x5c4632, alpha: 0.16 * Math.sin(eased * Math.PI) });

      // Crisp cream turning page
      anim
        .poly([-1, -19, leafX, -19 - liftY, leafX, 17 - liftY, -1, 17])
        .fill({ color: 0xfbf4e6, alpha: 0.96 })
        .stroke({ width: 0.9, color: 0xcab696, alpha: 0.85 });
    }

    // 2. Feather quill resting across right margin, bobbing/fluttering with spring angle
    const sway = Math.sin(time * 1.6) * 0.04 + prop.swingAngle * 0.18;
    const qx = 13;
    const qy = 2;
    const cos = Math.cos(-0.62 + sway);
    const sin = Math.sin(-0.62 + sway);

    const tipX = qx - cos * 14;
    const tipY = qy - sin * 14;
    const plumeX = qx + cos * 19;
    const plumeY = qy + sin * 19;
    const perpX = -sin;
    const perpY = cos;

    // Quill shadow
    anim
      .moveTo(tipX + 2, tipY + 3)
      .lineTo(plumeX + 2, plumeY + 3)
      .stroke({ width: 2.5, color: 0x2b190d, alpha: 0.2, cap: 'round' });

    // Cream & gold feathered vane
    anim
      .moveTo(qx - cos * 3, qy - sin * 3)
      .quadraticCurveTo(qx + cos * 8 + perpX * 6, qy + sin * 8 + perpY * 6, plumeX, plumeY)
      .quadraticCurveTo(qx + cos * 8 - perpX * 5.5, qy + sin * 8 - perpY * 5.5, qx - cos * 3, qy - sin * 3)
      .fill({ color: 0xf8eedb, alpha: 0.97 })
      .stroke({ width: 0.9, color: 0xd4b98a, alpha: 0.8 });

    // Gold tip feather accent & central rachis shaft + brass nib
    anim
      .moveTo(tipX, tipY)
      .lineTo(plumeX, plumeY)
      .stroke({ width: 1.5, color: 0xcba158, alpha: 0.95, cap: 'round' })
      .circle(tipX, tipY, 1.5)
      .fill({ color: 0x252d36, alpha: 0.95 });
  }

  private drawMonsteraAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const cx = -11;
    const cy = 0;
    const swayBase = Math.sin(time * 1.4) * 0.03 + prop.swingAngle * 0.14;
    const leafColors = [0x3c7148, 0x4d8657, 0x2f5f3b, 0x5c9665, 0x3b6f47, 0x528d5d, 0x336540];

    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.24 + swayBase * (i % 2 === 0 ? 1 : -0.8);
      const len = 24 + (i % 3) * 4.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const perpX = -sin;
      const perpY = cos;

      // Stem
      anim
        .moveTo(cx + cos * 3, cy + sin * 3)
        .lineTo(cx + cos * (len * 0.85), cy + sin * (len * 0.85))
        .stroke({ width: 2, color: 0x294d32, alpha: 0.95, cap: 'round' });

      // Heart-blade leaf polygon
      const baseX = cx + cos * (len * 0.28);
      const baseY = cy + sin * (len * 0.28);
      const tipX = cx + cos * len;
      const tipY = cy + sin * len;
      const midX = cx + cos * (len * 0.62);
      const midY = cy + sin * (len * 0.62);
      const halfW = len * 0.34;

      anim
        .moveTo(baseX, baseY)
        .quadraticCurveTo(midX + perpX * halfW, midY + perpY * halfW, tipX, tipY)
        .quadraticCurveTo(midX - perpX * halfW, midY - perpY * halfW, baseX, baseY)
        .fill({ color: leafColors[i % leafColors.length], alpha: 0.96 });

      // Central midrib highlight
      anim
        .moveTo(baseX + cos * 2, baseY + sin * 2)
        .lineTo(cx + cos * (len * 0.88), cy + sin * (len * 0.88))
        .stroke({ width: 1, color: 0xbde6b5, alpha: 0.45, cap: 'round' });
    }
  }

  private drawAndonLanternAnimated(
    anim: Graphics,
    glow: Graphics | null,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { warmGlowColor: number; warmCoreColor: number },
  ): void {
    const lit = prop.activeBlend;
    const flicker = 1 + Math.sin(time * 3.4) * 0.04;

    // Translucent washi paper panels
    const outerPaper = lit > 0.35 ? 0xf3be70 : 0xc9beae;
    const innerPaper = lit > 0.35 ? 0xfff5dc : 0xdfd6c7;

    anim
      .roundRect(-17, -17, 34, 34, 4)
      .fill({ color: outerPaper, alpha: 1 })
      .circle(0, 0, 12.5 * (0.94 + lit * 0.08 * flicker))
      .fill({ color: innerPaper, alpha: 0.7 + lit * 0.3 });

    // Subtle candle flame core when lit
    if (lit > 0.05) {
      anim
        .circle(0, 0, 5.5 * flicker)
        .fill({ color: 0xffffff, alpha: lit * 0.6 });
    }

    // Crisp Hinoki cedar kumiko cross-lattice over paper
    anim
      .moveTo(-17, 0)
      .lineTo(17, 0)
      .moveTo(0, -17)
      .lineTo(0, 17)
      .stroke({ width: 2.2, color: 0x332016, alpha: 0.95 });

    if (glow) {
      glow.clear();
      if (lit > 0.01) {
        const modeAlpha = lighting === 'night' ? 0.5 : lighting === 'golden' ? 0.32 : 0.16;
        glow
          .circle(0, 0, 94 * flicker)
          .fill({ color: palette.warmGlowColor, alpha: lit * modeAlpha * 0.56 })
          .circle(0, 0, 44 * flicker)
          .fill({ color: palette.warmCoreColor, alpha: lit * modeAlpha });
      }
    }
  }

  private drawTetsubinTeaAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    // Subtle frothy jade matcha foam ring swirling on click
    const angle = time * 0.4 + prop.pulseTime * 5.2;
    anim
      .arc(15, 5, 5, angle, angle + Math.PI * 1.2)
      .stroke({ width: 1.3, color: 0xbde29e, alpha: 0.72, cap: 'round' })
      .circle(13.5, 3.5, 1.4)
      .fill({ color: 0xddf2c8, alpha: 0.65 });
  }

  private drawBambooClackerAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    // 1. Subtle water shimmer inside basin
    const shimmer = (Math.sin(time * 2.2) + 1) * 0.5;
    anim
      .circle(-2, 2, 10 + shimmer * 3)
      .stroke({ width: 1, color: 0xdff5f0, alpha: 0.22 });

    // 2. Pivoted green bamboo shishi-odoshi clacker tube tipping forward on click
    const tilt = Math.sin(prop.swingAngle * 0.65) * 6;
    const lenShift = tilt * 0.45;
    anim
      .roundRect(-18 + lenShift, -4.5, 32, 9, 4)
      .fill({ color: 0x6f994a, alpha: 1 })
      .stroke({ width: 1.2, color: 0x416028, alpha: 0.92 });

    // Bamboo node rings
    anim
      .moveTo(-6 + lenShift, -4.5)
      .lineTo(-6 + lenShift, 4.5)
      .moveTo(6 + lenShift, -4.5)
      .lineTo(6 + lenShift, 4.5)
      .stroke({ width: 1.5, color: 0x48692c, alpha: 0.9 });

    // Hollow beveled pouring mouth & tiny water sheen
    anim
      .ellipse(-16 + lenShift, 0, 2.5, 3.6)
      .fill({ color: 0x354d22, alpha: 0.9 })
      .circle(-18 + lenShift, 0, 1.8 + prop.pulseTime * 1.5)
      .fill({ color: 0xc7efe7, alpha: 0.55 + prop.pulseTime * 0.35 });

    // 3. Folded red & gold paper Origami Crane perched at top-right rim
    const wingFlap = Math.abs(Math.sin(time * 2.1 + prop.swingAngle * 1.4)) * (0.18 + prop.pulseTime * 0.45);
    const cx = 17;
    const cy = -14;
    const wingSpan = 9 * (1 - wingFlap * 0.4);
    anim
      // Left & right folded triangular paper wings
      .poly([cx, cy, cx - wingSpan, cy - 6, cx - 3, cy + 3])
      .fill({ color: 0xd94b43, alpha: 0.98 })
      .poly([cx, cy, cx + wingSpan, cy - 6, cx + 3, cy + 3])
      .fill({ color: 0xe86458, alpha: 0.98 })
      // Central diamond body & gold head beak
      .poly([cx, cy - 5, cx + 3.5, cy, cx, cy + 6, cx - 3.5, cy])
      .fill({ color: 0xf2c572, alpha: 0.96 });
  }

  private drawKoiBirdbathAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const speedBoost = 1 + prop.pulseTime * 1.6;

    // 1. Two vibrant swimming koi fish silhouettes with wagging tails
    const koiSpecs = [
      { rx: 16, ry: 12, speed: 0.58 * speedBoost, phase: 0.2, body: 0xf7efe4, spot: 0xd94e34, len: 13 },
      { rx: 12, ry: 9, speed: -0.48 * speedBoost, phase: 2.8, body: 0xf2b949, spot: 0x352c26, len: 11 },
    ];

    for (let i = 0; i < koiSpecs.length; i++) {
      const k = koiSpecs[i];
      const t = time * k.speed + k.phase;
      const kx = Math.cos(t) * k.rx;
      const ky = Math.sin(t * 2) * k.ry * 0.56;
      const dx = -Math.sin(t) * k.rx * k.speed;
      const dy = Math.cos(t * 2) * 2 * k.ry * 0.56 * k.speed;
      const a = Math.atan2(dy, dx);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const perpX = -sin;
      const perpY = cos;
      const wag = Math.sin(time * 9 + i * 2.1) * 2.2;

      // Tail fin
      const tailBaseX = kx - cos * (k.len * 0.4);
      const tailBaseY = ky - sin * (k.len * 0.4);
      const tailTipX = kx - cos * (k.len * 0.85) + perpX * wag;
      const tailTipY = ky - sin * (k.len * 0.85) + perpY * wag;
      anim
        .poly([
          tailBaseX,
          tailBaseY,
          tailTipX + perpX * 3.2,
          tailTipY + perpY * 3.2,
          tailTipX - perpX * 3.2,
          tailTipY - perpY * 3.2,
        ])
        .fill({ color: 0xf9f3ea, alpha: 0.78 });

      // Koi torso & calico marking
      anim
        .circle(kx, ky, k.len * 0.27)
        .fill({ color: k.body, alpha: 0.94 })
        .circle(kx + cos * (k.len * 0.22), ky + sin * (k.len * 0.22), k.len * 0.24)
        .fill({ color: k.body, alpha: 0.94 })
        .circle(kx + cos * (k.len * 0.14), ky + sin * (k.len * 0.14), k.len * 0.15)
        .fill({ color: k.spot, alpha: 0.92 });
    }

    // 2. Ambient water shimmer ripples
    const u = ((time * 0.38) % 1 + 1) % 1;
    anim
      .circle(-9, 6, 4 + u * 14)
      .stroke({ width: 1.1, color: 0xe6f8f5, alpha: (1 - u) * 0.34 });

    // 3. Floating lily pads & blooming pink lotus
    const pads = [
      { x: -16, y: -11, r: 8.5 },
      { x: 16, y: 10, r: 9.2 },
      { x: 14, y: -12, r: 6.5 },
    ];
    for (const pad of pads) {
      anim
        .circle(pad.x + 1, pad.y + 1.5, pad.r)
        .fill({ color: 0x10302b, alpha: 0.28 })
        .circle(pad.x, pad.y, pad.r)
        .fill({ color: 0x4f8d54, alpha: 0.94 })
        .circle(pad.x, pad.y, pad.r * 0.68)
        .stroke({ width: 0.8, color: 0x7bc280, alpha: 0.5 });
    }

    const lx = 16;
    const ly = 9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      anim
        .ellipse(lx + Math.cos(a) * 3.4, ly + Math.sin(a) * 3.4, 3.2, 1.8)
        .fill({ color: 0xf4a8bc, alpha: 0.96 });
    }
    anim.circle(lx, ly, 2.2).fill({ color: 0xf5d061, alpha: 1 });
  }

  private drawCatnipPlanterAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const sway = Math.sin(time * 2.1) * 0.05 + prop.swingAngle * 0.16;

    // Lush mint-green catnip leaf rosette
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + sway * (i % 2 === 0 ? 1 : -0.8);
      const r = 14 + (i % 3) * 3.5;
      const lx = Math.cos(a) * r;
      const ly = Math.sin(a) * r;
      anim
        .circle(lx, ly, 6.2 + (i % 2) * 1.4)
        .fill({ color: i % 2 === 0 ? 0x5ca86b : 0x72be7e, alpha: 0.96 })
        .circle(lx * 0.85, ly * 0.85, 2.5)
        .fill({ color: 0x9ce0a4, alpha: 0.45 });
    }

    // Fragrant purple lavender spikes & marigold buds
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4 + sway * 1.2;
      for (let b = 0; b < 3; b++) {
        const dist = 7 + b * 4.8;
        anim
          .circle(Math.cos(a) * dist, Math.sin(a) * dist, 2.7 - b * 0.35)
          .fill({ color: b === 2 ? 0xb896e8 : 0x8e6bc2, alpha: 0.96 });
      }
    }

    // Soft mint-emerald catnip sparkle aura when activated
    if (prop.activeBlend > 0.05) {
      for (let i = 0; i < 4; i++) {
        const a = time * 1.8 + (i / 4) * Math.PI * 2;
        const rad = 18 + Math.sin(time * 3 + i) * 5;
        anim
          .circle(Math.cos(a) * rad, Math.sin(a) * rad, 2.2)
          .fill({ color: 0x9ef5ab, alpha: prop.activeBlend * 0.85 });
      }
    }
  }

  private drawButterflyStoneAnimated(
    anim: Graphics,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
  ): void {
    // Gentle resting butterfly (day/golden) or glowing firefly (night) perched on the stone
    const bob = Math.sin(time * 2.5) * 1.4;
    if (lighting === 'night') {
      const pulse = 0.45 + Math.pow((Math.sin(time * 3.2) + 1) * 0.5, 2) * 0.55;
      anim
        .circle(0, bob, 9)
        .fill({ color: 0xe6f86d, alpha: 0.24 * pulse })
        .circle(0, bob, 3.2)
        .fill({ color: 0xfaffb0, alpha: 0.95 * pulse });
    } else {
      const wingOpen = 0.55 + Math.abs(Math.sin(time * 3.4 + prop.pulseTime * 8)) * 0.45;
      anim
        .ellipse(-4 * wingOpen, -2.5 + bob, 5 * wingOpen, 3.4)
        .ellipse(4 * wingOpen, -2.5 + bob, 5 * wingOpen, 3.4)
        .fill({ color: 0xf7c552, alpha: 0.94 })
        .ellipse(-3 * wingOpen, 2.5 + bob, 3.4 * wingOpen, 2.4)
        .ellipse(3 * wingOpen, 2.5 + bob, 3.4 * wingOpen, 2.4)
        .fill({ color: 0xf28d6b, alpha: 0.9 })
        .roundRect(-1, -4.5 + bob, 2, 9, 1)
        .fill({ color: 0x2c231b, alpha: 0.95 });
    }
  }

  private drawWindChimeAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const sway = Math.sin(time * 1.8) * 2.2 + prop.swingAngle * 7.5;
    const bellX = sway * 0.35;
    const bellY = Math.abs(sway) * 0.12;

    // Fluttering paper tanzaku wish strip trailing below the bell
    anim
      .poly([
        bellX - 3,
        bellY + 6,
        bellX + 3,
        bellY + 6,
        bellX + sway * 1.1 + 4,
        bellY + 21,
        bellX + sway * 1.1 - 4,
        bellY + 21,
      ])
      .fill({ color: 0xf7efe0, alpha: 0.94 })
      .stroke({ width: 0.8, color: 0xd3a87b, alpha: 0.7 });

    // Glazed terracotta furin chime dome from above
    anim
      .circle(bellX + 2, bellY + 3, 12.5)
      .fill({ color: 0x1a2614, alpha: 0.24 })
      .circle(bellX, bellY, 12.5)
      .fill({ color: 0xc96a4b, alpha: 1 })
      .stroke({ width: 1.4, color: 0x87412b, alpha: 0.92 })
      .circle(bellX, bellY, 7.5)
      .stroke({ width: 1, color: 0xf2c8a2, alpha: 0.55 })
      .circle(bellX, bellY, 3)
      .fill({ color: 0xe6be68, alpha: 1 });
  }

  private drawCatTreeAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    // Spring-damped dangling coral feather pom-pom hanging off the sage top perch
    const originX = -6;
    const originY = 4;
    const idleSwing = Math.sin(time * 2.1) * 3.8;
    const swingX = idleSwing + prop.swingAngle * 14;
    const swingY = Math.cos(time * 1.6) * 2.2 + Math.abs(prop.swingAngle) * 3.5;

    const pomX = originX - 11 + swingX;
    const pomY = originY + 15 + swingY;

    // Elastic cord
    anim
      .moveTo(originX, originY)
      .quadraticCurveTo(originX - 5 + swingX * 0.45, originY + 8, pomX, pomY)
      .stroke({ width: 1.4, color: 0xebd9c4, alpha: 0.92, cap: 'round' });

    // Fluffy coral pom-pom & soft floor shadow
    anim
      .circle(pomX + 1.5, pomY + 2.5, 6.2)
      .fill({ color: 0x261810, alpha: 0.24 })
      .circle(pomX, pomY, 6)
      .fill({ color: 0xe87b64, alpha: 0.98 })
      .circle(pomX - 1.6, pomY - 1.6, 2.2)
      .fill({ color: 0xfce6d8, alpha: 0.78 });
  }

  private drawTreatJarAnimated(anim: Graphics, prop: InteractivePropRuntime): void {
    // Cork & oak wooden treat jar lid popping joyfully open on click!
    const popOffset = Math.sin(prop.pulseTime * Math.PI) * 5.5;
    const lidX = -14 - popOffset * 0.45;
    const lidY = -popOffset * 0.75;

    anim
      .circle(lidX + 1.5, lidY + 2.5, 11.2)
      .fill({ color: 0x261810, alpha: 0.22 })
      .circle(lidX, lidY, 11.2)
      .fill({ color: 0xc99660, alpha: 1 })
      .stroke({ width: 1.2, color: 0x845b32, alpha: 0.9 });

    // Cute minimalist paw emblem stamped onto the wooden jar lid
    anim
      .circle(lidX, lidY + 1.6, 2.7)
      .circle(lidX - 3.1, lidY - 1.8, 1.3)
      .circle(lidX, lidY - 3, 1.35)
      .circle(lidX + 3.1, lidY - 1.8, 1.3)
      .fill({ color: 0x6b4523, alpha: 0.8 });
  }

  private drawLatteSaucerAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    // Heart latte foam art swirling gently on click
    const angle = Math.sin(time * 0.8) * 0.08 + prop.pulseTime * 2.2;
    const cx = -11;
    const cy = -7;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Cream foam heart centered in latte cup
    const l1x = cx + (-1.7 * cos - -1.1 * sin);
    const l1y = cy + (-1.7 * sin + -1.1 * cos);
    const l2x = cx + (1.7 * cos - -1.1 * sin);
    const l2y = cy + (1.7 * sin + -1.1 * cos);
    const tipX = cx + (0 * cos - 3.3 * sin);
    const tipY = cy + (0 * sin + 3.3 * cos);

    anim
      .circle(l1x, l1y, 2.2)
      .circle(l2x, l2y, 2.2)
      .poly([l1x - 1.6, l1y + 0.8, l2x + 1.6, l2y + 0.8, tipX, tipY])
      .fill({ color: 0xfaf2e8, alpha: 0.95 });
  }

  // ============================================================================
  // Dynamic Dropped Treats, Critters & Click Effects Renderers
  // ============================================================================

  private drawTreatGraphic(gfx: Graphics, treat: DroppedTreat, time: number): void {
    gfx.clear();
    gfx.position.set(treat.x, treat.y);

    const pulse = 0.5 + 0.5 * Math.sin(time * 3.4 + treat.spawnedAt * 2);

    // Subtle warm shimmering attraction ring
    gfx
      .circle(0, 0, 14 + pulse * 3)
      .stroke({ width: 1.1, color: 0xf6ce82, alpha: 0.24 + pulse * 0.16 });

    // Draw 1..3 crunchy miniature fish-biscuit treats matching remainingBites
    const pieces = Math.max(1, Math.min(3, treat.remainingBites));
    const offsets: ReadonlyArray<readonly [number, number, number]> = [
      [-4.5, -2.5, -0.35],
      [5, -1.5, 0.45],
      [0.5, 5, 0.1],
    ];

    for (let i = 0; i < pieces; i++) {
      const [ox, oy, rot] = offsets[i];
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      // Shadow
      gfx
        .ellipse(ox + 1, oy + 2, 4.8, 3)
        .fill({ color: 0x26160c, alpha: 0.26 });

      // Golden crunchy fish-shaped biscuit body + tail fin
      gfx
        .ellipse(ox, oy, 4.5, 2.7)
        .fill({ color: 0xd98a47, alpha: 1 })
        .stroke({ width: 0.8, color: 0x8e5120, alpha: 0.88 })
        .poly([
          ox - cos * 3.5,
          oy - sin * 3.5,
          ox - cos * 7 - sin * 2.6,
          oy - sin * 7 + cos * 2.6,
          ox - cos * 7 + sin * 2.6,
          oy - sin * 7 - cos * 2.6,
        ])
        .fill({ color: 0xc97b3a, alpha: 0.98 })
        .circle(ox + cos * 1.8, oy + sin * 1.8, 0.9)
        .fill({ color: 0xf8d79c, alpha: 0.8 });
    }
  }

  private updateCritterVisual(gfx: Graphics, critter: AmbientCritterRuntime, time: number): void {
    gfx.clear();
    gfx.position.set(critter.x, critter.y);

    if (critter.kind === 'firefly') {
      const pulse = 0.25 + 0.75 * Math.pow((Math.sin(time * (critter.freq * 1.7) + critter.phase) + 1) * 0.5, 2);
      gfx.rotation = 0;
      gfx.scale.set(1);
      gfx
        .circle(0, 0, 11 + pulse * 4)
        .fill({ color: critter.colorA, alpha: 0.2 * pulse })
        .circle(0, 0, 5.2)
        .fill({ color: critter.colorA, alpha: 0.52 * pulse })
        .circle(0, 0, 2.4)
        .fill({ color: critter.colorB, alpha: 0.98 * pulse });
    } else {
      const flap = 0.42 + Math.abs(Math.sin(time * 12 + critter.phase)) * 0.58;
      gfx.rotation = Math.atan2(critter.vy, critter.vx);
      gfx.scale.set(1, flap);
      gfx
        .ellipse(-2.2, -4.8, 4.8, 3.3)
        .ellipse(-2.2, 4.8, 4.8, 3.3)
        .fill({ color: critter.colorA, alpha: 0.94 })
        .ellipse(2.6, -3.4, 3.3, 2.3)
        .ellipse(2.6, 3.4, 3.3, 2.3)
        .fill({ color: critter.colorB, alpha: 0.9 })
        .roundRect(-4.2, -0.8, 8.4, 1.6, 0.8)
        .fill({ color: 0x261f19, alpha: 0.95 });
    }
  }

  private drawClickEffects(): void {
    this.effectsGfx.clear();
    for (const ef of this.world.getActiveEffects()) {
      const t = Math.max(0, Math.min(1, ef.age / ef.duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const radius = ef.startRadius + (ef.endRadius - ef.startRadius) * eased;
      const alpha = (1 - t) * (1 - t) * (ef.style === 'chime' ? 0.62 : 0.52);
      const width = ef.style === 'chime' ? 1.8 : ef.style === 'catnip' ? 2.1 : 1.4;

      this.effectsGfx
        .circle(ef.x, ef.y, radius)
        .stroke({ width, color: ef.color, alpha });

      if (ef.style === 'chime' && t < 0.78) {
        this.effectsGfx
          .circle(ef.x, ef.y, radius * 0.72)
          .stroke({ width: 1, color: ef.color, alpha: alpha * 0.65 });
      }
    }
  }
}
