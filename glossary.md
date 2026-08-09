# Glossary

Game concepts for Rescue Service, using the same names the code uses. Written for
whoever is designing or tuning the game — each entry says what the concept means and,
where it isn't obvious, how it's represented in code.

## Map

- **Tile** — one cell of the square grid the game is played on. A tile is identified by
  `(x, y)` (or `(col, row)` in `GameScene`, which are the same thing). Every `(x, y)`
  with `0 <= x < width` and `0 <= y < height` is a floor tile — there's no concept of a
  solid, unwalkable tile; what blocks movement is **walls** between tiles.
- **Wall** — a thin partition *between* two orthogonally-adjacent tiles, or between a
  border tile and the outside of the map. Walls are not tiles themselves; they're edges,
  stored in `GameMap.walls` as a set of tile-pair keys (see `wallKey` in
  `src/mapGeneration.ts`). This is why a room reads as a room (open floor enclosed by
  walls on its perimeter) instead of being carved as a tunnel through solid rock: the
  interior of the map starts fully open, and walls get added as rooms are placed.
- **`GameMap`** — the data structure for a generated map: `width`, `height`, and the
  `walls` set. `canPass(map, x1, y1, x2, y2)` is the one function that answers "can a
  player or flame move directly between these two adjacent tiles" — it checks bounds and
  the wall set together.
- **Room** — a randomly-sized (2x1 up to 4x4) rectangular area of floor, placed by
  `placeRooms`/`placeRoomsSteps`. Rooms never overlap, and every room after the first
  must be placed edge-touching an already-placed room, so the floor plan grows outward
  as one connected building. A room is enclosed in walls along its perimeter as soon as
  it's placed (`encloseRoom`), sealing it off from the rest of the map until a doorway is
  carved back through.
- **Door** — one of the border wall segments that generation deliberately leaves open
  (or reopens), so the outside of the map is reachable. The number of doors is the
  `doorCount` option to `generateMap`, clamped to 1–10 (`MIN_DOOR_COUNT`/
  `MAX_DOOR_COUNT`), defaulting to `DEFAULT_DOOR_COUNT`. `getDoorTiles` returns every
  door as a set of border tile coordinates.
- **Map generation** — the overall process in `generateMap`/`generateMapSteps`: open an
  empty map, place rooms (sealing each one off as it's added), pick and open door tiles
  on the border, then connect every room and door into a single reachable network by
  carving the cheapest path between any two disconnected groups
  (`connectRoomsSteps`/`carveShortestPathToOtherComponentSteps`) until only one remains.
  `generateMapSteps` is a generator that yields a `GenerationStep` (a map snapshot plus a
  description) after every meaningful change, which is what lets the map preview screen
  animate generation instead of only showing the finished map.
- **Reachable tile** — a tile connected to some starting tile by a chain of open
  (non-walled) edges, computed by `findReachableTiles`. Used to make sure the starting
  fire is somewhere the player can actually walk to.

## Play

- **Player character** — the single controllable token on the board, drawn as a black
  square. Its position is `playerRow`/`playerCol` in `GameScene` (row = y, col = x, to
  match the board's row/column layout). At the start of each round it's placed on a
  random door tile (`placePlayerAtStart`), so it always starts at a map edge with a path
  in.
- **Fire** / **flame** — a burning tile, drawn in red. The set of currently-burning
  tiles is `GameScene.flames`. A round starts with exactly one flame, ignited on a tile
  reachable from the player's start position (`igniteRandomFlame`) — so the player always
  has *some* path to it, even if fighting through the burn phase is a different story.
- **Firefighting phase** — the game phase during which the player can move. Named
  `"firefighting"` in the `GamePhase` type. Lasts `firefightingDurationSeconds` (a
  setting) before switching to the burn phase.
- **Burn phase** — the game phase during which the fire spreads and the player cannot
  move. Named `"burn"`. Lasts a fixed `BURN_PHASE_DURATION_MS` (1 second), then play
  returns to the firefighting phase. Each flame spreads into some number of its open,
  in-bounds neighboring tiles, controlled by the `spreadDirections` setting
  (`spreadFlames`/`pickRandomDirections`).
- **Game over** — reached the instant the player's tile catches fire, whether that
  happens by moving into a flame during firefighting or by a flame spreading onto the
  player's tile during the burn phase (`endGame`). Movement stops and the status text
  shows "Caught in the flames! Game Over".
- **Round** — one play-through from a freshly-placed player and a freshly-ignited fire
  (`startRound`) until game over. Starting a new game, or changing the grid size in
  settings mid-game, starts a new round on a newly generated map.

## Screens

- **`MainMenuScene`** — the title screen: game title, a Start button, and the settings
  gear. Whether Start goes straight into `GameScene` or through `MapPreviewScene` first
  depends on the `editMapsBeforePlay` setting.
- **`MapPreviewScene`** — an optional screen (see `editMapsBeforePlay`) that animates map
  generation step-by-step, with Pause/Resume and Regenerate controls, before handing the
  finished map to `GameScene` via its Start button.
- **`GameScene`** — the actual game: renders the board, walls, player, and flames; reads
  arrow-button input to move the player; and drives the firefighting/burn phase loop.

## Settings

All adjustable via the gear icon's debug panel (`createSettingsGui` in
`src/gameSettings.ts`), which reads and writes the shared `gameSettings` object directly
so every scene's panel stays in sync. Settings can be saved/loaded as named presets in
`localStorage`.

- **`gridSize`** ("Number of squares") — the map's width and height in tiles. Changing it
  regenerates the map and starts a new round.
- **`cellSizeScale`** ("Square size") — a multiplier applied to the computed tile size,
  for making the board render larger or smaller than the default fit.
- **`buttonSize`** ("Arrow control size") — font size (in px) of the directional control
  buttons, which also drives their approximate width/height.
- **`buttonSpacing`** ("Arrow control spacing") — distance (in px) from the center of the
  D-pad cluster to each arrow button.
- **`firefightingDurationSeconds`** ("Firefighting duration (s)") — how long the
  firefighting phase lasts before the burn phase kicks in.
- **`spreadDirections`** ("Flame spread directions") — how many of a flame's (up to 4)
  open neighboring directions it spreads into each burn phase; picked randomly each time
  when fewer than 4.
- **`editMapsBeforePlay`** ("Edit maps before play") — whether Start on the main menu
  routes through `MapPreviewScene` first instead of going directly into `GameScene`.
- **`generationStepDelayMs`** ("Map generation step delay (ms)") — the delay between
  animated generation steps in `MapPreviewScene`; smaller is faster.
