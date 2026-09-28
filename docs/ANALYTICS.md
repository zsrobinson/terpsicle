# Analytics

Terpsicle uses [PostHog](https://posthog.com) to learn which parts of the app people actually use, so we can make those excellent and cut the rest (`DESIGN.md` §5). Every visitor stays anonymous.

## What's tracked

- **Pageviews**, including in-app navigation (`capture_pageview: "history_change"`), with a scrubbed URL (see "Privacy"). PostHog loads with the scheduler at `/schedule` (`app_loaded` there too) and with `/settings`; the marketing page at `/`, `/privacy` and the coming-soon pages don't load it, so they stay light and aren't counted until they do.
- **Autocapture**: clicks and form submissions on interactive elements, with element text. Input values and copied text are never captured, clicks on or inside `data-private` elements are skipped, text or attributes that contain a `data-private` element's text are removed (a button whose label quotes a block's name), and it's off on `/chat`, `/settings`, `/admin`, `/reviews/mine`, `/plan`, `/todo`, `/signin` and `/auth` (`NO_AUTOCAPTURE_ROUTES` in `src/core/analytics/routes.ts`), where named events still count.
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
  | `seat_watch_started` / `seat_watch_stopped` | `signedInFirst` (on start: the watch was asked for signed out and began after sign-in) | Seat-watch demand from the app's side, and how many people sign in for it (the server counts watches and sends). Never who or which section. |
  | `deep_link_opened` | `outcome`: `ok` · `unknown-term` | How often seat-alert emails bring people back, and whether their terms still exist. |
  | `catalog_loaded` | `termId`, `fromCache`, `deptsFetched`, `ms` (until every department is in) | Whether the IndexedDB cache and manifest diffing keep repeat visits fast (BUILD §5), and how long a first visit waits for the whole catalog. |
  | `catalog_load_failed` | `termId` (null when the terms list failed), `reason`: `missing` · `network` · `invalid` · `newer-data` | Visits that saw the "couldn't load" state instead of a calendar, and which failure caused it. |
  | `generate_run` | `courses` (listed by code), `wildcards` (each wildcard item's kind, `pattern` or `gen-ed`), `mustHaves` (names of the ones set), `rankBy`, `results`, `durationMs`, `truncated`, `relaxed` | How big Generate requests get, whether people use wildcards, which must-haves people set, how often nothing fits, and whether runs stay fast on real devices. |
  | `generate_result_previewed` | `rank` | Whether people look past the first few results (is the ranking right?). |
  | `generate_plans_saved` | `count` | Whether Generate produces plans people keep, and whether saving several at once is used. |
  | `generate_relaxation_applied` | `constraint` | Which suggested relaxations people take when nothing fits. |
  | `travel_settings_changed` | `setting`: `pace` · `accessible` · `extraMinutes`, and its new `value` | Which travel settings people change, and whether Accessible routes gets used. |
  | `travel_how_opened` | | Whether people want to see how estimates are made ("How?"). |
  | `connection_opened` | `verdict` | How often people look into a connection, and which kinds (tight, not enough time, fine). Counted once its verdict is known, from any way in: a pill, the Travel list, Problems. |
  | `route_map_shown` | `mode`, `hasGeometry` | How often a connection has a route to draw, per mode: missing geometry hides the map. |
  | `install_prompt_shown` | `trigger`: `first-sign-in` · `chat-joined` · `alert-on` · `menu`; `platform`: `ios` · `chromium` | How often the install prompt opens, and at which key moment (or from the "Install app" item). |
  | `install_prompt_result` | `trigger`, `platform`, `outcome`: `installed` · `dismissed` | Whether the prompt earns its place or annoys: mostly `dismissed` means it's asked at the wrong moments. |
  | `pwa_installed` | | Installs from any way in, the browser's own menu included (`appinstalled`). |

  | `search_performed` | `queryLength`, `results`, `filtered` | Whether search finds things (how often zero results), and how long queries are. Debounced; the text itself is never sent. |
  | `search_filter_changed` | `filter` | Which filter chips earn their place on the line. |
  | `search_result_opened` | `position` | Whether ranking works: most opens should be in the first few results. |
  | `course_details_tab` | `tab` | What people open on the course details page (one page, no tabs, since the UX review; the name stays for continuity): `instructors` for a group's Reviews, `grades` for "Grades ↓", `about` for "More about this course". |
  | `course_added` | `via`: `details` · `ghost` | Where courses get into plans: course details' list, or a ghost on the calendar. |
  | `review_summary_viewed` | `state`: `shown` · `unavailable` | How often a review summary is there to show (it's hidden otherwise). |
  | `ai_features_changed` | `on`, `via`: `box` · `settings` | How many people turn AI features off, and from where: an AI box's ⋯ menu (and its Undo) or Settings. Never who, or which summary. |

  | `signin_started` | `from`: `topbar` · `settings` · `signin-page` · `undo` · `reviews` · `chat` · `todo` | Where people decide to sign in (the front door's pull), and how often Undo after deleting an account is used. `reviews`: from writing or reporting a review. `chat`: from signed-out `/chat`. `todo`: from signed-out `/todo` or `/todo/connect`. |
  | `signin_completed` | `firstOnDevice` | Sign-ins that finished, and how many are a device's first (the future first-sign-in merge and install prompt). Sent after `?signed-in=1`. |
  | `signin_failed` | `reason` (a `SignInError` code) | Why sign-ins fail: personal accounts, other domains, cancels, Google errors. Sent from `/signin`. |
  | `push_enabled` | none | People turning on notifications on a device, from Settings. |
  | `push_disabled` | none | People turning them off there ("Turn off here"). |
  | `notifications_opened` | none | Whether people find the bell and open Notifications (V2.md §6.7). |
  | `notification_opened` | `type` (`seat-open`, `chat-mention`, `chat-reply`, `todo-due`, `admin-urgent`) | Which kinds of notification people open from the bell. Never its words, course or who it's about; the list is `data-private`. |
  | `calendar_feed_created` | none | People making their calendar feed link, from Settings (V2.md §6.7). Never the link. |
  | `calendar_feed_reset` | none | People making a new link, which stops the old one. Never either link. |
  | `signed_out` | `removedLocal` | How often people sign out, and whether the shared-computer option ("Sign out and remove plans from this device") gets used. |
  | `sync_first_sign_in` | `uploaded`, `renamed`, `copies` (counts) | What a device's first sign-in does with the plans and four-year plans already on it: how many go up to the account, how many clash with a name there, and how many the account holds differently. Never plan names, courses or grades. |
  | `account_deletion_requested` | | How often people delete their account. |
  | `reviews_page_viewed` | `page`: `home` · `instructor` · `course` | Which Reviews pages people read. Never which instructor or course. |
  | `review_form_opened` | | How often people start a review. |
  | `review_submitted` | `outcome`: `published` · `held` · `rejected` | How many new reviews post on their own, and how many wait for a person (V2.md §9.2's under-5% target). Never the review, instructor or course. |
  | `report_created` | `surface`, `reason` | How often readers report, and why. Never what they reported. |
  | `todo_connect_result` | `outcome` (`connected`, `invalid-link`, `unreachable`, `not-a-calendar`), and with `unreachable` and `not-a-calendar` a `reason`: a fixed code, `timeout`, `network`, `bad-redirect`, `too-large`, `http-<status>` (`http-404`) or `not-recognized` (ELMS answered, but not with a calendar) | Where connecting ELMS fails, and why, so a failure can be traced without asking the student. The reason is a code from that list and nothing else: never the link, a message or the body. Calls to our own server that fail (signed out, offline) aren't sent. |
  | `todo_disconnected` | | Churn: sent once Disconnect's Undo is gone. |
  | `todo_item_checked` | `done`, `via` (`list`, `week`) | Whether checking things off is the habit. |
  | `todo_view_changed` | `view` (`day`, `course`, `week`) | Which views earn their place. |
  | `todo_file_imported` | `items`, `skipped` (counts) | Whether the Gradescope fallback (a dropped `.ics`) is used. |
  | `todo_task_added` | `date`, `time`, `course` (booleans: whether the task got one) | Whether "Add a task…" earns its place, and whether people date their tasks. Never the task's words, date or course. |

  Todo's events never carry an item's or a task's title, course, date or link, nor anything from the feed. `/todo` is on the no-autocapture list, and titles and course names are `data-private`.

  | `four_year_created` | `source`: `empty` · `copy` · `import` · `template` | Which way into Plan people take. `import` counts the first visit's "Paste your transcript", whether or not anything is imported; `transcript_imported` counts imports. `template` counts the first visit's "Pick a sample plan" and the Samples tab's "Start a new plan from it"; `template_applied` counts sample plans added. |
  | `four_year_course_added` | `via`: `search` · `column` · `wildcard-resolve` | Whether search or a semester's "+ Add a course" is found, and how often placeholders become courses. |
  | `four_year_course_moved` | `via`: `drag` · `menu` | Whether drag is discovered, or people use "Move to…". |
  | `four_year_wildcard_added` / `four_year_wildcard_resolved` | `kind`: `pattern` · `gen-ed` | Whether placeholders earn their place. |
  | `four_year_problem_opened` / `four_year_problem_fix_applied` | `kind` (a `FourYearProblemKind`) | Whether prerequisite and credit problems help. |
  | `four_year_details_saved` | `genEds`: how many GenEds it was given | How often people describe a course Testudo doesn't list anymore. Never the code, title or which GenEds. |
  | `four_year_handoff` | `outcome`: `created-plan` · `opened-plan` | Whether "View schedule" leads somewhere: `created-plan` when the scheduler bookmarks the semester's courses in a new (or still empty) plan, `opened-plan` when it opens the term's plan as it is. Never which courses. |
  | `cross_link_clicked` | `from`, `to` (product ids: `schedule`, `reviews`, `chat`, `plan`, `todo`) | Which "View …" links between products get followed (V3 §1.2): Plan → Schedule, Todo and Reviews; Schedule → Plan; Todo → Chat and Schedule; Reviews → Schedule. Never the course, term or item behind the link. |
  | `transcript_parsed` | `recognized`, and counts: `lines` read, `choices` waiting on an "or", `skipped` lines | How often pastes read, and how much fixing they need. Sent once a paste settles, never with its text. |
  | `transcript_imported` | `lines` (entries imported), `keptGrades` | How many pastes become plans, and whether people keep grades. |
  | `template_applied` | `template` (the sample plan's id, like `cmsc-2026`) | Which sample plans are worth curating next. Never what's in the plan. |

  Plan's events never carry a course code, grade, GPA or a course's credits, nor anything from a pasted transcript beyond the counts above. `/plan` is on the no-autocapture list, and grades are `data-private`.

  | `feedback_opened` | `product` | Whether people find "Send feedback", and from where. |
  | `feedback_sent` | `kind` (`bug` · `idea`), `product`, `hasScreenshot`, `withContext`, `reply` | Whether people keep the screenshot and "Include what I was doing" on, and how often they want a reply. Never the words, the page or the person (docs/FEEDBACK.md). |
  | `feedback_undone` | | How often Undo takes feedback back. |
  | `coffee_opened` | | Whether people open the coffee button's popover beside Feedback. |
  | `coffee_link_clicked` | `via` (`popover` · `menu`, the phone account menu's item) | How often it leads out to Buy Me a Coffee. Never who, or whether they bought one. |

  Feedback's events never carry what someone wrote, their page or who they are: `[data-feedback-ui]` (the sheet, the admin's pins and their notes) is on autocapture's ignore list too.

  Hovering and previewing sections isn't tracked: it fires on every pointer move over the calendar, and `section_switched` already says whether ghosts lead somewhere. The same goes for hovering grade bar segments.

- **No session recordings.** The owner decided against them (2026-09-26): `posthog.init` sets `disable_session_recording: true` whatever the PostHog project says, nothing calls `startSessionRecording()` (a test in `src/app/analytics.test.ts` checks every source file), and `before_send` drops any recording data (`$snapshot`) anyway. Keep replay off in the PostHog project too.
- **Server events** from cron jobs and the `/api` endpoints, via `captureServerEvent()` in `src/server/analytics.ts` (declared in `ServerEvents`). They use one fixed id (`terpsicle-worker`) and never describe a person:

  | Event | Properties | Why |
  |---|---|---|
  | `cron_job_finished` | `job`, `durationMs` (wall time), `counts` (what the run did: departments written, sections, changes, grade requests, …), `errorCount`, `firstError` | Jobs that run long, do nothing, or keep recovering from the same error. |
  | `cron_job_failed` | `job`, `durationMs`, `error`; when a source answered with data we won't publish (PlanetTerp's list came back empty or more than 10% short, DATA.md §4.1), also `firstError` (the specific reason) and `counts` (what this run saw against the last good run) | Runs that gave up (Cloudflare marks the cron failed too), and sources that are breaking while the last good data stays up. |
  | `summary_generated` | `model`, `durationMs`, `reviews`, `attempts` | Workers AI cost and latency; how often the first answer fails validation. |
  | `summary_cached` | `ageDays` | How often summaries come from R2, and how old they get. |
  | `summary_failed` | `reason` (`model-output`, `model-error`, `planetterp`, `storage`; `unsafe` when Llama Guard flags the summary, `guard-error` when the check itself failed) | Which dependency fails. |
  | `summary_capped` | `cap` | Whether the daily cap is too low. |
  | `alert_watched` | `termId` | New seat watches. |
  | `alert_sent` | `termId`, `count` | Alert volume per seats run. |
  | `alert_unwatched` | `termId`, `via` (`app`, `email`) | Whether alerts are wanted, and how often the email's one-click stop is used. |
  | `alert_watches_ended` | `terms`, `watches` | Watches the daily job ended with their term. |
  | `signin_result` | `outcome` (`signed-in`, a `SignInError` code, or `sub-conflict`), `hd` (the domain only, on success) | Server-side truth for sign-in success and failure, including failures the browser never reports, and the TERPmail versus UMD Gmail split. |
  | `sync_push` | `docs`, `fourYearDocs`, `conflicts` | Plan sync's load (and how much of it is Terpsicle Plan's four-year plans) and how often two devices change the same doc (a conflict makes a "(copy)" plan). Counts only. |
  | `todo_fetch_run` | `due`, `fetched`, `notModified`, `unchanged`, `failed`, `broken`, `paused`, `durationMs` | Terpsicle Todo's feed cadence and failure rates. Counts only: never a feed, link, person or item. |
  | `feedback_received` | `kind` (`bug` · `idea`), `product`, `hasScreenshot`, `withContext`, `reply` | How much feedback arrives and whether people keep the screenshot and activity log on (docs/FEEDBACK.md). Never its words, its page or who sent it. |

  Seat-alert events never carry an address, token or IP, not even hashed: a count per term is all we need. Identity events carry no user id, directory ID, name, email or `sub`: the domain is the most specific thing they say.

## Privacy

- **Anonymous only.** We never call `identify()`, so no person profiles exist (`person_profiles: "identified_only"`). v2 adds accounts, and this doesn't change: signing in never identifies anyone to PostHog, and events never carry a user id, name, email, directory ID or user-written text (`docs/V2.md` §11).
- **No analytics cookies.** PostHog state lives in `localStorage`, and the `/ingest` proxy strips cookies in both directions (so the v2 session cookie never reaches PostHog).
- **No IP addresses.** The proxy drops the visitor's IP headers, so PostHog only sees Cloudflare's.
- **Mark private text `data-private`**: names, emails, pictures, and anything a person wrote or named themselves (a block's label). Autocapture skips clicks on or inside it, and removes its text from any click event that quotes it. PostHog's own input masking already keeps typed values out.
- **URLs are scrubbed** before any event leaves the browser (`scrubEvent` in `src/core/analytics/scrub.ts`, PostHog's `before_send`). Every URL and path property (`$current_url`, `$pathname`, `$referrer`, the session-entry and initial ones, `$prev_pageview_pathname`, link hrefs in autocapture) keeps its path and only the search params `tab`, `view`, `term`, `semester`, `step`, `from` and `error`, with short plain values; hashes are dropped. A share link's `?plan=…` (a whole plan, block labels included, DATA.md §8) becomes `?plan=shared`. Chat paths and the scheduler's drill-ins become their route pattern (`/chat/:term/:course/:room`, `/schedule/course/:code`, `/schedule/connection/:connectionId`, `/schedule/result/:resultId`), and their page title is dropped, so neither Chat's events nor the scheduler's name a course or section.
- **No long text in our events.** `before_send` drops any of our own events with a property over 200 characters: a backstop in case typed or pasted text ever gets into one.
- **Seat-alert emails never reach analytics.** They're stored in D1 for sending alerts and nothing else: never pass one to `track()`, an event property, or a `data-*` attribute autocapture could read, and mark the email field `data-private`.
- **Only production reports.** Analytics are off unless the page is on `terpsicle.com` with live data, so local dev, `pnpm dev:mock`, tests, e2e and PR previews send nothing. Server events need `POSTHOG_TOKEN`, which only the production Worker has.

## How it's wired

- **Client:** `src/app/analytics.ts`. `initAnalytics()` lazy-loads `posthog-js` (its own chunk, so disabled environments never download it) with `posthogOptions()` from `src/app/posthog-options.ts` (loaded with it, so the privacy code adds nothing to eager bundles): `api_host: "/ingest"`, `ui_host: "https://us.posthog.com"` and the privacy settings above. `track(event, props)` is typed against `AnalyticsEvents` and queues events until PostHog loads.
- **Proxy:** `src/server/posthog-proxy.ts`, routed from `src/server/worker.ts`. `/ingest/static/*` goes to `us-assets.i.posthog.com` and everything else under `/ingest/*` to `us.i.posthog.com`. The proxy is first-party, so ad blockers don't drop anonymous analytics.
- **Token:** the public project token is in `env/.env` (`VITE_POSTHOG_TOKEN`) for the client and in `wrangler.jsonc` `vars.POSTHOG_TOKEN` for the Worker.

## Adding an event

1. Add it to `AnalyticsEvents` (client) or `ServerEvents` (Worker) with typed properties.
2. Call `track("event_name", { … })`. Name it `object_verb` in the past tense (`plan_created`, `course_opened`), and never include personal data.
3. Add a row to the table above saying why we need it.
