import { useEffect, useState } from "react";
import { clientConfig } from "~/app/config";
import { pickTerm } from "~/core/catalog/terms";
import type { ReviewsServerData } from "~/core/reviews";
import type { PageRequestContext, PublishedFiles } from "~/core/routing";
import {
  COURSE_INDEX_MANIFEST_KEY,
  type Course,
  type CourseCode,
  CourseIndexDeptSchema,
  type CourseIndexEntry,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  type CourseSearchRow,
  courseIndexDeptKey,
  courseSearchKey,
  type DeptCode,
  type Manifest,
  type PlanetTerpDept,
  type PlanetTerpIndex,
  PlanetTerpIndexSchema,
  type PlanetTerpSource,
  planetTerpIndexKey,
  type Term,
  type TermId,
} from "~/core/schema";
import {
  createDataReader,
  createDataSource,
  DataError,
  type DataSource,
  readParsed,
} from "~/state/data-source";

// Published data for the /reviews pages: PlanetTerp's department files and
// index, the course index (titles, and every course for search) and this
// term's catalog (who teaches a course now). Route loaders read it on the
// server, straight from the Worker's R2 (`serverContext`), and in the
// browser from /data, cached for the visit (the files are content-hashed).
// No Dexie and none of the scheduler's stores: /reviews stays light
// (scripts/check-bundle.ts).

let opened: Promise<DataSource> | null = null;

/** Mock mode reads the fixtures, live mode `/data`, as the scheduler does. */
function dataSource(): Promise<DataSource> {
  opened ??= createDataSource(clientConfig);
  return opened;
}

/** The Worker's R2 files as a data source; a missing file reads as missing. */
export function publishedSource(files: PublishedFiles): DataSource {
  return {
    kind: "live",
    readJson: async (key) => {
      const value = await files.readJson(key);
      if (value === null)
        throw new DataError(key, "missing", `No data at ${key}`);
      return value;
    },
    readBinary: async (key) => {
      throw new DataError(key, "invalid", "Server renders read JSON only");
    },
  };
}

const cache = new Map<string, Promise<unknown>>();

/** One load per key per visit; a failure is forgotten so the next try refetches. */
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const promise = load();
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

/**
 * Where a load reads: in the browser, the data source with a per-visit
 * cache; on the server, a fresh read each render (R2 behind it keeps the
 * hashed files), since one Worker isolate outlives a nightly update.
 */
export interface Reader {
  source: DataSource;
  memo: <T>(key: string, load: () => Promise<T>) => Promise<T>;
  /** Terpsicle's numbers, on the server only (null there while Reviews is off). */
  reviews: ReviewsServerData | null;
}

/** The reader for a loader: `serverContext` is set only in a server render. */
export async function readerFor(
  serverContext: PageRequestContext | undefined,
): Promise<Reader> {
  if (!serverContext)
    return { source: await dataSource(), memo: once, reviews: null };
  // Same-origin /data is this Worker's R2; mock mode and `pnpm dev` (whose
  // data comes from production) read as the browser does.
  const fromR2 =
    clientConfig.dataSource === "live" &&
    clientConfig.dataBaseUrl.startsWith("/");
  return {
    source: fromR2
      ? publishedSource(serverContext.published)
      : await dataSource(),
    memo: (_key, load) => load(),
    reviews: serverContext.reviews,
  };
}

/** A file that isn't published reads as null; anything else still throws. */
async function orNull<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof DataError && error.reason === "missing") return null;
    throw error;
  }
}

export interface PlanetTerpData {
  /** The department's file; null when PlanetTerp has nothing for it. */
  dept: PlanetTerpDept | null;
  /** How current PlanetTerp is (DATA.md §4.1); null before the manifest says. */
  source: PlanetTerpSource | null;
  /** Newest semester in PlanetTerp's grades. */
  gradesThrough: TermId | null;
}

/** PlanetTerp's manifest; null before the first PlanetTerp run. */
function planetTerpManifest(reader: Reader) {
  return reader.memo("planetterp:manifest", () =>
    orNull(createDataReader(reader.source).planetTerpManifest()),
  );
}

export function loadPlanetTerp(
  reader: Reader,
  dept: DeptCode,
): Promise<PlanetTerpData> {
  return reader.memo(`planetterp:${dept}`, async () => {
    const manifest = await planetTerpManifest(reader);
    const entry = manifest?.departments.find((d) => d.code === dept);
    return {
      dept: entry
        ? await orNull(
            createDataReader(reader.source).planetTerpDept(dept, entry.hash),
          )
        : null,
      source: manifest?.source ?? null,
      gradesThrough: manifest?.gradesThrough ?? null,
    };
  });
}

/**
 * Who's in which department, across PlanetTerp's files; null until the
 * nightly job has published one (instructor pages then need a course).
 */
