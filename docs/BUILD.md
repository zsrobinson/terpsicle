# Terpsicle v2: build playbook

**How** we build what `SPEC.md` describes. It's written for the orchestrating agent and its subagents, and for any human who picks this up later.

## 0. Read first, in this order

1. `CLAUDE.md`: conventions.
2. `docs/SPEC.md`: what to build. It wins every disagreement.
3. `docs/DESIGN.md`: why, in the owner's words, and the taste rules to apply when the spec is silent.
4. `reference/prototype/`: the clickable reference. Open `built/final.html` and look at `screenshots/`, then read its `README.md` for the known gaps against the spec. Match its look, density, spacing and copy. **Don't copy its architecture:** it's prototype code.
5. `docs/RESEARCH.md`: data sources (endpoints, selectors, gotchas), generator techniques, platform limits.
6. `docs/review-answers.json`: the raw final-review answers, if a decision needs its original wording.
7. `docs/PLAN.md`: early planning history. Background only.

Every subagent brief links the sections of these documents that apply to its task.

---

## 1. Ground rules

- **`main` is trunk.** CI runs against it and every merge deploys it to terpsicle.com.
- Work happens on short-lived branches named `<milestone>/<slug>` (e.g. `m1/fit`), each opened as a PR into `main`. **The orchestrator squash-merges** once CI is green and a review pass finds nothing blocking.
- **Pure logic lives in `src/core`** and is exhaustively tested. UI stays thin: read state, call core, render.
- **Mock data is first-class.** The app runs fully offline against `src/fixtures` (`pnpm dev:mock`). Every UI feature is built and tested against fixtures before real data is wired in.
- **Cloudflare: proven products only.** Workers (static assets, Cron Triggers), R2, D1. No Queues, Workflows, Durable Objects, Vectorize, or beta products. We're on **Workers Paid**.
- **GitHub Actions only runs CI and deploys.** All data jobs are Worker cron triggers.
- **The spec is the tiebreaker.** If something is ambiguous, pick the option most consistent with `SPEC.md` §1 and `DESIGN.md` §5, write the choice in the PR, and keep going. Don't stop to ask the owner.

---

## 2. Architecture

```
Cloudflare Worker "terpsicle"  (one deployable: src/server.ts)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ fetch                                                                                │
│   static assets (the SPA, built by Vite)                                             │
│   /data/*         → R2 objects, Cache API + ETags (manifest 60s, hashed files immutable)│
│   server fns      reviewSummary · alerts.subscribe/confirm/unsubscribe  (createServerFn)│
│ scheduled (Cron Triggers)                                                             │
│   (every job reads terms.json and loops over active terms; nothing names a term)      │
│   */5 * * * *     seats: sections for every dept → seats.<hash>.json + changes.json   │
│                   → seat-alert emails (D1 lookup)                                     │
│   0 */6 * * *     catalog: SOC term list → terms.json; per term: depts + courses +     │
│                   sections → per-dept chunks + manifest; archive terms Testudo dropped │
│   17 5 * * *      PlanetTerp: ratings, reviews metadata, grades                        │
│   23 6 * * 1      academic calendar; buildings join                                   │
│   41 * * * *      routes: fill in missing building-pair routes, N pairs per run (resumable)│
│ bindings: R2 DATA (terpsicle-data) · D1 DB (terpsicle) · AI (Workers AI) · secrets     │
└─────────────────────────────────────────────────────────────────────────────────────┘
Browser
  React (TanStack Start/Router, shadcn) · Zustand stores · Dexie (plans, settings, catalog cache)
  Web Worker (Comlink): catalog index, search, fit, generator
```

- **Crons stay within their limits** (`RESEARCH.md` §3):
  - Jobs under an hour apart get 30 s CPU, hourly-or-slower get 15 min, and memory is 128 MB.
  - Crawls fetch at concurrency ≤ 4 and parse **per department with a streaming parser** (htmlparser2), writing as they go. They never hold a whole term in memory.
  - Waiting on network doesn't count as CPU time.
  - Long jobs (routes) are **resumable**: they keep progress in R2 and do a bounded chunk per run.
