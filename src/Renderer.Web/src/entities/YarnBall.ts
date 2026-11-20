import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { CircleBody, PhysicsWorld } from '../core/PhysicsWorld';
import { VerletChain } from '../core/VerletChain';
import type { AabbRect, Vec2 } from '../types/simulation';
import type { ParticleSystem } from './ParticleSystem';

const YARN_RADIUS = 16;
const THREAD_SEGMENTS = 8;
const THREAD_SEG_LEN = 7.5;

/**
 * Computes a playful toss velocity away from a click point (or along a lively angle if centered).
 */
export function computeYarnClickTossVelocity(
  ballPos: Vec2,
  clickPos?: Vec2,
  speed = 390,
  angleOffsetRad = 0.18,
): Vec2 {
  const safeSpeed = Number.isFinite(speed) ? Math.max(80, speed) : 390;
  let angle = -Math.PI * 0.25 + angleOffsetRad;
  if (clickPos && Number.isFinite(clickPos.x) && Number.isFinite(clickPos.y)) {
    const dx = ballPos.x - clickPos.x;
    const dy = ballPos.y - clickPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      angle = Math.atan2(dy, dx) + angleOffsetRad;
    }
  }
  return {
    x: Math.cos(angle) * safeSpeed,
    y: Math.sin(angle) * safeSpeed,
  };
}

/**
 * Wound crimson-terracotta yarn ball prop with rotational roll rendering,
 * 8-node Verlet trailing yarn strand, and PhysicsWorld ricochet integration.
 */
export class YarnBall extends Container {
  readonly shadowGraphics: Graphics;

  private readonly body: CircleBody;
  private readonly thread: VerletChain;
  private readonly threadGraphics: Graphics;
  private readonly ballSprite: Sprite;
  private readonly ballTexture: Texture;

  private lastBounceObstacle: AabbRect | null = null;
  private travelAngle = 0;
  private time = 0;

  constructor(x = 460, y = 300) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.body = {
      x,
      y,
      vx: 0,
      vy: 0,
      radius: YARN_RADIUS,
    };

    this.thread = new VerletChain(THREAD_SEGMENTS, THREAD_SEG_LEN, x - YARN_RADIUS, y + 6, 0.9);

    this.shadowGraphics = new Graphics();
    this.threadGraphics = new Graphics();
    this.ballTexture = this.buildYarnTexture();
    this.ballSprite = new Sprite({
      texture: this.ballTexture,
      anchor: 0.5,
      width: YARN_RADIUS * 2.1,
      height: YARN_RADIUS * 2.1,
    });

    this.addChild(this.shadowGraphics);
    this.addChild(this.threadGraphics);
    this.addChild(this.ballSprite);

