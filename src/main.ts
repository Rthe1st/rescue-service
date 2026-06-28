import Phaser from "phaser";
import { HelloScene } from "./HelloScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  scene: [HelloScene],
  parent: "game",
};

new Phaser.Game(config);
