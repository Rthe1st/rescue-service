import Phaser from "phaser";
import { gameSettings } from "./gameSettings";
import {
  getDoorSegments,
  getReachableTiles,
  getWallSegments,
  isGrass,
  type GameMap,
  type WallSegment,
} from "./mapGeneration";
import {
  DEFAULT_REPLAY_SPEED,
  adjustSpeed,
  clampFrameIndex,
  stepDurationMs,
  type ReplayFrame,
} from "./replay";
import { computeVisibleTilesForAll } from "./visibility";

const TOP_MARGIN = 70;
const BOTTOM_MARGIN = 110;
const MARGIN = 16;
const EMPTY_COLOR = 0xffffff;
const OUTSIDE_COLOR = 0x2e7d32;
const INACCESSIBLE_COLOR = 0x424242;
const WALL_COLOR = 0x212121;
const DOOR_COLOR = 0x795548;
const FLAME_COLOR = 0xe53935;
const HOSE_COLOR = 0xd32f2f;
const PLAYER_COLOR = 0x000000;
const ACTIVE_PLAYER_BORDER_COLOR = 0xffeb3b;

export interface ReplaySceneData {
  map: GameMap;
  gridSize: number;
  frames: ReplayFrame[];
}

// Plays back a finished round move by move. Fog of war is off by default and can be toggled
// here; with it on, tiles outside every player's current line of sight are dimmed and any
// fire on them hidden (no memory - the replay only shows what is visible right now).
export class ReplayScene extends Phaser.Scene {
  private map!: GameMap;
  private gridSize = 0;
  private frames: ReplayFrame[] = [];
  private frameIndex = 0;
  private playing = true;
  private speed = DEFAULT_REPLAY_SPEED;
  private fogOn = false;
  private elapsedMs = 0;
  private accessible = new Set<string>();
  private objects: Phaser.GameObjects.GameObject[] = [];
  private playButton: Phaser.GameObjects.Text | undefined;
  private fogButton: Phaser.GameObjects.Text | undefined;
  private speedText: Phaser.GameObjects.Text | undefined;
  private statusText: Phaser.GameObjects.Text | undefined;

  constructor() {
    super({ key: "ReplayScene" });
  }

  init(data: ReplaySceneData): void {
    this.map = data.map;
    this.gridSize = data.gridSize;
    this.frames = data.frames;
    this.frameIndex = 0;
    this.playing = true;
    this.speed = DEFAULT_REPLAY_SPEED;
    this.fogOn = false;
    this.elapsedMs = 0;
    this.accessible = new Set(
      getReachableTiles(data.map, { x: 0, y: 0 }).map((t) => `${String(t.y)}-${String(t.x)}`)
    );
  }

