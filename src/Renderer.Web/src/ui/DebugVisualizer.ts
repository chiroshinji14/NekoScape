import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { CatJumpArcDebug } from '../entities/CatEntity';
import {
  BONK_VELOCITY_THRESHOLD,
  CAT_BREED_LABELS,
  type AabbRect,
  type CatBreed,
  type CatMood,
  type CatPersonality,
  type CatStateName,
  type DroppedTreat,
  type InteractivePropState,
  type RugBounds,
  type WarmZone,
} from '../types/simulation';

export interface DebugCatInfo {
  id: number;
  name?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  state: CatStateName;
  breed: CatBreed;
  mood?: CatMood;
  personality?: CatPersonality;
  activePropId?: string | null;
  zHeight?: number;
  perchedIconId?: number | null;
  jumpArc?: CatJumpArcDebug | null;
}

export interface DebugPrismInfo {
  x: number;
  y: number;
  radius: number;
  splitActive: boolean;
}

export interface DebugYarnInfo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface DebugBoxInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  occupantId: number | null;
  exterior?: AabbRect;
}

export interface DebugRenderSnapshot {
  icons: readonly AabbRect[];
  rug: RugBounds;
  cats: readonly DebugCatInfo[];
  prism: DebugPrismInfo;
  yarn?: DebugYarnInfo;
  box?: DebugBoxInfo;
  props?: readonly InteractivePropState[];
  treats?: readonly DroppedTreat[];
  warmZones?: readonly WarmZone[];
}

const DEBUG_TEXT_STYLE = new TextStyle({
  fontFamily: "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
  fontSize: 11,
  fontWeight: '600',
  fill: 0xf6ece1,
  stroke: { color: 0x241913, width: 3 },
});

const COLOR_RUG = 0xe8a65d;
const COLOR_ICON = 0x7fd8be;
const COLOR_BIN = 0xd95b52;
const COLOR_PERCH_RING = 0xf4c06a;
const COLOR_PRISM_IDLE = 0xe8a65d;
const COLOR_PRISM_SPLIT = 0x52e5ff;
const COLOR_CAT_CALM = 0x8ac979;
const COLOR_CAT_FAST = 0xd95b52;
const COLOR_YARN = 0xe07a5f;
const COLOR_BOX = 0xc99768;
const COLOR_BOX_EXT = 0xe8b97e;
const COLOR_PROP_IDLE = 0xb89ef2;
const COLOR_PROP_ACTIVE = 0xffcf70;
const COLOR_PROP_ANCHOR = 0x67e8c3;
const COLOR_WARM_ZONE = 0xffae52;
const COLOR_TREAT = 0xf49d6e;
const COLOR_JUMP_ARC = 0x62e3ff;

const STATE_COLOR_MAP: Record<CatStateName, number> = {
  IDLE: COLOR_CAT_CALM,
  WANDER: COLOR_CAT_CALM,
  STALK: 0xf4c06a,
  WIGGLE: 0xf4c06a,
  POUNCE: COLOR_CAT_FAST,
  BONK: COLOR_CAT_FAST,
  NAP: 0x99b898,
  PETTED: 0xf6b8b8,
  STARTLED: COLOR_CAT_FAST,
  IN_BOX: COLOR_BOX,
  JUMP_TO_BOX: COLOR_JUMP_ARC,
  JUMP_OUT_BOX: COLOR_JUMP_ARC,
  JUMP_TO_ICON: COLOR_JUMP_ARC,
  PERCH_ICON: 0xe8a65d,
  SCRATCH_ICON: 0xf28b50,
  GROOMING: 0xd9a9f5,
  LOAFING: 0xa7d489,
  STRETCHING: 0xf7c97e,
  ZOOMIES: 0xff6b57,
  ROLL_BELLY: 0xf79bb6,
  SOCIAL_PLAY: 0xff8fa3,
  PROP_INTERACT: 0x79dfc1,
  SUNBATHE: 0xffc15e,
  EATING_TREAT: 0xf5a25d,
  MEERKAT_PEEK: 0x8ad8ff,
  CHASE_LASER: 0xff5e57,
  BAT_YARN: 0xe07a5f,
  SNIFF_FILE: 0x9cd6c8,
};

