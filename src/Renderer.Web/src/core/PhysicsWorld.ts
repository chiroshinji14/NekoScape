import {
  BONK_VELOCITY_THRESHOLD,
  FRICTION_HARDWOOD,
  FRICTION_RUG,
  YARN_RESTITUTION,
  type AabbRect,
  type SurfaceType,
} from '../types/simulation';
import type { SurfaceManager } from './SurfaceManager';

export interface CircleBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface AabbCollisionResult {
  collided: boolean;
  normalX: number;
  normalY: number;
  penetration: number;
  impactSpeed: number;
  bonked: boolean;
}

const NO_COLLISION: AabbCollisionResult = {
  collided: false,
  normalX: 0,
  normalY: 0,
  penetration: 0,
  impactSpeed: 0,
  bonked: false,
};

/**
 * 2D collision and surface friction solver for cats, yarn balls, and desktop icon AABBs.
 */
export class PhysicsWorld {
  private width: number;
  private height: number;
  private readonly surfaceManager?: SurfaceManager;
  private obstacles: AabbRect[] = [];

  constructor(width: number, height: number, surfaceManager?: SurfaceManager) {
    this.width = Math.max(1, Number.isFinite(width) ? width : 1);
    this.height = Math.max(1, Number.isFinite(height) ? height : 1);
    this.surfaceManager = surfaceManager;
  }

  setBounds(width: number, height: number): void {
    this.width = Math.max(1, Number.isFinite(width) ? width : 1);
    this.height = Math.max(1, Number.isFinite(height) ? height : 1);
  }

  setObstacles(obstacles: AabbRect[]): void {
    this.obstacles = obstacles.map((obs) => ({ ...obs }));
  }

  getObstacles(): readonly AabbRect[] {
    return this.obstacles;
  }

  resolveCircleAabb(
    body: CircleBody,
    aabb: AabbRect,
    restitution = 0.4,
  ): AabbCollisionResult {
    const left = aabb.x;
    const right = aabb.x + aabb.width;
    const top = aabb.y;
    const bottom = aabb.y + aabb.height;

    const closestX = Math.max(left, Math.min(body.x, right));
    const closestY = Math.max(top, Math.min(body.y, bottom));

    const dx = body.x - closestX;
    const dy = body.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= body.radius * body.radius) {
      return { ...NO_COLLISION };
    }

    let normalX = 0;
    let normalY = 0;
    let penetration = 0;

    if (distSq <= 1e-10) {
      // Circle center is inside the AABB: push out along nearest edge.
      const dLeft = Math.abs(body.x - left);
      const dRight = Math.abs(right - body.x);
      const dTop = Math.abs(body.y - top);
      const dBottom = Math.abs(bottom - body.y);

      const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
      if (minEdge === dLeft) {
        normalX = -1;
        normalY = 0;
        penetration = dLeft + body.radius;
        body.x = left - body.radius;
      } else if (minEdge === dRight) {
        normalX = 1;
        normalY = 0;
        penetration = dRight + body.radius;
        body.x = right + body.radius;
      } else if (minEdge === dTop) {
        normalX = 0;
        normalY = -1;
        penetration = dTop + body.radius;
        body.y = top - body.radius;
      } else {
        normalX = 0;
        normalY = 1;
        penetration = dBottom + body.radius;
        body.y = bottom + body.radius;
      }
    } else {
      const dist = Math.sqrt(distSq);
      normalX = dx / dist;
      normalY = dy / dist;
      penetration = body.radius - dist;
      body.x += normalX * penetration;
      body.y += normalY * penetration;
    }

    const vn = body.vx * normalX + body.vy * normalY;
    let impactSpeed = 0;
    if (vn < 0) {
      impactSpeed = -vn;
      const bounce = Math.max(0, Number.isFinite(restitution) ? restitution : 0.4);
      body.vx -= (1 + bounce) * vn * normalX;
      body.vy -= (1 + bounce) * vn * normalY;
    }

