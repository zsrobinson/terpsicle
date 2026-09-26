import { useEffect, useState } from "react";
import { clientConfig } from "~/app/config";
import { pickTerm } from "~/core/catalog/terms";
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
  type PlanetTerpDept,
  type PlanetTerpSource,
  type Term,
  type TermId,
} from "~/core/schema";
import {
  createDataReader,
  createDataSource,
  DataError,
  type DataReader,
  type DataSource,
  readParsed,
} from "~/state/data-source";

// Published data for the /reviews pages: PlanetTerp's department files, the
// course index (titles, and every course for search) and this term's
// catalog (who teaches a course now). Plain reads, cached for the visit and
// by the browser (the files are content-hashed). No Dexie and none of the
// scheduler's stores: /reviews stays light (scripts/check-bundle.ts).

let opened: Promise<DataSource> | null = null;

/** Mock mode reads the fixtures, live mode `/data`, as the scheduler does. */
function dataSource(): Promise<DataSource> {
  opened ??= createDataSource(clientConfig);
  return opened;
}

async function data(): Promise<DataReader> {
  return createDataReader(await dataSource());
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

export function loadPlanetTerp(dept: DeptCode): Promise<PlanetTerpData> {
  return once(`planetterp:${dept}`, async () => {
    const reader = await data();
    const manifest = await reader.planetTerpManifest();
    const entry = manifest.departments.find((d) => d.code === dept);
    return {
      dept: entry
        ? await orNull(reader.planetTerpDept(dept, entry.hash))
        : null,
      source: manifest.source ?? null,
      gradesThrough: manifest.gradesThrough,
    };
  });
}

/** A course from the course index (any term): its title, even when it isn't offered now. */
export function loadCourseEntry(
  code: CourseCode,
): Promise<CourseIndexEntry | null> {
  const dept = code.slice(0, 4);
  return once(`course-index:${dept}`, async () => {
    const source = await dataSource();
    const manifest = await orNull(
      readParsed(
        source,
        COURSE_INDEX_MANIFEST_KEY,
        CourseIndexManifestSchema,
        "courses",
      ),
    );
    const entry = manifest?.departments.find((d) => d.code === dept);
    if (!entry) return null;
    return orNull(
      readParsed(
        source,
        courseIndexDeptKey(dept, entry.hash),
        CourseIndexDeptSchema,
        "courses",
      ),
    );
  }).then((file) => file?.courses.find((c) => c.code === code) ?? null);
}

/** Every course any term has listed, for the search on /reviews. */
export function loadCourseSearch(): Promise<readonly CourseSearchRow[]> {
  return once("course-search", async () => {
    const source = await dataSource();
    const manifest = await orNull(
      readParsed(
        source,
        COURSE_INDEX_MANIFEST_KEY,
        CourseIndexManifestSchema,
        "courses",
      ),
    );
    if (!manifest) return [];
    const file = await readParsed(
      source,
      courseSearchKey(manifest.search.hash),
      CourseSearchFileSchema,
      "courses",
    );
    return file.courses;
  });
}

/** Terms newest first, for "When did you take it?". */
export function loadTerms(): Promise<readonly Term[]> {
  return once("terms", async () => {
    const { terms } = await (await data()).terms();
    return [...terms].sort((a, b) => b.id.localeCompare(a.id));
  });
}

export interface CurrentCourse {
  term: Term;
  course: Course;
}

/**
 * The course in the term the scheduler would open (SPEC §3.0), for who
 * teaches it now. Null when that term doesn't list it.
 */
export function loadCurrentCourse(
  code: CourseCode,
): Promise<CurrentCourse | null> {
  const dept = code.slice(0, 4);
  return once(`current:${dept}`, async () => {
    const reader = await data();
    const term = pickTerm(await loadTerms(), null);
    if (!term) return null;
    const manifest = await reader.manifest(term.id);
    const entry = manifest.departments.find((d) => d.code === dept);
    if (!entry) return { term, courses: [] as Course[] };
    const chunk = await reader.deptChunk(term.id, dept, entry.hash);
    return { term, courses: chunk.courses };
  }).then((found) => {
    const course = found?.courses.find((c) => c.code === code);
    return found && course ? { term: found.term, course } : null;
  });
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
