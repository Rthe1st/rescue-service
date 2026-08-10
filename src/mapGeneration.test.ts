import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOOR_COUNT,
  DEFAULT_EXTRA_DOOR_PERCENT,
  MAX_DOOR_COUNT,
  addExtraDoors,
  canPass,
  computeGrassTiles,
  createBlankMap,
  createOpenMap,
  generateMap,
  getDoorSegments,
  getReachableTiles,
  hasDoor,
  hasWall,
  isGrass,
  isInAnyRoom,
  isInBounds,
  isOuterRing,
  placeFrontDoors,
  placeRooms,
  type GameMap,
  type Room,
  type WallSegment,
} from "./mapGeneration";

function isFrontDoorSegment(map: GameMap, segment: WallSegment): boolean {
  const aInRoom = isInAnyRoom(map, segment.x1, segment.y1);
  const bInRoom = isInAnyRoom(map, segment.x2, segment.y2);
  const aRing = isOuterRing(map, segment.x1, segment.y1);
  const bRing = isOuterRing(map, segment.x2, segment.y2);
  return (aInRoom && bRing) || (bInRoom && aRing);
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

describe("generateMap", () => {
  it("returns a map with the requested dimensions", () => {
    const map = generateMap(20, 14, { random: mulberry32(1) });
    expect(map.width).toBe(20);
    expect(map.height).toBe(14);
  });

  it("defaults to 2 doors when doorCount is not specified", () => {
    expect(DEFAULT_DOOR_COUNT).toBe(2);
  });

  it.each([-5, 0, 100, 3])(
    "produces at least one door regardless of doorCount (%i), whether clamped or in range",
    (doorCount) => {
      const map = generateMap(30, 20, { doorCount, random: mulberry32(doorCount + 50) });
      expect(getDoorSegments(map).length).toBeGreaterThan(0);
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
    "makes every room reachable from the outer ring (%ix%i)",
    (width, height) => {
      for (let seed = 0; seed < 5; seed++) {
        const map = generateMap(width, height, {
          doorCount: (seed % MAX_DOOR_COUNT) + 1,
          random: mulberry32(width * 1000 + height * 10 + seed),
        });
        expect(map.rooms.length).toBeGreaterThan(0);

        const reachable = new Set(
          getReachableTiles(map, { x: 0, y: 0 }).map((tile) => `${String(tile.x)},${String(tile.y)}`)
        );
        for (const room of map.rooms) {
          expect(
            reachable.has(`${String(room.left)},${String(room.top)}`),
            `expected room at (${String(room.left)}, ${String(room.top)}) to be reachable from the ring`
          ).toBe(true);
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

  it.each([
    [10, 10],
    [13, 9],
    [20, 20],
    [30, 24],
  ])(
    "never places a room touching the map edge, leaving a 1-tile walkable ring free (%ix%i)",
    (width, height) => {
      for (let seed = 0; seed < 10; seed++) {
        const map = createOpenMap(width, height);
        const rooms = placeRooms(map, mulberry32(seed + 7000), {
          left: 1,
          top: 1,
          width: width - 2,
          height: height - 2,
        });
        for (const room of rooms) {
          expect(room.left).toBeGreaterThanOrEqual(1);
          expect(room.top).toBeGreaterThanOrEqual(1);
          expect(room.left + room.width).toBeLessThanOrEqual(width - 1);
          expect(room.top + room.height).toBeLessThanOrEqual(height - 1);
        }
      }
    }
  );

  it.each([
    [10, 10],
    [13, 9],
    [20, 20],
  ])("keeps the entire outer ring walkable all the way around, unblocked by any wall (%ix%i)", (width, height) => {
    for (let seed = 0; seed < 5; seed++) {
      const map = generateMap(width, height, {
        doorCount: (seed % MAX_DOOR_COUNT) + 1,
        random: mulberry32(width * 1000 + height * 10 + seed + 8000),
      });

      const ring: Array<[number, number]> = [];
      for (let x = 0; x < width; x++) {
        ring.push([x, 0]);
        ring.push([x, height - 1]);
      }
      for (let y = 1; y < height - 1; y++) {
        ring.push([0, y]);
        ring.push([width - 1, y]);
      }

      const reachable = new Set(
        getReachableTiles(map, { x: 0, y: 0 }).map((tile) => `${String(tile.x)},${String(tile.y)}`)
      );
      for (const [x, y] of ring) {
        expect(reachable.has(`${String(x)},${String(y)}`), `expected ring tile (${String(x)}, ${String(y)}) to be walkable from (0, 0)`).toBe(true);
      }
    }
  });
});

describe("isOuterRing", () => {
  it("only reports the outermost 1-tile border as the ring", () => {
    const map = createOpenMap(5, 4);
    expect(isOuterRing(map, 0, 0)).toBe(true);
    expect(isOuterRing(map, 4, 0)).toBe(true);
    expect(isOuterRing(map, 0, 3)).toBe(true);
    expect(isOuterRing(map, 4, 3)).toBe(true);
    expect(isOuterRing(map, 2, 0)).toBe(true);
    expect(isOuterRing(map, 0, 2)).toBe(true);
    expect(isOuterRing(map, 2, 2)).toBe(false);
    expect(isOuterRing(map, 1, 1)).toBe(false);
  });
});

describe("getReachableTiles", () => {
  it("only includes the start tile when every neighbor is walled off", () => {
    const map = createBlankMap(5, 5);
    expect(getReachableTiles(map, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it("reaches every tile on a fully open map", () => {
    const map = createOpenMap(5, 5);
    const reachable = getReachableTiles(map, { x: 0, y: 0 });
    expect(reachable).toHaveLength(25);
  });

  it("doesn't cross walls enclosing an isolated tile", () => {
    const map = createOpenMap(6, 6);
    for (const key of ["0,1|1,1", "1,1|2,1", "1,0|1,1", "1,1|1,2"]) map.walls.add(key);

    const reachable = getReachableTiles(map, { x: 0, y: 0 });
    const reachableKeys = new Set(reachable.map((tile) => `${String(tile.x)},${String(tile.y)}`));
    expect(reachableKeys.has("1,1")).toBe(false);
    expect(reachableKeys.has("5,5")).toBe(true);
  });
});

// A map with rooms placed but no front doors or corridor connections carved yet, for testing
// placeFrontDoors in isolation from what connectRoomsSteps might additionally carve.
function roomMap(width: number, height: number, seed: number): GameMap {
  const map = createOpenMap(width, height);
  placeRooms(map, mulberry32(seed), {
    left: 1,
    top: 1,
    width: width - 2,
    height: height - 2,
  });
  return map;
}

describe("placeFrontDoors", () => {
  it.each([1, 2, 3, 5, 10])(
    "carves at most the requested number of doors (%i) between rooms and the ring",
    (doorCount) => {
      const map = roomMap(30, 20, doorCount);
      placeFrontDoors(map, doorCount, mulberry32(doorCount + 500));
      expect(getDoorSegments(map).length).toBeLessThanOrEqual(doorCount);
    }
  );

  it("carves exactly the requested number of doors when enough rooms border the ring", () => {
    let sawFullCount = false;
    for (let seed = 0; seed < 10 && !sawFullCount; seed++) {
      const map = roomMap(40, 30, seed + 13000);
      placeFrontDoors(map, 3, mulberry32(seed + 13500));
      if (getDoorSegments(map).length === 3) sawFullCount = true;
    }
    expect(sawFullCount).toBe(true);
  });

  it("only ever opens a wall directly between a room and the ring", () => {
    const map = roomMap(30, 20, 777);
    placeFrontDoors(map, MAX_DOOR_COUNT, mulberry32(778));
    for (const segment of getDoorSegments(map)) {
      expect(isFrontDoorSegment(map, segment)).toBe(true);
    }
  });
});

function isRoomDividingSegment(map: GameMap, segment: WallSegment): boolean {
  const roomA = isInAnyRoom(map, segment.x1, segment.y1);
  const roomB = isInAnyRoom(map, segment.x2, segment.y2);
  if (!roomA || !roomB) return false;
  return !map.rooms.some(
    (room) =>
      isInsideRoomBounds(room, segment.x1, segment.y1) &&
      isInsideRoomBounds(room, segment.x2, segment.y2)
  );
}

function isInsideRoomBounds(room: Room, x: number, y: number): boolean {
  return x >= room.left && x < room.left + room.width && y >= room.top && y < room.top + room.height;
}

describe("addExtraDoors", () => {
  it("defaults to a 30% extra door chance", () => {
    expect(DEFAULT_EXTRA_DOOR_PERCENT).toBe(30);
  });

  it("opens no extra doors when extraDoorPercent is 0", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = roomMap(40, 30, seed + 17000);
      addExtraDoors(map, 0, mulberry32(seed + 17500));
      expect(getDoorSegments(map)).toHaveLength(0);
    }
  });

  it("opens at least one door on every wall shared between two rooms when extraDoorPercent is 100", () => {
    let sawRoomDividingWall = false;
    for (let seed = 0; seed < 10; seed++) {
      const map = roomMap(40, 30, seed + 18000);

      // Group dividing edges by which pair of rooms they separate - two non-overlapping
      // rectangular rooms only ever share a single contiguous wall, so this is the same
      // grouping `addExtraDoors` itself uses to decide where "a wall" starts and ends.
      const wallsByRoomPair = new Map<string, WallSegment[]>();
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          for (const [nx, ny] of [
            [x + 1, y],
            [x, y + 1],
          ] as const) {
            const edge = { x1: x, y1: y, x2: nx, y2: ny };
            if (!isRoomDividingSegment(map, edge)) continue;
            const roomA = map.rooms.findIndex((room) => isInsideRoomBounds(room, x, y));
            const roomB = map.rooms.findIndex((room) => isInsideRoomBounds(room, nx, ny));
            const key = roomA < roomB ? `${String(roomA)},${String(roomB)}` : `${String(roomB)},${String(roomA)}`;
            const edges = wallsByRoomPair.get(key) ?? [];
            edges.push(edge);
            wallsByRoomPair.set(key, edges);
          }
        }
      }
      if (wallsByRoomPair.size === 0) continue;
      sawRoomDividingWall = true;

      addExtraDoors(map, 100, mulberry32(seed + 18500));

      for (const edges of wallsByRoomPair.values()) {
        const hasAnyDoor = edges.some((edge) => hasDoor(map, edge.x1, edge.y1, edge.x2, edge.y2));
        expect(hasAnyDoor).toBe(true);
      }
    }
    expect(sawRoomDividingWall).toBe(true);
  });

  it("never opens a door that isn't between two different rooms", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = roomMap(40, 30, seed + 19000);
      addExtraDoors(map, 100, mulberry32(seed + 19500));
      for (const segment of getDoorSegments(map)) {
        expect(isRoomDividingSegment(map, segment)).toBe(true);
      }
    }
  });

  it("is deterministic for a given random source", () => {
    const mapA = roomMap(40, 30, 20000);
    const mapB = roomMap(40, 30, 20000);
    addExtraDoors(mapA, 30, mulberry32(20500));
    addExtraDoors(mapB, 30, mulberry32(20500));
    expect([...mapA.doors].sort()).toEqual([...mapB.doors].sort());
  });
});

describe("doors (map.doors / hasDoor / getDoorSegments)", () => {
  it("never carves a door into the map's own outer edge - the ring is already fully walkable, there's nowhere beyond it to go", () => {
    for (let seed = 0; seed < 5; seed++) {
      const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(seed + 9000) });
      for (let x = 0; x < map.width; x++) {
        expect(hasWall(map, x, 0, x, -1)).toBe(true);
        expect(hasWall(map, x, map.height - 1, x, map.height)).toBe(true);
      }
      for (let y = 0; y < map.height; y++) {
        expect(hasWall(map, 0, y, -1, y)).toBe(true);
        expect(hasWall(map, map.width - 1, y, map.width, y)).toBe(true);
      }
    }
  });

  it("places at least one front door directly between a room and the ring, across trials", () => {
    let sawFrontDoor = false;
    for (let seed = 0; seed < 10 && !sawFrontDoor; seed++) {
      const map = generateMap(20, 16, { doorCount: 2, random: mulberry32(seed + 10000) });
      if (getDoorSegments(map).some((segment) => isFrontDoorSegment(map, segment))) {
        sawFrontDoor = true;
      }
    }
    expect(sawFrontDoor).toBe(true);
  });

  it("every door touches at least one room - the only walls that ever exist are room perimeter walls", () => {
    const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(11500) });
    expect(getDoorSegments(map).length).toBeGreaterThan(0);
    for (const segment of getDoorSegments(map)) {
      const touchesRoom =
        isInAnyRoom(map, segment.x1, segment.y1) || isInAnyRoom(map, segment.x2, segment.y2);
      expect(touchesRoom).toBe(true);
    }
  });

  it("finds a door edge via hasDoor for every entry returned by getDoorSegments", () => {
    const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(11750) });
    for (const segment of getDoorSegments(map)) {
      expect(hasDoor(map, segment.x1, segment.y1, segment.x2, segment.y2)).toBe(true);
    }
  });

  it("never marks an edge as both a wall and a door", () => {
    const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(11000) });
    for (const key of map.doors) {
      expect(map.walls.has(key)).toBe(false);
    }
  });
});

