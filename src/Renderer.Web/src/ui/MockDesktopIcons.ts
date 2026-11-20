import type { AabbRect } from '../types/simulation';

type IconKind =
  | 'bin-full'
  | 'bin-empty'
  | 'this-pc'
  | 'folder'
  | 'screenshots'
  | 'notes'
  | 'music'
  | 'nekoscape'
  | 'file';

interface SvgPart {
  tag: 'path' | 'rect' | 'circle' | 'polygon';
  attrs: Record<string, string>;
}

interface MockIconRecord {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  isRecycleBin: boolean;
  isTempFile: boolean;
  isShortcut: boolean;
  kind: IconKind;
  el: HTMLButtonElement;
  innerEl: HTMLSpanElement;
  artEl: HTMLSpanElement;
  svgEl: SVGSVGElement;
}

export interface MockDesktopIconsOptions {
  onIconsChange: (rects: AabbRect[], isDragging: boolean) => void;
  onFirstInteract?: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TILE_WIDTH = 80;
const TILE_HEIGHT = 84;
const GRID_START_X = 24;
const GRID_START_Y = 24;
const GRID_COL_STEP = 100;
const GRID_ROW_STEP = 96;
const EDGE_MARGIN = 12;
const FAB_SAFE_WIDTH = 96;
const FAB_SAFE_HEIGHT = 96;

const ICON_ART: Record<IconKind, readonly SvgPart[]> = {
  'bin-full': [
    {
      tag: 'path',
      attrs: {
        d: 'M9 10.5l1.4 16.2a2 2 0 0 0 2 1.8h9.2a2 2 0 0 0 2-1.8L25 10.5Z',
        fill: 'rgba(235, 241, 246, 0.28)',
        stroke: '#eef4f8',
        'stroke-width': '1.6',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M12 8.2l2.3-3.2 3.1 2.8 3.2-2.6 2.1 3',
        fill: '#f5efe6',
        stroke: '#dfd2c0',
        'stroke-width': '1.2',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M7 10.5h20M13 7h8M14 14.5v9.5M17 14.5v9.5M20 14.5v9.5',
        fill: 'none',
        stroke: '#eef4f8',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
    },
  ],
  'bin-empty': [
    {
      tag: 'path',
      attrs: {
        d: 'M9 10.5l1.4 16.2a2 2 0 0 0 2 1.8h9.2a2 2 0 0 0 2-1.8L25 10.5Z',
        fill: 'rgba(235, 241, 246, 0.16)',
        stroke: '#eef4f8',
        'stroke-width': '1.6',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M7 10.5h20M13 7h8M14 14.5v9.5M17 14.5v9.5M20 14.5v9.5',
        fill: 'none',
        stroke: '#eef4f8',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
    },
  ],
  'this-pc': [
    {
      tag: 'rect',
      attrs: {
        x: '4.5',
        y: '6.5',
        width: '25',
        height: '16.5',
        rx: '2.2',
        fill: '#2c4864',
        stroke: '#d7e3ee',
        'stroke-width': '1.6',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M7.5 19.5l5.5-6.5 4.2 4.5 3-3.2 6.3 5.2',
        fill: 'none',
        stroke: '#8fd3e8',
        'stroke-width': '1.4',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M17 23v4.5M11.5 27.5h11',
        fill: 'none',
        stroke: '#d7e3ee',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
      },
    },
  ],
  folder: [
    {
      tag: 'path',
      attrs: {
        d: 'M4.5 9.2a2.2 2.2 0 0 1 2.2-2.2h6l2.3 2.5h12.3a2.2 2.2 0 0 1 2.2 2.2v13.6a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2V9.2Z',
        fill: '#e3a84f',
        stroke: '#f8d79b',
        'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M4.5 12.8h25',
        fill: 'none',
        stroke: '#f8dfad',
        'stroke-width': '1.4',
      },
    },
  ],
  screenshots: [
    {
      tag: 'rect',
      attrs: {
        x: '4.5',
        y: '7.5',
        width: '25',
        height: '19',
        rx: '2.5',
        fill: '#3c6e71',
        stroke: '#f2eadc',
        'stroke-width': '1.5',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '11.5',
        cy: '13',
        r: '2.2',
        fill: '#f4c56a',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M6.5 24l6.2-6.8 4.4 4.4 3.4-3.6 7 6Z',
        fill: '#89b892',
        stroke: '#e8f1e6',
        'stroke-width': '1.2',
        'stroke-linejoin': 'round',
      },
    },
  ],
  notes: [
    {
      tag: 'path',
      attrs: {
        d: 'M8 5.5h13l5 5v18H8V5.5Z',
        fill: '#f5ebd8',
        stroke: '#d8c29d',
        'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M21 5.5v5h5',
        fill: '#e4d0ae',
        stroke: '#d8c29d',
        'stroke-width': '1.4',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M11.5 14.5h11M11.5 18.5h11M11.5 22.5h7',
        fill: 'none',
        stroke: '#8a6b4f',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
    },
  ],
  music: [
    {
      tag: 'circle',
      attrs: {
        cx: '17',
        cy: '17',
        r: '12',
        fill: '#c95c48',
        stroke: '#f6d4c7',
        'stroke-width': '1.5',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M14.5 21V12.2l7.5-1.7v8.2',
        fill: 'none',
        stroke: '#fbf3ea',
        'stroke-width': '1.7',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'circle',
      attrs: { cx: '12.5', cy: '21.5', r: '2.2', fill: '#fbf3ea' },
    },
    {
      tag: 'circle',
      attrs: { cx: '20', cy: '19.5', r: '2.2', fill: '#fbf3ea' },
    },
  ],
  nekoscape: [
    {
      tag: 'rect',
      attrs: {
        x: '5',
        y: '5',
        width: '24',
        height: '24',
        rx: '7',
        fill: '#3c291f',
        stroke: '#e8a65d',
        'stroke-width': '1.6',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M10 14.2L11.8 9.2l3.4 3a7.2 7.2 0 0 1 3.6 0l3.4-3 1.8 5c.9 2.2.8 5.2-.7 7.1-1.4 1.8-3.8 2.7-6.3 2.7s-4.9-.9-6.3-2.7c-1.5-1.9-1.6-4.9-.7-7.1Z',
        fill: '#e8a65d',
      },
    },
    {
      tag: 'circle',
      attrs: { cx: '14.2', cy: '17.4', r: '1.1', fill: '#2c1d15' },
    },
    {
      tag: 'circle',
      attrs: { cx: '19.8', cy: '17.4', r: '1.1', fill: '#2c1d15' },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M15.8 20.1l1.2 1 1.2-1',
        fill: 'none',
        stroke: '#2c1d15',
        'stroke-width': '1.3',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
    },
  ],
  file: [
    {
      tag: 'path',
      attrs: {
        d: 'M8 5.5h13l5 5v18H8V5.5Z',
        fill: '#e5efe4',
        stroke: '#a9c7a8',
        'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M21 5.5v5h5',
        fill: '#c7dec5',
        stroke: '#a9c7a8',
        'stroke-width': '1.4',
        'stroke-linejoin': 'round',
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M11.5 16h11M11.5 20h8',
        fill: 'none',
        stroke: '#4e7350',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
    },
  ],
};

function createTileSvg(kind: IconKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 34 34');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ns-mock-icon-glyph');

  for (const part of ICON_ART[kind]) {
    const el = document.createElementNS(SVG_NS, part.tag);
    for (const [k, v] of Object.entries(part.attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

function createShortcutBadge(): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'ns-shortcut-badge';
  badge.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'ns-shortcut-badge-svg');

  const curve = document.createElementNS(SVG_NS, 'path');
  curve.setAttribute('d', 'M2 7.5C2 4.8 3.6 3.2 7.2 3.2');
  const head = document.createElementNS(SVG_NS, 'path');
  head.setAttribute('d', 'M5.2 1.6L7.5 3.2 5.2 4.9');

  svg.append(curve, head);
  badge.appendChild(svg);
  return badge;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export class MockDesktopIcons {
  private readonly root: HTMLElement;
  private readonly options: MockDesktopIconsOptions;
  private readonly icons: MockIconRecord[] = [];
  private readonly scratchTimers = new Map<number, number>();

  private nextId = 1;
  private tempFileIndex = 1;
  private viewportWidth: number;
  private viewportHeight: number;
  private hiddenForNative = false;
  private hasInteracted = false;
  private binPulseTimer: number | null = null;
  private dragRafId: number | null = null;

  private activeDrag: {
    record: MockIconRecord;
    pointerId: number;
    grabOffsetX: number;
    grabOffsetY: number;
    dirty: boolean;
  } | null = null;

  constructor(
    root: HTMLElement,
    width: number,
    height: number,
    options: MockDesktopIconsOptions,
  ) {
    this.root = root;
    this.viewportWidth = Math.max(320, width);
    this.viewportHeight = Math.max(240, height);
    this.options = options;

    this.createInitialShortcuts();
    this.tidyIcons(false);
  }

  private createInitialShortcuts(): void {
    const seeds: readonly {
      label: string;
      kind: IconKind;
      isRecycleBin: boolean;
      isShortcut: boolean;
    }[] = [
      { label: 'Recycle Bin', kind: 'bin-full', isRecycleBin: true, isShortcut: false },
      { label: 'This PC', kind: 'this-pc', isRecycleBin: false, isShortcut: false },
      { label: 'Projects', kind: 'folder', isRecycleBin: false, isShortcut: true },
      { label: 'Notes', kind: 'notes', isRecycleBin: false, isShortcut: true },
      { label: 'Music', kind: 'music', isRecycleBin: false, isShortcut: true },
      { label: 'NekoScape', kind: 'nekoscape', isRecycleBin: false, isShortcut: true },
    ];

    for (const seed of seeds) {
      this.spawnTileRecord(
        seed.label,
        seed.kind,
        seed.isRecycleBin,
        false,
        seed.isShortcut,
        GRID_START_X,
        GRID_START_Y,
      );
    }
  }

  private spawnTileRecord(
    label: string,
    kind: IconKind,
    isRecycleBin: boolean,
    isTempFile: boolean,
    isShortcut: boolean,
    x: number,
    y: number,
  ): MockIconRecord {
    const id = this.nextId++;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ns-mock-icon';
    btn.setAttribute('aria-label', `Drag desktop icon: ${label}`);
    if (isRecycleBin) {
      btn.setAttribute('data-bin', 'true');
    }
    if (isTempFile) {
      btn.setAttribute('data-temp-file', 'true');
    }

    const innerEl = document.createElement('span');
    innerEl.className = 'ns-mock-icon-inner';

    const artEl = document.createElement('span');
    artEl.className = 'ns-mock-icon-art';
    const svgEl = createTileSvg(kind);
    artEl.appendChild(svgEl);
    if (isShortcut) {
      artEl.appendChild(createShortcutBadge());
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'ns-mock-icon-label';
    labelSpan.textContent = label;

    innerEl.append(artEl, labelSpan);
    btn.appendChild(innerEl);

    const record: MockIconRecord = {
      id,
      x,
      y,
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      label,
      isRecycleBin,
      isTempFile,
      isShortcut,
      kind,
      el: btn,
      innerEl,
      artEl,
      svgEl,
    };

    this.bindTileEvents(record);
    this.icons.push(record);
    this.root.appendChild(btn);
    this.applyTileTransform(record);
    return record;
  }

  private bindTileEvents(record: MockIconRecord): void {
    const { el } = record;

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.hiddenForNative || e.button !== 0) {
        return;
      }
      e.preventDefault();
      this.notifyInteract();

      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      this.activeDrag = {
        record,
        pointerId: e.pointerId,
        grabOffsetX: e.clientX - record.x,
        grabOffsetY: e.clientY - record.y,
        dirty: false,
      };
    });

    el.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.activeDrag || this.activeDrag.record !== record || this.activeDrag.pointerId !== e.pointerId) {
        return;
      }
      const next = this.resolveSafePosition(
        e.clientX - this.activeDrag.grabOffsetX,
        e.clientY - this.activeDrag.grabOffsetY,
        record.width,
        record.height,
      );

      if (next.x !== record.x || next.y !== record.y) {
        record.x = next.x;
        record.y = next.y;
        this.applyTileTransform(record);
        this.activeDrag.dirty = true;
        this.scheduleDragIconsEmit();
      }
    });

    const endDrag = (e: PointerEvent): void => {
      if (!this.activeDrag || this.activeDrag.record !== record || this.activeDrag.pointerId !== e.pointerId) {
        return;
      }
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      el.classList.remove('is-dragging');
      this.cancelPendingDragRaf();
      const moved = this.activeDrag.dirty;
      this.activeDrag = null;
      if (moved) {
        this.emitIconsChange(false);
      }
    };

    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.hiddenForNative) {
        return;
      }
      const step = e.shiftKey ? 4 : 18;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      this.notifyInteract();
      const next = this.resolveSafePosition(record.x + dx, record.y + dy, record.width, record.height);
      record.x = next.x;
      record.y = next.y;
      this.applyTileTransform(record);
      this.emitIconsChange(false);
    });
  }

