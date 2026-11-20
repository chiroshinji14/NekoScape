import { Container, Graphics, Text } from 'pixi.js';
import { CatBrain, getCircadianPhase } from '../core/CatBrain';
import { DynamicFsm } from '../core/DynamicFsm';
import { PerlinNoise } from '../core/PerlinNoise';
import type { CircleBody, PhysicsWorld } from '../core/PhysicsWorld';
import type { SurfaceManager } from '../core/SurfaceManager';
import { SpineChain, VerletChain } from '../core/VerletChain';
import {
  BONK_DAZE_DURATION,
  IDLE_NAP_SECONDS,
  WIGGLE_DURATION,
  normalizeCatBreed,
  type AabbRect,
  type AmbientCritter,
  type CatArchetype,
  type CatBreed,
  type CatClickReaction,
  type CatCustomization,
  type CatEarPose,
  type CatIdentity,
  type CatMood,
  type CatNeeds,
  type CatPersonality,
  type CatSoundEvent,
  type CatStateName,
  type CircadianPhase,
  type DroppedTreat,
  type InteractivePropState,
  type LaserTarget,
  type ToyEntityState,
  type Vec2,
  type WarmZone,
  type WindowLedgesState,
} from '../types/simulation';
import { BOX_WALL_HEIGHT, type CardboardBox } from './CardboardBox';
import {
  KITTEN_BODY_SCALE,
  generateCatIdentity,
  getBreedProfile,
  type CatBreedProfile,
} from './CatBreeds';
import {
  drawBodyMarkings,
  drawBreedBody,
  drawBreedHead,
  drawBreedPaws,
  drawBreedShadow,
  drawBreedTail,
  getCoatProfile,
  type CatCoatProfile,
  type CatEyeExpression,
  type CatPoseMode,
  type SpineRenderPoints,
} from './CatCoatGenerator';
import type { ParticleSystem } from './ParticleSystem';
import { assignCatToLaserTarget } from './PrismMath';
import type { YarnBall } from './YarnBall';

const GROUNDED_Z_EPSILON = 2;
const PERCH_ELEVATION_PX = 16;
const POUNCE_PEAK_Z_PX = 38;
const BOX_JUMP_BASE_PEAK_Z_PX = 62;
const BOX_JUMP_MIN_PEAK_Z_PX = 54;
const BOX_JUMP_MAX_PEAK_Z_PX = 72;
const SLEEP_WAKE_STARTLE_MIN_Z_PX = 54;
const SLEEP_WAKE_STARTLE_MAX_Z_PX = 66;
const CUCUMBER_SCARE_PEAK_Z_PX = 78;

export interface CatEntityOptions {
  seed?: number;
  name?: string;
  coatVariantIndex?: number;
  isKitten?: boolean;
  collarColor?: string | null;
  hasBell?: boolean;
  archetype?: CatArchetype;
}

export interface CatJumpArcDebug {
  active: boolean;
  start: Vec2;
  end: Vec2;
  progress: number;
  peakZ: number;
  currentZ: number;
  wallHeight: number;
}

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
  onSound?: (event: CatSoundEvent, catId: number) => void;
  occupiedIconIds?: ReadonlySet<number>;
  sceneObstacles?: readonly AabbRect[];
  interactiveProps?: readonly InteractivePropState[];
  warmZones?: readonly WarmZone[];
  activeTreats?: readonly DroppedTreat[];
  ambientCritters?: readonly AmbientCritter[];
  otherCats?: readonly CatEntity[];
  cursorPos?: Vec2 | null;
  onPropInteract?: (propId: string, cat: CatEntity) => void;
  onConsumeTreat?: (treatId: string, cat: CatEntity) => boolean;
  toys?: readonly ToyEntityState[];
  onBatToy?: (toyId: string, vx: number, vy: number, catId: number) => void;
  onCarryToy?: (toyId: string, catId: number | null, x?: number, y?: number, rotation?: number) => void;
  onPopBubble?: (toyId: string, catId: number) => void;
  onConsumeToy?: (toyId: string, catId: number) => void;
  windowLedges?: WindowLedgesState | null;
  catCount?: number;
  isKittenMode?: boolean;
  collarColor?: string | null;
  collarBell?: boolean;
  nowDate?: Date;
}

export type CatSleepPose = 'curled' | 'belly_up_sleep' | 'sprawled';

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

function smoothstep(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
}

