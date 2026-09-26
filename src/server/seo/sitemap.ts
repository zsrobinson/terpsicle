// Reviews' pages for /sitemap.xml (routes.ts), built from what's published:
// the course index for course pages, the PlanetTerp index for instructor
// pages, and our own minted instructors that have a published review.

import type { PublishedFiles } from "~/core/routing";
import {
  COURSE_INDEX_MANIFEST_KEY,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  courseSearchKey,
  FeatureVarsSchema,
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpIndexSchema,
  PlanetTerpManifestSchema,
  planetTerpIndexKey,
} from "~/core/schema";
import { coursePath, instructorPath, type SitemapEntry } from "~/core/seo";
import { r2PublishedFiles } from "../pages/context";
import { mintedWithReviews } from "../reviews/store";

async function parsed<T>(
  files: PublishedFiles,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): Promise<T | null> {
  const result = schema.safeParse(await files.readJson(key));
  return result.success ? (result.data ?? null) : null;
}

async function courseEntries(files: PublishedFiles): Promise<SitemapEntry[]> {
  const manifest = await parsed(
    files,
    COURSE_INDEX_MANIFEST_KEY,
    CourseIndexManifestSchema,
  );
  if (!manifest) return [];
  const search = await parsed(
    files,
    courseSearchKey(manifest.search.hash),
    CourseSearchFileSchema,
  );
  return (search?.courses ?? []).map(([code]) => ({ path: coursePath(code) }));
}

async function instructorEntries(
  env: Pick<Env, "DB" | "REVIEWS_ENABLED">,
  files: PublishedFiles,
): Promise<SitemapEntry[]> {
  const manifest = await parsed(
    files,
    PLANETTERP_MANIFEST_KEY,
    PlanetTerpManifestSchema,
  );
  const index = manifest?.index
    ? await parsed(
        files,
        planetTerpIndexKey(manifest.index.hash),
        PlanetTerpIndexSchema,
      )
    : null;
  const ids = Object.keys(index?.instructors ?? {});
  if (FeatureVarsSchema.parse(env).REVIEWS_ENABLED !== "off")
    ids.push(...(await mintedWithReviews(env.DB)));
  return ids.map((id) => ({ path: instructorPath(id) }));
}

/** Every course page, then every instructor page. */
export async function reviewsSitemapEntries(
  env: Pick<Env, "DATA" | "DB" | "REVIEWS_ENABLED">,
): Promise<SitemapEntry[]> {
  const files = r2PublishedFiles(env.DATA);
  const [courses, instructors] = await Promise.all([
    courseEntries(files),
    instructorEntries(env, files),
  ]);
  return [...courses, ...instructors];
}
