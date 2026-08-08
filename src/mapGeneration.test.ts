import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOOR_COUNT,
  MAX_DOOR_COUNT,
  MIN_DOOR_COUNT,
  canPass,
  createBlankMap,
  createOpenMap,
  generateMap,
  hasWall,
  isInBounds,
  placeRooms,
  type GameMap,
  type Room,
} from "./mapGeneration";

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

function roomsTouch(a: Room, b: Room): boolean {
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;
  const bRight = b.left + b.width;
  const bBottom = b.top + b.height;
  const horizontallyTouching =
    (aRight === b.left || bRight === a.left) && a.top < bBottom && aBottom > b.top;
  const verticallyTouching =
    (aBottom === b.top || bBottom === a.top) && a.left < bRight && aRight > b.left;
  return horizontallyTouching || verticallyTouching;
}

function findDoorTiles(map: GameMap): Array<[number, number]> {
  const doors: Array<[number, number]> = [];
  for (let x = 1; x < map.width - 1; x++) {
    if (!hasWall(map, x, 0, x, -1)) doors.push([x, 0]);
    if (!hasWall(map, x, map.height - 1, x, map.height)) doors.push([x, map.height - 1]);
  }
  for (let y = 1; y < map.height - 1; y++) {
    if (!hasWall(map, 0, y, -1, y)) doors.push([0, y]);
    if (!hasWall(map, map.width - 1, y, map.width, y)) doors.push([map.width - 1, y]);
  }
  return doors;
}

function countDoors(map: GameMap): number {
  return findDoorTiles(map).length;
}

