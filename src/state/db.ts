import Dexie, { type EntityTable } from "dexie";
import type { z } from "zod";
import {
  type Block,
  type CachedFile,
  type CachedManifest,
  type CourseColorPref,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  type LocalSeatAlert,
  type Plan,
  type SettingsRow,
} from "~/core/schema";

// The browser database. Tables, keys and versions are docs/DATA.md §5; a shape
// change bumps LOCAL_DB_VERSION with an upgrade() that migrates rows (plans are
// never dropped).

export class TerpsicleDb extends Dexie {
  plans!: EntityTable<Plan, "id">;
  blocks!: EntityTable<Block, "id">;
  courseColors!: EntityTable<CourseColorPref, "courseCode">;
  settings!: EntityTable<SettingsRow, "key">;
  // Compound primary key [termId+sectionKey]; Dexie has no typed helper for it.
  seatAlerts!: Dexie.Table<LocalSeatAlert, [string, string]>;
  manifests!: EntityTable<CachedManifest, "key">;
  files!: EntityTable<CachedFile, "key">;

  constructor(name: string = LOCAL_DB_NAME) {
    super(name);
    this.version(LOCAL_DB_VERSION).stores({
      plans: "id, termId",
      blocks: "id, termId",
      courseColors: "courseCode",
      settings: "key",
      seatAlerts: "[termId+sectionKey], termId",
      manifests: "key",
      files: "key, family, termId",
    });
  }
}

/**
 * Rows are validated on read: an invalid row is skipped and logged, never
 * fatal (DATA.md §5), so one bad write can't lock someone out of their plans.
 */
export function validRows<S extends z.ZodType>(
  table: string,
  schema: S,
  rows: readonly unknown[],
): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else console.warn(`Skipped an invalid ${table} row`, row, parsed.error);
  }
  return out;
}