  private scheduleDragIconsEmit(): void {
    if (this.dragRafId !== null) {
      return;
    }
    this.dragRafId = window.requestAnimationFrame(() => {
      this.dragRafId = null;
      if (this.activeDrag && this.activeDrag.dirty) {
        this.emitIconsChange(true);
      }
    });
  }

  private cancelPendingDragRaf(): void {
    if (this.dragRafId !== null) {
      window.cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
  }

  private notifyInteract(): void {
    if (!this.hasInteracted) {
      this.hasInteracted = true;
      this.options.onFirstInteract?.();
    }
  }

  private applyTileTransform(record: MockIconRecord): void {
    record.el.style.transform = `translate3d(${record.x}px, ${record.y}px, 0)`;
  }

  private emitIconsChange(isDragging: boolean): void {
    if (!this.hiddenForNative) {
      this.options.onIconsChange(this.getIcons(), isDragging);
    }
  }

  public getIcons(): AabbRect[] {
    if (this.hiddenForNative) {
      return [];
    }
    return this.icons.map((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      label: item.label,
      isRecycleBin: item.isRecycleBin,
    }));
  }

  private overlapsFabZone(x: number, y: number, width: number, height: number): boolean {
    const fabLeft = Math.max(EDGE_MARGIN, this.viewportWidth - FAB_SAFE_WIDTH);
    const fabTop = Math.max(EDGE_MARGIN, this.viewportHeight - FAB_SAFE_HEIGHT);
    return rectsOverlap(x, y, width, height, fabLeft, fabTop, FAB_SAFE_WIDTH, FAB_SAFE_HEIGHT);
  }

