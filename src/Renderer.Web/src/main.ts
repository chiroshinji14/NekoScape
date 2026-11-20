import './styles/hud.css';

import { Application, Container } from 'pixi.js';
import { PhysicsWorld } from './core/PhysicsWorld';
import { SurfaceManager } from './core/SurfaceManager';
import { CardboardBox } from './entities/CardboardBox';
import { CatEntity, type CatContext } from './entities/CatEntity';
import { ParticleSystem } from './entities/ParticleSystem';
import { PrismLaser } from './entities/PrismLaser';
import { YarnBall } from './entities/YarnBall';
import { HardwoodFloor } from './environment/HardwoodFloor';
import { IconMatsOverlay } from './environment/IconMatsOverlay';
import { LightingOverlay, type EffectiveLightingMode } from './environment/LightingOverlay';
import { RugOverlay } from './environment/RugOverlay';
import { ScenePropsOverlay } from './environment/ScenePropsOverlay';
import type { HostToRendererMessage, RendererToHostMessage } from './types/ipc';
import {
  CAT_BREEDS,
  DEFAULT_SETTINGS,
  RECYCLE_STARTLE_RADIUS,
  SCENE_THEMES,
  type AabbRect,
  type CatBreed,
  type CatStateName,
  type LightingMode,
  type NekoSettings,
  type SceneTheme,
  type Vec2,
} from './types/simulation';
import { DebugVisualizer } from './ui/DebugVisualizer';
import { HudOverlay } from './ui/HudOverlay';
import { MockDesktopIcons } from './ui/MockDesktopIcons';
import { ToyDock } from './ui/ToyDock';

