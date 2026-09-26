// What crawlers read: robots.txt and the sitemap (served by the Worker,
// src/server/seo/). Pure text builders, so the Worker's routes stay thin
// and Reviews can add its instructor and course pages later by handing in
// more entries.

export interface SitemapEntry {
  /** A path on the site, starting with "/". */
  path: string;
  /** ISO date (YYYY-MM-DD) of the last meaningful change, if known. */
  lastModified?: string;
  changeFrequency?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  /** 0.0–1.0; the sitemap protocol's default is 0.5. */
  priority?: number;
}

/**
 * The pages every deploy has. Reviews adds `/reviews/instructors/<id>` and
 * `/reviews/courses/<code>` entries when its pages are public (append them
 * to the list `sitemapXml` gets).
 */
export const SITE_PAGES: readonly SitemapEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/schedule", changeFrequency: "weekly", priority: 0.9 },
  { path: "/reviews", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

/** Paths crawlers shouldn't bother with: private, per-person, or machinery. */
export const DISALLOWED_PATHS: readonly string[] = [
  "/api/",
  "/admin",
  "/avatars/",
  "/auth/",
  "/settings",
  "/signin",
  "/chat",
  "/data/",
  "/ingest/",
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A sitemap document (sitemaps.org 0.9) for `entries` on `origin`. */
export function sitemapXml(
  origin: string,
  entries: readonly SitemapEntry[],
): string {
  const urls = entries.map((e) => {
    const parts = [`<loc>${escapeXml(new URL(e.path, origin).href)}</loc>`];
    if (e.lastModified) parts.push(`<lastmod>${e.lastModified}</lastmod>`);
    if (e.changeFrequency)
      parts.push(`<changefreq>${e.changeFrequency}</changefreq>`);
    if (e.priority !== undefined)
      parts.push(`<priority>${e.priority.toFixed(1)}</priority>`);
    return `  <url>${parts.join("")}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * robots.txt. Production allows everything but the private paths and names
 * the sitemap; any other host (a PR preview on workers.dev, localhost) asks
 * not to be indexed at all.
 */
export function robotsTxt(origin: string, production: boolean): string {
  if (!production) return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${new URL("/sitemap.xml", origin).href}`,
    "",
  ].join("\n");
}

/** One sitemap file holds at most this many URLs (sitemaps.org). */
export const SITEMAP_MAX_URLS = 50_000;
