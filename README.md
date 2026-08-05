# Rescue Service
A single player web game thematically based around trying to put out fires and probably a comedy.

play it here: https://rescue-service.pages.dev

## Development

### Mobile-first dev cycle

Most work on this repo is driven from GitHub issues on mobile, rather than
by editing code directly:

1. **Make an issue** describing the change you want.
2. **Assign the issue** to yourself (or whoever's actioning it). Assigning is
   what triggers an automated routine that opens a pull request attempting
   to solve the issue. Leaving an issue unassigned is a way to keep drafting
   it without the routine picking it up early.
3. **Comment on the resulting PR** to ask for changes. The same routine
   watches for comments on PRs it opened and pushes follow-up commits in
   response.
4. **Merge the PR and close the issue** once it looks good.

Every PR must fill in `.github/PULL_REQUEST_TEMPLATE.md`, which is checked
by the "PR Template Check" CI workflow, and should link to the Cloudflare
Pages preview deployment for that branch. Testing a change is done by opening
that preview link rather than running the game locally — every push triggers
the "Cloudflare Pages Deployment Check" workflow, which builds and deploys the
branch and gives you a `*.pages.dev` URL to try it on.

PR branches must stay rebased onto the latest `main` — rebase, don't merge
`main` back into your branch. The "Require Rebase" CI workflow fails a PR if
its branch hasn't incorporated the current tip of `main`, or if it contains
any merge commits, so history stays linear.

Note: the routine currently reacts to any issue assignee. A planned
improvement is to use a dedicated bot account for it and only action issues
assigned to that account, rather than anyone.