  private resolveSafePosition(
    rawX: number,
    rawY: number,
    width: number,
    height: number,
  ): { x: number; y: number } {
    const maxX = Math.max(EDGE_MARGIN, this.viewportWidth - width - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, this.viewportHeight - height - EDGE_MARGIN);
    let x = Math.round(clamp(rawX, EDGE_MARGIN, maxX));
    let y = Math.round(clamp(rawY, EDGE_MARGIN, maxY));

    if (this.overlapsFabZone(x, y, width, height)) {
      const fabLeft = Math.max(EDGE_MARGIN, this.viewportWidth - FAB_SAFE_WIDTH);
      const fabTop = Math.max(EDGE_MARGIN, this.viewportHeight - FAB_SAFE_HEIGHT);
      const pushLeftX = Math.max(EDGE_MARGIN, fabLeft - width - 8);
      const pushUpY = Math.max(EDGE_MARGIN, fabTop - height - 8);

      const dx = Math.abs(x - pushLeftX);
      const dy = Math.abs(y - pushUpY);
      if (dy <= dx) {
        y = Math.round(pushUpY);
      } else {
        x = Math.round(pushLeftX);
      }
    }

    return { x, y };
  }

  public tidyIcons(emit = true): void {
    if (this.hiddenForNative) {
      return;
    }

    const usableHeight = Math.max(TILE_HEIGHT + GRID_START_Y, this.viewportHeight - FAB_SAFE_HEIGHT);
    const maxRows = Math.max(1, Math.floor((usableHeight - GRID_START_Y) / GRID_ROW_STEP));

    this.icons.forEach((icon, index) => {
      const col = Math.floor(index / maxRows);
      const row = index % maxRows;
      const pos = this.resolveSafePosition(
        GRID_START_X + col * GRID_COL_STEP,
        GRID_START_Y + row * GRID_ROW_STEP,
        icon.width,
        icon.height,
      );
      icon.x = pos.x;
      icon.y = pos.y;
      this.applyTileTransform(icon);
    });

    if (emit) {
      this.emitIconsChange(false);
    }
  }

