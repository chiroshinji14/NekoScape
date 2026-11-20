import { Container, Graphics } from 'pixi.js';
import type { AabbRect, SceneTheme, Vec2 } from '../types/simulation';

export const BOX_WIDTH = 92;
export const BOX_HEIGHT = 76;
export const BOX_WALL_THICKNESS = 6;
export const BOX_WALL_HEIGHT = 26;
export const BOX_FLAP_MARGIN_X = 12;
export const BOX_FLAP_MARGIN_Y = 17;

interface BoxThemeStyle {
  outerBody: number;
  outerStroke: number;
  interiorPit: number;
  bevelDark: number;
  bevelMid: number;
  rimHighlight: number;
  flapTop: number;
  flapBottom: number;
  flapLeft: number;
  flapRight: number;
  tapeColor: number;
  accentColor: number;
}

const BOX_STYLES: Record<SceneTheme, BoxThemeStyle> = {
  study: {
    outerBody: 0xb88b58,
    outerStroke: 0x6b4a2b,
    interiorPit: 0x7c5732,
    bevelDark: 0x5c3e21,
    bevelMid: 0x674627,
    rimHighlight: 0xd0a776,
    flapTop: 0xc29562,
    flapBottom: 0xb1824f,
    flapLeft: 0xaa7b49,
    flapRight: 0xbe905c,
    tapeColor: 0xe6cda6,
    accentColor: 0xf4eee4,
  },
  tatami: {
    outerBody: 0xc49a68,
    outerStroke: 0x5a3b22,
    interiorPit: 0x825e38,
    bevelDark: 0x4f351d,
    bevelMid: 0x614326,
    rimHighlight: 0xdcb686,
    flapTop: 0xcaa06d,
    flapBottom: 0xb88e5c,
    flapLeft: 0xb18756,
    flapRight: 0xc59a67,
    tapeColor: 0xb54438,
    accentColor: 0x5e8c49,
  },
  garden: {
    outerBody: 0x8e6f52,
    outerStroke: 0x473423,
    interiorPit: 0x634b34,
    bevelDark: 0x3e2d1e,
    bevelMid: 0x4d3927,
    rimHighlight: 0xa88a6c,
    flapTop: 0x947557,
    flapBottom: 0x836549,
    flapLeft: 0x7c5f44,
    flapRight: 0x8f7053,
    tapeColor: 0x60824e,
    accentColor: 0xd9bc76,
  },
  cafe: {
    outerBody: 0xe5d5c1,
    outerStroke: 0x8c6449,
    interiorPit: 0xb89476,
    bevelDark: 0x7d5a42,
    bevelMid: 0x916b50,
    rimHighlight: 0xf5ece0,
    flapTop: 0xeadbc8,
    flapBottom: 0xd9c7b1,
    flapLeft: 0xd2bfa8,
    flapRight: 0xe3d2be,
    tapeColor: 0xc8674f,
    accentColor: 0xd99b4a,
  },
};

interface FlapSpringState {
  flex: number;
  vel: number;
}

/**
 * Top-down scene-themed cardboard box prop split into baseContainer (under grounded cats)
 * and flapsContainer (overlapping cats curled inside IN_BOX while airborne jumping cats
 * rise into elevatedCatsLayer cleanly OVER the flaps and walls).
 */
export class CardboardBox {
  static readonly WALL_HEIGHT = BOX_WALL_HEIGHT;

  readonly baseContainer: Container;
  readonly flapsContainer: Container;

  occupantId: number | null = null;

  private posX: number;
  private posY: number;
  private visible = true;
  private theme: SceneTheme = 'study';

  private readonly baseGfx: Graphics;
  private readonly rimGfx: Graphics;
  private readonly topFlapGfx: Graphics;
  private readonly bottomFlapGfx: Graphics;
  private readonly leftFlapGfx: Graphics;
  private readonly rightFlapGfx: Graphics;

  // Spring-damped flap rustle & subtle recoil on jump-in / jump-out / click
  private readonly flapSprings: Record<'top' | 'bottom' | 'left' | 'right', FlapSpringState> = {
    top: { flex: 0, vel: 0 },
    bottom: { flex: 0, vel: 0 },
    left: { flex: 0, vel: 0 },
    right: { flex: 0, vel: 0 },
  };
  private recoilX = 0;
  private recoilY = 0;
  private recoilVx = 0;
  private recoilVy = 0;
  private trembleTimer = 0;
  private tremblePhase = 0;
  private lastStepMs = -1;

