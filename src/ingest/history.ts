import { z } from "zod";
import {
  historyCoursesFromChunk,
  historySourceCounts,
  mergeHistoryTerm,
  patchHistoryDept,
} from "~/core/history";
import {
  type ContentHash,
  CourseSchema,
  type DeptCode,
  DeptCodeSchema,
  deptChunkKey,
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  historyTermKey,
  IsoDateTimeSchema,
  JOBS_PREFIX,
  type Manifest,
  ManifestSchema,
  manifestKey,
  SCHEMA_VERSIONS,
  SectionSchema,
  TERMS_KEY,
  type TermId,
  TermIdSchema,
  TermsFileSchema,
} from "~/core/schema";
import {
  type HistoryCourse,
  type HistoryDept,
  HistoryDeptSchema,
  type HistoryManifest,
  HistoryManifestSchema,
  type HistoryTerm,
  HistoryTermSchema,
} from "~/core/schema/history";
import type { BlobStore } from "./blob-store";
import { MAX_CONCURRENCY, mapLimit } from "./http";
import {
  deleteOrphans,
  type Logger,
  readJson,
  readJsonOrNull,
  updatePointer,
  writeHashed,
  writeJson,
} from "./publish";

// Instructor history (DATA.md §3.5): our own permanent record of who taught
// what in each term. `publishHistory` merges new sightings into the per-term
// files, patches the department files readers use, and rewrites the
// manifest (the index). `snapshotHistory` is the history job: it copies
// every term's changed department chunks out of the catalog before Testudo
// forgets the term. The PlanetTerp backfill (history-backfill.ts) calls
// `publishHistory` too.

export interface HistoryUpdate {
  termId: TermId;
  courses: readonly HistoryCourse[];
}

export interface PublishHistoryResult {
  terms: number;
  departments: number;
  written: number;
  deleted: number;
  /** Terms and departments whose files couldn't be read, so nothing was merged into them. */
  failedTerms: TermId[];
  failedDepts: DeptCode[];
  errors: string[];
}

/** The history's orphaned hashed files and when each was first seen (DATA.md §2.4). */
export const HISTORY_ORPHANS_KEY = `${JOBS_PREFIX}history/orphans.json`;
const OrphansSchema = z.record(z.string(), IsoDateTimeSchema);

/**
 * Thrown when the manifest can't be read: it's the only index of a record
 * nothing can rebuild, so nothing is written until someone looks.
 */
export class HistoryUnreadableError extends Error {
  constructor(detail: string) {
    super(
      `The history's manifest can't be read, so nothing was written: ${detail}`,
    );
    this.name = "HistoryUnreadableError";
  }
}

/**
 * Merges each update into its term's record (DATA.md §3.5's rules), then
 * patches the departments it touched, then writes the manifest. Hashed
 * files first, the manifest last, and only when something changed. A term
 * or department whose file won't read is left alone and reported, so the
 * caller can try it again.
 */
