import { describe, expect, it } from 'vitest';
import { PhysicsWorld, type CircleBody } from '@/core/PhysicsWorld';
import { SurfaceManager } from '@/core/SurfaceManager';
import {
  BONK_VELOCITY_THRESHOLD,
  FRICTION_HARDWOOD,
  FRICTION_RUG,
  YARN_RESTITUTION,
  type AabbRect,
} from '@/types/simulation';

describe('PhysicsWorld', () => {
  it('pushes high-speed colliding circles completely out of icon AABBs without overlap', () => {
    const world = new PhysicsWorld(1280, 720);
    const obstacle: AabbRect = {
      id: 1,
      x: 200,
      y: 200,
      width: 80,
      height: 80,
      label: 'Projects',
    };
    world.setObstacles([obstacle]);

    // Deeply embedded high-speed circle hitting from the left
    const body: CircleBody = {
      x: 235,
      y: 240,
      vx: 620,
      vy: 0,
      radius: 18,
    };

    const result = world.resolveAllObstacles(body);
    expect(result).not.toBeNull();
    expect(result?.collided).toBe(true);
    expect(result?.bonked).toBe(true);
    expect(body.x + body.radius).toBeLessThanOrEqual(obstacle.x + 1e-6);

    // Verify a follow-up check reports zero penetration
    const secondCheck = world.resolveCircleAabb(body, obstacle);
    expect(secondCheck.collided).toBe(false);
  });

  it('triggers bonked strictly above 350 px/s and never at or below 350 px/s', () => {
    const world = new PhysicsWorld(1280, 720);
    const obstacle: AabbRect = {
      id: 2,
      x: 300,
      y: 300,
      width: 75,
      height: 75,
      label: 'Notes',
    };

    const atThreshold: CircleBody = {
      x: 290,
      y: 337,
      vx: BONK_VELOCITY_THRESHOLD,
      vy: 0,
      radius: 16,
    };
    const resAt = world.resolveCircleAabb(atThreshold, obstacle);
    expect(resAt.collided).toBe(true);
    expect(resAt.impactSpeed).toBeCloseTo(350, 5);
    expect(resAt.bonked).toBe(false);

    const aboveThreshold: CircleBody = {
      x: 290,
      y: 337,
      vx: BONK_VELOCITY_THRESHOLD + 0.5,
      vy: 0,
      radius: 16,
    };
    const resAbove = world.resolveCircleAabb(aboveThreshold, obstacle);
    expect(resAbove.collided).toBe(true);
    expect(resAbove.impactSpeed).toBeGreaterThan(350);
    expect(resAbove.bonked).toBe(true);

    // Parallel grazing at high speed should not trigger bonk
    const grazing: CircleBody = {
      x: 285,
      y: 337,
      vx: 0,
      vy: 600,
      radius: 16,
    };
    const resGraze = world.resolveCircleAabb(grazing, obstacle);
    expect(resGraze.collided).toBe(true);
    expect(resGraze.impactSpeed).toBeCloseTo(0, 5);
    expect(resGraze.bonked).toBe(false);
  });

  it('ricochets yarn ball off obstacles and bounds with restitution 0.75', () => {
    const surface = new SurfaceManager(1280, 720);
    const world = new PhysicsWorld(1280, 720, surface);
    const obstacle: AabbRect = {
      id: 3,
      x: 200,
      y: 100,
      width: 80,
      height: 80,
      label: 'Sketches',
    };
    world.setObstacles([obstacle]);

    // Place yarn right next to obstacle left face on hardwood
    const yarn: CircleBody = {
      x: 185,
      y: 140,
      vx: 300,
      vy: 0,
      radius: 14,
    };

    const stepRes = world.stepYarnBall(yarn, 1 / 60);
    expect(stepRes.bouncedObstacle?.id).toBe(3);
    expect(stepRes.wallHit).toBe(false);
    expect(yarn.vx).toBeLessThan(0);
    // Expected velocity after 1/60s hardwood friction then 0.75 restitution bounce
    const frictionFactor = Math.exp(-(0.25 / (1 - FRICTION_HARDWOOD)) * (1 / 60));
    expect(Math.abs(yarn.vx)).toBeCloseTo(300 * frictionFactor * YARN_RESTITUTION, 2);

    // Wall bounce with YARN_RESTITUTION
    const wallYarn: CircleBody = {
      x: 10,
      y: 100,
      vx: -400,
      vy: 0,
      radius: 14,
    };
    const wallStep = world.stepYarnBall(wallYarn, 1 / 60);
    expect(wallStep.wallHit).toBe(true);
    expect(wallYarn.x).toBeGreaterThanOrEqual(wallYarn.radius);
    expect(wallYarn.vx).toBeGreaterThan(0);
    expect(wallYarn.vx).toBeCloseTo(400 * frictionFactor * YARN_RESTITUTION, 2);
  });

  it('separates overlapping Circle-Circle bodies and exchanges impulse', () => {
    const world = new PhysicsWorld(1280, 720);
    const a: CircleBody = { x: 400, y: 300, vx: 120, vy: 0, radius: 20 };
    const b: CircleBody = { x: 425, y: 300, vx: -120, vy: 0, radius: 20 };

    const separated = world.resolveCircleCircle(a, b, 0.6);
    expect(separated).toBe(true);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(40, 5);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('applies higher damping on rug (0.96) than hardwood (0.82) consistently across dt', () => {
    const surface = new SurfaceManager(1280, 720);
    const world = new PhysicsWorld(1280, 720, surface);
    const rugBounds = surface.getRugBounds();

    const hardwoodBody = { x: 40, y: 40, vx: 400, vy: 0 };
    const rugBody = {
      x: rugBounds.x + rugBounds.width * 0.5,
      y: rugBounds.y + rugBounds.height * 0.5,
      vx: 400,
      vy: 0,
    };

    expect(surface.getFrictionAt(hardwoodBody.x, hardwoodBody.y)).toBe(FRICTION_HARDWOOD);
    expect(surface.getFrictionAt(rugBody.x, rugBody.y)).toBe(FRICTION_RUG);

    for (let i = 0; i < 30; i++) {
      world.applySurfaceFriction(hardwoodBody, 1 / 60);
      world.applySurfaceFriction(rugBody, 1 / 60);
    }

    // Hardwood slides/retains significantly more velocity than high-grip rug
    expect(hardwoodBody.vx).toBeGreaterThan(150);
    expect(rugBody.vx).toBeLessThan(40);
    expect(hardwoodBody.vx).toBeGreaterThan(rugBody.vx * 4);

    // Frame-rate independence: one 1/30s step equals two 1/60s steps
    const stepA = { x: 40, y: 40, vx: 400, vy: 0 };
    const stepB = { x: 40, y: 40, vx: 400, vy: 0 };
    world.applySurfaceFriction(stepA, 1 / 30);
    world.applySurfaceFriction(stepB, 1 / 60);
    world.applySurfaceFriction(stepB, 1 / 60);
    expect(stepA.vx).toBeCloseTo(stepB.vx, 5);
  });

  it('resolves extraObstacles without mutating stored world obstacles', () => {
    const world = new PhysicsWorld(1280, 720);
    const iconObs: AabbRect = {
      id: 1,
      x: 200,
      y: 200,
      width: 72,
      height: 72,
      label: 'Projects',
    };
    const boxObs: AabbRect = {
      id: 99,
      x: 500,
      y: 300,
      width: 112,
      height: 86,
      label: 'CardboardBox',
    };
    world.setObstacles([iconObs]);

    // 1-arg / 2-arg calls ignore extra box obstacle
    const ignoredBody: CircleBody = { x: 520, y: 340, vx: 420, vy: 0, radius: 18 };
    expect(world.resolveAllObstacles(ignoredBody)).toBeNull();
    expect(world.resolveAllObstacles(ignoredBody, 0.4)).toBeNull();

    // 3-arg call resolves penetration and bonk against extraObstacles
    const catBody: CircleBody = { x: 510, y: 340, vx: 420, vy: 0, radius: 18 };
    const hit = world.resolveAllObstacles(catBody, 0.4, [boxObs]);
    expect(hit).not.toBeNull();
    expect(hit?.collided).toBe(true);
    expect(hit?.bonked).toBe(true);
    expect(catBody.x + catBody.radius).toBeLessThanOrEqual(boxObs.x + 1e-6);
    expect(world.resolveCircleAabb(catBody, boxObs).collided).toBe(false);

    // Wedge corner between stored icon obstacle and adjacent extra obstacle
    const adjacentBox: AabbRect = {
      id: 100,
      x: 272,
      y: 200,
      width: 96,
      height: 72,
      label: 'BoxCorner',
    };
    const cornerCat: CircleBody = { x: 272, y: 208, vx: 0, vy: 200, radius: 18 };
    const cornerHit = world.resolveAllObstacles(cornerCat, 0.4, [adjacentBox]);
    expect(cornerHit?.collided).toBe(true);
    expect(world.resolveCircleAabb(cornerCat, iconObs).collided).toBe(false);
    expect(world.resolveCircleAabb(cornerCat, adjacentBox).collided).toBe(false);

    // Stored obstacles remain completely unmutated
    expect(world.getObstacles()).toEqual([iconObs]);
  });
});