describe("computeGrassTiles / isGrass", () => {
  it("marks the entire outer ring as grass", () => {
    const map = createOpenMap(6, 6);
    map.grass = computeGrassTiles(map);

    for (let x = 0; x < 6; x++) {
      expect(isGrass(map, x, 0)).toBe(true);
      expect(isGrass(map, x, 5)).toBe(true);
    }
    for (let y = 0; y < 6; y++) {
      expect(isGrass(map, 0, y)).toBe(true);
      expect(isGrass(map, 5, y)).toBe(true);
    }
  });

  it("floods through fully open interior (no rooms in the way) all the way to the center", () => {
    const map = createOpenMap(9, 9);
    map.grass = computeGrassTiles(map);
    expect(isGrass(map, 4, 4)).toBe(true);
  });

  it("never marks a room's own tiles as grass, even across many generated layouts", () => {
    for (let seed = 0; seed < 5; seed++) {
      const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(seed + 14000) });
      for (const room of map.rooms) {
        for (let y = room.top; y < room.top + room.height; y++) {
          for (let x = room.left; x < room.left + room.width; x++) {
            expect(isGrass(map, x, y)).toBe(false);
          }
        }
      }
    }
  });

  it("marks non-room corridor tiles as grass several tiles deep, not just the ones directly touching the ring", () => {
    let sawDeepGrass = false;
    for (let seed = 0; seed < 10 && !sawDeepGrass; seed++) {
      const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(seed + 15000) });
      for (let y = 2; y < map.height - 2 && !sawDeepGrass; y++) {
        for (let x = 2; x < map.width - 2; x++) {
          if (isInAnyRoom(map, x, y)) continue;
          if (isGrass(map, x, y)) {
            sawDeepGrass = true;
            break;
          }
        }
      }
    }
    expect(sawDeepGrass).toBe(true);
  });

  it("every grass tile is reachable from the ring by walking through open edges", () => {
    for (let seed = 0; seed < 5; seed++) {
      const map = generateMap(20, 16, { doorCount: 3, random: mulberry32(seed + 16000) });
      const reachableFromRing = new Set(
        getReachableTiles(map, { x: 0, y: 0 }).map((tile) => `${String(tile.x)},${String(tile.y)}`)
      );
      for (const key of map.grass) {
        expect(reachableFromRing.has(key)).toBe(true);
      }
    }
  });
});

