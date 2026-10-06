import { FeatureVarsSchema } from "~/core/schema";
import {
  robotsTxt,
  SITE_PAGES,
  SITEMAP_MAX_URLS,
  sitemapXml,
} from "~/core/seo/sitemap";
import { APEX_HOST } from "../apex";
import { reviewsSitemapEntries } from "./sitemap";

// robots.txt and sitemap.xml, from the Worker (src/server/worker.ts) rather
// than static files, so the sitemap can list Reviews' public pages from
// what's published (sitemap.ts) and previews can opt out of indexing
// without a second set of files.

export const ROBOTS_PATH = "/robots.txt";
export const SITEMAP_PATH = "/sitemap.xml";

/** A day: robots.txt changes only with a deploy. */
const ROBOTS_CACHE = "public, max-age=86400";
/**
 * An hour, at the edge too (Workers Cache): the course and PlanetTerp
 * indexes behind the sitemap change nightly at most.
 */
const SITEMAP_CACHE =
  "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

function file(
  request: Request,
  body: string,
  type: string,
  cache: string,
): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    headers: { "Content-Type": type, "Cache-Control": cache },
  });
}

/** The robots.txt or sitemap for `request`, or null for any other path. */
export async function serveSeoFile(
  request: Request,
  env: Pick<Env, "DATA" | "DB" | "REVIEWS_ENABLED"> & {
    REVIEWS_PAGES_ENABLED?: string;
  },
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const production = url.hostname === APEX_HOST;
  // Everything the sitemap names lives on the apex host.
  const origin = `https://${APEX_HOST}`;
  if (url.pathname === ROBOTS_PATH)
    return file(
      request,
      robotsTxt(origin, production),
      "text/plain; charset=utf-8",
      ROBOTS_CACHE,
    );
  if (url.pathname === SITEMAP_PATH) {
    // The site's own pages first, so a sitemap that outgrew one file (see
    // SITEMAP_MAX_URLS) still names them.
    // While our Reviews pages are off, their addresses go to PlanetTerp,
    // so none of them is listed (docs/decisions.md, "Reviews link out to
    // PlanetTerp").
    const pages = FeatureVarsSchema.parse(env).REVIEWS_PAGES_ENABLED;
    const entries = (
      pages
        ? [...SITE_PAGES, ...(await reviewsSitemapEntries(env))]
        : SITE_PAGES.filter((p) => !/^\/reviews(\/|$)/.test(p.path))
    ).slice(0, SITEMAP_MAX_URLS);
    return file(
      request,
      sitemapXml(origin, entries),
      "application/xml; charset=utf-8",
      SITEMAP_CACHE,
    );
  }
  return null;
}
