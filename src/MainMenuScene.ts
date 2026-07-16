import Phaser from "phaser";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
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
  }
}
