# Analytics

Terpsicle uses [PostHog](https://posthog.com) to learn which parts of the app people actually use, so we can make those excellent and cut the rest (`DESIGN.md` §5). Every visitor stays anonymous.

## What's tracked

- **Pageviews**, including in-app navigation (`capture_pageview: "history_change"`), with the real path (`/schedule`, …). PostHog loads with the scheduler at `/schedule` (`app_loaded` there too); the marketing page at `/`, `/privacy` and the coming-soon pages don't load it, so they stay light and aren't counted until they do.
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
  | `first_visit_path_chosen` | `path`: `build` · `generate` | Which of the two equal first-visit paths people take (SPEC §3.2; DESIGN §4b calls them "equally valid"). |
  | `course_removed` | `via`: `menu` · `details` | How much people prune, and whether the Courses row menu is found. |
  | `course_saved_for_later` | `via`: `menu` · `details` | Whether bookmarking a course ("Bookmark", "Bookmark instead"; "Saved for later" until 2026-09-26, same event) earns its place. |
  | `problem_opened` | `kind` | Which problems people look into. |
  | `problem_fix_applied` | `kind` (`switch` · `accept-change`), `problem` | Whether one-click fixes get used, and for which problems. |
  | `export_codes_copied` | `count` | How many plans reach registration. |
  | `share_link_copied` | | Whether sharing is used. |
  | `ics_downloaded` | `events` | Whether calendar export is worth keeping. |
  | `registration_item_checked` | | Whether the checklist is used on registration day. |
  | `seat_alert_requested` / `seat_alert_stopped` | | Seat-alert demand from the app's side (the server counts confirmations and sends). Never the address. |
  | `deep_link_opened` | `outcome`: `ok` · `unknown-term` | How often seat-alert emails bring people back, and whether their terms still exist. |
  | `catalog_loaded` | `termId`, `fromCache`, `deptsFetched`, `ms` (until every department is in) | Whether the IndexedDB cache and manifest diffing keep repeat visits fast (BUILD §5), and how long a first visit waits for the whole catalog. |
  | `catalog_load_failed` | `termId` (null when the terms list failed), `reason`: `missing` · `network` · `invalid` · `newer-data` | Visits that saw the "couldn't load" state instead of a calendar, and which failure caused it. |
  | `generate_run` | `courses`, `mustHaves` (names of the ones set), `rankBy`, `results`, `durationMs`, `truncated`, `relaxed` | How big Generate requests get, which must-haves people set, how often nothing fits, and whether runs stay fast on real devices. |
  | `generate_result_previewed` | `rank` | Whether people look past the first few results (is the ranking right?). |
  | `generate_plans_saved` | `count` | Whether Generate produces plans people keep, and whether saving several at once is used. |
  | `generate_relaxation_applied` | `constraint` | Which suggested relaxations people take when nothing fits. |
  | `travel_settings_changed` | `setting`: `pace` · `accessible` · `extraMinutes`, and its new `value` | Which travel settings people change, and whether Accessible routes gets used. |
  | `travel_how_opened` | | Whether people want to see how estimates are made ("How?"). |
  | `connection_opened` | `verdict` | How often people look into a connection, and which kinds (tight, not enough time, fine). Counted once its verdict is known, from any way in: a pill, the Travel list, Problems. |
  | `route_map_shown` | `mode`, `hasGeometry` | How often a connection has a route to draw, per mode: missing geometry hides the map. |

  | `search_performed` | `queryLength`, `results`, `filtered` | Whether search finds things (how often zero results), and how long queries are. Debounced; the text itself is never sent. |
  | `search_filter_changed` | `filter` | Which filter chips earn their place on the line. |
  | `search_result_opened` | `position` | Whether ranking works: most opens should be in the first few results. |
  | `course_details_tab` | `tab` | What people open on the course details page (one page, no tabs, since the UX review; the name stays for continuity): `instructors` for a group's Reviews, `grades` for "Grades ↓", `about` for "More about this course". |
  | `course_added` | `via`: `details` · `ghost` | Where courses get into plans: course details' list, or a ghost on the calendar. |
  | `review_summary_viewed` | `state`: `shown` · `unavailable` | How often a review summary is there to show (it's hidden otherwise). |

  | `signin_started` | `from`: `topbar` · `settings` · `signin-page` · `undo` | Where people decide to sign in (the front door's pull), and how often Undo after deleting an account is used. |
  | `signin_completed` | `firstOnDevice` | Sign-ins that finished, and how many are a device's first (the future first-sign-in merge and install prompt). Sent after `?signed-in=1`. |
  | `signin_failed` | `reason` (a `SignInError` code) | Why sign-ins fail: personal accounts, other domains, cancels, Google errors. Sent from `/signin`. |
  | `signed_out` | `removedLocal` | How often people sign out, and whether the shared-computer option gets used (always `false` until plan sync). |
  | `account_deletion_requested` | | How often people delete their account. |

  Hovering and previewing sections isn't tracked: it fires on every pointer move over the calendar, and `section_switched` already says whether ghosts lead somewhere. The same goes for hovering grade bar segments.

- **Session recordings**, when enabled in the PostHog project. They're recorded with every input masked (`maskAllInputs`) and the text of any element marked `data-private` masked.
- **Server events** from cron jobs and the `/api` endpoints, via `captureServerEvent()` in `src/server/analytics.ts` (declared in `ServerEvents`). They use one fixed id (`terpsicle-worker`) and never describe a person:

  | Event | Properties | Why |
  |---|---|---|
  | `cron_job_finished` | `job`, `durationMs` (wall time), `counts` (what the run did: departments written, sections, changes, grade requests, …), `errorCount`, `firstError` | Jobs that run long, do nothing, or keep recovering from the same error. |
  | `cron_job_failed` | `job`, `durationMs`, `error`; when a source answered with data we won't publish (PlanetTerp's list came back empty or more than 10% short, DATA.md §4.1), also `firstError` (the specific reason) and `counts` (what this run saw against the last good run) | Runs that gave up (Cloudflare marks the cron failed too), and sources that are breaking while the last good data stays up. |
  | `summary_generated` | `model`, `durationMs`, `reviews`, `attempts` | Workers AI cost and latency; how often the first answer fails validation. |
  | `summary_cached` | `ageDays` | How often summaries come from R2, and how old they get. |
  | `summary_failed` | `reason` (`model-output`, `model-error`, `planetterp`, `storage`) | Which dependency fails. |
  | `summary_capped` | `cap` | Whether the daily cap is too low. |
  | `alert_subscribed` | `outcome` (`confirm-sent`, `already-watching`, `not-sent`) | Signups, and how often limits skip an email. |
  | `alert_confirmed` | `termId` | How many signups confirm. |
  | `alert_sent` | `termId`, `count` | Alert volume per seats run. |
  | `alert_unsubscribed` | `termId` | Whether alerts are wanted. |
  | `signin_result` | `outcome` (`signed-in`, a `SignInError` code, or `sub-conflict`), `hd` (the domain only, on success) | Server-side truth for sign-in success and failure, including failures the browser never reports, and the TERPmail versus UMD Gmail split. |

  Seat-alert events never carry an address, token or IP, not even hashed: a count per term is all we need. Identity events carry no user id, directory ID, name, email or `sub`: the domain is the most specific thing they say.

## Privacy

- **Anonymous only.** We never call `identify()`, so no person profiles exist (`person_profiles: "identified_only"`). v2 adds accounts, and this doesn't change: signing in never identifies anyone to PostHog, and events never carry a user id, name, email, directory ID or user-written text (`docs/V2.md` §11).
- **No analytics cookies.** PostHog state lives in `localStorage`, and the `/ingest` proxy strips cookies in both directions (so the v2 session cookie never reaches PostHog).
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
