import { SCHEDULE_PATH } from "~/core/routing";
import { PRODUCT_ORDER, type TangleProduct } from "./tangle";

// The five products as the marketing page shows them, in color order
// (docs/V3.md §1). A product that hasn't launched says "Coming soon" and
// links nowhere; all five are out.

export type MarketingProduct = TangleProduct;

export { PRODUCT_ORDER };

/** Flip a product here when its route ships. */
export const LAUNCHED: Record<MarketingProduct, boolean> = {
  schedule: true,
  reviews: true,
  chat: true,
  plan: true,
  todo: true,
};

export const NAME: Record<MarketingProduct, string> = {
  schedule: "Schedule",
  reviews: "Reviews",
  chat: "Chat",
  plan: "Plan",
  todo: "Todo",
};

/** Where each product lives, and the link's words ("View …", V2 §1.2). */
export const VIEW: Record<MarketingProduct, { to: string; label: string }> = {
  schedule: { to: SCHEDULE_PATH, label: "View schedule" },
  reviews: { to: "/reviews", label: "View reviews" },
  chat: { to: "/chat", label: "View chat" },
  plan: { to: "/plan", label: "View four-year plan" },
  todo: { to: "/todo", label: "View todos" },
};

/** The quiet tag on what isn't out yet. */
export const COMING = "Coming soon";

/** One line under each name at the end of the hero's rails. */
export const TAGLINE: Record<MarketingProduct, string> = {
  schedule: "the week, checked",
  reviews: "grades and honest words",
  chat: "your sections, talking",
  plan: "four years on one board",
  todo: "what's due, from ELMS",
};

/** The Tailwind classes that paint a product: its words and its soft fill. */
export const PAINT: Record<
  MarketingProduct,
  { text: string; soft: string; line: string; fill: string }
> = {
  schedule: {
    text: "text-product-schedule-text",
    soft: "bg-product-schedule-soft",
    line: "stroke-product-schedule-line",
    fill: "bg-product-schedule-line",
  },
  reviews: {
    text: "text-product-reviews-text",
    soft: "bg-product-reviews-soft",
    line: "stroke-product-reviews-line",
    fill: "bg-product-reviews-line",
  },
  chat: {
    text: "text-product-chat-text",
    soft: "bg-product-chat-soft",
    line: "stroke-product-chat-line",
    fill: "bg-product-chat-line",
  },
  plan: {
    text: "text-product-plan-text",
    soft: "bg-product-plan-soft",
    line: "stroke-product-plan-line",
    fill: "bg-product-plan-line",
  },
  todo: {
    text: "text-product-todo-text",
    soft: "bg-product-todo-soft",
    line: "stroke-product-todo-line",
    fill: "bg-product-todo-line",
  },
};
