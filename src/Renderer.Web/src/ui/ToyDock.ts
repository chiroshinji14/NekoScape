import {
  COLLAR_COLOR_PRESETS,
  MIN_CAT_COUNT,
  SCENE_THEME_LABELS,
  normalizeCatCount,
  type CatBreedMode,
  type LightingMode,
  type SceneTheme,
  type ToyDockCallbacks,
  type ToyDockState,
  type ToyKind,
} from '../types/simulation';

export type { ToyDockCallbacks, ToyDockState } from '../types/simulation';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POPOVER_CLOSE_MS = 190;
const LIGHTWEIGHT_THRESHOLD = 35;

type DockTabId = 'cats' | 'play' | 'world';

const SCENE_OPTIONS: readonly {
  theme: SceneTheme;
  label: string;
  ariaLabel: string;
}[] = [
  { theme: 'study', label: 'Golden Study', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.study}` },
  { theme: 'tatami', label: 'Kyoto Tatami', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.tatami}` },
  { theme: 'garden', label: 'Sunlit Garden', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.garden}` },
  { theme: 'cafe', label: 'Cat Cafe', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.cafe}` },
  { theme: 'living_room', label: 'Living Room', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.living_room}` },
  { theme: 'rainy_window', label: 'Rainy Window', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.rainy_window}` },
  { theme: 'night_balcony', label: 'Night Balcony', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.night_balcony}` },
  { theme: 'kitchen', label: 'Kitchen', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.kitchen}` },
  { theme: 'bedroom', label: 'Bedroom', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.bedroom}` },
  { theme: 'snowy_window', label: 'Snowy Window', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.snowy_window}` },
  { theme: 'sunbeam', label: 'Sunbeam', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.sunbeam}` },
  { theme: 'aquarium', label: 'Aquarium', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.aquarium}` },
  { theme: 'rooftop', label: 'Rooftop', ariaLabel: `Switch scene to ${SCENE_THEME_LABELS.rooftop}` },
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
      'M10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8Z',
      'M10 2.6v1.5',
      'M10 15.9v1.5',
      'M2.6 10h1.5',
      'M15.9 10h1.5',
      'M4.8 4.8l1.1 1.1',
      'M14.1 14.1l1.1 1.1',
      'M15.2 4.8l-1.1 1.1',
      'M5.9 14.1l-1.1 1.1',
    ],
  },
  {
    mode: 'golden',
    label: 'Golden',
    icon: [
      'M3.2 13.6h13.6',
      'M6.2 13.6a3.8 3.8 0 0 1 7.6 0',
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

const BREED_OPTIONS: readonly {
  mode: CatBreedMode;
  label: string;
  fullLabel: string;
  swatch: string;
}[] = [
  { mode: 'mix', label: 'Mix', fullLabel: 'Mix of all 14 breeds', swatch: '#e5a45c' },
  { mode: 'persian', label: 'Persian', fullLabel: 'Persian', swatch: '#e8d8c6' },
  { mode: 'siamese', label: 'Siamese', fullLabel: 'Siamese', swatch: '#c9b296' },
  { mode: 'british_shorthair', label: 'British Shorthair', fullLabel: 'British Shorthair', swatch: '#7e8e9d' },
  { mode: 'munchkin', label: 'Munchkin', fullLabel: 'Munchkin', swatch: '#d69766' },
  { mode: 'sphynx', label: 'Sphynx', fullLabel: 'Sphynx', swatch: '#d8b0a6' },
  { mode: 'domestic_shorthair', label: 'Domestic Shorthair', fullLabel: 'Domestic Shorthair', swatch: '#cf8246' },
  { mode: 'maine_coon', label: 'Maine Coon', fullLabel: 'Maine Coon', swatch: '#9c7150' },
  { mode: 'scottish_fold', label: 'Scottish Fold', fullLabel: 'Scottish Fold', swatch: '#b5ada5' },
  { mode: 'bengal', label: 'Bengal', fullLabel: 'Bengal', swatch: '#d49a4c' },
  { mode: 'ragdoll', label: 'Ragdoll', fullLabel: 'Ragdoll', swatch: '#ebe4da' },
  { mode: 'russian_blue', label: 'Russian Blue', fullLabel: 'Russian Blue', swatch: '#6d8299' },
  { mode: 'abyssinian', label: 'Abyssinian', fullLabel: 'Abyssinian', swatch: '#c47141' },
  { mode: 'american_curl', label: 'American Curl', fullLabel: 'American Curl', swatch: '#c9a68a' },
  { mode: 'japanese_bobtail', label: 'Japanese Bobtail', fullLabel: 'Japanese Bobtail', swatch: '#e39652' },
];

const ICONS = {
  soundOn: [
    'M3.6 8.2h2.7l3.7-3v9.6l-3.7-3H3.6V8.2Z',
    'M13 7.2a4.3 4.3 0 0 1 0 5.6',
    'M15.3 5a7.2 7.2 0 0 1 0 10',
  ],
  soundOff: [
    'M3.6 8.2h2.7l3.7-3v9.6l-3.7-3H3.6V8.2Z',
    'M13.2 7.8l4 4.4',
    'M17.2 7.8l-4 4.4',
  ],
  camera: [
    'M3.4 7.2a1.6 1.6 0 0 1 1.6-1.6h1.7l1.1-1.6h4.4l1.1 1.6H15a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V7.2Z',
    'M10 8.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 1 0 0-5.4Z',
  ],
  close: ['M5.6 5.6l8.8 8.8', 'M14.4 5.6l-8.8 8.8'],
  minus: ['M5.5 10h9'],
  plus: ['M10 5.5v9', 'M5.5 10h9'],
  kitten: [
    'M5.2 13.5V8l2.4 1.8a5.4 5.4 0 0 1 4.8 0L14.8 8v5.5c0 1.6-2.1 2.8-4.8 2.8s-4.8-1.2-4.8-2.8Z',
    'M8.3 12h.01',
    'M11.7 12h.01',
  ],
  bell: [
    'M10 3.6v1.2',
    'M6 10.6a4 4 0 0 1 8 0c0 2 .9 3.2 1.6 3.8H4.4c.7-.6 1.6-1.8 1.6-3.8Z',
    'M8.5 14.4a1.5 1.5 0 0 0 3 0',
  ],
  swatchNone: [
    'M10 4.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 1 0 0-11.6Z',
    'M5.9 14.1l8.2-8.2',
  ],
  mouse: [
    'M6.2 12.2a4.6 3.5 0 0 1 8.8 0c0 1.6-2 2.6-4.4 2.6s-4.4-1-4.4-2.6Z',
    'M13 8.8c1-1.3 2.5-1.2 2.8.2',
    'M6.2 12.6c-1.8.2-2.8-.6-2.8-2',
    'M12.6 11.4h.01',
  ],
  fish: [
    'M16.5 10c-1.8 2.4-4.2 3.4-6.9 3-1.1-.2-2-.8-2.7-1.7L3.8 13V7l3.1 1.7c.7-.9 1.6-1.5 2.7-1.7 2.7-.4 5.1.6 6.9 3Z',
    'M13.2 9.5h.01',
  ],
  treat: [
    'M16.6 10c-1.8 2.6-4.4 3.6-7.2 3.1-1.2-.2-2.1-.9-2.8-1.8L3.4 13.2V6.8l3.2 1.9c.7-.9 1.6-1.6 2.8-1.8 2.8-.5 5.4.5 7.2 3.1Z',
    'M10.4 8.2v3.6',
  ],
  laser: [
    'M3.6 16.4 10.8 9.2',
    'M13.5 6.5a1.9 1.9 0 1 0 0 .01',
    'M13.5 2.6v1.5',
    'M17.4 6.5h-1.5',
    'M16.2 3.8l-1 1',
  ],
  yarn: [
    'M10 3.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 1 0 0-12.8Z',
    'M5.3 6.9c2.5 1.1 6.5 1.1 9.4 0',
    'M4.5 11.4c3.3-.6 7.3.7 10.4 2.2',
    'M14.4 14.5c1.2 1.1 2.3 1.5 3.3 1.2',
  ],
  feather: [
    'M4.4 15.6 15.2 4.8',
    'M9.2 10.8c-.4-2.5 1-4.8 3.6-5.6 1-.3 2-.4 2.6-.2.2.6.1 1.6-.2 2.6-.8 2.6-3.1 4-5.6 3.6',
    'M7.4 12.6l-1.5-2.1',
  ],
  crinkle: [
    'M10 3.5l2.4 2.3 3.3-.6-.6 3.3 2.3 2.4-2.8 1.9.3 3.3-3.3-.7L10 17.5l-1.6-2.1-3.3.7.3-3.3L2.6 10.9l2.3-2.4-.6-3.3 3.3.6L10 3.5Z',
  ],
  spring: [
    'M6.2 5.2c0-1.2 7.6-1.2 7.6 0s-7.6 1.6-7.6 2.8 7.6 1.4 7.6 2.6-7.6 1.4-7.6 2.6 7.6 1.2 7.6 2.4',
  ],
  pingPong: [
    'M10 4a6 6 0 1 0 0 12 6 6 0 1 0 0-12Z',
    'M7.4 7.6c.7-.9 1.7-1.4 2.8-1.5',
  ],
  hairTie: [
    'M10 4.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11Z',
    'M10 7.1a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 1 0 0-5.8Z',
  ],
  bubbles: [
    'M7.4 7.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 1 0 0-6.4Z',
    'M13.6 5.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4Z',
    'M13.2 12.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3Z',
  ],
  cucumber: [
    'M5 13.8c1.1 1.4 3.6 1.2 6.8-1.4 3.2-2.6 4.4-5.2 3.2-6.4-1.1-1.2-3.7-.2-6.8 2.4C5.1 11 3.9 12.4 5 13.8Z',
    'M8.6 10.6h.01',
    'M11.6 8.2h.01',
  ],
  box: [
    'M3.6 7.2 10 4l6.4 3.2v6.5L10 16.8l-6.4-3.1V7.2Z',
    'M3.6 7.2 10 10.4l6.4-3.2',
    'M10 10.4v6.4',
    'M6.8 5.6 13.2 8.8',
  ],
  paperBag: [
    'M5.6 7.2h8.8l1 9.2H4.6l1-9.2Z',
    'M5.6 7.2l1.6-2.4 2.8 1.6 2.8-1.6 1.6 2.4',
    'M8.2 11.4c0 1.3 3.6 1.3 3.6 0',
  ],
  tapedSquare: [
    'M4.8 4.8h10.4v10.4H4.8Z',
    'M4.8 7.6h2.8V4.8',
    'M12.4 15.2v-2.8h2.8',
  ],
  clear: ['M5.4 6.4h9.2', 'M7.4 6.4l.6 8.4h4l.6-8.4', 'M8.4 4.4h3.2'],
  chevronDown: ['M5.8 8l4.2 4.2L14.2 8'],
  statusPill: [
    'M3.6 10a3.8 3.8 0 0 1 3.8-3.8h5.2a3.8 3.8 0 0 1 0 7.6H7.4A3.8 3.8 0 0 1 3.6 10Z',
    'M7.4 10h2.2',
    'M12 10h1.2',
  ],
  props: [
    'M10 3.4l1.5 4.4 4.4 1.5-4.4 1.5L10 15.2l-1.5-4.4-4.4-1.5 4.4-1.5L10 3.4Z',
    'M15.4 4.2v2.2',
    'M14.3 5.3h2.2',
  ],
  debug: [
    'M4.6 4.6h10.8v10.8H4.6Z',
    'M4.6 4.6 15.4 15.4',
    'M15.4 4.6 4.6 15.4',
  ],
  newFile: [
    'M6 3.6h5.4L15 7.2v9.2H6V3.6Z',
    'M11.4 3.6v3.6H15',
    'M10.5 10v3.4',
    'M8.8 11.7h3.4',
  ],
  emptyBin: [
    'M5.2 6.5h9.6',
    'M8 4.2h4',
    'M6.5 6.5l.7 9.4h5.6l.7-9.4',
    'M10 9.5v3.8',
  ],
  tidyIcons: [
    'M4.6 4.6h4.1v4.1H4.6Z',
    'M11.3 4.6h4.1v4.1h-4.1Z',
    'M4.6 11.3h4.1v4.1H4.6Z',
    'M11.3 11.3h4.1v4.1h-4.1Z',
  ],
} as const;

function createSvg(paths: readonly string[], className = 'ns-icon-svg'): SVGSVGElement {
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

function createPawFabSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.65');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ns-fab-svg');

  const pad = document.createElementNS(SVG_NS, 'path');
  pad.setAttribute(
    'd',
    'M12 12.7c-2.5 0-4.4 1.7-4.4 3.7 0 1.35 1.1 2.35 2.4 2.35.8 0 1.4-.35 2-.35s1.2.35 2 .35c1.3 0 2.4-1 2.4-2.35 0-2-1.9-3.7-4.4-3.7Z',
  );
  pad.setAttribute('fill', 'currentColor');
  pad.setAttribute('fill-opacity', '0.16');
  svg.appendChild(pad);

  const toeSpecs: readonly { cx: string; cy: string; rx: string; ry: string; rot: string }[] = [
    { cx: '6.4', cy: '11.2', rx: '1.4', ry: '1.85', rot: '-20 6.4 11.2' },
    { cx: '9.8', cy: '8.1', rx: '1.4', ry: '1.95', rot: '-7 9.8 8.1' },
    { cx: '14.2', cy: '8.1', rx: '1.4', ry: '1.95', rot: '7 14.2 8.1' },
    { cx: '17.6', cy: '11.2', rx: '1.4', ry: '1.85', rot: '20 17.6 11.2' },
  ];

  for (const toe of toeSpecs) {
    const ellipse = document.createElementNS(SVG_NS, 'ellipse');
    ellipse.setAttribute('cx', toe.cx);
    ellipse.setAttribute('cy', toe.cy);
    ellipse.setAttribute('rx', toe.rx);
    ellipse.setAttribute('ry', toe.ry);
    ellipse.setAttribute('transform', `rotate(${toe.rot})`);
    ellipse.setAttribute('fill', 'currentColor');
    ellipse.setAttribute('fill-opacity', '0.16');
    svg.appendChild(ellipse);
  }

  return svg;
}

export class ToyDock {
  private readonly root: HTMLElement;
  private readonly callbacks: ToyDockCallbacks;

  private readonly anchor: HTMLDivElement;
  private readonly fabWrap: HTMLDivElement;
  private readonly fabBtn: HTMLButtonElement;
  private readonly fabTip: HTMLSpanElement;
  private readonly popover: HTMLDivElement;

  // Header controls
  private readonly soundBtn: HTMLButtonElement;
  private readonly photoBtn: HTMLButtonElement;

  // Tabs
  private readonly tabButtons = new Map<DockTabId, HTMLButtonElement>();
  private readonly tabPanels = new Map<DockTabId, HTMLDivElement>();
  private activeTab: DockTabId = 'cats';

  // Tab 1: Cats
  private readonly catMinusBtn: HTMLButtonElement;
  private readonly catPlusBtn: HTMLButtonElement;
  private readonly catCountInput: HTMLInputElement;
  private readonly lightweightHint: HTMLDivElement;
  private readonly breedButtons = new Map<CatBreedMode, HTMLButtonElement>();
  private readonly kittenToggleBtn: HTMLButtonElement;
  private readonly collarButtons = new Map<string, HTMLButtonElement>();
  private readonly bellToggleBtn: HTMLButtonElement;

  // Tab 2: Play
  private readonly laserBtn: HTMLButtonElement;
  private readonly boxBtn: HTMLButtonElement;
  private readonly paperBagBtn: HTMLButtonElement;
  private readonly tapedSquareBtn: HTMLButtonElement;
  private readonly treatCountBadge: HTMLSpanElement;
  private readonly clearToysBtn: HTMLButtonElement;

  // Tab 3: World
  private readonly sceneButtons = new Map<SceneTheme, HTMLButtonElement>();
  private readonly lightingButtons = new Map<LightingMode, HTMLButtonElement>();
  private readonly moreDetails: HTMLDetailsElement;
  private readonly hudSwitch: HTMLButtonElement;
  private readonly propsSwitch: HTMLButtonElement;
  private readonly propsRow: HTMLDivElement;
  private readonly debugSwitch: HTMLButtonElement;
  private readonly desktopToolsSection: HTMLDivElement;

  private state: ToyDockState = {
    sceneTheme: 'study',
    lightingMode: 'golden',
    laserActive: false,
    boxVisible: true,
    catCount: 6,
    breedMode: 'mix',
    kittenMode: false,
    collarColor: null,
    collarBell: true,
    soundEnabled: false,
    soundVolume: 0.45,
    propsVisible: true,
    activeTreatsCount: 0,
    activeToysCount: 0,
    paperBagActive: false,
    tapedSquareActive: false,
    circadianPhase: 'midday',
    hudVisible: false,
    debugMode: false,
    visible: true,
    nativeHostConnected: false,
    fpsCap: 60,
    idleNapMinutes: 5,
    enableLaserHotkey: true,
    enableShellReactions: true,
  };

  private popoverOpen = false;
  private popoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSoundRendered: boolean | null = null;

  private readonly handleOutsidePointerDown: (e: PointerEvent) => void;
  private readonly handleWindowKeyDown: (e: KeyboardEvent) => void;

  constructor(
    root: HTMLElement,
    callbacks: ToyDockCallbacks,
    initialState?: Partial<ToyDockState>,
  ) {
    this.root = root;
    this.callbacks = callbacks;
    if (initialState) {
      this.state = {
        ...this.state,
        ...initialState,
        catCount: normalizeCatCount(initialState.catCount, this.state.catCount),
      };
    }

    const popoverId = 'ns-controls-popover';
    const fabTipId = 'ns-fab-tooltip';

    this.anchor = document.createElement('div');
    this.anchor.className = 'ns-fab-anchor';

    // Collapsed State: Single calm circular warm-glass FAB + hover-only tooltip
    this.fabWrap = document.createElement('div');
    this.fabWrap.className = 'ns-fab-wrap';

    this.fabBtn = document.createElement('button');
    this.fabBtn.type = 'button';
    this.fabBtn.className = 'ns-double-bezel ns-fab-btn';
    this.fabBtn.setAttribute('aria-label', 'Open NekoScape controls');
    this.fabBtn.setAttribute('aria-expanded', 'false');
    this.fabBtn.setAttribute('aria-haspopup', 'dialog');
    this.fabBtn.setAttribute('aria-controls', popoverId);
    this.fabBtn.setAttribute('aria-describedby', fabTipId);

    const fabIconWrap = document.createElement('span');
    fabIconWrap.className = 'ns-fab-icon-wrap';
    fabIconWrap.appendChild(createPawFabSvg());
    this.fabBtn.appendChild(fabIconWrap);

    this.fabBtn.addEventListener('click', () => {
      this.setPopoverOpen(!this.popoverOpen);
    });

    this.fabTip = document.createElement('span');
    this.fabTip.id = fabTipId;
    this.fabTip.className = 'ns-double-bezel ns-fab-tip';
    this.fabTip.setAttribute('role', 'tooltip');
    this.fabTip.textContent = 'Controls';

    this.fabWrap.append(this.fabBtn, this.fabTip);

    // Expanded Popover (~296px wide, 3-tab segmented switcher)
    this.popover = document.createElement('div');
    this.popover.id = popoverId;
    this.popover.className = 'ns-double-bezel ns-dock-popover';
    this.popover.setAttribute('role', 'dialog');
    this.popover.setAttribute('aria-label', 'NekoScape controls');
    this.popover.setAttribute('aria-hidden', 'true');
    this.popover.hidden = true;

    // -------------------------------------------------------------------------
    // HEADER: Title + Sound Toggle + Photo Snapshot + Close
    // -------------------------------------------------------------------------
    const header = document.createElement('div');
    header.className = 'ns-popover-header';

    const title = document.createElement('span');
    title.className = 'ns-popover-title';
    title.textContent = 'NekoScape';

    const headerActions = document.createElement('div');
    headerActions.className = 'ns-header-actions';

    this.soundBtn = document.createElement('button');
    this.soundBtn.type = 'button';
    this.soundBtn.className = 'ns-mini-icon-btn';
    this.soundBtn.setAttribute('aria-label', 'Toggle cat sound effects');
    this.soundBtn.setAttribute('aria-pressed', String(this.state.soundEnabled));
    this.soundBtn.setAttribute('title', 'Toggle sound');
    this.soundBtn.addEventListener('click', () => {
      this.callbacks.onToggleSound?.();
    });

    this.photoBtn = document.createElement('button');
    this.photoBtn.type = 'button';
    this.photoBtn.className = 'ns-mini-icon-btn';
    this.photoBtn.setAttribute('aria-label', 'Take photo snapshot');
    this.photoBtn.setAttribute('title', 'Photo mode snapshot');
    this.photoBtn.appendChild(createSvg(ICONS.camera, 'ns-mini-svg'));
    this.photoBtn.addEventListener('click', () => {
      this.callbacks.onTakePhoto?.();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ns-mini-icon-btn';
    closeBtn.setAttribute('aria-label', 'Close controls');
    closeBtn.setAttribute('title', 'Close');
    closeBtn.appendChild(createSvg(ICONS.close, 'ns-mini-svg'));
    closeBtn.addEventListener('click', () => {
      this.setPopoverOpen(false);
      this.fabBtn.focus();
    });

    headerActions.append(this.soundBtn, this.photoBtn, closeBtn);
    header.append(title, headerActions);

    // -------------------------------------------------------------------------
    // 3-TAB SEGMENTED SWITCHER: Cats | Play | World
    // -------------------------------------------------------------------------
    const tabList = document.createElement('div');
    tabList.className = 'ns-tab-track';
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Control sections');

    const tabOrder: readonly { id: DockTabId; label: string }[] = [
      { id: 'cats', label: 'Cats' },
      { id: 'play', label: 'Play' },
      { id: 'world', label: 'World' },
    ];

    for (let i = 0; i < tabOrder.length; i++) {
      const tabSpec = tabOrder[i];
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.id = `ns-tab-${tabSpec.id}`;
      tabBtn.className = 'ns-tab-btn';
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('aria-controls', `ns-panel-${tabSpec.id}`);
      tabBtn.setAttribute('aria-selected', String(tabSpec.id === this.activeTab));
      tabBtn.setAttribute('tabindex', tabSpec.id === this.activeTab ? '0' : '-1');
      tabBtn.textContent = tabSpec.label;

      tabBtn.addEventListener('click', () => {
        this.setActiveTab(tabSpec.id);
      });
      tabBtn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          const nextIdx = (i + dir + tabOrder.length) % tabOrder.length;
          const nextId = tabOrder[nextIdx].id;
          this.setActiveTab(nextId);
          this.tabButtons.get(nextId)?.focus();
        }
      });

      this.tabButtons.set(tabSpec.id, tabBtn);
      tabList.appendChild(tabBtn);
    }

    // -------------------------------------------------------------------------
    // TAB 1: CATS (Unlimited Count, 14 Breeds + Mix, Kitten / Collars / Bell)
    // -------------------------------------------------------------------------
    const catsPanel = this.createTabPanel('cats');

    const countSection = document.createElement('section');
    countSection.className = 'ns-group';
    countSection.setAttribute('aria-label', 'Cat count');

    const catsHead = document.createElement('div');
    catsHead.className = 'ns-group-head';

    const catsLabel = document.createElement('label');
    catsLabel.className = 'ns-group-label';
    catsLabel.htmlFor = 'ns-cat-count-input';
    catsLabel.textContent = 'Cat Count';

    const stepper = document.createElement('div');
    stepper.className = 'ns-stepper';
    stepper.setAttribute('role', 'group');
    stepper.setAttribute('aria-label', 'Adjust cat count');

    this.catMinusBtn = document.createElement('button');
    this.catMinusBtn.type = 'button';
    this.catMinusBtn.className = 'ns-stepper-btn';
    this.catMinusBtn.setAttribute('aria-label', 'Decrease cat count');
    this.catMinusBtn.appendChild(createSvg(ICONS.minus, 'ns-stepper-svg'));
    this.catMinusBtn.addEventListener('click', () => {
      const next = Math.max(MIN_CAT_COUNT, this.state.catCount - 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });

    this.catCountInput = document.createElement('input');
    this.catCountInput.id = 'ns-cat-count-input';
    this.catCountInput.type = 'number';
    this.catCountInput.min = String(MIN_CAT_COUNT);
    this.catCountInput.step = '1';
    this.catCountInput.inputMode = 'numeric';
    this.catCountInput.className = 'ns-stepper-input';
    this.catCountInput.setAttribute('aria-label', 'Cat count');
    this.catCountInput.value = String(this.state.catCount);

    const commitInputValue = (): void => {
      const parsed = Number.parseInt(this.catCountInput.value, 10);
      if (!Number.isFinite(parsed)) {
        this.catCountInput.value = String(this.state.catCount);
        return;
      }
      const next = normalizeCatCount(parsed, this.state.catCount);
      this.catCountInput.value = String(next);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    };

    this.catCountInput.addEventListener('change', commitInputValue);
    this.catCountInput.addEventListener('blur', commitInputValue);
    this.catCountInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInputValue();
        this.catCountInput.blur();
      }
    });

    this.catPlusBtn = document.createElement('button');
    this.catPlusBtn.type = 'button';
    this.catPlusBtn.className = 'ns-stepper-btn';
    this.catPlusBtn.setAttribute('aria-label', 'Increase cat count');
    this.catPlusBtn.appendChild(createSvg(ICONS.plus, 'ns-stepper-svg'));
    this.catPlusBtn.addEventListener('click', () => {
      this.callbacks.onChangeCatCount(this.state.catCount + 1);
    });

    stepper.append(this.catMinusBtn, this.catCountInput, this.catPlusBtn);
    catsHead.append(catsLabel, stepper);

    // Quick-add chips (+1, +5, +10)
    const quickRow = document.createElement('div');
    quickRow.className = 'ns-quick-add-row';
    quickRow.setAttribute('role', 'group');
    quickRow.setAttribute('aria-label', 'Quick add cats');

    const quickLabel = document.createElement('span');
    quickLabel.className = 'ns-quick-add-label';
    quickLabel.textContent = 'Quick add';

    const quickChips = document.createElement('div');
    quickChips.className = 'ns-quick-add-chips';

    for (const delta of [1, 5, 10] as const) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ns-quick-chip';
      chip.textContent = `+${delta}`;
      chip.setAttribute('aria-label', `Add ${delta} ${delta === 1 ? 'cat' : 'cats'}`);
      chip.addEventListener('click', () => {
        this.callbacks.onChangeCatCount(this.state.catCount + delta);
      });
      quickChips.appendChild(chip);
    }

    quickRow.append(quickLabel, quickChips);

    this.lightweightHint = document.createElement('div');
    this.lightweightHint.className = 'ns-lightweight-caption';
    this.lightweightHint.textContent = 'High count — lightweight mode active';
    this.lightweightHint.hidden = this.state.catCount < LIGHTWEIGHT_THRESHOLD;

    countSection.append(catsHead, quickRow, this.lightweightHint);

    // Breed Picker (Mix + 14 Breeds)
    const breedSection = document.createElement('section');
    breedSection.className = 'ns-group';
    breedSection.setAttribute('aria-label', 'Cat breed');

    const breedLabel = document.createElement('div');
    breedLabel.className = 'ns-group-label';
    breedLabel.textContent = 'Breed';

    const breedGrid = document.createElement('div');
    breedGrid.className = 'ns-breed-scroll-grid';
    breedGrid.setAttribute('role', 'group');
    breedGrid.setAttribute('aria-label', 'Cat breeds');

    for (const option of BREED_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = option.mode === 'mix' ? 'ns-breed-pill is-mix-pill' : 'ns-breed-pill';
      btn.setAttribute('aria-label', `Breed: ${option.fullLabel}`);
      btn.setAttribute('aria-pressed', String(option.mode === this.state.breedMode));

      const dot = document.createElement('span');
      dot.className = 'ns-breed-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.backgroundColor = option.swatch;

      const text = document.createElement('span');
      text.className = 'ns-breed-name';
      text.textContent = option.label;

      btn.append(dot, text);
      btn.addEventListener('click', () => {
        this.callbacks.onSelectBreedMode(option.mode);
      });

      this.breedButtons.set(option.mode, btn);
      breedGrid.appendChild(btn);
    }

    breedSection.append(breedLabel, breedGrid);

    // Customization Row (Kitten Mode + Collar Swatches + Bell)
    const customSection = document.createElement('section');
    customSection.className = 'ns-group';
    customSection.setAttribute('aria-label', 'Cat appearance');

    const customLabel = document.createElement('div');
    customLabel.className = 'ns-group-label';
    customLabel.textContent = 'Style';

    const customRow = document.createElement('div');
    customRow.className = 'ns-custom-row';

    this.kittenToggleBtn = document.createElement('button');
    this.kittenToggleBtn.type = 'button';
    this.kittenToggleBtn.className = 'ns-pill-toggle';
    this.kittenToggleBtn.setAttribute('aria-label', 'Toggle Kitten Mode');
    this.kittenToggleBtn.setAttribute('aria-pressed', String(this.state.kittenMode));
    this.kittenToggleBtn.appendChild(createSvg(ICONS.kitten, 'ns-pill-toggle-svg'));
    const kittenText = document.createElement('span');
    kittenText.textContent = 'Kitten';
    this.kittenToggleBtn.appendChild(kittenText);
    this.kittenToggleBtn.addEventListener('click', () => {
      this.callbacks.onToggleKittenMode?.();
    });

    const collarGroup = document.createElement('div');
    collarGroup.className = 'ns-collar-swatches';
    collarGroup.setAttribute('role', 'group');
    collarGroup.setAttribute('aria-label', 'Collar color');

    for (const preset of COLLAR_COLOR_PRESETS) {
      const swatchBtn = document.createElement('button');
      swatchBtn.type = 'button';
      swatchBtn.className = preset.color === null ? 'ns-swatch-btn is-none' : 'ns-swatch-btn';
      swatchBtn.setAttribute('aria-label', `Collar color: ${preset.label}`);
      swatchBtn.setAttribute('title', preset.label);
      swatchBtn.setAttribute('aria-pressed', String(this.isCollarMatch(preset.color)));

      if (preset.color === null) {
        swatchBtn.appendChild(createSvg(ICONS.swatchNone, 'ns-swatch-none-svg'));
      } else {
        const dot = document.createElement('span');
        dot.className = 'ns-swatch-dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.style.backgroundColor = preset.color;
        swatchBtn.appendChild(dot);
      }

      swatchBtn.addEventListener('click', () => {
        this.callbacks.onSelectCollarColor?.(preset.color);
      });

      this.collarButtons.set(preset.id, swatchBtn);
      collarGroup.appendChild(swatchBtn);
    }

    this.bellToggleBtn = document.createElement('button');
    this.bellToggleBtn.type = 'button';
    this.bellToggleBtn.className = 'ns-pill-toggle';
    this.bellToggleBtn.setAttribute('aria-label', 'Toggle collar bell');
    this.bellToggleBtn.setAttribute('aria-pressed', String(this.state.collarBell));
    this.bellToggleBtn.appendChild(createSvg(ICONS.bell, 'ns-pill-toggle-svg'));
    const bellText = document.createElement('span');
    bellText.textContent = 'Bell';
    this.bellToggleBtn.appendChild(bellText);
    this.bellToggleBtn.addEventListener('click', () => {
      this.callbacks.onToggleCollarBell?.();
    });

    customRow.append(this.kittenToggleBtn, collarGroup, this.bellToggleBtn);
    customSection.append(customLabel, customRow);

    catsPanel.append(countSection, breedSection, customSection);

    // -------------------------------------------------------------------------
    // TAB 2: PLAY (3-Column Icon+Label Toy Grid + Clear Toys)
    // -------------------------------------------------------------------------
    const playPanel = this.createTabPanel('play');

    const playGrid = document.createElement('div');
    playGrid.className = 'ns-play-grid';

    const dropToy = (kind: ToyKind): void => {
      this.callbacks.onDropToy?.(kind);
    };

    const mouseBtn = this.createPlayTile('Mouse', 'Drop catnip mouse toy', ICONS.mouse, () => {
      dropToy('mouse_toy');
    });
    const fishBtn = this.createPlayTile('Fish', 'Drop flopping fish toy', ICONS.fish, () => {
      dropToy('fish_toy');
    });
    const treatBtn = this.createPlayTile('Treat', 'Drop tasty treat for cats', ICONS.treat, () => {
      this.callbacks.onDropTreat();
    });
    treatBtn.classList.add('is-treat-tile');

    this.treatCountBadge = document.createElement('span');
    this.treatCountBadge.className = 'ns-tile-badge';
    this.treatCountBadge.setAttribute('aria-hidden', 'true');
    this.treatCountBadge.hidden = true;
    treatBtn.appendChild(this.treatCountBadge);

    this.laserBtn = this.createPlayTile('Laser', 'Toggle laser pointer', ICONS.laser, () => {
      this.callbacks.onToggleLaser();
    });
    this.laserBtn.classList.add('is-laser-tile');
    this.laserBtn.setAttribute('aria-pressed', String(this.state.laserActive));

    const yarnBtn = this.createPlayTile('Yarn', 'Toss yarn ball', ICONS.yarn, () => {
      this.callbacks.onTossYarn();
    });
    const featherBtn = this.createPlayTile('Feather', 'Drop feather wand', ICONS.feather, () => {
      dropToy('feather_wand');
    });
    const crinkleBtn = this.createPlayTile('Crinkle', 'Drop crinkle ball', ICONS.crinkle, () => {
      dropToy('crinkle_ball');
    });
    const springBtn = this.createPlayTile('Spring', 'Drop spring toy', ICONS.spring, () => {
      dropToy('spring_toy');
    });
    const pingPongBtn = this.createPlayTile('Ping-Pong', 'Drop ping-pong ball', ICONS.pingPong, () => {
      dropToy('ping_pong');
    });
    const hairTieBtn = this.createPlayTile('Hair Tie', 'Drop hair tie', ICONS.hairTie, () => {
      dropToy('hair_tie');
    });
    const bubblesBtn = this.createPlayTile('Bubbles', 'Blow soap bubbles', ICONS.bubbles, () => {
      dropToy('bubbles');
    });
    const cucumberBtn = this.createPlayTile('Cucumber', 'Drop sneaky cucumber', ICONS.cucumber, () => {
      dropToy('cucumber');
    });

    this.boxBtn = this.createPlayTile('Box', 'Toggle cardboard box', ICONS.box, () => {
      this.callbacks.onToggleBox();
    });
    this.boxBtn.setAttribute('aria-pressed', String(this.state.boxVisible));

    this.paperBagBtn = this.createPlayTile('Paper Bag', 'Toggle paper bag', ICONS.paperBag, () => {
      dropToy('paper_bag');
    });
    this.paperBagBtn.setAttribute('aria-pressed', String(Boolean(this.state.paperBagActive)));

    this.tapedSquareBtn = this.createPlayTile('Tape Sq.', 'Toggle taped floor square', ICONS.tapedSquare, () => {
      dropToy('taped_square');
    });
    this.tapedSquareBtn.setAttribute('aria-pressed', String(Boolean(this.state.tapedSquareActive)));

    playGrid.append(
      mouseBtn,
      fishBtn,
      treatBtn,
      this.laserBtn,
      yarnBtn,
      featherBtn,
      crinkleBtn,
      springBtn,
      pingPongBtn,
      hairTieBtn,
      bubblesBtn,
      cucumberBtn,
      this.boxBtn,
      this.paperBagBtn,
      this.tapedSquareBtn,
    );

    const playFooter = document.createElement('div');
    playFooter.className = 'ns-play-footer';

    this.clearToysBtn = document.createElement('button');
    this.clearToysBtn.type = 'button';
    this.clearToysBtn.className = 'ns-clear-toys-btn';
    this.clearToysBtn.setAttribute('aria-label', 'Clear all dropped toys');
    this.clearToysBtn.appendChild(createSvg(ICONS.clear, 'ns-clear-svg'));
    const clearLabel = document.createElement('span');
    clearLabel.textContent = 'Clear Toys';
    this.clearToysBtn.appendChild(clearLabel);
    this.clearToysBtn.addEventListener('click', () => {
      this.callbacks.onClearToys?.();
    });

    playFooter.appendChild(this.clearToysBtn);
    playPanel.append(playGrid, playFooter);

    // -------------------------------------------------------------------------
    // TAB 3: WORLD (13 Scenes, Lighting 4-Icon Track, More Disclosure)
    // -------------------------------------------------------------------------
    const worldPanel = this.createTabPanel('world');

    const sceneSection = document.createElement('section');
    sceneSection.className = 'ns-group';
    sceneSection.setAttribute('aria-label', 'Scene');

    const sceneLabel = document.createElement('div');
    sceneLabel.className = 'ns-group-label';
    sceneLabel.textContent = 'Scene';

    const sceneGrid = document.createElement('div');
    sceneGrid.className = 'ns-scene-scroll-grid';
    sceneGrid.setAttribute('role', 'group');
    sceneGrid.setAttribute('aria-label', 'Scene theme');

    for (const option of SCENE_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ns-scene-pill';
      btn.setAttribute('aria-label', option.ariaLabel);
      btn.setAttribute('aria-pressed', String(option.theme === this.state.sceneTheme));

      const dot = document.createElement('span');
      dot.className = 'ns-scene-swatch';
      dot.setAttribute('data-scene', option.theme);
      dot.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'ns-scene-name';
      text.textContent = option.label;

      btn.append(dot, text);
      btn.addEventListener('click', () => {
        this.callbacks.onSelectScene(option.theme);
      });
      this.sceneButtons.set(option.theme, btn);
      sceneGrid.appendChild(btn);
    }

    sceneSection.append(sceneLabel, sceneGrid);

    const lightSection = document.createElement('section');
    lightSection.className = 'ns-group';
    lightSection.setAttribute('aria-label', 'Lighting');

    const lightLabel = document.createElement('div');
    lightLabel.className = 'ns-group-label';
    lightLabel.textContent = 'Lighting';

    const lightTrack = document.createElement('div');
    lightTrack.className = 'ns-seg-track ns-light-track';
    lightTrack.setAttribute('role', 'group');
    lightTrack.setAttribute('aria-label', 'Lighting mode');

    for (const option of LIGHTING_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ns-seg-btn ns-light-btn';
      btn.setAttribute('aria-label', `Set lighting to ${option.label}`);
      btn.setAttribute('title', option.label);
      btn.setAttribute('aria-pressed', String(option.mode === this.state.lightingMode));
      btn.appendChild(createSvg(option.icon, 'ns-seg-svg'));
      btn.addEventListener('click', () => {
        this.callbacks.onSelectLighting(option.mode);
      });
      this.lightingButtons.set(option.mode, btn);
      lightTrack.appendChild(btn);
    }

    lightSection.append(lightLabel, lightTrack);

    // Collapsed More Disclosure
    this.moreDetails = document.createElement('details');
    this.moreDetails.className = 'ns-more-disclosure';

    const moreSummary = document.createElement('summary');
    moreSummary.className = 'ns-more-summary';
    const moreLabel = document.createElement('span');
    moreLabel.textContent = 'More';
    moreSummary.append(moreLabel, createSvg(ICONS.chevronDown, 'ns-more-chevron'));

    const moreBody = document.createElement('div');
    moreBody.className = 'ns-more-body';

    const hudRow = this.createToggleRow(
      'Status Pill',
      ICONS.statusPill,
      this.state.hudVisible,
      () => this.callbacks.onToggleHud(),
    );
    this.hudSwitch = hudRow.switchBtn;

    const propsToggle = this.createToggleRow(
      'Scene Props',
      ICONS.props,
      this.state.propsVisible,
      () => this.callbacks.onToggleProps?.(),
    );
    this.propsRow = propsToggle.rowEl;
    this.propsSwitch = propsToggle.switchBtn;
    if (!this.callbacks.onToggleProps) {
      this.propsRow.hidden = true;
    }

    const debugRow = this.createToggleRow(
      'Debug Overlay',
      ICONS.debug,
      this.state.debugMode,
      () => this.callbacks.onToggleDebug(),
    );
    this.debugSwitch = debugRow.switchBtn;

    // Standalone Browser Preview Only (hidden in native Win32 host)
    this.desktopToolsSection = document.createElement('div');
    this.desktopToolsSection.className = 'ns-desktop-tools';

    const toolsGrid = document.createElement('div');
    toolsGrid.className = 'ns-desktop-tools-grid';
    toolsGrid.setAttribute('role', 'group');
    toolsGrid.setAttribute('aria-label', 'Preview desktop tools');

    const newFileBtn = this.createCompactToolBtn(
      'New File',
      'Spawn temporary preview desktop file',
      ICONS.newFile,
      () => this.callbacks.onNewFile(),
    );
    const emptyBinBtn = this.createCompactToolBtn(
      'Empty Bin',
      'Empty recycle bin',
      ICONS.emptyBin,
      () => this.callbacks.onEmptyBin(),
    );
    const tidyBtn = this.createCompactToolBtn(
      'Tidy',
      'Tidy preview desktop icons',
      ICONS.tidyIcons,
      () => this.callbacks.onTidyIcons(),
    );

    toolsGrid.append(newFileBtn, emptyBinBtn, tidyBtn);
    this.desktopToolsSection.appendChild(toolsGrid);

    moreBody.append(
      hudRow.rowEl,
      this.propsRow,
      debugRow.rowEl,
      this.desktopToolsSection,
    );
    this.moreDetails.append(moreSummary, moreBody);

    worldPanel.append(sceneSection, lightSection, this.moreDetails);

    this.popover.append(header, tabList, catsPanel, playPanel, worldPanel);
    this.anchor.append(this.popover, this.fabWrap);
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

    this.setActiveTab(this.activeTab);
    this.syncDom();
  }

  private createTabPanel(id: DockTabId): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = `ns-panel-${id}`;
    panel.className = 'ns-tab-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `ns-tab-${id}`);
    this.tabPanels.set(id, panel);
    return panel;
  }

  private setActiveTab(tabId: DockTabId): void {
    this.activeTab = tabId;
    for (const [id, btn] of this.tabButtons.entries()) {
      const selected = id === tabId;
      btn.setAttribute('aria-selected', String(selected));
      btn.setAttribute('tabindex', selected ? '0' : '-1');
    }
    for (const [id, panel] of this.tabPanels.entries()) {
      panel.hidden = id !== tabId;
    }
  }

  private isCollarMatch(presetColor: string | null): boolean {
    if (presetColor === null) {
      return this.state.collarColor === null || this.state.collarColor === '';
    }
    if (!this.state.collarColor) {
      return false;
    }
    return this.state.collarColor.toLowerCase() === presetColor.toLowerCase();
  }

  private createPlayTile(
    label: string,
    ariaLabel: string,
    iconPaths: readonly string[],
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ns-play-tile';
    btn.setAttribute('aria-label', ariaLabel);

    btn.appendChild(createSvg(iconPaths, 'ns-play-svg'));

    const text = document.createElement('span');
    text.className = 'ns-play-label';
    text.textContent = label;
    btn.appendChild(text);

    btn.addEventListener('click', onClick);
    return btn;
  }

  private createToggleRow(
    label: string,
    iconPaths: readonly string[],
    initialChecked: boolean,
    onToggle: () => void,
  ): { rowEl: HTMLDivElement; switchBtn: HTMLButtonElement } {
    const rowEl = document.createElement('div');
    rowEl.className = 'ns-more-row';

    const left = document.createElement('span');
    left.className = 'ns-more-row-label';
    left.append(createSvg(iconPaths, 'ns-more-row-svg'), document.createTextNode(label));

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'ns-pill-switch';
    switchBtn.setAttribute('role', 'switch');
    switchBtn.setAttribute('aria-label', label);
    switchBtn.setAttribute('aria-checked', String(initialChecked));

    const thumb = document.createElement('span');
    thumb.className = 'ns-pill-switch-thumb';
    switchBtn.appendChild(thumb);
    switchBtn.addEventListener('click', onToggle);

    rowEl.append(left, switchBtn);
    return { rowEl, switchBtn };
  }

  private createCompactToolBtn(
    label: string,
    ariaLabel: string,
    iconPaths: readonly string[],
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ns-tool-chip';
    btn.setAttribute('aria-label', ariaLabel);
    btn.appendChild(createSvg(iconPaths, 'ns-tool-svg'));

    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);

    btn.addEventListener('click', onClick);
    return btn;
  }

  public setState(partial: Partial<ToyDockState>): void {
    this.state = {
      ...this.state,
      ...partial,
      catCount: normalizeCatCount(partial.catCount, this.state.catCount),
    };
    this.syncDom();
  }

  public isPopoverOpen(): boolean {
    return this.popoverOpen;
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
    this.fabBtn.setAttribute(
      'aria-label',
      open ? 'Close NekoScape controls' : 'Open NekoScape controls',
    );
    this.popover.setAttribute('aria-hidden', String(!open));

    if (this.popoverCloseTimer !== null) {
      clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }

    if (open) {
      this.popover.hidden = false;
      void this.popover.offsetWidth;
      this.popover.classList.add('is-open');
    } else {
      this.popover.classList.remove('is-open');
      this.popoverCloseTimer = setTimeout(() => {
        if (!this.popoverOpen) {
          this.popover.hidden = true;
        }
        this.popoverCloseTimer = null;
      }, POPOVER_CLOSE_MS);
    }
  }

  /**
   * Preserved as a safe no-op for callers that previously dismissed a persistent hint pill.
   * Collapsed state is strictly a single uncluttered circular FAB.
   */
  public dismissHint(): void {
    // Intentionally empty.
  }

  private syncDom(): void {
    const shouldHideAll = !this.state.visible;

    if (shouldHideAll && this.popoverOpen) {
      this.setPopoverOpen(false);
    }

    this.anchor.classList.toggle('is-hidden', shouldHideAll);
    this.anchor.setAttribute('aria-hidden', shouldHideAll ? 'true' : 'false');

    // Never expose standalone mock-desktop actions when connected to native Win32 host
    this.desktopToolsSection.hidden = this.state.nativeHostConnected;

    // Header sound icon
    const soundOn = Boolean(this.state.soundEnabled);
    this.soundBtn.setAttribute('aria-pressed', String(soundOn));
    this.soundBtn.setAttribute('aria-label', soundOn ? 'Mute cat sound effects' : 'Enable cat sound effects');
    if (this.lastSoundRendered !== soundOn) {
      this.lastSoundRendered = soundOn;
      this.soundBtn.innerHTML = '';
      this.soundBtn.appendChild(createSvg(soundOn ? ICONS.soundOn : ICONS.soundOff, 'ns-mini-svg'));
    }

    // Tab 1: Cats
    if (document.activeElement !== this.catCountInput) {
      this.catCountInput.value = String(this.state.catCount);
    }
    this.catMinusBtn.disabled = this.state.catCount <= MIN_CAT_COUNT;
    this.lightweightHint.hidden = this.state.catCount < LIGHTWEIGHT_THRESHOLD;

    for (const [breedMode, btn] of this.breedButtons.entries()) {
      btn.setAttribute('aria-pressed', String(breedMode === this.state.breedMode));
    }

    this.kittenToggleBtn.setAttribute('aria-pressed', String(Boolean(this.state.kittenMode)));
    this.bellToggleBtn.setAttribute('aria-pressed', String(Boolean(this.state.collarBell)));
    for (const preset of COLLAR_COLOR_PRESETS) {
      const btn = this.collarButtons.get(preset.id);
      if (btn) {
        btn.setAttribute('aria-pressed', String(this.isCollarMatch(preset.color)));
      }
    }

    // Tab 2: Play
    this.laserBtn.setAttribute('aria-pressed', String(this.state.laserActive));
    this.boxBtn.setAttribute('aria-pressed', String(this.state.boxVisible));
    this.paperBagBtn.setAttribute('aria-pressed', String(Boolean(this.state.paperBagActive)));
    this.tapedSquareBtn.setAttribute('aria-pressed', String(Boolean(this.state.tapedSquareActive)));

    const treats = Math.max(0, Math.round(this.state.activeTreatsCount ?? 0));
    this.treatCountBadge.hidden = treats <= 0;
    if (treats > 0) {
      this.treatCountBadge.textContent = String(treats);
    }

    const toysCount = Math.max(0, Math.round(this.state.activeToysCount ?? 0));
    const clearTextEl = this.clearToysBtn.querySelector('span');
    if (clearTextEl) {
      clearTextEl.textContent = toysCount > 0 ? `Clear Toys (${toysCount})` : 'Clear Toys';
    }

    // Tab 3: World
    for (const [theme, btn] of this.sceneButtons.entries()) {
      btn.setAttribute('aria-pressed', String(theme === this.state.sceneTheme));
    }

    for (const [mode, btn] of this.lightingButtons.entries()) {
      btn.setAttribute('aria-pressed', String(mode === this.state.lightingMode));
    }

    this.hudSwitch.setAttribute('aria-checked', String(this.state.hudVisible));
    this.propsSwitch.setAttribute('aria-checked', String(this.state.propsVisible));
    this.debugSwitch.setAttribute('aria-checked', String(this.state.debugMode));
  }

  public destroy(): void {
    if (this.popoverCloseTimer !== null) {
      clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    this.anchor.remove();
  }
}
