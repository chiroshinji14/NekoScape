import './styles/hud.css';

import { Application, Container } from 'pixi.js';
import { PhysicsWorld } from './core/PhysicsWorld';
import { SurfaceManager } from './core/SurfaceManager';
import { CardboardBox } from './entities/CardboardBox';
import { pickDiverseBreedOrder } from './entities/CatBreeds';
import {
  CatEntity,
  hitTestCat,
  onCatClicked,
  type CatContext,
} from './entities/CatEntity';
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
  DEFAULT_SETTINGS,
  RECYCLE_STARTLE_RADIUS,
  SCENE_THEMES,
  normalizeBreedMode,
  type AabbRect,
  type CatBreed,
  type CatBreedMode,
  type CatMood,
  type CatPersonality,
  type CatStateName,
  type InteractivePropState,
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
    breedMode: CatBreedMode;
    showSceneProps: boolean;
    activeTreatsCount: number;
    interactivePropsCount: number;
    nativeHostConnected: boolean;
    fpsCap: number;
  };
  getCats: () => Array<{
    id: number;
    name: string;
    breed: CatBreed;
    mood: CatMood;
    personality: CatPersonality;
    activePropId: string | null;
    state: CatStateName;
    x: number;
    y: number;
    vx: number;
    vy: number;
    zHeight: number;
    perchedIconId: number | null;
  }>;
  getObstacles: () => AabbRect[];
  getInteractiveProps: () => readonly InteractivePropState[];
  isSplitPrism: () => boolean;
  getLighting: () => { mode: LightingMode; effective: EffectiveLightingMode };
  dropTreat: (x?: number, y?: number) => void;
  clickAt: (x: number, y: number, doubleClick?: boolean) => boolean;
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

  recordCursor(
    x: number,
    y: number,
    nowSec: number,
    cats: readonly CatEntity[],
    particles: ParticleSystem,
  ): void {
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
  scenePropsOverlay.setPropsEnabled(settings.showSceneProps);
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
  scenePropsOverlay.setLightingMode(lastEffectiveLighting);
  scenePropsOverlay.setNightMode(lastEffectiveLighting === 'night');
  lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());

  // Particles & Props
  const particleSystem = new ParticleSystem(180);
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
  let lastTrackedTreatCount = 0;

  // UI Overlays (initialized early so perch tracking can reference mockIcons safely)
  const hud = new HudOverlay(hudRoot);
  let dock!: ToyDock;
  let mockIcons!: MockDesktopIcons;

  // Win32 WebView2 IPC Bridge helper
  const webview = window.chrome?.webview;

  function postToHost(msg: RendererToHostMessage): void {
    webview?.postMessage(msg);
  }

  function notifyHostSettingsChanged(patch: Partial<NekoSettings>): void {
    if (nativeHostConnected) {
      postToHost({
        type: 'SETTINGS_CHANGED',
        settings: patch,
      });
    }
  }

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

  // Cat Pack management with diverse real-life breed showcase & decorrelated seeds
  const cats: CatEntity[] = [];
  let nextCatId = 1;
  let breedRotationOffset = 0;

  function computeCatSpawnPoint(index: number): Vec2 {
    const rug = surfaceManager.getRugBounds();
    const cx = rug.x + rug.width * 0.5;
    const cy = rug.y + rug.height * 0.5;
    // Golden-angle spiral distribution so spawned cats never cluster in identical columns
    const goldenAngle = index * 2.399963229728653 + 0.35;
    const radialFrac = 0.24 + ((index * 0.29) % 0.68);
    const rx = Math.min(rug.width * 0.42, Math.max(46, rug.width * 0.42 * radialFrac));
    const ry = Math.min(rug.height * 0.4, Math.max(38, rug.height * 0.4 * radialFrac));
    return {
      x: clamp(cx + Math.cos(goldenAngle) * rx, 36, viewWidth - 36),
      y: clamp(cy + Math.sin(goldenAngle) * ry, 36, viewHeight - 36),
    };
  }

  function computeDecorrelatedSeed(catId: number, slotIndex: number): number {
    let s = (Math.imul(catId, 0x9e3779b1) ^ Math.imul(slotIndex + 1, 0x85ebca6b)) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0xc2b2ae35) >>> 0;
    return (s ^ (s >>> 13)) >>> 0 || 1;
  }

  function syncCatCount(targetCount: number, forceRebuild = false): void {
    const clamped = Math.max(1, Math.min(12, Math.round(targetCount)));
    settings.catCount = clamped;

    if (forceRebuild) {
      while (cats.length > 0) {
        const removed = cats.pop();
        if (removed) {
          cardboardBox.release(removed.id);
          updateCatPerch(removed.id, null);
          removed.destroy();
        }
      }
    }

    const desiredBreeds = pickDiverseBreedOrder(
      clamped,
      settings.breedMode,
      breedRotationOffset,
    );

    while (cats.length < clamped) {
      const idx = cats.length;
      const breed = desiredBreeds[idx] ?? desiredBreeds[idx % desiredBreeds.length];
      const spawn = computeCatSpawnPoint(idx);
      const id = nextCatId++;
      const seed = computeDecorrelatedSeed(id, idx);
      const coatVariantIndex =
        settings.breedMode === 'mix' ? Math.floor(idx / 6) : idx;
      const cat = new CatEntity(id, breed, spawn.x, spawn.y, {
        seed,
        coatVariantIndex,
      });
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

  // Only update & animate icon mats when an icon is dropped/settled (no mat movement during drag)
  function scheduleIconMatsUpdate(rects: readonly AabbRect[], isDragging: boolean): void {
    if (isDragging) {
      return;
    }
    iconMatsOverlay.setIcons(rects, { fast: false });
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
    const activeTreatsCount = scenePropsOverlay.getActiveTreats().length;
    lastTrackedTreatCount = activeTreatsCount;

    hud.setStats({
      sceneTheme: settings.sceneTheme,
      catCount: cats.length,
      pounces,
      bonks,
      laserActive,
      splitPrism,
      activeTreatsCount,
      paused,
      lightingMode: settings.lightingMode,
      effectiveLighting: effective,
      visible: settings.showHud,
    });

    dock?.setState({
      sceneTheme: settings.sceneTheme,
      lightingMode: settings.lightingMode,
      laserActive,
      boxVisible: cardboardBox.isVisible(),
      catCount: settings.catCount,
      breedMode: settings.breedMode,
      propsVisible: settings.showSceneProps,
      activeTreatsCount,
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
      if (
        state === 'IDLE' ||
        state === 'WANDER' ||
        state === 'LOAFING' ||
        state === 'GROOMING' ||
        triggered === 0
      ) {
        cat.triggerInvestigate(point);
        triggered++;
        if (triggered >= 3) {
          break;
        }
      }
    }
  }

  function attractCatsToTreat(treatId: string, maxCats = 2): void {
    const treat = scenePropsOverlay.getActiveTreats().find((t) => t.id === treatId);
    if (!treat) return;

    const sorted = [...cats].sort((a, b) => {
      const pa = a.getPosition();
      const pb = b.getPosition();
      return Math.hypot(pa.x - treat.x, pa.y - treat.y) - Math.hypot(pb.x - treat.x, pb.y - treat.y);
    });

    let count = 0;
    for (const cat of sorted) {
      const state = cat.getState();
      if (state === 'EATING_TREAT' || state === 'BONK') continue;
      cat.triggerTreatAttract(treat);
      count++;
      if (count >= maxCats) break;
    }
  }

  function dropTreatAt(x?: number, y?: number, showToast = true): void {
    const treat = scenePropsOverlay.spawnTreat(x, y);
    particleSystem.spawnKibbleCrumbs(treat.x, treat.y, 5);
    particleSystem.spawnPropBurst({
      kind: 'sparkle',
      x: treat.x,
      y: treat.y - 4,
      count: 5,
    });
    attractCatsToTreat(treat.id, 2);
    if (showToast) {
      hud.showInteractionToast({
        kind: 'treat',
        title: 'Fish Biscuit Treat',
        subtitle: 'Tossed a crunchy snack onto the floor',
        x: treat.x,
        y: treat.y - 12,
      });
    }
    refreshUiOverlays();
  }

  function setSceneTheme(theme: SceneTheme, notifyHost = true): void {
    const nextTheme = normalizeSceneTheme(theme);
    settings.sceneTheme = nextTheme;
    hardwoodFloor.setTheme(nextTheme);
    rugOverlay.setTheme(nextTheme);
    iconMatsOverlay.setTheme(nextTheme);
    scenePropsOverlay.setTheme(nextTheme);
    cardboardBox.setTheme(nextTheme);
    lightingOverlay.setTheme(nextTheme);
    lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
    refreshUiOverlays();
    if (notifyHost) {
      notifyHostSettingsChanged({ sceneTheme: nextTheme });
    }
  }

  function setLightingMode(mode: LightingMode, notifyHost = true): void {
    settings.lightingMode = mode;
    lightingOverlay.setMode(mode);
    const effective = lightingOverlay.getEffectiveLighting();
    scenePropsOverlay.setLightingMode(effective);
    if (effective !== lastEffectiveLighting) {
      lastEffectiveLighting = effective;
      iconMatsOverlay.setLighting(effective);
      scenePropsOverlay.setNightMode(effective === 'night');
    }
    lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
    refreshUiOverlays();
    if (notifyHost) {
      notifyHostSettingsChanged({ lightingMode: mode });
    }
  }

  function setBreedMode(mode: CatBreedMode, notifyHost = true): void {
    const normalized = normalizeBreedMode(mode);
    const changed = settings.breedMode !== normalized;
    settings.breedMode = normalized;
    if (changed) {
      if (normalized === 'mix') {
        breedRotationOffset = (breedRotationOffset + 1) % 6;
      }
      syncCatCount(settings.catCount, true);
    }
    refreshUiOverlays();
    if (notifyHost) {
      notifyHostSettingsChanged({ breedMode: normalized });
    }
  }

  function setScenePropsVisible(visible: boolean, notifyHost = true): void {
    settings.showSceneProps = visible;
    scenePropsOverlay.setPropsEnabled(visible);
    lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
    refreshUiOverlays();
    if (notifyHost) {
      notifyHostSettingsChanged({ showSceneProps: visible });
    }
  }

  function setDebugMode(enabled: boolean, notifyHost = true): void {
    settings.debugMode = enabled;
    debugVisualizer.setEnabled(enabled);
    refreshUiOverlays();
    if (notifyHost) {
      notifyHostSettingsChanged({ debugMode: enabled });
    }
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
    } else if (visible) {
      cardboardBox.triggerFlapRustle(undefined, 0.85);
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
      onSelectScene: (theme) => setSceneTheme(theme, true),
      onSelectLighting: (mode) => setLightingMode(mode, true),
      onToggleLaser: toggleStickyLaser,
      onTossYarn: tossYarnAcrossFloor,
      onCenterPrism: centerPrismProp,
      onToggleBox: toggleCardboardBox,
      onDropTreat: () => dropTreatAt(undefined, undefined, true),
      onChangeCatCount: (nextCount) => {
        syncCatCount(nextCount);
        refreshUiOverlays();
        notifyHostSettingsChanged({ catCount: settings.catCount });
      },
      onSelectBreedMode: (breedMode) => {
        setBreedMode(breedMode, true);
      },
      onToggleHud: () => {
        settings.showHud = !settings.showHud;
        refreshUiOverlays();
        notifyHostSettingsChanged({ showHud: settings.showHud });
      },
      onToggleDebug: () => {
        setDebugMode(!settings.debugMode, true);
      },
      onToggleProps: () => {
        setScenePropsVisible(!settings.showSceneProps, true);
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
        notifyHostSettingsChanged({ fpsCap: settings.fpsCap });
      },
      onChangeIdleNapMinutes: (nextMinutes) => {
        settings.idleNapMinutes = Math.max(1, Math.min(60, Math.round(nextMinutes)));
        refreshUiOverlays();
        notifyHostSettingsChanged({ idleNapMinutes: settings.idleNapMinutes });
      },
      onToggleLaserHotkey: () => {
        settings.enableLaserHotkey = !settings.enableLaserHotkey;
        if (!settings.enableLaserHotkey) {
          altHeld = false;
        }
        refreshUiOverlays();
        notifyHostSettingsChanged({ enableLaserHotkey: settings.enableLaserHotkey });
      },
      onToggleShellReactions: () => {
        settings.enableShellReactions = !settings.enableShellReactions;
        refreshUiOverlays();
        notifyHostSettingsChanged({ enableShellReactions: settings.enableShellReactions });
      },
    },
    {
      sceneTheme: settings.sceneTheme,
      lightingMode: settings.lightingMode,
      laserActive: false,
      boxVisible: cardboardBox.isVisible(),
      catCount: settings.catCount,
      breedMode: settings.breedMode,
      propsVisible: settings.showSceneProps,
      activeTreatsCount: 0,
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

  // ============================================================================
  // Crisp Priority Hit-Testing: UI Overlay -> Cat -> Interactive Prop -> Box/Yarn/Prism -> Floor Tap
  // ============================================================================

  const pettingDetector = new PettingDetector();

  let lastClickTimeMs = -Infinity;
  let lastClickX = 0;
  let lastClickY = 0;
  let lastClickedCatId: number | null = null;

  function handlePriorityCanvasClick(x: number, y: number, explicitDoubleClick?: boolean): boolean {
    const nowMs = performance.now();
    const isDoubleClick =
      explicitDoubleClick ??
      (nowMs - lastClickTimeMs <= 360 && Math.hypot(x - lastClickX, y - lastClickY) <= 22);
    lastClickTimeMs = nowMs;
    lastClickX = x;
    lastClickY = y;

    // 1. Priority 1: Clicked Cat
    const clickedCat = hitTestCat(cats, x, y);
    if (clickedCat) {
      const sameCatDouble = isDoubleClick && lastClickedCatId === clickedCat.id;
      lastClickedCatId = clickedCat.id;
      const reaction = onCatClicked(clickedCat, sameCatDouble);
      hud.showInteractionToast({
        kind: 'cat',
        title: `${reaction.name} \u00b7 ${reaction.breedLabel}`,
        subtitle: reaction.caption,
        x: reaction.x,
        y: reaction.y,
      });
      return true;
    }
    lastClickedCatId = null;

    // 2. Priority 2: Clicked Interactive Scene Prop (or dropped treat / ambient butterfly)
    if (scenePropsOverlay.isPropsEnabled()) {
      const propHit = scenePropsOverlay.handlePointerClick(x, y);
      if (propHit) {
        lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
        for (const burst of propHit.particles) {
          particleSystem.spawnPropBurst(burst);
        }

        if (propHit.spawnedTreatPoint) {
          const latestTreats = scenePropsOverlay.getActiveTreats();
          const newest = latestTreats[latestTreats.length - 1];
          if (newest) {
            attractCatsToTreat(newest.id, 2);
          }
        } else if (propHit.prop.isActive || propHit.attractDurationSec > 0) {
          const sorted = [...cats].sort((a, b) => {
            const pa = a.getPosition();
            const pb = b.getPosition();
            return (
              Math.hypot(pa.x - propHit.attractPoint.x, pa.y - propHit.attractPoint.y) -
              Math.hypot(pb.x - propHit.attractPoint.x, pb.y - propHit.attractPoint.y)
            );
          });
          let lured = 0;
          const maxLured = propHit.interactionType === 'catnip' ? 2 : 1;
          for (const cat of sorted) {
            const state = cat.getState();
            if (state === 'BONK' || state === 'EATING_TREAT') continue;
            const pos = cat.getPosition();
            const dist = Math.hypot(pos.x - propHit.attractPoint.x, pos.y - propHit.attractPoint.y);
            if (dist <= propHit.attractRadius * 1.45 || lured === 0) {
              cat.triggerPropAttract(propHit.prop, propHit.attractPoint);
              lured++;
              if (lured >= maxLured) break;
            }
          }
        }

        hud.showInteractionToast({
          kind: 'prop',
          title: propHit.label,
          subtitle: propHit.feedbackText,
          x: propHit.prop.x,
          y: propHit.prop.y - propHit.prop.radius,
        });
        refreshUiOverlays();
        return true;
      }
    }

    // 3. Priority 3: Tapping Box / Yarn / Prism directly (when not dragged)
    if (yarnBall.containsPoint(x, y)) {
      tossYarnAcrossFloor();
      return true;
    }
    if (cardboardBox.isVisible() && cardboardBox.containsPoint(x, y)) {
      cardboardBox.triggerFlapRustle(undefined, 1.0);
      const bp = cardboardBox.getPosition();
      particleSystem.spawnDustPuff(bp.x, bp.y, 0, -24);
      if (cardboardBox.occupantId !== null) {
        const occupant = cats.find((c) => c.id === cardboardBox.occupantId);
        if (occupant) {
          const reaction = onCatClicked(occupant, isDoubleClick);
          hud.showInteractionToast({
            kind: 'cat',
            title: `${reaction.name} \u00b7 ${reaction.breedLabel}`,
            subtitle: reaction.caption,
            x: reaction.x,
            y: reaction.y,
          });
        }
      } else {
        hud.showInteractionToast({
          kind: 'prop',
          title: 'Cardboard Box',
          subtitle: 'Rustled flaps to invite a curious cat',
          x: bp.x,
          y: bp.y - 36,
        });
        investigatePoint(bp);
      }
      return true;
    }
    if (prismLaser.containsPrismPoint(x, y)) {
      particleSystem.spawnClickRipple(x, y, 0x72e5ff);
      return true;
    }

    // 4. Priority 4: Empty Floor Tap (double-click drops treat; single click triggers ripple & curious glance)
    particleSystem.spawnClickRipple(x, y);
    if (isDoubleClick) {
      dropTreatAt(x, y, true);
      return true;
    }

    // Cue nearest 1-2 cats for a curious glance or meerkat peek toward the floor tap
    const sorted = [...cats].sort((a, b) => {
      const pa = a.getPosition();
      const pb = b.getPosition();
      return Math.hypot(pa.x - x, pa.y - y) - Math.hypot(pb.x - x, pb.y - y);
    });
    let glanced = 0;
    for (const cat of sorted) {
      cat.triggerCuriosityGlance({ x, y });
      glanced++;
      if (glanced >= 2) break;
    }
    return false;
  }

  type DragPropKind = 'prism' | 'yarn' | 'box';
  let activeStageDrag: {
    kind: DragPropKind;
    pointerId: number;
    grabOffsetX: number;
    grabOffsetY: number;
    startX: number;
    startY: number;
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

    // Check Priority 1 (Cat) & Priority 2 (Interactive Scene Prop) immediately on pointerdown!
    const hitCat = hitTestCat(cats, e.clientX, e.clientY);
    if (hitCat) {
      handlePriorityCanvasClick(e.clientX, e.clientY);
      return;
    }

    if (
      scenePropsOverlay.isPropsEnabled() &&
      scenePropsOverlay.handlePointerMove(e.clientX, e.clientY) !== null
    ) {
      handlePriorityCanvasClick(e.clientX, e.clientY);
      return;
    }

    // Check Priority 3 (Draggable Prism / Yarn / Cardboard Box)
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
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastTimeMs: performance.now(),
        vx: 0,
        vy: 0,
        moved: false,
      };
      return;
    }

    // Priority 4: Floor tap
    handlePriorityCanvasClick(e.clientX, e.clientY);
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
      if (Math.hypot(e.clientX - activeStageDrag.startX, e.clientY - activeStageDrag.startY) > 5) {
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

    const hoveredProp = scenePropsOverlay.handlePointerMove(e.clientX, e.clientY);
    const hoveredCat = hitTestCat(cats, e.clientX, e.clientY);
    if (hoveredCat || hoveredProp) {
      app.canvas.style.cursor = 'pointer';
    } else if (
      prismLaser.containsPrismPoint(e.clientX, e.clientY) ||
      yarnBall.containsPoint(e.clientX, e.clientY) ||
      (cardboardBox.isVisible() && cardboardBox.containsPoint(e.clientX, e.clientY))
    ) {
      app.canvas.style.cursor = 'grab';
    } else {
      app.canvas.style.cursor = '';
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
    const wasTap = !activeStageDrag.moved;
    if (activeStageDrag.kind === 'yarn') {
      if (activeStageDrag.moved && Math.hypot(activeStageDrag.vx, activeStageDrag.vy) > 40) {
        yarnBall.toss(
          clamp(activeStageDrag.vx, -900, 900),
          clamp(activeStageDrag.vy, -900, 900),
        );
      } else {
        tossYarnAcrossFloor();
      }
    } else if (wasTap && activeStageDrag.kind === 'box') {
      handlePriorityCanvasClick(e.clientX, e.clientY);
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
        setDebugMode(!settings.debugMode, true);
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
    lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
    prismLaser.resize(viewWidth, viewHeight);
    mockIcons.resize(viewWidth, viewHeight);

    const yp = yarnBall.getPosition();
    yarnBall.reset(clamp(yp.x, 24, viewWidth - 24), clamp(yp.y, 24, viewHeight - 24));
    const bp = cardboardBox.getPosition();
    cardboardBox.setPosition(clamp(bp.x, 56, viewWidth - 56), clamp(bp.y, 56, viewHeight - 56));
  });

  function applySettingsUpdate(next: NekoSettings): void {
    const prevCatCount = settings.catCount;
    const prevLighting = settings.lightingMode;
    const prevSceneTheme = settings.sceneTheme;
    const prevBreedMode = settings.breedMode;
    const prevShowProps = settings.showSceneProps;
    const prevDebug = settings.debugMode;

    Object.assign(settings, next);
    settings.sceneTheme = normalizeSceneTheme(next.sceneTheme);
    settings.breedMode = normalizeBreedMode(next.breedMode);
    settings.showSceneProps =
      typeof next.showSceneProps === 'boolean' ? next.showSceneProps : true;

    if (settings.breedMode !== prevBreedMode) {
      syncCatCount(settings.catCount, true);
    } else if (settings.catCount !== prevCatCount) {
      syncCatCount(settings.catCount, false);
    }
    if (settings.sceneTheme !== prevSceneTheme) {
      hardwoodFloor.setTheme(settings.sceneTheme);
      rugOverlay.setTheme(settings.sceneTheme);
      iconMatsOverlay.setTheme(settings.sceneTheme);
      scenePropsOverlay.setTheme(settings.sceneTheme);
      cardboardBox.setTheme(settings.sceneTheme);
      lightingOverlay.setTheme(settings.sceneTheme);
    }
    if (settings.showSceneProps !== prevShowProps) {
      scenePropsOverlay.setPropsEnabled(settings.showSceneProps);
    }
    if (settings.lightingMode !== prevLighting) {
      lightingOverlay.setMode(settings.lightingMode);
      const effective = lightingOverlay.getEffectiveLighting();
      scenePropsOverlay.setLightingMode(effective);
      if (effective !== lastEffectiveLighting) {
        lastEffectiveLighting = effective;
        iconMatsOverlay.setLighting(effective);
        scenePropsOverlay.setNightMode(effective === 'night');
      }
    }
    lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
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

  function handleHostMessage(msg: HostToRendererMessage): void {
    switch (msg.type) {
      case 'ICON_UPDATE': {
        if (!nativeHostConnected) {
          nativeHostConnected = true;
          mockIcons.hideForNativeMode();
          refreshUiOverlays();
        }
        physics.setObstacles(msg.icons);
        scheduleIconMatsUpdate(msg.icons, false);
        break;
      }

      case 'MOUSE_RAW': {
        cursorPos.x = msg.x;
        cursorPos.y = msg.y;
        if (hostLaserActive !== msg.laserMode) {
          lastHostLaserSyncMs = performance.now();
        }
        hostLaserActive = msg.laserMode;
        hostSplitPrism = msg.splitPrism;
        scenePropsOverlay.handlePointerMove(msg.x, msg.y);
        pettingDetector.recordCursor(msg.x, msg.y, performance.now() / 1000, cats, particleSystem);
        refreshUiOverlays();
        break;
      }

      case 'POINTER_CLICK': {
        cursorPos.x = msg.x;
        cursorPos.y = msg.y;
        localLastActivityMs = performance.now();
        if (msg.button === 'left') {
          handlePriorityCanvasClick(msg.x, msg.y, msg.doubleClick);
        }
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
          case 'dropTreat': {
            dropTreatAt(undefined, undefined, true);
            break;
          }
          case 'toggleProps': {
            setScenePropsVisible(!settings.showSceneProps, true);
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
    postToHost({ type: 'READY', rendererVersion: '0.2.0' });
  }

  function sendStatsUpdate(): void {
    let nappingCats = 0;
    for (const cat of cats) {
      if (cat.getState() === 'NAP' || cat.getState() === 'SUNBATHE') {
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
      scenePropsOverlay.setLightingMode(effectiveLighting);
      scenePropsOverlay.setNightMode(effectiveLighting === 'night');
      lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
      refreshUiOverlays();
    }

    // Update ambient & interactive scene props (koi fish, butterflies, steam wisps, sakura petals, treats)
    scenePropsOverlay.update(stepDt);

    // Update cardboard box flap flex & recoil springs
    cardboardBox.update(stepDt);

    // Smoothly animate desktop icon mat transitions & drop fade-ins
    iconMatsOverlay.update(stepDt);

    // Update laser & split-prism state
    const laserActive = isLaserCurrentlyActive();
    prismLaser.setCursor(cursorPos.x, cursorPos.y, laserActive, hostSplitPrism);
    prismLaser.update(stepDt);

    const splitActive = prismLaser.isSplitActive();
    const currentTreatsCount = scenePropsOverlay.getActiveTreats().length;
    if (
      laserActive !== lastHudLaserActive ||
      splitActive !== lastHudSplitPrism ||
      currentTreatsCount !== lastTrackedTreatCount
    ) {
      lastHudLaserActive = laserActive;
      lastHudSplitPrism = splitActive;
      lastTrackedTreatCount = currentTreatsCount;
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

    // Periodic organic curiosity toward scene-specific props when not chasing laser
    if (!laserActive && scenePropsOverlay.isPropsEnabled()) {
      sceneCuriosityTimer -= stepDt;
      if (sceneCuriosityTimer <= 0) {
        sceneCuriosityTimer = 12 + Math.random() * 9;
        const props = scenePropsOverlay.getInteractiveProps();
        if (props.length > 0 && cats.length > 0) {
          const prop = props[sceneCuriosityCursor % props.length];
          sceneCuriosityCursor++;
          const candidate =
            cats.find((c) => c.getState() === 'IDLE' || c.getState() === 'WANDER') ?? null;
          candidate?.triggerPropAttract(prop, prop.interactPoint);
        }
      }
    }

    // Update yarn ball physics unless actively dragged
    if (!activeStageDrag || activeStageDrag.kind !== 'yarn') {
      yarnBall.update(stepDt, physics, particleSystem);
    }

    // Update all cats with full world, prop, warm-zone, treat, critter & social context
    const catCtx: CatContext = {
      physics,
      surfaceManager,
      laserTargets: prismLaser.getActiveTargets(),
      yarnBall,
      cardboardBox,
      sceneObstacles: scenePropsOverlay.getObstacles(),
      interactiveProps: scenePropsOverlay.getInteractiveProps(),
      warmZones: scenePropsOverlay.getWarmZones(),
      activeTreats: scenePropsOverlay.getActiveTreats(),
      ambientCritters: scenePropsOverlay.getAmbientCritters(),
      otherCats: cats,
      cursorPos,
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
      onPropInteract: (propId, cat) => {
        const bursts = scenePropsOverlay.notifyCatInteract(propId, cat.id);
        for (const burst of bursts) {
          particleSystem.spawnPropBurst(burst);
        }
        lightingOverlay.setWarmZones(scenePropsOverlay.getWarmZones());
      },
      onConsumeTreat: (treatId, cat) => {
        const finished = scenePropsOverlay.consumeTreatBite(treatId, cat.id);
        refreshUiOverlays();
        return finished;
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
        if ((stateA === 'NAP' || stateA === 'SUNBATHE') && (stateB === 'NAP' || stateB === 'SUNBATHE')) {
          continue;
        }
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
        props: scenePropsOverlay.getInteractiveProps(),
        treats: scenePropsOverlay.getActiveTreats(),
        warmZones: scenePropsOverlay.getWarmZones(),
        cats: cats.map((cat) => {
          const pos = cat.getPosition();
          const vel = cat.getVelocity();
          return {
            id: cat.id,
            name: cat.getName(),
            x: pos.x,
            y: pos.y,
            vx: vel.x,
            vy: vel.y,
            radius: cat.getRadius(),
            state: cat.getState(),
            breed: cat.getBreed(),
            mood: cat.getMood(),
            personality: cat.getPersonality(),
            activePropId: cat.getActivePropId(),
            zHeight: cat.getZHeight(),
            perchedIconId: cat.getPerchedIconId(),
            jumpArc: cat.getJumpArcDebug(),
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
        if (cat.getState() === 'NAP' || cat.getState() === 'SUNBATHE') {
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
        breedMode: settings.breedMode,
        showSceneProps: settings.showSceneProps,
        activeTreatsCount: scenePropsOverlay.getActiveTreats().length,
        interactivePropsCount: scenePropsOverlay.getInteractiveProps().length,
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
          name: cat.getName(),
          breed: cat.getBreed(),
          mood: cat.getMood(),
          personality: cat.getPersonality(),
          activePropId: cat.getActivePropId(),
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
    getInteractiveProps: () => scenePropsOverlay.getInteractiveProps(),
    isSplitPrism: () => prismLaser.isSplitActive(),
    getLighting: () => ({
      mode: settings.lightingMode,
      effective: lightingOverlay.getEffectiveLighting(),
    }),
    dropTreat: (x?: number, y?: number) => {
      dropTreatAt(x, y, true);
    },
    clickAt: (x: number, y: number, doubleClick?: boolean) =>
      handlePriorityCanvasClick(x, y, doubleClick),
  });

  Object.defineProperty(window, '__NEKOSCAPE__', {
    value: debugApi,
    writable: false,
    configurable: false,
    enumerable: true,
  });
}

void bootstrap();
