import {
  type AsyncStorage,
  experimental_createQueryPersister,
  type PersistedQuery,
} from "@tanstack/query-persist-client-core";
import Dexie, { type EntityTable } from "dexie";
import { SCHEMA_VERSIONS, type SchemaFamily } from "~/core/schema";
import {
  PersistedQueryRowSchema,
  QUERY_CACHE_DB_NAME,
  QUERY_CACHE_DB_VERSION,
} from "~/core/schema/query-cache";
import type { DataSource } from "../data-source";

// The query cache on disk (docs/DATA.md §5.5): TanStack Query's per-query
// persister over IndexedDB, for published data only, so a page shows what
// it had at once and offline. Each persisted query is one row, read when
// that query first runs and written when it fetches. Like the old data
// cache, storage errors are swallowed: the cache only ever makes loading
// faster, it never makes it fail.

/** How long a published file may sit unread before it's dropped. */
export const PUBLISHED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Row {
  key: string;
  value: unknown;
}

/** Where persisted queries live: IndexedDB in the app, memory in tests. */
export interface QueryStorage extends AsyncStorage<unknown> {
  /** Storage keys that start with `prefix`, without reading their rows. */
  keys(prefix: string): Promise<string[]>;
}

const warn = (error: unknown) => console.warn("Query cache:", error);

async function safe<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    warn(error);
    return fallback;
  }
}

/** The IndexedDB storage, in a database of its own. */
export function createDexieQueryStorage(
  name: string = QUERY_CACHE_DB_NAME,
): QueryStorage {
  const db = new Dexie(name) as Dexie & { rows: EntityTable<Row, "key"> };
  db.version(QUERY_CACHE_DB_VERSION).stores({ rows: "key" });
  return {
    getItem: (key) =>
      safe(null, async () => (await db.rows.get(key))?.value ?? null),
    setItem: (key, value) =>
      safe(undefined, async () => {
        await db.rows.put({ key, value });
      }),
    removeItem: (key) =>
      safe(undefined, async () => {
        await db.rows.delete(key);
      }),
    entries: () =>
      safe([] as [string, unknown][], async () =>
        (await db.rows.toArray()).map((row) => [row.key, row.value]),
      ),
    keys: (prefix) =>
      safe([] as string[], async () =>
        (await db.rows.where("key").startsWith(prefix).primaryKeys()).map(
          String,
        ),
      ),
  };
}

/** Storage in memory: tests, and a look at what was written. */
export function createMemoryQueryStorage(): QueryStorage & {
  rows: Map<string, unknown>;
} {
  const rows = new Map<string, unknown>();
  return {
    rows,
    getItem: async (key) => rows.get(key) ?? null,
    setItem: async (key, value) => {
      rows.set(key, structuredClone(value));
    },
    removeItem: async (key) => {
      rows.delete(key);
    },
    entries: async () => [...rows],
    keys: async (prefix) =>
      [...rows.keys()].filter((k) => k.startsWith(prefix)),
  };
}

/** Undefined until first use; null where there's nowhere to keep rows. */
let storage: QueryStorage | null | undefined;

/** The page's storage, opened on first use; none where IndexedDB isn't. */
function queryStorage(): QueryStorage | null {
  if (storage === undefined)
    storage =
      typeof indexedDB === "undefined" ? null : createDexieQueryStorage();
  return storage;
}

type Persister = ReturnType<typeof experimental_createQueryPersister<unknown>>;
const persisters = new Map<string, Persister>();

/** Test hook: where persisted queries go (null: nowhere). */
export function setQueryStorage(next: QueryStorage | null): void {
  storage = next;
  persisters.clear();
}

const prefixOf = (family: SchemaFamily) => `published:${family}`;

/**
 * The persister for one family of published files. Its buster is the
 * family's schema version, so a version bump drops that family's rows and
 * nothing else (DATA.md §2.3).
 */
export function publishedPersister(family: SchemaFamily): Persister {
  const found = persisters.get(family);
  if (found) return found;
  const persister = experimental_createQueryPersister<unknown>({
    storage: queryStorage(),
    prefix: prefixOf(family),
    buster: `${family}@${SCHEMA_VERSIONS[family]}`,
    maxAge: PUBLISHED_MAX_AGE_MS,
    // Rows are objects, not JSON text: IndexedDB clones them as they are.
    serialize: (query) => query,
    deserialize: (value) =>
      // The parts the persister reads are checked; the rest is Query's own.
      PersistedQueryRowSchema.parse(value) as unknown as PersistedQuery,
  });
  persisters.set(family, persister);
  return persister;
}

/**
 * Drops a family's rows for files its pointer no longer lists, as the old
 * cache's commit did (DATA.md §5.1 step 4): hashed files are immutable, so
 * each change leaves the old file behind. `keep` holds R2 keys; a row whose
 * key doesn't read is dropped too.
 */
export async function prunePublished(
  family: SchemaFamily,
  kind: DataSource["kind"],
  keep: ReadonlySet<string>,
): Promise<void> {
  const store = queryStorage();
  if (!store) return;
  const prefix = `${prefixOf(family)}-`;
  for (const key of await store.keys(prefix)) {
    const queryKey = parseKey(key.slice(prefix.length));
    if (queryKey && queryKey[1] !== kind) continue;
    if (queryKey && keep.has(queryKey[2])) continue;
    await store.removeItem(key);
  }
}

/** A published query's key from its hash: `["published", kind, r2Key]`. */
function parseKey(queryHash: string): [string, string, string] | null {
  try {
    const parsed: unknown = JSON.parse(queryHash);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every((part) => typeof part === "string")
    )
      return parsed as [string, string, string];
  } catch {
    // Not ours: dropped.
  }
  return null;
}
