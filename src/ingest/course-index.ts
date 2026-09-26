import { z } from "zod";
import {
  buildCourseIndexDept,
  buildCourseSearchFile,
  type CourseIndexSource,
  courseIndexTermOrder,
  courseSearchRow,
} from "~/core/catalog";
import {
  COURSE_INDEX_MANIFEST_KEY,
  type ContentHash,
  CourseIndexDeptSchema,
  type CourseIndexManifest,
  CourseIndexManifestSchema,
  CourseSchema,
  CourseSearchFileSchema,
  type CourseSearchRow,
  courseIndexDeptKey,
  courseSearchKey,
  type DeptCode,
  DeptCodeSchema,
  deptChunkKey,
  IsoDateTimeSchema,
  JOBS_PREFIX,
  type Manifest,
  ManifestSchema,
  manifestKey,
  SCHEMA_VERSIONS,
  TERMS_KEY,
  type TermId,
  TermIdSchema,
  TermsFileSchema,
} from "~/core/schema";
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

// The course index (DATA.md §3.4), published by the catalog job after its
// crawl: every course in every term whose catalog is still in R2 (active
// terms and archived ones), from the department chunks already there.
// Nothing is fetched from Testudo for it. A department is rebuilt only when
// one of its chunks changed; the rest keep their file and hash.

export interface CourseIndexOptions {
  store: BlobStore;
  now: Date;
  log: Logger;
}

export interface CourseIndexResult {
  /** Terms whose catalog fed the index. */
  terms: number;
  departments: number;
  courses: number;
  /** Department files rebuilt from their chunks this run. */
  rebuilt: number;
  /** Files written (a rebuilt department can come out the same). */
  written: number;
  deleted: number;
  errors: string[];
}

/** Job state: what each department file was built from, and orphans awaiting deletion. */
export const COURSE_INDEX_STATE_KEY = `${JOBS_PREFIX}courses/state.json`;
const CourseIndexStateSchema = z.object({
  /** Per department, the `<term>:<chunk hash>` list its file was built from. */
  inputs: z.record(DeptCodeSchema, z.string()),
  /** Unreferenced hashed files under `courses/` and when each was first seen. */
  orphans: z.record(z.string(), IsoDateTimeSchema),
});
type CourseIndexState = z.infer<typeof CourseIndexStateSchema>;

/**
 * A department chunk read for the index: only the course fields it keeps
 * (unknown keys are stripped), so sections aren't validated a second time.
 */
const SourceChunkSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSIONS.catalog),
  termId: TermIdSchema,
  courses: z.array(
    CourseSchema.pick({
      code: true,
      title: true,
      credits: true,
      genEds: true,
      prerequisite: true,
      corequisite: true,
      restriction: true,
      crossListings: true,
    }),
  ),
});

interface DeptResult {
  code: DeptCode;
  hash: ContentHash;
  rows: CourseSearchRow[];
  /** Set when the file matches its chunks; a department that kept an old file isn't recorded, so it retries. */
  inputs: string | null;
}

