import { robotsTxt, SITE_PAGES, sitemapXml } from "~/core/seo/sitemap";
import { APEX_HOST } from "../apex";

// robots.txt and sitemap.xml, from the Worker (src/server/worker.ts) rather
// than static files, so the sitemap can grow with Reviews' public pages
// (SITE_PAGES in ~/core/seo/sitemap) and previews can opt out of indexing
// without a second set of files.

export const ROBOTS_PATH = "/robots.txt";
export const SITEMAP_PATH = "/sitemap.xml";

/** A day: both change only with a deploy. */
const CACHE = "public, max-age=86400";

/** The robots.txt or sitemap for `request`, or null for any other path. */
export function serveSeoFile(request: Request): Response | null {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const production = url.hostname === APEX_HOST;
  // Everything the sitemap names lives on the apex host.
  const origin = `https://${APEX_HOST}`;
  if (url.pathname === ROBOTS_PATH)
    return new Response(robotsTxt(origin, production), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": CACHE,
      },
    });
  if (url.pathname === SITEMAP_PATH)
    return new Response(sitemapXml(origin, SITE_PAGES), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": CACHE,
      },
    });
  return null;
}
