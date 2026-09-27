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
The Ink variation with grain, Flexoki colors and Bricolage Grotesque, square corners with small offset shadows; a black box never gets a black offset. The Pixel star icon set is locked, kept as swappable SVGs. Tokens are in `docs/DESIGN.md` §7.
Revisit if: the owner refines the brand.

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

### Moderation is model-first
2026-09-26 · owner · app-wide
Workers AI with Meta models screens reviews and chat; clean items publish on their own and only unclear ones reach the owner. Answers to graded work are held. Keep the human queue small.
Revisit if: the held share stays over 10% for a week.

### Notifications stay few
2026-09-26 · owner · app-wide
Web push and email, managed at `/settings/notifications`: chat mentions and replies (plus an optional digest), seat watches (push and email by default) and Todo's "Due tomorrow". Don't add more types.
Revisit if: the owner asks for one.

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

## Schedule

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
Generate and Plan take `CMSC4XX`-style patterns and GenEd wildcards ("any DSHS"), through one shared matcher in core.
Revisit if: a third product needs them differently.

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
One engine, one pull cursor and one set of flags for plans, settings and four-year plans. It runs on whichever page is open (the scheduler, or Plan at `/plan`) with that page's store, and keeps the other product's docs in IndexedDB, so neither page can skip a kind and lose it.
Revisit if: a third product needs sync, or loading the whole engine on Plan costs too much.

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
JSON-LD `aggregateRating` appears only on course pages and only from Terpsicle's own published reviews: Google forbids ratings aggregated from other sites, and Person isn't a review-snippet type. Instructor pages carry Person and BreadcrumbList markup only, and `?course=` views canonicalize to the instructor's page.
Revisit if: PlanetTerp agrees to let us use its ratings, or Google's rules change.

### PlanetTerp text stays off
2026-09-26 · owner · one feature
PlanetTerp numbers show with credit; storing their review text waits until PlanetTerp agrees.
Revisit if: PlanetTerp agrees.

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

### Mentions come from the text
2026-09-27 · agent · one feature
The object finds "@Name" in a message's text among the room's members each time it's published, instead of the client sending a list of user ids. Nothing new in the protocol or the message rows, and a mention can only reach someone who can read the room. The digest reads message text from the object, so D1 never holds it.
Revisit if: two members of a room share a full name often enough that mentions go to the wrong person.

## Plan and Todo

### Plan and Todo, requirements later
2026-09-26 · owner · one feature
Both are approved. Plan's first release has no degree requirements and no major quirks.
Revisit if: the owner starts the requirements work.

### Plan is listed once PLAN_ENABLED is on
2026-09-26 · agent · one feature
`/plan` works for anyone who opens it, since it needs no server, but the product menu and the site header list Plan only when `PLAN_ENABLED` is on (or while you're in it). The flag waits, unlike "Ship it"'s screens-land rule, because it also opens four-year sync pushes, which V3 §11 turns on after `v3/four-year-sync`, `v3/e2e` and the owner's trial. The manifest's shortcut and `/`'s returning path to `/plan` wait with it, since both are static.
Revisit if: Plan turns on in production; then list it always and add the shortcut.

### Gradescope, honestly
2026-09-26 · owner · one feature
Todo never stores an ELMS or Gradescope password, never automates a login, and never fetches gradescope.com.
Revisit if: Gradescope offers students an API or feed.

### Gradescope through ELMS and files
2026-09-26 · agent · one feature
Gradescope items linked in ELMS get a "Gradescope" tag from the ELMS feed; the fallback is an `.ics` the student drops in, read in the browser.
Revisit if: UMD's Gradescope setup changes.

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

### Push on before the device check
2026-09-27 · owner · one feature
Web push is on in production without waiting for the planned iPhone and Android trial; the owner checks real devices live. The VAPID pair was rotated when it went on (no device had subscribed), with the private key piped straight into the Worker secret, never printed.
Revisit if: pushes fail on a real device, or the pair is rotated again (every subscription breaks).

## Process

### Ship it, drafts when asked
2026-09-26 · owner · app-wide
Merge every green PR without waiting, and turn a product's flag on in production when its screens land. Anything the owner wants to try first is a draft until the owner says otherwise. Agents never enable auto-merge.
Revisit if: the owner wants to review before merges.
