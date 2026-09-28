// Reviews' pages for /sitemap.xml (routes.ts), built from what's published:
// the course index for course pages, the PlanetTerp index for instructor
// pages, and our own minted instructors that have a published review. Each
// page's `lastmod` is the month of its newest review, ours or PlanetTerp's:
// a month, as readers see review dates (V2 §7.5), so the sitemap never
// says the day one of ours went up.

import { createdMonth } from "~/core/reviews";
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
import { latestPlanetTerpByPage } from "../reviews/planetterp";
import { latestPublishedByPage, mintedWithReviews } from "../reviews/store";

async function parsed<T>(
  files: PublishedFiles,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): Promise<T | null> {
  const result = schema.safeParse(await files.readJson(key));
  return result.success ? (result.data ?? null) : null;
}

/** Page key → the month of its newest review, from both sources. */
interface Latest {
  instructors: Map<string, string>;
  courses: Map<string, string>;
}

async function latestReviews(
  env: Pick<Env, "DB" | "REVIEWS_ENABLED">,
): Promise<Latest> {
  const ours =
    FeatureVarsSchema.parse(env).REVIEWS_ENABLED === "off"
      ? { instructors: new Map(), courses: new Map() }
      : await latestPublishedByPage(env.DB);
  const theirs = await latestPlanetTerpByPage(env.DB);
  const merge = (a: Map<string, string>, b: Map<string, string>) => {
    const out = new Map<string, string>();
    for (const map of [a, b])
      for (const [key, at] of map) {
        const month = createdMonth(at);
        const kept = out.get(key);
        if (!kept || month > kept) out.set(key, month);
      }
    return out;
  };
  return {
    instructors: merge(ours.instructors, theirs.instructors),
    courses: merge(ours.courses, theirs.courses),
  };
}

const entry = (path: string, lastModified: string | undefined) =>
  lastModified ? { path, lastModified } : { path };

async function courseEntries(
  files: PublishedFiles,
  latest: Latest,
): Promise<SitemapEntry[]> {
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
  return (search?.courses ?? []).map(([code]) =>
    entry(coursePath(code), latest.courses.get(code)),
  );
}

async function instructorEntries(
  env: Pick<Env, "DB" | "REVIEWS_ENABLED">,
  files: PublishedFiles,
  latest: Latest,
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
  return ids.map((id) => entry(instructorPath(id), latest.instructors.get(id)));
}

/** Every course page, then every instructor page. */
export async function reviewsSitemapEntries(
  env: Pick<Env, "DATA" | "DB" | "REVIEWS_ENABLED">,
): Promise<SitemapEntry[]> {
  const files = r2PublishedFiles(env.DATA);
  const latest = await latestReviews(env);
  const [courses, instructors] = await Promise.all([
    courseEntries(files, latest),
    instructorEntries(env, files, latest),
  ]);
  return [...courses, ...instructors];
}
