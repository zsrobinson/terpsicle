import { isUnderRoute } from "../analytics/routes";
import { scrubUrl } from "../analytics/scrub";
import type { FeedbackKind, FeedbackProduct } from "../schema/feedback";

/**
 * The page as stored with an item. Feedback from the sheet keeps only what
 * analytics may see (the route pattern and a few search params: never a
 * share link's plan, a chat room's course or a search query). A pinned note
 * is the owner's own, so it keeps its search params to reopen the view.
 */
export function feedbackPath(path: string, kind: FeedbackKind): string {
  if (kind === "review") return path;
  return scrubUrl(path) || "/";
}

/** The pathname part of a stored path, where pins are matched. */
export function pathnameOf(path: string): string {
  return path.split(/[?#]/)[0] || "/";
}

/** Where "Send feedback" shows, and the product each page reports as. */
const FEEDBACK_PAGES: readonly [string, FeedbackProduct][] = [
  ["/schedule", "schedule"],
  ["/reviews", "reviews"],
  ["/chat", "chat"],
  ["/plan", "plan"],
  ["/todo", "todo"],
  ["/settings", "settings"],
  ["/admin", "admin"],
  // Home belongs to no one product: the site's.
  ["/home", "site"],
];

/**
 * The product a page's feedback is about, or null where the button doesn't
 * show: `/`, `/privacy` and sign-in. (A path we don't have gets the 404,
 * whose bar files its feedback as the site's: SiteHeader.)
 */
export function feedbackProduct(pathname: string): FeedbackProduct | null {
  return (
    FEEDBACK_PAGES.find(([route]) => isUnderRoute(pathname, route))?.[1] ?? null
  );
}
