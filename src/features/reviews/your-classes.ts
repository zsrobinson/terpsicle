import { type CourseCode, LOCAL_DB_NAME, PlanSchema } from "~/core/schema";

// "Your classes" on /reviews: the courses in the plans saved in this browser
// (V2 §1.1, read in the browser). A raw IndexedDB read, like the returning
// check on `/`: no Dexie here, and it never creates the database.

/** Every course in any saved plan, sorted; [] when there are none or it can't be read. */
export function readPlanCourses(
  dbName: string = LOCAL_DB_NAME,
): Promise<CourseCode[]> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName);
    } catch {
      resolve([]);
      return;
    }
    // No database yet: abort, so reading doesn't create an empty one.
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve([]);
    request.onblocked = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      const done = (codes: CourseCode[]) => {
        db.close();
        resolve(codes);
      };
      try {
        if (!db.objectStoreNames.contains("plans")) {
          done([]);
          return;
        }
        const all = db
          .transaction("plans", "readonly")
          .objectStore("plans")
          .getAll();
        all.onsuccess = () => {
          const codes = new Set<CourseCode>();
          for (const row of all.result as unknown[]) {
            const plan = PlanSchema.safeParse(row);
            if (plan.success)
              for (const c of plan.data.courses) codes.add(c.courseCode);
          }
          done([...codes].sort());
        };
        all.onerror = () => done([]);
      } catch {
        done([]);
      }
    };
  });
}
