import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveCourseColors } from "~/core/color";
import {
  type CourseCode,
  CourseCodeSchema,
  type CourseColor,
  CourseColorPrefSchema,
  LOCAL_DB_NAME,
} from "~/core/schema";

// Todo colors a course's items with the scheduler's color for it (docs/V3.md
// §3.6), and files a cross-listed item under the code that's in the
// person's plans. Both live in the scheduler's IndexedDB. `/todo` doesn't
// load Dexie or the scheduler's stores (scripts/check-bundle.ts), so this
// reads the two tables raw, like `/`'s returning check, and never creates
// the database.

export interface SchedulerCourses {
  /** Colors the person picked or the scheduler assigned. */
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  /** Every course in any saved plan. */
  planCourses: ReadonlySet<CourseCode>;
}

export const NO_SCHEDULER_COURSES: SchedulerCourses = {
  colors: {},
  planCourses: new Set(),
};

const PlanCoursesRowSchema = z.object({
  courses: z.array(z.object({ courseCode: CourseCodeSchema })),
});

function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) {
      resolve([]);
      return;
    }
    try {
      const request = db
        .transaction(store, "readonly")
        .objectStore(store)
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** The scheduler's course colors and plan courses, or nothing when there's no database. */
export function readSchedulerCourses(
  dbName: string = LOCAL_DB_NAME,
): Promise<SchedulerCourses> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName);
    } catch {
      resolve(NO_SCHEDULER_COURSES);
      return;
    }
    // No database yet: abort, so this doesn't create an empty one.
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(NO_SCHEDULER_COURSES);
    request.onblocked = () => resolve(NO_SCHEDULER_COURSES);
    request.onsuccess = () => {
      const db = request.result;
      void Promise.all([
        readAll(db, "courseColors"),
        readAll(db, "plans"),
      ]).then(([colorRows, planRows]) => {
        db.close();
        const colors: Partial<Record<CourseCode, CourseColor>> = {};
        for (const row of colorRows) {
          const parsed = CourseColorPrefSchema.safeParse(row);
          if (parsed.success)
            colors[parsed.data.courseCode] = parsed.data.color;
        }
        const planCourses = new Set<CourseCode>();
        for (const row of planRows) {
          const parsed = PlanCoursesRowSchema.safeParse(row);
          if (parsed.success)
            for (const c of parsed.data.courses) planCourses.add(c.courseCode);
        }
        resolve({ colors, planCourses });
      });
    };
  });
}

/** The scheduler's courses, read once per page. */
export function useSchedulerCourses(): SchedulerCourses {
  const [courses, setCourses] = useState(NO_SCHEDULER_COURSES);
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    let live = true;
    void readSchedulerCourses().then((read) => {
      if (live) setCourses(read);
    });
    return () => {
      live = false;
    };
  }, []);
  return courses;
}

/** A color for every course on the list: the scheduler's, else a distinct default. */
export function todoCourseColors(
  codes: Iterable<CourseCode>,
  stored: SchedulerCourses["colors"],
): Record<CourseCode, CourseColor> {
  return resolveCourseColors([...codes].sort(), stored);
}
