import { SCHEDULE_PATH } from "~/core/routing";
import { PRODUCT_ORDER } from "./tangle";

// The five products as the marketing page shows them, in color order. Plan
// and Todo aren't out yet (docs/V3.md): their blocks say so and link nowhere.

export type MarketingProduct = (typeof PRODUCT_ORDER)[number];

export { PRODUCT_ORDER };

export const NAME: Record<MarketingProduct, string> = {
  schedule: "Schedule",
  reviews: "Reviews",
  chat: "Chat",
  plan: "Plan",
  todo: "Todo",
};

/** Where a launched product lives, with the link's words; null until then. */
export const VIEW: Record<
  MarketingProduct,
  { to: string; label: string } | null
> = {
  schedule: { to: SCHEDULE_PATH, label: "View schedule" },
  reviews: { to: "/reviews", label: "View reviews" },
  chat: { to: "/chat", label: "View chat" },
  plan: null,
  todo: null,
};

/** The quiet tag on what isn't out yet. */
export const COMING = "Coming this spring";

/** What each rail becomes, under its name at the end of the hero. */
export const BECOMES: Record<MarketingProduct, string> = {
  schedule: "the week, checked",
  reviews: "grades and honest words",
  chat: "your sections, real names",
  plan: "four years on one board",
  todo: "what's due, from ELMS",
};

/**
 * The class that sets a product's paints (marketing.css): `mk-soft`,
 * `mk-text`, `mk-stroke`, `mk-mis-stroke`, `mk-mis-color` and
 * `mk-rail-fill` inside it use them.
 */
export const PAINT: Record<MarketingProduct, string> = {
  schedule: "mk-schedule",
  reviews: "mk-reviews",
  chat: "mk-chat",
  plan: "mk-plan",
  todo: "mk-todo",
};
