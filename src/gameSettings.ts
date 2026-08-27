import GUI, { type Controller } from "lil-gui";
import {
  DEFAULT_DOOR_COUNT,
  DEFAULT_EXTRA_DOOR_PERCENT,
  MAX_DOOR_COUNT,
  MAX_EXTRA_DOOR_PERCENT,
  MIN_DOOR_COUNT,
  MIN_EXTRA_DOOR_PERCENT,
} from "./mapGeneration";
import { LINE_OF_SIGHT_MODES, type LineOfSightMode } from "./visibility";
import {
  MAX_UX_ELEMENT_PERCENT,
  MIN_UX_ELEMENT_PERCENT,
  type UxElementLayoutSettings,
} from "./uxElementLayout";

export const DEFAULT_GRID_SIZE = 16;
export const DEFAULT_CELL_SIZE_SCALE = 1;
export const DEFAULT_BUTTON_SPACING = 50;
export const DEFAULT_FIREFIGHTING_DURATION_S = 30;
export const DEFAULT_SPREAD_DIRECTIONS = 4;
export const DEFAULT_EDIT_MAPS_BEFORE_PLAY = false;
export const DEFAULT_GENERATION_STEP_DELAY_MS = 20;
export const DEFAULT_PLAYER_COUNT = 1;
export const MIN_PLAYER_COUNT = 1;
export const MAX_PLAYER_COUNT = 8;
export const DEFAULT_MAX_HOSE_LENGTH = 10;
export const DEFAULT_HOSE_SPRAY_RANGE = 5;
export const DEFAULT_HOSE_COUNT = 1;
export const MIN_HOSE_COUNT = 0;
export const MAX_HOSE_COUNT = 10;
export const DEFAULT_FOG_OF_WAR_ENABLED = false;
export const DEFAULT_FOG_OF_WAR_MEMORY_MOVES = 0;
export const MIN_FOG_OF_WAR_MEMORY_MOVES = 0;
export const MAX_FOG_OF_WAR_MEMORY_MOVES = 20;
export const DEFAULT_FOG_OF_WAR_STATIC_MEMORY = false;
export const DEFAULT_FOG_OF_WAR_UNLIMITED_MEMORY = false;
export const DEFAULT_LINE_OF_SIGHT_MODE: LineOfSightMode = "bresenham-plus";
export const DEFAULT_MEM_CELL_OPACITY = 50;
export const MIN_MEM_CELL_OPACITY = 0;
export const MAX_MEM_CELL_OPACITY = 100;
export const DEFAULT_FORGOTTEN_CELL_OPACITY = 100;
export const MIN_FORGOTTEN_CELL_OPACITY = 0;
export const MAX_FORGOTTEN_CELL_OPACITY = 100;

// Editable UX elements: each has a Size/X/Y triplet (see uxElementLayout.ts) with defaults
// chosen to reproduce the previous hand-computed layout at the game's default 800x600 size.
export type UxElementKey =
  | "title"
  | "startButton"
  | "map"
  | "arrowButtons"
  | "sprayButton"
  | "hoseButton"
  | "endGameButton";

export const MAIN_SCREEN_UX_ELEMENTS: readonly UxElementKey[] = [
  "title",
  "startButton",
];
export const GAME_SCREEN_UX_ELEMENTS: readonly UxElementKey[] = [
  "map",
  "arrowButtons",
  "sprayButton",
  "hoseButton",
  "endGameButton",
];
const UX_ELEMENT_KEYS: readonly UxElementKey[] = [
  ...MAIN_SCREEN_UX_ELEMENTS,
  ...GAME_SCREEN_UX_ELEMENTS,
];

export const UX_ELEMENT_LABELS: Record<UxElementKey, string> = {
  title: "Title",
  startButton: "Start button",
  map: "Map",
  arrowButtons: "Arrow buttons",
  sprayButton: "Spray button",
  hoseButton: "Hose button",
  endGameButton: "End game button",
};

export const DEFAULT_UX_ELEMENT_LAYOUT: Record<
  UxElementKey,
  UxElementLayoutSettings
