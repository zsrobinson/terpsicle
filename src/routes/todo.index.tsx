import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { IsoDateSchema } from "~/core/schema";
import { useReadDayNotifications } from "~/features/notifications/read-here";
import { TodoPage } from "~/features/todo";
import { initAnalytics } from "~/lib/analytics";

// Terpsicle Todo (docs/V3.md §1.1, §3.9): the week of what's due. `?date`
// is a day in the week shown (today's when it's missing), which Back, Ahead
// and Today change; `?day=YYYY-MM-DD` opens that day's week (the
// due-tomorrow push links there). The month and the list are gone: an old
// link's `?view=` is dropped and opens the week. Signed in only, so it
// renders in the browser.
const searchSchema = z.object({
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
        content: "Your deadlines from ELMS and your own tasks, on your week.",
      },
    ],
  }),
  component: TodoRoute,
});

function TodoRoute() {
  const { date, day } = Route.useSearch();

  useEffect(() => {
    void initAnalytics();
  }, []);
  // The day the "Due tomorrow" push opens reads it (V2.md §6.7).
  useReadDayNotifications(day);

  return <TodoPage anchor={date ?? day} day={day} />;
}
