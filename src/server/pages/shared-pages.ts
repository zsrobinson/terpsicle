// Pages whose HTML is the same for everyone (the public Reviews pages) are
// kept by Workers Cache (wrangler.jsonc `cache`), in front of this Worker:
// a crawler or a first visit gets them from the edge. Its keys include the
// Worker version, so a deploy never serves HTML naming the last deploy's
// scripts. Anything else stays `no-cache`.
import { hasSessionCookie } from "~/core/routing";

/**
 * Fresh at the edge for 10 minutes, then served stale for up to a day while
 * one request re-renders it. Browsers revalidate every time (max-age=0), as
 * with all our HTML.
 */
export const SHARED_PAGE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";

/** Someone signed in: never stored anywhere, even for a page that's the same. */
export const SIGNED_IN_PAGE_CACHE_CONTROL = "private, no-cache";

const SHARED_PATHS = [
  /^\/reviews\/?$/,
  /^\/reviews\/policy\/?$/,
  /^\/reviews\/courses\/[^/]+\/?$/,
  /^\/reviews\/instructors\/[^/]+\/?$/,
];

/** A path whose page reads nothing about the visitor. */
export function isSharedPagePath(pathname: string): boolean {
  return SHARED_PATHS.some((p) => p.test(pathname));
}

/** How this request's page may be cached: shared, private or as usual. */
export function pageCaching(request: Request): "shared" | "private" | null {
  const url = new URL(request.url);
  if (!isSharedPagePath(url.pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  return hasSessionCookie(request.headers.get("Cookie")) ? "private" : "shared";
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
/** Scripts the browser runs; JSON-LD and other data blocks aren't. */
const EXECUTABLE_TYPE = /^(|text\/javascript|application\/javascript|module)$/i;

/**
 * A script's text as the browser hashes it: after the HTML parser has
 * turned NULs into U+FFFD (TanStack's match ids use them as separators) and
 * CR LF and lone CRs into LF.
 */
export function parsedScriptText(raw: string): string {
  return raw.replace(/\0/g, "\uFFFD").replace(/\r\n?/g, "\n");
}

/**
 * The CSP hashes of the inline scripts the app rendered: those carrying
 * this render's `nonce`, which only the app knows. A cached page can't
 * carry a per-response nonce (everyone would get the same one), so its
 * policy names exactly those scripts instead; anything else inline, say a
 * script smuggled in through data, stays blocked.
 */
export async function inlineScriptHashes(
  html: string,
  nonce: string,
): Promise<string[]> {
  const hashes = new Set<string>();
  for (const [, attrs = "", body = ""] of html.matchAll(SCRIPT)) {
    if (!attrs.includes(`nonce="${nonce}"`)) continue;
    if (/\ssrc\s*=/i.test(` ${attrs}`)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] ?? "";
    if (!EXECUTABLE_TYPE.test(type) || body === "") continue;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(parsedScriptText(body)),
    );
    hashes.add(
      `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`,
    );
  }
  return [...hashes];
}
