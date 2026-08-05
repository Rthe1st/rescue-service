import { test, expect, type Page, type Browser } from "@playwright/test";

interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SceneBounds {
  bounds: Record<string, ElementBounds>;
  width: number;
  height: number;
}

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const FIT_EPSILON = 1;

async function getSceneBounds(page: Page): Promise<SceneBounds> {
  return page.evaluate(() => {
    const game = (window as unknown as { __PHASER_GAME__: Phaser.Game })
      .__PHASER_GAME__;
    const scene = game.scene.getScenes(true)[0] as unknown as {
      getTestBounds: () => Record<string, ElementBounds>;
    };
    return {
      bounds: scene.getTestBounds(),
      width: game.scale.width,
      height: game.scale.height,
    };
  });
}

function assertFitsWithinScreen(
  bounds: Record<string, ElementBounds>,
  width: number,
  height: number
): void {
  expect(Object.keys(bounds).length).toBeGreaterThan(0);
  for (const [name, rect] of Object.entries(bounds)) {
    expect(rect.x, `${name} left edge off-screen`).toBeGreaterThanOrEqual(
      -FIT_EPSILON
    );
    expect(rect.y, `${name} top edge off-screen`).toBeGreaterThanOrEqual(
      -FIT_EPSILON
    );
    expect(
      rect.x + rect.width,
      `${name} right edge off-screen`
    ).toBeLessThanOrEqual(width + FIT_EPSILON);
    expect(
      rect.y + rect.height,
      `${name} bottom edge off-screen`
    ).toBeLessThanOrEqual(height + FIT_EPSILON);
  }
}

async function waitForScene(page: Page, key: string): Promise<void> {
  await page.waitForFunction(
    (sceneKey) =>
      Boolean(
        (
          window as unknown as { __PHASER_GAME__?: Phaser.Game }
        ).__PHASER_GAME__?.scene.isActive(sceneKey)
      ),
    key
  );
}

async function loadMainMenu(
  page: Page,
  viewport: { width: number; height: number }
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await waitForScene(page, "MainMenuScene");
}

async function startGame(page: Page): Promise<void> {
  const { bounds } = await getSceneBounds(page);
  const startButton = bounds["startButton"];
  if (!startButton) throw new Error("startButton bounds not found");

  const canvasBox = await page.locator("canvas").boundingBox();
  if (!canvasBox) throw new Error("canvas not found");

  await page.mouse.click(
    canvasBox.x + startButton.x + startButton.width / 2,
    canvasBox.y + startButton.y + startButton.height / 2
  );
  await waitForScene(page, "GameScene");
}

const orientations: [string, { width: number; height: number }][] = [
  ["portrait", PORTRAIT],
  ["landscape", LANDSCAPE],
];

for (const [orientationName, viewport] of orientations) {
  test(`home screen fits within the screen in ${orientationName}`, async ({
    page,
  }) => {
    await loadMainMenu(page, viewport);
    const { bounds, width, height } = await getSceneBounds(page);
    assertFitsWithinScreen(bounds, width, height);
  });

  test(`game screen fits within the screen in ${orientationName}`, async ({
    page,
  }) => {
    await loadMainMenu(page, viewport);
    await startGame(page);
    const { bounds, width, height } = await getSceneBounds(page);
    assertFitsWithinScreen(bounds, width, height);
  });
}

async function captureLayout(
  browser: Browser,
  initialViewport: { width: number; height: number },
  act: (page: Page) => Promise<void>
): Promise<SceneBounds> {
  const context = await browser.newContext({ viewport: initialViewport });
  const page = await context.newPage();
  await page.goto("/");
  await waitForScene(page, "MainMenuScene");
  await act(page);
  const result = await getSceneBounds(page);
  await context.close();
  return result;
}

test("home screen layout depends only on current orientation, not history", async ({
  browser,
}) => {
  const loadedDirectlyInLandscape = await captureLayout(
    browser,
    LANDSCAPE,
    async () => undefined
  );
  const switchedFromPortraitToLandscape = await captureLayout(
    browser,
    PORTRAIT,
    async (page) => {
      await page.setViewportSize(LANDSCAPE);
      await page.waitForTimeout(50);
    }
  );

  expect(switchedFromPortraitToLandscape.width).toBe(
    loadedDirectlyInLandscape.width
  );
  expect(switchedFromPortraitToLandscape.height).toBe(
    loadedDirectlyInLandscape.height
  );
  expect(switchedFromPortraitToLandscape.bounds).toEqual(
    loadedDirectlyInLandscape.bounds
  );
});

test("game screen layout depends only on current orientation, not history", async ({
  browser,
}) => {
  const loadedDirectlyInLandscape = await captureLayout(
    browser,
    LANDSCAPE,
    async (page) => {
      await startGame(page);
    }
  );
  const switchedFromPortraitToLandscape = await captureLayout(
    browser,
    PORTRAIT,
    async (page) => {
      await startGame(page);
      await page.setViewportSize(LANDSCAPE);
      await page.waitForTimeout(50);
    }
  );

  expect(switchedFromPortraitToLandscape.bounds).toEqual(
    loadedDirectlyInLandscape.bounds
  );
});
