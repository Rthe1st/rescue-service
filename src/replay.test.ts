import { describe, expect, it } from "vitest";
import {
  adjustSpeed,
  clampFrameIndex,
  cloneFrame,
  stepDurationMs,
  type ReplayFrame,
} from "./replay";

describe("replay helpers", () => {
  it("shows a move for one second at the default speed", () => {
    expect(stepDurationMs(1)).toBe(1000);
    expect(stepDurationMs(2)).toBe(500);
  });

  it("steps speed up and down, clamped at the ends", () => {
    expect(adjustSpeed(1, 1)).toBe(2);
    expect(adjustSpeed(1, -1)).toBe(0.5);
    expect(adjustSpeed(8, 1)).toBe(8);
    expect(adjustSpeed(0.25, -1)).toBe(0.25);
  });

  it("clamps frame indices", () => {
    expect(clampFrameIndex(-3, 5)).toBe(0);
    expect(clampFrameIndex(9, 5)).toBe(4);
    expect(clampFrameIndex(2, 0)).toBe(0);
  });

  it("deep-clones frames", () => {
    const frame: ReplayFrame = {
      players: [{ name: "A", row: 0, col: 0 }],
      activePlayerIndex: 0,
      flames: ["1-1"],
      hoses: [{ path: [{ row: 0, col: 0 }], carriedBy: null }],
      label: "Start",
    };
    const copy = cloneFrame(frame);
    frame.players.push({ name: "B", row: 5, col: 5 });
    frame.hoses[0]?.path.push({ row: 1, col: 1 });
    expect(copy.players).toHaveLength(1);
    expect(copy.hoses[0]?.path).toHaveLength(1);
  });
});
