# Terpsicle v2: plan (research history)

> **Superseded.** The final product decisions are in [`SPEC.md`](SPEC.md) and the engineering plan is in [`BUILD.md`](BUILD.md). This document is kept for its research and sources; where it disagrees with those, they win.

> The class scheduler the original Terpsicle was supposed to be. No degree audit, nothing CS-specific.
> Written 2026-09-25, based on the original Excalidraw brainstorm (appendix A), the `dev` branch, and research into UMD data sources, other schools' schedulers, and the current tooling. Research sources are in appendix B.

---

## 1. Vision

**One tab that replaces Testudo, Venus, PlanetTerp, RateMyProfessors, the campus map and your notes app during registration.**

Terpsicle should feel like Linear: fast, dense, keyboard-first, and good looking. Opening it should feel like opening a tool, not a website.

Three principles decide most tradeoffs:

1. **Instant.** The whole term's catalog lives on the client, so search, the calendar and the generator make no network round trips. Target under 16 ms per keystroke and under 200 ms to generate schedules.
2. **Honest.** Every problem with a schedule shows up as a problem: overlaps, walks you can't make, full sections, final-exam clashes, restricted seats. The app never quietly hides one.
3. **No account needed.** Everything works locally and anonymously. Accounts only add sync and alerts.

### Not doing
- Degree audit, transcript parsing, 4-year plans, anything major-specific. Delete `app/audit`, `app/degree`, `app/transcript` and `lib/transcript-parser.ts`.
- Auto-registration or seat-sniping bots. UT Austin refused this on fairness grounds, and it's how you get blocked.
- Our own review system at launch. Pull ratings from PlanetTerp instead of splitting the review ecosystem.

Gen-ed filtering stays. Gen-eds are university-wide attributes of a course, not a degree audit.

---

## 2. The competition

**Jupiterp** (jupiterp.com) is the one to beat. It is active: commits in September 2026, an org (`Jupiterp-UMD`), and a public API. It already has:
- search with PlanetTerp and RateMyProfessors ratings;
- multiple schedules;
- a generator with required and optional courses, pins, filters, and one-click relaxation hints when nothing fits;
- ICS export.

It is AGPL-3.0, so **we can't copy its code**, and its sections refresh only every 30 minutes.

Matching Jupiterp isn't enough. We win on:

| Area | Terpsicle v2 | Current tools |
|---|---|---|
| **Walking** | Real campus routing from UMD's own GIS network, including an accessible (step-free) mode, drawn between classes and used by the generator | Nobody at UMD does this well |
| **Problems panel** | A linter for your schedule: overlaps, walks, seats, restrictions, final exams, credit load | Scattered or missing |
| **Registration day** | Near-live seats, fill-speed history, Plan B that shares as many sections as possible with Plan A, one-click copy of section codes, seat alerts | Partial (Coursicle charges for alerts) |
| **UX** | Every section of a course shown on the calendar at once, click one to switch; one obvious place for each kind of information; undo instead of "are you sure?" | Hover lists, scattered info, dated |
| **Final exams** | Exam-clash detection from registrar data | Nobody |

**Decided:** we use no Jupiterp data or code; everything comes from our own scrapers. PlanetTerp is fine to use (ratings, reviews, grades).

---

## 3. Features

Section IDs (F1, F2, …) are referenced by the roadmap in §8.

### F1. Core builder
**Principle: one home for each kind of information, and one way to open things.** Round one of the prototype showed the same course info in three places, and people couldn't tell where to look. So:

| You want to… | It lives in | Opened by |
|---|---|---|
| See your week | The calendar (always visible) | – |
| Manage plans (new, rename, duplicate, delete) | Plan tabs in the top bar | – |
| See what's in this plan, and courses saved for later | **Plan** tab | `1` |
| Find a course | **Search** tab | `2` or `/` |
| Know what's wrong | **Problems** tab (count also in the top bar) | `3` |
| Travel time settings and connections | **Travel** tab | `4` |
| Keep time free | **Blocks** tab | `5` |
| Get your plan out | **Export** tab | `6` |
| Everything about one course (sections, instructors, grades, description) | **Course details**, one place only | Clicking the course *anywhere*: calendar, plan list, search result, problem |
| Everything about one connection between classes | **Connection details** | Clicking a travel pill, a Travel row or a problem |

Where "details" open is the open design question (see `prototypes/app-shell`, round 2: drill in, side by side, on the right, pop over). Everything else above is settled.

