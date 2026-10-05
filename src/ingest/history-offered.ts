import { z } from "zod";
import {
  type OfferedSighting,
  offeredWindow,
  patchHistoryOffered,
} from "~/core/history";
import {
  CourseCodeSchema,
  CreditsSchema,
  HISTORY_MANIFEST_KEY,
  historyTermKey,
  IsoDateTimeSchema,
  JOBS_PREFIX,
  OFFERED_MANIFEST_KEY,
  offeredKey,
  SCHEMA_VERSIONS,
  type TermId,
  TermIdSchema,
} from "~/core/schema";
import {
  HistoryManifestSchema,
  type HistoryOffered,
  type HistoryOfferedManifest,
  HistoryOfferedManifestSchema,
  HistoryOfferedSchema,
} from "~/core/schema/history";
import type { BlobStore } from "./blob-store";
import {
  deleteOrphans,
  type Logger,
  readJson,
  readJsonOrNull,
  writeHashed,
  writeJson,
} from "./publish";

// The offered file (DATA.md §3.5, "Offered"): when each course runs, for
// Schedule's search to show courses the term doesn't have. Derived from the
// history's per-term records after each history run: a run reads only the
// terms whose record changed since the file was built (the manifest's
// `built`), so the first run reads the window's ~35 terms and later ones a
// term or two. Its keys are `offered/`, apart from `history/`, so a build
// that doesn't know the file never collects it.

/** Only what the offered file keeps of a term's record; the rest is stripped unvalidated. */
const TermCoursesSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSIONS.history),
  termId: TermIdSchema,
  courses: z.array(
    z.object({
      code: CourseCodeSchema,
      title: z.string().min(1).max(200).nullable(),
      credits: CreditsSchema.nullable(),
    }),
  ),
});

/** The offered file's orphans and when each was first seen (DATA.md §2.4). */
export const OFFERED_ORPHANS_KEY = `${JOBS_PREFIX}offered/orphans.json`;
const OrphansSchema = z.record(z.string(), IsoDateTimeSchema);

export interface PublishOfferedResult {
  /** Term records read this run. */
  terms: number;
  courses: number;
  written: number;
  deleted: number;
  errors: string[];
}

/**
 * Brings the offered file up to date with the history. Nothing to do when
 * every term in the window is the version it was built from. A term whose
 * record won't read is left out of this run's `built`, so the next run
 * reads it again; until then its column is the old one, or empty.
 */
export async function publishHistoryOffered(options: {
  store: BlobStore;
  now: Date;
  log: Logger;
}): Promise<PublishOfferedResult> {
  const { store, now, log } = options;
  const result: PublishOfferedResult = {
    terms: 0,
    courses: 0,
    written: 0,
    deleted: 0,
    errors: [],
  };
  const history = await readJson(
    store,
    HISTORY_MANIFEST_KEY,
    HistoryManifestSchema,
  );
  if (!history) return result;
  const hashes = new Map(history.terms.map((t) => [t.termId, t.hash]));
  const window = offeredWindow(hashes.keys());

  const manifest = await readJsonOrNull(
    store,
    OFFERED_MANIFEST_KEY,
    HistoryOfferedManifestSchema,
    log,
  );
  let previous: HistoryOffered | null = null;
  if (manifest) {
    try {
      previous = await readJson(
        store,
        offeredKey(manifest.hash),
        HistoryOfferedSchema,
      );
    } catch (error) {
      // Rebuilt from the history below, which has every term.
      result.errors.push(`offered ${manifest.hash}: ${String(error)}`);
    }
  }
  const built = previous ? (manifest?.built ?? {}) : {};
  const stale = window.filter((t) => built[t] !== hashes.get(t));
  const windowMoved =
    previous !== null &&
    JSON.stringify(previous.terms.filter((t) => window.includes(t))) !==
      JSON.stringify(previous.terms);
  if (stale.length === 0 && !windowMoved && previous) return result;

  // One term at a time: a term's record is a few MB of JSON.
  const reread = new Map<TermId, OfferedSighting[]>();
  const nextBuilt: Record<TermId, string> = {};
  for (const termId of window)
    if (!stale.includes(termId) && built[termId])
      nextBuilt[termId] = built[termId];
  for (const termId of stale) {
    const hash = hashes.get(termId);
    if (!hash) continue;
    try {
      const term = await readJson(
        store,
        historyTermKey(termId, hash),
        TermCoursesSchema,
      );
      if (!term) throw new Error(`${historyTermKey(termId, hash)} is missing`);
      reread.set(termId, term.courses);
      nextBuilt[termId] = hash;
      result.terms++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`offered ${termId}: ${message}`);
      log.error(`Left ${termId} out of the offered file this run`, {
        error: message,
      });
    }
  }

  const file = patchHistoryOffered(previous, {
    recorded: window,
    reread,
  });
  result.courses = file.courses.length;
  const { hash, written } = await writeHashed(
    store,
    HistoryOfferedSchema,
    file,
    offeredKey,
    "offered",
    // A file that didn't read is written again, even at the same hash.
    previous ? (manifest?.hash ?? null) : null,
  );
  if (written) result.written++;
  const next: HistoryOfferedManifest = {
    schemaVersion: SCHEMA_VERSIONS.history,
    generatedAt: now.toISOString(),
    hash,
    built: nextBuilt,
  };
  // Last, once the file it names is there.
  await writeJson(store, OFFERED_MANIFEST_KEY, next);

  const orphans = await deleteOrphans(
    store,
    "offered/",
    new Set([offeredKey(hash)]),
    (await readJsonOrNull(store, OFFERED_ORPHANS_KEY, OrphansSchema, log)) ??
      {},
    now,
  );
  result.deleted = orphans.deleted;
  await writeJson(store, OFFERED_ORPHANS_KEY, orphans.firstSeen);
  return result;
}
