import Phaser from "phaser";
import GUI from "lil-gui";

const DEFAULT_GRID_SIZE = 16;
const DEFAULT_CELL_SIZE_SCALE = 1;
const DEFAULT_BUTTON_FONT_SIZE = 24;
const DEFAULT_BUTTON_SPACING = 50;
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
  private playerRow = DEFAULT_GRID_SIZE - 1;
  private playerCol = 0;
  private gridSize = DEFAULT_GRID_SIZE;
  private cellSizeScale = DEFAULT_CELL_SIZE_SCALE;
  private buttonFontSize = DEFAULT_BUTTON_FONT_SIZE;
  private buttonSpacing = DEFAULT_BUTTON_SPACING;
  private gui: GUI | undefined;
  private guiVisible = false;

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

    this.gridSize = DEFAULT_GRID_SIZE;
    this.cellSizeScale = DEFAULT_CELL_SIZE_SCALE;
    this.buttonFontSize = DEFAULT_BUTTON_FONT_SIZE;
    this.buttonSpacing = DEFAULT_BUTTON_SPACING;
    this.playerRow = this.gridSize - 1;
    this.playerCol = 0;

    this.layout();
    this.setupDebugGui();

    const handleResize = (): void => {
      this.layout();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
    });
  }

  private setupDebugGui(): void {
    const params = {
      gridSize: this.gridSize,
      cellSizeScale: this.cellSizeScale,
      buttonSize: this.buttonFontSize,
      buttonSpacing: this.buttonSpacing,
    };

    const gui = new GUI({ title: "Game parameters" });

    gui
      .add(params, "gridSize", 4, 32, 1)
      .name("Number of squares")
      .onChange((value: number) => {
        this.gridSize = value;
        this.playerRow = Math.min(this.playerRow, this.gridSize - 1);
        this.playerCol = Math.min(this.playerCol, this.gridSize - 1);
        this.layout();
      });
    gui
      .add(params, "cellSizeScale", 0.5, 1.5, 0.05)
      .name("Square size")
      .onChange((value: number) => {
        this.cellSizeScale = value;
        this.layout();
      });
    gui
      .add(params, "buttonSize", 12, 48, 1)
      .name("Arrow control size")
      .onChange((value: number) => {
        this.buttonFontSize = value;
        this.layout();
      });
    gui
      .add(params, "buttonSpacing", 20, 100, 1)
      .name("Arrow control spacing")
      .onChange((value: number) => {
        this.buttonSpacing = value;
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
        this.boardOffsetY + boardSize + CONTROLS_GAP + CONTROLS_AREA_SIZE / 2;
    } else {
      // Controls to the left of the board.
      availableWidth = width - CONTROLS_AREA_SIZE - CONTROLS_GAP - MARGIN;
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
        CONTROLS_AREA_SIZE + CONTROLS_GAP + (availableWidth - boardSize) / 2;
      this.boardOffsetY = TOP_MARGIN + (availableHeight - boardSize) / 2;

      controlsCenterX = CONTROLS_AREA_SIZE / 2;
      controlsCenterY = TOP_MARGIN + availableHeight / 2;
    }

    this.createBoard();
    this.createControls(controlsCenterX, controlsCenterY);
  }

  private createBoard(): void {
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
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
    const spacing = this.buttonSpacing;
    const padding = {
      x: Math.round(this.buttonFontSize * (14 / 24)),
      y: Math.round(this.buttonFontSize * (10 / 24)),
    };

    const directions: Direction[] = [
      { label: "▲", dRow: -1, dCol: 0, x: centerX, y: centerY - spacing },
      { label: "▼", dRow: 1, dCol: 0, x: centerX, y: centerY + spacing },
      { label: "◀", dRow: 0, dCol: -1, x: centerX - spacing, y: centerY },
      { label: "▶", dRow: 0, dCol: 1, x: centerX + spacing, y: centerY },
    ];

    for (const direction of directions) {
      const button = this.add
        .text(direction.x, direction.y, direction.label, {
          fontSize: `${String(this.buttonFontSize)}px`,
          color: "#ffffff",
          backgroundColor: "#1565c0",
          padding,
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
      row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize;
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