- **Layout:** top bar with plans · labeled left rail (icon + word, not icons alone) · one sidebar panel · calendar. No permanent right panel.
- **Plans** (the name stuck): tabs in the top bar; double-click to rename; a menu for rename, duplicate and delete; `+` for a new empty plan. Every change is undoable (`⌘Z` and an Undo button in the toast), so nothing needs a confirmation dialog.
- **The signature interaction: see every section at once.** Opening a course shows all its other sections as dashed ghosts on the calendar. Each ghost says whether it's full or overlaps something; click one to switch. Hovering a section row (or pressing `↑`/`↓`) previews it solid; `↵` switches. A one-line hint strip above the calendar explains this while it's active.
- **Every section row answers "does it fit?"** in words: *Fits*, *Overlaps ENGL393*, *Not enough time after CMSC330*, *In your plan*. That makes search and details useful without checking the calendar.
- **Search.** Course code, title or instructor, plus gen-ed filter buttons. Each result says how many of its sections fit your plan. No filter syntax to learn.
- **Custom blocks.** Work, gym, lunch, "don't touch". Blocks can have a **place**, such as "Work at McKeldin" or "Dorm: Oakland Hall", so travel time includes them.
- **Saved for later.** Courses you're considering but haven't placed, listed under the plan. The generator uses them as input.
- **Online classes with no set time** get their own strip above the calendar, so they're visible and not forgotten.
- **Top bar shows only credits and problem count.** Weekly walking totals were dropped: real walking depends on dorms, dining halls and everything else outside the plan.

### F2. Travel time (flagship)
User-facing name: **travel time**, not walking, so it fits everyone however they get around. The tab is "Travel", the pills say "6 min" with a route icon, and statuses are words: *Plenty of time*, *Tight*, *Not enough time*.

This builds on the `dev` branch's `lib/gis.ts`, which calls UMD's own ArcGIS routing network (`gis.umd.edu/.../Navigation/DynamicRouting`, including a `DynamicRoutingAccessible` variant). That beats OSM routing, because UMD's network knows real paths, building entrances and step-free routes.

- **Precompute offline, never at runtime.**
  - Once per term, a script builds a **building × building matrix** of walking distance for every building that hosts a class section. Expect about 100–150 buildings, so about 10–20k ordered pairs.
  - There are two matrices: standard and accessible.
  - Each pair is shortest over *all non-emergency entrances* (layer 13). That's what your Closest Facility call already does.
  - Batch several incidents and facilities per solve, throttle to about 2 requests per second, and cache pair results forever in R2 so re-runs only fill gaps.
  - Check whether their NAServer also exposes an OD Cost Matrix solver; that would do this in far fewer calls.
  - Store feet. Convert to minutes on the client with the user's pace (default 3.0 mph = 264 ft/min; `dev` used 287).
  - **Fallback:** if UMD's GIS changes or locks down, rebuild the matrix with OSRM's `foot` profile on OpenStreetMap. The matrix format stays the same.
- **Joining the data.** SOC gives 3-letter codes (IRB). Testudo's `/soc/buildings/{CODE}%20{ROOM}` popup maps a code to a building number (IRB → 432). UMD's public ArcGIS `BuildingAllSearch` layer maps that number to coordinates and footprint, and GIS `LOCATIONID` uses the same number. The mapping is checked into the repo as `buildings.json`, with a failing CI check for any building code in the catalog that has no mapping.
- **UMD's passing time:** 10 minutes on MWF (50-minute classes on the hour), 15 minutes on TuTh (75-minute classes). The app shouldn't hard-code this; it compares walk time with the *actual* gap.
- **Features:**
  - **Travel pills** between back-to-back classes on the calendar ("6 min"). Neutral when there's time, amber when tight (needs ≥ 75% of the gap), red when there isn't enough time. Hover for the numbers; click for connection details.
  - **Travel tab settings,** like the Transit app: pace (Slower 2.5 mph / Typical 3.0 / Faster 3.5), **step-free routes** (switches to the accessible matrix; ramps, elevators, accessible entrances), and extra time per trip (none, +2, +5 min).
  - **Show the math.** The Travel tab and every connection show how the estimate was made: "IRB → TWS: 0.89 mi ÷ 264 ft/min = 18 min", plus a plain note that it doesn't know about crowds, weather or slow elevators.
  - **Connection details:** leave/arrive times and places, distance, the estimate, the verdict ("You'd be about 8 min late"), and **sections that fix it**, each previewable on the calendar.
  - **Problems panel entries** such as "Not enough time to get from CMSC330 to ENGL393 · 18 min needed, 10 min between classes · Mon, Wed".
  - **Maybe later:** a simple map of one day's route. The prototype showed that a list of connections answers the real question faster than a map does.
  - **Generator integration:** "enough time between classes" is a hard constraint by default, and travel time is a scoring term.
  - **Room-level padding:** a small constant for big buildings, such as 1 extra minute when the room is at floor 3 or higher. Room numbers encode the floor. Optional polish.

### F3. Generator
This is the recommendation engine from the original doc, done as a solver instead of Venus's wall of results.

- **Inputs (per course):**
  - Required or optional.
  - "k of these N", e.g. "any 1 DSSP gen-ed from my favorites".
  - Any section, a locked section, professor X only, or excluded sections.
- **Global constraints (chips):**
  - earliest start and latest end;
  - days off;
  - blocked times (from custom blocks);
  - minimum gap;
  - lunch window;
  - credit range;
  - open seats only;
  - no impossible walks;
  - max classes in a row.
