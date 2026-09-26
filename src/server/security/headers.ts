import { INLINE_SCRIPT_HASHES } from "virtual:terpsicle/inline-script-hashes";
import { CSP_REPORT_GROUP, CSP_REPORT_PATH } from "~/core/schema";
import { APEX_HOST } from "../apex";

// Security headers on everything the Worker answers (docs/V2.md §12).
// Built files under /assets/ are served before the Worker runs, so they
// don't get these; they're scripts, styles and fonts, not documents.

/**
 * Report-only for its first week, so a source we missed shows up as a
 * report instead of a broken page; `v2/csp-enforce` flips this.
 */
export const CSP_REPORT_ONLY = true;

/** Sent on every response. */
const EVERY_RESPONSE = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

/**
 * Sent on documents. COOP: no other site's window keeps a handle to ours
 * (sign-in is a full-page redirect, not a popup, so nothing needs one).
 */
const DOCUMENT_ONLY = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

/**
 * One year, this host only. Cloudflare doesn't send HSTS for terpsicle.com
 * (checked 2026-09-26), so the Worker does. No `includeSubDomains` or
 * `preload`: both reach past this app and are the owner's call.
 */
const HSTS = "max-age=31536000";

/** 128 random bits, base64: the CSP nonce for one HTML response. */
export function cspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export interface CspOptions {
  /** This response's nonce, for TanStack's inline scripts (src/router.tsx). */
  nonce: string | null;
  /** Hashes of our own inline scripts (src/app/inline-scripts.ts). */
  scriptHashes: readonly string[];
  reportOnly: boolean;
  /** Where reports go: an absolute URL. */
  reportUrl: string;
}

/**
 * The policy (docs/V2.md §12). Every source is here for a reason:
 * - scripts: our files, TanStack's per-request inline scripts by nonce, and
 *   our own head scripts by hash; PostHog loads through /ingest, our origin;
 * - styles: `'unsafe-inline'` for Radix's and Sonner's style attributes;
 * - images: `data:` for small inlined icons, `blob:` for MapLibre;
 * - fonts: Geist is bundled into /assets;
 * - connect: our origin (API, /data, /ingest), the live data origin for
 *   `pnpm dev` on localhost, and `wss:` for Safari, whose `'self'` doesn't
 *   match WebSockets;
 * - workers: the schedule generator and MapLibre's worker from /assets,
 *   `blob:` for MapLibre.
 */
export function contentSecurityPolicy(options: CspOptions): string {
  const script = [
    "'self'",
    ...(options.nonce ? [`'nonce-${options.nonce}'`] : []),
    ...options.scriptHashes,
  ];
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", ...script],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'", `https://${APEX_HOST}`, `wss://${APEX_HOST}`],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  // Browsers ignore (and warn about) this in a report-only policy.
  if (!options.reportOnly) directives.push(["upgrade-insecure-requests"]);
  directives.push(
    ["report-uri", options.reportUrl],
    ["report-to", CSP_REPORT_GROUP],
  );
  return directives.map((d) => d.join(" ")).join("; ");
}

function isDocument(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").startsWith("text/html");
}

/**
 * `response` with the security headers. Documents also get the CSP, with
 * `nonce` when the app rendered them. A WebSocket upgrade passes as is.
 */
export function withSecurityHeaders(
  response: Response,
  request: Request,
  { nonce = null }: { nonce?: string | null } = {},
): Response {
  if (response.status === 101) return response;
  // Redirects from Response.redirect() have immutable headers.
  const out = new Response(response.body, response);
  const url = new URL(request.url);
  for (const [name, value] of Object.entries(EVERY_RESPONSE))
    out.headers.set(name, value);
  // Browsers ignore HSTS over plain HTTP; localhost must never get it.
  if (url.protocol === "https:")
    out.headers.set("Strict-Transport-Security", HSTS);
  if (!isDocument(out)) return out;
  for (const [name, value] of Object.entries(DOCUMENT_ONLY))
    out.headers.set(name, value);
  const reportUrl = new URL(CSP_REPORT_PATH, url.origin).href;
  out.headers.set(
    CSP_REPORT_ONLY
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    contentSecurityPolicy({
      nonce,
      scriptHashes: INLINE_SCRIPT_HASHES,
      reportOnly: CSP_REPORT_ONLY,
      reportUrl,
    }),
  );
  out.headers.set("Reporting-Endpoints", `${CSP_REPORT_GROUP}="${reportUrl}"`);
  return out;
}
