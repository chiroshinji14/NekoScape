import { Container, Graphics, GraphicsContext } from 'pixi.js';

type ParticleKind = 'star' | 'dust' | 'heart' | 'ring' | 'sleepZ' | 'bubble' | 'scratch';

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

  constructor(poolSize = 180) {
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
    };

    const count = Math.max(24, poolSize);
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
    slot.wobbleAmp = 0;
    slot.wobbleFreq = 0;
    slot.wobblePhase = 0;
  }

  spawnBonkBurst(x: number, y: number): void {
    // 5 spinning 4-point impact stars
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

    // 6 warm dust puff circles
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 35 + Math.random() * 48;
      const slot = this.acquire('dust');
      slot.x = x + Math.cos(angle) * 5;
      slot.y = y + Math.sin(angle) * 5;
      slot.vx = Math.cos(angle) * speed;
      slot.vy = Math.sin(angle) * speed;
      slot.drag = 0.88;
      slot.rotation = 0;
      slot.vRot = 0;
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
    // Floating warm heart + gentle acoustic purr ring
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
      ring.rotation = 0;
      ring.vRot = 0;
      ring.startScale = 0.6;
      ring.endScale = 2.4;
      ring.alphaPeak = 0.45;
      ring.life = 0.7;
      ring.gfx.position.set(ring.x, ring.y);
      ring.gfx.scale.set(ring.startScale);
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
      slot.rotation = 0;
      slot.vRot = 0;
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
    // 2-3 crisp angled claw-slash sparks
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

    // 2 tiny fleck dust puffs along angleRad
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
      slot.rotation = 0;
      slot.vRot = 0;
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
