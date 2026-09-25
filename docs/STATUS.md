# Status

The orchestrator keeps this current on `main` (`BUILD.md` §7).

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0: Foundations | In review | `m0/scaffold`: package, lint and boundaries, Vitest projects, Playwright, CI and deploy, Worker entry, shell placeholder. terpsicle.com serves the shell. |
| M1: Core domain | Not started | Schema is in flight in parallel. |
| M2: Ingest and jobs | Not started | Recon in flight. Cron stubs and the `BlobStore` interface exist. |
| M3: Shell and calendar | Not started | Replaces the M0 placeholder in `src/app`. |
| M4: Sidebar features | Not started | |
| M5: Generate | Not started | |
| M6: Live data | Not started | `/data/*` serving (R2, Cache API, ETags) exists from M0. |
| M7: Backend features | Not started | |
| M8: Polish and launch | Not started | |

## In flight

- `m0/scaffold`: foundations (this document's first version).
- `src/core/schema`: the shared schema.
- Data-source recon and parser fixtures (`src/ingest/__fixtures__/`).

## Decisions

- **Seat-alert email uses Cloudflare Email Service** (the `send_email` binding `EMAIL`), not Resend. The owner granted it and terpsicle.com is onboarded for sending, so there's no API key or extra DNS work. Previews get no email binding.
- **PostHog analytics, anonymous, through a first-party `/ingest` proxy.** Only terpsicle.com with live data reports. Details: `docs/ANALYTICS.md`.
- **PR previews use `wrangler preview`** (Workers Previews), not `wrangler versions upload --preview-alias`: Cloudflare now recommends Previews for branches and PRs, since aliased version URLs share production bindings. Previews are on `pr-<n>-terpsicle.zsrobinson.workers.dev` and read production R2 but use their own D1 database (`terpsicle-preview`). Crons never run on previews.
- **Three TypeScript programs** (app, worker, node) under one `tsconfig.json`, because DOM and Workers globals conflict (`caches.default`, `fetch` types). Shared code (`core`, `ingest`, `fixtures`) is checked in each program that uses it.
- **Vitest 4.1**, not 5: `@cloudflare/vitest-plugin` (the renamed vitest-pool-workers) supports `^4.1` only. Bump when it does.
- **TypeScript 7** (the native compiler). `tsc -b` checks all three programs.
- **`cn` from shadcn** replaces `clsx` + `tailwind-merge`; current shadcn registry components import it directly, so `shadcn add` works as is.
- **Client env files live in `env/`**, not the root: wrangler and the Cloudflare Vite plugin would otherwise load a root `.env` into the Worker's env and types.
- **Import boundaries:** Biome checks package and `~/` alias imports per folder; `scripts/check-imports.ts` forces cross-folder imports through aliases and keeps `Date.now()` out of core. Interpretation of BUILD.md §3: the data layer (`src/state`, `src/worker`) may import `~/fixtures` for mock mode; components may not; tests anywhere may. UI may import typed server functions only from `~/server/fns/*`.
- **`/data/*` caching:** content-hashed names (`*.<hex8+>.json|bin`) are immutable; every other data file gets `max-age=60`, so an unhashed file can never go stale for longer than a seat poll. Responses carry `Access-Control-Allow-Origin: *` so `pnpm dev` can read production data from localhost.

## Known issues

- **D1 migrations for previews:** `deploy.yml` migrates production only. `terpsicle-preview` is on `0001_init`. When M7 adds migrations, also migrate it (e.g. a small wrangler config that names `terpsicle-preview`); `preview_database_id` is not an option, because the Vite plugin then binds production to the preview database.
- **Local Playwright browsers:** agent sandboxes ship an older Chromium under `PLAYWRIGHT_BROWSERS_PATH`; `playwright.config.ts` falls back to it when the expected build is missing. CI installs the matching browser.
- **Server functions and types:** a future `createServerFn` file under `src/server/fns/` is imported by the app program (DOM types) and uses `cloudflare:workers` (Worker types). M7 needs to settle how those files typecheck (likely: keep `cloudflare:workers` access behind a worker-only module).
