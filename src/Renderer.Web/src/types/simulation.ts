export interface Vec2 {
  x: number;
  y: number;
}

export interface AabbRect {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  isRecycleBin?: boolean;
}

export interface RugBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

export type SurfaceType = 'hardwood' | 'rug';

export const FRICTION_HARDWOOD = 0.82;
export const FRICTION_RUG = 0.96;

/**
 * Six distinct real-life cat breeds with unique anatomy, locomotion, coats, and personality priors.
 */
export type CatBreed =
  | 'persian'
  | 'siamese'
  | 'british_shorthair'
  | 'munchkin'
  | 'sphynx'
  | 'domestic_shorthair';

export const CAT_BREEDS: readonly CatBreed[] = [
  'persian',
  'siamese',
  'british_shorthair',
  'munchkin',
  'sphynx',
  'domestic_shorthair',
] as const;

export type CatBreedMode = 'mix' | CatBreed;

export const CAT_BREED_MODES: readonly CatBreedMode[] = [
  'mix',
  ...CAT_BREEDS,
] as const;

export const CAT_BREED_LABELS: Readonly<Record<CatBreed, string>> = {
  persian: 'Persian',
  siamese: 'Siamese',
  british_shorthair: 'British Shorthair',
  munchkin: 'Munchkin',
  sphynx: 'Sphynx',
  domestic_shorthair: 'Domestic Shorthair',
};

/** Legacy coat identifiers preserved for backward-compatible normalization of persisted settings. */
export type LegacyCatBreed =
  | 'calico'
  | 'tuxedo'
  | 'black'
  | 'blue-grey'
  | 'orange-tabby';

export function normalizeCatBreed(
  value: unknown,
  fallback: CatBreed = 'domestic_shorthair',
): CatBreed {
  if (typeof value !== 'string') {
    return fallback;
  }
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((CAT_BREEDS as readonly string[]).includes(key)) {
    return key as CatBreed;
  }
  switch (key) {
    case 'blue_grey':
    case 'british':
    case 'bsh':
      return 'british_shorthair';
    case 'calico':
      return 'persian';
    case 'tuxedo':
      return 'munchkin';
    case 'black':
    case 'orange_tabby':
    case 'tabby':
    case 'dsh':
      return 'domestic_shorthair';
    default:
      return fallback;
  }
}

export function normalizeBreedMode(value: unknown): CatBreedMode {
  if (typeof value !== 'string') {
    return 'mix';
  }
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === '' || key === 'mix' || key === 'all' || key === 'mixed') {
    return 'mix';
  }
  if ((CAT_BREEDS as readonly string[]).includes(key)) {
    return key as CatBreed;
  }
  if (
    key === 'blue_grey' ||
    key === 'calico' ||
    key === 'tuxedo' ||
    key === 'black' ||
    key === 'orange_tabby'
  ) {
    return normalizeCatBreed(key);
  }
  return 'mix';
}

export type CatStateName =
  | 'IDLE'
  | 'WANDER'
  | 'STALK'
  | 'WIGGLE'
  | 'POUNCE'
  | 'BONK'
  | 'NAP'
  | 'PETTED'
  | 'STARTLED'
  | 'IN_BOX'
  | 'JUMP_TO_BOX'
  | 'JUMP_OUT_BOX'
  | 'JUMP_TO_ICON'
  | 'PERCH_ICON'
  | 'SCRATCH_ICON'
  | 'GROOMING'
  | 'LOAFING'
  | 'STRETCHING'
  | 'ZOOMIES'
  | 'ROLL_BELLY'
  | 'SOCIAL_PLAY'
  | 'PROP_INTERACT'
  | 'SUNBATHE'
  | 'EATING_TREAT'
  | 'MEERKAT_PEEK'
  | 'CHASE_LASER'
  | 'BAT_YARN'
  | 'SNIFF_FILE';

export type CatState = CatStateName;

