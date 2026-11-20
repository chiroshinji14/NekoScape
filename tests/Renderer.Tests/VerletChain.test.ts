import { describe, expect, it } from 'vitest';
import { SpineChain, VerletChain } from '@/core/VerletChain';

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const a1 = Math.atan2(v1y, v1x);
  const a2 = Math.atan2(v2y, v2x);
  let diff = (a2 - a1) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff <= -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

describe('VerletChain & SpineChain', () => {
  it('maintains Verlet segment distances without NaNs across 200 rapid sharp turns', () => {
    const segLen = 9;
    const chain = new VerletChain(6, segLen, 200, 200, 0.92);

    let x = 200;
    let y = 200;

    for (let step = 0; step < 200; step++) {
      // Alternate violent 180-degree reversals and tight spiral turns
      const angle = step % 5 === 0 ? Math.PI * step : step * 0.85;
      x += Math.cos(angle) * 18;
      y += Math.sin(angle) * 18;

      chain.setRoot(x, y);
      chain.update(1 / 60, {
        swayAmp: 1.5,
        swayFreq: 6,
        time: step / 60,
        rootAngle: angle + Math.PI,
        restCurve: 0.12,
      });

      for (let i = 0; i < chain.nodes.length; i++) {
        expect(Number.isFinite(chain.nodes[i].x)).toBe(true);
        expect(Number.isFinite(chain.nodes[i].y)).toBe(true);
        expect(Number.isFinite(chain.nodes[i].oldX)).toBe(true);
        expect(Number.isFinite(chain.nodes[i].oldY)).toBe(true);
      }

      for (let i = 0; i < chain.nodes.length - 1; i++) {
        const d = dist(chain.nodes[i], chain.nodes[i + 1]);
        expect(d).toBeCloseTo(segLen, 3);
      }
    }
  });

  it('recovers cleanly from extreme root teleports without exploding', () => {
    const segLen = 10;
    const chain = new VerletChain(5, segLen, 0, 0);
    chain.setRoot(1500, -1200);
    chain.update(1 / 60);

    for (let i = 0; i < chain.nodes.length - 1; i++) {
      expect(Number.isFinite(chain.nodes[i].x)).toBe(true);
      expect(Number.isFinite(chain.nodes[i].y)).toBe(true);
      expect(dist(chain.nodes[i], chain.nodes[i + 1])).toBeCloseTo(segLen, 3);
    }
  });

  it('enforces SpineChain exact segment lengths and max-bend angular limit on sharp turns', () => {
    const headLen = 15;
    const torsoLen = 17;
    const maxBend = 0.95;
    const spine = new SpineChain(headLen, torsoLen, maxBend);
    spine.reset(400, 300, 0);

    expect(dist(spine.head, spine.torso)).toBeCloseTo(headLen, 5);
    expect(dist(spine.torso, spine.hips)).toBeCloseTo(torsoLen, 5);

    // Perform sharp figure-8 and instant 180-degree turns
    for (let i = 0; i < 120; i++) {
      const t = i * 0.25;
      const hx = 400 + Math.cos(t) * 60;
      const hy = 300 + Math.sin(2 * t) * 45;
      const explicitHeading = i % 10 === 0 ? (i * Math.PI) : undefined;

      spine.moveHeadTo(hx, hy, explicitHeading);

      expect(Number.isFinite(spine.head.x)).toBe(true);
      expect(Number.isFinite(spine.torso.x)).toBe(true);
      expect(Number.isFinite(spine.hips.x)).toBe(true);
      expect(dist(spine.head, spine.torso)).toBeCloseTo(headLen, 4);
      expect(dist(spine.torso, spine.hips)).toBeCloseTo(torsoLen, 4);

      const bend = angleBetween(spine.head, spine.torso, spine.hips);
      expect(bend).toBeLessThanOrEqual(maxBend + 1e-4);
    }

    // Coincident move directly onto previous torso must not produce NaN
    const currentTorso = spine.torso;
    spine.moveHeadTo(currentTorso.x, currentTorso.y);
    expect(Number.isFinite(spine.torso.x)).toBe(true);
    expect(Number.isFinite(spine.hips.y)).toBe(true);
    expect(dist(spine.head, spine.torso)).toBeCloseTo(headLen, 4);
    expect(dist(spine.torso, spine.hips)).toBeCloseTo(torsoLen, 4);
  });
});
