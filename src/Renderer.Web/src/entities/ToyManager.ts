import { Container, Graphics } from 'pixi.js';
import type { CircleBody, PhysicsWorld } from '../core/PhysicsWorld';
import {
  TOY_LABELS,
  type CatSoundEvent,
  type PropParticleBurst,
  type ToyEntityState,
  type ToyKind,
  type Vec2,
} from '../types/simulation';
import type { ParticleSystem } from './ParticleSystem';

export const PING_PONG_RESTITUTION = 0.92;
export const DEFAULT_BUBBLE_CLUSTER_MIN = 4;
export const DEFAULT_BUBBLE_CLUSTER_MAX = 6;
export const CUCUMBER_TTL_SEC = 16;
export const BUBBLE_TTL_SEC = 13;

export interface SpawnToyOptions {
  /** Override count for bubble cluster spawning (default 4..6). */
  count?: number;
  /** Optional initial velocity X. */
  vx?: number;
  /** Optional initial velocity Y. */
  vy?: number;
  /** Optional lifetime override in seconds (null for persistent). */
  ttlSec?: number | null;
  /** Optional deterministic seed for tests. */
  seed?: number;
}

export interface ToyClickResult {
  toy: ToyEntityState;
  action: 'scurry' | 'flop' | 'whip' | 'bat' | 'pop_and_spawn' | 'dismiss' | 'rustle' | 'pulse';
  title: string;
  subtitle: string;
  soundEvent?: CatSoundEvent;
  particles: readonly PropParticleBurst[];
  spawnedToys?: readonly ToyEntityState[];
}

export interface ToySimulationEvent {
  type: 'bounce' | 'pop' | 'expired';
  toyId: string;
  kind: ToyKind;
  x: number;
  y: number;
  speed: number;
  soundEvent?: CatSoundEvent;
  particles: readonly PropParticleBurst[];
}

interface ToyPhysicsSpec {
  readonly radius: number;
  readonly dragRate: number;
  readonly restitution: number;
  readonly isCatnip: boolean;
  readonly isFood: boolean;
  readonly isScary: boolean;
  readonly isFloorFlat: boolean;
  readonly collidesWithWorld: boolean;
  readonly carryable: boolean;
  readonly defaultTtlSec: number | null;
}

const TOY_SPECS: Readonly<Record<ToyKind, ToyPhysicsSpec>> = {
  mouse_toy: {
    radius: 15,
    dragRate: 2.9,
    restitution: 0.56,
    isCatnip: true,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: true,
    defaultTtlSec: null,
  },
  fish_toy: {
    radius: 16,
    dragRate: 3.1,
    restitution: 0.52,
    isCatnip: false,
    isFood: true,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: true,
    defaultTtlSec: null,
  },
  feather_wand: {
    radius: 22,
    dragRate: 3.6,
    restitution: 0.4,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: false,
    carryable: false,
    defaultTtlSec: null,
  },
  crinkle_ball: {
    radius: 13,
    dragRate: 1.15,
    restitution: 0.78,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: true,
    defaultTtlSec: null,
  },
  spring_toy: {
    radius: 14,
    dragRate: 1.4,
    restitution: 0.84,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: true,
    defaultTtlSec: null,
  },
  ping_pong: {
    radius: 12,
    dragRate: 0.92,
    restitution: PING_PONG_RESTITUTION,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: false,
    defaultTtlSec: null,
  },
  hair_tie: {
    radius: 12,
    dragRate: 0.65,
    restitution: 0.85,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: true,
    defaultTtlSec: null,
  },
  bubbles: {
    radius: 13,
    dragRate: 1.5,
    restitution: 0.8,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: false,
    carryable: false,
    defaultTtlSec: BUBBLE_TTL_SEC,
  },
  cucumber: {
    radius: 20,
    dragRate: 8.5,
    restitution: 0.25,
    isCatnip: false,
    isFood: false,
    isScary: true,
    isFloorFlat: false,
    collidesWithWorld: true,
    carryable: false,
    defaultTtlSec: CUCUMBER_TTL_SEC,
  },
  taped_square: {
    radius: 44,
    dragRate: 20,
    restitution: 0,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: true,
    collidesWithWorld: false,
    carryable: false,
    defaultTtlSec: null,
  },
  paper_bag: {
    radius: 34,
    dragRate: 7.5,
    restitution: 0.22,
    isCatnip: false,
    isFood: false,
    isScary: false,
    isFloorFlat: false,
    collidesWithWorld: false,
    carryable: false,
    defaultTtlSec: null,
  },
};

export interface ToyRuntime extends ToyEntityState {
  anchorX: number;
  anchorY: number;
  spinVel: number;
  flopTimer: number;
  rustleTimer: number;
  pulseTimer: number;
  swayAmp: number;
  swayFreq: number;
  colorVariant: number;
  battedByCatId: number | null;
}

export function isCarryableToy(kind: ToyKind): boolean {
  return TOY_SPECS[kind].carryable;
}

