# src/worker

Code that runs off the main thread. Today that is only the plan generator.

## Generator

- `generate.worker.ts` is the module worker. It exposes `generateWorkerApi` from `generate-job.ts` over Comlink.
- `generator.ts` is what the app calls: `defaultGenerator().run(request, input, onProgress)` returns `{ result, cancel }`.
- **Input.** The main thread sends the request's courses, seats, the campus map, and ratings and GPAs per section (`GenerateInput`). All of it is structured-cloneable. The worker builds its own small `CatalogIndex` from those courses. It never fetches, so it needs no copy of the data layer or IndexedDB.
- **Progress.** The generator reports progress every 16,384 search steps. `onProgress` crosses back through a Comlink `proxy`.
- **Cancel.** Stop (or a newer run) terminates the worker and rejects `result` with `GenerateCancelled`, and the next run spawns a fresh worker. Terminating works even mid-search, because the search never yields to read a cancel message. Starting a fresh worker costs one module load, which is fine for something done by hand.
- **Where there are no workers** (unit tests, very old browsers), `createInProcessGenerator()` runs the same call after a tick.
- **Tests.** `generator.test.ts` runs both paths. For the worker path it exposes the real API on a `MessageChannel`, which is what Comlink sees in a browser.
- **Bundling.** Vite bundles `new Worker(new URL("./generate.worker.ts", import.meta.url), { type: "module" })` in dev and in build. The built chunk lands in the client assets, which the Cloudflare deploy serves like any other static asset.

Measured on the perf project's 7-course × 20-section synthetic term (`src/core/generate/generate.perf.test.ts`):

| Case | Time |
| --- | --- |
| 7×20, 500,000-step budget, top 200 kept | about 110 ms |
| Nothing fits (relaxations and near-misses) | about 60 ms |

Those budgets would not freeze the page even on the main thread. The worker is for slower phones and larger requests: the budget scales with `limits.maxSteps`, and a person can keep scrolling the calendar while it runs.

## Search stays on the main thread

BUILD §2 allowed running search in the worker too. We don't, because the numbers don't call for it. On the 4,500-course synthetic catalog (`src/core/search/search.perf.test.ts`):

| Step | Time |
| --- | --- |
| Build the MiniSearch index, once per term | about 100 ms |
| Worst keystroke, filters included | about 3 ms (median 0.4 ms) |
| "Fits my plan" across the term after a plan change | about 4 ms |

A keystroke is well inside a 16 ms frame. Moving search to the worker would add a structured-clone round trip, which costs more than the query itself, and would split the catalog into two copies. The one-time index build is the only long task. It happens once when a term's catalog finishes loading, not while typing. If real catalogs push it past about 200 ms, move the build here first, before moving queries.