- **Ingest code is platform-agnostic.** It takes a `fetch` and a `BlobStore` interface, so the same code runs in the Worker (R2 binding), in Node scripts (local filesystem or R2), and in tests (in-memory).
- **Routes may need to run from a script.** If Workers can't reach `maps.umd.edu` (incomplete TLS chain, `RESEARCH.md` §1), run the routes job from `scripts/build-routes.ts` locally or in a manual GitHub workflow, and upload to R2. The data format doesn't change.
- **Terms are data, not config** (`SPEC.md` §3.0).
  - `catalog/terms.json` comes from Testudo's term dropdown on every catalog run.
  - Jobs iterate the active terms, and the client builds the term switcher and picks the default from it.
  - There must be no term ids anywhere in source outside fixtures and tests. A lint check (grep for `20[0-9]{2}0[158]|20[0-9]{2}12` in `src/` excluding `fixtures`/tests) enforces this.
  - A new term appearing, or an old one disappearing, needs no code change or deploy.
- **The catalog is static data.**
  - Content-hashed per-department files, plus a small `manifest.json` listing each department's hash.
  - Clients diff the manifest against IndexedDB and fetch only the departments that changed.
  - Seats are a separate file, polled every 60 s while the tab is visible.
  - A `schemaVersion` bump forces a full refetch.
- **Plans store a snapshot** of their sections' meetings. `core/catalog/diffPlanAgainstCatalog` turns catalog changes into "moved / cancelled" problems.
- **Share links:** `/?plan=<base64url(deflate(json))>`, versioned, with the codec in core.
- **Travel data:** `geo/routes.<hash>.bin` holds distances (feet) per building pair, standard and accessible. Geometries live in `geo/route/<from>-<to>-<mode>.json` and are fetched only when a connection's map is opened. Tiles are a College Park PMTiles extract, `geo/tiles.pmtiles`.

---

## 3. Repository layout

One package at the root: one `package.json`, one Biome config, one Vitest config with projects, and one TypeScript setup (`tsconfig.base.json` plus app, worker and node programs, because browser and Workers globals conflict; `pnpm typecheck` checks all three). There's no monorepo: nothing is published separately. Import boundaries are enforced by lint rules instead.

```
.
├── CLAUDE.md
├── docs/                       SPEC, DESIGN, BUILD, RESEARCH, STATUS, review-answers.json, PLAN (history)
├── reference/                  prototype + v1 snippets: read-only, excluded from build/lint/tests
├── src/
│   ├── server.ts               Worker entry: { fetch, scheduled }
│   ├── routes/                 TanStack file routes (index; share handled via search params)
│   ├── app/                    shell: top bar, rail, sidebar + drill-in, mobile drawer, calendar
│   ├── features/<name>/        courses, search, course-details, problems, travel, blocks, generate, export, share
│   ├── components/ui/          shadcn components
│   ├── state/                  Zustand stores, Dexie persistence, undo
│   ├── worker/                 Comlink web worker (catalog index, search, generator)
│   ├── core/                   PURE domain logic: schema, time, travel, fit, problems, plans, generate, search, share, ics, catalog
│   ├── ingest/                 sources → normalized catalog (soc, planetterp, buildings, routes, calendar, publish); platform-agnostic
│   ├── jobs/                   cron handlers wiring ingest to R2/D1 (Worker-only)
│   ├── server/                 server fns, D1 access, email, LLM summaries (Worker-only)
│   └── fixtures/               deterministic mock term + builders (aCourse, aSection, aPlan, …)
├── scripts/                    Node CLIs: run ingest locally, build routes, record parser fixtures, seed R2
├── e2e/                        Playwright specs (against dev:mock)
├── wrangler.jsonc
├── env/                        Vite client env files (.env, .env.mock, .env.development)
├── migrations/                 D1 migrations
├── vite.config.ts · vitest.config.ts · playwright.config.ts · biome.jsonc · tsconfig*.json
└── .github/workflows/          ci.yml (PRs), deploy.yml (push to main)
```

