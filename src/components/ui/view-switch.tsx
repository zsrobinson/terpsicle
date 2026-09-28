import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import { Hinted, SEGMENT, SEGMENTS } from "./segmented-control";

// The one sub-navigation pattern (docs/COHESION.md §1.8): ways to look at the
// same thing, as a row of text labels. Every view is a URL, so each is a
// router `Link` (preloaded on intent), and Back and a copied link work. The
// route's `validateSearch` owns the search params; this only links to them.

export interface View {
  /** Matched against `current`. */
  id: string;
  label: string;
  /** The tooltip: what the view shows ("What's due each day"). */
  hint?: string;
  /** Its keyboard shortcut, shown in the tooltip. */
  shortcut?: string;
  /** The view's route; leave it out to stay on this one and change `search`. */
  to?: LinkProps["to"];
  search?: LinkProps["search"];
  params?: LinkProps["params"];
}

/**
 * Two to seven views of one thing, in the page header's right (or under a
 * panel header). The current one carries `aria-current="page"`.
 */
export function ViewSwitch({
  views,
  current,
  label = "Views",
  className,
}: {
  views: readonly View[];
  current: string;
  /** The navigation's accessible name ("Todo views"). */
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(SEGMENTS, className)}>
      {views.map((view) => (
        <Hinted key={view.id} hint={view.hint} shortcut={view.shortcut}>
          <Link
            to={view.to}
            search={view.search}
            params={view.params}
            // The router marks a link active on its own, and a view with no
            // search ("By day") would match every other view's URL. `current`
            // decides instead, and exact matching keeps the router from
            // adding a second, wrong aria-current.
            activeOptions={{ exact: true, includeSearch: true }}
            aria-current={view.id === current ? "page" : undefined}
            className={SEGMENT}
          >
            {view.label}
          </Link>
        </Hinted>
      ))}
    </nav>
  );
}
