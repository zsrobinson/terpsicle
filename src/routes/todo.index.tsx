import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { initAnalytics } from "~/app/analytics";
import { IsoDateSchema } from "~/core/schema";
import { useReadDayNotifications } from "~/features/notifications/read-here";
import { TodoPage } from "~/features/todo";

// Terpsicle Todo (docs/V3.md §1.1, §3.9): a calendar of what's due. `?view`
// is the week (the default), `month` or `list`; `?date` is a day in the week
// or month shown (today's when it's missing), which Back, Ahead and Today
// change; `?day=YYYY-MM-DD` opens that day's week (the due-tomorrow push
// links there). Signed in only, so it renders in the browser.
const searchSchema = z.object({
  view: z.enum(["week", "month", "list"]).optional().catch(undefined),
  date: IsoDateSchema.optional().catch(undefined),
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
        content:
          "Your deadlines from ELMS and your own tasks, on a calendar by week or month.",
      },
    ],
  }),
  component: TodoRoute,
});

function TodoRoute() {
  const { view, date, day } = Route.useSearch();

  useEffect(() => {
    void initAnalytics();
  }, []);
  // The day the "Due tomorrow" push opens reads it (V2.md §6.7).
  useReadDayNotifications(day);

  return <TodoPage view={view ?? "week"} anchor={date ?? day} day={day} />;
}
