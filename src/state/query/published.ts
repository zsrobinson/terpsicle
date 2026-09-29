import {
  hashKey,
  notifyManager,
  onlineManager,
  type Query,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
  queryOptions,
  replaceEqualDeep,
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
  persistPublished,
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
 * Per query, what its fetch left to do once the query holds what it
 * fetched: a pointer's save (with any file that didn't load put back) and
 * prune.
 */
const pendingSettle = new Map<string, () => Promise<void>>();

/** Runs a fetch's settle once the query holds its data (a task later). */
function afterFetch<T>(query: Query, data: T): T {
  const settleNow = pendingSettle.get(query.queryHash);
  if (settleNow) {
    pendingSettle.delete(query.queryHash);
    setTimeout(() => void settleNow(), 0);
  }
  return data;
}

/**
 * The persister, checking restored data against the schema as the old
 * cache did: a saved copy that doesn't read is deleted and fetched again.
 * With `checkOnRestore`, a copy that did read is shown and then fetched
 * once in the background, whatever its age (a pointer, once per page).
 * Without `saveFetched` (pointers) it restores but never saves what a
 * fetch brings: the pointer's own settle is the only thing that saves it,
 * as it should be kept, after its files.
 */
function validated<S extends z.ZodType>(
  persister: Persister,
  schema: S,
  family: SchemaFamily,
  {
    checkOnRestore,
    saveFetched,
  }: { checkOnRestore: boolean; saveFetched: boolean },
) {
  return async <TQueryKey extends QueryKey>(
    queryFn: (
      context: QueryFunctionContext<TQueryKey>,
    ) => z.infer<S> | Promise<z.infer<S>>,
    context: QueryFunctionContext<TQueryKey>,
    query: Query,
  ): Promise<z.infer<S>> => {
    /** A copy from disk: shown if it reads, else deleted and fetched. */
    const fromDisk = async (
      data: unknown,
      fetchInstead: () => Promise<z.infer<S>>,
    ): Promise<z.infer<S>> => {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        await forgetPersisted(family, query.queryHash);
        return fetchInstead();
      }
      if (checkOnRestore)
        // After the restored copy is in (and its age is set).
        notifyManager.schedule(() => {
          // A failure shows on the query; the saved copy stays on screen.
          query.fetch().catch(() => {});
        });
      return parsed.data;
    };

    if (!saveFetched) {
      const fetchNow = async () => afterFetch(query, await queryFn(context));
      const restored =
        query.state.data === undefined
          ? await persister.retrieveQuery(query.queryHash, (persisted) =>
              query.setState({
                dataUpdatedAt: persisted.state.dataUpdatedAt,
                errorUpdatedAt: persisted.state.errorUpdatedAt,
              }),
            )
          : undefined;
      return restored === undefined ? fetchNow() : fromDisk(restored, fetchNow);
    }

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
    // Nothing saved once it's deleted: this fetches, and saves what it gets.
    return fromDisk(data, () => persister.persisterFn(queryFn, context, query));
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
    /** Save what a fetch brings as it comes (all but pointers). */
    saveFetched?: boolean;
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
    persister: validated(publishedPersister(family), schema, family, {
      checkOnRestore: options.checkOnRestore,
      saveFetched: options.saveFetched ?? true,
    }),
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
    load: (s) =>
      readFile(s, key, { binary: schema }, family) as Promise<ArrayBuffer>,
  });
}

/** A hashed file read and checked, JSON or bytes, straight from the source. */
async function readFile(
  source: DataSource,
  key: string,
  spec: z.ZodType | BinaryFile,
  family: SchemaFamily,
): Promise<unknown> {
  if (spec instanceof z.ZodType) return readParsed(source, key, spec, family);
  const parsed = spec.binary.safeParse(await source.readBinary(key));
  if (!parsed.success)
    throw new DataError(
      key,
      "invalid",
      `${key} doesn't match its format: ${parsed.error.message}`,
    );
  return parsed.data;
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
    /**
     * Take the new pointer even when some of its new files can't load (a
     * term's manifest: one broken department mustn't stop the seats). It
     * shows as it came; it's saved as `keepOld` returns it, with each file
     * that failed back at the version this device has (`kept`: new key →
     * saved key), so the disk still never names a file it lacks. Without
     * it, one failure keeps the old pointer, on screen and on disk.
     */
    keepOld?: (
      data: z.infer<S>,
      kept: ReadonlyMap<string, string>,
      /** The pointer as saved now, whose entries name the kept files. */
      saved: z.infer<S> | undefined,
    ) => z.infer<S>;
  },
) {
  const scope = options.scope ?? "";
  return published(source, key, schema, family, {
    staleTime: options.staleTime,
    checkOnRestore: true,
    saveFetched: false,
    load: (source, client) =>
      timedOut(
        (async () => {
          const data: z.infer<S> = await readParsed(
            source,
            key,
            schema,
            family,
          );
          const kept = await refreshSaved(
            source,
            client,
            family,
            options.lists(data),
            options.fileSchema,
            { scope, partial: Boolean(options.keepOld) },
          );
          // Once the query holds the new pointer: save it, then prune.
          pendingSettle.set(hashKey(publishedKey(source.kind, key)), () =>
            settle(source, client, family, key, {
              fetched: data,
              kept,
              keepOld: options.keepOld,
              lists: options.lists,
              schema,
              scope,
            }),
          );
          return data;
        })(),
        key,
      ),
  });
}

