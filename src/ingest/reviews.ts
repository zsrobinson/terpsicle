import { z } from "zod";
import {
  IsoDateTimeSchema,
  JOBS_PREFIX,
  REVIEWS_MANIFEST_KEY,
  type ReviewsDept,
  ReviewsDeptSchema,
  type ReviewsManifest,
  ReviewsManifestSchema,
  reviewsDeptKey,
  SCHEMA_VERSIONS,
  WireEnvelopeSchema,
} from "~/core/schema";
import type { BlobStore } from "./blob-store";
import {
  deleteOrphans,
  type Logger,
  readJson,
  readJsonOrNull,
  updatePointer,
  writeHashed,
  writeJson,
} from "./publish";

// Publishes Terpsicle reviews' numbers (R2 family `reviews/`, V2 §7.6,
// DATA.md §4.6) by the rules in DATA.md §2: a department's file is written
// only when its bytes changed, the manifest last and only when a hash did,
// and files no manifest lists are deleted after the catalog's 24 h grace.
// The caller builds the files (`buildReviewsDepts`); this never sees text.

export interface ReviewsPublishOptions {
  store: BlobStore;
  now: Date;
  log: Logger;
  /** Every department with something in it, from `buildReviewsDepts`. */
  depts: readonly ReviewsDept[];
}

export interface ReviewsPublishResult {
  departments: number;
  instructors: number;
  /** Department files written (the rest kept their hash). */
  written: number;
  /** Departments dropped because nothing in them is published any more. */
  dropped: number;
  deleted: number;
  manifestChanged: boolean;
}

/** Job state: unreferenced files under `reviews/` and when each was first seen. */
export const REVIEWS_STATE_KEY = `${JOBS_PREFIX}reviews/state.json`;
const ReviewsStateSchema = z.object({
  orphans: z.record(z.string(), IsoDateTimeSchema),
});

export async function publishReviews(
  options: ReviewsPublishOptions,
): Promise<ReviewsPublishResult> {
  const { store, now, log, depts } = options;
  const previous = await readJson(
    store,
    REVIEWS_MANIFEST_KEY,
    ReviewsManifestSchema,
  ).catch((error: unknown) => {
    // Unreadable or an older schema version: write every department again.
    log.warn("Republishing every reviews file", { error: String(error) });
    return null;
  });
  const previousHash = new Map(
    (previous?.departments ?? []).map((d) => [d.code, d.hash]),
  );

  const departments: ReviewsManifest["departments"] = [];
  let written = 0;
  let instructors = 0;
  for (const dept of [...depts].sort((a, b) => (a.dept < b.dept ? -1 : 1))) {
    // An empty department is never published: its numbers are simply gone.
    const count = Object.keys(dept.instructors).length;
    if (count === 0 && Object.keys(dept.names).length === 0) continue;
    // Validated before it's written; a file that doesn't match throws, and
    // the manifest keeps pointing at the last good files.
    const result = await writeHashed(
      store,
      ReviewsDeptSchema,
      dept,
      (h) => reviewsDeptKey(dept.dept, h),
      `reviews ${dept.dept}`,
      previousHash.get(dept.dept) ?? null,
    );
    if (result.written) written++;
    instructors += count;
    departments.push({ code: dept.dept, hash: result.hash });
  }
  const listed = new Set(departments.map((d) => d.code));
  const dropped = [...previousHash.keys()].filter((c) => !listed.has(c));

  const manifest: ReviewsManifest = {
    schemaVersion: SCHEMA_VERSIONS.reviews,
    generatedAt: now.toISOString(),
    departments,
  };
  let manifestChanged = false;
  // Hashed files first, the manifest last, and only when a department
  // changed: its `generatedAt` is when the numbers last did.
  await updatePointer(
    store,
    REVIEWS_MANIFEST_KEY,
    // A manifest of another schema version is replaced, not a failure.
    z.union([ReviewsManifestSchema, WireEnvelopeSchema]),
    (current) => {
      manifestChanged = false;
      if (
        current &&
        "departments" in current &&
        JSON.stringify(current.departments) === JSON.stringify(departments)
      )
        return null;
      manifestChanged = true;
      return manifest;
    },
  );

  const state = await readJsonOrNull(
    store,
    REVIEWS_STATE_KEY,
    ReviewsStateSchema,
    log,
  );
  const orphans = await deleteOrphans(
    store,
    "reviews/",
    new Set(departments.map((d) => reviewsDeptKey(d.code, d.hash))),
    state?.orphans ?? {},
    now,
  );
  await writeJson(store, REVIEWS_STATE_KEY, { orphans: orphans.firstSeen });

  return {
    departments: departments.length,
    instructors,
    written,
    dropped: dropped.length,
    deleted: orphans.deleted,
    manifestChanged,
  };
}
