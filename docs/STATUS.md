# Status

The orchestrator keeps this current on `main` (`BUILD.md` §7).

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0: Foundations | Done (#3, #21, #26) | Package, lint and boundaries, Vitest projects, Playwright, CI (one run per PR) + PR previews, deploy, Worker entry, bundle and data budgets in CI, per-checkout e2e ports. |
| M1: Core domain | Done (#1, #4, #7) | Schema + DATA.md, fixtures and mock catalog, all pure domain logic. |
| M2: Ingest and jobs | Done (#2, #8, #13) | Real data for every listed term in R2; crons refresh catalog (6 h), seats (5 min), PlanetTerp (daily), calendar + buildings (weekly); routes weekly via Actions. PlanetTerp name matching at 91%. |
| M3: Shell and calendar | Done (#5, #9) | |
| M4: Sidebar features | Done (#10, #15, #17) | Courses, Problems, Blocks, Export, Search, course details, Travel with the real route map. |
| M5: Generate | Done (#14, #18) | |
| M6: Live data | Done (#12) | IndexedDB cache, manifest diffing, seat polling, offline, `/data` Range. |
| M7: Backend features | Done (#6, #20) | Review summaries (Workers AI) and seat alerts, on in production. |
| M8: Polish and launch | Done, final QA in flight | Polish (#16), QA rounds 1–2 (#19, #22), accessibility and mobile (#25, axe in e2e), UX redesign WP0–WP7 (#23, #24, #27–#33). QA round 3 (post-redesign regression) in flight. |

## v2 (owner decisions, 2026-09-26)

Three products on one origin: Terpsicle at `/schedule`, Terpsicle Reviews at `/reviews`, Terpsicle Chat at `/chat`, with Google sign-in (UMD accounts only), plan sync, one PWA and a light `/admin`. Earshot and Orgs are shelved. The plan, with every table, route, binding and the PR order, is `docs/V2.md`; its §15 lists the PRs by wave.

| Milestone | PRs (`docs/V2.md` §15) | State |
|---|---|---|
| V0: Plan | `v2/plan` | In review |
| V1: Foundations | `v2/routes`, `v2/identity`, `v2/pwa`, `v2/chat-rooms`, `v2/moderation` | In flight |
| V2: Accounts and sync | `v2/sync-merge`, `v2/sync-api`, `v2/sync-engine`, `v2/avatars`, `v2/security-headers`, `v2/privacy` | `v2/sync-merge` (#57) and `v2/sync-api` (#58) merged; `v2/sync-engine` in review |
| V3: Notifications and seat alerts | `v2/push`, `v2/seat-watches` | Not started |
| V4: Reviews | `v2/reviews-api`, `v2/reviews-ui`, `v2/reviews-publish` | Not started |
| V5: Chat | `v2/chat-do`, `v2/chat-ui`, `v2/chat-notify` | `v2/chat-do` merged (#70) |
| V6: Admin and launch hardening | `v2/admin-shell`, `v2/install-triggers`, `v2/account-delete`, `v2/csp-enforce`, `v2/e2e` | `v2/admin-shell` in review |

**v2 decisions** (details in `docs/V2.md`):
- **Plan sync is plain server-side storage**, encrypted at rest by Cloudflare, not end-to-end encrypted. The orchestrator's call, flagged for the owner: it lets Chat derive rooms from plans and keeps recovery simple.
- **Plan sync is not a sync engine:** one doc per plan plus one settings doc, saved whole with per-doc rev compare-and-swap. A conflicting plan is never merged; the person gets both, the local one as "<name> (copy)". The core (`src/core/sync`) is in `v2/sync-merge`; the D1 tables and `sync/push`, `sync/pull` in `v2/sync-api` (`DATA.md` §7.7); the device side (Dexie v2, the engine, the status, both sign-outs) in `v2/sync-engine` (`V2.md` §5.3), loaded only once someone is signed in.
- **PR previews sign in with a fixed test mode** (`AUTH_TEST_MODE`, fixture identities), not a production broker: previews run unreviewed code and have their own D1, and CI needs a deterministic sign-in anyway. Cloudflare's version preview URLs, which share the Worker's secrets, were ruled out too: they also share its bindings, so a preview would use production D1 (`docs/AUTH.md`).
- **Identity** (`v2/identity`, `docs/AUTH.md`): Google sign-in with `hd=*`, `prompt=select_account` and a `login_hint` from a `__Host-hint` cookie; users keyed on the directory ID with both addresses in `user_identities`; name and picture refreshed from Google at every sign-in, pictures cached in R2 `USER_CONTENT` (so `v2/avatars` folded in); sessions refresh daily with a new token; account deletion with a week's grace and the daily purge; admins from `config/admins.txt`. The route table's `auth` field (with the origin check) landed here too, since every later route builds on it.
- **Security headers** (`v2/security-headers`, V2.md §12): the CSP is report-only for now; our inline head scripts are allowed by hashes built from their source at build time (`src/app/inline-scripts.ts`), TanStack's per-request scripts by a per-response nonce; Zod runs jitless so it never needs eval; reports are sampled into the logs with no PII. The Worker sends HSTS (Cloudflare wasn't). `account/delete` gets its per-user limit, and `route()` refuses a route with no limit.
- **Seat alerts retire the email-token flow** rather than migrate it; nothing is public, and the only real subscriptions were the owner's deleted test rows.
- **One Worker** (`terpsicle`) with one Durable Object class (`CourseChat`, one object per course per term), the one exception to BUILD.md §1's no-Durable-Objects rule.
- **Migrations are pre-numbered** `0003`–`0009` so parallel PRs don't collide.
- **Chat's server** (`v2/chat-do`, DATA.md §7.9): `0009_chat`, the `CourseChat` object (core's protocol over hibernatable sockets, the moderation pipeline, edits, deletes, reactions, one-level threads, typing, read markers, retention alarms), `/api/chat/socket`, `chat/unread|follow|unfollow|mute|members`, and `chat_members` rewritten after each `sync/push`. `CHAT_ENABLED` is `"off"` in production and `"on"` in previews, where each preview's `COURSE_CHAT` is its own namespace. Moderation handlers are now `moderationHandlers(env)`, since Chat's reaches its object through a binding.
- **Brand: Ink** (owner-locked 2026-09-26; `v2/brand`, docs/DESIGN.md §7): Flexoki paper and ink, Bricolage Grotesque with Geist Mono for codes, square corners, hard offsets on buttons and floating layers, a subtle paper grain, and the Pixel star marks. The marks are data in `src/app/brand/marks.ts`, and `scripts/build-icons.ts` redraws every icon file from them. The product menu is the brand's app switcher.
- **Wildcards in Generate** (`v2/wildcards`, owner request): `CMSC4XX`, `ARTTXXX` and gen-ed codes (`DSHS`) as "pick one course from this set", with the matcher in `src/core/catalog/wildcard.ts` for the four-year planner to reuse. Interpretations, flagged for the owner:
  - suffix letters match (`CMSC4XX` includes CMSC498A and honors "H" courses);
  - a conditional gen-ed ("DSNL if taken with GEOL110") doesn't count; a choice ("DSHS or DSHU") counts for each code;
  - X only fills the end of the number (`CMSC4X1` isn't a pattern) and needs all three places (`CMSC4X` isn't one);
  - a wildcard never picks a course listed on its own; adding one again asks for one more course from it (up to 6);
  - each wildcard offers the search at most 40 section groups (pruned, then best first a course at a time), and the results say when that left courses out;
  - a gen-ed wildcard loads the whole term; PlanetTerp files for its departments are fetched only when ranking by ratings or GPA.

**Owner actions** (`docs/V2.md` §14): the Google OAuth client is done (External, published, scopes `openid email profile`, redirect `https://terpsicle.com/api/auth/google/callback` plus localhost; `GOOGLE_CLIENT_ID` in vars, `GOOGLE_CLIENT_SECRET` set on the Worker). `AUTH_SECRET` and `VAPID_*` are set and the `terpsicle-user-content` buckets exist. Admins are the git-tracked `config/admins.txt` (first entry `robinson`, the owner), bundled at build time, so they need no owner action. Later: brand verification once `/privacy` is live, a sign-in trial with a TERPmail and a UMD Gmail account, confirming the sync decision, and emailing PlanetTerp about review text.

## v3: Terpsicle Plan and Terpsicle Todo (owner decisions, 2026-09-26, evening)

Two more products, built after v2's core lands: **Terpsicle Plan** (`/plan`, green), a four-year planner, and **Terpsicle Todo** (`/todo`, yellow), deadlines from ELMS. The five products are ordered by color everywhere: Schedule, Reviews, Chat, Plan, Todo. The plan, with its tables, routes, cron and PR order, is `docs/V3.md`; its §11 lists the PRs by wave.

| Milestone | PRs (`docs/V3.md` §11) | State |
|---|---|---|
| W0: Plan | `v3/plan` | In review |
| W1: Parsers, index, brand | `v3/course-index`, `v3/transcript-parser`, `v3/ics-parser`, `v3/brand` | Not started (the parsers wait on owner fixtures) |
| W2: Core and APIs | `v3/four-year-core`, `v3/four-year-sync-api`, `v3/todo-api` | Not started |
| W3: UIs | `v3/plan-ui`, `v3/todo-ui` | Not started |
| W4: Sync, import, templates, handoff, reminder | `v3/four-year-sync`, `v3/transcript-import`, `v3/templates`, `v3/schedule-handoff`, `v3/todo-notify` | Not started |
| W5: Links and e2e | `v3/cross-links`, `v3/e2e` | Not started |

**v3 decisions** (details in `docs/V3.md`):
- **Plan's first release has no degree requirements:** credits, GenEd progress from Testudo's codes, prerequisite problems as information, transcript paste import, sample templates (Computer Science first) and "View schedule". Reading requirements from the catalog with a model is a later phase (§9.1).
- **A four-year plan is a third sync doc kind** (`four-year`), local-first and signed-out like the scheduler; `0010_four_year_sync` rebuilds `sync_docs` for the new `kind`. Clients skip doc kinds they don't know, and the upgrade resets the sync cursor once.
- **Grades stay private:** only in the four-year doc's `grades` map (browser, and our server when signed in), never in events, logs, links, pushes or anything another person sees.
- **Transcript import is a pure core parser** with golden tests on redacted real pastes; the paste never leaves the browser.
- **Wildcards** (`CMSC4XX`, `ARTTXXX`, "any DSHS") are placeholder blocks, using the shared matcher from `v2/wildcards`.
- **Todo uses the ELMS calendar feed**, stored on the server encrypted (AES-GCM, key `TODO_FEED_KEY` in Worker secrets) so reminders work with the app closed; fetched every 20 minutes (6 h for idle feeds, paused after 120 days), with exponential backoff and a `broken` state for revoked links. The link is never logged.
- **Gradescope:** no student API, and scraping is forbidden, so never a password or a gradescope.com fetch. Gradescope work linked in ELMS comes through the feed (tagged); a student-exported `.ics` can be dropped in as a fallback.
- **One new notification type, `todo-due`**, the owner's approved exception to "no more types": push only, 6pm New York the day before, at most one a day, off until ELMS is connected.
- **Copy uses contractions** everywhere (SPEC §3.13).

**v3 owner actions** (`docs/V3.md` §10): a fresh, privately shared unofficial-transcript paste; a real ELMS feed recorded with `scripts/record-ics-fixture.ts` (and confirming the Calendar Feed link and its host at UMD); confirming that grades sync with the four-year plan. The orchestrator sets `TODO_FEED_KEY`.

## UX redesign (owner request, 2026-09-25)

`docs/UX-PRINCIPLES.md` (research) and `docs/UX-REVIEW.md` (audit, plan, before/after). Owner decisions: course details is one page with no tabs (1A); many-section courses group by meeting time (2A, superseded 2026-09-26: one level of grouping, by professor, every row with all its meetings, and Bookmark for the course-level save; SPEC §3.4); the sidebar is draggable, 320–480px. The design system is enforced by `src/app/design-tokens.test.ts` (type scale, 4px spacing, no raw colors). Rule added to DESIGN.md §5: design for 1, a few and many sections.

## In flight

- `m8/qa-3`: post-redesign regression on production.
- v2 wave 1: `v2/plan`, `v2/routes`, `v2/identity`, `v2/pwa`, `v2/chat-rooms`, `v2/moderation`.
- `v2/brand`: the Ink brand in the app (tokens, type, buttons, grain, marks, icons, product menu).
- `v3/plan`: the plan for Terpsicle Plan and Terpsicle Todo (`docs/V3.md`).

## Decisions

- **Server API is plain `POST /api/*` JSON routes** (not `createServerFn`), validated both ways with `~/core/schema`; the browser client is `~/server/fns/api.ts` (M7).
- **Review summaries:** Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, cached per instructor in R2, daily cap, reviews fenced as untrusted input.
- **Seat alerts** send only when a full section reopens, with cooldown and daily caps; subscribe answers identically for every address (no leak of who watches what).
- **Blocks are per term; course colors are global per course code; saved-for-later is per plan.**

- **Seat alerts are on** (`SEAT_ALERTS_ENABLED: "true"`, 2026-09-25) after two checks passed:
  - an automated end-to-end test, `e2e/seat-alerts.spec.ts`: the real router and alert code in a local harness Worker (`e2e/alerts-harness`, real migrations, a capturing `EMAIL`) behind the mock app. It covers bell → email → confirm page → Watching in the app and Export → reopen → alert email → stop page → Export updates;
  - a real run through Email Service on real Fall 2026 data (CMSC216 0101, full), to the owner only, subjects prefixed `[Test]`: the confirmation (`<EZWAtMkzK06BaupbdFttCeNuYFVMK0yDsOhv@terpsicle.com>`) and the alert (`<ivfH6Anc0UVjvmuIErXWh9KkVRwjbgtomPXy@terpsicle.com>`) were both accepted. It ran the real code locally over a local D1 (confirmed with a known token written by `wrangler d1 execute`), so nothing was deployed and no production rows were written. The test rows were deleted.

  "false" turns them off again without losing subscriptions. An alert fires only when a full section reopens, so on a section with a few seats left the bell says "Get an email if it fills and a seat opens again".
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
- **First load on real data** (M6, measured on #12's preview with Spring 2027's 199 departments, Chrome on a CI runner, compressed): a first visit transfers 366 KB of app and 1,057 KB of data (1.4 MB, under BUILD §5's 1.5 MB), shows a section on the calendar in 1.8 s and has the whole catalog in 6.7 s; a repeat visit transfers 1 KB of data (no department files) and shows the section in 0.38 s. `pnpm test:e2e:live` logs these for every PR preview.
- **Problems appear once the plan's own departments load**, not the whole term (~7 s on a first visit); until then the top bar shows a neutral placeholder. A section in a department that hasn't loaded, or failed to, is never called cancelled (`pendingDepts` in core).

- **Routes are built by a script in GitHub Actions, not a Worker cron.** Evidence (2026-09-25): a Worker on Cloudflare's edge (`wrangler dev --remote`) got **HTTP 526** (invalid SSL certificate) from `https://maps.umd.edu/api/PortalToken/tokens.js`, while `gis.umd.edu`, Testudo, PlanetTerp and the provost site all answered 200. `maps.umd.edu` sends its leaf certificate twice and no intermediate, and a Worker can't add CAs. `scripts/build-routes.ts` adds the two intermediates (`scripts/certs/umd-intermediates.pem`) and runs weekly plus on demand (`.github/workflows/routes.yml`). The `41 * * * *` cron is gone.
- **Scripts write production R2 through R2's S3 API** (`aws4fetch`), with credentials derived from `CLOUDFLARE_API_TOKEN` (key id = the token's id, secret = SHA-256 of the token) unless `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` are set. Conditional writes use `If-Match`/`If-None-Match: *`, like the Worker's R2 binding.
- **Route geometry stays one file per ordered pair and mode** (DATA.md §4.3): maps fetch lazily per connection, so small files beat a per-mode bundle. About 9,000 files of 1–2 KB.
- **Routing matches UMD's own map app:** its one barrier polygon (`ColeConstPoly`, between Knight Hall and the Clarice Smith center) is sent with every solve, and card-only entrances are left out of standard routes.
- **Co-instructors are sorted by name:** Testudo returns them in a different order from one request to the next, which would otherwise show up as a section change every run.
- **Seats refresh:** a term is re-crawled when Testudo's "Open Seats as of" stamp moves, and at least hourly otherwise (terms outside registration show no stamp). A full refresh of all four listed terms took 7 s of CPU in Node; the cron limit is 30 s.
- **Deploys and old build files** (QA round 2). Workers static assets are uploaded per Worker version, and a deploy swaps the whole set at once. The previous version's hashed `/assets/*` files stop being served right away, and Cloudflare keeps no older versions. So a tab opened before a deploy that lazily loads a chunk (the map, the generate worker, a route), or HTML served just as the deploy switches over, asks for files that are gone. What handles it:
  - The Worker sends HTML with `Cache-Control: no-cache`, so a browser always checks for the current copy. It answers a missing `/assets/*` with a plain `404` and `no-store`, so no cache keeps the miss.
  - `public/_headers` makes `/assets/*` `immutable` for a year. The files are content-hashed; before this, the default was `max-age=0, must-revalidate`.
  - A head script (`src/app/load-recovery.ts`) reloads the page once when a build file fails to load (a script or stylesheet `error`, `vite:preloadError`, or a failed dynamic import). Plans and the open tab are saved, so the reload lands the person where they were. A `sessionStorage` timestamp allows at most one automatic reload per 5 minutes; after that, a small card explains and offers Reload. The generate worker reports its own load failure (#19).
  - **We don't serve old versions' files from R2.** We considered copying every build's `assets/` to R2 in the deploy workflow and falling back to it from the Worker for missing files. That needs upload credentials in CI, a retention and pruning policy, and a second source of truth for build files, all to save a single reload that already lands in the same place.
- **Service worker (`/sw.js`, served by the Worker from `src/server/service-worker.ts`) exists only so a reload works offline.**
  - Pages are network-first, so every online load gets the current deploy; the last copy is used only when the network fails.
  - `/assets/*` are cache-first as they're fetched, capped at 400 files.
  - `/data`, `/api` and analytics pass through. IndexedDB already holds the data.
  - It's registered in production builds only.
  - To retire it, serve a `/sw.js` that calls `self.registration.unregister()`. Browsers check `/sw.js` on every navigation, so the change spreads on the next visit. Bumping `SERVICE_WORKER_VERSION` drops its caches.
- **Moderation (V2 §9, `docs/MODERATION.md`):**
  - Reviews use `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for policy. Chat uses `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, measured on the labeled set on 2026-09-26: chat p95 end to end was 1.4 s over 75 messages, and no `graded-work` case was missed.
  - Every chat message is read. When nothing flagged the message, only `targets-person` acts on it: letting all the small model's labels act held 4 of 23 good messages.
  - Model failures retry every 5 minutes before reaching the owner.

## Known issues

- **Local Playwright browsers:** agent sandboxes ship an older Chromium under `PLAYWRIGHT_BROWSERS_PATH`; `playwright.config.ts` falls back to it when the expected build is missing. CI installs the matching browser.
- **PlanetTerp name join:** 394 of the 3,904 Testudo instructor names in the active terms have no exact PlanetTerp match (mostly people PlanetTerp doesn't list yet). `_jobs/planetterp/unmatched.json` lists them after every run; a small alias map could recover a few.
- **PlanetTerp reviews stopped on 2026-05-01** and grades end at Spring 2025, so ratings and summaries won't move until PlanetTerp resumes.
- **Catalog schema bumps** republish on the next catalog run (up to 6 h); run `pnpm tsx scripts/ingest.ts catalog --target r2` after deploying one (DATA.md §2.3).
