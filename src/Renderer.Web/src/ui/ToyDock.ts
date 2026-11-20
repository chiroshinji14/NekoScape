import type {
  CatBreedMode,
  LightingMode,
  SceneTheme,
  ToyDockCallbacks,
  ToyDockState,
} from '../types/simulation';

export type { ToyDockCallbacks, ToyDockState } from '../types/simulation';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POPOVER_CLOSE_MS = 190;

const SCENE_OPTIONS: readonly {
  theme: SceneTheme;
  label: string;
  ariaLabel: string;
}[] = [
  { theme: 'study', label: 'Study', ariaLabel: 'Switch scene to Study' },
  { theme: 'tatami', label: 'Tatami', ariaLabel: 'Switch scene to Tatami' },
  { theme: 'garden', label: 'Garden', ariaLabel: 'Switch scene to Garden' },
  { theme: 'cafe', label: 'Cafe', ariaLabel: 'Switch scene to Cafe' },
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
}[] = [
  { mode: 'mix', label: 'Mix', fullLabel: 'Mix of all 6 breeds' },
  { mode: 'persian', label: 'Persian', fullLabel: 'Persian' },
  { mode: 'siamese', label: 'Siamese', fullLabel: 'Siamese' },
  { mode: 'british_shorthair', label: 'British', fullLabel: 'British Shorthair' },
  { mode: 'munchkin', label: 'Munchkin', fullLabel: 'Munchkin' },
  { mode: 'sphynx', label: 'Sphynx', fullLabel: 'Sphynx' },
  { mode: 'domestic_shorthair', label: 'Domestic', fullLabel: 'Domestic Shorthair' },
];

