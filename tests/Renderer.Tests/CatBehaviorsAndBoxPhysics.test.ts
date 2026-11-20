import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class MockContainer {
    eventMode = 'none';
    interactiveChildren = false;
    visible = true;
    destroyed = false;
    alpha = 1;
    rotation = 0;
    parent: MockContainer | null = null;
    children: MockContainer[] = [];
    position = {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    scale = {
      x: 1,
      y: 1,
      set(x: number, y = x) {
        this.x = x;
        this.y = y;
      },
    };
    addChild(...items: MockContainer[]) {
      for (const item of items) {
        item.parent = this;
        this.children.push(item);
      }
      return items[0];
    }
    destroy() {
      this.destroyed = true;
    }
  }

  class MockGraphics extends MockContainer {
    clear() {
      return this;
    }
    circle() {
      return this;
    }
    ellipse() {
      return this;
    }
    rect() {
      return this;
    }
    roundRect() {
      return this;
    }
    poly() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
    quadraticCurveTo() {
      return this;
    }
    bezierCurveTo() {
      return this;
    }
    closePath() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
  }

  class MockText extends MockContainer {
    text: string;
    style: Record<string, unknown>;
    anchor = {
      x: 0,
      y: 0,
      set(x: number, y = x) {
        this.x = x;
        this.y = y;
      },
    };
    constructor(options?: { text?: string; style?: Record<string, unknown> }) {
      super();
      this.text = options?.text ?? '';
      this.style = options?.style ?? {};
    }
  }

  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
  };
});

import { PhysicsWorld } from '@/core/PhysicsWorld';
import { SurfaceManager } from '@/core/SurfaceManager';
import { BOX_WALL_HEIGHT, CardboardBox } from '@/entities/CardboardBox';
import { CatEntity, hitTestCat, onCatClicked, type CatContext } from '@/entities/CatEntity';
import { ToyWorld } from '@/entities/ToyManager';
import { InteractivePropWorld } from '@/environment/InteractiveProp';
import { CAT_BREEDS, CAT_STATES } from '@/types/simulation';

function createTestContext(overrides: Partial<CatContext> = {}): CatContext {
  const surfaceManager = new SurfaceManager(1280, 720);
  const physics = new PhysicsWorld(1280, 720, surfaceManager);
  return {
    physics,
    surfaceManager,
    idleSeconds: 0,
    typingActive: false,
    nightMode: false,
    ...overrides,
  };
}

