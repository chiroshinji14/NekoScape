import type { NekoSettings } from './simulation';

export type { LightingMode, NekoSettings, SceneTheme } from './simulation';

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

export type PowerStateReason = "occluded" | "user" | "active";

export type SpawnActionType =
  | "resetYarn"
  | "toggleLaser"
  | "rescanIcons"
  | "toggleBox";

export interface IconUpdateMessage {
  type: "ICON_UPDATE";
  timestamp: number;
  dpiScale: number;
  icons: DesktopIconRect[];
}

export interface MouseRawMessage {
  type: "MOUSE_RAW";
  x: number;
  y: number;
  buttons: MouseButtonsState;
  laserMode: boolean;
  splitPrism: boolean;
}

export interface NewFileEventMessage {
  type: "NEW_FILE_EVENT";
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
  type: "RECYCLE_BIN_EVENT";
  itemCount: number;
  emptied: boolean;
  binRect?: RecycleBinRect;
}

export interface TypingActivityMessage {
  type: "TYPING_ACTIVITY";
  keysPerMinute: number;
  idleSeconds: number;
}

export interface SettingsUpdateMessage {
  type: "SETTINGS_UPDATE";
  settings: NekoSettings;
}

export interface PowerStateMessage {
  type: "POWER_STATE";
  paused: boolean;
  reason: PowerStateReason;
}

export interface SpawnActionMessage {
  type: "SPAWN_ACTION";
  action: SpawnActionType;
}

export type HostToRendererMessage =
  | IconUpdateMessage
  | MouseRawMessage
  | NewFileEventMessage
  | RecycleBinEventMessage
  | TypingActivityMessage
  | SettingsUpdateMessage
  | PowerStateMessage
  | SpawnActionMessage;

export interface ReadyMessage {
  type: "READY";
  rendererVersion: string;
}

export interface StatsUpdateMessage {
  type: "STATS_UPDATE";
  pounces: number;
  bonks: number;
  activeCats: number;
  nappingCats: number;
  paused: boolean;
}

export interface RequestIconRescanMessage {
  type: "REQUEST_ICON_RESCAN";
}

export type RendererToHostMessage =
  | ReadyMessage
  | StatsUpdateMessage
  | RequestIconRescanMessage;
