# Terpsicle v2: build playbook

**How** we build what `SPEC.md` describes. It's written for the orchestrating agent and its subagents, and for any human who picks this up later.

---

## 1. Ground rules

- **`main` is trunk.** CI runs against it and it's what gets deployed. v1 lives in a separate archived repo, [`terpsicle-bitcamp`](https://github.com/zsrobinson/terpsicle-bitcamp).
- Work happens on short-lived branches named `<milestone>/<slug>` (e.g. `m1/fit`), each opened as a PR into `main`.
- **The orchestrator merges** a PR into `main` (squash) once CI is green and a review pass finds nothing blocking. No one else pushes to `main` directly, except the orchestrator for trivial doc fixes.
- **Pure logic lives in `packages/core`** and is exhaustively tested. UI components stay thin: they read state, call core functions, and render.
- **Mock data is first-class.** The app runs fully offline against `@terpsicle/fixtures` (`pnpm dev:mock`). Every UI feature is built and tested against fixtures before real data is wired in.
- **Only proven Cloudflare products:** Workers (with static assets and Cron Triggers), R2, and D1. No Queues, Workflows, Durable Objects, Vectorize or AI-product betas.
- **The spec is the tiebreaker.** If something in the spec is ambiguous, pick the option most consistent with its principles (§1), write the choice in the PR description, and move on. Don't stop to ask.

---

## 2. Architecture

```
GitHub Actions (cron)                      Cloudflare
┌───────────────────────────┐   wrangler   ┌───────────────────────────────────────────────┐
│ packages/ingest            │ ───────────► │ R2 bucket  terpsicle-data                      │
│  scrape SOC  (every 5 min) │   r2 put     │   catalog/<term>/manifest.json   (60s cache)   │
│  scrape catalog (6h)       │              │   catalog/<term>/<DEPT>.<hash>.json (immutable)│
│  PlanetTerp (daily)        │              │   catalog/<term>/seats.<hash>.json             │
│  routes + buildings (weekly│              │   catalog/<term>/changes.json  (seat diffs)    │
│   / manual)                │              │   geo/buildings.json, geo/routes.<hash>.bin    │
│  academic calendar (weekly)│              │   geo/tiles.pmtiles  · summaries/<slug>.json   │
└───────────────────────────┘              │                                               │
                                           │ Worker  terpsicle  (TanStack Start)            │
                                           │   static assets (the SPA)                      │
                                           │   /data/*  → R2, with Cache API + ETags        │
                                           │   server fns: reviewSummary, alerts subscribe/ │
                                           │               confirm/unsubscribe              │
                                           │   cron (5 min): changes.json → D1 → email      │
                                           │ D1  terpsicle  (seat alert subscriptions only) │
                                           └───────────────────────────────────────────────┘
Browser
  React app (TanStack Start/Router, shadcn) ─ Zustand stores ─ Dexie (IndexedDB: plans, settings, catalog cache)
  Web Worker (Comlink): catalog index, search, fit, generator
```

- **The catalog is static data.** The scraper publishes per-department files named by content hash, plus a small `manifest.json` that lists each department's current hash.
  - Clients diff the manifest against their IndexedDB cache and fetch only departments that changed.
  - `seats.<hash>.json` is separate and polled every 60 s while the tab is visible.
  - A `schemaVersion` bump in the manifest forces a full refetch.
- **Plans remember what they were built from.** Each saved plan stores a snapshot of its sections' meetings. When the catalog changes, core's `diffPlanAgainstCatalog` produces "moved / cancelled" problems.
- **Share links:** `/?plan=<base64url(deflate(json))>`, versioned, with the codec in core. No server involved.
- **Server functions** are TanStack Start `createServerFn`, validated with zod. There are few of them: this is a mostly static app.

---

## 3. Repository layout

```
.
├── CLAUDE.md                  conventions for agents (read first)
├── docs/                      SPEC.md, BUILD.md, PLAN.md (history)
├── apps/web/                  TanStack Start app, deployed as the Worker
│   ├── src/routes/            file routes (index, share)
│   ├── src/app/               shell: top bar, rail, sidebar, drawer, calendar
│   ├── src/features/<name>/   one folder per sidebar tab / feature (components + hooks)
│   ├── src/components/ui/     shadcn components (generated, lightly edited)
│   ├── src/state/             Zustand stores + Dexie persistence
│   ├── src/worker/            Comlink worker entry (catalog, search, generator)
│   ├── src/server/            server fns, cron handler, D1 access, email
│   ├── e2e/                   Playwright specs (run against fixtures)
│   └── wrangler.jsonc
├── packages/core/             pure TypeScript, no DOM, no I/O
│   └── src/  schema/ time/ travel/ fit/ problems/ plans/ generate/ search/ share/ ics/ catalog/
├── packages/ingest/           Node scripts: sources → normalized catalog → R2
│   └── src/  soc/ planetterp/ buildings/ routes/ calendar/ publish/   (+ __fixtures__/)
└── packages/fixtures/         deterministic mock catalog, plans, travel matrix, builders
```

