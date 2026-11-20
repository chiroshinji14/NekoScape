import type {
  AabbRect,
  AmbientCritter,
  CatSoundEvent,
  DroppedTreat,
  EffectiveLightingMode,
  InteractivePropState,
  PropDefinition,
  PropHitResult,
  PropInteractionType,
  PropKind,
  PropParticleBurst,
  RugBounds,
  SceneTheme,
  Vec2,
  WarmZone,
} from '../types/simulation';

export type PropAnchorSlot =
  | 'upper_right'
  | 'lower_right'
  | 'upper_left'
  | 'lower_left'
  | 'top_center'
  | 'top_left'
  | 'top_right'
  | 'bottom_center'
  | 'bottom_left'
  | 'bottom_right';

interface ScenePropBlueprint {
  readonly id: string;
  readonly kind: PropKind;
  readonly label: string;
  readonly slot: PropAnchorSlot;
  readonly radius: number;
  readonly radiusX?: number;
  readonly radiusY?: number;
  readonly interactionType: PropInteractionType;
  readonly solid: boolean;
  readonly tippable?: boolean;
  readonly attractRadius: number;
  readonly warmRadius?: number;
  readonly defaultActive?: boolean;
}

export interface InteractivePropRuntime extends InteractivePropState {
  solid: boolean;
  interactPoint: Vec2;
  occupantCatIds: number[];
  pulseTime: number;
  swingAngle: number;
  swingVel: number;
  pageFlipProgress: number;
  rippleAge: number;
  hoverGlow: number;
  activeBlend: number;
  lastInteractedAt: number;
  interactionCount: number;
  anchorX: number;
  anchorY: number;
}

export interface AmbientCritterRuntime extends AmbientCritter {
  phase: number;
  freq: number;
  ttl: number | null;
  isAmbient: boolean;
  colorA: number;
  colorB: number;
  startleBoost: number;
}

export interface ClickRippleEffect {
  id: number;
  x: number;
  y: number;
  age: number;
  duration: number;
  startRadius: number;
  endRadius: number;
  color: number;
  style: 'ripple' | 'chime' | 'clink' | 'catnip';
}

