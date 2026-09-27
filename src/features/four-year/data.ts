import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { clientConfig } from "~/app/config";
import {
  type FourYearCourses,
  fourYearCourses,
} from "~/core/four-year/course-lookup";
import type {
  AcademicCalendar,
  CourseIndexEntry,
  DeptCode,
  TermId,
} from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import { courseIndexEntry, useCourseIndex } from "~/state/course-index-store";
import { createDexieCache } from "~/state/data-cache";
import {
  createDataReader,
  createDataSource,
  type DataSource,
} from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import { useFourYear } from "./store";

// Where Plan's data comes from: the four-year docs in Dexie (./store), the
// course index (every course, any term; `src/state/course-index-store.ts`)
// and the term list and academic calendars, for term status and "not
// offered lately". Opened once per page, for the page's life.

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
    useCourseIndex.getState().connect(source, {
      cache: db
        ? createDexieCache(db, source.kind === "mock" ? "mock:" : "")
        : null,
    });
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
  for (const e of doc?.entries ?? [])
    if (e.kind === "course") depts.add(e.code.slice(0, 4));
  return [...depts].sort();
}

/** Loads the department files a doc needs, whenever its departments change. */
export function useDocDepts(doc: FourYearDoc | null): void {
  const key = docDepts(doc).join(",");
  const ensure = useCourseIndex((s) => s.ensureDepts);
  const connected = useCourseIndex((s) => s.source !== null);
  useEffect(() => {
    if (!connected || key === "") return;
    void ensure(key.split(","));
  }, [connected, key, ensure]);
}

/**
 * True while a department the doc needs is still loading: its problems
 * aren't known yet ("isn't in Testudo" would be a guess).
 */
export function useDeptsLoading(doc: FourYearDoc | null): boolean {
  const key = docDepts(doc).join(",");
  return useCourseIndex(
    (s) =>
      s.source !== null &&
      key !== "" &&
      key.split(",").some((d) => {
        const state = s.deptsState[d];
        return state === undefined || state === "loading";
      }),
  );
}

/** Everything the loaded department files know, for core's checks. */
export function useCourseLookup(): FourYearCourses {
  const depts = useCourseIndex((s) => s.depts);
  const deptsState = useCourseIndex((s) => s.deptsState);
  return useMemo(() => {
    const ready = Object.entries(deptsState)
      .filter(([, state]) => state === "ready")
      .map(([dept]) => dept);
    return fourYearCourses(
      Object.values(depts).flatMap((d) => d?.courses ?? []),
      ready,
    );
  }, [depts, deptsState]);
}

/**
 * One course's index entry, loading its department: `undefined` while it
 * loads, `null` when the index doesn't have it.
 */
export function useIndexEntry(
  code: string | null,
): CourseIndexEntry | null | undefined {
  const dept = code?.slice(0, 4) ?? null;
  const ensure = useCourseIndex((s) => s.ensureDepts);
  const connected = useCourseIndex((s) => s.source !== null);
  useEffect(() => {
    if (connected && dept) void ensure([dept]);
  }, [connected, dept, ensure]);
  return useCourseIndex((s) => (code ? courseIndexEntry(s, code) : null));
}

/** What the loaded department files know right now, outside React (the import). */
export function currentCourseLookup(): FourYearCourses {
  const { depts, deptsState } = useCourseIndex.getState();
  const ready = Object.entries(deptsState)
    .filter(([, state]) => state === "ready")
    .map(([dept]) => dept);
  return fourYearCourses(
    Object.values(depts).flatMap((d) => d?.courses ?? []),
    ready,
  );
}
