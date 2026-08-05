import Phaser from "phaser";
import { gameSettings } from "./gameSettings";
import { generateMap, getTile, type GameMap } from "./mapGeneration";

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
const WALL_COLOR = 0x455a64;

export class MapPreviewScene extends Phaser.Scene {
  private map!: GameMap;
  private gridSize = gameSettings.gridSize;
  private cellSize = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private squares = new Map<string, Phaser.GameObjects.Rectangle>();
  private titleText: Phaser.GameObjects.Text | undefined;
  private startButton: Phaser.GameObjects.Text | undefined;
  private regenerateButton: Phaser.GameObjects.Text | undefined;

  constructor() {
    super({ key: "MapPreviewScene" });
  }

  create(): void {
    this.gridSize = gameSettings.gridSize;
    this.map = generateMap(this.gridSize, this.gridSize);

    this.titleText = this.add
      .text(0, 30, "Preview map", {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.layout();

    const handleResize = (): void => {
      this.layout();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
    });
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
        const tile = getTile(this.map, col, row);
        const square = this.add
          .rectangle(
            this.boardOffsetX + col * this.cellSize,
            this.boardOffsetY + row * this.cellSize,
            this.cellSize,
            this.cellSize,
            tile === "wall" ? WALL_COLOR : FLOOR_COLOR
          )
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x888888);

        this.squares.set(`${String(row)}-${String(col)}`, square);
      }
    }
  }

  private renderButtons(centerX: number, centerY: number): void {
    this.startButton?.destroy();
    this.regenerateButton?.destroy();

    const regenerateButton = this.add
      .text(0, centerY, "Regenerate", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#1565c0",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    regenerateButton.on("pointerover", () =>
      regenerateButton.setStyle({ backgroundColor: "#1976d2" })
    );
    regenerateButton.on("pointerout", () =>
      regenerateButton.setStyle({ backgroundColor: "#1565c0" })
    );
    regenerateButton.on("pointerdown", () => {
      this.map = generateMap(this.gridSize, this.gridSize);
      this.renderBoard();
    });

    const startButton = this.add
      .text(0, centerY, "Start", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#2e7d32",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    startButton.on("pointerover", () =>
      startButton.setStyle({ backgroundColor: "#388e3c" })
    );
    startButton.on("pointerout", () =>
      startButton.setStyle({ backgroundColor: "#2e7d32" })
    );
    startButton.on("pointerdown", () =>
      this.scene.start("GameScene", { map: this.map })
    );

    const totalWidth = regenerateButton.width + BUTTON_GAP + startButton.width;
    const left = centerX - totalWidth / 2;
    regenerateButton.setX(left + regenerateButton.width / 2);
    startButton.setX(left + regenerateButton.width + BUTTON_GAP + startButton.width / 2);

    this.startButton = startButton;
    this.regenerateButton = regenerateButton;
  }

  getTestBounds(): Record<string, ElementBounds> {
    return {
      title: rectFromBounds(this.titleText),
      startButton: rectFromBounds(this.startButton),
      regenerateButton: rectFromBounds(this.regenerateButton),
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
