import {
  FRICTION_HARDWOOD,
  FRICTION_RUG,
  type RugBounds,
  type SurfaceType,
  type Vec2,
} from '../types/simulation';

/**
 * Manages floor zones (hardwood planks vs. centered woven rug) and surface friction.
 */
export class SurfaceManager {
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = Math.max(1, Number.isFinite(width) ? width : 1);
    this.height = Math.max(1, Number.isFinite(height) ? height : 1);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Number.isFinite(width) ? width : 1);
    this.height = Math.max(1, Number.isFinite(height) ? height : 1);
  }

  getRugBounds(): RugBounds {
    const maxW = Math.max(40, this.width - 16);
    const maxH = Math.max(40, this.height - 16);

    const rugWidth = Math.min(Math.max(this.width * 0.52, 240), 880, maxW);
    const rugHeight = Math.min(Math.max(this.height * 0.48, 180), 560, maxH);
    const cornerRadius = Math.min(28, rugWidth * 0.15, rugHeight * 0.15);

    return {
      x: (this.width - rugWidth) * 0.5,
      y: (this.height - rugHeight) * 0.5,
      width: rugWidth,
      height: rugHeight,
      cornerRadius,
    };
  }

  isOnRug(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }

    const b = this.getRugBounds();
    if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) {
      return false;
    }

    const r = b.cornerRadius;
    if (r <= 0) {
      return true;
    }

    // Check rounded corners.
    const innerLeft = b.x + r;
    const innerRight = b.x + b.width - r;
    const innerTop = b.y + r;
    const innerBottom = b.y + b.height - r;

    let cornerX = x;
    let cornerY = y;
    if (x < innerLeft) cornerX = innerLeft;
    else if (x > innerRight) cornerX = innerRight;
    else return true;

    if (y < innerTop) cornerY = innerTop;
    else if (y > innerBottom) cornerY = innerBottom;
    else return true;

    const dx = x - cornerX;
    const dy = y - cornerY;
    return dx * dx + dy * dy <= r * r;
  }

  getSurfaceAt(x: number, y: number): SurfaceType {
    return this.isOnRug(x, y) ? 'rug' : 'hardwood';
  }

  getFrictionAt(x: number, y: number): number {
    return this.isOnRug(x, y) ? FRICTION_RUG : FRICTION_HARDWOOD;
  }

  getRandomRugSpot(margin = 24): Vec2 {
    const b = this.getRugBounds();
    const safeMargin = Math.max(
      0,
      Math.min(Number.isFinite(margin) ? margin : 24, b.width * 0.4, b.height * 0.4),
    );

    const minX = b.x + safeMargin;
    const maxX = b.x + b.width - safeMargin;
    const minY = b.y + safeMargin;
    const maxY = b.y + b.height - safeMargin;

    for (let attempt = 0; attempt < 8; attempt++) {
      const px = minX + Math.random() * Math.max(0, maxX - minX);
      const py = minY + Math.random() * Math.max(0, maxY - minY);
      if (this.isOnRug(px, py)) {
        return { x: px, y: py };
      }
    }

    // Fallback inside central safe region of rug.
    return {
      x: b.x + b.width * 0.5,
      y: b.y + b.height * 0.5,
    };
  }
}
