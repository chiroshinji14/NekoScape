import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  BONK_VELOCITY_THRESHOLD,
  type AabbRect,
  type CatBreed,
  type CatStateName,
  type RugBounds,
} from '../types/simulation';

export interface DebugCatInfo {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  state: CatStateName;
  breed: CatBreed;
  zHeight?: number;
  perchedIconId?: number | null;
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
  JUMP_TO_BOX: 0x72d6ff,
  JUMP_OUT_BOX: 0x72d6ff,
  JUMP_TO_ICON: 0x72d6ff,
  PERCH_ICON: 0xe8a65d,
  SCRATCH_ICON: 0xf28b50,
};

function setLabelText(label: Text, nextText: string, x: number, y: number): void {
  if (label.text !== nextText) {
    label.text = nextText;
  }
  label.position.set(x, y);
  label.visible = true;
}

export class DebugVisualizer {
  public readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labelsLayer = new Container();

  private readonly iconLabels: Text[] = [];
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

    // 2. Icon AABB wireframes + perched highlights + indices/labels
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

    // 3. Prism trigger radius
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

    // 4. Cardboard Box exterior bounds & Yarn diagnostics
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

    // 5. Cat bodies, elevation arcs, velocity vectors & state tags
    for (let i = 0; i < snapshot.cats.length; i++) {
      const cat = snapshot.cats[i];
      const speed = Math.hypot(cat.vx, cat.vy);
      const z = cat.zHeight ?? 0;
      const color = speed > BONK_VELOCITY_THRESHOLD ? COLOR_CAT_FAST : STATE_COLOR_MAP[cat.state];

      // Ground footprint ring
      this.graphics
        .circle(cat.x, cat.y, cat.radius)
        .stroke({ width: z > 0.04 ? 1 : 1.5, color, alpha: z > 0.04 ? 0.45 : 0.88 });

      // Elevated arc ring when jumping or perched
      if (z > 0.04) {
        const liftY = cat.y - z * 18;
        this.graphics
          .moveTo(cat.x, cat.y)
          .lineTo(cat.x, liftY)
          .stroke({ width: 1, color, alpha: 0.55 });
        this.graphics
          .circle(cat.x, liftY, cat.radius * (1 + z * 0.08))
          .stroke({ width: 1.75, color, alpha: 0.92 });
      }

      if (cat.state === 'SCRATCH_ICON') {
        this.graphics
          .circle(cat.x, cat.y, cat.radius + 5)
          .stroke({ width: 1.25, color: STATE_COLOR_MAP.SCRATCH_ICON, alpha: 0.72 });
      }

      this.drawVelocityVector(cat.x, cat.y, cat.vx, cat.vy, color);

      const extras: string[] = [];
      if (z > 0.04) {
        extras.push(`z=${z.toFixed(2)}`);
      }
      if (cat.perchedIconId !== null && cat.perchedIconId !== undefined) {
        extras.push(`icon#${cat.perchedIconId}`);
      }
      const suffix = extras.length > 0 ? ` [${extras.join(' ')}]` : '';

      const label = this.acquirePooledLabel(this.catLabels, i);
      setLabelText(
        label,
        `#${cat.id} ${cat.state} ${Math.round(speed)}px/s${suffix}`,
        cat.x + cat.radius + 6,
        cat.y - 8 - z * 18,
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
    for (const label of this.catLabels) {
      label.destroy();
    }
    this.container.destroy({ children: true });
  }
}
