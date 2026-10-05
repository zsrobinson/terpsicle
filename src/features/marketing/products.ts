import { SCHEDULE_PATH } from "~/core/routing";
import { PLANETTERP_HOME } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";

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

/**
 * Where a product's link goes on this page: its own, or for Reviews while
 * our pages are off, PlanetTerp in a new tab. A View link means a Terpsicle
 * page (decisions.md, "Words"), so the way out says where it goes instead.
 */
export function useView(product: MarketingProduct): {
  to: string;
  label: string;
  tooltip: string;
  outside: boolean;
} {
  const pages = useAccount((s) => s.flags.reviewsPages);
  if (product === "reviews" && !pages)
    return {
      to: PLANETTERP_HOME,
      label: "Reviews on PlanetTerp",
      tooltip: "Reviews on PlanetTerp. Opens in a new tab.",
      outside: true,
    };
  return {
    ...VIEW[product],
    tooltip: `Open Terpsicle ${NAME[product]}`,
    outside: false,
  };
}

/** Whether Reviews is PlanetTerp's here: our pages are off. */
export function useReviewsOutside(): boolean {
  return !useAccount((s) => s.flags.reviewsPages);
}

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
