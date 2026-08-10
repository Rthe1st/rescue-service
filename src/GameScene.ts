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
  type Room,
  type WallSegment,
} from "./mapGeneration";
import { generatePlayerNames } from "./playerNames";
import { computeVisibleTilesForAll, roomAt } from "./visibility";

const CONTROLS_AREA_SIZE = 140;
const TOP_MARGIN = 104;
const TURN_ORDER_TEXT_Y = 82;
const MARGIN = 20;
const CONTROLS_GAP = 20;

const BURN_PHASE_DURATION_MS = 1_000;

const EMPTY_COLOR = 0xffffff;
const OUTSIDE_COLOR = 0x2e7d32;
const INACCESSIBLE_COLOR = 0x424242;
const FOG_COLOR = 0xbdbdbd;
const WALL_COLOR = 0x212121;
const DOOR_COLOR = 0x795548;
const PLAYER_COLOR = 0x000000;
const FLAME_COLOR = 0xe53935;
const ACTIVE_PLAYER_BORDER_COLOR = 0xffeb3b;
const ACTIVE_PLAYER_BORDER_WIDTH = 3;
const PLAYER_CIRCLE_SIZE_RATIO = 0.8;

const HOSE_COLOR = 0xd32f2f;
const HOSE_LINE_WIDTH_RATIO = 0.2;
const HOSE_END_MARKER_RADIUS_RATIO = 0.15;

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

interface Player {
  name: string;
  row: number;
  col: number;
}

interface HoseTile {
  row: number;
  col: number;
}

// A hose is a path of tiles, ordered from its fixed anchor end (`path[0]`, always the
// tile it started the round on) to its loose end (the last entry). Only the loose end can
// ever be picked up or moves - the anchor end never changes once placed. `path.length` is
// always at least 1 - it never has zero tiles.
interface HoseState {
  path: HoseTile[];
  carriedBy: number | null;
}