- **Algorithm.** Runs in a Web Worker and streams results.
  1. Compile every section's meetings into per-day bitmasks of 5-minute slots, 8am–10pm (168 slots, six 32-bit words per day), so a conflict check is a few ANDs.
  2. Apply per-section filters first.
  3. **Merge equivalent sections** that share times, buildings and anything else used for scoring. The UI shows them as "×4 equivalent (profs: A, B)". This cuts the search space by orders of magnitude (the GT Scheduler trick).
  4. Order courses fewest-candidates-first. Search depth-first with forward checking and a step budget of about 1M steps.
  5. Keep a **top-K heap by score** rather than enumerating everything and sorting.
  6. **If nothing fits:** (a) *relaxation hints*: try dropping or loosening each constraint and report "Allow classes before 9am → 38 schedules"; (b) *fewest-conflicts* mode that shows the best near-misses with the conflicts highlighted.
- **Scoring presets** (with sliders under "Custom"):
  - Compact: least first-to-last span per day.
  - Days off.
  - Late starts.
  - Best professors (PlanetTerp rating).
  - Kindest grading (average GPA).
  - Least walking.
  - Safest seats: maximize the fewest open seats in any chosen section, so the schedule survives registration.
- **Results UI.**
  - A gallery of calendar thumbnails, with j/k to page.
  - The main calendar previews the selected result, with **changes from your current schedule highlighted**.
  - Each result has score breakdown chips.
  - "Pin this section" from any result adds a constraint and re-solves live.
  - "Apply" copies the result into a new or existing schedule.
- **Priority-list mode** (Hyperschedule-style) as an alternative to generating. Order your cart; starred courses are always placed; the rest fill in top-down if they fit. Some people prefer steering to browsing.

### F4. Course and professor intelligence
- **Course inspector:**
  - description and credits;
  - gen-eds (showing the OR groups);
  - prerequisite and restriction text, highlighted but not parsed into rules (no audit);
  - cross-listings;
  - a grade distribution chart;
  - a PlanetTerp rating per professor;
  - a syllabus link where SOC has one.
- **Section rows:**
  - instructors;
  - seats, waitlist and holdfile;
  - delivery badge (in person, blended, online sync, online async);
  - section notes (e.g. "Restricted to Freshmen Connection") shown prominently.
- **Professor inspector:** rating, average GPA across courses, courses this term, grades over time, and a link to PlanetTerp reviews.
- **Review summaries** (LLM, cached): "Consistently described as clear lecturer, hard exams, generous curve", with a count of reviews it's based on and links to them. **This needs PlanetTerp's permission** (see §7).
- **Indexable public pages** at `/courses/CMSC351` and `/profs/<slug>`, server-rendered. They're useful on their own and bring in search traffic, which becomes free marketing.

### F5. Problems panel (the linter)
Like the problems tab in VS Code. Every item has a severity, jumps to the offending block, and offers a fix when one exists.

- **Error:**
  - time overlap;
  - impossible walk;
  - final exam clash (see below);
  - section canceled or no longer in the catalog (after a re-scrape).
- **Warning:**
  - tight walk;
  - section full (with waitlist/holdfile counts);
  - section restricted (parsed from notes);
  - credits over the registration limit (the limit is config, not hard-coded, because it changes);
  - no lunch window.
- **Info:**
  - online async section (no calendar slot);
  - unknown instructor (TBA);
  - blended meetings.
- **One-click fixes:** "Swap to 0203 (same prof, no conflict)", "Show alternatives", "Generate around this".

**Final exam clashes.**
- The registrar publishes standard exam slots, keyed by a class's MWF/TuTh start time, plus common-exam slots per course (e.g. CMSC131 Wed Dec 16, 6:30–8:30pm) at `registrar.umd.edu/.../final-exams/{fall,spring}`.
- Scrape both and map each section to its exam slot.
- Flag two exams at the same time, and 3+ exams in one day.
- Show an "Exams" week view on the calendar.
- Per-section exact exams come from SOC's exam lookup about six weeks before the term ends; override with those when they appear.

### F6. Registration-day mode
- **Near-live seats** refreshed every 1–5 minutes (see §5), shown with a "data as of 2m ago" freshness badge. Seats animate when they change.
- **Fill-speed history.** We scrape seats repeatedly, so we build a dataset nobody else has: seat curves per section across registration. Surface it as "This section typically fills within 3 days of seniors' registration" and as a small sparkline. This becomes a real advantage by the second registration period.
- **Plan B generator.** "If X fills, what's my best schedule that keeps everything else?" The generator gets a "maximize overlap with Plan A" objective. Precompute backups for each section at risk.
- **Copy codes.** Copy all course + section codes in the order you'll enter them in Testudo, or open Testudo's registration page with them ready if their URL scheme allows it.
- **Seat alerts** (needs the backend in §5): Web Push and/or email when a watched section opens. Rate-limit and dedupe.
- **Waitlist and holdfile explainer** inline: UMD-specific rules, the daily waitlist check-in, and when restricted seats open. Link to the registrar pages rather than restating rules that change.

