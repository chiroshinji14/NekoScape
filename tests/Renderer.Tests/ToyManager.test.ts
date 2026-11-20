import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => ({
  Container: class {
    children: unknown[] = [];
    addChild() {}
    removeChild() {}
    destroy() {}
  },
  Graphics: class {},
}));

import {
  CUCUMBER_TTL_SEC,
  PING_PONG_RESTITUTION,
  ToyWorld,
  getToyPhysicsSpec,
  isCarryableToy,
} from '@/entities/ToyManager';
import { TOY_KINDS, TOY_LABELS, type ToyKind } from '@/types/simulation';

const W = 1280;
const H = 720;

function inBounds(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= W && y >= 0 && y <= H;
}

describe('ToyWorld — 11 Deployable Toys (drop / hit-test / bat / carry / clear)', () => {
  it('defines exactly the 11 required toy kinds with labels', () => {
    expect([...TOY_KINDS].sort()).toEqual(
      [
        'bubbles',
        'crinkle_ball',
        'cucumber',
        'feather_wand',
        'fish_toy',
        'hair_tie',
        'mouse_toy',
        'paper_bag',
        'ping_pong',
        'spring_toy',
        'taped_square',
      ].sort(),
    );
    for (const kind of TOY_KINDS) {
      expect(TOY_LABELS[kind].length).toBeGreaterThan(2);
    }
  });

  it('drops every toy kind at a valid position with correct semantic flags', () => {
    const world = new ToyWorld(W, H);
    for (const kind of TOY_KINDS) {
      const toy = world.spawnToy(kind, 600, 360);
      expect(toy.kind).toBe(kind);
      expect(toy.active).toBe(true);
      expect(toy.radius).toBeGreaterThan(0);
      expect(inBounds(toy.x, toy.y), `${kind} drop position`).toBe(true);
      expect(toy.isCarriedByCatId).toBeNull();
    }

    expect(world.getToysByKind('mouse_toy')[0].isCatnip).toBe(true);
    expect(world.getToysByKind('fish_toy')[0].isFood).toBe(true);
    expect(world.getToysByKind('cucumber')[0].isScary).toBe(true);
    expect(world.getScaryToys().map((t) => t.kind)).toEqual(['cucumber']);
    // bubbles spawn a cluster (4..6) so total count exceeds kind count
    expect(world.getToysByKind('bubbles').length).toBeGreaterThanOrEqual(4);
    expect(world.getActiveCount()).toBeGreaterThanOrEqual(TOY_KINDS.length + 3);
  });

  it('clamps default drop positions in-bounds even when no coordinates or out-of-range coordinates are given', () => {
    const world = new ToyWorld(W, H);
    for (const kind of TOY_KINDS) {
      const auto = world.spawnToy(kind);
      expect(inBounds(auto.x, auto.y), `${kind} auto`).toBe(true);
      const off = world.spawnToy(kind, -500, 99999);
      expect(inBounds(off.x, off.y), `${kind} out of range`).toBe(true);
    }
  });

  it('gives each toy a unique id and each non-singleton drop a separate instance', () => {
    const world = new ToyWorld(W, H);
    const ids = new Set<string>();
    for (let i = 0; i < 30; i++) {
      ids.add(world.spawnToy('ping_pong', 100 + i * 10, 200).id);
    }
    expect(ids.size).toBe(30);
  });

  it('hit-tests toys at their centre and misses far away', () => {
    const world = new ToyWorld(W, H);
    for (const kind of TOY_KINDS) {
      world.clearAll();
      const toy = world.spawnToy(kind, 640, 360);
      const hit = world.hitTestToy(toy.x, toy.y);
      expect(hit, `${kind} centre hit`).not.toBeNull();
      expect(hit!.kind).toBe(kind);
      expect(world.hitTestToy(5, 5), `${kind} far miss`).toBeNull();
    }
    expect(world.hitTestToy(Number.NaN, 10)).toBeNull();
  });

  it('prioritises small toys over the paper bag and taped square when overlapping', () => {
    const world = new ToyWorld(W, H);
    const square = world.spawnToy('taped_square', 500, 400);
    const bag = world.spawnToy('paper_bag', 500, 400);
    expect(world.hitTestToy(square.x, square.y)!.kind).toBe('paper_bag');
    const ball = world.spawnToy('ping_pong', bag.x, bag.y);
    expect(world.hitTestToy(ball.x, ball.y)!.kind).toBe('ping_pong');
  });

  it('pointer-clicks produce kind-specific reactions for every toy', () => {
    const world = new ToyWorld(W, H);
    const expected: Record<ToyKind, string> = {
      mouse_toy: 'scurry',
      fish_toy: 'flop',
      feather_wand: 'whip',
      crinkle_ball: 'bat',
      spring_toy: 'bat',
      ping_pong: 'bat',
      hair_tie: 'bat',
      bubbles: 'pop_and_spawn',
      cucumber: 'dismiss',
      taped_square: 'pulse',
      paper_bag: 'rustle',
    };

    for (const kind of TOY_KINDS) {
      world.clearAll();
      const toy = world.spawnToy(kind, 640, 360);
      const res = world.handlePointerClick(toy.x, toy.y);
      expect(res, `${kind} click`).not.toBeNull();
      expect(res!.action).toBe(expected[kind]);
      expect(res!.title).toBe(TOY_LABELS[kind]);
      expect(res!.subtitle.length).toBeGreaterThan(3);
      expect(res!.particles.length).toBeGreaterThan(0);
    }
  });

  it('batting launches movable toys, ping-pong keeps restitution 0.92, and update() moves them in-bounds', () => {
    expect(PING_PONG_RESTITUTION).toBeCloseTo(0.92, 5);
    expect(getToyPhysicsSpec('ping_pong').restitution).toBeCloseTo(0.92, 5);

    const world = new ToyWorld(W, H);
    const movable: ToyKind[] = ['mouse_toy', 'fish_toy', 'crinkle_ball', 'spring_toy', 'ping_pong', 'hair_tie'];
    for (const kind of movable) {
      const toy = world.spawnToy(kind, 640, 360, { vx: 0, vy: 0 });
      toy.vx = 0;
      toy.vy = 0;
      const x0 = toy.x;
      const y0 = toy.y;
      expect(world.batToy(toy.id, 400, -300, 7)).toBe(true);
      expect(Math.hypot(toy.vx, toy.vy)).toBeGreaterThan(100);
      for (let i = 0; i < 20; i++) {
        world.update(0.02);
      }
      expect(Math.hypot(toy.x - x0, toy.y - y0), `${kind} moved`).toBeGreaterThan(5);
      expect(inBounds(toy.x, toy.y), `${kind} stays in bounds`).toBe(true);
    }
    expect(world.batToy('nope-1', 1, 1)).toBe(false);
  });

  it('keeps all toys inside the room walls after long bouncing simulation', () => {
    const world = new ToyWorld(W, H);
    for (const kind of ['ping_pong', 'crinkle_ball', 'hair_tie', 'spring_toy'] as const) {
      const toy = world.spawnToy(kind, 640, 360);
      world.batToy(toy.id, 900, 700);
    }
    for (let i = 0; i < 600; i++) {
      world.update(1 / 60);
    }
    for (const toy of world.getToys()) {
      expect(inBounds(toy.x, toy.y), `${toy.kind} ${toy.x},${toy.y}`).toBe(true);
    }
  });

  it('supports carrying: carry flag, position follow, and batting releases the toy', () => {
    const world = new ToyWorld(W, H);
    const carryable = TOY_KINDS.filter((k) => isCarryableToy(k));
    expect(carryable).toContain('mouse_toy');
    expect(carryable).toContain('fish_toy');
    expect(isCarryableToy('taped_square')).toBe(false);
    expect(isCarryableToy('paper_bag')).toBe(false);

    const mouse = world.spawnToy('mouse_toy', 300, 300);
    expect(world.setToyCarried(mouse.id, 3, 320, 310)).toBe(true);
    expect(mouse.isCarriedByCatId).toBe(3);
    expect(mouse.x).toBe(320);

    expect(world.updateCarriedToyPosition(mouse.id, 420, 380, 1.2)).toBe(true);
    expect(mouse.x).toBe(420);
    expect(mouse.y).toBe(380);

    // Carried toys do not drift on their own
    for (let i = 0; i < 30; i++) world.update(0.03);
    expect(mouse.x).toBe(420);
    expect(mouse.y).toBe(380);

    // Dropping, then position updates no longer apply
    expect(world.setToyCarried(mouse.id, null)).toBe(true);
    expect(mouse.isCarriedByCatId).toBeNull();
    expect(world.updateCarriedToyPosition(mouse.id, 1, 1)).toBe(false);

    // Batting releases carry
    world.setToyCarried(mouse.id, 4);
    world.batToy(mouse.id, 120, 0, 4);
    expect(mouse.isCarriedByCatId).toBeNull();
    expect(world.setToyCarried('missing', 1)).toBe(false);
  });

  it('consumes (eats/removes) toys and pops bubbles with a pop event', () => {
    const world = new ToyWorld(W, H);
    const fish = world.spawnToy('fish_toy', 500, 300);
    expect(world.consumeToy(fish.id)).toBe(true);
    expect(world.getToyById(fish.id)).toBeNull();
    expect(world.consumeToy(fish.id)).toBe(false);

    const bubbles = world.spawnBubbles(600, 300);
    expect(bubbles.length).toBeGreaterThanOrEqual(4);
    expect(bubbles.length).toBeLessThanOrEqual(6);
    world.drainEvents();
    expect(world.popBubble(bubbles[0].id)).toBe(true);
    const events = world.drainEvents();
    expect(events.some((e) => e.type === 'pop' && e.soundEvent === 'bubble_pop')).toBe(true);
    expect(world.popBubble(bubbles[0].id)).toBe(false);
  });

  it('toggles paper bag and taped square on/off (singleton floor props)', () => {
    const world = new ToyWorld(W, H);
    expect(world.isPaperBagActive()).toBe(false);
    expect(world.isTapedSquareActive()).toBe(false);

    expect(world.togglePaperBag(400, 300)).not.toBeNull();
    expect(world.isPaperBagActive()).toBe(true);
    expect(world.togglePaperBag()).toBeNull();
    expect(world.isPaperBagActive()).toBe(false);

    expect(world.toggleTapedSquare(700, 300)).not.toBeNull();
    expect(world.isTapedSquareActive()).toBe(true);
    expect(world.toggleTapedSquare()).toBeNull();
    expect(world.isTapedSquareActive()).toBe(false);

    // Re-dropping the singleton relocates it instead of duplicating it
    world.spawnToy('paper_bag', 200, 200);
    world.spawnToy('paper_bag', 800, 500);
    expect(world.getToysByKind('paper_bag')).toHaveLength(1);
  });

  it('expires the cucumber and bubbles automatically (TTL) while persistent toys remain', () => {
    const world = new ToyWorld(W, H);
    world.spawnToy('cucumber', 640, 360);
    world.spawnBubbles(400, 300);
    const mouse = world.spawnToy('ping_pong', 300, 300);
    expect(world.getToysByKind('cucumber')).toHaveLength(1);

    const steps = Math.ceil((CUCUMBER_TTL_SEC + 8) / 0.05);
    for (let i = 0; i < steps; i++) {
      world.update(0.05);
    }
    expect(world.getToysByKind('cucumber')).toHaveLength(0);
    expect(world.getToysByKind('bubbles')).toHaveLength(0);
    expect(world.getToyById(mouse.id)).not.toBeNull();
    expect(world.drainEvents().some((e) => e.type === 'expired')).toBe(true);
  });

  it('clearAll()/clearToys() removes every toy of every kind', () => {
    const world = new ToyWorld(W, H);
    for (const kind of TOY_KINDS) world.spawnToy(kind);
    expect(world.getActiveCount()).toBeGreaterThan(TOY_KINDS.length);
    world.clearToys();
    expect(world.getActiveCount()).toBe(0);
    expect(world.getToys()).toHaveLength(0);
    expect(world.hitTestToy(640, 360)).toBeNull();
  });

  it('feather wand follows the cursor when set active', () => {
    const world = new ToyWorld(W, H);
    const wand = world.spawnToy('feather_wand', 300, 300);
    world.setCursor(900, 500, true);
    for (let i = 0; i < 90; i++) world.update(1 / 60);
    const dist = Math.hypot(wand.x - 900, wand.y - 500);
    expect(dist).toBeLessThan(Math.hypot(300 - 900, 300 - 500));
    expect(inBounds(wand.x, wand.y)).toBe(true);
  });

  it('survives 100+ simultaneous toys and an extreme dt without NaN', () => {
    const world = new ToyWorld(W, H);
    for (let i = 0; i < 120; i++) {
      world.spawnToy(TOY_KINDS[i % TOY_KINDS.length], 100 + (i * 9) % 1000, 100 + (i * 13) % 500);
    }
    world.update(5);
    world.update(Number.NaN);
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    for (const toy of world.getToys()) {
      expect(Number.isFinite(toy.x) && Number.isFinite(toy.y)).toBe(true);
    }
  });

  it('resize keeps toys inside new bounds', () => {
    const world = new ToyWorld(W, H);
    const t = world.spawnToy('ping_pong', 1200, 700);
    world.resize(800, 600);
    world.update(0.016);
    expect(t.x).toBeLessThanOrEqual(800);
    expect(t.y).toBeLessThanOrEqual(600);
  });
});
