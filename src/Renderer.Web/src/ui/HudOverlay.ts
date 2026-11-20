import {
  SCENE_THEME_LABELS,
  type CircadianPhase,
  type EffectiveLightingMode,
  type HudStats,
  type InteractionToastPayload,
  type SceneTheme,
} from '../types/simulation';

export type { EffectiveLightingMode, HudStats, InteractionToastPayload } from '../types/simulation';
export type EffectiveLighting = EffectiveLightingMode;

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_TOAST_DURATION_MS = 2400;
const EXIT_ANIMATION_MS = 230;
const FLASH_DURATION_MS = 320;
const VIEWPORT_MARGIN_X = 16;
const VIEWPORT_MARGIN_TOP = 64;
const VIEWPORT_MARGIN_BOTTOM = 84;
const ANCHOR_OFFSET_Y = 38;
const MAX_FRIENDSHIP_HEARTS = 5;

const HUD_ICONS: Readonly<
  Record<
    InteractionToastPayload['kind'] | 'laser' | 'toy' | 'sound' | CircadianPhase,
    readonly string[]
  >
> = {
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
  toy: [
    'M10 3.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 1 0 0-12.8Z',
    'M5.3 6.9c2.5 1.1 6.5 1.1 9.4 0',
    'M4.5 11.4c3.3-.6 7.3.7 10.4 2.2',
  ],
  photo: [
    'M3.5 7.2a1.6 1.6 0 0 1 1.6-1.6h1.7l1.1-1.6h4.2l1.1 1.6h1.7a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6V7.2Z',
    'M10 8.3a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2Z',
  ],
  laser: [
    'M3.8 16.2 11 9',
    'M13.6 6.4a1.9 1.9 0 1 0 0 .01',
    'M13.6 2.6v1.5',
    'M17.4 6.4h-1.5',
  ],
  sound: [
    'M3.8 8.2h2.7l3.7-3v9.6l-3.7-3H3.8V8.2Z',
    'M13.2 7.3a4.2 4.2 0 0 1 0 5.4',
    'M15.4 5.2a7 7 0 0 1 0 9.6',
  ],
  dawn: [
    'M3.2 14h13.6',
    'M6.2 14a3.8 3.8 0 0 1 7.6 0',
    'M10 5.6v2',
    'M5.3 8.2l1.2 1.2',
    'M14.7 8.2l-1.2 1.2',
  ],
  midday: [
    'M10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8Z',
    'M10 2.6v1.5',
    'M10 15.9v1.5',
    'M2.6 10h1.5',
    'M15.9 10h1.5',
  ],
  dusk: [
    'M3.2 13.6h13.6',
    'M6.2 13.6a3.8 3.8 0 0 1 7.6 0',
    'M7.4 16.2h5.2',
  ],
  night: [
    'M14.6 12.5A5.4 5.4 0 0 1 7.5 5.4a5.6 5.6 0 1 0 7.1 7.1Z',
  ],
};

const PHASE_LABELS: Readonly<Record<CircadianPhase, string>> = {
  dawn: 'Dawn',
  midday: 'Daytime',
  dusk: 'Golden hour',
  night: 'Night',
};

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

