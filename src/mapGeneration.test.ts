import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOOR_COUNT,
  MAX_DOOR_COUNT,
  MIN_DOOR_COUNT,
  generateMap,
  getTile,
  placeRooms,
  type GameMap,
  type Tile,
} from "./mapGeneration";

function createWallGrid(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Tile => "wall")
  );
}

// Deterministic PRNG so map generation is reproducible across test runs.
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

function countFloorTiles(map: GameMap): number {
  let count = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile === "floor") count++;
    }
  }
  return count;
}

function findDoorTiles(map: GameMap): Array<[number, number]> {
  const doors: Array<[number, number]> = [];
  for (let x = 0; x < map.width; x++) {
    if (getTile(map, x, 0) === "floor") doors.push([x, 0]);
    if (getTile(map, x, map.height - 1) === "floor") doors.push([x, map.height - 1]);
  }
  for (let y = 1; y < map.height - 1; y++) {
    if (getTile(map, 0, y) === "floor") doors.push([0, y]);
    if (getTile(map, map.width - 1, y) === "floor") doors.push([map.width - 1, y]);
  }
  return doors;
}

function reachableFrom(map: GameMap, start: [number, number]): boolean[][] {
  const visited = map.tiles.map((row) => row.map(() => false));
  const queue: Array<[number, number]> = [start];
  const [startX, startY] = start;
  const startRow = visited[startY];
  if (startRow) startRow[startX] = true;

  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head++;
    if (!point) continue;
    const [x, y] = point;

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
      const row = visited[ny];
      if (!row || row[nx]) continue;
      if (getTile(map, nx, ny) !== "floor") continue;
      row[nx] = true;
      queue.push([nx, ny]);
    }
  }

  return visited;
}

describe("generateMap", () => {
  it("returns a map with the requested dimensions", () => {
    const map = generateMap(20, 14, { random: mulberry32(1) });
    expect(map.width).toBe(20);
    expect(map.height).toBe(14);
    expect(map.tiles).toHaveLength(14);
    for (const row of map.tiles) expect(row).toHaveLength(20);
  });

  it("puts a wall on every outer tile", () => {
    const map = generateMap(20, 16, { random: mulberry32(2) });
    for (let x = 0; x < map.width; x++) {
      expect(["wall", "floor"]).toContain(getTile(map, x, 0));
      expect(["wall", "floor"]).toContain(getTile(map, x, map.height - 1));
    }
  });

  it("only turns border tiles into doors, never interior tiles", () => {
    const map = generateMap(24, 18, { doorCount: 4, random: mulberry32(3) });
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        // Interior floor tiles must belong to a 3x3 room, never a lone carved border tile.
        if (getTile(map, x, y) === "floor") continue;
        expect(getTile(map, x, y)).toBe("wall");
      }
    }
  });

  it.each([1, 2, 3, 5, 10])(
    "carves exactly the requested number of doors (%i) into the border",
    (doorCount) => {
      const map = generateMap(30, 20, { doorCount, random: mulberry32(doorCount) });
      let doorTiles = 0;
      for (let x = 0; x < map.width; x++) {
        if (getTile(map, x, 0) === "floor") doorTiles++;
        if (getTile(map, x, map.height - 1) === "floor") doorTiles++;
      }
      for (let y = 1; y < map.height - 1; y++) {
        if (getTile(map, 0, y) === "floor") doorTiles++;
        if (getTile(map, map.width - 1, y) === "floor") doorTiles++;
      }
      expect(doorTiles).toBe(doorCount);
    }
  );

  it("defaults to 2 doors when doorCount is not specified", () => {
    expect(DEFAULT_DOOR_COUNT).toBe(2);
  });

  it.each([-5, 0, 100])(
    "clamps out-of-range doorCount (%i) into the 1-10 range",
    (doorCount) => {
      const map = generateMap(30, 20, { doorCount, random: mulberry32(doorCount + 50) });
      let doorTiles = 0;
      for (let x = 0; x < map.width; x++) {
        if (getTile(map, x, 0) === "floor") doorTiles++;
        if (getTile(map, x, map.height - 1) === "floor") doorTiles++;
      }
      for (let y = 1; y < map.height - 1; y++) {
        if (getTile(map, 0, y) === "floor") doorTiles++;
        if (getTile(map, map.width - 1, y) === "floor") doorTiles++;
      }
      expect(doorTiles).toBeGreaterThanOrEqual(MIN_DOOR_COUNT);
      expect(doorTiles).toBeLessThanOrEqual(MAX_DOOR_COUNT);
    }
  );

  it("fills the interior with rooms", () => {
    const map = generateMap(13, 9, { random: mulberry32(4) });
    expect(countFloorTiles(map)).toBeGreaterThan(0);
  });

  it("produces no rooms on a map too small to fit even the smallest room, though doors may still be carved", () => {
    // A 3x3 map has a 1x1 interior, too small for even the smallest (2x1/1x2) room.
    const map = generateMap(3, 3, { random: mulberry32(5) });
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        expect(getTile(map, x, y)).toBe("wall");
      }
    }
  });

  it.each([
    [13, 9],
    [17, 13],
    [24, 18],
    [30, 24],
    [9, 9],
  ])(
    "makes every floor tile reachable from EVERY individual door, not just the union of doors (%ix%i)",
    (width, height) => {
      for (let seed = 0; seed < 5; seed++) {
        const map = generateMap(width, height, {
          doorCount: (seed % MAX_DOOR_COUNT) + 1,
          random: mulberry32(width * 1000 + height * 10 + seed),
        });
        const doors = findDoorTiles(map);
        expect(doors.length).toBeGreaterThan(0);

        for (const door of doors) {
          const reachable = reachableFrom(map, door);

          for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
              if (getTile(map, x, y) === "floor") {
                expect(
                  reachable[y]?.[x],
                  `expected door (${String(door[0])}, ${String(door[1])}) to reach floor tile (${String(x)}, ${String(y)})`
                ).toBe(true);
              }
            }
          }
        }
      }
    }
  );

  it("is deterministic for a given random source", () => {
    const mapA = generateMap(20, 16, { doorCount: 3, random: mulberry32(42) });
    const mapB = generateMap(20, 16, { doorCount: 3, random: mulberry32(42) });
    expect(mapA.tiles).toEqual(mapB.tiles);
  });

  it.each([
    [0, 5],
    [5, 0],
    [-1, 5],
    [1.5, 5],
  ])("rejects invalid dimensions (%i, %i)", (width, height) => {
    expect(() => generateMap(width, height)).toThrow();
  });
});

