import type {
  EffectiveLightingMode,
  HudStats,
  InteractionToastPayload,
  SceneTheme,
} from '../types/simulation';

export type { EffectiveLightingMode, HudStats, InteractionToastPayload } from '../types/simulation';
export type EffectiveLighting = EffectiveLightingMode;

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_TOAST_DURATION_MS = 2200;
const EXIT_ANIMATION_MS = 230;
const VIEWPORT_MARGIN_X = 16;
const VIEWPORT_MARGIN_TOP = 64;
const VIEWPORT_MARGIN_BOTTOM = 84;
const ANCHOR_OFFSET_Y = 38;

const SCENE_LABELS: Readonly<Record<SceneTheme, string>> = {
  study: 'Study',
  tatami: 'Tatami',
  garden: 'Garden',
  cafe: 'Cafe',
};

const HUD_ICONS = {
  cat: [
    'M4.5 13.8V7.2l2.8 2.1a6.4 6.4 0 0 1 5.4 0l2.8-2.1v6.6c0 1.8-2.4 3.1-5.5 3.1s-5.5-1.3-5.5-3.1Z',
    'M8.2 12.2h.01',
    'M11.8 12.2h.01',
  ],
  prop: [
    'M10 3.2l1.55 4.65 4.65 1.55-4.65 1.55L10 15.6l-1.55-4.65L3.8 9.4l4.65-1.55L10 3.2Z',
    'M15.4 4.2v2.2',
    'M14.3 5.3h2.2',
  ],
  treat: [
    'M17 10c-1.9 2.7-4.6 3.8-7.6 3.3-1.2-.2-2.2-.9-2.9-1.9L3.3 13.4V6.6l3.2 2c.7-1 1.7-1.7 2.9-1.9 3-.5 5.7.6 7.6 3.3Z',
    'M13.6 9.4h.01',
  ],
  laser: [
    'M3.8 16.2 11 9',
    'M13.6 6.4a1.9 1.9 0 1 0 0 .01',
    'M13.6 2.6v1.5',
    'M17.4 6.4h-1.5',
  ],
} as const;