---

## 4. Stack and conventions

| Area | Choice |
|---|---|
| Language | TypeScript `strict`, ESM everywhere, Node 22 |
| Package manager | pnpm workspaces |
| App | TanStack Start (React 19) with `@cloudflare/vite-plugin`, deployed as one Worker. The app route is client-rendered (`ssr: false`) to keep Worker CPU tiny. |
| UI | Tailwind 4, shadcn/ui (Radix), lucide icons, Geist + Geist Mono, `vaul` for the mobile drawer, `sonner` for toasts |
| State | Zustand (UI and app state), Dexie (persistence). Undo is a snapshot stack in the plans store. |
| Validation | zod 4, shared by ingest, core and server |
| Search | MiniSearch in the worker, with a custom scorer for course codes |
| Worker thread | Comlink |
| Map | MapLibre GL + Protomaps PMTiles (a College Park extract) served from R2; route lines from the precomputed geometry |
| Lint/format | Biome |
| Tests | Vitest (+ `@testing-library/react`, `happy-dom`), `fast-check` for property tests, Playwright (Chromium) for e2e |
| Deploy | `wrangler deploy` from GitHub Actions on push to `main`, to the custom domain `terpsicle.com` (and `www` redirecting to it) |

Code conventions are in `CLAUDE.md`. The short version: small pure functions in core, named exports, no default exports except routes, and no `any`. Comments explain *why*, never *what*. File names are `kebab-case`, components `PascalCase`.

---

## 5. Testing strategy

| Layer | What | Where / tool | Bar |
|---|---|---|---|
| Core logic | every function: fit, legs, problems, plan reducer and undo, generator, search scoring, share codec, ics, catalog diff | Vitest, `packages/core/**/*.test.ts` | ≥ 90% lines; each bug fix gets a regression test |
| Invariants | generator results never overlap and always respect must-haves; the share codec round-trips; undo(apply(x)) = x | fast-check | runs in CI |
| Parsers | SOC HTML → normalized JSON, PlanetTerp, provost calendar | Vitest golden tests on saved real pages in `__fixtures__/` | any parser change updates the goldens deliberately |
| Components | calendar layout, section rows, filters, drawer | Vitest + Testing Library against fixtures | critical states covered |
| Flows | first visit → search → add → switch section via ghost → problem fix → export codes; generate → save 2 plans; share link → save copy; drag a block; travel settings change pills; undo | Playwright against `pnpm dev:mock` | all green in CI |
| Server | server fns and cron with a local D1 and a mocked email sender | Vitest + `wrangler`'s local runtime (Miniflare) | seat alerts are e2e-tested before launch |
| Performance | generator (7 courses × 20 sections) < 200 ms; search keystroke < 16 ms; first load < 1.5 MB compressed | Vitest bench + a Playwright trace in CI | regressions fail CI |

`packages/fixtures` provides builders (`aCourse()`, `aSection()`, `aPlan()`) and a realistic mock term: 60+ courses including CMSC131-style many-section courses, async sections, Saturday meetings, full, low and restricted sections, and TBA instructors.

---

## 6. Milestones

Each milestone ends with everything green and deployed (once credentials exist). The acceptance criteria are what the orchestrator checks before calling a milestone done.

