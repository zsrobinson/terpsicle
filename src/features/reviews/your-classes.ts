import {
  type CourseCode,
  LOCAL_DB_NAME,
  type Plan,
  PlanSchema,
} from "~/core/schema";

// Your plans, for /reviews: "Your classes" (every course in them) and
// "Review your instructors" (the sections you placed in terms that are
// over). A raw IndexedDB read, like the returning check on `/`: no Dexie
// here, and it never creates the database. Signed in, plan sync keeps the
// same plans here, so this is every device's.

/** Every saved plan that reads; [] when there are none or it can't be read. */
export function readPlans(dbName: string = LOCAL_DB_NAME): Promise<Plan[]> {
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
      const done = (plans: Plan[]) => {
        db.close();
        resolve(plans);
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
          const plans: Plan[] = [];
          for (const row of all.result as unknown[]) {
            const plan = PlanSchema.safeParse(row);
            if (plan.success) plans.push(plan.data);
          }
          done(plans);
        };
        all.onerror = () => done([]);
      } catch {
        done([]);
      }
    };
  });
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