const SCENE_BLUEPRINTS: Readonly<Record<SceneTheme, readonly ScenePropBlueprint[]>> = {
  study: [
    {
      id: 'study-brass-lamp',
      kind: 'brass_lamp',
      label: 'Brass Desk Lamp',
      slot: 'upper_right',
      radius: 30,
      interactionType: 'warmth',
      solid: true,
      attractRadius: 260,
      warmRadius: 132,
      defaultActive: true,
    },
    {
      id: 'study-monstera-scratcher',
      kind: 'monstera_scratcher',
      label: 'Monstera & Sisal Post',
      slot: 'lower_right',
      radius: 38,
      interactionType: 'nibble',
      solid: true,
      tippable: true,
      attractRadius: 245,
    },
    {
      id: 'study-coffee-mug',
      kind: 'coffee_mug',
      label: 'Steaming Coffee Mug',
      slot: 'top_left',
      radius: 30,
      interactionType: 'sniff',
      solid: true,
      attractRadius: 215,
    },
    {
      id: 'study-leather-journal',
      kind: 'leather_journal',
      label: 'Leather Journal & Quill',
      slot: 'bottom_left',
      radius: 34,
      interactionType: 'play',
      solid: false,
      attractRadius: 235,
    },
    {
      id: 'study-bookshelf-nook',
      kind: 'bookshelf_nook',
      label: 'Bookshelf Nook',
      slot: 'top_center',
      radius: 38,
      radiusX: 50,
      radiusY: 26,
      interactionType: 'ambush',
      solid: true,
      tippable: true,
      attractRadius: 265,
    },
    {
      id: 'study-cardboard-scratcher',
      kind: 'cardboard_scratcher',
      label: 'Cardboard Scratcher',
      slot: 'bottom_center',
      radius: 32,
      radiusX: 38,
      radiusY: 24,
      interactionType: 'scratch',
      solid: false,
      attractRadius: 250,
    },
  ],
  tatami: [
    {
      id: 'tatami-tetsubin-tea',
      kind: 'tetsubin_tea',
      label: 'Tetsubin Teapot & Matcha',
      slot: 'upper_right',
      radius: 36,
      interactionType: 'sniff',
      solid: true,
      attractRadius: 220,
    },
    {
      id: 'tatami-andon-lantern',
      kind: 'andon_lantern',
      label: 'Paper Andon Lantern',
      slot: 'lower_right',
      radius: 30,
      interactionType: 'warmth',
      solid: true,
      attractRadius: 270,
      warmRadius: 142,
      defaultActive: true,
    },
    {
      id: 'tatami-zabuton-cushion',
      kind: 'zabuton_cushion',
      label: 'Embroidered Zabuton',
      slot: 'top_left',
      radius: 34,
      interactionType: 'knead',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'tatami-bamboo-clacker',
      kind: 'bamboo_clacker',
      label: 'Shishi-Odoshi & Crane',
      slot: 'bottom_left',
      radius: 34,
      interactionType: 'drink',
      solid: true,
      attractRadius: 265,
    },
    {
      id: 'tatami-cat-tunnel',
      kind: 'cat_tunnel',
      label: 'Woven Cat Tunnel',
      slot: 'top_center',
      radius: 34,
      radiusX: 46,
      radiusY: 24,
      interactionType: 'ambush',
      solid: false,
      attractRadius: 255,
    },
  ],
  garden: [
    {
      id: 'garden-koi-pond',
      kind: 'koi_pond',
      label: 'Mossy Koi Pond',
      slot: 'upper_right',
      radius: 76,
      radiusX: 84,
      radiusY: 62,
      interactionType: 'drink',
      solid: true,
      attractRadius: 345,
    },
    {
      id: 'garden-wind-chime',
      kind: 'wind_chime',
      label: 'Terracotta Wind Chime',
      slot: 'bottom_right',
      radius: 30,
      interactionType: 'play',
      solid: false,
      attractRadius: 280,
    },
    {
      id: 'garden-catnip-planter',
      kind: 'catnip_planter',
      label: 'Catnip & Lavender Planter',
      slot: 'top_left',
      radius: 34,
      interactionType: 'catnip',
      solid: true,
      attractRadius: 315,
    },
    {
      id: 'garden-butterfly-stone',
      kind: 'butterfly_stone',
      label: 'Butterfly & Bird Perch Stone',
      slot: 'bottom_left',
      radius: 30,
      interactionType: 'watch',
      solid: false,
      attractRadius: 270,
    },
    {
      id: 'garden-bench',
      kind: 'garden_bench',
      label: 'Garden Bench Cushion',
      slot: 'top_center',
      radius: 34,
      radiusX: 46,
      radiusY: 24,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 250,
    },
  ],
  cafe: [
    {
      id: 'cafe-latte-saucer',
      kind: 'latte_saucer',
      label: 'Latte Art & Croissant',
      slot: 'upper_right',
      radius: 35,
      interactionType: 'sniff',
      solid: true,
      attractRadius: 215,
    },
    {
      id: 'cafe-cat-tree',
      kind: 'cat_tree_tower',
      label: 'Cat Tree Tower & Hammock',
      slot: 'lower_right',
      radius: 44,
      radiusX: 48,
      radiusY: 38,
      interactionType: 'perch_high',
      solid: false,
      attractRadius: 290,
    },
    {
      id: 'cafe-donut-bed',
      kind: 'donut_cat_bed',
      label: 'Plush Donut Cat Bed',
      slot: 'top_left',
      radius: 34,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'cafe-treat-jar',
      kind: 'treat_jar',
      label: 'Ceramic Treat Jar & Bowl',
      slot: 'bottom_left',
      radius: 34,
      interactionType: 'treat',
      solid: true,
      attractRadius: 315,
    },
    {
      id: 'cafe-water-fountain',
      kind: 'water_fountain',
      label: 'Running Cat Fountain',
      slot: 'top_center',
      radius: 32,
      interactionType: 'drink',
      solid: true,
      attractRadius: 265,
    },
    {
      id: 'cafe-cat-tunnel',
      kind: 'cat_tunnel',
      label: 'Felt Cat Cube & Tunnel',
      slot: 'bottom_center',
      radius: 32,
      radiusX: 42,
      radiusY: 24,
      interactionType: 'ambush',
      solid: false,
      attractRadius: 255,
    },
  ],
  living_room: [
    {
      id: 'living-fireplace-hearth',
      kind: 'fireplace_hearth',
      label: 'Crackling Fireplace Hearth',
      slot: 'top_center',
      radius: 44,
      radiusX: 60,
      radiusY: 32,
      interactionType: 'warmth',
      solid: true,
      attractRadius: 320,
      warmRadius: 175,
      defaultActive: true,
    },
    {
      id: 'living-scratched-sofa',
      kind: 'scratched_sofa',
      label: 'Scratched Sofa Corner',
      slot: 'upper_right',
      radius: 44,
      radiusX: 54,
      radiusY: 34,
      interactionType: 'scratch',
      solid: true,
      attractRadius: 265,
    },
    {
      id: 'living-warm-laptop',
      kind: 'warm_laptop',
      label: 'Warm Glowing Laptop',
      slot: 'bottom_left',
      radius: 32,
      radiusX: 38,
      radiusY: 26,
      interactionType: 'warmth',
      solid: false,
      attractRadius: 270,
      warmRadius: 108,
      defaultActive: true,
    },
    {
      id: 'living-houseplant',
      kind: 'houseplant',
      label: 'Potted Fiddle Plant',
      slot: 'lower_right',
      radius: 32,
      interactionType: 'nibble',
      solid: true,
      tippable: true,
      attractRadius: 245,
    },
    {
      id: 'living-woven-blanket',
      kind: 'woven_blanket',
      label: 'Chunky Woven Blanket',
      slot: 'top_left',
      radius: 36,
      radiusX: 42,
      radiusY: 28,
      interactionType: 'knead',
      solid: false,
      attractRadius: 260,
    },
  ],
  rainy_window: [
    {
      id: 'rainy-window-pane',
      kind: 'rainy_window_pane',
      label: 'Rain-Streaked Window',
      slot: 'top_center',
      radius: 46,
      radiusX: 84,
      radiusY: 26,
      interactionType: 'watch',
      solid: false,
      attractRadius: 285,
    },
    {
      id: 'rainy-windowsill-perch',
      kind: 'windowsill_perch',
      label: 'Cushioned Windowsill Perch',
      slot: 'top_left',
      radius: 34,
      radiusX: 48,
      radiusY: 22,
      interactionType: 'perch_high',
      solid: false,
      attractRadius: 265,
    },
    {
      id: 'rainy-water-glass',
      kind: 'water_glass',
      label: 'Tall Water Glass',
      slot: 'upper_right',
      radius: 28,
      interactionType: 'drink',
      solid: true,
      attractRadius: 245,
    },
    {
      id: 'rainy-woven-blanket',
      kind: 'woven_blanket',
      label: 'Warm Fleece Blanket',
      slot: 'bottom_left',
      radius: 36,
      radiusX: 42,
      radiusY: 28,
      interactionType: 'knead',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'rainy-desk-candle',
      kind: 'desk_candle',
      label: 'Beeswax Desk Candle',
      slot: 'lower_right',
      radius: 28,
      interactionType: 'warmth',
      solid: true,
      attractRadius: 255,
      warmRadius: 124,
      defaultActive: true,
    },
  ],
  night_balcony: [
    {
      id: 'balcony-railing',
      kind: 'balcony_railing',
      label: 'Moonlit Railing Lookout',
      slot: 'top_center',
      radius: 44,
      radiusX: 82,
      radiusY: 24,
      interactionType: 'perch_high',
      solid: true,
      attractRadius: 280,
    },
    {
      id: 'balcony-jasmine-pot',
      kind: 'jasmine_pot',
      label: 'Potted Night Jasmine',
      slot: 'upper_right',
      radius: 32,
      interactionType: 'nibble',
      solid: true,
      tippable: true,
      attractRadius: 255,
    },
    {
      id: 'balcony-string-lights',
      kind: 'string_lights',
      label: 'Balcony Lantern & Bokeh Lights',
      slot: 'top_left',
      radius: 32,
      interactionType: 'warmth',
      solid: false,
      attractRadius: 270,
      warmRadius: 146,
      defaultActive: true,
    },
    {
      id: 'balcony-garden-bench',
      kind: 'garden_bench',
      label: 'Terrace Lounge Cushion',
      slot: 'bottom_left',
      radius: 34,
      radiusX: 44,
      radiusY: 24,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 250,
    },
    {
      id: 'balcony-water-bowl',
      kind: 'water_bowl',
      label: 'Ceramic Terrace Water Dish',
      slot: 'lower_right',
      radius: 28,
      interactionType: 'drink',
      solid: true,
      attractRadius: 245,
    },
  ],
  kitchen: [
    {
      id: 'kitchen-fridge-lookout',
      kind: 'fridge_lookout',
      label: 'Fridge Top Lookout',
      slot: 'upper_right',
      radius: 42,
      radiusX: 50,
      radiusY: 36,
      interactionType: 'perch_high',
      solid: true,
      attractRadius: 280,
    },
    {
      id: 'kitchen-water-fountain',
      kind: 'water_fountain',
      label: 'Stainless Water Fountain',
      slot: 'top_center',
      radius: 32,
      interactionType: 'drink',
      solid: true,
      attractRadius: 265,
    },
    {
      id: 'kitchen-treat-jar',
      kind: 'treat_jar',
      label: 'Kibble Bowl & Treat Jar',
      slot: 'bottom_left',
      radius: 34,
      interactionType: 'treat',
      solid: true,
      attractRadius: 300,
    },
    {
      id: 'kitchen-herb-pot',
      kind: 'herb_pot',
      label: 'Windowsill Catgrass & Herb Pot',
      slot: 'top_left',
      radius: 30,
      interactionType: 'nibble',
      solid: true,
      tippable: true,
      attractRadius: 255,
    },
    {
      id: 'kitchen-paper-bag',
      kind: 'paper_bag_prop',
      label: 'Crinkly Grocery Paper Bag',
      slot: 'lower_right',
      radius: 32,
      radiusX: 38,
      radiusY: 26,
      interactionType: 'ambush',
      solid: false,
      attractRadius: 270,
    },
  ],
  bedroom: [
    {
      id: 'bedroom-blanket-lump',
      kind: 'blanket_lump',
      label: 'Mysterious Blanket Lump',
      slot: 'top_center',
      radius: 36,
      radiusX: 44,
      radiusY: 30,
      interactionType: 'play',
      solid: false,
      attractRadius: 265,
    },
    {
      id: 'bedroom-pillow-perch',
      kind: 'pillow_perch',
      label: 'Plush Pillow Perch',
      slot: 'top_left',
      radius: 34,
      radiusX: 42,
      radiusY: 28,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'bedroom-warm-laptop',
      kind: 'warm_laptop',
      label: 'Warm Bedside Laptop',
      slot: 'bottom_left',
      radius: 32,
      radiusX: 38,
      radiusY: 26,
      interactionType: 'warmth',
      solid: false,
      attractRadius: 265,
      warmRadius: 112,
      defaultActive: true,
    },
    {
      id: 'bedroom-litter-box',
      kind: 'litter_box',
      label: 'Corner Hooded Litter Box',
      slot: 'lower_right',
      radius: 38,
      radiusX: 44,
      radiusY: 32,
      interactionType: 'litter',
      solid: true,
      attractRadius: 255,
    },
    {
      id: 'bedroom-nightstand-lamp',
      kind: 'brass_lamp',
      label: 'Nightstand Reading Lamp',
      slot: 'upper_right',
      radius: 30,
      interactionType: 'warmth',
      solid: true,
      attractRadius: 260,
      warmRadius: 132,
      defaultActive: true,
    },
  ],
  snowy_window: [
    {
      id: 'snowy-window-pane',
      kind: 'snowy_window_pane',
      label: 'Frosted Winter Window',
      slot: 'top_center',
      radius: 46,
      radiusX: 84,
      radiusY: 26,
      interactionType: 'watch',
      solid: false,
      attractRadius: 280,
    },
    {
      id: 'snowy-windowsill-perch',
      kind: 'windowsill_perch',
      label: 'Snow-Watch Sill Perch',
      slot: 'top_left',
      radius: 34,
      radiusX: 48,
      radiusY: 22,
      interactionType: 'perch_high',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'snowy-radiator-heater',
      kind: 'radiator_heater',
      label: 'Warm Cast-Iron Radiator',
      slot: 'upper_right',
      radius: 38,
      radiusX: 50,
      radiusY: 26,
      interactionType: 'warmth',
      solid: true,
      attractRadius: 315,
      warmRadius: 168,
      defaultActive: true,
    },
    {
      id: 'snowy-woven-blanket',
      kind: 'woven_blanket',
      label: 'Chunky Knit Blanket',
      slot: 'bottom_left',
      radius: 36,
      radiusX: 42,
      radiusY: 28,
      interactionType: 'knead',
      solid: false,
      attractRadius: 265,
    },
    {
      id: 'snowy-cocoa-mug',
      kind: 'cocoa_mug',
      label: 'Steaming Marshmallow Cocoa',
      slot: 'lower_right',
      radius: 28,
      interactionType: 'sniff',
      solid: true,
      attractRadius: 225,
    },
  ],
  sunbeam: [
    {
      id: 'sunbeam-drifting-patch',
      kind: 'drifting_sunbeam',
      label: 'Drifting Sunbeam Patch',
      slot: 'top_right',
      radius: 56,
      radiusX: 70,
      radiusY: 52,
      interactionType: 'sunbeam',
      solid: false,
      attractRadius: 360,
      warmRadius: 126,
      defaultActive: true,
    },
    {
      id: 'sunbeam-taped-square',
      kind: 'taped_floor_square',
      label: 'Taped Floor Square',
      slot: 'bottom_center',
      radius: 36,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 280,
    },
    {
      id: 'sunbeam-cardboard-scratcher',
      kind: 'cardboard_scratcher',
      label: 'Corrugated Cat Scratcher',
      slot: 'bottom_left',
      radius: 32,
      radiusX: 40,
      radiusY: 24,
      interactionType: 'scratch',
      solid: false,
      attractRadius: 255,
    },
    {
      id: 'sunbeam-houseplant',
      kind: 'houseplant',
      label: 'Sunlit Studio Plant',
      slot: 'top_left',
      radius: 32,
      interactionType: 'nibble',
      solid: true,
      tippable: true,
      attractRadius: 245,
    },
    {
      id: 'sunbeam-water-bowl',
      kind: 'water_bowl',
      label: 'Studio Ceramic Water Bowl',
      slot: 'lower_right',
      radius: 28,
      interactionType: 'drink',
      solid: true,
      attractRadius: 250,
    },
  ],
  aquarium: [
    {
      id: 'aquarium-tank',
      kind: 'tabletop_aquarium',
      label: 'Glowing Fish Aquarium',
      slot: 'upper_right',
      radius: 48,
      radiusX: 62,
      radiusY: 36,
      interactionType: 'watch',
      solid: true,
      attractRadius: 320,
    },
    {
      id: 'aquarium-blanket-fort',
      kind: 'blanket_fort',
      label: 'Cozy Blanket & Box Fort',
      slot: 'top_left',
      radius: 42,
      radiusX: 48,
      radiusY: 36,
      interactionType: 'ambush',
      solid: false,
      attractRadius: 285,
    },
    {
      id: 'aquarium-cat-tunnel',
      kind: 'cat_tunnel',
      label: 'Crinkle Cat Tunnel',
      slot: 'bottom_left',
      radius: 34,
      radiusX: 44,
      radiusY: 24,
      interactionType: 'play',
      solid: false,
      attractRadius: 255,
    },
    {
      id: 'aquarium-water-fountain',
      kind: 'water_fountain',
      label: 'Bubbling Water Fountain',
      slot: 'top_center',
      radius: 32,
      interactionType: 'drink',
      solid: true,
      attractRadius: 260,
    },
    {
      id: 'aquarium-treat-jar',
      kind: 'treat_jar',
      label: 'Fish Treat Jar & Bowl',
      slot: 'lower_right',
      radius: 34,
      interactionType: 'treat',
      solid: true,
      attractRadius: 295,
    },
  ],
  rooftop: [
    {
      id: 'rooftop-parapet',
      kind: 'rooftop_parapet',
      label: 'Brick Parapet Lookout',
      slot: 'top_center',
      radius: 44,
      radiusX: 82,
      radiusY: 24,
      interactionType: 'perch_high',
      solid: true,
      attractRadius: 285,
    },
    {
      id: 'rooftop-string-lights',
      kind: 'string_lights',
      label: 'Edison String Lights',
      slot: 'top_left',
      radius: 32,
      interactionType: 'warmth',
      solid: false,
      attractRadius: 275,
      warmRadius: 155,
      defaultActive: true,
    },
    {
      id: 'rooftop-crate',
      kind: 'rooftop_crate',
      label: 'Wooden Crate & Cushion',
      slot: 'upper_right',
      radius: 34,
      radiusX: 40,
      radiusY: 28,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 255,
    },
    {
      id: 'rooftop-water-bowl',
      kind: 'water_bowl',
      label: 'Terracotta Water Dish',
      slot: 'lower_right',
      radius: 28,
      interactionType: 'drink',
      solid: true,
      attractRadius: 245,
    },
    {
      id: 'rooftop-butterfly-stone',
      kind: 'butterfly_stone',
      label: 'Sunset Bird & Firefly Perch',
      slot: 'bottom_left',
      radius: 30,
      interactionType: 'watch',
      solid: false,
      attractRadius: 270,
    },
  ],
};