export const CAT_STATES: readonly CatStateName[] = [
  'IDLE',
  'WANDER',
  'STALK',
  'WIGGLE',
  'POUNCE',
  'BONK',
  'NAP',
  'PETTED',
  'STARTLED',
  'IN_BOX',
  'JUMP_TO_BOX',
  'JUMP_OUT_BOX',
  'JUMP_TO_ICON',
  'PERCH_ICON',
  'SCRATCH_ICON',
  'GROOMING',
  'LOAFING',
  'STRETCHING',
  'ZOOMIES',
  'ROLL_BELLY',
  'SOCIAL_PLAY',
  'PROP_INTERACT',
  'SUNBATHE',
  'EATING_TREAT',
  'MEERKAT_PEEK',
  'CHASE_LASER',
  'BAT_YARN',
  'SNIFF_FILE',
] as const;

export interface CatPersonality {
  curiosity: number;
  playfulness: number;
  laziness: number;
  sociability: number;
  zoomieProneness: number;
  warmthAffinity: number;
}

export type CatMood =
  | 'content'
  | 'curious'
  | 'playful'
  | 'sleepy'
  | 'affectionate'
  | 'zoomy'
  | 'startled';

export interface CatIdentity {
  id: number;
  name: string;
  breed: CatBreed;
  breedLabel: string;
  coatVariantIndex: number;
  personality: CatPersonality;
  mood: CatMood;
  activePropId: string | null;
}

export interface CatClickReaction {
  catId: number;
  name: string;
  breed: CatBreed;
  breedLabel: string;
  mood: CatMood;
  state: CatStateName;
  caption: string;
  x: number;
  y: number;
}

export interface InteractionToastPayload {
  kind: 'cat' | 'prop' | 'treat';
  title: string;
  subtitle: string;
  x?: number;
  y?: number;
  durationMs?: number;
}

export type PropInteractionType =
  | 'warmth'
  | 'scratch'
  | 'cozy'
  | 'play'
  | 'water'
  | 'sniff'
  | 'catnip'
  | 'treat';

export type PropKind =
  | 'brass_lamp'
  | 'coffee_mug'
  | 'leather_journal'
  | 'monstera_scratcher'
  | 'velvet_cat_bed'
  | 'feeding_station'
  | 'andon_lantern'
  | 'tetsubin_tea'
  | 'zabuton_cushion'
  | 'bamboo_clacker'
  | 'origami_crane'
  | 'pine_bonsai'
  | 'koi_birdbath'
  | 'catnip_planter'
  | 'butterfly_stone'
  | 'wind_chime'
  | 'picnic_blanket'
  | 'cat_tree_tower'
  | 'treat_jar'
  | 'latte_saucer'
  | 'donut_cat_bed'
  | 'dropped_treat'
  | 'ambient_butterfly'
  | 'ambient_firefly';

export type PropParticleHint =
  | 'sparkle'
  | 'heart'
  | 'splash'
  | 'crumb'
  | 'steam'
  | 'leaf'
  | 'chime'
  | 'dust'
  | 'catnip'
  | 'ripple'
  | 'note';

export interface PropParticleBurst {
  kind: PropParticleHint;
  x: number;
  y: number;
  count?: number;
  color?: number;
}

export interface PropDefinition {
  id: string;
  kind: PropKind;
  label: string;
  scene: SceneTheme;
  x: number;
  y: number;
  radius: number;
  interactionType: PropInteractionType;
  solid?: boolean;
  interactPoint?: Vec2;
  attractRadius: number;
  warmRadius?: number;
}

export interface InteractivePropState extends PropDefinition {
  isActive: boolean;
  attractUntil: number;
  hovered: boolean;
  cooldownUntil: number;
  charges?: number;
  occupantCatIds?: readonly number[];
  hitTest(x: number, y: number): boolean;
}

export interface PropHitResult {
  prop: InteractivePropState;
  label: string;
  feedbackText: string;
  interactionType: PropInteractionType;
  attractPoint: Vec2;
  attractRadius: number;
  attractDurationSec: number;
  particles: readonly PropParticleBurst[];
  spawnedTreatPoint?: Vec2;
  spawnedCritter?: 'butterfly' | 'firefly';
}

