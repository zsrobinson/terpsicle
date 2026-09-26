import { SIGNIN_PATH } from "../schema/auth";

// Pages where PostHog's autocapture stays off (docs/ANALYTICS.md "Privacy").
// Session recordings are off everywhere, so there's no per-page list for them.

/**
 * Pages whose clicks autocapture never reads: Chat (real names and
 * messages), Settings and sign-in (your name, email and picture), Admin,
 * your own reviews, and Plan and Todo (grades, courses and due dates; V3.md
 * §6). Named events from `track()` still count there. Each covers everything
 * below it (`/chat` covers `/chat/<term>/<course>/…`).
 */
export const NO_AUTOCAPTURE_ROUTES = [
  "/chat",
  "/settings",
  "/admin",
  "/reviews/mine",
  "/plan",
  "/todo",
  SIGNIN_PATH,
  "/auth",
] as const;

/** `pathname` is `route` or below it: `/plan` covers `/plan/x`, not `/planner`. */
export function isUnderRoute(pathname: string, route: string): boolean {
  const path = normalizePath(pathname);
  return path === route || path.startsWith(`${route}/`);
}

/**
 * `NO_AUTOCAPTURE_ROUTES` as full-URL patterns, for PostHog's autocapture
 * `url_ignorelist` (matched against `location.href`).
 */
export function noAutocaptureUrlPatterns(): RegExp[] {
  return NO_AUTOCAPTURE_ROUTES.map(
    (route) =>
      new RegExp(
        `^[a-z][a-z0-9+.-]*://[^/?#]*${escapeRegExp(route)}(?:[/?#]|$)`,
        "i",
      ),
  );
}

/** Lowercased, without a trailing slash (`/Chat/` is `/chat`). */
function normalizePath(pathname: string): string {
  const lower = pathname.toLowerCase();
  return lower.length > 1 && lower.endsWith("/") ? lower.slice(0, -1) : lower;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
