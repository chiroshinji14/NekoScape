import { Container, Graphics } from 'pixi.js';
import { DynamicFsm } from '../core/DynamicFsm';
import { PerlinNoise } from '../core/PerlinNoise';
import type { CircleBody, PhysicsWorld } from '../core/PhysicsWorld';
import type { SurfaceManager } from '../core/SurfaceManager';
import { SpineChain, VerletChain } from '../core/VerletChain';
import {
  BONK_DAZE_DURATION,
  IDLE_NAP_SECONDS,
  WIGGLE_DURATION,
  type AabbRect,
  type CatBreed,
  type CatStateName,
  type LaserTarget,
  type Vec2,
} from '../types/simulation';
import type { CardboardBox } from './CardboardBox';
import {
  drawBodyMarkings,
  drawHeadMarkings,
  getCoatProfile,
  type CatCoatProfile,
} from './CatCoatGenerator';
import type { ParticleSystem } from './ParticleSystem';
import { assignCatToLaserTarget } from './PrismMath';
import type { YarnBall } from './YarnBall';

const CAT_RADIUS = 17;
const HEAD_TORSO_LEN = 15;
const TORSO_HIPS_LEN = 17;
const TAIL_NODES = 5;
const TAIL_SEG_LEN = 7.5;

export interface CatContext {
  physics: PhysicsWorld;
  surfaceManager: SurfaceManager;
  laserTarget?: LaserTarget | null;
  laserTargets?: readonly LaserTarget[];
  yarnBall?: YarnBall | null;
  cardboardBox?: CardboardBox | null;
  particles?: ParticleSystem | null;
  idleSeconds: number;
  idleNapSeconds?: number;
  typingActive: boolean;
  nightMode: boolean;
  onPounce?: (cat: CatEntity) => void;
  onBonk?: (cat: CatEntity) => void;
  onIconScratch?: (iconId: number, cat: CatEntity) => void;
  onIconPerchChange?: (catId: number, iconId: number | null) => void;
  occupiedIconIds?: ReadonlySet<number>;
  sceneObstacles?: readonly AabbRect[];
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngle(current: number, target: number, t: number): number {
  const diff = normalizeAngle(target - current);
  return normalizeAngle(current + diff * Math.min(1, Math.max(0, t)));
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Top-down 90-degree procedural cat backed by a 3-node SpineChain,
 * 5-node VerletChain tail, and DynamicFsm behavior controller.
 */
export class CatEntity extends Container {
  readonly id: number;
  readonly breed: CatBreed;
  readonly shadowGraphics: Graphics;

  private readonly profile: CatCoatProfile;
  private readonly body: CircleBody;
  private readonly spine: SpineChain;
  private readonly tail: VerletChain;
  private readonly noise: PerlinNoise;
  private readonly fsm: DynamicFsm<CatStateName, CatEntity>;

  private readonly bodyGraphics: Graphics;
  private readonly headGraphics: Graphics;

  private ctx!: CatContext;
  private time = 0;
  private heading: number;
  private headAngle: number;
  private walkPhase = 0;

  private zHeight = 0;
  private pounceDuration = 0.46;
  private startleFrom: Vec2 | null = null;
  private investigatePoint: Vec2 | null = null;
  private investigateSniffTimer = 0;

  private activeTarget: Vec2 | null = null;
  private stateTargetDuration = 2.5;
  private wanderHeading = 0;
  private napSpot: Vec2 | null = null;
  private boxStayTimer = 0;
  private boxCooldown = 0;
  private boxLastPos: Vec2 | null = null;
  private headingForBox = false;

  private jumpStartPos: Vec2 = { x: 0, y: 0 };
  private jumpEndPos: Vec2 = { x: 0, y: 0 };
  private jumpTakenOff = false;
  private jumpOutNextState: CatStateName = 'WANDER';

  private iconInteractCooldown = 0;
  private iconCheckTimer = 0.8;
  private targetIcon: AabbRect | null = null;
  private perchedIconId: number | null = null;
  private perchDuration = 7;
  private perchHopDownActive = false;
  private perchHopDownTime = 0;
  private perchHopDownDuration = 0.36;
  private perchLastIconCenter: Vec2 | null = null;

  private scratchDuration = 2;
  private scratchBurstTimer = 0;
  private scratchEdgePoint: Vec2 = { x: 0, y: 0 };

  private pendingIconPlay: { icon: AabbRect; mode: 'perch' | 'scratch' } | null = null;
  private exitLeapGraceTimer = 0;
  private petInPlaceHold = false;

  private blinkTimer = 0;
  private blinkDuration = 0;
  private earTwitchLeft = 0;
  private earTwitchRight = 0;
  private earTwitchTimer = 2.2;

  private squashX = 1;
  private squashY = 1;
  private sleepZTimer = 0;
  private purrTimer = 0;
  private petHoldTimer = 0;

  private lastSyncedBodyX: number;
  private lastSyncedBodyY: number;

  constructor(id: number, breed: CatBreed, x: number, y: number) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.id = id;
    this.breed = breed;
    this.profile = getCoatProfile(breed);

    this.heading = ((id * 1.93) % (Math.PI * 2)) - Math.PI;
    this.headAngle = this.heading;
    this.wanderHeading = this.heading;

    this.body = {
      x,
      y,
      vx: 0,
      vy: 0,
      radius: CAT_RADIUS,
    };
    this.lastSyncedBodyX = x;
    this.lastSyncedBodyY = y;

    this.spine = new SpineChain(HEAD_TORSO_LEN, TORSO_HIPS_LEN, 0.95);
    this.spine.reset(x, y, this.heading);

    this.tail = new VerletChain(
      TAIL_NODES,
      TAIL_SEG_LEN,
      this.spine.hips.x - Math.cos(this.heading) * 10,
      this.spine.hips.y - Math.sin(this.heading) * 10,
      0.89,
    );

    this.noise = new PerlinNoise(1009 + id * 97);
    this.blinkTimer = 1.6 + (id % 5) * 0.7;
    this.iconInteractCooldown = 3 + (id % 5) * 1.8;

    this.shadowGraphics = new Graphics();
    this.bodyGraphics = new Graphics();
    this.headGraphics = new Graphics();

    this.addChild(this.shadowGraphics);
    this.addChild(this.bodyGraphics);
    this.addChild(this.headGraphics);

    this.fsm = this.buildFsm();
    this.renderCat();
  }

  attachShadowTo(shadowsLayer: Container): void {
    shadowsLayer.addChild(this.shadowGraphics);
  }

  triggerPet(): void {
    this.petHoldTimer = 1.25;
    this.pendingIconPlay = null;
    const prevState = this.fsm.state;
    if (prevState === 'IN_BOX' || prevState === 'JUMP_TO_BOX' || prevState === 'JUMP_OUT_BOX') {
      this.ctx?.cardboardBox?.release(this.id);
      this.boxCooldown = Math.max(this.boxCooldown, 9);
      this.petInPlaceHold = true;
    } else if (prevState === 'PERCH_ICON' || prevState === 'JUMP_TO_ICON') {
      this.petInPlaceHold = true;
    }
    if (prevState !== 'PETTED') {
      this.fsm.transition('PETTED');
    }
  }

  triggerInvestigate(point: Vec2): void {
    this.investigatePoint = { x: point.x, y: point.y };
    this.investigateSniffTimer = 0;
    this.pendingIconPlay = null;
    if (this.fsm.state === 'IDLE' || this.fsm.state === 'WANDER') {
      this.fsm.transition('STALK');
    }
  }

  triggerStartle(from: Vec2): void {
    this.startleFrom = { x: from.x, y: from.y };
    this.pendingIconPlay = null;
    this.petInPlaceHold = false;
    const prevState = this.fsm.state;
    if (prevState === 'IN_BOX' || prevState === 'JUMP_TO_BOX' || prevState === 'JUMP_OUT_BOX') {
      this.ctx?.cardboardBox?.release(this.id);
      this.boxCooldown = Math.max(this.boxCooldown, 9);
      this.exitLeapGraceTimer = 0.26;
    } else if (prevState === 'PERCH_ICON' || prevState === 'JUMP_TO_ICON') {
      this.exitLeapGraceTimer = 0.26;
    }
    this.fsm.transition('STARTLED', true);
  }

  triggerPlayWithIcon(icon: AabbRect, mode: 'perch' | 'scratch'): void {
    const state = this.fsm.state;
    const iconCopy: AabbRect = { ...icon };
    this.napSpot = null;
    this.investigatePoint = null;

    if (state === 'IN_BOX') {
      this.pendingIconPlay = { icon: iconCopy, mode };
      this.jumpOutNextState = 'WANDER';
      this.fsm.transition('JUMP_OUT_BOX');
      return;
    }
    if (state === 'JUMP_TO_BOX' || state === 'JUMP_OUT_BOX' || state === 'JUMP_TO_ICON') {
      this.pendingIconPlay = { icon: iconCopy, mode };
      return;
    }
    if (state === 'PERCH_ICON') {
      if (mode === 'perch' && this.perchedIconId === iconCopy.id && !this.perchHopDownActive) {
        return;
      }
      this.pendingIconPlay = { icon: iconCopy, mode };
      if (!this.perchHopDownActive) {
        this.beginIconHopDown(this.findObstacleById(this.perchedIconId) ?? iconCopy);
      }
      return;
    }

    if (mode === 'perch') {
      const tx = iconCopy.x + iconCopy.width * 0.5;
      const ty = iconCopy.y + iconCopy.height * 0.36;
      const dist = Math.hypot(tx - this.body.x, ty - this.body.y);
      if (dist <= 155 && !this.ctx?.occupiedIconIds?.has(iconCopy.id)) {
        this.pendingIconPlay = null;
        this.targetIcon = iconCopy;
        this.fsm.transition('JUMP_TO_ICON', true);
        return;
      }
    } else {
      const edgeX = clamp(this.body.x, iconCopy.x, iconCopy.x + iconCopy.width);
      const edgeY = clamp(this.body.y, iconCopy.y, iconCopy.y + iconCopy.height);
      const edgeDist = Math.hypot(edgeX - this.body.x, edgeY - this.body.y);
      if (edgeDist <= 46) {
        this.pendingIconPlay = null;
        this.targetIcon = iconCopy;
        this.fsm.transition('SCRATCH_ICON', true);
        return;
      }
    }

    this.pendingIconPlay = { icon: iconCopy, mode };
    this.fsm.transition('WANDER', true);
  }

  isElevated(): boolean {
    const state = this.fsm.state;
    return (
      this.zHeight > 0.12 ||
      state === 'PERCH_ICON' ||
      state === 'JUMP_TO_BOX' ||
      state === 'JUMP_OUT_BOX' ||
      state === 'JUMP_TO_ICON'
    );
  }

  getPerchedIconId(): number | null {
    return this.perchedIconId;
  }

  getState(): CatStateName {
    return this.fsm.state;
  }

  getPosition(): Vec2 {
    return { x: this.body.x, y: this.body.y };
  }

  getVelocity(): Vec2 {
    return { x: this.body.vx, y: this.body.vy };
  }

  getBody(): CircleBody {
    return this.body;
  }

  getRadius(): number {
    return this.body.radius;
  }

  getZHeight(): number {
    return this.zHeight;
  }

  getHeading(): number {
    return this.heading;
  }

  getBreed(): CatBreed {
    return this.breed;
  }

  containsPoint(x: number, y: number): boolean {
    return Math.hypot(x - this.body.x, y - this.body.y) <= this.body.radius + 10;
  }

  update(dt: number, ctx: CatContext): void {
    const safeDt = Math.max(0, Math.min(dt, 0.05));
    this.ctx = ctx;
    this.time += safeDt;

    if (this.boxCooldown > 0) {
      this.boxCooldown = Math.max(0, this.boxCooldown - safeDt);
    }
    if (this.iconInteractCooldown > 0) {
      this.iconInteractCooldown = Math.max(0, this.iconInteractCooldown - safeDt);
    }
    if (this.iconCheckTimer > 0) {
      this.iconCheckTimer = Math.max(0, this.iconCheckTimer - safeDt);
    }
    if (this.exitLeapGraceTimer > 0) {
      this.exitLeapGraceTimer = Math.max(0, this.exitLeapGraceTimer - safeDt);
    }

    // Preserve spine alignment if external circle-circle collision moved body
    const extDx = this.body.x - this.lastSyncedBodyX;
    const extDy = this.body.y - this.lastSyncedBodyY;
    if (Math.abs(extDx) > 0.001 || Math.abs(extDy) > 0.001) {
      this.spine.moveHeadTo(this.spine.head.x + extDx, this.spine.head.y + extDy, this.heading);
    }

    // Recover squash & stretch smoothly
    const recover = 1 - Math.exp(-safeDt * 12);
    this.squashX += (1 - this.squashX) * recover;
    this.squashY += (1 - this.squashY) * recover;

    this.updateFacialIdleTimers(safeDt);

    // Step active FSM behavior
    this.fsm.update(safeDt);

    // Integrate physics for grounded non-static states
    const state = this.fsm.state;
    const isGrounded =
      state !== 'IN_BOX' &&
      state !== 'JUMP_TO_BOX' &&
      state !== 'JUMP_OUT_BOX' &&
      state !== 'JUMP_TO_ICON' &&
      state !== 'PERCH_ICON';

    if (isGrounded && state !== 'NAP') {
      ctx.physics.applySurfaceFriction(this.body, safeDt);
      this.body.x += this.body.vx * safeDt;
      this.body.y += this.body.vy * safeDt;

      if (this.exitLeapGraceTimer > 0 || (state === 'PETTED' && this.petInPlaceHold)) {
        const wallHit = ctx.physics.clampToBounds(this.body, 0.4);
        if (wallHit && wallHit.bonked && state !== 'BONK') {
          this.fsm.transition('BONK', true);
        }
      } else {
        const box = ctx.cardboardBox;
        const hasBoxObstacle = Boolean(box && box.isVisible() && box.occupantId !== this.id);
        const sceneObs = ctx.sceneObstacles;
        let extraObstacles: readonly AabbRect[] | undefined;
        if (hasBoxObstacle && box && sceneObs && sceneObs.length > 0) {
          extraObstacles = [box.getExteriorObstacle(), ...sceneObs];
        } else if (hasBoxObstacle && box) {
          extraObstacles = [box.getExteriorObstacle()];
        } else if (sceneObs && sceneObs.length > 0) {
          extraObstacles = sceneObs;
        }

        // Collide with desktop icons, cardboard box exterior, and bounds (restitution 0.4 for bonk rebound)
        const obsHit = ctx.physics.resolveAllObstacles(this.body, 0.4, extraObstacles);
        const wallHit = ctx.physics.clampToBounds(this.body, 0.4);
        const hit = obsHit?.bonked ? obsHit : wallHit?.bonked ? wallHit : obsHit ?? wallHit;

        if (hit && hit.bonked && state !== 'BONK') {
          this.fsm.transition('BONK', true);
        }
      }

      // Bat rolling/stationary yarn ball on contact
      this.handleYarnInteraction();
    } else {
      this.body.vx = 0;
      this.body.vy = 0;
    }

    // Update SpineChain and Verlet tail
    this.updateSpineAndTail(safeDt);

    this.lastSyncedBodyX = this.body.x;
    this.lastSyncedBodyY = this.body.y;

    this.renderCat();
  }

  private buildFsm(): DynamicFsm<CatStateName, CatEntity> {
    const fsm = new DynamicFsm<CatStateName, CatEntity>('IDLE', this);

    fsm.register('IDLE', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.stateTargetDuration = 1.6 + Math.abs(cat.noise.noise2D(cat.time, cat.id * 3.1)) * 2.6;
        cat.napSpot = null;
      },
      onUpdate: (cat, dt, stateTime) => {
        const target = cat.resolveLaserTarget();
        if (target) {
          cat.activeTarget = { x: target.x, y: target.y };
          cat.fsm.transition('STALK');
          return;
        }

        if (cat.investigatePoint) {
          cat.fsm.transition('STALK');
          return;
        }

        const yarn = cat.ctx.yarnBall;
        if (yarn && yarn.isRolling()) {
          const yp = yarn.getPosition();
          if (Math.hypot(yp.x - cat.body.x, yp.y - cat.body.y) < 380) {
            cat.activeTarget = yp;
            cat.fsm.transition('STALK');
            return;
          }
        }

        const napThreshold = cat.ctx.idleNapSeconds ?? IDLE_NAP_SECONDS;
        if (cat.ctx.idleSeconds >= napThreshold) {
          if (cat.ctx.surfaceManager.isOnRug(cat.body.x, cat.body.y) || stateTime > 2.5) {
            cat.fsm.transition('NAP');
            return;
          }
          cat.napSpot = cat.ctx.surfaceManager.getRandomRugSpot(28);
          cat.fsm.transition('WANDER');
          return;
        }

        // Gentle head gaze during idle or typing observation
        if (cat.ctx.typingActive) {
          if (!cat.ctx.surfaceManager.isOnRug(cat.body.x, cat.body.y)) {
            cat.napSpot = cat.ctx.surfaceManager.getRandomRugSpot(26);
            cat.fsm.transition('WANDER');
            return;
          }
          // Gaze slightly upward toward typing user
          cat.headAngle = lerpAngle(cat.headAngle, -Math.PI * 0.5 + Math.sin(cat.time * 0.9 + cat.id) * 0.2, dt * 3);
        } else {
          const lookOffset = cat.noise.noise2D(cat.time * 0.35, cat.id * 7.7) * 0.65;
          cat.headAngle = lerpAngle(cat.headAngle, cat.heading + lookOffset, dt * 2.8);
        }

        if (cat.pendingIconPlay) {
          cat.fsm.transition('WANDER');
          return;
        }

        // Check nearby open cardboard box or nearby desktop icons
        if (!cat.ctx.typingActive) {
          if (cat.tryEnterBox()) {
            return;
          }
          if (cat.tryInteractWithNearbyIcon()) {
            return;
          }
        }

        if (!cat.ctx.typingActive && stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('WANDER');
        }
      },
    });

