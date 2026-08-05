export type Tile = "floor" | "wall";

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[][];
}

export interface Room {
  left: number;
  top: number;
  size: number;
}

export interface GenerateMapOptions {
  /** Number of border wall tiles turned into doors. Clamped to 1-10, defaults to 2. */
  doorCount?: number;
  /** Source of randomness, injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

export const DEFAULT_DOOR_COUNT = 2;
export const MIN_DOOR_COUNT = 1;
export const MAX_DOOR_COUNT = 10;

const ROOM_SIZE = 3;
const ROOM_GAP = 1;
const ROOM_STEP = ROOM_SIZE + ROOM_GAP;

const ADJACENT_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function generateMap(
  width: number,
  height: number,
  options: GenerateMapOptions = {}
): GameMap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Map width and height must be positive integers");
  }

  const random = options.random ?? Math.random;
  const doorCount = clamp(
    Math.round(options.doorCount ?? DEFAULT_DOOR_COUNT),
    MIN_DOOR_COUNT,
    MAX_DOOR_COUNT
  );

  const tiles = createWalledGrid(width, height);
  const rooms = placeRooms(tiles, width, height);
  const doors = placeDoors(tiles, width, height, doorCount, random);

  connectRooms(tiles, width, height, rooms, doors);

  return { width, height, tiles };
}

export function getTile(map: GameMap, x: number, y: number): Tile {
  const row = map.tiles[y];
  const tile = row?.[x];
  if (tile === undefined) {
    throw new Error(`Coordinate (${String(x)}, ${String(y)}) is outside the map`);
  }
  return tile;
}

function createWalledGrid(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Tile => "wall")
  );
}

function placeRooms(tiles: Tile[][], width: number, height: number): Room[] {
  const rooms: Room[] = [];
  const lastTop = height - ROOM_SIZE - 1;
  const lastLeft = width - ROOM_SIZE - 1;

  for (let top = 1; top <= lastTop; top += ROOM_STEP) {
    for (let left = 1; left <= lastLeft; left += ROOM_STEP) {
      for (let y = top; y < top + ROOM_SIZE; y++) {
        const row = tiles[y];
        if (!row) continue;
        for (let x = left; x < left + ROOM_SIZE; x++) {
          row[x] = "floor";
        }
      }
      rooms.push({ left, top, size: ROOM_SIZE });
    }
  }

  return rooms;
}

interface Point {
  x: number;
  y: number;
}

function placeDoors(
  tiles: Tile[][],
  width: number,
  height: number,
  doorCount: number,
  random: () => number
): Point[] {
  const candidates: Point[] = [];
  for (let x = 1; x < width - 1; x++) {
    candidates.push({ x, y: 0 });
    candidates.push({ x, y: height - 1 });
  }
  for (let y = 1; y < height - 1; y++) {
    candidates.push({ x: 0, y });
    candidates.push({ x: width - 1, y });
  }

  shuffle(candidates, random);

  const doors = candidates.slice(0, Math.min(doorCount, candidates.length));
  for (const door of doors) {
    const row = tiles[door.y];
    if (row) row[door.x] = "floor";
  }

  return doors;
}

function shuffle(items: Point[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = items[i];
    const b = items[j];
    if (a === undefined || b === undefined) continue;
    items[i] = b;
    items[j] = a;
  }
}

function connectRooms(
  tiles: Tile[][],
  width: number,
  height: number,
  rooms: Room[],
  doors: Point[]
): void {
  if (rooms.length === 0 || doors.length === 0) return;

  const maxCarves = width * height;
  for (let carves = 0; carves < maxCarves; carves++) {
    const reachable = floodFillFromDoors(tiles, width, height, doors);
    if (rooms.every((room) => isRoomReachable(room, reachable))) return;

    const wall = findConnectingWall(tiles, width, height, reachable);
    if (!wall) return;
    const row = tiles[wall.y];
    if (row) row[wall.x] = "floor";
  }
}

function floodFillFromDoors(
  tiles: Tile[][],
  width: number,
  height: number,
  doors: Point[]
): boolean[][] {
  const visited = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false)
  );
  const queue: Point[] = [];

  for (const door of doors) {
    const row = visited[door.y];
    if (!row || row[door.x]) continue;
    row[door.x] = true;
    queue.push(door);
  }

  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head++;
    if (!point) continue;

    for (const [dx, dy] of ADJACENT_OFFSETS) {
      const x = point.x + dx;
      const y = point.y + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const visitedRow = visited[y];
      const tileRow = tiles[y];
      if (!visitedRow || !tileRow) continue;
      if (visitedRow[x] || tileRow[x] !== "floor") continue;

      visitedRow[x] = true;
      queue.push({ x, y });
    }
  }

  return visited;
}

function isRoomReachable(room: Room, reachable: boolean[][]): boolean {
  for (let y = room.top; y < room.top + room.size; y++) {
    const row = reachable[y];
    if (!row) continue;
    for (let x = room.left; x < room.left + room.size; x++) {
      if (row[x]) return true;
    }
  }
  return false;
}

function findConnectingWall(
  tiles: Tile[][],
  width: number,
  height: number,
  reachable: boolean[][]
): Point | undefined {
  // Only carve interior walls (never the border ring) so the number of
  // border floor tiles stays exactly equal to the requested door count.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y]?.[x] !== "wall") continue;
      if (!hasNeighborMatching(x, y, width, height, (nx, ny) => reachable[ny]?.[nx] === true)) {
        continue;
      }
      const touchesUnreachedRoom = hasNeighborMatching(
        x,
        y,
        width,
        height,
        (nx, ny) => tiles[ny]?.[nx] === "floor" && reachable[ny]?.[nx] !== true
      );
      if (touchesUnreachedRoom) return { x, y };
    }
  }
  return undefined;
}

function hasNeighborMatching(
  x: number,
  y: number,
  width: number,
  height: number,
  predicate: (nx: number, ny: number) => boolean
): boolean {
  for (const [dx, dy] of ADJACENT_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    if (predicate(nx, ny)) return true;
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