**M0: Foundations**
- For reference, in the [`terpsicle-bitcamp`](https://github.com/zsrobinson/terpsicle-bitcamp) repo: v1's Testudo selectors are on `main` (`lib/scrape-*.ts`), and the UMD GIS routing calls are on `dev` (`lib/gis.ts`). v1's brand icons are in `assets/brand/` here.
- Set up the pnpm monorepo, TypeScript, Biome, Vitest and Playwright.
- CI workflow (typecheck, lint, test, e2e, build).
- `packages/fixtures`.
- Scaffold TanStack Start on the Cloudflare vite plugin and deploy a hello-world to `terpsicle.com` as a Worker custom domain. Don't touch `bitcamp.terpsicle.com` or any other existing DNS record.
- Accepted when: `pnpm check` passes, CI is green on a PR into `main`, and https://terpsicle.com serves the shell.

**M1: Core domain** (pure; can start once the schema lands)
- Schema, time, travel legs, fit, problems.
- Plan reducer with undo.
- Share codec, ics, catalog diff, search scoring.
- Generator: bitmask conflicts, merging time-identical sections, fewest-options-first search, top-K, relaxation hints, near-misses.
- Accepted when the testing bar in §5 is met and the benchmarks pass.

**M2: Ingest**
- SOC adapter with golden tests, and delivery inference (in person, blended, online sync, online async).
- PlanetTerp: ratings, reviews and grades with +/−/W.
- Buildings join.
- Routes builder: distances and route geometries, standard and accessible, cached per pair.
- Academic calendar parser.
- Publisher: content-hashed chunks, manifest, seats, changes.
- GitHub Actions workflows.
- Accepted when a real Spring 2027 catalog is published to R2 and validates against the schema.

**M3: App shell and calendar** (against fixtures)
- Top bar with plans (tabs, menu, rename, `+` menu), labeled rail with collapse-on-reclick, sidebar drill-in with breadcrumb, mobile bottom drawer, theme.
- Tooltip layer with shortcuts.
- Calendar: layout, overlaps, tints, Saturday column, async strip, dashed section ghosts (grouped when time-identical, capped), hover and keyboard preview, travel pills, drag to create a block.
- Undo toast. Persistence and remembered state.

**M4: Sidebar features** (against fixtures)
- Courses: color picker, saved for later, first-visit guide.
- Search: filter chips and hover ghosts.
- Course details: instructor groups, fit words and count, seat meter, instructor cards, PlanetTerp-style grade bars.
- Problems.
- Travel: settings, "How?", connections, connection details with the route map.
- Blocks.
- Export: checklist, codes, share link, .ics.
- Shared-link view.

**M5: Generate**
- Generate tab and the `+` entry point.
- Required/optional/"pick N", must-haves, ranking and custom weights.
- Results with thumbnails and equivalent-merging; preview and drill-in; save one or many as plans.
- Relaxations and near-misses.

**M6: Live data**
- Worker `/data/*` from R2 with caching.
- Client manifest diffing, IndexedDB cache, seat polling and freshness label.
- Catalog-change problems.
- Term switcher.
- Accepted when switching from fixtures to live data is a config flag and the e2e tests pass against a recorded live snapshot.

**M7: Backend features**
- On-demand review summaries: a server fn that generates on the first request, stores in R2, coalesces concurrent requests and respects a spend cap; hidden when no key.
- Seat alerts: D1 schema, subscribe/confirm/unsubscribe (with confirmation), dedupe, a cron that diffs changes and emails. Behind a flag until e2e-tested.

**M8: Polish and launch**
- Accessibility pass (keyboard, focus, contrast, screen reader labels on the calendar).
- Empty, loading and error states everywhere.
- Performance budgets.
- Copy pass against the spec's microcopy rules.
- Final e2e run and a production deploy.

**Parallel streams after M0:** core (M1), ingest (M2) and the shell (M3) run at the same time, and meet at the schema in `packages/core/src/schema`. M4 splits into one subagent per tab. M5 depends on M1's generator. M6 and M7 need M2.

---

## 7. How the orchestrator runs

1. Keep `docs/STATUS.md` on `main`: milestone checklist, what's in flight, decisions made, known issues.
2. For each task, write a brief: goal, spec sections, files it owns, acceptance tests, and what not to touch. Spawn a subagent in an isolated worktree on a `<milestone>/…` branch.
3. When a subagent returns, run `pnpm check`, read the diff, and run a code-review pass. Fix or bounce back, open or update the PR into `main`, and merge when green.
4. Contract changes (schema, store shapes) are made by the orchestrator first, then fanned out.
5. After each merge to `main`, CI deploys. Smoke-check the deployed URL.
6. Never skip or disable a failing test to get to green.

---

## 8. Operational setup

| Name | Where | Used for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Claude Code environment variables **and** GitHub Actions secrets | wrangler deploy, R2 writes, D1 |
| `CLOUDFLARE_ACCOUNT_ID` | same two places | wrangler |
| `ANTHROPIC_API_KEY` | environment variable → set as a Worker secret by the orchestrator | review summaries (optional; the feature hides without it) |
| `RESEND_API_KEY` + a sending domain | environment variable → Worker secret | seat-alert emails (optional until M7) |

Cloudflare resources the orchestrator creates with wrangler: Worker `terpsicle` (custom domains `terpsicle.com`, `www.terpsicle.com`), R2 bucket `terpsicle-data`, D1 database `terpsicle`, one Cron Trigger.

GitHub: scheduled workflows only run on the default branch (`main`).

Domain: `terpsicle.com` is on Cloudflare. The Worker serves the apex and `www` (redirecting to the apex) as custom domains. `bitcamp.terpsicle.com` keeps serving v1 and must not be modified.