    fsm.register('WANDER', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.headingForBox = false;
        cat.stateTargetDuration = 2.4 + Math.abs(cat.noise.noise2D(cat.time * 1.3, cat.id * 5.2)) * 3.4;
        cat.wanderHeading = cat.heading + cat.noise.noise2D(cat.time * 0.7, cat.id * 2.1) * 1.4;
      },
      onUpdate: (cat, dt, stateTime) => {
        const laser = cat.resolveLaserTarget();
        if (laser) {
          cat.pendingIconPlay = null;
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.fsm.transition('STALK');
          return;
        }

        if (cat.investigatePoint) {
          cat.pendingIconPlay = null;
          cat.fsm.transition('STALK');
          return;
        }

        const yarn = cat.ctx.yarnBall;
        if (yarn && yarn.isRolling()) {
          const yp = yarn.getPosition();
          if (Math.hypot(yp.x - cat.body.x, yp.y - cat.body.y) < 360) {
            cat.pendingIconPlay = null;
            cat.activeTarget = yp;
            cat.fsm.transition('STALK');
            return;
          }
        }

        const napThreshold = cat.ctx.idleNapSeconds ?? IDLE_NAP_SECONDS;
        if (cat.ctx.idleSeconds >= napThreshold) {
          cat.pendingIconPlay = null;
          if (!cat.napSpot) {
            cat.napSpot = cat.ctx.surfaceManager.getRandomRugSpot(28);
          }
          if (cat.ctx.surfaceManager.isOnRug(cat.body.x, cat.body.y) || stateTime > 4.0) {
            cat.fsm.transition('NAP');
            return;
          }
        }

        // Handle explicit UI/demo icon play target first
        if (cat.pendingIconPlay) {
          cat.headingForBox = false;
          const play = cat.pendingIconPlay;
          const liveIcon = cat.findObstacleById(play.icon.id) ?? play.icon;

          if (play.mode === 'perch') {
            if (cat.ctx.occupiedIconIds?.has(liveIcon.id)) {
              cat.pendingIconPlay = null;
            } else {
              const tx = liveIcon.x + liveIcon.width * 0.5;
              const ty = liveIcon.y + liveIcon.height * 0.36;
              const dist = Math.hypot(tx - cat.body.x, ty - cat.body.y);
              if (dist <= 145) {
                cat.pendingIconPlay = null;
                cat.targetIcon = { ...liveIcon };
                cat.fsm.transition('JUMP_TO_ICON');
                return;
              }
              const rawAng = Math.atan2(ty - cat.body.y, tx - cat.body.x);
              const desiredAngle = cat.computeObstacleAvoidanceAngle(rawAng, liveIcon.id);
              cat.heading = lerpAngle(cat.heading, desiredAngle, dt * 6.5);
              cat.headAngle = lerpAngle(cat.headAngle, rawAng, dt * 7.5);
              const accel = 145 * 5.5;
              cat.body.vx += Math.cos(cat.heading) * accel * dt;
              cat.body.vy += Math.sin(cat.heading) * accel * dt;
              return;
            }
          } else {
            const edgeX = clamp(cat.body.x, liveIcon.x, liveIcon.x + liveIcon.width);
            const edgeY = clamp(cat.body.y, liveIcon.y, liveIcon.y + liveIcon.height);
            const edgeDist = Math.hypot(edgeX - cat.body.x, edgeY - cat.body.y);
            if (edgeDist <= 42) {
              cat.pendingIconPlay = null;
              cat.targetIcon = { ...liveIcon };
              cat.fsm.transition('SCRATCH_ICON');
              return;
            }
            const rawAng = Math.atan2(edgeY - cat.body.y, edgeX - cat.body.x);
            const desiredAngle = cat.computeObstacleAvoidanceAngle(rawAng, liveIcon.id);
            cat.heading = lerpAngle(cat.heading, desiredAngle, dt * 6.5);
            cat.headAngle = lerpAngle(cat.headAngle, rawAng, dt * 7.5);
            const accel = 145 * 5.5;
            cat.body.vx += Math.cos(cat.heading) * accel * dt;
            cat.body.vy += Math.sin(cat.heading) * accel * dt;
            return;
          }
        }

        // Check CardboardBox claim & icon interactions while wandering
        cat.headingForBox = false;
        const box = cat.ctx.cardboardBox;
        if (cat.ctx.idleSeconds < napThreshold && !cat.napSpot) {
          if (cat.tryEnterBox()) {
            return;
          }
          if (!cat.ctx.typingActive && cat.tryInteractWithNearbyIcon()) {
            return;
          }
          if (box && box.isVisible() && box.occupantId === null && cat.boxCooldown <= 0) {
            const bp = box.getPosition();
            const distToBox = Math.hypot(bp.x - cat.body.x, bp.y - cat.body.y);
            if (distToBox < 160 && (cat.id + Math.floor(cat.time)) % 3 === 0) {
              cat.headingForBox = true;
              cat.wanderHeading = Math.atan2(bp.y - cat.body.y, bp.x - cat.body.x);
            }
          }
        }

        let desiredAngle: number;
        let targetSpeed = 95;

        if (cat.napSpot) {
          desiredAngle = Math.atan2(cat.napSpot.y - cat.body.y, cat.napSpot.x - cat.body.x);
          targetSpeed = 120;
        } else {
          // Organic Perlin noise steering + soft obstacle/edge steering
          if (!cat.headingForBox) {
            const nVal = cat.noise.noise2D(cat.time * 0.42 + cat.id * 3.7, cat.id * 11.1);
            cat.wanderHeading = normalizeAngle(cat.wanderHeading + nVal * dt * 2.1);

            // Gentle attraction toward center rug
            const rug = cat.ctx.surfaceManager.getRugBounds();
            const rugCx = rug.x + rug.width * 0.5;
            const rugCy = rug.y + rug.height * 0.5;
            const dxRug = rugCx - cat.body.x;
            const dyRug = rugCy - cat.body.y;
            const distRug = Math.hypot(dxRug, dyRug);
            if (distRug > Math.max(rug.width, rug.height) * 0.72) {
              const toCenter = Math.atan2(dyRug, dxRug);
              cat.wanderHeading = lerpAngle(cat.wanderHeading, toCenter, dt * 0.75);
            }
          }

          desiredAngle = cat.computeObstacleAvoidanceAngle(cat.wanderHeading);
        }

        cat.heading = lerpAngle(cat.heading, desiredAngle, dt * 5.2);
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading, dt * 6.5);

