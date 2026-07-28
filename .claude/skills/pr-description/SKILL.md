---
name: pr-description
description: Write or update the description of a pull request in this repo (rescue-service). Use whenever creating a PR, or whenever pushing new commits to a branch that already has an open PR. Fills in .github/PULL_REQUEST_TEMPLATE.md correctly and makes sure the "Preview deployment" link points at the Cloudflare Pages deployment for the current HEAD commit, which the "PR Template Check" CI workflow (.github/workflows/pr-template-check.yml) verifies.
---

This repo has a required PR template (`.github/PULL_REQUEST_TEMPLATE.md`) and a CI check
(`.github/workflows/pr-template-check.yml`) that fails the PR if the description doesn't
follow it, or if the preview deployment link is stale (doesn't match the current HEAD commit).

## Filling in the template

1. Read `.github/PULL_REQUEST_TEMPLATE.md` and use its exact section headers (`## Description`,
   `## Preview deployment`, plus any that get added later). Don't rename, drop, or reorder them.
2. Under `## Description`, replace the `<!-- ... -->` comment with real content — what changed
   and why. An unedited placeholder comment counts as empty and fails CI.
3. Under `## Preview deployment`, put a link to the Cloudflare Pages deployment for the commit
   you're actually pushing (see below). Don't leave the placeholder comment as the only content.

## Getting the correct preview deployment link

Every push to any branch triggers the "Cloudflare Pages Deployment Check" workflow
(`.github/workflows/cloudflare-pages-check.yml`), which deploys that commit and produces a
unique `*.pages.dev` URL. The CI template check looks up the GitHub Deployment created for the
PR's current HEAD sha and requires the description to contain that exact URL — so the link has
to be refreshed on every push, not just set once.

After pushing (and before opening or updating the PR description), get the right URL like this:

1. Note the HEAD commit sha you just pushed (`git rev-parse HEAD`).
2. Find the matching "Cloudflare Pages Deployment Check" run: use `mcp__github__actions_list`
   with `method: list_workflow_runs`, `resource_id: cloudflare-pages-check.yml`, filtered to
   your branch, and pick the run whose `head_sha` matches. If it isn't there yet or is still
   `in_progress`, wait for it — don't guess the URL or reuse an old one.
3. Once it's `completed` and successful, pull the deployment URL out of the run: use
   `mcp__github__get_job_logs` with `return_content: true` on that run's job and look for the
   Cloudflare Pages deploy step's printed URL (or the "Loaded <url> successfully..." line from
   the deployment check script) — both report the same unique per-deployment `*.pages.dev` URL.
4. Use that exact URL in the `## Preview deployment` section.

If you push additional commits after the PR is already open, repeat this and update the
description — a link to an old commit's deployment will fail the `PR Template Check` job.

## Local precheck before opening/updating the PR

Before calling `create_pull_request` or `update_pull_request`, write the drafted body to a file
(e.g. in your scratchpad) and validate it locally:

```
node scripts/check-pr-description.mjs <path-to-body-file>
```

or pipe it directly: `printf '%s' "$BODY" | node scripts/check-pr-description.mjs`.

This catches missing/empty sections and malformed preview links (e.g. a non-`.pages.dev` host,
or a missing URL) before you push through the GitHub API. It does **not** verify the link is
fresh for the current HEAD commit — that requires checking the actual deployment, which only the
"PR Template Check" CI job does — so still follow the "Getting the correct preview deployment
link" steps above; don't skip them just because the local check passed.

## Notes

- Don't skip the wait-for-deployment step by fabricating a URL from the branch name — the
  branch-alias-shaped URL is not what the CI check compares against; it compares against the
  actual GitHub Deployment `environment_url` for the HEAD sha.
- If `pr-template-check.yml` still fails after following these steps, read its failure message —
  it lists exactly which section is missing/empty or what the expected deployment URL is.
