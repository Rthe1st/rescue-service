import Phaser from "phaser";
import { MainMenuScene } from "./MainMenuScene";
import { MapPreviewScene } from "./MapPreviewScene";
import { GameScene } from "./GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  scene: [MainMenuScene, MapPreviewScene, GameScene],
  parent: "game",
  scale: {
    mode: Phaser.Scale.RESIZE,
  },
};

const game = new Phaser.Game(config);

declare global {
  interface Window {
    __PHASER_GAME__: Phaser.Game;
  }
}

window.__PHASER_GAME__ = game;
