export interface Vec2 {
  x: number;
  y: number;
}

export interface AabbRect {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  isRecycleBin?: boolean;
}

export interface RugBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

export type SurfaceType = "hardwood" | "rug";

export const FRICTION_HARDWOOD = 0.82;
export const FRICTION_RUG = 0.96;

export type CatBreed =
  | "calico"
  | "tuxedo"
  | "black"
  | "blue-grey"
  | "siamese"
  | "orange-tabby";

export const CAT_BREEDS: readonly CatBreed[] = [
  "calico",
  "tuxedo",
  "black",
  "blue-grey",
  "siamese",
  "orange-tabby",
] as const;

export type CatStateName =
  | "IDLE"
  | "WANDER"
  | "STALK"
  | "WIGGLE"
  | "POUNCE"
  | "BONK"
  | "NAP"
  | "PETTED"
  | "STARTLED"
  | "IN_BOX"
  | "JUMP_TO_BOX"
  | "JUMP_OUT_BOX"
  | "JUMP_TO_ICON"
  | "PERCH_ICON"
  | "SCRATCH_ICON";

export interface LaserTarget {
  id: string;
  x: number;
  y: number;
  color: number;
  isSplitBeam: boolean;
}

export type LightingMode = "auto" | "day" | "golden" | "night";

export type SceneTheme = "study" | "tatami" | "garden" | "cafe";

export const SCENE_THEMES: readonly SceneTheme[] = [
  "study",
  "tatami",
  "garden",
  "cafe",
] as const;

export interface NekoSettings {
  catCount: number;
  fpsCap: number;
  showHud: boolean;
  showToyDock: boolean;
  debugMode: boolean;
  enableLaserHotkey: boolean;
  enableShellReactions: boolean;
  launchAtStartup: boolean;
  idleNapMinutes: number;
  lightingMode: LightingMode;
  sceneTheme: SceneTheme;
}

export const DEFAULT_SETTINGS: Readonly<NekoSettings> = {
  catCount: 6,
  fpsCap: 60,
  showHud: true,
  showToyDock: true,
  debugMode: false,
  enableLaserHotkey: true,
  enableShellReactions: true,
  launchAtStartup: false,
  idleNapMinutes: 5,
  lightingMode: "golden",
  sceneTheme: "study",
};

export const BONK_VELOCITY_THRESHOLD = 350;
export const YARN_RESTITUTION = 0.75;
export const BONK_DAZE_DURATION = 0.5;
export const WIGGLE_DURATION = 0.4;
export const IDLE_NAP_SECONDS = 300;
export const RECYCLE_STARTLE_RADIUS = 300;