  public addTempFile(label?: string): AabbRect {
    const fileLabel = label ?? `Note_${this.tempFileIndex++}.txt`;
    const slot = this.findFreeSlot();
    const record = this.spawnTileRecord(fileLabel, 'file', false, true, false, slot.x, slot.y);
    this.emitIconsChange(false);
    return {
      id: record.id,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      label: record.label,
      isRecycleBin: false,
    };
  }

  private findFreeSlot(): { x: number; y: number } {
    const usableHeight = Math.max(TILE_HEIGHT + GRID_START_Y, this.viewportHeight - FAB_SAFE_HEIGHT);
    const maxRows = Math.max(1, Math.floor((usableHeight - GRID_START_Y) / GRID_ROW_STEP));
    const maxCols = Math.max(2, Math.floor((this.viewportWidth - GRID_START_X) / GRID_COL_STEP));

    for (let col = 1; col < maxCols; col++) {
      for (let row = 0; row < maxRows; row++) {
        const candidate = this.resolveSafePosition(
          GRID_START_X + col * GRID_COL_STEP,
          GRID_START_Y + row * GRID_ROW_STEP,
          TILE_WIDTH,
          TILE_HEIGHT,
        );
        if (this.overlapsFabZone(candidate.x, candidate.y, TILE_WIDTH, TILE_HEIGHT)) {
          continue;
        }
        const collides = this.icons.some((other) =>
          rectsOverlap(
            candidate.x - 8,
            candidate.y - 8,
            TILE_WIDTH + 16,
            TILE_HEIGHT + 16,
            other.x,
            other.y,
            other.width,
            other.height,
          ),
        );
        if (!collides) {
          return candidate;
        }
      }
    }

    return this.resolveSafePosition(
      GRID_START_X + GRID_COL_STEP,
      GRID_START_Y + GRID_ROW_STEP,
      TILE_WIDTH,
      TILE_HEIGHT,
    );
  }

