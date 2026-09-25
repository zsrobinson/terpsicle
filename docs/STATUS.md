# Status

The orchestrator keeps this current on `main` (`BUILD.md` §7).

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0: Foundations | Done (#3) | Package, lint and boundaries, Vitest projects, Playwright, CI + PR previews, deploy, Worker entry. |
| M1: Core domain | Done (#1, #4, #7) | Schema + DATA.md, fixtures and mock catalog, all pure domain logic. Generator is part of M5. |
| M2: Ingest and jobs | Done (#2, #8) | Real data for every listed term in R2; crons refresh catalog (6 h), seats (5 min), PlanetTerp (daily), calendar + buildings (weekly); routes weekly via Actions. Matching improvements in flight. |
| M3: Shell and calendar | Done (#5, #9) | |
| M4: Sidebar features | In progress | Courses, Problems, Blocks, Export done (#10). Search + course details, Travel + route map in flight. |
| M5: Generate | In progress | Core generator, Web Worker, Generate tab. |
| M6: Live data | In review | `m6/live-data`: IndexedDB cache with manifest diffing, seat polling and freshness, offline and error states, data hooks, `catalog_loaded` analytics, `/data` Range and 304s, a Playwright check of each PR preview on real data. |
| M7: Backend features | Server done (#6) | Review summaries and seat alerts server side. UI in M4 search/details; seat alerts behind `SEAT_ALERTS_ENABLED` until e2e-tested. |
| M8: Polish and launch | Not started | |

## In flight

- `m4/search-details`: Search tab and course details (M4A).
- `m4/travel`: Travel tab, connection details, route map (M4C).
- `m5/generate`: generator, worker, Generate tab.
- `m6/live-data`: live data layer.
- `m2/instructor-matching`: better PlanetTerp name matching.

## Decisions

- **Server API is plain `POST /api/*` JSON routes** (not `createServerFn`), validated both ways with `~/core/schema`; the browser client is `~/server/fns/api.ts` (M7).
- **Review summaries:** Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, cached per instructor in R2, daily cap, reviews fenced as untrusted input.
- **Seat alerts** send only when a full section reopens, with cooldown and daily caps; subscribe answers identically for every address (no leak of who watches what).
- **Blocks are per term; course colors are global per course code; saved-for-later is per plan.**

- **Seat-alert email uses Cloudflare Email Service** (the `send_email` binding `EMAIL`), not Resend. The owner granted it and terpsicle.com is onboarded for sending, so there's no API key or extra DNS work. Previews get no email binding.
- **PostHog analytics, anonymous, through a first-party `/ingest` proxy.** Only terpsicle.com with live data reports. Details: `docs/ANALYTICS.md`.
- **PR previews use `wrangler preview`** (Workers Previews), not `wrangler versions upload --preview-alias`: Cloudflare now recommends Previews for branches and PRs, since aliased version URLs share production bindings. Previews are on `pr-<n>-terpsicle.zsrobinson.workers.dev` and read production R2 but use their own D1 database (`terpsicle-preview`). Crons never run on previews.
- **Three TypeScript programs** (app, worker, node) under one `tsconfig.json`, because DOM and Workers globals conflict (`caches.default`, `fetch` types). Shared code (`core`, `ingest`, `fixtures`) is checked in each program that uses it.
- **Vitest 4.1**, not 5: `@cloudflare/vitest-plugin` (the renamed vitest-pool-workers) supports `^4.1` only. Bump when it does.
- **TypeScript 7** (the native compiler). `tsc -b` checks all three programs.
- **`cn` from shadcn** replaces `clsx` + `tailwind-merge`; current shadcn registry components import it directly, so `shadcn add` works as is.
- **Client env files live in `env/`**, not the root: wrangler and the Cloudflare Vite plugin would otherwise load a root `.env` into the Worker's env and types.
- **Import boundaries:** Biome checks package and `~/` alias imports per folder; `scripts/check-imports.ts` forces cross-folder imports through aliases and keeps `Date.now()` out of core. Interpretation of BUILD.md §3: the data layer (`src/state`, `src/worker`) may import `~/fixtures` for mock mode; components may not; tests anywhere may. UI may import typed server functions only from `~/server/fns/*`.
- **`/data/*` caching** is `dataCachePolicy` in `~/core/schema`, the one source of truth for the Worker: content-hashed files are immutable for a year; `terms.json` and manifests are `no-cache` for browsers (they revalidate with `If-None-Match` and get a 304) and kept 60 s at the edge (catalog) or an hour (others); calendars an hour, route geometry a day, tiles a week; `_jobs/` and `summaries/` are 404. `Range` requests (MapLibre reading `geo/tiles.pmtiles`) get 206 or 416. Responses carry `Access-Control-Allow-Origin: *` so `pnpm dev` can read production data from localhost.
- **The client's data cache** (M6) sits above `DataSource`, in the catalog store, so mock and live mode run the same path; mock rows are prefixed `mock:` because both modes share localhost. A cached manifest is committed only once every file it lists is saved, so it never points at a missing file. A schema version bump in a new build clears that family's cached files (`versionedCache`); a newer version on the server marks the tab stale and it reloads on the next visibility change (DATA.md §2.3).

- **Routes are built by a script in GitHub Actions, not a Worker cron.** Evidence (2026-09-25): a Worker on Cloudflare's edge (`wrangler dev --remote`) got **HTTP 526** (invalid SSL certificate) from `https://maps.umd.edu/api/PortalToken/tokens.js`, while `gis.umd.edu`, Testudo, PlanetTerp and the provost site all answered 200. `maps.umd.edu` sends its leaf certificate twice and no intermediate, and a Worker can't add CAs. `scripts/build-routes.ts` adds the two intermediates (`scripts/certs/umd-intermediates.pem`) and runs weekly plus on demand (`.github/workflows/routes.yml`). The `41 * * * *` cron is gone.
- **Scripts write production R2 through R2's S3 API** (`aws4fetch`), with credentials derived from `CLOUDFLARE_API_TOKEN` (key id = the token's id, secret = SHA-256 of the token) unless `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` are set. Conditional writes use `If-Match`/`If-None-Match: *`, like the Worker's R2 binding.
- **Route geometry stays one file per ordered pair and mode** (DATA.md §4.3): maps fetch lazily per connection, so small files beat a per-mode bundle. About 9,000 files of 1–2 KB.
- **Routing matches UMD's own map app:** its one barrier polygon (`ColeConstPoly`, between Knight Hall and the Clarice Smith center) is sent with every solve, and card-only entrances are left out of standard routes.
- **Co-instructors are sorted by name:** Testudo returns them in a different order from one request to the next, which would otherwise show up as a section change every run.
- **Seats refresh:** a term is re-crawled when Testudo's "Open Seats as of" stamp moves, and at least hourly otherwise (terms outside registration show no stamp). A full refresh of all four listed terms took 7 s of CPU in Node; the cron limit is 30 s.

## Known issues

- **Local Playwright browsers:** agent sandboxes ship an older Chromium under `PLAYWRIGHT_BROWSERS_PATH`; `playwright.config.ts` falls back to it when the expected build is missing. CI installs the matching browser.
- **PlanetTerp name join:** 394 of the 3,904 Testudo instructor names in the active terms have no exact PlanetTerp match (mostly people PlanetTerp doesn't list yet). `_jobs/planetterp/unmatched.json` lists them after every run; a small alias map could recover a few.
- **PlanetTerp reviews stopped on 2026-05-01** and grades end at Spring 2025, so ratings and summaries won't move until PlanetTerp resumes.
- **Catalog schema bumps** republish on the next catalog run (up to 6 h); run `pnpm tsx scripts/ingest.ts catalog --target r2` after deploying one (DATA.md §2.3).
