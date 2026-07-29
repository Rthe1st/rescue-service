import Phaser from "phaser";

const GRID_SIZE = 16;

export class GameScene extends Phaser.Scene {
  private cellSize = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private squares = new Map<string, Phaser.GameObjects.Rectangle>();
  private playerRow = GRID_SIZE - 1;
  private playerCol = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    const { width, height } = this.scale;

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

    this.createBoard(width, height);
  }

  private createBoard(width: number, height: number): void {
    const availableSize = Math.min(width, height - 80);
    this.cellSize = Math.floor(availableSize / GRID_SIZE);
    const boardSize = this.cellSize * GRID_SIZE;
    this.boardOffsetX = (width - boardSize) / 2;
    this.boardOffsetY = height - boardSize - 20;

    this.playerRow = GRID_SIZE - 1;
    this.playerCol = 0;

    this.squares.clear();
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
          .setStrokeStyle(1, 0x888888)
          .setInteractive({ useHandCursor: true });

        square.on("pointerdown", () => {
          this.onSquareClicked(row, col);
        });
        this.squares.set(squareKey(row, col), square);
      }
    }
  }

  private onSquareClicked(row: number, col: number): void {
    const dRow = Math.abs(row - this.playerRow);
    const dCol = Math.abs(col - this.playerCol);
    const isAdjacent = dRow + dCol === 1;
    if (!isAdjacent) return;

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
