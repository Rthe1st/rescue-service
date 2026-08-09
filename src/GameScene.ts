import Phaser from "phaser";
import GUI from "lil-gui";
import { DEFAULT_GRID_SIZE, createSettingsGui, gameSettings } from "./gameSettings";
import {
  canPass,
  generateMap,
  getDoorSegments,
  getReachableTiles,
  getWallSegments,
  isGrass,
  isOuterRing,
  type GameMap,
  type WallSegment,
} from "./mapGeneration";

const CONTROLS_AREA_SIZE = 140;
const TOP_MARGIN = 80;
const MARGIN = 20;
const CONTROLS_GAP = 20;

const BURN_PHASE_DURATION_MS = 1_000;

const EMPTY_COLOR = 0xffffff;
const OUTSIDE_COLOR = 0x2e7d32;
const INACCESSIBLE_COLOR = 0x424242;
const WALL_COLOR = 0x212121;
const DOOR_COLOR = 0x795548;
const PLAYER_COLOR = 0x000000;
const FLAME_COLOR = 0xe53935;

const ADJACENT_OFFSETS: ReadonlyArray<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

type GamePhase = "firefighting" | "burn";

function pickRandomDirections(count: number): Array<[number, number]> {
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = indices[i];
    const b = indices[j];
    if (a === undefined || b === undefined) continue;
    indices[i] = b;
    indices[j] = a;
  }

  const result: Array<[number, number]> = [];
  for (const index of indices.slice(0, count)) {
    const offset = ADJACENT_OFFSETS[index];
    if (offset) result.push(offset);
  }
  return result;
}

interface Direction {
  name: string;
  label: string;
  dRow: number;
  dCol: number;
  x: number;
  y: number;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class GameScene extends Phaser.Scene {
  private cellSize = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private squares = new Map<string, Phaser.GameObjects.Rectangle>();
  private wallGraphics: Phaser.GameObjects.Graphics | undefined;
  private controlButtons: Phaser.GameObjects.Text[] = [];
  private controlButtonsByName = new Map<string, Phaser.GameObjects.Text>();
  private endGameButton: Phaser.GameObjects.Text | undefined;
  private settingsButton: Phaser.GameObjects.Text | undefined;
  private playerRow = DEFAULT_GRID_SIZE - 1;
  private playerCol = 0;
  private gridSize = DEFAULT_GRID_SIZE;
  private cellSizeScale = gameSettings.cellSizeScale;
  private buttonFontSize = gameSettings.buttonSize;
  private buttonSpacing = gameSettings.buttonSpacing;
  private gui: GUI | undefined;
  private guiVisible = false;
  private flames = new Set<string>();
  private phase: GamePhase = "firefighting";
  private firefightingDurationMs = gameSettings.firefightingDurationSeconds * 1000;
  private phaseTimerMs = this.firefightingDurationMs;
  private spreadDirections = gameSettings.spreadDirections;
  private doorCount = gameSettings.doorCount;
  private gameOver = false;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private map!: GameMap;
  private providedMap: GameMap | undefined;
  private accessibleTiles = new Set<string>();

  constructor() {
    super({ key: "GameScene" });
  }

  init(data?: { map?: GameMap }): void {
    this.providedMap = data?.map;
  }

  create(): void {
    const { width } = this.scale;

    const endGameButton = this.add
      .text(width / 2, 30, "End Game", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#b71c1c",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    endGameButton.on("pointerover", () =>
      endGameButton.setStyle({ backgroundColor: "#d32f2f" })
    );
    endGameButton.on("pointerout", () =>
      endGameButton.setStyle({ backgroundColor: "#b71c1c" })
    );
    endGameButton.on("pointerdown", () => this.scene.start("MainMenuScene"));

    const settingsButton = this.add
      .text(30, 30, "⚙", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#424242",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    settingsButton.on("pointerover", () =>
      settingsButton.setStyle({ backgroundColor: "#616161" })
    );
    settingsButton.on("pointerout", () =>
      settingsButton.setStyle({ backgroundColor: "#424242" })
    );
    settingsButton.on("pointerdown", () => {
      this.toggleDebugGui();
    });

    this.endGameButton = endGameButton;
    this.settingsButton = settingsButton;

    this.applySettings();
    this.setMap(
      this.providedMap ??
        generateMap(this.gridSize, this.gridSize, { doorCount: this.doorCount })
    );
    this.providedMap = undefined;
    this.startRound();

    this.timerText = this.add
      .text(width / 2, 58, "", { fontSize: "16px", color: "#ffffff" })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(width / 2, 58, "", {
        fontSize: "16px",
        color: "#ff8a65",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.layout();
    this.setupDebugGui();
    this.updatePhaseText();

    const handleResize = (): void => {
      this.endGameButton?.setX(this.scale.width / 2);
      this.layout();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
    });
  }

  private applySettings(): void {
    this.gridSize = gameSettings.gridSize;
    this.cellSizeScale = gameSettings.cellSizeScale;
    this.buttonFontSize = gameSettings.buttonSize;
    this.buttonSpacing = gameSettings.buttonSpacing;
    this.firefightingDurationMs = gameSettings.firefightingDurationSeconds * 1000;
    this.spreadDirections = gameSettings.spreadDirections;
    this.doorCount = gameSettings.doorCount;
  }

  private startRound(): void {
    this.placePlayerAtStart();
    this.phase = "firefighting";
    this.phaseTimerMs = this.firefightingDurationMs;
    this.gameOver = false;
    this.flames = new Set();
    this.igniteRandomFlame();
  }

  // Always starts the player at a random tile on the outer ring - the edge of the map -
  // which the ring/grass guarantee is always walkable and always connects to every room.
  private placePlayerAtStart(): void {
    const ringTiles: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (isOuterRing(this.map, x, y)) ringTiles.push({ x, y });
      }
    }
    const tile = ringTiles[Math.floor(Math.random() * ringTiles.length)];
    this.playerCol = tile?.x ?? 0;
    this.playerRow = tile?.y ?? this.gridSize - 1;
  }

