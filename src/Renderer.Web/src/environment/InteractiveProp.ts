import type {
  AabbRect,
  AmbientCritter,
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

export type PropAnchorSlot = 'upper_right' | 'lower_right' | 'upper_left' | 'lower_left';

interface ScenePropBlueprint {
  readonly id: string;
  readonly kind: PropKind;
  readonly label: string;
  readonly slot: PropAnchorSlot;
  readonly radius: number;
  readonly interactionType: PropInteractionType;
  readonly solid: boolean;
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
      warmRadius: 128,
      defaultActive: true,
    },
    {
      id: 'study-monstera-scratcher',
      kind: 'monstera_scratcher',
      label: 'Monstera & Sisal Post',
      slot: 'lower_right',
      radius: 38,
      interactionType: 'scratch',
      solid: true,
      attractRadius: 245,
    },
    {
      id: 'study-coffee-mug',
      kind: 'coffee_mug',
      label: 'Steaming Coffee Mug',
      slot: 'upper_left',
      radius: 30,
      interactionType: 'sniff',
      solid: true,
      attractRadius: 215,
    },
    {
      id: 'study-leather-journal',
      kind: 'leather_journal',
      label: 'Leather Journal & Quill',
      slot: 'lower_left',
      radius: 34,
      interactionType: 'play',
      solid: false,
      attractRadius: 235,
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
      warmRadius: 138,
      defaultActive: true,
    },
    {
      id: 'tatami-zabuton-cushion',
      kind: 'zabuton_cushion',
      label: 'Embroidered Zabuton',
      slot: 'upper_left',
      radius: 34,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'tatami-bamboo-clacker',
      kind: 'bamboo_clacker',
      label: 'Shishi-Odoshi & Crane',
      slot: 'lower_left',
      radius: 34,
      interactionType: 'play',
      solid: true,
      attractRadius: 255,
    },
  ],
  garden: [
    {
      id: 'garden-koi-birdbath',
      kind: 'koi_birdbath',
      label: 'Mossy Koi Basin',
      slot: 'upper_right',
      radius: 44,
      interactionType: 'water',
      solid: true,
      attractRadius: 265,
    },
    {
      id: 'garden-wind-chime',
      kind: 'wind_chime',
      label: 'Terracotta Wind Chime',
      slot: 'lower_right',
      radius: 30,
      interactionType: 'play',
      solid: false,
      attractRadius: 280,
    },
    {
      id: 'garden-catnip-planter',
      kind: 'catnip_planter',
      label: 'Catnip & Lavender Planter',
      slot: 'upper_left',
      radius: 34,
      interactionType: 'catnip',
      solid: true,
      attractRadius: 315,
    },
    {
      id: 'garden-butterfly-stone',
      kind: 'butterfly_stone',
      label: 'Butterfly Perch Stone',
      slot: 'lower_left',
      radius: 30,
      interactionType: 'play',
      solid: false,
      attractRadius: 270,
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
      label: 'Wooden Cat Tree Tower',
      slot: 'lower_right',
      radius: 40,
      interactionType: 'scratch',
      solid: false,
      attractRadius: 280,
    },
    {
      id: 'cafe-donut-bed',
      kind: 'donut_cat_bed',
      label: 'Plush Donut Cat Bed',
      slot: 'upper_left',
      radius: 34,
      interactionType: 'cozy',
      solid: false,
      attractRadius: 260,
    },
    {
      id: 'cafe-treat-jar',
      kind: 'treat_jar',
      label: 'Ceramic Treat Jar & Bowl',
      slot: 'lower_left',
      radius: 34,
      interactionType: 'treat',
      solid: true,
      attractRadius: 315,
    },
  ],
};

const MAX_ACTIVE_TREATS = 8;
const MAX_ACTIVE_CRITTERS = 6;
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
  return kind === 'brass_lamp' || kind === 'andon_lantern';
}

