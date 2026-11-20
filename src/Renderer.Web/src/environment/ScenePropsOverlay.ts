import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { AabbRect, RugBounds, SceneTheme, Vec2 } from '../types/simulation';
import { createSeededRng, roundedRectPath } from './SceneThemes';

export interface SceneCuriositySpot {
  x: number;
  y: number;
  kind: 'watch' | 'nap' | 'sniff';
  label: string;
}

interface KoiFish {
  gfx: Graphics;
  baseAngle: number;
  speed: number;
  rx: number;
  ry: number;
  phase: number;
  bodyColor: number;
  spotColor: number;
  length: number;
}

interface SteamWisp {
  gfx: Graphics;
  originX: number;
  originY: number;
  phase: number;
  speed: number;
  driftX: number;
}

interface FloatingPetalOrButterfly {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  freq: number;
  kind: 'sakura' | 'butterfly';
  colorA: number;
  colorB: number;
}

interface RippleRing {
  gfx: Graphics;
  cx: number;
  cy: number;
  maxRadius: number;
  phase: number;
  speed: number;
}

/**
 * Renders abundant scene-specific top-down props, furniture, plants, water features,
 * food/drinks, and ambient living animations (swimming koi, rising steam, sakura petals,
 * fluttering butterflies, and warm night lantern halos) across all 4 scenes.
 */
export class ScenePropsOverlay {
  readonly underContainer: Container;
  readonly overContainer: Container;

  private readonly staticUnderSprite: Sprite;
  private readonly dynamicUnderLayer: Container;
  private readonly dynamicOverLayer: Container;
  private readonly nightGlowGraphics: Graphics;

  private cachedUnderTexture: Texture | null = null;
  private viewWidth: number;
  private viewHeight: number;
  private rugBounds: RugBounds;
  private theme: SceneTheme;
  private nightMode = false;
  private time = 0;

  private obstacles: AabbRect[] = [];
  private curiositySpots: SceneCuriositySpot[] = [];

  private pondCenter: Vec2 = { x: 0, y: 0 };
  private pondRadiusX = 96;
  private pondRadiusY = 78;
  private readonly koiList: KoiFish[] = [];
  private readonly ripples: RippleRing[] = [];
  private readonly steamWisps: SteamWisp[] = [];
  private readonly floaters: FloatingPetalOrButterfly[] = [];
  private danglingToyGfx: Graphics | null = null;
  private danglingToyOrigin: Vec2 = { x: 0, y: 0 };

  constructor(width: number, height: number, rugBounds: RugBounds, theme: SceneTheme = 'study') {
    this.viewWidth = Math.max(320, Math.round(width));
    this.viewHeight = Math.max(240, Math.round(height));
    this.rugBounds = { ...rugBounds };
    this.theme = theme;

    this.underContainer = new Container();
    this.underContainer.eventMode = 'none';
    this.underContainer.interactiveChildren = false;

    this.overContainer = new Container();
    this.overContainer.eventMode = 'none';
    this.overContainer.interactiveChildren = false;

    this.staticUnderSprite = new Sprite(Texture.EMPTY);
    this.dynamicUnderLayer = new Container();
    this.underContainer.addChild(this.staticUnderSprite, this.dynamicUnderLayer);

    this.nightGlowGraphics = new Graphics();
    this.dynamicOverLayer = new Container();
    this.overContainer.addChild(this.nightGlowGraphics, this.dynamicOverLayer);

    this.rebuildSceneProps();
  }

  public setTheme(theme: SceneTheme): void {
    if (this.theme === theme && this.cachedUnderTexture !== null) {
      return;
    }
    this.theme = theme;
    this.rebuildSceneProps();
  }

  public getTheme(): SceneTheme {
    return this.theme;
  }

  public setNightMode(night: boolean): void {
    if (this.nightMode === night) {
      return;
    }
    this.nightMode = night;
    this.nightGlowGraphics.visible = night;
  }

  public resize(width: number, height: number, rugBounds: RugBounds): void {
    const w = Math.max(320, Math.round(width));
    const h = Math.max(240, Math.round(height));
    this.viewWidth = w;
    this.viewHeight = h;
    this.rugBounds = { ...rugBounds };
    this.rebuildSceneProps();
  }

  public getObstacles(): readonly AabbRect[] {
    return this.obstacles;
  }

  public getCuriositySpots(): readonly SceneCuriositySpot[] {
    return this.curiositySpots;
  }

  public update(dt: number): void {
    const safeDt = Math.max(0, Math.min(dt, 0.05));
    this.time += safeDt;

    // 1. Animate swimming Koi fish in Garden pond
    for (let i = 0; i < this.koiList.length; i++) {
      const koi = this.koiList[i];
      const t = this.time * koi.speed + koi.phase;
      const lx = Math.cos(t) * koi.rx;
      const ly = Math.sin(t * 2) * koi.ry * 0.48;
      const dx = -Math.sin(t) * koi.rx * koi.speed;
      const dy = Math.cos(t * 2) * 2 * koi.ry * 0.48 * koi.speed;
      const heading = Math.atan2(dy, dx);

      koi.gfx.position.set(this.pondCenter.x + lx, this.pondCenter.y + ly);
      koi.gfx.rotation = heading;

      const tailWag = Math.sin(this.time * 8.5 + i * 2.1) * 3.2;
      this.drawAnimatedKoi(koi, tailWag);
    }

    // 2. Animate water ripples
    for (const r of this.ripples) {
      const u = ((this.time * r.speed + r.phase) % 1 + 1) % 1;
      const rad = 6 + u * r.maxRadius;
      const alpha = (1 - u) * (1 - u) * 0.34;
      r.gfx.clear();
      r.gfx
        .circle(r.cx, r.cy, rad)
        .stroke({ width: 1.2, color: 0xe8f7f3, alpha });
    }

    // 3. Animate rising steam wisps (Study mug, Tatami matcha, Cafe cappuccino)
    for (const w of this.steamWisps) {
      const u = ((this.time * w.speed + w.phase) % 1 + 1) % 1;
      const sway = Math.sin(u * Math.PI * 2 + w.phase * 4) * 4.5;
      w.gfx.position.set(w.originX + sway + u * w.driftX, w.originY - u * 18);
      const scale = 0.65 + u * 0.75;
      w.gfx.scale.set(scale);
      w.gfx.alpha = Math.sin(u * Math.PI) * 0.42;
    }

    // 4. Animate floating sakura petals (Tatami) or butterflies (Garden)
    for (const f of this.floaters) {
      f.x += f.vx * safeDt;
      f.y += f.vy * safeDt;

      if (f.x < -30) f.x = this.viewWidth + 25;
      if (f.x > this.viewWidth + 30) f.x = -25;
      if (f.y < -30) f.y = this.viewHeight + 25;
      if (f.y > this.viewHeight + 30) f.y = -25;

      const bob = Math.sin(this.time * f.freq + f.phase) * 7;
      f.gfx.position.set(f.x + bob, f.y + Math.cos(this.time * f.freq * 0.7 + f.phase) * 5);

      if (f.kind === 'butterfly') {
        const wingFlap = 0.45 + Math.abs(Math.sin(this.time * 11 + f.phase)) * 0.55;
        f.gfx.scale.set(1, wingFlap);
        f.gfx.rotation = Math.atan2(f.vy, f.vx) + Math.sin(this.time * 2.5 + f.phase) * 0.25;
      } else {
        f.gfx.rotation = this.time * 1.1 + f.phase;
      }
    }

    // 5. Animate dangling cat-tree feather pom-pom in Cafe
    if (this.danglingToyGfx) {
      const swingX = Math.sin(this.time * 2.4) * 5.5;
      const swingY = Math.cos(this.time * 1.7) * 3.5;
      this.danglingToyGfx.clear();
      this.danglingToyGfx
        .moveTo(this.danglingToyOrigin.x, this.danglingToyOrigin.y)
        .quadraticCurveTo(
          this.danglingToyOrigin.x + swingX * 0.5,
          this.danglingToyOrigin.y + 8,
          this.danglingToyOrigin.x + swingX,
          this.danglingToyOrigin.y + 16 + swingY,
        )
        .stroke({ width: 1.3, color: 0xe6d6c3, alpha: 0.9 })
        .circle(this.danglingToyOrigin.x + swingX, this.danglingToyOrigin.y + 17 + swingY, 5.5)
        .fill({ color: 0xe87a64, alpha: 0.96 })
        .circle(this.danglingToyOrigin.x + swingX - 1.5, this.danglingToyOrigin.y + 15.5 + swingY, 2)
        .fill({ color: 0xf9e5d8, alpha: 0.7 });
    }

    // 6. Subtle lantern pulse in Night mode
    if (this.nightMode) {
      this.nightGlowGraphics.alpha = 0.86 + Math.sin(this.time * 2.8) * 0.12;
    }
  }