> = {
  title: { sizePercent: 5, xPercent: 50, yPercent: 60 },
  startButton: { sizePercent: 3.5, xPercent: 50, yPercent: 40 },
  map: { sizePercent: 58, xPercent: 53, yPercent: 43 },
  arrowButtons: { sizePercent: 3, xPercent: 11, yPercent: 43 },
  sprayButton: { sizePercent: 1.8, xPercent: 91, yPercent: 44 },
  hoseButton: { sizePercent: 1.8, xPercent: 91, yPercent: 42 },
  endGameButton: { sizePercent: 2.5, xPercent: 50, yPercent: 97 },
};

function cloneUxElementLayout(
  source: Record<UxElementKey, UxElementLayoutSettings>
): Record<UxElementKey, UxElementLayoutSettings> {
  const clone = {} as Record<UxElementKey, UxElementLayoutSettings>;
  for (const key of UX_ELEMENT_KEYS) clone[key] = { ...source[key] };
  return clone;
}

const PRESETS_STORAGE_KEY = "rescue-service:gui-presets";

export interface GameParams {
  gridSize: number;
  cellSizeScale: number;
  buttonSpacing: number;
  firefightingDurationSeconds: number;
  spreadDirections: number;
  editMapsBeforePlay: boolean;
  generationStepDelayMs: number;
  doorCount: number;
  extraDoorPercent: number;
  playerCount: number;
  maxHoseLength: number;
  hoseSprayRange: number;
  hoseCount: number;
  fogOfWarEnabled: boolean;
  fogOfWarMemoryMoves: number;
  fogOfWarUnlimitedMemory: boolean;
  fogOfWarStaticMemory: boolean;
  lineOfSightMode: LineOfSightMode;
  memCellOpacity: number;
  forgottenCellOpacity: number;
  uxElements: Record<UxElementKey, UxElementLayoutSettings>;
}

export const gameSettings: GameParams = {
  gridSize: DEFAULT_GRID_SIZE,
  cellSizeScale: DEFAULT_CELL_SIZE_SCALE,
  buttonSpacing: DEFAULT_BUTTON_SPACING,
  firefightingDurationSeconds: DEFAULT_FIREFIGHTING_DURATION_S,
  spreadDirections: DEFAULT_SPREAD_DIRECTIONS,
  editMapsBeforePlay: DEFAULT_EDIT_MAPS_BEFORE_PLAY,
  generationStepDelayMs: DEFAULT_GENERATION_STEP_DELAY_MS,
  doorCount: DEFAULT_DOOR_COUNT,
  extraDoorPercent: DEFAULT_EXTRA_DOOR_PERCENT,
  playerCount: DEFAULT_PLAYER_COUNT,
  maxHoseLength: DEFAULT_MAX_HOSE_LENGTH,
  hoseSprayRange: DEFAULT_HOSE_SPRAY_RANGE,
  hoseCount: DEFAULT_HOSE_COUNT,
  fogOfWarEnabled: DEFAULT_FOG_OF_WAR_ENABLED,
  fogOfWarMemoryMoves: DEFAULT_FOG_OF_WAR_MEMORY_MOVES,
  fogOfWarUnlimitedMemory: DEFAULT_FOG_OF_WAR_UNLIMITED_MEMORY,
  fogOfWarStaticMemory: DEFAULT_FOG_OF_WAR_STATIC_MEMORY,
  lineOfSightMode: DEFAULT_LINE_OF_SIGHT_MODE,
  memCellOpacity: DEFAULT_MEM_CELL_OPACITY,
  forgottenCellOpacity: DEFAULT_FORGOTTEN_CELL_OPACITY,
  uxElements: cloneUxElementLayout(DEFAULT_UX_ELEMENT_LAYOUT),
};

function isUxElementLayoutSettings(
  value: unknown
): value is UxElementLayoutSettings {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["sizePercent"] === "number" &&
    typeof candidate["xPercent"] === "number" &&
    typeof candidate["yPercent"] === "number"
  );
}

function isUxElementLayoutRecord(
  value: unknown
): value is Record<UxElementKey, UxElementLayoutSettings> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return UX_ELEMENT_KEYS.every((key) =>
    isUxElementLayoutSettings(candidate[key])
  );
}