**Import boundaries** (Biome `noRestrictedImports` overrides per folder, checked in CI):

| Folder | May import | Must not import |
|---|---|---|
| `src/core` | zod, small pure libraries | react, DOM, `cloudflare:*`, fetch, or any other `src/*` folder |
| `src/ingest` | `core`, parsing libraries | react, `cloudflare:*`, `app`/`features`/`state` |
| `src/jobs`, `src/server` | `core`, `ingest`, `cloudflare:workers` | react, `app`/`features`/`state` |
| `src/app`, `src/features`, `src/state`, `src/worker` | `core`, `components/ui`, React stack | `ingest`, `jobs`, `server` (except typed server-fn imports), `cloudflare:*` |
| `src/fixtures` | `core` | everything else |

Path aliases: `~/core`, `~/ingest`, `~/app`, `~/features/*`, `~/state`, `~/fixtures`, `~/ui` (→ `components/ui`).

---

## 4. Stack

| Area | Choice |
|---|---|
| Language/runtime | TypeScript `strict` (plus `noUncheckedIndexedAccess`), ESM, Node 22 for scripts |
| Package manager | pnpm |
| App | TanStack Start (React 19) with `@cloudflare/vite-plugin`, custom server entry. The app route is client-rendered (`ssr: false`); the Worker mostly serves assets and data. |
| UI | Tailwind 4, shadcn/ui (Radix), lucide, Geist + Geist Mono, `vaul` (mobile drawer), `sonner` (toasts) |
| State | Zustand, Dexie; undo is a snapshot stack in the plans store (pure reducer in `core/plans`) |
| Validation | zod 4 at every boundary |
| Parsing | htmlparser2 (streaming, runs in Workers and Node) |
| Search | MiniSearch in the worker, with a custom scorer for course codes |
| Map | MapLibre GL + PMTiles; route lines from UMD GIS geometry |
| Email | Cloudflare Email Service through the Worker's `send_email` binding (`env.EMAIL.send(...)`); terpsicle.com is onboarded for sending, no API key. Previews have no email binding. |
| Analytics | PostHog (`posthog-js`), anonymous only, proxied through `/ingest/*` on our own domain; typed events in `src/app/analytics.ts`, server events in `src/server/analytics.ts`. See `docs/ANALYTICS.md`. |
| LLM | **Workers AI** through the `AI` binding (`env.AI.run(...)`); no external keys. Pick a current instruction-tuned text model from the Workers AI catalog, and cap daily generations in code. Tests mock the binding. |
| Lint/format | Biome |
| Tests | Vitest projects: `core` (node), `ingest` (node), `ui` (happy-dom + Testing Library), `worker` (`@cloudflare/vitest-plugin`, formerly vitest-pool-workers, with real R2/D1 bindings via Miniflare), plus `scripts` for the repo's lint scripts. `fast-check` for properties. Playwright for e2e. |
| CI/deploy | GitHub Actions: `ci.yml` on PRs (typecheck, lint, all Vitest projects, Playwright, build); `deploy.yml` on push to `main` (`wrangler deploy`) |

---

## 5. Testing

