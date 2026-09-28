# Decisions

Choices that shape future work, each small enough to read in ten seconds. How to add one: the `record-a-decision` skill.

**Why not ADRs.** ADRs tend to turn a one-off choice into a founding principle of how the app is made. Here, every entry says who decided it and how far it reaches:

- **owner, app-wide:** a principle. Only the owner changes it.
- **owner, one feature:** the owner's call for that feature. It doesn't bind anything else.
- **agent:** a default someone picked to keep moving. Anyone may change it in a PR that says why.

An entry is worth writing only when the choice is hard to reverse, would surprise someone reading the code, and came from a real trade-off (Matt Pocock's ADR test, from [mattpocock/skills](https://github.com/mattpocock/skills)). The owner's decisions always get one. When a decision changes, edit its entry and add "(changed <date>: why)"; don't pile up superseded entries.

Each entry: a title, then `date · by · scope`, the decision in one to three lines, and "Revisit if".

## App-wide

### Academic planning tools, nothing else
2026-09-26 · owner · app-wide
Terpsicle is really good academic planning tools. Earshot and Orgs are dropped, not shelved, and degree audit is out of scope (UMD has one).
Revisit if: the owner sets a new direction.

### Five products in color order
2026-09-26 · owner · app-wide
Schedule (red), Reviews (purple), Chat (blue), Plan (green), Todo (yellow), in that order in the product menu, marketing and docs, "unless it looks really bad".
Revisit if: a product is added or dropped.

### One origin, one PWA
2026-09-26 · owner · app-wide
Everything is a path on terpsicle.com, with one manifest, one service worker at root scope, one push subscription per device and one session cookie.
Revisit if: a product needs its own domain.

### Use the platform first
2026-09-26 · owner · app-wide
Lean on TanStack Start and Router, Cloudflare and our libraries before building infrastructure ourselves ("i shouldn't have to worry about the page load things"). The scheduler's panel registry, `lazyPanel` and URL sync move to real nested routes in `v2/schedule-routes`.
Revisit if: the framework can't do something; say what in the PR.

### Back and Forward undo navigation
2026-09-26 · owner · app-wide
Whatever a person expects Back to undo (the open course, the tab, a filter, a chat room, a settings page) lives in the path or search params and pushes a history entry. Transient UI never pushes, and typing in search replaces. The browser's Back and the in-app Back are one thing.
Revisit if: a view needs state that can't fit in a URL.

### Words: contractions, and "View" links
2026-09-26 · owner · app-wide
Copy uses contractions everywhere ("It's supposed to feel a little personal"). Links between products read "View schedule", "View reviews", "View chat", never "Open in Reviews".
Revisit if: never on its own.

### No backward compatibility yet
2026-09-26 · owner · app-wide
The app isn't public, so old share links and routes can simply change.
Revisit if: Terpsicle launches publicly.

### The brand is Ink
2026-09-26 · owner · app-wide
The Ink variation with grain, Flexoki colors and Bricolage Grotesque, square corners with small offset shadows; a black box never gets a black offset. The marks are the owner's pixel drawings (below), kept as swappable data. Tokens are in `docs/DESIGN.md` §7.
Revisit if: the owner refines the brand.

### The owner's pixel marks, on Flexoki 600 tiles
2026-09-28 · owner · app-wide
Six 9×9 pixel marks, "exactly" as the owner drew them: a black umbrella tile for Terpsicle, and each product's glyph in white at 100% and 50% on its Flexoki 600 tile (Plan's green and Todo's yellow moved to 600 too). The 1-unit offset is optional: the bar and menus keep it, and the app icons and favicon are the umbrella's tile alone, no offset. In dark, the umbrella's black tile takes a base-600 keyline (the page is black too). Glyphs are graphics, held to 3:1 (Todo's white on yellow-600 is 3.5:1).
Revisit if: the owner redraws a mark; change its rows in `src/app/brand/marks.ts` and run `pnpm tsx scripts/build-icons.ts`.

### Early access, and a coffee link
2026-09-28 · owner · app-wide
An "Early access" chip sits beside the wordmark ("Terpsicle's still in active development, so things may change."). A coffee button beside Feedback opens a short note and links to https://buymeacoffee.com/zsrobinson ("figured it couldn't help"). It never opens by itself and never asks twice.
Revisit if: Terpsicle leaves early access, or the owner drops the coffee link.

