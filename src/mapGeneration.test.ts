import { describe, expect, it } from "vitest";
import { floodFillFloor, generateMap } from "./mapGeneration";
import type { GameMap } from "./mapGeneration";

function sequentialRandom(sequence: number[]): () => number {
  let index = 0;
  return () => {
    const value = sequence[index % sequence.length] ?? 0;
    index++;
    return value;
  };
}

function isBorder(x: number, y: number, map: GameMap): boolean {
  return x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1;
}

function allRoomsAccessible(map: GameMap): boolean {
  const accessible = floodFillFloor(map.tiles, map.width, map.height, map.doors);
  return map.rooms.every((room) => {
    for (let dy = 0; dy < room.height; dy++) {
      for (let dx = 0; dx < room.width; dx++) {
        if (accessible.has(`${String(room.x + dx)},${String(room.y + dy)}`)) return true;
      }
    }
    return false;
  });
}

describe("generateMap", () => {
  it("returns a map with the requested dimensions", () => {
    const map = generateMap(13, 9, { random: sequentialRandom([0.1, 0.5, 0.9]) });
    expect(map.width).toBe(13);
    expect(map.height).toBe(9);
    expect(map.tiles).toHaveLength(9);
    for (const row of map.tiles) expect(row).toHaveLength(13);
  });

  it("puts a wall in every outer tile except carved doors", () => {
    const map = generateMap(13, 9, { random: sequentialRandom([0.1, 0.5, 0.9]) });
    const doorKeys = new Set(map.doors.map((d) => `${String(d.x)},${String(d.y)}`));

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!isBorder(x, y, map)) continue;
        const tile = map.tiles[y]?.[x];
        const isDoor = doorKeys.has(`${String(x)},${String(y)}`);
        expect(tile === "floor" ? isDoor : true).toBe(true);
        if (!isDoor) expect(tile).toBe("wall");
      }
    }
  });

  it("fills the interior with 3x3 rooms surrounded by walls", () => {
    const map = generateMap(9, 9, { random: sequentialRandom([0.2]) });

    expect(map.rooms.length).toBeGreaterThan(0);
    for (const room of map.rooms) {
      expect(room.width).toBe(3);
      expect(room.height).toBe(3);
      for (let dy = 0; dy < room.height; dy++) {
        for (let dx = 0; dx < room.width; dx++) {
          expect(map.tiles[room.y + dy]?.[room.x + dx]).toBe("floor");
        }
      }
    }
  });

  it("packs the expected number of rooms into a 9x9 map", () => {
    const map = generateMap(9, 9, { random: sequentialRandom([0.2]) });
    expect(map.rooms).toHaveLength(4);
  });

  it("clamps door count to the 1-10 range", () => {
    const many = generateMap(21, 21, { doorCount: 50, random: sequentialRandom([0.3]) });
    expect(many.doors.length).toBeLessThanOrEqual(10);

    const none = generateMap(21, 21, { doorCount: 0, random: sequentialRandom([0.3]) });
    expect(none.doors.length).toBeGreaterThanOrEqual(1);
  });

  it("defaults to 2 doors", () => {
    const map = generateMap(21, 21, { random: sequentialRandom([0.4]) });
    expect(map.doors).toHaveLength(2);
  });

  it("makes every room reachable from the doors via floor tiles only", () => {
    const randomSequences = [
      [0.05, 0.95, 0.5],
      [0.15, 0.35, 0.55, 0.75],
      [0.99, 0.01, 0.5, 0.5, 0.5],
    ];

    for (const sequence of randomSequences) {
      for (const doorCount of [1, 3, 6]) {
        const map = generateMap(17, 13, { doorCount, random: sequentialRandom(sequence) });
        expect(allRoomsAccessible(map)).toBe(true);
      }
    }
  });

  it("produces deterministic output for a given random function", () => {
    const mapA = generateMap(17, 13, { doorCount: 4, random: sequentialRandom([0.1, 0.2, 0.3, 0.4]) });
    const mapB = generateMap(17, 13, { doorCount: 4, random: sequentialRandom([0.1, 0.2, 0.3, 0.4]) });
    expect(mapA).toEqual(mapB);
  });

  it("handles maps too small to fit any rooms without infinite looping", () => {
    const map = generateMap(4, 4, { random: sequentialRandom([0.5]) });
    expect(map.rooms).toHaveLength(0);
    expect(allRoomsAccessible(map)).toBe(true);
  });

  it("rejects non-positive or non-integer dimensions", () => {
    expect(() => generateMap(0, 5)).toThrow();
    expect(() => generateMap(5, -1)).toThrow();
    expect(() => generateMap(5.5, 5)).toThrow();
  });
});
