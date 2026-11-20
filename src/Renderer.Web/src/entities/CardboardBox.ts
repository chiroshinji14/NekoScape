import { Container, Graphics } from 'pixi.js';
import type { AabbRect, SceneTheme, Vec2 } from '../types/simulation';

const BOX_WIDTH = 92;
const BOX_HEIGHT = 76;
const WALL_THICKNESS = 6;

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

/**
 * Top-down scene-themed box prop split into baseContainer (under cats)
 * and flapsContainer (overlapping cat edges when a cat curls inside IN_BOX).
 */
export class CardboardBox {
  readonly baseContainer: Container;
  readonly flapsContainer: Container;

  occupantId: number | null = null;

  private posX: number;
  private posY: number;
  private visible = true;
  private theme: SceneTheme = 'study';

  private readonly baseGfx: Graphics;
  private readonly flapsGfx: Graphics;

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
    this.flapsGfx = new Graphics();

    this.baseContainer.addChild(this.baseGfx);
    this.flapsContainer.addChild(this.flapsGfx);

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
    const iw = hw - WALL_THICKNESS;
    const ih = hh - WALL_THICKNESS;
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

    // Subtle interior depth bevels (top-left shadow inside wall)
    this.baseGfx
      .poly([-iw, -ih, iw, -ih, iw - 5, -ih + 7, -iw + 5, -ih + 7])
      .fill({ color: s.bevelDark, alpha: 0.65 })
      .poly([-iw, -ih, -iw + 5, -ih + 7, -iw + 5, ih - 5, -iw, ih])
      .fill({ color: s.bevelMid, alpha: 0.55 });

    // Bottom interior detail per theme
    if (this.theme === 'garden') {
      // Cozy golden straw & moss lining inside garden crate
      this.baseGfx
        .ellipse(0, 0, iw * 0.72, ih * 0.68)
        .fill({ color: s.accentColor, alpha: 0.35 })
        .circle(-iw + 8, -ih + 8, 5)
        .fill({ color: s.tapeColor, alpha: 0.55 });
    } else if (this.theme === 'tatami') {
      // Crimson furoshiki cloth liner inside cedar mikan crate
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
      .stroke({ width: 1, color: s.rimHighlight, alpha: 0.45 });

    // 2. Angled flaps & themed accents (rendered above cats in boxFlaps layer)
    this.flapsGfx.clear();

    // Top open flap (angled outward)
    this.flapsGfx
      .poly([-hw + 2, -hh, hw - 2, -hh, hw + 5, -hh - 17, -hw - 5, -hh - 17])
      .fill({ color: s.flapTop, alpha: 0.96 })
      .stroke({ width: 1.1, color: s.outerStroke, alpha: 0.85 });

    // Bottom open flap
    this.flapsGfx
      .poly([-hw + 2, hh, hw - 2, hh, hw + 6, hh + 16, -hw - 6, hh + 16])
      .fill({ color: s.flapBottom, alpha: 0.96 })
      .stroke({ width: 1.1, color: s.outerStroke, alpha: 0.85 });

    // Left shorter inner flap
    this.flapsGfx
      .poly([-hw, -hh + 3, -hw, hh - 3, -hw - 12, hh - 7, -hw - 12, -hh + 7])
      .fill({ color: s.flapLeft, alpha: 0.94 })
      .stroke({ width: 1, color: s.outerStroke, alpha: 0.82 });

    // Right shorter flap
    this.flapsGfx
      .poly([hw, -hh + 3, hw, hh - 3, hw + 11, hh - 6, hw + 11, -hh + 6])
      .fill({ color: s.flapRight, alpha: 0.94 })
      .stroke({ width: 1, color: s.outerStroke, alpha: 0.82 });

    // Subtle flute/slat lines on top & bottom flaps
    for (let x = -hw + 8; x <= hw - 8; x += 12) {
      this.flapsGfx
        .moveTo(x, -hh - 2)
        .lineTo(x + 1, -hh - 14)
        .stroke({ width: 0.8, color: s.outerStroke, alpha: 0.25 })
        .moveTo(x, hh + 2)
        .lineTo(x - 1, hh + 13)
        .stroke({ width: 0.8, color: s.outerStroke, alpha: 0.25 });
    }

    // Theme badge / tape / sticker on top flap
    if (this.theme === 'study') {
      // Shipping parcel label & packing tape
      this.flapsGfx
        .roundRect(-14, -hh - 17, 28, 22, 1.5)
        .fill({ color: s.tapeColor, alpha: 0.44 })
        .roundRect(14, -hh - 14, 18, 10, 1.5)
        .fill({ color: s.accentColor, alpha: 0.85 });
    } else if (this.theme === 'tatami') {
      // Mikan tangerine stamp on cedar flap
      this.flapsGfx
        .circle(0, -hh - 9, 5.2)
        .fill({ color: 0xe6883a, alpha: 0.9 })
        .ellipse(2, -hh - 14, 3, 1.6)
        .fill({ color: s.accentColor, alpha: 0.9 });
    } else if (this.theme === 'garden') {
      // Moss tufts along planter crate corners
      this.flapsGfx
        .circle(-hw + 8, -hh - 4, 5)
        .circle(-hw + 14, -hh - 2, 3.8)
        .circle(hw - 10, hh + 4, 4.5)
        .fill({ color: s.tapeColor, alpha: 0.72 });
    } else {
      // Patisserie ribbon & gold bakery seal
      this.flapsGfx
        .roundRect(-18, -hh - 11, 36, 4, 1.5)
        .fill({ color: s.tapeColor, alpha: 0.85 })
        .circle(0, -hh - 9, 4.5)
        .fill({ color: s.accentColor, alpha: 0.95 });
    }

    // Crisp rim lip shadow on inner edge of flaps
    this.flapsGfx
      .moveTo(-hw + 2, -hh)
      .lineTo(hw - 2, -hh)
      .moveTo(-hw + 2, hh)
      .lineTo(hw - 2, hh)
      .stroke({ width: 1.4, color: s.bevelDark, alpha: 0.5 });
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
    this.baseContainer.position.set(x, y);
    this.flapsContainer.position.set(x, y);
  }

  getPosition(): Vec2 {
    return { x: this.posX, y: this.posY };
  }

  getSize(): { width: number; height: number } {
    return { width: BOX_WIDTH, height: BOX_HEIGHT };
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
