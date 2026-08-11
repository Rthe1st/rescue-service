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
- **Door** — a wall segment generation deliberately carves open (as opposed to one that
  was simply never walled), stored separately in `GameMap.doors`, same edge-key format as
  `walls`. Comes in three flavors: a **front door**, opened directly between a room and
  the outer ring (`placeFrontDoorsSteps`, up to `doorCount` of them — clamped to 1–10,
  `MIN_DOOR_COUNT`/`MAX_DOOR_COUNT`, defaulting to `DEFAULT_DOOR_COUNT`); an **interior
  connector**, carved by `connectRoomsSteps` through whichever wall is cheapest to reach a
  room still disconnected from the network after front doors are placed; and an **extra
  door**, added afterward by `addExtraDoorsSteps` between two rooms that are adjacent but
  don't yet have a door between them — see `extraDoorPercent` below.
- **Map generation** — the overall process in `generateMap`/`generateMapSteps`: open an
  empty map, place rooms (sealing each one off as it's added), open front doors between
  rooms and the ring, connect every still-isolated room into the network by carving the
  cheapest path between disconnected groups
  (`connectRoomsSteps`/`carveShortestPathToOtherComponentSteps`) until only one remains,
  then roll extra doors between adjacent rooms that ended up without one
  (`addExtraDoorsSteps`) so the building isn't just a single linear chain of rooms.
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
- **Fire hose** — an object a player character can carry, tracked as an entry in
  `GameScene.hoses` as `{ path, carriedBy }`. Each round, `hoseCount` of them (a setting)
  are placed on distinct random outer-ring tiles (`placeHosesAtStart`); each hose's
  `path[0]`, its anchor end, stays fixed at its starting tile for the rest of the round and
  can never be picked up or moved. Standing on a hose's other end - its loose end, `path`'s
  last tile - and pressing the "Pick up hose"/"Drop hose" button (in the center of the
  D-pad) toggles whether the active player is carrying it (`hoseAction`/`toggleHoseCarry`);
  a player can carry at most one hose at a time, and a hose already carried by another
  player can't be picked up (`carriedHose`). While carried, each move extends the hose
  through the tile just walked into, unless that tile is the one the hose's loose end just
  came from, in which case the hose retracts there instead (`extendOrRetractHose`). A hose
  can never occupy more than `maxHoseLength` tiles - once at that length, the carrying
  player can't move to a new tile until they either drop the hose or retract it. Dropping
  leaves the hose lying in place until someone picks it up again from its loose end. Every
  hose is rendered as a thick red line through every tile it occupies, with a small circle
  marking its loose end.
- **Spray** — extinguishes fire at range instead of moving. Only available while carrying
  a hose: pressing the spray button (top-right, only visible then) arms aiming mode
  without ending the turn; the next arrow button press fires in that direction instead of
  moving, searching up to `hoseSprayRange` tiles in a straight line from the carrying
  player, stopping at the first wall, and extinguishing only the *nearest* flame tile hit
  along that line - flames further away on the same line are left burning (`sprayHose`).
  Firing (or losing eligibility to spray, e.g. the burn phase starting) disarms aiming
  mode. Doesn't move the player or change the hose's path; like a move, it ends the active
  player's turn.
- **Round** — one play-through from a freshly-placed player and a freshly-ignited fire
  (`startRound`) until game over. Starting a new game, or changing the grid size in
  settings mid-game, starts a new round on a newly generated map.
- **Fog of war** — when `fogOfWarEnabled`, tiles are only rendered with their true state if
  currently *visible*, per `lineOfSightMode` (see `computeVisibleTiles`/
  `computeVisibleTilesForAll` in `src/visibility.ts`, which multiple player characters
  combine by union):
  - `"2d"` — a true line of sight to every tile with a clear, unobstructed straight line
    from a player character's own tile, in any direction (not just the 4 cardinal ones,
    since standing outdoors is open ground rather than a corridor). Since rooms are always
    convex rectangles with no internal walls, this already reveals a room's every tile once
    a player character is standing in any part of it - not as a special case, just because
    nothing blocks the sight line.
  - `"room"` — the entire room a player character is standing in and nothing beyond it, or,
    if not in a room, the entire outdoor area (every tile reachable from the outer ring
    without passing through a room - see `isGrass`/`GameMap.grass` in `mapGeneration.ts`)
    rather than only a direct line of sight.
  - `"2d-plus"` — the union of both: `"2d"`'s line of sight, plus the player character's
    entire current room. In practice this only ever adds anything beyond what `"2d"` already
    shows if a future change gives rooms a non-convex shape or internal walls; today the two
    modes coincide while standing in a room, for the same reason `"2d"` already reveals it.
  Everything else is either **memorized** or **fogged**:
  - Every move (a player character's position changing, including the round's starting
    positions as "move zero") records a snapshot of what was visible at that moment -
    `GameScene.visibilityHistory`, capped at the `fogOfWarMemoryMoves` most recent moves (0
    means no memory: a tile fogs over again the instant it's no longer directly visible).
    A tile is memorized if any remembered snapshot saw it, regardless of which room (or no
    room) it belongs to - fog of war has no special awareness of rooms beyond how they
    shape what `computeVisibleTiles` reveals. Without `fogOfWarStaticMemory`, a memorized
    tile still shows its true, live state (e.g. fire that has since spread there). With
    `fogOfWarStaticMemory` on, a memorized tile instead renders whatever the *most recent*
    remembered snapshot saw there - frozen until a player character can see it again, which
    both re-reveals it live and starts a fresh snapshot going forward.
  - Any tile that's neither currently visible nor memorized is fogged: rendered as a
    light grey (`FOG_COLOR`) regardless of what's actually there.
  Walls and doors are always drawn regardless of fog, since they're part of the building's
  fixed structure rather than something that changes tile by tile.

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
- **`doorCount`** ("Number of doors") — how many border walls generation opens into front
  doors; see **Door** above.
- **`extraDoorPercent`** ("Extra door chance (%)") — the chance, as a percentage, that
  generation carves an extra door into a wall shared by two adjacent rooms that don't
  already have a door between them; clamped to 0–100 (`MIN_EXTRA_DOOR_PERCENT`/
  `MAX_EXTRA_DOOR_PERCENT`), defaulting to `DEFAULT_EXTRA_DOOR_PERCENT`; see **Door**
  above.
- **`playerCount`** ("Number of players") — how many player characters are in play; see
  **Player character** above.
- **`maxHoseLength`** ("Max hose length") — the most tiles a fire hose can occupy at
  once; see **Fire hose** above.
- **`hoseSprayRange`** ("Hose spray range") — how far the spray searches for a flame to
  extinguish; see **Spray** above.
- **`hoseCount`** ("Number of hoses") — how many fire hoses (0-10) are placed on the map
  each round; see **Fire hose** above.
- **`fogOfWarEnabled`** ("Fog of war") — whether tiles outside a player character's current
  visibility and move memory render fogged instead of their true state; see **Fog of war**
  above.
- **`fogOfWarMemoryMoves`** ("Fog of war memory (moves)") — how many of the most recent
  moves stay memorized instead of immediately fogging over again; clamped to 0–20
  (`MIN_FOG_OF_WAR_MEMORY_MOVES`/`MAX_FOG_OF_WAR_MEMORY_MOVES`), defaulting to
  `DEFAULT_FOG_OF_WAR_MEMORY_MOVES` (0, no memory); see **Fog of war** above.
- **`fogOfWarStaticMemory`** ("Fog of war static memory") — whether a memorized-but-not-
  currently-visible tile renders a frozen snapshot of its last-seen fire state instead of
  its true, live state; see **Fog of war** above.
- **`lineOfSightMode`** ("Line of sight mode") — which of `"2d"`, `"room"`, or `"2d-plus"`
  determines what's currently visible; defaults to `DEFAULT_LINE_OF_SIGHT_MODE` (`"2d-plus"`);
  see **Fog of war** above.
