import { Container, Sprite, Texture } from 'pixi.js';
import type { IconSdfBounds } from '../core/IconFieldSdf';
import type { AabbRect, SceneTheme } from '../types/simulation';
import type { EffectiveLightingMode } from './LightingOverlay';
import { SCENE_THEME_DEFS } from './SceneThemes';
import {
  paintIconMatsSubRect,
  rasterizeCrispIconMatsBuffer,
  type IconMatsWorkerRequest,
  type IconMatsWorkerResponse,
} from './iconMats.worker';

const CANVAS_STEP = 2;
const DIRTY_MARGIN = 48;
const POSITION_MATCH_TOLERANCE_PX = 5.0;

interface ActiveGrowDrop {
  stationaryIcons: AabbRect[];
  targetIcon: AabbRect;
  progress: number;
  subBounds: IconSdfBounds;
}

/**
 * Iconscape-inspired coalesced organic floor mats underneath desktop icons.
 *
 * Surgical Sub-Rectangle Grow Architecture:
 * - Zero drag-time mat updates (no lag while dragging).
 * - Full-screen initial loads and theme switches execute on a background Web Worker.
 * - When a single dragged icon is dropped:
 *   1) Geometric set-difference matching identifies the vacated old rect and the
 *      newly dropped rect (immune to Windows Explorer SysListView32 index shifts).
 *   2) Only the ~180x190px sub-rectangle around the vacated old spot is cleared in-place
 *      on `imageData` (all other stationary icon mats across the screen are untouched bytes).
 *   3) Inside the ~180x190px sub-rectangle around the dropped icon, the true SDF box
 *      grows smoothly from 10% -> 100% over ~280ms (`<0.35ms` per frame).
 *   4) Because frame `progress = 1.0` renders the exact 100% final SDF directly into
 *      `imageData`, there is ZERO sprite swap and ZERO re-render after growing finishes.
 */
export class IconMatsOverlay extends Container {
  private readonly currentSprite: Sprite;

  private currentTexture: Texture | null = null;
  private currentCanvas: HTMLCanvasElement | null = null;
  private currentCtx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  private worker: Worker | null = null;
  private nextJobId = 1;
  private latestAppliedJobId = 0;
  private workerBusy = false;
  private pendingWorkerReq: Omit<IconMatsWorkerRequest, 'jobId'> | null = null;

  private cw = 0;
  private ch = 0;
  private viewWidth: number;
  private viewHeight: number;

  private icons: AabbRect[] = [];
  private settledIcons: AabbRect[] = [];
  private growingDrop: ActiveGrowDrop | null = null;

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
    this.addChild(this.currentSprite);

    this.initSurfaces(this.viewWidth, this.viewHeight);
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

  private static splitStationaryVacatedAndDropped(
    previous: readonly AabbRect[],
    incoming: readonly AabbRect[],
  ): { stationary: AabbRect[]; vacated: AabbRect[]; dropped: AabbRect[] } {
    const matchedPrevIndices = new Set<number>();
    const stationary: AabbRect[] = [];
    const dropped: AabbRect[] = [];

    for (const inc of incoming) {
      let foundPrevIdx = -1;
      for (let i = 0; i < previous.length; i++) {
        if (matchedPrevIndices.has(i)) {
          continue;
        }
        if (IconMatsOverlay.isSamePosition(inc, previous[i])) {
          foundPrevIdx = i;
          break;
        }
      }

      if (foundPrevIdx >= 0) {
        matchedPrevIndices.add(foundPrevIdx);
        stationary.push(inc);
      } else {
        dropped.push(inc);
      }
    }

    const vacated: AabbRect[] = [];
    for (let i = 0; i < previous.length; i++) {
      if (!matchedPrevIndices.has(i)) {
        vacated.push(previous[i]);
      }
    }

    return { stationary, vacated, dropped };
  }

  private boundsForIcon(icon: AabbRect): IconSdfBounds {
    return {
      minX: Math.max(0, Math.floor(icon.x - DIRTY_MARGIN)),
      minY: Math.max(0, Math.floor(icon.y - DIRTY_MARGIN)),
      maxX: Math.min(this.viewWidth, Math.ceil(icon.x + icon.width + DIRTY_MARGIN)),
      maxY: Math.min(this.viewHeight, Math.ceil(icon.y + icon.height + DIRTY_MARGIN)),
    };
  }