function hashUint32(input: number): number {
  let x = (input >>> 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Top-down 90-degree procedural cat backed by CatBrain (needs, circadian rhythm,
 * archetypes, kitten mode, friendship XP/overstimulation, rare events), breed anatomy,
 * animated Zzz sleep indicator with click-to-wake startled jump, and all 50 FSM states.
 */
export class CatEntity extends Container {
  readonly id: number;
  readonly breed: CatBreed;
  readonly seed: number;
  readonly shadowGraphics: Graphics;

  private readonly breedProfile: CatBreedProfile;
  private readonly coatProfile: CatCoatProfile;
  private readonly identity: CatIdentity;
  private readonly personality: CatPersonality;
  private readonly brain: CatBrain;

  private readonly body: CircleBody;
  private readonly spine: SpineChain;
  private readonly tail: VerletChain;
  private readonly noise: PerlinNoise;
  private readonly fsm: DynamicFsm<CatStateName, CatEntity>;

  private readonly bodyGraphics: Graphics;
  private readonly headGraphics: Graphics;
  private readonly pawOverlayGraphics: Graphics;
  private readonly sleepText: Text;

  // Decorrelated per-cat PRNG + unique locomotion cadence
  private prngState: number;
  private readonly noiseOffsetX: number;
  private readonly noiseOffsetY: number;
  private readonly wanderNoiseFreq: number;
  private readonly wanderTurnGain: number;
  private readonly speedVariance: number;
  private readonly strideVariance: number;
  private readonly paceModFreq: number;
  private readonly paceModPhase: number;

  private ctx!: CatContext;
  private time = 0;
  private heading: number;
  private headAngle: number;
  private walkPhase: number;
  private mood: CatMood;
  private activePropId: string | null = null;
  private clickCaptionIndex = 0;
  private prevIdleSeconds = 0;

  // Elevation in world pixels (0 grounded, > 2 airborne over walls/flaps)
  private zHeight = 0;
  private pounceDuration = 0.46;
  private startleFrom: Vec2 | null = null;
  private startlePeakZ = 0;
  private startleJumpPeakZ = 60;
  private investigatePoint: Vec2 | null = null;
  private investigateSniffTimer = 0;

  private activeTarget: Vec2 | null = null;
  private stateTargetDuration = 2.0;
  private wanderHeading = 0;
  private wanderGoal: Vec2 | null = null;
  private wanderGoalTimer = 0;
  private wanderPauseTimer = 0;
  private wanderPauseCooldown = 1.6;
  private napSpot: Vec2 | null = null;

  // Sleep & dreaming tracking
  private sleepPose: CatSleepPose = 'curled';
  private dreamTwitchTimer = 0.5;
  private dreamMewTimer = 2.2;
  private boxSleeping = false;

  // Box state & high parabolic jump arc tracking
  private boxStayTimer = 0;
  private boxCooldown = 0;
  private boxLastPos: Vec2 | null = null;
  private headingForBox = false;
  private jumpStartPos: Vec2 = { x: 0, y: 0 };
  private jumpEndPos: Vec2 = { x: 0, y: 0 };
  private jumpTakenOff = false;
  private jumpPeakZ = BOX_JUMP_BASE_PEAK_Z_PX;
  private jumpCrouchDur = 0.16;
  private jumpFlightDur = 0.52;
  private jumpProgress = 0;
  private jumpOutNextState: CatStateName = 'WANDER';
  private jumpOutUrgent = false;

  // Desktop icon play
  private iconInteractCooldown = 0;
  private iconCheckTimer = 0.8;
  private targetIcon: AabbRect | null = null;
  private perchedIconId: number | null = null;
  private perchDuration = 7;
  private perchHopDownActive = false;
  private perchHopDownTime = 0;
  private perchHopDownDuration = 0.42;
  private perchLastIconCenter: Vec2 | null = null;
  private scratchDuration = 2;
  private scratchBurstTimer = 0;
  private scratchEdgePoint: Vec2 = { x: 0, y: 0 };
  private pendingIconPlay: { icon: AabbRect; mode: 'perch' | 'scratch' } | null = null;

  private petInBoxHold = false;
  private petOnIconHold = false;

  // Behavior state timers & targets
  private behaviorCooldown = 2.0;
  private zoomieCooldown = 14;
  private socialCooldown = 6;
  private propCooldown = 4;
  private cucumberCooldown = 0;
  private bellSoundCooldown = 0;

  private groomPhase = 0;
  private groomStage: 0 | 1 | 2 | 3 = 0;
  private groomFreezeTimer = 0;
  private groomSparkleTimer = 0;
  private rollPhase = 0;
  private stretchFactor = 0;
  private stretchDuration = 2.4;
  private zoomieDuration = 4.0;
  private zoomieDustTimer = 0;
  private zoomieCurveDir = 1;
  private meerkatTarget: Vec2 | null = null;
  private meerkatDuration = 2.5;
  private sunbatheSpot: Vec2 | null = null;
  private sunbatheArrived = false;
  private sunbatheDuration = 8.0;
  private sunbathePurrTimer = 0;

  private socialPartner: CatEntity | null = null;
  private socialMode: 'boop' | 'chase' | 'cuddle' = 'boop';
  private socialDuration = 2.6;
  private socialHeartEmitted = false;

  private targetProp: InteractivePropState | null = null;
  private targetPropPoint: Vec2 | null = null;
  private propArrived = false;
  private propActionTimer = 0;
  private propDuration = 3.5;
  private propNotified = false;

  private targetTreat: DroppedTreat | null = null;
  private treatArrived = false;
  private treatBiteTimer = 0;

  // v2.0 realistic behavior fields
  private kneadPhase = 0;
  private slowBlinkPhase = 0;
  private chatterTarget: Vec2 | null = null;
  private chatterTimer = 0;
  private voidStarePoint: Vec2 | null = null;
  private headBuntTarget: Vec2 | null = null;
  private headBuntArrived = false;
  private sneezeTimer = 0;
  private sneezeDone = false;
  private drinkProp: InteractivePropState | null = null;
  private drinkTarget: Vec2 | null = null;
  private drinkArrived = false;
  private drinkLapTimer = 0;
  private litterProp: InteractivePropState | null = null;
  private litterArrived = false;
  private litterStage = 0;
  private giftToy: ToyEntityState | null = null;
  private giftEdgeTarget: Vec2 | null = null;
  private giftPickedUp = false;
  private hairballHeaves = 0;
  private hairballTimer = 0;
  private ignoreAwayAngle = 0;
  private taskbarLedge: AabbRect | null = null;
  private taskbarDir = 1;
  private taskbarPeekTimer = 0;
  private pawTestTarget: Vec2 | null = null;
  private pawTestArrived = false;
  private pawTestTaps = 0;
  private pawTestTimer = 0;
  private overstimulatedDir = 0;
  private bagToy: ToyEntityState | null = null;
  private bagProp: InteractivePropState | null = null;
  private bagTarget: Vec2 | null = null;
  private bagEntered = false;
  private bagLunged = false;
  private targetToy: ToyEntityState | null = null;
  private toyBatCooldown = 0;

  private blinkTimer = 0;
  private blinkDuration = 0;
  private earTwitchLeft = 0;
  private earTwitchRight = 0;
  private earTwitchTimer = 2.2;
  private earPose: CatEarPose = 'normal';
  private soundAlertTimer = 0;

  private squashX = 1;
  private squashY = 1;
  private sleepZTimer = 0;
  private purrTimer = 0;
  private petHoldTimer = 0;
  private staticRenderSkipCounter = 0;

  private lastSyncedBodyX: number;
  private lastSyncedBodyY: number;

  constructor(
    id: number,
    breed: CatBreed | string,
    x: number,
    y: number,
    options?: CatEntityOptions,
  ) {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.id = id;
    this.breed = normalizeCatBreed(breed);
    this.breedProfile = getBreedProfile(this.breed);

    const baseSeed =
      options?.seed !== undefined && Number.isFinite(options.seed)
        ? Math.floor(options.seed) >>> 0
        : hashUint32(
            Math.imul(id + 1, 0x9e3779b1) ^
              hashString(this.breed) ^
              Math.imul(Math.round(x * 7) ^ Math.round(y * 13), 0x85ebca6b),
          );
    this.seed = baseSeed || 1;
    this.prngState = hashUint32(this.seed ^ 0xa5a5a5a5) || 1;

    this.identity = generateCatIdentity(id, this.breed, this.seed, {
      name: options?.name,
      coatVariantIndex: options?.coatVariantIndex,
    });
    this.personality = { ...this.identity.personality };
    this.mood = this.identity.mood;
    this.coatProfile = getCoatProfile(this.breed, this.identity.coatVariantIndex);

    this.brain = new CatBrain({
      catId: this.id,
      seed: this.seed,
      breed: this.breed,
      personality: this.personality,
      archetype: options?.archetype,
      isKitten: options?.isKitten ?? false,
      collarColor: options?.collarColor ?? null,
      hasBell: options?.hasBell ?? true,
    });

    this.noise = new PerlinNoise(hashUint32(this.seed ^ 0x4f1bbcdc));
    this.noiseOffsetX = 17.3 + this.nextRand() * 880.7;
    this.noiseOffsetY = 31.7 + this.nextRand() * 911.3;
    this.wanderNoiseFreq = 0.22 + this.nextRand() * 0.44;
    this.wanderTurnGain = 1.4 + this.nextRand() * 1.9;
    this.speedVariance = 0.84 + this.nextRand() * 0.36;
    this.strideVariance = 0.88 + this.nextRand() * 0.28;
    this.paceModFreq = 0.35 + this.nextRand() * 0.55;
    this.paceModPhase = this.nextRand() * Math.PI * 2;
    this.walkPhase = this.nextRand() * Math.PI * 2;

    this.heading = normalizeAngle((this.nextRand() * 2 - 1) * Math.PI);
    this.headAngle = this.heading;
    this.wanderHeading = this.heading;

    const bodySpec = this.breedProfile.anatomy.body;
    const tailSpec = this.breedProfile.anatomy.tail;
    const kittenScale = this.brain.isKitten() ? KITTEN_BODY_SCALE : 1;

    this.body = {
      x,
      y,
      vx: 0,
      vy: 0,
      radius: bodySpec.collisionRadius * kittenScale,
    };
    this.lastSyncedBodyX = x;
    this.lastSyncedBodyY = y;

    this.spine = new SpineChain(
      bodySpec.headToTorsoLen * kittenScale,
      bodySpec.torsoToHipsLen * kittenScale,
      bodySpec.maxSpineBendRad,
    );
    this.spine.reset(x, y, this.heading);

    this.tail = new VerletChain(
      tailSpec.segments,
      tailSpec.segmentLength * kittenScale,
      this.spine.hips.x - Math.cos(this.heading) * tailSpec.rootOffset * kittenScale,
      this.spine.hips.y - Math.sin(this.heading) * tailSpec.rootOffset * kittenScale,
      tailSpec.damping,
    );

    this.blinkTimer = 1.0 + this.nextRand() * 3.5;
    this.earTwitchTimer = 0.9 + this.nextRand() * 3.0;
    this.iconInteractCooldown = 2.5 + this.nextRand() * 6.5;
    this.boxCooldown = 1.2 + this.nextRand() * 4.5;
    this.behaviorCooldown = 1.2 + this.nextRand() * 3.8;
    this.zoomieCooldown = (14 + this.nextRand() * 24) * (1.25 - this.personality.zoomieProneness * 0.65);
    this.socialCooldown = 4 + this.nextRand() * 8;
    this.propCooldown = 2 + this.nextRand() * 6;
    this.zoomieCurveDir = this.nextRand() < 0.5 ? 1 : -1;

    this.shadowGraphics = new Graphics();
    this.bodyGraphics = new Graphics();
    this.headGraphics = new Graphics();
    this.pawOverlayGraphics = new Graphics();

    this.sleepText =
      typeof Text === 'function'
        ? new Text({
            text: 'Zzz',
            style: {
              fontFamily: 'Georgia, "Segoe UI", sans-serif',
              fontSize: 13,
              fontWeight: '700',
              fill: 0xf9f1e4,
              stroke: { color: 0x2a1a10, width: 3.2 },
              letterSpacing: 0.6,
            },
          })
        : ({
            text: 'Zzz',
            visible: false,
            alpha: 1,
            rotation: 0,
            anchor: { set() {} },
            position: { set() {} },
            scale: { set() {} },
          } as unknown as Text);
    this.sleepText.anchor.set(0.5, 1);
    this.sleepText.visible = false;

    this.addChild(this.shadowGraphics);
    this.addChild(this.bodyGraphics);
    this.addChild(this.headGraphics);
    this.addChild(this.pawOverlayGraphics);
    if (typeof Text === 'function') {
      this.addChild(this.sleepText);
    }

    this.fsm = this.buildFsm();
    this.stateTargetDuration = 0.45 + this.nextRand() * 2.75;
    this.renderCat();
  }

  private nextRand(): number {
    this.prngState = (this.prngState + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.prngState ^ (this.prngState >>> 15), 1 | this.prngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private randRange(min: number, max: number): number {
    return min + this.nextRand() * (max - min);
  }

  attachShadowTo(shadowsLayer: Container): void {
    shadowsLayer.addChild(this.shadowGraphics);
  }

  // ============================================================================
  // Public Identity, Brain, Sleep & Inspection APIs
  // ============================================================================

  getBrain(): CatBrain {
    return this.brain;
  }

  getNeeds(): CatNeeds {
    return this.brain.getNeeds();
  }

  getArchetype(): CatArchetype {
    return this.brain.getArchetype();
  }

  getCustomization(): CatCustomization {
    return this.brain.getCustomization();
  }

  getFriendshipLevel(): number {
    return this.brain.getFriendshipLevel();
  }

  getFriendshipXp(): number {
    return this.brain.getFriendshipXp();
  }

  getCircadianPhase(date?: Date): CircadianPhase {
    return getCircadianPhase(date ?? this.ctx?.nowDate);
  }

  isKitten(): boolean {
    return this.brain.isKitten();
  }

  setKittenMode(enabled: boolean): void {
    const prev = this.brain.isKitten();
    this.brain.setKittenMode(enabled);
    if (prev !== this.brain.isKitten()) {
      const scale = this.brain.isKitten() ? KITTEN_BODY_SCALE : 1;
      this.body.radius = this.breedProfile.anatomy.body.collisionRadius * scale;
    }
  }

  setCollar(collarColor: string | null, hasBell: boolean): void {
    this.brain.setCollar(collarColor, hasBell);
  }

  isSleeping(): boolean {
    const s = this.fsm.state;
    return s === 'NAP' || s === 'DEEP_SLEEP' || s === 'DREAMING';
  }

  getSleepIndicatorText(): string {
    return this.isSleeping() ? 'Zzz' : '';
  }

  getSleepPose(): CatSleepPose {
    return this.sleepPose;
  }

  getEarPose(): CatEarPose {
    return this.earPose;
  }

  getRegisteredStates(): CatStateName[] {
    return this.fsm.getRegisteredStates();
  }

  getIdentity(): CatIdentity {
    return {
      ...this.identity,
      personality: { ...this.personality },
      mood: this.mood,
      activePropId: this.activePropId,
      archetype: this.brain.getArchetype(),
      needs: this.brain.getNeeds(),
      customization: this.brain.getCustomization(),
    };
  }

  getName(): string {
    return this.identity.name;
  }

  getMood(): CatMood {
    return this.mood;
  }

  getPersonality(): CatPersonality {
    return { ...this.personality };
  }

  getBreedProfile(): CatBreedProfile {
    return this.breedProfile;
  }

  getCoatProfile(): CatCoatProfile {
    return this.coatProfile;
  }

  getActivePropId(): string | null {
    return this.activePropId;
  }

  getJumpArcDebug(): CatJumpArcDebug | null {
    const state = this.fsm.state;
    const isJumpState =
      state === 'JUMP_TO_BOX' ||
      state === 'JUMP_OUT_BOX' ||
      state === 'JUMP_TO_ICON' ||
      (state === 'PERCH_ICON' && this.perchHopDownActive);
    if (!isJumpState) {
      return null;
    }
    return {
      active: true,
      start: { ...this.jumpStartPos },
      end: { ...this.jumpEndPos },
      progress: this.jumpProgress,
      peakZ: this.jumpPeakZ,
      currentZ: this.zHeight,
      wallHeight: this.ctx?.cardboardBox?.getWallHeight() ?? BOX_WALL_HEIGHT,
    };
  }

  private emitSound(event: CatSoundEvent): void {
    this.ctx?.onSound?.(event, this.id);
  }

  private emitBellIfWearing(): void {
    const c = this.brain.getCustomization();
    if (c.collarColor !== null && c.hasBell && this.bellSoundCooldown <= 0) {
      this.bellSoundCooldown = 4.5;
      this.emitSound('bell');
    }
  }

  // ============================================================================
  // User & World Interaction Triggers
  // ============================================================================

  /**
   * Handles a direct user click / double-click on this cat.
   * CRITICAL: Clicking a sleeping cat (NAP / DEEP_SLEEP / DREAMING) immediately wakes
   * it STARTLED with a vertical jump arc (54-66px zHeight), puffed tail, flat ears, and ! burst!
   */
  handleClick(isDoubleClick = false): CatClickReaction {
    const state = this.fsm.state;
    const visualY = this.body.y - this.zHeight * 0.68;
    const particles = this.ctx?.particles;
    let caption: string;
    let wokeFromSleep = false;
    let soundEvent: CatSoundEvent | undefined;

    this.pendingIconPlay = null;

    // 1. SLEEPING CAT -> Immediate STARTLED vertical jump wake-up!
    if (this.isSleeping()) {
      wokeFromSleep = true;
      soundEvent = 'startle';
      this.brain.recordInteraction('wake_startle');
      this.startleFrom = this.ctx?.cursorPos
        ? { ...this.ctx.cursorPos }
        : {
            x: this.body.x - Math.cos(this.heading) * 36,
            y: this.body.y - Math.sin(this.heading) * 36,
          };
      this.startlePeakZ = this.randRange(SLEEP_WAKE_STARTLE_MIN_Z_PX, SLEEP_WAKE_STARTLE_MAX_Z_PX);
      this.mood = 'startled';
      this.earPose = 'flat_back';
      this.fsm.transition('STARTLED', true);
      particles?.spawnStartleBurst(this.body.x, visualY);
      caption = 'Startled awake with a giant leap!';

      return {
        catId: this.id,
        name: this.identity.name,
        breed: this.breed,
        breedLabel: this.identity.breedLabel,
        mood: this.mood,
        state: this.fsm.state,
        caption,
        x: this.body.x,
        y: visualY,
        friendshipLevel: this.brain.getFriendshipLevel(),
        friendshipXp: this.brain.getFriendshipXp(),
        wokeFromSleep,
        soundEvent,
      };
    }

    this.squashX = 1.15;
    this.squashY = 0.86;

    // 2. Cat inside cardboard box -> pops cleanly OVER the rim via JUMP_OUT_BOX!
    if (state === 'IN_BOX') {
      const napThreshold = this.ctx?.idleNapSeconds ?? IDLE_NAP_SECONDS;
      const wasBoxSleep = this.boxSleeping || (this.ctx?.idleSeconds ?? 0) >= napThreshold;
      this.boxSleeping = false;
      if (wasBoxSleep) {
        wokeFromSleep = true;
        soundEvent = 'startle';
        this.brain.recordInteraction('wake_startle');
        this.jumpOutNextState = 'STARTLED';
        this.jumpOutUrgent = true;
        this.fsm.transition('JUMP_OUT_BOX', true);
        particles?.spawnStartleBurst(this.body.x, visualY);
        caption = 'Startled out of the box!';
      } else {
        const res = this.brain.recordInteraction('click');
        soundEvent = res.soundEvent ?? 'chirp';
        this.mood = 'playful';
        this.jumpOutNextState = isDoubleClick ? 'ROLL_BELLY' : 'WANDER';
        this.jumpOutUrgent = false;
        this.fsm.transition('JUMP_OUT_BOX', true);
        particles?.spawnMusicNotes(this.body.x, visualY - 10, 2);
        particles?.spawnHeartBurst(this.body.x, visualY - 6, 2);
        this.emitSound(soundEvent);
        caption = 'Popped out of the box to say hi!';
      }
      return {
        catId: this.id,
        name: this.identity.name,
        breed: this.breed,
        breedLabel: this.identity.breedLabel,
        mood: this.mood,
        state: this.fsm.state,
        caption,
        x: this.body.x,
        y: visualY,
        friendshipLevel: this.brain.getFriendshipLevel(),
        friendshipXp: this.brain.getFriendshipXp(),
        wokeFromSleep,
        soundEvent,
      };
    }

    if (
      state === 'PERCH_ICON' ||
      state === 'JUMP_TO_BOX' ||
      state === 'JUMP_OUT_BOX' ||
      state === 'JUMP_TO_ICON'
    ) {
      const res = this.brain.recordInteraction('click');
      soundEvent = res.soundEvent ?? 'chirp';
      this.mood = 'playful';
      particles?.spawnMusicNotes(this.body.x, visualY - 10, 2);
      particles?.spawnHeartBurst(this.body.x, visualY - 6, 2);
      this.emitSound(soundEvent);
      caption = this.pickNextClickCaption();
      return {
        catId: this.id,
        name: this.identity.name,
        breed: this.breed,
        breedLabel: this.identity.breedLabel,
        mood: this.mood,
        state: this.fsm.state,
        caption,
        x: this.body.x,
        y: visualY,
        friendshipLevel: res.friendshipLevel,
        friendshipXp: res.friendshipXp,
        wokeFromSleep: false,
        soundEvent,
      };
    }

    // 3. Friendship / Overstimulation / Ignore check
    const interaction = this.brain.recordInteraction('click', isDoubleClick ? 1.2 : 1.0);
    soundEvent = interaction.soundEvent;

    if (interaction.overstimulated) {
      this.mood = 'irritated';
      this.fsm.transition('OVERSTIMULATED', true);
      particles?.spawnChatterPuff(this.body.x, visualY - 10);
      this.emitSound('chirp');
      caption = 'Tail flicks — needs some personal space';
    } else if (interaction.ignored && !isDoubleClick) {
      this.mood = 'irritated';
      this.fsm.transition('IGNORE_USER', true);
      caption = 'Flicked an ear and pretended not to hear you';
    } else if (state === 'SUNBATHE') {
      this.mood = 'content';
      this.fsm.transition('STRETCHING', true);
      particles?.spawnHeartBurst(this.body.x, visualY - 8, 2);
      particles?.spawnGroomSparkle(this.body.x, visualY - 12);
      this.emitSound(soundEvent ?? 'purr');
      caption = 'Woke from sunbathing for a cozy stretch';
    } else if (isDoubleClick) {
      if (this.personality.zoomieProneness >= 0.55 && state !== 'ZOOMIES') {
        this.mood = 'zoomy';
        this.fsm.transition('ZOOMIES', true);
        particles?.spawnCatnipSparkles(this.body.x, visualY - 8, 6);
        particles?.spawnMusicNotes(this.body.x, visualY - 12, 2);
        this.emitSound('trill');
        soundEvent = 'trill';
        caption = 'Burst into playful zoomies!';
      } else {
        this.mood = 'affectionate';
        this.fsm.transition('ROLL_BELLY', true);
        particles?.spawnHeartBurst(this.body.x, visualY - 10, 4);
        particles?.spawnMusicNotes(this.body.x, visualY - 12, 2);
        this.emitSound(soundEvent ?? 'purr');
        caption = 'Flopped over for belly rubs!';
      }
    } else {
      const roll = this.nextRand();
      const aff = this.breedProfile.behaviorAffinities;
      const lvl = interaction.friendshipLevel;
      if (lvl >= 2 && roll < 0.22 + (lvl - 1) * 0.05 && state !== 'SLOW_BLINK') {
        this.mood = 'affectionate';
        this.fsm.transition('SLOW_BLINK', true);
        particles?.spawnHeartBurst(this.body.x, visualY - 10, 2);
        this.emitSound('purr');
        soundEvent = 'purr';
        caption = 'Slow-blinking affectionately at you';
      } else if (roll < 0.48 + this.personality.playfulness * 0.16 && state !== 'ROLL_BELLY') {
        this.mood = 'affectionate';
        this.fsm.transition('ROLL_BELLY', true);
        particles?.spawnHeartBurst(this.body.x, visualY - 8, 3);
        particles?.spawnMusicNotes(this.body.x, visualY - 10, 2);
        this.emitSound(soundEvent ?? 'purr');
        caption = 'Doing happy belly rolls';
      } else if (roll < 0.68 + aff.meerkatPeek * 0.18 && state !== 'MEERKAT_PEEK') {
        this.mood = 'curious';
        this.meerkatTarget = this.ctx?.cursorPos
          ? { ...this.ctx.cursorPos }
          : { x: this.body.x + Math.cos(this.heading) * 60, y: this.body.y + Math.sin(this.heading) * 60 };
        this.fsm.transition('MEERKAT_PEEK', true);
        particles?.spawnMusicNotes(this.body.x, visualY - 12, 2);
        particles?.spawnCuriosityPop(this.body.x, visualY - 10);
        this.emitSound('chirp');
        soundEvent = 'chirp';
        caption = this.breed === 'munchkin' ? 'Perked into a tiny meerkat peek!' : 'Perked up with curious ears';
      } else {
        this.mood = 'affectionate';
        this.petHoldTimer = 1.65;
        this.fsm.transition('PETTED', true);
        particles?.spawnHeartBurst(this.body.x, visualY - 8, 3);
        particles?.spawnMusicNotes(this.body.x, visualY - 10, 1);
        this.emitSound(soundEvent ?? 'purr');
        caption = this.pickNextClickCaption();
      }
    }

    return {
      catId: this.id,
      name: this.identity.name,
      breed: this.breed,
      breedLabel: this.identity.breedLabel,
      mood: this.mood,
      state: this.fsm.state,
      caption,
      x: this.body.x,
      y: visualY,
      friendshipLevel: interaction.friendshipLevel,
      friendshipXp: interaction.friendshipXp,
      wokeFromSleep,
      soundEvent,
    };
  }

  private pickNextClickCaption(): string {
    const captions = this.breedProfile.clickCaptions;
    if (captions.length === 0) {
      return 'Purred happily';
    }
    const text = captions[this.clickCaptionIndex % captions.length];
    this.clickCaptionIndex++;
    return text;
  }

  /**
   * Reacts to loud desktop media/audio bursts by swiveling ears and glancing toward sourceX.
   */
  triggerSoundAlert(level: number, sourceX?: number): void {
    const safeLevel = clamp(Number.isFinite(level) ? level : 0, 0, 1);
    if (safeLevel < 0.25) return;

    this.soundAlertTimer = 1.4;
    this.earTwitchLeft = 0.35;
    this.earTwitchRight = 0.35;
    this.earPose = safeLevel > 0.72 ? 'forward' : 'normal';

    const lookX = sourceX ?? this.ctx?.cursorPos?.x ?? this.body.x + Math.cos(this.heading) * 90;
    const lookY = this.body.y - 40;
    this.headAngle = Math.atan2(lookY - this.body.y, lookX - this.body.x);

    if (safeLevel >= 0.78 && !this.isBusyOrAirborne() && !this.isSleeping()) {
      this.meerkatTarget = { x: lookX, y: lookY };
      this.fsm.transition('MEERKAT_PEEK', true);
    }
  }

  /**
   * Triggers iconic cucumber panic leap (78px vertical jump!).
   */
  triggerCucumberScare(cucumberPos: Vec2): void {
    const state = this.fsm.state;
    if (
      state === 'CUCUMBER_SCARE' ||
      state === 'JUMP_TO_BOX' ||
      state === 'JUMP_OUT_BOX' ||
      state === 'JUMP_TO_ICON'
    ) {
      return;
    }
    this.startleFrom = { x: cucumberPos.x, y: cucumberPos.y };
    this.cucumberCooldown = 14;
    if (state === 'IN_BOX') {
      this.jumpOutNextState = 'STARTLED';
      this.jumpOutUrgent = true;
      this.fsm.transition('JUMP_OUT_BOX', true);
      return;
    }
    this.fsm.transition('CUCUMBER_SCARE', true);
  }

  triggerOverstimulated(): void {
    if (this.isBusyOrAirborne()) return;
    this.fsm.transition('OVERSTIMULATED', true);
  }

  triggerPropAttract(prop: InteractivePropState, point?: Vec2): void {
    const state = this.fsm.state;
    if (state === 'JUMP_TO_BOX' || state === 'JUMP_OUT_BOX' || state === 'JUMP_TO_ICON' || state === 'BONK') {
      return;
    }

    const interactPt = point ?? prop.interactPoint ?? { x: prop.x, y: prop.y };

    if (prop.interactionType === 'drink') {
      this.drinkProp = prop;
      this.drinkTarget = this.pickDrinkPointForProp(prop);
      this.activePropId = prop.id;
      if (state === 'IN_BOX') {
        this.jumpOutNextState = 'DRINKING';
        this.jumpOutUrgent = false;
        this.fsm.transition('JUMP_OUT_BOX');
        return;
      }
      this.fsm.transition('DRINKING', true);
      return;
    }

    if (prop.interactionType === 'litter') {
      this.litterProp = prop;
      this.activePropId = prop.id;
      if (state === 'IN_BOX') {
        this.jumpOutNextState = 'LITTER_USE';
        this.jumpOutUrgent = false;
        this.fsm.transition('JUMP_OUT_BOX');
        return;
      }
      this.fsm.transition('LITTER_USE', true);
      return;
    }

    if (prop.interactionType === 'ambush') {
      this.bagProp = prop;
      this.bagToy = null;
      this.bagTarget = { x: interactPt.x, y: interactPt.y };
      this.activePropId = prop.id;
      if (state === 'IN_BOX') {
        this.jumpOutNextState = 'PAPER_BAG_AMBUSH';
        this.jumpOutUrgent = false;
        this.fsm.transition('JUMP_OUT_BOX');
        return;
      }
      this.fsm.transition('PAPER_BAG_AMBUSH', true);
      return;
    }

    this.targetProp = prop;
    this.targetPropPoint = { x: interactPt.x, y: interactPt.y };
    this.activePropId = prop.id;
    this.mood = prop.interactionType === 'catnip' || prop.interactionType === 'play' ? 'playful' : 'curious';

    if (state === 'IN_BOX') {
      this.jumpOutNextState = 'PROP_INTERACT';
      this.jumpOutUrgent = false;
      this.fsm.transition('JUMP_OUT_BOX');
      return;
    }
    if (state === 'PERCH_ICON') {
      if (!this.perchHopDownActive) {
        this.beginIconHopDown(this.findObstacleById(this.perchedIconId));
      }
      return;
    }

    this.fsm.transition('PROP_INTERACT', true);
  }

  triggerTreatAttract(treat: DroppedTreat): void {
    const state = this.fsm.state;
    if (state === 'JUMP_TO_BOX' || state === 'JUMP_OUT_BOX' || state === 'JUMP_TO_ICON' || state === 'BONK') {
      return;
    }

    this.targetTreat = treat;
    this.treatArrived = false;
    this.mood = 'playful';

    if (state === 'IN_BOX') {
      this.jumpOutNextState = 'EATING_TREAT';
      this.jumpOutUrgent = false;
      this.fsm.transition('JUMP_OUT_BOX');
      return;
    }
    if (state === 'PERCH_ICON') {
      if (!this.perchHopDownActive) {
        this.beginIconHopDown(this.findObstacleById(this.perchedIconId));
      }
      return;
    }

    this.fsm.transition('EATING_TREAT', true);
  }

  triggerCuriosityGlance(point: Vec2): void {
    const state = this.fsm.state;
    this.meerkatTarget = { x: point.x, y: point.y };

    if (state === 'IN_BOX' || state === 'PERCH_ICON' || state === 'LOAFING' || this.isSleeping()) {
      if (!this.isSleeping()) {
        this.headAngle = Math.atan2(point.y - this.body.y, point.x - this.body.x);
      }
      this.earTwitchLeft = 0.28;
      this.earTwitchRight = 0.28;
      return;
    }
    if (state === 'IDLE' || state === 'WANDER' || state === 'GROOMING') {
      this.mood = 'curious';
      this.fsm.transition('MEERKAT_PEEK', true);
    }
  }

  triggerPet(): void {
    this.petHoldTimer = 1.25;
    this.pendingIconPlay = null;
    const prevState = this.fsm.state;

    if (this.isSleeping()) {
      // Gentle pet doesn't panic-jump (only clicking does!), just wakes gently or purrs
      this.brain.recordInteraction('pet');
      this.mood = 'affectionate';
      this.fsm.transition('STRETCHING', true);
      return;
    }

    const res = this.brain.recordInteraction('pet', 0.45);
    if (res.overstimulated) {
      this.mood = 'irritated';
      this.fsm.transition('OVERSTIMULATED', true);
      return;
    }

    this.mood = 'affectionate';
    if (prevState === 'IN_BOX') {
      this.petInBoxHold = true;
      this.fsm.transition('PETTED');
      return;
    }
    if (prevState === 'JUMP_TO_BOX' || prevState === 'JUMP_OUT_BOX' || prevState === 'JUMP_TO_ICON') {
      return;
    }
    if (prevState === 'PERCH_ICON') {
      this.petOnIconHold = true;
    }
    if (prevState !== 'PETTED') {
      this.fsm.transition('PETTED');
    }
  }

  triggerInvestigate(point: Vec2): void {
    this.investigatePoint = { x: point.x, y: point.y };
    this.investigateSniffTimer = 0;
    this.pendingIconPlay = null;
    this.mood = 'curious';
    const state = this.fsm.state;
    if (state === 'IDLE' || state === 'WANDER' || state === 'LOAFING' || state === 'GROOMING') {
      this.fsm.transition('SNIFF_FILE');
    }
  }

  triggerStartle(from: Vec2): void {
    this.startleFrom = { x: from.x, y: from.y };
    this.startlePeakZ = this.randRange(54, 66);
    this.pendingIconPlay = null;
    this.petInBoxHold = false;
    this.petOnIconHold = false;
    this.mood = 'startled';
    const prevState = this.fsm.state;

    if (prevState === 'IN_BOX') {
      this.jumpOutNextState = 'STARTLED';
      this.jumpOutUrgent = true;
      this.fsm.transition('JUMP_OUT_BOX', true);
      return;
    }
    if (prevState === 'JUMP_OUT_BOX') {
      this.jumpOutNextState = 'STARTLED';
      return;
    }
    if (prevState === 'JUMP_TO_BOX') {
      this.ctx?.cardboardBox?.release(this.id);
      this.boxCooldown = Math.max(this.boxCooldown, 9);
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
      this.jumpOutUrgent = false;
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
    if (state === 'PERCH_ICON' || (state === 'PETTED' && this.petOnIconHold)) {
      return true;
    }
    return this.zHeight > GROUNDED_Z_EPSILON;
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
    const liftY = -this.zHeight * 0.68;
    const hitR = this.body.radius + 11;
    const check = (px: number, py: number, r: number): boolean =>
      Math.hypot(x - px, y - py) <= r;

    if (check(this.body.x, this.body.y + liftY, hitR)) {
      return true;
    }
    if (check(this.spine.head.x, this.spine.head.y + liftY, hitR * 0.88)) {
      return true;
    }
    if (check(this.spine.hips.x, this.spine.hips.y + liftY, hitR * 0.85)) {
      return true;
    }
    return false;
  }

  // ============================================================================
  // Main Update Tick
  // ============================================================================

  update(dt: number, ctx: CatContext): void {
    const safeDt = Math.max(0, Math.min(dt, 0.05));
    this.ctx = ctx;
    this.time += safeDt;

    if (ctx.isKittenMode !== undefined && ctx.isKittenMode !== this.brain.isKitten()) {
      this.setKittenMode(ctx.isKittenMode);
    }
    if (ctx.collarColor !== undefined || ctx.collarBell !== undefined) {
      this.brain.setCollar(
        ctx.collarColor ?? this.brain.getCustomization().collarColor,
        ctx.collarBell ?? this.brain.getCustomization().hasBell,
      );
    }

    if (this.boxCooldown > 0) this.boxCooldown = Math.max(0, this.boxCooldown - safeDt);
    if (this.iconInteractCooldown > 0) this.iconInteractCooldown = Math.max(0, this.iconInteractCooldown - safeDt);
    if (this.iconCheckTimer > 0) this.iconCheckTimer = Math.max(0, this.iconCheckTimer - safeDt);
    if (this.behaviorCooldown > 0) this.behaviorCooldown = Math.max(0, this.behaviorCooldown - safeDt);
    if (this.zoomieCooldown > 0) this.zoomieCooldown = Math.max(0, this.zoomieCooldown - safeDt);
    if (this.socialCooldown > 0) this.socialCooldown = Math.max(0, this.socialCooldown - safeDt);
    if (this.propCooldown > 0) this.propCooldown = Math.max(0, this.propCooldown - safeDt);
    if (this.cucumberCooldown > 0) this.cucumberCooldown = Math.max(0, this.cucumberCooldown - safeDt);
    if (this.bellSoundCooldown > 0) this.bellSoundCooldown = Math.max(0, this.bellSoundCooldown - safeDt);
    if (this.toyBatCooldown > 0) this.toyBatCooldown = Math.max(0, this.toyBatCooldown - safeDt);
    if (this.soundAlertTimer > 0) {
      this.soundAlertTimer = Math.max(0, this.soundAlertTimer - safeDt);
      if (this.soundAlertTimer <= 0 && !this.isBusyOrAirborne()) {
        this.earPose = 'normal';
      }
    }

    ctx.cardboardBox?.stepIfUnstepped(safeDt);

    const extDx = this.body.x - this.lastSyncedBodyX;
    const extDy = this.body.y - this.lastSyncedBodyY;
    if (Math.abs(extDx) > 0.001 || Math.abs(extDy) > 0.001) {
      this.spine.moveHeadTo(this.spine.head.x + extDx, this.spine.head.y + extDy, this.heading);
    }

    const recover = 1 - Math.exp(-safeDt * 12);
    this.squashX += (1 - this.squashX) * recover;
    this.squashY += (1 - this.squashY) * recover;

    this.updateFacialIdleTimers(safeDt);

    // Tick CatBrain needs & circadian awareness
    this.brain.tick(safeDt, this.fsm.state, {
      isOnWarmZone: this.isNearWarmZone(),
      isOnRug: ctx.surfaceManager.isOnRug(this.body.x, this.body.y),
      date: ctx.nowDate,
    });

    this.fsm.update(safeDt);

    const state = this.fsm.state;
    const isBoxOrPerchControlled =
      state === 'IN_BOX' ||
      state === 'JUMP_TO_BOX' ||
      state === 'JUMP_OUT_BOX' ||
      state === 'JUMP_TO_ICON' ||
      state === 'PERCH_ICON' ||
      (state === 'PETTED' && (this.petInBoxHold || this.petOnIconHold));

    const isStaticRest =
      state === 'NAP' || state === 'DEEP_SLEEP' || state === 'DREAMING';

    if (!isBoxOrPerchControlled && !isStaticRest) {
      ctx.physics.applySurfaceFriction(this.body, safeDt);
      this.body.x += this.body.vx * safeDt;
      this.body.y += this.body.vy * safeDt;

      const box = ctx.cardboardBox;
      const boxWallHeight = box?.getWallHeight() ?? BOX_WALL_HEIGHT;
      const shouldCollideBox = Boolean(
        box && box.isVisible() && this.zHeight <= boxWallHeight,
      );
      const sceneObs = ctx.sceneObstacles;
      let extraObstacles: readonly AabbRect[] | undefined;
      if (shouldCollideBox && box && sceneObs && sceneObs.length > 0) {
        extraObstacles = [box.getExteriorObstacle(), ...sceneObs];
      } else if (shouldCollideBox && box) {
        extraObstacles = [box.getExteriorObstacle()];
      } else if (sceneObs && sceneObs.length > 0) {
        extraObstacles = sceneObs;
      }

      const obsHit = ctx.physics.resolveAllObstacles(this.body, 0.4, extraObstacles);
      const wallHit = ctx.physics.clampToBounds(this.body, 0.4);
      const hit = obsHit?.bonked ? obsHit : wallHit?.bonked ? wallHit : obsHit ?? wallHit;

      if (hit && hit.bonked && state !== 'BONK' && state !== 'CUCUMBER_SCARE') {
        this.fsm.transition('BONK', true);
      }

      this.handleYarnInteraction();
    } else if (
      !isStaticRest &&
      state !== 'JUMP_TO_BOX' &&
      state !== 'JUMP_OUT_BOX' &&
      state !== 'JUMP_TO_ICON' &&
      state !== 'PERCH_ICON'
    ) {
      this.body.vx = 0;
      this.body.vy = 0;
    }

    this.updateSpineAndTail(safeDt);

    this.lastSyncedBodyX = this.body.x;
    this.lastSyncedBodyY = this.body.y;
    this.prevIdleSeconds = ctx.idleSeconds;

    // Performance scaling: throttle full redraws for stationary sleeping/loafing cats when >30 cats
    if (
      this.isHighCatCountMode() &&
      (isStaticRest || state === 'LOAFING' || state === 'IN_BOX') &&
      Math.hypot(this.body.vx, this.body.vy) < 1
    ) {
      this.staticRenderSkipCounter = (this.staticRenderSkipCounter + 1) % 3;
      if (this.staticRenderSkipCounter === 0) {
        this.renderCat();
      } else {
        this.updateSleepTextTransform();
      }
    } else {
      this.renderCat();
    }
  }

  // ============================================================================
  // Shared Helpers for Concise FSM States
  // ============================================================================

  private getEffectiveCatCount(): number {
    return this.ctx?.catCount ?? this.ctx?.otherCats?.length ?? 1;
  }

  private isHighCatCountMode(): boolean {
    return this.getEffectiveCatCount() > 30;
  }

  private isBusyOrAirborne(): boolean {
    const s = this.fsm.state;
    return (
      s === 'JUMP_TO_BOX' ||
      s === 'JUMP_OUT_BOX' ||
      s === 'JUMP_TO_ICON' ||
      s === 'PERCH_ICON' ||
      s === 'BONK' ||
      s === 'CUCUMBER_SCARE' ||
      s === 'STARTLED'
    );
  }

  private dampVelocity(dt: number, factor = 0.72): void {
    const d = Math.pow(factor, dt * 60);
    this.body.vx *= d;
    this.body.vy *= d;
  }

  private steerTowards(target: Vec2, speed: number, dt: number, turnGain = 6.5): number {
    const dx = target.x - this.body.x;
    const dy = target.y - this.body.y;
    const dist = Math.hypot(dx, dy);
    const rawAng = Math.atan2(dy, dx);
    const steer = this.computeObstacleAvoidanceAngle(rawAng);
    this.heading = lerpAngle(this.heading, steer, dt * turnGain);
    this.headAngle = lerpAngle(this.headAngle, rawAng, dt * (turnGain + 2));
    const accel = speed * this.breedProfile.locomotion.walkSpeedMultiplier * 5.4;
    this.body.vx += Math.cos(this.heading) * accel * dt;
    this.body.vy += Math.sin(this.heading) * accel * dt;
    return dist;
  }

  private isNearWarmZone(): boolean {
    const zones = this.ctx?.warmZones;
    if (!zones) return false;
    for (const z of zones) {
      if (Math.hypot(z.x - this.body.x, z.y - this.body.y) <= z.radius + 16) {
        return true;
      }
    }
    return false;
  }

  private shouldWakeFromIdle(): boolean {
    const napThreshold = this.ctx?.idleNapSeconds ?? IDLE_NAP_SECONDS;
    const returnedFromIdle = this.prevIdleSeconds >= 8 && this.ctx.idleSeconds < 2;
    const typingWake = this.ctx.idleSeconds < napThreshold * 0.2 && this.ctx.typingActive;
    return returnedFromIdle || typingWake;
  }

  private pickDrinkPointForProp(prop: InteractivePropState): Vec2 {
    if (prop.drinkPoints && prop.drinkPoints.length > 0) {
      const idx = Math.floor(this.nextRand() * prop.drinkPoints.length);
      return { ...prop.drinkPoints[idx] };
    }
    return prop.interactPoint ? { ...prop.interactPoint } : { x: prop.x, y: prop.y };
  }

  // ============================================================================
  // FSM Definition (All 50 States)
  // ============================================================================

  private buildFsm(): DynamicFsm<CatStateName, CatEntity> {
    const fsm = new DynamicFsm<CatStateName, CatEntity>('IDLE', this);

    // 1. IDLE
    fsm.register('IDLE', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.activePropId = null;
        cat.earPose = 'normal';
        cat.stateTargetDuration = cat.randRange(1.0, 3.4) * (0.75 + cat.personality.laziness * 0.55);
        cat.napSpot = null;
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.checkImmediateStimuli()) return;

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

        if (cat.ctx.typingActive) {
          if (!cat.ctx.surfaceManager.isOnRug(cat.body.x, cat.body.y)) {
            cat.napSpot = cat.ctx.surfaceManager.getRandomRugSpot(26);
            cat.fsm.transition('WANDER');
            return;
          }
          cat.headAngle = lerpAngle(
            cat.headAngle,
            -Math.PI * 0.5 + Math.sin(cat.time * 0.9 + cat.noiseOffsetX) * 0.22,
            dt * 3,
          );
        } else {
          const lookOffset =
            cat.noise.noise2D(cat.time * 0.35 + cat.noiseOffsetX, cat.noiseOffsetY) * 0.72;
          cat.headAngle = lerpAngle(cat.headAngle, cat.heading + lookOffset, dt * 2.8);
        }

        if (cat.pendingIconPlay) {
          cat.fsm.transition('WANDER');
          return;
        }

        if (!cat.ctx.typingActive) {
          if (cat.tryEnterBox()) return;
          if (cat.tryInteractWithNearbyIcon()) return;
        }

        if (!cat.ctx.typingActive && stateTime >= cat.stateTargetDuration) {
          cat.chooseNextIdleActivity();
        }
      },
    });

    // 2. WANDER (Natural pauses, mid-walk sniff/glance, Perlin + waypoint + breed locomotion)
    fsm.register('WANDER', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.headingForBox = false;
        cat.wanderPauseTimer = 0;
        cat.wanderPauseCooldown = cat.randRange(1.4, 3.4);
        cat.stateTargetDuration = cat.randRange(2.4, 6.2) * (1.25 - cat.personality.laziness * 0.45);
        cat.wanderHeading = normalizeAngle(
          cat.heading + cat.noise.noise2D(cat.time * 0.6 + cat.noiseOffsetX, cat.noiseOffsetY * 0.5) * 1.65,
        );
        cat.pickNewWanderGoal();
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.checkImmediateStimuli()) return;

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

        if (cat.pendingIconPlay) {
          cat.stepPendingIconPlay(dt);
          return;
        }

        cat.headingForBox = false;
        const box = cat.ctx.cardboardBox;
        if (cat.ctx.idleSeconds < napThreshold && !cat.napSpot) {
          if (cat.tryEnterBox()) return;
          if (!cat.ctx.typingActive && cat.tryInteractWithNearbyIcon()) return;
          if (cat.tryStartSocialPlay()) return;
          if (cat.trySeekActiveProp()) return;

          if (box && box.isVisible() && box.occupantId === null && cat.boxCooldown <= 0) {
            const bp = box.getPosition();
            const distToBox = Math.hypot(bp.x - cat.body.x, bp.y - cat.body.y);
            const boxAffinity = cat.breedProfile.behaviorAffinities.boxAffinity;
            if (distToBox < 175 && cat.nextRand() < dt * (0.28 + boxAffinity * 0.45)) {
              cat.headingForBox = true;
              cat.wanderHeading = Math.atan2(bp.y - cat.body.y, bp.x - cat.body.x);
            }
          }
        }

        // Natural mid-walk pause to sit/look around/sniff instead of robotic marching
        if (!cat.napSpot && !cat.headingForBox) {
          if (cat.wanderPauseTimer > 0) {
            cat.wanderPauseTimer -= dt;
            cat.dampVelocity(dt, 0.72);
            cat.headAngle = lerpAngle(
              cat.headAngle,
              cat.heading + Math.sin(cat.time * 4.5 + cat.noiseOffsetX) * 0.55,
              dt * 5,
            );
            return;
          }
          cat.wanderPauseCooldown -= dt;
          if (cat.wanderPauseCooldown <= 0) {
            cat.wanderPauseCooldown = cat.randRange(2.4, 5.2);
            if (cat.nextRand() < 0.45) {
              cat.wanderPauseTimer = cat.randRange(0.45, 1.15);
              return;
            }
          }
        }

        const loco = cat.breedProfile.locomotion;
        const paceWave =
          0.84 + 0.28 * Math.sin(cat.time * cat.paceModFreq + cat.paceModPhase);
        let desiredAngle: number;
        let targetSpeed = 94 * loco.walkSpeedMultiplier * cat.speedVariance * paceWave;

        if (cat.napSpot) {
          desiredAngle = Math.atan2(cat.napSpot.y - cat.body.y, cat.napSpot.x - cat.body.x);
          targetSpeed = 112 * loco.walkSpeedMultiplier;
        } else {
          if (!cat.headingForBox) {
            const nPrimary = cat.noise.noise2D(
              cat.time * cat.wanderNoiseFreq + cat.noiseOffsetX,
              cat.noiseOffsetY,
            );
            const nFine = cat.noise.noise2D(
              cat.time * (cat.wanderNoiseFreq * 2.15) + cat.noiseOffsetY,
              cat.noiseOffsetX * 0.37,
            );
            cat.wanderHeading = normalizeAngle(
              cat.wanderHeading + (nPrimary * 0.78 + nFine * 0.22) * dt * cat.wanderTurnGain,
            );

            cat.wanderGoalTimer -= dt;
            if (
              !cat.wanderGoal ||
              cat.wanderGoalTimer <= 0 ||
              Math.hypot(cat.wanderGoal.x - cat.body.x, cat.wanderGoal.y - cat.body.y) < 42
            ) {
              cat.pickNewWanderGoal();
            }

            if (cat.wanderGoal) {
              const toGoal = Math.atan2(
                cat.wanderGoal.y - cat.body.y,
                cat.wanderGoal.x - cat.body.x,
              );
              cat.wanderHeading = lerpAngle(cat.wanderHeading, toGoal, dt * (0.45 + 0.35 * loco.turnAgility));
            }
          }

          desiredAngle = cat.computeObstacleAvoidanceAngle(cat.wanderHeading);
        }

        cat.heading = lerpAngle(cat.heading, desiredAngle, dt * 5.0 * loco.turnAgility);
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading, dt * 6.5);

        const accel = targetSpeed * 5.5;
        cat.body.vx += Math.cos(cat.heading) * accel * dt;
        cat.body.vy += Math.sin(cat.heading) * accel * dt;

        if (!cat.napSpot && !cat.pendingIconPlay && stateTime >= cat.stateTargetDuration) {
          cat.chooseNextWanderEndActivity();
        }
      },
      onExit: (cat) => {
        cat.headingForBox = false;
      },
    });

    // 3. STALK & CHASE_LASER (with realistic laser boredom after ~8-12s!)
    const stalkHooks = {
      onEnter: (cat: CatEntity) => {
        cat.zHeight = 0;
        cat.investigateSniffTimer = 0;
        cat.mood = 'hunting';
        cat.earPose = 'forward';
      },
      onUpdate: (cat: CatEntity, dt: number, stateTime: number) => {
        const laser = cat.resolveLaserTarget();
        if (laser && cat.brain.trackLaserChase(dt, true)) {
          cat.activeTarget = null;
          cat.mood = 'content';
          cat.earPose = 'normal';
          cat.fsm.transition(cat.nextRand() < 0.5 ? 'GROOMING' : 'WANDER');
          return;
        }

        const yarn = cat.ctx.yarnBall;
        const yarnActive = yarn && yarn.isRolling() ? yarn.getPosition() : null;
        const critter = cat.findNearestCritter(280);

        let targetPos: Vec2 | null = null;
        let isInvestigate = false;

        if (laser) {
          targetPos = { x: laser.x, y: laser.y };
        } else if (yarnActive) {
          targetPos = yarnActive;
        } else if (cat.investigatePoint) {
          targetPos = cat.investigatePoint;
          isInvestigate = true;
        } else if (critter) {
          targetPos = { x: critter.x, y: critter.y };
        }

        if (!targetPos) {
          cat.brain.trackLaserChase(dt, false);
          cat.fsm.transition('IDLE');
          return;
        }

        cat.activeTarget = targetPos;
        const dx = targetPos.x - cat.body.x;
        const dy = targetPos.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const angleToTarget = Math.atan2(dy, dx);

        cat.heading = lerpAngle(cat.heading, angleToTarget, dt * 7.5);
        cat.headAngle = lerpAngle(cat.headAngle, angleToTarget, dt * 10);

        if (isInvestigate) {
          if (dist < 46) {
            cat.dampVelocity(dt, 0.7);
            cat.investigateSniffTimer += dt;
            cat.headAngle = angleToTarget + Math.sin(cat.time * 14) * 0.14;
            if (cat.investigateSniffTimer >= 1.15) {
              cat.investigatePoint = null;
              cat.fsm.transition('IDLE');
            }
            return;
          }
          const crawlSpeed = 78 * cat.breedProfile.locomotion.walkSpeedMultiplier;
          cat.body.vx += Math.cos(cat.heading) * crawlSpeed * 5.2 * dt;
          cat.body.vy += Math.sin(cat.heading) * crawlSpeed * 5.2 * dt;
          return;
        }

        const stealthAccel = 56 * cat.breedProfile.locomotion.walkSpeedMultiplier * 6.0;
        cat.body.vx += Math.cos(cat.heading) * stealthAccel * dt;
        cat.body.vy += Math.sin(cat.heading) * stealthAccel * dt;

        if ((dist <= 145 && dist >= 24 && stateTime >= 0.42) || (dist < 24 && stateTime >= 0.28)) {
          cat.fsm.transition('POUNCE_WIGGLE');
        }
      },
      onExit: (cat: CatEntity) => {
        cat.earPose = 'normal';
      },
    };
    fsm.register('STALK', stalkHooks);
    fsm.register('CHASE_LASER', stalkHooks);

    // 4. SNIFF_FILE
    fsm.register('SNIFF_FILE', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.investigateSniffTimer = 0;
        cat.mood = 'curious';
        cat.earPose = 'forward';
      },
      onUpdate: (cat, dt) => {
        const laser = cat.resolveLaserTarget();
        if (laser) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.fsm.transition('STALK');
          return;
        }
        if (!cat.investigatePoint) {
          cat.fsm.transition('IDLE');
          return;
        }
        const dx = cat.investigatePoint.x - cat.body.x;
        const dy = cat.investigatePoint.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        cat.heading = lerpAngle(cat.heading, cat.computeObstacleAvoidanceAngle(ang), dt * 6.5);
        cat.headAngle = lerpAngle(cat.headAngle, ang, dt * 9);

        if (dist < 48) {
          cat.dampVelocity(dt, 0.7);
          cat.investigateSniffTimer += dt;
          cat.headAngle = ang + Math.sin(cat.time * 15) * 0.16;
          if (cat.investigateSniffTimer >= 1.25) {
            cat.investigatePoint = null;
            cat.fsm.transition(cat.nextRand() < 0.22 ? 'FLEHMEN' : 'IDLE');
          }
          return;
        }
        const speed = 88 * cat.breedProfile.locomotion.walkSpeedMultiplier;
        cat.body.vx += Math.cos(cat.heading) * speed * 5.2 * dt;
        cat.body.vy += Math.sin(cat.heading) * speed * 5.2 * dt;
      },
      onExit: (cat) => {
        cat.earPose = 'normal';
      },
    });

    // 5. BAT_YARN
    fsm.register('BAT_YARN', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'playful';
      },
      onUpdate: (cat, dt, stateTime) => {
        const yarn = cat.ctx.yarnBall;
        if (!yarn) {
          cat.fsm.transition('IDLE');
          return;
        }
        const yp = yarn.getPosition();
        const dx = yp.x - cat.body.x;
        const dy = yp.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        cat.heading = lerpAngle(cat.heading, ang, dt * 8);
        cat.headAngle = lerpAngle(cat.headAngle, ang, dt * 11);

        const speed = 155 * cat.breedProfile.locomotion.sprintSpeedMultiplier;
        cat.body.vx += Math.cos(cat.heading) * speed * 5.2 * dt;
        cat.body.vy += Math.sin(cat.heading) * speed * 5.2 * dt;

        if (dist < cat.body.radius + yarn.getRadius() + 8) {
          yarn.nudge(Math.cos(ang) * 260, Math.sin(ang) * 260);
          cat.ctx?.particles?.spawnDustPuff(yp.x, yp.y, Math.cos(ang) * 40, Math.sin(ang) * 40);
          cat.emitSound('chirp');
          cat.fsm.transition('IDLE');
          return;
        }
        if (stateTime > 3.2) {
          cat.fsm.transition('IDLE');
        }
      },
    });

    // 6. WIGGLE & POUNCE_WIGGLE
    const wiggleHooks = {
      onEnter: (cat: CatEntity) => {
        cat.zHeight = 0;
        cat.body.vx *= 0.25;
        cat.body.vy *= 0.25;
        cat.squashX = 0.9;
        cat.squashY = 1.12;
        cat.mood = 'hunting';
        cat.earPose = 'forward';
      },
      onUpdate: (cat: CatEntity, dt: number, stateTime: number) => {
        const laser = cat.resolveLaserTarget();
        if (laser) {
          if (cat.brain.trackLaserChase(dt, true)) {
            cat.fsm.transition('GROOMING');
            return;
          }
          cat.activeTarget = { x: laser.x, y: laser.y };
        } else if (cat.ctx.yarnBall?.isRolling()) {
          cat.activeTarget = cat.ctx.yarnBall.getPosition();
        } else if (!cat.activeTarget) {
          const toy = cat.findNearestToy(260);
          if (toy) cat.activeTarget = { x: toy.x, y: toy.y };
        }

        if (cat.activeTarget) {
          const ang = Math.atan2(cat.activeTarget.y - cat.body.y, cat.activeTarget.x - cat.body.x);
          cat.heading = lerpAngle(cat.heading, ang, dt * 11);
          cat.headAngle = cat.heading;
        }

        cat.dampVelocity(dt, 0.72);

        if (stateTime >= WIGGLE_DURATION) {
          cat.fsm.transition('POUNCE');
        }
      },
      onExit: (cat: CatEntity) => {
        cat.earPose = 'normal';
      },
    };
    fsm.register('WIGGLE', wiggleHooks);
    fsm.register('POUNCE_WIGGLE', wiggleHooks);

    // 7. POUNCE
    fsm.register('POUNCE', {
      onEnter: (cat) => {
        cat.pounceDuration = 0.46;
        cat.zHeight = 4;
        const target = cat.activeTarget;
        if (target) {
          cat.heading = Math.atan2(target.y - cat.body.y, target.x - cat.body.x);
        }
        cat.headAngle = cat.heading;
        const impulse = 560 * (0.9 + cat.breedProfile.locomotion.sprintSpeedMultiplier * 0.1);
        cat.body.vx = Math.cos(cat.heading) * impulse;
        cat.body.vy = Math.sin(cat.heading) * impulse;
        cat.squashX = 1.22;
        cat.squashY = 0.82;

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
        cat.zHeight = POUNCE_PEAK_Z_PX * cat.breedProfile.locomotion.jumpArcMultiplier * 4 * u * (1 - u);

        if (stateTime >= cat.pounceDuration) {
          cat.zHeight = 0;
          cat.squashX = 1.15;
          cat.squashY = 0.87;
          cat.emitBellIfWearing();
          cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, cat.body.vx * 0.2, cat.body.vy * 0.2);
          const laser = cat.resolveLaserTarget();
          cat.fsm.transition(laser ? 'STALK' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
      },
    });

    // 8. BONK
    fsm.register('BONK', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.squashX = 0.72;
        cat.squashY = 1.3;
        cat.mood = 'startled';
        cat.earPose = 'airplane';
        cat.ctx?.particles?.spawnBonkBurst(cat.body.x, cat.body.y);
        cat.ctx?.onBonk?.(cat);
      },
      onUpdate: (cat, _dt, stateTime) => {
        cat.headAngle = cat.heading + Math.sin(stateTime * 28) * 0.28;
        if (stateTime >= BONK_DAZE_DURATION) {
          cat.mood = 'content';
          cat.earPose = 'normal';
          cat.fsm.transition('IDLE');
        }
      },
    });

    // 9. NAP / DEEP_SLEEP / DREAMING (All display crisp animated Zzz indicator!)
    fsm.register('NAP', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.sleepZTimer = 0.6;
        cat.napSpot = null;
        cat.mood = 'sleepy';
        const r = cat.nextRand();
        cat.sleepPose = r < 0.55 ? 'curled' : r < 0.82 ? 'belly_up_sleep' : 'sprawled';
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.sleepZTimer += dt;
        if (cat.sleepZTimer >= 1.85) {
          cat.sleepZTimer = 0;
          if (!cat.isHighCatCountMode()) {
            cat.ctx?.particles?.spawnSleepZ(cat.spine.head.x + 6, cat.spine.head.y - 10);
          }
        }

        if (cat.shouldWakeFromIdle()) {
          cat.fsm.transition('STRETCHING');
          return;
        }

        const laser = cat.resolveLaserTarget();
        if (laser && Math.hypot(laser.x - cat.body.x, laser.y - cat.body.y) < 190) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.fsm.transition('STALK');
          return;
        }

        const treat = cat.findNearestTreat(200);
        if (treat) {
          cat.triggerTreatAttract(treat);
          return;
        }

        const napThreshold = cat.ctx.idleNapSeconds ?? IDLE_NAP_SECONDS;
        if (stateTime >= 9.0 || cat.ctx.idleSeconds >= napThreshold * 1.45) {
          cat.fsm.transition('DEEP_SLEEP');
        } else if (!cat.ctx.typingActive && cat.ctx.idleSeconds < napThreshold * 0.5 && stateTime >= 11 && cat.brain.getNeeds().energy > 72) {
          cat.fsm.transition('STRETCHING');
        }
      },
    });

    fsm.register('DEEP_SLEEP', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.sleepZTimer = 0.9;
        cat.mood = 'sleepy';
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.sleepZTimer += dt;
        if (cat.sleepZTimer >= 2.2) {
          cat.sleepZTimer = 0;
          if (!cat.isHighCatCountMode()) {
            cat.ctx?.particles?.spawnSleepZ(cat.spine.head.x + 6, cat.spine.head.y - 10);
          }
        }

        if (cat.shouldWakeFromIdle()) {
          cat.fsm.transition('STRETCHING');
          return;
        }

        if (stateTime > 3.5 && cat.nextRand() < dt * 0.16) {
          cat.fsm.transition('DREAMING');
        }
      },
    });

    fsm.register('DREAMING', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.mood = 'dreaming';
        cat.sleepZTimer = 0.7;
        cat.dreamTwitchTimer = 0.4;
        cat.dreamMewTimer = cat.randRange(1.4, 2.8);
        cat.stateTargetDuration = cat.randRange(4.2, 7.2);
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.sleepZTimer += dt;
        if (cat.sleepZTimer >= 1.95) {
          cat.sleepZTimer = 0;
          if (!cat.isHighCatCountMode()) {
            cat.ctx?.particles?.spawnSleepZ(cat.spine.head.x + 6, cat.spine.head.y - 10);
          }
        }

        // Cute dreaming paw/ear/whisker twitches
        cat.dreamTwitchTimer -= dt;
        if (cat.dreamTwitchTimer <= 0) {
          cat.dreamTwitchTimer = cat.randRange(0.35, 0.75);
          if (cat.nextRand() < 0.5) cat.earTwitchLeft = 0.25;
          else cat.earTwitchRight = 0.25;
          cat.squashX = 1.025;
          cat.squashY = 0.98;
        }

        cat.dreamMewTimer -= dt;
        if (cat.dreamMewTimer <= 0) {
          cat.dreamMewTimer = 99; // Once per dream cycle
          cat.emitSound(cat.brain.isKitten() ? 'kitten_mew' : 'chirp');
          cat.ctx?.particles?.spawnMusicNotes(cat.spine.head.x, cat.spine.head.y - 10, 1);
        }

        if (cat.shouldWakeFromIdle()) {
          cat.fsm.transition('STRETCHING');
          return;
        }

        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('DEEP_SLEEP');
        }
      },
    });

    // 10. PETTED (Gentle purr body vibration + continuous overstimulation awareness)
    fsm.register('PETTED', {
      onEnter: (cat, prevState) => {
        cat.zHeight = prevState === 'PERCH_ICON' || cat.petOnIconHold ? PERCH_ELEVATION_PX : 0;
        cat.purrTimer = 0.08;
        cat.mood = 'affectionate';
        cat.emitSound('purr');
      },
      onUpdate: (cat, dt) => {
        cat.dampVelocity(dt, 0.75);
        cat.petHoldTimer -= dt;
        cat.purrTimer += dt;

        cat.headAngle = cat.heading + Math.sin(cat.time * 4.5) * 0.18;

        const petCheck = cat.brain.recordContinuousPet(dt * 0.22);
        if (petCheck.overstimulated && !cat.petInBoxHold && !cat.petOnIconHold) {
          cat.fsm.transition('OVERSTIMULATED', true);
          return;
        }

        if (cat.purrTimer >= 0.3) {
          cat.purrTimer = 0;
          const liftY = -cat.zHeight * 0.68;
          cat.ctx?.particles?.spawnPurr(cat.spine.head.x, cat.spine.head.y + liftY - 8);
        }

        if (cat.petHoldTimer <= 0) {
          const inBox = cat.petInBoxHold;
          const onIcon = cat.petOnIconHold;
          cat.petInBoxHold = false;
          cat.petOnIconHold = false;

          if (inBox) {
            const box = cat.ctx?.cardboardBox;
            if (box && box.isVisible() && box.occupantId === cat.id) {
              cat.fsm.transition('IN_BOX');
              return;
            }
          }
          if (onIcon && cat.perchedIconId !== null) {
            cat.fsm.transition('PERCH_ICON');
            return;
          }
          const roll = cat.nextRand();
          cat.fsm.transition(roll < 0.3 ? 'ROLL_BELLY' : roll < 0.5 ? 'KNEADING' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.petInBoxHold = false;
        cat.petOnIconHold = false;
        cat.zHeight = 0;
      },
    });

    // 11. STARTLED (High 52-68px parabolic vertical jump + puffed tail + flat ears + scamper!)
    fsm.register('STARTLED', {
      onEnter: (cat) => {
        const origin = cat.startleFrom ?? { x: cat.body.x - 40, y: cat.body.y };
        const awayAngle = Math.atan2(cat.body.y - origin.y, cat.body.x - origin.x);
        cat.heading = awayAngle;
        cat.headAngle = awayAngle;
        const peakZ = cat.startlePeakZ > 0 ? cat.startlePeakZ : cat.randRange(54, 66);
        cat.startleJumpPeakZ = clamp(peakZ, 52, 68);
        cat.body.vx = Math.cos(awayAngle) * 380;
        cat.body.vy = Math.sin(awayAngle) * 380;
        cat.squashX = 0.84;
        cat.squashY = 1.24;
        cat.mood = 'startled';
        cat.earPose = 'flat_back';
        cat.emitSound('startle');
        cat.ctx?.particles?.spawnStartleBurst(cat.body.x, cat.body.y);
      },
      onUpdate: (cat, dt, stateTime) => {
        const leapDur = 0.56;
        if (stateTime < leapDur) {
          const u = stateTime / leapDur;
          cat.zHeight = cat.startleJumpPeakZ * 4 * u * (1 - u);
          cat.headAngle = cat.heading + Math.sin(stateTime * 16) * 0.22;
        } else {
          cat.zHeight = 0;
          cat.dampVelocity(dt, 0.84);
          cat.headAngle = cat.heading + Math.sin(stateTime * 14) * 0.55;
        }
        if (stateTime >= 0.92) {
          cat.zHeight = 0;
          cat.startlePeakZ = 0;
          cat.mood = 'content';
          cat.earPose = 'normal';
          cat.emitBellIfWearing();
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
        cat.startlePeakZ = 0;
        cat.earPose = 'normal';
      },
    });

    // 12. JUMP_TO_BOX
    fsm.register('JUMP_TO_BOX', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.jumpStartPos = { x: cat.body.x, y: cat.body.y };
        cat.jumpTakenOff = false;
        cat.jumpProgress = 0;
        cat.jumpCrouchDur = 0.18;
        cat.jumpFlightDur = 0.50;
        cat.jumpPeakZ = clamp(
          BOX_JUMP_BASE_PEAK_Z_PX * cat.breedProfile.locomotion.jumpArcMultiplier,
          BOX_JUMP_MIN_PEAK_Z_PX,
          BOX_JUMP_MAX_PEAK_Z_PX,
        );

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
        cat.squashX = 0.84;
        cat.squashY = 1.18;
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

        if (stateTime < cat.jumpCrouchDur) {
          cat.zHeight = 0;
          cat.jumpProgress = 0;
          cat.squashX = 0.84;
          cat.squashY = 1.18;
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
          cat.squashX = 1.22;
          cat.squashY = 0.82;
          cat.ctx?.particles?.spawnDustPuff(
            cat.jumpStartPos.x,
            cat.jumpStartPos.y,
            -Math.cos(cat.heading) * 35,
            -Math.sin(cat.heading) * 35,
          );
        }

        const u = clamp((stateTime - cat.jumpCrouchDur) / cat.jumpFlightDur, 0, 1);
        cat.jumpProgress = u;
        cat.zHeight = cat.jumpPeakZ * 4 * u * (1 - u);
        const horiz = smoothstep(u);
        cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * horiz;
        cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * horiz;

        if (u >= 1) {
          cat.zHeight = 0;
          cat.body.x = cat.jumpEndPos.x;
          cat.body.y = cat.jumpEndPos.y;
          cat.squashX = 1.16;
          cat.squashY = 0.86;
          cat.emitBellIfWearing();
          box.triggerFlapRustle(cat.heading, 0.9);
          cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, 0, 0);
          cat.fsm.transition('IN_BOX');
        }
      },
      onExit: (cat, nextState) => {
        cat.zHeight = 0;
        cat.jumpProgress = 0;
        if (nextState !== 'IN_BOX') {
          cat.ctx?.cardboardBox?.release(cat.id);
        }
      },
    });

    // 13. IN_BOX
    fsm.register('IN_BOX', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.mood = 'content';
        cat.boxSleeping = cat.nextRand() < 0.35;
        cat.boxStayTimer = cat.randRange(7.5, 16.5) * (0.8 + cat.breedProfile.behaviorAffinities.boxAffinity * 0.45);
        const box = cat.ctx?.cardboardBox;
        if (box) {
          const bp = box.getPosition();
          cat.body.x = bp.x;
          cat.body.y = bp.y;
          cat.boxLastPos = { x: bp.x, y: bp.y };
          const headLead = cat.breedProfile.anatomy.head.headLeadCurled;
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

        const lookOffset =
          cat.noise.noise2D(cat.time * 0.4 + cat.noiseOffsetX, cat.noiseOffsetY) * 0.48;
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading + lookOffset, dt * 2.5);

        const laser = cat.resolveLaserTarget();
        if (laser && Math.hypot(laser.x - bp.x, laser.y - bp.y) < 185) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.jumpOutNextState = 'STALK';
          cat.jumpOutUrgent = false;
          cat.fsm.transition('JUMP_OUT_BOX');
          return;
        }

        const treat = cat.findNearestTreat(230);
        if (treat) {
          cat.triggerTreatAttract(treat);
          return;
        }

        if (stateTime >= cat.boxStayTimer) {
          cat.jumpOutNextState = 'WANDER';
          cat.jumpOutUrgent = false;
          cat.fsm.transition('JUMP_OUT_BOX');
        }
      },
      onExit: (cat, nextState) => {
        cat.boxLastPos = null;
        cat.boxSleeping = false;
        if (nextState !== 'JUMP_OUT_BOX' && !(nextState === 'PETTED' && cat.petInBoxHold)) {
          cat.ctx?.cardboardBox?.release(cat.id);
        }
      },
    });

    // 14. JUMP_OUT_BOX
    fsm.register('JUMP_OUT_BOX', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.jumpStartPos = { x: cat.body.x, y: cat.body.y };
        cat.jumpTakenOff = false;
        cat.jumpProgress = 0;
        cat.jumpCrouchDur = cat.jumpOutUrgent ? 0.06 : 0.16;
        cat.jumpFlightDur = cat.jumpOutUrgent ? 0.42 : 0.52;
        cat.jumpPeakZ = clamp(
          (cat.jumpOutUrgent ? 68 : BOX_JUMP_BASE_PEAK_Z_PX) *
            cat.breedProfile.locomotion.jumpArcMultiplier,
          BOX_JUMP_MIN_PEAK_Z_PX,
          BOX_JUMP_MAX_PEAK_Z_PX,
        );

        const box = cat.ctx?.cardboardBox;
        let preferredAngle: number;
        if (cat.jumpOutNextState === 'STALK' && cat.activeTarget) {
          preferredAngle = Math.atan2(
            cat.activeTarget.y - cat.body.y,
            cat.activeTarget.x - cat.body.x,
          );
        } else if (cat.jumpOutNextState === 'STARTLED' && cat.startleFrom) {
          preferredAngle = Math.atan2(
            cat.body.y - cat.startleFrom.y,
            cat.body.x - cat.startleFrom.x,
          );
        } else if (cat.jumpOutNextState === 'EATING_TREAT' && cat.targetTreat) {
          preferredAngle = Math.atan2(
            cat.targetTreat.y - cat.body.y,
            cat.targetTreat.x - cat.body.x,
          );
        } else if (cat.jumpOutNextState === 'PROP_INTERACT' && cat.targetPropPoint) {
          preferredAngle = Math.atan2(
            cat.targetPropPoint.y - cat.body.y,
            cat.targetPropPoint.x - cat.body.x,
          );
        } else {
          preferredAngle = normalizeAngle(cat.heading + cat.randRange(-0.85, 0.85));
        }

        cat.jumpEndPos = cat.computeBoxExitLanding(preferredAngle, box);

        const dx = cat.jumpEndPos.x - cat.jumpStartPos.x;
        const dy = cat.jumpEndPos.y - cat.jumpStartPos.y;
        if (Math.hypot(dx, dy) > 1) {
          cat.heading = Math.atan2(dy, dx);
          cat.headAngle = cat.heading;
        }

        cat.squashX = 0.82;
        cat.squashY = 1.2;
        box?.triggerTremble(cat.jumpCrouchDur);
      },
      onUpdate: (cat, _dt, stateTime) => {
        cat.body.vx = 0;
        cat.body.vy = 0;

        if (stateTime < cat.jumpCrouchDur) {
          cat.zHeight = 0;
          cat.jumpProgress = 0;
          cat.squashX = 0.82;
          cat.squashY = 1.2;
          return;
        }

        if (!cat.jumpTakenOff) {
          cat.jumpTakenOff = true;
          cat.squashX = 1.22;
          cat.squashY = 0.82;
          cat.ctx?.cardboardBox?.triggerFlapRustle(cat.heading, cat.jumpOutUrgent ? 1.35 : 1.05);
          cat.ctx?.particles?.spawnDustPuff(
            cat.jumpStartPos.x,
            cat.jumpStartPos.y,
            -Math.cos(cat.heading) * 32,
            -Math.sin(cat.heading) * 32,
          );
        }

        const u = clamp((stateTime - cat.jumpCrouchDur) / cat.jumpFlightDur, 0, 1);
        cat.jumpProgress = u;
        cat.zHeight = cat.jumpPeakZ * 4 * u * (1 - u);

        const horiz = smoothstep(u);
        cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * horiz;
        cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * horiz;

        if (u >= 1) {
          cat.zHeight = 0;
          cat.jumpProgress = 1;
          cat.body.x = cat.jumpEndPos.x;
          cat.body.y = cat.jumpEndPos.y;
          cat.squashX = 1.18;
          cat.squashY = 0.85;
          cat.emitBellIfWearing();
          cat.ctx?.particles?.spawnDustPuff(
            cat.body.x,
            cat.body.y,
            Math.cos(cat.heading) * 24,
            Math.sin(cat.heading) * 24,
          );
          cat.ctx?.cardboardBox?.release(cat.id);
          cat.boxCooldown = cat.randRange(9, 15);
          cat.jumpOutUrgent = false;

          const laser = cat.resolveLaserTarget();
          const next =
            cat.jumpOutNextState === 'STARTLED'
              ? 'STARTLED'
              : laser && cat.jumpOutNextState !== 'EATING_TREAT'
                ? 'STALK'
                : cat.jumpOutNextState;
          cat.fsm.transition(next, true);
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
        cat.jumpProgress = 0;
        cat.jumpOutUrgent = false;
        cat.ctx?.cardboardBox?.release(cat.id);
        cat.boxCooldown = Math.max(cat.boxCooldown, 9);
      },
    });

    // 15. JUMP_TO_ICON
    fsm.register('JUMP_TO_ICON', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.jumpStartPos = { x: cat.body.x, y: cat.body.y };
        cat.jumpTakenOff = false;
        cat.jumpProgress = 0;
        cat.jumpCrouchDur = 0.18;
        cat.jumpFlightDur = 0.44;
        cat.jumpPeakZ = 48 * cat.breedProfile.locomotion.jumpArcMultiplier;

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
        cat.squashX = 0.86;
        cat.squashY = 1.14;
      },
      onUpdate: (cat, _dt, stateTime) => {
        if (!cat.targetIcon) {
          cat.fsm.transition('IDLE');
          return;
        }

        const liveIcon = cat.findObstacleById(cat.targetIcon.id);
        if (liveIcon) cat.targetIcon = liveIcon;
        const activeIcon = cat.targetIcon;

        if (cat.ctx.occupiedIconIds?.has(activeIcon.id)) {
          cat.fsm.transition('IDLE');
          return;
        }

        cat.jumpEndPos.x = activeIcon.x + activeIcon.width * 0.5;
        cat.jumpEndPos.y = activeIcon.y + activeIcon.height * 0.36;
        cat.body.vx = 0;
        cat.body.vy = 0;

        if (stateTime < cat.jumpCrouchDur) {
          cat.zHeight = 0;
          cat.squashX = 0.86;
          cat.squashY = 1.14;
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

        const u = clamp((stateTime - cat.jumpCrouchDur) / cat.jumpFlightDur, 0, 1);
        cat.jumpProgress = u;
        cat.zHeight = PERCH_ELEVATION_PX * u + cat.jumpPeakZ * 4 * u * (1 - u);
        const ease = smoothstep(u);
        cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * ease;
        cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * ease;

        if (u >= 1) {
          cat.zHeight = PERCH_ELEVATION_PX;
          cat.body.x = cat.jumpEndPos.x;
          cat.body.y = cat.jumpEndPos.y;
          cat.squashX = 1.12;
          cat.squashY = 0.9;
          cat.emitBellIfWearing();
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

    // 16. PERCH_ICON
    fsm.register('PERCH_ICON', {
      onEnter: (cat) => {
        cat.perchHopDownActive = false;
        cat.perchHopDownTime = 0;
        cat.zHeight = PERCH_ELEVATION_PX;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.perchDuration = cat.randRange(5.0, 10.5) * (0.8 + cat.breedProfile.behaviorAffinities.perching * 0.4);

        if (cat.targetIcon) {
          cat.perchedIconId = cat.targetIcon.id;
          const px = cat.targetIcon.x + cat.targetIcon.width * 0.5;
          const py = cat.targetIcon.y + cat.targetIcon.height * 0.36;
          cat.body.x = px;
          cat.body.y = py;
          cat.perchLastIconCenter = { x: px, y: py };
          const headLead = cat.breedProfile.anatomy.head.headLeadCurled;
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
          cat.jumpProgress = u;
          cat.zHeight = PERCH_ELEVATION_PX * (1 - u) + 38 * 4 * u * (1 - u);
          const ease = smoothstep(u);
          cat.body.x = cat.jumpStartPos.x + (cat.jumpEndPos.x - cat.jumpStartPos.x) * ease;
          cat.body.y = cat.jumpStartPos.y + (cat.jumpEndPos.y - cat.jumpStartPos.y) * ease;

          if (u >= 1) {
            cat.zHeight = 0;
            cat.body.x = cat.jumpEndPos.x;
            cat.body.y = cat.jumpEndPos.y;
            cat.squashX = 1.12;
            cat.squashY = 0.89;
            cat.emitBellIfWearing();
            cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, 0, 0);
            cat.iconInteractCooldown = cat.randRange(9, 15);
            if (cat.targetTreat) {
              cat.fsm.transition('EATING_TREAT');
            } else if (cat.targetProp) {
              cat.fsm.transition('PROP_INTERACT');
            } else {
              const laser = cat.resolveLaserTarget();
              cat.fsm.transition(laser ? 'STALK' : 'WANDER');
            }
          }
          return;
        }

        cat.zHeight = PERCH_ELEVATION_PX;
        const liveIcon = cat.findObstacleById(cat.perchedIconId) ?? cat.targetIcon;
        if (!liveIcon) {
          cat.beginIconHopDown(null);
          return;
        }
        cat.targetIcon = liveIcon;

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

        const lookOffset =
          cat.noise.noise2D(cat.time * 0.55 + cat.noiseOffsetX, cat.noiseOffsetY) * 0.75;
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
      onExit: (cat, nextState) => {
        if (nextState === 'PETTED' && cat.petOnIconHold) {
          return;
        }
        const exitedId = cat.perchedIconId;
        cat.perchedIconId = null;
        cat.targetIcon = null;
        cat.perchLastIconCenter = null;
        cat.perchHopDownActive = false;
        cat.zHeight = 0;
        cat.iconInteractCooldown = Math.max(cat.iconInteractCooldown, 10);
        if (exitedId !== null) {
          cat.ctx?.onIconPerchChange?.(cat.id, null);
        }
      },
    });

    // 17. SCRATCH_ICON
    fsm.register('SCRATCH_ICON', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.scratchDuration = cat.randRange(1.6, 2.5);
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
        if (liveIcon) cat.targetIcon = liveIcon;
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
          cat.ctx?.particles?.spawnScratchMarks(
            cat.scratchEdgePoint.x + perpX * 0.6,
            cat.scratchEdgePoint.y + perpY * 0.6,
            cat.heading + Math.PI + (cat.nextRand() - 0.5) * 0.55,
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

    // 18. GROOMING (Multi-stage: lick paw -> wipe face -> clean ears -> lick belly + random freeze!)
    fsm.register('GROOMING', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'content';
        cat.groomPhase = 0;
        cat.groomStage = 0;
        cat.groomFreezeTimer = 0;
        cat.groomSparkleTimer = 0.65;
        const isMidday = cat.getCircadianPhase() === 'midday';
        cat.stateTargetDuration =
          cat.randRange(3.4, 5.8) *
          (0.75 + cat.breedProfile.behaviorAffinities.grooming * 0.45) *
          (isMidday ? 1.25 : 1);
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.checkImmediateStimuli()) return;
        cat.dampVelocity(dt, 0.74);

        // Random hilarious mid-lick freeze!
        if (cat.groomFreezeTimer > 0) {
          cat.groomFreezeTimer -= dt;
          cat.earPose = 'forward';
          return;
        }
        cat.earPose = 'normal';

        const u = clamp(stateTime / cat.stateTargetDuration, 0, 1);
        cat.groomStage = u < 0.28 ? 0 : u < 0.55 ? 1 : u < 0.78 ? 2 : 3;

        if (u > 0.2 && u < 0.85 && cat.nextRand() < dt * 0.18) {
          cat.groomFreezeTimer = cat.randRange(0.55, 1.05);
          return;
        }

        cat.groomPhase += dt * (cat.groomStage === 1 ? 1.55 : 1.25);
        const stageHeadOffset =
          cat.groomStage === 0
            ? 0.2
            : cat.groomStage === 1
              ? 0.32
              : cat.groomStage === 2
                ? -0.25
                : 0.75;
        cat.headAngle = normalizeAngle(
          cat.heading + stageHeadOffset + Math.sin(cat.groomPhase * Math.PI * 2) * 0.16,
        );

        cat.groomSparkleTimer -= dt;
        if (cat.groomSparkleTimer <= 0) {
          cat.groomSparkleTimer = cat.randRange(1.0, 1.65);
          if (!cat.isHighCatCountMode()) {
            cat.ctx?.particles?.spawnGroomSparkle(cat.spine.head.x, cat.spine.head.y - 6);
          }
        }

        if (stateTime >= cat.stateTargetDuration) {
          cat.behaviorCooldown = cat.randRange(3.5, 7.5);
          cat.fsm.transition(cat.nextRand() < 0.35 ? 'LOAFING' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.earPose = 'normal';
        cat.groomFreezeTimer = 0;
      },
    });

    // 19. LOAFING
    fsm.register('LOAFING', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'content';
        cat.stateTargetDuration =
          cat.randRange(5.0, 10.5) * (0.7 + cat.breedProfile.behaviorAffinities.loafing * 0.55);
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.checkImmediateStimuli()) return;
        cat.dampVelocity(dt, 0.7);

        const gaze = cat.noise.noise2D(cat.time * 0.22 + cat.noiseOffsetX, cat.noiseOffsetY) * 0.36;
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading + gaze, dt * 1.8);

        if (stateTime >= cat.stateTargetDuration) {
          cat.behaviorCooldown = cat.randRange(4.0, 8.0);
          cat.fsm.transition(cat.nextRand() < 0.65 ? 'STRETCHING' : 'WANDER');
        }
      },
    });

    // 20. STRETCHING (front paws extended, butt up + yawn!)
    fsm.register('STRETCHING', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'content';
        cat.stretchFactor = 0;
        cat.stretchDuration = cat.randRange(2.1, 2.9);
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        cat.dampVelocity(dt, 0.72);

        const u = clamp(stateTime / cat.stretchDuration, 0, 1);
        if (u < 0.32) {
          cat.stretchFactor = smoothstep(u / 0.32);
        } else if (u < 0.72) {
          cat.stretchFactor = 1.0 + Math.sin(stateTime * 22) * 0.025;
        } else {
          cat.stretchFactor = 1 - smoothstep((u - 0.72) / 0.28);
        }
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading, dt * 8);

        if (u >= 1) {
          cat.stretchFactor = 0;
          cat.behaviorCooldown = cat.randRange(2.5, 6.0);
          cat.fsm.transition('WANDER');
        }
      },
      onExit: (cat) => {
        cat.stretchFactor = 0;
      },
    });

    // 21. ZOOMIES (Sudden explosive curved sprints -> abrupt halt + casual grooming!)
    fsm.register('ZOOMIES', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'zoomy';
        cat.zoomieDuration = cat.randRange(3.2, 5.4);
        cat.zoomieDustTimer = 0.04;
        cat.zoomieCurveDir = cat.nextRand() < 0.5 ? 1 : -1;
        cat.wanderHeading = normalizeAngle(cat.heading + cat.randRange(-1.2, 1.2));
        cat.squashX = 1.2;
        cat.squashY = 0.84;
        cat.emitBellIfWearing();
      },
      onUpdate: (cat, dt, stateTime) => {
        const laser = cat.resolveLaserTarget();
        if (laser) {
          cat.activeTarget = { x: laser.x, y: laser.y };
          cat.fsm.transition('STALK');
          return;
        }

        const curveWave = Math.sin(stateTime * 2.6 + cat.noiseOffsetX) * cat.zoomieCurveDir;
        const noiseSteer = cat.noise.noise2D(cat.time * 1.4 + cat.noiseOffsetX, cat.noiseOffsetY);
        cat.wanderHeading = normalizeAngle(
          cat.wanderHeading + (curveWave * 2.4 + noiseSteer * 1.8) * dt,
        );

        const bounds = cat.ctx.physics.getBounds();
        const edgeMargin = 95;
        if (
          cat.body.x < edgeMargin ||
          cat.body.x > bounds.width - edgeMargin ||
          cat.body.y < edgeMargin ||
          cat.body.y > bounds.height - edgeMargin
        ) {
          const toCenter = Math.atan2(bounds.height * 0.5 - cat.body.y, bounds.width * 0.5 - cat.body.x);
          cat.wanderHeading = lerpAngle(cat.wanderHeading, toCenter, dt * 6.5);
        }

        const safeAngle = cat.computeObstacleAvoidanceAngle(cat.wanderHeading);
        const loco = cat.breedProfile.locomotion;
        cat.heading = lerpAngle(cat.heading, safeAngle, dt * 10 * loco.turnAgility);
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading, dt * 12);

        const sprintSpeed = 275 * loco.sprintSpeedMultiplier * cat.speedVariance;
        cat.body.vx += Math.cos(cat.heading) * sprintSpeed * 6.5 * dt;
        cat.body.vy += Math.sin(cat.heading) * sprintSpeed * 6.5 * dt;

        const maxZoomieSpeed = 335 * Math.max(0.95, loco.sprintSpeedMultiplier);
        const curSpeed = Math.hypot(cat.body.vx, cat.body.vy);
        if (curSpeed > maxZoomieSpeed) {
          const s = maxZoomieSpeed / curSpeed;
          cat.body.vx *= s;
          cat.body.vy *= s;
        }

        cat.zHeight = Math.min(
          1.6,
          Math.abs(Math.sin(cat.walkPhase * 0.85)) * (1.1 + loco.hopBounceFactor * 0.65),
        );

        cat.zoomieDustTimer -= dt;
        if (cat.zoomieDustTimer <= 0) {
          cat.zoomieDustTimer = 0.16;
          if (!cat.isHighCatCountMode()) {
            cat.ctx?.particles?.spawnZoomieDust(
              cat.spine.hips.x,
              cat.spine.hips.y,
              cat.body.vx,
              cat.body.vy,
            );
          }
        }

        if (stateTime >= cat.zoomieDuration) {
          cat.zHeight = 0;
          cat.body.vx *= 0.12;
          cat.body.vy *= 0.12;
          cat.mood = 'content';
          cat.zoomieCooldown = cat.randRange(16, 32) * (1.25 - cat.personality.zoomieProneness * 0.55);
          // Night zoomies hallmark: halt abruptly and casually groom as if nothing happened!
          cat.fsm.transition(cat.getCircadianPhase() === 'night' || cat.nextRand() < 0.6 ? 'GROOMING' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
      },
    });

    // 22. ROLL_BELLY
    fsm.register('ROLL_BELLY', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.rollPhase = 0;
        cat.purrTimer = 0.25;
        cat.mood = 'affectionate';
        cat.stateTargetDuration = cat.randRange(2.8, 4.6);
        cat.squashX = 0.92;
        cat.squashY = 1.12;
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        cat.dampVelocity(dt, 0.75);

        cat.rollPhase += dt * 1.45;
        cat.headAngle = normalizeAngle(
          cat.heading + Math.sin(cat.rollPhase * Math.PI * 2) * 0.28,
        );

        cat.purrTimer += dt;
        if (cat.purrTimer >= 0.75) {
          cat.purrTimer = 0;
          cat.ctx?.particles?.spawnPurr(cat.body.x, cat.body.y - 10);
        }

        if (stateTime >= cat.stateTargetDuration) {
          cat.behaviorCooldown = cat.randRange(3.5, 7.5);
          cat.fsm.transition(cat.nextRand() < 0.35 ? 'STRETCHING' : 'IDLE');
        }
      },
    });

    // 23. SOCIAL_PLAY
    fsm.register('SOCIAL_PLAY', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = cat.socialMode === 'chase' ? 'playful' : 'affectionate';
        cat.socialHeartEmitted = false;
        cat.socialDuration =
          cat.socialMode === 'cuddle'
            ? cat.randRange(4.2, 7.2)
            : cat.socialMode === 'chase'
              ? cat.randRange(2.4, 3.8)
              : cat.randRange(1.9, 2.9);
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        const partner = cat.socialPartner;
        if (!partner || partner.destroyed || partner.getState() === 'IN_BOX') {
          cat.fsm.transition('IDLE');
          return;
        }

        const pPos = partner.getPosition();
        const dx = pPos.x - cat.body.x;
        const dy = pPos.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);

        if (cat.socialMode === 'boop') {
          cat.heading = lerpAngle(cat.heading, ang, dt * 7);
          cat.headAngle = lerpAngle(cat.headAngle, ang + Math.sin(cat.time * 5) * 0.1, dt * 9);
          const idealDist = cat.body.radius + partner.getRadius() + 8;
          if (dist > idealDist) {
            const speed = 85 * cat.breedProfile.locomotion.walkSpeedMultiplier;
            cat.body.vx += Math.cos(cat.heading) * speed * 5.0 * dt;
            cat.body.vy += Math.sin(cat.heading) * speed * 5.0 * dt;
          } else {
            cat.dampVelocity(dt, 0.72);
            if (!cat.socialHeartEmitted) {
              cat.socialHeartEmitted = true;
              const mx = (cat.body.x + pPos.x) * 0.5;
              const my = (cat.body.y + pPos.y) * 0.5;
              cat.ctx?.particles?.spawnHeartBurst(mx, my - 10, 2);
              cat.emitSound('trill');
            }
          }
        } else if (cat.socialMode === 'chase') {
          const desired = cat.computeObstacleAvoidanceAngle(ang);
          cat.heading = lerpAngle(cat.heading, desired, dt * 8.5);
          cat.headAngle = lerpAngle(cat.headAngle, ang, dt * 10);
          if (dist > cat.body.radius + partner.getRadius() + 6) {
            const speed = 175 * cat.breedProfile.locomotion.sprintSpeedMultiplier;
            cat.body.vx += Math.cos(cat.heading) * speed * 5.8 * dt;
            cat.body.vy += Math.sin(cat.heading) * speed * 5.8 * dt;
          } else if (!cat.socialHeartEmitted) {
            cat.socialHeartEmitted = true;
            cat.ctx?.particles?.spawnMusicNotes(cat.body.x, cat.body.y - 10, 2);
            cat.emitSound('chirp');
          }
        } else {
          const sideOff = cat.body.radius + partner.getRadius() + 4;
          if (dist > sideOff + 8) {
            cat.heading = lerpAngle(cat.heading, ang, dt * 5.5);
            cat.headAngle = lerpAngle(cat.headAngle, ang, dt * 7);
            const speed = 78 * cat.breedProfile.locomotion.walkSpeedMultiplier;
            cat.body.vx += Math.cos(cat.heading) * speed * 5.0 * dt;
            cat.body.vy += Math.sin(cat.heading) * speed * 5.0 * dt;
          } else {
            cat.dampVelocity(dt, 0.7);
            if (!cat.socialHeartEmitted) {
              cat.socialHeartEmitted = true;
              cat.ctx?.particles?.spawnPurr((cat.body.x + pPos.x) * 0.5, (cat.body.y + pPos.y) * 0.5 - 8);
              cat.emitSound('purr');
            }
          }
        }

        if (stateTime >= cat.socialDuration) {
          cat.socialCooldown = cat.randRange(10, 20);
          cat.fsm.transition(cat.socialMode === 'cuddle' ? 'LOAFING' : 'WANDER');
        }
      },
      onExit: (cat) => {
        cat.socialPartner = null;
      },
    });

    // 24. SUNBATHE
    fsm.register('SUNBATHE', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.sunbatheArrived = false;
        cat.sunbathePurrTimer = 0.9;
        cat.mood = 'content';
        cat.sunbatheDuration =
          cat.randRange(6.5, 12.5) * (0.75 + cat.personality.warmthAffinity * 0.5);
        if (!cat.sunbatheSpot) {
          cat.sunbatheSpot = cat.findBestWarmSpot();
        }
        if (!cat.sunbatheSpot) {
          cat.fsm.transition('LOAFING');
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.checkImmediateStimuli()) return;
        if (!cat.sunbatheSpot) {
          cat.fsm.transition('IDLE');
          return;
        }

        const dx = cat.sunbatheSpot.x - cat.body.x;
        const dy = cat.sunbatheSpot.y - cat.body.y;
        const dist = Math.hypot(dx, dy);

        if (!cat.sunbatheArrived) {
          if (dist <= 30 || stateTime > 4.5) {
            cat.sunbatheArrived = true;
            cat.body.vx *= 0.2;
            cat.body.vy *= 0.2;
          } else {
            cat.steerTowards(cat.sunbatheSpot, 88, dt, 5.2);
          }
          return;
        }

        cat.dampVelocity(dt, 0.7);
        cat.headAngle = lerpAngle(
          cat.headAngle,
          cat.heading + Math.sin(cat.time * 0.7 + cat.noiseOffsetX) * 0.16,
          dt * 1.8,
        );

        cat.sunbathePurrTimer -= dt;
        if (cat.sunbathePurrTimer <= 0) {
          cat.sunbathePurrTimer = cat.randRange(2.4, 4.0);
          if (!cat.isHighCatCountMode()) {
            cat.ctx?.particles?.spawnGroomSparkle(cat.body.x, cat.body.y - 8);
          }
        }

        if (stateTime >= cat.sunbatheDuration) {
          cat.behaviorCooldown = cat.randRange(5.0, 10.0);
          cat.fsm.transition(cat.nextRand() < 0.7 ? 'STRETCHING' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.sunbatheSpot = null;
        cat.sunbatheArrived = false;
      },
    });

    // 25. MEERKAT_PEEK
    fsm.register('MEERKAT_PEEK', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'curious';
        cat.earPose = 'forward';
        cat.meerkatDuration = cat.randRange(2.0, 3.6);
        cat.squashX = 0.88;
        cat.squashY = 1.12;
        if (!cat.meerkatTarget) {
          const critter = cat.findNearestCritter(380);
          cat.meerkatTarget = critter
            ? { x: critter.x, y: critter.y }
            : cat.ctx?.cursorPos
              ? { ...cat.ctx.cursorPos }
              : {
                  x: cat.body.x + Math.cos(cat.heading) * 90,
                  y: cat.body.y + Math.sin(cat.heading) * 90,
                };
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        cat.dampVelocity(dt, 0.7);

        const critter = cat.findNearestCritter(360);
        if (critter) {
          cat.meerkatTarget = { x: critter.x, y: critter.y };
        } else if (cat.ctx?.cursorPos && stateTime < 1.8) {
          cat.meerkatTarget = { ...cat.ctx.cursorPos };
        }

        if (cat.meerkatTarget) {
          const ang = Math.atan2(
            cat.meerkatTarget.y - cat.body.y,
            cat.meerkatTarget.x - cat.body.x,
          );
          cat.heading = lerpAngle(cat.heading, ang, dt * 5.0);
          cat.headAngle = lerpAngle(
            cat.headAngle,
            ang + Math.sin(stateTime * 3.8) * 0.14,
            dt * 9.0,
          );
        }

        if (stateTime >= cat.meerkatDuration) {
          cat.behaviorCooldown = cat.randRange(3.0, 7.0);
          cat.fsm.transition(cat.nextRand() < 0.4 ? 'WANDER' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.meerkatTarget = null;
        cat.earPose = 'normal';
      },
    });

    // 26. PROP_INTERACT
    fsm.register('PROP_INTERACT', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.propArrived = false;
        cat.propActionTimer = 0.08;
        cat.propNotified = false;
        if (!cat.targetProp) {
          cat.fsm.transition('IDLE');
          return;
        }
        cat.activePropId = cat.targetProp.id;
        cat.targetPropPoint = cat.targetPropPoint ??
          cat.targetProp.interactPoint ?? { x: cat.targetProp.x, y: cat.targetProp.y };

        const kind = cat.targetProp.interactionType;
        cat.propDuration =
          kind === 'cozy' || kind === 'knead'
            ? cat.randRange(5.2, 8.8)
            : kind === 'warmth' || kind === 'sunbeam'
              ? cat.randRange(5.5, 9.0)
              : kind === 'catnip'
                ? cat.randRange(3.6, 5.2)
                : cat.randRange(2.4, 4.2);
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        const prop = cat.targetProp;
        const targetPt = cat.targetPropPoint;
        if (!prop || !targetPt) {
          cat.fsm.transition('IDLE');
          return;
        }

        const dx = targetPt.x - cat.body.x;
        const dy = targetPt.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const arrivalDist = prop.interactPoint
          ? 26
          : prop.solid
            ? prop.radius + cat.body.radius + 16
            : 26;

        if (!cat.propArrived) {
          if (dist <= arrivalDist || stateTime > 5.0) {
            cat.propArrived = true;
            cat.body.vx *= 0.2;
            cat.body.vy *= 0.2;
            const faceProp = Math.atan2(prop.y - cat.body.y, prop.x - cat.body.x);
            cat.heading = faceProp;
            cat.headAngle = faceProp;
            if (!cat.propNotified) {
              cat.propNotified = true;
              cat.ctx?.onPropInteract?.(prop.id, cat);
            }
            if (prop.interactionType === 'warmth' || prop.interactionType === 'sunbeam') {
              cat.sunbatheSpot = { x: targetPt.x, y: targetPt.y };
              cat.fsm.transition('SUNBATHE');
              return;
            }
            if (prop.interactionType === 'knead') {
              cat.fsm.transition('KNEADING');
              return;
            }
            if (prop.interactionType === 'drink') {
              cat.drinkProp = prop;
              cat.drinkTarget = cat.pickDrinkPointForProp(prop);
              cat.fsm.transition('DRINKING');
              return;
            }
            if (prop.interactionType === 'litter') {
              cat.litterProp = prop;
              cat.fsm.transition('LITTER_USE');
              return;
            }
            if (prop.interactionType === 'watch') {
              cat.chatterTarget = { x: prop.x, y: prop.y };
              cat.fsm.transition('CHATTER');
              return;
            }
            if (prop.interactionType === 'catnip') {
              cat.ctx?.particles?.spawnCatnipSparkles(prop.x, prop.y, 7);
            }
          } else {
            cat.steerTowards(targetPt, 112, dt, 6.5);
            return;
          }
        }

        cat.dampVelocity(dt, 0.72);
        const faceAng = Math.atan2(prop.y - cat.body.y, prop.x - cat.body.x);

        cat.propActionTimer -= dt;
        switch (prop.interactionType) {
          case 'scratch':
            cat.heading = lerpAngle(cat.heading, faceAng, dt * 10);
            cat.headAngle = cat.heading + Math.sin(stateTime * 9 * Math.PI * 2) * 0.08;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 0.26;
              cat.ctx?.particles?.spawnScratchMarks(
                cat.body.x + Math.cos(cat.heading) * 18,
                cat.body.y + Math.sin(cat.heading) * 18,
                cat.heading + Math.PI,
              );
            }
            break;

          case 'water':
          case 'drink':
            cat.heading = lerpAngle(cat.heading, faceAng, dt * 10);
            cat.headAngle = cat.heading + Math.sin(stateTime * 4) * 0.14;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 0.58;
              cat.emitSound('water_lap');
              cat.ctx?.particles?.spawnWaterSplash(
                cat.body.x + Math.cos(cat.heading) * 20,
                cat.body.y + Math.sin(cat.heading) * 20,
                5,
              );
            }
            break;

          case 'play':
          case 'perch_high':
          case 'ambush':
            cat.heading = lerpAngle(cat.heading, faceAng, dt * 11);
            cat.headAngle = cat.heading + Math.sin(stateTime * 11) * 0.15;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 0.42;
              cat.ctx?.particles?.spawnPropBurst({
                kind: 'sparkle',
                x: prop.x,
                y: prop.y,
                count: 3,
              });
            }
            break;

          case 'catnip':
            cat.rollPhase += dt * 1.65;
            cat.headAngle = cat.heading + Math.sin(cat.rollPhase * Math.PI * 2) * 0.3;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 0.55;
              cat.ctx?.particles?.spawnCatnipSparkles(cat.body.x, cat.body.y - 6, 4);
            }
            break;

          case 'cozy':
            cat.headAngle = cat.heading + Math.sin(cat.time * 1.8) * 0.12;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 1.1;
              cat.ctx?.particles?.spawnPurr(cat.body.x, cat.body.y - 8);
            }
            break;

          case 'treat':
          case 'nibble':
            cat.heading = lerpAngle(cat.heading, faceAng, dt * 9);
            cat.headAngle = cat.heading + Math.sin(stateTime * 12) * 0.12;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 0.46;
              cat.emitSound('crunch');
              cat.ctx?.particles?.spawnKibbleCrumbs(
                cat.spine.head.x + Math.cos(cat.heading) * 6,
                cat.spine.head.y + Math.sin(cat.heading) * 6,
                4,
              );
            }
            break;

          case 'sniff':
          default:
            cat.heading = lerpAngle(cat.heading, faceAng, dt * 8);
            cat.headAngle = cat.heading + Math.sin(stateTime * 14) * 0.16;
            if (cat.propActionTimer <= 0) {
              cat.propActionTimer = 0.95;
              cat.ctx?.particles?.spawnCuriosityPop(cat.spine.head.x, cat.spine.head.y - 8);
            }
            break;
        }

        if (stateTime >= cat.propDuration) {
          const wasCatnip = prop.interactionType === 'catnip';
          cat.propCooldown = cat.randRange(6, 13);
          cat.fsm.transition(
            wasCatnip && cat.nextRand() < 0.7
              ? 'ZOOMIES'
              : prop.interactionType === 'cozy'
                ? 'STRETCHING'
                : prop.interactionType === 'sniff' && cat.nextRand() < 0.25
                  ? 'FLEHMEN'
                  : 'WANDER',
          );
        }
      },
      onExit: (cat) => {
        cat.targetProp = null;
        cat.targetPropPoint = null;
        cat.activePropId = null;
        cat.propArrived = false;
        cat.propNotified = false;
      },
    });

    // 27. EATING_TREAT
    fsm.register('EATING_TREAT', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.treatArrived = false;
        cat.treatBiteTimer = 0.12;
        cat.mood = 'playful';
        if (!cat.targetTreat) {
          cat.targetTreat = cat.findNearestTreat(420);
        }
        if (!cat.targetTreat) {
          cat.fsm.transition('IDLE');
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        const liveTreat = cat.resolveLiveTreat();
        if (!liveTreat || liveTreat.remainingBites <= 0) {
          cat.ctx?.particles?.spawnHeartBurst(cat.body.x, cat.body.y - 10, 2);
          cat.mood = 'content';
          cat.fsm.transition('GROOMING');
          return;
        }

        const dx = liveTreat.x - cat.body.x;
        const dy = liveTreat.y - cat.body.y;
        const dist = Math.hypot(dx, dy);
        const reachDist = cat.body.radius + liveTreat.radius + 10;

        if (!cat.treatArrived && dist > reachDist) {
          if (stateTime > 7.0) {
            cat.fsm.transition('IDLE');
            return;
          }
          cat.steerTowards(liveTreat, 152, dt, 8.0);
          return;
        }

        cat.treatArrived = true;
        cat.dampVelocity(dt, 0.7);
        const faceAng = Math.atan2(dy, dx);
        cat.heading = lerpAngle(cat.heading, faceAng, dt * 9);
        cat.headAngle = faceAng + Math.sin(stateTime * 15) * 0.12;

        cat.treatBiteTimer -= dt;
        if (cat.treatBiteTimer <= 0) {
          cat.treatBiteTimer = 0.44;
          cat.squashX = 1.07;
          cat.squashY = 0.94;
          cat.emitSound('crunch');
          cat.brain.recordInteraction('treat', 0.4);
          cat.ctx?.particles?.spawnKibbleCrumbs(liveTreat.x, liveTreat.y, 4);
          const hadMore = cat.ctx?.onConsumeTreat?.(liveTreat.id, cat);
          if (hadMore === false) {
            cat.ctx?.particles?.spawnHeartBurst(cat.body.x, cat.body.y - 10, 2);
            cat.ctx?.particles?.spawnMusicNotes(cat.body.x, cat.body.y - 12, 1);
            cat.mood = 'content';
            cat.fsm.transition('GROOMING');
          }
        }
      },
      onExit: (cat) => {
        cat.targetTreat = null;
        cat.treatArrived = false;
      },
    });

    // ========================================================================
    // 20 NEW V2.0 REAL-LIFE CAT BEHAVIORS (completing all 50 states!)
    // ========================================================================

    // 28. KNEADING (Rhythmic alternating front paws "making biscuits" on rugs/blankets/beds)
    fsm.register('KNEADING', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'affectionate';
        cat.kneadPhase = 0;
        cat.purrTimer = 0.15;
        cat.stateTargetDuration = cat.randRange(3.6, 6.4);
        cat.emitSound('purr');
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.checkImmediateStimuli()) return;
        cat.dampVelocity(dt, 0.72);
        cat.kneadPhase += dt * 2.4;
        cat.headAngle = lerpAngle(
          cat.headAngle,
          cat.heading + Math.sin(cat.kneadPhase * Math.PI) * 0.09,
          dt * 5,
        );
        cat.purrTimer += dt;
        if (cat.purrTimer >= 0.85) {
          cat.purrTimer = 0;
          cat.ctx?.particles?.spawnPurr(cat.body.x, cat.body.y - 10);
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition(cat.nextRand() < 0.55 ? 'LOAFING' : 'NAP');
        }
      },
    });

    // 29. SLOW_BLINK ("I trust you" affectionate slow blink toward cursor/user)
    fsm.register('SLOW_BLINK', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'affectionate';
        cat.slowBlinkPhase = 0;
        cat.stateTargetDuration = 2.05;
        if (cat.ctx?.cursorPos) {
          const ang = Math.atan2(
            cat.ctx.cursorPos.y - cat.body.y,
            cat.ctx.cursorPos.x - cat.body.x,
          );
          cat.headAngle = ang;
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        cat.dampVelocity(dt, 0.7);
        if (cat.ctx?.cursorPos) {
          const ang = Math.atan2(
            cat.ctx.cursorPos.y - cat.body.y,
            cat.ctx.cursorPos.x - cat.body.x,
          );
          cat.headAngle = lerpAngle(cat.headAngle, ang, dt * 4);
        }
        cat.slowBlinkPhase = stateTime;
        if (stateTime >= 0.35 && stateTime <= 1.25) {
          cat.blinkDuration = 0.25;
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.ctx?.particles?.spawnHeartBurst(cat.spine.head.x, cat.spine.head.y - 10, 1);
          cat.fsm.transition('LOAFING');
        }
      },
      onExit: (cat) => {
        cat.slowBlinkPhase = 0;
      },
    });

    // 30. CHATTER (Vibrating jaw/whiskers + ek-ek-ek puffs toward birds/moths/fish/aquarium)
    fsm.register('CHATTER', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'hunting';
        cat.earPose = 'forward';
        cat.chatterTimer = 0.1;
        cat.stateTargetDuration = cat.randRange(2.2, 3.8);
        if (!cat.chatterTarget) {
          const critter = cat.findNearestCritter(450);
          cat.chatterTarget = critter
            ? { x: critter.x, y: critter.y }
            : { x: cat.body.x + Math.cos(cat.heading) * 120, y: cat.body.y + Math.sin(cat.heading) * 120 };
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        cat.dampVelocity(dt, 0.72);
        const critter = cat.findNearestCritter(420);
        if (critter) {
          cat.chatterTarget = { x: critter.x, y: critter.y };
        }
        if (cat.chatterTarget) {
          const ang = Math.atan2(
            cat.chatterTarget.y - cat.body.y,
            cat.chatterTarget.x - cat.body.x,
          );
          cat.heading = lerpAngle(cat.heading, ang, dt * 8);
          cat.headAngle = ang + Math.sin(stateTime * 46) * 0.06;
        }
        cat.chatterTimer -= dt;
        if (cat.chatterTimer <= 0) {
          cat.chatterTimer = cat.randRange(0.32, 0.55);
          cat.emitSound('chatter');
          cat.ctx?.particles?.spawnChatterPuff(cat.spine.head.x, cat.spine.head.y - 6);
        }
        if (stateTime >= cat.stateTargetDuration) {
          const shouldPounce = cat.nextRand() < 0.45 && cat.chatterTarget !== null;
          if (shouldPounce && cat.chatterTarget) {
            cat.activeTarget = { ...cat.chatterTarget };
            cat.fsm.transition('POUNCE_WIGGLE');
          } else {
            cat.fsm.transition('IDLE');
          }
        }
      },
      onExit: (cat) => {
        cat.chatterTarget = null;
        cat.earPose = 'normal';
      },
    });

    // 31. STARE_VOID (Freezes abruptly and stares intensely at nothing in a corner)
    fsm.register('STARE_VOID', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.mood = 'curious';
        cat.earPose = 'forward';
        cat.stateTargetDuration = cat.randRange(2.6, 4.6);
        const bounds = cat.ctx?.physics?.getBounds() ?? { width: 1280, height: 720 };
        const cornerX = cat.nextRand() < 0.5 ? 24 : bounds.width - 24;
        const cornerY = cat.nextRand() < 0.5 ? 24 : bounds.height - 24;
        cat.voidStarePoint = { x: cornerX, y: cornerY };
        const ang = Math.atan2(cornerY - cat.body.y, cornerX - cat.body.x);
        cat.heading = ang;
        cat.headAngle = ang;
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        cat.dampVelocity(dt, 0.68);
        if (cat.voidStarePoint) {
          const ang = Math.atan2(
            cat.voidStarePoint.y - cat.body.y,
            cat.voidStarePoint.x - cat.body.x,
          );
          cat.headAngle = lerpAngle(cat.headAngle, ang, dt * 10);
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('WANDER');
        }
      },
      onExit: (cat) => {
        cat.voidStarePoint = null;
        cat.earPose = 'normal';
      },
    });

    // 32. HEAD_BUNT (Cheek-rubbing furniture/props/other cats affectionately)
    fsm.register('HEAD_BUNT', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'affectionate';
        cat.headBuntArrived = false;
        cat.stateTargetDuration = 3.2;
        const props = cat.ctx?.interactiveProps;
        if (props && props.length > 0) {
          const prop = props[Math.floor(cat.nextRand() * props.length)];
          cat.headBuntTarget = prop.interactPoint
            ? { ...prop.interactPoint }
            : { x: prop.x, y: prop.y };
        } else if (cat.ctx?.cursorPos) {
          cat.headBuntTarget = { ...cat.ctx.cursorPos };
        } else {
          cat.headBuntTarget = {
            x: cat.body.x + Math.cos(cat.heading) * 65,
            y: cat.body.y + Math.sin(cat.heading) * 65,
          };
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (!cat.headBuntTarget) {
          cat.fsm.transition('IDLE');
          return;
        }
        if (!cat.headBuntArrived) {
          const d = cat.steerTowards(cat.headBuntTarget, 98, dt, 6.5);
          if (d <= 28 || stateTime > 2.2) {
            cat.headBuntArrived = true;
            cat.emitSound('purr');
            cat.ctx?.particles?.spawnHeartBurst(cat.spine.head.x, cat.spine.head.y - 8, 2);
          }
          return;
        }
        cat.dampVelocity(dt, 0.72);
        cat.headAngle = cat.heading + Math.sin(stateTime * 8) * 0.36;
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.headBuntTarget = null;
      },
    });

    // 33. FLEHMEN (Open-mouth "gross face" after sniffing weird objects/litter)
    fsm.register('FLEHMEN', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.mood = 'curious';
        cat.stateTargetDuration = cat.randRange(1.8, 2.8);
        cat.squashX = 0.94;
        cat.squashY = 1.07;
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.dampVelocity(dt, 0.7);
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('IDLE');
        }
      },
    });

    // 34. SNEEZE_HICCUP (Tiny recoil + air puff + sneeze sound)
    fsm.register('SNEEZE_HICCUP', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.sneezeDone = false;
        cat.sneezeTimer = 0.36;
        cat.stateTargetDuration = 1.15;
        cat.squashX = 1.08;
        cat.squashY = 0.92;
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.dampVelocity(dt, 0.78);
        if (!cat.sneezeDone && stateTime >= cat.sneezeTimer) {
          cat.sneezeDone = true;
          cat.squashX = 0.8;
          cat.squashY = 1.24;
          cat.body.vx = -Math.cos(cat.heading) * 90;
          cat.body.vy = -Math.sin(cat.heading) * 90;
          cat.emitSound('sneeze');
          cat.ctx?.particles?.spawnSneezePuff(cat.spine.head.x, cat.spine.head.y, cat.headAngle);
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('GROOMING');
        }
      },
    });

    // 35. TRIP_RECOVER (Comedic brief trip/tumble then immediate proud grooming!)
    fsm.register('TRIP_RECOVER', {
      onEnter: (cat) => {
        cat.zHeight = 6;
        cat.squashX = 1.26;
        cat.squashY = 0.76;
        cat.body.vx = Math.cos(cat.heading) * 140;
        cat.body.vy = Math.sin(cat.heading) * 140;
        cat.stateTargetDuration = 0.85;
        cat.ctx?.particles?.spawnDustPuff(cat.body.x, cat.body.y, 0, 0);
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.dampVelocity(dt, 0.82);
        const u = clamp(stateTime / 0.35, 0, 1);
        cat.zHeight = stateTime < 0.35 ? 12 * 4 * u * (1 - u) : 0;
        cat.headAngle = cat.heading + Math.sin(stateTime * 22) * 0.35;
        if (stateTime >= cat.stateTargetDuration) {
          cat.zHeight = 0;
          cat.fsm.transition('GROOMING');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
      },
    });

    // 36. DRINKING (Crouches at enlarged pond/fountain/water glass with gentle ripples & lapping!)
    fsm.register('DRINKING', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.drinkArrived = false;
        cat.drinkLapTimer = 0.15;
        cat.stateTargetDuration = cat.randRange(3.4, 5.4);
        if (!cat.drinkProp) {
          const props = cat.ctx?.interactiveProps ?? [];
          cat.drinkProp =
            props.find((p) => p.interactionType === 'drink' || p.interactionType === 'water') ?? null;
        }
        if (cat.drinkProp) {
          cat.activePropId = cat.drinkProp.id;
          cat.drinkTarget = cat.drinkTarget ?? cat.pickDrinkPointForProp(cat.drinkProp);
        } else {
          cat.fsm.transition('IDLE');
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        if (!cat.drinkProp || !cat.drinkTarget) {
          cat.fsm.transition('IDLE');
          return;
        }
        if (!cat.drinkArrived) {
          const d = cat.steerTowards(cat.drinkTarget, 96, dt, 6.5);
          if (d <= 26 || stateTime > 4.5) {
            cat.drinkArrived = true;
            const face = Math.atan2(cat.drinkProp.y - cat.body.y, cat.drinkProp.x - cat.body.x);
            cat.heading = face;
            cat.headAngle = face;
            cat.ctx?.onPropInteract?.(cat.drinkProp.id, cat);
          }
          return;
        }

        cat.dampVelocity(dt, 0.7);
        const face = Math.atan2(cat.drinkProp.y - cat.body.y, cat.drinkProp.x - cat.body.x);
        cat.heading = lerpAngle(cat.heading, face, dt * 8);
        cat.headAngle = face + Math.sin(stateTime * 9) * 0.08;

        cat.drinkLapTimer -= dt;
        if (cat.drinkLapTimer <= 0) {
          cat.drinkLapTimer = 0.48;
          cat.emitSound('water_lap');
          const splashX = cat.spine.head.x + Math.cos(cat.heading) * 10;
          const splashY = cat.spine.head.y + Math.sin(cat.heading) * 10;
          cat.ctx?.particles?.spawnChimeRipple(splashX, splashY, 0x9ce2f5);
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('GROOMING');
        }
      },
      onExit: (cat) => {
        cat.drinkProp = null;
        cat.drinkTarget = null;
        cat.activePropId = null;
        cat.drinkArrived = false;
      },
    });

    // 37. LITTER_USE (Dig -> Sniff -> Dig -> Explosive post-litter ZOOMIES!)
    fsm.register('LITTER_USE', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.litterArrived = false;
        cat.litterStage = 0;
        cat.propActionTimer = 0.2;
        cat.stateTargetDuration = 4.0;
        if (!cat.litterProp) {
          const props = cat.ctx?.interactiveProps ?? [];
          cat.litterProp = props.find((p) => p.interactionType === 'litter') ?? null;
        }
        if (!cat.litterProp) {
          cat.fsm.transition('ZOOMIES');
        } else {
          cat.activePropId = cat.litterProp.id;
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        const prop = cat.litterProp;
        if (!prop) {
          cat.fsm.transition('IDLE');
          return;
        }
        const pt = prop.interactPoint ?? { x: prop.x, y: prop.y };
        if (!cat.litterArrived) {
          const d = cat.steerTowards(pt, 108, dt, 6.5);
          if (d <= 26 || stateTime > 4.0) {
            cat.litterArrived = true;
            cat.ctx?.onPropInteract?.(prop.id, cat);
          }
          return;
        }

        cat.dampVelocity(dt, 0.72);
        cat.propActionTimer -= dt;
        const elapsed = stateTime;
        if (cat.propActionTimer <= 0) {
          cat.propActionTimer = 0.35;
          if (elapsed < 1.3 || elapsed > 2.3) {
            cat.ctx?.particles?.spawnDustPuff(prop.x, prop.y, 0, -10);
          } else {
            cat.headAngle = cat.heading + Math.sin(stateTime * 12) * 0.2;
          }
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('ZOOMIES', true);
        }
      },
      onExit: (cat) => {
        cat.litterProp = null;
        cat.activePropId = null;
        cat.litterArrived = false;
      },
    });

    // 38. CUCUMBER_SCARE (Massive 78px vertical panic leap!)
    fsm.register('CUCUMBER_SCARE', {
      onEnter: (cat) => {
        const origin = cat.startleFrom ?? { x: cat.body.x - 30, y: cat.body.y };
        const away = Math.atan2(cat.body.y - origin.y, cat.body.x - origin.x);
        cat.heading = away;
        cat.headAngle = away;
        cat.body.vx = Math.cos(away) * 480;
        cat.body.vy = Math.sin(away) * 480;
        cat.squashX = 0.8;
        cat.squashY = 1.28;
        cat.mood = 'startled';
        cat.earPose = 'flat_back';
        cat.emitSound('startle');
        cat.ctx?.particles?.spawnStartleBurst(cat.body.x, cat.body.y);
      },
      onUpdate: (cat, dt, stateTime) => {
        const leapDur = 0.62;
        if (stateTime < leapDur) {
          const u = stateTime / leapDur;
          cat.zHeight = CUCUMBER_SCARE_PEAK_Z_PX * 4 * u * (1 - u);
        } else {
          cat.zHeight = 0;
          cat.dampVelocity(dt, 0.88);
          cat.headAngle = cat.heading + Math.sin(stateTime * 16) * 0.4;
        }
        if (stateTime >= 1.15) {
          cat.zHeight = 0;
          cat.mood = 'content';
          cat.earPose = 'normal';
          cat.emitBellIfWearing();
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
        cat.earPose = 'normal';
      },
    });

    // 39. CARRY_GIFT (Carries mouse/fish toy to screen edge as a gift with proud trill!)
    fsm.register('CARRY_GIFT', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'affectionate';
        cat.giftPickedUp = false;
        cat.giftToy = cat.findGiftToy();
        const bounds = cat.ctx?.physics?.getBounds() ?? { width: 1280, height: 720 };
        cat.giftEdgeTarget = {
          x: cat.body.x < bounds.width * 0.5 ? 54 : bounds.width - 54,
          y: clamp(cat.body.y, 70, bounds.height - 70),
        };
        if (!cat.giftToy) {
          cat.giftPickedUp = true; // Virtual gift pride strut
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (!cat.giftPickedUp && cat.giftToy) {
          const d = cat.steerTowards(cat.giftToy, 118, dt, 7.5);
          if (d <= cat.body.radius + cat.giftToy.radius + 10 || stateTime > 3.0) {
            cat.giftPickedUp = true;
            const mx = cat.spine.head.x + Math.cos(cat.headAngle) * 10;
            const my = cat.spine.head.y + Math.sin(cat.headAngle) * 10;
            cat.ctx?.onCarryToy?.(cat.giftToy.id, cat.id, mx, my, cat.headAngle);
            cat.emitSound('trill');
          }
          return;
        }
        if (cat.giftToy && cat.giftPickedUp) {
          const mx = cat.spine.head.x + Math.cos(cat.headAngle) * 10;
          const my = cat.spine.head.y + Math.sin(cat.headAngle) * 10;
          cat.ctx?.onCarryToy?.(cat.giftToy.id, cat.id, mx, my, cat.headAngle);
        }
        if (cat.giftEdgeTarget) {
          const d = cat.steerTowards(cat.giftEdgeTarget, 108, dt, 6.5);
          if (d <= 28 || stateTime > 6.5) {
            if (cat.giftToy) {
              const dropX = cat.spine.head.x + Math.cos(cat.headAngle) * 12;
              const dropY = cat.spine.head.y + Math.sin(cat.headAngle) * 12;
              cat.ctx?.onCarryToy?.(cat.giftToy.id, null, dropX, dropY, cat.headAngle);
            }
            cat.emitSound('trill');
            cat.brain.recordInteraction('gift');
            cat.ctx?.particles?.spawnHeartBurst(cat.body.x, cat.body.y - 12, 3);
            cat.fsm.transition('MEERKAT_PEEK');
          }
        } else {
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        if (cat.giftToy && cat.giftPickedUp) {
          cat.ctx?.onCarryToy?.(cat.giftToy.id, null);
        }
        cat.giftToy = null;
        cat.giftEdgeTarget = null;
        cat.giftPickedUp = false;
      },
    });

    // 40. HAIRBALL (Rare funny rhythmic heave + fading fuzzball puff!)
    fsm.register('HAIRBALL', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.body.vx = 0;
        cat.body.vy = 0;
        cat.hairballHeaves = 0;
        cat.hairballTimer = 0.45;
        cat.stateTargetDuration = 2.4;
        cat.earPose = 'airplane';
      },
      onUpdate: (cat, dt, stateTime) => {
        cat.dampVelocity(dt, 0.7);
        cat.hairballTimer -= dt;
        if (cat.hairballTimer <= 0 && cat.hairballHeaves < 3) {
          cat.hairballHeaves++;
          cat.hairballTimer = 0.52;
          cat.squashX = 0.82;
          cat.squashY = 1.22;
          if (cat.hairballHeaves === 3) {
            cat.emitSound('sneeze');
            const outX = cat.spine.head.x + Math.cos(cat.headAngle) * 14;
            const outY = cat.spine.head.y + Math.sin(cat.headAngle) * 14;
            cat.ctx?.particles?.spawnHairballPuff(outX, outY);
          }
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.earPose = 'normal';
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.earPose = 'normal';
      },
    });

    // 41. IGNORE_USER (Flicks ear and deliberately walks the other way)
    fsm.register('IGNORE_USER', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'irritated';
        cat.earTwitchRight = 0.35;
        cat.stateTargetDuration = cat.randRange(1.8, 2.8);
        const away = cat.ctx?.cursorPos
          ? Math.atan2(cat.body.y - cat.ctx.cursorPos.y, cat.body.x - cat.ctx.cursorPos.x)
          : cat.heading + Math.PI;
        cat.ignoreAwayAngle = normalizeAngle(away + cat.randRange(-0.35, 0.35));
      },
      onUpdate: (cat, dt, stateTime) => {
        const steer = cat.computeObstacleAvoidanceAngle(cat.ignoreAwayAngle);
        cat.heading = lerpAngle(cat.heading, steer, dt * 6);
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading, dt * 8);
        const speed = 78 * cat.breedProfile.locomotion.walkSpeedMultiplier;
        cat.body.vx += Math.cos(cat.heading) * speed * 5 * dt;
        cat.body.vy += Math.sin(cat.heading) * speed * 5 * dt;
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('LOAFING');
        }
      },
    });

    // 42. TASKBAR_WALK (Walks along taskbar ledge or open window title bars, peeks over edge!)
    fsm.register('TASKBAR_WALK', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'curious';
        cat.taskbarDir = cat.nextRand() < 0.5 ? 1 : -1;
        cat.taskbarPeekTimer = cat.randRange(1.2, 2.2);
        cat.stateTargetDuration = cat.randRange(4.0, 6.8);
        const ledges = cat.ctx?.windowLedges;
        if (ledges?.windowTopLedges && ledges.windowTopLedges.length > 0 && cat.nextRand() < 0.65) {
          cat.taskbarLedge = ledges.windowTopLedges[Math.floor(cat.nextRand() * ledges.windowTopLedges.length)];
        } else if (ledges?.taskbarRect) {
          cat.taskbarLedge = ledges.taskbarRect;
        } else {
          const b = cat.ctx?.physics?.getBounds() ?? { width: 1280, height: 720 };
          cat.taskbarLedge = { id: -50, x: 40, y: b.height - 44, width: b.width - 80, height: 40, label: 'Taskbar' };
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        const ledge = cat.taskbarLedge;
        if (!ledge) {
          cat.fsm.transition('IDLE');
          return;
        }
        const walkY = clamp(ledge.y - 6, 36, (cat.ctx?.physics?.getBounds().height ?? 720) - 24);
        const minX = ledge.x + 22;
        const maxX = Math.max(minX + 20, ledge.x + ledge.width - 22);

        cat.taskbarPeekTimer -= dt;
        if (cat.taskbarPeekTimer <= 0 && cat.taskbarPeekTimer > -1.0) {
          // Pause to peek down over the edge and dangle paw!
          cat.dampVelocity(dt, 0.72);
          cat.headAngle = lerpAngle(cat.headAngle, Math.PI * 0.5, dt * 7);
          if (Math.abs(cat.taskbarPeekTimer + 0.5) < dt * 1.5) {
            cat.ctx?.particles?.spawnPawTap(cat.body.x, walkY + 8);
          }
          return;
        }
        if (cat.taskbarPeekTimer <= -1.0) {
          cat.taskbarPeekTimer = cat.randRange(1.4, 2.4);
        }

        if (cat.body.x <= minX) cat.taskbarDir = 1;
        else if (cat.body.x >= maxX) cat.taskbarDir = -1;

        const targetX = clamp(cat.body.x + cat.taskbarDir * 80, minX, maxX);
        cat.steerTowards({ x: targetX, y: walkY }, 86, dt, 6.5);

        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('WANDER');
        }
      },
      onExit: (cat) => {
        cat.taskbarLedge = null;
      },
    });

    // 43. PAW_TEST (Hesitant single-paw tap before stepping onto water or new toy)
    fsm.register('PAW_TEST', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'curious';
        cat.pawTestArrived = false;
        cat.pawTestTaps = 0;
        cat.pawTestTimer = 0.25;
        cat.stateTargetDuration = 2.8;
        if (!cat.pawTestTarget) {
          const toy = cat.findNearestToy(260);
          if (toy) {
            cat.pawTestTarget = { x: toy.x, y: toy.y };
          } else {
            const water = (cat.ctx?.interactiveProps ?? []).find(
              (p) => p.interactionType === 'drink' || p.interactionType === 'water',
            );
            cat.pawTestTarget = water
              ? cat.pickDrinkPointForProp(water)
              : { x: cat.body.x + Math.cos(cat.heading) * 70, y: cat.body.y + Math.sin(cat.heading) * 70 };
          }
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (!cat.pawTestTarget) {
          cat.fsm.transition('IDLE');
          return;
        }
        if (!cat.pawTestArrived) {
          const d = cat.steerTowards(cat.pawTestTarget, 82, dt, 6);
          if (d <= 36 || stateTime > 1.8) {
            cat.pawTestArrived = true;
          }
          return;
        }
        cat.dampVelocity(dt, 0.72);
        cat.pawTestTimer -= dt;
        if (cat.pawTestTimer <= 0 && cat.pawTestTaps < 2) {
          cat.pawTestTaps++;
          cat.pawTestTimer = 0.45;
          cat.squashX = 1.08;
          cat.squashY = 0.93;
          cat.ctx?.particles?.spawnPawTap(
            cat.spine.head.x + Math.cos(cat.heading) * 14,
            cat.spine.head.y + Math.sin(cat.heading) * 14,
          );
        }
        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.pawTestTarget = null;
      },
    });

    // 44. OVERSTIMULATED (Irritated tail flick + airplane ears + walks away)
    fsm.register('OVERSTIMULATED', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'irritated';
        cat.earPose = 'airplane';
        cat.stateTargetDuration = cat.randRange(2.0, 3.0);
        const away = cat.ctx?.cursorPos
          ? Math.atan2(cat.body.y - cat.ctx.cursorPos.y, cat.body.x - cat.ctx.cursorPos.x)
          : cat.heading + Math.PI * 0.85;
        cat.overstimulatedDir = normalizeAngle(away);
        cat.emitSound('chirp');
      },
      onUpdate: (cat, dt, stateTime) => {
        const steer = cat.computeObstacleAvoidanceAngle(cat.overstimulatedDir);
        cat.heading = lerpAngle(cat.heading, steer, dt * 7);
        cat.headAngle = lerpAngle(cat.headAngle, cat.heading, dt * 8);
        const speed = 110 * cat.breedProfile.locomotion.walkSpeedMultiplier;
        cat.body.vx += Math.cos(cat.heading) * speed * 5.2 * dt;
        cat.body.vy += Math.sin(cat.heading) * speed * 5.2 * dt;
        if (stateTime >= cat.stateTargetDuration) {
          cat.earPose = 'normal';
          cat.mood = 'content';
          cat.fsm.transition('GROOMING');
        }
      },
      onExit: (cat) => {
        cat.earPose = 'normal';
      },
    });

    // 45. PAPER_BAG_AMBUSH (Dives into paper bag/tunnel & lunges out playfully!)
    fsm.register('PAPER_BAG_AMBUSH', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'hunting';
        cat.bagEntered = false;
        cat.bagLunged = false;
        cat.stateTargetDuration = 3.6;
        if (!cat.bagToy && !cat.bagProp) {
          cat.bagToy = (cat.ctx?.toys ?? []).find((t) => t.active && t.kind === 'paper_bag') ?? null;
          if (!cat.bagToy) {
            cat.bagProp =
              (cat.ctx?.interactiveProps ?? []).find((p) => p.interactionType === 'ambush') ?? null;
          }
        }
        if (cat.bagToy) cat.bagTarget = { x: cat.bagToy.x, y: cat.bagToy.y };
        else if (cat.bagProp) cat.bagTarget = { x: cat.bagProp.x, y: cat.bagProp.y };
        else cat.fsm.transition('IDLE');
      },
      onUpdate: (cat, dt, stateTime) => {
        if (!cat.bagTarget) {
          cat.fsm.transition('IDLE');
          return;
        }
        if (!cat.bagEntered) {
          const d = cat.steerTowards(cat.bagTarget, 145, dt, 8);
          if (d <= 22 || stateTime > 2.2) {
            cat.bagEntered = true;
            cat.emitSound('crinkle');
            cat.squashX = 0.85;
            cat.squashY = 1.15;
            cat.ctx?.particles?.spawnDustPuff(cat.bagTarget.x, cat.bagTarget.y, 0, -10);
          }
          return;
        }
        if (!cat.bagLunged && stateTime < 2.6) {
          cat.dampVelocity(dt, 0.65);
          cat.headAngle = cat.heading + Math.sin(stateTime * 10) * 0.22;
          return;
        }
        if (!cat.bagLunged) {
          cat.bagLunged = true;
          cat.zHeight = 24;
          cat.body.vx = Math.cos(cat.heading) * 320;
          cat.body.vy = Math.sin(cat.heading) * 320;
          cat.emitSound('crinkle');
          cat.ctx?.particles?.spawnConfettiBurst(cat.body.x, cat.body.y, 4);
        }
        const u = clamp((stateTime - 2.6) / 0.45, 0, 1);
        cat.zHeight = 24 * 4 * u * (1 - u);
        if (stateTime >= cat.stateTargetDuration) {
          cat.zHeight = 0;
          cat.fsm.transition('IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
        cat.bagToy = null;
        cat.bagProp = null;
        cat.bagTarget = null;
      },
    });

    // 46. PLAY_TOY (Interacts authentically with all 11 ToyManager toys!)
    fsm.register('PLAY_TOY', {
      onEnter: (cat) => {
        cat.zHeight = 0;
        cat.mood = 'playful';
        cat.toyBatCooldown = 0.1;
        cat.stateTargetDuration = cat.randRange(3.2, 5.5);
        if (!cat.targetToy) {
          cat.targetToy = cat.findNearestToy(420);
        }
        if (!cat.targetToy) {
          cat.fsm.transition('IDLE');
        }
      },
      onUpdate: (cat, dt, stateTime) => {
        if (cat.resolveLaserTarget()) {
          cat.fsm.transition('STALK');
          return;
        }
        const liveToy = cat.resolveLiveToy();
        if (!liveToy || !liveToy.active) {
          cat.fsm.transition('IDLE');
          return;
        }

        if (liveToy.kind === 'cucumber') {
          cat.triggerCucumberScare({ x: liveToy.x, y: liveToy.y });
          return;
        }
        if (liveToy.kind === 'paper_bag') {
          cat.bagToy = liveToy;
          cat.fsm.transition('PAPER_BAG_AMBUSH');
          return;
        }

        const d = cat.steerTowards(liveToy, 152, dt, 8.2);

        if (liveToy.kind === 'taped_square') {
          if (d <= 16) {
            cat.dampVelocity(dt, 0.65);
            cat.fsm.transition('LOAFING');
          }
          return;
        }

        if (liveToy.kind === 'bubbles') {
          if (d <= cat.body.radius + liveToy.radius + 18) {
            cat.zHeight = 28;
            cat.ctx?.onPopBubble?.(liveToy.id, cat.id);
            cat.ctx?.particles?.spawnBubblePop(liveToy.x, liveToy.y, 5);
            cat.emitSound('bubble_pop');
            cat.brain.recordInteraction('play', 0.6);
            cat.fsm.transition('IDLE');
          }
          return;
        }

        const reach = cat.body.radius + liveToy.radius + 12;
        if (d <= reach && cat.toyBatCooldown <= 0) {
          cat.toyBatCooldown = 0.65;
          const batAngle = Math.atan2(liveToy.y - cat.body.y, liveToy.x - cat.body.x) + cat.randRange(-0.4, 0.4);
          const batSpeed =
            liveToy.kind === 'crinkle_ball' || liveToy.kind === 'ping_pong' || liveToy.kind === 'hair_tie'
              ? 360
              : 240;
          cat.ctx?.onBatToy?.(
            liveToy.id,
            Math.cos(batAngle) * batSpeed,
            Math.sin(batAngle) * batSpeed,
            cat.id,
          );
          cat.brain.recordInteraction('play', 0.45);
          cat.squashX = 1.14;
          cat.squashY = 0.88;

          if (liveToy.isCatnip || liveToy.kind === 'mouse_toy') {
            cat.ctx?.particles?.spawnCatnipSparkles(liveToy.x, liveToy.y, 5);
            cat.emitSound('chirp');
          } else if (liveToy.kind === 'crinkle_ball') {
            cat.ctx?.particles?.spawnGroomSparkle(liveToy.x, liveToy.y);
            cat.emitSound('crinkle');
          } else {
            cat.ctx?.particles?.spawnDustPuff(liveToy.x, liveToy.y, 0, -10);
            cat.emitSound('chirp');
          }
        }

        if (stateTime >= cat.stateTargetDuration) {
          cat.fsm.transition(cat.nextRand() < 0.35 && liveToy.isCatnip ? 'ROLL_BELLY' : 'IDLE');
        }
      },
      onExit: (cat) => {
        cat.zHeight = 0;
        cat.targetToy = null;
      },
    });

    return fsm;
  }

  // ============================================================================
  // Organic Behavior Decision Helpers
  // ============================================================================

  private checkImmediateStimuli(): boolean {
    // 1. Cucumber scare check (sneaky cucumber placed near/behind unsuspecting cat!)
    if (this.cucumberCooldown <= 0 && this.ctx?.toys) {
      for (const toy of this.ctx.toys) {
        if (!toy.active || (toy.kind !== 'cucumber' && !toy.isScary)) continue;
        const d = Math.hypot(toy.x - this.body.x, toy.y - this.body.y);
        if (d <= 118) {
          this.triggerCucumberScare({ x: toy.x, y: toy.y });
          return true;
        }
      }
    }

    // 2. Laser pointer (respects realistic laser boredom!)
    const laser = this.resolveLaserTarget();
    if (laser) {
      this.pendingIconPlay = null;
      this.activeTarget = { x: laser.x, y: laser.y };
      this.fsm.transition('STALK');
      return true;
    }

    // 3. Dropped treats
    const treat = this.findNearestTreat(420);
    if (treat) {
      this.pendingIconPlay = null;
      this.targetTreat = treat;
      this.fsm.transition('EATING_TREAT');
      return true;
    }

    // 4. File sniff investigation
    if (this.investigatePoint) {
      this.pendingIconPlay = null;
      this.fsm.transition('SNIFF_FILE');
      return true;
    }

    // 5. Rolling yarn ball
    const yarn = this.ctx.yarnBall;
    if (yarn && yarn.isRolling()) {
      const yp = yarn.getPosition();
      if (Math.hypot(yp.x - this.body.x, yp.y - this.body.y) < 380) {
        this.pendingIconPlay = null;
        this.activeTarget = yp;
        this.fsm.transition('STALK');
        return true;
      }
    }

    return false;
  }

  private buildBrainContext(): Parameters<CatBrain['chooseNextBehavior']>[0] {
    const toys = this.ctx?.toys ?? [];
    const props = this.ctx?.interactiveProps ?? [];
    const ledges = this.ctx?.windowLedges;
    return {
      date: this.ctx?.nowDate,
      hasWarmSpot: Boolean(this.findBestWarmSpot()),
      hasToys: toys.some((t) => t.active && !t.isScary),
      availableToys: toys,
      availableProps: props,
      hasCritters: (this.ctx?.ambientCritters?.length ?? 0) > 0,
      hasWindowLedges: Boolean(
        ledges && (ledges.taskbarRect || (ledges.windowTopLedges && ledges.windowTopLedges.length > 0)),
      ),
      hasPaperBag:
        toys.some((t) => t.active && t.kind === 'paper_bag') ||
        props.some((p) => p.interactionType === 'ambush'),
      hasTapedSquare: toys.some((t) => t.active && t.kind === 'taped_square'),
      hasLitterBox: props.some((p) => p.interactionType === 'litter'),
      hasWaterProp: props.some((p) => p.interactionType === 'drink' || p.interactionType === 'water'),
      hasFoodProp: props.some((p) => p.interactionType === 'treat' || p.interactionType === 'nibble'),
      hasOtherCats: (this.ctx?.otherCats?.length ?? 0) > 1,
      hasCursor: Boolean(this.ctx?.cursorPos),
      isOnBlanketOrRug: this.ctx?.surfaceManager?.isOnRug(this.body.x, this.body.y) ?? false,
    };
  }

  private chooseNextIdleActivity(): void {
    if (this.trySeekActiveProp()) return;
    if (this.tryStartSocialPlay()) return;

    if (this.behaviorCooldown <= 0) {
      const chosen = this.brain.chooseNextBehavior(this.buildBrainContext());
      if (chosen === 'ZOOMIES' && this.zoomieCooldown > 0) {
        this.fsm.transition('WANDER');
        return;
      }
      if (chosen === 'SUNBATHE') {
        this.sunbatheSpot = this.findBestWarmSpot();
      }
      this.fsm.transition(chosen);
      return;
    }

    this.fsm.transition('WANDER');
  }

  private chooseNextWanderEndActivity(): void {
    if (this.trySeekActiveProp()) return;
    if (this.tryStartSocialPlay()) return;

    const chosen = this.brain.chooseNextBehavior(this.buildBrainContext());
    if (chosen === 'ZOOMIES' && this.zoomieCooldown > 0) {
      this.fsm.transition('IDLE');
      return;
    }
    if (chosen === 'SUNBATHE') {
      this.sunbatheSpot = this.findBestWarmSpot();
    }
    this.fsm.transition(chosen);
  }

  private pickNewWanderGoal(): void {
    const bounds = this.ctx?.physics?.getBounds() ?? { width: 1280, height: 720 };
    const rug = this.ctx?.surfaceManager?.getRugBounds();
    const margin = 64;

    if (rug && this.nextRand() < 0.55) {
      this.wanderGoal = {
        x: clamp(rug.x + this.randRange(0.08, 0.92) * rug.width, margin, bounds.width - margin),
        y: clamp(rug.y + this.randRange(0.08, 0.92) * rug.height, margin, bounds.height - margin),
      };
    } else {
      this.wanderGoal = {
        x: this.randRange(margin, Math.max(margin + 10, bounds.width - margin)),
        y: this.randRange(margin, Math.max(margin + 10, bounds.height - margin)),
      };
    }
    this.wanderGoalTimer = this.randRange(2.4, 5.8);
  }

  private tryStartSocialPlay(): boolean {
    if (this.socialCooldown > 0 || !this.ctx?.otherCats || this.ctx.otherCats.length < 2) {
      return false;
    }
    if (this.nextRand() > 0.12 + this.personality.sociability * 0.35) {
      return false;
    }

    let nearest: CatEntity | null = null;
    let nearestDist = 135;

    for (const other of this.ctx.otherCats) {
      if (other.id === this.id) continue;
      const ost = other.getState();
      if (
        ost === 'IN_BOX' ||
        ost === 'JUMP_TO_BOX' ||
        ost === 'JUMP_OUT_BOX' ||
        ost === 'JUMP_TO_ICON' ||
        ost === 'PERCH_ICON' ||
        ost === 'BONK' ||
        ost === 'STARTLED' ||
        ost === 'CUCUMBER_SCARE'
      ) {
        continue;
      }
      const p = other.getPosition();
      const d = Math.hypot(p.x - this.body.x, p.y - this.body.y);
      if (d < nearestDist && d > 20) {
        nearestDist = d;
        nearest = other;
      }
    }

    if (!nearest) return false;

    const partnerState = nearest.getState();
    this.socialPartner = nearest;
    if (
      partnerState === 'NAP' ||
      partnerState === 'DEEP_SLEEP' ||
      partnerState === 'LOAFING' ||
      partnerState === 'SUNBATHE' ||
      this.breedProfile.behaviorAffinities.socialCuddle > 0.85
    ) {
      this.socialMode = this.nextRand() < 0.55 ? 'cuddle' : 'boop';
    } else {
      const r = this.nextRand();
      this.socialMode = r < 0.45 ? 'boop' : r < 0.8 ? 'chase' : 'cuddle';
    }

    this.fsm.transition('SOCIAL_PLAY');
    return true;
  }

  private trySeekActiveProp(): boolean {
    if (this.propCooldown > 0 || !this.ctx?.interactiveProps || this.ctx.interactiveProps.length === 0) {
      return false;
    }

    let bestProp: InteractivePropState | null = null;
    let bestScore = 0;

    for (const prop of this.ctx.interactiveProps) {
      const pt = prop.interactPoint ?? { x: prop.x, y: prop.y };
      const dist = Math.hypot(pt.x - this.body.x, pt.y - this.body.y);
      const isAttracting = prop.isActive;
      const maxRange = isAttracting ? Math.max(220, prop.attractRadius) : 185;
      if (dist > maxRange) continue;

      let affinity = this.breedProfile.behaviorAffinities.propCuriosity;
      if (prop.interactionType === 'warmth' || prop.interactionType === 'sunbeam') {
        affinity = this.personality.warmthAffinity;
      } else if (prop.interactionType === 'cozy' || prop.interactionType === 'knead') {
        affinity = this.breedProfile.behaviorAffinities.loafing;
      } else if (prop.interactionType === 'catnip' || prop.interactionType === 'play') {
        affinity = this.personality.playfulness + 0.3;
      }

      const proximityScore = 1 - dist / maxRange;
      const score = (isAttracting ? 1.8 : 0.45) * (0.4 + affinity) * (0.5 + proximityScore);
      if (score > bestScore) {
        bestScore = score;
        bestProp = prop;
      }
    }

    if (!bestProp) return false;
    if (bestScore < 0.55 && this.nextRand() > 0.25 + this.personality.curiosity * 0.35) {
      return false;
    }

    this.targetProp = bestProp;
    this.targetPropPoint = bestProp.interactPoint
      ? { ...bestProp.interactPoint }
      : { x: bestProp.x, y: bestProp.y };
    this.fsm.transition('PROP_INTERACT');
    return true;
  }

  private findBestWarmSpot(): Vec2 | null {
    const zones = this.ctx?.warmZones;
    if (zones && zones.length > 0) {
      let best: WarmZone | null = null;
      let bestScore = -Infinity;
      for (const z of zones) {
        if (z.intensity <= 0.1) continue;
        const dist = Math.hypot(z.x - this.body.x, z.y - this.body.y);
        const score = z.intensity * 300 - dist * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = z;
        }
      }
      if (best) {
        const ang = this.randRange(0, Math.PI * 2);
        const r = this.randRange(8, Math.max(12, best.radius * 0.48));
        return {
          x: best.x + Math.cos(ang) * r,
          y: best.y + Math.sin(ang) * r,
        };
      }
    }

    if (!this.ctx?.nightMode && this.ctx?.surfaceManager) {
      return this.ctx.surfaceManager.getRandomRugSpot(32);
    }
    return null;
  }

  private findNearestTreat(maxDist: number): DroppedTreat | null {
    const treats = this.ctx?.activeTreats;
    if (!treats || treats.length === 0) return null;
    let best: DroppedTreat | null = null;
    let bestD = maxDist;
    for (const t of treats) {
      if (t.remainingBites <= 0) continue;
      if (t.claimedByCatId !== null && t.claimedByCatId !== this.id) continue;
      const d = Math.hypot(t.x - this.body.x, t.y - this.body.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private resolveLiveTreat(): DroppedTreat | null {
    if (!this.targetTreat) return null;
    const treats = this.ctx?.activeTreats;
    if (treats) {
      const live = treats.find((t) => t.id === this.targetTreat?.id);
      if (live) {
        this.targetTreat = live;
        return live;
      }
      return null;
    }
    return this.targetTreat.remainingBites > 0 ? this.targetTreat : null;
  }

  private findNearestToy(maxDist: number): ToyEntityState | null {
    const toys = this.ctx?.toys;
    if (!toys || toys.length === 0) return null;
    let best: ToyEntityState | null = null;
    let bestD = maxDist;
    for (const t of toys) {
      if (!t.active || t.isScary || t.kind === 'cucumber') continue;
      if (t.isCarriedByCatId !== null && t.isCarriedByCatId !== this.id) continue;
      const d = Math.hypot(t.x - this.body.x, t.y - this.body.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private findGiftToy(): ToyEntityState | null {
    const toys = this.ctx?.toys;
    if (!toys) return null;
    return (
      toys.find(
        (t) =>
          t.active &&
          t.isCarriedByCatId === null &&
          (t.kind === 'mouse_toy' || t.kind === 'fish_toy'),
      ) ?? null
    );
  }

  private resolveLiveToy(): ToyEntityState | null {
    if (!this.targetToy) return null;
    const toys = this.ctx?.toys;
    if (toys) {
      const live = toys.find((t) => t.id === this.targetToy?.id);
      if (live) {
        this.targetToy = live;
        return live;
      }
      return null;
    }
    return this.targetToy.active ? this.targetToy : null;
  }

  private findNearestCritter(maxDist: number): AmbientCritter | null {
    const critters = this.ctx?.ambientCritters;
    if (!critters || critters.length === 0) return null;
    let best: AmbientCritter | null = null;
    let bestD = maxDist;
    for (const c of critters) {
      const d = Math.hypot(c.x - this.body.x, c.y - this.body.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private stepPendingIconPlay(dt: number): void {
    const play = this.pendingIconPlay;
    if (!play) return;
    this.headingForBox = false;
    const liveIcon = this.findObstacleById(play.icon.id) ?? play.icon;

    if (play.mode === 'perch') {
      if (this.ctx.occupiedIconIds?.has(liveIcon.id)) {
        this.pendingIconPlay = null;
        return;
      }
      const tx = liveIcon.x + liveIcon.width * 0.5;
      const ty = liveIcon.y + liveIcon.height * 0.36;
      const dist = Math.hypot(tx - this.body.x, ty - this.body.y);
      if (dist <= 145) {
        this.pendingIconPlay = null;
        this.targetIcon = { ...liveIcon };
        this.fsm.transition('JUMP_TO_ICON');
        return;
      }
      const rawAng = Math.atan2(ty - this.body.y, tx - this.body.x);
      const desiredAngle = this.computeObstacleAvoidanceAngle(rawAng, liveIcon.id);
      this.heading = lerpAngle(this.heading, desiredAngle, dt * 6.5);
      this.headAngle = lerpAngle(this.headAngle, rawAng, dt * 7.5);
      const accel = 145 * this.breedProfile.locomotion.walkSpeedMultiplier * 5.5;
      this.body.vx += Math.cos(this.heading) * accel * dt;
      this.body.vy += Math.sin(this.heading) * accel * dt;
      return;
    }

    const edgeX = clamp(this.body.x, liveIcon.x, liveIcon.x + liveIcon.width);
    const edgeY = clamp(this.body.y, liveIcon.y, liveIcon.y + liveIcon.height);
    const edgeDist = Math.hypot(edgeX - this.body.x, edgeY - this.body.y);
    if (edgeDist <= 42) {
      this.pendingIconPlay = null;
      this.targetIcon = { ...liveIcon };
      this.fsm.transition('SCRATCH_ICON');
      return;
    }
    const rawAng = Math.atan2(edgeY - this.body.y, edgeX - this.body.x);
    const desiredAngle = this.computeObstacleAvoidanceAngle(rawAng, liveIcon.id);
    this.heading = lerpAngle(this.heading, desiredAngle, dt * 6.5);
    this.headAngle = lerpAngle(this.headAngle, rawAng, dt * 7.5);
    const accel = 145 * this.breedProfile.locomotion.walkSpeedMultiplier * 5.5;
    this.body.vx += Math.cos(this.heading) * accel * dt;
    this.body.vy += Math.sin(this.heading) * accel * dt;
  }

  // ============================================================================
  // Box Exit Clearance & Obstacle Helpers
  // ============================================================================

  private computeBoxExitLanding(
    preferredAngle: number,
    box: CardboardBox | null | undefined,
  ): Vec2 {
    const cx = box ? box.getPosition().x : this.jumpStartPos.x;
    const cy = box ? box.getPosition().y : this.jumpStartPos.y;
    const boxRect = box?.isVisible() ? box.getExteriorObstacle() : undefined;
    const flapRect = box?.isVisible() ? box.getOuterFootprintWithFlaps() : undefined;

    const angleOffsets = [
      0,
      0.39, -0.39,
      0.79, -0.79,
      1.18, -1.18,
      1.57, -1.57,
      1.96, -1.96,
      2.36, -2.36,
      2.75, -2.75,
      Math.PI,
    ];
    const extraMargins = [18, 34, 52];
    const physics = this.ctx?.physics;
    const obstacles = physics?.getObstacles() ?? [];
    const sceneObs = this.ctx?.sceneObstacles ?? [];
    const minObsClear = this.body.radius + 6;
    const minBoxClear = this.body.radius + 14;
    const minFlapClear = this.body.radius + 4;

    let bestFallback: Vec2 | null = null;
    let bestScore = -Infinity;

    for (const margin of extraMargins) {
      for (const offset of angleOffsets) {
        const ang = preferredAngle + offset;
        const r = box
          ? box.getMinExitDistanceForAngle(ang, this.body.radius, margin)
          : 82 + margin;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;

        const probe: CircleBody = {
          x: px,
          y: py,
          vx: 0,
          vy: 0,
          radius: this.body.radius + 4,
        };
        if (physics && physics.clampToBounds(probe, 0) !== null) {
          continue;
        }

        let boxClear = Infinity;
        if (boxRect) {
          const bx = clamp(px, boxRect.x, boxRect.x + boxRect.width);
          const by = clamp(py, boxRect.y, boxRect.y + boxRect.height);
          boxClear = Math.hypot(px - bx, py - by) - minBoxClear;
        }
        if (flapRect) {
          const fx = clamp(px, flapRect.x, flapRect.x + flapRect.width);
          const fy = clamp(py, flapRect.y, flapRect.y + flapRect.height);
          boxClear = Math.min(boxClear, Math.hypot(px - fx, py - fy) - minFlapClear);
        }
        if (boxClear < 0) {
          continue;
        }

        let obsClear = Infinity;
        for (const obs of obstacles) {
          const ox = clamp(px, obs.x, obs.x + obs.width);
          const oy = clamp(py, obs.y, obs.y + obs.height);
          obsClear = Math.min(obsClear, Math.hypot(px - ox, py - oy) - minObsClear);
        }
        for (const obs of sceneObs) {
          const ox = clamp(px, obs.x, obs.x + obs.width);
          const oy = clamp(py, obs.y, obs.y + obs.height);
          obsClear = Math.min(obsClear, Math.hypot(px - ox, py - oy) - minObsClear);
        }

        if (obsClear >= 0) {
          return { x: px, y: py };
        }

        if (obsClear > bestScore) {
          bestScore = obsClear;
          bestFallback = { x: px, y: py };
        }
      }
    }

    if (bestFallback) {
      return bestFallback;
    }

    const bounds = physics?.getBounds() ?? { width: 1280, height: 720 };
    const toCenter = Math.atan2(bounds.height * 0.5 - cy, bounds.width * 0.5 - cx);
    const safeR = box
      ? box.getMinExitDistanceForAngle(toCenter, this.body.radius, 18)
      : 92;
    const probe: CircleBody = {
      x: cx + Math.cos(toCenter) * safeR,
      y: cy + Math.sin(toCenter) * safeR,
      vx: 0,
      vy: 0,
      radius: this.body.radius + 4,
    };
    physics?.clampToBounds(probe, 0);
    return { x: probe.x, y: probe.y };
  }

  private tryEnterBox(): boolean {
    const box = this.ctx.cardboardBox;
    if (!box || !box.isVisible() || box.occupantId !== null || this.boxCooldown > 0) {
      return false;
    }
    const bp = box.getPosition();
    const dist = Math.hypot(bp.x - this.body.x, bp.y - this.body.y);
    if (dist <= 104 && box.claim(this.id)) {
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
    this.iconCheckTimer = this.randRange(0.75, 1.5);

    const obstacles = this.ctx.physics.getObstacles();
    if (obstacles.length === 0) return false;

    const occupied = this.ctx.occupiedIconIds;
    let closestScratchIcon: AabbRect | null = null;
    let closestScratchDist = 46;
    let closestPerchIcon: AabbRect | null = null;
    let closestPerchDist = 145;

    for (const obs of obstacles) {
      if (occupied?.has(obs.id)) continue;

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

    if (closestScratchIcon && this.nextRand() < 0.42) {
      this.targetIcon = { ...closestScratchIcon };
      this.fsm.transition('SCRATCH_ICON');
      return true;
    }

    const perchProb = 0.32 + this.breedProfile.behaviorAffinities.perching * 0.35;
    if (closestPerchIcon && this.nextRand() < perchProb) {
      this.targetIcon = { ...closestPerchIcon };
      this.fsm.transition('JUMP_TO_ICON');
      return true;
    }

    return false;
  }

  private findObstacleById(iconId: number | null | undefined): AabbRect | null {
    if (iconId === null || iconId === undefined) return null;
    for (const obs of this.ctx.physics.getObstacles()) {
      if (obs.id === iconId) return obs;
    }
    return null;
  }

  private beginIconHopDown(icon: AabbRect | null): void {
    this.perchHopDownActive = true;
    this.perchHopDownTime = 0;
    this.jumpProgress = 0;
    this.jumpPeakZ = 38;
    this.jumpStartPos = { x: this.body.x, y: this.body.y };

    const preferredAngle = this.activeTarget
      ? Math.atan2(this.activeTarget.y - this.body.y, this.activeTarget.x - this.body.x)
      : normalizeAngle(this.heading + this.randRange(-0.8, 0.8));

    const clearDist = icon
      ? Math.max(icon.width, icon.height) * 0.5 + this.body.radius + 14
      : 66;

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
    const radii = [radius, radius + 16, radius + 34];
    const obstacles = this.ctx.physics.getObstacles();
    const sceneObs = this.ctx.sceneObstacles ?? [];
    const boxRect = this.ctx.cardboardBox?.isVisible()
      ? this.ctx.cardboardBox.getExteriorObstacle()
      : undefined;
    const minObsClear = this.body.radius + 6;
    const minAvoidClear = this.body.radius + 8;

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
        for (const obs of sceneObs) {
          const ox = clamp(px, obs.x, obs.x + obs.width);
          const oy = clamp(py, obs.y, obs.y + obs.height);
          minClear = Math.min(minClear, Math.hypot(px - ox, py - oy) - minObsClear);
        }
        if (boxRect) {
          const bx = clamp(px, boxRect.x, boxRect.x + boxRect.width);
          const by = clamp(py, boxRect.y, boxRect.y + boxRect.height);
          minClear = Math.min(minClear, Math.hypot(px - bx, py - by) - minAvoidClear);
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

    if (bestFallback) return bestFallback;

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
      (state === 'JUMP_TO_BOX' && this.jumpTakenOff) ||
      (state === 'JUMP_OUT_BOX' && this.jumpTakenOff) ||
      (state === 'JUMP_TO_ICON' && this.jumpTakenOff) ||
      (state === 'PERCH_ICON' && this.perchHopDownActive)
    );
  }

  private resolveLaserTarget(): LaserTarget | null {
    if (this.brain.isLaserBored()) return null;
    if (this.ctx.laserTarget) return this.ctx.laserTarget;
    if (this.ctx.laserTargets && this.ctx.laserTargets.length > 0) {
      return assignCatToLaserTarget(this.id, this.ctx.laserTargets);
    }
    return null;
  }

  private computeObstacleAvoidanceAngle(desiredAngle: number, ignoreIconId?: number): number {
    const lookAhead = 48;
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
      if (dist < this.body.radius + 14) {
        const pushX =
          dist > 0.01 ? dx / dist : Math.sign(this.body.x - (obs.x + obs.width * 0.5)) || 1;
        const pushY =
          dist > 0.01 ? dy / dist : Math.sign(this.body.y - (obs.y + obs.height * 0.5)) || 1;
        steerX += pushX * 1.9;
        steerY += pushY * 1.9;
      }
    };

    for (const obs of this.ctx.physics.getObstacles()) {
      if (ignoreIconId !== undefined && obs.id === ignoreIconId) continue;
      applyAvoidance(obs);
    }

    if (this.ctx.sceneObstacles) {
      for (const obs of this.ctx.sceneObstacles) {
        applyAvoidance(obs);
      }
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
      const batImpulse =
        this.fsm.state === 'POUNCE' || this.fsm.state === 'ZOOMIES'
          ? 340
          : Math.max(135, catSpeed * 1.15);
      yarn.nudge(nx * batImpulse, ny * batImpulse);
    }
  }

  private updateFacialIdleTimers(dt: number): void {
    if (this.blinkDuration > 0) {
      this.blinkDuration -= dt;
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkDuration = this.fsm.state === 'LOAFING' ? 0.24 : 0.13;
        this.blinkTimer = this.randRange(2.2, 5.8);
      }
    }

    this.earTwitchTimer -= dt;
    if (this.earTwitchTimer <= 0) {
      this.earTwitchTimer = this.randRange(1.6, 4.8);
      if (this.nextRand() < 0.5) {
        this.earTwitchLeft = 0.24;
      } else {
        this.earTwitchRight = 0.24;
      }
    }
    this.earTwitchLeft = Math.max(0, this.earTwitchLeft - dt * 1.8);
    this.earTwitchRight = Math.max(0, this.earTwitchRight - dt * 1.8);
  }

  // ============================================================================
  // Spine, Verlet Tail, Sleep Indicator & Pose Rendering
  // ============================================================================

  private updateSpineAndTail(dt: number): void {
    const state = this.fsm.state;
    const speed = Math.hypot(this.body.vx, this.body.vy);
    const isCurled =
      this.isSleeping() && this.sleepPose === 'curled' ||
      state === 'IN_BOX' ||
      (state === 'PERCH_ICON' && !this.perchHopDownActive) ||
      (state === 'PETTED' && (this.petInBoxHold || this.petOnIconHold));
    const isLoaf =
      state === 'LOAFING' ||
      state === 'KNEADING' ||
      (state === 'PROP_INTERACT' && this.propArrived && this.targetProp?.interactionType === 'cozy') ||
      (state === 'SOCIAL_PLAY' && this.socialMode === 'cuddle' && speed < 10);

    const loco = this.breedProfile.locomotion;
    const headSpec = this.breedProfile.anatomy.head;
    const tailSpec = this.breedProfile.anatomy.tail;
    const kittenScale = this.brain.isKitten() ? KITTEN_BODY_SCALE : 1;

    if (
      speed > 6 &&
      !isCurled &&
      state !== 'WIGGLE' &&
      state !== 'POUNCE_WIGGLE' &&
      state !== 'ROLL_BELLY' &&
      state !== 'MEERKAT_PEEK'
    ) {
      const velAngle = Math.atan2(this.body.vy, this.body.vx);
      if (state !== 'BONK') {
        this.heading = lerpAngle(this.heading, velAngle, dt * 8 * loco.turnAgility);
      }
      const zoomieBoost = state === 'ZOOMIES' ? 1.55 : 1;
      this.walkPhase +=
        (speed / 26) * dt * Math.PI * loco.strideFrequencyMultiplier * this.strideVariance * zoomieBoost;
    }

    let headLead = (isCurled || isLoaf ? headSpec.headLeadCurled : headSpec.headLeadWalk) * kittenScale;
    if (state === 'STRETCHING') {
      headLead += 6.5 * this.stretchFactor * kittenScale;
    } else if (state === 'MEERKAT_PEEK') {
      headLead = headSpec.headLeadCurled * 0.72 * kittenScale;
    } else if (state === 'GROOMING') {
      headLead = headSpec.headLeadCurled * 1.08 * kittenScale;
    }

    const headX = this.body.x + Math.cos(this.heading) * headLead;
    const headY = this.body.y + Math.sin(this.heading) * headLead;
    this.spine.moveHeadTo(headX, headY, this.heading);

    let hipOffsetX = 0;
    let hipOffsetY = 0;
    if (state === 'WIGGLE' || state === 'POUNCE_WIGGLE') {
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
    const tailAnchorX = hipsPos.x + Math.cos(tailBaseAngle) * tailSpec.rootOffset * kittenScale;
    const tailAnchorY = hipsPos.y + Math.sin(tailBaseAngle) * tailSpec.rootOffset * kittenScale;
    this.tail.setRoot(tailAnchorX, tailAnchorY);

    let swayAmp = 0.36;
    let swayFreq = 2.4;
    let restCurve = tailSpec.restCurveBias;

    if (state === 'STALK' || state === 'CHASE_LASER' || state === 'CHATTER') {
      swayAmp = 0.58;
      swayFreq = 9.5;
      restCurve = 0.06;
    } else if (state === 'OVERSTIMULATED') {
      swayAmp = 0.85;
      swayFreq = 12.0;
      restCurve = 0.1;
    } else if (state === 'ZOOMIES') {
      swayAmp = 0.45;
      swayFreq = 11.5;
      restCurve = 0.04;
    } else if (state === 'SCRATCH_ICON' || (state === 'PROP_INTERACT' && this.propArrived)) {
      swayAmp = 0.5;
      swayFreq = 7.2;
      restCurve = 0.12;
    } else if (state === 'PETTED' || state === 'ROLL_BELLY' || state === 'KNEADING') {
      swayAmp = 0.55;
      swayFreq = 4.4;
      restCurve = 0.34;
    } else if (state === 'STRETCHING') {
      swayAmp = 0.12;
      swayFreq = 2.0;
      restCurve = 0.04;
    } else if (state === 'PERCH_ICON' && !this.perchHopDownActive) {
      swayAmp = 0.14;
      swayFreq = 1.3;
      restCurve = 0.72;
    } else if (isCurled || isLoaf || this.isSleeping()) {
      swayAmp = state === 'DREAMING' ? 0.22 : 0.08;
      swayFreq = state === 'DREAMING' ? 3.2 : 1.1;
      restCurve = 0.72;
    } else if (
      state === 'POUNCE' ||
      state === 'STARTLED' ||
      state === 'CUCUMBER_SCARE' ||
      this.isMidJumpArc()
    ) {
      swayAmp = 0.16;
      swayFreq = 5.5;
      restCurve = 0;
    }

    const catCount = this.getEffectiveCatCount();
    const constraintIterations = catCount > 60 ? 2 : catCount > 30 ? 3 : 6;

    this.tail.update(dt, {
      swayAmp: swayAmp * tailSpec.swayAmpMultiplier,
      swayFreq: swayFreq * tailSpec.swayFreqMultiplier,
      time: this.time + this.noiseOffsetX * 0.1,
      rootAngle: tailBaseAngle,
      restCurve,
      constraintIterations,
    });
  }

  private resolveVisualPose(): {
    poseMode: CatPoseMode;
    eyeExpression: CatEyeExpression;
    earFlatten: number;
    puffFactor: number;
    isCurled: boolean;
    pupilDilation: number;
    whiskerTwitch: number;
  } {
    const state = this.fsm.state;
    const isBlinking = this.blinkDuration > 0;
    const isSleepingCurled = this.isSleeping() && this.sleepPose === 'curled';
    const isCurled =
      isSleepingCurled ||
      state === 'IN_BOX' ||
      (state === 'PERCH_ICON' && !this.perchHopDownActive) ||
      (state === 'PETTED' && (this.petInBoxHold || this.petOnIconHold));

    let poseMode: CatPoseMode = 'normal';
    if (isCurled) poseMode = 'curled';
    else if (this.isSleeping() && this.sleepPose === 'belly_up_sleep') poseMode = 'belly_up_sleep';
    else if (this.isSleeping() && this.sleepPose === 'sprawled') poseMode = 'sunbathe';
    else if (state === 'LOAFING') poseMode = 'loaf';
    else if (state === 'SLOW_BLINK') poseMode = 'slow_blink';
    else if (state === 'KNEADING') poseMode = 'kneading';
    else if (state === 'GROOMING') poseMode = 'groom';
    else if (state === 'STRETCHING') poseMode = this.stretchFactor > 0.35 ? 'stretch_yawn' : 'stretch';
    else if (state === 'FLEHMEN') poseMode = 'flehmen';
    else if (state === 'CHATTER') poseMode = 'chatter';
    else if (state === 'WIGGLE' || state === 'POUNCE_WIGGLE') poseMode = 'butt_wiggle';
    else if (state === 'CARRY_GIFT' && this.giftPickedUp) poseMode = 'carrying_toy';
    else if (state === 'ROLL_BELLY') poseMode = 'roll_belly';
    else if (state === 'MEERKAT_PEEK' || state === 'STARE_VOID') poseMode = 'meerkat';
    else if (state === 'SUNBATHE') poseMode = this.sunbatheArrived ? 'sunbathe' : 'normal';
    else if (state === 'ZOOMIES') poseMode = 'zoomies';
    else if (state === 'STALK' || state === 'CHASE_LASER') poseMode = 'stalk';
    else if (
      state === 'POUNCE' ||
      state === 'STARTLED' ||
      state === 'CUCUMBER_SCARE' ||
      this.isMidJumpArc()
    ) {
      poseMode = 'pounce';
    } else if (state === 'SCRATCH_ICON' || state === 'PAW_TEST') poseMode = 'scratch';
    else if (state === 'DRINKING' && this.drinkArrived) poseMode = 'drinking';
    else if (state === 'EATING_TREAT') poseMode = this.treatArrived ? 'eating' : 'normal';
    else if (
      state === 'SOCIAL_PLAY' &&
      this.socialMode === 'cuddle' &&
      Math.hypot(this.body.vx, this.body.vy) < 10
    ) {
      poseMode = 'loaf';
    } else if (state === 'PROP_INTERACT' && this.propArrived && this.targetProp) {
      const t = this.targetProp.interactionType;
      if (t === 'scratch' || t === 'water' || t === 'play') poseMode = 'scratch';
      else if (t === 'cozy') poseMode = 'loaf';
      else if (t === 'knead') poseMode = 'kneading';
      else if (t === 'catnip') poseMode = 'roll_belly';
      else if (t === 'drink') poseMode = 'drinking';
      else if (t === 'treat' || t === 'nibble') poseMode = 'eating';
      else if (t === 'warmth' || t === 'sunbeam') poseMode = 'sunbathe';
    }

    let eyeExpression: CatEyeExpression = 'normal';
    if (state === 'BONK') eyeExpression = 'dizzy';
    else if (state === 'SLOW_BLINK') eyeExpression = 'slow_blink';
    else if (state === 'STARTLED' || state === 'CUCUMBER_SCARE') eyeExpression = 'wide_startled';
    else if (this.isSleeping() || isBlinking) eyeExpression = 'closed';
    else if (
      state === 'PETTED' ||
      state === 'ROLL_BELLY' ||
      state === 'STRETCHING' ||
      state === 'GROOMING' ||
      state === 'KNEADING' ||
      state === 'HEAD_BUNT' ||
      (state === 'SOCIAL_PLAY' && this.socialMode === 'boop' && this.socialHeartEmitted)
    ) {
      eyeExpression = 'happy';
    } else if (
      state === 'LOAFING' ||
      (state === 'SUNBATHE' && this.sunbatheArrived) ||
      (state === 'PROP_INTERACT' && this.propArrived && this.targetProp?.interactionType === 'cozy')
    ) {
      eyeExpression = 'half_closed';
    } else if (
      state === 'STALK' ||
      state === 'CHASE_LASER' ||
      state === 'WIGGLE' ||
      state === 'POUNCE_WIGGLE' ||
      state === 'POUNCE' ||
      state === 'ZOOMIES' ||
      state === 'MEERKAT_PEEK' ||
      state === 'STARE_VOID' ||
      state === 'CHATTER' ||
      state === 'FLEHMEN' ||
      this.isMidJumpArc()
    ) {
      eyeExpression = 'dilated';
    }

    let earFlatten = 0;
    if (this.earPose === 'flat_back' || state === 'BONK' || state === 'STARTLED' || state === 'CUCUMBER_SCARE') {
      earFlatten = -0.42;
    } else if (this.earPose === 'airplane' || state === 'OVERSTIMULATED' || state === 'HAIRBALL') {
      earFlatten = -0.3;
    } else if (state === 'STALK' || state === 'CHASE_LASER' || state === 'ZOOMIES') {
      earFlatten = -0.26;
    } else if (
      this.earPose === 'forward' ||
      state === 'MEERKAT_PEEK' ||
      state === 'SNIFF_FILE' ||
      state === 'EATING_TREAT' ||
      state === 'CHATTER' ||
      state === 'STARE_VOID'
    ) {
      earFlatten = 0.22;
    }

    let puffFactor = 0;
    if (state === 'STARTLED' || state === 'CUCUMBER_SCARE') puffFactor = 1.0;
    else if (state === 'ZOOMIES') puffFactor = 0.92;
    else if (state === 'OVERSTIMULATED') puffFactor = 0.72;
    else if (state === 'POUNCE' || this.isMidJumpArc()) puffFactor = 0.35;

    const isExcited =
      eyeExpression === 'dilated' || eyeExpression === 'wide_startled';
    const pupilDilation = isExcited
      ? 0.9
      : this.ctx?.nightMode
        ? 0.82
        : poseMode === 'sunbathe'
          ? 0.22
          : 0.48;

    const whiskerTwitch =
      state === 'CHATTER' || state === 'DREAMING' || state === 'SNIFF_FILE'
        ? Math.sin(this.time * 26)
        : 0;

    return {
      poseMode,
      eyeExpression,
      earFlatten,
      puffFactor,
      isCurled,
      pupilDilation,
      whiskerTwitch,
    };
  }

  private updateSleepTextTransform(headPos?: Vec2): void {
    if (!this.isSleeping()) {
      this.sleepText.visible = false;
      return;
    }
    this.sleepText.visible = true;
    const hp = headPos ?? this.spine.head;
    const wave = Math.sin(this.time * 2.2 + this.paceModPhase);
    const floatY = -19 - Math.abs(wave) * 7;
    this.sleepText.position.set(hp.x + 8, hp.y + floatY);
    this.sleepText.scale.set((0.92 + wave * 0.08) * (this.brain.isKitten() ? 0.88 : 1));
    this.sleepText.alpha = 0.78 + wave * 0.2;
    this.sleepText.rotation = wave * 0.08;
  }

  private renderCat(): void {
    const state = this.fsm.state;
    const {
      poseMode,
      eyeExpression,
      earFlatten,
      puffFactor,
      isCurled,
      pupilDilation,
      whiskerTwitch,
    } = this.resolveVisualPose();
    const speed = Math.hypot(this.body.vx, this.body.vy);
    const cust = this.brain.getCustomization();
    const isKitten = cust.isKitten;
    const nearWarm = this.isNearWarmZone();
    const sunbeamWarmth = nearWarm ? 0.85 : 0.15;
    const rimLightIntensity = nearWarm ? 0.85 : this.ctx?.nightMode ? 0.25 : 0.45;

    const isCalm =
      isCurled ||
      poseMode === 'loaf' ||
      poseMode === 'sunbathe' ||
      this.isSleeping() ||
      state === 'IDLE';
    const breathFreq = state === 'DEEP_SLEEP' ? 1.45 : 2.3;
    const breath = isCalm ? Math.sin(this.time * breathFreq + this.paceModPhase) * 0.026 : 0;

    // Gentle purring vibration when petted, kneading, or belly-rolling
    const isPurring =
      state === 'PETTED' || state === 'KNEADING' || state === 'ROLL_BELLY';
    const purrVibeX = isPurring ? Math.sin(this.time * 42) * 0.42 : 0;
    const purrVibeY = isPurring ? Math.cos(this.time * 48) * 0.32 : 0;

    const isStepping =
      (state === 'WANDER' ||
        state === 'EATING_TREAT' ||
        state === 'SOCIAL_PLAY' ||
        state === 'PROP_INTERACT' ||
        state === 'PLAY_TOY' ||
        state === 'CARRY_GIFT' ||
        state === 'TASKBAR_WALK') &&
      speed > 16;
    const gaitHopPx = isStepping
      ? Math.abs(Math.sin(this.walkPhase)) * this.breedProfile.locomotion.hopBounceFactor * 7.5
      : 0;

    const totalElevationPx = this.zHeight + gaitHopPx;
    const zNorm = clamp(totalElevationPx / 48, 0, 1.45);
    const visualLiftY = -totalElevationPx * 0.68;
    const scaleZ = 1 + 0.22 * Math.min(1.25, zNorm);

    const stretchSx = poseMode === 'stretch' || poseMode === 'stretch_yawn' ? 1 + 0.14 * this.stretchFactor : 1;
    const stretchSy = poseMode === 'stretch' || poseMode === 'stretch_yawn' ? 1 - 0.08 * this.stretchFactor : 1;
    const sx =
      this.squashX *
      scaleZ *
      stretchSx *
      (poseMode === 'stalk' ? 1.07 : 1) *
      (1 + breath * 0.6);
    const sy =
      this.squashY *
      scaleZ *
      stretchSy *
      (poseMode === 'stalk' ? 0.91 : isCurled || poseMode === 'loaf' ? 1.06 : 1) *
      (1 + breath);

    const groundHead = this.spine.head;
    const groundTorso = this.spine.torso;

    let hipWiggleX = 0;
    let hipWiggleY = 0;
    if (state === 'WIGGLE' || state === 'POUNCE_WIGGLE') {
      const osc = Math.sin(this.fsm.stateTime * 12 * Math.PI * 2) * 5.2;
      hipWiggleX = -Math.sin(this.heading) * osc;
      hipWiggleY = Math.cos(this.heading) * osc;
    }
    const groundHips = {
      x: this.spine.hips.x + hipWiggleX,
      y: this.spine.hips.y + hipWiggleY,
    };

    const headPos = { x: groundHead.x + purrVibeX, y: groundHead.y + visualLiftY + purrVibeY };
    const torsoPos = { x: groundTorso.x + purrVibeX, y: groundTorso.y + visualLiftY + purrVibeY };
    const hipsPos = { x: groundHips.x, y: groundHips.y + visualLiftY };

    const torsoDir = this.unitVec(torsoPos, headPos, this.heading);
    const hipDir = this.unitVec(hipsPos, torsoPos, this.heading);
    const headDir = { x: Math.cos(this.headAngle), y: Math.sin(this.headAngle) };

    const spinePoints: SpineRenderPoints = {
      hips: hipsPos,
      torso: torsoPos,
      head: headPos,
      hipDir,
      torsoDir,
      headDir,
      bodyScaleX: sx,
      bodyScaleY: sy,
      isLoaf: isCurled || poseMode === 'loaf' || poseMode === 'slow_blink',
      poseMode,
      stretchFactor: this.stretchFactor,
      rollPhase: this.rollPhase,
      groomPhase: this.groomPhase,
      kneadPhase: this.kneadPhase,
      meerkatFactor: poseMode === 'meerkat' ? 1 : 0,
      time: this.time,
      isKitten,
      collarColor: cust.collarColor,
      hasBell: cust.hasBell,
      rimLightIntensity,
      sunbeamWarmth,
    };

    drawBreedShadow(
      this.shadowGraphics,
      this.breedProfile,
      groundHips,
      groundTorso,
      groundHead,
      clamp(totalElevationPx / 46, 0, 1.3),
      1 + 0.06 * Math.min(1.2, zNorm),
      poseMode,
      { isKitten },
    );

    this.bodyGraphics.clear();
    this.pawOverlayGraphics.clear();

    const liftedTailNodes = this.tail.nodes.map((n) => ({
      x: n.x,
      y: n.y + visualLiftY,
    }));
    drawBreedTail(this.bodyGraphics, this.breedProfile, this.coatProfile, liftedTailNodes, {
      puffFactor,
      isCurled,
      isKitten,
      rimLightIntensity,
      sunbeamWarmth,
      time: this.time,
    });

    const pawPhase =
      state === 'KNEADING'
        ? this.kneadPhase
        : state === 'DREAMING'
          ? this.time * 6.5
          : this.fsm.stateTime;

    const pawOptions = {
      poseMode,
      walkPhase: this.walkPhase,
      speed,
      isPounce: poseMode === 'pounce',
      isScratch: poseMode === 'scratch',
      scratchPhase: pawPhase,
      groomPhase: this.groomPhase,
      kneadPhase: this.kneadPhase,
      rollPhase: this.rollPhase,
      stretchFactor: this.stretchFactor,
      headPos,
      headAngle: this.headAngle,
      isKitten,
      time: this.time,
    };

    const pawsOverBody =
      poseMode === 'roll_belly' ||
      poseMode === 'belly_up_sleep' ||
      poseMode === 'meerkat' ||
      poseMode === 'groom';

    if (!isCurled && !pawsOverBody) {
      drawBreedPaws(this.bodyGraphics, this.breedProfile, this.coatProfile, spinePoints, pawOptions);
    }

    drawBreedBody(this.bodyGraphics, this.breedProfile, this.coatProfile, spinePoints);
    drawBodyMarkings(this.bodyGraphics, this.coatProfile, spinePoints, this.breedProfile);

    if (pawsOverBody) {
      const targetPawGfx =
        poseMode === 'groom' ? this.pawOverlayGraphics : this.bodyGraphics;
      drawBreedPaws(targetPawGfx, this.breedProfile, this.coatProfile, spinePoints, pawOptions);
    }

    const g = this.headGraphics;
    g.clear();
    g.position.set(headPos.x, headPos.y);
    g.rotation = this.headAngle;
    g.scale.set(this.squashX * scaleZ, this.squashY * scaleZ);

    drawBreedHead(g, this.breedProfile, this.coatProfile, {
      earFlatten,
      earPose: this.earPose,
      earTwitchLeft: this.earTwitchLeft,
      earTwitchRight: this.earTwitchRight,
      eyeExpression,
      pupilDilation,
      whiskerTwitch,
      isCurled,
      isKitten,
      nightMode: this.ctx?.nightMode ?? false,
      rimLightIntensity,
      sunbeamWarmth,
      carriedToyKind: poseMode === 'carrying_toy' ? (this.giftToy?.kind ?? 'mouse_toy') : null,
      time: this.time,
      poseMode,
      groomPhase: this.groomPhase,
    });

    this.updateSleepTextTransform(headPos);
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

/**
 * Hit-tests a pointer coordinate against a list of cats, prioritizing visually elevated
 * cats (jumping/perched) and top-most draw order.
 */
export function hitTestCat(cats: readonly CatEntity[], x: number, y: number): CatEntity | null {
  let bestElevated: CatEntity | null = null;
  let bestElevatedDist = Infinity;
  let bestGrounded: CatEntity | null = null;
  let bestGroundedDist = Infinity;

  for (let i = cats.length - 1; i >= 0; i--) {
    const cat = cats[i];
    if (!cat.containsPoint(x, y)) continue;
    const pos = cat.getPosition();
    const liftY = -cat.getZHeight() * 0.68;
    const d = Math.hypot(x - pos.x, y - (pos.y + liftY));

    if (cat.isElevated()) {
      if (d < bestElevatedDist) {
        bestElevatedDist = d;
        bestElevated = cat;
      }
    } else if (d < bestGroundedDist) {
      bestGroundedDist = d;
      bestGrounded = cat;
    }
  }

  return bestElevated ?? bestGrounded;
}

/**
 * Triggers a delightful mood- and breed-aware click reaction on a cat and returns
 * structured badge/toast metadata for the UI layer.
 */
export function onCatClicked(cat: CatEntity, isDoubleClick = false): CatClickReaction {
  return cat.handleClick(isDoubleClick);
}
