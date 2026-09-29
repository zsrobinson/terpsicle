import {
  type AsyncStorage,
  experimental_createQueryPersister,
  type PersistedQuery,
} from "@tanstack/query-persist-client-core";
import type { Query } from "@tanstack/react-query";
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

interface Row {
  key: string;
  value: unknown;
}

/** Where persisted queries live: IndexedDB in the app, memory in tests. */
export interface QueryStorage extends AsyncStorage<unknown> {
  /** Storage keys that start with `prefix`, without reading their rows. */
  keys(prefix: string): Promise<string[]>;
  /** Every row whose key starts with `prefix`, in one read. */
  rowsFrom(prefix: string): Promise<[string, unknown][]>;
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
    rowsFrom: (prefix) =>
      safe([] as [string, unknown][], async () =>
        (await db.rows.where("key").startsWith(prefix).toArray()).map(
          (row) => [row.key, row.value] as [string, unknown],
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
    rowsFrom: async (prefix) => [...rows].filter(([k]) => k.startsWith(prefix)),
  };
}

/** Writes not yet done, so a pointer is stored only after its files. */
const pending = new Set<Promise<unknown>>();

/**
 * Rows read ahead in one go (`preloadPublished`), each handed out once to
 * the query that restores it. A write or delete of the key drops it, so a
 * read never sees an older row than the storage has.
 */
const readAhead = new Map<string, unknown>();
/** How long rows read ahead wait for their query before they're let go. */
const READ_AHEAD_MS = 60_000;

/**
 * The storage, with its writes counted (the persister doesn't await them)
 * and reads served from what was read ahead.
 */
function tracked(inner: QueryStorage): QueryStorage {
  return {
    ...inner,
    getItem: (key) => {
      if (readAhead.has(key)) {
        const value = readAhead.get(key);
        readAhead.delete(key);
        return Promise.resolve(value);
      }
      return inner.getItem(key);
    },
    setItem: (key, value) => {
      readAhead.delete(key);
      const write = Promise.resolve(inner.setItem(key, value));
      pending.add(write);
      void write.finally(() => pending.delete(write));
      return write;
    },
    removeItem: (key) => {
      readAhead.delete(key);
      return inner.removeItem(key);
    },
  };
}

/** Undefined until first use; null where there's nowhere to keep rows. */
let storage: QueryStorage | null | undefined;

/** The page's storage, opened on first use; none where IndexedDB isn't. */
function queryStorage(): QueryStorage | null {
  if (storage === undefined)
    storage =
      typeof indexedDB === "undefined"
        ? null
        : tracked(createDexieQueryStorage());
  return storage;
}

/** Test hook: the storage as the persister uses it (reads ahead, writes counted). */
export function queryStorageForTests(): QueryStorage | null {
  return queryStorage();
}

/** Test hook: where persisted queries go (null: nowhere). */
export function setQueryStorage(next: QueryStorage | null): void {
  storage = next ? tracked(next) : null;
  persisters.clear();
  readAhead.clear();
}

/** Waits for every write the persister has started. */
export async function flushQueryStorage(): Promise<void> {
  await Promise.all(pending);
}

export type Persister = ReturnType<
  typeof experimental_createQueryPersister<unknown>
>;
const persisters = new Map<string, Persister>();

const prefixOf = (family: SchemaFamily) => `published:${family}`;

/**
 * The storage keys of a family's rows in this mode, under an R2 prefix:
 * `published:catalog-["published","live","catalog/202701/` for one term,
 * so a scan reads that term's keys and nothing else. A query's hash is its
 * key as JSON, so the key is its prefix.
 */
function rowPrefix(
  family: SchemaFamily,
  kind: DataSource["kind"],
  scope: string,
): string {
  return `${prefixOf(family)}-${JSON.stringify(["published", kind, scope]).slice(0, -2)}`;
}

/**
 * Reads a family's saved rows under an R2 prefix (a term) in one
 * IndexedDB read, so the queries that restore them next (a term's ~200
 * departments) don't each open a transaction of their own.
 */
export async function preloadPublished(
  family: SchemaFamily,
  kind: DataSource["kind"],
  scope: string,
): Promise<void> {
  const store = queryStorage();
  if (!store) return;
  const rows = await store.rowsFrom(rowPrefix(family, kind, scope));
  for (const [key, value] of rows) readAhead.set(key, value);
  setTimeout(() => {
    for (const [key] of rows) readAhead.delete(key);
  }, READ_AHEAD_MS);
}

/**
 * The persister for one family of published files. Its buster is the
 * family's schema version, so a version bump drops that family's rows and
 * nothing else (DATA.md §2.3). Rows never age out: a hashed file is never
 * refetched, so its age says nothing, and `prunePublished` drops what the
 * family's pointer stops listing. Refetching a restored pointer is the
 * query's own (./published.ts), so its failure is handled.
 */
export function publishedPersister(family: SchemaFamily): Persister {
  const id = family;
  const found = persisters.get(id);
  if (found) return found;
  const persister = experimental_createQueryPersister<unknown>({
    storage: queryStorage(),
    prefix: prefixOf(family),
    buster: `${family}@${SCHEMA_VERSIONS[family]}`,
    maxAge: Number.POSITIVE_INFINITY,
    refetchOnRestore: false,
    // Rows are objects, not JSON text: IndexedDB clones them as they are.
    serialize: (query) => query,
    // The envelope the persister reads is checked here; the data is
    // checked against its own schema by the query (./published.ts).
    deserialize: (value) =>
      PersistedQueryRowSchema.parse(value) as unknown as PersistedQuery,
  });
  persisters.set(id, persister);
  return persister;
}

/**
 * Saves a query with `data` in place of what it holds, as the persister
 * would save it (a pointer saved with a file that didn't load put back at
 * the version this device has, ./published.ts).
 */
export async function persistPublished(
  family: SchemaFamily,
  query: Pick<Query, "queryHash" | "queryKey" | "state">,
  data: unknown,
): Promise<void> {
  await queryStorage()?.setItem(`${prefixOf(family)}-${query.queryHash}`, {
    buster: `${family}@${SCHEMA_VERSIONS[family]}`,
    queryHash: query.queryHash,
    queryKey: query.queryKey,
    state: { ...query.state, data },
  });
}

/** Deletes one saved query, whose data didn't read. */
export async function forgetPersisted(
  family: SchemaFamily,
  queryHash: string,
): Promise<void> {
  await queryStorage()?.removeItem(`${prefixOf(family)}-${queryHash}`);
}

/**
 * The R2 keys of a family's saved files in this mode; with `scope`, only
 * those under that R2 prefix (one term's catalog).
 */
export async function savedPublishedKeys(
  family: SchemaFamily,
  kind: DataSource["kind"],
  scope = "",
): Promise<string[]> {
  const store = queryStorage();
  if (!store) return [];
  const prefix = `${prefixOf(family)}-`;
  return (await store.keys(rowPrefix(family, kind, scope))).flatMap((key) => {
    const queryKey = parseKey(key.slice(prefix.length));
    return queryKey && queryKey[1] === kind && queryKey[2].startsWith(scope)
      ? [queryKey[2]]
      : [];
  });
}

/**
 * Drops a family's rows for files its pointer no longer lists, as the old
 * cache's commit did (DATA.md §5.1 step 4): hashed files are immutable, so
 * each change leaves the old file behind. `keep` holds R2 keys; a row whose
 * key doesn't read is dropped too. With `scope`, only rows under that R2
 * prefix are looked at: one term's manifest never drops another term's
 * files. Call it only once the pointer and the files it replaced are saved
 * (./published.ts).
 */
export async function prunePublished(
  family: SchemaFamily,
  kind: DataSource["kind"],
  keep: ReadonlySet<string>,
  scope = "",
): Promise<void> {
  const store = queryStorage();
  if (!store) return;
  const prefix = `${prefixOf(family)}-`;
  // A whole family also drops rows whose key doesn't read; a scope looks
  // only at its own keys.
  for (const key of await store.keys(
    scope ? rowPrefix(family, kind, scope) : prefix,
  )) {
    const queryKey = parseKey(key.slice(prefix.length));
    if (queryKey && queryKey[1] !== kind) continue;
    if (queryKey && !queryKey[2].startsWith(scope)) continue;
    if (!queryKey && scope) continue;
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