function reachableFrom(map: GameMap, start: [number, number]): boolean[][] {
  const visited = Array.from({ length: map.height }, () =>
    Array.from({ length: map.width }, () => false)
  );
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
      if (!isInBounds(map, nx, ny)) continue;
      const row = visited[ny];
      if (!row || row[nx]) continue;
      if (!canPass(map, x, y, nx, ny)) continue;
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
  });

  it.each([1, 2, 3, 5, 10])(
    "carves exactly the requested number of doors (%i) into the border",
    (doorCount) => {
      const map = generateMap(30, 20, { doorCount, random: mulberry32(doorCount) });
      expect(countDoors(map)).toBe(doorCount);
    }
  );

  it("defaults to 2 doors when doorCount is not specified", () => {
    expect(DEFAULT_DOOR_COUNT).toBe(2);
  });

  it.each([-5, 0, 100])(
    "clamps out-of-range doorCount (%i) into the 1-10 range",
    (doorCount) => {
      const map = generateMap(30, 20, { doorCount, random: mulberry32(doorCount + 50) });
      const doorTiles = countDoors(map);
      expect(doorTiles).toBeGreaterThanOrEqual(MIN_DOOR_COUNT);
      expect(doorTiles).toBeLessThanOrEqual(MAX_DOOR_COUNT);
    }
  );

  it("still produces a valid map on a map too small to fit a full-size room, by cropping rooms to fit", () => {
    // A 3x3 map is smaller than most room draws (up to 4x4), but rooms are now
    // cropped to fit rather than rejected outright, so generation must not throw.
    for (let seed = 0; seed < 10; seed++) {
      const map = generateMap(3, 3, { random: mulberry32(seed + 6000) });
      expect(map.width).toBe(3);
      expect(map.height).toBe(3);
    }
  });

  it.each([
    [13, 9],
    [17, 13],
    [24, 18],
    [30, 24],
    [9, 9],
  ])(
    "makes every room/door tile reachable from EVERY individual door, not just the union of doors (%ix%i)",
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
          for (const otherDoor of doors) {
            expect(
              reachable[otherDoor[1]]?.[otherDoor[0]],
              `expected door (${String(door[0])}, ${String(door[1])}) to reach door (${String(otherDoor[0])}, ${String(otherDoor[1])})`
            ).toBe(true);
          }
        }
      }
    }
  );

  it("is deterministic for a given random source", () => {
    const mapA = generateMap(20, 16, { doorCount: 3, random: mulberry32(42) });
    const mapB = generateMap(20, 16, { doorCount: 3, random: mulberry32(42) });
    expect([...mapA.walls].sort()).toEqual([...mapB.walls].sort());
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

  it("places rooms whose sides are each in the 1-4 range", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = createBlankMap(WIDTH, HEIGHT);
      const rooms = placeRooms(map, mulberry32(seed));
      expect(rooms.length).toBeGreaterThan(0);

      for (const room of rooms) {
        expect(room.width).toBeGreaterThanOrEqual(1);
        expect(room.width).toBeLessThanOrEqual(4);
        expect(room.height).toBeGreaterThanOrEqual(1);
        expect(room.height).toBeLessThanOrEqual(4);
      }
    }
  });

  it("every room after the first touches at least one other placed room", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = createBlankMap(WIDTH, HEIGHT);
      const rooms = placeRooms(map, mulberry32(seed + 4000));
      expect(rooms.length).toBeGreaterThan(1);

      for (let i = 1; i < rooms.length; i++) {
        const room = rooms[i];
        if (!room) continue;
        const touchesAnother = rooms.some(
          (other, j) => j !== i && roomsTouch(room, other)
        );
        expect(touchesAnother, `room ${String(i)} doesn't touch any other room`).toBe(true);
      }
    }
  });

  it("allows a room's random draw to extend past the map edge, cropped to fit", () => {
    // A tiny map makes edge-cropping likely on nearly every placement attempt.
    for (let seed = 0; seed < 20; seed++) {
      const map = createBlankMap(3, 3);
      const rooms = placeRooms(map, mulberry32(seed + 5000));
      for (const room of rooms) {
        expect(room.left).toBeGreaterThanOrEqual(0);
        expect(room.top).toBeGreaterThanOrEqual(0);
        expect(room.left + room.width).toBeLessThanOrEqual(3);
        expect(room.top + room.height).toBeLessThanOrEqual(3);
      }
    }
  });

  it("produces rooms in both orientations (wider-than-tall and taller-than-wide) across trials", () => {
    let sawWide = false;
    let sawTall = false;

    for (let seed = 0; seed < 30; seed++) {
      const map = createBlankMap(WIDTH, HEIGHT);
      const rooms = placeRooms(map, mulberry32(seed + 1000));
      for (const room of rooms) {
        if (room.width > room.height) sawWide = true;
        if (room.height > room.width) sawTall = true;
      }
    }

    expect(sawWide).toBe(true);
    expect(sawTall).toBe(true);
  });

  it("keeps every room within the map bounds", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = createBlankMap(WIDTH, HEIGHT);
      const rooms = placeRooms(map, mulberry32(seed + 2000));

      for (const room of rooms) {
        expect(room.left).toBeGreaterThanOrEqual(0);
        expect(room.top).toBeGreaterThanOrEqual(0);
        expect(room.left + room.width).toBeLessThanOrEqual(WIDTH);
        expect(room.top + room.height).toBeLessThanOrEqual(HEIGHT);
      }
    }
  });

  it("never places overlapping rooms", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = createBlankMap(WIDTH, HEIGHT);
      const rooms = placeRooms(map, mulberry32(seed + 3000));
      let overlapFound = false;

      for (let i = 0; i < rooms.length && !overlapFound; i++) {
        const a = rooms[i];
        if (!a) continue;
        for (let j = i + 1; j < rooms.length; j++) {
          const b = rooms[j];
          if (!b) continue;
          const overlaps =
            a.left < b.left + b.width &&
            a.left + a.width > b.left &&
            a.top < b.top + b.height &&
            a.top + a.height > b.top;
          if (overlaps) {
            overlapFound = true;
            break;
          }
        }
      }

      expect(overlapFound).toBe(false);
    }
  });

  it("keeps every internal wall inside a room open, so any two tiles in a room can reach each other", () => {
    const map = createOpenMap(WIDTH, HEIGHT);
    const rooms = placeRooms(map, mulberry32(4242));

    for (const room of rooms) {
      for (let y = room.top; y < room.top + room.height; y++) {
        for (let x = room.left; x < room.left + room.width; x++) {
          if (x + 1 < room.left + room.width) {
            expect(canPass(map, x, y, x + 1, y)).toBe(true);
          }
          if (y + 1 < room.top + room.height) {
            expect(canPass(map, x, y, x, y + 1)).toBe(true);
          }
        }
      }
    }
  });

  it("encloses each room in walls along its perimeter as it's placed", () => {
    const map = createOpenMap(WIDTH, HEIGHT);
    const rooms = placeRooms(map, mulberry32(777));
    expect(rooms.length).toBeGreaterThan(0);

    for (const room of rooms) {
      for (let y = room.top; y < room.top + room.height; y++) {
        for (let x = room.left; x < room.left + room.width; x++) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            const insideSameRoom =
              nx >= room.left &&
              nx < room.left + room.width &&
              ny >= room.top &&
              ny < room.top + room.height;
            if (insideSameRoom) continue;
            if (!isInBounds(map, nx, ny)) continue;
            expect(canPass(map, x, y, nx, ny)).toBe(false);
          }
        }
      }
    }
  });
});

describe("hasWall / canPass / isInBounds", () => {
  it("blocks movement between tiles with no room or carved corridor between them", () => {
    const map = createBlankMap(10, 10);
    expect(hasWall(map, 5, 5, 6, 5)).toBe(true);
    expect(canPass(map, 5, 5, 6, 5)).toBe(false);
  });

  it("reports out-of-bounds coordinates as impassable", () => {
    const map = createBlankMap(10, 10);
    expect(isInBounds(map, -1, 0)).toBe(false);
    expect(isInBounds(map, 0, -1)).toBe(false);
    expect(isInBounds(map, map.width, 0)).toBe(false);
    expect(isInBounds(map, 0, map.height)).toBe(false);
    expect(canPass(map, 0, 0, -1, 0)).toBe(false);
  });
});
