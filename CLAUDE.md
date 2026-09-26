# Terpsicle v2

UMD academic planning tools at terpsicle.com, in color order: the scheduler (`/schedule`, red), Terpsicle Reviews (`/reviews`, purple), Terpsicle Chat (`/chat`, blue), Terpsicle Plan (`/plan`, green) and Terpsicle Todo (`/todo`, yellow). Before changing anything, read in this order: `docs/SPEC.md` (what), `docs/DESIGN.md` (why, and the owner's taste), then `docs/BUILD.md` (how), and `docs/DATA.md` (the data contract: R2 layout, schemas, local storage). For v2 work (accounts, sync, PWA, notifications, reviews, chat, moderation, admin), `docs/V2.md` is the plan and wins over the older docs where they differ; for Plan and Todo, `docs/V3.md` is. Current progress and decisions live in `docs/STATUS.md`. The clickable design reference is `reference/prototype/built/final.html`, with screenshots in `reference/prototype/screenshots/`.

## Commands
- `pnpm i`: install
- `pnpm dev:mock`: run the app against fixtures (no network)
- `pnpm dev`: run against live data
- `pnpm check`: typecheck, lint (including import boundaries), all Vitest projects (run before every commit)
- `pnpm test:e2e`: Playwright against the mock app
- `pnpm tsx scripts/<name>.ts`: data pipeline scripts (ingest locally, build routes, record fixtures)

## Where things go
- Domain logic → `src/core`: small, pure, exported functions with tests next to them. No DOM, no fetch, no `Date.now()` (take time as an argument).
- Data sources → `src/ingest`: platform-agnostic, takes `fetch` and a `BlobStore`. Every parser has golden tests on saved real pages.
- Cron handlers → `src/jobs`; server fns, D1, email, LLM → `src/server`.
- v2 server areas: `src/server/auth` (Google sign-in, sessions, the admin check over `config/admins.txt`), `src/server/sync`, `src/server/push` (VAPID web push), `src/server/notifications`, `src/server/reviews`, `src/server/chat` (the `CourseChat` Durable Object and its socket route), `src/server/moderation`, `src/server/admin`, `src/server/security` (origin check, headers). Their pure logic goes in the matching `src/core/<area>` (`auth`, `sync`, `chat`, `moderation`, `reviews`, `notifications`).
- v2 UI areas: `src/features/auth`, `src/features/sync`, `src/features/pwa`, `src/features/notifications`, `src/features/reviews`, `src/features/chat`, `src/features/admin`, `src/features/marketing`.
- Mock data → `src/fixtures` builders (`aCourse`, `aSection`, `aPlan`, …). Don't hand-roll fixtures inside tests when a builder exists.
- UI → `src/features/<feature>/` and `src/app/`. Components stay thin: read state, call core, render.
- `reference/` is read-only: never import from it, and it's excluded from build, lint and tests.

## Conventions
- TypeScript strict, no `any`, no non-null `!` without a comment saying why it's safe.
- Named exports only (routes and `src/server.ts` excepted). `kebab-case` files, `PascalCase` components, `camelCase` functions.
- Validate every boundary (network, storage, URL, env) with zod schemas from `src/core/schema`.
- Comments explain why, not what. Match the surrounding style.
- UI copy follows `SPEC.md` §3.13: plain words, active voice, specific errors. Say "Accessible routes", never "step-free". The sparkles icon is only for LLM output.
- Tailwind tokens only (`bg-panel`, `text-muted`, …); no raw colors in components. Both themes must work.
- Every interactive element gets a tooltip, and if it has a shortcut, the tooltip shows it.
- Don't yell at the user: no banners, no red outlines on choices still being weighed, no confirmation dialogs (use undo). See `DESIGN.md` §5.
- Never skip, disable or weaken a test to get green. Fix the cause.
- Accounts (v2): the scheduler must work fully signed out. Only the API route table's `auth` field and `src/server/auth` read the session cookie. Nothing a review reader, the admin or moderation sees may carry a review's author. Analytics stay anonymous: never `identify()`, and no names, emails, directory IDs or user-written text in events.
- User-written text (reviews, chat) renders as plain text, never as HTML. Earshot and Orgs are shelved: add none of their code, tables or routes.

## Git
- Trunk is `main`. Branch as `<milestone>/<slug>` (e.g. `m1/fit`; v2 work uses `v2/<slug>`, per `docs/V2.md` §15), open a PR into `main`, and squash-merge when CI is green.
- Keep PRs focused on one task. The description states any spec interpretation you made.
