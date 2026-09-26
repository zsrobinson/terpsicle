import { SCHEDULE_PATH } from "~/core/routing";

// The three products (docs/V2.md §1), for the product menu and the pages
// around the scheduler.
export const PRODUCTS = [
  { to: SCHEDULE_PATH, label: "Schedule", hint: "Plan your classes" },
  { to: "/reviews", label: "Reviews", hint: "Courses and instructors" },
  { to: "/chat", label: "Chat", hint: "Talk with your classmates" },
] as const;
