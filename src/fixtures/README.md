# Fixtures

Mock data for `pnpm dev:mock`, unit tests and e2e. Everything is deterministic: fixed times (`FIXTURE_NOW`), seeded generation, no clock. Fixtures may import only `~/core` (and zod). Import from `~/fixtures`.

## Builders (`builders.ts`)

One-off objects for tests. Each returns a schema-valid value with defaults taken from the mock catalog, shallow-merged with your overrides:

| Area | Builders |
|---|---|
| Catalog | `aTerm`, `aTermsFile`, `aTimedMeeting` (= `aMeeting`), `anUntimedMeeting` (async online), `aTbaMeeting` (days TBA, with a room), `aSection`, `aCourse`, `aDeptChunk`, `aSeatTuple`, `aSeatsFile`, `aSectionSnapshot`, `snapshotOf(section)`, `aCatalogChange`, `aChangesFile`, `aManifestDepartment`, `aManifest` |
| Course index | `aCourseIndexEntry`, `aCourseIndexDept`, `aCourseSearchFile`, `aCourseIndexManifest` |
| Plans | `aPlanCourse`, `aSavedCourse`, `aPlan`, `aBlock`, `aSharePayload` |
| Plan sync | `aSettingsDoc`, `aPlanSyncDoc` (a tombstone with `body: null`), `aSettingsSyncDoc` |
| PlanetTerp | `anInstructor`, `someGrades` (by letter), `gradeCountsFrom`, `aGradeRecord`, `someCourseGrades`, `aPlanetTerpDept`, `aReviewSummary` |
| Geo and travel | `aBuilding`, `aBuildingsFile`, `aRouteGeometry`, `aConnection` |
| Calendar | `aPublishedCalendar`, `anUnpublishedCalendar` |
| Computed | `aGenerateRequest`, `aProblem` |
| Chat | `aChatAuthor`, `aChatMessage` |

Don't hand-roll these objects in tests (CLAUDE.md).

## The mock catalog (`mock/`)

- **Terms:** Spring 2027 (`fixtureTermId`, active, the default) and Summer 2026 (`archivedFixtureTermId`, archived: its plans open, its seats are frozen).
- **Real data, derived** (`mock/derived/*.json`, written by `pnpm tsx scripts/derive-mock-catalog.ts` from the recon pages in `src/ingest/__fixtures__/`):
  - Spring 2027: all of AAAS, AGNR, ANTH, ARMY, BUSI, CMSC, GEOL and IDEA, plus ENGL101 (92 sections);
  - Summer 2026: CMSC;
  - 71 buildings, the off-campus codes, and every UMD GIS distance and route polyline the recon captured.
  - **Instructor names are invented.** The derivation swaps each real name for one from a fixed pool, because the mock pairs them with invented ratings and reviews.
- **Hand-made** (`mock/hand-courses.ts`): the prototype's STAT400, ENGL393, ECON200, MUSC130, PHIL140, PSYC100, ARTH200 and MATH240, for departments the recon didn't save.
- **Generated:**
  - open seats, seeded by section key, keeping Testudo's real totals and waitlist/holdfile shape; `PINNED_SEATS` fixes the demo's seat states;
  - PlanetTerp ratings and grade distributions (CMSC351's course totals are the real sums);
  - estimated distances for building pairs the recon didn't measure (centroid distance × 1.05, accessible × 1.085).
- **Changes:** `CMSC320-0301` is cancelled (removed from the catalog) and `AAAS100-0501` moved.
- **Demo state** (`mock/plans.ts`):
  - `demoPlan` is Plan A: 16 credits, an overlap, a tight connection, a low section, and two saved courses;
  - `demoPlanB` holds the moved and cancelled sections;
  - `demoArchivedPlan` is in the archived term;
  - `demoBlocks` and `demoCourseColors`.

## The mock bucket (`mock/data-source.ts`)

`mockDataSource` holds every R2 object the live jobs would write, under the same keys (`docs/DATA.md` §2), with real content hashes and manifests:
- `get(key)` returns the exact bytes, or `null` where R2 would 404;
- `json(key)` returns parsed JSON;
- `keys()` lists the keys.

It includes the course index (`courses/`, `docs/DATA.md` §3.4), built from the mock catalog's two terms by the same core functions the catalog job runs.

In mock mode (`VITE_DATA_SOURCE=mock`), the data layer calls `mockDataSource.get(key)` where it would `fetch(\`${dataBaseUrl}/${key}\`)`. Everything else stays on the same code path: manifest diffing, hashing, schema checks and caching. Load `~/fixtures` with a dynamic `import()` in mock mode only, so production bundles never include it. There are no map tiles offline.

## Regenerating derived data

```sh
pnpm tsx scripts/derive-mock-catalog.ts && pnpm fix
```

It's deterministic: rerunning it on the same recon pages changes nothing.
