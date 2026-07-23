# rescue-service

## PR descriptions

This repo requires PR descriptions to follow `.github/PULL_REQUEST_TEMPLATE.md`, enforced by
the "PR Template Check" CI workflow (`.github/workflows/pr-template-check.yml`). Whenever
creating a PR, or pushing new commits to a branch with an open PR, use the `pr-description`
skill to fill in the description correctly — it also handles fetching the current Cloudflare
Pages preview deployment link, which must be refreshed on every push.
