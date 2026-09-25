# Terpsicle v2

A UMD class scheduler. Read `docs/SPEC.md` (what) and `docs/BUILD.md` (how) before changing anything.

## Commands
- `pnpm i`: install
- `pnpm dev:mock`: run the app against fixtures (no network)
- `pnpm dev`: run against live data
- `pnpm check`: typecheck, lint, unit tests (run before every commit)
- `pnpm test:e2e`: Playwright against the mock app
- `pnpm --filter @terpsicle/ingest <script>`: data pipeline scripts

## Where things go
- Domain logic → `packages/core` as small, pure, exported functions with tests next to them. No DOM, no fetch, no Date.now() (take time as an argument).
- Parsing and data sources → `packages/ingest`. Every parser has golden tests on saved real pages.
- Mock data → `packages/fixtures` builders (`aCourse`, `aSection`, `aPlan`, …). Never hand-roll fixtures inside tests when a builder exists.
- UI → `apps/web/src/features/<feature>/`. Components stay thin: read state, call core, render.

## Conventions
- TypeScript strict, no `any`, no non-null `!` without a comment saying why it's safe.
- Named exports only (routes excepted). `kebab-case` files, `PascalCase` components, `camelCase` functions.
- Validate every boundary (network, storage, URL) with zod schemas from `packages/core/src/schema`.
- Comments explain why, not what. Match the surrounding style.
- UI copy follows `SPEC.md` §3.13: plain words, active voice, specific errors. "Accessible routes", never "step-free". Sparkles icon only on LLM output.
- Tailwind tokens only (`bg-panel`, `text-muted`, …), never raw hex in components. Both themes must work.
- Every interactive element gets a tooltip; if it has a shortcut, the tooltip shows it.
- Never skip, disable or weaken a test to get green. Fix the cause.

## Git
- Trunk is `main`. Branch as `<milestone>/<slug>` (e.g. `m1/fit`), open a PR into `main`, squash-merge when CI is green.
- Keep PRs focused on one task, with a description stating any spec interpretation you made.
