// Pure, framework-free helpers and types for the after-game replay. No Phaser imports so
// it can be unit tested like `mapGeneration.ts`.

export interface ReplayPlayer {
  name: string;
  row: number;
  col: number;
}

export interface ReplayHose {
  path: Array<{ row: number; col: number }>;
  carriedBy: number | null;
}

// One recorded game state - captured at the start of the round and after every move,
// spray, hose pickup/drop and flame spread - so a replay is just stepping through frames.
export interface ReplayFrame {
  players: ReplayPlayer[];
  activePlayerIndex: number;
  flames: string[];
  hoses: ReplayHose[];
  label: string;
}

export const DEFAULT_REPLAY_SPEED = 1;
export const REPLAY_SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];
const BASE_STEP_MS = 1000;

// Milliseconds each move is shown for at `speed` (1 = one second per move).
export function stepDurationMs(speed: number): number {
  return BASE_STEP_MS / speed;
}

// The next faster (+1) or slower (-1) entry in `REPLAY_SPEEDS`, clamped at both ends.
export function adjustSpeed(speed: number, direction: 1 | -1): number {
  const index = REPLAY_SPEEDS.indexOf(speed);
  const current = index === -1 ? REPLAY_SPEEDS.indexOf(DEFAULT_REPLAY_SPEED) : index;
  const next = Math.min(REPLAY_SPEEDS.length - 1, Math.max(0, current + direction));
  return REPLAY_SPEEDS[next] ?? DEFAULT_REPLAY_SPEED;
}

export function clampFrameIndex(index: number, frameCount: number): number {
  return Math.min(Math.max(0, frameCount - 1), Math.max(0, index));
}

export function cloneFrame(frame: ReplayFrame): ReplayFrame {
  return {
    players: frame.players.map((p) => ({ ...p })),
    activePlayerIndex: frame.activePlayerIndex,
    flames: [...frame.flames],
    hoses: frame.hoses.map((h) => ({
      path: h.path.map((t) => ({ ...t })),
      carriedBy: h.carriedBy,
    })),
    label: frame.label,
  };
}
