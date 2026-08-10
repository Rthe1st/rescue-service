import Phaser from "phaser";
import GUI from "lil-gui";
import { createSettingsGui, gameSettings } from "./gameSettings";
import { generateMap } from "./mapGeneration";

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MainMenuScene extends Phaser.Scene {
  private titleText: Phaser.GameObjects.Text | undefined;
  private startButton: Phaser.GameObjects.Text | undefined;
  private settingsButton: Phaser.GameObjects.Text | undefined;
  private gui: GUI | undefined;
  private guiVisible = false;

  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
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
    this.settingsButton = settingsButton;

    const gui = createSettingsGui();
    gui.hide();
    this.guiVisible = false;
    this.gui = gui;

    this.input.keyboard?.on("keydown-BACKTICK", this.toggleDebugGui);

    this.layout();

    const handleResize = (): void => {
      this.layout();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
      this.input.keyboard?.off("keydown-BACKTICK", this.toggleDebugGui);
      gui.destroy();
      this.gui = undefined;
    });
  }

  private layout(): void {
    this.titleText?.destroy();
    this.startButton?.destroy();

    const { width, height } = this.scale;

    this.titleText = this.add
      .text(width / 2, height / 2 - 60, "Fire service rescue mission", {
        fontSize: "40px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 80 },
      })
      .setOrigin(0.5);

    const startButton = this.add
      .text(width / 2, height / 2 + 60, "Start", {
        fontSize: "28px",
        color: "#ffffff",
        backgroundColor: "#2e7d32",
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    startButton.on("pointerover", () =>
      startButton.setStyle({ backgroundColor: "#388e3c" })
    );
    startButton.on("pointerout", () =>
      startButton.setStyle({ backgroundColor: "#2e7d32" })
    );
    startButton.on("pointerdown", () => {
      if (gameSettings.editMapsBeforePlay) {
        this.scene.start("MapPreviewScene");
      } else {
        this.scene.start("GameScene", {
          map: generateMap(gameSettings.gridSize, gameSettings.gridSize, {
            doorCount: gameSettings.doorCount,
            extraDoorPercent: gameSettings.extraDoorPercent,
          }),
        });
      }
    });

    this.startButton = startButton;
  }

  getTestBounds(): Record<string, ElementBounds> {
    return {
      title: rectFromBounds(this.titleText),
      startButton: rectFromBounds(this.startButton),
      settingsButton: rectFromBounds(this.settingsButton),
    };
  }

  private toggleDebugGui = (): void => {
    this.guiVisible = !this.guiVisible;
    this.gui?.show(this.guiVisible);
  };
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