/**
 * How long a pointer's fetch may take, its files included, before it
 * counts as a network failure. A safety net: nothing it waits on should
 * ever wait on it, but a poll that never ends would keep its tab holding
 * the poll for the whole browser.
 */
export const POINTER_TIMEOUT_MS = 2 * 60_000;

function timedOut<T>(work: Promise<T>, key: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new DataError(
            key,
            "network",
            `${key} took over ${POINTER_TIMEOUT_MS / 1000} s`,
          ),
        ),
      POINTER_TIMEOUT_MS,
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * Fetches and saves the new version of every file saved from the old
 * pointer, each on its own. Returns those that failed (new key → the saved
 * key it would replace). Unless `partial`, one failure throws, so the old
 * pointer stays, on screen and on disk, with the files it names (DATA.md
 * §5.1 step 4). The next fetch tries only what's still missing.
 */
async function refreshSaved(
  source: DataSource,
  client: QueryClient,
  family: SchemaFamily,
  listed: readonly string[],
  fileSchema: (key: string) => z.ZodType | BinaryFile,
  { scope, partial }: { scope: string; partial: boolean },
): Promise<Map<string, string>> {
  const saved = await savedPublishedKeys(family, source.kind, scope);
  const have = new Set(saved);
  const bySlot = new Map(saved.map((k) => [fileSlot(k), k]));
  const changed = listed.filter((k) => !have.has(k) && bySlot.has(fileSlot(k)));
  const kept = new Map<string, string>();
  if (changed.length === 0) return kept;
  const files = publishedPersister(family);
  const results = await Promise.allSettled(
    changed.map(async (k) => {
      const spec = fileSchema(k);
      // Read here and put in the file's query, never through it: a file's
      // query can be waiting on this pointer (`onMissing`), so joining it
      // could be waiting for ourselves.
      const data = await readFile(source, k, spec, family);
      const file =
        spec instanceof z.ZodType
          ? publishedFile(source, k, spec, family)
          : publishedBinary(source, k, spec.binary, family);
      client.setQueryData(file.queryKey as QueryKey, data);
      await files.persistQueryByKey(file.queryKey, client);
    }),
  );
  let firstError: unknown;
  results.forEach((result, i) => {
    const k = changed[i];
    const old = k ? bySlot.get(fileSlot(k)) : undefined;
    if (result.status === "fulfilled" || !k || !old) return;
    firstError ??= result.reason;
    kept.set(k, old);
  });
  if (kept.size > 0 && !partial) throw firstError;
  await flushQueryStorage();
  return kept;
}

/**
 * Saves the pointer this fetch brought, then drops the files it no longer
 * lists (its own list, not the one on screen). The only writer of a
 * pointer's row.
 *
 * - If the query holds another copy by then (another tab's newer one, put
 *   in while this fetch was out), it saves nothing: an older pointer over
 *   a newer one would lose the newer one's files. That tab saves it.
 * - A file that didn't load is saved at the version this device has
 *   (`keepOld`), checked against the disk right before: if another tab has
 *   since saved the new version, or dropped the old one, the pointer names
 *   the new one, as a first load would.
 */
async function settle<S extends z.ZodType>(
  source: DataSource,
  client: QueryClient,
  family: SchemaFamily,
  key: string,
  {
    fetched,
    kept,
    keepOld,
    lists,
    schema,
    scope,
  }: {
    fetched: z.infer<S>;
    kept: ReadonlyMap<string, string>;
    keepOld:
      | ((
          data: z.infer<S>,
          kept: ReadonlyMap<string, string>,
          saved: z.infer<S> | undefined,
        ) => z.infer<S>)
      | undefined;
    lists: (data: z.infer<S>) => string[];
    schema: S;
    scope: string;
  },
): Promise<void> {
  const query = client
    .getQueryCache()
    .find({ queryKey: publishedKey(source.kind, key), exact: true });
  if (
    !query ||
    replaceEqualDeep(query.state.data, fetched) !== query.state.data
  )
    return;
  let toSave = fetched;
  if (kept.size > 0 && keepOld) {
    const onDisk = new Set(
      await savedPublishedKeys(family, source.kind, scope),
    );
    const still = new Map(
      [...kept].filter(([next, old]) => !onDisk.has(next) && onDisk.has(old)),
    );
    if (still.size > 0) {
      const saved = schema.safeParse(
        await publishedPersister(family).retrieveQuery(query.queryHash),
      );
      toSave = keepOld(fetched, still, saved.success ? saved.data : undefined);
    }
  }
  await persistPublished(family, query, toSave);
  await flushQueryStorage();
  await prunePublished(
    family,
    source.kind,
    new Set([key, ...lists(toSave)]),
    scope,
  );
}
