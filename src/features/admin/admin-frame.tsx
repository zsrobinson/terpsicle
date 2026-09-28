import type { ReactNode } from "react";
import {
  ADMIN_DECISIONS_PATH,
  ADMIN_FEEDBACK_PATH,
  ADMIN_GRADES_PATH,
  ADMIN_KIT_PATH,
  ADMIN_PATH,
} from "~/core/routing";
import { SitePage } from "~/features/site/site-page";
import { type View, ViewSwitch } from "~/ui/view-switch";
import { AdminGate } from "./admin-gate";

// The admin pages (V2 §10) sit in the same frame as every other page: the
// family bar, with "Admin" in its context slot (SiteHeader), over the kit's
// app-width page. Admin is no product, so no tab is current in the bar.

/** Admin's pages, each a route. */
export type AdminPage = "queue" | "decisions" | "feedback" | "grades" | "kit";

const PAGES: readonly View[] = [
  {
    id: "queue",
    label: "Queue",
    hint: "Held posts waiting for you",
    to: ADMIN_PATH,
  },
  {
    id: "decisions",
    label: "Decisions",
    hint: "Everything moderation decided, and how often it held",
    to: ADMIN_DECISIONS_PATH,
  },
  {
    id: "feedback",
    label: "Feedback",
    hint: "Bugs, ideas and pinned notes people sent",
    to: ADMIN_FEEDBACK_PATH,
  },
  {
    id: "grades",
    label: "Grade data",
    hint: "Semesters to ask the university for",
    to: ADMIN_GRADES_PATH,
  },
  {
    id: "kit",
    label: "Kit",
    hint: "Every piece of the page kit, in every state",
    to: ADMIN_KIT_PATH,
  },
];

/** Moving between admin's pages: the page header's view switch. */
export function AdminNav({ current }: { current: AdminPage }) {
  return <ViewSwitch label="Admin" views={PAGES} current={current} />;
}

/** A row flush with the page's column, as on Reviews' pages. */
export const PAGE_ROW = "px-0";

/** A list you scan across columns: the app width, for every admin page. */
export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <SitePage layout="app">{children}</SitePage>
    </AdminGate>
  );
}
