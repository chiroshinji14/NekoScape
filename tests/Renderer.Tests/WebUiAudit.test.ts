import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAT_BREEDS, SCENE_THEMES, TOY_KINDS } from '@/types/simulation';

const rendererRoot = resolve(__dirname, '../../src/Renderer.Web');

function readRendererFile(relPath: string): string {
  return readFileSync(resolve(rendererRoot, relPath), 'utf8');
}

describe('Web UI & CSS Quality Audit (Zero Slop / Accessibility / Motion / No 12-Cat Cap)', () => {
  it('contains ZERO emoji characters across all UI, audio, photo, and HTML entry files', () => {
    const files = [
      'src/ui/ToyDock.ts',
      'src/ui/HudOverlay.ts',
      'src/ui/MockDesktopIcons.ts',
      'src/core/CatAudioEngine.ts',
      'src/core/PhotoCapture.ts',
      'index.html',
    ];
    const emojiRegex = /\p{Extended_Pictographic}/u;

    for (const file of files) {
      const content = readRendererFile(file);
      expect(emojiRegex.test(content), `Found forbidden emoji in ${file}`).toBe(false);
    }
  });

  it('contains ZERO transition: all in hud.css and tokens.css, and uses GPU-composited Emil Kowalski easing', () => {
    const hudCss = readRendererFile('src/styles/hud.css');
    const tokensCss = readRendererFile('src/styles/tokens.css');

    expect(/transition\s*:\s*[^;]*\ball\b/i.test(hudCss)).toBe(false);
    expect(/transition\s*:\s*[^;]*\ball\b/i.test(tokensCss)).toBe(false);
    expect(/transition-all/i.test(hudCss)).toBe(false);

    // Emil Kowalski easing curve & tactile micro-interaction rules
    expect(tokensCss).toContain('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(hudCss).toContain('scale(0.97)');
    expect(hudCss).toContain('scale(0.95)');
    expect(hudCss).toContain('transform-origin: bottom right');
    expect(hudCss).toContain('tabular-nums');
    expect(tokensCss).toContain('tabular-nums');
  });

  it('enforces prefers-reduced-motion, visible :focus-visible rings, and accessible aria-labels', () => {
    const hudCss = readRendererFile('src/styles/hud.css');
    const tokensCss = readRendererFile('src/styles/tokens.css');
    const toyDock = readRendererFile('src/ui/ToyDock.ts');
    const hudOverlay = readRendererFile('src/ui/HudOverlay.ts');
    const indexHtml = readRendererFile('index.html');

    expect(tokensCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(hudCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(tokensCss).toContain(':focus-visible');
    expect(/outline\s*:\s*none/i.test(hudCss)).toBe(false);
    expect(/outline\s*:\s*none/i.test(tokensCss)).toBe(false);

    // Never disable user zoom in index.html
    expect(/user-scalable\s*=\s*no/i.test(indexHtml)).toBe(false);
    expect(/maximum-scale\s*=\s*1(\.0)?\b/i.test(indexHtml)).toBe(false);

    // Explicit aria-label & Escape keyboard dismiss in ToyDock + non-blocking toast in HudOverlay
    expect(toyDock).toContain("setAttribute('aria-label'");
    expect(toyDock).toContain("setAttribute('aria-hidden', 'true')");
    expect(toyDock).toContain("e.key === 'Escape'");
    expect(toyDock).toContain('nativeHostConnected');
    expect(hudOverlay).toContain('showInteractionToast');
    expect(hudOverlay).toContain('triggerPhotoFlash');
    expect(hudOverlay).toContain('friendshipLevel');
    expect(hudCss).toContain('pointer-events: none');
  });

  it('enforces NO hardcoded 12-cat max limit in ToyDock.ts and exposes all 14 breeds, 13 scenes, toys, audio, and photo mode', () => {
    const toyDock = readRendererFile('src/ui/ToyDock.ts');

    // Unlimited cat count: no MAX_CAT_COUNT, no max="12", no Math.min(12, ...) clamping
    expect(/MAX_CAT_COUNT/i.test(toyDock)).toBe(false);
    expect(/Math\.min\s*\(\s*12\b/.test(toyDock)).toBe(false);
    expect(/max\s*=\s*['"]12['"]/.test(toyDock)).toBe(false);
    expect(toyDock).toContain('normalizeCatCount');
    expect(toyDock).toContain('MIN_CAT_COUNT');

    // All 14 breeds + all 13 scenes + all 11 toys + v2.0 controls
    for (const breed of CAT_BREEDS) {
      expect(toyDock).toContain(`'${breed}'`);
    }
    for (const scene of SCENE_THEMES) {
      expect(toyDock).toContain(`'${scene}'`);
    }
    for (const toy of TOY_KINDS) {
      expect(toyDock).toContain(`'${toy}'`);
    }

    expect(toyDock).toContain('onToggleKittenMode');
    expect(toyDock).toContain('onSelectCollarColor');
    expect(toyDock).toContain('onToggleCollarBell');
    expect(toyDock).toContain('onToggleSound');
    expect(toyDock).toContain('onTakePhoto');
    expect(toyDock).toContain('onClearToys');
  });
});
