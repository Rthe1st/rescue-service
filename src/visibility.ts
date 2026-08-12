import { canPass, getDoorSegments, isInBounds, type GameMap, type Room } from "./mapGeneration";

export interface Point {
  x: number;
  y: number;
}

/**
 * How much of the map counts as "visible" from a player's position:
 * - `"bresenham"` - a true 2D line of sight to every tile with a clear, unobstructed straight
 *   line from the player's own tile, whether or not they're in a room (named for the
 *   Bresenham line-walk algorithm it's computed with - see `hasLineOfSight`).
 * - `"room"` - if the player is in a room, the entire room (regardless of where in it
 *   they're standing) and nothing beyond it; if not, the entire outdoor area (every tile
 *   reachable from the outer ring without passing through a room - see `isGrass` in
 *   `mapGeneration.ts`) rather than only what's in a direct line.
 * - `"bresenham-plus"` - the union of both: `"bresenham"`'s line of sight, plus the player's
 *   entire current room if they're standing in one.
 * - `"room-plus"` - `"room"`'s reveal, plus a triangular "peek" through every door on the
 *   current room's walls: the tile directly opposite the door, then the 3 tiles one step
 *   further out, then 5 two steps out, and so on (see `doorConeTiles`). The peek only ever
 *   reaches into the single room (or outdoor area) directly on the other side of a given
 *   door - it stops at that space's own far walls rather than continuing through a second
 *   doorway into a room beyond it.
 */
export type LineOfSightMode = "bresenham" | "room" | "bresenham-plus" | "room-plus";

export const LINE_OF_SIGHT_MODES: readonly LineOfSightMode[] = [
  "bresenham",
  "room",
  "bresenham-plus",
  "room-plus",
];

/** The room (if any) containing (x, y). */
export function roomAt(map: GameMap, x: number, y: number): Room | undefined {
  return map.rooms.find((room) => tileInRoom(room, x, y));
}

function tileInRoom(room: Room, x: number, y: number): boolean {
  return x >= room.left && x < room.left + room.width && y >= room.top && y < room.top + room.height;
}

/** Tiles visible to a player standing at `player`, according to `mode` (see `LineOfSightMode`). */
export function computeVisibleTiles(map: GameMap, player: Point, mode: LineOfSightMode): Set<string> {
  const room = roomAt(map, player.x, player.y);

  if (mode === "room" || mode === "room-plus") {
    if (!room) return new Set(map.grass);
    const visible = roomTiles(room);
    if (mode === "room-plus") {
      for (const key of doorPeekTiles(map, room)) visible.add(key);
    }
    return visible;
  }

  const lineOfSight = computeLineOfSightTiles(map, player);
  if (mode === "bresenham" || !room) return lineOfSight;

  const visible = new Set(lineOfSight);
  for (const key of roomTiles(room)) visible.add(key);
  return visible;
}

function roomTiles(room: Room): Set<string> {
  const tiles = new Set<string>();
  for (let y = room.top; y < room.top + room.height; y++) {
    for (let x = room.left; x < room.left + room.width; x++) {
      tiles.add(pointKey(x, y));
    }
  }
  return tiles;
}

/** The triangular door-peek tiles (see `LineOfSightMode`'s `"room-plus"` doc) for every door
 * on `room`'s own walls. */
function doorPeekTiles(map: GameMap, room: Room): Set<string> {
  const tiles = new Set<string>();
  for (const segment of getDoorSegments(map)) {
    const oneIn = tileInRoom(room, segment.x1, segment.y1);
    const otherIn = tileInRoom(room, segment.x2, segment.y2);
    if (oneIn === otherIn) continue;

    const inside = oneIn ? { x: segment.x1, y: segment.y1 } : { x: segment.x2, y: segment.y2 };
    const outside = oneIn ? { x: segment.x2, y: segment.y2 } : { x: segment.x1, y: segment.y1 };
    for (const key of doorConeTiles(map, inside, outside)) tiles.add(key);
  }
  return tiles;
}

/**
 * Tiles visible by peeking straight through a single door from `inside` to `outside`, as an
 * expanding triangle: `outside` itself (1 tile), then the row one step further out (3 tiles
 * centered on the door's line), then two steps out (5 tiles), and so on. Bounded to whichever
 * single room (or outdoor area) `outside` itself belongs to - once a layer's tiles would spill
 * into a different room (through a second doorway) or off the edge of that space, that layer
 * stops contributing and the peek ends there. Since rooms are always convex rectangles with no
 * internal walls (see `"bresenham"` in `LineOfSightMode`'s doc), simply staying within the same
 * room-membership as `outside` is enough to respect real walls too, without tracing them tile
 * by tile.
 */
function doorConeTiles(map: GameMap, inside: Point, outside: Point): Set<string> {
  const tiles = new Set<string>();
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  const perpX = -dy;
  const perpY = dx;
  const targetRoom = roomAt(map, outside.x, outside.y);
  const maxLayers = Math.max(map.width, map.height);

  for (let layer = 0; layer <= maxLayers; layer++) {
    let addedAny = false;
    for (let k = -layer; k <= layer; k++) {
      const x = outside.x + dx * layer + perpX * k;
      const y = outside.y + dy * layer + perpY * k;
      if (!isInBounds(map, x, y)) continue;
      if (roomAt(map, x, y) !== targetRoom) continue;

      tiles.add(pointKey(x, y));
      addedAny = true;
    }
    if (!addedAny) break;
  }

  return tiles;
}

/** Every tile in the map with an unobstructed straight line of sight from `player`. */
function computeLineOfSightTiles(map: GameMap, player: Point): Set<string> {
  const visible = new Set<string>([pointKey(player.x, player.y)]);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (x === player.x && y === player.y) continue;
      if (hasLineOfSight(map, player, { x, y })) visible.add(pointKey(x, y));
    }
  }

  return visible;
}

/**
 * Whether a straight line from `from` to `to` crosses no walls, walking tile-to-tile via
 * Bresenham's algorithm. A step that moves diagonally (common whenever the line isn't
 * perfectly horizontal, vertical, or 45 degrees) is permitted if either of the two
 * orthogonal detours around that corner is open - matching the usual roguelike rule that a
 * single solid corner tile doesn't block sight, but a diagonal pair of walls (both detours
 * blocked) does.
 */
function hasLineOfSight(map: GameMap, from: Point, to: Point): boolean {
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let err = dx - dy;

  while (x !== to.x || y !== to.y) {
    const e2 = 2 * err;
    const stepX = e2 > -dy;
    const stepY = e2 < dx;

    if (stepX && stepY) {
      const throughHorizontal =
        canPass(map, x, y, x + sx, y) && canPass(map, x + sx, y, x + sx, y + sy);
      const throughVertical =
        canPass(map, x, y, x, y + sy) && canPass(map, x, y + sy, x + sx, y + sy);
      if (!throughHorizontal && !throughVertical) return false;
      x += sx;
      y += sy;
      err += dx - dy;
    } else if (stepX) {
      if (!canPass(map, x, y, x + sx, y)) return false;
      x += sx;
      err -= dy;
    } else {
      if (!canPass(map, x, y, x, y + sy)) return false;
      y += sy;
      err += dx;
    }
  }

  return true;
}

/** Tiles visible to any of several players at once - the union of each one's own view. */
export function computeVisibleTilesForAll(map: GameMap, players: Point[], mode: LineOfSightMode): Set<string> {
  const visible = new Set<string>();
  for (const player of players) {
    for (const key of computeVisibleTiles(map, player, mode)) visible.add(key);
  }
  return visible;
}

export function pointKey(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}
