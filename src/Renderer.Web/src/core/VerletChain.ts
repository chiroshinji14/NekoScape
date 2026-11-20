import type { Vec2 } from '../types/simulation';

export interface VerletNode {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

export interface VerletUpdateOptions {
  swayAmp?: number;
  swayFreq?: number;
  time?: number;
  rootAngle?: number;
  restCurve?: number;
  constraintIterations?: number;
}

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

function angleDiff(target: number, base: number): number {
  return normalizeAngle(target - base);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Multi-node Verlet rope/tail chain with strict multi-iteration distance constraints
 * and displacement clamping so segments never stretch, explode, or produce NaNs.
 */
export class VerletChain {
  readonly nodes: VerletNode[];
  private readonly segmentLength: number;
  private readonly damping: number;
  private fallbackAngle = 0;

  constructor(
    count: number,
    segmentLength: number,
    startX = 0,
    startY = 0,
    damping = 0.92,
  ) {
    const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 5));
    this.segmentLength = Math.max(0.001, Number.isFinite(segmentLength) ? segmentLength : 10);
    this.damping = clamp(Number.isFinite(damping) ? damping : 0.92, 0.1, 0.999);

    this.nodes = [];
    for (let i = 0; i < safeCount; i++) {
      this.nodes.push({ x: 0, y: 0, oldX: 0, oldY: 0 });
    }
    this.reset(startX, startY, 0);
  }

