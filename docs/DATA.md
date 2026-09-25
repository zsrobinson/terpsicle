# Terpsicle v2: data contract

The shapes and rules that `src/ingest` + `src/jobs` (producers), `src/server` (server fns, D1) and the app (consumers) share. The code is `src/core/schema/` (zod 4 schemas + inferred types, one barrel: `~/core/schema`). **If this document and the schemas disagree, the schemas win; fix this document in the same PR.**

Naming: every schema is `FooSchema` with `type Foo = z.infer<typeof FooSchema>`. Constants are `SCREAMING_CASE`. Time is always passed in, never read (`CLAUDE.md`).

---

## 1. Identifiers

| Thing | Format | Schema / helper |
|---|---|---|
| Term id | `YYYYMM`, month code `01` spring · `05` summer · `08` fall · `12` winter. Winter's id carries the previous calendar year. Never literal in `src/` outside fixtures/tests (lint greps for it). | `TermIdSchema`, `SEASON_BY_MONTH_CODE` |
| Day | `M Tu W Th F Sa Su` (Testudo's tokens). Sets are unique and in week order, so equal sets are equal arrays. | `DaySchema`, `DAYS`, `DaysSchema` |
| Clock time | Integer minutes since America/New_York midnight (9:30am = 570). | `MinutesSchema` |
| Instant | UTC ISO string from `toISOString()`. | `IsoDateTimeSchema` |
| Date | `YYYY-MM-DD`, America/New_York. | `IsoDateSchema` |
| Department | 4 capitals: `CMSC`. | `DeptCodeSchema` |
| Course code | dept + 3 digits + 0–2 suffix letters: `CMSC351`, `CMSC389N`. Department = `code.slice(0, 4)`. | `CourseCodeSchema` |
| Section code | 3–6 capitals/digits: `0101`, `FC01`. | `SectionCodeSchema` |
| **Section key** | `<course>-<section>`: `CMSC351-0101`. The one id for a section within a term (seats map, plans, share links, alerts, problems). Split on the first `-`. | `sectionKey()`, `parseSectionKey()`, `SectionKeySchema` |
| Building code | Testudo's: `IRB`, `STAMP` (2–6 capitals/digits). | `BuildingCodeSchema` |
| Gen-ed code | 4 capitals, validated by shape so a new category never breaks ingest. Labels for known ones in `GEN_ED_LABELS`. | `GenEdCodeSchema` |
| Content hash | First 16 hex chars of SHA-256 of the file's exact bytes. | `ContentHashSchema` |
| Instructor slug | PlanetTerp's slug (`kruskal`). | `InstructorSlugSchema` |
| Local id | 8–64 URL-safe chars, minted in the browser (plans, blocks). | `LocalIdSchema` |
| Connection id | `<day>:<fromKey>#<meetingIdx>><toKey>#<meetingIdx>` | `connectionId()` |

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
| `geo/manifest.json` | `GeoManifestSchema` | buildings job (weekly), routes job (hourly) | fixed |
| `geo/buildings.<hash>.json` | `BuildingsFileSchema` | buildings job | hashed |
| `geo/routes.<hash>.bin` | binary, §4.2 | routes job | hashed |
| `geo/route/<from>-<to>-<mode>.json` | `RouteGeometrySchema` | routes job | fixed |
| `geo/tiles.pmtiles` | PMTiles | script, rarely | fixed |
| `calendar/<term>.json` | `AcademicCalendarSchema` | calendar job (weekly) | fixed |
| `summaries/<slug>.json` | `ReviewSummarySchema` | `reviewSummary` server fn | fixed, **not served** |
| `_jobs/…` | owned by M2 | jobs (resume cursors, last-crawl snapshots) | **not served** |

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
- Deploys that bump a family: the next run of any job that writes that family sees the published `schemaVersion` is older and republishes everything in it from its `_jobs/` snapshot, without recrawling. So the gap is at most one seats interval (5 min) for catalog.
- Server-fn inputs are the exception: they use `z.strictObject` (untrusted input, reject unknown keys).

### 2.4 Writing
- Write order: every new hashed file first, the manifest last. A manifest never points at a file that doesn't exist yet.
- **Two jobs write `catalog/<term>/manifest.json`** (catalog: `departments`, `catalogCrawledAt`; seats: `seats`, `changes`). Each does read → change only its own fields → set `generatedAt` → `put` with `onlyIf: { etagMatches }`; on a failed precondition it re-reads and retries (up to 5 times). `geo/manifest.json` follows the same rule (buildings job vs routes job).
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
| `summaries/*`, `_jobs/*`, anything else | 404 | — |

---

## 3. Catalog

### 3.1 Terms
`terms.json` lists every term ever seen, newest first. `status: "active"` means it was in Testudo's dropdown on the last catalog run; a term that drops off becomes `"archived"`, and its files stay. `name` is Testudo's label, verbatim. Core picks the default term: the newest active fall or spring, unless `UiPrefs.lastTermId` is set.

### 3.2 Normalization rules (ingest's output)
- **Course text:** the `approved-course-text` blocks become `prerequisite`, `corequisite` and `restriction` when labeled so. Other labeled blocks go to `otherNotes` (`{label, text}`: "Credit only granted for", "Formerly", "Additional information", "Recommended"). The unlabeled paragraph is `description`. All text is whitespace-normalized, and empty text is `null`.
- **Gen-eds:** `genEds` is a list of groups that all apply. Within a group the course counts for exactly one code (the student chooses). So Testudo's "DSHS or DSSP, DVUP" becomes `[["DSHS","DSSP"],["DVUP"]]`. A filter for code X matches any course with X in any group.
- **Cross-listings:** `crossListings` holds the codes from "Cross-listed with" and "Also offered as".
- **Sections:** sorted by `code` (section-number order) and unique within a course.
  - `instructors` is empty for "Instructor: TBA".
  - `notes` is the free text; `restriction` is the "Restricted to…"/"Reserved for…" sentences from it, or `null`.
  - `cancelled: true` only when Testudo still lists the section but marks it cancelled.
- **Meetings:** one per Testudo row, in row order.
  - Rows with days and times are `timed: true`. `days` are never empty and `end > start`.
  - Rows without set times ("TBA", or ELMS async) are `timed: false`.
  - A room of `ONLINE` gives `online: true, building: null, room: null`.
  - `kind` is `discussion`/`lab` from `class-type`, `lecture` when blank, `other` for anything else.
- **Delivery** (`RESEARCH.md` §1), from the `delivery-*` class:
  - `f2f`;
  - `blended`;
  - `online-sync` when an online section has timed meetings;
  - `online-async` when it has none.
- **Seats:** from the sections endpoint, as `[open, total, waitlist, holdfile]` (non-negative; ingest clamps negatives to 0, and holdfile is 0 when absent). Sections with no counts at all (about 9%) are left out of the map, and the UI says "Seats unknown". `asOf` is Testudo's "Open Seats as of MM/DD/YYYY at h:mm AM", read as America/New_York and stored in UTC. The freshness label uses `asOf`, or the manifest's `seats.fetchedAt` when `asOf` is null.
- Seats are **not** in department chunks. If they were, every 5-minute seats change would re-hash every department and defeat manifest diffing.

### 3.3 Changes
The seats job compares each run's sections with the previous run's (kept in `_jobs/`) and appends:
- `added`: `after`;
- `changed`: `before` and `after`. `SectionSnapshot` covers instructors, delivery and meetings; a seats-only change is never a change;
- `cancelled`: `before`. Testudo marks it cancelled;
- `removed`: `before`. It vanished without a marker; Problems treats it the same as cancelled.

The file keeps a rolling 30-day window, newest first. Plans don't depend on it for correctness: `core/catalog` diffs each placed course's snapshot against the current catalog, and a missing section means cancelled. `changes` only adds *when* the change happened and whether it was cancelled or removed.

---

## 4. Reference data

### 4.1 PlanetTerp (per department)
- **One file per department** holds:
  - `instructors`: slug → `Instructor`, covering everyone teaching a section of that department in any active term plus everyone in its grade data;
  - `names`: `instructorNameKey(testudoName)` → slug. The join is done once, in ingest;
  - `courses`: course code → `{all, byInstructor}` grade records.

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

- Cell `(m, i, j)` sits at byte `D + 2·(m·N·N + i·N + j)`. It holds walking feet from `buildings[i]` to `buildings[j]` in `modes[m]`, rounded to the nearest foot and clamped to `ROUTES_MAX_FEET` (65534).
- `ROUTES_UNKNOWN` (65535) means no route yet. The diagonal is 0.
- The file length is exactly `D + 2·M·N·N`; decoders reject anything else.
- Matrices are directed. The job may fill `(j,i)` from the `(i,j)` solve.
- Distances come from UMD GIS; an OSRM fallback fills a cell only when GIS fails, and never produces geometry. Size is about 160 KB at N = 200. Encoder and decoder live in `core/travel` (M1).

### 4.3 Route geometry
`geo/route/<from>-<to>-<mode>.json` is fetched only when a connection's map opens.
- `coordinates` are `[lng, lat]` in WGS84 with 6 decimals, converted by ingest from web mercator (wkid 102100).
- `lengthFeet` equals the binary's cell.
- If the file is missing (404), hide the map. Never draw a straight line.

### 4.4 Buildings
`BuildingsFile` holds every Testudo building code seen in any term that joined, via the SOC popup's building number, to UMD's ArcGIS layer. `lat`/`lng` is a point inside the footprint. Codes that don't join are left out; their connections get the `unknown` verdict.

### 4.5 Academic calendar
`calendar/<term>.json` is either `published` or `not-published`.
- `published` has `classesStart`, `classesEnd` (last day of classes, not exams) and `noClasses` (named inclusive date ranges: breaks and holidays).
- `not-published` is a real state: .ics export then says the dates aren't published yet.

---

## 5. Browser state (IndexedDB via Dexie)

Database `LOCAL_DB_NAME` = `terpsicle`, version `LOCAL_DB_VERSION` = 1.

| Table | Primary key, indexes | Row schema |
|---|---|---|
| `plans` | `id`, `termId` | `PlanSchema` |
| `blocks` | `id`, `termId` | `BlockSchema` |
| `courseColors` | `courseCode` | `CourseColorPrefSchema` |
| `settings` | `key` | `SettingsRowSchema` (`ui` → `UiPrefs`, `travel` → `TravelSettings`) |
| `seatAlerts` | `[termId+sectionKey]`, `termId` | `LocalSeatAlertSchema` |
| `manifests` | `key` (the R2 key) | `CachedManifestSchema` |
| `files` | `key` (the R2 key), `family`, `termId` | `CachedFileSchema` |

- **Validation:** validate every row on read. An invalid row is skipped and logged, never fatal. A shape change bumps `LOCAL_DB_VERSION` with a Dexie `upgrade()` that migrates rows; plans are never dropped. Files in `files` are validated when fetched and trusted afterwards; a `SCHEMA_VERSIONS` bump clears that family.
- **Plans:**
  - `courses` is the Courses-tab order, with at most one entry per course.
  - `sectionCode: null` means saved for later, per plan.
  - A placed course stores `snapshot` (instructors, delivery, meetings) taken when it was placed, or switched, or when a "changed" problem's "Keep new times" fix is applied. `core/catalog` compares it with the live catalog.
  - `order` sorts plan tabs within a term.
- **Blocks are per term, not per plan.**
  - Blocks describe the person's week (work, practice, lunch), not a choice between schedules. The generator runs outside any plan (SPEC §3.9), and "Respect my blocks" needs one unambiguous set; so do "Fits my plan" and Problems across tabs.
  - Per-plan blocks would also have to be copied on Duplicate, Generate and Save a copy, and would drift apart.
  - The prototype stored them per plan only because it had no generator outside a plan.
  - Undo covers block changes too.
- **Course colors are global:** one color per course code, the same in every plan and term (SPEC §3.2). A course with no row gets a color when first added to a plan (the palette color least used in that plan), and that color is written to `courseColors` so it stays stable. `COURSE_COLORS` are palette ids; the UI maps each to light and dark tints. Only append to that list.
- **UI prefs:** open tab, sidebar open, drill target (course with its details tab, or a connection; generated results aren't restorable), theme, last term, active plan per term, and collapsed instructor groups (`<course>|<instructor name>`).
- **Not persisted:** the undo stack, hover/preview state, search text, and generator results.
- **Seat alerts (local mirror):** the person's own email is kept so the UI can say "Watching as…" and prefill the next bell. `subscriptionId` and `manageToken` are set only when this browser created the subscription.

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

---

## 6. Travel math (`core/travel`)

- `feetPerMinute = mph × 88`, with `PACE_MPH`: slower 2.5, typical 3.0, faster 3.5.
- `walkMinutes = ceil(distanceFeet / feetPerMinute) + extraMinutes`, with extra minutes 0, 2 or 5.
- Connections are consecutive timed, in-person meetings on one day in different buildings. Blocks and online meetings never take part. The distance comes from the `accessible` matrix when `TravelSettings.accessible` is on, otherwise from `standard`.
- **Verdicts:**
  - `insufficient` when `walkMinutes > gapMinutes`;
  - `tight` when `walkMinutes ≥ TIGHT_SHARE × gapMinutes`, where `TIGHT_SHARE` = 0.75;
  - `ok` otherwise;
  - `unknown` when either building has no distance. Its pill is neutral, with "No route data yet".
- The "How?" explanation shows exactly this formula for one real connection.

---

## 7. Server functions and D1

### 7.1 Seat alerts (`SPEC.md` §3.12)
All inputs use `z.strictObject`. Tokens are 32 random bytes in base64url (43 characters); only their hex SHA-256 is stored. Subscription ids are 16 random bytes in base64url (22 characters). Emails are trimmed and lowercased before storing or comparing.

| Fn | Input | Result |
|---|---|---|
| `alerts.subscribe` | `SubscribeInputSchema` `{email, termId, sectionKey}` | `SubscribeResultSchema`: `confirmation-sent` (new, or re-activating an `unsubscribed` row, with `subscriptionId` + `manageToken`) · `confirmation-resent` (a `pending` row existed) · `already-watching` (an `active` row existed: "You're already watching this") · `rate-limited` · `unknown-section` (not in that term's catalog, or the term is archived) · `unavailable` (flag off or no `RESEND_API_KEY`) |
| `alerts.confirm` | `{token}` from the email link | `confirmed` · `already-confirmed` · `invalid-token` |
| `alerts.lookup` | `{token}` (manage token) | `found` (with term, section, status) · `invalid-token`. The unsubscribe page shows this and asks "Stop emails for CMSC351 0101?" |
| `alerts.unsubscribe` | `{token}` (manage token) | `unsubscribed` (idempotent) · `invalid-token`. Called only after that confirmation; the app's Export → Seat alerts list asks the same question |
| `alerts.status` | `{items: [{subscriptionId, manageToken}]}` (≤ 50) | per item: `pending`, `active`, `unsubscribed` or `unknown`. Refreshes the local mirror |

- The manage token goes to the browser only in a `confirmation-sent` response. `already-watching` and `confirmation-resent` never reveal an existing row's token.
- **Confirmation** links expire after 48 h. A resend is allowed at most once per 10 min per subscription.
- **Alert rule:** each seats run, for each `active` subscription in that term whose section is in the seats map:
  - send "A seat opened" when `last_open = 0` and the new `open > 0`, and `last_notified_at` is more than 30 min ago;
  - then set `last_open`, `last_checked_at`, and (when sent) `last_notified_*`;
  - `last_open` is set from the seats file at confirmation.
- **Rate limits:**
  - at most 5 confirmation emails per email per 24 h;
  - at most 20 seat-open emails per email per 24 h;
  - counted from `email_sends`.
- `email_sends.dedupe_key` makes a retried cron send nothing twice:
  - `confirm:<subscription id>:<first 16 hex of token hash>`;
  - `seat-open:<subscription id>:<seats asOf or fetchedAt>`.

Proposed migration (`migrations/0001_seat_alerts.sql`; M0/M7 create the file):

```sql
-- Seat-alert subscriptions: the only server-side user data (SPEC §1, principle 6).
CREATE TABLE alert_subscriptions (
  id                 TEXT PRIMARY KEY,          -- 16 random bytes, base64url
  email              TEXT NOT NULL,             -- trimmed, lowercased
  term_id            TEXT NOT NULL,
  section_key        TEXT NOT NULL,             -- e.g. CMSC351-0101
  status             TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token_hash TEXT UNIQUE,               -- hex SHA-256; NULL once confirmed
  confirm_expires_at TEXT,                      -- ISO UTC; created/resent + 48 h
  manage_token_hash  TEXT NOT NULL UNIQUE,      -- hex SHA-256; unsubscribe links and alerts.status
  created_at         TEXT NOT NULL,             -- ISO UTC
  confirmed_at       TEXT,
  unsubscribed_at    TEXT,
  last_open          INTEGER,                   -- open seats at the last check
  last_checked_at    TEXT,
  last_notified_at   TEXT,
  last_notified_open INTEGER,
  UNIQUE (email, term_id, section_key)
);

-- The seats cron reads active watchers per term and section.
CREATE INDEX alert_subscriptions_active
  ON alert_subscriptions (term_id, section_key)
  WHERE status = 'active';

-- Every email we try to send: dedupe for cron retries, and rate limits per address.
CREATE TABLE email_sends (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  subscription_id TEXT REFERENCES alert_subscriptions (id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('confirm', 'seat-open')),
  dedupe_key      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id     TEXT,                         -- Resend message id
  sent_at         TEXT NOT NULL                 -- ISO UTC
);

CREATE INDEX email_sends_by_email ON email_sends (email, sent_at);
```

`AlertSubscriptionRowSchema` and `EmailSendRowSchema` validate rows on read.

### 7.2 Review summaries
`reviewSummary({slug})` returns `ReviewSummaryResultSchema`.
- **Normal path:** return `summaries/<slug>.json` if it exists and its `basedOnReviewCount` is at least the instructor's current `reviewCount`.
- **Otherwise,** generate with Workers AI and store it. Concurrent first requests for one slug share one generation.
- **When it can't:** return `unavailable` with a reason: `no-reviews`, `unknown-instructor`, `daily-limit` or `failed`. The UI hides the summary for all of them.
- Review text is untrusted input to the model.
- The summary is the only thing shown with the sparkles icon.

---

## 8. Share links

`/?plan=<base64url(deflate-raw(UTF-8 JSON))>`, where the JSON matches `SharePayloadSchema`:
- `v: 1`, `termId`, `name?`;
- `sections`: section keys in course order;
- `saved?`: saved-for-later course codes;
- `blocks?`: `{label, days, start, end}`;
- `colors?`: course → palette id.

At most 40 entries per list, and one entry per course across `sections` and `saved`. There are no ids, timestamps or snapshots.
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
2. **List-Unsubscribe.** Mail clients' one-click unsubscribe (RFC 8058 `List-Unsubscribe-Post`) skips our confirmation step. The proposal is to send `List-Unsubscribe` with the confirming page URL only, with no `-Post` header.
3. **Winter term year.** `Term.year` is the year in Testudo's label. Confirm with the M2 fixtures how Testudo labels the `12` term.
4. **Section code shape.** Allowed as 3–6 capitals or digits, and course suffixes as 0–2 letters. M2's saved pages should confirm there are no other shapes.
5. **Per-IP abuse limits** on `alerts.subscribe`. D1 counts by email only; a Workers rate-limiting binding may not count as a "proven product".
