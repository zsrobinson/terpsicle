import { hasSessionCookie, SCHEDULE_PATH, wantsToStay } from "~/core/routing";

// The Worker's half of the rule for `/` (docs/V2.md §2, rule 2): someone
// signed in goes straight to the scheduler, before any HTML, so the marketing
// page never flashes. The cookie's presence is enough (no D1 lookup); an
// expired one costs one extra hop. Saved plans are checked in the browser
// (src/features/marketing/returning.ts).

/** A 302 to /schedule for `GET /` with a session cookie, else null. */
export function landingRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/" || !["GET", "HEAD"].includes(request.method))
    return null;
  if (wantsToStay(url.search)) return null;
  if (!hasSessionCookie(request.headers.get("Cookie"))) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`${SCHEDULE_PATH}${url.search}`, url.origin).href,
      // The answer depends on the cookie.
      "Cache-Control": "no-store",
    },
  });
}
