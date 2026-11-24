import { test, expect, type Page } from "@playwright/test";

// Smoke test against the *production* build (`vite build` + `vite preview`),
// run by the "production" Playwright project. The layout tests only exercise
// the dev server, so without this a toolchain bump (Vite/Rolldown, TypeScript,
// Phaser, ...) that builds cleanly but breaks the bundled game at runtime
// would go unnoticed on Dependabot PRs, which can't run the Cloudflare
// deployment check.

interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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

test("production build boots and starts a game without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    // The game ships no favicon; the browser's automatic /favicon.ico
    // request 404s under `vite preview` and is irrelevant to the build.
    if (msg.location().url.endsWith("/favicon.ico")) return;
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()} (${msg.location().url})`);
  });
  page.on("requestfailed", (req) =>
    errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`)
  );
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await waitForScene(page, "MainMenuScene");

  // The served page must be the bundled build, not the dev server's
  // unbundled TypeScript entry point.
  const scriptSrcs = await page
    .locator("script[src]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("src") ?? ""));
  expect(scriptSrcs.some((src) => /\/assets\/.+\.js$/.test(src))).toBe(true);
  expect(scriptSrcs.some((src) => src.endsWith(".ts"))).toBe(false);

  const startButton = await page.evaluate(() => {
    const game = (window as unknown as { __PHASER_GAME__: Phaser.Game })
      .__PHASER_GAME__;
    const scene = game.scene.getScenes(true)[0] as unknown as {
      getTestBounds: () => Record<string, ElementBounds>;
    };
    return scene.getTestBounds()["startButton"];
  });
  if (!startButton) throw new Error("startButton bounds not found");
  const canvasBox = await page.locator("canvas").boundingBox();
  if (!canvasBox) throw new Error("canvas not found");
  await page.mouse.click(
    canvasBox.x + startButton.x + startButton.width / 2,
    canvasBox.y + startButton.y + startButton.height / 2
  );
  await waitForScene(page, "GameScene");

  // Let the game scene run a few frames so per-frame errors surface.
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