function computeInteractPoint(
  x: number,
  y: number,
  radius: number,
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
  const offset = radius + 18;
  return {
    x: clamp(Math.round(x + (dx / dist) * offset), 28, viewWidth - 28),
    y: clamp(Math.round(y + (dy / dist) * offset), 28, viewHeight - 28),
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

  // Center is inside expanded rect; push to closest edge.
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

  // Reserve space for desktop icons on the left edge without starving compact windows.
  const iconSafeX = w >= 1120 ? 236 : w >= 860 ? 156 : 92;
  const leftBandWidth = rug.x - iconSafeX;
  const rightBandWidth = w - rugRight;

  const blueprints = SCENE_BLUEPRINTS[theme];
  const placed: Array<{ bp: ScenePropBlueprint; x: number; y: number }> = [];

  for (const bp of blueprints) {
    const r = bp.radius;
    const minBandForSide = r * 2 + 26;
    let x = rugCenter.x;
    let y = rugCenter.y;

    switch (bp.slot) {
      case 'upper_right': {
        if (rightBandWidth >= minBandForSide) {
          const offset = clamp(rightBandWidth * 0.44, r + 16, 148);
          x = rugRight + offset;
          y = clamp(rug.y + Math.min(48, rug.height * 0.2), margin + r, h - margin - r);
        } else {
          x = clamp(rug.x + rug.width * 0.78, iconSafeX + r, w - margin - r);
          y = clamp(rug.y - r - 18, margin + r, h - margin - r);
        }
        break;
      }
      case 'lower_right': {
        const fabTopLimit = h - FAB_SAFE_HEIGHT - r;
        if (rightBandWidth >= minBandForSide) {
          const offset = clamp(rightBandWidth * 0.44, r + 16, 144);
          x = rugRight + offset;
          const desiredY = rugBottom - Math.min(40, rug.height * 0.18);
          y = clamp(Math.min(desiredY, fabTopLimit), margin + r + 96, h - margin - r);
        } else {
          x = clamp(rug.x + rug.width * 0.7, iconSafeX + r, w - FAB_SAFE_WIDTH - r);
          y = clamp(rugBottom + r + 18, margin + r, h - margin - r);
        }
        break;
      }
      case 'upper_left': {
        if (leftBandWidth >= minBandForSide) {
          const offset = clamp(leftBandWidth * 0.48, r + 14, 148);
          x = Math.max(iconSafeX + r + 6, rug.x - offset);
          y = clamp(rug.y + Math.min(52, rug.height * 0.2), margin + r, h - margin - r);
        } else {
          x = clamp(Math.max(iconSafeX + r + 10, rug.x + rug.width * 0.22), margin + r, w - margin - r);
          y = clamp(rug.y - r - 18, margin + r, h - margin - r);
        }
        break;
      }
      case 'lower_left': {
        if (leftBandWidth >= minBandForSide) {
          const offset = clamp(leftBandWidth * 0.48, r + 14, 148);
          x = Math.max(iconSafeX + r + 6, rug.x - offset);
          y = clamp(rugBottom - Math.min(44, rug.height * 0.18), margin + r, h - margin - r);
        } else {
          x = clamp(Math.max(iconSafeX + r + 10, rug.x + rug.width * 0.26), margin + r, w - FAB_SAFE_WIDTH - r);
          y = clamp(rugBottom + r + 18, margin + r, h - margin - r);
        }
        break;
      }
    }

    // Ensure outside central rug bounds whenever viewport space allows.
    const clearedRug = resolveCircleOutsideRect(x, y, r, rug.x, rug.y, rug.width, rug.height, 8);
    x = clamp(clearedRug.x, margin + r, w - margin - r);
    y = clamp(clearedRug.y, margin + r, h - margin - r);

    // Keep clear of bottom-right FAB footprint.
    if (x + r > w - FAB_SAFE_WIDTH && y + r > h - FAB_SAFE_HEIGHT) {
      if (rightBandWidth >= minBandForSide) {
        y = clamp(h - FAB_SAFE_HEIGHT - r - 6, margin + r, h - margin - r);
      } else {
        x = clamp(w - FAB_SAFE_WIDTH - r - 6, margin + r, w - margin - r);
      }
    }

    placed.push({ bp, x: Math.round(x), y: Math.round(y) });
  }

  // Pairwise non-overlap pass between props.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.bp.radius + b.bp.radius + 16;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          const nx = dist > 0.01 ? dx / dist : 0;
          const ny = dist > 0.01 ? dy / dist : 1;
          const push = (minDist - dist) * 0.5 + 1;
          a.x = Math.round(clamp(a.x - nx * push, margin + a.bp.radius, w - margin - a.bp.radius));
          a.y = Math.round(clamp(a.y - ny * push, margin + a.bp.radius, h - margin - a.bp.radius));
          b.x = Math.round(clamp(b.x + nx * push, margin + b.bp.radius, w - margin - b.bp.radius));
          b.y = Math.round(clamp(b.y + ny * push, margin + b.bp.radius, h - margin - b.bp.radius));
        }
      }
    }
  }

  return placed.map(({ bp, x, y }) => ({
    id: bp.id,
    kind: bp.kind,
    label: bp.label,
    scene: theme,
    x,
    y,
    radius: bp.radius,
    interactionType: bp.interactionType,
    solid: bp.solid,
    interactPoint: computeInteractPoint(x, y, bp.radius, bp.solid, bp.kind, rugCenter, w, h),
    attractRadius: bp.attractRadius,
    warmRadius: bp.warmRadius,
  }));
}

