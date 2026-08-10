import { describe, expect, it } from "vitest";
import { createOpenMap, type GameMap, type Room } from "./mapGeneration";
import { computeVisibleTiles, computeVisibleTilesForAll, pointKey, roomAt } from "./visibility";

function addRoom(map: GameMap, room: Room): Room {
  map.rooms.push(room);
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
        const inside = nx >= room.left && nx < room.left + room.width && ny >= room.top && ny < room.top + room.height;
        if (inside) continue;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const ordered = x < nx || (x === nx && y <= ny) ? [x, y, nx, ny] : [nx, ny, x, y];
        map.walls.add(`${String(ordered[0])},${String(ordered[1])}|${String(ordered[2])},${String(ordered[3])}`);
      }
    }
  }
  return room;
}

function openDoor(map: GameMap, x1: number, y1: number, x2: number, y2: number): void {
  const ordered = x1 < x2 || (x1 === x2 && y1 <= y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  const key = `${String(ordered[0])},${String(ordered[1])}|${String(ordered[2])},${String(ordered[3])}`;
  map.walls.delete(key);
  map.doors.add(key);
}

describe("roomAt", () => {
  it("returns the room containing a tile", () => {
    const map = createOpenMap(10, 10);
    const room = addRoom(map, { left: 2, top: 2, width: 3, height: 3 });
    expect(roomAt(map, 3, 3)).toBe(room);
  });

  it("returns undefined for a tile outside every room", () => {
    const map = createOpenMap(10, 10);
    addRoom(map, { left: 2, top: 2, width: 3, height: 3 });
    expect(roomAt(map, 0, 0)).toBeUndefined();
  });
});

describe("computeVisibleTiles", () => {
  it("reveals every tile of the room the player is standing in, even far from them", () => {
    const map = createOpenMap(10, 10);
    const room = addRoom(map, { left: 2, top: 2, width: 4, height: 4 });

    const visible = computeVisibleTiles(map, { x: room.left, y: room.top });
    for (let y = room.top; y < room.top + room.height; y++) {
      for (let x = room.left; x < room.left + room.width; x++) {
        expect(visible.has(pointKey(x, y))).toBe(true);
      }
    }
  });

  it("includes just the player's own tile when they aren't in a room and have nowhere open to look", () => {
    const isolated = createOpenMap(1, 1);
    const visible = computeVisibleTiles(isolated, { x: 0, y: 0 });
    expect(visible).toEqual(new Set([pointKey(0, 0)]));
  });

  it("sees in a straight line out of a room through an open door, stopping at the next wall", () => {
    const map = createOpenMap(10, 10);
    addRoom(map, { left: 2, top: 2, width: 3, height: 3 });
    // Open a door on the room's right wall, at (4, 3) -> (5, 3).
    openDoor(map, 4, 3, 5, 3);

    const visible = computeVisibleTiles(map, { x: 2, y: 2 });
    expect(visible.has(pointKey(5, 3))).toBe(true);
    expect(visible.has(pointKey(6, 3))).toBe(true);
    expect(visible.has(pointKey(9, 3))).toBe(true);
    // Off the line of sight - not visible.
    expect(visible.has(pointKey(6, 4))).toBe(false);
  });

  it("does not see past an unopened wall", () => {
    const map = createOpenMap(10, 10);
    addRoom(map, { left: 2, top: 2, width: 3, height: 3 });

    const visible = computeVisibleTiles(map, { x: 2, y: 2 });
    expect(visible.has(pointKey(5, 2))).toBe(false);
  });

  it("sees a straight line of sight down an open corridor when not in any room", () => {
    const map = createOpenMap(10, 1);
    const visible = computeVisibleTiles(map, { x: 5, y: 0 });
    for (let x = 0; x < 10; x++) {
      expect(visible.has(pointKey(x, 0))).toBe(true);
    }
  });

  it("sees any outdoor tile with a clear line, not just the 4 cardinal directions", () => {
    const map = createOpenMap(10, 10);
    const visible = computeVisibleTiles(map, { x: 2, y: 2 });
    // (7, 5) is off every cardinal ray from (2, 2) - only reachable with true 2D sight.
    expect(visible.has(pointKey(7, 5))).toBe(true);
  });

  it("still sees around a single solid corner (one detour open is enough)", () => {
    const map = createOpenMap(5, 5);
    // Wall off (1,0)-(1,1) only; the (0,0)->(0,1)->(1,1) detour stays open.
    map.walls.add("1,0|1,1");

    const visible = computeVisibleTiles(map, { x: 0, y: 0 });
    expect(visible.has(pointKey(1, 1))).toBe(true);
  });

  it("is blocked when both detours around a diagonal corner are walled", () => {
    const map = createOpenMap(5, 5);
    // Wall off both edges leading into (1,1) from its orthogonal neighbors.
    map.walls.add("1,0|1,1");
    map.walls.add("0,1|1,1");

    const visible = computeVisibleTiles(map, { x: 0, y: 0 });
    expect(visible.has(pointKey(1, 1))).toBe(false);
  });

  it("from outdoors, sees through an open door but not through a solid wall elsewhere", () => {
    const map = createOpenMap(12, 10);
    addRoom(map, { left: 2, top: 2, width: 3, height: 3 });
    // Open a door on the first room's left wall, at (2,3) -> (1,3).
    openDoor(map, 2, 3, 1, 3);
    // A second, doorless room further along - fully enclosed, nothing to see it through.
    const roomB = addRoom(map, { left: 8, top: 2, width: 3, height: 3 });

    const visible = computeVisibleTiles(map, { x: 0, y: 3 });
    expect(visible.has(pointKey(2, 3))).toBe(true);
    expect(visible.has(pointKey(roomB.left + 1, roomB.top + 1))).toBe(false);
  });
});

describe("computeVisibleTilesForAll", () => {
  it("unions visibility across multiple players", () => {
    const map = createOpenMap(10, 10);
    const roomA = addRoom(map, { left: 1, top: 1, width: 2, height: 2 });
    const roomB = addRoom(map, { left: 6, top: 6, width: 2, height: 2 });

    const visible = computeVisibleTilesForAll(map, [
      { x: roomA.left, y: roomA.top },
      { x: roomB.left, y: roomB.top },
    ]);

    expect(visible.has(pointKey(roomA.left, roomA.top))).toBe(true);
    expect(visible.has(pointKey(roomB.left, roomB.top))).toBe(true);
  });
});