function isGameParams(value: unknown): value is GameParams {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["gridSize"] === "number" &&
    typeof candidate["cellSizeScale"] === "number" &&
    typeof candidate["buttonSpacing"] === "number" &&
    typeof candidate["firefightingDurationSeconds"] === "number" &&
    typeof candidate["spreadDirections"] === "number" &&
    typeof candidate["editMapsBeforePlay"] === "boolean" &&
    typeof candidate["generationStepDelayMs"] === "number" &&
    typeof candidate["doorCount"] === "number" &&
    typeof candidate["extraDoorPercent"] === "number" &&
    typeof candidate["playerCount"] === "number" &&
    typeof candidate["maxHoseLength"] === "number" &&
    typeof candidate["hoseSprayRange"] === "number" &&
    typeof candidate["hoseCount"] === "number" &&
    typeof candidate["fogOfWarEnabled"] === "boolean" &&
    typeof candidate["fogOfWarMemoryMoves"] === "number" &&
    typeof candidate["fogOfWarUnlimitedMemory"] === "boolean" &&
    typeof candidate["fogOfWarStaticMemory"] === "boolean" &&
    typeof candidate["lineOfSightMode"] === "string" &&
    LINE_OF_SIGHT_MODES.includes(candidate["lineOfSightMode"] as LineOfSightMode) &&
    typeof candidate["memCellOpacity"] === "number" &&
    typeof candidate["forgottenCellOpacity"] === "number" &&
    isUxElementLayoutRecord(candidate["uxElements"])
  );
}

function loadPresets(): Record<string, GameParams> {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const presets: Record<string, GameParams> = {};
    for (const [name, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (isGameParams(value)) presets[name] = value;
    }
    return presets;
  } catch {
    return {};
  }
}

function savePresets(presets: Record<string, GameParams>): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

interface UxElementControllers {
  size: Controller;
  x: Controller;
  y: Controller;
}

// Shared by every UX element's folder so the Size/X/Y triplet (see uxElementLayout.ts) is
// declared once instead of once per element.
function addUxElementControls(
  folder: GUI,
  key: UxElementKey,
  onChange?: () => void
): UxElementControllers {
  const settings = gameSettings.uxElements[key];
  const elementFolder = folder.addFolder(UX_ELEMENT_LABELS[key]);
  const size = elementFolder
    .add(settings, "sizePercent", MIN_UX_ELEMENT_PERCENT, MAX_UX_ELEMENT_PERCENT, 0.1)
    .name("Size (%)")
    .onChange(() => onChange?.());
  const x = elementFolder
    .add(settings, "xPercent", MIN_UX_ELEMENT_PERCENT, MAX_UX_ELEMENT_PERCENT, 1)
    .name("X (%)")
    .onChange(() => onChange?.());
  const y = elementFolder
    .add(settings, "yPercent", MIN_UX_ELEMENT_PERCENT, MAX_UX_ELEMENT_PERCENT, 1)
    .name("Y (%)")
    .onChange(() => onChange?.());
  return { size, x, y };
}

