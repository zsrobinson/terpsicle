import {
  type CspViolation,
  LegacyCspReportSchema,
  ReportingApiCspReportSchema,
} from "../schema/security";

// CSP violation reports, cut down to what's safe to log (docs/V2.md §12).
// A report can carry a page URL with a share link or an email token in its
// query, a script sample, and a user agent: none of that is kept.

/** Values browsers put in `blocked-uri` instead of a URL. */
const BLOCKED_KEYWORDS = new Set([
  "inline",
  "eval",
  "wasm-eval",
  "self",
  "data",
  "blob",
  "filesystem",
  "trusted-types-policy",
  "trusted-types-sink",
]);

const MAX_PATH = 120;

function parseUrl(value: string, origin: string): URL | null {
  try {
    return new URL(value, origin);
  } catch {
    return null;
  }
}

/** `https://host` for http(s), `chrome-extension://id` and the like otherwise. */
function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

/** What was blocked: a keyword, `self`, or another origin. Never a path or query. */
export function blockedSummary(
  value: string | undefined,
  origin: string,
): string {
  const raw = value?.trim() ?? "";
  if (raw === "") return "unknown";
  if (BLOCKED_KEYWORDS.has(raw)) return raw;
  const url = parseUrl(raw, origin);
  if (!url) return "unknown";
  const scheme = url.protocol.slice(0, -1);
  if (BLOCKED_KEYWORDS.has(scheme)) return scheme;
  // Our own paths can name a person (/avatars/<id>/…), so not even those.
  return url.origin === origin ? "self" : originOf(url);
}

/** A page's path on our origin, or null for anything else. */
export function pagePath(value: string | undefined, origin: string): string {
  const url = value ? parseUrl(value, origin) : null;
  if (!url || url.origin !== origin) return "unknown";
  return url.pathname.slice(0, MAX_PATH);
}

/** Where the offending code is: `self` and its path for our files, else the origin. */
export function sourceSummary(
  value: string | undefined,
  origin: string,
): string | null {
  const raw = value?.trim() ?? "";
  if (raw === "") return null;
  if (BLOCKED_KEYWORDS.has(raw)) return raw;
  const url = parseUrl(raw, origin);
  if (!url) return null;
  return url.origin === origin
    ? `self${url.pathname.slice(0, MAX_PATH)}`
    : originOf(url);
}

function directiveOf(effective?: string, violated?: string): string {
  const name = (effective ?? violated ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[a-z-]{1,40}$/.test(name) ? name : "unknown";
}

function dispositionOf(value?: string): CspViolation["disposition"] {
  return value === "enforce" || value === "report" ? value : null;
}

function position(value: number | undefined): number | null {
  return value === undefined || value > 1_000_000 ? null : value;
}

/**
 * The violations in a report body, in either shape browsers send: one
 * `{"csp-report": …}` object (`report-uri`) or an array of Reporting API
 * reports (`report-to`), of which only `csp-violation`s count. At most
 * `limit`; anything unreadable is skipped.
 */
export function cspViolations(
  body: unknown,
  origin: string,
  limit = 5,
): CspViolation[] {
  const out: CspViolation[] = [];
  const legacy = LegacyCspReportSchema.safeParse(body);
  if (legacy.success) {
    const r = legacy.data["csp-report"];
    out.push({
      directive: directiveOf(r["effective-directive"], r["violated-directive"]),
      blocked: blockedSummary(r["blocked-uri"], origin),
      page: pagePath(r["document-uri"], origin),
      source: sourceSummary(r["source-file"], origin),
      line: position(r["line-number"]),
      column: position(r["column-number"]),
      disposition: dispositionOf(r.disposition),
    });
  } else if (Array.isArray(body)) {
    for (const item of body) {
      if (out.length >= limit) break;
      const report = ReportingApiCspReportSchema.safeParse(item);
      if (!report.success) continue;
      const r = report.data.body;
      out.push({
        directive: directiveOf(r.effectiveDirective),
        blocked: blockedSummary(r.blockedURL, origin),
        page: pagePath(r.documentURL, origin),
        source: sourceSummary(r.sourceFile, origin),
        line: position(r.lineNumber),
        column: position(r.columnNumber),
        disposition: dispositionOf(r.disposition),
      });
    }
  }
  return out.slice(0, limit);
}