const MAX_ACTIVE_TREATS = 8;
const MAX_ACTIVE_CRITTERS = 7;
const TREAT_LIFETIME_SEC = 95;
const DEFAULT_TREAT_BITES = 3;
const FAB_SAFE_WIDTH = 114;
const FAB_SAFE_HEIGHT = 114;

function clamp(v: number, min: number, max: number): number {
  if (min > max) {
    return (min + max) * 0.5;
  }
  return v < min ? min : v > max ? max : v;
}

function isToggleWarmthKind(kind: PropKind): boolean {
  return (
    kind === 'brass_lamp' ||
    kind === 'andon_lantern' ||
    kind === 'string_lights' ||
    kind === 'desk_candle'
  );
}

function isAlwaysWarmKind(kind: PropKind): boolean {
  return (
    kind === 'fireplace_hearth' ||
    kind === 'radiator_heater' ||
    kind === 'warm_laptop' ||
    kind === 'heated_bed' ||
    kind === 'drifting_sunbeam'
  );
}

function isDrinkKind(kind: PropKind): boolean {
  return (
    kind === 'koi_pond' ||
    kind === 'koi_birdbath' ||
    kind === 'water_fountain' ||
    kind === 'water_glass' ||
    kind === 'water_bowl' ||
    kind === 'bamboo_clacker'
  );
}

function computeDrinkPoints(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rugCenter: Vec2,
  viewWidth: number,
  viewHeight: number,
): Vec2[] {
  const candidates: Vec2[] = [
    { x: Math.round(x - rx - 15), y: Math.round(y) },
    { x: Math.round(x), y: Math.round(y + ry + 15) },
    { x: Math.round(x), y: Math.round(y - ry - 15) },
    { x: Math.round(x + rx + 15), y: Math.round(y) },
  ].map((p) => ({
    x: clamp(p.x, 30, viewWidth - 30),
    y: clamp(p.y, 30, viewHeight - 30),
  }));

  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - rugCenter.x, a.y - rugCenter.y) -
      Math.hypot(b.x - rugCenter.x, b.y - rugCenter.y),
  );
  return candidates;
}

function computeInteractPoint(
  x: number,
  y: number,
  radius: number,
  radiusX: number | undefined,
  radiusY: number | undefined,
  solid: boolean,
  kind: PropKind,
  rugCenter: Vec2,
  viewWidth: number,
  viewHeight: number,
): Vec2 {
  if (!solid) {
    if (kind === 'cat_tree_tower') {
      return {
        x: clamp(x - 16, 28, viewWidth - 28),
        y: clamp(y + 8, 28, viewHeight - 28),
      };
    }
    return { x, y };
  }

  const dx = rugCenter.x - x;
  const dy = rugCenter.y - y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const rx = radiusX ?? radius;
  const ry = radiusY ?? radius;
  const directionalR = Math.hypot(ux * rx, uy * ry);
  const offset = directionalR + 18;
  return {
    x: clamp(Math.round(x + ux * offset), 28, viewWidth - 28),
    y: clamp(Math.round(y + uy * offset), 28, viewHeight - 28),
  };
}

function resolveCircleOutsideRect(
  x: number,
  y: number,
  radius: number,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
  pad: number,
): Vec2 {
  const minX = rectX - pad;
  const maxX = rectX + rectW + pad;
  const minY = rectY - pad;
  const maxY = rectY + rectH + pad;

  const nearestX = clamp(x, minX, maxX);
  const nearestY = clamp(y, minY, maxY);
  const dx = x - nearestX;
  const dy = y - nearestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= radius * radius) {
    return { x, y };
  }

  if (distSq > 0.001) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist + 2;
    return {
      x: x + (dx / dist) * push,
      y: y + (dy / dist) * push,
    };
  }

  const dLeft = Math.abs(x - minX);
  const dRight = Math.abs(maxX - x);
  const dTop = Math.abs(y - minY);
  const dBottom = Math.abs(maxY - y);
  const minD = Math.min(dLeft, dRight, dTop, dBottom);

  if (minD === dLeft) return { x: minX - radius - 2, y };
  if (minD === dRight) return { x: maxX + radius + 2, y };
  if (minD === dTop) return { x, y: minY - radius - 2 };
  return { x, y: maxY + radius + 2 };
}

/**
 * Computes responsive, non-overlapping top-down prop positions around room perimeter
 * margins so props stay cleanly clear of the central rug, cardboard box, left desktop
 * icon columns, and bottom-right FAB controls.
 */
