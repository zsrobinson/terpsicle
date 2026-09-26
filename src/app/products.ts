import { SCHEDULE_PATH } from "~/core/routing";
import type { MarkId } from "./brand/marks";

// The products (docs/V2.md §1, docs/V3.md §1.2), in color order, for the product menu and the pages
// around the scheduler. One origin: each is a path. A link from one product
// into another says what you'll see ("View reviews"), never "Open in Reviews".

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
  },
  {
    id: "chat",
    to: "/chat",
    label: "Chat",
    hint: "Talk with your classmates",
    view: "View chat",
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
}[];

export type Product = (typeof PRODUCTS)[number];
