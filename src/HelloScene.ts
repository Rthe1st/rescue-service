import Phaser from "phaser";

export class HelloScene extends Phaser.Scene {
  constructor() {
    super({ key: "HelloScene" });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 40, "Hello, Phaser 4!", {
        fontSize: "48px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 20, "Click anywhere to change colour", {
        fontSize: "20px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    const graphics = this.add.graphics();
    this.drawStar(graphics, width / 2, height / 2 + 100, 30, 12, 0xffdd00);

    this.input.on("pointerdown", () => {
      const color = Phaser.Display.Color.RandomRGB();
      graphics.clear();
      this.drawStar(
        graphics,
        width / 2,
        height / 2 + 100,
        30,
        12,
        color.color
      );
    });
  }

  private drawStar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    points: number,
    radius: number,
    color: number
  ): void {
    graphics.fillStyle(color, 1);
    graphics.beginPath();

    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? radius : radius / 2;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      if (i === 0) {
        graphics.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
      } else {
        graphics.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
      }
    }

    graphics.closePath();
    graphics.fillPath();
  }
}
