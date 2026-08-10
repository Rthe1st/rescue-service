import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The Claude Code sandbox pre-installs a Chromium build under
// PLAYWRIGHT_BROWSERS_PATH, but its revision can lag behind whatever this
// project's pinned Playwright version expects, so Playwright's default
// (version-matched) executable lookup fails there. When that sandbox
// browser exists, launch it directly instead of the missing one; everywhere
// else (CI, other machines) this is a no-op and Playwright resolves its
// normal downloaded browser.
const sandboxChromium = process.env["PLAYWRIGHT_BROWSERS_PATH"]
  ? `${process.env["PLAYWRIGHT_BROWSERS_PATH"]}/chromium`
  : undefined;
const executablePath =
  sandboxChromium && existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
  },
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
});
