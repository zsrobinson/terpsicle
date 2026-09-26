// The site's paths, and who skips the marketing page at `/`: anyone with a
// session, or with plans saved in this browser, goes straight to the
// scheduler (the owner's v2 decisions).

/** The scheduler. Share links, deep links and emails all point here. */
export const SCHEDULE_PATH = "/schedule";

/**
 * Cookies that mean someone is signed in. `__Host-session` is the planned
 * name; `session` is accepted until sign-in settles on one. Change the name
 * here only.
 */
export const SESSION_COOKIE_NAMES: readonly string[] = [
  "__Host-session",
  "session",
];

/** Whether a `Cookie` header carries a non-empty session cookie. */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return false;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    return value !== "" && SESSION_COOKIE_NAMES.includes(name);
  });
}

/**
 * Whether the browser's `plans` and `blocks` rows hold anything the person
 * made. The first visit to the scheduler saves one empty plan, which doesn't
 * count; a course in any plan, a second plan in a term, or a block does.
 *
 * Rows are raw IndexedDB values, not validated: this runs in the head of `/`
 * before any app code. Stringified into that script, so it must be
 * self-contained: no imports, no references to anything else in this module.
 */
export function hasSavedWork(
  plans: readonly unknown[],
  blocks: readonly unknown[],
): boolean {
  if (blocks.length > 0) return true;
  const terms: string[] = [];
  for (const plan of plans) {
    if (typeof plan !== "object" || plan === null) continue;
    const { courses, termId } = plan as { courses?: unknown; termId?: unknown };
    if (Array.isArray(courses) && courses.length > 0) return true;
    const term = String(termId);
    if (terms.includes(term)) return true;
    terms.push(term);
  }
  return false;
}

/** Where a visit to `/` goes. */
export type Landing = "marketing" | "schedule";

/** The redirect decision for `/`: either signal skips the marketing page. */
export function landingFor(visitor: {
  signedIn: boolean;
  savedWork: boolean;
}): Landing {
  return visitor.signedIn || visitor.savedWork ? "schedule" : "marketing";
}
