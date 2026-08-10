// Every (x, y) in [0, width) x [0, height) is a floor tile. Walls are a
// separate, zero-width layer: each entry in `walls` blocks movement between
// two orthogonally-adjacent tiles, or between a border tile and the outside
// of the grid (using the coordinate one step beyond the border, e.g. (x, -1)
// for the top edge of (x, 0)). This keeps walls as thin partitions between
// tiles instead of tiles of their own, so rooms read as rooms rather than
// tunnels through solid rock. `doors` uses the same edge-key format as
// `walls` but is disjoint from it: a door edge is always passable (never
// also in `walls`), and records that the edge was deliberately carved open
// during generation - as opposed to an edge that was simply never walled -
// so callers can render it distinctly (e.g. a door-colored line rather than
// no line at all). `rooms` is every room placed during generation, so
// callers can tell room floor apart from incidental open corridor. `grass`
// (point-key format, "x,y") is every tile reachable from the outer ring
// without passing through a room - the outer ring plus any corridor that
// connects to it - computed once generation finishes.
export interface GameMap {
  width: number;
  height: number;
  walls: Set<string>;
  doors: Set<string>;
  rooms: Room[];
  grass: Set<string>;
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
  /** Number of room walls facing the outer ring turned into front doors. Clamped to 1-10,
   * defaults to 2. Rooms not reachable via a front door are still connected to the network
   * (and, transitively, the ring) by carving additional doors as needed. */
  doorCount?: number;
  /** For every pair of rooms sharing a wall with no door on it yet, the percent chance
   * (0-100) that a single extra door gets carved somewhere along that shared wall, on top
   * of whatever doors front-door placement and room connection already added. Clamped to
   * 0-100, defaults to 30. */
  extraDoorPercent?: number;
  /** Source of randomness, injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

/** A snapshot of the map after one meaningful generation step (a room placed, a door or
 * corridor wall opened), for callers that want to visualize generation as it happens. */
export interface GenerationStep {
  map: GameMap;
  description: string;
}

export const DEFAULT_DOOR_COUNT = 2;
export const MIN_DOOR_COUNT = 1;
export const MAX_DOOR_COUNT = 10;

export const DEFAULT_EXTRA_DOOR_PERCENT = 30;
export const MIN_EXTRA_DOOR_PERCENT = 0;
export const MAX_EXTRA_DOOR_PERCENT = 100;

// Each room's width and height are independently randomized in this range.
// The smallest allowed room is 2x2 - no room is ever as thin as a single tile.
const MIN_ROOM_SIDE = 2;
const MAX_ROOM_SIDE = 4;
const ROOM_PLACEMENT_ATTEMPTS_PER_CELL = 4;

// Rooms are kept this many tiles clear of the map edge, guaranteeing a walkable
// ring around the entire outside of the building for the player to walk around.
const OUTER_RING_THICKNESS = 1;

const ADJACENT_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface Point {
  x: number;
  y: number;
}

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function generateMap(
  width: number,
  height: number,
  options: GenerateMapOptions = {}
): GameMap {
  return drain(generateMapSteps(width, height, options));
}

/**
 * Same generation as `generateMap`, but yields a `GenerationStep` after every room placed,
 * door opened, and corridor wall carved, so a caller can render the map as it's built up
 * instead of only seeing the finished result. The generator's return value is the final map.
 */
export function* generateMapSteps(
  width: number,
  height: number,
  options: GenerateMapOptions = {}
): Generator<GenerationStep, GameMap, void> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Map width and height must be positive integers");
  }

  const random = options.random ?? Math.random;
  const doorCount = clamp(
    Math.round(options.doorCount ?? DEFAULT_DOOR_COUNT),
    MIN_DOOR_COUNT,
    MAX_DOOR_COUNT
  );
  const extraDoorPercent = clamp(
    Math.round(options.extraDoorPercent ?? DEFAULT_EXTRA_DOOR_PERCENT),
    MIN_EXTRA_DOOR_PERCENT,
    MAX_EXTRA_DOOR_PERCENT
  );

  const map = createOpenMap(width, height);
  yield { map: cloneMap(map), description: `Open ${String(width)}x${String(height)} map` };

  const roomBounds = innerRoomBounds(width, height);
  const rooms = yield* placeRoomsSteps(map, roomBounds, random);
  yield* placeFrontDoorsSteps(map, doorCount, random);
  yield* connectRoomsSteps(map, rooms);
  yield* placeExtraDoorsSteps(map, extraDoorPercent, random);

  map.grass = computeGrassTiles(map);
  return map;
}

