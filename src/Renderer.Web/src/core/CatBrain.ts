import {
  CAT_ARCHETYPES,
  CIRCADIAN_PHASES,
  type CatArchetype,
  type CatBreed,
  type CatCustomization,
  type CatMood,
  type CatNeeds,
  type CatPersonality,
  type CatSoundEvent,
  type CatStateName,
  type CircadianPhase,
  type InteractivePropState,
  type ToyEntityState,
} from '../types/simulation';

export const FRIENDSHIP_XP_THRESHOLDS = [0, 25, 70, 140, 240] as const;

const STORAGE_PREFIX = 'nekoscape.v2.friendship.';
const MEMORY_STORAGE_FALLBACK = new Map<string, string>();

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function hashUint32(input: number): number {
  let x = (input >>> 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Node/Vitest-safe localStorage reader with in-memory fallback.
 */
export function safeReadStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore restricted storage environments (e.g. sandboxed WebView or private mode)
  }
  return MEMORY_STORAGE_FALLBACK.get(key) ?? null;
}

/**
 * Node/Vitest-safe localStorage writer with in-memory fallback.
 */
export function safeWriteStorage(key: string, value: string): boolean {
  MEMORY_STORAGE_FALLBACK.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch {
    // Ignore storage write failure in headless/restricted environments
  }
  return false;
}

/**
 * Clears a persisted friendship entry (or all in-memory entries if omitted).
 */
export function clearFriendshipStorage(storageKey?: string): void {
  if (storageKey) {
    MEMORY_STORAGE_FALLBACK.delete(storageKey);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore
    }
    return;
  }
  MEMORY_STORAGE_FALLBACK.clear();
}

/**
 * Returns the crepuscular circadian phase for the current or supplied PC clock time:
 * - dawn (06:00–08:59): waking stretches, hungry meows near food bowls
 * - midday (09:00–16:59): sunbeam naps, cozy loafing, long grooming sessions
 * - dusk (17:00–21:59): peak twilight hunting, toys, chattering at birds/moths/fish
 * - night (22:00–05:59): sudden spontaneous 3am zoomies, abrupt halts & casual grooming
 */