  // Records `map` and re-derives which tiles are reachable at all (so pockets cut off from
  // the rest of the map render distinctly), from (0, 0) - always a ring tile, and every room
  // is guaranteed to reach the ring during generation, so this reaches everything playable.
  private setMap(map: GameMap): void {
    this.map = map;
    this.accessibleTiles = new Set(
      getReachableTiles(map, { x: 0, y: 0 }).map((tile) => squareKey(tile.y, tile.x))
    );
  }

  private setupDebugGui(): void {
    const gui = createSettingsGui(() => {
      const previousDoorCount = this.doorCount;
      this.applySettings();
      if (
        this.map.width !== this.gridSize ||
        this.map.height !== this.gridSize ||
        this.doorCount !== previousDoorCount
      ) {
        this.setMap(generateMap(this.gridSize, this.gridSize, { doorCount: this.doorCount }));
        this.startRound();
      } else {
        this.playerRow = Math.min(this.playerRow, this.gridSize - 1);
        this.playerCol = Math.min(this.playerCol, this.gridSize - 1);
      }
      this.layout();
    });

    gui.hide();
    this.guiVisible = false;
    this.gui = gui;

    this.input.keyboard?.on("keydown-BACKTICK", this.toggleDebugGui);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown-BACKTICK", this.toggleDebugGui);
      gui.destroy();
      this.gui = undefined;
    });
  }

  private toggleDebugGui = (): void => {
    this.guiVisible = !this.guiVisible;
    this.gui?.show(this.guiVisible);
  };

  private isPortrait(): boolean {
    const { width, height } = this.scale.parentSize;
    if (width === 0 || height === 0) return false;
    return height > width;
  }

  private layout(): void {
    this.pruneFlames();

    for (const square of this.squares.values()) square.destroy();
    this.squares.clear();
    for (const button of this.controlButtons) button.destroy();
    this.controlButtons = [];

    const { width, height } = this.scale;
    this.timerText.setX(width / 2);
    this.statusText.setX(width / 2);
    let availableWidth: number;
    let availableHeight: number;
    let controlsCenterX: number;
    let controlsCenterY: number;

    // The control buttons sit `buttonSpacing` away from the cluster center and
    // are roughly `buttonFontSize` wide/tall, so the reserved area must grow
    // with those debug-tunable values or the outer buttons get clipped off
    // the edge of the screen.
    const controlsAreaSize = Math.max(
      CONTROLS_AREA_SIZE,
      (this.buttonSpacing + this.buttonFontSize) * 2 + MARGIN
    );

    if (this.isPortrait()) {
      // Controls below the board.
      availableWidth = width - MARGIN * 2;
      availableHeight =
        height - TOP_MARGIN - CONTROLS_GAP - controlsAreaSize - MARGIN;
      this.cellSize = Math.max(
        1,
        Math.floor(
          (Math.min(availableWidth, availableHeight) / this.gridSize) *
            this.cellSizeScale
        )
      );
      const boardSize = this.cellSize * this.gridSize;
      this.boardOffsetX = (width - boardSize) / 2;
      this.boardOffsetY = TOP_MARGIN + (availableHeight - boardSize) / 2;

      controlsCenterX = width / 2;
      controlsCenterY =
        this.boardOffsetY + boardSize + CONTROLS_GAP + controlsAreaSize / 2;
    } else {
      // Controls to the left of the board.
      availableWidth = width - controlsAreaSize - CONTROLS_GAP - MARGIN;
      availableHeight = height - TOP_MARGIN - MARGIN;
      this.cellSize = Math.max(
        1,
        Math.floor(
          (Math.min(availableWidth, availableHeight) / this.gridSize) *
            this.cellSizeScale
        )
      );
      const boardSize = this.cellSize * this.gridSize;
      this.boardOffsetX =
        controlsAreaSize + CONTROLS_GAP + (availableWidth - boardSize) / 2;
      this.boardOffsetY = TOP_MARGIN + (availableHeight - boardSize) / 2;

      controlsCenterX = controlsAreaSize / 2;
      controlsCenterY = TOP_MARGIN + availableHeight / 2;
    }

    this.createBoard();
    this.drawWalls();
    this.createControls(controlsCenterX, controlsCenterY);
  }

  private createBoard(): void {
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const square = this.add
          .rectangle(
            this.boardOffsetX + col * this.cellSize,
            this.boardOffsetY + row * this.cellSize,
            this.cellSize,
            this.cellSize,
            this.squareFill(row, col)
          )
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x888888);

        this.squares.set(squareKey(row, col), square);
      }
    }
  }

  private drawWalls(): void {
    this.wallGraphics?.destroy();
    const graphics = this.add.graphics();
    const lineWidth = Math.max(3, Math.round(this.cellSize * 0.12));

    graphics.lineStyle(lineWidth, WALL_COLOR, 1);
    for (const segment of getWallSegments(this.map)) {
      const line = wallSegmentToLine(
        segment,
        this.boardOffsetX,
        this.boardOffsetY,
        this.cellSize
      );
      graphics.lineBetween(line.x1, line.y1, line.x2, line.y2);
    }

    graphics.lineStyle(lineWidth, DOOR_COLOR, 1);
    for (const segment of getDoorSegments(this.map)) {
      const line = wallSegmentToLine(
        segment,
        this.boardOffsetX,
        this.boardOffsetY,
        this.cellSize
      );
      graphics.lineBetween(line.x1, line.y1, line.x2, line.y2);
    }

    this.wallGraphics = graphics;
  }

  private squareFill(row: number, col: number): number {
    if (row === this.playerRow && col === this.playerCol) return PLAYER_COLOR;
    if (this.flames.has(squareKey(row, col))) return FLAME_COLOR;
    if (!this.accessibleTiles.has(squareKey(row, col))) return INACCESSIBLE_COLOR;
    if (isGrass(this.map, col, row)) return OUTSIDE_COLOR;
    return EMPTY_COLOR;
  }

  private createControls(centerX: number, centerY: number): void {
    this.controlButtonsByName.clear();

    const spacing = this.buttonSpacing;
    const padding = {
      x: Math.round(this.buttonFontSize * (14 / 24)),
      y: Math.round(this.buttonFontSize * (10 / 24)),
    };

    const directions: Direction[] = [
      {
        name: "up",
        label: "▲",
        dRow: -1,
        dCol: 0,
        x: centerX,
        y: centerY - spacing,
      },
      {
        name: "down",
        label: "▼",
        dRow: 1,
        dCol: 0,
        x: centerX,
        y: centerY + spacing,
      },
      {
        name: "left",
        label: "◀",
        dRow: 0,
        dCol: -1,
        x: centerX - spacing,
        y: centerY,
      },
      {
        name: "right",
        label: "▶",
        dRow: 0,
        dCol: 1,
        x: centerX + spacing,
        y: centerY,
      },
    ];

    const movable = this.canMove();

    for (const direction of directions) {
      const button = this.add
        .text(direction.x, direction.y, direction.label, {
          fontSize: `${String(this.buttonFontSize)}px`,
          color: "#ffffff",
          backgroundColor: "#1565c0",
          padding,
        })
        .setOrigin(0.5)
        .setAlpha(movable ? 1 : 0.4);

      if (movable) {
        button.setInteractive({ useHandCursor: true });
        button.on("pointerover", () =>
          button.setStyle({ backgroundColor: "#1976d2" })
        );
        button.on("pointerout", () =>
          button.setStyle({ backgroundColor: "#1565c0" })
        );
        button.on("pointerdown", () => {
          this.movePlayer(direction.dRow, direction.dCol);
        });
      }

      this.controlButtons.push(button);
      this.controlButtonsByName.set(direction.name, button);
    }
  }

  getTestBounds(): Record<string, ElementBounds> {
    const bounds: Record<string, ElementBounds> = {
      endGameButton: rectFromBounds(this.endGameButton),
      settingsButton: rectFromBounds(this.settingsButton),
      board: {
        x: this.boardOffsetX,
        y: this.boardOffsetY,
        width: this.cellSize * this.gridSize,
        height: this.cellSize * this.gridSize,
      },
    };

    for (const [name, button] of this.controlButtonsByName) {
      bounds[`control-${name}`] = rectFromBounds(button);
    }

    return bounds;
  }

  private canMove(): boolean {
    return this.phase === "firefighting" && !this.gameOver;
  }

  private movePlayer(dRow: number, dCol: number): void {
    if (!this.canMove()) return;

    const row = this.playerRow + dRow;
    const col = this.playerCol + dCol;
    if (!canPass(this.map, this.playerCol, this.playerRow, col, row)) return;

    const previousRow = this.playerRow;
    const previousCol = this.playerCol;
    this.playerRow = row;
    this.playerCol = col;

    this.getSquare(previousRow, previousCol).setFillStyle(
      this.squareFill(previousRow, previousCol)
    );
    this.getSquare(row, col).setFillStyle(this.squareFill(row, col));

    if (this.flames.has(squareKey(row, col))) {
      this.endGame();
    }
  }

  private getSquare(row: number, col: number): Phaser.GameObjects.Rectangle {
    const square = this.squares.get(squareKey(row, col));
    if (!square) {
      throw new Error(`No square at row ${String(row)}, col ${String(col)}`);
    }
    return square;
  }

  override update(_time: number, delta: number): void {
    if (this.gameOver) return;

    this.phaseTimerMs -= delta;
    if (this.phaseTimerMs > 0) {
      this.updatePhaseText();
      return;
    }

    if (this.phase === "firefighting") {
      this.startBurnPhase();
    } else {
      this.startFirefightingPhase();
    }
  }

  private startBurnPhase(): void {
    this.phase = "burn";
    this.phaseTimerMs = BURN_PHASE_DURATION_MS;
    this.spreadFlames();
    this.layout();

    if (this.flames.has(squareKey(this.playerRow, this.playerCol))) {
      this.endGame();
      return;
    }

    this.updatePhaseText();
  }

  private startFirefightingPhase(): void {
    this.phase = "firefighting";
    this.phaseTimerMs = this.firefightingDurationMs;
    this.layout();
    this.updatePhaseText();
  }

  private endGame(): void {
    this.gameOver = true;
    this.layout();
    this.updatePhaseText();
  }

  private spreadFlames(): void {
    const next = new Set(this.flames);
    for (const key of this.flames) {
      const [row, col] = parseSquareKey(key);
      const directions =
        this.spreadDirections >= ADJACENT_OFFSETS.length
          ? ADJACENT_OFFSETS
          : pickRandomDirections(this.spreadDirections);
      for (const [dRow, dCol] of directions) {
        const r = row + dRow;
        const c = col + dCol;
        if (canPass(this.map, col, row, c, r)) {
          next.add(squareKey(r, c));
        }
      }
    }
    this.flames = next;
  }

  // The player always starts on the ring, and every room/corridor is guaranteed reachable
  // from the ring during generation, so `accessibleTiles` already is "reachable from the
  // player" - reusing it here avoids a second reachability walk over the same map.
  private igniteRandomFlame(): void {
    const candidates = [...this.accessibleTiles].filter(
      (key) => key !== squareKey(this.playerRow, this.playerCol)
    );
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    if (!choice) return;
    this.flames = new Set([choice]);
  }

  private pruneFlames(): void {
    this.flames = new Set(
      [...this.flames].filter((key) => {
        const [row, col] = parseSquareKey(key);
        return row < this.gridSize && col < this.gridSize;
      })
    );
  }

  private updatePhaseText(): void {
    if (this.gameOver) {
      this.timerText.setVisible(false);
      this.statusText
        .setText("💀 Caught in the flames! Game Over")
        .setVisible(true);
      return;
    }

    this.statusText.setVisible(false);
    const seconds = Math.max(0, Math.ceil(this.phaseTimerMs / 1000));
    const label =
      this.phase === "burn"
        ? `🔥 Fire spreading: ${String(seconds)}s`
        : `🧯 Firefighting: ${String(seconds)}s`;
    this.timerText.setText(label).setVisible(true);
  }
}

function squareKey(row: number, col: number): string {
  return `${String(row)}-${String(col)}`;
}

function parseSquareKey(key: string): [number, number] {
  const [rowPart, colPart] = key.split("-");
  return [Number(rowPart), Number(colPart)];
}

function wallSegmentToLine(
  segment: WallSegment,
  boardOffsetX: number,
  boardOffsetY: number,
  cellSize: number
): { x1: number; y1: number; x2: number; y2: number } {
  if (segment.x1 === segment.x2) {
    const rowBoundary = Math.max(segment.y1, segment.y2);
    const y = boardOffsetY + rowBoundary * cellSize;
    const xStart = boardOffsetX + segment.x1 * cellSize;
    return { x1: xStart, y1: y, x2: xStart + cellSize, y2: y };
  }

  const colBoundary = Math.max(segment.x1, segment.x2);
  const x = boardOffsetX + colBoundary * cellSize;
  const yStart = boardOffsetY + segment.y1 * cellSize;
  return { x1: x, y1: yStart, x2: x, y2: yStart + cellSize };
}

function rectFromBounds(
  obj: Phaser.GameObjects.Text | undefined
): ElementBounds {
  if (!obj) return { x: 0, y: 0, width: 0, height: 0 };
  const bounds = obj.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}
