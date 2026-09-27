import Dexie, { type EntityTable, type Transaction } from "dexie";
import {
  type Block,
  type CachedFile,
  type CachedManifest,
  type CourseColorPref,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  type LocalSyncDoc,
  LocalSyncMetaSchema,
  type Plan,
  type SettingsRow,
} from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";

// The browser database. Tables, keys and versions are docs/DATA.md §5; a shape
// change bumps LOCAL_DB_VERSION with an upgrade() that migrates rows (plans are
// never dropped).

/** Version 1's tables, as shipped before plan sync. */
export const DB_V1_STORES = {
  plans: "id, termId",
  blocks: "id, termId",
  courseColors: "courseCode",
  settings: "key",
  seatAlerts: "[termId+sectionKey], termId",
  manifests: "key",
  files: "key, family, termId",
} as const;

/**
 * Version 2 (plan sync, V2 §5.3): `syncDocs` holds each doc's rev and flags;
 * the account and pull cursor are the `sync` settings row. `seatAlerts`
 * goes: seat watches live on the account now (V2 §6.5).
 */
const V2_CHANGES = {
  syncDocs: "key",
  seatAlerts: null,
} as const;

/**
 * Version 3 (Terpsicle Plan, docs/V3.md §2.3): the `fourYear` table, one
 * row per four-year doc.
 */
const V3_CHANGES = { fourYear: "id" } as const;

/**
 * Sends the next pull back to the start (V3 §2.4). A tab from before sync
 * carried four-year docs skipped them but still moved its cursor past them,
 * so this device pulls everything once and sees what it skipped. Version 3
 * did it when the `fourYear` table came; version 4 does it again with
 * `v3/four-year-sync`, for the pulls that skipped them in between.
 */
export async function resetPullCursor(tx: Transaction): Promise<void> {
  const settings = tx.table("settings");
  const row: unknown = await settings.get("sync");
  const meta = LocalSyncMetaSchema.safeParse(
    typeof row === "object" && row !== null && "value" in row
      ? row.value
      : undefined,
  );
  // No sync row (signed out) or one that doesn't read: nothing to reset.
  if (meta.success)
    await settings.put({ key: "sync", value: { ...meta.data, cursor: 0 } });
}

export class TerpsicleDb extends Dexie {
  plans!: EntityTable<Plan, "id">;
  blocks!: EntityTable<Block, "id">;
  courseColors!: EntityTable<CourseColorPref, "courseCode">;
  settings!: EntityTable<SettingsRow, "key">;
  syncDocs!: EntityTable<LocalSyncDoc, "key">;
  manifests!: EntityTable<CachedManifest, "key">;
  files!: EntityTable<CachedFile, "key">;
  /** Four-year docs, validated on read (`FourYearDocSchema`). */
  fourYear!: EntityTable<FourYearDoc, "id">;

  constructor(name: string = LOCAL_DB_NAME) {
    super(name);
    this.version(1).stores(DB_V1_STORES);
    this.version(2).stores(V2_CHANGES);
    this.version(3).stores(V3_CHANGES).upgrade(resetPullCursor);
    // Version 4 (four-year sync, V3 §2.13): no table changes.
    this.version(LOCAL_DB_VERSION).stores({}).upgrade(resetPullCursor);
  }
}

/** Rows to put and keys to delete between two versions of a table. */
export function diffById<T>(
  prev: readonly T[],
  next: readonly T[],
  key: (row: T) => string,
): { put: T[]; remove: string[] } {
  const before = new Map(prev.map((row) => [key(row), row]));
  const put = next.filter((row) => before.get(key(row)) !== row);
  const nextKeys = new Set(next.map(key));
  const remove = [...before.keys()].filter((k) => !nextKeys.has(k));
  return { put, remove };
}
