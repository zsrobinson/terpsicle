import { SCHEDULE_PATH } from "~/core/routing";

// The five products as the marketing page shows them, in color order
// (docs/decisions.md, "Five products in color order").

export const PRODUCT_ORDER = [
  "schedule",
  "reviews",
  "chat",
  "plan",
  "todo",
] as const;

export type MarketingProduct = (typeof PRODUCT_ORDER)[number];

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

/** The Tailwind classes that paint a product: its words and its soft fill. */
export const PAINT: Record<MarketingProduct, { text: string; soft: string }> = {
  schedule: {
    text: "text-product-schedule-text",
    soft: "bg-product-schedule-soft",
  },
  reviews: {
    text: "text-product-reviews-text",
    soft: "bg-product-reviews-soft",
  },
  chat: { text: "text-product-chat-text", soft: "bg-product-chat-soft" },
  plan: { text: "text-product-plan-text", soft: "bg-product-plan-soft" },
  todo: { text: "text-product-todo-text", soft: "bg-product-todo-soft" },
};
