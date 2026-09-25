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
