import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { initAnalytics } from "~/app/analytics";
import { IsoDateSchema } from "~/core/schema";
import { useReadDayNotifications } from "~/features/notifications/read-here";
import { TodoPage } from "~/features/todo";

// Terpsicle Todo (docs/V3.md §1.1, §3.9): `?view=course` groups by course and
// `?view=week` is the desktop week; `?day=YYYY-MM-DD` scrolls to a day (the
// due-tomorrow push opens it). The view switch links to these. Signed in
// only, so it renders in the browser.
const searchSchema = z.object({
  view: z.enum(["course", "week"]).optional().catch(undefined),
  day: IsoDateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/todo/")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Todo · Terpsicle" },
      {
        name: "description",
        content: "Your deadlines and exams from ELMS, in one list.",
      },
    ],
  }),
  component: TodoRoute,
});

function TodoRoute() {
  const { view, day } = Route.useSearch();

  useEffect(() => {
    void initAnalytics();
  }, []);
  // The day the "Due tomorrow" push opens reads it (V2.md §6.7).
  useReadDayNotifications(day);

  return <TodoPage view={view ?? "day"} day={day} />;
}