  constructor(x = 320, y = 260, theme: SceneTheme = 'study') {
    this.posX = x;
    this.posY = y;
    this.theme = theme;

    this.baseContainer = new Container();
    this.baseContainer.eventMode = 'none';
    this.baseContainer.interactiveChildren = false;

    this.flapsContainer = new Container();
    this.flapsContainer.eventMode = 'none';
    this.flapsContainer.interactiveChildren = false;

    this.baseGfx = new Graphics();
    this.baseContainer.addChild(this.baseGfx);

    const hw = BOX_WIDTH * 0.5;
    const hh = BOX_HEIGHT * 0.5;

    this.topFlapGfx = new Graphics();
    this.topFlapGfx.position.set(0, -hh);

    this.bottomFlapGfx = new Graphics();
    this.bottomFlapGfx.position.set(0, hh);

    this.leftFlapGfx = new Graphics();
    this.leftFlapGfx.position.set(-hw, 0);

    this.rightFlapGfx = new Graphics();
    this.rightFlapGfx.position.set(hw, 0);

    this.rimGfx = new Graphics();

    this.flapsContainer.addChild(
      this.leftFlapGfx,
      this.rightFlapGfx,
      this.topFlapGfx,
      this.bottomFlapGfx,
      this.rimGfx,
    );

    this.drawBox();
    this.setPosition(x, y);
  }

  public setTheme(theme: SceneTheme): void {
    if (this.theme === theme) {
      return;
    }
    this.theme = theme;
    this.drawBox();
  }

