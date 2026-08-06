// Every (x, y) in [0, width) x [0, height) is a floor tile. Walls are a
// separate, zero-width layer: each entry in `walls` blocks movement between
// two orthogonally-adjacent tiles, or between a border tile and the outside
// of the grid (using the coordinate one step beyond the border, e.g. (x, -1)
// for the top edge of (x, 0)). This keeps walls as thin partitions between
// tiles instead of tiles of their own, so rooms read as rooms rather than
// tunnels through solid rock.
export interface GameMap {
  width: number;
  height: number;
  walls: Set<string>;
}

export interface Room {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GenerateMapOptions {
  /** Number of border wall segments turned into doors. Clamped to 1-10, defaults to 2. */
  doorCount?: number;
  /** Source of randomness, injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

export const DEFAULT_DOOR_COUNT = 2;
export const MIN_DOOR_COUNT = 1;
export const MAX_DOOR_COUNT = 10;

// Each room's width and height are independently randomized in this range
// (so both orientations of e.g. a 2x1 room are equally likely), rerolling
// the degenerate 1x1 case since the smallest allowed room is 2x1/1x2.
const MIN_ROOM_SIDE = 1;
const MAX_ROOM_SIDE = 4;
const ROOM_PLACEMENT_ATTEMPTS_PER_CELL = 4;

const ADJACENT_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface Point {
  x: number;
  y: number;
}

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

  const map = createBlankMap(width, height);
  const rooms = placeRooms(map, random);
  const doors = placeDoors(map, doorCount, random);

  connectRooms(map, rooms, doors);

  return map;
}

/** A map with every tile isolated: every interior and border edge starts walled. */
export function createBlankMap(width: number, height: number): GameMap {
  const walls = new Set<string>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x + 1 < width) walls.add(wallKey(x, y, x + 1, y));
      if (y + 1 < height) walls.add(wallKey(x, y, x, y + 1));
    }
    walls.add(wallKey(0, y, -1, y));
    walls.add(wallKey(width - 1, y, width, y));
  }
  for (let x = 0; x < width; x++) {
    walls.add(wallKey(x, 0, x, -1));
    walls.add(wallKey(x, height - 1, x, height));
  }

  return { width, height, walls };
}

function wallKey(x1: number, y1: number, x2: number, y2: number): string {
  const ordered =
    x1 < x2 || (x1 === x2 && y1 <= y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  return `${String(ordered[0])},${String(ordered[1])}|${String(ordered[2])},${String(ordered[3])}`;
}

export function hasWall(map: GameMap, x1: number, y1: number, x2: number, y2: number): boolean {
  return map.walls.has(wallKey(x1, y1, x2, y2));
}

export function isInBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

/** Whether a player/flame can move directly between two orthogonally-adjacent tiles. */
export function canPass(map: GameMap, x1: number, y1: number, x2: number, y2: number): boolean {
  return isInBounds(map, x1, y1) && isInBounds(map, x2, y2) && !hasWall(map, x1, y1, x2, y2);
}

export function getWallSegments(map: GameMap): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const key of map.walls) {
    const [a, b] = key.split("|");
    if (!a || !b) continue;
    const [x1, y1] = a.split(",").map(Number);
    const [x2, y2] = b.split(",").map(Number);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
    segments.push({ x1, y1, x2, y2 });
  }
  return segments;
}

// Randomly places non-overlapping rooms (2x1 up to 4x4, either orientation)
// anywhere in the map, including flush against the border, until no more
// attempts yield a valid spot. Each attempt tries a random size and position
// rather than tiling a fixed grid, since room sizes vary. Opens every wall
// between tiles inside the room so it reads as a single open space.
// Exported so tests can inspect room sizes/positions directly.
export function placeRooms(map: GameMap, random: () => number): Room[] {
  const rooms: Room[] = [];
  const attempts = Math.max(50, map.width * map.height * ROOM_PLACEMENT_ATTEMPTS_PER_CELL);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const room = randomRoom(map.width, map.height, random);
    if (!room) continue;
    if (roomOverlapsAny(room, rooms)) continue;

    openRoomInterior(map, room);
    rooms.push(room);
  }

  return rooms;
}

