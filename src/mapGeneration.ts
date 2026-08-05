export type Tile = "floor" | "wall";

export interface RoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: RoomRect[];
  doors: Point[];
}

export interface GenerateMapOptions {
  doorCount?: number;
  random?: () => number;
}

const ROOM_SIZE = 3;
const ROOM_PITCH = ROOM_SIZE + 1;
const MIN_DOOR_COUNT = 1;
const MAX_DOOR_COUNT = 10;
const DEFAULT_DOOR_COUNT = 2;

export function generateMap(
  width: number,
  height: number,
  options: GenerateMapOptions = {}
): GameMap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Map dimensions must be positive integers, got ${String(width)}x${String(height)}`);
  }

  const random = options.random ?? Math.random;
  const doorCount = clamp(
    Math.round(options.doorCount ?? DEFAULT_DOOR_COUNT),
    MIN_DOOR_COUNT,
    MAX_DOOR_COUNT
  );

  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Tile => "wall")
  );

  const rooms = placeRooms(tiles, width, height);
  const doors = carveDoors(tiles, width, height, doorCount, random);
  connectRoomsToDoors(tiles, width, height, rooms, doors);

  return { width, height, tiles, rooms, doors };
}

function placeRooms(tiles: Tile[][], width: number, height: number): RoomRect[] {
  const rooms: RoomRect[] = [];
  const interiorRight = width - 2;
  const interiorBottom = height - 2;

  for (let roomY = 1; roomY + ROOM_SIZE - 1 <= interiorBottom; roomY += ROOM_PITCH) {
    for (let roomX = 1; roomX + ROOM_SIZE - 1 <= interiorRight; roomX += ROOM_PITCH) {
      for (let dy = 0; dy < ROOM_SIZE; dy++) {
        for (let dx = 0; dx < ROOM_SIZE; dx++) {
          setTile(tiles, roomX + dx, roomY + dy, "floor");
        }
      }
      rooms.push({ x: roomX, y: roomY, width: ROOM_SIZE, height: ROOM_SIZE });
    }
  }

  return rooms;
}

function carveDoors(
  tiles: Tile[][],
  width: number,
  height: number,
  doorCount: number,
  random: () => number
): Point[] {
  const candidates: Point[] = [];
  for (let x = 1; x < width - 1; x++) {
    candidates.push({ x, y: 0 });
    if (height > 1) candidates.push({ x, y: height - 1 });
  }
  for (let y = 1; y < height - 1; y++) {
    candidates.push({ x: 0, y });
    if (width > 1) candidates.push({ x: width - 1, y });
  }

  const chosen = pickRandomUnique(candidates, doorCount, random);
  for (const point of chosen) setTile(tiles, point.x, point.y, "floor");
  return chosen;
}

function pickRandomUnique<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const result: T[] = [];
  const target = Math.min(count, pool.length);

  for (let i = 0; i < target; i++) {
    const index = Math.floor(random() * pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked !== undefined) result.push(picked);
  }

  return result;
}

function connectRoomsToDoors(
  tiles: Tile[][],
  width: number,
  height: number,
  rooms: RoomRect[],
  doors: Point[]
): void {
  if (doors.length === 0) return;

  let accessible = floodFillFloor(tiles, width, height, doors);

  for (const room of rooms) {
    if (roomIsAccessible(room, accessible)) continue;

    const path = shortestPathAllowingWalls(tiles, width, height, accessible, roomTiles(room));
    for (const point of path) setTile(tiles, point.x, point.y, "floor");

    accessible = floodFillFloor(tiles, width, height, doors);
  }
}

function roomTiles(room: RoomRect): Point[] {
  const points: Point[] = [];
  for (let dy = 0; dy < room.height; dy++) {
    for (let dx = 0; dx < room.width; dx++) {
      points.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return points;
}

function roomIsAccessible(room: RoomRect, accessible: Set<string>): boolean {
  return roomTiles(room).some((point) => accessible.has(key(point.x, point.y)));
}

export function floodFillFloor(
  tiles: Tile[][],
  width: number,
  height: number,
  sources: Point[]
): Set<string> {
  const visited = new Set<string>();
  const queue: Point[] = [];

  for (const source of sources) {
    if (!inBounds(source.x, source.y, width, height)) continue;
    if (getTile(tiles, source.x, source.y) !== "floor") continue;
    const k = key(source.x, source.y);
    if (visited.has(k)) continue;
    visited.add(k);
    queue.push(source);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head++;
    if (!current) continue;

    for (const neighbor of orthogonalNeighbors(current.x, current.y)) {
      if (!inBounds(neighbor.x, neighbor.y, width, height)) continue;
      if (getTile(tiles, neighbor.x, neighbor.y) !== "floor") continue;
      const k = key(neighbor.x, neighbor.y);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push(neighbor);
    }
  }

  return visited;
}

/**
 * Finds the path from any of `targets` back to the accessible region that
 * crosses the fewest wall tiles, using 0-1 BFS (floor moves cost 0, wall
 * moves cost 1). Returns only the wall tiles that must be opened.
 */
function shortestPathAllowingWalls(
  tiles: Tile[][],
  width: number,
  height: number,
  accessible: Set<string>,
  targets: Point[]
): Point[] {
  const cost = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const settled = new Set<string>();
  const deque: string[] = [];

  for (const target of targets) {
    const k = key(target.x, target.y);
    if (cost.has(k)) continue;
    cost.set(k, 0);
    prev.set(k, null);
    deque.push(k);
  }

  let goal: string | null = null;

  while (deque.length > 0) {
    const currentKey = deque.shift();
    if (currentKey === undefined) continue;
    if (settled.has(currentKey)) continue;
    settled.add(currentKey);

    if (accessible.has(currentKey)) {
      goal = currentKey;
      break;
    }

    const current = unkey(currentKey);
    const currentCost = cost.get(currentKey) ?? 0;

    for (const neighbor of orthogonalNeighbors(current.x, current.y)) {
      if (!inBounds(neighbor.x, neighbor.y, width, height)) continue;
      const neighborKey = key(neighbor.x, neighbor.y);
      if (settled.has(neighborKey)) continue;

      const moveCost = getTile(tiles, neighbor.x, neighbor.y) === "wall" ? 1 : 0;
      const neighborCost = currentCost + moveCost;
      const existingCost = cost.get(neighborKey);

      if (existingCost !== undefined && existingCost <= neighborCost) continue;

      cost.set(neighborKey, neighborCost);
      prev.set(neighborKey, currentKey);

      if (moveCost === 0) {
        deque.unshift(neighborKey);
      } else {
        deque.push(neighborKey);
      }
    }
  }

  if (goal === null) return [];

  const path: Point[] = [];
  let node: string | null = goal;
  while (node !== null) {
    const point = unkey(node);
    if (getTile(tiles, point.x, point.y) === "wall") path.push(point);
    node = prev.get(node) ?? null;
  }

  return path;
}

function orthogonalNeighbors(x: number, y: number): Point[] {
  return [
    { x, y: y - 1 },
    { x, y: y + 1 },
    { x: x - 1, y },
    { x: x + 1, y },
  ];
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

function getTile(tiles: Tile[][], x: number, y: number): Tile {
  const row = tiles[y];
  const tile = row?.[x];
  if (tile === undefined) throw new Error(`No tile at ${String(x)}, ${String(y)}`);
  return tile;
}

function setTile(tiles: Tile[][], x: number, y: number, value: Tile): void {
  const row = tiles[y];
  if (!row) throw new Error(`No row at y=${String(y)}`);
  row[x] = value;
}

function key(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

function unkey(k: string): Point {
  const [xStr, yStr] = k.split(",");
  return { x: Number(xStr), y: Number(yStr) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
