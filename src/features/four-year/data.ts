import {
  type QueryClient,
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { create } from "zustand";
import {
  type FourYearCourses,
  fourYearCourses,
} from "~/core/four-year/course-lookup";
import type {
  AcademicCalendar,
  CourseCode,
  CourseIndexDept,
  CourseIndexEntry,
  CourseSearchRow,
  DeptCode,
  TermId,
} from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import { clientConfig } from "~/lib/config";
import {
  createDataReader,
  createDataSource,
  type DataSource,
} from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import {
  courseIndexDeptQuery,
  courseIndexManifestQuery,
  courseSearchQuery,
  ensureCourseSearch,
  ensureIndexDepts,
  manifestDept,
} from "~/state/query/course-index";
import { connectPublished, usePublishedSource } from "~/state/query/published";
import { useFourYear } from "./store";

// Where Plan's data comes from: the four-year docs in Dexie (./store), the
// course index (every course, any term: TanStack Query queries over the
// published files, `src/state/query/course-index.ts`, saved to the query
// cache) and the term list and academic calendars, for term status and
// "not offered lately". Opened once per page, for the page's life.

type CatalogFacts = {
  /** The newest term Testudo lists, for `not-offered-lately`. */
  latestTermId: TermId | null;
  /** Published calendars; a term without one uses its season's months. */
  calendars: readonly AcademicCalendar[];
};

export const useFourYearFacts = create<CatalogFacts>()(() => ({
  latestTermId: null,
  calendars: [],
}));

let started: Promise<void> | null = null;
/** The page's database, once open; null before, or when the browser refuses it. */
let pageDb: TerpsicleDb | null = null;

/** The database Plan's docs live in, for sync (./sync.ts). */
export function fourYearDb(): TerpsicleDb | null {
  return pageDb;
}

async function openDb(): Promise<TerpsicleDb | null> {
  try {
    const db = new TerpsicleDb();
    await db.open();
    return db;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function loadFacts(reader: ReturnType<typeof createDataReader>) {
  const { terms } = await reader.terms();
  const latestTermId = terms.reduce<TermId | null>(
    (latest, t) => (latest === null || t.id > latest ? t.id : latest),
    null,
  );
  useFourYearFacts.setState({ latestTermId });
  const calendars = await Promise.all(
    terms.map((t) => reader.calendar(t.id).catch(() => null)),
  );
  useFourYearFacts.setState({
    calendars: calendars.filter((c): c is AcademicCalendar => c !== null),
  });
}

/**
 * Opens the docs and the course index, once per page. Tests pass the
 * fixtures' bucket as `source`; the app reads the configured one. Coming
 * back to Plan later in the same page reads the docs again, since the
 * scheduler's sync may have changed them in IndexedDB meanwhile.
 */
export function startFourYear(
  options: { source?: DataSource } = {},
): Promise<void> {
  // Read again even if the first start failed partway (the course index),
  // or sync would start over a stale store.
  if (started)
    return started.catch(() => {}).then(() => useFourYear.getState().refresh());
  started = (async () => {
    const db = await openDb();
    pageDb = db;
    const docs = useFourYear.getState().start(db);
    const source = options.source ?? (await createDataSource(clientConfig));
    connectPublished(source);
    // Facts only sharpen status and one problem kind: failing is fine.
    void loadFacts(createDataReader(source)).catch((error: unknown) =>
      console.warn("Plan: no term list", error),
    );
    await docs;
  })();
  return started;
}

/** Forgets the page's start (tests). */
export function resetFourYearStart(): void {
  started = null;
  pageDb = null;
}

/** The departments a doc's courses come from. */
export function docDepts(doc: Pick<FourYearDoc, "entries"> | null): DeptCode[] {
  const depts = new Set<DeptCode>();
  for (const e of doc?.entries ?? []) {
    if (e.kind === "course") depts.add(e.code.slice(0, 4));
    // What it counts as: its prerequisites and repeats need that course.
    const countsAs =
      e.kind === "course"
        ? e.details?.countsAs
        : e.kind === "credit"
          ? e.countsAs
          : null;
    if (countsAs) depts.add(countsAs.slice(0, 4));
  }
  return [...depts].sort();
}

/** What the index knows about some departments: the lookup core's checks read. */
export interface IndexDepts {
  lookup: FourYearCourses;
  /** A department still loading: its problems aren't known yet. */
  loading: boolean;
  /** Departments whose file didn't load (not "no such department"). */
  failed: ReadonlySet<DeptCode>;
}

/**
 * Loads these departments' files and says what they know. A department the
 * index doesn't list is loaded and empty; while the manifest or a file is
 * on its way it's loading; a file that can't load is failed.
 */
export function useIndexDepts(depts: readonly DeptCode[]): IndexDepts {
  const source = usePublishedSource((s) => s.source);
  const manifest = useQuery({
    ...courseIndexManifestQuery(source),
    enabled: depts.length > 0,
  });
  const key = depts.join(",");
  // Stable while nothing it reads changes, so Query keeps the same result
  // (and the plan's model doesn't recompute) between renders.
  const combine = useCallback(
    (files: UseQueryResult<CourseIndexDept>[]): IndexDepts => {
      const ready: DeptCode[] = [];
      const failed = new Set<DeptCode>();
      const entries: CourseIndexEntry[] = [];
      let loading = false;
      key.split(",").forEach((dept, i) => {
        if (dept === "") return;
        const file = files[i];
        if (manifest.data === undefined) {
          if (manifest.isError) failed.add(dept);
          else if (source) loading = true;
        } else if (!manifestDept(manifest.data, dept)) ready.push(dept);
        else if (file?.data) {
          ready.push(dept);
          entries.push(...file.data.courses);
        } else if (file?.isError) failed.add(dept);
        else loading = true;
      });
      return { lookup: fourYearCourses(entries, ready), loading, failed };
    },
    [key, manifest.data, manifest.isError, source],
  );
  return useQueries({
    queries: depts.map((dept) =>
      courseIndexDeptQuery(source, manifestDept(manifest.data, dept)),
    ),
    combine,
  });
}

/** The departments a doc's courses need, loaded, and what they know. */
export function useDocDepts(doc: FourYearDoc | null): IndexDepts {
  const depts = useMemo(() => docDepts(doc), [doc]);
  return useIndexDepts(depts);
}

/**
 * True while a department the doc needs is still loading: its problems
 * aren't known yet ("isn't in Testudo" would be a guess).
 */
export function useDeptsLoading(doc: FourYearDoc | null): boolean {
  return useDocDepts(doc).loading;
}

/** Everything the doc's department files know, for core's checks. */
export function useCourseLookup(doc: FourYearDoc | null): FourYearCourses {
  return useDocDepts(doc).lookup;
}

/** Whether a department's file failed to load (its titles can't show). */
export function useDeptFailed(dept: DeptCode): boolean {
  return useIndexDepts([dept]).failed.has(dept);
}

/**
 * One course's index entry, loading its department: `undefined` while it
 * loads, `null` when the index doesn't have it.
 */
export function useIndexEntry(
  code: string | null,
): CourseIndexEntry | null | undefined {
  const dept = code?.slice(0, 4);
  const { lookup } = useIndexDepts(dept ? [dept] : []);
  if (!code || !dept) return null;
  if (!lookup.loadedDepts.has(dept)) return undefined;
  return lookup.courses.get(code) ?? null;
}

/** Every course's search row, loaded on first use; null until it's in. */
export function useCourseSearch(): {
  rows: readonly CourseSearchRow[] | null;
  failed: boolean;
  /** Asks again: the manifest if that's what failed, else the file. */
  retry: () => void;
} {
  const source = usePublishedSource((s) => s.source);
  const manifest = useQuery(courseIndexManifestQuery(source));
  const search = useQuery(
    courseSearchQuery(source, manifest.data?.search.hash),
  );
  return {
    rows: search.data?.courses ?? null,
    failed: search.data === undefined && (manifest.isError || search.isError),
    retry: () =>
      void (manifest.data === undefined
        ? manifest.refetch()
        : search.refetch()),
  };
}

/** What these departments' files know, loading them first; outside React. */
export async function loadCourseLookup(
  client: QueryClient,
  depts: readonly DeptCode[],
): Promise<FourYearCourses> {
  const source = usePublishedSource.getState().source;
  if (!source || depts.length === 0) return fourYearCourses([], []);
  const files = await ensureIndexDepts(client, source, depts).catch(
    () => new Map(),
  );
  const entries: CourseIndexEntry[] = [];
  const ready: DeptCode[] = [];
  for (const [dept, file] of files) {
    ready.push(dept);
    if (file) entries.push(...file.courses);
  }
  return fourYearCourses(entries, ready);
}

/** One course's index entry once its department has loaded; null when it can't. */
export async function loadIndexEntry(
  client: QueryClient,
  code: CourseCode,
): Promise<CourseIndexEntry | null> {
  const lookup = await loadCourseLookup(client, [code.slice(0, 4)]);
  return lookup.courses.get(code) ?? null;
}

/** Every course's search row, outside React; null when it can't load. */
export async function loadCourseSearch(
  client: QueryClient,
): Promise<readonly CourseSearchRow[] | null> {
  const source = usePublishedSource.getState().source;
  if (!source) return null;
  return ensureCourseSearch(client, source).catch(() => null);
}