// Every tile reachable from the outer ring by walking through open edges without ever
// entering a room - the ring itself, plus any corridor connected to it. A front door lets
// the flood fill reach a room's own doorway tile from outside, but `isInAnyRoom` stops it
// from ever marking a room tile (or anything only reachable through one) as grass, so a
// room stays room floor even where it opens directly onto the ring.
export function computeGrassTiles(map: GameMap): Set<string> {
  const grass = new Set<string>();
  const queue: Point[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isOuterRing(map, x, y)) continue;
      const point = { x, y };
      grass.add(pointKey(x, y));
      queue.push(point);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head++;
    if (!point) continue;

    for (const [dx, dy] of ADJACENT_OFFSETS) {
      const x = point.x + dx;
      const y = point.y + dy;
      const key = pointKey(x, y);
      if (grass.has(key)) continue;
      if (!canPass(map, point.x, point.y, x, y)) continue;
      if (isInAnyRoom(map, x, y)) continue;

      grass.add(key);
      queue.push({ x, y });
    }
  }

  return grass;
}

// The area rooms may occupy, inset from the map edge by `OUTER_RING_THICKNESS` on every
// side so that ring is never built into and stays walkable all the way around. On a map too
// small to fit both a ring and any room space, this collapses to an empty area (no rooms).
function innerRoomBounds(width: number, height: number): Bounds {
  return {
    left: OUTER_RING_THICKNESS,
    top: OUTER_RING_THICKNESS,
    width: Math.max(0, width - OUTER_RING_THICKNESS * 2),
    height: Math.max(0, height - OUTER_RING_THICKNESS * 2),
  };
}

/** Whether (x, y) is part of the walkable ring reserved around the outside of the map. */
export function isOuterRing(map: GameMap, x: number, y: number): boolean {
  return x < OUTER_RING_THICKNESS || y < OUTER_RING_THICKNESS ||
    x >= map.width - OUTER_RING_THICKNESS || y >= map.height - OUTER_RING_THICKNESS;
}

/** Runs a generator to completion, ignoring yielded steps, and returns its final value. */
function drain<T>(generator: Generator<unknown, T, void>): T {
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value;
}

function cloneMap(map: GameMap): GameMap {
  return {
    width: map.width,
    height: map.height,
    walls: new Set(map.walls),
    doors: new Set(map.doors),
    rooms: [...map.rooms],
    grass: new Set(map.grass),
  };
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

  return { width, height, walls, doors: new Set(), rooms: [], grass: new Set() };
}

/**
 * A map with every interior edge open (freely walkable) and only the border walled - the
 * starting point for generation. Walls are built up as rooms are placed (enclosing each one)
 * rather than carved out of a fully-walled grid, so the interior starts as open floor.
 */
export function createOpenMap(width: number, height: number): GameMap {
  const walls = new Set<string>();

  for (let x = 0; x < width; x++) {
    walls.add(wallKey(x, 0, x, -1));
    walls.add(wallKey(x, height - 1, x, height));
  }
  for (let y = 0; y < height; y++) {
    walls.add(wallKey(0, y, -1, y));
    walls.add(wallKey(width - 1, y, width, y));
  }

  return { width, height, walls, doors: new Set(), rooms: [], grass: new Set() };
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
  return segmentsFromKeys(map.walls);
}

/** Whether the edge between two orthogonally-adjacent tiles is a door: passable, but marking
 * a wall that was deliberately carved open during generation rather than never walled. */
export function hasDoor(map: GameMap, x1: number, y1: number, x2: number, y2: number): boolean {
  return map.doors.has(wallKey(x1, y1, x2, y2));
}

export function getDoorSegments(map: GameMap): WallSegment[] {
  return segmentsFromKeys(map.doors);
}

function segmentsFromKeys(keys: Set<string>): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const key of keys) {
    const [a, b] = key.split("|");
    if (!a || !b) continue;
    const [x1, y1] = a.split(",").map(Number);
    const [x2, y2] = b.split(",").map(Number);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
    segments.push({ x1, y1, x2, y2 });
  }
  return segments;
}

/** Whether (x, y) falls within any room placed during generation. */
export function isInAnyRoom(map: GameMap, x: number, y: number): boolean {
  return map.rooms.some(
    (room) => x >= room.left && x < room.left + room.width && y >= room.top && y < room.top + room.height
  );
}

/** Whether (x, y) is grass: the outer ring, or a non-room tile reachable from it. */
export function isGrass(map: GameMap, x: number, y: number): boolean {
  return map.grass.has(pointKey(x, y));
}