### Crowded bars give their context the room below 1536px
2026-09-28 · agent · one feature
On a bar marked `crowdedBelow2xl` (the scheduler's and Plan's), below 1536px the Early access chip hides, the coffee button becomes "Buy me a coffee" in the account menu, Feedback shows just its icon and the product tabs' padding tightens, so three plan tabs show whole at 1440px and two at 1280px (e2e/shell.spec.ts). The chip stays on every other bar and in the product menu.
Revisit if: the scheduler's bar changes its context or status, or the owner wants the chip on every bar at every width.

### Sign in with Google, UMD only
2026-09-26 · owner · app-wide
Google only, with `hd` exactly `terpmail.umd.edu` or `umd.edu` and a verified email; no magic link. Real names and pictures come from Google at every sign-in and aren't editable here. People are keyed on their directory ID.
Revisit if: UMD changes its Google domains.

### Schedule works signed out
2026-09-26 · owner · app-wide
Sign-in is invited, never required, for the scheduler: "Sign in to join your class chats. Your plans sync too."
Revisit if: never on its own.

### A deleted account leaves nothing that names the person
2026-09-26 · agent · app-wide
After the week, the daily purge removes every row with the person's directory ID or addresses, their chat messages in every course object and their pictures. Reviews and feedback stay with no author, and reports with a random stand-in reporter, since moderation counts them. `PURGE_LEDGER` must list every table.
Revisit if: moderation needs to tell that two reports came from one deleted person, or the owner wants a deleted account's held reviews dropped.

### LLMs only in three places
2026-09-26 · owner · app-wide
Review summaries, their small generated chips, and moderation. No other LLM features.
Revisit if: the owner asks for one.

### AI features can be turned off
2026-09-27 · owner · app-wide
"some users really don't like AI. they should be able to disable our visible AI features like the reviews summarizer thing (which i really like, but again some prefer not to have it). there should likely be a little settings/dots thing on the box where it generates that allows you to disable them. then it should also appear in your account preferences." One pref, "Show AI summaries", on by default and following the account: in Settings, and as "Hide AI summaries" (with Undo) in every AI box's ⋯ menu. Off, no model is asked and nothing is left in the box's place. Every sparkles feature goes through `useAiFeatures()`.
Revisit if: never on its own.

### Moderation is model-first
2026-09-26 · owner · app-wide
Workers AI with Meta models screens reviews and chat; clean items publish on their own and only unclear ones reach the owner. Answers to graded work are held in reviews. Keep the human queue small.
Revisit if: the held share stays over 10% for a week.
(changed 2026-09-27: chat no longer holds answers, by the owner; see "Chat moderation is light, invisible and hard to spam".)

### Notifications stay few
2026-09-26 · owner · app-wide
Web push and email, managed at `/settings/notifications`: chat mentions and replies (plus an optional digest), seat watches (push and email by default) and Todo's "Due tomorrow". Don't add more types.
Revisit if: the owner asks for one.

### Notifications arrive better, not more
2026-09-27 · owner · app-wide
The same types, delivered through an inbox (a bell in the family bar), grouped pushes with counts, one badge number (unread in the inbox), a private calendar feed for dates, quiet hours 11pm–8am on by default with seat openings let through, message text shown by default, and no caps on delivery (the owner: "we should deliver all notifs if we say we have notifs so that it doesn't feel broken"; grouping keeps a busy chat calm). On iPhone the sender's name goes in the title: the avatar style is native-only. The owner, on the design: "that design doc looks incredible for the notifications". Spec: V2 §6.7.
Revisit if: people turn quiet hours or the inbox off in large numbers, or iOS opens communication notifications to web apps.

