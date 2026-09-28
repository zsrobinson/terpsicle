import type { z } from "zod";
import {
  type Block,
  BlockSchema,
  DEFAULT_TRAVEL_SETTINGS,
  LOCAL_DB_NAME,
  type MainPlans,
  type Plan,
  PlanSchema,
  SettingsRowSchema,
  type TravelSettings,
} from "~/core/schema";
import { type FourYearDoc, FourYearDocSchema } from "~/core/schema/four-year";

// What Home reads from this device first (docs/V3.md §1.5): the scheduler's
// plans, blocks and settings, and Plan's four-year plan, from the one
// IndexedDB database. A raw read, like `/`'s returning check and Todo's
// course colors: Home never loads Dexie or the scheduler's stores
// (scripts/check-bundle.ts), and never creates the database. Signed in,
// plan sync keeps the same things here, so it's every device's.

export interface HomeLocal {
  /** Every saved plan that reads. */
  plans: readonly Plan[];
  /** Each term's main plan, as chosen (`mainPlanFor` fills the gaps). */
  mainPlans: Readonly<MainPlans>;
  travel: TravelSettings;
  blocks: readonly Block[];
  /** The four-year plan Plan opens: the one last open, else the oldest. */
  fourYear: FourYearDoc | null;
}

export const NO_LOCAL: HomeLocal = {
  plans: [],
  mainPlans: {},
  travel: DEFAULT_TRAVEL_SETTINGS,
  blocks: [],
  fourYear: null,
};

const STORES = ["plans", "blocks", "settings", "fourYear"] as const;

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

function valid<S extends z.ZodType>(
  rows: readonly unknown[],
  schema: S,
): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** What the rows hold, validated; rows that don't read are left out. */
export function homeLocalFrom(tables: {
  plans: readonly unknown[];
  blocks: readonly unknown[];
  settings: readonly unknown[];
  fourYear: readonly unknown[];
}): HomeLocal {
  let mainPlans: Readonly<MainPlans> = {};
  let travel = DEFAULT_TRAVEL_SETTINGS;
  let activeId: string | null = null;
  for (const row of valid(tables.settings, SettingsRowSchema)) {
    if (row.key === "mainPlans") mainPlans = row.value;
    else if (row.key === "travel") travel = row.value;
    else if (row.key === "fourYear") activeId = row.value.activeId;
  }
  const docs = valid(tables.fourYear, FourYearDocSchema).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return {
    plans: valid(tables.plans, PlanSchema),
    mainPlans,
    travel,
    blocks: valid(tables.blocks, BlockSchema),
    fourYear: docs.find((d) => d.id === activeId) ?? docs[0] ?? null,
  };
}

/** Everything Home reads here, or nothing when there's no database. */
export function readHomeLocal(
  dbName: string = LOCAL_DB_NAME,
): Promise<HomeLocal> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName);
    } catch {
      resolve(NO_LOCAL);
      return;
    }
    // No database yet: abort, so reading doesn't create an empty one.
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(NO_LOCAL);
    request.onblocked = () => resolve(NO_LOCAL);
    request.onsuccess = () => {
      const db = request.result;
      void Promise.all(STORES.map((store) => readAll(db, store))).then(
        ([plans = [], blocks = [], settings = [], fourYear = []]) => {
          db.close();
          resolve(homeLocalFrom({ plans, blocks, settings, fourYear }));
        },
      );
    };
  });
}
