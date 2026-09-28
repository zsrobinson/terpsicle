import type { QueryClient } from "@tanstack/react-query";
import {
  COURSE_INDEX_MANIFEST_KEY,
  type ContentHash,
  type CourseIndexDept,
  CourseIndexDeptSchema,
  type CourseIndexManifest,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  type CourseSearchRow,
  courseIndexDeptKey,
  courseSearchKey,
  type DeptCode,
} from "~/core/schema";
import { DataError, type DataSource } from "../data-source";
import { publishedFile, publishedPointer } from "./published";

// The course index (DATA.md §3.4, §5.2): every course in any term, for the
// four-year planner, as published-file queries (./published.ts). The
// manifest, then the search file (every course's row) and each
// department's file by hash, loaded only when asked for. Plan reads them
// through `~/features/four-year/data`; the scheduler never loads this
// module (scripts/check-bundle.ts).

/** The index changes at most every 6 hours: a checked manifest is fresh that long. */
export const COURSE_INDEX_STALE_MS = 6 * 60 * 60 * 1000;

/** `courses/manifest.json`: the search file's hash and each department's. */
export function courseIndexManifestQuery(source: DataSource | null) {
  return publishedPointer(
    source,
    COURSE_INDEX_MANIFEST_KEY,
    CourseIndexManifestSchema,
    "courses",
    {
      staleTime: COURSE_INDEX_STALE_MS,
      lists: (manifest) => [
        courseSearchKey(manifest.search.hash),
        ...manifest.departments.map((d) => courseIndexDeptKey(d.code, d.hash)),
      ],
      fileSchema: (key) =>
        key.startsWith("courses/search.")
          ? CourseSearchFileSchema
          : CourseIndexDeptSchema,
    },
  );
}

/** Every course's search row, at the hash the manifest lists (none: nothing to read). */
export function courseSearchQuery(
  source: DataSource | null,
  hash: ContentHash | undefined,
) {
  return publishedFile(
    hash ? source : null,
    hash ? courseSearchKey(hash) : "courses/search.none",
    CourseSearchFileSchema,
    "courses",
  );
}

/** A department's full entries, at the hash the manifest lists (none: nothing to read). */
export function courseIndexDeptQuery(
  source: DataSource | null,
  entry: { code: DeptCode; hash: ContentHash } | undefined,
) {
  return publishedFile(
    entry ? source : null,
    entry ? courseIndexDeptKey(entry.code, entry.hash) : "courses/dept/none",
    CourseIndexDeptSchema,
    "courses",
  );
}

/** Where a department is in the manifest; undefined when the index has none. */
export function manifestDept(
  manifest: CourseIndexManifest | undefined,
  dept: DeptCode,
): { code: DeptCode; hash: ContentHash } | undefined {
  return manifest?.departments.find((d) => d.code === dept);
}

const isMissing = (error: unknown) =>
  error instanceof DataError && error.reason === "missing";

/**
 * Runs `load` against the manifest the cache has (from disk at once, if
 * saved). A saved manifest can name a file the server has since deleted:
 * then it asks the server for the manifest and tries once more. For code
 * outside React (an import, a pick); hooks get this by the new hash being
 * a new key.
 */
async function withManifest<T>(
  client: QueryClient,
  source: DataSource,
  load: (manifest: CourseIndexManifest) => Promise<T>,
): Promise<T> {
  const query = courseIndexManifestQuery(source);
  const manifest = await client.ensureQueryData(query);
  try {
    return await load(manifest);
  } catch (error) {
    if (!isMissing(error)) throw error;
    const fresh = await client.fetchQuery({ ...query, staleTime: 0 });
    if (fresh === manifest) throw error;
    return load(fresh);
  }
}

/**
 * Loads these departments' files, outside React. A department the index
 * doesn't list maps to null: nothing of it was ever seen.
 */
export async function ensureIndexDepts(
  client: QueryClient,
  source: DataSource,
  depts: readonly DeptCode[],
): Promise<Map<DeptCode, CourseIndexDept | null>> {
  const unique = [...new Set(depts)];
  const files = await withManifest(client, source, (manifest) =>
    Promise.all(
      unique.map(async (dept) => {
        const entry = manifestDept(manifest, dept);
        return entry
          ? client.ensureQueryData(courseIndexDeptQuery(source, entry))
          : null;
      }),
    ),
  );
  return new Map(unique.map((dept, i) => [dept, files[i] ?? null]));
}

/** Every course's search row, outside React. */
export async function ensureCourseSearch(
  client: QueryClient,
  source: DataSource,
): Promise<readonly CourseSearchRow[]> {
  const file = await withManifest(client, source, (manifest) =>
    client.ensureQueryData(courseSearchQuery(source, manifest.search.hash)),
  );
  return file.courses;
}