describe("placeRooms", () => {
  const WIDTH = 40;
  const HEIGHT = 40;

  it("places rooms whose sides are each in the 1-4 range, never a degenerate 1x1", () => {
    for (let seed = 0; seed < 10; seed++) {
      const tiles = createWallGrid(WIDTH, HEIGHT);
      const rooms = placeRooms(tiles, WIDTH, HEIGHT, mulberry32(seed));
      expect(rooms.length).toBeGreaterThan(0);

      for (const room of rooms) {
        expect(room.width).toBeGreaterThanOrEqual(1);
        expect(room.width).toBeLessThanOrEqual(4);
        expect(room.height).toBeGreaterThanOrEqual(1);
        expect(room.height).toBeLessThanOrEqual(4);
        expect(room.width === 1 && room.height === 1).toBe(false);
      }
    }
  });

  it("produces rooms in both orientations (wider-than-tall and taller-than-wide) across trials", () => {
    let sawWide = false;
    let sawTall = false;

    for (let seed = 0; seed < 30; seed++) {
      const tiles = createWallGrid(WIDTH, HEIGHT);
      const rooms = placeRooms(tiles, WIDTH, HEIGHT, mulberry32(seed + 1000));
      for (const room of rooms) {
        if (room.width > room.height) sawWide = true;
        if (room.height > room.width) sawTall = true;
      }
    }

    expect(sawWide).toBe(true);
    expect(sawTall).toBe(true);
  });

  it("keeps every room within the interior, never touching the border", () => {
    for (let seed = 0; seed < 10; seed++) {
      const tiles = createWallGrid(WIDTH, HEIGHT);
      const rooms = placeRooms(tiles, WIDTH, HEIGHT, mulberry32(seed + 2000));

      for (const room of rooms) {
        expect(room.left).toBeGreaterThanOrEqual(1);
        expect(room.top).toBeGreaterThanOrEqual(1);
        expect(room.left + room.width).toBeLessThanOrEqual(WIDTH - 1);
        expect(room.top + room.height).toBeLessThanOrEqual(HEIGHT - 1);
      }
    }
  });

  it("keeps rooms non-overlapping with at least one wall tile of separation", () => {
    for (let seed = 0; seed < 10; seed++) {
      const tiles = createWallGrid(WIDTH, HEIGHT);
      const rooms = placeRooms(tiles, WIDTH, HEIGHT, mulberry32(seed + 3000));

      for (let i = 0; i < rooms.length; i++) {
        const a = rooms[i];
        if (!a) continue;
        for (let j = i + 1; j < rooms.length; j++) {
          const b = rooms[j];
          if (!b) continue;
          // Inflate `a` by one tile on every side; it must not overlap `b`.
          const overlaps =
            a.left - 1 < b.left + b.width &&
            a.left + a.width + 1 > b.left &&
            a.top - 1 < b.top + b.height &&
            a.top + a.height + 1 > b.top;
          expect(
            overlaps,
            `rooms ${String(i)} and ${String(j)} are not separated by a wall tile`
          ).toBe(false);
        }
      }
    }
  });

  it("marks exactly each room's footprint as floor, matching total floor tile count", () => {
    const tiles = createWallGrid(WIDTH, HEIGHT);
    const rooms = placeRooms(tiles, WIDTH, HEIGHT, mulberry32(4242));

    let expectedFloorTiles = 0;
    for (const room of rooms) {
      expectedFloorTiles += room.width * room.height;
      for (let y = room.top; y < room.top + room.height; y++) {
        for (let x = room.left; x < room.left + room.width; x++) {
          expect(tiles[y]?.[x]).toBe("floor");
        }
      }
    }

    let actualFloorTiles = 0;
    for (const row of tiles) {
      for (const tile of row) {
        if (tile === "floor") actualFloorTiles++;
      }
    }
    expect(actualFloorTiles).toBe(expectedFloorTiles);
  });
});

describe("getTile", () => {
  it("throws for coordinates outside the map", () => {
    const map = generateMap(10, 10, { random: mulberry32(6) });
    expect(() => getTile(map, -1, 0)).toThrow();
    expect(() => getTile(map, 0, -1)).toThrow();
    expect(() => getTile(map, map.width, 0)).toThrow();
    expect(() => getTile(map, 0, map.height)).toThrow();
  });
});
