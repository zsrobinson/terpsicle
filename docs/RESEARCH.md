# Research notes (2026-09-25)

The primary research behind the spec, kept close to verbatim so implementers get the concrete details: endpoints, CSS classes, limits and gotchas. Everything was verified live on 2026-09-25 unless marked **UNVERIFIED**. Re-verify anything that looks stale before depending on it.

---

## 1. UMD data sources

### Testudo Schedule of Classes (SOC): alive, authoritative, HTML only
- **Terms:** the dropdown lists 202605, 202608, 202612 and 202701 (**Spring 2027 is already published**). `/soc/202501/CMSC` still works; 202408 and earlier return 0 courses, so only about 1.5–2 years are kept.
- **Endpoints (all 200):**
  - `/soc/{term}`: the department list (207 prefixes, ~76 KB).
  - `/soc/{term}/{DEPT}`: course-level data. CMSC is ~600 KB raw / ~36 KB gzipped.
  - `/soc/{term}/sections?courseIds=A,B,…`: section HTML. All 95 CMSC courses fit in one request: 1.14 MB raw, 26 KB gzipped, 0.9 s. **Always send `Accept-Encoding: gzip`.**
  - A full Fall 2026 crawl of all 207 department pages at concurrency 4 took 24 s: 31 MB raw, 4,685 courses. One connection reset occurred, so retry.
- **Whole-term crawl:** a blank `/soc/search?courseId=` returns only the department list, so there is no single call for everything. The cheapest crawl is 207 department pages plus ~207 batched `sections` calls. `/soc/gen-ed/{term}/{CODE}` returns cross-department results (DSSP: 203 courses, 1.4 MB), as does `instructor=` search.
- **Course fields (CSS classes):**
  - `course-id`, `course-title`, `course-min-credits`/`course-max-credits`, `grading-method`;
  - gen-ed codes;
  - `perm-req-message`, `crosslisted-as`, `offered-as`;
  - Prerequisite / Restriction / etc. are free text inside `approved-course-text`, followed by the description;
  - a syllabus-repository count.
- **Section fields:**
  - `section-id`, `section-instructor` (can repeat), `total-seats-count`, `open-seats-count`;
  - `waitlist-count`, with the holdfile as a second `waitlist-count` span with its own label. About 9% of sections have no counts. Registration is closed right now, so the holdfile markup is confirmed only via Jupiterp's parser.
  - Each meeting row: `section-days`, `class-start-time`/`class-end-time`, `building-code`, `class-room`, `class-type` (Discussion/Lab);
  - free-text notes in `section-text` (e.g. "Restricted to students in Freshmen Connection").
- **Delivery:** the section div has class `delivery-f2f`, `delivery-blended` or `delivery-online`. There is no explicit sync/async flag, so infer it:
  - online sync: days and times, room `ONLINE`;
  - online async: no days, plus an `elms-class-message` ("Class time/details on ELMS");
  - blended: a face-to-face row plus an ONLINE/ELMS row.
- **Seat freshness:** the page says "Open Seats as of 09/24/2026 at 10:30 PM", and it was unchanged 80 min later. Testudo's own update cadence is **UNVERIFIED**.
- **Hidden JSON endpoints:**
  - `/soc/autocomplete/course?termId=&searchString=` returns `{id, name}`;
  - `/soc/autocomplete/instructor?...` returns ids like "LAST,FIRSTMIDDLE";
  - `/soc/buildings/{CODE}%20{ROOM}` is an HTML popup that maps a 3-letter code to a **building number** (IRB = 432). This is the join key to map data.
- **Robots and rate limits:** `robots.txt` is a 404; there are no rate-limit headers. It sits behind an AWS load balancer on an old stack (jQuery 1.8, Java). Be polite: gzip, concurrency ≤ 4, a descriptive User-Agent with contact info, backoff.
- v1's selector code is in `reference/v1/` (`scrape-*.ts`, `from-soc.ts`).

### PlanetTerp (planetterp.com/api/v1): alive, lightly maintained
- `api.planetterp.com` 301s to `https://planetterp.com/api/v1`.
- Endpoints: `/course`, `/courses`, `/professor` (`reviews=true` gives rating, expected_grade and created), `/professors`, `/grades`, `/search`. Page limit 100.
- No auth. The docs ask users to be "respectful and don't hammer it".
- Grade data stops at **202501** (Spring 2025); only fall and spring terms are released. Reviews are current (latest seen 2026-04-29). About 48k reviews and 337k grade rows.
- The terms claim the compiled content. The owner decided we're OK using it: cache politely and link back.
- Grades include +/- and W (and "other"); render them PlanetTerp-style (`SPEC.md` §3.4).