function createHeartSvg(filled: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ns-toast-heart ${filled ? 'is-filled' : 'is-empty'}`);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M8 13.6S2.4 9.9 2.4 5.9A3.1 3.1 0 0 1 5.5 2.8c1 0 2 .5 2.5 1.4.5-.9 1.5-1.4 2.5-1.4a3.1 3.1 0 0 1 3.1 3.1c0 4-5.6 7.7-5.6 7.7Z',
  );
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function resolveCircadianPhase(stats: HudStats): CircadianPhase | null {
  if (stats.circadianPhase) {
    return stats.circadianPhase;
  }
  if (stats.effectiveLighting === 'day') {
    return 'midday';
  }
  if (stats.effectiveLighting === 'golden') {
    return 'dusk';
  }
  if (stats.effectiveLighting === 'night') {
    return 'night';
  }
  return null;
}

/**
 * Whisper-quiet optional status pill, transient non-blocking interaction toast
 * (with Friendship Hearts for cats), and subtle Photo Mode capture flash.
 */
export class HudOverlay {
  private readonly root: HTMLElement;

  // Optional floating status pill (top-center, hidden by default)
  private readonly statusPill: HTMLDivElement;
  private readonly sceneDot: HTMLSpanElement;
  private readonly sceneLabelEl: HTMLSpanElement;
  private readonly catCountEl: HTMLSpanElement;
  private readonly phaseBadgeEl: HTMLSpanElement;
  private readonly laserBadgeEl: HTMLSpanElement;
  private readonly laserBadgeTextEl: HTMLSpanElement;
  private readonly treatBadgeEl: HTMLSpanElement;
  private readonly treatBadgeTextEl: HTMLSpanElement;
  private readonly toyBadgeEl: HTMLSpanElement;
  private readonly toyBadgeTextEl: HTMLSpanElement;
  private readonly audioBadgeEl: HTMLSpanElement;
  private readonly pausedBadgeEl: HTMLSpanElement;

  // Transient interaction toast (works even when the status pill is hidden)
  private readonly toastEl: HTMLDivElement;
  private readonly toastIconSlot: HTMLSpanElement;
  private readonly toastTitleEl: HTMLSpanElement;
  private readonly toastHeartsEl: HTMLSpanElement;
  private readonly toastDashEl: HTMLSpanElement;
  private readonly toastSubEl: HTMLSpanElement;

  // Subtle Photo Mode capture flash
  private readonly flashEl: HTMLDivElement;

  private pillVisible = false;
  private pillHideTimer: ReturnType<typeof setTimeout> | null = null;
  private toastFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private toastHideTimer: ReturnType<typeof setTimeout> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private lastToastKind: InteractionToastPayload['kind'] | null = null;
  private lastPhase: CircadianPhase | null = null;

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
    this.sceneLabelEl.textContent = SCENE_THEME_LABELS.study;

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

    this.phaseBadgeEl = document.createElement('span');
    this.phaseBadgeEl.className = 'ns-hud-phase';
    this.phaseBadgeEl.hidden = true;

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

    this.toyBadgeEl = document.createElement('span');
    this.toyBadgeEl.className = 'ns-hud-badge is-toy';
    this.toyBadgeEl.hidden = true;
    this.toyBadgeEl.appendChild(createHudSvg(HUD_ICONS.toy, 'ns-hud-badge-svg'));
    this.toyBadgeTextEl = document.createElement('span');
    this.toyBadgeTextEl.textContent = '1 toy';
    this.toyBadgeEl.appendChild(this.toyBadgeTextEl);

    this.audioBadgeEl = document.createElement('span');
    this.audioBadgeEl.className = 'ns-hud-badge is-audio';
    this.audioBadgeEl.hidden = true;
    this.audioBadgeEl.appendChild(createHudSvg(HUD_ICONS.sound, 'ns-hud-badge-svg'));
    const audioText = document.createElement('span');
    audioText.textContent = 'Sound';
    this.audioBadgeEl.appendChild(audioText);

    this.pausedBadgeEl = document.createElement('span');
    this.pausedBadgeEl.className = 'ns-hud-badge is-paused';
    this.pausedBadgeEl.hidden = true;
    this.pausedBadgeEl.textContent = 'Paused';

    this.statusPill.append(
      this.sceneDot,
      this.sceneLabelEl,
      sep,
      catsGroup,
      this.phaseBadgeEl,
      this.laserBadgeEl,
      this.treatBadgeEl,
      this.toyBadgeEl,
      this.audioBadgeEl,
      this.pausedBadgeEl,
    );

    // 2. Transient Cat / Prop / Toy Interaction Toast
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

    this.toastHeartsEl = document.createElement('span');
    this.toastHeartsEl.className = 'ns-toast-hearts';
    this.toastHeartsEl.hidden = true;

    this.toastDashEl = document.createElement('span');
    this.toastDashEl.className = 'ns-toast-dash';
    this.toastDashEl.setAttribute('aria-hidden', 'true');
    this.toastDashEl.textContent = '\u2014';

    this.toastSubEl = document.createElement('span');
    this.toastSubEl.className = 'ns-toast-sub';

    toastCopy.append(
      this.toastTitleEl,
      this.toastHeartsEl,
      this.toastDashEl,
      this.toastSubEl,
    );
    this.toastEl.append(this.toastIconSlot, toastCopy);

    // 3. Brief Subtle Photo Mode Flash Overlay
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'ns-photo-flash';
    this.flashEl.setAttribute('aria-hidden', 'true');

    this.root.append(this.statusPill, this.toastEl, this.flashEl);
  }

  public setStats(stats: HudStats): void {
    const themeKey: SceneTheme = stats.sceneTheme in SCENE_THEME_LABELS ? stats.sceneTheme : 'study';
    const sceneLabel = SCENE_THEME_LABELS[themeKey] ?? SCENE_THEME_LABELS.study;
    this.sceneDot.setAttribute('data-scene', themeKey);
    this.sceneLabelEl.textContent = sceneLabel;

    const count = Math.max(0, Math.round(stats.catCount));
    this.catCountEl.textContent = `${count} ${count === 1 ? 'cat' : 'cats'}`;

    const phase = resolveCircadianPhase(stats);
    this.phaseBadgeEl.hidden = phase === null;
    if (phase !== null && phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.phaseBadgeEl.innerHTML = '';
      this.phaseBadgeEl.appendChild(createHudSvg(HUD_ICONS[phase], 'ns-hud-phase-svg'));
      this.phaseBadgeEl.setAttribute('title', PHASE_LABELS[phase]);
      this.phaseBadgeEl.setAttribute('aria-label', PHASE_LABELS[phase]);
    }

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

    const toys = Math.max(0, Math.round(stats.activeToysCount ?? 0));
    this.toyBadgeEl.hidden = toys <= 0;
    if (toys > 0) {
      this.toyBadgeTextEl.textContent = `${toys} ${toys === 1 ? 'toy' : 'toys'}`;
    }

    this.audioBadgeEl.hidden = !stats.soundEnabled;
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

    const kind = payload.kind in HUD_ICONS ? payload.kind : 'prop';
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

    const hasHearts =
      kind === 'cat' &&
      typeof payload.friendshipLevel === 'number' &&
      Number.isFinite(payload.friendshipLevel);
    if (hasHearts) {
      const level = clamp(Math.round(payload.friendshipLevel as number), 1, MAX_FRIENDSHIP_HEARTS);
      this.toastHeartsEl.innerHTML = '';
      this.toastHeartsEl.setAttribute('aria-label', `Friendship ${level} of ${MAX_FRIENDSHIP_HEARTS}`);
      for (let i = 0; i < MAX_FRIENDSHIP_HEARTS; i++) {
        this.toastHeartsEl.appendChild(createHeartSvg(i < level));
      }
      this.toastHeartsEl.hidden = false;
    } else {
      this.toastHeartsEl.hidden = true;
      this.toastHeartsEl.innerHTML = '';
    }

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
      const measuredW = this.toastEl.offsetWidth || 260;
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

  public triggerPhotoFlash(): void {
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.flashEl.classList.remove('is-flashing');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('is-flashing');

    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.flashEl.classList.remove('is-flashing');
    }, FLASH_DURATION_MS);
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
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.clearToastTimers();
    this.statusPill.remove();
    this.toastEl.remove();
    this.flashEl.remove();
  }
}
