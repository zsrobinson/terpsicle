import Dexie, { type EntityTable } from "dexie";
import {
  type Block,
  type CachedFile,
  type CachedManifest,
  type CourseColorPref,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  type LocalSyncDoc,
  type Plan,
  type SettingsRow,
} from "~/core/schema";

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

export class TerpsicleDb extends Dexie {
  plans!: EntityTable<Plan, "id">;
  blocks!: EntityTable<Block, "id">;
  courseColors!: EntityTable<CourseColorPref, "courseCode">;
  settings!: EntityTable<SettingsRow, "key">;
  syncDocs!: EntityTable<LocalSyncDoc, "key">;
  manifests!: EntityTable<CachedManifest, "key">;
  files!: EntityTable<CachedFile, "key">;

  constructor(name: string = LOCAL_DB_NAME) {
    super(name);
    this.version(1).stores(DB_V1_STORES);
    this.version(LOCAL_DB_VERSION).stores(V2_CHANGES);
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