export async function publishHistory(options: {
  store: BlobStore;
  now: Date;
  log: Logger;
  updates: readonly HistoryUpdate[];
}): Promise<PublishHistoryResult> {
  const { store, now, log } = options;
  const result: PublishHistoryResult = {
    terms: 0,
    departments: 0,
    written: 0,
    deleted: 0,
    failedTerms: [],
    failedDepts: [],
    errors: [],
  };
  let previous: HistoryManifest | null;
  try {
    previous = await readJson(
      store,
      HISTORY_MANIFEST_KEY,
      HistoryManifestSchema,
    );
  } catch (error) {
    throw new HistoryUnreadableError(String(error));
  }
  // No manifest but term files: the index was lost, not never written.
  // Starting empty would orphan every term, and the 24 h collection would
  // then delete them.
  if (!previous && (await store.list("history/term/")).length > 0)
    throw new HistoryUnreadableError(
      `${HISTORY_MANIFEST_KEY} is missing, but history/term/ has files`,
    );
  const termHash = new Map(previous?.terms.map((t) => [t.termId, t]) ?? []);
  const deptHash = new Map(
    previous?.departments.map((d) => [d.code, d.hash]) ?? [],
  );

  // Updates for one term join, in order, before its file is read.
  const incoming = new Map<TermId, HistoryCourse[]>();
  for (const update of options.updates) {
    const list = incoming.get(update.termId) ?? [];
    list.push(...update.courses);
    incoming.set(update.termId, list);
  }

  // 1. Terms, oldest first so a department's titles settle on the newest.
  const merged: HistoryTerm[] = [];
  const nextTerms = new Map(termHash);
  for (const termId of [...incoming.keys()].sort()) {
    const courses = incoming.get(termId) ?? [];
    if (courses.length === 0) continue;
    const prior = termHash.get(termId)?.hash ?? null;
    try {
      let existing: HistoryTerm | null = null;
      if (prior) {
        existing = await readJson(
          store,
          historyTermKey(termId, prior),
          HistoryTermSchema,
        );
        // The manifest names it, so a missing file is a loss, not a start.
        if (!existing)
          throw new Error(`${historyTermKey(termId, prior)} is missing`);
      }
      const term = mergeHistoryTerm(existing, termId, courses);
      const { hash, written } = await writeHashed(
        store,
        HistoryTermSchema,
        term,
        (h) => historyTermKey(termId, h),
        `history ${termId}`,
        prior,
      );
      if (written) result.written++;
      nextTerms.set(termId, {
        termId,
        hash,
        courses: historySourceCounts(term),
      });
      merged.push(term);
      result.terms++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failedTerms.push(termId);
      result.errors.push(`history ${termId}: ${message}`);
      log.error(`Left the history of ${termId} as it was`, { error: message });
    }
  }

  // 2. Each department any merged course is in, patched term by term.
  const touched = new Set<DeptCode>();
  for (const term of merged)
    for (const course of incoming.get(term.termId) ?? [])
      touched.add(course.code.slice(0, 4));
  const nextDepts = new Map(deptHash);
  const depts = [...touched].sort();
  await mapLimit(depts, MAX_CONCURRENCY, async (dept) => {
    const prior = deptHash.get(dept) ?? null;
    try {
      let file: HistoryDept | null = null;
      if (prior) {
        file = await readJson(
          store,
          historyDeptKey(dept, prior),
          HistoryDeptSchema,
        );
        if (!file) throw new Error(`${historyDeptKey(dept, prior)} is missing`);
      }
      for (const term of merged) {
        const courses = term.courses.filter((c) => c.code.startsWith(dept));
        file = patchHistoryDept(file, dept, term.termId, courses);
      }
      if (!file) return;
      const { hash, written } = await writeHashed(
        store,
        HistoryDeptSchema,
        file,
        (h) => historyDeptKey(dept, h),
        `history ${dept}`,
        prior,
      );
      if (written) result.written++;
      nextDepts.set(dept, hash);
      result.departments++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failedDepts.push(dept);
      result.errors.push(`history ${dept}: ${message}`);
      log.error(`Left the history of ${dept} as it was`, { error: message });
    }
  });

  const manifest: HistoryManifest = {
    schemaVersion: SCHEMA_VERSIONS.history,
    generatedAt: now.toISOString(),
    terms: [...nextTerms.values()].sort((a, b) =>
      a.termId < b.termId ? 1 : -1,
    ),
    departments: [...nextDepts]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([code, hash]) => ({ code, hash })),
  };
  await updatePointer(
    store,
    HISTORY_MANIFEST_KEY,
    HistoryManifestSchema,
    (current) => {
      // Someone else (the backfill, or the job) wrote in between: this
      // run's merges started from files that are no longer current.
      if (JSON.stringify(current) !== JSON.stringify(previous))
        throw new Error(
          "The history changed while this run merged; it'll merge again next run",
        );
      return current &&
        JSON.stringify(current.terms) === JSON.stringify(manifest.terms) &&
        JSON.stringify(current.departments) ===
          JSON.stringify(manifest.departments)
        ? null
        : manifest;
    },
  );

  const referenced = new Set([
    ...manifest.terms.map((t) => historyTermKey(t.termId, t.hash)),
    ...manifest.departments.map((d) => historyDeptKey(d.code, d.hash)),
  ]);
  const orphans = await deleteOrphans(
    store,
    "history/",
    referenced,
    (await readJsonOrNull(store, HISTORY_ORPHANS_KEY, OrphansSchema, log)) ??
      {},
    now,
  );
  result.deleted = orphans.deleted;
  await writeJson(store, HISTORY_ORPHANS_KEY, orphans.firstSeen);
  return result;
}

// ---------- the history job ----------

/**
 * Job state: per term, the chunk each department was last copied from and
 * its section count (the manifest's), the baseline for `MIN_SECTION_SHARE`.
 */
export const HISTORY_STATE_KEY = `${JOBS_PREFIX}history/state.json`;
const HistoryStateSchema = z.object({
  copied: z.record(
    TermIdSchema,
    z.record(
      DeptCodeSchema,
      z.object({ hash: z.string(), sections: z.number().int().min(0) }),
    ),
  ),
});
type HistoryState = z.infer<typeof HistoryStateSchema>;

/**
 * Department chunks read per run. A first run has every term's catalog to
 * copy (about 200 chunks a term); this spreads it over a few runs, active
 * terms first, and keeps each run's R2 reads bounded.
 */
export const MAX_HISTORY_CHUNKS = 600;

/**
 * A chunk with fewer than this share of the sections it had when last
 * copied is held back, not copied: a truncated sections answer publishes
 * courses with no sections, and if that were a term's last crawl its
 * instructors would be lost (DATA.md §4.1). It stays held, and reported,
 * until its count recovers or someone runs the job with `force`.
 */
export const MIN_SECTION_SHARE = 0.75;