export function loadPlanetTerpIndex(
  reader: Reader,
): Promise<PlanetTerpIndex | null> {
  return reader.memo("planetterp:index", async () => {
    const manifest = await planetTerpManifest(reader);
    if (!manifest?.index) return null;
    return orNull(
      readParsed(
        reader.source,
        planetTerpIndexKey(manifest.index.hash),
        PlanetTerpIndexSchema,
        "planetterp",
      ),
    );
  });
}

function courseIndexManifest(reader: Reader) {
  return reader.memo("course-index:manifest", () =>
    orNull(
      readParsed(
        reader.source,
        COURSE_INDEX_MANIFEST_KEY,
        CourseIndexManifestSchema,
        "courses",
      ),
    ),
  );
}

/** A course from the course index (any term): its title, even when it isn't offered now. */
export function loadCourseEntry(
  reader: Reader,
  code: CourseCode,
): Promise<CourseIndexEntry | null> {
  const dept = code.slice(0, 4);
  return reader
    .memo(`course-index:${dept}`, async () => {
      const manifest = await courseIndexManifest(reader);
      const entry = manifest?.departments.find((d) => d.code === dept);
      if (!entry) return null;
      return orNull(
        readParsed(
          reader.source,
          courseIndexDeptKey(dept, entry.hash),
          CourseIndexDeptSchema,
          "courses",
        ),
      );
    })
    .then((file) => file?.courses.find((c) => c.code === code) ?? null);
}

/** Every course any term has listed, for the search on /reviews. */
export function loadCourseSearch(
  reader: Reader,
): Promise<readonly CourseSearchRow[]> {
  return reader.memo("course-search", async () => {
    const manifest = await courseIndexManifest(reader);
    if (!manifest) return [];
    const file = await readParsed(
      reader.source,
      courseSearchKey(manifest.search.hash),
      CourseSearchFileSchema,
      "courses",
    );
    return file.courses;
  });
}

/** Terms newest first, for "When did you take it?". */
export function loadTerms(reader: Reader): Promise<readonly Term[]> {
  return reader.memo("terms", async () => {
    const { terms } = await createDataReader(reader.source).terms();
    return [...terms].sort((a, b) => b.id.localeCompare(a.id));
  });
}

/** The browser's reader, for what loads after the page (the home page's course search). */
export async function browserReader(): Promise<Reader> {
  return readerFor(undefined);
}

export interface CurrentTerm {
  term: Term;
  manifest: Manifest;
}

/**
 * The term the scheduler would open (SPEC §3.0) and its manifest; null
 * before the catalog is published.
 */
export function loadCurrentTerm(reader: Reader): Promise<CurrentTerm | null> {
  return reader.memo("current-term", async () => {
    const terms = await orNull(loadTerms(reader));
    const term = terms ? pickTerm(terms, null) : null;
    if (!term) return null;
    const manifest = await orNull(
      createDataReader(reader.source).manifest(term.id),
    );
    return manifest ? { term, manifest } : null;
  });
}

/**
 * The course in the term the scheduler would open, for who teaches it now;
 * `course` is null when that term doesn't list it.
 */
export async function loadCurrentCourse(
  reader: Reader,
  code: CourseCode,
): Promise<{ term: Term; course: Course | null } | null> {
  const current = await loadCurrentTerm(reader);
  if (!current) return null;
  const dept = code.slice(0, 4);
  const entry = current.manifest.departments.find((d) => d.code === dept);
  const courses = entry
    ? await reader.memo(`current:${dept}`, async () => {
        const chunk = await createDataReader(reader.source).deptChunk(
          current.term.id,
          dept,
          entry.hash,
        );
        return chunk.courses;
      })
    : [];
  return {
    term: current.term,
    course: courses.find((c) => c.code === code) ?? null,
  };
}

export type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error" };

/**
 * A load's state for a component. `key` names what's loaded; null waits.
 * `retry` asks again after a failure.
 */
export function useLoaded<T>(
  key: string | null,
  load: () => Promise<T>,
): Loaded<T> & { retry: () => void } {
  const [state, setState] = useState<{ key: string | null; value: Loaded<T> }>({
    key: null,
    value: { status: "loading" },
  });
  const [attempt, setAttempt] = useState(0);
  // `load` is keyed by `key`; a new closure each render must not reload.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (key === null) return;
    let live = true;
    setState((s) =>
      s.key === key && s.value.status === "ready"
        ? s
        : { key, value: { status: "loading" } },
    );
    load().then(
      (data) => {
        if (live) setState({ key, value: { status: "ready", data } });
      },
      () => {
        if (live) setState({ key, value: { status: "error" } });
      },
    );
    return () => {
      live = false;
    };
  }, [key, attempt]);
  const value: Loaded<T> =
    state.key === key ? state.value : { status: "loading" };
  return { ...value, retry: () => setAttempt((n) => n + 1) };
}

/** Tests start from nothing cached, reading `source` (the fixtures' files). */
export function setReviewsDataSource(source: DataSource | null): void {
  cache.clear();
  opened = source ? Promise.resolve(source) : null;
}
