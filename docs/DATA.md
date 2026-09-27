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
| Chat room id | Course room `<term>:<course>`, section room `<term>:<course>:<section>`, professor room `<term>:<course>:P:<professor>` (`professorSlug`: "pedram-sadeghian", co-instructors joined by `_`, at most 80 chars). Course and section rooms are codes only, so a time or room change keeps the id and the history; a professor's room is named after them. The course room id is also its `CourseChat` object's name. | `RoomIdSchema`, `courseRoomId()`, `professorRoomId()`, `professorSlug()`, `sectionRoomId()`, `parseRoomId()`, `courseChatName()` |

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
| `courses/manifest.json` (v3) | `CourseIndexManifestSchema` | catalog job (6 h), when the index changed | fixed |
| `courses/search.<hash>.json` (v3) | `CourseSearchFileSchema`: every course as `[code, title, creditsMin, creditsMax, genEdCodes]`, sorted by code | catalog job | hashed |
| `courses/dept/<DEPT>.<hash>.json` (v3) | `CourseIndexDeptSchema`: per course the title, credits, GenEd groups, prerequisite, corequisite and restriction text, cross-listings, parsed prerequisites and the terms it was offered in (§3.4) | catalog job | hashed |
| `planetterp/manifest.json` | `PlanetTerpManifestSchema` | PlanetTerp job (daily) | fixed |
| `planetterp/dept/<DEPT>.<hash>.json` | `PlanetTerpDeptSchema` | PlanetTerp job | hashed |
| `planetterp/index.<hash>.json` | `PlanetTerpIndexSchema` | PlanetTerp job | hashed |
| `geo/manifest.json` | `GeoManifestSchema` | buildings job (weekly), routes script (weekly, GitHub Actions) | fixed |
| `geo/buildings.<hash>.json` | `BuildingsFileSchema` | buildings job | hashed |
| `geo/routes.<hash>.bin` | binary, §4.2 | routes script | hashed |
| `geo/route/<from>-<to>-<mode>.json` | `RouteGeometrySchema` | routes script | fixed |
| `geo/tiles.pmtiles` | PMTiles | script, rarely | fixed |
| `calendar/<term>.json` | `AcademicCalendarSchema` | calendar job (weekly) | fixed |
| `summaries/<slug>.json` | `ReviewSummarySchema` | `POST /api/review-summary` (§7.2) | fixed, **not served** |
| `_jobs/…` | owned by M2, §2.6 | jobs (baselines, rotation state, reports) | **not served** |
| `reviews/manifest.json` (v2) | `ReviewsManifestSchema` | `reviews-publish` job (hourly) | fixed |
| `reviews/dept/<DEPT>.<hash>.json` (v2) | `ReviewsDeptSchema`: Terpsicle-review ratings per instructor id, and the names PlanetTerp's join doesn't cover (§4.6). Never review text | `reviews-publish` job | hashed |

**v2, bucket `terpsicle-user-content`** (binding `USER_CONTENT`; previews use `terpsicle-user-content-preview`): `avatars/<userId>/<hash16>.<ext>`, cached Google profile pictures, served at `/avatars/*` only with a session and never through `/data` (`docs/V2.md` §4.5). `feedback/<yyyy-mm>/<id>.<ext>` and `<id>-element.<ext>`: feedback screenshots, served only to the admin at `/admin/feedback/shot/<id>[/element]` (`docs/FEEDBACK.md`). The `reviews/` family adds `reviews` to `SCHEMA_VERSIONS`; `ReviewSummarySchema` gains optional `sources` (additive).