export async function publishCourseIndex(
  options: CourseIndexOptions,
): Promise<CourseIndexResult> {
  const { store, now, log } = options;
  const result: CourseIndexResult = {
    terms: 0,
    departments: 0,
    courses: 0,
    rebuilt: 0,
    written: 0,
    deleted: 0,
    errors: [],
  };
  const termsFile = await readJson(store, TERMS_KEY, TermsFileSchema);
  if (!termsFile) return result;

  // Each department's chunks, in the order that decides whose text wins.
  const sources = new Map<DeptCode, { termId: TermId; hash: ContentHash }[]>();
  for (const termId of courseIndexTermOrder(termsFile.terms)) {
    let manifest: Manifest | null;
    try {
      manifest = await readJson(store, manifestKey(termId), ManifestSchema);
    } catch (error) {
      // An archived term from before a catalog schema bump can't be read,
      // by us or by the app. It drops out until someone republishes it.
      result.errors.push(`${termId}: ${String(error)}`);
      continue;
    }
    if (!manifest) continue;
    result.terms++;
    for (const d of manifest.departments) {
      const list = sources.get(d.code) ?? [];
      list.push({ termId, hash: d.hash });
      sources.set(d.code, list);
    }
  }
  // Never replace an index with an empty one (DATA.md §4.1's rule).
  if (sources.size === 0) {
    result.errors.push("No term's catalog could be read; left the index alone");
    return result;
  }

  const previous = await readJson(
    store,
    COURSE_INDEX_MANIFEST_KEY,
    CourseIndexManifestSchema,
  ).catch((error: unknown) => {
    // Unreadable or an older schema version: rebuild every department.
    log.warn("Rebuilding the course index", { error: String(error) });
    return null;
  });
  const previousHash = new Map(
    (previous?.departments ?? []).map((d) => [d.code, d.hash]),
  );
  const state = previous
    ? await readJsonOrNull(
        store,
        COURSE_INDEX_STATE_KEY,
        CourseIndexStateSchema,
        log,
      )
    : null;

  const depts = [...sources.keys()].sort();
  const built = await mapLimit(depts, MAX_CONCURRENCY, async (dept) => {
    const inputs = (sources.get(dept) ?? [])
      .map((s) => `${s.termId}:${s.hash}`)
      .join(",");
    const prior = previousHash.get(dept) ?? null;
    const keep = async (): Promise<DeptResult | null> => {
      if (!prior) return null;
      const file = await readJson(
        store,
        courseIndexDeptKey(dept, prior),
        CourseIndexDeptSchema,
      ).catch(() => null);
      return file
        ? {
            code: dept,
            hash: prior,
            rows: file.courses.map(courseSearchRow),
            inputs: null,
          }
        : null;
    };
    if (prior && state?.inputs[dept] === inputs) {
      const kept = await keep();
      if (kept) return { ...kept, inputs };
    }
    try {
      const chunks: CourseIndexSource[] = [];
      for (const source of sources.get(dept) ?? []) {
        const key = deptChunkKey(source.termId, dept, source.hash);
        const chunk = await readJson(store, key, SourceChunkSchema);
        if (!chunk) throw new Error(`${key} is missing`);
        chunks.push({ termId: source.termId, courses: chunk.courses });
      }
      const file = buildCourseIndexDept(dept, chunks);
      const { hash, written } = await writeHashed(
        store,
        CourseIndexDeptSchema,
        file,
        (h) => courseIndexDeptKey(dept, h),
        `course index ${dept}`,
        prior,
      );
      result.rebuilt++;
      if (written) result.written++;
      return {
        code: dept,
        hash,
        rows: file.courses.map(courseSearchRow),
        inputs,
      } satisfies DeptResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`courses ${dept}: ${message}`);
      log.error(`Kept the previous course index for ${dept}`, {
        error: message,
      });
      return keep();
    }
  });
  const entries = built.filter((d): d is DeptResult => d !== null);
  if (entries.length === 0) {
    result.errors.push("No department could be indexed; left the index alone");
    return result;
  }

  const rows = entries.flatMap((d) => d.rows);
  const search = await writeHashed(
    store,
    CourseSearchFileSchema,
    buildCourseSearchFile(rows),
    courseSearchKey,
    "course search",
    previous?.search.hash ?? null,
  );
  if (search.written) result.written++;
  result.departments = entries.length;
  result.courses = rows.length;

  const departments = entries.map((d) => ({ code: d.code, hash: d.hash }));
  const manifest: CourseIndexManifest = {
    schemaVersion: SCHEMA_VERSIONS.courses,
    generatedAt: now.toISOString(),
    search: { hash: search.hash },
    departments,
  };
  // Hashed files first, the manifest last, and only when the index changed:
  // its `generatedAt` is when the index last did.
  await updatePointer(
    store,
    COURSE_INDEX_MANIFEST_KEY,
    CourseIndexManifestSchema,
    (current) =>
      current &&
      current.search.hash === manifest.search.hash &&
      JSON.stringify(current.departments) === JSON.stringify(departments)
        ? null
        : manifest,
  );

  const referenced = new Set([
    courseSearchKey(search.hash),
    ...departments.map((d) => courseIndexDeptKey(d.code, d.hash)),
  ]);
  const orphans = await deleteOrphans(
    store,
    "courses/",
    referenced,
    state?.orphans ?? {},
    now,
  );
  result.deleted = orphans.deleted;
  const next: CourseIndexState = {
    inputs: Object.fromEntries(
      entries.flatMap((d) => (d.inputs ? [[d.code, d.inputs]] : [])),
    ),
    orphans: orphans.firstSeen,
  };
  await writeJson(store, COURSE_INDEX_STATE_KEY, next);
  return result;
}
