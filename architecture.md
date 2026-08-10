# Architecture

Technical overview of how Rescue Service is implemented. See `glossary.md` for what the
game concepts named here (tiles, walls, rooms, doors, phases, ...) actually mean.

## Stack

- **Phaser 3** — the game engine; renders the board with primitive `Rectangle`/`Graphics`
  objects rather than sprites, since the whole game is just colored squares and lines.
- **TypeScript**, compiled/bundled with **Vite** (`vite.config.ts`, `npm run build`/`dev`).
- **lil-gui** — powers the in-game settings panel (the gear icon), bound directly to the
  shared `gameSettings` object.
- **Vitest** — unit tests, colocated with source as `*.test.ts` (currently just
  `src/mapGeneration.test.ts`).
- **Playwright** — layout/visual tests in `tests/`, run against a real dev server.
- **Cloudflare Pages** (via `wrangler`) — hosting; every push gets its own preview
  deployment (see `README.md` and `.github/workflows/cloudflare-pages-check.yml`).

## Source layout

Everything lives flat in `src/`, no subdirectories:

- `main.ts` — creates the single `Phaser.Game` instance and registers the three scenes.
- `gameSettings.ts` — the mutable `gameSettings` object, its defaults, and the
  `createSettingsGui` panel (including preset save/load via `localStorage`).
- `mapGeneration.ts` — pure, framework-free map data structure and generation logic. No
  Phaser imports; this is what's unit tested.
- `MainMenuScene.ts`, `MapPreviewScene.ts`, `GameScene.ts` — one Phaser `Scene` subclass
  each, registered in `main.ts` and switched between with `this.scene.start(...)`.

## Map representation

A `GameMap` is `{ width, height, walls }`, where `walls` is a `Set<string>` of
canonicalized tile-pair keys (`wallKey`). Walls are edges between tiles, not tiles
themselves — deliberately, so a room can be represented as open floor enclosed by a
perimeter of walls, and a doorway is just the *absence* of one wall segment, rather than
needing a separate "carve a gap" step that mutates tile types. Every map function
(`hasWall`, `canPass`, `isInBounds`, `getWallSegments`) takes a `GameMap` and tile
coordinates and is a pure function with no hidden state, which is what makes
`mapGeneration.ts` cleanly unit-testable independent of Phaser or the DOM.

Generation (`generateMapSteps`) runs in five passes over a shared mutable `GameMap`:

1. `createOpenMap` — every interior edge open, only the outer border walled.
2. `placeRoomsSteps` — randomly place non-overlapping, edge-adjacent rooms, enclosing
   each one in walls as it's placed.
3. `placeFrontDoorsSteps` — pick up to `doorCount` walls between a room and the outer
   ring and open them into front doors.
4. `connectRoomsSteps` — label connected components among "significant" tiles (room
   tiles and a ring anchor point) via flood fill, then repeatedly carve the cheapest path
   (0-1 BFS over wall-crossing cost) between two components until only one remains.
5. `placeExtraDoorsSteps` — for every pair of rooms sharing a wall with no door on it yet,
   roll `extraDoorPercent` odds of carving one extra door somewhere along that shared
   wall (`roomToRoomWallGroups` groups each pair's shared wall into a single candidate).

Both `generateMap` (returns the finished map) and `generateMapSteps` (a generator that
also yields an intermediate snapshot after every meaningful change) run the same logic;
`generateMap` just drains the generator. `MapPreviewScene` is the only caller that steps
through the generator manually, on a timer, to animate the process.

## Scenes and game loop

`main.ts` configures Phaser with `Scale.RESIZE` (the canvas always fills its parent) and
registers `MainMenuScene`, `MapPreviewScene`, `GameScene` by name. Scenes hand data to
each other via `scene.start(key, data)` / `init(data)` — e.g. `MainMenuScene` passes a
freshly generated (or, via `MapPreviewScene`, pre-built) `GameMap` into `GameScene`.

Each scene manages its own layout from scratch on `create()` and on the Phaser
`Scale.RESIZE` event, recomputing a `cellSize` from the available space (accounting for
portrait vs. landscape, and, in `GameScene`, a reserved area for the on-screen D-pad) and
redrawing the board and any UI. There's no persistent DOM layout being resized — each
`layout()` call destroys and recreates the affected Phaser objects.

`GameScene` owns the actual play loop:

- `startRound()` places the player on a random door (`placePlayerAtStart`, using
  `getDoorTiles`) and ignites one flame on a tile reachable from there
  (`igniteRandomFlame`, using `findReachableTiles`).
- `update(_time, delta)` counts down `phaseTimerMs` every frame; when it runs out it
  flips between the firefighting and burn phases (`startFirefightingPhase`/
  `startBurnPhase`).
- Movement (`movePlayer`) is only accepted during the firefighting phase, and only
  between tiles `canPass` allows.
- `spreadFlames()` runs once per burn phase, extending every current flame into some of
  its passable neighbors.
- Both moving onto a flame and a flame spreading onto the player's tile call `endGame()`,
  which freezes the round and shows the game-over status text.
- The fire hose (`GameScene.hose`, `{ path, carriedBy }`) is placed once per round
  (`placeHoseAtStart`) and otherwise only changes in response to the hose button
  (`toggleHoseCarry`, only ever offered for `path`'s last tile - its loose end, since
  `path[0]` is a fixed anchor once placed) and, while carried, `movePlayer` calling
  `extendOrRetractHose` before committing each move - growing or shrinking `hose.path`,
  capped at the `maxHoseLength` setting, rather than living on the map data itself, so it's
  drawn as an overlay (`drawHose`) independent of tile rendering.
- Spraying (`sprayHose`) is an alternate turn action, only reachable while carrying the
  hose: the spray button arms `sprayArmed` without ending the turn, and the direction
  buttons check that flag (`createControls`'s pointerdown handler) to route to `sprayHose`
  instead of `movePlayer` - walking up to `hoseSprayRange` tiles from the player in a
  straight line, stopping at the first wall, and clearing any flame found along the way.

## Settings

`gameSettings` (in `gameSettings.ts`) is a single mutable object holding every tunable
parameter, with matching `DEFAULT_*` constants. `createSettingsGui` builds a lil-gui
panel bound directly to that object's fields via `.onChange`, so any scene that creates
the panel (currently `MainMenuScene` and `GameScene`) edits the same live settings and
can react to changes (e.g. `GameScene` regenerates the map if `gridSize` changed).
Presets are named snapshots of the whole `GameParams` object, validated with
`isGameParams` and persisted to `localStorage` under a fixed key.

## Testing

- **Unit tests** (`npm run test:unit`, Vitest) cover `mapGeneration.ts` directly —
  generation invariants (door counts, room enclosure, connectivity), and the
  `getDoorTiles`/`findReachableTiles` helpers — using a seeded PRNG (`mulberry32`) so
  generation is deterministic in tests.
- **Layout tests** (`npm run test:layout`, Playwright) load the built app in a real
  browser at different viewport sizes/orientations and assert on scene element bounds
  (exposed via each scene's `getTestBounds()`) to catch elements clipping off-screen or
  overlapping. `playwright.config.ts` launches the sandboxed dev environment's
  pre-installed Chromium directly (via `PLAYWRIGHT_BROWSERS_PATH`) when present, since
  its pinned revision can lag behind the one this project's Playwright version expects
  to download; CI is unaffected, as it always installs a matching browser fresh.
- Every push additionally triggers a Cloudflare Pages deployment and a check that the
  deployed page loads with no console errors (`.github/workflows/cloudflare-pages-check.yml`,
  `scripts/check-deployment.mjs`).