### F7. Export and sharing
- **Share link.** The schedule is encoded in the URL (term + section codes + blocks, compressed), so no account is needed. Opening a shared link offers "View", "Overlay on mine" and "Save a copy".
- **Friend overlay.** Paste a friend's link to see their schedule as a second translucent layer, with shared free time highlighted ("You're both free Tu 12:30–2"). This covers most of what friends features do, without accounts.
- **ICS export**, done right:
  - Weekly recurrence (RRULE) that starts on the first *actual* meeting day, not the term start.
  - `America/New_York` time zone.
  - Holidays and breaks excluded with EXDATEs, from `provost.umd.edu/calendar.md` (Thanksgiving, spring break, fall break).
  - Final exams as one-off events.
  - Location set to the building's full name and room; description has the professor, section and a Terpsicle link.
  - Stable UIDs, so re-importing updates events instead of duplicating them.
- **Webcal subscription** (later): `webcal://terpsicle.com/cal/<id>.ics`, so room changes flow into Google or Apple Calendar automatically. Needs a stored schedule, so it's account or short-link territory.
- **Image export.** A PNG of the week, for group chats and Instagram stories. Registration season is a marketing moment.

### F8. LLM features (backend only)
**No natural-language input or chat in the product.** Models only run on the backend, for work that's genuinely better done by a model, and **lazily**: on the first request for something, then cached for everyone. No bulk "summarize every professor" jobs.

| Feature | When it runs | Why a model |
|---|---|---|
| **Review summaries** per instructor (× course where there are enough reviews): 2–3 sentences plus theme tags (*clear lectures*, *hard exams*), linked back to the PlanetTerp reviews | **On demand:** the first time anyone opens that instructor. Cached, and regenerated only when an open finds new reviews since the last summary | Summarizing opinion text is what models are good at |
| **Section notes → structured flags** ("Restricted to Freshmen Connection", "first 8 weeks only", "permission required") | Only for notes regex can't parse, cached by the note's text (the same notes repeat every term) | Regex covers most; the long tail is messy prose. This makes the problems panel accurate |
| **Instructor name matching** across SOC and PlanetTerp ("Cliff" vs "Clifford") | Only for names fuzzy matching can't settle | Rare, ambiguous cases |

Maybe later: discovery search by meaning (embeddings over course descriptions) for gen-ed hunting.

Deliberately skipped: natural-language constraints, a chatbot advisor, generating schedules with a model, grade predictions.

Guardrails: a hard monthly spend cap; the summary endpoint is rate-limited and coalesces concurrent first requests; review text is treated as untrusted input (no tools, injection-safe prompt). While a summary is being made, the UI shows "Summarizing 88 reviews…" for a second or two.

