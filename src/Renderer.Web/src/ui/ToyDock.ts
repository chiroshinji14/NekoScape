import type { LightingMode, SceneTheme } from '../types/simulation';

export interface ToyDockCallbacks {
  onSelectScene: (theme: SceneTheme) => void;
  onSelectLighting: (mode: LightingMode) => void;
  onToggleLaser: () => void;
  onTossYarn: () => void;
  onCenterPrism: () => void;
  onToggleBox: () => void;
  onChangeCatCount: (nextCount: number) => void;
  onToggleHud: () => void;
  onToggleDebug: () => void;
  onNewFile: () => void;
  onTidyIcons: () => void;
  onEmptyBin: () => void;
  onPlayWithIcon: () => void;
  onChangeFpsCap?: (fpsCap: number) => void;
  onChangeIdleNapMinutes?: (minutes: number) => void;
  onToggleLaserHotkey?: () => void;
  onToggleShellReactions?: () => void;
}

export interface ToyDockState {
  sceneTheme: SceneTheme;
  lightingMode: LightingMode;
  laserActive: boolean;
  boxVisible: boolean;
  catCount: number;
  hudVisible: boolean;
  debugMode: boolean;
  visible: boolean;
  nativeHostConnected: boolean;
  fpsCap?: number;
  idleNapMinutes?: number;
  enableLaserHotkey?: boolean;
  enableShellReactions?: boolean;
}

type PopoverTab = 'space' | 'settings';

const SVG_NS = 'http://www.w3.org/2000/svg';
const AUTO_HINT_TIMEOUT_MS = 8000;

const SCENE_OPTIONS: readonly {
  theme: SceneTheme;
  label: string;
  title: string;
  subtitle: string;
}[] = [
  {
    theme: 'study',
    label: 'Study',
    title: 'Golden Study',
    subtitle: 'Monstera, books & espresso',
  },
  {
    theme: 'tatami',
    label: 'Tatami',
    title: 'Kyoto Tatami',
    subtitle: 'Chabudai tea, bonsai & sakura',
  },
  {
    theme: 'garden',
    label: 'Garden',
    title: 'Sunlit Courtyard',
    subtitle: 'Koi pond, lantern & butterflies',
  },
  {
    theme: 'cafe',
    label: 'Cafe',
    title: 'Cat Cafe',
    subtitle: 'Marble bistro, latte & cat tree',
  },
];

const LIGHTING_OPTIONS: readonly {
  mode: LightingMode;
  label: string;
  icon: readonly string[];
}[] = [
  {
    mode: 'auto',
    label: 'Auto',
    icon: [
      'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 1 0 0-13.6Z',
      'M10 6.2V10l2.6 1.6',
    ],
  },
  {
    mode: 'day',
    label: 'Day',
    icon: [
      'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Z',
      'M10 2.6v1.5',
      'M10 15.9v1.5',
      'M2.6 10h1.5',
      'M15.9 10h1.5',
    ],
  },
  {
    mode: 'golden',
    label: 'Golden',
    icon: [
      'M3.2 13.5h13.6',
      'M6.2 13.5a3.8 3.8 0 0 1 7.6 0',
      'M10 5.4v1.8',
      'M5.2 8l1.2 1.2',
      'M14.8 8l-1.2 1.2',
    ],
  },
  {
    mode: 'night',
    label: 'Night',
    icon: [
      'M14.6 12.5A5.4 5.4 0 0 1 7.5 5.4a5.6 5.6 0 1 0 7.1 7.1Z',
    ],
  },
];

const FPS_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 30, label: '30 FPS' },
  { value: 60, label: '60 FPS' },
  { value: 0, label: 'Max' },
];

const NAP_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: '1m' },
  { value: 5, label: '5m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
];

function createSvg(paths: readonly string[], className = 'ns-dock-svg'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
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

function createModernFabSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ns-fab-svg');

  // Modern stylized paw pad + toe beans
  const pad = document.createElementNS(SVG_NS, 'path');
  pad.setAttribute(
    'd',
    'M12 13.2c-2.6 0-4.6 1.8-4.6 3.9 0 1.4 1.1 2.4 2.5 2.4.8 0 1.4-.3 2.1-.3s1.3.3 2.1.3c1.4 0 2.5-1 2.5-2.4 0-2.1-2-3.9-4.6-3.9Z',
  );
  svg.appendChild(pad);

  const beans = [
    'M6.6 10.6a1.4 1.7 0 1 0 0-3.4 1.4 1.7 0 0 0 0 3.4Z',
    'M10.1 8.2a1.4 1.8 0 1 0 0-3.6 1.4 1.8 0 0 0 0 3.6Z',
    'M13.9 8.2a1.4 1.8 0 1 0 0-3.6 1.4 1.8 0 0 0 0 3.6Z',
    'M17.4 10.6a1.4 1.7 0 1 0 0-3.4 1.4 1.7 0 0 0 0 3.4Z',
  ];
  for (const d of beans) {
    const bean = document.createElementNS(SVG_NS, 'path');
    bean.setAttribute('d', d);
    svg.appendChild(bean);
  }

  return svg;
}

