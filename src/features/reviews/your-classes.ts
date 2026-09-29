import {
  type CourseCode,
  LOCAL_DB_NAME,
  type Plan,
  PlanSchema,
} from "~/core/schema";

// Your plans, for /reviews' "Courses in your plans" (every course in
// them). A raw IndexedDB read, like the returning check on `/`: no Dexie
// here, and it never creates the database. Signed in, plan sync keeps the
// same plans here, so this is every device's.

/** A store's rows, raw; [] when there's no database, no store, or it can't be read. */
function readRows(dbName: string, store: string): Promise<unknown[]> {
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
      const done = (rows: unknown[]) => {
        db.close();
        resolve(rows);
      };
      try {
        if (!db.objectStoreNames.contains(store)) {
          done([]);
          return;
        }
        const all = db
          .transaction(store, "readonly")
          .objectStore(store)
          .getAll();
        all.onsuccess = () => done(all.result as unknown[]);
        all.onerror = () => done([]);
      } catch {
        done([]);
      }
    };
  });
}

/** Every saved plan that reads; [] when there are none or it can't be read. */
export async function readPlans(
  dbName: string = LOCAL_DB_NAME,
): Promise<Plan[]> {
  const plans: Plan[] = [];
  for (const row of await readRows(dbName, "plans")) {
    const plan = PlanSchema.safeParse(row);
    if (plan.success) plans.push(plan.data);
  }
  return plans;
}

/** Every course in any saved plan, sorted. */
export async function readPlanCourses(
  dbName: string = LOCAL_DB_NAME,
): Promise<CourseCode[]> {
  const codes = new Set<CourseCode>();
  for (const plan of await readPlans(dbName))
    for (const c of plan.courses) codes.add(c.courseCode);
  return [...codes].sort();
}
