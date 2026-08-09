import Phaser from "phaser";
import { gameSettings } from "./gameSettings";
import {
  createOpenMap,
  generateMapSteps,
  getDoorSegments,
  getWallSegments,
  type GameMap,
  type WallSegment,
} from "./mapGeneration";

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOP_MARGIN = 80;
const MARGIN = 20;
const BUTTONS_AREA_HEIGHT = 100;
const BUTTON_GAP = 20;

const FLOOR_COLOR = 0xffffff;
const WALL_COLOR = 0x212121;
const DOOR_COLOR = 0x795548;

export class MapPreviewScene extends Phaser.Scene {
  private map!: GameMap;
  private gridSize = gameSettings.gridSize;
  private cellSize = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private squares = new Map<string, Phaser.GameObjects.Rectangle>();
  private wallGraphics: Phaser.GameObjects.Graphics | undefined;
  private titleText: Phaser.GameObjects.Text | undefined;
  private startButton: Phaser.GameObjects.Text | undefined;
  private regenerateButton: Phaser.GameObjects.Text | undefined;
  private pauseButton: Phaser.GameObjects.Text | undefined;
  private generationTimer: Phaser.Time.TimerEvent | undefined;
  private generating = false;
  private paused = false;

  constructor() {
    super({ key: "MapPreviewScene" });
  }