export function createInteractiveProp(def: PropDefinition): InteractivePropRuntime {
  const isWarmToggle = isToggleWarmthKind(def.kind);
  const initialActive = isWarmToggle;
  const prop: InteractivePropRuntime = {
    ...def,
    solid: def.solid ?? false,
    interactPoint: def.interactPoint ? { ...def.interactPoint } : { x: def.x, y: def.y },
    isActive: initialActive,
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
    hitTest(px: number, py: number): boolean {
      const hitR = prop.radius + 7;
      const dx = px - prop.x;
      const dy = py - prop.y;
      return dx * dx + dy * dy <= hitR * hitR;
    },
  };
  return prop;
}

export function isPropAttracting(prop: InteractivePropState, nowSec: number): boolean {
  return prop.attractUntil > nowSec;
}

/**
 * Pure TypeScript simulation & interaction engine for all 4 scenes' interactive props,
 * user-dropped treats, warm light zones, and ambient/spawned butterflies & fireflies.
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
    if (prevNight !== nextNight && this.theme === 'garden') {
      this.syncGardenAmbientCritterKinds();
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

    // Clamp existing dynamic treats & critters cleanly inside new bounds.
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
      if (prop.interactionType === 'warmth' && prop.isActive) {
        zones.push({
          id: prop.id,
          x: prop.x,
          y: prop.y,
          radius: prop.warmRadius ?? 124,
          intensity: lightingMult,
        });
      }
    }

    // Natural sunlit warm perch spot in courtyard during Day / Golden hour.
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

  public spawnTreat(x?: number, y?: number): DroppedTreat {
    let tx: number;
    let ty: number;

    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      tx = clamp(Math.round(x), 40, this.width - 40);
      ty = clamp(Math.round(y), 40, this.height - 40);
    } else {
      // Pick a pleasant clear drop spot on/around the rug when triggered from the UI dock.
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
    kind?: 'butterfly' | 'firefly',
    isAmbient = false,
  ): AmbientCritterRuntime {
    const resolvedKind = kind ?? (this.effectiveLighting === 'night' ? 'firefly' : 'butterfly');

    // Enforce critter cap by evicting oldest temporary (non-ambient) critter first.
    if (this.critters.length >= MAX_ACTIVE_CRITTERS) {
      const tempIdx = this.critters.findIndex((c) => !c.isAmbient);
      this.critters.splice(tempIdx >= 0 ? tempIdx : 0, 1);
    }

    const seq = this.nextCritterSeq++;
    const angle = ((seq * 1.618) % 1) * Math.PI * 2;
    const speed = resolvedKind === 'firefly' ? 24 : 34;

    const palette =
      resolvedKind === 'firefly'
        ? { a: 0xe6f86d, b: 0xfff8b8 }
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
      if (prop.occupantCatIds.length > 3) {
        prop.occupantCatIds.shift();
      }
    }

    prop.pulseTime = Math.max(prop.pulseTime, 0.75);
    prop.lastInteractedAt = this.simTime;

    switch (prop.kind) {
      case 'monstera_scratcher':
        prop.swingVel += 8;
        return [{ kind: 'leaf', x: prop.x, y: prop.y, count: 4, color: 0x5da465 }];
      case 'cat_tree_tower':
        prop.swingVel += 13;
        return [{ kind: 'sparkle', x: prop.x - 18, y: prop.y + 8, count: 4, color: 0xf08c74 }];
      case 'leather_journal':
        prop.swingVel += 9;
        prop.pageFlipProgress = prop.pageFlipProgress <= 0 ? 0.001 : prop.pageFlipProgress;
        return [{ kind: 'sparkle', x: prop.x + 12, y: prop.y - 2, count: 3, color: 0xf7e7c8 }];
      case 'koi_birdbath':
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.85, 8, prop.radius - 6, 0xd8f5f0, 'ripple');
        return [
          { kind: 'splash', x: prop.x, y: prop.y, count: 5, color: 0x9bd9d4 },
          { kind: 'ripple', x: prop.x, y: prop.y, count: 2, color: 0xe6f8f5 },
        ];
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
        return [{ kind: 'dust', x: prop.x, y: prop.y, count: 4, color: 0xf2e4d0 }];
      case 'coffee_mug':
      case 'tetsubin_tea':
      case 'latte_saucer':
        return [{ kind: 'steam', x: prop.x, y: prop.y - 6, count: 4 }];
      case 'wind_chime':
        prop.swingVel += 11;
        this.pushEffect(prop.x, prop.y, 0.85, 8, 42, 0xf2d298, 'chime');
        return [{ kind: 'note', x: prop.x, y: prop.y - 8, count: 3, color: 0xf6e2bc }];
      case 'brass_lamp':
      case 'andon_lantern':
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
    // 1. Direct click on any scene interactive prop first (when props are enabled),
    // so passing critters or newly launched butterflies never steal clicks from scene props.
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
        return this.triggerPropClick(clicked);
      }
    }

    // 2. Direct click on a fluttering butterfly or glowing firefly!
    for (const critter of this.critters) {
      const dx = x - critter.x;
      const dy = y - critter.y;
      if (dx * dx + dy * dy <= 24 * 24) {
        const awayAngle = Math.atan2(dy || -1, dx || 1) + Math.PI + (Math.random() - 0.5) * 0.7;
        const speed = critter.kind === 'firefly' ? 58 : 74;
        critter.vx = Math.cos(awayAngle) * speed;
        critter.vy = Math.sin(awayAngle) * speed;
        critter.startleBoost = 1;
        this.pushEffect(critter.x, critter.y, 0.55, 5, 26, critter.colorA, 'ripple');

        const syntheticProp = this.createSyntheticHitProp(
          critter.id,
          critter.kind === 'firefly' ? 'ambient_firefly' : 'ambient_butterfly',
          critter.kind === 'firefly' ? 'Glowing Firefly' : 'Courtyard Butterfly',
          critter.x,
          critter.y,
          18,
          'play',
          260,
          this.simTime + 6,
        );
        return {
          prop: syntheticProp,
          label: syntheticProp.label,
          feedbackText:
            critter.kind === 'firefly' ? 'Firefly darts with a golden trail' : 'Butterfly flutters playfully',
          interactionType: 'play',
          attractPoint: { x: critter.x, y: critter.y },
          attractRadius: 260,
          attractDurationSec: 6,
          particles: [{ kind: 'sparkle', x: critter.x, y: critter.y, count: 6, color: critter.colorA }],
        };
      }
    }

    // 3. Direct click on an active dropped treat (boosts sparkle & lure!).
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
        };
      }
    }

    return null;
  }

  public update(dt: number): void {
    const safeDt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
    this.simTime += safeDt;

    // 1. Update props (spring dynamics, hover fade, lamp glow fade, active timers)
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

      // Critically-underdamped spring for swinging pom-pom, wind chime, quill, bamboo clacker, leaves
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

      const targetHover = prop.hovered ? 1 : 0;
      prop.hoverGlow += (targetHover - prop.hoverGlow) * Math.min(1, safeDt * 12);

      // Expire timed active states (keep toggle lamps controlled by user toggle).
      if (!isToggleWarmthKind(prop.kind) && prop.isActive && this.simTime >= prop.attractUntil) {
        prop.isActive = false;
      }

      const targetActive = prop.isActive ? 1 : 0;
      prop.activeBlend += (targetActive - prop.activeBlend) * Math.min(1, safeDt * 6.5);

      // Clear stale cat occupancy records gently.
      if (prop.occupantCatIds.length > 0 && this.simTime - prop.lastInteractedAt > 6) {
        prop.occupantCatIds.length = 0;
      }
    }

    // 2. Expire very old untouched treats cleanly.
    for (let i = this.treats.length - 1; i >= 0; i--) {
      if (this.simTime - this.treats[i].spawnedAt > TREAT_LIFETIME_SEC) {
        this.treats.splice(i, 1);
      }
    }

    // 3. Update drifting butterflies & fireflies.
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

      // Smooth organic wandering turn force.
      const wander = Math.sin(this.simTime * c.freq + c.phase) * 0.9;
      const curAngle = Math.atan2(c.vy, c.vx) + wander * safeDt;
      const baseSpeed = c.kind === 'firefly' ? 24 : 36;
      const curSpeed = Math.hypot(c.vx, c.vy);
      const nextSpeed = curSpeed + (baseSpeed * speedMult - curSpeed) * Math.min(1, safeDt * 2.5);

      c.vx = Math.cos(curAngle) * nextSpeed;
      c.vy = Math.sin(curAngle) * nextSpeed;
      c.x += c.vx * safeDt;
      c.y += c.vy * safeDt;

      // Softly steer back inside viewport edges.
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

    // 4. Advance click ripple / chime / catnip ring effects.
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i];
      ef.age += safeDt;
      if (ef.age >= ef.duration) {
        this.effects.splice(i, 1);
      }
    }
  }

  private triggerPropClick(prop: InteractivePropRuntime): PropHitResult {
    prop.pulseTime = 1;
    prop.lastInteractedAt = this.simTime;
    prop.cooldownUntil = this.simTime + 0.12;

    switch (prop.kind) {
      case 'brass_lamp': {
        prop.isActive = !prop.isActive;
        const duration = prop.isActive ? 11 : 0;
        prop.attractUntil = prop.isActive ? this.simTime + duration : 0;
        if (prop.isActive) {
          this.pushEffect(prop.x, prop.y, 0.7, 14, 58, 0xffd27a, 'chime');
        }
        return {
          prop,
          label: prop.label,
          feedbackText: prop.isActive ? 'Brass desk lamp glows warm' : 'Brass desk lamp switched off',
          interactionType: 'warmth',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.isActive ? prop.attractRadius : 0,
          attractDurationSec: duration,
          particles: prop.isActive
            ? [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 6, color: 0xffd27a }]
            : [{ kind: 'dust', x: prop.x, y: prop.y, count: 3, color: 0xdfd0bc }],
        };
      }

      case 'coffee_mug': {
        const duration = 6.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.65, 10, 38, 0xf4e3cc, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Rich coffee aroma swirls',
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

      case 'monstera_scratcher': {
        const duration = 8;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 11;
        return {
          prop,
          label: prop.label,
          feedbackText: 'Monstera leaves rustle softly',
          interactionType: 'scratch',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'leaf', x: prop.x - 4, y: prop.y, count: 6, color: 0x5ca365 },
            { kind: 'sparkle', x: prop.x + 10, y: prop.y, count: 4, color: 0xd0e9b8 },
          ],
        };
      }

      case 'andon_lantern': {
        prop.isActive = !prop.isActive;
        const duration = prop.isActive ? 12 : 0;
        prop.attractUntil = prop.isActive ? this.simTime + duration : 0;
        if (prop.isActive) {
          this.pushEffect(prop.x, prop.y, 0.75, 14, 62, 0xffbe63, 'chime');
        }
        return {
          prop,
          label: prop.label,
          feedbackText: prop.isActive ? 'Paper andon glows golden' : 'Paper andon dimmed',
          interactionType: 'warmth',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.isActive ? prop.attractRadius : 0,
          attractDurationSec: duration,
          particles: prop.isActive
            ? [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 7, color: 0xffc66e }]
            : [{ kind: 'dust', x: prop.x, y: prop.y, count: 3, color: 0xd7c8b6 }],
        };
      }

      case 'tetsubin_tea': {
        const duration = 6.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x + 12, prop.y + 4, 0.65, 6, 30, 0xb8dca2, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Fragrant matcha steam pours',
          interactionType: 'sniff',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'steam', x: prop.x + 10, y: prop.y - 4, count: 7, color: 0xe3f0d8 },
            { kind: 'sparkle', x: prop.x + 10, y: prop.y, count: 4, color: 0x98c97a },
          ],
        };
      }

      case 'zabuton_cushion': {
        const duration = 9.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        this.pushEffect(prop.x, prop.y, 0.65, 14, 44, 0xe8ca8a, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Zabuton cushion plumped cozy',
          interactionType: 'cozy',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'sparkle', x: prop.x, y: prop.y, count: 5, color: 0xe6c687 },
            { kind: 'dust', x: prop.x, y: prop.y, count: 5, color: 0xf4e8d4 },
          ],
        };
      }

      case 'bamboo_clacker': {
        const duration = 8;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 16;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x - 6, prop.y + 4, 0.85, 6, 36, 0xc0ebe2, 'ripple');
        this.pushEffect(prop.x + 12, prop.y - 8, 0.7, 5, 28, 0xf2d298, 'chime');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Bamboo tips & origami crane flutters',
          interactionType: 'play',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'ripple', x: prop.x - 6, y: prop.y + 4, count: 2, color: 0xc0ebe2 },
            { kind: 'splash', x: prop.x - 6, y: prop.y + 4, count: 5, color: 0x9ed9d0 },
            { kind: 'chime', x: prop.x, y: prop.y, count: 2, color: 0xf2d198 },
          ],
        };
      }

      case 'koi_birdbath': {
        const duration = 8.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x, prop.y, 0.9, 8, prop.radius - 4, 0xdff6f2, 'ripple');
        this.pushEffect(prop.x + 6, prop.y - 4, 1.15, 5, prop.radius + 4, 0xbdebe4, 'ripple');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Ripples shimmer across the koi basin',
          interactionType: 'water',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'ripple', x: prop.x, y: prop.y, count: 3, color: 0xdff6f2 },
            { kind: 'splash', x: prop.x, y: prop.y, count: 7, color: 0x9cd8d4 },
          ],
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
            { kind: 'sparkle', x: prop.x, y: prop.y, count: 5, color: 0xb695e6 },
          ],
        };
      }

      case 'butterfly_stone': {
        const duration = 9;
        const critterKind = this.effectiveLighting === 'night' ? 'firefly' : 'butterfly';
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
              : 'Butterfly flutters into the courtyard',
          interactionType: 'play',
          attractPoint: { x: spawned.x, y: spawned.y },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 6, color: spawned.colorA }],
          spawnedCritter: critterKind,
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
        };
      }

      case 'cat_tree_tower': {
        const duration = 9;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.swingVel += 19;
        this.pushEffect(prop.x - 18, prop.y + 8, 0.65, 6, 32, 0xf08c74, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Cat tree pom-pom swings playfully',
          interactionType: 'scratch',
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
        };
      }

      case 'latte_saucer': {
        const duration = 6.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        prop.rippleAge = 0.001;
        this.pushEffect(prop.x - 10, prop.y - 6, 0.65, 8, 34, 0xf7e6d2, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Latte heart foam & croissant aroma swirl',
          interactionType: 'sniff',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'steam', x: prop.x - 10, y: prop.y - 6, count: 6, color: 0xf9efe2 },
            { kind: 'heart', x: prop.x - 10, y: prop.y - 10, count: 2, color: 0xe6887a },
          ],
        };
      }

      case 'donut_cat_bed': {
        const duration = 9.5;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        this.pushEffect(prop.x, prop.y, 0.65, 14, 44, 0xf4dec0, 'clink');
        return {
          prop,
          label: prop.label,
          feedbackText: 'Plush donut bed fluffed cozy',
          interactionType: 'cozy',
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [
            { kind: 'sparkle', x: prop.x, y: prop.y, count: 5, color: 0xf5dfb8 },
            { kind: 'dust', x: prop.x, y: prop.y, count: 5, color: 0xf3e6d6 },
          ],
        };
      }

      default: {
        const duration = 6;
        prop.isActive = true;
        prop.attractUntil = this.simTime + duration;
        return {
          prop,
          label: prop.label,
          feedbackText: `${prop.label} stirred`,
          interactionType: prop.interactionType,
          attractPoint: { ...prop.interactPoint },
          attractRadius: prop.attractRadius,
          attractDurationSec: duration,
          particles: [{ kind: 'sparkle', x: prop.x, y: prop.y, count: 4 }],
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
      }
      return next;
    });

    this.obstacles = [];
    let obstacleId = -201;
    for (const prop of this.props) {
      if (!prop.solid) continue;
      const boxRadius = Math.max(18, Math.round(prop.radius * 0.78));
      this.obstacles.push({
        id: obstacleId--,
        x: prop.x - boxRadius,
        y: prop.y - boxRadius,
        width: boxRadius * 2,
        height: boxRadius * 2,
        label: prop.label,
      });
    }
  }

  private seedAmbientCritters(): void {
    // Clear all critters when switching scenes so courtyard butterflies/fireflies never leak indoors.
    this.critters.length = 0;

    if (this.theme === 'garden') {
      const kind = this.effectiveLighting === 'night' ? 'firefly' : 'butterfly';
      const count = kind === 'firefly' ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const cx = this.rugBounds.x + this.rugBounds.width * (0.28 + i * 0.24);
        const cy = this.rugBounds.y + this.rugBounds.height * (0.3 + (i % 2) * 0.36);
        this.spawnCritter(cx, cy, kind, true);
      }
    }
  }

  private syncGardenAmbientCritterKinds(): void {
    const targetKind = this.effectiveLighting === 'night' ? 'firefly' : 'butterfly';
    for (const c of this.critters) {
      if (!c.isAmbient) continue;
      c.kind = targetKind;
      if (targetKind === 'firefly') {
        c.colorA = 0xe6f86d;
        c.colorB = 0xfff8b8;
      } else {
        c.colorA = 0xf7c552;
        c.colorB = 0x3a2a1e;
      }
    }
  }
}