interface WebView2Bridge {
  postMessage(message: RendererToHostMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

export interface NekoScapeDebugApi {
  getStateSummary: () => {
    pounces: number;
    bonks: number;
    activeCats: number;
    nappingCats: number;
    paused: boolean;
    laserActive: boolean;
    splitPrism: boolean;
    debugMode: boolean;
    lightingMode: LightingMode;
    effectiveLighting: EffectiveLightingMode;
    sceneTheme: SceneTheme;
    nativeHostConnected: boolean;
    fpsCap: number;
  };
  getCats: () => Array<{
    id: number;
    breed: CatBreed;
    state: CatStateName;
    x: number;
    y: number;
    vx: number;
    vy: number;
    zHeight: number;
    perchedIconId: number | null;
  }>;
  getObstacles: () => AabbRect[];
  isSplitPrism: () => boolean;
  getLighting: () => { mode: LightingMode; effective: EffectiveLightingMode };
}

declare global {
  interface Window {
    chrome?: {
      webview?: WebView2Bridge;
    };
    __NEKOSCAPE__?: NekoScapeDebugApi;
  }
}

interface PetCursorSample {
  x: number;
  y: number;
  timeSec: number;
}

class PettingDetector {
  private readonly samples: PetCursorSample[] = [];
  private readonly lastPetTimeByCat = new Map<number, number>();

  recordCursor(x: number, y: number, nowSec: number, cats: readonly CatEntity[], particles: ParticleSystem): void {
    const prev = this.samples[this.samples.length - 1];
    if (prev && Math.hypot(x - prev.x, y - prev.y) < 3) {
      return;
    }

    this.samples.push({ x, y, timeSec: nowSec });
    const cutoff = nowSec - 0.6;
    while (this.samples.length > 0 && this.samples[0].timeSec < cutoff) {
      this.samples.shift();
    }

    if (this.samples.length < 5) {
      return;
    }

    for (const cat of cats) {
      const catPos = cat.getPosition();
      const petRadius = cat.getRadius() + 14;
      if (Math.hypot(x - catPos.x, y - catPos.y) > petRadius) {
        continue;
      }

      const lastPet = this.lastPetTimeByCat.get(cat.id) ?? -Infinity;
      if (nowSec - lastPet < 0.45) {
        continue;
      }

      const flips = this.countOscillationsNear(catPos.x, catPos.y, petRadius + 10);
      if (flips >= 3) {
        this.lastPetTimeByCat.set(cat.id, nowSec);
        cat.triggerPet();
        particles.spawnPurr(catPos.x, catPos.y - 12);
      }
    }
  }

  private countOscillationsNear(cx: number, cy: number, radius: number): number {
    let prevDx = 0;
    let prevDy = 0;
    let flips = 0;

    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      if (Math.hypot(b.x - cx, b.y - cy) > radius) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 4) {
        continue;
      }
      const ux = dx / len;
      const uy = dy / len;

      if (prevDx !== 0 || prevDy !== 0) {
        const dot = ux * prevDx + uy * prevDy;
        if (dot < -0.25) {
          flips++;
        }
      }
      prevDx = ux;
      prevDy = uy;
    }

    return flips;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeSceneTheme(theme: unknown): SceneTheme {
  if (typeof theme === 'string') {
    const normalized = theme.trim().toLowerCase() as SceneTheme;
    if ((SCENE_THEMES as readonly string[]).includes(normalized)) {
      return normalized;
    }
  }
  return 'study';
}

function isCatCollisionExempt(state: CatStateName): boolean {
  return (
    state === 'IN_BOX' ||
    state === 'JUMP_TO_BOX' ||
    state === 'JUMP_OUT_BOX' ||
    state === 'JUMP_TO_ICON' ||
    state === 'PERCH_ICON'
  );
}

function parseHostMessage(raw: unknown): HostToRendererMessage | null {
  let candidate: unknown = raw;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || !('type' in candidate)) {
    return null;
  }
  return candidate as HostToRendererMessage;
}

async function bootstrap(): Promise<void> {
  const stageRoot = document.getElementById('stage-root');
  const mockIconsRoot = document.getElementById('mock-icons-root');
  const hudRoot = document.getElementById('hud-root');
  const dockRoot = document.getElementById('dock-root');

  if (!stageRoot || !mockIconsRoot || !hudRoot || !dockRoot) {
    throw new Error('NekoScape mount roots are missing from index.html.');
  }

  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    backgroundColor: 0x3b281c,
  });

  app.canvas.setAttribute('aria-label', 'NekoScape interactive desktop floor');
  stageRoot.appendChild(app.canvas);

  let viewWidth = Math.max(320, window.innerWidth);
  let viewHeight = Math.max(240, window.innerHeight);

  // Ordered scene layer hierarchy
  const floorLayer = new Container();
  const rugLayer = new Container();
  const iconMatsLayer = new Container();
  const scenePropsUnderLayer = new Container();
  const boxBaseLayer = new Container();
  const shadowsLayer = new Container();
  const propsLayer = new Container();
  const catsLayer = new Container();
  const boxFlapsLayer = new Container();
  const elevatedCatsLayer = new Container();
  const laserBeamsLayer = new Container();
  const particlesLayer = new Container();
  const scenePropsOverLayer = new Container();
  const lightingLayer = new Container();
  const debugOverlayLayer = new Container();

  app.stage.addChild(
    floorLayer,
    rugLayer,
    iconMatsLayer,
    scenePropsUnderLayer,
    boxBaseLayer,
    shadowsLayer,
    propsLayer,
    catsLayer,
    boxFlapsLayer,
    elevatedCatsLayer,
    laserBeamsLayer,
    particlesLayer,
    scenePropsOverLayer,
    lightingLayer,
    debugOverlayLayer,
  );

  // Core systems
  const settings: NekoSettings = { ...DEFAULT_SETTINGS };
  const surfaceManager = new SurfaceManager(viewWidth, viewHeight);
  const physics = new PhysicsWorld(viewWidth, viewHeight, surfaceManager);

  const initialRug = surfaceManager.getRugBounds();

  // Environment layers
  const hardwoodFloor = new HardwoodFloor(viewWidth, viewHeight, settings.sceneTheme);
  floorLayer.addChild(hardwoodFloor);

  const rugOverlay = new RugOverlay(surfaceManager, settings.sceneTheme);
  rugLayer.addChild(rugOverlay);

  const iconMatsOverlay = new IconMatsOverlay(viewWidth, viewHeight, settings.sceneTheme);
  iconMatsLayer.addChild(iconMatsOverlay);

  const scenePropsOverlay = new ScenePropsOverlay(
    viewWidth,
    viewHeight,
    initialRug,
    settings.sceneTheme,
  );
  scenePropsUnderLayer.addChild(scenePropsOverlay.underContainer);
  scenePropsOverLayer.addChild(scenePropsOverlay.overContainer);

  const lightingOverlay = new LightingOverlay(
    viewWidth,
    viewHeight,
    settings.lightingMode,
    settings.sceneTheme,
  );
  lightingLayer.addChild(lightingOverlay);

  let lastEffectiveLighting: EffectiveLightingMode = lightingOverlay.getEffectiveLighting();
  iconMatsOverlay.setLighting(lastEffectiveLighting);
  scenePropsOverlay.setNightMode(lastEffectiveLighting === 'night');

  // Particles & Props
  const particleSystem = new ParticleSystem(120);
  particlesLayer.addChild(particleSystem);

  const yarnBall = new YarnBall(
    Math.round(initialRug.x + initialRug.width * 0.25),
    Math.round(initialRug.y + initialRug.height * 0.65),
  );
  yarnBall.attachShadowTo(shadowsLayer);
  propsLayer.addChild(yarnBall);

  const prismLaser = new PrismLaser(
    viewWidth,
    viewHeight,
    Math.round(initialRug.x + initialRug.width * 0.58),
    Math.round(initialRug.y + initialRug.height * 0.54),
  );
  prismLaser.attachPrismTo(propsLayer);
  laserBeamsLayer.addChild(prismLaser);

  const cardboardBox = new CardboardBox(
    Math.round(initialRug.x + initialRug.width * 0.78),
    Math.round(initialRug.y + initialRug.height * 0.26),
  );
  cardboardBox.setTheme(settings.sceneTheme);
  boxBaseLayer.addChild(cardboardBox.baseContainer);
  boxFlapsLayer.addChild(cardboardBox.flapsContainer);

  const debugVisualizer = new DebugVisualizer();
  debugVisualizer.setEnabled(settings.debugMode);
  debugOverlayLayer.addChild(debugVisualizer.container);

  // Runtime state
  let pounces = 0;
  let bonks = 0;
  let paused = false;
  let nativeHostConnected = false;

  let altHeld = false;
  let localStickyLaser = false;
  let hostLaserActive = false;
  let hostSplitPrism = false;
  let lastHostLaserSyncMs = -Infinity;

  const cursorPos: Vec2 = { x: viewWidth * 0.5, y: viewHeight * 0.5 };
  let localLastActivityMs = performance.now();
  let lastLocalKeystrokeMs = -Infinity;
  let hostKeysPerMinute = 0;
  let hostIdleSeconds = 0;
  let lastHostTypingAtMs = -Infinity;

  let recycleBinItems = 2;
  let recycleBinBatTimer = 14;
  let nextPlayIconMode: 'perch' | 'scratch' = 'perch';
  let playIconCursor = 0;

  // UI Overlays (initialized early so perch tracking can reference mockIcons safely)
  const hud = new HudOverlay(hudRoot);
  let dock!: ToyDock;
  let mockIcons!: MockDesktopIcons;

  // Icon perch occupancy tracking
  const perchedIconByCat = new Map<number, number>();
  const occupiedIconIds = new Set<number>();

  function syncOccupiedIconIds(): void {
    occupiedIconIds.clear();
    for (const iconId of perchedIconByCat.values()) {
      occupiedIconIds.add(iconId);
    }
    mockIcons?.setPerchedIcons(occupiedIconIds);
  }

  function updateCatPerch(catId: number, iconId: number | null): void {
    const prev = perchedIconByCat.get(catId) ?? null;
    if (prev === iconId) {
      return;
    }
    if (iconId === null) {
      perchedIconByCat.delete(catId);
    } else {
      perchedIconByCat.set(catId, iconId);
    }
    syncOccupiedIconIds();
  }

  // Cat Pack management
  const cats: CatEntity[] = [];
  let nextCatId = 1;

  function computeCatSpawnPoint(index: number): Vec2 {
    const rug = surfaceManager.getRugBounds();
    const cx = rug.x + rug.width * 0.5;
    const cy = rug.y + rug.height * 0.5;
    const angle = index * 1.15 + 0.4;
    const rx = Math.min(rug.width * 0.34, 48 + (index % 4) * 32);
    const ry = Math.min(rug.height * 0.32, 36 + (index % 3) * 28);
    return {
      x: clamp(cx + Math.cos(angle) * rx, 32, viewWidth - 32),
      y: clamp(cy + Math.sin(angle) * ry, 32, viewHeight - 32),
    };
  }

  function syncCatCount(targetCount: number): void {
    const clamped = Math.max(1, Math.min(12, Math.round(targetCount)));
    settings.catCount = clamped;

    while (cats.length < clamped) {
      const idx = cats.length;
      const breed = CAT_BREEDS[idx % CAT_BREEDS.length];
      const spawn = computeCatSpawnPoint(idx);
      const cat = new CatEntity(nextCatId++, breed, spawn.x, spawn.y);
      cat.attachShadowTo(shadowsLayer);
      catsLayer.addChild(cat);
      cats.push(cat);
    }

    while (cats.length > clamped) {
      const removed = cats.pop();
      if (removed) {
        cardboardBox.release(removed.id);
        updateCatPerch(removed.id, null);
        removed.destroy();
      }
    }
  }

  syncCatCount(settings.catCount);

  // Coalesced IconMats SDF update: rAF fast pass during drag, crisp pass on settle
  let pendingMatsIcons: readonly AabbRect[] = [];
  let iconMatsRafId: number | null = null;

  function scheduleIconMatsUpdate(rects: readonly AabbRect[], isDragging: boolean): void {
    pendingMatsIcons = rects;
    if (!isDragging) {
      if (iconMatsRafId !== null) {
        window.cancelAnimationFrame(iconMatsRafId);
        iconMatsRafId = null;
      }
      iconMatsOverlay.setIcons(rects, { fast: false });
      return;
    }

    if (iconMatsRafId === null) {
      iconMatsRafId = window.requestAnimationFrame(() => {
        iconMatsRafId = null;
        iconMatsOverlay.setIcons(pendingMatsIcons, { fast: true });
      });
    }
  }

  function isLaserCurrentlyActive(): boolean {
    return (
      localStickyLaser ||
      hostLaserActive ||
      (settings.enableLaserHotkey && altHeld)
    );
  }

  function refreshUiOverlays(): void {
    const effective = lightingOverlay.getEffectiveLighting();
    const laserActive = isLaserCurrentlyActive();
    const splitPrism = prismLaser.isSplitActive();

    hud.setStats({
      pounces,
      bonks,
      laserActive,
      splitPrism,
      paused,
      lightingMode: settings.lightingMode,
      effectiveLighting: effective,
      sceneTheme: settings.sceneTheme,
      visible: settings.showHud,
    });

    dock.setState({
      sceneTheme: settings.sceneTheme,
      lightingMode: settings.lightingMode,
      laserActive,
      boxVisible: cardboardBox.isVisible(),
      catCount: settings.catCount,
      hudVisible: settings.showHud,
      debugMode: settings.debugMode,
      visible: settings.showToyDock,
      nativeHostConnected,
      fpsCap: settings.fpsCap,
      idleNapMinutes: settings.idleNapMinutes,
      enableLaserHotkey: settings.enableLaserHotkey,
      enableShellReactions: settings.enableShellReactions,
    });
  }

  function startleCatsNear(origin: Vec2): void {
    particleSystem.spawnDustPuff(origin.x, origin.y, 0, -40);
    for (const cat of cats) {
      const pos = cat.getPosition();
      if (Math.hypot(pos.x - origin.x, pos.y - origin.y) <= RECYCLE_STARTLE_RADIUS) {
        cat.triggerStartle(origin);
      }
    }
  }

  function investigatePoint(point: Vec2): void {
    let triggered = 0;
    const sorted = [...cats].sort((a, b) => {
      const pa = a.getPosition();
      const pb = b.getPosition();
      return Math.hypot(pa.x - point.x, pa.y - point.y) - Math.hypot(pb.x - point.x, pb.y - point.y);
    });

    for (const cat of sorted) {
      const state = cat.getState();
      if (state === 'IDLE' || state === 'WANDER' || triggered === 0) {
        cat.triggerInvestigate(point);
        triggered++;
        if (triggered >= 3) {
          break;
        }
      }
    }
  }

  function setSceneTheme(theme: SceneTheme): void {
    const nextTheme = normalizeSceneTheme(theme);
    settings.sceneTheme = nextTheme;
    hardwoodFloor.setTheme(nextTheme);
    rugOverlay.setTheme(nextTheme);
    iconMatsOverlay.setTheme(nextTheme);
    scenePropsOverlay.setTheme(nextTheme);
    cardboardBox.setTheme(nextTheme);
    lightingOverlay.setTheme(nextTheme);
    refreshUiOverlays();
  }

  function setLightingMode(mode: LightingMode): void {
    settings.lightingMode = mode;
    lightingOverlay.setMode(mode);
    const effective = lightingOverlay.getEffectiveLighting();
    if (effective !== lastEffectiveLighting) {
      lastEffectiveLighting = effective;
      iconMatsOverlay.setLighting(effective);
      scenePropsOverlay.setNightMode(effective === 'night');
    }
    refreshUiOverlays();
  }

  function setDebugMode(enabled: boolean): void {
    settings.debugMode = enabled;
    debugVisualizer.setEnabled(enabled);
    refreshUiOverlays();
  }

  function toggleStickyLaser(): void {
    localStickyLaser = !localStickyLaser;
    if (!localStickyLaser) {
      hostLaserActive = false;
      altHeld = false;
    }
    prismLaser.setCursor(cursorPos.x, cursorPos.y, isLaserCurrentlyActive(), hostSplitPrism);
    refreshUiOverlays();
  }

  function toggleCardboardBox(): void {
    const visible = cardboardBox.toggleVisible();
    if (!visible && cardboardBox.occupantId !== null) {
      cardboardBox.release(cardboardBox.occupantId);
    }
    refreshUiOverlays();
  }

  function centerPrismProp(): void {
    const rug = surfaceManager.getRugBounds();
    const targetX = Math.round(rug.x + rug.width * 0.5);
    const targetY = Math.round(rug.y + rug.height * 0.5);
    const current = prismLaser.getPrismPosition();

    if (Math.hypot(current.x - targetX, current.y - targetY) < 10) {
      prismLaser.setPrismPosition(
        Math.round(rug.x + rug.width * 0.62),
        Math.round(rug.y + rug.height * 0.42),
      );
    } else {
      prismLaser.setPrismPosition(targetX, targetY);
    }
  }

  function tossYarnAcrossFloor(): void {
    const pos = yarnBall.getPosition();
    const rug = surfaceManager.getRugBounds();
    const cx = rug.x + rug.width * 0.5;
    const cy = rug.y + rug.height * 0.5;
    const baseAngle = Math.atan2(cy - pos.y, cx - pos.x) + (Math.random() - 0.5) * 1.1;
    const speed = 360 + Math.random() * 140;
    yarnBall.toss(Math.cos(baseAngle) * speed, Math.sin(baseAngle) * speed);
    particleSystem.spawnDustPuff(pos.x, pos.y, -Math.cos(baseAngle) * 30, -Math.sin(baseAngle) * 30);
  }

  function triggerPlayWithIconAction(): void {
    const obstacles = physics.getObstacles();
    if (obstacles.length === 0 || cats.length === 0) {
      return;
    }

    const mode = nextPlayIconMode;
    nextPlayIconMode = mode === 'perch' ? 'scratch' : 'perch';

    const cat =
      cats.find((c) => c.getState() === 'IDLE' || c.getState() === 'WANDER') ??
      cats.find((c) => c.getState() !== 'PERCH_ICON' && c.getState() !== 'SCRATCH_ICON') ??
      cats[0];

    const available =
      mode === 'perch'
        ? obstacles.filter((obs) => !occupiedIconIds.has(obs.id))
        : obstacles;
    const pool = available.length > 0 ? available : obstacles;

    const catPos = cat.getPosition();
    const sorted = [...pool].sort((a, b) => {
      const da = Math.hypot(a.x + a.width * 0.5 - catPos.x, a.y + a.height * 0.5 - catPos.y);
      const db = Math.hypot(b.x + b.width * 0.5 - catPos.x, b.y + b.height * 0.5 - catPos.y);
      return da - db;
    });

    const pickCount = Math.min(3, sorted.length);
    const chosen = sorted[playIconCursor % pickCount];
    playIconCursor++;

    cat.triggerPlayWithIcon(chosen, mode);
  }

  dock = new ToyDock(
    dockRoot,
    {
      onSelectScene: setSceneTheme,
      onSelectLighting: setLightingMode,
      onToggleLaser: toggleStickyLaser,
      onTossYarn: tossYarnAcrossFloor,
      onCenterPrism: centerPrismProp,
      onToggleBox: toggleCardboardBox,
      onChangeCatCount: (nextCount) => {
        syncCatCount(nextCount);
        refreshUiOverlays();
      },
      onToggleHud: () => {
        settings.showHud = !settings.showHud;
        refreshUiOverlays();
      },
      onToggleDebug: () => {
        setDebugMode(!settings.debugMode);
      },
      onNewFile: () => {
        const created = mockIcons.addTempFile();
        investigatePoint({
          x: created.x + created.width * 0.5,
          y: created.y + created.height * 0.5,
        });
      },
      onTidyIcons: () => {
        mockIcons.tidyIcons(true);
      },
      onEmptyBin: () => {
        recycleBinItems = 0;
        const bin = mockIcons.pulseRecycleBin();
        if (bin) {
          startleCatsNear({
            x: bin.x + bin.width * 0.5,
            y: bin.y + bin.height * 0.5,
          });
        }
      },
      onPlayWithIcon: triggerPlayWithIconAction,
      onChangeFpsCap: (nextFps) => {
        settings.fpsCap = nextFps;
        frameAccumulator = 0;
        refreshUiOverlays();
      },
      onChangeIdleNapMinutes: (nextMinutes) => {
        settings.idleNapMinutes = Math.max(1, Math.min(60, Math.round(nextMinutes)));
        refreshUiOverlays();
      },
      onToggleLaserHotkey: () => {
        settings.enableLaserHotkey = !settings.enableLaserHotkey;
        if (!settings.enableLaserHotkey) {
          altHeld = false;
        }
        refreshUiOverlays();
      },
      onToggleShellReactions: () => {
        settings.enableShellReactions = !settings.enableShellReactions;
        refreshUiOverlays();
      },
    },
    {
      sceneTheme: settings.sceneTheme,
      lightingMode: settings.lightingMode,
      laserActive: false,
      boxVisible: cardboardBox.isVisible(),
      catCount: settings.catCount,
      hudVisible: settings.showHud,
      debugMode: settings.debugMode,
      visible: settings.showToyDock,
      nativeHostConnected: false,
      fpsCap: settings.fpsCap,
      idleNapMinutes: settings.idleNapMinutes,
      enableLaserHotkey: settings.enableLaserHotkey,
      enableShellReactions: settings.enableShellReactions,
    },
  );

  mockIcons = new MockDesktopIcons(mockIconsRoot, viewWidth, viewHeight, {
    onIconsChange: (rects, isDragging) => {
      if (nativeHostConnected) {
        return;
      }
      physics.setObstacles(rects);
      scheduleIconMatsUpdate(rects, isDragging);
    },
    onFirstInteract: () => {
      dock.dismissHint();
    },
  });

  // Initialize standalone obstacles + crisp floor mats immediately
  const initialIcons = mockIcons.getIcons();
  physics.setObstacles(initialIcons);
  scheduleIconMatsUpdate(initialIcons, false);
  refreshUiOverlays();

  // Petting detector + stage prop dragging
  const pettingDetector = new PettingDetector();

  type DragPropKind = 'prism' | 'yarn' | 'box';
  let activeStageDrag: {
    kind: DragPropKind;
    pointerId: number;
    grabOffsetX: number;
    grabOffsetY: number;
    lastX: number;
    lastY: number;
    lastTimeMs: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null = null;

  stageRoot.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    localLastActivityMs = performance.now();
    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;
    dock.dismissHint();

    let kind: DragPropKind | null = null;
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    if (prismLaser.containsPrismPoint(e.clientX, e.clientY)) {
      kind = 'prism';
      const pp = prismLaser.getPrismPosition();
      grabOffsetX = e.clientX - pp.x;
      grabOffsetY = e.clientY - pp.y;
    } else if (yarnBall.containsPoint(e.clientX, e.clientY)) {
      kind = 'yarn';
      const yp = yarnBall.getPosition();
      grabOffsetX = e.clientX - yp.x;
      grabOffsetY = e.clientY - yp.y;
      yarnBall.toss(0, 0);
    } else if (cardboardBox.isVisible() && cardboardBox.containsPoint(e.clientX, e.clientY)) {
      kind = 'box';
      const bp = cardboardBox.getPosition();
      grabOffsetX = e.clientX - bp.x;
      grabOffsetY = e.clientY - bp.y;
    }

    if (kind) {
      stageRoot.setPointerCapture(e.pointerId);
      activeStageDrag = {
        kind,
        pointerId: e.pointerId,
        grabOffsetX,
        grabOffsetY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastTimeMs: performance.now(),
        vx: 0,
        vy: 0,
        moved: false,
      };
    }
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    const nowMs = performance.now();
    localLastActivityMs = nowMs;
    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;

    if (activeStageDrag && activeStageDrag.pointerId === e.pointerId) {
      const dtSec = Math.max(0.004, (nowMs - activeStageDrag.lastTimeMs) / 1000);
      const instVx = (e.clientX - activeStageDrag.lastX) / dtSec;
      const instVy = (e.clientY - activeStageDrag.lastY) / dtSec;
      activeStageDrag.vx = activeStageDrag.vx * 0.55 + instVx * 0.45;
      activeStageDrag.vy = activeStageDrag.vy * 0.55 + instVy * 0.45;
      if (Math.hypot(e.clientX - activeStageDrag.lastX, e.clientY - activeStageDrag.lastY) > 2) {
        activeStageDrag.moved = true;
      }
      activeStageDrag.lastX = e.clientX;
      activeStageDrag.lastY = e.clientY;
      activeStageDrag.lastTimeMs = nowMs;

      const targetX = e.clientX - activeStageDrag.grabOffsetX;
      const targetY = e.clientY - activeStageDrag.grabOffsetY;

      if (activeStageDrag.kind === 'prism') {
        prismLaser.setPrismPosition(targetX, targetY);
      } else if (activeStageDrag.kind === 'yarn') {
        yarnBall.reset(
          clamp(targetX, 24, viewWidth - 24),
          clamp(targetY, 24, viewHeight - 24),
        );
      } else if (activeStageDrag.kind === 'box') {
        cardboardBox.setPosition(
          clamp(targetX, 56, viewWidth - 56),
          clamp(targetY, 56, viewHeight - 56),
        );
      }
      return;
    }

    pettingDetector.recordCursor(e.clientX, e.clientY, nowMs / 1000, cats, particleSystem);
  });

  const endStageDrag = (e: PointerEvent): void => {
    if (!activeStageDrag || activeStageDrag.pointerId !== e.pointerId) {
      return;
    }
    if (stageRoot.hasPointerCapture(e.pointerId)) {
      stageRoot.releasePointerCapture(e.pointerId);
    }
    if (activeStageDrag.kind === 'yarn') {
      if (activeStageDrag.moved && Math.hypot(activeStageDrag.vx, activeStageDrag.vy) > 40) {
        yarnBall.toss(
          clamp(activeStageDrag.vx, -900, 900),
          clamp(activeStageDrag.vy, -900, 900),
        );
      } else {
        tossYarnAcrossFloor();
      }
    }
    activeStageDrag = null;
  };

  stageRoot.addEventListener('pointerup', endStageDrag);
  stageRoot.addEventListener('pointercancel', endStageDrag);

  // Keyboard shortcuts & typing vibe tracking
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const nowMs = performance.now();
    localLastActivityMs = nowMs;

    const target = e.target as HTMLElement | null;
    const isTextInput =
      target !== null &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (e.key === 'Alt' && settings.enableLaserHotkey) {
      altHeld = true;
      dock.dismissHint();
      refreshUiOverlays();
      return;
    }

    if (e.ctrlKey && e.altKey && (e.key === 'l' || e.key === 'L' || e.code === 'KeyL')) {
      if (!e.repeat && settings.enableLaserHotkey) {
        e.preventDefault();
        dock.dismissHint();
        toggleStickyLaser();
      }
      return;
    }

    if (!isTextInput && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat) {
      if (e.key === 'd' || e.key === 'D' || e.code === 'KeyD') {
        dock.dismissHint();
        setDebugMode(!settings.debugMode);
        return;
      }
    }

    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key !== 'Shift') {
      lastLocalKeystrokeMs = nowMs;
    }
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      altHeld = false;
      refreshUiOverlays();
    }
  });

  window.addEventListener('blur', () => {
    if (altHeld) {
      altHeld = false;
      refreshUiOverlays();
    }
  });

  // Resize handler
  window.addEventListener('resize', () => {
    viewWidth = Math.max(320, window.innerWidth);
    viewHeight = Math.max(240, window.innerHeight);

    surfaceManager.resize(viewWidth, viewHeight);
    physics.setBounds(viewWidth, viewHeight);
    hardwoodFloor.resize(viewWidth, viewHeight);
    rugOverlay.syncToSurface();
    iconMatsOverlay.resize(viewWidth, viewHeight);
    scenePropsOverlay.resize(viewWidth, viewHeight, surfaceManager.getRugBounds());
    lightingOverlay.resize(viewWidth, viewHeight);
    prismLaser.resize(viewWidth, viewHeight);
    mockIcons.resize(viewWidth, viewHeight);

    const yp = yarnBall.getPosition();
    yarnBall.reset(clamp(yp.x, 24, viewWidth - 24), clamp(yp.y, 24, viewHeight - 24));
    const bp = cardboardBox.getPosition();
    cardboardBox.setPosition(clamp(bp.x, 56, viewWidth - 56), clamp(bp.y, 56, viewHeight - 56));
  });

  // Win32 WebView2 IPC Bridge
  const webview = window.chrome?.webview;

  function postToHost(msg: RendererToHostMessage): void {
    webview?.postMessage(msg);
  }

  function applySettingsUpdate(next: NekoSettings): void {
    const prevCatCount = settings.catCount;
    const prevLighting = settings.lightingMode;
    const prevSceneTheme = settings.sceneTheme;
    const prevDebug = settings.debugMode;

    Object.assign(settings, next);
    settings.sceneTheme = normalizeSceneTheme(next.sceneTheme);

    if (settings.catCount !== prevCatCount) {
      syncCatCount(settings.catCount);
    }
    if (settings.sceneTheme !== prevSceneTheme) {
      hardwoodFloor.setTheme(settings.sceneTheme);
      rugOverlay.setTheme(settings.sceneTheme);
      iconMatsOverlay.setTheme(settings.sceneTheme);
      scenePropsOverlay.setTheme(settings.sceneTheme);
      cardboardBox.setTheme(settings.sceneTheme);
      lightingOverlay.setTheme(settings.sceneTheme);
    }
    if (settings.lightingMode !== prevLighting) {
      lightingOverlay.setMode(settings.lightingMode);
      const effective = lightingOverlay.getEffectiveLighting();
      if (effective !== lastEffectiveLighting) {
        lastEffectiveLighting = effective;
        iconMatsOverlay.setLighting(effective);
        scenePropsOverlay.setNightMode(effective === 'night');
      }
    }
    if (settings.debugMode !== prevDebug) {
      debugVisualizer.setEnabled(settings.debugMode);
    }
    if (!settings.enableLaserHotkey) {
      altHeld = false;
    }

    refreshUiOverlays();
  }

  function setPausedState(nextPaused: boolean): void {
    if (paused === nextPaused) {
      return;
    }
    paused = nextPaused;
    if (paused) {
      app.ticker.stop();
    } else {
      frameAccumulator = 0;
      app.ticker.start();
    }
    refreshUiOverlays();
    sendStatsUpdate();
  }

  function findRecycleBinCenter(): Vec2 | null {
    const bin = physics.getObstacles().find((obs) => obs.isRecycleBin);
    if (!bin) {
      return null;
    }
    return { x: bin.x + bin.width * 0.5, y: bin.y + bin.height * 0.5 };
  }

  let latestHostIcons: AabbRect[] = [];
  let nativeIconDrag: {
    iconId: number;
    label: string;
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    dragging: boolean;
  } | null = null;
  let wasHostLeftDown = false;

  function buildHostIconsWithLiveDrag(dragX: number, dragY: number): AabbRect[] {
    if (!nativeIconDrag) {
      return latestHostIcons;
    }
    return latestHostIcons.map((icon) => {
      const matches =
        (nativeIconDrag!.label.length > 0 && icon.label === nativeIconDrag!.label) ||
        icon.id === nativeIconDrag!.iconId;
      if (!matches) {
        return icon;
      }
      return {
        ...icon,
        x: clamp(Math.round(dragX - nativeIconDrag!.grabOffsetX), 4, viewWidth - icon.width - 4),
        y: clamp(Math.round(dragY - nativeIconDrag!.grabOffsetY), 4, viewHeight - icon.height - 4),
      };
    });
  }

  function handleHostMessage(msg: HostToRendererMessage): void {
    switch (msg.type) {
      case 'ICON_UPDATE': {
        if (!nativeHostConnected) {
          nativeHostConnected = true;
          mockIcons.hideForNativeMode();
          refreshUiOverlays();
        }
        latestHostIcons = msg.icons.map((icon) => ({ ...icon }));
        if (nativeIconDrag && nativeIconDrag.dragging) {
          const live = buildHostIconsWithLiveDrag(cursorPos.x, cursorPos.y);
          physics.setObstacles(live);
          scheduleIconMatsUpdate(live, true);
        } else {
          physics.setObstacles(latestHostIcons);
          scheduleIconMatsUpdate(latestHostIcons, false);
        }
        break;
      }

      case 'MOUSE_RAW': {
        cursorPos.x = msg.x;
        cursorPos.y = msg.y;
        const leftDown = msg.buttons?.left === true;

        if (nativeHostConnected && latestHostIcons.length > 0) {
          if (leftDown && !wasHostLeftDown) {
            const hit = latestHostIcons.find(
              (icon) =>
                msg.x >= icon.x - 6 &&
                msg.x <= icon.x + icon.width + 6 &&
                msg.y >= icon.y - 6 &&
                msg.y <= icon.y + icon.height + 6,
            );
            if (hit) {
              nativeIconDrag = {
                iconId: hit.id,
                label: hit.label ?? '',
                startX: msg.x,
                startY: msg.y,
                grabOffsetX: msg.x - hit.x,
                grabOffsetY: msg.y - hit.y,
                dragging: false,
              };
            } else {
              nativeIconDrag = null;
            }
          } else if (leftDown && nativeIconDrag) {
            if (
              !nativeIconDrag.dragging &&
              Math.hypot(msg.x - nativeIconDrag.startX, msg.y - nativeIconDrag.startY) > 6
            ) {
              nativeIconDrag.dragging = true;
            }
            if (nativeIconDrag.dragging) {
              const live = buildHostIconsWithLiveDrag(msg.x, msg.y);
              physics.setObstacles(live);
              scheduleIconMatsUpdate(live, true);
            }
          } else if (!leftDown && wasHostLeftDown) {
            if (nativeIconDrag && nativeIconDrag.dragging) {
              const droppedIcons = buildHostIconsWithLiveDrag(msg.x, msg.y);
              latestHostIcons = droppedIcons;
              nativeIconDrag = null;
              physics.setObstacles(droppedIcons);
              scheduleIconMatsUpdate(droppedIcons, false);
              postToHost({ type: 'REQUEST_ICON_RESCAN' });
            } else {
              nativeIconDrag = null;
            }
          }
        }
        wasHostLeftDown = leftDown;

        if (hostLaserActive !== msg.laserMode) {
          lastHostLaserSyncMs = performance.now();
        }
        hostLaserActive = msg.laserMode;
        hostSplitPrism = msg.splitPrism;
        pettingDetector.recordCursor(msg.x, msg.y, performance.now() / 1000, cats, particleSystem);
        refreshUiOverlays();
        break;
      }

      case 'NEW_FILE_EVENT': {
        if (!settings.enableShellReactions) {
          break;
        }
        const target = msg.icon
          ? { x: msg.icon.x + msg.icon.width * 0.5, y: msg.icon.y + msg.icon.height * 0.5 }
          : { x: 84, y: 120 };
        investigatePoint(target);
        break;
      }

      case 'RECYCLE_BIN_EVENT': {
        recycleBinItems = msg.itemCount;
        if (msg.emptied && settings.enableShellReactions) {
          const origin = msg.binRect
            ? {
                x: msg.binRect.x + msg.binRect.width * 0.5,
                y: msg.binRect.y + msg.binRect.height * 0.5,
              }
            : findRecycleBinCenter();
          if (origin) {
            startleCatsNear(origin);
          }
        }
        break;
      }

      case 'TYPING_ACTIVITY': {
        hostKeysPerMinute = msg.keysPerMinute;
        hostIdleSeconds = msg.idleSeconds;
        lastHostTypingAtMs = performance.now();
        break;
      }

      case 'SETTINGS_UPDATE': {
        applySettingsUpdate(msg.settings);
        break;
      }

      case 'POWER_STATE': {
        setPausedState(msg.paused);
        break;
      }

      case 'SPAWN_ACTION': {
        switch (msg.action) {
          case 'resetYarn': {
            const rug = surfaceManager.getRugBounds();
            yarnBall.reset(
              Math.round(rug.x + rug.width * 0.25),
              Math.round(rug.y + rug.height * 0.65),
            );
            yarnBall.toss(240, -150);
            break;
          }
          case 'toggleLaser': {
            if (!nativeHostConnected || performance.now() - lastHostLaserSyncMs > 120) {
              toggleStickyLaser();
            }
            break;
          }
          case 'rescanIcons': {
            if (nativeHostConnected) {
              postToHost({ type: 'REQUEST_ICON_RESCAN' });
            } else {
              mockIcons.tidyIcons(true);
            }
            break;
          }
          case 'toggleBox': {
            toggleCardboardBox();
            break;
          }
        }
        break;
      }
    }
  }

  if (webview) {
    webview.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = parseHostMessage(event.data);
      if (parsed) {
        handleHostMessage(parsed);
      }
    });
    postToHost({ type: 'READY', rendererVersion: '0.1.0' });
  }

  function sendStatsUpdate(): void {
    let nappingCats = 0;
    for (const cat of cats) {
      if (cat.getState() === 'NAP') {
        nappingCats++;
      }
    }
    postToHost({
      type: 'STATS_UPDATE',
      pounces,
      bonks,
      activeCats: cats.length - nappingCats,
      nappingCats,
      paused,
    });
  }

  // Main simulation tick with FPS cap accumulator
  let frameAccumulator = 0;
  let statsAccum = 0;
  let sceneCuriosityTimer = 9;
  let sceneCuriosityCursor = 0;
  let lastHudLaserActive = false;
  let lastHudSplitPrism = false;

  app.ticker.add((ticker) => {
    const rawDt = Math.min(ticker.deltaMS / 1000, 0.05);
    if (paused) {
      return;
    }

    let stepDt = rawDt;
    if (settings.fpsCap > 0) {
      const frameInterval = 1 / settings.fpsCap;
      frameAccumulator += rawDt;
      if (frameAccumulator < frameInterval - 0.002) {
        return;
      }
      stepDt = Math.min(frameAccumulator, 0.05);
      frameAccumulator = 0;
    }

    const nowMs = performance.now();

    // Update lighting atmosphere & sync icon mats if auto mode shifts period
    lightingOverlay.update(stepDt);
    const effectiveLighting = lightingOverlay.getEffectiveLighting();
    if (effectiveLighting !== lastEffectiveLighting) {
      lastEffectiveLighting = effectiveLighting;
      iconMatsOverlay.setLighting(effectiveLighting);
      scenePropsOverlay.setNightMode(effectiveLighting === 'night');
      refreshUiOverlays();
    }

    // Update ambient scene props (koi fish, butterflies, steam wisps, sakura petals, feather toy)
    scenePropsOverlay.update(stepDt);

    // Smoothly animate desktop icon mat transitions & drop fade-ins
    iconMatsOverlay.update(stepDt);

    // Update laser & split-prism state
    const laserActive = isLaserCurrentlyActive();
    prismLaser.setCursor(cursorPos.x, cursorPos.y, laserActive, hostSplitPrism);
    prismLaser.update(stepDt);

    const splitActive = prismLaser.isSplitActive();
    if (laserActive !== lastHudLaserActive || splitActive !== lastHudSplitPrism) {
      lastHudLaserActive = laserActive;
      lastHudSplitPrism = splitActive;
      refreshUiOverlays();
    }

    // Compute typing & idle state (merging Win32 OS metrics with local input)
    const localIdleSec = (nowMs - localLastActivityMs) / 1000;
    const hostTypingFresh = nowMs - lastHostTypingAtMs < 3000;
    const idleSeconds = hostTypingFresh
      ? Math.min(localIdleSec, hostIdleSeconds)
      : localIdleSec;
    const typingActive =
      nowMs - lastLocalKeystrokeMs < 2500 || (hostTypingFresh && hostKeysPerMinute > 0);
    const idleNapSeconds = Math.max(15, settings.idleNapMinutes * 60);

    // Occasional curiosity toward non-empty Recycle Bin
    if (settings.enableShellReactions && recycleBinItems > 0 && !laserActive) {
      recycleBinBatTimer -= stepDt;
      if (recycleBinBatTimer <= 0) {
        recycleBinBatTimer = 18 + Math.random() * 10;
        const binCenter = findRecycleBinCenter();
        if (binCenter) {
          const idleCat = cats.find((c) => c.getState() === 'IDLE');
          idleCat?.triggerInvestigate(binCenter);
        }
      }
    }

    // Periodic curiosity toward scene-specific props (koi pond, bonsai, bistro table, cat beds, bowls)
    if (!laserActive) {
      sceneCuriosityTimer -= stepDt;
      if (sceneCuriosityTimer <= 0) {
        sceneCuriosityTimer = 11 + Math.random() * 8;
        const spots = scenePropsOverlay.getCuriositySpots();
        if (spots.length > 0 && cats.length > 0) {
          const spot = spots[sceneCuriosityCursor % spots.length];
          sceneCuriosityCursor++;
          const candidate =
            cats.find((c) => c.getState() === 'IDLE' || c.getState() === 'WANDER') ?? null;
          candidate?.triggerInvestigate({ x: spot.x, y: spot.y });
        }
      }
    }

    // Update yarn ball physics unless actively dragged
    if (!activeStageDrag || activeStageDrag.kind !== 'yarn') {
      yarnBall.update(stepDt, physics, particleSystem);
    }

    // Update all cats
    const catCtx: CatContext = {
      physics,
      surfaceManager,
      laserTargets: prismLaser.getActiveTargets(),
      yarnBall,
      cardboardBox,
      sceneObstacles: scenePropsOverlay.getObstacles(),
      particles: particleSystem,
      idleSeconds,
      idleNapSeconds,
      typingActive,
      nightMode: effectiveLighting === 'night',
      occupiedIconIds,
      onPounce: () => {
        pounces++;
        refreshUiOverlays();
      },
      onBonk: () => {
        bonks++;
        refreshUiOverlays();
      },
      onIconScratch: (iconId) => {
        mockIcons.triggerScratchShake(iconId);
      },
      onIconPerchChange: (catId, iconId) => {
        updateCatPerch(catId, iconId);
      },
    };

    for (const cat of cats) {
      cat.update(stepDt, catCtx);
      const targetLayer = cat.isElevated() ? elevatedCatsLayer : catsLayer;
      if (cat.parent !== targetLayer) {
        targetLayer.addChild(cat);
      }
    }

    // Pairwise cat-cat collision separation (skip airborne, box, and icon-perched cats)
    for (let i = 0; i < cats.length; i++) {
      const catA = cats[i];
      const stateA = catA.getState();
      if (isCatCollisionExempt(stateA)) continue;
      for (let j = i + 1; j < cats.length; j++) {
        const catB = cats[j];
        const stateB = catB.getState();
        if (isCatCollisionExempt(stateB)) continue;
        if (stateA === 'NAP' && stateB === 'NAP') continue;
        physics.resolveCircleCircle(catA.getBody(), catB.getBody(), 0.45);
      }
    }

    // Update particles
    particleSystem.update(stepDt);

    // Update Debug overlay when enabled
    if (debugVisualizer.isEnabled()) {
      const boxBounds = cardboardBox.getBounds();
      const yarnPos = yarnBall.getPosition();
      const yarnVel = yarnBall.getVelocity();
      const prismPos = prismLaser.getPrismPosition();

      debugVisualizer.update({
        icons: physics.getObstacles(),
        rug: surfaceManager.getRugBounds(),
        cats: cats.map((cat) => {
          const pos = cat.getPosition();
          const vel = cat.getVelocity();
          return {
            id: cat.id,
            x: pos.x,
            y: pos.y,
            vx: vel.x,
            vy: vel.y,
            radius: cat.getRadius(),
            state: cat.getState(),
            breed: cat.getBreed(),
            zHeight: cat.getZHeight(),
            perchedIconId: cat.getPerchedIconId(),
          };
        }),
        prism: {
          x: prismPos.x,
          y: prismPos.y,
          radius: prismLaser.getPrismRadius(),
          splitActive,
        },
        yarn: {
          x: yarnPos.x,
          y: yarnPos.y,
          vx: yarnVel.x,
          vy: yarnVel.y,
          radius: yarnBall.getRadius(),
        },
        box: {
          x: boxBounds.x,
          y: boxBounds.y,
          width: boxBounds.width,
          height: boxBounds.height,
          visible: cardboardBox.isVisible(),
          occupantId: cardboardBox.occupantId,
          exterior: cardboardBox.getExteriorObstacle(),
        },
      });
    }

    // Emit STATS_UPDATE to Win32 host at ~2Hz
    statsAccum += stepDt;
    if (statsAccum >= 0.5) {
      statsAccum = 0;
      sendStatsUpdate();
    }
  });

  // Read-only debug accessor on window.__NEKOSCAPE__
  const debugApi: NekoScapeDebugApi = Object.freeze({
    getStateSummary: () => {
      let nappingCats = 0;
      for (const cat of cats) {
        if (cat.getState() === 'NAP') {
          nappingCats++;
        }
      }
      return {
        pounces,
        bonks,
        activeCats: cats.length - nappingCats,
        nappingCats,
        paused,
        laserActive: isLaserCurrentlyActive(),
        splitPrism: prismLaser.isSplitActive(),
        debugMode: settings.debugMode,
        lightingMode: settings.lightingMode,
        effectiveLighting: lightingOverlay.getEffectiveLighting(),
        sceneTheme: settings.sceneTheme,
        nativeHostConnected,
        fpsCap: settings.fpsCap,
      };
    },
    getCats: () =>
      cats.map((cat) => {
        const pos = cat.getPosition();
        const vel = cat.getVelocity();
        return {
          id: cat.id,
          breed: cat.getBreed(),
          state: cat.getState(),
          x: pos.x,
          y: pos.y,
          vx: vel.x,
          vy: vel.y,
          zHeight: cat.getZHeight(),
          perchedIconId: cat.getPerchedIconId(),
        };
      }),
    getObstacles: () => physics.getObstacles().map((obs) => ({ ...obs })),
    isSplitPrism: () => prismLaser.isSplitActive(),
    getLighting: () => ({
      mode: settings.lightingMode,
      effective: lightingOverlay.getEffectiveLighting(),
    }),
  });

  Object.defineProperty(window, '__NEKOSCAPE__', {
    value: debugApi,
    writable: false,
    configurable: false,
    enumerable: true,
  });
}

void bootstrap();