  private drawAnimatedKoi(koi: KoiFish, tailWag: number): void {
    const len = koi.length;
    koi.gfx.clear();

    // Soft underwater shadow
    koi.gfx
      .ellipse(-1, 3, len * 0.52, len * 0.22)
      .fill({ color: 0x0b2421, alpha: 0.28 });

    // Caudal tail fin (wagging)
    koi.gfx
      .moveTo(-len * 0.42, 0)
      .quadraticCurveTo(-len * 0.65, tailWag - 5, -len * 0.85, tailWag - 6.5)
      .quadraticCurveTo(-len * 0.72, tailWag, -len * 0.85, tailWag + 6.5)
      .quadraticCurveTo(-len * 0.65, tailWag + 5, -len * 0.42, 0)
      .fill({ color: 0xf7efe4, alpha: 0.82 });

    // Pectoral side fins
    koi.gfx
      .ellipse(len * 0.1, -len * 0.26, 4.5, 2.2)
      .ellipse(len * 0.1, len * 0.26, 4.5, 2.2)
      .fill({ color: koi.bodyColor, alpha: 0.75 });

    // Torpedo koi body
    koi.gfx
      .ellipse(0, 0, len * 0.48, len * 0.22)
      .fill({ color: koi.bodyColor, alpha: 0.94 });

    // Koi markings
    koi.gfx
      .circle(len * 0.14, -1.2, len * 0.14)
      .circle(-len * 0.12, 1.4, len * 0.11)
      .fill({ color: koi.spotColor, alpha: 0.92 });

    // Tiny dark eyes at front of head
    koi.gfx
      .circle(len * 0.36, -2.1, 1.1)
      .circle(len * 0.36, 2.1, 1.1)
      .fill({ color: 0x1b1918, alpha: 0.9 });
  }

  private rebuildSceneProps(): void {
    this.obstacles = [];
    this.curiositySpots = [];
    this.koiList.length = 0;
    this.ripples.length = 0;
    this.steamWisps.length = 0;
    this.floaters.length = 0;
    this.danglingToyGfx = null;

    this.dynamicUnderLayer.removeChildren().forEach((c) => c.destroy());
    this.dynamicOverLayer.removeChildren().forEach((c) => c.destroy());
    this.nightGlowGraphics.clear();
    this.nightGlowGraphics.visible = this.nightMode;

    const w = this.viewWidth;
    const h = this.viewHeight;
    const rug = this.rugBounds;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.theme === 'study') {
      this.buildStudyProps(ctx, w, h, rug);
    } else if (this.theme === 'tatami') {
      this.buildTatamiProps(ctx, w, h, rug);
    } else if (this.theme === 'garden') {
      this.buildGardenProps(ctx, w, h, rug);
    } else {
      this.buildCafeProps(ctx, w, h, rug);
    }

