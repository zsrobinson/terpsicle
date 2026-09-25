import type { SchemaFamily, TermId } from "~/core/schema";
import type { TerpsicleDb } from "./db";

// The browser's copy of published data (DATA.md §5.1): fixed-name pointer
// files (terms.json, manifests, calendars) in `manifests`, and immutable
// content-hashed files in `files`. Every call swallows storage errors
// (private windows, a full disk): the cache only ever makes loading faster,
// it never makes it fail.

export interface CachedPointer {
  data: unknown;
  /** When we last confirmed it with the server. */
  checkedAt: string;
}

export interface CacheFile {
  key: string;
  family: SchemaFamily;
  termId: TermId | null;
  data: unknown;
}

export interface DataCache {
  getPointer(key: string): Promise<CachedPointer | null>;
  putPointer(key: string, data: unknown, checkedAt: string): Promise<void>;
  /** Stored files by key; missing ones are absent from the map. */
  getFiles(keys: readonly string[]): Promise<Map<string, unknown>>;
  putFiles(files: readonly CacheFile[]): Promise<void>;
  /**
   * In one transaction: the files, then the pointer that lists them, then
   * drop this term's files the pointer no longer needs (DATA.md §5.1 step 4).
   */
  commit(
    pointer: { key: string; data: unknown; checkedAt: string },
    files: readonly CacheFile[],
    evict: {
      termId: TermId;
      family: SchemaFamily;
      keep: ReadonlySet<string>;
    } | null,
  ): Promise<void>;
  /** Forgets a whole family (a schema version bump). */
  clearFamily(family: SchemaFamily): Promise<void>;
}

/**
 * The Dexie cache. `namespace` keeps mock and live data apart when both run
 * on the same origin (`pnpm dev` and `pnpm dev:mock` share localhost:3000).
 */
export function createDexieCache(
  db: TerpsicleDb,
  namespace = "",
  onError: (error: unknown) => void = (e) => console.warn("Data cache:", e),
): DataCache {
  const k = (key: string) => `${namespace}${key}`;
  const now = () => new Date().toISOString();
  const safe = async <T>(fallback: T, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      onError(error);
      return fallback;
    }
  };
  const rows = (files: readonly CacheFile[]) => {
    const storedAt = now();
    return files.map((f) => ({ ...f, key: k(f.key), storedAt }));
  };

  return {
    getPointer: (key) =>
      safe(null, async () => {
        const row = await db.manifests.get(k(key));
        return row ? { data: row.data, checkedAt: row.checkedAt } : null;
      }),
    putPointer: (key, data, checkedAt) =>
      safe(undefined, async () => {
        await db.manifests.put({ key: k(key), data, checkedAt, etag: null });
      }),
    getFiles: (keys) =>
      safe(new Map<string, unknown>(), async () => {
        const found = await db.files.bulkGet(keys.map(k));
        const out = new Map<string, unknown>();
        keys.forEach((key, i) => {
          const row = found[i];
          if (row) out.set(key, row.data);
        });
        return out;
      }),
    putFiles: (files) =>
      safe(undefined, async () => {
        if (files.length > 0) await db.files.bulkPut(rows(files));
      }),
    commit: (pointer, files, evict) =>
      safe(undefined, async () => {
        await db.transaction("rw", db.files, db.manifests, async () => {
          if (files.length > 0) await db.files.bulkPut(rows(files));
          await db.manifests.put({
            key: k(pointer.key),
            data: pointer.data,
            checkedAt: pointer.checkedAt,
            etag: null,
          });
          if (evict) {
            const keep = new Set([...evict.keep].map(k));
            await db.files
              .where("termId")
              .equals(evict.termId)
              .filter(
                (row) =>
                  row.family === evict.family &&
                  row.key.startsWith(namespace) &&
                  !keep.has(row.key),
              )
              .delete();
          }
        });
      }),
    clearFamily: (family) =>
      safe(undefined, async () => {
        await db.transaction("rw", db.files, db.manifests, async () => {
          await db.files
            .where("family")
            .equals(family)
            .filter((row) => row.key.startsWith(namespace))
            .delete();
          const prefix = family === "catalog" ? "catalog/" : `${family}/`;
          await db.manifests
            .filter((row) => row.key.startsWith(k(prefix)))
            .delete();
        });
      }),
  };
}

/** Where the cache notes which schema versions filled it. */
export const SCHEMA_VERSIONS_KEY = "_schema-versions";

/**
 * The cache, emptied family by family when this build reads a different
 * schema version than the one that filled it (DATA.md §2.3): a version bump
 * refetches everything in that family instead of trusting old files.
 */
export function versionedCache(
  cache: DataCache,
  versions: Readonly<Record<SchemaFamily, number>>,
): DataCache {
  let ready: Promise<void> | null = null;
  const check = () => {
    ready ??= (async () => {
      const stored = (await cache.getPointer(SCHEMA_VERSIONS_KEY))?.data;
      const before =
        stored && typeof stored === "object"
          ? (stored as Partial<Record<SchemaFamily, unknown>>)
          : null;
      const bumped = (Object.keys(versions) as SchemaFamily[]).filter(
        (family) => before?.[family] !== versions[family],
      );
      if (bumped.length === 0) return;
      // Nothing recorded means nothing cached yet (every write comes
      // through here), so there's nothing to clear.
      if (before) for (const family of bumped) await cache.clearFamily(family);
      await cache.putPointer(
        SCHEMA_VERSIONS_KEY,
        versions,
        new Date().toISOString(),
      );
    })();
    return ready;
  };
  const after =
    <A extends unknown[], R>(run: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await check();
      return run(...args);
    };
  return {
    getPointer: after(cache.getPointer),
    putPointer: after(cache.putPointer),
    getFiles: after(cache.getFiles),
    putFiles: after(cache.putFiles),
    commit: after(cache.commit),
    clearFamily: after(cache.clearFamily),
  };
}

/** A cache in memory: tests, and browsers where IndexedDB won't open. */
export function createMemoryCache(): DataCache & {
  readonly pointers: Map<string, CachedPointer>;
  readonly files: Map<string, CacheFile>;
} {
  const pointers = new Map<string, CachedPointer>();
  const files = new Map<string, CacheFile>();
  return {
    pointers,
    files,
    async getPointer(key) {
      return pointers.get(key) ?? null;
    },
    async putPointer(key, data, checkedAt) {
      pointers.set(key, { data, checkedAt });
    },
    async getFiles(keys) {
      const out = new Map<string, unknown>();
      for (const key of keys) {
        const f = files.get(key);
        if (f) out.set(key, f.data);
      }
      return out;
    },
    async putFiles(list) {
      for (const f of list) files.set(f.key, f);
    },
    async commit(pointer, list, evict) {
      for (const f of list) files.set(f.key, f);
      pointers.set(pointer.key, {
        data: pointer.data,
        checkedAt: pointer.checkedAt,
      });
      if (evict) {
        for (const [key, f] of files) {
          if (
            f.termId === evict.termId &&
            f.family === evict.family &&
            !evict.keep.has(key)
          )
            files.delete(key);
        }
      }
    },
    async clearFamily(family) {
      for (const [key, f] of files) if (f.family === family) files.delete(key);
      const prefix = `${family}/`;
      for (const key of pointers.keys())
        if (key.startsWith(prefix)) pointers.delete(key);
    },
  };
}