describe('CatEntity — Box Jump-Out Physics, Decorrelated Movement, 10 New Behaviors & Clicks', () => {
  it('decorrelates movement patterns: multiple spawned cats have distinct seeds, velocities, and wander trajectories', () => {
    const ctx = createTestContext();
    const cats = CAT_BREEDS.map(
      (breed, idx) => new CatEntity(idx + 1, breed, 640, 360),
    );
    ctx.otherCats = cats;

    const seeds = new Set(cats.map((c) => c.seed));
    expect(seeds.size).toBe(cats.length);

    // Even two cats of the exact same breed spawned at the exact same (x, y) get distinct seeds & trajectories
    const twinA = new CatEntity(10, 'munchkin', 500, 300);
    const twinB = new CatEntity(11, 'munchkin', 500, 300);
    expect(twinA.seed).not.toBe(twinB.seed);
    expect(twinA.getPersonality()).not.toEqual(twinB.getPersonality());

    // Transition all cats to WANDER and step 120 frames (2.0 seconds) to verify decorrelated wander trajectories
    for (const cat of [...cats, twinA, twinB]) {
      cat.update(1 / 60, ctx);
      (cat as unknown as { fsm: { transition: (s: string, f?: boolean) => void } }).fsm.transition(
        'WANDER',
        true,
      );
    }

    for (let step = 0; step < 120; step++) {
      for (const cat of cats) {
        cat.update(1 / 60, ctx);
      }
      twinA.update(1 / 60, ctx);
      twinB.update(1 / 60, ctx);
    }

    const posKeys = new Set(
      cats.map((c) => {
        const p = c.getPosition();
        return `${Math.round(p.x)},${Math.round(p.y)}`;
      }),
    );
    expect(posKeys.size).toBe(cats.length);

    const velKeys = new Set(
      cats.map((c) => {
        const v = c.getVelocity();
        return `${v.x.toFixed(2)},${v.y.toFixed(2)}`;
      }),
    );
    expect(velKeys.size).toBe(cats.length);

    const distTwins = Math.hypot(
      twinA.getPosition().x - twinB.getPosition().x,
      twinA.getPosition().y - twinB.getPosition().y,
    );
    expect(distTwins).toBeGreaterThan(12);
  }, 15000);

  it('executes JUMP_OUT_BOX with a crouch coil, high parabolic arc peaking well above box wall height, and lands strictly outside box + catRadius', () => {
    const box = new CardboardBox(640, 360, 'study');
    const ctx = createTestContext({ cardboardBox: box });
    const cat = new CatEntity(1, 'siamese', 580, 360);

    // Initialize context on cat, claim box, and enter IN_BOX
    cat.update(1 / 60, ctx);
    expect(box.claim(cat.id)).toBe(true);
    (cat as unknown as { fsm: { transition: (s: string, f?: boolean) => void } }).fsm.transition(
      'IN_BOX',
      true,
    );
    cat.update(1 / 60, ctx);
    expect(cat.getState()).toBe('IN_BOX');
    expect(cat.getPosition()).toEqual({ x: 640, y: 360 });

    // Trigger box exit via click reaction
    const clickRes = onCatClicked(cat, false);
    expect(clickRes.state).toBe('JUMP_OUT_BOX');
    expect(cat.getState()).toBe('JUMP_OUT_BOX');

    // Phase 1: During initial crouch coil inside box, zHeight is 0 and isElevated() is false
    expect(cat.getZHeight()).toBe(0);
    expect(cat.isElevated()).toBe(false);

    // Step through entire JUMP_OUT_BOX trajectory and record peak elevation & airborne elevation flag
    let maxZ = 0;
    let sawElevatedMidAir = false;
    let arcDebugMidAir = false;

    for (let i = 0; i < 60; i++) {
      cat.update(1 / 60, ctx);
      const z = cat.getZHeight();
      if (z > maxZ) {
        maxZ = z;
      }
      if (z > BOX_WALL_HEIGHT) {
        expect(cat.isElevated()).toBe(true);
        sawElevatedMidAir = true;
      }
      const dbg = cat.getJumpArcDebug();
      if (dbg && dbg.currentZ > BOX_WALL_HEIGHT) {
        arcDebugMidAir = true;
      }
      if (cat.getState() !== 'JUMP_OUT_BOX') {
        break;
      }
    }

    // Peak Z must be well above BOX_WALL_HEIGHT (26px), specifically 54..72px
    expect(maxZ).toBeGreaterThan(BOX_WALL_HEIGHT * 2);
    expect(maxZ).toBeGreaterThanOrEqual(52);
    expect(sawElevatedMidAir).toBe(true);
    expect(arcDebugMidAir).toBe(true);

    // Cat must have completed the jump and landed cleanly OUTSIDE the box exterior obstacle + catRadius
    expect(cat.getState()).not.toBe('JUMP_OUT_BOX');
    expect(cat.getState()).not.toBe('IN_BOX');
    expect(cat.getZHeight()).toBe(0);
    expect(box.occupantId).toBeNull();

    const landing = cat.getPosition();
    const boxObstacle = box.getExteriorObstacle();
    expect(
      ctx.physics.isCircleOverlappingAabb(landing.x, landing.y, cat.getRadius(), boxObstacle),
    ).toBe(false);

    const closestX = Math.max(boxObstacle.x, Math.min(landing.x, boxObstacle.x + boxObstacle.width));
    const closestY = Math.max(boxObstacle.y, Math.min(landing.y, boxObstacle.y + boxObstacle.height));
    const wallClearance = Math.hypot(landing.x - closestX, landing.y - closestY);
    expect(wallClearance).toBeGreaterThanOrEqual(cat.getRadius() + 10);
  });

  it('prevents startled cats in IN_BOX from sliding through walls and blocks grounded cats from passing through exterior box walls', () => {
    const box = new CardboardBox(640, 360, 'study');
    const ctx = createTestContext({ cardboardBox: box });
    const insideCat = new CatEntity(1, 'munchkin', 640, 360);
    box.claim(insideCat.id);
    (insideCat as unknown as { fsm: { transition: (s: string, f?: boolean) => void } }).fsm.transition(
      'IN_BOX',
      true,
    );

    // Startling a cat inside the box MUST transition to JUMP_OUT_BOX (not directly to grounded STARTLED)
    insideCat.triggerStartle({ x: 600, y: 360 });
    expect(insideCat.getState()).toBe('JUMP_OUT_BOX');

    let peakStartleZ = 0;
    for (let i = 0; i < 50; i++) {
      insideCat.update(1 / 60, ctx);
      peakStartleZ = Math.max(peakStartleZ, insideCat.getZHeight());
      if (insideCat.getState() === 'STARTLED') {
        break;
      }
    }
    expect(peakStartleZ).toBeGreaterThan(BOX_WALL_HEIGHT * 2);
    expect(insideCat.getState()).toBe('STARTLED');
    const boxObs = box.getExteriorObstacle();
    expect(
      ctx.physics.isCircleOverlappingAabb(
        insideCat.getPosition().x,
        insideCat.getPosition().y,
        insideCat.getRadius(),
        boxObs,
      ),
    ).toBe(false);

    // Grounded cat charging straight into the exterior box wall must collide and NEVER pass through
    const outsideCat = new CatEntity(2, 'british_shorthair', boxObs.x - 24, 360);
    for (let step = 0; step < 30; step++) {
      outsideCat.getBody().vx = 260;
      outsideCat.getBody().vy = 0;
      outsideCat.update(1 / 60, ctx);
      expect(
        ctx.physics.isCircleOverlappingAabb(
          outsideCat.getPosition().x,
          outsideCat.getPosition().y,
          outsideCat.getRadius() - 1e-4,
          boxObs,
        ),
      ).toBe(false);
    }
    expect(outsideCat.getPosition().x + outsideCat.getRadius()).toBeLessThanOrEqual(boxObs.x + 1e-3);
  });

  it('registers and executes all 10 new cat behaviors (GROOMING, LOAFING, STRETCHING, ZOOMIES, ROLL_BELLY, SOCIAL_PLAY, SUNBATHE, PROP_INTERACT, EATING_TREAT, MEERKAT_PEEK)', () => {
    const surface = new SurfaceManager(1280, 720);
    const propWorld = new InteractivePropWorld(1280, 720, surface.getRugBounds(), 'study');
    const onPropInteract = vi.fn();
    const onConsumeTreat = vi.fn((treatId: string, cat: CatEntity) =>
      propWorld.consumeTreatBite(treatId, cat.id),
    );

    const cat = new CatEntity(1, 'persian', 400, 300);
    const partner = new CatEntity(2, 'sphynx', 432, 304);
    const ctx = createTestContext({
      surfaceManager: surface,
      interactiveProps: propWorld.getProps(),
      warmZones: propWorld.getWarmZones(),
      activeTreats: propWorld.getActiveTreats(),
      ambientCritters: propWorld.getAmbientCritters(),
      otherCats: [cat, partner],
      onPropInteract,
      onConsumeTreat,
    });

    const fsm = (cat as unknown as { fsm: { hasState: (s: string) => boolean; transition: (s: string, f?: boolean) => void } }).fsm;

    // Verify every single state in CAT_STATES is registered on CatEntity's FSM
    for (const stateName of CAT_STATES) {
      expect(fsm.hasState(stateName), `Missing FSM registration for ${stateName}`).toBe(true);
    }

    // 1. GROOMING, 2. LOAFING, 3. STRETCHING, 4. ZOOMIES, 5. ROLL_BELLY
    for (const behavior of ['GROOMING', 'LOAFING', 'STRETCHING', 'ZOOMIES', 'ROLL_BELLY'] as const) {
      fsm.transition(behavior, true);
      expect(cat.getState()).toBe(behavior);
      for (let i = 0; i < 15; i++) {
        cat.update(1 / 60, ctx);
      }
      expect(cat.getState()).toBe(behavior);
      if (behavior === 'ZOOMIES') {
        const vel = cat.getVelocity();
        expect(Math.hypot(vel.x, vel.y)).toBeGreaterThan(80);
        // Zoomies micro-hop remains strictly grounded (<= 2px)
        expect(cat.getZHeight()).toBeLessThanOrEqual(2);
      }
    }

    // 6. MEERKAT_PEEK via triggerCuriosityGlance
    fsm.transition('IDLE', true);
    cat.triggerCuriosityGlance({ x: 700, y: 250 });
    expect(cat.getState()).toBe('MEERKAT_PEEK');
    expect(cat.getMood()).toBe('curious');
    cat.update(1 / 60, ctx);

    // 7. SUNBATHE in warm zone
    ctx.warmZones = propWorld.getWarmZones();
    fsm.transition('SUNBATHE', true);
    expect(cat.getState()).toBe('SUNBATHE');
    for (let i = 0; i < 15; i++) {
      cat.update(1 / 60, ctx);
    }
    expect(cat.getState()).toBe('SUNBATHE');

    // 8. SOCIAL_PLAY between cat and nearby partner
    (cat as unknown as { socialPartner: CatEntity; socialMode: string }).socialPartner = partner;
    (cat as unknown as { socialMode: string }).socialMode = 'boop';
    fsm.transition('SOCIAL_PLAY', true);
    expect(cat.getState()).toBe('SOCIAL_PLAY');
    for (let i = 0; i < 20; i++) {
      cat.update(1 / 60, ctx);
    }
    expect(cat.getState()).toBe('SOCIAL_PLAY');

    // 9. PROP_INTERACT via triggerPropAttract
    const journal = propWorld.getPropById('study-leather-journal')!;
    cat.triggerPropAttract(journal);
    expect(cat.getState()).toBe('PROP_INTERACT');
    expect(cat.getActivePropId()).toBe('study-leather-journal');
    // Place cat near journal interactPoint so arrival triggers onPropInteract callback
    cat.getBody().x = journal.interactPoint.x + 4;
    cat.getBody().y = journal.interactPoint.y + 4;
    for (let i = 0; i < 10; i++) {
      cat.update(1 / 60, ctx);
    }
    expect(onPropInteract).toHaveBeenCalledWith('study-leather-journal', cat);

    // 10. EATING_TREAT via triggerTreatAttract -> consumes all 3 bites and transitions to GROOMING
    const treat = propWorld.spawnTreat(cat.getPosition().x + 8, cat.getPosition().y + 6);
    ctx.activeTreats = propWorld.getActiveTreats();
    cat.triggerTreatAttract(treat);
    expect(cat.getState()).toBe('EATING_TREAT');
    for (let i = 0; i < 90; i++) {
      ctx.activeTreats = propWorld.getActiveTreats();
      cat.update(1 / 60, ctx);
      if (cat.getState() === 'GROOMING') {
        break;
      }
    }
    expect(onConsumeTreat).toHaveBeenCalled();
    expect(propWorld.getActiveTreats()).toHaveLength(0);
    expect(cat.getState()).toBe('GROOMING');
  });

  it('hit-tests clicked cats accurately and returns structured mood/reaction badge payloads', () => {
    const ctx = createTestContext();
    const catA = new CatEntity(1, 'munchkin', 300, 300, { name: 'Mochi' });
    const catB = new CatEntity(2, 'persian', 620, 420, { name: 'Duchess' });
    catA.update(1 / 60, ctx);
    catB.update(1 / 60, ctx);

    const cats = [catA, catB];
    expect(hitTestCat(cats, 302, 298)).toBe(catA);
    expect(hitTestCat(cats, 618, 422)).toBe(catB);
    expect(hitTestCat(cats, 900, 150)).toBeNull();

    // Single click on grounded cat triggers valid reaction & badge payload
    const singleReaction = onCatClicked(catA, false);
    expect(singleReaction.catId).toBe(1);
    expect(singleReaction.name).toBe('Mochi');
    expect(singleReaction.breed).toBe('munchkin');
    expect(singleReaction.breedLabel).toBe('Munchkin');
    expect(singleReaction.caption.length).toBeGreaterThan(5);
    expect([
      'ROLL_BELLY',
      'MEERKAT_PEEK',
      'PETTED',
      'SLOW_BLINK',
      'IGNORE_USER',
      'OVERSTIMULATED',
    ]).toContain(singleReaction.state);
    expect(['affectionate', 'curious', 'playful', 'irritated']).toContain(singleReaction.mood);

    // Double-clicking a high-zoomie Munchkin triggers ZOOMIES or ROLL_BELLY
    const doubleReaction = onCatClicked(catA, true);
    expect(['ZOOMIES', 'ROLL_BELLY', 'OVERSTIMULATED']).toContain(doubleReaction.state);
  });

  it('exposes Zzz sleep indicator on NAP/DEEP_SLEEP/DREAMING and clicking a sleeping cat startles it into a high parabolic jump (zHeight > 45)', () => {
    const ctx = createTestContext();
    const fsmOf = (c: CatEntity) =>
      (c as unknown as { fsm: { transition: (s: string, f?: boolean) => void } }).fsm;

    for (const sleepState of ['NAP', 'DEEP_SLEEP', 'DREAMING'] as const) {
      const sleeper = new CatEntity(101, 'persian', 620, 380, { name: 'Duchess' });
      sleeper.update(1 / 60, ctx);
      expect(sleeper.isSleeping()).toBe(false);
      expect(sleeper.getSleepIndicatorText()).toBe('');

      fsmOf(sleeper).transition(sleepState, true);
      sleeper.update(1 / 60, ctx);
      expect(sleeper.getState()).toBe(sleepState);
      expect(sleeper.isSleeping()).toBe(true);
      expect(sleeper.getSleepIndicatorText()).toBe('Zzz');
      expect(sleeper.getZHeight()).toBe(0);

      // Clicking a sleeping cat MUST wake it STARTLED and launch a high parabolic jump (> 45px)
      const wake = onCatClicked(sleeper, false);
      expect(wake.wokeFromSleep).toBe(true);
      expect(wake.state).toBe('STARTLED');
      expect(wake.soundEvent).toBe('startle');
      expect(sleeper.isSleeping()).toBe(false);
      expect(sleeper.getSleepIndicatorText()).toBe('');
      expect(sleeper.getEarPose()).toBe('flat_back');

      let peakZ = 0;
      for (let i = 0; i < 45; i++) {
        sleeper.update(1 / 60, ctx);
        peakZ = Math.max(peakZ, sleeper.getZHeight());
      }
      expect(peakZ, `${sleepState} startle wake jump peak`).toBeGreaterThan(45);
    }
  });

  it('supports unlimited cat deployment (50 cats across all 14 breeds, no 12-cat cap, distinct seeds & valid positions)', () => {
    const ctx = createTestContext({ catCount: 50 });
    const cats: CatEntity[] = [];
    for (let i = 0; i < 50; i++) {
      const breed = CAT_BREEDS[i % CAT_BREEDS.length];
      const x = 90 + (i % 10) * 110;
      const y = 90 + Math.floor(i / 10) * 120;
      cats.push(new CatEntity(i + 1, breed, x, y));
    }
    ctx.otherCats = cats;

    expect(cats).toHaveLength(50);
    expect(new Set(cats.map((c) => c.seed)).size).toBe(50);
    expect(new Set(cats.map((c) => c.breed)).size).toBe(14);

    for (let step = 0; step < 30; step++) {
      for (const c of cats) {
        c.update(1 / 60, ctx);
      }
    }

    for (const c of cats) {
      const p = c.getPosition();
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1280);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(720);
    }
  }, 15000);

  it('executes v2.0 realistic behaviors (KNEADING, SLOW_BLINK, POUNCE_WIGGLE, CHATTER, STARE_VOID, HEAD_BUNT, FLEHMEN, DRINKING, LITTER_USE->ZOOMIES, CUCUMBER_SCARE, CARRY_GIFT, TASKBAR_WALK, PAW_TEST, OVERSTIMULATED, IGNORE_USER)', () => {
    const surface = new SurfaceManager(1280, 720);
    const propWorld = new InteractivePropWorld(1280, 720, surface.getRugBounds(), 'bedroom');
    const toyWorld = new ToyWorld(1280, 720);
    const carriedLog: Array<{ toyId: string; catId: number | null }> = [];

    const cat = new CatEntity(77, 'bengal', 500, 400);
    expect(cat.getRegisteredStates()).toHaveLength(CAT_STATES.length);
    for (const st of CAT_STATES) {
      expect(cat.getRegisteredStates()).toContain(st);
    }

    const ctx = createTestContext({
      surfaceManager: surface,
      interactiveProps: propWorld.getProps(),
      warmZones: propWorld.getWarmZones(),
      ambientCritters: propWorld.getAmbientCritters(),
      toys: toyWorld.getToys(),
      onCarryToy: (toyId, catId, x, y, rot) => {
        carriedLog.push({ toyId, catId });
        return toyWorld.setToyCarried(toyId, catId, x, y) &&
          (catId === null || x === undefined || y === undefined
            ? true
            : toyWorld.updateCarriedToyPosition(toyId, x, y, rot));
      },
      windowLedges: {
        taskbarRect: { id: -1, x: 0, y: 676, width: 1280, height: 44, label: 'Taskbar' },
        windowTopLedges: [{ id: 10, x: 220, y: 180, width: 520, height: 12, label: 'Notes' }],
      },
      onPropInteract: vi.fn(),
    });
    const fsm = (cat as unknown as { fsm: { transition: (s: string, f?: boolean) => void } }).fsm;

    // Grounded expressive & social states
    for (const st of [
      'KNEADING',
      'SLOW_BLINK',
      'POUNCE_WIGGLE',
      'CHATTER',
      'STARE_VOID',
      'HEAD_BUNT',
      'FLEHMEN',
      'PAW_TEST',
      'OVERSTIMULATED',
      'IGNORE_USER',
    ] as const) {
      fsm.transition(st, true);
      expect(cat.getState()).toBe(st);
      for (let i = 0; i < 10; i++) cat.update(1 / 60, ctx);
      expect(Number.isFinite(cat.getPosition().x)).toBe(true);
    }

    // DRINKING on garden koi pond
    propWorld.setTheme('garden');
    ctx.interactiveProps = propWorld.getProps();
    fsm.transition('DRINKING', true);
    expect(cat.getState()).toBe('DRINKING');
    for (let i = 0; i < 15; i++) cat.update(1 / 60, ctx);

    // LITTER_USE -> ZOOMIES transition after completing litter cycle
    propWorld.setTheme('bedroom');
    ctx.interactiveProps = propWorld.getProps();
    const litterBox = propWorld.getProps().find((p) => p.interactionType === 'litter')!;
    cat.getBody().x = litterBox.interactPoint!.x;
    cat.getBody().y = litterBox.interactPoint!.y;
    fsm.transition('LITTER_USE', true);
    expect(cat.getState()).toBe('LITTER_USE');
    let sawPostLitterZoomies = false;
    for (let i = 0; i < 280; i++) {
      cat.update(1 / 60, ctx);
      if (cat.getState() === 'ZOOMIES') {
        sawPostLitterZoomies = true;
        break;
      }
    }
    expect(sawPostLitterZoomies).toBe(true);

    // CUCUMBER_SCARE -> massive vertical panic leap (> 60px)
    cat.getBody().x = 640;
    cat.getBody().y = 360;
    cat.triggerCucumberScare({ x: 610, y: 360 });
    expect(cat.getState()).toBe('CUCUMBER_SCARE');
    let cucumberPeakZ = 0;
    for (let i = 0; i < 45; i++) {
      cat.update(1 / 60, ctx);
      cucumberPeakZ = Math.max(cucumberPeakZ, cat.getZHeight());
    }
    expect(cucumberPeakZ).toBeGreaterThan(60);

    // CARRY_GIFT picks up mouse toy and drops at edge
    const mouse = toyWorld.spawnToy('mouse_toy', cat.getPosition().x + 6, cat.getPosition().y + 4);
    ctx.toys = toyWorld.getToys();
    fsm.transition('CARRY_GIFT', true);
    expect(cat.getState()).toBe('CARRY_GIFT');
    for (let i = 0; i < 420; i++) {
      cat.update(1 / 60, ctx);
      if (cat.getState() === 'MEERKAT_PEEK') break;
    }
    expect(carriedLog.some((e) => e.toyId === mouse.id && e.catId === cat.id)).toBe(true);

    // TASKBAR_WALK walks along window/taskbar ledge cleanly
    fsm.transition('TASKBAR_WALK', true);
    expect(cat.getState()).toBe('TASKBAR_WALK');
    for (let i = 0; i < 30; i++) cat.update(1 / 60, ctx);
    expect(Number.isFinite(cat.getPosition().x)).toBe(true);
  }, 15000);
});