  public pulseRecycleBin(): AabbRect | null {
    if (this.hiddenForNative) {
      return null;
    }
    const bin = this.icons.find((icon) => icon.isRecycleBin);
    if (!bin) {
      return null;
    }

    if (bin.kind !== 'bin-empty') {
      bin.kind = 'bin-empty';
      const emptySvg = createTileSvg('bin-empty');
      bin.artEl.replaceChild(emptySvg, bin.svgEl);
      bin.svgEl = emptySvg;
    }

    bin.el.classList.remove('is-bin-pulsing');
    // Force reflow so rapid repeated Empty Bin clicks replay the pulse animation cleanly.
    void bin.el.offsetWidth;
    bin.el.classList.add('is-bin-pulsing');

    if (this.binPulseTimer !== null) {
      window.clearTimeout(this.binPulseTimer);
    }
    this.binPulseTimer = window.setTimeout(() => {
      bin.el.classList.remove('is-bin-pulsing');
      this.binPulseTimer = null;
    }, 340);

    return {
      id: bin.id,
      x: bin.x,
      y: bin.y,
      width: bin.width,
      height: bin.height,
      label: bin.label,
      isRecycleBin: true,
    };
  }

  public triggerScratchShake(iconId: number): void {
    if (this.hiddenForNative) {
      return;
    }
    const record = this.icons.find((icon) => icon.id === iconId);
    if (!record) {
      return;
    }

    record.el.classList.remove('is-scratched');
    // Force reflow so rapid scratch bursts replay the micro-jiggle cleanly.
    void record.innerEl.offsetWidth;
    record.el.classList.add('is-scratched');

    const prevTimer = this.scratchTimers.get(iconId);
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
    }
    const timer = window.setTimeout(() => {
      record.el.classList.remove('is-scratched');
      this.scratchTimers.delete(iconId);
    }, 280);
    this.scratchTimers.set(iconId, timer);
  }

  public setPerchedIcons(iconIds: ReadonlySet<number>): void {
    if (this.hiddenForNative) {
      return;
    }
    for (const icon of this.icons) {
      icon.el.classList.toggle('is-perched', iconIds.has(icon.id));
    }
  }

  public resize(width: number, height: number): void {
    this.viewportWidth = Math.max(320, width);
    this.viewportHeight = Math.max(240, height);
    if (this.hiddenForNative) {
      return;
    }

    let moved = false;
    for (const icon of this.icons) {
      const clamped = this.resolveSafePosition(icon.x, icon.y, icon.width, icon.height);
      if (clamped.x !== icon.x || clamped.y !== icon.y) {
        icon.x = clamped.x;
        icon.y = clamped.y;
        this.applyTileTransform(icon);
        moved = true;
      }
    }

    if (moved) {
      this.emitIconsChange(false);
    }
  }

  private clearScratchTimers(): void {
    for (const timer of this.scratchTimers.values()) {
      window.clearTimeout(timer);
    }
    this.scratchTimers.clear();
  }

  public hideForNativeMode(): void {
    if (this.hiddenForNative) {
      return;
    }
    this.hiddenForNative = true;
    this.cancelPendingDragRaf();
    this.clearScratchTimers();
    this.activeDrag = null;
    for (const icon of this.icons) {
      icon.el.remove();
    }
    this.icons.length = 0;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
  }

  public isHiddenForNative(): boolean {
    return this.hiddenForNative;
  }

  public destroy(): void {
    this.cancelPendingDragRaf();
    this.clearScratchTimers();
    if (this.binPulseTimer !== null) {
      window.clearTimeout(this.binPulseTimer);
      this.binPulseTimer = null;
    }
    this.activeDrag = null;
    for (const icon of this.icons) {
      icon.el.remove();
    }
    this.icons.length = 0;
  }
}