const ICONS = {
  spaceTab: [
    'M3.5 6.5 10 3.2l6.5 3.3v7L10 16.8l-6.5-3.3v-7Z',
    'M3.5 6.5 10 9.8l6.5-3.3',
    'M10 9.8v7',
  ],
  settingsTab: [
    'M4 6.5h12',
    'M4 13.5h12',
    'M7.5 4.5v4',
    'M12.5 11.5v4',
  ],
  laser: [
    'M3.5 16.5 11 9',
    'M13.5 6.5a2 2 0 1 0 0 .01',
    'M13.5 2.5v1.6',
    'M17.5 6.5h-1.6',
    'M16.3 3.7l-1.1 1.1',
  ],
  yarn: [
    'M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13Z',
    'M5.2 6.8c2.6 1.1 6.7 1.1 9.6 0',
    'M4.4 11.4c3.4-.6 7.5.7 10.6 2.3',
    'M14.5 14.5c1.3 1.2 2.4 1.6 3.5 1.3',
  ],
  prism: [
    'M10 2.8 16.2 6.4v7.2L10 17.2l-6.2-3.6V6.4L10 2.8Z',
    'M10 2.8v14.4',
    'M3.8 6.4 10 10l6.2-3.6',
  ],
  box: [
    'M3.5 7.2 10 4l6.5 3.2v6.6L10 17l-6.5-3.2V7.2Z',
    'M3.5 7.2 10 10.4l6.5-3.2',
    'M10 10.4V17',
    'M6.8 5.6 13.2 8.8',
  ],
  catSmall: [
    'M5 14.5V7.5l2.5 2h5l2.5-2v7c0 1.4-2.2 2.5-5 2.5s-5-1.1-5-2.5Z',
    'M8.2 12h.01',
    'M11.8 12h.01',
  ],
  minus: ['M5.5 10h9'],
  plus: ['M10 5.5v9', 'M5.5 10h9'],
  debug: [
    'M4.5 4.5h11v11h-11Z',
    'M4.5 4.5 15.5 15.5',
    'M15.5 4.5 4.5 15.5',
  ],
  newFile: [
    'M6 3.5h5.5L15 7v9.5H6V3.5Z',
    'M11.5 3.5V7H15',
    'M10.5 10v3.5',
    'M8.75 11.75h3.5',
  ],
  tidyIcons: [
    'M4.5 4.5h4.2v4.2H4.5Z',
    'M11.3 4.5h4.2v4.2h-4.2Z',
    'M4.5 11.3h4.2v4.2H4.5Z',
    'M11.3 11.3h4.2v4.2h-4.2Z',
  ],
  emptyBin: [
    'M5.2 6.5h9.6',
    'M8 4.2h4',
    'M6.5 6.5l.7 9.5h5.6l.7-9.5',
    'M10 9.5v4',
  ],
  playIcon: [
    'M4.5 13.5l3.2-3.2 2.4 2.4 4.9-5.2',
    'M12.2 7.5H15v2.8',
    'M4.5 16.2h11',
  ],
  close: ['M6 6l8 8', 'M14 6l-8 8'],
} as const;

export class ToyDock {
  private readonly root: HTMLElement;
  private readonly callbacks: ToyDockCallbacks;
  private readonly anchor: HTMLDivElement;
  private readonly tooltipEl: HTMLDivElement;
  private readonly fabBtn: HTMLButtonElement;
  private readonly fabBadgeDot: HTMLSpanElement;
  private readonly popover: HTMLDivElement;

  private readonly tabSpaceBtn: HTMLButtonElement;
  private readonly tabSettingsBtn: HTMLButtonElement;
  private readonly spacePane: HTMLDivElement;
  private readonly settingsPane: HTMLDivElement;

  private readonly sceneButtons = new Map<SceneTheme, HTMLButtonElement>();
  private readonly lightingButtons = new Map<LightingMode, HTMLButtonElement>();
  private readonly fpsButtons = new Map<number, HTMLButtonElement>();
  private readonly napButtons = new Map<number, HTMLButtonElement>();

  private readonly laserBtn: HTMLButtonElement;
  private readonly boxBtn: HTMLButtonElement;
  private readonly debugBtn: HTMLButtonElement;

  private readonly catMinusBtn: HTMLButtonElement;
  private readonly catPlusBtn: HTMLButtonElement;
  private readonly catCountEl: HTMLSpanElement;
  private readonly catMeterFill: HTMLDivElement;

  private readonly settingsCatMinusBtn: HTMLButtonElement;
  private readonly settingsCatPlusBtn: HTMLButtonElement;
  private readonly settingsCatCountEl: HTMLSpanElement;

  private readonly laserHotkeySwitch: HTMLButtonElement;
  private readonly shellReactionsSwitch: HTMLButtonElement;
  private readonly debugSwitch: HTMLButtonElement;

  private readonly desktopSimSection: HTMLElement;