  create(): void {
    this.gridSize = gameSettings.gridSize;
    this.map = createOpenMap(this.gridSize, this.gridSize);

    this.titleText = this.add
      .text(0, 30, "Preview map", {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.layout();
    this.startGeneration();

    const handleResize = (): void => {
      this.layout();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
      this.generationTimer?.remove();
    });
  }

  // Steps through `generateMapSteps` on a timer, rendering the map after every room
  // placed, door opened, and corridor wall carved, so map generation is visible as it
  // happens rather than appearing instantly.
  private startGeneration(): void {
    this.generationTimer?.remove();

    const steps = generateMapSteps(this.gridSize, this.gridSize, {
      doorCount: gameSettings.doorCount,
    });
    this.generating = true;
    this.paused = false;
    this.renderButtons(...this.buttonsCenter());

    this.generationTimer = this.time.addEvent({
      delay: gameSettings.generationStepDelayMs,
      loop: true,
      callback: () => {
        // Phaser's clock can fire a repeating event's callback more than once per
        // frame to catch up after a stall, which would call `.next()` again on an
        // already-exhausted generator (returning `{done: true, value: undefined}`)
        // even though `remove()` was already requested below. Ignore those.
        if (!this.generating) return;

        const result = steps.next();
        this.map = result.done ? result.value : result.value.map;
        this.renderBoard();

        if (result.done) {
          this.generating = false;
          this.paused = false;
          this.generationTimer?.remove();
          this.generationTimer = undefined;
          this.renderButtons(...this.buttonsCenter());
        }
      },
    });
  }

  private togglePause(): void {
    if (!this.generationTimer) return;
    this.paused = !this.paused;
    this.generationTimer.paused = this.paused;
    this.renderButtons(...this.buttonsCenter());
  }

  private buttonsCenter(): [number, number] {
    const { width } = this.scale;
    const boardSize = this.cellSize * this.gridSize;
    return [width / 2, this.boardOffsetY + boardSize + BUTTONS_AREA_HEIGHT / 2];
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.titleText?.setX(width / 2);

    const availableWidth = width - MARGIN * 2;
    const availableHeight = height - TOP_MARGIN - BUTTONS_AREA_HEIGHT - MARGIN;
    this.cellSize = Math.max(
      1,
      Math.floor(Math.min(availableWidth, availableHeight) / this.gridSize)
    );
    const boardSize = this.cellSize * this.gridSize;
    this.boardOffsetX = (width - boardSize) / 2;
    this.boardOffsetY = TOP_MARGIN + (availableHeight - boardSize) / 2;

    this.renderBoard();
    this.renderButtons(
      width / 2,
      this.boardOffsetY + boardSize + BUTTONS_AREA_HEIGHT / 2
    );
  }

  private renderBoard(): void {
    for (const square of this.squares.values()) square.destroy();
    this.squares.clear();

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const square = this.add
          .rectangle(
            this.boardOffsetX + col * this.cellSize,
            this.boardOffsetY + row * this.cellSize,
            this.cellSize,
            this.cellSize,
            FLOOR_COLOR
          )
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x888888);

        this.squares.set(`${String(row)}-${String(col)}`, square);
      }
    }

    this.drawWalls();
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

  private renderButtons(centerX: number, centerY: number): void {
    this.startButton?.destroy();
    this.regenerateButton?.destroy();
    this.pauseButton?.destroy();
    this.pauseButton = undefined;

    const enabled = !this.generating;

    const regenerateButton = this.add
      .text(0, centerY, "Regenerate", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#1565c0",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setAlpha(enabled ? 1 : 0.4);
    if (enabled) {
      regenerateButton.setInteractive({ useHandCursor: true });
      regenerateButton.on("pointerover", () =>
        regenerateButton.setStyle({ backgroundColor: "#1976d2" })
      );
      regenerateButton.on("pointerout", () =>
        regenerateButton.setStyle({ backgroundColor: "#1565c0" })
      );
      regenerateButton.on("pointerdown", () => {
        this.startGeneration();
      });
    }

    let pauseButton: Phaser.GameObjects.Text | undefined;
    if (this.generating) {
      pauseButton = this.add
        .text(0, centerY, this.paused ? "Resume" : "Pause", {
          fontSize: "22px",
          color: "#ffffff",
          backgroundColor: "#ef6c00",
          padding: { x: 20, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      pauseButton.on("pointerover", () =>
        pauseButton?.setStyle({ backgroundColor: "#f57c00" })
      );
      pauseButton.on("pointerout", () =>
        pauseButton?.setStyle({ backgroundColor: "#ef6c00" })
      );
      pauseButton.on("pointerdown", () => {
        this.togglePause();
      });
    }

    const startButton = this.add
      .text(0, centerY, "Start", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#2e7d32",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setAlpha(enabled ? 1 : 0.4);
    if (enabled) {
      startButton.setInteractive({ useHandCursor: true });
      startButton.on("pointerover", () =>
        startButton.setStyle({ backgroundColor: "#388e3c" })
      );
      startButton.on("pointerout", () =>
        startButton.setStyle({ backgroundColor: "#2e7d32" })
      );
      startButton.on("pointerdown", () => this.scene.start("GameScene", { map: this.map }));
    }

    const totalWidth =
      regenerateButton.width +
      BUTTON_GAP +
      (pauseButton ? pauseButton.width + BUTTON_GAP : 0) +
      startButton.width;
    const left = centerX - totalWidth / 2;
    let cursor = left;
    regenerateButton.setX(cursor + regenerateButton.width / 2);
    cursor += regenerateButton.width + BUTTON_GAP;
    if (pauseButton) {
      pauseButton.setX(cursor + pauseButton.width / 2);
      cursor += pauseButton.width + BUTTON_GAP;
    }
    startButton.setX(cursor + startButton.width / 2);

    this.startButton = startButton;
    this.regenerateButton = regenerateButton;
    this.pauseButton = pauseButton;
  }

  getTestBounds(): Record<string, ElementBounds> {
    return {
      title: rectFromBounds(this.titleText),
      startButton: rectFromBounds(this.startButton),
      regenerateButton: rectFromBounds(this.regenerateButton),
      pauseButton: rectFromBounds(this.pauseButton),
      board: {
        x: this.boardOffsetX,
        y: this.boardOffsetY,
        width: this.cellSize * this.gridSize,
        height: this.cellSize * this.gridSize,
      },
    };
  }
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