  private drawBox(): void {
    const hw = BOX_WIDTH * 0.5;
    const hh = BOX_HEIGHT * 0.5;
    const iw = hw - BOX_WALL_THICKNESS;
    const ih = hh - BOX_WALL_THICKNESS;
    const s = BOX_STYLES[this.theme];

    // 1. Base & shaded interior (under cats)
    this.baseGfx.clear();

    // Soft contact shadow on floor
    this.baseGfx
      .roundRect(-hw + 4, -hh + 7, BOX_WIDTH, BOX_HEIGHT, 6)
      .fill({ color: 0x22140b, alpha: 0.24 })
      .roundRect(-hw + 2, -hh + 4, BOX_WIDTH, BOX_HEIGHT, 5)
      .fill({ color: 0x2b190d, alpha: 0.18 });

    // Outer body
    this.baseGfx
      .roundRect(-hw, -hh, BOX_WIDTH, BOX_HEIGHT, 4)
      .fill({ color: s.outerBody, alpha: 1 })
      .stroke({ width: 1.2, color: s.outerStroke, alpha: 0.9 });

    // Shaded interior pit
    this.baseGfx
      .roundRect(-iw, -ih, iw * 2, ih * 2, 3)
      .fill({ color: s.interiorPit, alpha: 1 });

    // Subtle interior depth bevels (top-left shadow inside wall showing vertical depth)
    this.baseGfx
      .poly([-iw, -ih, iw, -ih, iw - 6, -ih + 8, -iw + 6, -ih + 8])
      .fill({ color: s.bevelDark, alpha: 0.68 })
      .poly([-iw, -ih, -iw + 6, -ih + 8, -iw + 6, ih - 5, -iw, ih])
      .fill({ color: s.bevelMid, alpha: 0.56 });

    // Bottom interior detail per theme
    if (this.theme === 'garden') {
      this.baseGfx
        .ellipse(0, 0, iw * 0.72, ih * 0.68)
        .fill({ color: s.accentColor, alpha: 0.35 })
        .circle(-iw + 8, -ih + 8, 5)
        .fill({ color: s.tapeColor, alpha: 0.55 });
    } else if (this.theme === 'tatami') {
      this.baseGfx
        .roundRect(-iw + 5, -ih + 5, (iw - 5) * 2, (ih - 5) * 2, 4)
        .fill({ color: s.tapeColor, alpha: 0.38 });
    } else {
      this.baseGfx
        .moveTo(-iw + 6, 0)
        .lineTo(iw - 6, 0)
        .stroke({ width: 1, color: s.bevelDark, alpha: 0.55 });
    }

    // Rim highlight along top/left box thickness
    this.baseGfx
      .roundRect(-hw + 1, -hh + 1, BOX_WIDTH - 2, BOX_HEIGHT - 2, 3)
      .stroke({ width: 1, color: s.rimHighlight, alpha: 0.48 });

    // 2. Individual hinged flaps (drawn in hinge-local coordinates for smooth spring flex)
    // Top open flap (hinged at y = -hh)
    this.topFlapGfx.clear();
    this.topFlapGfx
      .poly([-hw + 2, 0, hw - 2, 0, hw + 5, -BOX_FLAP_MARGIN_Y, -hw - 5, -BOX_FLAP_MARGIN_Y])
      .fill({ color: s.flapTop, alpha: 0.96 })
      .stroke({ width: 1.1, color: s.outerStroke, alpha: 0.85 });
    for (let x = -hw + 8; x <= hw - 8; x += 12) {
      this.topFlapGfx
        .moveTo(x, -2)
        .lineTo(x + 1, -14)
        .stroke({ width: 0.8, color: s.outerStroke, alpha: 0.25 });
    }
    if (this.theme === 'study') {
      this.topFlapGfx
        .roundRect(-14, -BOX_FLAP_MARGIN_Y, 28, 18, 1.5)
        .fill({ color: s.tapeColor, alpha: 0.44 })
        .roundRect(14, -14, 18, 10, 1.5)
        .fill({ color: s.accentColor, alpha: 0.85 });
    } else if (this.theme === 'tatami') {
      this.topFlapGfx
        .circle(0, -9, 5.2)
        .fill({ color: 0xe6883a, alpha: 0.9 })
        .ellipse(2, -14, 3, 1.6)
        .fill({ color: s.accentColor, alpha: 0.9 });
    } else if (this.theme === 'garden') {
      this.topFlapGfx
        .circle(-hw + 8, -4, 5)
        .circle(-hw + 14, -2, 3.8)
        .fill({ color: s.tapeColor, alpha: 0.72 });
    } else {
      this.topFlapGfx
        .roundRect(-18, -11, 36, 4, 1.5)
        .fill({ color: s.tapeColor, alpha: 0.85 })
        .circle(0, -9, 4.5)
        .fill({ color: s.accentColor, alpha: 0.95 });
    }

    // Bottom open flap (hinged at y = +hh)
    this.bottomFlapGfx.clear();
    this.bottomFlapGfx
      .poly([-hw + 2, 0, hw - 2, 0, hw + 6, 16, -hw - 6, 16])
      .fill({ color: s.flapBottom, alpha: 0.96 })
      .stroke({ width: 1.1, color: s.outerStroke, alpha: 0.85 });
    for (let x = -hw + 8; x <= hw - 8; x += 12) {
      this.bottomFlapGfx
        .moveTo(x, 2)
        .lineTo(x - 1, 13)
        .stroke({ width: 0.8, color: s.outerStroke, alpha: 0.25 });
    }
    if (this.theme === 'garden') {
      this.bottomFlapGfx
        .circle(hw - 10, 4, 4.5)
        .fill({ color: s.tapeColor, alpha: 0.72 });
    }

    // Left shorter flap (hinged at x = -hw)
    this.leftFlapGfx.clear();
    this.leftFlapGfx
      .poly([0, -hh + 3, 0, hh - 3, -BOX_FLAP_MARGIN_X, hh - 7, -BOX_FLAP_MARGIN_X, -hh + 7])
      .fill({ color: s.flapLeft, alpha: 0.94 })
      .stroke({ width: 1, color: s.outerStroke, alpha: 0.82 });

    // Right shorter flap (hinged at x = +hw)
    this.rightFlapGfx.clear();
    this.rightFlapGfx
      .poly([0, -hh + 3, 0, hh - 3, 11, hh - 6, 11, -hh + 6])
      .fill({ color: s.flapRight, alpha: 0.94 })
      .stroke({ width: 1, color: s.outerStroke, alpha: 0.82 });

    // Crisp rim lip shadow on inner edge of flaps
    this.rimGfx.clear();
    this.rimGfx
      .moveTo(-hw + 2, -hh)
      .lineTo(hw - 2, -hh)
      .moveTo(-hw + 2, hh)
      .lineTo(hw - 2, hh)
      .moveTo(-hw, -hh + 3)
      .lineTo(-hw, hh - 3)
      .moveTo(hw, -hh + 3)
      .lineTo(hw, hh - 3)
      .stroke({ width: 1.4, color: s.bevelDark, alpha: 0.52 });
  }

