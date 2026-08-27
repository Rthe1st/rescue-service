export const MIN_UX_ELEMENT_PERCENT = 0;
export const MAX_UX_ELEMENT_PERCENT = 100;

export interface UxElementLayoutSettings {
  sizePercent: number;
  xPercent: number;
  yPercent: number;
}

export interface UxElementPosition {
  x: number;
  y: number;
  size: number;
}

// `xPercent`/`yPercent` place the element's center as a percentage of screen width from the
// left edge and screen height from the bottom edge; `sizePercent` is a percentage of screen
// width, matching the units callers use for whichever pixel property (font size, board
// width, ...) actually represents that element's "size".
export function computeUxElementPosition(
  settings: UxElementLayoutSettings,
  screenWidth: number,
  screenHeight: number
): UxElementPosition {
  return {
    x: (settings.xPercent / 100) * screenWidth,
    y: screenHeight - (settings.yPercent / 100) * screenHeight,
    size: (settings.sizePercent / 100) * screenWidth,
  };
}

// Clamps a centered span of `size` so it fits within [minOffset, screenExtent], returning
// the top-left offset. Used for elements (like the game board) positioned by top-left
// corner rather than by a Phaser display-object origin. `minOffset` reserves a band (e.g.
// a fixed header) the span should never start above.
export function clampedTopLeft(
  center: number,
  size: number,
  screenExtent: number,
  minOffset = 0
): number {
  if (size >= screenExtent - minOffset) {
    return minOffset + (screenExtent - minOffset - size) / 2;
  }
  const half = size / 2;
  const clampedCenter = Math.min(
    Math.max(center, minOffset + half),
    screenExtent - half
  );
  return clampedCenter - half;
}

interface ScreenBoundedObject {
  x: number;
  y: number;
  getBounds(): { x: number; y: number; width: number; height: number };
  setPosition(x: number, y: number): unknown;
}

// Nudges an already-created, already-positioned display object back on screen if its
// rendered bounds (which reflect its real text/padding, not just the raw size setting)
// spill past an edge. A no-op for anything that already fits.
export function keepOnScreen(
  obj: ScreenBoundedObject,
  screenWidth: number,
  screenHeight: number
): void {
  const bounds = obj.getBounds();
  let dx = 0;
  let dy = 0;
  if (bounds.width <= screenWidth) {
    if (bounds.x < 0) dx = -bounds.x;
    else if (bounds.x + bounds.width > screenWidth) {
      dx = screenWidth - (bounds.x + bounds.width);
    }
  }
  if (bounds.height <= screenHeight) {
    if (bounds.y < 0) dy = -bounds.y;
    else if (bounds.y + bounds.height > screenHeight) {
      dy = screenHeight - (bounds.y + bounds.height);
    }
  }
  if (dx !== 0 || dy !== 0) obj.setPosition(obj.x + dx, obj.y + dy);
}
