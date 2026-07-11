import { chromium } from "playwright";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/check-deployment.mjs <url>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
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
