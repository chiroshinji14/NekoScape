import { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { PropParticleBurst } from '../types/simulation';

type ParticleKind =
  | 'star'
  | 'dust'
  | 'heart'
  | 'ring'
  | 'sleepZ'
  | 'bubble'
  | 'scratch'
  | 'musicNote'
  | 'sparkle'
  | 'droplet'
  | 'crumb'
  | 'chimeRing'
  | 'steam'
  | 'petal'
  | 'exclaim';

interface ParticleSlot {
  active: boolean;
  kind: ParticleKind;
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  drag: number;
  rotation: number;
  vRot: number;
  startScale: number;
  endScale: number;
  alphaPeak: number;
  age: number;
  life: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
}

/**
 * Object-pooled PixiJS v8 vector particle emitter using shared GraphicsContext
 * geometries so per-frame updates incur zero geometry allocations or GC churn.
 */
export class ParticleSystem extends Container {
  private readonly pool: ParticleSlot[] = [];
  private readonly contexts: Record<ParticleKind, GraphicsContext>;
  private poolCursor = 0;

  constructor(poolSize = 260) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.contexts = {
      star: new GraphicsContext()
        .star(0, 0, 4, 7.5, 2.8, 0)
        .fill({ color: 0xffd269, alpha: 1 })
        .stroke({ width: 1, color: 0xfff5db, alpha: 0.9 })
        .circle(0, 0, 2)
        .fill({ color: 0xfff9ea, alpha: 0.95 }),

      dust: new GraphicsContext()
        .circle(0, 0, 6.5)
        .fill({ color: 0xf0e3d3, alpha: 0.85 })
        .circle(-1.5, -1.5, 3.2)
        .fill({ color: 0xfbf4ea, alpha: 0.4 }),

      heart: new GraphicsContext()
        .moveTo(0, 3.4)
        .bezierCurveTo(-5.2, -0.4, -5.2, -5.2, 0, -2.4)
        .bezierCurveTo(5.2, -5.2, 5.2, -0.4, 0, 3.4)
        .closePath()
        .fill({ color: 0xeb7a72, alpha: 0.95 }),

      ring: new GraphicsContext()
        .circle(0, 0, 6)
        .stroke({ width: 1.4, color: 0xf2bc74, alpha: 0.9 }),

      sleepZ: new GraphicsContext()
        .moveTo(-4, -4.5)
        .lineTo(4, -4.5)
        .lineTo(-4, 4.5)
        .lineTo(4, 4.5)
        .stroke({ width: 1.7, color: 0xf4eadf, alpha: 0.92, cap: 'round', join: 'round' }),

      bubble: new GraphicsContext()
        .circle(0, 0, 4.2)
        .fill({ color: 0xf2e8dc, alpha: 0.25 })
        .stroke({ width: 1, color: 0xf6ece1, alpha: 0.65 })
        .circle(-1.3, -1.3, 1.1)
        .fill({ color: 0xfbf4ec, alpha: 0.75 }),

      scratch: new GraphicsContext()
        .moveTo(-6.5, -2.8)
        .quadraticCurveTo(0, -4.0, 6.5, -1.3)
        .moveTo(-5.5, 2.1)
        .quadraticCurveTo(0.4, 0.9, 6.0, 3.4)
        .stroke({ width: 1.75, color: 0xfbf0db, alpha: 0.96, cap: 'round' })
        .moveTo(-5.0, -2.3)
        .quadraticCurveTo(0.2, -3.2, 5.2, -1.1)
        .moveTo(-4.2, 2.3)
        .quadraticCurveTo(0.4, 1.3, 4.8, 3.2)
        .stroke({ width: 1.0, color: 0xda9b4a, alpha: 0.9, cap: 'round' })
        .circle(6.8, 0.8, 1.2)
        .fill({ color: 0xf4d198, alpha: 0.92 }),

      musicNote: new GraphicsContext()
        .ellipse(-2.1, 3.2, 3.1, 2.2)
        .fill({ color: 0xffffff, alpha: 0.96 })
        .moveTo(0.7, 2.6)
        .lineTo(0.7, -5.8)
        .quadraticCurveTo(4.4, -4.8, 4.8, -1.6)
        .stroke({ width: 1.65, color: 0xffffff, alpha: 0.96, cap: 'round', join: 'round' }),

      sparkle: new GraphicsContext()
        .moveTo(0, -6.2)
        .quadraticCurveTo(0.9, -0.9, 6.2, 0)
        .quadraticCurveTo(0.9, 0.9, 0, 6.2)
        .quadraticCurveTo(-0.9, 0.9, -6.2, 0)
        .quadraticCurveTo(-0.9, -0.9, 0, -6.2)
        .closePath()
        .fill({ color: 0xffffff, alpha: 0.96 }),

      droplet: new GraphicsContext()
        .moveTo(0, -5.2)
        .bezierCurveTo(3.4, -0.5, 3.4, 4.2, 0, 4.2)
        .bezierCurveTo(-3.4, 4.2, -3.4, -0.5, 0, -5.2)
        .closePath()
        .fill({ color: 0x72c6e8, alpha: 0.92 })
        .circle(-0.9, 0.8, 1.1)
        .fill({ color: 0xeaf8ff, alpha: 0.85 }),

      crumb: new GraphicsContext()
        .roundRect(-2.6, -2.0, 5.2, 4.0, 1.4)
        .fill({ color: 0xd99652, alpha: 0.96 })
        .circle(-0.8, -0.5, 0.9)
        .fill({ color: 0xf3cb92, alpha: 0.8 }),

      chimeRing: new GraphicsContext()
        .circle(0, 0, 7.5)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 }),

      steam: new GraphicsContext()
        .moveTo(-1, 5.5)
        .quadraticCurveTo(-4, 1.5, 0.5, -1.5)
        .quadraticCurveTo(4, -4.5, 0, -8)
        .stroke({ width: 2.0, color: 0xf9f1e7, alpha: 0.72, cap: 'round' }),

      petal: new GraphicsContext()
        .moveTo(0, -4.4)
        .bezierCurveTo(3.6, -3.6, 3.8, 2.2, 0, 4.4)
        .bezierCurveTo(-3.8, 2.2, -3.6, -3.6, 0, -4.4)
        .closePath()
        .fill({ color: 0xffffff, alpha: 0.92 }),

      exclaim: new GraphicsContext()
        .moveTo(0, -5.8)
        .lineTo(0, 0.8)
        .stroke({ width: 2.1, color: 0xffd166, alpha: 0.96, cap: 'round' })
        .circle(0, 3.8, 1.35)
        .fill({ color: 0xffd166, alpha: 0.96 }),
    };

    const count = Math.max(32, poolSize);
    for (let i = 0; i < count; i++) {
      const gfx = new Graphics({ context: this.contexts.dust });
      gfx.visible = false;
      this.addChild(gfx);

      this.pool.push({
        active: false,
        kind: 'dust',
        gfx,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        drag: 0.94,
        rotation: 0,
        vRot: 0,
        startScale: 1,
        endScale: 1,
        alphaPeak: 1,
        age: 0,
        life: 0.5,
        wobbleAmp: 0,
        wobbleFreq: 0,
        wobblePhase: 0,
      });
    }
  }

  private acquire(kind: ParticleKind): ParticleSlot {
    const len = this.pool.length;
    for (let i = 0; i < len; i++) {
      const idx = (this.poolCursor + i) % len;
      const slot = this.pool[idx];
      if (!slot.active) {
        this.poolCursor = (idx + 1) % len;
        this.prepareSlot(slot, kind);
        return slot;
      }
    }

    // Recycle oldest cursor slot if saturated
    const slot = this.pool[this.poolCursor];
    this.poolCursor = (this.poolCursor + 1) % len;
    this.prepareSlot(slot, kind);
    return slot;
  }

  private prepareSlot(slot: ParticleSlot, kind: ParticleKind): void {
    slot.active = true;
    slot.kind = kind;
    slot.gfx.context = this.contexts[kind];
    slot.gfx.visible = true;
    slot.gfx.tint = 0xffffff;
    slot.age = 0;
    slot.ax = 0;
    slot.ay = 0;
    slot.drag = 0.94;
    slot.rotation = 0;
    slot.vRot = 0;
    slot.wobbleAmp = 0;
    slot.wobbleFreq = 0;
    slot.wobblePhase = 0;
  }

  spawnBonkBurst(x: number, y: number): void {
    const starCount = 5;
    for (let i = 0; i < starCount; i++) {
      const angle = (i / starCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const speed = 75 + Math.random() * 75;
      const slot = this.acquire('star');
      slot.x = x + Math.cos(angle) * 4;
      slot.y = y + Math.sin(angle) * 4;
      slot.vx = Math.cos(angle) * speed;
      slot.vy = Math.sin(angle) * speed - 18;
      slot.ay = 65;
      slot.drag = 0.9;
      slot.rotation = Math.random() * Math.PI;
      slot.vRot = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 5);
      slot.startScale = 0.75 + Math.random() * 0.4;
      slot.endScale = 0.25;
      slot.alphaPeak = 0.98;
      slot.life = 0.48 + Math.random() * 0.16;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
      slot.gfx.alpha = slot.alphaPeak;
    }

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 35 + Math.random() * 48;
      const slot = this.acquire('dust');
      slot.x = x + Math.cos(angle) * 5;
      slot.y = y + Math.sin(angle) * 5;
      slot.vx = Math.cos(angle) * speed;
      slot.vy = Math.sin(angle) * speed;
      slot.drag = 0.88;
      slot.startScale = 0.55 + Math.random() * 0.35;
      slot.endScale = 1.45 + Math.random() * 0.4;
      slot.alphaPeak = 0.62;
      slot.life = 0.42 + Math.random() * 0.18;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
      slot.gfx.alpha = slot.alphaPeak;
    }
  }

  spawnPurr(x: number, y: number): void {
    const heart = this.acquire('heart');
    heart.x = x + (Math.random() - 0.5) * 18;
    heart.y = y - 10 + (Math.random() - 0.5) * 8;
    heart.vx = (Math.random() - 0.5) * 14;
    heart.vy = -28 - Math.random() * 14;
    heart.drag = 0.98;
    heart.rotation = (Math.random() - 0.5) * 0.25;
    heart.vRot = (Math.random() - 0.5) * 0.6;
    heart.startScale = 0.65;
    heart.endScale = 1.15;
    heart.alphaPeak = 0.9;
    heart.life = 0.95 + Math.random() * 0.25;
    heart.wobbleAmp = 10;
    heart.wobbleFreq = 4.2;
    heart.wobblePhase = Math.random() * Math.PI * 2;
    heart.gfx.position.set(heart.x, heart.y);
    heart.gfx.scale.set(heart.startScale);

    if (Math.random() < 0.45) {
      const ring = this.acquire('ring');
      ring.x = x;
      ring.y = y;
      ring.vx = 0;
      ring.vy = -6;
      ring.drag = 0.99;
      ring.startScale = 0.6;
      ring.endScale = 2.4;
      ring.alphaPeak = 0.45;
      ring.life = 0.7;
      ring.gfx.position.set(ring.x, ring.y);
      ring.gfx.scale.set(ring.startScale);
    }
  }

  spawnHeartBurst(x: number, y: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      const heart = this.acquire('heart');
      const spread = (i - (count - 1) * 0.5) * 0.48 + (Math.random() - 0.5) * 0.22;
      heart.x = x + spread * 16;
      heart.y = y - 8 + (Math.random() - 0.5) * 6;
      heart.vx = Math.sin(spread) * 26;
      heart.vy = -34 - Math.random() * 16;
      heart.drag = 0.96;
      heart.rotation = spread * 0.35;
      heart.vRot = (Math.random() - 0.5) * 0.7;
      heart.startScale = 0.58 + Math.random() * 0.22;
      heart.endScale = 1.18;
      heart.alphaPeak = 0.94;
      heart.life = 0.95 + Math.random() * 0.3;
      heart.wobbleAmp = 8;
      heart.wobbleFreq = 4.4;
      heart.wobblePhase = i * 1.4;
      heart.gfx.position.set(heart.x, heart.y);
      heart.gfx.scale.set(heart.startScale);
    }
  }

  spawnMusicNotes(x: number, y: number, count = 2): void {
    const tints = [0xf5a962, 0xee8572, 0xf7d070];
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('musicNote');
      slot.gfx.tint = tints[i % tints.length];
      slot.x = x + (i - (count - 1) * 0.5) * 14 + (Math.random() - 0.5) * 6;
      slot.y = y - 10;
      slot.vx = (Math.random() - 0.5) * 18;
      slot.vy = -30 - Math.random() * 14;
      slot.drag = 0.97;
      slot.rotation = (Math.random() - 0.5) * 0.25;
      slot.vRot = (Math.random() - 0.5) * 0.55;
      slot.startScale = 0.68;
      slot.endScale = 1.1;
      slot.alphaPeak = 0.94;
      slot.life = 0.95 + Math.random() * 0.25;
      slot.wobbleAmp = 9;
      slot.wobbleFreq = 4.8;
      slot.wobblePhase = i * 2.1 + Math.random();
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
    }
  }

  spawnCatnipSparkles(x: number, y: number, count = 7): void {
    const tints = [0x8cd99a, 0xc9f2b8, 0xf7df8b, 0x6ec488];
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('sparkle');
      slot.gfx.tint = tints[i % tints.length];
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 22 + Math.random() * 38;
      slot.x = x + Math.cos(ang) * 6;
      slot.y = y + Math.sin(ang) * 6;
      slot.vx = Math.cos(ang) * speed;
      slot.vy = Math.sin(ang) * speed - 18;
      slot.drag = 0.93;
      slot.rotation = Math.random() * Math.PI;
      slot.vRot = (Math.random() > 0.5 ? 1 : -1) * (2.5 + Math.random() * 3.5);
      slot.startScale = 0.48 + Math.random() * 0.35;
      slot.endScale = 1.05;
      slot.alphaPeak = 0.92;
      slot.life = 0.72 + Math.random() * 0.38;
      slot.wobbleAmp = 6;
      slot.wobbleFreq = 5.2;
      slot.wobblePhase = Math.random() * Math.PI * 2;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
    }
  }

  spawnGroomSparkle(x: number, y: number): void {
    const slot = this.acquire('sparkle');
    slot.gfx.tint = 0xfff0c2;
    slot.x = x + (Math.random() - 0.5) * 14;
    slot.y = y - 6 + (Math.random() - 0.5) * 10;
    slot.vx = (Math.random() - 0.5) * 12;
    slot.vy = -18 - Math.random() * 10;
    slot.drag = 0.96;
    slot.rotation = Math.random() * Math.PI * 0.5;
    slot.vRot = 2.2;
    slot.startScale = 0.4;
    slot.endScale = 0.92;
    slot.alphaPeak = 0.88;
    slot.life = 0.55 + Math.random() * 0.22;
    slot.gfx.position.set(slot.x, slot.y);
    slot.gfx.scale.set(slot.startScale);
  }

  spawnWaterSplash(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('droplet');
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const speed = 38 + Math.random() * 48;
      slot.x = x + Math.cos(ang) * 4;
      slot.y = y + Math.sin(ang) * 4;
      slot.vx = Math.cos(ang) * speed;
      slot.vy = Math.sin(ang) * speed - 30;
      slot.ay = 145;
      slot.drag = 0.94;
      slot.rotation = ang + Math.PI * 0.5;
      slot.startScale = 0.58 + Math.random() * 0.34;
      slot.endScale = 0.28;
      slot.alphaPeak = 0.92;
      slot.life = 0.44 + Math.random() * 0.2;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
    }

    this.spawnChimeRipple(x, y, 0x9ce2f5);
  }

  spawnKibbleCrumbs(x: number, y: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('crumb');
      const ang = Math.random() * Math.PI * 2;
      const speed = 28 + Math.random() * 42;
      slot.x = x + (Math.random() - 0.5) * 6;
      slot.y = y + (Math.random() - 0.5) * 6;
      slot.vx = Math.cos(ang) * speed;
      slot.vy = Math.sin(ang) * speed - 22;
      slot.ay = 140;
      slot.drag = 0.91;
      slot.rotation = Math.random() * Math.PI;
      slot.vRot = (Math.random() - 0.5) * 9;
      slot.startScale = 0.72 + Math.random() * 0.35;
      slot.endScale = 0.35;
      slot.alphaPeak = 0.96;
      slot.life = 0.38 + Math.random() * 0.16;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
    }
  }

  spawnZoomieDust(x: number, y: number, vx: number, vy: number): void {
    for (let i = 0; i < 4; i++) {
      const slot = this.acquire('dust');
      const jitter = (Math.random() - 0.5) * 0.9;
      const baseAng = Math.atan2(-vy, -vx) + jitter;
      const speed = 26 + Math.random() * 38;
      slot.x = x + (Math.random() - 0.5) * 10;
      slot.y = y + (Math.random() - 0.5) * 10;
      slot.vx = Math.cos(baseAng) * speed;
      slot.vy = Math.sin(baseAng) * speed;
      slot.drag = 0.87;
      slot.startScale = 0.62 + Math.random() * 0.32;
      slot.endScale = 1.55 + Math.random() * 0.35;
      slot.alphaPeak = 0.54;
      slot.life = 0.38 + Math.random() * 0.18;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
      slot.gfx.alpha = slot.alphaPeak;
    }
  }

  spawnChimeRipple(x: number, y: number, color = 0xf4cf84): void {
    for (let i = 0; i < 2; i++) {
      const ring = this.acquire('chimeRing');
      ring.gfx.tint = color;
      ring.x = x;
      ring.y = y;
      ring.vx = 0;
      ring.vy = 0;
      ring.drag = 0.99;
      ring.startScale = 0.45 + i * 0.35;
      ring.endScale = 2.8 + i * 0.9;
      ring.alphaPeak = 0.55 - i * 0.14;
      ring.life = 0.56 + i * 0.18;
      ring.gfx.position.set(ring.x, ring.y);
      ring.gfx.scale.set(ring.startScale);
    }
  }

  spawnClickRipple(x: number, y: number, color = 0xf7d79a): void {
    this.spawnChimeRipple(x, y, color);
  }

  spawnSteamBurst(x: number, y: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('steam');
      slot.x = x + (Math.random() - 0.5) * 10;
      slot.y = y - 2 + (Math.random() - 0.5) * 4;
      slot.vx = (Math.random() - 0.5) * 14;
      slot.vy = -22 - Math.random() * 14;
      slot.drag = 0.97;
      slot.startScale = 0.55 + Math.random() * 0.25;
      slot.endScale = 1.35 + Math.random() * 0.3;
      slot.alphaPeak = 0.58;
      slot.life = 0.85 + Math.random() * 0.35;
      slot.wobbleAmp = 8;
      slot.wobbleFreq = 3.4;
      slot.wobblePhase = i * 1.6;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
    }
  }

  spawnLeafRustle(x: number, y: number, color = 0x6ea86d, count = 5): void {
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('petal');
      slot.gfx.tint = color;
      const ang = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 34;
      slot.x = x + Math.cos(ang) * 8;
      slot.y = y + Math.sin(ang) * 8;
      slot.vx = Math.cos(ang) * speed;
      slot.vy = Math.sin(ang) * speed - 12;
      slot.ay = 26;
      slot.drag = 0.93;
      slot.rotation = Math.random() * Math.PI * 2;
      slot.vRot = (Math.random() - 0.5) * 4.5;
      slot.startScale = 0.65 + Math.random() * 0.3;
      slot.endScale = 0.42;
      slot.alphaPeak = 0.88;
      slot.life = 0.72 + Math.random() * 0.32;
      slot.wobbleAmp = 10;
      slot.wobbleFreq = 3.8;
      slot.wobblePhase = Math.random() * Math.PI * 2;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
    }
  }

  spawnCuriosityPop(x: number, y: number): void {
    const slot = this.acquire('exclaim');
    slot.x = x;
    slot.y = y - 16;
    slot.vx = 0;
    slot.vy = -18;
    slot.drag = 0.92;
    slot.startScale = 0.7;
    slot.endScale = 1.15;
    slot.alphaPeak = 0.95;
    slot.life = 0.58;
    slot.gfx.position.set(slot.x, slot.y);
    slot.gfx.scale.set(slot.startScale);
  }

  /**
   * Dispatches a structured PropParticleBurst emitted by interactive scene props.
   */
  spawnPropBurst(burst: PropParticleBurst): void {
    const { kind, x, y, count, color } = burst;
    switch (kind) {
      case 'sparkle': {
        const n = Math.max(1, count ?? 5);
        for (let i = 0; i < n; i++) {
          const slot = this.acquire('sparkle');
          slot.gfx.tint = color ?? 0xffe49e;
          const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
          const speed = 20 + Math.random() * 32;
          slot.x = x + Math.cos(ang) * 4;
          slot.y = y + Math.sin(ang) * 4;
          slot.vx = Math.cos(ang) * speed;
          slot.vy = Math.sin(ang) * speed - 14;
          slot.drag = 0.94;
          slot.rotation = Math.random() * Math.PI;
          slot.vRot = (Math.random() > 0.5 ? 1 : -1) * 2.6;
          slot.startScale = 0.45 + Math.random() * 0.3;
          slot.endScale = 0.96;
          slot.alphaPeak = 0.92;
          slot.life = 0.62 + Math.random() * 0.25;
          slot.gfx.position.set(slot.x, slot.y);
          slot.gfx.scale.set(slot.startScale);
        }
        break;
      }
      case 'heart':
        this.spawnHeartBurst(x, y, count ?? 3);
        break;
      case 'splash':
        this.spawnWaterSplash(x, y, count ?? 6);
        break;
      case 'crumb':
        this.spawnKibbleCrumbs(x, y, count ?? 5);
        break;
      case 'steam':
        this.spawnSteamBurst(x, y, count ?? 4);
        break;
      case 'leaf':
        this.spawnLeafRustle(x, y, color ?? 0x6ea86d, count ?? 5);
        break;
      case 'chime':
      case 'ripple':
        this.spawnChimeRipple(x, y, color ?? (kind === 'ripple' ? 0x9ce2f5 : 0xf4cf84));
        break;
      case 'catnip':
        this.spawnCatnipSparkles(x, y, count ?? 8);
        break;
      case 'note':
        this.spawnMusicNotes(x, y, count ?? 2);
        break;
      case 'dust':
      default:
        this.spawnDustPuff(x, y, 0, -14);
        break;
    }
  }

  spawnSleepZ(x: number, y: number): void {
    const isBubble = Math.random() < 0.35;
    const slot = this.acquire(isBubble ? 'bubble' : 'sleepZ');
    slot.x = x + (Math.random() - 0.5) * 10;
    slot.y = y - 8;
    slot.vx = 6 + Math.random() * 8;
    slot.vy = -22 - Math.random() * 10;
    slot.drag = 0.99;
    slot.rotation = (Math.random() - 0.5) * 0.18;
    slot.vRot = isBubble ? 0 : (Math.random() - 0.5) * 0.2;
    slot.startScale = 0.55;
    slot.endScale = isBubble ? 1.15 : 1.05;
    slot.alphaPeak = isBubble ? 0.65 : 0.85;
    slot.life = 1.35 + Math.random() * 0.35;
    slot.wobbleAmp = 7;
    slot.wobbleFreq = 2.6;
    slot.wobblePhase = Math.random() * Math.PI * 2;
    slot.gfx.position.set(slot.x, slot.y);
    slot.gfx.scale.set(slot.startScale);
  }

  spawnDustPuff(x: number, y: number, vx = 0, vy = 0): void {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const slot = this.acquire('dust');
      const jitterAngle = Math.random() * Math.PI * 2;
      const spread = 12 + Math.random() * 20;
      slot.x = x + (Math.random() - 0.5) * 8;
      slot.y = y + (Math.random() - 0.5) * 8;
      slot.vx = vx * 0.3 + Math.cos(jitterAngle) * spread;
      slot.vy = vy * 0.3 + Math.sin(jitterAngle) * spread;
      slot.drag = 0.88;
      slot.startScale = 0.45 + Math.random() * 0.25;
      slot.endScale = 1.15 + Math.random() * 0.3;
      slot.alphaPeak = 0.45;
      slot.life = 0.36 + Math.random() * 0.14;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.scale.set(slot.startScale);
      slot.gfx.alpha = slot.alphaPeak;
    }
  }

  spawnScratchMarks(x: number, y: number, angleRad: number): void {
    const sparkCount = 2 + (Math.random() < 0.55 ? 1 : 0);
    for (let i = 0; i < sparkCount; i++) {
      const spread = (i - (sparkCount - 1) * 0.5) * 0.42 + (Math.random() - 0.5) * 0.28;
      const moveAngle = angleRad + spread;
      const speed = 38 + Math.random() * 44;
      const slot = this.acquire('scratch');
      slot.x = x + Math.cos(moveAngle) * 3 + (Math.random() - 0.5) * 4;
      slot.y = y + Math.sin(moveAngle) * 3 + (Math.random() - 0.5) * 4;
      slot.vx = Math.cos(moveAngle) * speed;
      slot.vy = Math.sin(moveAngle) * speed;
      slot.ay = 18;
      slot.drag = 0.86;
      slot.rotation = angleRad + spread * 0.85;
      slot.vRot = (Math.random() - 0.5) * 1.6;
      slot.startScale = 0.72 + Math.random() * 0.28;
      slot.endScale = 1.2 + Math.random() * 0.25;
      slot.alphaPeak = 0.96;
      slot.life = 0.24 + Math.random() * 0.1;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.rotation = slot.rotation;
      slot.gfx.scale.set(slot.startScale);
      slot.gfx.alpha = slot.alphaPeak;
    }

    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 0.75;
      const moveAngle = angleRad + spread;
      const speed = 22 + Math.random() * 28;
      const slot = this.acquire('dust');
      slot.x = x + (Math.random() - 0.5) * 5;
      slot.y = y + (Math.random() - 0.5) * 5;
      slot.vx = Math.cos(moveAngle) * speed;
      slot.vy = Math.sin(moveAngle) * speed;
      slot.ay = 28;
      slot.drag = 0.88;
      slot.startScale = 0.24 + Math.random() * 0.14;
      slot.endScale = 0.65 + Math.random() * 0.2;
      slot.alphaPeak = 0.5;
      slot.life = 0.28 + Math.random() * 0.12;
      slot.gfx.position.set(slot.x, slot.y);
      slot.gfx.rotation = 0;
      slot.gfx.scale.set(slot.startScale);
      slot.gfx.alpha = slot.alphaPeak;
    }
  }

  update(dt: number): void {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    const frameScale = safeDt * 60;

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.age += safeDt;
      if (p.age >= p.life) {
        p.active = false;
        p.gfx.visible = false;
        continue;
      }

      const t = p.age / p.life;
      const damp = Math.pow(p.drag, frameScale);
      p.vx = (p.vx + p.ax * safeDt) * damp;
      p.vy = (p.vy + p.ay * safeDt) * damp;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.rotation += p.vRot * safeDt;

      const wobbleX = p.wobbleAmp > 0
        ? Math.sin(p.age * p.wobbleFreq + p.wobblePhase) * p.wobbleAmp * t
        : 0;

      const scale = p.startScale + (p.endScale - p.startScale) * (1 - (1 - t) * (1 - t));
      const fadeIn = t < 0.15 ? t / 0.15 : 1;
      const fadeOut = 1 - Math.pow(t, 1.6);

      p.gfx.position.set(p.x + wobbleX, p.y);
      p.gfx.rotation = p.rotation;
      p.gfx.scale.set(scale);
      p.gfx.alpha = p.alphaPeak * fadeIn * fadeOut;
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.gfx.visible = false;
    }
  }

  override destroy(): void {
    for (const p of this.pool) {
      p.gfx.destroy({ context: false });
    }
    this.pool.length = 0;
    for (const ctx of Object.values(this.contexts)) {
      ctx.destroy();
    }
    super.destroy({ children: true });
  }
}