export function getToyPhysicsSpec(kind: ToyKind): Readonly<ToyPhysicsSpec> {
  return TOY_SPECS[kind];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Pure TypeScript physics and interaction simulation for all 11 NekoScape v2.0 toys.
 * Zero PixiJS or DOM dependencies so Vitest suites can exercise every behavior directly.
 */
export class ToyWorld {
  private width: number;
  private height: number;
  private toys: ToyRuntime[] = [];
  private simTime = 0;
  private nextId = 1;
  private spawnCounter = 0;
  private cursorPos: Vec2 | null = null;
  private events: ToySimulationEvent[] = [];

  constructor(width = 1280, height = 720) {
    this.width = Math.max(240, Number.isFinite(width) ? width : 1280);
    this.height = Math.max(180, Number.isFinite(height) ? height : 720);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(240, Number.isFinite(width) ? width : this.width);
    this.height = Math.max(180, Number.isFinite(height) ? height : this.height);

    for (const toy of this.toys) {
      const margin = toy.radius + 8;
      toy.x = clamp(toy.x, margin, Math.max(margin, this.width - margin));
      toy.y = clamp(toy.y, margin, Math.max(margin, this.height - margin));
      toy.anchorX = clamp(toy.anchorX, 24, Math.max(24, this.width - 24));
      toy.anchorY = clamp(toy.anchorY, 24, Math.max(24, this.height - 24));
    }
  }

  setCursor(x: number, y: number, active = true): void {
    if (!active || !Number.isFinite(x) || !Number.isFinite(y)) {
      this.cursorPos = null;
      return;
    }
    this.cursorPos = { x, y };
  }

  getTime(): number {
    return this.simTime;
  }

  getActiveCount(): number {
    return this.toys.length;
  }

  getToys(): readonly ToyEntityState[] {
    return this.toys;
  }

  getRuntimeToys(): readonly ToyRuntime[] {
    return this.toys;
  }

  getToyById(toyId: string): ToyEntityState | null {
    return this.toys.find((t) => t.id === toyId) ?? null;
  }

  getToysByKind(kind: ToyKind): ToyEntityState[] {
    return this.toys.filter((t) => t.kind === kind);
  }

  getScaryToys(): ToyEntityState[] {
    return this.toys.filter((t) => t.active && t.isScary);
  }

  isPaperBagActive(): boolean {
    return this.toys.some((t) => t.active && t.kind === 'paper_bag');
  }

  isTapedSquareActive(): boolean {
    return this.toys.some((t) => t.active && t.kind === 'taped_square');
  }

  drainEvents(): ToySimulationEvent[] {
    if (this.events.length === 0) {
      return [];
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  /**
   * Spawns a toy of any ToyKind. For 'bubbles', spawns a 4-6 bubble cluster and returns
   * the primary bubble (use spawnBubbles() when all cluster items are needed directly).
   */
  spawnToy(
    kind: ToyKind,
    x?: number,
    y?: number,
    options?: SpawnToyOptions,
  ): ToyEntityState {
    if (kind === 'bubbles') {
      const cluster = this.spawnBubbles(x, y, options?.count, options?.seed);
      return cluster[0];
    }

    const spec = TOY_SPECS[kind];
    const dropPos = this.resolveDropPoint(kind, x, y, options?.seed);

    // Taped square and paper bag maintain a clean single floor prop instance when re-dropped.
    if (kind === 'taped_square' || kind === 'paper_bag') {
      const existing = this.toys.find((t) => t.kind === kind);
      if (existing) {
        existing.x = dropPos.x;
        existing.y = dropPos.y;
        existing.vx = 0;
        existing.vy = 0;
        existing.anchorX = dropPos.x;
        existing.anchorY = dropPos.y;
        existing.rustleTimer = kind === 'paper_bag' ? 0.7 : 0;
        existing.pulseTimer = kind === 'taped_square' ? 0.8 : 0;
        existing.active = true;
        return existing;
      }
    }

    const seq = this.nextId++;
    const seed = options?.seed ?? seq * 1.37 + this.simTime;
    const ttl = options?.ttlSec !== undefined ? options.ttlSec : spec.defaultTtlSec;
    const expiresAt = ttl !== null ? this.simTime + Math.max(0.5, ttl) : null;

    let vx = options?.vx ?? 0;
    let vy = options?.vy ?? 0;
    let rotation = (seededUnit(seed + 1) - 0.5) * 0.8;
    let anchorX = dropPos.x;
    let anchorY = dropPos.y;

    if (kind === 'feather_wand') {
      anchorX = clamp(dropPos.x - 42, 36, Math.max(36, this.width - 36));
      anchorY = clamp(dropPos.y + 34, 36, Math.max(36, this.height - 36));
      rotation = Math.atan2(dropPos.y - anchorY, dropPos.x - anchorX);
    } else if (kind === 'mouse_toy' && options?.vx === undefined && options?.vy === undefined) {
      const ang = (seededUnit(seed + 2) - 0.5) * Math.PI * 2;
      vx = Math.cos(ang) * 95;
      vy = Math.sin(ang) * 95;
      rotation = ang;
    } else if (kind === 'fish_toy' && options?.vx === undefined && options?.vy === undefined) {
      const ang = (seededUnit(seed + 2) - 0.5) * Math.PI * 2;
      vx = Math.cos(ang) * 65;
      vy = Math.sin(ang) * 65;
      rotation = ang;
    } else if (
      (kind === 'crinkle_ball' || kind === 'spring_toy' || kind === 'ping_pong' || kind === 'hair_tie') &&
      options?.vx === undefined &&
      options?.vy === undefined
    ) {
      const ang = seededUnit(seed + 3) * Math.PI * 2;
      const spd = kind === 'ping_pong' ? 240 : 170;
      vx = Math.cos(ang) * spd;
      vy = Math.sin(ang) * spd;
      rotation = ang;
    }

    const toy: ToyRuntime = {
      id: `${kind}-${seq}`,
      kind,
      x: dropPos.x,
      y: dropPos.y,
      vx,
      vy,
      radius: spec.radius,
      rotation,
      phase: seededUnit(seed + 4) * Math.PI * 2,
      isCarriedByCatId: null,
      isCatnip: spec.isCatnip,
      isFood: spec.isFood,
      isScary: spec.isScary,
      active: true,
      createdAt: this.simTime,
      expiresAt,
      anchorX,
      anchorY,
      spinVel: kind === 'spring_toy' ? (seededUnit(seed + 5) > 0.5 ? 9 : -9) : 0,
      flopTimer: kind === 'fish_toy' ? 2.2 : 0,
      rustleTimer: kind === 'paper_bag' ? 0.75 : 0,
      pulseTimer: kind === 'taped_square' ? 0.8 : 0,
      swayAmp: kind === 'feather_wand' ? 26 : 0,
      swayFreq: kind === 'feather_wand' ? 2.2 : 0,
      colorVariant: seq % 4,
      battedByCatId: null,
    };

    this.toys.push(toy);
    return toy;
  }

  /**
   * Spawns a cluster of 4-6 iridescent floating soap bubbles.
   */
  spawnBubbles(x?: number, y?: number, count?: number, seedBase?: number): ToyEntityState[] {
    const spec = TOY_SPECS.bubbles;
    const center = this.resolveDropPoint('bubbles', x, y, seedBase);
    const seed = seedBase ?? this.nextId * 2.13 + this.simTime;
    const targetCount =
      count !== undefined
        ? Math.max(1, Math.min(12, Math.round(count)))
        : DEFAULT_BUBBLE_CLUSTER_MIN +
          Math.floor(seededUnit(seed) * (DEFAULT_BUBBLE_CLUSTER_MAX - DEFAULT_BUBBLE_CLUSTER_MIN + 1));

    const spawned: ToyRuntime[] = [];
    for (let i = 0; i < targetCount; i++) {
      const seq = this.nextId++;
      const s = seed + i * 3.7;
      const ang = (i / targetCount) * Math.PI * 2 + seededUnit(s) * 0.7;
      const dist = 10 + seededUnit(s + 1) * 32;
      const bx = clamp(center.x + Math.cos(ang) * dist, 30, this.width - 30);
      const by = clamp(center.y + Math.sin(ang) * dist * 0.75 - 12, 30, this.height - 64);
      const radius = 10 + Math.round(seededUnit(s + 2) * 5);

      const bubble: ToyRuntime = {
        id: `bubbles-${seq}`,
        kind: 'bubbles',
        x: bx,
        y: by,
        vx: (seededUnit(s + 3) - 0.5) * 18,
        vy: 14 + seededUnit(s + 4) * 10,
        radius,
        rotation: 0,
        phase: seededUnit(s + 5) * Math.PI * 2,
        isCarriedByCatId: null,
        isCatnip: false,
        isFood: false,
        isScary: false,
        active: true,
        createdAt: this.simTime,
        expiresAt: this.simTime + BUBBLE_TTL_SEC + seededUnit(s + 6) * 3.5,
        anchorX: bx,
        anchorY: by,
        spinVel: 0,
        flopTimer: 0,
        rustleTimer: 0,
        pulseTimer: 0,
        swayAmp: 16 + seededUnit(s + 7) * 12,
        swayFreq: 1.8 + seededUnit(s + 8) * 1.1,
        colorVariant: seq % 4,
        battedByCatId: null,
      };
      this.toys.push(bubble);
      spawned.push(bubble);
    }

    return spawned;
  }

  togglePaperBag(x?: number, y?: number): ToyEntityState | null {
    const existingIdx = this.toys.findIndex((t) => t.kind === 'paper_bag');
    if (existingIdx >= 0) {
      this.toys[existingIdx].active = false;
      this.toys.splice(existingIdx, 1);
      return null;
    }
    return this.spawnToy('paper_bag', x, y);
  }

  toggleTapedSquare(x?: number, y?: number): ToyEntityState | null {
    const existingIdx = this.toys.findIndex((t) => t.kind === 'taped_square');
    if (existingIdx >= 0) {
      this.toys[existingIdx].active = false;
      this.toys.splice(existingIdx, 1);
      return null;
    }
    return this.spawnToy('taped_square', x, y);
  }

  hitTestToy(x: number, y: number, extraPadding = 6): ToyEntityState | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const matchesToy = (toy: ToyRuntime): boolean => {
      if (!toy.active) return false;

      if (toy.kind === 'taped_square') {
        const half = toy.radius + extraPadding * 0.5;
        return Math.abs(x - toy.x) <= half && Math.abs(y - toy.y) <= half;
      }

      if (toy.kind === 'cucumber') {
        const rot = toy.rotation ?? 0;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const dx = x - toy.x;
        const dy = y - toy.y;
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        const rx = toy.radius + 8 + extraPadding;
        const ry = 13 + extraPadding;
        return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
      }

      const hitR = toy.radius + extraPadding;
      const dx = x - toy.x;
      const dy = y - toy.y;
      return dx * dx + dy * dy <= hitR * hitR;
    };

    // Priority 1: small/floating toys above floor props (top-most first)
    for (let i = this.toys.length - 1; i >= 0; i--) {
      const toy = this.toys[i];
      if (toy.kind !== 'taped_square' && toy.kind !== 'paper_bag' && matchesToy(toy)) {
        return toy;
      }
    }
    // Priority 2: paper bag
    for (let i = this.toys.length - 1; i >= 0; i--) {
      const toy = this.toys[i];
      if (toy.kind === 'paper_bag' && matchesToy(toy)) {
        return toy;
      }
    }
    // Priority 3: flat taped square on floor
    for (let i = this.toys.length - 1; i >= 0; i--) {
      const toy = this.toys[i];
      if (toy.kind === 'taped_square' && matchesToy(toy)) {
        return toy;
      }
    }
    return null;
  }

  batToy(toyId: string, vx: number, vy: number, catId?: number): boolean {
    const toy = this.toys.find((t) => t.id === toyId && t.active);
    if (!toy) {
      return false;
    }
    if (toy.kind === 'taped_square') {
      toy.pulseTimer = 0.7;
      return true;
    }
    if (toy.kind === 'bubbles') {
      const speed = Math.hypot(vx, vy);
      if (speed > 260) {
        return this.popBubble(toy.id);
      }
    }

    toy.isCarriedByCatId = null;
    toy.battedByCatId = catId ?? null;

    const safeVx = clamp(Number.isFinite(vx) ? vx : 0, -950, 950);
    const safeVy = clamp(Number.isFinite(vy) ? vy : 0, -950, 950);

    if (toy.kind === 'spring_toy') {
      // Springs bounce chaotically sideways when slapped
      const angle = Math.atan2(safeVy, safeVx) + (seededUnit(this.simTime * 19 + toy.x) - 0.5) * 0.95;
      const spd = Math.max(180, Math.hypot(safeVx, safeVy) * 1.15);
      toy.vx = Math.cos(angle) * spd;
      toy.vy = Math.sin(angle) * spd;
      toy.spinVel = (toy.spinVel >= 0 ? -1 : 1) * (10 + seededUnit(this.simTime) * 6);
    } else if (toy.kind === 'crinkle_ball') {
      // Crinkle balls skitter fast with light erratic deflection
      const angle = Math.atan2(safeVy, safeVx) + (seededUnit(this.simTime * 23 + toy.y) - 0.5) * 0.55;
      const spd = Math.max(160, Math.hypot(safeVx, safeVy) * 1.12);
      toy.vx = Math.cos(angle) * spd;
      toy.vy = Math.sin(angle) * spd;
    } else {
      toy.vx = safeVx;
      toy.vy = safeVy;
    }

    if (toy.kind === 'fish_toy') {
      toy.flopTimer = 2.4;
    } else if (toy.kind === 'paper_bag') {
      toy.rustleTimer = 0.85;
    }

    if (Math.hypot(toy.vx, toy.vy) > 4 && toy.kind !== 'feather_wand') {
      toy.rotation = Math.atan2(toy.vy, toy.vx);
    }

    return true;
  }

  setToyCarried(toyId: string, catId: number | null, carryX?: number, carryY?: number): boolean {
    const toy = this.toys.find((t) => t.id === toyId && t.active);
    if (!toy) {
      return false;
    }
    toy.isCarriedByCatId = catId;
    if (catId !== null) {
      toy.vx = 0;
      toy.vy = 0;
      if (carryX !== undefined && Number.isFinite(carryX)) {
        toy.x = carryX;
      }
      if (carryY !== undefined && Number.isFinite(carryY)) {
        toy.y = carryY;
      }
    }
    return true;
  }

  updateCarriedToyPosition(toyId: string, x: number, y: number, rotation?: number): boolean {
    const toy = this.toys.find((t) => t.id === toyId && t.active);
    if (!toy || toy.isCarriedByCatId === null) {
      return false;
    }
    if (Number.isFinite(x)) toy.x = x;
    if (Number.isFinite(y)) toy.y = y;
    if (rotation !== undefined && Number.isFinite(rotation)) {
      toy.rotation = rotation;
    }
    return true;
  }

  consumeToy(toyId: string): boolean {
    const idx = this.toys.findIndex((t) => t.id === toyId);
    if (idx < 0) {
      return false;
    }
    const [removed] = this.toys.splice(idx, 1);
    removed.active = false;
    removed.isCarriedByCatId = null;
    return true;
  }

  popBubble(id: string): boolean {
    const idx = this.toys.findIndex((t) => t.id === id && t.kind === 'bubbles');
    if (idx < 0) {
      return false;
    }
    const [bubble] = this.toys.splice(idx, 1);
    bubble.active = false;
    this.events.push({
      type: 'pop',
      toyId: bubble.id,
      kind: 'bubbles',
      x: bubble.x,
      y: bubble.y,
      speed: 0,
      soundEvent: 'bubble_pop',
      particles: [
        { kind: 'bubbles', x: bubble.x, y: bubble.y, count: 6 },
        { kind: 'ripple', x: bubble.x, y: bubble.y, color: 0x8ae9ff },
      ],
    });
    return true;
  }

  clickToy(toyId: string, clickX?: number, clickY?: number): ToyClickResult | null {
    const toy = this.toys.find((t) => t.id === toyId && t.active);
    if (!toy) {
      return null;
    }

    const label = TOY_LABELS[toy.kind];
    const cx = clickX ?? toy.x;
    const cy = clickY ?? toy.y;
    const awayAngle =
      Math.hypot(toy.x - cx, toy.y - cy) > 2
        ? Math.atan2(toy.y - cy, toy.x - cx)
        : (toy.rotation ?? 0) + (seededUnit(this.simTime * 17 + toy.x) - 0.5) * 0.8;

    switch (toy.kind) {
      case 'mouse_toy': {
        const scurryAngle = (toy.rotation ?? awayAngle) + (seededUnit(this.simTime * 11) - 0.5) * 0.7;
        const speed = 340;
        this.batToy(toy.id, Math.cos(scurryAngle) * speed, Math.sin(scurryAngle) * speed);
        return {
          toy,
          action: 'scurry',
          title: label,
          subtitle: 'Squeak! Catnip mouse scurries across the floor',
          soundEvent: 'chirp',
          particles: [
            { kind: 'catnip', x: toy.x, y: toy.y, count: 6 },
            { kind: 'dust', x: toy.x, y: toy.y },
          ],
        };
      }
      case 'fish_toy': {
        this.batToy(toy.id, Math.cos(awayAngle) * 190, Math.sin(awayAngle) * 190);
        toy.flopTimer = 2.6;
        return {
          toy,
          action: 'flop',
          title: label,
          subtitle: 'Flopping & wiggling! Cats cannot resist',
          soundEvent: 'water_lap',
          particles: [
            { kind: 'sparkle', x: toy.x, y: toy.y, count: 5, color: 0xffb38a },
            { kind: 'splash', x: toy.x, y: toy.y, count: 4 },
          ],
        };
      }
      case 'feather_wand': {
        const whipAngle = awayAngle + Math.PI * 0.35;
        toy.vx = Math.cos(whipAngle) * 320;
        toy.vy = Math.sin(whipAngle) * 320;
        return {
          toy,
          action: 'whip',
          title: label,
          subtitle: 'Fluttered the colorful feather lure',
          soundEvent: 'trill',
          particles: [{ kind: 'sparkle', x: toy.x, y: toy.y, count: 6, color: 0x6ce3d8 }],
        };
      }
      case 'crinkle_ball': {
        this.batToy(toy.id, Math.cos(awayAngle) * 410, Math.sin(awayAngle) * 410);
        return {
          toy,
          action: 'bat',
          title: label,
          subtitle: 'Crinkly foil skitters wildly!',
          soundEvent: 'crinkle',
          particles: [{ kind: 'sparkle', x: toy.x, y: toy.y, count: 7, color: 0xe6f2ff }],
        };
      }
      case 'spring_toy': {
        this.batToy(toy.id, Math.cos(awayAngle) * 370, Math.sin(awayAngle) * 370);
        return {
          toy,
          action: 'bat',
          title: label,
          subtitle: 'Boing! Coiled spring zig-zags away',
          soundEvent: 'chirp',
          particles: [{ kind: 'sparkle', x: toy.x, y: toy.y, count: 5, color: 0x7ef2d4 }],
        };
      }
      case 'ping_pong': {
        this.batToy(toy.id, Math.cos(awayAngle) * 510, Math.sin(awayAngle) * 510);
        return {
          toy,
          action: 'bat',
          title: label,
          subtitle: 'Crisp ricochet across the room',
          particles: [{ kind: 'dust', x: toy.x, y: toy.y }],
        };
      }
      case 'hair_tie': {
        this.batToy(toy.id, Math.cos(awayAngle) * 460, Math.sin(awayAngle) * 460);
        return {
          toy,
          action: 'bat',
          title: label,
          subtitle: 'Air-hockey glide across the floor',
          particles: [{ kind: 'sparkle', x: toy.x, y: toy.y, count: 4, color: 0xf4a8c8 }],
        };
      }
      case 'bubbles': {
        const popX = toy.x;
        const popY = toy.y;
        this.popBubble(toy.id);
        const fresh = this.spawnBubbles(popX, popY);
        return {
          toy,
          action: 'pop_and_spawn',
          title: label,
          subtitle: `Pop! Blew ${fresh.length} fresh iridescent bubbles`,
          soundEvent: 'bubble_pop',
          particles: [
            { kind: 'bubbles', x: popX, y: popY, count: 6 },
            { kind: 'ripple', x: popX, y: popY, color: 0x8ae9ff },
          ],
          spawnedToys: fresh,
        };
      }
      case 'cucumber': {
        const px = toy.x;
        const py = toy.y;
        this.consumeToy(toy.id);
        return {
          toy,
          action: 'dismiss',
          title: label,
          subtitle: 'Removed sneaky cucumber',
          particles: [{ kind: 'dust', x: px, y: py }],
        };
      }
      case 'paper_bag': {
        toy.rustleTimer = 1.0;
        return {
          toy,
          action: 'rustle',
          title: label,
          subtitle: 'Crinkle! Rustled the kraft paper bag',
          soundEvent: 'crinkle',
          particles: [
            { kind: 'dust', x: toy.x, y: toy.y },
            { kind: 'sparkle', x: toy.x, y: toy.y - 10, count: 4 },
          ],
        };
      }
      case 'taped_square': {
        toy.pulseTimer = 1.0;
        return {
          toy,
          action: 'pulse',
          title: label,
          subtitle: 'Cat trap ready — cats love sitting inside squares',
          particles: [{ kind: 'sparkle', x: toy.x, y: toy.y, count: 5, color: 0xf5e2b8 }],
        };
      }
    }
  }

  handlePointerClick(x: number, y: number): ToyClickResult | null {
    const hit = this.hitTestToy(x, y);
    if (!hit) {
      return null;
    }
    return this.clickToy(hit.id, x, y);
  }

  clearAll(): void {
    for (const toy of this.toys) {
      toy.active = false;
      toy.isCarriedByCatId = null;
    }
    this.toys = [];
  }

  clearToys(): void {
    this.clearAll();
  }

  update(dt: number, physics?: PhysicsWorld): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    this.simTime += safeDt;

    for (let i = this.toys.length - 1; i >= 0; i--) {
      const toy = this.toys[i];
      if (!toy.active || (toy.expiresAt !== null && this.simTime >= toy.expiresAt)) {
        toy.active = false;
        this.toys.splice(i, 1);
        this.events.push({
          type: 'expired',
          toyId: toy.id,
          kind: toy.kind,
          x: toy.x,
          y: toy.y,
          speed: 0,
          particles:
            toy.kind === 'bubbles'
              ? [{ kind: 'ripple', x: toy.x, y: toy.y, color: 0x8ae9ff }]
              : [],
        });
        continue;
      }

      if (toy.isCarriedByCatId !== null) {
        if (toy.kind === 'fish_toy') {
          toy.phase = (toy.phase ?? 0) + safeDt * 14;
        } else if (toy.kind === 'mouse_toy') {
          toy.phase = (toy.phase ?? 0) + safeDt * 10;
        }
        continue;
      }

      if (toy.kind === 'taped_square') {
        if (toy.pulseTimer > 0) {
          toy.pulseTimer = Math.max(0, toy.pulseTimer - safeDt);
        }
        continue;
      }

      if (toy.kind === 'bubbles') {
        this.stepBubble(toy, safeDt, i);
        continue;
      }

      if (toy.kind === 'feather_wand') {
        this.stepFeatherWand(toy, safeDt);
        continue;
      }

      this.stepFloorToy(toy, safeDt, physics);
    }
  }

  private stepBubble(toy: ToyRuntime, dt: number, indexInList: number): void {
    toy.phase = (toy.phase ?? 0) + dt * toy.swayFreq;
    const swayVx = Math.cos(toy.phase) * toy.swayAmp;
    toy.x += (swayVx + toy.vx * 0.35) * dt;
    toy.y += toy.vy * dt;
    toy.vx *= Math.exp(-1.5 * dt);

    const margin = toy.radius + 10;
    if (toy.x < margin) {
      toy.x = margin;
      toy.vx = Math.abs(toy.vx) * 0.7;
    } else if (toy.x > this.width - margin) {
      toy.x = this.width - margin;
      toy.vx = -Math.abs(toy.vx) * 0.7;
    }

    if (toy.y >= this.height - margin) {
      toy.active = false;
      this.toys.splice(indexInList, 1);
      this.events.push({
        type: 'pop',
        toyId: toy.id,
        kind: 'bubbles',
        x: toy.x,
        y: toy.y,
        speed: 0,
        soundEvent: 'bubble_pop',
        particles: [{ kind: 'ripple', x: toy.x, y: toy.y, color: 0x8ae9ff }],
      });
    }
  }

  private stepFeatherWand(toy: ToyRuntime, dt: number): void {
    toy.phase = (toy.phase ?? 0) + dt * toy.swayFreq;

    let targetX = toy.anchorX + 46 + Math.sin(toy.phase) * toy.swayAmp;
    let targetY = toy.anchorY - 36 + Math.cos(toy.phase * 1.4) * (toy.swayAmp * 0.45);

    if (this.cursorPos) {
      const distCursor = Math.hypot(this.cursorPos.x - toy.anchorX, this.cursorPos.y - toy.anchorY);
      if (distCursor <= 260) {
        const pull = 1 - distCursor / 260;
        const lureAngle = Math.atan2(this.cursorPos.y - toy.anchorY, this.cursorPos.x - toy.anchorX);
        const reach = clamp(distCursor * 0.48, 36, 92);
        const cursorTargetX = toy.anchorX + Math.cos(lureAngle) * reach;
        const cursorTargetY = toy.anchorY + Math.sin(lureAngle) * reach;
        targetX = targetX * (1 - pull * 0.75) + cursorTargetX * (pull * 0.75);
        targetY = targetY * (1 - pull * 0.75) + cursorTargetY * (pull * 0.75);
      }
    }

    const stiffness = 28;
    const damping = 5.4;
    const ax = (targetX - toy.x) * stiffness - toy.vx * damping;
    const ay = (targetY - toy.y) * stiffness - toy.vy * damping;
    toy.vx += ax * dt;
    toy.vy += ay * dt;
    toy.x = clamp(toy.x + toy.vx * dt, 24, this.width - 24);
    toy.y = clamp(toy.y + toy.vy * dt, 24, this.height - 24);
    toy.rotation = Math.atan2(toy.y - toy.anchorY, toy.x - toy.anchorX);
  }

  private stepFloorToy(toy: ToyRuntime, dt: number, physics?: PhysicsWorld): void {
    const spec = TOY_SPECS[toy.kind];

    if (toy.flopTimer > 0) {
      toy.flopTimer = Math.max(0, toy.flopTimer - dt);
      toy.phase = (toy.phase ?? 0) + dt * 20;
      if (Math.sin((toy.phase ?? 0) * 0.65) > 0.92) {
        const flopAngle = (toy.rotation ?? 0) + (Math.sin(this.simTime * 17) > 0 ? 1 : -1) * 0.65;
        toy.vx += Math.cos(flopAngle) * 45;
        toy.vy += Math.sin(flopAngle) * 45;
      }
    }

    if (toy.rustleTimer > 0) {
      toy.rustleTimer = Math.max(0, toy.rustleTimer - dt);
      toy.phase = (toy.phase ?? 0) + dt * 24;
    }

    const preSpeed = Math.hypot(toy.vx, toy.vy);

    // Crinkle balls & springs exhibit lively erratic motion while sliding fast
    if (toy.kind === 'crinkle_ball' && preSpeed > 65 && dt > 0) {
      const jitter = Math.sin(this.simTime * 27 + toy.colorVariant * 2.1) * 2.1 * dt;
      const cos = Math.cos(jitter);
      const sin = Math.sin(jitter);
      const nvx = toy.vx * cos - toy.vy * sin;
      const nvy = toy.vx * sin + toy.vy * cos;
      toy.vx = nvx;
      toy.vy = nvy;
    } else if (toy.kind === 'spring_toy' && preSpeed > 35 && dt > 0) {
      const spinStep = toy.spinVel * 0.22 * dt;
      const cos = Math.cos(spinStep);
      const sin = Math.sin(spinStep);
      const nvx = toy.vx * cos - toy.vy * sin;
      const nvy = toy.vx * sin + toy.vy * cos;
      toy.vx = nvx;
      toy.vy = nvy;
      toy.spinVel *= Math.exp(-1.1 * dt);
    }

    const dragFactor = Math.exp(-spec.dragRate * dt);
    toy.vx *= dragFactor;
    toy.vy *= dragFactor;

    const body: CircleBody = {
      x: toy.x + toy.vx * dt,
      y: toy.y + toy.vy * dt,
      vx: toy.vx,
      vy: toy.vy,
      radius: toy.radius,
    };

    let bounced = false;
    let impactSpeed = 0;

    if (physics) {
      if (spec.collidesWithWorld) {
        const obsRes = physics.resolveAllObstacles(body, spec.restitution);
        if (obsRes && obsRes.collided) {
          bounced = true;
          impactSpeed = Math.max(impactSpeed, obsRes.impactSpeed);
        }
      }
      const wallRes = physics.clampToBounds(body, spec.restitution);
      if (wallRes && wallRes.collided) {
        bounced = true;
        impactSpeed = Math.max(impactSpeed, wallRes.impactSpeed);
      }
    } else {
      const r = body.radius;
      const maxX = Math.max(r, this.width - r);
      const maxY = Math.max(r, this.height - r);
      if (body.x < r) {
        body.x = r;
        if (body.vx < 0) {
          impactSpeed = Math.max(impactSpeed, -body.vx);
          body.vx = -body.vx * spec.restitution;
          bounced = true;
        }
      } else if (body.x > maxX) {
        body.x = maxX;
        if (body.vx > 0) {
          impactSpeed = Math.max(impactSpeed, body.vx);
          body.vx = -body.vx * spec.restitution;
          bounced = true;
        }
      }
      if (body.y < r) {
        body.y = r;
        if (body.vy < 0) {
          impactSpeed = Math.max(impactSpeed, -body.vy);
          body.vy = -body.vy * spec.restitution;
          bounced = true;
        }
      } else if (body.y > maxY) {
        body.y = maxY;
        if (body.vy > 0) {
          impactSpeed = Math.max(impactSpeed, body.vy);
          body.vy = -body.vy * spec.restitution;
          bounced = true;
        }
      }
    }

    toy.x = body.x;
    toy.y = body.y;
    toy.vx = body.vx;
    toy.vy = body.vy;

    if (toy.kind === 'spring_toy' && bounced) {
      toy.spinVel = -toy.spinVel + (impactSpeed > 120 ? 6 : 2);
    }

    const postSpeed = Math.hypot(toy.vx, toy.vy);
    if (postSpeed > 4) {
      if (toy.kind === 'mouse_toy') {
        toy.rotation = Math.atan2(toy.vy, toy.vx);
        toy.phase = (toy.phase ?? 0) + dt * Math.min(24, 6 + postSpeed * 0.05);
      } else if (toy.kind === 'fish_toy') {
        toy.rotation = Math.atan2(toy.vy, toy.vx);
        toy.phase = (toy.phase ?? 0) + dt * 12;
      } else if (toy.kind === 'crinkle_ball' || toy.kind === 'ping_pong' || toy.kind === 'hair_tie') {
        toy.rotation = (toy.rotation ?? 0) + (postSpeed * dt) / Math.max(8, toy.radius);
      } else if (toy.kind === 'spring_toy') {
        toy.rotation = (toy.rotation ?? 0) + toy.spinVel * dt;
      }
    } else if (Math.abs(toy.vx) < 0.8 && Math.abs(toy.vy) < 0.8) {
      toy.vx = 0;
      toy.vy = 0;
    }

    if (bounced && impactSpeed > 130) {
      this.events.push({
        type: 'bounce',
        toyId: toy.id,
        kind: toy.kind,
        x: toy.x,
        y: toy.y,
        speed: impactSpeed,
        soundEvent: toy.kind === 'crinkle_ball' ? 'crinkle' : undefined,
        particles: [{ kind: 'dust', x: toy.x, y: toy.y }],
      });
    }
  }

  private resolveDropPoint(kind: ToyKind, x?: number, y?: number, seedOverride?: number): Vec2 {
    const spec = TOY_SPECS[kind];
    const margin = Math.max(36, spec.radius + 14);
    if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
      return {
        x: clamp(x, margin, Math.max(margin, this.width - margin)),
        y: clamp(y, margin, Math.max(margin, this.height - margin)),
      };
    }

    const idx = this.spawnCounter++;
    const seed = seedOverride ?? idx * 2.718 + this.simTime;
    const cx = this.width * 0.5;
    const cy = this.height * 0.52;
    const rx = Math.max(60, this.width * 0.24);
    const ry = Math.max(40, this.height * 0.22);
    const angle = idx * 2.39996 + seededUnit(seed) * 0.5;
    const scale = 0.35 + seededUnit(seed + 1) * 0.65;

    return {
      x: clamp(cx + Math.cos(angle) * rx * scale, margin, Math.max(margin, this.width - margin)),
      y: clamp(cy + Math.sin(angle) * ry * scale, margin, Math.max(margin, this.height - margin)),
    };
  }
}

