// /sitemap.xml and its parts, built from what's published: the course index
// for course pages, the PlanetTerp index for instructor pages, and our own
// minted instructors that have a published review. Workers Cache keeps each
// for an hour (the files behind them change nightly at most).

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
  type SitemapEntry,
  sitemapIndexXml,
  sitemapXml,
} from "~/core/seo";
import { r2PublishedFiles } from "./pages/context";
import { mintedWithReviews } from "./reviews/store";

export const SITEMAP_PATH = "/sitemap.xml";
export const SITEMAPS_PREFIX = "/sitemaps/";

/** Pages that are the same for everyone and worth finding. */
const PAGES: readonly string[] = [
  "/",
  "/schedule",
  "/reviews",
  "/reviews/policy",
  "/privacy",
];

const PARTS = ["pages", "courses", "instructors"] as const;
type Part = (typeof PARTS)[number];

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

function xml(body: string, request: Request): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/** `GET /sitemap.xml` and `GET /sitemaps/<part>.xml`; null for anything else. */
export async function serveSitemap(
  request: Request,
  env: Pick<Env, "DATA" | "DB" | "REVIEWS_ENABLED">,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const part = PARTS.find((p) => pathname === `${SITEMAPS_PREFIX}${p}.xml`);
  if (pathname !== SITEMAP_PATH && !part) return null;
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(`${request.method} isn't supported here.`, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain" },
    });
  if (!part)
    return xml(
      sitemapIndexXml(
        PARTS.map((p) => ({ path: `${SITEMAPS_PREFIX}${p}.xml` })),
      ),
      request,
    );
  const files = r2PublishedFiles(env.DATA);
  const entries: Record<Part, () => Promise<SitemapEntry[]>> = {
    pages: async () => PAGES.map((path) => ({ path })),
    courses: () => courseEntries(files),
    instructors: () => instructorEntries(env, files),
  };
  return xml(sitemapXml(await entries[part]()), request);
}
