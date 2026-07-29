import Phaser from "phaser";

const GRID_SIZE = 16;
const CONTROLS_AREA_SIZE = 140;
const TOP_MARGIN = 80;
const MARGIN = 20;
const CONTROLS_GAP = 20;

interface Direction {
  label: string;
  dRow: number;
  dCol: number;
  x: number;
  y: number;
}

export class GameScene extends Phaser.Scene {
  private cellSize = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private squares = new Map<string, Phaser.GameObjects.Rectangle>();
  private controlButtons: Phaser.GameObjects.Text[] = [];
  private playerRow = GRID_SIZE - 1;
  private playerCol = 0;

  constructor() {
    super({ key: "GameScene" });
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

    this.playerRow = GRID_SIZE - 1;
    this.playerCol = 0;

    this.layout();

    const handleResize = (): void => {
      this.layout();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
    });
  }

  private isPortrait(): boolean {
    const { width, height } = this.scale.parentSize;
    if (width === 0 || height === 0) return false;
    return height > width;
  }

  private layout(): void {
    for (const square of this.squares.values()) square.destroy();
    this.squares.clear();
    for (const button of this.controlButtons) button.destroy();
    this.controlButtons = [];

    const { width, height } = this.scale;
    let availableWidth: number;
    let availableHeight: number;
    let controlsCenterX: number;
    let controlsCenterY: number;

    if (this.isPortrait()) {
      // Controls below the board.
      availableWidth = width - MARGIN * 2;
      availableHeight =
        height - TOP_MARGIN - CONTROLS_GAP - CONTROLS_AREA_SIZE - MARGIN;
      this.cellSize = Math.floor(
        Math.min(availableWidth, availableHeight) / GRID_SIZE
      );
      const boardSize = this.cellSize * GRID_SIZE;
      this.boardOffsetX = (width - boardSize) / 2;
      this.boardOffsetY = TOP_MARGIN + (availableHeight - boardSize) / 2;

      controlsCenterX = width / 2;
      controlsCenterY =
        this.boardOffsetY + boardSize + CONTROLS_GAP + CONTROLS_AREA_SIZE / 2;
    } else {
      // Controls to the left of the board.
      availableWidth = width - CONTROLS_AREA_SIZE - CONTROLS_GAP - MARGIN;
      availableHeight = height - TOP_MARGIN - MARGIN;
      this.cellSize = Math.floor(
        Math.min(availableWidth, availableHeight) / GRID_SIZE
      );
      const boardSize = this.cellSize * GRID_SIZE;
      this.boardOffsetX =
        CONTROLS_AREA_SIZE + CONTROLS_GAP + (availableWidth - boardSize) / 2;
      this.boardOffsetY = TOP_MARGIN + (availableHeight - boardSize) / 2;

      controlsCenterX = CONTROLS_AREA_SIZE / 2;
      controlsCenterY = TOP_MARGIN + availableHeight / 2;
    }

    this.createBoard();
    this.createControls(controlsCenterX, controlsCenterY);
  }

  private createBoard(): void {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const isPlayer = row === this.playerRow && col === this.playerCol;
        const square = this.add
          .rectangle(
            this.boardOffsetX + col * this.cellSize,
            this.boardOffsetY + row * this.cellSize,
            this.cellSize,
            this.cellSize,
            isPlayer ? 0x000000 : 0xffffff
          )
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x888888);

        this.squares.set(squareKey(row, col), square);
      }
    }
  }

  private createControls(centerX: number, centerY: number): void {
    const spacing = 50;

    const directions: Direction[] = [
      { label: "▲", dRow: -1, dCol: 0, x: centerX, y: centerY - spacing },
      { label: "▼", dRow: 1, dCol: 0, x: centerX, y: centerY + spacing },
      { label: "◀", dRow: 0, dCol: -1, x: centerX - spacing, y: centerY },
      { label: "▶", dRow: 0, dCol: 1, x: centerX + spacing, y: centerY },
    ];

    for (const direction of directions) {
      const button = this.add
        .text(direction.x, direction.y, direction.label, {
          fontSize: "24px",
          color: "#ffffff",
          backgroundColor: "#1565c0",
          padding: { x: 14, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      button.on("pointerover", () =>
        button.setStyle({ backgroundColor: "#1976d2" })
      );
      button.on("pointerout", () =>
        button.setStyle({ backgroundColor: "#1565c0" })
      );
      button.on("pointerdown", () => {
        this.movePlayer(direction.dRow, direction.dCol);
      });

      this.controlButtons.push(button);
    }
  }

  private movePlayer(dRow: number, dCol: number): void {
    const row = this.playerRow + dRow;
    const col = this.playerCol + dCol;
    const inBounds =
      row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
    if (!inBounds) return;

    this.getSquare(this.playerRow, this.playerCol).setFillStyle(0xffffff);
    this.getSquare(row, col).setFillStyle(0x000000);
    this.playerRow = row;
    this.playerCol = col;
  }

  private getSquare(row: number, col: number): Phaser.GameObjects.Rectangle {
    const square = this.squares.get(squareKey(row, col));
    if (!square) {
      throw new Error(`No square at row ${String(row)}, col ${String(col)}`);
    }
    return square;
  }
}

function squareKey(row: number, col: number): string {
  return `${String(row)}-${String(col)}`;
}