interface ToyVisualEntry {
  kind: ToyKind;
  shadow: Graphics;
  body: Graphics;
}

const SPRING_PALETTE = [0x58dfc6, 0xff80b5, 0xffd166, 0x8fb8ff] as const;
const HAIR_TIE_PALETTE = [0xd66b88, 0x67a9d8, 0xa07cd4, 0xe89c5e] as const;

/**
 * PixiJS v8 ToyManager rendering top-down vector toys and delegating all simulation
 * and hit-testing to ToyWorld.
 */
export class ToyManager extends Container {
  readonly world: ToyWorld;
  readonly shadowsLayer: Container;
  readonly floorToysLayer: Container;
  readonly activeToysLayer: Container;

  private readonly visuals = new Map<string, ToyVisualEntry>();

  constructor(width = 1280, height = 720) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.world = new ToyWorld(width, height);

    this.shadowsLayer = new Container();
    this.shadowsLayer.eventMode = 'none';
    this.shadowsLayer.interactiveChildren = false;

    this.floorToysLayer = new Container();
    this.floorToysLayer.eventMode = 'none';
    this.floorToysLayer.interactiveChildren = false;

    this.activeToysLayer = new Container();
    this.activeToysLayer.eventMode = 'none';
    this.activeToysLayer.interactiveChildren = false;