export function getCircadianPhase(date: Date = new Date()): CircadianPhase {
  const hour = date.getHours();
  if (hour >= 6 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'dusk';
  return 'night';
}

export function getCircadianLabel(phase: CircadianPhase): string {
  switch (phase) {
    case 'dawn':
      return 'Dawn Stretch';
    case 'midday':
      return 'Sunbeam Midday';
    case 'dusk':
      return 'Twilight Hunt';
    case 'night':
      return 'Night Zoomies';
  }
}

export function isValidCircadianPhase(phase: string): phase is CircadianPhase {
  return (CIRCADIAN_PHASES as readonly string[]).includes(phase);
}

/**
 * Maps cumulative friendship XP into friendship level 1..5.
 */
export function xpToFriendshipLevel(xp: number): number {
  const safeXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let level = 1;
  for (let i = 1; i < FRIENDSHIP_XP_THRESHOLDS.length; i++) {
    if (safeXp >= FRIENDSHIP_XP_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  return clamp(level, 1, 5);
}

/**
 * Derives a deterministic personality archetype from seed, breed, traits, and kitten mode.
 */
export function deriveCatArchetype(
  seed: number,
  breed: CatBreed,
  personality: CatPersonality,
  isKitten = false,
): CatArchetype {
  const h = hashUint32(seed ^ 0x517cc1b7);
  const roll = (h % 1000) / 1000;

  if (isKitten && roll < 0.62) {
    return 'hyper_kitten';
  }

  const scores: Record<CatArchetype, number> = {
    lazy: personality.laziness * 1.15 + personality.warmthAffinity * 0.4,
    hyper_kitten: personality.zoomieProneness * 1.05 + personality.playfulness * 0.55 + (isKitten ? 0.65 : 0),
    aloof_senior: (1 - personality.sociability) * 0.9 + personality.laziness * 0.5,
    food_obsessed: 0.42 + personality.curiosity * 0.35 + (breed === 'british_shorthair' || breed === 'munchkin' ? 0.35 : 0),
    curious_hunter: personality.curiosity * 0.9 + personality.playfulness * 0.6,
    cuddlebug: personality.sociability * 1.1 + personality.warmthAffinity * 0.45,
  };

  if (breed === 'persian' || breed === 'ragdoll') {
    scores.lazy += 0.3;
    scores.cuddlebug += 0.25;
  } else if (breed === 'siamese' || breed === 'bengal' || breed === 'abyssinian') {
    scores.curious_hunter += 0.38;
    scores.hyper_kitten += 0.2;
  } else if (breed === 'russian_blue' || breed === 'scottish_fold') {
    scores.aloof_senior += 0.22;
    scores.cuddlebug += 0.15;
  } else if (breed === 'sphynx') {
    scores.cuddlebug += 0.36;
  }

  // Deterministic tie-breaker weighted by seed so cats of the same breed vary naturally
  let best: CatArchetype = CAT_ARCHETYPES[h % CAT_ARCHETYPES.length];
  let bestScore = -Infinity;
  for (let i = 0; i < CAT_ARCHETYPES.length; i++) {
    const arch = CAT_ARCHETYPES[i];
    const jitter = ((hashUint32(h ^ (i * 0x9e3779b1)) % 100) / 100) * 0.38;
    const total = scores[arch] + jitter;
    if (total > bestScore) {
      bestScore = total;
      best = arch;
    }
  }
  return best;
}

export interface PersistedFriendshipData {
  xp: number;
  level: number;
  pets: number;
  treats: number;
  plays: number;
}

export interface CatBrainOptions {
  catId: number;
  seed: number;
  breed: CatBreed;
  personality: CatPersonality;
  archetype?: CatArchetype;
  isKitten?: boolean;
  collarColor?: string | null;
  hasBell?: boolean;
  storageKey?: string;
  initialNeeds?: Partial<CatNeeds>;
}

export interface BrainTickContext {
  isOnWarmZone?: boolean;
  isOnRug?: boolean;
  nearOtherCat?: boolean;
  date?: Date;
}

export interface BrainDecisionContext {
  date?: Date;
  hasWarmSpot?: boolean;
  hasToys?: boolean;
  availableToys?: readonly ToyEntityState[];
  availableProps?: readonly InteractivePropState[];
  hasCritters?: boolean;
  hasWindowLedges?: boolean;
  hasPaperBag?: boolean;
  hasTapedSquare?: boolean;
  hasLitterBox?: boolean;
  hasWaterProp?: boolean;
  hasFoodProp?: boolean;
  hasOtherCats?: boolean;
  hasCursor?: boolean;
  isOnBlanketOrRug?: boolean;
}

export interface BrainInteractionResult {
  xpGained: number;
  leveledUp: boolean;
  friendshipLevel: number;
  friendshipXp: number;
  overstimulated: boolean;
  ignored: boolean;
  soundEvent?: CatSoundEvent;
}

export type BrainInteractionKind =
  | 'pet'
  | 'click'
  | 'treat'
  | 'play'
  | 'gift'
  | 'wake_startle';

/**
 * Pure TypeScript autonomous cat brain managing hidden needs, crepuscular rhythm,
 * personality archetypes, kitten behavior, friendship persistence, overstimulation,
 * laser boredom, and rare quirky feline events.
 */
export class CatBrain {
  readonly catId: number;
  readonly seed: number;
  readonly breed: CatBreed;
  readonly personality: CatPersonality;
  readonly storageKey: string;

  private archetype: CatArchetype;
  private customization: CatCustomization;
  private needs: CatNeeds;

  private prngState: number;
  private overstimulation = 0;
  private overstimulatedCooldown = 0;
  private rareEventCooldown = 14;
  private hairballCooldown = 85;
  private giftCooldown = 40;
  private laserChaseDuration = 0;
  private laserBoredCooldown = 0;
  private readonly laserBoredomThreshold: number;

  private petCount = 0;
  private treatCount = 0;
  private playCount = 0;

  constructor(options: CatBrainOptions) {
    this.catId = options.catId;
    this.seed = options.seed >>> 0 || 1;
    this.breed = options.breed;
    this.personality = { ...options.personality };
    this.prngState = hashUint32(this.seed ^ 0x7f4a7c15) || 1;
    this.storageKey = options.storageKey ?? `${STORAGE_PREFIX}cat_${this.catId}_${this.breed}`;

    const isKitten = Boolean(options.isKitten);
    this.archetype =
      options.archetype ??
      deriveCatArchetype(this.seed, this.breed, this.personality, isKitten);

    const saved = this.loadFriendship();
    this.customization = {
      collarColor: options.collarColor ?? null,
      hasBell: options.hasBell ?? true,
      isKitten,
      friendshipXp: saved?.xp ?? 0,
      friendshipLevel: saved?.level ?? 1,
    };
    this.petCount = saved?.pets ?? 0;
    this.treatCount = saved?.treats ?? 0;
    this.playCount = saved?.plays ?? 0;

    // Stagger starting needs per cat so cats never synchronize identically
    this.needs = {
      energy: clamp(options.initialNeeds?.energy ?? (58 + this.nextRand() * 34), 0, 100),
      hunger: clamp(options.initialNeeds?.hunger ?? (15 + this.nextRand() * 35), 0, 100),
      boredom: clamp(options.initialNeeds?.boredom ?? (18 + this.nextRand() * 38), 0, 100),
      comfort: clamp(options.initialNeeds?.comfort ?? (55 + this.nextRand() * 30), 0, 100),
      curiosity: clamp(options.initialNeeds?.curiosity ?? (35 + this.nextRand() * 45), 0, 100),
    };

    this.rareEventCooldown = 10 + this.nextRand() * 18;
    this.hairballCooldown = 65 + this.nextRand() * 90;
    this.giftCooldown = 25 + this.nextRand() * 35;
    this.laserBoredomThreshold = 8.0 + this.nextRand() * 4.2 - (this.archetype === 'lazy' ? 1.5 : 0);
  }

  private nextRand(): number {
    this.prngState = (this.prngState + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.prngState ^ (this.prngState >>> 15), 1 | this.prngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ==========================================================================
  // Inspection & Configuration API
  // ==========================================================================

  getNeeds(): CatNeeds {
    return { ...this.needs };
  }

  setNeeds(partial: Partial<CatNeeds>): void {
    if (partial.energy !== undefined) this.needs.energy = clamp(partial.energy, 0, 100);
    if (partial.hunger !== undefined) this.needs.hunger = clamp(partial.hunger, 0, 100);
    if (partial.boredom !== undefined) this.needs.boredom = clamp(partial.boredom, 0, 100);
    if (partial.comfort !== undefined) this.needs.comfort = clamp(partial.comfort, 0, 100);
    if (partial.curiosity !== undefined) this.needs.curiosity = clamp(partial.curiosity, 0, 100);
  }

  adjustNeeds(delta: Partial<CatNeeds>): void {
    this.setNeeds({
      energy: delta.energy !== undefined ? this.needs.energy + delta.energy : undefined,
      hunger: delta.hunger !== undefined ? this.needs.hunger + delta.hunger : undefined,
      boredom: delta.boredom !== undefined ? this.needs.boredom + delta.boredom : undefined,
      comfort: delta.comfort !== undefined ? this.needs.comfort + delta.comfort : undefined,
      curiosity: delta.curiosity !== undefined ? this.needs.curiosity + delta.curiosity : undefined,
    });
  }

  getArchetype(): CatArchetype {
    return this.archetype;
  }

  setArchetype(archetype: CatArchetype): void {
    this.archetype = archetype;
  }

  getCustomization(): CatCustomization {
    return { ...this.customization };
  }

  isKitten(): boolean {
    return this.customization.isKitten;
  }

  setKittenMode(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.customization.isKitten === next) return;
    this.customization.isKitten = next;
    if (next && this.nextRand() < 0.65) {
      this.archetype = 'hyper_kitten';
    } else if (!next && this.archetype === 'hyper_kitten') {
      this.archetype = deriveCatArchetype(this.seed, this.breed, this.personality, false);
    }
  }

  setCollar(collarColor: string | null, hasBell: boolean): void {
    this.customization.collarColor = collarColor;
    this.customization.hasBell = Boolean(hasBell);
  }

  getFriendshipLevel(): number {
    return this.customization.friendshipLevel;
  }

  getFriendshipXp(): number {
    return this.customization.friendshipXp;
  }

  getOverstimulation(): number {
    return this.overstimulation;
  }

  isOverstimulated(): boolean {
    return this.overstimulation >= 85;
  }

  isLaserBored(): boolean {
    return this.laserBoredCooldown > 0;
  }

  getCircadianPhase(date?: Date): CircadianPhase {
    return getCircadianPhase(date);
  }

  // ==========================================================================
  // Continuous Needs, Overstimulation & Laser Boredom Tick
  // ==========================================================================

  tick(dt: number, state: CatStateName, context: BrainTickContext = {}): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    if (safeDt <= 0) return;

    if (this.rareEventCooldown > 0) this.rareEventCooldown = Math.max(0, this.rareEventCooldown - safeDt);
    if (this.hairballCooldown > 0) this.hairballCooldown = Math.max(0, this.hairballCooldown - safeDt);
    if (this.giftCooldown > 0) this.giftCooldown = Math.max(0, this.giftCooldown - safeDt);
    if (this.overstimulatedCooldown > 0) {
      this.overstimulatedCooldown = Math.max(0, this.overstimulatedCooldown - safeDt);
    }
    if (this.laserBoredCooldown > 0) {
      this.laserBoredCooldown = Math.max(0, this.laserBoredCooldown - safeDt);
    }

    if (state !== 'PETTED') {
      const decayRate = state === 'OVERSTIMULATED' ? 28 : 11;
      this.overstimulation = Math.max(0, this.overstimulation - decayRate * safeDt);
    }

    const warmBonus = context.isOnWarmZone ? 1.5 : 0;
    const rugBonus = context.isOnRug ? 1.0 : 0;
    const kittenEnergyDrain = this.customization.isKitten ? 1.25 : 1.0;

    switch (state) {
      case 'NAP':
      case 'DEEP_SLEEP':
      case 'DREAMING':
        this.adjustNeeds({
          energy: (state === 'DEEP_SLEEP' ? 9.5 : 7.5) * safeDt,
          comfort: (4.2 + warmBonus + rugBonus) * safeDt,
          boredom: -1.4 * safeDt,
          hunger: 0.55 * safeDt,
        });
        break;

      case 'EATING_TREAT':
      case 'DRINKING':
        this.adjustNeeds({
          hunger: (state === 'EATING_TREAT' ? -24 : -8) * safeDt,
          comfort: 5.5 * safeDt,
          energy: 1.5 * safeDt,
          boredom: -3.5 * safeDt,
        });
        break;

      case 'ZOOMIES':
      case 'POUNCE':
      case 'PLAY_TOY':
      case 'CHASE_LASER':
      case 'STALK':
      case 'POUNCE_WIGGLE':
      case 'WIGGLE':
      case 'BAT_YARN':
      case 'PAPER_BAG_AMBUSH':
      case 'SOCIAL_PLAY':
        this.adjustNeeds({
          energy: -(state === 'ZOOMIES' ? 5.2 : 3.2) * kittenEnergyDrain * safeDt,
          boredom: -14 * safeDt,
          hunger: 1.5 * safeDt,
          curiosity: -3.8 * safeDt,
        });
        break;

      case 'PETTED':
      case 'LOAFING':
      case 'KNEADING':
      case 'SUNBATHE':
      case 'IN_BOX':
      case 'SLOW_BLINK':
      case 'HEAD_BUNT':
      case 'ROLL_BELLY':
      case 'GROOMING':
        this.adjustNeeds({
          comfort: (5.2 + warmBonus + rugBonus) * safeDt,
          energy: 1.8 * safeDt,
          boredom: state === 'PETTED' || state === 'KNEADING' ? -3.0 * safeDt : 0.9 * safeDt,
          hunger: 0.7 * safeDt,
        });
        break;

      case 'MEERKAT_PEEK':
      case 'SNIFF_FILE':
      case 'CHATTER':
      case 'STARE_VOID':
      case 'PAW_TEST':
      case 'TASKBAR_WALK':
      case 'PROP_INTERACT':
      case 'CARRY_GIFT':
        this.adjustNeeds({
          curiosity: -7.5 * safeDt,
          boredom: -4.8 * safeDt,
          energy: -1.1 * safeDt,
          hunger: 0.8 * safeDt,
        });
        break;

      default:
        this.adjustNeeds({
          boredom: (2.4 + (this.archetype === 'hyper_kitten' ? 1.1 : 0)) * safeDt,
          curiosity: 1.9 * safeDt,
          hunger: (0.85 + (this.archetype === 'food_obsessed' ? 0.5 : 0)) * safeDt,
          energy: -0.95 * kittenEnergyDrain * safeDt,
          comfort: (warmBonus - 0.35) * safeDt,
        });
        break;
    }

    if (context.nearOtherCat) {
      this.adjustNeeds({ comfort: 0.8 * safeDt, boredom: -0.8 * safeDt });
    }
  }

  /**
   * Tracks sustained laser chasing and triggers realistic laser boredom after ~8–12s.
   */
  trackLaserChase(dt: number, chasingLaser: boolean): boolean {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (!chasingLaser) {
      this.laserChaseDuration = Math.max(0, this.laserChaseDuration - safeDt * 0.45);
      return false;
    }
    this.laserChaseDuration += safeDt;
    if (this.laserChaseDuration >= this.laserBoredomThreshold) {
      this.laserChaseDuration = 0;
      this.laserBoredCooldown = 11 + this.nextRand() * 7;
      this.adjustNeeds({ boredom: 8, energy: -4 });
      return true;
    }
    return false;
  }

  // ==========================================================================
  // Friendship, Overstimulation & Ignore-User Mechanics
  // ==========================================================================

  recordInteraction(
    kind: BrainInteractionKind,
    amountMultiplier = 1,
  ): BrainInteractionResult {
    const mult = Math.max(0.2, Number.isFinite(amountMultiplier) ? amountMultiplier : 1);

    if (kind === 'wake_startle') {
      this.overstimulation = clamp(this.overstimulation + 14 * mult, 0, 100);
      this.adjustNeeds({ comfort: -6, energy: 4 });
      return {
        xpGained: 0,
        leveledUp: false,
        friendshipLevel: this.customization.friendshipLevel,
        friendshipXp: this.customization.friendshipXp,
        overstimulated: false,
        ignored: false,
        soundEvent: 'startle',
      };
    }

    // Over-petting buildup
    if (kind === 'pet' || kind === 'click') {
      const tolerance =
        (this.archetype === 'cuddlebug' ? 0.65 : this.archetype === 'aloof_senior' ? 1.45 : 1.0) *
        (1.08 - (this.customization.friendshipLevel - 1) * 0.08);
      const irritationDelta = (kind === 'click' ? 22 : 16) * tolerance * mult;
      this.overstimulation = clamp(this.overstimulation + irritationDelta, 0, 100);

      if (this.overstimulation >= 85 && this.overstimulatedCooldown <= 0) {
        this.overstimulation = 68;
        this.overstimulatedCooldown = 7.5;
        this.adjustNeeds({ comfort: -8 });
        return {
          xpGained: 0,
          leveledUp: false,
          friendshipLevel: this.customization.friendshipLevel,
          friendshipXp: this.customization.friendshipXp,
          overstimulated: true,
          ignored: false,
          soundEvent: 'chirp',
        };
      }

      // Aloof cats or low-friendship cats occasionally ignore the user!
      const ignoreChance =
        this.archetype === 'aloof_senior'
          ? 0.22
          : this.customization.friendshipLevel <= 1
            ? 0.08
            : 0.03;
      if (kind === 'click' && this.nextRand() < ignoreChance) {
        return {
          xpGained: 1,
          leveledUp: this.grantXp(1),
          friendshipLevel: this.customization.friendshipLevel,
          friendshipXp: this.customization.friendshipXp,
          overstimulated: false,
          ignored: true,
        };
      }
    }

    let xpGain = 0;
    let soundEvent: CatSoundEvent | undefined;
    switch (kind) {
      case 'pet':
        xpGain = Math.round(4 * mult);
        this.petCount++;
        this.adjustNeeds({ comfort: 7, boredom: -4 });
        soundEvent = 'purr';
        break;
      case 'click':
        xpGain = Math.round(6 * mult);
        this.petCount++;
        this.adjustNeeds({ comfort: 5, boredom: -5 });
        soundEvent = this.customization.isKitten ? 'kitten_mew' : 'purr';
        break;
      case 'treat':
        xpGain = Math.round(12 * mult);
        this.treatCount++;
        this.adjustNeeds({ hunger: -24, comfort: 10 });
        soundEvent = 'crunch';
        break;
      case 'play':
        xpGain = Math.round(7 * mult);
        this.playCount++;
        this.adjustNeeds({ boredom: -14, comfort: 4 });
        soundEvent = 'chirp';
        break;
      case 'gift':
        xpGain = Math.round(14 * mult);
        this.adjustNeeds({ comfort: 12, boredom: -8 });
        soundEvent = 'trill';
        break;
    }

    const leveledUp = this.grantXp(xpGain);
    return {
      xpGained: xpGain,
      leveledUp,
      friendshipLevel: this.customization.friendshipLevel,
      friendshipXp: this.customization.friendshipXp,
      overstimulated: false,
      ignored: false,
      soundEvent,
    };
  }

  /**
   * Accumulates continuous gentle petting irritation and friendship XP.
   */
  recordContinuousPet(dt: number): { overstimulated: boolean; xpGained: number } {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    if (safeDt <= 0) return { overstimulated: false, xpGained: 0 };

    const tolerance =
      this.archetype === 'cuddlebug' ? 0.58 : this.archetype === 'aloof_senior' ? 1.5 : 1.0;
    this.overstimulation = clamp(this.overstimulation + 18 * tolerance * safeDt, 0, 100);
    if (this.overstimulation >= 85 && this.overstimulatedCooldown <= 0) {
      this.overstimulation = 65;
      this.overstimulatedCooldown = 7.5;
      return { overstimulated: true, xpGained: 0 };
    }
    return { overstimulated: false, xpGained: 0 };
  }

  private grantXp(xpGain: number): boolean {
    if (xpGain <= 0) return false;
    const prevLevel = this.customization.friendshipLevel;
    this.customization.friendshipXp += xpGain;
    const nextLevel = xpToFriendshipLevel(this.customization.friendshipXp);
    this.customization.friendshipLevel = nextLevel;
    this.saveFriendship();
    return nextLevel > prevLevel;
  }

  private saveFriendship(): void {
    const payload: PersistedFriendshipData = {
      xp: this.customization.friendshipXp,
      level: this.customization.friendshipLevel,
      pets: this.petCount,
      treats: this.treatCount,
      plays: this.playCount,
    };
    safeWriteStorage(this.storageKey, JSON.stringify(payload));
  }

  private loadFriendship(): PersistedFriendshipData | null {
    const raw = safeReadStorage(this.storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedFriendshipData>;
      const xp = typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) ? Math.max(0, parsed.xp) : 0;
      const level = xpToFriendshipLevel(xp);
      return {
        xp,
        level,
        pets: typeof parsed.pets === 'number' ? Math.max(0, parsed.pets) : 0,
        treats: typeof parsed.treats === 'number' ? Math.max(0, parsed.treats) : 0,
        plays: typeof parsed.plays === 'number' ? Math.max(0, parsed.plays) : 0,
      };
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Rare Event Scheduler & Autonomous Decision Engine
  // ==========================================================================

  tryPickRareEvent(context: BrainDecisionContext = {}): CatStateName | null {
    if (this.rareEventCooldown > 0) return null;

    // Schedule next cooldown regardless of whether an event fires so it stays pleasantly rare
    this.rareEventCooldown = 16 + this.nextRand() * 22;

    const roll = this.nextRand();
    const hasGiftToy = Boolean(
      context.availableToys?.some(
        (t) =>
          t.active &&
          t.isCarriedByCatId === null &&
          (t.kind === 'mouse_toy' || t.kind === 'fish_toy'),
      ),
    );

    if (
      this.customization.friendshipLevel >= 2 &&
      this.giftCooldown <= 0 &&
      hasGiftToy &&
      roll < 0.28
    ) {
      this.giftCooldown = 50 + this.nextRand() * 45;
      return 'CARRY_GIFT';
    }

    if (this.hairballCooldown <= 0 && roll < 0.08) {
      this.hairballCooldown = 95 + this.nextRand() * 90;
      return 'HAIRBALL';
    }

    if (roll < 0.25 + (this.customization.isKitten ? 0.14 : 0)) {
      return 'TRIP_RECOVER';
    }
    if (roll < 0.45) {
      return 'SNEEZE_HICCUP';
    }
    if (roll < 0.72) {
      return 'STARE_VOID';
    }
    if (roll < 0.9) {
      return 'FLEHMEN';
    }
    return null;
  }

  /**
   * Selects the next autonomous state using hidden needs, PC circadian phase,
   * personality archetype, kitten mode, friendship level, and available world stimuli.
   */
  chooseNextBehavior(context: BrainDecisionContext = {}): CatStateName {
    const phase = getCircadianPhase(context.date);
    const n = this.needs;
    const p = this.personality;
    const arch = this.archetype;
    const lvl = this.customization.friendshipLevel;

    // Kitten sudden mid-play crash!
    if (this.customization.isKitten && n.energy < 28 && this.nextRand() < 0.55) {
      return 'NAP';
    }

    // Rare quirky event check
    const rare = this.tryPickRareEvent(context);
    if (rare) {
      return rare;
    }

    const weights = new Map<CatStateName, number>();
    const addWeight = (state: CatStateName, w: number) => {
      if (w <= 0) return;
      weights.set(state, (weights.get(state) ?? 0) + w);
    };

    // Baseline feline behaviors
    addWeight('WANDER', 1.4 + (1 - p.laziness) * 0.8 + (n.boredom / 100) * 0.7);
    addWeight('IDLE', 0.85 + p.laziness * 0.5);
    addWeight('GROOMING', 0.65 + (n.comfort / 100) * 0.35);
    addWeight('LOAFING', 0.6 + p.laziness * 0.75 + (1 - n.energy / 100) * 0.9);
    addWeight('STRETCHING', 0.45 + (phase === 'dawn' ? 0.9 : 0.1));
    addWeight('MEERKAT_PEEK', 0.35 + p.curiosity * 0.65 + (n.curiosity / 100) * 0.5);
    addWeight('ROLL_BELLY', 0.3 + p.playfulness * 0.4 + (lvl - 1) * 0.22);
    addWeight('STARE_VOID', 0.14 + (n.curiosity / 100) * 0.25);

    if (context.isOnBlanketOrRug) {
      addWeight('KNEADING', 0.55 + (lvl - 1) * 0.25 + (arch === 'cuddlebug' ? 0.65 : 0));
    }

    if (context.hasCursor && lvl >= 2) {
      addWeight('SLOW_BLINK', 0.32 + (lvl - 1) * 0.28);
    }

    if (context.hasWarmSpot) {
      addWeight('SUNBATHE', 0.55 + p.warmthAffinity * 0.9 + (phase === 'midday' ? 0.95 : 0));
    }

    if (context.hasToys) {
      addWeight('PLAY_TOY', 1.15 + p.playfulness * 0.9 + (n.boredom / 100) * 0.9);
      addWeight('POUNCE_WIGGLE', 0.55 + p.playfulness * 0.65);
      addWeight('PAW_TEST', 0.28 + p.curiosity * 0.4);
    }

    if (context.hasPaperBag) {
      addWeight('PAPER_BAG_AMBUSH', 0.65 + p.playfulness * 0.5);
    }

    if (context.hasCritters) {
      addWeight('CHATTER', 0.9 + p.curiosity * 0.7 + (phase === 'dusk' ? 0.85 : 0));
    }

    if (context.hasWaterProp) {
      addWeight('DRINKING', 0.38 + (n.hunger / 100) * 0.5 + (phase === 'dawn' ? 0.4 : 0));
      addWeight('PAW_TEST', 0.22 + p.curiosity * 0.3);
    }

    if (context.hasLitterBox) {
      addWeight('LITTER_USE', 0.25 + (n.hunger < 40 ? 0.2 : 0));
    }

    if (context.hasFoodProp && n.hunger > 45) {
      addWeight('PROP_INTERACT', 0.9 + (n.hunger / 100) * 1.4);
    }

    if (context.hasWindowLedges) {
      addWeight('TASKBAR_WALK', 0.6 + p.curiosity * 0.55);
    }

    if (context.availableProps && context.availableProps.length > 0) {
      addWeight('HEAD_BUNT', 0.35 + (lvl - 1) * 0.2 + (arch === 'cuddlebug' ? 0.5 : 0));
      addWeight('PROP_INTERACT', 0.65 + p.curiosity * 0.55);
    }

    if (context.hasOtherCats) {
      addWeight('SOCIAL_PLAY', 0.45 + p.sociability * 0.7);
    }

    // Energy-driven sleep need
    if (n.energy < 32) {
      addWeight('NAP', (35 - n.energy) * 0.08 + (phase === 'midday' ? 0.75 : 0));
    }

    // Circadian multipliers
    if (phase === 'dawn') {
      addWeight('STRETCHING', 0.95);
      addWeight('DRINKING', 0.45);
      addWeight('HEAD_BUNT', 0.35);
    } else if (phase === 'midday') {
      addWeight('SUNBATHE', 0.95);
      addWeight('NAP', 0.8);
      addWeight('GROOMING', 0.7);
      addWeight('LOAFING', 0.65);
    } else if (phase === 'dusk') {
      addWeight('PLAY_TOY', 0.95);
      addWeight('POUNCE_WIGGLE', 0.7);
      addWeight('CHATTER', 0.75);
    } else if (phase === 'night') {
      addWeight('ZOOMIES', 1.15 + p.zoomieProneness * 0.85);
      addWeight('STARE_VOID', 0.4);
      addWeight('GROOMING', 0.45);
    }

    // Boredom-driven zoomies
    if (n.boredom > 60) {
      addWeight('ZOOMIES', 0.65 + p.zoomieProneness * 0.75 + (n.boredom - 60) * 0.03);
    }

    // Archetype biases
    switch (arch) {
      case 'lazy':
        addWeight('NAP', 0.85);
        addWeight('LOAFING', 0.95);
        addWeight('SUNBATHE', 0.75);
        break;
      case 'hyper_kitten':
        addWeight('ZOOMIES', 1.05);
        addWeight('PLAY_TOY', 0.95);
        addWeight('POUNCE_WIGGLE', 0.65);
        break;
      case 'aloof_senior':
        addWeight('LOAFING', 0.85);
        addWeight('GROOMING', 0.85);
        addWeight('STARE_VOID', 0.45);
        break;
      case 'food_obsessed':
        addWeight('DRINKING', 0.55);
        addWeight('HEAD_BUNT', 0.55);
        if (context.hasFoodProp) addWeight('PROP_INTERACT', 1.1);
        break;
      case 'curious_hunter':
        addWeight('CHATTER', 0.75);
        addWeight('POUNCE_WIGGLE', 0.7);
        addWeight('PAW_TEST', 0.5);
        addWeight('TASKBAR_WALK', 0.5);
        break;
      case 'cuddlebug':
        addWeight('KNEADING', 0.85);
        addWeight('ROLL_BELLY', 0.85);
        addWeight('SLOW_BLINK', 0.65);
        addWeight('HEAD_BUNT', 0.7);
        break;
    }

    let total = 0;
    for (const w of weights.values()) total += w;
    if (total <= 0) return 'WANDER';

    let roll = this.nextRand() * total;
    for (const [state, w] of weights.entries()) {
      roll -= w;
      if (roll <= 0) return state;
    }
    return 'WANDER';
  }

  getMoodHint(state: CatStateName): CatMood {
    if (this.isOverstimulated() || state === 'OVERSTIMULATED' || state === 'IGNORE_USER') {
      return 'irritated';
    }
    if (state === 'DREAMING') return 'dreaming';
    if (state === 'NAP' || state === 'DEEP_SLEEP') return 'sleepy';
    if (
      state === 'STALK' ||
      state === 'WIGGLE' ||
      state === 'POUNCE' ||
      state === 'POUNCE_WIGGLE' ||
      state === 'CHATTER' ||
      state === 'PAPER_BAG_AMBUSH'
    ) {
      return 'hunting';
    }
    if (state === 'STARTLED' || state === 'CUCUMBER_SCARE' || state === 'BONK') {
      return 'startled';
    }
    if (state === 'ZOOMIES') return 'zoomy';
    if (
      state === 'PETTED' ||
      state === 'ROLL_BELLY' ||
      state === 'KNEADING' ||
      state === 'SLOW_BLINK' ||
      state === 'HEAD_BUNT' ||
      state === 'CARRY_GIFT'
    ) {
      return 'affectionate';
    }
    if (
      state === 'MEERKAT_PEEK' ||
      state === 'SNIFF_FILE' ||
      state === 'STARE_VOID' ||
      state === 'FLEHMEN' ||
      state === 'PAW_TEST' ||
      state === 'TASKBAR_WALK'
    ) {
      return 'curious';
    }
    if (state === 'PLAY_TOY' || state === 'BAT_YARN' || state === 'EATING_TREAT') {
      return 'playful';
    }
    return 'content';
  }
}