### 2.2 Content hashing
- Hash = SHA-256 of the exact UTF-8 bytes written (`JSON.stringify(value)`, no whitespace), first 16 hex chars.
- Build objects in a deterministic key and array order (schema field order; arrays sorted as each schema's comments say), so unchanged data hashes the same.
- **Hashed files carry no timestamps.** Times that change every run (`fetchedAt`, `generatedAt`) live in the fixed-name manifest instead. That's why seats' `fetchedAt` is in the manifest, not the seats file: unchanged counts keep their hash and clients don't refetch.
- A hashed key is never overwritten with different bytes.

### 2.3 Schema versions
- `SCHEMA_VERSIONS` has one integer per family: `catalog`, `planetterp`, `geo`, `calendar`, `summaries`, (v3) `courses` and (v2) `reviews`. Every JSON file has `schemaVersion: <literal>`. The routes binary has its own header version (`ROUTES_BINARY_VERSION`); share links have `v` (`SHARE_PAYLOAD_VERSION`).
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
- Garbage collection: the catalog job deletes hashed files under a term that no current manifest references and that are older than 24 h. The 24 h grace keeps a client's in-flight diff working. It does the same under `courses/`, and the reviews-publish job under `reviews/`.

### 2.5 Serving `/data/*`
The Worker maps `/data/<key>` to R2 and applies `dataCachePolicy(key)` (in `keys.ts`). A `null` policy means 404. Every response carries an ETag, and `If-None-Match` gets a 304.

| Keys | Browser | Worker Cache API |
|---|---|---|
| hashed (`*.<16hex>.json\|bin`) | `public, max-age=31536000, immutable` | 1 year |
| `catalog/terms.json`, `catalog/<term>/manifest.json` | `public, no-cache` (revalidate with ETag) | 60 s |
| `planetterp/manifest.json`, `geo/manifest.json`, `courses/manifest.json`, `reviews/manifest.json` | `public, no-cache` | 1 h |
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
| `_jobs/reviews/state.json` | reviews-publish | when each unreferenced `reviews/` file was first seen, for the 24 h grace |
| `_jobs/courses/state.json` | catalog | per department, the `<term>:<chunk hash>` list its course-index file was built from (an unchanged list skips the rebuild), and when each unreferenced `courses/` file was first seen |
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

### 3.4 Course index (v3, `courses/`)

The scheduler's catalog is per term and covers only the terms Testudo lists. The four-year planner needs every course, including ones not offered this term, so after its crawl the catalog job publishes an index across every term whose catalog is in R2 (`src/ingest/course-index.ts`, built by `src/core/catalog/course-index.ts`).
- **Source:** the department chunks already in R2, for every term in `terms.json`, active and archived. Nothing extra is crawled. So the index reaches back only as far as the terms the catalog job has seen: `offered` grows by a term each time Testudo adds one.
- **Which term's text:** a course's title, credits, `genEds`, `prerequisite`, `corequisite`, `restriction` and `crossListings` come from the first term that lists it, taking active terms newest first, then archived ones newest first (`courseIndexTermOrder`). So Testudo's current wording wins over an archived term's.
- **`offered`** is every term id that listed the course, newest first, so the UI can say "Last offered Fall 2025" and "Usually offered in fall". A course is listed when its department page shows it, sections or not ("contact department" courses count).
- **`genEds`** is the catalog's shape (§3.2): groups that all apply, options with their `condition`. The search row flattens them to each code once, in order, for the GenEd filter.
- **`prereqs`** is `parsePrerequisite(prerequisite)` (`src/core/catalog/prereqs.ts`), computed in ingest so every client gets the same answer: `{groups, complete}`, where every group applies and one code in a group is enough. Sentences and `;` clauses join left to right, with "and" unless the clause starts with "or"; inside a clause `and` binds tighter than `or`, a comma takes its list's conjunction, and "1 course from (A, B)" is a choice. "A; or B and C" becomes `[[A, B], [A, C]]`. Anything that isn't a course ("permission of", "or equivalent", a score, a program, "any STAT400-level course", "must have completed") never adds a requirement and never meets one, and makes `complete` false. So do sentences Testudo appends that aren't requirements ("Cross-listed with", "Credit only granted for", "Repeatable to"). No prerequisite is `{groups: [], complete: true}`. A golden test snapshots the reading of every saved prerequisite sentence (`src/ingest/__fixtures__/golden/prerequisites.json`).
- **Incremental:** a department is rebuilt only when the list of chunks it was built from changed (`_jobs/courses/state.json`); the rest keep their file. The manifest is rewritten only when the search hash or a department hash changed, so `generatedAt` is when the index last changed.
- **Failures:** a term whose manifest can't be read is skipped (an archived term published before a `catalog` schema bump can't be read by the app either). A department whose chunk is missing keeps its previous file and retries next run. If no term can be read, the index is left alone. The catalog is published either way.
- **Size:** about 5,000 courses in production, so the search file is roughly 120 KB gzipped; a department file loads only when the planner needs that department.
- **Mock mode** builds the index from the fixtures' catalog with the same functions (`src/fixtures/mock/data-source.ts`).
- `pnpm tsx scripts/ingest.ts courses` rebuilds the index alone from the catalog already in the store (after a `courses` bump, say).

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
- **The index** (`planetterp/index.<hash>.json`, `PlanetTerpIndexSchema`, named by the manifest's optional `index: {hash}`, added without a version bump like `source`) is built from the department files the run published (`buildPlanetTerpIndex` in `src/core/reviews`): `instructors`, slug → `[name, depts]`, and `mostTaken`, the 40 courses offered in an active term with the most students in PlanetTerp's grades, as `[code, title, students]`. Instructor pages without `?course=` find their departments here, the sitemap lists every instructor from it, and a mistyped instructor URL gets "Did you mean" from its names. A failed write keeps the previous index.
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

### 4.6 Terpsicle review numbers (v2, `reviews/`)

The hourly `reviews-publish` job (`37 * * * *`, `src/jobs/reviews-publish.ts`) publishes the numbers of published Terpsicle reviews, so course details can combine them with PlanetTerp's (`docs/V2.md` §7.6). Review **text is never here**: hashed files are immutable for a year, and taking a review down must be instant, so words come only from `reviews/list`.
- **Source:** D1, read in two queries (`publishedReviewFacts`, `publishableNameFacts` in `src/server/reviews/store.ts`): every published review's instructor, course, rating and `published_at`, and the `minted` and `manual` rows of `instructor_names`. No words, no author. Both finish before anything is written, so a D1 error leaves R2 as it was.
- **Build** (`buildReviewsDepts`, `src/core/reviews/publish.ts`, pure): one file per department with something in it. `instructors` maps an instructor id (PlanetTerp slug or minted `t~` id) to `{rating, reviewCount, latestReviewMonth}` over **all** their published reviews, like PlanetTerp's per-instructor numbers; an instructor appears in every department they have a published review in (by the course code's first four letters) or a name in. `rating` is the mean to two decimals.
- **`latestReviewMonth`** is `YYYY-MM` (America/New_York), not a time: an exact publish time next to an instructor would undo the month rounding readers see (V2 §7.5).
- **`names`** maps `instructorNameKey(testudoName)` to an id, for what PlanetTerp's `names` can't say: the owner's corrections (`manual`), and minted instructors' names once they have a published review (a name alone would tell that someone tried to review them). The client reads a `manual` entry (a PlanetTerp slug) over PlanetTerp's join, and a minted one only where PlanetTerp's join has no match (`terpsicleInstructor`, `src/state/reviews-store.ts`).
- **Publishing** (`publishReviews`, `src/ingest/reviews.ts`) follows §2: each file is validated and written only when its bytes changed; the manifest last, rewritten only when a department's hash changed (so `generatedAt` is when the numbers last changed); files it no longer lists are deleted after 24 h (`_jobs/reviews/state.json`). A department left with nothing is dropped from the manifest; an empty department file is never written. With no published review at all, the manifest lists no departments. A manifest of another schema version is replaced.
- **Mock mode** publishes `src/fixtures/mock/reviews.ts` (five PlanetTerp instructors and two minted ones) with the same `buildReviewsDepts`; `src/ingest/__fixtures__/golden/reviews.json` is its output.
- The client combines the two sources with `combineRatings` (`src/core/reviews/combine.ts`): `rating = Σ(rating_s × count_s) / Σ count_s`, `reviewCount = Σ count_s`, and the rating's tooltip gives the parts ("4.2 from 61 reviews: 4.1 from 48 on PlanetTerp, 4.6 from 13 on Terpsicle"). Only while `REVIEWS_ENABLED` isn't `off`; grade distributions stay PlanetTerp's.

---

## 5. Browser state (IndexedDB via Dexie)

Database `LOCAL_DB_NAME` = `terpsicle`, version `LOCAL_DB_VERSION` = 3.

**Version 3** (Terpsicle Plan, landed with `v3/plan-ui`; `src/state/db.ts`): a `fourYear` table, one row per four-year doc (`FourYearDocSchema`, validated on read; an invalid row is skipped and logged), and a `fourYear` settings row for the open doc (`FourYearPrefsSchema`, `{activeId}`, local only). `upgradeToV3` sets a signed-in device's pull cursor (the `sync` row) back to 0, once, so it pulls the four-year docs an older tab skipped (`docs/V3.md` §2.4). Nothing else changes shape (`src/state/db.test.ts` upgrades a v2 database).

**Version 2** (plan sync, landed with `v2/sync-engine`; `src/state/db.ts`): a `syncDocs` table for each doc's sync flags (the settings doc's row also keeps `base`, its body as last saved or pulled), and a `sync` settings row (`{userId, cursor}`). The `seatAlerts` table is dropped with the email-token alerts it mirrored: seat watches live on the account in D1 (§7.1). An earlier build moved its rows to a `seatAlerts` settings row, which the app deletes on start. Nothing else changes shape, so plans, blocks, colors, settings and the data cache come through untouched (`src/state/db.test.ts` upgrades a v1 database). The sync docs themselves (a plan doc per plan, one settings doc for blocks, colors, travel and chat plans) are `SyncDocSchema` in `src/core/schema/sync.ts`.

