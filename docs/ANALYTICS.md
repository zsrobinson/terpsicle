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

- **Session recordings**, when enabled in the PostHog project. They're recorded with every input masked (`maskAllInputs`) and the text of any element marked `data-private` masked.
- **Server events** from cron jobs, via `captureServerEvent()` in `src/server/analytics.ts` (declared in `ServerEvents`). They use one fixed id (`terpsicle-worker`) and never describe a person.

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
