import { describe, expect, it } from "vitest";
import { generatePlayerNames } from "./playerNames";

// Deterministic PRNG so name shuffling is reproducible across test runs.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("generatePlayerNames", () => {
  it("returns exactly `count` names", () => {
    const names = generatePlayerNames(3, mulberry32(1));
    expect(names).toHaveLength(3);
  });

  it("returns unique names when count is within the name pool size", () => {
    const names = generatePlayerNames(8, mulberry32(2));
    expect(new Set(names).size).toBe(names.length);
  });

  it("falls back to numbered names once the pool is exhausted", () => {
    const names = generatePlayerNames(30, mulberry32(3));
    expect(names).toHaveLength(30);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(26)).toEqual(["Player 27", "Player 28", "Player 29", "Player 30"]);
  });

  it("is deterministic for a given random source", () => {
    const a = generatePlayerNames(5, mulberry32(42));
    const b = generatePlayerNames(5, mulberry32(42));
    expect(a).toEqual(b);
  });
});
