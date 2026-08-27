import { describe, expect, it } from "vitest";
import {
  clampedTopLeft,
  computeUxElementPosition,
  keepOnScreen,
} from "./uxElementLayout";

describe("computeUxElementPosition", () => {
  it("places x/size as percentages of screen width", () => {
    const position = computeUxElementPosition(
      { sizePercent: 10, xPercent: 25, yPercent: 0 },
      800,
      600
    );
    expect(position.x).toBe(200);
    expect(position.size).toBe(80);
  });

  it("measures y as a percentage of screen height from the bottom edge", () => {
    const bottom = computeUxElementPosition(
      { sizePercent: 0, xPercent: 0, yPercent: 0 },
      800,
      600
    );
    expect(bottom.y).toBe(600);

    const top = computeUxElementPosition(
      { sizePercent: 0, xPercent: 0, yPercent: 100 },
      800,
      600
    );
    expect(top.y).toBe(0);

    const middle = computeUxElementPosition(
      { sizePercent: 0, xPercent: 0, yPercent: 50 },
      800,
      600
    );
    expect(middle.y).toBe(300);
  });
});

describe("clampedTopLeft", () => {
  it("returns the centered offset when it already fits", () => {
    expect(clampedTopLeft(100, 40, 800)).toBe(80);
  });

  it("clamps so the span never starts before 0", () => {
    expect(clampedTopLeft(-50, 40, 800)).toBe(0);
  });

  it("clamps so the span never ends past the screen extent", () => {
    expect(clampedTopLeft(790, 40, 800)).toBe(760);
  });

  it("centers an oversized span instead of clamping to a positive offset", () => {
    expect(clampedTopLeft(400, 1000, 800)).toBe(-100);
  });

  it("never starts above minOffset when there is room", () => {
    expect(clampedTopLeft(50, 40, 800, 100)).toBe(100);
  });

  it("still clamps against the far edge when minOffset is set", () => {
    expect(clampedTopLeft(790, 40, 800, 100)).toBe(760);
  });

  it("centers within the reserved sub-range when the span can't fit past minOffset", () => {
    expect(clampedTopLeft(500, 750, 800, 100)).toBe(75);
  });
});

interface FakeObject {
  x: number;
  y: number;
  width: number;
  height: number;
}

function fakeScreenBoundedObject(obj: FakeObject) {
  return {
    x: obj.x,
    y: obj.y,
    getBounds: () => ({
      x: obj.x - obj.width / 2,
      y: obj.y - obj.height / 2,
      width: obj.width,
      height: obj.height,
    }),
    setPosition(x: number, y: number) {
      obj.x = x;
      obj.y = y;
    },
  };
}

describe("keepOnScreen", () => {
  it("leaves an object that already fits untouched", () => {
    const obj = { x: 100, y: 100, width: 40, height: 20 };
    keepOnScreen(fakeScreenBoundedObject(obj), 800, 600);
    expect(obj).toEqual({ x: 100, y: 100, width: 40, height: 20 });
  });

  it("pushes an object right if it hangs off the left edge", () => {
    const obj = { x: 5, y: 100, width: 40, height: 20 };
    keepOnScreen(fakeScreenBoundedObject(obj), 800, 600);
    expect(obj.x).toBe(20);
  });

  it("pushes an object left if it hangs off the right edge", () => {
    const obj = { x: 795, y: 100, width: 40, height: 20 };
    keepOnScreen(fakeScreenBoundedObject(obj), 800, 600);
    expect(obj.x).toBe(780);
  });

  it("pushes an object down if it hangs off the top edge", () => {
    const obj = { x: 100, y: 5, width: 40, height: 20 };
    keepOnScreen(fakeScreenBoundedObject(obj), 800, 600);
    expect(obj.y).toBe(10);
  });

  it("pushes an object up if it hangs off the bottom edge", () => {
    const obj = { x: 100, y: 595, width: 40, height: 20 };
    keepOnScreen(fakeScreenBoundedObject(obj), 800, 600);
    expect(obj.y).toBe(590);
  });

  it("leaves an oversized object alone rather than fighting to fit it", () => {
    const obj = { x: 400, y: 100, width: 1000, height: 20 };
    keepOnScreen(fakeScreenBoundedObject(obj), 800, 600);
    expect(obj.x).toBe(400);
  });
});
