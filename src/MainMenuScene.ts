import Phaser from "phaser";

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MainMenuScene extends Phaser.Scene {
  private titleText: Phaser.GameObjects.Text | undefined;
  private startButton: Phaser.GameObjects.Text | undefined;

  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
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
    startButton.on("pointerdown", () => this.scene.start("GameScene"));

    this.startButton = startButton;
  }

  getTestBounds(): Record<string, ElementBounds> {
    return {
      title: rectFromBounds(this.titleText),
      startButton: rectFromBounds(this.startButton),
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
