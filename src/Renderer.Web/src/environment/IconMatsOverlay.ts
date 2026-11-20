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
const POSITION_MATCH_TOLERANCE_PX = 3.5;

/**
 * Iconscape-inspired coalesced organic floor mats underneath desktop icons.
 *
 * Behavior & Performance:
 * - No dynamic mat movement while dragging an icon (zero drag-time CPU/GPU overhead).
 * - When a dragged icon is dropped, geometric position set-difference matching
 *   (`findNewlyPlacedIcons`) identifies ONLY the newly dropped icon coordinate(s)
 *   regardless of Windows Explorer `SysListView32` index reordering.
 * - Stationary icons remain at 100% steady opacity on `currentSprite` and never
 *   refresh or blink; ONLY the dropped icon's mat (`dropBloomSprite`) fades & blooms
 *   in (`alpha: 0 -> 1`, `scale: 0.8 -> 1.0`) over 360ms at the dropped position.
 */
export class IconMatsOverlay extends Container {
  private readonly currentSprite: Sprite;
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

    this.addChild(this.currentSprite, this.dropBloomSprite);

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

  private static isSamePosition(a: AabbRect, b: AabbRect): boolean {
    return (
      Math.abs(a.x - b.x) <= POSITION_MATCH_TOLERANCE_PX &&
      Math.abs(a.y - b.y) <= POSITION_MATCH_TOLERANCE_PX
    );
  }

  /**
   * Pure geometric comparison of icon sets so Windows Explorer SysListView32
   * index shuffling never causes a stationary icon to be mistaken for a moved icon.
   */
  private static splitStationaryAndDropped(
    previous: readonly AabbRect[],
    incoming: readonly AabbRect[],
  ): { stationary: AabbRect[]; dropped: AabbRect[] } {
    const usedPrevIndices = new Set<number>();
    const stationary: AabbRect[] = [];
    const dropped: AabbRect[] = [];

    for (const inc of incoming) {
      let matchedPrevIdx = -1;
      for (let i = 0; i < previous.length; i++) {
        if (usedPrevIndices.has(i)) {
          continue;
        }
        if (IconMatsOverlay.isSamePosition(inc, previous[i])) {
          matchedPrevIdx = i;
          break;
        }
      }

      if (matchedPrevIdx >= 0) {
        usedPrevIndices.add(matchedPrevIdx);
        stationary.push(inc);
      } else {
        dropped.push(inc);
      }
    }

    return { stationary, dropped };
  }

  setIcons(icons: readonly AabbRect[], options?: { fast?: boolean }): void {
    // Ignore drag-in-progress calls; we only update and fade-in when an icon is dropped
    if (options?.fast === true) {
      return;
    }

    const incoming = icons.map((icon) => ({ ...icon }));

    if (incoming.length === 0) {
      this.icons = [];
      this.settledIcons = [];
      this.stagedPixels = null;
      this.dropBloomSprite.visible = false;
      this.currentSprite.visible = false;
      return;
    }

    // Initial load when no previous icons existed
    if (this.settledIcons.length === 0) {
      this.icons = incoming;
      this.settledIcons = incoming.map((icon) => ({ ...icon }));
      this.dropBloomSprite.visible = false;
      this.dropBloomProgress = 1;
      this.dispatchRasterJob(incoming, false);
      this.applyLightingTint();
      return;
    }

    const { stationary, dropped } = IconMatsOverlay.splitStationaryAndDropped(
      this.settledIcons,
      incoming,
    );

    // If no icon changed position and counts match, do nothing (zero refreshes!)
    if (dropped.length === 0 && incoming.length === this.settledIcons.length) {
      return;
    }

    this.icons = incoming;
    this.settledIcons = incoming.map((icon) => ({ ...icon }));

    // Single icon (or small group) dropped at a new position:
    // 1) Update `currentSprite` immediately with ONLY the stationary icons so the vacated
    //    old spot disappears while all stationary icons stay at 100% steady opacity.
    // 2) Fade in `dropBloomSprite` (`alpha: 0 -> 1`, `scale: 0.8 -> 1.0`) exclusively at
    //    the dropped icon's new position.
    // 3) Commit the full merged SDF (including the dropped icon) once the fade-in reaches 100%.
    if (dropped.length === 1) {
      const target = dropped[0];
      const dropCx = target.x + target.width * 0.5;
      const dropCy = target.y + target.height * 0.5;

      this.dropBloomSprite.position.set(dropCx, dropCy);
      this.dropBloomProgress = 0.01;
      this.dropBloomSprite.visible = true;

      // Render stationary icons immediately (no fade, keeps all un-dragged icons 100% solid)
      this.dispatchRasterJob(stationary, false);
      // Stage full icons (with the dropped icon merged in) to commit when dropBloomProgress === 1
      this.dispatchRasterJob(incoming, true);
    } else {
      // Bulk change (e.g. Tidy Icons grid reset): render settled layout directly
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

    // Stationary icons on currentSprite ALWAYS remain at 100% steady opacity
    this.currentSprite.tint = baseTint;
    this.currentSprite.alpha = baseAlpha;

    // ONLY the newly dropped icon mat (`dropBloomSprite`) animates alpha 0 -> 1 and scale 0.8 -> 1.0
    if (this.dropBloomSprite.visible) {
      const bt = Math.max(0, Math.min(1, this.dropBloomProgress));
      const eased = 1 - Math.pow(1 - bt, 3);
      const scale = 0.8 + 0.2 * eased;
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
      label: 'drop',
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

    // Hold the final merged canvas commit until dropBloomSprite reaches 100% opacity
    // so ONLY the dropped icon fades in and stationary icons never change!
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
