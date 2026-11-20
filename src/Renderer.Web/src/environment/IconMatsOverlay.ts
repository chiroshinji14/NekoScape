import { Container, Sprite, Texture } from 'pixi.js';
import type { AabbRect, SceneTheme } from '../types/simulation';
import type { EffectiveLightingMode } from './LightingOverlay';
import { SCENE_THEME_DEFS } from './SceneThemes';
import {
  rasterizeCrispIconMatsBuffer,
  type IconMatsWorkerRequest,
  type IconMatsWorkerResponse,
} from './iconMats.worker';

const CANVAS_STEP = 2;
const PATCH_CSS_SIZE = 180;
const PATCH_CANVAS_SIZE = PATCH_CSS_SIZE / CANVAS_STEP;

/**
 * Iconscape-inspired coalesced organic floor mats underneath desktop icons.
 *
 * Performance & Animation Architecture:
 * - Stationary icons remain on `currentSprite` at 100% steady opacity and NEVER
 *   blink, refresh, or fade when another icon is dragged or dropped.
 * - While an icon is actively dragged (`fast: true`), the background Web Worker
 *   renders the remaining stationary icons once onto `currentSprite`, while the
 *   single dragged icon's mat (`dragMatSprite`) translates purely on the GPU at 60+ FPS.
 * - The moment the dragged icon is dropped (`fast: false`), ONLY that dropped icon's
 *   mat (`dropBloomSprite`) fades in (`alpha: 0 -> 1`, `scale: 0.76 -> 1.0`) over 360ms
 *   at the dropped spot, and then seamlessly hands off to the Worker's merged SDF buffer.
 */
export class IconMatsOverlay extends Container {
  private readonly currentSprite: Sprite;
  private readonly dragMatSprite: Sprite;
  private readonly dropBloomSprite: Sprite;

  private currentTexture: Texture | null = null;
  private currentCanvas: HTMLCanvasElement | null = null;
  private currentCtx: CanvasRenderingContext2D | null = null;

  private patchTexture: Texture | null = null;
  private patchCanvas: HTMLCanvasElement | null = null;

  private worker: Worker | null = null;
  private nextJobId = 1;
  private latestAppliedJobId = 0;
  private workerBusy = false;
  private pendingWorkerReq: {
    req: Omit<IconMatsWorkerRequest, 'jobId'>;
    deferUntilDropBloomDone: boolean;
  } | null = null;
  private activeJobDefersUntilBloom = false;

  // Staged worker result waiting for the single dropped icon's fade-in bloom to finish
  private stagedPixels: {
    cw: number;
    ch: number;
    pixels: Uint8ClampedArray;
    hasIcons: boolean;
  } | null = null;

  private cw = 0;
  private ch = 0;
  private viewWidth: number;
  private viewHeight: number;

  private icons: AabbRect[] = [];
  private settledIcons: AabbRect[] = [];
  private activeDraggedKey: string | null = null;
  private wasDragging = false;
  private lastDraggedCenter: { x: number; y: number; width: number; height: number } | null = null;

  // Per-icon GPU drop fade-in progress (1 = idle, 0..1 = single dropped icon fading in)
  private dropBloomProgress = 1;

  private theme: SceneTheme;
  private lightingMode: EffectiveLightingMode = 'golden';

  constructor(width: number, height: number, theme: SceneTheme = 'study') {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;
    this.theme = theme;

    this.viewWidth = Math.max(1, Math.round(width));
    this.viewHeight = Math.max(1, Math.round(height));

    this.currentSprite = new Sprite(Texture.EMPTY);
    this.currentSprite.visible = false;

    this.dropBloomSprite = new Sprite(Texture.EMPTY);
    this.dropBloomSprite.anchor.set(0.5, 0.5);
    this.dropBloomSprite.visible = false;

    this.dragMatSprite = new Sprite(Texture.EMPTY);
    this.dragMatSprite.anchor.set(0.5, 0.5);
    this.dragMatSprite.visible = false;

    this.addChild(this.currentSprite, this.dropBloomSprite, this.dragMatSprite);

    this.initSurfaces(this.viewWidth, this.viewHeight);
    this.rebuildPatchTexture();
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      return;
    }