export function computeScenePropDefinitions(
  theme: SceneTheme,
  width: number,
  height: number,
  rug: RugBounds,
): PropDefinition[] {
  const w = Math.max(320, Math.round(width));
  const h = Math.max(240, Math.round(height));
  const margin = 18;

  const rugRight = rug.x + rug.width;
  const rugBottom = rug.y + rug.height;
  const rugCenter: Vec2 = {
    x: rug.x + rug.width * 0.5,
    y: rug.y + rug.height * 0.5,
  };

  const iconSafeX = w >= 1120 ? 236 : w >= 860 ? 156 : 92;
  const leftBandWidth = rug.x - iconSafeX;
  const rightBandWidth = w - rugRight;

  const blueprints = SCENE_BLUEPRINTS[theme] ?? SCENE_BLUEPRINTS.study;
  const placed: Array<{ bp: ScenePropBlueprint; x: number; y: number; rx: number; ry: number }> = [];

  for (const bp of blueprints) {
    const rx = bp.radiusX ?? bp.radius;
    const ry = bp.radiusY ?? bp.radius;
    const r = Math.max(rx, ry);
    const minBandForSide = rx * 2 + 24;
    let x = rugCenter.x;
    let y = rugCenter.y;

    switch (bp.slot) {
      case 'upper_right': {
        if (rightBandWidth >= minBandForSide) {
          const offset = clamp(rightBandWidth * 0.48, rx + 14, 165);
          x = rugRight + offset;
          y = clamp(rug.y + Math.min(54, rug.height * 0.22), margin + ry, h - margin - ry);
        } else {
          x = clamp(rug.x + rug.width * 0.8, iconSafeX + rx, w - margin - rx);
          y = clamp(rug.y - ry - 18, margin + ry, h - margin - ry);
        }
        break;
      }
      case 'lower_right': {
        const fabTopLimit = h - FAB_SAFE_HEIGHT - ry - 8;
        if (rightBandWidth >= minBandForSide) {
          const offset = clamp(rightBandWidth * 0.46, rx + 14, 152);
          x = rugRight + offset;
          const desiredY = rugBottom - Math.min(36, rug.height * 0.16);
          y = clamp(Math.min(desiredY, fabTopLimit), margin + ry + 110, h - margin - ry);
        } else {
          x = clamp(rug.x + rug.width * 0.72, iconSafeX + rx, w - FAB_SAFE_WIDTH - rx - 8);
          y = clamp(rugBottom + ry + 18, margin + ry, h - margin - ry);
        }
        break;
      }
      case 'upper_left': {
        if (leftBandWidth >= minBandForSide) {
          const offset = clamp(leftBandWidth * 0.48, rx + 14, 148);
          x = Math.max(iconSafeX + rx + 6, rug.x - offset);
          y = clamp(rug.y + Math.min(52, rug.height * 0.2), margin + ry, h - margin - ry);
        } else {
          x = clamp(Math.max(iconSafeX + rx + 10, rug.x + rug.width * 0.2), margin + rx, w - margin - rx);
          y = clamp(rug.y - ry - 18, margin + ry, h - margin - ry);
        }
        break;
      }
      case 'lower_left': {
        if (leftBandWidth >= minBandForSide) {
          const offset = clamp(leftBandWidth * 0.48, rx + 14, 148);
          x = Math.max(iconSafeX + rx + 6, rug.x - offset);
          y = clamp(rugBottom - Math.min(44, rug.height * 0.18), margin + ry, h - margin - ry);
        } else {
          x = clamp(Math.max(iconSafeX + rx + 10, rug.x + rug.width * 0.22), margin + rx, w - FAB_SAFE_WIDTH - rx);
          y = clamp(rugBottom + ry + 18, margin + ry, h - margin - ry);
        }
        break;
      }
      case 'top_center': {
        x = clamp(rugCenter.x, iconSafeX + rx + 8, w - margin - rx);
        y = clamp(rug.y * 0.5, margin + ry, rug.y - ry - 14);
        break;
      }
      case 'top_left': {
        x = clamp(Math.max(iconSafeX + rx + 10, rug.x + rug.width * 0.18), margin + rx, w - margin - rx);
        y = clamp(rug.y - ry - 18, margin + ry, rug.y - ry - 12);
        break;
      }
      case 'top_right': {
        x = clamp(rug.x + rug.width * 0.82, iconSafeX + rx + 8, w - margin - rx);
        y = clamp(rug.y - ry - 18, margin + ry, rug.y - ry - 12);
        break;
      }
      case 'bottom_center': {
        x = clamp(rugCenter.x, iconSafeX + rx + 8, w - FAB_SAFE_WIDTH - rx - 12);
        y = clamp(rugBottom + ry + 18, rugBottom + ry + 12, h - margin - ry);
        break;
      }
      case 'bottom_left': {
        x = clamp(Math.max(iconSafeX + rx + 10, rug.x + rug.width * 0.2), margin + rx, w - FAB_SAFE_WIDTH - rx - 12);
        y = clamp(rugBottom + ry + 18, rugBottom + ry + 12, h - margin - ry);
        break;
      }
      case 'bottom_right': {
        x = clamp(rug.x + rug.width * 0.78, iconSafeX + rx + 8, w - FAB_SAFE_WIDTH - rx - 14);
        y = clamp(rugBottom + ry + 18, rugBottom + ry + 12, h - margin - ry);
        break;
      }
    }

    const clearedRug = resolveCircleOutsideRect(x, y, Math.min(rx, ry), rug.x, rug.y, rug.width, rug.height, 8);
    x = clamp(clearedRug.x, margin + rx, w - margin - rx);
    y = clamp(clearedRug.y, margin + ry, h - margin - ry);

    if (x + rx > w - FAB_SAFE_WIDTH && y + ry > h - FAB_SAFE_HEIGHT) {
      if (rightBandWidth >= minBandForSide && bp.slot !== 'bottom_right') {
        y = clamp(h - FAB_SAFE_HEIGHT - ry - 8, margin + ry, h - margin - ry);
      } else {
        x = clamp(w - FAB_SAFE_WIDTH - rx - 8, margin + rx, w - margin - rx);
      }
    }

    placed.push({ bp, x: Math.round(x), y: Math.round(y), rx, ry });
  }

  // Pairwise non-overlap pass between props respecting elliptical bounds
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const ar = Math.hypot(Math.cos(angle) * a.rx, Math.sin(angle) * a.ry);
        const br = Math.hypot(Math.cos(angle) * b.rx, Math.sin(angle) * b.ry);
        const minDist = ar + br + 16;
        if (dist < minDist) {
          const nx = dist > 0.01 ? dx / dist : 0;
          const ny = dist > 0.01 ? dy / dist : 1;
          const push = (minDist - dist) * 0.5 + 1;
          a.x = Math.round(clamp(a.x - nx * push, margin + a.rx, w - margin - a.rx));
          a.y = Math.round(clamp(a.y - ny * push, margin + a.ry, h - margin - a.ry));
          b.x = Math.round(clamp(b.x + nx * push, margin + b.rx, w - margin - b.rx));
          b.y = Math.round(clamp(b.y + ny * push, margin + b.ry, h - margin - b.ry));
        }
      }
    }
  }

  return placed.map(({ bp, x, y, rx, ry }) => {
    const drinkPoints = isDrinkKind(bp.kind)
      ? computeDrinkPoints(x, y, rx, ry, rugCenter, w, h)
      : undefined;
    const interactPoint =
      drinkPoints && drinkPoints.length > 0
        ? { ...drinkPoints[0] }
        : computeInteractPoint(x, y, bp.radius, bp.radiusX, bp.radiusY, bp.solid, bp.kind, rugCenter, w, h);

    return {
      id: bp.id,
      kind: bp.kind,
      label: bp.label,
      scene: theme,
      x,
      y,
      radius: bp.radius,
      radiusX: bp.radiusX,
      radiusY: bp.radiusY,
      interactionType: bp.interactionType,
      solid: bp.solid,
      tippable: bp.tippable,
      interactPoint,
      drinkPoints,
      attractRadius: bp.attractRadius,
      warmRadius: bp.warmRadius,
    };
  });
}

export function createInteractiveProp(def: PropDefinition): InteractivePropRuntime {
  const initialActive = isToggleWarmthKind(def.kind) || isAlwaysWarmKind(def.kind);
  const prop: InteractivePropRuntime = {
    ...def,
    solid: def.solid ?? false,
    interactPoint: def.interactPoint ? { ...def.interactPoint } : { x: def.x, y: def.y },
    isActive: initialActive,
    isTipped: def.tippable ? false : undefined,
    attractUntil: 0,
    hovered: false,
    cooldownUntil: 0,
    occupantCatIds: [],
    pulseTime: 0,
    swingAngle: 0,
    swingVel: 0,
    pageFlipProgress: 0,
    rippleAge: 0,
    hoverGlow: 0,
    activeBlend: initialActive ? 1 : 0,
    lastInteractedAt: -100,
    interactionCount: 0,
    anchorX: def.x,
    anchorY: def.y,
    hitTest(px: number, py: number): boolean {
      const dx = px - prop.x;
      const dy = py - prop.y;
      if (prop.radiusX && prop.radiusY) {
        const rx = prop.radiusX + 8;
        const ry = prop.radiusY + 8;
        return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
      }
      const hitR = prop.radius + 7;
      return dx * dx + dy * dy <= hitR * hitR;
    },
  };
  return prop;
}

export function isPropAttracting(prop: InteractivePropState, nowSec: number): boolean {
  return prop.attractUntil > nowSec;
}

/**
 * Pure TypeScript simulation & interaction engine for all 13 scenes' interactive props,
 * user-dropped treats, warm light zones (including drifting sunbeams), tip-able plants/books,
 * and ambient/spawned butterflies, fireflies, birds, and moths.
 * Zero PixiJS or DOM dependencies so unit tests can exercise every behavior directly.
 */
export class InteractivePropWorld {
  private theme: SceneTheme;
  private width: number;
  private height: number;
  private rugBounds: RugBounds;
  private effectiveLighting: EffectiveLightingMode = 'golden';
  private enabled = true;
  private simTime = 0;

  private props: InteractivePropRuntime[] = [];
  private obstacles: AabbRect[] = [];
  private treats: DroppedTreat[] = [];
  private critters: AmbientCritterRuntime[] = [];
  private effects: ClickRippleEffect[] = [];

  private nextTreatSeq = 1;
  private nextCritterSeq = 1;
  private nextEffectSeq = 1;
  private defaultDropCursor = 0;

  constructor(
    width: number,
    height: number,
    rugBounds: RugBounds,
    theme: SceneTheme = 'study',
  ) {
    this.width = Math.max(320, Math.round(width));
    this.height = Math.max(240, Math.round(height));
    this.rugBounds = { ...rugBounds };
    this.theme = theme;
    this.rebuildProps(false);
    this.seedAmbientCritters();
  }

  public getTime(): number {
    return this.simTime;
  }

  public getTheme(): SceneTheme {
    return this.theme;
  }

  public setTheme(theme: SceneTheme): void {
    if (this.theme === theme && this.props.length > 0) {
      return;
    }
    this.theme = theme;
    this.effects.length = 0;
    this.rebuildProps(false);
    this.seedAmbientCritters();
  }

  public setLighting(mode: EffectiveLightingMode): void {
    const prevNight = this.effectiveLighting === 'night';
    this.effectiveLighting = mode;
    const nextNight = mode === 'night';
    if (prevNight !== nextNight && (this.theme === 'garden' || this.theme === 'rooftop')) {
      this.syncOutdoorAmbientCritterKinds();
    }
  }

  public setNightMode(night: boolean): void {
    this.setLighting(night ? 'night' : this.effectiveLighting === 'night' ? 'golden' : this.effectiveLighting);
  }

