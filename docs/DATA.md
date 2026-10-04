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
| `history/manifest.json` (v3) | `HistoryManifestSchema`: the index, every term on record (newest first, with its file's hash and courses per source) and each department's hash | history job (6 h), backfill script | fixed |
| `history/term/<term>.<hash>.json` (v3) | `HistoryTermSchema`: the permanent record of one term, every course with its title, credits, source and each section's instructors (§3.5) | history job, backfill script | hashed |
| `history/dept/<DEPT>.<hash>.json` (v3) | `HistoryDeptSchema`: the read path, every term of every course in the department, newest first | history job, backfill script | hashed |
| `planetterp/manifest.json` | `PlanetTerpManifestSchema` | PlanetTerp job (daily) | fixed |
| `planetterp/dept/<DEPT>.<hash>.json` | `PlanetTerpDeptSchema` | PlanetTerp job | hashed |
| `planetterp/index.<hash>.json` | `PlanetTerpIndexSchema` | PlanetTerp job | hashed |
| `geo/manifest.json` | `GeoManifestSchema` | buildings job (weekly), routes script (weekly, GitHub Actions) | fixed |
| `geo/buildings.<hash>.json` | `BuildingsFileSchema` | buildings job | hashed |
| `geo/routes.<hash>.bin` | binary, §4.2 | routes script | hashed |
| `geo/route/<from>-<to>-<mode>.json` | `RouteGeometrySchema` | routes script | fixed |
| `geo/tiles.pmtiles` | PMTiles | script, rarely | fixed |
| `calendar/<term>.json` | `AcademicCalendarSchema` | calendar job (weekly) | fixed |
| `_jobs/…` | owned by M2, §2.6 | jobs (baselines, rotation state, reports) | **not served** |
| `reviews/manifest.json` (v2) | `ReviewsManifestSchema` | `reviews-publish` job (hourly) | fixed |
| `reviews/dept/<DEPT>.<hash>.json` (v2) | `ReviewsDeptSchema`: Terpsicle-review ratings per instructor id, and the names PlanetTerp's join doesn't cover (§4.6). Never review text | `reviews-publish` job | hashed |

**v2, bucket `terpsicle-user-content`** (binding `USER_CONTENT`; previews use `terpsicle-user-content-preview`): `avatars/<userId>/…` held cached Google profile pictures until 2026-09-28; there are no pictures now, and the daily job deletes what's left (`docs/V2.md` §4.5). `feedback/<yyyy-mm>/<id>.<ext>` and `<id>-element.<ext>`: feedback screenshots, served only to the admin at `/admin/feedback/shot/<id>[/element]` (`docs/FEEDBACK.md`). The `reviews/` family adds `reviews` to `SCHEMA_VERSIONS`; `ReviewSummarySchema` gains optional `sources` (additive).

### 2.2 Content hashing
- Hash = SHA-256 of the exact UTF-8 bytes written (`JSON.stringify(value)`, no whitespace), first 16 hex chars.
- Build objects in a deterministic key and array order (schema field order; arrays sorted as each schema's comments say), so unchanged data hashes the same.
- **Hashed files carry no timestamps.** Times that change every run (`fetchedAt`, `generatedAt`) live in the fixed-name manifest instead. That's why seats' `fetchedAt` is in the manifest, not the seats file: unchanged counts keep their hash and clients don't refetch.
- A hashed key is never overwritten with different bytes.

### 2.3 Schema versions
- `SCHEMA_VERSIONS` has one integer per family: `catalog`, `planetterp`, `geo`, `calendar`, (v3) `courses`, (v2) `reviews` and (v3) `history`. Every JSON file has `schemaVersion: <literal>`. The routes binary has its own header version (`ROUTES_BINARY_VERSION`); share links have `v` (`SHARE_PAYLOAD_VERSION`).
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
- Garbage collection: the catalog job deletes hashed files under a term that no current manifest references and that are older than 24 h. The 24 h grace keeps a client's in-flight diff working. It does the same under `courses/`, the reviews-publish job under `reviews/`, and the history job (and backfill) under `history/`.

### 2.5 Serving `/data/*`
The Worker maps `/data/<key>` to R2 and applies `dataCachePolicy(key)` (in `keys.ts`). A `null` policy means 404. Every response carries an ETag, and `If-None-Match` gets a 304.

| Keys | Browser | Worker Cache API |
|---|---|---|
| hashed (`*.<16hex>.json\|bin`) | `public, max-age=31536000, immutable` | 1 year |
| `catalog/terms.json`, `catalog/<term>/manifest.json` | `public, no-cache` (revalidate with ETag) | 60 s |
| `planetterp/manifest.json`, `geo/manifest.json`, `courses/manifest.json`, `reviews/manifest.json`, `history/manifest.json` | `public, no-cache` | 1 h |
| `calendar/<term>.json` | `max-age=3600` | 1 h |
| `geo/route/*.json` | `max-age=86400` | 1 day |
| `geo/tiles.pmtiles` | `max-age=604800`, Range requests | 1 week |
| `summaries/*` (review summaries until 2026-09-29), `_jobs/*`, anything else | 404 | — |

### 2.6 Job state (`_jobs/`, not served)
The jobs' memory between runs. Everything here can be rebuilt by running the job again, so a file that fails validation is ignored rather than fatal.

| Key | Written by | Holds |
|---|---|---|
| `_jobs/seats/<term>/baseline.json` | seats | Testudo's last seats stamp, the last full refresh time, each department's chunk hash and course list, and every section's `SectionSnapshot` (the diff base for `changes`) |
| `_jobs/catalog/<term>/orphans.json` | catalog | when each unreferenced hashed file was first seen, for the 24 h garbage-collection grace |
| `_jobs/catalog/building-rooms.json` | catalog | every building code seen, with one room, for the buildings job's popup lookups |
| `_jobs/reviews/state.json` | reviews-publish | when each unreferenced `reviews/` file was first seen, for the 24 h grace |
| `_jobs/courses/state.json` | catalog | per department, the `<term>:<chunk hash>` list its course-index file was built from (an unchanged list skips the rebuild), and when each unreferenced `courses/` file was first seen |
| `_jobs/history/state.json` | history | per term, the chunk hash each department was last copied from and its section count, so a run reads only changed chunks and holds back a sharp drop |
| `_jobs/history/orphans.json` | history, backfill | when each unreferenced `history/` file was first seen, for the 24 h grace |
| `_jobs/history/umdio.json` | umd.io backfill script | `done`: the terms already merged from umd.io, so a rerun skips them (§3.5). Only a resume cursor: deleting it makes the next run merge those terms again, which changes nothing |
| `_jobs/history/backfill.json` | backfill script | `done`: the courses already backfilled from PlanetTerp, so a rerun carries on where one stopped; `emptyOnce`: courses that answered with no grade rows once, to ask again; `doneEmpty`: courses that answered with none on two runs, never asked again (§3.5). Not rebuildable by a cron, but only a resume cursor: deleting it makes the next run ask PlanetTerp again, and the merge is idempotent |
| `_jobs/buildings/discovered.json` | buildings | codes joined (or not) since the checked-in seed, with why; failures retry after 30 days |
| `_jobs/planetterp/grades.json` | PlanetTerp | per course, grades summed per PlanetTerp professor name, and when they were fetched (the rotation order). A course's rows are never replaced by an empty answer (§4.1) |
| `_jobs/planetterp/unmatched.json` | PlanetTerp | Testudo instructor names with no PlanetTerp match, and how many names each matching rule joined |
| `_jobs/planetterp/state.json` | PlanetTerp | the last run's verdict (`status`, `reason`, `lastRunAt`) and the last good run's `lastSuccessAt`, professor and review totals (the baseline for the sanity floors, §4.1), `latestReviewAt` and `gradesThrough` |
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

### 3.5 Instructor history (v3, `history/`)

Testudo lists only the last few terms (in Fall 2026, back to Summer 2026), and the catalog's own files for an archived term stop being readable after a `catalog` schema bump. So we keep our own permanent record of who taught which course in each term, for Reviews ("taught Fall 2026", "you took it with …") and Plan. Schemas: `~/core/schema/history` (outside the barrel). Logic: `src/core/history`. Publishing: `src/ingest/history.ts`.
- **Sources.** `terpsicle`: the history job (`41 */6 * * *`, `src/jobs/history.ts`), 41 minutes after each catalog crawl, copies every department chunk in `terms.json` (active terms first, then archived ones) whose hash changed since it last copied it (`_jobs/history/state.json`). Nothing is crawled. At most `MAX_HISTORY_CHUNKS` (600) chunks a run, so a first run spreads over a few. A chunk whose section count (the catalog manifest's `sectionCount`) is under `MIN_SECTION_SHARE` (75%) of what it had when last copied is held back: not copied, not recorded, and reported as an error each run, until its count recovers or someone who checked runs `pnpm tsx scripts/ingest.ts history --force`. `planetterp`: the one-off backfill (`scripts/backfill-history.ts`) from PlanetTerp's grade rows, which name the professor of every section that reported grades, back to Spring 2012 and through Spring 2025. PlanetTerp writes some section numbers without leading zeros (`"101"`); the backfill pads them (`"0101"`), and a professor whose section still doesn't read is kept on the course. `umdio`: the one-off umd.io backfill (`scripts/backfill-history-umdio.ts`, below) from umd.io's own copy of Testudo's Schedule of Classes, Fall 2017 to Fall 2026, **winter and summer terms included**. It fills the terms neither other source has: every winter and summer (PlanetTerp's grades have only fall and spring) and Summer 2025 to Spring 2026 (after PlanetTerp's grades end, before our own copies start).
- **What umd.io adds over PlanetTerp:** every section, graded or not (PlanetTerp only knows sections that reported grades, so independent studies, TBA sections and ones without enough students are missing), Testudo's spellings of names (so the PlanetTerp job joins them with the full matcher, like ours), and winter and summer. It gives no credits (null), and its titles come from `/courses/list`. No field conflicts with PlanetTerp's: where both have a term (fall and spring 2017–2024, not filled by default), umd.io's record replaces PlanetTerp's per course, and names are only ever added, never rewritten.
- **What a term records.** Per course: `code`, `title`, `credits` (null when the source didn't say), `source`, `instructors` (everyone who taught it that term) and `sections` (`{code, instructors}`). Names are as the source spells them, sorted and unique; an empty list is TBA. Nothing else from the catalog (meetings, seats, notes) is kept.
- **Merge rules** (`mergeHistoryCourse`, tested in `src/core/history/merge.test.ts`):
  - append-only by course: a term never loses a course once recorded, and a term is never removed;
  - ours beats umd.io's, and umd.io's beats PlanetTerp's, whichever arrives first (umd.io copies the official schedule; PlanetTerp's is derived from grades);
  - from the same source, the newer sighting's sections win (a section Testudo stopped listing was cancelled, so it goes), but a section's names never go back to TBA, and a course with no sections never replaces one that has them (a truncated sections answer publishes `sections: []`, §4.1's "never replace good data with empty data");
  - a title or credits the new sighting lacks are kept.
  So a term is final as of the last sighting before Testudo dropped it.
- **Publishing** (`publishHistory`): merges each term's new sightings into its file, patches the department files those courses are in (`patchHistoryDept`: that term's offerings replaced, others kept; a course's title follows the newest term that names it), then rewrites the manifest when a hash changed, hashed files first. A term or department file the manifest names but that won't read is left alone and reported, and the job copies those chunks again next run. **A manifest that won't read stops everything** (`HistoryUnreadableError`): it's the only index of a record nothing can rebuild. A run that finds the manifest changed under it (the backfill and the job at once) throws and merges again next time. A missing manifest while `history/term/` has files stops everything too: starting empty would orphan every term, and the 24 h collection would delete them. A `history` schema bump must rewrite the files as new hashed files, manifest last (§2.2, §2.4), from the old files; a job must never rebuild from the catalog, which no longer has the old terms.
- **Read path** (`src/state/query/history.ts`): `historyManifestQuery`, `historyDeptQuery`, `whoTaughtQuery(source, manifest, course, term)` (the department file selected down to one term's record) and `taughtByQuery(source, manifest, depts, names)` (every course and term in those departments where any of the names appears, by `instructorNameKey`; pass Testudo's and PlanetTerp's spellings). The per-term files are the record, not a read path: no client reads them.
- **Backfill** (owner, once): `pnpm tsx scripts/backfill-history.ts --target r2`. Start with `--course CMSC351 --dry-run` (prints the records per term, writes nothing). It lists PlanetTerp's courses (`/courses`, about 175 pages and 6 minutes for its 17,000-odd courses; `--dept` narrows it), then asks `/grades` for each course one at a time, a second apart (`--delay-ms`), about 5 hours in all. It merges every 400 courses (`--flush-every`) and records what's done in `_jobs/history/backfill.json`, so a rerun of the same command carries on and retries the courses that failed.
  - **In chunks.** `--list-cache <file>` saves a complete listing locally the first time (an incomplete one isn't saved) and reuses it after, for the same `--dept`s, so later runs go straight to grades. `--max-minutes <n>` stops asking once `n` minutes have passed, merges what it has and exits, reporting `left`. So `--target r2 --list-cache .data/planetterp-courses.json --max-minutes 8`, repeated until `left` is 0, fits a shell that cuts commands off at 10 minutes.
  - **No grades.** PlanetTerp's 400 "course not found" counts as no grades at once. An empty list (`[]`) is what PlanetTerp also answers for a course it knows but has no grades for: a renamed course whose grades stayed under its old code (AAAS100's rows are all under AASP100), or one never graded. A glitch could look the same, so the first `[]` only goes in `emptyOnce` and the course stays to do; a second `[]` on a later run makes it `doneEmpty`, with nothing recorded, and it isn't asked again. Rows on the second ask are recorded as usual. Either way an empty answer never replaces anything (§4.1).
  - **Failures.** Each request is retried with backoff on 429 and 5xx. After 5 courses in a row fail, the run stops and says so rather than keep asking a PlanetTerp that's down; the next run tries them again.
  - A list page that fails, or comes back short with more after it (each short page is checked by asking for the next), is reported (`listingComplete: false`), and a rerun lists again. Never run from CI.
- **umd.io backfill** (once, after the code that knows `umdio` is deployed: a deployed reader without it can't read a file that has it): `pnpm tsx scripts/backfill-history-umdio.ts --target r2 --dry-run --max-minutes 8`, repeated until `left` is empty, then the same without `--dry-run`. It asks `/courses/semesters`, then, for each umd.io term the manifest lacks (`--term` picks others), pages `/courses/sections?semester=…` 100 at a time, a second apart (`--delay-ms`), until an empty page (one right after a full page is asked twice, so a glitch can't truncate a term), then `/courses/list` for titles. A term's pages are kept in `--cache` (`.data/umdio/<term>.json`) between runs, so a fall term (about 120 pages at up to 10 s each) spans chunks and the real run reuses the dry run's pages. A term is merged whole (`publishHistory`), never page by page, and a term with no sections is never recorded. Merged terms go in `_jobs/history/umdio.json`, so a rerun skips them. `source: umdio` was added to `HistorySourceSchema` and the manifest's per-source counts (`umdio`, 0 when absent) without a version bump: no client read the history when it was added.
- **Mock mode** builds the history from the fixtures' catalog with the same functions (`src/fixtures/mock/data-source.ts`).
- `pnpm tsx scripts/ingest.ts history` runs the job alone against the catalog already in the store.

---

## 4. Reference data

### 4.1 PlanetTerp (per department)
- **One file per department** (every department in an active term or in the instructor history, §3.5) holds:
  - `instructors`: slug → `Instructor`, covering everyone teaching a section of that department in any active term, everyone the history names that PlanetTerp knows, plus everyone in its grade data;
  - `names`: `instructorNameKey(name)` → slug, for every name in an active term **and** in the history, Testudo's and PlanetTerp's spellings alike. The join is done once, in ingest. PlanetTerp's own spellings (the backfill's terms) join by exact name, as its grade rows do, so a course's grades and its "who taught it" land on one slug per person; a Testudo spelling of the same key goes first. Before the history's names were joined, anyone who taught a course only in a term Testudo no longer lists (Fawzi Emad in Spring 2025) had no entry, and course pages showed them twice: by slug from the grades, and by name, unlinked;
  - `courses`: course code → `{all, byInstructor}` grade records, for every course offered in an active term or on record in the history (taught since Spring 2012). Grades for a course the job has never asked about come first in its nightly rotation, so the history's courses fill in 700 a night.

  Everything is keyed by **slug**, never by name: PlanetTerp names collide (two "Douglas Hamilton"s). When two slugs share a Testudo name, ingest picks the one whose `courses` includes the course.

  The join (`src/ingest/planetterp/names.ts`) tries, in order: exact name; the hand-checked `aliases.json`; names equal once accents, apostrophes, punctuation, spacing, parentheticals and suffixes are ignored; then nicknames, extra middle names or surname parts, shortened given names and initials. Those last four need course evidence (two shared courses, or one that few PlanetTerp people taught or from someone who mostly teaches in the instructor's departments), never take the slug of someone teaching under that exact name, and match nobody on a tie. A wrong rating is worse than none.
- PlanetTerp grade rows carry section numbers that aren't always zero-padded (`"501"`); the grade files only store per-course and per-instructor sums, so sections never reach them. The instructor history's backfill pads them (§3.5).
- **Never replace good data with empty data.** PlanetTerp looks unmaintained (reviews stopped in May 2026, grades end in Spring 2025), so the job assumes it can fail in ways that still parse:
  - **Sanity floors** (`src/ingest/planetterp/source.ts`). A run whose professor list is empty, or has more than 10% fewer professors or reviews than the last good run (`_jobs/planetterp/state.json`), is a source failure. So is a list that doesn't arrive at all. The job then publishes nothing new: the department files and the manifest's `departments` stay as they were, the manifest's `source.status` becomes `stale` (`gone` after 30 days without a good run), the reason goes in the job state, and the cron reports `cron_job_failed` with the reason as `firstError` (`docs/ANALYTICS.md`).
  - **Grades never go from something to nothing.** `/grades` answers 400 `{"error":"course not found"}` for a course it doesn't know; only that 400 means "no grades", and any other error keeps the stored rows. An empty answer for a course that had rows keeps the old rows too; only a course with no stored rows may stay empty.
- **The index** (`planetterp/index.<hash>.json`, `PlanetTerpIndexSchema`, named by the manifest's optional `index: {hash}`, added without a version bump like `source`) is built from the department files the run published (`buildPlanetTerpIndex` in `src/core/reviews`): `instructors`, slug → `[name, depts, reviewCount]` (older indexes have no count; search ranks by it, falling back to `mostReviewed`'s), `totals` (below), and `mostTaken`, the 40 courses offered in an active term with the most students in PlanetTerp's grades, as `[code, title, students]`. Instructor pages without `?course=` find their departments here, the sitemap lists every instructor from it, and a mistyped instructor URL gets "Did you mean" from its names. A failed write keeps the previous index.
- **Totals** (`PlanetTerpIndex.totals`, `planetTerpTotals` in `src/core/reviews`, added without a version bump): what Reviews' front page counts, on PlanetTerp's front page's basis where the API allows. PlanetTerp counts rows in its own database (`Course.unfiltered`, `Professor.verified`, `Review.verified`, `Grade.unfiltered`); its API serves only part of them, so two of four can't match:
  - `professors`: everyone in its professor list, professors and TAs (its API lists verified people only, as its front page counts). Matches.
  - `reviews`: their reviews, summed. Matches but for the handful of verified reviews its list doesn't attach to a listed professor.
  - `courses`: every course a department file lists (offered in an active term, or taught since Spring 2012). PlanetTerp also counts courses it no longer lists (not offered recently), which its API never returns.
  - `grades`: its grade rows (one section's grades under one professor in one term) since Spring 2012, counted from the history's backfilled terms (`planetTerpGradeRows`, `src/core/history`). Its front page also counts rows before 2012, which its API never returns.
  - `counts`: every course's grades, summed.
  `/reviews` reads them from the index (`planetterp/totals`, `src/server/reviews/stats.ts`) and nothing recounts them; while the index has none (before the job's first run with totals), it leaves its numbers and its grades across UMD out. If the history won't read, the job stops before publishing (a run without it would drop courses and names), and the last good files stay.
- **`source`** in `planetterp/manifest.json` (`PlanetTerpSourceSchema`) is `{status, lastSuccessAt, gradesThrough, latestReviewAt}`. It was added without a version bump (§2.3: an optional field; older clients strip it, and manifests without it read as "unknown"). `status`:
  - `ok`: the last run was good and PlanetTerp has published a review in the last six weeks;
  - `stale`: the last run was a source failure, or PlanetTerp has published no review for six weeks (its ratings are frozen);
  - `gone`: no good run for 30 days.

  The client reads it through `useInstructors(dept).source` (and `usePlanetTerpStatus`). The Grades header says what grades cover ("through Spring 2025, from PlanetTerp", from `gradesThrough`), and the Reviews disclosure adds one quiet line when `status` isn't `ok` ("No new PlanetTerp reviews since Apr 2026", or "PlanetTerp hasn't updated since …" when there's no newest review to name). No banner (`DESIGN.md` §5). A department file that fails to load says so ("Couldn't load grades from PlanetTerp…"), never "PlanetTerp has no grades".
- **Reviews** (`ReviewSchema`) are how the nightly job, and a page's first visit (`src/server/reviews/planetterp-live.ts`), normalize PlanetTerp's reviews before they're stored in D1 (`planetterp_reviews`): `{course, text, rating, expectedGrade, created}`. They have no id, so ours hashes (slug, `created`, text); `expectedGrade` is free text ("A-", "P", "95", "") and becomes a grade only when it is one.

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
- **`names`** maps `instructorNameKey(testudoName)` to an id, for what PlanetTerp's `names` can't say: the owner's corrections (`manual`), and minted instructors' names once they have a published review (a name alone would tell that someone tried to review them). The client reads a `manual` entry (a PlanetTerp slug) over PlanetTerp's join, and a minted one only where PlanetTerp's join has no match (`terpsicleInstructor`, `src/state/query/review-numbers.ts`).
- **Publishing** (`publishReviews`, `src/ingest/reviews.ts`) follows §2: each file is validated and written only when its bytes changed; the manifest last, rewritten only when a department's hash changed (so `generatedAt` is when the numbers last changed); files it no longer lists are deleted after 24 h (`_jobs/reviews/state.json`). A department left with nothing is dropped from the manifest; an empty department file is never written. With no published review at all, the manifest lists no departments. A manifest of another schema version is replaced.
- **Mock mode** publishes `src/fixtures/mock/reviews.ts` (five PlanetTerp instructors and two minted ones) with the same `buildReviewsDepts`; `src/ingest/__fixtures__/golden/reviews.json` is its output.
- The client combines the two sources with `combineRatings` (`src/core/reviews/combine.ts`): `rating = Σ(rating_s × count_s) / Σ count_s`, `reviewCount = Σ count_s`, and the rating's tooltip gives the parts ("4.2 from 61 reviews: 4.1 from 48 on PlanetTerp, 4.6 from 13 on Terpsicle"). Only while `REVIEWS_ENABLED` isn't `off`; grade distributions stay PlanetTerp's.

---

## 5. Browser state (IndexedDB via Dexie)

Database `LOCAL_DB_NAME` = `terpsicle`, version `LOCAL_DB_VERSION` = 7.

**Version 7** (the catalog on TanStack Query, `v3/query-catalog-b`; `src/state/db.ts`): the published-data cache's `manifests` and `files` tables are dropped (`V7_CHANGES`). Every published file is a query now, saved in the query cache's own database (§5.5), so their rows (the catalog's, and the PlanetTerp, geo, calendar and review-number files no build has read since they moved) go with them. Nothing a person made was in either. `src/state/db.test.ts` upgrades a v6 database with both full.

**Version 6** (main plans, `v2/main-plan`; `src/state/db.ts`): no table changes. `mainPlansFromChatPlans` renames the `chatPlans` settings row to `mainPlans` (the same `{[termId]: planId}` map, now each term's main plan, `docs/V2.md` §5.5); a row that doesn't read is dropped, and the term's first tab is main again. Nothing needs pushing: the settings doc on the account already has the same map. `src/state/db.test.ts` upgrades a v5 database.

**Version 5** (Registered, landed with `v2/share-and-checklist`; `src/state/db.ts`): no table changes. Plans gain an optional `registered` (the section keys marked Registered in the Register tab, SPEC §3.10). `registeredFromChecklist` moves the old checklist's ticks from localStorage (`terpsicle:registration-checklist`, `{planId: sectionKey[]}`, one browser only) into each plan's `registered`, keeping only sections the plan still has; on a signed-in device it marks each plan it changed unsaved (its `syncDocs` row `dirty`), so the next sync pushes the marks; then it deletes the localStorage key. `src/state/db.test.ts` upgrades a v4 database.

**Version 4** (four-year sync, landed with `v3/four-year-sync`; `src/state/db.ts`): no table changes. `resetPullCursor` sets a signed-in device's pull cursor back to 0 once more, so it pulls the four-year docs a tab skipped between version 3 and the engine that carries them (`docs/V3.md` §2.13). `syncDocs` keys gain `four-year:<id>`.

**Version 3** (Terpsicle Plan, landed with `v3/plan-ui`; `src/state/db.ts`): a `fourYear` table, one row per four-year doc (`FourYearDocSchema`, validated on read; an invalid row is skipped and logged), and a `fourYear` settings row for the open doc (`FourYearPrefsSchema`, `{activeId}`, local only). `upgradeToV3` sets a signed-in device's pull cursor (the `sync` row) back to 0, once, so it pulls the four-year docs an older tab skipped (`docs/V3.md` §2.4). Nothing else changes shape (`src/state/db.test.ts` upgrades a v2 database).

**Version 2** (plan sync, landed with `v2/sync-engine`; `src/state/db.ts`): a `syncDocs` table for each doc's sync flags (the settings doc's row also keeps `base`, its body as last saved or pulled), and a `sync` settings row (`{userId, cursor}`). The `seatAlerts` table is dropped with the email-token alerts it mirrored: seat watches live on the account in D1 (§7.1). An earlier build moved its rows to a `seatAlerts` settings row, which the app deletes on start. Nothing else changes shape, so plans, blocks, colors, settings and the data cache come through untouched (`src/state/db.test.ts` upgrades a v1 database). The sync docs themselves (a plan doc per plan, one settings doc for blocks, colors, travel, main plans and the other products' prefs) are `SyncDocSchema` in `src/core/schema/sync.ts`.

| Table | Primary key, indexes | Row schema |
|---|---|---|
| `plans` | `id`, `termId` | `PlanSchema` |
| `blocks` | `id`, `termId` | `BlockSchema` |
| `courseColors` | `courseCode` | `CourseColorPrefSchema` |
| `settings` | `key` | `SettingsRowSchema` (`ui` → `UiPrefs`, `fourYear` → `FourYearPrefs`, Plan's open doc, `travel` → `TravelSettings`, `generate` → Generate's form per term, `GenerateDrafts`, results never stored; `mainPlans` → `MainPlans`, each term's main plan, synced (the settings doc's `mainPlans`; `chatPlans` until version 6); `prefs` → `SyncedPrefs`, the other products' prefs (`ai`: AI features, `chatRules`: the room rules you've closed, `todo`: the day Todo's weeks start, `home`: Home's setup callouts you've closed), synced whole as the settings doc's `prefs`, with a copy in localStorage (`terpsicle:prefs`) that every page reads; `sync` → `LocalSyncMeta`, plan sync's account and pull cursor) |
| `fourYear` | `id` | `FourYearDocSchema` (`src/core/schema/four-year.ts`) |
| `syncDocs` | `key` (`plan:<id>`, `four-year:<id>` or `settings`) | `LocalSyncDocSchema`: `rev` (0 = never saved), `dirty`, `inFlight`, and on the settings row `base` |

- **Validation:** validate every row on read. An invalid row is skipped and logged, never fatal. A shape change bumps `LOCAL_DB_VERSION` with a Dexie `upgrade()` that migrates rows; plans are never dropped. Published files aren't here: they're the query cache's (§5.5).
- **Plans:**
  - `courses` is the Courses-tab order, with at most one entry per course.
  - `sectionCode: null` means bookmarked (the UI's word; "saved for later" before 2026-09-26), per plan.
  - A placed course stores `snapshot` (instructors, delivery, meetings, dates) taken when it was placed, or switched, or when a "changed" problem's "Keep new times" fix is applied. `core/catalog` compares it with the live catalog.
  - `order` sorts plan tabs within a term.
  - `registered` (optional) lists the placed sections marked Registered, by section key, at most 40 and each once. Absent when none are (and in plans from before version 5). A key whose section the plan no longer has is dropped the next time a mark changes (`section/registered` in `core/plans`); until then nothing reads it. It's part of the plan: undoable, synced, copied by Duplicate, and counted as work in a sync conflict. Share links don't carry it.
- **Blocks are per term, not per plan.**
  - Blocks describe the person's week (work, practice, lunch), not a choice between schedules. The generator runs outside any plan (SPEC §3.9), and "Respect my blocks" needs one unambiguous set; so do "Fits my plan" and Problems across tabs.
  - Per-plan blocks would also have to be copied on Duplicate, Generate and Save a copy, and would drift apart.
  - The prototype stored them per plan only because it had no generator outside a plan.
  - Undo covers block changes too.
- **Course colors are global:** one color per course code, the same in every plan and term (SPEC §3.2). A course with no row gets a color when first added to a plan (the palette color least used in that plan), and that color is written to `courseColors` so it stays stable. `COURSE_COLORS` are palette ids; the UI maps each to light and dark tints. Only append to that list.
- **UI prefs:** open tab, sidebar open, drill target (course with its details tab, or a connection; generated results aren't restorable), theme, last term, active plan per term, and collapsed instructor groups (`<course>|<instructor name>`).
- **Not persisted:** the undo stack, hover/preview state, search text, and generator results.
- **Plan sync** (`docs/V2.md` §5.3, `src/features/sync/`): the synced tables stay the source of truth; `syncDocs` and the `sync` row are all sync adds. The engine reads and writes them together with the synced tables in one transaction per step, under a Web Lock every tab shares. Signing out forgets them (`syncDocs` cleared, `sync` deleted), so the next sign-in merges as a first one; "Sign out and remove plans from this device" also clears `plans`, `blocks`, `courseColors`, `fourYear` and the `travel`, `mainPlans`, `fourYear` and `prefs` rows (and the prefs' localStorage copy). The `prefs` row is written by more than the scheduler (Settings, Reviews, Chat: `src/features/prefs`), so the engine reads it fresh at every step and never rebuilds it from a page's store. Four-year docs are synced tables too (`docs/V3.md` §2.4).
- **Seat watches** aren't kept in the browser: they're the signed-in person's, in D1 (§7.1), and the app holds the list in memory, in the page's query cache (`seatWatchesQuery`, `src/state/query/seat-watches.ts`), never on disk. The one thing kept locally is a watch asked for while signed out, in `sessionStorage["terpsicle:pending-watch"]` (`{termId, sectionKey, at}`, zod-checked, 30 minutes), so the watch starts when the person comes back signed in to that tab.
- **Todo's list** (`todo/list`, a week at a time) and ELMS's sync are in memory only, in the page's query cache (`src/features/todo/todo-queries.ts`), shared by /todo and Home and forgotten on signing out; never on disk (V3.md §3.8).
- **Chat's answers** (your rooms' unread counts, each room's newest message, and your synced plans as Chat reads them from `sync/pull`) are in memory only, in the page's query cache (`src/features/chat/queries.ts`), which the course sockets write into. Chat keeps the courses you follow in `localStorage["terpsicle:chat-follows"]`, since `chat/unread` lists only rooms with messages.

### 5.1 Client catalog flow
1. Fetch `catalog/terms.json` (ETag revalidation). Pick the term.
2. Render immediately from this device's saved manifest and files (the query cache, §5.5), if any.
3. Fetch the manifest and check `schemaVersion` (§2.3). Diff it against the cached one:
   - fetch departments whose hash changed or that are new;
   - fetch seats if `seats.hash` changed;
   - fetch changes if `changes.hash` changed.

   Validate each file.

   Departments load in two ways. Whatever is on screen asks for its own departments (`ensureDepts`: an open course's details, the plan's courses, a shared link), fetched at once and shown as soon as they arrive. Then the rest of the term loads in the background (`ensureTerm`), 16 files at a time with a `low` Fetch Priority, and shows once it's all in; search waits for that (`settled`). A department something asks for during the background load is fetched right away, not in its turn, and no file is fetched twice. On a first load, departments don't wait for seats and changes; they load side by side, and a batch shows once the seats are in too.

   Why 16 and not 6: `/data` is served over HTTP/2, so the browser's six-connections-per-host limit doesn't apply, and ~200 small files (about 850 KB compressed) are bound by round trips, not bandwidth. Over HTTP/1.1 (a local dev server) the browser queues them at six, by priority.
4. **Files before the manifest, never after** (§5.5): the manifest's fetch first fetches and saves the new version of every file of the term saved on this device (a changed department, the new seats), each on its own. One that can't load doesn't hold the rest back: the new manifest shows (new seats and all), that department keeps the version it had, and the manifest is saved with that file's entry as the saved manifest has it (for seats, their own as-of and fetched times), so the saved manifest never names a file it lacks and the old file isn't deleted. Right before saving, the disk is checked again: if another tab has since saved the new version, or dropped the old one, the manifest names the new version. Each poll tries only the files still missing, and one that comes in shows then. Only then is the manifest saved, and then the term's saved files it no longer lists are deleted; another term's never are. A tab saves only the manifest it fetched, and only if nothing newer (another tab's) has come in meanwhile, and prunes by that manifest's own list.
5. **Polling:** for an active term, poll the manifest every 60 s while the document is visible (the manifest query's `refetchInterval`, paused while hidden), and when it becomes visible again or reconnects once the copy is over a minute old. Most polls are a 304. A change in `seats.hash` alone fetches only the seats file. One tab polls for the whole browser: visible tabs queue for a Web Lock per term and catalog format (`terpsicle:seat-poll:<kind>:catalog@<version>:<term>`), the holder polls and posts each manifest on the `terpsicle:catalog` BroadcastChannel, and the others put it in their own cache (only ever newer than theirs). A hidden or stopped tab gives the lock up, even when the grant comes after it stopped; so does one that's out of date (a newer format), for good, and one whose last three polls failed, to the back of the queue (`docs/decisions.md`, "One tab polls seats for the browser"). For an archived term, fetch the manifest once per page and don't poll.
6. PlanetTerp and geo follow the same pattern with their own manifests, fetched lazily: a PlanetTerp department file when a course from it opens, or when the generator ranks by rating or GPA; the routes binary when the plan first has a connection. Since `v3/query-catalog-a` these, and each term's academic calendar, are query-cache reads (§5.5; `src/state/query/catalog.ts`): the PlanetTerp and geo manifests are `publishedPointer`s (a day fresh, checked once per page), their files `publishedFile`s (the routes binary a `publishedBinary`, kept as bytes and checked with `RoutesFileSchema`, so bytes that don't decode, from the server or from disk, are an "invalid" read that's never saved), a calendar a `publishedFixed` (fixed name, nothing listed, so it prunes nothing; a missing file is "not published yet"), and a connection's walking path a plain query the browser's HTTP cache keeps (not saved). Each PlanetTerp department loads on its own; one that fails is unrated. A department file the server has deleted asks for the manifest again, once, before it fails, and stays loading meanwhile. A newer format in any published query (the catalog manifest's first) sets the catalog store's `appStale` (§2.3): the failures there offer Reload, and the scheduler reloads when next shown. Their old Dexie rows went with those tables (§5, version 7).

The client does this with queries (`src/state/query/catalog.ts`: `termsQuery`, `manifestQuery`, `deptChunkQuery`, `seatsQuery`, `changesQuery`; the poll is `src/state/query/catalog-poll.ts`), and `src/state/catalog-store.ts` builds each term's index from them. Details:
- Each file is saved as it arrives. On a first load the manifest is saved at once, so an interrupted load resumes from the files it has, and offline shows those, with the departments it lacks marked failed (search still settles).
- A department file the server has deleted asks for the manifest again before it fails, and stays loading meanwhile.
- A new manifest, from a poll, a check or another tab, is diffed against the one on screen (`diffManifest`); only departments already loaded whose hash changed are read again, and a department whose hash moves while it loads is read at the new one, never shown at the old.
- Mock and live keep apart by their query keys (`["published", "mock" | "live", key]`), since `pnpm dev` and `pnpm dev:mock` share localhost; a `SCHEMA_VERSIONS` bump drops that family's rows (the persister's buster).

### 5.2 Client course index flow (v3)

Since `v3/query-course-index` the course index is read through the query cache (§5.5), in `src/state/query/course-index.ts`, and loads only on demand: Plan imports it, the scheduler never does (`scripts/check-bundle.ts` fails the build if `/schedule` loads it eagerly).
1. `courses/manifest.json` is a `publishedPointer`: a saved one shows at once and is checked with the server once per page, then again once it's 6 hours old (the index changes at most that often). With nothing saved, it waits for the server.
2. The search file and each department's file are `publishedFile`s, read at the hash the manifest lists: from the query cache, else fetched, validated and saved. A department the manifest doesn't list is loaded and empty, so a code in it is unknown; a department whose file hasn't loaded yet is neither. Plan reads them through `useIndexDepts(depts)`, `useCourseSearch()` and, outside React (an import, a pick), `loadCourseLookup`, `loadIndexEntry` and `loadCourseSearch` (`src/features/four-year/data.ts`).
3. A manifest check first fetches and saves the new version of every file saved under the old manifest (only files already loaded that changed), then saves the manifest, then drops saved `courses/` files it no longer lists. If a file can't load, the old manifest and its files stay, on screen and on disk. While a department's new file loads, the old one stays on screen.
4. A saved manifest can name files the server has since deleted: a hook's file query fails, and while the page's manifest check is on its way that department counts as loading, not failed; the check brings the new hash. Code outside React asks for the manifest again and tries once more.
5. Each department loads on its own: one that fails is "failed" (its titles say "Couldn't load its title", its codes aren't guessed at) and the rest still load. The plan's model works the doc's departments out once (`deptsLoading`, `deptsFailed`) for everything on the page. The transcript import loads its departments and the course list together before it rereads the doc, and stops with "We couldn't reach terpsicle.com…" when the server can't be reached for them.
6. There's no polling. Offline, whatever was saved shows; with nothing saved, a load fails at once and says so (§5.5, "Offline") rather than loading until the connection returns.
7. A manifest in a newer format than this build reads (§2.3) makes the course list say "Terpsicle has been updated since this page opened" with Reload, and Plan reloads the next time the page is shown (`useReloadWhenIndexStale`), as the scheduler does for its catalog.

The old Dexie rows (`files` with `family: "courses"`, the `courses/manifest.json` pointer) are no longer read and go with those tables in the catalog PR.

### 5.3 The installable app (service worker, install prompt, push)
V2.md §3 is the plan; this is what the browser keeps.
- **Service worker** (`/sw.js`, `src/server/service-worker.ts`): one for the whole site. Cache Storage holds pages (`terpsicle-pages-v<n>`, network-first), build files as they're fetched (`terpsicle-assets-v<n>`), and the app shell precached at install (`terpsicle-shell-v<n>-<build>`). It never caches `/api`, `/auth`, `/avatars`, `/data` or `/ingest`, navigations included: IndexedDB already keeps the data, and the manifests must revalidate (§2.5, §5.1).
- **Install prompt** (`src/features/pwa`): `localStorage["terpsicle:install-prompt"]` holds `InstallPromptStateSchema` (`{dismissals, lastDismissedAt}`); `sessionStorage["terpsicle:install-shown"]` marks a tab where the prompt already opened. `requestInstallPrompt(trigger)` opens it only where installing works, never in the installed app, at most once per session, not within 90 days of a dismissal, and never after two. Closing it any way but installing is a dismissal, except when it was opened from the "Install app" item. Storage that can't be read means "don't show". On iPhone its steps are also the ask for notifications, so its Got it counts in the ask's state too.
- **Asking for notifications** (`src/features/notifications/push-ask*.ts`, V2.md §6.7): `localStorage["terpsicle:push-ask"]` holds `PushAskStateSchema` (`{dismissals, lastDismissedAt, homeScreenAskedAt}`); `sessionStorage["terpsicle:push-asked"]` marks a tab where a moment already asked. A moment asks at most once a session, not within 90 days of "Not now", never after two, and never once notifications are on here or blocked; the iPhone sheet's Got it also counts as an install-prompt dismissal. `homeScreenAskedAt` is set when the Home Screen app's own ask shows: once per device. Storage that can't be read means "don't ask".
- **Last known flags** (`src/features/auth/account-store.ts`): `localStorage["terpsicle:flags"]` holds the `FlagsSchema` flags `/api/me` last answered. A page shows them while it asks again and keeps them when `/api/me` can't answer (someone already signed in on the page stays signed in), while the account query (`meQuery`, `src/features/auth/me-query.ts`) asks again after 2, 8 and 30 seconds. The answer itself lives only in the page's query cache, and every answer, a sign-out's included, rewrites the hint. Only a browser with none (a first visit) falls back to every product off. Nothing about who you are is kept: the session stays an HttpOnly cookie.
- **Push payload** (`PushPayloadSchema`): `{v: 1, type, title, body, url, tag}`, plus `count`, `badge`, `renotify` and `id` (V2.md §6.7). On the wire it's a Declarative Web Push message (`pushMessage` in `src/core/push`): those members at the top level, and `web_push: 8030`, `notification: {title, body, navigate, tag, app_badge}`, `mutable: true` and `app_badge` beside them, at most 3 KB. `url` is a path on this site; a click focuses a window already there, else takes an open one there, else opens one. A newer notification with the same `tag` replaces the older one. The service worker repeats the schema's checks by hand (it can't load zod) and shows "Terpsicle: Open the app for details." for a payload it can't read.

### 5.4 Client review numbers flow (v2)

Review numbers are the first published family read through the query cache (§5.5), in `src/state/query/review-numbers.ts`. Course details read them with `useTerpsicleReviews(dept, enabled)` (`src/state/data-hooks.ts`): two queries, `reviews/manifest.json` (`publishedPointer`) and the department's file at the hash the manifest lists (`publishedFile`, never stale). A department the manifest doesn't list has nothing published: `null`, and no file is read. A saved manifest shows at once and is checked with the server once per page, then again once it's an hour old (the job runs hourly); a changed hash is a new key, so only files that changed are fetched. While a department's new file loads, its previous numbers stay on screen. A saved manifest can name a file the server has since deleted: that file's query fails, the page's check brings the new hash, and it loads. A manifest or file that can't load leaves PlanetTerp's numbers on their own. `app.tsx` hands the queries their data source (`connectPublished`); mock and live keep separate keys.

### 5.5 The query cache (TanStack Query)

Copies of server data go through TanStack Query (`docs/decisions.md`): one `QueryClient` per page (per request on the server) in router context, and `queryOptions` factories per area. Published files are persisted with TanStack's per-query persister (`experimental_createQueryPersister`, `src/state/query/persister.ts`), in a database of their own so the plans' database keeps its version:

- **Database** `terpsicle-query` (`QUERY_CACHE_DB_NAME`), version 1, one table `rows` keyed by `key`. A row is `published:<family>-<queryHash>` → the persisted query (`PersistedQueryRowSchema` in `src/core/schema/query-cache.ts`: `buster`, `queryHash`, `queryKey`, `state` with `data`, `dataUpdatedAt`, `errorUpdatedAt`), stored as an object, not JSON text. A row that doesn't read is deleted and the query fetches again.
- **Keys:** `["published", "live" | "mock", <R2 key>]`, so `pnpm dev` and `pnpm dev:mock` on one origin never share a row.
- **Busting:** each family's rows carry `buster: "<family>@<SCHEMA_VERSIONS[family]>"`; a version bump drops that family's rows as they're read (§2.3).
- **Age:** rows never expire by age (`maxAge: Infinity`): a hashed file is never refetched, so its age says nothing. A saved pointer is fetched again once per page (the restored copy shows first), and again whenever it's stale (per family); hashed files never are.
- **Pointer before files, never after** (§5.1 step 4): a pointer's fetch first reads and saves the new version of every file saved from the old one, straight from the source (never by joining the file's query, which may itself be waiting on the pointer). If one can't load, the fetch fails and the old pointer stays, on screen and on disk, with the files it names; a term's manifest instead takes the rest and keeps that file at the saved version (§5.1). Only then is the new pointer saved, by the pointer's own settle, the only writer of a pointer's row (the persister never saves a pointer as fetched), and then the family's rows for files it no longer lists are deleted, by key alone. A pointer's fetch that takes over two minutes, files included, is stopped (its reads aborted) and fails with a reason of its own, `timeout`: too slow isn't offline, so it isn't retried at once and the bar doesn't say "Offline". A file that didn't load is kept at the version the saved pointer names, never another saved version of it.
- **Offline:** published queries use `networkMode: "always"`: a saved copy is read from disk whatever the connection, and a read that can't reach the server fails at once instead of pausing (Query pauses `online` and `offlineFirst` queries while offline, which left loads, and code awaiting them, waiting forever). A network failure retries twice while online, never while the browser says it's offline; a missing, broken or newer-format file doesn't retry. A reconnect refetches (`refetchOnReconnect`).
- **Validation:** a restored copy is checked against its file's schema (`safeParse`), as the old cache did; one that fails is deleted and fetched again.
- **Nothing per person** is persisted: only published-data factories opt in.
- **Answers over files** (history's `whoTaughtQuery`, Home's `src/features/home/queries.ts`, Chat's course list `chatCourseRowsQuery`) are queries of their own, in memory only, whose `queryFn` reads the files' queries through the client (`ensureQueryData`; with `revalidateIfStale` for a pointer, so a stale one is checked in the background while the saved copy answers). They share the files' copies and are never saved themselves; one that reads the disk uses `networkMode: "always"` too, or it would pause offline.
- Every storage error is swallowed: the cache only makes loading faster. Without IndexedDB nothing is persisted.

Every published file is here now: the old Dexie cache (`manifests`, `files`) is gone with `LOCAL_DB_VERSION` 7 (§5). A pointer whose files are one term's (a term's manifest) passes that term's prefix as its `scope`, so it brings and drops only that term's files, and lists only that term's keys. Before a term's manifest restores, its saved rows are read in one IndexedDB read (`preloadPublished`), and each query that restores then takes its row from that read, once; a write or delete of a key drops what was read ahead for it.

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
- routed in `src/server/worker.ts`, run by `src/server/api/router.ts` from each area's table (`src/server/<area>/api-routes.ts`);
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

**The email** (`email.ts`): plain text plus simple table-based HTML, `Auto-Submitted: auto-generated`, from `Terpsicle <alerts@terpsicle.com>` through the Email Service binding `EMAIL`. It has the counts, Testudo's as-of time in Eastern, a link that opens the course (`/schedule/course/<code>?term=<id>`; the older `/schedule?term=<id>&course=<code>` still redirects there, which opens it over Courses in that term; `ScheduleSearchSchema`, §8.1), Testudo's page, and "See or stop your watches" (`/settings#watching`). Cron emails always link to terpsicle.com.

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

`seat_alert_sends` holds the alert emails in place of V2.md's `notification_deliveries`; since `v2/push`, each reopen's push is a `notification_deliveries` row (`…:push`), the email is sent only while the person's `seatOpen.email` setting is on, and the daily cap counts the busier channel (§7.11). `counters` (from `0002_seat_alerts`) stays: per-IP and per-user limits and the summary cap. `SeatWatchRowSchema` validates rows on read (`src/server/alerts/store.ts`).

### 7.2 Review summaries

Removed on 2026-09-29 (owner: "let's remove all AI features for reviews"). `summaries/` in R2 is no longer written or read; the Worker still answers 404 for it.

### 7.3 Analytics

Server events (`src/server/analytics.ts`, `docs/ANALYTICS.md`):
- seat watches: `alert_watched`, `alert_sent`, `alert_unwatched` (`via`: `app` or `email`), `alert_watches_ended`;
- identity: `signin_result` (`outcome`, and `hd` on success).

They carry counts, reasons and term ids only. They never carry an address, token, IP or review text, not even hashed.

### 7.4 Chat (`src/core/schema/chat.ts`)

Rooms aren't stored: `roomsForCourse(termId, course)` in `core/chat` derives them from the catalog, and a room gets storage only with its first message. They follow course details' one level of grouping: a course room; with 2+ sections, a room per section; and with more than one professor, a room per named professor between the course and their sections (TBA sections sit under the course room). There are no lecture rooms. One `CourseChat` Durable Object per course per term (named by the course room id) holds every room of that course, and the app keeps one WebSocket per open course.

- **`ChatMessage`:** `id`, `room`, `author` (directory ID and the Google name, as they are now; no picture since protocol 2; the name the author wrote under if the account is gone), `text` (trimmed, 1–2,000 chars), `createdAt`, `editedAt`, `replyTo` (the thread's first message; threads are one level deep), `thread` (reply count and last reply time), `reactions` (who reacted, per reaction in the fixed set `REACTIONS`) and `moderation`: `visible`, `held {reason}` (only the author sees it; `checking` · `graded-work` · `flagged` · `reported`) or `removed`.
- **Client frames** (`ChatClientFrameSchema`, strict): `hello {protocol, rooms}` first, then `history {room, thread, before, limit}`, `send {room, text, replyTo}`, `edit`, `delete`, `react {id, reaction, on}`, `typing {room}` and `read {room, upTo}`. Requests carry a client `req` id.
- **Server frames** (`ChatServerFrameSchema`): `welcome {you, rooms: [{room, members, unread, writable}]}`, `page {messages (oldest first), more}`, `ack {req, message}` (the message as its author now sees it: a tombstone after deleting one the room saw, null after deleting one only its author saw), `error {req, code, retryAfter}`, `message` (new or changed, a tombstone included; replaces the copy with that id), `deleted` (gone entirely: an account's purge), `reactions`, `moderation` (every change to the author; `removed` to everyone who had seen it) and `typing`.
- `CHAT_PROTOCOL_VERSION` (2 since authors lost `picture`) is bumped on a breaking change; an older client's `hello` gets `error {code: "old-client"}` and reloads.
- A `send`'s `req` is also its idempotency key: resending the same `req` (after a reconnect) gets the first message back. Clients pick a random one per message.

### 7.5 v2 tables (D1 `terpsicle`)

The full SQL, and what each column means, is in `docs/V2.md`; once a migration lands, its file and the row schemas win, and this list follows them. Migration numbers are fixed now so parallel PRs don't collide.

| Migration | Tables | Holds |
|---|---|---|
| `0003_identity` | `users` (key: directory ID; `email`, `hd`, `name`, `status`, `delete_after`, `chat_blocked_until`, `reviews_blocked_until`, …), `user_identities` (Google `sub` → user, with that tenant's `email`, so both a TERPmail and a UMD Gmail address are kept), `sessions` (hashed cookie tokens, 30-day sliding) | Accounts (V2.md §4.4) |
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
| `0014_chat_spam_guard` | `chat_send_hashes` (`user_id`, `course_code`, `text_hash`, `created_at`; kept an hour) | Chat's spam guard across courses (MODERATION.md §2, §7.9) |
| `0015_todo_tasks` | `todo_tasks` (your own tasks: title, course, due date and time) | Todo's "Add a task…" (V3.md §3.10) |
| `0016_todo_hidden` | `todo_hidden` (the course groups a person hid in Todo) | "Hide CMSC216" (V3.md §3.11) |
| `0017_notification_inbox` | rebuilds `notifications` into the inbox: every type, with `product`, `group_key`, `count`, words for types whose words aren't user-written, and `thread_id` | Notifications, delivered better (V2.md §6.7, §7.11 here) |
| `0019_quiet_hours` | `notifications.push_held_at` and a partial index on it | Quiet hours: a push that waits for 8am (V2.md §6.7, §7.11 here) |
| `0021_no_pictures` | nulls `users.picture_url` and `picture_key`, without dropping them, so the build serving during the deploy kept working | No profile pictures (V2.md §4.5) |
| `0022_drop_unused_columns` | drops `users.picture_url` and `picture_key` (unused since `0021`) and `todo_items.exam` and `gradescope` (unused since `v3/todo-calendar`) | Nothing reads them; both PRs are deployed |
| `0023_chat_joins` | adds `chat_members.joined_at` | A room's timeline shows joins, grouped (V2.md §8.6) |
| `0024_latest_reviews` | an index on `planetterp_reviews (created_at DESC, id DESC)`, created `IF NOT EXISTS` because the previews database first applied it as `0023_latest_reviews` | `reviews/latest`: the newest reviews on `/reviews` (V2.md §7.7) |

`counters` (§7.1) stays and also holds per-user limits (`user:<id>:<route>`).

### 7.6 Identity (landed: `migrations/0003_identity.sql`)

How it works, and how to use it from other routes: `docs/AUTH.md`. Rows are validated on read with `UserRowSchema`, `UserIdentityRowSchema` and `SessionRowSchema` (`src/server/auth/store.ts`).

| Table | Key | Columns | Notes |
|---|---|---|---|
| `users` | `id`: the directory ID (`DirectoryIdSchema`, `^[a-z0-9]{2,16}$`) | `email` and `hd` (the address used last), `name`, `status` (`active` · `deleting`), `delete_after`, `chat_blocked_until`, `reviews_blocked_until`, `created_at`, `last_sign_in_at` | `terp@terpmail.umd.edu` and `terp@umd.edu` are one row, `terp`. Name and email are overwritten at every sign-in; nothing edits them in Terpsicle. Other tables reference `users (id) ON DELETE CASCADE`. |
| `user_identities` | `(provider, sub)` | `hd`, `email` (that tenant's address), `user_id`, `created_at` | One per Google account the person has used, so both of a student worker's addresses are kept. A `sub` already tied to another directory ID is refused. |
| `sessions` | `id_hash`: hex SHA-256 of the cookie's token | `user_id`, `created_at`, `last_seen_at`, `expires_at` | 30 days after the last refresh. A session seen over a day ago gets a new token (`POST /api/me`, and routes with `auth`); the replaced one works for one more minute. |

- **Cookies** (all `__Host-`, `Secure; HttpOnly; SameSite=Lax; Path=/`): `__Host-session` (32 random bytes, 30 days, set only at sign-in), `__Host-oauth` (the signed Google round trip, 10 minutes) and `__Host-hint` (the address last signed in with, for Google's `login_hint`; cleared at sign-out and deletion).
- **No pictures** (2026-09-28): nothing is fetched or stored. The daily job deletes the old copies left under R2 `USER_CONTENT`'s `avatars/` (`src/server/auth/legacy-pictures.ts`).
- **Deletion:** `account/delete` sets `status = 'deleting'` and `delete_after` a week out and ends every session; signing in before then sets `active` again. The daily job (`7 13 * * *`, `src/jobs/daily.ts`) deletes the rows of accounts past `delete_after`, and expired sessions.
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
| `instructors` | `id`: the PlanetTerp slug, or a minted `t~` + 10 base32 (`MintedInstructorIdSchema`) | `name` (the Testudo name it was first reviewed under), `planetterp_slug`, `created_at` | `InstructorSlugSchema` accepts both kinds, so links key on either. |
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

The design is `docs/V2.md` §8. The object is `src/server/chat/course-chat.ts` (its SQLite in `object-store.ts`), the socket route `src/server/chat/socket.ts`, the JSON routes `src/server/chat/api.ts`, the D1 SQL `src/server/chat/store.ts`, and the pure rules (who may read, members from main plans, retention, message ids, what a moderation decision means) `src/core/chat`.

**D1:**

| Table | Key | Columns | Notes |
|---|---|---|---|
| `chat_members` | `(user_id, term_id, course_code)` | `section_code` (`''` for a saved-for-later course), `joined_at` (when a push added the row, or changed its section; null before `0023_chat_joins`) | One row per course of each person's main plan: the settings doc's `mainPlans[term]` when it names one of the term's live plans, else the term's first tab (`mainPlanFor`, `docs/V2.md` §5.5). Rewritten after every push that saved a plan (its term) or the settings doc (every term the person has rows or a choice in). The write is skipped if another save moved `sync_heads.head` since the read, since that push rewrites the rows itself. Rows that stay the same are left alone, so they keep `joined_at`. |
| `chat_follows` | `(user_id, term_id, course_code)` | `created_at` | Course rooms opened from outside your plan; ≤ 100 per term. |
| `chat_rooms` | `(term_id, course_code, room_id)` | `kind`, `sections` (JSON section codes), `last_seq`, `last_message_at` | Written by the object when a message becomes visible, so a room has a row only after its first. `kind` and `sections` let `chat/unread` pick your professor and section rooms without the catalog. |
| `chat_read_markers` | `(user_id, term_id, course_code, room_id)` | `seq` | Only moves forward. `chat/unread`'s count is `last_seq − seq`. |
| `chat_room_prefs` | `(user_id, term_id, course_code, room_id)` | `muted` | |
| `chat_author_courses` | `(user_id, term_id, course_code)` | | Where someone has written, for account deletion: recorded at their first send in a course, so held messages count. The purge calls `purgeAuthor` on each course's object and deletes the row once it answers. No foreign key. |
| `chat_send_hashes` (`0014`) | none; indexed by `(user_id, created_at)` and `created_at` | `course_code` (the course whose room it went to), `text_hash` (`textFingerprint`: 16 hex characters, a SimHash of the normalized words; null under 20 characters), `created_at` | The spam guard's log: one row per send or edit, written by the object before screening, never the words. Pruned an hour on by the every-5-minutes moderation cron; the purge deletes a person's rows. No foreign key. |

**The object's SQLite** (made on its first write; an object nobody wrote in has no storage):
- `meta`: `term_id`, `course_code`, `read_only_at` and `delete_at` (epoch ms, from `chatRetention`), `read_only_announced`.
- `rooms`: `room_id`, `last_seq`, `created_at`.
- `messages`: `id` (a ULID), `room_id`, `seq` (per room from 1), `author_id`, `author_name` (shown only if the account is gone), `body`, `reply_to` (the thread's first message), `status` (`checking` · `visible` · `held` · `removed`), `held_reason`, `client_req` (unique per author: idempotent sends), `created_at`, `edited_at`, `check_after` (when a message still `checking` is screened again; null once moderation's cron owns it).
- `reactions`: `(message_id, reaction, user_id)`, `at`.
- `sends`: `(author_id, at)` for the limits (10 per 30 s, 500 per day, edits included), pruned after a day.

**The socket.** `GET /api/chat/socket?term=<termId>&course=<code>` with `Upgrade: websocket`: `503` while `CHAT_ENABLED` is `off`, `426` without the upgrade, `403` cross-origin, `401` signed out, `400` for a bad query, `429` past 600 sockets per person per hour, `404` for a term or course the catalog doesn't have. The object gets `X-Terpsicle-User`, `-Term`, `-Course` and `-Chat` (`on` or `read`) and trusts them: only the Worker can reach it. Keepalive `ping` gets `pong` without waking it. Close codes: `4001` the rooms turned read-only, `4002` the course's chat was deleted, `4003` sign in again; the app reconnects (or not) and the new `welcome` says the rest.

**Sending:** check (can read the room, `CHAT_ENABLED` is `on`, the term isn't over, the room is listed, no admin block, the limits) → store as `checking` and ack (the author sees it as sent) → the spam guard (`chat_send_hashes`; a repeat or flood holds it as `flagged` for the owner, urgent, with no model call) → `moderate()` (kind `chat`, target `<termId>:<courseCode>:<messageId>`) → `visible` (broadcast), `held` (author only; `graded-work` or `flagged`), `removed` (author only), or still `checking` when only a failed model call held it (moderation's cron retries and calls Chat's handler). An edit is screened again, and classmates get `moderation {removed}` for the old text until the new one is visible. If `moderate()` throws, the object's alarm takes moderation's latest decision about that text, or screens it again, two minutes later.

**Reports** (`v2/chat-ui`): `reports/create` with `surface: "chat"` and the message's ref goes to its object (`src/server/chat/report-target.ts`, MODERATION.md §6). Reports that reach the hiding weight hold the message for its author only (`held`, `held_reason: reported`); the owner's approve shows it again.

**Mock mode** (`pnpm dev:mock`, e2e): `scripts/seed-mock-data.ts` puts the mock bucket into local R2 before Vite starts, so the object reads the same catalog the app does, and the Vite config sets `CHAT_ENABLED: "on"` and `MODERATION_OFFLINE: "true"`: with `AUTH_TEST_MODE` on, moderation calls offline stand-ins for the models (`src/server/moderation/offline-models.ts`: Guard says safe, the policy model scores 0), so only the rules hold anything.

**Retention:** the first message sets an alarm. Rooms turn read-only at midnight in College Park after the 10th day past `classesEnd`, or at once when `terms.json` has the term archived and no calendar is published; the alarm then closes every socket with `4001`. 60 days later it deletes the object's storage and the course's `chat_rooms`, `chat_read_markers`, `chat_room_prefs`, `chat_author_courses` and `notifications` rows. `chat_members` stays: it describes people.

### 7.10 Terpsicle Todo (landed: `migrations/0011_todo.sql`, `0015_todo_tasks.sql`)

The design is `docs/V3.md` §3; the routes are `src/server/todo/service.ts`, the SQL `src/server/todo/store.ts` (with `TodoFeedRowSchema` and `TodoItemRowSchema`), the fetcher `fetch.ts`, the per-feed write `refresh.ts`, and the cron `src/jobs/todo-feeds.ts`. Inputs, answers and limits are `src/core/schema/todo-api.ts`; the pure pieces (cadence, backoff, the window, file items, test mode's feed) are in `src/core/todo`.

| Table | Key | Columns | Notes |
|---|---|---|---|
| `todo_feeds` | `(user_id, source)` | `url_enc`, `status` (`active` · `paused` · `broken`), `created_at`, `next_fetch_at`, `last_fetch_at`, `last_success_at`, `failure_count`, `last_error` (a code), `gone_strikes`, `gone_at`, `etag`, `last_modified`, `content_hash`, `item_count`, `last_opened_at` | One ELMS feed per person. `url_enc` is the link sealed with AES-256-GCM, `v1.<keyId>.<iv>.<ciphertext>`, bound to `todo-feed:<userId>:<source>`; only `src/server/todo/crypto.ts` and `fetch.ts` touch it (`scripts/check-imports.ts`), and store.ts reads rows by naming every other column. `gone_strikes` / `gone_at` count 401/403/404/410 answers in a row at least an hour apart; the third sets `broken`. |
| `todo_items` | `(user_id, uid)` | `source` (`elms` · `file`), `title`, `course_label`, `course_code`, `section_code`, `kind`, `due_at`, `due_date`, `link`, `first_seen_at`, `updated_at` | Only `due_date` from 30 days ago to a year ahead, at most 1,500 feed items and 1,000 file items. A fetch is two statements whatever the size (`json_each`): an upsert that writes only changed rows, and a delete of the source's items that left. A feed item replaces a file item with its UID; a file item never replaces a feed item. No descriptions. |
| `todo_done` | `(user_id, uid)` | `done_at` | Apart from items, so a refetch or a reconnect keeps them. Own tasks' marks are here too, under the task's uid. |
| `todo_tasks` | `(user_id, uid)` | `title`, `course_code`, `due_at`, `due_date`, `created_at`, `updated_at` | Your own tasks (V3.md §3.10), typed in Terpsicle and never sent to ELMS. `uid` is `own-<random>`, made by the app so Undo can put a deleted task back as itself; saving the same uid changes the task. `due_date` null is "No date"; `due_at` is set only with a time. At most 500 per person; dates from 30 days back to a year ahead. A table of its own because each fetch rewrites `todo_items` by source and its `due_date` can't be empty. `TodoTaskRowSchema` in `store.ts`. |
| `todo_hidden` | `(user_id, course_key)` | `hidden_at` | Courses a person hid (V3.md §3.11, `0016_todo_hidden.sql`): the group's key, a course code or an ELMS course name. At most 100. Disconnecting keeps them. |

- **Disconnecting** deletes the feed row, its `elms` items and every done mark not on a remaining file item or own task, in one batch. Own tasks and hidden courses stay.
- **Deleting a task** deletes its done mark in the same batch.
- **The daily job** deletes items and own tasks due more than 30 days ago (a task with no date stays), and done marks over 30 days old whose item or task is gone (we don't record when an item left the feed, so the mark's age stands in).
- **Deleting an account** removes all five by `ON DELETE CASCADE`, and the purge deletes them explicitly (`src/server/auth/purge.ts`).

---

### 7.11 Notifications (landed: `migrations/0006_notifications.sql`)

The design is `docs/V2.md` §6 (its "As built" under §6.4). Routes: `src/server/notifications/api.ts`; sending: `notify` and `sendTestPush` (`src/server/notifications/notify.ts`) over `sendPush` (`src/server/push/send.ts`); SQL: `src/server/notifications/store.ts`, `src/server/notifications/inbox.ts` (the inbox, V2.md §6.7) and `src/server/push/store.ts`; schemas: `src/core/schema/notifications.ts` (kept out of the schema barrel); crypto and push request rules: `src/core/push`; settings rules: `src/core/notifications`. The number was reserved in V2.md §13, so it lands after `0011` (wrangler applies migrations by name).

| Table | Key | Columns | Notes |
|---|---|---|---|
| `notification_settings` | `user_id` | `settings` (`NotificationSettingsSchema` JSON), `updated_at` | No row means the defaults. A row that no longer reads also gives the defaults. |
| `push_subscriptions` | `id` (16 random bytes) | `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent_label`, `created_at`, `last_success_at`, `failure_count` | One per device. Saving an endpoint again refreshes its keys; another account saving it takes the row over (a new `id` and date). 404/410 deletes it; the 10th failure in a row does too. The endpoint never leaves the server. |
| `notifications` (rebuilt by `0017_notification_inbox`) | `id` (the event's key) | `user_id`, `type` (`seat-open` · `chat-mention` · `chat-reply` · `todo-due` · `admin-urgent`), `product` (`schedule` · `chat` · `todo` · `admin`), `group_key` (the push tag), `count`, `title`, `body`, `label`, `url`, `term_id`, `course_code`, `room_id`, `thread_id`, `seq`, `message_id`, `actor_id`, `created_at`, `read_at`, `emailed_at`, `push_held_at` (`0019`) | The inbox (V2.md §6.7): one row per person per event, pushed or not, whatever the settings say, written by `notify()`. A group's rows that are unread, or were read together (the same `read_at`), are one inbox item; its newest row gives the id and words, and `count`s add up. Seats, Todo and admin rows keep their words; a chat row keeps only its message (`id` is `<user>:<term>:<course>:<message>`, so a message published again after an edit adds none), and the inbox and the digest ask the object for the words: no message text in D1. Seat rows keep `term_id` and `course_code` (reading the course reads them) and `label` ("CMSC351 0101", for a group's list); "Due tomorrow" keeps `count` (things due) and `group_key` `todo-due:<date>`. Reading the room up to its `seq` sets chat rows' `read_at`; the digest sets `emailed_at`. `push_held_at` marks rows whose push waits through quiet hours; the 8am run clears it as it takes the group. Pruned after 30 days; a course's chat rows also go at retention. |
| `notification_deliveries` | `id` | `user_id` (no foreign key; null once the account is purged), `type`, `channel`, `dedupe_key` (unique), `status` (`sent` · `failed` · `skipped`), `provider_id`, `sent_at` | One row per event per channel, claimed before sending, so a retry sends nothing twice. `provider_id` is the Email Service id, or the push services' statuses (`201,410`). Pruned after 90 days. "Send me a test" writes none. |

- **Deleting an account** drops every push subscription at once (`account/delete`); the purge deletes settings, subscriptions and `notifications`, and sets deliveries' `user_id` to null.
- **Signing out** with `pushEndpoint` deletes that device's row.
- **Chat's dedupe keys** (`v2/chat-notify`): `chat-mention:<user>:<message>` and `chat-reply:<user>:<message>` (`…:push`), and `chat-digest:<user>:<College Park date>` (`…:email`). No cap on chat pushes (V2.md §6.7): a room's mentions and a thread's replies are one notification each.
- **Seat openings' keys** (V2.md §6.7): each section's row is `seat-open:<user>:<term>:<section>:<snapshot>` (its email row in `seat_alert_sends` adds `:email`); one seats run's push for a person is `seat-open:<user>:<term>:<snapshot>:push`.
- **One-click off** (RFC 8058): `POST /api/notifications/email-off?u&t&k` turns off type `t`'s email for person `u`; `k` is `keyedHash("email-off:<u>:<t>")`. The chat digest carries it, and so does a seats run's email about several sections (one header can't stop several watches); an email about one section keeps `alerts/one-click`, which stops the watch.
- **Quiet hours** (V2.md §6.7): a held push claims no delivery row; the 8am push for its group is `quiet:<user>:<group_key>:<run time>:push`.
- **Owner alerts** (V2.md §6.7): one `admin-urgent` row per admin per queue item, id `admin-urgent:<admin>:<queue item id>`, `group_key` `admin-urgent`, `url` `/admin`, and `label` `<reason>|<surface>|<course>` ("spam|chat|CMSC351"), so a group's words ("Held for you: spam in 3 courses") come from its rows. Never the text or the author. The alert's push and email are `admin-urgent:<admin>:<run time>` (`…:push`, `…:email`); the newest row's `created_at` keeps alerts to one an hour.
- **Due tomorrow's key** (`v3/todo-notify`, V3.md §4): `todo-due:<user>:<New York date>`, the inbox row's id and the push's dedupe key (`…:push`), one a day whatever retries happen.

### 7.12 The calendar feed (landed: `migrations/0018_calendar_feeds.sql`)

The design is `docs/V2.md` §6.7 (its "As built"). Routes: `calendar/feed` and `calendar/feed/reset` (`src/server/calendar/feed.ts`, schemas in `src/core/schema/calendar-feed.ts`, kept out of the barrel) and `GET /cal/<token>.ics`, routed by the Worker before any page. The feed's contents are `buildCalendarFeed` in `src/core/ics/feed.ts`.

| Table | Key | Columns | Notes |
|---|---|---|---|
| `calendar_feeds` | `user_id` | `token_hash` (unique), `nonce`, `created_at`, `last_fetched_at` | One link per person. The token is `keyedHash("calendar-feed:v1:<user>:<nonce>")`, 64 hex characters, and is never stored: Settings derives it again from the row, and a request is matched by `token_hash` (its SHA-256). "Make a new link" writes a new nonce and hash, so the old link matches nothing. `last_fetched_at` is written at most once an hour. |

- **Serving** needs no cookie. A malformed, unknown or old token, or an account that's deleting, is the same plain 404. The answer is `text/calendar` with `Cache-Control: private, max-age=900`.
- **Limits**: 600 fetches per IP per hour (`cal-feed:ip:<ip hash>`, before the lookup) and 60 per link (`cal-feed:<token hash>`, after it), in `counters`. Neither key holds the token.
- **What's in it**: for this term and next (`feedTermIds`: today's term through the next fall or spring), the placed sections of the term's first synced plan (`feedPlanFor`), as the catalog in R2 has them now, on the term's academic calendar; and Todo's items and own tasks with a date, not marked done, each with a `VALARM` a day before. UIDs come from the section and meeting (the download's `eventUid`) or the Todo uid, so calendars update in place.
- **Deleting an account** stops the feed at once (the lookup needs an active account); the purge deletes the row.

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
- The link is made by the Share button over the calendar (SPEC §3.11), from the plan on screen.

### 8.2 Four-year share links

`/plan/shared?plan=<v>.<base64url(deflate-raw(UTF-8 JSON))>` (`docs/V3.md` §2.14). Unlike the scheduler's links, the version is a prefix outside the compressed part (`FOUR_YEAR_SHARE_VERSION`, now `1`), so a build can tell a newer link apart without inflating it, and each version has its own wire schema (`src/core/schema/four-year-share.ts`) and decoder (`src/core/share/four-year-share.ts`) that upgrades it to today's shape. A version's schema never changes once shipped; a new one adds a schema and a decoder beside it. `four-year-share.test.ts` keeps a real v1 link decoding.

Version 1's JSON, with short keys and defaults left out:

```
{ "n": "Computer Science", "f": "202608", "p": {id, department, year}?,
  "t": { "before": [{"a": "CHEM 1XX", "cr": 4, "g": ["DSNL"]}],
         "202608": [{"c": "CMSC131", "s": "p"}, {"c": "HIST200", "g": {"0": "DSHS"}}],
         "202701": [{"w": {"kind": "gen-ed", "code": "DSHU"}, "cr": 3}] } }
```

- `t` holds each term's entries in column order; a course is `c` (code) with `cr` (credits, only when the doc sets them), `g` (its "or" GenEd picks), `d` (course info for a code Testudo doesn't list), `x` (the transcript's `{t: title, v: via}`) and `s` (`x` transcript, `p` sample plan; typed when absent); a placeholder is `w` and `cr`; AP or transfer credit is `a`, `cr` and `g`, before UMD only.
- **Never in a link:** grades (V3 §2.5), entry ids and timestamps. Opening one makes a read-only doc with ids for that page; Save a copy makes a new doc with fresh ids.
- At most 150 entries (a doc's limit) and 12,000 characters; a typical eight-semester plan is about 450.
- Errors are the scheduler's: damaged ("This share link is incomplete or damaged. Ask for the link again.") or newer (with Reload).
- Analytics scrub `plan` to `plan=shared` on every path, this one included.

### 8.1 The scheduler's URLs

Where you are is the path: `/schedule/<tab>` for a rail tab (`courses`, `search`, …), and `/schedule/course/<code>`, `/schedule/connection/<id>` or `/schedule/result/<id>` for a drill-in, with the tab it's over as `?tab=` (Courses when absent; a generated plan is over Generate). Which change pushes a history entry is in `src/features/schedule/README.md`, "URL state". Every param is validated by its route's schema (`core/schema/schedule-url.ts`); a bad value is dropped, never an error.

| Param | Where | Value |
|---|---|---|
| `term` | every view | Term id. Omitted until the term list loads. |
| `planId` | every view | The open plan tab's local id; ignored when it isn't one of this browser's plans. |
| `plan` · `demo` | every view | The share link (above), and `pnpm dev:mock`'s demo switch. Kept as opened. |
| `from=plan` | every view | Arrived by Plan's "View schedule" (`docs/V3.md` §2.12): once the saved plans and terms load, the scheduler makes or opens `term`'s main plan, then drops `from` (replacing the entry). Never carried into a later move. |
| `tab` | drill-ins | The rail tab under it. |
| `view=results` | `/schedule/generate` | Generate shows its results rather than the form. |
| `q` | `/schedule/search` | Search's text. |
| `gened` · `credits` · `level` · `openSeats` · `fits` | `/schedule/search` | Search's filter chips: comma lists (`gened=DSHU,DSNL`, `level=300`) and `1` flags. |

Old-style URLs, `/schedule?tab=&course=&connection=&result=&view=&q=…` (seat-alert emails, bookmarks), redirect to their route, replacing the entry; a plain `/schedule` (a share link, the installed app's start page) opens the saved view. History entries the app writes carry `ScheduleHistoryStateSchema` in their state: `inApp`, the label of the view Back returns to, and course details' sub-tab to jump to on arrival.

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
    - `mustHaves` (the UI's filters): `DEFAULT_MUST_HAVES` has travel time on and blocks respected;
    - `rankBy` (the UI's preferences): a preset factor, or `custom` with a 0–1 weight for every `RankFactor` (one chip on is its preset; otherwise the chips write 0.5 for on and 1 for 2×; `DEFAULT_RANK_BY` is compact);
    - the term's `blocks`, `travel` and `limits` (`DEFAULT_GENERATE_LIMITS`: best 200, 500k steps).
  - `GenerateResult`:
    - `results`: each result's `sections` has one representative (the lowest-numbered) per included course, and `equivalents.byCourse` lists the time-identical alternatives (so "×3 equivalent" is `equivalents.count`);
    - `truncated` for "showing the best 200";
    - each result's `filled` names the course it took for each wildcard (`{wildcard: "CMSC4XX", courseCode}`; wildcard ids are the pattern or `gen-ed:DSHS`);
    - `relaxations`: each has a `patch` to apply and an `unlockCount` (`makeWildcardOptional` for a required wildcard);
    - `nearMisses`: each has its `conflicts`;
    - `wildcards`: per wildcard item, how many courses `matched`, how many `fit` the must-haves and required courses, and how many were `tried` (at most 40 section groups each);
    - `filterCounts`: per must-have that's on, how many plans it `removed` (a what-if run without it, less those found; `atLeast` when that run hit its budget). Empty when nothing fit or the main run was cut short. Only the app's worker asks for them (`countFilters`).

---

## 10. Open questions

1. **Low-section alerts.** The rule above emails only when a full section reopens (0 → >0). Should watching a *low* (not full) section also email when it gets close to full? The spec only says "when a seat opens".
2. **Gmail/Yahoo one-click unsubscribe.** Bulk-sender rules want `List-Unsubscribe-Post` (one-click), which would skip the confirmation the spec requires. We send `List-Unsubscribe` only (§7.1). At our volume that's fine; revisit if deliverability suffers.
