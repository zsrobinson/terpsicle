import { SCHEDULE_PATH } from "~/core/routing";
import { PLANETTERP_HOME } from "~/core/schema";
import type { MarkId } from "./brand/marks";

// The products (docs/V2.md §1, docs/V3.md §1.2), in color order, for the product menu and the pages
// around the scheduler. One origin: each is a path. A link from one product
// into another says what you'll see ("View reviews"), never "Open in Reviews".

// Plan joins the menus when it launches (PLAN_ENABLED, docs/V3.md §8):
// `listedProducts` below.
export type ProductId = Exclude<MarkId, "umbrella">;

export const PRODUCTS = [
  {
    id: "schedule",
    to: SCHEDULE_PATH,
    label: "Schedule",
    hint: "Plan your classes",
    view: "View schedule",
  },
  {
    id: "reviews",
    to: "/reviews",
    label: "Reviews",
    hint: "Courses and instructors",
    view: "View reviews",
    // While our Reviews pages are off (REVIEWS_PAGES_ENABLED), the purple
    // tab keeps its place among the five and opens PlanetTerp instead.
    outside: {
      href: PLANETTERP_HOME,
      hint: "On PlanetTerp",
      tooltip: "Reviews on PlanetTerp. Opens in a new tab.",
    },
  },
  {
    id: "chat",
    to: "/chat",
    label: "Chat",
    hint: "Talk with your classmates",
    view: "View chat",
  },
  {
    id: "plan",
    to: "/plan",
    label: "Plan",
    hint: "Your four years, semester by semester",
    view: "View four-year plan",
  },
  {
    id: "todo",
    to: "/todo",
    label: "Todo",
    hint: "Deadlines and exams from ELMS",
    view: "View todos",
  },
] as const satisfies readonly {
  id: ProductId;
  to: string;
  label: string;
  hint: string;
  view: string;
  /** Another site that stands in for the product while it's off here. */
  outside?: { href: string; hint: string; tooltip: string };
}[];

export type Product = (typeof PRODUCTS)[number];

/**
 * The products to list: Plan only once PLAN_ENABLED is on (docs/V3.md §8),
 * or while you're in it, so the page you're on is always named.
 */
export function listedProducts(
  flags: { plan: boolean },
  current: ProductId | null,
): readonly Product[] {
  return PRODUCTS.filter(
    (p) => p.id !== "plan" || flags.plan || current === "plan",
  );
}

/**
 * Where a product's tab goes: its own page, or, for Reviews while our pages
 * are off, PlanetTerp in a new tab. The page you're on always stays itself
 * (an author's /reviews/mine).
 */
export function productLink(
  product: Product,
  flags: { reviewsPages: boolean },
  current: ProductId | null,
):
  | { href: string; outside: false }
  | {
      href: string;
      outside: true;
      hint: string;
      tooltip: string;
    } {
  if ("outside" in product && !flags.reviewsPages && current !== product.id)
    return { ...product.outside, outside: true };
  return { href: product.to, outside: false };
}