  /**
   * Triggers a visible directional cardboard flap flex & subtle box recoil
   * when a cat launches out, leaps in, or the user taps the box.
   */
  triggerFlapRustle(directionRad?: number, intensity = 1): void {
    const power = Math.max(0.15, Math.min(1.6, intensity));
    if (directionRad !== undefined && Number.isFinite(directionRad)) {
      const cos = Math.cos(directionRad);
      const sin = Math.sin(directionRad);

      // Weight flaps aligned with jump trajectory more strongly
      this.flapSprings.right.vel += (3.2 + Math.max(0, cos) * 5.8) * power;
      this.flapSprings.left.vel += (3.2 + Math.max(0, -cos) * 5.8) * power;
      this.flapSprings.bottom.vel += (3.2 + Math.max(0, sin) * 5.8) * power;
      this.flapSprings.top.vel += (3.2 + Math.max(0, -sin) * 5.8) * power;

      // Subtle opposite recoil impulse on the cardboard box body
      this.recoilVx -= cos * 26 * power;
      this.recoilVy -= sin * 26 * power;
    } else {
      this.flapSprings.top.vel += 5.2 * power;
      this.flapSprings.bottom.vel += 5.2 * power;
      this.flapSprings.left.vel += 4.6 * power;
      this.flapSprings.right.vel += 4.6 * power;
    }
  }

  /**
   * Subtle anticipation tremor while a cat coils inside the box preparing to leap out.
   */
  triggerTremble(duration = 0.2): void {
    this.trembleTimer = Math.max(this.trembleTimer, duration);
  }

  /**
   * Steps flap spring oscillation and subtle recoil recovery.
   */
  update(dt: number): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    if (safeDt <= 0) return;

    this.lastStepMs = typeof performance !== 'undefined' ? performance.now() : this.lastStepMs + safeDt * 1000;

    const stiffness = 175;
    const damping = 10.5;

    for (const key of ['top', 'bottom', 'left', 'right'] as const) {
      const sp = this.flapSprings[key];
      const acc = -stiffness * sp.flex - damping * sp.vel;
      sp.vel += acc * safeDt;
      sp.flex += sp.vel * safeDt;
      if (Math.abs(sp.flex) < 0.001 && Math.abs(sp.vel) < 0.005) {
        sp.flex = 0;
        sp.vel = 0;
      } else {
        sp.flex = Math.max(-0.42, Math.min(0.65, sp.flex));
      }
    }

    // Recoil spring
    const rStiff = 210;
    const rDamp = 14;
    this.recoilVx += (-rStiff * this.recoilX - rDamp * this.recoilVx) * safeDt;
    this.recoilVy += (-rStiff * this.recoilY - rDamp * this.recoilVy) * safeDt;
    this.recoilX += this.recoilVx * safeDt;
    this.recoilY += this.recoilVy * safeDt;
    if (Math.hypot(this.recoilX, this.recoilY) < 0.02 && Math.hypot(this.recoilVx, this.recoilVy) < 0.1) {
      this.recoilX = 0;
      this.recoilY = 0;
      this.recoilVx = 0;
      this.recoilVy = 0;
    } else {
      this.recoilX = Math.max(-5, Math.min(5, this.recoilX));
      this.recoilY = Math.max(-5, Math.min(5, this.recoilY));
    }

    let trembleX = 0;
    let trembleY = 0;
    if (this.trembleTimer > 0) {
      this.trembleTimer = Math.max(0, this.trembleTimer - safeDt);
      this.tremblePhase += safeDt * 46;
      const amp = Math.min(1, this.trembleTimer / 0.16) * 1.35;
      trembleX = Math.sin(this.tremblePhase) * amp;
      trembleY = Math.cos(this.tremblePhase * 1.27) * amp * 0.7;
    }

    const renderX = this.posX + this.recoilX + trembleX;
    const renderY = this.posY + this.recoilY + trembleY;
    this.baseContainer.position.set(renderX, renderY);
    this.flapsContainer.position.set(renderX, renderY);

    // Apply hinge-anchored flex scale & gentle tilt to each cardboard flap
    this.topFlapGfx.scale.set(1 + this.flapSprings.top.flex * 0.08, 1 + this.flapSprings.top.flex * 0.42);
    this.topFlapGfx.rotation = this.flapSprings.top.flex * 0.06;

