import { queryOptions, skipToken } from "@tanstack/react-query";
import type { z } from "zod";
import { create } from "zustand";
import type { SchemaFamily } from "~/core/schema";
import { DataError, type DataSource, readParsed } from "../data-source";
import { prunePublished, publishedPersister } from "./persister";

// Published files (DATA.md §2.1) as TanStack Query queries: one query per
// R2 key, persisted to IndexedDB (./persister.ts). This is DATA.md §5.1's
// cache-then-revalidate in Query's words:
//
// - a hashed file is immutable: `staleTime: Infinity`, never refetched;
// - a pointer (a manifest) shows from disk at once and is refetched in the
//   background when stale, then drops the files it no longer lists;
// - a saved pointer that names a deleted file needs nothing special: the
//   file's query fails, the stale pointer refetches, and its new hash is a
//   new key.
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

/** `["published", "live" | "mock", r2Key]`: mock and live share localhost. */
export const publishedKey = (kind: DataSource["kind"] | "none", key: string) =>
  ["published", kind, key] as const;

/**
 * Tries a failed read twice more when the network failed. A file that's
 * missing, broken or in a newer format won't change by asking again.
 */
export function retryPublished(failures: number, error: unknown): boolean {
  if (error instanceof DataError && error.reason !== "network") return false;
  return failures < 2;
}

const HOUR_MS = 60 * 60 * 1000;

function published<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
  staleTime: number,
  after?: (data: z.infer<S>, source: DataSource) => void,
) {
  return queryOptions({
    queryKey: publishedKey(source?.kind ?? "none", key),
    queryFn: source
      ? async (): Promise<z.infer<S>> => {
          const data = await readParsed(source, key, schema, family);
          after?.(data, source);
          return data;
        }
      : skipToken,
    staleTime,
    // Kept for the page's life in memory; the disk keeps it longer.
    gcTime: HOUR_MS,
    retry: retryPublished,
    // Read the saved copy even offline, then wait for the network to refetch.
    networkMode: "offlineFirst",
    persister: publishedPersister(family).persisterFn,
  });
}

/** A content-hashed file: never stale, since a change is a new key. */
export function publishedFile<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
) {
  return published(source, key, schema, family, Number.POSITIVE_INFINITY);
}

/**
 * A fixed-name pointer (a manifest): stale after `staleTime`, then refetched
 * on the next use, focus or reconnect. Each fetch drops the family's saved
 * files that `lists` no longer names.
 */
export function publishedPointer<S extends z.ZodType>(
  source: DataSource | null,
  key: string,
  schema: S,
  family: SchemaFamily,
  options: { staleTime: number; lists: (data: z.infer<S>) => string[] },
) {
  return published(
    source,
    key,
    schema,
    family,
    options.staleTime,
    (data, s) => {
      void prunePublished(
        family,
        s.kind,
        new Set([key, ...options.lists(data)]),
      );
    },
  );
}