// Binds directly to the shared `gameSettings` object so any scene's panel stays in sync.
export function createSettingsGui(onChange?: () => void): GUI {
  const gui = new GUI({ title: "Game parameters" });

  const gridController = gui
    .add(gameSettings, "gridSize", 4, 32, 1)
    .name("Number of squares")
    .onChange(() => onChange?.());
  const scaleController = gui
    .add(gameSettings, "cellSizeScale", 0.5, 1.5, 0.05)
    .name("Square size")
    .onChange(() => onChange?.());
  const spacingController = gui
    .add(gameSettings, "buttonSpacing", 20, 100, 1)
    .name("Arrow control spacing")
    .onChange(() => onChange?.());
  const firefightingDurationController = gui
    .add(gameSettings, "firefightingDurationSeconds", 1, 100, 1)
    .name("Firefighting duration (s)")
    .onChange(() => onChange?.());
  const spreadDirectionsController = gui
    .add(gameSettings, "spreadDirections", 1, 4, 1)
    .name("Flame spread directions")
    .onChange(() => onChange?.());
  const editMapsBeforePlayController = gui
    .add(gameSettings, "editMapsBeforePlay")
    .name("Edit maps before play")
    .onChange(() => onChange?.());
  const generationStepDelayController = gui
    .add(gameSettings, "generationStepDelayMs", 1, 300, 1)
    .name("Map generation step delay (ms)")
    .onChange(() => onChange?.());
  const doorCountController = gui
    .add(gameSettings, "doorCount", MIN_DOOR_COUNT, MAX_DOOR_COUNT, 1)
    .name("Number of doors")
    .onChange(() => onChange?.());
  const extraDoorPercentController = gui
    .add(gameSettings, "extraDoorPercent", MIN_EXTRA_DOOR_PERCENT, MAX_EXTRA_DOOR_PERCENT, 1)
    .name("Extra door chance (%)")
    .onChange(() => onChange?.());
  const playerCountController = gui
    .add(gameSettings, "playerCount", MIN_PLAYER_COUNT, MAX_PLAYER_COUNT, 1)
    .name("Number of players")
    .onChange(() => onChange?.());
  const maxHoseLengthController = gui
    .add(gameSettings, "maxHoseLength", 1, 30, 1)
    .name("Max hose length")
    .onChange(() => onChange?.());
  const hoseSprayRangeController = gui
    .add(gameSettings, "hoseSprayRange", 1, 20, 1)
    .name("Hose spray range")
    .onChange(() => onChange?.());
  const hoseCountController = gui
    .add(gameSettings, "hoseCount", MIN_HOSE_COUNT, MAX_HOSE_COUNT, 1)
    .name("Number of hoses")
    .onChange(() => onChange?.());
  const fogOfWarEnabledController = gui
    .add(gameSettings, "fogOfWarEnabled")
    .name("Fog of war")
    .onChange(() => onChange?.());
  const fogOfWarMemoryMovesController = gui
    .add(gameSettings, "fogOfWarMemoryMoves", MIN_FOG_OF_WAR_MEMORY_MOVES, MAX_FOG_OF_WAR_MEMORY_MOVES, 1)
    .name("Fog of war memory (moves)")
    .onChange(() => onChange?.())
    .disable(gameSettings.fogOfWarUnlimitedMemory);
  const fogOfWarUnlimitedMemoryController = gui
    .add(gameSettings, "fogOfWarUnlimitedMemory")
    .name("Fog of war unlimited memory")
    .onChange((unlimited: boolean) => {
      fogOfWarMemoryMovesController.disable(unlimited);
      onChange?.();
    });
  const fogOfWarStaticMemoryController = gui
    .add(gameSettings, "fogOfWarStaticMemory")
    .name("Fog of war static memory")
    .onChange(() => onChange?.());
  const lineOfSightModeController = gui
    .add(gameSettings, "lineOfSightMode", LINE_OF_SIGHT_MODES)
    .name("Line of sight mode")
    .onChange(() => onChange?.());
  const memCellOpacityController = gui
    .add(gameSettings, "memCellOpacity", MIN_MEM_CELL_OPACITY, MAX_MEM_CELL_OPACITY, 1)
    .name("Mem cell opacity (%)")
    .onChange(() => onChange?.());
  const forgottenCellOpacityController = gui
    .add(gameSettings, "forgottenCellOpacity", MIN_FORGOTTEN_CELL_OPACITY, MAX_FORGOTTEN_CELL_OPACITY, 1)
    .name("Forgotten cell opacity (%)")
    .onChange(() => onChange?.());

  const uxElementsFolder = gui.addFolder("UX elements");
  const mainScreenFolder = uxElementsFolder.addFolder("Main screen");
  const gameScreenFolder = uxElementsFolder.addFolder("Game screen");
  const uxElementControllers = {} as Record<UxElementKey, UxElementControllers>;
  for (const key of MAIN_SCREEN_UX_ELEMENTS) {
    uxElementControllers[key] = addUxElementControls(mainScreenFolder, key, onChange);
  }
  for (const key of GAME_SCREEN_UX_ELEMENTS) {
    uxElementControllers[key] = addUxElementControls(gameScreenFolder, key, onChange);
  }

  const presets = loadPresets();
  const presetState = { preset: "", presetName: "" };

  const applyPreset = (name: string): void => {
    const preset = presets[name];
    if (!preset) return;

    gameSettings.gridSize = preset.gridSize;
    gameSettings.cellSizeScale = preset.cellSizeScale;
    gameSettings.buttonSpacing = preset.buttonSpacing;
    gameSettings.firefightingDurationSeconds = preset.firefightingDurationSeconds;
    gameSettings.spreadDirections = preset.spreadDirections;
    gameSettings.editMapsBeforePlay = preset.editMapsBeforePlay;
    gameSettings.generationStepDelayMs = preset.generationStepDelayMs;
    gameSettings.doorCount = preset.doorCount;
    gameSettings.extraDoorPercent = preset.extraDoorPercent;
    gameSettings.playerCount = preset.playerCount;
    gameSettings.maxHoseLength = preset.maxHoseLength;
    gameSettings.hoseSprayRange = preset.hoseSprayRange;
    gameSettings.hoseCount = preset.hoseCount;
    gameSettings.fogOfWarEnabled = preset.fogOfWarEnabled;
    gameSettings.fogOfWarMemoryMoves = preset.fogOfWarMemoryMoves;
    gameSettings.fogOfWarUnlimitedMemory = preset.fogOfWarUnlimitedMemory;
    gameSettings.fogOfWarStaticMemory = preset.fogOfWarStaticMemory;
    gameSettings.lineOfSightMode = preset.lineOfSightMode;
    gameSettings.memCellOpacity = preset.memCellOpacity;
    gameSettings.forgottenCellOpacity = preset.forgottenCellOpacity;
    // Mutated in place (not reassigned) since each lil-gui controller below was bound to
    // the specific nested `gameSettings.uxElements[key]` object at GUI-construction time.
    for (const key of UX_ELEMENT_KEYS) {
      Object.assign(gameSettings.uxElements[key], preset.uxElements[key]);
    }
    gridController.updateDisplay();
    scaleController.updateDisplay();
    spacingController.updateDisplay();
    firefightingDurationController.updateDisplay();
    spreadDirectionsController.updateDisplay();
    editMapsBeforePlayController.updateDisplay();
    generationStepDelayController.updateDisplay();
    doorCountController.updateDisplay();
    extraDoorPercentController.updateDisplay();
    playerCountController.updateDisplay();
    maxHoseLengthController.updateDisplay();
    hoseSprayRangeController.updateDisplay();
    hoseCountController.updateDisplay();
    fogOfWarEnabledController.updateDisplay();
    fogOfWarMemoryMovesController.updateDisplay();
    fogOfWarMemoryMovesController.disable(gameSettings.fogOfWarUnlimitedMemory);
    fogOfWarUnlimitedMemoryController.updateDisplay();
    fogOfWarStaticMemoryController.updateDisplay();
    lineOfSightModeController.updateDisplay();
    memCellOpacityController.updateDisplay();
    forgottenCellOpacityController.updateDisplay();
    for (const key of UX_ELEMENT_KEYS) {
      const controllers = uxElementControllers[key];
      controllers.size.updateDisplay();
      controllers.x.updateDisplay();
      controllers.y.updateDisplay();
    }

    onChange?.();
  };

  const presetController = gui
    .add(presetState, "preset", ["", ...Object.keys(presets)])
    .name("Load preset")
    .onChange(applyPreset);

  const presetNameController = gui
    .add(presetState, "presetName")
    .name("Preset name");

  gui
    .add(
      {
        save: () => {
          const name = presetState.presetName.trim();
          if (!name) return;

          presets[name] = {
            ...gameSettings,
            uxElements: cloneUxElementLayout(gameSettings.uxElements),
          };
          savePresets(presets);

          presetController.options(["", ...Object.keys(presets)]);
          presetState.preset = name;
          presetController.setValue(name);
          presetState.presetName = "";
          presetNameController.updateDisplay();
        },
      },
      "save"
    )
    .name("Save preset");

  return gui;
}
