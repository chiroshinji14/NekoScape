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

/** Minimum number of cats allowed. Intentionally NO upper cap so users can deploy as many cats as desired. */
export const MIN_CAT_COUNT = 1;

export function normalizeCatCount(value: unknown, fallback = 6): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(MIN_CAT_COUNT, Math.round(fallback));
  }
  return Math.max(MIN_CAT_COUNT, Math.round(value));
}

/**
 * 14 distinct real-life cat breeds with unique anatomy, locomotion, coats, and personality priors.
 */
export type CatBreed =
  | 'persian'
  | 'siamese'
  | 'british_shorthair'
  | 'munchkin'
  | 'sphynx'
  | 'domestic_shorthair'
  | 'maine_coon'
  | 'scottish_fold'
  | 'bengal'
  | 'ragdoll'
  | 'russian_blue'
  | 'abyssinian'
  | 'american_curl'
  | 'japanese_bobtail';

export const CAT_BREEDS: readonly CatBreed[] = [
  'persian',
  'siamese',
  'british_shorthair',
  'munchkin',
  'sphynx',
  'domestic_shorthair',
  'maine_coon',
  'scottish_fold',
  'bengal',
  'ragdoll',
  'russian_blue',
  'abyssinian',
  'american_curl',
  'japanese_bobtail',
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
  maine_coon: 'Maine Coon',
  scottish_fold: 'Scottish Fold',
  bengal: 'Bengal',
  ragdoll: 'Ragdoll',
  russian_blue: 'Russian Blue',
  abyssinian: 'Abyssinian',
  american_curl: 'American Curl',
  japanese_bobtail: 'Japanese Bobtail',
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
    case 'maine':
    case 'mainecoon':
      return 'maine_coon';
    case 'scottish':
    case 'fold':
    case 'scottishfold':
      return 'scottish_fold';
    case 'russian':
    case 'russianblue':
      return 'russian_blue';
    case 'aby':
      return 'abyssinian';
    case 'curl':
    case 'americancurl':
      return 'american_curl';
    case 'bobtail':
    case 'mike':
    case 'japanesebobtail':
      return 'japanese_bobtail';
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
  const normalized = normalizeCatBreed(key, 'domestic_shorthair');
  if (
    key === 'blue_grey' ||
    key === 'british' ||
    key === 'bsh' ||
    key === 'calico' ||
    key === 'tuxedo' ||
    key === 'black' ||
    key === 'orange_tabby' ||
    key === 'tabby' ||
    key === 'dsh' ||
    key === 'maine' ||
    key === 'mainecoon' ||
    key === 'scottish' ||
    key === 'fold' ||
    key === 'scottishfold' ||
    key === 'russian' ||
    key === 'russianblue' ||
    key === 'aby' ||
    key === 'curl' ||
    key === 'americancurl' ||
    key === 'bobtail' ||
    key === 'mike' ||
    key === 'japanesebobtail'
  ) {
    return normalized;
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
  | 'SNIFF_FILE'
  | 'DEEP_SLEEP'
  | 'DREAMING'
  | 'KNEADING'
  | 'SLOW_BLINK'
  | 'POUNCE_WIGGLE'
  | 'CHATTER'
  | 'STARE_VOID'
  | 'HEAD_BUNT'
  | 'FLEHMEN'
  | 'SNEEZE_HICCUP'
  | 'TRIP_RECOVER'
  | 'DRINKING'
  | 'LITTER_USE'
  | 'CUCUMBER_SCARE'
  | 'CARRY_GIFT'
  | 'HAIRBALL'
  | 'IGNORE_USER'
  | 'TASKBAR_WALK'
  | 'PAW_TEST'
  | 'OVERSTIMULATED'
  | 'PAPER_BAG_AMBUSH'
  | 'PLAY_TOY';

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
  'DEEP_SLEEP',
  'DREAMING',
  'KNEADING',
  'SLOW_BLINK',
  'POUNCE_WIGGLE',
  'CHATTER',
  'STARE_VOID',
  'HEAD_BUNT',
  'FLEHMEN',
  'SNEEZE_HICCUP',
  'TRIP_RECOVER',
  'DRINKING',
  'LITTER_USE',
  'CUCUMBER_SCARE',
  'CARRY_GIFT',
  'HAIRBALL',
  'IGNORE_USER',
  'TASKBAR_WALK',
  'PAW_TEST',
  'OVERSTIMULATED',
  'PAPER_BAG_AMBUSH',
  'PLAY_TOY',
] as const;

export interface CatNeeds {
  /** 0..100 (low = sleepy, high = energized) */
  energy: number;
  /** 0..100 (high = hungry) */
  hunger: number;
  /** 0..100 (high = wants play/zoomies) */
  boredom: number;
  /** 0..100 (high = cozy/content) */
  comfort: number;
  /** 0..100 (high = wants to investigate props/toys/icons) */
  curiosity: number;
}

export type CircadianPhase = 'dawn' | 'midday' | 'dusk' | 'night';

export const CIRCADIAN_PHASES: readonly CircadianPhase[] = [
  'dawn',
  'midday',
  'dusk',
  'night',
] as const;

export type CatArchetype =
  | 'lazy'
  | 'hyper_kitten'
  | 'aloof_senior'
  | 'food_obsessed'
  | 'curious_hunter'
  | 'cuddlebug';

export const CAT_ARCHETYPES: readonly CatArchetype[] = [
  'lazy',
  'hyper_kitten',
  'aloof_senior',
  'food_obsessed',
  'curious_hunter',
  'cuddlebug',
] as const;

export type CatEarPose = 'normal' | 'forward' | 'airplane' | 'flat_back';

export interface CatCustomization {
  collarColor: string | null;
  hasBell: boolean;
  isKitten: boolean;
  friendshipXp: number;
  friendshipLevel: number;
}

export interface CollarColorPreset {
  id: string;
  label: string;
  color: string | null;
}

export const COLLAR_COLOR_PRESETS: readonly CollarColorPreset[] = [
  { id: 'none', label: 'None', color: null },
  { id: 'crimson', label: 'Crimson', color: '#d94f5c' },
  { id: 'teal', label: 'Teal', color: '#2fa69a' },
  { id: 'gold', label: 'Gold', color: '#e2a93b' },
  { id: 'lavender', label: 'Lavender', color: '#8b74d6' },
] as const;

export type CatSoundEvent =
  | 'purr'
  | 'meow'
  | 'kitten_mew'
  | 'chirp'
  | 'trill'
  | 'chatter'
  | 'startle'
  | 'sneeze'
  | 'water_lap'
  | 'crunch'
  | 'bell'
  | 'bubble_pop'
  | 'crinkle'
  | 'shutter';

export const CAT_SOUND_EVENTS: readonly CatSoundEvent[] = [
  'purr',
  'meow',
  'kitten_mew',
  'chirp',
  'trill',
  'chatter',
  'startle',
  'sneeze',
  'water_lap',
  'crunch',
  'bell',
  'bubble_pop',
  'crinkle',
  'shutter',
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
  | 'startled'
  | 'irritated'
  | 'hunting'
  | 'dreaming';

export interface CatIdentity {
  id: number;
  name: string;
  breed: CatBreed;
  breedLabel: string;
  coatVariantIndex: number;
  personality: CatPersonality;
  mood: CatMood;
  activePropId: string | null;
  archetype?: CatArchetype;
  needs?: CatNeeds;
  customization?: CatCustomization;
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
  friendshipLevel?: number;
  friendshipXp?: number;
  wokeFromSleep?: boolean;
  soundEvent?: CatSoundEvent;
}

export interface InteractionToastPayload {
  kind: 'cat' | 'prop' | 'treat' | 'toy' | 'photo';
  title: string;
  subtitle: string;
  x?: number;
  y?: number;
  durationMs?: number;
  friendshipLevel?: number;
}

export type ToyKind =
  | 'mouse_toy'
  | 'fish_toy'
  | 'feather_wand'
  | 'crinkle_ball'
  | 'spring_toy'
  | 'ping_pong'
  | 'hair_tie'
  | 'bubbles'
  | 'cucumber'
  | 'taped_square'
  | 'paper_bag';

export const TOY_KINDS: readonly ToyKind[] = [
  'mouse_toy',
  'fish_toy',
  'feather_wand',
  'crinkle_ball',
  'spring_toy',
  'ping_pong',
  'hair_tie',
  'bubbles',
  'cucumber',
  'taped_square',
  'paper_bag',
] as const;

export const TOY_LABELS: Readonly<Record<ToyKind, string>> = {
  mouse_toy: 'Catnip Mouse',
  fish_toy: 'Flopping Fish',
  feather_wand: 'Feather Wand',
  crinkle_ball: 'Crinkle Ball',
  spring_toy: 'Spring Toy',
  ping_pong: 'Ping-Pong Ball',
  hair_tie: 'Hair Tie',
  bubbles: 'Soap Bubbles',
  cucumber: 'Sneaky Cucumber',
  taped_square: 'Taped Square',
  paper_bag: 'Paper Bag',
};

export interface ToyEntityState {
  id: string;
  kind: ToyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation?: number;
  phase?: number;
  isCarriedByCatId: number | null;
  isCatnip: boolean;
  isFood: boolean;
  isScary: boolean;
  active: boolean;
  createdAt: number;
  expiresAt: number | null;
}

export type DroppedToy = ToyEntityState;

export type PropInteractionType =
  | 'warmth'
  | 'scratch'
  | 'cozy'
  | 'play'
  | 'water'
  | 'sniff'
  | 'catnip'
  | 'treat'
  | 'drink'
  | 'knead'
  | 'litter'
  | 'ambush'
  | 'watch'
  | 'nibble'
  | 'perch_high'
  | 'sunbeam';

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
  | 'koi_pond'
  | 'catnip_planter'
  | 'butterfly_stone'
  | 'wind_chime'
  | 'picnic_blanket'
  | 'cat_tree_tower'
  | 'cat_tree_hammock'
  | 'treat_jar'
  | 'latte_saucer'
  | 'donut_cat_bed'
  | 'dropped_treat'
  | 'ambient_butterfly'
  | 'ambient_firefly'
  | 'ambient_bird'
  | 'ambient_moth'
  | 'water_fountain'
  | 'water_glass'
  | 'water_bowl'
  | 'paper_bag_prop'
  | 'cardboard_scratcher'
  | 'warm_laptop'
  | 'heated_bed'
  | 'litter_box'
  | 'cat_tunnel'
  | 'houseplant'
  | 'bookshelf_nook'
  | 'scratched_sofa'
  | 'fridge_lookout'
  | 'fireplace_hearth'
  | 'rainy_window_pane'
  | 'windowsill_perch'
  | 'snowy_window_pane'
  | 'radiator_heater'
  | 'drifting_sunbeam'
  | 'tabletop_aquarium'
  | 'blanket_fort'
  | 'woven_blanket'
  | 'blanket_lump'
  | 'pillow_perch'
  | 'balcony_railing'
  | 'rooftop_parapet'
  | 'string_lights'
  | 'desk_candle'
  | 'cocoa_mug'
  | 'herb_pot'
  | 'jasmine_pot'
  | 'taped_floor_square'
  | 'garden_bench'
  | 'rooftop_crate';

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
  | 'note'
  | 'bubbles'
  | 'paw'
  | 'snow'
  | 'rain'
  | 'fire'
  | 'confetti'
  | 'zzz'
  | 'alert';

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
  scene: SceneThemeName;
  x: number;
  y: number;
  radius: number;
  radiusX?: number;
  radiusY?: number;
  interactionType: PropInteractionType;
  solid?: boolean;
  tippable?: boolean;
  interactPoint?: Vec2;
  drinkPoints?: readonly Vec2[];
  attractRadius: number;
  warmRadius?: number;
}

export interface InteractivePropState extends PropDefinition {
  isActive: boolean;
  attractUntil: number;
  hovered: boolean;
  cooldownUntil: number;
  isTipped?: boolean;
  charges?: number;
  occupantCatIds?: readonly number[];
  soundEvent?: CatSoundEvent;
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
  spawnedCritter?: 'butterfly' | 'firefly' | 'bird' | 'moth';
  soundEvent?: CatSoundEvent;
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
  kind: 'butterfly' | 'firefly' | 'bird' | 'moth';
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

export interface WindowLedgesState {
  taskbarRect: AabbRect | null;
  windowTopLedges: readonly AabbRect[];
}

export type LightingMode = 'auto' | 'day' | 'golden' | 'night';

export type EffectiveLightingMode = 'day' | 'golden' | 'night';

export type SceneThemeName =
  | 'study'
  | 'tatami'
  | 'garden'
  | 'cafe'
  | 'living_room'
  | 'rainy_window'
  | 'night_balcony'
  | 'kitchen'
  | 'bedroom'
  | 'snowy_window'
  | 'sunbeam'
  | 'aquarium'
  | 'rooftop';

export type SceneTheme = SceneThemeName;

export const SCENE_THEMES: readonly SceneThemeName[] = [
  'study',
  'tatami',
  'garden',
  'cafe',
  'living_room',
  'rainy_window',
  'night_balcony',
  'kitchen',
  'bedroom',
  'snowy_window',
  'sunbeam',
  'aquarium',
  'rooftop',
] as const;

export const SCENE_THEME_LABELS: Readonly<Record<SceneThemeName, string>> = {
  study: 'Golden Study',
  tatami: 'Kyoto Tatami',
  garden: 'Sunlit Garden',
  cafe: 'Cat Cafe',
  living_room: 'Living Room',
  rainy_window: 'Rainy Window',
  night_balcony: 'Night Balcony',
  kitchen: 'Sunny Kitchen',
  bedroom: 'Cozy Bedroom',
  snowy_window: 'Snowy Window',
  sunbeam: 'Sunbeam Studio',
  aquarium: 'Aquarium Fort',
  rooftop: 'Sunset Rooftop',
};

export function normalizeSceneTheme(
  value: unknown,
  fallback: SceneThemeName = 'study',
): SceneThemeName {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((SCENE_THEMES as readonly string[]).includes(normalized)) {
    return normalized as SceneThemeName;
  }
  return fallback;
}

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
  sceneTheme: SceneThemeName;
  breedMode: CatBreedMode;
  showSceneProps: boolean;
  kittenMode: boolean;
  collarColor: string | null;
  collarBell: boolean;
  soundEnabled: boolean;
  soundVolume: number;
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
  kittenMode: false,
  collarColor: null,
  collarBell: true,
  soundEnabled: false,
  soundVolume: 0.45,
};

export interface ToyDockCallbacks {
  onSelectScene: (theme: SceneThemeName) => void;
  onSelectLighting: (mode: LightingMode) => void;
  onToggleLaser: () => void;
  onTossYarn: () => void;
  onToggleBox: () => void;
  onDropTreat: () => void;
  onDropToy?: (kind: ToyKind) => void;
  onClearToys?: () => void;
  onChangeCatCount: (nextCount: number) => void;
  onSelectBreedMode: (breedMode: CatBreedMode) => void;
  onToggleKittenMode?: () => void;
  onSelectCollarColor?: (color: string | null) => void;
  onToggleCollarBell?: () => void;
  onToggleSound?: () => void;
  onChangeSoundVolume?: (volume: number) => void;
  onTakePhoto?: () => void;
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
  sceneTheme: SceneThemeName;
  lightingMode: LightingMode;
  laserActive: boolean;
  boxVisible: boolean;
  catCount: number;
  breedMode: CatBreedMode;
  kittenMode: boolean;
  collarColor: string | null;
  collarBell: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  propsVisible: boolean;
  activeTreatsCount: number;
  activeToysCount: number;
  paperBagActive?: boolean;
  tapedSquareActive?: boolean;
  circadianPhase?: CircadianPhase;
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
  sceneTheme: SceneThemeName;
  catCount: number;
  pounces: number;
  bonks: number;
  laserActive: boolean;
  splitPrism: boolean;
  activeTreatsCount: number;
  activeToysCount?: number;
  circadianPhase?: CircadianPhase;
  soundEnabled?: boolean;
  kittenMode?: boolean;
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