    try {
      this.worker = new Worker(new URL('./iconMats.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.addEventListener('message', (event: MessageEvent<IconMatsWorkerResponse>) => {
        this.onWorkerCompleted(event.data);
      });
      this.worker.addEventListener('error', () => {
        this.worker?.terminate();
        this.worker = null;
        this.workerBusy = false;
      });
    } catch {
      this.worker = null;
    }
  }

  private static iconKey(icon: AabbRect): string {
    const clean = icon.label ? icon.label.trim().toLowerCase() : '';
    return clean.length > 0 ? `lbl:${clean}` : `id:${icon.id}`;
  }

  private static areIconListsEquivalent(a: readonly AabbRect[], b: readonly AabbRect[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      const ia = a[i];
      const ib = b[i];
      if (
        IconMatsOverlay.iconKey(ia) !== IconMatsOverlay.iconKey(ib) ||
        Math.abs(ia.x - ib.x) > 1 ||
        Math.abs(ia.y - ib.y) > 1 ||
        Math.abs(ia.width - ib.width) > 1 ||
        Math.abs(ia.height - ib.height) > 1
      ) {
        return false;
      }
    }
    return true;
  }

  setIcons(icons: readonly AabbRect[], options?: { fast?: boolean }): void {
    const fast = options?.fast === true;
    const incoming = icons.map((icon) => ({ ...icon }));

    if (incoming.length === 0) {
      this.icons = [];
      this.settledIcons = [];
      this.activeDraggedKey = null;
      this.wasDragging = false;
      this.stagedPixels = null;
      this.dragMatSprite.visible = false;
      this.dropBloomSprite.visible = false;
      this.currentSprite.visible = false;
      return;
    }

    if (fast) {
      // Identify the single icon being dragged
      let draggedIcon: AabbRect | null = null;
      let maxMoveDist = 1.5;

      const settledByKey = new Map<string, AabbRect>();
      for (const s of this.settledIcons) {
        settledByKey.set(IconMatsOverlay.iconKey(s), s);
      }

      if (this.activeDraggedKey) {
        draggedIcon =
          incoming.find((i) => IconMatsOverlay.iconKey(i) === this.activeDraggedKey) ?? null;
      }

      if (!draggedIcon) {
        for (const inc of incoming) {
          const prev = settledByKey.get(IconMatsOverlay.iconKey(inc));
          if (prev) {
            const d = Math.hypot(inc.x - prev.x, inc.y - prev.y);
            if (d > maxMoveDist) {
              maxMoveDist = d;
              draggedIcon = inc;
            }
          }
        }
      }

      if (draggedIcon) {
        const draggedKey = IconMatsOverlay.iconKey(draggedIcon);
        const firstDragFrame = !this.wasDragging || this.activeDraggedKey !== draggedKey;
        this.wasDragging = true;
        this.activeDraggedKey = draggedKey;

        const cx = draggedIcon.x + draggedIcon.width * 0.5;
        const cy = draggedIcon.y + draggedIcon.height * 0.5;
        this.lastDraggedCenter = {
          x: cx,
          y: cy,
          width: draggedIcon.width,
          height: draggedIcon.height,
        };

        // Pure GPU translation for the dragged icon mat (<0.01ms CPU cost, 0 lag!)
        this.dragMatSprite.position.set(cx, cy);
        this.dragMatSprite.visible = true;
        this.dropBloomSprite.visible = false;
        this.dropBloomProgress = 1;
        this.stagedPixels = null;
        this.applyLightingTint();

        // Only on frame 1 of drag: update the stationary background mat (excluding the dragged icon)
        if (firstDragFrame) {
          const stationaryIcons = incoming.filter(
            (i) => IconMatsOverlay.iconKey(i) !== draggedKey,
          );
          this.dispatchRasterJob(stationaryIcons, false);
        }

        this.icons = incoming;
        return;
      }
    }

    // If we aren't finishing a drag and the icon coordinates haven't changed, do nothing!
    if (!this.wasDragging && IconMatsOverlay.areIconListsEquivalent(incoming, this.settledIcons)) {
      return;
    }

    // Detect which single icon was just dropped or relocated
    let droppedIcon: AabbRect | null = null;
    if (this.wasDragging) {
      if (this.activeDraggedKey) {
        droppedIcon =
          incoming.find((i) => IconMatsOverlay.iconKey(i) === this.activeDraggedKey) ?? null;
      }
      if (!droppedIcon && this.lastDraggedCenter) {
        droppedIcon = {
          id: -1,
          label: 'dropped',
          x: this.lastDraggedCenter.x - this.lastDraggedCenter.width * 0.5,
          y: this.lastDraggedCenter.y - this.lastDraggedCenter.height * 0.5,
          width: this.lastDraggedCenter.width,
          height: this.lastDraggedCenter.height,
        };
      }
    } else if (this.settledIcons.length > 0) {
      const prevByKey = new Map<string, AabbRect>();
      for (const s of this.settledIcons) {
        prevByKey.set(IconMatsOverlay.iconKey(s), s);
      }
      for (const inc of incoming) {
        const prev = prevByKey.get(IconMatsOverlay.iconKey(inc));
        if (!prev || Math.hypot(inc.x - prev.x, inc.y - prev.y) > 10) {
          droppedIcon = inc;
          break;
        }
      }
    }

    const hadStationaryPreRendered = this.wasDragging;
    this.wasDragging = false;
    this.activeDraggedKey = null;
    this.lastDraggedCenter = null;
    this.dragMatSprite.visible = false;

    this.icons = incoming;
    this.settledIcons = incoming.map((icon) => ({ ...icon }));

    if (droppedIcon) {
      const dropKey = IconMatsOverlay.iconKey(droppedIcon);
      const dropCx = droppedIcon.x + droppedIcon.width * 0.5;
      const dropCy = droppedIcon.y + droppedIcon.height * 0.5;

      // Ensure stationary icons (without the dropped icon) remain solid at 100% opacity on currentSprite
      // while ONLY the dropped icon's mat (`dropBloomSprite`) fades & blooms in!
      if (!hadStationaryPreRendered) {
        const stationaryIcons = incoming.filter((i) => IconMatsOverlay.iconKey(i) !== dropKey);
        this.dispatchRasterJob(stationaryIcons, false);
      }

      this.dropBloomSprite.position.set(dropCx, dropCy);
      this.dropBloomProgress = 0.01;
      this.dropBloomSprite.visible = true;

      // Compute the final merged SDF (including the dropped icon) in the background worker,
      // and hold committing it to currentSprite until dropBloomSprite finishes fading in to 100%!
      this.dispatchRasterJob(incoming, true);
    } else {
      // Initial load or bulk tidy: render directly without per-icon drop bloom
      this.dropBloomSprite.visible = false;
      this.dropBloomProgress = 1;
      this.dispatchRasterJob(incoming, false);
    }

    this.applyLightingTint();
  }

  update(dt: number): void {
    if (this.dropBloomProgress >= 1) {
      return;
    }

    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    // 360ms smooth fade-in exclusively on the dropped icon's mat (`dropBloomSprite`)
    this.dropBloomProgress = Math.min(1, this.dropBloomProgress + safeDt * 2.8);
    this.applyLightingTint();

    if (this.dropBloomProgress >= 1) {
      if (this.stagedPixels) {
        const staged = this.stagedPixels;
        this.stagedPixels = null;
        this.commitPixelsToCurrentCanvas(staged.cw, staged.ch, staged.pixels, staged.hasIcons);
      }
      this.dropBloomSprite.visible = false;
    }
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme) {
      return;
    }
    this.theme = theme;
    this.rebuildPatchTexture();
    if (this.icons.length > 0) {
      this.dispatchRasterJob(this.icons, false);
    }
    this.applyLightingTint();
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.viewWidth && h === this.viewHeight && this.currentTexture !== null) {
      return;
    }
    this.viewWidth = w;
    this.viewHeight = h;
    this.initSurfaces(w, h);
    if (this.icons.length > 0) {
      this.dispatchRasterJob(this.icons, false);
    } else {
      this.currentSprite.visible = false;
    }
  }

  setLighting(mode: EffectiveLightingMode): void {
    this.lightingMode = mode;
    this.applyLightingTint();
  }

  private applyLightingTint(): void {
    const isNight = this.lightingMode === 'night';
    const matCfg = SCENE_THEME_DEFS[this.theme].mat;
    const baseTint = isNight ? matCfg.nightTint : 0xffffff;
    const baseAlpha = isNight ? matCfg.nightAlpha : 1;

    // Stationary icons on currentSprite ALWAYS remain at 100% steady opacity (zero refresh/flicker!)
    this.currentSprite.tint = baseTint;
    this.currentSprite.alpha = baseAlpha;

    // Active dragged icon mat follows cursor at 94% opacity
    this.dragMatSprite.tint = baseTint;
    this.dragMatSprite.alpha = baseAlpha * 0.94;
    this.dragMatSprite.scale.set(1.03, 1.03);

    // ONLY the newly dropped icon mat (`dropBloomSprite`) animates alpha 0 -> 1 and scale 0.76 -> 1.0!
    if (this.dropBloomSprite.visible) {
      const bt = Math.max(0, Math.min(1, this.dropBloomProgress));
      const eased = 1 - Math.pow(1 - bt, 3);
      const scale = 0.76 + 0.24 * eased;
      this.dropBloomSprite.tint = baseTint;
      this.dropBloomSprite.scale.set(scale, scale);
      this.dropBloomSprite.alpha = baseAlpha * eased;
    }
  }

  private initSurfaces(w: number, h: number): void {
    const oldCurr = this.currentTexture;

    this.cw = Math.max(1, Math.ceil(w / CANVAS_STEP));
    this.ch = Math.max(1, Math.ceil(h / CANVAS_STEP));

    const canvas = document.createElement('canvas');
    canvas.width = this.cw;
    canvas.height = this.ch;
    const ctx = canvas.getContext('2d');
    const texture = Texture.from(canvas, true);

    this.currentCanvas = canvas;
    this.currentCtx = ctx;
    this.currentTexture = texture;
    this.currentSprite.texture = texture;
    this.currentSprite.width = this.cw * CANVAS_STEP;
    this.currentSprite.height = this.ch * CANVAS_STEP;

    if (oldCurr && oldCurr !== Texture.EMPTY) {
      oldCurr.destroy(true);
    }
  }

  private rebuildPatchTexture(): void {
    if (!this.patchCanvas) {
      this.patchCanvas = document.createElement('canvas');
      this.patchCanvas.width = PATCH_CANVAS_SIZE;
      this.patchCanvas.height = PATCH_CANVAS_SIZE;
    }

    const ctx = this.patchCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const singleIcon: AabbRect = {
      id: 0,
      label: 'drag',
      x: (PATCH_CSS_SIZE - 76) * 0.5,
      y: (PATCH_CSS_SIZE - 88) * 0.5,
      width: 76,
      height: 88,
    };

    const { pixels } = rasterizeCrispIconMatsBuffer(
      [singleIcon],
      PATCH_CSS_SIZE,
      PATCH_CSS_SIZE,
      PATCH_CANVAS_SIZE,
      PATCH_CANVAS_SIZE,
      this.theme,
    );

    const img = ctx.createImageData(PATCH_CANVAS_SIZE, PATCH_CANVAS_SIZE);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);

    if (!this.patchTexture) {
      this.patchTexture = Texture.from(this.patchCanvas, true);
      this.dragMatSprite.texture = this.patchTexture;
      this.dragMatSprite.width = PATCH_CSS_SIZE;
      this.dragMatSprite.height = PATCH_CSS_SIZE;
      this.dropBloomSprite.texture = this.patchTexture;
      this.dropBloomSprite.width = PATCH_CSS_SIZE;
      this.dropBloomSprite.height = PATCH_CSS_SIZE;
    } else {
      this.patchTexture.source.update();
    }
  }

  private dispatchRasterJob(
    targetIcons: readonly AabbRect[],
    deferUntilDropBloomDone: boolean,
  ): void {
    const req: Omit<IconMatsWorkerRequest, 'jobId'> = {
      icons: targetIcons.map((i) => ({ ...i })),
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      cw: this.cw,
      ch: this.ch,
      theme: this.theme,
    };

    if (!this.worker) {
      const jobId = this.nextJobId++;
      const { pixels, hasIcons } = rasterizeCrispIconMatsBuffer(
        req.icons,
        req.viewWidth,
        req.viewHeight,
        req.cw,
        req.ch,
        req.theme,
      );
      this.handleCompletedPixels(
        jobId,
        req.cw,
        req.ch,
        pixels,
        hasIcons,
        deferUntilDropBloomDone,
      );
      return;
    }

    if (this.workerBusy) {
      this.pendingWorkerReq = { req, deferUntilDropBloomDone };
      return;
    }

    this.sendToWorker(req, deferUntilDropBloomDone);
  }

  private sendToWorker(
    req: Omit<IconMatsWorkerRequest, 'jobId'>,
    deferUntilDropBloomDone: boolean,
  ): void {
    if (!this.worker) {
      return;
    }
    this.workerBusy = true;
    this.activeJobDefersUntilBloom = deferUntilDropBloomDone;
    const jobId = this.nextJobId++;
    const fullReq: IconMatsWorkerRequest = {
      ...req,
      jobId,
    };
    this.worker.postMessage(fullReq);
  }

  private onWorkerCompleted(res: IconMatsWorkerResponse): void {
    const deferUntilBloom = this.activeJobDefersUntilBloom;
    this.workerBusy = false;

    if (this.pendingWorkerReq) {
      const next = this.pendingWorkerReq;
      this.pendingWorkerReq = null;
      this.sendToWorker(next.req, next.deferUntilDropBloomDone);
    }

    if (res.jobId < this.latestAppliedJobId || res.cw !== this.cw || res.ch !== this.ch) {
      return;
    }

    const pixels = new Uint8ClampedArray(res.pixelsBuffer);
    this.handleCompletedPixels(
      res.jobId,
      res.cw,
      res.ch,
      pixels,
      res.hasIcons,
      deferUntilBloom,
    );
  }

  private handleCompletedPixels(
    jobId: number,
    cw: number,
    ch: number,
    pixels: Uint8ClampedArray,
    hasIcons: boolean,
    deferUntilDropBloomDone: boolean,
  ): void {
    this.latestAppliedJobId = jobId;

    // If the single dropped icon is currently fading in on dropBloomSprite, hold the
    // merged full-canvas commit until dropBloomProgress reaches 1.0 so ONLY the dropped
    // icon fades in and stationary icons never change!
    if (deferUntilDropBloomDone && this.dropBloomProgress < 1) {
      this.stagedPixels = { cw, ch, pixels, hasIcons };
      return;
    }

    this.stagedPixels = null;
    this.commitPixelsToCurrentCanvas(cw, ch, pixels, hasIcons);
  }

  private commitPixelsToCurrentCanvas(
    cw: number,
    ch: number,
    pixels: Uint8ClampedArray,
    hasIcons: boolean,
  ): void {
    if (!this.currentCtx || !this.currentCanvas || !this.currentTexture) {
      return;
    }

    if (!hasIcons) {
      this.currentSprite.visible = false;
      return;
    }

    const imgData = this.currentCtx.createImageData(cw, ch);
    imgData.data.set(pixels);
    this.currentCtx.putImageData(imgData, 0, 0);
    this.currentTexture.source.update();
    this.currentSprite.visible = true;
    this.applyLightingTint();
  }

  override destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.currentTexture && this.currentTexture !== Texture.EMPTY) {
      this.currentTexture.destroy(true);
      this.currentTexture = null;
    }
    if (this.patchTexture && this.patchTexture !== Texture.EMPTY) {
      this.patchTexture.destroy(true);
      this.patchTexture = null;
    }
    this.currentCanvas = null;
    this.currentCtx = null;
    this.patchCanvas = null;
    this.stagedPixels = null;
    super.destroy({ children: true });
  }
}