/** Only the fields the history keeps; the rest of a chunk is stripped unvalidated. */
const HistoryChunkSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSIONS.catalog),
  courses: z.array(
    CourseSchema.pick({ code: true, title: true, credits: true }).extend({
      sections: z.array(SectionSchema.pick({ code: true, instructors: true })),
    }),
  ),
});

export interface SnapshotHistoryResult {
  /** Terms whose catalog could be read. */
  terms: number;
  /** Department chunks copied this run. */
  chunks: number;
  /** Changed chunks left for the next run (over `maxChunks`). */
  pending: number;
  /** Changed chunks held back because their section count dropped sharply. */
  held: number;
  courses: number;
  written: number;
  deleted: number;
  errors: string[];
}

/**
 * The history job: for every term in `terms.json` (active ones first, then
 * archived ones), copies each department chunk that changed since it was
 * last copied into the history. So a term is recorded while Testudo lists
 * it, and its last sighting stays after Testudo drops it.
 */
export async function snapshotHistory(options: {
  store: BlobStore;
  now: Date;
  log: Logger;
  maxChunks?: number;
  /** Copy chunks whose section count dropped sharply too (someone checked). */
  force?: boolean;
}): Promise<SnapshotHistoryResult> {
  const { store, now, log } = options;
  const maxChunks = options.maxChunks ?? MAX_HISTORY_CHUNKS;
  const result: SnapshotHistoryResult = {
    terms: 0,
    chunks: 0,
    pending: 0,
    held: 0,
    courses: 0,
    written: 0,
    deleted: 0,
    errors: [],
  };
  const termsFile = await readJson(store, TERMS_KEY, TermsFileSchema);
  if (!termsFile) return result;
  const state: HistoryState = (await readJsonOrNull(
    store,
    HISTORY_STATE_KEY,
    HistoryStateSchema,
    log,
  )) ?? { copied: {} };

  const order = [
    ...termsFile.terms.filter((t) => t.status === "active"),
    ...termsFile.terms.filter((t) => t.status !== "active"),
  ].map((t) => t.id);
  const todo: {
    termId: TermId;
    dept: DeptCode;
    hash: ContentHash;
    sections: number;
  }[] = [];
  for (const termId of order) {
    let manifest: Manifest | null;
    try {
      manifest = await readJson(store, manifestKey(termId), ManifestSchema);
    } catch (error) {
      // An archived term from before a catalog schema bump: what we copied
      // while it was readable stays in the history.
      result.errors.push(`${termId}: ${String(error)}`);
      continue;
    }
    if (!manifest) continue;
    result.terms++;
    for (const d of manifest.departments) {
      const last = state.copied[termId]?.[d.code];
      if (last?.hash === d.hash) continue;
      if (
        last &&
        !options.force &&
        d.sectionCount < last.sections * MIN_SECTION_SHARE
      ) {
        result.held++;
        result.errors.push(
          `history ${termId} ${d.code}: held back, ${d.sectionCount} sections where the last copy had ${last.sections}`,
        );
        continue;
      }
      todo.push({
        termId,
        dept: d.code,
        hash: d.hash,
        sections: d.sectionCount,
      });
    }
  }
  const batch = todo.slice(0, maxChunks);
  result.pending = todo.length - batch.length;
  if (batch.length === 0) return result;

  const read = await mapLimit(batch, MAX_CONCURRENCY, async (chunk) => {
    const key = deptChunkKey(chunk.termId, chunk.dept, chunk.hash);
    try {
      const file = await readJson(store, key, HistoryChunkSchema);
      if (!file) throw new Error(`${key} is missing`);
      return { ...chunk, courses: historyCoursesFromChunk(file.courses) };
    } catch (error) {
      result.errors.push(`history ${key}: ${String(error)}`);
      return null;
    }
  });
  const copied = read.filter((r) => r !== null);
  result.chunks = copied.length;
  result.courses = copied.reduce((n, r) => n + r.courses.length, 0);

  const published = await publishHistory({
    store,
    now,
    log,
    updates: copied.map((r) => ({ termId: r.termId, courses: r.courses })),
  });
  result.written = published.written;
  result.deleted = published.deleted;
  result.errors.push(...published.errors);

  // Record only what reached both the term's file and its department's, so
  // anything that failed is copied again next run.
  const failedTerms = new Set(published.failedTerms);
  const failedDepts = new Set(published.failedDepts);
  const next: HistoryState = { copied: {} };
  const live = new Set(order);
  for (const [termId, depts] of Object.entries(state.copied))
    if (live.has(termId)) next.copied[termId] = { ...depts };
  for (const r of copied) {
    if (failedTerms.has(r.termId) || failedDepts.has(r.dept)) continue;
    next.copied[r.termId] = {
      ...next.copied[r.termId],
      [r.dept]: { hash: r.hash, sections: r.sections },
    };
  }
  await writeJson(store, HISTORY_STATE_KEY, next);
  return result;
}