### Calendar feed links are derived, never stored
2026-09-27 · agent · one feature
The feed's token is an HMAC of the person's id and a random nonce under the R2 key (`keyedHash`); D1 keeps the nonce and the token's SHA-256. Settings can show the link again without storing it, and "Make a new link" is a new nonce. Chosen over a stored random token (a copy of D1 would hold every link), sealing it with Todo's key (ties the feed to Todo's secret) and a new link on every ask (would break calendars already subscribed). V2 §6.7 "As built".
Revisit if: the R2 key is ever rotated (every link changes with it), or a Worker secret for links is added.

### The badge counts unread groups, not events
2026-09-27 · agent · notifications
A group's unread rows (a room's mentions, a thread's replies, a term's seat openings) are one inbox item, and the bell and the app badge count items: "3 mentions in CMSC351" is 1, like the one notification it is on the phone. Rows read together stay one item. Spec: V2 §6.7 "As built".
Revisit if: people say the number feels too low for a busy room, or the owner wants events counted.

### Owner alerts come through quiet hours, within 5 minutes
2026-09-28 · agent · notifications
Urgent moderation items (the spam guard, a serious safety category, a reported threat) push and email each admin whatever the hour: they have no settings, and some can't wait for 8am. The every-5-minutes cron sends them rather than each place that queues an item, so one alert an hour groups what came in between ("Held for you: spam in 3 courses") and an item decided before it goes never alerts. Spec: V2 §6.7 "As built".
Revisit if: the owner wants to sleep through them, or 5 minutes is too slow for a credible threat.

### No session recording
2026-09-26 · owner · app-wide
No session recording anywhere ("creepy"): replay is off in code and in PostHog, and `/privacy` says so.
Revisit if: never on its own.

### Contact address is never plain text
2026-09-26 · owner · app-wide
Show "admin [at] terpsicle.com" and build the mailto link on click, in JS. Same rule everywhere the address appears.
Revisit if: spam stops mattering.

### The owner is the only admin
2026-09-26 · owner · app-wide
One admin and moderator, with a light `/admin`.
Revisit if: someone else moderates.

### Admins are a git-tracked file
2026-09-26 · agent · app-wide
`config/admins.txt`, one directory ID per line, instead of an env var, so changing admins is a reviewed commit.
Revisit if: admins change often.

### Previews sign in with test mode
2026-09-26 · agent · app-wide
PR previews and localhost use fixture people instead of Google (no wildcard redirect URIs, and previews run unreviewed code). Never on terpsicle.com.
Revisit if: Google allows preview redirect URIs safely.

### The JSON API is plain Worker routes
2026-09-25 · agent · app-wide
`/api/*` is a route table in `src/server/api/router.ts`, not `createServerFn`: it runs in the worker test pool against real bindings, sees the raw request for rate limits, and keeps Worker types out of the app.
Revisit if: server functions gain those, or the table gets in the way.

### Page size is informational
2026-09-26 · owner · app-wide
Bundle totals are reported, not enforced; the never-eager rules (modules that must stay lazy) still fail CI.
Revisit if: first loads get noticeably slow.

### Public pages are cached at the edge, with hashed scripts
2026-09-26 · agent · app-wide
Pages whose HTML is the same for everyone (the public Reviews pages today) go out `s-maxage=600, stale-while-revalidate=86400` and Workers Cache keeps them, keyed by Worker version; signed-in requests are never stored. A cached page can't share a CSP nonce, so its policy lists its inline scripts' hashes instead.
Revisit if: a public page starts to depend on who's asking.

### Static pages don't pull in the app
2026-09-26 · agent · app-wide
`/`, `/privacy` and similar pages link to `/signin` rather than rendering the account button, and import auth modules directly, never through the `~/features/auth` barrel.
Revisit if: `v2/schedule-routes` makes route splitting handle it.

### Tooltips on controls, not on menu options
2026-09-27 · agent · app-wide
Every control on a page has a tooltip through `WithTooltip`, and `e2e/tooltips.spec.ts` fails on one without. The items of an open menu or listbox don't need one: their text is their whole label, the trigger that opened them has the tooltip, and one per option would cover the next. An item whose label doesn't say enough still gets one (side `left`).
Revisit if: people hover menu items looking for more, or the owner wants tooltips on every option.

