import { canPass, hasDoor, type GameMap, type Room } from "./mapGeneration";

export interface Point {
  x: number;
  y: number;
}

const DIRECTIONS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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

/**
 * Tiles visible to a player standing at `player`: every tile of the room they're in, plus a
 * straight line of sight out through every door on that room's perimeter (stopping at the
 * first wall beyond it) - "the room they're in and in direct lines through doors" applies to
 * every door of the room, not just one aligned with the player's exact tile, since the whole
 * room is already revealed regardless of where in it they're standing. A player not
 * currently in any room instead sees just their own tile plus a straight line of sight in
 * each of the 4 cardinal directions from it. Line-walking uses the same rule as the fire
 * hose's spray (`sprayHose` in `GameScene`), so seeing through a doorway and spraying through
 * one cover exactly the same tiles.
 */
export function computeVisibleTiles(map: GameMap, player: Point): Set<string> {
  const visible = new Set<string>();
  const room = roomAt(map, player.x, player.y);

  if (room) {
    for (let y = room.top; y < room.top + room.height; y++) {
      for (let x = room.left; x < room.left + room.width; x++) {
        visible.add(pointKey(x, y));
      }
    }
    for (const doorway of roomDoorways(map, room)) {
      castRay(map, visible, doorway.outside, doorway.dx, doorway.dy);
    }
  } else {
    for (const [dx, dy] of DIRECTIONS) {
      castRay(map, visible, player, dx, dy);
    }
  }

  return visible;
}

/** Walks from `start` in direction (dx, dy) while the way stays open, marking every tile
 * along the way (including `start` itself) visible. */
function castRay(map: GameMap, visible: Set<string>, start: Point, dx: number, dy: number): void {
  let x = start.x;
  let y = start.y;
  visible.add(pointKey(x, y));
  while (canPass(map, x, y, x + dx, y + dy)) {
    x += dx;
    y += dy;
    visible.add(pointKey(x, y));
  }
}

/** Every door on `room`'s perimeter, as the tile just outside it and the outward direction
 * to keep looking in. */
function roomDoorways(map: GameMap, room: Room): Array<{ outside: Point; dx: number; dy: number }> {
  const doorways: Array<{ outside: Point; dx: number; dy: number }> = [];

  for (let y = room.top; y < room.top + room.height; y++) {
    for (let x = room.left; x < room.left + room.width; x++) {
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        const insideRoom =
          nx >= room.left && nx < room.left + room.width && ny >= room.top && ny < room.top + room.height;
        if (insideRoom) continue;
        if (hasDoor(map, x, y, nx, ny)) {
          doorways.push({ outside: { x: nx, y: ny }, dx, dy });
        }
      }
    }
  }

  return doorways;
}

/** Tiles visible to any of several players at once - the union of each one's own view. */
export function computeVisibleTilesForAll(map: GameMap, players: Point[]): Set<string> {
  const visible = new Set<string>();
  for (const player of players) {
    for (const key of computeVisibleTiles(map, player)) visible.add(key);
  }
  return visible;
}

export function pointKey(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}