  setIcons(icons: readonly AabbRect[], options?: { fast?: boolean }): void {
    // Ignore drag-in-progress calls; we only animate when an icon is dropped
    if (options?.fast === true) {
      return;
    }

    const incoming = icons.map((icon) => ({ ...icon }));

    if (incoming.length === 0) {
      this.icons = [];
      this.settledIcons = [];
      this.growingDrop = null;
      this.currentSprite.visible = false;
      return;
    }

    // Initial load when no previous icons existed
    if (this.settledIcons.length === 0) {
      this.icons = incoming;
      this.settledIcons = incoming.map((icon) => ({ ...icon }));
      this.growingDrop = null;
      this.dispatchFullRasterJob(incoming);
      this.applyLightingTint();
      return;
    }

    const { stationary, vacated, dropped } = IconMatsOverlay.splitStationaryVacatedAndDropped(
      this.settledIcons,
      incoming,
    );

    // If no icon changed position, do nothing (zero refreshes!)
    if (dropped.length === 0 && vacated.length === 0) {
      return;
    }

    // If a previous drop grow was mid-flight, finish its final frame in-place before starting the new one
    if (this.growingDrop) {
      this.renderGrowFrame(this.growingDrop, 1);
      this.growingDrop = null;
    }

    this.icons = incoming;
    this.settledIcons = incoming.map((icon) => ({ ...icon }));

    // Surgical single-icon drop (or single icon removed/added):
    // Touch ONLY the local ~180x190px sub-rectangles of the vacated spot and the dropped spot!
    // Every other stationary icon on the desktop is literally untouched memory in `this.imageData`.
    if (dropped.length <= 1 && vacated.length <= 1 && this.imageData && this.currentSprite.visible) {
      // 1) In-place clear/update ONLY the vacated old sub-rectangle (using stationary icons)
      for (const oldIcon of vacated) {
        this.updateCanvasSubRect(stationary, this.boundsForIcon(oldIcon));
      }

      // 2) Start the in-place SDF grow/expand animation ONLY inside the dropped icon's sub-rectangle
      if (dropped.length === 1) {
        const target = dropped[0];
        this.growingDrop = {
          stationaryIcons: stationary,
          targetIcon: target,
          progress: 0.04,
          subBounds: this.boundsForIcon(target),
        };
        this.renderGrowFrame(this.growingDrop, this.growingDrop.progress);
      }

      this.applyLightingTint();
      return;
    }

    // Bulk change (e.g. Tidy Icons grid reset): render full settled layout via Web Worker
    this.growingDrop = null;
    this.dispatchFullRasterJob(incoming);
    this.applyLightingTint();
  }

  update(dt: number): void {
    if (!this.growingDrop) {
      return;
    }

    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    // ~275ms smooth SDF grow/expand directly in the local sub-rectangle
    this.growingDrop.progress = Math.min(1, this.growingDrop.progress + safeDt * 3.6);
    this.renderGrowFrame(this.growingDrop, this.growingDrop.progress);

    if (this.growingDrop.progress >= 1) {
      // At progress === 1, renderGrowFrame already painted the exact 100% final SDF
      // into `this.imageData`. Nothing else to commit or re-render afterward!
      this.growingDrop = null;
    }
  }

  private renderGrowFrame(grow: ActiveGrowDrop, progress: number): void {
    const t = Math.max(0, Math.min(1, progress));
    // Smooth cubic ease-out from 10% seed at center to 100% exact final icon dimensions
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = 0.1 + 0.9 * eased;

    const target = grow.targetIcon;
    const cx = target.x + target.width * 0.5;
    const cy = target.y + target.height * 0.5;

    // Scale total padded size (width + 2*padding where padding = 12) so hx/hy in computeIconSdfGrid
    // expands linearly from 10% -> 100% and reaches exact target.width / target.height at t === 1.
    const fullPaddedW = target.width + 24;
    const fullPaddedH = target.height + 24;
    const w = t >= 0.999 ? target.width : Math.max(4, fullPaddedW * scale) - 24;
    const h = t >= 0.999 ? target.height : Math.max(4, fullPaddedH * scale) - 24;

    const scaledIcon: AabbRect = {
      ...target,
      x: t >= 0.999 ? target.x : cx - w * 0.5,
      y: t >= 0.999 ? target.y : cy - h * 0.5,
      width: w,
      height: h,
    };

    const workingIcons = [...grow.stationaryIcons, scaledIcon];
    this.updateCanvasSubRect(workingIcons, grow.subBounds);
  }

