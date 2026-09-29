import { PLAN_VIEW_PATHS } from "./plan-location";
import { TAB_PATHS } from "./schedule-location";

// Which view transition a navigation gets (docs/decisions.md, "Motion
// through view transitions"; the iPhone plan §5). The router asks on every
// navigation (src/lib/view-transition.ts) and the CSS draws each type
// (src/styles/transitions.css):
//
//   push  going deeper: a list row to its details, a room from the list
//   pop   coming back out: Back, or a link up to the place a drill-in is over
//   tab   another product, or another tab of one: a cross-fade, bars still
//   none  Reduce Motion: things change in place with a short fade
//
// and null means no transition at all: the first render, search params
// that stay on one screen (typing, chips, a drill-in's sub-tab), and a Back
// the browser already animated (Safari's edge swipe).

export type ViewTransitionType = "push" | "pop" | "tab" | "none";

/** Where a navigation starts or ends, as the router's location has it. */
export interface NavigationPlace {
  pathname: string;
  search: Readonly<Record<string, unknown>>;
  /** The router's history index (`history.state.__TSR_index`). */
  index: number;
}

/** A screen: what a person would call one page of a product. */
export interface Screen {
  /** "schedule", "reviews", …; "" for the landing page. */
  product: string;
  /** 0 for a product's top or one of its rail tabs, 1 for a page under it
   * (a drill-in over another is 1 too; the history index orders them), and
   * 2 for a thread in a Chat room. */
  depth: number;
  /** Tells screens apart: the same key is the same screen. */
  key: string;
  /** The top-level screen a deeper one sits over. */
  base: string;
}

/** Paths that are tabs of their product rather than pages under it. */
const TOP_PATHS: ReadonlySet<string> = new Set([
  ...Object.values(TAB_PATHS),
  ...Object.values(PLAN_VIEW_PATHS),
]);

/** Products whose every page is one of its tabs. */
const ALL_TABS: ReadonlySet<string> = new Set(["admin"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function screenOf(
  pathname: string,
  search: Readonly<Record<string, unknown>>,
): Screen {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const segments = path.split("/").filter(Boolean);
  const product = segments[0] ?? "";
  const top = `/${product}`;

  // Chat's room and thread are search params on one route (V2.md §8.6).
  if (product === "chat") {
    const room = text(search.room);
    const thread = room ? text(search.thread) : null;
    return {
      product,
      depth: thread ? 2 : room ? 1 : 0,
      key: [top, room, thread].filter(Boolean).join("#"),
      base: top,
    };
  }

  if (segments.length <= 1 || TOP_PATHS.has(path) || ALL_TABS.has(product))
    return { product, depth: 0, key: path, base: path };

  // A scheduler drill-in sits over the rail tab its `?tab=` names.
  let base = top;
  if (product === "schedule") {
    const tab = text(search.tab);
    const fallback = segments[1] === "result" ? "generate" : "courses";
    base =
      (TAB_PATHS as Record<string, string>)[tab ?? fallback] ??
      TAB_PATHS[fallback];
  }
  return { product, depth: 1, key: path, base };
}

export function viewTransitionType({
  from,
  to,
  reduceMotion,
  uaAnimated,
}: {
  from: NavigationPlace | undefined;
  to: NavigationPlace;
  reduceMotion: boolean;
  /** The browser animated this navigation itself (an edge swipe Back). */
  uaAnimated: boolean;
}): ViewTransitionType | null {
  if (!from) return null;
  const a = screenOf(from.pathname, from.search);
  const b = screenOf(to.pathname, to.search);
  if (a.key === b.key) return null;
  if (uaAnimated) return null;
  if (reduceMotion) return "none";
  if (a.product !== b.product) return "tab";
  if (a.depth === 0 && b.depth === 0) return "tab";
  if (to.index < from.index) return "pop";
  if (b.depth < a.depth)
    // Up to the place this drill-in is over is Back; anywhere else is a
    // tab picked from inside it.
    return b.depth === 0 && b.key !== a.base ? "tab" : "pop";
  return "push";
}