### Every kit control is 44px on phones
2026-09-27 · agent · app-wide
Below `md`, `Button` (every size), `SelectTrigger` and menu and select items are 44px, like `Input` and `SegmentedControl` already were. Pages don't add `max-md:h-11`. Chat, Todo and Plan had each hand-rolled this, and Schedule and Settings had 28–32px targets, so one product felt roomy and the next cramped. The cost is taller rows on phones (Problems' Switch, Generate's fields).
Revisit if: a phone screen can't fit its content at 44px, or the calendar's own controls need the same rule.

## Schedule

### Scheduler views are routes, kept mounted by the sidebar
2026-09-27 · agent · one feature
Each rail tab and drill-in is a route (`/schedule/search`, `/schedule/course/CMSC351?tab=search`) that the router splits, preloads and keeps in history. The sidebar renders their components itself instead of an `<Outlet />`, so panels and drill-in levels stay mounted (scroll, typed text, focus to return to). The term, open plan and Search's text stay in stores too (saved state, undo, a box that never waits on the router), written to the URL and following it on Back.
Revisit if: the router can keep an outlet's past matches mounted (React's `<Activity>` through it), or a view needs no memory across Back.

### Back, not breadcrumbs
2026-09-26 · owner · one feature
Drill-ins get one "Back" to where you came from; drilling course to course doesn't stack crumbs.
Revisit if: people get lost in deep drill-ins.

### One section list, grouped by professor
2026-09-26 · owner · one feature
Every course, one section or ninety, shows the same section rows, grouped only by professor (no header with one), sorted by section code, and every row shows all its meetings. No lecture layer.
Revisit if: a course shape makes this unreadable.

### Add sections, bookmark courses
2026-09-26 · owner · one feature
You add a section (plus button on its row), never a course. Considering a course is "Bookmark". Full sections can be added; the plan's "full" problem offers "Watch for a seat".
Revisit if: never on its own.

### Seat watch is signed in
2026-09-26 · owner · one feature
Called "Seat watch" ("Watch for a seat", "Watching"), signed in, by push and email; signing in is part of the fix when signed out.
Revisit if: signed-out people ask for it.

### Wildcards, one matcher
2026-09-26 · owner · one feature
Generate and Plan take `CMSC4XX`-style patterns and GenEd wildcards ("any DSHS"), through one shared matcher in core. (changed 2026-09-28: every course search box reads patterns through it too, and a short one is a prefix, so "cmsc4x" is CMSC4XX; owner: "x's should be treated like wildcards".)
Revisit if: a third product needs them differently.

