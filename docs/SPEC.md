# Terpsicle v2: product spec

The canonical description of **what** we're building. It supersedes `PLAN.md` wherever they disagree; `PLAN.md` is kept for research context and sources. **How** we build it is in `BUILD.md`.

Decisions come from three prototype rounds (`prototypes/app-shell` on branch `claude/loving-volta-dzve8b` of [`terpsicle-bitcamp`](https://github.com/zsrobinson/terpsicle-bitcamp)) and the final review (answers recorded 2026-09-25).

**v2 (2026-09-26):** the owner added Google sign-in, plan sync, Terpsicle Reviews (`/reviews`) and Terpsicle Chat (`/chat`), and moved the scheduler to `/schedule`. `docs/V2.md` is the plan; where it and this spec differ, V2.md wins. The lines marked "v2" below changed.

**v3 (2026-09-26, evening):** Terpsicle Plan (`/plan`, a four-year planner) and Terpsicle Todo (`/todo`, deadlines from ELMS) join the suite. The five products, in color order: Schedule (red), Reviews (purple), Chat (blue), Plan (green), Todo (yellow). `docs/V3.md` is their plan and wins over this spec where they differ. The lines marked "v3" below changed.

---

## 1. What it is

A class scheduler for University of Maryland students. It's fast and clear, and gets out of the way. It covers building a schedule and nothing else: no degree audit and nothing major-specific. (v3: Terpsicle Plan adds the four-year view, with credits, GenEd progress and prerequisite order, and still no degree audit and nothing major-specific; `docs/V3.md` §2.)

**Principles**
1. **One home for each kind of information, and one way to open things.** Clicking a course *anywhere* opens the same course details.
2. **See every option.** Opening a course shows every one of its sections on the calendar at once; click one to switch.
3. **Honest, not naggy.** Problems are listed where you can find them, but people mid-decision aren't yelled at. For example, two courses you're choosing between may overlap on purpose.
4. **Built for poking around.** People use it a few times a semester, so every control must be obvious on first sight, with light keyboard shortcuts on top.
5. **Words before charts.** A chart only appears where it's clearer than a sentence.
6. **Local-first; an account is optional (v2).** Everything in the scheduler works signed out, in the browser. Signing in with a UMD Google account syncs plans between devices and unlocks Chat, writing reviews and seat alerts. terpsicle.com sets a cookie only once someone signs in, and signing out removes it. Server-side user data is what `docs/V2.md` lists: the account (Google name and picture, UMD email, directory ID), synced plans, seat watches, notification settings, reviews and chat messages. v3 adds synced four-year plans (with any grades the person imported) and, for Todo, the encrypted ELMS calendar link, the deadlines it lists and done marks (`docs/V3.md` §5).
7. **AI only on the backend, and only where it's clearly better.** No chatbot and no natural-language input (Terpsicle Chat is people talking to each other). v2: models are used only for review summaries, their small generated chips, and moderation. The sparkles icon marks LLM output, and only LLM output.

**Not in the first release:** final exams, comparing plans side by side (future), image export, credit-limit warnings (the limit depends on major), and hiding courses from search. (v2: accounts and plan sync are in; `docs/V2.md` §4–5.)

---

## 2. Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ▣ terpsicle / Spring 2027 ▾ / [Plan A ▾] [Plan B] [+]          16 credits  ⚠ 2 │  top bar
├──────┬──────────────────────────┬─────────────────────────────────────────────┤
│Courses│  sidebar panel           │  calendar (Mon–Fri, +Sat only when needed)  │
│Search │  (one tab at a time;     │                                             │
│Problems│  drills in to details   │                                             │
│Travel │  with a breadcrumb)      │                                             │
│Blocks │                          │                                             │
│Generate│                         │                                             │
│Export │                          │                                             │
└──────┴──────────────────────────┴─────────────────────────────────────────────┘
```

- **Top bar:**
  - logo · term switcher · plan tabs · `+`;
  - right side: credits, and a problem count that opens Problems.
  - The active plan tab has a ▾ menu: Rename, Duplicate, Delete. Double-click to rename.
  - `+` opens: **Empty plan**, **Copy of <current>**, **Generate plans…**.
- **Rail:** icons with text labels: Courses, Search, Problems, Travel, Blocks, Generate, Export. Clicking the active tab again **collapses the sidebar** (click any tab to reopen). There is no separate collapse button.
- **Sidebar:** one panel at a time. Opening details (a course, a connection, a generated plan) **drills in** over the current tab, with a **breadcrumb** header ("Search › CMSC351"). `Esc` or the breadcrumb goes back to exactly where you were.
- **Calendar:** always visible on desktop, and it **stretches to fill the screen**. Hour height is computed from the available height, so the plan's hours fit without scrolling; it only scrolls when the window is too short for a readable minimum (~36px per hour). Nothing sits below the grid (no tips or footers).
- **Mobile:** the same shell. The sidebar becomes a **bottom drawer** with snap points (peek / half / full), and the rail becomes the drawer's tab strip. The calendar stays a week grid. There are no bespoke mobile screens, so new features only need to work in the sidebar.

---

## 3. Features

### 3.0 Terms (fully automatic)
Nobody should have to touch the app when a new semester appears.
- **The Schedule of Classes is the source of truth for which terms exist.** Every catalog run reads the term dropdown on `app.testudo.umd.edu/soc/` and publishes `terms.json` (id, name, status).
- Every term listed there is crawled: fall, spring, summer and winter.
- **New terms appear in the term switcher automatically** as soon as Testudo lists them.
- **Old terms** that drop off Testudo stay in R2 as *archived*: still viewable, and plans for them still open, but seats stop updating. The switcher shows them under "Past terms".
- **Default term:** the newest fall or spring term Testudo lists, which is the one people are registering for. A person's last-used term is remembered.
- Plans belong to a term. Switching terms shows that term's plans, and switching never mixes sections across terms.
- **Anything per-term is looked up, never hard-coded:**
  - dates and breaks for .ics come from the provost calendar, matched by term;
  - seat-poll and crawl schedules apply to all active terms;
  - if a term's calendar dates aren't published yet, .ics export for that term says so plainly.
- Buildings and routes grow on their own: new building codes seen in any term are joined to the map data, and their routes are computed on the next routes run.


### 3.1 Plans
- Many named plans per term, stored locally (IndexedDB).
- Tabs in the top bar (they overflow into a menu past ~5).
- Every change is undoable (`⌘Z` and an Undo button in the pop-up message), so there are no confirmation dialogs anywhere except unsubscribing from seat alerts (§3.9).
- A new plan can start empty, as a copy of the current one, or from the generator.

### 3.2 Courses tab (formerly "Plan")
- The courses in the current plan. Each row shows the dot in the course color, code, section, title, instructor and meeting days, the seats meter, and a warning icon if the course has a problem.
- **Saved for later:** courses you're considering but haven't placed.
- **Course color:** clicking a course's color dot opens a small palette of preset colors. The color is per course and the same in every plan.
- **First visit:** "Build your <term> schedule" with **two equally weighted paths** side by side (same size and style; neither is secondary):
  - **Build it yourself:** 1 find your courses → 2 pick sections on the calendar → 3 fix anything flagged → 4 export for registration. Button: **Search for a course**.
  - **Generate plans:** 1 list the courses you need → 2 set your must-haves (days off, start time, …) → 3 pick from ranked plans → 4 export. Button: **Generate plans**.
  - The same two paths appear whenever a plan is empty.
  - v2: first-time visitors at `/` see a marketing page; anyone with saved plans or a session goes straight to the app at `/schedule` (`docs/V2.md` §2).

### 3.3 Calendar
- **Blocks show:** course code (monospace), time, and building + room. Discussions and labs are labeled as such.
- **Colors:** soft tints (light fill, darker text) from a fixed palette that works in both themes. Colors can be changed per course (§3.2).
- **Hours:** fit to the plan (at least 8am–5pm), growing as needed.
- **Saturday** column only when a plan has a Saturday meeting.
- **Online classes with no set time** get a strip above the grid ("No set time: ENGL393 0312 · online").
- **Overlapping classes** sit side by side in columns, with **no red outline**. The overlap is listed in Problems but not shouted about on the calendar.
- **Showing every section.** Opening a course (from anywhere):
  - Every other section of that course appears as a **dashed ghost**, labeled with section code and instructor, plus "Full" or "Overlaps" where true. Other classes dim.
  - Click a ghost to switch. Hover a ghost or a section row, or use `↑`/`↓`, to preview it solid. `↵` switches.
  - A one-line hint strip above the grid explains this while it's active.
  - **Courses with many sections:** sections with identical meeting times collapse into one ghost ("0101–0106 · 6 sections"), and that ghost's popover lists them. Ghost labels shrink to just the code when narrow. If more than ~12 distinct ghosts remain, the calendar shows the first 12 by section order, and the sidebar list shows the rest.
- **Search hover:** hovering a search result shows all of that course's sections as ghosts. This is how people compare across upper-level courses with one section each.
- **Travel pills** between every back-to-back pair of classes in different buildings: "6 min" with a route icon.
  - Neutral when fine, amber when tight (needs ≥ 75% of the gap), red when there isn't enough time.
  - Hover for the numbers; click to open connection details.
- **Drag to block time:** drag on an empty part of the grid; a small popup asks for a label, with presets (Lunch, Work, Gym, Club). This is discoverable through a hover tooltip on empty grid space and the Blocks tab, never through text under the calendar.

### 3.4 Course details (drill-in)
- **Header:** code, credits, gen-eds, title; Remove from plan / Save for later.
- **Sections, grouped by instructor:**
  - The group header shows the instructor, rating (review count) and average GPA in this course. Groups can be collapsed.
  - Sections keep **section-number order** (no re-sorting by instructor name).
  - The "Sections" label shows how many fit ("Sections · 2 fit").
- **Each section row:**
  - code;
  - meeting days, times and buildings;
  - **fit label in words:** Fits · Overlaps ENGL393 · Not enough time after CMSC330 · In your plan · No set times;
  - seats as a **meter plus words** ("12 of 36 open", "2 left", "Full · 9 waitlisted");
  - restriction notes in amber;
  - a Switch/Add button;
  - a bell on low or full sections (§3.9).

  Sections that don't fit stay in place, with their label.
- **Seat freshness:** "Seats as of 2 min ago" above the section list.
- **Tabs:**
  - **Instructors:** a card per instructor with rating, reviews count, average GPA and % A/B in this course, the LLM review summary with theme tags, and a link to PlanetTerp.
  - **Grades:** a sentence ("64% got an A or B · average GPA 2.93") above **PlanetTerp-style bars**: one bar each for A, B, C, D, F, W and Other. Each letter bar is split into +/plain/− segments, and hovering a segment shows its count and percentage.
  - **About:** description, prerequisites and restrictions as text (not enforced), cross-listings.

### 3.5 Search
- Search by course code, title or instructor, with typo tolerance.
- **Filters:** one line of chips under the search box. Each is a dropdown or toggle, and fills with color when active:
  - Gen-eds ▾ (multi-select);
  - Credits ▾;
  - Fits my plan (considers classes, blocks and travel time);
  - Open seats;
  - Level ▾ (100–800).
- **Results:** a list of courses showing code, credits, gen-ed tags, title, and "4 sections · 2 fit your plan".
  - Hover a result to see its sections as ghosts on the calendar.
  - Click to open course details.
  - Sections are never listed in the results.

### 3.6 Problems
- A tab, plus the count in the top bar. No banners, and ordered by severity.
- **Error:**
  - not enough time between classes;
  - a section was cancelled or changed since you added it (from catalog updates).
- **Warning:**
  - overlap (listed calmly);
  - tight connection;
  - section full;
  - few seats left;
  - restricted section.
- **Info:** online with no set times; instructor TBA.
- Each problem opens the related course or connection. It also offers a one-click fix ("Switch to 0205") when a section fixes it without creating new problems.

### 3.7 Travel
- The **Travel** tab:
  - **Settings:** pace (Slower 2.5 mph / Typical 3.0 / Faster 3.5), **Accessible routes** (never "step-free"), and extra time per trip (none, +2, +5).
  - **Explanation:** one line ("Estimates use campus paths at your pace.") with a **How?** link that shows the math for one real connection.
  - **Connections:** listed by day.
- **Connection details** (drill-in):
  - the verdict ("Not enough time: 18 min to get there, 10 min between classes. You'd be about 8 min late.");
  - leave and arrive times and places, distance, and the estimate math;
  - a **map of the actual route**: the path line from UMD's campus routing network (standard or accessible), on campus map tiles. **Never a straight line;** if route geometry is missing, the map is hidden;
  - "Sections that fix this", each previewable on the calendar.
- Blocks have **no places**, and never affect travel time.

### 3.8 Blocks
- A list of blocks, plus an add form: label with presets, days, start and end time. Blocks can also be added by dragging on the calendar.
- Blocks count as busy time for "Fits my plan", Problems and the generator. That's their whole job.

### 3.9 Generate (first-class, no sparkles)
Generating **creates plans**; it doesn't edit one. Entry points: the Generate tab, `+` → Generate plans…, and the first-visit guide.
- **Courses:** type or pick courses. Each is **Required** or **Optional**, with a "pick N of these" group for things like "any 1 DSHU from this list".
- **Must-haves:**
  - earliest start and latest end;
  - days off;
  - enough time between classes (on by default);
  - open seats only;
  - respect my blocks (on);
  - credit range.
- **Rank by:** compact days, fewer days on campus, later starts, best-rated instructors, higher average GPA, safest seats. A "Custom" option exposes weight sliders.
- **Results:** a ranked list. Each result has a mini-week thumbnail and plain stats (days on campus, first class, average rating, fewest open seats).
  - Results that differ only in time-identical sections are merged ("×3 equivalent").
  - Clicking a result previews it on the calendar and drills into its details (changes, problems).
  - Actions: **Save as new plan**. Multiple results can be saved at once (checkboxes → "Save 3 plans").
- **When nothing fits:** suggested relaxations with the count each would unlock ("Allow classes before 10am → 38 plans"), plus the closest near-misses with their conflicts marked.
- It runs in a Web Worker, stays responsive, and stops at a budget with "showing the best 200".

### 3.10 Export
- **Registration checklist:** the current plan's sections in suggested registration order (the section most likely to fill goes first). Each has a checkbox, seats, and a **backup section** that also fits the plan.
- **Copy course and section codes.**
- **Copy share link.** The plan is encoded in the URL, with no server.
- **Add to your calendar (.ics):** weekly events from the first real meeting day, the correct time zone, breaks and holidays excluded (from the provost's academic calendar), and stable event IDs.

### 3.11 Shared links
- Opening a share link shows the shared plan **read-only, in place of your plan tabs**: a light-red rounded pill in the top bar reading "Shared plan · Save a copy · ✕".
- Nothing about you changes until you click Save a copy. ✕ returns to your plans.
- There are no names (we don't know who shared it).

### 3.12 Seat alerts (light auth; not a launch blocker)

**v2:** seat alerts become a signed-in feature, delivered by push and email by default, with no email to type and no confirmation link. The email-token flow below retires, and stopping a watch uses Undo instead of a confirmation (`docs/V2.md` §6.5). The rest of this section describes v1.
- A bell on low or full sections → enter an email → one confirmation link → "Watching".
- Deduplicated per email and section: signing up twice says "You're already watching this".
- Alert emails have a one-click unsubscribe that asks for confirmation. Watching sections are listed in Export ("Seat alerts").
- It ships when it's end-to-end tested, and not before.

### 3.13 Look & feel
- **Theme:** Tailwind 4 + shadcn/ui (Radix), Geist Sans and Geist Mono (codes, times, numbers).
- **Color:**
  - Accent is **black/white** (primary buttons, selection).
  - **UMD red only for the logo.**
  - Semantic colors: green ok, amber warning, red error.
  - Light and dark themes both first-class, following the system setting with a toggle.
- **Density:** compact, 13px base.
- **Tooltips on everything interactive.** Shortcuts appear in tooltips: `/` search, `1`–`7` tabs, `↑`/`↓` preview section, `↵` switch, `Esc` back/close, `⌘Z` undo.
- **Remember** the open tab and drilled-in item between visits (per browser).
- **Microcopy:** plain words, active voice, specific errors. The review summary is the only place the sparkles icon appears.
- **Contractions (v3, owner):** copy uses contractions everywhere, in the app and on marketing pages: "it's", "you'll", "don't", "we'll", "isn't". The product should feel a little personal. Write "Nothing's due tomorrow", not "Nothing is due tomorrow"; "We couldn't read that link", not "The link could not be read".

---

## 4. Data

| Data | Source | Notes |
|---|---|---|
| Terms, departments, courses, sections, seats, meetings, delivery, notes | Testudo Schedule of Classes (scraped) | The term list comes from Testudo too (§3.0). Seat counts refresh every 5 min for active terms. |
| Instructor ratings, reviews, grade distributions (+/−, W) | PlanetTerp API | We're OK using it; cache politely and link back. |
| Building codes → numbers → coordinates | Testudo building popup + UMD ArcGIS BuildingAllSearch | Checked-in `buildings.json`. |
| Walking distances **and route geometries** (standard + accessible) | UMD GIS DynamicRouting (`gis.umd.edu`), precomputed per building pair | Built by a resumable cron job (or a script if Workers can't reach UMD's token server), stored in R2. OSRM/OSM is the fallback for distances only. |
| Term dates, breaks, holidays | `provost.umd.edu/calendar.md` | For .ics. |
| Review summaries | **Workers AI** (the Worker's `AI` binding, no external API key), generated **on demand** on the first open of an instructor, then cached in R2 | Regenerated only when new reviews arrive; hidden if generation fails. |
| Accounts, synced plans, seat watches, reviews written on Terpsicle, chat messages (v2) | D1, and the `CourseChat` Durable Object for messages | `docs/V2.md`; tables in `DATA.md` §7.5. |
| Every course across known terms, with GenEd codes and parsed prerequisites (v3, Plan) | The catalog job, from the terms' department files | R2 `courses/` family (`docs/V3.md` §2.2). |
| Deadlines and exams (v3, Todo) | The student's ELMS calendar feed (`.ics`), fetched by a cron about every 20 minutes | Stored in D1, link encrypted (`docs/V3.md` §3). Never an ELMS or Gradescope password. |

No Jupiterp data. No final exam data.
