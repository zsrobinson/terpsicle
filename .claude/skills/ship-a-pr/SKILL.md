---
name: ship-a-pr
description: Branch, check, open and land a Terpsicle pull request. Use when starting work on a new branch, running checks before a push, writing a PR body, merging main into a branch, or watching CI.
---

# Ship a PR

## 1. Branch

Start from a fresh `origin/main`, in your own worktree. Name the branch for its kind of work:

| Prefix | For |
|---|---|
| `v2/<slug>`, `v3/<slug>` | Planned work, named as in `docs/V2.md` §15 and `docs/V3.md` §11 |
| `fix/<slug>` | A bug |
| `docs/<slug>` | Docs and agent setup only |
| `ci/<slug>` | Workflows and build scripts |

One task per branch.

## 2. Check locally, under the load rule

Machines are shared, and CI runs all correctness tests and the focused browser gate (docs/TESTING.md). Locally, run only:

- `pnpm exec tsc -b`, once;
- `pnpm exec biome check <changed files>`;
- the tests next to what you changed: `pnpm exec vitest run <files> --maxWorkers=1`;
- for UI changes, at most the relevant specs, `pnpm exec playwright test e2e/<spec>.spec.ts --workers=1`, then `pnpm build && pnpm check:bundle`.

Stop any dev server you started. Leave the full correctness checks to CI; dispatch Browser diagnostics for a broad regression run when warranted (docs/TESTING.md).

A red test means the code or the test has a real bug. Fix the cause; a test is never skipped, disabled, loosened or deleted to get green, and a budget is never raised to get a build green.

## 3. Open the PR

Push with `git push -u origin <branch>`. Commit trailers follow the session's own instructions.

Title it like recent history: `Area: what changed` ("Generate: wildcards (CMSC4XX, ARTTXXX, gen-eds) with a shared core matcher"). The body has three parts:

- **What:** the change, in a few lines.
- **Interpretations:** every reading of the spec you made, and any infrastructure you hand-rolled with why the platform didn't fit (the `framework-first` skill).
- **Checks:** what you ran locally, and what you left to CI.

New terms go in `CONTEXT.md` and decisions in `docs/decisions.md`, in the same PR.

Open it as a normal PR into `main`. Open a draft instead when the owner wants to try it first; it stays a draft until the owner says otherwise. Auto-merge is the orchestrator's call, never yours.

## 4. Keep up with main

Merge, don't rebase: `git fetch origin main && git merge origin/main`. Force-push only a branch that's yours alone, and never someone else's.

On a conflict (adapted from Matt Pocock's [resolving-merge-conflicts](https://github.com/mattpocock/skills/tree/main/skills/engineering/resolving-merge-conflicts)):

1. Read the commits and PRs behind each side until you know why each change was made.
2. Keep both intents where you can. Where they can't coexist, keep the one that matches main's newer decisions and say so in the PR body. Invent no new behaviour.
3. Rerun step 2's checks for the files involved, then commit the merge.

## 5. Watch CI

The required check is **"Check, build, e2e"**. A PR that only touches `docs/**` or root `*.md` skips code jobs and the preview. Browser diagnostics and the mobile lab are explicit investigations, not merge prerequisites (docs/TESTING.md).

Check the PR's check runs every few minutes. On red, read the failing job's log, fix the cause and push. PRs that run everything also get a preview at `pr-<n>-terpsicle.zsrobinson.workers.dev`.

You're done when "Check, build, e2e" is green and the PR body matches what the branch does.