function createHudSvg(paths: readonly string[], className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Whisper-quiet optional status pill plus a transient, non-blocking interaction toast
 * for clicked cats, interactive scene props, and dropped treats.
 */
export class HudOverlay {
  private readonly root: HTMLElement;

  // Optional floating status pill (top-center, hidden by default)
  private readonly statusPill: HTMLDivElement;
  private readonly sceneDot: HTMLSpanElement;
  private readonly sceneLabelEl: HTMLSpanElement;
  private readonly catCountEl: HTMLSpanElement;
  private readonly laserBadgeEl: HTMLSpanElement;
  private readonly laserBadgeTextEl: HTMLSpanElement;
  private readonly treatBadgeEl: HTMLSpanElement;
  private readonly treatBadgeTextEl: HTMLSpanElement;
  private readonly pausedBadgeEl: HTMLSpanElement;

  // Transient interaction toast (works even when the status pill is hidden)
  private readonly toastEl: HTMLDivElement;
  private readonly toastIconSlot: HTMLSpanElement;
  private readonly toastTitleEl: HTMLSpanElement;
  private readonly toastDashEl: HTMLSpanElement;
  private readonly toastSubEl: HTMLSpanElement;

  private pillVisible = false;
  private pillHideTimer: ReturnType<typeof setTimeout> | null = null;
  private toastFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private toastHideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastToastKind: InteractionToastPayload['kind'] | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = '';
    this.root.style.display = '';
    this.root.removeAttribute('aria-hidden');

    // 1. Minimal Status Pill
    this.statusPill = document.createElement('div');
    this.statusPill.className = 'ns-double-bezel ns-hud-pill';
    this.statusPill.setAttribute('role', 'status');
    this.statusPill.setAttribute('aria-live', 'polite');
    this.statusPill.setAttribute('aria-hidden', 'true');
    this.statusPill.hidden = true;

    this.sceneDot = document.createElement('span');
    this.sceneDot.className = 'ns-hud-scene-dot';
    this.sceneDot.setAttribute('data-scene', 'study');
    this.sceneDot.setAttribute('aria-hidden', 'true');

    this.sceneLabelEl = document.createElement('span');
    this.sceneLabelEl.className = 'ns-hud-scene';
    this.sceneLabelEl.textContent = SCENE_LABELS.study;

    const sep = document.createElement('span');
    sep.className = 'ns-hud-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '\u00b7';

    const catsGroup = document.createElement('span');
    catsGroup.className = 'ns-hud-cats';
    catsGroup.appendChild(createHudSvg(HUD_ICONS.cat, 'ns-hud-svg'));
    this.catCountEl = document.createElement('span');
    this.catCountEl.className = 'ns-hud-count';
    this.catCountEl.textContent = '6 cats';
    catsGroup.appendChild(this.catCountEl);

    this.laserBadgeEl = document.createElement('span');
    this.laserBadgeEl.className = 'ns-hud-badge is-laser';
    this.laserBadgeEl.hidden = true;
    this.laserBadgeEl.appendChild(createHudSvg(HUD_ICONS.laser, 'ns-hud-badge-svg'));
    this.laserBadgeTextEl = document.createElement('span');
    this.laserBadgeTextEl.textContent = 'Laser';
    this.laserBadgeEl.appendChild(this.laserBadgeTextEl);

    this.treatBadgeEl = document.createElement('span');
    this.treatBadgeEl.className = 'ns-hud-badge is-treat';
    this.treatBadgeEl.hidden = true;
    this.treatBadgeEl.appendChild(createHudSvg(HUD_ICONS.treat, 'ns-hud-badge-svg'));
    this.treatBadgeTextEl = document.createElement('span');
    this.treatBadgeTextEl.textContent = '1 treat';
    this.treatBadgeEl.appendChild(this.treatBadgeTextEl);

    this.pausedBadgeEl = document.createElement('span');
    this.pausedBadgeEl.className = 'ns-hud-badge is-paused';
    this.pausedBadgeEl.hidden = true;
    this.pausedBadgeEl.textContent = 'Paused';

    this.statusPill.append(
      this.sceneDot,
      this.sceneLabelEl,
      sep,
      catsGroup,
      this.laserBadgeEl,
      this.treatBadgeEl,
      this.pausedBadgeEl,
    );

    // 2. Transient Cat / Prop Interaction Toast
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'ns-double-bezel ns-interaction-toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');
    this.toastEl.setAttribute('aria-hidden', 'true');
    this.toastEl.hidden = true;

    this.toastIconSlot = document.createElement('span');
    this.toastIconSlot.className = 'ns-toast-icon';
    this.toastIconSlot.setAttribute('aria-hidden', 'true');

    const toastCopy = document.createElement('span');
    toastCopy.className = 'ns-toast-copy';

    this.toastTitleEl = document.createElement('span');
    this.toastTitleEl.className = 'ns-toast-title';

    this.toastDashEl = document.createElement('span');
    this.toastDashEl.className = 'ns-toast-dash';
    this.toastDashEl.setAttribute('aria-hidden', 'true');
    this.toastDashEl.textContent = '\u2014';

    this.toastSubEl = document.createElement('span');
    this.toastSubEl.className = 'ns-toast-sub';

    toastCopy.append(this.toastTitleEl, this.toastDashEl, this.toastSubEl);
    this.toastEl.append(this.toastIconSlot, toastCopy);

    this.root.append(this.statusPill, this.toastEl);
  }

  public setStats(stats: HudStats): void {
    const sceneLabel = SCENE_LABELS[stats.sceneTheme] ?? SCENE_LABELS.study;
    this.sceneDot.setAttribute('data-scene', stats.sceneTheme);
    this.sceneLabelEl.textContent = sceneLabel;

    const count = Math.max(0, Math.round(stats.catCount));
    this.catCountEl.textContent = `${count} ${count === 1 ? 'cat' : 'cats'}`;

    const showLaser = Boolean(stats.laserActive);
    this.laserBadgeEl.hidden = !showLaser;
    if (showLaser) {
      this.laserBadgeTextEl.textContent = stats.splitPrism ? 'Prism' : 'Laser';
    }

    const treats = Math.max(0, Math.round(stats.activeTreatsCount ?? 0));
    this.treatBadgeEl.hidden = treats <= 0;
    if (treats > 0) {
      this.treatBadgeTextEl.textContent = `${treats} ${treats === 1 ? 'treat' : 'treats'}`;
    }

    this.pausedBadgeEl.hidden = !stats.paused;

    this.setPillVisible(Boolean(stats.visible));
  }

  private setPillVisible(visible: boolean): void {
    if (this.pillVisible === visible) {
      return;
    }
    this.pillVisible = visible;
    this.statusPill.setAttribute('aria-hidden', String(!visible));

    if (this.pillHideTimer !== null) {
      clearTimeout(this.pillHideTimer);
      this.pillHideTimer = null;
    }

    if (visible) {
      this.statusPill.hidden = false;
      void this.statusPill.offsetWidth;
      this.statusPill.classList.add('is-visible');
    } else {
      this.statusPill.classList.remove('is-visible');
      this.pillHideTimer = setTimeout(() => {
        if (!this.pillVisible) {
          this.statusPill.hidden = true;
        }
        this.pillHideTimer = null;
      }, EXIT_ANIMATION_MS);
    }
  }

  public showInteractionToast(payload: InteractionToastPayload): void {
    this.clearToastTimers();

    const kind = payload.kind;
    this.toastEl.setAttribute('data-kind', kind);
    if (this.lastToastKind !== kind) {
      this.lastToastKind = kind;
      this.toastIconSlot.innerHTML = '';
      this.toastIconSlot.appendChild(createHudSvg(HUD_ICONS[kind], 'ns-toast-svg'));
    }

    const title = payload.title.trim();
    const subtitle = payload.subtitle.trim();
    this.toastTitleEl.textContent = title;
    this.toastSubEl.textContent = subtitle;
    const hasBoth = title.length > 0 && subtitle.length > 0;
    this.toastDashEl.hidden = !hasBoth;
    this.toastSubEl.hidden = subtitle.length === 0;

    // Reset state so rapid clicks play a clean, crisp re-entrance
    this.toastEl.classList.remove('is-visible', 'is-exiting');
    this.toastEl.hidden = false;
    this.toastEl.setAttribute('aria-hidden', 'false');

    const hasAnchor =
      typeof payload.x === 'number' &&
      Number.isFinite(payload.x) &&
      typeof payload.y === 'number' &&
      Number.isFinite(payload.y);

    if (hasAnchor) {
      this.toastEl.classList.add('is-anchored');
      const vw =
        typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
      const vh =
        typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 720;
      const measuredW = this.toastEl.offsetWidth || 240;
      const halfW = Math.min(measuredW * 0.5, (vw - VIEWPORT_MARGIN_X * 2) * 0.5);

      const clampedX = Math.round(
        clamp(payload.x as number, halfW + VIEWPORT_MARGIN_X, vw - halfW - VIEWPORT_MARGIN_X),
      );
      const clampedY = Math.round(
        clamp(
          (payload.y as number) - ANCHOR_OFFSET_Y,
          VIEWPORT_MARGIN_TOP,
          vh - VIEWPORT_MARGIN_BOTTOM,
        ),
      );
      this.toastEl.style.setProperty('--toast-x', `${clampedX}px`);
      this.toastEl.style.setProperty('--toast-y', `${clampedY}px`);
    } else {
      this.toastEl.classList.remove('is-anchored');
      this.toastEl.style.removeProperty('--toast-x');
      this.toastEl.style.removeProperty('--toast-y');
    }

    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('is-visible');

    const durationMs = Math.max(900, Math.round(payload.durationMs ?? DEFAULT_TOAST_DURATION_MS));
    this.toastFadeTimer = setTimeout(() => {
      this.toastFadeTimer = null;
      this.toastEl.classList.remove('is-visible');
      this.toastEl.classList.add('is-exiting');
      this.toastEl.setAttribute('aria-hidden', 'true');

      this.toastHideTimer = setTimeout(() => {
        this.toastHideTimer = null;
        this.toastEl.classList.remove('is-exiting');
        this.toastEl.hidden = true;
      }, EXIT_ANIMATION_MS);
    }, durationMs);
  }

  public clearInteractionToast(): void {
    this.clearToastTimers();
    this.toastEl.classList.remove('is-visible', 'is-exiting');
    this.toastEl.setAttribute('aria-hidden', 'true');
    this.toastEl.hidden = true;
  }

  private clearToastTimers(): void {
    if (this.toastFadeTimer !== null) {
      clearTimeout(this.toastFadeTimer);
      this.toastFadeTimer = null;
    }
    if (this.toastHideTimer !== null) {
      clearTimeout(this.toastHideTimer);
      this.toastHideTimer = null;
    }
  }

  public destroy(): void {
    if (this.pillHideTimer !== null) {
      clearTimeout(this.pillHideTimer);
      this.pillHideTimer = null;
    }
    this.clearToastTimers();
    this.statusPill.remove();
    this.toastEl.remove();
  }
}
