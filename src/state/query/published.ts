import {
  notifyManager,
  onlineManager,
  type Query,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { z } from "zod";
import { create } from "zustand";
import type { SchemaFamily } from "~/core/schema";
import {
  DataError,
  type DataSource,
  type ReadOptions,
  readParsed,
  SchemaVersionError,
} from "../data-source";
import {
  flushQueryStorage,
  forgetPersisted,
  type Persister,
  prunePublished,
  publishedPersister,
  savedPublishedKeys,
} from "./persister";

// Published files (DATA.md §2.1) as TanStack Query queries: one query per
// R2 key, persisted to IndexedDB (./persister.ts). This is DATA.md §5.1's
// cache-then-revalidate in Query's words:
//
// - a hashed file is immutable: `staleTime: Infinity`, never refetched;
// - a pointer (a manifest) shows from disk at once and is checked once per
//   page, and again when stale;
// - a pointer's fetch first fetches the new version of every file saved
//   from it, so the disk never holds a pointer whose files are missing;
//   then it's saved, and the files it no longer lists are dropped;
// - a saved pointer that names a deleted file needs nothing special: the
//   file's query fails, the pointer's check brings the new hash, and a new
//   hash is a new key.
//
// Every family's factories build on these two (./review-numbers.ts).

/** The data source published queries read, set once the page has one. */
export const usePublishedSource = create<{ source: DataSource | null }>(() => ({
  source: null,
}));

/** Where published queries read from now on (app.tsx; tests pass the mock bucket). */
export function connectPublished(source: DataSource | null): void {
  usePublishedSource.setState({ source });
}

let newerListener: ((family: SchemaFamily) => void) | null = null;

/**
 * Who hears that a published read found a newer format than this build
 * reads (DATA.md §2.3): the catalog store, whose `appStale` offers Reload
 * and reloads when the page is next shown. Null to stop.
 */
export function whenNewerFormat(
  listener: ((family: SchemaFamily) => void) | null,
): void {
  newerListener = listener;
}

/** Passes a failed read's error on, telling the listener first if it's a newer format. */
export function noteNewer(family: SchemaFamily) {
  return (error: unknown): never => {
    if (error instanceof SchemaVersionError && error.newer)
      newerListener?.(family);
    throw error;
  };
}

/** `["published", "live" | "mock", r2Key]`: mock and live share localhost. */
export const publishedKey = (kind: DataSource["kind"] | "none", key: string) =>
  ["published", kind, key] as const;

/**
 * Tries a failed read twice more when the network failed, but not while
 * the browser says it's offline: then it fails at once, so what's on
 * screen says so instead of loading forever (a reconnect refetches). A
 * file that's missing, broken or in a newer format won't change by asking
 * again.
 */
export function retryPublished(failures: number, error: unknown): boolean {
  if (error instanceof DataError && error.reason !== "network") return false;
  return failures < 2 && onlineManager.isOnline();
}

/** A hashed file's key without its hash: two versions of one file share it. */
export function fileSlot(key: string): string {
  return key.replace(/\.[0-9a-f]{16}(?=\.[a-z]+$)/, "");
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The persister, checking restored data against the schema as the old
 * cache did: a saved copy that doesn't read is deleted and fetched again.
 * With `checkOnRestore`, a copy that did read is shown and then fetched
 * once in the background, whatever its age (a pointer, once per page).
 */
function validated<S extends z.ZodType>(
  persister: Persister,
  schema: S,
  family: SchemaFamily,
  checkOnRestore: boolean,
) {
  return async <TQueryKey extends QueryKey>(
    queryFn: (
      context: QueryFunctionContext<TQueryKey>,
    ) => z.infer<S> | Promise<z.infer<S>>,
    context: QueryFunctionContext<TQueryKey>,
    query: Query,
  ): Promise<z.infer<S>> => {
    let fetched = false;
    const data = await persister.persisterFn(
      (c: QueryFunctionContext<TQueryKey>) => {
        fetched = true;
        return queryFn(c);
      },
      context,
      query,
    );
    if (fetched) return data;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      await forgetPersisted(family, query.queryHash);
      // Nothing saved now: this fetches, and saves what it gets.
      return persister.persisterFn(queryFn, context, query);
    }
    if (checkOnRestore)
      // After the restored copy is in (and the persister has set its age).
      notifyManager.schedule(() => {
        // A failure shows on the query; the saved copy stays on screen.
        query.fetch().catch(() => {});
      });
    return parsed.data;
  };
}

function published<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
  options: {
    staleTime: number;
    /** Fetch a restored copy again at once (pointers). */
    checkOnRestore: boolean;
    /** Instead of a plain read (a pointer's fetch). */
    load?: (source: DataSource, client: QueryClient) => Promise<z.infer<S>>;
    /** Before a missing file fails (see `publishedFile`). */
    onMissing?: (client: QueryClient) => Promise<unknown>;
    /** How the plain read asks (its fetch priority). */
    read?: ReadOptions;
  },
) {
  return queryOptions({
    queryKey: publishedKey(source?.kind ?? "none", key),
    queryFn: source
      ? ({ client }): Promise<z.infer<S>> =>
          (options.load
            ? options.load(source, client)
            : readParsed(source, key, schema, family, options.read)
          ).catch(async (error: unknown) => {
            if (
              options.onMissing &&
              error instanceof DataError &&
              error.reason === "missing"
            )
              await options.onMissing(client).catch(() => {});
            return noteNewer(family)(error);
          })
      : skipToken,
    staleTime: options.staleTime,
    // Kept for the page's life in memory; the disk keeps it longer.
    gcTime: HOUR_MS,
    retry: retryPublished,
    // Always run: a saved copy is read from disk whatever the connection,
    // and offline a read fails rather than pausing (Query would otherwise
    // hold it, and anything awaiting it, until the connection came back).
    // `refetchOnReconnect` asks again once it does.
    networkMode: "always",
    persister: validated(
      publishedPersister(family),
      schema,
      family,
      options.checkOnRestore,
    ),
    // Another version of the same file (a new hash) keeps the one before it
    // on screen while it loads; a different file starts from nothing.
    placeholderData: (previous, previousQuery) => {
      const [, kind, before] = previousQuery?.queryKey ?? [];
      return kind === (source?.kind ?? "none") &&
        typeof before === "string" &&
        fileSlot(before) === fileSlot(key)
        ? previous
        : undefined;
    },
  });
}