| Layer | What | Bar |
|---|---|---|
| Core | fit, legs, problems, plan reducer and undo, generator, search scoring, share codec, ics, catalog diff, time utils | ≥ 90% lines; each bug fix gets a regression test |
| Properties (fast-check) | generator results never overlap and always respect must-haves; the share codec round-trips; undo(apply(x)) = x; manifest diff is minimal | in CI |
| Parsers | SOC, PlanetTerp and provost calendar against **saved real pages** in `src/ingest/__fixtures__/` (`scripts/record-fixtures.ts` refreshes them) | goldens change only deliberately |
| Jobs and server (workers pool) | cron handlers against in-memory fetch mocks, writing to a local R2; seat-alert subscribe, dedupe, confirm, unsubscribe-with-confirmation, emails via a mock sender | seat alerts are e2e-tested before the feature flag turns on |
| Components | calendar layout (overlaps, ghost grouping and cap, Saturday column, async strip), section rows, filter chips, drawer | critical states covered |
| e2e (Playwright on `dev:mock`) | first visit → search → hover ghosts → open course → switch via ghost → fix a problem → export codes; generate → save 2 plans; share link → save a copy; drag a block; travel pace change updates pills; undo; mobile drawer at 390px | all green in CI |
| Performance | generator (7 courses × 20 sections) < 200 ms; search keystroke < 16 ms; first load < 1.5 MB compressed; each cron within its CPU limit on a recorded full term | regressions fail CI |

**Fixtures** (`src/fixtures`) cover a realistic mock term of 60+ courses. Take shapes from `reference/prototype/src/data.ts`, expanded to include:
- **two or more terms** (one active, one archived) so term switching and archiving are tested;
- a many-section course like CMSC131;
- a course with over 12 sections;
- async sections, Saturday meetings, full, low and restricted sections, and TBA instructors;
- time-identical sections;
- PlanetTerp-style grades with +/−/W.

Builders make one-off variants trivial.

---

## 6. Milestones

Each milestone ends green and deployed. The orchestrator checks the acceptance criteria before moving on.

**M0: Foundations**
- Root package: pnpm, TypeScript, Biome with boundary rules, Vitest projects, Playwright.
- CI and deploy workflows.
- `src/fixtures` skeleton.
- TanStack Start + `@cloudflare/vite-plugin` with the custom `src/server.ts`.
- `wrangler.jsonc` with the R2, D1 and cron bindings.
- Create the Cloudflare resources.
- Deploy to **terpsicle.com** (Worker custom domain, plus `www` → apex). Don't touch `bitcamp.terpsicle.com` or any other DNS record.
- Accepted when `pnpm check` passes, CI is green on a PR, and https://terpsicle.com serves the shell.

**M1: Core domain** (pure)
- Schema, time, travel legs, fit, problems.
- Plan reducer with undo.
- Share codec, ics, catalog diff, search scoring.
- Generator (the recipe in `RESEARCH.md` §2): relaxations, near-misses, "pick N of these", equivalents merged.

**M2: Ingest and jobs**
- SOC adapter with golden tests and delivery inference.
- PlanetTerp (+/−/W grades).
- Buildings join.
- Routes: distances plus geometries, standard and accessible, resumable.
- Academic calendar.
- Publisher: chunks, manifest, seats, changes.
- Cron handlers.
- Accepted when the real Spring 2027 catalog is in R2, validates, and refreshes on schedule.

**M3: Shell and calendar** (fixtures)
- Top bar with plans (tabs, menu, rename, `+` → Empty / Copy / Generate…).
- Labeled rail; clicking the active tab collapses the sidebar.
- Drill-in with breadcrumb; mobile bottom drawer; themes; tooltip layer with shortcuts; undo toast; persistence.
- Calendar:
  - fills the viewport height (hour height derived from the available space, with a readable minimum), with nothing below the grid;
  - layout and side-by-side overlaps (no red outline);
  - tints and the per-course color picker;
  - Saturday column and async strip;
  - dashed ghosts (merged when time-identical, capped at ~12);
  - hover and keyboard preview;
  - travel pills;
  - drag to add a block.