/** Every tile reachable from `start` by walking through open (wall-free) edges, including `start` itself. */
export function getReachableTiles(map: GameMap, start: Point): Point[] {
  const visited = new Set<string>([pointKey(start.x, start.y)]);
  const reachable: Point[] = [start];
  const queue: Point[] = [start];

  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head++;
    if (!point) continue;

    for (const [dx, dy] of ADJACENT_OFFSETS) {
      const x = point.x + dx;
      const y = point.y + dy;
      const key = pointKey(x, y);
      if (visited.has(key)) continue;
      if (!canPass(map, point.x, point.y, x, y)) continue;

      visited.add(key);
      const next = { x, y };
      reachable.push(next);
      queue.push(next);
    }
  }

  return reachable;
}

// Randomly places non-overlapping rooms (2x1 up to 4x4, either orientation)
// anywhere in the map, including flush against the border, until no more
// attempts yield a valid spot. Each attempt tries a random size and position
// rather than tiling a fixed grid, since room sizes vary. Encloses each room
// in walls along its perimeter (against whatever tile - open floor or another
// room - is on the other side), sealing it off from the rest of the map;
// `connectRooms` later carves a doorway through the cheapest wall to reconnect it.
// Every room after the first must be placed directly adjacent (edge-touching) to an
// already-placed room, so the floor plan grows outward as one connected building rather
// than a scatter of disconnected rooms. Rooms may be positioned so they extend past the
// map edge; they're cropped to fit before being placed.
// Exported so tests can inspect room sizes/positions directly. `bounds` restricts where rooms
// may be placed, defaulting to the entire map.
export function placeRooms(
  map: GameMap,
  random: () => number,
  bounds: Bounds = { left: 0, top: 0, width: map.width, height: map.height }
): Room[] {
  return drain(placeRoomsSteps(map, bounds, random));
}

function* placeRoomsSteps(
  map: GameMap,
  bounds: Bounds,
  random: () => number
): Generator<GenerationStep, Room[], void> {
  const rooms = map.rooms;
  const attempts = Math.max(50, bounds.width * bounds.height * ROOM_PLACEMENT_ATTEMPTS_PER_CELL);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const room =
      rooms.length === 0
        ? randomRoom(bounds, random)
        : randomAdjacentRoom(bounds, rooms, random);
    if (!room) continue;
    if (roomOverlapsAny(room, rooms)) continue;

    encloseRoom(map, room);
    rooms.push(room);
    yield {
      map: cloneMap(map),
      description: `Placed room ${String(rooms.length)} (${String(room.width)}x${String(room.height)}) at (${String(room.left)}, ${String(room.top)})`,
    };
  }

  return rooms;
}

function randomRoom(bounds: Bounds, random: () => number): Room | undefined {
  const roomWidth = randomRoomSide(random);
  const roomHeight = randomRoomSide(random);

  const left = bounds.left + randomOffBoundsCoordinate(bounds.width, roomWidth, random);
  const top = bounds.top + randomOffBoundsCoordinate(bounds.height, roomHeight, random);

  return cropToBounds({ left, top, width: roomWidth, height: roomHeight }, bounds);
}

// Picks a room placed directly against a random side of a random already-placed room,
// with a randomly chosen row/column of overlap along the shared edge so the two rooms are
// guaranteed to share at least one tile-length of border.
function randomAdjacentRoom(
  bounds: Bounds,
  rooms: Room[],
  random: () => number
): Room | undefined {
  const base = rooms[Math.floor(random() * rooms.length)];
  if (!base) return undefined;

  const roomWidth = randomRoomSide(random);
  const roomHeight = randomRoomSide(random);

  let left: number;
  let top: number;
  const side = Math.floor(random() * 4);
  if (side === 0 || side === 1) {
    left = side === 0 ? base.left + base.width : base.left - roomWidth;
    const overlapRow = base.top + Math.floor(random() * base.height);
    top = overlapRow - Math.floor(random() * roomHeight);
  } else {
    top = side === 2 ? base.top + base.height : base.top - roomHeight;
    const overlapCol = base.left + Math.floor(random() * base.width);
    left = overlapCol - Math.floor(random() * roomWidth);
  }

  return cropToBounds({ left, top, width: roomWidth, height: roomHeight }, bounds);
}

// A coordinate anywhere in [-(size - 1), boundsSize - 1] relative to the bounds' own origin,
// so the room may start partly off either edge of the bounds.
function randomOffBoundsCoordinate(boundsSize: number, size: number, random: () => number): number {
  return Math.floor(random() * (boundsSize + size - 1)) - (size - 1);
}