  setRoot(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.nodes.length === 0) {
      return;
    }
    const root = this.nodes[0];
    root.x = x;
    root.y = y;
    root.oldX = x;
    root.oldY = y;
  }

  reset(x: number, y: number, angleRad = 0): void {
    const sx = Number.isFinite(x) ? x : 0;
    const sy = Number.isFinite(y) ? y : 0;
    const angle = Number.isFinite(angleRad) ? angleRad : 0;
    this.fallbackAngle = angle;

    const dx = Math.cos(angle) * this.segmentLength;
    const dy = Math.sin(angle) * this.segmentLength;

    for (let i = 0; i < this.nodes.length; i++) {
      const nx = sx + dx * i;
      const ny = sy + dy * i;
      const node = this.nodes[i];
      node.x = nx;
      node.y = ny;
      node.oldX = nx;
      node.oldY = ny;
    }
  }

  update(dt: number, options?: VerletUpdateOptions): void {
    if (this.nodes.length <= 1) {
      return;
    }

    const safeDt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
    const swayAmp = Number.isFinite(options?.swayAmp) ? (options?.swayAmp as number) : 0;
    const swayFreq = Number.isFinite(options?.swayFreq) ? (options?.swayFreq as number) : 3;
    const time = Number.isFinite(options?.time) ? (options?.time as number) : 0;
    const hasRootAngle = options?.rootAngle !== undefined && Number.isFinite(options.rootAngle);
    const rootAngle = hasRootAngle ? (options?.rootAngle as number) : this.fallbackAngle;
    const restCurve = Number.isFinite(options?.restCurve) ? (options?.restCurve as number) : 0;
    const iterations = Math.max(
      5,
      Math.floor(
        Number.isFinite(options?.constraintIterations)
          ? (options?.constraintIterations as number)
          : 10,
      ),
    );

    if (hasRootAngle) {
      this.fallbackAngle = rootAngle;
    }

    // Frame-rate normalized damping (matches raw damping at 60 FPS).
    const stepDamping = safeDt > 0 ? Math.pow(this.damping, safeDt * 60) : 1;
    const maxStep = Math.max(this.segmentLength * 2.5, 40);
    const dtSq = safeDt * safeDt;

    // 1. Verlet integration for non-root nodes.
    for (let i = 1; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const rawVx = Number.isFinite(node.x - node.oldX) ? (node.x - node.oldX) * stepDamping : 0;
      const rawVy = Number.isFinite(node.y - node.oldY) ? (node.y - node.oldY) * stepDamping : 0;

      let vx = rawVx;
      let vy = rawVy;
      const speed = Math.hypot(vx, vy);
      if (speed > maxStep) {
        const scale = maxStep / speed;
        vx *= scale;
        vy *= scale;
      }

      let ax = 0;
      let ay = 0;

      if (hasRootAngle && safeDt > 0) {
        const targetAngle = rootAngle + i * restCurve;
        const stiffness = 260;
        ax += Math.cos(targetAngle) * stiffness;
        ay += Math.sin(targetAngle) * stiffness;
      }

      if (swayAmp !== 0 && safeDt > 0) {
        const prev = this.nodes[i - 1];
        const segDx = node.x - prev.x;
        const segDy = node.y - prev.y;
        const segAngle =
          Math.hypot(segDx, segDy) > 1e-4 ? Math.atan2(segDy, segDx) : rootAngle;
        const perpAngle = segAngle + Math.PI * 0.5;
        const wave = Math.sin(time * swayFreq - i * 0.75) * swayAmp;
        ax += Math.cos(perpAngle) * wave * 45;
        ay += Math.sin(perpAngle) * wave * 45;
      }

      const nextX = node.x + vx + ax * dtSq;
      const nextY = node.y + vy + ay * dtSq;

      node.oldX = node.x;
      node.oldY = node.y;
      node.x = Number.isFinite(nextX) ? nextX : node.x;
      node.y = Number.isFinite(nextY) ? nextY : node.y;
    }

    const rootX = this.nodes[0].x;
    const rootY = this.nodes[0].y;

    // 2. Multi-iteration Gauss-Seidel constraint solver (always >= 5 iterations).
    for (let iter = 0; iter < iterations; iter++) {
      this.nodes[0].x = rootX;
      this.nodes[0].y = rootY;

      for (let i = 0; i < this.nodes.length - 1; i++) {
        const a = this.nodes[i];
        const b = this.nodes[i + 1];

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);

        if (!Number.isFinite(dist) || dist < 1e-6) {
          const fallback = rootAngle + i * restCurve;
          dx = Math.cos(fallback);
          dy = Math.sin(fallback);
          dist = 1;
        }

        const diff = (dist - this.segmentLength) / dist;
        if (i === 0) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }

    // 3. Final exact forward projection prevents residual stretch on sudden reversals
    //    while preserving the equilibrated swing angles and Verlet momentum in oldX/oldY.
    this.nodes[0].x = rootX;
    this.nodes[0].y = rootY;
    for (let i = 0; i < this.nodes.length - 1; i++) {
      const a = this.nodes[i];
      const b = this.nodes[i + 1];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < 1e-6) {
        const fallback = rootAngle + i * restCurve;
        dx = Math.cos(fallback);
        dy = Math.sin(fallback);
        b.x = a.x + dx * this.segmentLength;
        b.y = a.y + dy * this.segmentLength;
      } else {
        const scale = this.segmentLength / dist;
        b.x = a.x + dx * scale;
        b.y = a.y + dy * scale;
      }

      // Clamp stored velocity delta against extreme teleports so next step cannot explode.
      const dvx = b.x - b.oldX;
      const dvy = b.y - b.oldY;
      const dv = Math.hypot(dvx, dvy);
      if (!Number.isFinite(dv)) {
        b.oldX = b.x;
        b.oldY = b.y;
      } else if (dv > maxStep) {
        const s = maxStep / dv;
        b.oldX = b.x - dvx * s;
        b.oldY = b.y - dvy * s;
      }
    }
  }
}

/**
 * 3-node rigid cat spine (head -> torso -> hips) enforcing exact segment distances
 * and maximum angular bend constraints so the spine never kinks or snaps on sharp turns.
 */
export class SpineChain {
  private readonly headToTorsoLen: number;
  private readonly torsoToHipsLen: number;
  private readonly maxBendRad: number;

