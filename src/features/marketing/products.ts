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
 * Tailwind classes per product, spelled out so Tailwind finds them:
 * the section's fill, product-colored words, the rails and the misprint.
 */
export const PAINT: Record<
  MarketingProduct,
  {
    soft: string;
    text: string;
    stroke: string;
    misStroke: string;
    misText: string;
    rail: string;
  }
> = {
  schedule: {
    soft: "bg-product-schedule-soft",
    text: "text-product-schedule-text",
    stroke: "stroke-product-schedule-line",
    misStroke: "stroke-product-schedule-mis",
    misText: "text-product-schedule-mis",
    rail: "bg-product-schedule-line",
  },
  reviews: {
    soft: "bg-product-reviews-soft",
    text: "text-product-reviews-text",
    stroke: "stroke-product-reviews-line",
    misStroke: "stroke-product-reviews-mis",
    misText: "text-product-reviews-mis",
    rail: "bg-product-reviews-line",
  },
  chat: {
    soft: "bg-product-chat-soft",
    text: "text-product-chat-text",
    stroke: "stroke-product-chat-line",
    misStroke: "stroke-product-chat-mis",
    misText: "text-product-chat-mis",
    rail: "bg-product-chat-line",
  },
  plan: {
    soft: "bg-product-plan-soft",
    text: "text-product-plan-text",
    stroke: "stroke-product-plan-line",
    misStroke: "stroke-product-plan-mis",
    misText: "text-product-plan-mis",
    rail: "bg-product-plan-line",
  },
  todo: {
    soft: "bg-product-todo-soft",
    text: "text-product-todo-text",
    stroke: "stroke-product-todo-line",
    misStroke: "stroke-product-todo-mis",
    misText: "text-product-todo-mis",
    rail: "bg-product-todo-line",
  },
};