// Cropping to the bounds can shrink a room that started at or above MIN_ROOM_SIDE down
// to something thinner (e.g. a 2x3 room placed mostly off the edge); reject those rather
// than placing a room narrower than MIN_ROOM_SIDE in either dimension.
function cropToBounds(rect: Room, bounds: Bounds): Room | undefined {
  const left = Math.max(bounds.left, rect.left);
  const top = Math.max(bounds.top, rect.top);
  const right = Math.min(bounds.left + bounds.width, rect.left + rect.width);
  const bottom = Math.min(bounds.top + bounds.height, rect.top + rect.height);
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_ROOM_SIDE || height < MIN_ROOM_SIDE) return undefined;

  return { left, top, width, height };
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

// Adds a wall between every room tile and each orthogonally-adjacent tile that falls
// outside the room's footprint, sealing the room off from the rest of the map. Tile pairs
// that are both inside the room are left untouched (already open, since the map starts with
// every interior edge open), so the room's own interior stays fully walkable.
function encloseRoom(map: GameMap, room: Room): void {
  for (let y = room.top; y < room.top + room.height; y++) {
    for (let x = room.left; x < room.left + room.width; x++) {
      for (const [dx, dy] of ADJACENT_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (isInsideRoom(room, nx, ny)) continue;
        if (!isInBounds(map, nx, ny)) continue;
        map.walls.add(wallKey(x, y, nx, ny));
      }
    }
  }
}

function isInsideRoom(room: Room, x: number, y: number): boolean {
  return (
    x >= room.left &&
    x < room.left + room.width &&
    y >= room.top &&
    y < room.top + room.height
  );
}

// Exported so tests can exercise front-door placement in isolation, without the doors
// `connectRoomsSteps` may separately carve between a room and the ring when that happens to
// be a room's cheapest route to the network.
export function placeFrontDoors(map: GameMap, doorCount: number, random: () => number): void {
  drain(placeFrontDoorsSteps(map, doorCount, random));
}

// Turns up to `doorCount` walls that separate a room from the outer ring into front doors -
// direct entrances from outside straight into a room, rather than gaps in the ring's own
// outer edge (which never led anywhere; the ring is already fully walkable). Rooms that
// don't border the ring at all get no front door here; `connectRoomsSteps` still guarantees
// every room reaches the network (and, transitively, the ring) some other way.
function* placeFrontDoorsSteps(
  map: GameMap,
  doorCount: number,
  random: () => number
): Generator<GenerationStep, void, void> {
  const candidates = roomToRingWallEdges(map);
  shuffle(candidates, random);

  const chosen = candidates.slice(0, Math.min(doorCount, candidates.length));
  for (const edge of chosen) {
    const key = wallKey(edge.x1, edge.y1, edge.x2, edge.y2);
    map.walls.delete(key);
    map.doors.add(key);
    yield {
      map: cloneMap(map),
      description: `Opened front door between (${String(edge.x1)}, ${String(edge.y1)}) and (${String(edge.x2)}, ${String(edge.y2)})`,
    };
  }
}

function roomToRingWallEdges(map: GameMap): WallSegment[] {
  const edges: WallSegment[] = [];
  for (const room of map.rooms) {
    for (let y = room.top; y < room.top + room.height; y++) {
      for (let x = room.left; x < room.left + room.width; x++) {
        for (const [dx, dy] of ADJACENT_OFFSETS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!isInBounds(map, nx, ny)) continue;
          if (!isOuterRing(map, nx, ny)) continue;
          edges.push({ x1: x, y1: y, x2: nx, y2: ny });
        }
      }
    }
  }
  return edges;
}

function shuffle(items: WallSegment[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = items[i];
    const b = items[j];
    if (a === undefined || b === undefined) continue;
    items[i] = b;
    items[j] = a;
  }
}

