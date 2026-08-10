import GUI from "lil-gui";
import {
  DEFAULT_DOOR_COUNT,
  DEFAULT_EXTRA_DOOR_PERCENT,
  MAX_DOOR_COUNT,
  MAX_EXTRA_DOOR_PERCENT,
  MIN_DOOR_COUNT,
  MIN_EXTRA_DOOR_PERCENT,
} from "./mapGeneration";

export const DEFAULT_GRID_SIZE = 16;
export const DEFAULT_CELL_SIZE_SCALE = 1;
export const DEFAULT_BUTTON_FONT_SIZE = 24;
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

const PRESETS_STORAGE_KEY = "rescue-service:gui-presets";

export interface GameParams {
  gridSize: number;
  cellSizeScale: number;
  buttonSize: number;
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
}

export const gameSettings: GameParams = {
  gridSize: DEFAULT_GRID_SIZE,
  cellSizeScale: DEFAULT_CELL_SIZE_SCALE,
  buttonSize: DEFAULT_BUTTON_FONT_SIZE,
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
};

function isGameParams(value: unknown): value is GameParams {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["gridSize"] === "number" &&
    typeof candidate["cellSizeScale"] === "number" &&
    typeof candidate["buttonSize"] === "number" &&
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
    typeof candidate["hoseCount"] === "number"
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
  const sizeController = gui
    .add(gameSettings, "buttonSize", 12, 48, 1)
    .name("Arrow control size")
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

  const presets = loadPresets();
  const presetState = { preset: "", presetName: "" };

  const applyPreset = (name: string): void => {
    const preset = presets[name];
    if (!preset) return;

    gameSettings.gridSize = preset.gridSize;
    gameSettings.cellSizeScale = preset.cellSizeScale;
    gameSettings.buttonSize = preset.buttonSize;
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
    gridController.updateDisplay();
    scaleController.updateDisplay();
    sizeController.updateDisplay();
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

          presets[name] = { ...gameSettings };
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
