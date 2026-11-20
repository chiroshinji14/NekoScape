/**
 * Seeded 2D Perlin gradient noise and fractional Brownian motion (fBm) utility.
 * Pure TypeScript with zero DOM/PixiJS dependencies.
 */
export class PerlinNoise {
  private readonly perm: Uint8Array;

  private static readonly GRADIENTS: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    // Deterministic Mulberry32 PRNG for Fisher-Yates permutation shuffle.
    let state = (Math.floor(Number.isFinite(seed) ? seed : 1337) >>> 0) || 1;
    const nextRand = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private gradDot(hash: number, dx: number, dy: number): number {
    const g = PerlinNoise.GRADIENTS[hash & 7];
    return g[0] * dx + g[1] * dy;
  }

  /**
   * Evaluates 2D Perlin gradient noise, clamped to [-1, 1].
   */
  noise2D(x: number, y: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return 0;
    }

    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;

    const xf = x - xi;
    const yf = y - yi;

    const u = PerlinNoise.fade(xf);
    const v = PerlinNoise.fade(yf);

    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];

    const x1 = PerlinNoise.lerp(
      this.gradDot(aa, xf, yf),
      this.gradDot(ba, xf - 1, yf),
      u,
    );
    const x2 = PerlinNoise.lerp(
      this.gradDot(ab, xf, yf - 1),
      this.gradDot(bb, xf - 1, yf - 1),
      u,
    );

    const value = PerlinNoise.lerp(x1, x2, v);
    return Math.max(-1, Math.min(1, value));
  }

  /**
   * Evaluates multi-octave fractional Brownian motion in [-1, 1].
   */
  fbm2D(x: number, y: number, octaves = 4): number {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return 0;
    }

    const count = Math.max(1, Math.min(16, Math.floor(Number.isFinite(octaves) ? octaves : 4)));
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < count; i++) {
      sum += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    if (maxAmplitude <= 0) {
      return 0;
    }

    const normalized = sum / maxAmplitude;
    return Math.max(-1, Math.min(1, normalized));
  }
}
