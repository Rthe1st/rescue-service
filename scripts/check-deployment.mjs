import { existsSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/check-deployment.mjs <url>");
  process.exit(1);
}

// Same fallback as playwright.config.ts: use the sandbox's pre-installed
// Chromium when it exists, otherwise Playwright's own downloaded browser.
const sandboxChromium = process.env["PLAYWRIGHT_BROWSERS_PATH"]
  ? `${process.env["PLAYWRIGHT_BROWSERS_PATH"]}/chromium`
  : undefined;
const executablePath =
  sandboxChromium && existsSync(sandboxChromium) ? sandboxChromium : undefined;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
    // The game ships no favicon. Cloudflare Pages answers /favicon.ico with
    // index.html, but a local `vite preview` returns 404 for it; that isn't
    // a problem with the build, so don't count it.
    if (new URL(msg.location().url || url, url).pathname === "/favicon.ico") {
      return;
    }
    errors.push(`console.error: ${msg.text()}`);
  }
});

page.on("pageerror", (err) => {
  errors.push(`uncaught exception: ${err.message}`);
});

let response;
try {
  response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
} catch (err) {
  console.error(`Failed to load ${url}: ${err.message}`);
  await browser.close();
  process.exit(1);
}

if (!response || !response.ok()) {
  errors.push(`page did not load successfully: HTTP ${response?.status()}`);
}

await browser.close();

if (errors.length > 0) {
  console.error(`Found ${errors.length} error(s) loading ${url}:`);
  for (const error of errors) {
    console.error(` - ${error}`);
  }
  process.exit(1);
}

console.log(`Loaded ${url} successfully with no console errors.`);
