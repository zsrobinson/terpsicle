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
| `pnpm dev:mock` | Run the app on fixtures, fully offline (http://localhost:3000) |
| `pnpm dev` | Run the app on live data from terpsicle.com |
| `pnpm check` | Typecheck, lint (with import boundaries and the term-id check), all unit tests. Run before every commit. |
| `pnpm test` / `pnpm test:watch` | Unit tests; add `--project core` (or `ingest`, `ui`, `worker`, `scripts`) for one project |
| `pnpm test:e2e` | Playwright against `pnpm dev:mock` |
| `pnpm fix` | Format and apply safe lint fixes |
| `pnpm build` | Production build |
| `pnpm deploy` | Build, migrate D1 and deploy (CI does this on every push to `main`) |
| `pnpm cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |

## License

[MIT](LICENSE)