describe("isInAnyRoom", () => {
  it("reports true only for tiles within a placed room's footprint", () => {
    const map = createOpenMap(10, 10);
    map.rooms.push({ left: 2, top: 3, width: 2, height: 2 });

    expect(isInAnyRoom(map, 2, 3)).toBe(true);
    expect(isInAnyRoom(map, 3, 4)).toBe(true);
    expect(isInAnyRoom(map, 4, 3)).toBe(false);
    expect(isInAnyRoom(map, 1, 3)).toBe(false);
  });

  it("reflects every room placed by generateMap", () => {
    const map = generateMap(20, 16, { doorCount: 2, random: mulberry32(12000) });
    expect(map.rooms.length).toBeGreaterThan(0);
    for (const room of map.rooms) {
      expect(isInAnyRoom(map, room.left, room.top)).toBe(true);
    }
  });
});

describe("placeRooms", () => {
  const WIDTH = 40;
  const HEIGHT = 40;

  it("places rooms whose sides are each in the 2-4 range, never width or height 1", () => {
    for (let seed = 0; seed < 10; seed++) {
      const map = createBlankMap(WIDTH, HEIGHT);
      const rooms = placeRooms(map, mulberry32(seed));
      expect(rooms.length).toBeGreaterThan(0);

      for (const room of rooms) {
        expect(room.width).toBeGreaterThanOrEqual(2);
        expect(room.width).toBeLessThanOrEqual(4);
        expect(room.height).toBeGreaterThanOrEqual(2);
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

  it("allows a room's random draw to extend past the map edge, cropped to fit, but never crops below 2x2", () => {
    // A tiny map makes edge-cropping likely on nearly every placement attempt.
    for (let seed = 0; seed < 20; seed++) {
      const map = createBlankMap(3, 3);
      const rooms = placeRooms(map, mulberry32(seed + 5000));
      for (const room of rooms) {
        expect(room.left).toBeGreaterThanOrEqual(0);
        expect(room.top).toBeGreaterThanOrEqual(0);
        expect(room.left + room.width).toBeLessThanOrEqual(3);
        expect(room.top + room.height).toBeLessThanOrEqual(3);
        expect(room.width).toBeGreaterThanOrEqual(2);
        expect(room.height).toBeGreaterThanOrEqual(2);
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
