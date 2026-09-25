# Analytics

Terpsicle uses [PostHog](https://posthog.com) to learn which parts of the app people actually use, so we can make those excellent and cut the rest (`DESIGN.md` §5). Every visitor stays anonymous.

## What's tracked

- **Pageviews**, including in-app navigation (`capture_pageview: "history_change"`).
- **Autocapture**: clicks and form submissions on interactive elements, with element text. Input values are never captured.
- **Named events** from `track()` in `src/app/analytics.ts`. Every event and its properties is declared in the `AnalyticsEvents` interface there:

  | Event | Properties | Why |
  |---|---|---|
  | `app_loaded` | `dataSource` | Visits that reach a working app, and whether they're on live data. |
  | `plan_created` | `source`: `empty` · `copy` · `generate` · `shared` | Do people keep several plans, and which way of starting one do they use? Weighs the two first-visit paths against each other. |
  | `plan_deleted` | | Do people prune plans, or only add them? |
  | `plan_renamed` | `via`: `menu` · `double-click` | Whether double-click rename is discovered, or only the ▾ menu. |
  | `tab_opened` | `tab`, `via`: `click` · `shortcut` | Which sidebar tabs get used, and whether anyone uses the `1`–`7` / `/` shortcuts. |
  | `sidebar_collapsed` | | Whether people want more calendar room (clicking the open rail tab). |
  | `term_switched` | `status`: `active` · `archived` | How often people leave the default term, and whether past terms are worth keeping. |
  | `theme_changed` | `theme` | Whether the toggle is found and used, or the system theme is enough. |
  | `undo_used` | `via`: `shortcut` · `toast` | Whether undo is doing the job confirmation dialogs would have. |
  | `shared_link_opened` | `outcome`: `ok` · `invalid` · `newer-version` | How many shared links arrive, and how many are broken. |
  | `shared_plan_saved` | `droppedSections` | How often a shared plan becomes the viewer's own, and how often sections have gone missing since it was shared. |
  | `section_switched` | `via`: `ghost` · `list` · `keyboard` | Whether people pick sections on the calendar (ghosts), in course details, or with ↑/↓/↵: the case for "see every option". |
  | `block_created` | `via`: `drag` · `form` | Whether drag-to-block is discovered, or blocks only come from the Blocks tab. |
  | `course_color_changed` | | Whether anyone recolors courses (a "just for fun" feature worth keeping only if used). |

  Hovering and previewing sections isn't tracked: it fires on every pointer move over the calendar, and `section_switched` already says whether ghosts lead somewhere.

- **Session recordings**, when enabled in the PostHog project. They're recorded with every input masked (`maskAllInputs`) and the text of any element marked `data-private` masked.
- **Server events** from cron jobs and the `/api` endpoints, via `captureServerEvent()` in `src/server/analytics.ts` (declared in `ServerEvents`). They use one fixed id (`terpsicle-worker`) and never describe a person:

  | Event | Properties | Why |
  |---|---|---|
  | `cron_job_finished` | `job`, `durationMs` (wall time), `counts` (what the run did: departments written, sections, changes, grade requests, …), `errorCount`, `firstError` | Jobs that run long, do nothing, or keep recovering from the same error. |
  | `cron_job_failed` | `job`, `durationMs`, `error` | Runs that gave up (Cloudflare marks the cron failed too). |
  | `summary_generated` | `model`, `durationMs`, `reviews`, `attempts` | Workers AI cost and latency; how often the first answer fails validation. |
  | `summary_cached` | `ageDays` | How often summaries come from R2, and how old they get. |
  | `summary_failed` | `reason` (`model-output`, `model-error`, `planetterp`, `storage`) | Which dependency fails. |
  | `summary_capped` | `cap` | Whether the daily cap is too low. |
  | `alert_subscribed` | `outcome` (`confirm-sent`, `already-watching`, `not-sent`) | Signups, and how often limits skip an email. |
  | `alert_confirmed` | `termId` | How many signups confirm. |
  | `alert_sent` | `termId`, `count` | Alert volume per seats run. |
  | `alert_unsubscribed` | `termId` | Whether alerts are wanted. |

  Seat-alert events never carry an address, token or IP, not even hashed: a count per term is all we need.

## Privacy

- **Anonymous only.** We never call `identify()`, so no person profiles exist (`person_profiles: "identified_only"`). There are no accounts to link to.
- **No cookies.** PostHog state lives in `localStorage`, and the `/ingest` proxy strips cookies in both directions.
- **No IP addresses.** The proxy drops the visitor's IP headers, so PostHog only sees Cloudflare's.
- **Inputs are masked** in recordings, and anything marked `data-private` is too. Use it for anything a person types or that identifies them.
- **Seat-alert emails never reach analytics.** They're stored in D1 for sending alerts and nothing else: never pass one to `track()`, an event property, or a `data-*` attribute autocapture could read, and mark the email field `data-private`.
- **Only production reports.** Analytics are off unless the page is on `terpsicle.com` with live data, so local dev, `pnpm dev:mock`, tests, e2e and PR previews send nothing. Server events need `POSTHOG_TOKEN`, which only the production Worker has.

## How it's wired

- **Client:** `src/app/analytics.ts`. `initAnalytics()` lazy-loads `posthog-js` (its own chunk, so disabled environments never download it), with `api_host: "/ingest"` and `ui_host: "https://us.posthog.com"`. `track(event, props)` is typed against `AnalyticsEvents` and queues events until PostHog loads.
- **Proxy:** `src/server/posthog-proxy.ts`, routed from `src/server/worker.ts`. `/ingest/static/*` goes to `us-assets.i.posthog.com` and everything else under `/ingest/*` to `us.i.posthog.com`. The proxy is first-party, so ad blockers don't drop anonymous analytics.
- **Token:** the public project token is in `env/.env` (`VITE_POSTHOG_TOKEN`) for the client and in `wrangler.jsonc` `vars.POSTHOG_TOKEN` for the Worker.

## Adding an event

1. Add it to `AnalyticsEvents` (client) or `ServerEvents` (Worker) with typed properties.
2. Call `track("event_name", { … })`. Name it `object_verb` in the past tense (`plan_created`, `course_opened`), and never include personal data.
3. Add a row to the table above saying why we need it.
