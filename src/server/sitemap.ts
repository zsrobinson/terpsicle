// /sitemap.xml: the site's pages (SITE_PAGES), then Reviews' public ones,
// built from what's published: the course index for course pages, the
// PlanetTerp index for instructor pages, and our own minted instructors that
// have a published review. Workers Cache keeps it for an hour (the files
// behind it change nightly at most). robots.txt names it (seo/routes.ts).

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
import {
  coursePath,
  instructorPath,
  SITE_PAGES,
  SITEMAP_MAX_URLS,
  type SitemapEntry,
  sitemapXml,
} from "~/core/seo";
import { APEX_HOST } from "./apex";
import { r2PublishedFiles } from "./pages/context";
import { mintedWithReviews } from "./reviews/store";

export const SITEMAP_PATH = "/sitemap.xml";

/** Reviews' pages that are the same for everyone, beside SITE_PAGES. */
const REVIEWS_PAGES: readonly SitemapEntry[] = [{ path: "/reviews/policy" }];

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

/** `GET /sitemap.xml`; null for anything else. */
export async function serveSitemap(
  request: Request,
  env: Pick<Env, "DATA" | "DB" | "REVIEWS_ENABLED">,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== SITEMAP_PATH) return null;
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(`${request.method} isn't supported here.`, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain" },
    });
  const files = r2PublishedFiles(env.DATA);
  const [courses, instructors] = await Promise.all([
    courseEntries(files),
    instructorEntries(env, files),
  ]);
  // One file while it fits: UMD has well under 50,000 courses and
  // instructors together. Past that, the site's own pages still come first.
  const entries = [
    ...SITE_PAGES,
    ...REVIEWS_PAGES,
    ...courses,
    ...instructors,
  ].slice(0, SITEMAP_MAX_URLS);
  return new Response(
    request.method === "HEAD"
      ? null
      : sitemapXml(`https://${APEX_HOST}`, entries),
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