    this.addChild(this.shadowsLayer, this.floorToysLayer, this.activeToysLayer);
  }

  attachLayersTo(
    shadowsTarget: Container,
    floorTarget: Container,
    toysTarget: Container,
  ): void {
    shadowsTarget.addChild(this.shadowsLayer);
    floorTarget.addChild(this.floorToysLayer);
    toysTarget.addChild(this.activeToysLayer);
  }

  resize(width: number, height: number): void {
    this.world.resize(width, height);
    this.syncVisuals();
  }

  setCursor(x: number, y: number, active = true): void {
    this.world.setCursor(x, y, active);
  }

  spawnToy(kind: ToyKind, x?: number, y?: number, options?: SpawnToyOptions): ToyEntityState {
    const toy = this.world.spawnToy(kind, x, y, options);
    this.syncVisuals();
    return toy;
  }

  spawnBubbles(x?: number, y?: number, count?: number): ToyEntityState[] {
    const bubbles = this.world.spawnBubbles(x, y, count);
    this.syncVisuals();
    return bubbles;
  }

  togglePaperBag(x?: number, y?: number): ToyEntityState | null {
    const bag = this.world.togglePaperBag(x, y);
    this.syncVisuals();
    return bag;
  }

  toggleTapedSquare(x?: number, y?: number): ToyEntityState | null {
    const sq = this.world.toggleTapedSquare(x, y);
    this.syncVisuals();
    return sq;
  }

  isPaperBagActive(): boolean {
    return this.world.isPaperBagActive();
  }

  isTapedSquareActive(): boolean {
    return this.world.isTapedSquareActive();
  }

  getToys(): readonly ToyEntityState[] {
    return this.world.getToys();
  }

  getToyById(toyId: string): ToyEntityState | null {
    return this.world.getToyById(toyId);
  }

  getToysByKind(kind: ToyKind): ToyEntityState[] {
    return this.world.getToysByKind(kind);
  }

  getScaryToys(): ToyEntityState[] {
    return this.world.getScaryToys();
  }

  getActiveCount(): number {
    return this.world.getActiveCount();
  }

  hitTestToy(x: number, y: number, extraPadding = 6): ToyEntityState | null {
    return this.world.hitTestToy(x, y, extraPadding);
  }

  containsPoint(x: number, y: number): boolean {
    return this.world.hitTestToy(x, y) !== null;
  }

  batToy(toyId: string, vx: number, vy: number, catId?: number): boolean {
    const ok = this.world.batToy(toyId, vx, vy, catId);
    if (ok) {
      this.syncVisuals();
    }
    return ok;
  }

  setToyCarried(toyId: string, catId: number | null, carryX?: number, carryY?: number): boolean {
    const ok = this.world.setToyCarried(toyId, catId, carryX, carryY);
    if (ok) {
      this.syncVisuals();
    }
    return ok;
  }

  updateCarriedToyPosition(toyId: string, x: number, y: number, rotation?: number): boolean {
    return this.world.updateCarriedToyPosition(toyId, x, y, rotation);
  }

  consumeToy(toyId: string): boolean {
    const ok = this.world.consumeToy(toyId);
    if (ok) {
      this.syncVisuals();
    }
    return ok;
  }

  popBubble(id: string, particles?: ParticleSystem): boolean {
    const ok = this.world.popBubble(id);
    if (ok) {
      this.flushEventsToParticles(particles);
      this.syncVisuals();
    }
    return ok;
  }

  handlePointerClick(x: number, y: number, particles?: ParticleSystem): ToyClickResult | null {
    const result = this.world.handlePointerClick(x, y);
    if (result) {
      if (particles) {
        for (const burst of result.particles) {
          particles.spawnPropBurst(burst);
        }
      }
      this.flushEventsToParticles(particles);
      this.syncVisuals();
    }
    return result;
  }

  clickToy(toyId: string, clickX?: number, clickY?: number, particles?: ParticleSystem): ToyClickResult | null {
    const result = this.world.clickToy(toyId, clickX, clickY);
    if (result) {
      if (particles) {
        for (const burst of result.particles) {
          particles.spawnPropBurst(burst);
        }
      }
      this.flushEventsToParticles(particles);
      this.syncVisuals();
    }
    return result;
  }

  clearAll(): void {
    this.world.clearAll();
    this.syncVisuals();
  }

  clearToys(): void {
    this.clearAll();
  }

  drainEvents(): ToySimulationEvent[] {
    return this.world.drainEvents();
  }

  update(dt: number, physics?: PhysicsWorld, particles?: ParticleSystem): void {
    this.world.update(dt, physics);
    this.flushEventsToParticles(particles);
    this.syncVisuals();
  }

  private flushEventsToParticles(particles?: ParticleSystem): void {
    const events = this.world.drainEvents();
    if (!particles || events.length === 0) {
      return;
    }
    for (const ev of events) {
      for (const burst of ev.particles) {
        particles.spawnPropBurst(burst);
      }
    }
  }

  private syncVisuals(): void {
    const runtimeToys = this.world.getRuntimeToys();
    const activeIds = new Set<string>();

    for (const toy of runtimeToys) {
      activeIds.add(toy.id);
      let entry = this.visuals.get(toy.id);
      if (!entry) {
        const shadow = new Graphics();
        const body = new Graphics();
        const isFloor = TOY_SPECS[toy.kind].isFloorFlat;
        this.shadowsLayer.addChild(shadow);
        (isFloor ? this.floorToysLayer : this.activeToysLayer).addChild(body);
        entry = { kind: toy.kind, shadow, body };
        this.visuals.set(toy.id, entry);
      }
      this.drawToy(toy, entry);
    }

    for (const [id, entry] of this.visuals.entries()) {
      if (!activeIds.has(id)) {
        entry.shadow.destroy();
        entry.body.destroy();
        this.visuals.delete(id);
      }
    }
  }

  private drawToy(toy: ToyRuntime, entry: ToyVisualEntry): void {
    const { shadow, body } = entry;
    shadow.clear();
    body.clear();

    const rot = toy.rotation ?? 0;
    const phase = toy.phase ?? 0;
    const t = this.world.getTime();

    // Fade gently in final 1.8s for timed toys (cucumber & bubbles)
    let alpha = 1;
    if (toy.expiresAt !== null) {
      const rem = toy.expiresAt - t;
      if (rem < 1.8) {
        alpha = clamp(rem / 1.8, 0.1, 1);
      }
    }
    body.alpha = alpha;
    shadow.alpha = alpha;

    if (toy.kind === 'taped_square') {
      shadow.visible = false;
      body.position.set(toy.x, toy.y);
      body.rotation = 0;
      this.drawTapedSquare(body, toy);
      return;
    }

    if (toy.kind === 'feather_wand') {
      shadow.visible = true;
      shadow.position.set(0, 0);
      body.position.set(0, 0);
      body.rotation = 0;
      this.drawFeatherWand(shadow, body, toy, phase);
      return;
    }

    shadow.visible = true;
    shadow.position.set(toy.x + 2.5, toy.y + 4);
    body.position.set(toy.x, toy.y);

    switch (toy.kind) {
      case 'mouse_toy':
        shadow.rotation = rot;
        body.rotation = rot;
        this.drawMouseToy(shadow, body, phase, t);
        break;
      case 'fish_toy':
        shadow.rotation = rot;
        body.rotation = rot;
        this.drawFishToy(shadow, body, phase, toy.flopTimer > 0);
        break;
      case 'crinkle_ball':
        shadow.rotation = rot;
        body.rotation = rot;
        this.drawCrinkleBall(shadow, body, toy.radius, phase);
        break;
      case 'spring_toy':
        shadow.rotation = rot;
        body.rotation = rot;
        this.drawSpringToy(shadow, body, toy.colorVariant);
        break;
      case 'ping_pong':
        shadow.rotation = 0;
        body.rotation = rot;
        this.drawPingPong(shadow, body, toy.radius);
        break;
      case 'hair_tie':
        shadow.rotation = rot;
        body.rotation = rot;
        this.drawHairTie(shadow, body, toy.radius, toy.colorVariant);
        break;
      case 'bubbles':
        shadow.position.set(toy.x + 6, toy.y + 18);
        shadow.rotation = 0;
        body.rotation = 0;
        this.drawBubble(shadow, body, toy.radius, phase);
        break;
      case 'cucumber':
        shadow.rotation = rot;
        body.rotation = rot;
        this.drawCucumber(shadow, body);
        break;
      case 'paper_bag': {
        const rustle = toy.rustleTimer > 0 ? Math.sin(phase) * 0.045 : 0;
        shadow.rotation = rot + rustle;
        body.rotation = rot + rustle;
        this.drawPaperBag(shadow, body);
        break;
      }
    }
  }

  private drawMouseToy(shadow: Graphics, body: Graphics, phase: number, time: number): void {
    shadow.ellipse(0, 0, 14, 9).fill({ color: 0x22140b, alpha: 0.22 });

    // Wiggly braided string tail
    const w1 = Math.sin(phase) * 4.5;
    const w2 = Math.sin(phase - 1.3) * 6.5;
    body
      .moveTo(-10, 0)
      .quadraticCurveTo(-18, w1, -25, w2)
      .stroke({ width: 2.2, color: 0xd9cfc7, cap: 'round' })
      .moveTo(-10, 0)
      .quadraticCurveTo(-18, w1, -25, w2)
      .stroke({ width: 0.9, color: 0xf4ede7, alpha: 0.7, cap: 'round' });

    // Teardrop felt mouse body (+x is nose)
    body
      .moveTo(13, 0)
      .bezierCurveTo(9, -8.5, -6, -9.5, -11, 0)
      .bezierCurveTo(-6, 9.5, 9, 8.5, 13, 0)
      .closePath()
      .fill({ color: 0x9b908c })
      .stroke({ width: 1.2, color: 0x5c5350, alpha: 0.75 });

    // Soft plush back highlight
    body
      .ellipse(-1, -1.5, 7.5, 4.2)
      .fill({ color: 0xc2b8b3, alpha: 0.55 });

    // Rounded pink-lined felt ears
    body
      .circle(2.5, -6.5, 4.2)
      .fill({ color: 0x8f8480 })
      .circle(2.8, -6.5, 2.3)
      .fill({ color: 0xe6a5a7 })
      .circle(2.5, 6.5, 4.2)
      .fill({ color: 0x8f8480 })
      .circle(2.8, 6.5, 2.3)
      .fill({ color: 0xe6a5a7 });

    // Bead eyes & stitched coral nose
    body
      .circle(7.8, -2.6, 1.3)
      .fill({ color: 0x241d1a })
      .circle(7.8, 2.6, 1.3)
      .fill({ color: 0x241d1a })
      .circle(12.6, 0, 2.1)
      .fill({ color: 0xe67b82 });

    // Subtle herbal catnip shimmer specks
    const shimmer = 0.45 + 0.35 * Math.sin(time * 4.2);
    body
      .circle(-2, -3.5, 1.2)
      .fill({ color: 0x85c473, alpha: shimmer })
      .circle(1, 3.8, 1.1)
      .fill({ color: 0x98d686, alpha: shimmer * 0.9 });
  }

  private drawFishToy(shadow: Graphics, body: Graphics, phase: number, flopping: boolean): void {
    const bend = Math.sin(phase) * (flopping ? 5.2 : 1.4);
    shadow.ellipse(0, 0, 17, 9).fill({ color: 0x22140b, alpha: 0.22 });

    // Forked tail fin articulated by bend
    body
      .moveTo(-10, bend * 0.35)
      .lineTo(-19, -7 + bend)
      .lineTo(-15.5, bend * 0.85)
      .lineTo(-19, 7 + bend)
      .closePath()
      .fill({ color: 0xf29568 })
      .stroke({ width: 1.1, color: 0x8c3c24, alpha: 0.7 });

    // Pectoral side fins
    body
      .ellipse(2, -7.5, 4.5, 2.6)
      .fill({ color: 0xf6ac7f, alpha: 0.92 })
      .ellipse(2, 7.5, 4.5, 2.6)
      .fill({ color: 0xf6ac7f, alpha: 0.92 });

    // Streamlined striped fish body
    body
      .moveTo(15, 0)
      .bezierCurveTo(9, -9, -5, -8 + bend * 0.25, -11, bend * 0.35)
      .bezierCurveTo(-5, 8 + bend * 0.25, 9, 9, 15, 0)
      .closePath()
      .fill({ color: 0xe86e48 })
      .stroke({ width: 1.2, color: 0x7d321c, alpha: 0.8 });

    // Vibrant cream stripes
    body
      .moveTo(4, -6.2)
      .quadraticCurveTo(2, 0, 4, 6.2)
      .moveTo(-2.5, -5.5 + bend * 0.1)
      .quadraticCurveTo(-4.2, bend * 0.15, -2.5, 5.5 + bend * 0.1)
      .stroke({ width: 2.3, color: 0xfbe5ca, alpha: 0.92, cap: 'round' });

    // Expressive eye + catchlight
    body
      .circle(9.2, -2.4, 2.1)
      .fill({ color: 0xfff8f0 })
      .circle(9.6, -2.4, 1.2)
      .fill({ color: 0x1e1815 })
      .circle(10.0, -2.9, 0.45)
      .fill({ color: 0xffffff });
  }

  private drawFeatherWand(
    shadow: Graphics,
    body: Graphics,
    toy: ToyRuntime,
    phase: number,
  ): void {
    const ax = toy.anchorX;
    const ay = toy.anchorY;
    const lx = toy.x;
    const ly = toy.y;
    const ctrlX = (ax + lx) * 0.5 + Math.sin(phase * 0.8) * 14;
    const ctrlY = (ay + ly) * 0.5 - 22;

    // Wand & feather shadow
    shadow
      .moveTo(ax + 3, ay + 5)
      .quadraticCurveTo(ctrlX + 3, ctrlY + 7, lx + 4, ly + 8)
      .stroke({ width: 3.5, color: 0x22140b, alpha: 0.16, cap: 'round' })
      .ellipse(lx + 4, ly + 8, 15, 9)
      .fill({ color: 0x22140b, alpha: 0.18 });

    // Flexible fiberglass rod
    body
      .moveTo(ax, ay)
      .quadraticCurveTo(ctrlX, ctrlY, lx, ly)
      .stroke({ width: 2.4, color: 0xd9cbb8, alpha: 0.92, cap: 'round' });

    // Wooden handle grip
    const handleAngle = Math.atan2(ctrlY - ay, ctrlX - ax);
    const hx = ax + Math.cos(handleAngle) * 20;
    const hy = ay + Math.sin(handleAngle) * 20;
    body
      .moveTo(ax, ay)
      .lineTo(hx, hy)
      .stroke({ width: 5.5, color: 0x9b6840, cap: 'round' })
      .moveTo(ax, ay)
      .lineTo(hx, hy)
      .stroke({ width: 2.4, color: 0xc99668, alpha: 0.7, cap: 'round' });

    // Brass swivel ring
    body
      .circle(lx, ly, 3.2)
      .fill({ color: 0xf0c96d })
      .stroke({ width: 1, color: 0x8c6723 });

    // 3 fluttering layered feathers
    const baseAngle = Math.atan2(ly - ctrlY, lx - ctrlX);
    const featherColors = [0x38b5a9, 0xeb6e66, 0xf2ba4e];
    const offsets = [-0.42, 0, 0.42];
    for (let i = 0; i < 3; i++) {
      const ang = baseAngle + offsets[i] + Math.sin(phase * 2.1 + i * 1.1) * 0.12;
      const tipX = lx + Math.cos(ang) * 20;
      const tipY = ly + Math.sin(ang) * 20;
      const px = -Math.sin(ang) * 5.2;
      const py = Math.cos(ang) * 5.2;
      const midX = lx + Math.cos(ang) * 10;
      const midY = ly + Math.sin(ang) * 10;

      body
        .moveTo(lx, ly)
        .quadraticCurveTo(midX + px, midY + py, tipX, tipY)
        .quadraticCurveTo(midX - px, midY - py, lx, ly)
        .closePath()
        .fill({ color: featherColors[i], alpha: 0.92 })
        .moveTo(lx, ly)
        .lineTo(tipX * 0.96 + lx * 0.04, tipY * 0.96 + ly * 0.04)
        .stroke({ width: 0.9, color: 0xfff8ed, alpha: 0.72 });
    }
  }

  private drawCrinkleBall(shadow: Graphics, body: Graphics, radius: number, phase: number): void {
    shadow.circle(0, 0, radius * 0.95).fill({ color: 0x22140b, alpha: 0.22 });

    const pts: Vec2[] = [];
    const sides = 8;
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const r = radius * (i % 2 === 0 ? 1.05 : 0.84);
      pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
    }

    const facetPalette = [0xc9d7eb, 0xe8c9de, 0x9ab3d4, 0xf7e8c9, 0xb5d6e6, 0xdad0ec, 0xa8c2e0, 0xf2d9c9];
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      body
        .poly([0, 0, pts[i].x, pts[i].y, pts[next].x, pts[next].y], true)
        .fill({ color: facetPalette[i], alpha: 0.92 })
        .stroke({ width: 0.9, color: 0xffffff, alpha: 0.65 });
    }

    // Specular foil glint
    const glint = 0.65 + 0.35 * Math.sin(phase * 3);
    body
      .star(-2.5, -2.5, 4, 4.5, 1.4, 0.3)
      .fill({ color: 0xffffff, alpha: glint });
  }

  private drawSpringToy(shadow: Graphics, body: Graphics, variant: number): void {
    const color = SPRING_PALETTE[variant % SPRING_PALETTE.length];
    shadow.ellipse(0, 0, 15, 9).fill({ color: 0x22140b, alpha: 0.2 });

    for (let i = -1.5; i <= 1.5; i += 1) {
      const cx = i * 5.2;
      body
        .ellipse(cx, 0, 4.6, 8.6)
        .stroke({ width: 3.1, color: 0x2d3540, alpha: 0.35 })
        .ellipse(cx, 0, 4.6, 8.6)
        .stroke({ width: 2.2, color, alpha: 0.95 })
        .ellipse(cx - 0.6, -1, 3.6, 7.2)
        .stroke({ width: 0.9, color: 0xffffff, alpha: 0.55 });
    }
  }

  private drawPingPong(shadow: Graphics, body: Graphics, radius: number): void {
    shadow.circle(0, 0, radius * 0.95).fill({ color: 0x22140b, alpha: 0.22 });

    body
      .circle(0, 0, radius)
      .fill({ color: 0xfff8ea })
      .stroke({ width: 1.2, color: 0xd8c3a5, alpha: 0.85 });

    // Subtle orange equator seam + specular catchlight
    body
      .moveTo(-radius * 0.82, 0)
      .quadraticCurveTo(0, radius * 0.36, radius * 0.82, 0)
      .stroke({ width: 1.4, color: 0xf29a42, alpha: 0.72 })
      .circle(-radius * 0.34, -radius * 0.34, radius * 0.26)
      .fill({ color: 0xffffff, alpha: 0.85 });
  }

  private drawHairTie(shadow: Graphics, body: Graphics, radius: number, variant: number): void {
    const color = HAIR_TIE_PALETTE[variant % HAIR_TIE_PALETTE.length];
    shadow.circle(0, 0, radius * 0.95).fill({ color: 0x22140b, alpha: 0.18 });

    body
      .circle(0, 0, radius * 0.85)
      .stroke({ width: 4.4, color, alpha: 0.95 })
      .circle(0, 0, radius * 0.85)
      .stroke({ width: 1.3, color: 0xffffff, alpha: 0.38 });

    // Tiny brushed metallic clasp
    body
      .roundRect(radius * 0.65, -2.6, 4.4, 5.2, 1.2)
      .fill({ color: 0xe6ecf2 })
      .stroke({ width: 0.8, color: 0x768291 });
  }

  private drawBubble(shadow: Graphics, body: Graphics, radius: number, phase: number): void {
    shadow.ellipse(0, 0, radius * 0.72, radius * 0.48).fill({ color: 0x22140b, alpha: 0.08 });

    const wobbleX = 1 + Math.sin(phase * 1.9) * 0.05;
    const wobbleY = 1 - Math.sin(phase * 1.9) * 0.05;
    body.scale.set(wobbleX, wobbleY);

    body
      .circle(0, 0, radius)
      .fill({ color: 0xe8f9ff, alpha: 0.2 })
      .stroke({ width: 1.35, color: 0xbaf0ff, alpha: 0.78 });

    // Iridescent cyan & pink rim arcs
    body
      .arc(0, 0, radius - 1.2, -2.5, -0.8)
      .stroke({ width: 1.4, color: 0x7ae8ff, alpha: 0.7, cap: 'round' })
      .arc(0, 0, radius - 1.2, 0.5, 2.0)
      .stroke({ width: 1.4, color: 0xffa6e0, alpha: 0.65, cap: 'round' });

    // Window reflection glint
    body
      .circle(-radius * 0.36, -radius * 0.36, radius * 0.24)
      .fill({ color: 0xffffff, alpha: 0.82 })
      .circle(radius * 0.34, radius * 0.38, radius * 0.1)
      .fill({ color: 0xffffff, alpha: 0.55 });
  }

  private drawCucumber(shadow: Graphics, body: Graphics): void {
    shadow.ellipse(0, 0, 24, 9).fill({ color: 0x22140b, alpha: 0.24 });

    body
      .moveTo(-22, 1)
      .bezierCurveTo(-18, -9, 16, -9.5, 22, -1)
      .bezierCurveTo(18, 8.5, -16, 8, -22, 1)
      .closePath()
      .fill({ color: 0x3b7338 })
      .stroke({ width: 1.3, color: 0x20421f, alpha: 0.88 });

    // Longitudinal lighter green stripes & subtle skin bumps
    body
      .moveTo(-16, -2.5)
      .quadraticCurveTo(0, -4.5, 16, -2)
      .stroke({ width: 2.0, color: 0x62a452, alpha: 0.72, cap: 'round' })
      .moveTo(-14, 2.4)
      .quadraticCurveTo(0, 1.4, 15, 2.2)
      .stroke({ width: 1.4, color: 0x295427, alpha: 0.7, cap: 'round' });

    const bumps: readonly [number, number][] = [
      [-12, -3.5],
      [-3, -5],
      [7, -3.8],
      [-7, 3.2],
      [4, 3.5],
      [13, 1.5],
    ];
    for (const [bx, by] of bumps) {
      body.circle(bx, by, 1.15).fill({ color: 0x82c46c, alpha: 0.8 });
    }

    // Stem nub
    body
      .circle(-21.5, 0.8, 2.4)
      .fill({ color: 0x7ea65e })
      .stroke({ width: 0.8, color: 0x345229 });
  }

  private drawTapedSquare(body: Graphics, toy: ToyRuntime): void {
    const half = toy.radius;
    const tapeW = 10;
    const pulse = toy.pulseTimer > 0 ? 0.15 + 0.15 * Math.sin(this.world.getTime() * 14) : 0;
    const tapeColor = 0xf0e1be;
    const borderColor = 0xcbb688;

    if (pulse > 0) {
      body
        .roundRect(-half - 4, -half - 4, (half + 4) * 2, (half + 4) * 2, 6)
        .stroke({ width: 2, color: 0xffe49e, alpha: pulse * 2.2 });
    }

    const strips: readonly [number, number, number, number][] = [
      [-half - 4, -half - tapeW * 0.5, half * 2 + 8, tapeW],
      [-half - 4, half - tapeW * 0.5, half * 2 + 8, tapeW],
      [-half - tapeW * 0.5, -half - 4, tapeW, half * 2 + 8],
      [half - tapeW * 0.5, -half - 4, tapeW, half * 2 + 8],
    ];

    for (const [sx, sy, sw, sh] of strips) {
      body
        .rect(sx + 1, sy + 1.5, sw, sh)
        .fill({ color: 0x22140b, alpha: 0.08 })
        .rect(sx, sy, sw, sh)
        .fill({ color: tapeColor, alpha: 0.88 })
        .stroke({ width: 0.9, color: borderColor, alpha: 0.72 });
    }
  }

  private drawPaperBag(shadow: Graphics, body: Graphics): void {
    shadow.roundRect(-30, -24, 62, 48, 8).fill({ color: 0x22140b, alpha: 0.24 });

    // Kraft paper bag body lying on its side (opening faces +x)
    body
      .roundRect(-30, -23, 56, 46, 6)
      .fill({ color: 0xc7955d })
      .stroke({ width: 1.4, color: 0x6f4b27, alpha: 0.82 });

    // Crinkle folds
    body
      .moveTo(-24, -12)
      .lineTo(14, -8)
      .moveTo(-22, 9)
      .lineTo(12, 13)
      .stroke({ width: 1.2, color: 0xa67441, alpha: 0.7, cap: 'round' });

    // Dark cozy interior opening at +x side
    body
      .ellipse(22, 0, 10, 21)
      .fill({ color: 0x573a20 })
      .stroke({ width: 1.8, color: 0xdba972, alpha: 0.95 });

    // Folded serrated cuff lip
    body
      .moveTo(15, -22)
      .lineTo(18, -17)
      .lineTo(14, -12)
      .lineTo(18, -6)
      .lineTo(14, 0)
      .lineTo(18, 6)
      .lineTo(14, 12)
      .lineTo(18, 17)
      .lineTo(15, 22)
      .stroke({ width: 1.5, color: 0x8b5f35, alpha: 0.85, join: 'round' });
  }

  override destroy(): void {
    for (const entry of this.visuals.values()) {
      entry.shadow.destroy();
      entry.body.destroy();
    }
    this.visuals.clear();
    this.shadowsLayer.destroy({ children: true });
    this.floorToysLayer.destroy({ children: true });
    this.activeToysLayer.destroy({ children: true });
    super.destroy({ children: true });
  }
}