    const nextTex = Texture.from(canvas, true);
    const oldTex = this.cachedUnderTexture;
    this.staticUnderSprite.texture = nextTex;
    this.cachedUnderTexture = nextTex;
    if (oldTex && oldTex !== Texture.EMPTY) {
      oldTex.destroy(true);
    }
  }

  private addSteamSource(x: number, y: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      const gfx = new Graphics();
      gfx
        .moveTo(0, 4)
        .quadraticCurveTo(-3, 0, 1, -4)
        .quadraticCurveTo(4, -8, -1, -12)
        .stroke({ width: 1.6, color: 0xf7EFE6, alpha: 0.8, cap: 'round' });
      this.dynamicOverLayer.addChild(gfx);
      this.steamWisps.push({
        gfx,
        originX: x,
        originY: y,
        phase: i / count,
        speed: 0.42 + i * 0.08,
        driftX: (i - 1) * 3.5,
      });
    }
  }

  private buildStudyProps(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    rug: RugBounds,
  ): void {
    const rng = createSeededRng(1042);

    // 1. Top-Right Lush Potted Monstera Plant in Ribbed Terracotta Planter
    const plantX = Math.min(w - 92, rug.x + rug.width + 78);
    const plantY = Math.max(82, rug.y - 16);
    this.drawMonsteraPlant(ctx, plantX, plantY, 44);
    this.obstacles.push({
      id: -201,
      x: plantX - 30,
      y: plantY - 30,
      width: 60,
      height: 60,
      label: 'Monstera Planter',
    });
    this.curiositySpots.push({ x: plantX - 38, y: plantY + 18, kind: 'sniff', label: 'Monstera' });

    // 2. Bottom-Left (near rug) Architect's Oak Side Table with Books, Sketchbook & Steaming Coffee
    const tableX = Math.max(255, rug.x - 54);
    const tableY = Math.min(h - 90, rug.y + rug.height - 24);
    this.drawStudySideTable(ctx, tableX, tableY);
    this.addSteamSource(tableX + 20, tableY - 12, 3);
    this.obstacles.push({
      id: -202,
      x: tableX - 46,
      y: tableY - 34,
      width: 92,
      height: 68,
      label: 'Study Side Table',
    });
    this.curiositySpots.push({ x: tableX + 52, y: tableY, kind: 'sniff', label: 'Espresso Mug' });

    // 3. Tufted Terracotta Velvet Round Cat Bed Cushion (top-left of rug corner)
    const bedX = rug.x + 68;
    const bedY = rug.y + 62;
    this.drawVelvetCatBed(ctx, bedX, bedY, 36, '#C46D53', '#EADAC7');
    this.curiositySpots.push({ x: bedX, y: bedY, kind: 'nap', label: 'Velvet Cat Bed' });

    // 4. Cork Feeding Mat with Kibble & Water Bowls (bottom-right near rug)
    const bowlX = Math.min(w - 118, rug.x + rug.width + 64);
    const bowlY = Math.min(h - 115, rug.y + rug.height - 46);
    this.drawFeedingStation(ctx, bowlX, bowlY, '#C69C72', '#4C6A78', '#D97A46');
    this.curiositySpots.push({ x: bowlX - 18, y: bowlY - 28, kind: 'sniff', label: 'Food Bowls' });

    // 5. Woven Rattan Blanket & Yarn Basket (top-left floor outside icon column)
    const basketX = Math.max(255, rug.x - 42);
    const basketY = Math.max(76, rug.y + 18);
    this.drawWovenYarnBasket(ctx, basketX, basketY, rng);
    this.obstacles.push({
      id: -203,
      x: basketX - 28,
      y: basketY - 28,
      width: 56,
      height: 56,
      label: 'Yarn Basket',
    });

    // 6. Brass Floor Lamp Base in Top Corner + Night Halo
    const lampX = Math.min(w - 64, rug.x + rug.width + 92);
    const lampY = Math.min(h - 210, rug.y + rug.height * 0.48);
    this.drawBrassFloorLamp(ctx, lampX, lampY);
    this.nightGlowGraphics
      .circle(lampX, lampY, 95)
      .fill({ color: 0xffb85c, alpha: 0.16 })
      .circle(lampX, lampY, 42)
      .fill({ color: 0xffe2a8, alpha: 0.28 });
  }

  private buildTatamiProps(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    rug: RugBounds,
  ): void {
    // 1. Rosewood Chabudai Low Tea Table with Tetsubin Teapot, Matcha Cups & Wagashi Treats
    const teaX = Math.min(w - 118, rug.x + rug.width + 68);
    const teaY = Math.max(108, rug.y + 44);
    this.drawChabudaiTeaTable(ctx, teaX, teaY);
    this.addSteamSource(teaX - 14, teaY + 10, 2);
    this.addSteamSource(teaX + 18, teaY - 12, 2);
    this.obstacles.push({
      id: -211,
      x: teaX - 48,
      y: teaY - 40,
      width: 96,
      height: 80,
      label: 'Chabudai Tea Table',
    });
    this.curiositySpots.push({ x: teaX - 58, y: teaY + 12, kind: 'sniff', label: 'Matcha Tea' });

    // 2. Sculpted Pine Bonsai in Glazed Cobalt Tray (top-left of tatami floor)
    const bonsaiX = Math.max(258, rug.x - 46);
    const bonsaiY = Math.max(88, rug.y + 14);
    this.drawPineBonsai(ctx, bonsaiX, bonsaiY);
    this.obstacles.push({
      id: -212,
      x: bonsaiX - 34,
      y: bonsaiY - 28,
      width: 68,
      height: 56,
      label: 'Pine Bonsai',
    });
    this.curiositySpots.push({ x: bonsaiX + 42, y: bonsaiY + 14, kind: 'sniff', label: 'Bonsai' });

    // 3. Two Silk Embroidered Zabuton Floor Cushions (for cat napping)
    const zabA = { x: rug.x + 70, y: rug.y + rug.height - 56 };
    const zabB = { x: rug.x + rug.width - 72, y: rug.y + 56 };
    this.drawZabutonCushion(ctx, zabA.x, zabA.y, '#334A5E', '#D8B26E');
    this.drawZabutonCushion(ctx, zabB.x, zabB.y, '#9E4238', '#E6C687');
    this.curiositySpots.push({ x: zabA.x, y: zabA.y, kind: 'nap', label: 'Indigo Zabuton' });
    this.curiositySpots.push({ x: zabB.x, y: zabB.y, kind: 'nap', label: 'Crimson Zabuton' });

    // 4. Shoji Cedar & Washi Paper Andon Floor Lantern (bottom-right)
    const andonX = Math.min(w - 94, rug.x + rug.width + 68);
    const andonY = Math.min(h - 108, rug.y + rug.height - 28);
    this.drawAndonLantern(ctx, andonX, andonY);
    this.obstacles.push({
      id: -213,
      x: andonX - 24,
      y: andonY - 24,
      width: 48,
      height: 48,
      label: 'Andon Lantern',
    });
    this.nightGlowGraphics
      .circle(andonX, andonY, 110)
      .fill({ color: 0xffaa4c, alpha: 0.22 })
      .circle(andonX, andonY, 46)
      .fill({ color: 0xffe4b5, alpha: 0.36 });

    // 5. Ikebana Sakura Branch Vase & Folded Origami Cranes (bottom-left)
    const ikeX = Math.max(258, rug.x - 48);
    const ikeY = Math.min(h - 96, rug.y + rug.height - 26);
    this.drawIkebanaSakuraAndOrigami(ctx, ikeX, ikeY);
    this.obstacles.push({
      id: -214,
      x: ikeX - 26,
      y: ikeY - 26,
      width: 52,
      height: 52,
      label: 'Ikebana Vase',
    });

    // 6. Animated Drifting Pink Sakura Petals
    for (let i = 0; i < 10; i++) {
      const petal = new Graphics();
      petal
        .moveTo(0, -3.5)
        .bezierCurveTo(3.5, -3.5, 4, 2, 0, 4)
        .bezierCurveTo(-4, 2, -3.5, -3.5, 0, -3.5)
        .fill({ color: i % 2 === 0 ? 0xf6c2cc : 0xfbe0e5, alpha: 0.86 });
      this.dynamicOverLayer.addChild(petal);
      this.floaters.push({
        gfx: petal,
        x: ((i * 197 + 90) % Math.max(300, w - 120)) + 60,
        y: ((i * 131 + 50) % Math.max(220, h - 80)) + 40,
        vx: -14 - (i % 4) * 4,
        vy: 9 + (i % 3) * 3.5,
        phase: i * 0.9,
        freq: 1.8 + (i % 3) * 0.4,
        kind: 'sakura',
        colorA: 0xf6c2cc,
        colorB: 0xfbe0e5,
      });
    }
  }

  private buildGardenProps(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    rug: RugBounds,
  ): void {
    // 1. Living Corner Koi Pond with Boulders, Lily Pads, Lotus & 3 Swimming Koi Fish
    this.pondCenter = {
      x: Math.min(w - 132, rug.x + rug.width + 72),
      y: Math.max(118, rug.y + 42),
    };
    this.pondRadiusX = 78;
    this.pondRadiusY = 64;
    this.drawKoiPondBasin(ctx, this.pondCenter.x, this.pondCenter.y, this.pondRadiusX, this.pondRadiusY);

    // Spawn 3 animated swimming koi inside dynamicUnderLayer (under lily pads / ripples)
    const koiSpecs: readonly { body: number; spot: number; rx: number; ry: number; speed: number; len: number }[] = [
      { body: 0xf4ece1, spot: 0xd94e34, rx: 38, ry: 32, speed: 0.55, len: 22 },
      { body: 0xe88935, spot: 0xfaf3e8, rx: 30, ry: 26, speed: -0.46, len: 19 },
      { body: 0xf2c249, spot: 0x2a2421, rx: 24, ry: 22, speed: 0.68, len: 17 },
    ];
    koiSpecs.forEach((spec, idx) => {
      const gfx = new Graphics();
      this.dynamicUnderLayer.addChild(gfx);
      this.koiList.push({
        gfx,
        baseAngle: idx * 2.1,
        speed: spec.speed,
        rx: spec.rx,
        ry: spec.ry,
        phase: idx * 1.9,
        bodyColor: spec.body,
        spotColor: spec.spot,
        length: spec.len,
      });
    });

    // Add lily pads & lotus flower on top of swimming koi in dynamicUnderLayer
    const padsGfx = new Graphics();
    this.drawLilyPadsAndLotus(padsGfx, this.pondCenter.x, this.pondCenter.y);
    this.dynamicUnderLayer.addChild(padsGfx);

    // Animated water ripples
    for (let i = 0; i < 2; i++) {
      const rGfx = new Graphics();
      this.dynamicUnderLayer.addChild(rGfx);
      this.ripples.push({
        gfx: rGfx,
        cx: this.pondCenter.x + (i === 0 ? -18 : 22),
        cy: this.pondCenter.y + (i === 0 ? 12 : -14),
        maxRadius: 24,
        phase: i * 0.5,
        speed: 0.36,
      });
    }

    this.obstacles.push({
      id: -221,
      x: this.pondCenter.x - this.pondRadiusX + 6,
      y: this.pondCenter.y - this.pondRadiusY + 6,
      width: (this.pondRadiusX - 6) * 2,
      height: (this.pondRadiusY - 6) * 2,
      label: 'Koi Pond',
    });
    this.curiositySpots.push({
      x: this.pondCenter.x - this.pondRadiusX - 18,
      y: this.pondCenter.y + 10,
      kind: 'watch',
      label: 'Koi Pond Edge',
    });

    // 2. Carved Granite Toro Stone Lantern (bottom-right)
    const lanternX = Math.min(w - 104, rug.x + rug.width + 64);
    const lanternY = Math.min(h - 108, rug.y + rug.height - 28);
    this.drawStoneToroLantern(ctx, lanternX, lanternY);
    this.obstacles.push({
      id: -222,
      x: lanternX - 28,
      y: lanternY - 28,
      width: 56,
      height: 56,
      label: 'Stone Lantern',
    });
    this.nightGlowGraphics
      .circle(lanternX, lanternY, 105)
      .fill({ color: 0xffb347, alpha: 0.24 })
      .circle(lanternX, lanternY, 38)
      .fill({ color: 0xffe6b3, alpha: 0.38 });

    // 3. Trio of Lavender, Marigold & Ivy Terracotta Planters (top-left near lawn)
    const potsX = Math.max(262, rug.x - 50);
    const potsY = Math.max(92, rug.y + 18);
    this.drawGardenFlowerPots(ctx, potsX, potsY);
    this.obstacles.push({
      id: -223,
      x: potsX - 34,
      y: potsY - 30,
      width: 68,
      height: 60,
      label: 'Flower Planters',
    });
    this.curiositySpots.push({ x: potsX + 42, y: potsY + 18, kind: 'sniff', label: 'Lavender Pots' });

    // 4. Woven Straw Sun Hat & Checkered Picnic Blanket Corner (on lawn corner for cat naps)
    const picnicX = rug.x + 76;
    const picnicY = rug.y + rug.height - 58;
    this.drawGardenPicnicMatAndHat(ctx, picnicX, picnicY);
    this.curiositySpots.push({ x: picnicX + 8, y: picnicY - 4, kind: 'nap', label: 'Picnic Blanket' });

    // 5. Vintage Copper-Green Watering Can & Stepping Pebbles (bottom-left)
    const canX = Math.max(260, rug.x - 46);
    const canY = Math.min(h - 98, rug.y + rug.height - 24);
    this.drawWateringCanAndTools(ctx, canX, canY);
    this.obstacles.push({
      id: -224,
      x: canX - 26,
      y: canY - 26,
      width: 52,
      height: 52,
      label: 'Watering Can',
    });

    // 6. Animated Fluttering Courtyard Butterflies
    const bColors = [
      { a: 0xf7c552, b: 0x2c241d },
      { a: 0x7bc8f6, b: 0xf4f9fc },
      { a: 0xf28d6b, b: 0xfff0d9 },
    ];
    bColors.forEach((col, i) => {
      const bGfx = new Graphics();
      bGfx
        .ellipse(-2, -4.5, 4.5, 3.2)
        .ellipse(-2, 4.5, 4.5, 3.2)
        .fill({ color: col.a, alpha: 0.92 })
        .ellipse(2.5, -3.2, 3.2, 2.2)
        .ellipse(2.5, 3.2, 3.2, 2.2)
        .fill({ color: col.b, alpha: 0.88 })
        .roundRect(-4, -0.8, 8, 1.6, 0.8)
        .fill({ color: 0x26201b, alpha: 0.95 });
      this.dynamicOverLayer.addChild(bGfx);
      this.floaters.push({
        gfx: bGfx,
        x: rug.x + 80 + i * 165,
        y: rug.y + 70 + (i % 2) * 140,
        vx: (i % 2 === 0 ? 1 : -1) * (18 + i * 4),
        vy: (i === 1 ? -1 : 1) * 12,
        phase: i * 1.7,
        freq: 2.3 + i * 0.35,
        kind: 'butterfly',
        colorA: col.a,
        colorB: col.b,
      });
    });
  }

  private buildCafeProps(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    rug: RugBounds,
  ): void {
    // 1. Round Carrara Marble Bistro Table with Latte Art Cappuccino & Croissant Plate (top-right)
    const bistroX = Math.min(w - 118, rug.x + rug.width + 68);
    const bistroY = Math.max(106, rug.y + 38);
    this.drawMarbleBistroTable(ctx, bistroX, bistroY);
    this.addSteamSource(bistroX - 14, bistroY - 10, 3);
    this.obstacles.push({
      id: -231,
      x: bistroX - 46,
      y: bistroY - 46,
      width: 92,
      height: 92,
      label: 'Marble Bistro Table',
    });
    this.curiositySpots.push({ x: bistroX - 58, y: bistroY + 8, kind: 'sniff', label: 'Croissant & Latte' });

    // 2. Multi-Tiered Sisal & Plush Cat Tree Tower with Dangling Feather Pom-Pom (bottom-right)
    const treeX = Math.min(w - 116, rug.x + rug.width + 66);
    const treeY = Math.min(h - 114, rug.y + rug.height - 32);
    this.drawCatTreeTower(ctx, treeX, treeY);
    this.danglingToyOrigin = { x: treeX - 24, y: treeY - 8 };
    this.danglingToyGfx = new Graphics();
    this.dynamicOverLayer.addChild(this.danglingToyGfx);
    this.curiositySpots.push({ x: treeX + 6, y: treeY - 6, kind: 'nap', label: 'Cat Tree Perch' });
    this.curiositySpots.push({ x: treeX - 42, y: treeY + 12, kind: 'watch', label: 'Cat Tree Pom-Pom' });

    // 3. Pair of Tufted Velvet Cafe Floor Poufs (Terracotta & Mustard-Ochre)
    const poufA = { x: rug.x + 68, y: rug.y + 58 };
    const poufB = { x: rug.x + rug.width - 70, y: rug.y + rug.height - 54 };
    this.drawVelvetCatBed(ctx, poufA.x, poufA.y, 32, '#C86D51', '#F0DFC8');
    this.drawVelvetCatBed(ctx, poufB.x, poufB.y, 30, '#D49B4B', '#F4E7D3');
    this.curiositySpots.push({ x: poufA.x, y: poufA.y, kind: 'nap', label: 'Terracotta Pouf' });
    this.curiositySpots.push({ x: poufB.x, y: poufB.y, kind: 'nap', label: 'Ochre Pouf' });

    // 4. Wooden A-Frame Cafe Menu Chalkboard & Potted Parlor Palm (top-left)
    const signX = Math.max(262, rug.x - 50);
    const signY = Math.max(92, rug.y + 20);
    this.drawCafeChalkboardAndPalm(ctx, signX, signY);
    this.obstacles.push({
      id: -232,
      x: signX - 34,
      y: signY - 30,
      width: 68,
      height: 60,
      label: 'Cafe Menu Board',
    });

    // 5. Terrazzo Feeding Station with Fish Biscuit Dish & Cat Milk Saucer (bottom-left)
    const feedX = Math.max(262, rug.x - 48);
    const feedY = Math.min(h - 98, rug.y + rug.height - 28);
    this.drawFeedingStation(ctx, feedX, feedY, '#E6D9C7', '#C8785A', '#F7F1E8');
    this.curiositySpots.push({ x: feedX + 26, y: feedY - 22, kind: 'sniff', label: 'Cat Milk & Treats' });

    // 6. Night mode warm bistro table & cat-tree pendant glows
    this.nightGlowGraphics
      .circle(bistroX, bistroY, 105)
      .fill({ color: 0xffb963, alpha: 0.2 })
      .circle(treeX, treeY, 90)
      .fill({ color: 0xffc478, alpha: 0.16 });
  }

  // ============================================================================
  // Handcrafted Top-Down Canvas2D Prop Renderers
  // ============================================================================

  private drawMonsteraPlant(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Soft floor shadow
    ctx.fillStyle = 'rgba(28, 17, 10, 0.25)';
    ctx.beginPath();
    ctx.arc(5, 8, radius * 0.78, 0, Math.PI * 2);
    ctx.fill();

    // Terracotta pot rim & soil
    ctx.fillStyle = '#B86245';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.46, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4B3323';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // 8 splayed monstera leaves with fenestration notches
    const leafColors = ['#3B6E47', '#4B8255', '#2F5C3A', '#599162'];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.22;
      const len = radius * (0.76 + (i % 3) * 0.14);
      ctx.save();
      ctx.rotate(angle);

      // Stem
      ctx.strokeStyle = '#2A4F33';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(len * 0.85, 0);
      ctx.stroke();

      // Heart-shaped leaf blade
      ctx.fillStyle = leafColors[i % leafColors.length];
      ctx.beginPath();
      ctx.ellipse(len * 0.62, 0, len * 0.38, len * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();

      // Center midrib highlight
      ctx.strokeStyle = 'rgba(182, 224, 175, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(len * 0.3, 0);
      ctx.lineTo(len * 0.9, 0);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }

  private drawStudySideTable(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Table shadow
    roundedRectPath(ctx, -44, -30, 92, 68, 12);
    ctx.fillStyle = 'rgba(26, 15, 9, 0.28)';
    ctx.fill();

    // Warm walnut rounded tabletop
    roundedRectPath(ctx, -46, -34, 92, 68, 12);
    ctx.fillStyle = '#734A2D';
    ctx.fill();
    ctx.strokeStyle = '#4A2E1B';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Inner bevel rim
    roundedRectPath(ctx, -42, -30, 84, 60, 9);
    ctx.strokeStyle = 'rgba(235, 196, 152, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Stack of 2 hardcover art books on left
    ctx.save();
    ctx.translate(-16, -4);
    ctx.rotate(-0.12);
    roundedRectPath(ctx, -18, -14, 34, 26, 3);
    ctx.fillStyle = '#385A6C';
    ctx.fill();
    roundedRectPath(ctx, -15, -11, 30, 22, 2.5);
    ctx.fillStyle = '#9E4739';
    ctx.fill();
    ctx.fillStyle = '#E8C574';
    ctx.fillRect(-11, -7, 22, 3);
    ctx.restore();

    // Open cream sketchbook & pencil in center
    ctx.save();
    ctx.translate(4, 10);
    ctx.rotate(0.08);
    roundedRectPath(ctx, -13, -10, 26, 18, 2);
    ctx.fillStyle = '#F3E9D8';
    ctx.fill();
    ctx.strokeStyle = '#C7B59B';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();

    // Ceramic Espresso Mug on cork coaster (top-right of table)
    ctx.fillStyle = '#B8895B';
    ctx.beginPath();
    ctx.arc(22, -12, 11, 0, Math.PI * 2);
    ctx.fill();

    // Mug handle
    ctx.strokeStyle = '#F4ECE1';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(30, -12, 4, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();

    // Mug body & dark crema coffee
    ctx.fillStyle = '#F4ECE1';
    ctx.beginPath();
    ctx.arc(22, -12, 8.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4A2B18';
    ctx.beginPath();
    ctx.arc(22, -12, 6.4, 0, Math.PI * 2);
    ctx.fill();

    // Latte crema swirl
    ctx.strokeStyle = '#DFB88B';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(22, -12, 3.2, 0.3, Math.PI * 1.4);
    ctx.stroke();

    ctx.restore();
  }

  private drawVelvetCatBed(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    outerColor: string,
    innerColor: string,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Contact shadow
    ctx.fillStyle = 'rgba(30, 18, 10, 0.24)';
    ctx.beginPath();
    ctx.arc(3, 5, radius + 2, 0, Math.PI * 2);
    ctx.fill();

    // Outer tufted bolster ring
    ctx.fillStyle = outerColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Radial tuft seam lines around bolster
    ctx.strokeStyle = 'rgba(42, 24, 15, 0.24)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62);
      ctx.lineTo(Math.cos(a) * radius * 0.98, Math.sin(a) * radius * 0.98);
      ctx.stroke();
    }

    // Plush inner cushion well
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.64, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120, 88, 64, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.64, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private drawFeedingStation(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    matColor: string,
    waterColor: string,
    kibbleColor: string,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Shadow & rounded feeding tray mat
    roundedRectPath(ctx, -34, -20, 72, 44, 14);
    ctx.fillStyle = 'rgba(28, 17, 10, 0.22)';
    ctx.fill();

    roundedRectPath(ctx, -36, -22, 72, 44, 14);
    ctx.fillStyle = matColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(82, 58, 38, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Left bowl: Ceramic Water Bowl
    ctx.fillStyle = '#F5EDE2';
    ctx.beginPath();
    ctx.arc(-15, 0, 12.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = waterColor;
    ctx.beginPath();
    ctx.arc(-15, 0, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-17, -2, 4.5, -0.8, 0.9);
    ctx.stroke();

    // Right bowl: Kibble / Biscuit Bowl
    ctx.fillStyle = '#F5EDE2';
    ctx.beginPath();
    ctx.arc(15, 0, 12.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5A3A25';
    ctx.beginPath();
    ctx.arc(15, 0, 9.5, 0, Math.PI * 2);
    ctx.fill();

    // Little kibble nuggets
    ctx.fillStyle = kibbleColor;
    const offsets = [
      [-3, -2],
      [2, -3],
      [-2, 3],
      [3, 2],
      [0, 0],
    ];
    for (const [ox, oy] of offsets) {
      ctx.beginPath();
      ctx.arc(15 + ox, oy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawWovenYarnBasket(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rng: () => number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = 'rgba(28, 17, 10, 0.25)';
    ctx.beginPath();
    ctx.arc(3, 5, 26, 0, Math.PI * 2);
    ctx.fill();

    // Rattan woven rim
    ctx.fillStyle = '#C99B68';
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7A5432';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dark basket interior
    ctx.fillStyle = '#5E4026';
    ctx.beginPath();
    ctx.arc(0, 0, 19.5, 0, Math.PI * 2);
    ctx.fill();

    // 3 colorful yarn skeins inside basket
    const skeins = [
      { x: -6, y: -5, r: 9.5, c: '#D45B4B' },
      { x: 7, y: -3, r: 8.5, c: '#E6A94E' },
      { x: 0, y: 7, r: 9, c: '#5B8C7A' },
    ];
    for (const s of skeins) {
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 245, 232, 0.32)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const a = rng() * Math.PI;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.7, a, a + 1.4);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawBrassFloorLamp(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = 'rgba(24, 14, 8, 0.26)';
    ctx.beginPath();
    ctx.arc(4, 6, 22, 0, Math.PI * 2);
    ctx.fill();

    // Warm pleated linen shade from above
    const grad = ctx.createRadialGradient(-2, -2, 3, 0, 0, 21);
    grad.addColorStop(0, '#FFF3D6');
    grad.addColorStop(0.65, '#E2B46D');
    grad.addColorStop(1, '#9E6E36');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();

    // Brass finial center cap
    ctx.fillStyle = '#B8863B';
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawChabudaiTeaTable(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Table drop shadow
    roundedRectPath(ctx, -45, -36, 94, 78, 14);
    ctx.fillStyle = 'rgba(22, 13, 8, 0.3)';
    ctx.fill();

    // Lacquered dark rosewood chabudai tabletop
    roundedRectPath(ctx, -48, -40, 96, 80, 14);
    ctx.fillStyle = '#4A251D';
    ctx.fill();
    ctx.strokeStyle = '#29130E';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner gold-lacquer hairline frame
    roundedRectPath(ctx, -42, -34, 84, 68, 10);
    ctx.strokeStyle = 'rgba(218, 173, 102, 0.38)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Cast-iron Tetsubin Teapot (top-left on bamboo trivet)
    ctx.fillStyle = '#A6895B';
    ctx.beginPath();
    ctx.arc(-16, -12, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2C2A29';
    ctx.beginPath();
    ctx.arc(-16, -12, 11.5, 0, Math.PI * 2);
    ctx.fill();

    // Teapot lid & brass knob + handle arch
    ctx.fillStyle = '#3D3937';
    ctx.beginPath();
    ctx.arc(-16, -12, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#D4A857';
    ctx.beginPath();
    ctx.arc(-16, -12, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Two Matcha Tea Cups (vivid jade matcha foam)
    const cups = [
      { x: -14, y: 14 },
      { x: 18, y: -10 },
    ];
    for (const c of cups) {
      ctx.fillStyle = '#D8CFC0';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6D9E54';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cedar dish with Sakura Mochi & Dango skewer (bottom-right)
    roundedRectPath(ctx, 4, 4, 28, 22, 4);
    ctx.fillStyle = '#C99B68';
    ctx.fill();
    ctx.fillStyle = '#F2BAC4';
    ctx.beginPath();
    ctx.arc(13, 15, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F7EFE4';
    ctx.beginPath();
    ctx.arc(21, 15, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#739B5B';
    ctx.beginPath();
    ctx.arc(27, 15, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawPineBonsai(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Shadow
    ctx.fillStyle = 'rgba(24, 15, 9, 0.26)';
    ctx.beginPath();
    ctx.ellipse(4, 7, 34, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glazed cobalt-slate ceramic bonsai tray
    roundedRectPath(ctx, -30, -20, 60, 40, 10);
    ctx.fillStyle = '#38576B';
    ctx.fill();
    ctx.strokeStyle = '#223847';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Mossy soil bed inside tray
    roundedRectPath(ctx, -25, -15, 50, 30, 7);
    ctx.fillStyle = '#587549';
    ctx.fill();

    // Gnarled driftwood trunk
    ctx.strokeStyle = '#6E492D';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.quadraticCurveTo(2, -4, 12, -8);
    ctx.stroke();

    // Cloud-pruned pine needle pads
    const pads = [
      { x: -12, y: -6, rx: 14, ry: 11, c: '#3B663E' },
      { x: 12, y: -10, rx: 16, ry: 12, c: '#497A4B' },
      { x: 4, y: 6, rx: 15, ry: 11, c: '#588B59' },
      { x: 0, y: -3, rx: 12, ry: 9, c: '#689E68' },
    ];
    for (const p of pads) {
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawZabutonCushion(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    fabricColor: string,
    tasselColor: string,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.08);

    roundedRectPath(ctx, -24, -22, 52, 48, 9);
    ctx.fillStyle = 'rgba(26, 16, 10, 0.22)';
    ctx.fill();

    roundedRectPath(ctx, -26, -24, 52, 48, 9);
    ctx.fillStyle = fabricColor;
    ctx.fill();
    ctx.strokeStyle = tasselColor;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Center tuft stitch X
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, 5);
    ctx.moveTo(5, -5);
    ctx.lineTo(-5, 5);
    ctx.stroke();

    ctx.restore();
  }

  private drawAndonLantern(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    roundedRectPath(ctx, -18, -18, 42, 42, 6);
    ctx.fillStyle = 'rgba(22, 13, 8, 0.28)';
    ctx.fill();

    // Dark cedar outer frame
    roundedRectPath(ctx, -21, -21, 42, 42, 6);
    ctx.fillStyle = '#2E1D14';
    ctx.fill();

    // Glowing warm washi paper core
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 17);
    grad.addColorStop(0, '#FFF5DC');
    grad.addColorStop(0.7, '#F5C478');
    grad.addColorStop(1, '#C98A42');
    roundedRectPath(ctx, -16, -16, 32, 32, 4);
    ctx.fillStyle = grad;
    ctx.fill();

    // Cedar cross ribs
    ctx.strokeStyle = '#2E1D14';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(0, -16);
    ctx.lineTo(0, 16);
    ctx.stroke();

    ctx.restore();
  }

  private drawIkebanaSakuraAndOrigami(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Bamboo mat coaster
    roundedRectPath(ctx, -26, -22, 52, 44, 8);
    ctx.fillStyle = '#9C7A52';
    ctx.fill();

    // Dark stoneware vase
    ctx.fillStyle = '#332E2C';
    ctx.beginPath();
    ctx.arc(-8, 0, 13, 0, Math.PI * 2);
    ctx.fill();

    // Sakura branch & blossoms
    ctx.strokeStyle = '#4F3324';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(14, -14);
    ctx.moveTo(2, -6);
    ctx.lineTo(16, 4);
    ctx.stroke();

    const blooms = [
      [-2, -8],
      [8, -12],
      [15, -14],
      [12, 2],
      [4, 5],
    ];
    for (const [bx, by] of blooms) {
      ctx.fillStyle = '#F4B8C4';
      ctx.beginPath();
      ctx.arc(bx, by, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#D95B72';
      ctx.beginPath();
      ctx.arc(bx, by, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawKoiPondBasin(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Outer stone shadow
    ctx.fillStyle = 'rgba(22, 18, 14, 0.3)';
    ctx.beginPath();
    ctx.ellipse(4, 6, rx + 8, ry + 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ring of river boulders around the pond perimeter
    const stoneColors = ['#7D756C', '#6B635B', '#8E857B', '#5E6B56'];
    const numStones = 18;
    for (let i = 0; i < numStones; i++) {
      const a = (i / numStones) * Math.PI * 2;
      const sx = Math.cos(a) * (rx - 4);
      const sy = Math.sin(a) * (ry - 4);
      ctx.fillStyle = stoneColors[i % stoneColors.length];
      ctx.beginPath();
      ctx.ellipse(sx, sy, 14 + (i % 3) * 3, 11 + (i % 2) * 3, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 35, 30, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Deep emerald-teal pond water gradient
    const waterGrad = ctx.createRadialGradient(-10, -8, 8, 0, 0, Math.max(rx, ry) * 0.88);
    waterGrad.addColorStop(0, '#3C7E76');
    waterGrad.addColorStop(0.6, '#275E58');
    waterGrad.addColorStop(1, '#193F3B');
    ctx.fillStyle = waterGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 10, ry - 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle submerged river pebbles
    ctx.fillStyle = 'rgba(180, 168, 148, 0.16)';
    for (let i = 0; i < 9; i++) {
      const px = ((i * 29) % 70) - 35;
      const py = ((i * 19) % 50) - 25;
      ctx.beginPath();
      ctx.arc(px, py, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawLilyPadsAndLotus(gfx: Graphics, cx: number, cy: number): void {
    const pads = [
      { x: cx - 28, y: cy - 16, r: 13 },
      { x: cx + 26, y: cy + 18, r: 14 },
      { x: cx - 12, y: cy + 24, r: 10 },
      { x: cx + 22, y: cy - 22, r: 11 },
    ];
    for (const p of pads) {
      gfx
        .circle(p.x + 1.5, p.y + 2, p.r)
        .fill({ color: 0x0d2825, alpha: 0.3 })
        .circle(p.x, p.y, p.r)
        .fill({ color: 0x4f8a54, alpha: 0.94 })
        .circle(p.x, p.y, p.r * 0.72)
        .stroke({ width: 0.9, color: 0x76b078, alpha: 0.55 });
    }

    // Blooming pink lotus on top-right lily pad
    const lx = cx + 26;
    const ly = cy + 16;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      gfx
        .ellipse(lx + Math.cos(a) * 4.2, ly + Math.sin(a) * 4.2, 4.5, 2.5)
        .fill({ color: 0xf4a8bc, alpha: 0.95 });
    }
    gfx.circle(lx, ly, 2.6).fill({ color: 0xf5d061, alpha: 0.98 });
  }

  private drawStoneToroLantern(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = 'rgba(20, 16, 12, 0.32)';
    ctx.beginPath();
    ctx.arc(4, 6, 27, 0, Math.PI * 2);
    ctx.fill();

    // Hexagonal carved granite roof
    ctx.fillStyle = '#857E75';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * 25;
      const y = Math.sin(a) * 25;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#57524B';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Warm candle glow peeking around stone chamber
    ctx.fillStyle = 'rgba(255, 204, 112, 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Moss patch on roof corner
    ctx.fillStyle = '#5B7D49';
    ctx.beginPath();
    ctx.arc(-9, -7, 7.5, 0, Math.PI * 2);
    ctx.arc(-4, -12, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Top stone finial
    ctx.fillStyle = '#A39B90';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawGardenFlowerPots(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    const pots = [
      { x: -14, y: -8, r: 16, pot: '#B86648', flower: '#8E6BB8', leaf: '#4D7C4D' }, // Lavender
      { x: 14, y: -4, r: 14, pot: '#C47756', flower: '#F0A83C', leaf: '#588752' },  // Marigold
      { x: 0, y: 14, r: 13, pot: '#9E553B', flower: '#E8685C', leaf: '#457045' },   // Geranium
    ];

    for (const p of pots) {
      ctx.fillStyle = 'rgba(25, 18, 12, 0.24)';
      ctx.beginPath();
      ctx.arc(p.x + 2, p.y + 4, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = p.pot;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = p.leaf;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.78, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = p.flower;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * p.r * 0.42, p.y + Math.sin(a) * p.r * 0.42, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawGardenPicnicMatAndHat(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.1);

    // Gingham picnic cloth corner
    roundedRectPath(ctx, -32, -26, 64, 52, 10);
    ctx.fillStyle = '#F3E7D3';
    ctx.fill();
    ctx.strokeStyle = '#C95B4C';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Woven straw sun hat
    ctx.fillStyle = 'rgba(28, 18, 10, 0.22)';
    ctx.beginPath();
    ctx.arc(-8, 4, 21, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E6C687';
    ctx.beginPath();
    ctx.arc(-10, 2, 20, 0, Math.PI * 2);
    ctx.fill();

    // Crimson ribbon band around straw hat crown
    ctx.strokeStyle = '#B8463A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-10, 2, 11, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#F2D69B';
    ctx.beginPath();
    ctx.arc(-10, 2, 9.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawWateringCanAndTools(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = 'rgba(22, 16, 11, 0.26)';
    ctx.beginPath();
    ctx.arc(3, 5, 19, 0, Math.PI * 2);
    ctx.fill();

    // Spout pointing top-right
    ctx.strokeStyle = '#537D6A';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.lineTo(22, -18);
    ctx.stroke();

    // Brass sprinkler rose tip
    ctx.fillStyle = '#D4A553';
    ctx.beginPath();
    ctx.arc(23, -19, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Can body
    ctx.fillStyle = '#628F7B';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Top handle arch
    ctx.strokeStyle = '#436958';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 6);
    ctx.lineTo(8, -6);
    ctx.stroke();

    ctx.restore();
  }

  private drawMarbleBistroTable(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Table floor shadow
    ctx.fillStyle = 'rgba(28, 18, 12, 0.28)';
    ctx.beginPath();
    ctx.arc(4, 7, 45, 0, Math.PI * 2);
    ctx.fill();

    // Carrara marble tabletop with brushed brass rim
    ctx.fillStyle = '#F4ECE1';
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B88946';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Subtle marble veining
    ctx.strokeStyle = 'rgba(160, 148, 136, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-28, -14);
    ctx.quadraticCurveTo(-4, -2, 22, -18);
    ctx.moveTo(-18, 18);
    ctx.quadraticCurveTo(6, 8, 28, 20);
    ctx.stroke();

    // 1. Cappuccino Cup on Saucer with Heart Latte Art (top-left)
    ctx.fillStyle = '#E5D8C8';
    ctx.beginPath();
    ctx.arc(-14, -10, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-14, -10, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8C5836';
    ctx.beginPath();
    ctx.arc(-14, -10, 7.6, 0, Math.PI * 2);
    ctx.fill();
    // Cream heart foam
    ctx.fillStyle = '#F9F1E6';
    ctx.beginPath();
    ctx.arc(-14, -10, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Pastry Plate with Golden Flaky Croissant & Strawberry Tart (bottom-right)
    ctx.fillStyle = '#E5D8C8';
    ctx.beginPath();
    ctx.arc(14, 12, 16, 0, Math.PI * 2);
    ctx.fill();

    // Crescent croissant
    ctx.strokeStyle = '#D4893B';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(13, 12, 7.5, -0.7, Math.PI * 0.9);
    ctx.stroke();

    // Berry tart accent
    ctx.fillStyle = '#D94B43';
    ctx.beginPath();
    ctx.arc(20, 7, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawCatTreeTower(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Base shadow
    roundedRectPath(ctx, -40, -36, 84, 76, 16);
    ctx.fillStyle = 'rgba(26, 16, 10, 0.28)';
    ctx.fill();

    // Bottom wooden base platform
    roundedRectPath(ctx, -42, -38, 84, 76, 16);
    ctx.fillStyle = '#C99F72';
    ctx.fill();
    ctx.strokeStyle = '#8C643E';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Lower sisal scratching post column (left)
    ctx.fillStyle = '#B0895E';
    ctx.beginPath();
    ctx.arc(-22, -8, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7A5936';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Upper plush sage circular lounge perch (right)
    ctx.fillStyle = 'rgba(22, 14, 8, 0.24)';
    ctx.beginPath();
    ctx.arc(9, -3, 27, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#738C75';
    ctx.beginPath();
    ctx.arc(6, -6, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E8DDD0';
    ctx.beginPath();
    ctx.arc(6, -6, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawCafeChalkboardAndPalm(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Potted parlor palm next to chalkboard
    this.drawMonsteraPlant(ctx, -14, 8, 28);

    // A-Frame wooden chalkboard sign from above
    ctx.save();
    ctx.translate(14, -8);
    ctx.rotate(0.22);
    roundedRectPath(ctx, -18, -12, 36, 24, 4);
    ctx.fillStyle = '#8C5B37';
    ctx.fill();
    roundedRectPath(ctx, -14, -9, 28, 18, 2);
    ctx.fillStyle = '#2B332E';
    ctx.fill();

    // Chalk lines on board
    ctx.strokeStyle = 'rgba(244, 236, 225, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(9, -3);
    ctx.moveTo(-7, 3);
    ctx.lineTo(6, 3);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  public destroy(): void {
    if (this.cachedUnderTexture && this.cachedUnderTexture !== Texture.EMPTY) {
      this.cachedUnderTexture.destroy(true);
      this.cachedUnderTexture = null;
    }
    this.underContainer.destroy({ children: true });
    this.overContainer.destroy({ children: true });
  }
}
