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

interface AmbientFlake {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  freq: number;
}

/**
 * Renders handcrafted top-down PixiJS v8 interactive props across all 13 NekoScape v2.0 scenes,
 * including the enlarged drinkable Garden Koi Pond, Tabletop Aquarium, Fireplace, Drifting Sunbeam,
 * user-dropped treats, warm light halos, and butterflies / fireflies / birds / moths / sakura / snow.
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
  private readonly ambientFlakes: AmbientFlake[] = [];
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
        prop.interactionType === 'cozy' ||
        prop.interactionType === 'warmth' ||
        prop.interactionType === 'sunbeam'
          ? 'nap'
          : prop.interactionType === 'play' ||
              prop.interactionType === 'water' ||
              prop.interactionType === 'drink' ||
              prop.interactionType === 'watch'
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
    const palette = (SCENE_THEME_DEFS[this.world.getTheme()] ?? SCENE_THEME_DEFS.study).props;

    if (this.world.isEnabled()) {
      for (const node of this.propNodes) {
        this.updatePropVisual(node, time, lighting, palette);
      }

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

      for (const p of this.ambientFlakes) {
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

    this.syncTreatVisuals();
    for (const treat of this.world.getActiveTreats()) {
      const gfx = this.treatGraphics.get(treat.id);
      if (!gfx) continue;
      this.drawTreatGraphic(gfx, treat, time);
    }

    this.syncCritterVisuals();
    for (const critter of this.world.getAmbientCritters()) {
      const gfx = this.critterGraphics.get(critter.id);
      if (!gfx) continue;
      this.updateCritterVisual(gfx, critter, time);
    }

    this.drawClickEffects();
  }

  public destroy(): void {
    this.propNodes.length = 0;
    this.steamWisps.length = 0;
    this.ambientFlakes.length = 0;
    this.treatGraphics.clear();
    this.critterGraphics.clear();
    this.underContainer.destroy({ children: true });
    this.overContainer.destroy({ children: true });
  }

  private rebuildVisuals(): void {
    this.propNodes.length = 0;
    this.steamWisps.length = 0;
    this.ambientFlakes.length = 0;

    this.propsUnderLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.glowOverLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.steamOverLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ambientOverLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    const props = this.world.getAllPropsInternal();
    const palette = (SCENE_THEME_DEFS[this.world.getTheme()] ?? SCENE_THEME_DEFS.study).props;

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
      if (
        prop.kind === 'brass_lamp' ||
        prop.kind === 'andon_lantern' ||
        prop.kind === 'fireplace_hearth' ||
        prop.kind === 'desk_candle' ||
        prop.kind === 'string_lights' ||
        prop.kind === 'tabletop_aquarium' ||
        prop.kind === 'drifting_sunbeam'
      ) {
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

    const theme = this.world.getTheme();
    if (theme === 'tatami') {
      this.buildSakuraPetals();
    } else if (theme === 'snowy_window') {
      this.buildSnowflakes();
    }

    this.syncTreatVisuals();
    this.syncCritterVisuals();

    const time = this.world.getTime();
    const lighting = this.world.getEffectiveLighting();
    for (const node of this.propNodes) {
      this.updatePropVisual(node, time, lighting, palette);
    }
  }

  private registerPropSteam(prop: InteractivePropRuntime): void {
    if (prop.kind === 'coffee_mug' || prop.kind === 'cocoa_mug') {
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
      this.ambientFlakes.push({
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

  private buildSnowflakes(): void {
    for (let i = 0; i < 16; i++) {
      const flake = new Graphics();
      const r = 1.8 + (i % 3) * 0.8;
      flake
        .circle(0, 0, r * 1.8)
        .fill({ color: 0xe6f4ff, alpha: 0.24 })
        .circle(0, 0, r)
        .fill({ color: 0xffffff, alpha: 0.88 });
      this.ambientOverLayer.addChild(flake);
      this.ambientFlakes.push({
        gfx: flake,
        x: ((i * 173 + 40) % Math.max(260, this.viewWidth - 80)) + 40,
        y: ((i * 109 + 20) % Math.max(180, this.viewHeight - 60)) + 20,
        vx: 4 + (i % 3) * 2.5,
        vy: 18 + (i % 4) * 5,
        phase: i * 0.9,
        freq: 1.4 + (i % 3) * 0.3,
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
      case 'cocoa_mug':
        this.drawCocoaMugBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'leather_journal':
        this.drawLeatherJournalBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'bookshelf_nook':
        this.drawBookshelfNookBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'cardboard_scratcher':
        this.drawCardboardScratcherBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'monstera_scratcher':
        this.drawMonsteraScratcherBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'houseplant':
      case 'herb_pot':
      case 'jasmine_pot':
        this.drawPottedPlantBase(shadowGfx, bodyGfx, shadowColor, prop.kind);
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
      case 'cat_tunnel':
        this.drawCatTunnelBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'koi_pond':
        this.drawLargeKoiPondBase(shadowGfx, bodyGfx, shadowColor);
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
      case 'garden_bench':
      case 'rooftop_crate':
        this.drawBenchOrCrateBase(shadowGfx, bodyGfx, shadowColor, prop.kind);
        break;
      case 'cat_tree_tower':
      case 'cat_tree_hammock':
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
      case 'water_fountain':
        this.drawWaterFountainBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'water_glass':
        this.drawWaterGlassBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'water_bowl':
        this.drawWaterBowlBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'fireplace_hearth':
        this.drawFireplaceBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'scratched_sofa':
        this.drawScratchedSofaBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'warm_laptop':
        this.drawWarmLaptopBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'woven_blanket':
      case 'pillow_perch':
        this.drawWovenBlanketBase(shadowGfx, bodyGfx, shadowColor, prop.kind);
        break;
      case 'blanket_lump':
        this.drawBlanketLumpBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'litter_box':
        this.drawLitterBoxBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'rainy_window_pane':
      case 'snowy_window_pane':
        this.drawWindowPaneBase(shadowGfx, bodyGfx, shadowColor, prop.kind === 'snowy_window_pane');
        break;
      case 'windowsill_perch':
        this.drawWindowsillPerchBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'desk_candle':
        this.drawDeskCandleBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'balcony_railing':
      case 'rooftop_parapet':
        this.drawParapetBase(shadowGfx, bodyGfx, shadowColor, prop.kind === 'rooftop_parapet');
        break;
      case 'string_lights':
        this.drawStringLightsBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'fridge_lookout':
        this.drawFridgeLookoutBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'paper_bag_prop':
        this.drawPaperBagBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'radiator_heater':
        this.drawRadiatorBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'drifting_sunbeam':
        // Rendered purely via glowing animGfx + glowGfx
        break;
      case 'taped_floor_square':
        this.drawTapedSquareBase(bodyGfx);
        break;
      case 'tabletop_aquarium':
        this.drawAquariumBase(shadowGfx, bodyGfx, shadowColor);
        break;
      case 'blanket_fort':
        this.drawBlanketFortBase(shadowGfx, bodyGfx, shadowColor);
        break;
      default:
        shadowGfx.circle(3, 5, prop.radius).fill({ color: shadowColor, alpha: 0.24 });
        bodyGfx.circle(0, 0, prop.radius - 2).fill({ color: 0xc99f72, alpha: 1 });
        break;
    }
  }

  // --- Scene 1 & Shared Static Art ---

  private drawBrassLampBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(4, 6, 26)
      .fill({ color: shadowColor, alpha: 0.24 })
      .ellipse(-10, 12, 14, 11)
      .fill({ color: shadowColor, alpha: 0.18 });

    body
      .circle(-11, 9, 13)
      .fill({ color: 0x8b6229, alpha: 1 })
      .stroke({ width: 1.2, color: 0x573b16, alpha: 0.9 })
      .circle(-11, 9, 9.5)
      .fill({ color: 0xc49446, alpha: 1 })
      .circle(-12.5, 7.5, 4)
      .fill({ color: 0xefd08d, alpha: 0.5 })
      .circle(-18, 12, 2.3)
      .fill({ color: 0xf4dca2, alpha: 0.95 })
      .stroke({ width: 0.8, color: 0x624318, alpha: 0.8 })
      .moveTo(-10, 8)
      .quadraticCurveTo(-6, 1, 0, 0)
      .stroke({ width: 3.4, color: 0x9b7031, alpha: 1, cap: 'round' })
      .moveTo(-9.5, 7.5)
      .quadraticCurveTo(-5.5, 0.5, 0, 0)
      .stroke({ width: 1.4, color: 0xe6c37a, alpha: 0.8, cap: 'round' });
  }

  private drawCoffeeMugBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(3, 5, 27)
      .fill({ color: shadowColor, alpha: 0.22 })
      .circle(4, 6, 17)
      .fill({ color: shadowColor, alpha: 0.16 });

    body
      .circle(0, 0, 26)
      .fill({ color: 0x6b452a, alpha: 1 })
      .stroke({ width: 1.4, color: 0x472c1a, alpha: 0.9 })
      .circle(0, 0, 21.5)
      .fill({ color: 0xc49562, alpha: 1 })
      .circle(0, 0, 19)
      .stroke({ width: 0.9, color: 0x8f663d, alpha: 0.55 })
      .moveTo(-18, 12)
      .lineTo(-9, 6)
      .stroke({ width: 2, color: 0xd4aa63, alpha: 0.92, cap: 'round' })
      .ellipse(-19.5, 13, 3.6, 2.2)
      .fill({ color: 0xe7c580, alpha: 0.95 })
      .arc(13, -1, 5.5, -Math.PI * 0.55, Math.PI * 0.55)
      .stroke({ width: 3.4, color: 0xf4ece0, alpha: 1, cap: 'round' })
      .circle(0, -1, 14.5)
      .fill({ color: 0xf5ede2, alpha: 1 })
      .stroke({ width: 1.2, color: 0xc8b7a2, alpha: 0.9 })
      .circle(0, -1, 11.2)
      .fill({ color: 0x452614, alpha: 1 })
      .arc(-1, -2, 13, -Math.PI * 0.85, -Math.PI * 0.25)
      .stroke({ width: 1.4, color: 0xffffff, alpha: 0.72, cap: 'round' });
  }

  private drawCocoaMugBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 5, 25).fill({ color: shadowColor, alpha: 0.24 });
    body
      .circle(0, 0, 24)
      .fill({ color: 0x7390a8, alpha: 1 })
      .stroke({ width: 1.3, color: 0x4c667d, alpha: 0.9 })
      .arc(13, -1, 5, -Math.PI * 0.55, Math.PI * 0.55)
      .stroke({ width: 3.4, color: 0xd46052, alpha: 1, cap: 'round' })
      .circle(0, -1, 14.5)
      .fill({ color: 0xd46052, alpha: 1 })
      .stroke({ width: 1.2, color: 0x9e3b30, alpha: 0.9 })
      .circle(0, -1, 11.2)
      .fill({ color: 0x522a16, alpha: 1 })
      .roundRect(-4.5, -5, 4.2, 4.2, 1.2)
      .roundRect(1.5, -2.5, 4.2, 4.2, 1.2)
      .roundRect(-2.5, 2, 4, 4, 1.2)
      .fill({ color: 0xfff8f0, alpha: 0.95 });
  }

  private drawLeatherJournalBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-29, -20, 60, 44, 6).fill({ color: shadowColor, alpha: 0.25 });
    body
      .roundRect(-31, -23, 60, 44, 5)
      .fill({ color: 0x6e3226, alpha: 1 })
      .stroke({ width: 1.4, color: 0x421b13, alpha: 0.92 })
      .circle(-27.5, -19.5, 1.8)
      .circle(25.5, -19.5, 1.8)
      .circle(-27.5, 17.5, 1.8)
      .circle(25.5, 17.5, 1.8)
      .fill({ color: 0xd8b062, alpha: 0.8 })
      .roundRect(-27.5, -19.5, 26, 37, 2)
      .fill({ color: 0xf4ead8, alpha: 1 })
      .stroke({ width: 0.8, color: 0xd3c2a6, alpha: 0.85 })
      .roundRect(-0.5, -19.5, 26, 37, 2)
      .fill({ color: 0xf8f0e1, alpha: 1 })
      .stroke({ width: 0.8, color: 0xd3c2a6, alpha: 0.85 })
      .moveTo(-1, -19.5)
      .lineTo(-1, 17.5)
      .stroke({ width: 2.2, color: 0x9c8669, alpha: 0.55 });

    for (let ly = -13; ly <= 10; ly += 5) {
      body
        .moveTo(-23, ly)
        .lineTo(-6, ly)
        .moveTo(4, ly)
        .lineTo(ly === 10 ? 15 : 21, ly)
        .stroke({ width: 0.9, color: 0x8f7458, alpha: 0.42, cap: 'round' });
    }

    body
      .poly([-3, 17.5, 1, 17.5, 2, 26, -1, 23.5, -4, 26])
      .fill({ color: 0xb53c34, alpha: 0.95 })
      .circle(27, -21, 6.2)
      .fill({ color: 0x2a323b, alpha: 0.96 })
      .stroke({ width: 1.2, color: 0xcba158, alpha: 0.9 })
      .circle(27, -21, 2.8)
      .fill({ color: 0x141a21, alpha: 1 });
  }

  private drawBookshelfNookBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-48, -20, 100, 46, 7).fill({ color: shadowColor, alpha: 0.26 });
    body
      .roundRect(-50, -23, 100, 46, 6)
      .fill({ color: 0x7a4e2d, alpha: 1 })
      .stroke({ width: 1.6, color: 0x4c2e18, alpha: 0.95 })
      .roundRect(-45, -18, 90, 36, 4)
      .fill({ color: 0x5c391e, alpha: 1 });
  }

  private drawCardboardScratcherBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-36, -19, 76, 42, 7).fill({ color: shadowColor, alpha: 0.24 });
    body
      .roundRect(-38, -22, 76, 42, 6)
      .fill({ color: 0xc69864, alpha: 1 })
      .stroke({ width: 1.5, color: 0x855d34, alpha: 0.92 })
      .roundRect(-32, -16, 64, 30, 4)
      .fill({ color: 0xd9b07e, alpha: 1 });

    for (let x = -28; x <= 28; x += 6) {
      body.moveTo(x, -15).lineTo(x, 13).stroke({ width: 1.2, color: 0x9b7244, alpha: 0.48 });
    }
    // Tiny catnip green crumb flecks & scratch lines
    body
      .circle(-14, -4, 1.6)
      .circle(12, 5, 1.5)
      .circle(4, -7, 1.4)
      .fill({ color: 0x62a85f, alpha: 0.85 });
  }

  private drawMonsteraScratcherBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow
      .circle(-9, 5, 24)
      .fill({ color: shadowColor, alpha: 0.24 })
      .circle(21, 10, 15)
      .fill({ color: shadowColor, alpha: 0.22 });

    body
      .circle(19, 6, 15.5)
      .fill({ color: 0x9d6f45, alpha: 1 })
      .stroke({ width: 1.3, color: 0x654325, alpha: 0.9 })
      .circle(19, 6, 11.2)
      .fill({ color: 0xd4b27c, alpha: 1 })
      .stroke({ width: 1.6, color: 0xa6834e, alpha: 0.9 })
      .circle(19, 6, 8.6)
      .stroke({ width: 1.1, color: 0xb69158, alpha: 0.75 })
      .circle(19, 6, 6.2)
      .fill({ color: 0xe6d1b0, alpha: 1 })
      .circle(19, 6, 2.2)
      .fill({ color: 0xc29e70, alpha: 0.6 })
      .circle(-11, 0, 18.5)
      .fill({ color: 0xb96244, alpha: 1 })
      .stroke({ width: 1.6, color: 0x7a3a25, alpha: 0.9 })
      .circle(-11, 0, 14.2)
      .fill({ color: 0x452e1f, alpha: 1 });
  }

  private drawPottedPlantBase(
    shadow: Graphics,
    body: Graphics,
    shadowColor: number,
    kind: PropVisualNode['prop']['kind'],
  ): void {
    shadow.circle(3, 5, 23).fill({ color: shadowColor, alpha: 0.24 });
    const potColor = kind === 'herb_pot' ? 0xd9ccb8 : kind === 'jasmine_pot' ? 0x68869c : 0xc26a48;
    const rimColor = kind === 'herb_pot' ? 0x9b8c78 : kind === 'jasmine_pot' ? 0x425b6e : 0x823e27;
    body
      .circle(0, 0, 20)
      .fill({ color: potColor, alpha: 1 })
      .stroke({ width: 1.5, color: rimColor, alpha: 0.9 })
      .circle(0, 0, 15)
      .fill({ color: 0x483121, alpha: 1 });
  }

  private drawAndonLanternBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-21, -19, 46, 46, 7).fill({ color: shadowColor, alpha: 0.28 });
    body
      .roundRect(-23, -23, 46, 46, 6)
      .fill({ color: 0x332016, alpha: 1 })
      .stroke({ width: 1.4, color: 0x1c100a, alpha: 0.95 })
      .circle(-19, -19, 1.6)
      .circle(19, -19, 1.6)
      .circle(-19, 19, 1.6)
      .circle(19, 19, 1.6)
      .fill({ color: 0xb88c49, alpha: 0.75 });
  }

  private drawTetsubinTeaBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-32, -23, 68, 50, 11).fill({ color: shadowColor, alpha: 0.28 });
    body
      .roundRect(-34, -26, 68, 50, 10)
      .fill({ color: 0x4e281e, alpha: 1 })
      .stroke({ width: 1.8, color: 0x2b140e, alpha: 0.95 })
      .roundRect(-30, -22, 60, 42, 7)
      .stroke({ width: 1, color: 0xd8aa60, alpha: 0.42 })
      .circle(-13, -4, 15.5)
      .fill({ color: 0xa6895a, alpha: 1 })
      .circle(-13, -4, 13)
      .fill({ color: 0x2c2928, alpha: 1 })
      .stroke({ width: 1.2, color: 0x161413, alpha: 0.95 })
      .moveTo(-2, -1)
      .lineTo(5, 2)
      .stroke({ width: 3.4, color: 0x2c2928, alpha: 1, cap: 'round' })
      .circle(-13, -4, 6.2)
      .fill({ color: 0x3b3634, alpha: 1 })
      .circle(-13, -4, 2.3)
      .fill({ color: 0xd8ac5a, alpha: 1 })
      .circle(15, 5, 11.5)
      .fill({ color: 0xdfd5c5, alpha: 1 })
      .stroke({ width: 1.2, color: 0x9b8f7f, alpha: 0.9 })
      .circle(15, 5, 8.8)
      .fill({ color: 0x62964a, alpha: 1 })
      .ellipse(17, -13, 6.5, 4.8)
      .fill({ color: 0x527945, alpha: 0.92 })
      .circle(17, -13, 3.8)
      .fill({ color: 0xf4bcc7, alpha: 0.98 });
  }

  private drawZabutonBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-27, -23, 58, 52, 11).fill({ color: shadowColor, alpha: 0.24 });
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
    body
      .roundRect(-27, -25, 54, 50, 10)
      .fill({ color: 0x334b60, alpha: 1 })
      .stroke({ width: 1.6, color: 0xd8b26b, alpha: 0.9 })
      .roundRect(-21, -19, 42, 38, 7)
      .stroke({ width: 1, color: 0xe6c88a, alpha: 0.45 })
      .circle(0, 0, 6)
      .fill({ color: 0x1e2e3d, alpha: 0.42 })
      .moveTo(-5, -5)
      .lineTo(5, 5)
      .moveTo(5, -5)
      .lineTo(-5, 5)
      .stroke({ width: 1.6, color: 0xe8c987, alpha: 0.95, cap: 'round' });
  }

  private drawBambooClackerBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 6, 30).fill({ color: shadowColor, alpha: 0.28 });
    body
      .circle(0, 0, 29)
      .fill({ color: 0x7b756c, alpha: 1 })
      .stroke({ width: 1.6, color: 0x4d4841, alpha: 0.92 })
      .circle(-2, 2, 21)
      .fill({ color: 0x2b625c, alpha: 1 })
      .circle(-2, 2, 16)
      .fill({ color: 0x397a72, alpha: 0.72 })
      .circle(-21, -14, 6.5)
      .circle(-15, -20, 5)
      .circle(18, 17, 5.5)
      .fill({ color: 0x5c8549, alpha: 0.88 })
      .circle(-2, -11, 3.2)
      .circle(-2, 10, 3.2)
      .fill({ color: 0x4a6b35, alpha: 1 });
  }

  private drawCatTunnelBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-42, -20, 88, 44, 18).fill({ color: shadowColor, alpha: 0.25 });
    body
      .roundRect(-44, -22, 88, 44, 20)
      .fill({ color: 0x5f7d76, alpha: 1 })
      .stroke({ width: 1.6, color: 0x3c524d, alpha: 0.92 });
    // Ribbed fabric bands
    for (let x = -28; x <= 28; x += 14) {
      body.moveTo(x, -21).lineTo(x, 21).stroke({ width: 2.2, color: 0xd9c29f, alpha: 0.6 });
    }
    // Dark cozy peekaboo tunnel openings
    body
      .ellipse(-36, 0, 9, 17)
      .fill({ color: 0x24312e, alpha: 0.96 })
      .ellipse(36, 0, 9, 17)
      .fill({ color: 0x24312e, alpha: 0.96 });
  }

  // --- Scene 3: Enlarged Lush Interactive Koi Pond (~168x124px) ---

  private drawLargeKoiPondBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    // Grounded elliptical shadow (~172x128)
    shadow
      .ellipse(5, 8, 86, 64)
      .fill({ color: shadowColor, alpha: 0.3 });

    // Lush ring of 22 organic weathered mossy river boulders
    const stoneColors = [0x7e766c, 0x6b645c, 0x8e857a, 0x5e7054, 0x766e64];
    const stoneCount = 22;
    for (let i = 0; i < stoneCount; i++) {
      const a = (i / stoneCount) * Math.PI * 2;
      const sx = Math.cos(a) * 76;
      const sy = Math.sin(a) * 54;
      const rw = 13 + (i % 3) * 2.6;
      const rh = 10.5 + (i % 2) * 2.4;
      body
        .ellipse(sx, sy, rw, rh)
        .fill({ color: stoneColors[i % stoneColors.length], alpha: 1 })
        .stroke({ width: 1.2, color: 0x38332d, alpha: 0.55 });
    }

    // Multi-layered translucent emerald/teal water depth
    body
      .ellipse(0, 0, 70, 49)
      .fill({ color: 0x16413e, alpha: 1 })
      .ellipse(-3, -2, 60, 41)
      .fill({ color: 0x225d57, alpha: 0.88 })
      .ellipse(-6, -5, 44, 29)
      .fill({ color: 0x317870, alpha: 0.65 })
      .ellipse(-9, -7, 26, 17)
      .fill({ color: 0x47968d, alpha: 0.36 });

    // Submerged river stones visible through crystal water
    const pebbles: ReadonlyArray<readonly [number, number, number]> = [
      [-32, 16, 4.6],
      [26, 18, 4.2],
      [14, -22, 4.8],
      [-22, -20, 3.8],
      [42, -6, 3.4],
    ];
    for (const [px, py, pr] of pebbles) {
      body.circle(px, py, pr).fill({ color: 0xc9bca4, alpha: 0.22 });
    }

    // Rich velvet moss cushions hugging rim boulders
    const mossSpots: ReadonlyArray<readonly [number, number, number]> = [
      [-68, -22, 7.5],
      [-54, -38, 6.2],
      [58, 32, 7.2],
      [68, 18, 5.5],
      [-42, 42, 6.4],
      [34, -44, 5.8],
    ];
    for (const [mx, my, mr] of mossSpots) {
      body.circle(mx, my, mr).fill({ color: 0x5c8948, alpha: 0.92 });
    }
  }

  private drawKoiBirdbathBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.ellipse(4, 7, 45, 39).fill({ color: shadowColor, alpha: 0.28 });
    const stoneColors = [0x827a70, 0x6f675f, 0x91887d, 0x627358];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      body
        .ellipse(Math.cos(a) * 37, Math.sin(a) * 31, 10 + (i % 3) * 1.8, 8.2 + (i % 2) * 1.6)
        .fill({ color: stoneColors[i % stoneColors.length], alpha: 1 })
        .stroke({ width: 1, color: 0x3e3933, alpha: 0.5 });
    }
    body
      .ellipse(0, 0, 33, 27)
      .fill({ color: 0x215550, alpha: 1 })
      .ellipse(-2, -2, 27, 21)
      .fill({ color: 0x31746d, alpha: 0.85 });
  }

  private drawCatnipPlanterBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 6, 29).fill({ color: shadowColor, alpha: 0.26 });
    body
      .circle(0, 0, 27)
      .fill({ color: 0xb96749, alpha: 1 })
      .stroke({ width: 1.6, color: 0x7c3e28, alpha: 0.92 })
      .circle(0, 0, 21.5)
      .fill({ color: 0x453020, alpha: 1 })
      .arc(0, 0, 24.5, -Math.PI * 0.85, -Math.PI * 0.15)
      .stroke({ width: 1.4, color: 0xe49d80, alpha: 0.5, cap: 'round' });
  }

  private drawButterflyStoneBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.ellipse(3, 5, 29, 24).fill({ color: shadowColor, alpha: 0.24 });
    body
      .poly([-24, -10, -12, -22, 14, -20, 26, -6, 23, 14, 6, 22, -18, 18, -27, 4])
      .fill({ color: 0xb9b2a2, alpha: 1 })
      .stroke({ width: 1.5, color: 0x797366, alpha: 0.85 })
      .ellipse(-2, -2, 17, 13)
      .fill({ color: 0xd0cab9, alpha: 0.65 })
      .circle(-20, 14, 4.2)
      .circle(-15, 17, 3.8)
      .circle(-22, 9, 3.4)
      .fill({ color: 0x5c8a47, alpha: 0.92 });
  }

  private drawWindChimeBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 5, 27).fill({ color: shadowColor, alpha: 0.22 });
    body
      .circle(0, 0, 26)
      .fill({ color: 0x678352, alpha: 1 })
      .stroke({ width: 1.5, color: 0x455d35, alpha: 0.88 })
      .circle(0, 0, 20)
      .fill({ color: 0x829f69, alpha: 0.82 })
      .moveTo(-22, -14)
      .lineTo(0, 0)
      .stroke({ width: 3.2, color: 0x8a653e, alpha: 0.95, cap: 'round' });
  }

  private drawBenchOrCrateBase(
    shadow: Graphics,
    body: Graphics,
    shadowColor: number,
    kind: 'garden_bench' | 'rooftop_crate',
  ): void {
    const w = kind === 'garden_bench' ? 84 : 74;
    const h = kind === 'garden_bench' ? 42 : 48;
    shadow.roundRect(-w * 0.5 + 3, -h * 0.5 + 4, w, h, 8).fill({ color: shadowColor, alpha: 0.25 });
    body
      .roundRect(-w * 0.5, -h * 0.5, w, h, 7)
      .fill({ color: 0x9b6b43, alpha: 1 })
      .stroke({ width: 1.5, color: 0x5e3c20, alpha: 0.92 });
    for (let y = -h * 0.5 + 8; y < h * 0.5 - 6; y += 9) {
      body.moveTo(-w * 0.5 + 4, y).lineTo(w * 0.5 - 4, y).stroke({ width: 1, color: 0x634022, alpha: 0.45 });
    }
    // Cozy cushion on top
    body
      .roundRect(-w * 0.38, -h * 0.34, w * 0.76, h * 0.68, 6)
      .fill({ color: kind === 'garden_bench' ? 0xebe0cf : 0xc66b5c, alpha: 0.96 })
      .stroke({ width: 1.2, color: 0x855a44, alpha: 0.6 });
  }

  // --- Scene 4 & Water / Furniture Props ---

  private drawCatTreeBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-38, -32, 82, 70, 15).fill({ color: shadowColor, alpha: 0.26 });
    body
      .roundRect(-40, -34, 80, 68, 15)
      .fill({ color: 0xcda476, alpha: 1 })
      .stroke({ width: 1.6, color: 0x8a623c, alpha: 0.9 })
      // Cozy felt hidey-hole cubby
      .roundRect(-34, 6, 30, 22, 8)
      .fill({ color: 0x526956, alpha: 1 })
      .circle(-19, 17, 7.5)
      .fill({ color: 0x263228, alpha: 0.96 })
      // Sisal post
      .circle(-18, -14, 12)
      .fill({ color: 0xb38a5d, alpha: 1 })
      .stroke({ width: 1.5, color: 0x775634, alpha: 0.9 })
      .circle(-18, -14, 5.5)
      .fill({ color: 0xdfc196, alpha: 1 })
      // Plush hammock / top perch
      .circle(13, -4, 23)
      .fill({ color: 0x718d74, alpha: 1 })
      .stroke({ width: 1.4, color: 0x4f6751, alpha: 0.9 })
      .circle(13, -4, 16)
      .fill({ color: 0xeee3d5, alpha: 1 });
  }

  private drawTreatJarBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-31, -18, 66, 42, 12).fill({ color: shadowColor, alpha: 0.24 });
    body
      .roundRect(-33, -21, 66, 42, 12)
      .fill({ color: 0xebe0d0, alpha: 1 })
      .stroke({ width: 1.3, color: 0xb9a287, alpha: 0.85 })
      .circle(-14, 0, 14.5)
      .fill({ color: 0xf7efe4, alpha: 1 })
      .stroke({ width: 1.4, color: 0xb99d80, alpha: 0.9 })
      .circle(15, 1, 13.5)
      .fill({ color: 0xc97354, alpha: 1 })
      .stroke({ width: 1.3, color: 0x87452e, alpha: 0.9 })
      .circle(15, 1, 10)
      .fill({ color: 0x573620, alpha: 1 })
      .circle(12, -1, 2.3)
      .circle(17.5, -1.5, 2.3)
      .circle(14.5, 3.5, 2.3)
      .fill({ color: 0xd98e4c, alpha: 1 });
  }

  private drawLatteSaucerBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(4, 6, 35).fill({ color: shadowColor, alpha: 0.25 });
    body
      .circle(0, 0, 34)
      .fill({ color: 0xf4ede3, alpha: 1 })
      .stroke({ width: 2.2, color: 0xbc8e4b, alpha: 0.92 })
      .circle(-11, -7, 12.5)
      .fill({ color: 0xe6dac9, alpha: 1 })
      .circle(-11, -7, 9.5)
      .fill({ color: 0xffffff, alpha: 1 })
      .circle(-11, -7, 7.6)
      .fill({ color: 0x8b5736, alpha: 1 })
      .circle(12, 10, 14)
      .fill({ color: 0xe7dbca, alpha: 1 })
      .arc(11, 10, 6.2, -0.65, Math.PI * 0.92)
      .stroke({ width: 5.5, color: 0xd68c3e, alpha: 1, cap: 'round' })
      .circle(17, 5, 3.6)
      .fill({ color: 0xd94b45, alpha: 0.96 });
  }

  private drawDonutBedBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 6, 33).fill({ color: shadowColor, alpha: 0.24 });
    body
      .circle(0, 0, 32)
      .fill({ color: 0xc86e54, alpha: 1 })
      .stroke({ width: 1.4, color: 0x8e4733, alpha: 0.85 })
      .circle(0, 0, 20.5)
      .fill({ color: 0xf3e5d2, alpha: 1 });
  }

  private drawWaterFountainBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 5, 29).fill({ color: shadowColor, alpha: 0.24 });
    body
      .circle(0, 0, 28)
      .fill({ color: 0xeaf1f4, alpha: 1 })
      .stroke({ width: 1.6, color: 0x9ab3bf, alpha: 0.92 })
      .circle(0, 0, 22)
      .fill({ color: 0x62b7cc, alpha: 0.85 })
      .circle(0, -4, 9.5)
      .fill({ color: 0xdce8ee, alpha: 1 })
      .stroke({ width: 1.1, color: 0x8ea9b5, alpha: 0.85 });
  }

  private drawWaterGlassBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 4, 20).fill({ color: shadowColor, alpha: 0.22 });
    body
      .circle(0, 0, 20)
      .fill({ color: 0xc49562, alpha: 1 })
      .stroke({ width: 1.2, color: 0x7d5834, alpha: 0.85 })
      .circle(0, 0, 12.5)
      .fill({ color: 0xcbeaf5, alpha: 0.85 })
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 })
      .circle(0, 0, 9.5)
      .fill({ color: 0x82cbe0, alpha: 0.65 });
  }

  private drawWaterBowlBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(3, 5, 23).fill({ color: shadowColor, alpha: 0.24 });
    body
      .circle(0, 0, 22)
      .fill({ color: 0x5c8d9e, alpha: 1 })
      .stroke({ width: 1.5, color: 0x3b606e, alpha: 0.92 })
      .circle(0, 0, 16.5)
      .fill({ color: 0x84cde0, alpha: 0.9 });
  }

  private drawFireplaceBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-56, -24, 118, 56, 8).fill({ color: shadowColor, alpha: 0.3 });
    // Stone hearth apron
    body
      .roundRect(-58, -28, 116, 56, 7)
      .fill({ color: 0x8c837a, alpha: 1 })
      .stroke({ width: 1.6, color: 0x544d46, alpha: 0.95 })
      // Firebox pit
      .roundRect(-42, -16, 84, 34, 5)
      .fill({ color: 0x261a14, alpha: 1 })
      // Charred oak logs
      .roundRect(-28, -4, 56, 9, 4)
      .fill({ color: 0x4d3121, alpha: 1 })
      .roundRect(-22, 4, 44, 8, 4)
      .fill({ color: 0x3c2417, alpha: 1 });
  }

  private drawScratchedSofaBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-50, -28, 106, 62, 12).fill({ color: shadowColor, alpha: 0.26 });
    body
      .roundRect(-52, -32, 104, 62, 12)
      .fill({ color: 0x6f847c, alpha: 1 })
      .stroke({ width: 1.6, color: 0x465851, alpha: 0.92 })
      // Plush seat cushions
      .roundRect(-44, -22, 42, 44, 7)
      .fill({ color: 0x889e96, alpha: 1 })
      .roundRect(2, -22, 42, 44, 7)
      .fill({ color: 0x889e96, alpha: 1 })
      // Cozy mustard throw pillow
      .roundRect(-38, -16, 20, 22, 5)
      .fill({ color: 0xdfb15b, alpha: 0.96 });
    // Frayed cat scratch marks on right armrest!
    body
      .moveTo(46, -12)
      .lineTo(52, -6)
      .moveTo(46, -4)
      .lineTo(53, 2)
      .moveTo(46, 4)
      .lineTo(52, 10)
      .stroke({ width: 1.4, color: 0xe6d6bc, alpha: 0.8, cap: 'round' });
  }

  private drawWarmLaptopBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-34, -22, 72, 48, 6).fill({ color: shadowColor, alpha: 0.25 });
    body
      .roundRect(-34, -22, 68, 44, 5)
      .fill({ color: 0xc2c8d0, alpha: 1 })
      .stroke({ width: 1.3, color: 0x79828c, alpha: 0.92 })
      // Keyboard deck
      .roundRect(-28, -2, 56, 18, 3)
      .fill({ color: 0x353b42, alpha: 1 })
      // Warm glowing screen panel
      .roundRect(-29, -19, 58, 14, 3)
      .fill({ color: 0xffe8b8, alpha: 0.92 });
  }

  private drawWovenBlanketBase(
    shadow: Graphics,
    body: Graphics,
    shadowColor: number,
    kind: 'woven_blanket' | 'pillow_perch',
  ): void {
    shadow.roundRect(-38, -24, 80, 52, 12).fill({ color: shadowColor, alpha: 0.22 });
    const fill = kind === 'pillow_perch' ? 0xf4ebe2 : 0xc67c6a;
    const trim = kind === 'pillow_perch' ? 0xc29c94 : 0xf2e2d2;
    body
      .roundRect(-40, -26, 80, 52, 12)
      .fill({ color: fill, alpha: 1 })
      .stroke({ width: 1.5, color: trim, alpha: 0.9 })
      .roundRect(-31, -18, 62, 36, 8)
      .stroke({ width: 1.2, color: trim, alpha: 0.55 });
  }

  private drawBlanketLumpBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.ellipse(3, 5, 42, 28).fill({ color: shadowColor, alpha: 0.24 });
    body
      .roundRect(-40, -26, 80, 52, 14)
      .fill({ color: 0xd9b8b2, alpha: 1 })
      .stroke({ width: 1.5, color: 0xa67c76, alpha: 0.9 });
  }

  private drawLitterBoxBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-40, -28, 84, 60, 12).fill({ color: shadowColor, alpha: 0.26 });
    body
      .roundRect(-42, -30, 84, 60, 12)
      .fill({ color: 0x8ea9b8, alpha: 1 })
      .stroke({ width: 1.6, color: 0x5c7585, alpha: 0.92 })
      .roundRect(-34, -22, 68, 44, 8)
      .fill({ color: 0xe6dcc8, alpha: 1 });
    // Clean sand granules
    for (let i = -24; i <= 24; i += 12) {
      body.circle(i, -6, 1.3).circle(i + 5, 8, 1.3).fill({ color: 0xb8aa92, alpha: 0.65 });
    }
  }

  private drawWindowPaneBase(
    shadow: Graphics,
    body: Graphics,
    shadowColor: number,
    isSnowy: boolean,
  ): void {
    shadow.roundRect(-80, -20, 164, 44, 6).fill({ color: shadowColor, alpha: 0.2 });
    body
      .roundRect(-82, -22, 164, 44, 5)
      .fill({ color: isSnowy ? 0x9ec0d8 : 0x526b80, alpha: 0.92 })
      .stroke({ width: 2.2, color: isSnowy ? 0xf2f7fc : 0x3b4854, alpha: 0.95 })
      .moveTo(0, -22)
      .lineTo(0, 22)
      .stroke({ width: 2.4, color: isSnowy ? 0xe6eff6 : 0x3b4854, alpha: 0.95 });
  }

  private drawWindowsillPerchBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-44, -18, 92, 40, 8).fill({ color: shadowColor, alpha: 0.22 });
    body
      .roundRect(-46, -20, 92, 40, 8)
      .fill({ color: 0xebd9c4, alpha: 1 })
      .stroke({ width: 1.5, color: 0xb59c80, alpha: 0.9 })
      .roundRect(-38, -14, 76, 28, 6)
      .fill({ color: 0xf7efe4, alpha: 0.72 });
  }

  private drawDeskCandleBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.circle(2, 4, 18).fill({ color: shadowColor, alpha: 0.22 });
    body
      .circle(0, 0, 16)
      .fill({ color: 0xc27b48, alpha: 0.95 })
      .stroke({ width: 1.4, color: 0x7d4822, alpha: 0.9 })
      .circle(0, 0, 12)
      .fill({ color: 0xf7ebd2, alpha: 1 });
  }

  private drawParapetBase(
    shadow: Graphics,
    body: Graphics,
    shadowColor: number,
    isBrick: boolean,
  ): void {
    shadow.roundRect(-78, -20, 160, 44, 6).fill({ color: shadowColor, alpha: 0.28 });
    body
      .roundRect(-80, -22, 160, 44, 5)
      .fill({ color: isBrick ? 0x9b5446 : 0x363e4a, alpha: 1 })
      .stroke({ width: 1.6, color: isBrick ? 0x623128 : 0x1d232b, alpha: 0.95 });
    if (isBrick) {
      for (let x = -60; x <= 60; x += 24) {
        body.moveTo(x, -22).lineTo(x, 22).stroke({ width: 1.2, color: 0xd8c6b8, alpha: 0.35 });
      }
    }
  }

  private drawStringLightsBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.ellipse(2, 4, 28, 18).fill({ color: shadowColor, alpha: 0.16 });
    body
      .moveTo(-26, -6)
      .quadraticCurveTo(0, 10, 26, -6)
      .stroke({ width: 2, color: 0x2c2826, alpha: 0.9 });
  }

  private drawFridgeLookoutBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-46, -32, 98, 70, 9).fill({ color: shadowColor, alpha: 0.28 });
    body
      .roundRect(-48, -34, 96, 68, 8)
      .fill({ color: 0xd9e0e4, alpha: 1 })
      .stroke({ width: 1.8, color: 0x909ca3, alpha: 0.95 })
      .roundRect(-42, -28, 84, 56, 6)
      .fill({ color: 0xeef2f4, alpha: 1 })
      // Cute green & cream kitchen mat on fridge top
      .roundRect(-24, -16, 48, 32, 6)
      .fill({ color: 0x84a882, alpha: 0.9 });
  }

  private drawPaperBagBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-34, -22, 72, 48, 8).fill({ color: shadowColor, alpha: 0.24 });
    body
      .poly([-36, -20, 32, -24, 36, 22, -34, 24])
      .fill({ color: 0xc99c68, alpha: 1 })
      .stroke({ width: 1.5, color: 0x875e32, alpha: 0.92 })
      .ellipse(-30, 2, 7, 18)
      .fill({ color: 0x452d17, alpha: 0.92 });
  }

  private drawRadiatorBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-46, -22, 96, 48, 8).fill({ color: shadowColor, alpha: 0.25 });
    body
      .roundRect(-48, -24, 96, 48, 8)
      .fill({ color: 0xdcd6cc, alpha: 1 })
      .stroke({ width: 1.5, color: 0x8f887d, alpha: 0.92 });
    for (let x = -38; x <= 38; x += 11) {
      body
        .roundRect(x - 3, -19, 6, 38, 3)
        .fill({ color: 0xf0ebe2, alpha: 1 })
        .stroke({ width: 0.9, color: 0x9c9489, alpha: 0.8 });
    }
  }

  private drawTapedSquareBase(body: Graphics): void {
    // Classic pale masking-tape square taped cleanly to floor!
    const s = 32;
    body
      .rect(-s, -s, s * 2, 5)
      .rect(-s, s - 5, s * 2, 5)
      .rect(-s, -s, 5, s * 2)
      .rect(s - 5, -s, 5, s * 2)
      .fill({ color: 0xf2e6c8, alpha: 0.92 });
  }

  private drawAquariumBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-58, -32, 122, 70, 10).fill({ color: shadowColor, alpha: 0.3 });
    body
      .roundRect(-60, -34, 120, 68, 8)
      .fill({ color: 0x262e38, alpha: 1 })
      .stroke({ width: 1.8, color: 0x151b22, alpha: 0.95 })
      .roundRect(-53, -27, 106, 54, 5)
      .fill({ color: 0x165e73, alpha: 1 })
      .roundRect(-48, -22, 96, 44, 4)
      .fill({ color: 0x23829c, alpha: 0.78 });
    // Sandy bottom pebbles & green aquatic kelp clusters
    body
      .circle(-34, 12, 6)
      .circle(-24, 15, 5)
      .circle(34, 14, 6.5)
      .fill({ color: 0x3b8f64, alpha: 0.92 });
  }

  private drawBlanketFortBase(shadow: Graphics, body: Graphics, shadowColor: number): void {
    shadow.roundRect(-44, -32, 94, 70, 14).fill({ color: shadowColor, alpha: 0.28 });
    body
      .poly([-44, 28, -22, -34, 24, -34, 46, 28])
      .fill({ color: 0x4b748a, alpha: 1 })
      .stroke({ width: 1.6, color: 0x2d4b5c, alpha: 0.95 })
      .poly([-18, 28, 0, -14, 18, 28])
      .fill({ color: 0x1d2b36, alpha: 0.96 });
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
    const { prop, root, hoverRing, bodyGfx, animGfx, glowGfx } = node;

    root.position.set(prop.x, prop.y);
    if (glowGfx) {
      glowGfx.position.set(prop.x, prop.y);
    }

    // Tip-able props visibly tilt onto their side when tipped by a curious cat
    const targetRot = prop.isTipped ? 0.52 : 0;
    bodyGfx.rotation += (targetRot - bodyGfx.rotation) * 0.22;
    animGfx.rotation = bodyGfx.rotation;

    // 1. Subtle hover & active highlight ring beneath prop
    hoverRing.clear();
    const hoverAlpha = prop.hoverGlow * 0.48;
    const pulseActive = !this.isWarmLamp(prop.kind) && prop.isActive ? 0.16 + Math.sin(time * 4.2) * 0.06 : 0;
    const ringAlpha = Math.max(hoverAlpha, pulseActive);
    if (ringAlpha > 0.015 && prop.kind !== 'drifting_sunbeam') {
      const ringColor = prop.hoverGlow > 0.15 ? palette.hoverRingColor : palette.activeRingColor;
      if (prop.radiusX && prop.radiusY) {
        const rx = prop.radiusX + 5 + prop.hoverGlow * 3;
        const ry = prop.radiusY + 5 + prop.hoverGlow * 3;
        hoverRing
          .ellipse(0, 0, rx, ry)
          .fill({ color: ringColor, alpha: ringAlpha * 0.22 })
          .ellipse(0, 0, rx, ry)
          .stroke({ width: 1.6, color: ringColor, alpha: Math.min(0.75, ringAlpha * 1.15) });
      } else {
        const ringRadius = prop.radius + 4 + prop.hoverGlow * 2.5;
        hoverRing
          .circle(0, 0, ringRadius)
          .fill({ color: ringColor, alpha: ringAlpha * 0.22 })
          .circle(0, 0, ringRadius)
          .stroke({ width: 1.5, color: ringColor, alpha: Math.min(0.75, ringAlpha * 1.15) });
      }
    }

    // 2. Tactile spring squash-and-stretch click/knead bounce
    let sx = 1;
    let sy = 1;
    if (prop.pulseTime > 0) {
      const wave = Math.sin(prop.pulseTime * Math.PI * 2.5) * prop.pulseTime;
      if (
        prop.kind === 'zabuton_cushion' ||
        prop.kind === 'donut_cat_bed' ||
        prop.kind === 'woven_blanket' ||
        prop.kind === 'pillow_perch' ||
        prop.kind === 'blanket_lump'
      ) {
        sx = 1 + wave * 0.14;
        sy = 1 - wave * 0.11;
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
      case 'cocoa_mug':
        this.drawCoffeeMugAnimated(animGfx, prop, time);
        break;
      case 'leather_journal':
        this.drawLeatherJournalAnimated(animGfx, prop, time);
        break;
      case 'bookshelf_nook':
        this.drawBookshelfAnimated(animGfx, prop);
        break;
      case 'monstera_scratcher':
        this.drawMonsteraAnimated(animGfx, prop, time);
        break;
      case 'houseplant':
      case 'herb_pot':
      case 'jasmine_pot':
        this.drawPottedPlantAnimated(animGfx, prop, time);
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
      case 'koi_pond':
        this.drawLargeKoiPondAnimated(animGfx, prop, time);
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
      case 'cat_tree_hammock':
        this.drawCatTreeAnimated(animGfx, prop, time);
        break;
      case 'treat_jar':
        this.drawTreatJarAnimated(animGfx, prop);
        break;
      case 'latte_saucer':
        this.drawLatteSaucerAnimated(animGfx, prop, time);
        break;
      case 'water_fountain':
        this.drawWaterFountainAnimated(animGfx, time);
        break;
      case 'water_glass':
      case 'water_bowl':
        this.drawWaterShimmerAnimated(animGfx, time, prop.kind === 'water_glass' ? 7 : 11);
        break;
      case 'fireplace_hearth':
        this.drawFireplaceAnimated(animGfx, glowGfx, prop, time, lighting, palette);
        break;
      case 'desk_candle':
        this.drawDeskCandleAnimated(animGfx, glowGfx, prop, time, lighting, palette);
        break;
      case 'string_lights':
        this.drawStringLightsAnimated(animGfx, glowGfx, prop, time, lighting, palette);
        break;
      case 'rainy_window_pane':
        this.drawRainyWindowAnimated(animGfx, time);
        break;
      case 'snowy_window_pane':
        this.drawSnowyWindowAnimated(animGfx, time);
        break;
      case 'balcony_railing':
      case 'rooftop_parapet':
        this.drawBokehLightsAnimated(animGfx, time);
        break;
      case 'blanket_lump':
        this.drawBlanketLumpAnimated(animGfx, prop, time);
        break;
      case 'drifting_sunbeam':
        this.drawDriftingSunbeamAnimated(animGfx, glowGfx, time, lighting, palette);
        break;
      case 'tabletop_aquarium':
        this.drawAquariumAnimated(animGfx, glowGfx, prop, time, lighting);
        break;
      default:
        break;
    }
  }

  private isWarmLamp(kind: string): boolean {
    return (
      kind === 'brass_lamp' ||
      kind === 'andon_lantern' ||
      kind === 'fireplace_hearth' ||
      kind === 'desk_candle' ||
      kind === 'string_lights'
    );
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
    const shadeOuter = lit > 0.35 ? 0xe5b86d : 0xbaa88f;
    const shadeInner = lit > 0.35 ? 0xfff0c8 : 0xd8cbb6;

    anim
      .circle(0, 0, 22)
      .fill({ color: shadeOuter, alpha: 1 })
      .stroke({ width: 1.5, color: 0x865d28, alpha: 0.9 })
      .circle(0, 0, 15.5)
      .fill({ color: shadeInner, alpha: 0.72 + lit * 0.28 });

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      anim
        .moveTo(Math.cos(a) * 6, Math.sin(a) * 6)
        .lineTo(Math.cos(a) * 21, Math.sin(a) * 21)
        .stroke({ width: 0.9, color: 0x8a612d, alpha: 0.28 });
    }

    if (lit > 0.02) {
      anim.circle(0, 0, 11 * flicker).fill({ color: 0xfff7dc, alpha: lit * 0.55 });
    }

    anim
      .circle(0, 0, 4.4)
      .fill({ color: 0xbd8a3a, alpha: 1 })
      .stroke({ width: 0.9, color: 0x694819, alpha: 0.85 });

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
    const swirlRot = time * 0.35 + prop.pulseTime * 4.5;
    anim
      .arc(0, -1, 5.2, swirlRot, swirlRot + Math.PI * 1.15)
      .stroke({ width: 1.5, color: 0xe3bd8d, alpha: 0.82, cap: 'round' });
  }

  private drawLeatherJournalAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    if (prop.pageFlipProgress > 0 && prop.pageFlipProgress < 1) {
      const t = prop.pageFlipProgress;
      const eased = 1 - Math.pow(1 - t, 3);
      const leafX = 25 * (1 - eased * 2);
      const liftY = Math.sin(eased * Math.PI) * 5;
      anim
        .poly([-1, -19, leafX, -19 - liftY, leafX, 17 - liftY, -1, 17])
        .fill({ color: 0xfbf4e6, alpha: 0.96 })
        .stroke({ width: 0.9, color: 0xcab696, alpha: 0.85 });
    }

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

    anim
      .moveTo(qx - cos * 3, qy - sin * 3)
      .quadraticCurveTo(qx + cos * 8 + perpX * 6, qy + sin * 8 + perpY * 6, plumeX, plumeY)
      .quadraticCurveTo(qx + cos * 8 - perpX * 5.5, qy + sin * 8 - perpY * 5.5, qx - cos * 3, qy - sin * 3)
      .fill({ color: 0xf8eedb, alpha: 0.97 })
      .moveTo(tipX, tipY)
      .lineTo(plumeX, plumeY)
      .stroke({ width: 1.5, color: 0xcba158, alpha: 0.95, cap: 'round' });
  }

  private drawBookshelfAnimated(anim: Graphics, prop: InteractivePropRuntime): void {
    const bookColors = [0xb34d42, 0x4b7485, 0xc79246, 0x5c7c57, 0x7b5678, 0xc46b48, 0x45637a];
    for (let i = 0; i < bookColors.length; i++) {
      const bx = -38 + i * 11;
      const askew = prop.isTipped && i === 3 ? 0.32 : prop.swingAngle * (i === 3 ? 0.12 : 0.03);
      const tilt = askew * 10;
      anim
        .poly([bx, -15, bx + 8 + tilt, -15, bx + 8, 15, bx - tilt, 15])
        .fill({ color: bookColors[i], alpha: 0.96 })
        .stroke({ width: 0.8, color: 0x2b1a10, alpha: 0.65 });
    }
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
    }
  }

  private drawPottedPlantAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const sway = Math.sin(time * 1.7) * 0.04 + prop.swingAngle * 0.15;
    const count = prop.kind === 'herb_pot' ? 8 : 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + sway;
      const len = prop.kind === 'herb_pot' ? 16 : 21;
      const lx = Math.cos(a) * len;
      const ly = Math.sin(a) * len;
      anim
        .ellipse(lx * 0.65, ly * 0.65, len * 0.45, 5.2)
        .fill({ color: i % 2 === 0 ? 0x4b8a55 : 0x62a46a, alpha: 0.96 });
      if (prop.kind === 'jasmine_pot' && i % 2 === 0) {
        anim.circle(lx * 0.9, ly * 0.9, 3.2).fill({ color: 0xfff8eb, alpha: 0.96 });
      }
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
    const outerPaper = lit > 0.35 ? 0xf3be70 : 0xc9beae;
    const innerPaper = lit > 0.35 ? 0xfff5dc : 0xdfd6c7;

    anim
      .roundRect(-17, -17, 34, 34, 4)
      .fill({ color: outerPaper, alpha: 1 })
      .circle(0, 0, 12.5 * (0.94 + lit * 0.08 * flicker))
      .fill({ color: innerPaper, alpha: 0.7 + lit * 0.3 });

    if (lit > 0.05) {
      anim.circle(0, 0, 5.5 * flicker).fill({ color: 0xffffff, alpha: lit * 0.6 });
    }

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
    const angle = time * 0.4 + prop.pulseTime * 5.2;
    anim
      .arc(15, 5, 5, angle, angle + Math.PI * 1.2)
      .stroke({ width: 1.3, color: 0xbde29e, alpha: 0.72, cap: 'round' });
  }

  private drawBambooClackerAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const shimmer = (Math.sin(time * 2.2) + 1) * 0.5;
    anim.circle(-2, 2, 10 + shimmer * 3).stroke({ width: 1, color: 0xdff5f0, alpha: 0.22 });

    const tilt = Math.sin(prop.swingAngle * 0.65) * 6;
    const lenShift = tilt * 0.45;
    anim
      .roundRect(-18 + lenShift, -4.5, 32, 9, 4)
      .fill({ color: 0x6f994a, alpha: 1 })
      .stroke({ width: 1.2, color: 0x416028, alpha: 0.92 });

    const wingFlap = Math.abs(Math.sin(time * 2.1 + prop.swingAngle * 1.4)) * (0.18 + prop.pulseTime * 0.45);
    const cx = 17;
    const cy = -14;
    const wingSpan = 9 * (1 - wingFlap * 0.4);
    anim
      .poly([cx, cy, cx - wingSpan, cy - 6, cx - 3, cy + 3])
      .fill({ color: 0xd94b43, alpha: 0.98 })
      .poly([cx, cy, cx + wingSpan, cy - 6, cx + 3, cy + 3])
      .fill({ color: 0xe86458, alpha: 0.98 })
      .poly([cx, cy - 5, cx + 3.5, cy, cx, cy + 6, cx - 3.5, cy])
      .fill({ color: 0xf2c572, alpha: 0.96 });
  }

  private drawLargeKoiPondAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const speedBoost = 1 + prop.pulseTime * 1.5;

    // 1. Subtle shimmering caustic arcs beneath water surface
    const causticShift = Math.sin(time * 0.9) * 5;
    anim
      .ellipse(-18 + causticShift, -12, 24, 14)
      .stroke({ width: 1.2, color: 0x8be2d8, alpha: 0.18 })
      .ellipse(16 - causticShift, 11, 20, 11)
      .stroke({ width: 1.1, color: 0x8be2d8, alpha: 0.15 });

    // 2. Three gracefully swimming colorful koi fish (Kohaku, Yamabuki, Showa)
    const koiSpecs = [
      { rx: 42, ry: 26, speed: 0.44 * speedBoost, phase: 0.2, body: 0xfaf3eb, spot: 0xdc4a32, len: 18 },
      { rx: 32, ry: 20, speed: -0.38 * speedBoost, phase: 2.4, body: 0xf4be48, spot: 0x2d241f, len: 15.5 },
      { rx: 24, ry: 15, speed: 0.52 * speedBoost, phase: 4.5, body: 0xf0783c, spot: 0xfaf5ee, len: 13.5 },
    ];

    for (let i = 0; i < koiSpecs.length; i++) {
      const k = koiSpecs[i];
      const t = time * k.speed + k.phase;
      const kx = Math.cos(t) * k.rx;
      const ky = Math.sin(t * 2) * k.ry * 0.62;
      const dx = -Math.sin(t) * k.rx * k.speed;
      const dy = Math.cos(t * 2) * 2 * k.ry * 0.62 * k.speed;
      const a = Math.atan2(dy, dx);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const perpX = -sin;
      const perpY = cos;
      const wag = Math.sin(time * 8.5 + i * 2.1) * 2.6;

      const tailBaseX = kx - cos * (k.len * 0.42);
      const tailBaseY = ky - sin * (k.len * 0.42);
      const tailTipX = kx - cos * (k.len * 0.92) + perpX * wag;
      const tailTipY = ky - sin * (k.len * 0.92) + perpY * wag;
      anim
        .poly([
          tailBaseX,
          tailBaseY,
          tailTipX + perpX * 3.8,
          tailTipY + perpY * 3.8,
          tailTipX - perpX * 3.8,
          tailTipY - perpY * 3.8,
        ])
        .fill({ color: 0xf9f3ea, alpha: 0.8 });

      anim
        .circle(kx, ky, k.len * 0.27)
        .fill({ color: k.body, alpha: 0.95 })
        .circle(kx + cos * (k.len * 0.24), ky + sin * (k.len * 0.24), k.len * 0.24)
        .fill({ color: k.body, alpha: 0.95 })
        .circle(kx + cos * (k.len * 0.14), ky + sin * (k.len * 0.14), k.len * 0.16)
        .fill({ color: k.spot, alpha: 0.94 });
    }

    // 3. Ambient expanding water ripples across wide pond
    const u1 = ((time * 0.34) % 1 + 1) % 1;
    const u2 = ((time * 0.34 + 0.5) % 1 + 1) % 1;
    anim
      .ellipse(-20, 10, 8 + u1 * 24, 6 + u1 * 17)
      .stroke({ width: 1.2, color: 0xe6f8f5, alpha: (1 - u1) * 0.36 })
      .ellipse(18, -10, 6 + u2 * 20, 4.5 + u2 * 14)
      .stroke({ width: 1.1, color: 0xd6f4ef, alpha: (1 - u2) * 0.3 });

    // 4. Five floating lily pads & two pink lotus blossoms
    const pads = [
      { x: -38, y: -20, r: 12 },
      { x: -24, y: -26, r: 8.5 },
      { x: 34, y: 18, r: 12.5 },
      { x: 46, y: 6, r: 9 },
      { x: 24, y: -24, r: 10 },
    ];
    for (const pad of pads) {
      anim
        .circle(pad.x + 1.5, pad.y + 2, pad.r)
        .fill({ color: 0x0d2b27, alpha: 0.3 })
        .circle(pad.x, pad.y, pad.r)
        .fill({ color: 0x4d8e52, alpha: 0.95 })
        .circle(pad.x, pad.y, pad.r * 0.68)
        .stroke({ width: 0.9, color: 0x7bc280, alpha: 0.52 });
    }

    const lotuses = [
      { x: 34, y: 17, s: 1 },
      { x: -38, y: -20, s: 0.85 },
    ];
    for (const l of lotuses) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 0.1;
        anim
          .ellipse(l.x + Math.cos(a) * 4 * l.s, l.y + Math.sin(a) * 4 * l.s, 4.2 * l.s, 2.2 * l.s)
          .fill({ color: 0xf4a8bc, alpha: 0.96 });
      }
      anim.circle(l.x, l.y, 2.6 * l.s).fill({ color: 0xf5d061, alpha: 1 });
    }
  }

  private drawKoiBirdbathAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const speedBoost = 1 + prop.pulseTime * 1.6;
    const t = time * 0.58 * speedBoost;
    const kx = Math.cos(t) * 15;
    const ky = Math.sin(t * 2) * 8;
    anim.circle(kx, ky, 3.6).fill({ color: 0xf7efe4, alpha: 0.94 });
  }

  private drawCatnipPlanterAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const sway = Math.sin(time * 2.1) * 0.05 + prop.swingAngle * 0.16;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + sway * (i % 2 === 0 ? 1 : -0.8);
      const r = 14 + (i % 3) * 3.5;
      anim
        .circle(Math.cos(a) * r, Math.sin(a) * r, 6.2 + (i % 2) * 1.4)
        .fill({ color: i % 2 === 0 ? 0x5ca86b : 0x72be7e, alpha: 0.96 });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4 + sway * 1.2;
      for (let b = 0; b < 3; b++) {
        const dist = 7 + b * 4.8;
        anim
          .circle(Math.cos(a) * dist, Math.sin(a) * dist, 2.7 - b * 0.35)
          .fill({ color: b === 2 ? 0xb896e8 : 0x8e6bc2, alpha: 0.96 });
      }
    }
  }

  private drawButterflyStoneAnimated(
    anim: Graphics,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
  ): void {
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
        .roundRect(-1, -4.5 + bob, 2, 9, 1)
        .fill({ color: 0x2c231b, alpha: 0.95 });
    }
  }

  private drawWindChimeAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const sway = Math.sin(time * 1.8) * 2.2 + prop.swingAngle * 7.5;
    const bellX = sway * 0.35;
    const bellY = Math.abs(sway) * 0.12;
    anim
      .poly([bellX - 3, bellY + 6, bellX + 3, bellY + 6, bellX + sway * 1.1 + 4, bellY + 21, bellX + sway * 1.1 - 4, bellY + 21])
      .fill({ color: 0xf7efe0, alpha: 0.94 })
      .circle(bellX, bellY, 12.5)
      .fill({ color: 0xc96a4b, alpha: 1 })
      .circle(bellX, bellY, 3)
      .fill({ color: 0xe6be68, alpha: 1 });
  }

  private drawCatTreeAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const originX = -6;
    const originY = 4;
    const idleSwing = Math.sin(time * 2.1) * 3.8;
    const swingX = idleSwing + prop.swingAngle * 14;
    const swingY = Math.cos(time * 1.6) * 2.2 + Math.abs(prop.swingAngle) * 3.5;
    const pomX = originX - 11 + swingX;
    const pomY = originY + 15 + swingY;

    anim
      .moveTo(originX, originY)
      .quadraticCurveTo(originX - 5 + swingX * 0.45, originY + 8, pomX, pomY)
      .stroke({ width: 1.4, color: 0xebd9c4, alpha: 0.92, cap: 'round' })
      .circle(pomX, pomY, 6)
      .fill({ color: 0xe87b64, alpha: 0.98 });
  }

  private drawTreatJarAnimated(anim: Graphics, prop: InteractivePropRuntime): void {
    const popOffset = Math.sin(prop.pulseTime * Math.PI) * 5.5;
    const lidX = -14 - popOffset * 0.45;
    const lidY = -popOffset * 0.75;
    anim
      .circle(lidX, lidY, 11.2)
      .fill({ color: 0xc99660, alpha: 1 })
      .stroke({ width: 1.2, color: 0x845b32, alpha: 0.9 })
      .circle(lidX, lidY + 1.6, 2.7)
      .fill({ color: 0x6b4523, alpha: 0.8 });
  }

  private drawLatteSaucerAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const angle = Math.sin(time * 0.8) * 0.08 + prop.pulseTime * 2.2;
    const cx = -11;
    const cy = -7;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const l1x = cx + (-1.7 * cos + 1.1 * sin);
    const l1y = cy + (-1.7 * sin - 1.1 * cos);
    const l2x = cx + (1.7 * cos + 1.1 * sin);
    const l2y = cy + (1.7 * sin - 1.1 * cos);
    const tipX = cx - 3.3 * sin;
    const tipY = cy + 3.3 * cos;

    anim
      .circle(l1x, l1y, 2.2)
      .circle(l2x, l2y, 2.2)
      .poly([l1x - 1.6, l1y + 0.8, l2x + 1.6, l2y + 0.8, tipX, tipY])
      .fill({ color: 0xfaf2e8, alpha: 0.95 });
  }

  private drawWaterFountainAnimated(anim: Graphics, time: number): void {
    const u = ((time * 1.4) % 1 + 1) % 1;
    // Animated arcing water jet from fountain spout into basin
    anim
      .moveTo(0, -5)
      .quadraticCurveTo(4, -2, 6, 8)
      .stroke({ width: 2.4, color: 0xdff8ff, alpha: 0.86, cap: 'round' })
      .circle(6, 9, 3 + u * 10)
      .stroke({ width: 1.1, color: 0xffffff, alpha: (1 - u) * 0.55 });
  }

  private drawWaterShimmerAnimated(anim: Graphics, time: number, maxR: number): void {
    const u = ((time * 0.6) % 1 + 1) % 1;
    anim
      .circle(0, 0, 2 + u * maxR)
      .stroke({ width: 1.1, color: 0xffffff, alpha: (1 - u) * 0.45 });
  }

  private drawFireplaceAnimated(
    anim: Graphics,
    glow: Graphics | null,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { warmGlowColor: number; warmCoreColor: number },
  ): void {
    const flicker = 0.88 + Math.sin(time * 9.5) * 0.12 + Math.cos(time * 15) * 0.06;
    anim
      .ellipse(0, 1, 22 * flicker, 11 * flicker)
      .fill({ color: 0xff6e2b, alpha: 0.78 })
      .ellipse(-4, 0, 13 * flicker, 7 * flicker)
      .fill({ color: 0xffb84d, alpha: 0.92 })
      .ellipse(2, 0, 7 * flicker, 4 * flicker)
      .fill({ color: 0xfff0b2, alpha: 0.95 });

    if (glow) {
      glow.clear();
      const modeAlpha = lighting === 'night' ? 0.48 : lighting === 'golden' ? 0.32 : 0.18;
      const mult = prop.activeBlend * modeAlpha * flicker;
      glow
        .circle(0, 6, 112 * flicker)
        .fill({ color: palette.warmGlowColor, alpha: mult * 0.52 })
        .circle(0, 4, 52 * flicker)
        .fill({ color: palette.warmCoreColor, alpha: mult });
    }
  }

  private drawDeskCandleAnimated(
    anim: Graphics,
    glow: Graphics | null,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { warmGlowColor: number; warmCoreColor: number },
  ): void {
    const lit = prop.activeBlend;
    const sway = Math.sin(time * 7.2) * 1.4;
    if (lit > 0.05) {
      anim
        .ellipse(sway * 0.5, -1, 4.5, 6.2)
        .fill({ color: 0xffad42, alpha: lit * 0.9 })
        .circle(sway * 0.3, 0, 2.4)
        .fill({ color: 0xfff8d6, alpha: lit });
    } else {
      anim.circle(0, 0, 1.5).fill({ color: 0x3b332d, alpha: 0.9 });
    }

    if (glow) {
      glow.clear();
      if (lit > 0.01) {
        const modeAlpha = lighting === 'night' ? 0.42 : 0.24;
        glow
          .circle(0, 0, 76)
          .fill({ color: palette.warmGlowColor, alpha: lit * modeAlpha * 0.55 })
          .circle(0, 0, 32)
          .fill({ color: palette.warmCoreColor, alpha: lit * modeAlpha });
      }
    }
  }

  private drawStringLightsAnimated(
    anim: Graphics,
    glow: Graphics | null,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { warmGlowColor: number; warmCoreColor: number },
  ): void {
    const lit = prop.activeBlend;
    const bulbs = [-20, -10, 0, 10, 20];
    for (let i = 0; i < bulbs.length; i++) {
      const bx = bulbs[i];
      const by = Math.sin(((i + 1) / 6) * Math.PI) * 5 - 3;
      const tw = 0.8 + Math.sin(time * 2.5 + i * 1.4) * 0.2;
      anim
        .circle(bx, by, 3.6)
        .fill({ color: lit > 0.2 ? 0xffd778 : 0xc6c0b4, alpha: 0.4 + lit * 0.6 * tw });
    }

    if (glow) {
      glow.clear();
      if (lit > 0.02) {
        const modeAlpha = lighting === 'night' ? 0.46 : 0.25;
        glow.circle(0, 0, 96).fill({ color: palette.warmGlowColor, alpha: lit * modeAlpha * 0.45 });
      }
    }
  }

  private drawRainyWindowAnimated(anim: Graphics, time: number): void {
    for (let i = 0; i < 12; i++) {
      const rx = -70 + ((i * 29) % 140);
      const u = (((time * (0.45 + (i % 3) * 0.16) + i * 0.27) % 1) + 1) % 1;
      const ry = -18 + u * 34;
      anim
        .moveTo(rx, ry - 4)
        .lineTo(rx - 1, ry + 3)
        .stroke({ width: 1.4, color: 0xe6f4ff, alpha: 0.72, cap: 'round' })
        .circle(rx - 1, ry + 3, 1.5)
        .fill({ color: 0xffffff, alpha: 0.85 });
    }
  }

  private drawSnowyWindowAnimated(anim: Graphics, time: number): void {
    for (let i = 0; i < 10; i++) {
      const sx = -68 + ((i * 33) % 136) + Math.sin(time * 1.4 + i) * 4;
      const u = (((time * 0.28 + i * 0.31) % 1) + 1) % 1;
      const sy = -18 + u * 34;
      anim.circle(sx, sy, 1.9).fill({ color: 0xffffff, alpha: 0.86 });
    }
  }

  private drawBokehLightsAnimated(anim: Graphics, time: number): void {
    const bokehColors = [0xffc668, 0xf48c74, 0x86c8f6, 0xffe49c];
    for (let i = 0; i < 7; i++) {
      const bx = -64 + i * 21;
      const by = -12 + (i % 2) * 8;
      const pulse = 0.55 + Math.sin(time * 1.8 + i * 1.1) * 0.35;
      anim
        .circle(bx, by, 5.5)
        .fill({ color: bokehColors[i % bokehColors.length], alpha: 0.28 * pulse })
        .circle(bx, by, 2.3)
        .fill({ color: bokehColors[i % bokehColors.length], alpha: 0.7 * pulse });
    }
  }

  private drawBlanketLumpAnimated(anim: Graphics, prop: InteractivePropRuntime, time: number): void {
    const breathe = 1 + Math.sin(time * 2.1) * 0.045 + Math.sin(prop.swingAngle * 2) * 0.08;
    const wiggleX = prop.swingAngle * 6;
    anim
      .ellipse(wiggleX, 0, 22 * breathe, 14 * breathe)
      .fill({ color: 0xe8cbc4, alpha: 0.96 })
      .stroke({ width: 1.2, color: 0xb68a82, alpha: 0.65 });
  }

  private drawDriftingSunbeamAnimated(
    anim: Graphics,
    glow: Graphics | null,
    time: number,
    lighting: EffectiveLightingMode,
    palette: { warmGlowColor: number; warmCoreColor: number },
  ): void {
    const nightDim = lighting === 'night' ? 0.36 : 1;
    const breathe = 1 + Math.sin(time * 1.3) * 0.035;
    anim
      .ellipse(0, 0, 68 * breathe, 50 * breathe)
      .fill({ color: 0xffe69c, alpha: 0.24 * nightDim })
      .ellipse(-6, -4, 46 * breathe, 32 * breathe)
      .fill({ color: 0xfff4c6, alpha: 0.32 * nightDim });

    if (glow) {
      glow.clear();
      glow
        .circle(0, 0, 108 * breathe)
        .fill({ color: palette.warmGlowColor, alpha: 0.26 * nightDim })
        .circle(0, 0, 56 * breathe)
        .fill({ color: palette.warmCoreColor, alpha: 0.34 * nightDim });
    }
  }

  private drawAquariumAnimated(
    anim: Graphics,
    glow: Graphics | null,
    prop: InteractivePropRuntime,
    time: number,
    lighting: EffectiveLightingMode,
  ): void {
    const boost = 1 + prop.pulseTime * 1.4;
    const fishSpecs = [
      { ax: 32, ay: 10, spd: 0.72 * boost, ph: 0.3, color: 0xff7b47, stripe: 0xffffff, size: 5.2 },
      { ax: 26, ay: 12, spd: -0.65 * boost, ph: 2.1, color: 0x4de6ff, stripe: 0xff4c5b, size: 4.0 },
      { ax: 20, ay: 8, spd: 0.88 * boost, ph: 3.9, color: 0xf6d458, stripe: 0x262626, size: 4.6 },
      { ax: 36, ay: 7, spd: -0.54 * boost, ph: 5.2, color: 0x5c9eff, stripe: 0xffe66b, size: 4.4 },
    ];

    for (const f of fishSpecs) {
      const t = time * f.spd + f.ph;
      const fx = Math.sin(t) * f.ax;
      const fy = Math.cos(t * 1.6) * f.ay;
      const dir = Math.cos(t) * f.spd >= 0 ? 1 : -1;
      anim
        .ellipse(fx, fy, f.size, f.size * 0.62)
        .fill({ color: f.color, alpha: 0.96 })
        .circle(fx + dir * 0.6, fy, f.size * 0.34)
        .fill({ color: f.stripe, alpha: 0.9 })
        .poly([fx - dir * f.size * 0.8, fy, fx - dir * f.size * 1.5, fy - 2.6, fx - dir * f.size * 1.5, fy + 2.6])
        .fill({ color: f.color, alpha: 0.9 });
    }

    // Rising tiny air bubbles
    for (let b = 0; b < 4; b++) {
      const u = (((time * 0.8 + b * 0.25) % 1) + 1) % 1;
      anim.circle(-36 + b * 4, 14 - u * 30, 1.5).fill({ color: 0xdffbff, alpha: (1 - u) * 0.75 });
    }

    if (glow) {
      glow.clear();
      const modeAlpha = lighting === 'night' ? 0.44 : 0.22;
      glow.ellipse(0, 0, 108, 72).fill({ color: 0x6cd8e8, alpha: modeAlpha });
    }
  }

  // ============================================================================
  // Dynamic Dropped Treats, Critters & Click Effects Renderers
  // ============================================================================

  private drawTreatGraphic(gfx: Graphics, treat: DroppedTreat, time: number): void {
    gfx.clear();
    gfx.position.set(treat.x, treat.y);

    const pulse = 0.5 + 0.5 * Math.sin(time * 3.4 + treat.spawnedAt * 2);
    gfx
      .circle(0, 0, 14 + pulse * 3)
      .stroke({ width: 1.1, color: 0xf6ce82, alpha: 0.24 + pulse * 0.16 });

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

      gfx.ellipse(ox + 1, oy + 2, 4.8, 3).fill({ color: 0x26160c, alpha: 0.26 });
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
        .fill({ color: 0xc97b3a, alpha: 0.98 });
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
    } else if (critter.kind === 'bird') {
      const flap = 0.55 + Math.abs(Math.sin(time * 10 + critter.phase)) * 0.45;
      gfx.rotation = Math.atan2(critter.vy, critter.vx);
      gfx.scale.set(1);
      gfx
        // Tail feathers & rounded body
        .poly([-6, 0, -12, -3.2, -12, 3.2])
        .fill({ color: critter.colorA, alpha: 0.92 })
        .ellipse(-1, -6 * flap, 5.2, 2.8)
        .ellipse(-1, 6 * flap, 5.2, 2.8)
        .fill({ color: critter.colorA, alpha: 0.94 })
        .ellipse(0, 0, 6.2, 4.4)
        .fill({ color: critter.colorA, alpha: 1 })
        .circle(3.8, 0, 3.2)
        .fill({ color: critter.colorB, alpha: 0.95 })
        .poly([6.5, -1.4, 10, 0, 6.5, 1.4])
        .fill({ color: 0xf2b548, alpha: 1 });
    } else if (critter.kind === 'moth') {
      const flap = 0.48 + Math.abs(Math.sin(time * 14 + critter.phase)) * 0.52;
      gfx.rotation = Math.atan2(critter.vy, critter.vx);
      gfx.scale.set(1, flap);
      gfx
        .ellipse(-2, -5.2, 5.4, 3.8)
        .ellipse(-2, 5.2, 5.4, 3.8)
        .fill({ color: critter.colorA, alpha: 0.94 })
        .roundRect(-4.5, -1.1, 9, 2.2, 1)
        .fill({ color: critter.colorB, alpha: 0.95 });
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
