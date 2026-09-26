// Where the site lives, for anything a search engine or a link preview reads:
// canonical URLs, Open Graph, JSON-LD and the sitemap always name the
// production origin, even on a preview or localhost (Cloudflare serves
// workers.dev preview URLs with `X-Robots-Tag: noindex`).

export const SITE_ORIGIN = "https://terpsicle.com";
export const SITE_NAME = "Terpsicle";

/** `path` on the production origin. */
export function siteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href;
}

export const reviewsHomePath = "/reviews";

export function coursePath(code: string): string {
  return `/reviews/courses/${code}`;
}

export function instructorPath(id: string): string {
  return `/reviews/instructors/${encodeURIComponent(id)}`;
}