function randomRoom(
  mapWidth: number,
  mapHeight: number,
  random: () => number
): Room | undefined {
  const roomWidth = randomRoomSide(random);
  const roomHeight = randomRoomSide(random);
  if (roomWidth === MIN_ROOM_SIDE && roomHeight === MIN_ROOM_SIDE) return undefined;

  const maxLeft = mapWidth - roomWidth;
  const maxTop = mapHeight - roomHeight;
  if (maxLeft < 0 || maxTop < 0) return undefined;

  const left = Math.floor(random() * (maxLeft + 1));
  const top = Math.floor(random() * (maxTop + 1));

  return { left, top, width: roomWidth, height: roomHeight };
}

function randomRoomSide(random: () => number): number {
  return MIN_ROOM_SIDE + Math.floor(random() * (MAX_ROOM_SIDE - MIN_ROOM_SIDE + 1));
}

function roomOverlapsAny(candidate: Room, rooms: Room[]): boolean {
  const right = candidate.left + candidate.width;
  const bottom = candidate.top + candidate.height;

  for (const room of rooms) {
    const roomRight = room.left + room.width;
    const roomBottom = room.top + room.height;
    const overlaps =
      candidate.left < roomRight &&
      right > room.left &&
      candidate.top < roomBottom &&
      bottom > room.top;
    if (overlaps) return true;
  }
  return false;
}

function openRoomInterior(map: GameMap, room: Room): void {
  for (let y = room.top; y < room.top + room.height; y++) {
    for (let x = room.left; x < room.left + room.width; x++) {
      if (x + 1 < room.left + room.width) map.walls.delete(wallKey(x, y, x + 1, y));
      if (y + 1 < room.top + room.height) map.walls.delete(wallKey(x, y, x, y + 1));
    }
  }
}

function placeDoors(map: GameMap, doorCount: number, random: () => number): Point[] {
  const candidates: Point[] = [];
  for (let x = 1; x < map.width - 1; x++) {
    candidates.push({ x, y: 0 });
    candidates.push({ x, y: map.height - 1 });
  }
  for (let y = 1; y < map.height - 1; y++) {
    candidates.push({ x: 0, y });
    candidates.push({ x: map.width - 1, y });
  }

  shuffle(candidates, random);

  const doors = candidates.slice(0, Math.min(doorCount, candidates.length));
  for (const door of doors) {
    map.walls.delete(borderWallKey(door.x, door.y, map.width, map.height));
  }

  return doors;
}

