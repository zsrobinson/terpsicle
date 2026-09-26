# Terpsicle

A fast, clear class scheduler for University of Maryland students. Live at [terpsicle.com](https://terpsicle.com).

> [!NOTE]
> This is a ground-up rewrite. The original Terpsicle was a Bitcamp hackathon project that grew into a CS degree-planning tool. It's archived at [zsrobinson/terpsicle-bitcamp](https://github.com/zsrobinson/terpsicle-bitcamp) and still runs at [bitcamp.terpsicle.com](https://bitcamp.terpsicle.com).

- What we're building: [`docs/SPEC.md`](docs/SPEC.md)
- How we're building it: [`docs/BUILD.md`](docs/BUILD.md), with progress in [`docs/STATUS.md`](docs/STATUS.md)
- Conventions for contributors and agents: [`CLAUDE.md`](CLAUDE.md)
- Analytics and privacy: [`docs/ANALYTICS.md`](docs/ANALYTICS.md)
- Research and history: [`docs/PLAN.md`](docs/PLAN.md). The UI prototypes behind the spec are in the Bitcamp repo on branch [`claude/loving-volta-dzve8b`](https://github.com/zsrobinson/terpsicle-bitcamp/tree/claude/loving-volta-dzve8b/prototypes/app-shell).

## Stack

One Cloudflare Worker serves the app (TanStack Start, React 19, Tailwind 4, shadcn/ui), the catalog data from R2, and runs the data pipeline on cron triggers. D1 holds seat-alert subscriptions only.

## Develop

Node 22 and pnpm 10.

| Command | What it does |
|---|---|
| `pnpm i` | Install |
| `pnpm dev:mock` | Run the app on fixtures, fully offline (http://localhost:3000/schedule; add `?demo=1` for the demo plans) |
| `pnpm dev` | Run the app on live data from terpsicle.com |
| `pnpm check` | Typecheck, lint (with import boundaries and the term-id check), all unit tests. Run before every commit. |
| `pnpm test` / `pnpm test:watch` | Unit tests; add `--project core` (or `ingest`, `ui`, `worker`, `scripts`) for one project |
| `pnpm test:e2e` | Playwright against `pnpm dev:mock` (see below) |
| `pnpm test:e2e:live` | Playwright on real data against a deployment: `LIVE_URL=<url> pnpm test:e2e:live` |
| `pnpm fix` | Format and apply safe lint fixes |
| `pnpm build` | Production build |
| `pnpm check:bundle` | After `pnpm build`: the eager JS and CSS for `/schedule` and for `/` against their budgets, and nothing that must stay lazy (MapLibre, the generator, fixtures; Dexie and the app on `/`) in them |
| `pnpm deploy` | Build, migrate D1 and deploy (CI does this on every push to `main`) |
| `pnpm cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |

### End-to-end tests

`pnpm test:e2e` starts `pnpm dev:mock`, which applies the local D1 migrations first, and runs Playwright against it. Several checkouts can run e2e on one machine at once:

- **Each checkout has its own pair of ports**, derived from its path (`scripts/e2e-checkout.ts`): an even port in 3100–3898 for the app, and the next one for the seat-alert harness (`e2e/alerts-harness`). Set `E2E_PORT` to choose the app's port; the harness takes the one after it.
- **A running server is reused only if it's this checkout's.** Playwright waits on `/__checkout/<id>`, which only this checkout's dev server and harness answer with 200. If another checkout's server holds a port, the run stops with "port in use" instead of silently testing that checkout's code.
- To keep a server warm between runs, start it on this checkout's port: `pnpm dev:mock --port $(pnpm -s e2e:port)`.
- CI never reuses a server. It runs e2e in four shards, each with its own server, and merges their reports (the "e2e report" job's `playwright-report` artifact).
- A `warm-up` project loads the scheduler and `/` once before any other test, so no test waits on a fresh server's first compile.

### Performance budgets

BUILD §5's budgets fail CI when they regress:

- search keystroke, generator and seats-job CPU: the `perf` Vitest project (in `pnpm check`), medians of several runs;
- the eager bundles for `/schedule` and `/`: `pnpm check:bundle`;
- the first visit's transfer on real data: `e2e/live/preview.spec.ts`, against each PR's preview.

## License

[MIT](LICENSE)
