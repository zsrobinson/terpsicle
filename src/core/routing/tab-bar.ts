// Where the phone's tab bar shows (docs/decisions.md, "Phones get a tab
// bar"): Home, then the five products in color order. It's on every page
// of the app, with the tab you're on current, and on Settings with none
// current, so a phone never loses its way back. It stays off the marketing
// page, sign-in, the owner's admin pages and the site's own pages
// (`/privacy`), whose bars keep the product menu instead.

export const TAB_IDS = [
  "home",
  "schedule",
  "reviews",
  "chat",
  "plan",
  "todo",
] as const;

export type TabId = (typeof TAB_IDS)[number];

/** Pages in the app that belong to no tab. */
const UNTABBED = ["/settings"] as const;

/** Whether `pathname` is `root` or a page under it. */
function under(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * The tab bar on `pathname`: which tab is current (null on Settings), or
 * null where the page has no tab bar.
 */
export function tabBarAt(pathname: string): { current: TabId | null } | null {
  const current = TAB_IDS.find((id) => under(pathname, `/${id}`));
  if (current) return { current };
  if (UNTABBED.some((root) => under(pathname, root))) return { current: null };
  return null;
}
