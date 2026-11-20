import type { AabbRect, NekoSettings } from './simulation';

export type {
  AabbRect,
  CatArchetype,
  CatBreed,
  CatBreedMode,
  CatCustomization,
  CatEarPose,
  CatNeeds,
  CatSoundEvent,
  CircadianPhase,
  EffectiveLightingMode,
  LightingMode,
  NekoSettings,
  SceneTheme,
  SceneThemeName,
  ToyEntityState,
  ToyKind,
  WindowLedgesState,
} from './simulation';

export interface DesktopIconRect {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  isRecycleBin?: boolean;
}

export interface MouseButtonsState {
  left: boolean;
  right: boolean;
  middle: boolean;
}

export type PowerStateReason = 'occluded' | 'user' | 'active';

export type SpawnActionType =
  | 'resetYarn'
  | 'toggleLaser'
  | 'rescanIcons'
  | 'toggleBox'
  | 'dropTreat'
  | 'toggleProps'
  | 'dropMouse'
  | 'dropFish'
  | 'dropFeather'
  | 'dropCrinkle'
  | 'dropSpring'
  | 'dropPingPong'
  | 'dropHairTie'
  | 'dropBubbles'
  | 'dropCucumber'
  | 'togglePaperBag'
  | 'toggleTapedSquare'
  | 'clearToys'
  | 'photoSnapshot';

export type PointerButton = 'left' | 'right';

export interface IconUpdateMessage {
  type: 'ICON_UPDATE';
  timestamp: number;
  dpiScale: number;
  icons: DesktopIconRect[];
}

export interface MouseRawMessage {
  type: 'MOUSE_RAW';
  x: number;
  y: number;
  buttons: MouseButtonsState;
  laserMode: boolean;
  splitPrism: boolean;
}

export interface PointerClickMessage {
  type: 'POINTER_CLICK';
  x: number;
  y: number;
  button: PointerButton;
  doubleClick?: boolean;
}

export interface NewFileEventMessage {
  type: 'NEW_FILE_EVENT';
  fileName: string;
  icon?: DesktopIconRect;
}

export interface RecycleBinRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecycleBinEventMessage {
  type: 'RECYCLE_BIN_EVENT';
  itemCount: number;
  emptied: boolean;
  binRect?: RecycleBinRect;
}

export interface TypingActivityMessage {
  type: 'TYPING_ACTIVITY';
  keysPerMinute: number;
  idleSeconds: number;
}

export interface SettingsUpdateMessage {
  type: 'SETTINGS_UPDATE';
  settings: NekoSettings;
}

export interface PowerStateMessage {
  type: 'POWER_STATE';
  paused: boolean;
  reason: PowerStateReason;
}

export interface SpawnActionMessage {
  type: 'SPAWN_ACTION';
  action: SpawnActionType;
}

export interface WindowLedgesMessage {
  type: 'WINDOW_LEDGES_UPDATE';
  taskbarRect: AabbRect | null;
  windowTopLedges: AabbRect[];
}

export interface AudioActivityMessage {
  type: 'AUDIO_ACTIVITY';
  level: number;
  sourceX?: number;
}

export type HostToRendererMessage =
  | IconUpdateMessage
  | MouseRawMessage
  | PointerClickMessage
  | NewFileEventMessage
  | RecycleBinEventMessage
  | TypingActivityMessage
  | SettingsUpdateMessage
  | PowerStateMessage
  | SpawnActionMessage
  | WindowLedgesMessage
  | AudioActivityMessage;

export interface ReadyMessage {
  type: 'READY';
  rendererVersion: string;
}

export interface StatsUpdateMessage {
  type: 'STATS_UPDATE';
  pounces: number;
  bonks: number;
  activeCats: number;
  nappingCats: number;
  paused: boolean;
}

export interface RequestIconRescanMessage {
  type: 'REQUEST_ICON_RESCAN';
}

export interface SettingsChangedMessage {
  type: 'SETTINGS_CHANGED';
  settings: Partial<NekoSettings>;
}

export type RendererToHostMessage =
  | ReadyMessage
  | StatsUpdateMessage
  | RequestIconRescanMessage
  | SettingsChangedMessage;
