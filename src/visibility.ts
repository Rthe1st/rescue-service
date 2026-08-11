import { canPass, type GameMap, type Room } from "./mapGeneration";

export interface Point {
  x: number;
  y: number;
}

/**
 * How much of the map counts as "visible" from a player's position:
 * - `"2d"` - a true 2D line of sight to every tile with a clear, unobstructed straight line
 *   from the player's own tile, whether or not they're in a room.
 * - `"room"` - if the player is in a room, the entire room (regardless of where in it
 *   they're standing) and nothing beyond it; if not, the entire outdoor area (every tile
 *   reachable from the outer ring without passing through a room - see `isGrass` in
 *   `mapGeneration.ts`) rather than only what's in a direct line.
 * - `"2d-plus"` - the union of both: `"2d"`'s line of sight, plus the player's entire
 *   current room if they're standing in one.
 */
export type LineOfSightMode = "2d" | "room" | "2d-plus";

export const LINE_OF_SIGHT_MODES: readonly LineOfSightMode[] = ["2d", "room", "2d-plus"];

/** The room (if any) containing (x, y). */
export function roomAt(map: GameMap, x: number, y: number): Room | undefined {
  return map.rooms.find(
    (room) =>
      x >= room.left &&
      x < room.left + room.width &&
      y >= room.top &&
      y < room.top + room.height
  );
}

/** Tiles visible to a player standing at `player`, according to `mode` (see `LineOfSightMode`). */
export function computeVisibleTiles(map: GameMap, player: Point, mode: LineOfSightMode): Set<string> {
  const room = roomAt(map, player.x, player.y);

  if (mode === "room") {
    return room ? roomTiles(room) : new Set(map.grass);
  }

  const lineOfSight = computeLineOfSightTiles(map, player);
  if (mode === "2d" || !room) return lineOfSight;

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