### umd.io: alive but stale. Don't depend on it.
It has no 202701, `/professors` returns 502, it was last committed Jan 2024, and `/map/buildings` has 421 buildings but only 108 codes (IRB's is blank).

### Buildings and campus routing
- **Buildings:** the public UMD ArcGIS layer (no token):
  `https://services9.arcgis.com/1rOwFRpAwrxe0rBl/arcgis/rest/services/BuildingAllSearch/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json`
  - 332 buildings with footprints, `BUILDINGID`/`BLDG_NUM` (IRB = 432, CSI = 406), POINT_X/Y, LONGNAME and SHORTNAME. It has no 3-letter codes, so join through the SOC building popup.
- **Routing:** UMD's own network, as used by v1's `dev` branch (`reference/v1/gis.ts`):
  - A token comes from `https://maps.umd.edu/api/PortalToken/tokens.js`.
  - Entrances come from `gis.umd.edu/arcgis/rest/services/Navigation/DynamicRouting/MapServer/13/query` (filtered to non-emergency, `LOCATIONID = <building number>`).
  - Then `…/DynamicRouting{,Accessible}/NAServer/Closest%20Facility/solveClosestFacility` with incidents = entrances of A and facilities = entrances of B.
  - The response's `routes.features[].attributes.Total_Length` is in **feet**, and the route **geometry** (web mercator, wkid 102100) is in `routes.features[].geometry.paths`. Keep both: the connection map must draw the real path.
  - Check whether the NAServer exposes an OD Cost Matrix solver; that would compute distances in far fewer calls.
  - `maps.umd.edu` serves an **incomplete TLS chain**. curl and Node fail verification without the intermediate certificate, so bundle the intermediate (e.g. via `NODE_EXTRA_CA_CERTS`) where needed. Never disable verification. Whether Workers `fetch` accepts it is **UNVERIFIED**.
  - `gis.umd.edu` itself answers normally ("Token Required" without a token).
- **Fallback:** OSRM `foot` profile on OpenStreetMap, for distances only. The spec forbids straight-line route drawings; without real geometry, hide the map.

### Academic calendar
`https://provost.umd.edu/calendar.md` is clean Markdown (e.g. Fall 2026 classes start Aug 31, Fall Break Oct 12–13). The registrar's calendar pages return 403 to curl. Use it for .ics exclusions.

### Final exams
Not used; the owner dropped the feature.

### UMD's replacement system: Workday Student ("Elevate")
Sources: https://elevate.umd.edu/about-elevate/timeline and https://dbknews.com/2026/04/03/umd-town-hall-workday-testudo/
- It replaces SIS/SAR, Testudo and Venus.
- **Milestone 1 (Aug 2027):** curriculum management. Departments build **Fall 2028 sections in Workday from Sept 2027**. Fall 2027 through Summer 2028 stay in the old system.
- **Spring 2028:** first registration in Workday, which almost certainly means registering for Fall 2028. Fully launched Fall 2028.
- Old and new systems overlap during the transition.
- **Implication:** `/soc` scraping likely breaks for Fall 2028 data, around spring 2028. Keep sources behind adapters that produce the normalized schema.

### Other tools at UMD
- **Jupiterp** (jupiterp.com, AGPL-3.0, active):
  - PlanetTerp and RateMyProfessors ratings, multiple schedules;
  - a generator with required/optional courses, pins, filters and relaxation hints;
  - its scraper refreshes sections every 30 min.
  - **Don't use its data or code.**
- **Venus:** the official generator, behind login; being replaced by Workday.
- **Coursicle:** paid seat notifications.
- **TerpPlanner:** 4-year planning.

---

## 2. Other schools' schedulers and generator techniques

| Tool | Worth stealing |
|---|---|
| **Jupiterp** (UMD) | Generator ([`ScheduleGenerator.ts`](https://github.com/atcupps/Jupiterp)) with required/optional courses, pin by section or instructor, hard filters (open seats, earliest/latest, days off, min gap, min credits), fewest-options-first DFS capped at 500k steps / 1,000 results, 7 sort orders, and **one-click relaxation hints** when nothing fits. |
| **MIT Hydrant** | When courses clash: minimum-conflict search, shown as "1 of N". Per-component Auto/None/specific section. The whole state lives in the URL. |
| **GT Scheduler** | **Merges sections with identical meeting times** into one group, which collapses the search space. Pin/exclude by section number; lecture↔lab linking; Most Compact / Earliest Ending / Latest Beginning. |
| **Hyperschedule** | No generator at all: a priority list with starred courses always placed. "Use reordering, starring, and disabling, rather than paging through multiple schedules." |
| **UT Registration Plus** | Strikes through conflicting sections; one-click copy of section numbers; backup calendars; a campus-map pathfinder with walking minutes. UT **rejected auto-registration** over fairness concerns. |
| **UniTime** (Purdue) | A "click a class → alternatives with a full-schedule preview on hover" dialog; alternates per course request. |
| **AntAlmanac** (UCI) | ICS export that computes the **first real meeting date** instead of starting on the term start. |
| **CourseTable** (Yale) | Friend counts per course; named worksheets. |

**Generator recipe** (for `core/generate`):
1. Filter sections per course by the must-haves.
2. **Merge time-identical sections** (same meetings; keep a list of members for display as "×N equivalent").
3. Order courses by fewest candidates first.
4. Use per-day bitmasks of 5-minute slots (8am–10pm = 168 slots ≈ six 32-bit words per day), so a conflict check is a few ANDs.
5. DFS with a step budget, keeping a **top-K heap** by score rather than enumerating everything. Optional courses are tried "include" then "skip".
6. **When nothing fits:** relaxation hints (loosen each constraint in turn, count what it unlocks) and fewest-conflicts near-misses.
7. **Scoring inputs:** span per day, days on campus, earliest start and latest end, gaps, instructor rating, average GPA, travel time, and the **fewest open seats in any chosen section** (robustness).

**.ics details:**
- RRULE weekly with UNTIL in UTC;
- the first event on the first real meeting day;
- an `America/New_York` VTIMEZONE;
- EXDATEs for breaks and holidays at the class's local time;
- stable UIDs.

**LLM pitfalls, for the record:** LLMs fail at planning under many constraints (TravelPlanner: https://arxiv.org/abs/2402.01622). They also invent sections and are prompt-injectable via review text. That's why models only summarize reviews here, and treat review text as untrusted input.

---

## 3. Platform notes

- **Cloudflare Workers Paid** (verified at https://developers.cloudflare.com/workers/platform/limits/ on 2026-09-25):
  - HTTP CPU: 30 s default, configurable up to 5 min.
  - **Cron Triggers: 30 s CPU when the interval is under 1 hour; 15 min at 1 hour or more.**
  - 128 MB memory per isolate.
  - 10,000 subrequests per invocation (configurable higher).
  - 250 cron triggers per account.
  - CPU time excludes time spent waiting on `fetch`, so crawling is mostly wall time.
- **TanStack Start on Workers** (https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/):
  - A custom server entry `src/server.ts` can export both `fetch: handler.fetch` (from `@tanstack/react-start/server-entry`) and `scheduled(event, env, ctx)`.
  - Point `wrangler.jsonc` `main` at that file.
  - In server functions, bindings come from `import { env } from "cloudflare:workers"`.
  - Test crons locally with `curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=*+*+*+*+*"`.
  - Generate binding types with `wrangler types`.
- **R2:** free egress; 10 GB-month, 1M Class A and 10M Class B operations free per month. Serve through the Worker with the Cache API and ETags.
- **D1:** the free tier allows 100k row writes a day. We only use it for seat-alert subscriptions, so it isn't a bottleneck.
- **Search:** MiniSearch (fuzzy + prefix, field boosts) for ~10k records; uFuzzy is great for ranking short strings.
- **Drag and drop:** pragmatic-drag-and-drop if needed. Click and draw-to-create cover most of what's needed.

---

## 5. Recon for ingest (2026-09-25)

Everything here was re-verified live from a Linux container (Node 22, curl) on 2026-09-25 between 07:30 and 08:00 UTC, with `User-Agent: Terpsicle/2 (+https://terpsicle.com)`. The saved pages are in `src/ingest/__fixtures__/`, and its `README.md` indexes them. Counts marked "4 terms" cover every term listed today (202605, 202608, 202612, 202701).

### 5.0 Decisions this recon suggests for M2

1. **Seats job:** fetch only the `sections` endpoint, one request per department, per active term. Before doing any of that, read the "Open Seats as of" stamp from one small department page and **skip the term if the stamp hasn't changed**. That stamp has not moved from "09/24/2026 at 10:30 PM" all night. The CPU cost is small either way (§5.1.9).
2. **Routes:** build them with a Node script (`scripts/build-routes.ts`) run from a GitHub Actions workflow (manual dispatch plus a weekly schedule), not with the `41 * * * *` Worker cron.
   - Only the token endpoint (`maps.umd.edu`) has the broken TLS chain; `gis.umd.edu` is fine.
   - Node fails on `maps.umd.edu` without two extra intermediates, and Workers can't add CAs to `fetch`.
   - A full all-pairs build is tiny: about 190 requests and 2–3 min for both modes with geometry (§5.3). Resumability hardly matters.
   - If we want a Worker cron anyway, first run one probe from `wrangler dev --remote` to see whether Workers' `fetch` can reach `maps.umd.edu` (**UNVERIFIED**).
3. **Route geometry:** request `outSR=4326` and the server reprojects, so there's no mercator math. Simplify with Douglas-Peucker at 1 m and store as Google-polyline (precision 5): about 100 B per route. All pairs in both modes come to about 470 KB raw, so ship **one file per mode** (or per origin building) instead of one file per pair.
4. **Distances are symmetric** on every pair tested. Compute unordered pairs and reverse the geometry for the other direction.
5. **Accessible routes can be missing.** IPT (085), PBR (395) and GVC (795) have no accessible route to anything. The UI needs an honest "UMD's map has no accessible route for this connection" state.
6. **PlanetTerp:**
   - Key professors by `slug`, not name (names collide).
   - Reviews appear frozen since 2026-05-01, and grades stop at 202501. So the nightly job is cheap: 147 list requests find every new review (§5.5).
7. **Calendar:** parse `calendar.md` for the current and next two academic years. Summer 2026 (202605) is only on the HTML archived page, but every summer section carries its own start and end dates, so .ics for summer can use those.
8. **Tiles:** a Protomaps extract of 1.5 MB (z12–15) or 2.8 MB (z0–15) (§5.4). UMD's own raster basemaps use a non-standard tile grid and can't be themed.
9. **Match UMD's map app:** send its one hard-coded `ColeConstPoly` barrier, and drop card-only entrances in standard mode (§5.3). The barrier makes some distances up to about 2× longer.

### 5.1 Testudo SOC

#### 5.1.1 Terms
- `GET /soc/` has `select#term-id-input > option[value]` with the text "Summer 2026", "Fall 2026", "Winter 2027" and "Spring 2027". The newest term (202701) carries `selected="selected"`.
- Suffixes: `01` spring, `05` summer, `08` fall, `12` winter. Winter `YYYY12` is named for the **following** year ("202612 = Winter 2027").
- **Dropped terms are not a clean signal.** 202501, 202505 and 202508 are not listed but still return full data. 202408 returns HTTP 200 with 0 prefixes, and `…/CMSC` returns "No courses matched your search filters above." Archive by the dropdown, never by probing.
- An unknown prefix (`/soc/202701/XXXX`) also returns 200 with the same "No courses matched" text.

#### 5.1.2 Sizes and timing (concurrency 4, gzip, 0 retries today)

| term | depts | courses | sections | dept pages | sections pages | wall |
|---|---|---|---|---|---|---|
| 202701 | 199 | 4,380 | 7,228 | 29.7 MB raw / 2.4 MB gz, 7.3 s | 37.4 MB / 0.97 MB gz, 5.8 s | 13.1 s |
| 202608 | 207 | 4,706 | 8,339 | 32.0 MB / 2.6 MB gz, 11.9 s | 43.3 MB / 1.1 MB gz, 6.5 s | 18.4 s |
| 202612 | 90 | 527 | 444 | 4.9 MB / 0.7 MB gz | 2.3 MB / 0.14 MB gz | 4.2 s |
| 202605 | 119 | 1,183 | 1,180 | 9.1 MB / 1.0 MB gz | 6.5 MB / 0.27 MB gz | 5.6 s |

- A full catalog crawl of all 4 terms is 1,234 requests, about 41 s wall, 165 MB decoded and about 9.2 MB on the wire.
- Largest department is BMGT with 141 courses. Largest course is ENGL101: 107 sections in Fall 2026 and 92 in Spring 2027. 143 courses across the 4 terms have more than 12 sections.
- Typical latency is 50–500 ms; the worst was about 1 s (ENAE and ENCE sections).

#### 5.1.3 Sections batching
- `GET /soc/{term}/sections?courseIds=A,B,…` accepts ids from any department in one call.
- **The URL limit is about 8 KB** (Apache `LimitRequestLine`): 600 ids (4,997 chars) returned 200 in 1.2 s, and 1,000 ids (8,339 chars) returned **414**. So a whole term takes at least 8 calls.
- Per-department calls top out at 1,326 chars, so use per-department calls: natural chunks for streaming and writing.
- Unknown or section-less ids return a 21-byte `<div>…</div>` with 200.
- **Individual-instruction courses** (`.individual-instruction-message` "Contact department for information to register for this course.", 1,374 of 9,086 courses in 202608 plus 202701) have no "Show Sections" link and never appear in the sections response.

#### 5.1.4 Department page (`/soc/{term}/{DEPT}`): course selectors
- Course: `div.course#<ID>`, where the ID matches `[A-Z]{4}\d{3}[A-Z]?` (a letter suffix is common, e.g. `CMSC250H`, `CMSC389A`). `div.course-id` holds the same text.
- Title: `span.course-title`.
- Credits: `span.course-min-credits`, plus an optional `span.course-max-credits` for variable credits (1,364 courses; shown as "3 - 6").
- Grading: `span.grading-method abbr[title]`, drawn from Reg, Aud, P-F and S-F, comma-joined. 4 courses have none.
- Gen-ed: `.gen-ed-codes-group .course-subcategory > a` gives the code as text and the full name in `title`.
  - Between subcategories, the text node `,` means AND and ` or ` means alternatives.
  - A condition can follow the `<a>` inside the same span, e.g. `DSNL (if taken with GEOL110) or DSNS, SCIS`.
  - An empty group is `<div class="gen-ed-codes-group …"><div></div></div>`.
  - Suggested model: `genEds: Array<Array<{code, condition?}>>`, an AND of ORs.
- Permission: `span.perm-req-message` "(Perm Req)" (3,134 courses).
- Relationships:
  - `.crosslisted-as` "Cross-listed with: ENGL234." (531 courses);
  - `.offered-as` "Jointly offered with ANTH665." or "Jointly offered with: ANTH613." (224 courses; the colon is optional).
- Texts:
  - `.approved-course-texts-container .approved-course-text` appears 0–2 times.
  - When there are two, the first holds `<div><strong>Label:</strong> text</div>` lines and the second is the description. Labels seen:
    - Prerequisite (2,834)
    - Restriction (2,624)
    - Credit only granted for (2,288)
    - Formerly (1,317)
    - Additional information (532)
    - Cross-listed with (521)
    - Recommended (337)
    - Jointly offered with (224)
    - Corequisite (191)
    - Also offered as (5)
  - Unapproved or free text lives in `.course-texts-container .course-text` (0–2), with inline "Prerequisite: …<br><br>" prose.
  - `.prefacing-course-text` is rare (20).
- Syllabus count: the `(n)` span inside `.syllabus-fieldset`.
- **Seats timestamp:** `span#seats-update-time`, whose second `div` reads "09/24/2026 at 10:30 PM" (America/New_York). It appears on **department pages only** (not the sections endpoint), and only for terms with registration open (202605 and 202608 today, not 202612 or 202701). The value is the same on every page.

#### 5.1.5 Sections page: section selectors
- Course: `div.course-sections#<COURSEID>` contains `div.section.delivery-{f2f|online|blended}`. Counts over the 4 terms: f2f 13,551, online 2,500, blended 1,153.
- Section id:
  - `span.section-id` (text needs trimming);
  - also `input[name=sectionId]`;
  - an optional `span.footnote-marker` "*" follows it.
  - The footnote text is course-level: `.footnote-container .footnote-message`, the seat-management note. Only AAAS has one.
- Instructors: `span.section-instructor`, repeatable (911 sections have more than one).
  - The text can be wrapped in `<a href>` (582).
  - The literal `Instructor: TBA` appears in 1,479 sections.
  - 95% of 2,380 distinct Spring 2027 names match a PlanetTerp `name` exactly.
- Seats: `span.total-seats-count` and `span.open-seats-count` are always integers. The total is 0 in 220 sections. `span.open-seats` has `has-open-seats` when open > 0.
- **Waitlist and holdfile: key them by label, not position.** There are four shapes inside `span.waitlist`:
  - no counts at all (3,046);
  - one `waitlist-count` labeled "Waitlist:" (13,839);
  - class `waitlist has-waitlist` with "Waitlist:" and "Holdfile:" counts (317);
  - `has-waitlist` with **only "Holdfile:"** and one count (2, e.g. ARCH271). v1's `[1]` would misread this one.
  - Read each `.seats-info-label` and take the next `.waitlist-count`.
  - No nonzero waitlist or holdfile exists anywhere today (Spring registration isn't open), so the nonzero markup is still unconfirmed.
- Meetings: `div.class-days-container > div.row`, one per meeting pattern. The row shapes over the 4 terms:

  | shape | count | markup |
  |---|---|---|
  | normal | 17,446 | `.section-days` "MWF", `.class-start-time` "1:00pm", `.class-end-time`, `.building-code` "IRB", `.class-room` "0324" |
  | online sync | 1,253 | days and times, **no** `.building-code`, `.class-room` = `ONLINE` |
  | room TBA | 497 | days and times, `.building-code` = `TBA`, no `.class-room` |
  | online async | 2,944 | no days or times; `.elms-class-message` "Class time/details on ELMS" plus `.class-room` `ONLINE` |
  | no meeting info | 1,403 | a single `div.class-message` "Contact department or instructor for details." |
  | days TBA | 30 | `.section-days` = `TBA`, no times, but a building and room |

  - `span.class-type` is "Discussion" (3,440) or "Lab" (2,518); a missing value means the main meeting.
  - A **blended** section is an f2f row (prefixed by a `div.one.columns` blended icon) plus an async ONLINE/ELMS row.
- Days are concatenated tokens from `M Tu W Th F Sa Su`. Saturday appears in 25 rows and Sunday in 25 (BUSI/BUSO executive programs, EDUC online, `SaSu 8:00am-8:00pm`). **The schema must allow Sa and Su.**
- Times match `h:mm(am|pm)`. The earliest start is 6:00am (ARMY) and the latest end 10:15pm. End is always after start, and no meeting crosses midnight.
- **Non-standard dates:** `div.non-standard-dates-container .section-start-date` / `.section-end-date`, e.g. "March 1, 2027" (Month D, YYYY).
  - Every summer section has them (1,180 of 1,180); winter 35 of 444, fall 416, spring 335.
  - .ics must use them instead of the term dates.
- Notes: `.section-texts-container .section-text` (2,820), which can contain `<a>`. Examples: "This section is restricted to students in the Jimenez-Porter Writers' House."; "Registration is restricted to Biological Sciences-Shady Grove majors."
- **Cancelled sections have no marker** (no "cancel" string anywhere): they simply disappear. So "cancelled" can only come from diffing catalog runs (`diffPlanAgainstCatalog`).

#### 5.1.6 Building popup (`/soc/buildings/{CODE}%20{ROOM}`)
- It needs a real code **and** room: `/soc/buildings/IRB` is a 404, and an unknown code gives 404 or 500. It takes about 55 ms.
- Markup:
  - `.building-name a` holds the name (a commented-out older `<a>` precedes it, so strip comments first);
  - `.building-code .code` holds the code;
  - two `.facility-code` blocks are told apart by `.building-info-label`: "Bldg Number:" (zero-padded, e.g. `037`) and "Room Number:";
  - the map link carries `LocationName=432`.

#### 5.1.7 Codes seen
- 81 distinct `.building-code` values across the 4 terms; 73 in 202701, counting `TBA`. Non-3-letter codes: `BLD2/3/4` and `BSE4` (Shady Grove), `DC`, `BA`, `4MLK`, `EDUC`.
- The popup resolves 67 of them. 4 more are inferred from ArcGIS names because the popup fails:
  - BMS → 296 Biomolecular Sciences;
  - CHI → 059 Chincoteague;
  - HIL → 973 Hillel;
  - EDUC → 143, a one-off typo of EDU.
- That makes **71 resolved codes**, which map to 70 distinct building numbers.
- 10 are unresolved (`buildings/code-map-unresolved.json`):
  - `TBA`;
  - off campus: BLD2, BLD3, BLD4 and BSE4 (Shady Grove), DC and BA;
  - unknown: SEN (maybe Seneca 812), PWS and 4MLK, one section each.
- Every resolved number joins to an ArcGIS `BUILDINGID` (a zero-padded string). Display names are nicer from ArcGIS `NAME` ("Martin Hall" vs "Engineering Classroom Bldg. (Martin)"). Keep the SOC name as an alias for search.
- **Mapping new codes at scale:** the popup takes one request per code (using any room seen for it), about 55 ms each, so about 5 s for all 81 run one after another. Run it in the weekly buildings job only for codes missing from `buildings.json`.
- **The only bulk list** is UMD's own map layer `CampusMapDefault_NoInsite/FeatureServer/0` ("BuildingPublic"), which has a `BLDG_CODE` field (saved as `buildings/building-public.json`).
  - It has 95 codes.
  - It agrees with the popup on 54 of 55 shared codes; GLF is 166 there vs 165 in the popup.
  - It lacks 16 of ours, including newer buildings (ZUP, YDH, PSC, AJC) and BMS and CHI.
  - Its `POINT_X` is corrupt (state-plane feet) in 311 of 317 rows.
  - Use it as a cross-check and fallback; the popup stays primary.
  - umd.io has blank codes for these buildings.

#### 5.1.8 Seat freshness
- The stamp read "09/24/2026 at 10:30 PM" at 07:31, 07:52 and 07:56 UTC on 09-25 (5.5 h after the stamp), and the open and waitlist counts in 202608 CMSC were byte-identical between 07:33 and 07:52.
- With the earlier 80-min observation, this looks like a **nightly** refresh outside registration periods. The cadence during registration is **UNVERIFIED**; re-check when Spring 2027 registration opens.
- Jupiterp polls every 30 min.

#### 5.1.9 Seats job budget (`*/5`, 30 s CPU)
- Sections only for all 4 terms: 615 requests, 89.5 MB decoded, about 2.5 MB gz, about 16 s wall at concurrency 4.
- CPU for a streaming htmlparser2 seats-only parse (section id, total, open, labeled waitlist counts): **1.5 s for all 4 terms** (17,191 sections), 0.7 s for 202701 alone, measured on this container with Node 22. Gzip decoding and TLS add some.
- It fits easily. Still:
  - (a) skip terms whose seats stamp is unchanged (one small dept page per term);
  - (b) skip terms whose last class day (from the calendar) is past (202605 today);
  - (c) take course ids per department from the last catalog manifest.

### 5.2 Buildings (ArcGIS BuildingAllSearch)
- The layer has `maxRecordCount` 2000, so one query returns all 332 features. It's 847 KB with footprints, or 111 KB with `returnGeometry=false` (saved).
- Fields: `BUILDINGID` (string "039"), `BLDG_NUM` (int; null for 973 Hillel and 817), `LONGNAME` (upper case), `NAME`, `SHORTNAME`, `BLDG_CLASS`, and `POINT_X/POINT_Y` (a WGS84 centroid, even without `outSR`).
- `BUILDINGID` 817 appears twice.
- To add footprints later, use `outSR=4326&geometryPrecision=6`.

### 5.3 UMD GIS routing
- **TLS:**
  - `maps.umd.edu` sends its leaf certificate **twice** and no intermediate. The issuer is "InCommon Intermediate CA - OVG2C" (under "emSign Root TLS CA - G1", which is cross-signed by "emSign Root CA - G1"; that last one is in Node's and Mozilla's stores).
  - What works:
    - curl with `--cacert` set to the OVG2C cert alone works, because curl allows partial chains.
    - Node needs **both** OVG2C and the cross-signed emSign Root TLS CA - G1. OVG2C alone fails with `UNABLE_TO_GET_ISSUER_CERT`; nothing added fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Both certs are in `gis/umd-intermediates.pem`; use it with `NODE_EXTRA_CA_CERTS`.
    - `gis.umd.edu` serves the full chain and works in plain Node.
  - The AIA URL is `http://repository.emsign.com/certs/EEEMIncommonOVG2C.crt`. The leaf expires 2027-04-05, so re-check then.
  - `http://maps.umd.edu/...` redirects (301) to https, so it's no workaround.
- **Token:**
  - `tokens.js` is regenerated weekly (its "Last update: Sun Sep 20 2026 00:00:07 EDT" comment) and `expires` is 14 days later (2026-10-04T04:00Z). So any fetched token is valid for at least 7 days.
  - Parse it with `/"token":\s*"([^"]+)"/`. A browser UA is not needed.
  - Its scope is `DynamicRouting{,Accessible}/MapServer/13` and `NAServer/Closest Facility` (plus `QA_*` copies). `NAServer/Route/solve` also accepts it.
  - The anonymous `generateToken` needs credentials, and there's no other public token source. The services themselves answer 499 "Token Required".
- **Services** (ArcGIS Server 12.1, folder `Navigation`): `DynamicRouting` and `DynamicRoutingAccessible` NAServers each expose **only `Route` and `Closest Facility`**. There's no OD Cost Matrix and no Service Area.
  - `serviceLimits` is `{}`.
  - Network `Sidewalk_ND`, impedance `Length`, native SR 2248 (MD State Plane, feet).
  - There are no rate-limit headers (IIS/ASP.NET). Latency is 50–650 ms.
- **Entrances:** `MapServer/13/query` with `where=WEBMAP='Yes' AND NAV_USE='Yes' AND Entr_Type<>'Emergency Exit' AND LOCATIONID IN (…)`, fields `LOCATIONID, Accessible (Yes/No), Card_Acces, Entr_Type (Main/Other/…)`.
  - One query covers every building: 276 entrances for 69 of the 70 mapped buildings.
  - 438 Zupnik Hall has **no entrances yet**.
  - 15 entrances are `Accessible='No'`; filter those out in accessible mode.
- **Recipe that works** (v1 reproduced, and batched):
  1. **Distances:** one `solveClosestFacility` per origin building.
     - Incidents are that building's entrances; facilities are the entrances of every building after it in sort order.
     - Set `defaultTargetFacilityCount` to the number of facilities, `outputLines=esriNAOutputLineNone`, `returnFacilities=false` and `returnIncidents=false`.
     - Map results back with `IncidentID`/`FacilityID` (1-based indexes into the inputs) or with a `Name` you set.
     - **Set only `Name`:** field names are case-insensitive, so an entrance's `NAME` overwrites your `Name`.
     - Take the minimum `Total_Length` (**feet**) per building pair.
     - Measured for 69 buildings: 2,346 unordered pairs, **136 calls, 59 s wall** for both modes, 11.6 MB of JSON. Standard lengths run 43 ft to 12,191 ft (median 2,320, p90 5,170).
     - Accessible solved 2,080 pairs, at a median 1.085× the standard distance (p90 1.40×, max 5.8×).
  2. **Geometry:** `NAServer/Route/solve` with stops grouped by `RouteName` (`Sequence` 1 = the best incident entrance, 2 = the best facility entrance).
     - Measured: 20 routes in 1 call, 0.35 s, with lengths matching CF exactly.
     - At 100 routes per call, that's about 24 calls per mode.
     - Set `outSR=4326` to get `[lon, lat]` directly. If web mercator is ever needed: `lon = x/6378137·180/π`, `lat = (2·atan(e^(y/6378137)) − π/2)·180/π` (verified against the server's 4326 output).
     - Raw geometry is about 108 vertices per route, or about 4.5 KB of JSON. Douglas-Peucker at 1 m leaves about 35 vertices, and polyline5 encodes that to **about 100 B**.
  3. **Errors:**
     - A pair with no route returns HTTP 200 with `{"error":{"code":400,"message":"Unable to complete operation.","details":["No \"Facilities\" found for … No solution found."]}}`.
     - A partial success lists them in `messages[]` (type 50).
     - Treat an `error` object in a 200 response as failure.
- **Whole job:** about 2 × 70 CF calls plus about 50 Route calls, around 3 min wall, and a few seconds of CPU. Re-run fully whenever `buildings.json` changes, and weekly.
- **Mirror what UMD's own map does** (`https://maps.umd.edu/map/js/dynamicRouting.js`, read 2026-09-25). The numbers above were measured without the barrier and card filter below, so they're budget estimates, not final distances.
  - **The barrier matters.** The app always sends one hard-coded `polygonBarriers` ring named `ColeConstPoly` (lines ~497–532). This is the same ring as v1: web mercator x −8566188…−8566004, y 4719850…4720101, about lon −76.9514…−76.9497, lat 38.9873…38.9890, between Knight Hall and the Clarice Smith center.
    - With the barrier, PAC→KNI goes from 2,206 to 2,917 ft (standard) and from 2,206 to 4,548 ft (accessible). PAC→TYD accessible goes from 4,082 to 4,398 ft.
    - Keep it as **data** (a `routingBarriers` list in the routes config) so it can be dropped if UMD drops it.
    - The app also queries `CampusReference/FeatureServer/4` ("ConstructionLayer") but has the code that adds it commented out. `RoadClosures` (12) and `PurpleLineConstruction` (14) exist too. Don't use these unless UMD's app does.
  - **Entrance filters:**
    - Standard mode drops entrances with `Card_Acces='Yes'` from the destination, unless every entrance is card-only. Campus-wide that's 390 of 1,208 routable entrances.
    - Accessible mode queries entrances from `DynamicRoutingAccessible/MapServer/13` (the same 1,208 today) and drops `Accessible='No'`.
    - Because we solve unordered pairs, apply the filter to **both** ends.

### 5.4 Map tiles
- **UMD's own basemaps aren't practical** for MapLibre. `maps.umd.edu` uses raster `tiles.arcgis.com/tiles/1rOwFRpAwrxe0rBl/arcgis/rest/services/CampusBasemap{Detailed,Simplified,GrayCanvas}/MapServer` plus a labels-only `CampusBasemapAerialLabelsOnlyVT/VectorTileServer`.
  - The raster services use a **non-standard tiling scheme**: origin y = 30,241,100 instead of 20,037,508, and 10 LODs from scale 72,224 (≈ z13) to 141 (≈ z22). Standard z/x/y tile URLs return 404.
  - They're PNG only, so they can't be restyled for dark mode.
  - `exportTilesAllowed` is false and there's no copyright or terms text.
  - The UMD ArcGIS Online org itself (`services9`) holds only FeatureServer and SceneServer layers.
- Use a **Protomaps** extract (OSM, ODbL: the attribution "© OpenStreetMap" is required). The daily builds list at `https://build-metadata.protomaps.dev/builds.json`; the latest is `20260924.pmtiles`, 138 GB, v4.15.2.
  ```
  go install github.com/protomaps/go-pmtiles@latest   # binary: go-pmtiles
  go-pmtiles extract https://build.protomaps.com/20260924.pmtiles umd-campus.pmtiles \
    --bbox=-76.965,38.975,-76.915,39.005 [--minzoom=12]
  ```
  - That takes about 6 s and 28 range requests.
  - z0–15 is 2.8 MB (56 tiles); z12–15 is 1.5 MB.
  - Max zoom is 15, and MapLibre overzooms to 17+ fine.
  - The z15 tiles contain `footway`/`path`/`sidewalk`/`steps` and building names, which is enough context for route lines.
- Style with `@protomaps/basemaps` (it has light and dark flavors, covering both themes). Self-host glyphs and sprites in R2 alongside `geo/tiles.pmtiles`.

### 5.5 PlanetTerp
- **Shapes:**
  - `/professor` and `/professors` items: `{name, slug, type: "professor"|"ta", courses: string[] (with repeats), average_rating: number|null, reviews?: Review[]}`.
  - `Review`: `{professor, course: string|null, review, rating: 1..5, expected_grade: string ("", "A+", …, "W", "P", and junk like "95"/"d"), created: ISO-8601 UTC}`. Reviews have **no id**, so identify one by (slug, created).
  - `/course` and `/courses`: `{department, course_number, name, title, credits, description (HTML <b> labels), professors: string[], average_gpa: number|null, is_recent, geneds: null}`. `geneds` is always null, so take gen-eds from SOC.
  - `/grades` rows: `{course, professor, semester "YYYYMM", section (usually "0101", sometimes "501"), "A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","W","Other": int}`.
- **Limits and errors:**
  - `limit` ≤ 100; beyond that, 400 "limit parameter must be no more than 100".
  - `/grades` is not paginated (MATH140: 828 rows in one call) and needs `course` or `professor`.
  - A missing professor gives 400 `{"error":"professor not found"}`.
  - No auth, behind Cloudflare, no rate headers.
  - List endpoints are slow: about 1–3 s per page; about 3 s per 100 professors with reviews.
- **Totals:**
  - 14,496 professors (14,015 professor, 481 ta); 5,091 of them have reviews and a rating.
  - 47,914 reviews; 17,176 courses.
  - **Names collide:** Douglas Hamilton, Tiffany Lu and William Martin each have two slugs, and `/professor?name=` returns only one.
  - **The newest review is 2026-05-01**: 6 in May 2026, and none since. Last year there were 132–318 a month in Jun–Sep and 2,874 in May 2025. So intake appears to have **stopped**, and the "reviews are current" note in §1 is stale. Grades end at 202501.
- **A full pull** of `/professors?reviews=true` is 147 requests, 37.4 MB, 162 s at concurrency 3. `/courses` (no reviews) is 174 requests, 10.2 MB, 169 s.
- **Nightly plan** (`17 5 * * *`, 15 min CPU; the pull is mostly wall time):
  1. Page `/professors?reviews=true&limit=100&offset=k·100` until a short page, concurrency 2–3, parsing and discarding each page as it arrives.
  2. Per slug, compute `{avgRating, reviewCount, lastCreated, reviewsHash}` and diff against `planetterp/index.json` in R2.
  3. A changed hash means new or edited reviews. Mark that summary stale; summaries regenerate on demand.
  4. **Grades:** fetch `/grades?course=` only for catalog course ids with no stored grades, plus a 1/7 rotation of the rest (about 700 calls, about 6 min wall at concurrency 3). Grades haven't changed since 202501, so weekly is plenty.
  - Nightly total: about 150 list calls plus at most about 900 grade calls, well under the 10k subrequest cap and a few seconds of CPU.
  - Instructor join: SOC name → PlanetTerp `name` exact match covers 95% (2,271 of 2,380). Accent and punctuation normalization adds only 13. Keep a small manual alias map, and when two slugs share a name, pick the one whose `courses` includes the course.

### 5.6 Provost calendar (`calendar.md`)
- It's `text/markdown` with front matter (`title`, `date`, `canonical_url`). The body is flattened HTML tables, so collapse whitespace and tokenize.
  - A year block starts `### Fall 2026 - Summer 2027 (current)`.
  - Each season starts "Fall 2026 - Summer 2027 Events for the {Fall|Winter|Spring|Summer} Season".
  - Each event is "Event {name} Date {Month} {D}{st|nd|rd|th} ({Weekday})", optionally followed by "To to {Month} {D}th ({Weekday})". Yes, literally "To to".
- **Dates have no year.** Infer it from the block and season:
  - Fall: Aug–Dec of year Y.
  - Winter: January of Y+1, except "Winter Break" Dec 25–Jan 1, which crosses the year.
  - Spring and Summer: Y+1.
  - Check against the weekday in parentheses.
- **Term → block** (Y is the term's year):

  | term | block | season |
  |---|---|---|
  | `Y08` | "Fall Y - Summer Y+1" | Fall |
  | `Y12` | "Fall Y - Summer Y+1" | Winter (dates in Jan Y+1) |
  | `Y01` | "Fall Y-1 - Summer Y" | Spring |
  | `Y05` | "Fall Y-1 - Summer Y" | Summer |

- Event names:
  - start: "First Day of Classes" (fall/spring) or "Classes Begin" (winter);
  - end: "Last Day of Classes" or "Classes End";
  - breaks: "Fall Break", "Thanksgiving Recess", "Spring Break" (Sunday to Sunday), "Winter Break";
  - holidays: "Labor Day", "Dr. Martin Luther King Holiday", "Juneteenth Holiday", "Independence Day Holiday";
  - also "Reading Day", "Final Exams", Commencement entries, and summer "Sessions I and I-A Begin", "Session I-A Ends", "Session I-B Begins", "Sessions I and I-B End", "Sessions II and II-C Begin", …, "Sessions II and II-D End".
- Today it covers 2026–27 through 2028–29, so Spring 2027 is covered.
  - `/calendar/archived.md` returns 404 (an HTML error page with status 404), so past years are only in `/calendar/archived` (HTML, same text shape, 2023–24 to 2025–26).
  - For a term with no calendar block (202605 today), fall back to per-section non-standard dates, and skip holiday EXDATEs with a plain note.

### 5.7 Surprises that affect `core/schema`
- Meeting `days` must allow `Sa` and `Su`, plus a "TBA days" state.
- A meeting can have days and times with no room (`TBA`), or days and times with room `ONLINE` (online sync).
- A section can have **zero** meetings (async online, or "Contact department"), or a meeting with no time but with a room.
- Sections can carry their own `startDate`/`endDate`. Every summer section does, and some fall and spring ones.
- Waitlist and holdfile are **independently optional**; a section can have a holdfile but no waitlist number.
- `Instructor: TBA` is a sentinel, not a name. Instructors can be several per section.
- Course ids may have a letter suffix. Credits can be a range. Gen-eds are an AND of ORs with an optional "if taken with" condition.
- Building code → `{number?, offCampus?}`: off-campus codes (Shady Grove, DC, Baltimore) must not produce travel checks. Treat unknown codes as "no route", not as an error.
- Building numbers are zero-padded strings ("039"). Never parse them as ints.
- PlanetTerp professors are keyed by slug. Reviews have no id. Grade sections are not always 4 digits.