    this.bottomFlapGfx.scale.set(1 + this.flapSprings.bottom.flex * 0.08, 1 + this.flapSprings.bottom.flex * 0.42);
    this.bottomFlapGfx.rotation = -this.flapSprings.bottom.flex * 0.06;

    this.leftFlapGfx.scale.set(1 + this.flapSprings.left.flex * 0.44, 1 + this.flapSprings.left.flex * 0.08);
    this.leftFlapGfx.rotation = -this.flapSprings.left.flex * 0.07;

    this.rightFlapGfx.scale.set(1 + this.flapSprings.right.flex * 0.44, 1 + this.flapSprings.right.flex * 0.08);
    this.rightFlapGfx.rotation = this.flapSprings.right.flex * 0.07;
  }

  /**
   * Fallback tick used by CatEntity when host/main loop doesn't call box.update(dt) directly.
   */
  stepIfUnstepped(dt: number): void {
    const now = typeof performance !== 'undefined' ? performance.now() : this.lastStepMs + 16;
    if (this.lastStepMs < 0 || now - this.lastStepMs > 12) {
      this.update(dt);
    }
  }

  claim(catId: number): boolean {
    if (!this.visible) return false;
    if (this.occupantId !== null && this.occupantId !== catId) {
      return false;
    }
    this.occupantId = catId;
    return true;
  }

  release(catId: number): void {
    if (this.occupantId === catId) {
      this.occupantId = null;
    }
  }

  toggleVisible(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.baseContainer.visible = visible;
    this.flapsContainer.visible = visible;
    if (!visible) {
      this.occupantId = null;
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  setPosition(x: number, y: number): void {
    this.posX = x;
    this.posY = y;
    this.baseContainer.position.set(x + this.recoilX, y + this.recoilY);
    this.flapsContainer.position.set(x + this.recoilX, y + this.recoilY);
  }

  getPosition(): Vec2 {
    return { x: this.posX, y: this.posY };
  }

  getSize(): { width: number; height: number } {
    return { width: BOX_WIDTH, height: BOX_HEIGHT };
  }

  getWallHeight(): number {
    return BOX_WALL_HEIGHT;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.posX - BOX_WIDTH * 0.5,
      y: this.posY - BOX_HEIGHT * 0.5,
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
    };
  }

  getExteriorObstacle(): AabbRect {
    return {
      id: -999,
      x: this.posX - BOX_WIDTH * 0.5,
      y: this.posY - BOX_HEIGHT * 0.5,
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      label: 'Cardboard Box',
    };
  }

  /**
   * Outer footprint encompassing both walls and outward-angled flaps,
   * used to ensure jump-out landing spots always clear the flaps cleanly.
   */
  getOuterFootprintWithFlaps(): AabbRect {
    return {
      id: -999,
      x: this.posX - BOX_WIDTH * 0.5 - BOX_FLAP_MARGIN_X,
      y: this.posY - BOX_HEIGHT * 0.5 - BOX_FLAP_MARGIN_Y,
      width: BOX_WIDTH + BOX_FLAP_MARGIN_X * 2,
      height: BOX_HEIGHT + BOX_FLAP_MARGIN_Y * 2,
      label: 'Cardboard Box Flaps',
    };
  }

  /**
   * Computes exact distance from box center along `angleRad` required to land
   * completely outside the box walls + flaps + catRadius + clearance.
   */
  getMinExitDistanceForAngle(angleRad: number, catRadius: number, clearance = 16): number {
    const halfW = BOX_WIDTH * 0.5 + BOX_FLAP_MARGIN_X;
    const halfH = BOX_HEIGHT * 0.5 + BOX_FLAP_MARGIN_Y;
    const absCos = Math.max(1e-4, Math.abs(Math.cos(angleRad)));
    const absSin = Math.max(1e-4, Math.abs(Math.sin(angleRad)));
    const rayToEnvelope = Math.min(halfW / absCos, halfH / absSin);
    return rayToEnvelope + catRadius + clearance;
  }

  getRadius(): number {
    return Math.min(BOX_WIDTH, BOX_HEIGHT) * 0.42;
  }

  containsPoint(x: number, y: number): boolean {
    if (!this.visible) return false;
    return (
      Math.abs(x - this.posX) <= BOX_WIDTH * 0.5 + 8 &&
      Math.abs(y - this.posY) <= BOX_HEIGHT * 0.5 + 8
    );
  }

  destroy(): void {
    this.baseContainer.destroy({ children: true });
    this.flapsContainer.destroy({ children: true });
  }
}