**M4: Sidebar features** (fixtures)
- Courses: first-visit screen with two equal paths (build it yourself / generate plans), saved for later.
- Search: one-line filter chips, hover ghosts.
- Course details: collapsible instructor groups in section order, "N fit", fit words, seat meter and freshness, instructor cards, PlanetTerp-style grade bars.
- Problems.
- Travel: settings, "How?", connections, connection details with the **real route map**.
- Blocks.
- Export: checklist with backups, codes, share link, .ics.
- Shared-link pill view.

**M5: Generate**
- Its own tab, plus the `+` and first-visit entry points.
- Required/optional/pick N, must-haves, ranking and custom weights.
- Results with thumbnails and merged equivalents; preview and drill-in; save one or many as plans.
- Relaxations and near-misses. No sparkles icon.

**M6: Live data**
- `/data/*` from R2 with caching.
- Manifest diffing and the IndexedDB cache.
- Seat polling and the freshness label.
- Catalog-change problems.
- Term switcher from `terms.json` (active and past terms, default = newest fall/spring), plans per term, archived terms read-only for seats.
- Live data vs. fixtures is one config flag.

**M7: Backend features**
- On-demand review summaries with Workers AI: generated on the first open, stored in R2, concurrent first requests coalesced, a daily generation cap, hidden on failure, the sparkles icon.
- Seat alerts: D1, subscribe/confirm/unsubscribe with confirmation, dedupe, cron emails. Flagged until tested end to end.

**M8: Polish and launch**
- Accessibility pass.
- Empty, loading and error states.
- Performance budgets.
- Copy pass against `SPEC.md` §3.13.
- A visual comparison against `reference/prototype/screenshots`.
- Final e2e and a production deploy.

**Parallelism after M0:** M1, M2 and M3 run concurrently and meet at `src/core/schema`. M4 splits into one subagent per feature. M5 needs M1. M6 and M7 need M2.

---

## 7. How the orchestrator runs

1. Keep `docs/STATUS.md` on `main` current: milestones, in flight, decisions made, known issues.
2. For each task, write a brief:
   - the goal;
   - links to the relevant SPEC, DESIGN and reference files and screenshots;
   - the files it owns;
   - its acceptance tests;
   - what not to touch.

   Then spawn a subagent in an isolated worktree on a `<milestone>/…` branch.
3. When a subagent returns, run `pnpm check` and e2e, read the diff, and do a code-review pass. For UI work, also take a Playwright screenshot and compare it with the reference. Fix or bounce back, open or update the PR, and squash-merge when green.
4. The orchestrator changes shared contracts (schema, store shapes, public core APIs) first, then fans the work out.
5. After each merge, CI deploys. Smoke-check terpsicle.com.
6. Never skip, disable or weaken a failing test to get to green.

---

## 8. Operational setup

| Name | Where | Used for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Claude Code environment variables **and** GitHub Actions secrets | wrangler: deploy, R2, D1, custom domain |
| `CLOUDFLARE_ACCOUNT_ID` | same two places | wrangler |

No other secrets: seat-alert email goes through Cloudflare Email Service (the `EMAIL` `send_email` binding; terpsicle.com is onboarded for sending), and the PostHog project token is public (`env/.env` for the client, `vars.POSTHOG_TOKEN` in `wrangler.jsonc` for the Worker).

Cloudflare resources (all in place since M0, declared in `wrangler.jsonc`):
- Worker `terpsicle`, with custom domains `terpsicle.com` and `www.terpsicle.com` (www 301s to the apex in `src/server.ts`), no production `workers.dev` route;
- PR previews (`wrangler preview --name pr-<n>`, from `ci.yml`) on `pr-<n>-terpsicle.zsrobinson.workers.dev`, deleted when the PR closes;
- R2 bucket `terpsicle-data` (production and previews);
- D1 database `terpsicle` (production) and `terpsicle-preview` (previews);
- the cron triggers in §2;
- the `AI` binding (Workers AI) for review summaries;
- the `EMAIL` binding (Cloudflare Email Service) for seat alerts.

`bitcamp.terpsicle.com` keeps serving v1 and must not be modified.