| Table | Primary key, indexes | Row schema |
|---|---|---|
| `plans` | `id`, `termId` | `PlanSchema` |
| `blocks` | `id`, `termId` | `BlockSchema` |
| `courseColors` | `courseCode` | `CourseColorPrefSchema` |
| `settings` | `key` | `SettingsRowSchema` (`ui` → `UiPrefs`, `fourYear` → `FourYearPrefs`, Plan's open doc, `travel` → `TravelSettings`, `generate` → Generate's form per term, `GenerateDrafts`, results never stored; `chatPlans` → `ChatPlans`, synced; `sync` → `LocalSyncMeta`, plan sync's account and pull cursor) |
| `fourYear` | `id` | `FourYearDocSchema` (`src/core/schema/four-year.ts`) |
| `syncDocs` | `key` (`plan:<id>` or `settings`) | `LocalSyncDocSchema`: `rev` (0 = never saved), `dirty`, `inFlight`, and on the settings row `base` |
| `manifests` | `key` (the R2 key) | `CachedManifestSchema` |
| `files` | `key` (the R2 key), `family`, `termId` | `CachedFileSchema` |

- **Validation:** validate every row on read. An invalid row is skipped and logged, never fatal. A shape change bumps `LOCAL_DB_VERSION` with a Dexie `upgrade()` that migrates rows; plans are never dropped. Files in `files` are validated when fetched and trusted afterwards; a `SCHEMA_VERSIONS` bump clears that family.
- **Plans:**
  - `courses` is the Courses-tab order, with at most one entry per course.
  - `sectionCode: null` means bookmarked (the UI's word; "saved for later" before 2026-09-26), per plan.
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
- **Plan sync** (`docs/V2.md` §5.3, `src/features/sync/`): the synced tables stay the source of truth; `syncDocs` and the `sync` row are all sync adds. The engine reads and writes them together with the synced tables in one transaction per step, under a Web Lock every tab shares. Signing out forgets them (`syncDocs` cleared, `sync` deleted), so the next sign-in merges as a first one; "Sign out and remove plans from this device" also clears `plans`, `blocks`, `courseColors` and the `travel` and `chatPlans` rows.
- **Seat watches** aren't kept in the browser: they're the signed-in person's, in D1 (§7.1), and the app holds the list in memory (`src/state/seat-watches.ts`). The one thing kept locally is a watch asked for while signed out, in `sessionStorage["terpsicle:pending-watch"]` (`{termId, sectionKey, at}`, zod-checked, 30 minutes), so the watch starts when the person comes back signed in to that tab.

### 5.1 Client catalog flow
1. Fetch `catalog/terms.json` (ETag revalidation). Pick the term.
2. Render immediately from `manifests[catalog/<term>/manifest.json]` plus `files`, if cached.
3. Fetch the manifest and check `schemaVersion` (§2.3). Diff it against the cached one:
   - fetch departments whose hash changed or that are new;
   - fetch seats if `seats.hash` changed;
   - fetch changes if `changes.hash` changed.

   Validate each file.

   Departments load in two ways. Whatever is on screen asks for its own departments (`ensureDepts`: an open course's details, the plan's courses, a shared link), fetched at once and shown as soon as they arrive. Then the rest of the term loads in the background (`ensureTerm`), 16 files at a time with a `low` Fetch Priority, and shows once it's all in; search waits for that (`settled`). A department something asks for during the background load is fetched right away, not in its turn, and no file is fetched twice. On a first load, departments don't wait for seats and changes; they load side by side, and a batch shows once the seats are in too.

   Why 16 and not 6: `/data` is served over HTTP/2, so the browser's six-connections-per-host limit doesn't apply, and ~200 small files (about 850 KB compressed) are bound by round trips, not bandwidth. Over HTTP/1.1 (a local dev server) the browser queues them at six, by priority.
4. In **one Dexie transaction**, put the new `files` and then the new manifest. Never store a manifest whose files are missing. Then delete this term's `files` rows the manifest no longer references.
5. **Polling:** for an active term, poll the manifest every 60 s while the document is visible, and immediately when it becomes visible again. Most polls are a 304. A change in `seats.hash` alone fetches only the seats file. For an archived term, fetch the manifest once per session and don't poll.
6. PlanetTerp and geo follow the same pattern with their own manifests, fetched lazily: a PlanetTerp department file when a course from it opens, or when the generator ranks by rating or GPA; the routes binary when the plan first has a connection.

The client does this in `src/state/catalog-store.ts` (cache: `src/state/data-cache.ts`). Two details:
- Hashed files are put as they arrive, and the manifest is committed (with the eviction of step 4, in one transaction) once every file it lists is saved. The invariant is the same, and an interrupted first load resumes from the files it already has.
- Mock mode prefixes its rows with `mock:`, since `pnpm dev` and `pnpm dev:mock` share localhost. A cache row records nothing about schema versions; instead the pointer `_schema-versions` does, and a build with a different version for a family clears that family first.

### 5.2 Client course index flow (v3)

`src/state/course-index-store.ts` follows §5.1 with the same cache (`files` rows with `family: "courses"` and no `termId`, the pointer under `courses/manifest.json`, `mock:` prefixes), and loads only on demand: Plan imports it, the scheduler never does (`scripts/check-bundle.ts` fails the build if `/schedule` loads it eagerly).
1. `ensureSearch()` or `ensureDepts(depts)` first shows the cached manifest if there is one, and checks the server's once per session; with nothing cached it waits for the server.
2. Files are read by hash from the cache, else fetched, validated and cached. A department the index doesn't list is ready and empty, so `courseIndexEntry(state, code)` is `null` for a code the index doesn't know and `undefined` while its department hasn't loaded.
3. The manifest check diffs hashes and refetches only files already loaded that changed, then, in one Dexie transaction, stores the new manifest and drops cached `courses/` files it no longer lists.
4. Unlike the catalog, the cached manifest may list department files the browser doesn't have yet. What's cached is always listed by it. A cached manifest more than a day old can name files the server has deleted; a file that's missing waits for the session's manifest check and loads the new hash.
5. There's no polling: the index changes at most every 6 h.

### 5.3 The installable app (service worker, install prompt, push)
V2.md §3 is the plan; this is what the browser keeps.
- **Service worker** (`/sw.js`, `src/server/service-worker.ts`): one for the whole site. Cache Storage holds pages (`terpsicle-pages-v<n>`, network-first), build files as they're fetched (`terpsicle-assets-v<n>`), and the app shell precached at install (`terpsicle-shell-v<n>-<build>`). It never caches `/api`, `/auth`, `/avatars`, `/data` or `/ingest`, navigations included: IndexedDB already keeps the data, and the manifests must revalidate (§2.5, §5.1).
- **Install prompt** (`src/features/pwa`): `localStorage["terpsicle:install-prompt"]` holds `InstallPromptStateSchema` (`{dismissals, lastDismissedAt}`); `sessionStorage["terpsicle:install-shown"]` marks a tab where the prompt already opened. `requestInstallPrompt(trigger)` opens it only where installing works, never in the installed app, at most once per session, not within 90 days of a dismissal, and never after two. Closing it any way but installing is a dismissal, except when it was opened from the "Install app" item. Storage that can't be read means "don't show".
- **Push payload** (`PushPayloadSchema`): `{v: 1, type, title, body, url, tag}`. `url` is a path on this site; a click focuses a window already there, else takes an open one there, else opens one. A newer notification with the same `tag` replaces the older one. The service worker repeats the schema's checks by hand (it can't load zod) and shows "Terpsicle: Open the app for details." for a payload it can't read.

### 5.4 Client review numbers flow (v2)

`src/state/reviews-store.ts` (`useReviewNumbers`) follows §5.2 for `reviews/`: `ensureDepts(depts)` shows the cached manifest at once and checks the server's once per session, reads department files by hash from the cache or the network (validated, `family: "reviews"`), treats a department the manifest doesn't list as ready and empty, and on a missing file waits for the session's manifest check and tries the new hash. `refresh()` refetches only loaded files whose hash changed, then stores the manifest and drops unlisted files in one transaction. `app.tsx` connects it beside the catalog; course details read it through `useTerpsicleReviews(dept, enabled)`, and the reviews pages can use the same store. A manifest or file that can't load leaves PlanetTerp's numbers on their own.

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
- is rate-limited per IP per hour, keyed by an HMAC of `CF-Connecting-IP`. The HMAC key lives only in R2 (`_jobs/keys/hmac.json`, made on first use) and the IP is never stored. Signed-in routes may instead (or also) set `perUserPerHour`, keyed `user:<id>:<route>`, checked after the session and before the body is read;
- has a body of at most 16 KiB unless its route sets `maxBytes` (only `sync/push` does).

| Endpoint | Input | Result | Per IP per hour |
|---|---|---|---|
| `review-summary` | `ReviewSummaryInputSchema` `{slug, course}` | `ReviewSummaryResultSchema` | 300 |
| `alerts/watch` (`auth: "user"`) | `SeatWatchInputSchema` `{termId, sectionKey}` | `SeatWatchResultSchema`: `watching` (with the `watch`; idempotent), `unknown-section`, `too-many` (past 30) or `unavailable` | none; 120 per user |
| `alerts/unwatch` (`auth: "user"`) | `SeatWatchInputSchema` `{termId, sectionKey}` | `{status: "stopped"}` (idempotent; works while the flag is off) | none; 120 per user |
| `alerts/list` (`auth: "user"`) | `SeatWatchListInputSchema` `{termId?}` | `SeatWatchListResultSchema`: `ok` (`watches`, newest first) or `unavailable` | none; 600 per user |
| `me` | `MeInputSchema` `{}` | `MeResultSchema`: `signed-out` or `signed-in` (with `user`), and `flags` | 600 |
| `auth/sign-out` | `SignOutInputSchema` `{removeLocal?}` | `{status: "signed-out"}`, and clears the cookies | 30 |
| `account/delete` (`auth: "user"`) | `AccountDeleteInputSchema` `{}` | `AccountDeleteResultSchema` `{status: "deleting", deleteAfter}` | 30 |
| `auth/test-sign-in` (test mode only; 404 elsewhere) | `TestSignInInputSchema` `{userId, return?}` | `TestSignInResultSchema` | 60 |
| `sync/push` (`auth: "user"`) | `SyncPushInputSchema` `{docs: [{kind, id, baseRev, body}]}` (≤ 50, each body ≤ 64 KiB) | `SyncPushResultSchema` `{results}`: per doc `ok` (with `rev`), `conflict` (with the server's `doc`, or null) or `too-many-plans` | none; 1,200 per user |
| `sync/pull` (`auth: "user"`) | `SyncPullInputSchema` `{since}` | `SyncPullResultSchema`: `ok` (`cursor`, `docs`, `more`) or `reset` | none; 600 per user |
| `admin/moderation/queue` (`auth: "admin"`) | `QueueListInputSchema` `{status?, limit?}` | `QueueListResultSchema` | 600 |
| `admin/moderation/resolve` (`auth: "admin"`) | `ResolveInputSchema` `{id, action, reason}` | `ResolveResultSchema` | 600 |
| `admin/moderation/undo` (`auth: "admin"`) | `UndoInputSchema` `{id}` | `ResolveResultSchema` | 600 |
| `reviews/list` (`REVIEWS_ENABLED` ≥ `read`) | `ReviewListInputSchema` `{instructorId, course, cursor, limit?}` | `ReviewListResultSchema` `{reviews: PublicReview[], next}` | 1,200 |
| `reviews/submit` (`auth: "user"`, `on`) | `ReviewSubmitInputSchema` `{instructorId, reviewedName, dept, course, termId, rating, grade, body}` | `ReviewWriteResultSchema` | none; 20 per user |
| `reviews/edit` (`auth: "user"`, `on`) | `ReviewEditInputSchema` `{reviewId, termId, rating, grade, body}` | `ReviewWriteResultSchema` | none; 30 per user |
| `reviews/delete` (`auth: "user"`, `read`) | `ReviewDeleteInputSchema` `{reviewId}` | `ReviewDeleteResultSchema` | none; 60 per user |
| `reviews/mine` (`auth: "user"`, `read`) | `ReviewsMineInputSchema` `{}` | `ReviewsMineResultSchema` `{reviews: MyReview[]}` | none; 300 per user |
| `reports/create` (`auth: "user"`, `read`) | `ReportCreateInputSchema` `{surface, ref, reason, note}` | `ReportCreateResultSchema`: `reported` · `not-found` · `own` | none; 30 per user |
| `chat/unread` (`auth: "user"`) | `ChatUnreadInputSchema` `{termId}` | `ChatUnreadResultSchema` `{rooms: [{room, courseCode, lastSeq, unread, lastMessageAt, muted}]}` | none; 1,200 per user |
| `chat/follow`, `chat/unfollow` (`auth: "user"`) | `ChatFollowInputSchema` `{termId, courseCode}` | `{status: "ok"}`, or `too-many` past 100 follows in a term | none; 600 per user |
| `chat/mute` (`auth: "user"`) | `ChatMuteInputSchema` `{termId, courseCode, roomId, muted}` | `{status: "ok"}` | none; 600 per user |
| `chat/members` (`auth: "user"`) | `ChatMembersInputSchema` `{termId, courseCode, roomId}` | `ChatMembersResultSchema`: `ok` (`members` by name, ≤ 200, and `total`), `not-a-member` or `not-found` | none; 600 per user |

**Identity** (§7.6, `docs/AUTH.md`) adds the `auth` field to the route table: `"user"` and `"admin"` routes need a same-origin request (`Origin`, and `Sec-Fetch-Site` when sent) and a session, answer `401 unauthorized` or `403 forbidden` otherwise, and get the session's user in `ctx.session`. `ApiErrorSchema` gains `unauthorized` and `forbidden`. Two GET navigations sit beside the table, `/api/auth/google` and `/api/auth/google/callback`, and one Worker route outside `/api`, `/avatars/*`. Chat adds the one WebSocket route, `GET /api/chat/socket` (§7.9).

Moderation (`moderate()`, the `moderation_decisions`, `moderation_queue` and `reports` tables in `0004_moderation`, the retry cron, the admin API) is described in `docs/MODERATION.md`.

### 7.1 Seat watches (`SPEC.md` §3.12, `docs/V2.md` §6.5)

A signed-in person watches a section; the seats cron emails them when it reopens. The email-token flow (subscribe, confirmation link, manage tokens, the `/alerts/*` pages) retired with `0007_seat_watches`, which dropped its tables rather than migrating them (nothing was public; STATUS.md).

**Flag.** `SEAT_ALERTS_ENABLED` (a `wrangler.jsonc` var, `"true"`; `"false"` is the off switch):
- while it's off, or where there's no `EMAIL` binding (previews never have one), `alerts/watch` and `alerts/list` answer `{status: "unavailable"}` before any rate limiting, `/api/me`'s `flags.seatAlerts` is false (the app then hides every bell and list), and `notifySeatChanges` does nothing;
- `alerts/unwatch` works either way: stopping is always allowed;
- `EMAIL_SUBJECT_PREFIX` (a var, unset in production) is prepended to every alert subject, e.g. `[Test] ` for a trial run.

**Flow** (`src/server/alerts/`):
1. **Watch.** `alerts/watch` checks the section exists in an active term (the published catalog in R2), counts the person's watches (at most `SEAT_WATCH_MAX_PER_USER`, 30, across terms), and inserts the row with `last_open` from the current seats file, so only a reopening after now emails. Watching twice answers the same watch.
2. **Alert.** The seats cron calls `notifySeatChanges(env, before, after, {now})` (`notify.ts`) after publishing a term's seats file. For each watch in that term whose person is `active` and whose section has counts, it sends "A seat opened" (or "3 seats opened") to the account's address (`users.email`, the one used last) when all of these hold:
   - the section had 0 open seats before (the previous file, or else `last_open`);
   - it has more than 0 now;
   - there was no alert for this watch in the last 30 min;
   - the person got fewer than 20 alerts in 24 h (`seat_alert_sends`).

   It records `last_open`, `last_checked_at` and `last_notified_*`, and prunes counters and week-old send rows. Web push joins here once `v2/push` lands (V2.md §6.4).
3. **Stop.** In the app: `alerts/unwatch`, from the bell, the problem's button, or the Watching list, with Undo (no confirmation, DESIGN §5). From the email: its one-click unsubscribe (below).
4. **The end of a term.** The daily job (`endPastTermWatches`) deletes watches whose term isn't `active` in `terms.json` any more (archived or gone): seats stop updating then. Deleting an account deletes its watches (`ON DELETE CASCADE`).

**The email** (`email.ts`): plain text plus simple table-based HTML, `Auto-Submitted: auto-generated`, from `Terpsicle <alerts@terpsicle.com>` through the Email Service binding `EMAIL`. It has the counts, Testudo's as-of time in Eastern, a link that opens the course (`/schedule?term=<id>&course=<code>`, which opens it over Courses in that term; `ScheduleSearchSchema`, §8.1), Testudo's page, and "See or stop your watches" (`/settings#watching`). Cron emails always link to terpsicle.com.

**One-click unsubscribe** (RFC 8058): `List-Unsubscribe: <https://terpsicle.com/api/alerts/one-click?u&t&s&k>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. `k` is an HMAC of the user, term and section under the Worker's own key (`keyedHash`, the R2 key that also hashes IPs), so a link stops only that one watch and can't be made for anyone else's. The route sits outside the JSON table (mail providers POST a form):
- `POST` stops the watch (idempotent) and answers a plain "Stopped";
- `GET` (a person, or a link scanner) changes nothing and redirects to `/settings#watching`, where Stop has Undo;
- a bad key is `400`; at most 60 per IP per hour.

**Dedupe.** `seat_alert_sends.dedupe_key` is unique, so a retried cron sends nothing twice: `seat-open:<userId>:<term>:<section>:<seats asOf, or the 30-min window>:email` (V2.md §6.5's key).

**Migration** (`migrations/0007_seat_watches.sql`, applied by `deploy.yml` to production and by ci.yml's preview job to `terpsicle-preview`):

```sql
DROP TABLE alert_tokens;
DROP TABLE email_sends;
DROP TABLE alert_subscriptions;

CREATE TABLE seat_watches (
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id             TEXT NOT NULL,
  section_key         TEXT NOT NULL,          -- e.g. CMSC351-0101
  created_at          TEXT NOT NULL,
  last_open           INTEGER,                -- open seats at the last check
  last_checked_at     TEXT,
  last_notified_at    TEXT,
  last_notified_open  INTEGER,
  PRIMARY KEY (user_id, term_id, section_key)
);
CREATE INDEX seat_watches_by_section ON seat_watches (term_id, section_key);

CREATE TABLE seat_alert_sends (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id      TEXT NOT NULL,
  section_key  TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('email')),
  dedupe_key   TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id  TEXT,
  sent_at      TEXT NOT NULL
);
CREATE INDEX seat_alert_sends_by_user ON seat_alert_sends (user_id, sent_at);
```

`seat_alert_sends` stands in for V2.md's `notification_deliveries` until `0006_notifications` lands; `v2/push` can fold it in. `counters` (from `0002_seat_alerts`) stays: per-IP and per-user limits and the summary cap. `SeatWatchRowSchema` validates rows on read (`src/server/alerts/store.ts`).

### 7.2 Review summaries

`review-summary` takes `{slug, course}` and returns `ReviewSummaryResultSchema` (`src/server/summaries/`). `slug` is any instructor id, so a minted instructor (`t~…`) with Terpsicle reviews gets a summary too.

1. **Find the instructor.** The course's department names the PlanetTerp file that holds the instructor's `reviewCount` and `latestReviewAt`: `planetterp/manifest.json` → `planetterp/dept/<DEPT>.<hash>.json`. While `REVIEWS_ENABLED` isn't `off`, our published reviews of the same id count too (D1 `publishedStats`): the combined `reviewCount` is the sum, and the combined newest is the later of PlanetTerp's and the month of ours (ours by month only, since a summary's `latestReviewAt` reaches the browser). Neither source knows the id → `unknown-instructor` (unless the `instructors` registry does: `no-reviews`); no reviews → `no-reviews`.
2. **Serve the cache.** `summaries/<slug>.json` is used when it's fresh: `basedOnReviewCount ≥ reviewCount`, its `latestReviewAt` is at least the instructor's, and `sources.terpsicle` (0 when absent) equals our published count, so a review of ours taken down makes it stale. The summary covers all of an instructor's reviews, so one file per instructor serves every course.
3. **Otherwise, generate once.**
   - **One generation at a time.** Concurrent requests in one isolate share one promise. Across isolates, a lock object `_jobs/summary-locks/<slug>.json` is taken with a create-only R2 put (`etagDoesNotMatch: "*"`). A lock older than its 60 s TTL is taken over with an etag-conditional put.
   - **Losers wait.** They poll R2 for up to 20 s for the new summary, then answer `busy`.
4. **Enforce the daily cap.** A D1 counter `summaries` per UTC day is checked against `SUMMARIES_DAILY_CAP` (a var, 200). Past it → `daily-limit`.
5. **Get the reviews.** Ours: the newest 40 published ones from D1 (`publishedForSummary`). PlanetTerp's (only when its file counts some): first from the PlanetTerp job's private copy, `_jobs/planetterp/reviews/<slug>.json` (§2.6), when it holds at least the instructor's `reviewCount`. Otherwise live from PlanetTerp `/professor?name=…&reviews=true`, used only if its slug matches: names collide, so a mismatch falls back to the stored copy, or is `failed` rather than the wrong person's reviews. When PlanetTerp is down or gone, a stored copy that's behind is still used, so summaries can be regenerated without PlanetTerp.
6. **Run the model** (`src/server/summaries/prompt.ts`).
   - **Input:** the 40 newest reviews of both sources together, at most 18k characters, each stripped of `<`, `>` and links, inside one `<reviews>` fence. The system prompt says the reviews are data and any instructions inside them must be ignored.
   - **Output:** JSON mode with a schema, then `ModelSummarySchema`:
     - a summary of 20–600 characters and at most about 75 words, with no links, addresses or markup;
     - 2–4 themes of 1–4 lowercase words, each with a sentiment.
   - **Retries:** invalid output gets one retry that names the problem; a second failure is `failed`. Nothing that fails validation is stored or shown.
7. **Check it with Llama Guard** (`@cf/meta/llama-guard-3-8b`, the moderation service's `runGuard`), for S5 (defamation) above all, since the summary restates what reviews say about a real person. Any unsafe verdict, or a check that fails, is `failed`: nothing is stored or shown (`summary_failed` with `unsafe` or `guard-error`).
8. **Store and return** the `ReviewSummary`, with `sources: {planetterp, terpsicle}` (how many reviews of each it covers; optional and additive, so older summaries without it read as PlanetTerp's only). The UI's footer names both ("Summary of 61 reviews: 48 on PlanetTerp, 13 on Terpsicle"). The UI hides the summary for every `unavailable` reason, and the summary is the only thing shown with the sparkles icon.

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
- seat watches: `alert_watched`, `alert_sent`, `alert_unwatched` (`via`: `app` or `email`), `alert_watches_ended`;
- identity: `signin_result` (`outcome`, and `hd` on success).

They carry counts, reasons and term ids only. They never carry an address, token, IP or review text, not even hashed.

### 7.4 Chat (`src/core/schema/chat.ts`)

Rooms aren't stored: `roomsForCourse(termId, course)` in `core/chat` derives them from the catalog, and a room gets storage only with its first message. They follow course details' one level of grouping: a course room; with 2+ sections, a room per section; and with more than one professor, a room per named professor between the course and their sections (TBA sections sit under the course room). There are no lecture rooms. One `CourseChat` Durable Object per course per term (named by the course room id) holds every room of that course, and the app keeps one WebSocket per open course.

- **`ChatMessage`:** `id`, `room`, `author` (directory ID, the Google name and our `/avatars/…` copy of the picture, as they are now; the name the author wrote under if the account is gone), `text` (trimmed, 1–2,000 chars), `createdAt`, `editedAt`, `replyTo` (the thread's first message; threads are one level deep), `thread` (reply count and last reply time), `reactions` (who reacted, per reaction in the fixed set `REACTIONS`) and `moderation`: `visible`, `held {reason}` (only the author sees it; `checking` · `graded-work` · `flagged` · `reported`) or `removed`.
- **Client frames** (`ChatClientFrameSchema`, strict): `hello {protocol, rooms}` first, then `history {room, thread, before, limit}`, `send {room, text, replyTo}`, `edit`, `delete`, `react {id, reaction, on}`, `typing {room}` and `read {room, upTo}`. Requests carry a client `req` id.
- **Server frames** (`ChatServerFrameSchema`): `welcome {you, rooms: [{room, members, unread, writable}]}`, `page {messages (oldest first), more}`, `ack {req, message}` (the message as its author now sees it; null after a delete), `error {req, code, retryAfter}`, `message` (new or changed; replaces the copy with that id), `deleted`, `reactions`, `moderation` (every change to the author; `removed` to everyone who had seen it) and `typing`.
- `CHAT_PROTOCOL_VERSION` is bumped on a breaking change; an older client's `hello` gets `error {code: "old-client"}` and reloads.
- A `send`'s `req` is also its idempotency key: resending the same `req` (after a reconnect) gets the first message back. Clients pick a random one per message.

### 7.5 v2 tables (D1 `terpsicle`)

The full SQL, and what each column means, is in `docs/V2.md`; once a migration lands, its file and the row schemas win, and this list follows them. Migration numbers are fixed now so parallel PRs don't collide.

| Migration | Tables | Holds |
|---|---|---|
| `0003_identity` | `users` (key: directory ID; `email`, `hd`, `name`, `picture_url`, `picture_key`, `status`, `delete_after`, `chat_blocked_until`, `reviews_blocked_until`, …), `user_identities` (Google `sub` → user, with that tenant's `email`, so both a TERPmail and a UMD Gmail address are kept), `sessions` (hashed cookie tokens, 30-day sliding) | Accounts (V2.md §4.4) |
| `0004_moderation` | `moderation_decisions` (text-free log), `moderation_queue` (the human queue; snapshots blanked 30 days after close), `reports` | The shared moderation service (V2.md §9.4) |
| `0005_sync` (landed, §7.7) | `sync_docs` (`user_id`, `kind`, `doc_id`, `term_id`, `rev`, `deleted`, `body`, `updated_at`), `sync_heads` (`head`, `pruned_through`) | Plan sync: one JSON row per doc, per-doc rev compare-and-swap (V2.md §5.2) |
| `0006_notifications` | `notification_settings`, `push_subscriptions` (one per device, unique `endpoint`), `notifications` (chat mentions and replies), `notification_deliveries` (every push and email, unique `dedupe_key`) | Notifications (V2.md §6.3) |
| `0007_seat_watches` (landed, §7.1) | `seat_watches` (`user_id`, `term_id`, `section_key`, last-seen and last-notified fields), `seat_alert_sends` (dedupe and the daily cap, until `notification_deliveries`); drops `alert_subscriptions`, `alert_tokens`, `email_sends` | Signed-in seat alerts (V2.md §6.5) |
| `0008_reviews` (landed, §7.8) | `instructors`, `instructor_names`, `reviews` (with `author_id`, never exposed to readers or moderation) | Terpsicle Reviews (V2.md §7.3) |
| `0009_chat` (landed, §7.9) | `chat_members`, `chat_follows`, `chat_rooms` (a row only after a room's first message), `chat_read_markers`, `chat_room_prefs`, `chat_author_courses` | Chat indexes; messages live in the `CourseChat` Durable Object's own SQLite (V2.md §8.4–8.5) |
| `0010_four_year_sync` (landed, §7.7) | rebuilds `sync_docs` so `kind` also allows `four-year` (with tombstones) | Terpsicle Plan's docs sync like plans (V3.md §2.4) |
| `0011_todo` (v3) | `todo_feeds` (the ELMS link, encrypted), `todo_items`, `todo_done` | Terpsicle Todo (V3.md §3.4) |
| `0012_feedback` | `feedback`, `feedback_groups` | The feedback sheet (FEEDBACK.md) |
| `0013_author_stops` | `moderation_author_stops` (per queue item: the stop's id and when it ends; no author), `author_stops` (per stop: who it's on, for Reviews' and Chat's stores; purged with the account) | "Stop this author" and its Undo (V2.md §10, MODERATION.md §6) |

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

### 7.7 Plan sync (landed: `migrations/0005_sync.sql`, `0010_four_year_sync.sql`)

The design is `docs/V2.md` §5; the routes are `src/server/sync/api.ts`, the SQL `src/server/sync/store.ts`, and the input, result and row schemas (with the limits) `src/core/schema/sync-api.ts`. Rows are read with `SyncDocRowSchema` and turned into docs by `syncDocFromRow`, which checks them against `SyncDocSchema`.

| Table | Key | Columns | Notes |
|---|---|---|---|
| `sync_docs` | `(user_id, kind, doc_id)` | `term_id`, `rev`, `deleted`, `body` (JSON), `updated_at` | `kind` is `plan`, `settings` or `four-year`: one row per plan doc, one per four-year doc (Terpsicle Plan, V3.md §2.4) and one `settings` row per user. `rev` is unique per user (`sync_docs_since`), and a save always takes a new one. A deleted plan or four-year doc is a tombstone (`deleted = 1`, `body` NULL; a plan's keeps its `term_id`) until the daily job prunes it 30 days after `updated_at`. `term_id` is NULL for settings and four-year docs. |
| `sync_heads` | `user_id` | `head`, `pruned_through` | `head` is the last rev handed out; `pruned_through` the highest pruned tombstone's rev. A pull from below it (but above 0), or from above `head`, gets `reset`. |

- **Saving** is one D1 batch per push (a transaction): per doc, read the stored row, then `head + 1` and the upsert, both only if the stored rev (0 for no row) is the push's `baseRev` and a new live doc stays within its kind's cap: 200 plans (`SYNC_MAX_PLANS`), 20 four-year docs (`SYNC_MAX_FOUR_YEAR_DOCS`); past it the doc's result is `too-many-plans`. No row and a non-zero base (a pruned tombstone) is a conflict with `doc: null`.
- **Four-year docs** are saved whole and never read by the server past validation. The shared input schema checks that the body is a JSON object whose `id` is the doc's (`FourYearSyncBodySchema`) and the 64 KiB body limit every kind has; `sync/push` then checks the whole doc against `FourYearDocSchema` (`invalid-input`, nothing saved). The full schema stays out of the `~/core/schema` barrel, so the device checks it again when it reads a body. Grades live in the body (V3.md §2.5), so nothing else on the server may parse it. While `PLAN_ENABLED` isn't `"true"`, a push carrying a four-year doc answers `unavailable` and saves nothing.
- **Unknown kinds:** `SyncPullResultSchema` drops a pulled doc whose `kind` this build doesn't know instead of failing the page, and the scheduler's engine skips four-year docs (`isScheduleDoc`), so adding a kind never breaks an older tab. Such a tab still moves its cursor past the doc; Plan's Dexie upgrade resets the cursor to 0 once, so it pulls them after all (V3.md §2.4).
- **Migration 0010** rebuilds `sync_docs` (SQLite can't alter a `CHECK`): create `sync_docs_new`, copy every row, drop, rename, recreate `sync_docs_since` and `sync_docs_tombstones`, under `PRAGMA defer_foreign_keys = on`. Nothing references `sync_docs`. `src/server/sync/migration.test.ts` rebuilds a 0005-shaped table with rows and checks they, and the indexes, come through unchanged.
- **Deleting an account** removes both tables' rows: explicitly in the purge, and by `ON DELETE CASCADE`.
- **Chat membership:** after the batch, a push that saved anything rewrites the person's `chat_members` for the terms it touched (§7.9).

### 7.8 Reviews (landed: `migrations/0008_reviews.sql`)

The design is `docs/V2.md` §7. Routes: `src/server/reviews/api.ts` (and `reports/create` in `src/server/moderation/reports.ts`); SQL: `src/server/reviews/store.ts`, the only file that reads `reviews.author_id`; schemas: `src/core/schema/reviews.ts`; pure rules (stage 0, limits, bursts, text key, minted ids, words): `src/core/reviews`.

| Table | Key | Columns | Notes |
|---|---|---|---|
| `instructors` | `id`: the PlanetTerp slug, or a minted `t~` + 10 base32 (`MintedInstructorIdSchema`) | `name` (the Testudo name it was first reviewed under), `planetterp_slug`, `created_at` | `InstructorSlugSchema` accepts both kinds, so summaries and links key on either. |
| `instructor_names` | `(name_key, dept)` | `instructor_id`, `rule` (`planetterp` · `minted` · `manual`), `updated_at` | Filled at a review's submit. `manual` is the owner's fix and beats PlanetTerp's join. |
| `reviews` | `id` (16 random bytes, base64url; also the moderation ref) | `author_id` (ON DELETE SET NULL), `instructor_id`, `reviewed_name`, `course`, `term_id`, `rating`, `grade`, `body`, `text_hash`, `status`, `reason`, `pending_edit`, `report_count`, `created_at`, `published_at`, `edited_at`, `updated_at` | One live (`published` · `held` · `hidden`) review per author, instructor and course. |

- **Finding the instructor** (`resolveInstructor`): the given id if the registry or the department's PlanetTerp file knows it; else a `manual` name row; else the PlanetTerp `names` map (recorded as `planetterp`); else an earlier name row; else a minted id (recorded as `minted`).
- **States.** A new review is `held` while `moderate()` runs (a few seconds), then `published`, `held` (for a person, or a retry) or `rejected`. Readers' reports can make a published review `hidden` (V2 §9.3). The author's delete makes it `deleted`: words cleared at once, the row and its reports removed 30 days later by the daily job, which also clears rejected words 30 days after the decision.
- **Edits.** A held review's words are replaced and checked again. A published review stays up with its old words while its edit (`pending_edit`: `{termId, rating, grade, body, textHash, state: waiting · rejected, reason}`) is checked; the edit is applied when it passes (then `edited` shows), or turned down. A hidden review, or one with reports waiting for the owner, can't be edited (`under-review`) until the owner decides.
- **Stage 0** runs before anything is stored: any rule that would hold or remove (a link, contact details, a slur, the length) comes back as `invalid` with its span; so do words already published for the instructor (`duplicate`, by `text_hash`, the SHA-256 of `reviewTextKey(body)`). Flags go on to the models.
- **Limits:** `users.reviews_blocked_until` (`blocked`); 10 new reviews per author per 7 days, deleted ones included (`limit`, with the wait); a burst (the 24-hour count of new reviews for the instructor past both 5 and 3× its 30-day daily average) holds the review for the owner with reason `burst`.
- **Later decisions** reach reviews through `MODERATION_HANDLERS.review` (`src/server/reviews/decisions.ts`): approve publishes (applying a waiting edit), remove rejects the review (or only a waiting edit of a published review, unless reports are waiting too), undo puts it back to waiting.
- **Published numbers:** the hourly `reviews-publish` job copies published reviews' ratings (never their words) to R2 `reviews/` (§4.6).
- **Anonymity** (V2 §7.5): `PublicReview` is strict and has no author; dates are months (America/New_York); the list cursor is a review id, not a time. `reviews/mine` shows your own reviews without an author field. Moderation rows and snapshots never hold the author, and `src/server/reviews/anonymity.test.ts` checks every answer, both moderation tables and the models' input.


### 7.9 Chat (landed: `migrations/0009_chat.sql`, the `CourseChat` object)

The design is `docs/V2.md` §8. The object is `src/server/chat/course-chat.ts` (its SQLite in `object-store.ts`), the socket route `src/server/chat/socket.ts`, the JSON routes `src/server/chat/api.ts`, the D1 SQL `src/server/chat/store.ts`, and the pure rules (who may read, chat plans, retention, message ids, what a moderation decision means) `src/core/chat`.

**D1:**

| Table | Key | Columns | Notes |
|---|---|---|---|
| `chat_members` | `(user_id, term_id, course_code)` | `section_code` (`''` for a saved-for-later course) | One row per course of each person's chat plan: the settings doc's `chatPlans[term]` when it names one of the term's live plans, else the term's first tab (`chatPlanFor`). Rewritten after every push that saved a plan (its term) or the settings doc (every term the person has rows or a choice in). The write is skipped if another save moved `sync_heads.head` since the read, since that push rewrites the rows itself. |
| `chat_follows` | `(user_id, term_id, course_code)` | `created_at` | Course rooms opened from outside your plan; ≤ 100 per term. |
| `chat_rooms` | `(term_id, course_code, room_id)` | `kind`, `sections` (JSON section codes), `last_seq`, `last_message_at` | Written by the object when a message becomes visible, so a room has a row only after its first. `kind` and `sections` let `chat/unread` pick your professor and section rooms without the catalog. |
| `chat_read_markers` | `(user_id, term_id, course_code, room_id)` | `seq` | Only moves forward. `chat/unread`'s count is `last_seq − seq`. |
| `chat_room_prefs` | `(user_id, term_id, course_code, room_id)` | `muted` | |
| `chat_author_courses` | `(user_id, term_id, course_code)` | | Where someone has written, for account deletion: recorded at their first send in a course, so held messages count. The purge calls `purgeAuthor` on each course's object and deletes the row once it answers. No foreign key. |

**The object's SQLite** (made on its first write; an object nobody wrote in has no storage):
- `meta`: `term_id`, `course_code`, `read_only_at` and `delete_at` (epoch ms, from `chatRetention`), `read_only_announced`.
- `rooms`: `room_id`, `last_seq`, `created_at`.
- `messages`: `id` (a ULID), `room_id`, `seq` (per room from 1), `author_id`, `author_name` (shown only if the account is gone), `body`, `reply_to` (the thread's first message), `status` (`checking` · `visible` · `held` · `removed`), `held_reason`, `client_req` (unique per author: idempotent sends), `created_at`, `edited_at`, `check_after` (when a message still `checking` is screened again; null once moderation's cron owns it).
- `reactions`: `(message_id, reaction, user_id)`, `at`.
- `sends`: `(author_id, at)` for the limits (10 per 30 s, 500 per day, edits included), pruned after a day.

**The socket.** `GET /api/chat/socket?term=<termId>&course=<code>` with `Upgrade: websocket`: `503` while `CHAT_ENABLED` is `off`, `426` without the upgrade, `403` cross-origin, `401` signed out, `400` for a bad query, `429` past 600 sockets per person per hour, `404` for a term or course the catalog doesn't have. The object gets `X-Terpsicle-User`, `-Term`, `-Course` and `-Chat` (`on` or `read`) and trusts them: only the Worker can reach it. Keepalive `ping` gets `pong` without waking it. Close codes: `4001` the rooms turned read-only, `4002` the course's chat was deleted, `4003` sign in again; the app reconnects (or not) and the new `welcome` says the rest.

**Sending:** check (can read the room, `CHAT_ENABLED` is `on`, the term isn't over, the room is listed, no admin block, the limits) → store as `checking` and ack → `moderate()` (kind `chat`, target `<termId>:<courseCode>:<messageId>`) → `visible` (broadcast), `held` (author only; `graded-work` or `flagged`), `removed` (author only), or still `checking` when only a failed model call held it (moderation's cron retries and calls Chat's handler). An edit is screened again, and classmates get `moderation {removed}` for the old text until the new one is visible. If `moderate()` throws, the object's alarm takes moderation's latest decision about that text, or screens it again, two minutes later.

**Reports** (`v2/chat-ui`): `reports/create` with `surface: "chat"` and the message's ref goes to its object (`src/server/chat/report-target.ts`, MODERATION.md §6). Reports that reach the hiding weight hold the message for its author only (`held`, `held_reason: reported`); the owner's approve shows it again.

**Mock mode** (`pnpm dev:mock`, e2e): `scripts/seed-mock-data.ts` puts the mock bucket into local R2 before Vite starts, so the object reads the same catalog the app does, and the Vite config sets `CHAT_ENABLED: "on"` and `MODERATION_OFFLINE: "true"`: with `AUTH_TEST_MODE` on, moderation calls offline stand-ins for the models (`src/server/moderation/offline-models.ts`: Guard says safe, the policy model scores 0), so only the rules hold anything.

**Retention:** the first message sets an alarm. Rooms turn read-only at midnight in College Park after the 10th day past `classesEnd`, or at once when `terms.json` has the term archived and no calendar is published; the alarm then closes every socket with `4001`. 60 days later it deletes the object's storage and the course's `chat_rooms`, `chat_read_markers`, `chat_room_prefs` and `chat_author_courses` rows (`notifications` join them with `v2/chat-notify`). `chat_members` stays: it describes people.

### 7.10 Terpsicle Todo (landed: `migrations/0011_todo.sql`)

The design is `docs/V3.md` §3; the routes are `src/server/todo/service.ts`, the SQL `src/server/todo/store.ts` (with `TodoFeedRowSchema` and `TodoItemRowSchema`), the fetcher `fetch.ts`, the per-feed write `refresh.ts`, and the cron `src/jobs/todo-feeds.ts`. Inputs, answers and limits are `src/core/schema/todo-api.ts`; the pure pieces (cadence, backoff, the window, file items, test mode's feed) are in `src/core/todo`.

| Table | Key | Columns | Notes |
|---|---|---|---|
| `todo_feeds` | `(user_id, source)` | `url_enc`, `status` (`active` · `paused` · `broken`), `created_at`, `next_fetch_at`, `last_fetch_at`, `last_success_at`, `failure_count`, `last_error` (a code), `gone_strikes`, `gone_at`, `etag`, `last_modified`, `content_hash`, `item_count`, `last_opened_at` | One ELMS feed per person. `url_enc` is the link sealed with AES-256-GCM, `v1.<keyId>.<iv>.<ciphertext>`, bound to `todo-feed:<userId>:<source>`; only `src/server/todo/crypto.ts` and `fetch.ts` touch it (`scripts/check-imports.ts`), and store.ts reads rows by naming every other column. `gone_strikes` / `gone_at` count 401/403/404/410 answers in a row at least an hour apart; the third sets `broken`. |
| `todo_items` | `(user_id, uid)` | `source` (`elms` · `file`), `title`, `course_label`, `course_code`, `section_code`, `kind`, `exam`, `gradescope`, `due_at`, `due_date`, `link`, `first_seen_at`, `updated_at` | Only `due_date` from 30 days ago to a year ahead, at most 1,500 feed items and 1,000 file items. A fetch is two statements whatever the size (`json_each`): an upsert that writes only changed rows, and a delete of the source's items that left. A feed item replaces a file item with its UID; a file item never replaces a feed item. No descriptions. |
| `todo_done` | `(user_id, uid)` | `done_at` | Apart from items, so a refetch or a reconnect keeps them. |

- **Disconnecting** deletes the feed row, its `elms` items and every done mark not on a remaining file item, in one batch.
- **The daily job** deletes items due more than 30 days ago, and done marks over 30 days old whose item is gone (we don't record when an item left the feed, so the mark's age stands in).
- **Deleting an account** removes all three by `ON DELETE CASCADE`.

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

### 8.1 The scheduler's other params

`/schedule` also carries where you are, validated by `ScheduleSearchSchema` (`core/schema/schedule-url.ts`); which change pushes a history entry is in `src/app/README.md`, "URL state". A bad value is dropped, never an error.

| Param | Value |
|---|---|
| `term` | Term id. Omitted until the term list loads. |
| `planId` | The open plan tab's local id; ignored when it isn't one of this browser's plans. |
| `tab` | Rail tab (`courses`, `search`, …). The app's own URLs always name it; a link without it (`?term=&course=` from an email) opens over Courses. |
| `course` · `connection` · `result` | The drill-in: a course code, a connection id, or a generated plan's id (only while that run's results are in memory). |
| `view=results` | Generate shows its results rather than the form. |
| `q` | Search's text. |
| `gened` · `credits` · `level` · `openSeats` · `fits` | Search's filter chips: comma lists (`gened=DSHU,DSNL`, `level=300`) and `1` flags. |
| `plan` · `demo` | The share link (above), and `pnpm dev:mock`'s demo switch. Kept as opened. |

History entries the app writes carry `ScheduleHistoryStateSchema` in their state: `inApp`, and the label of the view Back returns to.

---

## 9. Computed contracts (core → UI)

These aren't stored, but several workers build against them:
- **`Problem`**
  - `kind` fixes `severity` (`PROBLEM_SEVERITY`); sort by `SEVERITY_ORDER`.
  - `subjects[0]` is what clicking the problem opens.
  - `title` and `detail` are `MessagePart[]`, so codes, times and durations render in mono and can be clicked without parsing strings.
  - `fix` is `switch` (offered only when it creates no new problem), `accept-change` (for `changed`) or `watch` (for `full`: "Watch for a seat"; the UI shows the seat watch's own button and state instead of applying it).
  - A `full` problem on a section the signed-in person watches becomes kind `watching` (info), "Watching for a seat in CMSC351 0101", keeping its `watch` fix (`withWatches` in `src/core/problems`, applied by `usePlanProblemsState`). It's taken care of, so it counts as a note, not a problem.
  - `id` is `<kind>:<subject ids>`, stable while the cause lasts.
- **`FourYearProblem`** (Plan, `src/core/schema/four-year.ts`): the same shape as `Problem`, with `kind` in `prereq-order` · `light-semester` · `repeated-course` · `unknown-course` (warning) · `not-offered-lately` (the rest info, `FOUR_YEAR_PROBLEM_SEVERITY`); `subjects` are `entry {entryId}` or `term {term}`; `fix` is `move {entryId, term}` or `remove {entryId}`, offered only when applying it adds no problem. `id` is `<kind>:<subject ids>`.
- **`FitLabel`:** `fits` · `overlaps {with: course | block}` · `not-enough-time {direction, courseCode}` · `in-plan` · `no-set-times`. "Not enough time after CMSC330" means CMSC330 comes first.
- **`Connection`:** see §6.
- **Generator:**
  - `GenerateRequest`:
    - `items`: `course {required}`, `pick {count, courses}`, each course optionally limited to some sections, or `wildcard {wildcard, required, count}` (`WildcardSchema`: `{kind: "pattern", pattern: "CMSC4XX"}` or `{kind: "gen-ed", code: "DSHS"}`; `count` different courses from its set, 1–6);
    - `mustHaves`: `DEFAULT_MUST_HAVES` has travel time on and blocks respected;
    - `rankBy`: a preset factor, or `custom` with a 0–1 weight for every `RankFactor`;
    - the term's `blocks`, `travel` and `limits` (`DEFAULT_GENERATE_LIMITS`: best 200, 500k steps).
  - `GenerateResult`:
    - `results`: each result's `sections` has one representative (the lowest-numbered) per included course, and `equivalents.byCourse` lists the time-identical alternatives (so "×3 equivalent" is `equivalents.count`);
    - `truncated` for "showing the best 200";
    - each result's `filled` names the course it took for each wildcard (`{wildcard: "CMSC4XX", courseCode}`; wildcard ids are the pattern or `gen-ed:DSHS`);
    - `relaxations`: each has a `patch` to apply and an `unlockCount` (`makeWildcardOptional` for a required wildcard);
    - `nearMisses`: each has its `conflicts`;
    - `wildcards`: per wildcard item, how many courses `matched`, how many `fit` the must-haves and required courses, and how many were `tried` (at most 40 section groups each).

---

## 10. Open questions

1. **Low-section alerts.** The rule above emails only when a full section reopens (0 → >0). Should watching a *low* (not full) section also email when it gets close to full? The spec only says "when a seat opens".
2. **Gmail/Yahoo one-click unsubscribe.** Bulk-sender rules want `List-Unsubscribe-Post` (one-click), which would skip the confirmation the spec requires. We send `List-Unsubscribe` only (§7.1). At our volume that's fine; revisit if deliverability suffers.