function sameTile(a: HoseTile, b: HoseTile): boolean {
  return a.row === b.row && a.col === b.col;
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
  private players: Player[] = [];
  private activePlayerIndex = 0;
  private playerLabels = new Map<number, Phaser.GameObjects.Text>();
  private playerMarkers = new Map<number, Phaser.GameObjects.Arc>();
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
  private extraDoorPercent = gameSettings.extraDoorPercent;
  private gameOver = false;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private turnOrderText!: Phaser.GameObjects.Text;
  private map!: GameMap;
  private providedMap: GameMap | undefined;
  private accessibleTiles = new Set<string>();
  private hoses: HoseState[] = [];
  private hoseGraphics: Phaser.GameObjects.Graphics | undefined;
  private hoseButton: Phaser.GameObjects.Text | undefined;
  private sprayButton: Phaser.GameObjects.Text | undefined;
  private sprayArmed = false;
  private maxHoseLength = gameSettings.maxHoseLength;
  private hoseSprayRange = gameSettings.hoseSprayRange;
  private hoseCount = gameSettings.hoseCount;
  private fogOfWarEnabled = gameSettings.fogOfWarEnabled;
  private fogOfWarMemoryRooms = gameSettings.fogOfWarMemoryRooms;
  private fogOfWarStaticMemory = gameSettings.fogOfWarStaticMemory;
  private roomsByKey = new Map<string, Room>();
  private visibleTiles = new Set<string>();
  private currentRoomKeys = new Set<string>();
  private memorizedRoomKeys: string[] = [];
  private roomFlameSnapshots = new Map<string, Set<string>>();

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

    const sprayButton = this.add
      .text(width - 30, 30, "💦", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#0277bd",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5);

    sprayButton.on("pointerdown", () => {
      if (!this.canMove() || !this.carriedHose(this.activePlayerIndex)) return;
      this.sprayArmed = !this.sprayArmed;
      this.updateSprayButton();
    });

    this.endGameButton = endGameButton;
    this.settingsButton = settingsButton;
    this.sprayButton = sprayButton;

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
    this.turnOrderText = this.add
      .text(width / 2, TURN_ORDER_TEXT_Y, "", {
        fontSize: "14px",
        color: "#b0bec5",
      })
      .setOrigin(0.5);

    this.applySettings();
    this.setMap(
      this.providedMap ??
        generateMap(this.gridSize, this.gridSize, {
          doorCount: this.doorCount,
          extraDoorPercent: this.extraDoorPercent,
        })
    );
    this.providedMap = undefined;
    this.startRound();

    this.layout();
    this.setupDebugGui();
    this.updatePhaseText();

    const handleResize = (): void => {
      this.endGameButton?.setX(this.scale.width / 2);
      this.sprayButton?.setX(this.scale.width - 30);
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
    this.extraDoorPercent = gameSettings.extraDoorPercent;
    this.maxHoseLength = gameSettings.maxHoseLength;
    this.hoseSprayRange = gameSettings.hoseSprayRange;
    this.hoseCount = gameSettings.hoseCount;
    this.fogOfWarEnabled = gameSettings.fogOfWarEnabled;
    this.fogOfWarMemoryRooms = gameSettings.fogOfWarMemoryRooms;
    this.fogOfWarStaticMemory = gameSettings.fogOfWarStaticMemory;
  }

  private startRound(): void {
    this.placePlayersAtStart();
    this.placeHosesAtStart();
    this.phase = "firefighting";
    this.phaseTimerMs = this.firefightingDurationMs;
    this.gameOver = false;
    this.flames = new Set();
    this.igniteRandomFlame();
    this.updateTurnOrderText();

    // A fresh round starts with nothing remembered yet, even on an unchanged map.
    this.currentRoomKeys = new Set();
    this.memorizedRoomKeys = [];
    this.roomFlameSnapshots = new Map();
  }

  private placePlayersAtStart(): void {
    const count = Math.max(1, Math.floor(gameSettings.playerCount));
    const names = generatePlayerNames(count);
    const positions = this.pickDistinctStartPositions(count);
    this.players = positions.map((position, i) => ({
      name: names[i] ?? `Player ${String(i + 1)}`,
      row: position.y,
      col: position.x,
    }));
    this.activePlayerIndex = 0;
  }

  // Fills from a shuffled list of outer-ring tiles first (mirroring the single-player start
  // rule: always begin on the ring, which is guaranteed walkable and connects to every room),
  // then falls back to any other accessible tile once the ring runs out, so no two player
  // characters ever start on the same tile.
  private pickDistinctStartPositions(count: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];
    const used = new Set<string>();

    const addIfUnused = (x: number, y: number): void => {
      const key = `${String(x)},${String(y)}`;
      if (used.has(key)) return;
      used.add(key);
      positions.push({ x, y });
    };

    const ringTiles: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (isOuterRing(this.map, x, y)) ringTiles.push({ x, y });
      }
    }
    for (const tile of shuffleArray(ringTiles)) {
      if (positions.length >= count) break;
      addIfUnused(tile.x, tile.y);
    }

    if (positions.length < count) {
      for (const key of shuffleArray([...this.accessibleTiles])) {
        if (positions.length >= count) break;
        const [row, col] = parseSquareKey(key);
        addIfUnused(col, row);
      }
    }

    // Only reachable if the map has fewer walkable tiles than requested players; reuse
    // positions rather than leaving characters unplaced.
    for (let i = 0; positions.length < count && positions.length > 0; i++) {
      positions.push(positions[i % positions.length] ?? { x: 0, y: this.gridSize - 1 });
    }

    return positions;
  }

  // Each hose starts on its own tile on the outer ring ("a green square at the edge of the
  // map"), same rule as the single-player start tile, but never on a tile a player
  // character or another hose already occupies. `hoseCount` (0-10) controls how many are
  // placed each round.
  private placeHosesAtStart(): void {
    const occupied = new Set(
      this.players.map((player) => squareKey(player.row, player.col))
    );

    const ringTiles: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (isOuterRing(this.map, x, y) && !occupied.has(squareKey(y, x))) {
          ringTiles.push({ x, y });
        }
      }
    }

    const shuffledRing = shuffleArray(ringTiles);
    const fallback = shuffleArray([...this.accessibleTiles]).filter(
      (key) => !occupied.has(key)
    );

    const count = Math.max(0, Math.floor(this.hoseCount));
    const choices: Array<{ x: number; y: number }> = [];
    for (const tile of shuffledRing) {
      if (choices.length >= count) break;
      choices.push(tile);
      occupied.add(squareKey(tile.y, tile.x));
    }
    for (const key of fallback) {
      if (choices.length >= count) break;
      if (occupied.has(key)) continue;
      const [row, col] = parseSquareKey(key);
      choices.push({ x: col, y: row });
      occupied.add(key);
    }

    this.hoses = choices.map((choice) => ({
      path: [{ row: choice.y, col: choice.x }],
      carriedBy: null,
    }));
  }

  // Records `map` and re-derives which tiles are reachable at all (so pockets cut off from
  // the rest of the map render distinctly), from (0, 0) - always a ring tile, and every room
  // is guaranteed to reach the ring during generation, so this reaches everything playable.
  private setMap(map: GameMap): void {
    this.map = map;
    this.accessibleTiles = new Set(
      getReachableTiles(map, { x: 0, y: 0 }).map((tile) => squareKey(tile.y, tile.x))
    );
    this.roomsByKey = new Map(map.rooms.map((room) => [roomKey(room), room]));
    this.visibleTiles = new Set();
    this.currentRoomKeys = new Set();
    this.memorizedRoomKeys = [];
    this.roomFlameSnapshots = new Map();
  }

  private setupDebugGui(): void {
    const gui = createSettingsGui(() => {
      const previousDoorCount = this.doorCount;
      const previousExtraDoorPercent = this.extraDoorPercent;
      const previousPlayerCount = this.players.length;
      const previousHoseCount = this.hoseCount;
      this.applySettings();
      if (
        this.map.width !== this.gridSize ||
        this.map.height !== this.gridSize ||
        this.doorCount !== previousDoorCount ||
        this.extraDoorPercent !== previousExtraDoorPercent
      ) {
        this.setMap(
          generateMap(this.gridSize, this.gridSize, {
            doorCount: this.doorCount,
            extraDoorPercent: this.extraDoorPercent,
          })
        );
        this.startRound();
      } else if (
        gameSettings.playerCount !== previousPlayerCount ||
        this.hoseCount !== previousHoseCount
      ) {
        this.startRound();
      } else {
        for (const player of this.players) {
          player.row = Math.min(player.row, this.gridSize - 1);
          player.col = Math.min(player.col, this.gridSize - 1);
        }
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
    this.updateVisibility();

    for (const square of this.squares.values()) square.destroy();
    this.squares.clear();
    for (const button of this.controlButtons) button.destroy();
    this.controlButtons = [];
    this.hoseButton?.destroy();
    this.hoseButton = undefined;

    const { width, height } = this.scale;
    this.timerText.setX(width / 2);
    this.statusText.setX(width / 2);
    this.turnOrderText.setX(width / 2);
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
    this.drawHoses();
    this.createPlayerMarkers();
    this.createPlayerLabels();
    this.createControls(controlsCenterX, controlsCenterY);
    this.createHoseButton(controlsCenterX, controlsCenterY);
    this.updateSprayButton();
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

  // Draws every hose as a thick red line through the tile centers of every tile it
  // occupies, plus a small marker on its loose end (`path`'s last tile) so a single-tile
  // hose that hasn't been carried anywhere yet is still visible to pick up.
  private drawHoses(): void {
    this.hoseGraphics?.destroy();
    const graphics = this.add.graphics();

    const centerOf = (tile: HoseTile): { x: number; y: number } => ({
      x: this.boardOffsetX + tile.col * this.cellSize + this.cellSize / 2,
      y: this.boardOffsetY + tile.row * this.cellSize + this.cellSize / 2,
    });

    for (const hose of this.hoses) {
      if (hose.path.length >= 2) {
        const lineWidth = Math.max(3, Math.round(this.cellSize * HOSE_LINE_WIDTH_RATIO));
        graphics.lineStyle(lineWidth, HOSE_COLOR, 1);
        const points = hose.path.map(centerOf);
        for (let i = 0; i < points.length - 1; i++) {
          const from = points[i];
          const to = points[i + 1];
          if (!from || !to) continue;
          graphics.lineBetween(from.x, from.y, to.x, to.y);
        }
      }

      const looseEnd = hose.path[hose.path.length - 1];
      if (looseEnd) {
        const { x, y } = centerOf(looseEnd);
        graphics.fillStyle(HOSE_COLOR, 1);
        graphics.fillCircle(x, y, this.cellSize * HOSE_END_MARKER_RADIUS_RATIO);
      }
    }

    this.hoseGraphics = graphics;
  }

  // Recomputes what's currently visible (the union of every player's own view - see
  // `computeVisibleTilesForAll`) and updates the room-memory state that drives fog-of-war
  // rendering: every room a player is currently standing in is added to `memorizedRoomKeys`
  // (most-recently-entered last, trimmed to `fogOfWarMemoryRooms`), and any room that was
  // current last call but isn't anymore gets a snapshot of its flame tiles taken - the frozen
  // view `fogOfWarStaticMemory` renders for it until a player can see it again. Cheap to call
  // whenever fog of war is off; still runs so memory state doesn't go stale while it's off,
  // in case it's toggled back on mid-round.
  private updateVisibility(): void {
    this.visibleTiles = new Set(
      [...computeVisibleTilesForAll(this.map, this.players.map((player) => ({ x: player.col, y: player.row })))].map(
        (key) => {
          const [x, y] = key.split(",").map(Number);
          return squareKey(y ?? 0, x ?? 0);
        }
      )
    );

    const nextCurrentRoomKeys = new Set<string>();
    for (const player of this.players) {
      const room = roomAt(this.map, player.col, player.row);
      if (room) nextCurrentRoomKeys.add(roomKey(room));
    }

    for (const key of this.currentRoomKeys) {
      if (nextCurrentRoomKeys.has(key)) continue;
      const room = this.roomsByKey.get(key);
      if (room) this.roomFlameSnapshots.set(key, this.snapshotFlamesInRoom(room));
    }

    for (const key of nextCurrentRoomKeys) {
      const existingIndex = this.memorizedRoomKeys.indexOf(key);
      if (existingIndex !== -1) this.memorizedRoomKeys.splice(existingIndex, 1);
      this.memorizedRoomKeys.push(key);
    }
    if (this.fogOfWarMemoryRooms <= 0) {
      this.memorizedRoomKeys = [];
    } else if (this.memorizedRoomKeys.length > this.fogOfWarMemoryRooms) {
      this.memorizedRoomKeys = this.memorizedRoomKeys.slice(-this.fogOfWarMemoryRooms);
    }

    this.currentRoomKeys = nextCurrentRoomKeys;
  }

  private snapshotFlamesInRoom(room: Room): Set<string> {
    const snapshot = new Set<string>();
    for (let y = room.top; y < room.top + room.height; y++) {
      for (let x = room.left; x < room.left + room.width; x++) {
        const key = squareKey(y, x);
        if (this.flames.has(key)) snapshot.add(key);
      }
    }
    return snapshot;
  }

  private refreshAllSquareFills(): void {
    for (const [key, square] of this.squares) {
      const [row, col] = parseSquareKey(key);
      square.setFillStyle(this.squareFill(row, col));
    }
  }

  private squareFill(row: number, col: number): number {
    if (!this.fogOfWarEnabled) return this.liveSquareFill(row, col);

    const key = squareKey(row, col);
    if (this.visibleTiles.has(key)) return this.liveSquareFill(row, col);

    const room = roomAt(this.map, col, row);
    const memoryKey = room ? roomKey(room) : undefined;
    if (memoryKey && this.memorizedRoomKeys.includes(memoryKey)) {
      if (!this.fogOfWarStaticMemory) return this.liveSquareFill(row, col);
      const snapshot = this.roomFlameSnapshots.get(memoryKey);
      if (snapshot?.has(key)) return FLAME_COLOR;
      return this.liveSquareFill(row, col, true);
    }

    return FOG_COLOR;
  }

  private liveSquareFill(row: number, col: number, ignoreFlame = false): number {
    if (!ignoreFlame && this.flames.has(squareKey(row, col))) return FLAME_COLOR;
    if (!this.accessibleTiles.has(squareKey(row, col))) return INACCESSIBLE_COLOR;
    if (isGrass(this.map, col, row)) return OUTSIDE_COLOR;
    return EMPTY_COLOR;
  }

  private createPlayerMarkers(): void {
    for (const marker of this.playerMarkers.values()) marker.destroy();
    this.playerMarkers.clear();

    const radius = (this.cellSize * PLAYER_CIRCLE_SIZE_RATIO) / 2;
    this.players.forEach((player, index) => {
      const marker = this.add.circle(
        this.boardOffsetX + player.col * this.cellSize + this.cellSize / 2,
        this.boardOffsetY + player.row * this.cellSize + this.cellSize / 2,
        radius,
        PLAYER_COLOR
      );
      this.playerMarkers.set(index, marker);
    });

    this.updateActivePlayerBorder();
  }

  private createPlayerLabels(): void {
    for (const label of this.playerLabels.values()) label.destroy();
    this.playerLabels.clear();

    const fontSize = Math.max(10, Math.round(this.cellSize * 0.6));
    this.players.forEach((player, index) => {
      const label = this.add
        .text(
          this.boardOffsetX + player.col * this.cellSize + this.cellSize / 2,
          this.boardOffsetY + player.row * this.cellSize + this.cellSize / 2,
          player.name.charAt(0).toUpperCase(),
          {
            fontSize: `${String(fontSize)}px`,
            color: "#ffffff",
            fontStyle: "bold",
          }
        )
        .setOrigin(0.5);
      this.playerLabels.set(index, label);
    });
  }

  private updateActivePlayerBorder(): void {
    this.playerMarkers.forEach((marker, index) => {
      if (index === this.activePlayerIndex) {
        marker.setStrokeStyle(ACTIVE_PLAYER_BORDER_WIDTH, ACTIVE_PLAYER_BORDER_COLOR, 1);
      } else {
        marker.setStrokeStyle(0);
      }
    });
  }

  private updateTurnOrderText(): void {
    if (this.players.length <= 1) {
      this.turnOrderText.setText("").setVisible(false);
      return;
    }

    const order = this.players
      .map((player, index) =>
        index === this.activePlayerIndex ? `▶${player.name}` : player.name
      )
      .join("  ");
    this.turnOrderText.setText(`Turn order: ${order}`).setVisible(true);
  }

  private isAnyPlayerOnFlame(): boolean {
    return this.players.some((player) =>
      this.flames.has(squareKey(player.row, player.col))
    );
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
          if (this.sprayArmed) {
            this.sprayHose(direction.dRow, direction.dCol);
          } else {
            this.movePlayer(direction.dRow, direction.dCol);
          }
        });
      }

      this.controlButtons.push(button);
      this.controlButtonsByName.set(direction.name, button);
    }
  }

  // Placed at the center of the D-pad cluster, so picking up/dropping the hose reads as
  // just another part of the movement controls.
  private createHoseButton(centerX: number, centerY: number): void {
    const padding = {
      x: Math.round(this.buttonFontSize * (10 / 24)),
      y: Math.round(this.buttonFontSize * (6 / 24)),
    };

    const button = this.add
      .text(centerX, centerY, "", {
        fontSize: `${String(Math.round(this.buttonFontSize * 0.6))}px`,
        color: "#ffffff",
        backgroundColor: "#6d4c41",
        padding,
        align: "center",
      })
      .setOrigin(0.5);

    button.on("pointerdown", () => {
      this.toggleHoseCarry();
    });
    button.on("pointerover", () => {
      if (this.hoseAction()) button.setStyle({ backgroundColor: "#8d6e63" });
    });
    button.on("pointerout", () => {
      button.setStyle({ backgroundColor: "#6d4c41" });
    });

    this.hoseButton = button;
    this.updateHoseButton();
  }

  // The hose the given player is currently carrying, if any - a player can carry at most
  // one hose at a time.
  private carriedHose(playerIndex: number): HoseState | undefined {
    return this.hoses.find((hose) => hose.carriedBy === playerIndex);
  }

  // What the active player could do with the hose right now, if anything - drives both
  // the hose button's label/availability and what a click on it actually does.
  private hoseAction(): { type: "pickup" | "drop"; hose: HoseState } | null {
    if (!this.canMove()) return null;
    const player = this.players[this.activePlayerIndex];
    if (!player) return null;

    const carried = this.carriedHose(this.activePlayerIndex);
    if (carried) return { type: "drop", hose: carried };

    // Only the loose end can be picked up - the anchor end (`path[0]`) stays fixed at its
    // starting position for good. On a freshly placed hose the two are the same tile. A
    // hose already carried by another player can't be picked up too.
    const pickupable = this.hoses.find((hose) => {
      if (hose.carriedBy !== null) return false;
      const looseEnd = hose.path[hose.path.length - 1];
      return looseEnd !== undefined && sameTile(looseEnd, player);
    });
    return pickupable ? { type: "pickup", hose: pickupable } : null;
  }

  private updateHoseButton(): void {
    const button = this.hoseButton;
    if (!button) return;

    const action = this.hoseAction();
    button.setText(action?.type === "drop" ? "Drop\nhose" : "Pick up\nhose");
    button.setAlpha(action ? 1 : 0.4);
    if (action) button.setInteractive({ useHandCursor: true });
    else button.disableInteractive();
  }

  private toggleHoseCarry(): void {
    const action = this.hoseAction();
    if (!action) return;

    action.hose.carriedBy = action.type === "pickup" ? this.activePlayerIndex : null;

    this.updateHoseButton();
    this.updateSprayButton();
    this.drawHoses();
  }

  // Called only while the active player is carrying a hose, before their move is
  // otherwise committed. Returns whether the move is allowed: growing the hose past
  // `maxHoseLength` is blocked, but retracting it - stepping back onto the tile the
  // hose's loose end just came from - is always allowed, even at max length.
  private extendOrRetractHose(row: number, col: number): boolean {
    const hose = this.carriedHose(this.activePlayerIndex);
    if (!hose) return true;

    const path = hose.path;
    const previous = path[path.length - 2];
    if (previous && previous.row === row && previous.col === col) {
      path.pop();
      return true;
    }
    if (path.length >= this.maxHoseLength) return false;
    path.push({ row, col });
    return true;
  }

  // The spray button only does anything while the active player is carrying a hose;
  // pressing it arms aiming mode without ending the turn, and the next arrow press (in
  // `sprayHose`) fires in that direction and ends the turn instead of moving.
  private updateSprayButton(): void {
    const button = this.sprayButton;
    if (!button) return;

    const available = this.canMove() && this.carriedHose(this.activePlayerIndex) !== undefined;
    if (!available) this.sprayArmed = false;
    button.setVisible(available);
    button.setText(this.sprayArmed ? "🎯" : "💦");
    button.setStyle({ backgroundColor: this.sprayArmed ? "#00b0ff" : "#0277bd" });
    if (available) button.setInteractive({ useHandCursor: true });
    else button.disableInteractive();
  }

  // Sprays water in a straight line from the carrying player's tile, stopping at the
  // first wall, and extinguishes only the nearest flame tile hit along that line (not
  // every flame past it). Doesn't move the player or change the hose's path; it replaces
  // a move for the turn instead, so it advances the active player same as `movePlayer`
  // does.
  private sprayHose(dRow: number, dCol: number): void {
    if (!this.canMove() || !this.carriedHose(this.activePlayerIndex)) return;
    const player = this.players[this.activePlayerIndex];
    if (!player) return;

    let row = player.row;
    let col = player.col;
    for (let i = 0; i < this.hoseSprayRange; i++) {
      const nextRow = row + dRow;
      const nextCol = col + dCol;
      if (!canPass(this.map, col, row, nextCol, nextRow)) break;
      row = nextRow;
      col = nextCol;

      if (this.flames.delete(squareKey(row, col))) {
        this.getSquare(row, col).setFillStyle(this.squareFill(row, col));
        break;
      }
    }

    this.sprayArmed = false;
    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    this.updateTurnOrderText();
    this.updateActivePlayerBorder();
    this.updateHoseButton();
    this.updateSprayButton();
  }

  getTestBounds(): Record<string, ElementBounds> {
    const bounds: Record<string, ElementBounds> = {
      endGameButton: rectFromBounds(this.endGameButton),
      settingsButton: rectFromBounds(this.settingsButton),
      hoseButton: rectFromBounds(this.hoseButton),
      sprayButton: rectFromBounds(this.sprayButton),
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

    const player = this.players[this.activePlayerIndex];
    if (!player) return;

    const row = player.row + dRow;
    const col = player.col + dCol;
    if (!canPass(this.map, player.col, player.row, col, row)) return;

    const occupiedByOther = this.players.some(
      (other, index) => index !== this.activePlayerIndex && other.row === row && other.col === col
    );
    if (occupiedByOther) return;

    if (this.carriedHose(this.activePlayerIndex)) {
      if (!this.extendOrRetractHose(row, col)) return;
    }

    const previousRow = player.row;
    const previousCol = player.col;
    player.row = row;
    player.col = col;

    if (this.fogOfWarEnabled) {
      // Moving can reveal or hide far more than just the tile stepped onto/off of - an
      // entire room's worth of tiles, or everything down a corridor's line of sight - so
      // fog of war needs every square's fill re-evaluated, not just these two.
      this.updateVisibility();
      this.refreshAllSquareFills();
    } else {
      this.getSquare(previousRow, previousCol).setFillStyle(
        this.squareFill(previousRow, previousCol)
      );
      this.getSquare(row, col).setFillStyle(this.squareFill(row, col));
    }

    const markerX = this.boardOffsetX + col * this.cellSize + this.cellSize / 2;
    const markerY = this.boardOffsetY + row * this.cellSize + this.cellSize / 2;
    this.playerMarkers.get(this.activePlayerIndex)?.setPosition(markerX, markerY);
    this.playerLabels.get(this.activePlayerIndex)?.setPosition(markerX, markerY);
    this.drawHoses();

    if (this.isAnyPlayerOnFlame()) {
      this.endGame();
      return;
    }

    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    this.updateTurnOrderText();
    this.updateActivePlayerBorder();
    this.updateHoseButton();
    this.updateSprayButton();
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

    if (this.isAnyPlayerOnFlame()) {
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
    const occupied = new Set(
      this.players.map((player) => squareKey(player.row, player.col))
    );
    const candidates = [...this.accessibleTiles].filter((key) => !occupied.has(key));
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

// Rooms never overlap, so a room's top-left corner uniquely identifies it within a map.
function roomKey(room: Room): string {
  return `${String(room.left)},${String(room.top)}`;
}

function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
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