function setLabelText(label: Text, nextText: string, x: number, y: number): void {
  if (label.text !== nextText) {
    label.text = nextText;
  }
  label.position.set(x, y);
  label.visible = true;
}

function computeVisualLiftPx(zHeight: number): number {
  if (zHeight <= 0.04) {
    return 0;
  }
  return zHeight * 0.68;
}

export class DebugVisualizer {
  public readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labelsLayer = new Container();

  private readonly iconLabels: Text[] = [];
  private readonly propLabels: Text[] = [];
  private readonly catLabels: Text[] = [];
  private readonly rugLabel: Text;
  private readonly prismLabel: Text;
  private readonly boxLabel: Text;

  private enabled = false;

  constructor() {
    this.container.visible = false;
    this.container.eventMode = 'none';
    this.container.addChild(this.graphics, this.labelsLayer);

    this.rugLabel = new Text({ text: '', style: DEBUG_TEXT_STYLE });
    this.prismLabel = new Text({ text: '', style: DEBUG_TEXT_STYLE });
    this.boxLabel = new Text({ text: '', style: DEBUG_TEXT_STYLE });
    this.rugLabel.visible = false;
    this.prismLabel.visible = false;
    this.boxLabel.visible = false;
    this.labelsLayer.addChild(this.rugLabel, this.prismLabel, this.boxLabel);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.container.visible = enabled;
    if (!enabled) {
      this.graphics.clear();
      this.hideAllLabels();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private hideAllLabels(): void {
    this.rugLabel.visible = false;
    this.prismLabel.visible = false;
    this.boxLabel.visible = false;
    for (const label of this.iconLabels) {
      label.visible = false;
    }
    for (const label of this.propLabels) {
      label.visible = false;
    }
    for (const label of this.catLabels) {
      label.visible = false;
    }
  }

  private acquirePooledLabel(pool: Text[], index: number): Text {
    while (pool.length <= index) {
      const label = new Text({ text: '', style: DEBUG_TEXT_STYLE });
      label.visible = false;
      pool.push(label);
      this.labelsLayer.addChild(label);
    }
    return pool[index];
  }

  private drawVelocityVector(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
  ): void {
    const speed = Math.hypot(vx, vy);
    if (speed < 4) {
      return;
    }

    const scale = 0.22;
    const tx = x + vx * scale;
    const ty = y + vy * scale;

    this.graphics
      .moveTo(x, y)
      .lineTo(tx, ty)
      .stroke({ width: 2, color, alpha: 0.92, cap: 'round' });

    const angle = Math.atan2(vy, vx);
    const headLen = 7;
    const leftX = tx - headLen * Math.cos(angle - 0.5);
    const leftY = ty - headLen * Math.sin(angle - 0.5);
    const rightX = tx - headLen * Math.cos(angle + 0.5);
    const rightY = ty - headLen * Math.sin(angle + 0.5);

    this.graphics
      .moveTo(leftX, leftY)
      .lineTo(tx, ty)
      .lineTo(rightX, rightY)
      .stroke({ width: 2, color, alpha: 0.92, cap: 'round', join: 'round' });
  }

  private drawJumpArc(arc: CatJumpArcDebug): void {
    const steps = 16;
    const peakLift = arc.peakZ * 0.68;

    // Ground chord connecting takeoff and landing target
    this.graphics
      .moveTo(arc.start.x, arc.start.y)
      .lineTo(arc.end.x, arc.end.y)
      .stroke({ width: 1, color: COLOR_JUMP_ARC, alpha: 0.35 });

    // Parabolic trajectory curve above box walls
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = arc.start.x + (arc.end.x - arc.start.x) * u;
      const py = arc.start.y + (arc.end.y - arc.start.y) * u - 4 * u * (1 - u) * peakLift;
      if (i === 0) {
        this.graphics.moveTo(px, py);
      } else {
        this.graphics.lineTo(px, py);
      }
    }
    this.graphics.stroke({ width: 2, color: COLOR_JUMP_ARC, alpha: 0.9, cap: 'round' });

    // Landing target bullseye outside box
    this.graphics
      .circle(arc.end.x, arc.end.y, 7)
      .stroke({ width: 1.5, color: COLOR_JUMP_ARC, alpha: 0.88 })
      .circle(arc.end.x, arc.end.y, 2.2)
      .fill({ color: COLOR_JUMP_ARC, alpha: 0.95 });
  }

  public update(snapshot: DebugRenderSnapshot): void {
    if (!this.enabled) {
      return;
    }

    this.graphics.clear();

    const perchedByIcon = new Map<number, number>();
    for (const cat of snapshot.cats) {
      if (cat.perchedIconId !== null && cat.perchedIconId !== undefined) {
        perchedByIcon.set(cat.perchedIconId, cat.id);
      }
    }

    // 1. Center Rug friction zone outline
    const { rug } = snapshot;
    this.graphics
      .roundRect(rug.x, rug.y, rug.width, rug.height, rug.cornerRadius)
      .stroke({ width: 1.5, color: COLOR_RUG, alpha: 0.72 });
    setLabelText(
      this.rugLabel,
      `RUG ZONE (${Math.round(rug.width)}x${Math.round(rug.height)}, mu=0.96)`,
      rug.x + 10,
      rug.y + 8,
    );

    // 2. Warm light pools
    if (snapshot.warmZones) {
      for (const wz of snapshot.warmZones) {
        this.graphics
          .circle(wz.x, wz.y, wz.radius)
          .fill({ color: COLOR_WARM_ZONE, alpha: 0.04 * wz.intensity })
          .stroke({ width: 1, color: COLOR_WARM_ZONE, alpha: 0.45 });
      }
    }

    // 3. Interactive Scene Props hitboxes, interaction anchors & labels
    const props = snapshot.props ?? [];
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const propColor = prop.isActive || prop.hovered ? COLOR_PROP_ACTIVE : COLOR_PROP_IDLE;

      this.graphics
        .circle(prop.x, prop.y, prop.radius)
        .fill({ color: propColor, alpha: prop.isActive ? 0.12 : 0.05 })
        .stroke({ width: prop.isActive || prop.hovered ? 1.8 : 1.25, color: propColor, alpha: 0.85 });

      if (prop.isActive) {
        this.graphics
          .circle(prop.x, prop.y, prop.attractRadius)
          .stroke({ width: 1, color: COLOR_PROP_ACTIVE, alpha: 0.3 });
      }

      if (prop.interactPoint) {
        const ax = prop.interactPoint.x;
        const ay = prop.interactPoint.y;
        this.graphics
          .moveTo(prop.x, prop.y)
          .lineTo(ax, ay)
          .stroke({ width: 1, color: COLOR_PROP_ANCHOR, alpha: 0.55 })
          .circle(ax, ay, 3.5)
          .fill({ color: COLOR_PROP_ANCHOR, alpha: 0.9 });
      }

      const label = this.acquirePooledLabel(this.propLabels, i);
      const stateTag = prop.isActive ? ' [ACTIVE]' : '';
      setLabelText(
        label,
        `${prop.label} (${prop.interactionType})${stateTag}`,
        prop.x - prop.radius,
        Math.max(4, prop.y - prop.radius - 15),
      );
    }
    for (let i = props.length; i < this.propLabels.length; i++) {
      this.propLabels[i].visible = false;
    }

    // 4. Dropped treats
    if (snapshot.treats) {
      for (const treat of snapshot.treats) {
        this.graphics
          .circle(treat.x, treat.y, treat.radius)
          .fill({ color: COLOR_TREAT, alpha: 0.16 })
          .stroke({ width: 1.4, color: COLOR_TREAT, alpha: 0.9 });
      }
    }

    // 5. Icon AABB wireframes + perched highlights + indices/labels
    for (let i = 0; i < snapshot.icons.length; i++) {
      const icon = snapshot.icons[i];
      const occupantCatId = perchedByIcon.get(icon.id);
      const color =
        occupantCatId !== undefined
          ? COLOR_PERCH_RING
          : icon.isRecycleBin
            ? COLOR_BIN
            : COLOR_ICON;

      this.graphics
        .rect(icon.x, icon.y, icon.width, icon.height)
        .fill({ color, alpha: occupantCatId !== undefined ? 0.14 : 0.08 })
        .stroke({ width: occupantCatId !== undefined ? 2 : 1.5, color, alpha: 0.88 });

      const label = this.acquirePooledLabel(this.iconLabels, i);
      const perchSuffix = occupantCatId !== undefined ? ` [PERCH #${occupantCatId}]` : '';
      setLabelText(
        label,
        `#${i} ${icon.label} (${Math.round(icon.x)},${Math.round(icon.y)})${perchSuffix}`,
        icon.x + 4,
        Math.max(4, icon.y - 16),
      );
    }
    for (let i = snapshot.icons.length; i < this.iconLabels.length; i++) {
      this.iconLabels[i].visible = false;
    }

    // 6. Prism trigger radius
    const { prism } = snapshot;
    const prismColor = prism.splitActive ? COLOR_PRISM_SPLIT : COLOR_PRISM_IDLE;
    this.graphics
      .circle(prism.x, prism.y, prism.radius)
      .fill({ color: prismColor, alpha: prism.splitActive ? 0.1 : 0.04 })
      .stroke({ width: 1.5, color: prismColor, alpha: 0.75 });
    this.graphics
      .moveTo(prism.x - 6, prism.y)
      .lineTo(prism.x + 6, prism.y)
      .moveTo(prism.x, prism.y - 6)
      .lineTo(prism.x, prism.y + 6)
      .stroke({ width: 1.5, color: prismColor, alpha: 0.85 });
    setLabelText(
      this.prismLabel,
      `PRISM r=${Math.round(prism.radius)} ${prism.splitActive ? 'SPLIT X3' : 'READY'}`,
      prism.x - 44,
      prism.y + prism.radius + 6,
    );

    // 7. Cardboard Box exterior bounds & Yarn diagnostics
    if (snapshot.box && snapshot.box.visible) {
      const { box } = snapshot;
      const ext = box.exterior ?? {
        id: -999,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        label: 'Cardboard Box',
      };

      this.graphics
        .rect(ext.x, ext.y, ext.width, ext.height)
        .fill({ color: COLOR_BOX_EXT, alpha: 0.07 })
        .stroke({ width: 1.75, color: COLOR_BOX_EXT, alpha: 0.9 });

      if (
        Math.abs(ext.x - box.x) > 1 ||
        Math.abs(ext.y - box.y) > 1 ||
        Math.abs(ext.width - box.width) > 1 ||
        Math.abs(ext.height - box.height) > 1
      ) {
        this.graphics
          .rect(box.x, box.y, box.width, box.height)
          .stroke({ width: 1, color: COLOR_BOX, alpha: 0.55 });
      }

      const cx = ext.x + ext.width * 0.5;
      const cy = ext.y + ext.height * 0.5;
      this.graphics
        .moveTo(cx - 5, cy)
        .lineTo(cx + 5, cy)
        .moveTo(cx, cy - 5)
        .lineTo(cx, cy + 5)
        .stroke({ width: 1.25, color: COLOR_BOX_EXT, alpha: 0.7 });

      setLabelText(
        this.boxLabel,
        box.occupantId !== null
          ? `BOX EXT ${Math.round(ext.width)}x${Math.round(ext.height)} [OCC #${box.occupantId}]`
          : `BOX EXT ${Math.round(ext.width)}x${Math.round(ext.height)} [OPEN]`,
        ext.x,
        Math.max(4, ext.y - 16),
      );
    } else {
      this.boxLabel.visible = false;
    }

    if (snapshot.yarn) {
      const { yarn } = snapshot;
      this.graphics
        .circle(yarn.x, yarn.y, yarn.radius)
        .stroke({ width: 1.5, color: COLOR_YARN, alpha: 0.85 });
      this.drawVelocityVector(yarn.x, yarn.y, yarn.vx, yarn.vy, COLOR_YARN);
    }

    // 8. Cat bodies, elevation arcs, box jump trajectory curves, velocity vectors & breed/personality/state tags
    for (let i = 0; i < snapshot.cats.length; i++) {
      const cat = snapshot.cats[i];
      const speed = Math.hypot(cat.vx, cat.vy);
      const z = cat.zHeight ?? 0;
      const liftPx = computeVisualLiftPx(z);
      const color = speed > BONK_VELOCITY_THRESHOLD ? COLOR_CAT_FAST : (STATE_COLOR_MAP[cat.state] ?? COLOR_CAT_CALM);

      if (cat.jumpArc && cat.jumpArc.active) {
        this.drawJumpArc(cat.jumpArc);
      }

      // Ground footprint ring
      this.graphics
        .circle(cat.x, cat.y, cat.radius)
        .stroke({ width: liftPx > 1 ? 1 : 1.5, color, alpha: liftPx > 1 ? 0.45 : 0.88 });

      // Elevated arc ring when jumping or perched
      if (liftPx > 1) {
        const liftY = cat.y - liftPx;
        this.graphics
          .moveTo(cat.x, cat.y)
          .lineTo(cat.x, liftY)
          .stroke({ width: 1, color, alpha: 0.55 });
        this.graphics
          .circle(cat.x, liftY, cat.radius * (1 + Math.min(0.24, liftPx / 260)))
          .stroke({ width: 1.75, color, alpha: 0.92 });
      }

      if (cat.state === 'SCRATCH_ICON') {
        this.graphics
          .circle(cat.x, cat.y, cat.radius + 5)
          .stroke({ width: 1.25, color: STATE_COLOR_MAP.SCRATCH_ICON, alpha: 0.72 });
      }

      this.drawVelocityVector(cat.x, cat.y, cat.vx, cat.vy, color);

      const breedLabel = CAT_BREED_LABELS[cat.breed] ?? cat.breed;
      const namePrefix = cat.name ? `${cat.name} (${breedLabel})` : breedLabel;
      const extras: string[] = [];
      if (cat.mood) {
        extras.push(cat.mood);
      }
      if (cat.personality) {
        const p = cat.personality;
        extras.push(
          `P:${Math.round(p.curiosity * 9)}${Math.round(p.playfulness * 9)}${Math.round(p.warmthAffinity * 9)}`,
        );
      }
      if (z > 0.5) {
        extras.push(`z=${Math.round(z)}px`);
      } else if (z > 0.04) {
        extras.push(`z=${z.toFixed(2)}`);
      }
      if (cat.activePropId) {
        extras.push(`prop:${cat.activePropId}`);
      }
      if (cat.perchedIconId !== null && cat.perchedIconId !== undefined) {
        extras.push(`icon#${cat.perchedIconId}`);
      }
      const suffix = extras.length > 0 ? ` [${extras.join(' ')}]` : '';

      const label = this.acquirePooledLabel(this.catLabels, i);
      setLabelText(
        label,
        `#${cat.id} ${namePrefix} · ${cat.state} ${Math.round(speed)}px/s${suffix}`,
        cat.x + cat.radius + 6,
        cat.y - 8 - liftPx,
      );
    }
    for (let i = snapshot.cats.length; i < this.catLabels.length; i++) {
      this.catLabels[i].visible = false;
    }
  }

  public destroy(): void {
    this.graphics.destroy();
    this.rugLabel.destroy();
    this.prismLabel.destroy();
    this.boxLabel.destroy();
    for (const label of this.iconLabels) {
      label.destroy();
    }
    for (const label of this.propLabels) {
      label.destroy();
    }
    for (const label of this.catLabels) {
      label.destroy();
    }
    this.container.destroy({ children: true });
  }
}
