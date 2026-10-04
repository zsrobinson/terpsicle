import { z } from "zod";

// Security headers and CSP violation reports (docs/V2.md §12).

/**
 * Carries the Worker's per-request CSP nonce to the app's server render,
 * which puts it on TanStack's own inline scripts (src/router.tsx). The
 * Worker always sets it itself, replacing anything a client sent.
 */
export const CSP_NONCE_HEADER = "x-terpsicle-csp-nonce";

/** Where browsers send CSP violation reports. */
export const CSP_REPORT_PATH = "/api/csp-report";

/** The Reporting API group name the CSP's `report-to` names. */
export const CSP_REPORT_GROUP = "csp";

// Browsers send two shapes. Every field is optional: they differ in what
// they fill in, and a report missing one is still worth counting. Numbers
// arrive as strings from some browsers.
const lineNumber = z.coerce
  .number()
  .int()
  .nonnegative()
  .optional()
  .catch(undefined);
const text = z.string().max(4_096).optional().catch(undefined);

/** `report-uri`: `Content-Type: application/csp-report` (Firefox, Safari). */
export const LegacyCspReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": text,
    "effective-directive": text,
    "violated-directive": text,
    "blocked-uri": text,
    "source-file": text,
    "line-number": lineNumber,
    "column-number": lineNumber,
    disposition: text,
  }),
});

/** One report from `report-to`: `Content-Type: application/reports+json` (Chrome). */
export const ReportingApiCspReportSchema = z.object({
  type: z.literal("csp-violation"),
  body: z.object({
    documentURL: text,
    effectiveDirective: text,
    blockedURL: text,
    sourceFile: text,
    lineNumber,
    columnNumber: lineNumber,
    disposition: text,
  }),
});

/**
 * What the Worker logs about one violation: no query strings, no script
 * samples, no IP or user agent. `blocked` is a CSP keyword (`inline`,
 * `eval`, `data`, …), `self`, or another origin.
 */
export interface CspViolation {
  directive: string;
  blocked: string;
  /** The page's path, without its query or fragment. */
  page: string;
  /** Where the offending code was: `self` plus a path, or another origin. */
  source: string | null;
  line: number | null;
  column: number | null;
  disposition: "enforce" | "report" | null;
}

// ---------- Synced data's keys (docs/DATA.md §7.7) ----------

/** Blank means unset, so an empty var reads as missing and fails closed. */
const keyVar = z
  .string()
  .optional()
  .catch(undefined)
  .transform((value) => value?.trim() || undefined);

/**
 * The Worker's settings for sealing synced data, read from its `env`; other
 * bindings are ignored. Each account's data key is wrapped by
 * USER_DATA_KEY, which production must set: there's no plaintext fallback.
 */
export const UserDataKeyVarsSchema = z.object({
  /** Wraps every account's key (a secret: 32 random bytes, base64url). */
  USER_DATA_KEY: keyVar,
  /** The id keys wrapped by USER_DATA_KEY name (a var, `k1` at first). */
  USER_DATA_KEY_ID: keyVar,
  /** During a rotation, the key before (a secret). */
  USER_DATA_KEY_PREVIOUS: keyVar,
  /** During a rotation, the previous key's id (a var). */
  USER_DATA_KEY_PREVIOUS_ID: keyVar,
});
/** The same names as the Worker's env has them, every one optional. */
export interface UserDataKeyVars {
  USER_DATA_KEY?: string;
  USER_DATA_KEY_ID?: string;
  USER_DATA_KEY_PREVIOUS?: string;
  USER_DATA_KEY_PREVIOUS_ID?: string;
  /**
   * A cron's or Durable Object's test mode (they have no host); a request's
   * is auth's `isTestMode`, which needs a preview or localhost host too.
   */
  AUTH_TEST_MODE?: string;
}
