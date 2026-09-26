# Ingest fixtures (captured 2026-09-25)

Real responses saved byte-for-byte for golden tests of the `src/ingest` parsers. Don't hand-edit them: re-record with a script instead. The one exception is `gis/tokens.redacted.js`, where the token is replaced with `REDACTED`. Findings, selectors and limits are in `docs/RESEARCH.md` §5.

All captures used `User-Agent: Terpsicle/2 (+https://terpsicle.com)` and `Accept-Encoding: gzip`, between 07:31 and 07:53 UTC on 2026-09-25. Term ids appear here only because these are fixtures.

## `soc/`: Testudo Schedule of Classes (`https://app.testudo.umd.edu`)

| File | URL | Covers |
|---|---|---|
| `index.html` | `/soc/` | Term dropdown `select#term-id-input`: 202605 Summer 2026, 202608 Fall 2026, 202612 Winter 2027, 202701 Spring 2027 (`selected`). |
| `202701/departments.html` | `/soc/202701` | 199 `.course-prefix` rows (`.prefix-abbrev`, `.prefix-name`). |
| `202701/dept/CMSC.html` + `sections/CMSC.html` | `/soc/202701/CMSC`, `/soc/202701/sections?courseIds=<all 75 CMSC ids>` | Many-section courses (CMSC132: 18, CMSC216: 15, CMSC131: 9), Discussion rows, perm-req, variable credits, `TBA` building. |
| `202701/dept/AAAS.html` + sections | same pattern | Blended (f2f row plus an ONLINE/ELMS row), gen-eds, cross-listed, instructor wrapped in `<a>`, multiple instructors, `Instructor: TBA`, the only `footnote-marker` / `footnote-message` (seat-management note). |
| `202701/dept/ANTH.html` + sections | | Async online (`elms-class-message`, room `ONLINE`), non-standard dates (PLA sections), `section-text` with links, "Jointly offered with" (with and without a colon), `class-message` "Contact department…" rows. |
| `202701/dept/BUSI.html` + sections | | Saturday and Sunday meetings (`Sa`, `Su`, 9:00am–5:00pm), off-campus code `DC` (rooms `C2`/`C3`), `TBA` building, non-standard dates. |
| `202701/dept/AGNR.html` + sections | | Tiny page: `Instructor: TBA`, a `class-message` row with no meeting data, variable credits 3–6, `(Perm Req)`. |
| `202701/dept/IDEA.html` + sections | | `section-days` = `TBA` with no times but with a room; variable credits; two individual-instruction courses (`.individual-instruction-message`, no "Show Sections" link, absent from the sections response). |
| `202701/dept/ARMY.html` + sections | | Earliest times (6:00am, 6:30am), Lab rows. |
| `202701/dept/GEOL.html` + sections | | Conditional gen-eds (`DSNL (if taken with GEOL110) or DSNS`), cross-listed, Lab rows, `Instructor: TBA`. |
| `202701/sections/ENGL101.html` | `/soc/202701/sections?courseIds=ENGL101` | One course with 92 sections (the > 12 case). |
| `202701/sections/edge-cases.html` | `/soc/202701/sections?courseIds=BMGT220,ARCH271,BSCI343,EDCP738,VIPS208,BSCI456,GVPT415,BUSO700,BMGT110` | Cross-department batch. `waitlist has-waitlist` with Waitlist + Holdfile (BMGT220) and with **Holdfile only** (ARCH271). Unresolvable or odd building codes: `BLD4` (Shady Grove), `SEN`, `EDUC`, `BMS`, `CHI`. `SaSu` 8:00am–8:00pm with `TBA` (BUSO700). |
| `202701/dept/XXXX-unknown.html` | `/soc/202701/XXXX` | Unknown prefix: HTTP 200 with "No courses matched your search filters above." |
| `202608/dept/HESI.html` + sections | `/soc/202608/HESI` | Term with live seats: `#seats-update-time` "Open Seats as of 09/24/2026 at 10:30 PM". Building code `HIL` (the popup fails, so it's inferred). |
| `202612/dept/CMSC.html` + sections | `/soc/202612/CMSC` | Winter term, which has no seats timestamp. |
| `202605/dept/CMSC.html` + sections | `/soc/202605/CMSC` | Oldest listed term (Summer 2026, already over). Every section has non-standard dates. Use it for archiving tests. |
| `202408/departments.html`, `202408/CMSC.html` | `/soc/202408`, `/soc/202408/CMSC` | A term Testudo has dropped: 0 prefixes, and "No courses matched…" (HTTP 200). 202501/202505/202508 are unlisted but still return data. |
| `buildings/IRB-0318.html`, `buildings/SHM-2102.html` | `/soc/buildings/IRB%200318` | Building popup: `.building-name a`, then `.building-code .code` = code, and two `.facility-code` blocks told apart by label ("Bldg Number:", "Room Number:"). |

Not saved: for unknown or section-less course ids, the sections endpoint returns an empty `<div>` wrapper with only whitespace inside (21 bytes, HTTP 200).

## `planetterp/`: PlanetTerp API (`https://planetterp.com/api/v1`)

| File | Query | Covers |
|---|---|---|
| `professor-kruskal-reviews.json` | `/professor?name=Clyde%20Kruskal&reviews=true` | 111 reviews: `{professor, course (nullable), review, rating 1–5, expected_grade (free text), created (ISO UTC)}`. |
| `professor-hamilton.json` | `/professor?name=Douglas%20Hamilton` | Name collision: two professors share this name (slugs `hamilton`, `hamilton_douglas`), and the endpoint returns only one. Key professors by `slug`. |
| `professor-not-found.json` | `/professor?name=Nobody%20Here` | HTTP 400 `{"error":"professor not found"}`. |
| `course-CMSC351.json`, `course-ENGL101.json` | `/course?name=…` | `average_gpa`, `professors` (with repeats), `description` with `<b>` labels, `geneds` always null. |
| `grades-CMSC351.json` | `/grades?course=CMSC351` | 84 rows across 201201–202501. Keys `A+`…`D-`, `F`, `W`, `Other`. Not paginated. |
| `grades-CMSC351-kruskal-202501.json` | `…&professor=Clyde%20Kruskal&semester=202501` | Section `"501"` (not zero-padded). |
| `grades-no-params.json` | `/grades` | HTTP 400: needs `course` or `professor`. |
| `grades-course-not-found.json` | `/grades?course=CMSC999` | HTTP 400 `{"error":"course not found"}`: the only 400 that means "no grades" (captured 2026-09-26). |
| `professors-limit100-offset0.json` | `/professors?limit=100&offset=0` | List shape without reviews; `average_rating` null when there are no reviews. |
| `professors-reviews-limit10-offset3000.json` | `/professors?limit=10&offset=3000&reviews=true` | List with embedded reviews (the nightly diff source). |
| `professors-limit101.json` | `/professors?limit=101` | HTTP 400 `limit parameter must be no more than 100`. |
| `courses-limit20-offset0.json` | `/courses?limit=20&offset=0` | Course list. Not alphabetical. |
| `search-kruskal.json` | `/search?query=kruskal` | `[{type, name, slug}]`. |

## `provost/`

| File | URL | Covers |
|---|---|---|
| `calendar.md` | `https://provost.umd.edu/calendar.md` | Markdown with front matter. Academic-year blocks "Fall 2026 - Summer 2027 (current)", 2027–28 and 2028–29. Four seasons each; dates without years ("August 31st (Monday)", ranges "X To to Y"). |
| `calendar-archived.html` | `https://provost.umd.edu/calendar/archived` | HTML only (`/calendar/archived.md` is a 404). Holds 2023–24 through 2025–26, which covers Summer 2026 (202605). Includes a Winter Break range that crosses New Year. |

## `buildings/`

| File | Source | Notes |
|---|---|---|
| `building-all-search.json` | `https://services9.arcgis.com/1rOwFRpAwrxe0rBl/arcgis/rest/services/BuildingAllSearch/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json` | 332 buildings, attributes only (the footprint version is 847 KB). `BUILDINGID` is a zero-padded string ("039"); `BLDG_NUM` is an int and is null for Hillel (973) and Vehicle Wash (817, which appears twice). `POINT_X/Y` are WGS84 centroids. |
| `building-public.json` | `https://services9.arcgis.com/1rOwFRpAwrxe0rBl/arcgis/rest/services/CampusMapDefault_NoInsite/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json` | The layer UMD's own map uses. It has a **`BLDG_CODE`** field: 95 codes on 317 rows, and `BRD` sits on 5 buildings. Agrees with the popup on 54 of 55 shared codes (GLF: 166 here vs 165 in the popup), and 16 of our codes are missing, including newer buildings. `POINT_X` is broken (state-plane feet) in 311 rows, so take coordinates from BuildingAllSearch. It's a bulk cross-check, not the primary source. |
| `code-map.json` | derived | 71 SOC codes seen in any listed term, mapped to `{number, name (SOC popup), arcgisName, lon, lat, source: soc-popup/inferred, meetings, terms}`. Four are `inferred` because the popup fails (BMS, CHI, HIL, EDUC). Seed for `buildings.json`. |
| `code-map-unresolved.json` | derived | 10 codes and why: TBA; off campus (BLD2/3/4, BSE4 = Shady Grove; DC; BA); unknown (SEN, PWS, 4MLK). |

## `gis/`: UMD campus routing (`gis.umd.edu` ArcGIS 12.1)

| File | Request | Notes |
|---|---|---|
| `umd-intermediates.pem` | chain served by `gis.umd.edu` | "InCommon Intermediate CA - OVG2C" (expires 2029-04-07) plus the cross-signed "emSign Root TLS CA - G1" (expires 2039-07-09). Node needs **both** in `NODE_EXTRA_CA_CERTS` to reach `maps.umd.edu`. |
| `tokens.redacted.js` | `https://maps.umd.edu/api/PortalToken/tokens.js` | `var tokenJSON = {portaltrue: {"40": {credentials: [{token, expires, resources}]}}}`, with a "Last update" comment. Token REDACTED. |
| `naserver-DynamicRouting.json`, `closest-facility-layer.json` | `…/DynamicRouting/NAServer?f=json`, `…/NAServer/Closest%20Facility?f=json` | Only Route and Closest Facility layers; no OD cost matrix. Impedance `Length`, network `Sidewalk_ND`, no `serviceLimits`. |
| `entrances-{432,406,039,088,085}.json` | `…/DynamicRouting/MapServer/13/query` (outSR 4326) | IRB 6, CSI 3, VMH 7, EGR 4, IPT 2 entrances. `entrances-432-wkid102100.json` is the same query in web mercator. |
| `cf-432-406-{standard,accessible}[-wkid102100].json` | `solveClosestFacility` | IRB→CSI: 196.96 ft in both modes, 9 vertices. |
| `cf-039-088-{standard,accessible}.json` | | VMH→EGR (Martin Hall): 3,689 ft standard and 4,266 ft accessible; ~135 vertices. The accessible result includes "No Facilities found" messages for some incidents. |
| `cf-085-084-{standard,accessible}.json` | | IPT→MTH: standard OK; accessible fails with HTTP 200 `{"error":{"code":400,…"No solution found."}}`. |
| `cf-batch-039-to-20-standard-nolines.json` | CF with 7 incidents × 101 facilities (20 buildings), `defaultTargetFacilityCount=101`, `outputLines=esriNAOutputLineNone` | 665 routes, 0.65 s: the batched distance call. |
| `route-multi-039-to-20-standard.json` | `…/NAServer/Route/solve` with 40 stops grouped by `RouteName` | 20 routes with geometry in one call (0.35 s). Lengths match CF exactly. |

## `golden/`: expected parser output

`202701-{AGNR,ARMY,BUSI,IDEA}.json` are the normalized department chunks `src/ingest/soc/soc.test.ts` builds from the saved pages above (Vitest file snapshots). A parser change that alters them fails the test. Review the diff, then update them deliberately with `pnpm vitest run --project ingest -u`.
