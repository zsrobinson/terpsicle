# Terpsicle

UMD academic planning tools at terpsicle.com. Five products, in color order: **Schedule** (red, `/schedule`), **Reviews** (purple, `/reviews`), **Chat** (blue, `/chat`), **Plan** (green, `/plan`) and **Todo** (yellow, `/todo`). Words for these and everything in them: `CONTEXT.md`, the glossary. What's been decided, by whom, and when to revisit it: `docs/decisions.md`.

## Use the platform first

Before you write infrastructure (routing, URL or state sync, lazy loading, caching, retries, scheduling, forms), check what the framework or platform already does. Prefer it, even if that means reshaping the feature. If you still hand-roll it, say why in the PR body. How-tos: the `framework-first` skill.

- **TanStack Start and Router:** routes and nested routes, `validateSearch` with search params as state, loaders, automatic code splitting, `Link` preloading (`defaultPreload: "intent"`), `useNavigate` and history, and SSR where a route uses it.
- **Cloudflare:** Workers, D1, R2, Durable Objects, Cron Triggers, Workers AI and Email.
- **Libraries:** Radix (through shadcn/ui) for components, Tailwind, zod, Dexie, zustand for app state that isn't URL state, and PostHog.

**The scheduler's routes:** each rail tab and drill-in is a route under `/schedule` (`src/routes/schedule.*.tsx`) that the router splits and preloads; the sidebar keeps their components mounted, and `src/app/schedule-nav.ts` moves between them (`src/app/README.md`, "URL state").

## Docs
- `docs/SPEC.md` (what), `docs/DESIGN.md` (why, and the owner's taste), `docs/BUILD.md` (how), `docs/DATA.md` (R2 layout, schemas, local storage). `docs/V2.md` (accounts, sync, PWA, notifications, Reviews, Chat, moderation, admin) and `docs/V3.md` (Plan, Todo) win where they differ from the older docs.
- Per area: `docs/AUTH.md`, `docs/MODERATION.md`, `docs/ANALYTICS.md`, `docs/ACCESSIBILITY.md`, `docs/MOBILE-TESTING.md`, `docs/UX-PRINCIPLES.md`, `src/app/README.md` (the scheduler shell), `src/core/README.md` (core modules).
- Progress: `docs/STATUS.md`. Design reference: `reference/prototype/built/final.html`, screenshots in `reference/prototype/screenshots/`.
- Skills (`.claude/skills/`): `ship-a-pr`, `framework-first`, `record-a-decision`, `glossary`, `tdd`, and `grill-me` (typed by the owner). The `reviewer` agent (`.claude/agents/reviewer.md`) reviews a PR diff against all of this.

## Commands
- `pnpm i`; `pnpm dev:mock` (fixtures, no network); `pnpm dev` (live data).
- `pnpm check`: typecheck, lint (with import boundaries), every Vitest project. `pnpm test:e2e`: Playwright against the mock app.
- `pnpm tsx scripts/<name>.ts`: data pipeline scripts (ingest locally, build routes, record fixtures).

**Load rule for local runs:** machines are shared, so never run the full `pnpm check` or `pnpm test:e2e` locally. Run `tsc` once, biome on changed files, the relevant Vitest files with `--maxWorkers=1`, and at most the relevant e2e specs with `--workers=1`. Stop dev servers you started. CI is the verdict.

## Where things go
- Domain logic → `src/core`: small, pure, exported functions with tests next to them. No DOM, no fetch, no `Date.now()` (take time as an argument).
- Data sources → `src/ingest`: platform-agnostic, takes `fetch` and a `BlobStore`. Every parser has golden tests on saved real pages.
- Cron handlers → `src/jobs`. Server fns, D1, email and LLM → `src/server/<area>` (`auth`, `sync`, `push`, `notifications`, `reviews`, `chat`, `moderation`, `admin`, `security`, `todo`), with pure logic in the matching `src/core/<area>`.
- UI → routes in `src/routes`, features in `src/features/<feature>/`, the scheduler shell in `src/app/`. Components stay thin: read state, call core, render.
- Mock data → `src/fixtures` builders (`aCourse`, `aSection`, `aPlan`, …). Don't hand-roll fixtures in tests when a builder exists.
- `reference/` is read-only: never import from it; it's excluded from build, lint and tests.

## Conventions
- TypeScript strict, no `any`, no non-null `!` without a comment saying why it's safe.
- Named exports only (routes and `src/server.ts` excepted). `kebab-case` files, `PascalCase` components, `camelCase` functions.
- Validate every boundary (network, storage, URL, env) with zod schemas from `src/core/schema`.
- Comments explain why, not what. Match the surrounding style.
- UI copy follows `SPEC.md` §3.13: plain words, active voice, contractions, specific errors. Use the glossary's words. Say "Accessible routes", never "step-free". The sparkles icon is only for LLM output.
- Tailwind tokens only (`bg-panel`, `text-muted`, …); no raw colors in components. Both themes must work.
- Every interactive element gets a tooltip, and if it has a shortcut, the tooltip shows it.
- Don't yell at the user: no banners, no red outlines on choices still being weighed, no confirmation dialogs (use undo). See `DESIGN.md` §5.
- Never skip, disable or weaken a test to get green. Fix the cause.

## Accounts and privacy
- Schedule works fully signed out. Only the API route table's `auth` field and `src/server/auth` read the session cookie.
- Nothing a review reader, the admin or moderation sees may carry a review's author.
- Analytics stay anonymous: never `identify()`, and no names, emails, directory IDs or user-written text in events. No session recording, anywhere.
- User-written text (reviews, chat) renders as plain text, never as HTML.
- Earshot and Orgs are dropped: add none of their code, tables or routes.

## Git
- Trunk is `main`. Branch as `v2/<slug>`, `v3/<slug>`, `fix/<slug>`, `docs/<slug>` or `ci/<slug>`. One task per PR, squash-merged when "Check, build, e2e" is green. The PR body states any spec interpretation. Steps: the `ship-a-pr` skill.
- A decision that shapes future work goes in `docs/decisions.md` (`record-a-decision` skill). New names go in `CONTEXT.md` in the same PR (`glossary` skill).
