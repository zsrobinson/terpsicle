import { robotsTxt } from "~/core/seo/sitemap";
import { APEX_HOST } from "../apex";

// robots.txt, from the Worker (src/server/worker.ts) rather than a static
// file, so previews can opt out of indexing. The sitemap it names is
// src/server/sitemap.ts: the site's pages plus Reviews' public ones.

export const ROBOTS_PATH = "/robots.txt";

/** A day: it changes only with a deploy. */
const CACHE = "public, max-age=86400";

/** The robots.txt for `request`, or null for any other path. */
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
  return null;
}
