import Phaser from "phaser";
import { MainMenuScene } from "./MainMenuScene";
import { GameScene } from "./GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  scene: [MainMenuScene, GameScene],
  parent: "game",
  scale: {
    mode: Phaser.Scale.RESIZE,
  },
};

new Phaser.Game(config);
