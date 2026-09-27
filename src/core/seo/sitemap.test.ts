import { describe, expect, it } from "vitest";
import { robotsTxt, SITE_PAGES, sitemapXml } from "./sitemap";

describe("sitemapXml", () => {
  it("lists the site's pages as absolute URLs, in order", () => {
    const xml = sitemapXml("https://terpsicle.com", SITE_PAGES);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://terpsicle.com/",
      "https://terpsicle.com/schedule",
      "https://terpsicle.com/reviews",
      "https://terpsicle.com/reviews/policy",
      "https://terpsicle.com/privacy",
    ]);
    expect(xml).toContain("<priority>1.0</priority>");
    expect(xml).toContain("<changefreq>yearly</changefreq>");
  });

  it("takes more entries, for Reviews' pages later, and escapes them", () => {
    const xml = sitemapXml("https://terpsicle.com", [
      ...SITE_PAGES,
      { path: "/reviews/courses/CMSC351", lastModified: "2026-09-26" },
      { path: "/reviews/instructors/a&b" },
    ]);
    expect(xml).toContain(
      "<loc>https://terpsicle.com/reviews/courses/CMSC351</loc><lastmod>2026-09-26</lastmod>",
    );
    expect(xml).toContain("https://terpsicle.com/reviews/instructors/a&amp;b");
  });
});

describe("robotsTxt", () => {
  it("keeps crawlers out of the private paths and names the sitemap", () => {
    const text = robotsTxt("https://terpsicle.com", true);
    expect(text).toMatch(/^User-agent: \*\n/);
    expect(text).toContain("Disallow: /api/\n");
    expect(text).toContain("Disallow: /admin\n");
    expect(text).toContain("Disallow: /settings\n");
    expect(text).not.toContain("Disallow: /\n");
    expect(text).not.toContain("Disallow: /schedule");
    expect(
      text.trimEnd().endsWith("Sitemap: https://terpsicle.com/sitemap.xml"),
    ).toBe(true);
  });

  it("asks not to be indexed anywhere but production", () => {
    expect(robotsTxt("https://pr-12-terpsicle.workers.dev", false)).toBe(
      "User-agent: *\nDisallow: /\n",
    );
  });
});