  create(): void {
    this.render();
    const onResize = (): void => {
      this.render();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    });
  }

  override update(_time: number, delta: number): void {
    if (!this.playing) return;
    this.elapsedMs += delta;
    const stepMs = stepDurationMs(this.speed);
    if (this.elapsedMs < stepMs) return;
    this.elapsedMs = 0;
    if (this.frameIndex >= this.frames.length - 1) {
      this.playing = false;
      this.updateControls();
      return;
    }
    this.goTo(this.frameIndex + 1);
  }

  private goTo(index: number): void {
    this.frameIndex = clampFrameIndex(index, this.frames.length);
    this.elapsedMs = 0;
    this.render();
  }

  private button(
    x: number,
    y: number,
    label: string,
    onClick: () => void
  ): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#424242",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#616161" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#424242" }));
    text.on("pointerdown", onClick);
    this.objects.push(text);
    return text;
  }

  private render(): void {
    for (const obj of this.objects) obj.destroy();
    this.objects = [];

    const frame = this.frames[this.frameIndex];
    if (!frame) return;
    const { width, height } = this.scale;

    const available = Math.min(
      width - MARGIN * 2,
      height - TOP_MARGIN - BOTTOM_MARGIN
    );
    const cell = Math.max(1, Math.floor(available / this.gridSize));
    const boardSize = cell * this.gridSize;
    const offsetX = (width - boardSize) / 2;
    const offsetY = TOP_MARGIN;

    const flames = new Set(frame.flames);
    const visible = this.fogOn
      ? new Set(
          [
            ...computeVisibleTilesForAll(
              this.map,
              frame.players.map((p) => ({ x: p.col, y: p.row })),
              gameSettings.lineOfSightMode
            ),
          ].map((key) => {
            const [x, y] = key.split(",").map(Number);
            return `${String(y ?? 0)}-${String(x ?? 0)}`;
          })
        )
      : undefined;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const key = `${String(row)}-${String(col)}`;
        const hidden = visible !== undefined && !visible.has(key);
        let fill = EMPTY_COLOR;
        if (!hidden && flames.has(key)) fill = FLAME_COLOR;
        else if (!this.accessible.has(key)) fill = INACCESSIBLE_COLOR;
        else if (isGrass(this.map, col, row)) fill = OUTSIDE_COLOR;
        const square = this.add
          .rectangle(offsetX + col * cell, offsetY + row * cell, cell, cell, fill)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x888888);
        this.objects.push(square);
        if (hidden) {
          this.objects.push(
            this.add
              .rectangle(offsetX + col * cell, offsetY + row * cell, cell, cell, 0x000000)
              .setOrigin(0, 0)
              .setAlpha(gameSettings.forgottenCellOpacity / 100)
          );
        }
      }
    }

    const graphics = this.add.graphics();
    this.objects.push(graphics);
    const lineWidth = Math.max(3, Math.round(cell * 0.12));
    const drawSegments = (segments: WallSegment[], color: number): void => {
      graphics.lineStyle(lineWidth, color, 1);
      for (const s of segments) {
        if (s.x1 === s.x2) {
          const y = offsetY + Math.max(s.y1, s.y2) * cell;
          const x = offsetX + s.x1 * cell;
          graphics.lineBetween(x, y, x + cell, y);
        } else {
          const x = offsetX + Math.max(s.x1, s.x2) * cell;
          const y = offsetY + s.y1 * cell;
          graphics.lineBetween(x, y, x, y + cell);
        }
      }
    };
    drawSegments(getWallSegments(this.map), WALL_COLOR);
    drawSegments(getDoorSegments(this.map), DOOR_COLOR);

    const center = (t: { row: number; col: number }): { x: number; y: number } => ({
      x: offsetX + t.col * cell + cell / 2,
      y: offsetY + t.row * cell + cell / 2,
    });
    for (const hose of frame.hoses) {
      const points = hose.path.map(center);
      graphics.lineStyle(Math.max(3, Math.round(cell * 0.2)), HOSE_COLOR, 1);
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (a && b) graphics.lineBetween(a.x, a.y, b.x, b.y);
      }
      const end = points[points.length - 1];
      if (end) {
        graphics.fillStyle(HOSE_COLOR, 1);
        graphics.fillCircle(end.x, end.y, cell * 0.15);
      }
    }

    frame.players.forEach((player, index) => {
      const { x, y } = center(player);
      const marker = this.add.circle(x, y, (cell * 0.8) / 2, PLAYER_COLOR);
      if (index === frame.activePlayerIndex && frame.players.length > 1) {
        marker.setStrokeStyle(3, ACTIVE_PLAYER_BORDER_COLOR, 1);
      }
      this.objects.push(marker);
      this.objects.push(
        this.add
          .text(x, y, player.name.charAt(0).toUpperCase(), {
            fontSize: `${String(Math.max(10, Math.round(cell * 0.6)))}px`,
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0.5)
      );
    });

    this.objects.push(
      this.add
        .text(width / 2, 22, "Replay", { fontSize: "20px", color: "#ffffff", fontStyle: "bold" })
        .setOrigin(0.5)
    );
    this.statusText = this.add
      .text(width / 2, 48, "", { fontSize: "15px", color: "#b0bec5" })
      .setOrigin(0.5);
    this.objects.push(this.statusText);

    const controlsY = offsetY + boardSize + 30;
    const rowTwoY = controlsY + 44;
    const cx = width / 2;
    this.button(cx - 110, controlsY, "⏮ Prev", () => {
      this.playing = false;
      this.goTo(this.frameIndex - 1);
    });
    this.playButton = this.button(cx, controlsY, "⏸ Pause", () => {
      if (!this.playing && this.frameIndex >= this.frames.length - 1) this.frameIndex = 0;
      this.playing = !this.playing;
      this.elapsedMs = 0;
      this.render();
    });
    this.button(cx + 110, controlsY, "Next ⏭", () => {
      this.playing = false;
      this.goTo(this.frameIndex + 1);
    });
    this.button(cx - 150, rowTwoY, "−", () => {
      this.speed = adjustSpeed(this.speed, -1);
      this.updateControls();
    });
    this.speedText = this.add
      .text(cx - 105, rowTwoY, "", { fontSize: "16px", color: "#ffffff" })
      .setOrigin(0.5);
    this.objects.push(this.speedText);
    this.button(cx - 60, rowTwoY, "+", () => {
      this.speed = adjustSpeed(this.speed, 1);
      this.updateControls();
    });
    this.fogButton = this.button(cx + 40, rowTwoY, "", () => {
      this.fogOn = !this.fogOn;
      this.render();
    });
    this.button(cx + 150, rowTwoY, "Menu", () => this.scene.start("MainMenuScene"));
    this.updateControls();
  }

  // Refreshes labels that depend on state without rebuilding the board.
  private updateControls(): void {
    this.playButton?.setText(
      this.playing
        ? "⏸ Pause"
        : this.frameIndex >= this.frames.length - 1
          ? "↺ Replay"
          : "▶ Play"
    );
    this.speedText?.setText(`${String(this.speed)}x`);
    this.fogButton?.setText(this.fogOn ? "Fog: on" : "Fog: off");
    const frame = this.frames[this.frameIndex];
    this.statusText?.setText(
      `Move ${String(this.frameIndex)} / ${String(this.frames.length - 1)}${frame ? ` — ${frame.label}` : ""}`
    );
  }
}
