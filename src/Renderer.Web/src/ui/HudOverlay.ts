import type { LightingMode, SceneTheme } from '../types/simulation';

export type EffectiveLighting = 'day' | 'golden' | 'night';

export interface HudStats {
  pounces: number;
  bonks: number;
  laserActive: boolean;
  splitPrism: boolean;
  paused: boolean;
  lightingMode: LightingMode;
  effectiveLighting?: EffectiveLighting;
  sceneTheme: SceneTheme;
  visible: boolean;
}

/**
 * Top HUD pill chips removed per user preference to keep the top of the screen
 * completely unobstructed. Preserves the HudOverlay interface for callers.
 */
export class HudOverlay {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = '';
    this.root.style.display = 'none';
    this.root.setAttribute('aria-hidden', 'true');
  }

  public setStats(_stats: HudStats): void {
    // Intentionally empty: top pill chips are disabled.
  }

  public destroy(): void {
    this.root.innerHTML = '';
  }
}
