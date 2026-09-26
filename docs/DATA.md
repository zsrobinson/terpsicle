# Terpsicle v2: data contract

The shapes and rules that `src/ingest` + `src/jobs` (producers), `src/server` (the `/api` endpoints, D1) and the app (consumers) share. The code is `src/core/schema/` (zod 4 schemas + inferred types, one barrel: `~/core/schema`). **If this document and the schemas disagree, the schemas win; fix this document in the same PR.**

Naming: every schema is `FooSchema` with `type Foo = z.infer<typeof FooSchema>`. Constants are `SCREAMING_CASE`. Time is always passed in, never read (`CLAUDE.md`).

---

## 1. Identifiers

| Thing | Format | Schema / helper |
|---|---|---|
| Term id | `YYYYMM`, month code `01` spring · `05` summer · `08` fall · `12` winter. Winter `YYYY12` is labeled for the following year (`202612` is "Winter 2027"; `Term.year` = 2027). Never literal in `src/` outside fixtures/tests (lint greps for it). | `TermIdSchema`, `SEASON_BY_MONTH_CODE` |
| Day | `M Tu W Th F Sa Su` (Testudo's tokens). Sets are unique and in week order, so equal sets are equal arrays. | `DaySchema`, `DAYS`, `DaysSchema` |
| Clock time | Integer minutes since America/New_York midnight (9:30am = 570). | `MinutesSchema` |
| Instant | UTC ISO string from `toISOString()`. | `IsoDateTimeSchema` |
| Date | `YYYY-MM-DD`, America/New_York. | `IsoDateSchema` |
| Department | 4 capitals: `CMSC`. | `DeptCodeSchema` |
| Course code | dept + 3 digits + an optional suffix letter: `CMSC351`, `CMSC250H` (every id in the recon pages fits). Department = `code.slice(0, 4)`. | `CourseCodeSchema` |
| Section code | exactly 4 capitals/digits: `0101`, `FC01`, `ESG1`, `PLA2` (every id in the recon pages fits). | `SectionCodeSchema` |
| **Section key** | `<course>-<section>`: `CMSC351-0101`. The one id for a section within a term (seats map, plans, share links, alerts, problems). Split on the first `-`. | `sectionKey()`, `parseSectionKey()`, `SectionKeySchema` |
| Building code | Testudo's: `IRB`, `BLD4`, `4MLK` (2–6 capitals/digits). `TBA` is never a code (ingest makes it `null`). | `BuildingCodeSchema` |
| Building number | UMD's zero-padded string: `039`, `432`. Never an int. | `BuildingSchema.number` |
| Gen-ed code | 4 capitals, validated by shape so a new category never breaks ingest. Labels for known ones in `GEN_ED_LABELS`. | `GenEdCodeSchema` |
| Content hash | First 16 hex chars of SHA-256 of the file's exact bytes. | `ContentHashSchema` |
| Instructor slug | PlanetTerp's slug (`kruskal`). | `InstructorSlugSchema` |
| Local id | 8–64 URL-safe chars, minted in the browser (plans, blocks). | `LocalIdSchema` |
| Connection id | `<day>:<fromKey>#<meetingIdx>><toKey>#<meetingIdx>` | `connectionId()` |
| Directory ID | The lowercased local part of a verified TerpMail or umd.edu address (`zsrobins`). Accounts are keyed on it. | `DirectoryIdSchema` |
| Chat room id | Course room `<term>:<course>`, section room `<term>:<course>:<section>`, lecture room `<term>:<course>:L:<first section>` (the lowest-numbered section sharing the lecture). Codes only, so a time or room change keeps the id and the history. The course room id is also its `CourseChat` object's name. | `RoomIdSchema`, `courseRoomId()`, `lectureRoomId()`, `sectionRoomId()`, `parseRoomId()`, `courseChatName()` |

---

## 2. R2 layout and publishing

### 2.1 Keys

All keys are built by helpers in `src/core/schema/keys.ts`; never concatenate them by hand. The browser reads `/data/<key>`.

| Key | Schema | Written by | Named |
|---|---|---|---|
| `catalog/terms.json` | `TermsFileSchema` | catalog job (6 h) | fixed |
| `catalog/<term>/manifest.json` | `ManifestSchema` | catalog job + seats job (see 2.4) | fixed |
| `catalog/<term>/dept/<DEPT>.<hash>.json` | `DeptChunkSchema` | catalog job, seats job on section changes | hashed |
| `catalog/<term>/seats.<hash>.json` | `SeatsFileSchema` | seats job (5 min) | hashed |
| `catalog/<term>/changes.<hash>.json` | `ChangesFileSchema` | seats job | hashed |
| `planetterp/manifest.json` | `PlanetTerpManifestSchema` | PlanetTerp job (daily) | fixed |
| `planetterp/dept/<DEPT>.<hash>.json` | `PlanetTerpDeptSchema` | PlanetTerp job | hashed |
| `geo/manifest.json` | `GeoManifestSchema` | buildings job (weekly), routes script (weekly, GitHub Actions) | fixed |
| `geo/buildings.<hash>.json` | `BuildingsFileSchema` | buildings job | hashed |
| `geo/routes.<hash>.bin` | binary, §4.2 | routes script | hashed |
| `geo/route/<from>-<to>-<mode>.json` | `RouteGeometrySchema` | routes script | fixed |
| `geo/tiles.pmtiles` | PMTiles | script, rarely | fixed |
| `calendar/<term>.json` | `AcademicCalendarSchema` | calendar job (weekly) | fixed |
| `summaries/<slug>.json` | `ReviewSummarySchema` | `POST /api/review-summary` (§7.2) | fixed, **not served** |
| `_jobs/…` | owned by M2, §2.6 | jobs (baselines, rotation state, reports) | **not served** |
| `reviews/manifest.json` (v2) | `ReviewsManifestSchema` | `reviews-publish` job (hourly) | fixed |
| `reviews/dept/<DEPT>.<hash>.json` (v2) | `ReviewsDeptSchema`: Terpsicle-review ratings per instructor id, and names of minted instructors. Never review text | `reviews-publish` job | hashed |

**v2, bucket `terpsicle-user-content`** (binding `USER_CONTENT`; previews use `terpsicle-user-content-preview`): `avatars/<userId>/<hash16>.<ext>`, cached Google profile pictures, served at `/avatars/*` only with a session and never through `/data` (`docs/V2.md` §4.5). The `reviews/` family adds `reviews` to `SCHEMA_VERSIONS`; `ReviewSummarySchema` gains optional `sources` (additive).

### 2.2 Content hashing
- Hash = SHA-256 of the exact UTF-8 bytes written (`JSON.stringify(value)`, no whitespace), first 16 hex chars.
- Build objects in a deterministic key and array order (schema field order; arrays sorted as each schema's comments say), so unchanged data hashes the same.
- **Hashed files carry no timestamps.** Times that change every run (`fetchedAt`, `generatedAt`) live in the fixed-name manifest instead. That's why seats' `fetchedAt` is in the manifest, not the seats file: unchanged counts keep their hash and clients don't refetch.
- A hashed key is never overwritten with different bytes.

### 2.3 Schema versions
- `SCHEMA_VERSIONS` has one integer per family: `catalog`, `planetterp`, `geo`, `calendar`, `summaries`. Every JSON file has `schemaVersion: <literal>`. The routes binary has its own header version (`ROUTES_BINARY_VERSION`); share links have `v` (`SHARE_PAYLOAD_VERSION`).
- **Readers strip unknown keys** (plain `z.object`). So adding an optional field is not a bump: older clients ignore it. Bump only for breaking changes: a field removed, renamed, retyped, made required, or its meaning changed.
- Clients parse `WireEnvelopeSchema` first:
  - data version > client's → the open tab is stale; keep using the cache and reload the app at the next visibility change;
  - data version < client's → the jobs haven't republished yet; keep a compatible cache or show the loading state, and retry on the next poll.
- A bump drops that family's IndexedDB cache (full refetch).
- Deploys that bump a family: the next run of the job that writes that family sees the published `schemaVersion` differs and republishes everything (hashes don't match, so every file is rewritten). For catalog that's the catalog job, up to 6 h later; the seats job skips a term until its manifest has the current version. So after deploying a catalog bump, run `pnpm tsx scripts/ingest.ts catalog --target r2` (then `seats`) instead of waiting.
- Server-fn inputs are the exception: they use `z.strictObject` (untrusted input, reject unknown keys).

### 2.4 Writing
- Write order: every new hashed file first, the manifest last. A manifest never points at a file that doesn't exist yet.
- **Two jobs write `catalog/<term>/manifest.json`** (catalog: `departments`, `catalogCrawledAt`; seats: `seats`, `changes`). Each does read → change only its own fields → set `generatedAt` → `put` with `onlyIf: { etagMatches }`; on a failed precondition it re-reads and retries (up to 5 times). `geo/manifest.json` follows the same rule (buildings job vs routes script).
- Department chunks include section fields (meetings, instructors, notes), so a section change seen by the seats job rewrites that department's chunk in the same run as the `changes` entry that reports it. The catalog and the changes file never disagree for longer than one run.
- Garbage collection: the catalog job deletes hashed files under a term that no current manifest references and that are older than 24 h. The 24 h grace keeps a client's in-flight diff working.

### 2.5 Serving `/data/*`
The Worker maps `/data/<key>` to R2 and applies `dataCachePolicy(key)` (in `keys.ts`). A `null` policy means 404. Every response carries an ETag, and `If-None-Match` gets a 304.

| Keys | Browser | Worker Cache API |
|---|---|---|
| hashed (`*.<16hex>.json\|bin`) | `public, max-age=31536000, immutable` | 1 year |
| `catalog/terms.json`, `catalog/<term>/manifest.json` | `public, no-cache` (revalidate with ETag) | 60 s |
| `planetterp/manifest.json`, `geo/manifest.json` | `public, no-cache` | 1 h |
| `calendar/<term>.json` | `max-age=3600` | 1 h |
| `geo/route/*.json` | `max-age=86400` | 1 day |
| `geo/tiles.pmtiles` | `max-age=604800`, Range requests | 1 week |
| `summaries/*`, `_jobs/*` (including the stored PlanetTerp review text), anything else | 404 | — |

### 2.6 Job state (`_jobs/`, not served)
The jobs' memory between runs. Everything here can be rebuilt by running the job again, so a file that fails validation is ignored rather than fatal.

| Key | Written by | Holds |
|---|---|---|
| `_jobs/seats/<term>/baseline.json` | seats | Testudo's last seats stamp, the last full refresh time, each department's chunk hash and course list, and every section's `SectionSnapshot` (the diff base for `changes`) |
| `_jobs/catalog/<term>/orphans.json` | catalog | when each unreferenced hashed file was first seen, for the 24 h garbage-collection grace |
| `_jobs/catalog/building-rooms.json` | catalog | every building code seen, with one room, for the buildings job's popup lookups |
| `_jobs/buildings/discovered.json` | buildings | codes joined (or not) since the checked-in seed, with why; failures retry after 30 days |
| `_jobs/planetterp/grades.json` | PlanetTerp | per course, grades summed per PlanetTerp professor name, and when they were fetched (the rotation order). A course's rows are never replaced by an empty answer (§4.1) |
| `_jobs/planetterp/unmatched.json` | PlanetTerp | Testudo instructor names with no PlanetTerp match, and how many names each matching rule joined |
| `_jobs/planetterp/state.json` | PlanetTerp | the last run's verdict (`status`, `reason`, `lastRunAt`) and the last good run's `lastSuccessAt`, professor and review totals (the baseline for the sanity floors, §4.1), `latestReviewAt` and `gradesThrough` |
| `_jobs/planetterp/reviews/<slug>.json` | PlanetTerp | `StoredReviewsSchema`: the review text the nightly list pull already downloads, so summaries can be regenerated if PlanetTerp goes away (§7.2). **Written only when `PLANETTERP_KEEP_REVIEW_TEXT` is `"true"`** (unset in production until the owner decides whether we may keep it; summaries fetch live meanwhile). **A private cache, never served or republished**: it's PlanetTerp's users' writing, and we only feed it to the summary model. Never shrinks: an empty or shorter list keeps the stored file (so a review PlanetTerp deletes stays until the file is deleted) |
| `_jobs/planetterp/reviews-index.json` | PlanetTerp | per slug, the stored file's hash and review count, so a run writes only files that changed (at most `MAX_REVIEW_WRITES` a run) |
| `_jobs/routes/state.json` | routes script | feet per building-number pair and mode, entrance hashes per building, and which geometry files exist |

---

## 3. Catalog

### 3.1 Terms
`terms.json` lists every term ever seen, newest first. `status: "active"` means it was in Testudo's dropdown on the last catalog run; a term that drops off becomes `"archived"`, and its files stay. `name` is Testudo's label, verbatim. Core picks the default term: the newest active fall or spring, unless `UiPrefs.lastTermId` is set.

### 3.2 Normalization rules (ingest's output)
- **Course text:** the `approved-course-text` blocks become `prerequisite`, `corequisite` and `restriction` when labeled so. Other labeled blocks go to `otherNotes` (`{label, text}`: "Credit only granted for", "Formerly", "Additional information", "Recommended"). The unlabeled paragraph is `description`. All text is whitespace-normalized, and empty text is `null`.
- **Gen-eds:** `genEds` is a list of groups that all apply (`,` in Testudo). Within a group the course counts for exactly one option (` or `; the student chooses). An option is `{code, condition?}`, where `condition` is Testudo's parenthetical without parentheses. So "DSNL (if taken with GEOL110) or DSNS, SCIS" becomes `[[{code:"DSNL",condition:"if taken with GEOL110"},{code:"DSNS"}],[{code:"SCIS"}]]`. A filter for code X matches any course with X in any option; the UI shows the condition next to the tag.
- **Cross-listings:** `crossListings` holds the codes from "Cross-listed with", "Jointly offered with" (colon optional) and "Also offered as".
- **Credits:** `{min, max}`; `max > min` for variable credits ("3 - 6").
- **Individual instruction:** a course with "Contact department for information to register for this course." has `contactDepartment: true` and no sections (Testudo lists none).
- **Sections:** sorted by `code` (section-number order) and unique within a course.
  - `instructors` is empty for "Instructor: TBA", and **sorted by name**: Testudo lists co-instructors in a different order from one request to the next, which would otherwise read as a change every run.
  - `notes` is the free text (a course footnote such as the seat-management note is appended to the sections it marks).
  - `restriction`: the sentences of `notes` that limit who can register, joined with a space, with a leading "Restriction:" dropped; `null` when none do. A sentence counts when it matches `restrict(ed|ion|s)`, `reserved for`, `limited to`, `not eligible`, `open only to`/`only open to`, or starts with `Must be`/`Must have` (`restrictionOf` in `src/ingest/soc/normalize.ts`). Checked against every note in the four saved terms: it catches "Restricted to students in Freshmen Connection.", "Must be in the Computer Science (M.S.) program.", "Golden ID students are not eligible for this section.", and leaves out links ("Click here …") and advice ("Other students may request enrollment…").
  - `dates` is set when Testudo lists non-standard dates (`.section-start-date`/`.section-end-date`): every summer section and a few hundred per fall or spring term. .ics uses them instead of the term's dates, and two sections whose spans don't intersect never overlap.
  - There's no cancelled flag. Testudo has no marker; a cancelled section just disappears (§3.3).
- **Meetings:** one per Testudo row, in row order.
  - Rows with days and times are `timed: true`. `days` are never empty (`Sa` and `Su` occur) and `end > start`. No meeting crosses midnight.
  - Rows without set times are `timed: false`: ELMS async ("Class time/details on ELMS", room `ONLINE`), and days `TBA` (which keeps its building and room).
  - A room of `ONLINE` gives `online: true, building: null, room: null`. A building of `TBA` gives `building: null, room: null, online: false` (location to be announced).
  - Off-campus codes (`BLD4`, `DC`, …) are kept as `building`; they never form a connection (§4.4).
  - A section whose only row is "Contact department or instructor for details." has `meetings: []`; treat it like no set times.
  - `kind` is `discussion`/`lab` from `class-type`, `lecture` when blank, `other` for anything else.
- **Delivery** (`RESEARCH.md` §1), from the `delivery-*` class:
  - `f2f`;
  - `blended`;
  - `online-sync` when an online section has timed meetings;
  - `online-async` when it has none.
- **Seats:** from the sections endpoint, as `[open, total, waitlist, holdfile]` (non-negative; ingest clamps negatives to 0). Waitlist and holdfile are each `null` when Testudo doesn't show that count, independently: read each `.seats-info-label` and take the next `.waitlist-count`, never by position (ARCH271 shows only a holdfile). Sections with no counts at all (about 9%) are left out of the map, and the UI says "Seats unknown". `asOf` is Testudo's "Open Seats as of MM/DD/YYYY at h:mm AM", read as America/New_York and stored in UTC. The freshness label uses `asOf`, or the manifest's `seats.fetchedAt` when `asOf` is null.
- Seats are **not** in department chunks. If they were, every 5-minute seats change would re-hash every department and defeat manifest diffing.

### 3.3 Changes
The seats job compares each run's sections with the previous run's (kept in `_jobs/`) and appends:
- `added`: `after`;
- `changed`: `before` and `after`. `SectionSnapshot` covers instructors, delivery, meetings and dates; a seats-only change is never a change;
- `cancelled`: `before`. The section vanished. Testudo has no cancelled marker, so this diff is the only source of "cancelled".

The file keeps a rolling 30-day window, newest first. Plans don't depend on it for correctness: `core/catalog` diffs each placed course's snapshot against the current catalog, and a missing section means cancelled. `changes` only adds *when* the change happened.

---

## 4. Reference data

### 4.1 PlanetTerp (per department)
- **One file per department** holds:
  - `instructors`: slug → `Instructor`, covering everyone teaching a section of that department in any active term plus everyone in its grade data;
  - `names`: `instructorNameKey(testudoName)` → slug. The join is done once, in ingest;
  - `courses`: course code → `{all, byInstructor}` grade records.

  Everything is keyed by **slug**, never by name: PlanetTerp names collide (two "Douglas Hamilton"s). When two slugs share a Testudo name, ingest picks the one whose `courses` includes the course.

  The join (`src/ingest/planetterp/names.ts`) tries, in order: exact name; the hand-checked `aliases.json`; names equal once accents, apostrophes, punctuation, spacing, parentheticals and suffixes are ignored; then nicknames, extra middle names or surname parts, shortened given names and initials. Those last four need course evidence (two shared courses, or one that few PlanetTerp people taught or from someone who mostly teaches in the instructor's departments), never take the slug of someone teaching under that exact name, and match nobody on a tie. A wrong rating is worse than none.
- PlanetTerp grade rows carry section numbers that aren't always zero-padded (`"501"`); we only store per-course and per-instructor sums, so sections never reach our files.
- **Never replace good data with empty data.** PlanetTerp looks unmaintained (reviews stopped in May 2026, grades end in Spring 2025), so the job assumes it can fail in ways that still parse:
  - **Sanity floors** (`src/ingest/planetterp/source.ts`). A run whose professor list is empty, or has more than 10% fewer professors or reviews than the last good run (`_jobs/planetterp/state.json`), is a source failure. So is a list that doesn't arrive at all. The job then publishes nothing new: the department files and the manifest's `departments` stay as they were, the manifest's `source.status` becomes `stale` (`gone` after 30 days without a good run), the reason goes in the job state, and the cron reports `cron_job_failed` with the reason as `firstError` (`docs/ANALYTICS.md`).
  - **Grades never go from something to nothing.** `/grades` answers 400 `{"error":"course not found"}` for a course it doesn't know; only that 400 means "no grades", and any other error keeps the stored rows. An empty answer for a course that had rows keeps the old rows too; only a course with no stored rows may stay empty.
- **`source`** in `planetterp/manifest.json` (`PlanetTerpSourceSchema`) is `{status, lastSuccessAt, gradesThrough, latestReviewAt}`. It was added without a version bump (§2.3: an optional field; older clients strip it, and manifests without it read as "unknown"). `status`:
  - `ok`: the last run was good and PlanetTerp has published a review in the last six weeks;
  - `stale`: the last run was a source failure, or PlanetTerp has published no review for six weeks (its ratings are frozen);
  - `gone`: no good run for 30 days.

  The client reads it through `useInstructors(dept).source` (and `usePlanetTerpStatus`). The Grades header says what grades cover ("through Spring 2025, from PlanetTerp", from `gradesThrough`), and the Reviews disclosure adds one quiet line when `status` isn't `ok` ("No new PlanetTerp reviews since Apr 2026", or "PlanetTerp hasn't updated since …" when there's no newest review to name). No banner (`DESIGN.md` §5). A department file that fails to load says so ("Couldn't load grades from PlanetTerp…"), never "PlanetTerp has no grades".
- **Reviews** (`ReviewSchema`) are only the review-summary fn's input: `{course, text, rating, expectedGrade, created}`. They have no id, so (slug, `created`) identifies one; `expectedGrade` is free text ("A-", "P", "95", "") and is never parsed. The job keeps them in `_jobs/planetterp/reviews/` (§2.6), a private cache we never serve or republish.

  An instructor who teaches in two departments appears in both files.
- **`GradeCounts`** is a 15-tuple in `GRADE_KEYS` order (`A+ A A- B+ B B- C+ C C- D+ D D- F W Other`).
  - Average GPA uses `GRADE_POINTS` over A+…F only; W and Other are excluded, matching PlanetTerp.
  - "% A or B" is (A+…B−) ÷ (A+…F).
  - Core computes both; nothing is stored precomputed.
- Grade bars: one bar each for A, B, C, D, F, W and Other. The A–D bars are split into +/plain/− segments.
- Link to `planetTerpUrl(slug)`.

### 4.2 Routes binary: `geo/routes.<hash>.bin`
Little-endian throughout.

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | magic, ASCII `TRPR` (`ROUTES_MAGIC`) |
| 4 | 2 | layout version, uint16 = `ROUTES_BINARY_VERSION` (1) |
| 6 | 2 | `N`, building count, uint16 |
| 8 | 1 | `M`, mode count, uint8 = 2 |
| 9 | 3 | reserved, zero |
| 12 | 4 | `L`, index byte length, uint32 |
| 16 | `L` | index: UTF-8 JSON matching `RoutesIndexSchema` (`{buildings: BuildingCode[N], modes: ["standard","accessible"]}`), buildings sorted and unique |
| 16+L | `P` | zero padding, `P = (4 − (16+L) mod 4) mod 4` |
| `D = 16+L+P` | `2·M·N·N` | `M` matrices of `N×N` uint16, row-major |

- Cell `(m, i, j)` sits at byte `D + 2·(m·N·N + i·N + j)`. It holds walking feet from `buildings[i]` to `buildings[j]` in `modes[m]`, rounded to the nearest foot and clamped to `ROUTES_MAX_FEET` (65533).
- Two sentinels: `ROUTES_UNKNOWN` (65535) means not computed yet; `ROUTES_NO_ROUTE` (65534) means UMD's network found no route (common in accessible mode: IPT, PBR and GVC have none). The diagonal is 0.
- The file length is exactly `D + 2·M·N·N`; decoders reject anything else.
- Matrices are directed, but every pair measured in recon was symmetric, so the job solves unordered pairs and fills both cells.
- Distances come from UMD GIS; an OSRM fallback fills a cell only when GIS fails, and never produces geometry. Size is about 160 KB at N = 200 (20 KB at today's 71 codes). The encoder is `encodeRoutes` in `src/ingest/routes/encode.ts`; the client's decoder belongs in `core/travel` (M1).

### 4.3 Route geometry
`geo/route/<from>-<to>-<mode>.json` is fetched only when a connection's map opens.
- `coordinates` are `[lng, lat]` in WGS84 with 6 decimals. UMD's solver returns them in WGS84 (`outSR=4326`), and ingest simplifies the path (Douglas–Peucker, 1 m), so a typical file is 1–2 KB.
- One file per ordered pair and mode: the reverse direction is the same path reversed. Codes that share a building number (`EDU`/`EDUC`) each get their own files.
- `lengthFeet` equals the binary's cell.
- If the file is missing (404), hide the map. Never draw a straight line.

### 4.4 Buildings
`BuildingsFile` holds every Testudo building code seen in any term that joined, via the SOC popup's building number (a zero-padded string), to UMD's ArcGIS layer. `lat`/`lng` is a point inside the footprint. `offCampus` lists known off-campus codes (Shady Grove `BLD2`/`BLD3`/`BLD4`/`BSE4`, `DC`, `BA`): meetings there never form a connection. Any other code that doesn't join is unknown, and its connections get the `unknown` verdict.

### 4.5 Academic calendar
`calendar/<term>.json` is either `published` or `not-published`.
- `published` has `classesStart`, `classesEnd` (last day of classes, not exams) and `noClasses` (named inclusive date ranges: breaks and holidays).
- `not-published` is a real state: .ics export then says the dates aren't published yet.

---

## 5. Browser state (IndexedDB via Dexie)

Database `LOCAL_DB_NAME` = `terpsicle`, version `LOCAL_DB_VERSION` = 1.

**v2** bumps it to 2: a `syncDocs` table (key: the doc key, `plan:<id>` or `settings`; `rev`, `dirty`, `inFlight`), the settings doc's `base`, and a `sync` settings row (`{userId, cursor}`) for plan sync, and the `seatAlerts` table is dropped because seat watches move to D1 (`docs/V2.md` §5.3, §6.5). The sync docs themselves (a plan doc per plan, one settings doc for blocks, colors, travel and chat plans) are `SyncDocSchema` in `src/core/schema/sync.ts`.

| Table | Primary key, indexes | Row schema |
|---|---|---|
| `plans` | `id`, `termId` | `PlanSchema` |
| `blocks` | `id`, `termId` | `BlockSchema` |
| `courseColors` | `courseCode` | `CourseColorPrefSchema` |
| `settings` | `key` | `SettingsRowSchema` (`ui` → `UiPrefs`, `travel` → `TravelSettings`, `generate` → Generate's form per term, `GenerateDrafts`; results are never stored) |
| `seatAlerts` | `[termId+sectionKey]`, `termId` | `LocalSeatAlertSchema` |
| `manifests` | `key` (the R2 key) | `CachedManifestSchema` |
| `files` | `key` (the R2 key), `family`, `termId` | `CachedFileSchema` |

- **Validation:** validate every row on read. An invalid row is skipped and logged, never fatal. A shape change bumps `LOCAL_DB_VERSION` with a Dexie `upgrade()` that migrates rows; plans are never dropped. Files in `files` are validated when fetched and trusted afterwards; a `SCHEMA_VERSIONS` bump clears that family.
- **Plans:**
  - `courses` is the Courses-tab order, with at most one entry per course.
  - `sectionCode: null` means saved for later, per plan.
  - A placed course stores `snapshot` (instructors, delivery, meetings, dates) taken when it was placed, or switched, or when a "changed" problem's "Keep new times" fix is applied. `core/catalog` compares it with the live catalog.
  - `order` sorts plan tabs within a term.
- **Blocks are per term, not per plan.**
  - Blocks describe the person's week (work, practice, lunch), not a choice between schedules. The generator runs outside any plan (SPEC §3.9), and "Respect my blocks" needs one unambiguous set; so do "Fits my plan" and Problems across tabs.
  - Per-plan blocks would also have to be copied on Duplicate, Generate and Save a copy, and would drift apart.
  - The prototype stored them per plan only because it had no generator outside a plan.
  - Undo covers block changes too.
- **Course colors are global:** one color per course code, the same in every plan and term (SPEC §3.2). A course with no row gets a color when first added to a plan (the palette color least used in that plan), and that color is written to `courseColors` so it stays stable. `COURSE_COLORS` are palette ids; the UI maps each to light and dark tints. Only append to that list.
- **UI prefs:** open tab, sidebar open, drill target (course with its details tab, or a connection; generated results aren't restorable), theme, last term, active plan per term, and collapsed instructor groups (`<course>|<instructor name>`).
- **Not persisted:** the undo stack, hover/preview state, search text, and generator results.
- **Seat alerts (local mirror):** the person's own email is kept so the UI can say "Watching as…" and prefill the next bell. `subscriptionId` and `manageToken` arrive when this browser follows the confirmation link (the confirm page leaves them in the alerts inbox, §7.1); until then the entry is `pending` with both null.
  - `email` is null when the watch was confirmed in this browser but asked for in another: the confirm page learns the section and token, never the address.
  - On startup the app (`src/features/alerts/sync.ts`) moves inbox entries into the table and clears the inbox, then refreshes every row that has a manage token with `alerts/status`. Rows the server reports `unsubscribed` or `unknown` are dropped. That call, sent even with no rows, also tells the app whether seat alerts are on: `unavailable` hides every seat-alert control.
  - The Export tab lists the rows. **Stop watching** asks first (the one confirmation in the app, SPEC §3.12), then calls `alerts/unsubscribe` with the row's manage token. A row with no token (confirmed on another device) points to the stop link in any alert email.

### 5.1 Client catalog flow
1. Fetch `catalog/terms.json` (ETag revalidation). Pick the term.
2. Render immediately from `manifests[catalog/<term>/manifest.json]` plus `files`, if cached.
3. Fetch the manifest and check `schemaVersion` (§2.3). Diff it against the cached one:
   - fetch departments whose hash changed or that are new;
   - fetch seats if `seats.hash` changed;
   - fetch changes if `changes.hash` changed.

   Use concurrency 6 and validate each file.
4. In **one Dexie transaction**, put the new `files` and then the new manifest. Never store a manifest whose files are missing. Then delete this term's `files` rows the manifest no longer references.
5. **Polling:** for an active term, poll the manifest every 60 s while the document is visible, and immediately when it becomes visible again. Most polls are a 304. A change in `seats.hash` alone fetches only the seats file. For an archived term, fetch the manifest once per session and don't poll.
6. PlanetTerp and geo follow the same pattern with their own manifests, fetched lazily: a PlanetTerp department file when a course from it opens, or when the generator ranks by rating or GPA; the routes binary when the plan first has a connection.

The client does this in `src/state/catalog-store.ts` (cache: `src/state/data-cache.ts`). Two details:
- Hashed files are put as they arrive, and the manifest is committed (with the eviction of step 4, in one transaction) once every file it lists is saved. The invariant is the same, and an interrupted first load resumes from the files it already has.
- Mock mode prefixes its rows with `mock:`, since `pnpm dev` and `pnpm dev:mock` share localhost. A cache row records nothing about schema versions; instead the pointer `_schema-versions` does, and a build with a different version for a family clears that family first.

### 5.2 The installable app (service worker, install prompt, push)
V2.md §3 is the plan; this is what the browser keeps.
- **Service worker** (`/sw.js`, `src/server/service-worker.ts`): one for the whole site. Cache Storage holds pages (`terpsicle-pages-v<n>`, network-first), build files as they're fetched (`terpsicle-assets-v<n>`), and the app shell precached at install (`terpsicle-shell-v<n>-<build>`). It never caches `/api`, `/auth`, `/avatars`, `/data` or `/ingest`, navigations included: IndexedDB already keeps the data, and the manifests must revalidate (§2.5, §5.1).
- **Install prompt** (`src/features/pwa`): `localStorage["terpsicle:install-prompt"]` holds `InstallPromptStateSchema` (`{dismissals, lastDismissedAt}`); `sessionStorage["terpsicle:install-shown"]` marks a tab where the prompt already opened. `requestInstallPrompt(trigger)` opens it only where installing works, never in the installed app, at most once per session, not within 90 days of a dismissal, and never after two. Closing it any way but installing is a dismissal, except when it was opened from the "Install app" item. Storage that can't be read means "don't show".
- **Push payload** (`PushPayloadSchema`): `{v: 1, type, title, body, url, tag}`. `url` is a path on this site; a click focuses a window already there, else takes an open one there, else opens one. A newer notification with the same `tag` replaces the older one. The service worker repeats the schema's checks by hand (it can't load zod) and shows "Terpsicle: Open the app for details." for a payload it can't read.

---

## 6. Travel math (`core/travel`)

- `feetPerMinute = mph × 88`, with `PACE_MPH`: slower 2.5, typical 3.0, faster 3.5.
- `walkMinutes = ceil(distanceFeet / feetPerMinute) + extraMinutes`, with extra minutes 0, 2 or 5.
- Connections are consecutive timed, in-person meetings on one day in different buildings, among sections whose `dates` spans intersect. "Consecutive" means the walk comes from the stop that ends latest before this one starts (among stops meeting in the same weeks); when something overlaps a class, nothing connects into it (the overlap is its own problem). There's no maximum gap: a long gap is simply `ok`. Blocks, online meetings, meetings with no building (TBA) and off-campus meetings never take part. The distance comes from the `accessible` matrix when `TravelSettings.accessible` is on, otherwise from `standard`.
- **Verdicts:**
  - `insufficient` when `walkMinutes > gapMinutes`;
  - `tight` when `walkMinutes ≥ TIGHT_SHARE × gapMinutes`, where `TIGHT_SHARE` = 0.75;
  - `ok` otherwise;
  - `unknown` when the cell is `ROUTES_UNKNOWN` or a building isn't in the file. Its pill is neutral, with "No route data yet";
  - `no-route` when the cell is `ROUTES_NO_ROUTE`. Neutral, with "UMD's map has no accessible route for this connection" (or "no route" in standard mode).
- The "How?" explanation shows exactly this formula for one real connection.

---

## 7. The JSON API and D1

**v2** adds signed-in routes (the route table gains `auth: "none" | "user" | "admin"` and per-user limits), an origin check on authenticated routes, one WebSocket route (`GET /api/chat/socket`), and the tables in §7.5. The seat-alert flow in §7.1 retires (`docs/V2.md` §6.5).

**The API.** Everything the browser asks the server lives under `POST /api/<name>`:
- JSON in, JSON out, `Cache-Control: no-store`;
- routed in `src/server/worker.ts`, implemented in `src/server/api/router.ts`;
- the browser calls it through `api` in `src/server/fns/api.ts`, the one server module UI code may import.

Both ends validate with the same schemas from `~/core/schema`:
- the client checks the input before sending and the answer on arrival;
- the Worker checks the input with a `z.strictObject` schema (unknown keys are rejected).

Expected outcomes come back as `200` with a result union (`status: …`). Bad input, rate limits and the feature flag come back as non-2xx with an `ApiErrorSchema` body, and the client throws `ApiCallError(reason)`.

**Why plain routes, not `createServerFn`:**
- They run in the worker test pool against real D1 and R2, which BUILD.md §5 requires for seat alerts.
- They see the raw request (`CF-Connecting-IP` for rate limits).
- Worker-only types stay out of the app's TS program. `src/server/fns` imports only `~/core` and zod; Biome enforces that, and `tsconfig.app.json` includes it.

**Every request:**
- must be `POST` with `Content-Type: application/json`. A cross-site form can't send that type without a CORS preflight, which is never granted;
- is rate-limited per IP per hour, keyed by an HMAC of `CF-Connecting-IP`. The HMAC key lives only in R2 (`_jobs/keys/hmac.json`, made on first use) and the IP is never stored.

| Endpoint | Input | Result | Per IP per hour |
|---|---|---|---|
| `review-summary` | `ReviewSummaryInputSchema` `{slug, course}` | `ReviewSummaryResultSchema` | 300 |
| `alerts/subscribe` | `SubscribeInputSchema` `{email, termId, sectionKey}` | `SubscribeResultSchema` | 10 |
| `alerts/confirm` | `ConfirmInputSchema` `{token}` | `ConfirmResultSchema` | 60 |
| `alerts/lookup` | `ManageInputSchema` `{token}` | `LookupResultSchema` | 60 |
| `alerts/unsubscribe` | `ManageInputSchema` `{token}` | `UnsubscribeResultSchema` | 60 |
| `alerts/status` | `StatusInputSchema` `{items: [{subscriptionId, manageToken}]}` (≤ 50) | `StatusResultSchema` | 120 |
| `me` | `MeInputSchema` `{}` | `MeResultSchema`: `signed-out` or `signed-in` (with `user`), and `flags` | 600 |
| `auth/sign-out` | `SignOutInputSchema` `{removeLocal?}` | `{status: "signed-out"}`, and clears the cookies | 30 |
| `account/delete` (`auth: "user"`) | `AccountDeleteInputSchema` `{}` | `AccountDeleteResultSchema` `{status: "deleting", deleteAfter}` | 30 |
| `auth/test-sign-in` (test mode only; 404 elsewhere) | `TestSignInInputSchema` `{userId, return?}` | `TestSignInResultSchema` | 60 |

**Identity** (§7.6, `docs/AUTH.md`) adds the `auth` field to the route table: `"user"` and `"admin"` routes need a same-origin request (`Origin`, and `Sec-Fetch-Site` when sent) and a session, answer `401 unauthorized` or `403 forbidden` otherwise, and get the session's user in `ctx.session`. `ApiErrorSchema` gains `unauthorized` and `forbidden`. Two GET navigations sit beside the table, `/api/auth/google` and `/api/auth/google/callback`, and one Worker route outside `/api`, `/avatars/*`.

### 7.1 Seat alerts (`SPEC.md` §3.12)

**Flag.** Everything is behind `SEAT_ALERTS_ENABLED` (a `wrangler.jsonc` var, `"true"` since the end-to-end tests passed; `"false"` is the off switch):
- while it's off, or where there's no `EMAIL` binding (previews never have one), `alerts/subscribe` and `alerts/status` answer `{status: "unavailable"}` (the app then hides the bell);
- the other alert endpoints answer `503 unavailable`;
- `notifySeatChanges` does nothing.
- `EMAIL_SUBJECT_PREFIX` (a var, unset in production) is prepended to every alert subject, e.g. `[Test] ` for a trial run.

**Tokens and ids:**
- Tokens are 32 random bytes in base64url (43 characters). Only their hex SHA-256 is stored, in `alert_tokens`.
- Subscription ids are 16 random bytes (22 characters).
- Addresses are trimmed and lowercased by the input schema.

**Flow:**
1. **Subscribe.** The answer is always `check-email`, whether the address is new, pending, already watching or unsubscribed, so the API never reveals who watches what. The email says which:
   - new, pending or unsubscribed: a confirmation link, `/alerts/confirm?token=…`. It expires after 48 h and works once;
   - already watching: "You're already watching CMSC351 0101", with a stop link. This is how the spec's "You're already watching this" reaches the person without leaking it to anyone else.
   - The app shows "You're already watching this" itself when its own local list has the watch.
   - The app keeps a pending request for 48 h (the link's life), with a "Send again" button; after that the bell offers a fresh start.
2. **Confirm.** The page at `/alerts/confirm` calls `alerts/confirm`:
   - `confirmed` makes the watch `active` and returns a **manage token**. Holding the emailed token proves the address, so the browser that followed the link keeps it;
   - the page leaves `{termId, sectionKey, subscriptionId, manageToken, status}` in `localStorage["terpsicle:alerts-inbox"]` (`src/features/alerts/inbox.ts`). The state layer moves it into Dexie `seatAlerts` and clears the inbox;
   - `last_open` is set from the current seats file, so only a reopening after confirmation emails.
3. **Alert.** The seats cron calls `notifySeatChanges(env, before, after, {now})` (`src/server/alerts/notify.ts`) after publishing a term's seats file. For each `active` subscription in that term whose section has counts, it sends "A seat opened" when all of these hold:
   - the section had 0 open seats before (the previous file, or else `last_open`);
   - it has more than 0 now;
   - there was no alert for this subscription in the last 30 min;
   - the address got fewer than 20 alerts in 24 h.

   It records `last_open`, `last_checked_at` and `last_notified_*`, and prunes old counters and expired confirm tokens.
4. **Unsubscribe.** It takes two steps, per the spec: `alerts/lookup` shows "Stop seat alerts?" on `/alerts/unsubscribe`, and only the button calls `alerts/unsubscribe` (idempotent). Every alert email carries a fresh manage token in its stop link and its `List-Unsubscribe` header. That header points at the confirming page. There's deliberately no `List-Unsubscribe-Post`: one-click would skip the confirmation.
5. **Status.** `alerts/status` refreshes the browser's local list with its manage tokens. A token that doesn't match the id reads `unknown`.

**Emails** (`src/server/alerts/email.ts`, all three kinds):
- plain text plus simple table-based HTML, and `Auto-Submitted: auto-generated`;
- from `Terpsicle <alerts@terpsicle.com>` through the Email Service binding `EMAIL`.

**Links in emails:**
- to the app: `https://terpsicle.com/schedule?term=<id>&course=<code>`. The app should open that course; that's still a UI task;
- to Testudo's page for the course.

API-triggered emails link to the requesting origin only when it's ours (terpsicle.com, this project's preview hosts, localhost), so a forged `Host` can never inject another domain. Cron emails always link to terpsicle.com.

**Limits:**
- at most 5 signup emails (confirmation or "already watching") per address per 24 h, and at most one per subscription per 10 min. Hitting either limit skips the email but keeps the answer `check-email`, so limits can't reveal anything;
- at most 300 signup emails in total per UTC day (`signup-emails` counter), a backstop against abuse spread over many networks and addresses. Past it, the answer is still `check-email`;
- at most 20 alerts per address per 24 h, and a 30-min cooldown per subscription;
- the per-IP limits in the table above.

**Dedupe.** `email_sends.dedupe_key` is unique, so a retried cron sends nothing twice. The keys are:
- `confirm:<id>:<16 hex of token hash>`;
- `already-watching:<id>:<…>`;
- `seat-open:<id>:<seats asOf, or the 30-min window>`.

**Migration** (`migrations/0002_seat_alerts.sql`, applied by `deploy.yml` to production and by ci.yml's preview job to `terpsicle-preview` via `wrangler.preview-d1.jsonc`):

```sql
CREATE TABLE alert_subscriptions (
  id                 TEXT PRIMARY KEY,          -- 16 random bytes, base64url
  email              TEXT NOT NULL,             -- trimmed, lowercased
  term_id            TEXT NOT NULL,
  section_key        TEXT NOT NULL,             -- e.g. CMSC351-0101
  status             TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  created_at         TEXT NOT NULL,             -- ISO UTC
  confirmed_at       TEXT,
  unsubscribed_at    TEXT,
  last_open          INTEGER,                   -- open seats at the last check
  last_checked_at    TEXT,
  last_notified_at   TEXT,
  last_notified_open INTEGER,
  UNIQUE (email, term_id, section_key)
);
CREATE INDEX alert_subscriptions_active ON alert_subscriptions (term_id, section_key) WHERE status = 'active';

CREATE TABLE alert_tokens (
  token_hash      TEXT PRIMARY KEY,             -- hex SHA-256
  subscription_id TEXT NOT NULL REFERENCES alert_subscriptions (id) ON DELETE CASCADE,
  purpose         TEXT NOT NULL CHECK (purpose IN ('confirm', 'manage')),
  created_at      TEXT NOT NULL,
  expires_at      TEXT,                         -- confirm tokens: +48 h
  used_at         TEXT                          -- confirm tokens: once
);
CREATE INDEX alert_tokens_by_subscription ON alert_tokens (subscription_id, purpose);

CREATE TABLE email_sends (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  subscription_id TEXT REFERENCES alert_subscriptions (id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('confirm', 'already-watching', 'seat-open')),
  dedupe_key      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id     TEXT,                         -- Email Service message id
  sent_at         TEXT NOT NULL
);
CREATE INDEX email_sends_by_email ON email_sends (email, kind, sent_at);

-- Fixed-window counters: per-IP limits (keyed hash) and the summary cap.
CREATE TABLE counters (
  name         TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (name, window_start)
);
```

`AlertSubscriptionRowSchema`, `AlertTokenRowSchema` and `EmailSendRowSchema` validate rows on read (`src/server/alerts/store.ts`).

### 7.2 Review summaries

`review-summary` takes `{slug, course}` and returns `ReviewSummaryResultSchema` (`src/server/summaries/`).

1. **Find the instructor.** The course's department names the PlanetTerp file that holds the instructor's `reviewCount` and `latestReviewAt`: `planetterp/manifest.json` → `planetterp/dept/<DEPT>.<hash>.json`. Missing → `unknown-instructor`; no reviews → `no-reviews`.
2. **Serve the cache.** `summaries/<slug>.json` is used when it's fresh: `basedOnReviewCount ≥ reviewCount` and its `latestReviewAt` is at least the instructor's. The summary covers all of an instructor's reviews, so one file per instructor serves every course.
3. **Otherwise, generate once.**
   - **One generation at a time.** Concurrent requests in one isolate share one promise. Across isolates, a lock object `_jobs/summary-locks/<slug>.json` is taken with a create-only R2 put (`etagDoesNotMatch: "*"`). A lock older than its 60 s TTL is taken over with an etag-conditional put.
   - **Losers wait.** They poll R2 for up to 20 s for the new summary, then answer `busy`.
4. **Enforce the daily cap.** A D1 counter `summaries` per UTC day is checked against `SUMMARIES_DAILY_CAP` (a var, 200). Past it → `daily-limit`.
5. **Get the reviews.** First from the PlanetTerp job's private copy, `_jobs/planetterp/reviews/<slug>.json` (§2.6), when it holds at least the instructor's `reviewCount`. Otherwise live from PlanetTerp `/professor?name=…&reviews=true`, used only if its slug matches: names collide, so a mismatch falls back to the stored copy, or is `failed` rather than the wrong person's reviews. When PlanetTerp is down or gone, a stored copy that's behind is still used, so summaries can be regenerated without PlanetTerp.
6. **Run the model** (`src/server/summaries/prompt.ts`).
   - **Input:** the 40 newest reviews, at most 18k characters, each stripped of `<`, `>` and links, inside one `<reviews>` fence. The system prompt says the reviews are data and any instructions inside them must be ignored.
   - **Output:** JSON mode with a schema, then `ModelSummarySchema`:
     - a summary of 20–600 characters and at most about 75 words, with no links, addresses or markup;
     - 2–4 themes of 1–4 lowercase words, each with a sentiment.
   - **Retries:** invalid output gets one retry that names the problem; a second failure is `failed`. Nothing that fails validation is stored or shown.
7. **Store and return** the `ReviewSummary`. The UI hides the summary for every `unavailable` reason, and the summary is the only thing shown with the sparkles icon.

**Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`**, from the live Workers AI catalog on 2026-09-25.
- **Why this one:**
  - it's on Cloudflare's JSON-mode list;
  - it's concise and followed the 60-word, 2–4-theme format on real PlanetTerp reviews (3.4–4.1 s);
  - it ignored a planted prompt-injection review.
- **Alternatives tried:**
  - `gemma-4-26b-a4b-it` and `qwen3.8-27b` are reasoning models that spent the whole token budget thinking and returned no JSON;
  - `mistral-small-3.1-24b-instruct` ran over the length limits.
- `scripts/try-review-summaries.ts` reruns the comparison.

### 7.3 Analytics

Server events (`src/server/analytics.ts`, `docs/ANALYTICS.md`):
- summaries: `summary_generated`, `summary_cached`, `summary_failed`, `summary_capped`;
- seat alerts: `alert_subscribed`, `alert_confirmed`, `alert_sent`, `alert_unsubscribed`;
- identity: `signin_result` (`outcome`, and `hd` on success).

They carry counts, reasons and term ids only. They never carry an address, token, IP or review text, not even hashed.

### 7.4 Chat (`src/core/schema/chat.ts`)

Rooms aren't stored: `roomsForCourse(termId, course)` in `core/chat` derives them from the catalog, and a room gets storage only with its first message. One `CourseChat` Durable Object per course per term (named by the course room id) holds every room of that course, and the app keeps one WebSocket per open course.

- **`ChatMessage`:** `id`, `room`, `author` (directory ID, Google name and picture, snapshotted when sent), `text` (trimmed, 1–2,000 chars), `createdAt`, `editedAt`, `replyTo` (the thread's first message; threads are one level deep), `thread` (reply count and last reply time), `reactions` (who reacted, per reaction in the fixed set `REACTIONS`) and `moderation`: `visible`, `held {reason}` (only the author sees it; `checking` · `graded-work` · `flagged` · `reported`) or `removed`.
- **Client frames** (`ChatClientFrameSchema`, strict): `hello {protocol, rooms}` first, then `history {room, thread, before, limit}`, `send {room, text, replyTo}`, `edit`, `delete`, `react {id, reaction, on}`, `typing {room}` and `read {room, upTo}`. Requests carry a client `req` id.
- **Server frames** (`ChatServerFrameSchema`): `welcome {you, rooms: [{room, members, unread, writable}]}`, `page {messages (oldest first), more}`, `ack {req, message}` (the message as its author now sees it; null after a delete), `error {req, code, retryAfter}`, `message` (new or changed; replaces the copy with that id), `deleted`, `reactions`, `moderation` (every change to the author; `removed` to everyone who had seen it) and `typing`.
- `CHAT_PROTOCOL_VERSION` is bumped on a breaking change; an older client's `hello` gets `error {code: "old-client"}` and reloads.

### 7.5 v2 tables (D1 `terpsicle`)

The full SQL, and what each column means, is in `docs/V2.md`; once a migration lands, its file and the row schemas win, and this list follows them. Migration numbers are fixed now so parallel PRs don't collide.

| Migration | Tables | Holds |
|---|---|---|
| `0003_identity` | `users` (key: directory ID; `email`, `hd`, `name`, `picture_url`, `picture_key`, `status`, `delete_after`, `chat_blocked_until`, `reviews_blocked_until`, …), `user_identities` (Google `sub` → user, with that tenant's `email`, so both a TERPmail and a UMD Gmail address are kept), `sessions` (hashed cookie tokens, 30-day sliding) | Accounts (V2.md §4.4) |
| `0004_moderation` | `moderation_decisions` (text-free log), `moderation_queue` (the human queue; snapshots blanked 30 days after close), `reports` | The shared moderation service (V2.md §9.4) |
| `0005_sync` | `sync_docs` (`user_id`, `kind`, `doc_id`, `term_id`, `rev`, `body`, `updated_at`), `sync_heads` (`head`, `pruned_through`) | Plan sync: one JSON row per doc, per-doc rev compare-and-swap (V2.md §5.2) |
| `0006_notifications` | `notification_settings`, `push_subscriptions` (one per device, unique `endpoint`), `notifications` (chat mentions and replies), `notification_deliveries` (every push and email, unique `dedupe_key`) | Notifications (V2.md §6.3) |
| `0007_seat_watches` | `seat_watches` (`user_id`, `term_id`, `section_key`, last-seen and last-notified fields); drops `alert_subscriptions`, `alert_tokens`, `email_sends` | Signed-in seat alerts (V2.md §6.5) |
| `0008_reviews` | `instructors`, `instructor_names`, `reviews` (with `author_id`, never exposed to readers or moderation) | Terpsicle Reviews (V2.md §7.3) |
| `0009_chat` | `chat_members`, `chat_follows`, `chat_rooms` (a row only after a room's first message), `chat_read_markers`, `chat_room_prefs`, `chat_author_courses` | Chat indexes; messages live in the `CourseChat` Durable Object's own SQLite (V2.md §8.4–8.5) |

`counters` (§7.1) stays and also holds per-user limits (`user:<id>:<route>`).

### 7.6 Identity (landed: `migrations/0003_identity.sql`)

How it works, and how to use it from other routes: `docs/AUTH.md`. Rows are validated on read with `UserRowSchema`, `UserIdentityRowSchema` and `SessionRowSchema` (`src/server/auth/store.ts`).

| Table | Key | Columns | Notes |
|---|---|---|---|
| `users` | `id`: the directory ID (`DirectoryIdSchema`, `^[a-z0-9]{2,16}$`) | `email` and `hd` (the address used last), `name`, `picture_url` (Google's), `picture_key` (our copy in R2), `status` (`active` · `deleting`), `delete_after`, `chat_blocked_until`, `reviews_blocked_until`, `created_at`, `last_sign_in_at` | `terp@terpmail.umd.edu` and `terp@umd.edu` are one row, `terp`. Name, picture and email are overwritten at every sign-in; nothing edits them in Terpsicle. Other tables reference `users (id) ON DELETE CASCADE`. |
| `user_identities` | `(provider, sub)` | `hd`, `email` (that tenant's address), `user_id`, `created_at` | One per Google account the person has used, so both of a student worker's addresses are kept. A `sub` already tied to another directory ID is refused. |
| `sessions` | `id_hash`: hex SHA-256 of the cookie's token | `user_id`, `created_at`, `last_seen_at`, `expires_at` | 30 days after the last refresh. A session seen over a day ago gets a new token (`POST /api/me`, and routes with `auth`); the replaced one works for one more minute. |

- **Cookies** (all `__Host-`, `Secure; HttpOnly; SameSite=Lax; Path=/`): `__Host-session` (32 random bytes, 30 days, set only at sign-in), `__Host-oauth` (the signed Google round trip, 10 minutes) and `__Host-hint` (the address last signed in with, for Google's `login_hint`; cleared at sign-out and deletion).
- **Pictures:** R2 `USER_CONTENT` (`terpsicle-user-content`; previews `terpsicle-user-content-preview`) at `avatars/<userId>/<hash16>.<ext>`, fetched at 96 px when Google's URL changes, JPEG, PNG or WebP under 200 KB. `users.picture_key` is that key and `/<key>` its URL; only signed-in people get it.
- **Deletion:** `account/delete` sets `status = 'deleting'` and `delete_after` a week out and ends every session; signing in before then sets `active` again. The daily job (`7 13 * * *`, `src/jobs/daily.ts`) deletes the pictures, then the rows, of accounts past `delete_after`, and expired sessions.
- **Admins** aren't a table: `config/admins.txt`, bundled into the Worker.

---

## 8. Share links

`/schedule?plan=<base64url(deflate-raw(UTF-8 JSON))>`. The link carries a `SharePayloadSchema` payload:
- `v: 1`, `termId`, `name?`;
- `sections`: section keys in course order;
- `saved?`: saved-for-later course codes;
- `blocks?`: `{label, days, start, end}`;
- `colors?`: course → palette id.

At most 40 entries per list, and one entry per course across `sections` and `saved`. There are no ids, timestamps or snapshots.

**Wire form.** To keep links short (a typical plan is about 150 characters, half the plain-JSON form), the JSON inside the link is a compact array that `core/share` expands and then validates with `SharePayloadSchema`:

```
[v, termId, name | 0, "CMSC351-0101 ENGL393-0312", "MUSC130", [["Lunch", "MWF", 720, 780]], "05"]
```

- `v` comes first, so a future layout can always be told apart;
- sections and saved courses are space-joined strings; days are Testudo's tokens run together;
- colors are one base-36 palette index per course, in sections-then-saved order, `-` for none (trailing `-` dropped). Colors for courses outside the plan aren't carried;
- empty lists are `""` or `[]`, and an absent name is `0`.
- The shared view is read-only and shows the sharer's blocks and colors.
- **Save a copy** makes a new plan in `termId` with fresh snapshots from the current catalog. It doesn't import the blocks (yours are per term) or the colors (yours are global).
- Section keys missing from the catalog show up as cancelled problems in the shared view and are dropped on Save a copy, with a toast that names them.
- The codec lives in `core/share`. A version the client doesn't know gets a specific error ("This link was made by a newer version of Terpsicle. Reload to open it.").

---

## 9. Computed contracts (core → UI)

These aren't stored, but several workers build against them:
- **`Problem`**
  - `kind` fixes `severity` (`PROBLEM_SEVERITY`); sort by `SEVERITY_ORDER`.
  - `subjects[0]` is what clicking the problem opens.
  - `title` and `detail` are `MessagePart[]`, so codes, times and durations render in mono and can be clicked without parsing strings.
  - `fix` is either `switch` (offered only when it creates no new problem) or `accept-change` (for `changed`).
  - `id` is `<kind>:<subject ids>`, stable while the cause lasts.
- **`FitLabel`:** `fits` · `overlaps {with: course | block}` · `not-enough-time {direction, courseCode}` · `in-plan` · `no-set-times`. "Not enough time after CMSC330" means CMSC330 comes first.
- **`Connection`:** see §6.
- **Generator:**
  - `GenerateRequest`:
    - `items`: `course {required}` or `pick {count, courses}`, each course optionally limited to some sections;
    - `mustHaves`: `DEFAULT_MUST_HAVES` has travel time on and blocks respected;
    - `rankBy`: a preset factor, or `custom` with a 0–1 weight for every `RankFactor`;
    - the term's `blocks`, `travel` and `limits` (`DEFAULT_GENERATE_LIMITS`: best 200, 500k steps).
  - `GenerateResult`:
    - `results`: each result's `sections` has one representative (the lowest-numbered) per included course, and `equivalents.byCourse` lists the time-identical alternatives (so "×3 equivalent" is `equivalents.count`);
    - `truncated` for "showing the best 200";
    - `relaxations`: each has a `patch` to apply and an `unlockCount`;
    - `nearMisses`: each has its `conflicts`.

---

## 10. Open questions

1. **Low-section alerts.** The rule above emails only when a full section reopens (0 → >0). Should watching a *low* (not full) section also email when it gets close to full? The spec only says "when a seat opens".
2. **Gmail/Yahoo one-click unsubscribe.** Bulk-sender rules want `List-Unsubscribe-Post` (one-click), which would skip the confirmation the spec requires. We send `List-Unsubscribe` only (§7.1). At our volume that's fine; revisit if deliverability suffers.
