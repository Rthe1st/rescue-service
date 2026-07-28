import { readFileSync } from "node:fs";

const TEMPLATE_PATH = ".github/PULL_REQUEST_TEMPLATE.md";

function readBody() {
  const arg = process.argv[2];
  if (arg && arg !== "-") {
    return readFileSync(arg, "utf8");
  }
  return readFileSync(0, "utf8");
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function parseSections(markdown) {
  const lines = markdown.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (/^#{1,6}\s+.+$/.test(line)) {
      current = { header: line.trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map((s) => ({ header: s.header, body: s.body.join("\n") }));
}

let body;
try {
  body = readBody();
} catch (err) {
  console.error(`Couldn't read PR description: ${err.message}`);
  console.error("Usage: node scripts/check-pr-description.mjs <body-file>   (or pipe the body on stdin)");
  process.exit(1);
}

const template = readFileSync(TEMPLATE_PATH, "utf8");
const templateSections = parseSections(template);
const bodySections = parseSections(body);

const problems = [];

for (const { header } of templateSections) {
  const match = bodySections.find((s) => s.header === header);
  if (!match) {
    problems.push(
      `Missing section "${header}" — the PR description must follow the template in ${TEMPLATE_PATH}.`
    );
    continue;
  }
  if (stripComments(match.body).length === 0) {
    problems.push(`Section "${header}" is still empty — please fill it in.`);
  }
}

const previewHeader = templateSections.find((s) => /preview deployment/i.test(s.header));
if (previewHeader) {
  const previewSection = bodySections.find((s) => s.header === previewHeader.header);
  if (previewSection) {
    const urlMatch = stripComments(previewSection.body).match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0].replace(/[.,)\]]+$/, "") : null;
    if (!url) {
      problems.push(
        `Section "${previewHeader.header}" must contain a link to the Cloudflare Pages deployment URL.`
      );
    } else {
      try {
        if (!new URL(url).hostname.endsWith(".pages.dev")) {
          problems.push(
            `The preview deployment link "${url}" doesn't look like a Cloudflare Pages URL (expected a *.pages.dev host).`
          );
        }
      } catch {
        problems.push(`The preview deployment link "${url}" is not a valid URL.`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error("PR description does not follow the required template:\n");
  for (const problem of problems) {
    console.error(` - ${problem}`);
  }
  console.error(
    "\nNote: this only checks structure (headers present, non-empty, preview link shaped like a " +
      "Cloudflare Pages URL). It can't confirm the preview link matches the actual deployment for " +
      "the current HEAD commit — that's verified by the \"PR Template Check\" CI job. See " +
      ".claude/skills/pr-description/SKILL.md for how to fetch the correct URL."
  );
  process.exit(1);
}

console.log(
  "PR description follows the template structure (headers present and non-empty, preview link " +
    "looks like a Cloudflare Pages URL)."
);
console.log("Note: whether the preview link is fresh for the current HEAD commit is only verified by CI.");