/**
 * A content-hashed file: never stale, since a change is a new key. While a
 * new version of the same file loads, the one before it stays on screen.
 */
export function publishedFile<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
  options?: {
    /**
     * A saved pointer can name a file the server has since deleted: this
     * asks for the pointer again before the read fails, so the file stays
     * loading meanwhile and anything showing it moves to the new hash
     * (a new key) instead of an error. Once per fetch.
     */
    onMissing?: (client: QueryClient) => Promise<unknown>;
    /**
     * How a fetch asks: a background load reads at a low priority, so what
     * the page asked for goes first. The same key whatever it is.
     */
    read?: ReadOptions;
  },
) {
  return published(source, key, schema, family, {
    staleTime: Number.POSITIVE_INFINITY,
    checkOnRestore: false,
    onMissing: options?.onMissing,
    read: options?.read,
  });
}

/**
 * A listed file read as bytes rather than JSON (the routes binary), with
 * the schema its bytes must pass (`publishedPointer`'s `fileSchema`).
 */
export interface BinaryFile {
  binary: z.ZodType<ArrayBuffer>;
}

/**
 * A content-hashed binary file (the routes matrix): as `publishedFile`,
 * read as bytes. Bytes that fail `schema`, from the server or from disk,
 * are an "invalid" read, never saved or shown.
 */
export function publishedBinary(
  source: DataSource | null,
  key: string,
  schema: z.ZodType<ArrayBuffer>,
  family: SchemaFamily,
) {
  return published(source, key, schema, family, {
    staleTime: Number.POSITIVE_INFINITY,
    checkOnRestore: false,
    load: async (s) => {
      const parsed = schema.safeParse(await s.readBinary(key));
      if (!parsed.success)
        throw new DataError(
          key,
          "invalid",
          `${key} doesn't match its format: ${parsed.error.message}`,
        );
      return parsed.data;
    },
  });
}

/**
 * A fixed-name file with nothing hashed behind it (a term's academic
 * calendar): shown from disk at once, checked once per page and again once
 * stale. Unlike a pointer it lists nothing, so it prunes nothing.
 */
export function publishedFixed<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
  staleTime: number,
) {
  return published(source, key, schema, family, {
    staleTime,
    checkOnRestore: true,
  });
}

/**
 * A fixed-name pointer (a manifest): checked once per page, and again once
 * stale (on the next use, focus or reconnect). `lists` names the hashed
 * files it points at, each read with `fileSchema(key)`. With `scope` (an
 * R2 prefix), only saved files under it are its own: a term's manifest
 * brings and drops that term's files, never another term's.
 */
export function publishedPointer<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
  options: {
    staleTime: number;
    lists: (data: z.infer<S>) => string[];
    fileSchema: (key: string) => z.ZodType | BinaryFile;
    scope?: string;
  },
) {
  const scope = options.scope ?? "";
  return published(source, key, schema, family, {
    staleTime: options.staleTime,
    checkOnRestore: true,
    load: async (source, client) => {
      const data: z.infer<S> = await readParsed(source, key, schema, family);
      const listed = options.lists(data);
      await refreshSaved(source, client, family, listed, options.fileSchema, {
        scope,
      });
      // After the query holds the new pointer: save it, then prune.
      setTimeout(() => {
        void settle(source, client, family, key, listed, scope);
      }, 0);
      return data;
    },
  });
}

/**
 * Fetches and saves the new version of every file saved from the old
 * pointer. Throws if one can't load, so the old pointer stays, on screen
 * and on disk, with the files it names (DATA.md §5.1 step 4).
 */
async function refreshSaved(
  source: DataSource,
  client: QueryClient,
  family: SchemaFamily,
  listed: readonly string[],
  fileSchema: (key: string) => z.ZodType | BinaryFile,
  { scope }: { scope: string },
): Promise<void> {
  const saved = await savedPublishedKeys(family, source.kind, scope);
  const have = new Set(saved);
  const slots = new Set(saved.map(fileSlot));
  const changed = listed.filter((k) => !have.has(k) && slots.has(fileSlot(k)));
  if (changed.length === 0) return;
  const files = publishedPersister(family);
  await Promise.all(
    changed.map(async (k) => {
      const schema = fileSchema(k);
      const file =
        schema instanceof z.ZodType
          ? publishedFile(source, k, schema, family)
          : publishedBinary(source, k, schema.binary, family);
      await client.fetchQuery(file as ReturnType<typeof publishedFile>);
      await files.persistQueryByKey(file.queryKey, client);
    }),
  );
  await flushQueryStorage();
}

/** Saves the new pointer, then drops the files it no longer lists. */
async function settle(
  source: DataSource,
  client: QueryClient,
  family: SchemaFamily,
  key: string,
  listed: readonly string[],
  scope: string,
): Promise<void> {
  await publishedPersister(family).persistQueryByKey(
    publishedKey(source.kind, key),
    client,
  );
  await flushQueryStorage();
  await prunePublished(family, source.kind, new Set([key, ...listed]), scope);
}