### One course search in every product
2026-09-28 · owner · app-wide
"Course search bars should be unified somehow … so that familiarity carries over." Schedule's Search, Plan's Search and Generate's course field share one engine, box, chip line, result row and set of keys; each matches on the data it has loaded and says nothing about what it lacks. A new course search starts from `CourseSearchField` and `CourseResultRow`.
Revisit if: a product needs a search people use differently (Reviews and Chat's finders are next to move onto it).

### Filter tokens need no prefix, and only name chips
2026-09-28 · agent · one feature
A GenEd, a level ("400s") or credits ("3cr") typed in a course search becomes its chip on space or Enter, with no `is:` or `#` to learn (the owner asked for "DSNS" as typed). So only words that can't be a title's are tokens: GenEd codes that aren't departments, and numbers with their unit. "open" and "online" stay text, since titles use them.
Revisit if: people type a token by accident, or ask for Open seats and Fits my plan by typing.

### Sorting uses only what's loaded
2026-09-28 · agent · one feature
Search sorts by instructor rating and open seats with the seats file and whichever departments' PlanetTerp files are already loaded, never a fetch per row or per department (owner: "not extra network calls"). The rating option says how many departments it knows, and unrated courses go last.
Revisit if: people sort by rating often and find it thin; a small all-departments ratings file would fix it.

### Generate starts with the open plan's courses
2026-09-27 · agent · one feature
An untouched Generate form shows the open plan's courses (placed required, bookmarked optional), derived and never stored, so a list someone has changed or emptied always wins. It bends DESIGN §5's "don't prefill" because these are the person's own courses, not guesses: an empty form with a disabled button read as broken to someone who already had a plan (QA round 1, S16).
Revisit if: people mostly clear the prefilled list before generating.

### Returning people skip marketing
2026-09-26 · owner · one feature
First visits to `/` see the marketing page; anyone with saved plans or a session goes to `/schedule`, and the installed app starts there.
Revisit if: the marketing page gets something returning people need.

### Install prompt after key moments
2026-09-26 · owner · one feature
A dismissible dialog after the first sign-in, joining a chat or turning on a watch; remembered, with a long cooldown, never a banner, never when installed.
Revisit if: it annoys people.

### Plan sync saves whole docs
2026-09-26 · agent · one feature
Plain server-side storage, one JSON doc per plan with a rev and compare-and-swap. A conflict never merges: the server's copy stays and the local one becomes "<name> (copy)".
Revisit if: people hit conflicts often.

### Four-year plans sync through the scheduler's engine
2026-09-27 · agent · one feature
One engine, one pull cursor and one set of flags for plans, settings and four-year plans. It runs on whichever page is open (the scheduler, or Plan at `/plan`) with that page's store, and keeps the other product's docs in IndexedDB, so neither page can skip a kind and lose it. (changed 2026-09-27: Settings, Reviews and Chat run it too while signed in, with no store, for the synced prefs.)
Revisit if: a third product needs sync, or loading the whole engine on Plan costs too much.

### Other products' prefs ride the settings doc
2026-09-27 · agent · one feature
Prefs that aren't Schedule's (AI features, Chat's room rules seen) are one `prefs` object in the settings doc and one `prefs` row on the device. It's loose, so every build carries keys it doesn't know, and a conflict settles it per product key, like a course's color. Schedule never edits it but always pushes it whole. Every page reads a localStorage copy (Reviews loads no IndexedDB up front), which whatever writes the row keeps current.
Revisit if: a pref needs merging inside its own key, or a pref must be read on the server.

## Reviews

### Anonymous reviews, signed-in writers
2026-09-26 · owner · one feature
Anyone reads; writing needs sign-in. Readers, moderation and the admin never see the author.
Revisit if: never on its own.

### Full reviews live at /reviews
2026-09-26 · owner · one feature
The scheduler's course details keep the numbers, the summary and a link; reading and writing reviews happen at `/reviews`.
Revisit if: people don't find reviews from the scheduler.

### Search markup never borrows PlanetTerp's ratings
2026-09-26 · agent · one feature
JSON-LD `aggregateRating` appears only on course pages and only from Terpsicle's own published reviews: Google forbids ratings aggregated from other sites, and Person isn't a review-snippet type. Instructor pages carry Person and BreadcrumbList markup only, and `?course=` views canonicalize to the instructor's page. No `review` items either: Google requires each one's author, and ours have none on purpose. (Checked again 2026-09-28, when our reviews started rendering on the server, so the rating's reviews are on the page as the guidelines require.)
Revisit if: PlanetTerp agrees to let us use its ratings, or Google's rules change.

### PlanetTerp reviews are shown, marked as theirs
2026-09-28 · owner · one feature
"let's actually display reviews from planetterp; i'm going to say it's okay." Their reviews appear among ours, newest first, each with a "PlanetTerp" chip (tooltip and link), no author. The nightly PlanetTerp job keeps them in D1 and rewrites only the instructors whose reviews changed. (changed 2026-09-28: "PlanetTerp text stays off" said text waited on PlanetTerp's OK.)
Revisit if: PlanetTerp asks us to stop.

### Reviews pages live one level under /reviews
2026-09-28 · owner · one feature
`/reviews/kruskal` and `/reviews/cmsc351`, not `/reviews/instructors/…` ("too much to look normal when showing up on google"). A course code's pattern tells the two apart; an instructor's address is PlanetTerp's slug with a hyphen for its underscore (`goldman-aaron`), since search engines read a hyphen as a space. The old addresses move with a 301.
Revisit if: an instructor's slug ever matches a course code, or `/reviews/<word>` is needed for a page of ours.

### Reviews before grades, and Reviews reads as a public site
2026-09-28 · owner · one feature
"reviews are more important to display than grades"; instructors and courses are equals. Reviews' pages use the kit's `display` sizes (bigger type, roomier sections), the product's purple as an accent, and a bar with no rule until the page scrolls.
Revisit if: the other products want a public page too.

### Published review numbers carry a month, never a time or text
2026-09-26 · agent · one feature
R2's `reviews/` files hold ratings, counts and `latestReviewMonth` (`YYYY-MM`), not V2 §7.6's `latestReviewAt`: an exact publish time beside an instructor would undo the month rounding readers see. Summaries count our newest review by month for the same reason, and go stale when our published count changes.
Revisit if: readers need finer freshness than a month.

## Chat

### Real names, pre-made rooms
2026-09-26 · owner · one feature
Real names and Google pictures, no pseudonyms. Rooms come from the catalog (a course room, a room per professor when there's more than one, section rooms, no lecture rooms), your rooms from your synced plan, and nothing's stored until a room's first message.
Revisit if: rooms feel empty or noisy.

### One Durable Object per course per term
2026-09-26 · owner · one feature
`CourseChat` holds a course's messages and sockets; it's the one Durable Object class we run.
Revisit if: a course's traffic outgrows one object.

### Chat reads the server's plans, not the device's
2026-09-26 · agent · one feature
`/chat` gets your rooms from your synced plans (`sync/pull`) and the catalog from `/data`, never from the scheduler's stores, because the server grants rooms from synced plans and `/chat` stays light. A plan that hasn't synced yet has no rooms.
Revisit if: people expect rooms before their plan syncs.

### Mock mode runs Chat with stand-in models
2026-09-26 · agent · one feature
`pnpm dev:mock` seeds local R2 with the mock catalog and screens chat with offline stand-ins for the models (`MODERATION_OFFLINE`, test mode only), so e2e can run two people against the real socket. Only the rules hold anything there.
Revisit if: e2e needs to cover a model's own verdict.

### Chat moderation is light, invisible and hard to spam
2026-09-27 · owner · one feature
"i just don't want any *really* nasty things there. i mostly want to make sure that it's not abused in ways like spamming something in a million different course channels … sending a phone number to coordinate a study group, that should be perfectly fine, or links out to resources … this should mostly be transparent to the user … they should have the option to report other's messages for abuse only. something like sharing answers should be disencouraged but i'm not trying to be a narc." So chat stops only slurs, blocked words, Llama Guard's serious categories, attacks on a person, someone else's private details and clear spam, plus a cross-room spam guard (the same text in 3+ courses in an hour, or 13+ messages across 5+ courses in 10 minutes; one course's rooms count once), held urgent for the owner. The author sees nothing unless a message is really held; reports are abuse-only; answers get a kind room rule and a one-time nudge (docs/MODERATION.md).
Revisit if: never on its own.

### Mentions come from the text
2026-09-27 · agent · one feature
The object finds "@Name" in a message's text among the room's members each time it's published, instead of the client sending a list of user ids. Nothing new in the protocol or the message rows, and a mention can only reach someone who can read the room. The digest reads message text from the object, so D1 never holds it.
Revisit if: two members of a room share a full name often enough that mentions go to the wrong person.

## Plan and Todo

### Plan and Todo, requirements later
2026-09-26 · owner · one feature
Both are approved. Plan's first release has no degree requirements and no major quirks.
Revisit if: the owner starts the requirements work.

### Transcripts stay in the browser
2026-09-28 · owner · one feature
A pasted transcript is read in the browser and held only in memory until the import is done or you leave; it's never stored, sent, logged, put in the URL or in analytics. Only the imported courses are saved (each one's code, transcript title and kind, term, credits, GenEds, and grades if kept). The owner: "i assume we don't save the transcripts themselves for privacy reasons (and should actually be sure of it)".
Revisit if: never on its own.

### Transfer credit says what it counts as, and keeps its own title
2026-09-28 · agent · one feature
Credit Testudo gives as a level ("CHEM 1XX") or an elective ("LTR", "XXX 1XX") stays a `credit` entry with its transcript title, credits and GenEds. "Counts as" adds the UMD course it meets prerequisites and repeats as, rather than turning it into that course, so the check step's mapping does the same, and the GenEds stay what UMD granted. The person's answer (a course, or none) outlives a re-import of the same credit. A code Testudo doesn't list gets "Counts as" through its course info.
Revisit if: people want the course's own GenEds and "or" choices on mapped credit, or a real transcript prints transfer credit differently.

### Plan is listed once PLAN_ENABLED is on
2026-09-26 · agent · one feature
`/plan` works for anyone who opens it, since it needs no server, but the product menu and the site header list Plan only when `PLAN_ENABLED` is on (or while you're in it). The flag waits, unlike "Ship it"'s screens-land rule, because it also opens four-year sync pushes, which V3 §11 turns on after `v3/four-year-sync`, `v3/e2e` and the owner's trial. The manifest's shortcut and `/`'s returning path to `/plan` wait with it, since both are static.
Revisit if: Plan turns on in production; then list it always and add the shortcut.

### Plan and Schedule share one sidebar width
2026-09-27 · agent · one feature
The two workbenches draw one sidebar, so they keep one width: Plan reads and writes `UiPrefs.sidebarWidth`, changing only that field in a transaction, without loading the scheduler's stores (`src/state/sidebar-width-pref.ts`). A width of Plan's own would have needed a second CSS variable and head script, and would flash the scheduler's width first. A scheduler open in another tab can put its older width back, which is the worst a race does; Plan's other prefs stay in their own row for that reason.
Revisit if: people want different widths in each product.

### Gradescope, honestly
2026-09-26 · owner · one feature
Todo never stores an ELMS or Gradescope password, never automates a login, and never fetches gradescope.com.
Revisit if: Gradescope offers students an API or feed.

### No Gradescope detection
2026-09-28 · owner · one feature
Todo leaves Gradescope out entirely: no tag on items whose ELMS entry mentions gradescope.com, no note about extensions, and descriptions aren't read at all. The owner: "the gradescope integration doesn't sound like it's anything like i thought we might be able to do (hooking in directly and seeing those in there) so i think we just leave that sort of detection or whatever completely ommitted." Gradescope work linked in ELMS still comes through the feed like any assignment, and dropping a calendar file stays. This replaces "Gradescope through ELMS and files" (2026-09-26). The D1 columns `todo_items.exam` and `gradescope` stay, unused, until a later migration drops them.
Revisit if: Gradescope offers students an API or feed.

### No exam marking
2026-09-28 · owner · one feature
Todo marks no item as an exam. The owner wasn't sure how exams were marked and asked to keep it only if it's plain from the ELMS feed and the calendar shows it clearly; the feed never says which items are exams (it was a keyword guess on the title that called "Final exam review session" an exam), so it goes.
Revisit if: ELMS's feed starts saying what an item is beyond assignment or event.

### Todo is a calendar
2026-09-28 · owner · one feature
Todo's main view is a calendar: the week by default, then the month and a list, each a URL, with weeks starting Monday "since so many things are due sunday nights" and a synced pref for Sunday. It takes the workbench's shape with a side panel (adding a task in plain words, each course's weekly completion, ELMS); the by-course view and the list-first page are gone. The owner, after watching a first-time user: "i thought the new todo features didn't ship because it was so hard to notice them." The side panel has no tabs (the agent's call): four short parts fit one column, and a rail would hide the composer.
Revisit if: the side panel grows past what one column holds.

### Todo reads tasks with its own grammar
2026-09-28 · agent · one feature
The composer's dates, times and courses come from a small parser of our own (`src/core/todo/quick-add.ts`), not chrono-node: students type a few forms, the composer needs each match's place in the text to mark it, courses are ours to match, and New York's clock is tested there rather than the browser's zone. It adds nothing to `/todo`'s bundle.
Revisit if: people type forms it misses often enough to show in feedback.

### Own tasks in Todo
2026-09-27 · owner · one feature
Todo takes tasks you type ("Add a task…"), kept in D1 per person and never sent to ELMS, beside the feed's items. This changes V3 §3.1, which left own todos out of the first release. The owner, after Better Canvas and Tasks for Canvas: "i kind of want you to just go off and implement anything that seems like it would be obviously really good for us to have based on that ... we don't want to make an extension ourselves, just have cool stuff that they have."
Revisit if: never on its own; the owner decides.

### ELMS feeds come from umd.instructure.com
2026-09-27 · agent · one feature
`parseFeedLink` still takes a feed link on `elms.umd.edu`, but moves it to the same path on `umd.instructure.com` before anything fetches or stores it: `elms.umd.edu` is UMD's landing page and answers 404 for every feed. Redirects and item links still pass on either host (`isElmsUrl`). Connecting waits 25 seconds for the first fetch, since the person is watching and Canvas builds a whole feed as it's asked; the cron and refresh keep 10.
Revisit if: UMD moves Canvas to another host, or `elms.umd.edu` starts serving feeds.

## Feedback

### Feedback without surveillance
2026-09-26 · owner · one feature
One sheet, "Report a bug" or "Suggest a feature", with "Include what I was doing" and a screenshot on by default and a quiet note when off. Never included: secrets, other people's words, transcript grades. GitHub issues carry no person's text.
Revisit if: reports turn out too thin to act on.

### Pinned notes for the owner
2026-09-26 · agent · one feature
The feedback sheet's admin-only "Pin a note" mode stores notes on elements of a deployment, pulled by agents with `scripts/feedback.ts`.
Revisit if: the owner prefers another way to leave notes.

### Feedback reads the session without needing one
2026-09-26 · agent · one feature
`feedback/send` and `feedback/undo` are `auth: "optional"` routes: same-origin like signed-in routes (they write), with the session when there is one (for the reply toggle and the per-person limit), never a 401. The inbox shows whether a reply may go, never to whom.
Revisit if: another route needs the same, or feedback needs sign-in.

### Send feedback on a workbench's phone bar
2026-09-27 · agent · one feature
On phones a workbench's bar (the scheduler's, and Plan's since `v3/plan-workbench`) has no room for another button beside the plan's name and its context, so "Send feedback" is an item in its account menu there, as the theme toggle is. Every other product's header shows the icon, with the wordmark hidden on phones to make room.
(changed 2026-09-27: Plan moved onto the workbench, and its phone bar is the scheduler's compact one.)
Revisit if: the phone top bar is redesigned.

### Feedback groups by Workers AI, issues without words
2026-09-27 · agent · one feature
"Group similar" and the daily job send open feedback's words to Workers AI (the small Llama chat's policy check uses) to group items about the same thing; each run replaces the open items' groups. "Open GitHub issue" carries only where to look (kind, product, route pattern, version, a link back), never the person's words, plan or screenshot. `scripts/feedback.ts` reads production D1 and R2 remotely, and writes only where it's told.
Revisit if: groups turn out wrong often, or feedback grows past what one model call can sort.

### Push on before the device check
2026-09-27 · owner · one feature
Web push is on in production without waiting for the planned iPhone and Android trial; the owner checks real devices live. The VAPID pair was rotated when it went on (no device had subscribed), with the private key piped straight into the Worker secret, never printed.
Revisit if: pushes fail on a real device, or the pair is rotated again (every subscription breaks).

## Process

### Ship it, drafts when asked
2026-09-26 · owner · app-wide
Merge every green PR without waiting, and turn a product's flag on in production when its screens land. Anything the owner wants to try first is a draft until the owner says otherwise. Agents never enable auto-merge.
Revisit if: the owner wants to review before merges.

### One product, then more features
2026-09-27 · owner · app-wide
The goal after the in-flight work is cohesion: every product in one frame, built from one shared kit, with the same first-visit, empty, loading, error and undo patterns (`docs/COHESION.md`). The orchestrator builds the frame and the kit itself, and at most two other sessions run at a time, on parts of the code that don't overlap.
Revisit if: the checklist in COHESION.md is done and a full first-time round finds nothing worth fixing.

### "As built" goes in the PR body
2026-09-27 · agent · process
A PR's "as built" notes go in its body. `DATA.md`, `STATUS.md`, `V2.md` and `V3.md` change only when a contract changes (a schema, storage, an API or a flag). Parallel PRs kept colliding in those files.
Revisit if: agents start missing contract changes that the docs used to catch.

### The family bar
2026-09-27 · agent · app-wide
Every page has one bar: the five products as labeled tabs from 1100px (the product menu below that), the product's context, then Feedback and one account menu, which holds the theme. This beats a menu-only switcher, because cohesion and cold arrivals are the goal (docs/COHESION.md §4).
Revisit if: a sixth product arrives, or the scheduler's bar can't fit its term and plans beside the tabs at 1100–1300px.