    return {
      collided: true,
      normalX,
      normalY,
      penetration,
      impactSpeed,
      bonked: impactSpeed > BONK_VELOCITY_THRESHOLD,
    };
  }

  resolveAllObstacles(
    body: CircleBody,
    restitution = 0.4,
    extraObstacles?: readonly AabbRect[],
  ): AabbCollisionResult | null {
    let bestResult: AabbCollisionResult | null = null;
    const obsLen = this.obstacles.length;
    const extraLen = extraObstacles ? extraObstacles.length : 0;
    const totalLen = obsLen + extraLen;

    // Two passes stabilize wedge corners between adjacent icons and optional extra obstacles.
    for (let pass = 0; pass < 2; pass++) {
      let anyHit = false;
      for (let i = 0; i < totalLen; i++) {
        const obs = i < obsLen ? this.obstacles[i] : extraObstacles![i - obsLen];
        const res = this.resolveCircleAabb(body, obs, restitution);
        if (res.collided) {
          anyHit = true;
          if (!bestResult || res.impactSpeed > bestResult.impactSpeed) {
            bestResult = res;
          }
        }
      }
      if (!anyHit) {
        break;
      }
    }

    return bestResult;
  }

  resolveCircleCircle(a: CircleBody, b: CircleBody, restitution = 0.5): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = a.radius + b.radius;
    const distSq = dx * dx + dy * dy;

    if (distSq >= minDist * minDist) {
      return false;
    }

    let nx = 1;
    let ny = 0;
    let dist = 0;
    if (distSq > 1e-10) {
      dist = Math.sqrt(distSq);
      nx = dx / dist;
      ny = dy / dist;
    }

    const overlap = minDist - dist;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal < 0) {
      const bounce = Math.max(0, Number.isFinite(restitution) ? restitution : 0.5);
      const impulse = -(1 + bounce) * velAlongNormal * 0.5;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }

    return true;
  }

  applySurfaceFriction(
    body: { x: number; y: number; vx: number; vy: number },
    dt: number,
    surfaceOverride?: SurfaceType,
  ): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0) {
      return;
    }

    const mu = surfaceOverride
      ? surfaceOverride === 'rug'
        ? FRICTION_RUG
        : FRICTION_HARDWOOD
      : this.surfaceManager?.getFrictionAt(body.x, body.y) ?? FRICTION_HARDWOOD;

    // Higher surface friction coefficient (0.96 rug vs 0.82 hardwood) means less slip
    // and stronger damping: dragRate scales inversely with slip (1 - mu).
    const slip = Math.max(0.02, 1 - mu);
    const dragRate = 0.25 / slip;
    const factor = Math.exp(-dragRate * safeDt);

    body.vx *= factor;
    body.vy *= factor;
  }

  clampToBounds(body: CircleBody, restitution = 0.4): AabbCollisionResult | null {
    const minX = body.radius;
    const maxX = Math.max(minX, this.width - body.radius);
    const minY = body.radius;
    const maxY = Math.max(minY, this.height - body.radius);
    const bounce = Math.max(0, Number.isFinite(restitution) ? restitution : 0.4);

    let nx = 0;
    let ny = 0;
    let penX = 0;
    let penY = 0;
    let impactSpeed = 0;
    let collided = false;

    if (body.x < minX) {
      penX = minX - body.x;
      body.x = minX;
      nx = 1;
      collided = true;
      if (body.vx < 0) {
        impactSpeed = Math.max(impactSpeed, -body.vx);
        body.vx = -body.vx * bounce;
      }
    } else if (body.x > maxX) {
      penX = body.x - maxX;
      body.x = maxX;
      nx = -1;
      collided = true;
      if (body.vx > 0) {
        impactSpeed = Math.max(impactSpeed, body.vx);
        body.vx = -body.vx * bounce;
      }
    }

    if (body.y < minY) {
      penY = minY - body.y;
      body.y = minY;
      ny = 1;
      collided = true;
      if (body.vy < 0) {
        impactSpeed = Math.max(impactSpeed, -body.vy);
        body.vy = -body.vy * bounce;
      }
    } else if (body.y > maxY) {
      penY = body.y - maxY;
      body.y = maxY;
      ny = -1;
      collided = true;
      if (body.vy > 0) {
        impactSpeed = Math.max(impactSpeed, body.vy);
        body.vy = -body.vy * bounce;
      }
    }

    if (!collided) {
      return null;
    }

    const normalLen = Math.hypot(nx, ny);
    const normalX = normalLen > 0 ? nx / normalLen : 0;
    const normalY = normalLen > 0 ? ny / normalLen : 0;

    return {
      collided: true,
      normalX,
      normalY,
      penetration: Math.hypot(penX, penY),
      impactSpeed,
      bonked: impactSpeed > BONK_VELOCITY_THRESHOLD,
    };
  }

  stepYarnBall(
    yarn: CircleBody,
    dt: number,
  ): { bouncedObstacle: AabbRect | null; wallHit: boolean } {
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    this.applySurfaceFriction(yarn, safeDt);

    yarn.x += yarn.vx * safeDt;
    yarn.y += yarn.vy * safeDt;

    let bouncedObstacle: AabbRect | null = null;
    let bestImpact = -1;

    for (let pass = 0; pass < 2; pass++) {
      let anyHit = false;
      for (const obs of this.obstacles) {
        const res = this.resolveCircleAabb(yarn, obs, YARN_RESTITUTION);
        if (res.collided) {
          anyHit = true;
          if (res.impactSpeed > bestImpact) {
            bestImpact = res.impactSpeed;
            bouncedObstacle = obs;
          }
        }
      }
      if (!anyHit) {
        break;
      }
    }

    const wallRes = this.clampToBounds(yarn, YARN_RESTITUTION);
    const wallHit = wallRes !== null && wallRes.collided;

    return { bouncedObstacle, wallHit };
  }
}
