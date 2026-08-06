export type Tile = "floor" | "wall";

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[][];
}

export interface Room {
  left: number;
  top: number;
  width: number;
  height: number;
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
  const rooms = placeRooms(tiles, width, height, random);
  placeDoors(tiles, width, height, doorCount, random);

  connectRooms(tiles, width, height, rooms);

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

// Randomly places non-overlapping rooms (2x1 up to 4x4, either orientation)
// into the interior until no more attempts yield a valid spot. Each attempt
// tries a random size and position rather than tiling a fixed grid, since
// room sizes now vary.
// Exported so tests can inspect room sizes/positions directly, before
// connectRooms carves corridors that make rooms indistinguishable from
// doors and hallways in the final tile grid.
export function placeRooms(
  tiles: Tile[][],
  width: number,
  height: number,
  random: () => number
): Room[] {
  const rooms: Room[] = [];
  const interiorWidth = width - 2;
  const interiorHeight = height - 2;
  if (interiorWidth < 1 || interiorHeight < 1) return rooms;

  const attempts = Math.max(
    50,
    interiorWidth * interiorHeight * ROOM_PLACEMENT_ATTEMPTS_PER_CELL
  );

  for (let attempt = 0; attempt < attempts; attempt++) {
    const room = randomRoom(width, height, random);
    if (!room) continue;
    if (roomOverlapsAny(room, rooms)) continue;

    fillRoom(tiles, room);
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

  const maxLeft = mapWidth - 1 - roomWidth;
  const maxTop = mapHeight - 1 - roomHeight;
  if (maxLeft < 1 || maxTop < 1) return undefined;

  const left = 1 + Math.floor(random() * maxLeft);
  const top = 1 + Math.floor(random() * maxTop);

  return { left, top, width: roomWidth, height: roomHeight };
}

function randomRoomSide(random: () => number): number {
  return MIN_ROOM_SIDE + Math.floor(random() * (MAX_ROOM_SIDE - MIN_ROOM_SIDE + 1));
}

// Rejects the candidate if it (inflated by a 1-tile buffer on every side)
// overlaps any already-placed room, guaranteeing at least one wall tile of
// separation between any two rooms.
function roomOverlapsAny(candidate: Room, rooms: Room[]): boolean {
  const left = candidate.left - 1;
  const top = candidate.top - 1;
  const right = candidate.left + candidate.width + 1;
  const bottom = candidate.top + candidate.height + 1;

  for (const room of rooms) {
    const roomRight = room.left + room.width;
    const roomBottom = room.top + room.height;
    const overlaps = left < roomRight && right > room.left && top < roomBottom && bottom > room.top;
    if (overlaps) return true;
  }
  return false;
}

function fillRoom(tiles: Tile[][], room: Room): void {
  for (let y = room.top; y < room.top + room.height; y++) {
    const row = tiles[y];
    if (!row) continue;
    for (let x = room.left; x < room.left + room.width; x++) {
      row[x] = "floor";
    }
  }
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

// Merges every disconnected floor region (each room, each door) into a
// single connected component, so any door can reach every room by walking
// through floor tiles only — not just the union of what each door touches.
// Gaps between regions can be more than one wall tile thick (e.g. leftover
// margin when the grid doesn't evenly divide into room-sized bands), so each
// merge tunnels the shortest wall-carving path to the nearest other region
// rather than only carving walls directly touching the main region.
function connectRooms(
  tiles: Tile[][],
  width: number,
  height: number,
  rooms: Room[]
): void {
  if (rooms.length === 0) return;

  const maxMerges = width * height;
  for (let merges = 0; merges < maxMerges; merges++) {
    const labels = labelFloorComponents(tiles, width, height);
    if (labels.componentCount <= 1) return;

    const merged = carveShortestPathToOtherComponent(tiles, width, height, labels.grid, 0);
    if (!merged) return;
  }
}

interface ComponentLabels {
  grid: number[][];
  componentCount: number;
}

function labelFloorComponents(
  tiles: Tile[][],
  width: number,
  height: number
): ComponentLabels {
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => -1)
  );
  let componentCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y]?.[x] !== "floor" || grid[y]?.[x] !== -1) continue;
      floodFillComponent(tiles, width, height, grid, x, y, componentCount);
      componentCount++;
    }
  }

  return { grid, componentCount };
}

function floodFillComponent(
  tiles: Tile[][],
  width: number,
  height: number,
  grid: number[][],
  startX: number,
  startY: number,
  label: number
): void {
  const queue: Point[] = [{ x: startX, y: startY }];
  const startRow = grid[startY];
  if (startRow) startRow[startX] = label;

  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head++;
    if (!point) continue;

    for (const [dx, dy] of ADJACENT_OFFSETS) {
      const x = point.x + dx;
      const y = point.y + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const gridRow = grid[y];
      const tileRow = tiles[y];
      if (!gridRow || !tileRow) continue;
      if (gridRow[x] !== -1 || tileRow[x] !== "floor") continue;

      gridRow[x] = label;
      queue.push({ x, y });
    }
  }
}

// Interior floor tiles cost nothing to walk through; interior walls cost one
// carve; the border ring is never carvable (undefined) so the door count
// invariant holds, except border tiles that are already a door (floor).
function stepCost(
  tiles: Tile[][],
  width: number,
  height: number,
  x: number,
  y: number
): number | undefined {
  const tile = tiles[y]?.[x];
  if (tile === "floor") return 0;
  if (tile !== "wall") return undefined;

  const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
  return isBorder ? undefined : 1;
}

// 0-1 BFS (Dijkstra with only edge weights 0/1, via a double-ended queue)
// from every cell of `mainLabel` to the nearest cell of any other component,
// then carves every wall tile on that shortest path to floor. Returns false
// only if no other component exists to merge with.
function carveShortestPathToOtherComponent(
  tiles: Tile[][],
  width: number,
  height: number,
  labels: number[][],
  mainLabel: number
): boolean {
  const dist: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => Infinity)
  );
  const parent: Array<Array<Point | null>> = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null)
  );
  const deque: Point[] = [];

  for (let y = 0; y < height; y++) {
    const labelRow = labels[y];
    if (!labelRow) continue;
    for (let x = 0; x < width; x++) {
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
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const cost = stepCost(tiles, width, height, nx, ny);
      if (cost === undefined) continue;

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
    const row = tiles[cursor.y];
    if (row && row[cursor.x] === "wall") row[cursor.x] = "floor";
    cursor = parent[cursor.y]?.[cursor.x] ?? null;
  }

  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