export interface WarmZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
}

export interface DroppedTreat {
  id: string;
  x: number;
  y: number;
  radius: number;
  remainingBites: number;
  spawnedAt: number;
  claimedByCatId: number | null;
}

export interface AmbientCritter {
  id: string;
  kind: 'butterfly' | 'firefly';
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface LaserTarget {
  id: string;
  x: number;
  y: number;
  color: number;
  isSplitBeam: boolean;
}

export type LightingMode = 'auto' | 'day' | 'golden' | 'night';

export type EffectiveLightingMode = 'day' | 'golden' | 'night';

export type SceneTheme = 'study' | 'tatami' | 'garden' | 'cafe';

export const SCENE_THEMES: readonly SceneTheme[] = [
  'study',
  'tatami',
  'garden',
  'cafe',
] as const;

export interface NekoSettings {
  catCount: number;
  fpsCap: number;
  showHud: boolean;
  showToyDock: boolean;
  debugMode: boolean;
  enableLaserHotkey: boolean;
  enableShellReactions: boolean;
  launchAtStartup: boolean;
  idleNapMinutes: number;
  lightingMode: LightingMode;
  sceneTheme: SceneTheme;
  breedMode: CatBreedMode;
  showSceneProps: boolean;
}

export const DEFAULT_SETTINGS: Readonly<NekoSettings> = {
  catCount: 6,
  fpsCap: 60,
  showHud: false,
  showToyDock: true,
  debugMode: false,
  enableLaserHotkey: true,
  enableShellReactions: true,
  launchAtStartup: false,
  idleNapMinutes: 5,
  lightingMode: 'golden',
  sceneTheme: 'study',
  breedMode: 'mix',
  showSceneProps: true,
};

export interface ToyDockCallbacks {
  onSelectScene: (theme: SceneTheme) => void;
  onSelectLighting: (mode: LightingMode) => void;
  onToggleLaser: () => void;
  onTossYarn: () => void;
  onToggleBox: () => void;
  onDropTreat: () => void;
  onChangeCatCount: (nextCount: number) => void;
  onSelectBreedMode: (breedMode: CatBreedMode) => void;
  onToggleHud: () => void;
  onToggleDebug: () => void;
  onToggleProps?: () => void;
  onCenterPrism?: () => void;
  onNewFile: () => void;
  onTidyIcons: () => void;
  onEmptyBin: () => void;
  onPlayWithIcon?: () => void;
  onChangeFpsCap?: (fpsCap: number) => void;
  onChangeIdleNapMinutes?: (minutes: number) => void;
  onToggleLaserHotkey?: () => void;
  onToggleShellReactions?: () => void;
}

export interface ToyDockState {
  sceneTheme: SceneTheme;
  lightingMode: LightingMode;
  laserActive: boolean;
  boxVisible: boolean;
  catCount: number;
  breedMode: CatBreedMode;
  propsVisible: boolean;
  activeTreatsCount: number;
  hudVisible: boolean;
  debugMode: boolean;
  visible: boolean;
  nativeHostConnected: boolean;
  fpsCap?: number;
  idleNapMinutes?: number;
  enableLaserHotkey?: boolean;
  enableShellReactions?: boolean;
}

export interface HudStats {
  sceneTheme: SceneTheme;
  catCount: number;
  pounces: number;
  bonks: number;
  laserActive: boolean;
  splitPrism: boolean;
  activeTreatsCount: number;
  paused: boolean;
  lightingMode: LightingMode;
  effectiveLighting?: EffectiveLightingMode;
  visible: boolean;
}

export const BONK_VELOCITY_THRESHOLD = 350;
export const YARN_RESTITUTION = 0.75;
export const BONK_DAZE_DURATION = 0.5;
export const WIGGLE_DURATION = 0.4;
export const IDLE_NAP_SECONDS = 300;
export const RECYCLE_STARTLE_RADIUS = 300;