function borderWallKey(x: number, y: number, width: number, height: number): string {
  if (y === 0) return wallKey(x, 0, x, -1);
  if (y === height - 1) return wallKey(x, height - 1, x, height);
  if (x === 0) return wallKey(0, y, -1, y);
  return wallKey(width - 1, y, width, y);
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

// Merges every disconnected "significant" region (each room, each door tile)
// into a single connected component, so any door can reach every room by
// walking through opened edges only. Tiles that belong to neither a room nor
// a door are just carve-path substrate: they stay walled off on every side
// unless a shortest path happens to run through them, exactly like the
// non-room tiles in the old wall-tile representation.
function connectRooms(map: GameMap, rooms: Room[], doors: Point[]): void {
  const significant = new Set<string>();
  for (const room of rooms) {
    for (let y = room.top; y < room.top + room.height; y++) {
      for (let x = room.left; x < room.left + room.width; x++) {
        significant.add(pointKey(x, y));
      }
    }
  }
  for (const door of doors) significant.add(pointKey(door.x, door.y));

  if (significant.size === 0) return;

  const maxMerges = map.width * map.height;
  for (let merges = 0; merges < maxMerges; merges++) {
    const labels = labelSignificantComponents(map, significant);
    if (labels.componentCount <= 1) return;

    const merged = carveShortestPathToOtherComponent(map, labels.grid, 0);
    if (!merged) return;
  }
}

function pointKey(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

interface ComponentLabels {
  grid: number[][];
  componentCount: number;
}

// A carved corridor between two rooms opens edges through tiles that aren't
// themselves significant (not part of any room or door), so connectivity
// must be traced through *any* open-edge-connected tile - only the labeling
// of which tiles get a component number is restricted to significant ones.
function labelSignificantComponents(map: GameMap, significant: Set<string>): ComponentLabels {
  const grid = Array.from({ length: map.height }, () =>
    Array.from({ length: map.width }, () => -1)
  );
  const visited = Array.from({ length: map.height }, () =>
    Array.from({ length: map.width }, () => false)
  );
  let componentCount = 0;

  for (const key of significant) {
    const point = parsePointKey(key);
    if (visited[point.y]?.[point.x]) continue;
    floodFillSignificant(map, significant, visited, grid, point.x, point.y, componentCount);
    componentCount++;
  }

  return { grid, componentCount };
}

function parsePointKey(key: string): Point {
  const [xPart, yPart] = key.split(",");
  return { x: Number(xPart), y: Number(yPart) };
}

function floodFillSignificant(
  map: GameMap,
  significant: Set<string>,
  visited: boolean[][],
  grid: number[][],
  startX: number,
  startY: number,
  label: number
): void {
  const queue: Point[] = [{ x: startX, y: startY }];
  markVisited(visited, grid, significant, startX, startY, label);

  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head++;
    if (!point) continue;

    for (const [dx, dy] of ADJACENT_OFFSETS) {
      const x = point.x + dx;
      const y = point.y + dy;
      if (!isInBounds(map, x, y)) continue;

      const visitedRow = visited[y];
      if (!visitedRow || visitedRow[x]) continue;
      if (hasWall(map, point.x, point.y, x, y)) continue;

      markVisited(visited, grid, significant, x, y, label);
      queue.push({ x, y });
    }
  }
}

function markVisited(
  visited: boolean[][],
  grid: number[][],
  significant: Set<string>,
  x: number,
  y: number,
  label: number
): void {
  const visitedRow = visited[y];
  if (visitedRow) visitedRow[x] = true;
  if (!significant.has(pointKey(x, y))) return;
  const gridRow = grid[y];
  if (gridRow) gridRow[x] = label;
}

// 0-1 BFS (Dijkstra with only edge weights 0/1, via a double-ended queue)
// from every tile of `mainLabel` to the nearest tile of any other
// significant component, then opens every walled edge on that shortest
// path. May pass through non-significant tiles along the way, carving a
// corridor through them. Returns false only if no other component exists.
function carveShortestPathToOtherComponent(
  map: GameMap,
  labels: number[][],
  mainLabel: number
): boolean {
  const dist: number[][] = Array.from({ length: map.height }, () =>
    Array.from({ length: map.width }, () => Infinity)
  );
  const parent: Array<Array<Point | null>> = Array.from({ length: map.height }, () =>
    Array.from({ length: map.width }, () => null)
  );
  const deque: Point[] = [];

  for (let y = 0; y < map.height; y++) {
    const labelRow = labels[y];
    if (!labelRow) continue;
    for (let x = 0; x < map.width; x++) {
      if (labelRow[x] !== mainLabel) continue;
      const distRow = dist[y];
      if (distRow) distRow[x] = 0;
      deque.push({ x, y });
    }
  }

  let target: Point | undefined;
  let head = 0;
  let tail = deque.length;
  while (head < tail) {
    const current = deque[head];
    head++;
    if (!current) continue;
    const { x, y } = current;
    const currentDist = dist[y]?.[x] ?? Infinity;

    const currentLabel = labels[y]?.[x];
    if (currentLabel !== undefined && currentLabel !== -1 && currentLabel !== mainLabel) {
      target = current;
      break;
    }

    for (const [dx, dy] of ADJACENT_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isInBounds(map, nx, ny)) continue;

      const cost = hasWall(map, x, y, nx, ny) ? 1 : 0;
      const newDist = currentDist + cost;
      const distRow = dist[ny];
      if (!distRow || newDist >= (distRow[nx] ?? Infinity)) continue;

      distRow[nx] = newDist;
      const parentRow = parent[ny];
      if (parentRow) parentRow[nx] = { x, y };

      if (cost === 0) {
        deque.splice(head, 0, { x: nx, y: ny });
        tail++;
      } else {
        deque.push({ x: nx, y: ny });
        tail++;
      }
    }
  }

  if (!target) return false;

  let cursor: Point | null = target;
  while (cursor) {
    const point: Point = cursor;
    const parentPoint: Point | null = parent[point.y]?.[point.x] ?? null;
    if (parentPoint) map.walls.delete(wallKey(point.x, point.y, parentPoint.x, parentPoint.y));
    cursor = parentPoint;
  }

  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