        const accel = targetSpeed * 5.5;
        cat.body.vx += Math.cos(cat.heading) * accel * dt;
        cat.body.vy += Math.sin(cat.heading) * accel * dt;

        if (!cat.napSpot && !cat.pendingIconPlay && stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.headingForBox = false;
      },
    });

    fsm.register('STALK', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.investigateSniffTimer = 0;
      },
      onUpdate: (cat, dt, stateTime) => {
        const laser = cat.resolveLaserTarget();
        const yarn = cat.ctx.yarnBall;
        const yarnActive = yarn && yarn.isRolling() ? yarn.getPosition() : null;

        let targetPos: Vec2 | null = null;
        let isInvestigate = false;

        if (laser) {
          targetPos = { x: laser.x, y: laser.y };
        } else if (yarnActive) {
          targetPos = yarnActive;
        } else if (cat.investigatePoint) {
          targetPos = cat.investigatePoint;
          isInvestigate = true;
        }

        if (!targetPos) {
          cat.fsm.transition('IDLE');
          return;
        }

        cat.activeTarget = targetPos;
        const dx = targetPos.x - cat.body.x;
        const dy = targetPos.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const angleToTarget = Math.atan2(dy, dx);

        cat.heading = lerpAngle(cat.heading, angleToTarget, dt * 7);
        cat.headAngle = lerpAngle(cat.headAngle, angleToTarget, dt * 10);

        if (isInvestigate) {
          if (dist < 46) {
            // Sniff the newly arrived file/icon perimeter
            cat.body.vx *= Math.pow(0.7, dt * 60);
            cat.body.vy *= Math.pow(0.7, dt * 60);
            cat.investigateSniffTimer += dt;
            cat.headAngle = angleToTarget + Math.sin(cat.time * 14) * 0.14;
            if (cat.investigateSniffTimer >= 1.15) {
              cat.investigatePoint = null;
              cat.fsm.transition('IDLE');
            }
            return;
          }
          const crawlSpeed = 76;
          cat.body.vx += Math.cos(cat.heading) * crawlSpeed * 5.2 * dt;
          cat.body.vy += Math.sin(cat.heading) * crawlSpeed * 5.2 * dt;
          return;
        }

        // 0.3x low stealth crawl speed relative to brisk trot/sprint (~165 -> ~50 px/s)
        const stealthAccel = 52 * 6.0;
        cat.body.vx += Math.cos(cat.heading) * stealthAccel * dt;
        cat.body.vy += Math.sin(cat.heading) * stealthAccel * dt;

        // Transition to WIGGLE once in pounce range
        if (dist <= 145 && dist >= 24 && stateTime >= 0.45) {
          cat.fsm.transition('WIGGLE');
        } else if (dist < 24 && stateTime >= 0.3) {
          cat.fsm.transition('WIGGLE');
        }
      },
    });

    fsm.register('WIGGLE', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx *= 0.25;
        cat.body.vy *= 0.25;
      },
      onUpdate: (cat, dt, stateTime) => {
        const laser = cat.resolveLaserTarget();
        if (laser) {
          cat.activeTarget = { x: laser.x, y: laser.y };
        } else if (cat.ctx.yarnBall?.isRolling()) {
          cat.activeTarget = cat.ctx.yarnBall.getPosition();
        }

        if (cat.activeTarget) {
          const ang = Math.atan2(cat.activeTarget.y - cat.body.y, cat.activeTarget.x - cat.body.x);
          cat.heading = lerpAngle(cat.heading, ang, dt * 11);
          cat.headAngle = cat.heading;
        }

        // Stationary torso while hips oscillate at 12Hz
        cat.body.vx *= Math.pow(0.72, dt * 60);
        cat.body.vy *= Math.pow(0.72, dt * 60);

        if (stateTime >= WIGGLE_DURATION) {
          cat.fsm.transition('POUNCE');
        }
      },
    });

    fsm.register('POUNCE', {
      onEnter: (cat) => {
        cat.pounceDuration = 0.46;
        cat.zHeight = 0.05;
        const target = cat.activeTarget;
        if (target) {
          cat.heading = Math.atan2(target.y - cat.body.y, target.x - cat.body.x);
        }
        cat.headAngle = cat.heading;
        // High-velocity pounce impulse (> 350 BONK_VELOCITY_THRESHOLD so icon impact bonks)
        const impulse = 560;
        cat.body.vx = Math.cos(cat.heading) * impulse;
        cat.body.vy = Math.sin(cat.heading) * impulse;
        cat.squashX = 1.2;
        cat.squashY = 0.84;

        cat.ctx?.particles?.spawnDustPuff(
          cat.body.x - Math.cos(cat.heading) * 12,
          cat.body.y - Math.sin(cat.heading) * 12,
          -cat.body.vx * 0.2,
          -cat.body.vy * 0.2,
        );
        cat.ctx?.onPounce?.(cat);
      },
      onUpdate: (cat, _dt, stateTime) => {
        const u = clamp(stateTime / cat.pounceDuration, 0, 1);
        // Parabolic height arc z(t) peaking at 1.0
        cat.zHeight = 4 * u * (1 - u);

        if (stateTime >= cat.pounceDuration) {
          cat.zHeight = 0;
          cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, cat.body.vx * 0.2, cat.body.vy * 0.2);
          const laser = cat.resolveLaserTarget();
          cat.fsm.transition(laser ? 'STALK' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
      },
    });

    fsm.register('BONK', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        // PhysicsWorld already applies 0.4 normal rebound; keep rebound crisp and legible
        cat.squashX = 0.72;
        cat.squashY = 1.3;
        cat.ctx?.particles?.spawnBonkBurst(cat.body.x, cat.body.y);
        cat.ctx?.onBonk?.(cat);
      },
      onUpdate: (cat, _dt, stateTime) => {
        cat.headAngle = cat.heading + Math.sin(stateTime * 28) * 0.28;
        if (stateTime >= BONK_DAZE_DURATION) {
          cat.fsm.transition('IDLE');
        }
      },
    });

    fsm.register('NAP', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.sleepZTimer = 0.6;
        cat.napSpot = null;
      },
      onUpdate: (cat, dt) => {
        cat.sleepZTimer += dt;
        if (cat.sleepZTimer >= 1.75) {
          cat.sleepZTimer = 0;
          cat.ctx?.particles?.spawnSleepZ(cat.spine.head.x + 6, cat.spine.head.y - 10);
        }

        const laser = cat.resolveLaserTarget();
        if (laser) {
          const dist = Math.hypot(laser.x - cat.body.x, laser.y - cat.body.y);
          if (dist < 220) {
            cat.activeTarget = { x: laser.x, y: laser.y };
            cat.fsm.transition('STALK');
            return;
          }
        }

        const napThreshold = cat.ctx.idleNapSeconds ?? IDLE_NAP_SECONDS;
        if (cat.ctx.idleSeconds < napThreshold * 0.2 && cat.ctx.typingActive) {
          cat.fsm.transition('IDLE');
        }
      },
    });

    fsm.register('PETTED', {
      onEnter: (cat, prevState) => {
        cat.zHeight = prevState === 'PERCH_ICON' ? 0.28 : 0;
        cat.purrTimer = 0.08;
      },
      onUpdate: (cat, dt) => {
        cat.body.vx *= Math.pow(0.75, dt * 60);
        cat.body.vy *= Math.pow(0.75, dt * 60);
        cat.petHoldTimer -= dt;
        cat.purrTimer += dt;

        // Gentle happy head nuzzle
        cat.headAngle = cat.heading + Math.sin(cat.time * 4.5) * 0.18;

        if (cat.purrTimer >= 0.24) {
          cat.purrTimer = 0;
          cat.ctx?.particles?.spawnPurr(cat.spine.head.x, cat.spine.head.y - 8);
        }

        if (cat.petHoldTimer <= 0) {
          const wasInPlace = cat.petInPlaceHold;
          cat.petInPlaceHold = false;
          if (wasInPlace) {
            const box = cat.ctx?.cardboardBox;
            if (box && box.isVisible() && cat.overlapsRect(box.getExteriorObstacle(), 4)) {
              cat.jumpOutNextState = 'WANDER';
              cat.fsm.transition('JUMP_OUT_BOX');
              return;
            }
            const icon = cat.findOverlappingObstacle(4);
            if (icon) {
              cat.targetIcon = null;
              cat.fsm.transition('PERCH_ICON');
              cat.beginIconHopDown(icon);
              return;
            }
          }
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.petInPlaceHold = false;
        cat.zHeight = 0;
      },
    });

    fsm.register('STARTLED', {
      onEnter: (cat) => {
        const origin = cat.startleFrom ?? { x: cat.body.x - 40, y: cat.body.y };
        const awayAngle = Math.atan2(cat.body.y - origin.y, cat.body.x - origin.x);
        cat.heading = awayAngle;
        cat.headAngle = awayAngle;
        cat.body.vx = Math.cos(awayAngle) * 450;
        cat.body.vy = Math.sin(awayAngle) * 450;
        cat.squashX = 1.18;
        cat.squashY = 0.85;
        if (cat.exitLeapGraceTimer > 0) {
          cat.zHeight = Math.max(cat.zHeight, 0.25);
        }
        cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, -cat.body.vx * 0.25, -cat.body.vy * 0.25);
      },
      onUpdate: (cat, _dt, stateTime) => {
        const leapDur = 0.42;
        if (stateTime < leapDur) {
          const u = stateTime / leapDur;
          cat.zHeight = Math.max(4 * u * (1 - u), cat.exitLeapGraceTimer > 0 ? 0.24 * (1 - u) : 0);
        } else {
          cat.zHeight = 0;
        }
        if (stateTime >= 0.68) {
          cat.zHeight = 0;
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
      },
    });

    fsm.register('JUMP_TO_BOX', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.jumpStartPos = { x: cat.body.x, y: cat.body.y };
        cat.jumpTakenOff = false;

        const box = cat.ctx?.cardboardBox;
        if (!box || !box.isVisible()) {
          cat.fsm.transition('IDLE');
          return;
        }
        const bp = box.getPosition();
        cat.jumpEndPos = { x: bp.x, y: bp.y };
        const dx = bp.x - cat.body.x;
        const dy = bp.y - cat.body.y;
        if (Math.hypot(dx, dy) > 1) {
          cat.heading = Math.atan2(dy, dx);
          cat.headAngle = cat.heading;
        }
        cat.squashX = 0.88;
        cat.squashY = 1.12;
      },
      onUpdate: (cat, _dt, stateTime) => {
        const box = cat.ctx?.cardboardBox;
        if (!box || !box.isVisible() || (box.occupantId !== null && box.occupantId !== cat.id)) {
          cat.fsm.transition('IDLE');
          return;
        }

        const bp = box.getPosition();
        cat.jumpEndPos.x = bp.x;
        cat.jumpEndPos.y = bp.y;
        cat.body.vx = 0;
        cat.body.vy = 0;

        const crouchDur = 0.18;
        const flightDur = 0.44;

        if (stateTime < crouchDur) {
          cat.zHeight = 0;
          cat.squashX = 0.88;
          cat.squashY = 1.12;
          const dx = bp.x - cat.body.x;
          const dy = bp.y - cat.body.y;
          if (Math.hypot(dx, dy) > 1) {
            cat.heading = Math.atan2(dy, dx);
            cat.headAngle = cat.heading;
          }
          return;
        }

        if (!cat.jumpTakenOff) {
          cat.jumpTakenOff = true;
          cat.squashX = 1.18;
          cat.squashY = 0.86;
          cat.ctx?.particles?.spawnDustPuff(
            cat.jumpStartPos.x,
            cat.jumpStartPos.y,
            -Math.cos(cat.heading) * 35,
            -Math.sin(cat.heading) * 35,
          );
        }

        const u = clamp((stateTime - crouchDur) / flightDur, 0, 1);
        cat.zHeight = 4 * u * (1 - u);
        const ease = 1 - (1 - u) * (1 - u);
        cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * ease;
        cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * ease;

        if (u >= 1) {
          cat.zHeight = 0;
          cat.body.x = cat.jumpEndPos.x;
          cat.body.y = cat.jumpEndPos.y;
          cat.squashX = 1.14;
          cat.squashY = 0.88;
          cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, 0, 0);
          cat.fsm.transition('IN_BOX');
        }
      },
      onExit: (cat, nextState) => {
        cat.zHeight = 0;
        if (nextState !== 'IN_BOX') {
          cat.ctx?.cardboardBox?.release(cat.id);
        }
      },
    });

    fsm.register('IN_BOX', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.boxStayTimer = 10 + (cat.id % 4) * 2.5;
        const box = cat.ctx?.cardboardBox;
        if (box) {
          const bp = box.getPosition();
          cat.body.x = bp.x;
          cat.body.y = bp.y;
          cat.boxLastPos = { x: bp.x, y: bp.y };
          const headLead = 7;
          cat.spine.reset(
            bp.x + Math.cos(cat.heading) * headLead,
            bp.y + Math.sin(cat.heading) * headLead,
            cat.heading,
          );
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        const box = cat.ctx.cardboardBox;
        if (!box || !box.isVisible()) {
          cat.fsm.transition('IDLE');
          return;
        }
        cat.body.vx = 0;
        cat.body.vy = 0;

        // Track delta smoothly if user drags the box
        const bp = box.getPosition();
        const prev = cat.boxLastPos ?? bp;
        const dx = bp.x - prev.x;
        const dy = bp.y - prev.y;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          cat.body.x = bp.x;
          cat.body.y = bp.y;
          cat.spine.moveHeadTo(cat.spine.head.x + dx, cat.spine.head.y + dy, cat.heading);
          for (const node of cat.tail.nodes) {
            node.x += dx;
            node.y += dy;
            node.oldX += dx;
            node.oldY += dy;
          }
        }
        cat.boxLastPos = { x: bp.x, y: bp.y };

        // Gentle head look inside box
        const lookOffset = cat.noise.noise2D(cat.time * 0.4, cat.id * 5.3) * 0.45;
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading + lookOffset, dt * 2.5);

        const laser = cat.resolveLaserTarget();
        if (laser && Math.hypot(laser.x - bp.x, laser.y - bp.y) < 170) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.jumpOutNextState = 'STALK';
          cat.fsm.transition('JUMP_OUT_BOX');
          return;
        }

        if (stateTime >= cat.boxStayTimer) {
          cat.jumpOutNextState = 'WANDER';
          cat.fsm.transition('JUMP_OUT_BOX');
        }
      },
      onExit: (cat, nextState) => {
        cat.boxLastPos = null;
        if (nextState !== 'JUMP_OUT_BOX') {
          cat.ctx?.cardboardBox?.release(cat.id);
        }
      },
    });

    fsm.register('JUMP_OUT_BOX', {
      onEnter: (cat) => {
        cat.zHeight = 0.04;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.jumpStartPos = { x: cat.body.x, y: cat.body.y };

        const box = cat.ctx?.cardboardBox;
        const preferredAngle =
          cat.jumpOutNextState === 'STALK' && cat.activeTarget
            ? Math.atan2(cat.activeTarget.y - cat.body.y, cat.activeTarget.x - cat.body.x)
            : cat.heading + (cat.id % 2 === 0 ? 0.35 : -0.35);

        cat.jumpEndPos = cat.findClearFloorSpotAround(
          cat.jumpStartPos.x,
          cat.jumpStartPos.y,
          68,
          preferredAngle,
          box?.isVisible() ? box.getExteriorObstacle() : undefined,
        );

        const dx = cat.jumpEndPos.x - cat.jumpStartPos.x;
        const dy = cat.jumpEndPos.y - cat.jumpStartPos.y;
        if (Math.hypot(dx, dy) > 1) {
          cat.heading = Math.atan2(dy, dx);
          cat.headAngle = cat.heading;
        }
        cat.squashX = 1.16;
        cat.squashY = 0.86;
        cat.ctx?.particles?.spawnDustPuff(
          cat.jumpStartPos.x,
          cat.jumpStartPos.y,
          -Math.cos(cat.heading) * 28,
          -Math.sin(cat.heading) * 28,
        );
      },
      onUpdate: (cat, _dt, stateTime) => {
        cat.body.vx = 0;
        cat.body.vy = 0;
        const u = clamp(stateTime / 0.4, 0, 1);
        cat.zHeight = 4 * u * (1 - u);
        const ease = 1 - (1 - u) * (1 - u);
        cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * ease;
        cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * ease;

        if (u >= 1) {
          cat.zHeight = 0;
          cat.body.x = cat.jumpEndPos.x;
          cat.body.y = cat.jumpEndPos.y;
          cat.squashX = 1.14;
          cat.squashY = 0.88;
          cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, 0, 0);
          cat.ctx?.cardboardBox?.release(cat.id);
          cat.boxCooldown = 9;
          const laser = cat.resolveLaserTarget();
          cat.fsm.transition(laser ? 'STALK' : cat.jumpOutNextState);
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
        cat.ctx?.cardboardBox?.release(cat.id);
        cat.boxCooldown = Math.max(cat.boxCooldown, 9);
      },
    });

    fsm.register('JUMP_TO_ICON', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.jumpStartPos = { x: cat.body.x, y: cat.body.y };
        cat.jumpTakenOff = false;

        if (!cat.targetIcon) {
          cat.fsm.transition('IDLE');
          return;
        }
        const tx = cat.targetIcon.x + cat.targetIcon.width * 0.5;
        const ty = cat.targetIcon.y + cat.targetIcon.height * 0.36;
        cat.jumpEndPos = { x: tx, y: ty };
        const dx = tx - cat.body.x;
        const dy = ty - cat.body.y;
        if (Math.hypot(dx, dy) > 1) {
          cat.heading = Math.atan2(dy, dx);
          cat.headAngle = cat.heading;
        }
        cat.squashX = 0.88;
        cat.squashY = 1.12;
      },
      onUpdate: (cat, _dt, stateTime) => {
        if (!cat.targetIcon) {
          cat.fsm.transition('IDLE');
          return;
        }

        const liveIcon = cat.findObstacleById(cat.targetIcon.id);
        if (liveIcon) {
          cat.targetIcon = liveIcon;
        }
        const activeIcon = cat.targetIcon;

        if (cat.ctx.occupiedIconIds?.has(activeIcon.id)) {
          cat.fsm.transition('IDLE');
          return;
        }

        cat.jumpEndPos.x = activeIcon.x + activeIcon.width * 0.5;
        cat.jumpEndPos.y = activeIcon.y + activeIcon.height * 0.36;
        cat.body.vx = 0;
        cat.body.vy = 0;

        const crouchDur = 0.18;
        const flightDur = 0.42;

        if (stateTime < crouchDur) {
          cat.zHeight = 0;
          cat.squashX = 0.88;
          cat.squashY = 1.12;
          const dx = cat.jumpEndPos.x - cat.body.x;
          const dy = cat.jumpEndPos.y - cat.body.y;
          if (Math.hypot(dx, dy) > 1) {
            cat.heading = Math.atan2(dy, dx);
            cat.headAngle = cat.heading;
          }
          return;
        }

        if (!cat.jumpTakenOff) {
          cat.jumpTakenOff = true;
          cat.squashX = 1.18;
          cat.squashY = 0.86;
          cat.ctx?.particles?.spawnDustPuff(
            cat.jumpStartPos.x,
            cat.jumpStartPos.y,
            -Math.cos(cat.heading) * 32,
            -Math.sin(cat.heading) * 32,
          );
        }

        const u = clamp((stateTime - crouchDur) / flightDur, 0, 1);
        cat.zHeight = 0.28 * u + 3.6 * u * (1 - u);
        const ease = 1 - (1 - u) * (1 - u);
        cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * ease;
        cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * ease;

        if (u >= 1) {
          cat.zHeight = 0.28;
          cat.body.x = cat.jumpEndPos.x;
          cat.body.y = cat.jumpEndPos.y;
          cat.squashX = 1.12;
          cat.squashY = 0.9;
          cat.ctx?.onIconPerchChange?.(cat.id, activeIcon.id);
          cat.fsm.transition('PERCH_ICON');
        }
      },
      onExit: (cat, nextState) => {
        if (nextState !== 'PERCH_ICON') {
          cat.zHeight = 0;
          cat.targetIcon = null;
        }
      },
    });

    fsm.register('PERCH_ICON', {
      onEnter: (cat) => {
        cat.perchHopDownActive = false;
        cat.perchHopDownTime = 0;
        cat.zHeight = 0.28;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.perchDuration = 5 + ((cat.id * 1.37 + cat.time) % 4);

        if (cat.targetIcon) {
          cat.perchedIconId = cat.targetIcon.id;
          const px = cat.targetIcon.x + cat.targetIcon.width * 0.5;
          const py = cat.targetIcon.y + cat.targetIcon.height * 0.36;
          cat.body.x = px;
          cat.body.y = py;
          cat.perchLastIconCenter = { x: px, y: py };
          const headLead = 7;
          cat.spine.reset(
            px + Math.cos(cat.heading) * headLead,
            py + Math.sin(cat.heading) * headLead,
            cat.heading,
          );
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.body.vx = 0;
        cat.body.vy = 0;

        if (cat.perchHopDownActive) {
          cat.perchHopDownTime += dt;
          const u = clamp(cat.perchHopDownTime / cat.perchHopDownDuration, 0, 1);
          cat.zHeight = 0.28 * (1 - u) + 3.0 * u * (1 - u);
          const ease = 1 - (1 - u) * (1 - u);
          cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * ease;
          cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * ease;

          if (u >= 1) {
            cat.zHeight = 0;
            cat.body.x = cat.jumpEndPos.x;
            cat.body.y = cat.jumpEndPos.y;
            cat.squashX = 1.12;
            cat.squashY = 0.89;
            cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, 0, 0);
            cat.iconInteractCooldown = 10 + (cat.id % 5);
            const laser = cat.resolveLaserTarget();
            cat.fsm.transition(laser ? 'STALK' : 'WANDER');
          }
          return;
        }

        cat.zHeight = 0.28;
        const liveIcon = cat.findObstacleById(cat.perchedIconId) ?? cat.targetIcon;
        if (!liveIcon) {
          cat.beginIconHopDown(null);
          return;
        }
        cat.targetIcon = liveIcon;

        // Follow icon drag smoothly; hop down cleanly if moved fast
        const ix = liveIcon.x + liveIcon.width * 0.5;
        const iy = liveIcon.y + liveIcon.height * 0.36;
        const prev = cat.perchLastIconCenter ?? { x: ix, y: iy };
        const dx = ix - prev.x;
        const dy = iy - prev.y;
        const moveSpeed = dt > 0.0001 ? Math.hypot(dx, dy) / dt : 0;
        if (moveSpeed > 520) {
          cat.beginIconHopDown(liveIcon);
          return;
        }
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          cat.body.x = ix;
          cat.body.y = iy;
          cat.spine.moveHeadTo(cat.spine.head.x + dx, cat.spine.head.y + dy, cat.heading);
          for (const node of cat.tail.nodes) {
            node.x += dx;
            node.y += dy;
            node.oldX += dx;
            node.oldY += dy;
          }
        }
        cat.perchLastIconCenter = { x: ix, y: iy };

        // Curious head look around while curled atop icon
        const lookOffset = cat.noise.noise2D(cat.time * 0.55, cat.id * 4.9) * 0.75;
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading + lookOffset, dt * 3.2);

        const laser = cat.resolveLaserTarget();
        if (laser && Math.hypot(laser.x - cat.body.x, laser.y - cat.body.y) < 200) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.beginIconHopDown(liveIcon);
          return;
        }

        if (stateTime >= cat.perchDuration) {
          cat.beginIconHopDown(liveIcon);
        }
      },
      onExit: (cat) => {
        const exitedId = cat.perchedIconId;
        cat.perchedIconId = null;
        cat.targetIcon = null;
        cat.perchLastIconCenter = null;
        cat.perchHopDownActive = false;
        cat.zHeight = 0;
        cat.iconInteractCooldown = Math.max(cat.iconInteractCooldown, 10 + (cat.id % 5));
        if (exitedId !== null) {
          cat.ctx?.onIconPerchChange?.(cat.id, null);
        }
      },
    });

    fsm.register('SCRATCH_ICON', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.scratchDuration = 1.6 + ((cat.id * 0.73 + cat.time) % 0.8);
        cat.scratchBurstTimer = 0.04;

        if (!cat.targetIcon) {
          cat.fsm.transition('IDLE');
          return;
        }
        const icon = cat.targetIcon;
        const cx = clamp(cat.body.x, icon.x, icon.x + icon.width);
        const cy = clamp(cat.body.y, icon.y, icon.y + icon.height);
        cat.scratchEdgePoint = { x: cx, y: cy };
        const dx = cx - cat.body.x;
        const dy = cy - cat.body.y;
        if (Math.hypot(dx, dy) > 1) {
          cat.heading = Math.atan2(dy, dx);
          cat.headAngle = cat.heading;
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.body.vx = 0;
        cat.body.vy = 0;

        if (!cat.targetIcon) {
          cat.fsm.transition('IDLE');
          return;
        }
        const liveIcon = cat.findObstacleById(cat.targetIcon.id);
        if (liveIcon) {
          cat.targetIcon = liveIcon;
        }
        const activeIcon = cat.targetIcon;

        const cx = clamp(cat.body.x, activeIcon.x, activeIcon.x + activeIcon.width);
        const cy = clamp(cat.body.y, activeIcon.y, activeIcon.y + activeIcon.height);
        const distToEdge = Math.hypot(cx - cat.body.x, cy - cat.body.y);
        if (distToEdge > 64) {
          cat.fsm.transition('IDLE');
          return;
        }
        cat.scratchEdgePoint = { x: cx, y: cy };

        if (distToEdge > 1) {
          const edgeAngle = Math.atan2(cy - cat.body.y, cx - cat.body.x);
          cat.heading = lerpAngle(cat.heading, edgeAngle, dt * 12);
        }
        cat.headAngle = cat.heading + Math.sin(stateTime * 9 * Math.PI * 2) * 0.08;

        const laser = cat.resolveLaserTarget();
        if (laser && Math.hypot(laser.x - cat.body.x, laser.y - cat.body.y) < 220) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.fsm.transition('STALK');
          return;
        }

        cat.scratchBurstTimer -= dt;
        if (cat.scratchBurstTimer <= 0) {
          cat.scratchBurstTimer = 0.24;
          const pawSide = Math.floor(stateTime / 0.24) % 2 === 0 ? -6 : 6;
          const perpX = -Math.sin(cat.heading) * pawSide;
          const perpY = Math.cos(cat.heading) * pawSide;
          const sx = cat.scratchEdgePoint.x + perpX * 0.6;
          const sy = cat.scratchEdgePoint.y + perpY * 0.6;
          cat.ctx?.particles?.spawnScratchMarks(
            sx,
            sy,
            cat.heading + Math.PI + (Math.random() - 0.5) * 0.55,
          );
          cat.ctx?.onIconScratch?.(activeIcon.id, cat);
        }

        if (stateTime >= cat.scratchDuration) {
          cat.iconInteractCooldown = 9;
          cat.fsm.transition('WANDER');
        }
      },
      onExit: (cat) => {
        cat.targetIcon = null;
        cat.iconInteractCooldown = Math.max(cat.iconInteractCooldown, 9);
      },
    });

    return fsm;
  }

  private tryEnterBox(): boolean {
    const box = this.ctx.cardboardBox;
    if (!box || !box.isVisible() || box.occupantId !== null || this.boxCooldown > 0) {
      return false;
    }
    const bp = box.getPosition();
    const dist = Math.hypot(bp.x - this.body.x, bp.y - this.body.y);
    if (dist <= 96 && box.claim(this.id)) {
      this.pendingIconPlay = null;
      this.fsm.transition('JUMP_TO_BOX');
      return true;
    }
    return false;
  }

  private tryInteractWithNearbyIcon(): boolean {
    if (this.iconInteractCooldown > 0 || this.iconCheckTimer > 0) {
      return false;
    }
    this.iconCheckTimer = 0.75 + Math.random() * 0.65;

    const obstacles = this.ctx.physics.getObstacles();
    if (obstacles.length === 0) {
      return false;
    }

    const occupied = this.ctx.occupiedIconIds;
    let closestScratchIcon: AabbRect | null = null;
    let closestScratchDist = 46;
    let closestPerchIcon: AabbRect | null = null;
    let closestPerchDist = 145;

    for (const obs of obstacles) {
      if (occupied?.has(obs.id)) {
        continue;
      }

      const edgeX = clamp(this.body.x, obs.x, obs.x + obs.width);
      const edgeY = clamp(this.body.y, obs.y, obs.y + obs.height);
      const edgeDist = Math.hypot(edgeX - this.body.x, edgeY - this.body.y);
      if (edgeDist <= closestScratchDist) {
        closestScratchDist = edgeDist;
        closestScratchIcon = obs;
      }

      const cx = obs.x + obs.width * 0.5;
      const cy = obs.y + obs.height * 0.5;
      const centerDist = Math.hypot(cx - this.body.x, cy - this.body.y);
      if (centerDist <= closestPerchDist) {
        closestPerchDist = centerDist;
        closestPerchIcon = obs;
      }
    }

    if (closestScratchIcon && Math.random() < 0.48) {
      this.targetIcon = { ...closestScratchIcon };
      this.fsm.transition('SCRATCH_ICON');
      return true;
    }

    if (closestPerchIcon && Math.random() < 0.52) {
      this.targetIcon = { ...closestPerchIcon };
      this.fsm.transition('JUMP_TO_ICON');
      return true;
    }

    return false;
  }

  private findObstacleById(iconId: number | null | undefined): AabbRect | null {
    if (iconId === null || iconId === undefined) {
      return null;
    }
    for (const obs of this.ctx.physics.getObstacles()) {
      if (obs.id === iconId) {
        return obs;
      }
    }
    return null;
  }

  private overlapsRect(rect: AabbRect, padding = 0): boolean {
    const cx = clamp(this.body.x, rect.x, rect.x + rect.width);
    const cy = clamp(this.body.y, rect.y, rect.y + rect.height);
    const r = this.body.radius + padding;
    const dx = this.body.x - cx;
    const dy = this.body.y - cy;
    return dx * dx + dy * dy < r * r;
  }

  private findOverlappingObstacle(padding = 0): AabbRect | null {
    for (const obs of this.ctx.physics.getObstacles()) {
      if (this.overlapsRect(obs, padding)) {
        return obs;
      }
    }
    return null;
  }

  private beginIconHopDown(icon: AabbRect | null): void {
    this.perchHopDownActive = true;
    this.perchHopDownTime = 0;
    this.jumpStartPos = { x: this.body.x, y: this.body.y };

    const preferredAngle = this.activeTarget
      ? Math.atan2(this.activeTarget.y - this.body.y, this.activeTarget.x - this.body.x)
      : this.heading + (this.id % 2 === 0 ? 0.5 : -0.5);

    const clearDist = icon
      ? Math.max(icon.width, icon.height) * 0.5 + this.body.radius + 10
      : 62;

    this.jumpEndPos = this.findClearFloorSpotAround(
      this.body.x,
      this.body.y,
      clearDist,
      preferredAngle,
      icon ?? undefined,
    );

    const dx = this.jumpEndPos.x - this.jumpStartPos.x;
    const dy = this.jumpEndPos.y - this.jumpStartPos.y;
    if (Math.hypot(dx, dy) > 1) {
      this.heading = Math.atan2(dy, dx);
      this.headAngle = this.heading;
    }
    this.squashX = 1.12;
    this.squashY = 0.9;
  }

  private findClearFloorSpotAround(
    cx: number,
    cy: number,
    radius: number,
    preferredAngle: number,
    avoidRect?: AabbRect,
  ): Vec2 {
    const angleOffsets = [
      0,
      0.52, -0.52,
      1.05, -1.05,
      1.57, -1.57,
      2.09, -2.09,
      2.62, -2.62,
      Math.PI,
    ];
    const radii = [radius, radius + 14];
    const obstacles = this.ctx.physics.getObstacles();
    const minObsClear = this.body.radius + 6;
    const minAvoidClear = this.body.radius + 4;

    let bestFallback: Vec2 | null = null;
    let bestScore = -Infinity;

    for (const r of radii) {
      for (const offset of angleOffsets) {
        const ang = preferredAngle + offset;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;

        const probe: CircleBody = { x: px, y: py, vx: 0, vy: 0, radius: this.body.radius + 4 };
        if (this.ctx.physics.clampToBounds(probe, 0) !== null) {
          continue;
        }

        let minClear = Infinity;
        for (const obs of obstacles) {
          const ox = clamp(px, obs.x, obs.x + obs.width);
          const oy = clamp(py, obs.y, obs.y + obs.height);
          minClear = Math.min(minClear, Math.hypot(px - ox, py - oy) - minObsClear);
        }
        if (avoidRect) {
          const ax = clamp(px, avoidRect.x, avoidRect.x + avoidRect.width);
          const ay = clamp(py, avoidRect.y, avoidRect.y + avoidRect.height);
          minClear = Math.min(minClear, Math.hypot(px - ax, py - ay) - minAvoidClear);
        }

        if (minClear >= 0) {
          return { x: px, y: py };
        }

        if (minClear > bestScore) {
          bestScore = minClear;
          bestFallback = { x: px, y: py };
        }
      }
    }

    if (bestFallback) {
      return bestFallback;
    }

    const probe: CircleBody = {
      x: cx + Math.cos(preferredAngle) * radius,
      y: cy + Math.sin(preferredAngle) * radius,
      vx: 0,
      vy: 0,
      radius: this.body.radius + 4,
    };
    this.ctx.physics.clampToBounds(probe, 0);
    return { x: probe.x, y: probe.y };
  }

  private isMidJumpArc(): boolean {
    const state = this.fsm.state;
    return (
      (state === 'JUMP_TO_BOX' && this.fsm.stateTime >= 0.18) ||
      state === 'JUMP_OUT_BOX' ||
      (state === 'JUMP_TO_ICON' && this.fsm.stateTime >= 0.18) ||
      (state === 'PERCH_ICON' && this.perchHopDownActive)
    );
  }

  private resolveLaserTarget(): LaserTarget | null {
    if (this.ctx.laserTarget) {
      return this.ctx.laserTarget;
    }
    if (this.ctx.laserTargets && this.ctx.laserTargets.length > 0) {
      return assignCatToLaserTarget(this.id, this.ctx.laserTargets);
    }
    return null;
  }

  private computeObstacleAvoidanceAngle(desiredAngle: number, ignoreIconId?: number): number {
    const lookAhead = 46;
    const probeX = this.body.x + Math.cos(desiredAngle) * lookAhead;
    const probeY = this.body.y + Math.sin(desiredAngle) * lookAhead;

    let steerX = Math.cos(desiredAngle);
    let steerY = Math.sin(desiredAngle);

    const applyAvoidance = (obs: AabbRect): void => {
      const cx = clamp(probeX, obs.x, obs.x + obs.width);
      const cy = clamp(probeY, obs.y, obs.y + obs.height);
      const dx = probeX - cx;
      const dy = probeY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < this.body.radius + 12) {
        const pushX = dist > 0.01 ? dx / dist : Math.sign(this.body.x - (obs.x + obs.width * 0.5)) || 1;
        const pushY = dist > 0.01 ? dy / dist : Math.sign(this.body.y - (obs.y + obs.height * 0.5)) || 1;
        steerX += pushX * 1.8;
        steerY += pushY * 1.8;
      }
    };

    for (const obs of this.ctx.physics.getObstacles()) {
      if (ignoreIconId !== undefined && obs.id === ignoreIconId) {
        continue;
      }
      applyAvoidance(obs);
    }

    const box = this.ctx.cardboardBox;
    if (box && box.isVisible() && box.occupantId !== this.id && !this.headingForBox) {
      applyAvoidance(box.getExteriorObstacle());
    }

    return Math.atan2(steerY, steerX);
  }

  private handleYarnInteraction(): void {
    const yarn = this.ctx.yarnBall;
    if (!yarn) return;

    const yp = yarn.getPosition();
    const dx = yp.x - this.body.x;
    const dy = yp.y - this.body.y;
    const dist = Math.hypot(dx, dy);
    const minDist = this.body.radius + yarn.getRadius();

    if (dist < minDist && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const catSpeed = Math.hypot(this.body.vx, this.body.vy);
      const batImpulse = this.fsm.state === 'POUNCE' ? 320 : Math.max(130, catSpeed * 1.15);
      yarn.nudge(nx * batImpulse, ny * batImpulse);
    }
  }

  private updateFacialIdleTimers(dt: number): void {
    // Periodic natural blinking
    if (this.blinkDuration > 0) {
      this.blinkDuration -= dt;
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkDuration = 0.13;
        this.blinkTimer = 2.4 + ((this.id * 1.37 + this.time * 0.5) % 3.5);
      }
    }

    // Independent subtle ear twitches
    this.earTwitchTimer -= dt;
    if (this.earTwitchTimer <= 0) {
      this.earTwitchTimer = 1.8 + ((this.id * 0.91 + this.time) % 3.2);
      if (Math.floor(this.time * 10 + this.id) % 2 === 0) {
        this.earTwitchLeft = 0.24;
      } else {
        this.earTwitchRight = 0.24;
      }
    }
    this.earTwitchLeft = Math.max(0, this.earTwitchLeft - dt * 1.8);
    this.earTwitchRight = Math.max(0, this.earTwitchRight - dt * 1.8);
  }

  private updateSpineAndTail(dt: number): void {
    const state = this.fsm.state;
    const speed = Math.hypot(this.body.vx, this.body.vy);
    const isCurled =
      state === 'NAP' || state === 'IN_BOX' || (state === 'PERCH_ICON' && !this.perchHopDownActive);

    if (speed > 6 && !isCurled && state !== 'WIGGLE') {
      const velAngle = Math.atan2(this.body.vy, this.body.vx);
      if (state !== 'BONK') {
        this.heading = lerpAngle(this.heading, velAngle, dt * 8);
      }
      this.walkPhase += (speed / 26) * dt * Math.PI;
    }

    // Position SpineChain head slightly forward from body center
    const headLead = isCurled ? 7 : 14;
    const headX = this.body.x + Math.cos(this.heading) * headLead;
    const headY = this.body.y + Math.sin(this.heading) * headLead;
    this.spine.moveHeadTo(headX, headY, this.heading);

    // 12Hz hip oscillation during WIGGLE
    let hipOffsetX = 0;
    let hipOffsetY = 0;
    if (state === 'WIGGLE') {
      const perpX = -Math.sin(this.heading);
      const perpY = Math.cos(this.heading);
      const osc = Math.sin(this.fsm.stateTime * 12 * Math.PI * 2) * 5.2;
      hipOffsetX = perpX * osc;
      hipOffsetY = perpY * osc;
    }

    const hipsPos = {
      x: this.spine.hips.x + hipOffsetX,
      y: this.spine.hips.y + hipOffsetY,
    };

    const tailBaseAngle = this.heading + Math.PI;
    const tailAnchorX = hipsPos.x + Math.cos(tailBaseAngle) * 8;
    const tailAnchorY = hipsPos.y + Math.sin(tailBaseAngle) * 8;
    this.tail.setRoot(tailAnchorX, tailAnchorY);

    let swayAmp = 0.35;
    let swayFreq = 2.4;
    let restCurve = 0.14;

    if (state === 'STALK') {
      swayAmp = 0.55;
      swayFreq = 9.5;
      restCurve = 0.06;
    } else if (state === 'SCRATCH_ICON') {
      swayAmp = 0.48;
      swayFreq = 7.5;
      restCurve = 0.1;
    } else if (state === 'PETTED') {
      swayAmp = 0.5;
      swayFreq = 4.2;
      restCurve = 0.32;
    } else if (state === 'PERCH_ICON' && !this.perchHopDownActive) {
      swayAmp = 0.14;
      swayFreq = 1.3;
      restCurve = 0.72;
    } else if (isCurled) {
      swayAmp = 0.08;
      swayFreq = 1.1;
      restCurve = 0.65;
    } else if (state === 'POUNCE' || state === 'STARTLED' || this.isMidJumpArc()) {
      swayAmp = 0.15;
      swayFreq = 5;
      restCurve = 0;
    }

    this.tail.update(dt, {
      swayAmp,
      swayFreq,
      time: this.time + this.id * 1.1,
      rootAngle: tailBaseAngle,
      restCurve,
      constraintIterations: 6,
    });
  }

  private renderCat(): void {
    const state = this.fsm.state;
    const isCurled =
      state === 'NAP' || state === 'IN_BOX' || (state === 'PERCH_ICON' && !this.perchHopDownActive);
    const isStalk = state === 'STALK';
    const isScratch = state === 'SCRATCH_ICON';
    const isPounce = state === 'POUNCE' || state === 'STARTLED' || this.isMidJumpArc();

    const scaleZ = 1 + 0.16 * this.zHeight;
    const sx = this.squashX * scaleZ * (isStalk ? 1.07 : 1);
    const sy = this.squashY * scaleZ * (isStalk ? 0.91 : isCurled ? 1.1 : 1);

    const headPos = this.spine.head;
    const torsoPos = this.spine.torso;

    // Apply 12Hz hip wiggle offset for visual drawing
    let hipWiggleX = 0;
    let hipWiggleY = 0;
    if (state === 'WIGGLE') {
      const osc = Math.sin(this.fsm.stateTime * 12 * Math.PI * 2) * 5.2;
      hipWiggleX = -Math.sin(this.heading) * osc;
      hipWiggleY = Math.cos(this.heading) * osc;
    }
    const hipsPos = {
      x: this.spine.hips.x + hipWiggleX,
      y: this.spine.hips.y + hipWiggleY,
    };

    const torsoDir = this.unitVec(torsoPos, headPos, this.heading);
    const hipDir = this.unitVec(hipsPos, torsoPos, this.heading);
    const headDir = { x: Math.cos(this.headAngle), y: Math.sin(this.headAngle) };

    // 1. Dynamic ground drop shadow (+6*z, +12*z shift and opacity fade)
    this.drawShadow(hipsPos, torsoPos, headPos, scaleZ);

    // 2. Tail + Paws + Organic Capsule Torso + Breed Markings
    this.bodyGraphics.clear();
    this.drawTail(this.bodyGraphics);
    if (!isCurled) {
      this.drawPaws(this.bodyGraphics, hipsPos, torsoPos, hipDir, torsoDir, isPounce, isScratch);
    }
    this.drawOrganicCapsuleBody(
      this.bodyGraphics,
      hipsPos,
      torsoPos,
      headPos,
      hipDir,
      torsoDir,
      sx,
      sy,
      isCurled,
    );

    drawBodyMarkings(this.bodyGraphics, this.profile, {
      hips: hipsPos,
      torso: torsoPos,
      head: headPos,
      hipDir,
      torsoDir,
      headDir,
      bodyScaleX: sx,
      bodyScaleY: sy,
      isLoaf: isCurled,
    });

    // 3. Expressive Head (ears, facial markings, eyes, pupils, whiskers, nose)
    this.drawHead(headPos, scaleZ, isCurled);
  }

  private drawShadow(hips: Vec2, torso: Vec2, head: Vec2, scaleZ: number): void {
    const shX = 6 * this.zHeight + 2.5;
    const shY = 12 * this.zHeight + 4;
    const alpha = clamp(0.28 * (1 - this.zHeight * 0.52), 0.08, 0.3);

    this.shadowGraphics.clear();
    this.shadowGraphics
      .circle(hips.x + shX, hips.y + shY, 12.2 * scaleZ)
      .fill({ color: 0x22140b, alpha })
      .circle(torso.x + shX, torso.y + shY, 13 * scaleZ)
      .fill({ color: 0x22140b, alpha })
      .circle(head.x + shX, head.y + shY, 11.2 * scaleZ)
      .fill({ color: 0x22140b, alpha });
  }

  private drawTail(gfx: Graphics): void {
    const nodes = this.tail.nodes;
    if (nodes.length < 2) return;

    // Tapered outer silhouette from thick root -> slender tip
    for (let i = 0; i < nodes.length - 1; i++) {
      const p0 = nodes[i];
      const p1 = nodes[i + 1];
      const t = i / (nodes.length - 1);
      const width = 7.4 - t * 3.8;
      const color = i >= nodes.length - 2 ? this.profile.tailTipColor : this.profile.tailBaseColor;

      gfx
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width: width + 1.4, color: this.profile.eyeRimColor, alpha: 0.3, cap: 'round' })
        .moveTo(p0.x, p0.y)
        .lineTo(p1.x, p1.y)
        .stroke({ width, color, alpha: 1, cap: 'round' });
    }
  }

  private drawPaws(
    gfx: Graphics,
    hips: Vec2,
    torso: Vec2,
    hipDir: Vec2,
    torsoDir: Vec2,
    isPounce: boolean,
    isScratch: boolean,
  ): void {
    const tPerp = { x: -torsoDir.y, y: torsoDir.x };
    const hPerp = { x: -hipDir.y, y: hipDir.x };

    let frontLeftReach = isPounce ? 11.5 : 6.5;
    let frontRightReach = frontLeftReach;
    let backLeftReach = isPounce ? -7.5 : -2.5;
    let backRightReach = backLeftReach;
    let frontSideSpan = 10.5;

    if (isScratch) {
      const scratchWave = Math.sin(this.fsm.stateTime * 9 * Math.PI * 2);
      frontLeftReach = 13.5 + scratchWave * 7.2;
      frontRightReach = 13.5 - scratchWave * 7.2;
      backLeftReach = -3.5;
      backRightReach = -3.5;
      frontSideSpan = 8.4;
    } else {
      const walkAmp = Math.min(1, Math.hypot(this.body.vx, this.body.vy) / 90) * 4.8;
      const s1 = Math.sin(this.walkPhase) * walkAmp;
      const s2 = Math.sin(this.walkPhase + Math.PI) * walkAmp;
      frontLeftReach += s1;
      frontRightReach += s2;
      backLeftReach += s2;
      backRightReach += s1;
    }

    const paws: Array<{ x: number; y: number }> = [
      // Front Left
      {
        x: torso.x + torsoDir.x * frontLeftReach - tPerp.x * frontSideSpan,
        y: torso.y + torsoDir.y * frontLeftReach - tPerp.y * frontSideSpan,
      },
      // Front Right
      {
        x: torso.x + torsoDir.x * frontRightReach + tPerp.x * frontSideSpan,
        y: torso.y + torsoDir.y * frontRightReach + tPerp.y * frontSideSpan,
      },
      // Back Left
      {
        x: hips.x + hipDir.x * backLeftReach - hPerp.x * 10.2,
        y: hips.y + hipDir.y * backLeftReach - hPerp.y * 10.2,
      },
      // Back Right
      {
        x: hips.x + hipDir.x * backRightReach + hPerp.x * 10.2,
        y: hips.y + hipDir.y * backRightReach + hPerp.y * 10.2,
      },
    ];

    for (const paw of paws) {
      gfx
        .circle(paw.x, paw.y, 4.1)
        .fill({ color: this.profile.pawColor, alpha: 1 })
        .stroke({ width: 0.9, color: this.profile.eyeRimColor, alpha: 0.32 });
    }
  }

  private drawOrganicCapsuleBody(
    gfx: Graphics,
    hips: Vec2,
    torso: Vec2,
    head: Vec2,
    hipDir: Vec2,
    torsoDir: Vec2,
    sx: number,
    sy: number,
    isCurled: boolean,
  ): void {
    const rHip = (isCurled ? 13.6 : 11.4) * Math.min(sx, sy);
    const rTorso = (isCurled ? 14.2 : 12.2) * Math.min(sx, sy);
    const rNeck = (isCurled ? 11.4 : 9.6) * Math.min(sx, sy);

    const hPerp = { x: -hipDir.y, y: hipDir.x };
    const tPerp = { x: -torsoDir.y, y: torsoDir.x };

    const hlx = hips.x - hPerp.x * rHip;
    const hly = hips.y - hPerp.y * rHip;
    const hrx = hips.x + hPerp.x * rHip;
    const hry = hips.y + hPerp.y * rHip;

    const tlx = torso.x - tPerp.x * rTorso;
    const tly = torso.y - tPerp.y * rTorso;
    const trx = torso.x + tPerp.x * rTorso;
    const try_ = torso.y + tPerp.y * rTorso;

    const nlx = head.x - tPerp.x * rNeck * 0.72;
    const nly = head.y - tPerp.y * rNeck * 0.72;
    const nrx = head.x + tPerp.x * rNeck * 0.72;
    const nry = head.y + tPerp.y * rNeck * 0.72;

    // Soft outer fur edge outline for readability on cream rug & dark hardwood
    gfx
      .circle(hips.x, hips.y, rHip + 1.1)
      .fill({ color: this.profile.eyeRimColor, alpha: 0.24 })
      .circle(torso.x, torso.y, rTorso + 1.1)
      .fill({ color: this.profile.eyeRimColor, alpha: 0.24 })
      .poly([hlx, hly, tlx, tly, nlx, nly, nrx, nry, trx, try_, hrx, hry], true)
      .stroke({ width: 2.2, color: this.profile.eyeRimColor, alpha: 0.24, join: 'round' });

    // Main plush coat fill joining hips -> torso -> neck
    gfx
      .circle(hips.x, hips.y, rHip)
      .fill({ color: this.profile.baseColor, alpha: 1 })
      .circle(torso.x, torso.y, rTorso)
      .fill({ color: this.profile.baseColor, alpha: 1 })
      .poly([hlx, hly, tlx, tly, nlx, nly, nrx, nry, trx, try_, hrx, hry], true)
      .fill({ color: this.profile.baseColor, alpha: 1 });

    // Subtle shaded lower flank curvature
    gfx
      .ellipse(hips.x + hPerp.x * 2, hips.y + hPerp.y * 2, rHip * 0.72, rHip * 0.6)
      .fill({ color: this.profile.shadowColor, alpha: 0.22 });
  }

  private drawHead(headPos: Vec2, scaleZ: number, isCurled: boolean): void {
    const g = this.headGraphics;
    g.clear();
    g.position.set(headPos.x, headPos.y);
    g.rotation = this.headAngle;
    g.scale.set(this.squashX * scaleZ, this.squashY * scaleZ);

    const state = this.fsm.state;
    const rx = 10.6;
    const ry = 11.8;

    // Ears (flatten backward slightly in STALK / BONK / STARTLED)
    const earFlatten =
      state === 'STALK' ? -0.26 : state === 'BONK' || state === 'STARTLED' ? -0.34 : 0;

    this.drawEar(g, -3.5, -7.8, -0.35 + earFlatten - this.earTwitchLeft, -1);
    this.drawEar(g, -3.5, 7.8, 0.35 - earFlatten + this.earTwitchRight, 1);

    // Plush cheek & skull silhouette
    g.ellipse(0, 0, rx + 1, ry + 1)
      .fill({ color: this.profile.eyeRimColor, alpha: 0.25 })
      .ellipse(0, 0, rx, ry)
      .fill({ color: this.profile.baseColor, alpha: 1 });

    // Cheek fluff accents
    g.ellipse(1.5, -ry * 0.72, 4.2, 3.1)
      .fill({ color: this.profile.baseColor, alpha: 1 })
      .ellipse(1.5, ry * 0.72, 4.2, 3.1)
      .fill({ color: this.profile.baseColor, alpha: 1 });

    // Breed facial markings
    drawHeadMarkings(g, this.profile, rx, ry);

    // Expressive eyes
    this.drawEyes(g, state, isCurled);

    // Tiny triangular feline nose at front (+X)
    g.poly([rx - 1.6, -1.9, rx + 0.6, 0, rx - 1.6, 1.9], true)
      .fill({ color: this.profile.noseColor, alpha: 0.96 });

    // Delicate whiskers (3 each side)
    const whiskerAngles = [-0.28, 0, 0.28];
    for (const side of [-1, 1]) {
      for (const ang of whiskerAngles) {
        const bx = rx * 0.62;
        const by = side * 4.4;
        const wx = bx + Math.sin(ang) * 4;
        const wy = by + side * Math.cos(ang) * 9.5;
        g.moveTo(bx, by)
          .lineTo(wx, wy)
          .stroke({ width: 0.85, color: 0xf6ece1, alpha: 0.56, cap: 'round' });
      }
    }
  }

  private drawEar(
    gfx: Graphics,
    x: number,
    y: number,
    angle: number,
    side: number,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = (lx: number, ly: number) => x + lx * cos - ly * sin;
    const ty = (lx: number, ly: number) => y + lx * sin + ly * cos;

    // Outer fur triangle
    gfx
      .poly(
        [
          tx(-3, -3.5 * side), ty(-3, -3.5 * side),
          tx(4.8, 0), ty(4.8, 0),
          tx(-4.2, 4.4 * side), ty(-4.2, 4.4 * side),
        ],
        true,
      )
      .fill({ color: this.profile.earOuterColor, alpha: 1 })
      .stroke({ width: 0.9, color: this.profile.eyeRimColor, alpha: 0.32, join: 'round' });

    // Inner pink triangle (#E5A9A5)
    gfx
      .poly(
        [
          tx(-1.6, -1.8 * side), ty(-1.6, -1.8 * side),
          tx(2.9, 0), ty(2.9, 0),
          tx(-2.2, 2.3 * side), ty(-2.2, 2.3 * side),
        ],
        true,
      )
      .fill({ color: this.profile.earInnerColor, alpha: 0.92 });
  }

  private drawEyes(gfx: Graphics, state: CatStateName, isCurled: boolean): void {
    const ex = 4.2;
    const ey = 4.6;
    const isBlinking = this.blinkDuration > 0;

    if (state === 'NAP' || isBlinking) {
      // Closed peaceful arc eyes
      for (const side of [-1, 1]) {
        const y = side * ey;
        gfx
          .moveTo(ex - 1.2, y - 2.3)
          .quadraticCurveTo(ex + 1.2, y, ex - 1.2, y + 2.3)
          .stroke({ width: 1.5, color: this.profile.eyeRimColor, alpha: 0.88, cap: 'round' });
      }
      return;
    }

    if (state === 'PETTED') {
      // Happy upward curved squint arcs
      for (const side of [-1, 1]) {
        const y = side * ey;
        gfx
          .moveTo(ex - 1.0, y - 2.4)
          .quadraticCurveTo(ex + 1.8, y, ex - 1.0, y + 2.4)
          .stroke({ width: 1.7, color: this.profile.eyeRimColor, alpha: 0.92, cap: 'round' });
      }
      return;
    }

    if (state === 'BONK') {
      // Spinning dizzy X/spiral eyes
      const spin = this.time * 16;
      for (const side of [-1, 1]) {
        const cy = side * ey;
        const r = 2.4;
        const dx1 = Math.cos(spin) * r;
        const dy1 = Math.sin(spin) * r;
        const dx2 = Math.cos(spin + Math.PI * 0.5) * r;
        const dy2 = Math.sin(spin + Math.PI * 0.5) * r;
        gfx
          .moveTo(ex - dx1, cy - dy1)
          .lineTo(ex + dx1, cy + dy1)
          .moveTo(ex - dx2, cy - dy2)
          .lineTo(ex + dx2, cy + dy2)
          .stroke({ width: 1.4, color: this.profile.eyeRimColor, alpha: 0.92, cap: 'round' });
      }
      return;
    }

    const dilated = state === 'STALK' || state === 'WIGGLE' || state === 'POUNCE' || state === 'STARTLED';
    const irisRadius = isCurled ? 2.5 : 2.85;

    for (const side of [-1, 1]) {
      const cy = side * ey;

      // Subtle luminous night gleam halo when nightMode is enabled
      if (this.ctx?.nightMode) {
        gfx
          .circle(ex, cy, irisRadius + 1.4)
          .fill({ color: this.profile.eyeIrisColor, alpha: 0.34 });
      }

      // Iris
      gfx
        .circle(ex, cy, irisRadius)
        .fill({ color: this.profile.eyeIrisColor, alpha: 1 })
        .stroke({ width: 0.7, color: this.profile.eyeRimColor, alpha: 0.75 });

      // Pupil: wide round when excited/stalking, neat vertical almond slit otherwise
      if (dilated) {
        gfx
          .circle(ex + 0.3, cy, 1.95)
          .fill({ color: 0x161210, alpha: 0.96 });
      } else {
        gfx
          .ellipse(ex + 0.3, cy, 1.15, 1.85)
          .fill({ color: 0x161210, alpha: 0.96 });
      }

      // Crisp eye catchlight glint
      gfx
        .circle(ex + 0.9, cy - 0.8, this.ctx?.nightMode ? 0.95 : 0.72)
        .fill({ color: 0xfff8ef, alpha: this.ctx?.nightMode ? 0.98 : 0.88 });
    }
  }

  private unitVec(from: Vec2, to: Vec2, fallbackAngle: number): Vec2 {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      return { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) };
    }
    return { x: dx / len, y: dy / len };
  }

  override destroy(): void {
    this.shadowGraphics.destroy();
    super.destroy({ children: true });
  }
}
