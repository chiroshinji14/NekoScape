export interface PixiPhotoExtractor {
  canvas?: (target: unknown) => HTMLCanvasElement;
  base64?: (target: unknown) => Promise<string> | string;
}

export interface PixiPhotoSource {
  stage: unknown;
  renderer?: {
    render?: (container: unknown) => void;
    extract?: PixiPhotoExtractor;
  };
}

export interface PhotoCaptureOptions {
  filenamePrefix?: string;
  hideElements?: readonly (HTMLElement | null | undefined)[];
  onFlash?: () => void;
  app?: PixiPhotoSource;
  date?: Date;
}

export interface PhotoCaptureResult {
  ok: boolean;
  filename: string;
  width: number;
  height: number;
  blob?: Blob;
  dataUrl?: string;
  error?: string;
}

interface HiddenElementSnapshot {
  el: HTMLElement;
  prevDisplay: string;
}

function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, '0');
}

function sanitizeFilenamePrefix(prefix?: string): string {
  const cleaned = (prefix ?? 'nekoscape')
    .trim()
    .replace(/\.png$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+$/, '');
  return cleaned.length > 0 ? cleaned : 'nekoscape';
}

/**
 * Formats a deterministic screenshot filename: `nekoscape-YYYYMMDD-HHmmss.png`.
 */
export function formatPhotoFilename(
  date: Date = new Date(),
  filenamePrefix = 'nekoscape',
): string {
  const safeDate =
    date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const prefix = sanitizeFilenamePrefix(filenamePrefix);
  const y = safeDate.getFullYear();
  const m = pad2(safeDate.getMonth() + 1);
  const d = pad2(safeDate.getDate());
  const hh = pad2(safeDate.getHours());
  const mm = pad2(safeDate.getMinutes());
  const ss = pad2(safeDate.getSeconds());
  return `${prefix}-${y}${m}${d}-${hh}${mm}${ss}.png`;
}

function triggerDefaultFlashOverlay(): void {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    return;
  }

  const flash = document.createElement('div');
  flash.setAttribute('aria-hidden', 'true');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.pointerEvents = 'none';
  flash.style.zIndex = '99999';
  flash.style.background = 'rgba(255, 250, 244, 0.72)';
  flash.style.opacity = '1';
  flash.style.transition = 'opacity 180ms cubic-bezier(0.23, 1, 0.32, 1)';
  document.body.appendChild(flash);

  const schedule =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 0);

  schedule(() => {
    flash.style.opacity = '0';
  });

  setTimeout(() => {
    flash.remove();
  }, 210);
}

function readCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

function triggerDownload(href: string, filename: string): void {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  const parent = document.body ?? document.documentElement;
  if (parent && typeof parent.appendChild === 'function') {
    parent.appendChild(anchor);
  }
  if (typeof anchor.click === 'function') {
    anchor.click();
  }
  if (typeof anchor.remove === 'function') {
    anchor.remove();
  }
}

function hideUiElements(
  elements?: readonly (HTMLElement | null | undefined)[],
): HiddenElementSnapshot[] {
  const snapshots: HiddenElementSnapshot[] = [];
  if (!elements) {
    return snapshots;
  }
  for (const el of elements) {
    if (!el || !el.style) {
      continue;
    }
    snapshots.push({ el, prevDisplay: el.style.display });
    el.style.display = 'none';
  }
  return snapshots;
}

function restoreUiElements(snapshots: readonly HiddenElementSnapshot[]): void {
  for (const { el, prevDisplay } of snapshots) {
    el.style.display = prevDisplay;
  }
}

/**
 * Captures a PNG snapshot of the NekoScape canvas (preferring PixiJS extract
 * when provided so WebGL screenshots are never blank black frames), temporarily
 * hides UI elements, triggers a subtle flash, and initiates a download.
 */
export async function captureCanvasPhoto(
  canvas: HTMLCanvasElement,
  options: PhotoCaptureOptions = {},
): Promise<PhotoCaptureResult> {
  const filename = formatPhotoFilename(options.date, options.filenamePrefix);
  const hidden = hideUiElements(options.hideElements);

  try {
    if (options.onFlash) {
      options.onFlash();
    } else {
      triggerDefaultFlashOverlay();
    }

    let sourceCanvas: HTMLCanvasElement | null = canvas ?? null;
    let extractedBase64: string | undefined;

    const app = options.app;
    if (app?.renderer) {
      try {
        if (typeof app.renderer.render === 'function') {
          app.renderer.render(app.stage);
        }
        if (typeof app.renderer.extract?.canvas === 'function') {
          const extracted = app.renderer.extract.canvas(app.stage);
          if (extracted) {
            sourceCanvas = extracted;
          }
        } else if (typeof app.renderer.extract?.base64 === 'function') {
          const base64 = await app.renderer.extract.base64(app.stage);
          if (base64) {
            extractedBase64 = base64;
          }
        }
      } catch {
        // Fall back to direct canvas capture if PixiJS extract fails
        sourceCanvas = canvas ?? null;
      }
    }

    const width = sourceCanvas?.width ?? canvas?.width ?? 0;
    const height = sourceCanvas?.height ?? canvas?.height ?? 0;

    if (extractedBase64) {
      triggerDownload(extractedBase64, filename);
      return { ok: true, filename, width, height, dataUrl: extractedBase64 };
    }

    if (!sourceCanvas) {
      return {
        ok: false,
        filename,
        width: 0,
        height: 0,
        error: 'Canvas is unavailable for photo capture.',
      };
    }

    const blob = await readCanvasBlob(sourceCanvas);
    const hasObjectUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

    if (blob && hasObjectUrl) {
      const objectUrl = URL.createObjectURL(blob);
      try {
        triggerDownload(objectUrl, filename);
      } finally {
        const revokeTimer = setTimeout(() => {
          if (typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(objectUrl);
          }
        }, 1000);
        if (typeof revokeTimer === 'object' && revokeTimer !== null && 'unref' in revokeTimer) {
          (revokeTimer as { unref: () => void }).unref();
        }
      }
      return { ok: true, filename, width, height, blob };
    }

    const dataUrl =
      typeof sourceCanvas.toDataURL === 'function'
        ? sourceCanvas.toDataURL('image/png')
        : '';

    if (!dataUrl) {
      return {
        ok: false,
        filename,
        width,
        height,
        error: 'Unable to encode PNG image from canvas.',
      };
    }

    triggerDownload(dataUrl, filename);
    return { ok: true, filename, width, height, dataUrl, ...(blob ? { blob } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      filename,
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      error: message,
    };
  } finally {
    restoreUiElements(hidden);
  }
}
