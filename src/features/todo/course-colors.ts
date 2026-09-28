import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveCourseColors } from "~/core/color";
import { mainPlanFor } from "~/core/plans/main-plan";
import {
  type CourseCode,
  CourseCodeSchema,
  type CourseColor,
  CourseColorPrefSchema,
  IsoDateTimeSchema,
  LOCAL_DB_NAME,
  LocalIdSchema,
  MainPlansSchema,
  TermIdSchema,
} from "~/core/schema";

// Todo colors a course's items with the scheduler's color for it (docs/V3.md
// §3.6), and files a cross-listed item under the code that's in the
// person's main plans (V2 §5.5: drafts stay in Schedule). Both live in the
// scheduler's IndexedDB. `/todo` doesn't
// load Dexie or the scheduler's stores (scripts/check-bundle.ts), so this
// reads the two tables raw, like `/`'s returning check, and never creates
// the database.

/** A term's main plan, as far as Todo reads it: enough to name it and open it. */
export type TodoMainPlan = { readonly id: string; readonly name: string };

export interface SchedulerCourses {
  /** Colors the person picked or the scheduler assigned. */
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  /** Every course in each term's main plan. */
  planCourses: ReadonlySet<CourseCode>;
  /** Each term's main plan, for View schedule. */
  mainPlans: Readonly<Partial<Record<string, TodoMainPlan>>>;
}

export const NO_SCHEDULER_COURSES: SchedulerCourses = {
  colors: {},
  planCourses: new Set(),
  mainPlans: {},
};

const PlanCoursesRowSchema = z.object({
  id: LocalIdSchema,
  termId: TermIdSchema,
  name: z.string(),
  order: z.number(),
  createdAt: IsoDateTimeSchema,
  courses: z.array(z.object({ courseCode: CourseCodeSchema })),
});
const MainPlansRowSchema = z.object({ value: MainPlansSchema });

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
        readAll(db, "settings"),
      ]).then(([colorRows, planRows, settingsRows]) => {
        db.close();
        const colors: Partial<Record<CourseCode, CourseColor>> = {};
        for (const row of colorRows) {
          const parsed = CourseColorPrefSchema.safeParse(row);
          if (parsed.success)
            colors[parsed.data.courseCode] = parsed.data.color;
        }
        const plans = planRows.flatMap((row) => {
          const parsed = PlanCoursesRowSchema.safeParse(row);
          return parsed.success ? [parsed.data] : [];
        });
        const chosen = MainPlansRowSchema.safeParse(
          settingsRows.find(
            (row) =>
              typeof row === "object" &&
              row !== null &&
              "key" in row &&
              row.key === "mainPlans",
          ),
        );
        const planCourses = new Set<CourseCode>();
        const mainPlans: Record<string, TodoMainPlan> = {};
        for (const termId of new Set(plans.map((p) => p.termId))) {
          const main = mainPlanFor(
            termId,
            plans,
            chosen.success ? chosen.data.value : {},
          );
          if (!main) continue;
          mainPlans[termId] = { id: main.id, name: main.name };
          for (const c of main.courses) planCourses.add(c.courseCode);
        }
        resolve({ colors, planCourses, mainPlans });
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