  private _head: Vec2 = { x: 0, y: 0 };
  private _torso: Vec2 = { x: 0, y: 0 };
  private _hips: Vec2 = { x: 0, y: 0 };
  private _heading = 0;

  constructor(headToTorsoLen = 15, torsoToHipsLen = 17, maxBendRad = 0.95) {
    this.headToTorsoLen = Math.max(1, Number.isFinite(headToTorsoLen) ? headToTorsoLen : 15);
    this.torsoToHipsLen = Math.max(1, Number.isFinite(torsoToHipsLen) ? torsoToHipsLen : 17);
    this.maxBendRad = clamp(Number.isFinite(maxBendRad) ? maxBendRad : 0.95, 0.05, Math.PI);
    this.reset(0, 0, 0);
  }

  get head(): Vec2 {
    return { x: this._head.x, y: this._head.y };
  }

  get torso(): Vec2 {
    return { x: this._torso.x, y: this._torso.y };
  }

  get hips(): Vec2 {
    return { x: this._hips.x, y: this._hips.y };
  }

  get heading(): number {
    return this._heading;
  }

  reset(x: number, y: number, heading = 0): void {
    const sx = Number.isFinite(x) ? x : 0;
    const sy = Number.isFinite(y) ? y : 0;
    const h = normalizeAngle(Number.isFinite(heading) ? heading : 0);
    const backX = -Math.cos(h);
    const backY = -Math.sin(h);

    this._heading = h;
    this._head = { x: sx, y: sy };
    this._torso = {
      x: sx + backX * this.headToTorsoLen,
      y: sy + backY * this.headToTorsoLen,
    };
    this._hips = {
      x: this._torso.x + backX * this.torsoToHipsLen,
      y: this._torso.y + backY * this.torsoToHipsLen,
    };
  }

  moveHeadTo(x: number, y: number, heading?: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const prevBackAngle = Math.hypot(this._torso.x - this._head.x, this._torso.y - this._head.y) > 1e-6
      ? Math.atan2(this._torso.y - this._head.y, this._torso.x - this._head.x)
      : normalizeAngle(this._heading + Math.PI);

    this._head = { x, y };

    // Direction from new head toward previous torso.
    const dx1 = this._torso.x - x;
    const dy1 = this._torso.y - y;
    const dist1 = Math.hypot(dx1, dy1);
    let dir1 = dist1 > 1e-6 ? Math.atan2(dy1, dx1) : prevBackAngle;

    if (heading !== undefined && Number.isFinite(heading)) {
      const normalizedHeading = normalizeAngle(heading);
      const backDir = normalizeAngle(normalizedHeading + Math.PI);
      const diff1 = clamp(angleDiff(dir1, backDir), -this.maxBendRad, this.maxBendRad);
      dir1 = normalizeAngle(backDir + diff1);
      this._heading = normalizedHeading;
    } else {
      this._heading = normalizeAngle(dir1 + Math.PI);
    }

    this._torso = {
      x: x + Math.cos(dir1) * this.headToTorsoLen,
      y: y + Math.sin(dir1) * this.headToTorsoLen,
    };

    // Direction from new torso toward previous hips, clamped to maxBendRad around dir1.
    const dx2 = this._hips.x - this._torso.x;
    const dy2 = this._hips.y - this._torso.y;
    const dist2 = Math.hypot(dx2, dy2);
    const rawDir2 = dist2 > 1e-6 ? Math.atan2(dy2, dx2) : dir1;
    const diff2 = clamp(angleDiff(rawDir2, dir1), -this.maxBendRad, this.maxBendRad);
    const dir2 = normalizeAngle(dir1 + diff2);

    this._hips = {
      x: this._torso.x + Math.cos(dir2) * this.torsoToHipsLen,
      y: this._torso.y + Math.sin(dir2) * this.torsoToHipsLen,
    };
  }
}