### F9. Design system
- **Foundation:** shadcn/ui on Radix, Tailwind 4, Geist Sans and Geist Mono (Mono for course codes, times and seat counts).
- **Color:** neutral zinc base and 1px borders; UMD red used sparingly as an accent for primary actions and brand.
- **Dark mode is first-class.**
- **Density and motion:** 13–14px base UI text; tight, information-dense rows like Linear's issue list; motion that's fast (120–180 ms) and purposeful.
- **Course colors:** a curated, muted palette checked for contrast in both themes and assigned consistently per course.
- **Built for poking around, not power users.** People build a schedule once a semester, so every control has to be obvious on first sight. Shortcuts are a light layer on top: `/` search, `1`–`6` tabs, `↑`/`↓` preview sections, `↵` switch, `Esc` close, `⌘Z` undo. **Hovering anything that has a shortcut shows it** in the tooltip. No command palette.
- **Data displays: words first, charts only when they're clearer.** Seats read "11 of 120 open", "2 left" or "Full · 14 waitlisted". Grades lead with a sentence ("59% got an A or B · average GPA 2.71") above five plain labeled bars. Ratings are "★ 4.6 (88)". No sparklines or unlabeled mini-charts.
- **Skeletons and optimistic UI** everywhere; never a blocking spinner after first load.
- **Mobile:** a *viewer* first (your schedule, today's classes, walk times, seat alerts). Full editing on mobile comes later and needs its own layout; don't squeeze the three panes onto a phone.

---

## 4. Architecture

```
                ┌──────────────── ingest (scheduled) ────────────────┐
 Testudo SOC ──►│ scrape → parse → normalize → validate (zod)         │
 Registrar   ──►│   courses/sections/exams/calendar                    │
 PlanetTerp  ──►│ join ratings/grades                                   │──► R2 (static, CDN)
 UMD GIS     ──►│ building map + walk matrices (per term, offline)      │     manifest.json
 (LLM batch) ──►│ review summaries (offline, incremental)               │     catalog/<term>/<DEPT>.<hash>.json
                └───────────────────────────────────────────────────────┘     seats.<term>.json (ETag, 60s)
                                                                              walk.<hash>.bin, buildings.json
                                                                              seat-history/<term>/<date>.ndjson.gz
                                                                                   │
 ┌────────────────────────── browser ─────────────────────────────┐                │
 │ UI thread: React, TanStack Router, shadcn, calendar             │◄───────────────┘
 │   ▲ Comlink                                                     │
 │ Web Worker: catalog + MiniSearch index + generator + linter     │
 │ IndexedDB (Dexie): catalog cache, schedules, blocks, settings   │
 └──────────────────────────┬──────────────────────────────────────┘
                            │ (optional)
                  Cloudflare Worker: SSR course pages, /api/nl-constraints,
                  /api/share (short links), push subscriptions, alerts → D1
```

### Key decisions
- **The catalog is static data, not a database.**
  - One writer (the scraper), many readers.
  - A whole term is ~4.7k courses and ~12–15k sections: roughly 5–8 MB of JSON, about 1 MB brotli-compressed in a compact column-oriented layout.
  - Clients download it once per term, where it is served as immutable, content-hashed files. After that they poll only `seats.<term>.json` (about 100 KB) with `If-None-Match`.
- **The catalog is versioned and updates incrementally**, because "mostly static" still means rooms change, sections get added and cancelled, and TBA instructors get named.
  - The scraper splits the catalog into **per-department files named by content hash**: `catalog/202701/CMSC.3f9a1c.json`. They are immutable forever, and an unchanged department keeps its filename.
  - `manifest.json` is tiny, cached for 60 s with an ETag, and lists `{ schemaVersion, term, generatedAt, chunks: { CMSC: "3f9a1c", … }, seats: "<hash>" }`.
  - On load, tab focus and a timer, the client fetches the manifest (usually a 304), diffs chunk hashes against what's in IndexedDB, and downloads **only the departments that changed**. A room change in CMSC costs about 20 KB.
  - Bumping `schemaVersion` forces a clean full re-download.
  - Each saved schedule keeps a snapshot of its sections' meetings. When a new catalog arrives, the linter diffs them and surfaces changes ("CMSC351-0201 moved TuTh 9:30 → 11:00", "ENGL393-0304 was cancelled").
  - The same diff, run server-side, produces a public "what changed today" feed.
  - A database would be a poor fit: D1's free tier allows 100k row writes a day, and upserting seats every 5 minutes is about 7M.
- **All computation happens client-side in a worker.** Search, the linter and the generator all run against the local catalog, which makes the app instant, work offline, and cost nothing per user.
- **Normalized schema with pluggable source adapters.** UMD is moving to **Workday Student ("Elevate")**:
  - Fall 2028 sections are built in Workday from September 2027.
  - The first Workday registration is **Spring 2028**.
  - That's the date `/soc` scraping probably breaks.

  Everything downstream consumes `Catalog` (below), never raw Testudo HTML. Adding a Workday adapter then touches one module. The same seam would allow other universities later (the doc's "HNUH300 extra mile").
- **Local-first user data.** Schedules, blocks and settings live in IndexedDB via Dexie, and the app is fully functional without an account. Sync, when we add it, is a single D1 table of `{userId, scheduleId, doc, updatedAt}` with last-write-wins per schedule. A few KB per user doesn't justify a sync engine; Zero, InstantDB and friends are overkill here.

### Normalized schema (sketch)
```ts
type Term = { id: "202701"; name: "Spring 2027"; start: ISODate; end: ISODate; breaks: DateRange[]; examPeriod: DateRange };

type Course = {
  code: "CMSC351"; dept: "CMSC"; number: "351"; title: string;
  credits: { min: number; max: number };
  genEds: string[][];               // OR-groups, e.g. [["DSSP"], ["SCIS","DVUP"]]
  description?: string; prereqText?: string; restrictionText?: string;
  crossListed?: string[]; gradingMethods?: string[];
};

type Section = {
  id: "CMSC351-0101"; course: "CMSC351"; code: "0101";
  instructors: string[];            // canonical slugs
  seats: { total: number; open: number; waitlist: number; holdfile: number } | null;
  delivery: "f2f" | "blended" | "online-sync" | "online-async";
  meetings: Meeting[]; notes?: string; restricted?: boolean;
  exam?: ExamSlot;
};

type Meeting = {
  days: number;                     // bitmask M=1 Tu=2 W=4 Th=8 F=16 Sa=32 Su=64
  start: number; end: number;       // minutes since midnight
  building?: string; room?: string; // "IRB", "0324"
  kind: "lecture" | "discussion" | "lab" | "other";
};

type Building = { code: "IRB"; number: "432"; name: string; lat: number; lng: number };
// walk matrix: Uint16Array feet, indexed [fromIdx * n + toIdx], separate file for accessible
```

At UMD a section code (e.g. `0101`) usually *bundles* the lecture and discussion meetings, so "linked components" are rarely needed. Keep `meetings[].kind`, and don't build GT-style lecture/lab linking unless the data demands it.

---

## 5. Data pipeline

| Source | What | Cadence | Notes |
|---|---|---|---|
| Testudo SOC `/soc/{term}/{DEPT}` | Courses, gen-eds, descriptions, prerequisite and restriction text | 2× daily (hourly near registration) | 207 departments; about 24 s at concurrency 4. Send `Accept-Encoding: gzip` (1.1 MB HTML becomes 26 KB). Retry on reset. |
| Testudo SOC `/soc/{term}/sections?courseIds=…` | Sections, meetings, seats, delivery, notes | Every 5 min; 1–2 min during registration windows | Batch a department's courses per call. Also emits `seats.json` and a seat-history delta. |
| Testudo `/soc/buildings/{code} {room}` | Code → building number | Per term, only for new codes | Joins to GIS. |
| UMD ArcGIS `BuildingAllSearch` | Coordinates, footprints, names | Per term | Public, no token. |
| UMD GIS DynamicRouting (+Accessible) | Walk matrices | Per term, incremental | Token from the maps.umd.edu portal (see `dev`). maps.umd.edu serves an incomplete TLS chain, so Node may need the intermediate certificate bundled. |
| Registrar final-exam pages + SOC exam lookup | Exam slots | Weekly | Standard and common exams early; per-section later. |
| `provost.umd.edu/calendar.md` | Term dates, breaks | Weekly | A clean Markdown source (registrar pages return 403 to bots). |
| PlanetTerp API | Professor ratings, review text | Daily | No auth; "don't hammer it". **Ask before bulk redistributing reviews.** |
| Grades | Grade distributions | Per release | PlanetTerp goes to Spring 2025; Jupiterp's API goes to Fall 2025 (from Registrar MPIA files). Options: ask Jupiterp or PlanetTerp for permission, or file our own MPIA request (these are public records). |

- **Runner:** GitHub Actions on a schedule to start. It's free for public repos, and our TypeScript parsers run as-is.
  - Caveats: the minimum interval is 5 minutes, runs often lag 5–20 minutes at peak, and schedules turn off after 60 days of repo inactivity (use a keepalive commit or dispatch).
  - For registration windows, move the seat job to **Cloudflare Workers Paid ($5/mo)**: cron every minute, 30 s CPU.
  - The course job can stay on Actions.
- **Parsing:** use a streaming HTML parser (`linkedom` or `node-html-parser`), not jsdom. It's 10× faster and runs in Workers too. Validate every record with zod; if the error rate passes a threshold, **don't publish** and alert instead, so Testudo markup changes can't ship garbage.
- **Etiquette:** a descriptive User-Agent with a contact email, gzip, concurrency ≤ 4, and backoff. Testudo has no robots.txt and sends no rate-limit headers; being polite keeps it that way.
- **Seat history:** every seat scrape appends only *changed* sections to `seat-history/<term>/<date>.ndjson.gz` in R2. That's cheap, and it powers fill-speed features and a nice "registration replay" visualization.

---

## 6. Stack

| Layer | Pick | Why / alternatives |
|---|---|---|
| Framework | **TanStack Start** (React 19, TS) | Typed routes and search params (URL state for filters and schedules without nuqs), SSR that's opt-in per route for the course and professor pages, first-class Cloudflare support. Still labeled RC, but the API is frozen. **Fallback:** React Router v8 framework mode (stable). Next 16 also works, but its Server Components model buys little for an app that's mostly client-side, and Vercel Hobby is non-commercial only. |
| Hosting | **Cloudflare Workers + R2** | Static assets and R2 bandwidth are free, which matters when every user downloads a 1 MB catalog on registration day. The free plan's 10 ms CPU limit is tight for SSR: cache SSR'd course pages in the Cache API, or pay $5/mo. |
| UI | shadcn/ui, Tailwind 4, Radix, lucide, Geist, `sonner` (toasts), `vaul` (mobile sheets) | Matches the Linear/Vercel look. |
| Calendar | **Custom CSS grid** (~300 lines) | Calendar libraries are date-oriented and fight ghosts, overlap columns and travel pills. Port the overlap-layout idea from `app/schedule/calendar.tsx`. |
| Drag and drop | pragmatic-drag-and-drop | Later. Click-to-swap covers most of what DnD would. |
| Search | **MiniSearch** in the worker (fuzzy + prefix, field boosts), plus **uFuzzy** for ranking short code/title matches | Orama if we want built-in facets. |
| Worker | Comlink + a module worker | Generator, search, linter. |
| Client data | TanStack Query (catalog, seats), Dexie + `useLiveQuery` (user data), Zustand (ephemeral UI state) | |
| Map | MapLibre GL + Protomaps PMTiles on R2 | Free, no API keys. Style it to match the theme. |
| Validation | zod 4, shared between scraper and app | |
| LLM | Vercel AI SDK `generateObject`, with Claude Haiku 4.5 or similar | Structured output against the constraint schema. |
| Auth (later) | Better Auth + D1, anonymous → upgraded accounts | Only for sync, alerts and webcal. |
| Repo | pnpm monorepo: `apps/web`, `packages/core` (schema, time and bitmask utils, generator, linter), `packages/ingest` (scrapers, adapters), `packages/ui` | The generator and linter are pure TS with no DOM, so they're unit-testable with Vitest. |
| Quality | Vitest, Playwright (Chromium), Biome or ESLint, golden-file tests for parsers built from saved Testudo HTML fixtures | Parser fixtures are the most valuable tests we'll have. |

**Rewrite, don't evolve.** Start v2 fresh in this repo (new monorepo layout on a branch, v1 archived under a tag). Port ideas and snippets rather than files:
- the SOC selectors from `lib/scrape-section.ts` / `lib/from-soc.ts`;
- the GIS routing from `dev`'s `lib/gis.ts`;
- the overlap layout from `calendar.tsx`.

The generator in `dev`'s `lib/generate.ts` does a full cartesian product and then filters, which blows up past about 5 courses. §F3 replaces it.

---

## 7. Risks and open questions

| Risk | Mitigation |
|---|---|
| Testudo markup changes | Zod validation, a publish gate (the last good snapshot stays live), golden fixtures, alerting. |
| **Workday replaces SOC in spring 2028** | The adapter seam (§4). Start watching Workday's public course search in fall 2027, during Elevate's mock semester. |
| UMD GIS token or endpoint changes | The matrix is precomputed and cached forever, with the OSRM/OSM fallback. |
| PlanetTerp terms (the compilation is claimed as their property) | Decided: we're OK using it. Still a courtesy email before launch, link back to reviews, cache politely. |
| Grade data freshness | PlanetTerp grades stop at Spring 2025. Registrar MPIA data is public record, so file our own request for newer terms. |
| GitHub Actions cron lag at registration | Workers Paid cron ($5/mo) for seats during windows. |
| LLM abuse or cost | Turnstile, rate limits, a caching layer, a spend cap. The feature degrades gracefully to plain chips. |
| Being "another Jupiterp" | Lead with walking, the linter, registration-day tooling and polish. |

**Decisions (2026-09-25)**
1. Hosting: **Cloudflare** (Workers + R2, D1 only for the little server state we have).
2. Data: **no Jupiterp data**. **PlanetTerp is fine.**
3. Accounts: **none at launch.** Seat alerts get the lightest possible auth: a Web Push subscription or an email magic link, with no passwords and no profile.
4. LLM features: backend only, lazy and cached (F8). No natural-language input in the product.
5. Travel time, not walking. Pace, step-free and buffer settings with the math shown. No weekly walking total.
6. Details open in one place, and there's no permanent right panel. Which pattern is TBD (prototype round 2).
7. No command palette. Light shortcuts, shown on hover.

**Still open**
- LLM budget cap (suggest $20/mo to start).
- Domain: terpsicle.com. Still owned?
- Which app-shell variant wins (see `prototypes/app-shell`).

---

## 8. Roadmap

Each phase ends shippable. Rough sizes assume a solo developer working with an AI coding agent.

**Phase 0: Foundations (≈1 week)**
- [ ] Monorepo scaffold (TanStack Start, Tailwind 4, shadcn, Geist, dark mode, Biome, Vitest, Playwright).
- [ ] `packages/core` schema + zod, time and bitmask utilities.
- [ ] `packages/ingest`:
  - [ ] SOC adapter: departments, courses, sections, delivery inference, notes.
  - [ ] Golden fixtures.
  - [ ] Publish to R2 with manifest, content hashing and seats.json.
  - [ ] GitHub Actions cron.
- [ ] Building join (`/soc/buildings` → ArcGIS) and `buildings.json`.
- [ ] Walk-matrix builder (UMD GIS, standard and accessible), cached in R2.

**Phase 1: The builder (≈2–3 weeks)**, which makes it usable on its own: F1, F2 (pills and warnings), and part of F5
- [ ] App shell: top bar with plans, labeled rail, one sidebar panel, calendar; details per the round-2 decision.
- [ ] Catalog load → IndexedDB → worker; MiniSearch with filter syntax.
- [ ] Calendar grid: overlap layout, hover ghosts, click-to-swap, custom blocks with locations.
- [ ] Plans in Dexie (rename, duplicate, delete, undo).
- [ ] Travel pills and settings; Problems panel (overlaps, travel time, full sections, restricted, async).
- [ ] Share links and friend overlay.

**Phase 2: The generator (≈2 weeks)**: F3
- [ ] Bitmask compiler, equivalence merging, depth-first search with top-K and a step budget, relaxation hints, fewest-conflicts mode.
- [ ] Constraint chips, scoring presets and sliders.
- [ ] Results gallery with diff highlighting, j/k, pin-from-result.
- [ ] Priority-list mode.
- [ ] Benchmarks: 7 courses × 20 sections each in under 200 ms.

**Phase 3: Intelligence and export (≈2 weeks)**: F4, the rest of F5, F7, and the F2 map
- [ ] PlanetTerp ratings and grade distributions in inspectors and scoring.
- [ ] Final exam scraping, the exam clash linter, the exam week view.
- [ ] ICS export (first-meeting RRULE, EXDATE breaks, exams); PNG export.
- [ ] Day route map (MapLibre).
- [ ] SSR course and professor pages.

**Phase 4: Registration day (≈2 weeks, timed before registration opens)**: F6
- [ ] Faster seat cron, freshness UI, seat history ingest, fill-speed sparklines.
- [ ] Plan B generator; copy codes.
- [ ] Seat alerts (Web Push or email magic link + D1; the first backend state, with no full accounts).

**Phase 5: AI and social (ongoing)**: F8, sync, webcal
- [ ] On-demand review summaries (first open, cached).
- [ ] Cross-device sync, webcal subscriptions, short links.
- [ ] Mobile viewer polish, PWA install.

**Launch timing:** Fall 2026 registration for Spring 2027 is coming up (Spring 2027 is already on Testudo). The realistic target is **Phases 0–2 before Spring 2027 schedule adjustment, and the full thing for Fall 2027 registration (roughly March–April 2027)**. Posters around campus (from the original doc) should go up about 2 weeks before registration opens.

---

## Appendix A: the original brainstorm (Excalidraw), mapped

| Original idea | Where it lives now |
|---|---|
| Similar projects: Coursicle (easy layout, local-first), Venus (recommendations), Jupiterp (course popup, auto time range) | §2; auto-rescaling the calendar's time range is part of F1 |
| Areas: landing, calendar (hard), search/filter, SOC scraping, PlanetTerp, recommendation engine, walking conflict engine | F1, F3, F4, F2, §5 |
| Standout: Venus-like recommendations, great UX with sidebar tools, one integrated place instead of a million tabs | F3, F1, F9, §1 |
| Sidebar tabs: search, schedules, blocks, recommendations, problems, professors, export, ~~requirements~~, map | F1 rail + F5 + F4 + F7 + F2 (requirements dropped: no audit) |
| Blocks where courses can't go (Trent) | F1 custom blocks (now with locations) |
| Favoriting | F1 favorites/cart → generator input |
| Classes needed for major | **Dropped** (degree audit exists) |
| Search by name; gen-ed filtering | F1 search syntax |
| Walking time inline between classes; precompute building pairs | F2 (the `dev` GIS approach) |
| Share link, data in URL or DB | F7 |
| Course fill-up notifications | F6 seat alerts |
| Review sentiment and summary | F4 + F8 |
| Right-click menu, keyboard shortcuts | F1, F9 |
| Research: IndexedDB? Client-only with CORS proxy? | Yes to IndexedDB (Dexie). Not a CORS proxy: a scheduled scraper publishes static snapshots, which is cheaper and friendlier to Testudo. |
| New registration system ~spring 2028 | Confirmed: Workday Student via "Elevate"; first Workday registration Spring 2028. Adapter seam in §4. |
| Tech constraints: single deployable, one language, free tiers, no physical infrastructure, local-first, avoid complexity | All kept: one Worker + R2, TS everywhere, $0–5/mo, local-first |
| Stack: Next, Tailwind + shadcn, React Query, Dexie, zod | Kept everything but Next → TanStack Start (§6) |
| Extra mile: posters, other campuses | §8 launch timing; adapter seam enables other campuses |

## Appendix B: research sources
- Testudo SOC (endpoints tested 2026-09-25): `app.testudo.umd.edu/soc/{term}`, `/{DEPT}`, `/sections?courseIds=`, `/buildings/{code}`, `/autocomplete/course`, `/exam/search`
- UMD Elevate / Workday Student timeline: https://elevate.umd.edu/about-elevate/timeline, https://dbknews.com/2026/04/03/umd-town-hall-workday-testudo/
- UMD buildings (public ArcGIS): https://services9.arcgis.com/1rOwFRpAwrxe0rBl/arcgis/rest/services/BuildingAllSearch/FeatureServer/0
- Final exams: https://registrar.umd.edu/registration/register-classes/final-exams/fall · Academic calendar: https://provost.umd.edu/calendar.md
- PlanetTerp API: https://planetterp.com/api (grades through 202501) · Jupiterp: https://github.com/Jupiterp-UMD, https://api.jupiterp.com (grades through 202508; AGPL-3.0)
- umd.io: alive but stale (no 202701; professors endpoint 502) — don't depend on it
- Generator prior art: GT Scheduler (`src/data/beans/Oscar.ts`), MIT Hydrant (`src/lib/calendarSlots.ts`), Jupiterp (`ScheduleGenerator.ts`, relaxation hints), Hyperschedule (priority list), UniTime (alternatives dialog), UT Registration Plus (map PathFinder, ICS utils), AntAlmanac (ICS first-meeting date)
- LLM planning pitfalls: https://arxiv.org/abs/2402.01622 (TravelPlanner) · constraint-parsing pattern: https://arxiv.org/abs/2409.03671
- Stack: TanStack Start (RC) https://tanstack.com/start · Cloudflare limits https://developers.cloudflare.com/workers/platform/limits/ · R2 pricing https://developers.cloudflare.com/r2/pricing/ · D1 pricing https://developers.cloudflare.com/d1/platform/pricing/