  public getEffectiveLighting(): EffectiveLightingMode {
    return this.effectiveLighting;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      for (const prop of this.props) {
        prop.hovered = false;
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public resize(width: number, height: number, rugBounds: RugBounds): void {
    this.width = Math.max(320, Math.round(width));
    this.height = Math.max(240, Math.round(height));
    this.rugBounds = { ...rugBounds };
    this.rebuildProps(true);

    for (const treat of this.treats) {
      treat.x = clamp(treat.x, 36, this.width - 36);
      treat.y = clamp(treat.y, 36, this.height - 36);
    }
    for (const c of this.critters) {
      c.x = clamp(c.x, 24, this.width - 24);
      c.y = clamp(c.y, 24, this.height - 24);
    }
  }

  public getProps(): readonly InteractivePropRuntime[] {
    return this.enabled ? this.props : [];
  }

  public getAllPropsInternal(): readonly InteractivePropRuntime[] {
    return this.props;
  }

  public getPropById(propId: string): InteractivePropRuntime | null {
    if (!this.enabled) return null;
    return this.props.find((p) => p.id === propId) ?? null;
  }

  public getObstacles(): readonly AabbRect[] {
    return this.enabled ? this.obstacles : [];
  }

  public getWarmZones(): WarmZone[] {
    if (!this.enabled) {
      return [];
    }
    const zones: WarmZone[] = [];
    const lightingMult =
      this.effectiveLighting === 'night'
        ? 1.0
        : this.effectiveLighting === 'golden'
          ? 0.72
          : 0.45;

    for (const prop of this.props) {
      if ((prop.interactionType === 'warmth' || prop.interactionType === 'sunbeam') && prop.isActive) {
        const sunbeamBoost =
          prop.kind === 'drifting_sunbeam'
            ? this.effectiveLighting === 'night'
              ? 0.35
              : 0.92
            : lightingMult;
        zones.push({
          id: prop.id,
          x: prop.x,
          y: prop.y,
          radius: prop.warmRadius ?? 124,
          intensity: sunbeamBoost,
        });
      }
    }

    if (this.theme === 'garden' && this.effectiveLighting !== 'night') {
      const stone = this.props.find((p) => p.kind === 'butterfly_stone');
      if (stone) {
        zones.push({
          id: 'garden-sunbeam-patch',
          x: stone.x,
          y: stone.y,
          radius: 92,
          intensity: this.effectiveLighting === 'golden' ? 0.56 : 0.42,
        });
      }
    }

    return zones;
  }

  public getActiveTreats(): readonly DroppedTreat[] {
    return this.treats;
  }

  public getAmbientCritters(): readonly AmbientCritterRuntime[] {
    return this.critters;
  }

  public getActiveEffects(): readonly ClickRippleEffect[] {
    return this.effects;
  }

  public tipProp(propId: string): boolean {
    const prop = this.getPropById(propId);
    if (!prop || !prop.tippable || prop.isTipped) {
      return false;
    }
    prop.isTipped = true;
    prop.pulseTime = 1;
    prop.swingVel += 12;
    this.pushEffect(prop.x, prop.y, 0.7, 10, 42, 0xc99c6b, 'ripple');
    return true;
  }

  public spawnTreat(x?: number, y?: number): DroppedTreat {
    let tx: number;
    let ty: number;

    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      tx = clamp(Math.round(x), 40, this.width - 40);
      ty = clamp(Math.round(y), 40, this.height - 40);
    } else {
      const rug = this.rugBounds;
      const angle = (this.defaultDropCursor * 2.15 + 0.6) % (Math.PI * 2);
      this.defaultDropCursor++;
      const rx = Math.min(rug.width * 0.28, 120);
      const ry = Math.min(rug.height * 0.26, 84);
      tx = clamp(Math.round(rug.x + rug.width * 0.5 + Math.cos(angle) * rx), 44, this.width - 44);
      ty = clamp(Math.round(rug.y + rug.height * 0.5 + Math.sin(angle) * ry), 44, this.height - 44);
    }

    if (this.treats.length >= MAX_ACTIVE_TREATS) {
      this.treats.shift();
    }

    const treat: DroppedTreat = {
      id: `treat-${this.nextTreatSeq++}`,
      x: tx,
      y: ty,
      radius: 16,
      remainingBites: DEFAULT_TREAT_BITES,
      spawnedAt: this.simTime,
      claimedByCatId: null,
    };
    this.treats.push(treat);
    this.pushEffect(tx, ty, 0.55, 6, 28, 0xf6c978, 'ripple');
    return treat;
  }

  public consumeTreatBite(treatId: string, catId: number): boolean {
    const idx = this.treats.findIndex((t) => t.id === treatId);
    if (idx < 0) {
      return false;
    }
    const treat = this.treats[idx];
    treat.claimedByCatId = catId;
    treat.remainingBites = Math.max(0, treat.remainingBites - 1);
    this.pushEffect(treat.x, treat.y, 0.38, 4, 18, 0xe4a058, 'ripple');

    if (treat.remainingBites <= 0) {
      this.treats.splice(idx, 1);
    }
    return true;
  }

  public spawnCritter(
    x: number,
    y: number,
    kind?: 'butterfly' | 'firefly' | 'bird' | 'moth',
    isAmbient = false,
  ): AmbientCritterRuntime {
    const resolvedKind = kind ?? (this.effectiveLighting === 'night' ? 'firefly' : 'butterfly');

    if (this.critters.length >= MAX_ACTIVE_CRITTERS) {
      const tempIdx = this.critters.findIndex((c) => !c.isAmbient);
      this.critters.splice(tempIdx >= 0 ? tempIdx : 0, 1);
    }

    const seq = this.nextCritterSeq++;
    const angle = ((seq * 1.618) % 1) * Math.PI * 2;
    const speed =
      resolvedKind === 'firefly'
        ? 24
        : resolvedKind === 'moth'
          ? 38
          : resolvedKind === 'bird'
            ? 28
            : 34;

    const palette =
      resolvedKind === 'firefly'
        ? { a: 0xe6f86d, b: 0xfff8b8 }
        : resolvedKind === 'moth'
          ? { a: 0xdccbb2, b: 0x7c6858 }
          : resolvedKind === 'bird'
            ? seq % 2 === 0
              ? { a: 0x62a4db, b: 0xf4e8d4 }
              : { a: 0xd97254, b: 0xf7e6cc }
            : seq % 3 === 0
              ? { a: 0xf7c552, b: 0x3a2a1e }
              : seq % 3 === 1
                ? { a: 0x84ccf6, b: 0xf5fbff }
                : { a: 0xf29372, b: 0xfff0d8 };

    const critter: AmbientCritterRuntime = {
      id: `critter-${resolvedKind}-${seq}`,
      kind: resolvedKind,
      x: clamp(x, 28, this.width - 28),
      y: clamp(y, 28, this.height - 28),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      phase: seq * 1.37,
      freq: resolvedKind === 'firefly' ? 1.8 + (seq % 3) * 0.35 : 2.5 + (seq % 3) * 0.4,
      ttl: isAmbient ? null : 24,
      isAmbient,
      colorA: palette.a,
      colorB: palette.b,
      startleBoost: isAmbient ? 0 : 0.7,
    };

    this.critters.push(critter);
    return critter;
  }

  public notifyCatInteract(propId: string, catId: number): PropParticleBurst[] {
    const prop = this.getPropById(propId);
    if (!prop) {
      return [];
    }

    if (!prop.occupantCatIds.includes(catId)) {
      prop.occupantCatIds.push(catId);
      if (prop.occupantCatIds.length > 4) {
        prop.occupantCatIds.shift();
      }
    }

    prop.pulseTime = Math.max(prop.pulseTime, 0.75);
    prop.lastInteractedAt = this.simTime;
    prop.interactionCount++;

    if (prop.tippable && !prop.isTipped && prop.interactionCount % 2 === 0) {
      prop.isTipped = true;
      prop.swingVel += 12;
      this.pushEffect(prop.x, prop.y, 0.7, 10, 42, 0xd4a974, 'ripple');
      return [
        { kind: 'dust', x: prop.x, y: prop.y, count: 5, color: 0xdccbb4 },
        { kind: 'leaf', x: prop.x, y: prop.y, count: 4, color: 0x67ad6e },
      ];
    }

    switch (prop.kind) {
      case 'monstera_scratcher':
      case 'houseplant':
      case 'herb_pot':
      case 'jasmine_pot':
        prop.swingVel += 8;
        return [{ kind: 'leaf', x: prop.x, y: prop.y, count: 4, color: 0x5da465 }];
      case 'bookshelf_nook':
        prop.swingVel += 7;
        return [{ kind: 'dust', x: prop.x, y: prop.y, count: 4, color: 0xebd9c4 }];
      case 'cat_tree_tower':
      case 'cat_tree_hammock':
        prop.swingVel += 13;
        return [{ kind: 'sparkle', x: prop.x - 18, y: prop.y + 8, count: 4, color: 0xf08c74 }];
      case 'leather_journal':
        prop.swingVel += 9;
        prop.pageFlipProgress = prop.pageFlipProgress <= 0 ? 0.001 : prop.pageFlipProgress;
        return [{ kind: 'sparkle', x: prop.x + 12, y: prop.y - 2, count: 3, color: 0xf7e7c8 }];
      case 'koi_pond':
      case 'koi_birdbath':
      case 'water_fountain':
      case 'water_glass':
      case 'water_bowl': {
        prop.rippleAge = 0.001;
        const splashR = prop.radiusX ? prop.radiusX - 14 : prop.radius - 6;
        this.pushEffect(prop.x, prop.y, 0.85, 8, Math.max(22, splashR), 0xd8f5f0, 'ripple');
        return [
          { kind: 'splash', x: prop.x, y: prop.y, count: 5, color: 0x9bd9d4 },
          { kind: 'ripple', x: prop.x, y: prop.y, count: 2, color: 0xe6f8f5 },
        ];
      }
      case 'bamboo_clacker':
        prop.swingVel += 10;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x - 4, prop.y + 4, 0.75, 6, 26, 0xc3ebe3, 'ripple');
        return [{ kind: 'splash', x: prop.x - 4, y: prop.y + 4, count: 4, color: 0x9fdad0 }];
      case 'catnip_planter':
        prop.swingVel += 9;
        this.pushEffect(prop.x, prop.y, 0.9, 10, 42, 0x82df94, 'catnip');
        return [{ kind: 'catnip', x: prop.x, y: prop.y, count: 6, color: 0x79d98c }];
      case 'zabuton_cushion':
      case 'donut_cat_bed':
      case 'woven_blanket':
      case 'pillow_perch':
      case 'garden_bench':
      case 'rooftop_crate':
      case 'taped_floor_square':
        return [{ kind: 'heart', x: prop.x, y: prop.y - 4, count: 2, color: 0xf28d8d }];
      case 'coffee_mug':
      case 'tetsubin_tea':
      case 'latte_saucer':
      case 'cocoa_mug':
        return [{ kind: 'steam', x: prop.x, y: prop.y - 6, count: 4 }];
      case 'wind_chime':
        prop.swingVel += 11;
        this.pushEffect(prop.x, prop.y, 0.85, 8, 42, 0xf2d298, 'chime');
        return [{ kind: 'note', x: prop.x, y: prop.y - 8, count: 3, color: 0xf6e2bc }];
      case 'tabletop_aquarium':
        prop.rippleAge = 0.001;
        return [{ kind: 'bubbles', x: prop.x, y: prop.y - 4, count: 5, color: 0x9ef0ff }];
      case 'litter_box':
        return [{ kind: 'dust', x: prop.x, y: prop.y, count: 5, color: 0xdccbb4 }];
      case 'fireplace_hearth':
        return [{ kind: 'fire', x: prop.x, y: prop.y - 4, count: 4, color: 0xffa64c }];
      case 'brass_lamp':
      case 'andon_lantern':
      case 'string_lights':
      case 'desk_candle':
        return prop.isActive
          ? [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 3, color: 0xffd27a }]
          : [];
      default:
        return [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 3 }];
    }
  }

  public handlePointerMove(x: number, y: number): InteractivePropState | null {
    if (!this.enabled) {
      return null;
    }

    let hoveredProp: InteractivePropRuntime | null = null;
    let bestDistSq = Infinity;

    for (const prop of this.props) {
      if (prop.hitTest(x, y)) {
        const dx = x - prop.x;
        const dy = y - prop.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          hoveredProp = prop;
        }
      }
    }

    for (const prop of this.props) {
      prop.hovered = prop === hoveredProp;
    }

    return hoveredProp;
  }

  public handlePointerClick(x: number, y: number): PropHitResult | null {
    // 1. Direct click on any scene interactive prop first (when props are enabled)
    if (this.enabled) {
      let clicked: InteractivePropRuntime | null = null;
      let bestDistSq = Infinity;
      for (const prop of this.props) {
        if (prop.hitTest(x, y)) {
          const dx = x - prop.x;
          const dy = y - prop.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            clicked = prop;
          }
        }
      }

      if (clicked) {
        return this.triggerPropClick(clicked, x, y);
      }
    }

    // 2. Direct click on a fluttering butterfly, firefly, bird, or night moth
    for (const critter of this.critters) {
      const dx = x - critter.x;
      const dy = y - critter.y;
      if (dx * dx + dy * dy <= 24 * 24) {
        const awayAngle = Math.atan2(dy || -1, dx || 1) + Math.PI + (Math.random() - 0.5) * 0.7;
        const speed = critter.kind === 'firefly' ? 58 : critter.kind === 'bird' ? 68 : 74;
        critter.vx = Math.cos(awayAngle) * speed;
        critter.vy = Math.sin(awayAngle) * speed;
        critter.startleBoost = 1;
        this.pushEffect(critter.x, critter.y, 0.55, 5, 26, critter.colorA, 'ripple');

        const kindMap: Record<AmbientCritter['kind'], { propKind: PropKind; label: string; feedback: string; sound?: CatSoundEvent }> = {
          firefly: {
            propKind: 'ambient_firefly',
            label: 'Glowing Firefly',
            feedback: 'Firefly darts with a golden trail',
          },
          butterfly: {
            propKind: 'ambient_butterfly',
            label: 'Courtyard Butterfly',
            feedback: 'Butterfly flutters playfully',
          },
          bird: {
            propKind: 'ambient_bird',
            label: 'Visiting Songbird',
            feedback: 'Songbird hops & chirps briskly',
            sound: 'chirp',
          },
          moth: {
            propKind: 'ambient_moth',
            label: 'Moonlit Night Moth',
            feedback: 'Night moth flits around the balcony light',
          },
        };
        const info = kindMap[critter.kind];
        const syntheticProp = this.createSyntheticHitProp(
          critter.id,
          info.propKind,
          info.label,
          critter.x,
          critter.y,
          18,
          'watch',
          260,
          this.simTime + 6,
          info.sound,
        );
        return {
          prop: syntheticProp,
          label: syntheticProp.label,
          feedbackText: info.feedback,
          interactionType: 'watch',
          attractPoint: { x: critter.x, y: critter.y },
          attractRadius: 260,
          attractDurationSec: 6,
          particles: [{ kind: 'sparkle', x: critter.x, y: critter.y, count: 6, color: critter.colorA }],
          soundEvent: info.sound,
        };
      }
    }

    // 3. Direct click on an active dropped treat
    for (const treat of this.treats) {
      const dx = x - treat.x;
      const dy = y - treat.y;
      const hitR = treat.radius + 10;
      if (dx * dx + dy * dy <= hitR * hitR) {
        this.pushEffect(treat.x, treat.y, 0.55, 6, 30, 0xf6c978, 'ripple');
        const syntheticProp = this.createSyntheticHitProp(
          treat.id,
          'dropped_treat',
          'Crunchy Cat Treats',
          treat.x,
          treat.y,
          treat.radius,
          'treat',
          320,
          this.simTime + 8,
          'crunch',
        );
        return {
          prop: syntheticProp,
          label: syntheticProp.label,
          feedbackText: 'Treats shimmer — snack time',
          interactionType: 'treat',
          attractPoint: { x: treat.x, y: treat.y },
          attractRadius: 320,
          attractDurationSec: 8,
          particles: [
            { kind: 'crumb', x: treat.x, y: treat.y, count: 5, color: 0xd98a4a },
            { kind: 'sparkle', x: treat.x, y: treat.y, count: 4, color: 0xffe09c },
          ],
          spawnedTreatPoint: { x: treat.x, y: treat.y },
          soundEvent: 'crunch',
        };
      }
    }

    return null;
  }

  public update(dt: number): void {
    const safeDt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
    this.simTime += safeDt;

    for (const prop of this.props) {
      if (prop.pulseTime > 0) {
        prop.pulseTime = Math.max(0, prop.pulseTime - safeDt * 1.9);
      }

      if (prop.pageFlipProgress > 0) {
        prop.pageFlipProgress += safeDt * 2.6;
        if (prop.pageFlipProgress >= 1) {
          prop.pageFlipProgress = 0;
        }
      }

      if (prop.rippleAge > 0) {
        prop.rippleAge += safeDt;
        if (prop.rippleAge >= 1.4) {
          prop.rippleAge = 0;
        }
      }

      if (Math.abs(prop.swingAngle) > 0.0005 || Math.abs(prop.swingVel) > 0.0005) {
        const stiffness = prop.kind === 'cat_tree_tower' ? 42 : 55;
        const damping = prop.kind === 'cat_tree_tower' ? 2.4 : 4.2;
        const acc = -stiffness * prop.swingAngle - damping * prop.swingVel;
        prop.swingVel += acc * safeDt;
        prop.swingAngle += prop.swingVel * safeDt;
        if (Math.abs(prop.swingAngle) < 0.001 && Math.abs(prop.swingVel) < 0.005) {
          prop.swingAngle = 0;
          prop.swingVel = 0;
        }
      }

      // Smoothly glide the drifting sunbeam patch across the sunlit studio floor
      if (prop.kind === 'drifting_sunbeam') {
        const minX = Math.max(150, this.rugBounds.x + 24);
        const maxX = Math.min(this.width - 140, this.rugBounds.x + this.rugBounds.width - 24);
        const minY = Math.max(84, this.rugBounds.y - 28);
        const maxY = Math.min(this.height - 132, this.rugBounds.y + this.rugBounds.height + 16);
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const spanX = Math.max(40, (maxX - minX) * 0.48);
        const spanY = Math.max(24, (maxY - minY) * 0.42);
        const phase = this.simTime * 0.14;
        prop.x = Math.round(cx + Math.sin(phase) * spanX);
        prop.y = Math.round(cy + Math.sin(phase * 0.65 + 0.8) * spanY);
        prop.interactPoint.x = prop.x;
        prop.interactPoint.y = prop.y;
      }

      const targetHover = prop.hovered ? 1 : 0;
      prop.hoverGlow += (targetHover - prop.hoverGlow) * Math.min(1, safeDt * 12);

      if (!isToggleWarmthKind(prop.kind) && !isAlwaysWarmKind(prop.kind) && prop.isActive && this.simTime >= prop.attractUntil) {
        prop.isActive = false;
      }

      const targetActive = prop.isActive ? 1 : 0;
      prop.activeBlend += (targetActive - prop.activeBlend) * Math.min(1, safeDt * 6.5);

      if (prop.occupantCatIds.length > 0 && this.simTime - prop.lastInteractedAt > 6) {
        prop.occupantCatIds.length = 0;
      }
    }

    for (let i = this.treats.length - 1; i >= 0; i--) {
      if (this.simTime - this.treats[i].spawnedAt > TREAT_LIFETIME_SEC) {
        this.treats.splice(i, 1);
      }
    }

    const margin = 34;
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      if (c.ttl !== null) {
        c.ttl -= safeDt;
        if (c.ttl <= 0) {
          this.critters.splice(i, 1);
          continue;
        }
      }

      c.startleBoost = Math.max(0, c.startleBoost - safeDt * 0.9);
      const speedMult = 1 + c.startleBoost * 0.85;
      const wander = Math.sin(this.simTime * c.freq + c.phase) * 0.9;
      const curAngle = Math.atan2(c.vy, c.vx) + wander * safeDt;
      const baseSpeed = c.kind === 'firefly' ? 24 : c.kind === 'bird' ? 26 : c.kind === 'moth' ? 40 : 36;
      const curSpeed = Math.hypot(c.vx, c.vy);
      const nextSpeed = curSpeed + (baseSpeed * speedMult - curSpeed) * Math.min(1, safeDt * 2.5);

      c.vx = Math.cos(curAngle) * nextSpeed;
      c.vy = Math.sin(curAngle) * nextSpeed;
      c.x += c.vx * safeDt;
      c.y += c.vy * safeDt;

      if (c.x < margin) {
        c.x = margin;
        c.vx = Math.abs(c.vx);
      } else if (c.x > this.width - margin) {
        c.x = this.width - margin;
        c.vx = -Math.abs(c.vx);
      }
      if (c.y < margin) {
        c.y = margin;
        c.vy = Math.abs(c.vy);
      } else if (c.y > this.height - margin) {
        c.y = this.height - margin;
        c.vy = -Math.abs(c.vy);
      }
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i];
      ef.age += safeDt;
      if (ef.age >= ef.duration) {
        this.effects.splice(i, 1);
      }
    }
  }

  private triggerPropClick(prop: InteractivePropRuntime, clickX = prop.x, clickY = prop.y): PropHitResult {
    prop.pulseTime = 1;
    prop.lastInteractedAt = this.simTime;
    prop.cooldownUntil = this.simTime + 0.12;

    if (prop.tippable && prop.isTipped) {
      prop.isTipped = false;
      prop.isActive = true;
      prop.attractUntil = this.simTime + 6;
      prop.swingVel += 8;
      this.pushEffect(prop.x, prop.y, 0.7, 10, 44, 0xf6df9b, 'chime');
      return {
        prop,
        label: prop.label,
        feedbackText:
          prop.kind === 'bookshelf_nook'
            ? 'Straightened the askew books'
            : `Stood ${prop.label} upright`,
        interactionType: prop.interactionType,
        attractPoint: { ...prop.interactPoint },
        attractRadius: prop.attractRadius,
        attractDurationSec: 6,
        particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 6, color: 0xf6df9b }],
      };
    }

    switch (prop.kind) {
      case 'brass_lamp':
      case 'andon_lantern':
      case 'string_lights':
      case 'desk_candle': {
        prop.isActive = !prop.isActive;
        const duration = prop.isActive ? 11 : 0;
        prop.attractUntil = prop.isActive ? this.simTime + duration : 0;
        if (prop.isActive) {
          this.pushEffect(prop.x, prop.y, 0.7, 14, 58, 0xffd27a, 'chime');
        }
        return {
          prop,
          label: prop.label,
          feedbackText: prop.isActive ? `${prop.label} glows warm` : `${prop.label} dimmed`,
          interactionType: 'warmth',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.isActive ? prop.attractRadius : 0,
          attractDurationSec: duration,
          particles: prop.isActive
            ? [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 6, color: 0xffd27a }]
            : [{ kind: 'dust', x: prop.x, y: prop.y, count: 3, color: 0xdfd0bc }],
        };
      }

      case 'fireplace_hearth':
      case 'radiator_heater':
      case 'warm_laptop':
      case 'drifting_sunbeam': {
        const duration = 10;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        this.pushEffect(prop.x, prop.y, 0.75, 12, 54, 0xffc66e, 'chime');
        return {
          prop,
          label: prop.label,
          feedbackText:
            prop.kind === 'fireplace_hearth'
              ? 'Fireplace crackles with cozy warmth'
              : prop.kind === 'drifting_sunbeam'
                ? 'Warm sunbeam shimmers across the floor'
                : `${prop.label} radiates cozy warmth`,
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            {
              kind: prop.kind === 'fireplace_hearth' ? 'fire' : 'sparkle',
              x: prop.x,
              y: prop.y,
              count: 6,
              color: 0xffb85c,
            },
          ],
          soundEvent: prop.kind === 'warm_laptop' ? 'purr' : undefined,
        };
      }

      case 'coffee_mug':
      case 'cocoa_mug':
      case 'tetsubin_tea':
      case 'latte_saucer': {
        const duration = 6.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.65, 10, 38, 0xf4e3cc, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: `Warm ${prop.label.toLowerCase()} aroma swirls`,
          interactionType: 'sniff',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'steam', x: prop.x, y: prop.y - 6, count: 6, color: 0xf7eee2 },
            { kind: 'ripple', x: prop.x, y: prop.y, count: 2, color: 0xf2dfc6 },
          ],
        };
      }

      case 'leather_journal': {
        const duration = 7.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.pageFlipProgress = 0.001;
        prop.swingVel += 13;
        return {
          prop,
          label: prop.label,
          feedbackText: 'Journal page turns & quill flutters',
          interactionType: 'play',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'sparkle', x: prop.x + 12, y: prop.y - 4, count: 5, color: 0xf7e7c6 },
            { kind: 'dust', x: prop.x, y: prop.y, count: 3, color: 0xefe2cc },
          ],
        };
      }

      case 'bookshelf_nook': {
        const duration = 8;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 10;
        return {
          prop,
          label: prop.label,
          feedbackText: 'Cats peek between cozy leather volumes',
          interactionType: 'ambush',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'dust', x: prop.x, y: prop.y, count: 5, color: 0xe6d4be }],
        };
      }

      case 'monstera_scratcher':
      case 'houseplant':
      case 'herb_pot':
      case 'jasmine_pot': {
        const duration = 8;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 11;
        return {
          prop,
          label: prop.label,
          feedbackText: `${prop.label} leaves rustle softly`,
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'leaf', x: prop.x, y: prop.y, count: 6, color: 0x5ca365 },
            { kind: 'sparkle', x: prop.x, y: prop.y, count: 4, color: 0xd0e9b8 },
          ],
        };
      }

      case 'koi_pond':
      case 'koi_birdbath': {
        const duration = 9.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        const rx = prop.radiusX ?? prop.radius;
        this.pushEffect(clickX, clickY, 0.95, 8, Math.max(36, rx - 10), 0xdff6f2, 'ripple');
        this.pushEffect(clickX + 4, clickY - 3, 1.2, 5, Math.max(44, rx), 0xbdebe4, 'ripple');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Koi dart beneath concentric pond ripples',
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'ripple', x: clickX, y: clickY, count: 3, color: 0xdff6f2 },
            { kind: 'splash', x: clickX, y: clickY, count: 8, color: 0x9cd8d4 },
          ],
          soundEvent: 'water_lap',
        };
      }

      case 'water_fountain':
      case 'water_glass':
      case 'water_bowl':
      case 'bamboo_clacker': {
        const duration = 8.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 14;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.85, 6, 36, 0xc0ebe2, 'ripple');
        return {
          prop,
          label: prop.label,
          feedbackText:
            prop.kind === 'bamboo_clacker'
              ? 'Bamboo clacker tips & ripples shimmer'
              : `Fresh water ripples in ${prop.label}`,
          interactionType: 'drink',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'ripple', x: prop.x, y: prop.y, count: 2, color: 0xc0ebe2 },
            { kind: 'splash', x: prop.x, y: prop.y, count: 6, color: 0x9ed9d0 },
          ],
          soundEvent: 'water_lap',
        };
      }

      case 'tabletop_aquarium': {
        const duration = 10;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.8, 10, 48, 0x92edf8, 'ripple');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Sprinkled fish flakes — tropical fish swarm!',
          interactionType: 'watch',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'bubbles', x: prop.x, y: prop.y - 4, count: 7, color: 0x9ef0ff },
            { kind: 'sparkle', x: prop.x, y: prop.y, count: 4, color: 0xf7df94 },
          ],
          soundEvent: 'bubble_pop',
        };
      }

      case 'catnip_planter': {
        const duration = 10;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 14;
        this.pushEffect(prop.x, prop.y, 0.95, 12, 56, 0x82df94, 'catnip');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Catnip sparkles drift through the yard',
          interactionType: 'catnip',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'catnip', x: prop.x, y: prop.y, count: 9, color: 0x79d98c },
            { kind: 'leaf', x: prop.x, y: prop.y, count: 5, color: 0x5fb871 },
          ],
        };
      }

      case 'butterfly_stone': {
        const duration = 9;
        const critterKind: AmbientCritter['kind'] =
          this.effectiveLighting === 'night'
            ? 'firefly'
            : this.nextCritterSeq % 3 === 0
              ? 'bird'
              : 'butterfly';
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        const launchAngle = Math.atan2(
          this.rugBounds.y + this.rugBounds.height * 0.5 - prop.y,
          this.rugBounds.x + this.rugBounds.width * 0.5 - prop.x,
        );
        const launchDist = prop.radius + 16;
        const spawned = this.spawnCritter(
          prop.x + Math.cos(launchAngle) * launchDist,
          prop.y + Math.sin(launchAngle) * launchDist,
          critterKind,
          false,
        );
        this.pushEffect(prop.x, prop.y, 0.7, 8, 42, spawned.colorA, 'chime');
        return {
          prop,
          label: prop.label,
          feedbackText:
            critterKind === 'firefly'
              ? 'Glowing firefly rises from the stone'
              : critterKind === 'bird'
                ? 'Visiting songbird perches & chirps'
                : 'Butterfly flutters into the courtyard',
          interactionType: 'watch',
          attractPoint: { x: spawned.x, y: spawned.y },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 6, color: spawned.colorA }],
          spawnedCritter: critterKind,
          soundEvent: critterKind === 'bird' ? 'chirp' : undefined,
        };
      }

      case 'wind_chime': {
        const duration = 7.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 17;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.85, 8, 52, 0xf4d498, 'chime');
        this.pushEffect(prop.x, prop.y, 1.15, 14, 68, 0xf8e2b4, 'chime');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Terracotta wind chime rings softly',
          interactionType: 'play',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'chime', x: prop.x, y: prop.y, count: 3, color: 0xf3d49b },
            { kind: 'note', x: prop.x, y: prop.y - 8, count: 4, color: 0xf7e3be },
          ],
          soundEvent: 'bell',
        };
      }

      case 'cat_tree_tower':
      case 'cat_tree_hammock': {
        const duration = 9;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 19;
        this.pushEffect(prop.x - 18, prop.y + 8, 0.65, 6, 32, 0xf08c74, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Cat tree pom-pom swings playfully',
          interactionType: 'perch_high',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'sparkle', x: prop.x - 18, y: prop.y + 8, count: 6, color: 0xf08c74 },
            { kind: 'dust', x: prop.x, y: prop.y, count: 3, color: 0xebd9c5 },
          ],
        };
      }

      case 'treat_jar': {
        const duration = 9.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        const spreadAngle = (this.nextTreatSeq * 1.45) % (Math.PI * 2);
        const dropX = prop.interactPoint.x + Math.cos(spreadAngle) * 14;
        const dropY = prop.interactPoint.y + Math.sin(spreadAngle) * 12;
        const treat = this.spawnTreat(dropX, dropY);
        return {
          prop,
          label: prop.label,
          feedbackText: 'Kibble treats scattered by the bowl',
          interactionType: 'treat',
          attractPoint: { x: treat.x, y: treat.y },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'crumb', x: treat.x, y: treat.y, count: 8, color: 0xd98a4a },
            { kind: 'sparkle', x: treat.x, y: treat.y, count: 5, color: 0xffe09c },
          ],
          spawnedTreatPoint: { x: treat.x, y: treat.y },
          soundEvent: 'crunch',
        };
      }

      case 'litter_box': {
        const duration = 8;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        this.pushEffect(prop.x, prop.y, 0.65, 10, 40, 0xcbe8f6, 'chime');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Litter box freshly scooped & tidied',
          interactionType: 'litter',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 7, color: 0xcbe8f6 }],
        };
      }

      case 'paper_bag_prop':
      case 'cat_tunnel':
      case 'blanket_fort': {
        const duration = 8.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 12;
        this.pushEffect(prop.x, prop.y, 0.6, 10, 38, 0xe8c796, 'ripple');
        return {
          prop,
          label: prop.label,
          feedbackText: `${prop.label} crinkles invitingly`,
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 5, color: 0xf4dcb4 }],
          soundEvent: 'crinkle',
        };
      }

      case 'blanket_lump': {
        const duration = 7.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 16;
        return {
          prop,
          label: prop.label,
          feedbackText: 'Mystery blanket lump wiggles & purrs!',
          interactionType: 'play',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'heart', x: prop.x, y: prop.y - 6, count: 3, color: 0xf29494 }],
          soundEvent: 'purr',
        };
      }

      case 'zabuton_cushion':
      case 'donut_cat_bed':
      case 'woven_blanket':
      case 'pillow_perch':
      case 'garden_bench':
      case 'rooftop_crate':
      case 'taped_floor_square': {
        const duration = 9.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        this.pushEffect(prop.x, prop.y, 0.65, 14, 44, 0xf4dec0, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: `${prop.label} plumped extra cozy`,
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'sparkle', x: prop.x, y: prop.y, count: 5, color: 0xf5dfb8 },
            { kind: 'dust', x: prop.x, y: prop.y, count: 4, color: 0xf3e6d6 },
          ],
        };
      }

      default: {
        const duration = 7;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        this.pushEffect(prop.x, prop.y, 0.65, 10, 40, 0xf6dfaa, 'ripple');
        return {
          prop,
          label: prop.label,
          feedbackText: `${prop.label} stirred`,
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 5 }],
        };
      }
    }
  }

  private createSyntheticHitProp(
    id: string,
    kind: PropKind,
    label: string,
    x: number,
    y: number,
    radius: number,
    interactionType: PropInteractionType,
    attractRadius: number,
    attractUntil: number,
    soundEvent?: CatSoundEvent,
  ): InteractivePropState {
    return {
      id,
      kind,
      label,
      scene: this.theme,
      x,
      y,
      radius,
      interactionType,
      solid: false,
      interactPoint: { x, y },
      attractRadius,
      isActive: true,
      attractUntil,
      hovered: false,
      cooldownUntil: this.simTime + 0.12,
      soundEvent,
      hitTest(px: number, py: number): boolean {
        const dx = px - x;
        const dy = py - y;
        return dx * dx + dy * dy <= (radius + 6) * (radius + 6);
      },
    };
  }

  private pushEffect(
    x: number,
    y: number,
    duration: number,
    startRadius: number,
    endRadius: number,
    color: number,
    style: ClickRippleEffect['style'],
  ): void {
    if (this.effects.length >= 24) {
      this.effects.shift();
    }
    this.effects.push({
      id: this.nextEffectSeq++,
      x,
      y,
      age: 0,
      duration,
      startRadius,
      endRadius,
      color,
      style,
    });
  }

  private rebuildProps(preserveSameThemeState: boolean): void {
    const prevById = new Map<string, InteractivePropRuntime>();
    if (preserveSameThemeState) {
      for (const p of this.props) {
        prevById.set(p.id, p);
      }
    }

    const defs = computeScenePropDefinitions(this.theme, this.width, this.height, this.rugBounds);
    this.props = defs.map((def) => {
      const next = createInteractiveProp(def);
      const prev = prevById.get(def.id);
      if (prev) {
        next.isActive = prev.isActive;
        next.attractUntil = prev.attractUntil;
        next.activeBlend = prev.activeBlend;
        next.hovered = prev.hovered;
        next.hoverGlow = prev.hoverGlow;
        next.isTipped = prev.isTipped;
        next.interactionCount = prev.interactionCount;
      }
      return next;
    });

    this.obstacles = [];
    let obstacleId = -201;
    for (const prop of this.props) {
      if (!prop.solid) continue;
      const boxRx = Math.max(18, Math.round((prop.radiusX ?? prop.radius) * 0.78));
      const boxRy = Math.max(18, Math.round((prop.radiusY ?? prop.radius) * 0.78));
      this.obstacles.push({
        id: obstacleId--,
        x: prop.x - boxRx,
        y: prop.y - boxRy,
        width: boxRx * 2,
        height: boxRy * 2,
        label: prop.label,
      });
    }
  }

  private seedAmbientCritters(): void {
    this.critters.length = 0;

    if (this.theme === 'garden') {
      const kind = this.effectiveLighting === 'night' ? 'firefly' : 'butterfly';
      const count = kind === 'firefly' ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const cx = this.rugBounds.x + this.rugBounds.width * (0.28 + i * 0.24);
        const cy = this.rugBounds.y + this.rugBounds.height * (0.3 + (i % 2) * 0.36);
        this.spawnCritter(cx, cy, kind, true);
      }
      if (this.effectiveLighting !== 'night') {
        this.spawnCritter(
          this.rugBounds.x + this.rugBounds.width * 0.72,
          this.rugBounds.y + this.rugBounds.height * 0.28,
          'bird',
          true,
        );
      }
    } else if (this.theme === 'night_balcony') {
      for (let i = 0; i < 2; i++) {
        this.spawnCritter(
          this.rugBounds.x + this.rugBounds.width * (0.3 + i * 0.38),
          this.rugBounds.y + 42 + i * 36,
          'moth',
          true,
        );
      }
    } else if (this.theme === 'rooftop') {
      if (this.effectiveLighting === 'night') {
        for (let i = 0; i < 2; i++) {
          this.spawnCritter(
            this.rugBounds.x + this.rugBounds.width * (0.35 + i * 0.32),
            this.rugBounds.y + 60 + i * 44,
            'firefly',
            true,
          );
        }
      } else {
        this.spawnCritter(
          this.rugBounds.x + this.rugBounds.width * 0.64,
          this.rugBounds.y + 38,
          'bird',
          true,
        );
      }
    }
  }

  private syncOutdoorAmbientCritterKinds(): void {
    const targetKind: AmbientCritter['kind'] =
      this.effectiveLighting === 'night' ? 'firefly' : this.theme === 'rooftop' ? 'bird' : 'butterfly';
    for (const c of this.critters) {
      if (!c.isAmbient) continue;
      if (c.kind === 'bird' && this.theme === 'garden' && this.effectiveLighting !== 'night') continue;
      c.kind = targetKind;
      if (targetKind === 'firefly') {
        c.colorA = 0xe6f86d;
        c.colorB = 0xfff8b8;
      } else if (targetKind === 'bird') {
        c.colorA = 0x62a4db;
        c.colorB = 0xf4e8d4;
      } else {
        c.colorA = 0xf7c552;
        c.colorB = 0x3a2a1e;
      }
    }
  }
}