// Merges every disconnected "significant" region (each room, plus a single anchor point on
// the outer ring standing in for "the outside") into a single connected component, so every
// room reaches every other room - and, transitively, the ring - by walking through opened
// edges only. Every enclosed room starts as its own isolated component (sealed off by
// `encloseRoom`); the open floor between rooms (and the ring itself) is already one connected
// mass since interior edges start open, so this carves exactly one entryway through the
// cheapest wall of each room still isolated after front doors were placed (usually a single
// edge, since rooms are placed touching existing floor) rather than needing to tunnel long
// corridors through solid rock. (0, 0) is always a ring tile, since the ring is at least
// `OUTER_RING_THICKNESS` deep on every side of any non-empty map.
function* connectRoomsSteps(map: GameMap, rooms: Room[]): Generator<GenerationStep, void, void> {
  const significant = new Set<string>();
  for (const room of rooms) {
    for (let y = room.top; y < room.top + room.height; y++) {
      for (let x = room.left; x < room.left + room.width; x++) {
        significant.add(pointKey(x, y));
      }
    }
  }
  significant.add(pointKey(0, 0));

  const maxMerges = map.width * map.height;
  for (let merges = 0; merges < maxMerges; merges++) {
    const labels = labelSignificantComponents(map, significant);
    if (labels.componentCount <= 1) return;

    const merged = yield* carveShortestPathToOtherComponentSteps(map, labels.grid, 0);
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
function* carveShortestPathToOtherComponentSteps(
  map: GameMap,
  labels: number[][],
  mainLabel: number
): Generator<GenerationStep, boolean, void> {
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
    if (parentPoint) {
      const key = wallKey(point.x, point.y, parentPoint.x, parentPoint.y);
      // The path may pass through edges that were already open (cost 0) on its way to the
      // one that actually needs carving; only an edge that really had a wall becomes a door.
      if (map.walls.has(key)) {
        map.walls.delete(key);
        map.doors.add(key);
        yield {
          map: cloneMap(map),
          description: `Opened door between (${String(point.x)}, ${String(point.y)}) and (${String(parentPoint.x)}, ${String(parentPoint.y)})`,
        };
      }
    }
    cursor = parentPoint;
  }

  return true;
}

// Exported so tests can exercise extra-door placement in isolation.
export function placeExtraDoors(map: GameMap, extraDoorPercent: number, random: () => number): void {
  drain(placeExtraDoorsSteps(map, extraDoorPercent, random));
}

// For every pair of rooms that share a wall with no door on it yet, rolls `extraDoorPercent`
// (0-100) odds of carving a single door somewhere along that shared wall. This runs after
// front doors and room connection, so it only ever adds doors on top of what's already
// there - it never removes or duplicates one, since a pair whose shared wall already has a
// door (from either earlier pass) is skipped entirely.
function* placeExtraDoorsSteps(
  map: GameMap,
  extraDoorPercent: number,
  random: () => number
): Generator<GenerationStep, void, void> {
  const groups = roomToRoomWallGroups(map);

  for (const edges of groups) {
    if (random() >= extraDoorPercent / 100) continue;

    const edge = edges[Math.floor(random() * edges.length)];
    if (!edge) continue;

    const key = wallKey(edge.x1, edge.y1, edge.x2, edge.y2);
    map.walls.delete(key);
    map.doors.add(key);
    yield {
      map: cloneMap(map),
      description: `Opened extra door between (${String(edge.x1)}, ${String(edge.y1)}) and (${String(edge.x2)}, ${String(edge.y2)})`,
    };
  }
}

// One group of unit wall edges per pair of rooms that shares a wall (a "wall length"),
// excluding any pair whose shared wall already has a door somewhere on it. Two non-overlapping
// axis-aligned rooms can only ever be flush along a single side, so each pair contributes at
// most one group.
function roomToRoomWallGroups(map: GameMap): WallSegment[][] {
  const groups: WallSegment[][] = [];
  const rooms = map.rooms;

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b) continue;

      const edges = roomsSharedWallEdges(a, b);
      if (edges.length === 0) continue;
      if (edges.some((edge) => hasDoor(map, edge.x1, edge.y1, edge.x2, edge.y2))) continue;

      groups.push(edges);
    }
  }

  return groups;
}

// Every unit wall edge along the border shared by two rooms, or an empty array if they don't
// share one. Since rooms never overlap, a shared border (if any) is always a single contiguous
// run along one side - never both a vertical and a horizontal run at once.
function roomsSharedWallEdges(a: Room, b: Room): WallSegment[] {
  const edges: WallSegment[] = [];

  if (a.left + a.width === b.left || b.left + b.width === a.left) {
    const [leftRoom, rightRoom] = a.left < b.left ? [a, b] : [b, a];
    const x = leftRoom.left + leftRoom.width;
    const top = Math.max(leftRoom.top, rightRoom.top);
    const bottom = Math.min(leftRoom.top + leftRoom.height, rightRoom.top + rightRoom.height);
    for (let y = top; y < bottom; y++) {
      edges.push({ x1: x - 1, y1: y, x2: x, y2: y });
    }
  }

  if (a.top + a.height === b.top || b.top + b.height === a.top) {
    const [topRoom, bottomRoom] = a.top < b.top ? [a, b] : [b, a];
    const y = topRoom.top + topRoom.height;
    const left = Math.max(topRoom.left, bottomRoom.left);
    const right = Math.min(topRoom.left + topRoom.width, bottomRoom.left + bottomRoom.width);
    for (let x = left; x < right; x++) {
      edges.push({ x1: x, y1: y - 1, x2: x, y2: y });
    }
  }

  return edges;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