    this.syncVisuals();
  }

  attachShadowTo(shadowsLayer: Container): void {
    shadowsLayer.addChild(this.shadowGraphics);
  }

  toss(vx: number, vy: number): void {
    this.body.vx = vx;
    this.body.vy = vy;
    if (Math.hypot(vx, vy) > 1) {
      this.travelAngle = Math.atan2(vy, vx);
    }
  }

  nudge(fx: number, fy: number): void {
    this.body.vx += fx;
    this.body.vy += fy;
    if (Math.hypot(this.body.vx, this.body.vy) > 1) {
      this.travelAngle = Math.atan2(this.body.vy, this.body.vx);
    }
  }

  /**
   * Applies a crisp click-to-toss impulse away from the click point and returns the new velocity.
   */
  clickToss(clickX?: number, clickY?: number, speed = 390): Vec2 {
    const clickPos =
      clickX !== undefined && clickY !== undefined ? { x: clickX, y: clickY } : undefined;
    const jitter = ((Math.sin(this.time * 13.7 + this.body.x * 0.11) * 0.5) * 0.45);
    const vel = computeYarnClickTossVelocity(
      { x: this.body.x, y: this.body.y },
      clickPos,
      speed,
      jitter,
    );
    this.toss(vel.x, vel.y);
    return vel;
  }

  /**
   * Moves the yarn ball cleanly during drag while keeping the Verlet thread smoothly trailing.
   */
  moveTo(x: number, y: number): void {
    const dx = x - this.body.x;
    const dy = y - this.body.y;
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    if (Math.hypot(dx, dy) > 0.5) {
      this.travelAngle = Math.atan2(dy, dx);
    }
    const tailAttachAngle = this.travelAngle + Math.PI;
    const rootX = this.body.x + Math.cos(tailAttachAngle) * (this.body.radius * 0.7);
    const rootY = this.body.y + Math.sin(tailAttachAngle) * (this.body.radius * 0.7);
    this.thread.setRoot(rootX, rootY);
    this.thread.update(0.016, {
      swayAmp: Math.min(0.45, Math.hypot(dx, dy) * 0.04),
      swayFreq: 5.5,
      time: this.time,
      rootAngle: tailAttachAngle,
      constraintIterations: 8,
    });
    this.syncVisuals();
  }

  reset(x: number, y: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.ballSprite.rotation = 0;
    this.thread.reset(x - YARN_RADIUS * 0.7, y + 6, Math.PI * 0.85);
    this.syncVisuals();
  }

  isRolling(): boolean {
    return Math.hypot(this.body.vx, this.body.vy) > 14;
  }

  getPosition(): Vec2 {
    return { x: this.body.x, y: this.body.y };
  }

  getVelocity(): Vec2 {
    return { x: this.body.vx, y: this.body.vy };
  }

  getRadius(): number {
    return this.body.radius;
  }

  getBody(): CircleBody {
    return this.body;
  }

  getLastBouncedObstacle(): AabbRect | null {
    return this.lastBounceObstacle;
  }

  containsPoint(x: number, y: number): boolean {
    return Math.hypot(x - this.body.x, y - this.body.y) <= this.body.radius + 8;
  }

  update(dt: number, physics: PhysicsWorld, particles?: ParticleSystem): void {
    const safeDt = Math.max(0, Math.min(dt, 0.05));
    this.time += safeDt;

    const prevX = this.body.x;
    const prevY = this.body.y;
    const prevSpeed = Math.hypot(this.body.vx, this.body.vy);

    const stepResult = physics.stepYarnBall(this.body, safeDt);
    this.lastBounceObstacle = stepResult.bouncedObstacle;

    if ((stepResult.bouncedObstacle || stepResult.wallHit) && prevSpeed > 130 && particles) {
      particles.spawnDustPuff(this.body.x, this.body.y, this.body.vx * 0.25, this.body.vy * 0.25);
    }

    const dx = this.body.x - prevX;
    const dy = this.body.y - prevY;
    const moved = Math.hypot(dx, dy);
    if (moved > 0.01) {
      const sign = dx !== 0 ? Math.sign(dx) : Math.sign(dy) || 1;
      this.ballSprite.rotation += (sign * moved) / this.body.radius;
      this.travelAngle = Math.atan2(dy, dx);
    }

    const tailAttachAngle = this.travelAngle + Math.PI;
    const rootX = this.body.x + Math.cos(tailAttachAngle) * (this.body.radius * 0.7);
    const rootY = this.body.y + Math.sin(tailAttachAngle) * (this.body.radius * 0.7);
    const speed = Math.hypot(this.body.vx, this.body.vy);

    this.thread.setRoot(rootX, rootY);
    this.thread.update(safeDt, {
      swayAmp: moved > 0.15 ? Math.min(0.65, 0.2 + speed / 420) : 0,
      swayFreq: 5.8,
      time: this.time,
      rootAngle: tailAttachAngle,
      constraintIterations: 8,
    });

    this.syncVisuals();
  }

  private syncVisuals(): void {
    const x = this.body.x;
    const y = this.body.y;

    this.ballSprite.position.set(x, y);

    // Ground drop shadow under ball and thread
    this.shadowGraphics.clear();
    this.shadowGraphics
      .ellipse(x + 3.5, y + 5.5, this.body.radius * 1.05, this.body.radius * 0.86)
      .fill({ color: 0x22140b, alpha: 0.24 })
      .ellipse(x + 2, y + 3, this.body.radius * 0.94, this.body.radius * 0.78)
      .fill({ color: 0x22140b, alpha: 0.14 });

    // Trailing 8-node Verlet crimson yarn strand
    const nodes = this.thread.nodes;
    this.threadGraphics.clear();
    if (nodes.length >= 2) {
      // Subtle floor shadow under thread
      this.drawSmoothChain(this.threadGraphics, nodes, 2, 3);
      this.threadGraphics.stroke({ width: 3.2, color: 0x22140b, alpha: 0.16, cap: 'round', join: 'round' });

      // Main crimson yarn strand
      this.drawSmoothChain(this.threadGraphics, nodes, 0, 0);
      this.threadGraphics.stroke({ width: 2.8, color: 0xb93730, alpha: 0.95, cap: 'round', join: 'round' });

      // Subtle warm highlight thread along center
      this.drawSmoothChain(this.threadGraphics, nodes, -0.4, -0.5);
      this.threadGraphics.stroke({ width: 1.1, color: 0xe7786d, alpha: 0.55, cap: 'round', join: 'round' });
    }
  }

  private drawSmoothChain(
    gfx: Graphics,
    nodes: readonly { x: number; y: number }[],
    ox: number,
    oy: number,
  ): void {
    gfx.moveTo(nodes[0].x + ox, nodes[0].y + oy);
    for (let i = 1; i < nodes.length - 1; i++) {
      const mx = (nodes[i].x + nodes[i + 1].x) * 0.5 + ox;
      const my = (nodes[i].y + nodes[i + 1].y) * 0.5 + oy;
      gfx.quadraticCurveTo(nodes[i].x + ox, nodes[i].y + oy, mx, my);
    }
    const last = nodes[nodes.length - 1];
    gfx.lineTo(last.x + ox, last.y + oy);
  }

  private buildYarnTexture(): Texture {
    if (typeof document === 'undefined') {
      return Texture.EMPTY;
    }
    const size = 68;
    const half = size * 0.5;
    const r = size * 0.45;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Texture.EMPTY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, r, 0, Math.PI * 2);
    ctx.clip();

    // Base sphere shading (#C8433B core)
    const sphereGrad = ctx.createRadialGradient(
      half - r * 0.34,
      half - r * 0.34,
      r * 0.12,
      half,
      half,
      r * 1.15,
    );
    sphereGrad.addColorStop(0, '#E36A5F');
    sphereGrad.addColorStop(0.45, '#C8433B');
    sphereGrad.addColorStop(1, '#7D221D');
    ctx.fillStyle = sphereGrad;
    ctx.fillRect(0, 0, size, size);

    // Wound intersecting yarn strand bundles
    const strandAngles = [-0.85, -0.25, 0.4, 1.05, 1.65];
    for (let b = 0; b < strandAngles.length; b++) {
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(strandAngles[b]);

      for (let offset = -r * 0.72; offset <= r * 0.72; offset += 4.2) {
        const isLight = Math.abs(offset) < r * 0.28 && b >= 2;
        ctx.strokeStyle = isLight
          ? 'rgba(242, 146, 134, 0.56)'
          : offset > 0
            ? 'rgba(130, 32, 27, 0.62)'
            : 'rgba(218, 88, 78, 0.58)';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.ellipse(0, offset * 0.42, r * 1.06, Math.max(3, r * 0.36 - Math.abs(offset) * 0.15), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Soft catchlight + bottom-right ambient rim
    const glint = ctx.createRadialGradient(
      half - r * 0.36,
      half - r * 0.36,
      1,
      half - r * 0.36,
      half - r * 0.36,
      r * 0.55,
    );
    glint.addColorStop(0, 'rgba(255, 224, 214, 0.36)');
    glint.addColorStop(1, 'rgba(255, 224, 214, 0)');
    ctx.fillStyle = glint;
    ctx.fillRect(0, 0, size, size);

    ctx.restore();

    // Subtle crisp edge ring
    ctx.beginPath();
    ctx.arc(half, half, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(72, 21, 18, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    return Texture.from(canvas, true);
  }

  override destroy(): void {
    this.shadowGraphics.destroy();
    if (this.ballTexture !== Texture.EMPTY) {
      this.ballTexture.destroy(true);
    }
    super.destroy({ children: true });
  }
}
