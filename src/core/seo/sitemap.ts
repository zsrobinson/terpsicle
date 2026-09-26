import { siteUrl } from "./site";

// Sitemaps (sitemaps.org 0.9): an index at /sitemap.xml and one file per
// part. Each file holds at most 50,000 URLs.

export const SITEMAP_MAX_URLS = 50_000;

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export interface SitemapEntry {
  path: string;
  /** YYYY-MM-DD or a full ISO date, when we know it. */
  lastmod?: string | null;
}

function lines(tag: "url" | "sitemap", entries: readonly SitemapEntry[]) {
  return entries.map(
    (e) =>
      `<${tag}><loc>${escapeXml(siteUrl(e.path))}</loc>${e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : ""}</${tag}>`,
  );
}

/** A `<urlset>` of these pages; throws past 50,000 (split them first). */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  if (entries.length > SITEMAP_MAX_URLS)
    throw new Error(`A sitemap holds at most ${SITEMAP_MAX_URLS} URLs`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lines("url", entries),
    "</urlset>",
    "",
  ].join("\n");
}

/** The `<sitemapindex>` naming each sitemap file. */
export function sitemapIndexXml(sitemaps: readonly SitemapEntry[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lines("sitemap", sitemaps),
    "</sitemapindex>",
    "",
  ].join("\n");
}
