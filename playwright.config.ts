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
  webServer: [
    {
      command: "npm run dev -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env["CI"],
    },
    {
      // Production bundle, for tests/production-build.spec.ts.
      command: "npm run build && npx vite preview --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: !process.env["CI"],
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /production-build\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4173",
        launchOptions: { executablePath },
      },
    },
    {
      name: "production",
      testMatch: /production-build\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4174",
        launchOptions: { executablePath },
      },
    },
  ],
});