  private updateCanvasSubRect(icons: readonly AabbRect[], subBounds: IconSdfBounds): void {
    if (!this.currentCtx || !this.imageData || !this.currentTexture) {
      return;
    }

    const dirty = paintIconMatsSubRect(
      this.imageData.data,
      icons,
      this.viewWidth,
      this.viewHeight,
      this.cw,
      this.ch,
      this.theme,
      subBounds,
    );

    if (!dirty) {
      return;
    }

    this.currentCtx.putImageData(
      this.imageData,
      0,
      0,
      dirty.c0,
      dirty.r0,
      dirty.c1 - dirty.c0 + 1,
      dirty.r1 - dirty.r0 + 1,
    );
    this.currentTexture.source.update();
    this.currentSprite.visible = true;
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme) {
      return;
    }
    this.theme = theme;
    this.growingDrop = null;
    if (this.icons.length > 0) {
      this.dispatchFullRasterJob(this.icons);
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
    this.growingDrop = null;
    this.initSurfaces(w, h);
    if (this.icons.length > 0) {
      this.dispatchFullRasterJob(this.icons);
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
    this.currentSprite.tint = isNight ? matCfg.nightTint : 0xffffff;
    this.currentSprite.alpha = isNight ? matCfg.nightAlpha : 1;
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
    this.imageData = ctx ? ctx.createImageData(this.cw, this.ch) : null;
    this.currentTexture = texture;
    this.currentSprite.texture = texture;
    this.currentSprite.width = this.cw * CANVAS_STEP;
    this.currentSprite.height = this.ch * CANVAS_STEP;

    if (oldCurr && oldCurr !== Texture.EMPTY) {
      oldCurr.destroy(true);
    }
  }

  private dispatchFullRasterJob(targetIcons: readonly AabbRect[]): void {
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
      this.commitFullPixels(jobId, req.cw, req.ch, pixels, hasIcons);
      return;
    }

    if (this.workerBusy) {
      this.pendingWorkerReq = req;
      return;
    }

    this.sendToWorker(req);
  }

  private sendToWorker(req: Omit<IconMatsWorkerRequest, 'jobId'>): void {
    if (!this.worker) {
      return;
    }
    this.workerBusy = true;
    const jobId = this.nextJobId++;
    const fullReq: IconMatsWorkerRequest = {
      ...req,
      jobId,
    };
    this.worker.postMessage(fullReq);
  }

  private onWorkerCompleted(res: IconMatsWorkerResponse): void {
    this.workerBusy = false;

    if (this.pendingWorkerReq) {
      const next = this.pendingWorkerReq;
      this.pendingWorkerReq = null;
      this.sendToWorker(next);
    }

    if (res.jobId < this.latestAppliedJobId || res.cw !== this.cw || res.ch !== this.ch) {
      return;
    }

    // If a single-icon grow animation started while an old full-screen worker job was in flight,
    // don't let the stale full-screen job overwrite the active surgical canvas!
    if (this.growingDrop) {
      return;
    }

    const pixels = new Uint8ClampedArray(res.pixelsBuffer);
    this.commitFullPixels(res.jobId, res.cw, res.ch, pixels, res.hasIcons);
  }

  private commitFullPixels(
    jobId: number,
    cw: number,
    ch: number,
    pixels: Uint8ClampedArray,
    hasIcons: boolean,
  ): void {
    this.latestAppliedJobId = jobId;

    if (!this.currentCtx || !this.currentCanvas || !this.currentTexture || !this.imageData) {
      return;
    }

    if (!hasIcons) {
      this.imageData.data.fill(0);
      this.currentCtx.putImageData(this.imageData, 0, 0);
      this.currentTexture.source.update();
      this.currentSprite.visible = false;
      return;
    }

    this.imageData.data.set(pixels);
    this.currentCtx.putImageData(this.imageData, 0, 0);
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
    this.currentCanvas = null;
    this.currentCtx = null;
    this.imageData = null;
    this.growingDrop = null;
    super.destroy({ children: true });
  }
}