  private state: ToyDockState = {
    sceneTheme: 'study',
    lightingMode: 'golden',
    laserActive: false,
    boxVisible: true,
    catCount: 6,
    hudVisible: false,
    debugMode: false,
    visible: true,
    nativeHostConnected: false,
    fpsCap: 60,
    idleNapMinutes: 5,
    enableLaserHotkey: true,
    enableShellReactions: true,
  };

  private activeTab: PopoverTab = 'space';
  private popoverOpen = false;
  private hintDismissed = false;
  private hintHideTimer: number | null = null;
  private hintAutoTimer: number | null = null;
  private popoverCloseTimer: number | null = null;

  private readonly handleOutsidePointerDown: (e: PointerEvent) => void;
  private readonly handleWindowKeyDown: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement, callbacks: ToyDockCallbacks, initialState?: Partial<ToyDockState>) {
    this.root = root;
    this.callbacks = callbacks;
    if (initialState) {
      this.state = { ...this.state, ...initialState };
    }

    this.anchor = document.createElement('div');
    this.anchor.className = 'ns-fab-anchor';

    // Compact floating onboarding pill
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'ns-double-bezel ns-fab-tooltip';
    this.tooltipEl.setAttribute('role', 'status');

    const tooltipTrigger = document.createElement('button');
    tooltipTrigger.type = 'button';
    tooltipTrigger.className = 'ns-tooltip-trigger';
    tooltipTrigger.textContent = 'Scenes, toys & settings\u2026';
    tooltipTrigger.setAttribute('aria-label', 'Open NekoScape studio controls');
    tooltipTrigger.addEventListener('click', () => {
      this.dismissHint();
      this.setPopoverOpen(true);
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'ns-hint-dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss hint');
    dismissBtn.appendChild(createSvg(ICONS.close, 'ns-hint-close-svg'));
    dismissBtn.addEventListener('click', () => {
      this.dismissHint();
    });

    this.tooltipEl.append(tooltipTrigger, dismissBtn);

    // Modern Squircle/Pill Floating Action Button
    const popoverId = 'ns-controls-popover';
    this.fabBtn = document.createElement('button');
    this.fabBtn.type = 'button';
    this.fabBtn.className = 'ns-double-bezel ns-fab-btn';
    this.fabBtn.setAttribute('aria-label', 'Show hidden NekoScape controls');
    this.fabBtn.setAttribute('aria-expanded', 'false');
    this.fabBtn.setAttribute('aria-haspopup', 'dialog');
    this.fabBtn.setAttribute('aria-controls', popoverId);

    const fabIconWrap = document.createElement('span');
    fabIconWrap.className = 'ns-fab-icon-wrap';
    fabIconWrap.appendChild(createModernFabSvg());

    this.fabBadgeDot = document.createElement('span');
    this.fabBadgeDot.className = 'ns-fab-scene-dot';
    this.fabBadgeDot.setAttribute('data-scene', this.state.sceneTheme);

    this.fabBtn.append(fabIconWrap, this.fabBadgeDot);
    this.fabBtn.addEventListener('click', () => {
      this.dismissHint();
      this.setPopoverOpen(!this.popoverOpen);
    });

    // Floating Control Center Popover
    this.popover = document.createElement('div');
    this.popover.id = popoverId;
    this.popover.className = 'ns-double-bezel ns-dock-popover';
    this.popover.setAttribute('role', 'dialog');
    this.popover.setAttribute('aria-label', 'NekoScape quick controls');
    this.popover.setAttribute('aria-hidden', 'true');
    this.popover.hidden = true;

    // Top Header with Brand + Segmented Tab Switcher (Space | Settings) + Close Button
    const header = document.createElement('div');
    header.className = 'ns-pop-header';

    const brandCol = document.createElement('div');
    brandCol.className = 'ns-pop-brand';
    const title = document.createElement('span');
    title.className = 'ns-pop-title';
    title.textContent = 'NekoScape';
    const subtitle = document.createElement('span');
    subtitle.className = 'ns-pop-subtitle';
    subtitle.textContent = 'Live Studio';
    brandCol.append(title, subtitle);

    const tabBar = document.createElement('div');
    tabBar.className = 'ns-tab-switcher';
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Control sections');

    this.tabSpaceBtn = document.createElement('button');
    this.tabSpaceBtn.type = 'button';
    this.tabSpaceBtn.className = 'ns-tab-btn';
    this.tabSpaceBtn.setAttribute('role', 'tab');
    this.tabSpaceBtn.setAttribute('aria-selected', 'true');
    this.tabSpaceBtn.append(createSvg(ICONS.spaceTab, 'ns-tab-svg'), document.createTextNode('Space'));
    this.tabSpaceBtn.addEventListener('click', () => this.setActiveTab('space'));

    this.tabSettingsBtn = document.createElement('button');
    this.tabSettingsBtn.type = 'button';
    this.tabSettingsBtn.className = 'ns-tab-btn';
    this.tabSettingsBtn.setAttribute('role', 'tab');
    this.tabSettingsBtn.setAttribute('aria-selected', 'false');
    this.tabSettingsBtn.append(
      createSvg(ICONS.settingsTab, 'ns-tab-svg'),
      document.createTextNode('Settings'),
    );
    this.tabSettingsBtn.addEventListener('click', () => this.setActiveTab('settings'));

    tabBar.append(this.tabSpaceBtn, this.tabSettingsBtn);

    const closePopBtn = document.createElement('button');
    closePopBtn.type = 'button';
    closePopBtn.className = 'ns-pop-close-btn';
    closePopBtn.setAttribute('aria-label', 'Close controls');
    closePopBtn.appendChild(createSvg(ICONS.close, 'ns-dock-svg'));
    closePopBtn.addEventListener('click', () => this.setPopoverOpen(false));

    header.append(brandCol, tabBar, closePopBtn);

    // =========================================================================
    // TAB 1: SPACE PANE (Scenes Bento, Lighting, Toys, Pack Count, Desktop Sim)
    // =========================================================================
    this.spacePane = document.createElement('div');
    this.spacePane.className = 'ns-tab-pane';

    // 1. 2x2 Visual Scene Bento Cards
    const sceneSection = this.createSection('Environment Scene');
    const sceneGrid = document.createElement('div');
    sceneGrid.className = 'ns-scene-bento';
    sceneGrid.setAttribute('role', 'group');
    sceneGrid.setAttribute('aria-label', 'Floor scene theme');

    for (const option of SCENE_OPTIONS) {
      const cardBtn = document.createElement('button');
      cardBtn.type = 'button';
      cardBtn.className = 'ns-scene-card';
      cardBtn.setAttribute('aria-label', `Switch scene to ${option.title}`);
      cardBtn.setAttribute('aria-pressed', String(option.theme === this.state.sceneTheme));

      const preview = document.createElement('div');
      preview.className = 'ns-scene-preview';
      preview.setAttribute('data-scene', option.theme);
      preview.setAttribute('aria-hidden', 'true');

      const orbA = document.createElement('span');
      orbA.className = 'ns-scene-orb ns-scene-orb-a';
      const orbB = document.createElement('span');
      orbB.className = 'ns-scene-orb ns-scene-orb-b';
      const orbC = document.createElement('span');
      orbC.className = 'ns-scene-orb ns-scene-orb-c';
      preview.append(orbA, orbB, orbC);

      const textCol = document.createElement('div');
      textCol.className = 'ns-scene-card-copy';

      const nameRow = document.createElement('div');
      nameRow.className = 'ns-scene-card-head';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ns-scene-card-title';
      nameSpan.textContent = option.label;
      const activeDot = document.createElement('span');
      activeDot.className = 'ns-scene-active-dot';
      nameRow.append(nameSpan, activeDot);

      const descSpan = document.createElement('span');
      descSpan.className = 'ns-scene-card-sub';
      descSpan.textContent = option.subtitle;

      textCol.append(nameRow, descSpan);
      cardBtn.append(preview, textCol);

      cardBtn.addEventListener('click', () => {
        this.dismissHint();
        this.callbacks.onSelectScene(option.theme);
      });
      this.sceneButtons.set(option.theme, cardBtn);
      sceneGrid.appendChild(cardBtn);
    }
    sceneSection.appendChild(sceneGrid);

    // 2. Segmented Lighting Pill Track
    const lightingSection = this.createSection('Atmosphere & Time');
    const lightingGroup = document.createElement('div');
    lightingGroup.className = 'ns-dock-segments';
    lightingGroup.setAttribute('role', 'group');
    lightingGroup.setAttribute('aria-label', 'Floor lighting mode');

    for (const option of LIGHTING_OPTIONS) {
      const segBtn = document.createElement('button');
      segBtn.type = 'button';
      segBtn.className = 'ns-seg-btn';
      segBtn.setAttribute('aria-label', `Set lighting to ${option.label}`);
      segBtn.setAttribute('aria-pressed', String(option.mode === this.state.lightingMode));

      segBtn.appendChild(createSvg(option.icon, 'ns-seg-svg'));
      const txt = document.createElement('span');
      txt.textContent = option.label;
      segBtn.appendChild(txt);

      segBtn.addEventListener('click', () => {
        this.dismissHint();
        this.callbacks.onSelectLighting(option.mode);
      });
      this.lightingButtons.set(option.mode, segBtn);
      lightingGroup.appendChild(segBtn);
    }
    lightingSection.appendChild(lightingGroup);

    // 3. Interactive Toys Bento
    const toysSection = this.createSection('Interactive Props');
    const toysGrid = document.createElement('div');
    toysGrid.className = 'ns-pop-grid';

    this.laserBtn = this.createActionButton(
      'Laser',
      'Toggle laser pointer (Alt)',
      ICONS.laser,
      () => {
        this.dismissHint();
        this.callbacks.onToggleLaser();
      },
      'Alt',
    );
    this.laserBtn.classList.add('is-laser-active');
    this.laserBtn.setAttribute('aria-pressed', 'false');

    const yarnBtn = this.createActionButton('Toss Yarn', 'Toss yarn ball', ICONS.yarn, () => {
      this.dismissHint();
      this.callbacks.onTossYarn();
    });

    const prismBtn = this.createActionButton(
      'Move Prism',
      'Move or center crystal prism',
      ICONS.prism,
      () => {
        this.dismissHint();
        this.callbacks.onCenterPrism();
      },
    );

    this.boxBtn = this.createActionButton('Cardboard Box', 'Toggle cardboard box', ICONS.box, () => {
      this.dismissHint();
      this.callbacks.onToggleBox();
    });
    this.boxBtn.setAttribute('aria-pressed', 'true');

    toysGrid.append(this.laserBtn, yarnBtn, prismBtn, this.boxBtn);
    toysSection.appendChild(toysGrid);

    // 4. Compact Cat Pack Bar + Debug Quick Chip
    const packCard = document.createElement('div');
    packCard.className = 'ns-bento-row-card';

    const packInfo = document.createElement('div');
    packInfo.className = 'ns-bento-row-info';
    const packTitle = document.createElement('span');
    packTitle.className = 'ns-bento-row-title';
    packTitle.textContent = 'Cat Pack';
    const packMeter = document.createElement('div');
    packMeter.className = 'ns-cat-meter-track';
    this.catMeterFill = document.createElement('div');
    this.catMeterFill.className = 'ns-cat-meter-fill';
    packMeter.appendChild(this.catMeterFill);
    packInfo.append(packTitle, packMeter);

    const catStepper = document.createElement('div');
    catStepper.className = 'ns-cat-stepper';
    catStepper.setAttribute('role', 'group');
    catStepper.setAttribute('aria-label', 'Cat pack count');

    this.catMinusBtn = document.createElement('button');
    this.catMinusBtn.type = 'button';
    this.catMinusBtn.className = 'ns-step-pill-btn';
    this.catMinusBtn.setAttribute('aria-label', 'Decrease cat count');
    this.catMinusBtn.appendChild(createSvg(ICONS.minus));
    this.catMinusBtn.addEventListener('click', () => {
      this.dismissHint();
      const next = Math.max(1, this.state.catCount - 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });

    const catReadout = document.createElement('div');
    catReadout.className = 'ns-cat-readout';
    catReadout.appendChild(createSvg(ICONS.catSmall));
    this.catCountEl = document.createElement('span');
    this.catCountEl.setAttribute('aria-live', 'polite');
    this.catCountEl.textContent = String(this.state.catCount);
    catReadout.appendChild(this.catCountEl);

    this.catPlusBtn = document.createElement('button');
    this.catPlusBtn.type = 'button';
    this.catPlusBtn.className = 'ns-step-pill-btn';
    this.catPlusBtn.setAttribute('aria-label', 'Increase cat count');
    this.catPlusBtn.appendChild(createSvg(ICONS.plus));
    this.catPlusBtn.addEventListener('click', () => {
      this.dismissHint();
      const next = Math.min(12, this.state.catCount + 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });

    catStepper.append(this.catMinusBtn, catReadout, this.catPlusBtn);

    this.debugBtn = this.createActionButton(
      'Debug',
      'Toggle debug wireframes (D)',
      ICONS.debug,
      () => {
        this.dismissHint();
        this.callbacks.onToggleDebug();
      },
      'D',
    );
    this.debugBtn.classList.add('ns-debug-compact-btn');
    this.debugBtn.setAttribute('aria-pressed', 'false');

    packCard.append(packInfo, catStepper, this.debugBtn);

    // 5. Desktop Sim (standalone only)
    this.desktopSimSection = this.createSection('Desktop Simulation');
    const simGrid = document.createElement('div');
    simGrid.className = 'ns-pop-grid';

    const newFileBtn = this.createActionButton(
      'New File',
      'Spawn temporary desktop file',
      ICONS.newFile,
      () => {
        this.dismissHint();
        this.callbacks.onNewFile();
      },
    );
    const tidyBtn = this.createActionButton(
      'Tidy Icons',
      'Tidy desktop shortcut icons into neat columns',
      ICONS.tidyIcons,
      () => {
        this.dismissHint();
        this.callbacks.onTidyIcons();
      },
    );
    const emptyBinBtn = this.createActionButton(
      'Empty Bin',
      'Empty recycle bin and startle nearby cats',
      ICONS.emptyBin,
      () => {
        this.dismissHint();
        this.callbacks.onEmptyBin();
      },
    );
    const playIconBtn = this.createActionButton(
      'Play with Icon',
      'Cue an available cat to perch on or scratch a desktop icon',
      ICONS.playIcon,
      () => {
        this.dismissHint();
        this.callbacks.onPlayWithIcon();
      },
    );

    simGrid.append(newFileBtn, tidyBtn, emptyBinBtn, playIconBtn);
    this.desktopSimSection.appendChild(simGrid);

    this.spacePane.append(
      sceneSection,
      lightingSection,
      toysSection,
      packCard,
      this.desktopSimSection,
    );

    // =========================================================================
    // TAB 2: SETTINGS PANE (Modern App Preferences with Pill Switches & Segmented Tracks)
    // =========================================================================
    this.settingsPane = document.createElement('div');
    this.settingsPane.className = 'ns-tab-pane';
    this.settingsPane.hidden = true;

    // Settings Group 1: Simulation & Performance
    const perfSection = this.createSection('Simulation & Performance');

    // Cat Count Card inside Settings
    const settingsCatRow = document.createElement('div');
    settingsCatRow.className = 'ns-setting-row';
    const settingsCatCopy = document.createElement('div');
    settingsCatCopy.className = 'ns-setting-copy';
    const sCatTitle = document.createElement('span');
    sCatTitle.className = 'ns-setting-title';
    sCatTitle.textContent = 'Active Cat Pack';
    const sCatSub = document.createElement('span');
    sCatSub.className = 'ns-setting-sub';
    sCatSub.textContent = 'Number of procedural cats roaming the floor';
    settingsCatCopy.append(sCatTitle, sCatSub);

    const sCatStepper = document.createElement('div');
    sCatStepper.className = 'ns-cat-stepper';
    this.settingsCatMinusBtn = document.createElement('button');
    this.settingsCatMinusBtn.type = 'button';
    this.settingsCatMinusBtn.className = 'ns-step-pill-btn';
    this.settingsCatMinusBtn.setAttribute('aria-label', 'Decrease cat count in settings');
    this.settingsCatMinusBtn.appendChild(createSvg(ICONS.minus));
    this.settingsCatMinusBtn.addEventListener('click', () => {
      const next = Math.max(1, this.state.catCount - 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });

    this.settingsCatCountEl = document.createElement('span');
    this.settingsCatCountEl.className = 'ns-cat-readout';
    this.settingsCatCountEl.textContent = String(this.state.catCount);

    this.settingsCatPlusBtn = document.createElement('button');
    this.settingsCatPlusBtn.type = 'button';
    this.settingsCatPlusBtn.className = 'ns-step-pill-btn';
    this.settingsCatPlusBtn.setAttribute('aria-label', 'Increase cat count in settings');
    this.settingsCatPlusBtn.appendChild(createSvg(ICONS.plus));
    this.settingsCatPlusBtn.addEventListener('click', () => {
      const next = Math.min(12, this.state.catCount + 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });
    sCatStepper.append(this.settingsCatMinusBtn, this.settingsCatCountEl, this.settingsCatPlusBtn);
    settingsCatRow.append(settingsCatCopy, sCatStepper);

    // FPS Target segmented pill bar
    const fpsBlock = document.createElement('div');
    fpsBlock.className = 'ns-setting-block';
    const fpsHead = document.createElement('div');
    fpsHead.className = 'ns-setting-copy';
    const fpsTitle = document.createElement('span');
    fpsTitle.className = 'ns-setting-title';
    fpsTitle.textContent = 'Frame Rate Cap';
    const fpsSub = document.createElement('span');
    fpsSub.className = 'ns-setting-sub';
    fpsSub.textContent = 'Throttle GPU usage while desktop is visible';
    fpsHead.append(fpsTitle, fpsSub);

    const fpsSegs = document.createElement('div');
    fpsSegs.className = 'ns-dock-segments ns-segments-3';
    for (const opt of FPS_OPTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ns-seg-btn';
      b.textContent = opt.label;
      b.setAttribute('aria-label', `Set frame rate cap to ${opt.label}`);
      b.setAttribute('aria-pressed', String((this.state.fpsCap ?? 60) === opt.value));
      b.addEventListener('click', () => {
        this.state.fpsCap = opt.value;
        this. callbacks.onChangeFpsCap?.(opt.value);
        this.syncDom();
      });
      this.fpsButtons.set(opt.value, b);
      fpsSegs.appendChild(b);
    }
    fpsBlock.append(fpsHead, fpsSegs);

    // Idle Nap timeout segmented pill bar
    const napBlock = document.createElement('div');
    napBlock.className = 'ns-setting-block';
    const napHead = document.createElement('div');
    napHead.className = 'ns-setting-copy';
    const napTitle = document.createElement('span');
    napTitle.className = 'ns-setting-title';
    napTitle.textContent = 'Idle Nap Timeout';
    const napSub = document.createElement('span');
    napSub.className = 'ns-setting-sub';
    napSub.textContent = 'Inactivity duration before cats curl up on the center zone';
    napHead.append(napTitle, napSub);

    const napSegs = document.createElement('div');
    napSegs.className = 'ns-dock-segments';
    for (const opt of NAP_OPTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ns-seg-btn';
      b.textContent = opt.label;
      b.setAttribute('aria-label', `Set idle nap timeout to ${opt.label}`);
      b.setAttribute('aria-pressed', String((this.state.idleNapMinutes ?? 5) === opt.value));
      b.addEventListener('click', () => {
        this.state.idleNapMinutes = opt.value;
        this.callbacks.onChangeIdleNapMinutes?.(opt.value);
        this.syncDom();
      });
      this.napButtons.set(opt.value, b);
      napSegs.appendChild(b);
    }
    napBlock.append(napHead, napSegs);

    perfSection.append(settingsCatRow, fpsBlock, napBlock);

    // Settings Group 2: Behavior & Overlays (Modern Pill Switches)
    const behaviorSection = this.createSection('Behavior & Overlays');

    const laserRow = this.createSwitchRow(
      'Laser Pointer Hotkeys',
      'Hold Alt or press Ctrl+Alt+L anywhere',
      this.state.enableLaserHotkey ?? true,
      () => {
        this.state.enableLaserHotkey = !(this.state.enableLaserHotkey ?? true);
        this.callbacks.onToggleLaserHotkey?.();
        this.syncDom();
      },
    );
    this.laserHotkeySwitch = laserRow.switchBtn;

    const shellRow = this.createSwitchRow(
      'Desktop Shell Reactions',
      'Cats stalk new files, scratch shortcuts & react to bin',
      this.state.enableShellReactions ?? true,
      () => {
        this.state.enableShellReactions = !(this.state.enableShellReactions ?? true);
        this.callbacks.onToggleShellReactions?.();
        this.syncDom();
      },
    );
    this.shellReactionsSwitch = shellRow.switchBtn;

    const debugRow = this.createSwitchRow(
      'Debug Collision Wireframes',
      'Show icon AABBs, velocities & state tags (D)',
      this.state.debugMode,
      () => {
        this.callbacks.onToggleDebug();
      },
    );
    this.debugSwitch = debugRow.switchBtn;

    behaviorSection.append(laserRow.rowEl, shellRow.rowEl, debugRow.rowEl);

    this.settingsPane.append(perfSection, behaviorSection);

    this.popover.append(header, this.spacePane, this.settingsPane);
    this.anchor.append(this.tooltipEl, this.fabBtn, this.popover);
    this.root.appendChild(this.anchor);

    this.handleOutsidePointerDown = (e: PointerEvent) => {
      if (!this.popoverOpen) {
        return;
      }
      const target = e.target as Node | null;
      if (target && !this.anchor.contains(target)) {
        this.setPopoverOpen(false);
      }
    };

    this.handleWindowKeyDown = (e: KeyboardEvent) => {
      if (this.popoverOpen && e.key === 'Escape') {
        e.preventDefault();
        this.setPopoverOpen(false);
        this.fabBtn.focus();
      }
    };

    document.addEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.addEventListener('keydown', this.handleWindowKeyDown);

    this.syncDom();
  }

  public setActiveTab(tab: PopoverTab): void {
    if (this.activeTab === tab) {
      return;
    }
    this.activeTab = tab;
    const isSpace = tab === 'space';
    this.tabSpaceBtn.setAttribute('aria-selected', String(isSpace));
    this.tabSettingsBtn.setAttribute('aria-selected', String(!isSpace));
    this.spacePane.hidden = !isSpace;
    this.settingsPane.hidden = isSpace;
  }

  private createSection(label: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'ns-pop-section';
    const heading = document.createElement('div');
    heading.className = 'ns-pop-section-label';
    heading.textContent = label;
    section.appendChild(heading);
    return section;
  }

  private createSwitchRow(
    titleText: string,
    subText: string,
    initialChecked: boolean,
    onToggle: () => void,
  ): { rowEl: HTMLDivElement; switchBtn: HTMLButtonElement } {
    const rowEl = document.createElement('div');
    rowEl.className = 'ns-setting-row';

    const copy = document.createElement('div');
    copy.className = 'ns-setting-copy';
    const title = document.createElement('span');
    title.className = 'ns-setting-title';
    title.textContent = titleText;
    const sub = document.createElement('span');
    sub.className = 'ns-setting-sub';
    sub.textContent = subText;
    copy.append(title, sub);

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'ns-pill-switch';
    switchBtn.setAttribute('role', 'switch');
    switchBtn.setAttribute('aria-label', titleText);
    switchBtn.setAttribute('aria-checked', String(initialChecked));

    const thumb = document.createElement('span');
    thumb.className = 'ns-pill-switch-thumb';
    switchBtn.appendChild(thumb);
    switchBtn.addEventListener('click', onToggle);

    rowEl.append(copy, switchBtn);
    return { rowEl, switchBtn };
  }

  private createActionButton(
    label: string,
    ariaLabel: string,
    iconPaths: readonly string[],
    onClick: () => void,
    shortcut?: string,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ns-dock-btn';
    btn.setAttribute('aria-label', ariaLabel);

    btn.appendChild(createSvg(iconPaths));

    const labelSpan = document.createElement('span');
    labelSpan.className = 'ns-dock-btn-label';
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);

    if (shortcut) {
      const kbd = document.createElement('kbd');
      kbd.className = 'ns-kbd';
      kbd.textContent = shortcut;
      btn.appendChild(kbd);
    }

    btn.addEventListener('click', onClick);
    return btn;
  }

  public setState(partial: Partial<ToyDockState>): void {
    this.state = {
      ...this.state,
      ...partial,
      catCount: Math.max(1, Math.min(12, partial.catCount ?? this.state.catCount)),
    };
    this.syncDom();
  }

  public setPopoverOpen(open: boolean): void {
    if (open && !this.state.visible) {
      return;
    }
    if (this.popoverOpen === open) {
      return;
    }
    this.popoverOpen = open;
    this.fabBtn.setAttribute('aria-expanded', String(open));
    this.popover.setAttribute('aria-hidden', String(!open));

    if (this.popoverCloseTimer !== null) {
      window.clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }

    if (open) {
      this.popover.hidden = false;
      void this.popover.offsetWidth;
      this.popover.classList.add('is-open');
    } else {
      this.popover.classList.remove('is-open');
      this.popoverCloseTimer = window.setTimeout(() => {
        if (!this.popoverOpen) {
          this.popover.hidden = true;
        }
        this.popoverCloseTimer = null;
      }, 190);
    }
  }

  public dismissHint(): void {
    if (this.hintDismissed) {
      return;
    }
    this.hintDismissed = true;
    if (this.hintAutoTimer !== null) {
      window.clearTimeout(this.hintAutoTimer);
      this.hintAutoTimer = null;
    }
    this.tooltipEl.classList.add('is-dismissed');
    if (this.hintHideTimer !== null) {
      window.clearTimeout(this.hintHideTimer);
    }
    this.hintHideTimer = window.setTimeout(() => {
      this.tooltipEl.hidden = true;
      this.hintHideTimer = null;
    }, 220);
  }

  private syncDom(): void {
    const shouldHideAll =
      !this.state.visible || (this.state.nativeHostConnected && !this.state.visible);

    if (shouldHideAll && this.popoverOpen) {
      this.setPopoverOpen(false);
    }

    this.anchor.classList.toggle('is-hidden', shouldHideAll);
    this.anchor.setAttribute('aria-hidden', shouldHideAll ? 'true' : 'false');
    this.fabBadgeDot.setAttribute('data-scene', this.state.sceneTheme);

    if (this.state.nativeHostConnected) {
      this.desktopSimSection.hidden = true;
      this.tooltipEl.hidden = true;
      if (this.hintAutoTimer !== null) {
        window.clearTimeout(this.hintAutoTimer);
        this.hintAutoTimer = null;
      }
    } else {
      this.desktopSimSection.hidden = false;
      if (!this.hintDismissed) {
        this.tooltipEl.hidden = false;
        if (this.hintAutoTimer === null) {
          this.hintAutoTimer = window.setTimeout(() => {
            this.hintAutoTimer = null;
            this.dismissHint();
          }, AUTO_HINT_TIMEOUT_MS);
        }
      }
    }

    for (const [theme, btn] of this.sceneButtons.entries()) {
      btn.setAttribute('aria-pressed', String(theme === this.state.sceneTheme));
    }

    for (const [mode, btn] of this.lightingButtons.entries()) {
      btn.setAttribute('aria-pressed', String(mode === this.state.lightingMode));
    }

    const activeFps = this.state.fpsCap ?? 60;
    for (const [fps, btn] of this.fpsButtons.entries()) {
      btn.setAttribute('aria-pressed', String(fps === activeFps));
    }

    const activeNap = this.state.idleNapMinutes ?? 5;
    for (const [mins, btn] of this.napButtons.entries()) {
      btn.setAttribute('aria-pressed', String(mins === activeNap));
    }

    this.laserBtn.setAttribute('aria-pressed', String(this.state.laserActive));
    this.boxBtn.setAttribute('aria-pressed', String(this.state.boxVisible));
    this.debugBtn.setAttribute('aria-pressed', String(this.state.debugMode));

    this.catCountEl.textContent = String(this.state.catCount);
    this.settingsCatCountEl.textContent = String(this.state.catCount);
    const pct = Math.round(((this.state.catCount - 1) / 11) * 100);
    this.catMeterFill.style.transform = `scaleX(${Math.max(0.08, pct / 100)})`;

    const atMin = this.state.catCount <= 1;
    const atMax = this.state.catCount >= 12;
    this.catMinusBtn.disabled = atMin;
    this.catPlusBtn.disabled = atMax;
    this.settingsCatMinusBtn.disabled = atMin;
    this.settingsCatPlusBtn.disabled = atMax;

    this.laserHotkeySwitch.setAttribute(
      'aria-checked',
      String(this.state.enableLaserHotkey ?? true),
    );
    this.shellReactionsSwitch.setAttribute(
      'aria-checked',
      String(this.state.enableShellReactions ?? true),
    );
    this.debugSwitch.setAttribute('aria-checked', String(this.state.debugMode));
  }

  public destroy(): void {
    if (this.hintHideTimer !== null) {
      window.clearTimeout(this.hintHideTimer);
      this.hintHideTimer = null;
    }
    if (this.hintAutoTimer !== null) {
      window.clearTimeout(this.hintAutoTimer);
      this.hintAutoTimer = null;
    }
    if (this.popoverCloseTimer !== null) {
      window.clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    this.anchor.remove();
  }
}