const ICONS = {
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
  box: [
    'M3.6 7.2 10 4l6.4 3.2v6.5L10 16.8l-6.4-3.1V7.2Z',
    'M3.6 7.2 10 10.4l6.4-3.2',
    'M10 10.4v6.4',
    'M6.8 5.6 13.2 8.8',
  ],
  treat: [
    'M17 10c-1.9 2.7-4.6 3.8-7.6 3.3-1.2-.2-2.2-.9-2.9-1.9L3.3 13.4V6.6l3.2 2c.7-1 1.7-1.7 2.9-1.9 3-.5 5.7.6 7.6 3.3Z',
    'M13.6 9.4h.01',
  ],
  minus: ['M5.5 10h9'],
  plus: ['M10 5.5v9', 'M5.5 10h9'],
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

  private readonly sceneButtons = new Map<SceneTheme, HTMLButtonElement>();
  private readonly lightingButtons = new Map<LightingMode, HTMLButtonElement>();
  private readonly breedButtons = new Map<CatBreedMode, HTMLButtonElement>();

  private readonly catMinusBtn: HTMLButtonElement;
  private readonly catPlusBtn: HTMLButtonElement;
  private readonly catCountEl: HTMLSpanElement;

  private readonly laserBtn: HTMLButtonElement;
  private readonly boxBtn: HTMLButtonElement;
  private readonly treatCountBadge: HTMLSpanElement;

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
    propsVisible: true,
    activeTreatsCount: 0,
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
        catCount: Math.max(1, Math.min(12, initialState.catCount ?? this.state.catCount)),
      };
    }

    const popoverId = 'ns-controls-popover';
    const fabTipId = 'ns-fab-tooltip';

    this.anchor = document.createElement('div');
    this.anchor.className = 'ns-fab-anchor';

    // Collapsed State: Single calm circular warm-glass FAB + quiet hover-only tooltip
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

    // Expanded Popover (~272px wide max, 3 calm groups + collapsed More footer)
    this.popover = document.createElement('div');
    this.popover.id = popoverId;
    this.popover.className = 'ns-double-bezel ns-dock-popover';
    this.popover.setAttribute('role', 'dialog');
    this.popover.setAttribute('aria-label', 'NekoScape controls');
    this.popover.setAttribute('aria-hidden', 'true');
    this.popover.hidden = true;

    // -------------------------------------------------------------------------
    // GROUP 1: WORLD (Scene 4-pill track + Light 4-icon track)
    // -------------------------------------------------------------------------
    const worldGroup = document.createElement('section');
    worldGroup.className = 'ns-group';
    worldGroup.setAttribute('aria-label', 'World');

    const worldLabel = document.createElement('div');
    worldLabel.className = 'ns-group-label';
    worldLabel.textContent = 'World';

    const sceneTrack = document.createElement('div');
    sceneTrack.className = 'ns-seg-track';
    sceneTrack.setAttribute('role', 'group');
    sceneTrack.setAttribute('aria-label', 'Scene theme');

    for (const option of SCENE_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ns-seg-btn';
      btn.textContent = option.label;
      btn.setAttribute('aria-label', option.ariaLabel);
      btn.setAttribute('aria-pressed', String(option.theme === this.state.sceneTheme));
      btn.addEventListener('click', () => {
        this.callbacks.onSelectScene(option.theme);
      });
      this.sceneButtons.set(option.theme, btn);
      sceneTrack.appendChild(btn);
    }

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

    worldGroup.append(worldLabel, sceneTrack, lightTrack);

    // -------------------------------------------------------------------------
    // GROUP 2: CATS (Inline stepper + Compact Breed selector)
    // -------------------------------------------------------------------------
    const catsGroup = document.createElement('section');
    catsGroup.className = 'ns-group';
    catsGroup.setAttribute('aria-label', 'Cats');

    const catsHead = document.createElement('div');
    catsHead.className = 'ns-group-head';

    const catsLabel = document.createElement('div');
    catsLabel.className = 'ns-group-label';
    catsLabel.textContent = 'Cats';

    const stepper = document.createElement('div');
    stepper.className = 'ns-stepper';
    stepper.setAttribute('role', 'group');
    stepper.setAttribute('aria-label', 'Cat count');

    this.catMinusBtn = document.createElement('button');
    this.catMinusBtn.type = 'button';
    this.catMinusBtn.className = 'ns-stepper-btn';
    this.catMinusBtn.setAttribute('aria-label', 'Decrease cat count');
    this.catMinusBtn.appendChild(createSvg(ICONS.minus, 'ns-stepper-svg'));
    this.catMinusBtn.addEventListener('click', () => {
      const next = Math.max(1, this.state.catCount - 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });

    this.catCountEl = document.createElement('span');
    this.catCountEl.className = 'ns-stepper-value';
    this.catCountEl.setAttribute('aria-live', 'polite');
    this.catCountEl.textContent = String(this.state.catCount);

    this.catPlusBtn = document.createElement('button');
    this.catPlusBtn.type = 'button';
    this.catPlusBtn.className = 'ns-stepper-btn';
    this.catPlusBtn.setAttribute('aria-label', 'Increase cat count');
    this.catPlusBtn.appendChild(createSvg(ICONS.plus, 'ns-stepper-svg'));
    this.catPlusBtn.addEventListener('click', () => {
      const next = Math.min(12, this.state.catCount + 1);
      if (next !== this.state.catCount) {
        this.callbacks.onChangeCatCount(next);
      }
    });

    stepper.append(this.catMinusBtn, this.catCountEl, this.catPlusBtn);
    catsHead.append(catsLabel, stepper);

    const breedRow = document.createElement('div');
    breedRow.className = 'ns-breed-pills';
    breedRow.setAttribute('role', 'group');
    breedRow.setAttribute('aria-label', 'Cat breed');

    for (const option of BREED_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ns-breed-pill';
      btn.textContent = option.label;
      btn.setAttribute('aria-label', `Breed: ${option.fullLabel}`);
      if (option.label !== option.fullLabel) {
        btn.setAttribute('title', option.fullLabel);
      }
      btn.setAttribute('aria-pressed', String(option.mode === this.state.breedMode));
      btn.addEventListener('click', () => {
        this.callbacks.onSelectBreedMode(option.mode);
      });
      this.breedButtons.set(option.mode, btn);
      breedRow.appendChild(btn);
    }

    catsGroup.append(catsHead, breedRow);

    // -------------------------------------------------------------------------
    // GROUP 3: PLAY (Laser, Yarn, Box, Treat)
    // -------------------------------------------------------------------------
    const playGroup = document.createElement('section');
    playGroup.className = 'ns-group';
    playGroup.setAttribute('aria-label', 'Play');

    const playLabel = document.createElement('div');
    playLabel.className = 'ns-group-label';
    playLabel.textContent = 'Play';

    const playGrid = document.createElement('div');
    playGrid.className = 'ns-play-grid';

    this.laserBtn = this.createPlayTile('Laser', 'Toggle laser pointer', ICONS.laser, () => {
      this.callbacks.onToggleLaser();
    });
    this.laserBtn.classList.add('is-laser-tile');
    this.laserBtn.setAttribute('aria-pressed', String(this.state.laserActive));

    const yarnBtn = this.createPlayTile('Yarn', 'Toss yarn ball', ICONS.yarn, () => {
      this.callbacks.onTossYarn();
    });

    this.boxBtn = this.createPlayTile('Box', 'Toggle cardboard box', ICONS.box, () => {
      this.callbacks.onToggleBox();
    });
    this.boxBtn.setAttribute('aria-pressed', String(this.state.boxVisible));

    const treatBtn = this.createPlayTile('Treat', 'Drop tasty treat for cats', ICONS.treat, () => {
      this.callbacks.onDropTreat();
    });
    treatBtn.classList.add('is-treat-tile');

    this.treatCountBadge = document.createElement('span');
    this.treatCountBadge.className = 'ns-tile-badge';
    this.treatCountBadge.setAttribute('aria-hidden', 'true');
    this.treatCountBadge.hidden = true;
    treatBtn.appendChild(this.treatCountBadge);

    playGrid.append(this.laserBtn, yarnBtn, this.boxBtn, treatBtn);
    playGroup.append(playLabel, playGrid);

    // -------------------------------------------------------------------------
    // MORE DISCLOSURE (Collapsed by default)
    // -------------------------------------------------------------------------
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

    this.popover.append(worldGroup, catsGroup, playGroup, this.moreDetails);
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

    this.syncDom();
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
      catCount: Math.max(1, Math.min(12, partial.catCount ?? this.state.catCount)),
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
   * Collapsed state is now strictly a single uncluttered circular FAB.
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

    for (const [theme, btn] of this.sceneButtons.entries()) {
      btn.setAttribute('aria-pressed', String(theme === this.state.sceneTheme));
    }

    for (const [mode, btn] of this.lightingButtons.entries()) {
      btn.setAttribute('aria-pressed', String(mode === this.state.lightingMode));
    }

    for (const [breedMode, btn] of this.breedButtons.entries()) {
      btn.setAttribute('aria-pressed', String(breedMode === this.state.breedMode));
    }

    this.catCountEl.textContent = String(this.state.catCount);
    this.catMinusBtn.disabled = this.state.catCount <= 1;
    this.catPlusBtn.disabled = this.state.catCount >= 12;

    this.laserBtn.setAttribute('aria-pressed', String(this.state.laserActive));
    this.boxBtn.setAttribute('aria-pressed', String(this.state.boxVisible));

    const treats = Math.max(0, Math.round(this.state.activeTreatsCount ?? 0));
    this.treatCountBadge.hidden = treats <= 0;
    if (treats > 0) {
      this.treatCountBadge.textContent = String(treats);
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
