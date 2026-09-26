import type { MarkId } from "./brand/marks";

// The three products (docs/V2.md §1), for the product menu and the pages
// around the scheduler. One origin: each is a path. A link from one product
// into another says what you'll see ("View reviews"), never "Open in Reviews".

export type ProductId = Exclude<MarkId, "umbrella">;

export const PRODUCTS = [
  {
    id: "schedule",
    to: "/schedule",
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
  },
  {
    id: "chat",
    to: "/chat",
    label: "Chat",
    hint: "Talk with your classmates",
    view: "View chat",
  },
] as const satisfies readonly {
  id: ProductId;
  to: string;
  label: string;
  hint: string;
  view: string;
}[];

export type Product = (typeof PRODUCTS)[number];
