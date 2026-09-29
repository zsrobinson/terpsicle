import { queryOptions, skipToken } from "@tanstack/react-query";
import { taughtBy, whoTaught } from "~/core/history";
import {
  type ContentHash,
  type DeptCode,
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  type TermId,
} from "~/core/schema";
import {
  type HistoryDept,
  HistoryDeptSchema,
  type HistoryManifest,
  HistoryManifestSchema,
  type HistoryOffering,
} from "~/core/schema/history";
import type { DataSource } from "../data-source";
import { publishedFile, publishedPointer } from "./published";

// Instructor history (DATA.md §3.5): who taught which course in each term,
// as published-file queries (./published.ts). The manifest, then one
// department's file by its hash. Nothing reads it yet; Reviews and Plan
// will, through these factories:
// - Reviews' course page: `historyDeptQuery` for the course's department,
//   then `courseOfferings` (~/core/history) for a per-term list of who
//   taught it, and `whoTaught` for "You took it with …" from a plan's term.
// - Reviews' instructor page: `taughtByQuery` over the instructor's
//   departments (PlanetTerp's index) with every spelling of their name.
// - Plan: `whoTaughtQuery` for a course a student took in a past term.

/** The job runs every 6 hours: a checked manifest is fresh that long. */
export const HISTORY_MANIFEST_STALE_MS = 6 * 60 * 60 * 1000;

/** `history/manifest.json`: every term on record and each department's file. */
export function historyManifestQuery(source: DataSource | null) {
  return publishedPointer(
    source,
    HISTORY_MANIFEST_KEY,
    HistoryManifestSchema,
    "history",
    {
      staleTime: HISTORY_MANIFEST_STALE_MS,
      // Department files only: the per-term files are the record, not a read path.
      lists: (manifest) =>
        manifest.departments.map((d) => historyDeptKey(d.code, d.hash)),
      fileSchema: () => HistoryDeptSchema,
    },
  );
}

/** A department's history, at the hash its manifest lists (none: nothing to read). */
export function historyDeptQuery(
  source: DataSource | null,
  entry: { code: DeptCode; hash: ContentHash } | undefined,
) {
  return publishedFile(
    entry ? source : null,
    entry ? historyDeptKey(entry.code, entry.hash) : "history/dept/none",
    HistoryDeptSchema,
    "history",
  );
}

/** Where a department is in the manifest; undefined when the history has none. */
export function historyDept(
  manifest: HistoryManifest | undefined,
  dept: DeptCode,
): { code: DeptCode; hash: ContentHash } | undefined {
  return manifest?.departments.find((d) => d.code === dept);
}

/**
 * Who taught `course` in `termId`: that term's record (its source, names
 * and sections), or null when there's none, including when its department
 * has no history at all. Waits for the manifest; reads the department's
 * file through its own query, so the two share a cache.
 */
export function whoTaughtQuery(
  source: DataSource | null,
  manifest: HistoryManifest | undefined,
  course: string,
  termId: TermId,
) {
  const entry = historyDept(manifest, course.slice(0, 4));
  const file = historyDeptQuery(source, entry);
  return queryOptions({
    queryKey: ["history", "who-taught", file.queryKey, course, termId] as const,
    queryFn:
      source && manifest
        ? async ({ client }): Promise<HistoryOffering | null> =>
            entry
              ? whoTaught(await client.ensureQueryData(file), course, termId)
              : null
        : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * What an instructor taught, newest term first: every course and term in
 * `depts` where any of `names` appears (Testudo's and PlanetTerp's
 * spellings can differ). A department missing from the history is skipped.
 */
export function taughtByQuery(
  source: DataSource | null,
  manifest: HistoryManifest | undefined,
  depts: readonly DeptCode[],
  names: readonly string[],
) {
  const entries = [...new Set(depts)]
    .sort()
    .map((d) => historyDept(manifest, d))
    .filter((e) => e !== undefined);
  const files = entries.map((e) => historyDeptQuery(source, e));
  return queryOptions({
    queryKey: [
      "history",
      "taught-by",
      files.map((f) => f.queryKey[2]),
      [...names].sort(),
    ] as const,
    queryFn:
      source && manifest
        ? async ({ client }) => {
            const loaded: HistoryDept[] = await Promise.all(
              files.map((f) => client.ensureQueryData(f)),
            );
            return taughtBy(loaded, names);
          }
        : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
